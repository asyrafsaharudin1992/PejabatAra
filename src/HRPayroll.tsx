import { useEffect, useMemo, useState } from 'react';
import { SubTabs } from './SubTabs';
import { PayrollCharts } from './PayrollCharts';
import { Banknote, Check, Circle, Download, Eye, EyeOff, Lock } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { payrollSummaryPdf } from './lib/payrollSummaryPdf';
import { pdfPageImages } from './lib/pdfPages';
import { PayrollGuide } from './PayrollGuide';
import { HRPayrollCompare } from './HRPayrollCompare';
import { HRPayslips } from './HRPayslips';
import { MaybankPreview } from './HRIncentiveFinance';
import { previewStatutory, type FilePreview } from './lib/payrollFilePreview';
import { calculatePayslip, NO_INPUTS, payPeriod, type PayInputs, type PayStaff, type PayYtd } from './lib/payrollRun';

// Payroll room, built a piece at a time: it replaces Infotech's Info-Pay from the November 2026 pay run.
// Nothing here changes any pay record yet; the list shows what is in place and what is still to come.
type Step = { title: string; text: string; done?: boolean };

const SETUP: Step[] = [
  { title: 'Staff pay details', text: 'Basic salary, bank, KWSP, PERKESO and tax numbers, monthly allowances (Director Fee), employment history.', done: true },
  { title: 'Payroll settings per staff', text: 'KWSP rate, PERKESO category, EIS, SKBBK, tax residency, pay group, OT type, probation, flexi hours, rest day.', done: true },
  { title: 'Allowance types', text: 'Only the types in use. Director Fee counts towards PCB but not KWSP, PERKESO, EIS or HRDF. Care Coordinator counts towards KWSP only; Annual Leave Payment, Advance, Incentives and Tuntutan Ganti Notis count towards nothing. The other Infotech types are not paid to anyone, so they are left out.', done: true },
  { title: 'Year to date, January to October', text: 'Wages, KWSP relief and PCB already paid this year for the 26 current staff, read from the Infotech pay run, so November PCB is worked out correctly.', done: true },
];
const MONTHLY: Step[] = [
  { title: 'Start the month', text: 'Pick the month: staff, pay period (20th to 19th) and raises in the middle of the period are worked out for you.', done: true },
  { title: 'Bring in attendance, leave and claims', text: 'Late, unpaid leave and OT from AraOffice. Until attendance and leave are brought over, HR types OT hours, rest and public holiday days and unpaid days in each month.' },
  { title: 'Work out the pay', text: 'KWSP, PERKESO, EIS, SKBBK and PCB, then net pay. October 2026 matched Infotech for every staff member.', done: true },
  { title: 'Check against Infotech', text: 'November: open the generated files in Notepad beside the Infotech files for the same month, and compare names, numbers and totals before uploading anything.' },
  { title: 'Lock and publish payslips', text: 'Staff see only their own payslip in Individual Sign In. January to October 2026 are already there, as Infotech paid them.', done: true },
  { title: 'Bank file and statutory submissions', text: 'Maybank salary file, KWSP, PERKESO / EIS and ePCB, laid out as Infotech writes them, plus a summary sheet (CSV).', done: true },
];

