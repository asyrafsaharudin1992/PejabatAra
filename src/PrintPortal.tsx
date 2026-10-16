import { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Landscape printing for the voucher and the incentive sheets. Chrome honours
// `@page { size: A4 landscape }`, but Safari ignores it and always prints portrait, so in
// Safari each page is printed on portrait paper with its content turned 90°: the sheet still
// reads landscape when the paper is turned. Content goes in <PrintPage>s, one per sheet.
const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

export function PrintPortal({ margin = 10, children }: { margin?: number; children: ReactNode }) {
  const size = { '--page-w': `${297 - margin * 2}mm`, '--page-h': `${210 - margin * 2}mm` } as CSSProperties;
  return createPortal(<div className={`cv-print${isSafari ? ' cv-rotate' : ''}`} style={size}>
    <style>{`@page{size:A4 ${isSafari ? 'portrait' : 'landscape'};margin:${margin}mm}`}</style>
    {children}
  </div>, document.body);
}

export function PrintPage({ children }: { key?: string | number; children: ReactNode }) {
  return <section className="cv-page"><div className="cv-turn">{children}</div></section>;
}
