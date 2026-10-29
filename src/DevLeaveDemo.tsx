import { useEffect, useState } from 'react';
import LeaveSection from './LeaveScreens';

type Account = { id: string; name: string; code: string; company: string; department: string; access: string };
const PASSWORD = 'AraDemo2026!';
export default function DevLeaveDemo() {
  const params = new URLSearchParams(window.location.search);
  const compare = params.get('leaveDemo') === 'compare';
  const id = params.get('account') || '';
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/local-leave-demo/accounts').then(r => r.json()).then(data => setAccounts(data.accounts || [])).catch(() => setError('Cannot connect to local demo server.'));
  }, []);
  const signIn = async () => {
    setError('');
    try {
      const response = await fetch('/api/local-leave-demo/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: id, password: PASSWORD }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      sessionStorage.setItem(`ara_local_leave_demo_${id}`, data.token); setAccount(data.account);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed.'); }
  };
  useEffect(() => { if (id) void signIn(); }, [id]);
  if (compare) return <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
    <h1 className="text-xl font-bold text-[#0b3d59]">Demo akses kalendar cuti</h1>
    <p className="mt-2 text-sm text-slate-600">Empat akaun dummy di localhost. Pilih tarikh yang ditanda untuk melihat nama staf rekaan yang setiap akaun boleh lihat.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{accounts.map(person => <section key={person.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-[#0b587b]">{person.name}</h2><p className="mt-1 text-xs text-slate-500">{person.access}</p><a className="mt-2 inline-block text-xs font-bold text-[#0b587b] underline" href={`/?leaveDemo=1&account=${person.id}`} target="_blank" rel="noreferrer">Buka akaun ini</a></div>
      <iframe title={person.name} src={`/?leaveDemo=1&account=${person.id}`} className="h-[1080px] w-full border-0" />
    </section>)}</div>{error && <p>{error}</p>}
  </main>;
  if (!id) return <main className="p-6"><h1 className="text-xl font-bold">Pilih akaun dummy</h1>{accounts.map(person => <a key={person.id} className="my-3 block text-[#0b587b] underline" href={`/?leaveDemo=1&account=${person.id}`}>{person.name} · {person.code}</a>)}<a href="/?leaveDemo=compare">Lihat semua akaun serentak</a></main>;
  return <main className="min-h-screen bg-[#f5f7f9] p-3">
    <header className="mb-4 rounded-2xl bg-[#0b3d59] p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Localhost · Akaun dummy</p><h1 className="mt-2 font-bold">{account?.name || 'Signing in…'}</h1><p className="mt-1 text-xs text-sky-100">{account?.code} · {account?.department}</p><p className="mt-2 text-xs text-sky-100">{account?.access}</p></header>
    {error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}<button className="ml-3 underline" onClick={() => void signIn()}>Sign in again</button></div> : account ? <LeaveSection isApprover={false} initialTab="calendar" /> : <p>Loading demo…</p>}
  </main>;
}
