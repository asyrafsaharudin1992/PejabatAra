import { pdfPageImages } from '../lib/pdfPages';

export const blobOf = (base64: string) => new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: 'application/pdf' });
export const pagesOf = (base64: string) => pdfPageImages(blobOf(base64), 2);
export const readBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, '')); reader.onerror = () => reject(new Error('Unable to read the file.')); reader.readAsDataURL(file); });
