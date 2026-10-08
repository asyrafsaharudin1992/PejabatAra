import { useEffect, useState } from 'react';
import { UserManagement } from './App';
import { officeFetch } from './lib/officeApi';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const load = async () => {
    setLoading(true);
    try { setUsers(await (await officeFetch('/api/users')).json()); }
    catch (error: any) { setMessage(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  // Returns an error message, or an empty string when the change was saved.
  const act = async (method: string, body: any) => {
    setMessage('');
    try {
      await officeFetch('/api/users', { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      await load(); setMessage('Account updated successfully.'); return '';
    } catch(error:any) { setMessage(error.message); return error.message || 'Unable to update this account.'; }
  };
  return <main className="min-h-screen bg-[#f5f7f9] p-8 text-[#14233b]">
    <div className="mx-auto max-w-6xl">
      <a href="#office/admin" className="mb-8 inline-block font-medium text-[#0b587b]">← Back to Control Centre</a>
      {message && <p role="status" className="mb-5 rounded-xl bg-white p-4">{message}</p>}
      <UserManagement allUsers={users} isLoading={loading} onAddUser={data => void act('POST',data)}
        onDeleteUser={email => { if(window.confirm(`Delete ${email}? This removes their sign-in account.`)) void act('DELETE',{email}); }}
        onUpdateUser={(email, changes) => act('PATCH',{email,...changes})} />
    </div>
  </main>;
}
