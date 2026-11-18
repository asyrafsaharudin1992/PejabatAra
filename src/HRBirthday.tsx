import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, MessageCircle } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { fileFromDataUrl, SHARE_NOTICE, shareToWhatsApp } from './lib/shareFile';
import { card } from './AssessmentStaff';

// Office HR > SOTM > Birthday: pick a staff member and the birthday poster is drawn here in the browser from the template, with their photo.
// Nothing is saved on the server. The photo is the one HR keeps for the organization chart (the full picture, so it can be moved and zoomed here).
type Person = { id: string; name: string; branch: string; month: number; day: number };
const W = 1080, H = 1350, FONT = 'Helvetica Neue, Arial, sans-serif';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s'(-])([a-z])/g, (_all, lead: string, letter: string) => lead + letter.toUpperCase()).replace(/\bBin\b/g, 'bin').replace(/\bBinti\b/g, 'binti').replace(/\bBt\b/g, 'bt');
const WISH = 'May Allah grant you a year filled with peace, prosperity, and joy. Have a wonderful day!';
const LIST_KEY = 'ara-birthday-posters';
type Done = { name: string; date: string; at: string };
const readDone = (): Done[] => { try { const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); return Array.isArray(list) ? list.slice(0, 60) : []; } catch { return []; } };
const label = 'block text-xs font-semibold text-slate-600', field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('Unable to read that picture.')); image.src = src; });
const today = () => { const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })); return { month: now.getMonth() + 1, day: now.getDate() }; };
// Days until the next birthday, so the list starts with who is next.
const until = (person: Person) => { const now = today(), base = Date.UTC(2001, now.month - 1, now.day), at = Date.UTC(2001, person.month - 1, person.day); return Math.round(((at - base) / 86400000 + 365) % 365); };

