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
  /** SAHA: puantaj/yoklama; IDARI: yoklama alınmaz, izin/tutanak/araç tahsis vb. evraklarda görünür */
  personelGrubu?: 'SAHA' | 'IDARI';
  /** Kampçı gibi mobil kaynaklardan gelen kayıt yönetici onayına düşer */
  onayDurumu?: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDILDI';
  /** Kaydı oluşturan kaynak (ör. KAMPCI) */
  kaynak?: string;
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
  stokKartId?: string;
}

export interface SatinAlmaTalebi {
  id: string;
  saId: string;
  tarih: string;
  talepEden: string;
  cariFirma: string;
  /** Eşleşen cari kart id — Cari/Stok timeline için */
  cariKartId?: string;
  aciklama: string;
  onayDurumu: 'ONAY BEKLİYOR' | '1. ONAY TAMAMLANDI' | '2. ONAY TAMAMLANDI' | 'REDDEDİLDİ' | 'KAPATILDI' | 'ONAYLANDI' | 'BİLİNMİYOR';
  imzaliEvrakUrl?: string;
  imzaliEvrakUyumsuz?: boolean;
  gonderimTarihi?: string;
  kalemler: SatinAlmaItem[];
  eImzalar?: string[];
  arsivde?: boolean;
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
  faturaNo?: string;
  firma: string;
  tarih: string;
  onayDurumu:
    | 'ONAY BEKLİYOR'
    | '1. ONAY TAMAMLANDI'
    | '2. ONAY TAMAMLANDI'
    | 'FARK VAR — YÖNETİCİ BİLDİRİLDİ'
    | 'ONAYLANDI'
    | 'DİJİTAL ONAYLANDI'
    | string;
  imzaliEvrakUrl?: string;
  imzaliEvrakUyumsuz?: boolean;
  fisEvrakUrl?: string;
  karsilastirmaRaporu?: string;
  kalemler: IrsaliyeItem[];
  eImzalar?: string[];
  /** Kampçı vidanjör / kapı mıcır-stabilize fişi irsaliye niteliğinde */
  kaynak?: 'VIDANJOR_FIS' | 'YILDIRIM_TANKER_FIS' | 'MICIR_STABILIZE_FIS' | 'KAPI_EVRAK' | string;
  plaka?: string;
  cekimAdedi?: number;
  fisNo?: string;
  vidanjorFisId?: string;
  yildirimTankerFisId?: string;
  micirFisId?: string;
  tonaj?: number;
  kiloKg?: number;
  malzemeTipi?: 'MICIR' | 'STABILIZE' | string;
  icmeSuyuAdet?: number;
  sanayiSuyuAdet?: number;
  damacaAdet?: number;
  cariKartId?: string;
  guvenlikEvrakId?: string;
  onaylayanYonetici?: string;
  onayTarihi?: string;
}

/** Kampçı — Şeker Vidanjör çekim fişi (yönetici onayından sonra irsaliye + cari) */
export interface VidanjorFis {
  id: string;
  tarih: string;
  fisNo: string;
  plaka: string;
  cekimAdedi: number;
  fisGorselUrl?: string;
  firmaUnvan: string;
  cariKartId?: string;
  /** Eşleşen satın alma — onayda irsaliye.saId */
  saId?: string;
  saKalemId?: string;
  irsaliyeId?: string;
  /** Güvenlik sekmesi o günün gelen evrak listesindeki kayıt id */
  guvenlikEvrakId?: string;
  kapıLogId?: string;
  kaydeden?: string;
  durum?: 'YONETICI_ONAYINDA' | 'ONAYLANDI' | 'REDDEDILDI';
  onaylayanYonetici?: string;
  onayTarihi?: string;
  redNedeni?: string;
  olusturulma: string;
  guncellenme?: string;
}

/** Güvenlik kapı — Mıcır & Stabilize irsaliye teslimi (yönetici onayından sonra irsaliye + cari) */
export interface MicirStabilizeFis {
  id: string;
  tarih: string;
  irsaliyeNo: string;
  plaka: string;
  /** Ton cinsinden miktar (kiloKg / 1000) */
  tonaj: number;
  /** İrsaliyedeki kilo — kapıda tam girilir */
  kiloKg?: number;
  malzemeTipi: 'MICIR' | 'STABILIZE';
  fisGorselUrl?: string;
  firmaUnvan: string;
  cariKartId?: string;
  /** Eşleşen satın alma talebi — yönetici onayında irsaliye.saId */
  saId?: string;
  saKalemId?: string;
  irsaliyeId?: string;
  guvenlikEvrakId?: string;
  kapıLogId?: string;
  kaydeden?: string;
  durum?: 'YONETICI_ONAYINDA' | 'ONAYLANDI' | 'REDDEDILDI';
  onaylayanYonetici?: string;
  onayTarihi?: string;
  redNedeni?: string;
  olusturulma: string;
  guncellenme?: string;
}

