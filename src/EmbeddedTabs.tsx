import type { ComponentType } from 'react';

// The menu of an office shown inside another office (for example the CEO's): a row of tabs above the page instead of a sidebar.
export type EmbeddedTab<Id extends string> = { id: Id; label: string; icon?: ComponentType<{ className?: string; strokeWidth?: number }>; badge?: number };
export function EmbeddedTabs<Id extends string>({ tabs, active, onSelect }: { tabs: EmbeddedTab<Id>[]; active: Id; onSelect: (id: Id) => void }) {
  return <div role="tablist" className="mx-auto mb-4 grid max-w-[1500px] grid-cols-3 gap-1 sm:flex sm:flex-wrap">
    {tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={active === tab.id} onClick={() => onSelect(tab.id)} className={`relative flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[11px] font-semibold shadow-sm sm:inline-flex sm:px-2.5 sm:text-[12px] ring-1 ring-slate-100 transition ${active === tab.id ? 'bg-[#0b587b] text-white' : 'bg-white text-slate-600 hover:bg-[#edf9fe] hover:text-[#0b587b]'}`}>
      {tab.icon && <tab.icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" strokeWidth={1.8} />}<span className="truncate">{tab.label}</span>{!!tab.badge && <span className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white sm:static">{tab.badge}</span>}
    </button>)}
  </div>;
}
