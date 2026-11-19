// The Incentive Allowance summary, laid out like the sheet HR uses: one landscape page (or more) for each branch, a line for each person, and a Total line.
export type IncentiveSummaryRow = {
  code: string; name: string; company: string; ic: string; joinDate: string;
  salesCommission: number; bonus: number; sotm: number; special: number; trainer: number; night: number; care: number; outstanding: number; doctor: number; ca: number; other: number;
  total: number; deduction: number; nett: number;
};
export const AMOUNT_COLUMNS: { key: keyof IncentiveSummaryRow; label: string; w: number }[] = [
  { key: 'salesCommission', label: 'Sales Commision', w: 15 }, { key: 'bonus', label: 'Bonus', w: 12 }, { key: 'sotm', label: 'Staff of The Month (SOTM) - RM100', w: 15 }, { key: 'special', label: 'Special Programme Insentif', w: 15 },
  { key: 'trainer', label: 'Trainer Insentif', w: 12 }, { key: 'night', label: 'Elaun Night Shift', w: 12 }, { key: 'care', label: 'Coordinat Care Insentif', w: 14 }, { key: 'outstanding', label: 'Outstanding payment', w: 13 },
  { key: 'doctor', label: 'Total Incentive Doctor', w: 14 }, { key: 'ca', label: 'Total Incentive CA', w: 13 }, { key: 'other', label: 'Other Insentif', w: 12 }, { key: 'total', label: 'Total', w: 15 },
  { key: 'deduction', label: 'Other Deduction', w: 13 }, { key: 'nett', label: 'Nett Payment', w: 16 },
];
const BRANCH: Record<string, string> = { KJ: 'KAJANG', SK: 'SERI KEMBANGAN' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}-${month.slice(2, 4)}`;
export const amount = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (date: string) => date ? date.split('-').reverse().map((part, index) => index < 2 ? String(Number(part)) : part).join('/') : '';
export const branchRows = (rows: IncentiveSummaryRow[], company: string) => rows.filter((row) => row.company === company);
export const totalsOf = (rows: IncentiveSummaryRow[]) => Object.fromEntries(AMOUNT_COLUMNS.map((col) => [col.key, Math.round(rows.reduce((sum, row) => sum + Number(row[col.key]), 0) * 100) / 100])) as Record<string, number>;

// The ARA logo, at the top left of every page.
async function logo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch('/ara-logo.png')).blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const bitmap = await createImageBitmap(blob); const size = { w: bitmap.width, h: bitmap.height }; bitmap.close();
    return { data, ...size };
  } catch { return null; }
}

export async function incentiveSummaryPdf(rows: IncentiveSummaryRow[], month: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const mark = await logo();
  const first = [{ key: 'no', label: 'No.', w: 6 }, { key: 'name', label: 'Employee Name', w: 50 }, { key: 'ic', label: 'IC/Passport No.', w: 23 }, { key: 'join', label: 'JOIN DATE', w: 16 }];
  const left = 6, widths = [...first.map((col) => col.w), ...AMOUNT_COLUMNS.map((col) => col.w)], tableW = widths.reduce((sum, w) => sum + w, 0), xs: number[] = []; let at = left; for (const w of widths) { xs.push(at); at += w; }
  const perPage = 24, rowH = 5.4, headH = 11;
  const fills: [number, number, number][] = [...first.map((): [number, number, number] => [255, 255, 0]), ...AMOUNT_COLUMNS.map((col): [number, number, number] => col.key === 'deduction' ? [248, 203, 173] : col.key === 'nett' ? [198, 224, 180] : [157, 195, 230])];
  let firstPage = true;
  for (const company of ['KJ', 'SK']) {
    const list = branchRows(rows, company); if (!list.length) continue;
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    for (let page = 0; page < pages; page++) {
      if (!firstPage) pdf.addPage(); firstPage = false;
      if (mark) { const height = 14, width = height * mark.w / mark.h; pdf.addImage(mark.data, 'PNG', 8, 5, width, height); }
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(11); pdf.text('KLINIK ARA 24 JAM', 148.5, 16, { align: 'center' });
      pdf.setFontSize(10); pdf.text(`INCENTIVE ALLOWANCE BRANCH ${BRANCH[company]}`, 148.5, 22, { align: 'center' });
      pdf.setFontSize(9); pdf.text(monthShort(month), 148.5, 28, { align: 'center' });
      let y = 34;
      pdf.setDrawColor(150, 150, 150); pdf.setLineWidth(0.15);
      widths.forEach((w, index) => { pdf.setFillColor(...fills[index]); pdf.rect(xs[index], y, w, headH, 'FD'); });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.8);
      const labels = [...first.map((col) => col.label), ...AMOUNT_COLUMNS.map((col) => col.label)];
      labels.forEach((label, index) => { const lines = pdf.splitTextToSize(label, widths[index] - 1.2) as string[]; const top = y + headH / 2 - (lines.length - 1) * 1.1 + 0.8; lines.slice(0, 4).forEach((line, i) => pdf.text(line, xs[index] + widths[index] / 2, top + i * 2.2, { align: 'center' })); });
      y += headH;
      pdf.setFontSize(5.4);
      const slice = list.slice(page * perPage, (page + 1) * perPage);
      slice.forEach((row, index) => {
        widths.forEach((w, i) => pdf.rect(xs[i], y, w, rowH));
        const mid = y + rowH / 2 + 0.9;
        pdf.text(String(page * perPage + index + 1), xs[0] + first[0].w / 2, mid, { align: 'center' });
        pdf.text(row.name.length > 40 ? row.name.slice(0, 39) + '.' : row.name, xs[1] + 1, mid);
        pdf.text(row.ic, xs[2] + 1, mid); pdf.text(dmy(row.joinDate), xs[3] + first[3].w - 1, mid, { align: 'right' });
        AMOUNT_COLUMNS.forEach((col, i) => {
          const value = Number(row[col.key]), x = xs[first.length + i] + col.w - 1;
          if (col.key === 'total' || col.key === 'nett') { pdf.setFont('helvetica', col.key === 'nett' ? 'bold' : 'normal'); pdf.text(value ? amount(value) : '-', x, mid, { align: 'right' }); pdf.setFont('helvetica', 'normal'); }
          else if (value) pdf.text(amount(value), x, mid, { align: 'right' });
        });
        y += rowH;
      });
      if (page === pages - 1) {
        const sums = totalsOf(list);
        pdf.setFillColor(217, 217, 217); widths.forEach((w, i) => pdf.rect(xs[i], y, w, rowH, 'FD'));
        pdf.setFont('helvetica', 'bold'); pdf.text('TOTAL', xs[3] + first[3].w - 1, y + rowH / 2 + 0.9, { align: 'right' });
        AMOUNT_COLUMNS.forEach((col, i) => pdf.text(sums[col.key as string] ? amount(sums[col.key as string]) : '-', xs[first.length + i] + col.w - 1, y + rowH / 2 + 0.9, { align: 'right' }));
        pdf.setFont('helvetica', 'normal');
      }
    }
  }
  return pdf.output('blob');
}

export function incentiveSummaryCsv(rows: IncentiveSummaryRow[], month: string): string {
  const cell = (value: string | number) => { const raw = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value); return /[",\n']/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; };
  const head = ['Branch', 'No.', 'Employee Name', 'IC/Passport No.', 'Join date', ...AMOUNT_COLUMNS.map((col) => col.label)];
  const lines: (string | number)[][] = [];
  for (const company of ['KJ', 'SK']) branchRows(rows, company).forEach((row, index) => lines.push([company, index + 1, row.name, row.ic, row.joinDate, ...AMOUNT_COLUMNS.map((col) => row[col.key] as number)]));
  return [[`Incentive Allowance ${monthShort(month)}`], head, ...lines].map((line) => line.map(cell).join(',')).join('\r\n');
}
