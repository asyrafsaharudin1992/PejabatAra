import type { ReactNode } from 'react';

// The row of sub-tabs inside a page (Staff profiles: list, requests...; Leave: requests, enter...). One look everywhere, in HR, COO and CEO:
// on a phone the tabs share the width equally in neat rows (short names, at most five to a row); from a tablet up they are the usual pills.
export type SubTab<Id extends string> = { id: Id; label: string; short?: string; badge?: number | null };
const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };
export function SubTabs<Id extends string>({ tabs, active, onSelect, label, idPrefix, className = '', extra }: { tabs: SubTab<Id>[]; active: Id; onSelect: (id: Id) => void; label?: string; idPrefix?: string; className?: string; extra?: (tab: SubTab<Id>) => ReactNode }) {
  const columns = COLS[tabs.length <= 5 ? tabs.length : Math.ceil(tabs.length / Math.ceil(tabs.length / 5))] || 'grid-cols-5';
  return <div role="tablist" aria-label={label} className={`grid w-full ${columns} gap-0.5 rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto sm:max-w-full sm:flex-wrap sm:gap-1 ${className}`}>
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined} aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined} aria-selected={active === tab.id} onClick={() => onSelect(tab.id)}
      className={`relative flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg px-0.5 text-[11px] font-semibold transition sm:inline-flex sm:px-4 sm:text-sm ${active === tab.id ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      <span className="truncate sm:hidden">{tab.short || tab.label}</span><span className="hidden sm:inline">{tab.label}</span>
      {!!tab.badge && <span className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white sm:static sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[11px]">{tab.badge}</span>}
      {extra?.(tab)}
    </button>)}
  </div>;
}
