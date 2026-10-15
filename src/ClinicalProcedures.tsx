import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "./lib/utils";
import { Procedure, ProcedurePhoto, procedurePhotoUrl, useProcedures } from "./lib/useProcedures";
import { shrinkPoster, sizeLabel } from "./ManagedServices";

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const number = (index: number) => String(index + 1).padStart(2, "0");
const blank = (): Procedure => ({ id: `procedure-${Date.now().toString(36)}`, title: "", items: [], steps: [], notes: [], photo: "" });
const heading = "text-xs font-bold uppercase tracking-[.16em] text-[#0b9aca]";

// Clinic assistant guide: one procedure per page, opened from the list.
// `state` comes from PortalApp so Home search and this tab share one fetch.
export default function ClinicalProcedures({ canEdit, state, startId = "" }: { key?: string; canEdit: boolean; state: ReturnType<typeof useProcedures>; startId?: string }) {
  const { guide, loading, error, save } = state;
  const [openId, setOpenId] = useState(startId);
  const [adding, setAdding] = useState<Procedure | null>(null);
  const [query, setQuery] = useState("");
  const procedures = guide?.procedures || [];
  const index = procedures.findIndex((item) => item.id === openId);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [openId, adding]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => procedures.filter((item) => {
    const text = [item.title, ...item.items, ...item.steps, ...item.notes].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  }), [procedures, words.join(" ")]);

  const store = (list: Procedure[], photo: ProcedurePhoto | null, procedureId: string) => save({ title: guide?.title || "", procedures: list }, photo ? { file: photo, procedureId } : undefined);
  const update = (next: Procedure, photo: ProcedurePhoto | null) => store(procedures.map((item) => item.id === next.id ? next : item), photo, next.id);
  const remove = async (procedure: Procedure) => {
    if (!window.confirm(`Delete "${procedure.title}"? Its photo will also be removed.`)) return;
    if (await store(procedures.filter((item) => item.id !== procedure.id), null, "")) setOpenId("");
  };

  if (adding) return <div className="mx-auto max-w-[1100px] space-y-5">
    <button onClick={() => setAdding(null)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All procedures</button>
    <section className="rounded-[28px] bg-[#0b3d59] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">Procedure sheet {number(procedures.length)}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">New procedure</h2></section>
    {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <ProcedureEditor procedure={adding} isNew onCancel={() => setAdding(null)} onSave={async (next, photo) => { if (await store([...procedures, next], photo, next.id)) { setAdding(null); setOpenId(next.id); } }} />
  </div>;

  if (index >= 0) return <ProcedurePage procedure={procedures[index]} index={index} total={procedures.length} canEdit={canEdit} error={error} onSave={update} onDelete={() => void remove(procedures[index])} onBack={() => setOpenId("")} onGo={(step) => setOpenId(procedures[index + step]?.id || "")} />;

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#70d8fa]">Clinic Assistant Guide</p><h2 className="mt-3 text-3xl font-semibold">Clinical procedures</h2><p className="mt-3 text-[#b9cfdd]">What to prepare for each clinical procedure. Tap a procedure to open its page.</p></section>
    <section className="flex items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"><Search size={16} className="shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")} placeholder="Search procedures or items, e.g. lignocaine, urine…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400" />{query && <button type="button" onClick={() => setQuery("")} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Clear search"><X size={15} /></button>}{canEdit && guide && <button onClick={() => setAdding(blank())} className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0a4b69]"><Plus className="h-4 w-4" />Add procedure</button>}</section>
    {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="flex items-center gap-3 rounded-2xl bg-white p-6 text-sm font-semibold text-[#0b587b]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b9e8f8] border-t-[#0b587b]" aria-hidden="true" />Loading procedures…</p>
      : !procedures.length ? !error && <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">No procedures have been added yet.</p>
      : !shown.length ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">No procedures match “{query.trim()}”.</p>
      : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map((item) => {
        const position = procedures.indexOf(item);
        return <button key={item.id} onClick={() => setOpenId(item.id)} className="group flex items-start gap-4 rounded-2xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf9fe] text-sm font-bold text-[#0b587b]">{number(position)}</span>
          <span className="min-w-0 flex-1"><span className="block font-semibold leading-snug text-[#14233b]">{item.title.replace(/^Prosedur\s+/i, "")}</span><span className="mt-1 block text-xs text-slate-500">{item.items.length ? `${item.items.length} items` : "See photo"}{item.steps.length ? ` · ${item.steps.length} steps` : ""}</span></span>
          <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0b587b]" />
        </button>;
      })}</div>}
  </div>;
}

