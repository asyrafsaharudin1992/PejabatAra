import { FormEvent, useState } from 'react';
import { Bell, Plus } from 'lucide-react';
import { card } from './AssessmentStaff';
import { Pager, usePaged } from './Pager';
import { dmy, reviewApi } from './lib/performanceReview';
import { malaysiaToday, type ReviewReminder } from './lib/reviewReminders';
import { HRReviewSettings } from './HRReviewSettings';
import type { ReviewSettings } from './lib/reviewSettings';

type Staff = { id: string; fullName: string; employeeCode: string; company: string };
const field = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm';
const blank = () => ({ id: '', employeeId: '', periodLabel: '', dueOn: malaysiaToday(), notes: '' });
const STATUS: Record<ReviewReminder['status'], [string, string]> = {
  overdue: ['Overdue', 'bg-rose-50 text-rose-700'], due: ['Due soon', 'bg-amber-50 text-amber-700'], upcoming: ['Upcoming', 'bg-sky-50 text-sky-700'],
  assigned: ['Assigned', 'bg-violet-50 text-violet-700'], completed: ['Completed', 'bg-emerald-50 text-emerald-700'], cancelled: ['Cancelled', 'bg-slate-100 text-slate-500'],
};
const open = (item: ReviewReminder) => ['overdue', 'due', 'upcoming'].includes(item.status);

