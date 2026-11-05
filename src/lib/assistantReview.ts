// The monthly assessment for clinic assistants ("Penilaian Bulanan Pembantu Klinik"): 19 items marked out of 100 in all, then a result for a
// contract locum or for a permanent staff member on probation. Shared by the page, the printed form and the server.
export type AssistantItem = { name: string; note: string; max: number };
export const ASSISTANT_ITEMS: AssistantItem[] = [
  { name: 'Cara Pendaftaran Tunai Pesakit', note: 'Mahir dalam proses pendaftaran pesakit dan memastikan maklumat pesakit diperoleh dengan tepat. · Memahami cara pendaftaran pesakit menggunakan pembaca kad pintar (smartcard reader). · Memahami konsep semakan cek panel sebelum pesakit menerima rawatan, bagi memastikan baki pesakit dan aspek-aspek lain dipastikan dengan betul.', max: 5 },
  { name: 'Buffer & Petty Cash', note: 'Faham konsep buffer & petty cash.', max: 5 },
  { name: 'Cara Dispensikan Ubat', note: 'Memahami cara untuk memberikan ubat (dispensasi) dengan betul. · Mengetahui lokasi penyimpanan setiap ubat di rak yang ditetapkan. · Memberikan ubat kepada pesakit dengan cara yang lancar dan tidak kekok.', max: 5 },
  { name: 'Cara Membantu Doktor', note: 'Berpengalaman dalam membantu doktor, contohnya dengan menyediakan FBC, swab, suntikan, drip, ECG, dressing, dan lain-lain.', max: 5 },
  { name: 'Cara Merekodkan Ubat Dalam Inventory', note: 'Berpengalaman dalam merekodkan ubat yang baru diterima.', max: 6 },
  { name: 'Konsep Cash Voucher / Buffer / Petty Cash / Locum / Closing Report', note: 'Berpengalaman dalam merekodkan ubat baru, mengurus aliran keluar masuk petty cash, menulis dalam buku petty cash, mengisi Cash Voucher, serta mengemaskini medium Cash Voucher tersebut. · Berpengalaman dalam membuka Cash Voucher, serta mahir dalam mengendalikan Cash Voucher untuk doktor locum. · Berpengalaman dalam mengurus aliran laporan penutupan sepanjang waktu bekerja dan sudah mahir dalam memuat naik laporan tersebut ke dalam kumpulan pembayaran. · Berpengalaman dalam mengendalikan mesin terminal dan melaksanakan penyelesaian (settlement) mengikut waktu yang ditetapkan.', max: 6 },
  { name: 'Cara Menyediakan Temujanji', note: 'Berpengalaman dan mahir dalam menyediakan temujanji pesakit menggunakan sistem Plato.', max: 5 },
  { name: 'Cara Penyediaan Prosedur Nebulisasi', note: 'Memahami konsep penyediaan nebulisasi dengan jumlah sekurang-kurangnya 4 ml. · Melakukan pengesahan yang tepat terlebih dahulu dengan doktor.', max: 5 },
  { name: 'Prosedur FBC, Capillary, UFEME & DXT, Swab', note: 'Berupaya melaksanakan prosedur secara berdikari tanpa pemantauan.', max: 5 },
  { name: 'Cara Menyediakan Ubat Intramuscular', note: 'Berpengalaman dalam membuka ampul dengan cara yang betul dan selamat. · Berpengalaman dalam mengambil ubat dari vial menggunakan syringe dengan betul. · Melabelkan suntikan yang telah disediakan untuk digunakan oleh doktor kepada pesakit. · Sentiasa membuat pengesahan yang tepat dengan doktor sebelum menyediakan suntikan.', max: 6 },
  { name: 'Cara Penyediaan Dressing', note: 'Berpengalaman dalam menyediakan peralatan dressing untuk digunakan oleh doktor. · Berpengalaman dan memahami langkah-langkah penyediaan peralatan dressing dengan betul. · Mengetahui susun atur dan lokasi peralatan dressing dengan tepat.', max: 5 },
  { name: 'Cara Pengurusan Pembuangan Sisa Klinikal & Sharp Bin', note: 'Mengetahui jenis tong yang digunakan untuk membuang sisa yang bersifat tajam. · Memahami perbezaan jenis dan kegunaan sisa klinikal serta sharp bin.', max: 5 },
  { name: 'Cara Penyediaan IV Drip', note: 'Berpengalaman dalam penyediaan dan pemasangan IV drip secara tepat dan selamat. · Berpengalaman dalam menyediakan dan memasang IV drip kepada pesakit dengan sempurna.', max: 5 },
  { name: 'Cara Penyediaan ECG', note: 'Memahami dan berkemampuan untuk melaksanakan penanggalan aksesori ECG daripada pesakit sebelum menjalankan prosedur. · Berupaya melaksanakan prosedur ECG dengan tepat dan efisien. · Melaksanakan prosedur ECG dengan cekap dan yakin di hadapan pesakit.', max: 5 },
  { name: 'Cara Penyediaan Suction', note: 'Berpengalaman dalam melaksanakan prosedur suction mengikut langkah-langkah yang betul serta menguruskan proses dengan efektif.', max: 5 },
  { name: 'Cara Membancuh Syrup Oseltamivir', note: 'Berpengalaman dalam cara bancuhan syrup simplex mengikut dos yang betul dalam ml dan mencairkannya dengan Oseltamivir 75mg.', max: 6 },
  { name: 'Cara Penerangan Bancuhan dan Cara Penggunaan Ubat Antibiotik Kepada Pesakit', note: 'Boleh menerangkan kepada pesakit cara bancuh ubat antibiotik dengan jelas: (1) menjelaskan dos yang perlu diambil serta mengingatkan mereka untuk menghabiskan ubat dalam tempoh 5 hari; (2) untuk syrup curam, tambahkan air sedikit demi sedikit sehingga mencapai garis pada botol dan goncang hingga larut sebelum digunakan; (3) selepas bancuhan atau pengambilan ubat, pastikan ia disimpan dalam peti ais.', max: 5 },
  { name: 'Konsep Deposit Foreigner Sebelum Pendaftaran', note: 'Mengetahui konsep pembayaran deposit pesakit asing sebanyak RM50. · Berpengalaman dalam memberikan resit deposit dengan betul.', max: 5 },
  { name: 'Tuntutan Panel', note: 'Mengetahui cara untuk membuat semakan panel pesakit melalui laman web. · Nyatakan panel yang mahir (semasa) dalam bidang tersebut. · Nyatakan panel yang belum mahir atau belum menguruskan dalam bidang tersebut.', max: 6 },
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
export type AssistantResult = { marks: number[]; panels: string; panelsNot?: string; kind: AssistantKind; outcome: string; term: string; position?: string };
export const assistantTotal = (marks: (number | null)[]) => marks.reduce<number>((sum, mark) => sum + (Number(mark) || 0), 0);
export const outcomeLabel = (kind: AssistantKind, value: string, term: string) => { const item = ASSISTANT_OUTCOMES[kind].find((option) => option.value === value); return item ? `${item.label}${term ? ` (${term})` : ''}` : ''; };

// When Review 2 is due: 2 weeks after the start date in the HR profile (the start of probation), then the 1st, 2nd and 3rd month.
export const ASSISTANT_STAGES = ['2 weeks', '1st month', '2nd month', '3rd month'] as const;
export function assistantDueOn(joinDate: string, stage: number): string {
  const [year, month, day] = joinDate.split('-').map(Number);
  if (stage === 0) return new Date(Date.UTC(year, month - 1, day + 14)).toISOString().slice(0, 10);
  const target = new Date(Date.UTC(year, month - 1 + stage, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}
export type DueAssessment = { employeeId: string; name: string; code: string; joinDate: string; stage: string; dueOn: string };
export type SkippedAssessment = { employeeId: string; name: string; stage: string; reason: string; by: string; at: string };
