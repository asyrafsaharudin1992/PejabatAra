import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Printer, X } from 'lucide-react';
import { ReportPreviewFrame } from './ReportPreviewFrame';
import { CARE_AMOUNT, CARE_ITEMS, CARE_ROLES, CareClaim, careMonth } from './lib/careClaim';

// The AraCare claim as the printed form (Borang Tuntutan Care Coordination Allowance), filled in from the claim. Print or save as PDF.
const dmy = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) : '';
const box = (on: boolean) => on ? '☑' : '☐';

export function CareFormDocument({ claim }: { claim: CareClaim }) {
  const kpi = claim.kpi;
  return <article className="care-doc">
    <header><div><p><strong>HSO Healthcare Sdn Bhd</strong></p><p><strong>202201004242 (1449939-U)</strong></p><p>TIN: C29715204010</p><p>H-7-1, Jalan PP25, Putra Walk Block H, Taman Pinggiran Putra, Seri Kembangan, Selangor</p><p>operation@hsohealthcare.com · +60182194256</p></div><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" /></header>
    <h1>BORANG TUNTUTAN CARE COORDINATION ALLOWANCE (AraCare)</h1>
    <h2>A. MAKLUMAT PEGAWAI</h2>
    <p>• Nama: <span className="line">{claim.staffName}</span></p>
    <p>• No. IC: <span className="line">{claim.ic}</span></p>
    <p>• Jawatan: <span className="line">{claim.designation}</span></p>
    <p>• Cawangan Klinik: <span className="line">{claim.branch}</span></p>
    <h2>B. MAKLUMAT ELAUN</h2>
    <p>• Jenis Elaun: <strong>Care Coordination Allowance</strong></p>
    <p>• Bulan Tuntutan: <span className="line">{careMonth(claim.month)}</span></p>
    <p>• Jumlah Dituntut: RM{(claim.amount || CARE_AMOUNT).toFixed(0)}</p>
    <h2>C. PERANAN (TANDAKAN ✔)</h2>
    <p>Clinical Care Coordinator (AraCare)</p>
    <p className="boxes">{CARE_ROLES.map((role) => <span key={role}>{box(claim.roles.includes(role))} {role}{role === 'Lain-lain' && claim.other ? ` (${claim.other})` : ''}</span>)}</p>
    <h2>D. RINGKASAN AKTIVITI BULANAN</h2>
    <table><thead><tr><th style={{ width: '10mm' }}>Item</th><th>Butiran</th><th style={{ width: '60mm' }}>Jumlah</th></tr></thead><tbody>{CARE_ITEMS.map((label, index) => <tr key={label}><td>{index + 1}</td><td>{label}</td><td>{claim.items[index] || ''}</td></tr>)}</tbody></table>
    <div className="pb" />
    <h2>E. PENGESAHAN TUGAS</h2>
    <p><strong>Saya mengesahkan bahawa:</strong></p>
    <p>• Registry telah dikemaskini secara berkala</p>
    <p>• Follow-up pesakit telah dijalankan</p>
    <p>• Data adalah tepat dan boleh diaudit</p>
    <p>Disahkan oleh {claim.staffName} melalui AraOffice.</p>
    <p>Tarikh: <span className="line">{dmy(claim.submittedAt)}</span></p>
    <h2>F. SEMAKAN &amp; KELULUSAN</h2>
    <p>Disemak oleh (PIC Klinik):</p>
    <p>Nama: <span className="line">{kpi ? kpi.by : ''}</span></p>
    <p>Semakan direkod dalam AraOffice.</p>
    <p>Tarikh: <span className="line">{kpi ? dmy(kpi.at) : ''}</span></p>
    <h2>G. PENILAIAN KPI (PIC ISI)</h2>
    <table><thead><tr><th>KPI</th><th style={{ width: '45mm' }}>Target</th><th style={{ width: '45mm' }}>Status</th></tr></thead><tbody>
      <tr><td>Follow-up compliance ≥70%</td><td>{kpi ? `${box(kpi.followUp)} Capai  ${box(!kpi.followUp)} Tidak` : '☐ Capai  ☐ Tidak'}</td><td /></tr>
      <tr><td>Registry updated</td><td>{kpi ? `${box(kpi.registry)} Ya  ${box(!kpi.registry)} Tidak` : '☐ Ya  ☐ Tidak'}</td><td /></tr>
      <tr><td>Reminder dilakukan</td><td>{kpi ? `${box(kpi.reminder)} Ya  ${box(!kpi.reminder)} Tidak` : '☐ Ya  ☐ Tidak'}</td><td /></tr>
    </tbody></table>
    <p style={{ marginTop: '3mm' }}><strong>Syarat bayaran elaun:</strong></p>
    <p>{box(Boolean(kpi?.eligible))} Layak &nbsp;&nbsp; {box(Boolean(kpi && !kpi.eligible))} Tidak layak</p>
    {kpi?.note && <p>Catatan: {kpi.note}</p>}
    <p style={{ marginTop: '5mm' }}><strong>Diluluskan oleh (HR / Management):</strong></p>
    <p>Nama: <span className="line">{claim.hrReceivedBy}</span></p>
    <p>Tarikh: <span className="line">{dmy(claim.hrReceivedAt)}</span></p>
  </article>;
}

// Opens the form on screen with Print and Save PDF (both use the browser's print window).
export function CareFormView({ claim, onClose }: { claim: CareClaim; onClose: () => void }) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const previous = document.title;
    document.title = `AraCare - ${claim.staffName || ''} - ${claim.month}`.replace(/[\\/:*?"<>|]/g, '');
    document.body.classList.add('care-printing');
    const done = () => { document.body.classList.remove('care-printing'); document.title = previous; setPrinting(false); };
    window.addEventListener('afterprint', done, { once: true });
    const timer = window.setTimeout(() => { void Promise.all([document.fonts.ready, ...Array.from(document.querySelectorAll<HTMLImageElement>('.care-print img'), (image) => image.decode())]).then(() => window.print()).catch(() => window.print()); }, 80);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('care-printing'); document.title = previous; };
  }, [printing]);
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/70 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
    <div className="mx-auto max-w-[900px]" onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold text-white">AraCare · {careMonth(claim.month)} · {claim.staffName}</p>
        <button onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><FileDown className="h-4 w-4" />Save PDF</button>
        <button onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><Printer className="h-4 w-4" />Print</button>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="rounded-xl bg-white p-4 sm:p-8"><ReportPreviewFrame portrait><CareFormDocument claim={claim} /></ReportPreviewFrame></div>
    </div>
    {printing && createPortal(<div className="care-print"><CareFormDocument claim={claim} /></div>, document.body)}
  </div>;
}
