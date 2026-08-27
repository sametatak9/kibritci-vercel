import { blokProfilId } from '../data/blokMasterSeed';
import {
  addDaysToDateKey,
  daysBetweenDateKeys,
  formatDateLabelTr,
  normalizeDateKey,
  todayDateKey,
} from './dateKeyUtils';
import { normalizeFaaliyetEtiketi } from './faaliyetEtiketUtils';
import { calcKapanisYuzde, isKalemKapali } from './projeIlerlemeUtils';
import type {
  Personel,
  ProjeBlokProfili,
  ProjeIlerlemeKalemi,
  ProjeImalatAsama,
  SahaFaaliyeti,
  TemizlikDaire,
} from '../types/erp';

export const IMALAT_ASAMALARI: Array<{
  key: ProjeImalatAsama;
  label: string;
  agirlik: number;
}> = [
  { key: 'KABA', label: 'Kaba inşaat', agirlik: 22 },
  { key: 'TESISAT', label: 'Tesisat', agirlik: 14 },
  { key: 'SIVA', label: 'Sıva / alçı', agirlik: 16 },
  { key: 'BOYA', label: 'Boya / cephe', agirlik: 16 },
  { key: 'SERAMIK', label: 'Seramik / zemin', agirlik: 16 },
  { key: 'TESLIM', label: 'Teslim / kapanış', agirlik: 16 },
];

export interface KatKatman {
  katNo: number;
  yuzde: number;
  renk: string;
}

export interface BlokHaritaOzet {
  profil: ProjeBlokProfili;
  genelYuzde: number;
  planYuzde: number;
  sapmaPuan: number;
  asamaYuzdeleri: Record<ProjeImalatAsama, number>;
  katKatmanlari: KatKatman[];
  fiiliDaireSayisi: number;
  acikPunch: number;
  sonFaaliyetTarihi?: string;
  tahminiBitis?: string;
  hedefBitis?: string;
  scheduleSapmaGun?: number;
  aktifAsama: ProjeImalatAsama;
}

export interface KaynakHavuzu {
  firmaAdi: string;
  firmaTipi: 'ANA_FIRMA' | 'TASERON';
  aktifPersonel: number;
  ustalar: number;
  isciler: number;
}

function asamaFromEtiket(raw?: string): ProjeImalatAsama {
  const t = normalizeFaaliyetEtiketi(raw);
  if (t.includes('KABA') || t.includes('KIRIM') || t.includes('DRENAJ')) return 'KABA';
  if (t.includes('TESİSAT') || t.includes('TESISAT')) return 'TESISAT';
  if (t.includes('SIVA') || t.includes('ALÇI') || t.includes('ALCI')) return 'SIVA';
  if (t.includes('BOYA') || t.includes('CEPHE')) return 'BOYA';
  if (t.includes('SERAMİK') || t.includes('SERAMIK') || t.includes('ZEMİN')) return 'SERAMIK';
  if (t.includes('TEMİZLİK') || t.includes('TEMIZLIK') || t.includes('TESLİM')) return 'TESLIM';
  return 'SIVA';
}

function yuzdeRenk(p: number): string {
  if (p >= 100) return '#059669';
  if (p >= 75) return '#10b981';
  if (p >= 50) return '#f59e0b';
  if (p >= 25) return '#f97316';
  if (p > 0) return '#ef4444';
  return '#cbd5e1';
}

function faaliyetTamam(f: SahaFaaliyeti): boolean {
  const d = String(f.ilerlemeDurumu || '').toUpperCase();
  if (d === 'TAMAMLANDI') return true;
  return (f.ilerlemeKayitlari || []).some((k) => String(k.asama || '').toUpperCase() === 'BITIS');
}

function tahminiBitisTarihi(
  baslangic: string | undefined,
  hedefBitis: string | undefined,
  fiiliYuzde: number,
  bugun: string
): { tahmini?: string; sapmaGun?: number } {
  if (!baslangic || fiiliYuzde <= 0) {
    return { tahmini: hedefBitis, sapmaGun: hedefBitis ? daysBetweenDateKeys(hedefBitis, bugun) : undefined };
  }
  const elapsed = daysBetweenDateKeys(baslangic, bugun);
  if (elapsed <= 0) return { tahmini: hedefBitis };
  const velocity = fiiliYuzde / elapsed;
  if (velocity <= 0.01) return { tahmini: hedefBitis };
  const daysLeft = Math.ceil((100 - fiiliYuzde) / velocity);
  const tahmini = addDaysToDateKey(bugun, daysLeft);
  const sapmaGun = hedefBitis ? daysBetweenDateKeys(tahmini, hedefBitis) : undefined;
  return { tahmini, sapmaGun };
}

function buildKatKatmanlari(katSayisi: number, genelYuzde: number): KatKatman[] {
  const kat = Math.max(1, katSayisi);
  const tamKat = Math.floor((genelYuzde / 100) * kat);
  const kismi = (genelYuzde / 100) * kat - tamKat;
  return Array.from({ length: kat }, (_, i) => {
    const katNo = kat - i;
    let yuzde = 0;
    if (i < tamKat) yuzde = 100;
    else if (i === tamKat && kismi > 0) yuzde = Math.round(kismi * 100);
    return { katNo, yuzde, renk: yuzdeRenk(yuzde) };
  });
}

