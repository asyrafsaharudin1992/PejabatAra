import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Uploads the Panduan Prosedur Klinikal photos to Storage and saves the procedure
// list to portal_state. An existing list is kept (admins may have edited it)
// unless the script is run with --replace.
config({ path: '.env.local' });
config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before uploading procedures.');

const bucket = 'procedure-photos';
const directory = resolve('scripts/procedures/photos');
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } });

const { data: existingBucket, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (bucketLookupError && !bucketLookupError.message.toLowerCase().includes('not found')) throw bucketLookupError;
if (!existingBucket) {
  const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: '2MB', allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'] });
  if (error) throw error;
}

// Photos are cached by browsers for a year, so staff download each one only once.
for (const photo of (await readdir(directory)).filter((file) => file.endsWith('.webp')).sort()) {
  const { error } = await supabase.storage.from(bucket).upload(photo, await readFile(resolve(directory, photo)), { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
  if (error) throw error;
  console.log(`Uploaded ${photo}`);
}

const { data: branch, error: branchError } = await supabase.from('branches').select('id').eq('name', 'AraSpace Clinical Assistants').single();
if (branchError) throw branchError;
const { data: existing, error: existingError } = await supabase.from('portal_state').select('state_key').eq('branch_id', branch.id).eq('state_key', 'ca_procedures').maybeSingle();
if (existingError) throw existingError;
if (existing && !process.argv.includes('--replace')) {
  console.log('Procedure list already saved; kept it. Run with --replace to overwrite.');
} else {
  const payload = JSON.parse(await readFile(resolve('scripts/procedures/procedures.json'), 'utf8'));
  // portal_state records who saved each row; credit the first System Admin.
  const { data: admin, error: adminError } = await supabase.from('profiles').select('id').eq('role', 'super_admin').eq('status', 'active').limit(1).single();
  if (adminError) throw adminError;
  const { error } = await supabase.from('portal_state').upsert({ branch_id: branch.id, state_key: 'ca_procedures', payload, updated_by: admin.id }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  console.log(`Saved ${payload.procedures.length} procedures.`);
}
