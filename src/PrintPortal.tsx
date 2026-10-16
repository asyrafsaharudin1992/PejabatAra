import { CSSProperties, ReactNode, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Landscape printing for the voucher and the incentive sheets. Chrome honours
// `@page { size: A4 landscape }`, but Safari ignores it and always prints portrait, so in
// Safari each page is printed on portrait paper with its content turned 90°: the sheet still
// reads landscape when the paper is turned. Content goes in <PrintPage>s, one per sheet.
const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

// The page margin is zero so browsers have no room to add their own date, title and address;
// the white border is padding inside each page instead.
export function PrintPortal({ margin = 10, children }: { margin?: number; children: ReactNode }) {
  const size = { '--pad': `${margin}mm` } as CSSProperties;
  const root = useRef<HTMLDivElement>(null);
  // Anything marked .cv-fit is shrunk to fit its page. It is measured off screen first (the
  // print copy is hidden on screen), before the print window opens.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    node.classList.add('cv-measuring');
    const mm = (node.querySelector('.cv-mm') as HTMLElement | null)?.offsetWidth || 3.78;
    const room = (209 - margin * 2 - 2) * mm;
    node.querySelectorAll<HTMLElement>('.cv-fit').forEach((fit) => {
      fit.style.zoom = '1';
      // A little to spare, as print and screen lay text out very slightly differently.
      fit.style.zoom = String(Math.min(1, (room * 0.96) / fit.offsetHeight));
    });
    node.classList.remove('cv-measuring');
  }, [margin]);
  return createPortal(<div ref={root} className={`cv-print${isSafari ? ' cv-rotate' : ''}`} style={size}>
    <span className="cv-mm" aria-hidden="true" />
    <style>{`@page{size:A4 ${isSafari ? 'portrait' : 'landscape'};margin:0}`}</style>
    {children}
  </div>, document.body);
}

export function PrintPage({ children }: { key?: string | number; children: ReactNode }) {
  return <section className="cv-page"><div className="cv-turn">{children}</div></section>;
}
