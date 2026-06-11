# EAS Cloud Computing: SkinScan AI

## Deskripsi Proyek
SkinScan AI adalah platform berbasis web yang memanfaatkan teknologi kecerdasan buatan (Gemini AI) untuk menganalisis keluhan kulit berdasarkan gambar yang diunggah oleh pengguna. Aplikasi ini dirancang mengikuti prinsip **Cloud Native** menggunakan teknologi kontainerisasi (Docker) dan orkestrasi (Docker Compose) agar mudah diterapkan secara dinamis (deployment) dan konsisten di berbagai environment.

## Arsitektur Cloud Native
Aplikasi ini dikemas ke dalam 2 kontainer utama yang diorkestrasi menggunakan Docker Compose:
1. **Node.js (Backend Service)**: Menjalankan logika server Express.js, melayani aset frontend statis, serta mengelola koneksi API menuju model Gemini AI.
2. **MySQL (Database Service)**: Berjalan sebagai container terpisah untuk menjamin independensi data (persistence), menggunakan volume `db_data` dan menginisialisasi skema secara otomatis.

> [!NOTE]
> **Sidecar / Network Sharing Pattern:** Dikarenakan kode sumber `server.js` dipertahankan apa adanya (terdapat *hardcode* koneksi database ke `localhost`), Docker Compose dirancang menggunakan `network_mode: "service:db"`. Pola ini menyatukan container Node.js ke dalam *network namespace* container MySQL, sehingga aplikasi tetap mampu terhubung ke MySQL di `localhost:3306` dari dalam *isolated environment* tanpa harus mengubah isi dari file `server.js`.

---

## Panduan Instalasi dan Menjalankan

### Persyaratan
- **Docker Engine** & **Docker Compose**
- Kunci API Google Cloud / Gemini yang valid (`GCP_API_KEY`)

### Langkah-langkah Menjalankan:
1. Pastikan file `.env` di *root folder* sudah memiliki variabel berikut:
   ```env
   GCP_API_KEY=KUNCI_API_ANDA
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=
   DB_NAME=skinscan_db
   ```
2. Build dan jalankan seluruh services menggunakan Docker Compose:
   ```bash
   docker-compose up -d --build
   ```
3. Akses antarmuka aplikasi melalui peramban (browser) di [http://localhost:3000](http://localhost:3000).

---

## Dokumentasi API (API Documentation)

Aplikasi ini menyediakan antarmuka API sederhana untuk kebutuhan front-end dalam mengirim gambar serta menerima hasil prediksi.

### 1. Upload dan Analisis AI
Endpoint ini akan menerima input gambar dari pengguna, mengirimkannya ke *Cloud AI (Gemini)*, mengembalikan respons analisis dalam format terstruktur (JSON), serta mencatat riwayat penggunaannya ke Database MySQL.

- **URL:** `/api/analyze`
- **Metode:** `POST`
- **Content-Type:** `multipart/form-data`

**Request Parameters:**
| Parameter | Tipe   | Deskripsi                                                                 |
|-----------|--------|---------------------------------------------------------------------------|
| `image`   | `file` | File biner gambar area kulit yang dikeluhkan (Maksimal ukuran: 5MB)       |

**Contoh Response Berhasil (200 OK):**
```json
{
  "success": true,
  "prediction": "Acne Vulgaris (Jerawat)",
  "confidence": "88.50%",
  "description": "Analisis visual mendeteksi adanya papula dan pustula inflamasi...",
  "recommendations": [
    "Bersihkan wajah dua kali sehari",
    "Gunakan gel totol jerawat"
  ]
}
```

**Contoh Response Gagal (400 / 500 Bad Request / Internal Error):**
```json
{
  "success": false,
  "error": "Silakan unggah gambar terlebih dahulu."
}
```

---

## Dokumentasi Integrasi AI

Proyek ini terintegrasi penuh dengan model **Google Gemini 2.5 Flash** memanfaatkan SDK terbaru `@google/genai`. Alur kerjanya memastikan reliabilitas tingkat produksi:

1. **Persiapan Data File (*Inline Data*)**
   Gambar yang diunggah dikonversi dari *temporary storage* lokal ke dalam wujud Buffer `base64` (`inlineData`). Hal ini dibutuhkan untuk mengirim input visual tanpa URL publik kepada server Gemini.
   
2. **Context & System Prompting**
   AI diberikan instruksi peran/konteks ketat:
   > *"Bertindaklah sebagai Dokter Spesialis Kulit (Dermatolog) AI profesional untuk platform SkinScan.ai. Analisis gambar keluhan kulit yang dilampirkan."*

3. **Structured Outputs (Penjaminan Tipe Data)**
   Pemanggilan API ke Google GenAI dikonfigurasikan dengan `responseSchema` bertipe `application/json`. Ini memaksa AI untuk *hanya* membalas dengan struktur properti spesifik (`prediction`, `confidence`, `description`, `recommendations`), sehingga frontend tidak perlu menghadapi *parsing error* dari markdown Markdown atau teks obrolan (*chitchat*) bebas.

4. **Sistem Fallback Respons Otomatis (Reliability)**
   Sistem disiapkan menghadapi limitasi atau kendala di *Cloud Environment*. Apabila server Google API merespons dengan indikasi antrean (misalnya *rate limit* error 429 atau 503 Overload), Node.js akan mendeteksinya dan secara otonom berpindah ke mode fallback (simulasi data analisis lokal) sehingga end-user tidak akan menemui halaman *crash*.

5. **Logging dan Storage Persisten**
   Data dari AI digabungkan menjadi format standar yang kemudian disuntikkan ke Database (*HeidiSQL Export*) ke tabel `analysis_history` untuk keperluan histori rekam medis ringan pengguna.
