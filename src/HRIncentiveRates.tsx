import { Fragment, useEffect, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { codesOf, groupsOf, IncentiveForm, monthLabel, RateChange, rateOn } from './lib/incentiveCodes';

// Office HR: change the incentive rates of the staff form or the doctor form and say from which month the new rate applies.
// Tick one code or many and give them one new rate. An entry is paid at the rate in force on the date of the procedure, so a
// change never touches entries that are already in a claim.
const API = '/api/status?resource=hr';
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const nextMonth = (today: string) => { const next = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; };

export function HRIncentiveRates({ onError }: { onError: (message: string) => void }) {
  const [changes, setChanges] = useState<RateChange[] | null>(null);
  const [today, setToday] = useState('');
  const [form, setForm] = useState<IncentiveForm>('staff');
  const [picked, setPicked] = useState<string[]>([]);
  const codes = codesOf(form);
  const fixed = codes.filter((item) => !item.ownAmount);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => officeFetch(`${API}&action=incentive_rates`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setChanges(result.changes); setToday(result.today); setFrom((current) => current || nextMonth(result.today)); }).catch((cause: Error) => { setChanges([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      await load();
      return true;
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  };
  const toggle = (codes: string[], on: boolean) => setPicked((current) => on ? [...new Set([...current, ...codes])] : current.filter((code) => !codes.includes(code)));
  // `from` is a month (YYYY-MM): the new rate applies to procedures from the 1st of that month.
  const confirm = async () => {
    const next = Math.round(Number(rate) * 100) / 100;
    if (!picked.length) { onError('Tick the incentives to change.'); return; }
    if (!Number.isFinite(next) || next <= 0) { onError('Enter the new rate in RM.'); return; }
    if (!/^\d{4}-\d{2}$/.test(from) || from < today.slice(0, 7)) { onError('Choose the month the new rate starts, this month or later.'); return; }
    const first = `${from}-01`;
    const lines = picked.map((code) => `${code} ${name(code)}: RM ${rateOn(code, first, changes || [], form).toFixed(2)} → RM ${next.toFixed(2)}`).join('\n');
    const note = from === today.slice(0, 7) ? 'This is the current month: entries already added keep the old rate, and entries added from now on for dates from the 1st use the new rate.' : `Entries dated before ${monthLabel(from)} keep the old rate.`;
    if (!window.confirm(`New rate for ${monthLabel(from)}:\n\n${lines}\n\n${note}\n\nConfirm?`)) return;
    if (await post({ action: 'incentive_rate_set', form, codes: picked, rate: next, effectiveFrom: first })) { setPicked([]); setRate(''); }
  };
  const remove = async (change: RateChange) => {
    if (!window.confirm(`Cancel the change to RM ${change.rate.toFixed(2)} for ${change.code} from ${monthLabel(change.effectiveFrom.slice(0, 7))}?`)) return;
    await post({ action: 'incentive_rate_delete', id: change.id });
  };

  const list = changes || [];
  const upcoming = list.filter((change) => (change.form || 'staff') === form && change.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  function name(code: string) { return codes.find((item) => item.code === code)?.name || code; }
  if (!changes) return <section className={card}><p className="text-sm text-slate-500">Loading…</p></section>;
  const allPicked = picked.length === fixed.length;
  return <section className={`${card} space-y-4`}>
    <div><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Incentive rates</h3><div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">{([['staff', 'CA form'], ['doctor', 'Doctor form']] as [IncentiveForm, string][]).map(([key, label]) => <button key={key} onClick={() => { setForm(key); setPicked([]); }} className={`rounded-lg px-3 py-1.5 ${form === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div><p className="mt-1 text-sm text-slate-500">Tick one or more incentives, enter the new rate and choose the month it starts: it applies from the 1st of that month. Entries already in a claim keep the rate they were saved with.</p></div>
    {upcoming.length > 0 && <div className="rounded-2xl bg-amber-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><CalendarClock className="h-4 w-4" />Rate changes that have not started yet</p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">{upcoming.map((change) => <li key={change.id} className="flex flex-wrap items-center gap-2"><span><strong>{change.code}</strong> {name(change.code)}: RM {rateOn(change.code, today, list, form).toFixed(2)} → <strong>RM {change.rate.toFixed(2)}</strong> from {monthLabel(change.effectiveFrom.slice(0, 7))}</span><button onClick={() => void remove(change)} disabled={busy} aria-label="Cancel this change" className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></li>)}</ul></div>}
    <div className={`sticky top-2 z-10 flex flex-wrap items-end gap-3 rounded-2xl p-4 ${picked.length ? 'bg-[#f4fafd] shadow-sm ring-1 ring-[#0b587b]/15' : 'bg-slate-50'}`}>
      <p className="min-w-[150px] flex-1 text-sm text-slate-600"><strong>{picked.length}</strong> selected{picked.length === 0 ? ' — tick the incentives below' : ''}</p>
      <label className="block text-xs font-semibold text-slate-600">New rate (RM)<input type="number" inputMode="decimal" min="0.01" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} className={`${field} mt-1 block w-32`} /></label>
      <label className="block text-xs font-semibold text-slate-600">For which month?<input type="month" min={today.slice(0, 7)} value={from} onChange={(event) => setFrom(event.target.value)} className={`${field} mt-1 block`} /></label>
      <button onClick={() => void confirm()} disabled={busy || !picked.length || !rate || !from} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Confirm new rate</button>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
      <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="w-10 py-2 pr-2"><input type="checkbox" checked={allPicked} onChange={(event) => toggle(fixed.map((item) => item.code), event.target.checked)} aria-label="Tick all incentives" className="h-4 w-4" /></th><th className="py-2 pr-4 font-semibold">Code</th><th className="py-2 pr-4 font-semibold">Incentive</th><th className="py-2 text-right font-semibold">Rate today (RM)</th></tr></thead>
      <tbody>{groupsOf(form).map((group) => { const rows = codes.filter((item) => item.group === group); const selectable = rows.filter((item) => !item.ownAmount).map((item) => item.code); return <Fragment key={group}>
        <tr><td className="bg-slate-50 py-1.5 pl-2"><input type="checkbox" checked={selectable.length > 0 && selectable.every((code) => picked.includes(code))} onChange={(event) => toggle(selectable, event.target.checked)} aria-label={`Tick all in ${group}`} className="h-4 w-4" /></td><td colSpan={3} className="bg-slate-50 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{group}</td></tr>
        {rows.map((item) => <tr key={item.code} className="border-b border-slate-50">
          <td className="py-2 pl-2 pr-2">{!item.ownAmount && <input type="checkbox" checked={picked.includes(item.code)} onChange={(event) => toggle([item.code], event.target.checked)} aria-label={`Tick ${item.name}`} className="h-4 w-4" />}</td>
          <td className="py-2 pr-4 font-mono font-bold text-[#0b587b]">{item.code}</td><td className="py-2 pr-4">{item.name}</td>
          <td className="py-2 text-right">{item.ownAmount ? <span className="text-xs text-slate-400">Staff type the amount</span> : rateOn(item.code, today, list, form).toFixed(2)}</td></tr>)}
      </Fragment>; })}</tbody>
    </table></div>
  </section>;
}
