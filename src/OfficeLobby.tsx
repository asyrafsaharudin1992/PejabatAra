import { FormEvent, lazy, Suspense, useEffect, useState, ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, signInWithSupabase, supabase } from './lib/supabase';

const AdminUsers = lazy(() => import('./AdminUsers'));
const OfficeCA = lazy(() => import('./PortalApp'));
const OfficeQuality = lazy(() => import('./App'));
const offices = [
  { id: 'admin', number: '00', title: 'System Admin', description: 'All-office administration', label: 'SYSTEM ADMIN', ready: true },
  { id: 'ceo', number: '01', title: 'Office CEO', description: 'Executive office', label: 'CHIEF EXECUTIVE', ready: false },
  { id: 'coo', number: '02', title: 'Office COO', description: 'Operations office', label: 'CHIEF OPERATING', ready: false },
  { id: 'procurement', number: '03', title: 'Office Procurement', description: 'Purchasing & supplies', label: 'PROCUREMENT', ready: false },
  { id: 'finance', number: '04', title: 'Office Finance', description: 'Finance & accounts', label: 'FINANCE', ready: false },
  { id: 'hr', number: '05', title: 'Office HR', description: 'People & human resources', label: 'HUMAN RESOURCES', ready: false },
  { id: 'quality', number: '06', title: 'Office Quality & Corporate', description: 'Your original AraOffice workspace', label: 'QUALITY & CORPORATE', ready: true },
  { id: 'clinical', number: '07', title: 'Office Clinical Administration', description: 'Clinical administration', label: 'CLINICAL ADMIN', ready: false },
  { id: 'ca', number: '08', title: 'Office Clinical Assistants (CA)', description: 'Training, panel guides & staff references', label: 'CLINICAL ASSISTANTS', ready: true },
];
const currentOffice = () => {
  // Discard sessions created by the retired local passcode login.
  try {
    const session = JSON.parse(localStorage.getItem('ara_portal_session') || 'null');
    if (session?.id === 'system-admin') {
      localStorage.removeItem('ara_portal_session');
      localStorage.removeItem('araoffice_user');
      localStorage.removeItem('ara_view_mode');
      window.location.hash = '';
      return 'lobby';
    }
  } catch { /* The sign-in page can recover from invalid local storage. */ }
 const id = window.location.hash.replace('#office/', ''); return id === 'users' || offices.some((room) => room.id === id) ? id : 'lobby'; };

function AdminOnly({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!supabase) throw new Error('Not configured');
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error('Sign in required');
        const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', data.user.id).single();
        if (live) setAccess(profile?.role === 'super_admin' && profile?.status === 'active' ? 'allowed' : 'denied');
      } catch { if (live) setAccess('denied'); }
    })();
    return () => { live = false; };
  }, []);
  if (access === 'loading') return <p className="p-10">Checking access…</p>;
  if (access === 'denied') return <div className="p-10"><p>System Admin access is required.</p><a href="#">Return to sign in</a></div>;
  return <>{children}</>;
}

function OfficeOnly({ officeId, children }: { officeId: string; children: ReactNode }) {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!supabase) throw new Error('Not configured');
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error('Sign in required');
        const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', data.user.id).single();
        const allowed = profile?.status === 'active' && (profile?.role === 'super_admin' || data.user.app_metadata?.office_access?.includes(officeId));
        if (live) setAccess(allowed ? 'allowed' : 'denied');
      } catch { if (live) setAccess('denied'); }
    })();
    return () => { live = false; };
  }, [officeId]);
  if (access === 'loading') return <p className="p-10">Checking access…</p>;
  if (access === 'denied') return <div className="p-10"><p>This account does not have access to this office.</p><a href="#">Return to sign in</a></div>;
  return <>{children}</>;
}

