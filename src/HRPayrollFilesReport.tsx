import { useEffect, useState, type ReactNode } from 'react';
import { bulk, bulkFiles } from './lib/bulkReports';
import { Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintMenu } from './PrintMenu';
import { previewStatutory, type FilePreview } from './lib/payrollFilePreview';

// Reports > Maybank, KWSP, PERKESO and ePCB Files: the four files of a payroll period or month for one company, each shown as a table on the page. The filters are in one
// row with Print and Download beside them; Download lists the four files to choose from. The files are made from the SAVED payslips (Save draft in Pay run first).
type Bank = { file: string; csv: string; count: number; total: number; problems: string[] };
type Statutory = { file: string; content: string; data: FilePreview; problems: string[] };
const API = '/api/status?resource=hr';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const field = 'mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const money = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mask = (value: string) => value.length > 4 ? `${'•'.repeat(value.length - 4)}${value.slice(-4)}` : value;
const csvRows = (text: string) => text.split(/\r?\n/).map((line) => { const cells: string[] = []; let cur = '', quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; } else if (c === '"') quoted = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; } cells.push(cur); return cells; });

export type FileKind = 'bank' | 'epf' | 'socso' | 'epcb';
const TITLE: Record<FileKind, string> = { bank: 'Maybank Salary File', epf: 'KWSP File', socso: 'PERKESO / EIS File', epcb: 'ePCB File' };
export function HRPayrollFilesReport({ kind, onError }: { kind: FileKind; onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [company, setCompany] = useState<'KJ' | 'SK'>(bulk.active && bulk.company ? bulk.company : 'KJ');
  const [valueDate, setValueDate] = useState('');
  const [show, setShow] = useState(false);
  const [bank, setBank] = useState<Bank | null>(null);
  const [files, setFiles] = useState<Partial<Record<'epf' | 'socso' | 'epcb', Statutory>>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const year = period ? Number(period.to.slice(0, 4)) : 0, month = period ? Number(period.to.slice(5, 7)) : 0;
  useEffect(() => { if (year) setValueDate(`${year}-${String(month).padStart(2, '0')}-26`); }, [year, month]);
  useEffect(() => {
    if (!period || !valueDate) return;
    let live = true; setLoading(true); setMessage(''); setBank(null); setFiles({});
    const get = async (url: string) => { const data = await (await officeFetch(url)).json(); if (data.error) throw new Error(data.error); return data; };
    const key = `${API}&year=${year}&month=${month}&company=${company}`;
    get(kind === 'bank' ? `${key}&action=payroll_bank&valueDate=${valueDate}` : `${key}&action=payroll_file&kind=${kind}`).then((data) => {
      if (!live) return;
      if (kind === 'bank') setBank({ file: data.file, csv: data.csv, count: data.count, total: data.total, problems: data.problems || [] });
      else setFiles({ [kind]: { file: data.file, content: data.content, data: previewStatutory(kind, data.content), problems: data.problems || [] } });
    }).catch((cause: Error) => { if (live) setMessage(`No ${TITLE[kind]} for ${company} in ${MONTHS[month - 1]} ${year}: ${cause.message || 'no saved payslips yet'}. Press Save draft in Pay run, then come back.`); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [period?.to, company, valueDate, kind]);
  const lines = bank ? csvRows(bank.csv) : [];
  const split = lines.findIndex((cells) => cells[0] === 'Beneficiary Name');
  const head = lines.slice(0, split).filter((cells) => cells[0]), table = lines.slice(split + 1).filter((cells) => cells[0]);
  const has = Boolean(bank || files.epf || files.socso || files.epcb);
  const file = kind === 'bank' ? (bank ? { name: bank.file, text: bank.csv } : null) : (files[kind] ? { name: files[kind]!.file, text: files[kind]!.content } : null);
  if (bulk.active && file) bulkFiles.set(`file-${kind}-${company}`, [{ name: file.name, text: file.text }]);
  const items = file ? [{ label: `${TITLE[kind]} (${file.name})`, onClick: () => downloadBlob([file.text], file.name, 'text/plain') }] : [];
  const section = (title: string, extra: string, body: ReactNode, problems: string[]) => <section key={title} className={`${card} space-y-3`}><h3 className="text-base font-semibold">{title} <span className="text-xs font-normal text-slate-400">· {company} · {MONTHS[month - 1]} {year}{extra}</span></h3>{problems.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Check: {problems.join('; ')}</p>}{body}</section>;
  const statutory = (kind: 'epf' | 'socso' | 'epcb', title: string) => { const item = files[kind]; if (!item) return null; return section(title, ` · ${item.file}`, <>
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{item.data.summary.map(([label, value]) => <div key={label} className="flex gap-3"><dt className="w-56 shrink-0 text-slate-500">{label}</dt><dd className="font-semibold text-slate-800">{value || '—'}</dd></div>)}</dl>
    <div className="overflow-x-auto"><table className="no-stack w-full min-w-[820px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.data.head.map((cell) => <th key={cell} className="py-2 pr-3">{cell}</th>)}</tr></thead>
      <tbody>{item.data.rows.map((cells, index) => <tr key={index} className="border-t border-slate-100">{cells.map((cell, at) => <td key={at} className={`py-2 pr-3 ${item.data.money.includes(at) ? 'text-right tabular-nums' : ''}`}>{item.data.secret.includes(at) && !show ? mask(cell) : cell}</td>)}</tr>)}</tbody></table></div></>, item.problems); };
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">{TITLE[kind]}</h2><p className="text-sm text-slate-500">Made from the saved payslips, for one company. Open the downloaded file in Notepad and compare it with Infotech's before you upload it.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={company} onChange={(event) => setCompany(event.target.value as 'KJ' | 'SK')} className={field}><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select></label>
      {kind === 'bank' && <label className="text-xs font-bold text-slate-600">Maybank value date<input type="date" value={valueDate} onChange={(event) => setValueDate(event.target.value)} className={`${field} font-normal`} /></label>}
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{kind === 'bank' ? (show ? 'Hide account numbers' : 'Show account numbers') : (show ? 'Hide IC and tax numbers' : 'Show IC and tax numbers')}</button>
      <PrintMenu onPrint={() => window.print()} items={items} disabled={!has} onError={onError} />
    </section>
    {loading && <p role="status" className="text-sm text-slate-500">Making the files…</p>}
    {!loading && message && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
    {has && <div className="files-report space-y-5">
      {bank && section('Maybank salary file', ` · ${bank.file} · ${bank.count} staff · RM ${money(bank.total)}`, <>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{head.map((cells) => <div key={cells[0]} className="flex gap-3"><dt className="w-52 shrink-0 text-slate-500">{cells[0].replace(/ :$/, '')}</dt><dd className="font-semibold text-slate-800">{cells[1]}</dd></div>)}</dl>
        <div className="overflow-x-auto"><table className="no-stack w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">{lines[split]?.map((cell) => <th key={cell} className="py-2 pr-3">{cell}</th>)}</tr></thead>
          <tbody>{table.map((cells, index) => <tr key={index} className="border-t border-slate-100">{cells.map((cell, at) => <td key={at} className={`py-2 pr-3 ${at === 5 ? 'text-right font-semibold tabular-nums text-[#0b587b]' : ''}`}>{(at === 2 || at === 4) && !show ? mask(cell) : cell}</td>)}</tr>)}
            <tr className="border-t-2 border-slate-300 font-bold"><td className="py-2 pr-3" colSpan={5}>Total · {bank.count} staff</td><td className="pr-3 text-right tabular-nums text-[#0b587b]">{money(bank.total)}</td><td colSpan={2} /></tr></tbody></table></div></>, bank.problems)}
      {statutory('epf', 'KWSP file')}{statutory('socso', 'PERKESO / EIS file')}{statutory('epcb', 'ePCB file')}
    </div>}
  </div>;
}
