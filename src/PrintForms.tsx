import { ChangeEvent, useMemo, useState } from "react";
import { ExternalLink, FilePlus2, FileText, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { PrintForm, PrintFormFile, printFormUrl, printPdf, usePrintForms, Voucher } from "./lib/usePrintForms";
import { defaultVouchers, sectionsToText, textToSections, useCvNumbers, VoucherCard } from "./CashVoucher";
import { sizeLabel } from "./ManagedServices";

const blank = (group = ""): PrintForm => ({ id: `form-${Date.now().toString(36)}`, title: "", group, file: "" });

const readPdf = (file: File) => new Promise<PrintFormFile>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: "application/pdf", base64: String(reader.result).split(",")[1] || "" });
  reader.onerror = () => reject(new Error("The PDF could not be read."));
  reader.readAsDataURL(file);
});

// Forms staff print often, grouped by use. `state` comes from PortalApp so Home search
// and this tab share one fetch.
// The Clinical Admin office uses it too, with its own list and without the Cash Voucher.
export default function PrintForms({ canEdit, state, vouchersShown = true, eyebrow = "Clinic Assistant Desk" }: { canEdit: boolean; state: ReturnType<typeof usePrintForms>; vouchersShown?: boolean; eyebrow?: string }) {
  const { list, loading, error, save } = state;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ form: PrintForm; isNew: boolean } | null>(null);
  const [printing, setPrinting] = useState("");
  const [printError, setPrintError] = useState("");
  const [editingVoucher, setEditingVoucher] = useState<{ voucher: Voucher; isNew: boolean } | null>(null);
  const cvNumbers = useCvNumbers(vouchersShown);
  const forms = list?.forms || [];
  const vouchers = list?.vouchers || defaultVouchers;

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = useMemo(() => {
    const shown = forms.filter((form) => words.every((word) => `${form.title} ${form.group}`.toLowerCase().includes(word)));
    const byGroup = new Map<string, PrintForm[]>();
    shown.forEach((form) => byGroup.set(form.group || "Other", [...(byGroup.get(form.group || "Other") || []), form]));
    return [...byGroup.entries()];
  }, [forms, words.join(" ")]);
  const shownVouchers = vouchers.filter((voucher) => words.every((word) => `cash voucher cv ${voucher.label}`.toLowerCase().includes(word)));

  const edit = (next: { form: PrintForm; isNew: boolean }) => { setEditing(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const print = async (form: PrintForm) => {
    setPrinting(form.id); setPrintError("");
    try { await printPdf(printFormUrl(form.file)); } catch (cause) { setPrintError(cause instanceof Error ? cause.message : "The form could not be printed."); } finally { window.setTimeout(() => setPrinting(""), 1200); }
  };
  const store = (next: PrintForm[], file: PrintFormFile | null, formId: string) => save({ ...list, forms: next }, file ? { file, formId } : undefined);
  const storeVouchers = (next: Voucher[]) => save({ ...list, forms, vouchers: next });
  const editVoucher = (next: { voucher: Voucher; isNew: boolean }) => { setEditingVoucher(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const removeVoucher = async (voucher: Voucher) => {
    if (!window.confirm(`Delete Cash Voucher (${voucher.label})?`)) return;
    if (await storeVouchers(vouchers.filter((item) => item.id !== voucher.id))) setEditingVoucher(null);
  };
  const remove = async (form: PrintForm) => {
    if (!window.confirm(`Delete "${form.title}"? Its PDF will also be removed.`)) return;
    if (await store(forms.filter((item) => item.id !== form.id), null, "")) setEditing(null);
  };

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#70d8fa]">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold">Print forms</h2><p className="mt-3 text-[#b9cfdd]">Forms staff print often. Press Print to send a form straight to the printer.</p></section>
    <section className="flex items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"><Search size={16} className="shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")} placeholder={vouchersShown ? "Search forms, e.g. consent, TNB, x-ray…" : "Search forms…"} className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400" />{query && <button type="button" onClick={() => setQuery("")} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Clear search"><X size={15} /></button>}{canEdit && list && <button onClick={() => edit({ form: blank(), isNew: true })} className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0a4b69]"><Plus className="h-4 w-4" />Add form</button>}</section>
    {(error || printError) && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error || printError}</p>}
    {editing && <FormEditor key={editing.form.id} form={editing.form} isNew={editing.isNew} groups={[...new Set(forms.map((form) => form.group).filter(Boolean))] as string[]} onCancel={() => setEditing(null)} onDelete={editing.isNew ? undefined : () => void remove(editing.form)}
      onSave={async (next, file) => { if (await store(editing.isNew ? [...forms, next] : forms.map((item) => item.id === next.id ? next : item), file, next.id)) setEditing(null); }} />}
    {editingVoucher && <VoucherEditor key={editingVoucher.voucher.id} voucher={editingVoucher.voucher} isNew={editingVoucher.isNew} onCancel={() => setEditingVoucher(null)}
      onSave={async (next) => { if (await storeVouchers(editingVoucher.isNew ? [...vouchers, next] : vouchers.map((item) => item.id === next.id ? next : item))) setEditingVoucher(null); }} />}
    {loading ? <p className="flex items-center gap-3 rounded-2xl bg-white p-6 text-sm font-semibold text-[#0b587b]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b9e8f8] border-t-[#0b587b]" aria-hidden="true" />Loading forms…</p>
      : <>{list && vouchersShown && shownVouchers.length > 0 && <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-[#0b9aca]">Cash voucher</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shownVouchers.map((voucher) => <VoucherCard key={voucher.id} voucher={voucher} canEdit={canEdit} last={cvNumbers.last ? cvNumbers.last[voucher.id] || null : undefined} onPrinted={(cvNo, date) => cvNumbers.record(voucher.id, cvNo, date)}
          onEdit={() => editVoucher({ voucher, isNew: false })}
          onCopy={() => editVoucher({ voucher: { ...voucher, id: `voucher-${Date.now().toString(36)}`, label: "" }, isNew: true })}
          onDelete={vouchers.length > 1 ? () => void removeVoucher(voucher) : undefined} />)}</div>
      </section>}
      {!forms.length ? !error && <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">No forms have been added yet.</p>
      : !groups.length ? !(vouchersShown && shownVouchers.length) && <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">No forms match “{query.trim()}”.</p>
      : groups.map(([group, items]) => <section key={group}>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-[#0b9aca]">{group}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((form) => <article key={form.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf9fe] text-[#0b587b]"><FileText className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-snug text-[#14233b]">{form.title}</p><p className="mt-0.5 text-[11px] text-slate-500">PDF{form.size ? ` · ${sizeLabel(form.size)}` : ""}</p></div>{canEdit && <div className="-mr-2 -mt-1 flex shrink-0"><button onClick={() => edit({ form, isNew: false })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]" title="Edit form" aria-label={`Edit ${form.title}`}><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => void remove(form)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete form" aria-label={`Delete ${form.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div>}</div>
          <div className="mt-auto flex gap-2"><button onClick={() => void print(form)} disabled={!form.file || printing === form.id} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b587b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-60"><Printer className="h-3.5 w-3.5" />{printing === form.id ? "Opening…" : "Print"}</button><a href={printFormUrl(form.file)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><ExternalLink className="h-3.5 w-3.5" />Open</a></div>
        </article>)}</div>
      </section>)}</>}
  </div>;
}

