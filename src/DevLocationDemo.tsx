import { useState } from 'react';
import { LocationHelp } from './MyAttendance';

// Local visual preview only: never requests a position or calls an attendance API.
export default function DevLocationDemo() {
  const params = new URLSearchParams(window.location.search);
  const [kind, setKind] = useState<'ios' | 'android' | 'other'>(params.get('device') === 'android' ? 'android' : params.get('device') === 'other' ? 'other' : 'ios');
  const scenario = params.get('locationDemo');
  const [open, setOpen] = useState(scenario === 'blocked');
  const [message, setMessage] = useState('');
  if (scenario === 'primer' || scenario === 'blocked') return <main className="min-h-screen bg-[#f5f5f7] p-5 text-[#14233b]">
    <p className="text-xs font-semibold text-slate-400">LOCALHOST · DEMO SAHAJA</p>
    <h1 className="mt-6 text-3xl font-semibold">Attendance</h1>
    <div className="mt-5 rounded-3xl bg-[#0b3d59] p-5 text-white"><p className="text-sm">Klinik Demo</p><p className="mt-2 text-xl font-semibold">09:00 – 18:00</p><button onClick={() => { if (scenario === 'primer') { setMessage('Dalam aplikasi sebenar, Clock In/Out terus meminta lokasi melalui browser. Jika kebenaran belum diputuskan, browser memaparkan Allow / Block. Demo ini tidak meminta lokasi sebenar.'); } else { setMessage(''); setOpen(true); } }} className="mt-5 h-14 w-full rounded-2xl bg-emerald-300 font-semibold text-emerald-950">{scenario === 'primer' ? 'Clock out (demo)' : 'Tunjuk panduan lokasi'}</button></div>
    <p className="mt-4 text-xs leading-5 text-slate-500">Preview ini tidak meminta lokasi dan tidak merekod kehadiran.</p>
    {message && <p role="status" className="mt-4 rounded-xl bg-sky-50 p-4 text-sm text-sky-800">{message}</p>}
    {open && scenario === 'blocked' && <LocationHelp kind={kind} app={false} onClose={() => setOpen(false)} onRetry={() => { setOpen(false); setMessage('Dalam aplikasi sebenar, Try again akan mencuba lokasi semula. Demo tidak mengakses GPS.'); }} />}
  </main>;
  return <main className="min-h-screen bg-[#f5f5f7] p-5 sm:p-8">
    <h1 className="text-2xl font-semibold tracking-tight text-[#14233b]">Demo panduan kebenaran lokasi</h1>
    <p className="mt-2 text-sm text-slate-500">Popup sebenar AraOffice. Tiada lokasi diminta atau Clock In/Out direkodkan.</p>
    <div className="my-5 flex gap-2">{([['ios', 'iPhone'], ['android', 'Android'], ['other', 'Komputer']] as const).map(([id, label]) => <button key={id} aria-pressed={kind === id} onClick={() => setKind(id)} className={`rounded-full px-4 py-2 text-sm font-medium ${kind === id ? 'bg-[#0b3d59] text-white' : 'bg-white text-slate-600'}`}>{label}</button>)}</div>
    <div className="grid max-w-[860px] gap-6 md:grid-cols-2">{([['primer', '1. Tekan Clock In / Out'], ['blocked', '2. Jika lokasi disekat']] as const).map(([id, label]) => <section key={id}><h2 className="mb-3 text-sm font-semibold text-slate-600">{label}</h2><iframe key={`${id}-${kind}`} title={label} src={`/?locationDemo=${id}&device=${kind}`} className="h-[640px] w-full rounded-[28px] border-[6px] border-slate-900 bg-white shadow-lg" /></section>)}</div>
  </main>;
}
