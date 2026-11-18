import { useEffect, useState } from 'react';
import { officeFetch } from './officeApi';

// Staff photos in the browser. A photo is shrunk to 256 px and drawn again as a JPEG before it is sent, which keeps it small (about 20 to 50 KB)
// and drops anything hidden in the original file (GPS point, phone model). The server checks it again.
export type Crop = { zoom: number; x: number; y: number }; // zoom 1 to 3; x and y 0 to 100 (where the square sits)
export const DEFAULT_CROP: Crop = { zoom: 1, x: 50, y: 25 };
// Draws the chosen square of the picture onto a canvas (used for the preview and for the file that is sent).
export function drawPhoto(canvas: HTMLCanvasElement, bitmap: ImageBitmap, crop: Crop, size = 256) {
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot prepare the photo.');
  const side = Math.min(bitmap.width, bitmap.height) / Math.max(1, crop.zoom);
  const left = (bitmap.width - side) * Math.min(100, Math.max(0, crop.x)) / 100, top = (bitmap.height - side) * Math.min(100, Math.max(0, crop.y)) / 100;
  context.fillStyle = '#fff'; context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, left, top, side, side, 0, 0, size, size);
}
export async function photoBase64(canvas: HTMLCanvasElement): Promise<string> {
  for (const quality of [0.86, 0.75, 0.62]) {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 300 * 1024) return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('Unable to read the photo.')); reader.readAsDataURL(blob); });
  }
  throw new Error('The photo is too large even after shrinking.');
}

// Links for a list of staff, asked once and kept while the page is open (a link works for an hour). Staff with no photo, and people who may not
// see photos, simply get none: the page shows the initials then.
const cache = new Map<string, { url: string; at: number }>();
export function usePhotoUrls(resource: 'hr' | 'coo', ids: string[], stamp = 0): Record<string, string> {
  const key = [...new Set(ids)].sort().join(',');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const wanted = key ? key.split(',') : [];
    const fresh = (id: string) => { const hit = cache.get(id); return hit && Date.now() - hit.at < 40 * 60 * 1000; };
    const missing = wanted.filter((id) => !fresh(id) && !cache.has(`no:${id}`));
    const done = () => { if (live) setUrls(Object.fromEntries(wanted.filter(fresh).map((id) => [id, cache.get(id)!.url]))); };
    if (!missing.length) { done(); return () => { live = false; }; }
    (async () => {
      for (let at = 0; at < missing.length; at += 150) {
        const part = missing.slice(at, at + 150);
        try {
          const response = await officeFetch(`/api/status?resource=${resource}&action=photo_urls&ids=${part.join(',')}`);
          const result = response.ok ? await response.json() : { urls: {} };
          for (const id of part) { if (result.urls?.[id]) cache.set(id, { url: result.urls[id], at: Date.now() }); else cache.set(`no:${id}`, { url: '', at: Date.now() }); }
        } catch { /* no photos then */ }
      }
      done();
    })();
    return () => { live = false; };
  }, [key, resource, stamp]);
  return urls;
}
export const forgetPhotoUrls = () => cache.clear();

// ---- The standard background ----
// Every staff photo has the same light grey-blue studio background, whatever it was taken against. The background is found by growing in from the top and
// the sides over the parts that change smoothly (a person's edge is a jump), the person is kept, and the standard background is drawn behind.
// If the background cannot be told apart from the person (it covers too little or too much), nothing is changed and null is returned.
const LOW = [228, 231, 237], HIGH = [203, 206, 215];
function backgroundMask(data: Uint8ClampedArray, w: number, h: number, step: number, drift: number): Uint8Array {
  const seen = new Uint8Array(w * h), base = new Uint8Array(w * h * 3), queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (x: number, y: number) => { const i = y * w + x; if (seen[i]) return; seen[i] = 1; base[i * 3] = data[i * 4]; base[i * 3 + 1] = data[i * 4 + 1]; base[i * 3 + 2] = data[i * 4 + 2]; queue[tail++] = i; };
  for (let x = 0; x < w; x++) seed(x, 0);
  for (let y = 0; y < Math.floor(h / 2); y++) { seed(0, y); seed(w - 1, y); }
  const stepSum = step * 3, driftSum = drift * 3;
  while (head < tail) {
    const i = queue[head++], x = i % w, y = (i - x) / w, r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], br = base[i * 3], bg = base[i * 3 + 1], bb = base[i * 3 + 2];
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x, ny = k === 2 ? y + 1 : k === 3 ? y - 1 : y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx; if (seen[n]) continue;
      const nr = data[n * 4], ng = data[n * 4 + 1], nb = data[n * 4 + 2];
      if (Math.abs(nr - r) + Math.abs(ng - g) + Math.abs(nb - b) <= stepSum && Math.abs(nr - br) + Math.abs(ng - bg) + Math.abs(nb - bb) <= driftSum) {
        seen[n] = 1; const own = (nx + ny) % 25 === 0;
        base[n * 3] = own ? nr : br; base[n * 3 + 1] = own ? ng : bg; base[n * 3 + 2] = own ? nb : bb; queue[tail++] = n;
      }
    }
  }
  return seen;
}
// Majority of the 3 x 3 neighbours: removes specks and small holes in the mask.
function majority(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy)); sum += mask[ny * w + nx]; }
    out[y * w + x] = sum >= 5 ? 1 : 0;
  }
  return out;
}
function boxBlur(values: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), span = radius * 2 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sum = 0; for (let d = -radius; d <= radius; d++) sum += values[y * w + Math.min(w - 1, Math.max(0, x + d))]; tmp[y * w + x] = sum / span; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sum = 0; for (let d = -radius; d <= radius; d++) sum += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x]; out[y * w + x] = sum / span; }
  return out;
}
export function standardBackground(bitmap: ImageBitmap): HTMLCanvasElement | null {
  const scale = Math.min(1, 560 / bitmap.width, 900 / bitmap.height), w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return null;
  context.drawImage(bitmap, 0, 0, w, h);
  const image = context.getImageData(0, 0, w, h);
  let mask: Uint8Array | null = null;
  for (const [step, drift] of [[5, 30], [4, 24], [3, 20]]) {
    const found = backgroundMask(image.data, w, h, step, drift);
    let count = 0; for (let i = 0; i < found.length; i++) count += found[i];
    if (count / (w * h) > 0.3 && count / (w * h) < 0.8) { mask = found; break; }
  }
  if (!mask) return null;
  const clean = majority(majority(mask, w, h), w, h);
  // The person: a little smaller (no old background at the edge), then softened.
  const person = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let keep = 1; for (let dy = -1; dy <= 1 && keep; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = Math.min(w - 1, Math.max(0, x + dx)), ny = Math.min(h - 1, Math.max(0, y + dy)); if (clean[ny * w + nx]) { keep = 0; break; } } person[y * w + x] = keep; }
  const alpha = boxBlur(boxBlur(person, w, h, 1), w, h, 1);
  const data = image.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = alpha[i];
    if (a >= 0.999) continue;
    const dx = (x + w / 2 - w) / w, dy = (y - h) / h, t = Math.min(1, Math.min(1, Math.sqrt(dx * dx + dy * dy)) * 1.15);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * a + (LOW[c] + (HIGH[c] - LOW[c]) * t) * (1 - a));
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