export function buildKaynakHavuzlari(personeller: Personel[]): KaynakHavuzu[] {
  const map = new Map<string, KaynakHavuzu>();
  for (const p of personeller) {
    if (!p.durum) continue;
    const firmaAdi = String(p.firmaAdi || (p.firmaTipi === 'TASERON' ? 'Taşeron' : 'Ana firma')).trim();
    const firmaTipi = p.firmaTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA';
    const key = `${firmaTipi}|${firmaAdi}`;
    const row = map.get(key) || {
      firmaAdi,
      firmaTipi,
      aktifPersonel: 0,
      ustalar: 0,
      isciler: 0,
    };
    row.aktifPersonel += 1;
    const g = String(p.gorev || p.nitelik || '').toLocaleUpperCase('tr-TR');
    if (g.includes('USTA') || g.includes('FORMEN') || g.includes('MÜHENDİS')) row.ustalar += 1;
    else row.isciler += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.aktifPersonel - a.aktifPersonel);
}

export function buildBlokHaritaOzetleri(input: {
  profiller: ProjeBlokProfili[];
  kalemler: ProjeIlerlemeKalemi[];
  faaliyetler: SahaFaaliyeti[];
  temizlikDaireleri?: TemizlikDaire[];
  parsel?: string;
  bugun?: string;
}): BlokHaritaOzet[] {
  const bugun = input.bugun || todayDateKey();
  const daireMap = new Map<string, number>();
  for (const d of input.temizlikDaireleri || []) {
    const id = blokProfilId(d.parsel, d.blok);
    daireMap.set(id, (daireMap.get(id) || 0) + 1);
  }

  return input.profiller
    .filter((p) => !input.parsel || p.parsel === input.parsel)
    .map((profil) => {
      const id = blokProfilId(profil.parsel, profil.blok);
      const punchBlok = input.kalemler.filter((k) => k.parsel === profil.parsel && k.blok === profil.blok);
      const planYuzde = calcKapanisYuzde(punchBlok);
      const faal = input.faaliyetler.filter((f) => f.parsel === profil.parsel && f.blok === profil.blok);
      const tamFaal = faal.filter(faaliyetTamam).length;

      const asamaYuzdeleri = Object.fromEntries(
        IMALAT_ASAMALARI.map((a) => [a.key, 0])
      ) as Record<ProjeImalatAsama, number>;

      for (const a of IMALAT_ASAMALARI) {
        const asamaFaal = faal.filter((f) => asamaFromEtiket(f.isEtiketi || f.isNiteligi) === a.key);
        const pct =
          asamaFaal.length > 0
            ? Math.round((asamaFaal.filter(faaliyetTamam).length / asamaFaal.length) * 100)
            : 0;
        asamaYuzdeleri[a.key] = pct;
      }

      if (planYuzde > 0) {
        asamaYuzdeleri.TESLIM = Math.max(asamaYuzdeleri.TESLIM, planYuzde);
      }

      let genelYuzde = 0;
      for (const a of IMALAT_ASAMALARI) {
        genelYuzde += (asamaYuzdeleri[a.key] * a.agirlik) / 100;
      }
      genelYuzde = Math.round(genelYuzde);

      if (genelYuzde === 0 && faal.length > 0) {
        genelYuzde = Math.round((tamFaal / faal.length) * 100);
      }
      if (genelYuzde === 0 && planYuzde > 0) {
        genelYuzde = planYuzde;
      }

      const aktifAsama =
        [...IMALAT_ASAMALARI].reverse().find((a) => asamaYuzdeleri[a.key] > 0 && asamaYuzdeleri[a.key] < 100)
          ?.key ||
        IMALAT_ASAMALARI.find((a) => asamaYuzdeleri[a.key] < 100)?.key ||
        'TESLIM';

      const sonTarih = faal
        .map((f) => normalizeDateKey(f.tarih))
        .filter(Boolean)
        .sort()
        .pop();

      const { tahmini, sapmaGun } = tahminiBitisTarihi(
        profil.baslangicTarihi,
        profil.hedefBitisTarihi,
        genelYuzde,
        bugun
      );

      return {
        profil,
        genelYuzde,
        planYuzde,
        sapmaPuan: planYuzde - genelYuzde,
        asamaYuzdeleri,
        katKatmanlari: buildKatKatmanlari(profil.katSayisi, genelYuzde),
        fiiliDaireSayisi: daireMap.get(id) || profil.daireSayisi,
        acikPunch: punchBlok.filter((k) => !isKalemKapali(k)).length,
        sonFaaliyetTarihi: sonTarih,
        tahminiBitis: tahmini,
        hedefBitis: profil.hedefBitisTarihi,
        scheduleSapmaGun: sapmaGun,
        aktifAsama,
      };
    });
}

export function parselGenelOzet(bloklar: BlokHaritaOzet[]): {
  genelYuzde: number;
  planYuzde: number;
  tahminiBitis?: string;
  hedefBitis?: string;
  blokSayisi: number;
} {
  if (!bloklar.length) {
    return { genelYuzde: 0, planYuzde: 0, blokSayisi: 0 };
  }
  const genelYuzde = Math.round(bloklar.reduce((s, b) => s + b.genelYuzde, 0) / bloklar.length);
  const planYuzde = Math.round(bloklar.reduce((s, b) => s + b.planYuzde, 0) / bloklar.length);
  const tahminler = bloklar.map((b) => b.tahminiBitis).filter(Boolean) as string[];
  const hedefler = bloklar.map((b) => b.hedefBitis).filter(Boolean) as string[];
  return {
    genelYuzde,
    planYuzde,
    tahminiBitis: tahminler.sort().pop(),
    hedefBitis: hedefler.sort().pop(),
    blokSayisi: bloklar.length,
  };
}

export function formatTahminiBitisLabel(tarih?: string): string {
  return tarih ? formatDateLabelTr(tarih) : '—';
}
