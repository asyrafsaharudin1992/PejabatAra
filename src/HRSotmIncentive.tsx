import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { monthShort } from './lib/incentiveSummaryPdf';

// Office HR > Incentive > SOTM: who is Staff of the Month in each branch. Anyone with a SOTM poster (Miscellaneous > SOTM) for the month is ticked already; HR can tick
// others by hand. Each one is paid the SOTM amount in the Incentive summary without sending a claim.
type Person = { id: string; employeeCode: string; fullName: string; company: string; status: string };
type ByBranch = { KJ: string[]; SK: string[] };
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
const shiftMonth = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
const months = () => { const list: string[] = []; for (let month = shiftMonth(thisMonth(), 1); month >= '2026-10'; month = shiftMonth(month, -1)) list.push(month); return list; };
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
export function HRSotmIncentive({ onError }: { onError: (message: string) => void }) {
  const start = new Date().getDate() <= 10 ? shiftMonth(thisMonth(), -1) : thisMonth();
  const [month, setMonth] = useState(start < '2026-10' ? '2026-10' : start);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [poster, setPoster] = useState<ByBranch>({ KJ: [], SK: [] });
  const [manual, setManual] = useState<ByBranch>({ KJ: [], SK: [] });
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [amount, setAmount] = useState(100);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { call('action=employees').then((result) => setPeople(((result.employees || []) as Person[]).filter((person) => person.status === 'Active' && ['KJ', 'SK'].includes(person.company)).sort((a, b) => a.fullName.localeCompare(b.fullName)))).catch((cause: Error) => { setPeople([]); onError(cause.message); }); }, []);
  useEffect(() => { setDirty(false); setNotice(''); call(`action=incentive_sotm_winners&month=${month}`).then((result) => { setPoster(result.poster); setManual(result.manual); setAmount(result.amount); setUnmatched(result.unmatched || []); }).catch((cause: Error) => onError(cause.message)); }, [month]);
  const toggle = (company: 'KJ' | 'SK', code: string) => { setManual({ ...manual, [company]: manual[company].includes(code) ? manual[company].filter((item) => item !== code) : [...manual[company], code] }); setDirty(true); setNotice(''); };
  const save = async () => { setBusy(true); try { const result = await call('action=incentive_sotm_winners_save', { month, winners: manual }); setManual(result.manual); setDirty(false); setNotice('Saved. The winners are paid in the Incentive summary for this month.'); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); } };
  const chosen = (company: 'KJ' | 'SK') => new Set([...poster[company], ...manual[company]]).size;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Staff of the Month (SOTM)</h3><p className="text-sm text-slate-500">Anyone with a SOTM poster for the month (Miscellaneous &gt; SOTM) is ticked already. Tick others by hand if needed. Each is paid RM{amount} in the Incentive summary (SOTM column) without sending a claim; a SOTM claim as well is counted once.</p></div>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{months().map((value) => <option key={value} value={value}>{monthShort(value)}</option>)}</select>
      <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />Save</button>
    </div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {unmatched.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">The poster for {unmatched.join(', ')} could not be matched to a staff record: tick the person by hand below.</p>}
    {dirty && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Not saved yet.</p>}
    {!people ? <p className="text-sm text-slate-500">Loading…</p> : <div className="grid gap-4 md:grid-cols-2">{(['KJ', 'SK'] as const).map((company) => <div key={company} className="rounded-2xl border border-slate-100 p-3">
      <p className="mb-2 flex items-center justify-between text-sm font-bold text-[#0b587b]"><span>{company === 'KJ' ? 'Kajang' : 'Seri Kembangan'}</span><span className="text-xs font-semibold text-slate-400">{chosen(company) ? `${chosen(company)} chosen · RM${chosen(company) * amount}` : 'none chosen'}</span></p>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">{people.filter((person) => person.company === company).map((person) => { const fromPoster = poster[company].includes(person.employeeCode); return <li key={person.id}><label className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${fromPoster ? '' : 'cursor-pointer hover:bg-slate-50'}`}><input type="checkbox" checked={fromPoster || manual[company].includes(person.employeeCode)} disabled={fromPoster} onChange={() => toggle(company, person.employeeCode)} className="h-4 w-4 rounded border-slate-300" /><span className="min-w-0 flex-1 truncate">{person.fullName}</span>{fromPoster && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">from poster</span>}<span className="text-[10px] text-slate-400">{person.employeeCode}</span></label></li>; })}</ul>
    </div>)}</div>}
  </section>;
}
