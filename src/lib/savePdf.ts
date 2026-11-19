import { downloadBlob } from './downloadBlob';
import { fixUnsupportedColors } from './colorFix';

// "Save PDF" for a report that is already drawn on screen: every element marked data-pdf-page inside the container is one page. Each is drawn at its own size
// (any scaling the preview applied to fit the window is removed), then put on an A4 page, so what is saved is the report as it was previewed, not a screenshot of the window.
// html2canvas and jsPDF are loaded only when Save is pressed.
export async function pagesToPdfBlob(pages: HTMLElement[], landscape: boolean): Promise<Blob> {
  if (!pages.length) throw new Error('There is nothing to save yet.');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait', compress: true });
  const width = landscape ? 297 : 210, height = landscape ? 210 : 297;
  for (let index = 0; index < pages.length; index++) {
    const canvas = await html2canvas(pages[index], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, onclone: (_document, element) => { element.style.transform = 'none'; element.style.left = '0'; element.style.top = '0'; fixUnsupportedColors(element); } });
    // The picture is fitted to the page width; a taller one (several sheets in one block) continues on the next pages, a slice of one page each.
    const sliceHeight = Math.floor(canvas.width * height / width), count = Math.max(1, Math.ceil(canvas.height / sliceHeight - 0.08));
    for (let part = 0; part < count; part++) {
      const top = part * sliceHeight, used = Math.min(sliceHeight, canvas.height - top);
      const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = used;
      const context = slice.getContext('2d'); if (!context) throw new Error('This browser cannot save the PDF.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, slice.width, slice.height); context.drawImage(canvas, 0, top, canvas.width, used, 0, 0, canvas.width, used);
      if (index > 0 || part > 0) pdf.addPage('a4', landscape ? 'landscape' : 'portrait');
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, width, used * width / canvas.width, undefined, 'FAST');
      slice.width = 0; slice.height = 0;
    }
    canvas.width = 0; canvas.height = 0;
  }
  return pdf.output('blob') as Blob;
}
export async function savePagesAsPdf(container: ParentNode, filename: string, landscape: boolean) {
  const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  downloadBlob([await pagesToPdfBlob(pages, landscape)], filename.endsWith('.pdf') ? filename : `${filename}.pdf`, 'application/pdf');
}

// Print a PDF that was made in the browser: it is loaded in a hidden frame and the browser's print window is opened for it (where the person can also choose "Save as PDF").
export function printPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.onload = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000); } };
  frame.src = url;
  document.body.appendChild(frame);
}
