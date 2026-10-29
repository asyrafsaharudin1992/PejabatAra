import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, History, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card, input } from './AssessmentStaff';
import { LEAVE_GROUPS } from './lib/leaveTypes';

// Office HR staff profiles: the employee master for leave, attendance and payroll.
// The directory shows only names and jobs; a full profile (IC, address, bank, statutory
// numbers) is loaded one person at a time, with IC and bank details hidden until shown.
const API = '/api/status?resource=hr';

type Child = { name: string; dateOfBirth: string | null; studying: boolean; disabled: boolean };
type Allowance = { name: string; amount: number };
export type Employee = {
  id?: string; company: 'KJ' | 'SK' | ''; employeeCode: string; fullName: string; assessmentStaffId?: string | null;
  icNo: string; passportNo: string; nationality: string; gender: '' | 'Male' | 'Female'; dateOfBirth: string | null; religion: string;
  maritalStatus: '' | 'Single' | 'Married' | 'Divorced' | 'Widowed'; spouseWorking: boolean | null; children: Child[]; phone: string; email: string; address: string;
  emergencyName: string; emergencyRelation: string; emergencyPhone: string;
  branch: string; department: string; designation: string; employmentType: string; joinDate: string | null; confirmDate: string | null; resignDate: string | null;
  status: string; workDays?: number[]; holidayGroup?: string; leaveCalendarCompanies?: string[]; leaveApproverId?: string | null; leaveBackupApproverId?: string | null; finalApproverId?: string | null; leaveGroup: string; basicSalary: number; fixedAllowances: Allowance[]; bankName: string; bankAccount: string; epfNo: string; socsoNo: string; taxNo: string; remarks: string; updatedAt?: string;
};
type Summary = Pick<Employee, 'id' | 'company' | 'employeeCode' | 'fullName' | 'branch' | 'department' | 'designation' | 'employmentType' | 'status' | 'joinDate'> & { signIn?: 'none' | 'not_set' | 'set'; leaveApproverId?: string | null; leaveBackupApproverId?: string | null; finalApproverId?: string | null };
type Audit = { action: string; changes: Record<string, [unknown, unknown]>; at: string; by: string };

const blank = (): Employee => ({ company: '', employeeCode: '', fullName: '', icNo: '', passportNo: '', nationality: 'Malaysian', gender: '', dateOfBirth: null, religion: '', maritalStatus: '', spouseWorking: null, children: [], phone: '', email: '', address: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '', branch: '', department: '', designation: '', employmentType: 'Permanent', joinDate: null, confirmDate: null, resignDate: null, status: 'Active', leaveGroup: 'AL', basicSalary: 0, fixedAllowances: [], bankName: '', bankAccount: '', epfNo: '', socsoNo: '', taxNo: '', remarks: '' });
const dmy = (date: string | null) => date ? date.split('-').reverse().join('/') : '—';
const masked = (value: string) => value ? `•••• ${value.replace(/\s/g, '').slice(-4)}` : '—';
const money = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Years and months since joining, for the profile header and (later) leave entitlement.
function service(joinDate: string | null) {
  if (!joinDate) return '';
  const [y, m, d] = joinDate.split('-').map(Number);
  const now = new Date();
  let months = (now.getFullYear() - y) * 12 + now.getMonth() + 1 - m - (now.getDate() < d ? 1 : 0);
  if (months < 0) months = 0;
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}
const STATUS_TONE: Record<string, string> = { Active: 'bg-emerald-50 text-emerald-700', Inactive: 'bg-slate-100 text-slate-500' };
const FIELD_LABEL: Record<string, string> = { full_name: 'Full name', employee_code: 'Employee code', company: 'Company', ic_no: 'IC', bank_account: 'Bank account', basic_salary: 'Basic salary', branch: 'Branch', department: 'Department', designation: 'Designation', status: 'Status', address: 'Address', phone: 'Phone', marital_status: 'Marital status', children: 'Children', fixed_allowances: 'Allowances' };
// IC, bank and salary changes are shown without their values in the history.
const SECRET = new Set(['ic_no', 'passport_no', 'bank_account', 'basic_salary', 'fixed_allowances', 'epf_no', 'socso_no', 'tax_no']);

async function api(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}

