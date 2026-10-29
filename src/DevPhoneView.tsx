import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { Columns2, Monitor, RotateCw, Smartphone } from 'lucide-react';

// Development helper (only while running `npm run dev`, never in the live build). The page opens as a split
// screen: the normal desktop view on the left and an iPhone-sized phone on the right, so both layouts can be
// checked at once. Both sides are this same app in iframes, sharing the sign-in session, and the address
// (#office/...) is kept in step, so clicking something on one side opens it on the other. Switch between
// Split, Desktop only and Phone only with the buttons at the bottom left; the choice is remembered.
type Mode = 'split' | 'desktop' | 'phone';
const MODE_KEY = 'ara_dev_view';
const PHONE = { width: 390, height: 844, border: 10 }; // iPhone 14 / 15
const readMode = (): Mode => { try { const value = localStorage.getItem(MODE_KEY); return value === 'desktop' || value === 'phone' ? value : 'split'; } catch { return 'split'; } };

function PhoneFrame({ frameRef, reload }: { frameRef: RefObject<HTMLIFrameElement | null>; reload: number }) {
  // Shrinks the whole phone when the window is shorter than a real iPhone, so it is never cut off.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 48) / (PHONE.height + PHONE.border * 2)));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const outerW = PHONE.width + PHONE.border * 2, outerH = PHONE.height + PHONE.border * 2;
  return <div style={{ width: outerW * scale, height: outerH * scale }}>
    <div style={{ width: outerW, height: outerH, transform: `scale(${scale})`, transformOrigin: 'top left', borderWidth: PHONE.border }} className="overflow-hidden rounded-[48px] border-slate-950 bg-white shadow-2xl">
      <iframe key={reload} ref={frameRef} title="Phone view" src={window.location.href} style={{ width: PHONE.width, height: PHONE.height }} className="block border-0" />
    </div>
  </div>;
}

// The desktop side is laid out at a real desktop width and scaled down to fit the space beside the phone, so it
// shows the full desktop design instead of a narrow window.
const DESKTOP_WIDTH = 1440;
function DesktopFrame({ frameRef, reload }: { frameRef: RefObject<HTMLIFrameElement | null>; reload: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: DESKTOP_WIDTH, height: 900 });
  useEffect(() => {
    const element = box.current; if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, size.width / DESKTOP_WIDTH);
  return <div ref={box} className="relative h-full min-w-0 flex-1 overflow-hidden bg-white">
    <iframe key={reload} ref={frameRef} title="Desktop view" src={window.location.href} style={{ width: DESKTOP_WIDTH, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="absolute left-0 top-0 block border-0 bg-white" />
  </div>;
}

export default function DevShell({ children }: { children: ReactNode }) {
  const inside = window.self !== window.top;
  const [mode, setMode] = useState<Mode>(readMode);
  const [reload, setReload] = useState(0);
  const left = useRef<HTMLIFrameElement>(null);
  const right = useRef<HTMLIFrameElement>(null);
  const choose = (next: Mode) => { setMode(next); try { localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ } };

  // Inside a preview frame: tell the page around us whenever the address changes.
  useEffect(() => {
    if (!inside) return;
    const send = () => window.parent.postMessage({ type: 'dev-hash', hash: window.location.hash }, '*');
    window.addEventListener('hashchange', send);
    return () => window.removeEventListener('hashchange', send);
  }, [inside]);

  // The page around the frames: pass an address change from one side to the other.
  useEffect(() => {
    if (inside || mode === 'desktop') return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'dev-hash') return;
      const from = event.source === left.current?.contentWindow ? left.current : event.source === right.current?.contentWindow ? right.current : null;
      const other = from === left.current ? right.current : left.current;
      if (from && other?.contentWindow && other.contentWindow.location.hash !== event.data.hash) other.contentWindow.location.hash = event.data.hash;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inside, mode]);

  if (inside) return <>{children}</>;
  return <>
    {mode === 'desktop' && children}
    {mode !== 'desktop' && <div className="fixed inset-0 z-[190] flex bg-slate-300">
      {mode === 'split' && <DesktopFrame frameRef={left} reload={reload} />}
      <div className={`flex shrink-0 items-start justify-center bg-slate-800 px-6 pt-6 ${mode === 'phone' ? 'flex-1' : ''}`}>
        <PhoneFrame frameRef={right} reload={reload} />
      </div>
    </div>}
    <div className="fixed bottom-4 left-4 z-[200] inline-flex overflow-hidden rounded-full bg-slate-900 text-xs font-semibold text-white shadow-lg ring-1 ring-white/20">
      {([['split', Columns2, 'Split'], ['desktop', Monitor, 'Desktop'], ['phone', Smartphone, 'Phone']] as const).map(([id, Icon, label]) => <button key={id} onClick={() => choose(id)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 ${mode === id ? 'bg-[#0b587b]' : 'hover:bg-white/10'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      {mode !== 'desktop' && <button onClick={() => setReload((value) => value + 1)} aria-label="Reload both views" className="inline-flex items-center border-l border-white/20 px-3 hover:bg-white/10"><RotateCw className="h-3.5 w-3.5" /></button>}
    </div>
  </>;
}
