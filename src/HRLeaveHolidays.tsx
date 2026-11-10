import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: the public holidays of each holiday group. HR adjusts them here (for example a replacement day when a holiday
// falls on a Sunday). Each person's group is set in HR > Profiles. SG-MNG and MLHL are off on their holidays in Attendance
// unless the duty roster says they work; SG-OPS follows the duty roster, and its holidays only keep leave days from counting.
type Holiday = { group: string; date: string; name: string };
const GROUPS: [string, string][] = [['SG-MNG', 'SG-MNG · Selangor management (office)'], ['SG-OPS', 'SG-OPS · Selangor operations'], ['MLHL', 'MLHL · Malaysia holiday']];
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pretty = (date: string) => { const d = new Date(`${date}T00:00:00Z`); return `${WEEKDAY[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

export function HRLeaveHolidays({ onError }: { onError: (message: string) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [group, setGroup] = useState('SG-MNG');
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => { call('action=holidays').then((result) => setRows(result.holidays || [])).catch((cause) => { setRows([]); onError(cause instanceof Error ? cause.message : 'Unable to load the holidays.'); }); };
  useEffect(load, []);
  const shown = (rows || []).filter((row) => row.group === group && row.date.startsWith(String(year)));
  const act = async (query: string, body: unknown) => { setBusy(true); try { await call(query, body); load(); return true; } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; } finally { setBusy(false); } };
  const add = async () => { if (await act('action=holiday_save', { group, date, name })) { setDate(''); setName(''); } };
  const remove = (row: Holiday) => { if (window.confirm(`Remove ${row.name} (${pretty(row.date)}) from ${row.group}?`)) void act('action=holiday_delete', { group: row.group, date: row.date }); };
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';

  return <section className={`${card} space-y-4`}>
    <div><h3 className="text-lg font-semibold">Public holidays</h3><p className="mt-1 text-sm text-slate-500">Add a replacement day or any extra holiday here. Each person’s group is set in HR &gt; Profiles. Management (SG-MNG) and MLHL are off on these days in Attendance unless the duty roster says they work; SG-OPS follows the duty roster, and its holidays only stop leave days from counting.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Holiday group" value={group} onChange={(event) => setGroup(event.target.value)} className={field}>{GROUPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Year" value={year} onChange={(event) => setYear(Number(event.target.value))} className={field}>{[year - 1, year, year + 1].filter((value, index, list) => list.indexOf(value) === index).sort().map((value) => <option key={value} value={value}>{value}</option>)}</select>
    </div>
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-[#f4fafd] p-3">
      <label className="text-xs font-semibold text-slate-500">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="min-w-[14rem] flex-1 text-xs font-semibold text-slate-500">Holiday name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="e.g. Cuti ganti Hari Deepavali" className={`${field} mt-1 block w-full`} /></label>
      <button type="button" onClick={() => void add()} disabled={busy || !date || !name.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add to {group}</button>
    </div>
    {rows === null ? <p className="text-sm text-slate-500">Loading…</p> : shown.length === 0 ? <p className="text-sm text-slate-500">No holidays for {group} in {year}.</p> : <ul className="divide-y divide-slate-100">{shown.map((row) => <li key={`${row.group}|${row.date}`} className="flex items-center gap-3 py-2.5 text-sm"><span className="w-36 shrink-0 font-semibold text-slate-700">{pretty(row.date)}</span><span className="min-w-0 flex-1 text-slate-600">{row.name}</span><button type="button" onClick={() => remove(row)} disabled={busy} aria-label={`Remove ${row.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></li>)}</ul>}
  </section>;
}
