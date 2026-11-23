import { useEffect, useState } from 'react';
import type { RosterNotes } from './lib/rosterNotes';

// The notes printed beside a month's roster (the Request staff and Remarks boxes of the paper roster), for one clinic and month. Typed here, or read from the roster PDF.
const area = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0b587b]';
export function RosterNotesBox({ api, month, monthLabel, fixedCompany, defaultCompany, reload, onError }: {
  api: (query: string, body?: unknown) => Promise<any>; month: string; monthLabel: string; fixedCompany: string; defaultCompany: string; reload: number; onError: (message: string) => void;
}) {
  const [company, setCompany] = useState(fixedCompany || defaultCompany || 'KJ');
  const [notes, setNotes] = useState<RosterNotes | null>(null);
  const [saved, setSaved] = useState<RosterNotes>({ request: '', remarks: '' });
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const clinic = fixedCompany || company;
  useEffect(() => {
    let live = true; setNotes(null); setDone(false);
    api(`action=roster_notes&company=${clinic}&month=${month}`).then((data) => { if (!live) return; const value = { request: data.request || '', remarks: data.remarks || '' }; setNotes(value); setSaved(value); }).catch((cause: Error) => { if (live) { setNotes({ request: '', remarks: '' }); onError(cause.message); } });
    return () => { live = false; };
  }, [clinic, month, reload]);
  const dirty = notes !== null && (notes.request !== saved.request || notes.remarks !== saved.remarks);
  const save = async () => {
    if (!notes) return;
    setBusy(true); onError('');
    try { const result = await api('action=roster_notes_save', { company: clinic, month, request: notes.request, remarks: notes.remarks }); if (result.error) throw new Error(result.error); const value = { request: result.request ?? notes.request, remarks: result.remarks ?? notes.remarks }; setNotes(value); setSaved(value); setDone(true); window.setTimeout(() => setDone(false), 2500); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the notes.'); }
    setBusy(false);
  };
  return <details className="rounded-2xl border border-slate-200 bg-white p-4" open={Boolean(notes && (notes.request || notes.remarks))}>
    <summary className="cursor-pointer text-sm font-semibold text-[#14233b]">Roster notes · {monthLabel}{notes && (notes.request || notes.remarks) ? ' · has notes' : ''}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-500">Printed beside the roster (Reports and Print). Request staff is for days off staff asked for before they apply for leave; approved leave from AraOffice is added automatically, without repeating a name written here.</p>
      <label className="block text-sm font-semibold text-slate-600">Clinic
        <select value={clinic} disabled={Boolean(fixedCompany)} onChange={(event) => setCompany(event.target.value)} className="mt-1 block h-9 max-w-[12rem] rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select></label>
      {notes === null ? <p role="status" className="text-sm text-slate-500">Loading…</p> : <>
        <label className="block text-sm font-semibold text-slate-600">Request staff<textarea rows={5} value={notes.request} onChange={(event) => setNotes({ ...notes, request: event.target.value })} placeholder={'NAJWA : 1/12, 2/12, 3/12 (AL)\nAMY : 11/12, 12/12'} className={area} /></label>
        <label className="block text-sm font-semibold text-slate-600">Remarks<textarea rows={4} value={notes.remarks} onChange={(event) => setNotes({ ...notes, remarks: event.target.value })} placeholder="DYNA : MASUK PADA 16/11/2026" className={area} /></label>
        <div className="flex items-center justify-end gap-3">{done && <span role="status" className="text-sm font-semibold text-emerald-700">Saved</span>}
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="min-h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save notes'}</button></div></>}
    </div>
  </details>;
}
