import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { KnowledgeView, ResourceModal } from './ReferenceHub';
import { knowledgeResources, type KnowledgeResource } from './portalData';
import { officeFetch } from './lib/officeApi';
import { isHrReference } from './lib/hrReferences';

// `all`: the whole Reference Hub (the COO's view), not only the HR documents. Always read only.
export default function HRMemoGuide({ all = false }: { all?: boolean } = {}) {
  const [resources, setResources] = useState<KnowledgeResource[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<KnowledgeResource | null>(null);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await officeFetch(all ? '/api/references' : '/api/references?department=hr');
      const result = await response.json();
      const saved = result.payload?.resources;
      setResources(all ? (Array.isArray(saved) ? saved : knowledgeResources) : (Array.isArray(saved) ? saved : knowledgeResources).filter(isHrReference));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load HR memos.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return <div className="text-compact mx-auto max-w-[1500px] space-y-3 sm:space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{all ? 'The CA Reference Hub, memos and guides · read only' : 'Shared with the CA Reference Hub · HR documents only'}</p><button type="button" disabled={loading} onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{loading ? 'Loading…' : 'Refresh'}</button></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {resources ? <KnowledgeView hrOnly={!all} initialSearch="" readResources={[]} resources={resources} onOpen={setSelected} /> : loading ? <p role="status" className="p-4 text-sm text-slate-500">Loading HR memos…</p> : null}
    {selected && <ResourceModal resource={selected} isRead={false} onClose={() => setSelected(null)} onMarkRead={() => undefined} />}
  </div>;
}
