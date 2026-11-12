// Incentive codes and rates from memo HSO/MEMO/SM/2026/0012 (effective claims 10/26).
// Shared by the API, which fixes the RM of every entry, and the staff and admin pages.
// `ownAmount` codes have no fixed rate, so staff type the amount.
export type IncentiveCode = { code: string; name: string; rate: number; group: string; ownAmount?: boolean; needsPatient?: boolean; inactive?: boolean; custom?: boolean };

// Two incentive forms: the staff form (clinic assistants, memo HSO/MEMO/SM/2026/0012) and the doctor form (DOCTOR INCENTIVES, October 2026).
// Their codes overlap (both have 001), so an entry saved from the doctor form carries form 'doctor'.
export type IncentiveForm = 'staff' | 'doctor';
export const DOCTOR_GROUP = 'Doctor incentives';

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

// A rate HR has changed: `code` is paid at `rate` for procedures dated `effectiveFrom` or later (until a later change).
export type RateChange = { id?: string; form?: IncentiveForm; code: string; rate: number; effectiveFrom: string; setBy?: string };
export function rateOn(code: string, date: string, changes: RateChange[], form: IncentiveForm = 'staff'): number {
  const base = codesOf(form).find((item) => item.code === code)?.rate ?? 0;
  const latest = changes.filter((change) => (change.form || 'staff') === form && change.code === code && change.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return latest ? latest.rate : base;
}

const doctor = (code: string, name: string, rate: number): IncentiveCode => ({ code, name, rate, group: DOCTOR_GROUP });
export const DOCTOR_INCENTIVE_CODES: IncentiveCode[] = [
  doctor('001', 'Homevisit', 40), doctor('002', 'CBD', 10), doctor('003', 'Cotest HPV DNA + Pap Smear LBC', 40), doctor('004', 'AraLady', 30),
  doctor('005', 'Circumcision Adult', 80), doctor('006', 'Circumcision Kids/Basic', 40), doctor('007', 'Confirm REDD Scan', 5), doctor('008', 'Gynae USG', 20),
  doctor('009', 'Implanon Insertion', 20), doctor('010', 'Implanon Removal', 10), doctor('011', 'Incision and Drainage (I&D)', 10), doctor('012', 'Ingrown Toe Nail Removal', 10),
  doctor('013', 'Intra-Uterine Contraceptive Device', 20), doctor('014', 'IUCD Removal', 5), doctor('015', 'Nail Avulsion', 5), doctor('016', 'Rapid Ultrasound Scan', 5),
  doctor('017', 'Toilet & Suturing (>10cm)', 10), doctor('018', 'Ultrasound 2D Antenatal Scan', 20), doctor('019', 'Ultrasound 5D Antenatal Scan', 20), doctor('020', 'e-FAST Scan', 10),
  doctor('021', 'Fetal Anatomy Scan', 40), doctor('022', 'Personal Medical Report', 25), doctor('023', 'Medicolegal Report', 50), doctor('024', 'Review AraSihat', 2),
  doctor('025', 'Pap Smear LBC (sahaja)', 10), doctor('026', 'HPV DNA (sahaja)', 20), doctor('027', 'Shincort', 100), doctor('028', 'Hyaluronic Acid', 150),
  doctor('029', 'Cross-linked HA', 200), doctor('030', 'Circumcision Adult/Paeds (resident during shift)', 80), doctor('031', 'USG NT Scan', 10), doctor('032', 'USG NT + 2D Scan', 30),
];
// Incentives HR has added (HR > Incentive). They sit next to the memo's codes. Every page that shows claims registers them from the server's reply first.
export type ExtraIncentive = IncentiveCode & { id: string; form: IncentiveForm };
let extraCodes: ExtraIncentive[] = [];
export const setExtraCodes = (rows: ExtraIncentive[] | undefined) => { extraCodes = Array.isArray(rows) ? rows : []; };
export const extraCodesOf = (form: IncentiveForm | undefined) => extraCodes.filter((item) => (item.form === 'doctor') === (form === 'doctor'));
export const codesOf = (form: IncentiveForm | undefined): IncentiveCode[] => [...(form === 'doctor' ? DOCTOR_INCENTIVE_CODES : INCENTIVE_CODES), ...extraCodesOf(form)];
export const groupsOf = (form: IncentiveForm | undefined) => { const base = form === 'doctor' ? [DOCTOR_GROUP] : INCENTIVE_GROUPS; return [...base, ...new Set(extraCodesOf(form).map((item) => item.group).filter((group) => group && !base.includes(group)))]; };

// Staff branch codes (Assessment Room) and the clinic branches the Clinical Admin works on.
export const INCENTIVE_BRANCHES: Record<string, string> = { KJ: 'Kajang', SK: 'Seri Kembangan' };

// `review` is set by the Clinical Admin row by row; a row without it has not been checked yet.
export type IncentiveEntry = { id: string; date: string; patient: string; clinicId: string; outstanding: string; code: string; rm: number; form?: 'doctor'; commission?: number; review?: 'approved' | 'rejected'; reason?: string };
export type IncentiveStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export const claimTotal = (entries: IncentiveEntry[]) => Math.round(entries.reduce((total, entry) => total + Number(entry.rm || 0), 0) * 100) / 100;
// The Night Shift Allowance (code B) is shown apart from the other incentives on the printed claim.
export const NIGHT_CODE = 'B';
export const nightTotal = (entries: IncentiveEntry[]) => claimTotal(entries.filter((entry) => entry.code === NIGHT_CODE));
export const otherTotal = (entries: IncentiveEntry[]) => claimTotal(entries.filter((entry) => entry.code !== NIGHT_CODE));
export const approvedTotal = (entries: IncentiveEntry[]) => claimTotal(entries.filter((entry) => entry.review === 'approved'));

// Display helpers shared by the staff page, the Clinical Admin page and the printed sheet.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export const codeName = (code: string, form?: IncentiveForm) => codesOf(form).find((item) => item.code === code)?.name || code;
export const dmy = (date: string) => date.split('-').reverse().join('/');
export const rm = (value: number) => `RM ${value.toFixed(2)}`;
export const STATUS_LABEL: Record<IncentiveStatus, string> = { draft: 'Still filling in', submitted: 'Waiting for approval', approved: 'Approved', returned: 'Returned to fix' };
export const STATUS_TONE: Record<IncentiveStatus, string> = { draft: 'bg-slate-100 text-slate-600', submitted: 'bg-amber-50 text-amber-800', approved: 'bg-emerald-50 text-emerald-700', returned: 'bg-rose-50 text-rose-700' };
