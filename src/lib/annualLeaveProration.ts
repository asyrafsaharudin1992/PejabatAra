// Resignation uses completed months in the balance year, including the last working day.
// null means the existing annual leave rules still apply; zero is a real entitlement.
export function resignationEarned(eligible: number, year: number, joinDate?: string | null, resignDate?: string | null): number | null {
  if (!resignDate || !year || resignDate > `${year}-12-31`) return null;
  const start = joinDate && joinDate > `${year}-01-01` ? joinDate : `${year}-01-01`;
  if (resignDate < start) return 0;
  const from = new Date(`${start}T00:00:00Z`);
  const end = new Date(`${resignDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const months = Math.max(0, Math.min(12, (end.getUTCFullYear() - from.getUTCFullYear()) * 12 + end.getUTCMonth() - from.getUTCMonth() - (end.getUTCDate() < from.getUTCDate() ? 1 : 0)));
  return Math.round(eligible * months / 12);
}
