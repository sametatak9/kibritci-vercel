import { Personel } from '../types/erp';
import { isUstaGorev, normalizeGorev } from './gorevUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  canonicalizeAnaFirmaAdi,
  isFormenGorev,
  isTaseronPersonel,
} from './yoklamaUtils';

/** KİBRİTÇİ İNŞAAT MYK sayımına dahil saha görevleri */
export function isAnaFirmaMykSayimGorevi(gorev?: string | null): boolean {
  const norm = normalizeGorev(gorev);
  if (norm === 'DÜZ İŞÇİ') return true;
  if (norm === 'TESİSATÇI') return true;
  if (isFormenGorev(gorev)) return true;
  if (isUstaGorev(gorev)) return true;
  return false;
}

export function isPersonelAktifKayit(p: Personel): boolean {
  if (p.durum !== true && String(p.durum) !== 'true') return false;
  if (String(p.istenCikisTarihi || '').trim()) return false;
  return true;
}

/** Ana firma MYK sayım kapsamı: aktif + DÜZ İŞÇİ / TESİSATÇI / FORMEN / USTA */
export function isAnaFirmaMykSayimPersoneli(p: Personel): boolean {
  if (isTaseronPersonel(p)) return false;
  if (!isPersonelAktifKayit(p)) return false;
  return isAnaFirmaMykSayimGorevi(p.gorev);
}

export function isAnaFirmaMykSayimSession(firmaAdi?: string | null): boolean {
  const raw = String(firmaAdi || '').trim();
  if (!raw) return false;
  return canonicalizeAnaFirmaAdi(raw) === CANONICAL_ANA_FIRMA_ADI;
}

export const ANA_FIRMA_MYK_GOREV_ETIKETI =
  'DÜZ İŞÇİ · TESİSATÇI · FORMEN · USTA (yalnızca aktif)';
