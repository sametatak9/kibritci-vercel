/**
 * Eski Excel puantaj defterinden aktarılan personel ve yoklama kayıtları.
 * Her excelId benzersizdir — aynı isim farklı kişi olsa bile karışmaz.
 */

export interface LegacyExcelPersonRecord {
  excelId: number;
  ad: string;
  soyad: string;
  gorev: string;
  maas: number;
  /** YYYY-MM-DD */
  istenCikisTarihi?: string;
  /** Ayın hangi günlerinde X işareti var */
  calismaGunleri: number[];
  /** Ayın hangi günlerinde mesai var (saat) — boşsa 0 */
  mesaiGunleri?: Record<number, number>;
  /** Excel'de Y işaretli günler → İzinli */
  izinliGunleri?: number[];
  /** YYYY-MM-DD işe giriş */
  iseGirisTarihi?: string;
}

export interface LegacyExcelMonthData {
  year: number;
  month: number;
  personeller: LegacyExcelPersonRecord[];
}

/** Şubat 2026 — iş yeni başladı; çoğu personel ay sonunda 1–6 gün çalışmış (Excel satır 1–15) */
export const SUBAT_2026_YOKLAMA: LegacyExcelMonthData = {
  year: 2026,
  month: 2,
  personeller: [
    { excelId: 1, ad: 'ONUR', soyad: 'DURSUN', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-10', calismaGunleri: [28] },
    { excelId: 2, ad: 'MAHMUT', soyad: 'İVGEN', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-14', calismaGunleri: [28] },
    { excelId: 3, ad: 'YİĞİTCAN', soyad: 'DEMİRCAN', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-17', calismaGunleri: [28] },
    { excelId: 4, ad: 'ŞÜKRÜ', soyad: 'ÇELPİŞ', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [28] },
    { excelId: 5, ad: 'BERAT', soyad: 'DEMİRCAN', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-17', calismaGunleri: [28] },
    { excelId: 6, ad: 'ANIL', soyad: 'TUZCUOĞLU', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-31', calismaGunleri: [24, 25, 26, 27, 28] },
    { excelId: 7, ad: 'NEZİH', soyad: 'SERT', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-31', calismaGunleri: [24, 25, 26, 27, 28] },
    { excelId: 8, ad: 'ENES', soyad: 'PURLİK', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-31', calismaGunleri: [23, 24, 25, 26, 27, 28] },
    { excelId: 9, ad: 'GÖRKEM', soyad: 'CİVGA', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-13', calismaGunleri: [27, 28] },
    { excelId: 10, ad: 'EFE', soyad: 'DEMİRPOLAT', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-13', calismaGunleri: [27, 28] },
    { excelId: 11, ad: 'OSMAN', soyad: 'BATAK', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [27, 28] },
    { excelId: 12, ad: 'MUSTAFA', soyad: 'ÇELPİŞ', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [27, 28] },
    { excelId: 13, ad: 'SEMİH', soyad: 'YAKA', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-12', calismaGunleri: [27, 28] },
    { excelId: 14, ad: 'KORAY KADİR', soyad: 'İRKÖRÜCÜ', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-02-28', calismaGunleri: [27, 28] },
    { excelId: 15, ad: 'RAMAZAN', soyad: 'KUŞBABA', gorev: 'İŞÇİ', maas: 30000, istenCikisTarihi: '2026-02-28', calismaGunleri: [28] },
  ],
};

/** Mart 2026 — 3 ekran görüntüsünden aktarıldı (Excel satır ID 1–60) */
export const MART_2026_YOKLAMA: LegacyExcelMonthData = {
  year: 2026,
  month: 3,
  personeller: [
    // — Resim 1 (satır 1–20) —
    { excelId: 1, ad: 'MUTLU', soyad: 'ŞİMŞEK', gorev: 'FORMEN', maas: 60000, iseGirisTarihi: '2026-03-09', calismaGunleri: [9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31], mesaiGunleri: { 24: 2, 25: 3, 27: 5 } },
    { excelId: 2, ad: 'ŞAHİN', soyad: 'ŞAHİNOĞLU', gorev: 'FORMEN', maas: 60000, iseGirisTarihi: '2026-03-09', calismaGunleri: [9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31] },
    { excelId: 3, ad: 'YASİN', soyad: 'EFE', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 4, ad: 'VEYSİ', soyad: 'DOĞAN', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 5, ad: 'SELMAN', soyad: 'BİLİK', gorev: 'USTA', maas: 60000, istenCikisTarihi: '2026-03-31', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 6, ad: 'MEHMET', soyad: 'AKTAŞ', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-25', calismaGunleri: [25,26,27,28,30,31] },
    { excelId: 7, ad: 'İSMAİL', soyad: 'MALKOÇ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-04', calismaGunleri: [4,5,6,7,9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31] },
    { excelId: 8, ad: 'GÖKHAN', soyad: 'TAŞPINAR', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [9,10,11,12,13,14,16,17] },
    { excelId: 9, ad: 'ANIL', soyad: 'TUZCUOĞLU', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-31', calismaGunleri: [1,2,3,4,5,6,7,9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31], mesaiGunleri: { 12: 3 } },
    { excelId: 10, ad: 'NEZİH', soyad: 'SERT', gorev: 'DÜZ İŞÇİ', maas: 35000, istenCikisTarihi: '2026-03-31', calismaGunleri: [1,2,3,4,5,6,7,9,10,11,12,13,14,16,17,18,19,20,23,24,25,26,27,28,30,31], izinliGunleri: [21], mesaiGunleri: { 12: 3, 13: 2 } },
    { excelId: 11, ad: 'ENES', soyad: 'PURLİK', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-31', calismaGunleri: [1,2,3,4,5,6,7,9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,30,31], izinliGunleri: [28] },
    { excelId: 12, ad: 'COŞKUN', soyad: 'SEZGİN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-11', calismaGunleri: [11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31] },
    { excelId: 13, ad: 'MUHAMMED', soyad: 'ÇELİK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-10', calismaGunleri: [10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31], mesaiGunleri: { 10: 3, 12: 3, 20: 8 } },
    { excelId: 14, ad: 'SUAT', soyad: 'ERYILDIRIM', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 15, ad: 'YUSUF ALİ', soyad: 'ŞİŞİK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 16, ad: 'ENES', soyad: 'BULUT', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31], mesaiGunleri: { 25: 2, 27: 2 } },
    { excelId: 17, ad: 'AMED', soyad: 'EKEN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 18, ad: 'AHMET', soyad: 'GÖL', gorev: 'ŞEF', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 19, ad: 'ÖMER', soyad: 'YUSUF', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,30,31] },
    { excelId: 20, ad: 'BARAN', soyad: 'ÇELİK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,28,30], izinliGunleri: [27] },
    // — Resim 2 (satır 21–40) —
    { excelId: 21, ad: 'EMRAH', soyad: 'VANER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: [25,26,27,28,29,30,31] },
    { excelId: 22, ad: 'EYÜP', soyad: 'VANER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: [] },
    { excelId: 23, ad: 'ABDURRAHMAN', soyad: 'ÇİTO', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: [25,26,27,28,29,30,31] },
    { excelId: 24, ad: 'ALİ SAMET', soyad: 'VANER', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-25', calismaGunleri: [25,26,27,28,29,30,31] },
    { excelId: 25, ad: 'HARUN', soyad: 'ADIYAMAN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-18', calismaGunleri: [18,19,20,21,22,23,24,25,26,27,28,29,30,31] },
    { excelId: 26, ad: 'MUSTAFA', soyad: 'COŞKUN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-26', calismaGunleri: [26,27,28,29,30,31] },
    { excelId: 27, ad: 'SERVET', soyad: 'TEMİZ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: [27,28,29,30,31] },
    { excelId: 28, ad: 'EMRAH', soyad: 'BALI', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: [27,28,29,30,31] },
    { excelId: 29, ad: 'ABDULHAKİM', soyad: 'KORKUT', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: [27,28,29,30,31] },
    { excelId: 30, ad: 'İDRİS', soyad: 'İÇTEN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: [27,28,29,30,31] },
    { excelId: 31, ad: 'YUNUS', soyad: 'POLAT', gorev: 'USTA', maas: 60000, iseGirisTarihi: '2026-03-24', calismaGunleri: [24,25,26,27,28,29,30,31] },
    { excelId: 32, ad: 'FURKAN', soyad: 'HİÇDÖNMEZ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: [27,28,29,30,31] },
    { excelId: 33, ad: 'ALİ', soyad: 'TOSUN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-27', calismaGunleri: [30,31] },
    { excelId: 34, ad: 'MEHMET', soyad: 'TURHAN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: [30,31] },
    { excelId: 35, ad: 'MUHARREM', soyad: 'GÜRBÜZ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: [30,31] },
    { excelId: 36, ad: 'SEDAT', soyad: 'ÇITANAK', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: [30,31] },
    { excelId: 37, ad: 'GÖKHAN', soyad: 'NEBİOĞLU', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: [30,31] },
    { excelId: 38, ad: 'MUHAMMED', soyad: 'KARAKUŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: [30,31] },
    { excelId: 39, ad: 'MEVLÜT SEFA', soyad: 'BÜLBÜL', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-30', calismaGunleri: [31] },
    { excelId: 40, ad: 'ALİ RIZA', soyad: 'ŞAHİN', gorev: 'DÜZ İŞÇİ', maas: 30000, iseGirisTarihi: '2026-03-31', calismaGunleri: [31] },
    // — Resim 3 (satır 41–60) —
    { excelId: 41, ad: 'MUSTAFA', soyad: 'TAŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-03', calismaGunleri: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] },
    { excelId: 42, ad: 'ÖMER ALPTEKİN', soyad: 'ÇAKMAK', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-17', calismaGunleri: [1,2,3,4,5,6,7,8,9,10,11,12] },
    { excelId: 43, ad: 'NURULLAH', soyad: 'UZUN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [1,2,3,4,5,6,7,8,9,10] },
    { excelId: 44, ad: 'BURAK', soyad: 'YANGÖZ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-17', calismaGunleri: [1,2,3,4,5,6,10], izinliGunleri: [9] },
    { excelId: 45, ad: 'SERHAT', soyad: 'UYSAL', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-06', calismaGunleri: [7,8], izinliGunleri: [9,10] },
    { excelId: 46, ad: 'ONUR', soyad: 'DURSUN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-10', calismaGunleri: [1,2,7,8], izinliGunleri: [3,9] },
    { excelId: 47, ad: 'HAMZA', soyad: 'ÖKTELİK', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-14', calismaGunleri: [1,2,3,7,8,9,13], izinliGunleri: [10,11,12] },
    { excelId: 48, ad: 'MAHMUT', soyad: 'İVGEN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-14', calismaGunleri: [1,2,3,4,5,6,7,8,9,10,11,12] },
    { excelId: 49, ad: 'YİĞİTCAN', soyad: 'DEMİRCAN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-17', calismaGunleri: [1,2,3,4,5,6,7,8,9,10,11,12,13,14] },
    { excelId: 50, ad: 'ŞÜKRÜ', soyad: 'ÇELPİŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18] },
    { excelId: 51, ad: 'BERAT', soyad: 'DEMİRCAN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-17', calismaGunleri: [1,2,3,4,5,6,7,8,9,13], izinliGunleri: [10,11,12] },
    { excelId: 52, ad: 'GÖRKEM', soyad: 'CİVGA', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-13', calismaGunleri: [1,2,4,5,7,8,10,11], izinliGunleri: [3,6,9] },
    { excelId: 53, ad: 'EFE', soyad: 'DEMİRPOLAT', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [1,2,3,4,5,6,7,8,9,10,12,13,14,15,16,17], izinliGunleri: [11] },
    { excelId: 54, ad: 'OSMAN', soyad: 'BATAK', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [1,2,3,4,5,6,7,8,11,12,13,14,15], izinliGunleri: [9,10] },
    { excelId: 55, ad: 'MUSTAFA', soyad: 'ÇELPİŞ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-18', calismaGunleri: [1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17], izinliGunleri: [10] },
    { excelId: 56, ad: 'SEMİH', soyad: 'YAKA', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-12', calismaGunleri: [1,2,3,4,5,6,8,9,10,11], izinliGunleri: [7] },
    { excelId: 57, ad: 'BATUHAN', soyad: 'POLAT', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-11', calismaGunleri: [11] },
    { excelId: 58, ad: 'SERKAN', soyad: 'AYDIN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-11', calismaGunleri: [11] },
    { excelId: 59, ad: 'İSMAİL', soyad: 'ÇİMEN', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-03-11', calismaGunleri: [11] },
    { excelId: 60, ad: 'ABDURRAHİM', soyad: 'ÖLMEZ', gorev: 'DÜZ İŞÇİ', maas: 30000, istenCikisTarihi: '2026-04-23', iseGirisTarihi: '2026-03-11', calismaGunleri: [11,12,13,14,15,18,19,20,21,22,23,24,25] },
  ],
};

import { NISAN_2026_YOKLAMA } from './nisan2026Yoklama';
import { MAYIS_2026_YOKLAMA } from './mayis2026Yoklama';
import { HAZIRAN_2026_YOKLAMA } from './haziran2026Yoklama';

/** Şubat–Haziran arası tanımlı aylar — yeni aylar buraya eklenebilir */
export const LEGACY_EXCEL_MONTHS: LegacyExcelMonthData[] = [
  SUBAT_2026_YOKLAMA,
  MART_2026_YOKLAMA,
  NISAN_2026_YOKLAMA,
  MAYIS_2026_YOKLAMA,
  HAZIRAN_2026_YOKLAMA,
];
