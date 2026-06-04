const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Melayani file frontend dari folder public

// Konfigurasi Penyimpanan Gambar Sementara
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, 'skin_' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Batasi ukuran file maksimal 5MB
});

// Pastikan folder 'uploads' tersedia
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

// Endpoint: Simulasi Analisis AI (Nanti dihubungkan ke Cloud AI Engine / Gemini API)
app.post('/api/analyze', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "Silakan unggah gambar terlebih dahulu." });
    }

    // Simulasi jeda pemrosesan model AI selama 2.5 detik agar animasi loading di web terlihat estetik
    setTimeout(() => {
        res.json({
            success: true,
            prediction: "Eczema (Eksim) Ringan",
            confidence: "91.8%",
            description: "Berdasarkan analisis visual awal melalui algoritma citra digital, area kulit menunjukkan karakteristik dermatitis atopik atau eksim ringan. Terlihat pola inflamasi berupa kemerahan (eritema) disertai tekstur kulit yang cenderung kering dan bersisik halus.",
            recommendations: [
                "Gunakan pelembab hipoalergenik tanpa kandungan parfum sesegera mungkin setelah mandi.",
                "Hindari membasuh area kulit yang meradang dengan air yang terlalu panas.",
                "Gunakan sabun dengan formula lembut (pH seimbang) dan hindari menggaruk area yang gatal agar tidak memicu infeksi sekunder.",
                "Segera jadwalkan konsultasi dengan dokter spesialis kulit jika dalam waktu 3 hari kemerahan semakin meluas atau timbul rasa perih."
            ]
        });
    }, 2500); 
});

app.listen(PORT, () => {
    console.log(`[SERVER RUNNING] SkinScan AI dapat diakses di http://localhost:${PORT}`);
});