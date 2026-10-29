// Imported only by api/local.ts, never by a deployed API handler.
import { randomUUID } from 'node:crypto';
import { calendarAccessFor, calendarPersonVisible } from './_leave-calendar-access.js';

const password = 'AraDemo2026!';
const people = [
  { id: 'staff-kj', name: 'Staf Demo KJ', code: 'DEMO01', company: 'KJ', department: 'OPERATION', leave_calendar_companies: [] },
  { id: 'admin-kj', name: 'Admin Demo KJ', code: 'DEMO02', company: 'KJ', department: 'ADMIN', leave_calendar_companies: ['KJ'] },
  { id: 'admin-sk', name: 'Admin Demo SK', code: 'DEMO03', company: 'SK', department: 'OPERATION', leave_calendar_companies: ['SK'] },
  { id: 'admin-both', name: 'Admin Demo KJ SK', code: 'DEMO04', company: 'KJ', department: 'OFFICE', leave_calendar_companies: ['KJ', 'SK'] },
  { id: 'doctor-kj', name: 'Doktor Demo KJ', code: 'DEMO05', company: 'KJ', department: 'OPR -DR RESIDENT', leave_calendar_companies: [] },
  { id: 'office-sk', name: 'Pejabat Demo SK', code: 'DEMO06', company: 'SK', department: 'OFFICE', leave_calendar_companies: [] },
  { id: 'peer-kj', name: 'Rakan Demo KJ', code: 'DEMO07', company: 'KJ', department: 'OPERATION', leave_calendar_companies: [] },
];
const sessions = new Map<string, { id: string; expires: number }>();
export const demoAccounts = people.slice(0, 4).map(person => ({ id: person.id, name: person.name, code: person.code, company: person.company, department: person.department, access: calendarAccessFor(person).label }));
export function demoCalendar(id: string, month: string) {
  const me = people.find(person => person.id === id);
  if (!me) throw new Error('Unknown demo account');
  const access = calendarAccessFor(me);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const day = month === today.slice(0, 7) ? today : `${month}-15`;
  return { month, group: access.label, scope: access.scope, notice: access.notice, items: people.filter(person => calendarPersonVisible(access, person)).map(person => ({ name: person.name, code: person.code, company: person.company, department: person.department, type: person.id === 'doctor-kj' ? 'Medical Leave' : 'Annual Leave', start: day, end: day, half: null, days: 1 })) };
}
export function localDemoRoutes(app: any) {
  app.get('/api/local-leave-demo/accounts', (_req: any, res: any) => res.json({ accounts: demoAccounts }));
  app.post('/api/local-leave-demo/login', (req: any, res: any) => {
    const account = demoAccounts.find(person => person.id === req.body.account);
    if (!account || req.body.password !== password) return res.status(401).json({ error: 'Incorrect demo account or password.' });
    const token = `local-demo-${randomUUID()}`;
    sessions.set(token, { id: account.id, expires: Date.now() + 2 * 3600000 });
    res.json({ token, account });
  });
  app.use('/api/status', (req: any, res: any, next: any) => {
    const token = String(req.headers['x-assessment-token'] || '');
    if (!token.startsWith('local-demo-')) return next();
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) return res.status(401).json({ error: 'Demo session expired. Sign in again.' });
    res.setHeader('Cache-Control', 'no-store');
    const action = req.query.action;
    if (req.query.resource !== 'assessment' || req.method !== 'GET') return res.status(403).json({ error: 'Local demo accounts can only view fictional leave data.' });
    if (action === 'leave_calendar') {
      const month = String(req.query.month || '').slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Choose a valid month.' });
      return res.json(demoCalendar(session.id, month));
    }
    if (action === 'my_leave') return res.json({ linked: true, balances: [] });
    if (action === 'my_leave_requests') return res.json({ requests: [] });
    if (action === 'leave_approvals') return res.json({ pending: [], recent: [] });
    if (action === 'leave_options') return res.json({ approver: '', types: [], workDays: [1, 2, 3, 4, 5] });
    return res.status(403).json({ error: 'This demonstration shows the leave calendar only.' });
  });
}
