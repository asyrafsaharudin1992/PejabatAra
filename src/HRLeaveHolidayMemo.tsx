import { useEffect, useMemo, useState } from 'react';
import { card } from './AssessmentStaff';
import { PrintMenu } from './PrintMenu';
import { printPdfBlob } from './lib/savePdf';
import { downloadBlob } from './lib/downloadBlob';
import { holidayMemoPdf } from './lib/holidayMemoPdf';
import { ReportPreviewFrame } from './ReportPreviewFrame';

// Leave > Public holidays > Create memo: the memo of the year's public holidays for the clinic (the sheet HR sends to staff), made from the holidays keyed in under
// "Key in holidays": operations (SG-OPS) on the left, management and admin (SG-MNG) on the right, then how the pay for working on a public holiday is explained, and the two signatures.
// The explanation and the names are typed on this page and can be changed before printing; the names are remembered in this browser only.
type Holiday = { group: string; date: string; name: string };
const MALAY_DAY = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const dmy = (date: string) => { const [year, month, day] = date.split('-').map(Number); return `${day}/${month}/${year}`; };
const dayOf = (date: string) => MALAY_DAY[new Date(`${date}T00:00:00Z`).getUTCDay()];

const DOCTORS = [
  'Jika jadual ditugaskan pada hari kelepasan Am: tambahan AL 1 hari diberikan',
  'Jika jadual tidak bertugas pada hari kelepasan Am: tiada tambahan AL diberikan',
  'Tiada gandaan cuti jika cuti kelepasan Am jatuh pada hari cuti rehat (Ahad) kepada pekerja operasi kerana cuti rehat bagi pekerja operasi adalah berdasarkan jadual yang telah ditetapkan.',
  'Jika jadual yang telah ditetapkan adalah cuti rehat anda dan hari kelepasan Am jatuh pada hari tersebut, tiada tambahan AL diberikan.',
  'Jika tambahan AL diberikan yang melibatkan pekerja bekerja pada hari kelepasan Am pada bulan Disember sahaja boleh di bawa ke tahun hadapan.',
].join('\n');
const ASSISTANTS = [
  'Jika jadual ditugaskan pada hari kelepasan Am: sistem infotech akan kira sebagai gandaan sehari gaji (2x)',
  'Jika jadual tidak bertugas pada hari kelepasan Am: tiada bayaran kerja pada hari kelepasan Am.',
  'Tiada gandaan bayaran sehari gaji (2x) jika cuti kelepasan Am jatuh pada hari cuti rehat (Ahad) kepada pekerja operasi kerana cuti rehat bagi pekerja operasi adalah berdasarkan jadual yang telah ditetapkan.',
  'Jika jadual yang telah ditetapkan adalah cuti rehat anda dan hari kelepasan Am jatuh pada hari tersebut, gandaan bayaran sehari gaji (2x)',
].join('\n');
const KEY = 'ara-holiday-memo';

type Memo = { title: string; doctors: string; assistants: string; contact: string; by: string; byTitle: string; approver: string; approverTitle: string };
const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

function Table({ title, rows }: { title: string; rows: Holiday[] }) {
  const cell = 'border border-black px-1.5 py-[1.2mm] text-[8.5pt] leading-[1.25]';
  return <table className="w-full border-collapse">
    <thead><tr><th colSpan={3} className={`${cell} bg-[#ececec] text-center font-bold`}>{title}</th></tr><tr className="bg-[#ececec] font-bold"><th className={`${cell} text-left`}>Jenis Cuti (Selangor)</th><th className={`${cell} w-[20mm] text-left`}>Tarikh</th><th className={`${cell} w-[16mm] text-left`}>Hari</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.date}><td className={cell}>{row.name}</td><td className={cell}>{dmy(row.date)}</td><td className={cell}>{dayOf(row.date)}</td></tr>)}{!rows.length && <tr><td colSpan={3} className={`${cell} text-center text-slate-500`}>Tiada cuti dimasukkan</td></tr>}</tbody>
  </table>;
}

