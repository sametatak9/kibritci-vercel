import { AylikYoklamaMap, KampFaaliyet, Personel, SahaFaaliyeti } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { FAALIYET_ETIKET_ONSETLERI, normalizeFaaliyetEtiketi } from './faaliyetEtiketUtils';
import { personMatchesFaaliyet, personMatchesKampFaaliyet } from './faaliyetPersonelUtils';
import { getYoklamaDay } from './yoklamaUtils';

export const KATEGORI_USTA_YARDIM = 'USTA YARDIMCILIĞI';
export const KATEGORI_TEMIZLIK = 'TEMİZLİK';
export const KATEGORI_DIGER = 'DİĞER';

const KATEGORI_ONCELIK = [
  KATEGORI_USTA_YARDIM,
  KATEGORI_TEMIZLIK,
  ...FAALIYET_ETIKET_ONSETLERI.filter(
    (e) => e !== KATEGORI_USTA_YARDIM && e !== KATEGORI_TEMIZLIK && e !== KATEGORI_DIGER
  ),
  KATEGORI_DIGER,
];

function upperTr(raw?: string | null): string {
  return String(raw || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function blobText(parts: Array<string | undefined | null>): string {
  return parts.map((p) => upperTr(p)).filter(Boolean).join(' · ');
}

function inferFromText(blob: string): string {
  if (/USTA\s*YARDIM|YARDIMCILIK|YARDIMCI\s*USTA/.test(blob)) return KATEGORI_USTA_YARDIM;
  if (/TEM[İI]ZL[İI]K/.test(blob)) return KATEGORI_TEMIZLIK;
  return '';
}

export type FaaliyetKategoriKaynak = {
  isEtiketi?: string;
  isNiteligi?: string;
  aciklama?: string;
  faaliyetTipi?: string;
  faaliyetGrubu?: string;
  yerleskeAdi?: string;
};

/** Saha / kamp kaydının rapor kategorisi (etiket, iş niteliği, açıklama). */
export function classifyFaaliyetKategori(f: FaaliyetKategoriKaynak | null | undefined): string {
  if (!f) return KATEGORI_DIGER;
  const etiket = normalizeFaaliyetEtiketi(f.isEtiketi);
  if (etiket === KATEGORI_USTA_YARDIM || etiket === KATEGORI_TEMIZLIK) return etiket;

  const inferred = inferFromText(
    blobText([etiket, f.isNiteligi, f.aciklama, f.faaliyetTipi, f.faaliyetGrubu, f.yerleskeAdi])
  );
  if (inferred) return inferred;
  if (etiket) return etiket;
  return KATEGORI_DIGER;
}

export function kategoriSirasi(a: string, b: string): number {
  const ia = KATEGORI_ONCELIK.indexOf(a as (typeof KATEGORI_ONCELIK)[number]);
  const ib = KATEGORI_ONCELIK.indexOf(b as (typeof KATEGORI_ONCELIK)[number]);
  const sa = ia >= 0 ? ia : KATEGORI_ONCELIK.length;
  const sb = ib >= 0 ? ib : KATEGORI_ONCELIK.length;
  if (sa !== sb) return sa - sb;
  return a.localeCompare(b, 'tr');
}

export function kategoriRenk(kategori: string): { bg: string; fg: string; head: string } {
  if (kategori === KATEGORI_USTA_YARDIM) return { bg: '#ede9fe', fg: '#5b21b6', head: '#6d28d9' };
  if (kategori === KATEGORI_TEMIZLIK) return { bg: '#ccfbf1', fg: '#115e59', head: '#0f766e' };
  if (kategori === 'KIRIM İŞLERİ') return { bg: '#ffe4e6', fg: '#9f1239', head: '#be123c' };
  if (kategori === 'KAMP') return { bg: '#fef9c3', fg: '#854d0e', head: '#a16207' };
  return { bg: '#f1f5f9', fg: '#334155', head: '#1e4e78' };
}

export type GunlukKategoriPersonel = {
  id: string;
  adSoyad: string;
  gorev: string;
  yoklamaDurum: string;
  isler: string;
  kategoriler: string[];
};

export type GunlukKategoriGrup = {
  kategori: string;
  saha: SahaFaaliyeti[];
  kamp: KampFaaliyet[];
  personeller: GunlukKategoriPersonel[];
};

function yoklamaEtiketFor(
  personelId: string,
  dateKey: string,
  yoklamalar?: AylikYoklamaMap
): string {
  const dk = normalizeDateKey(dateKey);
  if (!dk || !yoklamalar) return '';
  const [y, m, d] = dk.split('-').map(Number);
  if (!y || !m || !d) return '';
  return normalizeFaaliyetEtiketi(getYoklamaDay(yoklamalar[personelId], y, m, d)?.isEtiketi);
}

export function personelKategorileri(opts: {
  personel: Personel;
  saha: SahaFaaliyeti[];
  kamp: KampFaaliyet[];
  dateKey: string;
  yoklamalar?: AylikYoklamaMap;
}): { kategoriler: string[]; isler: string } {
  const { personel, saha, kamp } = opts;
  const cats = new Set<string>();
  const isler: string[] = [];

  for (const f of saha) {
    if (!personMatchesFaaliyet(personel, f)) continue;
    cats.add(classifyFaaliyetKategori(f));
    const n = String(f.isNiteligi || f.aciklama || '').trim();
    if (n && !isler.includes(n)) isler.push(n);
  }
  for (const f of kamp) {
    if (!personMatchesKampFaaliyet(personel, f)) continue;
    cats.add(classifyFaaliyetKategori(f));
    const n = String(f.yerleskeAdi || f.faaliyetTipi || f.aciklama || '').trim();
    if (n && !isler.includes(n)) isler.push(n);
  }

  if (cats.size === 0) {
    const yokEtiket = yoklamaEtiketFor(personel.id, opts.dateKey, opts.yoklamalar);
    const inferred = yokEtiket ? classifyFaaliyetKategori({ isEtiketi: yokEtiket }) : '';
    if (inferred) cats.add(inferred);
  }

  const kategoriler = [...cats].sort(kategoriSirasi);
  return {
    kategoriler: kategoriler.length ? kategoriler : [KATEGORI_DIGER],
    isler: isler.join(' · ') || '—',
  };
}

export function buildGunlukKategoriRaporu(opts: {
  saha: SahaFaaliyeti[];
  kamp: KampFaaliyet[];
  personeller: Personel[];
  faaliyetli: Array<{
    id: string;
    adSoyad: string;
    gorev: string;
    yoklamaDurum: string;
  }>;
  dateKey: string;
  yoklamalar?: AylikYoklamaMap;
}): {
  gruplar: GunlukKategoriGrup[];
  ustaYardim: GunlukKategoriPersonel[];
  temizlik: GunlukKategoriPersonel[];
} {
  const byKat = new Map<string, GunlukKategoriGrup>();
  const ensure = (kategori: string): GunlukKategoriGrup => {
    let g = byKat.get(kategori);
    if (!g) {
      g = { kategori, saha: [], kamp: [], personeller: [] };
      byKat.set(kategori, g);
    }
    return g;
  };

  for (const f of opts.saha) ensure(classifyFaaliyetKategori(f)).saha.push(f);
  for (const f of opts.kamp) ensure(classifyFaaliyetKategori(f)).kamp.push(f);

  const personRows: GunlukKategoriPersonel[] = opts.faaliyetli.map((p) => {
    const personel = opts.personeller.find((x) => x.id === p.id);
    const extra = personel
      ? personelKategorileri({
          personel,
          saha: opts.saha,
          kamp: opts.kamp,
          dateKey: opts.dateKey,
          yoklamalar: opts.yoklamalar,
        })
      : { kategoriler: [KATEGORI_DIGER], isler: '—' };
    return {
      id: p.id,
      adSoyad: p.adSoyad,
      gorev: p.gorev,
      yoklamaDurum: p.yoklamaDurum,
      isler: extra.isler,
      kategoriler: extra.kategoriler,
    };
  });

  for (const row of personRows) {
    for (const k of row.kategoriler) {
      const g = ensure(k);
      if (!g.personeller.some((x) => x.id === row.id)) g.personeller.push(row);
    }
  }

  const gruplar = [...byKat.values()].sort((a, b) => kategoriSirasi(a.kategori, b.kategori));
  return {
    gruplar,
    ustaYardim: personRows.filter((p) => p.kategoriler.includes(KATEGORI_USTA_YARDIM)),
    temizlik: personRows.filter((p) => p.kategoriler.includes(KATEGORI_TEMIZLIK)),
  };
}
