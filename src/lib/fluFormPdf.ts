// The influenza vaccine consent or refusal form as a PDF, one A4 page for each staff member, like HR's paper form (navy bars, the ARA logo at its own shape).
export type FluPdfPerson = { name: string; ic: string; branch: string; answer: { choice: 'agree' | 'refuse'; health: string; allergy: boolean; allergyDetail: string; immunDate: string; immunName: string; reason: string; answeredAt: string } };
const NAVY: [number, number, number] = [27, 58, 107];
const dmy = (date: string) => (date ? date.split('-').reverse().join('/') : '');
const INFO = [
  ['Pengenalan:', ['Influenza disebabkan oleh virus Influenza yang menjangkiti saluran pernafasan. Ia boleh menyebabkan gejala jangkitan yang ringan mahupun serius. Dalam keadaan tertentu, ia boleh mengancam nyawa.', 'Influenza merebak daripada seorang individu yang dijangkiti kepada seorang individu yang lain melalui titisan salur pernafasan (respiratory droplets) apabila bercakap, batuk atau bersin. Titisan ini boleh mencemari permukaan dan menyebabkan jangkitan kepada individu yang menyentuh permukaan tersebut.']],
  ['Golongan berisiko tinggi untuk mendapat komplikasi daripada influenza:', ['Kanak-kanak berumur kurang dari 5 tahun; wanita hamil; warga emas berumur 65 tahun dan ke atas; individu dengan penyakit kronik (kencing manis, darah tinggi, asma, dan lain-lain); individu obes; individu yang mempunyai daya ketahanan badan yang rendah (seperti pesakit kanser, penghidap HIV, pesakit yang menjalani rawatan kemoterapi dan lain-lain).']],
  ['Gejala influenza bermula 1 atau 2 hari selepas dijangkiti, dan ianya meliputi:', ['Demam, selsema, sakit tekak, batuk, sakit kepala, sakit badan, sukar bernafas, cirit birit dan sakit perut.']],
  ['Kesan sampingan vaksin:', ['Seperti vaksin-vaksin yang lain, influenza boleh menyebabkan kesan sampingan yang ringan seperti kemerahan, sakit, dan bengkak di tempat suntikan, atau demam, kesan ini biasanya akan surut dengan sendiri.']],
] as const;

async function logo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const response = await fetch('/forms/ara-logo-plato.png'); const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    return { data, w: 300, h: 300 };
  } catch { return null; }
}

export async function fluFormPdf(people: FluPdfPerson[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const mark = await logo();
  people.forEach((person, index) => {
    if (index) pdf.addPage();
    const a = person.answer, agree = a.choice === 'agree';
    pdf.setFillColor(...NAVY); pdf.rect(0, 0, 210, 8, 'F'); pdf.rect(0, 289, 210, 8, 'F');
    // The logo is square: it keeps its shape (24 x 24 mm).
    if (mark) pdf.addImage(mark.data, 'PNG', 172, 11, 24, 24);
    pdf.setTextColor(...NAVY); pdf.setFont('times', 'normal'); pdf.setFontSize(17);
    pdf.text(agree ? ['BORANG KEIZINAN PEMBERIAN VAKSIN', 'INFLUENZA BAGI PEKERJA', 'KLINIK ARA 24 JAM'] : ['BORANG PENOLAKAN PEMBERIAN VAKSIN', 'INFLUENZA BAGI PEKERJA', 'KLINIK ARA 24 JAM'], 15, 18, { lineHeightFactor: 1.15 });
    let y = 42;
    const heading = (text: string) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY); pdf.text(text, 15, y); y += 5; };
    const row = (label: string, value: string, x = 15, width = 180) => { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90, 100, 120); pdf.text(label, x, y); pdf.setTextColor(20, 30, 50); pdf.setFont('helvetica', 'bold'); const lines = pdf.splitTextToSize(value || '-', width - 36); pdf.text(lines, x + 36, y); return lines.length * 4.4; };
    heading('MAKLUMAT PEKERJA');
    y += row('Nama penuh', person.name); y += 1;
    const h1 = row('No Kad Pengenalan', person.ic, 15, 90); row('Cawangan', person.branch, 110, 85); y += h1 + 1;
    y += row('Masalah kesihatan', a.health || 'Tiada') + 1;
    y += row('Masalah alergi', a.allergy ? `Ada${a.allergyDetail ? ` - ${a.allergyDetail}` : ''}` : 'Tiada') + 4;
    // The information box.
    pdf.setFillColor(243, 245, 249); pdf.rect(13, y - 4, 184, 108, 'F');
    y += 1; heading('MAKLUMAT INFLUENZA');
    pdf.setFontSize(8.3);
    for (const [title, paragraphs] of INFO) {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY); pdf.text(title, 17, y); y += 4.2;
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 50, 70);
      for (const paragraph of paragraphs) { const lines = pdf.splitTextToSize(paragraph, 172); pdf.text(lines, 19, y); y += lines.length * 3.8 + 1.2; }
      y += 1.5;
    }
    y += 6;
    if (agree) {
      heading('PEMBERITAHUAN IMUNISASI');
      y += row('Jenis Imunisasi', 'Vaksin influenza') + 1;
      const h2 = row('Tarikh Imunisasi', dmy(a.immunDate), 15, 90); row('Nama imunisasi', a.immunName, 110, 85); y += h2 + 3;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(40, 50, 70);
      const text = pdf.splitTextToSize('Saya mengesahkan bahawa saya telah menerima maklumat yang lengkap mengenai imunisasi yang dinyatakan di atas, termasuk manfaat, risiko, dan kesan sampingan yang mungkin berlaku. Saya memahami maklumat tersebut dan bersetuju untuk menerima vaksinasi ini.', 180);
      pdf.text(text, 15, y); y += text.length * 4.2 + 3;
    } else {
      heading('PENGESAHAN PENOLAKAN');
      y += row('Sebab penolakan', a.reason, 15, 180) + 3;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(40, 50, 70);
      const text = pdf.splitTextToSize('Saya mengesahkan bahawa saya telah menerima maklumat yang lengkap mengenai vaksinasi yang dinyatakan di atas, termasuk manfaat, risiko, dan kesan sampingan yang mungkin berlaku. Saya telah memahami maklumat tersebut dan memilih untuk menolak vaksinasi ini.', 180);
      pdf.text(text, 15, y); y += text.length * 4.2 + 3;
    }
    // Answered on the system, so the signature is the staff member's own sign-in; the witness line is left for HR to fill by hand if needed.
    pdf.setFillColor(243, 245, 249); pdf.rect(13, y, 88, 26, 'F'); pdf.rect(109, y, 88, 26, 'F');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(40, 50, 70);
    pdf.text('Tandatangan pekerja', 16, y + 6); pdf.text('Tandatangan saksi', 112, y + 6);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.text(`Disahkan melalui AraOffice oleh ${person.name}`, 16, y + 14); pdf.setFont('helvetica', 'normal'); pdf.text(`Tarikh: ${dmy(a.answeredAt.slice(0, 10))}`, 16, y + 19);
    pdf.text('Tarikh:', 112, y + 22);
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(8.5); pdf.text('KLINIK ARA 24 JAM', 15, 294); pdf.text('www.hsohealthcare.com', 195, 294, { align: 'right' });
  });
  return pdf.output('blob');
}
