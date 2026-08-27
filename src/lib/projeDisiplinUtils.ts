import type { ProjeDisiplinDurum, ProjeDisiplinIlerleme } from '../types/erp';
import {
  ALTYAPI_WBS_SABLON,
  DisiplinGrup,
  PEYZAJ_WBS_SABLON,
  expandDisiplinSablon,
} from '../data/parsel15751DisiplinSeed';

export const DISIPLIN_DURUM_LABEL: Record<ProjeDisiplinDurum, string> = {
  PLANLANDI: 'Planlandı',
  IMALATTA: 'İmalatta',
  TAMAMLANDI: 'Tamamlandı',
  BEKLEMEDE: 'Beklemede',
};

export function mergeDisiplinIlerleme(
  grup: DisiplinGrup,
  kayitlar: ProjeDisiplinIlerleme[]
): ProjeDisiplinIlerleme[] {
  const sablon = grup === 'ALTYAPI' ? ALTYAPI_WBS_SABLON : PEYZAJ_WBS_SABLON;
  const expanded = expandDisiplinSablon(sablon);
  const map = new Map(kayitlar.filter((k) => k.grup === grup).map((k) => [k.id, k]));
  return expanded.map(({ id, parsel, blok, sablon: s }) => {
    const prev = map.get(id);
    return {
      id,
      parsel,
      blok,
      grup: s.grup,
      kod: s.kod,
      baslik: s.baslik,
      durum: prev?.durum || 'PLANLANDI',
      yuzde: typeof prev?.yuzde === 'number' ? prev.yuzde : 0,
      gorsel: s.gorsel,
      dwgKaynak: s.dwgKaynak,
      not: prev?.not,
      guncellemeTarihi: prev?.guncellemeTarihi,
      olusturan: prev?.olusturan,
    };
  });
}

export function calcDisiplinOzet(rows: ProjeDisiplinIlerleme[]): {
  yuzde: number;
  tamamlanan: number;
  imalatta: number;
  toplam: number;
} {
  if (!rows.length) return { yuzde: 0, tamamlanan: 0, imalatta: 0, toplam: 0 };
  const yuzde = Math.round(rows.reduce((s, r) => s + (r.yuzde || 0), 0) / rows.length);
  return {
    yuzde,
    tamamlanan: rows.filter((r) => r.durum === 'TAMAMLANDI').length,
    imalatta: rows.filter((r) => r.durum === 'IMALATTA').length,
    toplam: rows.length,
  };
}
