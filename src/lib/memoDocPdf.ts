import { drawLetterhead, drawPattern, loadLetterheadAssets, LETTERHEAD_HEIGHT } from './letterhead';

// The memo written on the A4 page (the TipTap editor document) as a PDF drawn with jsPDF: real text, thin lines, as many A4 pages as it needs, on the department letterhead.
// It understands what the page editor can make: paragraphs and headings (aligned left, centre, right or justified), bold, italic, underline, strike, text colour and size,
// bullet and numbered lists (nested), quotes, rules and tables (with merged cells, header cells and borderless tables).
// Everything is measured in millimetres. The sizes below are the same ones the page editor uses on screen (src/HRMemoEditor.tsx), so a line breaks in the same place on screen and in the PDF.
export const MEMO_PAGE = { width: 210, height: 297, left: 20, right: 20, firstTop: LETTERHEAD_HEIGHT + 9, nextTop: 20, bottom: 18 };
export const MEMO_TYPE = { body: 11, table: 10, h1: 14, h2: 12, h3: 11.5, line: 1.38, paragraphGap: 2.2, listGap: 0.6, tablePad: 1.5 };
const PT = 0.3528;

type Node = { type?: string; text?: string; attrs?: Record<string, any>; marks?: { type: string; attrs?: Record<string, any> }[]; content?: Node[] };
type Style = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; color: [number, number, number]; size: number };
type Item = { text: string; style: Style; space: boolean; width: number };
type Line = { items: Item[]; width: number; height: number; end: boolean; align: string };

