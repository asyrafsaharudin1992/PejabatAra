# Akses cuti menurut tetapan Infotech — 29 Oktober 2026

Disemak secara baca sahaja dalam INFO-LEAVE → Administration → User Creation, melalui tab Create User (identiti), Department Access (peranan E-LEAVE) dan Company Access (syarikat yang ditanda). Tiada Update ditekan.

Ini ialah skop kebenaran data akaun menurut tetapan Infotech, bukan audit setiap paparan telefon atau setiap menu. Super Admin E-LEAVE bermaksud akses semua data pekerja dalam modul cuti bagi syarikat yang diberikan. Kelulusan sesuatu permohonan masih mengikut penugasan approver; label Approver bukan bermaksud semua permohonan dihantar kepadanya.

| Nama | Kod | E-LEAVE Super Admin | E-LEAVE Approver | Company Access | Skop data cuti dibenarkan | E-LEAVE Backup Officer |
|---|---|---|---|---|---|---|
| Mohamad Asyraf bin Saharudin | ARA0001 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | Ahmad Syafiq bin So Ib |
| Ahmad Syafiq bin So Ib | ARA0002 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | IMPLEMENTOR |
| Noor Atikah binti Abdul Rahman | ARA0035 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | NONE |
| Nur Izzah Syahirah binti Norhalim | ARA0041 | Ya | Ya | KJ sahaja | Semua jabatan KJ; tiada akses syarikat SK | IMPLEMENTOR |
| Siti Nursuhaila binti Mohd Ali | ARA0061 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | NONE |
| Luqman Hakim bin Mohd Kamal | ARASK0001 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | NONE |
| Muhamad Haziq bin Shamshul | ARASK0002 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | Luqman Hakim bin Mohd Kamal |
| Nur Amirah Dayana binti Faizularfin | ARASK0060 | Ya | Ya | SK sahaja | Semua jabatan SK; tiada akses syarikat KJ | Luqman Hakim bin Mohd Kamal |
| Nur Syahirah binti Abdul Wahab | ARASK0058 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | IMPLEMENTOR |
| Nurul Aisyah binti Mohamad Nazim | ARASK0036 | Ya | Ya | KJ, SK | Semua jabatan KJ dan SK | NONE |

## Staf biasa

Dalam KJ dan SK, Admin Setting → System Setting → ELeave-II mempunyai kedua-dua pilihan ini ditanda:

- Allow employee to view leave calendar.
- Allow employee to view his department's leave only.

Pilihan Allow approver to view all employee's leave detail in Calendar Format report juga ditanda untuk kedua-dua syarikat. Kalendar/rangka laporan approver perlu menghormati Company Access pengguna.

Oleh itu, peraturan umum staf biasa ialah melihat cuti jabatan sendiri. Akses akaun pentadbiran di atas lebih luas kerana peranan Super Admin E-LEAVE dan Company Access masing-masing. Akaun sistem IMPLEMENTOR dan MANAGEMENT bukan staf yang dibandingkan dalam jadual ini dan tidak diaudit secara individu dalam semakan ini.

## Padanan AraOffice

AraOffice kini menyimpan akses kalendar untuk kesemua 10 akaun di atas melalui `hr_employees.leave_calendar_companies`. Izzah mendapat semua jabatan KJ, Dayana semua jabatan SK, dan lapan akaun lain kedua-dua syarikat. Staf tanpa akses luas melihat syarikat dan jabatan sendiri; staf tanpa jabatan hanya melihat cuti sendiri. Hanya cuti approved ditunjukkan. Hak ini khusus untuk kalendar dan tidak mengubah penugasan kelulusan, hak HR, atau backup officer. Tetapan pangkalan data telah digunakan pada Supabase. Deployment aplikasi mengikuti branch main melalui Vercel; semak status deployment untuk commit terkini.
