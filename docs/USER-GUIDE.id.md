# Lorescale Voice — Panduan Pengguna

Lorescale adalah asisten suara AI untuk bisnis Anda. Pelanggan membuka tautan (tanpa instal aplikasi), berbicara dengan AI Anda, lalu bisa memesan, bertanya, atau membuat janji temu — tergantung pengaturan toko Anda.

Ada dua sisi:

| Aplikasi | Siapa yang memakai | Fungsi |
|---|---|---|
| **Admin** | Anda / staf | Mengatur toko, menu, AI, pesanan |
| **Aplikasi pelanggan** | Pelanggan Anda | Berbicara dengan AI di `/b/{slug-toko-anda}` |

> English: [USER-GUIDE.md](./USER-GUIDE.md)

---

## 1. Buat akun

1. Buka aplikasi **Admin**, lalu pilih **Sign up**.
2. Masukkan email + kata sandi dan buat akun.
3. Anda akan diarahkan ke proses onboarding.

### Langkah A — Workspace

- Masukkan **nama bisnis**.
- Slug URL dibuat otomatis (contoh: `Sunrise Coffee` → `sunrise-coffee`).
- Tautan pelanggan Anda:  
  `https://aplikasi-pelanggan-anda/b/sunrise-coffee`

### Langkah B — Pengaturan bisnis

Pilih:

1. **Jenis bisnis** — Makanan & minuman, Retail, Salon & barber, Kesehatan, atau Lainnya
2. **Kegunaan utama**
   - **Ambil pesanan** — menu, keranjang, checkout
   - **Jawab FAQ** — hanya tanya jawab (tanpa menu/checkout)
   - **Keduanya** — pesanan + dukungan pelanggan
   - **Salon:** Buat janji temu / FAQ / Keduanya
3. **Bahasa default** — Indonesia atau Inggris

Setelah itu, Anda masuk ke dasbor **Overview**.

---

## 2. Dasbor admin (peta singkat)

Item di sidebar bergantung pada kegunaan bisnis Anda:

| Halaman | Kapan muncul | Fungsi |
|---|---|---|
| **Overview** | Selalu | Statistik hari ini, tips, tautan ke aplikasi pelanggan |
| **Menu** / **Treatments** | Pemesanan atau booking aktif | Produk atau treatment salon |
| **Appointments** | Booking aktif | Lihat janji temu |
| **Schedule** | Booking aktif | Jam buka untuk ketersediaan slot |
| **AI Knowledge** | Selalu | Fakta yang bisa dijawab AI (jam buka, kebijakan, dll.) |
| **AI Rules** | Selalu | Kepribadian, nada, bahasa, perilaku AI |
| **Orders** | Pemesanan aktif | Pesanan live / sebelumnya |
| **Conversations** | Selalu | Riwayat sesi suara |
| **Payment QR** | Pemesanan aktif | QR yang dipindai pelanggan saat bayar |
| **Appearance** | Selalu | Latar & tampilan merek di halaman pelanggan |
| **Analytics** | Selalu | Tren dan produk terlaris |

Bilah atas:

- Status **AI Online / Offline**
- **Customer app** — membuka tautan publik di tab baru

---

## 3. Siapkan toko Anda (urutan yang disarankan)

### A. Menu / Treatments

1. Buka **Menu** (atau **Treatments** untuk salon).
2. Tambahkan item: nama, harga, kategori, deskripsi, gambar opsional.
3. Untuk salon, atur **durasi** (dipakai untuk slot booking).
4. Opsional: diskon.

Contoh kategori: Coffee, Pastry, Food, Drinks — atau Haircuts, Color, Styling untuk salon.

### B. AI Knowledge

Tambahkan fakta singkat yang harus diketahui AI, misalnya:

- Jam buka
- Parkir / Wi‑Fi
- Metode pembayaran
- Kebijakan (refund, alergen)

Kategori: General, Hours, Menu, Policies, Payment.

### C. AI Rules

Atur perilaku asisten:

- **Bahasa** — Indonesia atau Inggris (default)
- **Nada** — Friendly, Professional, atau Casual
- **Personality** — siapa AI tersebut
- **Behavioral rules** — apa yang boleh / tidak boleh dilakukan
- **Tool instructions** — cara memakai menu/pesanan/booking
- Opsional: nama asisten + avatar

### D. Payment QR (bisnis yang menerima pesanan)

