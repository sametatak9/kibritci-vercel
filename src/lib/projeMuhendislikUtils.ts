import { PARSEL_LIST } from '../data/parselBlokMap';
import { normalizeDateKey, todayDateKey } from './dateKeyUtils';
import { FAALIYET_ETIKET_ONSETLERI, normalizeFaaliyetEtiketi } from './faaliyetEtiketUtils';
import { calcKapanisYuzde, isKalemKapali, PROJE_ILERLEME_KOVA_LABEL } from './projeIlerlemeUtils';
import type {
  ProjeIlerlemeKalemi,
  ProjeIlerlemeKova,
  ProjeIsPlanSatiri,
  SahaFaaliyeti,
  SahaIsPlani,
  SahaSiparis,
} from '../types/erp';

/** WBS seviyesi — parsel / blok / disiplin (inşaat iş kırılımı) */
export type WbsSeviye = 'PARSEL' | 'BLOK' | 'DISIPLIN';

export interface MuhendislikWbsSatir {
  id: string;
  seviye: WbsSeviye;
  kod: string;
  parsel: string;
  blok?: string;
  disiplin?: string;
  /** Planlı ilerleme — punch kapanış ağırlıklı % */
  planYuzde: number;
  /** Fiili ilerleme — miktar + faaliyet birleşik % */
  fiiliYuzde: number;
  /** planYuzde − fiiliYuzde (negatif = geride) */
  sapmaPuan: number;
  acikPunch: number;
  toplamPunch: number;
  faaliyetAdet: number;
  tamamlananFaaliyet: number;
  planMiktarToplam: number;
  gerceklesenMiktarToplam: number;
  isciGun: number;
  malzemeTalep: number;
  sonFaaliyetTarihi?: string;
  kritikEngel: number;
}

export interface MuhendislikOzet {
  planYuzde: number;
  fiiliYuzde: number;
  sapmaPuan: number;
  acikPunch: number;
  isciGun: number;
  malzemeTalep: number;
  faaliyetAdet: number;
  qtyPlanSatir: number;
}

export interface KaynakGunSatir {
  tarih: string;
  usta: number;
  isci: number;
  atanan: number;
  faaliyetAdet: number;
}

function parselKisa(p: string): string {
  return String(p || '').replace('Parsel Bölge ', '').trim();
}

function disiplinFromKova(kova: ProjeIlerlemeKova): string {
  return PROJE_ILERLEME_KOVA_LABEL[kova] || 'Diğer';
}

function disiplinFromFaaliyet(f: SahaFaaliyeti): string {
  const etiket = normalizeFaaliyetEtiketi(f.isEtiketi);
  if (etiket) return etiket;
  const nitelik = String(f.isNiteligi || '').trim();
  if (nitelik) return nitelik.toLocaleUpperCase('tr-TR');
  return 'DİĞER';
}

function yerEslesir(yer: string, parsel: string, blok?: string): boolean {
  const t = String(yer || '').toLocaleUpperCase('tr-TR');
  const pk = parselKisa(parsel).toLocaleUpperCase('tr-TR');
  if (pk && !t.includes(pk)) return false;
  if (blok) {
    const b = blok.toLocaleUpperCase('tr-TR');
    if (b && !t.includes(b)) return false;
  }
  return true;
}

function tarihAralik(tarih: string, baslangic: string, bitis: string): boolean {
  const k = normalizeDateKey(tarih);
  if (!k) return false;
  if (baslangic && k < baslangic) return false;
  if (bitis && k > bitis) return false;
  return true;
}

function miktarYuzde(plan: number, gercek: number): number {
  if (plan <= 0) return gercek > 0 ? 100 : 0;
  return Math.min(100, Math.round((gercek / plan) * 100));
}

function faaliyetTamamlandi(f: SahaFaaliyeti): boolean {
  const d = String(f.ilerlemeDurumu || '').toUpperCase();
  if (d === 'TAMAMLANDI') return true;
  const kayitlar = f.ilerlemeKayitlari || [];
  return kayitlar.some((k) => String(k.asama || '').toUpperCase() === 'BITIS');
}

