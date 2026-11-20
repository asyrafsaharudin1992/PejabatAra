// Gives the old HR clocks (device 'hr', no work date) the same tag new ones get ('hr:<work date>'), so a night shift
// does not pick up another day's clock. The work date comes from the audit log line written when HR added the clock
// ("clock_added": "<in|out> <work date> <HH:MM>[ (next day)]"). Clocks HR only changed (no work date in the log) and
// clocks with no matching audit line are listed and left alone.
//   node scripts/backfill-hr-clock-dates.mjs            (dry run, writes nothing)
//   APPLY=1 node scripts/backfill-hr-clock-dates.mjs
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

config({ path: '.env.local', quiet: true });
const apply = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

async function readAll(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const local = (iso) => new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM in Malaysia time
const clocks = await readAll(() => db.from('hr_attendance_clocks').select('id,employee_id,kind,clock_at').eq('device', 'hr').order('id'));
const audits = await readAll(() => db.from('hr_audit').select('employee_id,changes').eq('action', 'update').not('changes->>clock_added', 'is', null).order('id'));

// employee|kind|local minute -> work dates the log says were typed for it
const added = new Map();
for (const audit of audits) {
  const match = /^(in|out) (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})( \(next day\))?$/.exec(String(audit.changes?.clock_added || ''));
  if (!match) continue;
  const [, kind, date, time, next] = match;
  const day = next ? new Date(Date.parse(`${date}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10) : date;
  const key = `${audit.employee_id}|${kind}|${day}T${time}`;
  added.set(key, [...(added.get(key) || []), date]);
}

const tag = [], unmatched = [], ambiguous = [];
for (const clock of clocks) {
  const dates = [...new Set(added.get(`${clock.employee_id}|${clock.kind}|${local(clock.clock_at)}`) || [])];
  if (dates.length === 1) tag.push({ clock, date: dates[0] });
  else if (dates.length > 1) ambiguous.push(clock);
  else unmatched.push(clock);
}

console.log(`${clocks.length} untagged HR clocks: ${tag.length} can be tagged, ${unmatched.length} have no "added" log line (changed by HR, left alone), ${ambiguous.length} ambiguous (left alone).`);
for (const { clock, date } of tag.slice(0, 15)) console.log(`  ${clock.employee_id.slice(0, 8)} ${clock.kind} ${local(clock.clock_at).replace('T', ' ')} -> hr:${date}`);
if (tag.length > 15) console.log(`  ... and ${tag.length - 15} more`);
if (!apply) { console.log('Dry run: nothing written. Run with APPLY=1 to tag them.'); process.exit(0); }

let done = 0;
for (const { clock, date } of tag) {
  const { error } = await db.from('hr_attendance_clocks').update({ device: `hr:${date}` }).eq('id', clock.id).eq('device', 'hr');
  if (error) throw error;
  done += 1;
}
console.log(`Tagged ${done} clocks.`);
