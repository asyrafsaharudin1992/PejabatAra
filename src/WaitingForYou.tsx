import type { ComponentType } from 'react';

// "Waiting for you" at the top of a Home page: what needs the person's decision, as a few tiles with a red number. Each tile opens the page where it is done.
export type WaitingItem = { key: string; label: string; note: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; count: number | null | undefined; onOpen?: () => void; href?: string };
export function WaitingForYou({ items, loading }: { items: WaitingItem[]; loading: boolean }) {
  const total = loading ? null : items.reduce((sum, item) => sum + (item.count || 0), 0);
  const columns = items.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  return <section aria-label="Waiting for you" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">Waiting for you</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${total ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{total === null ? 'Loading…' : total ? `${total} waiting` : 'Nothing waiting'}</span></div>
    <div className={`mt-2.5 grid grid-cols-1 gap-1.5 sm:mt-3 sm:gap-2 ${columns}`}>{items.map((item) => {
      const body = <>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500 sm:h-9 sm:w-9"><item.icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.8} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight text-[#14233b] sm:text-sm">{item.label}</span><span className="block text-[11px] leading-4 text-slate-500 sm:text-xs">{item.note}</span></span>
        <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold sm:h-7 sm:min-w-7 sm:px-2 sm:text-sm ${item.count ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{loading ? '…' : item.count ?? '—'}</span>
      </>;
      const style = 'flex items-center gap-2 rounded-xl border border-slate-100 p-2 text-left transition hover:bg-slate-50 sm:gap-3 sm:p-3';
      return item.href ? <a key={item.key} href={item.href} className={style}>{body}</a> : <button key={item.key} type="button" onClick={item.onOpen} className={style}>{body}</button>;
    })}</div>
  </section>;
}