export function HRProfiles({ onError }: { onError: (message: string) => void }) {
  const [employees, setEmployees] = useState<Summary[] | null>(null);
  const [notSetUp, setNotSetUp] = useState('');
  const [openId, setOpenId] = useState('');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('Active');
  const [sort, setSort] = useState<{ key: keyof Summary; dir: 1 | -1 }>({ key: 'employeeCode', dir: 1 });

  const load = async () => {
    try { setEmployees((await api('action=employees')).employees); setNotSetUp(''); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Unable to load staff.'; if (message.includes('not set up')) setNotSetUp(message); else onError(message); setEmployees([]); }
  };
  useEffect(() => { void load(); }, []);

  if (adding) return <ProfileEditor employee={blank()} onCancel={() => setAdding(false)} onSaved={async (saved) => { setAdding(false); await load(); setOpenId(saved.id || ''); }} onError={onError} />;
  if (openId) return <ProfileView id={openId} onBack={() => { setOpenId(''); void load(); }} onError={onError} />;

  // Clears a staff member's sign-in password: they sign in with the last 4 IC digits and choose a new one.
  const resetSignIn = async (row: Summary) => {
    if (!window.confirm(`Reset the sign-in password of ${row.fullName}? They will sign in with the last 4 digits of their IC and choose a new one.`)) return;
    try { const result = await api('action=reset_sign_in', { id: row.id }); if (result.error) throw new Error(result.error); await load(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to reset the password.'); }
  };
  // Who approves a person's leave: any active staff member except themselves.
  const approvers = (employees || []).filter((row) => row.status === 'Active').sort((a, b) => a.fullName.localeCompare(b.fullName));
  const approverName = (id?: string | null) => (employees || []).find((row) => row.id === id)?.fullName || '';
  const assignApprover = async (ids: string[], approverId: string, level: 'supervisor' | 'backup' | 'final' = 'supervisor') => {
    const before = employees, key = level === 'final' ? 'finalApproverId' : level === 'backup' ? 'leaveBackupApproverId' : 'leaveApproverId';
    setEmployees((current) => (current || []).map((row) => ids.includes(row.id || '') ? { ...row, [key]: approverId || null } : row));
    try { const result = await api('action=assign_leave_approver', { ids, approverId, level }); if (result.error) throw new Error(result.error); }
    catch (cause) { setEmployees(before); onError(cause instanceof Error ? cause.message : 'Unable to set the leave approver.'); }
  };
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (employees || []).filter((row) => (!company || row.company === company) && (!status || row.status === status) && words.every((word) => `${row.fullName} ${row.employeeCode} ${row.designation} ${row.department}`.toLowerCase().includes(word)));
  // Sorted by the chosen column; ties keep company then code order.
  const sorted = [...shown].sort((a, b) => {
    const left = sort.key === 'leaveApproverId' || sort.key === 'leaveBackupApproverId' || sort.key === 'finalApproverId' ? approverName(a[sort.key]) : String(a[sort.key] ?? ''), right = sort.key === 'leaveApproverId' || sort.key === 'leaveBackupApproverId' || sort.key === 'finalApproverId' ? approverName(b[sort.key]) : String(b[sort.key] ?? '');
    return (left.localeCompare(right, undefined, { numeric: true }) || a.company.localeCompare(b.company) || a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true })) * sort.dir;
  });
  const columns: { key: keyof Summary; label: string; className?: string }[] = [
    { key: 'employeeCode', label: 'Code', className: 'w-[120px]' }, { key: 'fullName', label: 'Name' }, { key: 'designation', label: 'Position' },
    { key: 'department', label: 'Department', className: 'w-[140px]' }, { key: 'company', label: 'Branch', className: 'w-[160px]' },
    { key: 'joinDate', label: 'Joined', className: 'w-[110px]' }, { key: 'signIn', label: 'Sign-in', className: 'w-[170px]' }, { key: 'leaveApproverId', label: 'Leave supervisor', className: 'w-[200px]' }, { key: 'leaveBackupApproverId', label: 'Backup officer', className: 'w-[200px]' }, { key: 'finalApproverId', label: 'Final approver', className: 'w-[200px]' }, { key: 'employmentType', label: 'Type', className: 'w-[100px]' }, { key: 'status', label: 'Status', className: 'w-[100px]' },
  ];
  const statusTone: Record<string, string> = { Active: 'bg-emerald-50 text-emerald-700', Inactive: 'bg-slate-100 text-slate-500' };
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Staff profiles</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Each staff member's personal, employment and pay details. Leave, attendance and payroll are worked out from these. IC and bank details stay hidden until you show them, and every change is logged.</p></div>{!notSetUp && <button onClick={() => setAdding(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b3d59] hover:bg-[#e9f6fb]"><UserPlus className="h-4 w-4" />Add staff</button>}</div></section>
    {notSetUp && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{notSetUp}</p>}
    {!notSetUp && <details className={card}><summary className="cursor-pointer font-semibold text-[#0b587b]">New staff: what HR does, step by step</summary>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
        <li><strong>Add the profile.</strong> Press <em>Add staff</em> and fill in the company, staff code, full name, <strong>join date</strong> (leave is worked out from it), job title, department and the <strong>IC number</strong>.</li>
        <li><strong>Create their sign-in.</strong> Open the profile, and in the <em>Individual sign-in</em> box type the short name they will use (for example “Ali”), then press <em>Create sign-in</em>. They sign in with that name, their staff code and the <strong>last 4 digits of their IC</strong>, then choose their own password.</li>
        <li><strong>Choose who approves their leave.</strong> In this list set the <em>Leave supervisor</em>, optional <em>Backup officer</em>, and the <em>Final approver</em>. A backup officer can decide at the supervisor level when the supervisor is unavailable. On the profile, match the working days and public holiday group to that staff member's Infotech assignment (SG-MNG, SG-OPS, NO-PH or MLHL).</li>
        <li><strong>Set up their leave balance.</strong> Go to <em>Leave → Staff leave → Company policy</em>, tick them, check their category (administrative officer, or doctor / clinic assistant) and press <em>Apply</em>. Their annual, sick, hospital, marriage, Haji and unpaid leave are created from the company policy and their join date. In the year they join, annual leave is shared by month (for example, joining on 1 October gives 3 of 12 months: 2 days of 8 in that year); from the next 1 January they have the full amount.</li>
        <li><strong>Shift staff only:</strong> add their shifts in <em>Roster</em> (upload the monthly CSV). Office staff use their working days and need no roster.</li>
        <li><strong>Tell them</strong> how to sign in: <em>Individual Sign In</em> on the AraOffice page, then <em>Leave</em> to apply.</li>
      </ol>
      <p className="mt-4 text-xs text-slate-400">When someone leaves the company, change their status to Resigned. Their leave history stays.</p></details>}
    {!notSetUp && <section className={`${card} flex flex-wrap items-center gap-3`}>
      <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, job or department" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <select value={company} onChange={(event) => setCompany(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ & SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Any status</option>{['Active', 'Inactive'].map((item) => <option key={item}>{item}</option>)}</select>
      <select value="" onChange={(event) => { const target = event.target.value; if (!target || !shown.length) return; if (window.confirm(`Make ${approverName(target)} the leave approver of the ${shown.filter((row) => row.id !== target).length} staff shown?`)) void assignApprover(shown.filter((row) => row.id !== target).map((row) => row.id || ''), target); }} aria-label="Set the leave approver for all staff shown" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Set leave supervisor for all shown…</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
      <select value="" onChange={(event) => { const target = event.target.value; if (!target || !shown.length) return; if (window.confirm(`Make ${approverName(target)} the backup leave officer of the ${shown.filter((row) => row.id !== target).length} staff shown?`)) void assignApprover(shown.filter((row) => row.id !== target).map((row) => row.id || ''), target, 'backup'); }} aria-label="Set backup leave officer for all staff shown" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Set backup officer for all shown…</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
      <select value="" onChange={(event) => { const target = event.target.value; if (!target || !shown.length) return; if (window.confirm(`Make ${approverName(target)} the final approver of the ${shown.filter((row) => row.id !== target).length} staff shown?`)) void assignApprover(shown.filter((row) => row.id !== target).map((row) => row.id || ''), target, 'final'); }} aria-label="Set the final approver for all staff shown" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Set final approver for all shown…</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
      <span className="ml-auto text-xs text-slate-400">{employees ? `${shown.length} of ${employees.length}` : 'Loading…'}</span>
    </section>}
    {employees && !employees.length && !notSetUp && <p className={`${card} text-sm text-slate-500`}>No staff profiles yet. Press Add staff, or import them from Infotech.</p>}
    {employees && employees.length > 0 && !notSetUp && <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_35px_rgba(20,35,59,0.08)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1550px] text-left text-sm">
          <thead className="bg-[#f7fafc]"><tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            <th className="w-12 px-4 py-3.5">No</th>
            {columns.map((column) => <th key={column.key} className={`px-4 py-3.5 ${column.className || ''}`}><button type="button" onClick={() => setSort((current) => ({ key: column.key, dir: current.key === column.key ? (current.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-[#0b587b]">{column.label}<span className={sort.key === column.key ? 'text-[#0b587b]' : 'opacity-0'}>{sort.dir === 1 ? '▲' : '▼'}</span></button></th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, index) => <tr key={row.id} onClick={() => setOpenId(row.id || '')} className={`cursor-pointer transition hover:bg-[#f4fafd] ${row.status !== 'Active' ? 'text-slate-400' : ''}`}>
              <td className="px-4 py-3 text-xs text-slate-400">{index + 1}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.employeeCode}</td>
              <td className="px-4 py-3"><span className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f6fb] text-[11px] font-bold text-[#0b587b]">{row.fullName.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span><span className="font-semibold text-[#14233b]">{row.fullName}</span></span></td>
              <td className="px-4 py-3">{row.designation || '—'}</td>
              <td className="px-4 py-3">{row.department || '—'}</td>
              <td className="px-4 py-3"><span className="mr-2 rounded-md bg-[#eaf6fb] px-1.5 py-0.5 text-[10px] font-bold text-[#0b587b]">{row.company}</span>{row.branch || '—'}</td>
              <td className="px-4 py-3 whitespace-nowrap">{dmy(row.joinDate)}</td>
              <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{row.signIn === 'set' ? <span className="flex items-center gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Password set</span><button onClick={() => void resetSignIn(row)} className="text-xs font-semibold text-rose-600 hover:underline">Reset</button></span> : row.signIn === 'not_set' ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Not set yet</span> : <span className="text-xs text-slate-300">No sign-in</span>}</td>
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{row.status === 'Active' ? <select value={row.leaveApproverId || ''} onChange={(event) => void assignApprover([row.id || ''], event.target.value)} aria-label={`Leave approver for ${row.fullName}`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">— Not set —</option>{approvers.filter((person) => person.id !== row.id).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select> : <span className="text-xs text-slate-300">—</span>}</td>
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{row.status === 'Active' ? <select value={row.leaveBackupApproverId || ''} onChange={(event) => void assignApprover([row.id || ''], event.target.value, 'backup')} aria-label={`Backup leave officer for ${row.fullName}`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">— Not set —</option>{approvers.filter((person) => person.id !== row.id).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select> : <span className="text-xs text-slate-300">—</span>}</td>
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{row.status === 'Active' ? <select value={row.finalApproverId || ''} onChange={(event) => void assignApprover([row.id || ''], event.target.value, 'final')} aria-label={`Final approver for ${row.fullName}`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">— Not set —</option>{approvers.filter((person) => person.id !== row.id).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select> : <span className="text-xs text-slate-300">—</span>}</td>
              <td className="px-4 py-3">{row.employmentType}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone[row.status] || 'bg-slate-100 text-slate-500'}`}>{row.status}</span></td>
            </tr>)}
            {sorted.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-500">No staff match this search.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>}
  </div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex gap-3 py-2 text-sm"><dt className="w-40 shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 flex-1 break-words">{children || '—'}</dd></div>;
}

const WEEK = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]] as const;
// The weekdays a person works. Leave is counted only on these days, so a rest day is never taken off the balance.
function WorkDaysCard({ employeeId, days, onSaved, onError }: { employeeId: string; days: number[]; onSaved: () => void; onError: (message: string) => void }) {
  const [picked, setPicked] = useState<number[]>(days);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPicked(days); }, [days.join(',')]);
  const changed = [...picked].sort().join(',') !== [...days].sort().join(',');
  const save = async () => {
    setSaving(true);
    try { const result = await api('action=set_work_days', { id: employeeId, days: picked }); if (result.error) throw new Error(result.error); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the working days.'); }
    setSaving(false);
  };
  return <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Working days</h3><p className="mt-1 text-sm text-slate-600">Leave is counted only on the days this person works.</p></div>
    <div className="flex flex-wrap items-center gap-2">{WEEK.map(([label, value]) => { const on = picked.includes(value); return <button key={label} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((day) => day !== value) : [...picked, value])} className={`h-10 w-12 rounded-xl border text-xs font-semibold transition ${on ? 'border-[#0b587b] bg-[#0b587b] text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>{label}</button>; })}
      <button type="button" onClick={() => void save()} disabled={!changed || saving || !picked.length} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button></div></div></section>;
}

// Which public holidays are left out of this person's leave days (the groups are the ones set up in Infotech).
const HOLIDAY_GROUPS: [string, string][] = [['', 'None'], ['SG-MNG', 'SG-MNG · Selangor management'], ['SG-OPS', 'SG-OPS · Selangor operations'], ['MLHL', 'MLHL · Malaysia holiday'], ['NO-PH', 'NO-PH · no public holiday']];
function HolidayGroupCard({ employeeId, group, onSaved, onError }: { employeeId: string; group: string; onSaved: () => void; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const change = async (next: string) => {
    setSaving(true);
    try { const result = await api('action=set_holiday_group', { id: employeeId, group: next }); if (result.error) throw new Error(result.error); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the holiday group.'); }
    setSaving(false);
  };
  return <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Public holiday group</h3><p className="mt-1 text-sm text-slate-600">Management and admin groups (SG-MNG, MLHL) do not use leave on public holidays. Operations staff (SG-OPS) work through them, so their duty roster decides each day.</p></div>
    <select value={group} disabled={saving} onChange={(event) => void change(event.target.value)} aria-label="Public holiday group" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50">{HOLIDAY_GROUPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></section>;
}

function CalendarAccessCard({ employeeId, companies, onSaved, onError }: { employeeId: string; companies: string[]; onSaved: () => void; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const value = [...companies].sort().join(',');
  const change = async (next: string) => {
    setSaving(true);
    try { const result = await api('action=set_leave_calendar_access', { id: employeeId, companies: next ? next.split(',') : [] }); if (result.error) throw new Error(result.error); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save calendar access.'); }
    finally { setSaving(false); }
  };
  return <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Leave calendar access</h3><p className="mt-1 text-sm text-slate-600">Match the staff member's Infotech access. Company access includes every department in the selected company.</p></div><select aria-label="Leave calendar access" value={value} disabled={saving} onChange={event => void change(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"><option value="">Own company and department</option><option value="KJ">All KJ departments</option><option value="SK">All SK departments</option><option value="KJ,SK">All KJ and SK departments</option></select></div></section>;
}

// A staff member with no individual sign-in yet: HR types the short name they will sign in with (as the other staff do, for example "Ali").
function CreateSignIn({ employeeId, fullName, hasIc, onDone, onError }: { employeeId: string; fullName: string; hasIc: boolean; onDone: () => Promise<void> | void; onError: (message: string) => void }) {
  const guess = fullName.split(/\s+/).filter((word) => !/^(nur|nurul|siti|muhammad|mohamad|mohd|ahmad)$/i.test(word))[0] || fullName.split(/\s+/)[0] || '';
  const [name, setName] = useState(guess.charAt(0).toUpperCase() + guess.slice(1).toLowerCase());
  const [saving, setSaving] = useState(false);
  const create = async () => {
    setSaving(true);
    try { const result = await api('action=create_sign_in', { id: employeeId, name }); if (result.error) throw new Error(result.error); await onDone(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to create the sign-in.'); }
    setSaving(false);
  };
  return <div className="flex flex-wrap items-center gap-2">
    <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Name to sign in with" placeholder="Name to sign in with" className="h-10 w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
    <button type="button" onClick={() => void create()} disabled={saving || name.trim().length < 2 || !hasIc} title={hasIc ? '' : 'Add the IC number to the profile first (the last 4 digits are their first password)'} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Creating…' : 'Create sign-in'}</button>
  </div>;
}

function ProfileView({ id, onBack, onError }: { id: string; onBack: () => void; onError: (message: string) => void }) {
  const [data, setData] = useState<{ employee: Employee; audit: Audit[]; signIn?: { linked: boolean; hasPassword: boolean | null } } | null>(null);
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const load = async () => { try { setData(await api(`action=employee&id=${encodeURIComponent(id)}`)); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load profile.'); } };
  useEffect(() => { void load(); }, [id]);
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const e = data.employee;
  if (editing) return <ProfileEditor employee={e} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await load(); }} onError={onError} />;
  const secret = (value: string) => reveal ? value || '—' : masked(value);
  // Email and phone numbers stay hidden until the button is pressed too: only the end is shown.
  const hiddenEmail = (value: string) => reveal || !value ? value : `${value.slice(0, 1)}•••@${value.split('@')[1] || '•••'}`;
  const hiddenPhone = (value: string) => reveal || !value ? value : masked(value);
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All staff</button><span className="flex gap-2"><button onClick={() => setReveal(!reveal)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]">{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{reveal ? 'Hide private details' : 'Show private details'}</button><button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#083a55]"><Pencil className="h-4 w-4" />Edit</button></span></div>
    <section className="ara-hero rounded-[28px] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">{e.company} · {e.employeeCode}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{e.fullName}</h2><p className="mt-2 text-[#b9cfdd]"><span className={`mr-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[e.status]}`}>{e.status}</span>{[e.designation, e.department, e.branch].filter(Boolean).join(' · ')}{e.joinDate ? ` · joined ${dmy(e.joinDate)} (${service(e.joinDate)})` : ''}</p></section>
    <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Individual sign-in</h3><p className="mt-1 text-sm text-slate-600">{!data.signIn?.linked ? 'No individual sign-in yet (Assessment Room, Incentive Claims).' : data.signIn.hasPassword === null ? 'Sign-in password status is not available yet.' : data.signIn.hasPassword ? 'Has chosen their own password.' : 'Has not chosen a password yet: signs in with the last 4 digits of their IC and is asked to choose one.'}</p></div>{!data.signIn?.linked ? <CreateSignIn employeeId={id} fullName={data.employee.fullName} hasIc={Boolean(data.employee.icNo)} onDone={load} onError={onError} /> : null}<button disabled={!data.signIn?.linked || !data.signIn.hasPassword} title={data.signIn?.hasPassword ? '' : 'There is no password to reset yet'} onClick={async () => { if (!window.confirm(`Reset the sign-in password of ${data.employee.fullName}? They will sign in with the last 4 digits of their IC and choose a new one.`)) return; try { const result = await api('action=reset_sign_in', { id }); if (result.error) throw new Error(result.error); await load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to reset.'); } }} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Reset password</button></div></section>
    <WorkDaysCard employeeId={id} days={e.workDays || [1, 2, 3, 4, 5, 6]} onSaved={load} onError={onError} />
    <HolidayGroupCard employeeId={id} group={e.holidayGroup || ''} onSaved={load} onError={onError} />
    <CalendarAccessCard employeeId={id} companies={e.leaveCalendarCompanies || []} onSaved={load} onError={onError} />
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}><h3 className="font-semibold">Personal</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="IC no.">{secret(e.icNo)}</Row>{e.passportNo && <Row label="Passport no.">{secret(e.passportNo)}</Row>}<Row label="Nationality">{e.nationality}</Row><Row label="Gender">{e.gender}</Row><Row label="Date of birth">{dmy(e.dateOfBirth)}</Row><Row label="Religion">{e.religion}</Row><Row label="Phone">{hiddenPhone(e.phone)}</Row><Row label="Email">{hiddenEmail(e.email)}</Row><Row label="Address"><span className="whitespace-pre-line">{e.address}</span></Row>
      </dl></section>
      <section className={card}><h3 className="font-semibold">Employment</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="Company">{e.company === 'KJ' ? 'KJ- HSO Healthcare Sdn Bhd' : e.company === 'SK' ? 'SK- HSO Healthcare Sdn Bhd' : ''}</Row><Row label="Branch">{e.branch}</Row><Row label="Department">{e.department}</Row><Row label="Designation">{e.designation}</Row><Row label="Employment type">{e.employmentType}</Row><Row label="Joined">{dmy(e.joinDate)}</Row><Row label="Confirmed">{dmy(e.confirmDate)}</Row>{e.resignDate && <Row label="Left">{dmy(e.resignDate)}</Row>}<Row label="Leave group">{LEAVE_GROUPS.find((group) => group.code === e.leaveGroup)?.name || e.leaveGroup}</Row>
      </dl></section>
      <section className={card}><h3 className="font-semibold">Pay & statutory</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="Basic salary">{reveal ? money(e.basicSalary) : '••••'}</Row><Row label="Fixed allowances">{reveal ? (e.fixedAllowances.length ? e.fixedAllowances.map((item) => `${item.name} ${money(item.amount)}`).join(', ') : 'None') : '••••'}</Row><Row label="Bank">{e.bankName}</Row><Row label="Account no.">{secret(e.bankAccount)}</Row><Row label="KWSP no.">{secret(e.epfNo)}</Row><Row label="PERKESO no.">{secret(e.socsoNo)}</Row><Row label="Income tax no.">{secret(e.taxNo)}</Row>
      </dl></section>
      <section className={card}><h3 className="font-semibold">Family & emergency</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="Marital status">{e.maritalStatus}</Row>{e.maritalStatus === 'Married' && <Row label="Spouse working">{e.spouseWorking === null ? '' : e.spouseWorking ? 'Yes' : 'No'}</Row>}<Row label="Children">{e.children.length ? e.children.map((child) => `${child.name}${child.dateOfBirth ? ` (${dmy(child.dateOfBirth)})` : ''}${child.studying ? ', studying' : ''}${child.disabled ? ', OKU' : ''}`).join('; ') : 'None'}</Row><Row label="Emergency contact">{[e.emergencyName, e.emergencyRelation, hiddenPhone(e.emergencyPhone)].filter(Boolean).join(' · ')}</Row>
      </dl></section>
    </div>
    {e.remarks && <section className={card}><h3 className="font-semibold">Remarks</h3><p className="mt-2 whitespace-pre-line text-sm">{e.remarks}</p></section>}
      <section className={card}><h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-slate-400" />Change history</h3>
      {!data.audit.length ? <p className="mt-2 text-sm text-slate-500">No changes yet.</p> : <ul className="mt-3 space-y-2 text-sm">{data.audit.map((item, i) => <li key={i} className="flex flex-wrap gap-x-2 text-slate-600"><span className="text-slate-400">{new Date(item.at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className="font-semibold text-[#14233b]">{item.by || 'Someone'}</span><span>{item.action === 'create' ? 'created the profile' : `changed ${Object.keys(item.changes).map((key) => SECRET.has(key) ? (FIELD_LABEL[key] || key.replace(/_/g, ' ')) : `${FIELD_LABEL[key] || key.replace(/_/g, ' ')}`).join(', ')}`}</span></li>)}</ul>}
    </section>
  </div>;
}

function ProfileEditor({ employee, onCancel, onSaved, onError }: { employee: Employee; onCancel: () => void; onSaved: (saved: Employee) => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<Employee>(employee);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Employee>(key: K, value: Employee[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try { const result = await api('action=save_employee', { action: 'save_employee', employee: draft }); await onSaved(result.employee); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    finally { setSaving(false); }
  };
  const field = (label: string, key: keyof Employee, type = 'text', placeholder = '') => <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span><input type={type} value={(draft[key] as string | number | null) ?? ''} onChange={(event) => set(key, (type === 'number' ? Number(event.target.value) : type === 'date' ? event.target.value || null : event.target.value) as never)} placeholder={placeholder} className={input} /></label>;
  const choice = (label: string, key: keyof Employee, options: string[], blankLabel = '—') => <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span><select value={(draft[key] as string) ?? ''} onChange={(event) => set(key, event.target.value as never)} className={input}>{options.map((option) => <option key={option} value={option}>{option || blankLabel}</option>)}</select></label>;
  const section = (title: string, children: ReactNode) => <section className={card}><h3 className="font-semibold">{title}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div></section>;
  const departments = useMemo(() => ['', 'OPERATION', 'OPR - DR RESIDENT', 'ADMIN'], []);
  return <form onSubmit={submit} className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />Cancel</button><button disabled={saving} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : employee.id ? 'Save changes' : 'Add staff'}</button></div>
    <section className="ara-hero rounded-[28px] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">{employee.id ? 'Edit profile' : 'New staff'}</p><h2 className="mt-2 text-2xl font-semibold">{draft.fullName || 'Staff profile'}</h2></section>
    {section('Identity', <>{choice('Company', 'company', ['', 'KJ', 'SK'], 'Choose…')}{field('Employee code', 'employeeCode', 'text', 'e.g. ARASK0001')}{field('Full name (as in IC)', 'fullName')}{field('IC no.', 'icNo', 'text', '900101-10-1234')}{field('Passport no. (non-Malaysian)', 'passportNo')}{field('Nationality', 'nationality')}{choice('Gender', 'gender', ['', 'Male', 'Female'])}{field('Date of birth', 'dateOfBirth', 'date')}{field('Religion', 'religion')}</>)}
    {section('Contact', <>{field('Phone', 'phone', 'tel')}{field('Email', 'email', 'email')}<label className="block sm:col-span-2 lg:col-span-1"><span className="mb-1.5 block text-xs font-bold text-slate-700">Address</span><textarea value={draft.address} onChange={(event) => set('address', event.target.value)} rows={3} className={`${input} h-auto py-3`} /></label>{field('Emergency contact name', 'emergencyName')}{field('Relationship', 'emergencyRelation')}{field('Emergency phone', 'emergencyPhone', 'tel')}</>)}
    {section('Employment', <>{field('Branch', 'branch', 'text', 'Kajang / Seri Kembangan')}{choice('Department', 'department', departments)}{field('Designation', 'designation', 'text', 'e.g. Clinic Assistant')}{choice('Employment type', 'employmentType', ['Permanent', 'Contract', 'Part-time', 'Locum', 'Intern'])}{field('Join date', 'joinDate', 'date')}{field('Confirm date', 'confirmDate', 'date')}{choice('Status', 'status', ['Active', 'Inactive'])}{field('Last day (if left)', 'resignDate', 'date')}{choice('Leave group', 'leaveGroup', ['', ...LEAVE_GROUPS.map((group) => group.code)])}</>)}
    {section('Pay & statutory', <>{field('Basic salary (RM)', 'basicSalary', 'number')}{field('Bank', 'bankName', 'text', 'e.g. Maybank')}{field('Account no.', 'bankAccount')}{field('KWSP no.', 'epfNo')}{field('PERKESO no.', 'socsoNo')}{field('Income tax no.', 'taxNo')}
      <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1.5 text-xs font-bold text-slate-700">Fixed allowances (every month)</p><div className="space-y-2">{draft.fixedAllowances.map((item, i) => <div key={i} className="flex gap-2"><input value={item.name} onChange={(event) => set('fixedAllowances', draft.fixedAllowances.map((row, j) => j === i ? { ...row, name: event.target.value } : row))} placeholder="Allowance" className={input} /><input type="number" value={item.amount} onChange={(event) => set('fixedAllowances', draft.fixedAllowances.map((row, j) => j === i ? { ...row, amount: Number(event.target.value) } : row))} placeholder="RM" className={`${input} max-w-[140px]`} /><button type="button" onClick={() => set('fixedAllowances', draft.fixedAllowances.filter((_, j) => j !== i))} className="rounded-xl px-3 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove allowance"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => set('fixedAllowances', [...draft.fixedAllowances, { name: '', amount: 0 }])} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add allowance</button></div></div></>)}
    {section('Family (for PCB)', <>{choice('Marital status', 'maritalStatus', ['', 'Single', 'Married', 'Divorced', 'Widowed'])}{draft.maritalStatus === 'Married' && <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Spouse working</span><select value={draft.spouseWorking === null ? '' : draft.spouseWorking ? 'yes' : 'no'} onChange={(event) => set('spouseWorking', event.target.value === '' ? null : event.target.value === 'yes')} className={input}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
      <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1.5 text-xs font-bold text-slate-700">Children</p><div className="space-y-2">{draft.children.map((child, i) => <div key={i} className="flex flex-wrap items-center gap-2"><input value={child.name} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, name: event.target.value } : row))} placeholder="Name" className={`${input} min-w-[180px] flex-1`} /><input type="date" value={child.dateOfBirth || ''} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, dateOfBirth: event.target.value || null } : row))} className={`${input} max-w-[180px]`} /><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={child.studying} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, studying: event.target.checked } : row))} />Studying</label><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={child.disabled} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, disabled: event.target.checked } : row))} />OKU</label><button type="button" onClick={() => set('children', draft.children.filter((_, j) => j !== i))} className="rounded-xl px-3 py-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove child"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => set('children', [...draft.children, { name: '', dateOfBirth: null, studying: false, disabled: false }])} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add child</button></div></div></>)}
    <section className={card}><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Remarks</span><textarea value={draft.remarks} onChange={(event) => set('remarks', event.target.value)} rows={3} className={`${input} h-auto py-3`} /></label></section>
  </form>;
}
