import { randomUUID } from 'node:crypto';
import { branchId } from './_office-db.js';

// The Locum Medical Officer Interview Assessment (the paper form "Interview locum"). Nobody assigns it: whoever interviews a locum opens it and fills it in.
// HR (Office HR > Miscellaneous) and the staff listed below (Individual Sign In) use the same list. The records hold a doctor's MMC number and phone number,
// so they are kept in HR's private area, one row for each interview, never in the public repo.
const BRANCH = 'AraOffice HR Private';
const ROW = 'locum_interview:';
// Staff codes that may do locum interviews from Individual Sign In (HR can always). Dr Atikah.
export const LOCUM_INTERVIEWER_CODES = new Set(['ARA0035']);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, ' ').trim().slice(0, max);
const date = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? String(value) : '';
const time = (value: unknown) => /^\d{2}:\d{2}$/.test(String(value ?? '')) ? String(value) : '';
const count = (value: unknown) => { const n = Number(value); return value === '' || value === null || value === undefined || !Number.isFinite(n) || n < 0 || n > 1000 ? null : Math.round(n * 100) / 100; };

export type LocumInterview = {
  id: string; name: string; mmc: string; phone: string; branch: string; workplace: string; interviewer: string; date: string; timeStart: string; timeEnd: string;
  experience: string; skills: string; marks: number | null; outOf: number | null; suggestion: string; savedBy: string; createdAt: string; updatedAt: string;
};

export const canLocumInterview = (staffCode: unknown) => LOCUM_INTERVIEWER_CODES.has(String(staffCode || '').trim().toUpperCase());

// Staff have no HR profile, but every row needs one (updated_by is required): use the first super admin. Who really saved it is kept in `savedBy`.
async function ownerProfile(db: any, userId?: string) {
  if (userId) return userId;
  const { data } = await db.from('profiles').select('id').eq('role', 'super_admin').limit(1);
  if (!data?.[0]?.id) throw fail(500, 'No profile is set up to keep the interview.');
  return data[0].id as string;
}

export async function locumInterviewList(db: any): Promise<LocumInterview[]> {
  const branch = await branchId(db, BRANCH, false);
  if (!branch) return [];
  const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', branch).like('state_key', `${ROW}%`).limit(1000);
  if (error) throw error;
  return ((data || []).map((row: any) => row.payload) as LocumInterview[]).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// Saves a new interview, or replaces one when `body.id` is given. `by` is the name of the person saving; `userId` the HR profile (none for staff).
export async function locumInterviewSave(db: any, body: any, by: string, userId?: string) {
  const name = clean(body?.name, 120);
  if (!name) throw fail(400, 'Enter the doctor\'s name.');
  const marks = count(body?.marks), outOf = count(body?.outOf);
  if ((marks === null) !== (outOf === null)) throw fail(400, 'Enter both the marks and the total, or leave both empty.');
  if (marks !== null && outOf !== null && (outOf === 0 || marks > outOf)) throw fail(400, 'The marks cannot be more than the total.');
  const branch = await branchId(db, BRANCH, true);
  const id = /^[0-9a-f-]{36}$/i.test(String(body?.id || '')) ? String(body.id) : randomUUID();
  const key = `${ROW}${id}`;
  const { data: old } = await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', key).maybeSingle();
  if (body?.id && !old) throw fail(404, 'That interview was not found.');
  const now = new Date().toISOString();
  const record: LocumInterview = {
    id, name, mmc: clean(body?.mmc, 40), phone: clean(body?.phone, 40), branch: clean(body?.branch, 60), workplace: clean(body?.workplace, 600), interviewer: clean(body?.interviewer, 120),
    date: date(body?.date), timeStart: time(body?.timeStart), timeEnd: time(body?.timeEnd), experience: clean(body?.experience, 3000), skills: clean(body?.skills, 3000),
    marks, outOf, suggestion: clean(body?.suggestion, 3000), savedBy: by, createdAt: old?.payload?.createdAt || now, updatedAt: now,
  };
  const { error } = await db.from('portal_state').upsert({ branch_id: branch, state_key: key, payload: record, updated_by: await ownerProfile(db, userId), updated_at: now }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return record;
}

export async function locumInterviewDelete(db: any, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail(400, 'That interview was not found.');
  const branch = await branchId(db, BRANCH, false);
  if (!branch) return;
  const { error } = await db.from('portal_state').delete().eq('branch_id', branch).eq('state_key', `${ROW}${id}`);
  if (error) throw error;
}
