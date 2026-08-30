import {
  Personel,
  SatinAlmaTalebi,
  Irsaliye,
  Fatura,
  KasaHareketi,
  AracBakim,
  Demisbas,
  Tahsis,
  KampOdasi,
  KampKaydi,
  KampSarf,
  KampFaaliyet,
  SahaFaaliyeti,
  HazirTutanak,
  CariKart,
  StokKart,
  EpostaGonderim,
  AylikYoklamaMap
} from '../types/erp';
import { getImportedPersonnel } from './importedPersonnelTsv';

export const INITIAL_PERSONEL: Personel[] = getImportedPersonnel();


export const INITIAL_YOKLAMA: AylikYoklamaMap = {
  p1: {
    1: { durum: "Geldi", mesaiSaati: 2 },
    2: { durum: "Geldi", mesaiSaati: 0 },
    3: { durum: "Geldi", mesaiSaati: 4 },
    4: { durum: "Geldi", mesaiSaati: 0 },
    5: { durum: "Geldi", mesaiSaati: 0 },
    6: { durum: "Yok", mesaiSaati: 0 },
    7: { durum: "Pazar", mesaiSaati: 0 },
    8: { durum: "Geldi", mesaiSaati: 3 },
    9: { durum: "İzinli", mesaiSaati: 0 },
    10: { durum: "Geldi", mesaiSaati: 0 },
    11: { durum: "Geldi", mesaiSaati: 0 },
    12: { durum: "Geldi", mesaiSaati: 2 },
    13: { durum: "Yok", mesaiSaati: 0 },
    14: { durum: "Pazar", mesaiSaati: 0 },
    15: { durum: "Geldi", mesaiSaati: 0 },
    16: { durum: "Geldi", mesaiSaati: 4 },
    17: { durum: "Yıl", mesaiSaati: 0 } as any, // fallback tatil
  },
  p2: {
    1: { durum: "Geldi", mesaiSaati: 4 },
    2: { durum: "Geldi", mesaiSaati: 2 },
    3: { durum: "Geldi", mesaiSaati: 0 },
    4: { durum: "Geldi", mesaiSaati: 0 },
    5: { durum: "Geldi", mesaiSaati: 3 },
    6: { durum: "İzinli", mesaiSaati: 0 },
    7: { durum: "Pazar", mesaiSaati: 0 },
    8: { durum: "Geldi", mesaiSaati: 2 },
    12: { durum: "Raporlu", mesaiSaati: 0 },
  }
};

export const INITIAL_CARI: CariKart[] = [
  {
    id: "c1",
    kartTipi: "TEDARIKCI",
    kod: "CAR-001",
    unvan: "Demir A.Ş.",
    yetkili: "Süleyman Demir",
    telefon: "+90 216 444 5566",
    eposta: "satis@demiras.com",
    vergiNo: "1234567890",
    vergiDairesi: "Kazan",
    adres: "Demirciler Sanayi Bölgesi No: 4",
    iban: "TR990001500123456789012345",
    durum: "AKTIF",
    notlar: "Önemli demir tedarikçimiz."
  },
  {
    id: "c2",
    kartTipi: "TASERON",
    kod: "CAR-002",
    unvan: "Yıldız Elektrik Tesisat",
    yetkili: "Ali Yıldız",
    telefon: "+90 533 123 4567",
    eposta: "yildiz@elektrik.com",
    vergiNo: "9876543210",
    vergiDairesi: "Kartal",
    adres: "Maltepe İş Merkezi No: 88",
    iban: "TR880006200123456789012345",
    durum: "AKTIF",
    notlar: "Elektrik işleri alt yüklenicisi"
  }
];

