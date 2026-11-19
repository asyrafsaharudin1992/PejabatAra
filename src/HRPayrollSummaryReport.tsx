import { useEffect, useMemo, useState } from 'react';
import { bulk, bulkBlobs } from './lib/bulkReports';
import { Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintMenu } from './PrintMenu';
import { printPdfBlob } from './lib/savePdf';
import { payrollSummaryPdf } from './lib/payrollSummaryPdf';
import { pdfPageImages } from './lib/pdfPages';
import { calculatePayslip, NO_INPUTS, type PayInputs, type PayStaff, type PayYtd } from './lib/payrollRun';

// Reports > Payroll Summary: the month's pay for everyone in Infotech's layout (Monthly Payroll Summary Detailed), one page for each company, shown on the page.
// Choose a payroll period or a month at the top; Print and Download (PDF or CSV) are beside it. The amounts stay hidden until Show amounts is pressed.
type Member = PayStaff & { id: string; company: string; employeeCode: string; fullName: string; ytd: PayYtd; payslip?: { status: string; inputs?: PayInputs; result?: unknown } | null };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function HRPayrollSummaryReport({ onError }: { onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [staff, setStaff] = useState<Member[] | null>(null);
  const [show, setShow] = useState(bulk.active);
  const [pages, setPages] = useState<string[] | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const year = period ? Number(period.to.slice(0, 4)) : 0, month = period ? Number(period.to.slice(5, 7)) : 0;
  useEffect(() => {
    if (!period) return;
    let live = true; setStaff(null);
    officeFetch(`/api/status?resource=hr&action=payroll_month&year=${year}&month=${month}`).then((response) => response.json()).then((data) => { if (data.error) throw new Error(data.error); if (live) setStaff(data.staff); }).catch((cause: Error) => { if (live) { setStaff([]); onError(cause.message); } });
    return () => { live = false; };
  }, [period?.to]);
  // A locked month shows what was saved (for the months paid in Infotech, what Infotech paid); a month not locked yet is worked out from its saved draft.
  const rows = useMemo(() => (staff || []).filter((member) => member.payslip || member.company).map((member) => {
    const locked = member.payslip?.status === 'locked' && member.payslip.result;
    const inputs = member.payslip?.inputs || NO_INPUTS;
    const out = locked ? { ...calculatePayslip(member, NO_INPUTS, member.ytd, year, month), ...(member.payslip!.result as object) } : calculatePayslip(member, { ...NO_INPUTS, ...inputs }, member.ytd, year, month);
    return { member, inputs: { ...NO_INPUTS, ...inputs }, out: out as ReturnType<typeof calculatePayslip> };
  }), [staff]);
  useEffect(() => {
    setPages(null); setBlob(null);
    if (!show || !rows.length) return;
    let live = true, urls: string[] = [];
    payrollSummaryPdf(rows.map(({ member, inputs, out }) => ({ code: member.employeeCode, name: member.fullName, company: member.company, basicSalary: member.basicSalary, inputs, out: out as any })), year, month)
      .then(async (made) => { const images = await pdfPageImages(made); urls = images; if (live) { setBlob(made); setPages(images); if (bulk.active) bulkBlobs.set('payroll-summary', made); } })
      .catch((cause: Error) => { if (live) onError(cause.message); });
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [show, rows]);
  const name = `Payroll Summary ${MONTHS[month - 1] || ''} ${year}`;
  const csv = () => {
    const head = ['Code', 'Name', 'Company', 'Basic', 'OT', 'Rest/PH', 'Allowances', 'Gross', 'KWSP employee', 'KWSP employer', 'PERKESO employee', 'PERKESO employer', 'EIS employee', 'EIS employer', 'SKBBK', 'HRDF', 'PCB', 'Total deductions', 'Net'];
    const lines = rows.map(({ member, out }) => [member.employeeCode, member.fullName, member.company, out.basic, out.ot, out.restPh, out.allowances.reduce((sum, item) => sum + item.amount, 0), out.gross, out.kwspEmployee, out.kwspEmployer, out.socsoEmployee, out.socsoEmployer, out.eisEmployee, out.eisEmployer, out.skbbk, out.hrdf, out.pcb, out.deductions, out.net]);
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n')], `PayrollSummary_${year}-${String(month).padStart(2, '0')}.csv`, 'text/csv');
  };
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Payroll Summary</h2><p className="text-sm text-slate-500">Everyone's pay for the payroll period or month, KJ and SK on their own pages. Press Show amounts to see it.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide amounts' : 'Show amounts'}</button>
      <PrintMenu onPrint={() => blob && printPdfBlob(blob)} onPdf={() => blob && downloadBlob([blob], `${name}.pdf`, 'application/pdf')} onCsv={csv} disabled={!show || !blob} onError={onError} />
    </section>
    {!staff ? <p className="text-sm text-slate-500">Loading…</p> : !rows.length ? <p className={`${card} text-sm text-slate-500`}>No payslips for this month.</p> : !show ? <p className={`${card} text-sm text-slate-500`}>{rows.length} staff for {period?.label}. Press Show amounts to see the report.</p> : !pages ? <p className="text-sm text-slate-500">Building the report…</p> :
      <div className="space-y-4 print:hidden">{pages.map((src, index) => <img key={src} src={src} alt={`${name}, page ${index + 1}`} className="mx-auto w-full max-w-[1300px] rounded-lg bg-white shadow" />)}</div>}
  </div>;
}
