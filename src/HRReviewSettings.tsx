import { FormEvent, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { card } from './AssessmentStaff';
import { reviewApi } from './lib/performanceReview';
import { normalizeReviewSettings, type ReviewSettings } from './lib/reviewSettings';

const field = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm';
export function HRReviewSettings({ settings, version, notSetUp, onReload, onError }: { settings: ReviewSettings; version: string | null; notSetUp: boolean; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<{ settings: ReviewSettings; version: string | null } | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const update = (change: Partial<ReviewSettings>) => setDraft((current) => current && { ...current, settings: { ...current.settings, ...change } });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return; setBusy(true); setNotice('');
    try { await reviewApi('action=hr_review_settings_save', { settings: normalizeReviewSettings(draft.settings, settings), version: draft.version }); await onReload(); setDraft(null); setNotice('Reminder settings saved.'); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save review settings.'); } finally { setBusy(false); }
  };
  const d = draft?.settings;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Settings2 className="h-5 w-5 text-[#0b9aca]" />Review Settings</h3><p className="mt-1 text-sm text-slate-500">Same assessment policy as the HR Home calendar. Existing review records stay available.</p></div><button type="button" disabled={notSetUp || !version || busy || Boolean(draft)} onClick={() => { setDraft({ settings: structuredClone(settings), version }); setNotice(''); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] disabled:opacity-40">Edit settings</button></div>
    <div className="rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-950"><p><strong>CA probation evaluation:</strong> joining date + 14 days, then monthly, up to 3 months from joining. Requires HR-verified probation and stops immediately when probation ends or the staff member is confirmed.</p><p className="mt-2"><strong>Annual appraisal:</strong> every year from the confirmation date. No separate third-month CA evaluation reminder.</p></div>
    {notSetUp && <p className="text-sm text-amber-700">The review-settings database migration is needed before these preferences can be edited.</p>}
    {!draft && <p className="text-sm text-slate-600">Automatic reminders: {settings.automaticEnabled ? 'On' : 'Off'} · Annual appraisal: {settings.recurringEnabled ? 'On' : 'Off'} · Due-soon warning: {settings.leadDays} days</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {d && <form onSubmit={(event) => void save(event)} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.automaticEnabled} onChange={(e) => update({ automaticEnabled: e.target.checked })} />Enable automatic assessment reminders</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.recurringEnabled} onChange={(e) => update({ recurringEnabled: e.target.checked })} />Enable annual appraisal from confirmation</label><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Due-soon warning (days before)<input required type="number" min="0" max="90" value={d.leadDays} onChange={(e) => update({ leadDays: Number(e.target.value) })} className={field} /></label><label className="text-xs font-semibold text-slate-600">Show overdue from last (days)<input required type="number" min="0" max="3650" value={d.lookBackDays} onChange={(e) => update({ lookBackDays: Number(e.target.value) })} className={field} /></label><label className="text-xs font-semibold text-slate-600">Show upcoming for next (days)<input required type="number" min="30" max="730" value={d.lookAheadDays} onChange={(e) => update({ lookAheadDays: Number(e.target.value) })} className={field} /></label></div></fieldset><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDraft(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save settings'}</button></div></form>}
  </section>;
}
