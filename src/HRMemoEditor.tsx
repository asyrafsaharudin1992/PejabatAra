import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Minus, PenLine, Redo2, Strikethrough, Table as TableIcon, Underline, Undo2 } from 'lucide-react';
import { LETTERHEAD_HEIGHT, drawLetterhead, loadLetterheadAssets } from './lib/letterhead';
import { MEMO_PAGE, MEMO_TYPE } from './lib/memoDocPdf';
import { pdfPageImages } from './lib/pdfPages';

// The memo page: HR clicks on the A4 paper and types, like in Word. The paper carries the department letterhead, and the text uses the same sizes and margins as the PDF
// (lib/memoDocPdf.ts), so what is on screen is what prints.

// A table can be borderless (used for the KEPADA / DARIPADA rows and the signature blocks).
const MemoTable = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), borderless: { default: false, parseHTML: (element: HTMLElement) => element.getAttribute('data-borderless') === 'true', renderHTML: (attributes: Record<string, any>) => attributes.borderless ? { 'data-borderless': 'true' } : {} } };
  },
});

const signature = (label: string) => `<p>${label}</p><p></p><p></p><p></p><p>..............................................</p><p>Nama</p><p><strong>Jawatan</strong></p><p><strong>HSO Healthcare Sdn Bhd</strong></p>`;
const signatureTable = (labels: string[]) => `<table data-borderless="true"><tbody><tr>${[0, 1].map((at) => `<td>${labels[at] ? signature(labels[at]) : '<p></p>'}</td>`).join('')}</tr></tbody></table><p></p>`;
const MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const todayText = () => { const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).split('-').map(Number); return `${day} ${MONTHS[month - 1]} ${year}`; };

export const MEMO_TEMPLATES: { id: string; label: string; make: () => string }[] = [
  { id: 'letter', label: 'Surat makluman kepada pekerja', make: () => `<h3>NO.RUJ: HSOMEMO2026___/HR</h3><p></p><p><strong>PEKERJA HSO HEALTHCARE SDN BHD</strong><br>KLINIK ARA 24 JAM KAJANG<br>KLINIK ARA 24 JAM SERI KEMBANGAN</p><p style="text-align: right"><strong>${todayText()}</strong></p><p>Tuan/Puan,</p><h3><u>PER: TAJUK SURAT</u></h3><p>Dengan segala hormatnya, perkara di atas adalah dirujuk.</p><p>Pihak syarikat ingin memaklumkan bahawa ...</p><h3>1. TAJUK PERTAMA</h3><p>Tulis isi di sini.</p><p>Sekian, terima kasih.</p>${signatureTable(['Yang benar,'])}` },
  { id: 'internal', label: 'Memo dalaman (berlabel)', make: () => `<h1 style="text-align: center">MEMO</h1><hr><table data-borderless="true"><tbody>${[['KEPADA', 'SEMUA KAKITANGAN'], ['DARIPADA', 'JABATAN SUMBER MANUSIA'], ['TARIKH', todayText()], ['RUJUKAN', ''], ['TAJUK', '<strong>TAJUK MEMO</strong>']].map(([name, value]) => `<tr><td colwidth="113"><p><strong>${name}</strong></p></td><td colwidth="19"><p>:</p></td><td colwidth="500"><p>${value}</p></td></tr>`).join('')}</tbody></table><hr><p>Tuan/Puan,</p><p>Dengan segala hormatnya, perkara di atas adalah dirujuk.</p><p>...</p><p>Sekian, terima kasih.</p>${signatureTable(['Disediakan oleh,', 'Diluluskan oleh,'])}` },
  { id: 'notice', label: 'Notis ringkas', make: () => `<h1 style="text-align: center">NOTIS</h1><p style="text-align: right">${todayText()}</p><p><strong>KEPADA: SEMUA KAKITANGAN</strong></p><p>...</p><p>Sekian, terima kasih.</p>${signatureTable(['Yang benar,'])}` },
  { id: 'blank', label: 'Kertas kosong', make: () => '<p></p>' },
];

