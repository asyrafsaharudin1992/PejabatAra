import { useEffect, useRef, useState, type ReactElement } from 'react';
import { officeFetch } from './lib/officeApi';
import type { ChartsSource } from './CeoCharts';
import { PhotoEditor } from './PhotoEditor';
import { downloadBlob } from './lib/downloadBlob';
import { fileFromDataUrl, SHARE_NOTICE, shareToWhatsApp } from './lib/shareFile';

// Charts > See organization chart: the company chart (Organizational Structure), drawn like the printed one. The photos come from the private
// staff-photos bucket through short-lived links made by the server; a person with no photo shows a plain circle.
const W = 1414, H = 2000, D = 126;
type Data = { texts: Record<string, string[]>; ids: Record<string, string>; assistants: { KJ: number; SK: number }; photos: Record<string, string> };
type Node = { cx: number; cy: number; code: string; initials: string; lines: string[]; at: number; key?: string };
const node = (cx: number, cy: number, code: string, initials: string, at: number, ...lines: string[]): Node => ({ cx, cy, code, initials, lines, at });
// at = the y of the first line of writing; the first lines are the job (bold), the last is the name.
const NODES: Node[] = [
  node(701, 341, 'ARA0001', 'MA', 426, 'Chief Executive Officer', 'Dr Mohamad Asyraf bin Saharudin'),
  node(258, 617, 'ARASK0002', 'HS', 697, 'Chief Procurement', 'Officer (CPO)', 'Dr Muhammad Haziq Bin', 'Shamshul'),
  node(503, 617, 'ARASK0001', 'LK', 693, 'Chief Operating', 'Officer (COO)', 'Dr Luqman Hakim Bin', 'Mohd Kamal'),
  node(841, 617, 'ARA0001', 'MA', 705, 'Chief Financial', 'Officer (CFO)', 'Dr Mohamad Asyraf bin', 'Saharudin'),
  node(1043, 617, 'ARA0002', 'AS', 705, 'Chief Human Resources', 'Officer (CHRO)', 'Dr Ahmad Syafiq bin', 'So’ib'),
  node(847, 957, 'ARA0004', 'S', 1036, 'Executive Finance', 'Officer', 'Ms Sarah'),
  node(1046, 957, 'ARASK0058', 'SY', 1038, 'Executive Human', 'Resources Officer', 'Ms Syahirah'),
  node(1247, 957, 'ARA0035', 'NA', 1042, 'Head of Quality &', 'Corporate', 'Dr Noor Atikah'),
  node(1045, 1277, 'ARASK0036', 'AI', 1367, 'Junior Human', 'Resources', 'Ms Aisyah'),
  node(192, 1057, 'ARA0001', 'MA', 1136, 'Person-In-Charge', 'Dr Asyraf'),
  node(634, 1062, 'ARASK0001', 'LK', 1141, 'Person-In-Charge', 'Dr Luqman'),
  node(124, 1277, 'ARA0041', 'IZ', 1353, 'Clinical Admin', 'Ms Izzah'),
  node(570, 1274, 'ARASK0060', 'AM', 1352, 'Clinical Admin', 'Ms Amirah'),
  node(209, 1597, 'ARA0001', 'MA', 1682, 'Resident Doctor', 'Dr Asyraf'),
  node(369, 1597, 'ARA0002', 'AS', 1682, 'Resident Doctor', 'Dr Syafiq'),
  node(537, 1597, 'ARA0044', 'HZ', 1683, 'Resident Doctor', 'Dr Hanis'),
  node(750, 1589, 'ARASK0001', 'LK', 1674, 'Resident Doctor', 'Dr Luqman'),
  node(907, 1589, 'ARASK0002', 'HS', 1673, 'Resident Doctor', 'Dr Haziq'),
  node(1065, 1581, 'ARASK0054', 'EI', 1665, 'Resident Doctor', 'Dr Ezza'),
];
const LINES: [number, number, number, number][] = [ // x1, y1, x2, y2 (one of the two pairs is equal)
  [688, 474, 688, 884], [259, 511, 1247, 511], [259, 511, 259, 549], [499, 511, 499, 549], [841, 511, 841, 549], [1043, 511, 1043, 549], [1247, 511, 1247, 890],
  [497, 800, 497, 845], [195, 845, 688, 845], [195, 845, 195, 884],
  [841, 800, 841, 890], [1046, 800, 1046, 890], [1045, 1100, 1045, 1210],
  [196, 944, 196, 983], [637, 944, 637, 981],
  [192, 1172, 192, 1196], [125, 1196, 314, 1196], [125, 1196, 125, 1213], [314, 1196, 314, 1477], [209, 1477, 537, 1477], [209, 1477, 209, 1515], [369, 1477, 369, 1515], [537, 1477, 537, 1515],
  [124, 1392, 124, 1422],
  [638, 1177, 638, 1195], [570, 1195, 749, 1195], [570, 1195, 570, 1212], [749, 1195, 749, 1515], [749, 1477, 1065, 1477], [907, 1477, 907, 1515], [1065, 1477, 1065, 1515],
  [569, 1392, 569, 1420],
];

