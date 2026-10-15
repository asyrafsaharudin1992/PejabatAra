import { officeAccess } from './_office-db.js';

// Office Clinical Administration. Served from /api/status?resource=clinical
// because the Vercel Hobby plan allows only 12 functions.
//
// Each branch's Clinical Admin account works on its own branch (staff_branches);
// System Admin, COO and CEO see every branch. Everything works on "today" in
// Malaysia time, so a phone with the wrong clock cannot file the wrong day.
const CLINICAL_BRANCHES = ['Kajang', 'Seri Kembangan'];
const CHECK_STATUSES = new Set(['done', 'pending', 'na']);
const BOOKING_STATUSES = new Set(['waiting', 'reserved', 'done', 'cancelled']);

const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

type Branch = { id: string; name: string };

async function branchScope(db: any, user: any, profile: any): Promise<Branch[]> {
  const { data: branches, error } = await db.from('branches').select('id,name').in('name', CLINICAL_BRANCHES).order('name');
  if (error) throw error;
  const access: string[] = Array.isArray(user.app_metadata?.office_access) ? user.app_metadata.office_access : [];
  if (profile.role === 'super_admin' || access.includes('coo') || access.includes('ceo')) return branches || [];
  const { data: own, error: ownError } = await db.from('staff_branches').select('branch_id').eq('profile_id', user.id);
  if (ownError) throw ownError;
  const ids = new Set((own || []).map((row: any) => row.branch_id));
  return (branches || []).filter((branch: Branch) => ids.has(branch.id));
}

function pickBranch(scope: Branch[], name: unknown) {
  const branch = scope.find((row) => row.name === name);
  if (!branch) throw fail(403, 'This account cannot work on that branch.');
  return branch;
}

const decodeOrder = (row: any) => ({ id: row.id, supplier: row.supplier, orderedOn: row.ordered_on, approvedBy: row.approved_by, items: row.items, note: row.note, cancelled: row.cancelled, closed: Boolean(row.closed_at) });
const decodeBooking = (row: any) => ({ id: row.id, patientName: row.patient_name, icLast4: row.ic_last4, vaccines: row.vaccines, deposit: Number(row.deposit), appointmentOn: row.appointment_on, status: row.status, note: row.note });
const decodeTask = (row: any) => ({ id: row.id, title: row.title, details: row.details, createdOn: row.created_on, doneOn: row.done_on });

function cleanItems(value: unknown) {
  const items = (Array.isArray(value) ? value : []).map((item: any) => ({
    name: text(item?.name, 160), qty: text(item?.qty, 60), note: text(item?.note, 200),
    receivedOn: isDate(item?.receivedOn) ? item.receivedOn : null,
  })).filter((item) => item.name);
  if (!items.length) throw fail(400, 'Add at least one item to the order.');
  return items;
}
// An order is closed once every item has arrived.
const closedAt = (items: { receivedOn: string | null }[]) => items.every((item) => item.receivedOn) ? new Date().toISOString() : null;

