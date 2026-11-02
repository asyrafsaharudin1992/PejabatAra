import { calendarMonthEnd, type ProbationState } from './lib/hrCalendar';
import { isProjectionCa, projectionCell, projectionLabels, type ProjectionPerson, type ProjectionPlan, type ProjectionStatus } from './lib/hrProjection';

export const projectionColors: Record<ProjectionStatus, string> = { permanent: '#f8ccb3', probation: '#e8b1e1', contract: '#b9e49b', locum: '#d4d4d4', intern: '#8cd2e8', resigned: '#fff9b0', unknown: '#f1f5f9' };
export type ProjectionRow = { id: string; name: string; code: string; company: string; person?: ProjectionPerson };
export function projectionRows(people: ProjectionPerson[], plan: ProjectionPlan, months: string[], branch: string): ProjectionRow[] {
  const placed = (p: { id: string; company: string }, month: string) => (plan.cells[`${p.id}:${month}`]?.company || p.company) === branch;
  const actual = people.filter(isProjectionCa).filter((p) => months.some((month) => placed(p, month) && (projectionCell(p, month, {}) || plan.cells[`${p.id}:${month}`]))).map((p) => ({ id: p.id, name: p.name, code: p.code, company: p.company, person: p }));
  return [...actual.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), ...plan.rows.filter((p) => months.some((m) => placed(p, m))).map((p) => ({ ...p, code: 'Planned' }))];
}
export function displayedCell(row: ProjectionRow, month: string, plan: ProjectionPlan, probation: Record<string, ProbationState>) {
  if (row.person?.resignDate && row.person.resignDate < `${month}-01`) return null;
  const override = plan.cells[`${row.id}:${month}`];
  if (override) {
    const date = (value: string) => `${Number(value.slice(8))}/${Number(value.slice(5, 7))}`;
    const notes = (override.status === 'resigned' ? [override.note, override.endsOn?.slice(0, 7) === month ? `Last ${date(override.endsOn)}` : ''] : [override.note, override.startsOn?.slice(0, 7) === month ? `From ${date(override.startsOn)}` : '', override.endsOn?.slice(0, 7) === month ? `Until ${date(override.endsOn)}` : '']).filter(Boolean) as string[];
    return override.status === 'absent' ? null : { status: override.status, notes, planned: true, company: override.company || row.company, endsOn: override.endsOn };
  }
  const lastForecast = Object.entries(plan.cells).filter(([key, value]) => key.startsWith(`${row.id}:`) && key.slice(-7) < month && value.status !== 'absent').sort(([a], [b]) => b.localeCompare(a))[0]?.[1];
  if (lastForecast?.status === 'resigned') return null;
  const base = row.person ? projectionCell(row.person, month, probation) : null;
  return base ? { ...base, planned: false, company: row.company, endsOn: undefined } : null;
}
const shortName = (row: ProjectionRow) => row.person ? row.name.split(/\s+/).find((w) => !/^(NUR|NURUL|SITI|MOHD|MOHAMAD|MUHAMAD|AHMAD)$/i.test(w)) || row.name : row.name;
type Props = { people: ProjectionPerson[]; plan: ProjectionPlan; probation: Record<string, ProbationState>; months: string[]; branches: string[]; compact?: boolean; onCell?: (row: ProjectionRow, month: string) => void; onOpen?: (id: string) => void };
export default function HRProjectionDocument({ people, plan, probation, months, branches, compact = false, onCell, onOpen }: Props) {
  return <div className="projection-document space-y-5 text-slate-900" style={{ fontFamily: 'Arial, sans-serif', fontSize: compact ? 10 : 11, lineHeight: 1.3 }}>
    {branches.map((branch) => {
      const rows = projectionRows(people, plan, months, branch);
      const columns = months.map((month) => rows.map((row) => ({ row, cell: displayedCell(row, month, plan, probation) })).filter((entry) => entry.cell ? entry.cell.company === branch : onCell && !entry.row.person && entry.row.company === branch));
      const lines = Math.max(11, ...columns.map((column) => column.length));
      return <article key={branch} className="projection-sheet">
        <header className="mb-3 flex items-center justify-between gap-3 border-b-2 border-[#17364c] pb-3"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" className="h-12 w-28 shrink-0 object-contain" /><div className="text-right"><h3 className="font-bold" style={{ fontSize: compact ? 15 : 17 }}>KLINIK ARA 24 JAM · {branch === 'KJ' ? 'KAJANG' : 'SERI KEMBANGAN'}</h3><p className="mt-1 font-semibold">FORECAST RECRUITMENT FOR CA · {months[0]?.slice(0, 4)}{months[0]?.slice(0, 4) !== months[months.length - 1]?.slice(0, 4) ? ` / ${months[months.length - 1]?.slice(0, 4)}` : ''}</p><p className="mt-1 text-slate-500">{months[0]} — {months[months.length - 1]} · HR Forecast</p></div></header>
        <table className="w-full table-fixed border-collapse"><caption className="sr-only">{branch} CA staffing forecast</caption><colgroup><col style={{ width: '3.5%' }} />{months.map((m) => <col key={m} style={{ width: `${96.5 / months.length}%` }} />)}</colgroup><thead><tr><th className="border border-slate-500 bg-slate-100 py-1">BIL</th>{months.map((m) => <th key={m} className="border border-slate-500 bg-slate-100 py-1 text-center">{new Date(`${m}-01T12:00:00+08:00`).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}{months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4) && <span className="block text-[0.85em] font-normal">{m.slice(0, 4)}</span>}</th>)}</tr></thead><tbody>{Array.from({ length: lines }, (_, index) => <tr key={index}><th className="border border-slate-500 px-0.5 py-1 text-center font-normal">{index + 1}</th>{months.map((month, col) => {
          const entry = columns[col][index];
          if (!entry) return <td key={month} className="border border-slate-500 py-1" />;
          const { row, cell } = entry;
          return <td key={month} className="break-words border border-slate-500 p-0 text-left align-top" style={{ backgroundColor: cell ? projectionColors[cell.status] : '#f1f5f9', printColorAdjust: 'exact' }}><button type="button" disabled={!onCell && (!onOpen || !row.person)} onClick={() => onCell ? onCell(row, month) : onOpen?.(row.id)} aria-label={`${onCell ? 'Edit' : 'View'} ${row.name}, ${month}`} title={`${row.name} · ${cell ? projectionLabels[cell.status] : 'Set forecast'}${cell?.notes.length ? ` · ${cell.notes.join('; ')}` : ''}`} className="block min-h-6 w-full px-1 py-1 text-left disabled:text-inherit enabled:hover:ring-2 enabled:hover:ring-inset enabled:hover:ring-sky-600"><span className="font-medium">{shortName(row)}{cell?.planned ? '*' : ''}</span>{cell ? cell.notes.map((note) => <span key={note} className="mt-0.5 block break-words text-[0.85em]">{note}</span>) : <span className="mt-0.5 block text-[0.85em] text-slate-500">Set forecast</span>}</button></td>;
        })}</tr>)}<tr><th className="border border-slate-500 bg-slate-100 py-1 text-[0.8em]">TOTAL</th>{months.map((month) => <td key={month} className="border border-slate-500 bg-slate-100 py-1 text-center font-bold">{rows.filter((row) => { const cell = displayedCell(row, month, plan, probation); return cell && cell.company === branch && (!cell.endsOn || cell.endsOn >= calendarMonthEnd(month)) && cell.status !== 'resigned' && (plan.cells[`${row.id}:${month}`] || !row.person?.resignDate || row.person.resignDate > calendarMonthEnd(month)); }).length}</td>)}</tr></tbody></table>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{(Object.keys(projectionLabels) as ProjectionStatus[]).map((status) => <span key={status} className="inline-flex items-center gap-1"><i className="inline-block h-3 w-4 border border-black/20" style={{ background: projectionColors[status], printColorAdjust: 'exact' }} />{projectionLabels[status]}</span>)}</div>
        <footer className="mt-3 border-t border-slate-200 pt-2 text-[0.85em] text-slate-500">* HR forecast edit. Forecast changes do not update employment, confirmation or payroll records. Prepared {new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}.</footer>
      </article>;
    })}
  </div>;
}
