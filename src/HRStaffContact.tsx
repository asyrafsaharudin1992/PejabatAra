import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, History, MessageCircle, Search, Users } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import type { Employee } from './HRProfiles';

const DEFAULT_MESSAGE = `Assalamualaikum {{name}},\n\nDimaklumkan bahawa kita akan mula menggunakan AraOffice untuk urusan staf, termasuk permohonan cuti sakit (MC), rekod kehadiran, tuntutan OT dan penilaian prestasi (assessment). Sila sign in dan lengkapkan urusan berkaitan melalui sistem ini.\n\nNama sign-in: {{signin}}\nStaff ID: {{staffId}}\nKata laluan sementara: 4 digit terakhir nombor IC anda. Anda boleh menukarnya selepas sign in buat kali pertama.\n\nSila simpan maklumat sign-in anda dengan selamat dan jangan kongsikan kata laluan. Jika menghadapi masalah untuk sign in, sila hubungi HR. Terima kasih.`;
const MESSAGE_KEY = 'araoffice.hr.staffContact.message';

export default function HRStaffContact({ people }: { people: Employee[] | null }) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  type LogEntry = { id: string; at: string; by: string; message: string; recipients: { name: string; code: string }[] };
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [openLog, setOpenLog] = useState('');
  const loadLog = () => officeFetch('/api/status?resource=hr&action=contact_log').then((response) => response.json()).then((result) => setLog(result.entries || [])).catch(() => setLog([]));
  useEffect(() => { void loadLog(); }, []);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const active = useMemo(() => (people || []).filter(p => p.status === 'Active'), [people]);
  const shown = active.filter(p => `${p.fullName} ${p.employeeCode} ${p.company}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const recipients = active.filter(p => p.id && picked.has(p.id) && p.phone);
  // The template is shared: every HR user sees the version that was saved last. The browser copy is only a fallback until it loads.
  useEffect(() => {
    let live = true;
    try { const local = localStorage.getItem(MESSAGE_KEY); if (local) setMessage(local); } catch { /* storage may be unavailable */ }
    officeFetch('/api/status?resource=hr&action=contact_message').then((response) => response.json()).then((result) => { if (live && result.message) { setMessage(result.message); try { localStorage.removeItem(MESSAGE_KEY); } catch { /* ignore */ } } }).catch(() => { /* keep what is shown */ });
    return () => { live = false; };
  }, []);
  const saveMessage = async () => {
    setError('');
    try {
      const response = await officeFetch('/api/status?resource=hr&action=contact_message_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Unable to save.');
      setSaved(true); window.setTimeout(() => setSaved(false), 2500);
    } catch (cause) { setSaved(false); setError(cause instanceof Error ? cause.message : 'Unable to save the template.'); }
  };
  const send = () => {
    if (!message.trim() || !recipients.length) return;
    recipients.forEach((p) => {
      const personalized = message.trim().replaceAll('{{name}}', p.fullName).replaceAll('{{signin}}', p.shortName || p.fullName.split(/\s+/)[0]).replaceAll('{{staffId}}', p.employeeCode);
      window.open(`https://wa.me/${p.phone.replace(/\D/g, '').replace(/^0/, '60')}?text=${encodeURIComponent(personalized)}`, '_blank', 'noopener,noreferrer');
    });
    // Keep a record (names and codes only) so HR can see what was sent and when.
    officeFetch('/api/status?resource=hr&action=contact_log_add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim(), recipients: recipients.map((p) => ({ name: p.fullName, code: p.employeeCode })) }) }).then(() => loadLog()).catch(() => setError('Mesej dibuka di WhatsApp, tetapi rekodnya tidak dapat disimpan.'));
  };
  // The same template sent by the same person on the same day is one row (the staff are added up), so repeated sends do not fill the table.
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const rows = useMemo(() => {
    const out: { id: string; at: string; by: string; message: string; staff: number; sends: number }[] = [];
    for (const entry of log || []) {
      const found = out.find((row) => row.by === entry.by && row.message === entry.message && day(row.at) === day(entry.at));
      if (found) { found.staff += entry.recipients.length; found.sends += 1; } else out.push({ id: entry.id, at: entry.at, by: entry.by, message: entry.message, staff: entry.recipients.length, sends: 1 });
    }
    return out;
  }, [log]);
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
  return <section className="space-y-4">
    <div className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-lg font-semibold text-[#17364c]"><MessageCircle size={20}/>Contact staf</h3><p className="mt-1 text-sm text-slate-500">Pilih staf dan sediakan mesej WhatsApp. Setiap staf akan dibuka dalam tab berasingan untuk anda hantar.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Search size={17}/><input aria-label="Cari staf untuk dihubungi" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama atau nombor staf…" className="h-10 flex-1 outline-none"/></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{picked.size} dipilih</span><button onClick={()=>setPicked(new Set(shown.filter(p=>p.id&&p.phone).map(p=>p.id!)))} className="font-semibold text-sky-700">Pilih semua yang ada telefon</button></div><div className="mt-2 max-h-96 space-y-1 overflow-auto">{shown.map(p=><label key={p.id||p.employeeCode} className="flex cursor-pointer items-center gap-3 rounded-xl p-3 hover:bg-slate-50"><input type="checkbox" disabled={!p.phone||!p.id} checked={!!p.id&&picked.has(p.id)} onChange={()=>p.id&&toggle(p.id)}/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{p.fullName}</span><span className="text-xs text-slate-500">{p.employeeCode} · {p.company}</span></span><span className="text-xs text-slate-400">{p.phone||'Tiada telefon'}</span></label>)}</div></div>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><label className="block text-sm font-semibold">Mesej<textarea value={message} onChange={e=>{setMessage(e.target.value);setSaved(false);}} rows={13} placeholder="Taip mesej untuk staf…" className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-sky-400"/></label><p className="text-xs text-slate-500">Mesej siap diisi dan disesuaikan untuk setiap staf. Penanda: {'{{name}}'}, {'{{signin}}'}, {'{{staffId}}'}.</p><div className="flex gap-2"><button onClick={() => void saveMessage()} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50">{saved ? 'Templat disimpan untuk semua HR' : 'Simpan templat (untuk semua HR)'}</button><button onClick={()=>{setMessage(DEFAULT_MESSAGE);setSaved(false);}} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Templat asal</button></div>{error && <p role="alert" className="text-xs text-rose-700">{error}</p>}<p className="text-xs text-slate-500"><Users size={14} className="mr-1 inline"/>{recipients.length} penerima ada nombor telefon</p><button onClick={send} disabled={!message.trim()||!recipients.length} className="w-full rounded-xl bg-[#25d366] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><MessageCircle size={16} className="mr-2 inline"/>Buka WhatsApp untuk {recipients.length} staf</button><p className="text-xs text-slate-400">WhatsApp memerlukan anda menekan Send bagi setiap perbualan.</p></div>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#17364c]"><History size={16}/>Rekod mesej yang dibuka di WhatsApp</h3>
      <p className="mt-1 text-xs text-slate-500">Tarikh, siapa yang menghantar, templat yang digunakan dan bilangan staf. Klik satu baris untuk melihat mesej penuh. Nombor telefon tidak direkodkan.</p>
      {log === null ? <p className="mt-3 text-sm text-slate-500">Memuatkan…</p> : !log.length ? <p className="mt-3 text-sm text-slate-500">Belum ada mesej direkodkan.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs">
        <thead><tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Tarikh</th><th className="pr-3">Dihantar oleh</th><th className="pr-3">Templat</th><th className="pr-2 text-right">Bil. staf</th><th className="w-6" /></tr></thead>
        <tbody>{rows.map((entry) => <Fragment key={entry.id}>
          <tr onClick={() => setOpenLog(openLog === entry.id ? '' : entry.id)} aria-expanded={openLog === entry.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50">
            <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-slate-700">{when(entry.at)}</td>
            <td className="pr-3 text-slate-600">{entry.by ? entry.by.split('@')[0] : '—'}</td>
            <td className="max-w-[360px] pr-3 text-slate-500"><span className="block truncate">{entry.message.replace(/\s+/g, ' ').slice(0, 90)}{entry.message.length > 90 ? '…' : ''}</span></td>
            <td className="pr-2 text-right font-semibold text-slate-700">{entry.staff}{entry.sends > 1 && <span className="block text-[10px] font-normal text-slate-400">{entry.sends} hantaran</span>}</td>
            <td>{openLog === entry.id ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}</td>
          </tr>
          {openLog === entry.id && <tr className="bg-slate-50"><td colSpan={5} className="whitespace-pre-wrap px-3 py-3 leading-5 text-slate-700">{entry.message}</td></tr>}
        </Fragment>)}</tbody>
      </table></div>}
    </div>
  </section>;
}
