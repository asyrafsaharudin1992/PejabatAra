// A PDF made in the browser, shown as page pictures (for a preview on screen). pdf.js is loaded only when a preview is opened.
export async function pdfPageImages(blob: Blob, scale = 1.6): Promise<string[]> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const urls: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number), viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas'); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot show the preview.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const picture: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (picture) urls.push(URL.createObjectURL(picture));
    canvas.width = 0; canvas.height = 0;
  }
  return urls;
}
