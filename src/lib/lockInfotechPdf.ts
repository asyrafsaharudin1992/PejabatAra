import { pdfPageImages } from './pdfPages';

// The staff member's copy of an original Infotech payslip, locked with their AraOffice password (as the AraOffice payslip PDF is): each page is drawn
// as a picture and put in a new password-protected PDF. Both libraries are loaded only when a copy is asked for.
export async function lockInfotechPdf(original: Blob, password: string, code: string): Promise<Uint8Array> {
  const [{ jsPDF }, pages] = await Promise.all([import('jspdf'), pdfPageImages(original, 2.5)]);
  try {
    if (!pages.length) throw new Error('The payslip could not be prepared. Try again.');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, encryption: { userPassword: password, ownerPassword: `${password}-owner-${code}`, userPermissions: ['print'] } });
    for (let at = 0; at < pages.length; at++) {
      const image = new Image(); image.src = pages[at]; await image.decode();
      const scale = Math.min(210 / image.naturalWidth, 297 / image.naturalHeight), width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      if (at) doc.addPage();
      doc.addImage(image, 'PNG', (210 - width) / 2, 0, width, height, undefined, 'FAST');
    }
    return new Uint8Array(doc.output('arraybuffer'));
  } finally { pages.forEach((url) => URL.revokeObjectURL(url)); }
}
