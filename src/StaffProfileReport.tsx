import { useEffect, useState } from 'react';
import { officeFetch } from './lib/officeApi';
import { ProfileView } from './HRProfiles';
import { card } from './AssessmentStaff';

export function StaffProfileReport({ onError }: { onError: (message: string) => void }) {
  const [people, setPeople] = useState<{ id: string; fullName: string; employeeCode: string; company: string }[] | null>(null);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    officeFetch('/api/status?resource=hr&action=employees').then(async (response) => {
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Unable to load staff.');
      setPeople((result.employees || []).sort((a: { fullName: string }, b: { fullName: string }) => a.fullName.localeCompare(b.fullName)));
    }).catch((cause: Error) => { setPeople([]); onError(cause.message); });
  }, []);
  return <div className="space-y-5">
    <section className={card}><label className="block text-sm font-semibold text-slate-600">Staff member<select aria-label="Staff profile to print" value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">{people === null ? 'Loading staff…' : 'Choose staff…'}</option>{people?.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.company} · {person.employeeCode}</option>)}</select></label><p className="mt-3 text-sm text-slate-500">Choose a staff member, then Print / PDF. Private details stay hidden unless you choose Show private details first.</p></section>
    {selected && <div key={selected}><ProfileView id={selected} onBack={() => setSelected('')} onError={onError} /></div>}
  </div>;
}
