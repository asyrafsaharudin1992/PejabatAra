import { ChangeEvent, ReactNode, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: the duty roster by month, for staff and for doctors, as a table (one row per person and one column per day)
// or as a calendar. Leave is counted on the days marked as working here; a date with no roster falls back to the
// person's usual working weekdays.
const API = '/api/status?resource=hr';
type Person = { id: string; company: string; code: string; name: string; designation: string };
type Day = { id: string; date: string; shift: string; works: boolean; note: string };

async function api(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const isDoctor = (person: Person) => /\b(DR|DOCTOR)\b/i.test(person.designation);
// "AHMAD SYAFIQ BIN SO'IB" becomes "Syafiq": the first name that is not a common first word.
const shortName = (name: string) => { const words = name.split(/\s+/).filter(Boolean); const word = words.find((item) => !/^(AHMAD|MOHAMAD|MUHAMAD|MUHAMMAD|MOHD|NUR|NURUL|SITI)$/i.test(item)) || words[0] || ''; return word.charAt(0) + word.slice(1).toLowerCase(); };
const isLeave = (day: Day) => !day.works && ['AL', 'UPL', 'MC', 'ML', 'EL'].includes(day.shift);
const isOffice = (shift: string) => ['OH', 'AM-6', 'AM-5'].includes(shift);
// Colour by what the day is: a day shift, a night shift, office hours, a rest day, leave, a public holiday, or not yet scheduled.
const shiftTone = (shift: string) => shift === 'PM' ? 'bg-amber-100 text-amber-900' : isOffice(shift) ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-900';
const cellTone = (day?: Day) => !day ? 'bg-white text-slate-300' : day.works ? shiftTone(day.shift) : isLeave(day) ? 'bg-rose-100 text-rose-800' : day.shift === 'PH' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-400';
const SHIFT_ORDER = ['AM', 'AM-9', 'AM-12', 'OH', 'AM-6', 'AM-5', 'PM'];

// A CSV with the columns company, code, date and shift (the date as 2026-12-01 or 01/12/2026). The server
// saves the KJ names for the SK spellings of clinic assistant shifts.
function parseCsv(text: string) {
  const rows: { company: string; code: string; date: string; shift: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    if (cells.length < 4 || /^company$/i.test(cells[0])) continue;
    const date = /^\d{2}\/\d{2}\/\d{4}$/.test(cells[2]) ? cells[2].split('/').reverse().join('-') : cells[2];
    rows.push({ company: cells[0].toUpperCase(), code: cells[1].toUpperCase(), date, shift: cells[3] });
  }
  return rows;
}

// What each code on the roster means. The KJ names are the standard for staff; doctors use AM, PM and OH.
const STAFF_CODES: [string, string][] = [['AM-9', '9AM – 9PM'], ['AM-12', '12PM – 9PM'], ['PM', '9PM – 9AM (night)'], ['AM-6', '9AM – 6PM'], ['AM-5', 'Office hours, 8AM – 5PM'], ['OFF', 'Off day'], ['REST', 'Rest day']];
const DOCTOR_CODES: [string, string][] = [['AM', 'Day shift'], ['PM', 'Night shift'], ['OH', 'Office hours, 9AM – 6PM'], ['OFF', 'Off day'], ['AL', 'Annual leave']];
const OTHER_CODES: [string, string][] = [['PH', 'Public holiday (admin staff)'], ['NA', 'Not working yet / not applicable'], ['RESIGN', 'Resigned (no schedule after)'], ['AL', 'Annual leave already taken'], ['UPL', 'Unpaid leave already taken'], ['MC', 'Medical leave already taken']];
const OLD_CODES: [string, string][] = [['ASCL1', 'AM-9 (9AM – 9PM)'], ['ASCL2', 'AM-12 (12PM – 9PM)'], ['ASCL3', 'PM (9PM – 9AM, night)'], ['ASCL4', 'AM-6 (9AM – 6PM)'], ['OD', 'OFF (off day)'], ['RD', 'REST (rest day)']];

const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A row of choices where one is lit, like a segmented control.
function Choice<T extends string>({ value, onChange, options, label }: { value: T; onChange: (next: T) => void; options: [T, ReactNode][]; label: string }) {
  return <div role="group" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1">{options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`h-8 rounded-lg px-3.5 text-sm font-semibold transition ${value === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{text}</button>)}</div>;
}

export function HRRoster({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [company, setCompany] = useState('');
  const [group, setGroup] = useState<'staff' | 'doctors'>('staff');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [personId, setPersonId] = useState('');
  const [picked, setPicked] = useState('');
  const [data, setData] = useState<{ people: Person[]; days: Day[] } | null>(null);
  const [notice, setNotice] = useState('');
  const load = () => { setData(null); api(`action=roster&month=${month}`).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => { setData({ people: [], days: [] }); onError(cause.message); }); };
  useEffect(load, [month]);
  useEffect(() => { setPersonId(''); setPicked(''); }, [group, company, month]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setNotice('');
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error('No roster rows found. Use the columns: company, code, date, shift.');
      const result = await api('action=roster_import', { rows });
      if (result.error) throw new Error(result.error);
      setNotice(`Saved ${result.saved} roster days.`); load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to import the roster.'); }
  };

  const count = Number(month.slice(5)), year = Number(month.slice(0, 4));
  const dates = Array.from({ length: new Date(year, count, 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  const people = (data?.people || []).filter((person) => (group === 'doctors') === isDoctor(person)).filter((person) => !company || person.company === company).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
  const byPerson = new Map<string, Map<string, Day>>();
  for (const day of data?.days || []) { if (!byPerson.has(day.id)) byPerson.set(day.id, new Map()); byPerson.get(day.id)!.set(day.date, day); }
  const selected = people.find((person) => person.id === personId);
  const empty = group === 'doctors' ? `No doctor roster for ${monthName(month)} yet. Upload a CSV with the columns company, code, date, shift (AM, PM, OH or OFF).` : `No roster for ${monthName(month)} yet. Upload a CSV with the columns company, code, date, shift (for example KJ, ARA0048, 2026-12-01, PM).`;

  // Calendar: who works which shift on a date (leave listed apart), for everyone shown or one chosen person.
  const onDate = (date: string) => {
    const shifts = new Map<string, Person[]>(); const leave: Person[] = [];
    for (const person of people) {
      const day = byPerson.get(person.id)?.get(date);
      if (!day) continue;
      if (day.works) shifts.set(day.shift, [...(shifts.get(day.shift) || []), person]); else if (isLeave(day)) leave.push(person);
    }
    const rank = (shift: string) => SHIFT_ORDER.includes(shift) ? SHIFT_ORDER.indexOf(shift) : 99;
    return { shifts: [...shifts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])), leave };
  };
  const few = people.length <= 8;
  const lead = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7;
  const detail = picked ? onDate(picked) : null;
  const today = new Date().toLocaleDateString('en-CA');
  const nav = 'grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700';

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className={nav}><ChevronLeft className="h-4 w-4" /></button>
          <h2 className="min-w-[170px] text-center text-xl font-semibold tracking-tight">{monthName(month)}</h2>
          <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className={nav}><ChevronRight className="h-4 w-4" /></button>
          {month !== monthOf(new Date()) && <button onClick={() => setMonth(monthOf(new Date()))} className="ml-1 text-sm font-semibold text-[#0b587b] hover:underline">This month</button>}
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white hover:bg-[#0a4c6a]"><Upload className="h-4 w-4" />Upload roster CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void upload(event)} className="hidden" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-100 pt-4">
        <Choice label="Who" value={group} onChange={setGroup} options={[['staff', 'Staff'], ['doctors', 'Doctors']]} />
        <Choice label="Clinic" value={company} onChange={setCompany} options={[...(view === 'table' ? [['', 'KJ and SK'] as [string, string]] : []), ['KJ', 'KJ'], ['SK', 'SK']]} />
        <Choice label="View" value={view} onChange={(next) => { setView(next); if (next === 'calendar' && !company) setCompany('KJ'); }} options={[['table', 'Table'], ['calendar', 'Calendar']]} />
        {view === 'calendar' && <select value={personId} onChange={(event) => { setPersonId(event.target.value); setPicked(''); }} aria-label="Person" className={field}><option value="">Everyone</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>}
      </div>
    </section>
    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {group === 'doctors' && <p className="px-1 text-xs text-slate-500">Doctors are shown by shift. Locums are not listed because they are not staff.</p>}
    <section className={`${card} overflow-x-auto`}>
      {!data ? <p className="text-sm text-slate-500">Loading…</p> : !people.length ? <p className="text-sm text-slate-500">{empty}</p> : view === 'table' ?
        <table className="border-separate border-spacing-0 text-xs">
          <thead><tr><th className="sticky left-0 z-10 min-w-[210px] bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group === 'doctors' ? 'Doctor' : 'Staff'}</th>{dates.map((date) => { const day = new Date(`${date}T00:00:00`).getDay(); return <th key={date} className={`min-w-[46px] rounded-t-lg px-1 py-2 text-center font-semibold ${date === today ? 'bg-[#0b587b] text-white' : day === 0 || day === 6 ? 'bg-slate-50 text-[#0b587b]' : 'text-slate-500'}`}>{WEEKDAY[day]}<br />{Number(date.slice(8))}</th>; })}</tr></thead>
          <tbody>{people.map((person) => <tr key={person.id}>
            <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-2"><p className="max-w-[200px] truncate text-[13px] font-semibold text-slate-800">{person.name}</p><p className="text-[10px] text-slate-400">{person.company} · {person.code}</p></td>
            {dates.map((date) => { const day = byPerson.get(person.id)?.get(date); return <td key={date} className="border-t border-slate-100 p-0.5"><div title={day ? `${person.name} · ${date} · ${day.shift}${day.works ? '' : ' (not a working day)'}` : 'No roster'} className={`grid h-9 place-items-center rounded-md px-0.5 text-[11px] font-bold ${cellTone(day)}`}>{day ? day.shift : '·'}</div></td>; })}
          </tr>)}</tbody>
        </table> :
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 gap-2 pb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">{MONDAY_FIRST.map((name) => <p key={name}>{name}</p>)}</div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: lead }, (_, index) => <div key={`lead-${index}`} />)}
            {dates.map((date) => {
              const here = onDate(date); const own = selected ? byPerson.get(selected.id)?.get(date) : undefined; const weekend = [0, 6].includes(new Date(`${date}T00:00:00`).getDay());
              return <button key={date} onClick={() => setPicked(picked === date ? '' : date)} className={`min-h-[124px] rounded-2xl border p-2 text-left align-top transition ${picked === date ? 'border-[#0b587b] ring-2 ring-[#0b587b]/20' : date === today ? 'border-[#0b587b]/50' : 'border-slate-200'} ${weekend ? 'bg-slate-50' : 'bg-white'} hover:border-[#0b587b]/40`}>
                <span className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-bold ${date === today ? 'bg-[#0b587b] text-white' : 'text-slate-500'}`}>{Number(date.slice(8))}</span>
                {selected ? <p className={`mt-3 grid h-10 place-items-center rounded-lg text-sm font-bold ${cellTone(own)}`}>{own ? own.shift : '·'}</p> : <div className="mt-1.5 space-y-1">
                  {here.shifts.map(([shift, who]) => <p key={shift} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${shiftTone(shift)}`}><span className="font-bold">{shift}</span> {few ? who.map((person) => shortName(person.name)).join(', ') : `× ${who.length}`}</p>)}
                  {here.leave.length > 0 && <p className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-rose-800"><span className="font-bold">Leave</span> {few ? here.leave.map((person) => shortName(person.name)).join(', ') : `× ${here.leave.length}`}</p>}
                </div>}
              </button>;
            })}
          </div>
          {detail && !selected && <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm">
            <p className="font-semibold">{new Date(`${picked}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            {!detail.shifts.length && !detail.leave.length ? <p className="mt-1 text-slate-500">Nobody on the roster.</p> : <ul className="mt-3 space-y-2">
              {detail.shifts.map(([shift, who]) => <li key={shift} className="flex items-baseline gap-3"><span className={`w-14 shrink-0 rounded-md px-1 py-0.5 text-center text-xs font-bold ${shiftTone(shift)}`}>{shift}</span><span>{who.map((person) => person.name).join(', ')}</span></li>)}
              {detail.leave.length > 0 && <li className="flex items-baseline gap-3"><span className="w-14 shrink-0 rounded-md bg-rose-100 px-1 py-0.5 text-center text-xs font-bold text-rose-800">Leave</span><span>{detail.leave.map((person) => person.name).join(', ')}</span></li>}
            </ul>}
          </div>}
        </div>}
    </section>
    <section className={`${card} space-y-4`}>
      <h3 className="font-semibold">What the codes mean</h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{group === 'doctors' ? 'Doctor shifts' : 'Clinic assistant shifts'}</p>
          <ul className="mt-2 space-y-1.5">{(group === 'doctors' ? DOCTOR_CODES : STAFF_CODES).map(([code, meaning]) => <li key={code} className="flex items-baseline gap-3 text-sm"><span className="w-20 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{code}</span><span className="text-slate-600">{meaning}</span></li>)}</ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Other days</p>
          <ul className="mt-2 space-y-1.5">{OTHER_CODES.map(([code, meaning]) => <li key={code} className="flex items-baseline gap-3 text-sm"><span className="w-20 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{code}</span><span className="text-slate-600">{meaning}</span></li>)}</ul>
        </div>
      </div>
      <p className="text-xs text-slate-500">Leave is counted only on the days that work. OFF, REST, OD, RD, NA, PH, RESIGN and leave already taken are not working days; a date with no roster uses the person's usual working weekdays. In an uploaded CSV, the SK spellings AM, AM 9 and AM 5 for clinic assistants are saved as AM-9, AM-12 and AM-5.</p>
      <details><summary className="cursor-pointer text-xs font-semibold text-slate-500">Old codes (October and earlier, from Infotech)</summary>
        <ul className="mt-2 space-y-1.5">{OLD_CODES.map(([code, meaning]) => <li key={code} className="flex items-baseline gap-3 text-sm"><span className="w-20 shrink-0 font-mono text-xs font-bold text-slate-500">{code}</span><span className="text-slate-600">{meaning}</span></li>)}</ul>
      </details>
    </section>
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-emerald-100" />Day shift</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-100" />Night shift (PM)</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-sky-100" />Office hours</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-slate-100" />OFF / REST / not started</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-rose-100" />Leave already taken</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-violet-100" />Public holiday</span></p>
  </div>;
}
