import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, HardHat, Zap, UtensilsCrossed, Archive, Mail, Printer,
  Download, CheckCircle2, Plus, Users, LogIn, MessageCircle, Trash2, Table2,
} from 'lucide-react';
import {
  CariKart,
  CariKartIslem,
  KampKaydi,
  KampOdasi,
  OperatorFaaliyet,
  HazirTutanak,
  Personel,
  TaseronKesintiRaporu,
  TaseronEnerjiKaydi,
  TaseronYemekKaydi,
} from '../types/erp';
import {
  getTaseronCariKartlar,
  faaliyetlerForTaseron,
  ilkOkumaFromOncekiAy,
  enerjiToplamTutar,
  enerjiKalemOzet,
  sayacFarki,
  sayacTutari,
  yemekAylikOzet,
  hesaplaKesintiTutari,
  ayAdi,
  personelForTaseron,
  formatPersonelKampYerlesim,
  firmaEslesir,
  buildTaseronFirmaEnvanteri,
  taseronEnvanterOzet,
  buildCariIslemFromMakineKesintiRaporu,
  makineEtiketi,
  type EnerjiKalem,
} from '../lib/taseronUtils';
import {
  buildEnerjiKesintiReportHtml,
  buildYemekRaporHtml,
  indirIsMakinesiRaporu,
  mailtoForRapor,
  yazdirIsMakinesiRaporu,
} from '../lib/taseronReportUtils';
import { downloadKibritciReportHtml } from '../lib/kibritciReportTemplate';
import { appendCariIslemOnce } from '../lib/evrakCariStokSync';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  buildPersonelLoglariWhatsAppText,
  displayPersonelGorev,
  formatZamanTr,
  isPersonelActiveOnDate,
  openWhatsAppText,
} from '../lib/guvenlikHelpers';
import {
  exportTaseronPersonelExcel,
  exportTumFirmalarPersonelExcel,
} from '../lib/taseronPersonelExcelExport';
import {
  buildIsMakinesiIcmal,
  indirIsMakinesiIcmal,
  yazdirIsMakinesiIcmal,
  IS_MAKINESI_ICMAL_TIPLER,
} from '../lib/isMakinesiIcmalUtils';

type SubPage =
  | 'envanter'
  | 'makine'
  | 'makine_icmal'
  | 'enerji'
  | 'yemek'
  | 'personel'
  | 'personel_loglari'
  | 'arsiv';

interface TaseronKesintiScreenProps {
  cariKartlar: CariKart[];
  personeller?: Personel[];
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  operatorFaaliyetleri: OperatorFaaliyet[];
  setOperatorFaaliyetleri?: React.Dispatch<React.SetStateAction<OperatorFaaliyet[]>>;
  hazirTutanaklar: HazirTutanak[];
  taseronKesintiRaporlari: TaseronKesintiRaporu[];
  setTaseronKesintiRaporlari: React.Dispatch<React.SetStateAction<TaseronKesintiRaporu[]>>;
  taseronEnerjiKayitlari: TaseronEnerjiKaydi[];
  setTaseronEnerjiKayitlari: React.Dispatch<React.SetStateAction<TaseronEnerjiKaydi[]>>;
  taseronYemekKayitlari: TaseronYemekKaydi[];
  setTaseronYemekKayitlari: React.Dispatch<React.SetStateAction<TaseronYemekKaydi[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  addNotification?: (mesaj: string) => void;
  currentUser?: { email?: string };
}

export const TaseronKesintiScreen: React.FC<TaseronKesintiScreenProps> = ({
  cariKartlar,
  personeller = [],
  kampKayitlari = [],
  kampOdalari = [],
  operatorFaaliyetleri,
  setOperatorFaaliyetleri,
  hazirTutanaklar,
  taseronKesintiRaporlari,
  setTaseronKesintiRaporlari,
  taseronEnerjiKayitlari,
  setTaseronEnerjiKayitlari,
  taseronYemekKayitlari,
  setTaseronYemekKayitlari,
  setCariIslemGecmisi,
  addNotification,
  currentUser,
}) => {
  /** Tip TASERON + malzeme teslim/ceza tutanağı bağlı cariler (Demirkaan vb.) */
  const taseronlar = useMemo(() => {
    const byId = new Map(
      getTaseronCariKartlar(cariKartlar).map((c) => [c.id, c] as const)
    );
    for (const t of hazirTutanaklar || []) {
      if (t.tutanakTipi !== 'TESLİM' && t.tutanakTipi !== 'CEZA') continue;
      if (t.cariKartId && !byId.has(t.cariKartId)) {
        const c = cariKartlar.find((x) => x.id === t.cariKartId && x.durum !== 'PASIF');
        if (c) byId.set(c.id, c);
      }
      if (t.taseronAdi) {
        const c = cariKartlar.find(
          (x) => x.durum !== 'PASIF' && firmaEslesir(x.unvan, t.taseronAdi || '')
        );
        if (c && !byId.has(c.id)) byId.set(c.id, c);
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      (a.unvan || '').localeCompare(b.unvan || '', 'tr')
    );
  }, [cariKartlar, hazirTutanaklar]);
  const [selectedTaseronId, setSelectedTaseronId] = useState('');
  const [subPage, setSubPage] = useState<SubPage>('envanter');
  const [selectedAy, setSelectedAy] = useState(new Date().getMonth() + 1);
  const [selectedYil, setSelectedYil] = useState(new Date().getFullYear());
  const [saatlikUcret, setSaatlikUcret] = useState(1500);
  const [kapiLoglari, setKapiLoglari] = useState<any[]>([]);
  const [girisTalepleri, setGirisTalepleri] = useState<any[]>([]);
  const [cikisTalepleri, setCikisTalepleri] = useState<any[]>([]);
  const [logFiltreBaslangic, setLogFiltreBaslangic] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [logFiltreBitis, setLogFiltreBitis] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  /** İcmal: varsayılan yalnızca onaylı faaliyetler */
  const [icmalOnlyOnayli, setIcmalOnlyOnayli] = useState(false);

  useEffect(() => {
    const unsubKapi = onSnapshot(collection(db, 'guvenlikGirisCikisLoglari'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.zaman || 0).getTime() - new Date(a.zaman || 0).getTime());
      setKapiLoglari(list);
    });
    const unsubGiris = onSnapshot(collection(db, 'personelGirisTalepleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data(), _kaynak: 'ISCI_GIRIS' }));
      setGirisTalepleri(list);
    });
    const unsubCikis = onSnapshot(collection(db, 'personelCikisTalepleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data(), _kaynak: 'ISCI_CIKIS' }));
      setCikisTalepleri(list);
    });
    return () => {
      unsubKapi();
      unsubGiris();
      unsubCikis();
    };
  }, []);

  const selectedTaseron = taseronlar.find((t) => t.id === selectedTaseronId);

  useEffect(() => {
    if (!selectedTaseronId && taseronlar.length > 0) {
      setSelectedTaseronId(taseronlar[0].id);
    }
  }, [taseronlar, selectedTaseronId]);

  const donemAyStr = String(selectedAy).padStart(2, '0');
  const donemYilStr = String(selectedYil);

  const bekleyenMakineRaporlari = useMemo(
    () =>
      taseronKesintiRaporlari.filter(
        (r) =>
          (r.kesintiTipi === 'IS_MAKINESI' || !r.kesintiTipi) &&
          r.ucretOnayBekliyor &&
          (!selectedTaseron || r.taseronFirmaId === selectedTaseron.id || r.taseronFirmaAdi === selectedTaseron?.unvan)
      ),
    [taseronKesintiRaporlari, selectedTaseron]
  );

  const aylikFaaliyetler = useMemo(() => {
    if (!selectedTaseron) return [];
    return faaliyetlerForTaseron(operatorFaaliyetleri, selectedTaseron, selectedAy, selectedYil);
  }, [operatorFaaliyetleri, selectedTaseron, selectedAy, selectedYil]);

  const makineDonemRaporlari = useMemo(() => {
    if (!selectedTaseron) return [];
    return taseronKesintiRaporlari.filter(
      (r) =>
        (r.kesintiTipi === 'IS_MAKINESI' || !r.kesintiTipi) &&
        (r.taseronFirmaId === selectedTaseron.id ||
          firmaEslesir(r.taseronFirmaAdi, selectedTaseron.unvan)) &&
        r.donemAy === donemAyStr &&
        r.donemYil === donemYilStr
    );
  }, [taseronKesintiRaporlari, selectedTaseron, donemAyStr, donemYilStr]);

