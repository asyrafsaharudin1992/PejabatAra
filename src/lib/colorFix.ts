// html2canvas cannot read the modern colour functions (oklch, oklab, color-mix and color(srgb ...)) that the page's styles resolve to. Before a report is drawn, the copy that html2canvas
// works on gets those colours rewritten as plain rgb() values, so Save as PDF and Download all can draw every report.
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const encode = (value: number) => { const v = clamp(value); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
function oklabToRgb(L: number, a: number, b: number, alpha: number) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const to = (value: number) => Math.round(encode(value) * 255);
  return alpha < 1 ? `rgba(${to(r)}, ${to(g)}, ${to(bl)}, ${Math.round(alpha * 1000) / 1000})` : `rgb(${to(r)}, ${to(g)}, ${to(bl)})`;
}
const number = (token: string, scale = 1) => { const t = token.trim(); if (t === 'none') return 0; if (t.endsWith('%')) return (parseFloat(t) / 100) * scale; if (t.endsWith('deg')) return parseFloat(t); return parseFloat(t); };
function convertOne(kind: string, body: string): string {
  const [main, alphaPart] = body.split('/'); const parts = main.trim().split(/[\s,]+/).filter(Boolean);
  const alpha = alphaPart ? clamp(number(alphaPart, 1)) : 1;
  if (kind === 'oklch') { const L = number(parts[0], 1), C = number(parts[1], 0.4), h = (number(parts[2], 360) * Math.PI) / 180; return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h), alpha); }
  if (kind === 'oklab') return oklabToRgb(number(parts[0], 1), number(parts[1], 0.4), number(parts[2], 0.4), alpha);
  if (kind === 'color') { const space = parts[0]; if (space === 'srgb') { const to = (token: string) => Math.round(clamp(number(token, 1)) * 255); return alpha < 1 ? `rgba(${to(parts[1])}, ${to(parts[2])}, ${to(parts[3])}, ${alpha})` : `rgb(${to(parts[1])}, ${to(parts[2])}, ${to(parts[3])})`; } }
  return 'rgb(0, 0, 0)';
}
const PATTERN = /(oklch|oklab|color)\(([^()]*)\)/g;
export const rewriteColors = (value: string) => value.replace(PATTERN, (match, kind: string, body: string) => (kind === 'color' && !/^\s*srgb/.test(body) ? match : convertOne(kind, body)));
const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color', 'box-shadow', 'text-shadow', 'fill', 'stroke', 'caret-color', 'column-rule-color'];
export function fixUnsupportedColors(root: HTMLElement) {
  const view = root.ownerDocument.defaultView; if (!view) return;
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const node of nodes) {
    const computed = view.getComputedStyle(node);
    for (const property of PROPS) {
      const value = computed.getPropertyValue(property);
      if (value && /oklch|oklab|color\(|color-mix/.test(value)) node.style.setProperty(property, rewriteColors(value), 'important');
    }
  }
}
