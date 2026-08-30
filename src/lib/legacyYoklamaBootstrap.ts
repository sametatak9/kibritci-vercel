import { AylikYoklamaMap, Personel } from '../types/erp';
import { LEGACY_EXCEL_MONTHS } from '../data/legacyExcelYoklama';
import { importAllLegacyExcelMonths } from './legacyYoklamaImport';
import { iterateMonthYoklama, asYoklamaGunMap } from './yoklamaUtils';
import { hasSubstantialYoklamaData, isProductionLive } from './productionDataGuard';

/** Veri güncellendiğinde artırın — otomatik yeniden birleştirme tetikler */
export const LEGACY_YOKLAMA_VERSION = 10;

const STORAGE_KEY = 'kibritci_legacy_yoklama_v';

function countGeldiInMonth(yoklamalar: AylikYoklamaMap, year: number, month: number): number {
  let total = 0;
  Object.values(yoklamalar).forEach(map => {
    iterateMonthYoklama(asYoklamaGunMap(map), year, month, (_d, data) => {
      if (data?.durum === 'Geldi') total++;
    });
  });
  return total;
}

/** Mayıs 2026 için yeterli Geldi kaydı var mı (70 kişi × ~ortalama gün) */
export function mayis2026NeedsBootstrap(yoklamalar: AylikYoklamaMap): boolean {
  return countGeldiInMonth(yoklamalar, 2026, 5) < 200;
}

export function haziran2026NeedsBootstrap(yoklamalar: AylikYoklamaMap): boolean {
  return countGeldiInMonth(yoklamalar, 2026, 6) < 200;
}

export function shouldBootstrapLegacyYoklama(yoklamalar: AylikYoklamaMap): boolean {
  if (isProductionLive()) return false;

  // Veri silinmişse/azalmışsa localStorage versiyonu ne olursa olsun yeniden bootstrap et.
  if (mayis2026NeedsBootstrap(yoklamalar)) return true;
  if (haziran2026NeedsBootstrap(yoklamalar)) return true;

  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored === String(LEGACY_YOKLAMA_VERSION)) return false;
  return false;
}

export function markLegacyYoklamaBootstrapped(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(LEGACY_YOKLAMA_VERSION));
  }
}

export function bootstrapLegacyYoklama(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap
) {
  if (!shouldBootstrapLegacyYoklama(yoklamalar)) return null;
  return importAllLegacyExcelMonths(LEGACY_EXCEL_MONTHS, personeller, yoklamalar);
}
