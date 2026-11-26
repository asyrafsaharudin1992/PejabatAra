// Months whose payslips are held back from staff accounts for the time being (HR still sees them). Kept in portal_state under "hidden_payslips" as
// { "months": ["2026-11"] }, so a month is shown again by taking it off the list, with no new release.
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
export const monthList = (rows: { payload?: any }[]) => new Set<string>(rows.flatMap((row) => Array.isArray(row.payload?.months) ? row.payload.months.map(String) : []));
export async function hiddenPayslips(db: any) {
  const { data, error } = await db.from('portal_state').select('payload').eq('state_key', 'hidden_payslips').limit(10);
  if (error) throw error;
  return monthList(data || []);
}
