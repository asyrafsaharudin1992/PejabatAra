import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { officeFetch } from './lib/officeApi';
import { pageToCanvas } from './lib/savePdf';
import { HRPayslipSheet, type HRSlip } from './HRPayslipSheet';
import { MONTHS } from './MyPayslips';

// Email payslips (Payroll > Payslips): the ticked staff of a locked month are sent their payslip one after another from this computer, so the page must stay
// open until it finishes. Each payslip is drawn here as it is previewed (identity and bank numbers hidden) and locked and sent by the server.
const API = '/api/status?resource=hr';
type Line = { id: string; code: string; name: string; company: string; status: 'draft' | 'locked' };
type Status = { configured: boolean; hidden: boolean; sender: string; testTo: string; sent: Record<string, { at: string; by: string }>; people: Record<string, { email: string; problem: string }> };

const call = async (query: string, options?: RequestInit) => {
  const response = await officeFetch(`${API}&${query}`, options); const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || 'That did not work. Try again.');
  return result;
};

// The payslip drawn outside the screen, as a JPEG picture.
async function slipPicture(slip: HRSlip) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-10000px;top:0;width:210mm;background:#fff';
  document.body.appendChild(holder);
  const root = createRoot(holder);
  try {
    flushSync(() => root.render(<HRPayslipSheet slip={slip} reveal={false} />));
    await Promise.all([document.fonts.ready, ...Array.from(holder.querySelectorAll('img'), (image) => image.decode().catch(() => undefined))]);
    return (await pageToCanvas(holder)).toDataURL('image/jpeg', 0.9);
  } finally { root.unmount(); holder.remove(); }
}

export function HRPayslipEmail({ year, month, lines }: { key?: string; year: number; month: number; lines: Line[] | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<Record<string, string>>({});
  const stop = useRef(false);
  const load = () => call(`action=payslip_email_status&year=${year}&month=${month}`).then(setStatus).catch((cause: Error) => setMessage(cause.message));
  useEffect(() => { void load(); return () => { stop.current = true; }; }, []);
  const locked = (lines || []).filter((line) => line.status === 'locked');
  const ready = (line: Line) => !!status?.people[line.id] && !status.people[line.id].problem;
  const chosen = locked.filter((line) => picked.has(line.id) && ready(line));
  const unsent = locked.filter((line) => ready(line) && !status?.sent[line.id]);
  const blocked = !status || !status.configured || status.hidden || !!progress;
  const send = async (line: Line, test: boolean) => {
    const view = await call(`action=payslip_view&employeeId=${line.id}&year=${year}&month=${month}`);
    const image = await slipPicture(view.payslip);
    await call('action=payslip_email_send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: line.id, year, month, image, test, again: !!status?.sent[line.id] }) });
  };
  const run = async (list: Line[], test: boolean) => {
    stop.current = false; setConfirming(false); setMessage(''); setFailed({});
    let done = 0; const errors: Record<string, string> = {};
    for (let at = 0; at < list.length && !stop.current; at++) {
      setProgress(`Sending ${at + 1} of ${list.length}: ${list[at].name}…`);
      try { await send(list[at], test); done++; } catch (cause) { errors[list[at].id] = cause instanceof Error ? cause.message : 'Not sent.'; }
    }
    setProgress(''); setFailed(errors);
    const problems = Object.keys(errors).length;
    setMessage(test && !problems ? `Test sent to ${status?.testTo}. Open it there and check the file opens with the staff member's IC number.` : `${done} sent${problems ? `, ${problems} not sent: ${Object.values(errors)[0]}` : ''}${stop.current ? '. Stopped.' : '.'}`);
    if (!test) { setPicked(new Set()); await load(); }
  };
  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-sm text-slate-600">Email the {MONTHS[month - 1]} {year} payslip to the address in each staff profile. The PDF opens with the staff member's IC number (12 digits).{status ? ` Sent from ${status.sender}.` : ''}</p>
    {status && !status.configured && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Email is not set up yet: add BREVO_API_KEY to the server settings, then deploy again.</p>}
    {status?.hidden && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This month is hidden from staff, so it cannot be emailed.</p>}
    {!locked.length ? <p className="text-sm text-slate-500">No locked payslips to send for this month.</p> : <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!progress} onClick={() => setPicked(new Set(unsent.map((line) => line.id)))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-50">Tick all not sent ({unsent.length})</button>
        <button type="button" disabled={!!progress} onClick={() => setPicked(new Set())} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 disabled:opacity-50">Clear</button>
        <button type="button" disabled={blocked || chosen.length !== 1} onClick={() => void run(chosen, true)} title={`Tick one staff member: their payslip is sent only to ${status?.testTo || 'you'}`} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-50">Send a test to me</button>
        {progress ? <button type="button" onClick={() => { stop.current = true; }} className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700">Stop</button>
          : confirming ? <span className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-1 text-sm text-amber-900">Email {chosen.length} staff now{chosen.some((line) => status?.sent[line.id]) ? ' (some were sent before)' : ''}?<button type="button" onClick={() => void run(chosen, false)} className="h-8 rounded-lg bg-[#0b587b] px-3 font-bold text-white">Yes, send</button><button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-600">Cancel</button></span>
          : <button type="button" disabled={blocked || !chosen.length} onClick={() => setConfirming(true)} className="h-9 rounded-lg bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-50">Email ticked ({chosen.length})</button>}
      </div>
      {progress && <p role="status" className="text-sm text-[#0b587b]">{progress} Keep this page open.</p>}
      {message && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{message}</p>}
      <ul className="max-h-80 divide-y divide-slate-200 overflow-auto rounded-xl border border-slate-200 bg-white">{locked.map((line) => { const person = status?.people[line.id], sent = status?.sent[line.id]; return <li key={line.id}><label className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm"><input type="checkbox" disabled={!ready(line) || !!progress} checked={picked.has(line.id)} onChange={() => setPicked((current) => { const next = new Set(current); if (!next.delete(line.id)) next.add(line.id); return next; })} /><span className="font-semibold">{line.name}</span><span className="text-xs text-slate-400">{line.code}</span><span className="mr-auto text-xs text-slate-500">{person?.email}</span>
        {failed[line.id] ? <span className="text-xs text-rose-700">{failed[line.id]}</span> : person?.problem ? <span className="text-xs text-amber-700">{person.problem}</span> : sent ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Sent {new Date(sent.at).toLocaleDateString('en-GB')}</span> : null}</label></li>; })}</ul>
    </>}
  </div>;
}
