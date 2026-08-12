import { CariKart, Personel } from '../types/erp';

/** YEDİTEPE taşeron firması personel kadrosu — mükerrersiz TC ile seed/upsert */
const FIRMA = 'YEDİTEPE';

type YeditepeRow = {
  ad: string;
  soyad: string;
  tcNo: string;
  iseGirisTarihi: string; // YYYY-MM-DD
};

function trDate(d: string): string {
  const [day, month, year] = d.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const ROWS: YeditepeRow[] = [
  { ad: 'BAYRAM', soyad: 'ATEŞ', tcNo: '53098666306', iseGirisTarihi: trDate('17.07.2026') },
  { ad: 'ERAY', soyad: 'DÜZENLİ', tcNo: '56152515268', iseGirisTarihi: trDate('17.07.2026') },
  { ad: 'EROL', soyad: 'DÜZENLİ', tcNo: '56308510086', iseGirisTarihi: trDate('17.07.2026') },
  { ad: 'FERHAT', soyad: 'YAVUZKILIÇ', tcNo: '58909575716', iseGirisTarihi: trDate('12.07.2026') },
  { ad: 'HAKAN', soyad: 'DEMİRBOĞA', tcNo: '43510979862', iseGirisTarihi: trDate('12.07.2026') },
  { ad: 'HAYRETTİN', soyad: 'ALDEMİR', tcNo: '39494118830', iseGirisTarihi: trDate('18.07.2026') },
  { ad: 'OLCAY', soyad: 'DÜZENLİ', tcNo: '46366841604', iseGirisTarihi: trDate('17.07.2026') },
  { ad: 'EMRAH', soyad: 'ALTAN', tcNo: '38114180332', iseGirisTarihi: trDate('20.07.2026') },
  { ad: 'HAMİT', soyad: 'ZENGİN', tcNo: '41537031914', iseGirisTarihi: trDate('21.07.2026') },
];

function norm(s: string): string {
  return String(s || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(tc: string): string {
  return String(tc || '').replace(/\D/g, '');
}

function nameKey(ad: string, soyad: string): string {
  return norm(`${ad} ${soyad}`);
}

function isYeditepeFirma(p: Pick<Personel, 'firmaTipi' | 'firmaAdi'>): boolean {
  return p.firmaTipi === 'TASERON' && norm(p.firmaAdi || '').includes('YEDITEPE');
}

function toPersonel(row: YeditepeRow): Personel {
  const tc = digits(row.tcNo);
  return {
    id: `PRS-YEDITEPE-${tc}`,
    tcNo: tc,
    ad: row.ad,
    soyad: row.soyad,
    babaAdi: '',
    dogumTarihi: '',
    telefonNo: '',
    eposta: '',
    adres: '',
    il: '',
    ilce: '',
    departman: 'ŞANTİYE',
    gorev: 'DÜZ İŞÇİ',
    iseGirisTarihi: row.iseGirisTarihi,
    cinsiyet: 'Erkek',
    maas: 0,
    ucretTipi: 'Günlük',
    sgkDurumu: "SGK'lı",
    bankaAdi: '',
    subeAdi: '',
    ibanNo: '',
    durum: true,
    firmaTipi: 'TASERON',
    firmaAdi: FIRMA,
    personelGrubu: 'SAHA',
  };
}

export function getYeditepePersonelSeed(): Personel[] {
  return ROWS.map(toPersonel);
}

export function makeYeditepeCari(existingTaseronCount: number): CariKart {
  return {
    id: 'ck_taseron_yeditepe',
    kartTipi: 'TASERON',
    kod: `TSR-YEDITEPE-${String(existingTaseronCount + 1).padStart(3, '0')}`,
    unvan: FIRMA,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'YEDİTEPE taşeron personel kaydı',
    iban: '',
    durum: 'AKTIF',
    notlar: 'src/data/yeditepePersonelSeed.ts ile oluşturuldu',
  };
}

/** YEDİTEPE adlı TASERON cari yoksa oluşturmak için kart döner */
export function ensureYeditepeCari(existing: CariKart[]): CariKart | null {
  const found = existing.find(
    (c) => c.kartTipi === 'TASERON' && norm(c.unvan).includes('YEDITEPE')
  );
  if (found) return null;
  const taseronCount = existing.filter((c) => c.kartTipi === 'TASERON').length;
  return makeYeditepeCari(taseronCount);
}

/**
 * Mevcut listeye YEDİTEPE taşeron personelini TC ile birleştirir.
 * - TC yoksa ekler
 * - TC YEDİTEPE'deyse ad/soyad/giriş tarihini tamamlar
 * - TC ana firmada veya başka taşeronda ise dokunmaz (zorla YEDİTEPE'ye geri çekmez)
 */
export function mergeYeditepeIntoPersonelList(existing: Personel[]): {
  list: Personel[];
  toSave: Personel[];
} {
  const seed = getYeditepePersonelSeed();
  const byTc = new Map<string, Personel>();
  const byName = new Map<string, Personel>();
  existing.forEach((p) => {
    const tc = digits(p.tcNo);
    if (tc) byTc.set(tc, p);
    byName.set(nameKey(p.ad, p.soyad), p);
  });

  const toSave: Personel[] = [];
  const next = [...existing];

  for (const s of seed) {
    const tc = digits(s.tcNo);
    if (!tc) continue;

    const byTcHit = byTc.get(tc);
    if (byTcHit) {
      // Ana firmaya / başka firmaya taşınmış kaydı seed ile geri alma
      if (!isYeditepeFirma(byTcHit)) continue;

      const needsPatch =
        (byTcHit.ad || '') !== s.ad ||
        (byTcHit.soyad || '') !== s.soyad ||
        (!byTcHit.iseGirisTarihi && !!s.iseGirisTarihi);

      if (!needsPatch) continue;

      const patched: Personel = {
        ...byTcHit,
        ad: s.ad,
        soyad: s.soyad,
        tcNo: tc,
        firmaTipi: 'TASERON',
        firmaAdi: FIRMA,
        personelGrubu: byTcHit.personelGrubu || 'SAHA',
        iseGirisTarihi: byTcHit.iseGirisTarihi || s.iseGirisTarihi,
        durum: byTcHit.durum !== false,
      };
      const idx = next.findIndex((p) => p.id === byTcHit.id);
      if (idx >= 0) next[idx] = patched;
      toSave.push(patched);
      byTc.set(tc, patched);
      byName.set(nameKey(patched.ad, patched.soyad), patched);
      continue;
    }

    const byNameHit = byName.get(nameKey(s.ad, s.soyad));
    if (byNameHit) {
      // İsim eşleşmesi de yalnızca boş/YEDİTEPE kaydı tamamlar; ana firma kişisini çalmaz
      if (byNameHit.firmaTipi === 'ANA_FIRMA' || (!isYeditepeFirma(byNameHit) && String(byNameHit.firmaAdi || '').trim())) {
        continue;
      }

      const patched: Personel = {
        ...byNameHit,
        tcNo: tc || byNameHit.tcNo || '',
        ad: s.ad,
        soyad: s.soyad,
        firmaTipi: 'TASERON',
        firmaAdi: FIRMA,
        personelGrubu: byNameHit.personelGrubu || 'SAHA',
        iseGirisTarihi: byNameHit.iseGirisTarihi || s.iseGirisTarihi,
        durum: true,
      };
      const idx = next.findIndex((p) => p.id === byNameHit.id);
      if (idx >= 0) next[idx] = patched;
      toSave.push(patched);
      byTc.set(tc, patched);
      byName.set(nameKey(patched.ad, patched.soyad), patched);
      continue;
    }

    next.push(s);
    byTc.set(tc, s);
    byName.set(nameKey(s.ad, s.soyad), s);
    toSave.push(s);
  }

  return { list: next, toSave };
}
