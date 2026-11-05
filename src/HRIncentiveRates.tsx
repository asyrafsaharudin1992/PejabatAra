import { Fragment, useEffect, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { INCENTIVE_CODES, INCENTIVE_GROUPS, monthLabel, RateChange, rateOn } from './lib/incentiveCodes';

// Office HR: change an incentive rate and say from which date it applies. An entry is paid at the rate in force on the
// date of the procedure, so a change never touches entries that are already in a claim.
const API = '/api/status?resource=hr';
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const nextMonth = (today: string) => { const next = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; };

export function HRIncentiveRates({ onError }: { onError: (message: string) => void }) {
  const [changes, setChanges] = useState<RateChange[] | null>(null);
  const [today, setToday] = useState('');
  const [editing, setEditing] = useState('');
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => officeFetch(`${API}&action=incentive_rates`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setChanges(result.changes); setToday(result.today); }).catch((cause: Error) => { setChanges([]); onError(cause.message); });
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
  const start = (code: string) => { setEditing(code); setRate(''); setFrom(nextMonth(today)); };
  // `from` is a month (YYYY-MM): the new rate applies to procedures from the 1st of that month.
  const confirm = async (code: string, name: string) => {
    const next = Math.round(Number(rate) * 100) / 100;
    if (!Number.isFinite(next) || next <= 0) { onError('Enter the new rate in RM.'); return; }
    if (!/^\d{4}-\d{2}$/.test(from) || from < today.slice(0, 7)) { onError('Choose the month the new rate starts, this month or later.'); return; }
    const first = `${from}-01`;
    const now = rateOn(code, first, changes || []);
    const thisMonth = from === today.slice(0, 7) ? '\n\nThis is the current month: entries already added keep the old rate, and entries added from now on for dates from the 1st use the new rate.' : `\n\nEntries dated before ${monthLabel(from)} keep the old rate.`;
    if (!window.confirm(`New rate for ${monthLabel(from)}: ${name} will be paid at RM ${next.toFixed(2)} (now RM ${now.toFixed(2)}).${thisMonth}\n\nConfirm?`)) return;
    if (await post({ action: 'incentive_rate_set', code, rate: next, effectiveFrom: first })) setEditing('');
  };
  const remove = async (change: RateChange) => {
    if (!window.confirm(`Cancel the change to RM ${change.rate.toFixed(2)} for ${change.code} from ${monthLabel(change.effectiveFrom.slice(0, 7))}?`)) return;
    await post({ action: 'incentive_rate_delete', id: change.id });
  };

  const list = changes || [];
  const upcoming = list.filter((change) => change.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const name = (code: string) => INCENTIVE_CODES.find((item) => item.code === code)?.name || code;
  if (!changes) return <section className={card}><p className="text-sm text-slate-500">Loading…</p></section>;
  return <section className={`${card} space-y-4`}>
    <div><h3 className="font-semibold">Incentive rates</h3><p className="mt-1 text-sm text-slate-500">Rates start from the memo (October 2026). To change one, choose the month it starts and confirm; it applies from the 1st of that month. Entries already in a claim keep the rate they were saved with.</p></div>
    {upcoming.length > 0 && <div className="rounded-2xl bg-amber-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><CalendarClock className="h-4 w-4" />Rate changes that have not started yet</p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">{upcoming.map((change) => <li key={change.id} className="flex flex-wrap items-center gap-2"><span><strong>{change.code}</strong> {name(change.code)}: RM {rateOn(change.code, today, list).toFixed(2)} → <strong>RM {change.rate.toFixed(2)}</strong> from {monthLabel(change.effectiveFrom.slice(0, 7))}</span><button onClick={() => void remove(change)} disabled={busy} aria-label="Cancel this change" className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></li>)}</ul></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-4 font-semibold">Code</th><th className="py-2 pr-4 font-semibold">Incentive</th><th className="py-2 pr-4 text-right font-semibold">Rate today (RM)</th><th className="py-2" /></tr></thead>
      <tbody>{INCENTIVE_GROUPS.map((group) => <Fragment key={group}>
        <tr><td colSpan={4} className="bg-slate-50 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{group}</td></tr>
        {INCENTIVE_CODES.filter((item) => item.group === group).map((item) => <Fragment key={item.code}>
          <tr className="border-b border-slate-50"><td className="py-2 pr-4 font-mono font-bold text-[#0b587b]">{item.code}</td><td className="py-2 pr-4">{item.name}</td>
            <td className="py-2 pr-4 text-right">{item.ownAmount ? <span className="text-xs text-slate-400">Staff type the amount</span> : rateOn(item.code, today, list).toFixed(2)}</td>
            <td className="py-2 text-right">{!item.ownAmount && <button onClick={() => editing === item.code ? setEditing('') : start(item.code)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">{editing === item.code ? 'Close' : 'Change rate'}</button>}</td></tr>
          {editing === item.code && <tr><td colSpan={4} className="bg-[#f4fafd] px-4 py-3"><div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs font-semibold text-slate-600">New rate (RM)<input type="number" inputMode="decimal" min="0.01" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} className={`${field} mt-1 block w-32`} /></label>
            <label className="block text-xs font-semibold text-slate-600">For which month?<input type="month" min={today.slice(0, 7)} value={from} onChange={(event) => setFrom(event.target.value)} className={`${field} mt-1 block`} /></label>
            <button onClick={() => void confirm(item.code, item.name)} disabled={busy || !rate || !from} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Confirm new rate</button></div></td></tr>}
        </Fragment>)}
      </Fragment>)}</tbody>
    </table></div>
  </section>;
}
