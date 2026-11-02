import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, Circle, Eye, EyeOff, Lock } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { calculatePayslip, NO_INPUTS, payPeriod, type PayInputs, type PayStaff, type PayYtd } from './lib/payrollRun';

// Payroll room, built a piece at a time: it replaces Infotech's Info-Pay from the November 2026 pay run.
// Nothing here changes any pay record yet; the list shows what is in place and what is still to come.
type Step = { title: string; text: string; done?: boolean };

const SETUP: Step[] = [
  { title: 'Staff pay details', text: 'Basic salary, bank, KWSP, PERKESO and tax numbers, monthly allowances (Director Fee), employment history.', done: true },
  { title: 'Payroll settings per staff', text: 'KWSP rate, PERKESO category, EIS, SKBBK, tax residency, pay group, OT type, probation, flexi hours, rest day.', done: true },
  { title: 'Allowance types', text: 'Only the types in use: Director Fee, which counts towards PCB but not KWSP, PERKESO, EIS or HRDF. The other 16 Infotech types are not paid to anyone, so they are left out.', done: true },
  { title: 'Reference lists', text: 'Bank codes and LHDN branches, for the bank file and the PCB submission.' },
  { title: 'Year to date, January to October', text: 'Wages, KWSP relief and PCB already paid this year for the 26 current staff, read from the Infotech pay run, so November PCB is worked out correctly.', done: true },
];
const MONTHLY: Step[] = [
  { title: 'Start the month', text: 'Pick the month and the staff, then fix the pay period for each pay group.' },
  { title: 'Bring in attendance, leave and claims', text: 'Late, unpaid leave and OT from AraOffice.' },
  { title: 'Work out the pay', text: 'KWSP, PERKESO, EIS, SKBBK and PCB, then net pay.' },
  { title: 'Check against Infotech', text: 'Each payslip beside the Infotech payslip for the same month, with every difference shown.' },
  { title: 'Lock and publish payslips', text: 'Staff see only their own payslip in Individual Sign In.' },
  { title: 'Bank file and statutory submissions', text: 'Salary transfer file, KWSP, PERKESO, EIS and PCB.' },
];

