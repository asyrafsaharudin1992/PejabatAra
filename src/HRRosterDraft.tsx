import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { rosterSheetPdf } from './lib/rosterPdf';
import { downloadBlob } from './lib/downloadBlob';
import { tableToWordHtml } from './lib/wordTable';
import { HRRosterRules } from './HRRosterRules';
import { SubTabs } from './SubTabs';
import { PrintPage, PrintPortal } from './PrintPortal';
import { usePrintSheet } from './IncentiveSheet';
import { officeFetch } from './lib/officeApi';
import { newCode } from './lib/shiftCodes';
import { downloadReportCsv } from './lib/hrReportExport';
import { rosterShiftColor } from './lib/rosterColors';
import { addDays, cellKey, cycleCodes, draftShifts, patternShifts, generateRosterDraft, monthDates, type DraftCell, type DraftDay, type DraftLeave, type DraftPerson, type DraftRequest, type Pattern, type RosterRule, preferredNights, DAY_NAMES } from './lib/rosterDraft';

export type SheetStyle = { texts: Record<string, string>; colours: Record<string, string>; locumColour: string; textSize?: number };
const NEW_STYLE: SheetStyle = { texts: {}, colours: {}, locumColour: '#fef08a', textSize: 10 };
const TEXT_SIZES: [number, string][] = [[8, 'Small'], [10, 'Normal'], [12, 'Large'], [14, 'Extra large']];
const BOX_COLOURS = [['#ffffff', 'White'], ['#fef08a', 'Yellow'], ['#fed7aa', 'Orange'], ['#bbf7d0', 'Green'], ['#bae6fd', 'Blue'], ['#fbcfe8', 'Pink'], ['#e2e8f0', 'Grey'], ['#fecaca', 'Red'], ['#1e293b', 'Dark']];
type Context = { people: DraftPerson[]; sourceDays: DraftDay[]; targetDays: DraftDay[]; leave: DraftLeave[] };
const field = 'mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800';
const button = 'rounded-lg bg-[#0b587b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
const doctor = (person: DraftPerson) => /\b(DR|DOCTOR)\b/i.test(person.designation);
export function HRRosterDraft({ initialMonth, group, company, onClose, hideCodes = [] }: { key?: string; initialMonth: string; group: 'staff' | 'doctors'; company: string; onClose: () => void; hideCodes?: string[] }) {
  const [month, setMonth] = useState(initialMonth);
  const [source, setSource] = useState(() => { const date = new Date(`${initialMonth}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 10); });
  const [length, setLength] = useState(14);
  const [scope, setScope] = useState<'ca' | 'all'>('ca');
  const [context, setContext] = useState<Context | null>(null);
  const [patterns, setPatterns] = useState<Record<string, Pattern>>({});
  const [requests, setRequests] = useState<DraftRequest[]>([]);
  const [request, setRequest] = useState<DraftRequest>({ id: '', date: `${initialMonth}-01`, shift: 'OFF', required: false });
  const [locks, setLocks] = useState<Record<string, string>>({});
  const [preserve, setPreserve] = useState(true);
  const [autoFix, setAutoFix] = useState(true);
  // A draft saved to carry on later (one for each month, doctors or staff, and clinic). It is not the live roster.
  type Saved = { payload: any; updatedBy: string; updatedAt: string };
  const [saved, setSaved] = useState<Saved | null>(null), [saveMessage, setSaveMessage] = useState(''), [pendingRun, setPendingRun] = useState(0);
  const draftQuery = () => `month=${encodeURIComponent(month)}&group=${group}&company=${encodeURIComponent(company)}`;
  const loadSaved = () => { officeFetch(`/api/status?resource=hr&action=roster_draft_load&${draftQuery()}`).then((r) => r.json()).then((d) => setSaved(d.draft || null)).catch(() => setSaved(null)); };
  const draftPost = async (action: string, body: unknown) => { const response = await officeFetch(`/api/status?resource=hr&action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, group, company, ...(body as object) }) }); const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || 'Unable to save the draft.'); };
  const [sheetStyles, setSheetStyles] = useState<Record<string, SheetStyle>>({});
  const styleOf = (company: string): SheetStyle => sheetStyles[company] || NEW_STYLE;
  const changeStyle = (company: string, patch: Partial<SheetStyle>) => setSheetStyles((all) => ({ ...all, [company]: { ...(all[company] || NEW_STYLE), ...patch } }));
  const [minDay, setMinDay] = useState(1), [minNight, setMinNight] = useState(1);
  const [rules, setRules] = useState<RosterRule[] | null | undefined>(undefined); // undefined: loading, null: no rules table yet (the built-in rule is used)
  const loadRules = () => { officeFetch('/api/status?resource=hr&action=roster_rules').then((r) => r.json()).then((d) => setRules(Array.isArray(d.rules) ? d.rules : null)).catch(() => setRules(null)); };
  useEffect(loadRules, []);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [result, setResult] = useState<ReturnType<typeof generateRosterDraft> | null>(null);
  const [generatedKey, setGeneratedKey] = useState('');
  const [edit, setEdit] = useState<{ id: string; date: string; shift: string } | null>(null);
  const [view, setView] = useState<'grid' | 'weekly' | 'calendar'>('weekly');
  const loadKey = JSON.stringify([month, source, length, scope]);
  const configKey = JSON.stringify([loadKey, patterns, requests, locks, preserve, minDay, minNight, rules, autoFix]);
  const fresh = loadedKey === loadKey;
  const ready = !busy && fresh && generatedKey === configKey;
  const people: DraftPerson[] = context?.people || [];
  const selectedPeople = people.filter((p) => patterns[p.id]?.enabled);
  const options = draftShifts.filter((s) => group !== 'doctors' || !['AM-9', 'AM-12', 'AM-6', 'AM-5'].includes(s));
  const load = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await officeFetch(`/api/status?resource=hr&action=roster_draft_context&month=${encodeURIComponent(month)}&source=${encodeURIComponent(source)}&length=${length}&scope=${scope}&group=${group}&company=${encodeURIComponent(company)}`);
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || 'Unable to load pattern sample.');
      const filtered: Context = { ...data, people: data.people.filter((p: DraftPerson) => (group === 'doctors') === doctor(p) && (!company || p.company === company) && !hideCodes.includes(p.code)).sort((a: DraftPerson, b: DraftPerson) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)) };
      const map = new Map<string, string>(filtered.sourceDays.map((d) => [cellKey(d.id, d.date), newCode(d.shift)]));
      const next: Record<string, Pattern> = {};
      let rotationIndex = 0;
      for (const person of filtered.people) {
        const sample = Array.from({ length }, (_, i) => map.get(cellKey(person.id, addDays(source, i))) || '?');
        const kjDoctor = group === 'doctors' && person.company === 'KJ';
        const work = sample.filter((s) => ['AM', 'PM', 'OH'].includes(s));
        const office = kjDoctor && (/\bHANIS\b/i.test(person.name) || work.length > 0 && work.every((s) => s === 'OH'));
        const offCounts = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, count: sample.filter((s, i) => ['OFF', 'REST'].includes(s) && new Date(`${addDays(source, i)}T00:00:00Z`).getUTCDay() === weekday).length }));
        const weekdayOff = offCounts.sort((a, b) => b.count - a.count || a.weekday - b.weekday)[0].weekday;
        next[person.id] = { enabled: kjDoctor || sample.every((s) => options.includes(s) && patternShifts.includes(s)), anchor: source, cycle: sample.join(', '), doctorMode: kjDoctor ? office ? 'office' : 'rotation' : 'sample', weekdayOff, nightWeeks: kjDoctor && !office && rotationIndex++ % 2 === 1 ? '1,2' : '2,1', nightPlacement: 'before-off', ...(kjDoctor && /\bMOHAMAD ASYRAF BIN SAHARUDIN\b/i.test(person.name) ? { nightDays: [1, 2], weekdayOff: 0 } : {}) };
      }
      setContext(filtered); setPatterns(next); setLocks({}); setRequests([]); setSheetStyles({}); setLoadedKey(loadKey); setSaveMessage(''); loadSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load sample.'); }
    setBusy(false);
  };
  const generate = (nextLocks: Record<string, string> = locks) => {
    setError('');
    try {
      if (!selectedPeople.length) throw new Error('Select at least one person and enter their pattern.');
      if (![minDay, minNight].every((n) => Number.isInteger(n) && n >= 0 && n <= 50)) throw new Error('Coverage minimums must be whole numbers from 0 to 50.');
      const next = generateRosterDraft({ month, people, patterns, existing: context!.targetDays, leave: context!.leave, requests, locks: nextLocks, preserve, minDay, minNight, rules: rules ?? undefined, autoFix });
      setResult(next); setGeneratedKey(JSON.stringify([loadKey, patterns, requests, nextLocks, preserve, minDay, minNight, rules, autoFix]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to generate draft.'); }
  };
  const saveDraft = async () => {
    setError(''); setSaveMessage('');
    try {
      await draftPost('roster_draft_save', { payload: { patterns, requests, locks, preserve, autoFix, minDay, minNight, sheetStyles, source, length, scope } });
      setSaveMessage(`Draft saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. Open it later with Open saved draft.`); loadSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the draft.'); }
  };
  const openSaved = () => {
    const d = saved?.payload; if (!d) return;
    const known = new Set(people.map((p) => p.id));
    setPatterns((now) => ({ ...now, ...Object.fromEntries(Object.entries(d.patterns || {}).filter(([id]) => known.has(id))) }));
    setRequests(Array.isArray(d.requests) ? d.requests.filter((r: DraftRequest) => known.has(r.id)) : []); setLocks(d.locks || {});
    setPreserve(d.preserve !== false); setAutoFix(d.autoFix !== false); setMinDay(Number(d.minDay) || 0); setMinNight(Number(d.minNight) || 0); setSheetStyles(d.sheetStyles || {});
    setSaveMessage('Saved draft opened.'); setPendingRun((n) => n + 1);
  };
  const deleteSaved = async () => { if (!window.confirm('Delete the saved draft for this month?')) return; try { await draftPost('roster_draft_delete', {}); setSaved(null); setSaveMessage('Saved draft deleted.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete the draft.'); } };
  useEffect(() => { if (pendingRun) generate(); }, [pendingRun]);
  const changePattern = (id: string, patch: Partial<Pattern>) => setPatterns((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const cellMap = new Map<string, DraftCell>((result?.cells || []).map((c: DraftCell) => [cellKey(c.id, c.date), c]));
  const dates = monthDates(month);
  const exportDraft = () => {
    if (!ready || !result || result.blocked) return;
    const staff = new Map<string, DraftPerson>(people.map((p) => [p.id, p]));
    downloadReportCsv([{ headers: ['company', 'code', 'date', 'shift'], rows: result.cells.map((c) => [staff.get(c.id)!.company, staff.get(c.id)!.code, c.date, c.shift]) }], `DRAFT Roster ${group} ${month}`);
  };
  return <section className="draft-compact space-y-5 rounded-2xl border-2 border-[#0b587b]/30 bg-white p-5" aria-label="Roster pattern trial">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">Pattern roster · {group === 'doctors' ? 'Doctors' : 'Staff'} · Trial</h3><p className="mt-1 text-sm text-slate-600">Build and review a draft. The live roster stays unchanged. Closing this trial discards the draft.</p></div><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">Close trial</button></div>
    <div className="grid gap-3 md:grid-cols-4"><label className="text-sm font-semibold">Target month<input type="month" value={month} onChange={(e) => e.target.value && (setMonth(e.target.value), setRequest((current) => ({ ...current, date: `${e.target.value}-01` })))} className={field} /></label><label className="text-sm font-semibold">Sample starts on<input type="date" value={source} onChange={(e) => setSource(e.target.value)} className={field} /></label><label className="text-sm font-semibold">Sample length<select value={length} onChange={(e) => setLength(Number(e.target.value))} className={field}>{[7, 14, 28].map((n) => <option key={n} value={n}>{n} days</option>)}</select></label><button type="button" disabled={busy || !source || !month} onClick={() => void load()} className={`${button} self-end`}>{busy ? 'Loading…' : context ? 'Reload sample (resets draft)' : 'Load pattern sample'}</button></div>
    {group === 'staff' && <label className="block max-w-xs text-sm font-semibold">Roster scope<select value={scope} onChange={(e) => setScope(e.target.value as 'ca' | 'all')} className={field}><option value="ca">Clinic assistants only</option><option value="all">All non-doctor staff</option></select></label>}
    <p className="text-xs text-slate-500">A copied sample is a starting point, not a confirmed repeating pattern. Check each person’s cycle and its start date. Missing sample days appear as ?. Samples containing leave, holidays or missing days are not selected automatically; replace exceptions with the usual shift first. Loads only when requested; editing and generation run in your browser.</p>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {context && !fresh && <p className="rounded-lg bg-amber-50 p-3 text-sm">Month or sample changed. Reload the sample before generating or exporting.</p>}
    {context && fresh && <>
      <div className="overflow-x-auto"><table className="draft-people w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-2">Use</th><th className="p-2">{group === 'doctors' ? 'Doctor' : 'Staff'}</th><th className="p-2">Cycle starts</th><th className="p-2">Schedule / repeating shifts</th></tr></thead><tbody>{people.map((p) => <tr key={p.id} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`Include ${p.name}`} checked={patterns[p.id]?.enabled || false} onChange={(e) => changePattern(p.id, { enabled: e.target.checked })} /></td><td className="p-2"><span className="font-semibold">{p.name}</span><p className="text-xs text-slate-500">{p.company} · {p.code}</p></td><td className="p-2"><input aria-label={`Cycle starts for ${p.name}`} type="date" value={patterns[p.id]?.anchor || ''} onChange={(e) => changePattern(p.id, { anchor: e.target.value })} className={field} /></td><td className="p-2">{group === 'doctors' && p.company === 'KJ' && <label className="block text-xs">Doctor schedule<select aria-label={`Doctor schedule for ${p.name}`} value={patterns[p.id]?.doctorMode || 'sample'} onChange={(e) => changePattern(p.id, { doctorMode: e.target.value as Pattern['doctorMode'] })} className={field}><option value="rotation">Weekly AM / PM rotation</option><option value="office">Fixed OH · Mon–Fri</option><option value="sample">Copied sample · manual pattern</option></select></label>}
              {patterns[p.id]?.doctorMode === 'rotation' ? <div className="grid grid-cols-2 gap-2"><fieldset className="col-span-2 text-xs"><legend>Preferred night shift on day</legend><div className="mt-1 flex flex-wrap gap-3">{[1, 2, 3, 4, 5].map((day) => { const chosen = preferredNights(patterns[p.id]).includes(day); return <label key={day} className="flex items-center gap-1"><input type="checkbox" aria-label={`Preferred night on ${DAY_NAMES[day]} for ${p.name}`} checked={chosen} onChange={() => { const now = preferredNights(patterns[p.id]); changePattern(p.id, { nightPlacement: 'before-off', nightDays: chosen ? now.filter((d) => d !== day) : [...now, day] }); }} />{DAY_NAMES[day]}</label>; })}</div><span className="mt-1 block font-normal text-slate-500">{preferredNights(patterns[p.id]).length ? `Nights go on ${preferredNights(patterns[p.id]).map((d) => DAY_NAMES[d]).join(', ')} first (in the order ticked).` : 'None ticked: nights go on the days before the weekday OFF.'}</span></fieldset><label className="text-xs">Weekday OFF<select aria-label={`Weekday OFF for ${p.name}`} value={patterns[p.id]?.nightPlacement === 'mon-tue' ? 0 : patterns[p.id]?.weekdayOff ?? (preferredNights(patterns[p.id]).length ? 0 : 1)} onChange={(e) => changePattern(p.id, { weekdayOff: Number(e.target.value), nightPlacement: 'before-off' })} className={field}><option value={0}>Day after last night</option>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label><label className="text-xs">PM per week (repeat)<input aria-label={`Weekly nights for ${p.name}`} value={patterns[p.id]?.nightWeeks || ''} onChange={(e) => changePattern(p.id, { nightWeeks: e.target.value })} className={field} placeholder="2,1 or 2,2,1,1" /></label><p className="col-span-2 text-xs text-slate-500">4 workdays/week; remaining workdays AM. Sat/Sun OFF. 2,1 / 1,2 are staggered draft starting sequences; adjust them and the cycle date for each doctor. Preferred night days are used first; with "Day after last night" the weekday OFF follows the final night (and nights start on Monday if no days are ticked).</p></div> : patterns[p.id]?.doctorMode === 'office' ? <p className="mt-2 text-xs text-slate-600">OH Monday–Friday; OFF Saturday/Sunday. Excluded from AM/PM coverage.</p> : <><input aria-label={`Pattern for ${p.name}`} value={patterns[p.id]?.cycle || ''} onChange={(e) => changePattern(p.id, { cycle: e.target.value })} className={`${field} min-w-[340px] font-mono text-xs`} /><span className="text-xs text-slate-500">{cycleCodes(patterns[p.id]?.cycle || '').length} days</span></>}</td></tr>)}</tbody></table></div>
      {!people.length && <p className="text-sm text-slate-500">No active {group} found for this clinic.</p>}
      <p className="text-xs text-slate-500">Pattern codes (requests allow other codes): {options.filter((s) => patternShifts.includes(s)).join(', ')}. The cycle repeats continuously from its start date across month boundaries.</p>
      <div className="flex flex-wrap items-end gap-4 rounded-xl bg-slate-50 p-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preserve} onChange={(e) => setPreserve(e.target.checked)} />Protect existing roster cells</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoFix} onChange={(e) => setAutoFix(e.target.checked)} />Move days to follow the rules</label>{rules === null && <><label className="text-sm font-semibold">Minimum day cover / clinic<input aria-label="Minimum day cover" type="number" min={0} max={50} value={minDay} onChange={(e) => setMinDay(Number(e.target.value))} className={`${field} max-w-24`} /></label><label className="text-sm font-semibold">Minimum night cover / clinic<input aria-label="Minimum night cover" type="number" min={0} max={50} value={minNight} onChange={(e) => setMinNight(Number(e.target.value))} className={`${field} max-w-24`} /></label></>}<p className="max-w-lg text-xs text-slate-500">{rules !== null && 'Minimum day and night cover are set in the Rules above. '}Coverage counts selected {group} only, grouped by KJ/SK. Doctor day cover counts AM only; OH doctors are excluded. Uncovered KJ doctor nights are listed as locum needs. Defaults are trial values; HR must set the clinic’s actual requirements. Approved leave remains protected. Headcount checks do not assess skills, employment hours or individual availability.</p></div>
      {rules !== null && <HRRosterRules rules={rules ?? null} people={people} onChanged={loadRules} />}
      <div className="space-y-3 rounded-xl border p-4"><h4 className="font-semibold">Staff requests / HR instructions</h4><div className="grid items-end gap-3 md:grid-cols-5"><label className="text-sm">Person<select value={request.id} onChange={(e) => setRequest({ ...request, id: e.target.value })} className={field}><option value="">Choose person</option>{selectedPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm">Date<input type="date" min={`${month}-01`} max={dates[dates.length - 1]} value={request.date} onChange={(e) => setRequest({ ...request, date: e.target.value })} className={field} /></label><label className="text-sm">Requested shift<select value={request.shift} onChange={(e) => setRequest({ ...request, shift: e.target.value })} className={field}>{options.map((s) => <option key={s}>{s}</option>)}</select></label><label className="text-sm">Priority<select value={request.required ? 'required' : 'preference'} onChange={(e) => setRequest({ ...request, required: e.target.value === 'required' })} className={field}><option value="preference">Preference (if covered)</option><option value="required">Required by HR</option></select></label><button type="button" disabled={!request.id || !dates.includes(request.date)} className={button} onClick={() => setRequests((rows) => [...rows.filter((r) => cellKey(r.id, r.date) !== cellKey(request.id, request.date)), { ...request }])}>Add request</button></div><p className="text-xs text-slate-500">Requests do not create or approve leave applications. Required requests may leave a coverage gap, which is flagged for HR. Preferences are skipped if they reduce coverage below the minimum.</p>{requests.map((r) => <div key={cellKey(r.id, r.date)} className="flex items-center justify-between gap-3 text-sm"><span>{people.find((p) => p.id === r.id)?.name} · {r.date} · {r.shift} · {r.required ? 'Required' : 'Preference'}</span><button type="button" className="text-rose-700" onClick={() => setRequests((rows) => rows.filter((v) => v !== r))}>Remove request</button></div>)}</div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={busy || !selectedPeople.length} onClick={() => generate()}>Generate draft</button><button type="button" className="rounded-lg border border-[#0b587b] px-4 py-2 text-sm font-semibold text-[#0b587b] disabled:opacity-40" disabled={busy || !selectedPeople.length} onClick={() => void saveDraft()}>Save draft</button>{saved && <><button type="button" className="rounded-lg border px-4 py-2 text-sm font-semibold" disabled={busy} onClick={openSaved}>Open saved draft</button><span className="text-xs text-slate-500">Saved {new Date(saved.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{saved.updatedBy ? ` · ${saved.updatedBy}` : ''}</span><button type="button" className="text-xs text-rose-700 underline" onClick={() => void deleteSaved()}>Delete saved draft</button></>}{saveMessage && <span role="status" className="text-sm text-emerald-700">{saveMessage}</span>}<button type="button" className={button} disabled={!ready || !result?.cells.length || result.blocked} onClick={exportDraft}>Download draft CSV</button>{result && !ready && <span className="text-sm text-amber-800">Settings changed. Generate again before downloading.</span>}</div>
    </>}
    {result && fresh && <>
      <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{result.cells.length} draft cells · {result.warnings.length} checks to review{result.adjusted > 0 && ` · ${result.adjusted} days moved to follow the rules`}</strong><p className="mt-1 text-xs">Click a name or letter in the draft to change that day; it is applied at once and kept when you generate again. Changed days show 🔒. Changed a rule or a setting? Press Generate draft again; your own changes are kept unless you clear them. Print uses what is on the screen. Draft CSV can be reviewed and uploaded through the existing roster import when HR is ready.</p>{Object.keys(locks).length > 0 && <button type="button" className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={() => { setLocks({}); generate({}); }}>Clear my {Object.keys(locks).length} changes and generate again</button>}</div>
      {result.locum.length > 0 && <details open className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><summary className="cursor-pointer font-semibold">Locum needed · {result.locum.length} night slots</summary><p className="mt-2 text-xs">These nights need locum arrangements. No locum has been booked by this draft.</p><div className="mt-2 max-h-40 overflow-auto">{result.locum.map((slot) => <p key={`${slot.company}-${slot.date}`}>{slot.date} · {slot.company} · PM · {slot.missing} doctor(s) needed</p>)}</div><button type="button" disabled={!ready} className={`${button} mt-3`} onClick={() => downloadReportCsv([{ headers: ['company', 'date', 'shift', 'doctors_needed', 'status'], rows: result.locum.map((slot) => [slot.company, slot.date, slot.shift, slot.missing, 'Locum needed']) }], `Locum needs ${month}`)}>Download locum needs CSV</button></details>}
      {result.warnings.length > 0 && <details open className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><summary className="cursor-pointer font-semibold">Review checks ({result.warnings.length})</summary><ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
      <SubTabs label="Draft view" active={view} onSelect={setView} tabs={[{ id: 'weekly', label: 'Weekly table', short: 'Weekly' }, { id: 'calendar', label: 'Calendar' }, { id: 'grid', label: 'Staff by day', short: 'By day' }]} />
      {view === 'grid' ?       <div className="max-h-[550px] overflow-auto"><table className="border-collapse text-xs"><thead><tr><th className="sticky left-0 z-10 min-w-48 border bg-white p-2 text-left">{group === 'doctors' ? 'Doctor' : 'Staff'}</th>{dates.map((date) => <th key={date} className="min-w-14 border bg-slate-50 p-2">{date.slice(8)}</th>)}</tr></thead><tbody>{people.filter((p) => result.cells.some((c) => c.id === p.id)).map((p) => <tr key={p.id}><th className="sticky left-0 z-10 border bg-white p-2 text-left">{p.name}<small className="block font-normal">{p.company} · {p.code}</small></th>{dates.map((date) => { const cell = cellMap.get(cellKey(p.id, date)); const color = cell && rosterShiftColor(cell.shift); return <td key={date} className="border p-0"><button type="button" aria-label={`Draft ${p.name} ${date} ${cell?.shift}`} disabled={!ready} title={`${cell?.source}${cell?.locked ? ' · protected' : ''}`} className="h-11 w-full px-1 font-semibold disabled:opacity-60" style={color ? { backgroundColor: color.backgroundColor, color: color.textColor } : {}} onClick={() => cell && setEdit({ id: p.id, date, shift: cell.shift })}>{cell?.shift}{cell?.locked && <span className="block text-[9px]">🔒</span>}</button></td>; })}</tr>)}</tbody></table></div> : <DraftTables view={view} month={month} dates={dates} people={people} cellMap={cellMap} group={group} locum={result.locum} styleOf={styleOf} onStyle={changeStyle} onEdit={ready ? (id, date, shift) => setEdit({ id, date, shift }) : undefined} />}
    </>}
    {edit && <div role="dialog" aria-modal="true" aria-label="Edit draft cell" className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5"><h4 className="font-semibold">Edit draft day</h4><p className="text-sm">{people.find((p) => p.id === edit.id)?.name} · {edit.date}</p><label className="block text-sm">Draft shift<select value={edit.shift} onChange={(e) => setEdit({ ...edit, shift: e.target.value })} className={field}>{options.map((s) => <option key={s}>{s}</option>)}</select></label><p className="text-xs text-slate-500">Approved leave takes priority. To change an existing protected roster cell, turn off “Protect existing roster cells”.</p><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => { const next = { ...locks, [cellKey(edit.id, edit.date)]: edit.shift }; setLocks(next); setEdit(null); generate(next); }}>Save change</button><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { const next = { ...locks }; delete next[cellKey(edit.id, edit.date)]; setLocks(next); setEdit(null); generate(next); }}>Undo my change</button><button type="button" className="px-2 text-sm" onClick={() => setEdit(null)}>Cancel</button></div></div></div>}
  </section>;
}


// The draft as a weekly table like the doctors' printed schedule (a row for each shift, a column for each day, the names inside), or as a month calendar.
const DAY_MS = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
const LEAVE = new Set(['AL', 'MC', 'ML', 'UPL', 'EL', 'PH']);
const SHIFT_ORDER = ['AM', 'AM-9', 'AM-12', 'AM-6', 'AM-5', 'OH', 'PM'];
const SHIFT_NAME: Record<string, string> = { AM: 'AM · day', PM: 'PM · night', OH: 'OH · office hours', 'AM-9': 'AM-9 · 9AM-9PM', 'AM-12': 'AM-12 · 12PM-9PM', 'AM-6': 'AM-6 · 9AM-6PM', 'AM-5': 'AM-5 · 8AM-5PM' };
const firstName = (name: string) => { const words = name.split(/\s+/).filter(Boolean); const word = words.find((item) => !/^(AHMAD|MOHAMAD|MUHAMAD|MUHAMMAD|MOHD|NUR|NURUL|SITI|DR)$/i.test(item)) || words[0] || ''; return word.charAt(0) + word.slice(1).toLowerCase(); };
function DraftTables({ view, month, dates, people, cellMap, group, locum, onEdit, styleOf, onStyle }: { styleOf: (company: string) => SheetStyle; onStyle: (company: string, patch: Partial<SheetStyle>) => void; onEdit?: (id: string, date: string, shift: string) => void; view: 'weekly' | 'calendar'; month: string; dates: string[]; people: DraftPerson[]; cellMap: Map<string, DraftCell>; group: 'staff' | 'doctors'; locum: { company: string; date: string; missing: number }[] }) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const cellsOn = (date: string) => [...byId.values()].map((person) => ({ person, cell: cellMap.get(cellKey(person.id, date)) })).filter((item): item is { person: DraftPerson; cell: DraftCell } => Boolean(item.cell));
  const namesFor = (date: string, code: string) => cellsOn(date).filter(({ cell }) => newCode(cell.shift) === code).map(({ person, cell }) => ({ id: person.id, shift: cell.shift, text: `${firstName(person.name)}${cell.locked ? ' 🔒' : ''}` }));
  const pick = (date: string, item: { id: string; shift: string; text: string }) => onEdit ? <button type="button" aria-label={`Edit ${item.text} ${date}`} className="underline decoration-dotted" onClick={() => onEdit(item.id, date, item.shift)}>{item.text}</button> : <>{item.text}</>;
  const leaveOn = (date: string) => cellsOn(date).filter(({ cell }) => LEAVE.has(newCode(cell.shift))).map(({ person, cell }) => `${firstName(person.name)} (${newCode(cell.shift)})`);
  const used = SHIFT_ORDER.filter((code) => dates.some((date) => namesFor(date, code).length));
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  if (view === 'calendar') return <div className="overflow-x-auto"><div className="min-w-[640px]">
    <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <p key={name} className="py-1">{name}</p>)}</div>
    <div className="grid grid-cols-7 overflow-hidden rounded-xl border-l border-t border-slate-200">
      {Array.from({ length: lead }, (_blank, index) => <div key={`b${index}`} className="min-h-[96px] border-b border-r border-slate-200 bg-slate-50" />)}
      {dates.map((date) => <div key={date} className="min-h-[96px] border-b border-r border-slate-200 bg-white p-1"><p className="mb-0.5 text-xs font-semibold text-slate-600">{Number(date.slice(8))}</p><div className="space-y-0.5">
        {used.map((code) => { const names = namesFor(date, code); const color = rosterShiftColor(code); return names.length ? <p key={code} className="rounded px-1 py-0.5 text-[10px] font-semibold leading-tight" style={color ? { backgroundColor: color.backgroundColor, color: color.textColor } : {}}><b>{code}</b> {names.map((item, i) => <Fragment key={item.id}>{i > 0 && ', '}{pick(date, item)}</Fragment>)}</p> : null; })}
        {leaveOn(date).length > 0 && <p className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-semibold leading-tight text-rose-800"><b>CUTI</b> {leaveOn(date).join(', ')}</p>}
      </div></div>)}
    </div></div></div>;
  const companies = [...new Set(people.filter((person) => dates.some((date) => cellMap.has(cellKey(person.id, date)))).map((person) => person.company))].sort();
  return <div className="space-y-6">{companies.map((company) => <WeeklySheet key={company} month={month} dates={dates} people={people.filter((person) => person.company === company && dates.some((date) => cellMap.has(cellKey(person.id, date))))} cellMap={cellMap} group={group} company={company} onEdit={onEdit} style={styleOf(company)} onStyle={(patch) => onStyle(company, patch)} locum={locum.filter((slot) => slot.company === company)} />)}{!companies.length && <p className="text-sm text-slate-500">No shifts in this draft.</p>}</div>;
}

// One clinic's draft in the layout of the printed doctors' schedule: a row for each day (day, date) and a column for each shift,
// with a letter for each doctor (A, B, C…), * after a letter that was asked for (a request), yellow where a locum is needed.
const MS_DAY = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
function WeeklySheet({ month, dates, people, cellMap, group, company, locum, onEdit, style, onStyle }: { style: SheetStyle; onStyle: (patch: Partial<SheetStyle>) => void; onEdit?: (id: string, date: string, shift: string) => void; key?: string; month: string; dates: string[]; people: DraftPerson[]; cellMap: Map<string, DraftCell>; group: 'staff' | 'doctors'; company: string; locum: { date: string; missing: number }[] }) {
  const [printing, setPrinting] = useState(false);
  // Free text for the printed page: while "Edit text" is on, every cell, the title and a note can be typed over like in a document.
  // It only changes this page (kept while the draft is open), not the draft itself.
  const [editText, setEditText] = useState(false);
  const { texts, colours, locumColour } = style;
  const setTexts = (update: (all: Record<string, string>) => Record<string, string>) => onStyle({ texts: update(texts) });
  const setLocumColour = (value: string) => onStyle({ locumColour: value });
  const [picked, setPicked] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  // always: the cell can be typed in without switching Edit text on (the locum column, to fill a name in as soon as one is found).
  const typed = (key: string, shown: string, always = false) => editText || always
    ? <span contentEditable suppressContentEditableWarning className={`block min-w-[6ch] rounded ${editText && !exporting ? 'outline-dashed outline-1 outline-sky-300' : 'hover:bg-white/60'}`} onBlur={(e) => { const value = e.currentTarget.textContent || ''; if (value !== shown) setTexts((all) => ({ ...all, [key]: value })); }}>{shown}</span>
    : <>{shown}</>;
  usePrintSheet(printing, `Roster draft - ${company} - ${month}`, () => setPrinting(false));
  const letters = group === 'doctors' && people.length <= 26;
  // A is Asyraf, B is Syafiq and C is Hanis; any other doctor gets the next letters (D, E…).
  const FIXED: Record<string, string> = { ARA0001: 'A', ARA0002: 'B', ARA0044: 'C' };
  const free = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)).filter((letter) => !Object.values(FIXED).includes(letter));
  let next = 0;
  const tag = new Map(people.map((person) => [person.id, letters ? FIXED[person.code] || free[next++] : firstName(person.name)]));
  const cellOf = (person: DraftPerson, date: string) => cellMap.get(cellKey(person.id, date));
  const used = group === 'doctors' ? ['OH', 'AM', 'PM'] : SHIFT_ORDER.filter((code) => dates.some((date) => people.some((person) => { const cell = cellOf(person, date); return cell && newCode(cell.shift) === code; })));
  const columns = [...used, 'OFF'];
  const titleMonth = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
  const title = `JADUAL KLINIK ARA 24 JAM ${titleMonth}${group === 'doctors' ? ' (RESIDEN/LOCUM)' : ''} · ${company}`;
  const legend = letters ? [...people].sort((a, b) => String(tag.get(a.id)).localeCompare(String(tag.get(b.id)))).map((person) => `${tag.get(person.id)}: DR ${firstName(person.name).toUpperCase()}`).join('   ') : '';
  const label = (person: DraftPerson, cell: DraftCell) => `${tag.get(person.id)}${cell.source === 'request' ? '*' : ''}`;
  const who = (date: string, code: string) => people.map((person) => ({ person, cell: cellOf(person, date) })).filter((item): item is { person: DraftPerson; cell: DraftCell } => Boolean(item.cell) && (code === 'OFF' ? ['OFF', 'REST'].includes(newCode(item.cell!.shift)) : newCode(item.cell!.shift) === code)).map(({ person, cell }) => ({ id: person.id, shift: cell.shift, text: label(person, cell) }));
  const remark = (date: string) => people.map((person) => ({ person, cell: cellOf(person, date) })).filter((item): item is { person: DraftPerson; cell: DraftCell } => Boolean(item.cell) && LEAVE.has(newCode(item.cell!.shift))).map(({ person, cell }) => `${tag.get(person.id)} ${newCode(cell.shift)}`).join(', ');
  // KJ doctors: the evening locum works 8-10pm when a day-shift (AM) doctor other than Hanis (ARA0044) is in, otherwise 6-10pm.
  const eveningLocum = group === 'doctors' && company === 'KJ';
  const locumHours = (date: string) => people.some((person) => person.code !== 'ARA0044' && cellOf(person, date) && newCode(cellOf(person, date)!.shift) === 'AM') ? 'LOCUM 8-10' : 'LOCUM 6-10';
  const extra = eveningLocum ? 1 : 0;
  const needsLocum = (date: string) => locum.some((slot) => slot.date === date && slot.missing > 0);
  const head = columns.map((code) => code === 'OH' ? '9-6PM OH' : code === 'AM' || code === 'PM' ? `${code}*` : code);
  const th = 'border border-slate-400 bg-[#0b587b] px-2 py-1.5 text-xs font-bold text-white';
  const td = 'border border-slate-300 px-2 py-1 text-center text-[13px]';
  // Each box can be recoloured (Edit text on, click a box, click a colour); a locum box starts with the locum colour.
  const box = (key: string, base?: CSSProperties) => ({
    style: { ...base, ...(colours[key] ? { backgroundColor: colours[key], ...(colours[key] === '#1e293b' ? { color: '#ffffff' } : {}) } : {}), ...(editText && picked === key && !exporting ? { outline: '2px solid #0b587b', outlineOffset: '-2px' } : {}) } as CSSProperties,
    onClick: editText ? () => setPicked(key) : undefined,
  });
  const table = <table className="w-full border-collapse">
    <thead>
      <tr><th colSpan={columns.length + 3 + extra} className="border border-slate-400 bg-sky-50 px-2 py-2 text-center text-sm font-bold text-[#14233b]">*: REQUESTS &nbsp;·&nbsp; <span className="px-1" style={{ backgroundColor: locumColour }}>{typed('legend', texts.legend ?? 'Colour: locum')}</span><br />{typed('title', texts.title ?? title)}{legend && <><br /><span className="text-xs font-semibold">{legend}</span></>}</th></tr>
      <tr><th className={th} /><th className={th} />{head.map((text) => <th key={text} className={th}>{text}</th>)}{eveningLocum && <th className={`${th} text-left`}>LOCUM 6-10</th>}<th className={th}>REMARK</th></tr>
    </thead>
    <tbody>{dates.map((date, index) => {
      const day = new Date(`${date}T00:00:00Z`);
      const weekend = [0, 6].includes(day.getUTCDay());
      return <Fragment key={date}>
        <tr className={weekend ? 'bg-slate-50' : ''}>
          <td {...box(`${date}|day`)} className={`${td} font-semibold`}>{MS_DAY[day.getUTCDay()]}</td><td {...box(`${date}|date`)} className={td}>{day.getUTCDate()}/{day.getUTCMonth() + 1}</td>
          {columns.map((code) => { const names = who(date, code); const blocked = code === 'OH' && group === 'doctors' && weekend && !names.length; const lacking = code === 'PM' && needsLocum(date); return <td key={code} {...box(`${date}|${code}`, lacking && !blocked ? { backgroundColor: locumColour } : undefined)} className={`${td} ${blocked ? 'bg-slate-800' : lacking ? 'font-semibold' : ''}`}>{texts[`${date}|${code}`] !== undefined || editText ? typed(`${date}|${code}`, texts[`${date}|${code}`] ?? `${names.map((item) => item.text).join(', ')}${lacking ? (names.length ? ' · ' : '') + 'LOCUM' : ''}`) : <>{names.map((item, i) => <Fragment key={item.id}>{i > 0 && ', '}{onEdit ? <button type="button" aria-label={`Edit ${item.text} ${date}`} className="underline decoration-dotted" onClick={() => onEdit(item.id, date, item.shift)}>{item.text}</button> : item.text}</Fragment>)}{lacking && (names.length ? ' · ' : '') + 'LOCUM'}</>}</td>; })}
          {eveningLocum && <td {...box(`${date}|locum`, { backgroundColor: locumColour })} className="border border-slate-300 px-2 py-1 text-left text-[13px] font-semibold">{typed(`${date}|locum`, texts[`${date}|locum`] ?? locumHours(date), true)}</td>}
          <td {...box(`${date}|remark`)} className={`${td} text-xs`}>{typed(`${date}|remark`, texts[`${date}|remark`] ?? remark(date))}</td>
        </tr>
        {(day.getUTCDay() === 0 && index < dates.length - 1) && <tr key={`${date}-sep`}><td colSpan={columns.length + 3 + extra} className="h-2 border border-slate-300 bg-sky-200 p-0" /></tr>}
      </Fragment>;
    })}</tbody>
  </table>;
  const fileName = `Roster draft ${company} ${month}`;
  const exportPdf = async () => {
    setExportError(''); setExporting(true);
    try {
      const sheet = sheetRef.current?.querySelector('table'); if (!sheet) throw new Error('There is nothing to save yet.');
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      downloadBlob([await rosterSheetPdf(sheet as HTMLTableElement, { company, note: texts.note, logoUrl: '/ara-logo.png', fontPt: style.textSize ?? 10 })], `${fileName}.pdf`, 'application/pdf');
    }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Unable to save the PDF.'); }
    setExporting(false);
  };
  const exportWord = () => {
    setExportError('');
    try { const table = sheetRef.current?.querySelector('table'); if (!table) throw new Error('There is nothing to save yet.'); downloadBlob([tableToWordHtml(table as HTMLTableElement, fileName, texts.note ?? '', style.textSize ?? 10)], `${fileName}.doc`, 'application/msword'); }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Unable to save the Word file.'); }
  };
  const note = editText || texts.note ? <p className="mt-2 text-xs">{typed('note', texts.note ?? (editText ? 'Type a note here' : ''))}</p> : null;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-end gap-2"><label className="flex items-center gap-1 text-xs font-semibold">Text size (PDF, Word)<select value={style.textSize ?? 10} onChange={(e) => onStyle({ textSize: Number(e.target.value) })} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-normal">{TEXT_SIZES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="flex items-center gap-1 text-xs font-semibold">Locum colour<select value={locumColour} onChange={(e) => setLocumColour(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-normal">{[['#fef08a', 'Yellow'], ['#fed7aa', 'Orange'], ['#bbf7d0', 'Green'], ['#bae6fd', 'Blue'], ['#fbcfe8', 'Pink'], ['#e2e8f0', 'Grey']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><button type="button" onClick={() => setEditText(!editText)} className={`h-9 rounded-lg border px-3 text-sm font-semibold ${editText ? 'border-[#0b587b] bg-sky-50 text-[#0b587b]' : 'border-slate-200 bg-white text-slate-700'}`}>{editText ? 'Done editing text' : 'Edit text'}</button>{Object.keys(texts).length > 0 && <button type="button" onClick={() => setTexts(() => ({}))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">Undo text edits</button>}<button type="button" onClick={() => void exportPdf()} disabled={exporting} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-50">Download PDF</button><button type="button" onClick={exportWord} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">Download Word</button><button type="button" onClick={() => setPrinting(true)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">Print / PDF · {company}</button></div>
    {editText && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">{picked ? `Box ${picked.replace('|', ' ')}` : 'Click a box, then a colour'}</span>{BOX_COLOURS.map(([value, name]) => <button key={value} type="button" title={name} aria-label={`Colour ${name}`} disabled={!picked} onClick={() => onStyle({ colours: { ...colours, [picked]: value } })} className="h-6 w-6 rounded border border-slate-300 disabled:opacity-40" style={{ backgroundColor: value }} />)}<button type="button" disabled={!picked || !colours[picked]} onClick={() => { const next = { ...colours }; delete next[picked]; onStyle({ colours: next }); }} className="rounded border px-2 py-1">Clear colour</button>{Object.keys(colours).length > 0 && <button type="button" onClick={() => onStyle({ colours: {} })} className="rounded border px-2 py-1">Clear all colours</button>}</div>}
    {exportError && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{exportError}</p>}
    <div className="overflow-x-auto"><div ref={sheetRef} data-pdf-page className="inline-block min-w-full bg-white p-1">{table}{note}</div></div>
    {printing && <PrintPortal margin={8} portrait><PrintPage><div className="cv-fit roster-print"><div className="mb-2 flex items-center gap-3"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" className="h-14 w-14 object-contain" /><p className="text-sm font-bold">KLINIK ARA 24 JAM</p></div>{table}{note}</div></PrintPage></PrintPortal>}
  </div>;
}
