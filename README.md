# PejabatAra (AraOffice)

Lobi pejabat maya untuk staf. Pengguna memilih "pintu" pejabat di lobi, memasukkan
kod akses, kemudian log masuk ke workspace masing-masing.

- **Frontend:** React 19, Vite 6, Tailwind CSS 4
- **Backend:** Vercel serverless functions (`api/`); Express untuk dev tempatan
- **Data:** Supabase (Postgres) + Google Drive/Sheets
- **Production:** projek Vercel `pejabat-ara`, domain `araoffice.hsohealthcare.com`

## Struktur projek

```
src/
  main.tsx            Titik masuk, memaparkan OfficeLobby
  OfficeLobby.tsx     Lobi: pilih pejabat dan kod akses
  App.tsx             Workspace Quality
  PortalApp.tsx       Workspace CA (portal staf)
  AdminUsers.tsx      Pengurusan pengguna
  ShiftHandover.tsx   Serah tugas syif
  lib/                Klien Supabase, officeApi, hook dan utiliti
api/                  Endpoint backend (fail berawalan _ ialah modul dalaman)
  local.ts            Pelayan Express untuk dev tempatan
  panel-webhook.ts    Callback Google Drive untuk sync realtime
  panel-watch.ts      Cron harian untuk daftar semula Drive watch
supabase/migrations/  Skema pangkalan data (SQL)
scripts/              Skrip dev, init portal dan migrasi data lama
docs/                 Dokumentasi tambahan
```

## Jalankan secara tempatan

**Keperluan:** Node.js

1. Pasang dependency:
   ```sh
   npm install
   ```
2. Salin `.env.example` ke `.env.local` dan isi nilai yang diperlukan (lihat
   [Pemboleh ubah persekitaran](#pemboleh-ubah-persekitaran)).
3. Jalankan API dan frontend serentak:
   ```sh
   npm run dev
   ```
   Buka http://127.0.0.1:3000.

Kali pertama membuka lobi, pilih **Set up Master Admin** untuk menetapkan kod
master. Butiran lanjut ada dalam [docs/office-access.md](docs/office-access.md).

## Arahan npm

| Arahan | Fungsi |
| --- | --- |
| `npm run dev` | Jalankan API (`api/local.ts`) dan Vite di port 3000 |
| `npm run build` | Build production ke `dist/` |
| `npm run preview` | Pratonton hasil build |
| `npm run lint` | Semak jenis TypeScript |
| `npm run migrate:legacy` | Pindahkan data Google Sheets lama ke Supabase |
| `npm run clean` | Padam `dist/` |

## Pemboleh ubah persekitaran

Rujuk `.env.example` untuk senarai penuh.

| Pemboleh ubah | Kegunaan |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Klien Supabase di pelayar (kunci awam) |
| `VITE_API_URL` | Laluan asas API (lalai `/api`) |
| `VITE_PANEL_REALTIME_ENABLED` | Hidupkan sync realtime Panel Training |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Akses Supabase di pelayan sahaja |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Service account Google (Drive/Sheets) |
| `MEMO_DRIVE_FOLDER_ID` | Folder Drive memo rasmi untuk sync Reference Hub |
| `GOOGLE_SHEET_ID` | Google Sheet lama (untuk migrasi) |
| `PANEL_WEBHOOK_URL`, `PANEL_WATCH_SECRET`, `CRON_SECRET` | Webhook dan cron Drive watch |

Jangan sekali-kali letak kunci rahsia (service role, private key) dalam
pemboleh ubah berawalan `VITE_` kerana ia akan didedahkan kepada pelayar.

## Pangkalan data

Migrasi skema berada dalam `supabase/migrations/` dan perlu dijalankan mengikut
urutan nama fail pada projek Supabase.

## Deploy

Projek ini dideploy ke Vercel. `vercel.json` mengkonfigurasi had masa
`api/panel-webhook.ts` dan cron harian (03:00 UTC) ke `/api/panel-watch`.
Tetapkan semua pemboleh ubah pelayan dalam tetapan Vercel sebelum deploy.

## Dokumentasi lanjut

- [docs/office-access.md](docs/office-access.md): kod akses lobi dan Master Admin
- [docs/panel-realtime.md](docs/panel-realtime.md): pengaktifan sync realtime Panel Training
