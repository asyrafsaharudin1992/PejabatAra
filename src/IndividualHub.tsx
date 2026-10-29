import { ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, Coins, KeyRound, LogOut, PiggyBank, ReceiptText, ScanFace, Settings, UserRound } from 'lucide-react';
import { assessmentFetch, SetPassword, Shell, SignIn, TOKEN_KEY } from './AssessmentRoom';
import LeaveSection from './LeaveScreens';

// Individual Sign In: staff sign in once with their name, staff code and password, then choose what they
// need from a grid of icons, like the staff app they already know. Parts that are built open their own
// screen; the rest are shown as "Soon". The Assessment Room and Incentive Claims share this one session.
type Me = { staff: { name: string; code?: string; branch: string; preview: boolean; hasPassword?: boolean; isApprover?: boolean; canAssess?: boolean; leaveWaiting?: number } };
type View = 'home' | 'leave' | 'profile' | 'settings' | 'password';
type Profile = { fullName: string; code: string; company: string; branch: string; department: string; position: string; employmentType: string; joinDate: string | null; confirmDate: string | null; email: string; phone: string };

const COMPANY: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN BHD', SK: 'SK- HSO HEALTHCARE SDN. BHD.' };
const dmy = (date: string | null | undefined) => date ? date.split('-').reverse().join('/') : '—';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

