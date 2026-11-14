import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, EyeOff, FileText, Printer, Receipt } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { HRTaxGuide } from './HRTaxGuide';
import { Cp8dPrint, EaPrint, cp8dCsv, usePrintDocument, type Employer, type FormRow } from './HRTaxForms';

// Office HR > Tax: the yearly tax figures of every staff member in one place (like the Submissions menu in Infotech Payroll).
// Years before this one are the Borang EA that came over from Infotech; this year is added up from the locked payslips.
type Row = { id: string; code: string; name: string; company: string; status: string; gross: number; fees: number; pcb: number; kwsp: number; socso: number; eis: number; childRelief: number; source: string; partial: boolean };
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const money = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOTALS: { key: 'gross' | 'fees' | 'pcb' | 'kwsp' | 'socso' | 'eis' | 'childRelief'; label: string }[] = [{ key: 'gross', label: 'Gross pay' }, { key: 'fees', label: 'Fees / bonus' }, { key: 'pcb', label: 'PCB (tax paid)' }, { key: 'kwsp', label: 'KWSP' }, { key: 'socso', label: 'PERKESO' }, { key: 'eis', label: 'EIS' }, { key: 'childRelief', label: 'Child relief' }];

export function HRTax({ onError }: { onError: (message: string) => void }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [years, setYears] = useState<number[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [company, setCompany] = useState('');
  const [state, setState] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [doc, setDoc] = useState<{ kind: 'ea' | 'cp8d'; rows: FormRow[]; employer: Employer } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setRows(null);
    officeFetch(`/api/status?resource=hr&action=tax_summary${year ? `&year=${year}` : ''}`).then((response) => response.json()).then((result) => { if (!live) return; if (result.error) throw new Error(result.error); setYears(result.years || []); setRows(result.rows || []); setNotSetUp(Boolean(result.notSetUp)); })
      .catch((cause: Error) => { if (live) { setRows([]); onError(cause.message); } });
    return () => { live = false; };
  }, [year]);
  const allYears = [...new Set([...years, ...Array.from({ length: new Date().getFullYear() - 2023 }, (_, index) => 2024 + index)])].sort((a, b) => b - a);
  usePrintDocument(Boolean(doc), `${doc?.kind === 'cp8d' ? 'CP8D' : 'Borang EA'} ${year}`, () => setDoc(null));
  // Loads the full details for the staff in view (only those with an EA for the year) and prints or downloads them.
  const forms = async (kind: 'ea' | 'cp8d' | 'csv', only?: string) => {
    setBusy(true);
    try {
      const response = await officeFetch(`/api/status?resource=hr&action=tax_forms&year=${year}`);
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Could not load the figures.');
      const ids = new Set(only ? [only] : shown.map((row) => row.id));
      const rows: FormRow[] = (result.rows || []).filter((row: FormRow) => ids.has(row.id));
      if (!rows.length) { onError(`No Borang EA figures for ${year} among these staff.`); return; }
      if (kind === 'csv') cp8dCsv(rows, year); else setDoc({ kind, rows, employer: result.employer });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not load the figures.'); } finally { setBusy(false); }
  };
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (rows || []).filter((row) => (!company || row.company === company) && (!state || (state === 'active' ? row.status === 'Active' : row.status !== 'Active')) && words.every((word) => `${row.name} ${row.code}`.toLowerCase().includes(word))), [rows, company, state, name]);
  const total = (key: (typeof TOTALS)[number]['key']) => shown.reduce((sum, row) => sum + row[key], 0);
  const view = (value: number) => show ? money(value) : '••••';
  const partial = shown.some((row) => row.partial);
  const cell = (value: string | number) => { const raw = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value); return /[",\n']/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; };
  const download = () => downloadBlob([[['Code', 'Name', 'Company', 'Status', ...TOTALS.map((item) => item.label), 'From'], ...shown.map((row) => [row.code, row.name, row.company, row.status, ...TOTALS.map((item) => row[item.key].toFixed(2)), row.source])].map((line) => line.map(cell).join(',')).join('\r\n')], `TaxSummary_${year}${company ? `_${company}` : ''}.csv`, 'text/csv');
  return <div className="space-y-4">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <select value={year || ''} onChange={(event) => setYear(Number(event.target.value))} aria-label="Year" className={field}>{allYears.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <select value={state} onChange={(event) => setState(event.target.value)} aria-label="Staff status" className={field}><option value="">Active and inactive</option><option value="active">Active</option><option value="inactive">Inactive (resigned)</option></select>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Search name or staff code" aria-label="Search staff" className={`${field} min-w-[200px] flex-1`} />
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      {year < new Date().getFullYear() && <>
        <button type="button" onClick={() => void forms('ea')} disabled={!shown.length || !show || busy} title={show ? 'Print the Borang EA of everyone shown' : 'Show the amounts first'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Printer className="h-4 w-4" />Print EA</button>
        <button type="button" onClick={() => void forms('cp8d')} disabled={!shown.length || !show || busy} title={show ? 'Print the CP8D list of everyone shown' : 'Show the amounts first'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><FileText className="h-4 w-4" />CP8D</button>
        <button type="button" onClick={() => void forms('csv')} disabled={!shown.length || !show || busy} title={show ? 'CP8D as a sheet for e-Data Praisi' : 'Show the amounts first'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Download className="h-4 w-4" />CP8D sheet</button>
      </>}
      <button type="button" onClick={download} disabled={!shown.length || !show} title={show ? '' : 'Show the amounts first'} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-3 text-sm font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-40"><Download className="h-4 w-4" />Download CSV</button>
    </section>
    {notSetUp && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Yearly tax figures from Infotech are not set up yet. System Admin needs to run the latest database migration first.</p>}
    <section className={`${card} overflow-x-auto`}>
      <h3 className="flex items-center gap-2 text-lg font-semibold"><Receipt className="h-5 w-5 text-[#0b587b]" />Tax summary {year || ''}</h3>
      <p className="mt-1 text-sm text-slate-500">{partial ? 'This year is added up from the payslips locked so far, so it grows each month.' : 'The Borang EA figures for the year, brought over from Infotech.'} Amounts stay hidden until you show them. HR only.</p>
      {!rows ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="mt-3 text-sm text-slate-500">{rows.length ? 'No staff matches these filters.' : 'No tax figures for this year yet.'}</p> : <table className="mt-3 w-full min-w-[900px] text-left text-sm">
        <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Staff</th>{TOTALS.map((item) => <th key={item.key} className="pr-4 text-right">{item.label}</th>)}<th>From</th><th /></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="border-t border-slate-100 tabular-nums"><td className="py-2 pr-4"><p className="font-semibold text-[#14233b]">{row.name}</p><p className="text-[11px] text-slate-400">{row.code} · {row.company}{row.status !== 'Active' ? ` · ${row.status}` : ''}</p></td>{TOTALS.map((item) => <td key={item.key} className={`pr-4 text-right ${item.key === 'pcb' ? 'font-semibold' : ''}`}>{view(row[item.key])}</td>)}<td className="text-xs text-slate-400">{row.source}</td><td className="text-right">{!row.partial && <button type="button" onClick={() => void forms('ea', row.id)} disabled={!show || busy} title={show ? 'Print this Borang EA' : 'Show the amounts first'} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Printer className="h-3.5 w-3.5" />EA</button>}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-slate-200 font-semibold tabular-nums"><td className="py-2.5 pr-4">Total · {shown.length} staff</td>{TOTALS.map((item) => <td key={item.key} className="pr-4 text-right">{view(total(item.key))}</td>)}<td /><td /></tr></tfoot>
      </table>}
    </section>
    <HRTaxGuide year={year} onError={onError} />
    {doc?.kind === 'ea' && <EaPrint rows={doc.rows} year={year} employer={doc.employer} />}
    {doc?.kind === 'cp8d' && <Cp8dPrint rows={doc.rows} year={year} employer={doc.employer} />}
  </div>;
}
