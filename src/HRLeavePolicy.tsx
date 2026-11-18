import { useEffect, useMemo, useState } from 'react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR, Leave > Company policy: the leave HR gives by staff category and years of service (annual leave, sick leave, hospital leave and the fixed ones).
// HR can edit the figures here (every change is kept in a short history), and below them see what each person has next to the policy and apply it.
// Changing the figures does not change anyone's balance by itself: HR applies the policy to the people chosen.
type Policy = { al: Record<string, number[]>; ml: number[]; hosp: number; marriage: number; haji: number; unpaid: number };
const DEFAULT: Policy = { al: { admin: [15, 20, 25], clinical: [8, 12, 16], parttime: [6, 8, 11] }, ml: [14, 18, 22], hosp: 60, marriage: 1, haji: 14, unpaid: 30 };
const num = (value: number) => String(Math.round(value * 100) / 100);
async function api(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}
// Company leave policy: annual leave by staff category and years of service, sick leave 14/18/22, hospital leave 60. HR sees what each
// person has next to what the policy gives, and applies it to the people chosen.
type PolicyRow = { id: string; company: string; code: string; name: string; designation: string; joinDate: string | null; years: number | null; track: string; trackSet: boolean; al: number | null; ml: number | null; hosp: number | null };
const TRACKS: [string, string][] = [['admin', 'Administrative officer'], ['clinical', 'Doctor / clinic assistant (permanent)'], ['parttime', 'Doctor / clinic assistant (part-time)']];
const tierOf = (years: number) => years >= 5 ? 2 : years >= 2 ? 1 : 0;
const TIER = ['under 2 years', '2 to 5 years', '5 years or more'];
// The same working-out as the server (and as Infotech): annual leave is the average of the tier's figure at each month end of this year,
// rounded; sick leave uses the tier on 31 December.
const wanted = (policy: Policy, track: string, joinDate: string | null) => {
  if (!joinDate) return null;
  const year = new Date().getFullYear(), part = track === 'parttime';
  const yearsAt = (date: string) => (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${joinDate}T00:00:00Z`)) / (365.25 * 86400000);
  let sum = 0; for (let month = 0; month < 12; month++) sum += policy.al[track][tierOf(yearsAt(new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)))];
  return { al: Math.round(sum / 12), ml: part ? null : policy.ml[tierOf(yearsAt(`${year}-12-31`))], hosp: part ? null : policy.hosp };
};

function PolicyReview({ policy, onError }: { policy: Policy; onError: (message: string) => void }) {
  const [rows, setRows] = useState<PolicyRow[] | null>(null);
  const [tracks, setTracks] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [onlyDiffer, setOnlyDiffer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const load = () => api('action=leave_policy').then((result) => { if (result.error) throw new Error(result.error); setRows(result.staff); setTracks({}); setPicked(new Set()); }).catch((cause: Error) => { setRows([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);

  const view = useMemo(() => (rows || []).map((row) => { const track = tracks[row.id] || row.track; const want = wanted(policy, track, row.joinDate); const differ = !!want && (row.al === null || row.al !== want.al || (want.ml !== null && (row.ml === null || row.ml !== want.ml)) || (want.hosp !== null && (row.hosp === null || row.hosp !== want.hosp)) || (tracks[row.id] !== undefined && tracks[row.id] !== row.track) || !row.trackSet); const figures = !!want && (row.al === null || row.al !== want.al || (want.ml !== null && (row.ml === null || row.ml !== want.ml)) || (want.hosp !== null && (row.hosp === null || row.hosp !== want.hosp))); return { row, track, want, differ, figures }; }), [rows, tracks, policy]);
  const shown = view.filter((item) => !onlyDiffer || item.differ);
  const differing = view.filter((item) => item.differ).length, figuresDiffer = view.filter((item) => item.figures).length;
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const apply = async () => {
    const items = view.filter((item) => picked.has(item.row.id)).map((item) => ({ id: item.row.id, track: item.track }));
    if (!items.length) return;
    if (!window.confirm(`Apply the company policy to ${items.length} staff? Their annual, sick and hospital leave entitlement changes to the policy figure and each change is written to their HR history.`)) return;
    setSaving(true); setDone('');
    try { const result = await api('action=leave_policy_apply', { items }); if (result.error) throw new Error(result.error); setDone(`Applied: ${result.changed} entitlement${result.changed === 1 ? '' : 's'} changed${result.skipped ? `, ${result.skipped} skipped (no join date)` : ''}.`); await load(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to apply.'); }
    setSaving(false);
  };
  const cell = (now: number | null, want: number | null | undefined) => now === null ? <span className="text-slate-300">no balance</span> : want === null || want === undefined ? <span>{num(now)}</span> : now === want ? <span className="text-slate-500">{num(now)}</span> : <span className="font-semibold text-amber-700">{num(now)} → {num(want)}</span>;

  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyDiffer} onChange={(event) => setOnlyDiffer(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />Only staff who need attention <span className="text-slate-400">(leave differs from the policy, or category not saved yet)</span></label>
      <span className="text-sm text-slate-400">{rows ? `${differing} of ${view.length} need attention · ${figuresDiffer} with different figures, ${differing - figuresDiffer} only need the category confirmed` : 'Loading…'}</span>
      <button onClick={() => setPicked(new Set(shown.map((item) => item.row.id)))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">Select all shown</button>
      <button onClick={() => void apply()} disabled={!picked.size || saving} className="ml-auto h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Applying…' : `Apply to ${picked.size} selected`}</button>
    </section>
    {done && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}
    <section className={`${card} overflow-x-auto`}>
      {rows && !shown.length ? <p className="text-sm text-slate-500">{view.length ? 'Everyone matches the company policy.' : 'No staff found.'}</p> :
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="w-8 py-2" /><th className="py-2 pr-4 font-semibold">Staff</th><th className="py-2 pr-4 font-semibold">Service</th><th className="py-2 pr-4 font-semibold">Category</th><th className="py-2 pr-4 font-semibold">Annual</th><th className="py-2 pr-4 font-semibold">Sick</th><th className="py-2 font-semibold">Hospital</th></tr></thead>
          <tbody>{shown.map(({ row, track, want, differ, figures }) => <tr key={row.id} className="border-b border-slate-50 align-top">
            <td className="py-3"><input type="checkbox" checked={picked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name}`} className="h-4 w-4 rounded border-slate-300" /></td>
            <td className="py-3 pr-4"><p className="font-semibold">{row.name}</p><p className="text-xs text-slate-400">{row.company} · {row.code}{row.designation ? ` · ${row.designation}` : ''}</p>{differ && <p className="mt-1 text-[10px] font-semibold text-amber-700">{figures ? 'Leave figures differ from the policy' : 'Figures match; category not confirmed yet'}</p>}</td>
            <td className="py-3 pr-4 whitespace-nowrap">{row.years === null ? <span className="text-slate-300">no join date</span> : <><strong>{(Math.round(row.years * 10) / 10).toFixed(1)}</strong> yrs<p className="text-xs text-slate-400">{TIER[tierOf(row.years)]}</p></>}</td>
            <td className="py-3 pr-4"><select value={track} onChange={(event) => setTracks({ ...tracks, [row.id]: event.target.value })} aria-label={`Category for ${row.name}`} className="h-9 w-full min-w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-xs">{TRACKS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{!row.trackSet && !tracks[row.id] && <p className="mt-1 text-[10px] text-slate-400">Guessed from the current entitlement: check it</p>}</td>
            <td className="py-3 pr-4">{cell(row.al, want?.al)}</td><td className="py-3 pr-4">{cell(row.ml, want?.ml)}</td><td className="py-3">{cell(row.hosp, want?.hosp)}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}

const TRACK_LABEL: Record<string, string> = { admin: 'Administrative officer', clinical: 'Doctor / clinic assistant (permanent)', parttime: 'Doctor / clinic assistant (part-time)' };
const TIER_LABEL = ['Under 2 years', '2 to 5 years', '5 years or more'];
type History = { at: string; by: string; note: string }[];
function PolicyEditor({ policy, history, onSaved, onError }: { policy: Policy; history: History; onSaved: (policy: Policy, history: History) => void; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Policy>(policy);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => { if (!editing) setDraft(policy); }, [policy, editing]);
  const input = (value: number, change: (value: number) => void, label: string) => editing
    ? <input type="number" min={0} max={365} step={1} aria-label={label} value={value} onChange={(event) => change(Math.max(0, Math.round(Number(event.target.value) || 0)))} className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-[#0b587b]" />
    : <span className="font-semibold text-[#0b587b]">{value} days</span>;
  const setAl = (track: string, index: number, value: number) => setDraft({ ...draft, al: { ...draft.al, [track]: draft.al[track].map((item, at) => at === index ? value : item) } });
  const save = async () => {
    if (!window.confirm('Save the company leave policy? It does not change anyone\'s balance by itself: you apply it to the staff you choose below.')) return;
    setSaving(true);
    try { const result = await api('action=leave_policy_config_save', { policy: draft }); if (result.error) throw new Error(result.error); onSaved(result.policy, result.history || []); setEditing(false); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the policy.'); }
    setSaving(false);
  };
  const show = editing ? draft : policy;
  return <section className={card}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">Company leave policy</h3><p className="mt-1 max-w-3xl text-sm text-slate-500">Annual leave depends on the staff category and years of service. Sick leave and hospital leave are for permanent staff. When someone passes 2 or 5 years during the year, annual leave is shared by month (the same way Infotech does it). Changing a figure does not change anyone's balance until you apply it below.</p></div>
      <div className="flex gap-2">{editing
        ? <><button onClick={() => { setEditing(false); setDraft(policy); }} disabled={saving} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => void save()} disabled={saving} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save policy'}</button></>
        : <button onClick={() => setEditing(true)} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white">Edit policy</button>}</div>
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-4 font-semibold">Years of service</th>{Object.keys(TRACK_LABEL).map((track) => <th key={track} className="py-2 pr-4 font-semibold">Annual · {TRACK_LABEL[track]}</th>)}<th className="py-2 pr-4 font-semibold">Sick (permanent)</th></tr></thead>
      <tbody>{TIER_LABEL.map((label, index) => <tr key={label} className="border-b border-slate-50"><td className="py-2 pr-4 text-slate-600">{label}</td>{Object.keys(TRACK_LABEL).map((track) => <td key={track} className="py-2 pr-4">{input(show.al[track][index], (value) => setAl(track, index, value), `Annual leave ${TRACK_LABEL[track]} ${label}`)}</td>)}<td className="py-2 pr-4">{input(show.ml[index], (value) => setDraft({ ...draft, ml: draft.ml.map((item, at) => at === index ? value : item) }), `Sick leave ${label}`)}</td></tr>)}</tbody>
    </table></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-4">{([['hosp', 'Hospital leave'], ['marriage', 'Marriage leave'], ['haji', 'Haji / Umrah leave'], ['unpaid', 'Unpaid leave']] as const).map(([key, label]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1">{input(show[key], (value) => setDraft({ ...draft, [key]: value }), label)}</div></div>)}</div>
    <p className="mt-2 text-xs text-slate-400">Part-time staff have no sick, hospital, marriage, Haji/Umrah or unpaid leave under this policy.</p>
    {history.length > 0 && <div className="mt-3"><button onClick={() => setShowHistory(!showHistory)} className="text-xs font-semibold text-[#0b587b] hover:underline">{showHistory ? 'Hide' : 'Show'} changes made ({history.length})</button>
      {showHistory && <ul className="mt-2 space-y-1.5 text-xs text-slate-600">{history.map((item) => <li key={item.at} className="rounded-lg bg-slate-50 px-3 py-2"><span className="font-semibold">{new Date(item.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</span> · {item.by}<br />{item.note}</li>)}</ul>}</div>}
  </section>;
}

export function HRLeavePolicy({ onError }: { onError: (message: string) => void }) {
  const [policy, setPolicy] = useState<Policy>(DEFAULT);
  const [history, setHistory] = useState<History>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { api('action=leave_policy_config').then((result) => { if (result.error) throw new Error(result.error); setPolicy(result.policy); setHistory(result.history || []); }).catch((cause: Error) => onError(cause.message)).finally(() => setReady(true)); }, []);
  if (!ready) return <p className="text-sm text-slate-500">Loading…</p>;
  return <div className="space-y-5"><PolicyEditor policy={policy} history={history} onSaved={(next, log) => { setPolicy(next); setHistory(log); }} onError={onError} /><PolicyReview policy={policy} onError={onError} /></div>;
}
