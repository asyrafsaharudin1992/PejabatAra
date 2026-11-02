import { branchId } from './_office-db.js';
import { buildHrCalendar, calendarMonth, calendarMonthEnd, defaultCalendarConfig, validateCalendarRule, validateCalendarSettings, type CalendarConfig, type CalendarOccurrence, type CalendarPerson } from '../src/lib/hrCalendar.js';
const BRANCH = 'AraOffice HR Private';
const CONFIG_KEY = 'hr_calendar_config';
const stateKey = (month: string) => `hr_calendar_done:${month}`;
const storedConfig = (payload: any): CalendarConfig => ({ settings: { ...defaultCalendarConfig().settings, ...(payload?.settings || {}) }, rules: Array.isArray(payload?.rules) ? payload.rules : [] });
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
async function readRecord(db: any, branch: string | null, key: string) {
  if (!branch) return null;
  const { data, error } = await db.from('portal_state').select('payload,updated_at').eq('branch_id', branch).eq('state_key', key).maybeSingle();
  if (error) throw error;
  return data;
}
async function writeRecord(db: any, userId: string, branch: string, key: string, current: any, version: unknown, payload: unknown) {
  if ((current?.updated_at || null) !== version) throw fail(409, 'Another HR user changed this calendar. Refresh and try again.');
  const updated_at = new Date(Math.max(Date.now(), (Date.parse(current?.updated_at || '') || 0) + 1)).toISOString();
  const row = { branch_id: branch, state_key: key, payload, updated_by: userId, updated_at };
  const query = current ? db.from('portal_state').update(row).eq('branch_id', branch).eq('state_key', key).eq('updated_at', current.updated_at) : db.from('portal_state').insert(row);
  const { data, error } = await query.select('updated_at').maybeSingle();
  if (error?.code === '23505' || !error && !data) throw fail(409, 'Another HR user changed this calendar. Refresh and try again.');
  if (error) throw error;
  return data.updated_at;
}
export async function hrCalendarAction(req: any, res: any, db: any, user: { id: string }, action: string, body: any) {
  if (!['calendar_month', 'calendar_rule_save', 'calendar_rule_delete', 'calendar_settings', 'calendar_state'].includes(action)) throw fail(400, 'Unknown calendar action.');
  if (req.method !== (action === 'calendar_month' ? 'GET' : 'POST')) throw fail(405, 'Method not allowed.');
  const month = req.method === 'GET' ? req.query.month : body.month;
  if (!calendarMonth(month)) throw fail(400, 'Choose a valid calendar month.');
  let branch: string | null;
  try { branch = await branchId(db, BRANCH, req.method === 'POST'); }
  catch (cause) { if ((cause as any)?.code !== '23505') throw cause; branch = await branchId(db, BRANCH, false); }
  if (req.method === 'GET' && action === 'calendar_month') {
    const [staff, configRow, stateRow] = await Promise.all([
      db.from('hr_employees').select('id,full_name,employee_code,company,designation,join_date,confirm_date,date_of_birth', { count: 'exact' }).eq('status', 'Active').order('full_name').limit(500),
      readRecord(db, branch, CONFIG_KEY), readRecord(db, branch, stateKey(month)),
    ]);
    if (staff.error) throw staff.error;
    if ((staff.count || 0) > (staff.data || []).length) throw fail(422, 'More than 500 active staff: the calendar needs pagination before it can be shown safely.');
    const people: CalendarPerson[] = (staff.data || []).map((p: any) => ({ id: p.id, name: p.full_name, code: p.employee_code, company: p.company, designation: p.designation || '', joinDate: p.join_date, confirmDate: p.confirm_date, birthday: p.date_of_birth }));
    const reviewResult = people.length ? await db.from('hr_reviews').select('id,employee_id,period_label,period_end,status', { count: 'exact' }).in('employee_id', people.map((p) => p.id)).gte('period_end', `${month}-01`).lte('period_end', calendarMonthEnd(month)).limit(500) : { data: [], error: null, count: 0 };
    if (reviewResult.error) throw reviewResult.error;
    if ((reviewResult.count || 0) > (reviewResult.data || []).length) throw fail(422, 'More than 500 reviews in this month. The calendar cannot display partial results safely.');
    const reviews = (reviewResult.data || []).map((r: any) => ({ id: r.id, employeeId: r.employee_id, label: r.period_label, due: r.period_end, status: r.status }));
    const config: CalendarConfig = storedConfig(configRow?.payload);
    const states: Record<string, CalendarOccurrence> = stateRow?.payload?.states || {};
    return res.status(200).json({ ...buildHrCalendar(month, people, config, states, reviews), people: people.map(({ birthday, ...safe }) => safe), config, configVersion: configRow?.updated_at || null, stateVersion: stateRow?.updated_at || null });
  }
  if (req.method !== 'POST' || !branch) throw fail(405, 'Method not allowed.');
  if (['calendar_rule_save', 'calendar_rule_delete', 'calendar_settings'].includes(action)) {
    const current = await readRecord(db, branch, CONFIG_KEY);
    const config: CalendarConfig = storedConfig(current?.payload);
    let next: CalendarConfig;
    if (action === 'calendar_settings') {
      let settings; try { settings = validateCalendarSettings(body.settings); } catch (cause) { throw fail(400, (cause as Error).message); }
      next = { ...config, settings };
    } else if (action === 'calendar_rule_save') {
      let rule; try { rule = validateCalendarRule(body.rule); } catch (cause) { throw fail(400, (cause as Error).message); }
      if (rule.employeeId) {
        const { data, error } = await db.from('hr_employees').select('company').eq('id', rule.employeeId).eq('status', 'Active').maybeSingle();
        if (error) throw error;
        if (!data) throw fail(400, 'Select an active staff member.');
        rule.company = data.company;
      }
      const rules = [...config.rules.filter((r) => r.id !== rule.id), rule];
      if (rules.length > 100) throw fail(400, 'Keep at most 100 custom reminder schedules. Remove older schedules first.');
      next = { ...config, rules };
    } else {
      if (typeof body.id !== 'string' || !config.rules.some((r) => r.id === body.id)) throw fail(404, 'Reminder schedule not found.');
      next = { ...config, rules: config.rules.filter((r) => r.id !== body.id) };
    }
    const version = await writeRecord(db, user.id, branch, CONFIG_KEY, current, body.version, next);
    return res.status(200).json({ version });
  }
  if (action === 'calendar_state') {
    if (typeof body.id !== 'string' || body.id.length > 300 || !/^(payroll|(?:manual|review|probation-14|probation-3|ca-evaluation|birthday|appraisal):[a-zA-Z0-9-]{1,80}):\d{4}-\d{2}-\d{2}$/.test(body.id) || !body.id.endsWith(`:${month}-${body.id.slice(-2)}`) || !['done', 'skipped', 'open'].includes(body.state)) throw fail(400, 'Choose a valid reminder occurrence and status.');
    const due = body.id.slice(-10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number(due.slice(8)) < 1 || due > calendarMonthEnd(month)) throw fail(400, 'Choose a reminder in this month.');
    const current = await readRecord(db, branch, stateKey(month));
    const states = { ...(current?.payload?.states || {}) };
    if (body.state === 'open') delete states[body.id]; else states[body.id] = { state: body.state, at: new Date().toISOString(), by: user.id };
    if (Object.keys(states).length > 500) throw fail(422, 'This month exceeds 500 reminder status entries.');
    const version = await writeRecord(db, user.id, branch, stateKey(month), current, body.version, { states });
    return res.status(200).json({ version });
  }
  throw fail(400, 'Unknown calendar action.');
}
