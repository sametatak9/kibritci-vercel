import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// High limit for base64 PDF/Image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Shared Gemini Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please check your Secrets panel in Settings.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
    });
  }
  return aiClient;
}

// API endpoint to simulate sending a verification email
app.post("/api/send-verification-email", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  console.log(`\n======================================================`);
  console.log(`[MAIL SIMULATION] Verification email successfully sent to: ${email}`);
  console.log(`[MAIL SIMULATION] Code: ${Math.floor(100000 + Math.random() * 900000)}`);
  console.log(`======================================================\n`);
  res.json({ success: true, message: `Verification email simulated and sent to ${email}` });
});

// API endpoint to parse Daily Yoklama / Puantaj Sheet
app.post("/api/parse-daily-yoklama", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const ai = getGeminiClient();
    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const promptText = `
You are an expert HR and timesheet auditing assistant.
Analyze this uploaded Daily Puantaj (Daily Attendance) Sheet.
It contains columns for employee names (Adı Soyadı), role (Görevi), attendance status (Yoklama - Geldi/Yok/İzinli), overtime hours (Fazla Mesai), and signature (İmza).

Please extract:
1. "tarih": The date of the attendance sheet in YYYY-MM-DD format. If missing, default to the current date.
2. "yoklamaKayitlari": An array of all workers listed on the sheet with fields:
   - "adSoyad": Full name.
   - "gorev": Job title/role (e.g. İŞÇİ, FORMEN, USTA, GÜVENLİK, DEPOCU, etc.).
   - "durum": The attendance status mapped to one of: "Geldi", "Yok", "İzinli", "Raporlu".
   - "mesaiSaati": Varsa fazla mesai saati (number, default to 0).

Provide the output strictly conforming to the response schema.
`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında yoklama tarihi" },
        yoklamaKayitlari: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              adSoyad: { type: Type.STRING },
              gorev: { type: Type.STRING },
              durum: { type: Type.STRING, description: "'Geldi', 'Yok', 'İzinli', 'Raporlu'" },
              mesaiSaati: { type: Type.NUMBER }
            },
            required: ["adSoyad", "durum"]
          }
        }
      },
      required: ["tarih", "yoklamaKayitlari"]
    };

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let response;
    let lastError;

    for (const model of models) {
      try {
        console.log(`Parsing daily yoklama with model: ${model}...`);
        response = await ai.models.generateContent({
          model: model,
          contents: [promptText, imagePart],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed for daily yoklama:`, err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All models failed to parse daily yoklama sheet");
    }

    const parsedData = JSON.parse(response.text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in parse-daily-yoklama:", error);
    res.status(500).json({ error: error.message || "Failed to parse daily yoklama sheet" });
  }
});

// API endpoint to parse SGK document (PDF or Image)
app.post("/api/parse-sgk", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType in request body" });
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const promptText = `
You are an expert HR and financial assistant.
Analyze this document. It could be either:
1. A Turkish SGK Job Entry Declaration ("SİGORTALI İŞE GİRİŞ BİLDİRGESİ")
2. A Bank Transfer/Payment Receipt ("DEKONT" / "ÖDEME DEKONTU" / "EFT / HAVALE DEKONTU")

Please extract the following fields and map them to our personnel database structure:

If it is a SGK Job Entry Declaration:
- "tcNo": SOSYAL GÜVENLİK SİCİL NUMARASI (T.C. KİMLİK NUMARASI) (11-digit string).
- "ad": Employee name ("Adı").
- "soyad": Employee surname ("Soyadı").
- "babaAdi": "Baba Adı".
- "dogumTarihi": Birth date in "YYYY-MM-DD" format.
- "iseGirisTarihi": Employment start date in "YYYY-MM-DD" format.
- "cinsiyet": Gender ("Erkek" or "Kadın").
- "adres": "İKAMETGAH ADRESİ" combining details.
- "il" & "ilce": Province & District of residence.
- "gorev": Infer role based on "Meslek Adı" (one of "İŞÇİ", "FORMEN", "USTA", "MÜHENDİS", "MİMAR", "ŞEF", "GÜVENLİK", "DEPOCU").

If it is a DEKONT (Payment/Transfer Receipt):
- "ad" and "soyad": Extract from "Alıcı Adı Soyadı" or "Alıcı" field (the receiver of the money).
- "ibanNo": Extract the Alıcı IBAN number (starting with TR). Remove spaces.
- "bankaAdi": Extract the Alıcı Bank name (the bank receiving the payment, e.g., "GARANTİ BBVA", "ZİRAAT BANKASI", "VAKIFBANK", etc.).
- "tcNo": Extract the Alıcı TC Kimlik No if visible, otherwise leave blank.
- "iseGirisTarihi": Use the transaction date / transfer date of the Dekont in "YYYY-MM-DD" format.
- "gorev": Default to "İŞÇİ" or infer if possible.

Provide the output strictly conforming to the response schema.
`;

    // Automatic retry with exponential backoff and fallback model to handle 503/429 errors gracefully
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let response;
    let success = false;
    let lastError: any = null;

    for (const currentModel of modelsToTry) {
      let retries = 3;
      let delayMs = 1200;
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`Attempting SGK/Dekont parsing with model: ${currentModel} (Attempt ${i + 1}/${retries})...`);
          response = await ai.models.generateContent({
            model: currentModel,
            contents: [imagePart, promptText],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  tcNo: { type: Type.STRING, description: "11-digit Turkish TC Identification Number or receiver's TC" },
                  ad: { type: Type.STRING, description: "First name" },
                  soyad: { type: Type.STRING, description: "Last name" },
                  babaAdi: { type: Type.STRING, description: "Father's name" },
                  dogumTarihi: { type: Type.STRING, description: "Birthdate in YYYY-MM-DD format" },
                  iseGirisTarihi: { type: Type.STRING, description: "Employment start date or transfer date in YYYY-MM-DD format" },
                  cinsiyet: { type: Type.STRING, description: "Gender: 'Erkek' or 'Kadın'" },
                  adres: { type: Type.STRING, description: "Full residential address" },
                  il: { type: Type.STRING, description: "Residence province" },
                  ilce: { type: Type.STRING, description: "Residence district" },
                  gorev: { type: Type.STRING, description: "Role: 'İŞÇİ', 'FORMEN', 'USTA', 'MİMAR', 'MÜHENDİS', 'ŞEF', 'GÜVENLİK', or 'DEPOCU'" },
                  ibanNo: { type: Type.STRING, description: "Alıcı IBAN number starting with TR" },
                  bankaAdi: { type: Type.STRING, description: "Alıcı Bank name" }
                },
                required: ["ad", "soyad"]
              }
            }
          });
          success = true;
          break; // Success! exit retry loop
        } catch (err: any) {
          lastError = err;
          const errorMsg = err.message || "";
          const isTemporary = 
            err.status === 503 || 
            err.status === 429 ||
            errorMsg.includes("503") ||
            errorMsg.includes("UNAVAILABLE") ||
            errorMsg.includes("429") ||
            errorMsg.includes("high demand") ||
            errorMsg.includes("experiencing high demand") ||
            errorMsg.includes("Resource exhausted");

          if (isTemporary && i < retries - 1) {
            console.warn(`Temporary error with ${currentModel} (Attempt ${i + 1}/${retries}). Retrying in ${delayMs}ms... Error: ${errorMsg}`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2;
            continue;
          }
          break; // If non-temporary or max retries reached, exit retry loop to try next model
        }
      }
      if (success) {
        break; // Successfully got response, exit model selection loop
      }
    }

    if (!success || !response) {
      throw lastError || new Error("Failed to receive a response from Gemini API after trying multiple models.");
    }

    if (!response) {
      throw new Error("Failed to receive a response from Gemini API after multiple attempts.");
    }

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing SGK PDF/Image via Gemini:", error);
    res.status(500).json({ error: error.message || "Failed to parse SGK document" });
  }
});

// API endpoint to parse Waybill (İrsaliye) (PDF or Image)
app.post("/api/parse-irsaliye", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType in request body" });
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        irsaliyeNo: { type: Type.STRING },
        tarih: { type: Type.STRING },
        firma: { type: Type.STRING },
        kalemler: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              urunAdi: { type: Type.STRING },
              miktar: { type: Type.NUMBER },
              birim: { type: Type.STRING }
            },
            required: ["urunAdi", "miktar", "birim"]
          }
        }
      },
      required: ["irsaliyeNo", "tarih", "firma", "kalemler"]
    };

    const userPrompt = "Lütfen ekteki teslimat irsaliyesi (waybill / delivery note) belgesini analiz et. İrsaliye numarasını (irsaliyeNo), tarihini (tarih) (YYYY-MM-DD formatında), gönderen / satıcı firma adını (firma) ve teslim edilen tüm malzeme kalemlerini (kalemler listesi altında urunAdi, miktar ve birim olarak) çıkar.";

    // Try multiple models in order of resilience
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let response;
    let lastError;

    for (const model of models) {
      try {
        console.log(`Parsing irsaliye with model: ${model}...`);
        response = await ai.models.generateContent({
          model: model,
          contents: [userPrompt, imagePart],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed for irsaliye, trying next:`, err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All models failed or returned empty response from Gemini API");
    }

    const parsedData = JSON.parse(response.text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing İrsaliye PDF/Image via Gemini:", error);
    res.status(500).json({ error: error.message || "Failed to parse waybill document" });
  }
});

// API endpoint to parse Invoice (Fatura) (PDF or Image)
app.post("/api/parse-fatura", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType in request body" });
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        faturaNo: { type: Type.STRING },
        tarih: { type: Type.STRING },
        firma: { type: Type.STRING },
        kalemler: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              urunAdi: { type: Type.STRING },
              miktar: { type: Type.NUMBER },
              birim: { type: Type.STRING },
              birimFiyat: { type: Type.NUMBER },
              kdvOran: { type: Type.NUMBER },
              toplam: { type: Type.NUMBER }
            },
            required: ["urunAdi", "miktar", "birim", "birimFiyat", "kdvOran", "toplam"]
          }
        },
        toplamTutar: { type: Type.NUMBER },
        kdvTutar: { type: Type.NUMBER },
        genelToplam: { type: Type.NUMBER }
      },
      required: ["faturaNo", "tarih", "firma", "kalemler", "toplamTutar", "kdvTutar", "genelToplam"]
    };

    const userPrompt = "Lütfen ekteki faturayı (invoice) analiz et. Fatura numarasını (faturaNo), faturanın kesildiği tarihi (tarih) (YYYY-MM-DD formatında), satıcı firma adını (firma), faturadaki tüm mal veya hizmet kalemlerini (kalemler listesi altında urunAdi, miktar, birim, birimFiyat, kdvOran yüzde olarak örn. 20, ve toplam tutarı) çıkar. Ayrıca toplam matrahı (toplamTutar), KDV tutarını (kdvTutar) ve ödenecek genel toplamı (genelToplam) çıkar.";

    // Try multiple models in order of resilience
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let response;
    let lastError;

    for (const model of models) {
      try {
        console.log(`Parsing fatura with model: ${model}...`);
        response = await ai.models.generateContent({
          model: model,
          contents: [userPrompt, imagePart],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed for fatura, trying next:`, err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All models failed or returned empty response from Gemini API");
    }

    const parsedData = JSON.parse(response.text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing Fatura PDF/Image via Gemini:", error);
    res.status(500).json({ error: error.message || "Failed to parse invoice document" });
  }
});

// API endpoint to perform AI-based 3-way match comparison
app.post("/api/compare-3way", async (req, res) => {
  try {
    const { saTalebi, irsaliyeler, fatura } = req.body;
    if (!fatura) {
      return res.status(400).json({ error: "Missing fatura data in request body" });
    }

    const ai = getGeminiClient();

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: "Must be either 'SORUNSUZ ONAY' or 'SORUNLU'" },
        discrepancies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of found differences or discrepancies, empty if none"
        },
        reportText: { type: Type.STRING, description: "A detailed Turkish summary comparing PO vs Waybills vs Invoice" }
      },
      required: ["status", "discrepancies", "reportText"]
    };

    const promptText = `
You are an expert construction auditor and accountant.
Perform a strict 3-way match audit between:
1. Satın Alma Siparişi (Purchase Order):
${JSON.stringify(saTalebi || "No PO linked", null, 2)}

2. Bağlı İrsaliyeler (Delivery Waybills):
${JSON.stringify(irsaliyeler || "No waybills linked", null, 2)}

3. Gelen Fatura (Invoice):
${JSON.stringify(fatura, null, 2)}

Perform a comparison of:
- Item names / categories (normalize differences like typo variants, e.g. "Stablize" vs "Stabilize").
- Quantities ordered in PO vs quantities delivered in waybills vs quantities billed in invoice.
- Any price discrepancies if unit prices are specified.

Audit Rules:
- If all quantities and items match perfectly (meaning what was ordered matches what was delivered, which in turn matches what was billed), return status as "SORUNSUZ ONAY".
- If there is any discrepancy (e.g., delivered quantity is different from billed quantity, or items on invoice don't exist in waybills or PO), list them in 'discrepancies' and return status as "SORUNLU".
- Write a beautifully styled Turkish markdown report summary in 'reportText'. Explain details clearly to a site manager.

Provide the response strictly conforming to the requested schema.
`;

    // Try multiple models in order of resilience
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let response;
    let lastError;

    for (const model of models) {
      try {
        console.log(`Comparing 3-way with model: ${model}...`);
        response = await ai.models.generateContent({
          model: model,
          contents: promptText,
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed for 3-way comparison, trying next:`, err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All models failed or returned empty response from Gemini API for 3-way match");
    }

    const parsedData = JSON.parse(response.text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in AI 3-Way Match:", error);
    res.status(500).json({ error: error.message || "Failed to perform 3-way comparison" });
  }
});

// API endpoint to parse legacy documents for import
app.post("/api/parse-legacy-document", async (req, res) => {
  try {
    const { fileBase64, mimeType, docType } = req.body;
    if (!fileBase64 || !mimeType || !docType) {
      return res.status(400).json({ error: "Missing fileBase64, mimeType or docType in request body" });
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    let responseSchema: any;
    let userPrompt = "";

    if (docType === "fatura") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          faturaNo: { type: Type.STRING },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
          cariUnvan: { type: Type.STRING, description: "Faturayı kesen / satan satıcı firma adı (cari ünvan)" },
          toplamTutar: { type: Type.NUMBER, description: "Toplam matrah tutarı (KDV hariç)" },
          kdvTutar: { type: Type.NUMBER, description: "Toplam hesaplanan KDV tutarı" },
          genelToplam: { type: Type.NUMBER, description: "Ödenecek genel toplam tutar (KDV dahil)" },
          kalemler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urunAdi: { type: Type.STRING, description: "Ürün veya hizmet adı" },
                miktar: { type: Type.NUMBER, description: "Miktar" },
                birim: { type: Type.STRING, description: "Birim (ADET, KG, TON, M3 vb.)" },
                birimFiyat: { type: Type.NUMBER, description: "Birim fiyatı" },
                kdvOran: { type: Type.NUMBER, description: "KDV oranı yüzde olarak (örn: 20)" },
                toplam: { type: Type.NUMBER, description: "Kalem toplamı" }
              },
              required: ["urunAdi", "miktar", "birim", "birimFiyat", "kdvOran", "toplam"]
            }
          }
        },
        required: ["faturaNo", "tarih", "cariUnvan", "toplamTutar", "kdvTutar", "genelToplam", "kalemler"]
      };
      userPrompt = "Lütfen ekteki faturayı (invoice) analiz et. Fatura numarasını, tarihini (YYYY-MM-DD formatında), faturayı kesen firma ünvanını, toplam matrahı, KDV tutarını, genel toplamı ve kalem listesini (urunAdi, miktar, birim, birimFiyat, kdvOran, toplam) çıkar.";
    } else if (docType === "irsaliye") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          irsaliyeNo: { type: Type.STRING },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
          firma: { type: Type.STRING, description: "Sevk eden / gönderen firma adı" },
          kalemler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urunAdi: { type: Type.STRING, description: "Malzeme adı" },
                miktar: { type: Type.NUMBER, description: "Miktar" },
                birim: { type: Type.STRING, description: "Birim (ADET, KG, TON vb.)" }
              },
              required: ["urunAdi", "miktar", "birim"]
            }
          }
        },
        required: ["irsaliyeNo", "tarih", "firma", "kalemler"]
      };
      userPrompt = "Lütfen ekteki irsaliyeyi (waybill / sevk irsaliyesi) analiz et. İrsaliye numarasını, tarihini (YYYY-MM-DD formatında), sevk eden firma ünvanını ve sevk edilen malzeme listesini (urunAdi, miktar, birim) çıkar.";
    } else if (docType === "makbuz") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          referansId: { type: Type.STRING, description: "Makbuz numarası, işlem no veya dekont referans no" },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında işlem tarihi" },
          aciklama: { type: Type.STRING, description: "Ödeme açıklaması veya makbuz içeriği" },
          tutar: { type: Type.NUMBER, description: "Ödenen / tahsil edilen toplam tutar" },
          firma: { type: Type.STRING, description: "Ödemeyi yapan ya da alan muhatap firma/kişi adı" },
          hareketTipi: { type: Type.STRING, description: "İşlem tipine göre 'ÇIKIŞ' (ödeme yapıldıysa) veya 'GİRİŞ' (tahsilat/para alındıysa)" }
        },
        required: ["referansId", "tarih", "aciklama", "tutar", "firma", "hareketTipi"]
      };
      userPrompt = "Lütfen ekteki makbuzu, tediye fişini, gider makbuzunu veya banka dekontunu analiz et. Referans numarasını/makbuz no, tarihini (YYYY-MM-DD), açıklamasını, ödenen/alınan net tutarı, muhatap firma veya kişi adını ve para çıkışı ise 'ÇIKIŞ', para girişi ise 'GİRİŞ' olacak şekilde hareketTipi alanını çıkar.";
    } else if (docType === "hakedis") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          faturaNo: { type: Type.STRING, description: "Hakediş kapağı no, fatura no veya hakediş no" },
          donem: { type: Type.STRING, description: "Hangi döneme ait olduğu (örn: Haziran 2026, Hakediş No: 3 vb.)" },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında hakediş onay veya düzenleme tarihi" },
          cariUnvan: { type: Type.STRING, description: "Hakediş sahibi yüklenici / taşeron / ana firma adı" },
          toplamTutar: { type: Type.NUMBER, description: "KDV hariç hakediş tutarı (ara toplam)" },
          kdvTutar: { type: Type.NUMBER, description: "Hakediş KDV tutarı" },
          genelToplam: { type: Type.NUMBER, description: "KDV dahil ödenecek hakediş toplam tutarı" },
          aciklama: { type: Type.STRING, description: "Hakediş açıklaması, yapılan işler vb. detaylar" }
        },
        required: ["faturaNo", "donem", "tarih", "cariUnvan", "toplamTutar", "kdvTutar", "genelToplam", "aciklama"]
      };
      userPrompt = "Lütfen ekteki hakediş belgesini, hakediş kapağını veya hakediş raporunu analiz et. Hakediş/fatura numarasını, dönemini (donem), tarihini (YYYY-MM-DD), yüklenici/taşeron firma ünvanını, KDV hariç toplamı (toplamTutar), KDV tutarını, genel toplamı ve kısa iş açıklamasını çıkar.";
    } else if (docType === "yoklama") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: "İlgili ay, dönem veya tarih (örn: Haziran 2026 veya 2026-06-15)" },
          yoklamaKayitlari: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                adSoyad: { type: Type.STRING, description: "Personel adı soyadı (örn: 'Ahmet Yılmaz')" },
                durum: { type: Type.STRING, description: "'Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil' durumlarından biri" },
                gunNo: { type: Type.NUMBER, description: "Hangi gün olduğu (1-31 arası tamsayı, örn: 15. gün ise 15)" },
                mesaiSaati: { type: Type.NUMBER, description: "Varsa fazla mesai saati" }
              },
              required: ["adSoyad", "durum"]
            }
          }
        },
        required: ["yoklamaKayitlari"]
      };
      userPrompt = "Lütfen ekteki personel yoklama listesini, puantaj tablosunu veya şantiye yoklama tutanağını analiz et. İlgili ayı veya tarihi tespit et, listedeki tüm personellerin isimlerini ve yoklama/puantaj durumlarını ('Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil') yoklamaKayitlari dizisinde çıkar.";
    } else if (docType === "saha_faaliyet") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında rapor tarihi" },
          isNiteligi: { type: Type.STRING, description: "İşin niteliği, türü (örn: 'Beton Dökümü', 'Kalıp Çakımı', 'Hafriyat ve Kazı')" },
          parsel: { type: Type.STRING, description: "Parsel no (örn: 'Parsel A' veya 'Parsel 3')" },
          blok: { type: Type.STRING, description: "Blok no (örn: 'Blok 1' veya 'Blok B')" },
          aciklama: { type: Type.STRING, description: "Günlük şantiyede yapılan faaliyet açıklamaları ve detayları" },
          aktifPersonelListesi: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Şantiye sahasında aktif görev alan personellerin isim listesi"
          }
        },
        required: ["tarih", "isNiteligi", "aciklama"]
      };
      userPrompt = "Lütfen ekteki Günlük Saha Faaliyet Raporunu veya şantiye günlük faaliyet logunu analiz et. Rapor tarihini (YYYY-MM-DD), yapılan işlerin niteliğini (isNiteligi), parsel ve blok bilgilerini, günlük özet faaliyet detaylarını ve sahada çalışan aktif personellerin isim listesini çıkar.";
    } else if (docType === "auto") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          detectedType: { type: Type.STRING, description: "Tespit edilen döküman türü: 'fatura', 'irsaliye', 'makbuz', 'hakedis', 'yoklama', or 'saha_faaliyet'" },
          
          faturaNo: { type: Type.STRING },
          irsaliyeNo: { type: Type.STRING },
          referansId: { type: Type.STRING },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
          donem: { type: Type.STRING, description: "Dönem (örn: Haziran 2026)" },
          firma: { type: Type.STRING, description: "Firma / Şahıs / Alıcı / Satıcı / Cari adı" },
          cariUnvan: { type: Type.STRING, description: "Cari ünvan veya firma ünvanı" },
          toplamTutar: { type: Type.NUMBER },
          kdvTutar: { type: Type.NUMBER },
          genelToplam: { type: Type.NUMBER },
          tutar: { type: Type.NUMBER },
          aciklama: { type: Type.STRING },
          hareketTipi: { type: Type.STRING, description: "'GİRİŞ' veya 'ÇIKIŞ'" },
          kalemler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urunAdi: { type: Type.STRING },
                miktar: { type: Type.NUMBER },
                birim: { type: Type.STRING },
                birimFiyat: { type: Type.NUMBER },
                kdvOran: { type: Type.NUMBER },
                toplam: { type: Type.NUMBER }
              }
            }
          },

          yoklamaKayitlari: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                adSoyad: { type: Type.STRING, description: "Personel adı soyadı (örn: 'Ahmet Yılmaz')" },
                durum: { type: Type.STRING, description: "'Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil' durumlarından biri" },
                gunNo: { type: Type.NUMBER, description: "Ayın hangi günü olduğu (1-31 arası sayı, örn: 15)" },
                mesaiSaati: { type: Type.NUMBER, description: "Fazla mesai saati" }
              },
              required: ["adSoyad", "durum"]
            }
          },

          isNiteligi: { type: Type.STRING, description: "İşin niteliği (örn: 'Beton Dökümü')" },
          parsel: { type: Type.STRING, description: "Şantiye parseli (örn: 'Parsel A')" },
          blok: { type: Type.STRING, description: "Şantiye blok bilgisi (örn: 'Blok 1')" },
          aktifPersonelListesi: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Sahada görev alan personellerin isimleri"
          }
        },
        required: ["detectedType"]
      };
      userPrompt = `Lütfen ekteki dökümanı analiz et ve tipini otomatik tespit et.
Döküman tipleri şunlar olabilir:
1. 'fatura' (Fatura / Gider Faturası) - Fatura numarası, tarih, satıcı firma, tutarlar, KDV, kalemler varsa buraya girer.
2. 'irsaliye' (Sevk İrsaliyesi / Teslimat Evrakı) - Ürün teslimat dökümleri, irsaliye numarası, gönderici, miktarlar buraya girer.
3. 'makbuz' (Dekont / Makbuz / Gider Pusulası) - Ödeme dekontu, tediye fişi, banka havalesi, tutar ve hareketTipi ('ÇIKIŞ' veya 'GİRİŞ') buraya girer.
4. 'hakedis' (Hakediş Kapağı / Taşeron Hakedişi) - Taşeron hakediş raporları, dönemler, hakediş bedeli, iş açıklamaları buraya girer.
5. 'yoklama' (Yoklama / Puantaj Listesi) - Personel yoklama listesi, puantaj tablosu, günlük/aylık yoklama durumları buraya girer.
6. 'saha_faaliyet' (Günlük Saha Faaliyet Raporu) - Şantiyede yapılan işler, beton dökümü, kalıp işleri, parsel, blok ve sahada çalışan aktif personellerin adları buraya girer.

Lütfen en uygun kategoriyi 'detectedType' alanına atayıp dökümandaki ilgili tüm alanları büyük bir titizlikle çıkar.`;
    } else {
      return res.status(400).json({ error: "Invalid docType specified" });
    }

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let response;
    let lastError;

    for (const model of models) {
      try {
        console.log(`Parsing legacy document type ${docType} with ${model}...`);
        response = await ai.models.generateContent({
          model: model,
          contents: [userPrompt, imagePart],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next:`, err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All models failed to parse document");
    }

    const parsedData = JSON.parse(response.text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in parse-legacy-document endpoint:", error);
    res.status(500).json({ error: error.message || "Failed to parse legacy document" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Sen Kibritçi İnşaat ERP sisteminin akıllı yapay zeka şantiye asistanısın. Kullanıcıya şantiye yönetimi, personel, stok ve genel inşaat ERP süreçleri hakkında yardımcı oluyorsun. Lütfen kısa, anlaşılır, kibar ve çözüm odaklı bir yanıt ver. Kullanıcı mesajı: ${message}`
    });
    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error in chat assistant endpoint:", error);
    res.status(500).json({ error: error.message || "Failed to process message" });
  }
});

// Vite & Static file handler
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
