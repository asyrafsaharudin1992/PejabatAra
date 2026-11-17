// The company's OT pay rules (memo HSO/MEMO/SM/2026/0011, 5 Aug 2026, and the letter HSOMEMOSM2026011/HR-NOV, 10 Nov 2026).
// Pure functions, no database: the Attendance API works out the day type and calls these. The numbers come from a policy that HR can edit (OT > Settings);
// the defaults below are what the memos say.
export type DayKind = 'normal' | 'off' | 'rest' | 'ph';
export type OtPart = { minutes: number; multiplier: number };

// Every rate must be one Payroll has a bucket for.
export const OT_RATES = [1, 1.5, 2, 3];
const HOUR = 60;

export type OtPolicy = {
  minMinutes: number;      // the smallest extra time that counts as OT
  roundMinutes: number;    // OT is counted in whole blocks of this many minutes, rounded down (60 = whole hours)
  restMinutes: number;     // the rest taken off a long stretch of work
  restAfterMinutes: number; // ... when more than this many minutes were worked
  normalRate: number;      // a normal day: the time after the shift
  offRate: number;         // an off day: every hour
  restHalfHours: number;   // a rest day: up to this many hours is half a day ...
  restHalfRate: number;    // ... paid as these hours at this rate (4 h at 1.0 = 0.5 x ORP)
  restFullHours: number;   // up to this many hours is a full day ...
  restFullRate: number;    // ... paid as these hours at this rate (8 h at 1.0 = 1 x ORP)
  restExtraRate: number;   // every hour beyond a full day
  phHours: number;         // a public holiday: up to this many hours is one fixed amount ...
  phRate: number;          // ... paid as these hours at this rate (8 h at 2.0 = 2 x ORP)
  phExtraRate: number;     // every hour beyond that
};
export const DEFAULT_OT_POLICY: OtPolicy = { minMinutes: 60, roundMinutes: 60, restMinutes: 60, restAfterMinutes: 5 * HOUR, normalRate: 1.5, offRate: 1.5, restHalfHours: 4, restHalfRate: 1, restFullHours: 8, restFullRate: 1, restExtraRate: 2, phHours: 8, phRate: 2, phExtraRate: 3 };

const RATE_KEYS: (keyof OtPolicy)[] = ['normalRate', 'offRate', 'restHalfRate', 'restFullRate', 'restExtraRate', 'phRate', 'phExtraRate'];
// Reads a policy from what HR typed (or what was saved) and fills what is missing from the defaults. Throws a message HR can read.
export function cleanPolicy(input: any): OtPolicy {
  const out: any = { ...DEFAULT_OT_POLICY };
  for (const key of Object.keys(DEFAULT_OT_POLICY) as (keyof OtPolicy)[]) {
    if (input && input[key] !== undefined && input[key] !== null && input[key] !== '') {
      const value = Number(input[key]);
      if (!Number.isFinite(value)) throw new Error('Every OT setting must be a number.');
      out[key] = value;
    }
  }
  const p: OtPolicy = out;
  for (const key of RATE_KEYS) if (!OT_RATES.includes(p[key] as number)) throw new Error('Each OT rate must be 1.0, 1.5, 2.0 or 3.0 (Payroll has a place for these four).');
  const whole = (value: number, low: number, high: number, name: string) => { if (!Number.isInteger(value) || value < low || value > high) throw new Error(`${name} must be a whole number from ${low} to ${high}.`); };
  whole(p.minMinutes, 1, 600, 'The smallest OT (minutes)');
  whole(p.roundMinutes, 1, 120, 'The OT block (minutes)');
  whole(p.restMinutes, 0, 180, 'The rest taken off (minutes)');
  whole(p.restAfterMinutes, 0, 1440, 'Rest is taken off after (minutes)');
  whole(p.restHalfHours, 1, 24, 'Rest day: hours for half a day');
  whole(p.restFullHours, 1, 24, 'Rest day: hours for a full day');
  whole(p.phHours, 1, 24, 'Public holiday: normal hours');
  if (p.restFullHours <= p.restHalfHours) throw new Error('Rest day: a full day must be more hours than half a day.');
  return p;
}

