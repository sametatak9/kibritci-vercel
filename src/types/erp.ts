export interface Personel {
  id: string;
  tcNo: string;
  ad: string;
  soyad: string;
  babaAdi: string;
  dogumTarihi: string;
  telefonNo: string;
  eposta: string;
  adres: string;
  il: string;
  ilce: string;
  departman: string;
  gorev: string;
  iseGirisTarihi: string;
  istenCikisTarihi?: string;
  cinsiyet: string;
  maas: number;
  ucretTipi: 'Aylık' | 'Günlük' | 'Saatlik';
  sgkDurumu: 'SGK\'lı' | 'Sigortasız' | 'Stajyer';
  bankaAdi: string;
  subeAdi: string;
  ibanNo: string;
  durum: boolean;
  fotografUrl?: string;
  sigortaEvrakUrl?: string;
  firmaTipi?: 'ANA_FIRMA' | 'TASERON';
  firmaAdi?: string;
}

export type YoklamaDurum = 'Geldi' | 'Yok' | 'İzinli' | 'Raporlu' | 'Pazar' | 'Tatil' | 'Girilmedi';

export interface GunlukYoklama {
  [gunNo: number]: {
    durum: YoklamaDurum;
    mesaiSaati: number;
  };
}

export interface AylikYoklamaMap {
  [personelId: string]: GunlukYoklama;
}

export interface SatinAlmaItem {
  id: string;
  urunAdi: string;
  miktar: number;
  birim: string;
  marka: string;
  kullanilacakYer: string;
  aciklama: string;
}

export interface SatinAlmaTalebi {
  id: string;
  saId: string;
  tarih: string;
  talepEden: string;
  cariFirma: string;
  aciklama: string;
  onayDurumu: 'ONAY BEKLİYOR' | '1. ONAY TAMAMLANDI' | '2. ONAY TAMAMLANDI' | 'REDDEDİLDİ' | 'KAPATILDI';
  imzaliEvrakUrl?: string;
  gonderimTarihi?: string;
  kalemler: SatinAlmaItem[];
  eImzalar?: string[];
}

export interface IrsaliyeItem {
  id: string;
  saKalemId?: string;
  stokKartId?: string;
  urunAdi: string;
  miktar: number;
  birim: string;
}

export interface Irsaliye {
  id: string;
  irsaliyeId: string;
  irsaliyeNo: string;
  saId?: string;
  firma: string;
  tarih: string;
  onayDurumu: 'ONAY BEKLİYOR' | '1. ONAY TAMAMLANDI' | '2. ONAY TAMAMLANDI' | 'FARK VAR — YÖNETİCİ BİLDİRİLDİ';
  imzaliEvrakUrl?: string;
  fisEvrakUrl?: string;
  karsilastirmaRaporu?: string;
  kalemler: IrsaliyeItem[];
  eImzalar?: string[];
}

export interface FaturaItem {
  id: string;
  urunAdi: string;
  miktar: number;
  birim: string;
  birimFiyat: number;
  kdvOran: number;
  toplam: number;
  stokKartId?: string;
}

export interface Fatura {
  id: string;
  faturaNo: string;
  tarih: string;
  cariKartId: string;
  cariUnvan: string;
  saId?: string;
  toplamTutar: number;
  kdvTutar: number;
  genelToplam: number;
  durum: 'KONTROL BEKLEYOR' | 'UYUMLU' | 'FARK VAR' | 'ONAYLANDI';
  rapor?: string;
  evrakUrl?: string;
  imzaliEvrakUrl?: string;
  kalemler: FaturaItem[];
  bagliIrsaliyeler: string[];
  eImzalar?: string[];
}

export interface KasaHareketi {
  id: string;
  tarih: string;
  hareketTipi: 'GİRİŞ' | 'ÇIKIŞ';
  tutar: number;
  aciklama: string;
  referansTipi: 'DİĞER' | 'FATURA' | 'İRSALİYE' | 'MAAS' | 'SATIN ALMA';
  referansId?: string;
  fisEvrakUrl?: string;
}

export interface AracBakim {
  id: string;
  plaka: string;
  aracTipi: 'ARAC' | 'IS_MAKINESI' | 'DEMIRBAS';
  markaModel: string;
  sorumluPersonelId?: string;
  mevcutKm: number;
  kmBakimAraligi?: number;
  yagBakimKm?: number;
  sonYagBakimKm?: number;
  yagBakimKmAraligi?: number;
  muayeneTarihi: string;
  sigortaTarihi: string;
  durum: 'AKTIF' | 'PASIF' | 'BAKIMDA';
  notlar: string;
}