/** Tesisatçı — Yıldırım Tanker su irsaliye fişi (yönetici onayından sonra irsaliye + cari) */
export interface YildirimTankerFis {
  id: string;
  tarih: string;
  fisNo: string;
  icmeSuyuAdet: number;
  sanayiSuyuAdet: number;
  /** Damaca su kalemi (adet) */
  damacaAdet?: number;
  fisGorselUrl?: string;
  firmaUnvan: string;
  cariKartId?: string;
  /** Eşleşen satın alma — onayda irsaliye.saId */
  saId?: string;
  saKalemId?: string;
  irsaliyeId?: string;
  guvenlikEvrakId?: string;
  kapıLogId?: string;
  kaydeden?: string;
  durum?: 'YONETICI_ONAYINDA' | 'ONAYLANDI' | 'REDDEDILDI';
  onaylayanYonetici?: string;
  onayTarihi?: string;
  redNedeni?: string;
  olusturulma: string;
  guncellenme?: string;
}

export type TesisatciEnerjiTuru = 'ELEKTRIK' | 'SU' | 'DOGALGAZ';

/** Tesisatçı mobil — taşeron sayaç kesintisi (Elektrik / Su / Doğalgaz) */
export interface TesisatciSayacKesinti {
  id: string;
  tarih: string;
  enerjiTuru: TesisatciEnerjiTuru;
  taseronCariId: string;
  taseronFirmaAdi: string;
  ilkOlcum: number;
  sonOlcum: number;
  fark: number;
  birimFiyat: number;
  tutar: number;
  ilkFotoUrl?: string;
  sonFotoUrl?: string;
  cariIslemId?: string;
  kaydeden?: string;
  olusturulma: string;
  guncellenme?: string;
}

/** Tesisatçı mobil — Kamp/Ofis alanı faaliyetleri */
export interface TesisatciFaaliyet {
  id: string;
  tarih: string;
  faaliyetGrubu: 'NORMAL' | 'MESAI';
  isNiteligi: string;
  /** Parsel/blok değil — kamp-ofis bölgesi */
  calismaAlani: 'KAMP' | 'OFİS';
  yerleskeAdi?: string;
  aciklama: string;
  fotoUrl?: string | null;
  fotoUrls?: string[];
  /** Faaliyete bağlanan personel id'leri (Faaliyeti Olan Personeller) */
  aktifPersonelListesi?: string[];
  personelMesaiSaatleri?: Record<string, number>;
  durum?: string;
  kaydeden?: string;
  kaynakEkran?: 'TESISATCI_MOBIL';
  olusturulma?: string;
  guncellenme?: string;
}

/** Mermerci mobil — saha imalat faaliyeti (parsel / blok) */
export interface MermerciFaaliyet {
  id: string;
  tarih: string;
  faaliyetGrubu: 'NORMAL' | 'MESAI';
  isNiteligi: string;
  parsel: string;
  blok: string;
  aciklama: string;
  fotoUrl?: string | null;
  fotoUrls?: string[];
  aktifPersonelListesi?: string[];
  personelMesaiSaatleri?: Record<string, number>;
  durum?: string;
  kaydeden?: string;
  kaynakEkran?: 'MERMERCI_MOBIL';
  olusturulma?: string;
  guncellenme?: string;
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
  imzaliEvrakUyumsuz?: boolean;
  kalemler: FaturaItem[];
  bagliIrsaliyeler: string[];
  eImzalar?: string[];
}

export type KasaOdemeDurumu = 'BORC' | 'PERSONEL_ODEDI' | 'KASA_ODEDI';

