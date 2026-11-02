import { FormEvent, useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { card } from './AssessmentStaff';
import { reviewApi } from './lib/performanceReview';
import { normalizeReviewSettings, type ReviewSettings } from './lib/reviewSettings';

const field = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm';
export function HRReviewSettings({ settings, version, notSetUp, onReload, onError }: { settings: ReviewSettings; version: string | null; notSetUp: boolean; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<{ settings: ReviewSettings; version: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const update = (change: Partial<ReviewSettings>) => setDraft((current) => current && { ...current, settings: { ...current.settings, ...change } });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setNotice('');
    try {
      const next = normalizeReviewSettings(draft.settings, settings);
      await reviewApi('action=hr_review_settings_save', { settings: next, version: draft.version });
      await onReload(); setDraft(null); setNotice('Review requirements saved. Automatic reminders now follow these settings.');
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save review settings.'); }
    finally { setBusy(false); }
  };
  const d = draft?.settings;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Settings2 className="h-5 w-5 text-[#0b9aca]" />Review Settings</h3><p className="mt-1 text-sm text-slate-500">Shared requirements for active staff in KJ and SK. Changes recalculate automatic reminders; existing reviews stay on record.</p></div><button type="button" disabled={notSetUp || !version || busy || Boolean(draft)} onClick={() => { setDraft({ settings: structuredClone(settings), version }); setNotice(''); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] disabled:opacity-40">Edit settings</button></div>
    {notSetUp && <p className="text-sm text-amber-700">The review-settings database migration is needed before these requirements can be edited.</p>}
    {!draft && <p className="text-sm text-slate-600">{settings.automaticEnabled ? `${settings.milestones.filter((rule) => rule.enabled).map((rule) => `${rule.label} (month ${rule.months})`).join(' · ') || 'No one-off milestones'}${settings.recurringEnabled ? ` · ${settings.recurringLabel} from month ${settings.recurringStartMonths}, every ${settings.recurringEveryMonths} months` : ''}` : 'Automatic reminders are switched off.'} · Due-soon warning: {settings.leadDays} days</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {d && <form onSubmit={(event) => void save(event)} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.automaticEnabled} onChange={(event) => update({ automaticEnabled: event.target.checked })} />Enable automatic assessment reminders</label>
        <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">One-off milestones after joining</h4><button type="button" disabled={d.milestones.length >= 24} onClick={() => update({ milestones: [...d.milestones, { id: crypto.randomUUID(), label: '', months: 1, enabled: true }] })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b]"><Plus className="h-4 w-4" />Add milestone</button></div>
          {d.milestones.map((rule, index) => <div key={rule.id} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[auto_1fr_160px_auto]">
            <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={rule.enabled} onChange={(event) => update({ milestones: d.milestones.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item) })} />Enabled</label>
            <label className="text-xs font-semibold text-slate-600">Assessment name<input required maxLength={40} value={rule.label} onChange={(event) => update({ milestones: d.milestones.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} className={field} /></label>
            <label className="text-xs font-semibold text-slate-600">Months after joining<input required type="number" min="1" max="120" step="1" value={rule.months} onChange={(event) => update({ milestones: d.milestones.map((item, i) => i === index ? { ...item, months: Number(event.target.value) } : item) })} className={field} /></label>
            <button type="button" onClick={() => update({ milestones: d.milestones.filter((_, i) => i !== index) })} aria-label={`Remove ${rule.label || 'new milestone'}`} className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
          </div>)}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 p-4"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.recurringEnabled} onChange={(event) => update({ recurringEnabled: event.target.checked })} />Enable recurring reviews</label><div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Assessment name<input required maxLength={40} value={d.recurringLabel} onChange={(event) => update({ recurringLabel: event.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-600">First review after joining (months)<input required type="number" min="1" max="120" value={d.recurringStartMonths} onChange={(event) => update({ recurringStartMonths: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-600">Repeat every (months)<input required type="number" min="1" max="120" value={d.recurringEveryMonths} onChange={(event) => update({ recurringEveryMonths: Number(event.target.value) })} className={field} /></label>
        </div></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Due-soon warning (days before)<input required type="number" min="0" max="90" value={d.leadDays} onChange={(event) => update({ leadDays: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-600">Show overdue from last (days)<input required type="number" min="0" max="3650" value={d.lookBackDays} onChange={(event) => update({ lookBackDays: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-600">Show upcoming for next (days)<input required type="number" min="30" max="730" value={d.lookAheadDays} onChange={(event) => update({ lookAheadDays: Number(event.target.value) })} className={field} /></label>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDraft(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>}
  </section>;
}