export interface KmLor {
  id: string;
  aracId: string;
  tarih: string;
  km: number;
  personelId?: string;
  aciklama: string;
}

export interface Demisbas {
  id: string;
  demirbasKodu: string;
  demirbasAdi: string;
  kategori: string;
  seriNo: string;
  durum: 'MUSAIT' | 'TAHSIS EDILDI' | 'BAKIMDA' | 'PASIF';
  notlar: string;
}

export interface Tahsis {
  id: string;
  tahsisTipi: 'ARAC' | 'DEMIRBAS';
  kaynakId: string;
  personelId?: string;
  cariKartId?: string;
  tahsisTarihi: string;
  iadeTarihi?: string;
  durum: 'TAHSIS EDILDI' | 'IADE EDILDI' | 'HASARLI' | 'KAYIP';
  tutanakUrl?: string;
  aciklama: string;
}

export interface KampOdasi {
  id: string;
  yerleskeAdi: string;
  kogusNo: string;
  odaNo: string;
  kapasite: number;
  firmaTipi: 'ANA_FIRMA' | 'TASERON';
  durum: 'BOŞ' | 'DOLU' | 'KISMEN DOLU';
}

export interface KampKaydi {
  id: string;
  personelIsim: string;
  personelId?: string;
  odaId: string;
  girisTarihi: string;
  cikisTarihi?: string;
  durum: 'AKTIF' | 'PASIF';
  calistigiFirma?: string;
}

export interface KampSarf {
  id: string;
  malzemeAdi: string;
  miktar: number;
  birim: string;
  girisTarihi: string;
  yerleskeAdi: string;
  aciklama: string;
}

export interface KampFaaliyet {
  id: string;
  personelId: string;
  tarih: string;
  faaliyetTipi: 'TEMİZLİK' | 'YEMEK' | 'GÜVENLİK' | 'BAKIM' | 'DİĞER';
  aciklama: string;
  yerleskeAdi: string;
}

export interface SahaFaaliyeti {
  id: string;
  personelId: string;
  tarih: string;
  isNiteligi: string;
  parsel: string;
  blok: string;
  aciklama: string;
  fotoUrl?: string;
  aktifPersonelListesi?: string[];
  ustaSayisi?: number;
  isciSayisi?: number;
}

export interface HazirTutanak {
  id: string;
  tutanakTipi: 'TAHSİS' | 'TESLİM' | 'SEVK' | 'HASAR' | 'GENEL' | 'CEZA';
  belgeNo: string;
  personelId?: string;
  cariKartId?: string;
  taseronAdi?: string;
  cezaTutari?: number;
  imzaliEvrakUrl?: string;
  konu: string;
  tarih: string;
  icerik: string;
  pdfUrl?: string;
  aciklama: string;
  durum: 'TASLAK' | 'ONAYLANDI' | 'İPTAL';
}

export interface CariKart {
  id: string;
  kartTipi: 'CARI' | 'TEDARIKCI' | 'TASERON' | 'MUSTERI';
  kod: string;
  unvan: string;
  yetkili: string;
  telefon: string;
  eposta: string;
  vergiNo: string;
  vergiDairesi: string;
  adres: string;
  iban: string;
  durum: 'AKTIF' | 'PASIF';
  notlar: string;
}

export interface StokKart {
  id: string;
  stokKodu: string;
  stokAdi: string;
  kategori: string;
  birim: string;
  kritikSeviye: number;
  durum: 'AKTIF' | 'PASIF' | 'ONAY BEKLİYOR';
  aciklama: string;
  miktar?: number;
  tarih?: string;
}

export interface EpostaGonderim {
  id: string;
  konu: string;
  alicilar: string;
  modul: 'PERSONEL' | 'FINANS' | 'IDARI' | 'RAPOR';
  raporTipi: string;
  dosyaUrl?: string;
  durum: 'HAZIR' | 'GONDERILDI' | 'HATA';
  notlar: string;
  tarih: string;
}

export interface OperatorFaaliyet {
  id: string;
  aracId: string;
  aracPlaka?: string;
  operatorPersonelId?: string;
  operatorIsim: string;
  operatorTipi: 'JCB' | 'KATO' | 'KİRALIK' | 'DİĞER';
  tarih: string;
  baslangicSaat: string;
  bitisSaat: string;
  calismaSuresi: number;
  yapilanIs: string;
  firmaAdi: string;
  firmaId?: string;
  isManualFirma?: boolean;
  fotoUrl?: string;
  temsilciAdSoyad?: string;
  temsilciTc?: string;
  operatorTc?: string;
  kesintiYansitildi?: boolean;
  onayDurumu: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ';
  kaydedenKullanici?: string;
  kayitTarihi?: string;
}

