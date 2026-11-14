// Which group a staff member belongs to, by job title: the same rule for the staff location page and the counts on the CEO's home.
export const locationGroup = (person: { designation: string; employeeCode: string; company: string }) => {
  const job = person.designation.toUpperCase();
  if (/\b(CEO|CFO|CHRO|COO|CPO)\b|CHIEF.*OFFICER/.test(job)) return 'Directors';
  if (person.company === 'KJ' && person.employeeCode === 'ARA0041') return 'Admin Klinikal';
  if (/ADMIN.*CLINI|CLINI.*ADMIN/.test(job)) return 'Admin Klinikal';
  if (/CLINIC ASSISTANT|PEMBANTU KLINIK/.test(job)) return 'CAs';
  if (/\bDR\b|DOCTOR|DOKTOR/.test(job)) return 'Doctors';
  return 'Admins';
};
