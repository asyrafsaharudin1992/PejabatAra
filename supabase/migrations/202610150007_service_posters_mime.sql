-- Posters are shrunk to WebP (or JPEG) in the browser before upload, so the
-- bucket must accept those types as well as the original PNGs.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'service-posters';
