import { officeAccess } from './_office-db.js';

async function payload(db: any, isAdmin: boolean) {
  const [{ data: folders, error: folderError }, { data: services, error: serviceError }, { data: faqs, error: faqError }] = await Promise.all([
    db.from('service_folders').select('*').eq('active', true).order('name'), db.from('service_catalog_items').select('*').eq('active', true).order('created_at'), db.from('service_faqs').select('*').eq('active', true).order('sort_order').order('created_at'),
  ]);
  if (folderError || serviceError || faqError) throw folderError || serviceError || faqError;
  return { folders: folders || [], services: services || [], faqs: faqs || [], isAdmin };
}

export async function serviceCatalogHandler(req: any, res: any) {
  const { db, profile } = await officeAccess(req, false, 'ca'); const isAdmin = profile.role === 'super_admin';
  if (req.method === 'GET') return res.status(200).json(await payload(db, isAdmin));
  if (req.method !== 'PUT' || !isAdmin) return res.status(403).json({ error: 'Only System Admin can manage services.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; const now = new Date().toISOString();
  if (body.action === 'create_folder') { const { error } = await db.from('service_folders').insert({ name: body.name, description: body.description || '' }); if (error) throw error; }
  else if (body.action === 'delete_folder') {
    if (!body.id) return res.status(400).json({ error: 'A folder id is required.' });
    const { error: servicesError } = await db.from('service_catalog_items').update({ folder_id: null, updated_at: now }).eq('folder_id', body.id);
    if (servicesError) throw servicesError;
    const { error } = await db.from('service_folders').update({ active: false }).eq('id', body.id);
    if (error) throw error;
  }
  else if (body.action === 'create_service') {
    const file = body.file; if (!body.title || !file?.base64 || !file?.name) return res.status(400).json({ error: 'A service title and poster are required.' });
    const ext = file.name.toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1]; if (!ext) return res.status(400).json({ error: 'Use a PNG, JPG or WebP poster.' });
    const path = `uploads/${crypto.randomUUID()}.${ext}`; const bytes = Buffer.from(file.base64, 'base64'); if (bytes.byteLength > 5 * 1024 * 1024) return res.status(400).json({ error: 'Poster must be 5MB or smaller.' });
    const { error: uploadError } = await db.storage.from('service-posters').upload(path, bytes, { contentType: file.type || 'image/png', upsert: false }); if (uploadError) throw uploadError;
    const { error } = await db.from('service_catalog_items').insert({ folder_id: body.folderId || null, storage_path: path, title: body.title, summary: body.summary || '', tags: body.tags || '' }); if (error) throw error;
  } else if (body.action === 'update_service') { const { error } = await db.from('service_catalog_items').update({ title: body.title, summary: body.summary || '', tags: body.tags || '', folder_id: body.folderId || null, updated_at: now }).eq('id', body.id); if (error) throw error; }
  else if (body.action === 'delete_service') { const { error } = await db.from('service_catalog_items').update({ active: false, updated_at: now }).eq('id', body.id); if (error) throw error; }
  else if (body.action === 'create_faq') { const { error } = await db.from('service_faqs').insert({ question: body.question, answer: body.answer, service_id: body.serviceId || null, folder_id: body.folderId || null, sort_order: body.sortOrder || 0 }); if (error) throw error; }
  else if (body.action === 'delete_faq') { const { error } = await db.from('service_faqs').update({ active: false }).eq('id', body.id); if (error) throw error; }
  else return res.status(400).json({ error: 'Unknown service action.' });
  return res.status(200).json(await payload(db, true));
}