export const wholeHours = (minutes: number, policy: OtPolicy = DEFAULT_OT_POLICY) => Math.floor(Math.max(0, minutes) / policy.roundMinutes) * policy.roundMinutes;

// Which kind of day a date is for one person.
// - public holiday of the person's group (operation and management have their own lists), even when a shift is rostered: ph
// - working day (a shift is expected): normal
// - the last day off of the week (Monday to Sunday), once a week: rest
// - any other day off: off
export function classifyDay(date: string, isWorking: (date: string) => boolean, isHoliday: (date: string) => boolean): DayKind {
  if (isHoliday(date)) return 'ph';
  if (isWorking(date)) return 'normal';
  const base = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(base).getUTCDay(); // 0 = Sunday
  const monday = base - ((weekday + 6) % 7) * 86400000;
  for (let step = 6; step >= 0; step--) {
    const day = new Date(monday + step * 86400000).toISOString().slice(0, 10);
    if (!isWorking(day) && !isHoliday(day)) return day === date ? 'rest' : 'off';
  }
  return 'off';
}

// A long stretch of work includes the rest, which is not counted when more than the set time was worked.
// This is on every kind of day: on a normal day it is the OT after the shift (a short OT has no rest in it, a long one does).
export function netMinutes(_kind: DayKind, grossMinutes: number, policy: OtPolicy = DEFAULT_OT_POLICY) {
  const gross = wholeHours(grossMinutes, policy);
  return gross > policy.restAfterMinutes ? gross - policy.restMinutes : gross;
}

// What is paid: hours at a rate. Fixed amounts for a day (a rest day up to half or a full day, a public holiday up to its normal hours) are written as the equal hours at the rate that gives the same pay.
export function otParts(kind: DayKind, grossMinutes: number, policy: OtPolicy = DEFAULT_OT_POLICY): OtPart[] {
  const net = netMinutes(kind, grossMinutes, policy);
  if (net < policy.minMinutes || net <= 0) return [];
  const hours = net / HOUR;
  if (kind === 'normal') return [{ minutes: net, multiplier: policy.normalRate }];
  if (kind === 'off') return [{ minutes: net, multiplier: policy.offRate }];
  if (kind === 'rest') {
    const full = policy.restFullHours * HOUR;
    if (hours <= policy.restHalfHours) return [{ minutes: policy.restHalfHours * HOUR, multiplier: policy.restHalfRate }];
    if (hours <= policy.restFullHours) return [{ minutes: full, multiplier: policy.restFullRate }];
    return [{ minutes: full, multiplier: policy.restFullRate }, { minutes: net - full, multiplier: policy.restExtraRate }];
  }
  const flat = policy.phHours * HOUR;
  if (hours <= policy.phHours) return [{ minutes: flat, multiplier: policy.phRate }];
  return [{ minutes: flat, multiplier: policy.phRate }, { minutes: net - flat, multiplier: policy.phExtraRate }];
}

