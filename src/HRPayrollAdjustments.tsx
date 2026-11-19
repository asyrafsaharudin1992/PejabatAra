import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { ADJUSTMENT_TYPES, NO_INPUTS, adjustmentTotals, type Adjustment, type PayInputs } from './lib/payrollRun';
import { card } from './AssessmentStaff';

// Payroll > Adjustments: the extra lines for one person in a month, like Infotech's Salary Adjustment (Advance, Director Fee, Incentive, Bonus, Back pay).
// A positive amount is added to the pay, a negative one is taken off. They are saved on the person's draft for the month, so Pay run, the payslip and the
// totals follow them. Like "other allowance" they count in the gross and the PCB, and not in KWSP or PERKESO. A locked month cannot be changed here.
type Person = { id: string; fullName: string; employeeCode: string; company: string; payslip?: { status: string; inputs?: PayInputs } | null };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const API = '/api/status?resource=hr';
const field = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm';
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Claim = { employeeId: string; code: string; name: string; company: string; linked: boolean; received: boolean; procedures: number; amount: number; confirmed: boolean; confirmedAmount: number | null };
const claimMonthOf = (year: number, month: number) => month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
const claimLabel = (value: string) => `${MONTHS[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}`;

export function HRPayrollAdjustments({ onError }: { onError: (message: string) => void }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(11);
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [lines, setLines] = useState<Record<string, Adjustment[]>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  // The incentive claims of a claim month, to look at with filters (Incentive module) and to sync into the pay.
  const [claimMonth, setClaimMonth] = useState('');
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [viewing, setViewing] = useState(false);
  // Past pay (brought over from Infotech): the Incentives line of those payslips, read only.
  const [past, setPast] = useState(false);
  const [pastItems, setPastItems] = useState<{ employeeId: string; code: string; name: string; company: string; month: number; amount: number }[] | null>(null);
  const [pastMonth, setPastMonth] = useState('');
  const [note, setNote] = useState('');
  const load = async () => {
    setStaff(null); setNote('');
    try {
      const data = await (await officeFetch(`${API}&action=payroll_month&year=${year}&month=${month}`)).json();
      if (data.error) throw new Error(data.error);
      setStaff(data.staff);
      const next = Object.fromEntries(data.staff.map((person: Person) => [person.id, (person.payslip?.inputs?.adjustments || []).map((item: Adjustment) => ({ ...item }))]));
      setLines(next); setSaved(Object.fromEntries(Object.entries(next).map(([id, list]) => [id, JSON.stringify(list)])));
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load the month.'); setStaff([]); }
  };
  useEffect(() => { void load(); setClaimMonth(claimMonthOf(year, month)); }, [month]);
  const loadClaims = async (value: string) => {
    try { const data = await (await officeFetch(`${API}&action=payroll_incentive&month=${value}`)).json(); if (data.error) throw new Error(data.error); return data.items as Claim[]; }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to read the incentives.'); return null; }
  };
  useEffect(() => { if (!viewing || !claimMonth) return; let live = true; setClaims(null); void loadClaims(claimMonth).then((items) => { if (live) setClaims(items || []); }); return () => { live = false; }; }, [viewing, claimMonth]);
  useEffect(() => { if (!viewing || !past || pastItems) return; void officeFetch(`${API}&action=payroll_incentive_past`).then((response) => response.json()).then((data) => { if (data.error) throw new Error(data.error); setPastItems(data.items); }).catch((cause: Error) => { onError(cause.message); setPastItems([]); }); }, [viewing, past]);
  const shownPast = (pastItems || []).filter((item) => (!company || item.company === company) && (!pastMonth || String(item.month) === pastMonth));
  const claimStatus = (item: Claim) => item.confirmed ? 'paid' : item.received ? 'waiting' : 'not received';
  const shownClaims = (claims || []).filter((item) => (!company || item.company === company) && (!status || claimStatus(item) === status));
  // Sync: the incentives already marked as paid for last month's claims are put in this month's pay as one Incentive line each (replacing the line made by an earlier sync).
  const sync = async () => {
    setBusy('sync'); setNote('');
    try {
      const from = claimMonthOf(year, month);
      const items = await loadClaims(from); if (!items) { setBusy(''); return; }
      const paid = new Map(items.filter((item) => item.linked && item.confirmed && item.employeeId && (item.confirmedAmount ?? 0) > 0).map((item) => [item.employeeId, item.confirmedAmount as number]));
      const work: { employeeId: string; inputs: PayInputs }[] = [];
      let added = 0, removed = 0, locked = 0;
      for (const person of staff || []) {
        const current = (lines[person.id] || []).map((item) => ({ ...item }));
        const others = current.filter((item) => item.source !== 'incentive');
        const amount = paid.get(person.id) || 0;
        const next = amount > 0 ? [...others, { type: 'Incentive', amount, note: `${claimLabel(from)} claims`, source: 'incentive' as const }] : others;
        if (JSON.stringify(next) === JSON.stringify(current)) continue;
        if (person.payslip?.status === 'locked') { locked++; continue; }
        if (amount > 0) added++; else removed++;
        work.push({ employeeId: person.id, inputs: { ...NO_INPUTS, ...(person.payslip?.inputs || {}), adjustments: next } });
      }
      if (work.length) {
        const response = await officeFetch(`${API}&action=payroll_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, lock: false, items: work }) });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Unable to sync.');
      }
      setNote(work.length || locked ? `Synced with the ${claimLabel(from)} incentives: ${added} added or changed, ${removed} removed${locked ? `, ${locked} skipped because their payslip is locked` : ''}. Only incentives marked as paid are included.` : `Already in step with the ${claimLabel(from)} incentives (${paid.size} marked as paid).`);
      await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to sync.'); }
    setBusy('');
  };
  const shown = useMemo(() => (staff || []).filter((person) => !search || `${person.fullName} ${person.employeeCode}`.toLowerCase().includes(search.toLowerCase())), [staff, search]);
  const edit = (id: string, next: Adjustment[]) => setLines((current) => ({ ...current, [id]: next }));
  const changed = (id: string) => JSON.stringify(lines[id] || []) !== (saved[id] ?? '[]');
  const save = async (person: Person) => {
    setBusy(person.id); setNote('');
    try {
      const adjustments = (lines[person.id] || []).filter((item) => Number(item.amount) !== 0);
      const inputs = { ...NO_INPUTS, ...(person.payslip?.inputs || {}), adjustments };
      const response = await officeFetch(`${API}&action=payroll_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, lock: false, items: [{ employeeId: person.id, inputs }] }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to save.');
      setNote(`Saved for ${person.fullName}. Pay run now includes it (the draft for this person is saved).`);
      await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy('');
  };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1"><h2 className="text-lg font-semibold">Adjustments</h2><p className="text-sm text-slate-500">Extra lines for one person in a month: advance, director fee, incentive, bonus or back pay. Use + to add to the pay and - to take off. They appear on the payslip and in Pay run.</p></div>
      <label className="text-xs font-bold text-slate-600">Month<select aria-label="Month" value={month} onChange={(event) => setMonth(Number(event.target.value))} className={`${field} mt-1 block h-10`}>{MONTHS.map((name, index) => index + 1 >= 11 || index + 1 === month ? <option key={name} value={index + 1}>{name} {year}</option> : null)}</select></label>
      <button type="button" disabled={busy === 'sync' || !staff?.length} onClick={() => void sync()} title="Puts the incentives marked as paid for last month's claims into this month's pay" className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-50">{busy === 'sync' ? 'Syncing…' : 'Sync with incentives'}</button>
      <button type="button" onClick={() => setViewing(!viewing)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b]">{viewing ? 'Hide incentives' : 'View incentives'}</button>
      <input aria-label="Search staff" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or code" className={`${field} h-10 w-56`} />
    </div>
    {viewing && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-3"><h3 className="mr-auto font-semibold">Incentives</h3>
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-semibold"><button type="button" onClick={() => setPast(false)} className={`h-9 rounded-lg px-3 ${past ? 'text-slate-500' : 'bg-[#0b587b] text-white'}`}>Claims in AraOffice</button><button type="button" onClick={() => setPast(true)} className={`h-9 rounded-lg px-3 ${past ? 'bg-[#0b587b] text-white' : 'text-slate-500'}`}>Past pay (from Infotech)</button></div>
        {past && <label className="text-xs font-bold text-slate-600">Pay month<select aria-label="Pay month" value={pastMonth} onChange={(event) => setPastMonth(event.target.value)} className={`${field} mt-1 block h-10`}><option value="">All months</option>{MONTHS.slice(0, 10).map((name, index) => <option key={name} value={index + 1}>{name} 2026</option>)}</select></label>}
        {!past && <label className="text-xs font-bold text-slate-600">Claim month<input aria-label="Claim month" type="month" value={claimMonth} onChange={(event) => setClaimMonth(event.target.value)} className={`${field} mt-1 block h-10`} /></label>}
        <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={company} onChange={(event) => setCompany(event.target.value)} className={`${field} mt-1 block h-10`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
        {!past && <label className="text-xs font-bold text-slate-600">Status<select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className={`${field} mt-1 block h-10`}><option value="">All</option><option value="paid">Marked as paid</option><option value="waiting">Received, not paid yet</option><option value="not received">Not received by HR</option></select></label>}</div>
      {past ? (!pastItems ? <p className="text-sm text-slate-500">Loading…</p> : !shownPast.length ? <p className="text-sm text-slate-500">No incentive on the payslips brought over from Infotech for these filters.</p> : <div className="overflow-x-auto"><table className="no-stack w-full min-w-[480px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-1.5 pr-3">Staff</th><th className="pr-3">Company</th><th className="pr-3">Pay month</th><th className="text-right">Incentive RM</th></tr></thead><tbody>{shownPast.map((item) => <tr key={`${item.employeeId}-${item.month}`} className="border-t border-slate-200"><td className="py-1.5 pr-3"><span className="font-semibold text-[#14233b]">{item.name}</span> <span className="text-xs text-slate-400">{item.code}</span></td><td className="pr-3">{item.company}</td><td className="pr-3">{MONTHS[item.month - 1]} 2026</td><td className="text-right">{fmt(item.amount)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-200 font-semibold"><td className="py-1.5" colSpan={3}>Total · {shownPast.length} lines</td><td className="text-right">{fmt(shownPast.reduce((sum, item) => sum + item.amount, 0))}</td></tr></tfoot></table></div>) : !claims ? <p className="text-sm text-slate-500">Loading…</p> : !shownClaims.length ? <p className="text-sm text-slate-500">No incentive claims for these filters.</p> : <div className="overflow-x-auto"><table className="no-stack w-full min-w-[620px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-1.5 pr-3">Staff</th><th className="pr-3">Company</th><th className="pr-3 text-right">Claims</th><th className="pr-3 text-right">Approved RM</th><th className="pr-3">Status</th><th>In pay of {MONTHS[(Number(claimMonth.slice(5)) % 12)] || ''}</th></tr></thead><tbody>{shownClaims.map((item) => { const payMonth = claimMonth && claimMonthOf(year, month) === claimMonth; const inPay = (lines[item.employeeId] || []).some((line) => line.source === 'incentive'); return <tr key={item.code + item.name} className="border-t border-slate-200"><td className="py-1.5 pr-3"><span className="font-semibold text-[#14233b]">{item.name || '(not linked)'}</span> <span className="text-xs text-slate-400">{item.code}</span></td><td className="pr-3">{item.company}</td><td className="pr-3 text-right">{item.procedures}</td><td className="pr-3 text-right">{fmt(item.confirmed && item.confirmedAmount != null ? item.confirmedAmount : item.amount)}</td><td className="pr-3">{item.confirmed ? 'Marked as paid' : item.received ? 'Received, not paid yet' : 'Not received by HR'}</td><td>{payMonth ? (inPay ? 'Yes' : 'Not yet') : ''}</td></tr>; })}</tbody><tfoot><tr className="border-t-2 border-slate-200 font-semibold"><td className="py-1.5" colSpan={3}>Total · {shownClaims.length} staff</td><td className="pr-3 text-right">{fmt(shownClaims.reduce((sum, item) => sum + (item.confirmed && item.confirmedAmount != null ? item.confirmedAmount : item.amount), 0))}</td><td colSpan={2} /></tr></tfoot></table></div>}
    </div>}
    {note && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{note}</p>}
    {!staff ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="text-sm text-slate-500">No staff found.</p> : <ul className="divide-y divide-slate-100">
      {shown.map((person) => {
        const locked = person.payslip?.status === 'locked'; const list = lines[person.id] || []; const totals = adjustmentTotals(list.map((item) => ({ ...item, amount: Number(item.amount) || 0 })));
        return <li key={person.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2"><p className="mr-auto min-w-[200px]"><span className="font-semibold text-[#14233b]">{person.fullName}</span> <span className="text-xs text-slate-400">{person.employeeCode} · {person.company}{locked && ' · locked'}</span></p>
            {list.length > 0 && <span className="text-xs text-slate-500">Added RM {fmt(totals.add)} · Taken off RM {fmt(totals.less)}</span>}
            {!locked && <button type="button" onClick={() => edit(person.id, [...list, { type: 'Advance', amount: 0, note: '' }])} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#0b587b]"><Plus className="h-3.5 w-3.5" />Add line</button>}
            {!locked && changed(person.id) && <button type="button" disabled={busy === person.id} onClick={() => void save(person)} className="h-8 rounded-lg bg-[#0b587b] px-3 text-xs font-bold text-white disabled:opacity-50">{busy === person.id ? 'Saving…' : 'Save'}</button>}
          </div>
          {list.map((item, index) => <div key={index} className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="Type" disabled={locked} value={item.type} onChange={(event) => edit(person.id, list.map((row, at) => at === index ? { ...row, type: event.target.value } : row))} className={field}>{ADJUSTMENT_TYPES.map((name) => <option key={name}>{name}</option>)}</select>
            <input aria-label="Amount (+ add, - take off)" disabled={locked} type="number" step="0.01" value={item.amount || ''} onChange={(event) => edit(person.id, list.map((row, at) => at === index ? { ...row, amount: Number(event.target.value) || 0 } : row))} placeholder="Amount" className={`${field} w-28 text-right`} />
            <input aria-label="Note" disabled={locked} maxLength={60} value={item.note} onChange={(event) => edit(person.id, list.map((row, at) => at === index ? { ...row, note: event.target.value } : row))} placeholder="Note (shown on the payslip)" className={`${field} min-w-[160px] flex-1`} />
            {!locked && <button type="button" aria-label="Remove line" onClick={() => edit(person.id, list.filter((_, at) => at !== index))} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
          </div>)}
        </li>;
      })}
    </ul>}
    <p className="text-xs text-slate-400">Saving a line also saves that person's draft for the month; press Save draft in Pay run to save the others. Amounts here are not hidden, so use this page in private.</p>
  </section>;
}
