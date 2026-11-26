import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { choiceRow, newId, place, SIZE, SOURCES, TYPE_NAME, type Field, type FieldType, type PdfForm } from './model';

type Tool = FieldType | 'row' | 'move';
const TOOLS: [Tool, string][] = [['move', 'Select / move'], ['text', 'Short text'], ['paragraph', 'Long text'], ['check', 'Tick box'], ['row', 'Scale / Yes-No'], ['signature', 'Signature']];
const box = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';

// HR places the fields on the pages of the uploaded PDF.
export function FormBuilder({ pages, form, onChange }: { pages: string[]; form: PdfForm; onChange: (form: PdfForm) => void }) {
  const [tool, setTool] = useState<Tool>('text');
  const [who, setWho] = useState('staff');
  const [selected, setSelected] = useState('');
  const [labels, setLabels] = useState('1,2,3,4,5,6,9');
  const [question, setQuestion] = useState('');
  const [first, setFirst] = useState<{ page: number; x: number; y: number } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; resize: boolean } | null>(null);
  const field = form.fields.find((item) => item.id === selected);
  const set = (fields: Field[]) => onChange({ ...form, fields });
  const update = (patch: Partial<Field>) => field && set(form.fields.map((item) => item.id === field.id || (field.group && item.group === field.group && ('label' in patch || 'who' in patch || 'required' in patch)) ? { ...item, ...patch } : item));
  const at = (event: ReactPointerEvent, element: Element) => { const area = element.getBoundingClientRect(); return { x: (event.clientX - area.left) / area.width, y: (event.clientY - area.top) / area.height }; };
  const press = (event: ReactPointerEvent<HTMLDivElement>, page: number) => {
    const point = at(event, event.currentTarget);
    if (tool === 'move') { setSelected(''); return; }
    if (tool === 'row') {
      if (!first || first.page !== page) { setFirst({ page, ...point }); return; }
      const names = labels.split(',').map((item) => item.trim()).filter(Boolean);
      if (!names.length) return;
      const row = choiceRow(first, point, names, who, question.trim() || `Question ${new Set(form.fields.filter((item) => item.group).map((item) => item.group)).size + 1}`);
      set([...form.fields, ...row]); setFirst(null); setQuestion(''); setSelected(row[0].id); return;
    }
    const [w, h] = SIZE[tool];
    const added = place({ id: newId(), type: tool, page, x: 0, y: 0, w, h, who, label: TYPE_NAME[tool], required: tool !== 'check' }, point.x - (tool === 'check' ? w / 2 : 0), point.y - h / 2);
    set([...form.fields, added]); setSelected(added.id);
  };
  const grab = (event: ReactPointerEvent, item: Field, resize: boolean) => {
    event.stopPropagation(); setSelected(item.id);
    const page = event.currentTarget.closest('[data-page]')!; const point = at(event, page);
    drag.current = { id: item.id, dx: point.x - item.x, dy: point.y - item.y, resize };
    (page as HTMLElement).setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current; if (!held) return;
    const point = at(event, event.currentTarget);
    set(form.fields.map((item) => item.id !== held.id ? item : held.resize ? { ...item, w: Math.min(1 - item.x, Math.max(0.012, point.x - item.x)), h: Math.min(1 - item.y, Math.max(0.009, point.y - item.y)) } : place(item, point.x - held.dx, point.y - held.dy)));
  };
  const nudge = (dx: number, dy: number) => field && update(place(field, field.x + dx, field.y + dy));
  const duplicate = () => { if (!field) return; const group = field.group ? newId() : undefined; const copies = (field.group ? form.fields.filter((item) => item.group === field.group) : [field]).map((item) => place({ ...item, id: newId(), group }, item.x, item.y + Math.max(item.h * 1.6, 0.025))); set([...form.fields, ...copies]); setSelected(copies[0].id); };
  const remove = () => { if (!field) return; set(form.fields.filter((item) => field.group ? item.group !== field.group : item.id !== field.id)); setSelected(''); };
  return <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
    <div className="space-y-4">
      {pages.map((picture, page) => <div key={picture} data-page onPointerDown={(event) => press(event, page)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} className={`relative select-none overflow-hidden rounded-xl bg-white shadow ${tool === 'move' ? '' : 'cursor-crosshair'}`}>
        <img src={picture} alt={`Page ${page + 1}`} draggable={false} className="block w-full" />
        {form.fields.filter((item) => item.page === page).map((item) => { const on = item.id === selected || Boolean(field?.group && item.group === field.group); return <div key={item.id} onPointerDown={(event) => grab(event, item, false)} title={`${item.label} · ${form.roles.find((role) => role.id === item.who)?.label || item.who}`}
          style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.w * 100}%`, height: `${item.h * 100}%` }} className={`absolute cursor-move touch-none border-2 text-[9px] leading-none ${item.type === 'choice' ? 'rounded-full' : 'rounded'} ${on ? 'z-10 border-amber-500 bg-amber-300/40' : item.who === 'staff' ? 'border-sky-500 bg-sky-300/25' : 'border-violet-500 bg-violet-300/25'}`}>
          {item.type !== 'choice' && item.type !== 'check' && <span className="block truncate px-0.5 text-slate-700">{item.label}</span>}
          {item.id === selected && <span onPointerDown={(event) => grab(event, item, true)} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border border-white bg-amber-500" />}
        </div>; })}
        {first?.page === page && <span style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" />}
      </div>)}
    </div>
    <aside className="space-y-3 self-start rounded-2xl bg-white p-4 shadow lg:sticky lg:top-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">1. What to add</p>
      <div className="grid grid-cols-2 gap-1.5">{TOOLS.map(([id, label]) => <button key={id} type="button" onClick={() => { setTool(id); setFirst(null); }} className={`h-10 rounded-xl border text-xs font-semibold ${tool === id ? 'border-[#0b587b] bg-[#0b587b] text-white' : 'border-slate-200 text-slate-700'}`}>{label}</button>)}</div>
      <label className="block text-xs font-semibold text-slate-500">Filled by<select value={who} onChange={(event) => setWho(event.target.value)} className={`${box} mt-1`}>{form.roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
      <button type="button" onClick={() => { const label = window.prompt('Who else fills this form? For example: Pengarah'); if (label?.trim()) { const id = newId(); onChange({ ...form, roles: [...form.roles, { id, label: label.trim().slice(0, 40) }] }); setWho(id); } }} className="text-xs font-semibold text-[#0b587b]">+ Add a person (Doctor, Director…)</button>
      {tool === 'row' ? <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <label className="block font-semibold">Choices, with commas<input value={labels} onChange={(event) => setLabels(event.target.value)} className={`${box} mt-1`} placeholder="1,2,3,4,5,9 or YA,TIDAK" /></label>
        <label className="block font-semibold">Question (optional)<input value={question} onChange={(event) => setQuestion(event.target.value)} className={`${box} mt-1`} /></label>
        <p><b>{first ? '2. Now tap the LAST choice on the page.' : '1. Tap the FIRST choice on the page.'}</b> The ones in between are spread evenly.</p>
      </div> : <p className="text-xs text-slate-500">{tool === 'move' ? 'Drag a box to move it. Drag its dot to resize.' : 'Tap on the page where it goes.'}</p>}
      {field && <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected: {TYPE_NAME[field.type]}</p>
        <label className="block text-xs font-semibold text-slate-500">Question or name<input value={field.label} onChange={(event) => update({ label: event.target.value })} className={`${box} mt-1`} /></label>
        <label className="block text-xs font-semibold text-slate-500">Filled by<select value={field.who} onChange={(event) => update({ who: event.target.value })} className={`${box} mt-1`}>{form.roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
        {field.type === 'text' && <label className="block text-xs font-semibold text-slate-500">Fill by itself from the profile<select value={field.source || ''} onChange={(event) => update({ source: event.target.value, label: SOURCES.find(([id]) => id === event.target.value)?.[1] || field.label })} className={`${box} mt-1`}>{SOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        {field.type !== 'check' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={(event) => update({ required: event.target.checked })} />Must be answered</label>}
        <div className="flex gap-1.5">{([['←', -0.003, 0], ['→', 0.003, 0], ['↑', 0, -0.002], ['↓', 0, 0.002]] as const).map(([label, dx, dy]) => <button key={label} type="button" onClick={() => nudge(dx, dy)} className="h-9 flex-1 rounded-lg border border-slate-200 text-sm">{label}</button>)}</div>
        <div className="flex gap-2"><button type="button" onClick={duplicate} className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-[#0b587b]">Copy below</button><button type="button" onClick={remove} className="h-10 flex-1 rounded-xl border border-rose-200 text-sm font-semibold text-rose-700">Delete</button></div>
      </div>}
      <p className="text-xs text-slate-400">{form.fields.length} fields · blue = staff, purple = others</p>
    </aside>
  </div>;
}
