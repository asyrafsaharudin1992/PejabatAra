import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { ADJUSTMENT_TYPES, NO_INPUTS, adjustmentTotals, calculatePayslip, payPeriod, proratedSalary, type Adjustment, type PayInputs, type PayStaff, type PayYtd } from './lib/payrollRun';
import { card } from './AssessmentStaff';

// Payroll > Salary adjustment: one person's pay for one month on a single screen, laid out like Infotech's Monthly Activity > Salary Adjustment
// (salary, additions and deductions, OT, unpaid, shift, rest day and public holiday, total wages, contributions). Everything is worked out live
// with the same calculation as Pay run; Update saves that person's draft, so Pay run, the payslip and the files follow it. A locked month is read only.
type Person = PayStaff & { id: string; company: string; employeeCode: string; fullName: string; status?: string; ytd: PayYtd; attendanceRestPh?: { restDays: number; phDays: number }; attendanceUnpaid?: number; attendanceOt?: { ot10?: number; ot15?: number; ot20?: number; ot30?: number }; payslip: { status: 'draft' | 'locked'; inputs: PayInputs; result?: Record<string, unknown> } | null };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const API = '/api/status?resource=hr';
const field = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm';
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (value: string) => value.split('-').reverse().join('-');

function Box({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 border-b border-slate-100 pb-2 text-base font-semibold text-[#14233b]">{title}</h3>{children}</div>;
}
function Row({ label, children, strong = false }: { label: string; children?: ReactNode; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${strong ? 'font-bold text-[#14233b]' : 'text-slate-600'}`}><span>{label}</span><span className="text-right tabular-nums">{children}</span></div>;
}

export function HRPayrollSalaryAdjustment({ onError }: { onError: (message: string) => void }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(11);
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [id, setId] = useState('');
  const [inputs, setInputs] = useState<PayInputs>(NO_INPUTS);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const load = async (keep = '') => {
    setStaff(null); setNote('');
    try {
      const data = await (await officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`)).json();
      if (data.error) throw new Error(data.error);
      setStaff(data.staff);
      const pick = data.staff.find((person: Person) => person.id === (keep || id)) || data.staff[0];
      if (pick) { setId(pick.id); setInputs({ ...NO_INPUTS, ...(pick.payslip?.inputs || {}) }); }
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load the month.'); setStaff([]); }
  };
  useEffect(() => { void load(); }, [month]);
  const list = useMemo(() => (staff || []).filter((person) => !search || `${person.fullName} ${person.employeeCode}`.toLowerCase().includes(search.toLowerCase())), [staff, search]);
  const person = (staff || []).find((item) => item.id === id) || null;
  const choose = (next: Person | undefined) => { if (!next) return; setId(next.id); setInputs({ ...NO_INPUTS, ...(next.payslip?.inputs || {}) }); setNote(''); };
  const step = (by: number) => { const at = list.findIndex((item) => item.id === id); choose(list[Math.min(list.length - 1, Math.max(0, at + by))]); };
  const locked = person?.payslip?.status === 'locked';
  const out = useMemo(() => {
    if (!person) return null;
    const fresh = calculatePayslip(person, locked ? NO_INPUTS : inputs, person.ytd, year, month);
    return locked && person.payslip?.result ? { ...fresh, ...person.payslip.result } as typeof fresh : fresh;
  }, [person, inputs, locked, month]);
  const dirty = person ? JSON.stringify({ ...NO_INPUTS, ...(person.payslip?.inputs || {}) }) !== JSON.stringify(inputs) : false;
  const set = (patch: Partial<PayInputs>) => setInputs((current) => ({ ...current, ...patch }));
  const num = (key: keyof PayInputs) => (event: ChangeEvent<HTMLInputElement>) => set({ [key]: Number(event.target.value) || 0 } as Partial<PayInputs>);
  const lines = inputs.adjustments || [];
  const editLines = (next: Adjustment[]) => set({ adjustments: next });
  const fill = () => {
    if (!person) return;
    set({ ot10: person.attendanceOt?.ot10 || 0, ot15: person.attendanceOt?.ot15 || 0, ot20: person.attendanceOt?.ot20 || 0, ot30: person.attendanceOt?.ot30 || 0, restDays: person.attendanceRestPh?.restDays || 0, phDays: person.attendanceRestPh?.phDays || 0, unpaidDays: person.attendanceUnpaid || 0 });
    setNote('OT, rest and public holiday days and unpaid days filled from Attendance and Leave. Check them, then press Update.');
  };
  const update = async () => {
    if (!person) return;
    setBusy(true); setNote('');
    try {
      const body = { year, month, lock: false, items: [{ employeeId: person.id, inputs: { ...inputs, adjustments: lines.filter((item) => Number(item.amount) !== 0) } }] };
      const response = await officeFetch(`${API}&action=payroll_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to save.');
      await load(person.id); setNote(`Updated ${person.fullName}. Pay run and the payslip now follow it.`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy(false);
  };
  const cash = (value: number) => show ? fmt(value) : '••••';
  const period = payPeriod(year, month);
  const earned = person ? proratedSalary(person.basicSalary, year, month, person.joinDate, person.resignDate, person.salaryChanges) : null;
  // Infotech shows the salary before a raise as Basic and the by-the-day share of the raise as Increment; a joiner or leaver's missing days are a separate line.
  const raises = person ? (person.salaryChanges || []).filter((item) => item.date > period.from && item.date <= period.to).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const startSalary = person ? (raises.length ? raises[0].from : person.basicSalary) : 0;
  const wholePeriod = person && earned ? proratedSalary(person.basicSalary, year, month, null, null, person.salaryChanges).amount : 0;
  const increment = raises.length ? Math.round((wholePeriod - startSalary) * 100) / 100 : 0;
  const partial = earned ? Math.round((earned.amount - startSalary - increment) * 100) / 100 : 0;
  // The amounts as the pay run works them out (days before a raise use the old salary). A locked slip saved without them was worked out at the latest salary.
  const saved = locked ? person?.payslip?.result as { otByRate?: Record<string, number>; noPay?: number } | undefined : undefined;
  const worked = person ? calculatePayslip(locked ? { ...person, salaryChanges: [], workDays: [] } : person, inputs, person.ytd, year, month) : null;
  const otAmounts: Record<string, number> = saved?.otByRate || worked?.otByRate || {};
  const extra = adjustmentTotals(lines.map((item) => ({ ...item, amount: Number(item.amount) || 0 })));
  const unpaid = saved?.noPay ?? worked?.noPay ?? 0;
  const otRows: [keyof PayInputs, string][] = [['ot10', '1.0'], ['ot15', '1.5'], ['ot20', '2.0'], ['ot30', '3.0']];
  const ro = locked || !show;

  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1"><h2 className="text-lg font-semibold">Salary adjustment</h2><p className="text-sm text-slate-500">One person's pay for the month on one screen, like Infotech. Change the figures and the totals follow; press <b>Update</b> to save. Press <b>Show amounts</b> first (the figures are private).</p></div>
      <label className="text-xs font-bold text-slate-600">Month<select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} className={`${field} mt-1 block h-10`}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name} {year}</option>)}</select></label>
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Previous" onClick={() => step(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#0b587b]"><ChevronLeft className="h-4 w-4" /></button>
      <button type="button" aria-label="Next" onClick={() => step(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#0b587b]"><ChevronRight className="h-4 w-4" /></button>
      <input aria-label="Search staff" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or code" className={`${field} h-10 w-48`} />
      <select aria-label="Staff" value={id} onChange={(event) => choose((staff || []).find((item) => item.id === event.target.value))} className={`${field} h-10 min-w-[260px] flex-1`}>{list.map((item) => <option key={item.id} value={item.id}>{item.employeeCode} · {item.fullName}</option>)}</select>
    </div>
    {note && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{note}</p>}
    {!staff ? <p className="text-sm text-slate-500">Loading…</p> : !person || !out || !earned ? <p className="text-sm text-slate-500">No staff found for this month.</p> : <>
      <div className="rounded-2xl bg-[#f4fafd] p-4">
        <p className="text-lg font-bold text-[#14233b]">{person.employeeCode} : {person.fullName} <span className="ml-2 text-xs font-semibold text-emerald-600">{person.status || 'Active'}{locked ? ' · locked' : ''}</span></p>
        <div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
          <span>Company: <b>{person.company}</b></span>
          <span>Join date: <b>{person.joinDate ? dmy(person.joinDate) : '—'}</b>{person.resignDate && <> · Last day: <b>{dmy(person.resignDate)}</b></>}</span>
          <span>Pay group: <b>{String(person.settings.payGroup || '—')}</b></span>
          <span>EPF: <b>Staff {typeof person.settings.epfRate === 'number' ? person.settings.epfRate : 11}%</b></span>
          <span>Pay period: <b>{dmy(period.from)} to {dmy(period.to)}</b></span>
          <span>Working days: <b>{earned.worked}</b> of {earned.total} · Monthly salary: <b>{cash(person.basicSalary)}</b></span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Additions / Deductions">
          <p className="mb-2 text-xs text-slate-500">Use + to add to the pay and − to take off (back pay, bonus, advance, director fee, incentive).</p>
          {!lines.length && <p className="py-2 text-sm text-slate-400">No information found</p>}
          {lines.map((item, index) => <div key={index} className="mb-2 flex flex-wrap items-center gap-2">
            <select aria-label="Type" disabled={ro} value={item.type} onChange={(event) => editLines(lines.map((row, at) => at === index ? { ...row, type: event.target.value } : row))} className={field}>{ADJUSTMENT_TYPES.map((name) => <option key={name}>{name}</option>)}</select>
            <input aria-label="Amount (+ add, - take off)" disabled={ro} type="number" step="0.01" value={show ? item.amount || '' : ''} placeholder={show ? 'Amount' : '••••'} onChange={(event) => editLines(lines.map((row, at) => at === index ? { ...row, amount: Number(event.target.value) || 0 } : row))} className={`${field} w-28 text-right`} />
            <input aria-label="Note" disabled={ro} maxLength={60} value={item.note} onChange={(event) => editLines(lines.map((row, at) => at === index ? { ...row, note: event.target.value } : row))} placeholder="Note (on the payslip)" className={`${field} min-w-[120px] flex-1`} />
            {!ro && <button type="button" aria-label="Remove line" onClick={() => editLines(lines.filter((_, at) => at !== index))} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
          </div>)}
          {!ro && <button type="button" onClick={() => editLines([...lines, { type: 'Back pay', amount: 0, note: '' }])} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#0b587b]"><Plus className="h-3.5 w-3.5" />Add line</button>}
          {person.fixedAllowances.length > 0 && <div className="mt-3 border-t border-slate-100 pt-2"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly allowances (from the profile)</p>{person.fixedAllowances.map((item) => <div key={item.name}><Row label={item.name}>{cash(item.amount)}</Row></div>)}</div>}
        </Box>
        <Box title="Overtime details">
          <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><span /><span className="text-right">Hours</span><span className="text-right">Amount</span></div>
          {otRows.map(([key, label]) => <div key={key} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2 py-1 text-sm"><span className="font-semibold text-slate-600">{label}</span><input aria-label={`OT ${label} hours`} disabled={ro} type="number" step="0.25" min="0" value={show ? Number(inputs[key]) || '' : ''} placeholder={show ? '0' : '••••'} onChange={num(key)} className={`${field} text-right`} /><span className="text-right tabular-nums">{cash(otAmounts[key] || 0)}</span></div>)}
          <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2 py-1 text-sm"><span className="font-semibold text-slate-600">RM</span><span className="text-right text-xs text-slate-400">typed amount</span><input aria-label="OT amount typed" disabled={ro} type="number" step="0.01" min="0" value={show ? inputs.ot || '' : ''} placeholder={show ? '0.00' : '••••'} onChange={num('ot')} className={`${field} text-right`} /></div>
          <Row label="Total OT amount" strong>{cash(out.ot)}</Row>
          <div className="mt-3 border-t border-slate-100 pt-2">
            <Row label="Rest days worked"><input aria-label="Rest days" disabled={ro} type="number" step="0.5" min="0" value={show ? inputs.restDays || '' : ''} placeholder={show ? '0' : '••••'} onChange={num('restDays')} className={`${field} w-24 text-right`} /></Row>
            <Row label="Public holidays worked"><input aria-label="Public holiday days" disabled={ro} type="number" step="0.5" min="0" value={show ? inputs.phDays || '' : ''} placeholder={show ? '0' : '••••'} onChange={num('phDays')} className={`${field} w-24 text-right`} /></Row>
            <Row label="Total rest day and public holiday amount" strong>{cash(out.restPh)}</Row>
          </div>
        </Box>
        <Box title="Unpaid, absent and lateness">
          <Row label="Unpaid leave (days)"><input aria-label="Unpaid days" disabled={ro} type="number" step="0.5" min="0" value={show ? inputs.unpaidDays || '' : ''} placeholder={show ? '0' : '••••'} onChange={num('unpaidDays')} className={`${field} w-24 text-right`} /></Row>
          <Row label="Unpaid amount (RM, typed)"><input aria-label="Unpaid amount typed" disabled={ro} type="number" step="0.01" min="0" value={show ? inputs.unpaidLeave || '' : ''} placeholder={show ? '0.00' : '••••'} onChange={num('unpaidLeave')} className={`${field} w-28 text-right`} /></Row>
          <Row label="Annual leave deduction (RM)"><input aria-label="Annual leave deduction" disabled={ro} type="number" step="0.01" min="0" value={show ? inputs.annualLeaveDeduction || '' : ''} placeholder={show ? '0.00' : '••••'} onChange={num('annualLeaveDeduction')} className={`${field} w-28 text-right`} /></Row>
          <Row label="Total deduction" strong>{cash(unpaid + (inputs.annualLeaveDeduction || 0))}</Row>
        </Box>
        <Box title="Shift allowance">
          <Row label="Shift allowance (RM)"><input aria-label="Shift allowance" disabled={ro} type="number" step="0.01" min="0" value={show ? inputs.shiftAllowance || '' : ''} placeholder={show ? '0.00' : '••••'} onChange={num('shiftAllowance')} className={`${field} w-28 text-right`} /></Row>
        </Box>
        <Box title="Salary details">
          <Row label="Basic salary">{cash(startSalary)}</Row>
          <Row label="Increment">{cash(increment)}</Row>
          {partial !== 0 && <Row label={`Part month (${earned.worked} of ${earned.total} days)`}>{cash(partial)}</Row>}
          <Row label="Total salary" strong>{cash(earned.amount)}</Row>
        </Box>
        <Box title="Total wages details">
          <Row label="Allowance additions">{cash(extra.add + out.allowances.reduce((sum, item) => sum + item.amount, 0))}</Row>
          <Row label="Overtime">{cash(out.ot)}</Row>
          <Row label="Rest day and public holiday">{cash(out.restPh)}</Row>
          <Row label="Shift allowance">{cash(inputs.shiftAllowance)}</Row>
          <Row label="(−) Nonpay deductions">{cash(unpaid)}</Row>
          <Row label="Gross wages" strong>{cash(out.gross)}</Row>
          <Row label="(−) Other deductions">{cash(extra.less + inputs.otherDeduction + (inputs.annualLeaveDeduction || 0))}</Row>
          <Row label="(−) Employee contribution">{cash(out.kwspEmployee + out.socsoEmployee + out.eisEmployee + out.skbbk + out.pcb)}</Row>
          <Row label="Nett wages" strong>{cash(out.net)}</Row>
          <Row label="EPF wages">{cash(out.kwspWage)}</Row>
        </Box>
      </div>
      <Box title="Contribution details">
        <table className="no-stack w-full text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-1.5" /><th className="text-right">Employee</th><th className="text-right">Employer</th></tr></thead><tbody>
          {([['EPF', out.kwspEmployee, out.kwspEmployer], ['EIS', out.eisEmployee, out.eisEmployer], ['SOCSO', out.socsoEmployee, out.socsoEmployer], ['SKBBK', out.skbbk, null], ['MTD/PCB', out.pcb, null], ['HRDF', null, out.hrdf]] as [string, number | null, number | null][]).map(([name, a, b]) => <tr key={name} className="border-t border-slate-100"><td className="py-1.5 font-semibold text-slate-600">{name}</td><td className="text-right tabular-nums">{a === null ? '—' : cash(a)}</td><td className="text-right tabular-nums">{b === null ? '—' : cash(b)}</td></tr>)}
          <tr className="border-t border-slate-200 font-bold text-[#14233b]"><td className="py-1.5">Total</td><td className="text-right tabular-nums">{cash(out.kwspEmployee + out.eisEmployee + out.socsoEmployee + out.skbbk + out.pcb)}</td><td className="text-right tabular-nums">{cash(out.kwspEmployer + out.eisEmployer + out.socsoEmployer + out.hrdf)}</td></tr>
        </tbody></table>
      </Box>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {locked && <span className="mr-auto text-sm text-slate-500">This month is locked, so it can only be read. Unlock it in Pay run to change it.</span>}
        {!locked && <button type="button" onClick={fill} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b]" title="Fills OT, rest and PH days and unpaid days from Attendance and Leave">Fill from Attendance</button>}
        {!locked && <button type="button" disabled={!dirty || busy} onClick={() => { setInputs({ ...NO_INPUTS, ...(person.payslip?.inputs || {}) }); setNote(''); }} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 disabled:opacity-40">Cancel</button>}
        {!locked && <button type="button" disabled={!dirty || busy || !show} onClick={() => void update()} title={show ? '' : 'Press Show amounts first'} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Update'}</button>}
      </div>
    </>}
  </section>;
}
