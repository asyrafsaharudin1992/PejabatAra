import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Sign with a finger or a mouse. The signature is kept as a picture with a see-through background.
export function SignaturePad({ title, onDone, onClose }: { title: string; onDone: (picture: string) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [used, setUsed] = useState(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => { const box = event.currentTarget.getBoundingClientRect(); return [(event.clientX - box.left) * (event.currentTarget.width / box.width), (event.clientY - box.top) * (event.currentTarget.height / box.height)] as const; };
  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); const context = event.currentTarget.getContext('2d')!; context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#0b2a6f'; context.beginPath(); context.moveTo(...point(event)); drawing.current = true; };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const context = event.currentTarget.getContext('2d')!; context.lineTo(...point(event)); context.stroke(); setUsed(true); };
  const clear = () => { canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height); setUsed(false); };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4">
    <div className="w-full max-w-lg space-y-3 rounded-3xl bg-white p-4 shadow-2xl">
      <h3 className="font-semibold">{title || 'Signature'}</h3>
      <canvas ref={canvas} width={800} height={300} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} className="w-full touch-none rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50" aria-label="Sign here" />
      <div className="flex gap-2"><button type="button" disabled={!used} onClick={() => onDone(canvas.current!.toDataURL('image/png'))} className="h-11 flex-1 rounded-xl bg-[#0b587b] text-sm font-semibold text-white disabled:opacity-50">Use this signature</button><button type="button" onClick={clear} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">Clear</button><button type="button" onClick={onClose} className="h-11 rounded-xl px-3 text-sm font-semibold text-slate-500">Cancel</button></div>
    </div>
  </div>;
}
