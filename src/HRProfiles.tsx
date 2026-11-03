import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, History, Pencil, Printer, Plus, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card, input } from './AssessmentStaff';
import { HRProfileRequests } from './HRProfileRequests';
import { DocumentsPanel, type Doc } from './DocumentsPanel';
import { Pager, usePaged } from './Pager';
import { LEAVE_GROUPS } from './lib/leaveTypes';
import { StaffProfilePrint, useStaffProfilePrint } from './StaffProfilePrint';
import HRProjection from './HRProjection';
import HRStaffLocation from './HRStaffLocation';
import HRStaffContact from './HRStaffContact';

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
  race: string; foreignIdNo: string; addressLine1: string; addressLine2: string; postcode: string; city: string; state: string;
  spouseName: string; spouseIc: string; spouseEmployer: string; spousePhone: string; education: { level: string; institution: string; course: string; year: string }[];
  emergencyName: string; emergencyRelation: string; emergencyPhone: string;
  branch: string; department: string; designation: string; employmentType: string; joinDate: string | null; confirmDate: string | null; resignDate: string | null;
  status: string; workDays?: number[]; holidayGroup?: string; leaveCalendarCompanies?: string[]; leaveApproverId?: string | null; leaveBackupApproverId?: string | null; finalApproverId?: string | null; leaveGroup: string; basicSalary: number; fixedAllowances: Allowance[]; bankName: string; bankAccount: string; epfNo: string; socsoNo: string; taxNo: string; remarks: string; payroll?: Record<string, string | number | boolean>; updatedAt?: string;
};
type Summary = Pick<Employee, 'id' | 'company' | 'employeeCode' | 'fullName' | 'branch' | 'department' | 'designation' | 'employmentType' | 'status' | 'joinDate' | 'resignDate' | 'phone'> & { whatsappUsername?: string; shortName?: string; signIn?: 'none' | 'not_set' | 'set'; leaveApproverId?: string | null; leaveBackupApproverId?: string | null; finalApproverId?: string | null };
type Audit = { action: string; changes: Record<string, [unknown, unknown]>; at: string; by: string };

const blank = (): Employee => ({ company: '', employeeCode: '', fullName: '', icNo: '', passportNo: '', nationality: 'Malaysian', gender: '', dateOfBirth: null, religion: '', maritalStatus: '', spouseWorking: null, children: [], phone: '', email: '', address: '', race: '', foreignIdNo: '', addressLine1: '', addressLine2: '', postcode: '', city: '', state: '', spouseName: '', spouseIc: '', spouseEmployer: '', spousePhone: '', education: [], emergencyName: '', emergencyRelation: '', emergencyPhone: '', branch: '', department: '', designation: '', employmentType: 'Permanent', joinDate: null, confirmDate: null, resignDate: null, status: 'Active', leaveGroup: 'AL', basicSalary: 0, fixedAllowances: [], bankName: '', bankAccount: '', epfNo: '', socsoNo: '', taxNo: '', remarks: '' });
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
const FIELD_LABEL: Record<string, string> = { full_name: 'Full name', employee_code: 'Employee code', company: 'Company', ic_no: 'IC', bank_account: 'Bank account', basic_salary: 'Basic salary', branch: 'Branch', department: 'Department', designation: 'Designation', status: 'Status', address: 'Address', address_line1: 'Address line 1', address_line2: 'Address line 2', date_of_birth: 'Date of birth', religion: 'Religion', emergency_name: 'Emergency contact', emergency_relation: 'Emergency relationship', emergency_phone: 'Emergency phone', postcode: 'Postcode', city: 'City', state: 'State', race: 'Race', bank_name: 'Bank', epf_no: 'KWSP no.', socso_no: 'PERKESO no.', tax_no: 'Income tax no.', foreign_id_no: 'Foreign ID', spouse_name: 'Spouse', spouse_ic: 'Spouse IC', career_history: 'Employment history entries', spouse_employer: 'Spouse occupation', spouse_phone: 'Spouse phone', education: 'Education', phone: 'Phone', marital_status: 'Marital status', children: 'Children', fixed_allowances: 'Allowances', payroll_settings: 'Payroll settings', payroll_ytd: 'Year-to-date pay totals', payroll_ytd_previous: 'Year-to-date totals a month earlier', payslip_inputs: 'Month entered in Infotech', payslip_history: 'Past payslips (months)', payslip_fix: 'Corrected past payslips' };
// IC, bank and salary changes are shown without their values in the history.
const SECRET = new Set(['ic_no', 'passport_no', 'bank_account', 'basic_salary', 'fixed_allowances', 'epf_no', 'socso_no', 'tax_no']);

async function api(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}

