import type { Personel } from '../types/erp';
import { personelAdSoyadKey } from '../lib/personelKayitKaliteUtils';
import { CANONICAL_ANA_FIRMA_ADI } from '../lib/yoklamaUtils';

/** Mayıs yoklama Excel satır 67 — yoklama bu id ile bağlı */
export const UGUR_DURUKHAN_KEEP_ID = 'PRS-LEGACY-L67';
const UGUR_DURUKHAN_ALT_ID = 'PRS-20260531-9246';
const REAL_TC = '15905136730';
/** Arnavutköy Excel senkronundan önceki yer tutucu TC */
const OLD_TC = '67767976595';
const IBAN = 'TR310006200023600006637275';
const ISE_GIRIS = '2026-05-11';

function digits(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

function isUgurDurukhanName(p: Pick<Personel, 'ad' | 'soyad'>): boolean {
  const key = personelAdSoyadKey(p);
  return key === 'UGUR DURUKHAN' || key === 'UGUR DURUKAN';
}

function resolveTc(found?: Personel): string {
  const current = digits(found?.tcNo);
  if (!current || current === OLD_TC || current === REAL_TC) return REAL_TC;
  return String(found?.tcNo || REAL_TC).trim();
}

function buildRestored(base?: Personel): Personel {
  const iban =
    String(base?.ibanNo || '')
      .replace(/\s+/g, '')
      .toUpperCase() || IBAN;
  return {
    ...(base || ({} as Personel)),
    id: base?.id || UGUR_DURUKHAN_KEEP_ID,
    tcNo: resolveTc(base),
    ad: 'UĞUR',
    soyad: 'DURUKHAN',
    babaAdi: base?.babaAdi || '',
    dogumTarihi: base?.dogumTarihi || '',
    telefonNo: base?.telefonNo || '',
    eposta: base?.eposta || '',
    adres: base?.adres || '',
    il: base?.il || '',
    ilce: base?.ilce || '',
    departman: base?.departman || 'Şantiye',
    gorev: (base?.gorev || '').trim() || 'DÜZ İŞÇİ',
    iseGirisTarihi: base?.iseGirisTarihi || ISE_GIRIS,
    istenCikisTarihi: '',
    cinsiyet: base?.cinsiyet || 'Erkek',
    maas: typeof base?.maas === 'number' ? base.maas : 30000,
    ucretTipi: base?.ucretTipi || 'Aylık',
    sgkDurumu: base?.sgkDurumu || "SGK'lı",
    bankaAdi: base?.bankaAdi || '',
    subeAdi: base?.subeAdi || '',
    ibanNo: iban,
    durum: true,
    firmaTipi: base?.firmaTipi || 'ANA_FIRMA',
    firmaAdi: base?.firmaAdi || CANONICAL_ANA_FIRMA_ADI,
    personelGrubu: base?.personelGrubu === 'IDARI' ? 'IDARI' : base?.personelGrubu || 'SAHA',
  };
}

function isAlreadyRestored(p: Personel): boolean {
  return (
    p.ad === 'UĞUR' &&
    p.soyad === 'DURUKHAN' &&
    p.durum !== false &&
    !String(p.istenCikisTarihi || '').trim() &&
    digits(p.tcNo) === REAL_TC
  );
}

function collectCandidates(existing: Personel[]): Personel[] {
  const seen = new Set<string>();
  const out: Personel[] = [];
  for (const p of existing) {
    const tc = digits(p.tcNo);
    if (
      p.id === UGUR_DURUKHAN_KEEP_ID ||
      p.id === UGUR_DURUKHAN_ALT_ID ||
      tc === REAL_TC ||
      tc === OLD_TC ||
      isUgurDurukhanName(p)
    ) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/**
 * UĞUR DURUKHAN silinmedi — Arnavutköy Excel senkronu soyadı DURUKAN yaptı.
 * Kartı (ve varsa çift kaydı) DURUKHAN adına çeker; yoksa Mayıs yoklama id’siyle yeniden açar.
 */
export function restoreUgurDurukhan(existing: Personel[]): { list: Personel[]; toSave: Personel[] } {
  const next = [...existing];
  const toSave: Personel[] = [];
  const candidates = collectCandidates(existing);

  if (candidates.length === 0) {
    const created = buildRestored();
    next.push(created);
    toSave.push(created);
    return { list: next, toSave };
  }

  for (const found of candidates) {
    if (isAlreadyRestored(found)) continue;
    const patched = buildRestored(found);
    const idx = next.findIndex((p) => p.id === found.id);
    if (idx >= 0) next[idx] = patched;
    toSave.push(patched);
  }

  return { list: next, toSave };
}
