import { Personel } from '../types/erp';
import { isPersonelTcSuppressed, loadSuppressedPersonelTcs, REMOVED_IDARI_PLACEHOLDER_TCS } from '../lib/personelSeedSuppress';

/** İdari kadro — yoklamaya girmez; izin / tutanak / araç tahsis vb. evraklarda seçilebilir */
type IdariRow = {
  ad: string;
  soyad: string;
  tcNo: string;
  iseGirisTarihi: string; // YYYY-MM-DD
  gorev: string;
  cinsiyet?: 'Erkek' | 'Kadın';
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
];

function toPersonel(row: IdariRow, index: number): Personel {
  const tc = String(row.tcNo || '').trim();
  return {
    id: `PRS-IDARI-${tc || index}`,
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
    sgkDurumu: "SGK'lı",
    bankaAdi: '',
    subeAdi: '',
    ibanNo: '',
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
 * Mevcut listeye idari kadroyu TC ile birleştirir.
 * - TC yoksa ekler
 * - TC varsa idari alanları (grup/departman/görev/firma) günceller, diğer alanları korur
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
    if (!tc) continue;
    if (suppressed.has(tc) || isPersonelTcSuppressed(tc)) continue;
    if (REMOVED_IDARI_PLACEHOLDER_TCS.has(tc)) continue;
    const found = byTc.get(tc);
    if (!found) {
      next.push(s);
      byTc.set(tc, s);
      toSave.push(s);
      continue;
    }
    const wasTaseron =
      found.firmaTipi === 'TASERON' ||
      (found.personelGrubu !== 'IDARI' && found.departman !== 'İDARİ');
    const needsPatch =
      found.personelGrubu !== 'IDARI' ||
      found.departman !== 'İDARİ' ||
      found.firmaTipi !== 'ANA_FIRMA' ||
      (found.ad || '') !== s.ad ||
      (found.soyad || '') !== s.soyad ||
      // Taşeron→idari geçişte görev seed’den alınır; aksi halde yalnızca boşsa doldur
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
      byTc.set(tc, patched);
    }
  }

  return { list: next, toSave };
}
