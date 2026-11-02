export type ReviewRule = { id: string; label: string; months: number; enabled: boolean; previousLabels?: string[] };
export type ReviewSettings = {
  automaticEnabled: boolean; milestones: ReviewRule[];
  recurringEnabled: boolean; recurringLabel: string; recurringStartMonths: number; recurringEveryMonths: number; recurringPreviousLabels?: string[];
  leadDays: number; lookBackDays: number; lookAheadDays: number;
};
export const defaultReviewSettings = (): ReviewSettings => ({
  automaticEnabled: true,
  milestones: [[1, '1st Month'], [2, '2nd Month'], [3, '3rd Month'], [6, '6th Month']].map(([months, label]) => ({ id: `month-${months}`, months: Number(months), label: String(label), enabled: true })),
  recurringEnabled: true, recurringLabel: 'Annual', recurringStartMonths: 12, recurringEveryMonths: 12,
  leadDays: 30, lookBackDays: 30, lookAheadDays: 365,
});

export function normalizeReviewSettings(input: unknown, previous = defaultReviewSettings()): ReviewSettings {
  const value = input as ReviewSettings;
  if (!value || typeof value !== 'object') throw new Error('Enter valid review settings.');
  const flag = (key: keyof ReviewSettings) => { if (typeof value[key] !== 'boolean') throw new Error('Choose whether each review rule is enabled.'); return value[key] as boolean; };
  const integer = (number: unknown, min: number, max: number, label: string) => { if (typeof number !== 'number' || !Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`); return number; };
  const label = (text: unknown) => { if (typeof text !== 'string' || !text.trim() || text.trim().length > 40) throw new Error('Assessment names must contain 1–40 characters.'); return text.trim(); };
  const aliases = (current: string, old: string | undefined, existing: string[] = []) => [...new Set([...existing, ...(old && old !== current ? [old] : [])])].filter((item) => item !== current).slice(-20);
  if (!Array.isArray(value.milestones) || value.milestones.length > 24) throw new Error('Use up to 24 review milestones.');
  const ids = new Set<string>();
  const milestones = value.milestones.map((rule) => {
    if (!rule || !/^[a-zA-Z0-9-]{1,64}$/.test(rule.id) || ids.has(rule.id)) throw new Error('Every milestone must have a unique rule ID.');
    ids.add(rule.id);
    const old = previous.milestones.find((item) => item.id === rule.id);
    const name = label(rule.label);
    if (typeof rule.enabled !== 'boolean') throw new Error('Choose whether each milestone is enabled.');
    return { id: rule.id, label: name, months: integer(rule.months, 1, 120, 'Milestone month'), enabled: rule.enabled, previousLabels: aliases(name, old?.label, old?.previousLabels) };
  });
  const enabled = milestones.filter((rule) => rule.enabled);
  if (new Set(enabled.map((rule) => `${rule.months}:${rule.label.toLowerCase()}`)).size !== enabled.length) throw new Error('Do not repeat the same assessment at the same month.');
  const recurringLabel = label(value.recurringLabel);
  const result: ReviewSettings = {
    automaticEnabled: flag('automaticEnabled'), milestones,
    recurringEnabled: flag('recurringEnabled'), recurringLabel,
    recurringStartMonths: integer(value.recurringStartMonths, 1, 120, 'First recurring review month'),
    recurringEveryMonths: integer(value.recurringEveryMonths, 1, 120, 'Recurring review interval'),
    recurringPreviousLabels: aliases(recurringLabel, previous.recurringLabel, previous.recurringPreviousLabels),
    leadDays: integer(value.leadDays, 0, 90, 'Due-soon warning'),
    lookBackDays: integer(value.lookBackDays, 0, 3650, 'Overdue look-back'),
    lookAheadDays: integer(value.lookAheadDays, 30, 730, 'Upcoming look-ahead'),
  };
  if (result.lookAheadDays < result.leadDays) throw new Error('Upcoming look-ahead must cover at least the due-soon warning period.');
  return result;
}
