import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, MessageCircle, Trash2 } from 'lucide-react';
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
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
// A face photo is made small before it is kept: at most 640 pixels on the long side, as a JPEG.
function shrinkFace(image: HTMLImageElement) {
  const scale = Math.min(1, 640 / Math.max(image.width, image.height)), layer = document.createElement('canvas');
  layer.width = Math.round(image.width * scale); layer.height = Math.round(image.height * scale);
  layer.getContext('2d')?.drawImage(image, 0, 0, layer.width, layer.height);
  return layer.toDataURL('image/jpeg', 0.85);
}
type Past = { file: string; month: string; name: string; branch: string; url: string };
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Unable to read that picture.')); image.src = src; });

export function HRSotm({ onError }: { onError: (message: string) => void }) {
  const [tab, setTab] = useState<'create' | 'past'>('create');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [quote, setQuote] = useState(QUOTES[0]);
  const [month, setMonth] = useState(currentMonth());
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [newFace, setNewFace] = useState<string | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1), [moveX, setMoveX] = useState(0), [moveY, setMoveY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [past, setPast] = useState<Past[] | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const fail = (cause: unknown, fallback: string) => onError(cause instanceof Error ? cause.message : fallback);
  useEffect(() => {
    call('action=employees').then((result) => setPeople(((result.employees || []) as Person[]).filter((person) => person.status === 'Active'))).catch((cause) => { setPeople([]); fail(cause, 'Unable to load staff.'); });
    loadImage('/ara-logo.png').then(setLogo).catch(() => setLogo(null));
  }, []);
  const loadPast = () => { call('action=sotm_list').then((result) => setPast(result.items || [])).catch((cause) => { setPast([]); fail(cause, 'Unable to load past posters.'); }); };
  useEffect(() => { if (tab === 'past') loadPast(); }, [tab]);
  useEffect(() => { if (canvas.current && tab === 'create') drawPoster(canvas.current, { name, branch, quote, month: monthLabel(month), photo, logo, zoom, moveX, moveY }); }, [tab, name, branch, quote, month, photo, logo, zoom, moveX, moveY]);
  const choose = async (id: string) => {
    setPersonId(id); setNotice(''); setNewFace(null); setPhoto(null); setZoom(1); setMoveX(0); setMoveY(0);
    const person = (people || []).find((item) => item.id === id);
    setName(person ? titleCase(person.fullName) : ''); setBranch(person?.branch || '');
    if (!id) return;
    try { const result = await call(`action=sotm_face&employeeId=${encodeURIComponent(id)}`); if (result.face) { const image = await loadImage(result.face); setPhoto((current) => current || image); } } catch { /* no saved photo yet */ }
  };
  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError('Choose a picture file (JPG or PNG).'); return; }
    const url = URL.createObjectURL(file);
    loadImage(url).then(async (image) => { const small = shrinkFace(image); setNewFace(small); setPhoto(await loadImage(small)); setZoom(1); setMoveX(0); setMoveY(0); setNotice(''); }).catch((cause: Error) => onError(cause.message)).finally(() => URL.revokeObjectURL(url));
  };
  // Download and WhatsApp both keep the poster under Past SOTM first (and the face photo, if it is new). If saving fails the poster is still used.
  const message = (who: string, when: string) => `Congratulations ${who}, Staff of the Month for ${when}! Thank you for your hard work.`;
  const finish = async (kind: 'download' | 'share') => {
    if (!canvas.current) return;
    setBusy(true); setNotice('');
    const layer = canvas.current;
    let kept = false;
    if (personId) { try { await call('action=sotm_save', { employeeId: personId, month, name, branch, poster: layer.toDataURL('image/jpeg', 0.88), face: newFace }); setNewFace(null); kept = true; } catch (cause) { fail(cause, 'The poster could not be saved, but it is still used.'); } }
    const done = kept ? ' Saved under Past SOTM.' : '';
    const mime = kind === 'share' ? 'image/jpeg' : 'image/png';
    layer.toBlob(async (blob) => {
      try {
        if (!blob) return;
        const fileName = `SOTM ${monthLabel(month)} - ${name || 'staff'}.${kind === 'share' ? 'jpg' : 'png'}`, text = message(name, monthLabel(month));
        if (kind === 'share') {
          const file = new File([blob], fileName, { type: mime });
          if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); setNotice(`Shared.${done}`); return; }
          downloadBlob([blob], fileName, mime); window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
          setNotice(`The picture was downloaded. Attach it in WhatsApp.${done}`); return;
        }
        downloadBlob([blob], fileName, mime); setNotice(`Downloaded.${done}`);
      } catch (cause) { if ((cause as Error)?.name !== 'AbortError') fail(cause, 'Unable to share.'); } finally { setBusy(false); }
    }, mime, kind === 'share' ? 0.92 : undefined);
  };
  const fileOf = async (item: Past) => new File([await (await fetch(item.url)).blob()], `SOTM ${monthLabel(item.month)} - ${item.name}.jpg`, { type: 'image/jpeg' });
  const downloadPast = async (item: Past) => { try { const file = await fileOf(item); downloadBlob([file], file.name, 'image/jpeg'); } catch (cause) { fail(cause, 'Unable to download.'); } };
  const sharePast = async (item: Past) => {
    const text = message(item.name, monthLabel(item.month));
    try {
      const file = await fileOf(item);
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      downloadBlob([file], file.name, 'image/jpeg'); window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      setNotice('The picture was downloaded. Attach it in WhatsApp.');
    } catch (cause) { if ((cause as Error)?.name !== 'AbortError') fail(cause, 'Unable to share.'); }
  };
  const removePast = async (item: Past) => {
    if (!window.confirm(`Delete the ${monthLabel(item.month)} poster for ${item.name}?`)) return;
    try { await call('action=sotm_delete', { file: item.file }); loadPast(); } catch (cause) { fail(cause, 'Unable to delete.'); }
  };
  const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
  const label = 'block text-xs font-semibold text-slate-500';
  const tabs = <div role="tablist" className="inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-100">{([['create', 'Create poster'], ['past', 'Past SOTM']] as const).map(([id, text]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setNotice(''); }} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-[#0b587b] text-white' : 'text-slate-500'}`}>{text}</button>)}</div>;

  const pastMonths: string[] = [...new Set<string>((past || []).map((item) => item.month))];
  const pastBranches: string[] = [...new Set<string>((past || []).map((item) => item.branch).filter(Boolean))].sort();
  const pastShown = (past || []).filter((item) => (!filterMonth || item.month === filterMonth) && (!filterBranch || item.branch === filterBranch));
  if (tab === 'past') return <div className="space-y-4">{tabs}
    <section className="rounded-[26px] bg-gradient-to-br from-[#14233b] via-[#1b3150] to-[#0b587b] p-5 text-white sm:p-7">
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ffd166]">★ Hall of Fame</p><h3 className="mt-1 text-2xl font-semibold">Staff of the Month</h3></div>
        <select aria-label="Filter by month" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} className="h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white [&>option]:text-slate-800"><option value="">All months</option>{pastMonths.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select>
        <select aria-label="Filter by branch" value={filterBranch} onChange={(event) => setFilterBranch(event.target.value)} className="h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white [&>option]:text-slate-800"><option value="">All branches</option>{pastBranches.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
      {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
      {past === null ? <p className="mt-5 text-sm text-white/70">Loading…</p> : !pastShown.length ? <p className="mt-5 text-sm text-white/70">{past.length ? 'No poster for this filter.' : 'No poster yet. Download or share a poster and it is kept here.'}</p> : <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{pastShown.map((item) => <article key={item.file} className="group overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-white/10">
        <img src={item.url} alt={`SOTM ${monthLabel(item.month)} ${item.name}`} loading="lazy" className="aspect-[4/5] w-full object-cover" />
        <div className="flex items-center gap-2 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{item.name}</p><p className="truncate text-xs text-slate-500">{monthLabel(item.month)}{item.branch && ` · ${item.branch}`}</p></div>
          <button onClick={() => void sharePast(item)} aria-label={`Share ${item.name} on WhatsApp`} className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white"><MessageCircle className="h-4 w-4" /></button><button onClick={() => void downloadPast(item)} aria-label={`Download ${item.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b587b] text-white"><Download className="h-4 w-4" /></button><button onClick={() => void removePast(item)} aria-label={`Delete ${item.name}`} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
      </article>)}</div>}
    </section></div>;

  return <div className="space-y-4">{tabs}
    <section className={`${card} grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]`}>
      <div className="space-y-4">
        <div><h3 className="text-lg font-semibold">Staff of the Month</h3><p className="mt-1 text-sm text-slate-500">Choose the staff and the month. A face photo saved earlier comes up by itself; add one only if it is new. Download or WhatsApp also keeps the poster under Past SOTM.</p></div>
        <label className={label}>Staff<select value={personId} onChange={(event) => void choose(event.target.value)} className={`${field} mt-1`}><option value="">{people === null ? 'Loading…' : 'Choose staff'}</option>{(people || []).map((person) => <option key={person.id} value={person.id}>{titleCase(person.fullName)}</option>)}</select></label>
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
        {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
        <div className="flex gap-2"><button type="button" onClick={() => void finish('download')} disabled={busy || !photo || !name.trim()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" />Download</button><button type="button" onClick={() => void finish('share')} disabled={busy || !photo || !name.trim()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-40"><MessageCircle className="h-4 w-4" />WhatsApp</button></div>
      </div>
      <div className="flex justify-center"><canvas ref={canvas} aria-label="Staff of the Month poster preview" className="h-auto w-full max-w-[460px] self-start rounded-2xl shadow-lg ring-1 ring-slate-200" /></div>
    </section></div>;
}