function Sheet({ memo, operation, admin }: { memo: Memo; operation: Holiday[]; admin: Holiday[] }) {
  const numbered = (text: string) => <ol className="ml-5 list-decimal space-y-[0.6mm]">{lines(text).map((line) => <li key={line}>{line}</li>)}</ol>;
  return <div className="bg-white text-black" style={{ width: '210mm', minHeight: '296.5mm', padding: '0 14mm 10mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9pt', lineHeight: 1.35 }}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1" />
      <div className="flex items-start gap-3"><img src="/forms/ara-letterhead-memo.png" alt="Klinik ARA 24 Jam" className="h-[38mm] w-[30mm] shrink-0 object-fill" /><div className="max-w-[60mm] pt-3 text-[8pt] leading-[1.4]"><p className="text-[10pt] font-bold">HSO Healthcare Sdn Bhd</p><p>202201004242 (1449939-U)</p><p>TIN: C29715204010</p><p>H-7-1, Jalan PP25, Putra Walk Block H, Taman Pinggiran Putra, Seri Kembangan, Selangor</p>{memo.contact && <p>{memo.contact}</p>}</div></div>
    </div>
    <p className="mt-5 text-center text-[10.5pt] font-bold underline">{memo.title}</p>
    <div className="mt-3 grid grid-cols-2 items-start gap-4"><Table title="Hari Kelepasan Am Jabatan Operasi" rows={operation} /><Table title="Hari Kelepasan Am Jabatan Pengurusan- Admin" rows={admin} /></div>
    {[...operation, ...admin].some((row) => /\*\s*$/.test(row.name)) && <p className="mt-2 text-[8.5pt]">* Tarikh tertakluk kepada perubahan (mengikut pengumuman rasmi).</p>}
    <p className="mt-6 font-bold">Penerangan jenis pembayaran perkhidmatan semasa hari kelepasan Am:</p>
    <p className="mt-3 font-bold underline">Pekerja Operasi- Doktor Residen</p>{numbered(memo.doctors)}
    <p className="mt-4 font-bold underline">Pekerja Operasi- Pembantu Klinik</p>{numbered(memo.assistants)}
    <div className="mt-8 grid grid-cols-2 gap-10" style={{ breakInside: 'avoid' }}>
      <div><p>Disediakan oleh,</p><div className="h-[18mm]" /><div className="border-t border-dotted border-black pt-1"><p>{memo.by || ' '}</p><p className="font-bold">{memo.byTitle || ' '}</p><p className="font-bold">HSO Healthcare Sdn Bhd</p></div></div>
      <div><p>Diluluskan oleh,</p><div className="h-[18mm]" /><div className="border-t border-dotted border-black pt-1"><p>{memo.approver || ' '}</p><p className="font-bold">{memo.approverTitle || ' '}</p><p className="font-bold">HSO Healthcare Sdn Bhd</p></div></div>
    </div>
  </div>;
}