export function HRReviewReminders({ reminders, notSetUp, settings, settingsVersion, settingsNotSetUp, staff, onReload, onAssign, onView, onError }: {
  reminders: ReviewReminder[] | null; notSetUp: boolean; settings: ReviewSettings; settingsVersion: string | null; settingsNotSetUp: boolean; staff: Staff[]; onReload: () => Promise<void>;
  onAssign: (item: ReviewReminder) => void; onView: (id: string) => void; onError: (message: string) => void;
}) {
  const [filter, setFilter] = useState('next');
  const [company, setCompany] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ReturnType<typeof blank> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const relevant = (reminders || []).filter((item) => (!company || item.company === company) && `${item.fullName} ${item.employeeCode} ${item.periodLabel} ${item.notes}`.toLowerCase().includes(query.trim().toLowerCase()));
  const shown = relevant.filter((item) => filter === 'next' ? open(item) && item.daysUntil <= 90 : filter === 'overdue' ? item.status === 'overdue' : filter === 'assigned' ? item.status === 'assigned' : filter === 'closed' ? ['completed', 'cancelled'].includes(item.status) : open(item));
  const pages = usePaged(shown, 10, `${filter}:${company}:${query}`);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setNotice('');
    try { await reviewApi('action=hr_reminder_save', draft); setDraft(null); await onReload(); setNotice('Reminder saved for HR.'); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save this reminder.'); }
    finally { setBusy(false); }
  };
  const change = async (id: string, state: string) => {
    setBusy(true); setNotice('');
    try { await reviewApi('action=hr_reminder_state', { id, state }); await onReload(); setNotice(state === 'complete' ? 'Reminder marked complete.' : state === 'cancel' ? 'Reminder cancelled.' : 'Reminder reopened.'); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to update this reminder.'); }
    finally { setBusy(false); }
  };
  return <div id="review-panel-reminders" role="tabpanel" aria-labelledby="review-tab-reminders" className="space-y-5">
    <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
      <div><h3 className="flex items-center gap-2 text-lg font-semibold"><Bell className="h-5 w-5 text-[#0b9aca]" />Assessment reminders</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Plan what HR needs to assess next. Automatic reminders follow each staff member’s join date and the shared review requirements below. Add a reminder for any other follow-up.</p></div>
      <button type="button" disabled={notSetUp || busy} onClick={() => setDraft(blank())} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add reminder</button>
    </section>
    <HRReviewSettings settings={settings} version={settingsVersion} notSetUp={settingsNotSetUp} onReload={onReload} onError={onError} />
    {notSetUp && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Automatic reminders are available. Custom reminders need the review-reminders database migration first.</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[['Overdue', relevant.filter((item) => item.status === 'overdue').length], [`Due within ${settings.leadDays} days`, relevant.filter((item) => open(item) && item.daysUntil >= 0 && item.daysUntil <= settings.leadDays).length], ['Later upcoming', relevant.filter((item) => open(item) && item.daysUntil > settings.leadDays).length]].map(([label, count]) => <div key={label} className={card}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold text-[#0b587b]">{reminders ? count : '…'}</p></div>)}</div>
    {draft && <form onSubmit={(event) => void save(event)} className={`${card} space-y-4`}>
      <h3 className="font-semibold">{draft.id ? 'Edit reminder' : 'New reminder'}</h3>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-600">Staff member<select required value={draft.employeeId} onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })} className={field}><option value="">Choose active staff…</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.company} · {person.employeeCode}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-600">Assessment needed<input required maxLength={40} list="reminder-assessment-types" value={draft.periodLabel} onChange={(event) => setDraft({ ...draft, periodLabel: event.target.value })} placeholder="e.g. PIP follow-up" className={field} /><datalist id="reminder-assessment-types">{['First CA evaluation · 2 weeks', 'Monthly CA evaluation', 'Annual appraisal', 'PIP follow-up'].map((label) => <option key={label} value={label} />)}</datalist></label>
        <label className="block text-sm font-semibold text-slate-600">Due date<input type="date" required value={draft.dueOn} onChange={(event) => setDraft({ ...draft, dueOn: event.target.value })} className={field} /></label>
        <label className="block text-sm font-semibold text-slate-600">Notes<textarea rows={2} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What needs to be assessed?" className={field} /></label>
      </fieldset>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDraft(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save reminder'}</button></div>
    </form>}
    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap gap-3"><input aria-label="Search reminders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff or assessment" className={`${field} !mt-0 min-w-[200px] flex-1`} /><select aria-label="Reminder company" value={company} onChange={(event) => setCompany(event.target.value)} className={`${field} !mt-0 !w-auto`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select><select aria-label="Reminder status" value={filter} onChange={(event) => setFilter(event.target.value)} className={`${field} !mt-0 !w-auto`}><option value="next">Overdue + next 90 days</option><option value="overdue">Overdue</option><option value="all">All upcoming</option><option value="assigned">Assigned</option><option value="closed">Completed / cancelled</option></select><button type="button" disabled={busy} onClick={() => void onReload()} className="px-3 text-sm font-semibold text-[#0b587b]">Refresh</button></div>
      <p className="text-xs leading-5 text-slate-500">Automatic dates cover the previous {settings.lookBackDays} days and the next {settings.lookAheadDays} days. Status follows reviews recorded in AraOffice; earlier assessments may not have been imported. Reminders for inactive staff are hidden.</p>
      {reminders === null ? <p className="text-sm text-slate-500">Loading reminders…</p> : !shown.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No assessments match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="py-3 pr-4">Staff</th><th className="pr-4">Assessment needed</th><th className="pr-4">Due date</th><th className="pr-4">Status</th><th className="text-right">Actions</th></tr></thead><tbody>{pages.rows.map((item) => <tr key={item.id} className="border-b border-slate-100">
        <td className="py-4 pr-4"><p className="font-semibold">{item.fullName}</p><p className="text-xs text-slate-400">{item.company} · {item.employeeCode}</p></td>
        <td className="pr-4"><p className="font-semibold">{item.periodLabel}</p><p className="text-xs text-slate-400">{item.source === 'automatic' ? item.periodLabel === 'Annual appraisal' ? 'From confirmation date' : 'Probation schedule · first 3 months' : 'HR reminder'}</p>{item.notes && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-slate-500">{item.notes}</p>}</td>
        <td className="whitespace-nowrap pr-4">{dmy(item.dueOn)}{open(item) && <p className={`text-xs ${item.daysUntil < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{item.daysUntil < 0 ? `${-item.daysUntil} days overdue` : item.daysUntil === 0 ? 'Today' : `In ${item.daysUntil} days`}</p>}</td>
        <td className="pr-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[item.status][1]}`}>{STATUS[item.status][0]}</span></td>
        <td className="py-3 text-right"><div className="flex flex-wrap justify-end gap-2">{open(item) && <button type="button" onClick={() => onAssign(item)} className="rounded-lg bg-[#0b587b] px-3 py-2 text-xs font-semibold text-white">Assign review</button>}{item.reviewId && <button type="button" onClick={() => onView(item.reviewId!)} className="px-2 py-1 text-xs font-semibold text-[#0b587b]">View review</button>}
          {item.source === 'custom' && open(item) && <><button type="button" disabled={busy} onClick={() => setDraft({ id: item.id, employeeId: item.employeeId, periodLabel: item.periodLabel, dueOn: item.dueOn, notes: item.notes })} className="px-2 py-1 text-xs font-semibold text-slate-500">Edit</button><button type="button" disabled={busy} onClick={() => void change(item.id, 'complete')} className="px-2 py-1 text-xs font-semibold text-emerald-700">Mark complete</button><button type="button" disabled={busy} onClick={() => void change(item.id, 'cancel')} className="px-2 py-1 text-xs font-semibold text-slate-400">Cancel reminder</button></>}
          {item.source === 'custom' && !item.reviewId && ['completed', 'cancelled'].includes(item.status) && <button type="button" disabled={busy} onClick={() => void change(item.id, 'reopen')} className="px-2 py-1 text-xs font-semibold text-[#0b587b]">Reopen</button>}</div></td>
      </tr>)}</tbody></table></div>}
      <Pager page={pages.page} pages={pages.pages} total={pages.total} onPage={pages.setPage} />
    </section>
  </div>;
}
