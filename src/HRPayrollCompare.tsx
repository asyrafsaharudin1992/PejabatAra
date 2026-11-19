import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { officeFetch } from './lib/officeApi';
import { payPeriod } from './lib/payrollRun';

// Payroll > Compare: the pay of a month against the month before it, one line for each staff member, with the lines that changed marked and a reason. It reads the SAVED
// payslips (a draft saved in Pay run, or a locked month), so press Save draft first. October 2026 is what Infotech paid. This is a check that the figures are reasonable:
// it shows what moved, it cannot show that a figure that did not move is right.
type Slip = { net: number; kwsp: number; socso: number; eis: number; pcb: number; basic: number; ot: number; restPh: number; gross: number; allow: number };
// What is known about the staff member in a month (to say why the pay moved): dates, raises and what HR typed in Pay run.
type Meta = { joinDate: string | null; resignDate: string | null; raises: { date: string; from: number }[]; unpaidDays: number; unpaidRm: number };
type Line = { id: string; code: string; name: string; company: string; active: boolean; before: Slip | null; now: Slip | null; metaNow?: Meta; metaBefore?: Meta; hasNow: boolean; flags: string[] };
const API = '/api/status?resource=hr';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r2 = (value: number) => Math.round(value * 100) / 100;
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slipOf = (slip: any): Slip | null => {
  const r = slip?.result; if (!r) return null;
  const n = (value: unknown) => Number(value) || 0;
  return { net: n(r.net), kwsp: n(r.kwspEmployee), socso: n(r.socsoEmployee), eis: n(r.eisEmployee), pcb: n(r.pcb), basic: n(r.basic), ot: n(r.ot), restPh: n(r.restPh), gross: n(r.gross), allow: Array.isArray(r.allowances) ? r.allowances.reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0) : 0 };
};
const previous = (year: number, month: number) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
const read = async (year: number, month: number) => {
  const response = await officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to read the payroll.');
  return new Map<string, { id: string; code: string; name: string; company: string; active: boolean; slip: Slip | null; meta: Meta }>((result.staff || []).map((member: any) => [member.id, { id: member.id, code: member.employeeCode, name: member.fullName, company: member.company, active: member.status !== 'Inactive', slip: slipOf(member.payslip), meta: { joinDate: member.joinDate || null, resignDate: member.resignDate || null, raises: Array.isArray(member.salaryChanges) ? member.salaryChanges : [], unpaidDays: Number(member.payslip?.inputs?.unpaidDays) || 0, unpaidRm: Number(member.payslip?.inputs?.unpaidLeave) || 0 } }]));
};

