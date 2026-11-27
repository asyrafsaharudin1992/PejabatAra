import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Eye, EyeOff, Lock, Printer, Share2 } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { infotechRemark } from './lib/payrollRun';
import { downloadBlob } from './lib/downloadBlob';
import { InfotechSlip, infotechBytes, printInfotech } from './InfotechSlip';
import { lockInfotechPdf } from './lib/lockInfotechPdf';
import { pagesToPdfBlob } from './lib/savePdf';
import { ReportPreviewFrame } from './ReportPreviewFrame';
import { HRPayslipSheet, useSlipPrint, type HRSlip } from './HRPayslipSheet';

// My payslips inside Individual Sign In: the months HR has locked, newest first, and one payslip at a time, the same payslip HR previews.
// Only the signed-in person's own. Pay is on the 26th; the pay period is the 20th of the month before to the 19th.
type Item = { year: number; month: number };
type Incentive = { claimMonth: string; amount: number; paidOn: string; procedures: number };
export type Slip = { year: number; month: number; name: string; code: string; company: string; designation: string; department: string; noPay?: number; unpaidDays?: number; noPayLines?: { kind: string; qty: number; unit: string; amount: number }[]; infotechIncentive?: number; deductionLines?: { name: string; amount: number }[]; printedOt?: string[]; printedRestPh?: string[]; leaveShown?: { al: string; ml: string }; basic: number; allowances: { name: string; amount: number }[]; ot: number; restPh: number; gross: number; kwspEmployee: number; kwspEmployer: number; socsoEmployee: number; socsoEmployer: number; eisEmployee: number; eisEmployer: number; skbbk: number; pcb: number; deductions: number; net: number; ytdWages: number; ytdPcb: number; bankName: string; bankAccountEnd: string; resignDate?: string; leave?: SlipLeave };
// The leave summary under the pay: days taken in the pay period / balance at the end of it / days taken so far this year. Annual Leave includes Emergency Leave.
export type SlipLeave = { al: { period: number; balance: number | null; ytd: number }; ml: { period: number; balance: number | null; ytd: number } };
export const leaveText = (item: SlipLeave['al']) => `${item.period.toFixed(2)} / ${item.balance === null ? '-' : item.balance.toFixed(2)}`;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const COMPANY: Record<string, { name: string; address: string }> = {
  KJ: { name: 'KJ- HSO Healthcare Sdn Bhd', address: 'D-13-GA Jalan Prima Saujana 2/F, Taman Prima Saujana, 43000 Kajang, Selangor' },
  SK: { name: 'SK- HSO Healthcare Sdn Bhd', address: 'No. F-1-G, Blok F Putra Walk, Jalan PP25, Taman Pinggiran Putra, 43300 Seri Kembangan, Selangor' },
};
export const fmt = (value: number) => (value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Opening, printing or sharing a payslip asks for the person's own AraOffice password each time, as Infotech does. The password is
// checked by the server and is only kept in this box until it is sent.
function PasswordPrompt({ title, note, busy, error, onSubmit, onCancel }: { title: string; note?: string; busy: boolean; error: string; onSubmit: (password: string) => void; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  return <form onSubmit={(event) => { event.preventDefault(); const value = password; setPassword(''); onSubmit(value); }} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_25px_rgba(20,35,59,0.06)] print:hidden">
    <p className="flex items-center gap-2 text-sm font-semibold text-[#14233b]"><Lock className="h-4 w-4 text-[#0b587b]" />{title}</p>
    {note && <p className="text-xs leading-5 text-slate-500">{note}</p>}
    <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your AraOffice password" aria-label="Your AraOffice password" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0b587b]" />
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    <div className="flex gap-2"><button type="submit" disabled={busy || !password} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Continue'}</button><button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Cancel</button></div>
  </form>;
}

export default function MyPayslips() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [slip, setSlip] = useState<HRSlip | null>(null);
  const [reveal, setReveal] = useState(false); // the IC, tax, SOCSO, EPF and bank numbers stay hidden until asked for, as on HR's preview
  const sheet = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState(''); // the Infotech payslip (base64 PDF) of the open month, when there is one
  const [error, setError] = useState('');
  const [asking, setAsking] = useState<null | { kind: 'open'; item: Item } | { kind: 'print' } | { kind: 'pdf' }>(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  useSlipPrint(printing, slip ? `Payslip ${MONTHS[slip.month - 1]} ${slip.year}` : 'Payslip', () => setPrinting(false));
  useEffect(() => { assessmentFetch('action=my_payslips').then((result: { payslips: Item[]; incentives?: Incentive[] }) => { setItems(result.payslips); setIncentives(result.incentives || []); }).catch((cause: Error) => { setError(cause.message); setItems([]); }); }, []);
  const post = (action: string, body: Record<string, unknown>) => assessmentFetch(`action=${action}`, { method: 'POST', body: JSON.stringify(body) });
  const answer = async (password: string) => {
    if (!asking) return;
    setBusy(true); setError('');
    try {
      if (asking.kind === 'open') { const result = await post('my_payslip', { year: asking.item.year, month: asking.item.month, password }); setReveal(false); setSlip(result.payslip); setOriginal(result.infotech || ''); setAsking(null); }
      else if (asking.kind === 'print') { await post('verify_password', { password }); setAsking(null); if (original) await printInfotech(original); else setPrinting(true); }
      else if (slip) {
        // The PDF is locked with the same password. On a phone the share sheet offers WhatsApp; elsewhere the file is downloaded.
        // The locked copy is made here, once the password is confirmed: from the Infotech original, or from the payslip as shown.
        await post('verify_password', { password });
        const name = `Payslip_${slip.code}_${slip.year}-${String(slip.month).padStart(2, '0')}.pdf`;
        let bytes: Uint8Array;
        if (original) bytes = await lockInfotechPdf(new Blob([infotechBytes(original)], { type: 'application/pdf' }), password, slip.code);
        else {
          const page = sheet.current?.querySelector<HTMLElement>('[data-pdf-page]');
          const locked = await pagesToPdfBlob(page ? [page] : [], false, { userPassword: password, ownerPassword: `${password}-owner-${slip.code}`, userPermissions: ['print'] });
          bytes = new Uint8Array(await locked.arrayBuffer());
        }
        const file = new File([bytes], name, { type: 'application/pdf' });
        setAsking(null);
        // If the share sheet cannot open (not just closed by the person), the file is downloaded instead.
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: `Payslip ${MONTHS[slip.month - 1]} ${slip.year}` }); } catch (cause) { if ((cause as Error)?.name !== 'AbortError') downloadBlob([file], name, file.type); } }
        else downloadBlob([file], name, file.type);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That did not work. Try again.'); }
    finally { setBusy(false); }
  };
  if (slip) {
    return <div className="space-y-3">
      {printing && createPortal(<div className="hrslip-print"><HRPayslipSheet slip={slip} reveal={reveal} /></div>, document.body)}
      <div className="flex items-center justify-between print:hidden"><button type="button" onClick={() => setSlip(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b587b]"><ChevronLeft className="h-4 w-4" />All payslips</button><span className="flex gap-2"><button type="button" onClick={() => { setError(''); setAsking({ kind: 'print' }); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#0b587b]"><Printer className="h-4 w-4" />Print</button><button type="button" onClick={() => { setError(''); setAsking({ kind: 'pdf' }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 py-2 text-sm font-semibold text-white"><Share2 className="h-4 w-4" />Share / PDF</button></span></div>
      {asking && asking.kind !== 'open' && <PasswordPrompt title={asking.kind === 'print' ? 'Enter your password to print' : 'Enter your password to get the PDF'} note={asking.kind === 'pdf' ? 'The PDF is locked with this same password, so anyone you send it to (for example on WhatsApp) needs it to open the file.' : undefined} busy={busy} error={error} onSubmit={(value) => void answer(value)} onCancel={() => setAsking(null)} />}
      {original ? <InfotechSlip pdf={original} remark={infotechRemark(slip.year, slip.month, slip.ot > 0 || slip.restPh > 0)} /> : <>
        <button type="button" onClick={() => setReveal(!reveal)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 print:hidden">{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{reveal ? 'Hide IC, tax and bank numbers' : 'Show IC, tax and bank numbers'}</button>
        <div ref={sheet}><ReportPreviewFrame portrait><HRPayslipSheet slip={slip} reveal={reveal} /></ReportPreviewFrame></div>
      </>}
    </div>;
  }
  if (items === null) return <p className="text-sm text-slate-500">Loading…</p>;
  return <div className="space-y-3">
    {error && !asking && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {asking?.kind === 'open' && <PasswordPrompt title={`Enter your password to open ${MONTHS[asking.item.month - 1]} ${asking.item.year}`} busy={busy} error={error} onSubmit={(value) => void answer(value)} onCancel={() => setAsking(null)} />}
    {incentives.map((item) => <div key={item.claimMonth} className="flex w-full items-center justify-between rounded-2xl bg-white p-4 shadow-[0_8px_25px_rgba(20,35,59,0.06)]"><span><strong className="block text-sm text-[#14233b]">Incentive · {MONTHS[Number(item.claimMonth.slice(5, 7)) - 1]} {item.claimMonth.slice(0, 4)} claims</strong><span className="text-xs text-slate-500">{item.procedures > 0 ? `${item.procedures} approved ${item.procedures === 1 ? 'entry' : 'entries'} · ` : ''}paid on {longDate(item.paidOn)} · no deductions</span></span><strong className="text-base tabular-nums text-[#1f8a4c]">RM {fmt(item.amount)}</strong></div>)}
    {!items.length ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">No payslips yet. A month appears here once HR has finished it.</p>
      : items.map((item) => <button key={`${item.year}-${item.month}`} type="button" onClick={() => { setError(''); setAsking({ kind: 'open', item }); }} className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span><strong className="block text-sm text-[#14233b]">{MONTHS[item.month - 1]} {item.year}</strong><span className="text-xs text-slate-500">Tap to open with your password</span></span><Lock className="h-4 w-4 text-slate-400" /></button>)}
  </div>;
}
