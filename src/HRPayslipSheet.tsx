import { useEffect } from 'react';
import { COMPANY, fmt, leaveText, MONTHS, type Slip, type SlipLeave } from './MyPayslips';
import { slipPeriod, infotechRemark } from './lib/payrollRun';

// The payslip, laid out like the Infotech Employee Payslip Report (A4), the same for HR and for the staff member: the clinic and address, the staff member's details, Earnings and Deductions side by side
// with the totals, then the employer's share, the nett wages and the bank. The identity and bank numbers show only when HR has chosen to (`reveal`).
export type HRSlip = Slip & { ic: string; taxNo: string; socsoNo: string; epfNo: string; joinDate: string; resignDate?: string; bankAccount: string; annualLeaveDeduction: number; otherDeduction: number; adjustments?: { type: string; amount: number; note: string }[]; leave?: SlipLeave; printedRows?: { earnings: [string, number | null][]; deductions: [string, number | null][] }; increment?: number; otLines?: { heading: string; rows: { label: string; hours: number; amount: number }[] }[]; otFrom?: string; otTo?: string };
// Printing: the sheet is drawn once more in its own A4 document (the app around it is hidden while the print window is open).
export function useSlipPrint(active: boolean, title: string, onDone: () => void) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('hrslip-printing');
    const previous = document.title; document.title = title;
    const done = () => { document.body.classList.remove('hrslip-printing'); document.title = previous; onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    let cancelled = false;
    const timer = window.setTimeout(() => { void Promise.all([document.fonts.ready, ...Array.from(document.querySelectorAll<HTMLImageElement>('.hrslip-print img'), (image) => image.decode().catch(() => undefined))]).then(() => { if (!cancelled) window.print(); }); }, 80);
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('hrslip-printing'); document.title = previous; };
  }, [active]);
}

