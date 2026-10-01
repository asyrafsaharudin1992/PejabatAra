import type { Request, Response } from 'express';

const folderId = '1nvJW1koDXL0dqfeCkKy1K-K0BFmEaVhr';
export type DriveGuide = { id: string; name: string; url: string };
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Read the existing public folder only. Never change sharing permissions.
// Fail closed if Google changes its folder markup; do not return an empty sync.
export function parsePanelFolder(html: string): DriveGuide[] {
  const files = new Map<string, DriveGuide>();
  for (const match of html.matchAll(/<tr\b[^>]*data-id="([\w-]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const label = match[2].match(/aria-label="([^"]+\.pdf) PDF(?: Shared)?"/i);
    if (label) files.set(match[1], { id: match[1], name: decode(label[1]), url: `https://drive.google.com/file/d/${match[1]}/preview` });
  }
  if (!files.size) throw new Error('The shared folder could not be read. Existing guides have been kept.');
  return [...files.values()];
}

let cached: { files: DriveGuide[]; checkedAt: string } | undefined;
let inFlight: Promise<NonNullable<typeof cached>> | undefined;
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!cached || Date.now() - Date.parse(cached.checkedAt) > 60_000) {
      inFlight ??= (async () => {
        const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error('Google Drive is temporarily unavailable.');
        return { files: parsePanelFolder(await response.text()), checkedAt: new Date().toISOString() };
      })();
      try { cached = await inFlight; } finally { inFlight = undefined; }
    }
    return res.json(cached);
  } catch {
    return res.status(502).json({ error: 'Unable to check Drive. Existing guides are kept; select Check now to retry.' });
  }
}