function List({ title, steps }: { title: string; steps: Step[] }) {
  return <section className={card}>
    <h3 className="font-semibold">{title}</h3>
    <ul className="mt-3 divide-y divide-slate-100">{steps.map((step) => <li key={step.title} className="flex gap-3 py-3">
      {step.done ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
      <div><p className="text-sm font-semibold text-[#14233b]">{step.title}{step.done && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Done</span>}</p><p className="mt-0.5 text-sm text-slate-500">{step.text}</p></div>
    </li>)}</ul>
  </section>;
}

// ---- Monthly pay run -------------------------------------------------------------------------------------------------------
type RunStaff = PayStaff & { attendanceRestPh?: { restDays: number; phDays: number }; attendanceUnpaid?: number; attendanceOt?: { ot10?: number; ot15?: number; ot20?: number; ot30?: number }; id: string; company: string; employeeCode: string; fullName: string; ytd: PayYtd; hasYtd: boolean; earlierLocked: boolean; status?: string; payslip: { status: 'draft' | 'locked'; inputs: PayInputs; result?: Record<string, unknown> } | null };
const API = '/api/status?resource=hr';
const FIELDS: [keyof PayInputs, string][] = [['ot10', 'OT 1.0 h'], ['ot15', 'OT 1.5 h'], ['ot20', 'OT 2.0 h'], ['ot30', 'OT 3.0 h'], ['restDays', 'Rest days'], ['phDays', 'PH days'], ['shiftAllowance', 'Shift'], ['unpaidDays', 'Unpaid days'], ['annualLeaveDeduction', 'Leave deduct'], ['otherAllowance', 'Other add'], ['otherDeduction', 'Other deduct'], ['ot', 'OT RM'], ['restPh', 'Rest/PH RM']];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// A short, clear name for a message: the first name that is not a common title or prefix (NUR AININA AMANI BINTI ... is Ainina).
const PREFIXES = new Set(['NUR', 'NURUL', 'SITI', 'MOHAMAD', 'MUHAMAD', 'MUHAMMAD', 'MOHD', 'NOOR', 'AHMAD']);
const shortName = (full: string) => { const words = full.trim().split(/\s+/); const word = words.find((item) => !PREFIXES.has(item.toUpperCase())) || words[0] || ''; return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); };
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PayRun({ onError }: { onError: (message: string) => void }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(11);
  const [staff, setStaff] = useState<RunStaff[] | null>(null);
  const [asOf, setAsOf] = useState('');
  const [comparison, setComparison] = useState(false);
  const [inputs, setInputs] = useState<Record<string, PayInputs>>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  // Unlock a month run in AraOffice (a mistake found after locking): the reason is asked on the page, not in a pop-up.
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState('');
  const load = async () => {
    setStaff(null); setNote('');
    try {
      const response = await officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setAsOf(data.asOf); setComparison(Boolean(data.comparison));
      setStaff(data.staff);
      setInputs(Object.fromEntries(data.staff.map((member: RunStaff) => [member.id, { ...NO_INPUTS, ...(member.payslip?.inputs || {}) }])));
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load the pay run.'); setStaff([]); }
  };
  useEffect(() => { void load(); }, [month]);
  // A locked month shows what was saved (for October, what Infotech paid), not a fresh calculation.
  const rows = useMemo(() => (staff || []).map((member) => ({ member, out: member.payslip?.status === 'locked' && member.payslip.result ? { ...calculatePayslip(member, NO_INPUTS, member.ytd, year, month), ...member.payslip.result } as ReturnType<typeof calculatePayslip> : calculatePayslip(member, inputs[member.id] || NO_INPUTS, member.ytd, year, month) })), [staff, inputs, month]);
  // A month already in the year-to-date totals (October, from Infotech) is finished and can only be looked at.
  const doneMonth = MONTH_NAMES.findIndex((name) => asOf.toLowerCase().startsWith(name.slice(0, 3).toLowerCase())) + 1;
  const locked = Boolean(staff?.length && (staff.every((member) => member.payslip?.status === 'locked') || (doneMonth > 0 && month <= doneMonth && !comparison)));
  const blocked = Boolean(staff?.some((member) => !member.earlierLocked));
  const total = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  // The OT HR approved in Attendance for this pay period (20th to 19th) goes into the OT hour columns. Only the OT hour columns change.
  const withAttendanceOt = (staff || []).filter((member) => Object.values(member.attendanceOt || {}).some((hours) => Number(hours) > 0));
  const withUnpaid = (staff || []).filter((member) => Number(member.attendanceUnpaid || 0) > 0);
  const fillOt = () => {
    // The OT hour columns and the unpaid days (approved unpaid leave in the pay period) are filled; nothing else changes.
    setInputs((current) => ({ ...current, ...Object.fromEntries((staff || []).map((member) => [member.id, { ...(current[member.id] || NO_INPUTS), ot10: member.attendanceOt?.ot10 || 0, ot15: member.attendanceOt?.ot15 || 0, ot20: member.attendanceOt?.ot20 || 0, ot30: member.attendanceOt?.ot30 || 0, restDays: member.attendanceRestPh?.restDays || 0, phDays: member.attendanceRestPh?.phDays || 0, unpaidDays: member.attendanceUnpaid || 0 }])) }));
    const parts = [withAttendanceOt.length ? `OT for ${withAttendanceOt.length} staff` : '', withUnpaid.length ? `unpaid leave for ${withUnpaid.length} staff (${withUnpaid.map((member) => `${shortName(member.fullName)} ${member.attendanceUnpaid} d`).join(', ')})` : ''].filter(Boolean);
    setNote(parts.length ? `Filled from Attendance and Leave: ${parts.join('; ')}. Check it, then Save draft.` : 'No OT or unpaid leave approved for this pay period.');
  };
  // The same month as a printable report in Infotech's layout (Monthly PayRoll Summary Detailed Report), one page for each company.
  const [preview, setPreview] = useState<{ pages: string[]; blob: Blob } | null>(null);
  const makeSummary = () => payrollSummaryPdf(rows.filter(({ member, out }) => (member.payslip || member.company) && out).map(({ member, out }) => ({ code: member.employeeCode, name: member.fullName, company: member.company, basicSalary: member.basicSalary, inputs: inputs[member.id] || NO_INPUTS, out: out as any })), year, month);
  const summaryPdf = async () => {
    setNote('');
    try { downloadBlob([await makeSummary()], `Payroll Summary ${MONTH_NAMES[month - 1]} ${year}.pdf`, 'application/pdf'); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the PDF.'); }
  };
  // The same report on screen, before the month is locked (or after): what is on the pay run right now.
  const openPreview = async () => {
    setNote('');
    try { const blob = await makeSummary(); setPreview({ blob, pages: await pdfPageImages(blob) }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the preview.'); }
  };
  const closePreview = () => { preview?.pages.forEach((url) => URL.revokeObjectURL(url)); setPreview(null); };
  const unlock = async () => {
    setBusy('unlock'); setNote('');
    try {
      const response = await officeFetch(`${API}&action=payroll_unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, reason: reason.trim() }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to unlock.');
      setUnlocking(false); setReason('');
      await load(); setNote(`${MONTH_NAMES[month - 1]} ${year} is unlocked (${data.unlocked} payslips). Change what is needed, Save draft, then Lock month again.`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to unlock.'); }
    setBusy('');
  };
  const save = async (lock: boolean) => {
    setBusy(lock ? 'lock' : 'save'); setNote('');
    try {
      const response = await officeFetch(`${API}&action=payroll_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, lock, items: (staff || []).map((member) => ({ employeeId: member.id, inputs: inputs[member.id] || NO_INPUTS })) }) });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setNote(lock ? `${MONTH_NAMES[month - 1]} ${year} is locked.` : `Draft saved for ${data.saved} staff.`);
      await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy('');
  };
  // The month's pay run as one sheet (like Infotech's Monthly Payroll Summary) for finance; the same figures as the table.
  const summary = () => {
    const head = ['Code', 'Name', 'Company', 'Basic', 'OT', 'Rest/PH', 'Allowances', 'Gross', 'KWSP employee', 'KWSP employer', 'PERKESO employee', 'PERKESO employer', 'EIS employee', 'EIS employer', 'SKBBK', 'HRDF', 'PCB', 'Total deductions', 'Net'];
    const cell = (value: string | number) => { const raw = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value); return /[",\n']/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; };
    const lines = rows.filter(({ member }) => member.payslip || member.company).map(({ member, out }) => [member.employeeCode, member.fullName, member.company, out.basic, out.ot, out.restPh, out.allowances.reduce((sum, item) => sum + item.amount, 0), out.gross, out.kwspEmployee, out.kwspEmployer, out.socsoEmployee, out.socsoEmployer, out.eisEmployee, out.eisEmployer, out.skbbk, out.hrdf, out.pcb, out.deductions, out.net]);
    downloadBlob([[head, ...lines].map((row) => row.map(cell).join(',')).join('\r\n')], `PayrollSummary_${year}-${String(month).padStart(2, '0')}.csv`, 'text/csv');
  };
  const cell = (value: number) => show ? fmt(value) : '••••';
  const period = payPeriod(year, month);
  const dmy = (value: string) => value.split('-').reverse().join('/');
  return <section className={card}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Monthly pay run</h3><p className="mt-0.5 text-xs text-slate-500">Pay period {dmy(period.from)} to {dmy(period.to)} (OT and unpaid leave are counted for these days). Year-to-date totals in from Infotech up to {asOf || 'October 2026'}; each month needs the one before it locked.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => <option key={m} value={m}>{MONTH_NAMES[m - 1]} {year}</option>)}</select>
        <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      </div>
    </div>
    <details className="mt-3 rounded-xl bg-[#f4fafd] p-3 text-sm text-slate-600">
      <summary className="cursor-pointer font-semibold text-[#0b587b]">How to use this page (short guide)</summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-6">
        <li><b>Before you start</b> (in the other tabs): approve the OT and the leave of the pay period (20th to 19th), and fix any clock that was forgotten in Attendance. Only <b>approved</b> OT and <b>approved</b> unpaid leave come in here.</li>
        <li><b>Choose the month</b> at the top right. The staff, the pay period, joiners, leavers and raises in the middle of the period are worked out for you.</li>
        <li>Press <b>Fill OT and unpaid leave</b>. The OT hours, the rest day and public holiday days, and the unpaid days are filled from Attendance and Leave. A message tells you who got what. Check it. Nothing is saved yet.</li>
        <li><b>Type what is still manual</b> in the columns: shift allowance, other allowance, other deductions, and so on. Leave a column empty if it does not apply.</li>
        <li>Press <b>Show amounts</b> to see the pay. Then press <b>Preview summary</b> to read the whole report on screen (KJ and SK each have a page and a Total). You can do this before the month is locked. <b>Summary (PDF)</b> and <b>Summary (CSV)</b> download it. The tab <b>Calculation guide</b> explains every figure.</li>
        <li>Press <b>Save draft</b> to keep what you filled in. You can change it and save again as many times as you need.</li>
        <li>The bank file (<b>Maybank</b>) and the statutory files (<b>KWSP</b>, <b>PERKESO / EIS</b>, <b>ePCB</b>) are made for one company at a time (KJ or SK) once a draft is saved. Open each file in Notepad and compare it with Infotech before you upload it.</li>
        <li>When everything is right, press <b>Lock month</b>. A locked month <b>cannot be changed</b>, staff can then see their payslips, and its PCB feeds the next month. Lock the months in order.</li>
      </ol>
    </details>
    {staff === null ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : !staff.length ? <p className="mt-4 text-sm text-slate-500">Nothing to show for this month.</p> : <>
      {comparison && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">This month is only for checking: it is worked out again from the year-to-date totals as they stood a month earlier, with what was entered in Infotech, so you can compare each line with the Infotech payslip. Do not lock it.</p>}
      {blocked && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">An earlier month is not locked yet, so the year-to-date totals (and PCB) below are not final.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={Boolean(busy) || locked} onClick={fillOt} title="Fills the OT hour columns from OT approved in Attendance, and the Unpaid days from approved unpaid leave, for this pay period" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50">Fill OT and unpaid leave</button>
        <button type="button" disabled={Boolean(busy) || locked} onClick={() => void save(false)} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" disabled={Boolean(busy) || locked || blocked || comparison} onClick={() => { if (window.confirm(`Lock ${MONTH_NAMES[month - 1]} ${year}? A locked month cannot be changed and feeds the next month's PCB.`)) void save(true); }} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50"><Lock className="h-4 w-4" />{busy === 'lock' ? 'Locking…' : 'Lock month'}</button>
        <button type="button" onClick={summary} disabled={!show} title={show ? '' : 'Press Show amounts first'} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Download className="h-4 w-4" />Summary (CSV)</button>
        <button type="button" onClick={() => void summaryPdf()} disabled={!show} title={show ? '' : 'Press Show amounts first'} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Download className="h-4 w-4" />Summary (PDF)</button>
        <button type="button" onClick={() => void openPreview()} disabled={!show} title={show ? 'See the summary on screen' : 'Press Show amounts first'} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Eye className="h-4 w-4" />Preview summary</button>
        {locked && month > doneMonth && !unlocking && <button type="button" disabled={Boolean(busy)} onClick={() => { setUnlocking(true); setReason(''); }} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Unlock month</button>}
        {locked && <span className="text-sm font-semibold text-emerald-600">This month is locked.</span>}{note && <span className="text-sm text-slate-600">{note}</span>}
      </div>
      {unlocking && <div role="alertdialog" aria-label="Unlock month" className="mt-3 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-semibold text-rose-800">Unlock {MONTH_NAMES[month - 1]} {year}?</p>
        <p className="text-sm text-rose-800">Staff will no longer see these payslips, and the month can be changed and locked again. If the KWSP, PERKESO, ePCB or bank file was already sent, the new figures must be sent again. A later month must be unlocked first. This is written to the audit record.</p>
        <label className="block text-sm font-semibold text-slate-700">Reason (required)<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="For example: wrong OT hours for one staff" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal" /></label>
        <div className="flex gap-2"><button type="button" disabled={Boolean(busy) || reason.trim().length < 5} onClick={() => void unlock()} className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === 'unlock' ? 'Unlocking…' : 'Yes, unlock this month'}</button><button type="button" onClick={() => setUnlocking(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">No, keep it locked</button></div>
      </div>}
      <div className="mt-4 overflow-x-auto"><table className="no-stack w-full min-w-[1900px] text-left text-xs">
        <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Basic</th>{FIELDS.map(([, label]) => <th key={label} className="pr-2">{label}</th>)}<th className="pr-3 text-right">Gross</th><th className="pr-3 text-right">KWSP</th><th className="pr-3 text-right">PERKESO</th><th className="pr-3 text-right">EIS</th><th className="pr-3 text-right">SKBBK</th><th className="pr-3 text-right">PCB</th><th className="pr-3 text-right">Net</th><th className="text-right" title="Paid by the employer, 1% of basic pay. Not taken from the staff member's pay.">HRDF<span className="block text-[9px] font-semibold normal-case tracking-normal text-slate-400">employer</span></th></tr></thead>
        <tbody>{rows.map(({ member, out }) => { const slipLocked = member.payslip?.status === 'locked'; return <tr key={member.id} className="border-t border-slate-100">
          <td className="py-2 pr-3"><p className="font-semibold text-[#14233b]">{member.fullName}</p><p className="text-[10px] text-slate-400">{member.employeeCode}{!member.hasYtd && ' · no year-to-date'}{member.status === 'Inactive' && ' · left, final pay'}{slipLocked && ' · locked'}</p></td>
          <td className="pr-3 text-right">{cell(out.basic)}</td>
          {FIELDS.map(([key]) => <td key={key} className="pr-2"><input type="number" min="0" step="0.01" disabled={slipLocked} value={inputs[member.id]?.[key] || ''} onChange={(event) => setInputs({ ...inputs, [member.id]: { ...(inputs[member.id] || NO_INPUTS), [key]: Number(event.target.value) || 0 } })} className="h-8 w-[74px] rounded-lg border border-slate-200 px-2 text-right disabled:bg-slate-50" /></td>)}
          <td className="pr-3 text-right font-semibold">{cell(out.gross)}</td><td className="pr-3 text-right">{cell(out.kwspEmployee)}</td><td className="pr-3 text-right">{cell(out.socsoEmployee)}</td><td className="pr-3 text-right">{cell(out.eisEmployee)}</td><td className="pr-3 text-right">{cell(out.skbbk)}</td><td className="pr-3 text-right">{cell(out.pcb)}</td><td className="pr-3 text-right font-bold text-[#0b587b]">{cell(out.net)}</td><td className="text-right text-slate-600">{cell(out.hrdf || 0)}</td>
        </tr>; })}</tbody>
        <tfoot><tr className="border-t-2 border-slate-200 font-semibold"><td className="py-2 pr-3">Total · {rows.length} staff</td><td className="pr-3 text-right">{cell(total((r) => r.out.basic))}</td><td colSpan={FIELDS.length} /><td className="pr-3 text-right">{cell(total((r) => r.out.gross))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.kwspEmployee))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.socsoEmployee))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.eisEmployee))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.skbbk))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.pcb))}</td><td className="pr-3 text-right text-[#0b587b]">{cell(total((r) => r.out.net))}</td><td className="text-right text-slate-600">{cell(total((r) => r.out.hrdf || 0))}</td></tr></tfoot>
      </table></div>
      <p className="mt-3 text-xs text-slate-400">OT hours (at the rate HR approved), rest days and public holidays worked, unpaid leave and the like are typed in by HR for now; they will come from attendance and leave when those are brought over. Amounts stay hidden until Show amounts is pressed.</p>
    </>}
    {preview && <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6" onClick={closePreview}>
      <div role="dialog" aria-label="Payroll summary preview" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">Payroll summary · {MONTH_NAMES[month - 1]} {year} <span className="ml-2 text-xs font-normal text-slate-400">preview, {locked ? 'locked month' : 'not locked yet'}</span></h3>
          <button type="button" onClick={() => downloadBlob([preview.blob], `Payroll Summary ${MONTH_NAMES[month - 1]} ${year}.pdf`, 'application/pdf')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Download className="h-4 w-4" />Download PDF</button>
          <button type="button" onClick={closePreview} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">Close</button></div>
        <div className="flex-1 space-y-4 overflow-auto bg-slate-100 p-3 sm:p-5">{preview.pages.map((src, index) => <img key={src} src={src} alt={`Page ${index + 1}`} className="mx-auto w-full max-w-[1300px] rounded-lg bg-white shadow" />)}</div>
      </div>
    </div>}
  </section>;
}