const PX = 96 / 25.4;   // screen pixels in one millimetre
const CSS = `
.memo-paper { position: relative; width: ${MEMO_PAGE.width}mm; background: #fff; box-shadow: 0 6px 24px rgba(15,23,42,0.16); }
.memo-paper .ProseMirror { position: relative; padding: ${MEMO_PAGE.firstTop}mm ${MEMO_PAGE.right}mm ${MEMO_PAGE.bottom}mm ${MEMO_PAGE.left}mm; min-height: ${MEMO_PAGE.height}mm; outline: none; color: #000; font-family: Helvetica, Arial, sans-serif; font-size: ${MEMO_TYPE.body}pt; line-height: ${MEMO_TYPE.line}; letter-spacing: normal; font-kerning: none; font-variant-ligatures: none; white-space: pre-wrap; overflow-wrap: break-word; }
.memo-paper .ProseMirror p { margin: 0 0 ${MEMO_TYPE.paragraphGap}mm; }
.memo-paper .ProseMirror h1, .memo-paper .ProseMirror h2, .memo-paper .ProseMirror h3 { margin: 1.2mm 0 0.8mm; font-weight: 700; line-height: ${MEMO_TYPE.line}; letter-spacing: normal; }
.memo-paper .ProseMirror h1 { font-size: ${MEMO_TYPE.h1}pt; }
.memo-paper .ProseMirror h2 { font-size: ${MEMO_TYPE.h2}pt; }
.memo-paper .ProseMirror h3 { font-size: ${MEMO_TYPE.h3}pt; }
.memo-paper .ProseMirror strong { font-weight: 700; }
.memo-paper .ProseMirror ul { list-style: disc outside; padding-left: 6mm; margin: 0 0 ${MEMO_TYPE.paragraphGap}mm; }
.memo-paper .ProseMirror ol { list-style: decimal outside; padding-left: 8mm; margin: 0 0 ${MEMO_TYPE.paragraphGap}mm; }
.memo-paper .ProseMirror li p { margin-bottom: ${MEMO_TYPE.listGap}mm; }
.memo-paper .ProseMirror blockquote { margin: 0; padding-left: 4mm; margin-left: 2mm; border-left: 0.6mm solid #a0a0a0; }
.memo-paper .ProseMirror hr { border: 0; border-top: 0.6mm solid #000; margin: 1.5mm 0 2.5mm; }
.memo-paper .ProseMirror .tableWrapper { margin: 0 0 2.5mm; }
.memo-paper .ProseMirror table { width: 100% !important; min-width: 0 !important; table-layout: fixed; border-collapse: collapse; margin: 0; font-size: ${MEMO_TYPE.table}pt; }
.memo-paper .ProseMirror table td, .memo-paper .ProseMirror table th { position: relative; vertical-align: top; text-align: left; border: 0.2mm solid #000; padding: ${MEMO_TYPE.tablePad}mm; font-size: ${MEMO_TYPE.table}pt; line-height: ${MEMO_TYPE.line}; }
.memo-paper .ProseMirror table th { background: #ececec; font-weight: 700; }
.memo-paper .ProseMirror table td p, .memo-paper .ProseMirror table th p { margin: 0 0 0.8mm; }
.memo-paper .ProseMirror table[data-borderless="true"] td, .memo-paper .ProseMirror table[data-borderless="true"] th { border: 1px dashed transparent; background: transparent; }
.memo-paper .ProseMirror:focus table[data-borderless="true"] td, .memo-paper .ProseMirror:focus table[data-borderless="true"] th { border-color: #d5dde5; }
.memo-paper .ProseMirror .selectedCell::after { content: ""; position: absolute; inset: 0; background: rgba(11,88,123,0.16); pointer-events: none; }
.memo-paper .ProseMirror .column-resize-handle { position: absolute; top: 0; bottom: 0; right: -2px; width: 3px; background: #38a8d8; pointer-events: none; }
.memo-paper .ProseMirror.resize-cursor { cursor: col-resize; }
`;

