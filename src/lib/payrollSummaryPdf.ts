import { unpaidDayRate } from './payrollRun';

// The Monthly Payroll Summary (By Individual), laid out like Infotech's "Monthly PayRoll Summary Detailed Report (By Individual) End Pay":
// one landscape page (or more) for each company, one line for each person, and a Total line at the end.
export type SummaryRow = {
  code: string; name: string; company: string; basicSalary: number;
  inputs: { unpaidLeave?: number; unpaidDays?: number; shiftAllowance?: number; otherAllowance?: number; otherDeduction?: number; annualLeaveDeduction?: number };
  out: { basic: number; ot: number; restPh: number; allowances: { amount: number }[]; gross: number; kwspEmployee: number; kwspEmployer: number; socsoEmployee: number; socsoEmployer: number; eisEmployee: number; eisEmployer: number; skbbk: number; hrdf: number; pcb: number; net: number };
};
// KJ and SK are two clinics of one company: the company name is the same, and each clinic has its own pages and its own Total.
const COMPANY_NAME = 'HSO HEALTHCARE SDN BHD';
const BRANCH: Record<string, string> = { KJ: 'KJ (Kajang)', SK: 'SK (Seri Kembangan)' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r2 = (value: number) => Math.round(value * 100) / 100;
const f = (value: number) => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);

