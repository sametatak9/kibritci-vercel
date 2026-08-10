import { Personel } from '../types/erp';
import type { KampTaseronSayimPersonelGuncelleme } from '../types/erp';
import { isUstaGorev, normalizeGorev } from './gorevUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  canonicalizeAnaFirmaAdi,
  isFormenGorev,
  isIdariPersonel,
  isTaseronPersonel,
} from './yoklamaUtils';

/** KİBRİTÇİ İNŞAAT MYK sayımına dahil saha görevleri */
export function isAnaFirmaMykSayimGorevi(gorev?: string | null): boolean {
  const norm = normalizeGorev(gorev);
  if (norm === 'DÜZ İŞÇİ') return true;
  if (norm === 'TESİSATÇI') return true;
  if (isFormenGorev(gorev)) return true;
  if (norm === 'USTA' || isUstaGorev(gorev)) return true;
  return false;
}

export function isPersonelAktifKayit(p: Personel): boolean {
  if (p.durum !== true && String(p.durum) !== 'true') return false;
  if (String(p.istenCikisTarihi || '').trim()) return false;
  return true;
}

/** Ana firma MYK sayım kapsamı: aktif saha kadrosu (idari hariç) */
export function isAnaFirmaMykSayimPersoneli(p: Personel): boolean {
  if (isTaseronPersonel(p)) return false;
  if (isIdariPersonel(p)) return false;
  if (!isPersonelAktifKayit(p)) return false;
  return isAnaFirmaMykSayimGorevi(p.gorev);
}

/** Yoklamada MYK işareti — mevcut durumla aynı olsa bile taslak oluşturur */
export function buildAnaFirmaMykYoklamaPatch(
  personel: Personel,
  mykDurumu: 'VAR' | 'YOK' | 'BILINMIYOR'
): KampTaseronSayimPersonelGuncelleme {
  const prev = personel.mykDurumu || 'BILINMIYOR';
  const changed = mykDurumu !== prev;
  return {
    personelId: personel.id,
    personelIsim: `${personel.ad} ${personel.soyad}`,
    mykDurumu,
    islemTipi: 'MYK_ISARETLENDI',
    detay: changed
      ? `MYK: ${prev} → ${mykDurumu}`
      : `MYK yoklama onayı: ${mykDurumu}`,
  };
}

export function isAnaFirmaMykSayimSession(firmaAdi?: string | null): boolean {
  const raw = String(firmaAdi || '').trim();
  if (!raw) return false;
  return canonicalizeAnaFirmaAdi(raw) === CANONICAL_ANA_FIRMA_ADI;
}

export const ANA_FIRMA_MYK_GOREV_ETIKETI =
  'DÜZ İŞÇİ · TESİSATÇI · FORMEN · USTA (yalnızca aktif)';