export function buildMuhendislikOzet(input: {
  kalemler: ProjeIlerlemeKalemi[];
  planSatirlari: ProjeIsPlanSatiri[];
  faaliyetler: SahaFaaliyeti[];
  sahaIsPlanlari: SahaIsPlani[];
  siparisler: SahaSiparis[];
  parsel?: string;
  blok?: string;
  baslangicTarih?: string;
  bitisTarih?: string;
}): MuhendislikOzet {
  const wbs = buildMuhendislikWbs(input);
  const planYuzde =
    wbs.filter((r) => r.seviye === 'PARSEL').length > 0
      ? Math.round(
          wbs.filter((r) => r.seviye === 'PARSEL').reduce((s, r) => s + r.planYuzde, 0) /
            wbs.filter((r) => r.seviye === 'PARSEL').length
        )
      : calcKapanisYuzde(input.kalemler);
  const fiiliYuzde =
    wbs.filter((r) => r.seviye === 'PARSEL').length > 0
      ? Math.round(
          wbs.filter((r) => r.seviye === 'PARSEL').reduce((s, r) => s + r.fiiliYuzde, 0) /
            wbs.filter((r) => r.seviye === 'PARSEL').length
        )
      : 0;
  return {
    planYuzde,
    fiiliYuzde,
    sapmaPuan: planYuzde - fiiliYuzde,
    acikPunch: input.kalemler.filter((k) => !isKalemKapali(k)).length,
    isciGun: wbs.reduce((s, r) => s + r.isciGun, 0),
    malzemeTalep: wbs.reduce((s, r) => s + r.malzemeTalep, 0),
    faaliyetAdet: input.faaliyetler.filter((f) =>
      tarihAralik(f.tarih, input.baslangicTarih || '', input.bitisTarih || todayDateKey())
    ).length,
    qtyPlanSatir: input.sahaIsPlanlari.filter((p) =>
      tarihAralik(p.tarih, input.baslangicTarih || '', input.bitisTarih || todayDateKey())
    ).length,
  };
}

