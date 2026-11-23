import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { RosterPdfResult } from './lib/rosterPdfRead';

// After a roster PDF is chosen: shows who each column is (the sheet only has short names), and saves nothing until the person presses Import.
type Candidate = { id: string; company: string; code: string; name: string; short: string; designation: string };
const dmy = (date: string) => date.split('-').reverse().join('/');
const select = 'h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm';

// The staff member a short name on the sheet most likely means: the one whose sign-in name or full name has it as a word. Two or more matches = ask.
function guess(name: string, people: Candidate[]): string {
  const key = name.trim().toUpperCase();
  const bySign = people.filter((p) => p.short.trim().toUpperCase() === key);
  if (bySign.length === 1) return bySign[0].id;
  const words = people.filter((p) => p.name.toUpperCase().split(/\s+/).includes(key));
  if (words.length === 1) return words[0].id;
  return '';
}

export function RosterPdfImport({ fileName, result, api, fixedCompany, source = 'pdf', onClose, onDone, onError }: {
  fileName: string; source?: 'pdf' | 'text'; result: RosterPdfResult; api: (query: string, body?: unknown) => Promise<any>; fixedCompany: string;
  onClose: () => void; onDone: (message: string) => void; onError: (message: string) => void;
}) {
  const [people, setPeople] = useState<Candidate[] | null>(null);
  const [company, setCompany] = useState(fixedCompany || result.company || 'KJ');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // The notes beside the table (Request staff, Remarks) as read from the PDF: edited here, then saved for the sheet's month and clinic.
  const [notes, setNotes] = useState(result.notes), [keepNotes, setKeepNotes] = useState(Boolean(result.notes.request || result.notes.remarks));
  const monthLabel = new Date(`${result.month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  useEffect(() => { api('action=roster_people').then((data) => setPeople(data.people || [])).catch((cause: Error) => { setPeople([]); onError(cause.message); }); }, []);
  const here = useMemo(() => (people || []).filter((p) => p.company === company), [people, company]);
  // Fill the guesses once the staff are known, and again if the company changes; a choice the person made is kept while the company stays.
  useEffect(() => { if (people) setChosen(Object.fromEntries(result.columns.map((column) => [column.name, guess(column.name, here)]))); }, [people, company]);
  const ready = result.columns.filter((column) => chosen[column.name]);
  const days = ready.reduce((sum, column) => sum + column.days.length, 0);
  const used = new Map<string, number>(); for (const column of ready) used.set(chosen[column.name], (used.get(chosen[column.name]) || 0) + 1);
  const twice = [...used.values()].some((count) => count > 1);
  const dates = result.columns.flatMap((column) => column.days.map((day) => day.date)).sort();

  const save = async () => {
    setSaving(true); onError('');
    try {
      const code = (id: string) => here.find((p) => p.id === id)?.code || '';
      const rows = ready.flatMap((column) => column.days.map((day) => ({ company, code: code(chosen[column.name]), date: day.date, shift: day.shift })));
      const response = await api('action=roster_import', { rows, source });
      if (response.error) throw new Error(response.error);
      let notesNote = '';
      if (keepNotes) { try { const saved = await api('action=roster_notes_save', { company, month: result.month, request: notes.request, remarks: notes.remarks }); if (saved.error) throw new Error(saved.error); notesNote = ` The notes for ${monthLabel} were saved.`; } catch (cause) { notesNote = ` The roster was imported, but the notes were not saved: ${cause instanceof Error ? cause.message : 'unknown error'}.`; } }
      onDone((response.saved ? `${source === 'text' ? 'Pasted schedule' : 'Roster PDF'} imported: ${response.added} new day${response.added === 1 ? '' : 's'}, ${response.changed} changed, ${response.same} already the same.${response.changed ? ' The changed days are in the change log below.' : ''}` : `Nothing to change: all ${response.same} days in the schedule are already in the roster.`) + notesNote);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to import the roster.'); }
    setSaving(false);
  };

  return <section aria-label="Roster PDF" className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-base font-semibold text-[#14233b]">{source === 'text' ? 'Check the pasted schedule before importing' : 'Check the roster PDF before importing'}</h3>
        <p className="text-sm text-slate-600">{fileName} · {result.columns.length} columns · {dates.length ? `${dmy(dates[0])} to ${dmy(dates[dates.length - 1])}` : ''}. Nothing is saved until you press Import.</p></div>
      <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button>
    </div>
    <label className="block text-sm font-semibold text-slate-600">Clinic
      <select value={company} disabled={Boolean(fixedCompany)} onChange={(event) => setCompany(event.target.value)} className={`${select} mt-1 max-w-[12rem]`}><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select></label>
    {people === null ? <p role="status" className="text-sm text-slate-500">Loading staff…</p> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm"><thead><tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="px-3 py-2">Name on the sheet</th><th className="px-3">Days</th><th className="px-3">This is</th></tr></thead>
        <tbody>{result.columns.map((column) => <tr key={column.name} className="border-t border-slate-100">
          <td className="px-3 py-2 font-semibold">{column.name}</td><td className="px-3 text-slate-500">{column.days.length}</td>
          <td className="px-3 py-2"><select aria-label={`Who is ${column.name}`} value={chosen[column.name] || ''} onChange={(event) => setChosen((old) => ({ ...old, [column.name]: event.target.value }))} className={select}>
            <option value="">{chosen[column.name] === undefined ? '…' : 'Not matched: skip this column'}</option>{here.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></td>
        </tr>)}</tbody></table></div>}
    {result.skipped.length > 0 && <p className="text-xs text-amber-800">{result.skipped.length} cell{result.skipped.length === 1 ? '' : 's'} were not understood and are left out: {result.skipped.slice(0, 5).map((item) => `${item.name} ${dmy(item.date)} “${item.text}”`).join(', ')}{result.skipped.length > 5 ? '…' : ''}.</p>}
    {(result.notes.request || result.notes.remarks) && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <label className="flex items-start gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={keepNotes} onChange={(event) => setKeepNotes(event.target.checked)} className="mt-1" />Also save these notes for {monthLabel} ({company}); they replace the notes saved now and are printed with the roster</label>
      {keepNotes && <><label className="block text-xs font-semibold text-slate-600">Request staff<textarea rows={Math.max(3, notes.request.split('\n').length)} value={notes.request} onChange={(event) => setNotes({ ...notes, request: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-600">Remarks<textarea rows={Math.max(2, notes.remarks.split('\n').length)} value={notes.remarks} onChange={(event) => setNotes({ ...notes, remarks: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /></label></>}
    </div>}
    {twice && <p role="alert" className="text-sm font-semibold text-rose-700">Two columns point to the same person. Change one of them.</p>}
    <p className="text-xs text-slate-500">Codes like OFF* (a request) are saved as OFF, and AM-9 (AL) as AL. AL on the roster is only a marker: it does not use up any annual leave, which still follows the leave application as usual. A blank cell (black on the sheet) saves nothing, so that person's usual working week applies. Existing days are only changed where the PDF says something different, and each change goes into the change log.</p>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Cancel</button>
      <button type="button" onClick={() => void save()} disabled={saving || !days || twice} className="min-h-11 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Importing…' : `Import ${days} day${days === 1 ? '' : 's'} for ${ready.length} staff`}</button>
    </div>
  </section>;
}
