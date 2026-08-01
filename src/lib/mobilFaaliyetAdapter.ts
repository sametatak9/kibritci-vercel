import {
  MermerciFaaliyet,
  OperatorSahaFaaliyet,
  SahaFaaliyeti,
  SoforSahaFaaliyet,
  TesisatciFaaliyet,
} from '../types/erp';

/**
 * Mobil faaliyet kayıtlarını SahaFaaliyeti şekline çevirir.
 * "Faaliyeti Olan Personeller", "ZER YAPI Hakediş" tek listede işler.
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

export function soforToSaha(f: SoforSahaFaaliyet): SahaFaaliyeti {
  return {
    id: f.id,
    personelId: f.aktifPersonelListesi?.[0] || '',
    tarih: f.tarih,
    isNiteligi: f.isNiteligi || 'Şöför faaliyeti',
    parsel: f.parsel || '',
    blok: f.blok || '',
    aciklama: f.aciklama || '',
    fotoUrl: f.fotoUrl || undefined,
    fotoUrls: f.fotoUrls,
    aktifPersonelListesi: f.aktifPersonelListesi,
    personelMesaiSaatleri: f.personelMesaiSaatleri,
    faaliyetTipi: f.faaliyetGrubu === 'MESAI' ? 'MESAI_SAHA' : 'NORMAL',
    kaynakEkran: 'SOFOR_MOBIL',
    kaydeden: f.kaydeden,
  } as SahaFaaliyeti;
}

export function operatorToSaha(f: OperatorSahaFaaliyet): SahaFaaliyeti {
  return {
    id: f.id,
    personelId: f.aktifPersonelListesi?.[0] || '',
    tarih: f.tarih,
    isNiteligi: f.isNiteligi || 'Operatör / iş makinesi faaliyeti',
    parsel: f.parsel || '',
    blok: f.blok || '',
    aciklama: f.aciklama || '',
    fotoUrl: f.fotoUrl || undefined,
    fotoUrls: f.fotoUrls,
    aktifPersonelListesi: f.aktifPersonelListesi,
    personelMesaiSaatleri: f.personelMesaiSaatleri,
    faaliyetTipi: f.faaliyetGrubu === 'MESAI' ? 'MESAI_SAHA' : 'NORMAL',
    kaynakEkran: 'OPERATOR_MOBIL',
    kaydeden: f.kaydeden,
  } as SahaFaaliyeti;
}