export function buildMuhendislikWbs(input: {
  kalemler: ProjeIlerlemeKalemi[];
  planSatirlari: ProjeIsPlanSatiri[];
  faaliyetler: SahaFaaliyeti[];
  sahaIsPlanlari: SahaIsPlani[];
  siparisler: SahaSiparis[];
  parsel?: string;
  blok?: string;
  baslangicTarih?: string;
  bitisTarih?: string;
}): MuhendislikWbsSatir[] {
  const bitis = input.bitisTarih || todayDateKey();
  const baslangic = input.baslangicTarih || '';

  const parseller = input.parsel
    ? [input.parsel]
    : PARSEL_LIST.filter((p) => p !== 'GENEL SAHA');

  const satirMap = new Map<string, MuhendislikWbsSatir>();

  const ensure = (
    seviye: WbsSeviye,
    parsel: string,
    blok?: string,
    disiplin?: string
  ): MuhendislikWbsSatir => {
    const pk = parselKisa(parsel);
    const kod =
      seviye === 'PARSEL'
        ? pk
        : seviye === 'BLOK'
          ? `${pk}.${blok}`
          : `${pk}.${blok}.${disiplin}`;
    const id = kod;
    const existing = satirMap.get(id);
    if (existing) return existing;
    const row: MuhendislikWbsSatir = {
      id,
      seviye,
      kod,
      parsel,
      blok,
      disiplin,
      planYuzde: 0,
      fiiliYuzde: 0,
      sapmaPuan: 0,
      acikPunch: 0,
      toplamPunch: 0,
      faaliyetAdet: 0,
      tamamlananFaaliyet: 0,
      planMiktarToplam: 0,
      gerceklesenMiktarToplam: 0,
      isciGun: 0,
      malzemeTalep: 0,
      kritikEngel: 0,
    };
    satirMap.set(id, row);
    return row;
  };

  const rollup = (row: MuhendislikWbsSatir) => {
    const punchPlan = row.toplamPunch
      ? calcKapanisYuzde(
          input.kalemler.filter(
            (k) =>
              k.parsel === row.parsel &&
              (!row.blok || k.blok === row.blok) &&
              (!row.disiplin || disiplinFromKova(k.kova) === row.disiplin)
          )
        )
      : 0;
    const qtyPlan = miktarYuzde(row.planMiktarToplam, row.gerceklesenMiktarToplam);
    const faaliyetPlan =
      row.faaliyetAdet > 0
        ? Math.round((row.tamamlananFaaliyet / row.faaliyetAdet) * 100)
        : 0;
    row.planYuzde = punchPlan;
    row.fiiliYuzde =
      row.planMiktarToplam > 0
        ? qtyPlan
        : row.faaliyetAdet > 0
          ? faaliyetPlan
          : punchPlan;
    row.sapmaPuan = row.planYuzde - row.fiiliYuzde;
  };

  for (const k of input.kalemler) {
    if (input.parsel && k.parsel !== input.parsel) continue;
    if (input.blok && k.blok !== input.blok) continue;
    const d = disiplinFromKova(k.kova);
    ensure('PARSEL', k.parsel);
    ensure('BLOK', k.parsel, k.blok);
    const leaf = ensure('DISIPLIN', k.parsel, k.blok, d);
    leaf.toplamPunch += 1;
    if (!isKalemKapali(k)) leaf.acikPunch += 1;
    if (k.kirmiziEngel && !isKalemKapali(k)) leaf.kritikEngel += 1;
    ensure('BLOK', k.parsel, k.blok).toplamPunch += 1;
    if (!isKalemKapali(k)) ensure('BLOK', k.parsel, k.blok).acikPunch += 1;
    ensure('PARSEL', k.parsel).toplamPunch += 1;
    if (!isKalemKapali(k)) ensure('PARSEL', k.parsel).acikPunch += 1;
  }

  for (const f of input.faaliyetler) {
    if (!tarihAralik(f.tarih, baslangic, bitis)) continue;
    if (input.parsel && f.parsel !== input.parsel) continue;
    if (input.blok && f.blok !== input.blok) continue;
    const d = disiplinFromFaaliyet(f);
    const leaf = ensure('DISIPLIN', f.parsel, f.blok, d);
    leaf.faaliyetAdet += 1;
    if (faaliyetTamamlandi(f)) leaf.tamamlananFaaliyet += 1;
    const isci = (f.ustaSayisi || 0) + (f.isciSayisi || 0) || f.aktifPersonelListesi?.length || 0;
    leaf.isciGun += isci;
    const t = normalizeDateKey(f.tarih);
    if (t && (!leaf.sonFaaliyetTarihi || t > leaf.sonFaaliyetTarihi)) {
      leaf.sonFaaliyetTarihi = t;
    }
    ensure('BLOK', f.parsel, f.blok).faaliyetAdet += 1;
    ensure('BLOK', f.parsel, f.blok).isciGun += isci;
    ensure('PARSEL', f.parsel).faaliyetAdet += 1;
    ensure('PARSEL', f.parsel).isciGun += isci;
  }

  for (const p of input.sahaIsPlanlari) {
    if (!tarihAralik(p.tarih, baslangic, bitis)) continue;
    if (input.parsel && p.parsel !== input.parsel) continue;
    if (input.blok && p.blok !== input.blok) continue;
    const d = normalizeFaaliyetEtiketi(p.isTanimi) || 'İMALAT';
    const leaf = ensure('DISIPLIN', p.parsel, p.blok, d);
    leaf.planMiktarToplam += Number(p.planlananMiktar) || 0;
    leaf.gerceklesenMiktarToplam += Number(p.gerceklesenMiktar) || 0;
    ensure('BLOK', p.parsel, p.blok).planMiktarToplam += Number(p.planlananMiktar) || 0;
    ensure('BLOK', p.parsel, p.blok).gerceklesenMiktarToplam += Number(p.gerceklesenMiktar) || 0;
    ensure('PARSEL', p.parsel).planMiktarToplam += Number(p.planlananMiktar) || 0;
    ensure('PARSEL', p.parsel).gerceklesenMiktarToplam += Number(p.gerceklesenMiktar) || 0;
  }

  for (const s of input.siparisler) {
    if (s.durum === 'REDDEDILDI') continue;
    for (const parsel of parseller) {
      if (!yerEslesir(s.kullanilacakYer, parsel)) continue;
      const bloklar = input.blok
        ? [input.blok]
        : [...new Set(input.kalemler.filter((k) => k.parsel === parsel).map((k) => k.blok))];
      if (bloklar.length) {
        for (const b of bloklar) {
          if (yerEslesir(s.kullanilacakYer, parsel, b)) {
            ensure('BLOK', parsel, b).malzemeTalep += s.kalemler?.length || 1;
          }
        }
      }
      ensure('PARSEL', parsel).malzemeTalep += s.kalemler?.length || 1;
    }
  }

  for (const row of satirMap.values()) rollup(row);

  return [...satirMap.values()].sort((a, b) => {
    const s = String(a.kod).localeCompare(String(b.kod), 'tr');
    if (s !== 0) return s;
    const sev = { PARSEL: 0, BLOK: 1, DISIPLIN: 2 };
    return sev[a.seviye] - sev[b.seviye];
  });
}

export function buildKaynakHistogram(
  faaliyetler: SahaFaaliyeti[],
  baslangicTarih: string,
  bitisTarih: string,
  parsel?: string,
  blok?: string
): KaynakGunSatir[] {
  const map = new Map<string, KaynakGunSatir>();
  for (const f of faaliyetler) {
    if (!tarihAralik(f.tarih, baslangicTarih, bitisTarih)) continue;
    if (parsel && f.parsel !== parsel) continue;
    if (blok && f.blok !== blok) continue;
    const tarih = normalizeDateKey(f.tarih);
    if (!tarih) continue;
    const row = map.get(tarih) || {
      tarih,
      usta: 0,
      isci: 0,
      atanan: 0,
      faaliyetAdet: 0,
    };
    row.usta += f.ustaSayisi || 0;
    row.isci += f.isciSayisi || 0;
    row.atanan += f.aktifPersonelListesi?.length || 0;
    row.faaliyetAdet += 1;
    map.set(tarih, row);
  }
  return [...map.values()].sort((a, b) => a.tarih.localeCompare(b.tarih, 'tr'));
}

export const MUHENDISLIK_DISIPLINLER = [...FAALIYET_ETIKET_ONSETLERI] as string[];
