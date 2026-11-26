import { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { keyOf, type Answers, type Field, type PdfForm } from './model';

// One person fills their own fields on the page. The others' fields are shown but cannot be changed here.
export function FormFill({ pages, form, who, answers, onChange }: { pages: string[]; form: PdfForm; who: string; answers: Answers; onChange: (answers: Answers) => void }) {
  const [open, setOpen] = useState<Field | null>(null);
  const set = (key: string, value: string) => onChange({ ...answers, [key]: value });
  return <div className="space-y-4">
    {pages.map((picture, page) => <div key={picture} className="relative overflow-hidden rounded-xl bg-white shadow">
      <img src={picture} alt={`Page ${page + 1}`} draggable={false} className="block w-full" />
      {form.fields.filter((field) => field.page === page && field.type !== 'info').map((field) => {
        const mine = field.who === who, key = keyOf(field), value = answers[key] || '';
        const style = { left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` };
        const tone = mine ? (value || field.type === 'check' ? 'border-sky-500 bg-sky-200/20' : 'border-amber-500 bg-amber-200/40') : 'border-transparent';
        const common = { style, disabled: !mine, title: field.label, 'aria-label': `${field.label}${field.value ? ` ${field.value}` : ''}` };
        if (field.type === 'check') return <button key={field.id} type="button" {...common} onClick={() => set(key, value === 'yes' ? '' : 'yes')} className={`absolute grid place-items-center rounded border text-[2.4vw] font-bold leading-none text-[#0b2a6f] sm:text-sm ${tone}`}>{value === 'yes' ? '✓' : ''}</button>;
        if (field.type === 'choice') return <button key={field.id} type="button" {...common} onClick={() => { if (window.innerWidth < 640) setOpen(field); else set(key, field.value || ''); }} className={`absolute rounded-full border-2 ${value === field.value ? 'border-[#0b2a6f]' : mine ? 'border-dashed border-amber-400/70' : 'border-transparent'}`} />;
        return <button key={field.id} type="button" {...common} onClick={() => setOpen(field)} className={`absolute overflow-hidden rounded border text-left text-[1.9vw] leading-tight text-[#0b2a6f] sm:text-xs ${tone}`}>
          {field.type === 'signature' ? value ? <img src={value} alt="Signature" className="h-full w-full object-contain object-left-bottom" /> : mine ? <span className="px-1 text-amber-800">Sign here</span> : null : value ? <span className="block whitespace-pre-wrap px-0.5">{value}</span> : mine ? <span className="px-1 text-amber-800">Tap to write</span> : null}
        </button>;
      })}
    </div>)}
    {open?.type === 'signature' && <SignaturePad title={open.label} onClose={() => setOpen(null)} onDone={(picture) => { set(keyOf(open), picture); setOpen(null); }} />}
    {open?.type === 'choice' && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-3xl bg-white p-4 shadow-2xl">
        <h3 className="font-semibold">{open.label}</h3>
        <p className="text-xs text-slate-500">The meaning of each number is at the top of its column on the form.</p>
        <div className="grid grid-cols-4 gap-2">{form.fields.filter((field) => keyOf(field) === keyOf(open)).map((field) => <button key={field.id} type="button" onClick={() => { set(keyOf(open), field.value || ''); setOpen(null); }} className={`h-14 rounded-2xl border text-lg font-semibold ${answers[keyOf(open)] === field.value ? 'border-[#0b587b] bg-[#0b587b] text-white' : 'border-slate-200'}`}>{field.value}</button>)}</div>
        <button type="button" onClick={() => setOpen(null)} className="h-11 w-full rounded-xl text-sm font-semibold text-slate-500">Close</button>
      </div>
    </div>}
    {open && open.type !== 'signature' && open.type !== 'choice' && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg space-y-3 rounded-3xl bg-white p-4 shadow-2xl">
        <h3 className="font-semibold">{open.label}</h3>
        {open.type === 'paragraph' ? <textarea autoFocus rows={5} maxLength={1000} value={answers[open.id] || ''} onChange={(event) => set(open.id, event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-base" /> : <input autoFocus maxLength={150} value={answers[open.id] || ''} onChange={(event) => set(open.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setOpen(null); }} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-base" />}
        <button type="button" onClick={() => setOpen(null)} className="h-11 w-full rounded-xl bg-[#0b587b] text-sm font-semibold text-white">Done</button>
      </div>
    </div>}
  </div>;
}
