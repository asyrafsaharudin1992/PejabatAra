// Reads a duty roster PDF made like the clinic assistants' sheet ("JADUAL STAFF KJ ... DECEMBER": one row for each date, two columns for each person,
// the shift code and the hours, the person's name above both columns). It needs a PDF with real text (made from Excel or from AraOffice), not a scan.
// The names on the sheet are short names, so the page asks who each one is before anything is saved.
export type TextItem = { str: string; x: number; y: number; w?: number };
export type RosterPdfDay = { date: string; shift: string };
export type RosterPdfColumn = { name: string; days: RosterPdfDay[] };
export type RosterPdfNotes = { request: string; remarks: string };
export type RosterPdfResult = { company: string; month: string; columns: RosterPdfColumn[]; skipped: { name: string; date: string; text: string }[]; notes: RosterPdfNotes };

// Codes the roster knows (the same list as the on-screen editor, plus the other leave codes the importer accepts).
export const ROSTER_PDF_CODES = new Set(['AM-9', 'AM-12', 'AM-6', 'AM-5', 'PM', 'OFF', 'REST', 'AM', 'OH', 'PH', 'NA', 'RESIGN', 'AL', 'UPL', 'MC', 'ML', 'EL']);

// What a cell says -> a roster code. A * only marks a request (OFF*, *OFF, REST*), and AM-9 (AL) means the day is annual leave. Anything else returns '' (not understood).
export function cleanShift(text: string): string {
  const raw = text.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const leave = raw.match(/\((AL|UPL|MC|ML|EL)\)/);
  if (leave) return leave[1];
  const code = raw.replace(/\*/g, '').trim();
  return ROSTER_PDF_CODES.has(code) ? code : '';
}

