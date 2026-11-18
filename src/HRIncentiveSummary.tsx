import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Save } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { pdfPageImages } from './lib/pdfPages';
import { AMOUNT_COLUMNS, amount, branchRows, incentiveSummaryCsv, incentiveSummaryPdf, monthShort, totalsOf, type IncentiveSummaryRow } from './lib/incentiveSummaryPdf';

// Office HR > Incentive > Summary: the monthly Incentive Allowance sheet for each branch, in the layout HR uses. The amounts come from the approved claims
// (staff and doctor forms) and the approved AraCare claims; Bonus, Outstanding payment and Other deduction are typed here and kept for the month.
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
const shiftMonth = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
const months = () => { const list: string[] = []; for (let month = thisMonth(); month >= '2026-10'; month = shiftMonth(month, -1)) list.push(month); return list.length ? list : ['2026-10']; };
type Typed = Record<string, { bonus: string; outstanding: string; deduction: string }>;

export function HRIncentiveSummary({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(() => (new Date().getDate() <= 10 ? shiftMonth(thisMonth(), -1) : thisMonth()) < '2026-10' ? '2026-10' : (new Date().getDate() <= 10 ? shiftMonth(thisMonth(), -1) : thisMonth()));
  const [rows, setRows] = useState<IncentiveSummaryRow[] | null>(null);
  const [typed, setTyped] = useState<Typed>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sotmUnmatched, setSotmUnmatched] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ pages: string[]; blob: Blob } | null>(null);
  const load = () => {
    setRows(null); setNotice(''); setDirty(false);
    officeFetch(`/api/status?resource=hr&action=incentive_summary&month=${month}`).then((response) => response.json()).then((result) => {
      if (result.error) throw new Error(result.error);
      setRows(result.rows); setSotmUnmatched(result.sotmUnmatched || []);
      setTyped(Object.fromEntries((result.rows as IncentiveSummaryRow[]).map((row) => [row.code, { bonus: row.bonus ? String(row.bonus) : '', outstanding: row.outstanding ? String(row.outstanding) : '', deduction: row.deduction ? String(row.deduction) : '' }])));
    }).catch((cause: Error) => { setRows([]); onError(cause.message); });
  };
  useEffect(load, [month]);
  // The sheet as it stands on screen: the typed amounts are added to the amounts from the claims, and the Total and Nett are worked out again.
  const live = useMemo<IncentiveSummaryRow[]>(() => (rows || []).map((row) => {
    const t = typed[row.code] || { bonus: '', outstanding: '', deduction: '' }, n = (value: string) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
    const base = row.total - row.bonus - row.outstanding;
    const total = Math.round((base + n(t.bonus) + n(t.outstanding)) * 100) / 100;
    return { ...row, bonus: n(t.bonus), outstanding: n(t.outstanding), deduction: n(t.deduction), total, nett: Math.round((total - n(t.deduction)) * 100) / 100 };
  }), [rows, typed]);
  const save = async () => {
    setBusy(true); setNotice('');
    try {
      const response = await officeFetch('/api/status?resource=hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'incentive_summary_save', month, extras: typed }) });
      const result = await response.json(); if (!response.ok || result.error) throw new Error(result.error || 'Unable to save.');
      setDirty(false); setNotice('Saved for this month.');
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };
  const openPreview = async () => { setBusy(true); try { const blob = await incentiveSummaryPdf(live, month); setPreview({ blob, pages: await pdfPageImages(blob) }); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the preview.'); } finally { setBusy(false); } };
  const closePreview = () => { preview?.pages.forEach((url) => URL.revokeObjectURL(url)); setPreview(null); };
  const name = `Incentive Allowance ${monthShort(month)}`;
  const input = (code: string, key: 'bonus' | 'outstanding' | 'deduction') => <input type="number" min="0" step="0.01" aria-label={`${key} for ${code}`} value={typed[code]?.[key] || ''} onChange={(event) => { setTyped({ ...typed, [code]: { ...(typed[code] || { bonus: '', outstanding: '', deduction: '' }), [key]: event.target.value } }); setDirty(true); }} className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs" />;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Incentive allowance summary</h3><p className="text-sm text-slate-500">One sheet for each branch, like the monthly form. Amounts come from the approved claims and the approved AraCare claims; type Bonus, Outstanding payment and Other deduction yourself.</p></div>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{months().map((value) => <option key={value} value={value}>{monthShort(value)}</option>)}</select>
      <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />Save typed amounts</button>
      <button type="button" disabled={busy || !rows?.length} onClick={() => void openPreview()} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0b587b] disabled:opacity-40"><Eye className="h-4 w-4" />Preview</button>
      <button type="button" disabled={busy || !rows?.length} onClick={async () => { try { downloadBlob([await incentiveSummaryPdf(live, month)], `${name}.pdf`, 'application/pdf'); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the PDF.'); } }} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />PDF</button>
      <button type="button" disabled={busy || !rows?.length} onClick={() => downloadBlob([incentiveSummaryCsv(live, month)], `${name}.csv`, 'text/csv')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />CSV</button>
    </div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {sotmUnmatched.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">The SOTM poster for {sotmUnmatched.join(', ')} could not be matched to a staff record, so no SOTM amount was added. Save the poster again from Miscellaneous &gt; SOTM, or ask me to check.</p>}
    {dirty && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">You have typed amounts that are not saved yet. The preview and the downloads already include them.</p>}
    {rows === null ? <p className="text-sm text-slate-500">Loading…</p> : !rows.length ? <p className="text-sm text-slate-500">No staff to show for this month.</p> : ['KJ', 'SK'].map((company) => {
      const list = branchRows(live, company); if (!list.length) return null;
      const sums = totalsOf(list);
      return <div key={company} className="space-y-2">
        <h4 className="text-sm font-bold uppercase tracking-wide text-[#0b587b]">{company === 'KJ' ? 'Kajang' : 'Seri Kembangan'} · {list.length} staff · Nett {amount(sums.nett)}</h4>
        <div className="overflow-x-auto"><table className="no-stack w-full min-w-[1500px] text-left text-xs">
          <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th>{AMOUNT_COLUMNS.map((col) => <th key={col.key} className="pr-2 text-right">{col.label}</th>)}</tr></thead>
          <tbody>{list.map((row) => <tr key={row.code} className="border-t border-slate-100"><td className="py-2 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[10px] text-slate-400">{row.code}</p></td>
            {AMOUNT_COLUMNS.map((col) => <td key={col.key} className={`pr-2 text-right tabular-nums ${col.key === 'nett' ? 'font-bold text-[#0b587b]' : ''}`}>{col.key === 'bonus' || col.key === 'outstanding' || col.key === 'deduction' ? input(row.code, col.key) : Number(row[col.key]) ? amount(Number(row[col.key])) : '-'}</td>)}</tr>)}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold"><td className="py-2 pr-3">TOTAL</td>{AMOUNT_COLUMNS.map((col) => <td key={col.key} className="pr-2 text-right tabular-nums">{sums[col.key as string] ? amount(sums[col.key as string]) : '-'}</td>)}</tr></tbody>
        </table></div>
      </div>;
    })}
    {preview && <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6" onClick={closePreview}>
      <div role="dialog" aria-label="Incentive summary preview" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">Incentive allowance · {monthShort(month)} <span className="ml-2 text-xs font-normal text-slate-400">preview</span></h3>
          <button type="button" onClick={() => downloadBlob([preview.blob], `${name}.pdf`, 'application/pdf')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Download className="h-4 w-4" />Download PDF</button>
          <button type="button" onClick={closePreview} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">Close</button></div>
        <div className="flex-1 space-y-4 overflow-auto bg-slate-100 p-3 sm:p-5">{preview.pages.map((src, index) => <img key={src} src={src} alt={`Page ${index + 1}`} className="mx-auto w-full max-w-[1300px] rounded-lg bg-white shadow" />)}</div>
      </div>
    </div>}
  </section>;
}
