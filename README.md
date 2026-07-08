# Cipak Jederrr! POS

A Point of Sale (POS) system designed for managing outlets, products, stock, transactions, and finances of Cipak Jederrr.

---

## 🚀 Fitur Utama
- **Kasir (POS)**: Entri transaksi cepat dengan dukungan QRIS, Tunai, dan GrabFood.
- **Dashboard & Analytics**: Metrik penjualan harian, grafik keuntungan kotor/bersih, dan indikator stok kritis.
- **Keuangan (Kas & Ledger)**: Pencatatan otomatis pendapatan dari transaksi dan pengeluaran operasional.
- **Stok & Inventori**: Manajemen stok real-time, riwayat pergerakan stok, dan peringatan stok minimum.
- **Laporan Harian (A4)**: Cetak laporan penutupan harian berformat spreadsheet A4 dengan html2canvas & jsPDF.
- **Manajemen Pengguna (RBAC)**: Pembatasan hak akses berbasis peran (Developer, Owner, Koorlap, Kasir).
- **Utilitas Backup & Restore**: Ekspor dan impor data seluruh sistem dalam format JSON portable.

---

## 🛠️ Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database ORM**: Prisma Client
- **Database**: PostgreSQL (dengan `@prisma/adapter-pg`)
- **Autentikasi**: Auth.js / NextAuth (v5)
- **Styling**: Tailwind CSS & Framer Motion
- **Form Validation**: React Hook Form & Zod
- **State Management**: TanStack React Query (v5)

---

## ⚙️ Cara Memulai & Setup

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Konfigurasi Environment Variables
Buat berkas `.env` di direktori utama proyek dan tambahkan konfigurasi berikut:
```env
DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable&connection_limit=10"
AUTH_SECRET="gunakan_kunci_rahasia_acak_minimal_32_karakter"
```

### 3. Jalankan Local Database (Prisma Dev)
Proyek ini menggunakan **Prisma Postgres lokal** yang dijalankan melalui perintah berikut (**biarkan terminal ini tetap berjalan**):
```bash
npx prisma dev
```
Ini akan menjalankan database PostgreSQL lokal di port **51214** secara otomatis (tanpa perlu instalasi PostgreSQL manual atau Docker).

### 4. Migrasi Schema & Seeding Data Awal
Buka terminal baru, lalu jalankan:
```bash
npx prisma db push
npx tsx prisma/seed.ts
```

### 5. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

---

## 🔐 Akun Login Default (Hasil Seeding)

Gunakan daftar akun berikut untuk menguji sistem berdasarkan masing-masing tingkat akses (Role):

| No | Peran (Role) | Email | Password | Deskripsi / Cakupan (Scope) |
|---|---|---|---|---|
| 1 | **Developer** | `dev@cipak.com` | `Password123!` | Akses penuh ke sistem, termasuk utilitas database (Backup & Restore) & konfigurasi toko. |
| 2 | **Owner** | `owner@cipak.com` | `Password123!` | Akses penuh ke seluruh menu (laporan, stok, produk, dll.) kecuali menu utilitas database. |
| 3 | **Koorlap** | `koorlap1@cipak.com` | `Password123!` | Mengelola stok, belanja, dan melihat laporan yang dibatasi pada outlet yang ditugaskan (Cideng, Cipondoh, Tangerang). |
| 4 | **Kasir** | `kasir1@cipak.com` | `Password123!` | Melakukan transaksi penjualan dan mengajukan daftar belanja kebutuhan harian terbatas pada outlet aktif (Cideng). |

> [!TIP]
> Semua password akun bawaan di atas diset seragam ke `Password123!`. Anda dapat menambahkan, memperbarui, atau menghapus pengguna melalui menu **Kelola User** setelah login sebagai *Developer* atau *Owner*.

