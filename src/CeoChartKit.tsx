import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

// The two kinds of chart on the CEO's Charts tab, in plain SVG: bars (side by side, or stacked) and lines. Both have a legend when there are
// two or more series, a number on the bars when there are few of them, a tooltip on hover, and a table to read the same figures as text.
// The two clinics keep their colour wherever they appear (KJ blue, SK orange); other series take the next colours in the same set.
export const COLOR = { KJ: '#2a78d6', SK: '#eb6834', aqua: '#1baf7a', yellow: '#eda100', violet: '#6250d6', magenta: '#e87ba4' };
export type Series = { name: string; color: string; values: (number | null)[] };
type Format = (value: number) => string;
const INK = '#14233b', MUTED = '#64748b', GRID = '#e2e8f0';
const niceMax = (value: number) => { if (value <= 0) return 4; const power = 10 ** Math.floor(Math.log10(value)); return ([1, 2, 2.5, 4, 5, 10].find((step) => step * power >= value) || 10) * power; };
export const plain: Format = (value) => String(Math.round(value * 10) / 10);
export const money: Format = (value) => `RM ${Math.round(value).toLocaleString('en-MY')}`;
const short: Format = (value) => value >= 1_000_000 ? `${Math.round(value / 100_000) / 10}M` : value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value * 10) / 10);

