import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, Users } from 'lucide-react';
import type { Employee } from './HRProfiles';

const DEFAULT_MESSAGE = `Assalamualaikum {{name}},\n\nDimaklumkan bahawa kita akan mula menggunakan AraOffice untuk urusan staf, termasuk permohonan cuti sakit (MC), rekod kehadiran, tuntutan OT dan penilaian prestasi (assessment). Sila sign in dan lengkapkan urusan berkaitan melalui sistem ini.\n\nNama sign-in: {{signin}}\nStaff ID: {{staffId}}\nKata laluan sementara: 4 digit terakhir nombor IC anda. Anda boleh menukarnya selepas sign in buat kali pertama.\n\nSila simpan maklumat sign-in anda dengan selamat dan jangan kongsikan kata laluan. Jika menghadapi masalah untuk sign in, sila hubungi HR. Terima kasih.`;
const MESSAGE_KEY = 'araoffice.hr.staffContact.message';

export default function HRStaffContact({ people }: { people: Employee[] | null }) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [saved, setSaved] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const active = useMemo(() => (people || []).filter(p => p.status === 'Active'), [people]);
  const shown = active.filter(p => `${p.fullName} ${p.employeeCode} ${p.company}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const recipients = active.filter(p => p.id && picked.has(p.id) && p.phone);
  useEffect(() => { try { setMessage(localStorage.getItem(MESSAGE_KEY) || DEFAULT_MESSAGE); } catch { /* storage may be unavailable */ } }, []);
  const saveMessage = () => { try { localStorage.setItem(MESSAGE_KEY, message); setSaved(true); window.setTimeout(() => setSaved(false), 2500); } catch { setSaved(false); } };
  const send = () => {
    if (!message.trim() || !recipients.length) return;
    recipients.forEach((p) => {
      const personalized = message.trim().replaceAll('{{name}}', p.fullName).replaceAll('{{signin}}', p.shortName || p.fullName.split(/\s+/)[0]).replaceAll('{{staffId}}', p.employeeCode);
      window.open(`https://wa.me/${p.phone.replace(/\D/g, '').replace(/^0/, '60')}?text=${encodeURIComponent(personalized)}`, '_blank', 'noopener,noreferrer');
    });
  };
  return <section className="space-y-4">
    <div className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-lg font-semibold text-[#17364c]"><MessageCircle size={20}/>Contact staf</h3><p className="mt-1 text-sm text-slate-500">Pilih staf dan sediakan mesej WhatsApp. Setiap staf akan dibuka dalam tab berasingan untuk anda hantar.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Search size={17}/><input aria-label="Cari staf untuk dihubungi" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama atau nombor staf…" className="h-10 flex-1 outline-none"/></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{picked.size} dipilih</span><button onClick={()=>setPicked(new Set(shown.filter(p=>p.id&&p.phone).map(p=>p.id!)))} className="font-semibold text-sky-700">Pilih semua yang ada telefon</button></div><div className="mt-2 max-h-96 space-y-1 overflow-auto">{shown.map(p=><label key={p.id||p.employeeCode} className="flex cursor-pointer items-center gap-3 rounded-xl p-3 hover:bg-slate-50"><input type="checkbox" disabled={!p.phone||!p.id} checked={!!p.id&&picked.has(p.id)} onChange={()=>p.id&&toggle(p.id)}/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{p.fullName}</span><span className="text-xs text-slate-500">{p.employeeCode} · {p.company}</span></span><span className="text-xs text-slate-400">{p.phone||'Tiada telefon'}</span></label>)}</div></div>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><label className="block text-sm font-semibold">Mesej<textarea value={message} onChange={e=>{setMessage(e.target.value);setSaved(false);}} rows={13} placeholder="Taip mesej untuk staf…" className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-sky-400"/></label><p className="text-xs text-slate-500">Mesej siap diisi dan disesuaikan untuk setiap staf. Penanda: {'{{name}}'}, {'{{signin}}'}, {'{{staffId}}'}.</p><div className="flex gap-2"><button onClick={saveMessage} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50">{saved ? 'Templat disimpan' : 'Simpan templat'}</button><button onClick={()=>{setMessage(DEFAULT_MESSAGE);setSaved(false);}} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Templat asal</button></div><p className="text-xs text-slate-500"><Users size={14} className="mr-1 inline"/>{recipients.length} penerima ada nombor telefon</p><button onClick={send} disabled={!message.trim()||!recipients.length} className="w-full rounded-xl bg-[#25d366] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><MessageCircle size={16} className="mr-2 inline"/>Buka WhatsApp untuk {recipients.length} staf</button><p className="text-xs text-slate-400">WhatsApp memerlukan anda menekan Send bagi setiap perbualan.</p></div>
    </div>
  </section>;
}