  const makineIcmal = useMemo(
    () =>
      buildIsMakinesiIcmal({
        faaliyetler: operatorFaaliyetleri,
        cariKartlar,
        ay: selectedAy,
        yil: selectedYil,
        onlyOnayli: icmalOnlyOnayli,
        kesintiRaporlari: taseronKesintiRaporlari,
      }),
    [
      operatorFaaliyetleri,
      cariKartlar,
      selectedAy,
      selectedYil,
      icmalOnlyOnayli,
      taseronKesintiRaporlari,
    ]
  );

  const mevcutEnerji = useMemo(
    () =>
      taseronEnerjiKayitlari.find(
        (k) =>
          k.taseronCariId === selectedTaseronId &&
          k.donemAy === donemAyStr &&
          k.donemYil === donemYilStr
      ),
    [taseronEnerjiKayitlari, selectedTaseronId, donemAyStr, donemYilStr]
  );

  const [elek, setElek] = useState({ ilk: 0, son: 0, birim: 3.5 });
  const [su, setSu] = useState({ ilk: 0, son: 0, birim: 12 });
  const [gaz, setGaz] = useState({ ilk: 0, son: 0, birim: 8.5 });
  const [aktifEnerji, setAktifEnerji] = useState<Record<EnerjiKalem, boolean>>({
    ELEKTRIK: true,
    SU: false,
    DOGALGAZ: false,
  });
  const [enerjiAciklama, setEnerjiAciklama] = useState('');

  useEffect(() => {
    if (!selectedTaseronId) return;
    if (mevcutEnerji) {
      setElek({
        ilk: mevcutEnerji.elektrik.ilkOkuma,
        son: mevcutEnerji.elektrik.sonOkuma,
        birim: mevcutEnerji.elektrik.birimFiyat,
      });
      setSu({
        ilk: mevcutEnerji.su.ilkOkuma,
        son: mevcutEnerji.su.sonOkuma,
        birim: mevcutEnerji.su.birimFiyat,
      });
      setGaz({
        ilk: mevcutEnerji.dogalgaz.ilkOkuma,
        son: mevcutEnerji.dogalgaz.sonOkuma,
        birim: mevcutEnerji.dogalgaz.birimFiyat,
      });
      const aktif = mevcutEnerji.aktifKalemler;
      if (aktif && aktif.length > 0) {
        setAktifEnerji({
          ELEKTRIK: aktif.includes('ELEKTRIK'),
          SU: aktif.includes('SU'),
          DOGALGAZ: aktif.includes('DOGALGAZ'),
        });
      } else {
        setAktifEnerji({
          ELEKTRIK: true,
          SU: sayacFarki(mevcutEnerji.su) > 0,
          DOGALGAZ: sayacFarki(mevcutEnerji.dogalgaz) > 0,
        });
      }
      setEnerjiAciklama(mevcutEnerji.aciklama || '');
    } else {
      const prev = ilkOkumaFromOncekiAy(taseronEnerjiKayitlari, selectedTaseronId, selectedAy, selectedYil);
      setElek({ ilk: prev.elektrik, son: prev.elektrik, birim: 3.5 });
      setSu({ ilk: prev.su, son: prev.su, birim: 12 });
      setGaz({ ilk: prev.dogalgaz, son: prev.dogalgaz, birim: 8.5 });
      setAktifEnerji({ ELEKTRIK: true, SU: false, DOGALGAZ: false });
      setEnerjiAciklama('');
    }
  }, [selectedTaseronId, selectedAy, selectedYil, mevcutEnerji, taseronEnerjiKayitlari]);

  const [yemekTarih, setYemekTarih] = useState(new Date().toISOString().split('T')[0]);
  const [yemekSabah, setYemekSabah] = useState(0);
  const [yemekOgle, setYemekOgle] = useState(0);
  const [yemekAksam, setYemekAksam] = useState(0);

  const handleUcretOnayla = (raporId: string) => {
    if (saatlikUcret <= 0) {
      alert('Geçerli bir saatlik ücret girin.');
      return;
    }
    const mevcut = taseronKesintiRaporlari.find((r) => r.id === raporId);
    if (!mevcut) return;
    const tutar = hesaplaKesintiTutari(mevcut.toplamSaat, saatlikUcret);
    const onayli: TaseronKesintiRaporu = {
      ...mevcut,
      taseronFirmaId: mevcut.taseronFirmaId || selectedTaseron?.id,
      taseronFirmaAdi: mevcut.taseronFirmaAdi || selectedTaseron?.unvan || mevcut.taseronFirmaAdi,
      saatlikUcret,
      kesintiTutari: tutar,
      ucretOnayBekliyor: false,
      onayDurumu: 'ONAYLANDI',
    };
    setTaseronKesintiRaporlari((prev) => prev.map((r) => (r.id !== raporId ? r : onayli)));
    appendCariIslemOnce(setCariIslemGecmisi, buildCariIslemFromMakineKesintiRaporu(onayli));
    addNotification?.(
      `İş makinesi kesinti onaylandı ve ${onayli.taseronFirmaAdi} cari geçmişine işlendi (${saatlikUcret} TL/sa → ${tutar.toLocaleString('tr-TR')} TL).`
    );
  };

  const handleMakineCariyeIsle = (rapor: TaseronKesintiRaporu) => {
    if (rapor.onayDurumu !== 'ONAYLANDI' && rapor.ucretOnayBekliyor) {
      alert('Önce saat ücretini onaylayın.');
      return;
    }
    const row = buildCariIslemFromMakineKesintiRaporu({
      ...rapor,
      taseronFirmaId: rapor.taseronFirmaId || selectedTaseron?.id,
      taseronFirmaAdi: rapor.taseronFirmaAdi || selectedTaseron?.unvan || rapor.taseronFirmaAdi,
    });
    if (!row) {
      alert('Taşeron cari kartı seçili değil — kayıt cariye işlenemedi.');
      return;
    }
    appendCariIslemOnce(setCariIslemGecmisi, row);
    addNotification?.(`Kesinti ${row.cariKartId ? rapor.taseronFirmaAdi : ''} cari geçmişine eklendi.`);
  };

  const handleElleMakineRaporu = () => {
    if (!selectedTaseron) {
      alert('Önce taşeron seçin.');
      return;
    }
    const faaliyetler = aylikFaaliyetler
      .filter((f) => !f.kesintiYansitildi)
      .map((f) => ({
        ...f,
        firmaId: f.firmaId || selectedTaseron.id,
        firmaAdi: f.firmaAdi || selectedTaseron.unvan,
      }));
    if (faaliyetler.length === 0) {
      alert('Bu dönem için yansıtılmamış faaliyet yok.');
      return;
    }
    const toplamSaat = faaliyetler.reduce((s, f) => s + f.calismaSuresi, 0);
    const rapor: TaseronKesintiRaporu = {
      id: `tkr_${Date.now()}`,
      kesintiTipi: 'IS_MAKINESI',
      taseronFirmaAdi: selectedTaseron.unvan,
      taseronFirmaId: selectedTaseron.id,
      donemAy: donemAyStr,
      donemYil: donemYilStr,
      toplamSaat,
      saatlikUcret: 0,
      kesintiTutari: 0,
      ucretOnayBekliyor: true,
      faaliyetler,
      onayDurumu: 'TASLAK',
      olusturanKullanici: currentUser?.email || 'yönetici',
      olusturmaTarihi: new Date().toISOString(),
    };
    setTaseronKesintiRaporlari((prev) => [rapor, ...prev]);
    if (setOperatorFaaliyetleri) {
      const ids = new Set(faaliyetler.map((f) => f.id));
      setOperatorFaaliyetleri((prev) =>
        prev.map((f) =>
          ids.has(f.id)
            ? {
                ...f,
                kesintiYansitildi: true,
                firmaId: f.firmaId || selectedTaseron.id,
                firmaAdi: f.firmaAdi || selectedTaseron.unvan,
              }
            : f
        )
      );
    }
    addNotification?.('Taslak rapor oluşturuldu — saat ücretini girip onaylayın (cariye otomatik işlenir).');
  };

