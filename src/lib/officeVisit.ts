import { useEffect, useState } from 'react';

// The signed-in account's own office (System Admin for Superadmins). When staff
// cross to another office, its welcome greets them by their own office instead.
const HOME_OFFICE_KEY = 'ara_home_office';
const HOME_OFFICE_EVENT = 'ara:home-office';
const officeNames: Record<string, string> = { admin: 'System Admin', quality: 'Quality', ca: 'Clinic Assistants' };

export function setHomeOffice(office: string) {
  try { localStorage.setItem(HOME_OFFICE_KEY, office); } catch { /* the greeting falls back to the host office */ }
  window.dispatchEvent(new Event(HOME_OFFICE_EVENT));
}

// Name of the visitor's own office, or '' when they are in their own office.
export function visitingFrom(office: string) {
  let home = '';
  try { home = localStorage.getItem(HOME_OFFICE_KEY) || ''; } catch { return ''; }
  return home && home !== office ? officeNames[home] || '' : '';
}

export function useVisitingFrom(office: string) {
  const [visitor, setVisitor] = useState(() => visitingFrom(office));
  useEffect(() => {
    const update = () => setVisitor(visitingFrom(office));
    update();
    window.addEventListener(HOME_OFFICE_EVENT, update);
    return () => window.removeEventListener(HOME_OFFICE_EVENT, update);
  }, [office]);
  return visitor;
}