// The standard PDF fonts cover Latin-1 only; anything else (curly quotes, dashes) is made plain.
const clean = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/…/g, '...').replace(/\t/g, '    ').replace(/ /g, ' ').replace(/[^\x20-\x7E¡-ÿ]/g, '');
const colour = (value: unknown): [number, number, number] => {
  const text = String(value || '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) { const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(text);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [0, 0, 0];
};
const sizeOf = (value: unknown, fallback: number) => { const match = /^([\d.]+)\s*(pt|px)?$/i.exec(String(value || '').trim()); if (!match) return fallback; const number = Number(match[1]); return match[2]?.toLowerCase() === 'px' ? number * 0.75 : number; };

export async function memoDocPdf(json: Node, contact: { email?: string; phone?: string }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const { width: W, height: H, left, right, firstTop, nextTop, bottom } = MEMO_PAGE;
  const contentW = W - left - right, limit = H - bottom;
  const assets = await loadLetterheadAssets();
  drawPattern(doc, assets);
  drawLetterhead(doc, assets, contact);

  const fontOf = (style: Style) => style.bold && style.italic ? 'bolditalic' : style.bold ? 'bold' : style.italic ? 'italic' : 'normal';
  const measure = (text: string, style: Style) => { doc.setFont('helvetica', fontOf(style)); doc.setFontSize(style.size); return plainWidth(text, style.size); };
  // jsPDF measures with letter-pair kerning but draws without it, which would close up the spaces between words: measure without it.
  const plainWidth = (text: string, size: number) => (doc.getStringUnitWidth as unknown as (value: string, options: { doKerning: boolean }) => number).call(doc, text, { doKerning: false }) * size / doc.internal.scaleFactor;
  const baseStyle = (size: number, bold = false): Style => ({ bold, italic: false, underline: false, strike: false, color: [0, 0, 0], size });
  const lineHeight = (size: number) => size * PT * MEMO_TYPE.line;

  // ---- Inline content -> words, each with its style, then lines that fit the width ----
  const itemsOf = (nodes: Node[] | undefined, base: Style): (Item | 'break')[] => {
    const out: (Item | 'break')[] = [];
    for (const node of nodes || []) {
      if (node.type === 'hardBreak') { out.push('break'); continue; }
      if (node.type !== 'text' || !node.text) continue;
      const style: Style = { ...base };
      for (const mark of node.marks || []) {
        if (mark.type === 'bold') style.bold = true; else if (mark.type === 'italic') style.italic = true; else if (mark.type === 'underline') style.underline = true; else if (mark.type === 'strike') style.strike = true;
        else if (mark.type === 'textStyle') { if (mark.attrs?.color) style.color = colour(mark.attrs.color); if (mark.attrs?.fontSize) style.size = sizeOf(mark.attrs.fontSize, style.size); }
      }
      for (const part of clean(node.text).split(/(\s+)/)) {
        if (!part) continue;
        const space = /^\s+$/.test(part), text = part;
        out.push({ text, style, space, width: measure(text, style) });
      }
    }
    return out;
  };
  const breakLines = (nodes: Node[] | undefined, base: Style, width: number, align: string): Line[] => {
    const lines: Line[] = []; let current: Item[] = [], used = 0, wrapped = false;
    const finish = (end: boolean) => {
      while (current.length && current[current.length - 1].space) { used -= current[current.length - 1].width; current.pop(); }
      const size = Math.max(base.size, ...current.map((item) => item.style.size));
      lines.push({ items: current, width: used, height: lineHeight(size), end, align }); current = []; used = 0;
    };
    for (const item of itemsOf(nodes, base)) {
      if (item === 'break') { finish(true); wrapped = false; continue; }
      if (!item.space && used + item.width > width + 0.01 && current.some((part) => !part.space)) { finish(false); wrapped = true; }
      if (item.space && wrapped && !current.length) continue;   // spaces left over at a wrap are not carried to the next line
      if (!item.space && item.width > width) {
        // A word wider than the line (a long address, a row of dots) is cut, as it is on screen.
        for (const letter of item.text) { const size = measure(letter, item.style); if (used + size > width + 0.01 && current.length) { finish(false); wrapped = true; } current.push({ ...item, text: letter, width: size }); used += size; }
        continue;
      }
      current.push(item); used += item.width;
    }
    if (current.length || !lines.length) finish(true); else if (lines.length) lines[lines.length - 1].end = true;
    return lines;
  };

  type State = { y: number; draw: boolean; paginate: boolean };
  const newPage = (st: State) => { doc.addPage('a4', 'portrait'); drawPattern(doc, assets); st.y = nextTop; };
  const ensure = (st: State, height: number) => { if (st.paginate && st.y + height > limit && st.y > nextTop + 0.5) newPage(st); };

  const drawLine = (line: Line, x: number, w: number, st: State) => {
    if (!st.draw) return;
    const baseline = st.y + line.height * 0.78;
    const spaces = line.items.filter((item) => item.space).length;
    let cursor = x, extra = 0;
    if (line.align === 'center') cursor = x + (w - line.width) / 2; else if (line.align === 'right') cursor = x + (w - line.width);
    else if (line.align === 'justify' && !line.end && spaces) extra = (w - line.width) / spaces;
    for (const item of line.items) {
      const itemWidth = item.width + (item.space ? extra : 0);
      if (!item.space) { doc.setFont('helvetica', fontOf(item.style)); doc.setFontSize(item.style.size); doc.setTextColor(...item.style.color); doc.text(item.text, cursor, baseline); }
      if (item.style.underline) { doc.setDrawColor(...item.style.color); doc.setLineWidth(0.2); doc.line(cursor, baseline + 0.7, cursor + itemWidth, baseline + 0.7); }
      if (item.style.strike) { doc.setDrawColor(...item.style.color); doc.setLineWidth(0.2); doc.line(cursor, baseline - item.style.size * PT * 0.3, cursor + itemWidth, baseline - item.style.size * PT * 0.3); }
      cursor += itemWidth;
    }
    doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
  };

  // ---- Blocks ----
  const blocks = (nodes: Node[] | undefined, x: number, w: number, st: State, size: number, gap: number) => {
    for (const node of nodes || []) {
      const type = node.type;
      if (type === 'paragraph' || type === 'heading') {
        const level = Number(node.attrs?.level || 1), head = type === 'heading';
        const fontSize = head ? (level === 1 ? MEMO_TYPE.h1 : level === 2 ? MEMO_TYPE.h2 : MEMO_TYPE.h3) : size;
        const lines = breakLines(node.content, baseStyle(fontSize, head), w, String(node.attrs?.textAlign || 'left'));
        if (head) { st.y += 1.2; ensure(st, lines[0].height * 2.6); }
        for (const line of lines) { ensure(st, line.height); drawLine(line, x, w, st); st.y += line.height; }
        st.y += head ? 0.8 : gap;
      } else if (type === 'bulletList' || type === 'orderedList') {
        const ordered = type === 'orderedList'; let number = Number(node.attrs?.start || 1);
        for (const item of node.content || []) {
          const indent = ordered ? 8 : 6;
          ensure(st, lineHeight(size));
          if (st.draw) {
            const baseline = st.y + lineHeight(size) * 0.78; doc.setTextColor(0, 0, 0);
            if (ordered) { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.text(`${number}.`, x + indent - 2, baseline, { align: 'right' }); }
            else { doc.setFillColor(0, 0, 0); doc.circle(x + 2.2, baseline - size * PT * 0.32, 0.55, 'F'); }
          }
          blocks(item.content, x + indent, w - indent, st, size, MEMO_TYPE.listGap);
          number++;
        }
        st.y += gap;
      } else if (type === 'blockquote') {
        const start = st.y; blocks(node.content, x + 6, w - 6, st, size, gap);
        if (st.draw && st.y > start) { doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.6); doc.line(x + 2, start, x + 2, st.y - gap); doc.setDrawColor(0, 0, 0); }
      } else if (type === 'horizontalRule') {
        st.y += 1.5; ensure(st, 1); if (st.draw) { doc.setLineWidth(0.6); doc.setDrawColor(0, 0, 0); doc.line(x, st.y, x + w, st.y); } st.y += 2.5;
      } else if (type === 'table') {
        table(node, x, w, st);
      }
    }
  };

  const table = (node: Node, x: number, w: number, st: State) => {
    const rows = (node.content || []).filter((row) => row.type === 'tableRow');
    if (!rows.length) return;
    const spanOf = (cell: Node) => Math.max(1, Number(cell.attrs?.colspan || 1));
    const columns = Math.max(...rows.map((row) => (row.content || []).reduce((sum, cell) => sum + spanOf(cell), 0)));
    // Column widths: the ones set on the page are kept; the other columns share what is left.
    const given: number[] = []; for (const cell of rows[0].content || []) { const px = cell.attrs?.colwidth as number[] | null; for (let i = 0; i < spanOf(cell); i++) given.push((px?.[i] || 0) * 25.4 / 96); }
    const known = given.reduce((sum, value) => sum + value, 0), open = columns - given.filter((value) => value > 0).length;
    const share = open ? Math.max(8, (w - known) / open) : 0;
    const weights = Array.from({ length: columns }, (_, at) => given[at] > 0 ? given[at] : share);
    const total = weights.reduce((sum, value) => sum + value, 0), colW = weights.map((value) => (value / total) * w);
    const borderless = Boolean(node.attrs?.borderless), pad = MEMO_TYPE.tablePad;
    for (const row of rows) {
      let column = 0; const cells: { x: number; w: number; node: Node; header: boolean }[] = [];
      for (const cell of row.content || []) {
        const span = spanOf(cell), cellX = x + colW.slice(0, column).reduce((sum, value) => sum + value, 0), cellW = colW.slice(column, column + span).reduce((sum, value) => sum + value, 0);
        cells.push({ x: cellX, w: cellW, node: cell, header: cell.type === 'tableHeader' }); column += span;
      }
      const heights = cells.map((cell) => { const probe: State = { y: 0, draw: false, paginate: false }; blocks(cell.node.content, 0, cell.w - pad * 2, probe, MEMO_TYPE.table, 0.8); return Math.max(probe.y, lineHeight(MEMO_TYPE.table)) + pad * 2; });
      const height = Math.max(...heights);
      ensure(st, height);
      if (st.draw) {
        for (const cell of cells) {
          if (cell.header && !borderless) { doc.setFillColor(236, 236, 236); doc.rect(cell.x, st.y, cell.w, height, 'F'); }
          if (!borderless) { doc.setLineWidth(0.2); doc.setDrawColor(0, 0, 0); doc.rect(cell.x, st.y, cell.w, height); }
          const inner: State = { y: st.y + pad, draw: true, paginate: false };
          const content = cell.header ? (cell.node.content || []).map((paragraph) => ({ ...paragraph, content: (paragraph.content || []).map((child) => child.type === 'text' ? { ...child, marks: [...(child.marks || []), { type: 'bold' }] } : child) })) : cell.node.content;
          blocks(content, cell.x + pad, cell.w - pad * 2, inner, MEMO_TYPE.table, 0.8);
        }
      }
      st.y += height;
    }
    st.y += 2.5;
  };

  const st: State = { y: firstTop, draw: true, paginate: true };
  // Empty lines at the very end would only add a blank page.
  const content = [...(json.content || [])];
  while (content.length > 1 && content[content.length - 1].type === 'paragraph' && !content[content.length - 1].content?.length) content.pop();
  blocks(content, left, contentW, st, MEMO_TYPE.body, MEMO_TYPE.paragraphGap);

  const pages = doc.getNumberOfPages();
  if (pages > 1) for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110); doc.text(`${page} / ${pages}`, W - right, H - 8, { align: 'right' }); }
  return doc.output('blob') as Blob;
}