export interface TaseronKesintiRaporu {
  id: string;
  taseronFirmaAdi: string;
  taseronFirmaId?: string;
  donemAy: string;
  donemYil: string;
  toplamSaat: number;
  kesintiTutari: number;
  saatlikUcret: number;
  faaliyetler: OperatorFaaliyet[];
  onayDurumu: 'TASLAK' | 'ONAYLANDI' | 'GONDERILDI';
  olusturanKullanici: string;
  olusturmaTarihi: string;
  gonderimTarihi?: string;
  epostaGonderildi?: boolean;
  epostaKonusu?: string;
  epostaIcerik?: string;
}

export interface MaaşOdeme {
  id: string;
  personelId: string;
  personelAdSoyad: string;
  ay: number;
  yil: number;
  brutMaas: number;
  mesaiUcreti: number;
  toplamHakedis: number;
  kesintiToplami: number;
  netOdeme: number;
  odendi: boolean;
  odemeTarihi?: string;
  odemeYapanKullanici?: string;
  iban: string;
  bankaAdi: string;
  tcNo: string;
  kesintiler: MaasKesinti[];
  notlar?: string;
}

export interface MaasKesinti {
  id: string;
  tur: 'AVANS' | 'CEZA' | 'DAMGA_VERGISI' | 'SGK_PRIMI' | 'GELIR_VERGISI' | 'DIGER';
  aciklama: string;
  tutar: number;
  tarih: string;
}

export interface PersonelIslemGecmisi {
  id: string;
  personelId: string;
  islemTipi: 'IZIN' | 'MAAS_ODEME' | 'ARAC_KM' | 'KAMP_KAYIT' | 'TUTANAK' | 'OPERATOR_FAALIYET' | 'SATIN_ALMA' | 'YOKLAMA' | 'DIGER';
  islemId: string;
  islemBaslik: string;
  islemDetay: string;
  tarih: string;
  ilgiliKisi?: string;
}

export interface CariKartIslem {
  id: string;
  cariKartId: string;
  islemTipi: 'SATIN_ALMA' | 'IRSALIYE' | 'FATURA' | 'KASA_HAREKETI' | 'OPERATOR_KESINTI' | 'DIGER';
  islemId: string;
  islemBaslik: string;
  islemDetay: string;
  tutar?: number;
  tarih: string;
  belgeNo?: string;
}

export interface StokKartIslem {
  id: string;
  stokKartId: string;
  islemTipi: 'GIRIS' | 'CIKIS' | 'SAYIM' | 'DEGISIM' | 'DIGER';
  islemId: string;
  islemBaslik: string;
  islemDetay: string;
  miktarDegisimi: number;
  tarih: string;
  belgeNo?: string;
}

export interface IzinDilekcesi {
  id: string;
  personelId: string;
  personelAdSoyad: string;
  izinTipi: 'YILLIK_IZIN' | 'HASTALIK' | 'DOGUM' | 'OLUM' | 'EVLILIK' | 'DIGER';
  baslangicTarihi: string;
  bitisTarihi: string;
  gunSayisi: number;
  aciklama: string;
  onayDurumu: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDILDI';
  talepTarihi: string;
  onaylayanKullanici?: string;
  onayTarihi?: string;
}

export interface IhbarTutanagi {
  id: string;
  personelId: string;
  personelAdSoyad: string;
  ihbarTipi: 'FIILI_AYRILMA' | 'SOZLESME_FESIH' | 'ISTIFA' | 'DIGER';
  ihbarTarihi: string;
  sonCalismaTarihi: string;
  ihbarSuresiGun: number;
  aciklama: string;
  temlikEdilenMalzemeler?: string;
  imzaliEvrakUrl?: string;
  durum: 'TASLAK' | 'ONAYLANDI' | 'ARŞIV';
  olusturanKullanici: string;
  olusturmaTarihi: string;
}

export interface YapayZekaEslesme {
  id: string;
  tarih: string;
  saId: string;
  irsaliyeNo: string;
  faturaNo?: string;
  cariFirma: string;
  saBirim: string;
  irsaliyeBirim: string;
  faturaBirim?: string;
  eslesmeRaporu: string;
  imzaliEvrakUrl?: string;
  durum: 'ONAYLANDI' | 'FARK VAR' | 'BEKLEMEDE';
}