// The figures shown for each staff member: last month on the first line, this month under it (a figure that moved is in amber).
const METRICS: [string, (slip: Slip) => number][] = [['Basic', (s) => s.basic], ['OT / Rest / PH', (s) => r2(s.ot + s.restPh)], ['Allowances', (s) => r2(s.allow)], ['Gross', (s) => s.gross], ['KWSP', (s) => s.kwsp], ['PERKESO', (s) => s.socso], ['EIS', (s) => s.eis], ['PCB', (s) => s.pcb], ['Net', (s) => s.net]];
const dmyDate = (value: string) => value.split('-').reverse().join('/');
// Why a line changed, in words only (no amounts): one short line for each thing that moved, such as OT this month, an increment, unpaid leave or a part month.
function explain(line: Line, year: number, month: number): string[] {
  const was = line.before, is = line.now, out: string[] = [];
  const now = payPeriod(year, month), before = payPeriod(...(Object.values(previous(year, month)) as [number, number]));
  const inPeriod = (date: string | null) => Boolean(date) && date! >= before.from && date! <= now.to;
  if (!was && is) { out.push(inPeriod(line.metaNow?.joinDate || null) ? `New staff: joined ${dmyDate(line.metaNow!.joinDate!)}, not paid last month` : 'Not paid last month'); return out; }
  if (was && !is) { out.push(line.hasNow ? 'No payslip saved this month yet: press Save draft in Pay run' : line.metaBefore?.resignDate ? `Left ${dmyDate(line.metaBefore.resignDate)}: not in this month` : !line.active ? 'Not active: not in this month' : 'Not in this month'); return out; }
  if (!was || !is) return out;
  const mt = line.metaNow;
  const basicMoved = Math.abs(is.basic - was.basic) >= 1;
  const raise = mt?.raises.find((item) => inPeriod(item.date));
  if (basicMoved) {
    if (mt?.unpaidDays || mt?.unpaidRm) out.push(`Unpaid leave this month${mt.unpaidDays ? ` (${mt.unpaidDays} day${mt.unpaidDays === 1 ? '' : 's'})` : ''}`);
    else if (mt?.joinDate && mt.joinDate >= now.from && mt.joinDate <= now.to) out.push(`Joined ${dmyDate(mt.joinDate)}: part month`);
    else if (mt?.resignDate && mt.resignDate >= now.from && mt.resignDate <= now.to) out.push(`Leaves ${dmyDate(mt.resignDate)}: part month`);
    else if (raise) out.push(`Increment from ${dmyDate(raise.date)}`);
    else out.push('Basic pay changed');
  }
  const otWas = was.ot + was.restPh, otIs = is.ot + is.restPh;
  if (otIs >= 1 && otWas < 1) out.push('Has OT / Rest / PH this month');
  else if (otWas >= 1 && otIs < 1) out.push('No OT / Rest / PH this month (had it last month)');
  else if (Math.abs(otIs - otWas) >= 1) out.push(otIs > otWas ? 'More OT / Rest / PH than last month' : 'Less OT / Rest / PH than last month');
  if (Math.abs(is.allow - was.allow) >= 1) out.push('Allowance changed');
  const payMoved = basicMoved || Math.abs(otIs - otWas) >= 1 || Math.abs(is.allow - was.allow) >= 1;
  if (is.kwsp !== was.kwsp) out.push(payMoved ? 'KWSP changed with the pay' : 'KWSP changed (rate or wages)');
  if (is.socso !== was.socso || is.eis !== was.eis) out.push(payMoved ? 'PERKESO / EIS changed with the pay' : 'PERKESO / EIS changed');
  if (is.pcb !== was.pcb) out.push(payMoved ? 'PCB changed with the pay' : 'PCB changed (tax worked out again from the year to date, reliefs or income)');
  if (!out.length && Math.abs(is.net - was.net) >= Math.max(100, was.net * 0.1)) out.push('Net pay changed a lot');
  return out;
}

