import { ChangeEvent, useEffect, useState } from 'react';
import { MessageCircle, Trash2, X } from 'lucide-react';
import { ModalShell } from './ReferenceHub';
import { cn } from './lib/utils';
import { ServiceCatalogItem, useServiceCatalog } from './lib/useServiceCatalog';

const base = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/service-posters` : '/services';
const posterUrl = (path: string) => `${base}/${path}`;
const paths = ['4.png', '9.png', '10.png', '17.png', '18.png', '19.png', '20.png', '24.png', '27.png', '31.png', '33.png', '34.png', '35.png', '39.png', '40.png', '41.png', '42.png', '43.png', '44.png', '45.png', '46.png', '47.png', '48.png', '49.png', '50.png', '51.png'];
const fallback: ServiceCatalogItem[] = paths.map((storage_path, index) => ({ id: `fallback-${storage_path}`, folder_id: null, storage_path, title: `Service guide ${String(index + 1).padStart(2, '0')}`, summary: 'Open the official poster for current service information.', tags: '' }));
type FilePayload = { name: string; type: string; base64: string };

function readPoster(event: ChangeEvent<HTMLInputElement>, setFile: (file: FilePayload | null) => void) {
  const source = event.target.files?.[0];
  if (!source) return;
  const reader = new FileReader();
  reader.onload = () => setFile({ name: source.name, type: source.type, base64: String(reader.result).split(',')[1] || '' });
  reader.readAsDataURL(source);
}

export function ManagedServices({ catalog, canEdit }: { catalog: ReturnType<typeof useServiceCatalog>; canEdit: boolean }) {
  const [folder, setFolder] = useState('');
  const [selected, setSelected] = useState<ServiceCatalogItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<FilePayload | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [extraPoster, setExtraPoster] = useState<FilePayload | null>(null);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const services = catalog.services.length ? catalog.services : fallback;
  const visible = services.filter((service) => !folder || service.folder_id === folder);
  const selectedFaqs = catalog.faqs.filter((faq) => faq.service_id === selected?.id);

  const openService = (service: ServiceCatalogItem) => { setSelected(service); setTitle(service.title); setSummary(service.summary || ''); setTags(service.tags || ''); setQuestion(''); setAnswer(''); };
  const addFolder = async () => { const name = window.prompt('Folder name'); if (name?.trim()) await catalog.mutate({ action: 'create_folder', name: name.trim() }); };
  const saveNew = async () => { if (!file || !title.trim()) return; if (await catalog.mutate({ action: 'create_service', title: title.trim(), summary: summary.trim(), tags: tags.trim(), folderId: folder || null, file })) { setAdding(false); setTitle(''); setSummary(''); setTags(''); setFile(null); } };
  const saveDetails = async () => { if (!selected || !title.trim()) return; if (await catalog.mutate({ action: 'update_service', id: selected.id, title: title.trim(), summary: summary.trim(), tags: tags.trim(), folderId: selected.folder_id })) setSelected({ ...selected, title: title.trim(), summary: summary.trim(), tags: tags.trim() }); };
  const sendFaq = async () => { if (!selected || !question.trim() || !answer.trim()) return; if (await catalog.mutate({ action: 'create_faq', serviceId: selected.id, folderId: selected.folder_id, question: question.trim(), answer: answer.trim() })) { setQuestion(''); setAnswer(''); } };
  const addPoster = async () => { if (!selected || !extraPoster) return; if (await catalog.mutate({ action: 'create_service', title: selected.title, summary: selected.summary, tags: selected.tags || '', folderId: selected.folder_id, file: extraPoster })) setExtraPoster(null); };
  useEffect(() => {
    if (!selected) { setShareFile(null); return; }
    let cancelled = false;
    setShareFile(null);
    void fetch(posterUrl(selected.storage_path)).then(async (response) => {
      const blob = await response.blob();
      const extension = blob.type.split('/')[1] || 'png';
      const name = `${selected.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'service-poster'}.${extension}`;
      if (!cancelled) setShareFile(new File([blob], name, { type: blob.type || 'image/png' }));
    }).catch(() => { if (!cancelled) setShareFile(null); });
    return () => { cancelled = true; };
  }, [selected]);
  const sharePoster = async () => {
    if (!selected || !shareFile || !navigator.share || !navigator.canShare?.({ files: [shareFile] })) return;
    await navigator.share({ title: selected.title, text: `Information about ${selected.title}`, files: [shareFile] });
  };

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Clinic Assistants · Reference</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Our services</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Open a service to view official posters, notes and a FAQ specific to that service.</p></section>
    <section className="rounded-2xl border border-[#dce4ed] bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-2"><button onClick={() => setFolder('')} className={cn('rounded-lg px-3 py-2 text-xs font-medium', !folder ? 'bg-[#0b587b] text-white' : 'bg-slate-100 text-slate-600')}>All services</button>{catalog.folders.map((item) => <button key={item.id} onClick={() => setFolder(item.id)} className={cn('rounded-lg px-3 py-2 text-xs font-medium', folder === item.id ? 'bg-[#0b587b] text-white' : 'bg-slate-100 text-slate-600')}>{item.name}</button>)}</div>{canEdit && <div className="flex gap-2"><button onClick={() => void addFolder()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#0b587b]">Add folder</button><button onClick={() => setAdding(true)} className="rounded-lg bg-[#0b587b] px-3 py-2 text-xs font-medium text-white">Add service</button></div>}</div></section>
    {catalog.error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{catalog.error}</p>}
    {adding && <section className="rounded-2xl border border-[#8cdbf7] bg-[#edf9fe] p-5"><h3 className="font-semibold text-[#0b3d59]">Add service</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Service name" className="rounded-xl bg-white px-3 py-2 text-sm outline-none" /><select value={folder} onChange={(event) => setFolder(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm"><option value="">No folder</option>{catalog.folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Service details for staff" className="min-h-24 rounded-xl bg-white px-3 py-2 text-sm sm:col-span-2" /><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Hashtags, e.g. #vaccine #screening" className="rounded-xl bg-white px-3 py-2 text-sm sm:col-span-2" /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readPoster(event, setFile)} className="text-xs sm:col-span-2" /></div><div className="mt-4 flex gap-2"><button onClick={() => void saveNew()} disabled={!file || !title.trim()} className="rounded-lg bg-[#0b587b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save service</button><button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-slate-500">Cancel</button></div></section>}
    <section><div className="mb-4"><h3 className="text-xl font-semibold">Service guides</h3><p className="mt-1 text-sm text-slate-500">{catalog.loading ? 'Loading…' : `${visible.length} services`}</p></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visible.map((service) => <button key={service.id} onClick={() => openService(service)} className="group overflow-hidden rounded-[20px] border border-[#dce4ed] bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#8cdbf7]"><div className="aspect-[0.707] bg-slate-100"><img src={posterUrl(service.storage_path)} alt={service.title} loading="lazy" className="h-full w-full object-cover" /></div><p className="truncate px-3 pt-2.5 text-xs font-medium text-[#29465a]">{service.title}</p>{service.tags && <p className="truncate px-3 pb-2.5 text-[11px] text-[#0b9aca]">{service.tags}</p>}</button>)}</div></section>
    {selected && <ModalShell onClose={() => setSelected(null)} wide><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Service details</p><h2 className="mt-2 text-2xl font-semibold">{selected.title}</h2></div><button onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><img src={posterUrl(selected.storage_path)} alt={selected.title} className="max-h-[58vh] w-full rounded-xl border border-slate-200 object-contain" /><div className="space-y-4"><button onClick={() => void sharePoster()} disabled={!shareFile || !navigator.canShare?.({ files: shareFile ? [shareFile] : [] })} className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><MessageCircle className="h-4 w-4" />{shareFile ? 'Share poster image on WhatsApp' : 'Preparing poster image…'}</button>{canEdit ? <div className="space-y-2 rounded-xl bg-[#edf9fe] p-3"><p className="text-xs font-semibold text-[#29465a]">Edit service information</p><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Service name" className="w-full rounded-lg bg-white px-3 py-2 text-xs" /><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Information for staff" className="min-h-20 w-full rounded-lg bg-white px-3 py-2 text-xs" /><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="#hashtag #another" className="w-full rounded-lg bg-white px-3 py-2 text-xs" /><button onClick={() => void saveDetails()} className="rounded-lg bg-[#0b587b] px-3 py-2 text-xs font-medium text-white">Save details</button></div> : <><p className="text-sm leading-6 text-slate-600">{selected.summary || 'Check the official poster for current service information.'}</p>{selected.tags && <p className="text-xs text-[#0b9aca]">{selected.tags}</p>}</>}<div><h3 className="text-sm font-semibold">FAQ for this service</h3><div className="mt-2 space-y-2">{selectedFaqs.map((faq) => <details key={faq.id} className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-medium">{faq.question}</summary><p className="mt-2 text-xs leading-5 text-slate-600">{faq.answer}</p>{canEdit && <button onClick={() => void catalog.mutate({ action: 'delete_faq', id: faq.id })} className="mt-2 text-xs text-rose-600">Remove</button>}</details>)}{selectedFaqs.length === 0 && <p className="text-xs text-slate-400">No FAQ added for this service yet.</p>}</div>{canEdit && <div className="mt-3 space-y-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="FAQ question" className="w-full rounded-lg bg-slate-100 px-3 py-2 text-xs" /><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Answer for staff" className="min-h-20 w-full rounded-lg bg-slate-100 px-3 py-2 text-xs" /><button onClick={() => void sendFaq()} className="rounded-lg bg-[#0b587b] px-3 py-2 text-xs font-medium text-white">Add FAQ</button></div>}</div></div></div>{canEdit && <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><select value={selected.folder_id || ''} onChange={(event) => { const folderId = event.target.value || null; setSelected({ ...selected, folder_id: folderId }); void catalog.mutate({ action: 'update_service', id: selected.id, title: selected.title, summary: selected.summary, tags: selected.tags || '', folderId }); }} className="rounded-lg bg-slate-100 px-3 py-2 text-sm"><option value="">No folder</option>{catalog.folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#0b587b]">Add another poster<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readPoster(event, setExtraPoster)} className="hidden" /></label><button onClick={() => void addPoster()} disabled={!extraPoster} className="rounded-lg bg-[#edf9fe] px-3 py-2 text-xs font-medium text-[#0b587b] disabled:opacity-50">Save poster</button><button onClick={() => { if (window.confirm(`Remove ${selected.title}?`)) void catalog.mutate({ action: 'delete_service', id: selected.id }); setSelected(null); }} className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-rose-600"><Trash2 className="h-3.5 w-3.5" />Remove service</button></div>}</ModalShell>}
  </div>;
}
