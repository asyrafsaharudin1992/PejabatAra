export type UserRole = "Superadmin" | "Supervisor" | "ContentEditor" | "Staff";

export interface PortalUser {
  id?: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
  branch: string;
  status?: "active" | "invited" | "inactive";
  lastActive?: string;
  officeAccess?: string[];
}

export interface KnowledgeResource {
  id: string;
  title: string;
  summary: string;
  category: string;
  type: "SOP" | "Panduan" | "Polisi" | "FAQ" | "Memo" | "Guideline";
  readTime: number;
  updatedAt: string;
  owner: string;
  keywords: string[];
  content: string[];
  sourceUrl?: string;
  status?: "AKTIF" | "TERBATAL";
}

export interface TrainingLesson {
  id: string;
  title: string;
  duration: number;
  content: string;
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: number;
  required: boolean;
  lessons: TrainingLesson[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
  audience: string;
  priority: "Penting" | "Biasa";
}

export interface QuickLink {
  id: string;
  title: string;
  description: string;
  group: string;
  url: string;
}

const curatedKnowledgeResources: KnowledgeResource[] = [
  {
    id: "sop-opening",
    title: "SOP Pembukaan & Penutupan Klinik",
    summary: "Checklist operasi harian untuk memastikan ruang, sistem dan peralatan klinik bersedia.",
    category: "Operasi Klinik",
    type: "SOP",
    readTime: 6,
    updatedAt: "24 Sep 2026",
    owner: "Pasukan Operasi",
    keywords: ["buka klinik", "tutup klinik", "checklist", "operasi"],
    content: [
      "Draf ini menyediakan susunan semakan pembukaan dan penutupan klinik. Kandungan sebenar perlu disahkan oleh pemilik proses sebelum diterbitkan kepada staf.",
      "Pembukaan: periksa kebersihan ruang, hidupkan sistem utama, semak jadual doktor dan pastikan stok kritikal tersedia.",
      "Penutupan: selesaikan rekonsiliasi, simpan dokumen mengikut polisi, matikan peralatan yang ditetapkan dan laporkan sebarang isu untuk syif seterusnya.",
    ],
  },
  {
    id: "sop-complaint",
    title: "Pengurusan Aduan & Maklum Balas Pesakit",
    summary: "Aliran menerima, merekod, mengeskalasi dan menutup aduan secara konsisten.",
    category: "Khidmat Pesakit",
    type: "SOP",
    readTime: 8,
    updatedAt: "20 Sep 2026",
    owner: "Quality of Service",
    keywords: ["aduan", "feedback", "pesakit", "escalation"],
    content: [
      "Dengar dan rekod fakta tanpa membuat andaian atau janji penyelesaian yang belum diluluskan.",
      "Kenal pasti tahap risiko, maklumkan pegawai bertanggungjawab dan tetapkan tempoh tindakan susulan.",
      "Dokumentasikan tindakan serta keputusan akhir sebelum kes ditutup.",
    ],
  },
  {
    id: "guide-plato",
    title: "Panduan Asas Plato CMS",
    summary: "Langkah kerja harian untuk pendaftaran, dokumentasi dan semakan rekod.",
    category: "Sistem & IT",
    type: "Panduan",
    readTime: 10,
    updatedAt: "18 Sep 2026",
    owner: "Pentadbir Sistem",
    keywords: ["plato", "cms", "pendaftaran", "rekod"],
    content: [
      "Pastikan anda menggunakan akaun sendiri dan log keluar apabila meninggalkan komputer bersama.",
      "Semak identiti pesakit sebelum membuka atau mengemas kini rekod.",
      "Sekiranya berlaku ralat sistem, simpan butiran masa dan mesej ralat sebelum membuat laporan kepada pentadbir.",
    ],
  },
  {
    id: "policy-data",
    title: "Privasi Data & Keselamatan Maklumat",
    summary: "Amalan wajib apabila mengendalikan data pesakit, staf dan dokumen dalaman.",
    category: "Pematuhan",
    type: "Polisi",
    readTime: 7,
    updatedAt: "15 Sep 2026",
    owner: "Pengurusan",
    keywords: ["privasi", "data", "password", "keselamatan"],
    content: [
      "Akses maklumat hanya untuk tugasan kerja yang dibenarkan dan jangan berkongsi kata laluan.",
      "Elakkan menyimpan data sensitif pada peranti peribadi atau saluran komunikasi yang tidak diluluskan.",
      "Laporkan kehilangan peranti, pendedahan data atau akses mencurigakan dengan segera.",
    ],
  },
  {
    id: "guide-locum",
    title: "Proses Pengurusan Doktor Locum",
    summary: "Rujukan ringkas daripada permohonan, pengesahan, jadual hingga maklum balas.",
    category: "Doktor Locum",
    type: "Panduan",
    readTime: 9,
    updatedAt: "11 Sep 2026",
    owner: "Locum Doctors",
    keywords: ["locum", "doktor", "jadual", "credential"],
    content: [
      "Semak kelengkapan maklumat dan dokumen kelayakan sebelum menambah doktor ke dalam senarai aktif.",
      "Sahkan slot, lokasi dan pegawai untuk dihubungi sebelum jadual diedarkan.",
      "Rekod maklum balas selepas tugasan untuk rujukan penjadualan seterusnya.",
    ],
  },
  {
    id: "faq-leave",
    title: "FAQ Cuti, Off-day & Pertukaran Syif",
    summary: "Jawapan pantas untuk permohonan cuti, pertukaran syif dan kemas kini jadual.",
    category: "Sumber Manusia",
    type: "FAQ",
    readTime: 4,
    updatedAt: "8 Sep 2026",
    owner: "Pentadbiran",
    keywords: ["cuti", "off day", "shift", "jadual"],
    content: [
      "Hantar permohonan melalui saluran yang ditetapkan dan tunggu kelulusan sebelum membuat komitmen perjalanan.",
      "Pertukaran syif mesti dipersetujui oleh staf terlibat dan disahkan oleh penyelia.",
      "Selepas diluluskan, pastikan jadual portal telah dikemas kini.",
    ],
  },
];

const driveMemoSeed: Array<[string, string, string, KnowledgeResource["type"]]> = [
  ["Memo Insentif Skim Elaun Malam Pembantu Klinik", "1MvdJM8gbMXXIWmjFFUuITQEGioc83P35", "Kewangan", "Polisi"],
  ["AraPanel Patient Flowchart Registration", "1E96JBcO3EKUvB1Rca9kiNKs7UDNHVO7t", "Operasi Klinik", "Panduan"],
  ["Borang Rekod Kehadiran Klinik AraPanel", "13mdhwgbtiyMdttAIBs5utgL_dvPtm6r9", "Operasi Klinik", "Panduan"],
  ["Makluman Prosedur Tuntutan dan Bayaran OT", "1Eqzet9msxV0Fvc_lG4GUNgqtm2F11RGf", "Kewangan", "Polisi"],
  ["SOP Pengurusan dan Penggunaan Steriliser", "1gDK5t7OsbrtLe-c_ycBofu_zaI-Yq76J", "SOP Klinik", "SOP"],
  ["Garis Panduan Tuntutan 2025", "1uRAPEj5BE3tz2hNq5Ho32FBrQ7amWtNT", "Kewangan", "Panduan"],
  ["Insentif TeamARA", "1AETg_vU2-JqQg340Yw6yGJdar42qO1iO", "TeamARA", "Polisi"],
  ["Makluman Aplikasi Cuti Sakit Infotech", "1oIC8vBe-GzVE5j8sEckN-Uj0IDBc3fj3", "Sumber Manusia", "Panduan"],
  ["Makluman Pindaan Pegawai Eksekutif", "1niU8k91udPtsKWx3995-0ORKOal3LPqd", "Sumber Manusia", "Polisi"],
  ["Memo Penutupan Sementara Operasi Klinik", "15-mdXFlYtmvouClxDnHcPz-FlIjCIIIL", "Operasi Klinik", "Polisi"],
  ["Memo Caj Prosedur Swab Pesakit Panel", "1uXkalsoXCZVoVAtXICer48u74RS0fOhr", "Panel & Claim", "Polisi"],
  ["Memo Elaun Program Khas", "1NCFRqVGPK8ogCNUyRt3R8_EGDrF1hocp", "Kewangan", "Polisi"],
  ["Memo Kadar Bayaran Locum 2.0", "1GdJfqkXfH79zv_7nNUbbRJsVt7bjONdN", "Doktor Locum", "Polisi"],
  ["Memo Kadar Penggunaan Duit Petty Cash", "1XXN_xmLLzErSar1d5K0eOPQ8eANsBrgT", "Kewangan", "Polisi"],
  ["Memo Kemas Kini Keahlian TeamARA", "1PcpWUuAew3-PX_Lzj6nzA7waRXmuwoIZ", "TeamARA", "Polisi"],
  ["Memo Kemas Kini Waktu Rehat", "1S94IObH1g2uMTLifxL7aQiraVlCI53W1", "Operasi Klinik", "Polisi"],
  ["Memo Kenaikan Kadar Overnight Locum", "176jQmt4r9Qd1LOju0gZyutZUWMnuGT8g", "Doktor Locum", "Polisi"],
  ["Memo Operasi Klinik Ramadan & Syawal", "1taWeUtjBFeTXZ2Ez9hoeduxk2Tmw7P8_", "Operasi Klinik", "Polisi"],
  ["Memo SOP Penetapan Temujanji", "1915BVJN0LsQl_A-nmSV07cMEmyIQGu-V", "Operasi Klinik", "SOP"],
  ["Memo Pematuhan Buku Panduan Kerja", "1B_hFkaC6h-OGEAnFX7yMMM6CY2qtdKo5", "Pematuhan", "Polisi"],
  ["Memo Pembatalan Polisi Softblock Panel", "1c5dsFhN9nVezkyuX7lH-kfv2Syhyp4Fm", "Panel & Claim", "Polisi"],
  ["Memo Pengurusan Aset Rosak & Pelupusan", "1bnPs_gdNKRrTu7s--dILCCCt6c-eVox6", "Operasi Klinik", "SOP"],
  ["Memo Gantian Cuti Tahunan Berbayar", "1vYkGNgnsHx0uUk4aDMDwmoK9lqPKMJAZ", "Sumber Manusia", "Polisi"],
  ["Memo Pesakit Panel Nebulisation", "1bj5-asn0MFpfv4Ypf50cVA43Y7qb8S5T", "Panel & Claim", "Panduan"],
  ["Memo Penyelarasan Servis", "1Qw-S-rxhVkpg43uMvgo8EmnpJaO1s4Mv", "Operasi Klinik", "Polisi"],
  ["Memo Penyelarasan Waktu Rehat", "1srWnDyuG7QURUzFev1-fxMRksbtREIBT", "Operasi Klinik", "Polisi"],
  ["Memo Penyeragaman Ujian Add-on", "1jjGZh_EJb92lM929ZPbb8At23Bh263Np", "Panel & Claim", "SOP"],
  ["Memo Penyusunan Semula Jadual Doktor", "1Q3H-pjDxFusLK7kQaVfgCAy22EOJloy9", "Operasi Klinik", "Polisi"],
  ["Memo Pertukaran Jawatan Tertinggi Syarikat 28 May 2025", "1djDKo38BN4gOCEU6Ol7_VBaqiUsInMqc", "Sumber Manusia", "Polisi"],
  ["Memo Pertukaran Jawatan Tertinggi Syarikat 16 Oct 2025", "1V5aoQFJI8nubXosfULw2_jB41bwogXAj", "Sumber Manusia", "Polisi"],
  ["Memo Perubahan Kadar Insentif Locum", "1c0xKmnR2EYWfhNEbL59YXrYpJlV-sT-e", "Doktor Locum", "Polisi"],
  ["Memo Perubahan Polisi AraSihat", "1cS2N47ea3CUS5O8PwsIEIKIVHTFmWgPJ", "Pematuhan", "Polisi"],
  ["Memo Perubahan Sales Closing", "1gO4858pJHn63gikt9SFMbEn88zE7-0Sq", "Operasi Klinik", "Polisi"],
  ["Memo Polisi Softblock Panel Healthmetrics", "1RUSbX2Feic0qA3cfaYFqafHNrmWZRDcb", "Panel & Claim", "Polisi"],
  ["Memo Program Vaksin Influenza Semua Staf", "1AvkuM6CzzSMf9GVi3pG6qiE-2aOlEvaH", "TeamARA", "Polisi"],
  ["Memo Reset Hours", "1k5EvWJxcefxEp43dHty64-d9vdR_ZaM3", "Operasi Klinik", "Polisi"],
  ["Memo Waktu Operasi Ramadan", "1Auaj0Yy995czX7BPaAWGMKxWDZDnquH3", "Operasi Klinik", "Polisi"],
  ["Makluman Teknikal Sistem Pengurusan Klinik", "1YtdLFwb68rns3l-N9JJdpMK70TA7EjEx", "Sistem & IT", "Panduan"],
  ["Memo HR & Finance", "1ef1n0JFq_npBx6dB4X_jsjcUcW7qHVSp", "Sumber Manusia", "Polisi"],
  ["Memo Pertindihan Cuti Umum", "1nXirfXOQOZiL17f1SV9knsRXPNxOGZ-J", "Sumber Manusia", "Polisi"],
  ["Memo Larangan Penggunaan Wang Peribadi", "1UJbq2JIQ6RQ8sIzuNRGQCo1zkgDvkVql", "Kewangan", "Polisi"],
  ["Memo Perubahan Harga Konsultasi & SST", "1SXm2pN4Elw3KGTo-tlaBZyZ7cfqi-1A3", "Operasi Klinik", "Polisi"],
  ["Memo Perubahan Harga Konsultasi", "1-RauCKZJfYmtdP95YcMBmmCFglzsEEvQ", "Operasi Klinik", "Polisi"],
  ["Memo Perubahan Waktu Caj Konsultasi", "1y6MHR32cuBFk1njsE5K5U-kzSdFi40QA", "Operasi Klinik", "Polisi"],
  ["Memo Prosedur Refund Pesakit", "1Prpg3fTO2wFAYpX0HhKeVZ7-X6Zj1Lsn", "Khidmat Pesakit", "SOP"],
  ["Memo Ubat Larangan OTC", "1zAfK1y0s7xID4dBfpxHtgZk2AVjg0SU4", "Farmasi", "Polisi"],
  ["Panduan Tatatertib Staf", "13iSRmEu0NO8f04Wh-IP-va_N6m_AEBL4", "Sumber Manusia", "Panduan"],
  ["Panduan Staf Fisioterapi Klinik Ara", "1435A7IJhITGey982KejEN30ep86IABIB", "Training", "Panduan"],
  ["Pelarasan Cuti Sakit", "1Fgu3Muyverl5GZrrUDfYDbWQU3-3b-Rk", "Sumber Manusia", "Polisi"],
];

const memoMetadata: Record<string, { date: string; status?: "AKTIF" | "TERBATAL" }> = {
  "memo insentif skim elaun malam pembantu klinik": { date: "13/6/2025" },
  "garis panduan tuntutan 2025": { date: "1/3/2025" },
  "insentif teamara": { date: "30/12/2024", status: "TERBATAL" },
  "makluman aplikasi cuti sakit infotech": { date: "8/1/2025" },
  "memo pematuhan buku panduan kerja": { date: "30/8/2024" },
  "memo penyelarasan waktu rehat": { date: "25/7/2025" },
  "memo pertindihan cuti umum": { date: "11/9/2024" },
  "memo ubat larangan otc": { date: "20/5/2024" },
  "makluman prosedur tuntutan dan bayaran ot": { date: "31/7/2024" },
  "makluman teknikal sistem pengurusan klinik": { date: "31/7/2024" },
  "sop pengurusan dan penggunaan steriliser": { date: "3/11/2025" },
  "memo kadar bayaran locum 2.0": { date: "28/1/2025" },
  "memo kadar penggunaan duit petty cash": { date: "14/3/2025" },
  "memo kemas kini keahlian teamara": { date: "10/7/2025" },
  "memo kemas kini waktu rehat": { date: "25/7/2025" },
  "memo kenaikan kadar overnight locum": { date: "16/10/2025" },
  "memo operasi klinik ramadan & syawal": { date: "10/2/2025" },
  "memo perubahan polisi arasihat": { date: "17/6/2025" },
  "memo pengurusan aset rosak & pelupusan": { date: "17/6/2025" },
  "memo polisi softblock panel healthmetrics": { date: "10/7/2025" },
  "memo pembatalan polisi softblock panel": { date: "15/7/2025", status: "TERBATAL" },
  "memo perubahan harga konsultasi & sst": { date: "25/7/2025" },
  "memo perubahan harga konsultasi": { date: "19/7/2024", status: "TERBATAL" },
  "memo perubahan kadar insentif locum": { date: "4/8/2025" },
  "memo pesakit panel nebulisation": { date: "22/8/2025" },
  "memo program vaksin influenza semua staf": { date: "9/10/2025" },
  "memo caj prosedur swab pesakit panel": { date: "10/10/2025" },
  "memo reset hours": { date: "29/10/2025" },
  "memo penyeragaman ujian add-on": { date: "4/12/2025" },
  "memo prosedur refund pesakit": { date: "3/3/2025" },
  "memo penyelarasan servis": { date: "11/11/2024", status: "TERBATAL" },
  "memo penyusunan semula jadual doktor": { date: "27/12/2024" },
  "memo perubahan sales closing": { date: "31/8/2024" },
  "memo pertukaran jawatan tertinggi syarikat 28 may 2025": { date: "28/5/2025" },
  "memo pertukaran jawatan tertinggi syarikat 16 oct 2025": { date: "16/10/2025" },
  "makluman pindaan pegawai eksekutif": { date: "7/10/2024", status: "TERBATAL" },
  "memo waktu operasi ramadan": { date: "10/2/2025" },
};

export const driveMemoResources: KnowledgeResource[] = driveMemoSeed.map(([title, id, category, type]) => { const meta = memoMetadata[title.toLowerCase()]; return { id: `drive-${id}`, title, summary: "", category, type, readTime: 5, updatedAt: meta?.date || "Belum diekstrak", owner: "AraSihat", status: meta?.status || "AKTIF", keywords: [title.toLowerCase(), category.toLowerCase(), "memo", "rujukan"], content: ["Dokumen rasmi ini dipaparkan terus daripada sumber Drive AraSihat.", "Sila rujuk kandungan penuh dan gunakan versi terkini yang diterbitkan oleh pemilik proses."], sourceUrl: `https://drive.google.com/file/d/${id}/preview` }; });

export const knowledgeResources: KnowledgeResource[] = driveMemoResources;

export const trainingModules: TrainingModule[] = [
  {
    id: "onboarding",
    title: "Welcome to TeamARA",
    description: "An introduction to our culture, communication channels and essentials for your first week.",
    category: "Onboarding",
    duration: 25,
    required: true,
    lessons: [
      { id: "culture", title: "How we work", duration: 7, content: "Understand teamwork, clear communication and ownership of tasks." },
      { id: "channels", title: "Communication channels", duration: 8, content: "Identify the right channel for urgent matters, announcements and official documentation." },
      { id: "first-week", title: "First-week checklist", duration: 10, content: "Complete system access, meet process owners and review the key SOPs for your role." },
    ],
  },
  {
    id: "patient-service",
    title: "Patient Service Essentials",
    description: "Communication skills for a consistent and professional patient experience.",
    category: "Khidmat Pesakit",
    duration: 35,
    required: true,
    lessons: [
      { id: "greeting", title: "Welcome & communication", duration: 10, content: "Use a clear greeting, listen to the patient's needs and explain the next step." },
      { id: "difficult", title: "Difficult situations", duration: 15, content: "Stay calm, acknowledge concerns and escalate when an issue is beyond your authority." },
      { id: "followup", title: "Close & follow up", duration: 10, content: "Make sure the patient understands the next step and record any required follow-up." },
    ],
  },
  {
    id: "data-safety",
    title: "Data Safety & Privacy",
    description: "Every staff member's responsibility when handling patient and organisation information.",
    category: "Pematuhan",
    duration: 30,
    required: true,
    lessons: [
      { id: "access", title: "Secure access", duration: 10, content: "Use your own account, a strong password and lock the screen when you step away." },
      { id: "sharing", title: "Information sharing", duration: 10, content: "Share information only through approved channels and with authorised recipients." },
      { id: "incident", title: "Reporting an incident", duration: 10, content: "Report incidents immediately with the time, affected system and initial action taken." },
    ],
  },
  {
    id: "plato-basics",
    title: "Plato CMS for Daily Operations",
    description: "Practical training for using the core system workflow accurately and consistently.",
    category: "Sistem & IT",
    duration: 40,
    required: false,
    lessons: [
      { id: "login", title: "Access & navigation", duration: 10, content: "Learn the main menu and make sure you are in the correct location and account." },
      { id: "record", title: "Managing records", duration: 20, content: "Verify identity, complete required fields and review before saving." },
      { id: "support", title: "Errors & support", duration: 10, content: "Capture a screenshot without sensitive data and report the error details to an administrator." },
    ],
  },
];

export const announcements: Announcement[] = [
  {
    id: "draft-review",
    title: "Semakan kandungan portal staf",
    body: "Semua SOP dan bahan latihan dalam versi ini ialah draf permulaan. Pemilik proses perlu menyemak sebelum diterbitkan kepada seluruh staf.",
    date: "30 Sep 2026",
    audience: "Semua staf",
    priority: "Penting",
  },
  {
    id: "training-week",
    title: "Latihan onboarding staf baharu",
    body: "Penyelia diminta memastikan staf baharu melengkapkan modul onboarding dalam minggu pertama.",
    date: "28 Sep 2026",
    audience: "Penyelia & staf baharu",
    priority: "Biasa",
  },
  {
    id: "sop-update",
    title: "SOP aduan pesakit dikemas kini",
    body: "Rujuk aliran eskalasi baharu di Pusat Rujukan dan maklumkan jika terdapat langkah yang tidak jelas.",
    date: "25 Sep 2026",
    audience: "Front desk & operasi",
    priority: "Biasa",
  },
];

export const quickLinks: QuickLink[] = [
  { id: "plato", title: "Plato CMS", description: "Clinic management", group: "Systems", url: "https://app.platohealth.ai" },
  { id: "drive", title: "Operations Drive", description: "Team documents", group: "Documents", url: "https://drive.google.com" },
  { id: "forms", title: "Internal Forms", description: "Requests & reports", group: "Forms", url: "https://forms.google.com" },
  { id: "support", title: "IT Support", description: "Report a system issue", group: "Support", url: "mailto:support@example.com" },
];

export const demoStaff: PortalUser[] = [
  { id: "demo-admin", email: "admin@ara.local", fullName: "Dr Asyraf", role: "Superadmin", department: "Management", branch: "All branches", status: "active", lastActive: "Now" },
  { id: "demo-staff", email: "staff@ara.local", fullName: "Aina Rahman", role: "Staff", department: "Clinic Operations", branch: "Kajang", status: "active", lastActive: "Now" },
  { id: "demo-supervisor", email: "farah@ara.local", fullName: "Farah Nabila", role: "Supervisor", department: "Clinic Supervisor", branch: "Seri Kembangan", status: "active", lastActive: "Today, 4:20 PM" },
  { id: "demo-content", email: "daniel@ara.local", fullName: "Daniel Lee", role: "ContentEditor", department: "Training & Quality", branch: "All branches", status: "invited", lastActive: "Invitation sent" },
];
