import { Fragment, useEffect, useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { codesOf, ExtraIncentive, groupsOf, IncentiveForm, RateChange, rateOn, setExtraCodes } from './lib/incentiveCodes';

// Office HR > Incentive > Staff form / Doctor form: the form as staff see it (every code with today's rate), and HR can add another
// incentive to it. A new incentive applies at once. It can be hidden later (never deleted), so claims that already use it keep their name.
// Rates of any code, including the new ones, are still changed under Incentive rates, from the month HR chooses.
const API = '/api/status?resource=hr';
const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
const label = 'block text-xs font-semibold text-slate-500';
const NEW_GROUP = '__new';

export function HRIncentiveForms({ form, onError }: { key?: string; form: IncentiveForm; onError: (message: string) => void }) {
  const [, setTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [changes, setChanges] = useState<RateChange[]>([]);
  const [today, setToday] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [rate, setRate] = useState('');
  const [ownAmount, setOwnAmount] = useState(false);
  const [needsPatient, setNeedsPatient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = () => setTick((value) => value + 1);
  const call = async (query: string, body?: unknown) => {
    const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
    return result;
  };
  useEffect(() => {
    Promise.all([call('action=incentive_codes'), call('action=incentive_rates')]).then(([codes, rates]) => { setExtraCodes(codes.extraCodes); setChanges(rates.changes || []); setToday(rates.today || ''); setLoaded(true); })
      .catch((cause: Error) => { setLoaded(true); onError(cause.message); });
  }, []);
  const groups = groupsOf(form), all = codesOf(form);
  const chosenGroup = group === NEW_GROUP ? newGroup.trim() : group || groups[0] || '';
  const add = async () => {
    setBusy(true); setNotice('');
    try {
      const result = await call('action=incentive_code_save', { form, code, name, group: chosenGroup, rate: Number(rate), ownAmount, needsPatient });
      setExtraCodes(result.extraCodes); setNotice(`${code.toUpperCase()} · ${name} added. Staff see it straight away.`);
      setCode(''); setName(''); setRate(''); setOwnAmount(false); setNeedsPatient(false); setNewGroup(''); refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to add.'); } finally { setBusy(false); }
  };
  const toggle = async (item: ExtraIncentive) => {
    if (!window.confirm(item.inactive ? `Show ${item.code} · ${item.name} on the form again?` : `Hide ${item.code} · ${item.name} from the form? Claims that already use it keep it.`)) return;
    setBusy(true);
    try { const result = await call('action=incentive_code_active', { id: item.id, active: Boolean(item.inactive) }); setExtraCodes(result.extraCodes); refresh(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };
  const extraOf = (item: { code: string }) => all.find((entry) => entry.code === item.code) as ExtraIncentive | undefined;
  if (!loaded) return <section className={card}><p className="text-sm text-slate-500">Loading…</p></section>;

  return <div className="review-compact space-y-3 sm:space-y-5">
    <section className={`${card} space-y-4`}>
      <div><h3 className="text-lg font-semibold">Add an incentive to the {form === 'doctor' ? 'doctor' : 'staff'} form</h3><p className="mt-1 text-sm text-slate-500">The new incentive appears on the form for {form === 'doctor' ? 'doctors' : 'staff'} straight away. To change its rate later, use Incentive rates.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className={label}>Code<input value={code} maxLength={10} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="e.g. J or 011" className={`${field} mt-1`} /></label>
        <label className={`${label} xl:col-span-3`}>Name of the incentive<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="e.g. Vaccination" className={`${field} mt-1`} /></label>
        <label className={label}>Group<select value={group || groups[0] || ''} onChange={(event) => setGroup(event.target.value)} className={`${field} mt-1`}>{groups.map((item) => <option key={item} value={item}>{item}</option>)}<option value={NEW_GROUP}>New group…</option></select></label>
        {group === NEW_GROUP && <label className={label}>New group name<input value={newGroup} maxLength={60} onChange={(event) => setNewGroup(event.target.value)} className={`${field} mt-1`} /></label>}
        <label className={label}>Rate (RM)<input type="number" min="0" step="0.01" value={ownAmount ? '' : rate} disabled={ownAmount} onChange={(event) => setRate(event.target.value)} className={`${field} mt-1 disabled:bg-slate-100`} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ownAmount} onChange={(event) => setOwnAmount(event.target.checked)} />Staff type the amount themselves</label>
        {form === 'staff' && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={needsPatient} onChange={(event) => setNeedsPatient(event.target.checked)} />Needs the patient name and clinic ID</label>}
      </div>
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
      <button type="button" onClick={() => void add()} disabled={busy || !code.trim() || !name.trim() || !chosenGroup || (!ownAmount && !(Number(rate) > 0))} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add incentive</button>
    </section>
    <section className={`${card} overflow-x-auto`}>
      <h3 className="text-lg font-semibold">{form === 'doctor' ? 'Doctor' : 'Staff'} form · sample</h3>
      <p className="mt-1 text-sm text-slate-500">This is the list of incentives on the form, with today's rate. Incentives HR added are marked <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Added</span>.</p>
      <table className="mt-3 w-full min-w-[560px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Code</th><th className="pr-3">Incentive</th><th className="pr-3 text-right">Rate (RM)</th><th /></tr></thead>
        <tbody>{groups.map((groupName) => { const rows = all.filter((item) => item.group === groupName); if (!rows.length) return null; return <Fragment key={groupName}>
          <tr><td colSpan={4} className="bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0b587b]">{groupName}</td></tr>
          {rows.map((item) => { const added = extraOf(item); return <tr key={item.code} className={`border-t border-slate-100 ${item.inactive ? 'opacity-50' : ''}`}>
            <td className="py-2 pr-3 font-mono text-xs font-bold text-[#0b587b]">{item.code}</td>
            <td className="pr-3">{item.name}{item.custom && <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Added</span>}{item.inactive && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Hidden</span>}</td>
            <td className="pr-3 text-right tabular-nums">{item.ownAmount ? <span className="text-xs text-slate-400">staff type it</span> : rateOn(item.code, today, changes, form).toFixed(2)}</td>
            <td className="text-right">{item.custom && added && <button type="button" disabled={busy} onClick={() => void toggle(added)} aria-label={item.inactive ? `Show ${item.code}` : `Hide ${item.code}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">{item.inactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>}</td>
          </tr>; })}
        </Fragment>; })}</tbody>
      </table>
    </section>
  </div>;
}
