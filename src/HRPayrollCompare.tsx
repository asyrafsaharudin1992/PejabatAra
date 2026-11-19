import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { officeFetch } from './lib/officeApi';

// Payroll > Compare: the pay of a month against the month before it, one line for each staff member, with the lines that changed marked and a reason. It reads the SAVED
// payslips (a draft saved in Pay run, or a locked month), so press Save draft first. October 2026 is what Infotech paid. This is a check that the figures are reasonable:
// it shows what moved, it cannot show that a figure that did not move is right.
type Slip = { net: number; kwsp: number; socso: number; eis: number; pcb: number; basic: number; ot: number; restPh: number; gross: number };
type Line = { id: string; code: string; name: string; company: string; before: Slip | null; now: Slip | null; flags: string[] };
const API = '/api/status?resource=hr';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r2 = (value: number) => Math.round(value * 100) / 100;
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slipOf = (slip: any): Slip | null => {
  const r = slip?.result; if (!r) return null;
  const n = (value: unknown) => Number(value) || 0;
  return { net: n(r.net), kwsp: n(r.kwspEmployee), socso: n(r.socsoEmployee), eis: n(r.eisEmployee), pcb: n(r.pcb), basic: n(r.basic), ot: n(r.ot), restPh: n(r.restPh), gross: n(r.gross) };
};
const previous = (year: number, month: number) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
const read = async (year: number, month: number) => {
  const response = await officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to read the payroll.');
  return new Map<string, { id: string; code: string; name: string; company: string; slip: Slip | null }>((result.staff || []).map((member: any) => [member.id, { id: member.id, code: member.employeeCode, name: member.fullName, company: member.company, slip: slipOf(member.payslip) }]));
};

