import { ASSISTANT_ITEMS } from './assistantReview';

// The part of the review form wording that the server also uses: the record's shape and a clean-up of what is typed or saved. No browser code in here (the API
// imports it). See reviewFormText.ts for how the wording is put over the forms.
export type FormText = {
  names?: { standard?: string; assistant?: string };
  areas?: Record<string, { label?: string; criteria?: string[] }>;
  items?: { name?: string; note?: string }[];
};
export const DEFAULT_NAMES = { standard: 'Performance Assessment Review', assistant: 'Penilaian Bulanan Pembantu Klinik' };
export const AREA_KEYS = ['jobKnowledge', 'qualityOfWork', 'attendance', 'behaviour'];
const line = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Reads what was saved (or typed) into a clean record; anything that does not fit the forms (an unknown area, a wrong count) is left out.
export function cleanFormText(input: any): FormText {
  const out: FormText = {};
  const names: { standard?: string; assistant?: string } = {};
  for (const key of ['standard', 'assistant'] as const) { const value = line(input?.names?.[key], 80); if (value && value !== DEFAULT_NAMES[key]) names[key] = value; }
  if (names.standard || names.assistant) out.names = names;
  const areas: Record<string, { label?: string; criteria?: string[] }> = {};
  for (const key of AREA_KEYS) {
    const given = input?.areas?.[key]; if (!given) continue;
    const label = line(given.label, 60);
    const criteria = Array.isArray(given.criteria) && given.criteria.length === 4 ? given.criteria.map((value: unknown) => line(value, 220)) : [];
    if (label || criteria.some(Boolean)) areas[key] = { ...(label ? { label } : {}), ...(criteria.length ? { criteria } : {}) };
  }
  if (Object.keys(areas).length) out.areas = areas;
  if (Array.isArray(input?.items) && input.items.length === ASSISTANT_ITEMS.length) {
    const items = input.items.map((item: any) => ({ name: line(item?.name, 160), note: line(item?.note, 1600) }));
    if (items.some((item: { name: string; note: string }) => item.name || item.note)) out.items = items;
  }
  return out;
}
