import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { displayPersonelGorev } from './guvenlikHelpers';
import { isUstaGorev, normalizeGorev } from './gorevUtils';
import {
  getYoklamaDay,
  isDayActiveForPersonel,
  isFormenGorev,
  isIdariPersonel,
  isKampciGorev,
  isOperatorGorev,
  isSenorGorev,
  isSoforGorev,
  isTaseronPersonel,
} from './yoklamaUtils';

/** Personel kadro / filtre / ana sayfa özetinde kullanılan görev grupları */
export type PersonelGorevGrup =
  | 'IDARI'
  | 'DUZ_ISCI'
  | 'USTA'
  | 'FORMEN'
  | 'OPERATOR'
  | 'SOFOR'
  | 'SENOR';

export const PERSONEL_GOREV_GRUP_ORDER: PersonelGorevGrup[] = [
  'IDARI',
  'DUZ_ISCI',
  'USTA',
  'FORMEN',
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
  OPERATOR: 'bg-cyan-50 text-cyan-900 border-cyan-200 hover:bg-cyan-100',
  SOFOR: 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100',
  SENOR: 'bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100',
};

const GOREV_GRUP_ACTIVE_CLASS: Record<PersonelGorevGrup, string> = {
  IDARI: 'bg-violet-600 text-white border-violet-700',
  DUZ_ISCI: 'bg-blue-600 text-white border-blue-700',
  USTA: 'bg-fuchsia-600 text-white border-fuchsia-700',
  FORMEN: 'bg-purple-600 text-white border-purple-700',
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
  return resolvePersonelGorevGrubuFromGorev(displayPersonelGorev(p));
}

/** Ham görev metninden grup — idari kontrolü ayrı yapılır */
export function resolvePersonelGorevGrubuFromGorev(gorev?: string): PersonelGorevGrup {
  if (isFormenGorev(gorev)) return 'FORMEN';
  if (isSenorGorev(gorev)) return 'SENOR';
  if (isOperatorGorev(gorev)) return 'OPERATOR';
  if (isSoforGorev(gorev)) return 'SOFOR';
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
};

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
    bumpDurum(bucket, dayData?.durum as YoklamaDurum | undefined);
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
