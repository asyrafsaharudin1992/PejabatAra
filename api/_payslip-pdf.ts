import { jsPDF } from 'jspdf';
import { payPeriod } from '../src/lib/payrollRun.js';

// A password-protected PDF of one payslip, laid out like the Infotech payslip. The staff member opens it with their AraOffice password.
export type PayslipData = { year: number; month: number; name: string; code: string; company: string; designation: string; department: string; basic: number; allowances: { name: string; amount: number }[]; ot: number; restPh: number; gross: number; kwspEmployee: number; kwspEmployer: number; socsoEmployee: number; socsoEmployer: number; eisEmployee: number; eisEmployer: number; skbbk: number; pcb: number; net: number; ytdWages: number; ytdPcb: number; bankName: string; bankAccountEnd: string };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COMPANY: Record<string, { name: string; address: string }> = {
  KJ: { name: 'KJ- HSO Healthcare Sdn Bhd', address: 'D-13-GA Jalan Prima Saujana 2/F, Taman Prima Saujana, 43000 Kajang, Selangor' },
  SK: { name: 'SK- HSO Healthcare Sdn Bhd', address: 'No. F-1-G, Blok F Putra Walk, Jalan PP25, Taman Pinggiran Putra, 43300 Seri Kembangan, Selangor' },
};
const fmt = (value: number) => (Number(value) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function payslipPdf(slip: PayslipData, password: string): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', encryption: { userPassword: password, ownerPassword: `${password}-owner-${slip.code}`, userPermissions: ['print'] } });
  const company = COMPANY[slip.company] || { name: slip.company, address: '' };
  const period = payPeriod(slip.year, slip.month);
  const left = 18, right = 192;
  let y = 22;
  const line = (label: string, value: string, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.text(label, left, y); doc.text(value, right, y, { align: 'right' }); y += 6.5; };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(company.name, left, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90); doc.text(doc.splitTextToSize(company.address, right - left), left, y); y += 9; doc.setTextColor(0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(`Payslip · ${MONTHS[slip.month - 1]} ${slip.year}`, left, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${slip.name} (${slip.code})`, left, y); y += 5.5;
  doc.text(`${slip.designation || '-'}${slip.department ? ` · ${slip.department}` : ''}`, left, y); y += 5.5;
  doc.text(`Pay period: ${longDate(period.from)} to ${longDate(period.to)}`, left, y); y += 9;
  doc.setDrawColor(180); doc.line(left, y - 4, right, y - 4);
  line('BASIC PAY', fmt(slip.basic));
  for (const item of slip.allowances) line(item.name.toUpperCase(), fmt(item.amount));
  if (slip.ot > 0) line('OVERTIME', fmt(slip.ot));
  if (slip.restPh > 0) line('REST DAY / PUBLIC HOLIDAY', fmt(slip.restPh));
  line('EMPLOYEE EPF', `-${fmt(slip.kwspEmployee)}`); line('EMPLOYEE EIS', `-${fmt(slip.eisEmployee)}`); line('EMPLOYEE SOCSO', `-${fmt(slip.socsoEmployee)}`);
  if (slip.skbbk > 0) line('SKBBK', `-${fmt(slip.skbbk)}`);
  if (slip.pcb > 0) line('MTD/PCB', `-${fmt(slip.pcb)}`);
  doc.line(left, y - 4, right, y - 4);
  line('GROSS WAGES', fmt(slip.gross), true); line('NETT WAGES', fmt(slip.net), true); y += 2;
  doc.setTextColor(80);
  line('Employer EPF', fmt(slip.kwspEmployer)); line('Employer EIS', fmt(slip.eisEmployer)); line('Employer SOCSO', fmt(slip.socsoEmployer));
  line('Pay so far this year', fmt(slip.ytdWages)); line('PCB so far this year', fmt(slip.ytdPcb)); doc.setTextColor(0); y += 2;
  line('Salary credited to', 'BANK GIRO'); line('Bank account', `${slip.bankName || '-'}${slip.bankAccountEnd ? ` (**** ${slip.bankAccountEnd})` : ''}`); line('Paid on', `26 ${MONTHS[slip.month - 1]} ${slip.year}`);
  y += 6; doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120); doc.text('This is a system generated payslip and does not require signature.', 105, y, { align: 'center' });
  return Buffer.from(doc.output('arraybuffer'));
}