  const handleEnerjiKaydet = () => {
    if (!selectedTaseron) {
      alert('Önce taşeron seçin.');
      return;
    }
    const aktifKalemler = (Object.keys(aktifEnerji) as EnerjiKalem[]).filter((k) => aktifEnerji[k]);
    if (aktifKalemler.length === 0) {
      alert('En az bir sayaç kalemi seçin (ör. yalnızca Elektrik).');
      return;
    }
    const buildOlcum = (
      state: { ilk: number; son: number; birim: number },
      aktif: boolean
    ) => {
      // Pasif kalemde fark oluşmasın: son = ilk
      const son = aktif ? state.son : state.ilk;
      return { ilkOkuma: state.ilk, sonOkuma: son, birimFiyat: state.birim };
    };
    const elektrik = buildOlcum(elek, aktifEnerji.ELEKTRIK);
    const suO = buildOlcum(su, aktifEnerji.SU);
    const dogalgaz = buildOlcum(gaz, aktifEnerji.DOGALGAZ);
    const draft = { elektrik, su: suO, dogalgaz, aktifKalemler };
    const hasFark = aktifKalemler.some((k) => {
      if (k === 'ELEKTRIK') return sayacFarki(elektrik) > 0;
      if (k === 'SU') return sayacFarki(suO) > 0;
      return sayacFarki(dogalgaz) > 0;
    });
    if (!hasFark) {
      alert('Seçili kalemde son okuma ilk okumadan büyük olmalı (kesinti farkı).');
      return;
    }
    const kayit: TaseronEnerjiKaydi = {
      id: mevcutEnerji?.id || `ten_${Date.now()}`,
      taseronCariId: selectedTaseron.id,
      taseronFirmaAdi: selectedTaseron.unvan,
      donemAy: donemAyStr,
      donemYil: donemYilStr,
      elektrik,
      su: suO,
      dogalgaz,
      aktifKalemler,
      aciklama: enerjiAciklama.trim() || undefined,
      olusturmaTarihi: mevcutEnerji?.olusturmaTarihi || new Date().toISOString(),
      olusturanKullanici: currentUser?.email,
    };
    setTaseronEnerjiKayitlari((prev) => {
      const rest = prev.filter((k) => k.id !== kayit.id);
      return [
        kayit,
        ...rest.filter(
          (k) =>
            !(
              k.taseronCariId === kayit.taseronCariId &&
              k.donemAy === kayit.donemAy &&
              k.donemYil === kayit.donemYil
            )
        ),
      ];
    });
    alert(
      `Sayaç kesintisi kaydedildi.\nTaşeron: ${selectedTaseron.unvan}\n${enerjiKalemOzet(draft)}\nToplam: ${enerjiToplamTutar(draft).toLocaleString('tr-TR')} TL`
    );
  };

  const handleEnerjiRapor = () => {
    if (!selectedTaseron || !mevcutEnerji) {
      alert('Önce sayaç kaydını kaydedin.');
      return;
    }
    const tutar = enerjiToplamTutar(mevcutEnerji);
    const rapor: TaseronKesintiRaporu = {
      id: `tkr_en_${Date.now()}`,
      kesintiTipi: 'ENERJI',
      taseronFirmaAdi: selectedTaseron.unvan,
      taseronFirmaId: selectedTaseron.id,
      donemAy: donemAyStr,
      donemYil: donemYilStr,
      toplamSaat: 0,
      saatlikUcret: 0,
      kesintiTutari: tutar,
      faaliyetler: [],
      enerjiDetay: mevcutEnerji,
      onayDurumu: 'ONAYLANDI',
      olusturanKullanici: currentUser?.email || 'yönetici',
      olusturmaTarihi: new Date().toISOString(),
    };
    setTaseronKesintiRaporlari((prev) => [rapor, ...prev]);
    const html = buildEnerjiKesintiReportHtml(selectedTaseron.unvan, selectedAy, selectedYil, mevcutEnerji);
    downloadKibritciReportHtml(html, `Kibritci_Enerji_${selectedTaseron.unvan}_${donemAyStr}_${donemYilStr}.html`);
  };

  const enerjiKesintiListesi = useMemo(() => {
    return [...taseronEnerjiKayitlari].sort((a, b) => {
      const ka = `${a.donemYil}-${a.donemAy}`;
      const kb = `${b.donemYil}-${b.donemAy}`;
      return kb.localeCompare(ka);
    });
  }, [taseronEnerjiKayitlari]);

  const handleEnerjiSil = (id: string) => {
    if (!window.confirm('Bu sayaç kesinti kaydı silinsin mi?')) return;
    setTaseronEnerjiKayitlari((prev) => prev.filter((k) => k.id !== id));
  };

  const handleYemekKaydet = () => {
    if (!selectedTaseron) return;
    const kayit: TaseronYemekKaydi = {
      id: `tym_${Date.now()}`,
      taseronCariId: selectedTaseron.id,
      taseronFirmaAdi: selectedTaseron.unvan,
      tarih: yemekTarih,
      sabah: yemekSabah,
      ogle: yemekOgle,
      aksam: yemekAksam,
    };
    setTaseronYemekKayitlari((prev) => [
      kayit,
      ...prev.filter((k) => !(k.taseronCariId === kayit.taseronCariId && k.tarih === kayit.tarih)),
    ]);
    setYemekSabah(0);
    setYemekOgle(0);
    setYemekAksam(0);
  };

  const handleYemekRapor = () => {
    if (!selectedTaseron) return;
    const ozet = yemekAylikOzet(taseronYemekKayitlari, selectedTaseron.id, selectedAy, selectedYil);
    const gunluk = taseronYemekKayitlari
      .filter((k) => {
        if (k.taseronCariId !== selectedTaseron.id) return false;
        const d = new Date(k.tarih);
        return d.getMonth() + 1 === selectedAy && d.getFullYear() === selectedYil;
      })
      .map((k) => ({ tarih: k.tarih, sabah: k.sabah, ogle: k.ogle, aksam: k.aksam }));
    if (gunluk.length === 0) {
      alert('Bu ay için yemek kaydı yok.');
      return;
    }
    const rapor: TaseronKesintiRaporu = {
      id: `tkr_ym_${Date.now()}`,
      kesintiTipi: 'YEMEK',
      taseronFirmaAdi: selectedTaseron.unvan,
      taseronFirmaId: selectedTaseron.id,
      donemAy: donemAyStr,
      donemYil: donemYilStr,
      toplamSaat: 0,
      saatlikUcret: 0,
      kesintiTutari: 0,
      faaliyetler: [],
      yemekOzet: ozet,
      onayDurumu: 'ONAYLANDI',
      olusturanKullanici: currentUser?.email || 'yönetici',
      olusturmaTarihi: new Date().toISOString(),
    };
    setTaseronKesintiRaporlari((prev) => [rapor, ...prev]);
    const html = buildYemekRaporHtml(selectedTaseron.unvan, selectedAy, selectedYil, ozet, gunluk);
    downloadKibritciReportHtml(html, `Kibritci_Yemek_${selectedTaseron.unvan}_${donemAyStr}.html`);
  };

  const arsivRaporlari = useMemo(() => {
    if (!selectedTaseron) return [];
    return taseronKesintiRaporlari.filter(
      (r) => r.taseronFirmaId === selectedTaseron.id || r.taseronFirmaAdi === selectedTaseron.unvan
    );
  }, [taseronKesintiRaporlari, selectedTaseron]);

  const taseronPersonelListesi = useMemo(() => {
    if (!selectedTaseron) return [];
    return personelForTaseron(personeller, selectedTaseron);
  }, [personeller, selectedTaseron]);

  const firmaEnvanteri = useMemo(
    () => buildTaseronFirmaEnvanteri(cariKartlar, personeller, kampKayitlari),
    [cariKartlar, personeller, kampKayitlari]
  );
  const envanterOzet = useMemo(() => taseronEnvanterOzet(firmaEnvanteri), [firmaEnvanteri]);

  /** İşe giriş/çıkış tarihine göre aktif taşeron personeli */
  const taseronPersonelAktifListe = useMemo(() => {
    const bugun = new Date().toISOString().split('T')[0];
    return taseronPersonelListesi.filter((p) => isPersonelActiveOnDate(p, bugun));
  }, [taseronPersonelListesi]);

  const taseronPersonelIds = useMemo(
    () => new Set(taseronPersonelListesi.map((p) => p.id)),
    [taseronPersonelListesi]
  );

