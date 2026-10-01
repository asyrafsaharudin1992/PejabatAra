export default function handler(_req: any, res: any) {
  return res.status(410).json({ error: 'Legacy staff-settings has been retired. Use Supabase authentication and System Admin.' });
}
