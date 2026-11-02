// The Finance summary of confirmed incentive pay for one claim month: by company, with totals. Only confirmed payments go in.
type Paid = { company: string; code: string; name: string; procedures: number; confirmedAmount: number | null };
export function incentiveSummaryCsv(monthLabel: string, paidOn: string, paid: Paid[]): string {
  const q = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const amountOf = (item: Paid) => item.confirmedAmount || 0;
  const lines: string[][] = [[`Incentive pay: claims of ${monthLabel}`], [`To be paid on ${paidOn}`, 'No KWSP, PERKESO, EIS or PCB deducted'], [], ['Company', 'Staff code', 'Name', 'Approved entries', 'Amount (RM)']];
  for (const company of ['KJ', 'SK']) {
    const rows = paid.filter((item) => item.company === company);
    for (const item of rows) lines.push([company, item.code, item.name, String(item.procedures), amountOf(item).toFixed(2)]);
    lines.push([`${company} total`, '', '', String(rows.reduce((sum, item) => sum + item.procedures, 0)), rows.reduce((sum, item) => sum + amountOf(item), 0).toFixed(2)], []);
  }
  lines.push(['Grand total', '', '', String(paid.reduce((sum, item) => sum + item.procedures, 0)), paid.reduce((sum, item) => sum + amountOf(item), 0).toFixed(2)]);
  return lines.map((line) => line.map(q).join(',')).join('\r\n');
}
