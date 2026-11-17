// Run: npx tsx scripts/template-import.test.ts
// Checks the template import (Excel, CSV, Word, pasted lines, and PDFs with real text). The PDF checks make PDFs with headless Chrome and are skipped when Chrome is not installed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { ASSISTANT_ITEMS } from '../src/lib/assistantReview';
import { fromLines, fromPdf, fromTable, toMark } from '../src/lib/templateImport';
import { parseCsv, readDocx, readPdfPages, readXlsx } from '../src/lib/templateFiles';

// toMark
assert.equal(toMark('5'), 5); assert.equal(toMark('(6 markah)'), 6); assert.equal(toMark('4,5'), 4.5); assert.equal(toMark('10%'), 10);
assert.equal(toMark('0'), null); assert.equal(toMark('101'), null); assert.equal(toMark('4.3'), null); assert.equal(toMark('abc'), null);

// A table with Malay headings, an item whose description runs on in rows below it, a total row, and a marks-obtained column that must be ignored.
const table = [
  ['Penilaian Bulanan'], [],
  ['BIL', 'ELEMEN PENILAIAN TUGAS', 'PENERANGAN PENILAIAN TUGAS', 'MARKAH PENUH', 'MARKAH DIPEROLEHI'],
  ['1', 'Cara Pendaftaran', 'Mahir mendaftar pesakit.', '5', ''],
  ['', '', 'Memahami smartcard reader.', '', ''],
  ['2', 'Buffer & Petty Cash', 'Faham konsep buffer.', '6', ''],
  ['', 'Jumlah', '', '11', ''],
];
let result = fromTable(table, 'File name');
assert.deepEqual(result.items, [{ name: 'Cara Pendaftaran', points: ['Mahir mendaftar pesakit.', 'Memahami smartcard reader.'], max: 5 }, { name: 'Buffer & Petty Cash', points: ['Faham konsep buffer.'], max: 6 }]);
// English headings, a heading row without a mark, an item with no mark, items numbered inside the name
result = fromTable([['No', 'Criteria', 'Description', 'Weightage', 'Score'], ['', 'SECTION A', '', '', ''], ['1', '1. Punctuality', '', '10', ''], ['2', 'Teamwork', 'Helps others', '', '']], 'x');
assert.deepEqual(result.items.map((item) => [item.name, item.max]), [['Punctuality', 10], ['Teamwork', 5]]);
assert.ok(result.notes.some((note) => /Teamwork/.test(note)) && result.notes.some((note) => /heading/.test(note)));
// No heading at all: the column of small numbers is the marks, the longest text is the item
result = fromTable([['1', 'Cara menyediakan temujanji pesakit', '5'], ['2', 'Prosedur nebulisasi dan penyediaan ubat', '5'], ['3', 'Penyediaan ECG', '6']], 'x');
assert.deepEqual(result.items.map((item) => [item.name, item.max]), [['Cara menyediakan temujanji pesakit', 5], ['Prosedur nebulisasi dan penyediaan ubat', 5], ['Penyediaan ECG', 6]]);
assert.ok(result.notes.some((note) => /guessed/.test(note)));
assert.equal(fromTable([['a', 'b'], ['c', 'd']], 'x').items.length, 0);

// Lines
result = fromLines(['Quality of work (10 marks)', 'Spots problems early', '2. Teamwork - 20', 'Attendance | 5', 'Jumlah (100)', '']);
assert.deepEqual(result.items.map((item) => [item.name, item.max, item.points.length]), [['Quality of work', 10, 1], ['Teamwork', 20, 0], ['Attendance', 5, 0]]);

// CSV: quotes, a comma and a line break inside a cell, and a semicolon file
assert.deepEqual(parseCsv('a,"b, c","d ""q"""\n1,2,3\n'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
assert.deepEqual(parseCsv('a;b;c\r\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']]);
assert.deepEqual(parseCsv('x,"line1\nline2"\n')[0], ['x', 'line1\nline2']);

// Excel: shared strings, inline strings, empty cells in between
const xlsx = zipSync({
  'xl/sharedStrings.xml': strToU8('<sst><si><t>Item</t></si><si><t>Max &amp; min</t></si><si><r><t>Part </t></r><r><t>two</t></r></si></sst>'),
  'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Row 2</t></is></c><c r="B2"><v>7</v></c><c r="C2" t="s"><v>2</v></c></row></sheetData></worksheet>'),
});
assert.deepEqual(readXlsx(xlsx), [['Item', '', 'Max & min'], ['Row 2', '7', 'Part two']]);

