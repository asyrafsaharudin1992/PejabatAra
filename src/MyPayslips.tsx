import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Lock, Printer, Share2 } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { payPeriod } from './lib/payrollRun';

// My payslips inside Individual Sign In: the months HR has locked, newest first, and one payslip at a time, laid out like the Infotech payslip.
// Only the signed-in person's own. Pay is on the 26th; the pay period is the 20th of the month before to the 19th.
type Item = { year: number; month: number };
type Incentive = { claimMonth: string; amount: number; paidOn: string; procedures: number };
type Slip = { year: number; month: number; name: string; code: string; company: string; designation: string; department: string; basic: number; allowances: { name: string; amount: number }[]; ot: number; restPh: number; gross: number; kwspEmployee: number; kwspEmployer: number; socsoEmployee: number; socsoEmployer: number; eisEmployee: number; eisEmployer: number; skbbk: number; pcb: number; deductions: number; net: number; ytdWages: number; ytdPcb: number; bankName: string; bankAccountEnd: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COMPANY: Record<string, { name: string; address: string }> = {
  KJ: { name: 'KJ- HSO Healthcare Sdn Bhd', address: 'D-13-GA Jalan Prima Saujana 2/F, Taman Prima Saujana, 43000 Kajang, Selangor' },
  SK: { name: 'SK- HSO Healthcare Sdn Bhd', address: 'No. F-1-G, Blok F Putra Walk, Jalan PP25, Taman Pinggiran Putra, 43300 Seri Kembangan, Selangor' },
};
const fmt = (value: number) => (value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Row({ label, value, minus }: { key?: string; label: string; value: number; minus?: boolean }) {
  return <div className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-slate-600">{label}</span><strong className="tabular-nums text-[#3b5da8]">{minus ? '-' : ''}{fmt(value)}</strong></div>;
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-slate-500">{label}</p><p className="text-sm font-semibold text-[#3b5da8]">{value || '—'}</p></div>;
}
function Pair({ label, value }: { label: string; value: number }) {
  return <div><p className="text-sm text-slate-500">{label}</p><p className="text-sm font-semibold text-[#3b5da8]">{fmt(value)}</p></div>;
}

// Printing uses a separate A4 document (like the staff profile print) so the app's header and navigation never reach the paper, and it
// always fits one page. The page margin is zero in the print rules; the white border is padding inside the document.
function usePayslipPrint(active: boolean, title: string, onDone: () => void) {
  useEffect(() => {
    if (!active) return;
    const previous = document.title;
    document.title = title;
    document.body.classList.add('payslip-printing');
    const done = () => { document.body.classList.remove('payslip-printing'); document.title = previous; onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([document.fonts.ready, ...Array.from(document.querySelectorAll<HTMLImageElement>('.payslip-doc img'), (image) => image.decode().catch(() => undefined))]).then(() => { if (!cancelled) window.print(); });
    }, 80);
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('payslip-printing'); document.title = previous; };
  }, [active]);
}

function PayslipDocument({ slip }: { slip: Slip }) {
  const company = COMPANY[slip.company] || { name: slip.company, address: '' };
  const period = payPeriod(slip.year, slip.month);
  const line = (label: string, value: number, minus = false, bold = false) => <div key={label} className={`payslip-line${bold ? ' payslip-bold' : ''}`}><span>{label}</span><span>{minus ? '-' : ''}{fmt(value)}</span></div>;
  return <div className="payslip-doc">
    <header><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" /><div><strong>{company.name}</strong><small>{company.address}</small></div></header>
    <h1>Payslip · {MONTHS[slip.month - 1]} {slip.year}</h1>
    <p className="payslip-who"><strong>{slip.name}</strong> ({slip.code})<br />{slip.designation || '—'}{slip.department ? ` · ${slip.department}` : ''}<br />Pay period: {longDate(period.from)} to {longDate(period.to)}</p>
    <section>
      {line('BASIC PAY', slip.basic)}
      {slip.allowances.map((item) => line(item.name.toUpperCase(), item.amount))}
      {slip.ot > 0 && line('OVERTIME', slip.ot)}{slip.restPh > 0 && line('REST DAY / PUBLIC HOLIDAY', slip.restPh)}
      {line('EMPLOYEE EPF', slip.kwspEmployee, true)}{line('EMPLOYEE EIS', slip.eisEmployee, true)}{line('EMPLOYEE SOCSO', slip.socsoEmployee, true)}
      {slip.skbbk > 0 && line('SKBBK', slip.skbbk, true)}{slip.pcb > 0 && line('MTD/PCB', slip.pcb, true)}
    </section>
    <section>
      {line('GROSS WAGES', slip.gross, false, true)}{line('NETT WAGES', slip.net, false, true)}
      {line('Employer EPF', slip.kwspEmployer)}{line('Employer EIS', slip.eisEmployer)}{line('Employer SOCSO', slip.socsoEmployer)}
      {line('Pay so far this year', slip.ytdWages)}{line('PCB so far this year', slip.ytdPcb)}
    </section>
    <p className="payslip-bank">Salary credited to: BANK GIRO<br />Bank account: {slip.bankName || '—'}{slip.bankAccountEnd ? ` · •••• ${slip.bankAccountEnd}` : ''}<br />Paid on: 26 {MONTHS[slip.month - 1]} {slip.year}</p>
    <p className="payslip-note">This is a system generated payslip and does not require signature.</p>
  </div>;
}

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
  const [slip, setSlip] = useState<Slip | null>(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState<null | { kind: 'open'; item: Item } | { kind: 'print' } | { kind: 'pdf' }>(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  usePayslipPrint(printing, slip ? `Payslip ${MONTHS[slip.month - 1]} ${slip.year}` : 'Payslip', () => setPrinting(false));
  useEffect(() => { assessmentFetch('action=my_payslips').then((result: { payslips: Item[]; incentives?: Incentive[] }) => { setItems(result.payslips); setIncentives(result.incentives || []); }).catch((cause: Error) => { setError(cause.message); setItems([]); }); }, []);
  const post = (action: string, body: Record<string, unknown>) => assessmentFetch(`action=${action}`, { method: 'POST', body: JSON.stringify(body) });
  const answer = async (password: string) => {
    if (!asking) return;
    setBusy(true); setError('');
    try {
      if (asking.kind === 'open') { const result = await post('my_payslip', { year: asking.item.year, month: asking.item.month, password }); setSlip(result.payslip); setAsking(null); }
      else if (asking.kind === 'print') { await post('verify_password', { password }); setAsking(null); setPrinting(true); }
      else if (slip) {
        // The PDF is locked with the same password. On a phone the share sheet offers WhatsApp; elsewhere the file is downloaded.
        const result = await post('my_payslip_pdf', { year: slip.year, month: slip.month, password });
        const bytes = Uint8Array.from(atob(result.pdf), (char) => char.charCodeAt(0));
        const file = new File([bytes], result.file, { type: 'application/pdf' });
        setAsking(null);
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: `Payslip ${MONTHS[slip.month - 1]} ${slip.year}` }); } catch { /* the share sheet was closed */ } }
        else { const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = result.file; document.body.appendChild(link); link.click(); link.remove(); }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That did not work. Try again.'); }
    finally { setBusy(false); }
  };
  if (slip) {
    const company = COMPANY[slip.company] || { name: slip.company, address: '' };
    const period = payPeriod(slip.year, slip.month);
    return <div className="space-y-3">
      {printing && createPortal(<PayslipDocument slip={slip} />, document.body)}
      <div className="flex items-center justify-between print:hidden"><button type="button" onClick={() => setSlip(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b587b]"><ChevronLeft className="h-4 w-4" />All payslips</button><span className="flex gap-2"><button type="button" onClick={() => { setError(''); setAsking({ kind: 'print' }); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#0b587b]"><Printer className="h-4 w-4" />Print</button><button type="button" onClick={() => { setError(''); setAsking({ kind: 'pdf' }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 py-2 text-sm font-semibold text-white"><Share2 className="h-4 w-4" />Share / PDF</button></span></div>
      {asking && asking.kind !== 'open' && <PasswordPrompt title={asking.kind === 'print' ? 'Enter your password to print' : 'Enter your password to get the PDF'} note={asking.kind === 'pdf' ? 'The PDF is locked with this same password, so anyone you send it to (for example on WhatsApp) needs it to open the file.' : undefined} busy={busy} error={error} onSubmit={(value) => void answer(value)} onCancel={() => setAsking(null)} />}
      <article className="payslip-print rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
        <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-3"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" className="h-12 w-12 shrink-0 object-contain" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#14233b]">{company.name}</p><p className="text-[11px] leading-4 text-slate-500">{company.address}</p></div></div>
        <h2 className="text-base font-semibold text-[#3b5da8]">{slip.name} ({slip.code})</h2>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Department" value={slip.department} /><Field label="Designation" value={slip.designation} />
          <Field label="Company Name" value={company.name} /><Field label="Address" value={company.address} />
        </div>
        <div className="mt-3"><Field label="Pay Period" value={`${longDate(period.from)} to ${longDate(period.to)}`} /></div>
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
          {slip.skbbk > 0 && <Pair label="SKBBK" value={slip.skbbk} />}
          <Pair label="Pay so far this year" value={slip.ytdWages} /><Pair label="PCB so far this year" value={slip.ytdPcb} />
        </div>
        <div className="mt-4 space-y-1.5 text-sm">
          <p className="flex gap-3"><span className="w-36 text-slate-500">Salary Credited To</span><span className="font-semibold text-[#3b5da8]">: BANK GIRO</span></p>
          <p className="flex gap-3"><span className="w-36 text-slate-500">Bank account</span><span className="font-semibold text-[#3b5da8]">: {slip.bankName || '—'}{slip.bankAccountEnd ? ` · •••• ${slip.bankAccountEnd}` : ''}</span></p>
          <p className="flex gap-3"><span className="w-36 text-slate-500">Paid on</span><span className="font-semibold text-[#3b5da8]">: 26 {MONTHS[slip.month - 1]} {slip.year}</span></p>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">This is a system generated payslip and does not require signature.</p>
      </article>
    </div>;
  }
  if (items === null) return <p className="text-sm text-slate-500">Loading…</p>;
  return <div className="space-y-3">
    {error && !asking && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {asking?.kind === 'open' && <PasswordPrompt title={`Enter your password to open ${MONTHS[asking.item.month - 1]} ${asking.item.year}`} busy={busy} error={error} onSubmit={(value) => void answer(value)} onCancel={() => setAsking(null)} />}
    {incentives.map((item) => <div key={item.claimMonth} className="flex w-full items-center justify-between rounded-2xl bg-white p-4 shadow-[0_8px_25px_rgba(20,35,59,0.06)]"><span><strong className="block text-sm text-[#14233b]">Incentive · {MONTHS[Number(item.claimMonth.slice(5, 7)) - 1]} {item.claimMonth.slice(0, 4)} claims</strong><span className="text-xs text-slate-500">{item.procedures} approved {item.procedures === 1 ? 'entry' : 'entries'} · paid on {longDate(item.paidOn)} · no deductions</span></span><strong className="text-base tabular-nums text-[#1f8a4c]">RM {fmt(item.amount)}</strong></div>)}
    {!items.length ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">No payslips yet. A month appears here once HR has finished it.</p>
      : items.map((item) => <button key={`${item.year}-${item.month}`} type="button" onClick={() => { setError(''); setAsking({ kind: 'open', item }); }} className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span><strong className="block text-sm text-[#14233b]">{MONTHS[item.month - 1]} {item.year}</strong><span className="text-xs text-slate-500">Tap to open with your password</span></span><Lock className="h-4 w-4 text-slate-400" /></button>)}
  </div>;
}
