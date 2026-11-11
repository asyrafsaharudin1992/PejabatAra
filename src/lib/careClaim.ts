// The AraCare claim: the monthly Care Coordination Allowance (RM 100). Shared by the staff page, the COO, HR and the printed form.
export const CARE_ROLES = ['AraChronic', 'AraMommy', 'AraWellness', 'AraSihat', 'Lain-lain'];
export const CARE_ITEMS = ['Jumlah pesakit dalam registry', 'Pesakit aktif (follow-up)', 'Pesakit overdue / defaulter', 'Reminder dihantar (call/WhatsApp)', 'Pesakit ambil ubat (refill)'];
export const CARE_AMOUNT = 100;
// The COO's check (PIC Klinik): three KPIs, and whether the allowance is payable.
export type CareKpi = { followUp: boolean; registry: boolean; reminder: boolean; eligible: boolean; by: string; at: string; note?: string };
export type CareStatus = 'submitted' | 'approved' | 'returned';
export type CareClaim = {
  id: string; staffId: string; month: string; branch: string; roles: string[]; other: string; items: string[]; amount: number; status: CareStatus;
  kpi: CareKpi | null; decisionNote: string; decidedBy: string; decidedAt: string | null; hrSubmittedAt: string | null; hrReceivedAt: string | null; hrReceivedBy: string; submittedAt: string;
  staffName?: string; staffCode?: string; ic?: string; designation?: string;
};
export type CarePerson = { name: string; ic: string; designation: string; branch: string };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const careMonth = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export const careStatusLabel = (claim: Pick<CareClaim, 'status' | 'hrReceivedAt'>) => claim.status === 'submitted' ? 'Waiting for the COO' : claim.status === 'returned' ? 'Returned' : claim.hrReceivedAt ? 'Received by HR' : 'Sent to HR';
export const careStatusTone = (claim: Pick<CareClaim, 'status' | 'hrReceivedAt'>) => claim.status === 'submitted' ? 'bg-amber-50 text-amber-800' : claim.status === 'returned' ? 'bg-rose-50 text-rose-700' : claim.hrReceivedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700';
