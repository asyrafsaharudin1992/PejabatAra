import { rosterShiftColor } from './lib/rosterColors';
import { newCode } from './lib/shiftCodes';

// The Monthly Roster report in HR's usual layout (like the Excel duty rosters for Kajang and Seri Kembangan): the title, a grid with one row for each day and one column for each
// person (the roster code and the hours of that day), a HOURS/WEEKS row after every Sunday, and on the right the code list, the public holidays, the staff leave requests,
// resignations and the approved overtime. The codes are AraOffice's codes. One page for each company.
import { leaveNotInNotes, noteLines } from './lib/rosterNotes';
export type DutyData = {
  title: string; company: string; monthLabel: string;
  staff: { id: string; name: string }[];
  dates: string[];
  shift: Record<string, string>;           // `${id}|${date}` -> roster code
  notes: Record<string, string>;           // `${id}|${date}` -> note
  holidays: { date: string; name: string }[];
  requests: { name: string; dates: string[] }[];
  rosterNotes?: { request: string; remarks: string };   // typed (or read from the roster PDF) Request staff and Remarks for this clinic and month
  resigns: { name: string; date: string }[];
  overtime: { name: string; date: string; text: string }[];
  signer: { name: string; title: string };
  version?: 'original' | 'current';          // from December 2026: the version made at the start of the month, or the current one with its changes
  savedAt?: string;
  changes?: { at: string; by: string; name: string; staffId: string; date: string; from: string; to: string }[];
  style?: 'araoffice';                      // the clinic assistants' roster in AraOffice's own design (staff rows, day columns)
  doctors?: boolean;                        // the doctors' roster has its own layout (A, B, C and D under OH, AM, PM and OFF)
  letterhead?: { name: string; lines: string[] };
};
export const HOURS: Record<string, number> = { 'AM-9': 12, 'AM-12': 9, PM: 12, 'AM-6': 9, 'AM-5': 9, AM: 12, OH: 9 };
export const LEGEND: [string, string][] = [['AM-5', '8AM-5PM'], ['AM-6', '9AM-6PM'], ['AM-9', '9AM-9PM'], ['AM-12', '12PM-9PM'], ['PM', '9PM-9AM'], ['OFF', 'OFFDAY'], ['REST', 'RESTDAY'], ['AL', 'ANNUAL LEAVE'], ['MC', 'MEDICAL LEAVE'], ['UPL', 'UNPAID LEAVE'], ['PH', 'PUBLIC HOLIDAY']];
const dmy = (date: string) => { const [y, m, d] = date.split('-'); return `${Number(d)}/${Number(m)}/${y}`; };
const short = (date: string) => { const [, m, d] = date.split('-'); return `${d}/${m}`; };
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dayName = (date: string) => DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' });
const versionLine = (data: DutyData) => data.version === 'original' ? `ORIGINAL VERSION (start of month)${data.savedAt ? ` · saved ${stamp(data.savedAt)}` : ''}` : data.version === 'current' ? `CURRENT VERSION (with changes)${data.savedAt ? ` · changes since ${stamp(data.savedAt)}` : ''}` : '';
const ChangesPanel = ({ data, panel }: { data: DutyData; panel: string }) => data.version === 'current' && data.changes?.length ? <div className={panel}><div className="bg-[#cfe8ff] px-1 py-px text-center font-bold">CHANGES (with time)</div>{data.changes.map((item, index) => <div key={index} className="border-t border-slate-300 px-1"><b>{item.name.split(' ')[0]}</b> {dmy(item.date)}: {item.from || '-'} → {item.to || '-'}<br /><span className="text-slate-500">{stamp(item.at)}{item.by ? ` · ${item.by}` : ''}</span></div>)}</div> : null;
export const codeHours = (code: string) => HOURS[newCode(code)] || 0;

