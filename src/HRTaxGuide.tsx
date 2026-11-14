import { useState } from 'react';
import { BookOpen, Eye, X } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { Cp8dPreview, EaPreview, type Employer, type FormRow } from './HRTaxForms';

// Office HR > Tax: what each tax form is for, whether Infotech has any data for it, and what AraOffice does about it.
// "Sample" opens the real layout on screen, with the figures of the first staff members that have an EA.
type Entry = { code: string; use: string; when: string; infotech: string; araoffice: string; sample?: 'ea' | 'cp8d' };
const GUIDE: Entry[] = [
  { code: 'EA', use: 'Each staff member\'s pay for the year, given to them so they can file their own income tax (form BE).', when: 'Every year, to staff by the end of February.', infotech: 'Yes, for 2024 and 2025.', araoffice: 'Done: figures brought over, printable for 2024 and 2025.', sample: 'ea' },
  { code: 'CP8D', use: 'The list of all employees and their pay and tax for the year, sent to LHDN through e-Data Praisi. LHDN uses it to pre-fill each person\'s tax return.', when: 'Every year, by the end of February.', infotech: 'Yes, for 2024 and 2025.', araoffice: 'Done: printable list and a sheet for upload, for 2024 and 2025.', sample: 'cp8d' },
  { code: 'CP39 / ePCB', use: 'The monthly PCB (tax taken from salary) paid and reported to LHDN.', when: 'Every month, by the 15th of the next month.', infotech: 'Yes, every month.', araoffice: 'Done: the ePCB file is made in Payroll and matched Infotech for October.' },
  { code: 'CP58', use: 'Payments to people who are not employees, such as agents or locum doctors paid outside payroll.', when: 'Every year, by the end of February.', infotech: 'Not yet verified for 2024–2026.', araoffice: 'Not built.' },
  { code: 'TP1', use: 'A staff member tells the employer which tax reliefs they will claim, so the monthly PCB is lower.', when: 'Any time in the year, optional.', infotech: 'Not yet verified for 2024–2026.', araoffice: 'Not built.' },
  { code: 'TP2', use: 'A staff member claims tax-exempt allowances or benefits (for example petrol and travel).', when: 'Any time in the year, optional.', infotech: 'Not yet verified for 2024–2026.', araoffice: 'Not built.' },
  { code: 'TP3', use: 'A new staff member gives their income and PCB from the previous employer in the same year, so PCB is worked out right.', when: 'When someone joins part-way through a year.', infotech: 'Not yet verified for 2024–2026.', araoffice: 'Not built.' },
  { code: 'CP22', use: 'Telling LHDN about a new employee.', when: 'Within about 30 days of the person starting.', infotech: 'A generator only: it lists staff and makes the form. Nothing is stored.', araoffice: 'Not built. Join dates are already in the staff profile.' },
  { code: 'CP22A', use: 'Telling LHDN that an employee has left or retired.', when: 'Before or around the time the person leaves.', infotech: 'A generator only. Nothing is stored.', araoffice: 'Not built. Leaving dates are already in the staff profile.' },
  { code: 'CP38', use: 'LHDN tells the employer to take extra tax from a staff member\'s salary to settle unpaid tax.', when: 'Only when LHDN sends the notice.', infotech: 'None of our staff have one.', araoffice: 'Not needed now.' },
];

export function HRTaxGuide({ year, onError }: { year: number; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState<{ kind: 'ea' | 'cp8d'; rows: FormRow[]; employer: Employer; year: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const look = async (kind: 'ea' | 'cp8d') => {
    setBusy(true);
    try {
      // Years before this one have the Borang EA figures; the nearest one to the chosen year is used.
      const thisYear = new Date().getFullYear();
      const use = year < thisYear ? year : thisYear - 1;
      const response = await officeFetch(`/api/status?resource=hr&action=tax_forms&year=${use}`);
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Could not load a sample.');
      const rows: FormRow[] = (result.rows || []).filter((row: FormRow) => row.details.length);
      if (!rows.length) { onError(`No Borang EA figures for ${use} yet, so there is nothing to show.`); return; }
      setSample({ kind, rows: kind === 'ea' ? rows.slice(0, 1) : rows.slice(0, 8), employer: result.employer, year: use });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not load a sample.'); } finally { setBusy(false); }
  };
  return <section className={card}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left"><BookOpen className="h-5 w-5 text-[#0b587b]" /><span className="text-lg font-semibold">Tax forms guide</span><span className="ml-auto text-xs font-semibold text-[#0b587b]">{open ? 'Hide' : 'Show'}</span></button>
    {open && <>
      <p className="mt-2 text-sm text-slate-500">What each form is for, whether Infotech has anything for it, and what AraOffice does. Written from general knowledge of Malaysian tax, so check deadlines with your accountant or LHDN.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
        <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Form</th><th className="pr-3">What it is for</th><th className="pr-3">When</th><th className="pr-3">In Infotech</th><th className="pr-3">In AraOffice</th><th /></tr></thead>
        <tbody>{GUIDE.map((item) => <tr key={item.code} className="border-t border-slate-100 align-top"><td className="py-2.5 pr-3 font-semibold text-[#14233b]">{item.code}</td><td className="pr-3 text-slate-600">{item.use}</td><td className="pr-3 text-slate-600">{item.when}</td><td className="pr-3 text-slate-600">{item.infotech}</td><td className="pr-3 text-slate-600">{item.araoffice}</td><td className="text-right">{item.sample && <button type="button" onClick={() => void look(item.sample!)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Eye className="h-3.5 w-3.5" />Sample</button>}</td></tr>)}</tbody></table></div>
    </>}
    {sample && <div role="dialog" aria-modal="true" aria-label="Sample form" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4">
      <div className="w-full max-w-[1100px] rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Sample {sample.kind === 'ea' ? 'Borang EA' : 'CP8D'} {sample.year}, with the real figures of {sample.kind === 'ea' ? sample.rows[0]?.name : `the first ${sample.rows.length} staff`}. Printing is from the buttons above.</p><button type="button" onClick={() => setSample(null)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X className="h-4 w-4" /></button></div>
        {sample.kind === 'ea' ? <EaPreview row={sample.rows[0]} year={sample.year} employer={sample.employer} /> : <Cp8dPreview rows={sample.rows} year={sample.year} employer={sample.employer} />}
      </div>
    </div>}
  </section>;
}
