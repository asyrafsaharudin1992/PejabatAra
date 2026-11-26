import { keyOf, type Answers, type PdfForm } from './model';

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('A picture could not be read.')); image.src = src; });
// Draws the answers on the page pictures and puts them together as a PDF of the same page shapes.
export async function filledPdf(pages: string[], form: PdfForm, answers: Answers): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (let number = 0; number < pages.length; number++) {
    const picture = await load(pages[number]), canvas = document.createElement('canvas');
    canvas.width = picture.width; canvas.height = picture.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot make the PDF.');
    context.drawImage(picture, 0, 0);
    context.fillStyle = context.strokeStyle = '#0b2a6f';
    for (const field of form.fields.filter((item) => item.page === number)) {
      const answer = answers[keyOf(field)] || '';
      const x = field.x * canvas.width, y = field.y * canvas.height, w = field.w * canvas.width, h = field.h * canvas.height;
      context.lineWidth = Math.max(2, canvas.width / 450);
      if (field.type === 'check') { if (answer === 'yes') { context.beginPath(); context.moveTo(x + w * 0.15, y + h * 0.55); context.lineTo(x + w * 0.4, y + h * 0.85); context.lineTo(x + w * 0.9, y + h * 0.1); context.stroke(); } }
      else if (field.type === 'choice') { if (answer === field.value) { context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); context.stroke(); } }
      else if (field.type === 'signature') { if (answer) { const ink = await load(answer), scale = Math.min(w / ink.width, h / ink.height); context.drawImage(ink, x, y + h - ink.height * scale, ink.width * scale, ink.height * scale); } }
      else if (answer) {
        const long = field.type === 'paragraph', size = long ? canvas.width / 70 : Math.min(h * 0.72, canvas.width / 55);
        context.font = `${size}px Helvetica, Arial, sans-serif`; context.textBaseline = 'top';
        if (!long) context.fillText(answer, x + 2, y + (h - size) / 2, w - 4);
        else {
          let line = '', top = y + 4;
          for (const part of answer.split('\n')) {
            for (const word of part.split(/\s+/)) {
              const next = line ? `${line} ${word}` : word;
              if (context.measureText(next).width > w - 8 && line) { if (top + size <= y + h) context.fillText(line, x + 4, top); top += size * 1.3; line = word; } else line = next;
            }
            if (top + size <= y + h) context.fillText(line, x + 4, top, w - 8); top += size * 1.3; line = '';
          }
        }
      }
    }
    const width = 595, height = (width * canvas.height) / canvas.width;
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [width, height] }); else pdf.addPage([width, height]);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, width, height);
    canvas.width = 0; canvas.height = 0;
  }
  if (!pdf) throw new Error('There is no page.');
  return pdf.output('blob');
}