function FormEditor({ form, isNew, groups, onSave, onCancel, onDelete }: { key?: string; form: PrintForm; isNew: boolean; groups: string[]; onSave: (next: PrintForm, file: PrintFormFile | null) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(form.title);
  const [group, setGroup] = useState(form.group);
  const [file, setFile] = useState<(PrintFormFile & { size: number }) | null>(null);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const field = "mt-1 w-full rounded-xl bg-slate-50 p-3 text-sm font-normal outline-none focus:bg-white focus:ring-2 focus:ring-[#8cdbf7]";

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]; event.target.value = ""; if (!chosen) return;
    setProblem("");
    if (!/\.pdf$/i.test(chosen.name)) { setProblem("Choose a PDF file."); return; }
    if (chosen.size > 3 * 1024 * 1024) { setProblem(`This PDF is ${sizeLabel(chosen.size)}. Please use one that is 3MB or smaller.`); return; }
    try { setFile({ ...(await readPdf(chosen)), size: chosen.size }); if (!title.trim()) setTitle(chosen.name.replace(/\.pdf$/i, "")); } catch (cause) { setProblem(cause instanceof Error ? cause.message : "The PDF could not be read."); }
  };
  const submit = async () => {
    if (!title.trim()) { setProblem("Give the form a title."); return; }
    if (!form.file && !file) { setProblem("Choose the PDF to upload."); return; }
    setSaving(true);
    await onSave({ ...form, title: title.trim(), group: group.trim() }, file && { name: file.name, type: file.type, base64: file.base64 });
    setSaving(false);
  };

  return <section className="space-y-4 rounded-2xl border border-[#aee7fb] bg-white p-5 shadow-sm">
    <h3 className="font-semibold text-[#14233b]">{isNew ? "Add form" : "Edit form"}</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-slate-600">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Consent Form AIA" className={field} /></label>
      <label className="block text-xs font-semibold text-slate-600">Group<input value={group} onChange={(event) => setGroup(event.target.value)} list="print-form-groups" placeholder="e.g. Consent forms" className={field} /><datalist id="print-form-groups">{groups.map((item) => <option key={item} value={item} />)}</datalist></label>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><FilePlus2 className="h-4 w-4" />{form.file || file ? "Replace PDF" : "Choose PDF"}<input type="file" accept="application/pdf,.pdf" onChange={(event) => void pick(event)} className="hidden" /></label><span className="text-[11px] text-slate-500">{file ? `${file.name} · ${sizeLabel(file.size)}` : form.file ? `Current PDF${form.size ? ` · ${sizeLabel(form.size)}` : ""}` : "PDF, 3MB or smaller"}</span></div>
    {problem && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{problem}</p>}
    <div className="flex flex-wrap items-center gap-2"><button onClick={() => void submit()} disabled={saving} className="rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : isNew ? "Add form" : "Save changes"}</button><button onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>{onDelete && <button onClick={onDelete} disabled={saving} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete form</button>}</div>
  </section>;
}

