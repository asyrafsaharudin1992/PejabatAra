import { branchId } from './_office-db.js';
import { CEO_TASKS, FREQUENCIES, periodKey, type CeoTask } from '../src/lib/ceoTasks.js';
import { malaysiaToday } from '../src/lib/reviewReminders.js';

const BRANCH = 'AraOffice CEO Private', KEY = 'ceo_tasks';
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

// Called only after the office route verifies CEO access. GET never creates a branch or record.
export async function ceoTasksAction(req: any, res: any, db: any, user: { id: string }, action: string, body: any) {
  if (req.method !== (action === 'ceo_tasks' ? 'GET' : 'POST')) throw fail(405, 'Method not allowed.');
  const writing = req.method === 'POST';
  let branch: string | null;
  try { branch = await branchId(db, BRANCH, writing); }
  catch (error) { if ((error as any)?.code !== '23505') throw error; branch = await branchId(db, BRANCH, false); }
  const read = branch ? await db.from('portal_state').select('payload,updated_at').eq('branch_id', branch).eq('state_key', KEY).maybeSingle() : { data: null, error: null };
  if (read.error) throw read.error;
  const current = read.data;
  let custom = Array.isArray(current?.payload?.tasks);
  let tasks: CeoTask[] = custom ? current.payload.tasks : CEO_TASKS;
  let done: Record<string, string> = { ...(current?.payload?.done || {}) };
  if (!writing) return res.status(200).json({ tasks, done, custom, version: current?.updated_at || null });
  if ((current?.updated_at || null) !== body.version) throw fail(409, 'The CEO task list changed on another device. Refresh and try again.');
  const previousTasks = tasks;
  if (action === 'ceo_tasks_save') {
    if (body.reset === true) { tasks = CEO_TASKS; custom = false; }
    else {
      if (!Array.isArray(body.tasks) || body.tasks.length > 100) throw fail(400, 'Enter up to 100 tasks.');
      const ids = new Set<string>();
      tasks = body.tasks.map((task: any) => {
        if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(task.id) || ids.has(task.id) || !FREQUENCIES.includes(task.frequency) || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120 || typeof task.note !== 'string' || task.note.length > 300) throw fail(400, 'Check task titles, details and frequencies.');
        ids.add(task.id);
        return { id: task.id, frequency: task.frequency, title: task.title.trim(), note: task.note.trim() };
      });
      custom = true;
    }
    // A changed frequency starts a fresh occurrence; removed tasks cannot leave orphan ticks.
    done = Object.fromEntries(tasks.filter((task) => done[task.id] && previousTasks.some((old: CeoTask) => old.id === task.id && old.frequency === task.frequency)).map((task) => [task.id, done[task.id]]));
  } else if (action === 'ceo_task_toggle') {
    const task = tasks.find((item) => item.id === body.id);
    if (!task || typeof body.done !== 'boolean' || body.period !== periodKey(task.frequency, malaysiaToday())) throw fail(400, 'Choose a task in the current period.');
    if (body.done) done[task.id] = body.period;
    else delete done[task.id];
  } else throw fail(400, 'Unknown task action.');
  if (!branch) throw fail(500, 'The CEO task list is not ready.');
  const version = new Date(Math.max(Date.now(), (Date.parse(current?.updated_at || '') || 0) + 1)).toISOString();
  const row = { branch_id: branch, state_key: KEY, payload: { ...(custom ? { tasks } : {}), done }, updated_by: user.id, updated_at: version };
  const query = current ? db.from('portal_state').update(row).eq('branch_id', branch).eq('state_key', KEY).eq('updated_at', current.updated_at) : db.from('portal_state').insert(row);
  const saved = await query.select('updated_at').maybeSingle();
  if (saved.error?.code === '23505' || !saved.error && !saved.data) throw fail(409, 'The CEO task list changed on another device. Refresh and try again.');
  if (saved.error) throw saved.error;
  return res.status(200).json({ tasks, done, custom, version });
}
