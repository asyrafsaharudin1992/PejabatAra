// Prints a PDF from this page instead of opening it in a tab. Safari cannot print a PDF
// shown in a hidden frame, so each page is drawn to an image (pdf.js, loaded only when
// needed) and printed from here with the page's own print dialog, like the cash voucher.
//
// Safari keeps its own page margins, so a whole A4 page would have to shrink (to about 86%) to
// fit inside them. Forms already have white borders, so each page is trimmed to its content
// and printed at its real size; only content wider than 180mm or taller than 255mm (the room
// left inside Safari's margins) is shrunk, and only as far as needed. Safari also ignores
// landscape paper, so a landscape page is turned 90° onto portrait paper.
const DPI = 200;                    // drawing resolution
const PAD = Math.round(DPI / 25);   // 1mm of white kept round the content
const WHITE = 245;                  // a pixel this light or lighter counts as blank
const mm = (pixels: number) => (pixels / DPI) * 25.4;

// The smallest box that holds everything printed on the page.
function contentBox(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const at = row + x * 4;
      if (data[at] < WHITE || data[at + 1] < WHITE || data[at + 2] < WHITE) {
        if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return { x: 0, y: 0, width, height };   // a blank page: keep it whole
  const x = Math.max(0, left - PAD), y = Math.max(0, top - PAD);
  return { x, y, width: Math.min(width, right + PAD) - x, height: Math.min(height, bottom + PAD) - y };
}

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
    const viewport = page.getViewport({ scale: DPI / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the form for printing.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    // Landscape pages are turned a quarter turn first, then everything is trimmed the same way.
    let source = canvas;
    if (base.width > base.height) {
      source = document.createElement('canvas');
      source.width = canvas.height; source.height = canvas.width;
      const turned = source.getContext('2d')!;
      turned.translate(source.width, 0); turned.rotate(Math.PI / 2); turned.drawImage(canvas, 0, 0);
    }
    const sourceContext = source.getContext('2d')!;
    const box = contentBox(sourceContext, source.width, source.height);
    const trimmed = document.createElement('canvas');
    trimmed.width = box.width; trimmed.height = box.height;
    trimmed.getContext('2d')!.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

    const blob = await new Promise<Blob | null>((resolve) => trimmed.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('This browser cannot prepare the form for printing.');
    const src = URL.createObjectURL(blob); urls.push(src);
    const sheet = document.createElement('div');
    sheet.className = 'pdf-print-page';
    const image = document.createElement('img');
    image.src = src; image.alt = '';
    image.style.setProperty('--w', `${mm(box.width).toFixed(2)}mm`);
    image.style.setProperty('--h', `${mm(box.height).toFixed(2)}mm`);
    sheet.appendChild(image); root.appendChild(sheet);
    canvas.width = 0; canvas.height = 0; source.width = 0; source.height = 0; trimmed.width = 0; trimmed.height = 0;
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
