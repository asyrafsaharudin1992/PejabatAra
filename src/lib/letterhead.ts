import type { jsPDF } from 'jspdf';

// The company letterhead drawn at the top of a PDF page, laid out exactly like the letterhead paper (measured from the department letterheads): the navy badge hangs from the top edge, and the
// company name, registration, TIN, address and the e-mail and phone (each with its small icon) all sit inside the height of the badge. Only the e-mail and phone differ by department.
export type LetterheadAssets = { badge: { data: string; ratio: number } | null; mail: { data: string; ratio: number } | null; phone: { data: string; ratio: number } | null; pattern: { data: string; ratio: number } | null };
export const LETTERHEAD_HEIGHT = 43;   // mm, the height of the badge: the page content starts below this

async function imageData(url: string): Promise<{ data: string; ratio: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const ratio = await new Promise<number>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth / Math.max(1, image.naturalHeight)); image.onerror = () => resolve(1); image.src = data; });
    return { data, ratio };
  } catch { return null; }
}
export async function loadLetterheadAssets(): Promise<LetterheadAssets> {
  const [badge, mail, phone, pattern] = await Promise.all([imageData('/forms/ara-letterhead-memo.png'), imageData('/forms/icon-mail.png'), imageData('/forms/icon-phone.png'), imageData('/forms/ara-letterhead-pattern.png')]);
  return { badge, mail, phone, pattern };
}

// The company's faint pattern in the lower right corner (the letterhead paper has it on every page).
export function drawPattern(doc: jsPDF, assets: LetterheadAssets) { if (assets.pattern) doc.addImage(assets.pattern.data, 'PNG', 117, 163, 93, 134, undefined, 'FAST'); }

export function drawLetterhead(doc: jsPDF, assets: LetterheadAssets, contact: { email?: string; phone?: string }) {
  const clean = (text: string) => text.replace(/[^\x20-\x7E -ÿ]/g, '');
  // A font size that makes a text exactly as wide as it is on the letterhead paper.
  const sizeFor = (text: string, bold: boolean, mm: number) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); return 10 * mm / Math.max(0.1, doc.getTextWidth(text)); };
  const put = (text: string, x: number, y: number, bold: boolean, size: number) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(0, 0, 0); doc.text(text, x, y); };
  const badgeX = 118.9, badgeW = 31.7, tx = 154.7;
  if (assets.badge) doc.addImage(assets.badge.data, 'PNG', badgeX, 0, badgeW, LETTERHEAD_HEIGHT, undefined, 'FAST');
  put('HSO Healthcare Sdn Bhd', tx, 11.7, true, sizeFor('HSO Healthcare Sdn Bhd', true, 37.3));
  put('202201004242 (1449939-U)', tx, 14.4, true, sizeFor('202201004242 (1449939-U)', true, 34.5));
  put('TIN: C29715204010', tx, 17.1, true, sizeFor('TIN: C29715204010', true, 23.6));
  const small = sizeFor('Taman Pinggiran Putra, Seri Kembangan', false, 47.5);
  put('H-7-1, Jalan PP25, Putra Walk Block H', tx, 23.2, false, small);
  put('Taman Pinggiran Putra, Seri Kembangan', tx, 26.5, false, small);
  put('Selangor', tx, 29.8, false, small);
  const contactSize = sizeFor('hr@hsohealthcare.com', false, 27.9), cx = 160.5;
  const email = clean((contact.email || '').trim()), phone = clean((contact.phone || '').trim());
  if (email) { if (assets.mail) doc.addImage(assets.mail.data, 'PNG', 154.8, 33.8, 4.1, 4.1 / assets.mail.ratio, undefined, 'FAST'); put(email, cx, 36.4, false, contactSize); }
  if (phone) { if (assets.phone) doc.addImage(assets.phone.data, 'PNG', 155.2, 38.9, 3.9, 3.9 / assets.phone.ratio, undefined, 'FAST'); put(phone, cx, 41.3, false, contactSize); }
}
