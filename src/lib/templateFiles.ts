import { strFromU8, unzipSync } from 'fflate';
import { fromLines, fromPdf, fromTable, type Imported, type PdfPage } from './templateImport';

// Reads the file HR chose (Excel .xlsx, CSV, Word .docx or a PDF with real text) in the browser and hands it to the template reader.
// The file never leaves the computer.
const decode = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, '&');
const columnOf = (reference: string) => { let n = 0; for (const letter of reference.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + letter.charCodeAt(0) - 64; return n - 1; };

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const first = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (char === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += char; }
    else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && source[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function readXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes);
  const shared: string[] = [];
  const sharedFile = files['xl/sharedStrings.xml'];
  if (sharedFile) for (const item of strFromU8(sharedFile).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(decode([...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((piece) => piece[1]).join('')));
  const sheetName = files['xl/worksheets/sheet1.xml'] ? 'xl/worksheets/sheet1.xml' : Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
  if (!sheetName) throw new Error('This Excel file has no sheet to read.');
  const rows: string[][] = [];
  for (const rowMatch of strFromU8(files[sheetName]).matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const cellMatch of (rowMatch[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1], inner = cellMatch[2] || '';
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1] || '';
      const type = /\bt="(\w+)"/.exec(attributes)?.[1] || 'n';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
      const value = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((piece) => piece[1]).join('')) : decode(raw);
      const col = reference ? columnOf(reference) : row.length;
      while (row.length < col) row.push('');
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

export function readDocx(bytes: Uint8Array): { tables: string[][][]; paragraphs: string[] } {
  const document = unzipSync(bytes)['word/document.xml'];
  if (!document) throw new Error('This is not a Word (.docx) file.');
  const xml = strFromU8(document);
  const paragraphText = (fragment: string) => decode(fragment.replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, '\n').replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<\/w:p>/g, (hit, text) => text === undefined ? '\n' : text).replace(/<[^>]+>/g, '')).replace(/\n+$/, '');
  const tables: string[][][] = [];
  for (const table of xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    const rows: string[][] = [];
    for (const rowMatch of table[1].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const row: string[] = [];
      for (const cellMatch of rowMatch[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
        row.push(paragraphText(cellMatch[1]).replace(/\n{2,}/g, '\n').trim());
        const span = Number(/<w:gridSpan w:val="(\d+)"/.exec(cellMatch[1])?.[1] || 1);
        for (let extra = 1; extra < span; extra++) row.push('');
      }
      rows.push(row);
    }
    tables.push(rows);
  }
  const outside = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
  const paragraphs = [...outside.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => paragraphText(match[0]).trim()).filter(Boolean);
  return { tables, paragraphs };
}

// `pdfjs` is the pdf.js module (the app loads it only when a PDF is chosen).
export async function readPdfPages(pdfjs: any, bytes: Uint8Array): Promise<PdfPage[]> {
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pages: PdfPage[] = [];
  for (let number = 1; number <= Math.min(pdf.numPages, 30); number++) {
    const page = await pdf.getPage(number);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    pages.push({ cells: content.items.filter((item: any) => typeof item.str === 'string').map((item: any) => ({ str: item.str, x: item.transform[4], y: height - item.transform[5], w: item.width })) });
  }
  return pages;
}

const MAX_BYTES = 10 * 1024 * 1024;
export async function importTemplateFile(file: File): Promise<Imported> {
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 10 MB. Use a smaller file.');
  const extension = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] || '').toLowerCase();
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let result: Imported;
  if (extension === 'csv' || extension === 'txt') {
    const text = new TextDecoder().decode(bytes);
    result = extension === 'txt' ? fromLines(text.split(/\r?\n/), baseName) : fromTable(parseCsv(text), baseName);
  } else if (extension === 'xlsx') {
    result = fromTable(readXlsx(bytes), baseName);
  } else if (extension === 'docx') {
    const { tables, paragraphs } = readDocx(bytes);
    const attempts = tables.map((rows) => fromTable(rows, baseName));
    const best = attempts.sort((a, b) => b.items.length - a.items.length)[0];
    result = best && best.items.length ? best : fromLines(paragraphs, baseName);
    const title = paragraphs.find((line) => line.length >= 8 && line.length <= 120 && !/:/.test(line));
    if (title && result.items.length) result = { ...result, name: title };
  } else if (extension === 'pdf') {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    result = fromPdf(await readPdfPages(pdfjs, bytes), baseName);
  } else if (extension === 'xls' || extension === 'doc') {
    throw new Error(`Old ${extension.toUpperCase()} files cannot be read. Save it as ${extension === 'xls' ? 'Excel (.xlsx)' : 'Word (.docx)'} or PDF first.`);
  } else {
    throw new Error('Choose an Excel (.xlsx), CSV, Word (.docx) or PDF file.');
  }
  if (!result.items.length) throw new Error(result.notes[0] || 'No items with marks were found in that file.');
  return { ...result, items: result.items.slice(0, 60), notes: result.items.length > 60 ? [...result.notes, 'Only the first 60 items were taken.'] : result.notes };
}
