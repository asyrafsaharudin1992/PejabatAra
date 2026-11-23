// The Locum Medical Officer Interview Assessment as a one-page A4 PDF, laid out like the paper form "Interview locum" (logo and clinic name at the top,
// the details, then the blue headings Working experience / Procedure / Skills / Suggestion, and the knowledge mark at the bottom).
export type LocumInterviewData = {
  name: string; mmc: string; phone: string; branch: string; workplace: string; interviewer: string; date: string; timeStart: string; timeEnd: string;
  experience: string; skills: string; strength?: string; weakness?: string; marks: number | null; outOf: number | null; suggestion: string;
};
const NAVY: [number, number, number] = [30, 58, 74];
const BLUE: [number, number, number] = [20, 76, 150];
const GREEN: [number, number, number] = [110, 128, 0];
export const dmy = (value: string) => (value ? value.split('-').reverse().join('/') : '');
const num = (value: number) => String(Math.round(value * 100) / 100);
export const knowledgePercent = (data: Pick<LocumInterviewData, 'marks' | 'outOf'>) => data.marks !== null && data.outOf ? Math.round(data.marks / data.outOf * 1000) / 10 : null;
export const knowledgeText = (data: Pick<LocumInterviewData, 'marks' | 'outOf'>) => { const percent = knowledgePercent(data); return percent === null ? '' : `${num(data.marks as number)}/${num(data.outOf as number)} = ${percent}%`; };

async function logo(): Promise<string | null> {
  try {
    const blob = await (await fetch('/forms/ara-logo-plato.png')).blob();
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
  } catch { return null; }
}

export async function locumInterviewPdf(data: LocumInterviewData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const mark = await logo();
  const W = 210, M = 15;
  // Header band: navy, logo on a white tile, clinic name and the form title.
  pdf.setFillColor(...NAVY); pdf.rect(0, 0, W, 38, 'F');
  pdf.setFillColor(255, 255, 255); pdf.roundedRect(M, 8, 22, 22, 3, 3, 'F');
  if (mark) pdf.addImage(mark, 'PNG', M + 2, 10, 18, 18);
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.text('KLINIK ARA 24 JAM', M + 28, 17);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text('HSO HEALTHCARE SDN. BHD. (1449939-U)', M + 28, 22.5);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11.5); pdf.setTextColor(150, 215, 240); pdf.text('LOCUM MEDICAL OFFICER INTERVIEW ASSESSMENT', M + 28, 30);

  // Details card: two columns of label / value pairs.
  let y = 46;
  pdf.setFillColor(243, 248, 251); pdf.setDrawColor(215, 227, 235); pdf.roundedRect(M, y, W - 2 * M, 42, 3, 3, 'FD');
  const pair = (label: string, value: string, x: number, row: number) => {
    const yy = y + 9.5 + row * 10;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(110, 125, 140); pdf.text(label.toUpperCase(), x, yy - 3.2);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5); pdf.setTextColor(20, 30, 50); pdf.text(value || '-', x, yy + 0.8, { maxWidth: 80 });
  };
  pair('Name', data.name, M + 6, 0); pair('Interviewer', data.interviewer, 112, 0);
  pair('MMC no.', data.mmc, M + 6, 1); pair('Date', dmy(data.date), 112, 1);
  pair('Phone', data.phone, M + 6, 2); pair('Time', `${data.timeStart || '-'}  to  ${data.timeEnd || '-'}`, 112, 2);
  pair('Branch', data.branch, M + 6, 3);
  y += 42 + 9;

  // Each section: a blue title with a thin rule, then the text.
  const section = (title: string, text: string, min: number) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...BLUE); pdf.text(title.toUpperCase(), M, y);
    pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.4); pdf.line(M, y + 1.8, W - M, y + 1.8); y += 7;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(25, 30, 40);
    const lines: string[] = pdf.splitTextToSize(text || '', W - 2 * M);
    pdf.text(lines, M, y, { lineHeightFactor: 1.4 });
    y += Math.max(min, lines.length * 5.2 + 3) + 4;
  };
  section('Current workplace / dept', data.workplace, 12);
  section('Working experience', data.experience, 28);
  section('Procedure / Skills', data.skills, 28);
  // Strength and weakness side by side.
  const half = (W - 2 * M - 8) / 2, top = y;
  const column = (title: string, text: string, x: number) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...BLUE); pdf.text(title.toUpperCase(), x, top);
    pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.4); pdf.line(x, top + 1.8, x + half, top + 1.8);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(25, 30, 40);
    const lines: string[] = pdf.splitTextToSize(text || '', half);
    pdf.text(lines, x, top + 7, { lineHeightFactor: 1.4 });
    return lines.length * 5.2 + 3;
  };
  y = top + 7 + Math.max(22, column('Strength', data.strength || '', M), column('Weakness', data.weakness || '', M + half + 8)) + 4;
  section('Suggestion', data.suggestion, 16);

  // Knowledge mark: a green badge at the bottom.
  const percent = knowledgePercent(data);
  const by = Math.min(Math.max(y + 2, 258), 272);
  pdf.setFillColor(238, 244, 214); pdf.setDrawColor(...GREEN); pdf.setLineWidth(0.5); pdf.roundedRect(M, by, W - 2 * M, 16, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...GREEN); pdf.text('KNOWLEDGE MARKAH', M + 6, by + 6.5);
  pdf.setFontSize(15); pdf.text(percent === null ? '-' : `${num(data.marks as number)} / ${num(data.outOf as number)}`, M + 6, by + 13);
  if (percent !== null) { pdf.setFontSize(20); pdf.text(`${percent}%`, W - M - 6, by + 11.5, { align: 'right' }); }
  pdf.setFillColor(...NAVY); pdf.rect(0, 289, W, 8, 'F');
  return pdf.output('blob');
}
