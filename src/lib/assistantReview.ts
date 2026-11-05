// The monthly assessment for clinic assistants ("Penilaian Bulanan Pembantu Klinik"): 19 items marked out of 100 in all, then a result for a
// contract locum or for a permanent staff member on probation. Shared by the page, the printed form and the server.
export type AssistantItem = { name: string; note: string; max: number };
export const ASSISTANT_ITEMS: AssistantItem[] = [
  { name: 'Cara Pendaftaran Tunai Pesakit', note: 'Mahir proses pendaftaran, penggunaan smartcard, semakan panel', max: 5 },
  { name: 'Buffer & Petty Cash', note: 'Faham konsep buffer & petty cash', max: 5 },
  { name: 'Cara Dispensi Ubat', note: 'Mahir dispensi, kenal lokasi ubat, tidak kekok', max: 5 },
  { name: 'Cara Membantu Doktor', note: 'Mahir sediakan FBC, Swab, Injection, Drip, ECG, Dressing', max: 5 },
  { name: 'Rekod Ubat Dalam Inventory', note: 'Mahir rekod ubat masuk', max: 6 },
  { name: 'Konsep Cash Voucher/Buffer/Petty Cash/Locum/Closing Report', note: 'Mahir flow petty cash, cash voucher, closing report, settlement mesin terminal', max: 6 },
  { name: 'Menyediakan Temujanji', note: 'Mahir gunakan Plato untuk temujanji', max: 5 },
  { name: 'Prosedur Nebulisasi', note: 'Mahir sediakan nebulisasi, pengesahan dengan doktor', max: 5 },
  { name: 'Prosedur FBC, Capillary, UFEME, DXT, Swab', note: 'Boleh laksana prosedur tanpa pemantauan', max: 5 },
  { name: 'Menyediakan Ubat Intramuscular', note: 'Mahir buka ampules, syringe out, label suntikan, pengesahan', max: 6 },
  { name: 'Penyediaan Dressing', note: 'Mahir peralatan & langkah dressing', max: 5 },
  { name: 'Pengurusan Sisa Klinikal & Sharp Bin', note: 'Kenal tong sisa tajam & konsep pengurusan sisa', max: 5 },
  { name: 'Penyediaan IV Drip', note: 'Mahir sediakan & pasang IV Drip', max: 5 },
  { name: 'Penyediaan ECG', note: 'Faham removal aksesori, laksana ECG dengan yakin', max: 5 },
  { name: 'Penyediaan Suction', note: 'Mahir laksana prosedur suction', max: 5 },
  { name: 'Membancuh Syrup Oseltamivir', note: 'Mahir teknik bancuhan Oseltamivir 75mg', max: 6 },
  { name: 'Penerangan Bancuhan & Penggunaan Ubat Antibiotik', note: 'Mahir beri penerangan pada pesakit', max: 5 },
  { name: 'Konsep Deposit Foreigner', note: 'Mahir konsep & resit deposit RM150', max: 5 },
  { name: 'Tuntutan Panel', note: 'Mahir semakan panel pesakit (nyatakan panel yang dikuasai)', max: 6 },
];
export const ASSISTANT_PANEL_ITEM = ASSISTANT_ITEMS.length - 1;   // the last item asks which panels the person has mastered
export type AssistantKind = 'locum' | 'probation';
export type AssistantOutcome = { value: string; label: string; terms?: string[] };
export const ASSISTANT_OUTCOMES: Record<AssistantKind, AssistantOutcome[]> = {
  locum: [
    { value: 'cemerlang', label: 'Cemerlang dan tamat tempoh', terms: ['1 minggu', '2 minggu', '4 minggu'] },
    { value: 'memuaskan', label: 'Memuaskan dan tamat tempoh', terms: ['1 minggu', '2 minggu', '4 minggu'] },
    { value: 'perlu_baiki', label: 'Perlu penambahbaikan dan tamat tempoh', terms: ['1 minggu', '2 minggu', '4 minggu'] },
    { value: 'tamat_kontrak', label: 'Tamat kontrak' },
  ],
  probation: [
    { value: 'tamat_percubaan', label: 'Menamatkan tempoh percubaan dalam tempoh', terms: ['1 bulan', '2 bulan', '3 bulan'] },
    { value: 'teruskan_percubaan', label: 'Meneruskan tempoh percubaan dalam tempoh', terms: ['1 bulan', '2 bulan', '3 bulan'] },
    { value: 'tamat_perkhidmatan', label: 'Menamatkan perkhidmatan dalam tempoh', terms: ['1 bulan', '2 bulan', '3 bulan'] },
  ],
};
export type AssistantResult = { marks: number[]; panels: string; kind: AssistantKind; outcome: string; term: string; position?: string };
export const assistantTotal = (marks: (number | null)[]) => marks.reduce<number>((sum, mark) => sum + (Number(mark) || 0), 0);
export const outcomeLabel = (kind: AssistantKind, value: string, term: string) => { const item = ASSISTANT_OUTCOMES[kind].find((option) => option.value === value); return item ? `${item.label}${term ? ` (${term})` : ''}` : ''; };
