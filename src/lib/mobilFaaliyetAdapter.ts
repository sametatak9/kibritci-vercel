import { MermerciFaaliyet, SahaFaaliyeti, TesisatciFaaliyet } from '../types/erp';

/**
 * Tesisatçı ve Mermerci mobil faaliyet kayıtlarını SahaFaaliyeti şekline çevirir.
 * Böylece "Faaliyeti Olan Personeller", "ZER YAPI Hakediş" gibi saha faaliyeti
 * tüketen ekranlar bu kayıtları da tek listede işleyebilir.
 */
export function tesisatciToSaha(f: TesisatciFaaliyet): SahaFaaliyeti {
  return {
    id: f.id,
    personelId: f.aktifPersonelListesi?.[0] || '',
    tarih: f.tarih,
    isNiteligi: f.isNiteligi || 'Tesisat faaliyeti',
    parsel: f.calismaAlani || '',
    blok: f.yerleskeAdi || '',
    aciklama: f.aciklama || '',
    fotoUrl: f.fotoUrl || undefined,
    fotoUrls: f.fotoUrls,
    aktifPersonelListesi: f.aktifPersonelListesi,
    personelMesaiSaatleri: f.personelMesaiSaatleri,
    faaliyetTipi: f.faaliyetGrubu === 'MESAI' ? 'MESAI_SAHA' : 'NORMAL',
    kaynakEkran: 'TESISATCI_MOBIL',
    kaydeden: f.kaydeden,
  } as SahaFaaliyeti;
}

export function mermerciToSaha(f: MermerciFaaliyet): SahaFaaliyeti {
  return {
    id: f.id,
    personelId: f.aktifPersonelListesi?.[0] || '',
    tarih: f.tarih,
    isNiteligi: f.isNiteligi || 'Mermer faaliyeti',
    parsel: f.parsel || '',
    blok: f.blok || '',
    aciklama: f.aciklama || '',
    fotoUrl: f.fotoUrl || undefined,
    fotoUrls: f.fotoUrls,
    aktifPersonelListesi: f.aktifPersonelListesi,
    personelMesaiSaatleri: f.personelMesaiSaatleri,
    faaliyetTipi: f.faaliyetGrubu === 'MESAI' ? 'MESAI_SAHA' : 'NORMAL',
    kaynakEkran: 'MERMERCI_MOBIL',
    kaydeden: f.kaydeden,
  } as SahaFaaliyeti;
}
