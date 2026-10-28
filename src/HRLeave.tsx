import { useEffect, useMemo, useState } from 'react';
import { Search, Tags } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: every leave request made from Individual Sign In, with where each one is in the two-level approval
// (supervisor first, then the final approver). Read only: staff apply and approvers decide in Individual Sign In.
type Request = { id: string; company: string; code: string; applicant: string; type: string; group: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string; status: 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; supervisor: string; finalApprover: string; supervisorBy: string; supervisorNote: string; decidedBy: string; note: string; createdAt: string };
const LABEL: Record<Request['status'], string> = { pending: 'Waiting for supervisor', supervisor_approved: 'Waiting for final approver', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
const TONE: Record<Request['status'], string> = { pending: 'bg-amber-50 text-amber-700', supervisor_approved: 'bg-sky-50 text-sky-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-500' };
const dmy = (date: string) => date.split('-').reverse().join('/');
const range = (r: Request) => r.start === r.end ? `${dmy(r.start)}${r.half ? ` (${r.half})` : ''}` : `${dmy(r.start)} – ${dmy(r.end)}`;
const days = (value: number) => String(Math.round(value * 10) / 10);

export function HRLeave({ onError, onTypes }: { onError: (message: string) => void; onTypes: () => void }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Request[] | null>(null);
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const [month, setMonth] = useState(''); // 1-12, or '' for the whole year
  const [query, setQuery] = useState('');
  useEffect(() => {
    setRows(null); setMonth('');
    officeFetch(`/api/status?resource=hr&action=leave_requests&year=${year}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setRows(result.requests); })
      .catch((cause: Error) => { setRows([]); onError(cause.message); });
  }, [year]);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  // A request belongs to a month when any of its days falls in that month.
  const monthStart = month ? `${year}-${month.padStart(2, '0')}-01` : '', monthEnd = month ? `${year}-${month.padStart(2, '0')}-31` : '';
  const inScope = (row: Request) => (!company || row.company === company) && (!month || (row.start <= monthEnd && row.end >= monthStart));
  const count = (status: Request['status']) => (rows || []).filter((row) => inScope(row) && row.status === status).length;
  const onLeaveToday = (rows || []).filter((row) => row.status === 'approved' && row.start <= today && row.end >= today);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (rows || []).filter((row) => (!status || row.status === status) && inScope(row) && words.every((word) => `${row.applicant} ${row.code} ${row.type}`.toLowerCase().includes(word))), [rows, status, company, query, month, year]);
  const tiles: [string, number, string][] = [['Waiting for supervisor', count('pending'), 'text-amber-600'], ['Waiting for final approver', count('supervisor_approved'), 'text-sky-600'], ['Approved', count('approved'), 'text-emerald-600'], ['On leave today', onLeaveToday.length, 'text-[#0b587b]']];

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Leave</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Every leave request from Individual Sign In. Each goes to the staff member's supervisor first, then to the final approver, and the balance only comes off after the final approval.</p></div>
        <button onClick={onTypes} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-white/12 px-5 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/20"><Tags className="h-4 w-4" />Leave types</button>
      </div>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles.map(([label, value, tone]) => <div key={label} className={card}><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-3xl font-semibold ${tone}`}>{rows ? value : '…'}</p></div>)}</div>
    {onLeaveToday.length > 0 && <p className="rounded-xl bg-[#f4fafd] p-3 text-sm text-slate-700"><strong className="text-[#0b587b]">On leave today:</strong> {onLeaveToday.map((row) => `${row.applicant} (${row.type})`).join(', ')}</p>}
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, staff code or leave type" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" /></div>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option>{(Object.keys(LABEL) as Request['status'][]).map((key) => <option key={key} value={key}>{LABEL[key]}</option>)}</select>
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All months</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1)}>{new Date(2026, index, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>)}</select>
      <select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Year" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">{[thisYear + 1, thisYear, thisYear - 1].map((value) => <option key={value} value={value}>{value}</option>)}</select>
    </section>
    <section className={`${card} overflow-x-auto`}>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="text-sm text-slate-500">{rows.length ? 'No request matches these filters.' : `No leave requests in ${year} yet.`}</p> :
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-4 font-semibold">Staff</th><th className="py-2 pr-4 font-semibold">Leave</th><th className="py-2 pr-4 font-semibold">Dates</th><th className="py-2 pr-4 font-semibold">Days</th><th className="py-2 pr-4 font-semibold">Status</th><th className="py-2 pr-4 font-semibold">Supervisor</th><th className="py-2 font-semibold">Final approver</th></tr></thead>
          <tbody>{shown.map((row) => <tr key={row.id} className="border-b border-slate-50 align-top">
            <td className="py-3 pr-4"><p className="font-semibold">{row.applicant}</p><p className="text-xs text-slate-400">{row.company} · {row.code}</p></td>
            <td className="py-3 pr-4"><span className="font-mono text-xs font-bold text-[#0b587b]">{row.type}</span>{row.reason && <p className="mt-0.5 max-w-[220px] text-xs text-slate-500">{row.reason}</p>}</td>
            <td className="py-3 pr-4 whitespace-nowrap text-[#2a5ea8]">{range(row)}</td>
            <td className="py-3 pr-4">{days(row.days)}</td>
            <td className="py-3 pr-4"><span className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold ${TONE[row.status]}`}>{LABEL[row.status]}</span></td>
            <td className="py-3 pr-4 text-xs text-slate-600">{row.supervisor || <span className="text-slate-300">Not set</span>}{row.supervisorNote && <p className="mt-0.5 text-slate-400">“{row.supervisorNote}”</p>}</td>
            <td className="py-3 text-xs text-slate-600">{row.finalApprover || <span className="text-slate-300">None (supervisor is final)</span>}{row.note && <p className="mt-0.5 text-slate-400">“{row.note}”</p>}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}
