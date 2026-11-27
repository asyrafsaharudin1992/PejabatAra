// The original Infotech payslips for the months Infotech paid (January to October 2026): one PDF page per person per month, kept in the private
// storage bucket "infotech-payslips" (put there by scripts/upload-infotech-payslips.mts). Only the server reads the bucket.
export const infotechMonth = (year: number, month: number) => year === 2026 && month >= 1 && month <= 10;
export const infotechPath = (employeeId: string, year: number, month: number) => `${year}/${String(month).padStart(2, '0')}/${employeeId}.pdf`;
// The PDF as base64, or '' when there is none for that person and month.
export async function infotechSlip(db: any, employeeId: string, year: number, month: number) {
  if (!infotechMonth(year, month)) return '';
  const { data, error } = await db.storage.from('infotech-payslips').download(infotechPath(employeeId, year, month));
  return error || !data ? '' : Buffer.from(await data.arrayBuffer()).toString('base64');
}
