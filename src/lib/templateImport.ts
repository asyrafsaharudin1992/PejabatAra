import type { TemplateItem } from './reviewTemplate';

// Reads a review form someone already has (a spreadsheet, a Word table, a PDF with real text, or pasted lines) into a draft template.
// It only makes a draft: HR checks and corrects it in the template editor before saving. Nothing here touches the network.
export type Imported = { name: string; items: TemplateItem[]; notes: string[] };
export type PdfCell = { str: string; x: number; y: number; w: number };
export type PdfPage = { cells: PdfCell[] };

const clean = (value: unknown) => String(value ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const oneLine = (value: unknown) => clean(value).replace(/\s*\n\s*/g, ' ');
const MARK = /^\(?\s*(\d{1,3}(?:[.,]\d)?)\s*(?:%|markah|marks?|mks|pts|points)?\s*\)?$/i;
export const toMark = (value: unknown): number | null => {
  const hit = MARK.exec(clean(value));
  if (!hit) return null;
  const number = Number(hit[1].replace(',', '.'));
  return number > 0 && number <= 100 && number * 2 === Math.round(number * 2) ? number : null;
};
const BULLET = /^[•▪●◦·\-–*]\s+/;
const splitPoints = (text: string) => clean(text).split(/\n|\s·\s/).map((line) => line.replace(BULLET, '').trim()).filter(Boolean).slice(0, 10);
const stripNumber = (text: string) => text.replace(/^\s*\d{1,2}\s*[.)]\s*/, '').trim();