function AdminHub() {
  const [mode, setMode] = useState<'admin' | 'staff'>(() => localStorage.getItem('ara_view_mode') === 'staff' ? 'staff' : 'admin');
  const rooms = offices.filter((room) => room.id !== 'admin');
  const openRoom = (roomId: string) => { localStorage.setItem('ara_view_mode', mode); window.location.hash = `office/${roomId}`; };
  return <div className="min-h-screen bg-[#f5f7f9] px-6 py-8 text-[#14233b] sm:px-10 lg:px-16">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">ARAOFFICE CONTROL CENTRE</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">System Admin</h1><p className="mt-2 text-sm text-slate-500">Manage and open every office from one account.</p></div>
        <div className="flex items-center gap-3"><div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200"><button onClick={() => setMode('admin')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === 'admin' ? 'bg-[#0b587b] text-white' : 'text-slate-500'}`}>Admin view</button><button onClick={() => setMode('staff')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === 'staff' ? 'bg-[#0b587b] text-white' : 'text-slate-500'}`}>Staff view</button></div><ShieldCheck className="hidden h-12 w-12 text-[#0b587b] sm:block" strokeWidth={1.4} /></div>
      </div>
      <div className="mt-6 rounded-xl bg-[#eaf6fb] px-4 py-3 text-sm text-[#0b587b]">{mode === 'admin' ? 'Admin view: editing and management controls are enabled.' : 'Staff view: preview what a regular staff account can see. Editing controls are hidden.'}</div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mode === "admin" && <a href="#office/users" className="rounded-2xl bg-[#0b3d59] p-6 text-white shadow-lg"><ShieldCheck className="h-7 w-7 text-[#75c9e5]" /><h2 className="mt-4 text-xl font-semibold">User Management</h2><p className="mt-2 text-sm text-slate-300">Manage staff accounts across all offices.</p><span className="mt-6 inline-block text-sm font-semibold">Manage users →</span></a>}
        {rooms.map((room) => room.ready ? <button key={room.id} onClick={() => openRoom(room.id)} className="group rounded-2xl bg-white p-6 text-left shadow-[0_12px_35px_rgba(20,35,59,0.08)] transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(20,35,59,0.14)]"><span className="text-xs font-bold tracking-[0.2em] text-[#0b9aca]">{room.number}</span><h2 className="mt-4 text-xl font-semibold">{room.title}</h2><p className="mt-2 text-sm text-slate-500">{mode === 'admin' ? 'Open with administrator controls' : 'Preview the regular staff experience'}</p><span className="mt-6 inline-flex text-sm font-semibold text-[#0b587b]">Open office <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" /></span></button> : <div key={room.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 opacity-70"><span className="text-xs font-bold tracking-[0.2em] text-slate-400">{room.number}</span><h2 className="mt-4 text-xl font-semibold">{room.title}</h2><p className="mt-2 text-sm text-slate-500">This office is not developed yet.</p><span className="mt-6 inline-flex text-xs font-semibold uppercase tracking-wider text-slate-400">Coming soon</span></div>)}
      </div>
      <a href="#" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />Back to sign in</a>
    </div>
  </div>;
}

