import { rewriteColors } from './colorFix';

// The roster sheet as a PDF, drawn from the table on screen with jsPDF (not a screenshot): the logo on top, every cell with its own colour, border and text,
// centred in its box, on one upright A4 page. Colours and text are read from the table, so what was typed over or recoloured on screen is what is saved.
const clean = (text: string) => text.replace(/ /g, ' ').replace(/[^\x20-\x7E· -ÿ]/g, '').trim();
function rgbOf(value: string): [number, number, number, number] | null {
  const match = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/.exec(rewriteColors(value));
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  return [Math.round(+match[1]), Math.round(+match[2]), Math.round(+match[3]), alpha];
}
async function logoData(url: string): Promise<{ data: string; ratio: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const ratio = await new Promise<number>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth / Math.max(1, image.naturalHeight)); image.onerror = () => resolve(1); image.src = data; });
    return { data, ratio };
  } catch { return null; }
}

export async function rosterSheetPdf(table: HTMLTableElement, options: { company: string; note?: string; logoUrl?: string; fontPt?: number }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageW = 210, pageH = 297, margin = 8;
  const view = table.ownerDocument.defaultView!;
  const box = table.getBoundingClientRect();
  const logo = options.logoUrl ? await logoData(options.logoUrl) : null;
  // Header: the logo and the clinic name, then the table.
  const headH = 15;
  if (logo) { const h = 12, w = Math.min(h * logo.ratio, 24); doc.addImage(logo.data, 'PNG', margin, margin, w, w / logo.ratio); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 35, 59);
  doc.text('KLINIK ARA 24 JAM', margin + (logo ? Math.min(12 * logo.ratio, 24) + 3 : 0), margin + 6);
  const top = margin + headH;
  const noteLines = options.note ? doc.splitTextToSize(clean(options.note), pageW - margin * 2) as string[] : [];
  const avail = pageH - top - margin - (noteLines.length ? noteLines.length * 4 + 3 : 0);
  const xScale = (pageW - margin * 2) / box.width;
  const bodyPt = options.fontPt ?? 9.5, MM_PT = 0.3528;
  const ptOf = (css: CSSStyleDeclaration) => bodyPt * ((parseFloat(css.fontSize) || 13) / 13);
  const linesOf = (cell: HTMLTableCellElement) => (cell.innerText || '').split(/\n+/).map(clean).filter(Boolean);
  // Row heights: the screen's, widened so the largest text in the row fits; if the table is then taller than the page, everything (text too) is scaled down to fit.
  const heights = Array.from(table.rows).map((row) => Math.max(row.getBoundingClientRect().height * xScale, ...Array.from(row.cells).map((cell) => { const n = Math.max(1, linesOf(cell).length); return n * ptOf(view.getComputedStyle(cell)) * MM_PT * 1.3 + 2.2; })));
  const total = heights.reduce((sum, value) => sum + value, 0);
  const fit = total > avail ? avail / total : 1, stretch = total < avail ? Math.min(1.35, avail / total) : 1;
  let y = top;
  Array.from(table.rows).forEach((row, rowIndex) => {
    const h = heights[rowIndex] * fit * stretch;
    for (const cell of Array.from(row.cells)) {
      const rect = cell.getBoundingClientRect(), css = view.getComputedStyle(cell);
      const x = margin + (rect.left - box.left) * xScale, w = rect.width * xScale;
      // A box with no colour of its own takes its row's (the weekend rows are tinted).
      const own = rgbOf(css.backgroundColor), fill = own && own[3] > 0.05 ? own : rgbOf(view.getComputedStyle(row).backgroundColor);
      if (fill && fill[3] > 0.05) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(x, y, w, h, 'F'); }
      const line = rgbOf(css.borderTopColor) || [148, 163, 184, 1];
      doc.setDrawColor(line[0], line[1], line[2]); doc.setLineWidth(0.15); doc.rect(x, y, w, h, 'S');
      const lines = linesOf(cell);
      if (!lines.length) continue;
      const ink = rgbOf(css.color) || [15, 23, 42, 1], sizePt = Math.max(4, ptOf(css) * fit);
      doc.setFont('helvetica', parseInt(css.fontWeight, 10) >= 600 || css.fontWeight === 'bold' ? 'bold' : 'normal'); doc.setFontSize(sizePt); doc.setTextColor(ink[0], ink[1], ink[2]);
      const left = css.textAlign === 'left' || css.textAlign === 'start', pad = 1.6, lineH = sizePt * MM_PT * 1.25;
      lines.forEach((text, index) => doc.text(text, left ? x + pad : x + w / 2, y + h / 2 + (index - (lines.length - 1) / 2) * lineH, { align: left ? 'left' : 'center', baseline: 'middle', maxWidth: w - pad }));
    }
    y += h;
  });
  if (noteLines.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(40, 40, 40); doc.text(noteLines, margin, y + 5); }
  return doc.output('blob') as Blob;
}