const FILL: Record<string, { bg: string; fg: string; bold?: boolean }> = {
  AM: { bg: '#8fc65a', fg: '#0b2f0b' }, 'AM-9': { bg: '#8fc65a', fg: '#0b2f0b' }, 'AM-12': { bg: '#8fc65a', fg: '#0b2f0b' }, 'AM-6': { bg: '#8fc65a', fg: '#0b2f0b' }, 'AM-5': { bg: '#8fc65a', fg: '#0b2f0b' }, OH: { bg: '#8fc65a', fg: '#0b2f0b' },
  PM: { bg: '#f7a85c', fg: '#3b1d00', bold: true }, OFF: { bg: '#fff', fg: '#d12030' }, REST: { bg: '#fff', fg: '#d12030', bold: true }, PH: { bg: '#ffe933', fg: '#4a3b00' },
  AL: { bg: '#0f3d6e', fg: '#fff' }, MC: { bg: '#e11d2a', fg: '#fff' }, ML: { bg: '#e11d2a', fg: '#fff' }, UPL: { bg: '#e11d2a', fg: '#fff' }, EL: { bg: '#0f3d6e', fg: '#fff' },
};
const fillOf = (code: string) => FILL[newCode(code.replace(/^\*+/, ''))] || { bg: '#fff', fg: '#111' };
void rosterShiftColor;

