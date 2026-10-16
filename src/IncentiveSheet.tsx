import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { approvedTotal, claimTotal, dmy, IncentiveEntry, IncentiveStatus } from './lib/incentiveCodes';

// The memo's STAFF INCENTIVES sheet, shared by the staff page (View form) and the Clinical
// Admin page (Print / Save PDF), with the print helpers both use.
export type SheetClaim = { month: string; branch: string; staffName: string; entries: IncentiveEntry[]; status: IncentiveStatus; approvedBy: string };

// Prints (or saves as PDF) whatever is rendered into the .cv-print portal while `active` is set.
// The browser names a saved PDF after the page title, so the title is swapped while printing.
export function usePrintSheet(active: boolean, title: string, onDone: () => void) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('cv-printing');
    const previous = document.title;
    document.title = title.replace(/[\\/:*?"<>|]/g, '');
    const done = () => { document.body.classList.remove('cv-printing'); document.title = previous; onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('cv-printing'); document.title = previous; };
  }, [active]);
}

export const PdfHint = () => <p className="fixed bottom-5 left-1/2 z-[95] -translate-x-1/2 rounded-xl bg-[#0b3d59] px-4 py-3 text-sm text-white shadow-lg print:hidden">In the print window, set <strong>Destination</strong> to <strong>Save as PDF</strong>, then press Save.</p>;

// Shows the sheet on screen at A4 landscape proportions, shrunk to fit narrow screens such as phones.
export function SheetPreview({ claim }: { claim: SheetClaim }) {
  const frame = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const fit = () => {
      if (!frame.current || !page.current) return;
      const next = Math.min(1, frame.current.clientWidth / page.current.offsetWidth);
      setScale(next); setHeight(page.current.offsetHeight * next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [claim]);
  return <div ref={frame} className="w-full overflow-hidden" style={{ height }}>
    <div ref={page} className="min-h-[210mm] w-[297mm] origin-top-left bg-white p-[10mm] font-[Arial,Helvetica,sans-serif] text-black shadow-[0_8px_30px_rgba(20,35,59,0.18)]" style={{ transform: `scale(${scale})` }}><ClaimSheet claim={claim} /></div>
  </div>;
}

// The memo's STAFF INCENTIVES sheet, filled in.
export function ClaimSheet({ claim }: { claim: SheetClaim }) {
  const cell = 'border border-black px-[1.5mm] py-[0.8mm]';
  return <section className="text-[9pt]">
    <div className="flex items-center gap-[4mm]"><img src="/forms/ara-logo.jpg" alt="" className="h-[16mm] w-[16mm] object-contain" /><div><p className="text-[13pt] font-bold">KLINIK ARA 24 JAM</p><p className="text-[13pt] font-bold">STAFF INCENTIVES</p></div></div>
    <div className="mt-[3mm] flex gap-[10mm] font-bold"><span>Staff name: <span className="font-normal">{claim.staffName}</span></span><span>Month: <span className="font-normal">{claim.month.slice(5, 7)}</span></span><span>Year: <span className="font-normal">{claim.month.slice(0, 4)}</span></span><span>Branch: <span className="font-normal">{claim.branch}</span></span></div>
    <table className="mt-[3mm] w-full border-collapse"><thead><tr className="font-bold"><th className={cell}>Date</th><th className={cell}>Patient name/Details</th><th className={cell}>Patient clinic ID</th><th className={cell}>Outstanding payment</th><th className={cell}>Code Incentive</th><th className={cell}>RM</th><th className={cell}>Approved ( / )</th></tr></thead>
      <tbody>{claim.entries.map((entry) => <tr key={entry.id}><td className={`${cell} whitespace-nowrap`}>{dmy(entry.date)}</td><td className={cell}>{entry.patient}</td><td className={cell}>{entry.clinicId}</td><td className={cell}>{entry.outstanding}</td><td className={`${cell} text-center`}>{entry.code}</td><td className={`${cell} text-right`}>{entry.rm.toFixed(2)}</td><td className={`${cell} text-center`}>{entry.review === 'rejected' ? '✗' : entry.review === 'approved' ? '✓' : ''}</td></tr>)}</tbody>
      <tfoot><tr className="font-bold"><td colSpan={5} className={`${cell} text-right`}>Total Claimed Incentives</td><td className={`${cell} text-right`}>{claimTotal(claim.entries).toFixed(2)}</td><td className={cell} /></tr>
        {claim.entries.some((entry) => entry.review) && <tr className="font-bold"><td colSpan={5} className={`${cell} text-right`}>Total Approved Incentives</td><td className={`${cell} text-right`}>{approvedTotal(claim.entries).toFixed(2)}</td><td className={cell} /></tr>}</tfoot>
    </table>
    <div className="mt-[4mm] flex gap-[40mm] font-bold"><span>Prepared by: <span className="font-normal">{claim.staffName}</span></span><span>Approved by: <span className="font-normal">{claim.status === 'approved' ? claim.approvedBy : ''}</span></span></div>
  </section>;
}
