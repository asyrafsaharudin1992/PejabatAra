import { useEffect, useState } from 'react';
import { ASSISTANT_ITEMS } from './assistantReview';
import { AREAS } from './performanceReview';
import { cleanFormText, DEFAULT_NAMES, type FormText } from './reviewFormTextCore';

// The wording of the two fixed review forms (Review 1 Performance Assessment Review and Review 2 Penilaian Bulanan Pembantu Klinik) that HR can change in
// Performance Reviews > Review samples: the form names, the four areas and their points (Review 1), and the names and points of the 19 items (Review 2).
// Only words change. The number of items, the marks and the weights stay as they are, so reviews already filled keep their marks and show the new wording.
// The text is kept as one record; this puts it over the shared lists (in place) when it is read, so every form, sheet and report shows it.
export { cleanFormText, DEFAULT_NAMES, type FormText };
// The original words, taken before anything is put over them (for "Reset to original").
export const ORIGINAL = {
  areas: AREAS.map((area) => ({ key: area.key as string, label: String(area.label), criteria: [...area.criteria] as string[] })),
  items: ASSISTANT_ITEMS.map((item) => ({ name: item.name, note: item.note })),
};
// What to save: the record with everything that is the same as the original words left out.
export function changesOnly(text: FormText): FormText {
  const clean = cleanFormText(text);
  const out: FormText = { names: clean.names };
  if (clean.areas) {
    const areas: NonNullable<FormText['areas']> = {};
    for (const original of ORIGINAL.areas) {
      const given = clean.areas[original.key]; if (!given) continue;
      const label = given.label && given.label !== original.label ? given.label : undefined;
      const criteria = given.criteria && given.criteria.some((value, index) => (value || original.criteria[index]) !== original.criteria[index]) ? given.criteria.map((value, index) => value || original.criteria[index]) : undefined;
      if (label || criteria) areas[original.key] = { ...(label ? { label } : {}), ...(criteria ? { criteria } : {}) };
    }
    if (Object.keys(areas).length) out.areas = areas;
  }
  if (clean.items && clean.items.some((item, index) => (item.name || ORIGINAL.items[index].name) !== ORIGINAL.items[index].name || (item.note || ORIGINAL.items[index].note) !== ORIGINAL.items[index].note)) out.items = clean.items.map((item, index) => ({ name: item.name || ORIGINAL.items[index].name, note: item.note || ORIGINAL.items[index].note }));
  return out;
}

let current: FormText = {};
export const formName = (kind: 'standard' | 'assistant') => current.names?.[kind] || DEFAULT_NAMES[kind];
export const currentFormText = () => current;
// Put the saved wording over the shared lists (and the original wording back where nothing is saved).
export function applyFormText(text: FormText) {
  current = text || {};
  ORIGINAL.areas.forEach((original, index) => {
    const area = AREAS[index] as unknown as { label: string; criteria: string[] };
    area.label = current.areas?.[original.key]?.label || original.label;
    area.criteria = current.areas?.[original.key]?.criteria ? [...current.areas[original.key].criteria!] : [...original.criteria];
  });
  ORIGINAL.items.forEach((original, index) => {
    const item = ASSISTANT_ITEMS[index];
    item.name = current.items?.[index]?.name || original.name;
    item.note = current.items?.[index]?.note || original.note;
    item.points = item.note.split(' · ');
  });
}

let loading: Promise<void> | null = null, loadedAt = 0;
export function loadFormText(force = false): Promise<void> {
  if (!force && loading && Date.now() - loadedAt < 60000) return loading;
  loadedAt = Date.now();
  loading = fetch('/api/status?resource=review&action=form_text').then((response) => response.json()).then((result) => { applyFormText(cleanFormText(result?.text || {})); }).catch(() => undefined);
  return loading;
}
// Call in a screen that shows a review form: it reads the wording once a minute at most and draws the screen again when it arrives.
export function useFormText() {
  const [, setVersion] = useState(0);
  useEffect(() => { let live = true; void loadFormText().then(() => { if (live) setVersion((n) => n + 1); }); return () => { live = false; }; }, []);
}
