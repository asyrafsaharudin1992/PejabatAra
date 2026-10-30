import { ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, CalendarClock, CalendarDays, ClipboardCheck, Clock3, Coins, House, KeyRound, LogOut, MoreHorizontal, PiggyBank, ReceiptText, ScanFace, Settings, Star, UserRound } from 'lucide-react';
import { assessmentFetch, HERO_PHOTO, SetPassword, Shell, SignIn, TOKEN_KEY } from './AssessmentRoom';
import LeaveSection from './LeaveScreens';
import MyAttendance from './MyAttendance';
import { ReviewRoom } from './OfficeReview';
import MyRoster from './MyRoster';

// Individual Sign In: staff sign in once with their name, staff code and password, then choose what they
// need from a grid of icons, like the staff app they already know. Parts that are built open their own
// screen; the rest are shown as "Soon". The Assessment Room and Incentive Claims share this one session.
type Me = { staff: { name: string; code?: string; branch: string; preview: boolean; hasPassword?: boolean; isApprover?: boolean; canAssess?: boolean; leaveWaiting?: number; canReview?: boolean; reviewWaiting?: number } };
type View = 'home' | 'leave' | 'roster' | 'attendance' | 'review' | 'profile' | 'settings' | 'password';
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

// The last answer for this sign-in is kept on the phone so the name and icons show at once; the fresh answer replaces it.
const ME_KEY = 'ara_individual_me';
const tokenTail = () => { try { return (localStorage.getItem(TOKEN_KEY) || '').slice(-10); } catch { return ''; } };
function readRememberedMe(): Me | null { try { const saved = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); return saved && saved.t && saved.t === tokenTail() ? saved.me : null; } catch { return null; } }
function rememberMe(me: Me) { try { localStorage.setItem(ME_KEY, JSON.stringify({ t: tokenTail(), me })); } catch { /* storage not available */ } }
function forgetMe() { try { localStorage.removeItem(ME_KEY); } catch { /* storage not available */ } }

// Phone home: a photo of the clinic, a greeting, one line picked at random each visit, and the icons in a white card, with a bar at the bottom.
const HERO = HERO_PHOTO;
const QUOTES = ['Every shift matters, every patient counts.', 'Care for your team the way you care for patients.', 'Small acts of kindness every day create a big difference.', 'Together, we make a difference every day.'];
type PhoneItem = { label: string; short: string; icon: typeof Settings; tone: string; href?: string; onClick?: () => void; soon?: boolean; badge?: number };