export default function OfficeLobby() {
  const [office, setOffice] = useState(currentOffice);
  const [systemAdmin, setSystemAdmin] = useState(false);
  useEffect(() => { let live = true; setSystemAdmin(false); if (supabase) supabase.auth.getUser().then(async ({ data }) => { if (!data.user) return; const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', data.user.id).single(); if (live) setSystemAdmin(profile?.role === 'super_admin' && profile?.status === 'active'); }); return () => { live = false; }; }, [office]);
  const [selected, setSelected] = useState('ca');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { const onHash = () => { const nextOffice = currentOffice(); if (nextOffice === 'lobby') localStorage.removeItem('ara_view_mode'); setOffice(nextOffice); window.scrollTo(0, 0); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { document.title = office === 'lobby' ? 'AraOffice · Sign in' : `${offices.find((room) => room.id === office)?.title} · AraOffice`; }, [office]);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setLoading(true); try { let role = 'Staff'; if (isSupabaseConfigured) { const account = await signInWithSupabase(email, password); role = account.role; const allowed = role === 'Superadmin' || account.officeAccess?.includes(selected); if (selected === 'admin' && role !== 'Superadmin') throw new Error('System Admin access is restricted.'); if (selected !== 'admin' && !allowed) throw new Error('Office access is restricted.'); localStorage.setItem('ara_portal_session', JSON.stringify(account)); localStorage.setItem('araoffice_user', JSON.stringify({ email: account.email, fullName: account.fullName, role: account.role === 'Superadmin' ? 'Superadmin' : 'Staff', status: account.status || 'Active', location: account.branch, profilePic: '' })); if (role === 'Superadmin' && selected !== 'admin') localStorage.setItem('ara_view_mode', 'admin'); else if (role !== 'Superadmin') localStorage.removeItem('ara_view_mode'); } else { throw new Error('Supabase is not configured for this deployment.'); } if (selected === 'admin' && role !== 'Superadmin') throw new Error('System Admin access is restricted.'); window.location.hash = `office/${selected}`; } catch (caught) { const message = caught instanceof Error ? caught.message : ''; setError(message.includes('System Admin') ? 'System Admin access is restricted to Superadmin accounts.' : message.includes('Office access') ? 'This account is not permitted to enter the selected office.' : message.includes('configured') ? message : 'Unable to sign in with these details. Check your email and password.'); } finally { setLoading(false); } };
  if (office !== 'lobby') return <>{office !== 'admin' && <a href={systemAdmin ? "#office/admin" : "#"} className="office-return"><ArrowLeft size={15} />{systemAdmin ? "Back to Control Centre" : "Sign in"}</a>}<Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Opening your office…</div>}>{office === 'admin' ? <AdminOnly><AdminHub /></AdminOnly> : office === 'users' ? <AdminOnly><AdminUsers /></AdminOnly> : office === 'ca' ? <OfficeOnly officeId="ca"><OfficeCA /></OfficeOnly> : office === 'quality' ? <OfficeOnly officeId="quality"><OfficeQuality /></OfficeOnly> : <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f7f9] px-6 text-center"><Building2 size={44} className="text-[#0b587b]" /><p className="mt-8 text-xs uppercase tracking-widest text-slate-400">Coming soon</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{offices.find((room) => room.id === office)?.title}</h1><p className="mt-4 text-slate-500">This office has not been developed yet.</p><a href="#" className="mt-8 text-sm font-medium text-[#0b587b]">Return to sign in</a></div>}</Suspense></>;
  const selectedOffice = offices.find((room) => room.id === selected)!;
  return <div className="office-signin-page"><header className="office-lobby-header"><a href="#" className="flex items-center gap-3 text-[#0b3d59]" aria-label="AraOffice sign in"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b3d59] text-[#91d7ed]"><Building2 size={21} strokeWidth={1.4} /></span><span className="text-lg font-semibold tracking-tight">AraOffice<span className="ml-3 hidden text-xs font-normal tracking-normal text-slate-400 sm:inline">by AraSihat</span></span></a><span className="text-xs font-medium text-slate-500">Internal workspace</span></header><main className="mx-auto grid min-h-[calc(100vh-83px)] max-w-[1440px] items-center gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:px-14"><section className="office-signin-copy"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#75c9e5]">WELCOME TO ARAOFFICE</p><h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.055em] sm:text-6xl">Everything your team needs.<br />One workspace.</h1><p className="mt-6 max-w-md text-base leading-7 text-[#b9cfdd]">References, training and key information organised so the team can work with confidence.</p><p className="mt-10 text-xs text-[#8eabba]">Choose an office on the right before signing in.</p></section><section className="office-signin-panel"><div className="grid gap-7 xl:grid-cols-[minmax(240px,0.7fr)_minmax(260px,1fr)]"><div className="order-2 xl:order-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Choose your office</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-[#14233b]">Where are you working today?</h2><div className="mt-5 grid grid-cols-2 gap-2">{offices.map((room) => <button key={room.id} disabled={!room.ready} onClick={() => { setSelected(room.id); setError(''); }} className={`office-mini-door ${selected === room.id ? 'office-mini-door-selected' : ''} ${!room.ready ? 'office-mini-door-disabled' : ''}`}><span>{room.number}</span><strong>{room.title.replace('Office ', '')}</strong><small>{room.ready ? 'Available' : 'Soon'}</small></button>)}</div></div><div className="order-1 border-b border-slate-100 pb-7 xl:order-2 xl:border-b-0 xl:border-l xl:pl-7 xl:pb-0"><p className="text-sm font-semibold text-[#0b587b]">Sign in to {selectedOffice.title}</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Welcome back.</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use your authorised office account.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Email address</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 outline-none focus:ring-4 focus:ring-[#0b587b]/10" placeholder="name@organisation.com" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Password</span><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 outline-none focus:ring-4 focus:ring-[#0b587b]/10" placeholder="••••••••" /></label>{error && <div className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}<button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white transition hover:bg-[#083a55] disabled:opacity-60">{loading ? 'Signing in…' : 'Sign in'}<ArrowRight size={15} /></button></form><p className="mt-5 text-[11px] leading-5 text-slate-400">Need access? Ask your office administrator to create your account.</p></div></div></section></main></div>;
}