export interface KasaHareketi {
  id: string;
  tarih: string;
  hareketTipi: 'GİRİŞ' | 'ÇIKIŞ';
  tutar: number;
  aciklama: string;
  referansTipi: 'DİĞER' | 'FATURA' | 'İRSALİYE' | 'MAAS' | 'SATIN ALMA';
  referansId?: string;
  fisEvrakUrl?: string;
/**
   * Çıkış ödeme durumu (kasaya yazılır):
   * BORC = kasanın personele/şoföre ödemesi gereken borç (henüz kasa ödemedi)
   * PERSONEL_ODEDI = personel cebinden ödedi
   * KASA_ODEDI = şirket kasasından ödendi
   */
  odemeDurumu?: KasaOdemeDurumu;
  /** @deprecated — odemeDurumu tercih edilir; eski kayıt uyumu */
  harcamaKaynagi?: 'KASA_HARCAMA' | 'PERSONEL_HARCAMA';
  /** Personel / borç sahibi */
  personelId?: string;
  personelAdi?: string;
  /** Şoför kendi cebinden → iade / ödeme (eksi bakiye + şoföre ödenir) */
  soforOdemesi?: boolean;
  /** Şoför üzerinden şirket kasası harcaması (şoföre iade yok) */
  soforKasaHarcamasi?: boolean;
  /** Nihai masraf tipi (KENDI | KASA) */
  masrafTipi?: SoforMasrafTipi;
  surucu?: string;
  fisNo?: string;
}

/** Şoför evrak beyanı / yönetici nihai ayrımı */
export type SoforMasrafTipi = 'KENDI' | 'KASA';

