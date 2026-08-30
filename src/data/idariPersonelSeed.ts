import { Personel } from '../types/erp';
import { isPersonelTcSuppressed, loadSuppressedPersonelTcs, REMOVED_IDARI_PLACEHOLDER_TCS } from '../lib/personelSeedSuppress';

import { personelAdSoyadKey } from '../lib/personelKayitKaliteUtils';
import { isTaseronPersonel } from '../lib/yoklamaUtils';

/** İdari kadro — yoklamaya girmez; izin / tutanak / araç tahsis vb. evraklarda seçilebilir */
type IdariRow = {
  ad: string;
  soyad: string;
  tcNo: string;
  ibanNo?: string;
  iseGirisTarihi: string; // YYYY-MM-DD
  gorev: string;
  cinsiyet?: 'Erkek' | 'Kadın';
  /** TC henüz girilmedi — sahte 11 hane yazılmaz; eşleşme id + isim ile */
  tcBekleniyor?: boolean;
};

function trDate(d: string): string {
  const [day, month, year] = d.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const ROWS: IdariRow[] = [
  { ad: 'ABDULLAH', soyad: 'ÖZYILMAZ', tcNo: '19088030526', iseGirisTarihi: trDate('15.04.2024'), gorev: 'Harita' },
  { ad: 'HASAN AYHAN', soyad: 'DEMİRKIRAN', tcNo: '23867707066', iseGirisTarihi: trDate('22.04.2024'), gorev: 'Makine Mühendisi' },
  { ad: 'ENES HAMZA', soyad: 'BULAT', tcNo: '47908125916', iseGirisTarihi: trDate('22.05.2024'), gorev: 'İnşaat Mühendisi' },
  { ad: 'FATİH', soyad: 'ÖZBAKIR', tcNo: '14407429494', iseGirisTarihi: trDate('03.07.2024'), gorev: 'Elektrik Mühendisi' },
  { ad: 'SAMET', soyad: 'AKSOY', tcNo: '14090197304', iseGirisTarihi: trDate('08.07.2024'), gorev: 'Mimar' },
  { ad: 'CAN', soyad: 'AYDIN', tcNo: '63322268428', iseGirisTarihi: trDate('11.07.2024'), gorev: 'Mimar' },
  { ad: 'KİBAR', soyad: 'ÖZER', tcNo: '43030440828', iseGirisTarihi: trDate('16.07.2024'), gorev: 'İnsan Kaynakları' },
  { ad: 'AHMET', soyad: 'BASMACI', tcNo: '31760358766', iseGirisTarihi: trDate('30.07.2024'), gorev: 'Elektrikçi Ustası' },
  { ad: 'FURKAN', soyad: 'KAYA', tcNo: '19973238372', iseGirisTarihi: trDate('15.08.2024'), gorev: 'Makine Mühendisi' },
  { ad: 'EMRAH', soyad: 'AHISHAVİ', tcNo: '30209177616', iseGirisTarihi: trDate('19.08.2024'), gorev: 'Operatör' },
  { ad: 'İBRAHİM', soyad: 'OFLUOĞLU', tcNo: '41527395354', iseGirisTarihi: trDate('05.09.2024'), gorev: 'Formen' },
  { ad: 'ZEHRA', soyad: 'YALÇIN', tcNo: '70297148884', iseGirisTarihi: trDate('13.09.2024'), gorev: 'Mimar', cinsiyet: 'Kadın' },
  // İDARİ KAYIT-18 / KAYIT-22 kaldırıldı — placeholder adlar; silinince seed ile geri geliyordu
  { ad: 'MEHMET', soyad: 'KURNAZ', tcNo: '61624060252', iseGirisTarihi: trDate('09.04.2025'), gorev: 'Nezaretçi / Formen (İnşaat)' },
  { ad: 'TOLGA', soyad: 'ALPTEKİN', tcNo: '33745772086', iseGirisTarihi: trDate('22.05.2025'), gorev: 'Şenör' },
  { ad: 'HAMDİYE', soyad: 'SEVİM', tcNo: '43858753698', iseGirisTarihi: trDate('10.06.2025'), gorev: 'Ofis Elemanı', cinsiyet: 'Kadın' },
  { ad: 'SİNAN', soyad: 'GÖK', tcNo: '63202092396', iseGirisTarihi: trDate('16.06.2025'), gorev: 'Harita' },
  { ad: 'BURAK', soyad: 'TÜYSÜZ', tcNo: '12539478076', iseGirisTarihi: trDate('23.06.2025'), gorev: 'Harita' },
  { ad: 'RAMAZAN', soyad: 'SARIAY', tcNo: '31852984460', iseGirisTarihi: trDate('21.07.2025'), gorev: 'Harita' },
  { ad: 'SEZER', soyad: 'ÇİLİNGER', tcNo: '41948110840', iseGirisTarihi: trDate('29.09.2025'), gorev: 'Makine Mühendisi' },
  { ad: 'PINAR', soyad: 'DEMİRAĞ', tcNo: '56266133136', iseGirisTarihi: trDate('06.10.2025'), gorev: 'Mimar', cinsiyet: 'Kadın' },
  { ad: 'EMRE YUNUS', soyad: 'BOZYİĞİT', tcNo: '18158908178', iseGirisTarihi: trDate('27.10.2025'), gorev: 'İnşaat Mühendisi' },
  // YEDİTEPE taşeron → Kibritçi idari transfer
  { ad: 'OLCAY', soyad: 'DÜZENLİ', tcNo: '46366841604', iseGirisTarihi: trDate('12.08.2026'), gorev: 'Peyzaj Mimarı' },
  // Kart ID PENDING kalır (izin/ödeme bağları). TC = Ağustos 2026 SGK şube 34.
  // Birhan Velioğlu bu seed’de yok; arafta prs_sgk_13013461560 olarak açıldı.
  {
    ad: 'BÜŞRA',
    soyad: 'ÖZBİLEK',
    tcNo: '14372424838',
    ibanNo: 'TR910006200152200006629862',
    iseGirisTarihi: '2026-08-17',
    gorev: 'Mimar',
    cinsiyet: 'Kadın',
    tcBekleniyor: true,
  },
  {
    ad: 'GÜRSOY',
    soyad: 'MAZLUM',
    tcNo: '57733469734',
    ibanNo: 'TR860006200046700006628825',
    iseGirisTarihi: '2026-08-17',
    gorev: 'Genel Koordinatör',
    tcBekleniyor: true,
  },
  {
    ad: 'HATİCE BEGÜM',
    soyad: 'ASNA',
    tcNo: '20201223428',
    ibanNo: 'TR660001009010797675805001',
    iseGirisTarihi: '2026-08-17',
    gorev: 'Stajyer Mimar',
    cinsiyet: 'Kadın',
    tcBekleniyor: true,
  },
  {
    ad: 'KÜBRA',
    soyad: 'OK',
    tcNo: '10024486780',
    ibanNo: 'TR140006200073900006618867',
    iseGirisTarihi: '2026-08-17',
    gorev: 'İnşaat Mühendisi',
    cinsiyet: 'Kadın',
    tcBekleniyor: true,
  },
  {
    ad: 'MEHMET BUĞRA',
    soyad: 'ARDIÇ',
    tcNo: '23479948444',
    ibanNo: 'TR540006200041700006838395',
    iseGirisTarihi: '2026-08-17',
    gorev: 'Mimar',
    tcBekleniyor: true,
  },
  {
    ad: 'MEHMET MURAT',
    soyad: 'ASLAN',
    tcNo: '23944656638',
    ibanNo: 'TR350006200017400006621896',
    iseGirisTarihi: '2026-08-17',
    gorev: 'Proje Müdürü',
    tcBekleniyor: true,
  },
  {
    ad: 'YAHYA EREN',
    soyad: 'TURGAY',
    tcNo: '20357386510',
    ibanNo: 'TR280006200078800006812661',
    iseGirisTarihi: '2026-08-17',
    gorev: 'Peyzaj Mimarı',
    tcBekleniyor: true,
  },
];

function idariPendingId(row: IdariRow): string {
  const key = personelAdSoyadKey(row).replace(/\s+/g, '-') || 'X';
  return `PRS-IDARI-PENDING-${key}`;
}

function toPersonel(row: IdariRow, index: number): Personel {
  const tc = String(row.tcNo || '').trim();
  const pending = Boolean(row.tcBekleniyor) || !tc;
  return {
    id: pending ? idariPendingId(row) : `PRS-IDARI-${tc || index}`,
    tcNo: tc,
    ad: row.ad,
    soyad: row.soyad,
    babaAdi: '',
    dogumTarihi: '1990-01-01',
    telefonNo: '',
    eposta: '',
    adres: 'Kibritçi İnşaat — İdari Kadro',
    il: '',
    ilce: '',
    departman: 'İDARİ',
    gorev: row.gorev,
    iseGirisTarihi: row.iseGirisTarihi,
    cinsiyet: row.cinsiyet || 'Erkek',
    maas: 0,
    ucretTipi: 'Aylık',
    sgkDurumu: row.gorev.toLocaleLowerCase('tr-TR').includes('stajyer') ? 'Stajyer' : "SGK'lı",
    bankaAdi: '',
    subeAdi: '',
    ibanNo: String(row.ibanNo || '').replace(/\s+/g, '').toUpperCase(),
    durum: true,
    firmaTipi: 'ANA_FIRMA',
    firmaAdi: 'Kibritçi İnşaat',
    personelGrubu: 'IDARI',
  };
}

export function getIdariPersonelSeed(): Personel[] {
  return ROWS.map((r, i) => toPersonel(r, i + 1));
}

/**
 * Mevcut listeye idari kadroyu TC veya (TC yoksa) id/isim ile birleştirir.
 * Sahte 11 haneli TC yazılmaz; boş TC’li satırlar isim + pending id ile tek kart kalır.
 */
export function mergeIdariIntoPersonelList(
  existing: Personel[],
  options?: { suppressedTcs?: Set<string> }
): {
  list: Personel[];
  toSave: Personel[];
} {
  const seed = getIdariPersonelSeed();
  const suppressed = options?.suppressedTcs ?? loadSuppressedPersonelTcs();
  const byTc = new Map<string, Personel>();
  existing.forEach((p) => {
    const tc = String(p.tcNo || '').trim();
    if (tc) byTc.set(tc, p);
  });

  const toSave: Personel[] = [];
  const next = [...existing];

  for (const s of seed) {
    const tc = String(s.tcNo || '').trim();
    if (tc && (suppressed.has(tc) || isPersonelTcSuppressed(tc) || REMOVED_IDARI_PLACEHOLDER_TCS.has(tc))) {
      continue;
    }
    let found: Personel | undefined = tc ? byTc.get(tc) : undefined;
    if (!found) found = next.find((p) => p.id === s.id);
    if (!found) {
      const nameKey = personelAdSoyadKey(s);
      found = next.find(
        (p) =>
          !isTaseronPersonel(p) &&
          personelAdSoyadKey(p) === nameKey &&
          (p.personelGrubu === 'IDARI' || p.departman === 'İDARİ' || !String(p.tcNo || '').trim())
      );
    }
    if (!found) {
      next.push(s);
      if (tc) byTc.set(tc, s);
      toSave.push(s);
      continue;
    }
    const foundTc = String(found.tcNo || '').trim();
    const safeTc = REMOVED_IDARI_PLACEHOLDER_TCS.has(foundTc) ? '' : foundTc || tc;
    const seedIban = String(s.ibanNo || '').replace(/\s+/g, '').toUpperCase();
    const wasTaseron =
      found.firmaTipi === 'TASERON' ||
      (found.personelGrubu !== 'IDARI' && found.departman !== 'İDARİ');
    const needsPatch =
      found.personelGrubu !== 'IDARI' ||
      found.departman !== 'İDARİ' ||
      found.firmaTipi !== 'ANA_FIRMA' ||
      (found.ad || '') !== s.ad ||
      (found.soyad || '') !== s.soyad ||
      foundTc !== safeTc ||
      (seedIban && String(found.ibanNo || '').replace(/\s+/g, '').toUpperCase() !== seedIban) ||
      (wasTaseron && !!(s.gorev || '').trim() && (found.gorev || '').trim() !== s.gorev) ||
      (!(found.gorev || '').trim() && !!(s.gorev || '').trim());

    if (needsPatch) {
      const patched: Personel = {
        ...found,
        ad: s.ad.startsWith('İDARİ') && found.ad && !found.ad.startsWith('İDARİ') ? found.ad : s.ad,
        soyad:
          s.soyad.startsWith('KAYIT-') && found.soyad && !found.soyad.startsWith('KAYIT-')
            ? found.soyad
            : s.soyad,
        tcNo: safeTc,
        ibanNo: String(found.ibanNo || '').trim() || seedIban || found.ibanNo,
        gorev: wasTaseron ? s.gorev || found.gorev : (found.gorev || '').trim() || s.gorev,
        iseGirisTarihi: found.iseGirisTarihi || s.iseGirisTarihi,
        departman: 'İDARİ',
        personelGrubu: 'IDARI',
        firmaTipi: 'ANA_FIRMA',
        firmaAdi: 'Kibritçi İnşaat',
        ucretTipi: found.ucretTipi || 'Aylık',
        durum: found.durum !== false,
      };
      const idx = next.findIndex((p) => p.id === found.id);
      if (idx >= 0) next[idx] = patched;
      toSave.push(patched);
      if (safeTc) byTc.set(safeTc, patched);
    }
  }

  return { list: next, toSave };
}
