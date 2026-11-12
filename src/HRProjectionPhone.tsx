import { useEffect, useState } from 'react';
import { calendarMonthEnd, type ProbationState } from './lib/hrCalendar';
import { projectionLabels, type ProjectionPerson, type ProjectionPlan, type ProjectionStatus } from './lib/hrProjection';
import { displayedCell, projectionColors, projectionRows } from './HRProjectionDocument';

// The CA staffing forecast on a phone: pick a month, see each branch's staff as small coloured cards, with the total. The wide
// month-by-month table stays for bigger screens and for the printed PDF.
const firstName = (name: string, planned: boolean) => planned ? name : name.split(/\s+/).find((word) => !/^(NUR|NURUL|SITI|MOHD|MOHAMAD|MUHAMAD|AHMAD)$/i.test(word)) || name;
const monthName = (month: string) => new Date(`${month}-01T12:00:00+08:00`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Kuala_Lumpur' });
export default function HRProjectionPhone({ people, plan, probation, months, branches, today }: { people: ProjectionPerson[]; plan: ProjectionPlan; probation: Record<string, ProbationState>; months: string[]; branches: string[]; today: string }) {
  const [month, setMonth] = useState(() => months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[0]);
  useEffect(() => { setMonth((current) => months.includes(current) ? current : months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[0]); }, [months.join(','), today]);
  if (!month) return null;
  return <div className="space-y-3 sm:hidden">
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Month">{months.map((value) => <button key={value} type="button" role="tab" aria-selected={value === month} onClick={() => setMonth(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${value === month ? 'bg-[#0b587b] text-white' : 'bg-slate-100 text-slate-600'}`}>{monthName(value)}{months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4) ? ` ${value.slice(2, 4)}` : ''}</button>)}</div>
    {branches.map((branch) => {
      const rows = projectionRows(people, plan, months, branch);
      const entries = rows.map((row) => ({ row, cell: displayedCell(row, month, plan, probation) })).filter((entry) => entry.cell && entry.cell.company === branch);
      const total = rows.filter((row) => { const cell = displayedCell(row, month, plan, probation); return cell && cell.company === branch && (!cell.endsOn || cell.endsOn >= calendarMonthEnd(month)) && cell.status !== 'resigned' && (plan.cells[`${row.id}:${month}`] || !row.person?.resignDate || row.person.resignDate > calendarMonthEnd(month)); }).length;
      return <section key={branch} className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold text-[#17364c]">{branch === 'KJ' ? 'KJ · Kajang' : 'SK · Seri Kembangan'}</h4><span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">{total} CA</span></div>
        {!entries.length ? <p className="text-xs text-slate-500">No CA in this month.</p> : <ul className="grid grid-cols-2 gap-1.5">{entries.map(({ row, cell }) => <li key={row.id} className="rounded-lg px-2 py-1.5" style={{ backgroundColor: projectionColors[cell!.status as ProjectionStatus] }}><p className="text-[12px] font-semibold leading-tight text-slate-900">{firstName(row.name, !row.person)}</p><p className="mt-0.5 truncate text-[10px] leading-tight text-slate-700">{projectionLabels[cell!.status as ProjectionStatus]}{cell!.notes.length ? ` · ${cell!.notes.join('; ')}` : ''}</p></li>)}</ul>}
      </section>;
    })}
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">{(Object.keys(projectionLabels) as ProjectionStatus[]).map((status) => <span key={status} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-3 rounded-sm border border-black/10" style={{ background: projectionColors[status] }} />{projectionLabels[status]}</span>)}</div>
  </div>;
}