const HEAD = {
  got: /diperoleh|obtained|awarded|actual|given|dapat|assessor.?s? (mark|score)|scored/i,
  max: /penuh|full|max|maksimum|maximum|total marks|marks?$|markah$|skor|score|weight|wajaran|bobot|mata/i,
  desc: /penerangan|description|butiran|details?|keterangan|indicator|petunjuk|expected|what to look/i,
  no: /^(no\.?|bil\.?|#|nombor|number)$/i,
  item: /item|elemen|perkara|kriteria|criteria|criterion|aspek|aspect|area|penilaian|assessment|kategori|category|tugas|task|competenc|kompeten/i,
};
type Role = 'got' | 'max' | 'desc' | 'no' | 'item' | '';
const roleOf = (text: string): Role => { const value = oneLine(text); if (!value) return ''; for (const role of ['got', 'max', 'desc', 'no', 'item'] as const) if (HEAD[role].test(value)) return role; return ''; };
const TOTAL = /^(jumlah|total|sub-?total|purata|average|markah keseluruhan|overall)\b/i;
const LABEL = /^(nama|name|tarikh|date|cawangan|branch|jawatan|position|department|jabatan|employee|no\.? ?(pekerja|staf|staff)|assessor|penilai|period|tempoh)\b/i;

// Turns a table (rows of cells) into items. Handles a header row in English or Malay; without one it guesses the columns from the data.
export function fromTable(rows: string[][], fallbackName = ''): Imported {
  const notes: string[] = [];
  const grid = rows.map((row) => row.map((cell) => clean(cell)));
  let headerAt = -1, roles: Role[] = [];
  for (let index = 0; index < Math.min(grid.length, 25); index++) {
    const found = grid[index].map(roleOf);
    const named = found.filter(Boolean).length;
    if ((found.includes('item') || found.includes('desc')) && found.includes('max') || named >= 3) { headerAt = index; roles = found; break; }
  }
  const width = Math.max(0, ...grid.map((row) => row.length));
  let nameCol = roles.indexOf('item'), descCol = roles.indexOf('desc'), maxCol = roles.indexOf('max');
  const data = grid.slice(headerAt + 1);
  if (headerAt < 0 || maxCol < 0) {
    // No usable header: the column of marks is the one mostly holding small numbers; the item is the column with the longest text.
    const share = Array.from({ length: width }, (_, col) => { const cells = data.map((row) => row[col] || '').filter(Boolean); return cells.length ? cells.filter((cell) => toMark(cell) !== null).length / cells.length : 0; });
    const length = Array.from({ length: width }, (_, col) => { const cells = data.map((row) => row[col] || '').filter(Boolean); return cells.length ? cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length : 0; });
    const sequence = (col: number) => { const values = data.map((row) => Number(row[col])).filter(Number.isFinite); return values.length > 2 && values.every((value, at) => at === 0 || value === values[at - 1] + 1); };
    maxCol = share.reduce((best, value, col) => value > (share[best] ?? -1) && !sequence(col) ? col : best, -1);
    if (maxCol >= 0 && share[maxCol] < 0.5) maxCol = -1;
    const text = length.map((value, col) => col === maxCol || sequence(col) ? -1 : value);
    nameCol = text.indexOf(Math.max(...text));
    descCol = -1;
    if (headerAt < 0) notes.push('No column headings were found, so the columns were guessed. Check the item names and marks.');
  }
  if (maxCol < 0 || nameCol < 0) return { name: fallbackName, items: [], notes: ['No column of marks was found. Use Add template, or send a file with a column of full marks.'] };
  if (nameCol === maxCol) nameCol = -1;
  const items: TemplateItem[] = [];
  let skippedHeading = 0;
  for (const row of data) {
    if (!row.some(Boolean)) continue;
    if (TOTAL.test(row[nameCol] || '') || TOTAL.test(row.find(Boolean) || '')) continue;
    const name = stripNumber(oneLine(row[nameCol] ?? ''));
    const description = descCol >= 0 ? clean(row[descCol] ?? '') : '';
    const max = toMark(row[maxCol] ?? '');
    if (!name) { if (items.length && description && max === null) items[items.length - 1].points.push(...splitPoints(description)); continue; }
    if (max === null) { if (!description) { skippedHeading++; continue; } notes.push(`"${name.slice(0, 50)}" had no full mark, so 5 was used. Please set it.`); }
    items.push({ name: name.slice(0, 200), points: splitPoints(description), max: max ?? 5 });
  }
  if (skippedHeading) notes.push(`${skippedHeading} heading row${skippedHeading > 1 ? 's' : ''} without a mark ${skippedHeading > 1 ? 'were' : 'was'} left out.`);
  items.forEach((item) => { item.points = item.points.slice(0, 10); });
  return { name: fallbackName, items, notes };
}

// Lines such as "1. Item name (5 marks)", "Item name - 5" or "Item name | 5"; a line that is not an item goes under the item before it.
const LINE_PATTERNS = [
  /^\s*(?:\d{1,2}\s*[.)]\s*)?(.{3,200}?)\s*[(\[]\s*(\d{1,3}(?:[.,]5)?)\s*(?:markah|marks?|%|mks)?\s*[)\]]\s*$/i,
  /^\s*\d{1,2}\s*[.)]?\s+(.{3,200}?)\s+(\d{1,3}(?:[.,]5)?)\s*(?:markah|marks?|%|mks)?\s*$/i,
  /^\s*(.{3,200}?)\s*[|\t;:–-]\s*(\d{1,3}(?:[.,]5)?)\s*(?:markah|marks?|%|mks)?\s*$/i,
];
export function fromLines(lines: string[], fallbackName = ''): Imported {
  const items: TemplateItem[] = [];
  for (const raw of lines) {
    const line = clean(raw);
    if (!line || TOTAL.test(stripNumber(line))) continue;
    let hit: RegExpExecArray | null = null;
    for (const pattern of LINE_PATTERNS) { hit = pattern.exec(line); if (hit && toMark(hit[2]) !== null) break; hit = null; }
    if (hit) { items.push({ name: stripNumber(hit[1]).replace(/\s*[|;:–-]+\s*$/, '').slice(0, 200), points: [], max: toMark(hit[2])! }); continue; }
    if (items.length && !TOTAL.test(line) && !LABEL.test(line) && items[items.length - 1].points.length < 10) items[items.length - 1].points.push(line.replace(BULLET, '').slice(0, 400));
  }
  return { name: fallbackName, items, notes: items.length ? ['Items were read line by line. Check the names, marks and descriptions.'] : [] };
}