/** Şoför — yol / masraf fişi (onay sonrası Haftalık Kasa) */
export interface YolHarcamasi {
  id: string;
  tarih: string;
  tutar: number;
  aciklama: string;
  fisNo: string;
  faturaFotoUrl?: string;
  durum: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDİLDİ' | string;
  surucu?: string;
  /** Şoförün gönderirken seçtiği: kendi harcaması mı, kasa mı */
  masrafTipi?: SoforMasrafTipi;
  /** Yönetici onayında nihai ayrım (yoksa masrafTipi) */
  nihaiMasrafTipi?: SoforMasrafTipi;
  onaylayanYonetici?: string;
  onayTarihi?: string;
  olusturulma?: string;
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

/** Kampçı mobil — yerleşke tanımı (Idari programdan bağımsız) */
export interface KampYerleske {
  id: string;
  ad: string;
  olusturmaTarihi: string;
  olusturan?: string;
}

/** Kampçı mobil — kat/blok tanımı */
export interface KampKat {
  id: string;
  yerleskeId: string;
  yerleskeAdi: string;
  ad: string;
  sira: number;
  olusturmaTarihi: string;
}

export interface KampOdasi {
  id: string;
  yerleskeAdi: string;
  kogusNo: string;
  odaNo: string;
  kapasite: number;
  firmaTipi: 'ANA_FIRMA' | 'TASERON';
  durum: 'BOŞ' | 'DOLU' | 'KISMEN DOLU';
  yerleskeId?: string;
  katId?: string;
}

export interface KampKaydi {
  id: string;
  personelIsim: string;
  personelId?: string;
  odaId: string;
  roomId?: string;
  yerleskeAdi?: string;
  katAdi?: string;
  odaNo?: string;
  girisTarihi: string;
  cikisTarihi?: string;
  durum: 'AKTIF' | 'PASIF';
  calistigiFirma?: string;
  firmaTipi?: 'ANA_FIRMA' | 'TASERON';
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
  personelId?: string;
  /** NORMAL/MESAI faaliyetine otomatik veya manuel bağlanan personel id'leri */
  aktifPersonelListesi?: string[];
  tarih: string;
  faaliyetTipi: 'TEMİZLİK' | 'YEMEK' | 'GÜVENLİK' | 'BAKIM' | 'DİĞER';
  faaliyetGrubu?: 'NORMAL' | 'MESAI';
  personelMesaiSaatleri?: Record<string, number>;
  aciklama: string;
  yerleskeAdi: string;
  fotoUrl?: string | null;
  kaydedenKampci?: string;
  durum?: string;
}

export type SahaFaaliyetTipi = 'NORMAL' | 'MESAI_SAHA';

export type FaaliyetIlerlemeDurumu = 'BASLAMADI' | 'DEVAM' | 'TAMAMLANDI';

export interface FaaliyetIlerlemeKaydi {
  id: string;
  tarih: string;
  yorum: string;
  fotoUrls?: string[];
  yazar?: string;
  yazarRol?: string;
  /**
   * Opsiyonel aşama — zorunlu değil.
   * Temizlik vb. işlerde başlangıç/devam/bitiş foto ayrımı için.
   */
  asama?: 'BASLANGIC' | 'ILERLEME' | 'BITIS';
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
  /** Formen mobil — kayıt başına en fazla 5 saha fotoğrafı */
  fotoUrls?: string[];
  aktifPersonelListesi?: string[];
  ustaSayisi?: number;
  isciSayisi?: number;
  faaliyetTipi?: SahaFaaliyetTipi;
  personelMesaiSaatleri?: Record<string, number>;
  kaynakEkran?: 'FORMEN_MOBIL' | 'IDARI_SAHA' | string;
  kaydeden?: string;
  kaydedenUid?: string;
  kaydedenFormen?: string;
  programaGonderildi?: boolean;
  programaGonderimTarihi?: string;
  iceriAktarimDurumu?: 'BEKLIYOR' | 'AKTARILDI';
  /** İş grubu etiketi — KIRIM İŞLERİ, DRENAJ İŞLERİ vb. */
  isEtiketi?: string;
  ilerlemeDurumu?: FaaliyetIlerlemeDurumu;
  ilerlemeKayitlari?: FaaliyetIlerlemeKaydi[];
}

export interface SahaGunRaporArsiv {
  id: string;
  tarih: string;
  olusturmaTarihi: string;
  olusturan?: string;
  faaliyetIds: string[];
  faaliyetAdet: number;
  formenFaaliyetAdet: number;
  yoklamaOzet: {
    gelen: number;
    yok: number;
    izinli: number;
    raporlu: number;
  };
  aciklama?: string;
  genelNotlar?: string;
  kaynak?: string;
  htmlOzet?: string;
}

export type ProgramliFaaliyetAsamaAnahtari = 'BASLANGIC' | 'ILERLEME' | 'TAMAMLANMA';

export interface ProgramliFaaliyetAsama {
  adim: ProgramliFaaliyetAsamaAnahtari;
  tamamlandi: boolean;
  tamamlanmaTarihi?: string;
  aciklama?: string;
  fotoUrl?: string;
}

export interface ProgramliFaaliyet {
  id: string;
  tarih: string;
  hedefTanimi: string;
  parsel: string;
  bloklar: string;
  isinAdi: string;
  olusturan?: string;
  olusturanUid?: string;
  durum: 'PLANLANDI' | 'DEVAM_EDIYOR' | 'TAMAMLANDI';
  asamalar: ProgramliFaaliyetAsama[];
}

/** Ay bazlı saha faaliyet foto kolajı / dergi albümü */
export interface SahaKolajFoto {
  id: string;
  albumKey: string;
  yil: number;
  ay: number;
  imageUrl: string;
  baslik?: string;
  aciklama?: string;
  grupAdi?: string;
  sira: number;
  dosyaAdi?: string;
  yuklemeTarihi: string;
  yukleyen?: string;
  parsel?: string;
  blok?: string;
}

/** Malzeme Teslim Tutanağı satırı (stok güncellemez — sadece isim önerisi) */
export interface MalzemeTeslimKalem {
  id: string;
  malzemeAdi: string;
  miktar: number | string;
  cinsi: string;
  aciklama: string;
  stokKartId?: string;
}

export interface HazirTutanak {
  id: string;
  tutanakTipi: 'TAHSİS' | 'TESLİM' | 'SEVK' | 'HASAR' | 'GENEL' | 'CEZA';
  belgeNo: string;
  personelId?: string;
  /** Elle girilen muhatap (personel seçilmezse) */
  muhatapPersonel?: string;
  cariKartId?: string;
  taseronAdi?: string;
  cezaTutari?: number;
  imzaliEvrakUrl?: string;
  konu: string;
  tarih: string;
  icerik: string;
  pdfUrl?: string;
  aciklama: string;
  durum: 'TASLAK' | 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'İPTAL';
  /** TESLİM tipi — excel tarzı malzeme satırları */
  kalemler?: MalzemeTeslimKalem[];
  teslimEden?: string;
  teslimAlan?: string;
}

export interface CariKart {
  id: string;
  kartTipi: 'TEDARIKCI' | 'TASERON' | 'ALICI' | 'SATICI' | 'PERSONEL' | 'ORTAKLAR' | 'CARI';
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
  /** Excel / tedarikçi fiyat listesinden son bilinen birim fiyat */
  sonBirimFiyat?: number;
  sonFiyatTarihi?: string;
  tedarikciCariId?: string;
  tedarikciUnvan?: string;
  /** Tedarikçi Excel arşivi — aktif şantiye stok listesinde gösterilmez */
  arsivde?: boolean;
  stokKaynak?: 'BIRBESAN_EXCEL' | string;
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
  makineKaynak?: 'DEMIRBAS' | 'KIRALIK' | 'MANUEL';
  makineManuelAd?: string;
  onayDurumu: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ';
  kaydedenKullanici?: string;
  kayitTarihi?: string;
}

export type TaseronKesintiTipi = 'IS_MAKINESI' | 'ENERJI' | 'CEZA' | 'YEMEK';

export interface TaseronSayacOlcum {
  ilkOkuma: number;
  sonOkuma: number;
  birimFiyat: number;
}

export interface TaseronEnerjiKaydi {
  id: string;
  taseronCariId: string;
  taseronFirmaAdi: string;
  donemAy: string;
  donemYil: string;
  elektrik: TaseronSayacOlcum;
  su: TaseronSayacOlcum;
  dogalgaz: TaseronSayacOlcum;
  olusturmaTarihi: string;
  olusturanKullanici?: string;
}

export interface TaseronYemekKaydi {
  id: string;
  taseronCariId: string;
  taseronFirmaAdi: string;
  tarih: string;
  sabah: number;
  ogle: number;
  aksam: number;
  notlar?: string;
}

export interface TaseronKesintiRaporu {
  id: string;
  kesintiTipi: TaseronKesintiTipi;
  taseronFirmaAdi: string;
  taseronFirmaId?: string;
  donemAy: string;
  donemYil: string;
  toplamSaat: number;
  kesintiTutari: number;
  saatlikUcret: number;
  /** Yönetici saat ücreti girmeden önce true */
  ucretOnayBekliyor?: boolean;
  faaliyetler: OperatorFaaliyet[];
  enerjiDetay?: TaseronEnerjiKaydi;
  yemekOzet?: { sabah: number; ogle: number; aksam: number; gunSayisi: number };
  onayDurumu: 'TASLAK' | 'ONAYLANDI' | 'GONDERILDI';
  olusturanKullanici: string;
  olusturmaTarihi: string;
  gonderimTarihi?: string;
  epostaGonderildi?: boolean;
  epostaKonusu?: string;
  epostaIcerik?: string;
  eImzalar?: string[];
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
  yatirilanTutar?: number;
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

/** Evrak bağlama — kalem eşleştirmesi */
export interface KalemBaglantisi {
  id: string;
  urunAdi: string;
  saKalemId?: string;
  irsaliyeKalemId?: string;
  irsaliyeId?: string;
  faturaKalemId?: string;
  saMiktar?: number;
  irsaliyeMiktar?: number;
  faturaMiktar?: number;
  birim?: string;
  /** Stok kartından gelen kalıcı birim (evrak bazlı override birimi etkilemez) */
  stokKartBirim?: string;
  /** Elle girilen miktar alanları — bir kez kaydedilir, birim data olarak saklanır */
  manuelSaMiktar?: boolean;
  manuelIrsaliyeMiktar?: boolean;
  manuelFaturaMiktar?: boolean;
  manuelBirim?: boolean;
  onaylandi: boolean;
}

/** 2 aşamalı bağlama sonucu — YZ havuzuna düşer */
export interface EvrakBaglantiGrubu {
  id: string;
  olusturmaTarihi: string;
  saId?: string;
  irsaliyeIds: string[];
  faturaId?: string;
  kalemBaglantilari: KalemBaglantisi[];
  durum: 'TASLAK' | 'ID_BAGLANDI' | 'KALEM_ONAYLANDI' | 'ANALIZ_BEKLIYOR';
  olusturan?: string;
  cariUnvan?: string;
}

/** Onaylanmış yapay zeka analiz raporu */
export interface OnayliAnalizRaporu {
  id: string;
  grupId: string;
  tarih: string;
  analizOdak: string[];
  ozelTalimat?: string;
  raporMetni: string;
  durum: 'TASLAK' | 'ONAYLANDI';
  imzaliEvrakUrl?: string;
  olusturan?: string;
  saId?: string;
  faturaNo?: string;
  irsaliyeNos?: string[];
}