function VoucherEditor({ voucher, isNew, onSave, onCancel }: { key?: string; voucher: Voucher; isNew: boolean; onSave: (next: Voucher) => Promise<void>; onCancel: () => void }) {
  const [label, setLabel] = useState(voucher.label);
  const [company, setCompany] = useState(voucher.company.join("\n"));
  const [sections, setSections] = useState(sectionsToText(voucher.sections));
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const field = "mt-1 w-full rounded-xl bg-slate-50 p-3 text-sm font-normal outline-none focus:bg-white focus:ring-2 focus:ring-[#8cdbf7]";
  const submit = async () => {
    const lines = company.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!label.trim()) { setProblem("Give the branch a short name, e.g. SK."); return; }
    if (!lines.length) { setProblem("Add the company name and address."); return; }
    setSaving(true);
    await onSave({ ...voucher, label: label.trim().toUpperCase(), company: lines, sections: textToSections(sections) });
    setSaving(false);
  };
  return <section className="space-y-4 rounded-2xl border border-[#aee7fb] bg-white p-5 shadow-sm">
    <h3 className="font-semibold text-[#14233b]">{isNew ? "New branch cash voucher" : `Edit Cash Voucher (${voucher.label})`}</h3>
    <div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
      <label className="block text-xs font-semibold text-slate-600">Branch<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. SK" className={field} /></label>
      <label className="block text-xs font-semibold text-slate-600">Company & address <span className="font-normal text-slate-400">(first line is the company name; one line each)</span><textarea value={company} onChange={(event) => setCompany(event.target.value)} rows={4} className={field} /></label>
    </div>
    <label className="block text-xs font-semibold text-slate-600">Payment details <span className="font-normal text-slate-400">(a blank line between items; first line of each is “TITLE | first detail”)</span><textarea value={sections} onChange={(event) => setSections(event.target.value)} rows={14} className={`${field} font-mono text-xs`} /></label>
    {problem && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{problem}</p>}
    <div className="flex flex-wrap items-center gap-2"><button onClick={() => void submit()} disabled={saving} className="rounded-xl bg-[#0b587b] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : isNew ? "Add voucher" : "Save changes"}</button><button onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button></div>
  </section>;
}
