// Saves a file from the browser and frees it afterwards (a blob link that is never revoked stays in memory until the tab closes).
export function downloadBlob(parts: BlobPart[], fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