export function HRPayrollCompare({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(11), [year] = useState(2026);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [show, setShow] = useState(false);
  const [place, setPlace] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'' | 'active' | 'left'>('');   // active staff, staff who have left, or both
  useEffect(() => {
    let live = true; setLines(null);
    const before = previous(year, month);
    Promise.all([read(year, month), read(before.year, before.month)]).then(([nowMap, beforeMap]) => {
      if (!live) return;
      const ids = new Set([...nowMap.keys(), ...beforeMap.keys()]);
      const out: Line[] = [];
      for (const id of ids) {
        const a = beforeMap.get(id), b = nowMap.get(id), info = b || a!;
        const was = a?.slip || null, is = b?.slip || null;
        const line: Line = { id, code: info.code, name: info.name, company: info.company, active: (b || a!).active, before: was, now: is, metaNow: b?.meta, metaBefore: a?.meta, hasNow: Boolean(b), flags: [] };
        line.flags = explain(line, year, month);
        out.push(line);
      }
      out.sort((x, y) => x.company.localeCompare(y.company) || x.code.localeCompare(y.code, undefined, { numeric: true }));
      setLines(out);
    }).catch((cause: Error) => { if (live) { setLines([]); onError(cause.message); } });
    return () => { live = false; };
  }, [month]);
  // The staff the filters (company, status, search) leave in: the counts below are about these, not about everyone.
  const base = useMemo(() => (lines || []).filter((line) => (!place || line.company === place) && (!state || (state === 'active') === line.active) && (!query.trim() || `${line.name} ${line.code}`.toLowerCase().includes(query.trim().toLowerCase()))), [lines, place, query, state]);
  const shown = useMemo(() => (lines || []).filter((line) => (!place || line.company === place) && (!state || (state === 'active') === line.active) && (!onlyChanged || line.flags.length) && (!query.trim() || `${line.name} ${line.code}`.toLowerCase().includes(query.trim().toLowerCase()))), [lines, onlyChanged, place, query, state]);
  const cell = (value: number | undefined) => value === undefined ? '' : show ? fmt(value) : '••••';
  const diff = (a: Slip | null, b: Slip | null, pick: (slip: Slip) => number) => a && b ? r2(pick(b) - pick(a)) : undefined;
  const csv = () => {
    const head = ['Code', 'Staff', 'Company', 'Active', ...METRICS.flatMap(([label]) => [`${label} before`, `${label} now`]), 'What changed'];
    const rows = shown.map((l) => [l.code, l.name, l.company, l.active ? 'Yes' : 'No', ...METRICS.flatMap(([, pick]) => [l.before ? pick(l.before) : '', l.now ? pick(l.now) : '']), l.flags.join('; ')]);
    downloadBlob([[head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], `payroll-compare-${year}-${String(month).padStart(2, '0')}.csv`, 'text/csv');
  };
  const before = previous(year, month);
  const num = (value: number | undefined, tone = '') => <td className={`pr-3 text-right tabular-nums ${tone}`}>{cell(value)}</td>;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Compare with last month</h3><p className="text-sm text-slate-500">{MONTHS[month - 1]} {year} against {MONTHS[before.month - 1]} {before.year}. It reads the <strong>saved</strong> payslips, so press Save draft in Pay run first. October 2026 is what Infotech paid. Lines that changed are marked, with the reason.</p></div>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{[11, 12].map((value) => <option key={value} value={value}>{MONTHS[value - 1]} {year}</option>)}</select>
      <select aria-label="Company" value={place} onChange={(event) => setPlace(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <select aria-label="Staff status" value={state} onChange={(event) => setState(event.target.value as '' | 'active' | 'left')} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Active and not active</option><option value="active">Active only</option><option value="left">Not active (left) only</option></select>
      <input aria-label="Search staff" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" className="h-10 w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} className="h-4 w-4" />Only lines that changed</label>
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      <button type="button" onClick={csv} disabled={!shown.length || !show} title={show ? '' : 'Press Show amounts first'} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />CSV</button>
    </div>
    {!lines ? <p className="text-sm text-slate-500">Reading the payslips…</p> : <>
      <p className="text-sm text-slate-500">{shown.length} of {base.length} staff shown · {base.filter((line) => line.flags.length).length} with something that changed.</p>
      <div className="overflow-x-auto"><table className="no-stack w-full min-w-[1100px] text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th>{METRICS.map(([label]) => <th key={label} className="pr-3 text-right">{label}</th>)}<th>What changed</th></tr>
          <tr className="text-[10px] text-slate-400"><th />{METRICS.map(([label]) => <th key={label} className="pr-3 pb-1 text-right font-normal normal-case">{MONTHS[before.month - 1].slice(0, 3)} → {MONTHS[month - 1].slice(0, 3)}</th>)}<th /></tr></thead>
        <tbody>{shown.map((line) => <tr key={line.id} className={`border-t border-slate-100 align-top ${line.flags.length ? 'bg-amber-50/50' : ''}`}>
          <td className="py-2 pr-3"><span className="font-semibold">{line.name}</span><span className="block text-xs text-slate-400">{line.code} · {line.company}{!line.active && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">not active</span>}</span></td>
          {METRICS.map(([label, pick]) => { const a = line.before ? pick(line.before) : undefined, b = line.now ? pick(line.now) : undefined; const moved = a !== undefined && b !== undefined && Math.abs(b - a) >= 0.005; return <td key={label} className="pr-3 text-right tabular-nums"><span className="block text-xs text-slate-400">{cell(a)}</span><span className={moved ? 'font-semibold text-amber-800' : ''}>{cell(b)}</span></td>; })}
          <td className="text-xs text-amber-800">{line.flags.map((reason, index) => <span key={index} className="block">{reason}</span>)}</td></tr>)}</tbody></table></div>
      {!shown.length && <p className="text-sm text-slate-500">{query.trim() ? 'No staff match this search (untick "Only lines that changed" to include staff whose pay did not change).' : ''}{!query.trim() && <>Nothing changed beyond the limits{onlyChanged ? ' (untick "Only lines that changed" to see everyone)' : ''}, or no payslip is saved for {MONTHS[month - 1]} yet.</>}</p>}
      <p className="text-xs text-slate-400">A line is marked when something moved: unpaid leave, an increment, a part month (joined or leaving), OT / Rest / PH, an allowance, KWSP, PERKESO / EIS or PCB, or someone is in one month and not the other. The reason is written beside it. This shows what moved; it cannot show that a figure that stayed the same is right.</p>
    </>}
  </section>;
}
