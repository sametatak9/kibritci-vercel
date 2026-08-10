/**
 * Kamp yerleşim sayım doğrulama — örnek senaryolar.
 * Çalıştır: npx tsx scratch/verify_kamp_yerlesim.ts
 */
import {
  auditKampYerlesimCounts,
  buildKampFirmaOzeti,
  resolveResidentCanonicalKey,
} from '../src/lib/kampFirmaOzet';
import type { KampKaydi, Personel } from '../src/types/erp';

const personeller: Personel[] = [
  {
    id: 'PRS-1',
    ad: 'ALİ',
    soyad: 'VELİ',
    tcNo: '',
    babaAdi: '',
    dogumTarihi: '',
    telefonNo: '',
    eposta: '',
    il: '',
    ilce: '',
    adres: '',
    gorev: 'İŞÇİ',
    maas: 0,
    durum: true,
    firmaTipi: 'ANA_FIRMA',
  } as Personel,
  {
    id: 'PRS-2',
    ad: 'MEHMET',
    soyad: 'YILMAZ',
    tcNo: '',
    babaAdi: '',
    dogumTarihi: '',
    telefonNo: '',
    eposta: '',
    il: '',
    ilce: '',
    adres: '',
    gorev: 'TAŞERON PERSONEL',
    maas: 0,
    durum: true,
    firmaTipi: 'TASERON',
    firmaAdi: 'YURT MEKANİK',
  } as Personel,
];

const kampKayitlari: KampKaydi[] = [
  {
    id: 'k1',
    personelId: 'PRS-1',
    personelIsim: 'ALİ VELİ',
    odaId: 'oda-1',
    durum: 'AKTIF',
    firmaTipi: 'ANA_FIRMA',
    girisTarihi: '2026-01-01',
  },
  // Mükerrer: aynı kişi idsiz ikinci kayıt
  {
    id: 'k2',
    personelIsim: 'ALİ VELİ',
    odaId: 'oda-2',
    durum: 'AKTIF',
    firmaTipi: 'ANA_FIRMA',
    girisTarihi: '2026-01-02',
  },
  {
    id: 'k3',
    personelId: 'PRS-2',
    personelIsim: 'MEHMET YILMAZ',
    odaId: 'oda-3',
    durum: 'AKTIF',
    calistigiFirma: 'YURT MEKANİK',
    firmaTipi: 'TASERON',
    girisTarihi: '2026-01-01',
  },
  {
    id: 'k4',
    personelIsim: 'BİLİNMEYEN KİŞİ',
    odaId: 'oda-4',
    durum: 'AKTIF',
    calistigiFirma: 'DEMİRKAAN',
    firmaTipi: 'TASERON',
    girisTarihi: '2026-01-01',
  },
];

console.log('=== resolveResidentCanonicalKey ===');
for (const k of kampKayitlari) {
  console.log(k.id, '→', resolveResidentCanonicalKey(k, personeller));
}

const audit = auditKampYerlesimCounts(personeller, kampKayitlari);
console.log('\n=== audit ===');
console.log(JSON.stringify(audit, null, 2));

const ozet = buildKampFirmaOzeti(personeller, kampKayitlari);
console.log('\n=== firma ozeti ===');
console.log(ozet);

const ok =
  audit.rawAktifKayit === 4 &&
  audit.uniqueYerlesik === 3 &&
  audit.firmaToplam === 3 &&
  audit.totalsMatch &&
  audit.duplicateSkipped === 1;

console.log(ok ? '\n✓ Tüm senaryolar geçti' : '\n✗ Senaryo hatası');
process.exit(ok ? 0 : 1);
