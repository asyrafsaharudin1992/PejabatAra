import { FormEvent, useEffect, useState } from 'react';
import { FileText, HeartPulse, Send } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { CareFormView } from './CareFormSheet';
import { CARE_ITEMS, CARE_ROLES, CareClaim, careMonth, careStatusLabel, careStatusTone } from './lib/careClaim';

// Staff Incentive page: the AraCare Care Coordination Allowance (RM 100 a month). It is separate from the normal incentive claim and is
// only shown to the staff HR has set as AraCare coordinators. The COO checks the KPIs; an approved claim goes straight to HR.
const field = 'h-11 w-full rounded-xl border-0 bg-[#f4f6fa] px-3 text-sm outline-none focus:ring-4 focus:ring-[#0b587b]/10';
type Data = { eligible: boolean; amount?: number; claim?: CareClaim | null };

export function CareSection({ month }: { month: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [items, setItems] = useState<string[]>(CARE_ITEMS.map(() => ''));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(false);
  const load = () => assessmentFetch(`action=care&month=${month}`).then((result: Data) => {
    setData(result);
    // A returned claim is filled in again from what was sent.
    const claim = result.claim;
    if (claim && claim.status === 'returned') { setRoles(claim.roles); setOther(claim.other); setItems(CARE_ITEMS.map((_item, index) => claim.items[index] || '')); setConfirmed(false); }
    else { setRoles([]); setOther(''); setItems(CARE_ITEMS.map(() => '')); setConfirmed(false); }
  }).catch(() => setData({ eligible: false }));
  useEffect(() => { setData(null); setError(''); void load(); }, [month]);
  if (!data?.eligible) return null;
  const claim = data.claim || null;
  const open = !claim || claim.status === 'returned';
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await assessmentFetch('action=care_submit', { method: 'POST', body: JSON.stringify({ month, roles, other, items, confirmed }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send.'); } finally { setBusy(false); }
  };
  return <section className="mt-6 rounded-2xl border border-[#cfe6f1] bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
    <div className="flex flex-wrap items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf6fb] text-[#0b587b]"><HeartPulse className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><h2 className="font-semibold">Care Coordination Allowance (AraCare)</h2><p className="text-xs leading-5 text-slate-500">RM {(data.amount || 100).toFixed(0)} sebulan, berasingan daripada tuntutan insentif biasa. Dr Luqman (COO) menyemak KPI anda, kemudian tuntutan terus ke HR.</p></div>
      {claim && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${careStatusTone(claim)}`}>{careStatusLabel(claim)}</span>}</div>
    {claim?.status === 'returned' && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><strong>Dipulangkan:</strong> {claim.decisionNote || 'Sila semak dan hantar semula.'}{claim.decidedBy ? ` (${claim.decidedBy})` : ''}</p>}
    {claim?.status === 'submitted' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Tuntutan {careMonth(month)} telah dihantar. Menunggu semakan Dr Luqman (COO).</p>}
    {claim?.status === 'approved' && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Diluluskan oleh {claim.decidedBy} dan {claim.hrReceivedAt ? 'telah diterima HR.' : 'dihantar ke HR.'}</p>}
    {open && <form onSubmit={submit} className="mt-4 space-y-4">
      <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Peranan (tandakan)</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{CARE_ROLES.map((role) => <label key={role} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={roles.includes(role)} onChange={(event) => setRoles(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role))} />{role}</label>)}</div>
        {roles.includes('Lain-lain') && <input value={other} maxLength={60} onChange={(event) => setOther(event.target.value)} placeholder="Lain-lain: nyatakan" className={`${field} mt-2`} />}</fieldset>
      <div><p className="mb-2 text-xs font-bold text-slate-700">Ringkasan aktiviti bulanan</p><div className="space-y-2">{CARE_ITEMS.map((label, index) => <label key={label} className="block"><span className="mb-1 block text-xs text-slate-600">{index + 1}. {label}</span><input required value={items[index]} maxLength={200} onChange={(event) => setItems(items.map((value, at) => at === index ? event.target.value : value))} placeholder="Jumlah atau butiran" className={field} /></label>)}</div></div>
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1.5" /><span>Saya mengesahkan bahawa registry telah dikemaskini secara berkala, follow-up pesakit telah dijalankan, dan data adalah tepat dan boleh diaudit.</span></label>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      <button disabled={busy || !roles.length} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Send className="h-4 w-4" />{busy ? 'Menghantar…' : `Hantar tuntutan AraCare ${careMonth(month)}`}</button>
    </form>}
    {claim && <button type="button" onClick={() => setViewing(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><FileText className="h-4 w-4" />Lihat borang / PDF</button>}
    {viewing && claim && <CareFormView claim={claim} onClose={() => setViewing(false)} />}
  </section>;
}
