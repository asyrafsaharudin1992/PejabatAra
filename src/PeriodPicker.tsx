import { useEffect, useMemo, useState } from 'react';

// One way to choose the dates of a report: a payroll period (the 20th of the month before to the 19th) or a calendar month. Replaces typing a From and a To date.
// A payroll period or a month; reports that cover a long time (leave history, credits) can also choose a whole year.
export type Period = { from: string; to: string; label: string };
const two = (value: number) => String(value).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const key = (year: number, month: number) => `${year}-${two(month)}`;

export const payrollPeriod = (value: string): Period => {
  const [year, month] = value.split('-').map(Number);
  const before = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return { from: `${before.year}-${two(before.month)}-20`, to: `${year}-${two(month)}-19`, label: `Payroll ${MONTHS[month - 1]} ${year} (20/${two(before.month)} to 19/${two(month)})` };
};
export const monthPeriod = (value: string): Period => {
  const [year, month] = value.split('-').map(Number);
  return { from: `${year}-${two(month)}-01`, to: `${year}-${two(month)}-${two(lastDay(year, month))}`, label: `${MONTHS[month - 1]} ${year}` };
};
export const yearPeriod = (year: number): Period => ({ from: `${year}-01-01`, to: `${year}-12-31`, label: `Year ${year}` });

// The payroll period that holds today (from the 20th it is already next month's payroll).
const currentPayroll = () => { const now = new Date(Date.now() + 8 * 3600000); let year = now.getUTCFullYear(), month = now.getUTCMonth() + 1; if (now.getUTCDate() >= 20) { month += 1; if (month > 12) { month = 1; year += 1; } } return key(year, month); };
const recent = (from: string) => { const out: string[] = []; let [year, month] = from.split('-').map(Number); for (let i = 0; i < 36; i++) { out.push(key(year, month)); month -= 1; if (month < 1) { month = 12; year -= 1; } } return out; };

import { bulk } from './lib/bulkReports';
export function PeriodPicker({ onChange, defaultMode = 'payroll', allowYear = false, monthOnly = false, className = '' }: { onChange: (period: Period) => void; allowYear?: boolean; monthOnly?: boolean; defaultMode?: 'payroll' | 'month' | 'year'; className?: string }) {
  const [mode, setMode] = useState<'payroll' | 'month' | 'year'>(monthOnly ? 'month' : defaultMode === 'year' && !allowYear ? 'payroll' : defaultMode);
  const start = bulk.active && bulk.month ? bulk.month : currentPayroll();
  const options = useMemo(() => recent(start), [start]);
  const [value, setValue] = useState(start);
  const thisYear = Number(start.slice(0, 4));
  const years = useMemo(() => { const out: number[] = []; for (let year = thisYear + 1; year >= 2024; year--) out.push(year); return out; }, [thisYear]);
  const [yearValue, setYearValue] = useState(thisYear);
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  useEffect(() => { onChange(mode === 'year' ? yearPeriod(yearValue) : mode === 'payroll' ? payrollPeriod(value) : monthPeriod(value)); }, [mode, value, yearValue]);
  return <span className={`inline-flex flex-wrap items-end gap-2 ${className}`}>
    {!monthOnly && <label className="text-xs font-bold text-slate-600">Period by<select aria-label="Period by" value={mode} onChange={(event) => setMode(event.target.value as 'payroll' | 'month' | 'year')} className={`${field} mt-1 block`}><option value="payroll">Payroll period</option><option value="month">Month</option>{allowYear && <option value="year">Year</option>}</select></label>}
    {mode === 'year'
      ? <label className="text-xs font-bold text-slate-600">Year<select aria-label="Year" value={yearValue} onChange={(event) => setYearValue(Number(event.target.value))} className={`${field} mt-1 block`}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      : <label className="text-xs font-bold text-slate-600">{mode === 'payroll' ? 'Payroll' : 'Month'}<select aria-label={mode === 'payroll' ? 'Payroll' : 'Month'} value={value} onChange={(event) => setValue(event.target.value)} className={`${field} mt-1 block`}>{options.map((item) => <option key={item} value={item}>{mode === 'payroll' ? payrollPeriod(item).label : monthPeriod(item).label}</option>)}</select></label>}
  </span>;
}
