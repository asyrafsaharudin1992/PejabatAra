import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Mail, Printer, X } from 'lucide-react';
import { card } from './AssessmentStaff';
import { PeriodPicker } from './PeriodPicker';
import { officeFetch } from './lib/officeApi';
import { infotechRemark, payPeriod } from './lib/payrollRun';
import { fmt, longDate, MONTHS } from './MyPayslips';
import { PrintMenu } from './PrintMenu';
import { HRPayslipSheet, useSlipPrint, type HRSlip } from './HRPayslipSheet';
import { ReportPreviewFrame } from './ReportPreviewFrame';
import { InfotechSlip, infotechBytes, printInfotech } from './InfotechSlip';
import { downloadBlob } from './lib/downloadBlob';
import { HRPayslipEmail } from './HRPayslipEmail';

// Payroll > Payslips: the payslips of any past payroll month for everyone paid in it (HR and Finance), with a Preview of each as the staff member sees it.
// October 2026 and before are what Infotech paid; November 2026 on is what was run in AraOffice. Amounts in the list stay hidden until Show amounts is pressed.
const API = '/api/status?resource=hr';
type Line = { id: string; code: string; name: string; company: string; designation: string; status: 'draft' | 'locked'; net: number };
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
// Payroll months from January 2026 to a few months ahead.
const OPTIONS = (() => { const out: { year: number; month: number }[] = []; for (let y = 2026; y <= 2027; y++) for (let m = 1; m <= 12; m++) out.push({ year: y, month: m }); return out.filter((item) => monthKey(item.year, item.month) <= '2027-06'); })();

// The payslip in the Infotech layout (A4), with a Print button. The IC, tax, SOCSO, EPF and bank numbers stay hidden until HR chooses to show them (and print as shown).
function Preview({ slip, status, infotech, onClose }: { slip: HRSlip; status: string; infotech: string; onClose: () => void }) {
  // January to October 2026 have two versions: the AraOffice layout (what the staff member sees) and the original Infotech payslip.
  const [version, setVersion] = useState<'infotech' | 'araoffice'>('araoffice');
  const original = version === 'infotech';
  const [printing, setPrinting] = useState(false);
  const [reveal, setReveal] = useState(false);
  useSlipPrint(printing, `Payslip ${MONTHS[slip.month - 1]} ${slip.year} ${slip.code}`, () => setPrinting(false));
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6 print:hidden" onClick={onClose}>
    {printing && createPortal(<div className="hrslip-print"><HRPayslipSheet slip={slip} reveal={reveal} /></div>, document.body)}
    <div role="dialog" aria-label="Payslip" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[900px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">{slip.name} <span className="text-xs font-normal text-slate-400">· {MONTHS[slip.month - 1]} {slip.year}{status === 'draft' ? ' · draft, not locked' : ''}</span></h3>
        {infotech && <div role="group" aria-label="Payslip version" className="flex rounded-xl border border-slate-200 p-0.5">{(['araoffice', 'infotech'] as const).map((item) => <button key={item} type="button" aria-pressed={version === item} onClick={() => setVersion(item)} className={`h-8 rounded-lg px-3 text-sm font-semibold ${version === item ? 'bg-[#0b587b] text-white' : 'text-slate-600'}`}>{item === 'infotech' ? 'Infotech' : 'AraOffice'}</button>)}</div>}
        {!original && <button type="button" onClick={() => setReveal(!reveal)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{reveal ? 'Hide IC, tax and bank numbers' : 'Show IC, tax and bank numbers'}</button>}
        {original ? <PrintMenu onPrint={() => void printInfotech(infotech)} onPdf={() => downloadBlob([infotechBytes(infotech)], `Payslip ${MONTHS[slip.month - 1]} ${slip.year} ${slip.code} Infotech.pdf`, 'application/pdf')} className="h-9 px-3" />
          : <PrintMenu onPrint={() => setPrinting(true)} pdf={{ scope: '[aria-label="Payslip"]', filename: `Payslip ${MONTHS[slip.month - 1]} ${slip.year} ${slip.code}` }} className="h-9 px-3" />}
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">{original ? <InfotechSlip pdf={infotech} remark={infotechRemark(slip.year, slip.month, slip.ot > 0 || slip.restPh > 0)} /> : <ReportPreviewFrame portrait><HRPayslipSheet slip={slip} reveal={reveal} /></ReportPreviewFrame>}</div>
    </div>
  </div>;
}

export function HRPayslips({ onError }: { onError: (message: string) => void }) {
  const [pick, setPick] = useState('2026-10');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [place, setPlace] = useState('');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [view, setView] = useState<{ slip: HRSlip; status: string; infotech: string } | null>(null);
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
      // The original Infotech payslip, when there is one for this month; without it only the AraOffice layout is shown.
      const original = await officeFetch(`${API}&action=payslip_infotech&employeeId=${line.id}&year=${year}&month=${month}`).then((reply) => reply.json()).catch(() => ({}));
      setView({ slip: result.payslip, status: result.status, infotech: original.pdf || '' });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to open the payslip.'); }
    setOpening('');
  };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto"><h3 className="text-lg font-semibold">Payslips</h3><p className="text-sm text-slate-500">Everyone paid in a payroll month. Choose the payroll month, then Preview a payslip as the staff member sees it. January to October 2026 are what Infotech paid.</p></div>
      <PeriodPicker onChange={(period) => setPick(period.to.slice(0, 7))} />
      <select aria-label="Company" value={place} onChange={(event) => setPlace(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <input aria-label="Search staff" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" className="h-10 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      <button type="button" aria-pressed={emailing} onClick={() => setEmailing(!emailing)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-semibold text-white"><Mail className="h-4 w-4" />Email payslips</button>
    </div>
    {emailing && <HRPayslipEmail key={pick} year={year} month={month} lines={shown} />}
    {!lines ? <p className="text-sm text-slate-500">Reading the payslips…</p> : !shown.length ? <p className="text-sm text-slate-500">No payslips for this payroll month{query || place ? ' with these filters' : ''}.</p> : <>
      <p className="text-sm text-slate-500">{shown.length} staff{lines.some((line) => line.status === 'draft') ? ' · a draft is a month not locked yet' : ''}</p>
      <div className="overflow-x-auto"><table className="no-stack w-full min-w-[620px] text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Designation</th><th className="pr-3">Status</th><th className="pr-3 text-right">Net pay</th><th /></tr></thead>
        <tbody>{shown.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="py-2 pr-3"><span className="font-semibold">{line.name}</span><span className="block text-xs text-slate-400">{line.code} · {line.company}</span></td><td className="pr-3 text-xs text-slate-500">{line.designation}</td>
          <td className="pr-3">{line.status === 'locked' ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Locked</span> : <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Draft</span>}</td>
          <td className="pr-3 text-right tabular-nums">{show ? fmt(line.net) : '••••'}</td>
          <td className="text-right"><button type="button" disabled={opening === line.id} onClick={() => void open(line)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50">{opening === line.id ? 'Opening…' : 'Preview'}</button></td></tr>)}</tbody></table></div>
    </>}
    {view && <Preview slip={view.slip} status={view.status} infotech={view.infotech} onClose={() => setView(null)} />}
  </section>;
}
