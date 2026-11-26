import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Eye, Printer, Syringe } from 'lucide-react';
import { card } from './AssessmentStaff';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { officeFetch } from './lib/officeApi';
import { fluFormPdf } from './lib/fluFormPdf';
import { pdfPageImages } from './lib/pdfPages';
import { HRPdfForms } from './HRPdfForms';

// Office HR > Miscellaneous > Staff communication: the influenza vaccine form. HR opens it, every staff member answers it in Individual Sign In > Announcements,
// and this page shows who agreed, who refused and who has not answered. Health details are private to HR.
type Answer = { choice: 'agree' | 'refuse'; health: string; allergy: boolean; allergyDetail: string; immunDate: string; immunName: string; reason: string; answeredAt: string };
type Person = { id: string; company: string; code: string; name: string; branch: string; designation: string; ic: string; answer: Answer | null };
type Data = { open: boolean; openedAt: string; staff: Person[] };
const API = '/api/status?resource=hr';
const dmy = (date: string) => date ? date.split('-').reverse().join('/') : '';

// Staff communication: a page of forms HR asks staff to answer. Nothing is open at first; each form is a card, and more forms can be added as cards later.
export function HRStaffComms({ onError }: { onError: (message: string) => void }) {
  const [form, setForm] = useState<'' | 'flu'>('');
  if (form === 'flu') return <>
    <button onClick={() => setForm('')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline"><ArrowLeft className="h-4 w-4" />Staff communication</button>
    <HRFluForm onError={onError} />
  </>;
  return <HRPdfForms onError={onError}>
    <button onClick={() => setForm('flu')} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,88,123,0.12)]">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-600"><Syringe className="h-5 w-5" /></span>
      <span className="mt-4 text-base font-semibold">Influenza vaccine</span><span className="mt-1 text-sm text-slate-500">Consent or refusal form for the influenza vaccine, for every staff member.</span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b]">Open<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
    </button>
  </HRPdfForms>;
}

