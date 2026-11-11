export const W = 1080, H = 1350;

export type PosterInput = { name: string; branch: string; quote: string; month: string; photo: CanvasImageSource & { width: number; height: number } | null; logo: (CanvasImageSource & { width: number; height: number }) | null; zoom: number; moveX: number; moveY: number };

const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
function star(g: CanvasRenderingContext2D, x: number, y: number, outer: number, color: string) {
  g.fillStyle = color; g.beginPath();
  for (let point = 0; point < 10; point++) { const radius = point % 2 ? outer * 0.42 : outer, angle = -Math.PI / 2 + (point * Math.PI) / 5; g.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle)); }
  g.closePath(); g.fill();
}

// The logo file is dark on white: turn the dark parts into white and the white background into nothing.
function whiteLogo(logo: CanvasImageSource & { width: number; height: number }, size: number) {
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

export function drawPoster(canvas: HTMLCanvasElement, input: PosterInput) {
  const g = canvas.getContext('2d'); if (!g) return;
  canvas.width = W; canvas.height = H;
  const cx = W / 2, cy = 700, radius = 250;
  // Background: deep navy to ARA blue, light rays and rings behind the photo.
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#101c30'); bg.addColorStop(0.5, '#1b3150'); bg.addColorStop(1, '#0b587b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save(); g.translate(cx, cy);
  for (let ray = 0; ray < 18; ray++) { const angle = (ray * Math.PI * 2) / 18; g.fillStyle = 'rgba(112,216,250,0.07)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1100, angle, angle + Math.PI / 18); g.closePath(); g.fill(); }
  g.restore();
  const glow = g.createRadialGradient(cx, cy, 120, cx, cy, 640); glow.addColorStop(0, 'rgba(112,216,250,0.45)'); glow.addColorStop(1, 'rgba(112,216,250,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.lineWidth = 3; for (const [ring, alpha] of [[345, 0.35], [405, 0.22], [475, 0.14]]) { g.strokeStyle = `rgba(255,209,102,${alpha})`; g.beginPath(); g.arc(cx, cy, ring, 0, Math.PI * 2); g.stroke(); }
  // Confetti and stars.
  const colours = ['#ffd166', '#ffffff', '#70d8fa', '#ff8fb8'];
  [[80, 330, 0.5], [160, 470, 1.2], [60, 600, 2.1], [130, 760, 0.3], [75, 930, 1.7], [180, 1080, 0.9], [1000, 340, 1.4], [920, 470, 0.2], [1020, 620, 2.4], [950, 780, 1.1], [1005, 940, 0.6], [900, 1080, 1.9], [250, 330, 2.7], [830, 330, 0.8], [40, 450, 1.5], [1040, 480, 2.2]].forEach(([x, y, turn], index) => { g.save(); g.translate(x, y); g.rotate(turn); g.fillStyle = colours[index % colours.length]; g.globalAlpha = 0.9; g.beginPath(); g.roundRect(-9, -4, 18, 8, 3); g.fill(); g.restore(); });
  for (const [x, y, size] of [[80, 150, 22], [1000, 160, 26], [60, 700, 16], [1030, 760, 18], [140, 1000, 14], [940, 1000, 16], [880, 400, 11], [200, 410, 11]]) star(g, x, y, size, '#ffd166');
  g.textAlign = 'center';
  // White logo straight on the background.
  if (input.logo) { const layer = whiteLogo(input.logo, 150); g.drawImage(layer, (W - layer.width) / 2, 34); }
  // Gold ribbon with folded tails, then the month.
  const gold = g.createLinearGradient(0, 205, 0, 295); gold.addColorStop(0, '#ffe39a'); gold.addColorStop(1, '#f0aa2e');
  g.fillStyle = '#c98a14'; g.beginPath(); g.moveTo(110, 232); g.lineTo(200, 232); g.lineTo(200, 286); g.lineTo(110, 286); g.lineTo(138, 259); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(970, 232); g.lineTo(880, 232); g.lineTo(880, 286); g.lineTo(970, 286); g.lineTo(942, 259); g.closePath(); g.fill();
  g.save(); g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 16; g.shadowOffsetY = 6; g.fillStyle = gold; g.beginPath(); g.roundRect(160, 208, 760, 84, 14); g.fill(); g.restore();
  g.fillStyle = '#14233b'; g.font = `800 40px ${FONT}`; g.fillText('S T A F F   O F   T H E   M O N T H', W / 2, 264);
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 14; g.shadowOffsetY = 4; g.fillStyle = '#ffffff'; g.font = `800 100px ${FONT}`; g.fillText(input.month, W / 2, 396); g.restore();
  // Photo: white ring, gold ring, and a star badge.
  const ringGold = g.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius); ringGold.addColorStop(0, '#ffe39a'); ringGold.addColorStop(0.5, '#f0aa2e'); ringGold.addColorStop(1, '#ffe39a');
  g.save(); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 44; g.shadowOffsetY = 16; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, radius + 32, 0, Math.PI * 2); g.fill(); g.restore();
  g.fillStyle = ringGold; g.beginPath(); g.arc(cx, cy, radius + 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, radius + 4, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.clip(); g.fillStyle = '#e8f1f6'; g.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  if (input.photo) {
    const base = Math.max((radius * 2) / input.photo.width, (radius * 2) / input.photo.height) * input.zoom, pw = input.photo.width * base, ph = input.photo.height * base;
    const px = cx - pw / 2 + input.moveX * Math.max(0, (pw - radius * 2) / 2), py = cy - ph / 2 + input.moveY * Math.max(0, (ph - radius * 2) / 2);
    g.drawImage(input.photo, px, py, pw, ph);
  } else { g.fillStyle = '#9bb5c7'; g.font = `600 36px ${FONT}`; g.fillText('Add a face photo', cx, cy + 12); }
  g.restore();
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 16; g.shadowOffsetY = 6; g.fillStyle = ringGold; g.beginPath(); g.arc(cx + 190, cy + 190, 56, 0, Math.PI * 2); g.fill(); g.restore();
  g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.arc(cx + 190, cy + 190, 56, 0, Math.PI * 2); g.stroke(); star(g, cx + 190, cy + 190, 32, '#14233b');
  // Name straight on the background: it shrinks to fit one line, or two when long.
  const name = input.name.trim() || 'Staff name', branch = input.branch.trim();
  let size = 74; const fit = (text: string) => { g.font = `800 ${size}px ${FONT}`; return g.measureText(text).width <= 940; };
  while (size > 46 && !fit(name)) size -= 2;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12; g.shadowOffsetY = 4; g.fillStyle = '#ffffff';
  const oneLine = fit(name);
  if (oneLine) g.fillText(name, W / 2, 1072);
  else { const words = name.split(' '), half = Math.ceil(words.length / 2); size = 56; g.font = `800 ${size}px ${FONT}`; g.fillText(words.slice(0, half).join(' '), W / 2, 1050); g.fillText(words.slice(half).join(' '), W / 2, 1110); }
  g.restore();
  // Thank-you line under the name, wrapped to the width of the poster.
  const quote = input.quote.trim();
  if (quote) {
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = `italic 600 31px ${FONT}`;
    const lines: string[] = []; let line = '';
    for (const word of quote.split(/\s+/)) { const test = line ? `${line} ${word}` : word; if (g.measureText(test).width > 860 && line) { lines.push(line); line = word; } else line = test; }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((text, index) => g.fillText(text, W / 2, (oneLine ? 1132 : 1166) + index * 42));
  }
  // Dark band at the bottom with the clinic and the branch.
  g.fillStyle = 'rgba(10,20,36,0.62)'; g.beginPath(); g.moveTo(0, 1232); g.quadraticCurveTo(W / 2, 1200, W, 1232); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  g.strokeStyle = '#ffd166'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 1232); g.quadraticCurveTo(W / 2, 1200, W, 1232); g.stroke();
  g.fillStyle = '#ffffff'; g.font = `800 42px ${FONT}`; g.fillText('K L I N I K   A R A   2 4   J A M', W / 2, branch ? 1286 : 1304);
  if (branch) { g.fillStyle = '#ffd166'; g.font = `700 34px ${FONT}`; g.fillText(branch.toUpperCase(), W / 2, 1330); }
}
