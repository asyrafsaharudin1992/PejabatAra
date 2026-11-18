import { useEffect, useState } from 'react';
import { Check, Syringe } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';

// HR's influenza vaccine form, shown at the top of Announcements: read the information, then agree (and say the date and name of the vaccine) or refuse (and say why).
type Answer = { choice: 'agree' | 'refuse'; health: string; allergy: boolean; allergyDetail: string; immunDate: string; immunName: string; reason: string; answeredAt: string };
type State = { open: boolean; name?: string; branch?: string; answer?: Answer | null };
const field = 'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b]';

export default function FluForm({ onAnswered }: { onAnswered: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<'agree' | 'refuse' | ''>('');
  const [health, setHealth] = useState(''), [allergy, setAllergy] = useState<boolean | null>(null), [allergyDetail, setAllergyDetail] = useState('');
  const [immunDate, setImmunDate] = useState(''), [immunName, setImmunName] = useState(''), [reason, setReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { assessmentFetch('action=flu_form').then((data: State) => setState(data)).catch(() => setState({ open: false })); }, []);
  if (!state?.open) return null;
  const answer = state.answer;
  const begin = () => {
    setChoice(answer?.choice || ''); setHealth(answer?.health || ''); setAllergy(answer ? answer.allergy : null); setAllergyDetail(answer?.allergyDetail || '');
    setImmunDate(answer?.immunDate || ''); setImmunName(answer?.immunName || ''); setReason(answer?.reason || ''); setConfirmed(false); setError(''); setEditing(true);
  };
  // Agreed first, vaccinated later: only the date and the name are added; the rest of the answer stays.
  const saveVaccine = async () => {
    setError('');
    if (!immunDate) return setError('Sila pilih tarikh vaksin.');
    setSaving(true);
    try {
      const result = await assessmentFetch('action=flu_form_vaccine', { method: 'POST', body: JSON.stringify({ immunDate, immunName }) });
      setState({ ...state, answer: result.answer }); setUpdating(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tidak dapat disimpan. Sila cuba lagi.'); }
    setSaving(false);
  };
  const save = async () => {
    setError('');
    if (!choice) return setError('Sila pilih: Saya bersetuju atau Saya menolak.');
    if (allergy === null) return setError('Sila nyatakan sama ada anda mempunyai alergi (Ada atau Tiada).');
    if (!confirmed) return setError('Sila tanda kotak pengesahan.');
    setSaving(true);
    try {
      const result = await assessmentFetch('action=flu_form_save', { method: 'POST', body: JSON.stringify({ choice, health, allergy, allergyDetail, immunDate, immunName, reason, confirmed }) });
      setState({ ...state, answer: result.answer }); setEditing(false); onAnswered();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tidak dapat disimpan. Sila cuba lagi.'); }
    setSaving(false);
  };
  return <article className={`rounded-2xl border bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)] ${answer ? 'border-transparent' : 'border-[#0b587b]/40'}`}>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#0b587b]">Pengumuman ini untuk: Semua staf · daripada HR</p>
    <div className="flex flex-wrap items-center gap-2"><Syringe className="h-5 w-5 text-[#0b587b]" /><h2 className="text-base font-semibold text-[#14233b]">Vaksin influenza: keizinan atau penolakan</h2>{!answer && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">Sila jawab</span>}</div>
    {answer && !editing && <div className="mt-3 space-y-2 text-sm text-slate-700">
      <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-600"><Check className="h-4 w-4" />{answer.choice === 'agree' ? 'Anda bersetuju menerima vaksin influenza.' : 'Anda menolak vaksin influenza.'} <span className="font-normal text-slate-400">{new Date(answer.answeredAt).toLocaleDateString('en-GB')}</span></p>
      {answer.choice === 'agree' && (answer.immunDate || answer.immunName) && <p>Tarikh vaksin: <b>{answer.immunDate ? answer.immunDate.split('-').reverse().join('/') : '—'}</b> · Nama vaksin: <b>{answer.immunName || '—'}</b></p>}
      {answer.choice === 'refuse' && <p>Sebab: {answer.reason}</p>}
      {answer.choice === 'agree' && !answer.immunDate && !updating && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Selepas anda mendapat vaksin, sila kemas kini tarikh dan nama vaksin.</p>}
      {answer.choice === 'agree' && !updating && <button type="button" onClick={() => { setImmunDate(answer.immunDate); setImmunName(answer.immunName); setError(''); setUpdating(true); }} className="mr-2 min-h-11 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white">{answer.immunDate ? 'Kemas kini tarikh vaksin' : 'Saya sudah dapat vaksin: isi tarikh'}</button>}
      {updating && <div className="space-y-3 rounded-xl bg-slate-50 p-3">
        <label className="block font-semibold">Tarikh vaksin<input type="date" value={immunDate} onChange={(event) => setImmunDate(event.target.value)} className={field} /></label>
        <label className="block font-semibold">Nama vaksin<input value={immunName} onChange={(event) => setImmunName(event.target.value)} maxLength={120} placeholder="Nama vaksin" className={field} /></label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void saveVaccine()} className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan'}</button><button type="button" onClick={() => setUpdating(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">Batal</button></div></div>}
      {!updating && <button type="button" onClick={begin} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-[#0b587b]">Tukar jawapan saya</button>}
    </div>}
    {(!answer || editing) && !editing && <button type="button" onClick={begin} className="mt-4 min-h-11 w-full rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white">Baca dan jawab</button>}
    {editing && <div className="mt-3 space-y-4 text-sm leading-6 text-slate-700">
      <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5">
        <p><b>Influenza</b> disebabkan oleh virus Influenza yang menjangkiti saluran pernafasan. Ia boleh menyebabkan gejala jangkitan yang ringan mahupun serius. Dalam keadaan tertentu, ia boleh mengancam nyawa. Ia merebak daripada seorang individu yang dijangkiti kepada individu lain melalui titisan salur pernafasan (respiratory droplets) apabila bercakap, batuk atau bersin. Titisan ini boleh mencemari permukaan dan menyebabkan jangkitan kepada individu yang menyentuh permukaan tersebut.</p>
        <p className="mt-2"><b>Golongan berisiko tinggi mendapat komplikasi:</b> kanak-kanak berumur kurang dari 5 tahun, wanita hamil, warga emas berumur 65 tahun dan ke atas, individu dengan penyakit kronik (kencing manis, darah tinggi, asma dan lain-lain), individu obes, dan individu yang mempunyai daya ketahanan badan yang rendah (seperti pesakit kanser, penghidap HIV, pesakit yang menjalani kemoterapi dan lain-lain).</p>
        <p className="mt-2"><b>Gejala</b> bermula 1 atau 2 hari selepas dijangkiti: demam, selsema, sakit tekak, batuk, sakit kepala, sakit badan, sukar bernafas, cirit birit dan sakit perut.</p>
        <p className="mt-2"><b>Kesan sampingan vaksin:</b> seperti vaksin-vaksin lain, influenza boleh menyebabkan kesan sampingan yang ringan seperti kemerahan, sakit dan bengkak di tempat suntikan, atau demam. Kesan ini biasanya akan surut dengan sendiri.</p>
      </div>
      <p className="text-xs text-slate-500">Nama dan cawangan diambil daripada rekod HR anda: {state.name} · {state.branch}</p>
      <label className="block font-semibold">Masalah kesihatan<input value={health} onChange={(event) => setHealth(event.target.value)} maxLength={300} placeholder="Tulis Tiada jika tiada" className={field} /></label>
      <div><p className="font-semibold">Alergi</p><div className="mt-1 flex gap-3">{([[true, 'Ada'], [false, 'Tiada']] as const).map(([value, label]) => <label key={label} className={`flex min-h-11 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-semibold ${allergy === value ? 'border-[#0b587b] bg-[#e9f6fb] text-[#0b587b]' : 'border-slate-200'}`}><input type="radio" className="sr-only" checked={allergy === value} onChange={() => setAllergy(value)} />{label}</label>)}</div>
        {allergy && <input value={allergyDetail} onChange={(event) => setAllergyDetail(event.target.value)} maxLength={300} placeholder="Alah kepada apa?" className={field} />}</div>
      <div><p className="font-semibold">Keputusan anda</p><div className="mt-1 flex gap-3">{([['agree', 'Saya bersetuju'], ['refuse', 'Saya menolak']] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-semibold ${choice === value ? (value === 'agree' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-rose-500 bg-rose-50 text-rose-700') : 'border-slate-200'}`}><input type="radio" className="sr-only" checked={choice === value} onChange={() => setChoice(value)} />{label}</label>)}</div></div>
      {choice === 'agree' && <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-semibold">Tarikh vaksin<input type="date" value={immunDate} onChange={(event) => setImmunDate(event.target.value)} className={field} /></label>
        <label className="block font-semibold">Nama vaksin<input value={immunName} onChange={(event) => setImmunName(event.target.value)} maxLength={120} placeholder="Nama vaksin" className={field} /></label>
        <p className="text-xs text-slate-400 sm:col-span-2">Jika belum ada tarikh atau nama vaksin, biarkan kosong dan kemas kini jawapan anda kemudian.</p></div>}
      {choice === 'refuse' && <label className="block font-semibold">Sebab menolak<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className={`${field} py-2`} /></label>}
      <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>{choice === 'refuse' ? 'Saya mengesahkan bahawa saya telah menerima maklumat yang lengkap mengenai vaksinasi yang dinyatakan di atas, termasuk manfaat, risiko dan kesan sampingan yang mungkin berlaku. Saya telah memahami maklumat tersebut dan memilih untuk menolak vaksinasi ini.' : 'Saya mengesahkan bahawa saya telah menerima maklumat yang lengkap mengenai vaksinasi yang dinyatakan di atas, termasuk manfaat, risiko dan kesan sampingan yang mungkin berlaku. Saya memahami maklumat tersebut dan bersetuju untuk menerima vaksinasi ini.'}</span></label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Menyimpan…' : 'Hantar'}</button>{answer && <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">Batal</button>}</div>
    </div>}
  </article>;
}
