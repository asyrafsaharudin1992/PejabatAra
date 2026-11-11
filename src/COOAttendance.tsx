import { useEffect, useState } from 'react';
import { isMissedClock } from './lib/attendanceRequests';
import { card } from './AssessmentStaff';

// Office COO > Attendance: the OT (and forgotten-clock) requests that wait for the COO's approval as a supervisor.
// The same requests and rules as in the COO's Individual Sign In; HR still confirms the OT rate afterwards.
type Req = { id: string; name: string; date: string; inTime: string; outTime: string; otMinutes: number; reason: string; remarks: string; stage?: 'supervisor' | 'hr' };
const PAGE = 10;
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const detail = (request: Req) => [request.inTime && `in ${request.inTime}`, request.outTime && `out ${request.outTime}`, request.otMinutes > 0 && `OT ${Math.floor(request.otMinutes / 60)} h ${request.otMinutes % 60} m`].filter(Boolean).join(' · ');

export default function COOAttendance({ call, onError }: { call: (query: string, body?: unknown) => Promise<any>; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState('');
  const [pages, setPages] = useState<Record<string, number>>({});
  const load = () => call('action=attendance_request_approvals').then((result) => setRows(result.requests || [])).catch((cause: Error) => { setRows([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(id);
    try { await call('action=attendance_request_decide', { id, decision }); await load(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy('');
  };
  const section = (key: string, title: string, list: Req[]) => {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const at = Math.min(pages[key] || 0, Math.max(0, Math.ceil(sorted.length / PAGE) - 1));
    return <section className={`${card} space-y-3`}>
      <h3 className="font-semibold">{title} <span className="text-xs font-normal text-slate-400">· waiting for your approval ({sorted.length})</span></h3>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : !sorted.length ? <p className="text-sm text-slate-500">Nothing is waiting for your approval.</p> : <ul className="divide-y divide-slate-100">{sorted.slice(at * PAGE, at * PAGE + PAGE).map((request) => <li key={request.id} className="py-3 text-sm">
        <p className="font-semibold">{request.name}</p>
        <p className="text-xs text-slate-500">{dayName(request.date)} · {detail(request)}</p>
        <p className="mt-0.5 text-xs text-slate-400">{request.reason}{request.remarks && ` · ${request.remarks}`}</p>
        <div className="mt-2 flex gap-2"><button type="button" disabled={busy === request.id} onClick={() => void decide(request.id, 'approved')} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-60">Approve</button><button type="button" disabled={busy === request.id} onClick={() => void decide(request.id, 'rejected')} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 disabled:opacity-60">Reject</button></div>
      </li>)}</ul>}
      {sorted.length > PAGE && <nav className="flex items-center justify-between gap-2 text-xs text-slate-500" aria-label="Pages"><button type="button" disabled={at === 0} onClick={() => setPages({ ...pages, [key]: at - 1 })} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Newer</button><span>{at * PAGE + 1}–{Math.min(sorted.length, at * PAGE + PAGE)} of {sorted.length}</span><button type="button" disabled={(at + 1) * PAGE >= sorted.length} onClick={() => setPages({ ...pages, [key]: at + 1 })} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Older</button></nav>}
    </section>;
  };
  const all = rows || [];
  return <div className="space-y-4">
    {section('ot', 'Approve OT', all.filter((request) => !isMissedClock(request.reason)))}
    {section('missed', 'Approve missed clock', all.filter((request) => isMissedClock(request.reason)))}
    <p className="text-xs text-slate-400">After you approve, HR confirms the OT rate. These are the same requests as in your Individual Sign In.</p>
  </div>;
}
