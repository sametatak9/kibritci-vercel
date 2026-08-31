import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { kadroPersonelGorev } from './guvenlikHelpers';
import { isUstaGorev, normalizeGorev } from './gorevUtils';
import {
  getYoklamaDay,
  isDayActiveForPersonel,
  isFormenGorev,
  isIdariPersonel,
  isKampciGorev,
  isMermerciGorev,
  isOperatorGorev,
  isSeramikGorev,
  isSenorGorev,
  isSoforGorev,
  isTesisatciGorev,
  isTaseronPersonel,
} from './yoklamaUtils';

/** Personel kadro / filtre / ana sayfa özetinde kullanılan görev grupları */
export type PersonelGorevGrup =
  | 'IDARI'
  | 'DUZ_ISCI'
  | 'USTA'
  | 'FORMEN'
  | 'TESISATCI'
  | 'MERMERCI'
  | 'SERAMIK'
  | 'OPERATOR'
  | 'SOFOR'
  | 'SENOR';

export const PERSONEL_GOREV_GRUP_ORDER: PersonelGorevGrup[] = [
  'IDARI',
  'DUZ_ISCI',
  'USTA',
  'FORMEN',
  'TESISATCI',
  'MERMERCI',
  'SERAMIK',
  'OPERATOR',
  'SOFOR',
  'SENOR',
];

export function personelGorevGrupLabel(grup: PersonelGorevGrup): string {
  switch (grup) {
    case 'IDARI':
      return 'İDARİ';
    case 'DUZ_ISCI':
      return 'DÜZ İŞÇİ';
    case 'USTA':
      return 'USTA';
    case 'FORMEN':
      return 'FORMEN';
    case 'TESISATCI':
      return 'TESİSATÇI';
    case 'MERMERCI':
      return 'MERMERCİ';
    case 'SERAMIK':
      return 'SERAMİK';
    case 'OPERATOR':
      return 'OPERATÖR';
    case 'SOFOR':
      return 'ŞÖFÖR';
    case 'SENOR':
      return 'ŞENÖR';
    default:
      return grup;
  }
}

const GOREV_GRUP_CHIP_CLASS: Record<PersonelGorevGrup, string> = {
  IDARI: 'bg-violet-50 text-violet-900 border-violet-200 hover:bg-violet-100',
  DUZ_ISCI: 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100',
  USTA: 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200 hover:bg-fuchsia-100',
  FORMEN: 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100',
  TESISATCI: 'bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100',
  MERMERCI: 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100',
  SERAMIK: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100',
  OPERATOR: 'bg-cyan-50 text-cyan-900 border-cyan-200 hover:bg-cyan-100',
  SOFOR: 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100',
  SENOR: 'bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100',
};

const GOREV_GRUP_ACTIVE_CLASS: Record<PersonelGorevGrup, string> = {
  IDARI: 'bg-violet-600 text-white border-violet-700',
  DUZ_ISCI: 'bg-blue-600 text-white border-blue-700',
  USTA: 'bg-fuchsia-600 text-white border-fuchsia-700',
  FORMEN: 'bg-purple-600 text-white border-purple-700',
  TESISATCI: 'bg-orange-600 text-white border-orange-700',
  MERMERCI: 'bg-rose-600 text-white border-rose-700',
  SERAMIK: 'bg-amber-600 text-white border-amber-700',
  OPERATOR: 'bg-cyan-600 text-white border-cyan-700',
  SOFOR: 'bg-indigo-600 text-white border-indigo-700',
  SENOR: 'bg-teal-600 text-white border-teal-700',
};

export function personelGorevGrupChipClass(grup: PersonelGorevGrup, active: boolean): string {
  return active ? GOREV_GRUP_ACTIVE_CLASS[grup] : GOREV_GRUP_CHIP_CLASS[grup];
}

/** Personel kaydından görev grubu (idari öncelikli) */
export function resolvePersonelGorevGrubu(p: Personel): PersonelGorevGrup {
  if (isIdariPersonel(p)) return 'IDARI';
  return resolvePersonelGorevGrubuFromGorev(kadroPersonelGorev(p));
}

