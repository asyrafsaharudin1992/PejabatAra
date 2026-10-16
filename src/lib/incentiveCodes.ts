// Incentive codes and rates from memo HSO/MEMO/SM/2026/0012 (effective claims 10/26).
// Shared by the API, which fixes the RM of every entry, and the staff and admin pages.
// `ownAmount` codes have no fixed rate, so staff type the amount.
export type IncentiveCode = { code: string; name: string; rate: number; group: string; ownAmount?: boolean };

export const INCENTIVE_GROUPS = ['Clinic Assistant', 'Special for MA / Nurse / Doctor w/o license', 'Other incentive'];

export const INCENTIVE_CODES: IncentiveCode[] = [
  { code: '001', name: 'Blood taking', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: '002', name: 'Swab', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: '003', name: 'Dressing', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: '004', name: 'ECG', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: '005', name: 'Injection', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: '006', name: 'DXT', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: '007', name: 'Dengue Test', rate: 2, group: INCENTIVE_GROUPS[0] },
  { code: 'L001', name: 'STO', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L002', name: 'Suction', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L003', name: 'Branula Insertion', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L004', name: 'Gluestitch', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L005', name: 'CBD Insertion', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L006', name: 'Eye Irrigation', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L007', name: 'ECG', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L008', name: 'Injection', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L009', name: 'DXT', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'L010', name: 'Dengue Test', rate: 2, group: INCENTIVE_GROUPS[1] },
  { code: 'A', name: 'Trainer Incentive (50% every training / no. of trainer)', rate: 0, group: INCENTIVE_GROUPS[2], ownAmount: true },
  { code: 'B', name: 'Night Shift Allowance', rate: 4, group: INCENTIVE_GROUPS[2] },
  { code: 'C', name: 'Staff Of The Month', rate: 100, group: INCENTIVE_GROUPS[2] },
  { code: 'D', name: 'Special Program Allowance - Program Director', rate: 200, group: INCENTIVE_GROUPS[2] },
  { code: 'E', name: 'Special Program Allowance - Secretary', rate: 150, group: INCENTIVE_GROUPS[2] },
  { code: 'F', name: 'Special Program Allowance - Treasurer', rate: 150, group: INCENTIVE_GROUPS[2] },
  { code: 'G', name: 'Special Program Allowance - Event Coordinator', rate: 150, group: INCENTIVE_GROUPS[2] },
  { code: 'H', name: 'Special Program Allowance - Committee Chairperson', rate: 50, group: INCENTIVE_GROUPS[2] },
  { code: 'I', name: 'Special Program Allowance - Other Committee Role', rate: 50, group: INCENTIVE_GROUPS[2] },
];

// Staff branch codes (Assessment Room) and the clinic branches the Clinical Admin works on.
export const INCENTIVE_BRANCHES: Record<string, string> = { KJ: 'Kajang', SK: 'Seri Kembangan' };

// `review` is set by the Clinical Admin row by row; a row without it has not been checked yet.
export type IncentiveEntry = { id: string; date: string; patient: string; clinicId: string; outstanding: string; code: string; rm: number; review?: 'approved' | 'rejected' };
export type IncentiveStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export const claimTotal = (entries: IncentiveEntry[]) => Math.round(entries.reduce((total, entry) => total + Number(entry.rm || 0), 0) * 100) / 100;
export const approvedTotal = (entries: IncentiveEntry[]) => claimTotal(entries.filter((entry) => entry.review === 'approved'));

// Display helpers shared by the staff page, the Clinical Admin page and the printed sheet.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export const codeName = (code: string) => INCENTIVE_CODES.find((item) => item.code === code)?.name || code;
export const dmy = (date: string) => date.split('-').reverse().join('/');
export const rm = (value: number) => `RM ${value.toFixed(2)}`;
export const STATUS_LABEL: Record<IncentiveStatus, string> = { draft: 'Still filling in', submitted: 'Waiting for approval', approved: 'Approved', returned: 'Returned to fix' };
export const STATUS_TONE: Record<IncentiveStatus, string> = { draft: 'bg-slate-100 text-slate-600', submitted: 'bg-amber-50 text-amber-800', approved: 'bg-emerald-50 text-emerald-700', returned: 'bg-rose-50 text-rose-700' };
