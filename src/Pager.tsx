import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Long lists (change history and the like) show 10 rows at a time. `paged` gives the rows for the current page; <Pager> is the
// "Showing 1–10 of 34" line with previous and next. The list goes back to page 1 when it changes (a different person, a new entry).
export const PAGE_SIZE = 10;
export function usePaged<T>(items: T[], size = PAGE_SIZE, resetKey: unknown = items.length) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  useEffect(() => { setPage(0); }, [resetKey]);
  const safe = Math.min(page, pages - 1);
  return { rows: items.slice(safe * size, safe * size + size), page: safe, pages, total: items.length, size, setPage };
}

export function Pager({ page, pages, total, size = PAGE_SIZE, onPage }: { page: number; pages: number; total: number; size?: number; onPage: (page: number) => void }) {
  if (total <= size) return null;
  const from = page * size + 1, to = Math.min(total, page * size + size);
  const button = 'grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
  return <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
    <span>Showing {from}–{to} of {total}</span>
    <span className="inline-flex items-center gap-2">
      <button type="button" className={button} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      <span className="min-w-[72px] text-center font-semibold text-slate-600">Page {page + 1} of {pages}</span>
      <button type="button" className={button} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
    </span>
  </nav>;
}
