import { useState } from 'react';
import { Check, PenLine } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { keyOf, type Answers, type Field, type PdfForm } from './model';

// The same form as a clean list for a phone: one card for each question, with large buttons. The answers are the ones drawn on the original pages, so the
// finished PDF looks like the paper form.
type Block = { kind: 'about' | 'ticks' | 'one'; fields: Field[] };
const card = 'rounded-2xl bg-white p-4 shadow-sm';
const input = 'w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';

// My questions in reading order: the profile details together at the top, tick boxes that follow each other together, every other question on its own.
export function blocksOf(form: PdfForm, who: string): Block[] {
  const mine = [...form.fields].filter((field) => field.who === who && field.source !== 'today').sort((a, b) => a.page - b.page || (Math.abs(a.y - b.y) < 0.008 ? a.x - b.x : a.y - b.y));
  const about = mine.filter((field) => field.source && field.type === 'text');
  const blocks: Block[] = about.length ? [{ kind: 'about', fields: about }] : [];
  const seen = new Set<string>();
  for (const field of mine) {
    if (about.includes(field)) continue;
    const key = keyOf(field); if (seen.has(key)) continue; seen.add(key);
    if (field.type === 'check') { const last = blocks[blocks.length - 1]; if (last?.kind === 'ticks' && last.fields[0].page === field.page && field.y - last.fields[last.fields.length - 1].y < 0.05) last.fields.push(field); else blocks.push({ kind: 'ticks', fields: [field] }); }
    else blocks.push({ kind: 'one', fields: field.type === 'choice' ? mine.filter((item) => keyOf(item) === key).sort((a, b) => a.x - b.x || a.y - b.y) : [field] });
  }
  return blocks;
}

export function FormSimple({ form, who, answers, onChange }: { form: PdfForm; who: string; answers: Answers; onChange: (answers: Answers) => void }) {
  const [signing, setSigning] = useState<Field | null>(null);
  const set = (key: string, value: string) => onChange({ ...answers, [key]: value });
  const star = (field: Field) => field.required && !String(answers[keyOf(field)] || '').trim() ? <span className="ml-1 text-rose-600" title="Must be answered">*</span> : null;
  return <div className="space-y-3">
    {blocksOf(form, who).map((block) => {
      const first = block.fields[0], key = keyOf(first), value = answers[key] || '';
      if (block.kind === 'about') return <section key="about" className={`${card} space-y-3`}>
        <h3 className="text-sm font-bold text-[#0b587b]">Your details</h3>
        <div className="grid gap-3 sm:grid-cols-2">{block.fields.map((field) => <label key={field.id} className="block text-xs font-semibold text-slate-500">{field.label}{star(field)}<input value={answers[field.id] || ''} maxLength={150} onChange={(event) => set(field.id, event.target.value)} className={`${input} mt-1 h-11`} /></label>)}</div>
      </section>;
      if (block.kind === 'ticks') return <section key={first.id} className={`${card} space-y-1.5`}>{block.fields.map((field) => { const on = answers[field.id] === 'yes'; return <button key={field.id} type="button" role="checkbox" aria-checked={on} onClick={() => set(field.id, on ? '' : 'yes')} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-[#0b587b] bg-sky-50' : 'border-slate-200'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-[#0b587b] bg-[#0b587b] text-white' : 'border-slate-300'}`}>{on && <Check className="h-4 w-4" />}</span>{field.label}</button>; })}</section>;
      if (first.type === 'choice') {
        const numbers = block.fields.every((field) => /^\d{1,2}$/.test(field.value || '')), meanings = block.fields.filter((field) => field.hint), chosen = block.fields.find((field) => field.value === value);
        return <section key={key} className={`${card} space-y-2.5`}>
          <p className="text-sm font-semibold leading-6">{first.label}{star(first)}</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(block.fields.length, numbers ? 7 : 3)}, minmax(0, 1fr))` }}>{block.fields.map((field) => <button key={field.id} type="button" aria-pressed={value === field.value} title={field.hint} onClick={() => set(key, field.value || '')} className={`h-12 rounded-xl border text-base font-semibold ${value === field.value ? 'border-[#0b587b] bg-[#0b587b] text-white' : 'border-slate-200 text-slate-700'}`}>{field.value}</button>)}</div>
          {chosen?.hint && <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-[#0b587b]">{chosen.value} = {chosen.hint}</p>}
          {meanings.length > 0 && <details className="text-xs text-slate-500"><summary className="cursor-pointer font-semibold">What the numbers mean</summary><ul className="mt-1 space-y-0.5">{meanings.map((field) => <li key={field.id}><b>{field.value}</b> = {field.hint}</li>)}</ul></details>}
        </section>;
      }
      if (first.type === 'signature') return <section key={key} className={`${card} space-y-2`}>
        <p className="text-sm font-semibold">{first.label}{star(first)}</p>
        <button type="button" onClick={() => setSigning(first)} className={`grid min-h-24 w-full place-items-center rounded-xl border-2 border-dashed ${value ? 'border-slate-200 bg-white' : 'border-amber-400 bg-amber-50'}`}>{value ? <img src={value} alt="Your signature" className="max-h-24" /> : <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800"><PenLine className="h-5 w-5" />Sign here</span>}</button>
        {value && <p className="text-xs text-slate-400">Tap the signature to sign again.</p>}
      </section>;
      return <label key={key} className={`${card} block text-sm font-semibold leading-6`}>{first.label}{star(first)}
        {first.type === 'paragraph' ? <textarea rows={4} maxLength={1000} value={value} onChange={(event) => set(key, event.target.value)} placeholder="Type your answer" className={`${input} mt-2 py-2 font-normal`} /> : <input maxLength={150} value={value} onChange={(event) => set(key, event.target.value)} placeholder="Type your answer" className={`${input} mt-2 h-12 font-normal`} />}
      </label>;
    })}
    {signing && <SignaturePad title={signing.label} onClose={() => setSigning(null)} onDone={(picture) => { set(keyOf(signing), picture); setSigning(null); }} />}
  </div>;
}
