// Statutory contributions worked out from a wage, the same way Infotech does it (checked against the October 2026 pay run).
// All amounts are in sen (whole numbers) to avoid rounding drift; the helpers at the bottom turn them into ringgit.
// Rates and bands: KWSP third schedule, PERKESO first category, EIS, SKBBK (Lindung 24 Jam, from June 2026), HRDF.

const toSen = (ringgit: number) => Math.round(ringgit * 100);
export const ringgit = (sen: number) => sen / 100;

// KWSP: the wage is put in a band (RM20 wide up to RM5,000, RM100 wide above), then the rate is applied to the top of the band
// and rounded up to the next ringgit. The employer pays 13% up to RM5,000 and 12% above; the employee pays their own rate (11%).
export function kwsp(wage: number, employeeRate = 11) {
  const sen = toSen(wage);
  if (sen <= 0) return { employer: 0, employee: 0 };
  const step = sen <= 500000 ? 2000 : 10000;
  const band = Math.ceil(sen / step) * step;
  const employerRate = sen <= 500000 ? 13 : 12;
  const up = (rate: number) => Math.ceil((band * rate) / 100 / 100) * 100;
  return { employer: up(employerRate), employee: up(employeeRate) };
}

// PERKESO, EIS and SKBBK share the same wage bands: RM100 wide, worked from the middle of the band, wages capped at RM6,000.
// Below RM200 the official tables are not a straight percentage, so they are listed.
const LOW_BANDS: { upTo: number; socsoEmployer: number; socsoEmployee: number; eis: number }[] = [
  { upTo: 3000, socsoEmployer: 40, socsoEmployee: 10, eis: 5 },
  { upTo: 5000, socsoEmployer: 70, socsoEmployee: 20, eis: 10 },
  { upTo: 7000, socsoEmployer: 110, socsoEmployee: 30, eis: 15 },
  { upTo: 10000, socsoEmployer: 150, socsoEmployee: 40, eis: 20 },
  { upTo: 14000, socsoEmployer: 210, socsoEmployee: 60, eis: 25 },
  { upTo: 20000, socsoEmployer: 295, socsoEmployee: 85, eis: 35 },
];
const WAGE_CAP = 600000;
const bandMiddle = (sen: number) => Math.ceil(Math.min(sen, WAGE_CAP) / 10000) * 10000 - 5000;

// A rate applied to the band middle, rounded to the nearest 5 sen; when it falls exactly between two, the one ending in 5 wins
// (RM34.125 gives 34.15, RM35.875 gives 35.85), as in the official tables.
function nearestFiveSen(sen: number, ratePerTenThousand: number) {
  const exact = (sen * ratePerTenThousand) / 10000;   // in sen
  const lower = Math.floor(exact / 5) * 5;
  const diff = exact - lower;
  if (diff < 2.5 - 1e-9) return lower;
  if (diff > 2.5 + 1e-9) return lower + 5;
  return (lower / 5) % 2 === 1 ? lower : lower + 5;
}

export function perkeso(wage: number) {
  const sen = toSen(wage);
  if (sen <= 0) return { employer: 0, employee: 0 };
  const low = LOW_BANDS.find((band) => sen <= band.upTo);
  if (low) return { employer: low.socsoEmployer, employee: low.socsoEmployee };
  const middle = bandMiddle(sen);
  return { employer: nearestFiveSen(middle, 175), employee: Math.round(middle * 0.005) };
}

// EIS is paid in equal parts by the employer and the employee: 0.2% of the band middle.
export function eis(wage: number) {
  const sen = toSen(wage);
  if (sen <= 0) return { employer: 0, employee: 0 };
  const low = LOW_BANDS.find((band) => sen <= band.upTo);
  const each = low ? low.eis : Math.round(bandMiddle(sen) * 0.002);
  return { employer: each, employee: each };
}

