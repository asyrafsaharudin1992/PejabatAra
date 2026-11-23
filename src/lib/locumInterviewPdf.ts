// The Locum Medical Officer Interview Assessment as a one-page A4 PDF, laid out like the paper form "Interview locum" (logo and clinic name at the top,
// the details, then the blue headings Working experience / Procedure / Skills / Suggestion, and the knowledge mark at the bottom).
export type LocumInterviewData = {
  name: string; mmc: string; phone: string; branch: string; workplace: string; interviewer: string; date: string; timeStart: string; timeEnd: string;
  experience: string; skills: string; marks: number | null; outOf: number | null; suggestion: string;
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
  if (mark) pdf.addImage(mark, 'PNG', 40, 12, 18, 18);
  pdf.setTextColor(...NAVY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.text('KLINIK ARA 24 JAM', 62, 21);
  pdf.setFontSize(11); pdf.text('HSO HEALTHCARE SDN. BHD. (1449939-U)', 62, 27.5);
  pdf.setFontSize(15); pdf.text('Locum Medical Officer Interview Assessment', 105, 47, { align: 'center' });

  const field = (label: string, value: string, x: number, y: number, valueX: number) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY); pdf.text(label, x, y);
    pdf.setTextColor(20, 30, 50); pdf.setFont('helvetica', 'normal'); pdf.text(value || '', valueX, y, { maxWidth: 62 });
  };
  field('Name:', data.name, 15, 60, 30); field('Branch:', data.branch, 15, 67, 33);
  field('MMC no.:', data.mmc, 15, 74, 36); field('Phone:', data.phone, 15, 81, 30);
  field('Interviewer:', data.interviewer, 112, 60, 138); field('Date:', dmy(data.date), 112, 67, 138);
  field('Time (start):', data.timeStart, 112, 74, 138); field('Time (end):', data.timeEnd, 112, 81, 138);

  let y = 94;
  const section = (title: string, text: string, min: number) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...BLUE); pdf.text(title, 15, y); y += 5.5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(0, 0, 0);
    const lines: string[] = pdf.splitTextToSize(text || '', 180);
    pdf.text(lines, 15, y, { lineHeightFactor: 1.35 });
    y += Math.max(min, lines.length * 5 + 4);
  };
  section('Current workplace / dept', data.workplace, 22);
  section('Working experience', data.experience, 45);
  section('Procedure / Skills', data.skills, 45);
  section('Suggestion', data.suggestion, 30);
  const text = knowledgeText(data);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(...GREEN);
  pdf.text(`Knowledge Markah: ${text || '-'}`, 15, Math.min(Math.max(y + 6, 255), 280));
  return pdf.output('blob');
}
