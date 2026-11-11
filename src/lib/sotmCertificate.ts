// Staff of the Month certificate, A4 landscape, drawn on a canvas (designed in 1170 x 827 units and drawn at twice that size).
export const CERT_W = 2340, CERT_H = 1654;
const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
export const MALAY_MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
export type CertInput = { name: string; branch: string; month: string; signer: string; signerTitle: string; signature: (CanvasImageSource & { width: number; height: number }) | null; logo: (CanvasImageSource & { width: number; height: number }) | null };

function star(g: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number, color: string | CanvasGradient) {
  g.fillStyle = color; g.beginPath();
  for (let point = 0; point < points * 2; point++) { const radius = point % 2 ? inner : outer, angle = -Math.PI / 2 + (point * Math.PI) / points; g.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle)); }
  g.closePath(); g.fill();
}
// Text with spacing between the letters.
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number, align: CanvasTextAlign) {
  const letters = [...text], widths = letters.map((letter) => g.measureText(letter).width), total = widths.reduce((sum, width) => sum + width, 0) + gap * (letters.length - 1);
  let at = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  g.textAlign = 'left'; letters.forEach((letter, index) => { g.fillText(letter, at, y); at += widths[index] + gap; });
  g.textAlign = align === 'left' ? 'left' : 'center';
}

// The logo file is dark on white: keep the dark parts in navy and make the white background see-through.
function inkLogo(logo: CanvasImageSource & { width: number; height: number }, size: number) {
  const scale = Math.min(size / logo.width, size / logo.height), w = Math.round(logo.width * scale), h = Math.round(logo.height * scale);
  const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
  const context = layer.getContext('2d'); if (!context) return layer;
  context.drawImage(logo, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const light = (pixels.data[index] * 0.3 + pixels.data[index + 1] * 0.59 + pixels.data[index + 2] * 0.11) / 255;
    pixels.data[index + 3] = Math.round(Math.min(1, Math.max(0, (1 - light) * 1.3)) * 255);
    pixels.data[index] = 20; pixels.data[index + 1] = 35; pixels.data[index + 2] = 59;
  }
  context.putImageData(pixels, 0, 0);
  return layer;
}

