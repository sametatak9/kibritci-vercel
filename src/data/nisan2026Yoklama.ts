import { LegacyExcelMonthData } from './legacyExcelYoklama';

const ALL = Array.from({ length: 30 }, (_, i) => i + 1);
/** Nisan 2026 Pazar günleri */
const SUN = [5, 12, 19, 26];
const WK = ALL.filter(d => !SUN.includes(d));
/** 10.04 giriş — tipik tam ay deseni */
const F10 = [10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30];
/** 1.04 giriş — Pazar hariç tam ay */
const F1 = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30];
const M515 = { 15: 5, 16: 5, 17: 5, 18: 5, 19: 5, 20: 5 };
const M1_15_27 = { 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1 };
const F18 = [18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30];
const F22 = [22, 23, 24, 25, 26, 27, 29, 30];
const F23 = [23, 24, 25, 26, 27, 29, 30];
const F25 = [25, 26, 27, 29, 30];

/** Nisan 2026 — 3 ekran görüntüsü (satır 1–80) */
export const NISAN_2026_YOKLAMA: LegacyExcelMonthData = {
  year: 2026,
  month: 4,
  personeller: [
    // — Resim 1 (1–20) —
    { excelId: 1, ad: 'MUTLU', soyad: 'ŞİMŞEK', gorev: 'FORMEN', maas: 60000, iseGirisTarihi: '2026-03-07', calismaGunleri: ALL, mesaiGunleri: { 1: 3, 2: 4, 4: 11, 5: 5, 6: 4, 7: 3, 8: 4, 9: 6, 10: 4, 11: 13, 12: 5, 13: 3, 14: 6, 15: 6, 16: 3, 17: 3, 18: 10, 19: 4, 20: 5, 23: 13, 24: 4, 25: 8, 26: 8, 27: 4, 28: 8, 29: 3, 30: 3 } },
    { excelId: 2, ad: 'ŞAHİN', soyad: 'ŞAHİNOĞLU', gorev: 'FORMEN', maas: 60000, iseGirisTarihi: '2026-03-07', calismaGunleri: ALL, mesaiGunleri: { 4: 8, 5: 5, 8: 3, 9: 3, 11: 8, 12: 3, 13: 3, 14: 3, 15: 3, 16: 3, 18: 8, 19: 4, 20: 5, 23: 8, 24: 3, 25: 5, 26: 8, 27: 4, 28: 3, 30: 5 } },
    { excelId: 3, ad: 'YASİN', soyad: 'EFE', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: ALL, mesaiGunleri: { 9: 3, 12: 8, 13: 3, 14: 3, 15: 3, 18: 8, 19: 4, 20: 5, 24: 3, 25: 5, 26: 8, 28: 2, 30: 5 } },
    { excelId: 4, ad: 'YUNUS', soyad: 'POLAT', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: ALL, mesaiGunleri: { 6: 5, 12: 8, 24: 3, 26: 3, 28: 5 } },
    { excelId: 5, ad: 'VEYSİ', soyad: 'DOĞAN', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: ALL.filter(d => d < 16 || d > 22), izinliGunleri: [16, 17, 18, 19, 20, 21, 22], mesaiGunleri: { 6: 5, 12: 8, 25: 3, 28: 4 } },
    { excelId: 6, ad: 'MEHMET', soyad: 'AKTAŞ', gorev: 'USTA', maas: 60000, istenCikisTarihi: '2026-04-27', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27], mesaiGunleri: { 12: 8, 18: 8, 26: 8 } },
    { excelId: 7, ad: 'YAKUP', soyad: 'AKTAŞ', gorev: 'USTA', maas: 60000, istenCikisTarihi: '2026-04-27', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 24, 25, 26, 27], izinliGunleri: [21, 22, 23], mesaiGunleri: { 12: 8, 18: 8, 26: 8 } },
    { excelId: 8, ad: 'KASIM', soyad: 'DOĞAN', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-04-09', calismaGunleri: [9, 10, 11, 12, 13, 14, 23, 24, 25, 26, 27, 28, 29, 30], izinliGunleri: [15, 16, 17, 18, 19, 20, 21, 22], mesaiGunleri: { 12: 8, 26: 3 } },
    { excelId: 9, ad: 'ABDULHADİ', soyad: 'ÇELEBİ', gorev: 'USTA', maas: 60000, istenCikisTarihi: '2026-04-27', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 23, 24, 25, 26, 27], izinliGunleri: [15, 16, 17, 18, 19, 20, 21, 22], mesaiGunleri: { 12: 8, 26: 8 } },
    { excelId: 10, ad: 'İSMAİL', soyad: 'MALKOÇ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-04', calismaGunleri: ALL, mesaiGunleri: { 21: 4, 22: 3, 26: 8 } },
    { excelId: 11, ad: 'COŞKUN', soyad: 'SEZGİN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-25', calismaGunleri: [1, 2, 3, 4, 6, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25], izinliGunleri: [7, 8, 9, 10, 11], mesaiGunleri: { 18: 8, 21: 4, 22: 3 } },
    { excelId: 12, ad: 'MUHAMMED', soyad: 'ÇELİK', gorev: 'ŞENÖR', maas: 30000, iseGirisTarihi: '2026-04-13', calismaGunleri: [13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30], mesaiGunleri: { 2: 2, 5: 8, 9: 8, 10: 5, 12: 8, 13: 5, 14: 5, 15: 5, 18: 8, 23: 8, 26: 8, 28: 2 } },
    { excelId: 13, ad: 'SUAT', soyad: 'ERYILDIRIM', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-06', calismaGunleri: [1, 2, 3, 4, 5, 6] },
    { excelId: 14, ad: 'YUSUF ALİ', soyad: 'ŞİŞİK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26], izinliGunleri: [27, 28, 29, 30], mesaiGunleri: { 26: 8 } },
    { excelId: 15, ad: 'ENES', soyad: 'BULUT', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: ALL, mesaiGunleri: { 2: 5, 5: 5, 9: 3, 11: 5, 12: 8, 13: 3, 14: 3, 15: 3, 18: 8, 19: 4, 20: 5, 24: 3, 25: 5, 26: 8, 27: 4, 28: 3, 30: 5 } },
    { excelId: 16, ad: 'AMED', soyad: 'EKEN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-10', calismaGunleri: [1, 2, 3, 4, 5, 6, 7] },
    { excelId: 17, ad: 'AHMET', soyad: 'GÖL', gorev: 'ŞEF', maas: 60000, istenCikisTarihi: '2026-04-14', calismaGunleri: [1, 5, 6, 7, 8, 9, 10, 11, 13, 14], izinliGunleri: [2, 3, 4] },
    { excelId: 18, ad: 'ÖMER', soyad: 'YUSUF', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-07', calismaGunleri: [1, 2, 3, 4, 5, 6, 7] },
    { excelId: 19, ad: 'BARAN', soyad: 'ÇELİK', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-08', calismaGunleri: [5, 6, 7, 8], izinliGunleri: [1, 2, 3, 4] },
    { excelId: 20, ad: 'EMRAH', soyad: 'VANER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: ALL, mesaiGunleri: { 12: 8, 14: 3, 19: 8, 26: 8 } },
    // — Resim 2 (21–40) —
    { excelId: 21, ad: 'EYÜP', soyad: 'VANER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: WK, mesaiGunleri: { 5: 8, 12: 3, 19: 8, 26: 8 } },
    { excelId: 22, ad: 'ABDURRAHMAN', soyad: 'ÇİTO', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: WK, izinliGunleri: [11], mesaiGunleri: { 5: 8, 12: 8, 19: 8, 21: 4, 22: 3, 26: 8, 28: 3 } },
    { excelId: 23, ad: 'ALİ SAMET', soyad: 'VANER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: WK.filter(d => d !== 12 && d !== 27), izinliGunleri: [12, 27], mesaiGunleri: { 5: 8, 12: 8, 19: 8, 26: 8 } },
    { excelId: 24, ad: 'HARUN', soyad: 'ADIYAMAN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-18', calismaGunleri: WK.filter(d => d !== 9 && d !== 10), izinliGunleri: [9, 10], mesaiGunleri: { 5: 8, 12: 8, 19: 8, 21: 4, 22: 3, 26: 8 } },
    { excelId: 25, ad: 'MUSTAFA', soyad: 'COŞKUN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-06', calismaGunleri: [1, 2, 3, 4, 5, 6] },
    { excelId: 26, ad: 'SERVET', soyad: 'TEMİZ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-06', calismaGunleri: [1, 2, 3, 4, 5, 6], mesaiGunleri: { 5: 8 } },
    { excelId: 27, ad: 'EMRAH', soyad: 'BALI', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-06', calismaGunleri: [1, 2, 3, 4, 5, 6], mesaiGunleri: { 5: 8 } },
    { excelId: 28, ad: 'ABDULHAKİM', soyad: 'KORKUT', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-24', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24], mesaiGunleri: { 5: 8 } },
    { excelId: 29, ad: 'İDRİS', soyad: 'İÇTEN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-10', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9, 10] },
    { excelId: 30, ad: 'FURKAN', soyad: 'HİÇDÖNMEZ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: WK.filter(d => d !== 11 && d !== 25 && d !== 30), izinliGunleri: [11, 25, 30] },
    { excelId: 31, ad: 'TANER', soyad: 'AKTAŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2025-11-01', calismaGunleri: WK.filter(d => d !== 24 && d !== 25), izinliGunleri: [24, 25], mesaiGunleri: { 5: 8, 12: 3, 21: 4, 24: 8, 26: 8 } },
    { excelId: 32, ad: 'MEHMET', soyad: 'TURHAN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: WK.filter(d => d !== 30), izinliGunleri: [30], mesaiGunleri: { 3: 8, 5: 3, 12: 8, 21: 4, 22: 3, 26: 8, 27: 3 } },
    { excelId: 33, ad: 'MUHARREM', soyad: 'GÜRBÜZ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-04', calismaGunleri: [1, 2, 3, 4] },
    { excelId: 34, ad: 'SEDAT', soyad: 'ÇITANAK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: WK.filter(d => d !== 1 && d !== 11), izinliGunleri: [1, 11], mesaiGunleri: { 12: 8, 21: 4, 22: 3, 26: 8 } },
    { excelId: 35, ad: 'GÖKHAN', soyad: 'NEBİOĞLU', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-02', calismaGunleri: [1, 2] },
    { excelId: 36, ad: 'MUHAMMED', soyad: 'KARAKUŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-02', calismaGunleri: [1, 2] },
    { excelId: 37, ad: 'MEVLÜT SEFA', soyad: 'BÜLBÜL', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-31', calismaGunleri: WK, mesaiGunleri: { 12: 8, 19: 8, 26: 8 } },
    { excelId: 38, ad: 'ALİ RIZA', soyad: 'ŞAHİN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-09', calismaGunleri: [1, 2, 3, 4, 6, 7, 8, 9] },
    { excelId: 39, ad: 'RECEP', soyad: 'SOLAK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-06', calismaGunleri: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30], mesaiGunleri: { 26: 8 } },
    { excelId: 40, ad: 'MUSA', soyad: 'MULLAOĞLU', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-09', calismaGunleri: F10, mesaiGunleri: { 12: 8, 19: 8, 21: 4, 22: 3, 26: 8 } },
    // — Resim 3 (41–80) —
    { excelId: 41, ad: 'HASAN', soyad: 'ZORLU', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10 },
    { excelId: 42, ad: 'GÜNAY', soyad: 'AYDIN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10 },
    { excelId: 43, ad: 'TAHSİN', soyad: 'OTMAN', gorev: 'USTA', maas: 45000, iseGirisTarihi: '2026-04-01', calismaGunleri: F1, mesaiGunleri: M515 },
    { excelId: 44, ad: 'NECMETTİN İLHAN', soyad: 'DEMİR', gorev: 'USTA', maas: 45000, iseGirisTarihi: '2026-04-01', calismaGunleri: F1, mesaiGunleri: M515 },
    { excelId: 45, ad: 'FIRAT BARIŞ', soyad: 'TEPEALTI', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: { 15: 4, 16: 3 } },
    { excelId: 46, ad: 'TUNCAY', soyad: 'BOYAL', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M515 },
    { excelId: 47, ad: 'SERVET', soyad: 'ÖZASLAN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M515 },
    { excelId: 48, ad: 'MUSTAFA', soyad: 'BULUT', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 49, ad: 'MERT', soyad: 'AKA', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 50, ad: 'ŞEHMUS', soyad: 'TOPÇUOĞLU', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 51, ad: 'METİN', soyad: 'ASLANCI', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M515 },
    { excelId: 52, ad: 'OSMAN', soyad: 'KALAY', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 53, ad: 'MEHMET', soyad: 'POLAT', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M1_15_27 },
    { excelId: 54, ad: 'MEVLAN', soyad: 'SARI', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M1_15_27 },
    { excelId: 55, ad: 'SAMET', soyad: 'SARI', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M1_15_27 },
    { excelId: 56, ad: 'ÖZCAN', soyad: 'POLAT', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 57, ad: 'ARDA', soyad: 'SARI', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: M1_15_27 },
    { excelId: 58, ad: 'UMUT', soyad: 'EREN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 59, ad: 'FERHAT', soyad: 'YARALI', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 60, ad: 'SONER', soyad: 'AKIN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 61, ad: 'AYHAN', soyad: 'ÇİĞDEMCİ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 62, ad: 'YILMAZ', soyad: 'AKTAŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 63, ad: 'SEYFETTİN', soyad: 'BAYRAM', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-27', calismaGunleri: [] },
    { excelId: 64, ad: 'İSMAİL', soyad: 'ERGÜN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-30', calismaGunleri: [30] },
    { excelId: 65, ad: 'AZİZ', soyad: 'GÜLER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-18', calismaGunleri: F18 },
    { excelId: 66, ad: 'HÜSEYİN SAMET', soyad: 'ATAK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10 },
    { excelId: 67, ad: 'ÖMER', soyad: 'SARI', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-04-21', calismaGunleri: [22, 23, 24, 25, 26, 27, 29, 30], mesaiGunleri: { 25: 1 } },
    { excelId: 68, ad: 'MUHAMMED', soyad: 'ALTUNTAŞ', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-04-10', calismaGunleri: F10, mesaiGunleri: { 25: 1, 26: 1 } },
    { excelId: 69, ad: 'CEVDET', soyad: 'ÜLEZ', gorev: 'USTA', maas: 45000, iseGirisTarihi: '2026-04-18', calismaGunleri: F18 },
    { excelId: 70, ad: 'CEMİL', soyad: 'ÇETİN', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-04-18', calismaGunleri: F18 },
    { excelId: 71, ad: 'İSLAM', soyad: 'ÜLEZ', gorev: 'USTA', maas: 45000, iseGirisTarihi: '2026-04-23', calismaGunleri: [23, 24, 25, 26, 27, 29, 30] },
    { excelId: 72, ad: 'DOĞUŞ', soyad: 'BALİ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-25', calismaGunleri: F25, mesaiGunleri: { 26: 3 } },
    { excelId: 73, ad: 'HAMZA', soyad: 'TOĞMUŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-22', calismaGunleri: F22, mesaiGunleri: { 26: 4 } },
    { excelId: 74, ad: 'İBRAHİM', soyad: 'TUNÇ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-22', calismaGunleri: F22, mesaiGunleri: { 26: 4 } },
    { excelId: 75, ad: 'SEDAT', soyad: 'KÖSEN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-27', calismaGunleri: [27, 29, 30], mesaiGunleri: { 27: 1, 29: 2 } },
    { excelId: 76, ad: 'YAVUZ', soyad: 'BEYAZDUMAN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-23', calismaGunleri: F23, mesaiGunleri: { 26: 3, 29: 2 } },
    { excelId: 77, ad: 'EMRE', soyad: 'DİNÇ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-22', calismaGunleri: F22, mesaiGunleri: { 26: 4 } },
    { excelId: 78, ad: 'ADEM', soyad: 'ÇAĞLAR', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-22', calismaGunleri: F22 },
    { excelId: 79, ad: 'EMRE', soyad: 'PEKMEZ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-04-30', calismaGunleri: [30] },
  ],
};