const KIND_NAME: Record<DayKind, string> = { normal: 'Normal day', off: 'Off day', rest: 'Rest day', ph: 'Public holiday' };
export const kindName = (kind: DayKind) => KIND_NAME[kind];
const hoursText = (minutes: number) => `${Math.floor(minutes / HOUR)} h${minutes % HOUR ? ` ${Math.round(minutes % HOUR)} m` : ''}`;
// The fixed amount for a day, in ORP (hours x rate ÷ 8 hours in a day): 4 h at 1.0 is 0.5 x ORP, 8 h at 2.0 is 2 x ORP.
const orpText = (minutes: number, rate: number) => `${Math.round(((minutes / HOUR) * rate / 8) * 100) / 100} x ORP`;
function payText(kind: DayKind, net: number, parts: OtPart[], policy: OtPolicy) {
  if (!parts.length) return 'under the smallest OT, no OT';
  const single = parts.length === 1 ? parts[0] : null;
  if (single && kind === 'rest' && single.minutes === policy.restHalfHours * HOUR && single.multiplier === policy.restHalfRate && net / HOUR <= policy.restHalfHours) return `half a day pay (${orpText(single.minutes, single.multiplier)})`;
  if (single && kind === 'rest' && single.minutes === policy.restFullHours * HOUR && single.multiplier === policy.restFullRate) return `a day pay (${orpText(single.minutes, single.multiplier)})`;
  if (single && kind === 'ph' && single.minutes === policy.phHours * HOUR && single.multiplier === policy.phRate) return orpText(single.minutes, single.multiplier);
  // A fixed amount for a day first, then the hours beyond it at their rate: "2 x ORP + 3 h at 3.0x".
  const part = (item: OtPart, index: number) => {
    if (index === 0 && parts.length > 1 && kind === 'rest' && item.minutes === policy.restFullHours * HOUR && item.multiplier === policy.restFullRate) return orpText(item.minutes, item.multiplier);
    if (index === 0 && parts.length > 1 && kind === 'ph' && item.minutes === policy.phHours * HOUR && item.multiplier === policy.phRate) return orpText(item.minutes, item.multiplier);
    return `${hoursText(item.minutes)} at ${item.multiplier.toFixed(1)}x`;
  };
  return parts.map(part).join(' + ');
}
// One line for people: "Rest day · 8 h (1 h rest not counted) · a day pay (1 x ORP)".
export function otSummary(kind: DayKind, grossMinutes: number, policy: OtPolicy = DEFAULT_OT_POLICY) {
  const gross = wholeHours(grossMinutes, policy), net = netMinutes(kind, gross, policy), parts = otParts(kind, gross, policy);
  const worked = net === gross ? hoursText(net) : `${hoursText(net)} (${hoursText(gross - net)} rest not counted)`;
  return `${KIND_NAME[kind]} · ${worked} · ${payText(kind, net, parts, policy)}`;
}

// The pay line for an OT that is already decided: the hours counted and what they are paid, from the saved parts.
export function paySummary(dayKind: DayKind, netMinutes: number, parts: OtPart[], restTaken = false, policy: OtPolicy = DEFAULT_OT_POLICY) {
  // Only a public holiday pays 2.0x or 3.0x on a day that is shown as a normal or off day (a shift worked on a public holiday).
  const kind: DayKind = (dayKind === 'normal' || dayKind === 'off') && parts.some((part) => part.multiplier >= 2) ? 'ph' : dayKind;
  const worked = restTaken ? `${hoursText(netMinutes)} (${hoursText(policy.restMinutes)} rest not counted)` : hoursText(netMinutes);
  return `${KIND_NAME[kind]} · ${worked} · ${payText(kind, netMinutes, parts, policy)}`;
}

// The policy has versions, each from a date: a change is made "from" a day, and an OT dated on or after it follows the new one.
export type OtPolicyVersion = { from: string; policy: OtPolicy };
// Reads what is saved: a list of versions (newest settings last), or an older single policy. There is always a first version that covers every date.
export function parseVersions(raw: any, minMinutes: number): OtPolicyVersion[] {
  const base: OtPolicyVersion = { from: '', policy: { ...DEFAULT_OT_POLICY, minMinutes } };
  const list: OtPolicyVersion[] = [];
  const items = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Object.keys(raw).length ? [{ from: '', policy: raw }] : [];
  for (const item of items) {
    try { const from = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.from || '')) ? String(item.from) : ''; list.push({ from, policy: cleanPolicy(item?.policy) }); } catch { /* skip a version that cannot be read */ }
  }
  const sorted = list.sort((a, b) => a.from.localeCompare(b.from));
  return sorted.length && sorted[0].from === '' ? sorted : [base, ...sorted];
}
export function pickPolicy(versions: OtPolicyVersion[], date: string): OtPolicy {
  let chosen = versions[0].policy;
  for (const version of versions) if (version.from <= date) chosen = version.policy;
  return chosen;
}