// ---- PDF: the text of a PDF has positions but no table, so the columns are found from where the text sits.
type Cell = { x: number; x2: number; y: number; text: string; page: number };
type Line = { y: number; page: number; cells: Cell[] };
const HEADER_WORDS = /penuh|full mark|diperoleh|obtained|penerangan|description|elemen|bil\b|\bno\b/i;

function buildLines(pages: PdfPage[]): Line[] {
  const lines: Line[] = [];
  pages.forEach((page, pageIndex) => {
    const sorted = page.cells.filter((cell) => cell.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
    let current: PdfCell[] = [], currentY = -1e9;
    const flush = () => {
      if (!current.length) return;
      const ordered = [...current].sort((a, b) => a.x - b.x);
      const cells: Cell[] = [];
      for (const piece of ordered) {
        const last = cells[cells.length - 1];
        if (last && piece.x - last.x2 < 4) { last.text += (piece.x - last.x2 > 0.8 || /\s$/.test(last.text) ? ' ' : '') + piece.str.trim(); last.x2 = piece.x + piece.w; }
        else cells.push({ x: piece.x, x2: piece.x + piece.w, y: piece.y, text: piece.str.trim(), page: pageIndex });
      }
      lines.push({ y: current.reduce((sum, c) => sum + c.y, 0) / current.length, page: pageIndex, cells });
      current = [];
    };
    for (const cell of sorted) { if (current.length && Math.abs(cell.y - currentY) > 2.6) flush(); current.push(cell); currentY = current.length === 1 ? cell.y : currentY; }
    flush();
  });
  return lines;
}
const centre = (cell: Cell) => (cell.x + cell.x2) / 2;
const clusterBy = <T,>(entries: T[], position: (entry: T) => number, tolerance: number) => {
  const groups: { at: number; entries: T[] }[] = [];
  for (const entry of [...entries].sort((a, b) => position(a) - position(b))) {
    const group = groups[groups.length - 1];
    if (group && position(entry) - group.at <= tolerance) { group.entries.push(entry); group.at = group.entries.reduce((sum, e) => sum + position(e), 0) / group.entries.length; }
    else groups.push({ at: position(entry), entries: [entry] });
  }
  return groups;
};
const sentenceEnd = /[.:;!?)]$/;