// Word: a table with a merged cell, a cell with two paragraphs, a spanned cell, and a title outside the table
const cell = (...paragraphs: string[]) => `<w:tc>${paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('')}</w:tc>`;
const docx = zipSync({ 'word/document.xml': strToU8(`<w:document><w:body><w:p><w:r><w:t>MONTHLY ASSESSMENT FORM</w:t></w:r></w:p><w:tbl>
  <w:tr>${cell('Bil')}${cell('Item')}${cell('Description')}${cell('Full mark')}</w:tr>
  <w:tr>${cell('1')}${cell('Registration')}${cell('Registers patients', 'Uses the card reader')}${cell('5')}</w:tr>
  <w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc>${cell('')}${cell('5')}</w:tr></w:tbl></w:body></w:document>`) });
const word = readDocx(docx);
assert.deepEqual(word.paragraphs, ['MONTHLY ASSESSMENT FORM']);
assert.deepEqual(word.tables[0][1], ['1', 'Registration', 'Registers patients\nUses the card reader', '5']);
result = fromTable(word.tables[0], 'x');
assert.deepEqual(result.items, [{ name: 'Registration', points: ['Registers patients', 'Uses the card reader'], max: 5 }]);

// PDFs with real text, made by headless Chrome
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) console.log('PDF checks skipped: Chrome is not installed.');
else {
  const pdfjs = createRequire(import.meta.url)('pdfjs-dist/legacy/build/pdf.js');
  const dir = mkdtempSync(join(tmpdir(), 'template-import-'));
  const makePdf = (name: string, body: string) => {
    writeFileSync(join(dir, `${name}.html`), `<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:14mm 12mm}body{font:8pt Arial}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:.25mm solid #000;padding:1mm 1.5mm;font-size:7pt}tr{page-break-inside:avoid}thead{display:table-header-group}</style>${body}`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${join(dir, name)}.pdf`, `file://${join(dir, name)}.html`], { stdio: 'ignore', timeout: 60000 });
    return readPdfPages(pdfjs, new Uint8Array(readFileSync(join(dir, `${name}.pdf`))));
  };
  const form = (align: string) => `<h2>PENILAIAN BULANAN PEMBANTU KLINIK</h2><p>Nama Pekerja : ____</p><table><colgroup><col style="width:9mm"><col style="width:40mm"><col style="width:82mm"><col style="width:22mm"><col style="width:27mm"></colgroup><thead><tr><th>BIL</th><th>ELEMEN PENILAIAN TUGAS</th><th>PENERANGAN PENILAIAN TUGAS</th><th>MARKAH PENUH</th><th>MARKAH DIPEROLEHI</th></tr></thead><tbody>${ASSISTANT_ITEMS.map((item, index) => item.points.map((point, at) => `<tr>${at === 0 ? `<td rowspan="${item.points.length}" style="vertical-align:${align}">${index + 1}</td><td rowspan="${item.points.length}" style="vertical-align:${align}">${item.name.toUpperCase()}</td>` : ''}<td>${point}</td>${at === 0 ? `<td rowspan="${item.points.length}" style="vertical-align:${align}">${item.max}</td><td rowspan="${item.points.length}"></td>` : ''}</tr>`).join('')).join('')}</tbody></table><p>Jumlah Markah : ____</p>`;
  for (const align of ['top', 'middle']) {
    const read = fromPdf(await makePdf(`form-${align}`, form(align)), 'fallback');
    assert.equal(read.name, 'PENILAIAN BULANAN PEMBANTU KLINIK');
    assert.equal(read.items.length, ASSISTANT_ITEMS.length, `${align}: item count`);
    read.items.forEach((item, index) => {
      assert.equal(item.name.toLowerCase(), ASSISTANT_ITEMS[index].name.toLowerCase(), `${align}: name ${index + 1}`);
      assert.equal(item.max, ASSISTANT_ITEMS[index].max, `${align}: mark ${index + 1}`);
      assert.deepEqual(item.points, ASSISTANT_ITEMS[index].points, `${align}: points ${index + 1}`);
    });
  }
  const plain = fromPdf(await makePdf('plain', `<h2>Staff Appraisal Form</h2><p>Name: ____</p><table><thead><tr><th>No.</th><th>Criteria</th><th>Weightage</th><th>Score</th></tr></thead><tbody>${['Punctuality', 'Teamwork and communication with the rest of the clinic staff', 'Patient handling'].map((name, index) => `<tr><td>${index + 1}</td><td>${name}</td><td>${[10, 40, 50][index]}</td><td></td></tr>`).join('')}<tr><td></td><td>Total</td><td>100</td><td></td></tr></tbody></table>`), 'x');
  assert.deepEqual(plain.items.map((item) => [item.name, item.max]), [['Punctuality', 10], ['Teamwork and communication with the rest of the clinic staff', 40], ['Patient handling', 50]]);
  assert.equal(plain.name, 'Staff Appraisal Form');
  assert.equal(fromPdf([{ cells: [] }], 'scan').items.length, 0);
  assert.match(fromPdf([{ cells: [] }], 'scan').notes[0], /no readable text/);
  console.log('PDF checks passed.');
}
console.log('template-import: all checks passed.');