async function dayView(db: any, branch: Branch) {
  const date = today();
  const start = `${date}T00:00:00+08:00`;
  const [report, orders, bookings, tasks, monthly] = await Promise.all([
    db.from('clinical_reports').select('prepared_by,checks,issues,staffing,updated_at').eq('branch_id', branch.id).eq('report_date', date).maybeSingle(),
    // Open orders, plus any closed today so today's deliveries still show.
    db.from('clinical_orders').select('*').eq('branch_id', branch.id).or(`closed_at.is.null,closed_at.gte.${start}`).order('ordered_on'),
    db.from('clinical_vaccine_bookings').select('*').eq('branch_id', branch.id).in('status', ['waiting', 'reserved']).order('created_at'),
    db.from('clinical_tasks').select('*').eq('branch_id', branch.id).or(`done_on.is.null,done_on.eq.${date}`).order('created_at'),
    db.from('clinical_monthly_done').select('task_id').eq('branch_id', branch.id).eq('month', date.slice(0, 7)),
  ]);
  for (const result of [report, orders, bookings, tasks, monthly]) if (result.error) throw result.error;
  // A new day starts with yesterday's staffing text, since the roster rarely changes much.
  let staffing = report.data?.staffing;
  if (staffing === undefined) {
    const { data, error } = await db.from('clinical_reports').select('staffing').eq('branch_id', branch.id).lt('report_date', date).order('report_date', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    staffing = data?.staffing || '';
  }
  return {
    date, branch: branch.name,
    report: { saved: Boolean(report.data), preparedBy: report.data?.prepared_by || '', checks: report.data?.checks || {}, issues: report.data?.issues || '', staffing, updatedAt: report.data?.updated_at || null },
    orders: (orders.data || []).map(decodeOrder),
    bookings: (bookings.data || []).map(decodeBooking),
    tasks: (tasks.data || []).map(decodeTask),
    monthlyDone: (monthly.data || []).map((row: any) => row.task_id),
  };
}

// COO overview: one light summary per branch, worked out on the server.
async function overview(db: any, scope: Branch[]) {
  const date = today();
  const ids = scope.map((branch) => branch.id);
  const [reports, orders, bookings, tasks, monthly] = await Promise.all([
    db.from('clinical_reports').select('branch_id,prepared_by,checks,issues,updated_at').in('branch_id', ids).eq('report_date', date),
    db.from('clinical_orders').select('branch_id,supplier,ordered_on').in('branch_id', ids).is('closed_at', null),
    db.from('clinical_vaccine_bookings').select('branch_id').in('branch_id', ids).in('status', ['waiting', 'reserved']),
    db.from('clinical_tasks').select('branch_id').in('branch_id', ids).is('done_on', null),
    db.from('clinical_monthly_done').select('branch_id,task_id').in('branch_id', ids).eq('month', date.slice(0, 7)),
  ]);
  for (const result of [reports, orders, bookings, tasks, monthly]) if (result.error) throw result.error;
  return {
    date,
    branches: scope.map((branch) => {
      const report = (reports.data || []).find((row: any) => row.branch_id === branch.id);
      const open = (orders.data || []).filter((row: any) => row.branch_id === branch.id);
      return {
        branch: branch.name,
        report: report ? { preparedBy: report.prepared_by, checks: report.checks, issues: report.issues, updatedAt: report.updated_at } : null,
        openOrders: open.length,
        oldestOrder: open.reduce((oldest: any, row: any) => !oldest || row.ordered_on < oldest.orderedOn ? { supplier: row.supplier, orderedOn: row.ordered_on } : oldest, null),
        activeBookings: (bookings.data || []).filter((row: any) => row.branch_id === branch.id).length,
        openTasks: (tasks.data || []).filter((row: any) => row.branch_id === branch.id).length,
        monthlyDone: (monthly.data || []).filter((row: any) => row.branch_id === branch.id).map((row: any) => row.task_id),
      };
    }),
  };
}

export async function clinicalHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'clinical');
    const scope = await branchScope(db, user, profile);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = text(req.query.action || body.action, 40);
    const scopeIds = scope.map((branch) => branch.id);
    const now = new Date().toISOString();

    if (req.method === 'GET' && action === 'branches') return res.status(200).json({ branches: scope.map((branch) => branch.name), today: today() });
    if (req.method === 'GET' && action === 'day') return res.status(200).json(await dayView(db, pickBranch(scope, req.query.branch)));
    if (req.method === 'GET' && action === 'overview') return res.status(200).json(await overview(db, scope));
    if (req.method !== 'POST') throw fail(405, 'Method not allowed.');

    if (action === 'save_report') {
      const branch = pickBranch(scope, body.branch);
      const checks: Record<string, { status: string; note: string }> = {};
      for (const [id, value] of Object.entries(body.checks && typeof body.checks === 'object' ? body.checks : {})) {
        const status = (value as any)?.status;
        if (/^[a-z0-9-]{1,40}$/.test(id) && CHECK_STATUSES.has(status)) checks[id] = { status, note: text((value as any)?.note, 300) };
      }
      const { error } = await db.from('clinical_reports').upsert({
        branch_id: branch.id, report_date: today(), prepared_by: text(body.preparedBy, 80), checks,
        issues: text(body.issues, 3000), staffing: text(body.staffing, 3000), updated_by: user.id, updated_at: now,
      }, { onConflict: 'branch_id,report_date' });
      if (error) throw error;
      return res.status(200).json({ success: true, updatedAt: now });
    }

    if (action === 'save_order') {
      const supplier = text(body.supplier, 120);
      if (!supplier) throw fail(400, 'Enter the supplier.');
      if (!isDate(body.orderedOn)) throw fail(400, 'Enter the order date.');
      const items = cleanItems(body.items);
      const row = { supplier, ordered_on: body.orderedOn, approved_by: text(body.approvedBy, 80), items, note: text(body.note, 500), closed_at: closedAt(items), updated_at: now };
      const { error } = body.id
        ? await db.from('clinical_orders').update(row).eq('id', text(body.id)).in('branch_id', scopeIds).eq('cancelled', false)
        : await db.from('clinical_orders').insert({ ...row, branch_id: pickBranch(scope, body.branch).id, created_by: user.id });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'receive_item') {
      const { data: order, error } = await db.from('clinical_orders').select('items').eq('id', text(body.id)).in('branch_id', scopeIds).eq('cancelled', false).maybeSingle();
      if (error) throw error;
      if (!order) throw fail(404, 'Order not found.');
      const index = Number(body.index);
      if (!Number.isInteger(index) || !order.items[index]) throw fail(400, 'Item not found.');
      const items = order.items.map((item: any, i: number) => i === index ? { ...item, receivedOn: body.received ? today() : null } : item);
      const { error: saveError } = await db.from('clinical_orders').update({ items, closed_at: closedAt(items), updated_at: now }).eq('id', text(body.id));
      if (saveError) throw saveError;
      return res.status(200).json({ success: true });
    }

    if (action === 'cancel_order') {
      const { error } = await db.from('clinical_orders').update({ cancelled: true, closed_at: now, updated_at: now }).eq('id', text(body.id)).in('branch_id', scopeIds);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'save_booking') {
      const patientName = text(body.patientName, 120);
      const vaccines = text(body.vaccines, 300);
      if (!patientName || !vaccines) throw fail(400, 'Enter the patient name and the vaccine.');
      const icLast4 = String(body.icLast4 || '').replace(/\D/g, '');
      if (icLast4.length > 4) throw fail(400, 'Enter only the last 4 digits of the IC, not the full IC.');
      const deposit = Number(body.deposit || 0);
      if (!Number.isFinite(deposit) || deposit < 0) throw fail(400, 'Deposit must be a positive amount.');
      const status = BOOKING_STATUSES.has(body.status) ? body.status : 'waiting';
      const row = { patient_name: patientName, ic_last4: icLast4, vaccines, deposit, appointment_on: isDate(body.appointmentOn) ? body.appointmentOn : null, status, note: text(body.note, 500), updated_at: now };
      const { error } = body.id
        ? await db.from('clinical_vaccine_bookings').update(row).eq('id', text(body.id)).in('branch_id', scopeIds)
        : await db.from('clinical_vaccine_bookings').insert({ ...row, branch_id: pickBranch(scope, body.branch).id });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'save_task') {
      const title = text(body.title, 200);
      if (!title) throw fail(400, 'Enter the task.');
      const row = { title, details: text(body.details, 2000) };
      const { error } = body.id
        ? await db.from('clinical_tasks').update(row).eq('id', text(body.id)).in('branch_id', scopeIds)
        : await db.from('clinical_tasks').insert({ ...row, branch_id: pickBranch(scope, body.branch).id, created_on: today() });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'set_task_done') {
      const { error } = await db.from('clinical_tasks').update({ done_on: body.done ? today() : null }).eq('id', text(body.id)).in('branch_id', scopeIds);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'delete_task') {
      const { error } = await db.from('clinical_tasks').delete().eq('id', text(body.id)).in('branch_id', scopeIds);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'set_monthly') {
      const branch = pickBranch(scope, body.branch);
      const taskId = text(body.taskId, 40);
      if (!/^[a-z0-9-]{1,40}$/.test(taskId)) throw fail(400, 'Unknown monthly task.');
      const key = { branch_id: branch.id, month: today().slice(0, 7), task_id: taskId };
      const { error } = body.done
        ? await db.from('clinical_monthly_done').upsert({ ...key, done_on: today() }, { onConflict: 'branch_id,month,task_id' })
        : await db.from('clinical_monthly_done').delete().match(key);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    throw fail(405, 'Method not allowed.');
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to complete this request.' });
  }
}