export function RosterDutyDocument({ data }: { data: DutyData }) {
  if (data.doctors) return <RosterDoctorDocument data={data} />;
  if (data.style === 'araoffice') return <RosterAraOfficeDocument data={data} />;
  const cell = 'border border-slate-800 px-1 text-[8.5px] leading-[14px]';
  // The week ends on a Sunday: the hours of the week follow it.
  const rows: ({ type: 'day'; date: string } | { type: 'week'; dates: string[] })[] = [];
  let week: string[] = [];
  for (const date of data.dates) { rows.push({ type: 'day', date }); week.push(date); if (dayName(date) === 'SUN') { rows.push({ type: 'week', dates: week }); week = []; } }
  const hoursOf = (id: string, dates: string[]) => dates.reduce((total, date) => total + codeHours(data.shift[`${id}|${date}`] || ''), 0);
  const holidayOn = new Map(data.holidays.map((item) => [item.date, item.name]));
  const panel = 'border border-slate-800 text-[8.5px] leading-[13px]';
  const head = (label: string, color: string) => <div className="px-1 py-px text-center font-bold" style={{ background: color }}>{label}</div>;
  return <div className="bg-white p-3 text-black" style={{ width: '297mm', minHeight: '210mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>
    <p className="text-center text-[13px] font-bold">{data.title}</p>
    <p className="mb-2 text-center text-[9px] font-bold text-[#0b587b]">{versionLine(data)}</p>
    <div className="flex items-start gap-3">
      <table className="border-collapse" style={{ width: '70%' }}>
        <thead>
          <tr><th colSpan={3 + data.staff.length * 2} className={`${cell} bg-[#8fb9e8] text-center font-bold`}>JADUAL STAFF {data.company}, {data.monthLabel}</th></tr>
          <tr><th className={`${cell} bg-[#f2c94c] font-bold`}>DATE</th><th className={`${cell} bg-[#f2c94c] font-bold`}>DAY</th>{data.staff.map((person) => <th key={person.id} colSpan={2} className={`${cell} bg-[#f2c94c] text-center font-bold`}>{person.name}</th>)}<th className={`${cell} bg-[#f2c94c] text-center font-bold`} style={{ width: '16mm' }}>LOCUM</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => row.type === 'day'
            ? <tr key={row.date} className={holidayOn.has(row.date) ? '' : ''}>
                <td className={`${cell} whitespace-nowrap font-bold ${holidayOn.has(row.date) ? 'bg-[#ffe933]' : ''}`}>{dmy(row.date)}</td><td className={`${cell} font-bold`}>{dayName(row.date)}</td>
                {data.staff.map((person) => { const code = data.shift[`${person.id}|${row.date}`] || ''; const shown = newCode(code.replace(/^\*+/, '')); const fill = fillOf(code); const hours = codeHours(code); const edited = data.version === 'current' && (data.changes || []).some((item) => item.date === row.date && item.staffId === person.id); return [
                  <td key={`${person.id}c`} className={`${cell} whitespace-nowrap ${fill.bold ? 'font-bold' : ''}`} style={{ background: fill.bg, color: fill.fg, outline: edited ? '2px solid #0b87d8' : undefined, outlineOffset: -2 }} title={data.notes[`${person.id}|${row.date}`] || undefined}>{code ? shown : ''}</td>,
                  <td key={`${person.id}h`} className={`${cell} text-right`}>{code ? hours : ''}</td>]; })}
                <td className={`${cell} bg-[#fff8c4]`} />
              </tr>
            : <tr key={`w${index}`} className="bg-[#d9d9d9] font-bold"><td colSpan={2} className={cell}>HOURS/WEEKS</td>{data.staff.map((person) => <td key={person.id} colSpan={2} className={`${cell} text-center`}>{hoursOf(person.id, row.dates)}</td>)}<td className={cell} /></tr>)}
        </tbody>
      </table>
      <div className="flex-1 space-y-1">
        <div className={panel}>{LEGEND.map(([code, text]) => { const fill = fillOf(code); return <div key={code} className="flex border-b border-slate-300 last:border-b-0"><span className="w-12 shrink-0 px-1 text-center font-bold" style={{ background: fill.bg, color: fill.fg }}>{code}</span><span className="flex-1 px-1 text-center">{text}</span></div>; })}</div>
        <ChangesPanel data={data} panel={panel} />
        {data.holidays.length > 0 && <div className={panel}>{head('CUTI UMUM', '#ffe933')}{data.holidays.map((item) => <div key={item.date} className="flex border-t border-slate-300"><span className="w-10 shrink-0 bg-[#ffe933] px-1 text-center font-bold">PH</span><span className="px-1">{dmy(item.date)} - {item.name}</span></div>)}</div>}
        {(data.requests.length > 0 || noteLines(data.rosterNotes?.request).length > 0) && <div className={panel}>{head(`REQUEST STAFF ${data.monthLabel}`, '#efd3e0')}{noteLines(data.rosterNotes?.request).map((line, index) => <div key={`n${index}`} className="border-t border-slate-300 px-1">{line}</div>)}{leaveNotInNotes(data.requests, data.rosterNotes).map((item) => <div key={item.name} className="border-t border-slate-300 px-1"><b>{item.name}</b> : {item.dates.map(short).join(', ')}</div>)}</div>}
        {/* Spaces HR fills in by hand, kept as in the paper roster. */}
        {[['STAFF (TRAINING PROBATION)', '#e8c5d8', 2], ['TRAINING', '#7b3fa8', 2], ['LOCUM / PART TIME', '#0f5c6e', 3], ['REMARKS', '#d9d9d9', 2], ['CREDIT HOUR', '#fff', 2]].map(([label, color, count]) => <div key={String(label)} className={panel}><div className="px-1 py-px text-center font-bold" style={{ background: String(color), color: ['#7b3fa8', '#0f5c6e'].includes(String(color)) ? '#fff' : '#000' }}>{label}</div>{label === 'REMARKS' && noteLines(data.rosterNotes?.remarks).length > 0 ? noteLines(data.rosterNotes?.remarks).map((line, index) => <div key={index} className="border-t border-slate-300 px-1">{line}</div>) : Array.from({ length: Number(count) }, (_, index) => <div key={index} className="h-[13px] border-t border-slate-300" />)}</div>)}
        {data.resigns.length > 0 && <div className={panel}>{head('REMARKS', '#d9d9d9')}{data.resigns.map((item) => <div key={item.name} className="border-t border-slate-300 px-1"><b>STAFF RESIGN</b> {item.name.toUpperCase()} : {dmy(item.date)}</div>)}</div>}
        {data.overtime.length > 0 && <div className={panel}>{head('OVERTIME (OT)', '#5bc0d8')}{data.overtime.map((item, index) => <div key={index} className="flex border-t border-slate-300"><b className="w-16 shrink-0 px-1">{item.name.split(' ')[0]}</b><span className="px-1">{dmy(item.date)} : {item.text}</span></div>)}</div>}
      </div>
    </div>
    <div className="mt-4 text-[9px]"><p>Disediakan Oleh :</p><div className="mt-8 w-52 border-t border-black pt-0.5 font-bold">{data.signer.name}<br /><span className="font-normal">{data.signer.title}</span></div></div>
  </div>;
}