/** Ham görev metninden grup — idari kontrolü ayrı yapılır */
export function resolvePersonelGorevGrubuFromGorev(gorev?: string): PersonelGorevGrup {
  if (isFormenGorev(gorev)) return 'FORMEN';
  if (isSenorGorev(gorev)) return 'SENOR';
  if (isOperatorGorev(gorev)) return 'OPERATOR';
  if (isSoforGorev(gorev)) return 'SOFOR';
  if (isTesisatciGorev(gorev)) return 'TESISATCI';
  if (isMermerciGorev(gorev)) return 'MERMERCI';
  if (isSeramikGorev(gorev)) return 'SERAMIK';
  if (isUstaGorev(gorev)) return 'USTA';
  if (isKampciGorev(gorev)) return 'DUZ_ISCI';

  const norm = normalizeGorev(gorev);
  if (norm === 'DÜZ İŞÇİ' || norm === 'İŞÇİ') return 'DUZ_ISCI';

  return 'DUZ_ISCI';
}

export type GorevGrupYoklamaOzet = {
  grup: PersonelGorevGrup;
  label: string;
  kadro: number;
  geldi: number;
  yok: number;
  izinli: number;
  raporlu: number;
  diger: number;
  girilmedi: number;
  toplamKayit: number;
  /** Bugün «Geldi» işaretli personel kısa adları */
  geldiIsimleri: string[];
};

function personelGeldiEtiketi(p: Personel): string {
  const ad = String(p.ad || '').trim();
  const soyad = String(p.soyad || '').trim();
  if (ad && soyad) {
    return `${ad} ${soyad.charAt(0).toLocaleUpperCase('tr-TR')}.`;
  }
  return `${ad} ${soyad}`.trim() || p.id;
}

function pushGeldiIsim(bucket: GorevGrupYoklamaOzet, p: Personel) {
  const label = personelGeldiEtiketi(p);
  if (label && !bucket.geldiIsimleri.includes(label)) {
    bucket.geldiIsimleri.push(label);
  }
}

function bumpDurum(bucket: GorevGrupYoklamaOzet, durum: YoklamaDurum | undefined) {
  if (!durum || durum === 'Girilmedi') {
    bucket.girilmedi += 1;
    return;
  }
  bucket.toplamKayit += 1;
  switch (durum) {
    case 'Geldi':
      bucket.geldi += 1;
      break;
    case 'Yok':
      bucket.yok += 1;
      break;
    case 'İzinli':
      bucket.izinli += 1;
      break;
    case 'Raporlu':
      bucket.raporlu += 1;
      break;
    default:
      bucket.diger += 1;
      break;
  }
}

/** Seçili gün için ana firma aktif kadrosunu görev gruplarına göre yoklama özeti */
export function buildGunlukYoklamaGorevOzeti(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  dateKey: string
): GorevGrupYoklamaOzet[] {
  const parts = dateKey.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return [];

  const buckets = new Map<PersonelGorevGrup, GorevGrupYoklamaOzet>();
  for (const grup of PERSONEL_GOREV_GRUP_ORDER) {
    buckets.set(grup, {
      grup,
      label: personelGorevGrupLabel(grup),
      kadro: 0,
      geldi: 0,
      yok: 0,
      izinli: 0,
      raporlu: 0,
      diger: 0,
      girilmedi: 0,
      toplamKayit: 0,
      geldiIsimleri: [],
    });
  }

  for (const p of personeller) {
    if (isTaseronPersonel(p)) continue;
    if (!(p.durum === true || String(p.durum) === 'true')) continue;
    if (!isDayActiveForPersonel(p, year, month, day, yoklamalar[p.id])) continue;

    const grup = resolvePersonelGorevGrubu(p);
    const bucket = buckets.get(grup)!;
    bucket.kadro += 1;

    const dayData = getYoklamaDay(yoklamalar[p.id], year, month, day);
    let durum = dayData?.durum as YoklamaDurum | undefined;

    // İdari kadro puantaj/yoklama ekranına girmez — ana sayfada varsayılan «Geldi»
    if (grup === 'IDARI' && (!durum || durum === 'Girilmedi')) {
      bucket.geldi += 1;
      bucket.toplamKayit += 1;
      pushGeldiIsim(bucket, p);
      continue;
    }

    const prevGeldi = bucket.geldi;
    bumpDurum(bucket, durum);
    if (bucket.geldi > prevGeldi) {
      pushGeldiIsim(bucket, p);
    }
  }

  return PERSONEL_GOREV_GRUP_ORDER.map((grup) => buckets.get(grup)!);
}

/** Kadro havuzunda grup başına personel sayısı */
export function countPersonelByGorevGrup(personeller: Personel[]): Map<PersonelGorevGrup, number> {
  const counts = new Map<PersonelGorevGrup, number>();
  for (const grup of PERSONEL_GOREV_GRUP_ORDER) counts.set(grup, 0);
  for (const p of personeller) {
    const grup = resolvePersonelGorevGrubu(p);
    counts.set(grup, (counts.get(grup) || 0) + 1);
  }
  return counts;
}