function Tile({ icon: Icon, label, tone, href, onClick, soon = false, badge = 0 }: { key?: string; icon: typeof Settings; label: string; tone: string; href?: string; onClick?: () => void; soon?: boolean; badge?: number }) {
  const body = <>
    <span className={`relative grid h-12 w-12 place-items-center rounded-2xl ${tone}`}><Icon className="h-6 w-6" strokeWidth={1.7} />{soon && <span className="absolute -right-2 -top-2 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 shadow">Soon</span>}{badge > 0 && <span aria-label={`${badge} waiting`} className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white shadow">{badge}</span>}</span>
    <span className="mt-1.5 text-center text-[12px] font-semibold leading-tight text-[#14233b]">{label}</span>
  </>;
  const base = 'flex flex-col items-center rounded-2xl p-2 transition';
  if (soon) return <div aria-disabled="true" className={`${base} opacity-55`}>{body}</div>;
  return href ? <a href={href} className={`${base} hover:bg-slate-50`}>{body}</a> : <button type="button" onClick={onClick} className={`${base} hover:bg-slate-50`}>{body}</button>;
}

// Wider than the sign-in pages on a desktop, a single column on a phone.
function Screen({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <div className="min-h-screen bg-[#f5f7f9] text-[#14233b]">
    <header className="relative overflow-hidden bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] px-4 pb-12 pt-4 text-white sm:px-8 sm:pb-16 sm:pt-8"><i className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-white/10" />
      <div className="relative mx-auto max-w-4xl">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#b9cfdd]"><ArrowLeft className="h-4 w-4" />Menu</button>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl">{title}</h1>
      </div>
    </header>
    <div className="relative -mt-7 rounded-t-3xl bg-[#f5f7f9] px-3 pb-10 pt-5 sm:-mt-8 sm:px-8"><div className="mx-auto max-w-4xl">{children}</div></div>
  </div>;
}

function MyProfile() {
  const [state, setState] = useState<{ linked: boolean; profile?: Profile } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { assessmentFetch('action=my_profile').then((result) => setState(result)).catch((cause: Error) => setError(cause.message)); }, []);
  if (error) return <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>;
  if (!state) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!state.linked || !state.profile) return <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">Your sign-in is not linked to your staff record yet. Ask HR to link it.</p>;
  const p = state.profile;
  const rows: [string, string][] = [['Name', p.fullName], ['Employee code', p.code], ['Company', COMPANY[p.company] || p.company], ['Branch', p.branch], ['Department', p.department], ['Position', p.position], ['Employment type', p.employmentType], ['Joined', dmy(p.joinDate)], ['Confirmed', dmy(p.confirmDate)], ['Email', p.email]];
  return <><dl className="divide-y divide-slate-100 rounded-2xl bg-white px-5 py-2 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">{rows.map(([label, value]) => <div key={label} className="flex gap-3 py-3 text-sm"><dt className="w-32 shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 flex-1 break-words font-medium">{value || '—'}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-slate-400">These come from your HR record. If something is wrong, ask HR to correct it.</p></>;
}

export default function IndividualHub() {
  const [signedIn, setSignedIn] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View>('home');
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!signedIn) { setMe(null); return; }
    let live = true;
    assessmentFetch('action=me').then((result: Me) => { if (live) setMe(result); }).catch((cause: { status?: number }) => { if (live && cause?.status === 401) setSignedIn(false); });
    return () => { live = false; };
  }, [signedIn]);

  // A few details for the desktop profile card (the same safe subset My Profile shows).
  useEffect(() => {
    if (!me || me.staff.hasPassword === false) return;
    let live = true;
    assessmentFetch('action=my_profile').then((result: { profile?: Profile }) => { if (live && result.profile) setProfile(result.profile); }).catch(() => undefined);
    return () => { live = false; };
  }, [me?.staff.code, me?.staff.hasPassword]);

  const signOut = async () => {
    await assessmentFetch('action=logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    setView('home');
    setSignedIn(false);
  };

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} title="Individual Sign In" intro="Sign in with your name, staff code and password to open your leave, assessments and incentive claims. First time? Use the last 4 digits of your IC." button="Sign in" />;
  // Signed in with the IC digits but no password chosen yet: choose one first.
  if (me && me.staff.hasPassword === false) return <Shell><SetPassword first onDone={() => setMe({ staff: { ...me.staff, hasPassword: true } })} /></Shell>;

  if (view === 'password') return <Shell><SetPassword onDone={() => setView('settings')} onCancel={() => setView('settings')} /></Shell>;
  if (view === 'leave') return <Screen title="Leave" onBack={() => setView('home')}><LeaveSection isApprover={Boolean(me?.staff.isApprover)} /></Screen>;
  if (view === 'profile') return <Screen title="My profile" onBack={() => setView('home')}><MyProfile /></Screen>;
  if (view === 'settings') return <Screen title="Settings" onBack={() => setView('home')}>
    <div className="space-y-3">
      <button onClick={() => setView('password')} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f6fb] text-[#0b587b]"><KeyRound className="h-5 w-5" /></span><span><strong className="block text-sm">Change password</strong><span className="text-xs text-slate-500">Choose a new sign-in password</span></span></button>
      <button onClick={() => void signOut()} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-600"><LogOut className="h-5 w-5" /></span><span><strong className="block text-sm">Sign out</strong><span className="text-xs text-slate-500">Leave this device</span></span></button>
    </div>
  </Screen>;

  const name = me?.staff.name || '';
  const company = me ? (COMPANY[me.staff.branch] || me.staff.branch) : '';
  type Item = { label: string; desc: string; icon: typeof Settings; tone: string; href?: string; onClick?: () => void; soon?: boolean; badge?: number };
  const items: Item[] = [
    { label: 'Attendance', desc: 'Clock in and out with your location', icon: ScanFace, tone: 'bg-[#e9f6fb] text-[#0b587b]', soon: true },
    { label: 'Leave', desc: me?.staff.leaveWaiting ? `${me.staff.leaveWaiting} waiting for your approval` : 'Your leave balance', icon: CalendarDays, tone: 'bg-[#e9f6fb] text-[#0b587b]', onClick: () => setView('leave'), badge: me?.staff.leaveWaiting || 0 },
    { label: 'Payslip', desc: 'Your monthly payslips', icon: ReceiptText, tone: 'bg-[#fff1d6] text-[#b57a00]', soon: true },
    { label: 'Income Tax', desc: 'Your EA and CP58 forms', icon: PiggyBank, tone: 'bg-[#e6f7ec] text-[#1f8a4c]', soon: true },
    { label: 'My Profile', desc: 'Your staff details', icon: UserRound, tone: 'bg-[#f1e9ff] text-[#6b4bd8]', onClick: () => setView('profile') },
    { label: 'Assessment Room', desc: 'Periodic staff assessments', icon: ClipboardCheck, tone: 'bg-[#91d7ed]/40 text-[#0b3046]', href: '#office/assessment' },
    ...(me?.staff.preview ? [] : [{ label: 'Incentive Claims', desc: 'Record your procedures and claim your incentive', icon: Coins, tone: 'bg-[#ffd36b]/50 text-[#3b2a00]', href: '#office/incentives' } as Item]),
    { label: 'Settings', desc: 'Change your password, sign out', icon: Settings, tone: 'bg-slate-100 text-slate-600', onClick: () => setView('settings') },
  ];
  const facts: [string, string][] = profile ? [['Position', profile.position], ['Department', profile.department], ['Joined', dmy(profile.joinDate)]] : [];

  return <>
    {/* Phone: the icon grid, like the staff app */}
    <div className="min-h-screen bg-[#f5f7f9] text-[#14233b] md:hidden">
      <header className="relative overflow-hidden bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] px-4 pb-8 pt-4 text-white"><i className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-white/10" />
        <div className="flex items-start justify-between">
          <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b9cfdd]"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a>
          <button onClick={() => void signOut()} aria-label="Sign out" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><LogOut className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#d6eef7] text-lg font-bold text-[#0b3d59]">{me ? initials(name) : '…'}</span>
          <h1 className="mt-2.5 text-xl font-semibold tracking-tight">{me ? name : 'Loading…'}</h1>
          {me && <p className="mt-1 text-sm text-[#b9cfdd]">{[me.staff.code, company].filter(Boolean).join(' | ')}</p>}
        </div>
      </header>
      <main className="relative -mt-5 rounded-t-3xl bg-[#f5f7f9] px-3 pb-8 pt-7">
        <div className="grid grid-cols-3 gap-y-3">{items.map((item) => <Tile key={item.label} icon={item.icon} label={item.label} tone={item.tone} href={item.href} onClick={item.onClick} soon={item.soon} badge={item.badge} />)}</div>
      </main>
    </div>

    {/* Desktop: a profile card on the left, big cards for each part on the right */}
    <div className="hidden min-h-screen bg-[#f5f7f9] px-8 py-8 text-[#14233b] md:block">
      <div className="mx-auto max-w-6xl">
        <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a>
        <div className="mt-6 grid items-start gap-6 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
          <aside className="overflow-hidden relative rounded-[28px] bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] p-7 text-white shadow-[0_18px_45px_rgba(20,35,59,0.18)]">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-[#d6eef7] text-2xl font-bold text-[#0b3d59]">{me ? initials(name) : '…'}</span>
            <h1 className="mt-5 text-2xl font-semibold leading-tight tracking-tight">{me ? name : 'Loading…'}</h1>
            {me && <p className="mt-1.5 text-sm leading-5 text-[#b9cfdd]">{me.staff.code}<br />{company}</p>}
            {facts.length > 0 && <dl className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm">{facts.map(([label, value]) => <div key={label}><dt className="text-[11px] uppercase tracking-[0.14em] text-[#8eabba]">{label}</dt><dd className="mt-0.5 font-medium">{value || '—'}</dd></div>)}</dl>}
            <button onClick={() => void signOut()} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/20"><LogOut className="h-4 w-4" />Sign out</button>
          </aside>
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">What would you like to open?</h2>
            <p className="mt-1 text-sm text-slate-500">Everything for you in one place.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => {
              const body = <>
                <span className="flex items-start justify-between"><span className={`relative grid h-12 w-12 place-items-center rounded-2xl ${item.tone}`}><item.icon className="h-6 w-6" strokeWidth={1.7} />{(item.badge || 0) > 0 && <span aria-label={`${item.badge} waiting`} className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white shadow">{item.badge}</span>}</span>{item.soon ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Soon</span> : <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#0b587b]" />}</span>
                <strong className="mt-4 block text-base font-semibold">{item.label}</strong>
                <span className="mt-1 block text-sm leading-5 text-slate-500">{item.desc}</span>
              </>;
              const card = 'group block rounded-[24px] bg-white p-5 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] transition';
              if (item.soon) return <div key={item.label} aria-disabled="true" className={`${card} opacity-60`}>{body}</div>;
              return item.href ? <a key={item.label} href={item.href} className={`${card} hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(20,35,59,0.12)]`}>{body}</a> : <button key={item.label} type="button" onClick={item.onClick} className={`${card} hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(20,35,59,0.12)]`}>{body}</button>;
            })}</div>
          </section>
        </div>
      </div>
    </div>
  </>;
}