function Frame({ title, note, series, table, setTable, children, hasData, empty }: { title: string; note?: string; series: Series[]; table: boolean; setTable: (value: boolean) => void; children: ReactNode; hasData: boolean; empty?: string }) {
  return <section aria-label={title} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-base font-semibold tracking-tight">{title}</h3>{note && <p className="mt-0.5 text-xs leading-5 text-slate-500">{note}</p>}</div>
      {hasData && <button type="button" onClick={() => setTable(!table)} aria-pressed={table} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">{table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}{table ? 'Show chart' : 'Show as table'}</button>}</div>
    {series.length > 1 && <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">{series.map((item) => <li key={item.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />{item.name}</li>)}</ul>}
    {hasData ? children : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{empty || 'Nothing to show yet.'}</p>}
  </section>;
}

function DataTable({ categories, series, format, first }: { categories: string[]; series: Series[]; format: Format; first: string }) {
  return <div className="mt-3 overflow-x-auto"><table className="no-stack w-full min-w-[320px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">{first}</th>{series.map((item) => <th key={item.name} className="pr-4 text-right">{item.name}</th>)}</tr></thead>
    <tbody>{categories.map((category, index) => <tr key={category} className="border-t border-slate-100 tabular-nums"><td className="py-1.5 pr-4 font-semibold text-[#14233b]">{category}</td>{series.map((item) => <td key={item.name} className="pr-4 text-right">{item.values[index] === null ? '—' : format(item.values[index]!)}</td>)}</tr>)}</tbody></table></div>;
}

function Tip({ category, series, index, format }: { category: string; series: Series[]; index: number; format: Format }) {
  return <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"><p className="font-semibold">{category}</p>{series.map((item) => <p key={item.name} className="mt-0.5 flex items-center gap-1.5 tabular-nums"><span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />{item.name}: {item.values[index] === null ? '—' : format(item.values[index]!)}</p>)}</div>;
}

const W = 560, H = 230, L = 44, R = 10, T = 16, B = 32;

export function BarsChart({ title, note, categories, series, stacked = false, format = plain, empty, firstColumn = 'Month' }: { title: string; note?: string; categories: string[]; series: Series[]; stacked?: boolean; format?: Format; empty?: string; firstColumn?: string }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const hasData = series.some((item) => item.values.some((value) => value !== null && value > 0));
  const totals = categories.map((_, index) => stacked ? series.reduce((sum, item) => sum + (item.values[index] || 0), 0) : Math.max(0, ...series.map((item) => item.values[index] || 0)));
  const top = niceMax(Math.max(...totals, 0));
  const y = (value: number) => T + (top - value) / top * (H - T - B);
  const plotW = W - L - R, groupW = plotW / categories.length;
  const barW = stacked ? Math.min(30, groupW - 8) : Math.min(26, (groupW - 8) / series.length);
  const labelled = !stacked && categories.length <= 6 && series.length <= 3;
  return <Frame title={title} note={note} series={series} table={table} setTable={setTable} hasData={hasData} empty={empty}>
    {table ? <DataTable categories={categories} series={series} format={format} first={firstColumn} /> : <div className="relative mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((step) => { const value = top * step / 4; return <g key={step}><line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke={GRID} strokeWidth={step === 0 ? 1.5 : 1} /><text x={L - 6} y={y(value) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{short(value)}</text></g>; })}
        {categories.map((category, index) => {
          const center = L + groupW * index + groupW / 2;
          let running = 0;
          return <g key={category} onMouseEnter={() => setHover(index)}>
            {stacked ? series.map((item, seriesIndex) => {
              const value = item.values[index] || 0; if (!value) return null;
              const bottom = y(running), topY = y(running + value); running += value;
              const isTop = !series.slice(seriesIndex + 1).some((later) => (later.values[index] || 0) > 0);
              const heightPx = Math.max(0, bottom - topY - 2); // 2px of surface between the segments
              const x = center - barW / 2, r = isTop ? Math.min(4, heightPx) : 0;
              return <path key={item.name} d={`M${x},${bottom - 2} V${topY + r} ${r ? `a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r}` : `h${barW}`} V${bottom - 2} Z`} fill={item.color} opacity={hover !== null && hover !== index ? 0.55 : 1} />;
            }) : series.map((item, seriesIndex) => {
              const value = item.values[index]; if (value === null || value === undefined) return null;
              const x = center - (barW * series.length) / 2 + seriesIndex * barW, h = y(0) - y(value), r = Math.min(4, h / 2);
              return <g key={item.name}>
                {value > 0 && <path d={`M${x + 1},${y(0)} V${y(value) + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${y(0)} Z`} fill={item.color} opacity={hover !== null && hover !== index ? 0.55 : 1} />}
                {labelled && <text x={x + barW / 2} y={y(value) - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>{short(value)}</text>}
              </g>;
            })}
            <text x={center} y={H - 12} textAnchor="middle" fontSize="10" fill={MUTED}>{category}</text>
            <rect x={L + groupW * index} y={T} width={groupW} height={H - T - B} fill="transparent" />
          </g>;
        })}
      </svg>
      {hover !== null && <Tip category={categories[hover]} series={series} index={hover} format={format} />}
    </div>}
  </Frame>;
}

export function LinesChart({ title, note, categories, series, format = plain, empty, firstColumn = 'Month' }: { title: string; note?: string; categories: string[]; series: Series[]; format?: Format; empty?: string; firstColumn?: string }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const hasData = series.some((item) => item.values.some((value) => value !== null));
  const top = niceMax(Math.max(0, ...series.flatMap((item) => item.values.map((value) => value ?? 0))));
  const y = (value: number) => T + (top - value) / top * (H - T - B);
  const x = (index: number) => L + (categories.length === 1 ? (W - L - R) / 2 : index * (W - L - R) / (categories.length - 1));
  return <Frame title={title} note={note} series={series} table={table} setTable={setTable} hasData={hasData} empty={empty}>
    {table ? <DataTable categories={categories} series={series} format={format} first={firstColumn} /> : <div className="relative mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((step) => { const value = top * step / 4; return <g key={step}><line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke={GRID} strokeWidth={step === 0 ? 1.5 : 1} /><text x={L - 6} y={y(value) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{short(value)}</text></g>; })}
        {categories.map((category, index) => <text key={category} x={x(index)} y={H - 12} textAnchor="middle" fontSize="10" fill={MUTED}>{category}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />}
        {series.map((item) => {
          // A gap in the figures breaks the line instead of joining across it.
          const parts: string[] = []; let open = false;
          item.values.forEach((value, index) => { if (value === null) { open = false; return; } parts.push(`${open ? 'L' : 'M'}${x(index)},${y(value)}`); open = true; });
          return <g key={item.name}><path d={parts.join(' ')} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {item.values.map((value, index) => value === null ? null : <circle key={index} cx={x(index)} cy={y(value)} r={hover === index ? 4.5 : 4} fill={item.color} stroke="#fff" strokeWidth={2} />)}</g>;
        })}
        {categories.map((category, index) => <rect key={category} x={x(index) - (W - L - R) / categories.length / 2} y={T} width={(W - L - R) / categories.length} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(index)} />)}
      </svg>
      {hover !== null && <Tip category={categories[hover]} series={series} index={hover} format={format} />}
    </div>}
  </Frame>;
}