Unggah kode QR yang dipindai pelanggan untuk membayar (misalnya QRIS). Ditampilkan di checkout setelah pesanan dikonfirmasi.

### E. Appearance

Atur latar belakang halaman pelanggan dan gradien bawah agar sesuai merek Anda.

### F. Schedule (bisnis janji temu)

Atur jam buka/tutup per hari. Hari tutup tidak akan menampilkan slot.

---

## 4. Bagikan ke pelanggan

Tautan publik Anda:

```
{url-aplikasi-pelanggan}/b/{slug-anda}
```

Contoh demo lokal: `http://localhost:6670/b/sunrise-coffee`

Bagikan lewat:

- Tautan di WhatsApp / Instagram / bio
- QR cetak yang membuka URL yang sama
- Tombol **Customer app** di Admin

Berfungsi di **Chrome atau Safari**. Pelanggan harus **mengizinkan mikrofon**.

---

## 5. Pengalaman pelanggan (cara memakai halaman suara)

### Mulai berbicara

1. Buka tautan toko.
2. Izinkan mikrofon saat diminta.
3. **Tahan tombol mic** (push-to-talk) lalu berbicara.
4. Lepas saat selesai — AI membalas dengan suara.
5. Lihat **transkrip** yang diperbarui secara langsung.

Status di header: Ready → Connecting… → **Live**.

### Bahasa

Gunakan **ID / EN** untuk beralih. Jika sesi sedang live, koneksi akan dibuat ulang dengan bahasa baru.

### Alur pemesanan (jika aktif)

1. Ucapkan pesanan, misalnya *“Saya mau latte dan croissant”*, **atau** buka **menu** dan ketuk item.
2. Buka **keranjang** (kanan atas) untuk meninjau.
3. Konfirmasi pesanan.
4. Di **Pay your order**, pindai **Payment QR** toko.
5. Tandai pembayaran selesai → **Order complete**.

Anda juga bisa bilang “tambah croissant” atau “hapus latte” sambil berbicara.

### Alur booking (salon / janji temu)

1. Minta booking, atau pilih **treatment** dari menu.
2. Pilih tanggal + slot waktu yang tersedia.
3. Masukkan nama + nomor telepon.
4. Konfirmasi — booking muncul di **Appointments** di Admin.

### Mode FAQ saja

Tidak ada menu/keranjang. Pelanggan bertanya; AI menjawab dari **AI Knowledge** + **AI Rules**.

### Akhiri sesi

Buka **⋯** (lainnya) → **End session**.

---

## 6. Kegiatan harian untuk staf

| Tugas | Di mana |
|---|---|
| Lihat aktivitas hari ini | **Overview** / **Analytics** |
| Proses pesanan makanan/minuman | **Orders** |
| Cek janji temu | **Appointments** |
| Tinjau percakapan pelanggan | **Conversations** |
| Perbarui harga / item | **Menu** |
| Perbaiki jawaban AI yang salah | **AI Knowledge** + **AI Rules** |

---

## 7. Tips agar hasil lebih baik

- Buat entri knowledge **singkat dan faktual**.
- Pastikan harga dan nama item di **Menu** akurat — AI memakai data itu untuk pesanan.
- Sesuaikan **bahasa di AI Rules** dengan bahasa pelanggan Anda.
- Uji dengan tautan **Customer app** setelah setiap perubahan besar.
- Untuk demo, pakai Chrome/Safari dan ruangan yang tenang; tahan mic sampai selesai berbicara.

---

## 8. Pemecahan masalah

| Masalah | Coba ini |
|---|---|
| Mic tidak berfungsi | Izinkan mic di pengaturan browser; gunakan HTTPS atau localhost |
| AI Offline di admin | API mungkin sedang bangun — tunggu lalu refresh |
| AI tidak tahu sesuatu | Tambahkan di **AI Knowledge** |
| Item / harga salah | Perbaiki **Menu**, lalu mulai sesi pelanggan baru |
| Tidak ada layar pembayaran | Unggah QR di **Payment QR** |
| Tidak ada slot booking | Cek jam di **Schedule** dan **durasi** treatment |
| Menu/Orders tidak muncul | Kegunaan mungkin FAQ saja — ubah pengaturan atau use case |

---

## 9. Data demo (lokal)

Jika database sudah di-seed:

- Admin: `admin@sunrise.coffee` / `admin123`
- Pelanggan: `/b/sunrise-coffee`
- Coba: *“Saya mau latte dan croissant”*
