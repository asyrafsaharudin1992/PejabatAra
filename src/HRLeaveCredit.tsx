import { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR: Credit Annual Leave Report (who was given extra Annual Leave, for what, and when) and the form that
// gives credit to one or many staff. Every credit is also added to the person's AL credit for that year.
type Credit = { id: string; date: string; days: number; remarks: string; source: string };
type Person = { id: string; company: string; code: string; name: string; credits: Credit[] };
type Staff = { id: string; company: string; code: string; name: string; status: string };
const COMPANY: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN. BHD.', SK: 'SK- HSO HEALTHCARE SDN. BHD.' };
const dmy = (date: string) => date.split('-').reverse().join('/');
const dmyDash = (date: string) => date.split('-').reverse().join('-');
const n2 = (value: number) => value.toFixed(2);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export function HRLeaveCredit({ onError }: { onError: (message: string) => void }) {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [company, setCompany] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [shown, setShown] = useState({ from: `${year}-01-01`, to: `${year}-12-31`, company: '' });
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const load = () => {
    setPeople(null);
    call(`action=leave_credit_report&from=${from}&to=${to}${company ? `&company=${company}` : ''}`).then((result) => { setPeople(result.people); setShown({ from, to, company }); })
      .catch((cause: Error) => { setPeople([]); onError(cause.message); });
  };
  useEffect(load, []);

  const remove = async (credit: Credit, person: Person) => {
    if (!window.confirm(`Take back ${n2(credit.days)} day(s) of "${credit.remarks}" from ${person.name}? It comes off their AL credit for ${credit.date.slice(0, 4)}.`)) return;
    try { await call('action=leave_credit_delete', { id: credit.id }); setNotice('Credit removed.'); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to remove the credit.'); }
  };
  const grand = (people || []).reduce((sum, person) => sum + person.credits.reduce((inner, credit) => inner + credit.days, 0), 0);
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';

  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[220px] flex-1"><h2 className="text-lg font-semibold">Credit Annual Leave Report</h2><p className="text-sm text-slate-500">Every Annual Leave credit given in a period (public holiday replacement, training days and so on), per person.</p></div>
      <label className="text-xs font-bold text-slate-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="text-xs font-bold text-slate-600">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="text-xs font-bold text-slate-600">Company<select value={company} onChange={(event) => setCompany(event.target.value)} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <button onClick={load} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white hover:bg-[#0a4c6a]">Preview</button>
      <button onClick={() => window.print()} disabled={!people?.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer className="h-4 w-4" />Print / PDF</button>
      <button onClick={() => setAdding(!adding)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Give credit</button>
    </section>
    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 print:hidden">{notice}</p>}
    {adding && <GiveCredit onError={onError} onDone={(count) => { setAdding(false); setNotice(`Credit given to ${count} staff.`); load(); }} />}
    <section className={`${card} leave-report print:rounded-none print:p-0 print:shadow-none`}>
      <header className="mb-4 flex items-center gap-4"><img src="/forms/ara-logo.jpg" alt="Klinik ARA 24 Jam" className="h-14 w-14 shrink-0 object-contain" /><div><p className="text-base font-bold text-[#1f3a6b]">{shown.company ? COMPANY[shown.company] : 'HSO HEALTHCARE SDN. BHD. (KJ and SK)'}</p><p className="text-[11px] font-semibold text-slate-600">Klinik ARA 24 Jam</p><p className="mt-1 text-sm font-bold text-[#1f3a6b]">Credit Annual Leave Report (Individual)</p><p className="text-[11px] text-slate-500">Period from {dmyDash(shown.from)} to {dmyDash(shown.to)} · Report as on {dmy(today())}</p></div></header>
      {!people ? <p className="text-sm text-slate-500">Loading…</p> : !people.length ? <p className="text-sm text-slate-500">No credits in this period.</p> :
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead><tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Remarks</th><th className="px-3 py-2">Created date</th><th className="px-3 py-2 text-right">Days</th><th className="w-10 px-2 py-2 print:hidden" /></tr></thead>
          <tbody>{people.map((person) => <>{person.credits.map((credit, index) => <tr key={credit.id}>
            <td className="border-t border-slate-100 px-3 py-2 align-top">{index === 0 && <><span className="font-semibold text-slate-800">{person.code} - {person.name}</span></>}</td>
            <td className="border-t border-slate-100 px-3 py-2">{credit.remarks}{credit.source === 'Infotech' && <span className="ml-2 text-[10px] text-slate-400 print:hidden">from Infotech</span>}</td>
            <td className="border-t border-slate-100 px-3 py-2">{dmy(credit.date)}</td>
            <td className="border-t border-slate-100 px-3 py-2 text-right tabular-nums">{n2(credit.days)}</td>
            <td className="border-t border-slate-100 px-2 py-2 print:hidden"><button onClick={() => void remove(credit, person)} title="Take this credit back" aria-label="Take this credit back" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
          </tr>)}
          <tr key={`${person.id}-total`}><td colSpan={3} className="px-3 pb-2 text-right font-bold text-slate-500">Total:</td><td className="px-3 pb-2 text-right font-bold tabular-nums text-[#0b587b]">{n2(person.credits.reduce((sum, credit) => sum + credit.days, 0))}</td><td className="print:hidden" /></tr></>)}</tbody>
          <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={3} className="px-3 py-2 text-right text-slate-500">{people.length} staff · all credits</td><td className="px-3 py-2 text-right tabular-nums">{n2(grand)}</td><td className="print:hidden" /></tr></tfoot>
        </table>}
    </section>
  </div>;
}

// Give one credit (same days, date and reason) to several staff at once, for example a training day or a public holiday.
function GiveCredit({ onError, onDone }: { onError: (message: string) => void; onDone: (count: number) => void }) {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [days, setDays] = useState('1');
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { call('action=leave_staff').then((result) => setStaff((result.staff as Staff[]).filter((person) => person.status === 'Active'))).catch((cause: Error) => { setStaff([]); onError(cause.message); }); }, []);
  const list = useMemo(() => (staff || []).filter((person) => !query.trim() || `${person.code} ${person.name}`.toLowerCase().includes(query.trim().toLowerCase())), [staff, query]);
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const pickAll = (value: boolean, only?: string) => setPicked((current) => { const next = new Set(current); for (const person of list) if (!only || person.company === only) { if (value) next.add(person.id); else next.delete(person.id); } return next; });
  const save = async () => {
    setSaving(true);
    try {
      if (!window.confirm(`Give ${days} day(s) of Annual Leave credit ("${remarks.trim()}") to ${picked.size} staff?`)) return;
      const result = await call('action=leave_credit_add', { employeeIds: [...picked], days: Number(days), date, remarks: remarks.trim() });
      onDone(result.count);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to give the credit.'); }
    finally { setSaving(false); }
  };
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  return <section className={`${card} space-y-4 print:hidden`}>
    <div><h3 className="font-semibold">Give Annual Leave credit</h3><p className="text-sm text-slate-500">The days are added to each person's AL credit for the year of the date, and recorded in this report.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-[240px] flex-1 text-xs font-bold text-slate-600">What is it for?<input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. CREDIT AL PH RAYA" maxLength={160} className={`${field} mt-1 block w-full`} /></label>
      <label className="text-xs font-bold text-slate-600">Days<input type="number" min="0.5" max="30" step="0.5" value={days} onChange={(event) => setDays(event.target.value)} className={`${field} mt-1 block w-24`} /></label>
      <label className="text-xs font-bold text-slate-600">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${field} mt-1 block`} /></label>
    </div>
    <div className="rounded-2xl border border-slate-100">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" className={`${field} w-48`} />
        <button onClick={() => pickAll(true)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">Select all shown</button>
        <button onClick={() => pickAll(true, 'KJ')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">All KJ</button>
        <button onClick={() => pickAll(true, 'SK')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">All SK</button>
        <button onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Clear</button>
        <span className="ml-auto text-xs font-semibold text-[#0b587b]">{picked.size} selected</span>
      </div>
      <div className="grid max-h-64 gap-x-4 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">{!staff ? <p className="text-sm text-slate-500">Loading…</p> : list.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={picked.has(person.id)} onChange={() => toggle(person.id)} className="h-4 w-4 accent-[#0b587b]" /><span className="min-w-0 flex-1 truncate">{person.name}</span><span className="text-[10px] text-slate-400">{person.code}</span></label>)}</div>
    </div>
    <button onClick={() => void save()} disabled={saving || !picked.size || !remarks.trim()} className="h-11 rounded-xl bg-[#0b587b] px-6 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{saving ? 'Saving…' : `Give credit to ${picked.size} staff`}</button>
  </section>;
}
