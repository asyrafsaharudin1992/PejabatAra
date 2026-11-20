import { rewriteColors } from './colorFix';

// The roster sheet as a Word document: the table on screen is copied cell by cell with its colours, borders and alignment written into the cells themselves
// (Word does not read the page's styles). It is a portrait A4 page saved as .doc, which Word opens and can edit.
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function tableToWordHtml(table: HTMLTableElement, title: string, note: string, fontPt = 9.75): string {
  const view = table.ownerDocument.defaultView!;
  const rows = Array.from(table.rows).map((row) => {
    const cells = Array.from(row.cells).map((cell) => {
      const css = view.getComputedStyle(cell);
      const colour = (value: string) => rewriteColors(value);
      const bg = colour(css.backgroundColor), fg = colour(css.color);
      const lines = (cell.innerText || '').replace(/ /g, ' ').trim().split(/\n+/).map((line) => esc(line.trim())).filter(Boolean).join('<br>');
      const style = [`border:1px solid ${colour(css.borderTopColor) || '#94a3b8'}`, 'padding:3pt 5pt', `text-align:${css.textAlign === 'start' ? 'left' : css.textAlign}`, `font-weight:${css.fontWeight}`, `font-size:${Math.round(parseFloat(css.fontSize) * 0.75 * (fontPt / 9.75) * 10) / 10}pt`, `color:${fg}`, /rgba\([^)]*,\s*0\)/.test(bg) ? '' : `background:${bg}`].filter(Boolean).join(';');
      return `<${cell.tagName.toLowerCase()} colspan="${cell.colSpan}" style="${style}">${lines || '&nbsp;'}</${cell.tagName.toLowerCase()}>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page WordSection1{size:595.3pt 841.9pt;mso-page-orientation:portrait;margin:28pt}div.WordSection1{page:WordSection1}table{border-collapse:collapse;width:100%}</style></head><body><div class="WordSection1"><table>${rows.join('')}</table>${note ? `<p style="font-size:9pt">${esc(note)}</p>` : ''}</div></body></html>`;
}
