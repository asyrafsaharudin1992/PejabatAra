import { ReactNode, useLayoutEffect, useRef, useState } from 'react';

// Fit the physical paper width into the dialog without changing the sheet's layout.
export function ReportPreviewFrame({ portrait = false, children }: { portrait?: boolean; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, height: 1 });
  useLayoutEffect(() => {
    const fit = () => {
      if (!frame.current || !content.current) return;
      const scale = Math.min(1, frame.current.clientWidth / content.current.offsetWidth);
      setLayout({ scale, height: content.current.offsetHeight * scale });
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (frame.current) observer.observe(frame.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [portrait]);
  return <div ref={frame} className="relative mb-4 w-full overflow-hidden" style={{ height: layout.height }}>
    <div ref={content} className="absolute left-0 top-0 origin-top-left" style={{ width: portrait ? '210mm' : '297mm', transform: `scale(${layout.scale})` }}>{children}</div>
  </div>;
}
