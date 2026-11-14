import { useEffect, useRef, type ReactNode } from 'react';

// On a phone every table inside becomes a stack of small cards (one card for each row, the columns three to a line, each with its small heading), so nothing
// needs sideways scrolling. The headings are copied onto the cells here; the layout itself is the CSS class `stack-tables` (src/index.css), phone only.
// A table that must stay a grid (the roster, the chart tables) carries the class `no-stack`.
export function StackTables({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current; if (!root) return;
    let frame = 0;
    const label = () => root.querySelectorAll('table').forEach((table) => {
      const head = table.tHead; if (!head || !head.rows.length) return;
      const names: string[] = [];
      Array.from(head.rows[head.rows.length - 1].cells as HTMLCollectionOf<HTMLTableCellElement>).forEach((cell) => { const text = (cell.textContent || '').replace(/\s+/g, ' ').trim(); for (let step = 0; step < Math.max(1, cell.colSpan); step++) names.push(text); });
      table.querySelectorAll('tbody tr, tfoot tr').forEach((row) => { let index = 0; Array.from(row.children).forEach((cell) => { const element = cell as HTMLTableCellElement; const name = names[index] || ''; if (element.dataset.label !== name) element.dataset.label = name; index += Math.max(1, element.colSpan || 1); }); });
    });
    label();
    const watch = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(label); });
    watch.observe(root, { childList: true, subtree: true });
    return () => { watch.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div ref={ref} className={`stack-tables ${className}`}>{children}</div>;
}
