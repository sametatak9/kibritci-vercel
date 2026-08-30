import { SahaKolajFoto } from '../types/erp';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';

export const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function albumKeyFrom(yil: number, ay: number): string {
  return `${yil}-${String(ay).padStart(2, '0')}`;
}

export function parseAlbumKey(key: string): { yil: number; ay: number } {
  const [y, m] = key.split('-');
  return { yil: Number(y), ay: Number(m) };
}

export function albumBaslik(yil: number, ay: number): string {
  return `${AY_ADLARI[ay - 1] ?? ay}. Ay ${yil}`;
}

export interface KolajGrup {
  ad: string;
  fotolar: SahaKolajFoto[];
}

export function groupKolajFotolari(fotolar: SahaKolajFoto[]): KolajGrup[] {
  const map = new Map<string, SahaKolajFoto[]>();
  const sorted = [...fotolar].sort((a, b) => a.sira - b.sira || a.yuklemeTarihi.localeCompare(b.yuklemeTarihi));

  for (const f of sorted) {
    const p = f.parsel || 'Genel Saha';
    const b = f.blok || 'Belirtilmedi';
    const key = `${p} / ${b}`;
    
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }

  const groups: KolajGrup[] = [];
  for (const [key, fotos] of map) {
    groups.push({ ad: key, fotolar: fotos });
  }
  
  return groups.sort((a, b) => a.ad.localeCompare(b.ad));
}

type SahaFaaliyetFotoKaynak = {
  id?: string;
  tarih?: string;
  fotoUrl?: string;
  fotoUrls?: string[];
  sahaFotoBase64?: string;
  fotoBase64?: string;
  fotograflar?: string[];
  isinAdi?: string;
  isNiteligi?: string;
  aciklama?: string;
  parsel?: string;
  blok?: string;
  kaydeden?: string;
  kaynakEkran?: string;
};

type ProgramliFaaliyetFotoKaynak = {
  id?: string;
  tarih?: string;
  isinAdi?: string;
  parsel?: string;
  bloklar?: string;
  olusturan?: string;
  asamalar?: Array<{
    adim?: string;
    tamamlandi?: boolean;
    fotoUrl?: string;
    aciklama?: string;
    tamamlanmaTarihi?: string;
  }>;
};

type KampFaaliyetFotoKaynak = {
  id?: string;
  tarih?: string;
  fotoUrl?: string | null;
  photo?: string | null;
  faaliyetTipi?: string;
  kategori?: string;
  aciklama?: string;
  yerleskeAdi?: string;
  kaydeden?: string;
  kaydedenKampci?: string;
};

/**
 * Kolaj ekranı ile aynı birleşik liste:
 * sahaKolajFotolari + saha/tesisatçı/mermerci + kamp + programlı faaliyet fotoğrafları.
 */