function PhoneTile({ item }: { key?: string; item: PhoneItem }) {
  const body = <>
    <span className={`relative grid h-[52px] w-[52px] place-items-center rounded-[16px] ${item.tone}`}><item.icon className="h-6 w-6" strokeWidth={1.5} />
      {item.soon && <span className="absolute -right-4 -top-2 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 shadow">Soon</span>}
      {!!item.badge && <span aria-label={`${item.badge} waiting`} className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white shadow">{item.badge}</span>}</span>
    <span className="mt-2 block w-full min-w-0"><strong className="block text-[14px] font-bold leading-tight text-[#0b2a4a]">{item.label}</strong><span className="mt-0.5 block text-[11.5px] leading-[1.3] text-slate-500">{item.short}</span></span>
  </>;
  const base = 'flex min-w-0 flex-col items-center rounded-2xl px-1 py-2 text-center transition active:bg-slate-50';
  if (item.soon) return <div aria-disabled="true" className={`${base} opacity-80`}>{body}</div>;
  return item.href ? <a href={item.href} className={base}>{body}</a> : <button type="button" onClick={item.onClick} className={base}>{body}</button>;
}

function PhoneNav({ view, onGo }: { view: string; onGo: (next: View) => void }) {
  const tabs: [View, string, typeof Settings, string[]][] = [['home', 'Home', House, ['home']], ['roster', 'Roster', CalendarDays, ['roster']], ['attendance', 'Attendance', Clock3, ['attendance']], ['settings', 'More', MoreHorizontal, ['settings', 'profile']]];
  return <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 rounded-t-[26px] bg-white px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 shadow-[0_-6px_26px_rgba(11,42,74,0.1)] md:hidden">
    <div className="grid grid-cols-4">{tabs.map(([target, label, Icon, active]) => { const on = active.includes(view); return <button key={label} onClick={() => onGo(target)} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[12px] font-semibold ${on ? 'text-[#1f6feb]' : 'text-slate-400'}`}><Icon className="h-6 w-6" strokeWidth={on ? 2 : 1.6} />{label}</button>; })}</div>
  </nav>;
}

// Inner screens: the blue photo header at the very top (back button and the title), then the content.
function Screen({ title, onBack, children, nav }: { title: string; onBack: () => void; children: ReactNode; nav?: ReactNode }) {
  return <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
    <header className="relative overflow-hidden rounded-b-[28px] bg-[#0b3d59] text-white shadow-[0_14px_36px_rgba(11,48,70,0.2)] md:rounded-b-[36px]">
      <div className="absolute inset-0 bg-cover bg-[center_62%]" style={{ backgroundImage: `url(${HERO})` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#082c42] via-[#0b3d59]/80 to-[#0b3d59]/10" />
      <div className="relative mx-auto max-w-6xl px-5 pb-6 pt-[max(env(safe-area-inset-top),16px)] sm:px-10 sm:pb-9">
        <div className="flex items-center justify-between"><button onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/15 px-3.5 text-sm font-medium backdrop-blur"><ArrowLeft className="h-4 w-4" />My workspace</button><span className="text-lg font-extrabold tracking-tight"><span>Ara</span><span className="text-[#7cc4ff]">Office</span></span></div>
        <h1 className="mt-6 text-[30px] font-semibold tracking-tight sm:mt-8 sm:text-4xl">{title}</h1>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-10 sm:pt-9 md:pb-10">{children}</main>
    {nav}
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
  const [me, setMe] = useState<Me | null>(() => readRememberedMe());
  const [view, setView] = useState<View>('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { if (view !== 'home') return; const clock = setInterval(() => setNow(new Date()), 20000); setNow(new Date()); return () => clearInterval(clock); }, [view]);

  useEffect(() => {
    if (!signedIn) { setMe(null); return; }
    let live = true;
    assessmentFetch('action=me').then((result: Me) => { if (live) { setMe(result); rememberMe(result); } }).catch((cause: { status?: number }) => { if (live && cause?.status === 401) { forgetMe(); setSignedIn(false); } });
    return () => { live = false; };
  }, [signedIn]);

  // A few details for the desktop profile card (the same safe subset My Profile shows).
  useEffect(() => {
    if (!me || me.staff.hasPassword === false || !window.matchMedia('(min-width: 768px)').matches) return;
    let live = true;
    assessmentFetch('action=my_profile').then((result: { profile?: Profile }) => { if (live && result.profile) setProfile(result.profile); }).catch(() => undefined);
    return () => { live = false; };
  }, [me?.staff.code, me?.staff.hasPassword]);

  const signOut = async () => {
    await assessmentFetch('action=logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY); forgetMe();
    setView('home');
    setSignedIn(false);
  };

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} title="Individual Sign In" intro="Sign in with your name, staff code and password to open your leave, attendance, assessments and incentive claims (and Performance Review for supervisors). First time? Use the last 4 digits of your IC." button="Sign in" />;
  // Signed in with the IC digits but no password chosen yet: choose one first.
  if (me && me.staff.hasPassword === false) return <Shell><SetPassword first onDone={() => setMe({ staff: { ...me.staff, hasPassword: true } })} /></Shell>;

  const phoneNav = <PhoneNav view={view} onGo={setView} />;
  if (view === 'password') return <Shell><SetPassword onDone={() => setView('settings')} onCancel={() => setView('settings')} /></Shell>;
  if (view === 'leave') return <Screen nav={phoneNav} title="Leave" onBack={() => setView('home')}><LeaveSection isApprover={Boolean(me?.staff.isApprover)} /></Screen>;
  if (view === 'review') return <Screen nav={phoneNav} title="Performance review" onBack={() => setView('home')}><ReviewRoom embedded onSignedOut={() => setSignedIn(false)} api={(query, body) => assessmentFetch(query.replace('action=', 'action=review_'), body ? { method: 'POST', body: JSON.stringify(body) } : undefined)} /></Screen>;
  if (view === 'attendance') return <Screen nav={phoneNav} title="Attendance" onBack={() => setView('home')}><MyAttendance /></Screen>;
  if (view === 'roster') return <Screen nav={phoneNav} title="My roster" onBack={() => setView('home')}><MyRoster /></Screen>;
  if (view === 'profile') return <Screen nav={phoneNav} title="My profile" onBack={() => setView('home')}><MyProfile /></Screen>;
  if (view === 'settings') return <Screen nav={phoneNav} title="Settings" onBack={() => setView('home')}>
    <div className="space-y-3">
      <button onClick={() => setView('password')} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f6fb] text-[#0b587b]"><KeyRound className="h-5 w-5" /></span><span><strong className="block text-sm">Change password</strong><span className="text-xs text-slate-500">Choose a new sign-in password</span></span></button>
      <button onClick={() => void signOut()} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-[0_8px_25px_rgba(20,35,59,0.06)] hover:bg-slate-50"><span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-600"><LogOut className="h-5 w-5" /></span><span><strong className="block text-sm">Sign out</strong><span className="text-xs text-slate-500">Leave this device</span></span></button>
    </div>
  </Screen>;

  const name = me?.staff.name || '';
  const company = me ? (COMPANY[me.staff.branch] || me.staff.branch) : '';
  type Item = { label: string; desc: string; icon: typeof Settings; tone: string; href?: string; onClick?: () => void; soon?: boolean; badge?: number };
  const items: Item[] = [
    { label: 'Attendance', desc: 'Clock in and out with your location', icon: ScanFace, tone: 'bg-[#e9f6fb] text-[#0b587b]', onClick: () => setView('attendance') },
    { label: 'Leave', desc: me?.staff.leaveWaiting ? `${me.staff.leaveWaiting} waiting for your approval` : 'Your leave balance', icon: CalendarDays, tone: 'bg-[#e9f6fb] text-[#0b587b]', onClick: () => setView('leave'), badge: me?.staff.leaveWaiting || 0 },
    { label: 'My Roster', desc: 'The dates and shifts you work', icon: CalendarClock, tone: 'bg-[#e6f7ec] text-[#1f8a4c]', onClick: () => setView('roster') },
    ...(me?.staff.canReview ? [{ label: 'Performance Review', desc: me.staff.reviewWaiting ? `${me.staff.reviewWaiting} to fill in` : 'Reviews HR has given you', icon: Star, tone: 'bg-[#fff1d6] text-[#b57a00]', onClick: () => setView('review'), badge: me.staff.reviewWaiting || 0 } as Item] : []),
    { label: 'Payslip', desc: 'Your monthly payslips', icon: ReceiptText, tone: 'bg-[#fff1d6] text-[#b57a00]', soon: true },
    { label: 'Income Tax', desc: 'Your EA and CP58 forms', icon: PiggyBank, tone: 'bg-[#e6f7ec] text-[#1f8a4c]', soon: true },
    { label: 'My Profile', desc: 'Your staff details', icon: UserRound, tone: 'bg-[#f1e9ff] text-[#6b4bd8]', onClick: () => setView('profile') },
    { label: 'Assessment Room', desc: 'Periodic staff assessments', icon: ClipboardCheck, tone: 'bg-[#91d7ed]/40 text-[#0b3046]', href: '#office/assessment' },
    ...(me?.staff.preview ? [] : [{ label: 'Incentive Claims', desc: 'Record your procedures and claim your incentive', icon: Coins, tone: 'bg-[#ffd36b]/50 text-[#3b2a00]', href: '#office/incentives' } as Item]),
    { label: 'Settings', desc: 'Change your password, sign out', icon: Settings, tone: 'bg-slate-100 text-slate-600', onClick: () => setView('settings') },
  ];
  const short: Record<string, string> = { Attendance: 'Check in/out and view records', Leave: me?.staff.leaveWaiting ? `${me.staff.leaveWaiting} waiting for you` : 'Apply and track your leave', 'My Roster': 'View your schedule', 'Performance Review': me?.staff.reviewWaiting ? `${me.staff.reviewWaiting} to fill in` : 'Reviews given to you', Payslip: 'View your payslips', 'Income Tax': 'Access your tax documents', 'My Profile': 'View your profile', 'Assessment Room': 'Take your assessments', 'Incentive Claims': 'View your claims and status', Settings: 'Manage your preferences' };
  const phoneItems: PhoneItem[] = items.map((item) => ({ label: item.label, short: short[item.label] || item.desc, icon: item.icon, tone: item.tone, href: item.href, onClick: item.onClick, soon: item.soon, badge: item.badge }));
  const facts: [string, string][] = profile ? [['Position', profile.position], ['Department', profile.department], ['Joined', dmy(profile.joinDate)]] : [];

  return <>
    {/* Phone: the photo of the clinic, a greeting and the icons in a white card */}
    <div className="min-h-[100svh] bg-[#f3f6fb] pb-[84px] text-[#14233b] md:hidden">
      <header className="relative h-[clamp(300px,38svh,380px)] overflow-hidden bg-[#cfe3f4]">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#082c42]/90 via-[#0b3d59]/55 to-transparent" />
        <div className="relative flex items-start justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]">
          <div><p className="text-[34px] font-extrabold leading-none tracking-tight"><span className="text-[#0b2a4a]">Ara</span><span className="text-[#1f6feb]">Office</span></p><p className="mt-1.5 text-[11px] font-medium tracking-[0.34em] text-[#0b2a4a]">KLINIK ARA 24 JAM</p></div>
          <button onClick={() => { if (me?.staff.leaveWaiting) setView('leave'); else if (me?.staff.reviewWaiting) setView('review'); }} aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white/70 text-[#0b2a4a] backdrop-blur"><Bell className="h-6 w-6" strokeWidth={1.7} />{((me?.staff.leaveWaiting || 0) + (me?.staff.reviewWaiting || 0)) > 0 && <i className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" />}</button>
        </div>
        <div className="relative mt-4 flex items-center gap-3.5 px-5"><span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full bg-[#cfe3f9] text-xl font-bold text-[#1f6feb]">{me ? initials(name) : '…'}</span><div className="min-w-0"><h1 className="truncate text-[23px] font-bold leading-tight tracking-tight text-[#0b2a4a]">Hi, {me ? name.split(' ')[0] : '…'}</h1><p className="text-[14px] text-slate-600">Have a good day ahead!</p><p className="mt-0.5 text-[12.5px] font-semibold text-[#1f6feb]">{now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' })} · {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</p></div></div>
        <div className="absolute inset-x-0 bottom-9 px-5"><p className="max-w-[290px] text-[21px] font-semibold leading-snug tracking-tight text-white [text-shadow:0_1px_8px_rgba(8,44,66,0.55)]">{quote}</p><i className="mt-2 block h-1 w-12 rounded-full bg-[#7cc4ff]" /></div>
      </header>
      <main className="relative z-10 -mt-6 mx-3 rounded-[26px] bg-white px-1.5 pb-4 pt-4 shadow-[0_10px_34px_rgba(11,42,74,0.1)]">
        <div className="grid grid-cols-3 gap-x-0.5 gap-y-2">{phoneItems.map((item) => <PhoneTile key={item.label} item={item} />)}</div>
      </main>
      {phoneNav}
    </div>

    {/* Desktop workspace */}
    <div className="hidden min-h-screen bg-[#f5f5f7] text-[#1d1d1f] md:block">
        {/* The same clinic photo as the phone, under a deep blue wash */}
        <section className="relative overflow-hidden rounded-b-[36px] bg-[#0b3d59] shadow-[0_18px_44px_rgba(11,48,70,0.22)]">
          <div className="absolute inset-0 bg-cover bg-[center_62%]" style={{ backgroundImage: `url(${HERO})` }} />
          <div className="absolute inset-0 bg-gradient-to-r from-[#082c42] via-[#0b3d59]/75 to-[#0b3d59]/5" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#082c42]/45 to-transparent" />
          <div className="relative mx-auto flex min-h-[280px] max-w-6xl flex-col justify-between gap-6 px-10 pb-10 pt-6 text-white"><div className="flex items-center justify-between"><a href="#" className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-sm font-medium backdrop-blur"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a><span className="text-sm font-medium text-white/80">My workspace</span></div><div className="flex items-end justify-between gap-8">
            <div className="min-w-0">
              <p className="text-[34px] font-extrabold leading-none tracking-tight"><span>Ara</span><span className="text-[#7cc4ff]">Office</span></p>
              <p className="mt-1.5 text-[11px] font-medium tracking-[0.34em] text-white/80">KLINIK ARA 24 JAM</p>
              <h1 className="mt-9 truncate text-[40px] font-semibold leading-tight tracking-tight">Hello, {me ? name.split(' ')[0] : '…'}.</h1>
              <p className="mt-2 max-w-xl text-[15px] text-white/80">{quote}</p><i className="mt-3 block h-1 w-12 rounded-full bg-[#7cc4ff]" />
            </div>
            <div className="shrink-0 text-right"><p className="text-[44px] font-semibold leading-none tabular-nums tracking-tight">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</p><p className="mt-2 text-sm text-white/80">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kuala_Lumpur' })}</p></div>
            </div>
          </div>
        </section>
      <main className="mx-auto max-w-6xl px-10 pb-12 pt-9">
        <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] p-6 text-white shadow-[0_16px_40px_rgba(11,48,70,0.18)]">
            <i aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 -z-10 h-48 w-48 rounded-full bg-white/[0.06]" />
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[#d6eef7] text-xl font-semibold text-[#0b3d59] ring-4 ring-white/5">{me ? initials(name) : '…'}</span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{name || 'Loading…'}</h2>
            <p className="mt-1 text-xs text-[#b9cfdd]">{me?.staff.code}</p>
            <p className="mt-3 text-xs leading-5 text-[#b9cfdd]">{company}</p>
            {facts.length > 0 && <dl className="mt-5 space-y-4 border-t border-white/15 pt-5 text-sm">{facts.map(([label, value]) => <div key={label}><dt className="text-[10px] uppercase tracking-[0.12em] text-[#a4c0d0]">{label}</dt><dd className="mt-1 text-xs font-medium leading-5 text-white/95">{value || '—'}</dd></div>)}</dl>}
            <button onClick={() => void signOut()} className="mt-6 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-medium text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><LogOut className="h-4 w-4" />Sign out</button>
          </aside>
          <section className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold">Your essentials</h2>
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2">{items.map(item => {
              const body = <><span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px] ${item.tone}`}><item.icon className="h-5 w-5" strokeWidth={1.6} />{!!item.badge && <span aria-label={`${item.badge} waiting for approval`} className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">{item.badge}</span>}</span><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">{item.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{item.desc}</span></span>{item.soon ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-400">Soon</span> : <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5" />}</>;
              const style = 'group flex min-h-[100px] items-center gap-3 rounded-[20px] border border-black/[0.04] bg-white p-5 text-left shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition hover:border-slate-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#0b587b]';
              if (item.soon) return <div key={item.label} aria-disabled="true" className="flex min-h-[100px] items-center gap-3 rounded-[20px] border border-black/[0.04] bg-white/70 p-5 text-left">{body}</div>;
              return item.href ? <a key={item.label} href={item.href} className={style}>{body}</a> : <button key={item.label} type="button" onClick={item.onClick} className={style}>{body}</button>;
            })}</div>
          </section>
        </div>
      </main>
    </div>
  </>;
}
