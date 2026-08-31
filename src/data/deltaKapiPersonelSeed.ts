import { CariKart, Personel } from '../types/erp';

/** DELTA KAPI taşeron firması personel kadrosu — mükerrersiz TC ile seed/upsert */
const FIRMA = 'DELTA KAPI';

type DeltaKapiRow = {
  ad: string;
  soyad: string;
  tcNo: string;
  iseGirisTarihi: string; // YYYY-MM-DD
  istenCikisTarihi?: string; // YYYY-MM-DD
  gorev: string;
  maas: number;
  meslekKodu?: string;
};

function trDate(d: string): string {
  const [day, month, year] = d.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const ROWS: DeltaKapiRow[] = [
  {
    ad: 'UFUK',
    soyad: 'TEZCAN',
    tcNo: '23138252578',
    iseGirisTarihi: trDate('23.07.2025'),
    gorev: 'Pazarlamacı',
    maas: 3322.03,
    meslekKodu: '00000',
  },
  {
    ad: 'ŞAHİN',
    soyad: 'ELTER',
    tcNo: '32530740330',
    iseGirisTarihi: trDate('24.12.2025'),
    gorev: 'Çelik Kapı Montaj İşçisi',
    maas: 8219.05,
    meslekKodu: '05510',
  },
  {
    ad: 'YUNUS',
    soyad: 'ÖZKOL',
    tcNo: '49900028776',
    iseGirisTarihi: trDate('29.01.2026'),
    gorev: 'Çelik Kapı Montaj İşçisi',
    maas: 8219.05,
    meslekKodu: '05510',
  },
  {
    ad: 'SİNAN',
    soyad: 'BİLGİN',
    tcNo: '17099126870',
    iseGirisTarihi: trDate('20.02.2026'),
    istenCikisTarihi: trDate('01.07.2026'),
    gorev: 'İnşaat İşçisi',
    maas: 9313.02,
    meslekKodu: '05510',
  },
  {
    ad: 'MUHAMMET SAMET',
    soyad: 'MUÇİN',
    tcNo: '10223356518',
    iseGirisTarihi: trDate('06.05.2026'),
    istenCikisTarihi: trDate('01.07.2026'),
    gorev: 'Çelik Kapı Montaj İşçisi',
    maas: 8219.05,
    meslekKodu: '05510',
  },
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

function isDeltaKapiFirma(p: Pick<Personel, 'firmaTipi' | 'firmaAdi'>): boolean {
  return p.firmaTipi === 'TASERON' && norm(p.firmaAdi || '').includes('DELTA KAPI');
}

function toPersonel(row: DeltaKapiRow): Personel {
  const tc = digits(row.tcNo);
  const aktif = !row.istenCikisTarihi;
  return {
    id: `PRS-DELTAKAPI-${tc}`,
    tcNo: tc,
    ad: row.ad,
    soyad: row.soyad,
    babaAdi: '',
    dogumTarihi: '',
    telefonNo: '',
    eposta: '',
    adres: row.meslekKodu ? `SGK meslek kodu: ${row.meslekKodu}` : '',
    il: '',
    ilce: '',
    departman: 'ŞANTİYE',
    gorev: row.gorev,
    iseGirisTarihi: row.iseGirisTarihi,
    ...(row.istenCikisTarihi ? { istenCikisTarihi: row.istenCikisTarihi } : {}),
    cinsiyet: 'Erkek',
    maas: row.maas,
    ucretTipi: 'Aylık',
    sgkDurumu: "SGK'lı",
    bankaAdi: '',
    subeAdi: '',
    ibanNo: '',
    durum: aktif,
    firmaTipi: 'TASERON',
    firmaAdi: FIRMA,
    personelGrubu: 'SAHA',
  };
}

export function getDeltaKapiPersonelSeed(): Personel[] {
  return ROWS.map(toPersonel);
}

export function makeDeltaKapiCari(existingTaseronCount: number): CariKart {
  return {
    id: 'ck_taseron_delta_kapi',
    kartTipi: 'TASERON',
    kod: `TSR-DELTAKAPI-${String(existingTaseronCount + 1).padStart(3, '0')}`,
    unvan: FIRMA,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'DELTA KAPI taşeron personel kaydı',
    iban: '',
    durum: 'AKTIF',
    notlar: 'src/data/deltaKapiPersonelSeed.ts ile oluşturuldu',
  };
}

/** DELTA KAPI adlı TASERON cari yoksa oluşturmak için kart döner */
export function ensureDeltaKapiCari(existing: CariKart[]): CariKart | null {
  const found = existing.find(
    (c) => c.kartTipi === 'TASERON' && norm(c.unvan).includes('DELTA KAPI')
  );
  if (found) return null;
  const taseronCount = existing.filter((c) => c.kartTipi === 'TASERON').length;
  return makeDeltaKapiCari(taseronCount);
}

/**
 * Mevcut listeye DELTA KAPI taşeron personelini TC ile birleştirir.
 * - TC yoksa ekler
 * - TC varsa firma / eksik görev-maaş / giriş-çıkış alanlarını bağlar (mükerrer oluşturmaz)
 * - Kullanıcının girdiği görev ve maaş değerlerini seed ile ezmez
 * - TC yok ama isim eşleşirse mevcut kaydı DELTA KAPI'ye bağlar
 */
export function mergeDeltaKapiIntoPersonelList(existing: Personel[]): {
  list: Personel[];
  toSave: Personel[];
} {
  const seed = getDeltaKapiPersonelSeed();
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
      if (!isDeltaKapiFirma(byTcHit)) continue;

      const needsPatch =
        (byTcHit.ad || '') !== s.ad ||
        (byTcHit.soyad || '') !== s.soyad ||
        (!byTcHit.iseGirisTarihi && !!s.iseGirisTarihi) ||
        (s.istenCikisTarihi && byTcHit.istenCikisTarihi !== s.istenCikisTarihi) ||
        (s.istenCikisTarihi && byTcHit.durum !== false) ||
        (!(byTcHit.gorev || '').trim() && !!(s.gorev || '').trim()) ||
        (!(Number(byTcHit.maas) > 0) && Number(s.maas) > 0);

      if (!needsPatch) continue;

      const patched: Personel = {
        ...byTcHit,
        ad: s.ad,
        soyad: s.soyad,
        tcNo: tc,
        gorev: (byTcHit.gorev || '').trim() || s.gorev,
        maas: Number(byTcHit.maas) > 0 ? Number(byTcHit.maas) : s.maas,
        ucretTipi: byTcHit.ucretTipi || 'Aylık',
        firmaTipi: 'TASERON',
        firmaAdi: FIRMA,
        personelGrubu: byTcHit.personelGrubu || 'SAHA',
        iseGirisTarihi: byTcHit.iseGirisTarihi || s.iseGirisTarihi,
        ...(s.istenCikisTarihi
          ? { istenCikisTarihi: s.istenCikisTarihi, durum: false }
          : { durum: byTcHit.durum !== false }),
        adres: byTcHit.adres || s.adres,
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
      if (byNameHit.firmaTipi === 'ANA_FIRMA' || (!isDeltaKapiFirma(byNameHit) && String(byNameHit.firmaAdi || '').trim())) {
        continue;
      }

      const needsPatch =
        digits(byNameHit.tcNo) !== tc ||
        (byNameHit.ad || '') !== s.ad ||
        (byNameHit.soyad || '') !== s.soyad ||
        (!byNameHit.iseGirisTarihi && !!s.iseGirisTarihi) ||
        (s.istenCikisTarihi && byNameHit.istenCikisTarihi !== s.istenCikisTarihi) ||
        (!(byNameHit.gorev || '').trim() && !!(s.gorev || '').trim()) ||
        (!(Number(byNameHit.maas) > 0) && Number(s.maas) > 0);

      if (!needsPatch) continue;

      const patched: Personel = {
        ...byNameHit,
        tcNo: tc || byNameHit.tcNo || '',
        ad: s.ad,
        soyad: s.soyad,
        gorev: (byNameHit.gorev || '').trim() || s.gorev,
        maas: Number(byNameHit.maas) > 0 ? Number(byNameHit.maas) : s.maas,
        ucretTipi: byNameHit.ucretTipi || 'Aylık',
        firmaTipi: 'TASERON',
        firmaAdi: FIRMA,
        personelGrubu: byNameHit.personelGrubu || 'SAHA',
        iseGirisTarihi: byNameHit.iseGirisTarihi || s.iseGirisTarihi,
        ...(s.istenCikisTarihi
          ? { istenCikisTarihi: s.istenCikisTarihi, durum: false }
          : { durum: true }),
        adres: byNameHit.adres || s.adres,
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