export function mergeAlbumFotolari(input: {
  albumKey: string;
  yil: number;
  ay: number;
  kolajFotolari: SahaKolajFoto[];
  sahaFaaliyetleri?: SahaFaaliyetFotoKaynak[];
  programliFaaliyetler?: ProgramliFaaliyetFotoKaynak[];
  kampFaaliyetleri?: KampFaaliyetFotoKaynak[];
}): SahaKolajFoto[] {
  const { albumKey, yil, ay } = input;
  const list: SahaKolajFoto[] = [...(input.kolajFotolari || [])];
  let siraOffset = list.length > 0 ? Math.max(...list.map((f) => f.sira || 0)) + 1 : 1;

  (input.sahaFaaliyetleri || []).forEach((sf) => {
    if (!sf.tarih || !String(sf.tarih).startsWith(albumKey)) return;
    const urls = getFaaliyetFotolar(sf);
    urls.forEach((url, i) => {
      if (!url) return;
      const id = `sf_${sf.id}_${i}`;
      if (list.some((x) => x.id === id)) return;
      const kaynak =
        sf.kaynakEkran === 'TESISATCI_MOBIL'
          ? 'Tesisatçı'
          : sf.kaynakEkran === 'MERMERCI_MOBIL'
            ? 'Mermerci'
            : sf.kaynakEkran === 'SERAMIK_MOBIL'
              ? 'Götürü'
              : sf.kaynakEkran === 'FORMEN_MOBIL'
              ? 'Formen'
              : 'Saha';
      list.push({
        id,
        albumKey,
        yil,
        ay,
        imageUrl: url,
        baslik: sf.isinAdi || sf.isNiteligi || `${kaynak} Faaliyeti`,
        aciklama: sf.aciklama,
        grupAdi: `${kaynak} · ${sf.parsel || '—'} / ${sf.blok || '—'}`,
        sira: siraOffset++,
        yuklemeTarihi: sf.tarih,
        yukleyen: sf.kaydeden || kaynak,
        parsel: sf.parsel || kaynak,
        blok: sf.blok,
      });
    });
  });

  (input.kampFaaliyetleri || []).forEach((kf) => {
    if (!kf.tarih || !String(kf.tarih).startsWith(albumKey)) return;
    const url = String(kf.fotoUrl || kf.photo || '').trim();
    if (!url) return;
    const id = `kamp_${kf.id}_0`;
    if (list.some((x) => x.id === id)) return;
    list.push({
      id,
      albumKey,
      yil,
      ay,
      imageUrl: url,
      baslik: kf.faaliyetTipi || kf.kategori || 'Kamp Faaliyeti',
      aciklama: kf.aciklama,
      grupAdi: `Kamp · ${kf.yerleskeAdi || '—'}`,
      sira: siraOffset++,
      yuklemeTarihi: kf.tarih,
      yukleyen: kf.kaydeden || kf.kaydedenKampci || 'Kampçı',
      parsel: 'Kamp',
      blok: kf.yerleskeAdi || 'Lojman',
    });
  });

  (input.programliFaaliyetler || []).forEach((pf) => {
    if (!pf.tarih || !String(pf.tarih).startsWith(albumKey)) return;
    (pf.asamalar || []).forEach((asama) => {
      if (!asama.tamamlandi || !asama.fotoUrl) return;
      const id = `pf_${pf.id}_${asama.adim}`;
      if (list.some((x) => x.id === id)) return;
      list.push({
        id,
        albumKey,
        yil,
        ay,
        imageUrl: asama.fotoUrl,
        baslik: `${pf.isinAdi || 'Programlı'} (${asama.adim || ''})`,
        aciklama: asama.aciklama,
        grupAdi: `Parsel: ${pf.parsel || '—'} - Blok: ${pf.bloklar || '—'}`,
        sira: siraOffset++,
        yuklemeTarihi: asama.tamamlanmaTarihi || pf.tarih,
        yukleyen: pf.olusturan || 'Formen',
        parsel: pf.parsel,
        blok: pf.bloklar,
      });
    });
  });

  return list.sort((a, b) => a.sira - b.sira || a.yuklemeTarihi.localeCompare(b.yuklemeTarihi));
}

export type MagazinePageType = 'cover' | 'toc' | 'section' | 'spread' | 'collage' | 'summary';

export interface MagazinePage {
  type: MagazinePageType;
  title?: string;
  subtitle?: string;
  photos?: SahaKolajFoto[];
  groups?: { ad: string; count: number }[];
  summaryData?: { parsel: string; count: number; bloks: string[] }[];
}

const SPREAD_SIZE = 4;

export function buildMagazinePages(fotolar: SahaKolajFoto[], yil: number, ay: number): MagazinePage[] {
  if (fotolar.length === 0) return [];

  const pages: MagazinePage[] = [];
  const groups = groupKolajFotolari(fotolar);

  pages.push({
    type: 'cover',
    title: albumBaslik(yil, ay),
    subtitle: 'Şantiye Saha Faaliyetleri Foto Dergisi',
  });

  pages.push({
    type: 'toc',
    title: 'İçindekiler',
    groups: groups.map((g) => ({ ad: g.ad, count: g.fotolar.length })),
  });

  for (const group of groups) {
    pages.push({ type: 'section', title: group.ad, subtitle: `${group.fotolar.length} fotoğraf` });
    for (let i = 0; i < group.fotolar.length; i += SPREAD_SIZE) {
      pages.push({
        type: 'spread',
        title: group.ad,
        photos: group.fotolar.slice(i, i + SPREAD_SIZE),
      });
    }
  }

  pages.push({ type: 'collage', title: 'Ay Özeti Kolaj', photos: fotolar });

  // Summary Page
  const parselMap = new Map<string, Set<string>>();
  for (const f of fotolar) {
    const p = f.parsel || 'Genel Saha';
    const b = f.blok || 'Belirtilmedi';
    if (!parselMap.has(p)) parselMap.set(p, new Set());
    parselMap.get(p)!.add(b);
  }

  const summaryData = Array.from(parselMap.entries()).map(([parsel, blocks]) => {
    const count = fotolar.filter((f) => (f.parsel || 'Genel Saha') === parsel).length;
    return {
      parsel,
      count,
      bloks: Array.from(blocks).sort(),
    };
  }).sort((a, b) => b.count - a.count);

  pages.push({
    type: 'summary',
    title: 'Parsel Bazlı Faaliyet Özeti',
    summaryData,
  });

  return pages;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