function List({ title, steps }: { title: string; steps: Step[] }) {
  return <section className={card}>
    <h3 className="font-semibold">{title}</h3>
    <ul className="mt-3 divide-y divide-slate-100">{steps.map((step) => <li key={step.title} className="flex gap-3 py-3">
      {step.done ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
      <div><p className="text-sm font-semibold text-[#14233b]">{step.title}{step.done && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Done</span>}</p><p className="mt-0.5 text-sm text-slate-500">{step.text}</p></div>
    </li>)}</ul>
  </section>;
}

// ---- Monthly pay run -------------------------------------------------------------------------------------------------------
type RunStaff = PayStaff & { id: string; company: string; employeeCode: string; fullName: string; ytd: PayYtd; hasYtd: boolean; earlierLocked: boolean; payslip: { status: 'draft' | 'locked'; inputs: PayInputs } | null };
const API = '/api/status?resource=hr';
const FIELDS: [keyof PayInputs, string][] = [['ot', 'OT'], ['restPh', 'Rest / PH'], ['shiftAllowance', 'Shift'], ['unpaidLeave', 'Unpaid leave'], ['otherAllowance', 'Other add'], ['otherDeduction', 'Other deduct']];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PayRun({ onError }: { onError: (message: string) => void }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(11);
  const [staff, setStaff] = useState<RunStaff[] | null>(null);
  const [asOf, setAsOf] = useState('');
  const [inputs, setInputs] = useState<Record<string, PayInputs>>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const load = async () => {
    setStaff(null); setNote('');
    try {
      const response = await officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setAsOf(data.asOf);
      setStaff(data.staff);
      setInputs(Object.fromEntries(data.staff.map((member: RunStaff) => [member.id, { ...NO_INPUTS, ...(member.payslip?.inputs || {}) }])));
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load the pay run.'); setStaff([]); }
  };
  useEffect(() => { void load(); }, [month]);
  const rows = useMemo(() => (staff || []).map((member) => ({ member, out: calculatePayslip(member, inputs[member.id] || NO_INPUTS, member.ytd, year, month) })), [staff, inputs, month]);
  const locked = Boolean(staff?.length && staff.every((member) => member.payslip?.status === 'locked'));
  const blocked = Boolean(staff?.some((member) => !member.earlierLocked));
  const total = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  const save = async (lock: boolean) => {
    setBusy(lock ? 'lock' : 'save'); setNote('');
    try {
      const response = await officeFetch(`${API}&action=payroll_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, lock, items: (staff || []).map((member) => ({ employeeId: member.id, inputs: inputs[member.id] || NO_INPUTS })) }) });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setNote(lock ? `${MONTH_NAMES[month - 1]} ${year} is locked.` : `Draft saved for ${data.saved} staff.`);
      await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy('');
  };
  const cell = (value: number) => show ? fmt(value) : '••••';
  const period = payPeriod(year, month);
  const dmy = (value: string) => value.split('-').reverse().join('/');
  return <section className={card}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Monthly pay run</h3><p className="mt-0.5 text-xs text-slate-500">Pay period {dmy(period.from)} to {dmy(period.to)} (OT and unpaid leave are counted for these days). Year-to-date totals in from Infotech up to {asOf || 'October 2026'}; each month needs the one before it locked.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{[11, 12].map((m) => <option key={m} value={m}>{MONTH_NAMES[m - 1]} {year}</option>)}</select>
        <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      </div>
    </div>
    {staff === null ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : !staff.length ? <p className="mt-4 text-sm text-slate-500">Nothing to show for this month.</p> : <>
      {blocked && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">An earlier month is not locked yet, so the year-to-date totals (and PCB) below are not final.</p>}
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs">
        <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Basic</th>{FIELDS.map(([, label]) => <th key={label} className="pr-2">{label}</th>)}<th className="pr-3 text-right">Gross</th><th className="pr-3 text-right">KWSP</th><th className="pr-3 text-right">PERKESO</th><th className="pr-3 text-right">EIS</th><th className="pr-3 text-right">SKBBK</th><th className="pr-3 text-right">PCB</th><th className="text-right">Net</th></tr></thead>
        <tbody>{rows.map(({ member, out }) => { const slipLocked = member.payslip?.status === 'locked'; return <tr key={member.id} className="border-t border-slate-100">
          <td className="py-2 pr-3"><p className="font-semibold text-[#14233b]">{member.fullName}</p><p className="text-[10px] text-slate-400">{member.employeeCode}{!member.hasYtd && ' · no year-to-date'}{slipLocked && ' · locked'}</p></td>
          <td className="pr-3 text-right">{cell(out.basic)}</td>
          {FIELDS.map(([key]) => <td key={key} className="pr-2"><input type="number" min="0" step="0.01" disabled={slipLocked} value={inputs[member.id]?.[key] || ''} onChange={(event) => setInputs({ ...inputs, [member.id]: { ...(inputs[member.id] || NO_INPUTS), [key]: Number(event.target.value) || 0 } })} className="h-8 w-[74px] rounded-lg border border-slate-200 px-2 text-right disabled:bg-slate-50" /></td>)}
          <td className="pr-3 text-right font-semibold">{cell(out.gross)}</td><td className="pr-3 text-right">{cell(out.kwspEmployee)}</td><td className="pr-3 text-right">{cell(out.socsoEmployee)}</td><td className="pr-3 text-right">{cell(out.eisEmployee)}</td><td className="pr-3 text-right">{cell(out.skbbk)}</td><td className="pr-3 text-right">{cell(out.pcb)}</td><td className="text-right font-bold text-[#0b587b]">{cell(out.net)}</td>
        </tr>; })}</tbody>
        <tfoot><tr className="border-t-2 border-slate-200 font-semibold"><td className="py-2 pr-3">Total · {rows.length} staff</td><td className="pr-3 text-right">{cell(total((r) => r.out.basic))}</td><td colSpan={FIELDS.length} /><td className="pr-3 text-right">{cell(total((r) => r.out.gross))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.kwspEmployee))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.socsoEmployee))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.eisEmployee))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.skbbk))}</td><td className="pr-3 text-right">{cell(total((r) => r.out.pcb))}</td><td className="text-right text-[#0b587b]">{cell(total((r) => r.out.net))}</td></tr></tfoot>
      </table></div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={Boolean(busy) || locked} onClick={() => void save(false)} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" disabled={Boolean(busy) || locked || blocked} onClick={() => { if (window.confirm(`Lock ${MONTH_NAMES[month - 1]} ${year}? A locked month cannot be changed and feeds the next month's PCB.`)) void save(true); }} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50"><Lock className="h-4 w-4" />{busy === 'lock' ? 'Locking…' : 'Lock month'}</button>
        {locked && <span className="text-sm font-semibold text-emerald-600">This month is locked.</span>}{note && <span className="text-sm text-slate-600">{note}</span>}
      </div>
      <p className="mt-3 text-xs text-slate-400">OT, rest-day / PH pay, unpaid leave and the like are typed in by HR for now; they will come from attendance and leave when those are brought over. Amounts stay hidden until Show amounts is pressed.</p>
    </>}
  </section>;
}

export function HRPayroll({ onError = () => {} }: { onError?: (message: string) => void }) {
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p>
      <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-tight"><Banknote className="h-8 w-8 text-[#ffb000]" />Payroll</h2>
      <p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Monthly pay, statutory deductions and payslips, replacing Infotech from the November 2026 pay run. Being built in pieces; pay is still run in Infotech until this is checked against it.</p>
    </section>
    <PayRun onError={onError} />
    <div className="grid gap-5 lg:grid-cols-2">
      <List title="Set up first" steps={SETUP} />
      <List title="Each month" steps={MONTHLY} />
    </div>
  </div>;
}
