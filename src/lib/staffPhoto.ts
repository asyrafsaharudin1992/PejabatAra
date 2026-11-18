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
export function usePhotoUrls(resource: 'hr' | 'coo', ids: string[]): Record<string, string> {
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
  }, [key, resource]);
  return urls;
}
export const forgetPhotoUrls = () => cache.clear();
