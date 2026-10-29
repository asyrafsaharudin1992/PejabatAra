export type CalendarPerson = { id: string; company: string; department?: string | null; leave_calendar_companies?: unknown };
export type CalendarAccess = { companies: string[]; department: string; employeeId: string; scope: 'companies' | 'department' | 'self'; label: string; notice: string };

// These are calendar permissions only; they never grant HR or approval access.
export function calendarAccessFor(person: CalendarPerson): CalendarAccess {
  const companies = Array.isArray(person.leave_calendar_companies)
    ? [...new Set(person.leave_calendar_companies.filter((company): company is string => company === 'KJ' || company === 'SK'))].sort() : [];
  const department = String(person.department || '').trim();
  if (companies.length) return { companies, department: '', employeeId: person.id, scope: 'companies', label: `${companies.join(' + ')} · All departments`, notice: '' };
  return { companies: [person.company], department, employeeId: person.id, scope: department ? 'department' : 'self', label: department ? `${person.company} · ${department}` : 'Your leave', notice: department ? '' : 'Your department has not been set. Only your own approved leave is shown. Ask HR to set your department to see its calendar.' };
}

export function calendarPersonVisible(access: CalendarAccess, person: CalendarPerson) {
  return access.companies.includes(person.company) && (access.scope === 'companies' || (access.scope === 'department' ? person.department === access.department : person.id === access.employeeId));
}
