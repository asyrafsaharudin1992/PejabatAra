// Review templates HR makes itself: items marked out of their own full mark, an optional list of results, and the assessor's comments.
// Shared by the HR editor, the supervisor's form, the printed sheet and the server.
// An item is either marked (the assessor types a mark up to `max`) or "choose one": `options` lists the choices, each with its own score, and `max` is the highest score.
export type ChoiceOption = { label: string; score: number };
export type TemplateItem = { name: string; points: string[]; max: number; options?: ChoiceOption[] };
export type Grade = { min: number; label: string };
export type ReviewTemplate = { id: string; name: string; description: string; items: TemplateItem[]; outcomes: string[]; grades?: Grade[]; subject?: 'staff' | 'candidate'; archived?: boolean; updatedAt?: string };
export type CustomResult = { marks: number[]; choices?: (number | null)[]; outcome: string; comments: string; grade?: string; position?: string };
export const isChoice = (item: TemplateItem) => Array.isArray(item.options) && item.options.length > 0;
// The grade a total earns: the highest grade whose minimum the total reaches.
export const gradeFor = (total: number, grades: Grade[] = []) => [...grades].sort((a, b) => b.min - a.min).find((grade) => total >= grade.min)?.label || '';
// The marks of every item from what the assessor entered: a typed mark for a marked item, the chosen option's score for a "choose one" item.
export function resolveAnswers(items: TemplateItem[], marksInput: unknown, choicesInput: unknown): { marks: number[]; choices: (number | null)[] } | { error: string } {
  const typed = Array.isArray(marksInput) ? marksInput : [], picked = Array.isArray(choicesInput) ? choicesInput : [];
  const marks: number[] = [], choices: (number | null)[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (isChoice(item)) {
      const choice = picked[index] === null || picked[index] === undefined || picked[index] === '' ? NaN : Number(picked[index]);
      if (!Number.isInteger(choice) || choice < 0 || choice >= item.options!.length) return { error: `Choose one answer for item ${index + 1}.` };
      choices.push(choice); marks.push(item.options![choice].score);
    } else {
      const mark = Number(typed[index]);
      if (typed[index] === '' || typed[index] === null || typed[index] === undefined || !markOk(mark, item.max)) return { error: `Item ${index + 1}: enter a mark from 0 up to ${item.max}, in steps of 0.5.` };
      choices.push(null); marks.push(mark);
    }
  }
  return { marks, choices };
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
export const templateMax = (items: TemplateItem[]) => round(items.reduce((sum, item) => sum + item.max, 0));
export const customTotal = (marks: (number | null)[]) => round(marks.reduce<number>((sum, mark) => sum + (mark ?? 0), 0));
export const markOk = (mark: number, max: number) => Number.isFinite(mark) && mark * 2 === Math.round(mark * 2) && mark >= 0 && mark <= max;
// The score kept on the review is on the 0 to 4 scale the lists show as a percentage (4.00 is 100%).
export const customScore = (marks: number[], items: TemplateItem[]) => { const max = templateMax(items); return max ? round(customTotal(marks) / max * 4) : 0; };
export const customPercent = (marks: (number | null)[], items: TemplateItem[]) => { const max = templateMax(items); return max ? round(customTotal(marks) / max * 100, 1) : 0; };

// Checks what HR typed and returns the clean template; throws an Error whose message says what to fix.
export function validateTemplate(input: unknown): { name: string; description: string; items: TemplateItem[]; outcomes: string[]; grades: Grade[]; subject: 'staff' | 'candidate' } {
  const value = input as { name?: unknown; description?: unknown; items?: unknown; outcomes?: unknown; grades?: unknown; subject?: unknown };
  const clean = (text: unknown, limit: number) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const name = clean(value?.name, 120);
  if (!name) throw new Error('Enter a name for the template.');
  const rawItems = Array.isArray(value?.items) ? value.items : [];
  if (!rawItems.length) throw new Error('Add at least one item to mark.');
  if (rawItems.length > 60) throw new Error('A template can have at most 60 items.');
  const items: TemplateItem[] = rawItems.map((raw: any, index: number) => {
    const itemName = clean(raw?.name, 200);
    if (!itemName) throw new Error(`Item ${index + 1}: enter the item name.`);
    const points = (Array.isArray(raw?.points) ? raw.points : []).map((point: unknown) => clean(point, 400)).filter(Boolean).slice(0, 10);
    if (Array.isArray(raw?.options) && raw.options.length) {
      if (raw.options.length < 2 || raw.options.length > 8) throw new Error(`Item ${index + 1}: give 2 to 8 choices.`);
      const options: ChoiceOption[] = raw.options.map((option: any, at: number) => {
        const label = clean(option?.label, 300), score = Number(option?.score);
        if (!label) throw new Error(`Item ${index + 1}, choice ${at + 1}: enter the choice text.`);
        if (!Number.isFinite(score) || score < 0 || score > 100 || score * 2 !== Math.round(score * 2)) throw new Error(`Item ${index + 1}, choice ${at + 1}: the score must be from 0 to 100, in steps of 0.5.`);
        return { label, score };
      });
      const highest = Math.max(...options.map((option) => option.score));
      if (highest <= 0) throw new Error(`Item ${index + 1}: at least one choice must score more than 0.`);
      return { name: itemName, points, max: highest, options };
    }
    const max = Number(raw?.max);
    if (!Number.isFinite(max) || max <= 0 || max > 100 || max * 2 !== Math.round(max * 2)) throw new Error(`Item ${index + 1}: the full mark must be from 0.5 to 100, in steps of 0.5.`);
    return { name: itemName, points, max };
  });
  const outcomes = [...new Set((Array.isArray(value?.outcomes) ? value.outcomes : []).map((entry: unknown) => clean(entry, 160)).filter(Boolean))].slice(0, 12) as string[];
  const grades: Grade[] = (Array.isArray(value?.grades) ? value.grades : []).filter((grade: any) => clean(grade?.label, 120)).slice(0, 12).map((grade: any) => {
    const min = Number(grade?.min);
    if (!Number.isFinite(min) || min < 0 || min > 10000) throw new Error('Each grade needs a minimum score of 0 or more.');
    return { min, label: clean(grade?.label, 120) };
  });
  return { name, description: clean(value?.description, 400), items, outcomes, grades, subject: value?.subject === 'candidate' ? 'candidate' : 'staff' };
}

// Spreads the items over A4 pages by how many printed lines each needs (the first page also carries the heading and the staff details), so a page never runs over.
// A "choose one" item is printed as a heading line, its points and one row of choices side by side; the row is as tall as the longest choice wraps.
const lineWeight = (item: TemplateItem) => isChoice(item)
  ? 2 + item.points.reduce((sum, point) => sum + Math.ceil(point.length / 130), 0) + Math.max(...item.options!.map((option) => Math.ceil(option.label.length / Math.max(8, Math.floor(110 / item.options!.length))))) + 1
  : Math.max(Math.ceil(item.name.length / 20), item.points.reduce((sum, point) => sum + Math.ceil(point.length / 58), 0), 1);
export function pagesOf(items: TemplateItem[], first = 28, rest = 42): number[][] {
  const out: number[][] = [];
  let current: number[] = [], used = 0, capacity = first;
  items.forEach((item, index) => {
    const weight = lineWeight(item);
    if (current.length && used + weight > capacity) { out.push(current); current = []; used = 0; capacity = rest; }
    current.push(index); used += weight;
  });
  if (current.length) out.push(current);
  return out;
}