function ProcedurePage({ procedure, index, total, canEdit, error, onSave, onDelete, onBack, onGo }: { procedure: Procedure; index: number; total: number; canEdit: boolean; error: string; onSave: (next: Procedure, photo: ProcedurePhoto | null) => Promise<boolean>; onDelete: () => void; onBack: () => void; onGo: (step: number) => void }) {
  const [ready, setReady] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { setReady([]); setEditing(false); setZoom(false); }, [procedure.id]);
  const photo = procedurePhotoUrl(procedure.photo);
  const toggle = (item: string) => setReady((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);

  return <div className="mx-auto max-w-[1100px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All procedures</button>{canEdit && !editing && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><Pencil className="h-3.5 w-3.5" />Edit</button>}</div>
    <section className="rounded-[28px] bg-[#0b3d59] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">Procedure sheet {number(index)} / {String(total).padStart(2, "0")}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{procedure.title}</h2></section>
    {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {editing ? <ProcedureEditor procedure={procedure} onDelete={onDelete} onCancel={() => setEditing(false)} onSave={async (next, file) => { if (await onSave(next, file)) setEditing(false); }} /> : <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-baseline justify-between gap-3"><h3 className={heading}>Equipment / items</h3>{procedure.items.length > 0 && <span className="text-xs text-slate-400">{ready.length} / {procedure.items.length} ready</span>}</div>
          {procedure.items.length ? <ol className="mt-3 space-y-1.5">{procedure.items.map((item, itemIndex) => { const done = ready.includes(item); return <li key={itemIndex}><button type="button" onClick={() => toggle(item)} aria-pressed={done} className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition", done ? "bg-emerald-50 text-emerald-800" : "bg-[#f5fafc] text-[#14233b] hover:bg-[#edf9fe]")}><span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold", done ? "bg-emerald-600 text-white" : "bg-[#0b587b] text-white")}>{done ? "✓" : itemIndex + 1}</span><span className={cn("pt-0.5", done && "line-through decoration-emerald-400")}>{item}</span></button></li>; })}</ol>
            : <p className="mt-3 rounded-xl bg-[#f5fafc] p-3 text-sm text-slate-500">Refer to the reference photo for the items to prepare.</p>}
          {procedure.items.length > 0 && <p className="mt-3 text-[11px] text-slate-400">Tap an item to tick it off while you prepare. Ticks are not saved.</p>}
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm"><h3 className={heading}>Reference photo</h3>{photo ? <button type="button" onClick={() => setZoom(true)} className="mt-3 block w-full overflow-hidden rounded-xl bg-slate-50" aria-label="Enlarge photo"><img src={photo} alt={`Items for ${procedure.title}`} loading="lazy" decoding="async" className="mx-auto max-h-[460px] w-auto object-contain" /></button> : <p className="mt-3 text-sm text-slate-400">No photo yet.</p>}</section>
      </div>
      {procedure.steps.length > 0 && <section className="rounded-2xl bg-white p-5 shadow-sm"><h3 className={heading}>Preparation steps</h3><ol className="mt-3 space-y-2">{procedure.steps.map((step, stepIndex) => <li key={stepIndex} className="flex gap-3 text-sm leading-6"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#edf9fe] text-[11px] font-bold text-[#0b587b]">{stepIndex + 1}</span><span>{step}</span></li>)}</ol></section>}
      {procedure.notes.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="text-xs font-bold uppercase tracking-[.16em] text-amber-700">Important notes</h3><ul className="mt-3 space-y-1.5">{procedure.notes.map((note, noteIndex) => <li key={noteIndex} className="flex gap-2.5 text-sm leading-6 text-amber-950"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{note}</li>)}</ul></section>}
    </>}
    <nav className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5"><button onClick={() => onGo(-1)} disabled={index === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe] disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><span className="text-xs text-slate-400">{index + 1} of {total}</span><button onClick={() => onGo(1)} disabled={index === total - 1} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe] disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></nav>
    {zoom && photo && <button type="button" onClick={() => setZoom(false)} className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/85 p-4" aria-label="Close photo"><img src={photo} alt={`Items for ${procedure.title}`} className="max-h-full max-w-full rounded-xl object-contain" /><span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"><X className="h-5 w-5" /></span></button>}
  </div>;
}

function ProcedureEditor({ procedure, isNew = false, onSave, onCancel, onDelete }: { procedure: Procedure; isNew?: boolean; onSave: (next: Procedure, photo: ProcedurePhoto | null) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(procedure.title);
  const [items, setItems] = useState(procedure.items.join("\n"));
  const [steps, setSteps] = useState(procedure.steps.join("\n"));
  const [notes, setNotes] = useState(procedure.notes.join("\n"));
  const [photo, setPhoto] = useState<(ProcedurePhoto & { size: number; originalSize: number }) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const field = "mt-1 w-full rounded-xl bg-slate-50 p-3 text-sm font-normal outline-none focus:bg-white focus:ring-2 focus:ring-[#8cdbf7]";
  const preview = photo ? `data:${photo.type};base64,${photo.base64}` : procedurePhotoUrl(procedure.photo);

  // Photos are shrunk in the browser first (longest side 1100px, WebP 72%), matching the
  // original sheet photos at roughly 20–80KB each, so staff download very little.
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setPreparing(true); setProblem("");
    try { setPhoto(await shrinkPoster(file, 1100, 0.72)); } catch (cause) { setProblem(cause instanceof Error ? cause.message : "The photo could not be read."); } finally { setPreparing(false); }
  };
  const submit = async () => {
    if (!title.trim()) { setProblem("Give the procedure a title."); return; }
    setSaving(true);
    await onSave({ ...procedure, title: title.trim(), items: lines(items), steps: lines(steps), notes: lines(notes) }, photo && { name: photo.name, type: photo.type, base64: photo.base64 });
    setSaving(false);
  };

  return <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
    <label className="block text-xs font-semibold text-slate-600">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Prosedur ECG" className={field} /></label>
    <div className="grid gap-4 lg:grid-cols-3">
      <label className="block text-xs font-semibold text-slate-600">Equipment / items <span className="font-normal text-slate-400">(one per line)</span><textarea value={items} onChange={(event) => setItems(event.target.value)} rows={10} className={field} /></label>
      <label className="block text-xs font-semibold text-slate-600">Preparation steps <span className="font-normal text-slate-400">(one step per line)</span><textarea value={steps} onChange={(event) => setSteps(event.target.value)} rows={10} className={field} /></label>
      <label className="block text-xs font-semibold text-slate-600">Important notes <span className="font-normal text-slate-400">(one per line)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={10} className={field} /></label>
    </div>
    <div><p className="text-xs font-semibold text-slate-600">Reference photo</p><div className="mt-1 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3">{preview ? <img src={preview} alt="" className="h-24 w-auto rounded-lg object-contain" /> : <span className="grid h-24 w-32 place-items-center rounded-lg bg-white text-xs text-slate-400">No photo</span>}<div className="space-y-1.5"><label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]", preparing && "pointer-events-none opacity-50")}><ImagePlus className="h-4 w-4" />{preparing ? "Shrinking photo…" : preview ? "Replace photo" : "Choose photo"}<input type="file" accept="image/*" disabled={preparing} onChange={(event) => void pick(event)} className="hidden" /></label>{photo && <p className="text-[11px] text-slate-500">{photo.name} · {sizeLabel(photo.originalSize)} → {sizeLabel(photo.size)}</p>}</div></div></div>
    {problem && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{problem}</p>}
    <div className="flex flex-wrap items-center gap-2"><button onClick={() => void submit()} disabled={saving || preparing} className="rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : isNew ? "Add procedure" : "Save changes"}</button><button onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>{onDelete && <button onClick={onDelete} disabled={saving} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete procedure</button>}</div>
  </section>;
}
