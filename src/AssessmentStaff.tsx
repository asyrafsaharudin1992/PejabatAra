import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';

// Staff who sign in to the Assessment Room with name + staff code + last 4 IC digits. Shown under
// User Management: these are individual staff, separate from the shared
// office accounts above them.
export const ASSESSMENT_API = '/api/status?resource=assessment';

type Staff = { id: string; name: string; code: string; branch: string; active: boolean; hasIc4: boolean; preview: boolean };
type StaffDraft = { id?: string; name: string; code: string; ic4: string; branch: string; active: boolean; preview: boolean };

const BRANCHES = ['KJ', 'SK', 'SY'];
export const input = 'h-11 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 text-sm outline-none focus:ring-4 focus:ring-[#0b587b]/10';
export const card = 'rounded-[24px] bg-white p-6 shadow-[0_12px_35px_rgba(20,35,59,0.08)] sm:p-8';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10">
    <div className="w-full max-w-2xl rounded-[24px] bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      {children}
    </div>
  </div>;
}

export default function AssessmentStaff() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [draft, setDraft] = useState<StaffDraft | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setStaff((await (await officeFetch(`${ASSESSMENT_API}&action=staff`)).json()).staff); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to load staff.'); }
  };
  useEffect(() => { void load(); }, []);

  // Returns true when saved, so the form knows whether to close.
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage('');
    try {
      await officeFetch(ASSESSMENT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setMessage(done); await load(); return true;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (draft && await act({ action: 'save_staff', ...draft }, `${draft.name} saved.`)) setDraft(null);
  };

  return <section className={`mt-10 ${card}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex items-center gap-3"><Users className="h-6 w-6 text-[#0b587b]" /><h2 className="text-lg font-semibold">Staff</h2><span className="text-sm text-slate-400">{staff ? staff.length : ''}</span></div><p className="mt-1 text-sm text-slate-500">Individual staff for the Assessment Room. They sign in from their own phones with their name, staff code and the last 4 digits of their IC.</p></div>
      <button onClick={() => setDraft({ name: '', code: '', ic4: '', branch: '', active: true, preview: false })} className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#083a55] sm:self-auto"><Plus className="h-4 w-4" />Add staff</button>
    </div>
    {message && <p role="status" className="mt-5 rounded-xl bg-[#f7f9fc] p-4 text-sm">{message}</p>}
    {!staff && !message && <p className="mt-5 text-sm text-slate-500">Loading…</p>}
    {staff?.length === 0 && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No staff yet. Add each staff member with a staff code so they can sign in.</p>}
    {staff && staff.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400"><th className="py-3 pr-4">Name</th><th className="pr-4">Staff code</th><th className="pr-4">IC (last 4)</th><th className="pr-4">Branch</th><th className="pr-4">Status</th><th /></tr></thead><tbody>{staff.map((row) => <tr key={row.id} className="border-b border-slate-50">
      <td className="py-3 pr-4 font-semibold">{row.name}{row.preview && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Preview</span>}</td><td className="pr-4 font-mono tracking-wider text-slate-600">{row.code}</td><td className="pr-4">{row.hasIc4 ? <span className="text-xs text-slate-500">Set</span> : <span className="text-xs font-semibold text-amber-700">Not set</span>}</td><td className="pr-4 text-slate-600">{row.branch || '—'}</td>
      <td className="pr-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.active ? 'Active' : 'Inactive'}</span></td>
      <td className="whitespace-nowrap text-right"><button onClick={() => setDraft({ id: row.id, name: row.name, code: row.code, ic4: '', branch: row.branch, active: row.active, preview: row.preview })} title="Edit" aria-label={`Edit ${row.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Pencil className="h-4 w-4" /></button><button onClick={() => { if (window.confirm(`Remove ${row.name}? Their assessment results are deleted too. To keep results, edit and set them Inactive instead.`)) void act({ action: 'delete_staff', id: row.id }, `${row.name} removed.`); }} disabled={busy} title="Remove" aria-label={`Remove ${row.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
    </tr>)}</tbody></table></div>}

    {draft && <Modal title={draft.id ? 'Edit staff' : 'Add staff'} onClose={() => setDraft(null)}>
      <form onSubmit={save} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Name (sign-in)</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={input} /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Staff code</span><input autoComplete="off" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="Blank = generate" className={`${input} font-mono tracking-wider`} /></label>
        </div>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">IC number: last 4 digits</span><input required={!draft.id} inputMode="numeric" maxLength={4} autoComplete="off" value={draft.ic4} onChange={(event) => setDraft({ ...draft, ic4: event.target.value.replace(/\D/g, '') })} placeholder={draft.id ? 'Leave blank to keep current' : 'e.g. 1234'} className={`${input} font-mono tracking-widest sm:max-w-[200px]`} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Branch</span><input list="assessment-branches" value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} placeholder="KJ, SK, SY…" className={input} /><datalist id="assessment-branches">{BRANCHES.map((branch) => <option key={branch} value={branch} />)}</datalist></label>
          <label className="flex items-center gap-3 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="h-4 w-4 accent-[#0b587b]" />Active (can sign in)</label>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-amber-50/60 p-3 text-sm"><input type="checkbox" checked={draft.preview} onChange={(event) => setDraft({ ...draft, preview: event.target.checked })} className="mt-0.5 h-4 w-4 accent-[#0b587b]" /><span><strong className="font-semibold">Preview account</strong><span className="block text-xs leading-5 text-slate-500">For management: sees every assessment, including closed ones, with correct answers marked. Cannot submit and is left out of results.</span></span></label>
        <p className="text-xs leading-5 text-slate-400">Staff sign in by typing this name exactly (capital letters and spacing don't matter), their staff code and the last 4 digits of their IC. The IC digits are stored hashed and cannot be viewed again. Use the name staff will naturally type, e.g. “Nur Aisyah Ahmad” rather than a long official name.</p>
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save staff'}</button></div>
      </form>
    </Modal>}
  </section>;
}