const keyOf = (n: Node) => `${n.code}@${n.cx}`;
// The same chart drawn on a canvas, for the picture that is shared or saved and for the PDF (1414 x 2000, sharp at 1.5 times).
const DOTS = [[259, 549], [499, 549], [841, 549], [1043, 549], [195, 886], [688, 886], [841, 890], [1046, 890], [1247, 890], [196, 983], [637, 981], [125, 1213], [570, 1212], [1045, 1210], [209, 1515], [369, 1515], [537, 1515], [749, 1515], [907, 1515], [1065, 1515]];
const FONT = 'Montserrat, "Helvetica Neue", Arial, sans-serif';
async function loadPhotos(data: Data): Promise<Record<string, ImageBitmap>> {
  const out: Record<string, ImageBitmap> = {};
  await Promise.all(Object.entries(data.photos).map(async ([id, url]) => { try { out[id] = await createImageBitmap(await (await fetch(url)).blob()); } catch { /* drawn without a photo */ } }));
  return out;
}
async function drawChart(data: Data, edition: string, factor = 1.5): Promise<HTMLCanvasElement> {
  const photos = await loadPhotos(data);
  const canvas = document.createElement('canvas'); canvas.width = W * factor; canvas.height = H * factor;
  const c = canvas.getContext('2d'); if (!c) throw new Error('This browser cannot draw the chart.');
  c.scale(factor, factor); c.textBaseline = 'middle'; c.textAlign = 'center';
  c.fillStyle = '#ececec'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#e3e3e3'; for (let x = 0; x < W; x += 40) c.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 40) c.fillRect(0, y, W, 1);
  c.fillStyle = '#e6e6e6'; c.beginPath(); c.ellipse(707, 1070, 727, 735, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0e2745';
  c.font = `800 62px ${FONT}`; const bold = c.measureText('ORGANIZATIONAL').width; c.font = `400 62px ${FONT}`; const light = c.measureText(' STRUCTURE').width;
  const left = (W - bold - light) / 2; c.textAlign = 'left';
  c.font = `800 62px ${FONT}`; c.fillText('ORGANIZATIONAL', left, 131); c.font = `400 62px ${FONT}`; c.fillText(' STRUCTURE', left + bold, 131);
  c.font = `600 28px ${FONT}`; const letters = 'KLINIK ARA 24 JAM'.split(''), gap = 0.34 * 28;
  const total = letters.reduce((sum, ch) => sum + c.measureText(ch).width + gap, -gap); let x = (W - total) / 2;
  for (const ch of letters) { c.fillText(ch, x, 210); x += c.measureText(ch).width + gap; }
  c.fillStyle = '#000'; for (const [x1, y1, x2, y2] of LINES) c.fillRect(Math.min(x1, x2) - 1, Math.min(y1, y2) - 1, Math.abs(x2 - x1) + 2, Math.abs(y2 - y1) + 2);
  for (const [dx, dy] of DOTS) { c.beginPath(); c.arc(dx, dy - 2, 4, 0, Math.PI * 2); c.fill(); }
  c.textAlign = 'center';
  for (const n of NODES) {
    const lines = data.texts?.[keyOf(n)] || n.lines, id = data.ids[n.code], image = id ? photos[id] : undefined;
    c.fillStyle = '#ddd2c8'; c.beginPath(); c.arc(n.cx, n.cy, D / 2, 0, Math.PI * 2); c.fill();
    c.save(); c.strokeStyle = '#fff'; c.lineWidth = 5; c.lineCap = 'round'; c.setLineDash([0.1, 9]); c.beginPath(); c.arc(n.cx, n.cy, D / 2 - 2.5, 0, Math.PI * 2); c.stroke(); c.restore();
    const r = D / 2 - 8;
    if (image) { c.save(); c.beginPath(); c.arc(n.cx, n.cy, r, 0, Math.PI * 2); c.clip(); c.drawImage(image, n.cx - r, n.cy - r, r * 2, r * 2); c.restore(); }
    else { c.fillStyle = 'rgba(11,42,74,0.4)'; c.font = `700 34px ${FONT}`; c.fillText(n.initials, n.cx, n.cy); }
    lines.forEach((line, index) => { const head = index < lines.length - (lines.length > 2 ? 2 : 1); c.fillStyle = '#0e2745'; c.font = `${head ? 700 : 400} ${head ? 20 : 19}px ${FONT}`; c.fillText(line, n.cx, n.at - 3.5 + index * 25); });
  }
  c.fillStyle = '#0e2745'; c.font = `700 20px ${FONT}`;
  c.fillText('KAJANG', 192, 912.5); c.fillText('BRANCH', 192, 937.5); c.fillText('SERI KEMBANGAN', 628, 912.5); c.fillText('BRANCH', 628, 937.5);
  c.fillText(`${data.assistants.KJ} Clinic Assistants`, 131, 1436); c.fillText(`${data.assistants.SK} Clinic Assistants`, 576, 1434);
  c.fillStyle = '#555'; c.font = `800 28px ${FONT}`; c.textAlign = 'right'; c.fillText(`EDITION: ${edition}`, W - 34, 1966);
  return canvas;
}

function Person({ n, url, onEdit, lines }: { n: Node; url?: string; key?: number; onEdit?: () => void; lines: string[] }) {
  const ring = { left: n.cx - D / 2, top: n.cy - D / 2, width: D, height: D };
  const names = lines;
  return <>
    <div style={{ ...ring, border: '5px dotted #fff', boxSizing: 'border-box' }} onClick={onEdit} title={onEdit ? 'Edit' : undefined} className={`absolute rounded-full bg-[#ddd2c8] p-[3px] ${onEdit ? 'cursor-pointer hover:ring-4 hover:ring-sky-400' : ''}`}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover" /> : <span className="grid h-full w-full place-items-center rounded-full text-[34px] font-bold text-[#0b2a4a]/40">{n.initials}</span>}
    </div>
    <div style={{ left: n.cx - 150, top: n.at - 16, width: 300 }} className="absolute text-center text-[#0e2745]">
      {names.map((line, index) => <div key={line + index} className={`leading-[25px] ${index < names.length - (names.length > 2 ? 2 : 1) ? 'text-[20px] font-bold' : 'text-[19px]'}`}>{line}</div>)}
    </div>
  </>;
}

function Chart({ data, edition, onEdit }: { data: Data; edition: string; onEdit?: (n: Node) => void }) {
  const count = (text: string, x: number, y: number) => <div key={text} style={{ left: x - 140, top: y - 16, width: 280 }} className="absolute text-center text-[20px] font-bold text-[#0e2745]">{text}</div>;
  return <div className="relative overflow-hidden bg-[#ececec] text-[#0e2745]" style={{ width: W, height: H, backgroundImage: 'linear-gradient(#e3e3e3 1px, transparent 1px), linear-gradient(90deg, #e3e3e3 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
    <div className="absolute rounded-[50%] bg-[#e6e6e6]" style={{ left: -20, top: 335, width: 1454, height: 1470 }} />
    <div className="absolute left-0 w-full text-center text-[62px] leading-none" style={{ top: 100 }}><b className="font-extrabold">ORGANIZATIONAL</b> STRUCTURE</div>
    <div className="absolute left-0 w-full text-center text-[28px] font-semibold" style={{ top: 192, letterSpacing: '0.34em' }}>KLINIK ARA 24 JAM</div>
    {LINES.map(([x1, y1, x2, y2], index) => <div key={index} className="absolute bg-black" style={{ left: Math.min(x1, x2) - 1, top: Math.min(y1, y2) - 1, width: Math.abs(x2 - x1) + 2, height: Math.abs(y2 - y1) + 2 }} />)}
    {[[259, 549], [499, 549], [841, 549], [1043, 549], [195, 886], [688, 886], [841, 890], [1046, 890], [1247, 890], [196, 983], [637, 981], [125, 1213], [570, 1212], [1045, 1210], [209, 1515], [369, 1515], [537, 1515], [749, 1515], [907, 1515], [1065, 1515]].map(([x, y]) => <div key={`${x}-${y}`} className="absolute rounded-full bg-black" style={{ left: x - 4, top: y - 6, width: 8, height: 8 }} />)}
    {NODES.map((n, index) => <Person key={index} n={n} url={data.photos[data.ids[n.code]]} onEdit={onEdit && data.ids[n.code] ? () => onEdit(n) : undefined} lines={data.texts?.[keyOf(n)] || n.lines} />)}
    <div style={{ left: 192 - 90, top: 900, width: 180 }} className="absolute text-center text-[20px] font-bold leading-[25px]">KAJANG<br />BRANCH</div>
    <div style={{ left: 628 - 120, top: 900, width: 240 }} className="absolute text-center text-[20px] font-bold leading-[25px]">SERI KEMBANGAN<br />BRANCH</div>
    {count(`${data.assistants.KJ} Clinic Assistants`, 131, 1436)}
    {count(`${data.assistants.SK} Clinic Assistants`, 576, 1434)}
    <div className="absolute right-[34px] text-right text-[28px] font-extrabold text-[#555]" style={{ top: 1948 }}>EDITION: {edition}</div>
  </div>;
}

// The chart is shrunk to fit the window (width and height), so it never needs scrolling.
function Scaled({ children }: { children: ReactElement }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const fit = () => {
      const top = box.current?.getBoundingClientRect().top ?? 0;
      const byWidth = (box.current?.clientWidth || W) / W, byHeight = (window.innerHeight - Math.max(0, top) - 16) / H;
      setScale(Math.max(0.2, Math.min(1, byWidth, byHeight)));
    };
    fit(); const observer = new ResizeObserver(fit); if (box.current) observer.observe(box.current);
    window.addEventListener('resize', fit); window.addEventListener('scroll', fit, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit); };
  }, []);
  return <div ref={box} className="w-full"><div className="mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white" style={{ width: W * scale, height: H * scale }}><div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div></div></div>;
}

export function OrgChartPage({ onError, source = 'ceo' }: { onError: (message: string) => void; source?: ChartsSource }) {
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<Node | null>(null);
  const [again, setAgain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    officeFetch(`/api/status?resource=${source === 'hr' ? 'hr' : 'coo'}&action=org_chart`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) setData(result); }).catch((cause: Error) => { if (live) onError(cause.message); });
    return () => { live = false; };
  }, [source, again]);
  const edition = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }).toUpperCase();
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const id = edit ? data.ids[edit.code] : '';
  const NAME = `Organization chart ${edition}`;
  const run = async (job: (canvas: HTMLCanvasElement) => Promise<void>) => { setBusy(true); setNotice(''); try { await job(await drawChart(data, edition)); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to make the chart.'); } finally { setBusy(false); } };
  const png = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to make the picture.')), 'image/png'));
  const share = async () => {
    // The click must reach the share straight away, so the picture is given as a promise.
    setBusy(true); setNotice('');
    try {
      const file = drawChart(data, edition).then(async (canvas) => new File([await png(canvas)], `${NAME}.png`, { type: 'image/png' }));
      const outcome = await shareToWhatsApp(file, `Klinik ARA 24 Jam organization chart, ${edition}.`);
      setNotice(outcome === 'copied' || outcome === 'downloaded' ? SHARE_NOTICE[outcome] : outcome === 'shared' ? 'Shared.' : '');
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to share.'); } finally { setBusy(false); }
  };
  const downloadPng = () => run(async (canvas) => { downloadBlob([await png(canvas)], `${NAME}.png`, 'image/png'); setNotice('Downloaded.'); });
  const downloadPdf = () => run(async (canvas) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }), width = 210, height = width * H / W;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, (297 - height) / 2, width, height, undefined, 'FAST');
    downloadBlob([pdf.output('blob')], `${NAME}.pdf`, 'application/pdf'); setNotice('Downloaded.');
  });
  return <div className="space-y-2">
    {source === 'hr' && <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-xs text-slate-500">HR: click a photo to edit the words, or move, change or remove the photo.</p>
      <button type="button" disabled={busy} onClick={() => void share()} className="h-9 rounded-xl bg-[#0b587b] px-3 text-xs font-semibold text-white disabled:opacity-50">Share to WhatsApp</button>
      <button type="button" disabled={busy} onClick={() => void downloadPdf()} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0b587b] disabled:opacity-50">Download PDF</button>
      <button type="button" disabled={busy} onClick={() => void downloadPng()} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0b587b] disabled:opacity-50">Download picture</button>
    </div>}
    {busy && <p className="text-xs text-slate-500">Making the picture…</p>}
    {notice && <p className="text-xs font-semibold text-emerald-700">{notice}</p>}
    <Scaled><Chart data={data} edition={edition} onEdit={source === 'hr' ? setEdit : undefined} /></Scaled>
    {edit && id && <PhotoEditor employeeId={id} name={edit.lines[edit.lines.length - 1]} lines={data.texts?.[keyOf(edit)] || edit.lines} nodeKey={keyOf(edit)} hasPhoto={Boolean(data.photos[id])} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setAgain((value) => value + 1); }} onError={onError} />}
  </div>;
}
