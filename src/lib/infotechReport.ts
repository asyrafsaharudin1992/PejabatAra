// A CSV file with quoted cells (as Infotech writes it) read into rows of cells.
function csvRows(text: string) {
  const rows: string[][] = []; let cell = '', row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export type ImportRow = { company: string; code: string; date: string; in: number; out: number; shift: string };
// The Infotech Individual Attendance report as a CSV: one row per person and day, with the in and out as hours.minutes (8.17 is 8:17).
export function readInfotechReport(text: string): ImportRow[] {
  const table = csvRows(text); const head = table.findIndex((cells) => cells.includes('EmpcodeC'));
  if (head < 0) throw new Error('This is not the Infotech Individual Attendance report. In Infotech use Reports > Individual Attendance > Export CSV.');
  const names = table[head]; const column = (name: string) => names.indexOf(name);
  const [code, day, tin, tout, shift] = ['EmpcodeC', 'ClockDateD', 'In', 'Out', 'Shift'].map(column);
  if ([code, day, tin, tout, shift].some((index) => index < 0)) throw new Error('The report is missing its In, Out or Shift columns.');
  const out: ImportRow[] = [];
  for (const cells of table.slice(head + 1)) {
    const company = /^(KJ|SK)\b/i.exec(cells[0] || '')?.[1]?.toUpperCase(); const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(cells[day] || '');
    if (!company || !date || !cells[code]) continue;
    out.push({ company, code: cells[code].trim(), date: `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`, in: Number(cells[tin]) || 0, out: Number(cells[tout]) || 0, shift: (cells[shift] || '').trim() });
  }
  return out;
}