export const INITIAL_STOK: StokKart[] = [
  {
    id: "s1",
    stokKodu: "STK-A43D",
    stokAdi: "Nervürlü Demir Q12",
    kategori: "Kaba İnşaat",
    birim: "TON",
    kritikSeviye: 5,
    durum: "AKTIF",
    aciklama: "Yapı güçlendirme demiri"
  },
  {
    id: "s2",
    stokKodu: "STK-E923",
    stokAdi: "Hazır Beton C30",
    kategori: "Kaba İnşaat",
    birim: "M3",
    kritikSeviye: 50,
    durum: "AKTIF",
    aciklama: "Blok temelleri beton döküm"
  },
  {
    id: "s3",
    stokKodu: "STK-P102",
    stokAdi: "Portland Çimento (Torba)",
    kategori: "Hafif İnşaat",
    birim: "TORBA",
    kritikSeviye: 100,
    durum: "AKTIF",
    aciklama: "Sıva ve harç malzemesi"
  }
];

export const INITIAL_SATIN_ALMA: SatinAlmaTalebi[] = [];

export const INITIAL_IRSALIYE: Irsaliye[] = [];

export const INITIAL_FATURA: Fatura[] = [];


export const INITIAL_KASA: KasaHareketi[] = [
  {
    id: "k1",
    tarih: "2026-06-17",
    hareketTipi: "GİRİŞ",
    tutar: 45000,
    aciklama: "Parsel B Hakediş Girişi",
    referansTipi: "DİĞER"
  },
  {
    id: "k2",
    tarih: "2026-06-16",
    hareketTipi: "ÇIKIŞ",
    tutar: 12400,
    aciklama: "İşçi Yemek Hizmet Bedeli",
    referansTipi: "FATURA",
    referansId: "FT-2026-00012"
  }
];

export const INITIAL_ARAC: AracBakim[] = [
  {
    id: "a1",
    plaka: "34 KBR 888",
    aracTipi: "ARAC",
    markaModel: "Ford Transit 2.0 EcoBlue",
    sorumluPersonelId: "p2",
    mevcutKm: 42000,
    kmBakimAraligi: 10000,
    yagBakimKm: 45000,
    muayeneTarihi: "2026-09-01",
    sigortaTarihi: "2026-11-20",
    durum: "AKTIF",
    notlar: "Personel ve malzeme nakliyesi aracı"
  },
  {
    id: "a2",
    plaka: "EXC-CAT-320",
    aracTipi: "IS_MAKINESI",
    markaModel: "Caterpillar 320 Paletli Ekskavatör",
    sorumluPersonelId: "p1",
    mevcutKm: 3400, // hours
    kmBakimAraligi: 500,
    yagBakimKm: 3500,
    muayeneTarihi: "2026-12-15",
    sigortaTarihi: "2026-12-10",
    durum: "AKTIF",
    notlar: "Zemin kazma ve harfiyat çalışmaları ekskavatörü"
  }
];

const generateKampRooms = (): KampOdasi[] => {
  const rooms: KampOdasi[] = [];
  const blocks = ["A Yerleşkesi", "B Yerleşkesi", "C Yerleşkesi", "D Yerleşkesi"];
  const floors = ["1. Kat", "2. Kat", "3. Kat"];
  
  let idCounter = 1;
  blocks.forEach(block => {
    floors.forEach((floor, fIdx) => {
      const floorNum = fIdx + 1; // 1, 2, 3
      for (let roomNum = 1; roomNum <= 15; roomNum++) {
        const roomStr = `${block[0]}-${floorNum}${roomNum < 10 ? '0' : ''}${roomNum}`; // A-101, B-204 etc.
        rooms.push({
          id: `ko_room_${idCounter++}`,
          yerleskeAdi: block,
          kogusNo: floor,
          odaNo: roomStr,
          kapasite: 6, // 6 beds standard capacity
          firmaTipi: "ANA_FIRMA",
          durum: "BOŞ"
        });
      }
    });
  });
  return rooms;
};

export const INITIAL_KAMP: KampOdasi[] = generateKampRooms();

export const INITIAL_KAMP_KAYDI: KampKaydi[] = [
  {
    id: "kk1",
    personelIsim: "Görkem Çiftçi",
    personelId: "p1",
    odaId: "ko_room_1",
    girisTarihi: "2026-05-10",
    durum: "AKTIF"
  }
];

