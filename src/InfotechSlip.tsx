import { useEffect, useState } from 'react';
import { pdfPageImages } from './lib/pdfPages';
import { printPdfAsImages } from './lib/pdfPrint';

// The original Infotech payslip (a PDF sent as base64): shown as a page picture, which works the same on a phone and a computer.
export const infotechBytes = (pdf: string) => Uint8Array.from(atob(pdf), (char) => char.charCodeAt(0));
export async function printInfotech(pdf: string) {
  const url = URL.createObjectURL(new Blob([infotechBytes(pdf)], { type: 'application/pdf' }));
  try { await printPdfAsImages(url); } finally { URL.revokeObjectURL(url); }
}
export function InfotechSlip({ pdf, remark }: { pdf: string; remark?: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true, made: string[] = []; setPages(null); setFailed(false);
    pdfPageImages(new Blob([infotechBytes(pdf)], { type: 'application/pdf' }), 2).then((urls) => { made = urls; if (live) setPages(urls); else urls.forEach((url) => URL.revokeObjectURL(url)); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; made.forEach((url) => URL.revokeObjectURL(url)); };
  }, [pdf]);
  if (failed) return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">This browser cannot show the payslip. Use Download.</p>;
  if (!pages) return <p role="status" className="p-3 text-sm text-slate-500">Opening the payslip…</p>;
  return <div className="space-y-3">{remark && <p className="mx-auto max-w-[820px] rounded-xl bg-sky-50 p-3 text-xs text-sky-900">{remark}</p>}{pages.map((url, at) => <img key={url} src={url} alt={`Infotech payslip, page ${at + 1}`} className="mx-auto block w-full max-w-[820px] bg-white shadow" />)}</div>;
}
