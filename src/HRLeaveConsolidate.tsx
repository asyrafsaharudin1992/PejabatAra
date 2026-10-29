import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: Leave Consolidate Report (Current Year), the same columns as Infotech. One row per person; the AL
// balance is what HR uses for GCR (Gantian Cuti Rehat). Download as Excel.
type Al = { eligible: number; broughtForward: number; forfeit: number; credit: number; earn: number; total: number; taken: number; balance: number; bfExpiry: string };
type Ml = { eligible: number; earn: number; taken: number; balance: number };
type Row = { id: string; company: string; code: string; name: string; joinDate: string; designation: string; al: Al | null; ml: Ml | null };
const dmy = (date: string) => date ? date.split('-').reverse().join('-') : '';
const n2 = (value: number | undefined) => value === undefined ? '' : value.toFixed(2);

export function HRLeaveConsolidate({ onError }: { onError: (message: string) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [company, setCompany] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    setRows(null);
    officeFetch(`/api/status?resource=hr&action=leave_consolidate&year=${year}${company ? `&company=${company}` : ''}`).then((response) => response.json())
      .then((result) => { if (result.error) throw new Error(result.error); setRows(result.rows); })
      .catch((cause: Error) => { setRows([]); onError(cause.message); });
  }, [year, company]);
  const shown = useMemo(() => (rows || []).filter((row) => !query.trim() || `${row.code} ${row.name}`.toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  const totalBalance = shown.reduce((sum, row) => sum + (row.al?.balance || 0), 0);

  const download = async () => {
    try {
      const { default: writeExcelFile } = await import('write-excel-file/browser');
      const head = { fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#0B3D59', wrap: true, align: 'center' as const };
      const cell = (value: string | number) => ({ value, wrap: true });
      const num = (value: number | undefined) => ({ value: value ?? 0, format: '0.00', align: 'right' as const });
      const titles = ['Employee Code', 'Name', 'Company', 'Leave Calculation Date', 'AL Year', 'AL Elig.', 'AL B.F.', 'AL Forfeit', 'AL Credit', 'AL Earn', 'AL Total', 'AL Taken', 'AL Bal.', 'AL BF Expiry', 'ML Year', 'ML Elig.', 'ML Earn', 'ML Taken', 'ML Bal.'];
      const data = [titles.map((value) => ({ ...head, value })), ...shown.map((row) => [cell(row.code), cell(row.name), cell(row.company), cell(dmy(row.joinDate)), cell(year), num(row.al?.eligible), num(row.al?.broughtForward), num(row.al?.forfeit), num(row.al?.credit), num(row.al?.earn), num(row.al?.total), num(row.al?.taken), num(row.al?.balance), cell(dmy(row.al?.bfExpiry || '')), cell(year), num(row.ml?.eligible), num(row.ml?.earn), num(row.ml?.taken), num(row.ml?.balance)])];
      await writeExcelFile([{ data, sheet: `Consolidate ${year}`, columns: [{ width: 14 }, { width: 34 }, { width: 9 }, { width: 14 }, ...Array.from({ length: 15 }, () => ({ width: 10 })) ], stickyRowsCount: 1 }], { fontFamily: 'Arial', fontSize: 10 }).toFile(`Leave Consolidate ${year}${company ? ` ${company}` : ''}.xlsx`);
    } catch { onError('Unable to create the Excel file.'); }
  };

  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  const th = 'whitespace-nowrap px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500';
  const td = 'whitespace-nowrap px-2 py-2 text-right tabular-nums';
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3`}>
      <div className="min-w-[220px] flex-1"><h2 className="text-lg font-semibold">Leave Consolidate Report (Current Year)</h2><p className="text-sm text-slate-500">Annual and Medical Leave for every active staff member. The AL balance is the figure HR uses for GCR (Gantian Cuti Rehat).</p></div>
      <label className="text-xs font-bold text-slate-600">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className={`${field} mt-1 block`}>{[0, 1, 2].map((back) => { const value = new Date().getFullYear() + 1 - back; return <option key={value} value={value}>{value}</option>; })}</select></label>
      <label className="text-xs font-bold text-slate-600">Company<select value={company} onChange={(event) => setCompany(event.target.value)} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or code" className={`${field} mt-1 block w-44`} /></label>
      <button onClick={() => void download()} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50"><Download className="h-4 w-4" />Excel</button>
      <button onClick={() => window.print()} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer className="h-4 w-4" />Print / PDF</button>
    </section>
    <section className={`${card} leave-report consolidate-print overflow-x-auto print:overflow-visible print:rounded-none print:p-0 print:shadow-none`}>
      <header className="mb-4 hidden items-center gap-4 print:flex"><img src="/forms/ara-logo.jpg" alt="Klinik ARA 24 Jam" className="h-14 w-14 shrink-0 object-contain" /><div><p className="text-base font-bold text-[#1f3a6b]">{company === 'KJ' ? 'KJ- HSO HEALTHCARE SDN. BHD.' : company === 'SK' ? 'SK- HSO HEALTHCARE SDN. BHD.' : 'HSO HEALTHCARE SDN. BHD. (KJ and SK)'}</p><p className="text-[11px] font-semibold text-slate-600">Klinik ARA 24 Jam</p><p className="mt-1 text-sm font-bold text-[#1f3a6b]">Leave Consolidate Report - Current Year ({year})</p><p className="text-[10px] text-slate-500">Date : {new Date().toLocaleDateString('en-GB').replace(/\//g, '-')} · {shown.length} staff</p></div></header>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="text-sm text-slate-500">No staff match.</p> :
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-xs print:min-w-0 print:text-[9px]">
          <thead><tr className="bg-slate-50">
            <th rowSpan={2} className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Staff</th><th rowSpan={2} className={th}>Calc. date</th>
            <th colSpan={9} className="border-l border-slate-200 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-purple-800">Annual Leave</th>
            <th colSpan={4} className="border-l border-slate-200 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-teal-700">Medical Leave</th></tr>
            <tr className="bg-slate-50">{['Elig.', 'B.F.', 'Forfeit', 'Credit', 'Earn', 'Total', 'Taken', 'Bal.', 'BF expiry', 'Elig.', 'Earn', 'Taken', 'Bal.'].map((label, index) => <th key={`${label}-${index}`} className={`${th} ${index === 0 || index === 9 ? 'border-l border-slate-200' : ''}`}>{label}</th>)}</tr></thead>
          <tbody>{shown.map((row) => <tr key={row.id} className="border-t border-slate-100">
            <td className="border-t border-slate-100 px-2 py-2"><p className="max-w-[220px] truncate font-semibold text-slate-800">{row.name}</p><p className="text-[10px] text-slate-400">{row.code}</p></td>
            <td className={`${td} border-t border-slate-100`}>{dmy(row.joinDate)}</td>
            <td className={`${td} border-l border-t border-slate-100`}>{n2(row.al?.eligible)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.al?.broughtForward)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.al?.forfeit)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.al?.credit)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.al?.earn)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.al?.total)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.al?.taken)}</td>
            <td className={`${td} border-t border-slate-100 font-bold ${row.al && row.al.balance < 0 ? 'text-rose-600' : 'text-purple-800'}`}>{row.al ? n2(row.al.balance) : <span className="font-normal text-slate-300">none</span>}</td><td className={`${td} border-t border-slate-100`}>{dmy(row.al?.bfExpiry || '')}</td>
            <td className={`${td} border-l border-t border-slate-100`}>{n2(row.ml?.eligible)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.ml?.earn)}</td><td className={`${td} border-t border-slate-100`}>{n2(row.ml?.taken)}</td><td className={`${td} border-t border-slate-100 font-bold text-teal-700`}>{row.ml ? n2(row.ml.balance) : ''}</td>
          </tr>)}</tbody>
          <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={9} className="px-2 py-2 text-right text-slate-500">{shown.length} staff · AL balance total</td><td className={`${td} text-purple-800`}>{totalBalance.toFixed(2)}</td><td colSpan={5} /></tr></tfoot>
        </table>}
    </section>
  </div>;
}
