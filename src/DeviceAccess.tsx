import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Copy, KeyRound, Laptop, ShieldCheck, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { lastDeviceName, saveDevice } from './lib/device';

const DEVICES_API = '/api/status?resource=devices';
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export type DeviceStatus = { lockEnabled: boolean; exempt: boolean; device: { name: string; expiresAt: string } | null };

export async function loadDeviceStatus(): Promise<DeviceStatus> {
  return (await officeFetch(DEVICES_API)).json();
}

// Shown instead of an office when this device is not registered or its 30 days are up.
export function DeviceGate({ onRegistered }: { onRegistered: () => void }) {
  const previousName = lastDeviceName();
  const [key, setKey] = useState('');
  const [name, setName] = useState(previousName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setSaving(true);
    try {
      const result = await (await officeFetch(DEVICES_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', key, name }) })).json();
      saveDevice(result.token, result.name);
      onRegistered();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to register this device.');
    } finally { setSaving(false); }
  };

  return <div className="flex min-h-screen items-center justify-center bg-[#f5f7f9] px-4 py-10 text-[#14233b]">
    <form onSubmit={submit} className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[0_18px_45px_rgba(20,35,59,0.1)]">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0b3d59] text-[#91d7ed]"><Laptop className="h-7 w-7" strokeWidth={1.5} /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{previousName ? 'Register this device again' : 'Register this device'}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{previousName ? `The registration for “${previousName}” has ended. Enter the device security key to keep using AraOffice here.` : 'AraOffice can only be used on registered clinic devices. Enter the device security key from your System Admin.'}</p>
      <label className="mt-6 block"><span className="mb-2 block text-xs font-bold text-slate-700">Device security key</span><input required autoFocus autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 font-mono tracking-wider outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-700">Device name</span><input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Kajang Front Desk" className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      {error && <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <button disabled={saving} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white transition hover:bg-[#083a55] disabled:opacity-60">{saving ? 'Registering…' : 'Register device'}<ArrowRight size={15} /></button>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">A registration lasts 30 days. Clearing browser data or using a private window will ask for the key again.</p>
      <a href="#" className="mt-4 block text-center text-xs font-semibold text-[#0b587b]">Return to sign in</a>
    </form>
  </div>;
}

type AdminDevices = { lockEnabled: boolean; keyUpdatedAt: string | null; devices: { id: string; name: string; registeredBy: string; registeredAt: string; expiresAt: string; lastSeenAt: string | null }[] };

// Control Centre page: the security key, the registered devices, and revoking them.
export default function DeviceManager() {
  const [data, setData] = useState<AdminDevices | null>(null);
  const [newKey, setNewKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setData(await (await officeFetch(`${DEVICES_API}&view=admin`)).json()); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to load devices.'); }
  };
  useEffect(() => { void load(); }, []);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage('');
    try {
      const result = await (await officeFetch(DEVICES_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (result.key) setNewKey(result.key);
      setMessage(done); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to update devices.'); }
    finally { setBusy(false); }
  };

  const generate = () => {
    if (data?.lockEnabled && !window.confirm('Generate a new security key? Devices already registered keep working until their 30 days end, but new registrations will need the new key.')) return;
    void act({ action: 'generate_key' }, 'New security key created. Copy it now — it will not be shown again.');
  };
  const disable = () => {
    if (window.confirm('Turn off the device lock? Staff will be able to use AraOffice from any device until you generate a new key.')) void act({ action: 'disable_lock' }, 'Device lock turned off.');
  };
  const revoke = (id: string, name: string) => {
    if (window.confirm(`Revoke “${name}”? It will need the security key again before staff can use it.`)) void act({ action: 'revoke', id }, `“${name}” revoked.`);
  };

  return <main className="min-h-screen bg-[#f5f7f9] px-6 py-8 text-[#14233b] sm:px-10 lg:px-16">
    <div className="mx-auto max-w-5xl">
      <a href="#office/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />Back to Control Centre</a>
      <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">ARAOFFICE CONTROL CENTRE</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Registered Devices</h1>
      <p className="mt-2 text-sm text-slate-500">Staff can only use AraOffice on devices registered with the security key. Each registration lasts 30 days. System Admins are exempt.</p>
      {message && <p role="status" className="mt-6 rounded-xl bg-white p-4 text-sm shadow-sm">{message}</p>}

      <section className="mt-6 rounded-[24px] bg-white p-6 shadow-[0_12px_35px_rgba(20,35,59,0.08)] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eaf6fb] text-[#0b587b]"><KeyRound className="h-6 w-6" /></span><div><h2 className="text-lg font-semibold">Device security key</h2><p className="mt-1 text-sm text-slate-500">{!data ? 'Loading…' : data.lockEnabled ? `Device lock is on. Key created ${formatDate(data.keyUpdatedAt)}.` : 'Device lock is off. Staff can use any device until you generate a key.'}</p></div></div>
          <div className="flex shrink-0 gap-2">{data?.lockEnabled && <button onClick={disable} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Turn off</button>}<button onClick={generate} disabled={busy || !data} className="rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#083a55] disabled:opacity-50">{data?.lockEnabled ? 'Generate new key' : 'Turn on & generate key'}</button></div>
        </div>
        {newKey && <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-800">New key — shown only once</p><p className="mt-2 font-mono text-2xl font-semibold tracking-widest text-[#14233b]">{newKey}</p></div><button onClick={() => void navigator.clipboard.writeText(newKey).then(() => setMessage('Key copied.'))} className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm sm:self-auto"><Copy className="h-4 w-4" />Copy</button></div>}
      </section>

      <section className="mt-6 rounded-[24px] bg-white p-6 shadow-[0_12px_35px_rgba(20,35,59,0.08)] sm:p-8">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-[#0b587b]" /><h2 className="text-lg font-semibold">Active devices</h2><span className="text-sm text-slate-400">{data ? data.devices.length : ''}</span></div>
        {data && data.devices.length === 0 && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No devices registered yet.</p>}
        {data && data.devices.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400"><th className="py-3 pr-4">Device</th><th className="pr-4">Registered by</th><th className="pr-4">Last used</th><th className="pr-4">Expires</th><th /></tr></thead><tbody>{data.devices.map((device) => <tr key={device.id} className="border-b border-slate-50"><td className="py-3 pr-4 font-semibold">{device.name}<span className="block text-xs font-normal text-slate-400">{formatDate(device.registeredAt)}</span></td><td className="pr-4 text-slate-600">{device.registeredBy}</td><td className="pr-4 text-slate-600">{formatDate(device.lastSeenAt)}</td><td className="pr-4 text-slate-600">{formatDate(device.expiresAt)}</td><td className="text-right"><button onClick={() => revoke(device.id, device.name)} disabled={busy} title="Revoke" aria-label={`Revoke ${device.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </main>;
}