// SKBBK (24-hour cover) is taken from the employee: 0.75% of the band middle, only for staff marked for it.
export function skbbk(wage: number) {
  const sen = toSen(wage);
  if (sen <= 0) return 0;
  if (sen > 5000 && sen <= 7000) return 50;   // the one low band seen so far; the others below RM200 are not checked yet
  return nearestFiveSen(bandMiddle(sen), 75);
}

// HRDF is paid by the employer only: 1% of the basic salary after unpaid leave is taken off.
export const hrdf = (basicSalaryAfterUnpaidLeave: number) => Math.round(toSen(basicSalaryAfterUnpaidLeave) * 0.01);

// ---- PCB (monthly tax deduction), normal remuneration, resident --------------------------------------------------------------
// The LHDN computerised method as Infotech applies it: the year's chargeable income is projected from what was earned so far,
// this month and the months still to come; the tax on it, less the PCB already paid, is spread over this month and the rest.
// All figures here are in ringgit. Bands above RM100,000 are not checked against Infotech yet (nobody earns that much).
const TAX_BANDS: [number, number][] = [[5000, 0], [20000, 0.01], [35000, 0.03], [50000, 0.06], [70000, 0.11], [100000, 0.19], [250000, 0.24], [400000, 0.245], [600000, 0.25], [1000000, 0.26], [2000000, 0.28], [Infinity, 0.3]];
const REBATE_LIMIT = 35000;
const REBATE = 400;

export function incomeTax(chargeable: number) {
  let tax = 0, from = 0;
  for (const [to, rate] of TAX_BANDS) { if (chargeable > from) tax += (Math.min(chargeable, to) - from) * rate; from = to; if (chargeable <= to) break; }
  return chargeable <= REBATE_LIMIT ? Math.max(0, tax - REBATE) : tax;
}

export type PcbInput = {
  earnedBefore: number;        // Y: ordinary wages earned in the earlier months of the year
  kwspBefore: number;          // K: KWSP paid in the earlier months (the relief is capped at 4,000 for the year)
  thisMonth: number;           // Y1: this month's ordinary wages
  kwspThisMonth: number;       // K1: KWSP taken this month
  nextMonth: number;           // Y2: ordinary wages expected in each month still to come
  kwspNextMonth: number;       // K2: KWSP expected in each month still to come
  monthsLeft: number;          // n: months of the year after this one
  individual?: number;         // D: 9,000
  spouse?: number;             // S: 4,000 when the spouse does not work, otherwise 0
  children?: number;           // C: children counted for relief
  perChild?: number;           // Q: 2,000 for a child under 18
  otherReliefBefore?: number;  // Lp
  otherReliefThisMonth?: number; // Lp1
  pcbPaidBefore: number;       // X
  zakatBefore?: number;        // Z
};

export function pcbNormal(input: PcbInput) {
  const cap = 4000;
  const kBefore = Math.min(input.kwspBefore, cap);
  const k1 = Math.max(0, Math.min(input.kwspThisMonth, cap - kBefore));
  const k2Total = Math.max(0, Math.min(input.kwspNextMonth * input.monthsLeft, cap - kBefore - k1));
  const relief = (input.individual ?? 9000) + (input.spouse ?? 0) + (input.children ?? 0) * (input.perChild ?? 2000) + (input.otherReliefBefore ?? 0) + (input.otherReliefThisMonth ?? 0);
  const chargeable = (input.earnedBefore - kBefore) + (input.thisMonth - k1) + (input.nextMonth * input.monthsLeft - k2Total) - relief;
  const tax = incomeTax(Math.max(0, chargeable));
  const left = tax - (input.zakatBefore ?? 0) - input.pcbPaidBefore;
  const monthly = left > 0 ? left / (input.monthsLeft + 1) : 0;
  // Rounded up to the next 5 sen.
  return { chargeable, tax, pcb: monthly > 0 ? Math.ceil(monthly * 20 - 1e-9) / 20 : 0 };
}
