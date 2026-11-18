import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { DEFAULT_CROP, drawPhoto, forgetPhotoUrls, photoBase64, standardBackground, type Crop } from './lib/staffPhoto';

// HR edits one place on the chart, as in the Staff of the Month poster: the words, and the photo (drag it in the circle, or use Zoom and the
// sliders). The full picture is kept on the server (private, HR only), so the photo can be moved again later without choosing the file again.
const SIZE = 192;
async function sourceBase64(bitmap: ImageBitmap): Promise<string> {
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return photoBase64(canvas);
}
export function PhotoEditor({ employeeId, name, lines, nodeKey, hasPhoto, onClose, onSaved, onError }: { employeeId: string; name: string; lines?: string[]; nodeKey?: string; hasPhoto: boolean; onClose: () => void; onSaved: () => void; onError: (message: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fresh, setFresh] = useState(false); // a new file was chosen (the old picture is replaced)
  const [original, setOriginal] = useState<ImageBitmap | null>(null); // the new file as it was taken
  const [standard, setStandard] = useState(true); // use the standard background
  const [bgNote, setBgNote] = useState('');
  const [moved, setMoved] = useState(false);
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [text, setText] = useState((lines || []).join('\n'));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (bitmap && canvas.current) drawPhoto(canvas.current, bitmap, crop); }, [bitmap, crop]);
  // The saved picture, so the photo can be moved again.
  useEffect(() => {
    if (!hasPhoto) return; let live = true;
    officeFetch(`/api/status?resource=hr&action=photo_source&employeeId=${employeeId}`).then((response) => response.json()).then(async (result) => {
      if (!result.url || !live) return;
      const blob = await (await fetch(result.url)).blob(); const image = await createImageBitmap(blob);
      if (live) { setBitmap(image); setCrop({ zoom: 1, x: 50, y: image.height > image.width * 1.3 ? 12 : 50 }); }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [employeeId, hasPhoto]);
  // Shows the new photo with the standard background (or as it was taken, or when the background cannot be told apart from the person).
  const show = async (image: ImageBitmap, useStandard: boolean) => {
    setBgNote('');
    if (!useStandard) { setBitmap(image); return; }
    const canvas = standardBackground(image);
    if (!canvas) { setBitmap(image); setBgNote('The background could not be separated from the person, so the photo is used as it is.'); return; }
    setBitmap(await createImageBitmap(canvas));
  };
  const pick = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) { onError('Choose a JPEG, PNG or WebP photo of at most 12 MB.'); return; }
    try {
      const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setOriginal(image); setFresh(true); setMoved(true); setCrop({ zoom: 1, x: 50, y: image.height > image.width * 1.3 ? 12 : 50 });
      await show(image, standard);
    } catch { onError('That photo cannot be opened.'); }
  };
  const change = (next: Crop) => { setCrop(next); setMoved(true); };
  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !bitmap) return;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y; drag.current = { x: event.clientX, y: event.clientY };
    const side = Math.min(bitmap.width, bitmap.height) / crop.zoom;
    const move = (delta: number, range: number, now: number) => range <= 0 ? now : Math.min(100, Math.max(0, now - (delta / SIZE * side) / range * 100));
    change({ ...crop, x: move(dx, bitmap.width - side, crop.x), y: move(dy, bitmap.height - side, crop.y) });
  };
  const post = async (body: object) => {
    const response = await officeFetch('/api/status?resource=hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to save.');
  };
  const save = async () => {
    setBusy(true);
    try {
      const clean = text.split('\n').map((line) => line.trim()).filter(Boolean);
      if (nodeKey && clean.join('\n') !== (lines || []).join('\n')) await post({ action: 'org_text', key: nodeKey, lines: clean });
      if (bitmap && moved && canvas.current) await post({ action: 'photo_upload', employeeId, image: await photoBase64(canvas.current), source: fresh ? await sourceBase64(bitmap) : undefined });
      forgetPhotoUrls(); onSaved();
    } catch (cause) { onError((cause as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => { if (!window.confirm(`Remove the photo of ${name}?`)) return; setBusy(true); try { await post({ action: 'photo_delete', employeeId }); forgetPhotoUrls(); onSaved(); } catch (cause) { onError((cause as Error).message); } finally { setBusy(false); } };
  const slider = (label: string, key: keyof Crop, min: number, max: number, step: number) => <label className="block text-xs font-semibold text-slate-600">{label}<input type="range" min={min} max={max} step={step} value={crop[key]} onChange={(event) => change({ ...crop, [key]: Number(event.target.value) })} className="mt-1 w-full" /></label>;
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
    <div role="dialog" aria-label={`Edit ${name}`} onClick={(event) => event.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-800">{nodeKey ? 'Edit chart' : 'Photo position'}</h3>{!nodeKey && <p className="text-sm text-slate-500">{name}</p>}</div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
      {nodeKey && <label className="block text-xs font-semibold text-slate-600">Words under the photo (one line each, up to 4)<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={260} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm font-normal text-slate-800" /></label>}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-600">Photo</p>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ''; }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#0b587b]" />
        {fresh && original && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={standard} onChange={(event) => { setStandard(event.target.checked); void show(original, event.target.checked); }} />Use the standard background (like the other staff)</label>}
        {bgNote && <p className="text-xs text-amber-700">{bgNote}</p>}
        {bitmap ? <>
          <canvas ref={canvas} onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} className="mx-auto h-48 w-48 cursor-grab touch-none rounded-full border-4 border-[#0b4f8a] bg-slate-100 active:cursor-grabbing" />
          <p className="text-center text-[11px] text-slate-400">Drag the photo, or use the sliders.</p>
          {slider('Zoom', 'zoom', 1, 3, 0.05)}{slider('Left / right', 'x', 0, 100, 1)}{slider('Up / down', 'y', 0, 100, 1)}
        </> : hasPhoto ? <p className="text-xs text-slate-400">Opening the saved photo…</p> : <p className="text-xs text-slate-400">No photo yet. Choose one above.</p>}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        {hasPhoto ? <button type="button" disabled={busy} onClick={() => void remove()} className="h-9 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Remove photo</button> : <span />}
        <button type="button" disabled={busy} onClick={() => void save()} className="h-9 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>;
}