  const taseronPersonelLoglari = useMemo(() => {
    if (!selectedTaseron) return [] as Array<{
      id: string;
      kaynak: string;
      ad: string;
      soyad: string;
      tip: string;
      zaman: string;
      detay?: string;
    }>;

    const bas = logFiltreBaslangic;
    const bit = logFiltreBitis;
    const inRange = (iso?: string) => {
      if (!iso) return false;
      const d = String(iso).slice(0, 10);
      return d >= bas && d <= bit;
    };

    const kapi = kapiLoglari
      .filter((l) => {
        if (!inRange(l.zaman)) return false;
        if (l.personelId && taseronPersonelIds.has(l.personelId)) return true;
        if (l.firmaTipi === 'TASERON' && l.firmaAdi && firmaEslesir(l.firmaAdi, selectedTaseron.unvan)) {
          return true;
        }
        return false;
      })
      .map((l) => ({
        id: `kapi_${l.id}`,
        kaynak: 'KAPI',
        ad: l.ad || '',
        soyad: l.soyad || '',
        tip: l.tip || '—',
        zaman: l.zaman || '',
        detay: l.gorev || '',
        raw: l,
      }));

    const matchPersonelName = (adSoyad: string) => {
      const n = String(adSoyad || '').trim().toLocaleLowerCase('tr-TR');
      return taseronPersonelListesi.some(
        (p) => `${p.ad} ${p.soyad}`.trim().toLocaleLowerCase('tr-TR') === n
      );
    };

    const isciGiris = girisTalepleri
      .filter((t) => {
        const zaman = t.olusturmaTarihi || t.tarih || t.kayitTarihi || '';
        if (!inRange(zaman)) return false;
        if (t.personelId && taseronPersonelIds.has(t.personelId)) return true;
        if (t.firmaAdi && firmaEslesir(t.firmaAdi, selectedTaseron.unvan)) return true;
        if (t.adSoyad && matchPersonelName(t.adSoyad)) return true;
        if (t.ad && t.soyad && matchPersonelName(`${t.ad} ${t.soyad}`)) return true;
        return false;
      })
      .map((t) => ({
        id: `giris_${t.id}`,
        kaynak: 'İŞÇİ GİRİŞ',
        ad: t.ad || String(t.adSoyad || '').split(' ')[0] || '',
        soyad: t.soyad || String(t.adSoyad || '').split(' ').slice(1).join(' ') || '',
        tip: t.durum || 'GİRİŞ TALEBİ',
        zaman: t.olusturmaTarihi || t.tarih || t.kayitTarihi || '',
        detay: t.gorev || t.aciklama || '',
        raw: t,
      }));

    const isciCikis = cikisTalepleri
      .filter((t) => {
        const zaman = t.olusturmaTarihi || t.tarih || t.kayitTarihi || t.cikisTarihi || '';
        if (!inRange(zaman)) return false;
        if (t.personelId && taseronPersonelIds.has(t.personelId)) return true;
        if (t.firmaAdi && firmaEslesir(t.firmaAdi, selectedTaseron.unvan)) return true;
        if (t.adSoyad && matchPersonelName(t.adSoyad)) return true;
        if (t.ad && t.soyad && matchPersonelName(`${t.ad} ${t.soyad}`)) return true;
        return false;
      })
      .map((t) => ({
        id: `cikis_${t.id}`,
        kaynak: 'İŞÇİ ÇIKIŞ',
        ad: t.ad || String(t.adSoyad || '').split(' ')[0] || '',
        soyad: t.soyad || String(t.adSoyad || '').split(' ').slice(1).join(' ') || '',
        tip: t.durum || 'ÇIKIŞ TALEBİ',
        zaman: t.olusturmaTarihi || t.tarih || t.kayitTarihi || t.cikisTarihi || '',
        detay: t.aciklama || t.neden || '',
        raw: t,
      }));

    return [...kapi, ...isciGiris, ...isciCikis].sort(
      (a, b) => new Date(b.zaman || 0).getTime() - new Date(a.zaman || 0).getTime()
    );
  }, [
    selectedTaseron,
    kapiLoglari,
    girisTalepleri,
    cikisTalepleri,
    taseronPersonelIds,
    taseronPersonelListesi,
    logFiltreBaslangic,
    logFiltreBitis,
  ]);