function draw(canvas: HTMLCanvasElement, input: { template: HTMLImageElement | null; photo: HTMLImageElement | null; name: string; date: string; wish: string; zoom: number; x: number; y: number }, scale = 1) {
  const g = canvas.getContext('2d'); if (!g) return;
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale); g.scale(scale, scale);
  g.fillStyle = '#020611'; g.fillRect(0, 0, W, H);
  if (input.template) g.drawImage(input.template, 0, 0, W, H);
  const cx = 540, cy = 760, R = 270;
  g.save(); g.shadowColor = 'rgba(120,190,255,0.55)'; g.shadowBlur = 60; g.fillStyle = '#0a1830'; g.beginPath(); g.arc(cx, cy, R + 10, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip(); g.fillStyle = '#12233f'; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  const photo = input.photo;
  if (photo) {
    const side = Math.min(photo.width, photo.height) / input.zoom, left = (photo.width - side) * input.x / 100, top = (photo.height - side) * input.y / 100;
    g.drawImage(photo, left, top, side, side, cx - R, cy - R, R * 2, R * 2);
  }
  g.restore();
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(cx, cy, R + 6, 0, Math.PI * 2); g.stroke();
  // The template already has the usual wish; only when the words are changed is it covered and written again.
  if (input.wish.trim() !== WISH) {
  g.fillStyle = '#030814'; g.fillRect(150, 310, 780, 110);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 500 40px ${FONT}`;
  const words = input.wish.split(/\s+/); const lines: string[] = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (g.measureText(next).width > 700 && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((text, index, all) => g.fillText(text, 540, 365 - ((all.length - 1) * 22) + index * 44));
  }
  // The name and date, centred in the middle of the poster (the template has no box).
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 12;
  g.fillStyle = '#fff'; let size = 52; g.font = `700 ${size}px ${FONT}`;
  while (g.measureText(input.name.toUpperCase()).width > 820 && size > 24) { size -= 2; g.font = `700 ${size}px ${FONT}`; }
  g.fillText(input.name.toUpperCase(), W / 2, 1096); g.fillStyle = '#c3cde0'; g.font = `400 30px ${FONT}`; g.fillText(input.date.toUpperCase(), W / 2, 1146);
  g.shadowBlur = 0;
}

export function HRBirthday({ onError }: { onError: (message: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [id, setId] = useState('');
  const [name, setName] = useState(''), [date, setDate] = useState(''), [wish, setWish] = useState(WISH);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [template, setTemplate] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1), [x, setX] = useState(50), [y, setY] = useState(12);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done[]>(readDone);
  // Only a short list of who has had a poster, kept in this browser (nothing goes to the server).
  const remember = () => { const next = [{ name, date, at: new Date().toISOString() }, ...done.filter((item) => !(item.name === name && item.at.slice(0, 4) === new Date().getFullYear().toString()))].slice(0, 60); setDone(next); try { localStorage.setItem(LIST_KEY, JSON.stringify(next)); } catch { /* storage not available */ } };
  useEffect(() => {
    officeFetch('/api/status?resource=hr&action=birthdays').then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setPeople(result.people || []); }).catch((cause: Error) => { setPeople([]); onError(cause.message); });
    loadImage('/birthday-template.jpg').then(setTemplate).catch(() => onError('The birthday template could not be opened.'));
  }, []);
  const sorted = useMemo(() => [...(people || [])].sort((a, b) => until(a) - until(b) || a.name.localeCompare(b.name)), [people]);
  useEffect(() => { if (canvas.current) draw(canvas.current, { template, photo, name: name || 'Name', date: date || 'Date', wish, zoom, x, y }); }, [template, photo, name, date, wish, zoom, x, y]);
  const choose = async (value: string) => {
    setId(value); setPhoto(null); setNotice(''); setZoom(1); setX(50);
    const person = sorted.find((item) => item.id === value);
    setName(person ? titleCase(person.name).split(' ').slice(0, 3).join(' ') : ''); setDate(person ? `${person.day} ${MONTHS[person.month - 1]}` : '');
    if (!person) return;
    try {
      // The full picture if HR has it, else the small one.
      let url = '';
      const source = await (await officeFetch(`/api/status?resource=hr&action=photo_source&employeeId=${person.id}`)).json();
      url = source.url || '';
      if (!url) { const small = await (await officeFetch(`/api/status?resource=hr&action=photo_urls&ids=${person.id}`)).json(); url = small.urls?.[person.id] || ''; }
      if (!url) { onError('This person has no photo yet. Add one in the organization chart (Charts), then come back.'); return; }
      const image = await loadImage(url); setPhoto(image); setY(image.height > image.width * 1.3 ? 12 : 50);
    } catch { onError('The photo could not be opened.'); }
  };
  const fileName = `Happy Birthday - ${name || 'staff'}.png`;
  const layer = () => { const big = document.createElement('canvas'); draw(big, { template, photo, name, date, wish, zoom, x, y }, 1.5); return big; };
  const share = async () => {
    setBusy(true); setNotice('');
    try { const outcome = await shareToWhatsApp(fileFromDataUrl(layer().toDataURL('image/png'), fileName), `Happy Birthday ${name}! ${wish}`); if (outcome !== 'cancelled') remember(); setNotice(outcome === 'copied' || outcome === 'downloaded' ? SHARE_NOTICE[outcome] : outcome === 'shared' ? 'Shared.' : ''); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to share.'); } finally { setBusy(false); }
  };
  const download = () => { setBusy(true); layer().toBlob((blob) => { if (blob) { downloadBlob([blob], fileName, 'image/png'); remember(); setNotice('Downloaded.'); } setBusy(false); }, 'image/png'); };
  const ready = Boolean(id && photo && name.trim());
  return <section className={`${card} grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)_220px]`}>
    <div className="space-y-3">
      <label className={label}>Staff (the next birthdays come first)
        <select value={id} onChange={(event) => void choose(event.target.value)} className={`${field} mt-1`}><option value="">{people ? 'Choose a name…' : 'Loading…'}</option>{sorted.map((person) => <option key={person.id} value={person.id}>{`${titleCase(person.name)} · ${person.day} ${MONTHS[person.month - 1].slice(0, 3)} · ${person.branch}`}</option>)}</select></label>
      <label className={label}>Name on the poster<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} className={`${field} mt-1`} /></label>
      <label className={label}>Date on the poster<input value={date} maxLength={30} onChange={(event) => setDate(event.target.value)} className={`${field} mt-1`} /></label>
      <label className={label}>Wish<textarea value={wish} maxLength={160} rows={3} onChange={(event) => setWish(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal" /></label>
      {photo && <><label className={label}>Zoom<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="mt-1 w-full" /></label>
        <label className={label}>Left / right<input type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} className="mt-1 w-full" /></label>
        <label className={label}>Up / down<input type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} className="mt-1 w-full" /></label></>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void share()} disabled={busy || !ready} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-bold text-white disabled:opacity-40"><MessageCircle className="h-4 w-4" />Share to WhatsApp</button>
        <button type="button" onClick={download} disabled={busy || !ready} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />Download</button>
      </div>
    </div>
    <div className="flex items-start justify-center"><canvas ref={canvas} aria-label="Birthday poster preview" className="h-auto w-full max-w-[520px] rounded-xl shadow-lg ring-1 ring-slate-200" /></div>
    <aside className="space-y-2">
      <div className="flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Downloaded</h4>{done.length > 0 && <button type="button" onClick={() => { setDone([]); try { localStorage.removeItem(LIST_KEY); } catch { /* ignore */ } }} className="text-[11px] font-semibold text-slate-400 hover:text-rose-600">Clear</button>}</div>
      {done.length === 0 ? <p className="text-xs text-slate-400">Posters you download or share are listed here (on this browser only).</p> : <ul className="max-h-[520px] space-y-1.5 overflow-y-auto">{done.map((item) => <li key={item.name + item.at} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="block font-semibold text-slate-700">{item.name}</span><span className="text-slate-400">{item.date} · {new Date(item.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></li>)}</ul>}
    </aside>
  </section>;
}
