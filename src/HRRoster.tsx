import { ChangeEvent, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: the duty roster by month, one row per person and one column per day. Leave is counted on the days
// marked as working here; a date with no roster falls back to the person's usual working weekdays.
const API = '/api/status?resource=hr';
type Person = { id: string; company: string; code: string; name: string };
type Day = { id: string; date: string; shift: string; works: boolean; note: string };

async function api(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Colour by what the day is: a shift, a rest day, or leave / public holiday / not yet started.
const cellTone = (day?: Day) => !day ? 'bg-white text-slate-300' : day.works ? (day.shift.startsWith('PM') ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900') : ['AL', 'UPL', 'MC', 'ML', 'EL'].includes(day.shift) ? 'bg-rose-100 text-rose-800' : day.shift === 'PH' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-400';

// A CSV with the columns company, code, date and shift (the date as 2026-12-01 or 01/12/2026).
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

// What each code on the roster means. October and earlier carry the Infotech codes; from November the monthly duty
// roster codes are used (KJ writes AM-9, AM-12 and AM-5; SK writes AM, AM 9 and AM 5 for the same shifts).
const CODES: { title: string; note?: string; items: [string, string][] }[] = [
  { title: 'Clinic assistant shifts, October and earlier (Infotech)', items: [['ASCL1', '9AM – 9PM'], ['ASCL2', '12PM – 9PM'], ['ASCL3', '9PM – 9AM (night)'], ['ASCL4', '9AM – 6PM'], ['OD', 'Off day'], ['RD', 'Rest day']] },
  { title: 'Clinic assistant shifts, November onward (duty roster)', note: 'SK writes AM for AM-9 and AM 9 for AM-12.', items: [['AM-9 / AM', '9AM – 9PM'], ['AM-12 / AM 9', '12PM – 9PM'], ['PM', '9PM – 9AM (night)'], ['AM-6', '9AM – 6PM'], ['OFF', 'Off day'], ['REST', 'Rest day']] },
  { title: 'Office hours and other days', items: [['AM-5 / AM 5', 'Office hours, 8AM – 5PM'], ['PH', 'Public holiday (admin staff)'], ['NA', 'Not working yet / not applicable'], ['RESIGN', 'Resigned (no schedule after)'], ['AL', 'Annual leave already taken'], ['UPL', 'Unpaid leave already taken'], ['MC', 'Medical leave already taken']] },
];

export function HRRoster({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [company, setCompany] = useState('');
  const [data, setData] = useState<{ people: Person[]; days: Day[] } | null>(null);
  const [notice, setNotice] = useState('');
  const load = () => { setData(null); api(`action=roster&month=${month}`).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => { setData({ people: [], days: [] }); onError(cause.message); }); };
  useEffect(load, [month]);

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
  const people = (data?.people || []).filter((person) => !company || person.company === company).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
  const byPerson = new Map<string, Map<string, Day>>();
  for (const day of data?.days || []) { if (!byPerson.has(day.id)) byPerson.set(day.id, new Map()); byPerson.get(day.id)!.set(day.date, day); }
  const buttons = 'grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className={buttons}><ChevronLeft className="h-4 w-4" /></button>
      <h2 className="min-w-[150px] text-center text-lg font-semibold">{monthName(month)}</h2>
      <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className={buttons}><ChevronRight className="h-4 w-4" /></button>
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <label className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white hover:bg-[#0a4c6a]"><Upload className="h-4 w-4" />Upload roster CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void upload(event)} className="hidden" /></label>
    </section>
    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <section className={`${card} overflow-x-auto`}>
      {!data ? <p className="text-sm text-slate-500">Loading…</p> : !people.length ? <p className="text-sm text-slate-500">No roster for {monthName(month)} yet. Upload a CSV with the columns company, code, date, shift (for example KJ, ARA0048, 2026-12-01, PM).</p> :
        <table className="border-separate border-spacing-0 text-xs">
          <thead><tr><th className="sticky left-0 z-10 min-w-[190px] bg-white px-3 py-2 text-left font-semibold text-slate-500">Staff</th>{dates.map((date) => { const day = new Date(`${date}T00:00:00`).getDay(); return <th key={date} className={`min-w-[44px] px-1 py-2 text-center font-semibold ${day === 0 || day === 6 ? 'text-[#0b587b]' : 'text-slate-500'}`}>{WEEKDAY[day]}<br />{Number(date.slice(8))}</th>; })}</tr></thead>
          <tbody>{people.map((person) => <tr key={person.id}>
            <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-1.5"><p className="max-w-[180px] truncate font-semibold text-slate-800">{person.name}</p><p className="text-[10px] text-slate-400">{person.code}</p></td>
            {dates.map((date) => { const day = byPerson.get(person.id)?.get(date); return <td key={date} className="border-t border-slate-100 p-0.5"><div title={day ? `${person.name} · ${date} · ${day.shift}${day.works ? '' : ' (not a working day)'}` : 'No roster'} className={`grid h-8 place-items-center rounded-md px-0.5 text-[10px] font-bold ${cellTone(day)}`}>{day ? day.shift : '·'}</div></td>; })}
          </tr>)}</tbody>
        </table>}
    </section>
    <section className={`${card} space-y-4`}>
      <h3 className="font-semibold">What the codes mean</h3>
      <div className="grid gap-5 lg:grid-cols-3">{CODES.map((group) => <div key={group.title}>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{group.title}</p>
        <ul className="mt-2 space-y-1.5">{group.items.map(([code, meaning]) => <li key={code} className="flex items-baseline gap-3 text-sm"><span className="w-24 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{code}</span><span className="text-slate-600">{meaning}</span></li>)}</ul>
        {group.note && <p className="mt-2 text-xs text-slate-400">{group.note}</p>}
      </div>)}</div>
      <p className="text-xs text-slate-500">Leave is counted only on the days that work. OFF, REST, OD, RD, NA, PH, RESIGN and leave already taken are not working days; a date with no roster uses the person's usual working weekdays.</p>
    </section>
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-emerald-100" />Morning / day shift</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-100" />PM (9PM–9AM)</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-slate-100" />OFF / REST / not started</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-rose-100" />Leave already taken</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-violet-100" />Public holiday</span><span>Leave is counted only on the working days shown here. Days without a roster use the usual weekdays.</span></p>
  </div>;
}
