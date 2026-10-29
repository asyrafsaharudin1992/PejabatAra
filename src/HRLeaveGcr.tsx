import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, Save } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: GCR (Gantian Cuti Rehat). The rules (share of eligible leave used, most days paid, carry-forward limits) are edited
// here and kept in the system; each qualifying staff member's choice (be paid some days, or carry everything forward) is recorded
// per row. Year End then carries forward what is left after the days paid.
type Settings = { minUsedPercent: number; maxDays: number; carry: { admin: number; clinical: number; parttime: number } };
type Gcr = { eligible: number; credit: number; taken: number; burn: number; eligibleUsed: number; eligibleUnused: number; percentUsed: number; qualifies: boolean; maxPay: number; paid: number; carry: number; overLimit: number; limit: number; overdrawn: number; bfExpired: number };
type Row = { id: string; company: string; code: string; name: string; track: string; balance: number | null; chosen: number; gcr: Gcr | null };
const TRACK: Record<string, string> = { admin: 'Admin', clinical: 'Operation', parttime: 'Part-time' };
const n2 = (value: number) => value.toFixed(2);
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export function HRLeaveGcr({ onError }: { onError: (message: string) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [company, setCompany] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ settings: Settings; rows: Row[] } | null>(null);
  const [form, setForm] = useState({ minUsedPercent: '50', maxDays: '4', carryAdmin: '25', carryClinical: '20', carryParttime: '20' });
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const load = () => {
    setData(null); setLoadError('');
    call(`action=leave_gcr&year=${year}${company ? `&company=${company}` : ''}`).then((result) => {
      setData(result);
      const s: Settings = result.settings;
      setForm({ minUsedPercent: String(s.minUsedPercent), maxDays: String(s.maxDays), carryAdmin: String(s.carry.admin), carryClinical: String(s.carry.clinical), carryParttime: String(s.carry.parttime) });
    }).catch((cause: Error) => { setData({ settings: { minUsedPercent: 50, maxDays: 4, carry: { admin: 25, clinical: 20, parttime: 20 } }, rows: [] }); setLoadError(cause.message); onError(cause.message); });
  };
  useEffect(load, [year, company]);
  const shown = useMemo(() => (data?.rows || []).filter((row) => row.gcr && (!query.trim() || `${row.code} ${row.name}`.toLowerCase().includes(query.trim().toLowerCase()))), [data, query]);

  const saveSettings = async () => {
    try {
      await call('action=leave_gcr_settings_save', { minUsedPercent: Number(form.minUsedPercent), maxDays: Number(form.maxDays), carryAdmin: Number(form.carryAdmin), carryClinical: Number(form.carryClinical), carryParttime: Number(form.carryParttime) });
      setNotice('GCR rules saved. The report and Year End now use them.'); load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the rules.'); }
  };
  const choose = async (row: Row, days: number) => {
    try { await call('action=leave_gcr_choice', { employeeId: row.id, year, days }); setNotice(''); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the choice.'); }
  };
  const totals = shown.reduce((sum, row) => ({ burn: sum.burn + (row.gcr?.burn || 0), paid: sum.paid + (row.gcr?.paid || 0), carry: sum.carry + (row.gcr?.carry || 0) }), { burn: 0, paid: 0, carry: 0 });

  const download = async () => {
    try {
      const { default: writeExcelFile } = await import('write-excel-file/browser');
      const head = { fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#0B3D59', wrap: true, align: 'center' as const };
      const cell = (value: string | number) => ({ value, wrap: true });
      const num = (value: number) => ({ value, format: '0.00', align: 'right' as const });
      const titles = ['Employee Code', 'Name', 'Company', 'Category', 'Credit', 'Eligible', 'Used (eligible)', '% used', 'Burn (credit)', 'Eligible unused', 'Eligible for GCR', 'Can be paid (days)', 'Staff chose (days paid)', 'Carried forward', 'Over limit (lost)'];
      const rows = shown.map((row) => [cell(row.code), cell(row.name), cell(row.company), cell(TRACK[row.track] || row.track), num(row.gcr!.credit), num(row.gcr!.eligible), num(row.gcr!.eligibleUsed), num(row.gcr!.percentUsed), num(row.gcr!.burn), num(row.gcr!.eligibleUnused), cell(row.gcr!.qualifies ? 'Yes' : 'No'), num(row.gcr!.maxPay), num(row.gcr!.paid), num(row.gcr!.carry), num(row.gcr!.overLimit)]);
      await writeExcelFile([{ data: [titles.map((value) => ({ ...head, value })), ...rows], sheet: `GCR ${year}`, columns: [{ width: 14 }, { width: 34 }, { width: 9 }, { width: 11 }, ...Array.from({ length: 11 }, () => ({ width: 12 }))], stickyRowsCount: 1 }], { fontFamily: 'Arial', fontSize: 10 }).toFile(`GCR ${year}${company ? ` ${company}` : ''}.xlsx`);
    } catch { onError('Unable to create the Excel file.'); }
  };

  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  const th = 'whitespace-nowrap px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500';
  const td = 'whitespace-nowrap border-t border-slate-100 px-2 py-2 text-right tabular-nums';
  const s = data?.settings;
  return <div className="space-y-5">
    <section className={`${card} space-y-4 print:hidden`}>
      <div><h2 className="text-lg font-semibold">GCR rules</h2><p className="text-sm text-slate-500">Gantian Cuti Rehat, as in the HR memo. Change a number and press Save; the report below and Year End follow it straight away.</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-slate-600">Eligible leave to be used (%)<input type="number" min="0" max="100" value={form.minUsedPercent} onChange={(event) => setForm({ ...form, minUsedPercent: event.target.value })} className={`${field} mt-1 block w-40`} /></label>
        <label className="text-xs font-bold text-slate-600">Most days that can be paid<input type="number" min="0" max="60" step="0.5" value={form.maxDays} onChange={(event) => setForm({ ...form, maxDays: event.target.value })} className={`${field} mt-1 block w-40`} /></label>
        <label className="text-xs font-bold text-slate-600">Carry limit: Admin (days)<input type="number" min="0" max="366" value={form.carryAdmin} onChange={(event) => setForm({ ...form, carryAdmin: event.target.value })} className={`${field} mt-1 block w-36`} /></label>
        <label className="text-xs font-bold text-slate-600">Carry limit: Operation (days)<input type="number" min="0" max="366" value={form.carryClinical} onChange={(event) => setForm({ ...form, carryClinical: event.target.value })} className={`${field} mt-1 block w-36`} /></label>
        <label className="text-xs font-bold text-slate-600">Carry limit: Part-time (days)<input type="number" min="0" max="366" value={form.carryParttime} onChange={(event) => setForm({ ...form, carryParttime: event.target.value })} className={`${field} mt-1 block w-36`} /></label>
        <button onClick={() => void saveSettings()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white hover:bg-[#0a4c6a]"><Save className="h-4 w-4" />Save rules</button>
      </div>
      <p className="text-xs leading-5 text-slate-500">Credit leave (public holiday replacement, training and so on) is used first and burns on 31 December if unused; it is never paid or carried. Staff who used at least {s?.minUsedPercent ?? 50}% of their eligible days may choose to be paid for up to {s?.maxDays ?? 4} of the days left. What is left after that carries forward, up to the limit.</p>
    </section>
    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 print:hidden">{notice}</p>}
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">GCR report</h2><p className="text-sm text-slate-500">Who qualifies, how many days can be paid, what burns and what carries forward. Record each person's choice in the last columns.</p></div>
      <label className="text-xs font-bold text-slate-600">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className={`${field} mt-1 block`}>{[0, 1, 2].map((back) => { const value = new Date().getFullYear() - back; return <option key={value} value={value}>{value}</option>; })}</select></label>
      <label className="text-xs font-bold text-slate-600">Company<select value={company} onChange={(event) => setCompany(event.target.value)} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or code" className={`${field} mt-1 block w-44`} /></label>
      <button onClick={() => void download()} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50"><Download className="h-4 w-4" />Excel</button>
      <button onClick={() => window.print()} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer className="h-4 w-4" />Print / PDF</button>
    </section>
    <section className={`${card} leave-report consolidate-print overflow-x-auto print:overflow-visible print:rounded-none print:p-0 print:shadow-none`}>
      <header className="mb-4 flex items-center gap-4"><img src="/forms/ara-logo.jpg" alt="Klinik ARA 24 Jam" className="h-14 w-14 shrink-0 object-contain" /><div><p className="text-base font-bold text-[#1f3a6b]">{company === 'KJ' ? 'KJ- HSO HEALTHCARE SDN. BHD.' : company === 'SK' ? 'SK- HSO HEALTHCARE SDN. BHD.' : 'HSO HEALTHCARE SDN. BHD. (KJ and SK)'}</p><p className="text-[11px] font-semibold text-slate-600">Klinik ARA 24 Jam</p><p className="mt-1 text-sm font-bold text-[#1f3a6b]">Gantian Cuti Rehat (GCR) {year}</p><p className="text-[10px] text-slate-500">Date : {new Date().toLocaleDateString('en-GB').replace(/\//g, '-')} · {shown.length} staff · at least {s?.minUsedPercent ?? 50}% of eligible used · up to {s?.maxDays ?? 4} days paid · carry limit Admin {s?.carry.admin ?? 25}, Operation {s?.carry.clinical ?? 20}</p></div></header>
      {!data ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className={`text-sm ${loadError ? 'text-rose-600' : 'text-slate-500'}`}>{loadError ? `The GCR report could not be loaded: ${loadError}` : query.trim() ? 'No staff match your search.' : (data.rows.length ? `${data.rows.length} active staff, but none has a ${year} Annual Leave balance yet. Set up their balances under Staff leave first.` : 'No active staff found for this company.')}</p> :
        <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-xs print:min-w-0 print:text-[9px]">
          <thead><tr className="bg-slate-50"><th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Staff</th>{['Credit', 'Eligible', 'Used', '% used', 'Burn', 'Unused'].map((label) => <th key={label} className={th}>{label}</th>)}<th className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">GCR</th><th className={th}>Can pay</th><th className={th}>Staff chose</th><th className={th}>Carry fwd</th></tr></thead>
          <tbody>{shown.map((row) => { const g = row.gcr!; return <tr key={row.id}>
            <td className="border-t border-slate-100 px-2 py-2"><p className="max-w-[220px] truncate font-semibold text-slate-800">{row.name}</p><p className="text-[10px] text-slate-400">{row.code} · {TRACK[row.track] || row.track}</p></td>
            <td className={td}>{n2(g.credit)}</td><td className={td}>{n2(g.eligible)}</td><td className={td}>{n2(g.eligibleUsed)}</td><td className={td}>{g.percentUsed.toFixed(0)}%</td>
            <td className={`${td} font-bold ${g.burn > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{n2(g.burn)}</td><td className={td}>{n2(g.eligibleUnused)}</td>
            <td className="border-t border-slate-100 px-2 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${g.qualifies ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{g.qualifies ? 'Qualifies' : 'No'}</span></td>
            <td className={td}>{n2(g.maxPay)}</td>
            <td className={`${td}`}>{g.qualifies ? <><select value={String(row.chosen > g.maxPay ? g.maxPay : row.chosen)} onChange={(event) => void choose(row, Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-1 text-xs print:hidden">{Array.from({ length: Math.floor(g.maxPay) + 1 }, (_, index) => index).concat(g.maxPay % 1 ? [g.maxPay] : []).map((value) => <option key={value} value={value}>{value === 0 ? 'Carry all' : `Pay ${value}`}</option>)}</select><span className="hidden print:inline">{n2(g.paid)}</span></> : <span className="text-slate-300">–</span>}</td>
            <td className={`${td} font-bold text-[#0b587b]`}>{n2(g.carry)}{g.overLimit > 0 && <span className="ml-1 text-[10px] font-normal text-rose-500">(−{n2(g.overLimit)} over limit)</span>}</td>
          </tr>; })}</tbody>
          <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={5} className="px-2 py-2 text-right text-slate-500">{shown.length} staff</td><td className={`${td} text-rose-600`}>{n2(totals.burn)}</td><td colSpan={3} /><td className={td}>{n2(totals.paid)}</td><td className={`${td} text-[#0b587b]`}>{n2(totals.carry)}</td></tr></tfoot>
        </table>}
    </section>
  </div>;
}
