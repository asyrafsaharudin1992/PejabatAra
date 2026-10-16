import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import { Voucher } from "./lib/usePrintForms";
import { supabase } from "./lib/supabase";

// The Cash Voucher sheet, laid out like the clinic's Excel voucher (front and back, A4 landscape).
// Staff type the CV number and date; everything else is filled in by pen after printing.
export const defaultVouchers: Voucher[] = [{
  id: "kj",
  label: "KJ",
  company: ["HSO HEALTHCARE SDN BHD", "D-13-GA TAMAN PRIMA SAUJANA 2/F", "TAMAN PRIMA SAUJANA, 43000 KAJANG", "Phone: 019 9120892  e-mail: admin@hsohealthcare.com"],
  sections: [
    { title: "LOCUM 1ST DOCTOR", lines: ["Day Shift (8am - 8pm)", "Payment:", "1. 8am-6pm (RM 45 X 10hrs)", "2. 6pm-8pm (RM 50 X 2hrs)"] },
    { title: "LOCUM 1ST DOCTOR", lines: ["Night Shift (8pm-8am)", "Payment:", "1. 8pm-11pm (RM 50 X 3hrs)", "2. 11pm-8am (Flat Rate)", "      a. 0-10 patients : RM 300", "      b. 11-15 patients : RM 350", "      c. More than 15 patients : RM 400"] },
    { title: "LOCUM 2ND DOCTOR", lines: ["Night Shift (6pm-10pm)", "Payment:", "1. 6pm - 10pm (RM 45/hr with incentives)", "2. 8pm - 10pm (RM 60/hr without incentives)"] },
    { title: "LOCUM CA", lines: ["Flexible Working Hours Rate", "Payment:", "Normal Rate : RM 12 X __________", "Public Holiday Rate : RM 16 X __________"] },
  ],
}];

type LastPrinted = Record<string, { cvNo: string; date: string; at: string }>;