  const handleTaseronLogRapor = () => {
    if (!selectedTaseron) return;
    const rows = taseronPersonelLoglari
      .map(
        (l, i) =>
          `<tr><td>${i + 1}</td><td>${l.kaynak}</td><td><strong>${l.ad} ${l.soyad}</strong></td><td>${l.tip}</td><td>${formatZamanTr(l.zaman)}</td><td>${l.detay || '—'}</td></tr>`
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Taşeron Personel Logları</title>
      <style>body{font-family:system-ui;padding:28px;color:#1e293b}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f1f5f9;font-size:10px;text-transform:uppercase}.badge{background:#f59e0b;color:#0f172a;font-weight:800;font-size:10px;padding:3px 8px;border-radius:999px}</style>
      </head><body>
      <span class="badge">TAŞERON</span>
      <h1>${selectedTaseron.unvan} — Personel Giriş/Çıkış Logları</h1>
      <p>${logFiltreBaslangic} → ${logFiltreBitis} · ${taseronPersonelLoglari.length} kayıt</p>
      <p style="font-size:12px;color:#64748b">Kapı logları + işçi giriş/çıkış talepleri. Ana firma puantajından bağımsızdır.</p>
      <table><thead><tr><th>#</th><th>Kaynak</th><th>Personel</th><th>Tip/Durum</th><th>Zaman</th><th>Detay</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Kayıt yok</td></tr>'}</tbody></table>
      </body></html>`;
    downloadKibritciReportHtml(html, `taseron_personel_log_${selectedTaseron.unvan}_${logFiltreBaslangic}.html`);
    addNotification?.(`${selectedTaseron.unvan} personel log raporu indirildi.`);
  };

  const handleTaseronLogWp = () => {
    const selected = taseronPersonelLoglari.filter((l) => selectedLogIds.includes(l.id));
    const logs = (selected.length ? selected : taseronPersonelLoglari).map((l) => ({
      ad: l.ad,
      soyad: l.soyad,
      gorev: `${l.kaynak} · ${l.detay || ''}`,
      tip: l.tip,
      zaman: l.zaman,
      firmaAdi: selectedTaseron?.unvan,
      firmaTipi: 'TASERON',
    }));
    if (logs.length === 0) {
      alert('Gönderilecek log yok.');
      return;
    }
    openWhatsAppText(
      buildPersonelLoglariWhatsAppText(
        logs,
        `${selectedTaseron?.unvan || ''} · ${logFiltreBaslangic}→${logFiltreBitis}`
      )
    );
  };

  const cezaToplam = useMemo(() => {
    if (!selectedTaseron) return 0;
    return hazirTutanaklar
      .filter(
        (t) =>
          t.tutanakTipi === 'CEZA' &&
          (t.cariKartId === selectedTaseron.id || t.taseronAdi === selectedTaseron.unvan)
      )
      .reduce((s, t) => s + (t.cezaTutari || 0), 0);
  }, [hazirTutanaklar, selectedTaseron]);

  const SayacBlock = ({
    label,
    icon,
    state,
    setState,
    unit,
    aktif,
    onAktifChange,
  }: {
    label: string;
    icon: string;
    state: { ilk: number; son: number; birim: number };
    setState: React.Dispatch<React.SetStateAction<{ ilk: number; son: number; birim: number }>>;
    unit: string;
    aktif: boolean;
    onAktifChange: (v: boolean) => void;
  }) => (
    <div
      className={`border rounded-2xl p-3 space-y-2 transition ${
        aktif ? 'bg-slate-50 border-slate-200' : 'bg-slate-100/60 border-slate-100 opacity-70'
      }`}
    >
      <div className="flex justify-between items-center gap-2 text-[10px] font-bold">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={aktif}
            onChange={(e) => onAktifChange(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span>
            {icon} {label}
          </span>
        </label>
        <span className={aktif ? 'text-slate-700' : 'text-slate-400'}>
          {aktif ? `Fark: ${Math.max(0, state.son - state.ilk)} ${unit}` : 'Kesintiye dahil değil'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          placeholder="İlk"
          disabled={!aktif}
          value={state.ilk || ''}
          onChange={(e) => setState((s) => ({ ...s, ilk: Number(e.target.value) }))}
          className="p-2 border rounded-lg text-center text-xs disabled:bg-slate-100 disabled:text-slate-400"
        />
        <input
          type="number"
          placeholder="Son"
          disabled={!aktif}
          value={state.son || ''}
          onChange={(e) => setState((s) => ({ ...s, son: Number(e.target.value) }))}
          className="p-2 border rounded-lg text-center text-xs disabled:bg-slate-100 disabled:text-slate-400"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Birim ₺"
          disabled={!aktif}
          value={state.birim || ''}
          onChange={(e) => setState((s) => ({ ...s, birim: Number(e.target.value) }))}
          className="p-2 border rounded-lg text-center text-xs disabled:bg-slate-100 disabled:text-slate-400"
        />
      </div>
      {aktif && (
        <p className="text-[9px] text-right font-bold text-slate-600">
          Tutar: {(Math.max(0, state.son - state.ilk) * state.birim).toLocaleString('tr-TR')} TL
        </p>
      )}
    </div>
  );

  return (
    <div className="flex-grow p-3 sm:p-4 lg:p-6 min-h-[calc(100vh-52px)] overflow-y-auto font-sans bg-slate-50/50 space-y-4 lg:space-y-5">
      <div className="bg-slate-900 text-white rounded-3xl p-5 flex flex-wrap gap-4 justify-between items-start">
        <div>
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">Taşeron Yönetimi</span>
          <h2 className="text-sm font-black flex items-center gap-2 mt-1">
            <Building2 size={16} /> Kesinti &amp; Ay Sonu Raporları
          </h2>
          <p className="text-[10px] text-slate-400 mt-1 max-w-xl">
            Cari kartlarda <strong>TASERON</strong> tipindeki firmalar listelenir. İş makinesi, enerji, yemek ve ceza kesintileri ayrı raporlanır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <select
            value={selectedTaseronId}
            onChange={(e) => setSelectedTaseronId(e.target.value)}
            className="text-xs font-bold p-2.5 bg-slate-800 border border-slate-700 rounded-xl min-w-[200px]"
          >
            {taseronlar.length === 0 ? (
              <option value="">Taşeron cari kartı yok — Cari/Stok sekmesinden TASERON ekleyin</option>
            ) : (
              taseronlar.map((t) => (
                <option key={t.id} value={t.id}>{t.unvan} ({t.kod})</option>
              ))
            )}
          </select>
          <select value={selectedAy} onChange={(e) => setSelectedAy(Number(e.target.value))} className="text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-xl">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{ayAdi(i + 1)}</option>
            ))}
          </select>
          <select value={selectedYil} onChange={(e) => setSelectedYil(Number(e.target.value))} className="text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-xl">
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['envanter', 'Firma Envanteri', Building2],
            ['makine_icmal', 'İş Makinesi İcmali', Table2],
            ['makine', 'İş Makinesi Kesinti', HardHat],
            ['enerji', 'Elektrik / Su / Gaz', Zap],
            ['yemek', 'Yemek Sayımı', UtensilsCrossed],
            ['personel', 'Seçili Taşeron Personel', Users],
            ['personel_loglari', 'Personel Giriş/Çıkış Logları', LogIn],
            ['arsiv', 'Rapor Arşivi', Archive],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubPage(key)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${subPage === key ? 'bg-amber-500 text-slate-950' : 'bg-white border text-slate-700 hover:bg-slate-50'}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {!selectedTaseron &&
      subPage !== 'envanter' &&
      subPage !== 'enerji' &&
      subPage !== 'makine' &&
      subPage !== 'makine_icmal' ? (
        <div className="bg-white border rounded-2xl p-12 text-center text-slate-500 text-sm">
          Taşeron seçmek için önce cari kartlara <strong>kartTipi: TASERON</strong> ile firma ekleyin.
          Firma listesi için <strong>Firma Envanteri</strong> sekmesine bakın.
        </div>
      ) : (
        <>
          {subPage === 'envanter' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  ['Toplam Firma', envanterOzet.toplamFirma],
                  ['Cari Kartlı', envanterOzet.cariVar],
                  ["Cari'siz (Orphan)", envanterOzet.carisiz],
                  ['Personelsiz Cari', envanterOzet.personelsizCari],
                  ['Toplam Personel', envanterOzet.toplamPersonel],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-2xl p-3">
                    <span className="text-[9px] font-black uppercase text-slate-500 block">{label}</span>
                    <span className="text-lg font-black text-slate-900 font-mono">{val}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-800">Taşeron Firma Envanteri</h3>
                  <span className="text-[10px] text-slate-500">Cari + personel firmaAdi + kamp birleşik</span>
                </div>
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[9px] uppercase text-slate-500">
                        <th className="px-3 py-2">Firma</th>
                        <th className="px-3 py-2">Durum</th>
                        <th className="px-3 py-2">Personel</th>
                        <th className="px-3 py-2">Kamp Sakin</th>
                        <th className="px-3 py-2">Cari Kod</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {firmaEnvanteri.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                            Taşeron firma kaydı bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        firmaEnvanteri.map((row) => (
                          <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50/80">
                            <td className="px-3 py-2.5 font-bold text-slate-800">{row.unvan}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${
                                  row.durum === 'AKTIF'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : row.durum === 'ORPHAN'
                                      ? 'bg-amber-50 text-amber-800'
                                      : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {row.durum === 'ORPHAN' ? "CARİ'SİZ" : row.durum}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold">{row.personelSayisi}</td>
                            <td className="px-3 py-2.5 font-mono">{row.kampSakinSayisi}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{row.cari?.kod || '—'}</td>
                            <td className="px-3 py-2.5 text-right">
                              {row.cari && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTaseronId(row.cari!.id);
                                    setSubPage('personel');
                                  }}
                                  className="text-[10px] font-bold text-amber-700 hover:underline cursor-pointer"
                                >
                                  Personelleri Aç
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {subPage === 'makine_icmal' && (
            <div className="space-y-4">
              <div className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                      <Table2 size={14} className="text-amber-600" />
                      İş Makinesi İcmali · {ayAdi(selectedAy)} {selectedYil}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-2xl">
                      Firma satırları × makine tipi kolonları. HTML/Yazdır raporunda önce özet icmal,
                      ardından her firmanın kayıt kayıt kesinti açıklamaları (tarih, makine, süre, iş) yer alır.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 items-end">
                      <label className="block space-y-1">
                        <span className="text-[9px] font-black uppercase text-amber-800">Dönem ay</span>
                        <select
                          value={selectedAy}
                          onChange={(e) => setSelectedAy(Number(e.target.value))}
                          className="block text-xs font-bold p-2.5 border-2 border-amber-300 bg-amber-50 rounded-xl min-w-[140px]"
                        >
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {ayAdi(i + 1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[9px] font-black uppercase text-amber-800">Yıl</span>
                        <select
                          value={selectedYil}
                          onChange={(e) => setSelectedYil(Number(e.target.value))}
                          className="block text-xs font-bold p-2.5 border-2 border-amber-300 bg-amber-50 rounded-xl"
                        >
                          {[2024, 2025, 2026, 2027].map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-1 pb-0.5">
                        {[5, 6, 7, 8].map((ay) => (
                          <button
                            key={ay}
                            type="button"
                            onClick={() => setSelectedAy(ay)}
                            className={`px-2.5 py-2 rounded-lg text-[10px] font-black cursor-pointer ${
                              selectedAy === ay
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-white border border-amber-200 text-amber-900'
                            }`}
                          >
                            {ayAdi(ay)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={icmalOnlyOnayli}
                        onChange={(e) => setIcmalOnlyOnayli(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Yalnızca onaylı
                    </label>
                    <button
                      type="button"
                      onClick={() => indirIsMakinesiIcmal(makineIcmal, icmalOnlyOnayli)}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-bold bg-slate-900 text-white cursor-pointer"
                    >
                      <Download size={12} /> HTML İndir
                    </button>
                    <button
                      type="button"
                      onClick={() => yazdirIsMakinesiIcmal(makineIcmal, icmalOnlyOnayli)}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-bold border border-slate-300 bg-white text-slate-800 cursor-pointer"
                    >
                      <Printer size={12} /> Yazdır
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubPage('makine')}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-bold border border-amber-300 bg-amber-50 text-amber-900 cursor-pointer"
                    >
                      <HardHat size={12} /> Kesinti / Ücret
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['Firma', String(makineIcmal.firmaSayisi)],
                    ['Toplam saat', `${makineIcmal.genelToplamSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`],
                    ['Kayıt', String(makineIcmal.genelKayitSayisi)],
                    [
                      'Onaylı / Bekleyen',
                      `${makineIcmal.genelOnayliSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} / ${makineIcmal.genelBekleyenSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`,
                    ],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-[9px] font-black uppercase text-slate-500 block">{label}</span>
                      <span className="text-sm font-black text-slate-900 font-mono">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
                  <table className="w-full text-left text-xs min-w-[720px]">
                    <thead className="bg-slate-900 text-white sticky top-0 z-10">
                      <tr className="text-[9px] uppercase tracking-wide">
                        <th className="px-3 py-2.5 text-left">Açıklama (Firma)</th>
                        {IS_MAKINESI_ICMAL_TIPLER.map((t) => (
                          <th key={t} className="px-3 py-2.5 text-right">
                            {t}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-right">Toplam</th>
                        <th className="px-3 py-2.5 text-center">Kayıt</th>
                        <th className="px-3 py-2.5 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {makineIcmal.satirlar.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-10 text-center text-slate-400 italic">
                            {icmalOnlyOnayli
                              ? 'Bu dönem için onaylı iş makinesi faaliyeti yok. Onay Havuzu’ndan onaylayın veya «Yalnızca onaylı» filtresini kaldırın.'
                              : 'Bu dönem için operatör faaliyet kaydı yok.'}
                          </td>
                        </tr>
                      ) : (
                        makineIcmal.satirlar.map((row) => (
                          <tr key={row.key} className="border-t border-slate-100 hover:bg-amber-50/40">
                            <td className="px-3 py-2.5 font-bold text-slate-800 uppercase">{row.firmaAdi}</td>
                            {IS_MAKINESI_ICMAL_TIPLER.map((t) => (
                              <td key={t} className="px-3 py-2.5 text-right font-mono text-slate-700">
                                {row.saatler[t] > 0
                                  ? row.saatler[t].toLocaleString('tr-TR', { maximumFractionDigits: 1 })
                                  : '—'}
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-right font-mono font-black text-slate-900">
                              {row.toplamSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono text-slate-500">{row.kayitSayisi}</td>
                            <td className="px-3 py-2.5 text-right">
                              {row.firmaId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTaseronId(row.firmaId!);
                                    setSubPage('makine');
                                  }}
                                  className="text-[10px] font-bold text-amber-700 hover:underline cursor-pointer"
                                >
                                  Kesinti →
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {makineIcmal.satirlar.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-black">
                          <td className="px-3 py-3">TOPLAM</td>
                          {IS_MAKINESI_ICMAL_TIPLER.map((t) => (
                            <td key={t} className="px-3 py-3 text-right font-mono">
                              {makineIcmal.tipToplamlari[t] > 0
                                ? makineIcmal.tipToplamlari[t].toLocaleString('tr-TR', {
                                    maximumFractionDigits: 1,
                                  })
                                : '—'}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right font-mono text-amber-300">
                            {makineIcmal.genelToplamSaat.toLocaleString('tr-TR', {
                              maximumFractionDigits: 1,
                            })}{' '}
                            sa
                          </td>
                          <td className="px-3 py-3 text-center font-mono">{makineIcmal.genelKayitSayisi}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {subPage === 'makine' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase text-amber-900 tracking-wide">
                    Dönem İcmali · {ayAdi(selectedAy)} {selectedYil}
                  </p>
                  <p className="text-xs text-amber-950 font-bold mt-0.5">
                    {makineIcmal.firmaSayisi} firma ·{' '}
                    {makineIcmal.genelToplamSaat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa
                    {icmalOnlyOnayli ? ' (onaylı)' : ' (tümü)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubPage('makine_icmal')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold bg-white border border-amber-300 text-amber-950 cursor-pointer"
                >
                  <Table2 size={12} /> Firma bazlı icmali aç
                </button>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border rounded-2xl p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                      <HardHat size={14} className="text-amber-600" /> İş Makinesi Kesintisi
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Taşeron seçin → dönem faaliyetlerinden taslak açın → saat ücretini onaylayın.
                      Onayda kesinti ilgili taşeronun <strong>cari geçmiş işlemlerine</strong> eklenir;
                      istenirse taşeron bazlı kesinti raporu indirilir / yazdırılır.
                    </p>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Taşeron (kime kesilecek) *</span>
                    <select
                      value={selectedTaseronId}
                      onChange={(e) => setSelectedTaseronId(e.target.value)}
                      className="w-full text-xs font-bold p-2.5 bg-amber-50 border border-amber-200 rounded-xl"
                    >
                      {taseronlar.length === 0 ? (
                        <option value="">Taşeron cari kartı yok</option>
                      ) : (
                        taseronlar.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.unvan} ({t.kod})
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">Dönem ay</span>
                      <select
                        value={selectedAy}
                        onChange={(e) => setSelectedAy(Number(e.target.value))}
                        className="w-full text-xs p-2.5 border rounded-xl"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {ayAdi(i + 1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">Yıl</span>
                      <select
                        value={selectedYil}
                        onChange={(e) => setSelectedYil(Number(e.target.value))}
                        className="w-full text-xs p-2.5 border rounded-xl"
                      >
                        {[2024, 2025, 2026, 2027].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Saatlik Ücret (TL)</label>
                    <input
                      type="number"
                      value={saatlikUcret}
                      onChange={(e) => setSaatlikUcret(Number(e.target.value))}
                      className="w-full mt-1 p-2.5 border rounded-xl text-xs font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Formül: <strong>Kesinti = Toplam Saat × Saatlik Ücret</strong>
                    </p>
                  </div>

                  {bekleyenMakineRaporlari.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Onay bekleyen iş makinesi raporu yok.</p>
                  ) : (
                    bekleyenMakineRaporlari.map((r) => (
                      <div key={r.id} className="border rounded-xl p-3 bg-amber-50/50 space-y-2">
                        <p className="text-xs font-bold">
                          {r.taseronFirmaAdi} · {r.donemAy}/{r.donemYil}
                        </p>
                        <p className="text-[10px]">
                          Toplam: {r.toplamSaat.toFixed(1)} sa · {r.faaliyetler?.length || 0} faaliyet
                        </p>
                        <button
                          type="button"
                          onClick={() => handleUcretOnayla(r.id)}
                          className="w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 size={14} /> Ücreti Onayla &amp; Cariye İşle (
                          {saatlikUcret} TL/sa →{' '}
                          {hesaplaKesintiTutari(r.toplamSaat, saatlikUcret).toLocaleString('tr-TR')} TL)
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    type="button"
                    onClick={handleElleMakineRaporu}
                    disabled={!selectedTaseron}
                    className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Plus size={14} /> Dönem Faaliyetlerinden Taslak Oluştur
                  </button>
                </div>

                <div className="bg-white border rounded-2xl p-5 space-y-2 max-h-[560px] overflow-y-auto">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-xs font-black uppercase text-slate-800">
                      {selectedTaseron
                        ? `${selectedTaseron.unvan} · ${ayAdi(selectedAy)} ${selectedYil}`
                        : 'Faaliyetler'}
                    </h3>
                    <span className="text-[9px] font-mono text-slate-500">
                      {aylikFaaliyetler.reduce((s, f) => s + (f.calismaSuresi || 0), 0).toFixed(1)} sa
                    </span>
                  </div>
                  {!selectedTaseron ? (
                    <p className="text-xs text-slate-400">Taşeron seçin.</p>
                  ) : aylikFaaliyetler.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      Bu taşeron / dönem için operatör faaliyet kaydı yok. Ay-yıl filtresini kontrol edin.
                    </p>
                  ) : (
                    aylikFaaliyetler.map((f) => (
                      <div key={f.id} className="text-[10px] border-b border-slate-100 py-2.5 space-y-0.5">
                        <div className="flex justify-between gap-2">
                          <span className="font-bold text-slate-800">
                            {f.tarih} · {f.operatorIsim}
                          </span>
                          <span className="font-mono font-bold shrink-0">{f.calismaSuresi.toFixed(1)} sa</span>
                        </div>
                        <p className="text-slate-600">{makineEtiketi(f)} · {f.yapilanIs}</p>
                        <p className="text-[9px]">
                          {f.kesintiYansitildi ? (
                            <span className="text-emerald-700 font-bold">Kesintiye alındı</span>
                          ) : (
                            <span className="text-amber-700 font-bold">Bekliyor</span>
                          )}
                        </p>
                      </div>
                    ))
                  )}
                  {cezaToplam > 0 && (
                    <p className="text-[10px] text-rose-600 font-bold pt-2">
                      Ceza tutanakları (ayrı rapor): {cezaToplam.toLocaleString('tr-TR')} TL
                    </p>
                  )}
                </div>
              </div>

              {selectedTaseron && (
                <div className="bg-white border rounded-2xl p-5 space-y-3">
                  <h3 className="text-xs font-black uppercase text-slate-800">
                    Taşeron Bazlı Kesinti Raporları · {ayAdi(selectedAy)} {selectedYil}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Bu liste ücret onayı / cari kesinti belgeleridir. Tüm firmaların güncel saat toplamı için{' '}
                    <button
                      type="button"
                      onClick={() => setSubPage('makine_icmal')}
                      className="font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      İş Makinesi İcmali
                    </button>{' '}
                    sekmesine bakın.
                  </p>
                  {makineDonemRaporlari.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Bu dönem için henüz iş makinesi kesinti raporu yok. Üstteki taslak butonu ile oluşturun
                      veya dönem icmalinden saatleri kontrol edin.
                    </p>
                  ) : (
                    makineDonemRaporlari.map((r) => (
                      <div
                        key={r.id}
                        className="border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-center justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800">
                            {r.taseronFirmaAdi} · {r.faaliyetler?.length || 0} faaliyet ·{' '}
                            {r.toplamSaat.toFixed(1)} sa
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {r.ucretOnayBekliyor || r.onayDurumu === 'TASLAK'
                              ? 'Ücret onayı bekliyor'
                              : `Onaylı · ${Number(r.saatlikUcret || 0).toLocaleString('tr-TR')} TL/sa → ${Number(r.kesintiTutari || 0).toLocaleString('tr-TR')} TL`}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {!r.ucretOnayBekliyor && r.onayDurumu === 'ONAYLANDI' && (
                            <button
                              type="button"
                              onClick={() => handleMakineCariyeIsle(r)}
                              className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-slate-900 text-white cursor-pointer"
                            >
                              Cariye İşle
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => indirIsMakinesiRaporu(r)}
                            className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                          >
                            <Download size={12} /> Rapor İndir
                          </button>
                          <button
                            type="button"
                            onClick={() => yazdirIsMakinesiRaporu(r)}
                            className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                          >
                            <Printer size={12} /> Yazdır
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              mailtoForRapor(
                                `Kibritçi — ${r.taseronFirmaAdi} İş Makinesi Kesinti`,
                                '',
                                r
                              )
                            }
                            className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                          >
                            <Mail size={12} /> E-posta
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {subPage === 'enerji' && (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="bg-white border rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                    <Zap size={14} className="text-amber-600" /> Sayaç Kesintisi Girişi
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Yalnızca işaretlediğiniz kalemler kesilir. Su / doğalgaz zorunlu değildir — sadece elektrik
                    kesebilirsiniz. Son okuma, sonraki ayın ilk okuması olur.
                  </p>
                </div>

                <label className="block space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500">Taşeron (kime kesilecek) *</span>
                  <select
                    value={selectedTaseronId}
                    onChange={(e) => setSelectedTaseronId(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 bg-amber-50 border border-amber-200 rounded-xl"
                  >
                    {taseronlar.length === 0 ? (
                      <option value="">Taşeron cari kartı yok</option>
                    ) : (
                      taseronlar.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.unvan} ({t.kod})
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Dönem ay</span>
                    <select
                      value={selectedAy}
                      onChange={(e) => setSelectedAy(Number(e.target.value))}
                      className="w-full text-xs p-2.5 border rounded-xl"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {ayAdi(i + 1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">Yıl</span>
                    <select
                      value={selectedYil}
                      onChange={(e) => setSelectedYil(Number(e.target.value))}
                      className="w-full text-xs p-2.5 border rounded-xl"
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {!selectedTaseron ? (
                  <p className="text-xs text-rose-600 font-semibold">Kesinti için taşeron seçin.</p>
                ) : (
                  <>
                    <p className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      Seçili: {selectedTaseron.unvan} · {ayAdi(selectedAy)} {selectedYil}
                    </p>
                    <SayacBlock
                      label="Elektrik (kWh)"
                      icon="⚡"
                      state={elek}
                      setState={setElek}
                      unit="kWh"
                      aktif={aktifEnerji.ELEKTRIK}
                      onAktifChange={(v) => setAktifEnerji((s) => ({ ...s, ELEKTRIK: v }))}
                    />
                    <SayacBlock
                      label="Su (m³)"
                      icon="💧"
                      state={su}
                      setState={setSu}
                      unit="m³"
                      aktif={aktifEnerji.SU}
                      onAktifChange={(v) => setAktifEnerji((s) => ({ ...s, SU: v }))}
                    />
                    <SayacBlock
                      label="Doğalgaz (m³)"
                      icon="🔥"
                      state={gaz}
                      setState={setGaz}
                      unit="m³"
                      aktif={aktifEnerji.DOGALGAZ}
                      onAktifChange={(v) => setAktifEnerji((s) => ({ ...s, DOGALGAZ: v }))}
                    />
                    <label className="block space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-500">
                        Açıklama / neden (isteğe bağlı)
                      </span>
                      <textarea
                        value={enerjiAciklama}
                        onChange={(e) => setEnerjiAciklama(e.target.value)}
                        rows={2}
                        placeholder="Örn. Ağustos elektrik tüketimi — şantiye barakası"
                        className="w-full text-xs p-2.5 border rounded-xl"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleEnerjiKaydet}
                        className="flex-1 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
                      >
                        Kaydet
                      </button>
                      <button
                        type="button"
                        onClick={handleEnerjiRapor}
                        className="flex-1 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                      >
                        Ay Sonu Rapor + Arşiv
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white border rounded-2xl p-5 space-y-3">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800">Kesinti Listesi</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Kime, hangi dönem, hangi kalem, tutar — yapılan sayaç kesintileri
                  </p>
                </div>
                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {enerjiKesintiListesi.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-8 text-center">Henüz sayaç kesintisi yok.</p>
                  ) : (
                    enerjiKesintiListesi.map((k) => {
                      const tutar = enerjiToplamTutar(k);
                      const ozet = enerjiKalemOzet(k);
                      const isSelected =
                        k.taseronCariId === selectedTaseronId &&
                        k.donemAy === donemAyStr &&
                        k.donemYil === donemYilStr;
                      return (
                        <div
                          key={k.id}
                          className={`border rounded-xl p-3 space-y-1.5 ${
                            isSelected ? 'border-amber-300 bg-amber-50/50' : 'border-slate-100 bg-slate-50/50'
                          }`}
                        >
                          <div className="flex justify-between gap-2 items-start">
                            <div>
                              <p className="text-xs font-black text-slate-800">{k.taseronFirmaAdi}</p>
                              <p className="text-[10px] text-slate-500 font-semibold">
                                {ayAdi(Number(k.donemAy))} {k.donemYil} · Sayaç kesintisi
                              </p>
                            </div>
                            <span className="text-xs font-black text-rose-700 whitespace-nowrap">
                              {tutar.toLocaleString('tr-TR')} TL
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-700 font-medium">{ozet}</p>
                          {k.aciklama && (
                            <p className="text-[10px] text-slate-500 italic">Neden: {k.aciklama}</p>
                          )}
                          <p className="text-[9px] text-slate-400">
                            {k.olusturanKullanici || '—'} ·{' '}
                            {k.olusturmaTarihi
                              ? new Date(k.olusturmaTarihi).toLocaleString('tr-TR')
                              : ''}
                          </p>
                          <div className="flex gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTaseronId(k.taseronCariId);
                                setSelectedAy(Number(k.donemAy));
                                setSelectedYil(Number(k.donemYil));
                              }}
                              className="flex-1 py-1.5 text-[10px] font-bold rounded-lg bg-white border cursor-pointer"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadKibritciReportHtml(
                                  buildEnerjiKesintiReportHtml(
                                    k.taseronFirmaAdi,
                                    Number(k.donemAy),
                                    Number(k.donemYil),
                                    k
                                  ),
                                  `enerji_${k.id}.html`
                                )
                              }
                              className="p-1.5 border rounded-lg cursor-pointer"
                              title="Rapor"
                            >
                              <Download size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEnerjiSil(k.id)}
                              className="p-1.5 border border-rose-200 text-rose-600 rounded-lg cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {subPage === 'yemek' && selectedTaseron && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white border rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-black uppercase">Günlük Yemek Girişi</h3>
                <input type="date" value={yemekTarih} onChange={(e) => setYemekTarih(e.target.value)} className="w-full p-2 border rounded-xl text-xs" />
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-[9px] font-bold">Sabah</label><input type="number" min={0} value={yemekSabah || ''} onChange={(e) => setYemekSabah(Number(e.target.value))} className="w-full p-2 border rounded-lg text-center text-xs" /></div>
                  <div><label className="text-[9px] font-bold">Öğle</label><input type="number" min={0} value={yemekOgle || ''} onChange={(e) => setYemekOgle(Number(e.target.value))} className="w-full p-2 border rounded-lg text-center text-xs" /></div>
                  <div><label className="text-[9px] font-bold">Akşam</label><input type="number" min={0} value={yemekAksam || ''} onChange={(e) => setYemekAksam(Number(e.target.value))} className="w-full p-2 border rounded-lg text-center text-xs" /></div>
                </div>
                <button type="button" onClick={handleYemekKaydet} className="w-full py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer">Günü Kaydet</button>
                <button type="button" onClick={handleYemekRapor} className="w-full py-2.5 bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer">Ay Sonu Yemek Raporu</button>
              </div>
              <div className="bg-white border rounded-2xl p-5">
                <h3 className="text-xs font-black uppercase mb-3">Ay Özeti</h3>
                {(() => {
                  const o = yemekAylikOzet(taseronYemekKayitlari, selectedTaseron.id, selectedAy, selectedYil);
                  return (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <p>Sabah: <strong>{o.sabah}</strong></p>
                      <p>Öğle: <strong>{o.ogle}</strong></p>
                      <p>Akşam: <strong>{o.aksam}</strong></p>
                      <p>Gün kaydı: <strong>{o.gunSayisi}</strong></p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {subPage === 'personel' && selectedTaseron && (
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="p-4 border-b bg-slate-50 flex flex-wrap justify-between gap-3 items-center">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                    <Users size={14} className="text-indigo-600" />
                    {selectedTaseron.unvan} — Personel Listesi
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Personel kayıtlarında <strong>firmaTipi: TASERON</strong> ve eşleşen firma adı. Ana firma yoklama listesine dahil edilmezler. İşe giriş/çıkış tarihlerine göre aktif: {taseronPersonelAktifListe.length}/{taseronPersonelListesi.length}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void exportTumFirmalarPersonelExcel({
                        personeller,
                        kampKayitlari,
                        kampOdalari,
                      })
                        .then((count) =>
                          alert(`${count} personel (tüm firmalar) Excel olarak indirildi.`)
                        )
                        .catch((err) =>
                          alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.')
                        );
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-sky-700 text-white rounded-xl hover:bg-sky-800 cursor-pointer"
                    title="Ana firma dahil tüm firmaların personelini Excel olarak indir"
                  >
                    <Download size={12} /> Tüm Firmalar Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void exportTaseronPersonelExcel({
                        personeller,
                        kampKayitlari,
                        kampOdalari,
                      })
                        .then((count) => alert(`${count} taşeron personeli Excel olarak indirildi.`))
                        .catch((err) =>
                          alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.')
                        );
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 cursor-pointer"
                    title="Tüm taşeron firmaların personelini Excel olarak indir"
                  >
                    <Download size={12} /> Tüm Taşeron Excel
                  </button>
                  <span className="text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-100 px-3 py-1 rounded-full">
                    {taseronPersonelListesi.length} personel
                  </span>
                </div>
              </div>

              {taseronPersonelListesi.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-sm space-y-2">
                  <p>Bu taşeron firmaya bağlı personel kaydı bulunamadı.</p>
                  <p className="text-[10px] text-slate-400">
                    Personel Kayıt ekranından firma tipi <strong>Taşeron</strong> seçip bu cari kartı veya firma adını atayın.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[9px] font-bold">
                      <tr>
                        <th className="p-3 border-b">Ad Soyad</th>
                        <th className="p-3 border-b">Görev</th>
                        <th className="p-3 border-b">TC No</th>
                        <th className="p-3 border-b">İşe Giriş</th>
                        <th className="p-3 border-b">İşten Çıkış</th>
                        <th className="p-3 border-b">Telefon</th>
                        <th className="p-3 border-b">Kamp Yerleşimi</th>
                        <th className="p-3 border-b text-center">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taseronPersonelListesi.map((p) => {
                        const aktif = p.durum === true || String(p.durum).toLowerCase() === 'true';
                        const bugunAktif = isPersonelActiveOnDate(p, new Date().toISOString().split('T')[0]);
                        const kamp = formatPersonelKampYerlesim(p, kampKayitlari, kampOdalari);
                        return (
                          <tr
                            key={p.id}
                            className={`border-b border-slate-100 hover:bg-slate-50/80 ${
                              bugunAktif ? 'bg-amber-50/40' : 'opacity-60'
                            }`}
                          >
                            <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                              {p.ad} {p.soyad}
                            </td>
                            <td className="p-3 text-slate-700">{displayPersonelGorev(p)}</td>
                            <td className="p-3 font-mono text-slate-600">{p.tcNo || '—'}</td>
                            <td className="p-3 font-mono text-slate-600">{p.iseGirisTarihi || '—'}</td>
                            <td className="p-3 font-mono text-slate-600">{p.istenCikisTarihi || '—'}</td>
                            <td className="p-3 text-slate-600 whitespace-nowrap">{p.telefonNo || '—'}</td>
                            <td className="p-3 text-slate-700 min-w-[180px]">
                              <span className={`inline-flex items-center gap-1 ${kamp.startsWith('—') ? 'text-slate-400 italic' : 'text-emerald-800 font-semibold'}`}>
                                {!kamp.startsWith('—') && <span>🏕️</span>}
                                {kamp}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${aktif && bugunAktif ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                                {aktif && bugunAktif ? 'Aktif' : 'Pasif / Tarih Dışı'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {subPage === 'personel_loglari' && selectedTaseron && (
            <div className="bg-white border rounded-2xl overflow-hidden space-y-0">
              <div className="p-4 border-b bg-amber-50/60 flex flex-wrap justify-between gap-3 items-center">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                    <LogIn size={14} className="text-amber-700" />
                    {selectedTaseron.unvan} — Personel Giriş/Çıkış Logları
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-xl">
                    Kapı giriş-çıkış logları ile işçi giriş/çıkış talepleri bu taşeron altında birikir. Ana firma (Kibritçi İnşaat) kayıtları buraya karışmaz.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-[8px] font-bold text-slate-400 uppercase block">Başlangıç</label>
                    <input type="date" value={logFiltreBaslangic} onChange={(e) => setLogFiltreBaslangic(e.target.value)} className="text-xs p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="text-[8px] font-bold text-slate-400 uppercase block">Bitiş</label>
                    <input type="date" value={logFiltreBitis} onChange={(e) => setLogFiltreBitis(e.target.value)} className="text-xs p-2 border rounded-lg" />
                  </div>
                  <button type="button" onClick={handleTaseronLogRapor} className="px-3 py-2 bg-slate-900 text-white text-[10px] font-bold rounded-xl cursor-pointer flex items-center gap-1">
                    <Download size={12} /> Rapor
                  </button>
                  <button type="button" onClick={handleTaseronLogWp} className="px-3 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded-xl cursor-pointer flex items-center gap-1">
                    <MessageCircle size={12} /> WP Gönder
                  </button>
                </div>
              </div>

              {taseronPersonelLoglari.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs">
                  Seçili tarih aralığında bu taşeron için kapı / işçi logu bulunamadı.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[9px] font-bold">
                      <tr>
                        <th className="p-3 border-b w-8">
                          <input
                            type="checkbox"
                            checked={selectedLogIds.length === taseronPersonelLoglari.length && taseronPersonelLoglari.length > 0}
                            onChange={() => {
                              setSelectedLogIds((prev) =>
                                prev.length === taseronPersonelLoglari.length
                                  ? []
                                  : taseronPersonelLoglari.map((l) => l.id)
                              );
                            }}
                          />
                        </th>
                        <th className="p-3 border-b">Kaynak</th>
                        <th className="p-3 border-b">Personel</th>
                        <th className="p-3 border-b">Tip / Durum</th>
                        <th className="p-3 border-b">Zaman</th>
                        <th className="p-3 border-b">Detay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taseronPersonelLoglari.map((l) => (
                        <tr key={l.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedLogIds.includes(l.id)}
                              onChange={() =>
                                setSelectedLogIds((prev) =>
                                  prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                                )
                              }
                            />
                          </td>
                          <td className="p-3">
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                              l.kaynak === 'KAPI' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-900'
                            }`}>
                              {l.kaynak}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{l.ad} {l.soyad}</td>
                          <td className="p-3 font-mono text-slate-700">{l.tip}</td>
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{formatZamanTr(l.zaman)}</td>
                          <td className="p-3 text-slate-500">{l.detay || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {subPage === 'arsiv' && selectedTaseron && (
            <div className="space-y-3">
              {arsivRaporlari.length === 0 ? (
                <div className="bg-white border rounded-2xl p-8 text-center text-slate-400 text-xs">Henüz rapor yok.</div>
              ) : (
                arsivRaporlari.map((r) => (
                  <div key={r.id} className="bg-white border rounded-2xl p-4 flex flex-wrap justify-between gap-3 items-start">
                    <div>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 uppercase">{r.kesintiTipi || 'IS_MAKINESI'}</span>
                      <p className="text-xs font-bold mt-1">{r.taseronFirmaAdi} · {ayAdi(Number(r.donemAy))} {r.donemYil}</p>
                      <p className="text-[10px] text-slate-500">{r.onayDurumu} · {r.kesintiTipi === 'YEMEK' ? 'Adet raporu' : `${r.kesintiTutari.toLocaleString('tr-TR')} TL`}</p>
                    </div>
                    <div className="flex gap-1">
                      {r.kesintiTipi === 'IS_MAKINESI' && !r.ucretOnayBekliyor && (
                        <>
                          <button type="button" onClick={() => yazdirIsMakinesiRaporu(r)} className="p-2 border rounded-lg hover:bg-slate-50 cursor-pointer" title="Yazdır"><Printer size={14} /></button>
                          <button type="button" onClick={() => indirIsMakinesiRaporu(r)} className="p-2 border rounded-lg hover:bg-slate-50 cursor-pointer" title="İndir"><Download size={14} /></button>
                          <button type="button" onClick={() => mailtoForRapor(`Kibritçi — ${r.taseronFirmaAdi} İş Makinesi Kesinti`, '', r)} className="p-2 border rounded-lg hover:bg-slate-50 cursor-pointer" title="E-posta"><Mail size={14} /></button>
                        </>
                      )}
                      {r.kesintiTipi === 'ENERJI' && r.enerjiDetay && (
                        <button type="button" onClick={() => downloadKibritciReportHtml(buildEnerjiKesintiReportHtml(r.taseronFirmaAdi, Number(r.donemAy), Number(r.donemYil), r.enerjiDetay!), `enerji_${r.id}.html`)} className="p-2 border rounded-lg cursor-pointer"><Download size={14} /></button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TaseronKesintiScreen;
