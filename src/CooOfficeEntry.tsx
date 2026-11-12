import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { getOfficeIdentity, isSupabaseConfigured, signInWithOfficeToken, signInWithSupabase, signOutSupabase } from './lib/supabase';
import { saveDevice } from './lib/device';
import { assessmentFetch } from './AssessmentRoom';
import { card, input } from './AssessmentStaff';

// Individual Sign In > Office COO (shown only to the COO): opens the COO office on the phone.
// The COO's own Individual Sign In is the proof of who they are: the server gives the COO office session (and registers this phone), so no
// office email, password or device key is asked for. The email and password form below stays only as a fallback if that does not work.
const open = () => { window.location.hash = 'office/coo'; };
const remember = (account: { email: string; fullName: string; status?: string; branch: string }) => {
  localStorage.setItem('ara_portal_session', JSON.stringify(account));
  localStorage.setItem('araoffice_user', JSON.stringify({ email: account.email, fullName: account.fullName, role: 'Staff', status: account.status || 'Active', location: account.branch, profilePic: '' }));
  localStorage.removeItem('ara_view_mode');
};

export default function CooOfficeEntry() {
  const [state, setState] = useState<'checking' | 'form'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Already signed in to the COO office on this phone: go straight in.
        const identity = await getOfficeIdentity().catch(() => null);
        if (identity?.officeAccess.includes('coo')) { open(); return; }
        const result = await assessmentFetch('action=coo_office_session', { method: 'POST', body: JSON.stringify({}) });
        if (result.device) saveDevice(result.device.token, result.device.name);
        const account = await signInWithOfficeToken(result.tokenHash);
        if (!account.officeAccess?.includes('coo')) { await signOutSupabase(); throw new Error('not coo'); }
        remember(account);
        if (live) open();
      } catch { if (live) setState('form'); }
    })();
    return () => { live = false; };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured for this deployment.');
      const account = await signInWithSupabase(email, password);
      if (!account.officeAccess?.includes('coo')) { await signOutSupabase(); throw new Error('This is not the COO office account.'); }
      remember(account);
      open();
    } catch (cause) { setError(cause instanceof Error && /COO office account|configured/.test(cause.message) ? cause.message : 'Unable to sign in with these details. Check your email and password.'); }
    finally { setLoading(false); }
  };
  if (state === 'checking') return <p role="status" className="p-4 text-sm text-slate-500">Opening your office…</p>;
  return <form onSubmit={(event) => void submit(event)} className={`${card} mx-auto max-w-md space-y-4`}>
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f6fb] text-[#0b587b]"><Building2 className="h-6 w-6" /></span><div><h2 className="text-lg font-semibold">Office COO</h2><p className="text-sm text-slate-500">We could not open it automatically. Sign in with the office email and password instead.</p></div></div>
    <input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Office email" className={input} />
    <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className={input} />
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Signing in…' : 'Open Office COO'}<ArrowRight className="h-4 w-4" /></button>
  </form>;
}