// ---- The doctors' roster: a letter for each doctor, and one row for each day with the doctors under OH, AM, PM and OFF; empty AM and PM slots are yellow (locum). ----
const MALAY = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
const LEAVE = ['AL', 'MC', 'ML', 'UPL', 'EL'];
function RosterDoctorDocument({ data }: { data: DutyData }) {
  // Letters: the doctors who work office hours (OH) are always D, the others are A, B, C ... in name order.
  const isOh = (id: string) => data.dates.some((date) => newCode((data.shift[`${id}|${date}`] || '').replace(/^\*+/, '')) === 'OH');
  let next = 0;
  const letters = data.staff.map((person) => ({ ...person, oh: isOh(person.id), letter: '' })).map((person) => person.oh ? { ...person, letter: 'D' } : { ...person, letter: (() => { let letter = String.fromCharCode(65 + next++); if (letter === 'D') letter = String.fromCharCode(65 + next++); return letter; })() }).sort((a, b) => a.letter.localeCompare(b.letter));
  const cell = 'border border-slate-800 px-1 text-center text-[9px] leading-[15px]';
  const who = (date: string, test: (code: string) => boolean) => letters.filter((person) => test(newCode((data.shift[`${person.id}|${date}`] || '').replace(/^\*+/, '')))).map((person) => person.letter).join(',');
  const holidayOn = new Map(data.holidays.map((item) => [item.date, item.name]));
  // Seri Kembangan lists OH first, Kajang lists AM and PM first.
  const kajang = data.company === 'KAJANG';
  const rows: (string | null)[] = []; for (const date of data.dates) { rows.push(date); if (dayName(date) === 'SUN') rows.push(null); }
  const yellow = 'bg-[#ffff00] font-bold';
  return <div className="bg-white p-4 text-black" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>
    {/* The letterhead: the navy badge with the logo hangs from the top edge, the company details are to its right. */}
    <div className="-mt-4 mb-4 flex items-start justify-end gap-4">
      <img src="/forms/ara-letterhead-badge.png" alt="Klinik ARA 24 Jam" className="h-[34mm] w-[34mm] rounded-b-2xl object-cover" />
      <div className="max-w-[62mm] pt-4 text-[9.5px] leading-[14px]"><p className="text-[12px] font-bold">{data.letterhead?.name || 'HSO Healthcare Sdn Bhd'}</p>{(data.letterhead?.lines || []).map((line, index) => <p key={line} className={index === 0 || index === 1 ? 'font-semibold' : ''}>{line}</p>)}</div>
    </div>
    <p className="mb-1 text-center text-[9px] font-bold text-[#0b587b]">{versionLine(data)}</p>
    <table className="w-full table-fixed border-collapse">
      <colgroup><col style={{ width: '17mm' }} /><col style={{ width: '11mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '17mm' }} /><col style={{ width: '38mm' }} /><col style={{ width: '41mm' }} /></colgroup>
      <thead>
        <tr><th className={`${cell} text-left font-bold`} colSpan={2}>{kajang ? <span className="bg-[#ffff00]">Yellow: locum</span> : <>*: REQUESTS<br /><span className="bg-[#ffff00]">Yellow: locum</span></>}</th><th colSpan={6} className={`${cell} font-bold`}>JADUAL KLINIK ARA 24 JAM {data.monthLabel} (RESIDEN/LOCUM)<br />{letters.map((person) => `${person.letter}: DR ${person.name}${person.oh ? ' (OFFICE HOUR)' : ''}`).join(', ')}</th></tr>
        <tr className="bg-[#f0a98a] font-bold"><th className={cell} colSpan={2} />{kajang ? <><th className={cell}>AM*</th><th className={cell}>PM*</th><th className={cell}>9-6PM<br />OH DR</th></> : <><th className={cell}>9-6PM<br />OH DR</th><th className={cell}>AM*</th><th className={cell}>PM*</th></>}<th className={cell}>OFF</th><th className={cell}>LOCUM<br />6-10{kajang ? ' or 8-10' : ''}</th><th className={cell}>REMARK</th></tr>
      </thead>
      <tbody>
        {rows.map((date, index) => {
          if (!date) return <tr key={`s${index}`} className="bg-[#1e9be0]"><td colSpan={8} className="h-3 border border-slate-800" /></tr>;
          const oh = who(date, (code) => code === 'OH'), am = who(date, (code) => code === 'AM' || code.startsWith('AM-')), pm = who(date, (code) => code === 'PM'), rest = who(date, (code) => ['OFF', 'REST'].includes(code));
          const leave = letters.filter((person) => LEAVE.includes(newCode((data.shift[`${person.id}|${date}`] || '').replace(/^\*+/, '')))).map((person) => `${person.letter} (${newCode(data.shift[`${person.id}|${date}`])})`);
          const remark = [holidayOn.has(date) ? `PH: ${holidayOn.get(date)}` : '', ...leave].filter(Boolean).join(' · ');
          const sat = dayName(date) === 'SAT', weekend = sat || dayName(date) === 'SUN';
          const ohCell = <td key="oh" className={`${cell} ${weekend ? 'bg-black' : ''}`}>{weekend ? '' : oh || '-'}</td>;
          const amCell = <td key="am" className={`${cell} ${am ? '' : yellow}`}>{am || 'LOCUM'}</td>;
          const pmCell = <td key="pm" className={`${cell} ${pm ? '' : yellow}`}>{pm || 'LOCUM'}</td>;
          return <tr key={date}>
            <td className={`${cell} text-left`}>{MALAY[new Date(`${date}T00:00:00Z`).getUTCDay()]}</td><td className={cell}>{short(date).replace(/^0/, '').replace('/0', '/')}</td>
            {kajang ? [amCell, pmCell, ohCell] : [ohCell, amCell, pmCell]}
            <td className={`${cell} ${rest ? 'text-[#d12030]' : ''}`}>{rest || '-'}</td>
            <td className={`${cell} text-left ${sat ? 'bg-black' : yellow}`}>{sat ? '' : dayName(date) === 'SUN' ? '6-10' : '8-10'}</td>
            <td className={`${cell} overflow-hidden text-left text-[7px] leading-[9px] text-[#d12030]`}>{remark}</td>
          </tr>;
        })}
      </tbody>
    </table>
    {kajang && <p className="mt-1 text-[10px] italic">*Saturday 6pm-8pm: Maintenance hours</p>}
    <div className="mt-3 w-1/2"><ChangesPanel data={data} panel="border border-slate-800 text-[9px] leading-[13px]" /></div>
  </div>;
}

// ---- AraOffice design for the clinic assistants: one column for each person (the names across the top), one row for each day of the month with pastel colours by code, the totals under the
// grid, and on the right the code list and the information the staff ask for (public holidays, leave requests, overtime, resignations) with blank spaces to write in. One landscape A4 page. ----
const WORKING = ['AM', 'AM-9', 'AM-12', 'AM-6', 'AM-5', 'OH', 'PM'];
function RosterAraOfficeDocument({ data }: { data: DutyData }) {
  const holidayOn = new Map(data.holidays.map((item) => [item.date, item.name]));
  const cell = 'border border-slate-300 text-center text-[7.5px] leading-[12px]';
  const colour = (code: string) => rosterShiftColor(code);
  const panel = 'border border-slate-300 text-[7.5px] leading-[10px]';
  const head = (label: string, color: string, text = '#14233b') => <div className="px-1.5 py-[2px] text-center text-[7.5px] font-bold tracking-wide" style={{ background: color, color: text }}>{label}</div>;
  const blank = (count: number) => Array.from({ length: count }, (_, index) => <div key={index} className="h-[11px] border-t border-slate-200" />);
  const codesOf = (id: string) => data.dates.map((date) => newCode((data.shift[`${id}|${date}`] || '').replace(/^\*+/, '')));
  const totals = data.staff.map((person) => { const codes = codesOf(person.id); return { work: codes.filter((code) => WORKING.includes(code)).length, off: codes.filter((code) => code === 'OFF' || code === 'REST').length, leave: codes.filter((code) => ['AL', 'MC', 'ML', 'UPL', 'EL'].includes(code)).length, hours: codes.reduce((sum, code) => sum + (HOURS[code] || 0), 0) }; });
  const rowH = 'h-[4.5mm]';
  return <div className="bg-white px-5 py-4 text-[#14233b]" style={{ width: '297mm', height: '210mm', fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden' }}>
    <div className="mb-2 flex items-center gap-3">
      <img src="/ara-logo.png" alt="Klinik ARA 24 Jam" className="h-[15mm] w-[15mm] object-contain" />
      <div className="flex-1"><p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#0b87d8]">Klinik ARA 24 Jam · {data.company}</p><p className="text-[15px] font-bold leading-tight">{data.title}</p>{versionLine(data) && <p className="text-[8px] font-bold text-[#0b587b]">{versionLine(data)}</p>}</div>
    </div>
    <div className="flex items-start gap-3">
      <table className="table-fixed border-collapse" style={{ width: '68%' }}>
        <colgroup><col style={{ width: '17mm' }} /><col style={{ width: '9mm' }} />{data.staff.map((person) => <col key={person.id} />)}<col style={{ width: '24mm' }} /></colgroup>
        <thead>
          <tr className="h-[7mm]"><th className={`${cell} bg-[#14233b] text-white`}>DATE</th><th className={`${cell} bg-[#14233b] text-white`}>DAY</th>{data.staff.map((person) => <th key={person.id} className={`${cell} bg-[#14233b] px-0.5 text-[7.5px] font-bold uppercase text-white`}>{person.name}</th>)}<th className={`${cell} bg-[#0f5c6e] text-[7.5px] font-bold uppercase text-white`}>LOCUM</th></tr>
        </thead>
        <tbody>
          {data.dates.map((date) => { const weekend = ['SAT', 'SUN'].includes(dayName(date)); const holiday = holidayOn.has(date); const sunday = dayName(date) === 'SUN'; return <tr key={date} className={rowH} style={sunday ? { borderBottom: '1.5px solid #14233b' } : undefined}>
            <td className={`${cell} whitespace-nowrap font-bold ${holiday ? 'bg-[#ffe933]' : weekend ? 'bg-[#e8ecf3]' : 'bg-[#f4f6fa]'}`} title={holidayOn.get(date) || undefined}>{dmy(date)}</td>
            <td className={`${cell} font-bold ${holiday ? 'bg-[#ffe933]' : weekend ? 'bg-[#e8ecf3] text-[#a23]' : 'bg-[#f4f6fa]'}`}>{dayName(date)}</td>
            {data.staff.map((person) => { const code = data.shift[`${person.id}|${date}`] || ''; const color = colour(code); const edited = data.version === 'current' && (data.changes || []).some((item) => item.date === date && item.staffId === person.id); return <td key={person.id} className={`${cell} font-semibold`} style={{ background: color?.backgroundColor, color: color?.textColor, outline: edited ? '2px solid #0b87d8' : undefined, outlineOffset: -2 }} title={data.notes[`${person.id}|${date}`] || undefined}>{code ? newCode(code.replace(/^\*+/, '')) : ''}</td>; })}
            <td className={`${cell} bg-[#f1f9fb]`} />
          </tr>; })}
          {([['Work days', 'work'], ['Off / rest', 'off'], ['Leave', 'leave'], ['Hours', 'hours']] as const).map(([label, key]) => <tr key={key} className={`${rowH} bg-[#e8ecf3] font-bold`}><td colSpan={2} className={`${cell} text-left px-1`}>{label}</td>{totals.map((item, index) => <td key={index} className={cell}>{item[key]}</td>)}<td className={cell} /></tr>)}
        </tbody>
      </table>
      <div className="flex-1 space-y-1">
        <div className="flex flex-wrap gap-1 text-[7px] font-bold">{LEGEND.filter(([code]) => !['UPL'].includes(code)).map(([code, text]) => { const color = colour(code); return <span key={code} className="rounded px-1.5 py-[1px]" style={{ background: color?.backgroundColor || '#fff', color: color?.textColor || '#14233b', border: '1px solid #e2e8f0' }}>{code} <span className="font-normal">{text}</span></span>; })}</div>
        <div className={panel}>{head('CUTI UMUM', '#ffe933')}{data.holidays.length ? data.holidays.map((item) => <div key={item.date + item.name} className="border-t border-slate-200 px-1.5"><b>{dmy(item.date)}</b> · {item.name}</div>) : blank(2)}</div>
        <div className={panel}>{head(`REQUEST STAFF ${data.monthLabel}`, '#efd3e0')}{noteLines(data.rosterNotes?.request).length + leaveNotInNotes(data.requests, data.rosterNotes).length ? <>{noteLines(data.rosterNotes?.request).map((line, index) => <div key={`n${index}`} className="border-t border-slate-200 px-1.5">{line}</div>)}{leaveNotInNotes(data.requests, data.rosterNotes).slice(0, 9).map((item) => <div key={item.name} className="border-t border-slate-200 px-1.5"><b>{item.name}</b> : {item.dates.map(short).join(', ')}</div>)}</> : blank(3)}</div>
        <div className={panel}>{head('STAFF RESIGN', '#d9d9d9')}{data.resigns.length ? data.resigns.map((item) => <div key={item.name} className="border-t border-slate-200 px-1.5"><b>{item.name.toUpperCase()}</b> · {dmy(item.date)}</div>) : blank(1)}</div>
        <div className={panel}>{head('LOCUM / PART TIME', '#0f5c6e', '#fff')}{blank(3)}</div>
        <div className={panel}>{head('TRAINING', '#7b3fa8', '#fff')}{blank(2)}</div>
        <div className={panel}>{head('CREDIT HOUR', '#e0e7ff')}{blank(2)}</div>
        <div className={panel}>{head('OVERTIME (OT)', '#5bc0d8')}{data.overtime.length ? data.overtime.slice(0, 10).map((item, index) => <div key={index} className="flex border-t border-slate-200 px-1.5"><b className="w-12 shrink-0">{item.name.split(' ')[0]}</b><span>{dmy(item.date)} : {item.text}</span></div>) : blank(3)}</div>
        <div className={panel}>{head('REMARKS', '#d9d9d9')}{noteLines(data.rosterNotes?.remarks).length ? noteLines(data.rosterNotes?.remarks).map((line, index) => <div key={index} className="border-t border-slate-200 px-1.5">{line}</div>) : blank(2)}</div>
        {data.version === 'current' && data.changes?.length ? <div className={panel}>{head('CHANGES (with time)', '#cfe8ff')}{data.changes.slice(0, 6).map((item, index) => <div key={index} className="border-t border-slate-200 px-1.5"><b>{item.name.split(' ')[0]}</b> {dmy(item.date)}: {item.from || '-'} → {item.to || '-'}<span className="text-slate-500"> · {stamp(item.at)}</span></div>)}</div> : null}
        <div className="pt-1 text-[8px]"><p>Disediakan Oleh :</p><div className="mt-4 w-44 border-t border-black pt-0.5 font-bold">{data.signer.name}<br /><span className="font-normal">{data.signer.title}</span></div></div>
      </div>
    </div>
  </div>;
}