export async function payrollSummaryPdf(rows: SummaryRow[], year: number, month: number): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Column widths in mm (the sum fits the page): No, Code, Name, then the money columns in Infotech's order.
  const cols: { key: string; w: number }[] = [
    { key: 'no', w: 6 }, { key: 'code', w: 13 }, { key: 'name', w: 32 }, { key: 'totSal', w: 13 }, { key: 'ot', w: 10 }, { key: 'shift', w: 8 }, { key: 'restPh', w: 10 }, { key: 'allow', w: 12 }, { key: 'noPay', w: 11 }, { key: 'bonus', w: 8 }, { key: 'gross', w: 13 }, { key: 'ded', w: 10 },
    { key: 'epfEr', w: 10 }, { key: 'epfEe', w: 10 }, { key: 'epfTot', w: 11 }, { key: 'socEr', w: 10 }, { key: 'socEe', w: 9 }, { key: 'socTot', w: 10 }, { key: 'eisEr', w: 8 }, { key: 'eisEe', w: 8 }, { key: 'eisTot', w: 9 },
    { key: 'skbbk', w: 8 }, { key: 'hrdf', w: 9 }, { key: 'zakat', w: 7 }, { key: 'pcb', w: 10 }, { key: 'cp38', w: 8 }, { key: 'net', w: 13 },
  ];
  const left = 5, total = cols.reduce((sum, col) => sum + col.w, 0), pageW = 297, pageH = 210;
  const xs: number[] = []; let acc = left; for (const col of cols) { xs.push(acc); acc += col.w; }
  const x = (key: string) => xs[cols.findIndex((col) => col.key === key)], w = (key: string) => cols.find((col) => col.key === key)!.w;
  const blue: [number, number, number] = [31, 78, 121];
  const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' });
  const label = `${MONTHS[month - 1]}- ${year}`;

  const lines = (row: SummaryRow) => {
    const unpaid = r2((row.inputs.unpaidLeave || 0) + unpaidDayRate(row.basicSalary) * (row.inputs.unpaidDays || 0));
    const allow = r2(row.out.allowances.reduce((sum, item) => sum + item.amount, 0) + (row.inputs.otherAllowance || 0));
    const shift = row.inputs.shiftAllowance || 0;
    return {
      totSal: r2(row.out.basic + unpaid), ot: row.out.ot, shift, restPh: row.out.restPh, allow, noPay: -unpaid, bonus: 0, gross: row.out.gross, ded: -r2((row.inputs.otherDeduction || 0) + (row.inputs.annualLeaveDeduction || 0)),
      epfEr: row.out.kwspEmployer, epfEe: row.out.kwspEmployee, epfTot: r2(row.out.kwspEmployer + row.out.kwspEmployee), socEr: row.out.socsoEmployer, socEe: row.out.socsoEmployee, socTot: r2(row.out.socsoEmployer + row.out.socsoEmployee),
      eisEr: row.out.eisEmployer, eisEe: row.out.eisEmployee, eisTot: r2(row.out.eisEmployer + row.out.eisEmployee), skbbk: row.out.skbbk, hrdf: row.out.hrdf, zakat: 0, pcb: row.out.pcb, cp38: 0, net: row.out.net,
    } as Record<string, number>;
  };
  const MONEY = cols.map((col) => col.key).filter((key) => !['no', 'code', 'name'].includes(key));

  const companies = ['KJ', 'SK'].filter((code) => rows.some((row) => row.company === code));
  let first = true;
  for (const code of companies) {
    const staff = rows.filter((row) => row.company === code).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const perPage = 17;
    const pages = Math.max(1, Math.ceil(staff.length / perPage));
    const sums: Record<string, number> = Object.fromEntries(MONEY.map((key) => [key, 0]));
    for (const row of staff) { const l = lines(row); for (const key of MONEY) sums[key] = r2(sums[key] + l[key]); }
    for (let page = 0; page < pages; page++) {
      if (!first) pdf.addPage(); first = false;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...blue); pdf.text(COMPANY_NAME, pageW / 2, 13, { align: 'center' });
      pdf.setFontSize(10.5); pdf.text(`Monthly PayRoll Summary Detailed Report (By Individual) End Pay - MONTH [${label}]`, pageW / 2, 19.5, { align: 'center' });
      pdf.setFont('times', 'normal'); pdf.setFontSize(7); pdf.setTextColor(0, 0, 0); pdf.text(`Page ${page + 1} of ${pages}`, pageW - 8, 10, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.text(`Date : ${today}`, left + 4, 24);
      // The header: group names above the column names, between two lines.
      let y = 27; pdf.setDrawColor(31, 78, 121); pdf.setLineWidth(0.4); pdf.line(left, y, left + total, y);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.2); pdf.setTextColor(60, 60, 60);
      const centre = (key: string, s: string, yy: number) => pdf.text(s, x(key) + w(key) / 2, yy, { align: 'center' });
      const group = (a: string, b: string, s: string, yy: number) => pdf.text(s, (x(a) + x(b) + w(b)) / 2, yy, { align: 'center' });
      centre('shift', 'Allow', y + 3); centre('restPh', 'Rest/PH', y + 3); centre('allow', 'Allowance', y + 3); centre('noPay', 'Deduction', y + 3); centre('ded', 'Deduction', y + 3);
      group('epfEr', 'epfTot', 'EPF Contribution', y + 3); group('socEr', 'socTot', 'SOCSO Contribution', y + 3); group('eisEr', 'eisTot', 'EIS Contribution', y + 3);
      y += 7.5;
      const names: Record<string, string> = { no: 'No.', code: 'Code', name: 'Emp. Name', totSal: 'Tot. Sal', ot: 'OT Amt', shift: 'Shift', restPh: 'Amount', allow: 'Add', noPay: 'No Pay', bonus: 'Bonus', gross: 'Gross', ded: 'Ded', epfEr: 'Emplyr', epfEe: 'Emp', epfTot: 'Total', socEr: 'Emplyr', socEe: 'Emp', socTot: 'Total', eisEr: 'Emplyr', eisEe: 'Emp', eisTot: 'Total', skbbk: 'SKBBK', hrdf: 'HRDF', zakat: 'Zakat', pcb: 'PCB', cp38: 'CP38', net: 'NettWgs' };
      for (const col of cols) { if (['no', 'code', 'name'].includes(col.key)) pdf.text(names[col.key], x(col.key) + (col.key === 'no' ? 1 : col.key === 'code' ? 1 : 2), y); else pdf.text(names[col.key], x(col.key) + col.w - 0.8, y, { align: 'right' }); }
      y += 1.8; pdf.line(left, y, left + total, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...blue); pdf.setFontSize(6); pdf.text(`Company Name : ${COMPANY_NAME}  ·  Branch : ${BRANCH[code] || code}`, left + 1, y + 4); y += 6.5;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.6); pdf.setTextColor(30, 30, 30);
      const slice = staff.slice(page * perPage, (page + 1) * perPage);
      slice.forEach((row, index) => {
        const l = lines(row), parts = pdf.splitTextToSize(row.name, w('name') - 2) as string[];
        const height = parts.length > 1 ? 7.4 : 4.6, mid = y + (height === 7.4 ? 2.6 : 3.2);
        pdf.text(String(page * perPage + index + 1), x('no') + 1, mid); pdf.text(row.code, x('code') + 1, mid);
        parts.slice(0, 2).forEach((part, at) => pdf.text(part, x('name') + 2, y + 2.6 + at * 2.6));
        for (const key of MONEY) pdf.text(f(l[key]), x(key) + w(key) - 0.8, mid, { align: 'right' });
        y += height;
      });
      if (page === pages - 1) {
        pdf.setDrawColor(120, 120, 120); pdf.setLineWidth(0.25); pdf.line(left, y - 0.6, left + total, y - 0.6);
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...blue); pdf.text('Total:', x('totSal') - 2, y + 3, { align: 'right' }); pdf.setTextColor(0, 0, 0);
        for (const key of MONEY) pdf.text(f(sums[key]), x(key) + w(key) - 0.8, y + 3, { align: 'right' });
      }
    }
  }
  return pdf.output('blob');
}
