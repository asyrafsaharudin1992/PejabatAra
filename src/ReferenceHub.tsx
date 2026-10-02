import { ReactNode, useState } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, FileText, RefreshCw, Search, X } from "lucide-react";
import { KnowledgeResource, knowledgeResources } from "./portalData";
import { cn } from "./lib/utils";

// Reference Hub shared by every office that lists the official memos.
const categoryLabelMap: Record<string, string> = {
  "Semua": "All",
  "Kewangan": "Finance",
  "Sumber Manusia": "Human Resources",
  "Operasi": "Operations",
  "Kualiti": "Quality",
  "Operasi Klinik": "Clinic Operations",
  "SOP Klinik": "Clinic SOPs",
  "Pematuhan": "Compliance",
  "Sistem & IT": "Systems & IT",
  "Khidmat Pesakit": "Patient Service",
  "Farmasi": "Pharmacy",
  "Training": "Training",
  "Doktor Locum": "Locum Doctors",
  "Panel & Claim": "Panels & Claims",
  "TeamARA": "TeamARA",
};

const departmentValues = ["Kewangan", "Sumber Manusia", "Operasi", "Kualiti"];

function normalizeDepartmentValue(value: string) {
  if (departmentValues.includes(value)) return value;
  if (["Pematuhan", "Training"].includes(value)) return "Kualiti";
  return "Operasi";
}

function categoryLabel(category: string) {
  return categoryLabelMap[category] || category;
}

function statusLabel(status?: KnowledgeResource["status"]) {
  return status === "TERBATAL" ? "Not active" : "Active";
}

function resourceTypeLabel(type: KnowledgeResource["type"]) {
  if (type === "SOP") return "SOP";
  if (type === "Polisi" || type === "Memo") return "Memo";
  return "Guideline";
}

export function KnowledgeView({ initialSearch, readResources, onOpen, resources = knowledgeResources, canEdit = false, onUpdateResource, onCommit, onSyncDrive, syncing = false }: { initialSearch: string; readResources: string[]; onOpen: (resource: KnowledgeResource) => void; resources?: KnowledgeResource[]; canEdit?: boolean; onUpdateResource?: (resource: KnowledgeResource) => void; onCommit?: () => void; onSyncDrive?: () => void; syncing?: boolean }) {
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState("Semua");
  // Keep the hub filter aligned with the four official departments. Legacy
  // labels are normalised into these departments in the table and filter.
  const categories = ["Semua", ...departmentValues];
  const filtered = resources.filter((item) => {
    const haystack = `${item.title} ${item.summary} ${item.category} ${item.keywords.join(" ")}`.toLowerCase();
    const itemDepartments = item.category.split(" / ").map((part) => normalizeDepartmentValue(part.trim()));
    return (category === "Semua" || itemDepartments.includes(category)) && haystack.includes(search.toLowerCase());
  }).sort((a, b) => {
    const toTime = (value: string) => { const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime() : 0; };
    return toTime(b.updatedAt) - toTime(a.updatedAt);
  });

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Reference hub</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Find answers quickly</h2><p className="mt-2 text-[#b9cfdd]">SOPs, policies, work guides and FAQs organised by topic.</p></div><div className="flex w-full max-w-xl items-center gap-3 rounded-[16px] bg-white px-4 py-3 text-[#14233b]"><Search className="h-5 w-5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try: leave, patient complaint, Plato..." className="w-full bg-transparent outline-none" /></div></div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition", category === item ? "bg-white text-[#0b3d59]" : "bg-white/10 text-[#c4d7e3] hover:bg-white/15")}>{categoryLabel(item)}</button>)}</div>
      </div>
      <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dbe8f0] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.05)]">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e8f7fd] text-[#0b587b]"><FileText className="h-6 w-6" /></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Official memos</p><h3 className="mt-1 text-lg font-semibold tracking-tight text-[#14233b]">AraSihat operational documents</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Original memos, policies and SOPs are stored in Drive. Use this hub to search references and open the full version when needed.</p></div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2"><div className="inline-flex items-center gap-2 rounded-xl bg-[#e8f7fd] px-4 py-3 text-sm font-bold text-[#0b587b]"><CheckCircle2 className="h-4 w-4" />{resources.length} memos connected</div>{canEdit && onSyncDrive && <button type="button" onClick={onSyncDrive} disabled={syncing} className="inline-flex items-center gap-2 rounded-xl border border-[#dbe8f0] bg-white px-4 py-3 text-sm font-bold text-[#0b587b] transition hover:bg-[#f3f9fc] disabled:opacity-60"><RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />{syncing ? "Syncing…" : "Sync with Drive"}</button>}</div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-[#fbfdff] px-5 py-4 sm:px-6"><span className="rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Memos & policies</span><span className="rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Clinical operations SOPs</span><span className="rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Staff training</span><span className="rounded-full bg-[#fff7d8] px-3 py-1.5 text-xs font-semibold text-[#876700]">Official Drive version</span></div>
      </div>
      <div className="mt-6 flex items-center justify-between"><p className="text-sm font-bold text-slate-500">{filtered.length} memos found</p><p className="text-xs text-slate-400">Official AraSihat source</p></div>
      <div className="mt-4 overflow-visible rounded-[24px] border border-[#dce4ed] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.06)]">
        <div className="hidden grid-cols-[96px_145px_minmax(0,1fr)_82px_94px_104px] gap-3 border-b border-slate-200 bg-[#f7fafc] px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 lg:grid lg:items-center xl:grid-cols-[110px_165px_minmax(0,1fr)_90px_105px_112px] xl:px-6"><span className="whitespace-nowrap">Date</span><span className="whitespace-nowrap">Department</span><span className="whitespace-nowrap">Memo title</span><span className="whitespace-nowrap">Type</span><span className="whitespace-nowrap">Status</span><span /></div>
        <div className="divide-y divide-slate-100">
          {filtered.map((resource) => <ResourceTableRow key={resource.id} resource={resource} canEdit={canEdit} onOpen={onOpen} onUpdate={onUpdateResource} onCommit={onCommit} />)}
        </div>
      </div>
      {filtered.length === 0 && <EmptyState icon={<Search />} title="No results found" text="Try another keyword or category." />}
    </div>
  );
}

