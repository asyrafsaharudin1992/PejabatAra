// A request to fix a missed clock ("Forgot to clock in" / "Forgot to clock out") is kept apart from an OT request: staff send it from Attendance, and HR decides it in its own tab.
export const MISSED_REASONS = ['Forgot to clock in', 'Forgot to clock out'];
export const OT_REASONS = ['Overtime', 'Worked on rest day / public holiday', 'Other'];
export const isMissedClock = (reason: string) => /^forgot to clock/i.test(String(reason || '').trim());
