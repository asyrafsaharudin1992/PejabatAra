import { downloadBlob } from './downloadBlob';

// Share a picture to WhatsApp.
// - Phone or tablet: the share sheet opens with the picture attached.
// - Computer: the same way as sharing a poster in Clinical Admin: the picture is copied to the clipboard and the WhatsApp app opens;
//   choose a chat and paste (Cmd/Ctrl + V). If the clipboard is not allowed the picture is saved and WhatsApp Web opens instead.
const phone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));

export function fileFromDataUrl(dataUrl: string, fileName: string) {
  const [head, data] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bytes = Uint8Array.from(atob(data), (letter) => letter.charCodeAt(0));
  return new File([bytes], fileName, { type });
}

// The clipboard only takes PNG.
async function asPng(file: File): Promise<Blob> {
  if (file.type === 'image/png') return file;
  const bitmap = await createImageBitmap(file), layer = document.createElement('canvas');
  layer.width = bitmap.width; layer.height = bitmap.height; layer.getContext('2d')?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => layer.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to make the picture.')), 'image/png'));
}

// Call this straight from the click. The file may still be loading: the clipboard is given the promise so the click's permission is kept.
export async function shareToWhatsApp(source: File | Promise<File>, text: string, title?: string): Promise<'shared' | 'copied' | 'downloaded' | 'cancelled'> {
  const file = Promise.resolve(source);
  if (phone()) {
    const ready = await file;
    if (navigator.canShare?.({ files: [ready] })) {
      try { await navigator.share({ files: [ready], text, ...(title ? { title } : {}) }); return 'shared'; }
      catch (cause) { if ((cause as Error)?.name === 'AbortError') return 'cancelled'; }
    }
  } else {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': file.then(asPng) })]);
      window.location.assign(`whatsapp://send?text=${encodeURIComponent(text)}`);
      return 'copied';
    } catch { /* fall through to the download */ }
  }
  const ready = await file;
  downloadBlob([ready], ready.name, ready.type);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'downloaded';
}

export const SHARE_NOTICE = { copied: 'The picture is copied and WhatsApp is opening. Choose a chat and paste it (Cmd/Ctrl + V).', downloaded: 'The picture was downloaded. Attach it in WhatsApp.' } as const;
