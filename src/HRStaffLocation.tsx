import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useMalaysiaToday } from './lib/useMalaysiaToday';

type Person = { id?: string; fullName: string; employeeCode: string; company: string; designation: string; department: string; status: string; joinDate: string | null };
export const locationGroup = (person: Pick<Person, 'designation' | 'employeeCode' | 'company'>) => {
  const job = person.designation.toUpperCase();
  if (/\b(CEO|CFO|CHRO|COO|CPO)\b|CHIEF.*OFFICER/.test(job)) return 'Directors';
  if (person.company === 'KJ' && person.employeeCode === 'ARA0041') return 'Admin Klinikal';
  if (/ADMIN.*CLINI|CLINI.*ADMIN/.test(job)) return 'Admin Klinikal';
  if (/CLINIC ASSISTANT|PEMBANTU KLINIK/.test(job)) return 'CAs';
  if (/\bDR\b|DOCTOR|DOKTOR/.test(job)) return 'Doctors';
  return 'Admins';
};
const groups = ['Directors', 'Admins', 'Admin Klinikal', 'CAs', 'Doctors'];
const inGroup = (person: Person, group: string) => group === 'Doctors' ? locationGroup(person) === 'Directors' || locationGroup(person) === 'Doctors' : locationGroup(person) === group;
const position = (person: Person) => person.company === 'KJ' && person.employeeCode === 'ARA0041' ? 'ADMIN CLINICAL' : person.designation;
// Without `onOpen` it is a list only (the COO's Staff page): the names are not clickable, so no profile opens.
export default function HRStaffLocation({ people, onOpen }: { people: Person[] | null; onOpen?: (id: string) => void }) {
  const today = useMalaysiaToday();
  const [query, setQuery] = useState(''), [company, setCompany] = useState('');
  const active = (people || []).filter((p) => p.status === 'Active');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = active.filter((p) => (!company || p.company === company) && words.every((word) => `${p.fullName} ${p.employeeCode} ${position(p)} ${locationGroup(p)} ${inGroup(p, 'Doctors') ? 'Doctors' : ''}`.toLowerCase().includes(word)));
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><label className="flex min-w-[200px] flex-1 items-center gap-2"><Search size={17} className="text-slate-400" /><input aria-label="Search staff location" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, code or position…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><select aria-label="Staff location branch" value={company} onChange={(e) => setCompany(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option>KJ</option><option>SK</option></select><p className="text-xs text-slate-500">{people ? `${shown.length} staff profiles` : 'Loading staff…'}</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{groups.map((group) => <a key={group} href={`#staff-location-${group.replace(/\s/g, '-')}`} onClick={(e) => { e.preventDefault(); document.getElementById(`staff-location-${group.replace(/\s/g, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-sky-300"><p className="text-xs font-semibold text-slate-500">{group}</p><p className="mt-2 text-3xl font-semibold text-[#17364c]">{people ? shown.filter((p) => inGroup(p, group)).length : '—'}</p></a>)}</div>
    <p className="text-xs text-slate-500">Directors are also included in Doctors. Each staff member is counted once in the total staff profiles.</p>
    {groups.map((group) => {
      const members = shown.filter((p) => inGroup(p, group));
      if (!members.length) return null;
      return <section id={`staff-location-${group.replace(/\s/g, '-')}`} key={group} className="scroll-mt-6 space-y-3"><h3 className="flex items-center gap-2 text-lg font-semibold text-[#17364c]"><Users size={19} />{group}<span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs text-sky-800">{members.length}</span></h3><div className="grid gap-4 lg:grid-cols-2">{['KJ', 'SK', ...new Set(members.map((p) => p.company).filter((c) => !['KJ', 'SK'].includes(c)))].map((branch) => {
        const staff = members.filter((p) => p.company === branch).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName));
        if (!staff.length) return null;
        return <div key={branch} className="rounded-2xl border border-slate-200 bg-white p-4"><h4 className="mb-3 flex justify-between text-xs font-bold uppercase tracking-wide text-[#0b587b]"><span>{branch === 'KJ' ? 'KJ · Kajang' : branch === 'SK' ? 'SK · Seri Kembangan' : branch || 'Branch not set'}</span><span>{staff.length}</span></h4><div className="space-y-2">{staff.map((p) => <button key={p.id || p.employeeCode} type="button" onClick={() => p.id && onOpen?.(p.id)} disabled={!onOpen} className="flex w-full items-start gap-3 disabled:cursor-default rounded-xl bg-slate-50 p-3 text-left transition hover:bg-sky-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">{p.fullName.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}</span><span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{p.fullName}</span><span className="mt-1 block text-xs text-slate-500">{position(p)} · {p.employeeCode}</span>{p.joinDate && p.joinDate > today && <span className="mt-1 inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Starts {p.joinDate.split('-').reverse().join('/')}</span>}</span></button>)}</div></div>;
      })}</div></section>;
    })}
    {people && !shown.length && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">No staff match this view.</p>}
  </section>;
}