export function HRProfiles({ onError, pendingRequests = 0, onPendingChange = () => undefined, initialTab = 'list' }: { onError: (message: string) => void; pendingRequests?: number; onPendingChange?: (pending: number) => void; initialTab?: 'list' | 'projection' }) {
  // Staff records, profile requests, sign-in directory and monthly CA projection.
  const [tab, setTab] = useState<'list' | 'requests' | 'directory' | 'contact' | 'projection'>(initialTab);
  const [employees, setEmployees] = useState<Summary[] | null>(null);
  const [notSetUp, setNotSetUp] = useState('');
  const [openId, setOpenId] = useState('');
  const [adding, setAdding] = useState(false);
  const [setupNotice, setSetupNotice] = useState('');
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('Active');
  const [sort, setSort] = useState<{ key: keyof Summary; dir: 1 | -1 }>({ key: 'employeeCode', dir: 1 });
  const [importNotice, setImportNotice] = useState('');
  // What an import would fill, shown for HR to confirm; nothing is saved until then.
  const [importPlan, setImportPlan] = useState<{ rows: unknown[]; staff: number; updated: number; counts: Record<string, number>; unknown: string[]; saving: boolean } | null>(null);
  // Fills blank details (birth date, religion, race, address, spouse, children, emergency contact) from the files read off Infotech.
  // It shows what would be filled first, and never overwrites a detail that is already there.
  const importFromInfotech = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files || [])]; event.target.value = '';
    if (!files.length) return;
    setImportNotice(''); setImportPlan(null);
    try {
      // A staff member can be in a profile file and a pay file: their details are joined so each person is counted once.
      const merged = new Map<string, Record<string, unknown>>();
      for (const file of files) { const parsed = JSON.parse(await file.text()); for (const person of parsed.staff || []) { const key = `${parsed.company}|${String(person.code).toUpperCase()}`; merged.set(key, { ...(merged.get(key) || {}), ...person, company: parsed.company }); } }
      const rows: unknown[] = [...merged.values()];
      const preview = await api('action=profile_import', { rows, dryRun: true });
      if (preview.error) throw new Error(preview.error);
      if (!preview.updated) { setImportNotice(`Nothing to fill: ${preview.staff} staff were checked and every detail in the file is already in AraOffice.${preview.unknown?.length ? ` Not found in HR: ${preview.unknown.join(', ')}.` : ''}`); return; }
      setImportPlan({ rows, staff: preview.staff, updated: preview.updated, counts: preview.counts, unknown: preview.unknown || [], saving: false });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to read the Infotech file.'); }
  };
  const applyImport = async () => {
    if (!importPlan) return;
    setImportPlan({ ...importPlan, saving: true });
    try {
      const done = await api('action=profile_import', { rows: importPlan.rows, dryRun: false });
      if (done.error) throw new Error(done.error);
      setImportNotice(`Filled details for ${done.updated} staff from Infotech. Each change is in the profile's recent changes.`);
      setImportPlan(null); await load();
    } catch (cause) { setImportPlan((current) => current && { ...current, saving: false }); onError(cause instanceof Error ? cause.message : 'Unable to import from Infotech.'); }
  };

  const load = async () => {
    try { setEmployees((await api('action=employees')).employees); setNotSetUp(''); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Unable to load staff.'; if (message.includes('not set up')) setNotSetUp(message); else onError(message); setEmployees([]); }
  };
  useEffect(() => { void load(); }, []);

  if (adding) return <ProfileEditor employee={blank()} onCancel={() => setAdding(false)} onSaved={async (saved, leaveSetup) => { setAdding(false); await load(); setOpenId(saved.id || ''); setSetupNotice(leaveSetup && !leaveSetup.error ? `Leave is set up as ${leaveSetup.track === 'admin' ? 'Administrative officer' : leaveSetup.track === 'parttime' ? 'part-time Doctor / clinic assistant' : 'Doctor / clinic assistant'} under the company policy. Change the category under Leave → Staff leave → Company policy if it is wrong.` : leaveSetup?.error ? `The profile was saved, but leave was not set up: ${leaveSetup.error}` : 'Add a join date so leave can be set up under Leave → Staff leave → Company policy.'); }} onError={onError} />;
  if (openId) return <>{setupNotice && <p className="mx-auto mb-4 max-w-[1500px] rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{setupNotice}</p>}<ProfileView id={openId} onBack={() => { setOpenId(''); setSetupNotice(''); void load(); }} onError={onError} /></>;

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
  const hero = <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Staff profiles</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Each staff member's personal, employment and pay details. Leave, attendance and payroll are worked out from these. IC and bank details stay hidden until you show them, and every change is logged.</p></div>{!notSetUp && <button onClick={() => setAdding(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b3d59] hover:bg-[#e9f6fb]"><UserPlus className="h-4 w-4" />Add staff</button>}</div></section>;
  const tabBar = <div role="tablist" aria-label="Staff profiles" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{([['list', 'Staff list'], ['requests', 'Profile requests'], ['directory', 'Staff location'], ['contact', 'Contact staff'], ['projection', 'Forecast']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)} className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${tab === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}{key === 'requests' && pendingRequests > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{pendingRequests}</span>}</button>)}</div>;
  if (tab === 'directory') return <div className="mx-auto max-w-[1500px] space-y-5">{hero}{tabBar}<HRStaffLocation people={employees} onOpen={setOpenId} /></div>;
  if (tab === 'contact') return <div className="mx-auto max-w-[1500px] space-y-5">{hero}{tabBar}<HRStaffContact people={employees as Employee[] | null} /></div>;
  if (tab === 'projection') return <div className="mx-auto max-w-[1500px] space-y-5">{hero}{tabBar}<HRProjection onOpen={setOpenId} /></div>;
  if (tab === 'requests') return <div className="mx-auto max-w-[1500px] space-y-5">{hero}{tabBar}<HRProfileRequests onError={onError} onChanged={onPendingChange} /></div>;

  return <div className="mx-auto max-w-[1500px] space-y-5">
    {hero}
    {tabBar}
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
    {importPlan && <section className="mx-auto max-w-[1500px] rounded-2xl border border-[#aee7fb] bg-[#f3fbfe] p-5">
      <p className="font-semibold text-[#14233b]">Fill blank details for {importPlan.updated} of {importPlan.staff} staff from Infotech?</p>
      <p className="mt-1 text-sm text-slate-600">Only blank details are filled. Anything already in AraOffice stays as it is, and every change is recorded in the profile's recent changes.</p>
      <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(importPlan.counts).map(([field, count]) => <li key={field} className="flex justify-between gap-3 border-b border-slate-100 py-1"><span>{FIELD_LABEL[field] || field.replace(/_/g, ' ')}</span><strong>{count}</strong></li>)}</ul>
      {importPlan.unknown.length > 0 && <p className="mt-3 text-sm text-amber-700">Not found in HR, so skipped: {importPlan.unknown.join(', ')}</p>}
      <div className="mt-4 flex gap-3"><button type="button" disabled={importPlan.saving} onClick={() => void applyImport()} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{importPlan.saving ? 'Saving…' : 'Fill blank details'}</button><button type="button" disabled={importPlan.saving} onClick={() => setImportPlan(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button></div>
    </section>}
    {importNotice && <p className="mx-auto max-w-[1500px] rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{importNotice}</p>}
    {!notSetUp && <section className={`${card} flex flex-wrap items-center gap-3`}>
      <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, job or department" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <select value={company} onChange={(event) => setCompany(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ & SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Any status</option>{['Active', 'Inactive'].map((item) => <option key={item}>{item}</option>)}</select>
      <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] hover:bg-slate-50" title="Fill blank profile details from files read off Infotech"><Upload className="h-4 w-4" />Import from Infotech<input type="file" accept=".json,application/json" multiple onChange={(event) => void importFromInfotech(event)} className="hidden" /></label>
      <select value="" onChange={(event) => { const target = event.target.value; if (!target || !shown.length) return; if (window.confirm(`Make ${approverName(target)} the leave approver of the ${shown.filter((row) => row.id !== target).length} staff shown?`)) void assignApprover(shown.filter((row) => row.id !== target).map((row) => row.id || ''), target); }} aria-label="Set the leave approver for all staff shown" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Set leave supervisor for all shown…</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
      <select value="" onChange={(event) => { const target = event.target.value; if (!target || !shown.length) return; if (window.confirm(`Make ${approverName(target)} the backup leave officer of the ${shown.filter((row) => row.id !== target).length} staff shown?`)) void assignApprover(shown.filter((row) => row.id !== target).map((row) => row.id || ''), target, 'backup'); }} aria-label="Set backup leave officer for all staff shown" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Set backup officer for all shown…</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
      <select value="" onChange={(event) => { const target = event.target.value; if (!target || !shown.length) return; if (window.confirm(`Make ${approverName(target)} the final approver of the ${shown.filter((row) => row.id !== target).length} staff shown?`)) void assignApprover(shown.filter((row) => row.id !== target).map((row) => row.id || ''), target, 'final'); }} aria-label="Set the final approver for all staff shown" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Set final approver for all shown…</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
      <span className="ml-auto text-xs text-slate-400">{employees ? `${shown.length} of ${employees.length}` : 'Loading…'}</span>
    </section>}
    {employees && !employees.length && !notSetUp && <p className={`${card} text-sm text-slate-500`}>No staff profiles yet. Press Add staff, or import them from Infotech.</p>}
    {employees && employees.length > 0 && !notSetUp && <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_35px_rgba(20,35,59,0.08)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1550px] text-left text-xs">
          <thead className="bg-[#f7fafc]"><tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            <th className="w-12 px-4 py-3.5">No</th>
            {columns.map((column) => <th key={column.key} className={`px-4 py-3.5 ${column.className || ''}${column.key === 'fullName' ? ' sticky left-0 z-10 bg-[#f7fafc] shadow-[2px_0_4px_-2px_rgba(20,35,59,0.18)]' : ''}`}><button type="button" onClick={() => setSort((current) => ({ key: column.key, dir: current.key === column.key ? (current.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-[#0b587b]">{column.label}<span className={sort.key === column.key ? 'text-[#0b587b]' : 'opacity-0'}>{sort.dir === 1 ? '▲' : '▼'}</span></button></th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, index) => <tr key={row.id} onClick={() => setOpenId(row.id || '')} className={`group cursor-pointer transition hover:bg-[#f4fafd] ${row.status !== 'Active' ? 'text-slate-400' : ''}`}>
              <td className="px-4 py-3 text-xs text-slate-400">{index + 1}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.employeeCode}</td>
              <td className="sticky left-0 z-[5] bg-white px-4 py-3 shadow-[2px_0_4px_-2px_rgba(20,35,59,0.18)] group-hover:bg-[#f4fafd]"><span className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f6fb] text-[11px] font-bold text-[#0b587b]">{row.fullName.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span><span className="min-w-0"><span className="font-semibold text-[#14233b]">{row.fullName}</span>{row.shortName && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500" title="Name used to sign in">{row.shortName}</span>}</span></span></td>
              <td className="px-4 py-3">{row.designation || '—'}</td>
              <td className="px-4 py-3">{row.department || '—'}</td>
              <td className="px-4 py-3"><span className="mr-2 rounded-md bg-[#eaf6fb] px-1.5 py-0.5 text-[10px] font-bold text-[#0b587b]">{row.company}</span>{row.branch || '—'}</td>
              <td className="px-4 py-3 whitespace-nowrap">{dmy(row.joinDate)}</td>
              <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{row.signIn === 'set' ? <span className="flex items-center gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Password set</span><button onClick={() => void resetSignIn(row)} className="text-xs font-semibold text-rose-600 hover:underline">Reset</button></span> : row.signIn === 'not_set' ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Not set yet</span> : <span className="text-xs text-slate-300">No sign-in</span>}</td>
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{row.status === 'Active' ? <select value={row.leaveApproverId || ''} onChange={(event) => void assignApprover([row.id || ''], event.target.value)} aria-label={`Leave approver for ${row.fullName}`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">— Not set —</option>{approvers.filter((person) => person.id !== row.id).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select> : <span className="text-xs text-slate-300">—</span>}</td>
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{row.status === 'Active' ? <select value={row.leaveBackupApproverId || ''} onChange={(event) => void assignApprover([row.id || ''], event.target.value, 'backup')} aria-label={`Backup leave officer for ${row.fullName}`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">— Not set —</option>{approvers.filter((person) => person.id !== row.id).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select> : <span className="text-xs text-slate-300">—</span>}</td>
              <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>{row.status === 'Active' ? <select value={row.finalApproverId || ''} onChange={(event) => void assignApprover([row.id || ''], event.target.value, 'final')} aria-label={`Final approver for ${row.fullName}`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">— Not set —</option>{approvers.filter((person) => person.id !== row.id).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select> : <span className="text-xs text-slate-300">—</span>}</td>
              <td className="px-4 py-3">{row.employmentType}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone[row.status] || 'bg-slate-100 text-slate-500'}`}>{row.status}</span>{row.status === 'Active' && row.resignDate && <span className="ml-2 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Resigns {row.resignDate.slice(8)}/{row.resignDate.slice(5, 7)}/{row.resignDate.slice(0, 4)}</span>}</td>
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
  return <section className={`${card} !p-4`}><div className="flex flex-col gap-3"><div><h3 className="font-semibold">Working days</h3><p className="mt-0.5 text-xs text-slate-500">Leave counts only on these days.</p></div>
    <div className="flex flex-wrap items-center gap-1.5">{WEEK.map(([label, value]) => { const on = picked.includes(value); return <button key={label} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((day) => day !== value) : [...picked, value])} className={`h-8 w-9 rounded-lg border text-[11px] font-semibold transition ${on ? 'border-[#0b587b] bg-[#0b587b] text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>{label}</button>; })}
      <button type="button" onClick={() => void save()} disabled={!changed || saving || !picked.length} className="h-8 rounded-lg bg-[#0b587b] px-3 text-xs font-bold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button></div></div></section>;
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
  return <section className={`${card} !p-4`}><div className="flex flex-col gap-3"><div><h3 className="font-semibold">Public holiday group</h3><p className="mt-0.5 text-xs text-slate-500">Which public holidays are not leave days.</p></div>
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
  return <section className={`${card} !p-4`}><div className="flex flex-col gap-3"><div><h3 className="font-semibold">Leave calendar access</h3><p className="mt-0.5 text-xs text-slate-500">Matches their Infotech access.</p></div><select aria-label="Leave calendar access" value={value} disabled={saving} onChange={event => void change(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"><option value="">Own company and department</option><option value="KJ">All KJ departments</option><option value="SK">All SK departments</option><option value="KJ,SK">All KJ and SK departments</option></select></div></section>;
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

// The documents on one staff profile: HR sees everything staff added, and can add or remove any.
function ProfileDocuments({ employeeId, onError }: { employeeId: string; onError: (message: string) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  useEffect(() => { setDocs(null); api(`action=documents&employeeId=${employeeId}`).then((result) => { if (result.error) throw new Error(result.error); setDocs(result.documents || []); }).catch((cause: Error) => { setDocs([]); onError(cause.message); }); }, [employeeId]);
  return <section className={`${card} !p-4`}><DocumentsPanel tone="plain" docs={docs} onError={onError}
    onUpload={async (kind, name, data) => { const result = await api('action=document_upload', { employeeId, kind, name, data }); if (result.error) throw new Error(result.error); setDocs((current) => [result.document, ...(current || [])]); }}
    getUrl={async (id, download) => { const result = await api(`action=document_open&employeeId=${employeeId}&id=${encodeURIComponent(id)}${download ? '&download=1' : ''}`); if (result.error) throw new Error(result.error); return result.url; }}
    onRemove={async (doc) => { const result = await api('action=document_delete', { employeeId, id: doc.id }); if (result.error) throw new Error(result.error); setDocs((current) => (current || []).filter((item) => item.id !== doc.id)); }}
    canRemove={() => true} /></section>;
}

// Employment history (joining, job title and department changes, increments, salary adjustments), from Infotech. HR only: staff never
// see it. Pay figures stay hidden until "Show private details" is pressed, like the rest of the profile.
export type CareerEntry = { id: string; date: string | null; kind: string; detail: string; from: string; to: string; amount: number | null };
const PAY_KINDS = /increment|salary|hourly|bonus/i;
function ProfileCareer({ employeeId, reveal, onError, onLoaded }: { employeeId: string; reveal: boolean; onError: (message: string) => void; onLoaded?: (entries: CareerEntry[]) => void }) {
  const [entries, setEntries] = useState<CareerEntry[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  useEffect(() => { setEntries(null); api(`action=career&employeeId=${employeeId}`).then((result) => { if (result.error) throw new Error(result.error); const list = ((result.entries || []) as CareerEntry[]).map((entry) => entry.date && entry.date < '1950' ? { ...entry, date: null } : entry); setEntries(list); onLoaded?.(list); setNotSetUp(Boolean(result.notSetUp)); }).catch((cause: Error) => { setEntries([]); onLoaded?.([]); onError(cause.message); }); }, [employeeId]);
  const paged = usePaged<CareerEntry>(entries || [], 10, employeeId);
  const pay = (entry: CareerEntry) => PAY_KINDS.test(entry.kind) || PAY_KINDS.test(entry.detail);
  const shown = (entry: CareerEntry, value: string) => value && pay(entry) && !reveal ? '••••' : value;
  const change = (entry: CareerEntry) => entry.from && entry.to && entry.to !== '0.00' ? `${shown(entry, entry.from)} → ${shown(entry, entry.to)}` : shown(entry, entry.to || entry.from);
  return <section className={card}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">Employment history</h3><span className="text-xs text-slate-400">HR only · staff cannot see this</span></div>
    {entries === null ? <p className="mt-2 text-sm text-slate-500">Loading…</p> : notSetUp ? <p className="mt-2 text-sm text-amber-700">Not set up yet: the database migration 202611010004 has not been run.</p> : !entries.length ? <p className="mt-2 text-sm text-slate-500">No history recorded.</p> : <>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Date</th><th className="pr-4">Event</th><th className="pr-4">Change</th><th>Amount</th></tr></thead>
        <tbody>{paged.rows.map((entry) => <tr key={entry.id} className="border-t border-slate-100"><td className="py-2 pr-4 whitespace-nowrap text-slate-500">{entry.date ? dmy(entry.date) : '—'}</td><td className="pr-4"><span className="font-semibold text-[#14233b]">{entry.kind}</span>{entry.detail && entry.detail.toUpperCase() !== entry.kind.toUpperCase() && <span className="ml-2 text-xs text-slate-400">{entry.detail.toLowerCase()}</span>}</td><td className="pr-4 text-slate-600">{change(entry) || '—'}</td><td className="whitespace-nowrap text-slate-600">{entry.amount ? (reveal ? money(entry.amount) : '••••') : ''}</td></tr>)}</tbody></table></div>
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
    </>}
  </section>;
}

// Months already paid, from Infotech and from AraOffice's own locked pay runs. HR only here; staff open their own slip under Payslip.
type PayMonth = { year: number; month: number; source: string; gross: number; kwsp: number; perkeso: number; eis: number; pcb: number; net: number };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ProfilePayHistory({ employeeId, reveal, onError }: { employeeId: string; reveal: boolean; onError: (message: string) => void }) {
  const [months, setMonths] = useState<PayMonth[] | null>(null);
  useEffect(() => { setMonths(null); api(`action=payroll_history&employeeId=${employeeId}`).then((result) => { if (result.error) throw new Error(result.error); setMonths(result.months || []); }).catch((cause: Error) => { setMonths([]); onError(cause.message); }); }, [employeeId]);
  const paged = usePaged<PayMonth>(months || [], 12, employeeId);
  const show = (value: number) => reveal ? money(value) : '••••';
  return <section className={card}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">Payroll history</h3><span className="text-xs text-slate-400">HR only · amounts hidden until you show them</span></div>
    {months === null ? <p className="mt-2 text-sm text-slate-500">Loading…</p> : !months.length ? <p className="mt-2 text-sm text-slate-500">No pay recorded yet.</p> : <>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Month</th><th className="pr-4 text-right">Gross</th><th className="pr-4 text-right">KWSP</th><th className="pr-4 text-right">PERKESO</th><th className="pr-4 text-right">EIS</th><th className="pr-4 text-right">PCB</th><th className="pr-4 text-right">Net</th><th>From</th></tr></thead>
        <tbody>{paged.rows.map((item) => <tr key={`${item.year}-${item.month}`} className="border-t border-slate-100 tabular-nums"><td className="py-2 pr-4 whitespace-nowrap font-semibold text-[#14233b]">{MONTH_NAMES[item.month - 1]} {item.year}</td><td className="pr-4 text-right">{show(item.gross)}</td><td className="pr-4 text-right">{show(item.kwsp)}</td><td className="pr-4 text-right">{show(item.perkeso)}</td><td className="pr-4 text-right">{show(item.eis)}</td><td className="pr-4 text-right">{show(item.pcb)}</td><td className="pr-4 text-right font-semibold">{show(item.net)}</td><td className="text-xs text-slate-400">{item.source}</td></tr>)}</tbody></table></div>
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
    </>}
  </section>;
}

// How this person is treated in the monthly pay run, read off Infotech. HR only; there are no pay figures here.
const PAYROLL_ROWS: [string, string][] = [['epfRate', 'KWSP rate (%)'], ['socsoCategory', 'PERKESO category'], ['socsoEmployed', 'PERKESO employed'], ['eis', 'EIS'], ['hrdf', 'HRDF'], ['skbbk', 'SKBBK (24-hour cover)'], ['taxResident', 'Tax resident'], ['taxType', 'Tax remuneration type'], ['pcbApplied', 'PCB applied'], ['payGroup', 'Pay group'], ['otType', 'OT type'], ['probationMonths', 'Probation (months)'], ['flexi', 'Flexi hours'], ['restDay', 'Rest day'], ['defaultShift', 'Default shift'], ['epfName', 'Name on KWSP and ePCB files'], ['lhdnEmployeeCode', 'LHDN employee code']];
function PayrollSettingsCard({ settings }: { settings: Record<string, string | number | boolean> }) {
  const shown = PAYROLL_ROWS.filter(([key]) => key in settings);
  return <section className={card}><h3 className="font-semibold">Payroll settings</h3>
    {!shown.length ? <p className="mt-2 text-sm text-slate-500">Not set yet.</p> : <dl className="mt-2 divide-y divide-slate-100">{shown.map(([key, label]) => { const value = settings[key]; return <div key={key}><Row label={label}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</Row></div>; })}</dl>}
  </section>;
}

export function ProfileView({ id, onBack, onError }: { id: string; onBack: () => void; onError: (message: string) => void }) {
  const [data, setData] = useState<{ employee: Employee; audit: Audit[]; signIn?: { linked: boolean; hasPassword: boolean | null } } | null>(null);
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [career, setCareer] = useState<CareerEntry[] | null>(null);
  useStaffProfilePrint(printing, `Staff Profile - ${data?.employee.fullName || ''}`, () => setPrinting(false));
  const load = async () => { try { setData(await api(`action=employee&id=${encodeURIComponent(id)}`)); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load profile.'); } };
  useEffect(() => { void load(); }, [id]);
  const history = usePaged<Audit>(data?.audit || [], 10, id);
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const e = data.employee;
  if (editing) return <ProfileEditor employee={e} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await load(); }} onError={onError} />;
  const secret = (value: string) => reveal ? value || '—' : masked(value);
  // Email and phone numbers stay hidden until the button is pressed too: only the end is shown.
  const hiddenEmail = (value: string) => reveal || !value ? value : `${value.slice(0, 1)}•••@${value.split('@')[1] || '•••'}`;
  const hiddenPhone = (value: string) => reveal || !value ? value : masked(value);
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All staff</button><span className="flex flex-wrap gap-2"><button type="button" disabled={career === null} onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><Printer className="h-4 w-4" />Print / PDF</button><button type="button" aria-pressed={reveal} onClick={() => setReveal(!reveal)} className="profile-private-toggle inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]">{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{reveal ? 'Hide private details' : 'Show private details'}</button><button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#083a55]"><Pencil className="h-4 w-4" />Edit</button></span></div>
    <section className="ara-hero rounded-[28px] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">{e.company} · {e.employeeCode}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{e.fullName}</h2><p className="mt-2 text-[#b9cfdd]"><span className={`mr-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[e.status]}`}>{e.status}</span>{[e.designation, e.department, e.branch].filter(Boolean).join(' · ')}{e.joinDate ? ` · joined ${dmy(e.joinDate)} (${service(e.joinDate)})` : ''}</p></section>
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
    <section className={`${card} !p-4`}><div className="flex flex-col items-start gap-3"><div><h3 className="font-semibold">Individual sign-in</h3><p className="mt-0.5 text-xs text-slate-500">{!data.signIn?.linked ? 'No sign-in yet.' : data.signIn.hasPassword === null ? 'Status not available yet.' : data.signIn.hasPassword ? 'Password set.' : 'Password not set yet (first sign-in uses the last 4 IC digits).'}</p></div>{!data.signIn?.linked ? <CreateSignIn employeeId={id} fullName={data.employee.fullName} hasIc={Boolean(data.employee.icNo)} onDone={load} onError={onError} /> : null}<button disabled={!data.signIn?.linked || !data.signIn.hasPassword} title={data.signIn?.hasPassword ? '' : 'There is no password to reset yet'} onClick={async () => { if (!window.confirm(`Reset the sign-in password of ${data.employee.fullName}? They will sign in with the last 4 digits of their IC and choose a new one.`)) return; try { const result = await api('action=reset_sign_in', { id }); if (result.error) throw new Error(result.error); await load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to reset.'); } }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Reset password</button></div></section>
    <WorkDaysCard employeeId={id} days={e.workDays || [1, 2, 3, 4, 5, 6]} onSaved={load} onError={onError} />
    <HolidayGroupCard employeeId={id} group={e.holidayGroup || ''} onSaved={load} onError={onError} />
    <CalendarAccessCard employeeId={id} companies={e.leaveCalendarCompanies || []} onSaved={load} onError={onError} />
    </div>
    {printing && <StaffProfilePrint employee={e} reveal={reveal} career={career || []} />}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}><h3 className="font-semibold">Personal</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="IC no.">{secret(e.icNo)}</Row>{e.passportNo && <Row label="Passport no.">{secret(e.passportNo)}</Row>}<Row label="Nationality">{e.nationality}</Row><Row label="Gender">{e.gender}</Row><Row label="Date of birth">{dmy(e.dateOfBirth)}</Row><Row label="Religion">{e.religion}</Row><Row label="Race">{e.race}</Row>{e.foreignIdNo && <Row label="Foreign ID no.">{secret(e.foreignIdNo)}</Row>}<Row label="Phone">{hiddenPhone(e.phone)}</Row><Row label="Email">{hiddenEmail(e.email)}</Row><Row label="Address"><span className="whitespace-pre-line">{String(e.address || '').replace(/(,\s*)+,/g, ',')}</span></Row>
      </dl></section>
      <section className={card}><h3 className="font-semibold">Employment</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="Company">{e.company === 'KJ' ? 'KJ- HSO Healthcare Sdn Bhd' : e.company === 'SK' ? 'SK- HSO Healthcare Sdn Bhd' : ''}</Row><Row label="Branch">{e.branch}</Row><Row label="Department">{e.department}</Row><Row label="Designation">{e.designation}</Row><Row label="Employment type">{e.employmentType}</Row><Row label="Joined">{dmy(e.joinDate)}</Row><Row label="Confirmed">{dmy(e.confirmDate)}</Row>{e.resignDate && <Row label="Left">{dmy(e.resignDate)}</Row>}<Row label="Leave group">{LEAVE_GROUPS.find((group) => group.code === e.leaveGroup)?.name || e.leaveGroup}</Row>
      </dl></section>
      <section className={card}><h3 className="font-semibold">Pay & statutory</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="Basic salary">{reveal ? money(e.basicSalary) : '••••'}</Row><Row label="Fixed allowances">{reveal ? (e.fixedAllowances.length ? e.fixedAllowances.map((item) => `${item.name} ${money(item.amount)}`).join(', ') : 'None') : '••••'}</Row><Row label="Bank">{e.bankName}</Row><Row label="Account no.">{secret(e.bankAccount)}</Row><Row label="KWSP no.">{secret(e.epfNo)}</Row><Row label="PERKESO no.">{secret(e.socsoNo)}</Row><Row label="Income tax no.">{secret(e.taxNo)}</Row>
      </dl></section>
      <PayrollSettingsCard settings={e.payroll || {}} />
      <section className={card}><h3 className="font-semibold">Family & emergency</h3><dl className="mt-2 divide-y divide-slate-100">
        <Row label="Marital status">{e.maritalStatus}</Row>{(e.maritalStatus === 'Married' || e.spouseName) && <><Row label="Spouse">{[e.spouseName, e.spouseEmployer, hiddenPhone(e.spousePhone)].filter(Boolean).join(' · ')}</Row>{e.spouseIc && <Row label="Spouse IC no.">{secret(e.spouseIc)}</Row>}</>}{e.maritalStatus === 'Married' && <Row label="Spouse working">{e.spouseWorking === null ? '' : e.spouseWorking ? 'Yes' : 'No'}</Row>}<Row label="Children">{e.children.length ? e.children.map((child) => `${child.name}${child.dateOfBirth ? ` (${dmy(child.dateOfBirth)})` : ''}${child.studying ? ', studying' : ''}${child.disabled ? ', OKU' : ''}`).join('; ') : 'None'}</Row><Row label="Emergency contact">{[e.emergencyName, e.emergencyRelation, hiddenPhone(e.emergencyPhone)].filter(Boolean).join(' · ')}</Row><Row label="Education"><span className="whitespace-pre-line">{e.education.length ? e.education.map((item) => [[item.level, item.course].filter(Boolean).join(' · '), [item.institution, item.year].filter(Boolean).join(' ')].filter(Boolean).join(', ')).join('\n') : ''}</span></Row>
      </dl></section>
    </div>
    <ProfileDocuments employeeId={id} onError={onError} />
    <ProfilePayHistory employeeId={id} reveal={reveal} onError={onError} />
    <ProfileCareer employeeId={id} reveal={reveal} onError={onError} onLoaded={setCareer} />
    {e.remarks && <section className={card}><h3 className="font-semibold">Remarks</h3><p className="mt-2 whitespace-pre-line text-sm">{e.remarks}</p></section>}
      <section className={card}><h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-slate-400" />Change history</h3>
      {!data.audit.length ? <p className="mt-2 text-sm text-slate-500">No changes yet.</p> : <ul className="mt-3 space-y-2 text-sm">{history.rows.map((item, i) => <li key={i} className="flex flex-wrap gap-x-2 text-slate-600"><span className="text-slate-400">{new Date(item.at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className="font-semibold text-[#14233b]">{item.by || 'Someone'}</span><span>{item.action === 'create' ? 'created the profile' : `changed ${Object.keys(item.changes).map((key) => SECRET.has(key) ? (FIELD_LABEL[key] || key.replace(/_/g, ' ')) : `${FIELD_LABEL[key] || key.replace(/_/g, ' ')}`).join(', ')}`}</span></li>)}</ul>}
      <Pager page={history.page} pages={history.pages} total={history.total} onPage={history.setPage} />
    </section>
  </div>;
}

function ProfileEditor({ employee, onCancel, onSaved, onError }: { employee: Employee; onCancel: () => void; onSaved: (saved: Employee, leaveSetup?: { track: string; changed: number; error?: string } | null) => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<Employee>(employee);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Employee>(key: K, value: Employee[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try { const result = await api('action=save_employee', { action: 'save_employee', employee: draft }); await onSaved(result.employee, result.leaveSetup); }
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
    {section('Identity', <>{choice('Company', 'company', ['', 'KJ', 'SK'], 'Choose…')}{field('Employee code', 'employeeCode', 'text', 'e.g. ARASK0001')}{field('Full name (as in IC)', 'fullName')}{field('IC no.', 'icNo', 'text', '900101-10-1234')}{field('Passport no. (non-Malaysian)', 'passportNo')}{field('Nationality', 'nationality')}{choice('Gender', 'gender', ['', 'Male', 'Female'])}{field('Date of birth', 'dateOfBirth', 'date')}{field('Religion', 'religion')}{field('Race', 'race', 'text', 'e.g. Malay')}{field('Foreign ID no.', 'foreignIdNo')}</>)}
    {section('Contact', <>{field('Phone', 'phone', 'tel')}{field('Email', 'email', 'email')}{field('Address line 1', 'addressLine1')}{field('Address line 2', 'addressLine2')}{field('Postcode', 'postcode')}{field('City', 'city')}{field('State', 'state')}{field('Emergency contact name', 'emergencyName')}{field('Relationship', 'emergencyRelation')}{field('Emergency phone', 'emergencyPhone', 'tel')}</>)}
    {section('Employment', <>{field('Branch', 'branch', 'text', 'Kajang / Seri Kembangan')}{choice('Department', 'department', departments)}{field('Designation', 'designation', 'text', 'e.g. Clinic Assistant')}{choice('Employment type', 'employmentType', ['Permanent', 'Contract', 'Part-time', 'Locum', 'Intern'])}{field('Join date', 'joinDate', 'date')}{field('Confirm date', 'confirmDate', 'date')}{choice('Status', 'status', ['Active', 'Inactive'])}{field('Last day (if left)', 'resignDate', 'date')}{choice('Leave group', 'leaveGroup', ['', ...LEAVE_GROUPS.map((group) => group.code)])}</>)}
    {section('Pay & statutory', <>{field('Basic salary (RM)', 'basicSalary', 'number')}{field('Bank', 'bankName', 'text', 'e.g. Maybank')}{field('Account no.', 'bankAccount')}{field('KWSP no.', 'epfNo')}{field('PERKESO no.', 'socsoNo')}{field('Income tax no.', 'taxNo')}
      <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1.5 text-xs font-bold text-slate-700">Fixed allowances (every month)</p><div className="space-y-2">{draft.fixedAllowances.map((item, i) => <div key={i} className="flex gap-2"><input value={item.name} onChange={(event) => set('fixedAllowances', draft.fixedAllowances.map((row, j) => j === i ? { ...row, name: event.target.value } : row))} placeholder="Allowance" className={input} /><input type="number" value={item.amount} onChange={(event) => set('fixedAllowances', draft.fixedAllowances.map((row, j) => j === i ? { ...row, amount: Number(event.target.value) } : row))} placeholder="RM" className={`${input} max-w-[140px]`} /><button type="button" onClick={() => set('fixedAllowances', draft.fixedAllowances.filter((_, j) => j !== i))} className="rounded-xl px-3 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove allowance"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => set('fixedAllowances', [...draft.fixedAllowances, { name: '', amount: 0 }])} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add allowance</button></div></div></>)}
    {section('Family (for PCB)', <>{choice('Marital status', 'maritalStatus', ['', 'Single', 'Married', 'Divorced', 'Widowed'])}{draft.maritalStatus === 'Married' && <>{field('Spouse name', 'spouseName')}{field('Spouse IC no.', 'spouseIc')}{field('Spouse occupation', 'spouseEmployer')}{field('Spouse phone', 'spousePhone', 'tel')}</>}{draft.maritalStatus === 'Married' && <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Spouse working</span><select value={draft.spouseWorking === null ? '' : draft.spouseWorking ? 'yes' : 'no'} onChange={(event) => set('spouseWorking', event.target.value === '' ? null : event.target.value === 'yes')} className={input}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
      <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1.5 text-xs font-bold text-slate-700">Children</p><div className="space-y-2">{draft.children.map((child, i) => <div key={i} className="flex flex-wrap items-center gap-2"><input value={child.name} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, name: event.target.value } : row))} placeholder="Name" className={`${input} min-w-[180px] flex-1`} /><input type="date" value={child.dateOfBirth || ''} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, dateOfBirth: event.target.value || null } : row))} className={`${input} max-w-[180px]`} /><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={child.studying} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, studying: event.target.checked } : row))} />Studying</label><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={child.disabled} onChange={(event) => set('children', draft.children.map((row, j) => j === i ? { ...row, disabled: event.target.checked } : row))} />OKU</label><button type="button" onClick={() => set('children', draft.children.filter((_, j) => j !== i))} className="rounded-xl px-3 py-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove child"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => set('children', [...draft.children, { name: '', dateOfBirth: null, studying: false, disabled: false }])} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add child</button></div></div></>)}
    {section('Education', <div className="sm:col-span-2 lg:col-span-3"><div className="space-y-2">{draft.education.map((item, i) => <div key={i} className="flex flex-wrap items-center gap-2"><input value={item.level} onChange={(event) => set('education', draft.education.map((row, j) => j === i ? { ...row, level: event.target.value } : row))} placeholder="Level (e.g. Diploma)" className={`${input} max-w-[180px]`} /><input value={item.institution} onChange={(event) => set('education', draft.education.map((row, j) => j === i ? { ...row, institution: event.target.value } : row))} placeholder="Institution" className={`${input} min-w-[200px] flex-1`} /><input value={item.course} onChange={(event) => set('education', draft.education.map((row, j) => j === i ? { ...row, course: event.target.value } : row))} placeholder="Course" className={`${input} min-w-[160px] flex-1`} /><input value={item.year} maxLength={4} onChange={(event) => set('education', draft.education.map((row, j) => j === i ? { ...row, year: event.target.value.replace(/\D/g, '') } : row))} placeholder="Year" className={`${input} max-w-[90px]`} /><button type="button" onClick={() => set('education', draft.education.filter((_, j) => j !== i))} className="rounded-xl px-3 py-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove education"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => set('education', [...draft.education, { level: '', institution: '', course: '', year: '' }])} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add education</button></div></div>)}
    <section className={card}><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Remarks</span><textarea value={draft.remarks} onChange={(event) => set('remarks', event.target.value)} rows={3} className={`${input} h-auto py-3`} /></label></section>
  </form>;
}
