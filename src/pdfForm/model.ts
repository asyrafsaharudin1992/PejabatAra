// Forms made from a PDF: HR uploads the PDF and places fields on its pages; the answers are drawn on the same pages. Places are fractions of the page
// (0 to 1), so they stay right at any screen size.
export type FieldType = 'text' | 'paragraph' | 'check' | 'choice' | 'signature';
export type Field = { id: string; type: FieldType; page: number; x: number; y: number; w: number; h: number; who: string; label: string; required: boolean; group?: string; value?: string; source?: string; hint?: string };
export type Role = { id: string; label: string };
export type PdfForm = { title: string; roles: Role[]; fields: Field[] };
export type Answers = Record<string, string>;

export const DEFAULT_ROLES: Role[] = [{ id: 'staff', label: 'Staff' }, { id: 'hr', label: 'HR' }];
// Details that can be filled in by themselves from the staff profile.
export const SOURCES: [string, string][] = [['', 'Typed by the person'], ['name', 'Name'], ['code', 'Staff number'], ['ic', 'IC number'], ['position', 'Position'], ['department', 'Department'], ['company', 'Company'], ['age', 'Age'], ['gender', 'Gender'], ['service', 'Years of service'], ['resignDate', 'Last day of work'], ['today', 'Date signed']];
export const TYPE_NAME: Record<FieldType, string> = { text: 'Short text', paragraph: 'Long text', check: 'Tick box', choice: 'Choose one', signature: 'Signature' };
export const SIZE: Record<FieldType, [number, number]> = { text: [0.25, 0.022], paragraph: [0.6, 0.09], check: [0.022, 0.016], choice: [0.03, 0.022], signature: [0.22, 0.06] };

export const newId = () => Math.random().toString(36).slice(2, 10);
const inside = (value: number, size: number) => Math.min(Math.max(0, value), 1 - size);
export const place = (field: Field, x: number, y: number): Field => ({ ...field, x: inside(x, field.w), y: inside(y, field.h) });

// A row of choices (a rating scale, or Yes / No): `count` circles spread evenly from the first to the last position, sharing one answer.
export function choiceRow(first: { page: number; x: number; y: number }, last: { x: number; y: number }, labels: string[], who: string, question: string): Field[] {
  const [w, h] = SIZE.choice, group = newId(), count = labels.length;
  return labels.map((value, index) => {
    const part = count > 1 ? index / (count - 1) : 0;
    return { id: newId(), type: 'choice' as const, page: first.page, x: inside(first.x + (last.x - first.x) * part - w / 2, w), y: inside(first.y + (last.y - first.y) * part - h / 2, h), w, h, who, label: question, required: true, group, value };
  });
}
// A choice is answered under its group; every other field under its own id.
export const keyOf = (field: Field) => field.type === 'choice' && field.group ? field.group : field.id;
export function missing(form: PdfForm, who: string, answers: Answers): Field[] {
  const seen = new Set<string>();
  return form.fields.filter((field) => {
    if (field.who !== who || !field.required || field.type === 'check') return false;
    const key = keyOf(field); if (seen.has(key)) return false; seen.add(key);
    return !String(answers[key] || '').trim();
  });
}

// ---- Sending a form (used by the server and the pages) ----
export type Done = Record<string, { at: string; by: string }>;
// The people who have a part in a form: every role that has at least one field.
export const activeRoles = (form: { roles: Role[]; fields: Field[] }) => form.roles.filter((role) => form.fields.some((field) => field.who === role.id));
export const allDone = (form: { roles: Role[]; fields: Field[] }, done: Done) => activeRoles(form).every((role) => Boolean(done[role.id]));
// What may be saved for one role: only its own fields, short text, "yes" for a tick, one of the choices, or a small PNG signature.
export function cleanAnswers(fields: Field[], who: string, input: Record<string, unknown>): Answers {
  const result: Answers = {};
  for (const field of fields) {
    if (field.who !== who) continue;
    const key = keyOf(field); if (!(key in (input || {}))) continue;
    const value = String(input[key] ?? '');
    if (field.type === 'check') result[key] = value === 'yes' ? 'yes' : '';
    else if (field.type === 'choice') { if (!value || fields.some((item) => keyOf(item) === key && item.value === value)) result[key] = value; }
    else if (field.type === 'signature') { if (!value || (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 150000)) result[key] = value; }
    else result[key] = value.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').slice(0, field.type === 'paragraph' ? 1000 : 150);
  }
  return result;
}
export function cleanLayout(roles: unknown, fields: unknown): { roles: Role[]; fields: Field[] } {
  const types: FieldType[] = ['text', 'paragraph', 'check', 'choice', 'signature'];
  const number = (value: unknown) => Math.min(1, Math.max(0, Number(value) || 0)), short = (value: unknown, max: number) => String(value ?? '').slice(0, max);
  const people = (Array.isArray(roles) ? roles : []).slice(0, 10).map((role: any) => ({ id: short(role?.id, 20).replace(/[^a-z0-9]/gi, ''), label: short(role?.label, 40) })).filter((role) => role.id && role.label);
  const list = (Array.isArray(fields) ? fields : []).slice(0, 400).filter((field: any) => types.includes(field?.type) && people.some((role) => role.id === field.who)).map((field: any) => ({
    id: short(field.id, 20).replace(/[^a-z0-9]/gi, ''), type: field.type as FieldType, page: Math.max(0, Math.min(19, Math.floor(Number(field.page) || 0))), x: number(field.x), y: number(field.y), w: number(field.w), h: number(field.h),
    who: String(field.who), label: short(field.label, 200), required: Boolean(field.required), ...(field.group ? { group: short(field.group, 20).replace(/[^a-z0-9]/gi, '') } : {}), ...(field.value !== undefined ? { value: short(field.value, 40) } : {}), ...(field.source ? { source: short(field.source, 20) } : {}), ...(field.hint ? { hint: short(field.hint, 120) } : {}),
  })).filter((field) => field.id);
  return { roles: people, fields: list };
}
