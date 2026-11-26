import type { Word } from './detect';

// The words of each page of a PDF with their places as fractions of the page (a scanned PDF has none).
export async function pdfWords(blob: Blob): Promise<Word[][]> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages: Word[][] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number), view = page.getViewport({ scale: 1 }), content = await page.getTextContent();
    pages.push(content.items.flatMap((item: any) => {
      if (!item.str?.trim()) return [];
      const [x, y] = view.convertToViewportPoint(item.transform[4], item.transform[5]), height = Math.hypot(item.transform[2], item.transform[3]);
      return [{ text: item.str, x: x / view.width, y: (y - height) / view.height, w: item.width / view.width, h: height / view.height }];
    }));
  }
  return pages;
}
