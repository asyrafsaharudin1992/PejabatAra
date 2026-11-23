import { cleanShift, type RosterPdfResult } from './rosterPdfRead';

// A schedule typed or pasted as text (for example from WhatsApp): a name on its own line, then one line per day such as
// "Mon- 23/11/2026 - 9am-9pm" or "Sun- 29/11/2026 - REST". Hours are turned into the roster code of that time; a code (OFF, REST, AL...) is kept as it is.
// Same result shape as a roster PDF, so the same check screen is used before anything is saved.
const HOURS_TO_CODE: Record<string, string> = { '9-21': 'AM-9', '12-21': 'AM-12', '8-17': 'AM-5', '9-18': 'AM-6' };

const hour24 = (hour: string, minute: string | undefined, meridiem: string) => {
  let value = Number(hour) % 12; if (/pm/i.test(meridiem)) value += 12;
  return minute && minute !== '00' ? `${value}:${minute}` : String(value);
};

export function shiftFromText(text: string): string {
  const range = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|–|to|hingga|sehingga)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (range) return HOURS_TO_CODE[`${hour24(range[1], range[2], range[3])}-${hour24(range[4], range[5], range[6])}`] || '';
  // Words around a code are dropped: "OFF DAY", "REST DAY", "Hari OFF", "Public Holiday" and so on.
  const plain = text.replace(/[.,;]+$/, '').trim().toUpperCase();
  if (/^(PUBLIC HOLIDAY|CUTI AM)$/.test(plain)) return 'PH';
  return cleanShift(plain.replace(/\b(DAY|HARI)\b/g, '').replace(/\s+/g, ' ').trim());
}

export function parseRosterText(text: string): RosterPdfResult {
  const columns: RosterPdfResult['columns'] = [], skipped: RosterPdfResult['skipped'] = [];
  let current: RosterPdfResult['columns'][number] | null = null;
  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const day = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:[-–:]\s*)?(.*)$/);
    if (!day) { current = { name: line.replace(/[:\-–]+$/, '').trim(), days: [] }; columns.push(current); continue; }
    const date = `${day[3]}-${day[2].padStart(2, '0')}-${day[1].padStart(2, '0')}`;
    if (!current) { current = { name: '', days: [] }; columns.push(current); }
    const shift = shiftFromText(day[4].replace(/^[-–:\s]+/, ''));
    if (shift) current.days.push({ date, shift }); else skipped.push({ name: current.name || '?', date, text: day[4].trim() });
  }
  const kept = columns.filter((column) => column.days.length || skipped.some((item) => item.name === column.name));
  const dates = kept.flatMap((column) => column.days.map((item) => item.date)).sort();
  return { company: '', month: (dates[0] || new Date().toISOString().slice(0, 10)).slice(0, 7), columns: kept, skipped, notes: { request: '', remarks: '' } };
}
