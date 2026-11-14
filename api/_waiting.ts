import { leaveAction, reviewAction } from './_assessment.js';
import { attendanceStaffAction } from './_attendance.js';

// What waits for one person, as numbers only: the leave they must decide, the OT and forgotten-clock requests, and the reviews given to them. Each list is read
// the same way the full screens read it (the person's own Individual Sign In lists), with the answer caught instead of sent.
export type WaitingCounts = { leave: number | null; requests: number | null; reviews: number | null };
export async function waitingCounts(db: any, staffId: string, headers: any, want: { leave?: boolean; requests?: boolean; reviews?: boolean } = { leave: true, requests: true, reviews: true }): Promise<WaitingCounts> {
  const staff = { id: staffId };
  const count = async (run: (sink: any, readReq: any) => Promise<unknown>, pick: (body: any) => unknown[] | undefined) => {
    let out: any = null;
    const sink: any = { status: () => sink, json: (body: unknown) => { out = body; return sink; }, setHeader: () => sink };
    try { await run(sink, { method: 'GET', query: {}, headers }); } catch { return null; }
    return pick(out)?.length ?? null;
  };
  const [leave, requests, reviews] = await Promise.all([
    want.leave ? count((sink, readReq) => leaveAction(readReq, sink, db, staff, 'leave_approvals', {}), (body) => body?.pending) : null,
    want.requests ? count((sink, readReq) => attendanceStaffAction(readReq, sink, db, staff, 'attendance_request_approvals', {}), (body) => body?.requests) : null,
    want.reviews ? count((sink, readReq) => reviewAction(readReq, sink, db, staff, 'review_todo', {}), (body) => body?.reviews) : null,
  ]);
  return { leave, requests, reviews };
}
