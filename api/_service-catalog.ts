import { officeAccess } from './_office-db.js';

async function payload(db: any, isAdmin: boolean) {
  const [{ data: folders, error: folderError }, { data: services, error: serviceError }, { data: faqs, error: faqError }] = await Promise.all([
    db.from('service_folders').select('*').eq('active', true).order('name'), db.from('service_catalog_items').select('*').eq('active', true).order('sort_order').order('created_at'), db.from('service_faqs').select('*').eq('active', true).order('sort_order').order('created_at'),
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
  else if (body.action === 'rename_folder') {
    const name = String(body.name || '').trim(); if (!body.id || !name) return res.status(400).json({ error: 'A folder name is required.' });
    const { error } = await db.from('service_folders').update({ name }).eq('id', body.id); if (error) throw error;
  }
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
  } else if (body.action === 'update_service') {
    // A service can have several posters (rows sharing a title); `ids` updates them together.
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [body.id];
    const { error } = await db.from('service_catalog_items').update({ title: body.title, summary: body.summary || '', tags: body.tags || '', folder_id: body.folderId || null, updated_at: now }).in('id', ids); if (error) throw error;
  }
  else if (body.action === 'move_services') {
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []; if (!ids.length) return res.status(400).json({ error: 'Pick at least one service to move.' });
    const { error } = await db.from('service_catalog_items').update({ folder_id: body.folderId || null, updated_at: now }).in('id', ids); if (error) throw error;
  }
  else if (body.action === 'reorder_services') {
    // `titles` is one folder's services in their new order; every poster of a service takes its position.
    const titles: string[] = Array.isArray(body.titles) ? body.titles.filter(Boolean) : []; if (!titles.length) return res.status(400).json({ error: 'Nothing to reorder.' });
    const results = await Promise.all(titles.map((title, index) => db.from('service_catalog_items').update({ sort_order: index, updated_at: now }).eq('title', title).eq('active', true)));
    const failed = results.find((result: any) => result.error); if (failed) throw failed.error;
  }
  else if (body.action === 'delete_service') {
    // `id` deletes one poster, `ids` a whole service. Rows and poster files are removed for good.
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [body.id]; if (!ids.length || ids.some((id) => !id)) return res.status(400).json({ error: 'A service id is required.' });
    const { data: rows, error: rowsError } = await db.from('service_catalog_items').select('id, title, storage_path').in('id', ids); if (rowsError) throw rowsError;
    if (!rows?.length) return res.status(404).json({ error: 'That poster no longer exists.' });
    if (!Array.isArray(body.ids)) {
      // FAQs cascade with their row, so hand them to a remaining poster of the same service first.
      const { data: sibling, error: siblingError } = await db.from('service_catalog_items').select('id').eq('title', rows[0].title).eq('active', true).neq('id', rows[0].id).order('created_at').limit(1).maybeSingle(); if (siblingError) throw siblingError;
      if (sibling) { const { error } = await db.from('service_faqs').update({ service_id: sibling.id }).eq('service_id', rows[0].id); if (error) throw error; }
    }
    const { error } = await db.from('service_catalog_items').delete().in('id', ids); if (error) throw error;
    const { error: storageError } = await db.storage.from('service-posters').remove(rows.map((row: any) => row.storage_path)); if (storageError) throw storageError;
  }
  else if (body.action === 'create_faq') { const { error } = await db.from('service_faqs').insert({ question: body.question, answer: body.answer, service_id: body.serviceId || null, folder_id: body.folderId || null, sort_order: body.sortOrder || 0 }); if (error) throw error; }
  else if (body.action === 'delete_faq') { const { error } = await db.from('service_faqs').update({ active: false }).eq('id', body.id); if (error) throw error; }
  else return res.status(400).json({ error: 'Unknown service action.' });
  return res.status(200).json(await payload(db, true));
}