const two = (value: number) => fmt(Number(value) || 0);
const dmy = (iso: string) => iso ? iso.split('-').reverse().join('-') : '';
const mask = (value: string, reveal: boolean) => !value ? '' : reveal || value.length <= 4 ? value : `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;

export function HRPayslipSheet({ slip, reveal }: { slip: HRSlip; reveal: boolean }) {
  const company = COMPANY[slip.company] || { name: slip.company, address: '' };
  const period = slipPeriod(slip.year, slip.month, slip.resignDate);
  const sum = (items: number[]) => Math.round(items.reduce((total, value) => total + (Number(value) || 0), 0) * 100) / 100;
  // Earnings: basic pay, each allowance, OT, rest day / public holiday pay, and whatever else made up the gross (shift or other allowance typed in Pay run).
  // Unpaid leave as Infotech shows it: the full basic pay under Earnings and TOTAL NO PAY under Deductions (gross and nett do not change).
  const noPay = slip.noPay || 0;
  const earnings: [string, number | null][] = [['BASIC PAY', sum([slip.basic, noPay])], ...(slip.increment && slip.increment > 0 ? [[`INCREMENT : ${two(slip.increment)}`, null] as [string, null]] : []), ...slip.allowances.map((item): [string, number] => [item.name.toUpperCase(), item.amount])];
  if (slip.ot > 0) {
    // Infotech's layout: TOTAL OVER TIME with the amount, then the period and, for each block, its rates and hours.
    earnings.push(['TOTAL OVER TIME', slip.ot]);
    // A slip brought over from Infotech carries the OT lines exactly as Infotech printed them.
    if (slip.printedOt?.length) for (const line of slip.printedOt) earnings.push([`${line.startsWith('-') ? '   ' : '  '}${line}`, null]);
    else if (slip.otLines?.length && slip.otFrom && slip.otTo) {
      earnings.push([`  OT Period(s) ${dmy(slip.otFrom)} to ${dmy(slip.otTo)}`, null]);
      for (const block of slip.otLines) { if (block.heading) earnings.push([`  [${block.heading}]`, null]); for (const row of block.rows) earnings.push([`   - [${row.label}] ${row.hours.toFixed(2)} Hrs = ${two(row.amount)}`, null]); }
    }
  }
  if (slip.restPh > 0) earnings.push([slip.printedRestPh?.length ? 'TOTAL REST & PH' : 'REST DAY / PUBLIC HOLIDAY', slip.restPh]);
  if (slip.restPh > 0) for (const line of slip.printedRestPh || []) earnings.push([`${line.startsWith('-') ? '   ' : '  '}${line}`, null]);
  for (const item of (slip.adjustments || []).filter((line) => line.amount > 0)) earnings.push([`${item.type}${item.note ? ` - ${item.note}` : ''}`.toUpperCase(), item.amount]);
  const known = sum(earnings.map(([, value]) => value ?? 0));
  if (slip.gross + noPay - known > 0.005) earnings.push(['SHIFT / OTHER ALLOWANCE', Math.round((slip.gross + noPay - known) * 100) / 100]);
  // An incentive Infotech lists under earnings but pays outside the nett wages (January and February 2026): shown and added to Total Earnings only.
  const outside = slip.infotechIncentive || 0;
  if (outside > 0) earnings.push(['INCENTIVES', outside]);
  // Deductions: the leave and other deductions HR typed, then the statutory ones; anything left over (a slip brought over from Infotech) is shown as one line.
  const deductions: [string, number][] = [];
  if (slip.annualLeaveDeduction > 0) deductions.push(['ANNUAL LEAVE DEDUCTION', slip.annualLeaveDeduction]);
  const lessLines = (slip.adjustments || []).filter((line) => line.amount < 0);
  for (const item of lessLines) deductions.push([`${item.type}${item.note ? ` - ${item.note}` : ''}`.toUpperCase(), -item.amount]);
  if (slip.otherDeduction > 0) deductions.push(['OTHER DEDUCTION', slip.otherDeduction]);
  deductions.push(['EMPLOYEE EPF', slip.kwspEmployee], ['EMPLOYEE EIS', slip.eisEmployee], ['EMPLOYEE SOCSO', slip.socsoEmployee]);
  if (slip.skbbk > 0) deductions.push(['SKBBK', slip.skbbk]);
  if (slip.pcb > 0) deductions.push(['MTD/PCB', slip.pcb]);
  for (const item of slip.deductionLines || []) deductions.unshift([item.name, item.amount]);
  const listed = sum(deductions.map(([, value]) => value));
  if (slip.deductions - listed > 0.005) deductions.unshift([slip.annualLeaveDeduction > 0 ? 'OTHER DEDUCTION' : 'ANNUAL LEAVE / OTHER DEDUCTION', Math.round((slip.deductions - listed) * 100) / 100]);
  const shown: [string, number | null][] = [...(noPay > 0 ? [['TOTAL NO PAY', noPay], [`[${period.from} TO ${period.to} CURRENT]`, null], ...(slip.noPayLines?.length ? slip.noPayLines.map((item) => [` - ${item.kind} - ${item.qty.toFixed(2)} ${item.unit} =${two(item.amount)}`, null]) : slip.unpaidDays ? [[` - UnPaid Leaves - ${slip.unpaidDays.toFixed(2)} Days =${two(noPay)}`, null]] : [])] as [string, number | null][] : []), ...deductions];
  // A month brought over from Infotech prints the lines exactly as Infotech did (sub-lines set in, as there).
  const asPrinted = (lines: [string, number | null][]) => lines.map(([name, value]): [string, number | null] => [`${name.startsWith('-') ? '   ' : /^(\[|OT Period|INCREMENT\])/.test(name) ? '  ' : ''}${name}`, value]);
  const earningLines = slip.printedRows ? asPrinted(slip.printedRows.earnings) : earnings;
  const deductionLines = slip.printedRows ? asPrinted(slip.printedRows.deductions) : shown;
  const label = 'text-[#555]';
  const info = (name: string, value: string) => <div className="flex gap-1.5"><span className={`w-[24mm] shrink-0 ${label}`}>{name}</span><span>:</span><span className="font-medium">{value || ''}</span></div>;
  const pair = (name: string, value: number) => <div className="flex"><span className="w-[30mm]">{name}</span><span className="w-[4mm]">:</span><span className="w-[24mm] text-right tabular-nums">{two(value)}</span></div>;
  return <div className="hrslip-sheet bg-white p-[9mm] text-[8.6pt] leading-[1.35] text-black" style={{ width: '210mm', minHeight: '270mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>
    <div className="flex items-start gap-3">
      <img src="/ara-logo.png" alt="" className="h-[17mm] w-[17mm] shrink-0 object-contain" />
      <div className="min-w-0 flex-1"><p className="text-[10.5pt] font-bold">{company.name.replace('Sdn Bhd', 'SDN. BHD.').toUpperCase().replace('SDN. BHD..', 'SDN. BHD.')}</p><p className="text-[8.5pt]">{company.address.toUpperCase()}</p></div>
      <p className="mt-6 text-right text-[8.6pt]">Payment Date : <span className="font-medium">{slip.printedRows ? '' : `26-${String(slip.month).padStart(2, '0')}-${slip.year}`}</span></p>
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
        <div className="relative col-span-2">
          <div className="absolute inset-y-0 right-[28mm] border-l border-black" />
          {earningLines.map(([name, value], at) => { const indent = name.match(/^ */)?.[0].length || 0; return <div key={at} className="grid grid-cols-[1fr_28mm]"><p className="py-0.5 pr-1" style={{ paddingLeft: `${1 + indent * 1.3}mm` }}>{name.trimStart()}</p><p className="px-1 py-0.5 text-right tabular-nums">{value === null ? '\u00a0' : two(value)}</p></div>; })}
        </div>
        <div className="border-l border-black px-1 py-0.5">{deductionLines.map(([name], at) => <p key={at} className="min-h-[1.9em] py-0.5" style={{ paddingLeft: `${(name.match(/^ */)?.[0].length || 0) * 1.3}mm` }}>{name.trimStart()}</p>)}</div>
        <div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{deductionLines.map(([, value], at) => <p key={at} className="min-h-[1.9em] py-0.5">{value === null ? '\u00a0' : two(value)}</p>)}</div>
      </div>
      <div className="grid grid-cols-[1fr_28mm_1fr_28mm] border-t border-black">
        <div className="px-1 py-0.5 text-right">Total Earnings</div><div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{two(sum([slip.gross, noPay, outside]))}</div><div className="border-l border-black px-1 py-0.5 text-right">Total Deductions</div><div className="border-l border-black px-1 py-0.5 text-right tabular-nums">{two(sum([slip.deductions, noPay]))}</div>
      </div>
      <div className="grid grid-cols-2 border-t border-black">
        <div>
          <div className="space-y-1 border-b border-black px-3 py-2">{pair('Gross Wages', slip.gross)}{pair('Employer EPF', slip.kwspEmployer)}{pair('Employer EIS', slip.eisEmployer)}{pair('Employer SOCSO', slip.socsoEmployer)}</div>
          <div className="space-y-0.5 px-1.5 py-2"><p>Pay Mode <span className="ml-2">: BANK GIRO</span></p><p>Bank Name1 <span className="ml-1">: {slip.bankName}</span></p><p>Ac.No1 <span className="ml-7">: {mask(slip.bankAccount, reveal)}</span></p></div>
        </div>
        <div className="space-y-1 border-l border-black px-3 py-2">{pair('Nett Wages', slip.net)}{pair('Employee EPF', slip.kwspEmployee)}{pair('Employee EIS', slip.eisEmployee)}{pair('Employee SOCSO', slip.socsoEmployee)}{pair('SKBBK', slip.skbbk || 0)}{pair('Zakat', 0)}{pair('MTD/PCB', slip.pcb)}{(slip.leaveShown || slip.leave) && <><div className="mt-2 flex"><span className="w-[30mm]">AL/Bal/YTD</span><span className="w-[4mm]">:</span><span className="tabular-nums">{slip.leaveShown ? slip.leaveShown.al : leaveText(slip.leave!.al)}</span></div><div className="flex"><span className="w-[30mm]">ML/Bal/YTD</span><span className="w-[4mm]">:</span><span className="tabular-nums">{slip.leaveShown ? slip.leaveShown.ml : leaveText(slip.leave!.ml)}</span></div></>}</div>
      </div>
      <div className="grid grid-cols-2 border-t border-black text-[8pt]"><p className="px-1.5 py-1">This commission/allowance is not part of the regular salary.</p><p className="border-l border-black px-1.5 py-1">It is subject to change and may not be recurring.</p></div>
    </div>
    {infotechRemark(slip.year, slip.month, slip.ot > 0 || slip.restPh > 0) && <p className="mt-2 text-[8pt]">{infotechRemark(slip.year, slip.month, slip.ot > 0 || slip.restPh > 0)}</p>}
    <p className="mt-2 text-[7.5pt] text-[#777]">{MONTHS[slip.month - 1]} {slip.year}</p>
  </div>;
}
