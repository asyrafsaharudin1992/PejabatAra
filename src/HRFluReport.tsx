import { useEffect, useMemo, useState } from 'react';
import { bulk, bulkBlobs } from './lib/bulkReports';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { PrintMenu } from './PrintMenu';
import { printPdfBlob } from './lib/savePdf';
import { pdfPageImages } from './lib/pdfPages';
import { fluFormPdf } from './lib/fluFormPdf';

// Reports > Influenza Vaccine Card: the staff's answers (agree or refuse) with the filled form of each person who answered, shown on the page. The filters are in one row with Print and
// Download beside them (PDF of the forms, or the answers as CSV). Opening and closing the form to staff stays under Miscellaneous.
type Answer = { choice: 'agree' | 'refuse'; health: string; allergy: boolean; allergyDetail: string; immunDate: string; immunName: string; reason: string; answeredAt: string };
type Person = { id: string; company: string; code: string; name: string; branch: string; ic: string; answer: Answer | null };
const field = 'mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const dmy = (date: string) => date ? date.split('-').reverse().join('/') : '';

export function HRFluReport({ onError }: { onError: (message: string) => void }) {
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [place, setPlace] = useState('');
  const [filter, setFilter] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pages, setPages] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    officeFetch('/api/status?resource=hr&action=flu_form_hr').then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) setStaff(result.staff); }).catch((cause: Error) => { if (live) { setStaff([]); onError(cause.message); } });
    return () => { live = false; };
  }, []);
  const shown = useMemo(() => (staff || []).filter((person) => (!place || person.company === place) && (!filter || (filter === 'waiting' ? !person.answer : person.answer?.choice === filter))), [staff, place, filter]);
  const answered = shown.filter((person): person is Person & { answer: Answer } => Boolean(person.answer));
  const key = answered.map((person) => person.id).join(',');
  useEffect(() => {
    setBlob(null); setPages(null);
    if (!answered.length) return;
    let live = true, urls: string[] = [];
    fluFormPdf(answered.map((person) => ({ name: person.name, ic: person.ic, branch: person.branch || person.company, answer: person.answer }))).then(async (made) => { const images = await pdfPageImages(made, 2.4); urls = images; if (live) { setBlob(made); setPages(images); if (bulk.active) bulkBlobs.set('flu', made); } }).catch(() => { if (live) onError('Unable to make the forms.'); });
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [key]);
  const count = (test: (person: Person) => boolean) => (staff || []).filter((person) => (!place || person.company === place) && test(person)).length;
  const csv = () => {
    const head = ['Company', 'Code', 'Name', 'IC', 'Branch', 'Answer', 'Answered on', 'Health problems', 'Allergy', 'Allergy detail', 'Vaccine date', 'Vaccine name', 'Reason for refusing'];
    const lines = shown.map((person) => [person.company, person.code, person.name, person.ic, person.branch, person.answer ? (person.answer.choice === 'agree' ? 'Agree' : 'Refuse') : 'Not answered', person.answer ? dmy(person.answer.answeredAt.slice(0, 10)) : '', person.answer?.health || '', person.answer ? (person.answer.allergy ? 'Yes' : 'No') : '', person.answer?.allergyDetail || '', dmy(person.answer?.immunDate || ''), person.answer?.immunName || '', person.answer?.reason || '']);
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')], 'influenza-vaccine-answers.csv', 'text/csv');
  };
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Influenza Vaccine Card</h2><p className="text-sm text-slate-500">The filled form of each person who answered, one page each. Download CSV lists everyone's answers, including the staff who have not answered. Agree: {count((person) => person.answer?.choice === 'agree')} · Refuse: {count((person) => person.answer?.choice === 'refuse')} · Not answered: {count((person) => !person.answer)}.</p></div>
      <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={place} onChange={(event) => setPlace(event.target.value)} className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Answer<select aria-label="Answer" value={filter} onChange={(event) => setFilter(event.target.value)} className={field}><option value="">All</option><option value="agree">Agree</option><option value="refuse">Refuse</option><option value="waiting">Not answered</option></select></label>
      <PrintMenu onPrint={() => blob && printPdfBlob(blob)} onPdf={() => blob && downloadBlob([blob], 'influenza-vaccine-forms.pdf', 'application/pdf')} onCsv={csv} disabled={!shown.length} onError={onError} />
    </section>
    {!staff ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className={`${card} text-sm text-slate-500`}>No staff match these options.</p> : <>
      {!answered.length ? <p className={`${card} text-sm text-slate-500`}>No one has answered yet for these options. Choose Download &gt; CSV to list the staff who have not answered.</p> : (pages ? <div className="space-y-4 print:hidden">{pages.map((src, index) => <img key={src} src={src} alt={`Form ${index + 1}`} className="mx-auto w-full max-w-[794px] rounded-lg bg-white shadow" style={{ imageRendering: 'auto' }} />)}</div> : <p className="text-sm text-slate-500">Building the forms…</p>)}
    </>}
  </div>;
}
