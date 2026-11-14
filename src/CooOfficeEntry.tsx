import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { getOfficeIdentity, isSupabaseConfigured, signInWithOfficeToken, signInWithSupabase, signOutSupabase } from './lib/supabase';
import { saveDevice } from './lib/device';
import { rememberGreeting } from './lib/officeGreeting';
import { assessmentFetch } from './AssessmentRoom';
import { card, input } from './AssessmentStaff';

// Individual Sign In > Office COO / CEO / HR (shown only to the COO, the CEO or the CHRO): opens that office on the phone.
// The COO's own Individual Sign In is the proof of who they are: the server gives the COO office session (and registers this phone), so no
// office email, password or device key is asked for. The email and password form below stays only as a fallback if that does not work.
const open = (office: 'coo' | 'ceo' | 'hr' | 'procurement') => { window.location.hash = `office/${office}`; };
const remember = (account: { email: string; fullName: string; status?: string; branch: string; role?: string }) => {
  localStorage.setItem('ara_portal_session', JSON.stringify(account));
  localStorage.setItem('araoffice_user', JSON.stringify({ email: account.email, fullName: account.fullName, role: account.role || 'Staff', status: account.status || 'Active', location: account.branch, profilePic: '' }));
  localStorage.removeItem('ara_view_mode');
};

// The office sign-in link is single use. React runs this effect twice in development (and a double tap can too), and two requests for the same account
// would make the second one fail with "Email link is invalid or has expired". So one request is shared by every caller within a few seconds.
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof signInWithOfficeToken>>>>();
function openOfficeSession(office: string, preview: boolean) {
  const key = `${office}:${preview}`;
  const running = inFlight.get(key);
  if (running) return running;
  const started = (async () => {
    const result = await assessmentFetch(`action=${office}_office_session`, { method: 'POST', body: JSON.stringify(preview ? { preview: true } : {}) });
    if (result.device) saveDevice(result.device.token, result.device.name);
    return signInWithOfficeToken(result.tokenHash);
  })();
  inFlight.set(key, started);
  const forget = () => setTimeout(() => inFlight.delete(key), 5000);
  started.then(forget, () => inFlight.delete(key));
  return started;
}

// Layout previews enter with the verified System Admin account, while the greeting follows the selected role.
export default function CooOfficeEntry({ office = 'coo', greeting = '', preview = false }: { office?: 'coo' | 'ceo' | 'hr' | 'procurement'; greeting?: string; preview?: boolean } = {}) {
  const name = office === 'ceo' ? 'CEO' : office === 'hr' ? 'HR' : office === 'procurement' ? 'Procurement' : 'COO';
  const [state, setState] = useState<'checking' | 'form'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [why, setWhy] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Already signed in to the COO office on this phone: go straight in.
        const identity = await getOfficeIdentity().catch(() => null);
        if (!preview && (identity?.role === 'super_admin' || identity?.officeAccess.includes(office))) { rememberGreeting(office, greeting); open(office); return; }
        const account = await openOfficeSession(office, preview);
        if (account.role !== 'Superadmin' && !account.officeAccess?.includes(office)) { await signOutSupabase(); throw new Error(`not ${office}`); }
        remember(account);
        if (preview) localStorage.setItem('ara_view_mode', 'staff');
        rememberGreeting(office, greeting);
        if (live) open(office);
      } catch (cause) { console.error('Office session failed', cause); if (live) { setWhy(cause instanceof Error ? cause.message : String(cause)); setState('form'); } }
    })();
    return () => { live = false; };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured for this deployment.');
      const account = await signInWithSupabase(email, password);
      if (account.role !== 'Superadmin' && !account.officeAccess?.includes(office)) { await signOutSupabase(); throw new Error(`This is not the ${name} office account.`); }
      remember(account);
      open(office);
    } catch (cause) { setError(cause instanceof Error && /office account|configured/.test(cause.message) ? cause.message : 'Unable to sign in with these details. Check your email and password.'); }
    finally { setLoading(false); }
  };
  if (state === 'checking') return <p role="status" className="p-4 text-sm text-slate-500">Opening your office…</p>;
  if (preview) return <div role="alert" className={`${card} mx-auto max-w-md space-y-3`}><p className="text-sm text-rose-700">{why || 'Could not open the System Admin layout preview.'}</p><a href="#office/individual" className="inline-block rounded-lg bg-[#0b587b] px-3 py-2 text-sm font-semibold text-white">Return to Individual Sign In</a></div>;
  return <form onSubmit={(event) => void submit(event)} className={`${card} mx-auto max-w-md space-y-4`}>
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f6fb] text-[#0b587b]"><Building2 className="h-6 w-6" /></span><div><h2 className="text-lg font-semibold">Office {name}</h2><p className="text-sm text-slate-500">We could not open it automatically. Sign in with the office email and password instead.</p></div></div>
    <input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Office email" className={input} />
    <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className={input} />
    {preview && why && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Preview could not open the office: {why}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Signing in…' : `Open Office ${name}`}<ArrowRight className="h-4 w-4" /></button>
  </form>;
}
