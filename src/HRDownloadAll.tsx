import { createElement, useState, type ComponentType, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, Lock, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { pagesToPdfBlob } from './lib/savePdf';
import { bulk, bulkBlobs, bulkFiles } from './lib/bulkReports';
import { card } from './AssessmentStaff';
import { HRReportDialog } from './HRReportDialog';
import { LeaveHistory } from './HRLeaveReport';
import { HRLeaveStatusReport } from './HRLeaveStatusReport';
import { HRAttendanceIndividual } from './HRAttendanceIndividual';
import { HRPayrollSummaryReport } from './HRPayrollSummaryReport';
import { HRPayslipsReport } from './HRPayslipsReport';
import { HRPayrollFilesReport } from './HRPayrollFilesReport';
import { HRIncentiveSummaryReport } from './HRIncentiveSummaryReport';
import { HRIncentiveFilesReport } from './HRIncentiveFilesReport';
import { HRFluReport } from './HRFluReport';

// Reports > Download all. HR types the HR account's password again (checked on the server), chooses a month and a company, and every report is made out of sight for that month, one after the other,
// and put in one ZIP: a PDF for each report (a PDF for each person for the payslips) and the bank and statutory files as they are. A report with nothing for that month is left out and listed.
type Job = { key: string; folder: string; name: string; kind: 'pages' | 'blob' | 'files'; perCompany?: boolean; heavy?: boolean; perPerson?: boolean; make: (onError: (message: string) => void) => ReactElement };
const dialog = (id: string, title: string, group?: 'staff' | 'doctors') => (onError: (message: string) => void) => createElement(HRReportDialog, { id, title, rosterGroup: group, onClose: () => undefined });
const page = (component: ComponentType<{ onError: (message: string) => void }>) => (onError: (message: string) => void) => createElement(component, { onError });
const JOBS: Job[] = [
  { key: 'roster-ca', folder: 'Roster', name: 'Monthly Roster - Clinic Assistants', kind: 'pages', make: dialog('roster', 'Monthly Roster', 'staff') },
  { key: 'roster-doctors', folder: 'Roster', name: 'Monthly Roster - Doctors', kind: 'pages', make: dialog('roster', 'Monthly Roster', 'doctors') },
  { key: 'leave-consolidate', folder: 'Leave', name: 'Leave Consolidate', kind: 'pages', make: dialog('leave-consolidate', 'Leave Consolidate') },
  { key: 'leave-credit', folder: 'Leave', name: 'Credit Annual Leave', kind: 'pages', make: dialog('leave-credit', 'Credit Annual Leave') },
  { key: 'leave-gcr', folder: 'Leave', name: 'GCR', kind: 'pages', make: dialog('leave-gcr', 'GCR') },
  { key: 'leave-history', folder: 'Leave', name: 'Leave History', kind: 'pages', make: page(LeaveHistory) },
  { key: 'leave-status', folder: 'Leave', name: 'Leave Status', kind: 'pages', make: page(HRLeaveStatusReport) },
  { key: 'attendance-monthly', folder: 'Attendance', name: 'Monthly Attendance', kind: 'pages', make: dialog('attendance-monthly', 'Monthly Attendance') },
  { key: 'attendance-late', folder: 'Attendance', name: 'Late Attendance', kind: 'pages', make: dialog('attendance-late', 'Late Attendance') },
  { key: 'ot-claims', folder: 'Attendance', name: 'OT Claim Status', kind: 'pages', make: dialog('ot-claims', 'OT Claim Status') },
  { key: 'credit-hours', folder: 'Attendance', name: 'Credit Hours', kind: 'pages', make: dialog('credit-hours', 'Credit Hours') },
  { key: 'attendance-individual', folder: 'Attendance', name: 'Individual Attendance', kind: 'pages', heavy: true, make: (onError) => createElement(HRAttendanceIndividual, { onError, followUp: false }) },
  { key: 'staff-summary', folder: 'Staff', name: 'Staff Profile Summary', kind: 'pages', make: dialog('staff-summary', 'Staff Profile Summary') },
  { key: 'performance', folder: 'Performance Reviews', name: 'Performance Review Reports', kind: 'pages', make: dialog('performance', 'Performance Review Reports') },
  { key: 'incentives', folder: 'Incentive', name: 'Incentive Claims', kind: 'pages', make: dialog('incentives', 'Incentive Claims') },
  { key: 'incentive-summary', folder: 'Incentive', name: 'Incentive Summary Sheet', kind: 'blob', make: page(HRIncentiveSummaryReport) },
  { key: 'incentive-files', folder: 'Incentive', name: 'Incentive Maybank Files', kind: 'files', make: page(HRIncentiveFilesReport) },
  { key: 'payroll-summary', folder: 'Payroll', name: 'Payroll Summary', kind: 'blob', make: page(HRPayrollSummaryReport) },
  { key: 'payslips', folder: 'Payslips', name: 'Payslip', kind: 'pages', perPerson: true, make: page(HRPayslipsReport) },
  ...(['bank', 'epf', 'socso', 'epcb'] as const).map((kind): Job => ({ key: `file-${kind}`, folder: 'Payroll files', name: { bank: 'Maybank Salary File', epf: 'KWSP File', socso: 'PERKESO and EIS File', epcb: 'ePCB File' }[kind], kind: 'files', perCompany: true, make: (onError) => createElement(HRPayrollFilesReport, { kind, onError }) })),
  { key: 'flu', folder: 'Staff Communication', name: 'Influenza Vaccine Forms', kind: 'blob', make: page(HRFluReport) },
];
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const safe = (value: string) => value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

// Draws one report out of sight and waits until it is built (or says there is nothing). Returns what it made.
async function run(job: Job, company: '' | 'KJ' | 'SK'): Promise<{ files: { path: string; data: Blob | string }[]; skipped: string }> {
  bulk.company = company; bulkBlobs.delete(job.key); bulkFiles.delete(job.key);
  for (const key of [...bulkFiles.keys()]) if (key.startsWith(`${job.key}-`)) bulkFiles.delete(key);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1250px;pointer-events:none;';
  document.body.appendChild(host);
  const errors: string[] = [];
  const root = createRoot(host);
  root.render(job.make((message) => errors.push(message)));
  try {
    const started = Date.now(); let stable = 0;
    const busy = /Loading|Building|Making|Preparing|Opening/;
    for (;;) {
      await wait(500);
      const text = host.textContent || '';
      const pages = host.querySelectorAll('[data-pdf-page]').length;
      const made = job.kind === 'blob' ? bulkBlobs.has(job.key) : job.kind === 'files' ? [...bulkFiles.keys()].some((key) => key === job.key || key.startsWith(`${job.key}-`)) : pages > 0;
      if (made && !busy.test(text)) { stable += 1; if (stable >= 3) break; } else stable = 0;
      if (!made && !busy.test(text) && Date.now() - started > 6000) {
        const alert = host.querySelector('[role="alert"]')?.textContent || errors[0] || (/\bNo [^.]+\./.exec(text)?.[0] || 'Nothing to show for these options.');
        return { files: [], skipped: alert.trim().slice(0, 160) };
      }
      if (Date.now() - started > 150000) return { files: [], skipped: 'It took too long to build.' };
    }
    const folder = job.folder;
    if (job.kind === 'blob') return { files: [{ path: `${folder}/${job.name}.pdf`, data: bulkBlobs.get(job.key)! }], skipped: '' };
    if (job.kind === 'files') {
      const out: { path: string; data: string }[] = [];
      for (const [key, list] of bulkFiles.entries()) if (key === job.key || key.startsWith(`${job.key}-`)) for (const file of list) out.push({ path: `${folder}/${file.name}`, data: file.text });
      return { files: out, skipped: '' };
    }
    const elements = Array.from(host.querySelectorAll<HTMLElement>('[data-pdf-page]'));
    const landscape = elements[0].offsetWidth > elements[0].offsetHeight * 1.1;
    if (job.perPerson) {
      const out: { path: string; data: Blob }[] = [];
      const used = new Map<string, number>();
      for (const element of elements) {
        const owner = element.closest('[data-pdf-name]') as HTMLElement | null; const base = safe(owner?.dataset.pdfName || job.name);
        const count = (used.get(base) || 0) + 1; used.set(base, count);
        out.push({ path: `${folder}/${base}${count > 1 ? ` (${count})` : ''}.pdf`, data: await pagesToPdfBlob([element], landscape) });
      }
      return { files: out, skipped: '' };
    }
    return { files: [{ path: `${folder}/${job.name}.pdf`, data: await pagesToPdfBlob(elements, landscape) }], skipped: '' };
  } finally { root.unmount(); host.remove(); }
}

export function HRDownloadAll() {
  const [step, setStep] = useState<'closed' | 'password' | 'options' | 'running' | 'done'>('closed');
  const [password, setPassword] = useState('');
  const [month, setMonth] = useState(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7));
  const [company, setCompany] = useState<'' | 'KJ' | 'SK'>('');
  const [heavy, setHeavy] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: '' });
  const [summary, setSummary] = useState<{ made: string[]; skipped: string[]; cost: string } | null>(null);
  const close = () => { setStep('closed'); setPassword(''); setMessage(''); };
  const verify = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await officeFetch('/api/status?resource=hr&action=bulk_verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, month, company }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'The password could not be checked.');
      setPassword(''); setStep('options');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The password could not be checked.'); }
    setBusy(false);
  };
  const start = async () => {
    setStep('running'); setSummary(null); setMessage('');
    const jobs = JOBS.filter((job) => heavy || !job.heavy);
    const plan = jobs.flatMap((job) => job.perCompany && !company ? (['KJ', 'SK'] as const).map((place) => ({ job, place })) : [{ job, place: company }]);
    setProgress({ done: 0, total: plan.length, current: '' });
    bulk.active = true; bulk.month = month;
    const startedAt = performance.now();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip(); const made: string[] = [], skipped: string[] = [];
    try {
      for (let index = 0; index < plan.length; index++) {
        const { job, place } = plan[index];
        const label = `${job.name}${job.perCompany ? ` · ${place}` : ''}`;
        setProgress({ done: index, total: plan.length, current: label });
        try {
          const result = await run(job, place);
          if (result.skipped) skipped.push(`${label}: ${result.skipped}`);
          else { for (const file of result.files) zip.file(file.path, file.data); made.push(`${label} (${result.files.length} ${result.files.length === 1 ? 'file' : 'files'})`); }
        } catch (cause) { skipped.push(`${label}: ${cause instanceof Error ? cause.message : 'failed'}`); }
      }
    } finally { bulk.active = false; bulk.month = ''; bulk.company = ''; bulkBlobs.clear(); bulkFiles.clear(); }
    // What this run cost: the calls to the server and the data they brought (counted by the browser), so it can be checked against the free limits.
    const calls = performance.getEntriesByType('resource').filter((entry) => entry.startTime >= startedAt && entry.name.includes('/api/status')) as PerformanceResourceTiming[];
    const megabytes = calls.reduce((sum, entry) => sum + (entry.encodedBodySize || entry.transferSize || 0), 0) / 1048576;
    const cost = `${calls.length} calls to the server, ${megabytes.toFixed(2)} MB of data`;
    zip.file('_Summary.txt', `AraOffice reports for ${month}${company ? ` · ${company}` : ' · KJ and SK'}\nMade ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}\nCost of this run: ${cost}\n\nMADE\n${made.map((line) => `- ${line}`).join('\n') || '-'}\n\nLEFT OUT (nothing to show, or it failed)\n${skipped.map((line) => `- ${line}`).join('\n') || '-'}\n`);
    setProgress({ done: plan.length, total: plan.length, current: 'Making the ZIP…' });
    downloadBlob([await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })], `AraOffice Reports ${month}${company ? ` ${company}` : ''}.zip`, 'application/zip');
    setSummary({ made, skipped, cost }); setStep('done');
  };
  if (step === 'closed') return <button type="button" onClick={() => setStep('password')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white"><Download className="h-4 w-4" />Download all</button>;
  const field = 'mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  return <section className={`${card} space-y-3 print:hidden`} aria-label="Download all">
    <div className="flex items-center gap-2"><h3 className="mr-auto text-base font-semibold">Download all reports</h3>{step !== 'running' && <button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}</div>
    {step === 'password' && <form onSubmit={(event) => { event.preventDefault(); void verify(); }} className="flex flex-wrap items-end gap-3">
      <p className="basis-full text-sm text-slate-500">This makes every report (including pay, payslips and bank files) and puts them in one ZIP, so the HR password is asked first.</p>
      <label className="text-xs font-bold text-slate-600">HR password<span className="relative mt-1 block"><Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" /></span></label>
      <button type="submit" disabled={busy || !password} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Continue'}</button>
    </form>}
    {step === 'options' && <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-bold text-slate-600">Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={field} /></label>
      <label className="text-xs font-bold text-slate-600">Company<select value={company} onChange={(event) => setCompany(event.target.value as '' | 'KJ' | 'SK')} className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="flex h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={heavy} onChange={(event) => setHeavy(event.target.checked)} />Include Individual Attendance (large)</label>
      <button type="button" disabled={!/^\d{4}-\d{2}$/.test(month)} onClick={() => void start()} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-50">Start</button>
      <p className="basis-full text-xs text-slate-500">All staff are included. Payslips are one PDF for each person. Reports with nothing for the month are left out and listed in the ZIP. Keep this page open until the ZIP downloads (a minute or two).</p>
    </div>}
    {step === 'running' && <div className="space-y-2"><p role="status" className="text-sm font-semibold text-[#0b587b]">{progress.current ? `Making ${progress.current}…` : 'Starting…'} ({progress.done} of {progress.total})</p><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#0b587b] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div></div>}
    {step === 'done' && summary && <div className="space-y-2 text-sm"><p role="status" className="font-semibold text-emerald-700">The ZIP is downloaded: {summary.made.length} reports made{summary.skipped.length ? `, ${summary.skipped.length} left out` : ''}. This run used {summary.cost}.</p>{summary.skipped.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500">{summary.skipped.map((line) => <li key={line}>{line}</li>)}</ul>}<button type="button" onClick={close} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Close</button></div>}
    {message && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{message}</p>}
  </section>;
}
