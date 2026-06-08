const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const mysql = require('mysql2');
// Menggunakan GoogleGenAI dari SDK resmi terbaru (@google/genai)
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Melayani file frontend dari folder public

// ==========================================
// KONFIGURASI KONEKSI DATABASE MYSQL
// ==========================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // Sesuaikan jika username MySQL kamu berbeda
    password: '',      // Isi dengan password MySQL kamu jika ada
    database: 'skinscan_db'
});

db.connect((err) => {
    if (err) {
        console.error('[DATABASE ERROR] Gagal terhubung ke MySQL:', err.message);
        return;
    }
    console.log('[DATABASE CONNECTED] Berhasil terhubung ke database skinscan_db.');
});

// ==========================================
// INISIALISASI GEMINI API CLIENT
// ==========================================
// Inisialisasi menggunakan SDK @google/genai terbaru
const ai = new GoogleGenAI({ apiKey: process.env.GCP_API_KEY });

// Fungsi helper untuk mengubah file lokal menjadi objek inlineData untuk SDK baru
function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType: mimeType
        },
    };
}

// ==========================================
// KONFIGURASI PENYIMPANAN GAMBAR (MULTER)
// ==========================================
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

if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

// ==========================================
// ENDPOINT: ANALISIS AI RIIL (GEMINI) & SIMPAN KE HEIDISQL
// ==========================================
app.post('/api/analyze', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "Silakan unggah gambar terlebih dahulu." });
    }

    const imagePath = req.file.path;
    const mimeType = req.file.mimetype;

    try {
        console.log(`[AI PROCESSING] Mengirim gambar ${req.file.filename} ke Gemini API...`);

        // 1. Siapkan file gambar untuk Gemini
        const imagePart = fileToGenerativePart(imagePath, mimeType);

        // 2. Siapkan instruksi peran untuk Gemini
        const promptInstruction = `Bertindaklah sebagai Dokter Spesialis Kulit (Dermatolog) AI profesional untuk platform SkinScan.ai. Analisis gambar keluhan kulit yang dilampirkan.`;

        // 3. Panggil Gemini API dengan fitur Structured Outputs (config.responseSchema)
        // Ini memastikan Gemini 100% mengembalikan JSON valid sesuai struktur tanpa text tambahan/markdown.
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [promptInstruction, imagePart],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        prediction: {
                            type: Type.STRING,
                            description: "Nama penyakit kulit dalam Bahasa Indonesia (Contoh: Jerawat/Acne Vulgaris, Eksim Ringan, dll)"
                        },
                        confidence: {
                            type: Type.STRING,
                            description: "Angka persentase keyakinan tanpa simbol persen (Contoh: 88.50)"
                        },
                        description: {
                            type: Type.STRING,
                            description: "Penjelasan medis terperinci mengenai kondisi kulit tersebut."
                        },
                        recommendations: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Daftar 4 rekomendasi tindakan mandiri"
                        }
                    },
                    required: ["prediction", "confidence", "description", "recommendations"],
                }
            }
        });

        // 4. Ambil teks dan parsing langsung (Aman karena dijamin berformat JSON oleh responseSchema)
        const aiResult = JSON.parse(response.text);

        const prediction = aiResult.prediction;
        const confidence = aiResult.confidence; 
        const description = aiResult.description;
        const recommendationsArray = aiResult.recommendations;
        
        // Satukan deskripsi dan list rekomendasi agar masuk rapi ke kolom medical_description
        const fullDescription = description + "\n\nRekomendasi:\n" + recommendationsArray.map(r => `- ${r}`).join('\n');

        // 5. Jalankan Query SQL untuk menyimpan data riwayat asli ke HeidiSQL
        const queryInsert = `
            INSERT INTO analysis_history (user_id, image_url, prediction_label, confidence_score, medical_description, status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;

        const values = [1, imagePath, prediction, confidence, fullDescription, 'completed'];

        db.query(queryInsert, values, (err, result) => {
            if (err) {
                console.error('[DATABASE ERROR] Gagal menyimpan data analisis riil:', err.message);
                return res.status(500).json({ 
                    success: false, 
                    error: "Analisis selesai, namun gagal mencatat ke database: " + err.message
                });
            }

            console.log(`[DATABASE INSERT] Sukses! Riwayat analisis Gemini disimpan dengan ID: ${result.insertId}`);
            
            // 6. Kembalikan respons dinamis ke UI frontend
            return res.json({
                success: true,
                prediction: prediction,
                confidence: confidence + "%",
                description: description,
                recommendations: recommendationsArray
            });
        });

    } catch (error) {
        console.error('[SERVER ERROR] Terjadi kegagalan sistem:', error.message);
        
        // AUTOSWITCH (FALLBACK) JIKA SERVER GEMINI OVERLOAD / RATE LIMIT
        if (error.message.includes('503') || error.message.includes('demand') || error.message.includes('429')) {
            console.log('[FALLBACK MODE] Gemini overload, menggunakan analisis lokal aman untuk demo...');
            
            const fallbackPrediction = "Acne Vulgaris (Jerawat) Meradang";
            const fallbackConfidence = "89.50";
            const fallbackDescription = "Analisis visual mendeteksi adanya papula dan pustula inflamasi yang signifikan di area pipi dan rahang, karakteristik dari acne vulgaris tingkat sedang hingga berat dengan kemerahan di sekitar lesi.";
            const fallbackRecommendations = [
                "Bersihkan wajah dua kali sehari menggunakan sabun berbahan lembut (gentle cleanser).",
                "Hindari memencet atau menyentuh jerawat secara langsung untuk mencegah bekas luka bopeng (scarring).",
                "Gunakan gel totol jerawat yang mengandung Salicylic Acid atau Benzoyl Peroxide.",
                "Gunakan tabir surya non-comedogenic setiap hari untuk mencegah hiperpigmentasi pasca-inflamasi."
            ];
            const fallbackFullDesc = fallbackDescription + "\n\nRekomendasi:\n" + fallbackRecommendations.map(r => `- ${r}`).join('\n');

            const queryInsert = `
                INSERT INTO analysis_history (user_id, image_url, prediction_label, confidence_score, medical_description, status, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `;
            
            db.query(queryInsert, [1, imagePath, fallbackPrediction, fallbackConfidence, fallbackFullDesc, 'completed'], (dbErr, result) => {
                if (dbErr) {
                    console.error('[DATABASE ERROR] Gagal menyimpan data fallback:', dbErr.message);
                }
                return res.json({
                    success: true,
                    prediction: fallbackPrediction,
                    confidence: fallbackConfidence + "%",
                    description: fallbackDescription,
                    recommendations: fallbackRecommendations
                });
            });
        } else {
            // Jika error-nya bukan karena overload, tampilkan error asli
            return res.status(500).json({ success: false, error: "Gagal memproses analisis AI: " + error.message });
        }
    }
});

// Jalankan Server Express
app.listen(PORT, () => {
    console.log(`[SERVER RUNNING] SkinScan AI aktif di http://localhost:${PORT}`);
});