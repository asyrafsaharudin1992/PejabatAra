import { COMPANY, fmt, MONTHS, type Slip } from './MyPayslips';
import { payPeriod } from './lib/payrollRun';

// HR's payslip, laid out like the Infotech Employee Payslip Report (A4): the clinic and address, the staff member's details, Earnings and Deductions side by side
// with the totals, then the employer's share, the nett wages and the bank. The identity and bank numbers show only when HR has chosen to (`reveal`).
export type HRSlip = Slip & { ic: string; taxNo: string; socsoNo: string; epfNo: string; joinDate: string; bankAccount: string; annualLeaveDeduction: number; otherDeduction: number };
const two = (value: number) => fmt(Number(value) || 0);
const dmy = (iso: string) => iso ? iso.split('-').reverse().join('-') : '';
const mask = (value: string, reveal: boolean) => !value ? '' : reveal || value.length <= 4 ? value : `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;

export function HRPayslipSheet({ slip, reveal }: { slip: HRSlip; reveal: boolean }) {
  const company = COMPANY[slip.company] || { name: slip.company, address: '' };
  const period = payPeriod(slip.year, slip.month);
  const sum = (items: number[]) => Math.round(items.reduce((total, value) => total + (Number(value) || 0), 0) * 100) / 100;
  // Earnings: basic pay, each allowance, OT, rest day / public holiday pay, and whatever else made up the gross (shift or other allowance typed in Pay run).
  const earnings: [string, number][] = [['BASIC PAY', slip.basic], ...slip.allowances.map((item): [string, number] => [item.name.toUpperCase(), item.amount])];
  if (slip.ot > 0) earnings.push(['OVERTIME', slip.ot]);
  if (slip.restPh > 0) earnings.push(['REST DAY / PUBLIC HOLIDAY', slip.restPh]);
  const known = sum(earnings.map(([, value]) => value));
  if (slip.gross - known > 0.005) earnings.push(['SHIFT / OTHER ALLOWANCE', Math.round((slip.gross - known) * 100) / 100]);
  // Deductions: the leave and other deductions HR typed, then the statutory ones; anything left over (a slip brought over from Infotech) is shown as one line.
  const deductions: [string, number][] = [];
  if (slip.annualLeaveDeduction > 0) deductions.push(['ANNUAL LEAVE DEDUCTION', slip.annualLeaveDeduction]);
  if (slip.otherDeduction > 0) deductions.push(['OTHER DEDUCTION', slip.otherDeduction]);
  deductions.push(['EMPLOYEE EPF', slip.kwspEmployee], ['EMPLOYEE EIS', slip.eisEmployee], ['EMPLOYEE SOCSO', slip.socsoEmployee]);
  if (slip.skbbk > 0) deductions.push(['SKBBK', slip.skbbk]);
  if (slip.pcb > 0) deductions.push(['MTD/PCB', slip.pcb]);
  const listed = sum(deductions.map(([, value]) => value));
  if (slip.deductions - listed > 0.005) deductions.unshift([slip.annualLeaveDeduction > 0 ? 'OTHER DEDUCTION' : 'ANNUAL LEAVE / OTHER DEDUCTION', Math.round((slip.deductions - listed) * 100) / 100]);
  const label = 'text-[#555]';
  const info = (name: string, value: string) => <div className="flex gap-1.5"><span className={`w-[24mm] shrink-0 ${label}`}>{name}</span><span>:</span><span className="font-medium">{value || ''}</span></div>;
  const pair = (name: string, value: number) => <div className="flex"><span className="w-[30mm]">{name}</span><span className="w-[4mm]">:</span><span className="w-[24mm] text-right tabular-nums">{two(value)}</span></div>;
  return <div className="hrslip-sheet bg-white p-[9mm] text-[8.6pt] leading-[1.35] text-black" style={{ width: '210mm', minHeight: '270mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>
    <div className="flex items-start gap-3">
      <img src="/ara-logo.png" alt="" className="h-[17mm] w-[17mm] shrink-0 object-contain" />
      <div className="min-w-0 flex-1"><p className="text-[10.5pt] font-bold">{company.name.replace('Sdn Bhd', 'SDN. BHD.').toUpperCase().replace('SDN. BHD..', 'SDN. BHD.')}</p><p className="text-[8.5pt]">{company.address.toUpperCase()}</p></div>
      <p className="mt-6 text-right text-[8.6pt]">Payment Date : <span className="font-medium">{`26-${String(slip.month).padStart(2, '0')}-${slip.year}`}</span></p>
    </div>
    <div className="mt-1 border-b border-black" />
    <div className="mt-1.5 grid grid-cols-[1.25fr_1fr_1.1fr] gap-x-4 gap-y-1">
      {info('Employee Name', slip.name)}{info('Employee Code', slip.code)}{info('IC Number', mask(slip.ic, reveal))}
      {info('Tax Number', mask(slip.taxNo, reveal))}{info('SOCSO Number', mask(slip.socsoNo, reveal))}{info('EPF Number', mask(slip.epfNo, reveal))}
      {info('Designation Name', slip.designation)}{info('Join Date', dmy(slip.joinDate))}{info('Pay Period', `${dmy(period.from)} TO ${dmy(period.to)}`)}
    </div>
    <div className="mt-3 border border-black">
      <div className="grid grid-cols-[1fr_28mm_1fr_28mm] border-b border-black">
        <div className="px-1 py-0.5">EARNINGS DESCRIPTION</div><div className="border-l border-black px-1 py-0.5 text-center">EARNINGS</div><div className="border-l border-black px-1 py-0.5">DEDUCTIONS DESCRIPTION</div><div className="border-l border-black px-1 py-0.5 text-center">DEDUCTIONS</div>
      </div>
      <div className="grid min-h-[88mm] grid-cols-[1fr_28mm_1fr_28mm]">
        <div className="px-1 py-0.5">{earnings.map(([name]) => <p key={name}>{name}</p>)}</div>
        <div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{earnings.map(([name, value]) => <p key={name}>{two(value)}</p>)}</div>
        <div className="border-l border-black px-1 py-0.5">{deductions.map(([name]) => <p key={name}>{name}</p>)}</div>
        <div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{deductions.map(([name, value]) => <p key={name}>{two(value)}</p>)}</div>
      </div>
      <div className="grid grid-cols-[1fr_28mm_1fr_28mm] border-t border-black">
        <div className="px-1 py-0.5 text-right">Total Earnings</div><div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{two(slip.gross)}</div><div className="border-l border-black px-1 py-0.5 text-right">Total Deductions</div><div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{two(slip.deductions)}</div>
      </div>
      <div className="grid grid-cols-2 border-t border-black">
        <div>
          <div className="space-y-1 border-b border-black px-3 py-2">{pair('Gross Wages', slip.gross)}{pair('Employer EPF', slip.kwspEmployer)}{pair('Employer EIS', slip.eisEmployer)}{pair('Employer SOCSO', slip.socsoEmployer)}</div>
          <div className="space-y-0.5 px-1.5 py-2"><p>Pay Mode <span className="ml-2">: BANK GIRO</span></p><p>Bank Name1 <span className="ml-1">: {slip.bankName}</span></p><p>Ac.No1 <span className="ml-7">: {mask(slip.bankAccount, reveal)}</span></p></div>
        </div>
        <div className="space-y-1 border-l border-black px-3 py-2">{pair('Nett Wages', slip.net)}{pair('Employee EPF', slip.kwspEmployee)}{pair('Employee EIS', slip.eisEmployee)}{pair('Employee SOCSO', slip.socsoEmployee)}{pair('SKBBK', slip.skbbk || 0)}{pair('Zakat', 0)}{pair('MTD/PCB', slip.pcb)}</div>
      </div>
      <div className="grid grid-cols-2 border-t border-black text-[8pt]"><p className="px-1.5 py-1">This commission/allowance is not part of the regular salary.</p><p className="border-l border-black px-1.5 py-1">It is subject to change and may not be recurring.</p></div>
    </div>
    <p className="mt-2 text-[7.5pt] text-[#777]">{MONTHS[slip.month - 1]} {slip.year}</p>
  </div>;
}
