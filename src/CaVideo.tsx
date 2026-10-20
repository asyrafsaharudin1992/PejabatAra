import { FormEvent, useEffect, useState } from 'react';
import { Play, Save } from 'lucide-react';
import { supabase } from './lib/supabase';
import { card, input } from './AssessmentStaff';

type Video = { fileId: string; title: string };

async function request(body?: { payload: { url: string; title: string } }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Please sign in again.');
  const response = await fetch('/api/ca-state?scope=video', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load the video.');
  return (result.payload || { fileId: '', title: '' }) as Video;
}

// A training video from Google Drive, shown inside the portal. The link is stored in Supabase and
// only sent to signed-in accounts; System Admin pastes or changes it here.
export default function CaVideo({ canEdit, title = 'Training Video' }: { canEdit: boolean; title?: string }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { request().then((next) => { setVideo(next); setName(next.title); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load the video.')); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try { const next = await request({ payload: { url: link.trim(), title: name } }); setVideo(next); setLink(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-4xl">
    <section className={card}>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Play className="h-5 w-5 text-[#0b587b]" />{video?.title || title}</h2>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {!video ? !error && <p className="mt-3 text-sm text-slate-500">Loading…</p>
        : video.fileId
          // No allow-popups, so the player cannot open the Drive page in a new tab from here.
          ? <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-slate-900"><iframe title={video.title || title} src={`https://drive.google.com/file/d/${video.fileId}/preview`} sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer" allow="fullscreen" allowFullScreen className="h-full w-full border-0" /></div>
          : <p className="mt-3 text-sm text-slate-500">No video has been added yet.</p>}
    </section>
    {canEdit && <form onSubmit={save} className={`mt-4 ${card}`}>
      <h3 className="text-sm font-semibold">Change the video (System Admin)</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Title" maxLength={120} className={input} />
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="Google Drive link (drive.google.com/file/d/…)" className={input} />
      </div>
      <button disabled={saving || (!link.trim() && name === (video?.title || ''))} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button>
      <p className="mt-2 text-xs text-slate-400">Leave the link empty to keep the current video and only change the title.</p>
    </form>}
  </div>;
}