export function HolidayMemo({ rows, year, onError }: { rows: Holiday[] | null; year: number; onError: (message: string) => void }) {
  const [memo, setMemo] = useState<Memo>(() => {
    const base: Memo = { title: '', doctors: DOCTORS, assistants: ASSISTANTS, contact: '', by: '', byTitle: '', approver: '', approverTitle: '' };
    try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}'), title: '', doctors: DOCTORS, assistants: ASSISTANTS }; } catch { return base; }
  });
  const title = memo.title || `Hari kelepasan Am Klinik Ara 24 Jam bagi tahun ${year}`;
  // Only the names and the contact line are remembered (the explanation always starts from the standard text for the year).
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ contact: memo.contact, by: memo.by, byTitle: memo.byTitle, approver: memo.approver, approverTitle: memo.approverTitle })); } catch { /* the browser may not allow it */ } }, [memo.contact, memo.by, memo.byTitle, memo.approver, memo.approverTitle]);
  const forYear = useMemo(() => (rows || []).filter((row) => row.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date)), [rows, year]);
  const operation = forYear.filter((row) => row.group === 'SG-OPS'), admin = forYear.filter((row) => row.group === 'SG-MNG');
  // Print and Download make the same one-page A4 PDF, drawn with real text and thin lines (not a picture of the screen), so the letterhead badge stays at the very top edge,
  // the table lines stay fine, and nothing spills onto a second page (the browser's own page margins, about 21 mm in Safari, would otherwise push it down).
  const makePdf = () => holidayMemoPdf({ ...memo, title }, operation, admin, year);
  const print = async () => { try { printPdfBlob(await makePdf()); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to print the memo.'); } };
  const save = async () => { downloadBlob([await makePdf()], `Hari kelepasan Am ${year}.pdf`, 'application/pdf'); };
  const set = (patch: Partial<Memo>) => setMemo((current) => ({ ...current, ...patch }));
  const field = 'mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';
  const shown = { ...memo, title };
  if (rows === null) return <p className="text-sm text-slate-500">Loading…</p>;
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
    <section className={`${card} space-y-3`}>
      <div><h3 className="text-lg font-semibold">Create memo</h3><p className="mt-1 text-sm text-slate-500">The memo of the {year} public holidays, made from the holidays keyed in under <strong>Key in holidays</strong>: operations (SG-OPS) on the left, management and admin (SG-MNG) on the right. Change the words below if needed, then print or save it as a PDF.</p></div>
      {(!operation.length || !admin.length) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{!operation.length && !admin.length ? `No holidays are keyed in for ${year}.` : `${!operation.length ? 'SG-OPS (operations)' : 'SG-MNG (management)'} has no holidays keyed in for ${year}.`} Add them under Key in holidays first.</p>}
      <label className="block text-xs font-semibold text-slate-500">Title<input value={memo.title} onChange={(event) => set({ title: event.target.value })} placeholder={title} maxLength={140} className={field} /></label>
      <label className="block text-xs font-semibold text-slate-500">Contact line under the address (optional)<input value={memo.contact} onChange={(event) => set({ contact: event.target.value })} maxLength={140} placeholder="e-mail and phone" className={field} /></label>
      <label className="block text-xs font-semibold text-slate-500">Pekerja Operasi – Doktor Residen (one point on each line)<textarea value={memo.doctors} onChange={(event) => set({ doctors: event.target.value })} rows={7} className={field} /></label>
      <label className="block text-xs font-semibold text-slate-500">Pekerja Operasi – Pembantu Klinik (one point on each line)<textarea value={memo.assistants} onChange={(event) => set({ assistants: event.target.value })} rows={6} className={field} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-500">Disediakan oleh (name)<input value={memo.by} onChange={(event) => set({ by: event.target.value })} maxLength={80} className={field} /></label>
        <label className="block text-xs font-semibold text-slate-500">Title<input value={memo.byTitle} onChange={(event) => set({ byTitle: event.target.value })} maxLength={80} className={field} /></label>
        <label className="block text-xs font-semibold text-slate-500">Diluluskan oleh (name)<input value={memo.approver} onChange={(event) => set({ approver: event.target.value })} maxLength={80} className={field} /></label>
        <label className="block text-xs font-semibold text-slate-500">Title<input value={memo.approverTitle} onChange={(event) => set({ approverTitle: event.target.value })} maxLength={80} className={field} /></label>
      </div>
      <p className="text-xs text-slate-400">The names and the contact line are remembered on this computer only. The signatures are left blank to sign on the printed memo.</p>
      <div className="flex flex-wrap gap-2"><PrintMenu onPrint={() => void print()} onPdf={save} onError={onError} /></div>
    </section>
    <section className={`${card} overflow-hidden bg-slate-100`}>
      <div aria-label="Holiday memo"><ReportPreviewFrame portrait><Sheet memo={shown} operation={operation} admin={admin} /></ReportPreviewFrame></div>
    </section>
  </div>;
}
