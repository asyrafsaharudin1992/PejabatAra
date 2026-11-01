import { useEffect, useState } from 'react';
import { Check, ExternalLink, FileText } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';

// Announcements inside Individual Sign In: each clinic assistant and Clinical Admin sees the announcements here, opens
// the memo each one refers to, then records that they have read it. The Clinical Assistants office only shows who has.
type Item = { id: string; title: string; audience: string; body: string; lines: { text: string; url: string }[]; date: string; important: boolean; readAt: string | null; memos: { title: string; url: string }[] };
type Data = { listed: boolean; items: Item[] };

export default function MyAnnouncements({ onChange }: { onChange: (unread: number) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const show = (result: Data) => { setData(result); onChange(result.items.filter((item) => !item.readAt).length); };
  useEffect(() => { assessmentFetch('action=announcements').then(show).catch((cause: Error) => setError(cause.message)); }, []);
  const record = async (item: Item) => {
    setSaving(item.id); setError('');
    try { show(await assessmentFetch('action=announcement_read', { method: 'POST', body: JSON.stringify({ announcementId: item.id }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save. Please try again.'); }
    setSaving('');
  };
  if (!data) return error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : <p className="text-sm text-slate-500">Loading…</p>;
  if (!data.items.length) return <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">No announcements yet.</p>;
  const unread = data.listed ? data.items.filter((item) => !item.readAt).length : 0;
  const audienceOf = (value: string) => /^semua staf$/i.test(value.trim()) ? 'All staff' : value;
  return <div className="space-y-4">
    {data.listed && <p className={`text-sm font-semibold ${unread ? 'text-rose-600' : 'text-emerald-600'}`}>{unread ? `${unread} announcement${unread > 1 ? 's' : ''} waiting for you` : '✓ You have recorded all announcements'}</p>}
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {data.items.map((item) => <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)] ${item.readAt || !data.listed ? 'border-transparent' : 'border-rose-300'}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#0b587b]">This announcement is for: {audienceOf(item.audience)}</p>
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-[#14233b]">{item.title}</h2>{item.important && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-600">Important</span>}</div>
      <p className="mt-1 text-xs text-slate-400">{item.date}</p>
      <div className="mt-3 text-sm leading-6 text-slate-700">{item.lines.map((line, index) => line.url ? <a key={index} href={line.url} target="_blank" rel="noopener noreferrer" className="my-0.5 flex items-start gap-1.5 font-semibold text-[#0b587b] underline decoration-[#0b587b]/40 underline-offset-2 hover:text-[#08435e]"><ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">{line.text.replace(/^\s*[-*•]\s*/, '')}</span></a> : <p key={index} className="min-h-[1.5em] whitespace-pre-line">{line.text}</p>)}</div>
      {item.memos.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Related memo</p>
        {item.memos.map((memo) => memo.url
          ? <a key={memo.title} href={memo.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-[#e9f6fb] px-3 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-[#d8eff8]"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{memo.title}</span><ExternalLink className="h-4 w-4 shrink-0" /></a>
          : <p key={memo.title} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600"><FileText className="h-4 w-4 shrink-0" />{memo.title}</p>)}</div>}
      {data.listed && <div className="mt-4 border-t border-slate-100 pt-4">
        {item.readAt
          ? <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><Check className="h-4 w-4" />Recorded as read on {new Date(item.readAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}</p>
          : <button type="button" onClick={() => void record(item)} disabled={saving === item.id} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"><Check className="h-4 w-4" />{saving === item.id ? 'Saving…' : 'Please record that you have read this'}</button>}
      </div>}
    </article>)}
  </div>;
}
