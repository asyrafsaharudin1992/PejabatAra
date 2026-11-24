// The public holiday memo as a PDF drawn with jsPDF (real text and thin lines, one A4 page), not a picture of the screen: the letterhead badge at the very top edge, the title,
// the two holiday tables (operations on the left, management and admin on the right), the pay explanation and the two signature blocks.
export type MemoHoliday = { group: string; date: string; name: string };
export type MemoText = { title: string; doctors: string; assistants: string; contact: string; by: string; byTitle: string; approver: string; approverTitle: string };

const MALAY_DAY = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const dmy = (date: string) => { const [year, month, day] = date.split('-').map(Number); return `${day}/${month}/${year}`; };
const dayOf = (date: string) => MALAY_DAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
// The standard PDF fonts cover Latin-1 only; anything else (curly quotes, dashes) is made plain.
const clean = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E -ÿ]/g, '');
const lines = (text: string) => text.split('\n').map((line) => clean(line.trim())).filter(Boolean);

async function imageData(url: string): Promise<{ data: string; ratio: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const ratio = await new Promise<number>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth / Math.max(1, image.naturalHeight)); image.onerror = () => resolve(1); image.src = data; });
    return { data, ratio };
  } catch { return null; }
}

export async function holidayMemoPdf(memo: MemoText, operation: MemoHoliday[], admin: MemoHoliday[], year: number, badgeUrl = '/forms/ara-letterhead-memo.png'): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const W = 210, H = 297, left = 14, right = W - 14, ink = 0;
  doc.setTextColor(ink, ink, ink); doc.setDrawColor(ink, ink, ink);
  const text = (value: string, x: number, y: number, options: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; underline?: boolean } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(options.size ?? 9);
    doc.text(value, x, y, { align: options.align ?? 'left' });
    if (options.underline) { const width = doc.getTextWidth(value), start = options.align === 'center' ? x - width / 2 : options.align === 'right' ? x - width : x; doc.setLineWidth(0.2); doc.line(start, y + 0.8, start + width, y + 0.8); }
  };

  // Letterhead: the badge hangs from the top edge, the company details are to its right.
  const badge = await imageData(badgeUrl);
  const badgeW = 30, badgeH = badge ? Math.min(40, badgeW / badge.ratio) : 38, badgeX = 118;
  if (badge) doc.addImage(badge.data, 'PNG', badgeX, 0, badgeW, badgeH, undefined, 'FAST');
  let y = 12;
  const tx = badgeX + badgeW + 4, tw = right - tx;
  text('HSO Healthcare Sdn Bhd', tx, y, { size: 10, bold: true }); y += 4.2;
  text('202201004242 (1449939-U)', tx, y, { size: 8, bold: true }); y += 3.6;
  text('TIN: C29715204010', tx, y, { size: 8, bold: true }); y += 4.4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  for (const part of doc.splitTextToSize('H-7-1, Jalan PP25, Putra Walk Block H, Taman Pinggiran Putra, Seri Kembangan, Selangor', tw) as string[]) { doc.text(part, tx, y); y += 3.5; }
  if (memo.contact) for (const part of doc.splitTextToSize(clean(memo.contact), tw) as string[]) { doc.text(part, tx, y + 0.6); y += 3.5; }

  // Title
  y = Math.max(y, badgeH) + 9;
  text(clean(memo.title || `Hari kelepasan Am Klinik Ara 24 Jam bagi tahun ${year}`), W / 2, y, { size: 10.5, bold: true, align: 'center', underline: true });
  y += 6;

  // The two tables, side by side: each row is as tall as its (possibly wrapped) name needs.
  const gap = 4, tableW = (right - left - gap) / 2, dateW = 19, dayW = 15, nameW = tableW - dateW - dayW, pad = 1.4;
  const rowH = 5, fontPt = 8.5;
  doc.setFontSize(fontPt);
  const drawTable = (x0: number, title: string, rows: MemoHoliday[]) => {
    let top = y;
    const cell = (x: number, w: number, height: number, fill = false) => { if (fill) { doc.setFillColor(236, 236, 236); doc.rect(x, top, w, height, 'FD'); } else doc.rect(x, top, w, height); };
    doc.setLineWidth(0.2);
    cell(x0, tableW, rowH, true); text(clean(title), x0 + tableW / 2, top + 3.6, { size: fontPt, bold: true, align: 'center' }); top += rowH;
    cell(x0, nameW, rowH, true); cell(x0 + nameW, dateW, rowH, true); cell(x0 + nameW + dateW, dayW, rowH, true);
    text('Jenis Cuti (Selangor)', x0 + pad, top + 3.6, { size: fontPt, bold: true }); text('Tarikh', x0 + nameW + pad, top + 3.6, { size: fontPt, bold: true }); text('Hari', x0 + nameW + dateW + pad, top + 3.6, { size: fontPt, bold: true }); top += rowH;
    if (!rows.length) { cell(x0, tableW, rowH); text('Tiada cuti dimasukkan', x0 + tableW / 2, top + 3.6, { size: fontPt, align: 'center' }); top += rowH; }
    for (const row of rows) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fontPt);
      const parts = doc.splitTextToSize(clean(row.name), nameW - pad * 2) as string[], height = Math.max(rowH, parts.length * 3.6 + 1.6);
      cell(x0, nameW, height); cell(x0 + nameW, dateW, height); cell(x0 + nameW + dateW, dayW, height);
      parts.forEach((part, index) => doc.text(part, x0 + pad, top + 3.6 + index * 3.6));
      const middle = top + (height - 3.6) / 2 + 3.2;
      doc.text(dmy(row.date), x0 + nameW + pad, middle); doc.text(dayOf(row.date), x0 + nameW + dateW + pad, middle);
      top += height;
    }
    return top;
  };
  const bottom = Math.max(drawTable(left, 'Hari Kelepasan Am Jabatan Operasi', operation), drawTable(left + tableW + gap, 'Hari Kelepasan Am Jabatan Pengurusan- Admin', admin));
  y = bottom + 4;
  if ([...operation, ...admin].some((row) => /\*\s*$/.test(row.name))) { text('* Tarikh tertakluk kepada perubahan (mengikut pengumuman rasmi).', left, y, { size: 8.5 }); y += 4; }

  // The explanation of the pay, then the signatures. If it would not fit the page, the text is set a little smaller.
  const sections: [string, string[]][] = [['Pekerja Operasi- Doktor Residen', lines(memo.doctors)], ['Pekerja Operasi- Pembantu Klinik', lines(memo.assistants)]];
  const indent = 7, wrapW = right - left - 6 - indent;
  const measure = (pt: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(pt); const line = pt * 0.3528 * 1.32; let total = 5 + line; for (const [, items] of sections) { total += 3 + line; for (const item of items) total += (doc.splitTextToSize(item, wrapW) as string[]).length * line + 0.6; total += 3; } return { total, line }; };
  const signatureBlock = 36, room = H - 10 - y - signatureBlock;
  let pt = 9, sized = measure(pt); while (sized.total > room && pt > 6.5) { pt -= 0.25; sized = measure(pt); }
  const line = sized.line;
  y += 5; text('Penerangan jenis pembayaran perkhidmatan semasa hari kelepasan Am:', left + 6, y, { size: pt, bold: true }); y += line + 3;
  for (const [heading, items] of sections) {
    text(heading, left + 6, y, { size: pt, bold: true, underline: true }); y += line + 0.6;
    items.forEach((item, index) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(pt);
      doc.text(`${index + 1}.`, left + 6 + 3, y, { align: 'right' });
      for (const part of doc.splitTextToSize(item, wrapW) as string[]) { doc.text(part, left + 6 + indent - 2, y); y += line; }
      y += 0.6;
    });
    y += 3;
  }

  // Signatures: left under "Disediakan oleh,", right under "Diluluskan oleh,", each with a dotted line to sign on.
  y = Math.max(y + 6, H - 10 - signatureBlock + 6);
  const sign = (x: number, label: string, name: string, title: string) => {
    text(label, x, y, { size: pt });
    const dots = y + 20; doc.setLineDashPattern([0.3, 0.8], 0); doc.setLineWidth(0.25); doc.line(x, dots, x + 52, dots); doc.setLineDashPattern([], 0);
    text(clean(name), x, dots + 4.5, { size: pt }); text(clean(title), x, dots + 8.5, { size: pt, bold: true }); text('HSO Healthcare Sdn Bhd', x, dots + 12.5, { size: pt, bold: true });
  };
  sign(left + 6, 'Disediakan oleh,', memo.by, memo.byTitle);
  sign(W / 2 + 8, 'Diluluskan oleh,', memo.approver, memo.approverTitle);
  return doc.output('blob') as Blob;
}
