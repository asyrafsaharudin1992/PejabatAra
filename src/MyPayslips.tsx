import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';

// My payslips inside Individual Sign In: the months HR has locked, newest first, and one payslip at a time. Only the signed-in person's own.
type Item = { year: number; month: number; gross: number; net: number };
type Slip = { year: number; month: number; name: string; code: string; company: string; designation: string; department: string; basic: number; allowances: { name: string; amount: number }[]; ot: number; restPh: number; gross: number; kwspEmployee: number; kwspEmployer: number; socsoEmployee: number; socsoEmployer: number; eisEmployee: number; eisEmployer: number; skbbk: number; pcb: number; deductions: number; net: number; ytdWages: number; ytdPcb: number };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (value: number) => (value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Line({ label, value, strong }: { key?: string; label: string; value: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-3 py-1.5 text-sm ${strong ? 'font-bold text-[#14233b]' : 'text-slate-600'}`}><span>{label}</span><span className="tabular-nums">{fmt(value)}</span></div>;
}

export default function MyPayslips() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { assessmentFetch('action=my_payslips').then((result: { payslips: Item[] }) => setItems(result.payslips)).catch((cause: Error) => { setError(cause.message); setItems([]); }); }, []);
  const open = async (item: Item) => { setError(''); try { const result = await assessmentFetch(`action=my_payslip&year=${item.year}&month=${item.month}`); setSlip(result.payslip); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open the payslip.'); } };
  if (slip) return <div className="space-y-3">
    <div className="flex items-center justify-between"><button type="button" onClick={() => setSlip(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b587b]"><ChevronLeft className="h-4 w-4" />All payslips</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#0b587b] shadow-sm"><Printer className="h-4 w-4" />Print</button></div>
    <article className="rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
      <p className="text-xs font-bold uppercase tracking-wide text-[#0b587b]">Payslip · {MONTHS[slip.month - 1]} {slip.year}</p>
      <h2 className="mt-1 text-lg font-semibold text-[#14233b]">{slip.name}</h2>
      <p className="text-xs text-slate-500">{slip.code} · {[slip.designation, slip.department].filter(Boolean).join(' · ')}</p>
      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Earnings</h3>
      <Line label="Basic salary" value={slip.basic} />{slip.allowances.map((item) => <Line key={item.name} label={item.name} value={item.amount} />)}{slip.ot > 0 && <Line label="Overtime" value={slip.ot} />}{slip.restPh > 0 && <Line label="Rest day / public holiday" value={slip.restPh} />}
      <div className="border-t border-slate-100"><Line label="Gross pay" value={slip.gross} strong /></div>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Deductions</h3>
      <Line label="KWSP" value={slip.kwspEmployee} /><Line label="PERKESO" value={slip.socsoEmployee} /><Line label="EIS" value={slip.eisEmployee} />{slip.skbbk > 0 && <Line label="SKBBK" value={slip.skbbk} />}{slip.pcb > 0 && <Line label="PCB (monthly tax)" value={slip.pcb} />}
      <div className="border-t border-slate-100"><Line label="Total deductions" value={slip.deductions} strong /></div>
      <div className="mt-2 rounded-xl bg-[#e9f6fb] px-4 py-3"><Line label="Net pay" value={slip.net} strong /></div>
      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Paid by your employer</h3>
      <Line label="KWSP" value={slip.kwspEmployer} /><Line label="PERKESO" value={slip.socsoEmployer} /><Line label="EIS" value={slip.eisEmployer} />
      <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Year to date</h3>
      <Line label="Pay so far this year" value={slip.ytdWages} /><Line label="PCB so far this year" value={slip.ytdPcb} />
    </article>
  </div>;
  if (items === null) return <p className="text-sm text-slate-500">Loading…</p>;
  return <div className="space-y-3">
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!items.length ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">No payslips yet. A month appears here once HR has finished it.</p>
      : items.map((item) => <button key={`${item.year}-${item.month}`} type="button" onClick={() => void open(item)} className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span><strong className="block text-sm text-[#14233b]">{MONTHS[item.month - 1]} {item.year}</strong><span className="text-xs text-slate-500">Net pay</span></span><strong className="text-base tabular-nums text-[#0b587b]">RM {fmt(item.net)}</strong></button>)}
  </div>;
}
