import { useState } from 'react';
import { officeFetch } from './lib/officeApi';
import type { DraftPerson, RosterRule } from './lib/rosterDraft';

const field = 'mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800';
const SHIFTS = ['AM', 'PM', 'OH'];
const KINDS: Record<RosterRule['kind'], string> = { not_together: 'Cannot work together', not_shift: 'Cannot work a shift', min_cover: 'Minimum people on a shift', max_consecutive: 'Maximum days in a row' };
const blank = (): RosterRule => ({ kind: 'not_together', person_a: null, person_b: null, shifts: ['AM', 'OH'], amount: null, company: null, enforce: 'warn', active: true, note: '' });

async function call(action: string, body: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to save the rule.');
}

// HR's own rules for the roster draft: who cannot work together, shifts a person must not work, minimum cover, days in a row.
// Every rule can be switched off, and set to a warning or to blocking the draft download.
export function HRRosterRules({ rules, people, onChanged }: { rules: RosterRule[] | null; people: DraftPerson[]; onChanged: () => void }) {
  const [form, setForm] = useState<RosterRule | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const name = (code: string | null) => { const p = people.find((x) => x.code === code); return p ? p.name.split(' ').slice(0, 2).join(' ') : code || 'Everyone'; };
  const sentence = (r: RosterRule) => {
    const where = r.company ? ` (${r.company})` : '';
    if (r.kind === 'not_together') return `${name(r.person_a)} and ${name(r.person_b)} cannot work the same shift${r.shifts.length ? `, or ${r.shifts.join(' with ')} together` : ''}`;
    if (r.kind === 'not_shift') return `${name(r.person_a)} must not work ${r.shifts.join(' / ')}`;
    if (r.kind === 'min_cover') return `At least ${r.amount} on ${r.shifts[0]} each day${where}`;
    return `${r.person_a ? name(r.person_a) : 'Nobody'} works at most ${r.amount} days in a row${r.person_a ? '' : ' (everyone)'}${where}`;
  };
  const run = async (action: string, body: unknown) => { setBusy(true); setError(''); try { await call(action, body); setForm(null); onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the rule.'); } finally { setBusy(false); } };
  const set = (patch: Partial<RosterRule>) => setForm((current) => current && { ...current, ...patch });
  const toggleShift = (shift: string) => set({ shifts: form!.shifts.includes(shift) ? form!.shifts.filter((s) => s !== shift) : [...form!.shifts, shift] });
  const personSelect = (label: string, value: string | null, key: 'person_a' | 'person_b', everyone = false) => <label className="text-sm">{label}<select value={value || ''} onChange={(e) => set({ [key]: e.target.value || null })} className={field}><option value="">{everyone ? 'Everyone' : 'Choose person'}</option>{people.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}</select></label>;
  return <div className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold">Rules for this roster</h4><p className="text-xs text-slate-500">Checked every time you generate. A rule set to Block also stops the draft download until it is fixed. These rules are shared by everyone in HR.</p></div><button type="button" disabled={busy} onClick={() => setForm(blank())} className="rounded-lg border px-3 py-2 text-sm font-semibold">Add a rule</button></div>
    {rules === null && <p className="text-sm text-slate-500">Loading rules…</p>}
    {rules?.length === 0 && <p className="text-sm text-slate-500">No rules yet.</p>}
    {!!rules?.length && <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="text-xs text-slate-500"><th className="p-2">On</th><th className="p-2">Rule</th><th className="p-2">If broken</th><th className="p-2" /></tr></thead><tbody>{rules.map((r) => <tr key={r.id} className={`border-t ${r.active ? '' : 'text-slate-400'}`}><td className="p-2"><input type="checkbox" aria-label="Rule on" checked={r.active} disabled={busy} onChange={(e) => void run('roster_rule_save', { ...r, active: e.target.checked })} /></td><td className="p-2">{sentence(r)}{r.note && <span className="block text-xs text-slate-400">{r.note}</span>}</td><td className="p-2">{r.enforce === 'block' ? 'Block download' : 'Warning'}</td><td className="p-2 text-right"><button type="button" className="mr-3 text-[#0b587b] underline" onClick={() => setForm(r)}>Edit</button><button type="button" className="text-rose-700 underline" disabled={busy} onClick={() => { if (window.confirm(`Delete this rule?\n${sentence(r)}`)) void run('roster_rule_delete', { id: r.id }); }}>Delete</button></td></tr>)}</tbody></table></div>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {form && <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Rule type<select value={form.kind} onChange={(e) => { const kind = e.target.value as RosterRule['kind']; set({ kind, shifts: kind === 'not_together' ? ['AM', 'OH'] : kind === 'min_cover' ? ['PM'] : [], amount: kind === 'min_cover' ? 1 : kind === 'max_consecutive' ? 6 : null, person_b: null }); }} className={field}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {['not_together', 'not_shift'].includes(form.kind) && personSelect(form.kind === 'not_together' ? 'First person' : 'Person', form.person_a, 'person_a')}
        {form.kind === 'not_together' && personSelect('Second person', form.person_b, 'person_b')}
        {form.kind === 'max_consecutive' && personSelect('Person', form.person_a, 'person_a', true)}
        {['min_cover', 'max_consecutive'].includes(form.kind) && <label className="text-sm">{form.kind === 'min_cover' ? 'At least how many people' : 'At most how many days'}<input type="number" min={form.kind === 'min_cover' ? 0 : 1} max={50} value={form.amount ?? ''} onChange={(e) => set({ amount: e.target.value === '' ? null : Number(e.target.value) })} className={field} /></label>}
        {['min_cover', 'max_consecutive'].includes(form.kind) && <label className="text-sm">Clinic<select value={form.company || ''} onChange={(e) => set({ company: e.target.value || null })} className={field}><option value="">Both</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>}
        <label className="text-sm">If the rule is broken<select value={form.enforce} onChange={(e) => set({ enforce: e.target.value as RosterRule['enforce'] })} className={field}><option value="warn">Warning only</option><option value="block">Block the draft download</option></select></label>
      </div>
      {form.kind !== 'max_consecutive' && <fieldset className="text-sm"><legend className="font-semibold">{form.kind === 'not_together' ? 'Also clash when both are on (the same shift always clashes)' : form.kind === 'min_cover' ? 'Shift' : 'Shifts'}</legend><div className="mt-1 flex gap-4">{SHIFTS.map((s) => <label key={s} className="flex items-center gap-1"><input type={form.kind === 'min_cover' ? 'radio' : 'checkbox'} name="rule-shift" checked={form.shifts.includes(s)} onChange={() => form.kind === 'min_cover' ? set({ shifts: [s] }) : toggleShift(s)} />{s}</label>)}</div></fieldset>}
      <label className="block text-sm">Note (optional)<input value={form.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} className={field} /></label>
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void run('roster_rule_save', form)} className="rounded-lg bg-[#0b587b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save rule</button><button type="button" onClick={() => setForm(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button></div>
    </div>}
  </div>;
}
