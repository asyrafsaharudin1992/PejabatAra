import { useEffect, useState } from 'react';
import { malaysiaToday } from './reviewReminders';

// Update date-based views at Malaysian midnight without polling the API.
export function useMalaysiaToday() {
  const [today, setToday] = useState(malaysiaToday);
  useEffect(() => {
    const update = () => setToday(malaysiaToday());
    const nextMidnight = Date.parse(`${today}T00:00:00+08:00`) + 86_400_000;
    const timer = window.setTimeout(update, Math.max(100, nextMidnight - Date.now() + 100));
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); };
  }, [today]);
  return today;
}
