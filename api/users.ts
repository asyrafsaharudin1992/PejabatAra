import { officeAccess } from './_office-db.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user } = await officeAccess(req, true);
    if (req.method === 'GET') {
      const { data, error } = await db.from('profiles').select('id,email,full_name,role,status,department').order('full_name');
      if (error) throw error;
      const { data: authData, error: authError } = await db.auth.admin.listUsers({ perPage: 1000 });
      if (authError) throw authError;
      const accessById = new Map((authData.users || []).map(authUser => [authUser.id, Array.isArray(authUser.app_metadata?.office_access) ? authUser.app_metadata.office_access : []]));
      return res.json((data || []).map(p => ({ ...p, officeAccess:accessById.get(p.id) || [], fullName:p.full_name, role:p.role === 'super_admin' ? 'Superadmin' : 'Staff' })));
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (req.method === 'POST') {
      if (!body.fullName?.trim() || !body.email?.includes('@') || typeof body.password !== 'string' || body.password.length < 12 || !['Staff','Superadmin'].includes(body.role)) return res.status(400).json({error:'Enter a name, email, valid role and password of at least 12 characters.'});
      const officeAccess = Array.isArray(body.officeAccess) ? body.officeAccess.filter((office: unknown) => typeof office === 'string') : [];
      const { data, error } = await db.auth.admin.createUser({email:body.email.trim(), password:body.password, email_confirm:true, user_metadata:{full_name:body.fullName.trim()}, app_metadata:{office_access:officeAccess}});
      if (error) throw error;
      const { error: profileError } = await db.from('profiles').upsert({id:data.user.id,email:body.email.trim(),full_name:body.fullName.trim(),role:body.role === 'Superadmin' ? 'super_admin' : 'staff',status:'active',department:body.department || null});
      if (profileError) throw new Error('Account created, but profile setup failed. Check this account before retrying.');
      return res.json({success:true});
    }
    const email = req.query.email || body.email;
    if (!email) return res.status(400).json({error:'Select an account.'});
    const { data: target, error } = await db.from('profiles').select('id,role').eq('email',email).single();
    if (error) throw error;
    if (req.method === 'PATCH') {
      if (body.officeAccess !== undefined) {
        if (!Array.isArray(body.officeAccess) || body.officeAccess.some((office: unknown) => typeof office !== 'string')) return res.status(400).json({error:'Choose valid office access.'});
        if (target.role === 'super_admin') return res.status(400).json({error:'System Admin access is managed automatically.'});
        const { error: accessError } = await db.auth.admin.updateUserById(target.id,{app_metadata:{office_access:body.officeAccess}});
        if (accessError) throw accessError;
      }
      if (body.password !== undefined) {
        if (typeof body.password !== 'string' || body.password.length < 12) return res.status(400).json({error:'Use at least 12 characters.'});
        const {error} = await db.auth.admin.updateUserById(target.id,{password:body.password});
        if(error) throw error;
      }
      if (body.officeAccess === undefined && body.password === undefined) return res.status(400).json({error:'Choose an account update.'});
      return res.json({success:true});
    }
    if (req.method === 'DELETE') {
      if (target.id === user.id || target.role === 'super_admin') return res.status(400).json({error:'System Admin accounts cannot be deleted here.'});
      const {error} = await db.auth.admin.deleteUser(target.id);
      if(error) throw error;
      return res.json({success:true});
    }
    return res.status(405).json({error:'Method not allowed.'});
  } catch(error:any) { return res.status(error.status || 400).json({error:error.message}); }
}