export function HRPayrollCompare({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(11), [year] = useState(2026);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [show, setShow] = useState(false);
  const [place, setPlace] = useState('');
  useEffect(() => {
    let live = true; setLines(null);
    const before = previous(year, month);
    Promise.all([read(year, month), read(before.year, before.month)]).then(([nowMap, beforeMap]) => {
      if (!live) return;
      const ids = new Set([...nowMap.keys(), ...beforeMap.keys()]);
      const out: Line[] = [];
      for (const id of ids) {
        const a = beforeMap.get(id), b = nowMap.get(id), info = b || a!;
        const was = a?.slip || null, is = b?.slip || null, flags: string[] = [];
        if (!was && is) flags.push('Not paid last month');
        else if (was && !is) flags.push(b ? 'No payslip saved this month yet' : 'Not in this month');
        else if (was && is) {
          if (Math.abs(is.net - was.net) >= Math.max(100, was.net * 0.1)) flags.push('Net pay changed a lot');
          if (Math.abs(is.basic - was.basic) >= 1) flags.push('Basic pay changed (raise, unpaid leave or part month)');
          if (Math.abs(is.ot + is.restPh - was.ot - was.restPh) >= 1) flags.push('OT / Rest / PH changed');
          if (is.kwsp !== was.kwsp) flags.push('KWSP changed');
          if (is.pcb !== was.pcb) flags.push('PCB changed');
          if (is.socso !== was.socso || is.eis !== was.eis) flags.push('PERKESO / EIS changed');
        }
        out.push({ id, code: info.code, name: info.name, company: info.company, before: was, now: is, flags });
      }
      out.sort((x, y) => x.company.localeCompare(y.company) || x.code.localeCompare(y.code, undefined, { numeric: true }));
      setLines(out);
    }).catch((cause: Error) => { if (live) { setLines([]); onError(cause.message); } });
    return () => { live = false; };
  }, [month]);
  const shown = useMemo(() => (lines || []).filter((line) => (!place || line.company === place) && (!onlyChanged || line.flags.length)), [lines, onlyChanged, place]);
  const cell = (value: number | undefined) => value === undefined ? '' : show ? fmt(value) : '••••';
  const diff = (a: Slip | null, b: Slip | null, pick: (slip: Slip) => number) => a && b ? r2(pick(b) - pick(a)) : undefined;
  const csv = () => {
    const head = ['Code', 'Staff', 'Company', 'Net before', 'Net now', 'Net change', 'KWSP before', 'KWSP now', 'PCB before', 'PCB now', 'OT+Rest/PH before', 'OT+Rest/PH now', 'What changed'];
    const rows = shown.map((l) => [l.code, l.name, l.company, l.before?.net ?? '', l.now?.net ?? '', diff(l.before, l.now, (s) => s.net) ?? '', l.before?.kwsp ?? '', l.now?.kwsp ?? '', l.before?.pcb ?? '', l.now?.pcb ?? '', l.before ? r2(l.before.ot + l.before.restPh) : '', l.now ? r2(l.now.ot + l.now.restPh) : '', l.flags.join('; ')]);
    downloadBlob([[head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], `payroll-compare-${year}-${String(month).padStart(2, '0')}.csv`, 'text/csv');
  };
  const before = previous(year, month);
  const num = (value: number | undefined, tone = '') => <td className={`pr-3 text-right tabular-nums ${tone}`}>{cell(value)}</td>;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Compare with last month</h3><p className="text-sm text-slate-500">{MONTHS[month - 1]} {year} against {MONTHS[before.month - 1]} {before.year}. It reads the <strong>saved</strong> payslips, so press Save draft in Pay run first. October 2026 is what Infotech paid. Lines that changed are marked, with the reason.</p></div>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{[11, 12].map((value) => <option key={value} value={value}>{MONTHS[value - 1]} {year}</option>)}</select>
      <select aria-label="Company" value={place} onChange={(event) => setPlace(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} className="h-4 w-4" />Only lines that changed</label>
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      <button type="button" onClick={csv} disabled={!shown.length || !show} title={show ? '' : 'Press Show amounts first'} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />CSV</button>
    </div>
    {!lines ? <p className="text-sm text-slate-500">Reading the payslips…</p> : <>
      <p className="text-sm text-slate-500">{shown.length} of {lines.filter((line) => !place || line.company === place).length} staff shown · {lines.filter((line) => (!place || line.company === place) && line.flags.length).length} with something that changed.</p>
      <div className="overflow-x-auto"><table className="no-stack w-full min-w-[980px] text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Net before</th><th className="pr-3 text-right">Net now</th><th className="pr-3 text-right">Change</th><th className="pr-3 text-right">KWSP before</th><th className="pr-3 text-right">KWSP now</th><th className="pr-3 text-right">PCB before</th><th className="pr-3 text-right">PCB now</th><th className="pr-3 text-right">OT+Rest/PH before</th><th className="pr-3 text-right">OT+Rest/PH now</th><th>What changed</th></tr></thead>
        <tbody>{shown.map((line) => { const change = diff(line.before, line.now, (s) => s.net); return <tr key={line.id} className={`border-t border-slate-100 align-top ${line.flags.length ? 'bg-amber-50/50' : ''}`}>
          <td className="py-2 pr-3"><span className="font-semibold">{line.name}</span><span className="block text-xs text-slate-400">{line.code} · {line.company}</span></td>
          {num(line.before?.net)}{num(line.now?.net)}{num(change, change && Math.abs(change) >= 100 ? 'font-semibold text-rose-700' : '')}
          {num(line.before?.kwsp)}{num(line.now?.kwsp)}{num(line.before?.pcb)}{num(line.now?.pcb)}
          {num(line.before ? r2(line.before.ot + line.before.restPh) : undefined)}{num(line.now ? r2(line.now.ot + line.now.restPh) : undefined)}
          <td className="text-xs text-amber-800">{line.flags.join(' · ')}</td></tr>; })}</tbody></table></div>
      {!shown.length && <p className="text-sm text-slate-500">Nothing changed beyond the limits{onlyChanged ? ' (untick "Only lines that changed" to see everyone)' : ''}, or no payslip is saved for {MONTHS[month - 1]} yet.</p>}
      <p className="text-xs text-slate-400">Marked when: net pay moves by RM100 or 10%, basic pay changes, OT / Rest / PH changes, KWSP, PCB or PERKESO / EIS changes, or someone is in one month and not the other. This shows what moved; it cannot show that a figure that stayed the same is right.</p>
    </>}
  </section>;
}