export const INITIAL_KAMP_SARF: KampSarf[] = [
  {
    id: "ks1",
    malzemeAdi: "Sıvı Sabun 20L",
    miktar: 4,
    birim: "PAKET",
    girisTarihi: "2026-06-01",
    yerleskeAdi: "A BLOK",
    aciklama: "Koguş banyo sarfları"
  }
];

export const INITIAL_SAHA: SahaFaaliyeti[] = [
  {
    id: "sf1",
    personelId: "p1",
    tarih: "2026-06-18",
    isNiteligi: "C30 Beton Döküm",
    parsel: "Parsel Bölge 157/46",
    blok: "A1",
    aciklama: "İkinci kat tabliye dökümü başarıyla tamamlandı."
  }
];

export const INITIAL_TUTANAK: HazirTutanak[] = [
  {
    id: "t1",
    tutanakTipi: "TAHSİS",
    belgeNo: "TUT-2026-0043",
    personelId: "p2",
    konu: "Araç Zimmet ve Tahsisi",
    tarih: "2026-06-05",
    icerik: "Aşağıdaki teknik detayları verilen 34 KBR 888 plakalı Ford Transit araç, şantiye personeli Mehmet Yılmaz sorumluğuna hasarsız verilmiştir.",
    durum: "ONAYLANDI",
    aciklama: "Zimmet tutanağı imzalatıldı."
  }
];

export const INITIAL_EPOSTA: EpostaGonderim[] = [
  {
    id: "ep1",
    konu: "Haziran 2026 Dönem Maaş Bordro Dağıtımı",
    alicilar: "yonetim@kibritci.comb.tr, muhasebe@kibritci.com.tr",
    modul: "RAPOR",
    raporTipi: "Bordro",
    durum: "GONDERILDI",
    notlar: "Maaş hakedişleri listesi eklenip başarıyla ulaştırıldı.",
    tarih: "2026-06-18"
  }
];

import { OperatorFaaliyet, TaseronKesintiRaporu, MaaşOdeme, PersonelIslemGecmisi, CariKartIslem, StokKartIslem, IzinDilekcesi, IhbarTutanagi } from '../types/erp';

export const INITIAL_OPERATOR_FAALIYET: OperatorFaaliyet[] = [
  {
    id: "of_1",
    aracId: "a2",
    aracPlaka: "EXC-CAT-320",
    operatorPersonelId: "p1",
    operatorIsim: "Ahmet Yılmaz",
    operatorTipi: "JCB",
    tarih: "2026-06-20",
    baslangicSaat: "08:00",
    bitisSaat: "17:00",
    calismaSuresi: 9,
    yapilanIs: "Parsel B zemin kazma ve hafriyat",
    firmaAdi: "Yıldız Elektrik Tesisat",
    firmaId: "c2",
    onayDurumu: "ONAYLANDI",
    kaydedenKullanici: "santiye@kibritci.com",
    kayitTarihi: "2026-06-20T17:30:00"
  },
  {
    id: "of_2",
    aracId: "a2",
    aracPlaka: "EXC-CAT-320",
    operatorPersonelId: "p1",
    operatorIsim: "Ahmet Yılmaz",
    operatorTipi: "JCB",
    tarih: "2026-06-21",
    baslangicSaat: "08:00",
    bitisSaat: "16:00",
    calismaSuresi: 8,
    yapilanIs: "Parsel B temel kazısı",
    firmaAdi: "Demir A.Ş.",
    firmaId: "c1",
    onayDurumu: "ONAYLANDI",
    kaydedenKullanici: "santiye@kibritci.com",
    kayitTarihi: "2026-06-21T16:30:00"
  }
];

export const INITIAL_TASERON_KESINTI: TaseronKesintiRaporu[] = [];

export const INITIAL_MAAS_ODEME: MaaşOdeme[] = [];

export const INITIAL_PERSONEL_ISLEM: PersonelIslemGecmisi[] = [];

export const INITIAL_CARI_ISLEM: CariKartIslem[] = [];

export const INITIAL_STOK_ISLEM: StokKartIslem[] = [];

export const INITIAL_IZIN_DILEKCE: IzinDilekcesi[] = [];

export const INITIAL_IHBAR_TUTANAK: IhbarTutanagi[] = [];
