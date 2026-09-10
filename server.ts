import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import multer from "multer";

const app = express();
const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

app.use(express.json({ limit: "50mb" }));

// Initialize Gemini
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API endpoint to analyze forms
app.post("/api/analyze-form", (req, res, next) => {
  upload.array("files")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: "File upload error: " + err.message });
      }
      return res.status(500).json({ error: "Unknown upload error: " + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const defaultAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "NOT_SET" });
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    
    console.log("Analyzing files:", files.map(f => f.mimetype));

    const { manualGuruList, manualMuridList, userApiKey } = req.body;
    let customAi = defaultAi;
    if (userApiKey && userApiKey.trim().length > 0) {
       customAi = new GoogleGenAI({ apiKey: userApiKey.trim() });
    }
    
    let candidatesList = "[]";
    try { if (manualMuridList) candidatesList = manualMuridList; } catch(e){}

    const results = [];

    for (const file of files) {
      const mimeType = file.mimetype;
      const base64EncodeString = file.buffer.toString("base64");
      
      const payload: any = {
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64EncodeString,
                },
              },
              {
                text: `Anda ialah sistem OCR sekolah Malaysia.

Analisa imej borang yang dimuat naik.

Tugas:
1. Baca semua teks dalam borang.
2. Kenal pasti maklumat umum borang.
3. Extract semua nama calon dalam jadual.
4. Extract semua skor dengan tepat.
5. Pulangkan output dalam STRICT VALID JSON sahaja.
6. Jangan beri penerangan tambahan.
7. Jangan gunakan markdown.
8. Jika field kosong, gunakan "".

Senarai calon untuk rujukan: ${candidatesList}

Format output:

{
  "nama_pentaksir": "",
  "nama_guru": "",
  "sekolah": "",
  "mata_pelajaran": "",
  "tarikh": "",
  "rekod_calon": [
    {
      "bil": "",
      "nama_calon": "",
      "skor_gmp": "",
      "skor_kp": "",
      "peratus_beza_skor": "",
      "akur_panduan_penskoran": "",
      "tidak_akur_panduan_penskoran": "",
      "kesilapan_menjumlah": ""
    }
  ]
}

Arahan tambahan:
- Pastikan semua nombor adalah tepat.
- Kekalkan susunan jadual.
- Jangan tertinggal mana-mana calon.
- Jika tulisan tidak jelas, gunakan nilai paling munasabah.
- Jangan reka data.
- Return JSON sahaja.`,
              },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                nama_pentaksir: { type: Type.STRING },
                nama_guru: { type: Type.STRING },
                sekolah: { type: Type.STRING },
                mata_pelajaran: { type: Type.STRING },
                tarikh: { type: Type.STRING },
                rekod_calon: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      bil: { type: Type.STRING },
                      nama_calon: { type: Type.STRING },
                      skor_gmp: { type: Type.STRING },
                      skor_kp: { type: Type.STRING },
                      peratus_beza_skor: { type: Type.STRING },
                      akur_panduan_penskoran: { type: Type.STRING },
                      tidak_akur_panduan_penskoran: { type: Type.STRING },
                      kesilapan_menjumlah: { type: Type.STRING },
                    },
                  }
                }
              }
            },
          },
      };

      try {
        let response;
        let attempt = 0;
        const maxRetries = 3;
        const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];
        while (attempt < maxRetries) {
          try {
             payload.model = fallbackModels[attempt] || "gemini-2.5-flash";
             response = await customAi.models.generateContent(payload);
             break;
          } catch (e: any) {
             const status = e?.status || e?.response?.status;
             const errorMsg = e?.message || "";
             if ((status === 503 || status === 429 || errorMsg.includes("503") || errorMsg.includes("429") || errorMsg.includes("Quota")) && attempt < maxRetries - 1) {
                console.log(`Retry attempt ${attempt + 1} (switching to ${fallbackModels[attempt + 1]}) due to ${status || errorMsg}. Waiting...`);
                await new Promise(r => setTimeout(r, 2000));
                attempt++;
             } else {
                throw e; // Non-retryable error or max retries
             }
          }
        }
        
        if (response && response.text) {
          try {
            const parsed = JSON.parse(response.text.trim());
            if (parsed && typeof parsed === 'object') {
              results.push(parsed);
            }
          } catch (err) {
            console.error("Failed to parse", response.text);
          }
        }
      } catch (err) {
        console.error("Error analyzing a single file:", err);
        throw err;
      }
    }

    res.json({ success: true, data: results });
  } catch (error: any) {
    console.error("Error analyzing form:", error);
    let errorMsg = error.message || "Gagal mengimbas borang.";
    if (error.status === 403 || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED")) {
       errorMsg = "Akses Kunci API Gemini ditolak (Forbidden). Sila semak semula tetapan Kunci API anda.";
    } else if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
       errorMsg = "Kredit/Kuasa Kunci API Gemini percuma telah habis (Quota Exceeded). Sila masukkan Kunci API baru atau cuba lagi kelak.";
    } else if (error.status === 503 || errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand")) {
       errorMsg = "Sistem AI (Gemini) sedang mengalami trafik tinggi. Sila cuba lagi sebentar lagi.";
    }
    res.status(400).json({ error: errorMsg });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
