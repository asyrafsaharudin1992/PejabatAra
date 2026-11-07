// Phone photos of MCs are shrunk in the browser before upload (longest side 1600px, JPEG) to save storage and bandwidth.
// PDFs and anything the browser cannot redraw are sent as they are; a result that is not smaller than the original is dropped.
const readBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('Unable to read the file.')); reader.readAsDataURL(blob); });

export async function shrinkAttachment(file: File, maxSide = 1600, quality = 0.8): Promise<{ name: string; base64: string; size: number }> {
  const original = async () => ({ name: file.name, base64: await readBase64(file), size: file.size });
  if (!/\.(png|jpe?g)$/i.test(file.name)) return original();
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.type !== 'image/jpeg' || blob.size >= file.size) return original();
    return { name: `${file.name.replace(/\.[^.]+$/, '') || 'mc'}.jpg`, base64: await readBase64(blob), size: blob.size };
  } catch { return original(); }
}
