// Employment history lines written by AraOffice itself when HR adds a staff member or changes the profile. (History up to the move came from Infotech.)
export type CareerLine = { event_date: string | null; kind: string; detail: string; from_value: string; to_value: string; amount: number | null; source: string };
type Row = Record<string, any>;
const line = (kind: string, event_date: string | null, detail = '', from_value = '', to_value = ''): CareerLine => ({ event_date, kind, detail, from_value: from_value.slice(0, 60), to_value: to_value.slice(0, 60), amount: null, source: 'AraOffice' });
const text = (value: unknown) => String(value ?? '').trim();

// A new profile: the date joined.
export const joinLine = (row: Row): CareerLine[] => row.join_date ? [line('Join Date', row.join_date)] : [];

// A saved profile. A basic salary typed over in the profile is kept as "Other", not as a raise: a raise (which the pay run splits by the day) is added
// with the Increment button.
export function changeLines(before: Row, after: Row, today: string): CareerLine[] {
  const lines: CareerLine[] = [];
  const moved = (key: string) => key in after && text(before[key]) !== text(after[key]);
  if (moved('designation') && text(after.designation)) lines.push(line('Designation', today, 'DESIGNATION', text(before.designation), text(after.designation)));
  if (moved('department') && text(after.department)) lines.push(line('Department', today, 'DEPARTMENT', text(before.department), text(after.department)));
  if (moved('company')) lines.push(line('Other', today, 'COMPANY', text(before.company), text(after.company)));
  if (moved('employment_type') && text(before.employment_type)) lines.push(line('Other', today, 'EMPLOYMENT TYPE', text(before.employment_type), text(after.employment_type)));
  if (moved('confirm_date') && after.confirm_date) lines.push(line('Confirmation', after.confirm_date, before.confirm_date ? 'DATE CHANGED' : 'CONFIRMED'));
  if (moved('resign_date')) lines.push(after.resign_date ? line('Resignation', after.resign_date, before.resign_date ? 'LAST WORKING DAY CHANGED' : 'LAST WORKING DAY') : line('Other', today, 'LAST WORKING DAY REMOVED', text(before.resign_date)));
  if ('basic_salary' in after && Number(before.basic_salary || 0) !== Number(after.basic_salary || 0)) lines.push(line('Other', today, 'BASIC SALARY (CHANGED IN PROFILE)', Number(before.basic_salary || 0).toFixed(2), Number(after.basic_salary || 0).toFixed(2)));
  return lines;
}
