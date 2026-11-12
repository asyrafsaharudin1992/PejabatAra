import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { useMalaysiaToday } from './lib/useMalaysiaToday';
import { calendarEventOnDate, calendarEventOverdue, isMonthlyHrTask, shiftCalendarDays, type CalendarCategory, type CalendarEvent, type CalendarRule } from './lib/hrCalendar';

// Office COO > Home: the COO's own calendar and reminders (kept apart from HR's). Add a reminder once or repeating, and tick it Done.
// A reminder that repeats monthly can also be added as a monthly task, listed until it is ticked Done.
type Data = { events: CalendarEvent[]; config: { rules: CalendarRule[] }; configVersion: string | null; stateVersion: string | null };
// The colour of a reminder is chosen when it is added; it is kept as the reminder's category, so the calendar colours it the same way as HR's.
const COLORS: [CalendarCategory, string, string, string][] = [['other', 'Grey', '#F1F5F9', '#475569'], ['statutory', 'Amber', '#FEF3C7', '#92400E'], ['forecast', 'Teal', '#CCFBF1', '#115E59'], ['payroll', 'Blue', '#DBEAFE', '#1E40AF'], ['evaluation', 'Purple', '#F3E8FF', '#6B21A8'], ['review', 'Indigo', '#E0E7FF', '#3730A3'], ['birthday', 'Pink', '#FCE7F3', '#9D174D'], ['sotm', 'Gold', '#FFF1D6', '#B57A00']];
const tone = (category: string): [string, string] => { const found = COLORS.find((item) => item[0] === category) || COLORS[0]; return [found[2], found[3]]; };
const field = 'mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-40';
const primaryButton = button.replace('bg-white', 'bg-[#0b587b]').replace('text-[#0b587b]', 'text-white');
const dayLabel = (date: string) => new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00+08:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
const shiftMonth = (month: string, amount: number) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 7); };
const blankRule = (date: string): CalendarRule => ({ id: crypto.randomUUID(), title: '', category: 'other', employeeId: '', company: '', anchor: 'date', date, offsetMonths: 0, offsetDays: 0, repeat: 'none', every: 1, notes: '', enabled: true });
async function api(action: string, month: string, body?: unknown): Promise<any> {
  const response = await officeFetch(`/api/status?resource=coo&action=${action}&month=${month}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body as object, month }) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export default function COOCalendar() {
  const today = useMalaysiaToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<CalendarRule | null>(null);
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await api('calendar_month', month)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the calendar.'); } finally { setLoading(false); } }, [month]);
  useEffect(() => { void load(); }, [load]);
  const go = (next: string) => { setMonth(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`); };
  const open = (rule?: CalendarRule) => { setDraft(rule ? { ...rule } : blankRule(selected)); setEditVersion(data?.configVersion || null); setFormError(''); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setFormError('');
    try { await api('calendar_rule_save', month, { rule: draft, version: editVersion }); setDraft(null); await load(); } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };
  const remove = async (rule: CalendarRule) => {
    if (!window.confirm(`Delete the reminder "${rule.title}"? Every date of it goes.`)) return;
    setBusy(true);
    try { await api('calendar_rule_delete', month, { id: rule.id, version: data?.configVersion || null }); setDraft(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete.'); } finally { setBusy(false); }
  };
  const mark = async (event: CalendarEvent, state: 'done' | 'open') => {
    setBusy(true);
    try { await api('calendar_state', month, { id: event.id, state, version: data?.stateVersion || null }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); await load(); } finally { setBusy(false); }
  };
  const events = data?.events || [];
  const monthly = events.filter(isMonthlyHrTask), others = events.filter((event) => !isMonthlyHrTask(event));
  // A monthly task is shown on its due date until it is ticked Done, then on the day it was completed.
  const showsOn = (event: CalendarEvent, date: string) => isMonthlyHrTask(event) && event.state !== 'done' ? event.date === date : calendarEventOnDate(event, date);
  const day = others.filter((event) => calendarEventOnDate(event, selected));
  // The grid starts on Monday.
  const first = `${month}-01`, lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7, cells = Array.from({ length: 42 }, (_, index) => shiftCalendarDays(first, index - lead));
  const rule = (event: CalendarEvent) => data?.config.rules.find((item) => item.id === event.ruleId);
  const card = (event: CalendarEvent) => <article key={event.id} className={`rounded-lg border bg-white p-2.5 ${event.state === 'done' ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
    <div className="flex items-start gap-2"><input type="checkbox" aria-label={`Done: ${event.title}`} checked={event.state === 'done'} disabled={busy} onChange={(e) => void mark(event, e.target.checked ? 'done' : 'open')} className="mt-1" />
      <span aria-hidden="true" className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tone(event.category)[1] }} />
      <div className="min-w-0 flex-1"><p className={`text-sm font-semibold ${event.state === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{event.title}</p><p className="text-xs text-slate-500">{dayLabel(event.date)}{event.notes ? ` · ${event.notes}` : ''}</p></div>
      {rule(event) && <button type="button" onClick={() => open(rule(event))} className="text-xs font-semibold text-[#0b587b] hover:underline">Edit</button>}</div></article>;

  return <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold tracking-tight">My calendar &amp; reminders</h3><p className="mt-1 text-sm text-slate-500">Your own reminders. Add one for a date, repeat it, and tick it Done.</p></div><button type="button" disabled={loading || busy} onClick={() => open()} className={primaryButton}><Plus size={16} />Add reminder</button></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy || loading} aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))} className={button}><ChevronLeft size={17} /></button><h4 className="min-w-[170px] text-center text-lg font-semibold">{monthLabel(month)}</h4><button type="button" disabled={busy || loading} aria-label="Next month" onClick={() => go(shiftMonth(month, 1))} className={button}><ChevronRight size={17} /></button>{month !== today.slice(0, 7) && <button type="button" onClick={() => go(today.slice(0, 7))} className="text-sm font-semibold text-[#0b587b] hover:underline">This month</button>}</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!loading && <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800">{events.filter((event) => event.state !== 'done').length} pending</span><span className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">{events.filter((event) => calendarEventOverdue(event, today)).length} overdue</span><span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">{events.filter((event) => event.state === 'done').length} done</span></div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
      <div className="min-w-0 overflow-x-auto"><div className="min-w-[480px]">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <p key={name} className="py-1">{name}</p>)}</div>
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border-l border-t border-slate-200">{cells.map((date) => {
          const current = date.slice(0, 7) === month, here = current ? events.filter((event) => showsOn(event, date)) : [];
          return <button key={date} type="button" disabled={!current} onClick={() => setSelected(date)} aria-pressed={date === selected} className={`flex min-h-[72px] flex-col items-stretch border-b border-r border-slate-200 p-1 text-left align-top ${!current ? 'bg-slate-50 text-slate-300' : date === selected ? 'bg-sky-50 ring-2 ring-inset ring-[#0b587b]' : 'bg-white hover:bg-slate-50'}`}>
            <span className={`mb-0.5 text-xs font-semibold ${date === today ? 'grid h-5 w-5 place-items-center rounded-full bg-[#0b587b] text-white' : ''}`}>{Number(date.slice(8))}</span>
            {here.slice(0, 2).map((event) => <span key={event.id} title={event.title} className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold ${event.state === 'done' ? 'line-through opacity-60' : ''}`} style={{ backgroundColor: tone(event.category)[0], color: tone(event.category)[1] }}>{event.state === 'done' ? '✓ ' : ''}{event.title}</span>)}{here.length > 2 && <span className="text-[10px] text-slate-500">+{here.length - 2} more</span>}</button>;
        })}</div></div></div>
      <aside className="min-w-0 space-y-3 rounded-xl bg-slate-50 p-3">
        {monthly.length > 0 && <section className="space-y-1.5 border-b border-slate-200 pb-3"><h4 className="text-sm font-semibold">Monthly tasks</h4><p className="text-[11px] text-slate-500">Tick Done when complete.</p>{monthly.map(card)}</section>}
        <section className="space-y-1.5"><h4 className="text-sm font-semibold">{dayLabel(selected)}</h4>{loading ? <p className="text-xs text-slate-500">Loading…</p> : !day.length ? <p className="text-xs text-slate-500">Nothing for this day. Choose a day and press Add reminder.</p> : day.map(card)}</section>
      </aside></div>
    {draft && <dialog ref={(node) => { if (node && !node.open) node.showModal(); }} onCancel={(e) => { if (busy) e.preventDefault(); else setDraft(null); }} aria-label="Reminder" className="m-auto max-h-[88vh] w-[calc(100%_-_32px)] max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-[#14233b] shadow-2xl backdrop:bg-slate-950/50">
      <form onSubmit={(e) => void save(e)} className="space-y-4"><h4 className="text-lg font-semibold">{data?.config.rules.some((item) => item.id === draft.id) ? 'Edit reminder' : 'Add reminder'}</h4>
        <label className="block text-sm font-semibold">Title<input required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={field} placeholder="e.g. Review the monthly roster" /></label>
        <fieldset className="block text-sm font-semibold"><legend>Colour</legend><div className="mt-1.5 flex flex-wrap gap-2">{COLORS.map(([key, name, bg, fg]) => <button key={key} type="button" aria-label={name} aria-pressed={draft.category === key} title={name} onClick={() => setDraft({ ...draft, category: key })} className={`grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold ${draft.category === key ? 'border-[#0b587b] ring-2 ring-[#0b587b]/25' : 'border-white ring-1 ring-slate-200'}`} style={{ backgroundColor: bg, color: fg }}>{draft.category === key ? '✓' : ''}</button>)}</div></fieldset>
        {draft.repeat === 'monthly' ? <label className="block text-sm font-semibold">Due on day<span className="mt-1.5 flex items-center gap-2 font-normal"><input required type="number" min={1} max={28} value={Number(draft.date.slice(8)) || 1} onChange={(e) => setDraft({ ...draft, date: `${draft.date.slice(0, 8)}${String(Math.min(28, Math.max(1, Number(e.target.value) || 1))).padStart(2, '0')}` })} className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-3 text-center text-sm font-semibold" />of every month</span><span className="mt-1 block text-xs font-normal text-slate-500">It is due on this day each month (1 to 28).</span></label> : <label className="block text-sm font-semibold">Due date<input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={field} /></label>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Repeat<select value={draft.repeat} onChange={(e) => setDraft({ ...draft, repeat: e.target.value as CalendarRule['repeat'], ...(e.target.value !== 'monthly' ? { monthlyTask: false } : { date: `${draft.date.slice(0, 8)}${String(Math.min(28, Number(draft.date.slice(8)) || 1)).padStart(2, '0')}` }) })} className={field}><option value="none">Once</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          {draft.repeat !== 'none' && <label className="text-sm font-semibold">Every {draft.repeat === 'monthly' ? 'month(s)' : 'year(s)'}<input required type="number" min={1} max={24} value={draft.every} onChange={(e) => setDraft({ ...draft, every: Number(e.target.value) })} className={field} /></label>}</div>
        {draft.repeat === 'monthly' && <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.monthlyTask === true} onChange={(e) => setDraft({ ...draft, monthlyTask: e.target.checked })} /><span><strong>Add as a monthly task</strong><br /><span className="text-xs text-slate-600">It is listed under Monthly tasks until ticked Done, instead of only on its date.</span></span></label>}
        <label className="block text-sm font-semibold">Notes (optional)<textarea maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={`${field} min-h-20`} /></label>
        {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{formError}</p>}
        <div className="flex justify-end gap-2">{data?.config.rules.some((item) => item.id === draft.id) && <button type="button" disabled={busy} onClick={() => void remove(draft)} className="mr-auto inline-flex items-center gap-1 text-sm font-semibold text-rose-700"><Trash2 className="h-4 w-4" />Delete</button>}<button type="button" disabled={busy} onClick={() => setDraft(null)} className={button}>Cancel</button><button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving…' : 'Save reminder'}</button></div></form></dialog>}
  </section>;
}
