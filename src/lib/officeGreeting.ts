// Who opened an office from their own Individual Sign In ("Dr Syafiq"), so the office can greet them by name. The HR office account is shared, so the
// name cannot come from the account. It is kept only on this device, and removed when the office is signed out.
const KEY = 'ara_office_greeting';
const SKIP = /^(NUR|NURUL|SITI|MOHAMAD|MUHAMAD|MUHAMMAD|MOHD|AHMAD|ABDUL|WAN)$/i;
export function greetingName(fullName: string, doctor: boolean) {
  const word = fullName.trim().split(/\s+/).find((part) => !SKIP.test(part)) || fullName.trim().split(/\s+/)[0] || '';
  const name = word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';
  return name ? `${doctor ? 'Dr ' : ''}${name}` : '';
}
export const rememberGreeting = (office: string, name: string) => { try { if (name) localStorage.setItem(KEY, JSON.stringify({ office, name })); else localStorage.removeItem(KEY); } catch { /* optional */ } };
export const readGreeting = (office: string) => { try { const value = JSON.parse(localStorage.getItem(KEY) || 'null'); return value?.office === office && typeof value.name === 'string' ? value.name : ''; } catch { return ''; } };
export const clearGreeting = () => { try { localStorage.removeItem(KEY); } catch { /* optional */ } };