// The KWSP, PERKESO / EIS or ePCB file as a table, with the figures at the top and the IC and tax numbers hidden until shown.
function StatutoryPreview({ item, month, company, onClose }: { item: { title: string; file: string; content: string; data: FilePreview; problems: string[] }; month: string; company: string; onClose: () => void }) {
  const [show, setShow] = useState(false);
  const hide = (value: string) => show || value.length <= 4 ? value : `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6" onClick={onClose}>
    <div role="dialog" aria-label={`${item.title} preview`} onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[1300px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">{item.title} · {company} · {month} <span className="ml-2 text-xs font-normal text-slate-400">preview · {item.file}</span></h3>
        <button type="button" onClick={() => setShow(!show)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide IC and tax numbers' : 'Show IC and tax numbers'}</button>
        <button type="button" onClick={() => downloadBlob([item.content], item.file, 'text/plain')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Download className="h-4 w-4" />Download file</button>
        <button type="button" onClick={onClose} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">Close</button></div>
      <div className="flex-1 space-y-4 overflow-auto p-3 sm:p-5">
        {item.problems.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Check: {item.problems.join('; ')}</p>}
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{item.data.summary.map(([label, value]) => <div key={label} className="flex gap-3"><dt className="w-56 shrink-0 text-slate-500">{label}</dt><dd className="font-semibold text-slate-800">{value || '—'}</dd></div>)}</dl>
        <div className="overflow-x-auto"><table className="no-stack w-full min-w-[820px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.data.head.map((cell) => <th key={cell} className="py-2 pr-3">{cell}</th>)}</tr></thead>
          <tbody>{item.data.rows.map((cells, index) => <tr key={index} className="border-t border-slate-100">{cells.map((cell, at) => <td key={at} className={`py-2 pr-3 ${item.data.money.includes(at) ? 'text-right tabular-nums' : ''}`}>{item.data.secret.includes(at) ? hide(cell) : cell}</td>)}</tr>)}</tbody></table></div>
        <p className="text-xs text-slate-400">This is the file that is downloaded, read back as a table. The file itself is fixed-width text; open it in Notepad and compare it with the Infotech file before you upload it.</p>
      </div>
    </div>
  </div>;
}

// ---- Finance use: the bank file and the statutory files of a month, one company at a time ---------------------------------------------------
type FileKind = 'bank' | 'epf' | 'socso' | 'epcb';
function PayrollFinance({ onError }: { onError: (message: string) => void }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(11);
  const [company, setCompany] = useState<'KJ' | 'SK'>('KJ');
  const [valueDate, setValueDate] = useState(`2026-11-26`);
  const [have, setHave] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ company: string; file: string; csv: string; count: number; total: number; problems: string[] } | null>(null);
  const [statutory, setStatutory] = useState<{ title: string; file: string; content: string; data: FilePreview; problems: string[] } | null>(null);
  useEffect(() => { setValueDate(`${year}-${String(month).padStart(2, '0')}-26`); }, [month]);
  // Which company has saved payslips for the month: the files are made from the saved payslips.
  useEffect(() => {
    let live = true; setHave(null); setNote('');
    officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`).then((response) => response.json()).then((data) => { if (data.error) throw new Error(data.error); if (live) { const out: Record<string, number> = { KJ: 0, SK: 0 }; for (const member of data.staff as RunStaff[]) if (member.payslip) out[member.company] = (out[member.company] || 0) + 1; setHave(out); } })
      .catch((cause: Error) => { if (live) { setHave({ KJ: 0, SK: 0 }); onError(cause.message); } });
    return () => { live = false; };
  }, [month]);
  const ready = (have?.[company] || 0) > 0;
  const urlOf = (kind: FileKind) => kind === 'bank' ? `${API}&action=payroll_bank&year=${year}&month=${month}&company=${company}&valueDate=${valueDate}` : `${API}&action=payroll_file&kind=${kind}&year=${year}&month=${month}&company=${company}`;
  const download = async (kind: FileKind) => {
    setBusy(true); setNote('');
    try {
      const response = await officeFetch(urlOf(kind)); const data = await response.json(); if (data.error) throw new Error(data.error);
      downloadBlob([kind === 'bank' ? data.csv : data.content], data.file, 'text/plain');
      setNote(`${data.file}: ${data.count} staff.${data.problems.length ? ` Check: ${data.problems.join('; ')}` : ''}`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the file.'); } finally { setBusy(false); }
  };
  const openPreview = async () => {
    setBusy(true); setNote('');
    try { const response = await officeFetch(urlOf('bank')); const data = await response.json(); if (data.error) throw new Error(data.error); setPreview({ company, file: data.file, csv: data.csv, count: data.count, total: data.total, problems: data.problems }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the preview.'); } finally { setBusy(false); }
  };
  // The KWSP, PERKESO / EIS or ePCB file, read back as a table on screen (the same file that is downloaded).
  const openStatutory = async (kind: 'epf' | 'socso' | 'epcb', title: string) => {
    setBusy(true); setNote('');
    try { const response = await officeFetch(urlOf(kind)); const data = await response.json(); if (data.error) throw new Error(data.error); setStatutory({ title, file: data.file, content: data.content, data: previewStatutory(kind, data.content), problems: data.problems || [] }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the preview.'); } finally { setBusy(false); }
  };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Finance use</h3><p className="text-sm text-slate-500">The Maybank salary file and the KWSP, PERKESO / EIS and ePCB files of a month, for one company at a time. They are made from the <strong>saved</strong> payslips: save the draft in Pay run first.</p></div>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((value) => <option key={value} value={value}>{MONTH_NAMES[value - 1]} {year}</option>)}</select>
      <select aria-label="Company" value={company} onChange={(event) => setCompany(event.target.value as 'KJ' | 'SK')} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select>
      <label className="text-xs font-semibold text-slate-500">Maybank value date<input type="date" value={valueDate} onChange={(event) => setValueDate(event.target.value)} className="mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800" /></label>
    </div>
    {have && !ready && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No saved payslips for {company} in {MONTH_NAMES[month - 1]} {year} yet. Press Save draft in Pay run, then come back.</p>}
    {/* Four columns: each file has its Download button, and its Preview in the row below, so the previews are on one line. */}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {([['bank', 'Maybank'], ['epf', 'KWSP'], ['socso', 'PERKESO / EIS'], ['epcb', 'ePCB']] as const).map(([kind, label]) => <button key={kind} type="button" disabled={busy || !ready} onClick={() => void download(kind)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" />{label}</button>)}
      {([['bank', 'Maybank'], ['epf', 'KWSP'], ['socso', 'PERKESO / EIS'], ['epcb', 'ePCB']] as const).map(([kind, label]) => <button key={`p${kind}`} type="button" disabled={busy || !ready} onClick={() => void (kind === 'bank' ? openPreview() : openStatutory(kind, label))} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0b587b] disabled:opacity-40"><Eye className="h-4 w-4" />Preview {label}</button>)}
    </div>
    {note && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{note}</p>}
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><strong>Before you upload any file to a portal or to Maybank:</strong> open it in Notepad and compare it with the Infotech file for the same month (names, numbers, amounts and totals). Do not upload the first file without checking it. The KWSP, PERKESO / EIS and ePCB files were checked byte for byte against the October 2026 files from Infotech; the Maybank bank names only for Maybank, RHB and Hong Leong.</p>
    {statutory && <StatutoryPreview item={statutory} month={`${MONTH_NAMES[month - 1]} ${year}`} company={company} onClose={() => setStatutory(null)} />}
    {preview && <MaybankPreview preview={preview} title={`Maybank salary file ${preview.company} · ${MONTH_NAMES[month - 1]} ${year}`} onClose={() => setPreview(null)} />}
  </section>;
}

export function HRPayroll({ onError = () => {} }: { onError?: (message: string) => void }) {
  const [tab, setTab] = useState<'run' | 'compare' | 'payslips' | 'finance' | 'chart' | 'guide'>('run');
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">{window.location.hash.includes('finance') ? 'Office Finance' : 'Office HR'} · Klinik ARA 24 Jam</p>
      <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-tight"><Banknote className="h-8 w-8 text-[#ffb000]" />Payroll</h2>
      <p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Monthly pay, statutory deductions and payslips, replacing Infotech from the November 2026 pay run. January to October 2026 are shown as Infotech paid them.</p>
    </section>
    <SubTabs label="Payroll" active={tab} onSelect={setTab} tabs={[{ id: 'run', label: 'Pay run' }, { id: 'compare', label: 'Compare with last month', short: 'Compare' }, { id: 'payslips', label: 'Payslips' }, { id: 'finance', label: 'Finance use', short: 'Finance' }, { id: 'chart', label: 'Chart' }, { id: 'guide', label: 'Calculation guide', short: 'Guide' }]} />
    {tab === 'chart' ? <PayrollCharts /> : tab === 'guide' ? <PayrollGuide /> : tab === 'finance' ? <PayrollFinance onError={onError} /> : tab === 'compare' ? <HRPayrollCompare onError={onError} /> : tab === 'payslips' ? <HRPayslips onError={onError} /> : <>
      <PayRun onError={onError} />
      <div className="grid gap-5 lg:grid-cols-2">
        <List title="Set up first" steps={SETUP} />
        <List title="Each month" steps={MONTHLY} />
      </div>
    </>}
  </div>;
}