export function fromPdf(pages: PdfPage[], fallbackName = ''): Imported {
  const lines = buildLines(pages);
  if (lines.length < 3) return { name: fallbackName, items: [], notes: ['This PDF has no readable text (it may be a scan or a picture). Use an Excel or Word version, or Add template.'] };
  // A heading line: two or more short cells that read like column headings (and no numbers, which a heading does not have).
  const isHeader = (line: Line) => line.cells.filter((cell) => HEADER_WORDS.test(cell.text) && cell.text.length < 40).length >= 2
    || (!line.cells.some((cell) => /^\d+(?:[.,]5)?$/.test(cell.text)) && new Set(line.cells.filter((cell) => cell.text.length < 45).map((cell) => roleOf(cell.text)).filter(Boolean)).size >= 2);
  const numeric = lines.flatMap((line) => line.cells.filter((cell) => /^\d{1,3}(?:[.,]5)?$/.test(cell.text) && !isHeader(line)).map((cell) => ({ cell, line, value: Number(cell.text.replace(',', '.')) })));
  const groups = clusterBy(numeric, (entry) => centre(entry.cell), 12).filter((group) => group.entries.length >= 3);
  const ordered = (entries: typeof numeric) => [...entries].sort((a, b) => a.line.page - b.line.page || a.line.y - b.line.y);
  const isSequence = (entries: typeof numeric) => { const values = ordered(entries).map((entry) => entry.value); if (values.length < 3) return false; let steps = 0; for (let i = 1; i < values.length; i++) if (values[i] === values[i - 1] + 1) steps++; return steps / (values.length - 1) >= 0.7; };
  const noGroup = groups.find((group) => isSequence(group.entries));
  if (!noGroup) return { ...fromLines(lines.map((line) => line.cells.map((cell) => cell.text).join(' ')), fallbackName), notes: ['The PDF has no numbered table, so it was read line by line. Check everything carefully.'] };
  const noX = noGroup.at;

  // The column of full marks: the numeric column to the right of the numbers, nearest the "full mark" heading if there is one.
  const headerLines = lines.filter(isHeader);
  const maxHeading = headerLines.flatMap((line) => line.cells).find((cell) => /penuh|full|max/i.test(cell.text) && !HEAD.got.test(cell.text));
  const rightGroups = groups.filter((group) => group !== noGroup && group.at > noX + 20);
  if (!rightGroups.length) return { name: fallbackName, items: [], notes: ['No column of full marks was found in the PDF table.'] };
  const maxGroup = maxHeading ? rightGroups.reduce((best, group) => Math.abs(group.at - centre(maxHeading)) < Math.abs(best.at - centre(maxHeading)) ? group : best) : rightGroups.reduce((best, group) => group.entries.length > best.entries.length ? group : best);
  const maxX = maxGroup.at;

  // The item numbers, in order (1, 2, 3 ...). Anything else in that column is not an item.
  const anchors: { line: Line; cell: Cell; value: number }[] = [];
  for (const entry of ordered(noGroup.entries)) { const last = anchors[anchors.length - 1]; if (!last ? entry.value <= 3 : entry.value === last.value + 1) anchors.push({ line: entry.line, cell: entry.cell, value: entry.value }); }
  if (anchors.length < 2) return { name: fallbackName, items: [], notes: ['Fewer than two numbered items were found in the PDF.'] };
  const key = (line: { page: number; y: number }) => line.page * 100000 + line.y;
  const first = key(anchors[0].line);

  // Body text: left of the marks, right of the numbers; headings, footers and what follows the table are left out.
  const stop = /^(jumlah|total|prestasi|keputusan|result|outcome|tandatangan|signature|nama penilai|assessor)/i;
  let endKey = Infinity;
  for (const line of lines) if (key(line) > key(anchors[anchors.length - 1].line) && stop.test(line.cells[0]?.text || '')) { endKey = key(line); break; }
  const body = lines.filter((line) => !isHeader(line) && key(line) < endKey && !/^page \d+/i.test(line.cells[0]?.text || '')).flatMap((line) => line.cells.filter((cell) => cell.x > noX + 8 && cell.x2 < maxX - 6 && !(Math.abs(centre(cell) - noX) < 12 && /^\d+$/.test(cell.text))).map((cell) => ({ cell, line })));
  const starts = clusterBy(body, (entry) => entry.cell.x, 10).filter((group) => group.entries.length >= 2).sort((a, b) => a.at - b.at);
  const nameX = starts[0]?.at ?? noX + 10;
  // The description column is the next one to the right that holds a fair share of the text.
  const descStart = starts.slice(1).find((group) => group.entries.length >= Math.max(2, starts[0] ? starts[0].entries.length * 0.4 : 2) && group.at > nameX + 25);
  const descX = descStart?.at ?? Infinity;

  // Where one item ends and the next begins. A PDF keeps no row borders, so this is worked out from the item numbers: in a table whose cells are top aligned each
  // item starts on the line of its number; when they are centred, the number sits in the middle of the item's lines, so each item has as many lines above its number as below.
  const lowerBound = Math.max(-Infinity, ...headerLines.filter((line) => key(line) < first).map((line) => key(line)));
  const bodyKeys = [...new Set([...body.map((entry) => key(entry.line)), ...anchors.map((anchor) => key(anchor.line))])].filter((k) => k > (Number.isFinite(lowerBound) ? lowerBound : first - 60)).sort((a, b) => a - b);
  const at = anchors.map((anchor) => bodyKeys.indexOf(key(anchor.line)));
  // Centred if lines sit above the first number, or if a number sits on a line of its own (between two lines of text, as with a name that wraps).
  const centred = at[0] > 0 || anchors.some((anchor) => !body.some((entry) => entry.line === anchor.line));
  const pageOf = (k: number) => Math.floor(k / 100000);
  const cuts: number[] = [];
  // Centred cells: an item runs from the previous cut to as far below its number as it began above it, so its end is 2 x (number's position) - (its start);
  // that is moved to the nearest gap between lines. A new page starts a new item run.
  let top = (bodyKeys[0] ?? first) - 5;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = key(anchors[i].line), b = key(anchors[i + 1].line);
    if (!centred) { cuts.push(b - 0.5); continue; }
    if (pageOf(a) !== pageOf(b)) {
      cuts.push(Math.max(...bodyKeys.filter((k) => pageOf(k) === pageOf(a))) + 0.5);
      top = Math.min(...bodyKeys.filter((k) => pageOf(k) === pageOf(b))) - 5;
      continue;
    }
    const lines = bodyKeys.filter((k) => k >= a && k < b);
    const gaps = lines.map((k, j) => (k + (lines[j + 1] ?? b)) / 2);
    const predicted = 2 * a - top;
    const cut = gaps.reduce((best, gap) => Math.abs(gap - predicted) < Math.abs(best - predicted) ? gap : best, gaps[0]);
    cuts.push(cut); top = cut;
  }
  const items: TemplateItem[] = [];
  const notes: string[] = [];
  anchors.forEach((anchor, index) => {
    const from = index === 0 ? -Infinity : cuts[index - 1], to = index === anchors.length - 1 ? Infinity : cuts[index];
    const mine = body.filter((entry) => key(entry.line) > from && key(entry.line) <= to);
    const name = mine.filter((entry) => entry.cell.x < descX - 6).sort((a, b) => key(a.line) - key(b.line) || a.cell.x - b.cell.x).map((entry) => entry.cell.text).join(' ').replace(/\s+/g, ' ').trim();
    const points: string[] = [];
    for (const entry of mine.filter((e) => e.cell.x >= descX - 6).sort((a, b) => key(a.line) - key(b.line) || a.cell.x - b.cell.x)) {
      const text = entry.cell.text.replace(BULLET, '').trim();
      const last = points[points.length - 1];
      if (last !== undefined && !sentenceEnd.test(last) && !BULLET.test(entry.cell.text) && !/^\d+[.)]\s/.test(text)) points[points.length - 1] = /\p{L}-$/u.test(last) && /^\p{L}/u.test(text) ? `${last}${text}` : `${last} ${text}`; else points.push(text);
    }
    const markEntry = ordered(maxGroup.entries).filter((entry) => key(entry.line) > from && key(entry.line) <= to).sort((a, b) => Math.abs(key(a.line) - key(anchor.line)) - Math.abs(key(b.line) - key(anchor.line)))[0];
    const max = markEntry ? toMark(markEntry.cell.text) : null;
    if (!name) { notes.push(`Item ${anchor.value}: no name was found.`); }
    if (max === null) notes.push(`Item ${anchor.value}${name ? ` "${name.slice(0, 40)}"` : ''} had no full mark, so 5 was used. Please set it.`);
    items.push({ name: (name || `Item ${anchor.value}`).slice(0, 200), points: points.slice(0, 10), max: max ?? 5 });
  });
  // A title for the template: the first line above the table that does not look like a field ("Name:", "Date:").
  const title = lines.filter((line) => line.page === 0 && key(line) < first && !isHeader(line)).map((line) => line.cells.map((cell) => cell.text).join(' ')).find((text) => text.length >= 8 && text.length <= 120 && !LABEL.test(text) && !/:/.test(text) && !/^page /i.test(text));
  notes.unshift('Read from the PDF text. Check each item name, description and full mark against the form.');
  return { name: title || fallbackName, items, notes };
}
