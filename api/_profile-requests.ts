// A staff member asks HR to change their own personal details; HR approves or rejects (table hr_profile_requests, migration
// 202611010002). Only these details can be asked for. IC, passport, bank, pay, KWSP, PERKESO, tax and job details are HR's alone.
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

export const REQUEST_COLUMNS = ['date_of_birth', 'religion', 'race', 'nationality', 'marital_status', 'address_line1', 'address_line2', 'postcode', 'city', 'state',
  'phone', 'email', 'emergency_name', 'emergency_relation', 'emergency_phone', 'spouse_name', 'spouse_employer', 'spouse_phone', 'children', 'education'] as const;
export const REQUEST_SELECT = `id,full_name,company,employee_code,${REQUEST_COLUMNS.join(',')}`;

// The value as it would be saved, or an error for a value that is not allowed.
export function cleanValue(column: string, value: unknown, existing: any) {
  switch (column) {
    case 'date_of_birth': if (value === '' || value === null) return null; if (!isDate(value)) throw fail(400, 'Enter the date of birth as a date.'); return value;
    case 'marital_status': { const allowed = ['', 'Single', 'Married', 'Divorced', 'Widowed']; if (!allowed.includes(String(value ?? ''))) throw fail(400, 'Choose a marital status from the list.'); return String(value ?? ''); }
    case 'email': { const email = text(value, 120); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address.'); return email; }
    case 'children': {
      const before = new Map((Array.isArray(existing?.children) ? existing.children : []).map((child: any) => [String(child?.name || '').toLowerCase(), child]));
      return (Array.isArray(value) ? value : []).slice(0, 20).map((child: any) => { const name = text(child?.name, 120); const kept: any = before.get(name.toLowerCase()); return { name, dateOfBirth: isDate(child?.dateOfBirth) ? child.dateOfBirth : null, studying: Boolean(kept?.studying), disabled: Boolean(kept?.disabled) }; }).filter((child: any) => child.name);
    }
    case 'education': return (Array.isArray(value) ? value : []).slice(0, 12).map((item: any) => ({ level: text(item?.level, 60), institution: text(item?.institution, 120), course: text(item?.course, 120), year: text(item?.year, 4).replace(/\D/g, '') })).filter((item: any) => item.level || item.institution || item.course);
    case 'address_line1': case 'address_line2': return text(value, 160);
    case 'emergency_name': case 'spouse_name': case 'spouse_employer': return text(value, 120);
    case 'religion': case 'race': case 'nationality': case 'city': case 'state': return text(value, 60);
    case 'postcode': return text(value, 10);
    default: return text(value, 30); // phone numbers and the emergency relationship
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? (typeof b === 'string' ? '' : null)) === JSON.stringify(b ?? (typeof a === 'string' ? '' : null));

// What actually changes: each asked-for column that is allowed and differs from the record, as { column: { from, to } }.
export function changesFrom(person: any, input: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const column of REQUEST_COLUMNS) {
    if (!(column in input)) continue;
    const to = cleanValue(column, input[column], person);
    const from = person[column] ?? (column === 'children' || column === 'education' ? [] : '');
    if (!same(from, to)) changes[column] = { from, to };
  }
  return changes;
}

// The columns to save when HR approves; the one-line address is kept in step with its parts.
export function patchFrom(person: any, changes: Record<string, { from: unknown; to: unknown }>) {
  const patch: Record<string, unknown> = {};
  for (const [column, change] of Object.entries(changes)) if ((REQUEST_COLUMNS as readonly string[]).includes(column)) patch[column] = cleanValue(column, change.to, person);
  if (['address_line1', 'address_line2', 'postcode', 'city', 'state'].some((column) => column in patch)) {
    const merged: any = { ...person, ...patch };
    patch.address = [merged.address_line1, merged.address_line2, [merged.postcode, merged.city].filter(Boolean).join(' '), merged.state].map((part: string) => String(part || '').replace(/[,\s]+$/, '')).filter(Boolean).join(', ');
  }
  return patch;
}
