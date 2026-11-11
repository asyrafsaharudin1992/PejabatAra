export const W = 1080, H = 1350;

export type PosterInput = { name: string; branch: string; quote: string; month: string; photo: CanvasImageSource & { width: number; height: number } | null; logo: (CanvasImageSource & { width: number; height: number }) | null; zoom: number; moveX: number; moveY: number };

export const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
export const SERIF = 'Georgia, "Times New Roman", serif';
export function star(g: CanvasRenderingContext2D, x: number, y: number, outer: number, color: string | CanvasGradient, inner = outer * 0.42, points = 5) {
  g.fillStyle = color; g.beginPath();
  for (let point = 0; point < points * 2; point++) { const radius = point % 2 ? inner : outer, angle = -Math.PI / 2 + (point * Math.PI) / points; g.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle)); }
  g.closePath(); g.fill();
}
// Text with spacing between the letters.
export function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number) {
  const letters = [...text], widths = letters.map((letter) => g.measureText(letter).width), total = widths.reduce((sum, width) => sum + width, 0) + gap * (letters.length - 1);
  let at = x - total / 2; g.textAlign = 'left'; letters.forEach((letter, index) => { g.fillText(letter, at, y); at += widths[index] + gap; }); g.textAlign = 'center';
}
// A branch of laurel leaves along an arc of a circle, from `from` to `to` (radians).
export function laurel(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number, from: number, to: number, side: 1 | -1, fill: CanvasGradient, scale = 1) {
  const count = 15;
  for (let index = 0; index < count; index++) {
    const angle = from + ((to - from) * index) / (count - 1), size = (34 - index * 0.9) * scale;
    const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle), tangent = angle + (side * Math.PI) / 2;
    for (const turn of [-0.62, 0.62]) { g.save(); g.translate(x, y); g.rotate(tangent + turn * side); g.fillStyle = fill; g.beginPath(); g.ellipse(size * 0.5, 0, size * 0.62, size * 0.2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  }
}

// The logo file is dark on white: turn the dark parts into white and the white background into nothing.
export function whiteLogo(logo: CanvasImageSource & { width: number; height: number }, size: number) {
  const scale = Math.min(size / logo.width, size / logo.height), w = Math.round(logo.width * scale), h = Math.round(logo.height * scale);
  const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
  const context = layer.getContext('2d'); if (!context) return layer;
  context.drawImage(logo, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const light = (pixels.data[index] * 0.3 + pixels.data[index + 1] * 0.59 + pixels.data[index + 2] * 0.11) / 255;
    pixels.data[index + 3] = Math.round(Math.min(1, Math.max(0, (1 - light) * 1.25)) * (pixels.data[index + 3] / 255) * 255);
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return layer;
}

// `scale` draws the same poster larger (1.5 for the picture that is downloaded, shared and kept; 1 for the preview), so it stays sharp.
export function drawPoster(canvas: HTMLCanvasElement, input: PosterInput, scale = 1) {
  const g = canvas.getContext('2d'); if (!g) return;
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale); g.scale(scale, scale);
  const cx = W / 2, cy = 690, radius = 245;
  const gold = g.createLinearGradient(0, 0, W, H); gold.addColorStop(0, '#b9770e'); gold.addColorStop(0.25, '#ffe39a'); gold.addColorStop(0.5, '#e8a92c'); gold.addColorStop(0.75, '#ffe9a8'); gold.addColorStop(1, '#b9770e');
  // Background: very deep navy with a teal glow behind the photo and a dark edge.
  const bg = g.createRadialGradient(cx, 560, 80, cx, 640, 1000); bg.addColorStop(0, '#16304f'); bg.addColorStop(0.55, '#0c1a2e'); bg.addColorStop(1, '#050b15'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(cx, cy, 120, cx, cy, 560); glow.addColorStop(0, 'rgba(24,130,170,0.55)'); glow.addColorStop(1, 'rgba(24,130,170,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.save(); g.translate(cx, cy);
  for (let ray = 0; ray < 24; ray++) { const angle = (ray * Math.PI * 2) / 24; g.fillStyle = 'rgba(255,227,154,0.035)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1000, angle, angle + Math.PI / 24); g.closePath(); g.fill(); }
  g.restore();
  // Fine gold dust.
  let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let dot = 0; dot < 90; dot++) { const x = random() * W, y = random() * H; if (Math.hypot(x - cx, y - cy) < 330) continue; g.globalAlpha = 0.15 + random() * 0.6; g.fillStyle = '#ffe39a'; g.beginPath(); g.arc(x, y, 0.8 + random() * 2.2, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  for (const [x, y, size] of [[120, 300, 16], [960, 330, 20], [90, 860, 12], [990, 900, 15], [170, 1120, 11], [910, 1130, 13]]) star(g, x, y, size, '#ffe39a', size * 0.18, 4);
  // Double gold frame with corner diamonds.
  g.strokeStyle = gold; g.lineWidth = 4; g.strokeRect(26, 26, W - 52, H - 52);
  g.strokeStyle = 'rgba(255,227,154,0.45)'; g.lineWidth = 1.5; g.strokeRect(42, 42, W - 84, H - 84);
  for (const [x, y] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#0c1a2e'; g.fillRect(-13, -13, 26, 26); g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(-13, -13, 26, 26); g.restore(); }
  g.textAlign = 'center';
  // White logo, then the title between two gold rules.
  if (input.logo) { const layer = whiteLogo(input.logo, Math.round(120 * scale)), w = layer.width / scale; g.drawImage(layer, (W - w) / 2, 78, w, layer.height / scale); }
  g.fillStyle = gold; g.font = `700 32px ${FONT}`; spaced(g, 'STAFF OF THE MONTH', cx, 250, 9);
  for (const sign of [-1, 1]) { g.fillStyle = gold; g.fillRect(sign < 0 ? 100 : 840, 238, 140, 2); star(g, cx + sign * 308, 239, 8, '#ffe39a', 3, 4); }
  g.save(); g.shadowColor = 'rgba(232,169,44,0.55)'; g.shadowBlur = 26; g.fillStyle = '#fff7e0'; g.font = `700 96px ${SERIF}`; g.fillText(input.month, cx, 350); g.restore();
  // Photo: laurel wreath, gold and white rings, and a gold seal.
  const leaf = g.createLinearGradient(cx - 330, cy - 330, cx + 330, cy + 330); leaf.addColorStop(0, '#ffe9a8'); leaf.addColorStop(0.5, '#e8a92c'); leaf.addColorStop(1, '#ffe39a');
  laurel(g, cx, cy, radius + 56, Math.PI * 0.62, Math.PI * 1.34, -1, leaf);
  laurel(g, cx, cy, radius + 56, Math.PI * 0.38, -Math.PI * 0.34, 1, leaf);
  g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40; g.shadowOffsetY = 16; g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, radius + 24, 0, Math.PI * 2); g.fill(); g.restore();
  g.fillStyle = '#0c1a2e'; g.beginPath(); g.arc(cx, cy, radius + 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, radius + 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, radius + 2, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.clip(); g.fillStyle = '#e8f1f6'; g.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  if (input.photo) {
    const base = Math.max((radius * 2) / input.photo.width, (radius * 2) / input.photo.height) * input.zoom, pw = input.photo.width * base, ph = input.photo.height * base;
    const px = cx - pw / 2 + input.moveX * Math.max(0, (pw - radius * 2) / 2), py = cy - ph / 2 + input.moveY * Math.max(0, (ph - radius * 2) / 2);
    g.drawImage(input.photo, px, py, pw, ph);
  } else { g.fillStyle = '#9bb5c7'; g.font = `600 36px ${FONT}`; g.fillText('Add a face photo', cx, cy + 12); }
  g.restore();
  const sx = cx + 184, sy = cy + 184;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 18; g.shadowOffsetY = 6; star(g, sx, sy, 66, gold, 59, 22); g.restore();
  g.fillStyle = '#0c1a2e'; g.beginPath(); g.arc(sx, sy, 46, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ffe39a'; g.lineWidth = 3; g.beginPath(); g.arc(sx, sy, 40, 0, Math.PI * 2); g.stroke(); star(g, sx, sy, 26, gold);
  // Name in serif, a gold flourish, the thank-you line.
  const name = input.name.trim() || 'Staff name', branch = input.branch.trim();
  let size = 80; const fit = (text: string) => { g.font = `700 ${size}px ${SERIF}`; return g.measureText(text).width <= 900; };
  while (size > 48 && !fit(name)) size -= 2;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14; g.shadowOffsetY = 4; g.fillStyle = '#fff7e0';
  const oneLine = fit(name);
  if (oneLine) g.fillText(name, cx, 1090);
  else { const words = name.split(' '), half = Math.ceil(words.length / 2); size = 58; g.font = `700 ${size}px ${SERIF}`; g.fillText(words.slice(0, half).join(' '), cx, 1062); g.fillText(words.slice(half).join(' '), cx, 1122); }
  g.restore();
  const lineY = oneLine ? 1122 : 1150;
  g.fillStyle = gold; g.fillRect(cx - 210, lineY, 170, 2); g.fillRect(cx + 40, lineY, 170, 2); star(g, cx, lineY + 1, 11, '#ffe39a', 4, 4);
  const quote = input.quote.trim();
  if (quote) {
    g.fillStyle = 'rgba(255,247,224,0.9)'; g.font = `italic 400 30px ${SERIF}`;
    const lines: string[] = []; let line = '';
    for (const word of quote.split(/\s+/)) { const test = line ? `${line} ${word}` : word; if (g.measureText(test).width > 840 && line) { lines.push(line); line = word; } else line = test; }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((text, index) => g.fillText(text, cx, lineY + 52 + index * 40));
  }
  // Clinic and branch on one line at the foot, between gold rules.
  g.fillStyle = gold; g.fillRect(120, 1254, W - 240, 2);
  g.fillStyle = gold; g.font = `700 30px ${FONT}`; spaced(g, `KLINIK ARA 24 JAM${branch ? `  ·  ${branch.toUpperCase()}` : ''}`, cx, 1296, 8);
}

// The part of the photo that shows inside the circle (same zoom and position as the poster), as a small square JPEG for the combined poster.
export function cropFace(photo: CanvasImageSource & { width: number; height: number }, zoom: number, moveX: number, moveY: number, size = 640) {
  const layer = document.createElement('canvas'); layer.width = size; layer.height = size;
  const g = layer.getContext('2d'); if (!g) return '';
  const half = size / 2, base = Math.max(size / photo.width, size / photo.height) * zoom, pw = photo.width * base, ph = photo.height * base;
  g.fillStyle = '#e8f1f6'; g.fillRect(0, 0, size, size);
  g.drawImage(photo, half - pw / 2 + moveX * Math.max(0, (pw - size) / 2), half - ph / 2 + moveY * Math.max(0, (ph - size) / 2), pw, ph);
  return layer.toDataURL('image/jpeg', 0.85);
}
