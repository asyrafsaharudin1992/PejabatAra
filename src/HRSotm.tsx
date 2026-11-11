import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Download, ImagePlus } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { card } from './AssessmentStaff';
import { drawPoster } from './lib/sotmPoster';

// Office HR > SOTM (Staff of the Month): pick the person and the month, add a face photo, and the poster is drawn right here in the browser.
// Nothing is saved on the server; HR downloads the picture and shares it.
type Person = { id: string; fullName: string; branch: string; status: string };
const QUOTES = ['Thank you for your dedication, kindness and hard work. You make Klinik ARA a better place for everyone.', 'Great things are done by a series of small things brought together. Thank you for giving your best every day.', 'Terima kasih atas dedikasi, kesabaran dan kerja keras anda. Anda inspirasi buat kita semua.'];
const monthLabel = (value: string) => { const [year, month] = value.split('-').map(Number); return new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s'(-])([a-z])/g, (_all, lead: string, letter: string) => lead + letter.toUpperCase()).replace(/\bBin\b/g, 'bin').replace(/\bBinti\b/g, 'binti').replace(/\bBt\b/g, 'bt');
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Unable to read that picture.')); image.src = src; });

export function HRSotm({ onError }: { onError: (message: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [quote, setQuote] = useState(QUOTES[0]);
  const [month, setMonth] = useState(currentMonth());
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1), [moveX, setMoveX] = useState(0), [moveY, setMoveY] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    officeFetch('/api/status?resource=hr&action=employees').then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setPeople(((result.employees || []) as Person[]).filter((person) => person.status === 'Active')); }).catch((cause: Error) => { setPeople([]); onError(cause.message); });
    loadImage('/ara-logo.png').then(setLogo).catch(() => setLogo(null));
  }, []);
  useEffect(() => { if (canvas.current) drawPoster(canvas.current, { name, branch, quote, month: monthLabel(month), photo, logo, zoom, moveX, moveY }); }, [name, branch, quote, month, photo, logo, zoom, moveX, moveY]);
  const choose = (id: string) => { setPersonId(id); const person = (people || []).find((item) => item.id === id); setName(person ? titleCase(person.fullName) : ''); setBranch(person?.branch || ''); };
  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError('Choose a picture file (JPG or PNG).'); return; }
    const url = URL.createObjectURL(file);
    loadImage(url).then((image) => { setPhoto(image); setZoom(1); setMoveX(0); setMoveY(0); }).catch((cause: Error) => onError(cause.message)).finally(() => URL.revokeObjectURL(url));
  };
  const download = () => canvas.current?.toBlob((blob) => { if (blob) downloadBlob([blob], `SOTM ${monthLabel(month)} - ${name || 'staff'}.png`, 'image/png'); }, 'image/png');
  const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
  const label = 'block text-xs font-semibold text-slate-500';

  return <section className={`${card} grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]`}>
    <div className="space-y-4">
      <div><h3 className="text-lg font-semibold">Staff of the Month</h3><p className="mt-1 text-sm text-slate-500">Choose the staff and the month, add a face photo, then download the poster. Nothing is saved on the server.</p></div>
      <label className={label}>Staff<select value={personId} onChange={(event) => choose(event.target.value)} className={`${field} mt-1`}><option value="">{people === null ? 'Loading…' : 'Choose staff'}</option>{(people || []).map((person) => <option key={person.id} value={person.id}>{titleCase(person.fullName)}</option>)}</select></label>
      <label className={label}>Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} className={`${field} mt-1`} /></label>
      <label className={label}>Name on poster<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className={`${field} mt-1`} /></label>
      <label className={label}>Branch on poster<input value={branch} maxLength={40} onChange={(event) => setBranch(event.target.value)} className={`${field} mt-1`} /></label>
      <label className={label}>Thank-you message<select value={QUOTES.includes(quote) ? quote : ''} onChange={(event) => event.target.value && setQuote(event.target.value)} className={`${field} mt-1`}><option value="">Your own words</option>{QUOTES.map((text, index) => <option key={text} value={text}>Message {index + 1}</option>)}</select><textarea value={quote} maxLength={120} rows={3} onChange={(event) => setQuote(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#0b587b] text-sm font-semibold text-[#0b587b]"><ImagePlus className="h-4 w-4" />{photo ? 'Change face photo' : 'Upload face photo'}<input type="file" accept="image/*" onChange={pickPhoto} className="sr-only" /></label>
      {photo && <div className="space-y-2 rounded-xl bg-[#f4fafd] p-3">
        <label className={label}>Zoom<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="mt-1 w-full" /></label>
        <label className={label}>Left / right<input type="range" min="-1" max="1" step="0.05" value={moveX} onChange={(event) => setMoveX(Number(event.target.value))} className="mt-1 w-full" /></label>
        <label className={label}>Up / down<input type="range" min="-1" max="1" step="0.05" value={moveY} onChange={(event) => setMoveY(Number(event.target.value))} className="mt-1 w-full" /></label>
      </div>}
      <button type="button" onClick={download} disabled={!photo || !name.trim()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" />Download poster (PNG)</button>
    </div>
    <div className="flex justify-center"><canvas ref={canvas} aria-label="Staff of the Month poster preview" className="h-auto w-full max-w-[460px] rounded-2xl shadow-lg ring-1 ring-slate-200" /></div>
  </section>;
}