function ResourceTableRow({ resource, canEdit, onOpen, onUpdate, onCommit }: { key?: string; resource: KnowledgeResource; canEdit: boolean; onOpen: (resource: KnowledgeResource) => void; onUpdate?: (resource: KnowledgeResource) => void; onCommit?: () => void }) {
  const update = (patch: Partial<KnowledgeResource>) => onUpdate?.({ ...resource, ...patch });
  const departments = departmentValues;
  const selectedDepartments = Array.from(new Set(resource.category.split(" / ").map((part) => normalizeDepartmentValue(part.trim())).filter(Boolean)));
  const [departmentMenuOpen, setDepartmentMenuOpen] = useState(false);
  const toggleDepartment = (department: string) => {
    const next = selectedDepartments.includes(department)
      ? selectedDepartments.filter((item) => item !== department)
      : [...selectedDepartments, department];
    update({ category: next.join(" / ") || "Operasi" });
  };
  return <div className="group grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#f8fcfe] lg:grid-cols-[96px_145px_minmax(0,1fr)_82px_94px_104px] lg:items-center lg:gap-3 lg:px-5 xl:grid-cols-[110px_165px_minmax(0,1fr)_90px_105px_112px] xl:px-6">
    <div className="min-w-0 text-xs font-semibold text-slate-400">{canEdit ? <input value={resource.updatedAt === "Belum diekstrak" ? "" : resource.updatedAt} onChange={(event) => update({ updatedAt: event.target.value || "Belum diekstrak" })} onBlur={onCommit} placeholder="dd/mm/yyyy" className="w-full min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 outline-none transition hover:bg-slate-100 focus:bg-white" /> : (resource.updatedAt === "Belum diekstrak" ? "Date not extracted" : resource.updatedAt)}</div>
    <div className="relative min-w-0">{canEdit ? <div><button type="button" onClick={() => setDepartmentMenuOpen((open) => !open)} className="flex w-full min-w-0 items-center justify-between rounded-xl bg-slate-50/70 px-2 py-2 text-left text-xs font-semibold text-[#0b587b] outline-none transition hover:bg-slate-100"><span className="min-w-0 break-words">{selectedDepartments.length ? selectedDepartments.map(categoryLabel).join(", ") : "Select department"}</span><ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 transition", departmentMenuOpen && "rotate-180")} /></button>{departmentMenuOpen && <div className="absolute left-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{departments.map((department) => <label key={department} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f3f9fc]"><input type="checkbox" checked={selectedDepartments.includes(department)} onChange={() => toggleDepartment(department)} className="h-4 w-4 accent-[#0b587b]" />{categoryLabel(department)}</label>)}<button type="button" onClick={() => setDepartmentMenuOpen(false)} className="mt-1 w-full px-2 pt-2 text-left text-xs font-bold text-[#0b587b]">Done</button></div>}</div> : <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#0b587b]">{selectedDepartments.map((department) => <span key={department}>{categoryLabel(department)}</span>)}</div>}</div>
    <div className="min-w-0">{canEdit ? <textarea rows={2} value={resource.title} onChange={(event) => update({ title: event.target.value })} onBlur={onCommit} className="w-full min-w-0 resize-none rounded-xl bg-slate-50/70 px-2 py-2 text-[15px] font-semibold leading-5 tracking-tight text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /> : <button onClick={() => onOpen(resource)} className="flex w-full min-w-0 items-start justify-between text-left"><p className="min-w-0 whitespace-normal break-words text-[15px] font-semibold leading-5 tracking-tight text-[#14233b] group-hover:text-[#0b587b]">{resource.title}</p><ExternalLink className="ml-2 mt-0.5 h-4 w-4 shrink-0 text-[#0b587b]" /></button>}</div>
    <div className="min-w-0">{canEdit ? <select value={resourceTypeLabel(resource.type)} onChange={(event) => update({ type: event.target.value as KnowledgeResource["type"] })} className="w-full min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 text-xs font-semibold text-[#0b587b] outline-none transition hover:bg-slate-100 focus:bg-white"><option value="Memo">Memo</option><option value="SOP">SOP</option><option value="Guideline">Guideline</option></select> : <span className="text-xs font-semibold text-[#526a80]">{resourceTypeLabel(resource.type)}</span>}</div>
    <div className="min-w-0">{canEdit ? <select value={resource.status || "AKTIF"} onChange={(event) => update({ status: event.target.value as KnowledgeResource["status"] })} className={cn("w-full min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 text-xs font-semibold outline-none transition hover:bg-slate-100 focus:bg-white", resource.status === "TERBATAL" ? "text-rose-700" : "text-emerald-700")}><option value="AKTIF">Active</option><option value="TERBATAL">Not active</option></select> : <span className={cn("text-xs font-semibold", resource.status === "TERBATAL" ? "text-rose-700" : "text-emerald-700")}>{statusLabel(resource.status)}</span>}</div>
    <div className="min-w-0 text-sm font-bold text-[#0b587b]">{canEdit ? <div className="flex min-w-0 flex-col items-start gap-1"><button type="button" onClick={() => onOpen(resource)} className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-lg px-1 py-1 text-xs font-semibold text-[#0b587b] transition hover:bg-[#e8f7fd]">Open memo <ExternalLink className="h-3.5 w-3.5 shrink-0" /></button><span className="text-[11px] font-semibold text-slate-400">Auto-save</span></div> : <span className="lg:hidden">Open memo</span>}</div>
  </div>;
}

export function ResourceModal({ resource, isRead, onClose, onMarkRead }: { resource: KnowledgeResource; isRead: boolean; onClose: () => void; onMarkRead: () => void }) {
  return <ModalShell onClose={onClose} wide><div className="flex items-start justify-between gap-4"><div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-700">{resource.type}</span><h2 className="mt-4 text-3xl font-semibold tracking-tight">{resource.title}</h2><p className="mt-3 text-slate-500">{resource.summary}</p></div><button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6 flex flex-wrap gap-3 border-y border-slate-100 py-4 text-sm text-slate-500"><span>{resource.category}</span><span>•</span><span>{resource.readTime} min read</span><span>•</span><span>Updated {resource.updatedAt === "Belum diekstrak" ? "Date not extracted" : resource.updatedAt}</span></div>{resource.sourceUrl ? <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe title={resource.title} src={resource.sourceUrl} className="h-[62vh] min-h-[480px] w-full" /></div> : <div className="mt-6 space-y-4">{resource.content.map((paragraph, index) => <p key={index} className="text-base leading-8 text-slate-700">{paragraph}</p>)}</div>}<div className="mt-7 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800"><strong>Note:</strong> This official document is displayed from AraSihat Drive. Always refer to the latest published version.</div></ModalShell>;
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="mt-6 flex flex-col items-center rounded-[22px] border border-dashed border-slate-300 bg-white py-20 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 [&>svg]:h-6 [&>svg]:w-6">{icon}</div><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
export function ModalShell({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}><div role="dialog" aria-modal="true" className={cn("max-h-[90vh] w-full overflow-y-auto rounded-[22px] bg-white p-6 shadow-2xl sm:p-8", wide ? "max-w-3xl" : "max-w-lg")} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>; }
