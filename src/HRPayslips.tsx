import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Printer, X } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { payPeriod } from './lib/payrollRun';
import { COMPANY, Field, fmt, longDate, MONTHS, Pair, PayslipDocument, Row, usePayslipPrint, type Slip } from './MyPayslips';

// Payroll > Payslips: the payslips of any past payroll month for everyone paid in it (HR and Finance), with a Preview of each as the staff member sees it.
// October 2026 and before are what Infotech paid; November 2026 on is what was run in AraOffice. Amounts in the list stay hidden until Show amounts is pressed.
const API = '/api/status?resource=hr';
type Line = { id: string; code: string; name: string; company: string; designation: string; status: 'draft' | 'locked'; net: number };
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
// Payroll months from January 2026 to a few months ahead.
const OPTIONS = (() => { const out: { year: number; month: number }[] = []; for (let y = 2026; y <= 2027; y++) for (let m = 1; m <= 12; m++) out.push({ year: y, month: m }); return out.filter((item) => monthKey(item.year, item.month) <= '2027-06'); })();

function Preview({ slip, status, onClose }: { slip: Slip; status: string; onClose: () => void }) {
  const [printing, setPrinting] = useState(false);
  usePayslipPrint(printing, `Payslip ${MONTHS[slip.month - 1]} ${slip.year} ${slip.code}`, () => setPrinting(false));
  const company = COMPANY[slip.company] || { name: slip.company, address: '' };
  const period = payPeriod(slip.year, slip.month);
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6 print:hidden" onClick={onClose}>
    {printing && createPortal(<PayslipDocument slip={slip} />, document.body)}
    <div role="dialog" aria-label="Payslip" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">{slip.name} <span className="text-xs font-normal text-slate-400">· {MONTHS[slip.month - 1]} {slip.year}{status === 'draft' ? ' · draft, not locked' : ''}</span></h3>
        <button type="button" onClick={() => setPrinting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Printer className="h-4 w-4" />Print</button>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 overflow-y-auto p-4">
        <article className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-3"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" className="h-12 w-12 shrink-0 object-contain" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#14233b]">{company.name}</p><p className="text-xs text-slate-500">{company.address}</p></div></div>
          <h2 className="text-base font-semibold text-[#3b5da8]">{slip.name} ({slip.code})</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3"><Field label="Department" value={slip.department} /><Field label="Designation" value={slip.designation} /><Field label="Company Name" value={company.name} /><Field label="Pay Period" value={`${longDate(period.from)} to ${longDate(period.to)}`} /></div>
          <div className="mt-4 rounded-xl border border-slate-200 px-4 py-2">
            <Row label="BASIC PAY" value={slip.basic} />
            {slip.allowances.map((item) => <Row key={item.name} label={item.name.toUpperCase()} value={item.amount} />)}
            {slip.ot > 0 && <Row label="OVERTIME" value={slip.ot} />}{slip.restPh > 0 && <Row label="REST DAY / PUBLIC HOLIDAY" value={slip.restPh} />}
            <Row label="EMPLOYEE EPF" value={slip.kwspEmployee} minus /><Row label="EMPLOYEE EIS" value={slip.eisEmployee} minus /><Row label="EMPLOYEE SOCSO" value={slip.socsoEmployee} minus />
            {slip.skbbk > 0 && <Row label="SKBBK" value={slip.skbbk} minus />}{slip.pcb > 0 && <Row label="MTD/PCB" value={slip.pcb} minus />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-4">
            <Pair label="Gross Wages" value={slip.gross} /><Pair label="Nett Wages" value={slip.net} />
            <Pair label="Employer EPF" value={slip.kwspEmployer} /><Pair label="EMPLOYEE EPF" value={slip.kwspEmployee} />
            <Pair label="Employer EIS" value={slip.eisEmployer} /><Pair label="EMPLOYEE EIS" value={slip.eisEmployee} />
            <Pair label="Employer SOCSO" value={slip.socsoEmployer} /><Pair label="EMPLOYEE SOCSO" value={slip.socsoEmployee} />
            <Pair label="Zakat" value={0} /><Pair label="MTD/PCB" value={slip.pcb} />
            <Pair label="Pay so far this year" value={slip.ytdWages} /><Pair label="PCB so far this year" value={slip.ytdPcb} />
          </div>
          <p className="mt-3 text-sm text-slate-600">Bank: {slip.bankName || '—'}{slip.bankAccountEnd ? ` · •••• ${slip.bankAccountEnd}` : ''}</p>
        </article>
      </div>
    </div>
  </div>;
}

export function HRPayslips({ onError }: { onError: (message: string) => void }) {
  const [pick, setPick] = useState('2026-10');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [place, setPlace] = useState('');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState(false);
  const [view, setView] = useState<{ slip: Slip; status: string } | null>(null);
  const [opening, setOpening] = useState('');
  const [year, month] = pick.split('-').map(Number);
  useEffect(() => {
    let live = true; setLines(null);
    officeFetch(`${API}&action=payslip_list&year=${year}&month=${month}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) setLines(result.staff); }).catch((cause: Error) => { if (live) { setLines([]); onError(cause.message); } });
    return () => { live = false; };
  }, [pick]);
  const shown = useMemo(() => (lines || []).filter((line) => (!place || line.company === place) && (!query || `${line.name} ${line.code}`.toLowerCase().includes(query.toLowerCase()))), [lines, place, query]);
  const open = async (line: Line) => {
    setOpening(line.id);
    try {
      const response = await officeFetch(`${API}&action=payslip_view&employeeId=${line.id}&year=${year}&month=${month}`); const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Unable to open the payslip.');
      setView({ slip: result.payslip, status: result.status });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to open the payslip.'); }
    setOpening('');
  };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Payslips</h3><p className="text-sm text-slate-500">Everyone paid in a payroll month. Choose the payroll month, then Preview a payslip as the staff member sees it. January to October 2026 are what Infotech paid.</p></div>
      <select aria-label="Payroll month" value={pick} onChange={(event) => setPick(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{OPTIONS.map((item) => { const p = payPeriod(item.year, item.month); return <option key={monthKey(item.year, item.month)} value={monthKey(item.year, item.month)}>{`Payroll ${MONTHS[item.month - 1]} ${item.year} (${longDate(p.from).replace(/ \d{4}$/, '')} to ${longDate(p.to).replace(/ \d{4}$/, '')})`}</option>; })}</select>
      <select aria-label="Company" value={place} onChange={(event) => setPlace(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <input aria-label="Search staff" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" className="h-10 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
    </div>
    {!lines ? <p className="text-sm text-slate-500">Reading the payslips…</p> : !shown.length ? <p className="text-sm text-slate-500">No payslips for this payroll month{query || place ? ' with these filters' : ''}.</p> : <>
      <p className="text-sm text-slate-500">{shown.length} staff{lines.some((line) => line.status === 'draft') ? ' · a draft is a month not locked yet' : ''}</p>
      <div className="overflow-x-auto"><table className="no-stack w-full min-w-[620px] text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Designation</th><th className="pr-3">Status</th><th className="pr-3 text-right">Net pay</th><th /></tr></thead>
        <tbody>{shown.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="py-2 pr-3"><span className="font-semibold">{line.name}</span><span className="block text-xs text-slate-400">{line.code} · {line.company}</span></td><td className="pr-3 text-xs text-slate-500">{line.designation}</td>
          <td className="pr-3">{line.status === 'locked' ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Locked</span> : <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Draft</span>}</td>
          <td className="pr-3 text-right tabular-nums">{show ? fmt(line.net) : '••••'}</td>
          <td className="text-right"><button type="button" disabled={opening === line.id} onClick={() => void open(line)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50">{opening === line.id ? 'Opening…' : 'Preview'}</button></td></tr>)}</tbody></table></div>
    </>}
    {view && <Preview slip={view.slip} status={view.status} onClose={() => setView(null)} />}
  </section>;
}