async function cvRequest(body?: { voucherId: string; cvNo: string; date: string }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Please sign in again.");
  const response = await fetch("/api/ca-state?scope=cv", {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${session.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to load the last CV numbers.");
  return (result.last || {}) as LastPrinted;
}

// The last CV number each branch printed, read once each time Print Forms opens (no polling)
// and updated when staff confirm a voucher printed.
export function useCvNumbers() {
  const [last, setLast] = useState<LastPrinted | null>(null);
  useEffect(() => { let live = true; cvRequest().then((result) => { if (live) setLast(result); }).catch(() => { if (live) setLast({}); }); return () => { live = false; }; }, []);
  const record = useCallback(async (voucherId: string, cvNo: string, date: string) => { setLast(await cvRequest({ voucherId, cvNo, date })); }, []);
  return { last, record };
}

// CV3898 -> CV3899, keeping the prefix and any leading zeros.
const nextCv = (cvNo: string) => {
  const match = cvNo.match(/^(.*?)(\d+)$/);
  return match ? `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}` : "";
};

const dmy = (iso: string) => iso ? iso.split("-").reverse().join("/") : "";

// Sections are edited as text: blocks separated by a blank line, the first line "TITLE | first detail".
export const sectionsToText = (sections: Voucher["sections"]) => sections.map((section) => [`${section.title} | ${section.lines[0] || ""}`, ...section.lines.slice(1)].join("\n")).join("\n\n");
export const textToSections = (text: string) => text.split(/\n\s*\n/).map((block) => block.split("\n").filter((line) => line.trim())).filter((lines) => lines.length).map(([first, ...rest]) => {
  const [title, detail = ""] = first.split("|");
  return { title: title.trim(), lines: [detail.trim(), ...rest.map((line) => line.replace(/\s+$/, ""))] };
});

export function VoucherCard({ voucher, canEdit, onEdit, onCopy, onDelete, last, onPrinted }: { key?: string; voucher: Voucher; last?: { cvNo: string; date: string } | null; onPrinted: (cvNo: string, date: string) => Promise<void>; canEdit: boolean; onEdit: () => void; onCopy: () => void; onDelete?: () => void }) {
  const [cvNo, setCvNo] = useState("");
  // Left blank unless staff pick a date; a blank date prints as an empty line to fill in by pen.
  const [date, setDate] = useState('');
  const [printing, setPrinting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState("");
  // Suggest the number after the last one printed, until staff type their own.
  const [typed, setTyped] = useState(false);
  useEffect(() => { if (!typed && last?.cvNo) setCvNo(nextCv(last.cvNo)); }, [last?.cvNo, typed]);
  const confirm = async (printed: boolean) => {
    if (!printed) { setConfirming(false); return; }
    setRecording(true); setProblem("");
    try { await onPrinted(cvNo.trim(), date); setTyped(false); setConfirming(false); } catch (cause) { setProblem(cause instanceof Error ? cause.message : "The CV number could not be saved."); } finally { setRecording(false); }
  };
  const field = "mt-1 w-full rounded-lg bg-slate-50 px-3 py-2 text-sm font-normal text-[#14233b] outline-none focus:bg-white focus:ring-2 focus:ring-[#8cdbf7]";

  useEffect(() => {
    if (!printing) return;
    // Only the voucher is shown while printing; the rest of the page is hidden by the print styles.
    document.body.classList.add("cv-printing");
    // Browsers do not say whether the page actually printed, so staff confirm it afterwards.
    const done = () => { document.body.classList.remove("cv-printing"); setPrinting(false); setConfirming(true); };
    window.addEventListener("afterprint", done, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(timer); window.removeEventListener("afterprint", done); document.body.classList.remove("cv-printing"); };
  }, [printing]);

  return <article className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3"><img src="/forms/ara-logo.jpg" alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-snug text-[#14233b]">Cash Voucher ({voucher.label})</p><p className="mt-0.5 text-[11px] text-slate-500">Front & back · A4 landscape</p></div>{canEdit && <div className="-mr-2 -mt-1 flex shrink-0"><button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]" title="Edit voucher" aria-label={`Edit Cash Voucher ${voucher.label}`}><Pencil className="h-3.5 w-3.5" /></button><button onClick={onCopy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]" title="Copy for another branch" aria-label={`Copy Cash Voucher ${voucher.label}`}><Copy className="h-3.5 w-3.5" /></button>{onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete voucher" aria-label={`Delete Cash Voucher ${voucher.label}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>}</div>
    <div className="grid grid-cols-2 gap-2"><label className="text-[11px] font-semibold text-slate-600">CV No<input value={cvNo} onChange={(event) => { setTyped(true); setCvNo(event.target.value.toUpperCase()); }} placeholder="e.g. CV3899" className={field} /></label><label className="text-[11px] font-semibold text-slate-600"><span className="flex items-center justify-between">Date <span className="font-normal text-slate-400">{date ? <button type="button" onClick={() => setDate("")} className="text-[#0b587b] hover:underline">Clear</button> : "optional"}</span></span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label></div>
    <p className="text-[11px] text-slate-500">{last === undefined ? "Loading last CV number…" : last ? <>Last printed: <strong className="text-[#14233b]">{last.cvNo}</strong>{last.date ? ` · ${dmy(last.date)}` : ""}</> : "No CV number recorded yet."}</p>
    {confirming ? <div className="mt-auto rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Did {cvNo.trim()} print successfully?</p><div className="mt-2 flex gap-2"><button onClick={() => void confirm(true)} disabled={recording} className="flex-1 rounded-lg bg-[#0b587b] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{recording ? "Saving…" : "Yes, printed"}</button><button onClick={() => void confirm(false)} disabled={recording} className="flex-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">No</button></div>{problem && <p className="mt-2 text-xs text-rose-700">{problem}</p>}</div>
    : <button onClick={() => setPrinting(true)} disabled={!cvNo.trim() || printing} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b587b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-50"><Printer className="h-3.5 w-3.5" />{cvNo.trim() ? "Print" : "Type the CV No to print"}</button>}
    {printing && createPortal(<div className="cv-print"><style>{"@page{size:A4 landscape;margin:8mm}"}</style><VoucherSheet voucher={voucher} cvNo={cvNo.trim()} date={dmy(date)} /></div>, document.body)}
  </article>;
}

function VoucherSheet({ voucher, cvNo, date }: { voucher: Voucher; cvNo: string; date: string }) {
  const [name, ...address] = voucher.company;
  const cell = "border border-black px-[2mm]";
  return <>
    <section className="cv-page">
      <header className="relative pb-[3mm] text-center">
        <img src="/forms/ara-logo.jpg" alt="" className="absolute left-[30mm] top-0 h-[24mm] w-[24mm] object-contain" />
        <h1 className="text-[16pt] font-bold tracking-wide">CASH VOUCHER</h1>
        <p className="mt-[1mm] text-[11pt]">{name}</p>
        {address.map((line, index) => <p key={index} className="text-[9pt]">{line}</p>)}
      </header>
      <table className="w-full border-collapse text-[9.5pt]"><colgroup><col className="w-[20%]" /><col className="w-[34%]" /><col className="w-[16%]" /><col className="w-[30%]" /></colgroup><tbody>
        {[["Payee/Dr Name", "CV No", cvNo], ["MMC/IC No.", "Date", date], ["Bank Name", "Payment Method", ""], ["Account No.", "", null]].map(([label, right, value], index) => <tr key={index} className="h-[6.5mm]">
          <td className="pr-[2mm]">{label}</td><td className="border border-black" /><td className="pr-[3mm] text-right">{right}</td>{value === null ? <td /> : <td className="border border-black text-center text-[11pt] font-semibold">{value}</td>}
        </tr>)}
      </tbody></table>
      <table className="mt-[3mm] w-full border-collapse text-[9pt]"><colgroup><col className="w-[20%]" /><col /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup>
        <thead><tr className="h-[7mm] bg-[#d8d8d8]"><th className={cell}>NO.</th><th className={cell}>PAYMENT DETAILS</th><th className={cell}>( / )</th><th className={cell}>( RM )</th></tr></thead>
        <tbody>
          <tr className="h-[15mm]"><td className={`${cell} text-center font-bold leading-tight`}>EXPENSES<br /><span className="font-normal">(beli brg, refund etc)</span></td><td className={cell} /><td className={cell} /><td className={cell} /></tr>
          {/* Every line is its own ruled row, as on the clinic's Excel voucher, so each can be ticked and priced. */}
          {voucher.sections.map((section, sectionIndex) => section.lines.map((line, lineIndex) => <tr key={`${sectionIndex}-${lineIndex}`} className="h-[5.4mm]">
            <td className={`${cell} text-center font-bold leading-tight`}>{lineIndex === 0 ? section.title : ""}</td>
            <td className={`${cell} whitespace-pre ${lineIndex === 0 ? "font-bold" : ""}`}>{line}</td>
            <td className={cell} /><td className={cell} />
          </tr>))}
        </tbody>
      </table>
    </section>
    <section className="cv-page">
      <table className="w-full border-collapse text-[9pt]"><colgroup><col className="w-[8%]" /><col /><col className="w-[12%]" /><col className="w-[14%]" /></colgroup>
        <thead><tr className="h-[7mm] bg-[#d8d8d8]"><th className={cell}>No.</th><th className={cell}>Payment Details</th><th className={cell}>Quantity</th><th className={cell}>Amount (RM)</th></tr></thead>
        <tbody>
          <tr className="h-[6mm]"><td className={cell} /><td className={`${cell} font-bold`}>Incentives:</td><td className={cell} /><td className={cell} /></tr>
          {Array.from({ length: 13 }, (_, index) => <tr key={index} className="h-[10.5mm]"><td className={cell} /><td className={cell}><div className="flex"><span className="w-[58%]">Nama pt:</span><span>Type of incentives:</span></div></td><td className={cell} /><td className={cell} /></tr>)}
          <tr className="h-[7mm]"><td colSpan={3} className={`${cell} text-right font-bold`}>Total (RM)</td><td className={cell} /></tr>
        </tbody>
      </table>
      <table className="mt-[4mm] w-full border-collapse text-[9pt]"><tbody>
        <tr className="h-[9mm] align-top"><td className={cell}>Prepared By:</td><td className={cell}>Approved By:</td><td className={cell}>Received By:</td><td rowSpan={2} className={`${cell} w-[25%]`}>Remarks:</td></tr>
        <tr className="h-[7mm] align-top"><td className={cell}>Date:</td><td className={cell}>Date:</td><td className={cell}>Date:</td></tr>
      </tbody></table>
    </section>
  </>;
}
