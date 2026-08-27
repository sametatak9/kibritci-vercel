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
  /** Meslek niteliği / detay etiket (ör. ALÇI SIVA USTASI) — kadro görevinin yanında raporlarda görünür */
  nitelik?: string;
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
  /** Mesleki Yeterlilik Belgesi (MYK) durumu — taşeron sayım ekranından işaretlenir */
  mykDurumu?: 'VAR' | 'YOK' | 'BILINMIYOR';
  /** Puantaj «Etiket Grupları» — kalıcı kadro etiketi (ör. ZER YAPI). Günlük yoklama iş etiketinden bağımsızdır. */
  takipEtiketleri?: string[];
}

export type YoklamaDurum = 'Geldi' | 'Yok' | 'İzinli' | 'Raporlu' | 'Pazar' | 'Tatil' | 'Girilmedi';

export interface GunlukYoklama {
  [gunNo: number]: {
    durum: YoklamaDurum;
    mesaiSaati: number;
    gonderen?: string;
    isEtiketi?: string;
    aciklama?: string;
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
  /** Saha sipariş formundan onaylanıp içeri alınan talep */
  kaynak?: 'SIPARIS_FORMU' | string;
  siparisId?: string;
}

export type SahaSiparisDurum = 'ONAY_BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI';

export interface SahaSiparisKalem {
  id: string;
  urunAdi: string;
  miktar: number;
  birim: string;
  marka?: string;
  kullanilacakYer?: string;
  aciklama?: string;
  stokKartId?: string;
}

/** Üyeliksiz / ortak sipariş formu — onayda satın alma talebine dönüşür */
export interface SahaSiparis {
  id: string;
  siparisNo: string;
  tarih: string;
  personelAdSoyad: string;
  personelGorev?: string;
  telefon?: string;
  kullanilacakYer: string;
  cariFirma?: string;
  cariKartId?: string;
  aciklama?: string;
  kalemler: SahaSiparisKalem[];
  durum: SahaSiparisDurum;
  kaynak: 'SIPARIS_FORMU';
  satinAlmaTalepId?: string;
  saId?: string;
  olusturanEmail?: string;
  olusturulma: string;
  guncellenme?: string;
  onaylayan?: string;
  onayTarihi?: string;
  redNedeni?: string;
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
  malzemeTipi?: 'MICIR' | 'STABILIZE' | 'TAS_TOZU' | string;
  icmeSuyuAdet?: number;
  sanayiSuyuAdet?: number;
  damacaAdet?: number;
  cariKartId?: string;
  guvenlikEvrakId?: string;
  onaylayanYonetici?: string;
  onayTarihi?: string;
  /**
   * Dönüşüm / eşleşme kaynağı (görsel rozet + mutabakat).
   * SA_DONUSUM | KAPI_SA_ESLESME | KAPI_EVRAK | MANUEL_BAGLAMA
   */
  donusumKaynagi?: string;
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
  malzemeTipi: 'MICIR' | 'STABILIZE' | 'TAS_TOZU';
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

/** Götürü / Seramik mobil — seramik ekibi saha faaliyeti */
export interface SeramikFaaliyet {
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
  kaynakEkran?: 'SERAMIK_MOBIL';
  olusturulma?: string;
  guncellenme?: string;
}

/** Götürü / seramik ekibi günlük yoklaması — ana puantajdan ayrı koleksiyon */
export interface GoturuYoklamaSatir {
  personelId: string;
  ad: string;
  soyad: string;
  gorev?: string;
  durum: YoklamaDurum;
  mesaiSaati: number;
}

export interface GoturuYoklamaGunKaydi {
  id: string;
  tarih: string;
  kaydeden?: string;
  guncellenme?: string;
  satirlar: GoturuYoklamaSatir[];
}

/** Şöför mobil — saha/nakliye faaliyeti (Faaliyeti Olan Personeller besler) */
export interface SoforSahaFaaliyet {
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
  kaynakEkran?: 'SOFOR_MOBIL';
  olusturulma?: string;
  guncellenme?: string;
}

/** Operatör mobil — iş makinesi saha faaliyeti (Faaliyeti Olan Personeller besler) */
export interface OperatorSahaFaaliyet {
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
  kaynakEkran?: 'OPERATOR_MOBIL';
  olusturulma?: string;
  guncellenme?: string;
  /** Mesai taşeron kesintisi */
  taseronKesinti?: boolean;
  taseronFirmaId?: string;
  taseronFirmaAdi?: string;
  bagliOperatorFaaliyetId?: string;
  /** Mesai saatleri yoklamaya kaydedildiğinde true (onayda çift yazmayı önler) */
  mesaiYoklamayaIslendi?: boolean;
  /** İş makinesi */
  aracId?: string;
  aracPlaka?: string;
  makineKaynak?: 'DEMIRBAS' | 'KIRALIK' | 'MANUEL';
  makineManuelAd?: string;
  operatorTipi?: 'JCB' | 'KATO' | 'KİRALIK' | 'DİĞER' | string;
  isKaydiEtiketi?: string;
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
  /** IR_FATURA | SA_DONUSUM | MANUEL_BAGLAMA | ARSIV */
  donusumKaynagi?: string;
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
  /** Geçmiş Excel aktarımı vb. — mevcut kayıtları etkilemez */
  kaynak?: 'LEGACY_XLS' | string;
  /**
   * Yönetici Kasa ekranından düzenledi — onay havuzu / yol senkronu üzerine yazmasın
   */
  kasaManuelKilidi?: boolean;
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
  /** Şoför / portal hesabının eşleştiği personel kartı */
  personelId?: string;
  personelAdi?: string;
  kaydedenEmail?: string;
  durum: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDİLDİ' | string;
  surucu?: string;
  /** Şoförün gönderirken seçtiği: kendi harcaması mı, kasa mı */
  masrafTipi?: SoforMasrafTipi;
  /** Yönetici onayında nihai ayrım (yoksa masrafTipi) */
  nihaiMasrafTipi?: SoforMasrafTipi;
  onaylayanYonetici?: string;
  onayTarihi?: string;
  olusturulma?: string;
  /**
   * true ise onaylı olsa bile kasaHareketleri'ne yeniden yazılmaz
   * (yönetici kasadan sildi)
   */
  kasaDefterHaric?: boolean;
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
  /** Özmal şirket aracı / kiralık (kamyon puantajı) */
  mulkiyet?: 'OZMAL' | 'KIRALIK';
  /** Kiralık kamyon puantaj listesine dahil */
  kiralikKamyon?: boolean;
}

/** Kiralık kamyon günlük puantaj kaydı — araç envanter + şoför (personel) */
export interface KiralikKamyonPuantajKaydi {
  id: string;
  tarih: string;
  aracId: string;
  plaka: string;
  markaModel?: string;
  soforPersonelId?: string;
  soforAdi?: string;
  durum: 'Geldi' | 'Yok' | 'Girilmedi';
  mesaiSaati?: number;
  notlar?: string;
  kaydeden?: string;
  updatedAt?: string;
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

/** Proje kapanış / punch — iş kalemi kovası */
export type ProjeIlerlemeKova =
  | 'EKSIK_IMALAT'
  | 'TADILAT'
  | 'PEYZAJ'
  | 'TESLIM_EVRAK'
  | 'DIGER';

export type ProjeIlerlemeDurum = 'ACIK' | 'DEVAM' | 'BEKLEMEDE' | 'KAPANDI';

/**
 * Kapanış punch / açık iş kalemi — teslim öncesi tespit satırı.
 * Şantiye yüzdesi değil; bitişe kalan işlerin tek doğruluk listesi.
 */
export interface ProjeIlerlemeKalemi {
  id: string;
  parsel: string;
  blok: string;
  baslik: string;
  kova: ProjeIlerlemeKova;
  durum: ProjeIlerlemeDurum;
  /** 1=kolay · 2=normal · 3=kritik / teslimi bloke */
  agirlik: 1 | 2 | 3;
  /** Teslim / iskanı bloke eden madde */
  kirmiziEngel: boolean;
  hedefTarih?: string;
  sorumlu?: string;
  engel?: string;
  not?: string;
  olusturmaTarihi: string;
  guncellemeTarihi?: string;
  olusturan?: string;
}

/**
 * Günlük iş programı satırı — açık iş kaleminin programa alınması.
 * Akış: tespit (punch) → günlük iş programı → imalat gerçekleşmesi.
 */
export type ProjeIsPlanDurum =
  | 'PROGRAMDA'
  | 'IMALATTA'
  | 'TAMAMLANDI'
  | 'ERTELENDI'
  | 'PROGRAMDAN_CIKARILDI';

export interface ProjeIsPlanSatiri {
  id: string;
  /** Program günü YYYY-MM-DD */
  tarih: string;
  kalemId: string;
  parsel: string;
  blok: string;
  baslik: string;
  kova: ProjeIlerlemeKova;
  agirlik: 1 | 2 | 3;
  kirmiziEngel?: boolean;
  durum: ProjeIsPlanDurum;
  /** Saha gerçekleşme notu (engel, ekip, ölçü vb.) */
  gerceklesmeNot?: string;
  /** Eski alan — okuma uyumu */
  ilerlemeNot?: string;
  sira: number;
  olusturmaTarihi: string;
  guncellemeTarihi?: string;
  olusturan?: string;
}

/** İmalat aşaması — blok ilerleme ve kat planı renklendirme */
export type ProjeImalatAsama =
  | 'KABA'
  | 'TESISAT'
  | 'SIVA'
  | 'BOYA'
  | 'SERAMIK'
  | 'TESLIM';

/** Blok master — kat / daire / plan tarihleri (3D harita + bitiş tahmini) */
export interface ProjeBlokProfili {
  id: string;
  parsel: string;
  blok: string;
  katSayisi: number;
  daireSayisi: number;
  baslangicTarihi?: string;
  hedefBitisTarihi?: string;
  not?: string;
  guncellemeTarihi?: string;
}

/** Altyapı / peyzaj disiplin ilerleme satırı (DWG WBS) */
export type ProjeDisiplinGrup = 'ALTYAPI' | 'PEYZAJ' | 'MIMARI';
export type ProjeDisiplinDurum = 'PLANLANDI' | 'IMALATTA' | 'TAMAMLANDI' | 'BEKLEMEDE';

export interface ProjeDisiplinIlerleme {
  id: string;
  parsel: string;
  blok: string;
  grup: ProjeDisiplinGrup;
  kod: string;
  baslik: string;
  durum: ProjeDisiplinDurum;
  yuzde: number;
  gorsel?: string;
  dwgKaynak?: string;
  not?: string;
  guncellemeTarihi?: string;
  olusturan?: string;
}

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
  /** Mobil onay durumu (operatör vb.) */
  durum?: string;
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

/** Düz işçi ekiplerinin günlük plan / gerçekleşme ve kanıt kaydı.
 * Saha faaliyetlerinden bağımsız tutulur; mevcut faaliyet akışını etkilemez. */
export type SahaIsPlanDurum = 'PLANLANDI' | 'BASLADI' | 'KONTROLDE' | 'TAMAMLANDI' | 'EKSIK_KALDI';

export interface SahaIsPlanKaniti {
  url: string;
  tarih: string;
  not?: string;
}

export interface SahaIsPlani {
  id: string;
  tarih: string;
  parsel: string;
  blok: string;
  isTanimi: string;
  birim: string;
  planlananMiktar: number;
  gerceklesenMiktar: number;
  personelIds: string[];
  durum: SahaIsPlanDurum;
  baslangicSaati?: string;
  bitisSaati?: string;
  baslangicKaniti?: SahaIsPlanKaniti;
  bitisKaniti?: SahaIsPlanKaniti;
  gunSonuNotu?: string;
  engelNotu?: string;
  olusturan?: string;
  olusturmaTarihi: string;
  guncellemeTarihi: string;
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
  /** Hasar tutanağı — oluştururken zorunlu değil, sonradan girilebilir */
  birimFiyat?: number | string;
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
  /** Taşeron firma yetkilisi (hasar tutanağı) */
  taseronYetkili?: string;
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
  foto1?: string;
  foto2?: string;
  foto3?: string;
  parsel?: string;
  blok?: string;
  kaynak?: string;
  hazirlayanAd?: string;
  hazirlayanImza?: string;
  taseronImza?: string;
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

export type KampFirmaTalepDurum = 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDILDI';

/** Kampçının yazdığı yeni taşeron unvanı — yönetici onayı olmadan cari açılmaz */
export interface KampFirmaTalep {
  id: string;
  onerilenUnvan: string;
  durum: KampFirmaTalepDurum;
  kaynak: 'KAMPCI';
  gonderenEmail: string;
  olusturmaTarihi: string;
  notlar?: string;
  onaylananUnvan?: string;
  onaylananCariId?: string;
  onaylayanEmail?: string;
  onayTarihi?: string;
  redNedeni?: string;
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
  /** Örn. "Demirbaş JCB makinesi iş kaydı" — arşiv/liste etiketı */
  isKaydiEtiketi?: string;
  onayDurumu: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ';
  /** Onay havuzu ile uyum (isMobilDocPending) */
  durum?: 'ONAY BEKLİYOR' | 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ' | string;
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
  /** Hangi kalemler kesintiye dahil (yoksa fark>0 olanlar) */
  aktifKalemler?: Array<'ELEKTRIK' | 'SU' | 'DOGALGAZ'>;
  /** Neden / açıklama (kime neden kesildi) */
  aciklama?: string;
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
  /** Ana firma (demirbaş) vs kiralık makine kesintisi — karışmasın */
  makineKaynakGrup?: 'ANA_FIRMA' | 'KIRALIK';
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
  /** İş makinesi / sayaç kesinti kanıt fotoğrafı */
  fotoUrl?: string;
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

/** Kampçı taşeron sayım — tekil işlem kaydı */
export type KampTaseronSayimIslemTipi =
  | 'TC_EKLENDI'
  | 'TEL_EKLENDI'
  | 'MYK_ISARETLENDI'
  | 'ISTEN_CIKIS'
  | 'ISE_GIRIS'
  | 'GENEL_GUNCELLEME';

export interface KampTaseronSayimIslem {
  id: string;
  sessionId?: string;
  personelId: string;
  personelIsim: string;
  firmaAdi: string;
  islemTipi: KampTaseronSayimIslemTipi;
  detay: string;
  tarih: string;
  yapan: string;
}

/** Taşeron sayım oturumunda yönetici onayı bekleyen personel güncellemesi */
export interface KampTaseronSayimPersonelGuncelleme {
  personelId: string;
  personelIsim: string;
  tcNo?: string;
  telefonNo?: string;
  mykDurumu?: 'VAR' | 'YOK' | 'BILINMIYOR';
  durum?: boolean;
  istenCikisTarihi?: string | null;
  iseGirisTarihi?: string;
  islemTipi: KampTaseronSayimIslemTipi;
  detay: string;
}

/** Kampçı taşeron sayım oturumu */
export interface KampTaseronSayim {
  id: string;
  firmaAdi: string;
  tarih: string;
  baslangic: string;
  bitis?: string;
  yapan: string;
  islemSayisi: number;
  ozet: {
    toplamPersonel: number;
    tcTamamlanan: number;
    telTamamlanan: number;
    mykIsaretlenen: number;
    istenCikis: number;
    iseGiris: number;
  };
  islemIds: string[];
  /** Yönetici onay durumu — eski kayıtlarda yoksa ONAYLANDI kabul edilir */
  durum?: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ';
  personelGuncellemeleri?: KampTaseronSayimPersonelGuncelleme[];
  onaylayan?: string;
  onaylayanYetki?: string;
  onayTarihi?: string;
}

/** Temizlik / kırım — daire ve baca kart özet durumu */
export type TemizlikKartDurum = 'TESPIT_BEKLIYOR' | 'PLANLANDI' | 'UYGULAMA_DEVAM' | 'TAMAMLANDI';
export type TemizlikIsTipi = 'TEMIZLIK' | 'KIRIM' | 'TEMIZLIK_VE_KIRIM';
export type TemizlikOdaDurum = 'KIRLI' | 'ORTA' | 'TEMIZ' | 'KIRIM_GEREKIYOR';
export type TemizlikBacaKirlilik = 'KIRLI' | 'ORTA' | 'TEMIZ' | 'AGIR_CAMUR';
export type TemizlikUygulamaDurum = 'DEVAM' | 'EKSIK' | 'TAMAMLANDI';
export type TemizlikBacaKoridor = string;
export type TemizlikBacaKonumTipi =
  | 'BLOK_ONU'
  | 'BLOK_ARKASI'
  | 'BLOK_ARASI'
  | 'AVLU'
  | 'MERDIVEN';

/** Parsel koridor kartı — K1/K2/K3 seed; elle eklenir / düzenlenir */
export interface TemizlikKoridorKart {
  id: string;
  parsel: string;
  kod: string;
  baslik: string;
  aciklama?: string;
  bloklar: string[];
  sira: number;
  kayitTarihi: string;
}

/** Parsel blok kartı — A1–I seed; elle yeni blok açılır, mükerrer yazılmaz */
export interface TemizlikBlokKart {
  id: string;
  parsel: string;
  blok: string;
  kayitTarihi: string;
}

export interface TemizlikOdaTespit {
  id: string;
  ad: string;
  durum: TemizlikOdaDurum;
  yorum?: string;
  fotoUrls: string[];
}

export interface TemizlikDaire {
  id: string;
  parsel: string;
  blok: string;
  daireNo: string;
  kat?: string;
  ozetDurum: TemizlikKartDurum;
  kayitTarihi: string;
  kaydeden?: string;
  guncellemeTarihi?: string;
}

export interface TemizlikTespit {
  id: string;
  daireId: string;
  parsel: string;
  blok: string;
  daireNo: string;
  isTipi: TemizlikIsTipi;
  odalar: TemizlikOdaTespit[];
  /** Daire geneli foto (oda kartından bağımsız) */
  fotoUrls?: string[];
  genelYorum?: string;
  planlananYevmiye: number;
  planNotu?: string;
  tarih: string;
  kaydeden?: string;
}

export interface TemizlikUygulama {
  id: string;
  daireId: string;
  tespitId?: string;
  parsel: string;
  blok: string;
  daireNo: string;
  tarih: string;
  harcananYevmiye: number;
  durum: TemizlikUygulamaDurum;
  aciklama?: string;
  fotoUrls: string[];
  kaydeden?: string;
}

export interface TemizlikBaca {
  id: string;
  parsel: string;
  blok?: string;
  blok2?: string;
  koridor?: TemizlikBacaKoridor;
  konumTipi?: TemizlikBacaKonumTipi;
  siraNo?: number;
  etiket: string;
  yerTarifi: string;
  ozetDurum: TemizlikKartDurum;
  kayitTarihi: string;
  kaydeden?: string;
  guncellemeTarihi?: string;
}

export interface TemizlikBacaTespit {
  id: string;
  bacaId: string;
  parsel: string;
  blok?: string;
  etiket: string;
  fotoUrls: string[];
  kirlilikDurumu: TemizlikBacaKirlilik;
  iscilikYorumu?: string;
  planlananYevmiye: number;
  planNotu?: string;
  tarih: string;
  kaydeden?: string;
}

export interface TemizlikBacaUygulama {
  id: string;
  bacaId: string;
  tespitId?: string;
  parsel: string;
  etiket: string;
  tarih: string;
  harcananYevmiye: number;
  durum: TemizlikUygulamaDurum;
  aciklama?: string;
  fotoUrls: string[];
  kaydeden?: string;
}

/** Parsel temizlik tutanağı — hakediş gibi antetli / imzalı resmi belge */
export type TemizlikTutanakTipi = 'DAIRE_BLOK' | 'BACA_ALTYAPI' | 'PARSEL_BACA_TOPLU' | 'PARSEL_DAIRE_TOPLU';
export type TemizlikTutanakDurum = 'TASLAK' | 'IMZA_BEKLIYOR' | 'DUZENLENDI';

export interface TemizlikTutanakImza {
  hazirlayan: string;
  parselSefi: string;
  projeMuduru: string;
  kontrolBina?: string;
  kontrolAltyapi?: string;
  kontrolCevre?: string;
  kontrolAsansor?: string;
}

export interface TemizlikTutanak {
  id: string;
  tip: TemizlikTutanakTipi;
  parsel: string;
  /** Daire: blok adları; Baca: baca id listesi (boş = parseldeki tespitli tümü) */
  kapsam: string[];
  tarih: string;
  durum: TemizlikTutanakDurum;
  imzalar: TemizlikTutanakImza;
  not?: string;
  ozetSatir: string;
  kaydeden?: string;
  kayitTarihi: string;
  fotoUrls?: string[];
}
