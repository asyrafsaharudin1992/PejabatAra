import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

config({ path: '.env.local' });
config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before uploading service posters.');

const bucket = 'service-posters';
const directory = resolve('public/services');
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } });

const { data: existingBucket, error: bucketLookupError } = await supabase.storage.getBucket(bucket);
if (bucketLookupError && !bucketLookupError.message.toLowerCase().includes('not found')) throw bucketLookupError;
if (!existingBucket) {
  const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: '5MB', allowedMimeTypes: ['image/png'] });
  if (error) throw error;
}

const posters = (await readdir(directory)).filter((file) => /^\d+\.png$/.test(file)).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
for (const poster of posters) {
  const { error } = await supabase.storage.from(bucket).upload(poster, await readFile(resolve(directory, poster)), { contentType: 'image/png', cacheControl: '31536000', upsert: true });
  if (error) throw error;
  console.log(`Uploaded ${poster}`);
}

console.log(`Service posters are available in Supabase Storage bucket: ${bucket}`);
