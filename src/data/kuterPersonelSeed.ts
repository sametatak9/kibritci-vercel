import { CariKart, Personel } from '../types/erp';

/** Kuter taşeron firması personel kadrosu — mükerrersiz TC ile seed/upsert */
const FIRMA = 'KUTER';

type KuterRow = {
  ad: string;
  soyad: string;
  tcNo: string;
  iseGirisTarihi: string; // YYYY-MM-DD
};

const ROWS: KuterRow[] = [
  { ad: 'ADEM', soyad: 'AKDAĞ', tcNo: '10962087698', iseGirisTarihi: '2026-03-01' },
  { ad: 'BARIŞ', soyad: 'AĞGÜL', tcNo: '27665086538', iseGirisTarihi: '2026-03-30' },
  { ad: 'BÜLENT', soyad: 'KILIÇ', tcNo: '60124410222', iseGirisTarihi: '2026-06-01' },
  { ad: 'EKREM', soyad: 'GERÇEK', tcNo: '51616288108', iseGirisTarihi: '2026-03-30' },
  { ad: 'ERCAN', soyad: 'ARAS', tcNo: '57832041404', iseGirisTarihi: '2026-03-30' },
  { ad: 'ERKAN', soyad: 'GEVŞEK', tcNo: '14339532156', iseGirisTarihi: '2026-06-15' },
  { ad: 'FERHAT', soyad: 'GÜNEY', tcNo: '41314626760', iseGirisTarihi: '2026-06-01' },
  { ad: 'HALİL', soyad: 'KAZOĞLU', tcNo: '25541569816', iseGirisTarihi: '2026-06-03' },
  { ad: 'İBRAHİM HALİL', soyad: 'HURMA', tcNo: '30209407454', iseGirisTarihi: '2025-10-20' },
  { ad: 'İSA', soyad: 'DÖLEK', tcNo: '43921544710', iseGirisTarihi: '2026-03-30' },
  { ad: 'MEHMET', soyad: 'AĞGÜL', tcNo: '42937576968', iseGirisTarihi: '2026-06-16' },
  { ad: 'MEHMET SALİH', soyad: 'KARA', tcNo: '18202879300', iseGirisTarihi: '2026-03-01' },
  { ad: 'MUHAMMET', soyad: 'ŞAHİN', tcNo: '10365077548', iseGirisTarihi: '2026-03-30' },
  { ad: 'MURAT', soyad: 'GUNEY', tcNo: '41362625166', iseGirisTarihi: '2025-04-01' },
  { ad: 'RECEP TAYİP', soyad: 'TAŞKIN', tcNo: '17578267902', iseGirisTarihi: '2026-06-15' },
  { ad: 'SAMET', soyad: 'ACAR', tcNo: '13160122376', iseGirisTarihi: '2026-03-30' },
  { ad: 'VOLKAN', soyad: 'DÜZ', tcNo: '33128405006', iseGirisTarihi: '2024-08-26' },
  { ad: 'YUSUF', soyad: 'KARA', tcNo: '10310665080', iseGirisTarihi: '2026-06-05' },
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

function isKuterFirma(p: Pick<Personel, 'firmaTipi' | 'firmaAdi'>): boolean {
  return p.firmaTipi === 'TASERON' && norm(p.firmaAdi || '').includes('KUTER');
}

function toPersonel(row: KuterRow): Personel {
  const tc = digits(row.tcNo);
  return {
    id: `PRS-KUTER-${tc}`,
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

export function getKuterPersonelSeed(): Personel[] {
  return ROWS.map(toPersonel);
}

export function makeKuterCari(existingTaseronCount: number): CariKart {
  return {
    id: 'ck_taseron_kuter',
    kartTipi: 'TASERON',
    kod: `TSR-KUTER-${String(existingTaseronCount + 1).padStart(3, '0')}`,
    unvan: FIRMA,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'Kuter taşeron personel kaydı',
    iban: '',
    durum: 'AKTIF',
    notlar: 'src/data/kuterPersonelSeed.ts ile oluşturuldu',
  };
}

/** KUTER adlı TASERON cari yoksa oluşturmak için kart döner */
export function ensureKuterCari(existing: CariKart[]): CariKart | null {
  const found = existing.find(
    (c) => c.kartTipi === 'TASERON' && norm(c.unvan).includes('KUTER')
  );
  if (found) return null;
  const taseronCount = existing.filter((c) => c.kartTipi === 'TASERON').length;
  return makeKuterCari(taseronCount);
}

/**
 * Mevcut listeye Kuter taşeron personelini TC ile birleştirir.
 * - TC yoksa ekler
 * - TC varsa firmaTipi/firmaAdi/ad/soyad/giriş tarihini Kuter'e bağlar (mükerrer oluşturmaz)
 * - TC yok ama isim eşleşirse mevcut kaydı Kuter'e bağlar (TC doldurulur)
 */
export function mergeKuterIntoPersonelList(existing: Personel[]): {
  list: Personel[];
  toSave: Personel[];
} {
  const seed = getKuterPersonelSeed();
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
      if (!isKuterFirma(byTcHit)) continue;

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
      if (byNameHit.firmaTipi === 'ANA_FIRMA' || (!isKuterFirma(byNameHit) && String(byNameHit.firmaAdi || '').trim())) {
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