// A branch of laurel leaves along an arc of a circle, from `from` to `to` (radians).
function laurel(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number, from: number, to: number, side: 1 | -1, fill: CanvasGradient, scale = 1) {
  const count = 12;
  for (let index = 0; index < count; index++) {
    const angle = from + ((to - from) * index) / (count - 1), size = (26 - index * 0.8) * scale;
    const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle), tangent = angle + (side * Math.PI) / 2;
    for (const turn of [-0.62, 0.62]) { g.save(); g.translate(x, y); g.rotate(tangent + turn * side); g.fillStyle = fill; g.beginPath(); g.ellipse(size * 0.5, 0, size * 0.62, size * 0.2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  }
}

export function drawCertificate(canvas: HTMLCanvasElement, input: CertInput) {
  const g = canvas.getContext('2d'); if (!g) return;
  canvas.width = CERT_W; canvas.height = CERT_H; g.scale(2, 2);
  const W = 1170, H = 827, navy = '#14233b';
  const gold = g.createLinearGradient(0, 0, W, H); gold.addColorStop(0, '#b9770e'); gold.addColorStop(0.25, '#ffe39a'); gold.addColorStop(0.5, '#e8a92c'); gold.addColorStop(0.75, '#ffe9a8'); gold.addColorStop(1, '#b9770e');
  const darkGold = g.createLinearGradient(0, 0, W, 0); darkGold.addColorStop(0, '#a8690a'); darkGold.addColorStop(0.5, '#d9981f'); darkGold.addColorStop(1, '#a8690a');
  // Ivory paper with a soft light in the middle.
  const paper = g.createRadialGradient(W * 0.6, H * 0.6, 60, W / 2, H / 2, 760); paper.addColorStop(0, '#fffdf7'); paper.addColorStop(1, '#f6efdd'); g.fillStyle = paper; g.fillRect(0, 0, W, H);
  // Header: navy with a wave, light rays, gold dust and a gold edge.
  const wave = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 212); g.bezierCurveTo(W * 0.78, 262, W * 0.5, 172, 0, 250); g.closePath(); };
  const head = g.createLinearGradient(0, 0, W, 260); head.addColorStop(0, '#0b1626'); head.addColorStop(0.55, '#16304f'); head.addColorStop(1, '#0b587b');
  g.save(); g.translate(0, 10); wave(); g.fillStyle = gold; g.fill(); g.restore();
  wave(); g.fillStyle = head; g.fill();
  g.save(); wave(); g.clip();
  for (let ray = 0; ray < 22; ray++) { const angle = (ray * Math.PI * 2) / 22; g.fillStyle = 'rgba(255,227,154,0.05)'; g.beginPath(); g.moveTo(1015, 118); g.arc(1015, 118, 900, angle, angle + Math.PI / 22); g.closePath(); g.fill(); }
  let seed = 11; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let dot = 0; dot < 50; dot++) { g.globalAlpha = 0.15 + random() * 0.6; g.fillStyle = '#ffe39a'; g.beginPath(); g.arc(random() * W, random() * 230, 0.8 + random() * 1.8, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  for (const [x, y, size] of [[560, 44, 8], [760, 196, 6], [860, 62, 9], [470, 196, 6]]) star(g, x, y, size, size * 0.2, 4, '#ffe39a');
  g.restore();
  g.textBaseline = 'alphabetic';
  g.save(); g.shadowColor = 'rgba(232,169,44,0.45)'; g.shadowBlur = 16; g.fillStyle = '#fff7e0'; g.font = `700 60px ${SERIF}`; spaced(g, 'SIJIL PENGHARGAAN', 66, 112, 4, 'left'); g.restore();
  g.fillStyle = gold; g.font = `700 22px ${FONT}`; spaced(g, `KLINIK ARA 24 JAM${input.branch.trim() ? `  ·  CAWANGAN ${input.branch.trim().toUpperCase()}` : ''}`, 68, 164, 5, 'left');
  g.fillStyle = gold; g.fillRect(68, 180, 150, 2);
  // Gold medal in a laurel wreath, with ribbon tails.
  const mx = 1015, my = 112;
  const leaf = g.createLinearGradient(mx - 90, my - 90, mx + 90, my + 90); leaf.addColorStop(0, '#ffe9a8'); leaf.addColorStop(0.5, '#e8a92c'); leaf.addColorStop(1, '#ffe39a');
  g.fillStyle = '#1d4a9a'; g.beginPath(); g.moveTo(mx - 36, my + 40); g.lineTo(mx - 6, my + 40); g.lineTo(mx - 18, my + 134); g.lineTo(mx - 38, my + 112); g.lineTo(mx - 60, my + 134); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(mx + 36, my + 40); g.lineTo(mx + 6, my + 40); g.lineTo(mx + 18, my + 134); g.lineTo(mx + 38, my + 112); g.lineTo(mx + 60, my + 134); g.closePath(); g.fill();
  laurel(g, mx, my, 84, Math.PI * 0.64, Math.PI * 1.3, -1, leaf, 0.85); laurel(g, mx, my, 84, Math.PI * 0.36, -Math.PI * 0.3, 1, leaf, 0.85);
  const medal = g.createLinearGradient(mx - 64, my - 64, mx + 64, my + 64); medal.addColorStop(0, '#ffe9a8'); medal.addColorStop(0.5, '#e8ab2c'); medal.addColorStop(1, '#ffe39a');
  g.save(); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 14; g.shadowOffsetY = 5; star(g, mx, my, 66, 58, 24, medal); g.restore();
  g.fillStyle = '#9a620a'; g.beginPath(); g.arc(mx, my, 47, 0, Math.PI * 2); g.fill();
  g.fillStyle = medal; g.beginPath(); g.arc(mx, my, 43, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.stroke();
  star(g, mx, my, 23, 9.5, 5, '#14233b');
  // Double gold frame with corner diamonds.
  g.strokeStyle = gold; g.lineWidth = 4.5; g.strokeRect(14, 14, W - 28, H - 28);
  g.strokeStyle = 'rgba(185,119,14,0.55)'; g.lineWidth = 1.4; g.strokeRect(26, 26, W - 52, H - 52);
  for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#fffdf7'; g.fillRect(-10, -10, 20, 20); g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(-10, -10, 20, 20); g.restore(); }
  // Logo on the left with a fine gold divider.
  if (input.logo) { const layer = inkLogo(input.logo, 290); g.drawImage(layer, 76, 335); }
  g.fillStyle = darkGold; g.fillRect(412, 318, 1.6, 330);
  // Text, centred on the right.
  const cx = 770; g.textAlign = 'center';
  g.fillStyle = darkGold; g.font = `700 19px ${FONT}`; spaced(g, 'JUTAAN TERIMA KASIH DIUCAPKAN KEPADA', cx, 318, 3.5, 'center');
  const name = (input.name.trim() || 'NAMA STAF').toUpperCase();
  let size = 54; const fit = () => { g.font = `700 ${size}px ${SERIF}`; return g.measureText(name).width <= 680; };
  while (size > 30 && !fit()) size -= 2;
  g.save(); g.shadowColor = 'rgba(20,35,59,0.18)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.fillStyle = navy; g.textAlign = 'center'; g.fillText(name, cx, 392); g.restore();
  g.fillStyle = gold; g.fillRect(cx - 190, 417, 160, 2.5); g.fillRect(cx + 30, 417, 160, 2.5); star(g, cx, 418, 10, 4, 4, '#d9981f');
  const [year, month] = input.month.split('-').map(Number), monthName = MALAY_MONTHS[(month || 1) - 1] || '';
  g.fillStyle = '#3a4150'; g.font = `400 23px ${SERIF}`; g.textAlign = 'center';
  g.fillText(`atas khidmat kerja cemerlang sepanjang bulan ${monthName} ${year || ''}`, cx, 468);
  g.fillText('dan tahniah kerana terpilih sebagai', cx, 502);
  const title = g.createLinearGradient(cx - 280, 0, cx + 280, 0); title.addColorStop(0, '#a8690a'); title.addColorStop(0.5, '#e8a92c'); title.addColorStop(1, '#a8690a');
  g.save(); g.shadowColor = 'rgba(168,105,10,0.3)'; g.shadowBlur = 8; g.shadowOffsetY = 2; g.fillStyle = title; g.font = `700 46px ${SERIF}`; spaced(g, 'STAFF OF THE MONTH', cx, 578, 2.5, 'center'); g.restore();
  star(g, cx - 318, 563, 9, 3.5, 4, '#d9981f'); star(g, cx + 318, 563, 9, 3.5, 4, '#d9981f');
  g.fillStyle = '#3a4150'; g.font = `italic 400 22px ${SERIF}`; g.textAlign = 'center'; g.fillText('Semoga kecemerlangan ini diteruskan untuk masa akan datang', cx, 628);
  // Signature: the picture sits on the line, then the name, the position and the company (the last line in bold).
  if (input.signature) { const scale = Math.min(190 / input.signature.width, 72 / input.signature.height), sw = input.signature.width * scale, sh = input.signature.height * scale; g.drawImage(input.signature, 955 - sw / 2, 718 - sh, sw, sh); }
  g.strokeStyle = navy; g.lineWidth = 1.5; g.beginPath(); g.moveTo(800, 722); g.lineTo(1110, 722); g.stroke();
  g.fillStyle = navy; g.textAlign = 'center'; g.font = `italic 700 19px ${SERIF}`; g.fillText(input.signer.toUpperCase(), 955, 747);
  input.signerTitle.split('\n').forEach((line, index, lines) => { g.font = `${index === lines.length - 1 && lines.length > 1 ? 700 : 500} 15px ${FONT}`; g.fillText(line.toUpperCase(), 955, 769 + index * 20); });
}
