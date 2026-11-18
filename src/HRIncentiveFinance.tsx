import { useEffect, useState } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { amount, monthShort } from './lib/incentiveSummaryPdf';

// Office HR > Incentive > Finance use: for the month, what each person is paid (the Nett Payment of the Incentive summary), with their bank details, and the
// Maybank2U bulk payment file for each company, made from it, so Finance can upload it and pay everyone at once.
type Item = { id: string; code: string; name: string; company: string; nett: number; bankName: string; bankAccount: string; hasId: boolean };
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
const shiftMonth = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
const months = () => { const list: string[] = []; for (let month = thisMonth(); month >= '2026-10'; month = shiftMonth(month, -1)) list.push(month); return list.length ? list : ['2026-10']; };
const mask = (value: string) => value.length > 4 ? `${'•'.repeat(value.length - 4)}${value.slice(-4)}` : value;
const dmy = (value: string) => value.split('-').reverse().join('/');

export function HRIncentiveFinance({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(() => shiftMonth(thisMonth(), -1) < '2026-10' ? '2026-10' : shiftMonth(thisMonth(), -1));
  const [items, setItems] = useState<Item[] | null>(null);
  const [paidOn, setPaidOn] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ company: string; file: string; csv: string; count: number; total: number; problems: string[] } | null>(null);
  useEffect(() => {
    setItems(null); setNotice('');
    officeFetch(`/api/status?resource=hr&action=incentive_finance&month=${month}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setItems(result.items); setPaidOn(result.paidOn); setUnmatched(result.sotmUnmatched || []); })
      .catch((cause: Error) => { setItems([]); onError(cause.message); });
  }, [month]);
  const total = (company?: string) => Math.round((items || []).filter((item) => !company || item.company === company).reduce((sum, item) => sum + item.nett, 0) * 100) / 100;
  const missing = (items || []).filter((item) => !item.bankAccount || !item.hasId);
  // The bulk file is made on the server; on screen the same file is read back as a table, so Finance can check every line before it is downloaded.
  const makeFile = async (company: 'KJ' | 'SK') => {
    const response = await officeFetch(`/api/status?resource=hr&action=incentive_bank&month=${month}&company=${company}&valueDate=${paidOn}`); const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to make the file.');
    return { company, ...result } as { company: string; file: string; csv: string; count: number; total: number; problems: string[] };
  };
  const openPreview = async (company: 'KJ' | 'SK') => { setBusy(true); setNotice(''); try { setPreview(await makeFile(company)); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the preview.'); } finally { setBusy(false); } };
  const maybank = async (company: 'KJ' | 'SK') => {
    setBusy(true); setNotice('');
    try {
      const response = await officeFetch(`/api/status?resource=hr&action=incentive_bank&month=${month}&company=${company}&valueDate=${paidOn}`); const result = await response.json(); if (!response.ok || result.error) throw new Error(result.error || 'Unable to make the file.');
      downloadBlob([result.csv], result.file, 'text/plain');
      setNotice(`${result.file}: ${result.count} staff, RM ${amount(result.total)}.${result.problems.length ? ` Check: ${result.problems.join('; ')}` : ''}`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the file.'); } finally { setBusy(false); }
  };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Finance use</h3><p className="text-sm text-slate-500">What each person is paid for the month (the Nett Payment of the Incentive summary) and the Maybank2U bulk payment file for each company. Paid on the 16th of the next month, with no deductions other than what is typed in the summary.</p></div>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{months().map((value) => <option key={value} value={value}>Allowance {monthShort(value)}</option>)}</select>
      <label className="text-xs font-semibold text-slate-500">Value date<input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800" /></label>
    </div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {unmatched.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">The SOTM poster for {unmatched.join(', ')} could not be matched to a staff record, so no SOTM amount is included. Tick them in Incentive &gt; SOTM first.</p>}
    {items === null ? <p className="text-sm text-slate-500">Loading…</p> : !items.length ? <p className="text-sm text-slate-500">Nobody has an incentive to pay for {monthShort(month)} yet.</p> : <>
      {missing.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Check the profile of: {missing.map((item) => `${item.name} (${!item.bankAccount ? 'no bank account' : 'no IC or passport'})`).join('; ')}. They are left out of the Maybank file until it is fixed.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {(['KJ', 'SK'] as const).map((company) => <button key={company} type="button" disabled={busy || !items.some((item) => item.company === company)} onClick={() => void maybank(company)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" />Maybank file {company}</button>)}
        {(['KJ', 'SK'] as const).map((company) => <button key={`p${company}`} type="button" disabled={busy || !items.some((item) => item.company === company)} onClick={() => void openPreview(company)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0b587b] disabled:opacity-40"><Eye className="h-4 w-4" />Preview {company}</button>)}
        <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide account numbers' : 'Show account numbers'}</button>
        <span className="ml-auto text-sm font-semibold text-slate-600">KJ RM {amount(total('KJ'))} · SK RM {amount(total('SK'))} · Total RM {amount(total())}</span>
      </div>
      <div className="overflow-x-auto"><table className="no-stack w-full min-w-[640px] text-left text-sm">
        <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Company</th><th className="pr-3">Bank</th><th className="pr-3">Account no.</th><th className="text-right">Nett payment (RM)</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 pr-3"><p className="font-semibold text-slate-800">{item.name}</p><p className="text-[10px] text-slate-400">{item.code}</p></td><td className="pr-3">{item.company}</td><td className="pr-3">{item.bankName || '—'}</td><td className="pr-3 tabular-nums">{item.bankAccount ? (show ? item.bankAccount : mask(item.bankAccount)) : <span className="text-amber-700">missing</span>}</td><td className="text-right font-semibold tabular-nums text-[#0b587b]">{amount(item.nett)}</td></tr>)}</tbody>
      </table></div>
    </>}
    {preview && <MaybankPreview preview={preview} title={`Maybank file ${preview.company} · Allowance ${monthShort(month)}`} onClose={() => setPreview(null)} />}
  </section>;
}

// The file as a table: the header lines of the Maybank2U file, then each payment (account number and IC masked unless shown).
export function MaybankPreview({ preview, title, onClose }: { preview: { company: string; file: string; csv: string; count: number; total: number; problems: string[] }; title: string; onClose: () => void }) {
  const [show, setShow] = useState(false);
  const lines = preview.csv.split(/\r?\n/).map((line) => { const cells: string[] = []; let cur = '', quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; } else if (c === '"') quoted = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; } cells.push(cur); return cells; });
  const split = lines.findIndex((cells) => cells[0] === 'Beneficiary Name');
  const head = lines.slice(0, split).filter((cells) => cells[0]), table = lines.slice(split + 1).filter((cells) => cells[0]);
  const hide = (value: string) => show ? value : mask(value);
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6" onClick={onClose}>
    <div role="dialog" aria-label="Maybank file preview" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[1300px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">{title} <span className="ml-2 text-xs font-normal text-slate-400">preview · {preview.count} staff · RM {amount(preview.total)}</span></h3>
        <button type="button" onClick={() => setShow(!show)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide account numbers' : 'Show account numbers'}</button>
        <button type="button" onClick={() => downloadBlob([preview.csv], preview.file, 'text/plain')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Download className="h-4 w-4" />Download file</button>
        <button type="button" onClick={onClose} className="h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">Close</button></div>
      <div className="flex-1 space-y-4 overflow-auto p-3 sm:p-5">
        {preview.problems.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Check: {preview.problems.join('; ')}</p>}
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{head.map((cells) => <div key={cells[0]} className="flex gap-3"><dt className="w-52 shrink-0 text-slate-500">{cells[0].replace(/ :$/, '')}</dt><dd className="font-semibold text-slate-800">{cells[1]}</dd></div>)}</dl>
        <div className="overflow-x-auto"><table className="no-stack w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">{lines[split]?.map((cell) => <th key={cell} className="py-2 pr-3">{cell}</th>)}</tr></thead>
          <tbody>{table.map((cells, index) => <tr key={index} className="border-t border-slate-100">{cells.map((cell, at) => <td key={at} className={`py-2 pr-3 ${at === 5 ? 'text-right font-semibold tabular-nums text-[#0b587b]' : ''}`}>{at === 2 || at === 4 ? hide(cell) : cell}</td>)}</tr>)}
            <tr className="border-t-2 border-slate-300 font-bold"><td className="py-2 pr-3" colSpan={5}>Total · {preview.count} staff</td><td className="pr-3 text-right tabular-nums text-[#0b587b]">{amount(preview.total)}</td><td colSpan={2} /></tr></tbody></table></div>
        <p className="text-xs text-slate-400">This is the exact file that is downloaded. Open it in Notepad and compare it with the Infotech file before you upload it to Maybank.</p>
      </div>
    </div>
  </div>;
}
