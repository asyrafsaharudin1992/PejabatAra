import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Staff ask HR to change their own details from Individual Sign In. HR sees what changes (before and after), then approves
// (the details change in the profile and it is written to its recent changes) or rejects with an optional note.
const API = '/api/status?resource=hr';
type Change = { from: unknown; to: unknown };
type Request = { id: string; name: string; company: string; code: string; status: 'pending' | 'approved' | 'rejected'; changes: Record<string, Change>; requestedAt: string; decidedAt: string | null; note: string };

const LABEL: Record<string, string> = { date_of_birth: 'Date of birth', religion: 'Religion', race: 'Race', nationality: 'Nationality', marital_status: 'Marital status', address_line1: 'Address line 1', address_line2: 'Address line 2', postcode: 'Postcode', city: 'City', state: 'State', phone: 'Mobile', email: 'Email', emergency_name: 'Emergency contact', emergency_relation: 'Emergency relationship', emergency_phone: 'Emergency phone', spouse_name: 'Spouse name', spouse_employer: 'Spouse occupation', spouse_phone: 'Spouse phone', children: 'Children', education: 'Education' };
const dmy = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
function show(column: string, value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    return value.map((item: any) => column === 'children' ? `${item.name}${item.dateOfBirth ? ` (${dmy(item.dateOfBirth)})` : ''}` : [[item.level, item.course].filter(Boolean).join(' · '), [item.institution, item.year].filter(Boolean).join(' ')].filter(Boolean).join(', ')).join('\n');
  }
  const text = String(value ?? '').trim();
  return text ? dmy(text) : '—';
}
const when = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export function HRProfileRequests({ onError, onChanged }: { onError: (message: string) => void; onChanged: (pending: number) => void }) {
  const [data, setData] = useState<{ requests: Request[]; notSetUp?: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = () => officeFetch(`${API}&action=profile_requests`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setData(result); onChanged(result.pending || 0); }).catch((cause: Error) => { setData({ requests: [] }); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const decide = async (request: Request, approve: boolean) => {
    setBusy(request.id);
    try {
      const response = await officeFetch(`${API}&action=profile_request_decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: request.id, approve, note: notes[request.id] || '' }) });
      const result = await response.json(); if (result.error) throw new Error(result.error);
      await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the decision.'); }
    setBusy('');
  };
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const pending = data.requests.filter((request) => request.status === 'pending'), decided = data.requests.filter((request) => request.status !== 'pending').slice(0, 30);
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[28px] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-2 text-2xl font-semibold">Profile requests</h2><p className="mt-2 max-w-2xl text-[#b9cfdd]">Staff ask to change their own details from Individual Sign In. Nothing changes in their profile until you approve it. IC, bank and pay details cannot be requested.</p></section>
    {data.notSetUp && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Update requests are not set up yet: the database migration 202611010002 has not been run.</p>}
    {!data.notSetUp && !pending.length && <p className="rounded-2xl border border-dashed border-[#dce4ed] bg-white p-8 text-center text-sm text-slate-500">No requests waiting.</p>}
    {pending.map((request) => <section key={request.id} className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-lg font-semibold">{request.name} <span className="ml-1 text-xs font-normal text-slate-400">{request.company} · {request.code}</span></p><p className="text-xs text-slate-400">Asked {when(request.requestedAt)}</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Detail</th><th className="pr-4">Now</th><th>Asked to become</th></tr></thead>
        <tbody>{(Object.entries(request.changes) as [string, Change][]).map(([column, change]) => <tr key={column} className="border-t border-slate-100 align-top"><td className="py-2 pr-4 font-semibold text-slate-700">{LABEL[column] || column}</td><td className="whitespace-pre-line pr-4 text-slate-500">{show(column, change.from)}</td><td className="whitespace-pre-line font-medium text-[#0b587b]">{show(column, change.to)}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center gap-3"><input value={notes[request.id] || ''} maxLength={300} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} placeholder="Note to the staff member (optional)" className="h-10 min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
        <button type="button" disabled={busy === request.id} onClick={() => void decide(request, true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" />Approve</button>
        <button type="button" disabled={busy === request.id} onClick={() => void decide(request, false)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" />Reject</button></div>
    </section>)}
    {decided.length > 0 && <section className={card}><h3 className="font-semibold">Decided</h3>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">{decided.map((request) => <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{request.status === 'approved' ? 'Approved' : 'Rejected'}</span><span className="font-semibold">{request.name}</span><span className="text-slate-500">{Object.keys(request.changes).map((column) => LABEL[column] || column).join(', ')}</span><span className="ml-auto text-xs text-slate-400">{when(request.decidedAt)}</span>{request.note && <span className="w-full text-xs text-slate-500">Note: {request.note}</span>}</li>)}</ul></section>}
  </div>;
}