export function HRFluForm({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<'' | 'agree' | 'refuse' | 'waiting'>('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [showIc, setShowIc] = useState(false);
  const [view, setView] = useState<{ person: Person; blob: Blob; pages: string[] } | null>(null);
  const load = (body?: unknown) => officeFetch(`${API}&action=${body ? 'flu_form_open' : 'flu_form_hr'}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => { onError(cause.message); setData((current) => current || { open: false, openedAt: '', staff: [] }); });
  useEffect(() => { void load(); }, []);
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const staff = data.staff.filter((person) => !place || person.company === place);
  const count = (pick: (person: Person) => boolean) => staff.filter(pick).length;
  const shown = staff.filter((person) => !filter || (filter === 'waiting' ? !person.answer : person.answer?.choice === filter));
  const mask = (ic: string) => showIc || ic.length <= 4 ? ic : `${'•'.repeat(ic.length - 4)}${ic.slice(-4)}`;
  const toggle = async (open: boolean) => {
    if (!open && !window.confirm('Close the form? Staff will no longer see it or be able to answer. Answers already given are kept.')) return;
    setBusy(true); await load({ open }); setBusy(false);
  };
  // The form as a PDF (A4, one page for each person), for the answers shown: the signed form for the staff file.
  const pdf = async (people: Person[]) => {
    const answered = people.filter((p): p is Person & { answer: Answer } => Boolean(p.answer));
    if (!answered.length) return;
    setBusy(true);
    try { downloadBlob([await fluFormPdf(answered.map((p) => ({ name: p.name, ic: p.ic, branch: p.branch || p.company, answer: p.answer })))], answered.length === 1 ? `Influenza-${answered[0].code}.pdf` : 'influenza-vaccine-forms.pdf', 'application/pdf'); }
    catch { onError('Unable to make the PDF.'); }
    setBusy(false);
  };
  // View the filled form (the same page as the PDF), with Print and Download.
  const open = async (p: Person) => {
    if (!p.answer) return;
    setBusy(true);
    try { const blob = await fluFormPdf([{ name: p.name, ic: p.ic, branch: p.branch || p.company, answer: p.answer }]); setView({ person: p, blob, pages: await pdfPageImages(blob, 1.5) }); }
    catch { onError('Unable to show the form.'); }
    setBusy(false);
  };
  const closeView = () => { view?.pages.forEach((url) => URL.revokeObjectURL(url)); setView(null); };
  // Printing opens the PDF in the browser's own viewer, which has the print button.
  const printView = () => { if (!view) return; const url = URL.createObjectURL(view.blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  const csv = () => {
    const head = ['Company', 'Code', 'Name', 'IC', 'Branch', 'Answer', 'Answered on', 'Health problems', 'Allergy', 'Allergy detail', 'Vaccine date', 'Vaccine name', 'Reason for refusing'];
    const lines = shown.map((p) => [p.company, p.code, p.name, p.ic, p.branch, p.answer ? (p.answer.choice === 'agree' ? 'Agree' : 'Refuse') : 'Not answered', p.answer ? dmy(p.answer.answeredAt.slice(0, 10)) : '', p.answer?.health || '', p.answer ? (p.answer.allergy ? 'Yes' : 'No') : '', p.answer?.allergyDetail || '', dmy(p.answer?.immunDate || ''), p.answer?.immunName || '', p.answer?.reason || '']);
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')], 'influenza-vaccine-answers.csv', 'text/csv');
  };
  const pill = (key: typeof filter, label: string, value: number, tone: string) => <button key={key} type="button" onClick={() => setFilter(filter === key ? '' : key)} className={`rounded-2xl border p-3 text-left ${filter === key ? 'border-[#0b587b] bg-[#e9f6fb]' : 'border-slate-200 bg-white'}`}><span className={`block text-2xl font-semibold ${tone}`}>{value}</span><span className="text-xs font-semibold text-slate-500">{label}</span></button>;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Influenza vaccine: consent or refusal</h3><p className="text-sm text-slate-500">When the form is open, every staff member sees it at the top of Announcements and chooses to agree (with the vaccine date and name) or refuse (with the reason). Only HR can see the answers and the health details.</p></div>
      <button type="button" disabled={busy} onClick={() => void toggle(!data.open)} className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-white disabled:opacity-50 ${data.open ? 'bg-slate-700' : 'bg-emerald-600'}`}>{data.open ? 'Close the form' : 'Open the form to staff'}</button>
    </div>
    <p className={`rounded-xl p-3 text-sm font-semibold ${data.open ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{data.open ? `The form is open${data.openedAt ? ` since ${dmy(data.openedAt.slice(0, 10))}` : ''}. Staff who have not answered see a red number on Announcements.` : 'The form is closed. Staff cannot see it.'}</p>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Company" value={place} onChange={(event) => setPlace(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All locations</option><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select>
      <button type="button" onClick={() => setShowIc(!showIc)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">{showIc ? 'Hide IC' : 'Show IC'}</button>
      <button type="button" onClick={() => void pdf(shown)} disabled={busy || !shown.some((p) => p.answer)} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-50"><Download className="h-4 w-4" />Forms (PDF)</button>
      <button type="button" onClick={csv} disabled={!shown.length} className=" inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-50"><Download className="h-4 w-4" />Download CSV</button>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {pill('', 'Staff', staff.length, 'text-slate-800')}
      {pill('agree', 'Agree', count((p) => p.answer?.choice === 'agree'), 'text-emerald-600')}
      {pill('refuse', 'Refuse', count((p) => p.answer?.choice === 'refuse'), 'text-rose-600')}
      {pill('waiting', 'Not answered', count((p) => !p.answer), 'text-amber-600')}
    </div>
    <div className="overflow-x-auto"><table className="no-stack w-full min-w-[900px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">IC</th><th className="pr-3">Answer</th><th className="pr-3">Health / allergy</th><th className="pr-3">Vaccine date</th><th className="pr-3">Vaccine name</th><th className="pr-3">Reason for refusing</th><th></th></tr></thead>
      <tbody>{shown.map((p) => <tr key={p.id} className="border-t border-slate-100 align-top">
        <td className="py-2 pr-3"><span className="font-semibold">{p.name}</span><span className="block text-xs text-slate-400">{p.code} · {p.company}</span></td>
        <td className="pr-3 text-xs tabular-nums">{mask(p.ic)}</td>
        <td className="pr-3">{p.answer ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.answer.choice === 'agree' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{p.answer.choice === 'agree' ? 'Agree' : 'Refuse'}</span> : <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Not answered</span>}</td>
        <td className="pr-3 text-xs">{p.answer ? <>{p.answer.health || 'None'}<span className="block text-slate-500">Allergy: {p.answer.allergy ? p.answer.allergyDetail || 'Yes' : 'No'}</span></> : ''}</td>
        <td className="pr-3 text-xs">{dmy(p.answer?.immunDate || '')}</td><td className="pr-3 text-xs">{p.answer?.immunName || ''}</td><td className="pr-3 text-xs">{p.answer?.reason || ''}</td><td className="whitespace-nowrap">{p.answer && <><button type="button" disabled={busy} onClick={() => void open(p)} className="mr-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0b587b]">View</button><button type="button" disabled={busy} onClick={() => void pdf([p])} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0b587b]">PDF</button></>}</td>
      </tr>)}</tbody></table></div>
    {view && <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6" onClick={closeView}>
      <div role="dialog" aria-label="Form" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[860px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">{view.person.name} <span className="text-xs font-normal text-slate-400">· {view.person.answer?.choice === 'agree' ? 'Consent' : 'Refusal'} form</span></h3>
          <button type="button" onClick={printView} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-[#0b587b]"><Printer className="h-4 w-4" />Print</button>
          <button type="button" onClick={() => downloadBlob([view.blob], `Influenza-${view.person.code}.pdf`, 'application/pdf')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Download className="h-4 w-4" />Download PDF</button>
          <button type="button" onClick={closeView} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">Close</button></div>
        <div className="flex-1 overflow-auto bg-slate-100 p-3">{view.pages.map((url, index) => <img key={index} src={url} alt="" className="mx-auto mb-3 w-full max-w-[760px] bg-white shadow" />)}</div>
      </div>
    </div>}
  </section>;
}
