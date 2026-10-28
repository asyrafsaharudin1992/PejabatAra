// Prints a PDF from this page instead of opening it in a tab. Safari cannot print a PDF
// shown in a hidden frame, so each page is drawn to an image (pdf.js, loaded only when
// needed) and printed from here with the page's own print dialog, like the cash voucher.
// Safari also ignores landscape paper, so a landscape page is turned 90° onto portrait paper.
const LONG_SIDE = 2339; // pixels on the long edge: about 200 dpi on A4

export async function printPdfAsImages(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The form could not be downloaded.');
  const data = new Uint8Array(await response.arrayBuffer());
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data }).promise;

  const root = document.createElement('div');
  root.className = 'pdf-print-root';
  const urls: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, LONG_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the form for printing.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('This browser cannot prepare the form for printing.');
    const src = URL.createObjectURL(blob); urls.push(src);
    const sheet = document.createElement('div');
    sheet.className = `pdf-print-page${base.width > base.height ? ' pdf-landscape' : ''}`;
    const image = document.createElement('img');
    image.src = src; image.alt = '';
    sheet.appendChild(image); root.appendChild(sheet);
    canvas.width = 0; canvas.height = 0;
  }
  // Page margin zero so the browser has no room for its own date, title and address.
  const style = document.createElement('style');
  style.textContent = '@page{size:A4 portrait;margin:0}';
  document.body.append(root, style);
  await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)));

  const cleanup = () => { document.body.classList.remove('pdf-printing'); root.remove(); style.remove(); urls.forEach((item) => URL.revokeObjectURL(item)); };
  window.addEventListener('afterprint', cleanup, { once: true });
  document.body.classList.add('pdf-printing');
  window.setTimeout(() => window.print(), 50);
}
