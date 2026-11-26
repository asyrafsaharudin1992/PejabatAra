// A request to fix a missed clock ("Forgot to clock in" / "Forgot to clock out") is kept apart from an OT request: staff send it from Attendance, and HR decides it in its own tab.
export const MISSED_REASONS = ['Forgot to clock in', 'Forgot to clock out'];
export const OT_REASONS = ['Overtime', 'Worked on rest day / public holiday', 'Other'];
// These reasons ask for OT pay, so the OT hours must be given ('Other' may be a request about something else).
export const needsOtHours = (reason: string) => /^(overtime|worked on rest day)/i.test(reason.trim());
// "06:02" as "6:02 AM", so a morning time is not mistaken for an evening one.
export function amPm(time: string) {
  const match = /^(\d{2}):(\d{2})/.exec(time || ''); if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}
// A time out earlier than the time in means the next day. On a shift that does not run overnight that is often AM typed for PM: the PM time to offer
// instead, or '' when there is nothing to ask.
export function likelyPm(inTime: string, outTime: string, shiftStart = '', shiftEnd = '') {
  if (!inTime || !outTime || outTime > inTime || (shiftStart && shiftEnd && shiftEnd <= shiftStart)) return '';
  const hour = Number(outTime.slice(0, 2)); if (hour >= 12) return '';
  const later = `${String(hour + 12).padStart(2, '0')}${outTime.slice(2, 5)}`;
  return later > inTime ? later : '';
}
export const isMissedClock = (reason: string) => /^forgot to clock/i.test(String(reason || '').trim());

// Days in the current month where a clock is missing (no clock in, or a clock in without a clock out) and no request is active yet. Today is left out: the shift is not over.
export function missedClockDates(days: { date: string; status: string; inTime: string; outTime: string }[], requests: { date: string; status: string; reason: string }[], today: string): { date: string; kind: 'in' | 'out' }[] {
  return days.filter((day) => day.date.slice(0, 7) === today.slice(0, 7) && day.date < today && !['off', 'upcoming', 'no-record', 'leave', 'exempt', 'no-times', 'extra'].includes(day.status))
    .filter((day) => !requests.some((request) => request.date === day.date && !['rejected', 'cancelled'].includes(request.status) && isMissedClock(request.reason)))
    .map((day) => ({ date: day.date, kind: (!day.inTime ? 'in' : !day.outTime ? 'out' : '') as 'in' | 'out' | '' }))
    .filter((day): day is { date: string; kind: 'in' | 'out' } => day.kind !== '');
}

// Days this month with extra time counted by the system (a long day) but no OT request yet, so staff can be asked if they forgot to apply. Today is left out.
export function unclaimedOtDays(days: { date: string; otCounted?: number; otStatus?: string; worked: number }[], requests: { date: string; status: string; reason: string }[], today: string): { date: string; minutes: number; worked: number }[] {
  return days.filter((day) => day.date.slice(0, 7) === today.slice(0, 7) && day.date < today && (day.otCounted || 0) > 0 && !day.otStatus)
    .filter((day) => !requests.some((request) => request.date === day.date && !['rejected', 'cancelled'].includes(request.status) && !isMissedClock(request.reason)))
    .map((day) => ({ date: day.date, minutes: day.otCounted || 0, worked: day.worked }));
}
