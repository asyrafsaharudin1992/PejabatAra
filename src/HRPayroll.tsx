import { Banknote, Check, Circle } from 'lucide-react';
import { card } from './AssessmentStaff';

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

export function HRPayroll() {
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p>
      <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-tight"><Banknote className="h-8 w-8 text-[#ffb000]" />Payroll</h2>
      <p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Monthly pay, statutory deductions and payslips, replacing Infotech from the November 2026 pay run. Being built in pieces; pay is still run in Infotech until this is checked against it.</p>
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      <List title="Set up first" steps={SETUP} />
      <List title="Each month" steps={MONTHLY} />
    </div>
  </div>;
}
