import { branchId } from './_office-db.js';
import { bodyLines } from '../src/lib/memoLinks.js';

// Announcements are written in the Clinical Assistants workspace; staff record that they have read one from their
// own Individual Sign In. Shared by that sign-in (api/_assessment.ts) and the CA office (api/ca-state.ts).
export const CA_BRANCH = 'AraSpace Clinical Assistants';
export const WORKSPACE_KEY = 'ca_workspace';
export const READS_KEY = 'ca_announcement_reads';
const SHARED_BRANCH = 'AraOffice Shared';
const RESOURCES_KEY = 'reference_resources';
// Extra people who read announcements though their HR job title is not on the list (for testing, or a one-off reader).
// A record {ids: [assessment_staff id, ...]} beside the workspace; delete the record to take them off again.
const EXTRA_READERS_KEY = 'ca_announcement_extra_readers';

// Staff who must read announcements: the clinic assistants and the Clinical Admin of each branch (a Clinical Admin is
// "Admin Clinical" at SK and "Clinic Assistant Officer" at KJ). Doctors, other admin and management are not listed.
// Their job title comes from HR's record; preview and test accounts are left out.
const ANNOUNCEMENT_TITLES = /^(CLINIC ASSISTANT|CLINIC ASSISTANT OFFICER|ADMIN CLINICAL)$/i;
export async function announcementStaff(db: any) {
  const caBranch = await branchId(db, CA_BRANCH, false);
  const [{ data, error }, { data: employees, error: employeeError }, { data: extraRow }] = await Promise.all([
    db.from('assessment_staff').select('id,name,branch').eq('active', true).eq('can_preview', false).neq('branch', 'Test').order('branch').order('name'),
    db.from('hr_employees').select('assessment_staff_id,designation').eq('status', 'Active'),
    caBranch ? db.from('portal_state').select('payload').eq('branch_id', caBranch).eq('state_key', EXTRA_READERS_KEY).maybeSingle() : { data: null },
  ]);
  if (error) throw error;
  if (employeeError) throw employeeError;
  const listed = new Set<string>(extraRow?.payload?.ids || []);
  for (const row of employees || []) if (row.assessment_staff_id && ANNOUNCEMENT_TITLES.test(String(row.designation || '').trim())) listed.add(row.assessment_staff_id);
  return (data || []).filter((item: any) => listed.has(item.id)).map((item: any) => ({ id: item.id, name: item.name, branch: item.branch }));
}

const loadRow = async (db: any, branch: string, key: string) => {
  const { data, error } = await db.from('portal_state').select('payload,updated_by').eq('branch_id', branch).eq('state_key', key).maybeSingle();
  if (error) throw error;
  return data as { payload: any; updated_by: string } | null;
};
const loadState = async (db: any, branch: string, key: string) => (await loadRow(db, branch, key))?.payload || null;

// A memo is opened from its Google Drive link; anything else is not offered as a link.
const memoLink = (url: unknown) => /^https:\/\/(drive|docs)\.google\.com\//.test(String(url || '')) ? String(url) : '';

// What one signed-in person sees under Announcements: the announcements, newest first, whom each is for, and the memos
// each refers to. Everyone can read them; only staff on the reading list (listed) record that they have read one.
export async function announcementsFor(db: any, staffId: string, withMemos = true) {
  const caBranch = await branchId(db, CA_BRANCH, false);
  if (!caBranch) return { listed: false, items: [] };
  const staff = await announcementStaff(db);
  const listed = staff.some((item: any) => item.id === staffId);
  // The count on the icon only matters to listed staff, so it skips loading the announcements for everyone else.
  if (!listed && !withMemos) return { listed, items: [] };
  const sharedBranch = withMemos ? await branchId(db, SHARED_BRANCH, false) : null;
  const [workspace, stored, resources] = await Promise.all([loadState(db, caBranch, WORKSPACE_KEY), loadState(db, caBranch, READS_KEY), sharedBranch ? loadState(db, sharedBranch, RESOURCES_KEY) : null]);
  const reads: Record<string, Record<string, string>> = stored?.reads || {};
  const memos = new Map<string, { id: string; title: string; sourceUrl?: string }>((resources?.resources || []).map((item: any) => [item.id, item]));
  // Every memo that can be opened from Drive, so a memo named in the message becomes a link.
  const linkable = [...memos.values()].map((memo) => ({ title: memo.title, url: memoLink(memo.sourceUrl) })).filter((memo) => memo.url);
  const items = ((workspace?.announcements || []) as any[]).map((item) => ({
    id: item.id, title: item.title, audience: item.audience || 'Semua staf', body: item.body, lines: bodyLines(String(item.body || ''), linkable), date: item.date, important: item.priority === 'Penting',
    readAt: reads[item.id]?.[staffId] || null,
    memos: (Array.isArray(item.memoIds) ? item.memoIds : []).map((id: string) => memos.get(id)).filter(Boolean).map((memo: any) => ({ title: memo.title, url: memoLink(memo.sourceUrl) })),
  }));
  return { listed, items };
}

export async function recordRead(db: any, staffId: string, announcementId: string) {
  const caBranch = await branchId(db, CA_BRANCH, false);
  if (!caBranch) return false;
  const [workspaceRow, readsRow] = await Promise.all([loadRow(db, caBranch, WORKSPACE_KEY), loadRow(db, caBranch, READS_KEY)]);
  const stored = readsRow?.payload;
  const announcements: any[] = workspaceRow?.payload?.announcements || [];
  if (!announcements.some((item) => item.id === announcementId)) return false;
  const reads: Record<string, Record<string, string>> = stored?.reads || {};
  // Drop reads for deleted announcements while saving; a name already recorded keeps its first time.
  const next = Object.fromEntries(Object.entries(reads).filter(([id]) => announcements.some((item) => item.id === id)));
  next[announcementId] = { ...(next[announcementId] || {}) };
  next[announcementId][staffId] = next[announcementId][staffId] || new Date().toISOString();
  // Staff have no office profile, so the row keeps the profile that last wrote it (updated_by is required).
  const { error } = await db.from('portal_state').upsert({ branch_id: caBranch, state_key: READS_KEY, payload: { reads: next }, updated_by: (readsRow || workspaceRow)?.updated_by }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return true;
}
