import { useEffect, useMemo, useState } from 'react';
import { bulk } from './lib/bulkReports';
import { createPortal } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintMenu } from './PrintMenu';
import { ReportPreviewFrame } from './ReportPreviewFrame';
import { HRPayslipSheet, useSlipPrint, type HRSlip } from './HRPayslipSheet';
import { MONTHS } from './MyPayslips';

// Reports > Payslips: every payslip of a payroll period or month, laid out as the A4 payslip (Infotech's layout), one after the other on the page like the other reports.
// The filters are in one row with Print and Download beside them. Print prints every payslip shown, one to a page; Download saves them as one PDF.
type Line = { id: string; code: string; name: string; company: string };
type Entry = { line: Line; slip: HRSlip; status: string };
const API = '/api/status?resource=hr';
const field = 'mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';

export function HRPayslipsReport({ onError }: { onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [company, setCompany] = useState<string>(bulk.active ? bulk.company : '');
  const [staffId, setStaffId] = useState('');
  const [reveal, setReveal] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [printing, setPrinting] = useState(false);
  const year = period ? Number(period.to.slice(0, 4)) : 0, month = period ? Number(period.to.slice(5, 7)) : 0;
  useEffect(() => {
    if (!period) return;
    let live = true; setEntries(null); setStaffId('');
    (async () => {
      const list = await (await officeFetch(`${API}&action=payslip_list&year=${year}&month=${month}`)).json();
      if (list.error) throw new Error(list.error);
      const lines: Line[] = list.staff || [];
      const out: Entry[] = [];
      for (let at = 0; at < lines.length; at += 6) {
        const batch = await Promise.all(lines.slice(at, at + 6).map(async (line) => { const result = await (await officeFetch(`${API}&action=payslip_view&employeeId=${line.id}&year=${year}&month=${month}`)).json(); return result.error ? null : { line, slip: result.payslip as HRSlip, status: result.status as string }; }));
        out.push(...batch.filter((item): item is Entry => Boolean(item)));
        if (!live) return;
      }
      if (live) setEntries(out);
    })().catch((cause: Error) => { if (live) { setEntries([]); onError(cause.message); } });
    return () => { live = false; };
  }, [period?.to]);
  const shown = useMemo(() => (entries || []).filter((entry) => (!company || entry.line.company === company) && (!staffId || entry.line.id === staffId)), [entries, company, staffId]);
  const people = (entries || []).filter((entry) => !company || entry.line.company === company);
  useSlipPrint(printing, `Payslips ${MONTHS[month - 1] || ''} ${year}`, () => setPrinting(false));
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Payslips</h2><p className="text-sm text-slate-500">Every payslip of the payroll period or month, as the A4 payslip. January to October 2026 are what Infotech paid.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={company} onChange={(event) => { setCompany(event.target.value); setStaffId(''); }} className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Staff<select aria-label="Staff" value={staffId} onChange={(event) => setStaffId(event.target.value)} className={`${field} max-w-[220px]`}><option value="">All staff</option>{people.map((entry) => <option key={entry.line.id} value={entry.line.id}>{entry.line.name}</option>)}</select></label>
      <button type="button" onClick={() => setReveal(!reveal)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{reveal ? 'Hide IC, tax and bank numbers' : 'Show IC, tax and bank numbers'}</button>
      <PrintMenu onPrint={() => setPrinting(true)} pdf={{ scope: '.payslips-pages', filename: `Payslips ${MONTHS[month - 1] || ''} ${year}` }} disabled={!shown.length} onError={onError} />
    </section>
    {!entries ? <p className="text-sm text-slate-500">Loading the payslips…</p> : !shown.length ? <p className={`${card} text-sm text-slate-500`}>No payslips for this period.</p> :
      <div className="payslips-pages space-y-4 print:hidden">{shown.map((entry) => <div key={entry.line.id} data-pdf-name={entry.line.name}><ReportPreviewFrame portrait><HRPayslipSheet slip={entry.slip} reveal={reveal} /></ReportPreviewFrame></div>)}</div>}
    {printing && createPortal(<div className="hrslip-print">{shown.map((entry) => <div key={entry.line.id} style={{ breakAfter: 'page' }}><HRPayslipSheet slip={entry.slip} reveal={reveal} /></div>)}</div>, document.body)}
  </div>;
}
