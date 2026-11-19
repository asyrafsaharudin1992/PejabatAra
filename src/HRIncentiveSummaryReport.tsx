import { useEffect, useState } from 'react';
import { bulk, bulkBlobs } from './lib/bulkReports';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintMenu } from './PrintMenu';
import { printPdfBlob } from './lib/savePdf';
import { pdfPageImages } from './lib/pdfPages';
import { incentiveSummaryCsv, incentiveSummaryPdf, monthShort, type IncentiveSummaryRow } from './lib/incentiveSummaryPdf';

// Reports > Incentive Summary Sheet: the month's incentive allowance sheet for each branch, shown on the page with the ARA logo. Choose the month at the top; Print and Download
// (PDF or CSV) are beside it. The Bonus, Outstanding payment and Other deduction typed in Incentive > Summary are included. Nothing is edited here.
export function HRIncentiveSummaryReport({ onError }: { onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [rows, setRows] = useState<IncentiveSummaryRow[] | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pages, setPages] = useState<string[] | null>(null);
  const month = period ? (period.to.slice(0, 7) < '2026-10' ? '2026-10' : period.to.slice(0, 7)) : '';
  useEffect(() => {
    if (!month) return;
    let live = true; setRows(null); setBlob(null); setPages(null);
    officeFetch(`/api/status?resource=hr&action=incentive_summary&month=${month}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) setRows(result.rows); }).catch((cause: Error) => { if (live) { setRows([]); onError(cause.message); } });
    return () => { live = false; };
  }, [month]);
  useEffect(() => {
    if (!rows?.length) return;
    let live = true, urls: string[] = [];
    incentiveSummaryPdf(rows, month).then(async (made) => { const images = await pdfPageImages(made); urls = images; if (live) { setBlob(made); setPages(images); if (bulk.active) bulkBlobs.set('incentive-summary', made); } }).catch((cause: Error) => { if (live) onError(cause.message); });
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [rows]);
  const name = `Incentive Allowance ${month ? monthShort(month) : ''}`;
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Incentive Summary Sheet</h2><p className="text-sm text-slate-500">One sheet for each branch: the approved claims and AraCare claims, SOTM, bonus, outstanding payment, deductions and the nett payment.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <PrintMenu onPrint={() => blob && printPdfBlob(blob)} onPdf={() => blob && downloadBlob([blob], `${name}.pdf`, 'application/pdf')} onCsv={() => rows && downloadBlob([incentiveSummaryCsv(rows, month)], `${name}.csv`, 'text/csv')} disabled={!blob} onError={onError} />
    </section>
    {rows === null ? <p className="text-sm text-slate-500">Loading…</p> : !rows.length ? <p className={`${card} text-sm text-slate-500`}>No incentive claims for {month ? monthShort(month) : 'this month'}. Incentive claims start from October 2026.</p> : !pages ? <p className="text-sm text-slate-500">Building the sheet…</p> :
      <div className="space-y-4 print:hidden">{pages.map((src, index) => <img key={src} src={src} alt={`${name}, page ${index + 1}`} className="mx-auto w-full max-w-[1300px] rounded-lg bg-white shadow" />)}</div>}
  </div>;
}
