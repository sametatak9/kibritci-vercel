import { KampFaaliyet, SahaFaaliyeti } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { filterSahaFaaliyetleriByDate } from './geldiHavuzuUtils';

export type GorevMerkeziKaynak =
  | 'SAHA'
  | 'KAMP'
  | 'TESISAT'
  | 'MERMER'
  | 'SOFOR'
  | 'OPERATOR'
  | 'FORMEN'
  | 'PROGRAM';

const KAYNAK_MAP: Record<string, GorevMerkeziKaynak> = {
  GUNLUK_PROGRAM: 'PROGRAM',
  FORMEN_MOBIL: 'FORMEN',
  IDARI_SAHA: 'SAHA',
  TESISATCI_MOBIL: 'TESISAT',
  MERMERCI_MOBIL: 'MERMER',
  SOFOR_MOBIL: 'SOFOR',
  OPERATOR_MOBIL: 'OPERATOR',
  KAMPCI: 'KAMP',
};

export function resolveGorevMerkeziKaynak(kaynakEkran?: string): GorevMerkeziKaynak {
  const key = String(kaynakEkran || '').toUpperCase();
  return KAYNAK_MAP[key] || 'SAHA';
}

export function gorevMerkeziKaynakLabel(kaynak: GorevMerkeziKaynak): string {
  switch (kaynak) {
    case 'KAMP':
      return 'Kamp';
    case 'TESISAT':
      return 'Tesisat';
    case 'MERMER':
      return 'Mermer';
    case 'SOFOR':
      return 'Şoför';
    case 'OPERATOR':
      return 'Operatör';
    case 'FORMEN':
      return 'Formen';
    case 'PROGRAM':
      return 'Program';
    default:
      return 'Saha';
  }
}

export const GOREV_MERKEZI_KAYNAK_STYLE: Record<GorevMerkeziKaynak, string> = {
  SAHA: 'bg-slate-100 text-slate-800 border-slate-200',
  PROGRAM: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  FORMEN: 'bg-violet-100 text-violet-900 border-violet-200',
  KAMP: 'bg-amber-100 text-amber-900 border-amber-200',
  TESISAT: 'bg-sky-100 text-sky-900 border-sky-200',
  MERMER: 'bg-stone-100 text-stone-800 border-stone-200',
  SOFOR: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  OPERATOR: 'bg-orange-100 text-orange-900 border-orange-200',
};

/** Kamp faaliyetini birleşik listede göstermek için SahaFaaliyeti görünümü */
export function kampToSahaDisplay(kf: KampFaaliyet): SahaFaaliyeti {
  return {
    id: kf.id,
    personelId: kf.personelId || kf.aktifPersonelListesi?.[0] || '',
    tarih: kf.tarih,
    isNiteligi: kf.faaliyetTipi || 'Kamp faaliyeti',
    parsel: kf.yerleskeAdi || 'Kamp',
    blok: kf.faaliyetGrubu || 'NORMAL',
    aciklama: kf.aciklama || '',
    fotoUrl: kf.fotoUrl || undefined,
    aktifPersonelListesi: kf.aktifPersonelListesi,
    personelMesaiSaatleri: kf.personelMesaiSaatleri,
    faaliyetTipi: kf.faaliyetGrubu === 'MESAI' ? 'MESAI_SAHA' : 'NORMAL',
    kaynakEkran: 'KAMPCI',
    kaydeden: kf.kaydedenKampci,
    durum: kf.durum,
  } as SahaFaaliyeti;
}

/** Saha + mobil adaptör + kamp — günlük görev merkezi listesi */
export function buildBirlesikGunlukFaaliyetler(
  tumSahaFaaliyetleri: SahaFaaliyeti[],
  kampFaaliyetleri: KampFaaliyet[],
  dateKey: string
): SahaFaaliyeti[] {
  const target = normalizeDateKey(dateKey);
  const saha = filterSahaFaaliyetleriByDate(tumSahaFaaliyetleri, dateKey);
  const kamp = (kampFaaliyetleri || [])
    .filter((kf) => normalizeDateKey(kf.tarih) === target)
    .map(kampToSahaDisplay)
    .sort((a, b) =>
      String(a.isNiteligi || '').localeCompare(String(b.isNiteligi || ''), 'tr')
    );
  return [...saha, ...kamp];
}
