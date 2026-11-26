import { choiceRow, newId, place, SIZE, type Field, type FieldType } from './model';

// "Place boxes for me": finds where a form is filled in from the text of a PDF (not from a scan): lines after a label with a colon, tick boxes, rows of
// rating numbers, YA / TIDAK, signature lines and the space under an open question. HR checks the result and moves or adds boxes.
export type Word = { text: string; x: number; y: number; w: number; h: number };

const SOURCES: [RegExp, string][] = [[/^nama/i, 'name'], [/kad pengenalan|^no\.? *k\/?p/i, 'ic'], [/^no\.? *pekerja/i, 'code'], [/^jawatan/i, 'position'], [/^jabatan/i, 'department'], [/^syarikat/i, 'company'], [/^umur/i, 'age'], [/^jantina/i, 'gender'], [/^tempoh perkhidmatan/i, 'service'], [/tarikh berhenti/i, 'resignDate'], [/^tarikh$/i, 'today']];
const TICK = /[□◻☐▢❏]/;
// Where part of a piece of text sits, taking every letter as equally wide.
const part = (word: Word, from: number, to: number) => ({ x: word.x + (word.w * from) / Math.max(1, word.text.length), w: (word.w * (to - from)) / Math.max(1, word.text.length) });
function lines(words: Word[]) {
  const rows: Word[][] = [];
  for (const word of [...words].filter((item) => item.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x)) {
    const middle = word.y + word.h / 2, row = rows.find((items) => Math.abs(items[0].y + items[0].h / 2 - middle) < 0.006);
    if (row) row.push(word); else rows.push([word]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

export function detectFields(words: Word[], page: number, who = 'staff'): Field[] {
  const found: Field[] = [], rows = lines(words);
  // The heights of the rating rows, so a question takes only the words of its own row (not those of the row above or below).
  const ratingRows = rows.filter((row) => /(^|\s)1\s.*?2\s.*?3\s.*?4(\s|$)/.test(row.map((word) => word.text).join(' '))).map((row) => row.find((word) => /(^|\s)4(\s|$)/.test(word.text))?.y ?? row[0].y);
  // The headings of a rating table, kept by where its columns are, so every row of the table gets the same meanings.
  const tables = new Map<string, string[]>();
  const headings = (columns: number[], top: number) => {
    const key = columns.map((x) => x.toFixed(2)).join(' ');
    if (!tables.has(key)) {
      const gap = (columns[columns.length - 1] - columns[0]) / Math.max(1, columns.length - 1);
      // Words the width of one cell, just above the first row; sentences of the instructions are much wider.
      const above = words.filter((word) => word.y < top - 0.008 && word.y > top - 0.075 && word.w <= gap * 1.15 && !/^\d{1,2}$/.test(word.text.trim())).sort((a, b) => a.y - b.y || a.x - b.x);
      tables.set(key, columns.map((x) => above.filter((word) => Math.abs(word.x + word.w / 2 - x) < gap / 2).map((word) => word.text.trim()).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return tables.get(key)!;
  };
  const add = (type: FieldType, x: number, y: number, w: number, h: number, label: string, extra: Partial<Field> = {}) => found.push(place({ id: newId(), type, page, x: 0, y: 0, w: Math.min(0.9, w), h, who, label: label.slice(0, 200), required: type !== 'check', ...extra }, x, y));
  rows.forEach((row, index) => {
    const full = row.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim();
    // A row of rating numbers: 1, 2, 3 ... going up, with nothing but numbers from the first to the last.
    const tokens = row.flatMap((word) => [...word.text.matchAll(/\S+/g)].map((match) => ({ text: match[0], ...part(word, match.index!, match.index! + match[0].length), y: word.y, h: word.h })));
    let best: typeof tokens = [], run: typeof tokens = [];
    for (const token of tokens) {
      if (/^\d{1,2}$/.test(token.text) && (token.text === '1' || (run.length && Number(token.text) > Number(run[run.length - 1].text)))) { run = token.text === '1' ? [token] : [...run, token]; if (run.length > best.length) best = run; } else run = [];
    }
    if (best.length >= 4) {
      const reach = Math.min(0.022, ...ratingRows.map((y) => Math.abs(y - best[0].y)).filter((gap) => gap > 0.008).map((gap) => gap * 0.5));
      const near = rows.slice(Math.max(0, index - 3), index + 4).flat().filter((word) => word.x + word.w < best[0].x - 0.01 && Math.abs(word.y - best[0].y) < reach && !/^\d{1,2}$/.test(word.text.trim()));
      const label = near.map((word) => word.text.trim()).join(' ') || `Question ${found.length + 1}`;
      const centre = (token: typeof tokens[number]) => ({ x: token.x + token.w / 2, y: token.y + token.h / 2 });
      const meaning = headings(best.map((token) => centre(token).x), best[0].y);
      found.push(...choiceRow({ page, ...centre(best[0]) }, centre(best[best.length - 1]), best.map((token) => token.text), who, label)
        .map((field, at) => ({ ...place(field, centre(best[at]).x - field.w / 2, centre(best[at]).y - field.h / 2), ...(meaning[at] ? { hint: meaning[at] } : {}) })));
      return;
    }
    // YA / TIDAK
    for (const word of row) {
      const yes = /\bYA\b/i.exec(word.text), no = /\bTIDAK\b/i.exec(word.text);
      const pair = /^\s*YA\s*\/\s*TIDAK\s*$/i.test(word.text);
      if (pair && yes && no) {
        const group = newId(), question = rows.slice(0, index).reverse().map((items) => items.map((item) => item.text).join(' ')).find((text) => /\?/.test(text)) || 'Ya / Tidak';
        for (const [match, value] of [[yes, 'YA'], [no, 'TIDAK']] as const) { const at = part(word, match.index, match.index + match[0].length); add('choice', at.x - 0.006, word.y - word.h * 0.35, at.w + 0.012, word.h * 1.7, question.trim().replace(/^\d+\s+/, ''), { group, value }); }
      }
    }
    for (const word of row) {
      // Tick boxes drawn as a character: the box is where that character is.
      const tick = TICK.exec(word.text);
      if (tick) { const rest = word.text.slice(tick.index + 1).trim() || row.filter((item) => item.x > word.x).map((item) => item.text).join(' '); const size = Math.max(SIZE.check[0], word.h * 1.2); add('check', part(word, tick.index, tick.index + 1).x - 0.004, word.y - word.h * 0.1, size, word.h * 1.2, rest.trim() || 'Tick'); }
    }
    // "Label : ______" — one or more on a line.
    row.forEach((word, at) => {
      for (const match of word.text.matchAll(/([A-Za-z][A-Za-z.\/ -]{1,34}?)\s*:/g)) {
        const label = match[1].replace(/\s+/g, ' ').trim(), after = word.text.slice(match.index! + match[0].length);
        const following = /^[\s_.]*(?:[A-Za-z][A-Za-z.\/ -]{1,34}?\s*:.*)?$|^[\s_.]*(?:L\s*\/\s*P|tahun)?[\s_.]*$/i;
        if (!following.test(after) || /^bahagian/i.test(label)) continue;
        // "Company property:" that only introduces the tick boxes or the list under it is not a line to write on.
        const below = rows[index + 1]?.map((item) => item.text).join(' ').trim() || '';
        if (!after.trim() && !TICK.test(word.text) && (TICK.test(below) || /^[a-z]\)/i.test(below))) continue;
        const start = part(word, 0, match.index! + match[0].length);
        let from = start.x + start.w + 0.004;
        if (/tandatangan/i.test(label)) { add('signature', word.x, word.y + word.h + 0.008, SIZE.signature[0], SIZE.signature[1], label); continue; }
        // up to the next words on the line (underscores and units do not count as the next words)
        const inside = /[A-Za-z][A-Za-z.\/ -]{1,34}?\s*:/.exec(after);
        let to = inside ? part(word, 0, match.index! + match[0].length + inside.index).x + part(word, 0, match.index! + match[0].length + inside.index).w : 0;
        if (!to) { const stop = row.slice(at + 1).find((item) => !/^[\s_]+$/.test(item.text) && item.x > from + 0.02); to = stop ? stop.x - 0.008 : Math.min(0.92, Math.max(from + 0.24, word.x + word.w)); }
        if (to - from < 0.03) { from = Math.max(0, to - 0.03); }
        const source = SOURCES.find(([pattern]) => pattern.test(label))?.[1];
        if (/\bL\s*\/\s*P\b/.test(after)) from += 0.008;
        // A date line is short; a box stops before the words of the next column.
        add('text', from, word.y - word.h * 0.35, Math.min(to - from, source === 'today' ? 0.22 : 0.45), word.h * 1.5, label, source ? { source } : {});
      }
    });
    // An open question with empty space under it.
    if (/\?\s*$/.test(full) || /^(\d+\s+)?sila gunakan ruangan/i.test(full)) {
      let last = index; while (rows[last + 1] && rows[last + 1][0].y - (rows[last][0].y + rows[last][0].h) < 0.012) last++;
      const bottom = rows[last + 1] ? Math.min(...rows[last + 1].map((word) => word.y)) : 0.93;
      const top = Math.max(...rows[last].map((word) => word.y + word.h)) + 0.008, space = bottom - top - 0.012;
      const first = row.find((word) => !/^\d{1,2}$/.test(word.text.trim())) || row[0];
      const nextText = rows[last + 1]?.map((word) => word.text).join(' ') || '';
      const yesNo = [...rows.slice(index, last + 1).flat().map((word) => word.text), nextText].some((text) => /\bYA\s*\/\s*TIDAK\b/i.test(text));
      if (space > 0.045 && !yesNo) add('paragraph', first.x, top, Math.max(0.3, 0.86 - first.x), Math.min(space, 0.2), full.replace(/^\d+\s+/, ''));
    }
  });
  return found;
}
