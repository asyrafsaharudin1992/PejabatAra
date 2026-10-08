import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { existsSync, readFileSync } from 'node:fs';
import { officeAccess } from './_office-db.js';

const spreadsheetId = () => process.env.TEAMARA_SHEET_ID || '1ZgsXMJ5us4aMJQsGGr40tE18Dw2r2Cx0qaW_euy_kOE';
let cache: { at: number; members: TeamAraMember[]; family: Record<string, string>[]; vendors: Record<string, string>[] } | null = null;
type TeamAraMember = { name: string; ic: string; phone: string; memberId: string; term: string; expiry: string; branch: string; active: boolean };

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, '\n') };
  const source = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!source) throw new Error('TeamAra Google Sheet credentials are not configured.');
  const raw = existsSync(source) ? readFileSync(source, 'utf8') : source;
  const parsed = JSON.parse(raw);
  return { client_email: parsed.client_email, private_key: String(parsed.private_key).replace(/\\n/g, '\n') };
}

async function sheetRows(sheets: any, title: string, range = 'A:Z') {
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId(), range: `'${title}'!${range}` });
  return result.data.values || [];
}

const text = (value: unknown) => String(value ?? '').trim();
const key = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
const objectRows = (rows: string[][]) => {
  const [headers, ...values] = rows;
  return values.filter((row) => row.some((cell) => text(cell))).map((row) => Object.fromEntries(headers.map((header, index) => [text(header) || `Column ${index + 1}`, text(row[index])]))) as Record<string, string>[];
};
const dateValue = (value: string) => { const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/); if (!match) return null; const date = new Date(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]) - 1, Number(match[1])); return Number.isNaN(date.getTime()) ? null : date; };

export async function teamaraHandler(req: any, res: any) {
  try {
    const { profile } = await officeAccess(req, false, 'ca');
    const isAdmin = profile.role === 'super_admin';
    const q = text(req.query?.q).toLowerCase();
    const auth = new GoogleAuth({ credentials: credentials(), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });
    if (!cache || Date.now() - cache.at > 60_000) {
      const metadata = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId(), fields: 'sheets.properties.title' });
      const titles = (metadata.data.sheets || []).map((sheet: any) => sheet.properties?.title).filter(Boolean);
      const memberSheet = titles.find((title: string) => title.toLowerCase() === 'teamara semua aktif') || titles.find((title: string) => title.toLowerCase() === 'user') || titles[0] || 'User';
      const raw = await sheetRows(sheets, memberSheet);
      // TeamAra's current source keeps its branch value in column I (zero-based
      // index 8). Do not infer this from a header: the sheet contains other
      // header-like labels that can make the dashboard read the wrong column.
      const branchIndex = 8;
      // The active tab currently exposes A:H, while the legacy branch column is
      // still present in Sheet16. Build a small lookup so the first tab remains
      // the source of truth and branch filters continue to work.
      const branchMap = new Map<string, string>();
      if (branchIndex < 0) {
        const branchRows = await sheetRows(sheets, 'Sheet16');
        for (const row of branchRows) {
          const branches = [text(row[8]), text(row[18])].filter((value) => /^(KJ|SK|SY)(\s*&\s*(KJ|SK|SY))?$/i.test(value));
          const branch = branches[0] || '';
          if (!branch) continue;
          [row[0], row[1], row[2], row[3], row[10], row[11], row[14], row[15]].map(key).filter(Boolean).forEach((value) => branchMap.set(value, branch.toUpperCase()));
        }
      }
      const dataRows = raw.slice(2).reverse();
      const members = dataRows.filter((row) => text(row[0])).map((row) => { const expiry = text(row[5]); const date = dateValue(expiry); const name = text(row[0]); const ic = text(row[1]); const phone = text(row[2]); const memberId = text(row[3]); const branch = branchIndex >= 0 ? text(row[branchIndex]) : (branchMap.get(key(name)) || branchMap.get(key(ic)) || branchMap.get(key(phone)) || branchMap.get(key(memberId)) || ''); return { name, ic, phone, memberId, term: text(row[4]), expiry, branch, active: !date || date >= new Date(new Date().setHours(0, 0, 0, 0)) }; });
      const familyRows = await sheetRows(sheets, 'KELUARGA TEAMARA');
      const vendorRows = await sheetRows(sheets, 'VENDOR TEAMARA');
      cache = { at: Date.now(), members, family: objectRows(familyRows), vendors: objectRows(vendorRows) };
    }
    const numericQuery = /^\d+$/.test(q.replace(/\s+/g, ''));
    const members = cache.members.filter((member) => {
      if (!q) return true;
      if (numericQuery) return `${member.ic} ${member.memberId}`.toLowerCase().includes(q);
      const name = member.name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      return name === q || name.split(' ').includes(q) || name.includes(` ${q} `);
    });
    return res.status(200).json({ members, family: cache.family, vendors: cache.vendors, isAdmin, cachedAt: cache.at });
  } catch (error: any) { return res.status(error.status || 400).json({ error: error.message || 'Unable to load TeamAra data.' }); }
}

// Card and birthday WhatsApp templates, plus the card template and birthday poster image paths. Everyone with TeamAra access reads them;
// only System Admin can change them. Missing rows mean "use the built-in default".
export async function teamaraMessagesHandler(req: any, res: any) {
  try {
    const { db, user, profile } = await officeAccess(req, false, 'ca');
    const isAdmin = profile.role === 'super_admin';
    if (req.method === 'PUT') {
      if (!isAdmin) return res.status(403).json({ error: 'Only System Admin can edit TeamAra messages.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (!['card', 'birthday', 'card_template', 'birthday_poster'].includes(body.key) || typeof body.body !== 'string' || !body.body.trim()) return res.status(400).json({ error: 'A message type and text are required.' });
      const imageFolder = ({ card_template: 'card', birthday_poster: 'birthday' } as Record<string, string>)[body.key];
      if (imageFolder && !new RegExp(`^${imageFolder}/[\\w-]+\\.(png|jpe?g)$`).test(body.body)) return res.status(400).json({ error: 'Invalid image path.' });
      const { data: previous } = await db.from('teamara_messages').select('body').eq('key', body.key).maybeSingle();
      const { error } = await db.from('teamara_messages').upsert({ key: body.key, body: body.body, updated_at: new Date().toISOString(), updated_by: user.id });
      if (error) throw error;
      // Replaced template images are no longer referenced; the browser can't delete them, so do it here.
      if (imageFolder && previous?.body && previous.body !== body.body) await db.storage.from('teamara-templates').remove([previous.body]);
    } else if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const { data, error } = await db.from('teamara_messages').select('key,body');
    if (error) throw error;
    return res.status(200).json({ messages: Object.fromEntries((data || []).map((row: any) => [row.key, row.body])) });
  } catch (error: any) { return res.status(error.status || 400).json({ error: error.message || 'Unable to load TeamAra messages.' }); }
}