type Contact = { email: string; phone: string };

// The top of the paper as a picture, drawn by the same code as the PDF.
function useLetterheadPicture(contact: Contact) {
  const [url, setUrl] = useState('');
  const last = useRef('');
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const [{ jsPDF }, assets] = await Promise.all([import('jspdf'), loadLetterheadAssets()]);
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        drawLetterhead(doc, assets, contact);
        const [picture] = await pdfPageImages(doc.output('blob') as Blob, 3);
        if (!picture) return;
        if (!live) { URL.revokeObjectURL(picture); return; }
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = picture; setUrl(picture);
      })().catch(() => { /* the page is still usable without the picture */ });
    }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [contact.email, contact.phone]);
  useEffect(() => () => { if (last.current) URL.revokeObjectURL(last.current); }, []);
  return url;
}

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  // mousedown is stopped so the text on the page stays selected while a button is pressed.
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-semibold disabled:opacity-35 ${active ? 'bg-[#0b587b] text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{children}</button>;
}
const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />;

export type MemoEditorHandle = { json: () => unknown; text: () => string; empty: () => boolean; replace: (html: string) => void };

export function HRMemoEditor({ initial, contact, onChange, handle }: { initial: string; contact: Contact; onChange: (html: string) => void; handle: { current: MemoEditorHandle | null } }) {
  const letterhead = useLetterheadPicture(contact);
  const [grid, setGrid] = useState<{ rows: number; cols: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(MEMO_PAGE.height);
  const frame = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange); changed.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, code: false, codeBlock: false, heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle, Color, FontSize,
      MemoTable.configure({ resizable: true, HTMLAttributes: { class: 'no-stack' } }),
      TableRow, TableHeader, TableCell,
    ],
    content: initial,
    onUpdate: ({ editor: current }) => changed.current(current.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    handle.current = { json: () => editor.getJSON(), text: () => editor.getText(), empty: () => editor.isEmpty, replace: (html) => { editor.chain().focus('start').setContent(html, { emitUpdate: true }).run(); } };
    return () => { handle.current = null; };
  }, [editor]);

  // The paper is made smaller on a narrow screen; its height tells where the next printed pages begin.
  useEffect(() => {
    const outer = frame.current, inner = body.current; if (!outer || !inner) return;
    const observer = new ResizeObserver(() => {
      setZoom(Math.min(1, Math.max(0.35, (outer.clientWidth - 24) / (MEMO_PAGE.width * PX))));
      const editable = inner.querySelector<HTMLElement>('.ProseMirror'); if (editable) setContentHeight(editable.offsetHeight / PX);
    });
    observer.observe(outer); observer.observe(inner);
    return () => observer.disconnect();
  }, [editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => !current ? null : ({
      bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'), strike: current.isActive('strike'),
      left: current.isActive({ textAlign: 'left' }), center: current.isActive({ textAlign: 'center' }), right: current.isActive({ textAlign: 'right' }), justify: current.isActive({ textAlign: 'justify' }),
      bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'),
      level: [1, 2, 3].find((level) => current.isActive('heading', { level })) || 0,
      size: String(current.getAttributes('textStyle').fontSize || ''), color: String(current.getAttributes('textStyle').color || '#000000'),
      table: current.isActive('table'), borderless: Boolean(current.getAttributes('table').borderless),
      indent: current.can().sinkListItem('listItem'), outdent: current.can().liftListItem('listItem'),
      undo: current.can().undo(), redo: current.can().redo(),
    }),
  });
  if (!editor || !state) return <p className="text-sm text-slate-500">Loading…</p>;
  const run = () => editor.chain().focus();
  const icon = 'h-4 w-4';
  const select = 'h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-700';
  const tableButton = (label: string, action: () => void, active?: boolean) => <ToolButton label={label} active={active} onClick={action}>{label}</ToolButton>;
  // Where the printed pages break: the first page holds less because of the letterhead.
  const firstRoom = MEMO_PAGE.height - MEMO_PAGE.bottom, pageRoom = MEMO_PAGE.height - MEMO_PAGE.nextTop - MEMO_PAGE.bottom;
  const textEnd = contentHeight - MEMO_PAGE.bottom;
  const breaks: number[] = []; for (let at = firstRoom; at < textEnd - 0.5 && breaks.length < 20; at += pageRoom) breaks.push(at);
  const paperHeight = breaks.length ? breaks[breaks.length - 1] + pageRoom + MEMO_PAGE.bottom : MEMO_PAGE.height;

  return <div className="min-w-0">
    <style>{CSS}</style>
    <div className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolButton label="Undo" disabled={!state.undo} onClick={() => run().undo().run()}><Undo2 className={icon} /></ToolButton>
        <ToolButton label="Redo" disabled={!state.redo} onClick={() => run().redo().run()}><Redo2 className={icon} /></ToolButton>
        <Divider />
        <select aria-label="Text style" value={state.level} onChange={(event) => { const level = Number(event.target.value); if (level) run().setHeading({ level: level as 1 | 2 | 3 }).run(); else run().setParagraph().run(); }} className={select}><option value={0}>Normal text</option><option value={1}>Heading 1</option><option value={2}>Heading 2</option><option value={3}>Heading 3</option></select>
        <select aria-label="Text size" value={state.size} onChange={(event) => { if (event.target.value) run().setFontSize(event.target.value).run(); else run().unsetFontSize().run(); }} className={select}><option value="">Size</option>{[...new Set([state.size, '8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt'].filter(Boolean))].map((size) => <option key={size} value={size}>{size.replace('pt', '')}</option>)}</select>
        <Divider />
        <ToolButton label="Bold" active={state.bold} onClick={() => run().toggleBold().run()}><Bold className={icon} /></ToolButton>
        <ToolButton label="Italic" active={state.italic} onClick={() => run().toggleItalic().run()}><Italic className={icon} /></ToolButton>
        <ToolButton label="Underline" active={state.underline} onClick={() => run().toggleUnderline().run()}><Underline className={icon} /></ToolButton>
        <ToolButton label="Strikethrough" active={state.strike} onClick={() => run().toggleStrike().run()}><Strikethrough className={icon} /></ToolButton>
        <label title="Text colour" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100"><input type="color" aria-label="Text colour" value={/^#[0-9a-f]{6}$/i.test(state.color) ? state.color : '#000000'} onChange={(event) => run().setColor(event.target.value).run()} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" /></label>
        <Divider />
        <ToolButton label="Align left" active={state.left} onClick={() => run().setTextAlign('left').run()}><AlignLeft className={icon} /></ToolButton>
        <ToolButton label="Align centre" active={state.center} onClick={() => run().setTextAlign('center').run()}><AlignCenter className={icon} /></ToolButton>
        <ToolButton label="Align right" active={state.right} onClick={() => run().setTextAlign('right').run()}><AlignRight className={icon} /></ToolButton>
        <ToolButton label="Justify" active={state.justify} onClick={() => run().setTextAlign('justify').run()}><AlignJustify className={icon} /></ToolButton>
        <Divider />
        <ToolButton label="Bullet list" active={state.bullet} onClick={() => run().toggleBulletList().run()}><List className={icon} /></ToolButton>
        <ToolButton label="Numbered list" active={state.ordered} onClick={() => run().toggleOrderedList().run()}><ListOrdered className={icon} /></ToolButton>
        <ToolButton label="Indent (list)" disabled={!state.indent} onClick={() => run().sinkListItem('listItem').run()}><IndentIncrease className={icon} /></ToolButton>
        <ToolButton label="Outdent (list)" disabled={!state.outdent} onClick={() => run().liftListItem('listItem').run()}><IndentDecrease className={icon} /></ToolButton>
        <Divider />
        <span className="relative">
          <ToolButton label="Insert table" active={Boolean(grid)} disabled={state.table} onClick={() => setGrid(grid ? null : { rows: 0, cols: 0 })}><TableIcon className={icon} />Table</ToolButton>
          {grid && !state.table && <div className="absolute left-0 top-9 z-30 w-max rounded-xl border border-slate-200 bg-white p-2 shadow-lg" onMouseLeave={() => setGrid({ rows: 0, cols: 0 })}>
            <div className="grid grid-cols-6 gap-1">{Array.from({ length: 36 }, (_, at) => { const rows = Math.floor(at / 6) + 1, cols = (at % 6) + 1, on = rows <= grid.rows && cols <= grid.cols; return <button key={at} type="button" aria-label={`${rows} rows, ${cols} columns`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setGrid({ rows, cols })} onFocus={() => setGrid({ rows, cols })} onClick={() => { run().insertTable({ rows, cols, withHeaderRow: rows > 1 }).run(); setGrid(null); }} className={`h-5 w-5 rounded border ${on ? 'border-[#0b587b] bg-[#bfe6f6]' : 'border-slate-300 bg-white'}`} />; })}</div>
            <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-500">{grid.rows ? `${grid.rows} × ${grid.cols}` : 'Choose the size'}</p>
          </div>}
        </span>
        <ToolButton label="Line across the page" disabled={state.table} onClick={() => run().setHorizontalRule().run()}><Minus className={icon} />Line</ToolButton>
        <ToolButton label="Add a signature block" disabled={state.table} onClick={() => run().insertContent(signatureTable(['Yang benar,'])).run()}><PenLine className={icon} />Signature</ToolButton>
      </div>
      {state.table && <div className="mt-1 flex flex-wrap items-center gap-0.5 border-t border-slate-100 pt-1">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-[#0b587b]">Table</span>
        {tableButton('Row above', () => run().addRowBefore().run())}
        {tableButton('Row below', () => run().addRowAfter().run())}
        {tableButton('Delete row', () => run().deleteRow().run())}
        <Divider />
        {tableButton('Column left', () => run().addColumnBefore().run())}
        {tableButton('Column right', () => run().addColumnAfter().run())}
        {tableButton('Delete column', () => run().deleteColumn().run())}
        <Divider />
        {tableButton('Heading row', () => run().toggleHeaderRow().run())}
        {tableButton('Merge / split', () => run().mergeOrSplit().run())}
        {tableButton('No borders', () => run().updateAttributes('table', { borderless: !state.borderless }).run(), state.borderless)}
        {tableButton('Delete table', () => run().deleteTable().run())}
      </div>}
    </div>
    <div ref={frame} className="mt-3 overflow-x-auto rounded-2xl bg-slate-100 p-3">
      <div className="mx-auto w-fit" style={{ zoom }}>
        <div className="memo-paper" style={{ minHeight: `${paperHeight}mm` }}>
          <img src="/forms/ara-letterhead-pattern.png" alt="" aria-hidden className="pointer-events-none absolute select-none" style={{ left: '117mm', top: '163mm', width: '93mm', height: '134mm' }} />
          {letterhead && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 select-none overflow-hidden" style={{ height: `${LETTERHEAD_HEIGHT}mm` }}><img src={letterhead} alt="" style={{ width: `${MEMO_PAGE.width}mm`, maxWidth: 'none' }} /></div>}
          <div ref={body} className="relative"><EditorContent editor={editor} /></div>
          {breaks.map((at, index) => <div key={at} aria-hidden className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-sky-400/70" style={{ top: `${at}mm` }}><span className="absolute right-1 top-0.5 rounded bg-sky-50 px-1.5 text-[10px] font-bold text-sky-700">Page {index + 2} starts about here</span></div>)}
        </div>
      </div>
    </div>
  </div>;
}
