import { useEffect, useState } from 'react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR, Leave > Company policy > GCR: the Gantian Cuti Rehat rules (how much of the eligible leave must be used, the most days that can be paid, and
// how many days each staff category can carry forward). HR edits them here; Year End and the GCR report follow the saved numbers straight away.
type Settings = { minUsedPercent: number; maxDays: number; carry: { admin: number; clinical: number; parttime: number } };
const DEFAULT: Settings = { minUsedPercent: 50, maxDays: 4, carry: { admin: 25, clinical: 20, parttime: 20 } };
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
export function HRLeaveGcrRules({ onError }: { onError: (message: string) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ minUsedPercent: '50', maxDays: '4', carryAdmin: '25', carryClinical: '20', carryParttime: '20' });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const fill = (s: Settings) => setForm({ minUsedPercent: String(s.minUsedPercent), maxDays: String(s.maxDays), carryAdmin: String(s.carry.admin), carryClinical: String(s.carry.clinical), carryParttime: String(s.carry.parttime) });
  useEffect(() => { call('action=leave_gcr_settings').then((result) => { setSettings(result.settings); fill(result.settings); }).catch((cause: Error) => { setSettings(DEFAULT); onError(cause.message); }); }, []);
  const save = async () => {
    if (!window.confirm('Save the GCR rules? Year End and the GCR report use them straight away. Nobody\'s balance changes by itself.')) return;
    setSaving(true);
    try {
      await call('action=leave_gcr_settings_save', { minUsedPercent: Number(form.minUsedPercent), maxDays: Number(form.maxDays), carryAdmin: Number(form.carryAdmin), carryClinical: Number(form.carryClinical), carryParttime: Number(form.carryParttime) });
      const next: Settings = { minUsedPercent: Number(form.minUsedPercent), maxDays: Number(form.maxDays), carry: { admin: Number(form.carryAdmin), clinical: Number(form.carryClinical), parttime: Number(form.carryParttime) } };
      setSettings(next); setEditing(false); setNotice('GCR rules saved. The GCR report and Year End now use them.');
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the rules.'); }
    setSaving(false);
  };
  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>;
  const input = (key: keyof typeof form, label: string, unit: string, max: number, step = 1) => <label className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">{label}
    <span className="mt-1 block">{editing ? <input type="number" min={0} max={max} step={step} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-[#0b587b]" /> : <span className="text-sm font-semibold text-[#0b587b]">{form[key]}</span>} <span className="font-normal text-slate-400">{unit}</span></span></label>;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">GCR rules (Gantian Cuti Rehat)</h3><p className="mt-1 max-w-3xl text-sm text-slate-500">Used at Year End and in the GCR report (Leave &gt; Reports &gt; GCR). Credit leave is used first and burns on 31 December if unused. Staff who used at least the set share of their eligible days may choose to be paid for the unused days, up to the most days set. What is left carries forward, up to the limit for the staff category.</p></div>
      <div className="flex gap-2">{editing
        ? <><button onClick={() => { setEditing(false); fill(settings); }} disabled={saving} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => void save()} disabled={saving} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save rules'}</button></>
        : <button onClick={() => { setEditing(true); setNotice(''); }} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white">Edit rules</button>}</div>
    </div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{input('minUsedPercent', 'Eligible leave to be used', '%', 100)}{input('maxDays', 'Most days that can be paid', 'days', 60, 0.5)}</div>
    <div className="grid gap-3 sm:grid-cols-3">{input('carryAdmin', 'Carry limit: Administrative officer', 'days', 366)}{input('carryClinical', 'Carry limit: Doctor / clinic assistant (permanent)', 'days', 366)}{input('carryParttime', 'Carry limit: Part-time', 'days', 366)}</div>
    <p className="text-xs text-slate-400">Brought-forward days not used by the BF expiry date set at Year End are forfeited. HR can also set a carry-forward figure by hand for one person at Year End, with the reason.</p>
  </section>;
}
