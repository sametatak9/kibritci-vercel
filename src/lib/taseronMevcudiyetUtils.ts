import type { Personel } from '../types/erp';
import { isPersonelActiveOnDate } from './guvenlikHelpers';
import { foldFirma } from './taseronUtils';
import { isTaseronPersonel } from './yoklamaUtils';

export type TaseronFirmaKadro = {
  firma: string;
  aktifKadro: number;
};

export type TaseronKadroOzet = {
  aktifKadro: number;
  firmaSayisi: number;
  byFirma: TaseronFirmaKadro[];
};

/**
 * Taşeron personel listesi özeti (firma kadrosu).
 * Günlük yoklama alınmaz — yalnızca kayıtlı aktif kadro.
 */
export function summarizeTaseronKadro(
  personeller: Personel[],
  asOf?: string
): TaseronKadroOzet {
  const iso = (asOf || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const aktifTaseron = (personeller || []).filter(
    (p) =>
      isTaseronPersonel(p) &&
      (p.durum === true || String(p.durum) === 'true') &&
      isPersonelActiveOnDate(p, iso)
  );

  const firmaMap = new Map<string, TaseronFirmaKadro>();

  for (const p of aktifTaseron) {
    const firmaLabel =
      String(p.firmaAdi || 'Taşeron (belirtilmemiş)').trim() || 'Taşeron (belirtilmemiş)';
    const key = foldFirma(firmaLabel) || 'taseron';
    let bucket = firmaMap.get(key);
    if (!bucket) {
      bucket = { firma: firmaLabel, aktifKadro: 0 };
      firmaMap.set(key, bucket);
    }
    bucket.aktifKadro += 1;
  }

  const byFirma = Array.from(firmaMap.values()).sort(
    (a, b) => b.aktifKadro - a.aktifKadro || a.firma.localeCompare(b.firma, 'tr')
  );

  return {
    aktifKadro: aktifTaseron.length,
    firmaSayisi: byFirma.length,
    byFirma,
  };
}
