import { FONT, laurel, SERIF, spaced, star, whiteLogo } from './sotmPoster';

// Staff of the Month poster for both branches together, 1080 x 1080 (an Instagram square).
export const COMBINED_SIZE = 1080;
// Contact details at the foot of the poster, as on the earlier Staff of the Month poster.
const PHONES = ['0182194392 (Kajang)', '011-61528824 (Seri Kembangan)'];
const WEBSITE = 'www.hsohealthcare.com';
export type Winner = { branch: string; name: string; face: HTMLImageElement | null };
export type CombinedInput = { month: string; left: Winner; right: Winner; logo: (CanvasImageSource & { width: number; height: number }) | null };

export function drawCombined(canvas: HTMLCanvasElement, input: CombinedInput, scale = 1) {
  const g = canvas.getContext('2d'); if (!g) return;
  const S = COMBINED_SIZE; canvas.width = Math.round(S * scale); canvas.height = Math.round(S * scale); g.scale(scale, scale);
  const gold = g.createLinearGradient(0, 0, S, S); gold.addColorStop(0, '#b9770e'); gold.addColorStop(0.25, '#ffe39a'); gold.addColorStop(0.5, '#e8a92c'); gold.addColorStop(0.75, '#ffe9a8'); gold.addColorStop(1, '#b9770e');
  const bg = g.createRadialGradient(S / 2, 470, 80, S / 2, 520, 900); bg.addColorStop(0, '#16304f'); bg.addColorStop(0.55, '#0c1a2e'); bg.addColorStop(1, '#050b15'); g.fillStyle = bg; g.fillRect(0, 0, S, S);
  for (const x of [290, 790]) { const glow = g.createRadialGradient(x, 500, 80, x, 500, 380); glow.addColorStop(0, 'rgba(24,130,170,0.5)'); glow.addColorStop(1, 'rgba(24,130,170,0)'); g.fillStyle = glow; g.fillRect(0, 0, S, S); }
  let seed = 5; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let dot = 0; dot < 80; dot++) { const x = random() * S, y = random() * 880; g.globalAlpha = 0.15 + random() * 0.6; g.fillStyle = '#ffe39a'; g.beginPath(); g.arc(x, y, 0.8 + random() * 2.2, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  for (const [x, y, size] of [[90, 200, 14], [990, 230, 18]]) star(g, x, y, size, '#ffe39a', size * 0.18, 4);
  g.strokeStyle = gold; g.lineWidth = 4; g.strokeRect(24, 24, S - 48, S - 48);
  g.strokeStyle = 'rgba(255,227,154,0.45)'; g.lineWidth = 1.5; g.strokeRect(38, 38, S - 76, S - 76);
  for (const [x, y] of [[24, 24], [S - 24, 24], [24, S - 24], [S - 24, S - 24]]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#0c1a2e'; g.fillRect(-12, -12, 24, 24); g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(-12, -12, 24, 24); g.restore(); }
  g.textAlign = 'center';
  // Title and month.
  g.fillStyle = gold; g.font = `700 34px ${FONT}`; spaced(g, 'STAFF OF THE MONTH', S / 2, 108, 10);
  for (const sign of [-1, 1]) { g.fillStyle = gold; g.fillRect(sign < 0 ? 90 : 850, 96, 140, 2); star(g, S / 2 + sign * 320, 97, 8, '#ffe39a', 3, 4); }
  g.save(); g.shadowColor = 'rgba(232,169,44,0.55)'; g.shadowBlur = 26; g.fillStyle = '#fff7e0'; g.font = `700 88px ${SERIF}`; g.fillText(input.month, S / 2, 202); g.restore();
  // Two winners, each in a laurel wreath with the first name on a seal.
  const leaf = g.createLinearGradient(0, 300, S, 720); leaf.addColorStop(0, '#ffe9a8'); leaf.addColorStop(0.5, '#e8a92c'); leaf.addColorStop(1, '#ffe39a');
  // Both names use the same size: the largest that fits the longer one on a line, or two lines each when it is too long.
  const widest = 470; let common = 36;
  const fits = (text: string, size: number) => { g.font = `700 ${size}px ${SERIF}`; return g.measureText(text).width <= widest; };
  while (common > 24 && !(fits(input.left.name.trim(), common) && fits(input.right.name.trim(), common))) common -= 1;
  const twoLines = !(fits(input.left.name.trim(), common) && fits(input.right.name.trim(), common));
  const winner = (who: Winner, cx: number) => {
    const cy = 500, radius = 178;
    laurel(g, cx, cy, radius + 48, Math.PI * 0.62, Math.PI * 1.34, -1, leaf, 0.85); laurel(g, cx, cy, radius + 48, Math.PI * 0.38, -Math.PI * 0.34, 1, leaf, 0.85);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, radius + 20, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = '#0c1a2e'; g.beginPath(); g.arc(cx, cy, radius + 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, radius + 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, radius + 2, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.clip(); g.fillStyle = '#e8f1f6'; g.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    if (who.face) g.drawImage(who.face, cx - radius, cy - radius, radius * 2, radius * 2);
    g.restore();
    const sx = cx + 130, sy = cy + 130;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 14; g.shadowOffsetY = 5; star(g, sx, sy, 56, gold, 50, 22); g.restore();
    g.fillStyle = '#0c1a2e'; g.beginPath(); g.arc(sx, sy, 40, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ffe39a'; g.lineWidth = 2.5; g.beginPath(); g.arc(sx, sy, 35, 0, Math.PI * 2); g.stroke(); star(g, sx, sy, 24, gold);
    // Branch and full name under the wreath.
    g.fillStyle = gold; g.font = `700 32px ${FONT}`; spaced(g, who.branch.toUpperCase(), cx, 770, 6);
    const full = who.name.trim();
    g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10; g.fillStyle = '#fff7e0';
    if (!twoLines) { g.font = `700 ${common}px ${SERIF}`; g.fillText(full, cx, 818); }
    else { const words = full.split(' '), half = Math.ceil(words.length / 2); g.font = `700 30px ${SERIF}`; g.fillText(words.slice(0, half).join(' '), cx, 812); g.fillText(words.slice(half).join(' '), cx, 848); }
    g.restore();
  };
  winner(input.left, 290); winner(input.right, 790);
  // Foot: logo, clinic, both phone numbers and the website.
  g.fillStyle = 'rgba(8,16,30,0.75)'; g.fillRect(40, 880, S - 80, 160);
  g.fillStyle = gold; g.fillRect(40, 880, S - 80, 2);
  if (input.logo) { const layer = whiteLogo(input.logo, Math.round(90 * scale)); g.drawImage(layer, 70, 915, layer.width / scale, layer.height / scale); }
  g.textAlign = 'left'; g.fillStyle = '#fff7e0'; g.font = `800 28px ${FONT}`; g.fillText('KLINIK ARA 24 JAM', 180, 950);
  g.fillStyle = gold; g.font = `600 20px ${FONT}`; g.fillText('KAJANG | SERI KEMBANGAN', 180, 982);
  g.fillStyle = '#fff7e0'; g.font = `600 24px ${FONT}`; PHONES.forEach((line, index) => g.fillText(`☎  ${line}`, 520, 944 + index * 36));
  g.fillStyle = gold; g.font = `700 22px ${FONT}`; g.fillText(WEBSITE, 520, 1016);
}
