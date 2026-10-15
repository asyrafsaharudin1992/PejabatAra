import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Uploads the Print Forms PDFs to Storage and saves the form list to portal_state.
// An existing list is kept (admins may have edited it) unless run with --replace.
config({ path: '.env.local' });
config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before uploading print forms.');

const bucket = 'print-forms';
const directory = resolve('scripts/print-forms/files');
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } });

const { data: existingBucket, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (bucketLookupError && !bucketLookupError.message.toLowerCase().includes('not found')) throw bucketLookupError;
if (!existingBucket) {
  const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: '5MB', allowedMimeTypes: ['application/pdf'] });
  if (error) throw error;
}

const { data: branch, error: branchError } = await supabase.from('branches').select('id').eq('name', 'AraSpace Clinical Assistants').single();
if (branchError) throw branchError;
const { data: existing, error: existingError } = await supabase.from('portal_state').select('state_key').eq('branch_id', branch.id).eq('state_key', 'ca_print_forms').maybeSingle();
if (existingError) throw existingError;
if (existing && !process.argv.includes('--replace')) {
  console.log('Print form list already saved; kept it. Run with --replace to overwrite.');
} else {
  // Upload only when the list is saved, so a form an admin deleted is not put back in Storage.
  const payload = JSON.parse(await readFile(resolve('scripts/print-forms/forms.json'), 'utf8'));
  // PDFs are cached by browsers for a year, so each computer downloads a form only once.
  for (const form of payload.forms) {
    const bytes = await readFile(resolve(directory, form.file));
    const { error } = await supabase.storage.from(bucket).upload(form.file, bytes, { contentType: 'application/pdf', cacheControl: '31536000', upsert: true });
    if (error) throw error;
    form.size = bytes.byteLength;
    console.log(`Uploaded ${form.file}`);
  }
  // portal_state records who saved each row; credit the first System Admin.
  const { data: admin, error: adminError } = await supabase.from('profiles').select('id').eq('role', 'super_admin').eq('status', 'active').limit(1).single();
  if (adminError) throw adminError;
  const { error } = await supabase.from('portal_state').upsert({ branch_id: branch.id, state_key: 'ca_print_forms', payload, updated_by: admin.id }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  console.log(`Saved ${payload.forms.length} print forms.`);
}
