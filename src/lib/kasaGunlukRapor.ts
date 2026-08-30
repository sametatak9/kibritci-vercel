import type { AylikYoklamaMap, Personel } from '../types/erp';
import { todayDateKey } from './dateKeyUtils';
import {
  buildGunlukYoklamaOzet,
  buildGunlukYoklamaRaporHtml,
  buildGunlukYoklamaSatirlari,
} from './yoklamaGunRaporu';

/** Bugünkü yoklama listesi — yazdırılabilir HTML (kasa giriş/çıkış yok) */
export function buildGunlukYoklamaKasaRaporHtml(opts: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  /** Geriye dönük uyumluluk — kullanılmaz */
  kasaHareketleri?: unknown;
  dateKey?: string;
}): string {
  const dateKey = opts.dateKey || todayDateKey();
  const [y, m, d] = dateKey.split('-').map(Number);
  const yokRows = buildGunlukYoklamaSatirlari(opts.personeller, opts.yoklamalar, y, m, d);
  const yokOzet = buildGunlukYoklamaOzet(yokRows);
  return buildGunlukYoklamaRaporHtml(yokRows, yokOzet, y, m, d);
}

export function openGunlukYoklamaKasaRaporHtml(html: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcıda yeni pencere açılmasına izin verin.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
}