const toIso = (text: string) => { const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

// The panel to the right of the table: the code list, then Request staff (lines like "NAJWA : 1/12, 2/12 (AL)"), then boxes for probation, training, locum and remarks.
// Public holidays, resignations and overtime are not read: AraOffice already has them. The page lets the person edit what was read.
const LEGEND_CODES = new Set(['AM-5', 'AM-6', 'AM-9', 'AM-12', 'PM', 'OFF 1ST', 'OFF 2ND', 'REST', 'ML', 'AL', 'UPL', 'MC', 'PM + ELAUN RM 8']);
export function readPanelNotes(items: TextItem[], tableRight: number, topY: number, bottomY: number): RosterPdfNotes {
  const panel = items.filter((item) => item.x >= tableRight && item.y <= topY + 3 && item.y >= bottomY - 3);
  const rows: { y: number; cells: TextItem[] }[] = [];
  for (const item of panel) { const row = rows.find((r) => Math.abs(r.y - item.y) <= 2.5); if (row) row.cells.push(item); else rows.push({ y: item.y, cells: [item] }); }
  rows.sort((a, b) => b.y - a.y);
  const request: string[] = [], remarks: string[] = [];
  let section = 'legend';
  const HEADINGS: Record<string, string> = { 'STAFF (TRAINING PROBATION)': 'probation', TRAINING: 'training', 'CUTI UMUM': 'holiday', 'LOCUM / PART TIME': 'locum', REMARKS: 'remarks', 'OVERTIME (OT)': 'overtime' };
  for (const row of rows) {
    if (row.cells.some((item) => /^STAFF RESIGN$/i.test(item.str))) continue;   // resignations come from the staff profiles
    const cells = row.cells.sort((a, b) => a.x - b.x).map((item) => item.str).filter((text) => !/^REQUEST STAFF|^CREDIT HOUR$|^STAFF RESIGN$|^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d{4}$/i.test(text));
    if (!cells.length) continue;
    const heading = HEADINGS[cells[0].toUpperCase()];
    if (heading && cells.length === 1) { section = heading; continue; }
    const line = cells.join(' : ').replace(/ : (?=\S+ ?:)/, ' ');
    if (section === 'legend') { if (LEGEND_CODES.has(cells[0].toUpperCase())) continue; if (/^[A-Z][A-Z .'\/]*[A-Z] ?: ?\d/.test(cells[0])) request.push(cells[0]); continue; }
    if (section === 'holiday' || section === 'overtime') continue;
    if (/^SPB |RESIGN/i.test(cells[0])) continue;
    remarks.push(section === 'probation' || section === 'remarks' ? line : `${section.toUpperCase()}: ${line}`);
  }
  return { request: request.join('\n'), remarks: remarks.join('\n') };
}


// The doctors' sheet made by Roster draft (JADUAL KLINIK ARA 24 JAM ... RESIDEN/LOCUM): one row per day, the columns are the shifts (9-6PM OH, AM, PM, OFF) and the cells hold a letter
// for each doctor (A: DR LUQMAN B: DR HAZIQ ... is written under the title). Locum names, the locum column and "-" are not people on the roster and are left out; the days of the previous
// month are the live roster already, so they are not read again.
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export function parseDoctorSheetItems(all: TextItem[]): RosterPdfResult {
  const text = all.map((item) => item.str).join(' ');
  const title = text.match(new RegExp(`(${MONTHS.join('|')}) (\\d{4})`, 'i'));
  if (!title) throw new Error('The month of the sheet was not found in its title.');
  const sheetMonth = MONTHS.indexOf(title[1].toUpperCase()) + 1, sheetYear = Number(title[2]);
  const legend = new Map<string, string>();
  for (const match of text.matchAll(/\b([A-Z]):\s*DR\s+([A-Z][A-Z'.]*)/g)) legend.set(match[1], match[2]);
  if (!legend.size) throw new Error('The doctors under the title (A: DR NAME ...) were not found.');
  const header = all.find((item) => /^REMARK$/i.test(item.str));
  if (!header) throw new Error('The column titles (AM, PM, OFF, REMARK) were not found.');
  const columnItems = all.filter((item) => Math.abs(item.y - header.y) <= 2.5);
  // The title of the office-hour column is often split by the PDF into pieces ("9", "-", "6PM OH"), so any piece ending in OH (or the whole 9-6PM) is that column.
  const kind = (str: string) => /9-[46]PM|\bOH\b/i.test(str) ? 'OH' : /^AM\*?$/i.test(str) ? 'AM' : /^PM\*?$/i.test(str) ? 'PM' : /^OFF$/i.test(str) ? 'OFF' : /LOCUM/i.test(str) ? 'LOCUM' : /REMARK/i.test(str) ? 'REMARK' : '';
  const heads = columnItems.map((item) => ({ code: kind(item.str), x: item.x + (item.w ?? item.str.length * 3) / 2 })).filter((head) => head.code);
  if (!heads.some((head) => head.code === 'AM') || !heads.some((head) => head.code === 'OFF')) throw new Error('The column titles (AM, PM, OFF) were not found.');
  const company = /\bKJ\b|KAJANG/i.test(text) ? 'KJ' : /\bSK\b|KEMBANGAN/i.test(text) ? 'SK' : '';
  const dateItems = all.filter((item) => /^\d{1,2}\/\d{1,2}$/.test(item.str) && item.y < header.y);
  const people = new Map<string, RosterPdfColumn>(); const skipped: RosterPdfResult['skipped'] = [];
  const add = (letter: string, date: string, shift: string) => { const name = legend.get(letter); if (!name) return; const column = people.get(name) || { name, days: [] }; people.set(name, column); column.days = column.days.filter((day) => day.date !== date); column.days.push({ date, shift }); };
  const letters = new Set(legend.keys());
  for (const dateItem of dateItems) {
    const [day, month] = dateItem.str.split('/').map(Number);
    const diff = month - sheetMonth, year = diff > 6 ? sheetYear - 1 : diff < -6 ? sheetYear + 1 : sheetYear;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const row = all.filter((item) => Math.abs(item.y - dateItem.y) <= 2.5 && item.x > dateItem.x + 8);
    if (row.some((item) => /\(prev\. month\)/i.test(item.str))) continue;
    const cells = new Map<string, string[]>(); let remark = '';
    for (const item of row.sort((a, b) => a.x - b.x)) {
      const mid = item.x + (item.w ?? item.str.length * 3) / 2;
      const nearest = heads.reduce((best, head) => Math.abs(head.x - mid) < Math.abs(best.x - mid) ? head : best, heads[0]);
      if (nearest.code === 'REMARK') remark += ` ${item.str}`; else cells.set(nearest.code, [...(cells.get(nearest.code) || []), item.str]);
    }
    for (const code of ['OH', 'AM', 'PM', 'OFF']) {
      for (const raw of (cells.get(code) || []).join(' ').split(/[,.\s]+/).map((token) => token.replace(/\*/g, '')).filter(Boolean)) {
        if (raw === '-' || /^LOCUM$/i.test(raw)) continue;
        // A single letter, or letters written together (AB*): doctors; anything else is a locum's name.
        if ([...raw].every((char) => letters.has(char)) && raw.length <= letters.size) for (const letter of raw) add(letter, date, code);
      }
    }
    // "B AL" in the remark: that doctor is on leave that day (a plan only; the leave itself still follows the leave application).
    for (const match of remark.matchAll(/\b([A-Z]) (AL|MC|UPL|ML|EL)\b/g)) add(match[1], date, match[2]);
  }
  const columns = [...people.values()].filter((column) => column.days.length).map((column) => ({ ...column, name: column.name.toUpperCase() }));
  if (!columns.length) throw new Error('No doctor days were found on this sheet.');
  return { company, month: `${sheetYear}-${String(sheetMonth).padStart(2, '0')}`, columns, skipped, notes: { request: '', remarks: '' } };
}

// Works on the text items of one page (x across, y up the page, as pdf.js gives them), so it can be tested without a browser.
export function parseRosterItems(items: TextItem[]): RosterPdfResult {
  const all = items.map((item) => ({ ...item, str: item.str.trim() })).filter((item) => item.str);
  if (/RESIDEN\/LOCUM/i.test(all.map((item) => item.str).join(' '))) return parseDoctorSheetItems(all);
  const dateItems = all.filter((item) => toIso(item.str));
  if (!dateItems.length) throw new Error('No dates (like 23/11/2026) were found. This does not look like a duty roster sheet, or the PDF is a scan.');
  const dateX = Math.max(...dateItems.map((item) => item.x));
  const firstY = Math.max(...dateItems.map((item) => item.y));
  // The names sit in the row just above the first date: words that are not a date, a number or a day, to the right of the date column.
  const DAY = /^(MON|TUE|WED|THU|FRI|SAT|SUN|DATE|DAY)$/;
  const above = all.filter((item) => item.y > firstY && item.y < firstY + 40 && item.x > dateX + 30 && !/^[0-9]+$/.test(item.str) && !DAY.test(item.str.toUpperCase()) && !toIso(item.str));
  const headerY = above.length ? Math.max(...above.map((item) => item.y)) : 0;
  // Sheets sometimes have a title band above the names: the names row is the one under it that holds the most single words.
  const rows = new Map<number, typeof above>();
  for (const item of above) { const key = [...rows.keys()].find((y) => Math.abs(y - item.y) <= 2) ?? item.y; rows.set(key, [...(rows.get(key) || []), item]); }
  const nameRow = [...rows.entries()].filter(([, row]) => row.length >= 2).sort((a, b) => a[0] - b[0])[0] || [headerY, above.filter((item) => Math.abs(item.y - headerY) <= 2)];
  // The table ends at the last hours number (a plain number only appears inside the table); anything to the right, like the legend of codes, is not a person.
  const hoursX = all.filter((item) => /^[0-9]+$/.test(item.str) && dateItems.some((d) => Math.abs(d.y - item.y) <= 2.5)).map((item) => item.x);
  const tableRight = hoursX.length ? Math.max(...hoursX) + 8 : Infinity;
  const names = [...nameRow[1]].filter((item) => item.x < tableRight - 4).sort((a, b) => a.x - b.x);
  if (!names.length) throw new Error('The names of the staff above the dates were not found.');
  // Each name is centred over its two columns (code and hours): a column belongs to the nearest name.
  const centres = names.map((item) => item.x + (item.w ?? item.str.length * 3) / 2);
  const company = /KAJANG|\bKJ\b/i.test(all.map((item) => item.str).join(' ')) ? 'KJ' : /KEMBANGAN|\bSK\b/i.test(all.map((item) => item.str).join(' ')) ? 'SK' : '';
  const columns: RosterPdfColumn[] = names.map((item) => ({ name: item.str.toUpperCase(), days: [] }));
  const skipped: RosterPdfResult['skipped'] = [];
  for (const dateItem of dateItems) {
    const date = toIso(dateItem.str);
    const row = all.filter((item) => Math.abs(item.y - dateItem.y) <= 2.5 && item.x > dateItem.x + 25 && item.x < tableRight && !/^[0-9]+$/.test(item.str) && !DAY.test(item.str.toUpperCase()));
    for (let index = 0; index < columns.length; index++) {
      const cell = row.filter((item) => { const mid = item.x + (item.w ?? item.str.length * 3) / 2, c = centres.reduce((best, value, i) => Math.abs(value - mid) < Math.abs(centres[best] - mid) ? i : best, 0); return c === index; }).sort((a, b) => a.x - b.x).map((item) => item.str).join(' ');
      if (!cell) continue;   // a blank (black) cell means no schedule: the usual working week applies
      const shift = cleanShift(cell);
      if (shift) columns[index].days.push({ date, shift }); else skipped.push({ name: columns[index].name, date, text: cell });
    }
  }
  // The month the sheet is for: the one most of its dates fall in (the first and last weeks run into the next and the previous month).
  const counts = new Map<string, number>(); for (const item of dateItems) { const key = toIso(item.str).slice(0, 7); counts.set(key, (counts.get(key) || 0) + 1); }
  const month = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bottomY = Math.min(...dateItems.map((item) => item.y));
  return { company, month, columns: columns.filter((column) => column.days.length), skipped, notes: readPanelNotes(all, tableRight, firstY, bottomY) };
}

// Opens the PDF in the browser (pdf.js is loaded only now) and reads it. A staff sheet is one page; the doctors' sheet (RESIDEN/LOCUM) may run over several pages
// (a month is more than 40 rows), so every page is read and the days are put together by doctor.
export async function readRosterPdf(file: File): Promise<RosterPdfResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const itemsOf = async (number: number): Promise<TextItem[]> => {
    const content = await (await pdf.getPage(number)).getTextContent();
    return (content.items as any[]).filter((item) => typeof item.str === 'string').map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width }));
  };
  const firstItems = await itemsOf(1);
  const first = parseRosterItems(firstItems);
  if (!/RESIDEN\/LOCUM/i.test(firstItems.map((item) => item.str).join(' ')) || pdf.numPages < 2) return first;
  // The pages are laid one under the other as one long sheet (page 2's text is moved below page 1's), so the column titles and the doctors' letters on page 1 apply to every row.
  const all: TextItem[] = [...firstItems];
  for (let number = 2; number <= pdf.numPages; number++) all.push(...(await itemsOf(number)).map((item) => ({ ...item, y: item.y - (number - 1) * 100000 })));
  try { return parseRosterItems(all); } catch { return first; }
}
