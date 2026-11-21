import { isMissedClock } from './attendanceRequests.js';

export type AttendanceFollowUp = {
  ot: { status: string }[];
  missed: { reason: string; status: string }[];
  credit: { kind: string; hours: number }[];
  otDecision: string;
};
export const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = { awaiting: 'Awaiting approval', unresolved: 'Unresolved', settled: 'Settled' };
export const emptyFollowUp = (): AttendanceFollowUp => ({ ot: [], missed: [], credit: [], otDecision: '' });

export type FollowUpStatus = 'awaiting' | 'unresolved' | 'settled';
export type FollowUpFilter = 'all' | FollowUpStatus;

export function attendanceFollowUpStatus(day: { odd: string[]; soft: string[]; followUp?: AttendanceFollowUp }): FollowUpStatus {
  const follow = day.followUp;
  if (!follow) return 'unresolved';
  const final = (status: string) => ['approved', 'rejected', 'cancelled', 'covered'].includes(status);
  // Someone else still has to decide: nothing for HR to chase until they do.
  const waiting = (status: string) => ['pending', 'supervisor_approved'].includes(status);
  if ([...follow.ot, ...follow.missed].some((request) => waiting(request.status)) || waiting(follow.otDecision)) return 'awaiting';
  // A status nobody recognises is not something to wait for.
  if ([...follow.ot, ...follow.missed].some((request) => !final(request.status)) || (follow.otDecision && !final(follow.otDecision))) return 'unresolved';
  // OT decisions can settle a long day or work on a day off. They do not resolve a
  // missing clock or remaining lateness/early leave, even on the same date.
  const flags = [...day.odd, ...day.soft];
  const otFlags = new Set(['More than 14 hours', 'Clocked on a day off']);
  if (flags.some((flag) => !otFlags.has(flag))) return 'unresolved';
  const otDecided = [follow.otDecision, ...follow.ot.map((request) => request.status)].some((status) => ['approved', 'rejected', 'covered'].includes(status));
  if (flags.length && !otDecided) return 'unresolved';
  return follow.ot.length || follow.missed.length || follow.credit.length || follow.otDecision ? 'settled' : 'unresolved';
}

export function attendanceFollowUps(requests: { employee_id: string; work_date: string; reason: string; status: string }[], credits: { employee_id: string; work_date: string; kind: string; hours: number }[], decisions: { employee_id: string; work_date: string; status: string }[]) {
  const result = new Map<string, AttendanceFollowUp>();
  const get = (id: string, date: string) => { const key = `${id}|${date}`; if (!result.has(key)) result.set(key, emptyFollowUp()); return result.get(key)!; };
  // Requests arrive newest first. Keep the latest OT request and each missing-clock direction.
  for (const request of requests) {
    if (request.status === 'draft') continue;
    const item = get(request.employee_id, request.work_date);
    if (isMissedClock(request.reason)) {
      if (!item.missed.some((row) => row.reason.trim().toLowerCase() === request.reason.trim().toLowerCase())) item.missed.push({ reason: request.reason, status: request.status });
    } else if (!item.ot.length) item.ot.push({ status: request.status });
  }
  for (const credit of credits) get(credit.employee_id, credit.work_date).credit.push({ kind: credit.kind, hours: Number(credit.hours) });
  for (const decision of decisions) get(decision.employee_id, decision.work_date).otDecision = decision.status;
  return result;
}

export function attendanceRequestLabel(status: string, missed = false): string {
  switch (status) {
    case 'pending': return 'Applied · waiting for supervisor';
    case 'supervisor_approved': return 'Applied · waiting for HR';
    case 'approved': return missed ? 'Settled · approved' : 'Applied · approved';
    case 'rejected': return 'Applied · rejected';
    case 'cancelled': return 'Cancelled';
    default: return status || 'Unknown status';
  }
}
