// The CEO's recurring tasks, by how often they come round. Used by the CEO's home and by the server that remembers which are done.
export type CeoFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type CeoTask = { id: string; frequency: CeoFrequency; title: string; note: string };
export const FREQUENCY_TITLE: Record<CeoFrequency, string> = { daily: 'Daily & Operations', weekly: 'Weekly & Team', monthly: 'Monthly & Finance', quarterly: 'Quarterly & Strategy' };
export const FREQUENCIES: CeoFrequency[] = ['daily', 'weekly', 'monthly', 'quarterly'];
export const CEO_TASKS: CeoTask[] = [
  { id: 'daily-cash', frequency: 'daily', title: 'Review daily cash flow & sales', note: 'Make sure cash collections, panel claims and daily expenses are under control.' },
  { id: 'daily-bottleneck', frequency: 'daily', title: 'Resolve critical issues or operational bottlenecks', note: 'Focus only on the big problems that stop staff from doing their work.' },
  { id: 'daily-feedback', frequency: 'daily', title: 'Monitor patient and customer feedback & satisfaction', note: 'Check reviews (Google Reviews) or direct complaints for quality control.' },
  { id: 'daily-deep-work', frequency: 'daily', title: 'Protect time for "Deep Work"', note: 'Set aside dedicated time for strategic thinking, without interruptions from daily operations.' },
  { id: 'weekly-heads', frequency: 'weekly', title: 'Short meeting with department heads / PICs', note: 'Review weekly KPIs, work schedules and challenges on the ground.' },
  { id: 'weekly-one-on-one', frequency: 'weekly', title: '1-on-1 sessions or appreciation with staff', note: 'Keep team morale up and spot talent who can be promoted.' },
  { id: 'weekly-balance', frequency: 'weekly', title: 'Balance work time & personal health', note: 'Make sure there is room to rest, to avoid burnout and stay sharp when making decisions.' },
  { id: 'monthly-pnl', frequency: 'monthly', title: 'Review the P&L (profit and loss) report & monthly budget', note: 'Compare sales targets against operating costs, salaries and stock.' },
  { id: 'monthly-sop', frequency: 'monthly', title: 'Audit system & SOP efficiency', note: 'Identify manual processes that can be automated.' },
  { id: 'monthly-compliance', frequency: 'monthly', title: 'Check compliance & licence status', note: 'Make sure company policies, tax and the guidelines of regulators are followed.' },
  { id: 'monthly-marketing', frequency: 'monthly', title: 'Review marketing effectiveness & ROI', note: 'Make sure campaign budgets bring in quality customers.' },
  { id: 'monthly-data', frequency: 'monthly', title: 'Check data security & system backups', note: 'Make sure company records and customer data are safe from the risk of loss.' },
  { id: 'quarterly-direction', frequency: 'quarterly', title: 'Re-assess direction & 90-day targets', note: "Measure the quarter's results and adjust the marketing or expansion strategy." },
  { id: 'quarterly-partners', frequency: 'quarterly', title: 'Build strategic partnerships (B2B / corporate)', note: 'Look for new collaboration opportunities beyond daily operations.' },
  { id: 'quarterly-successor', frequency: 'quarterly', title: 'Train and test successor leaders (second-liners)', note: 'Make sure operations do not stall when you are away or focused on a new project.' },
  { id: 'quarterly-plan-b', frequency: 'quarterly', title: 'Review the contingency plan (Plan B)', note: 'Have an action plan ready for emergencies, system outages or sudden market changes.' },
];
// The period a tick belongs to: a daily task is done for that day only, a weekly one for that week, and so on.
export function periodKey(frequency: CeoFrequency, today: string): string {
  const [year, month, day] = today.split('-').map(Number);
  if (frequency === 'daily') return today;
  if (frequency === 'monthly') return today.slice(0, 7);
  if (frequency === 'quarterly') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  // ISO week: the week belongs to the year of its Thursday.
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date.getTime() - start) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
