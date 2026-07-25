import React, { useState, useEffect, useMemo } from 'react';
import { 
  Truck, Tent, Building2, FileText, Users, Mail, Package,
  Plus, Trash2, ShieldAlert, Award, FileUp, CheckCircle, Check, HelpCircle, ClipboardList,
  Printer, Download, Upload, Send, Search
} from 'lucide-react';
import { CorporateReportLayout } from './CorporateReportLayout';
import { kibritciLogoHtml } from '../lib/kibritciBrand';
import { 
  AracBakim, Demisbas, Tahsis, KampOdasi, KampKaydi, KampSarf, KampFaaliyet,
  SahaFaaliyeti, HazirTutanak, CariKart, StokKart, EpostaGonderim, Personel,
  KampYerleske, KampKat, SahaGunRaporArsiv, SahaFaaliyetTipi, AylikYoklamaMap,
  ProgramliFaaliyet
} from '../types/erp';
import { db, auth } from '../lib/firebase';
import { SahaKolajScreen } from './SahaKolajScreen';
import { ProgramliFaaliyetScreen } from './ProgramliFaaliyetScreen';
import {
  createKampYerleske,
  createKampKat,
  createKampOdasi,
  deleteKampOdasi,
  deleteYerleskeCascade,
  deleteKatCascade,
  deriveCampusNames,
  deriveCampusFloors,
  findOrCreateYerleske,
  updateKampYerleskeAdi,
  updateKampKatAdi,
  updateKampOdasi,
} from '../lib/kampYapisi';
import { assignKampResident, evictKampResident, suggestPersonelKaydi } from '../lib/kampPlacementUtils';
import {
  auditKampYerlesimCounts,
  buildKampFirmaOzeti,
  printKampFirmaYerlesim,
} from '../lib/kampFirmaOzet';
import { exportKampYerlesimExcel } from '../lib/kampYerlesimExcelExport';
import { generateKampPersonelPdfHtml } from '../lib/kampPersonelPdfExport';
import { openKampKrokiPrintWindow, type KampKrokiPageFormat } from '../lib/kampKrokiPrintHtml';
import { compressImage } from '../lib/imageCompress';
import { warnIfDuplicateCari, warnIfDuplicateStok } from '../lib/duplicateNameUtils';
import { exportHistoryReport } from '../lib/reportExport';
import { collection, onSnapshot, getDocs, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { PARSEL_BLOK_MAP, defaultBlokForParsel } from '../data/parselBlokMap';
import { normalizeDateKey, todayDateKey } from '../lib/dateKeyUtils';
import { getYoklamaDay, isTaseronPersonel, isIdariPersonel } from '../lib/yoklamaUtils';
import {
  applySahaMesaiToYoklama,
  formatMesaiFaaliyetLabel,
  getFaaliyetFoto,
  getFaaliyetFotolar,
  isMesaiSahaFaaliyet,
  MAX_SAHA_FOTO_COUNT,
  normalizeMesaiHours as normalizeSahaMesaiHours,
} from '../lib/sahaFaaliyetUtils';
import {
  listSahaFaaliyetArchives,
  restoreSahaFaaliyetFromArchive,
  SahaFaaliyetArchiveEntry,
} from '../lib/sahaFaaliyetPersistence';
import type { SahaFaaliyetSaveSource } from '../lib/sahaFaaliyetPersistence';
import { ParselBlokAnalizPanel } from './ParselBlokAnalizPanel';
import { KampFaaliyetTakipTab } from './KampFaaliyetTakipTab';
import { KampKrokiGorunumTab } from './KampKrokiGorunumTab';

interface IdariScreenProps {
  currentSubTab: string; // arac, kamp, saha, tutanak, cari_stok, eposta
  araclar: AracBakim[];
  setAraclar: React.Dispatch<React.SetStateAction<AracBakim[]>>;
  demirbaslar: Demisbas[];
  setDemirbaslar: React.Dispatch<React.SetStateAction<Demisbas[]>>;
  kampOdalari: KampOdasi[];
  setKampOdalari: React.Dispatch<React.SetStateAction<KampOdasi[]>>;
  kampKayitlari: KampKaydi[];
  setKampKayitlari: React.Dispatch<React.SetStateAction<KampKaydi[]>>;
  reloadKampData?: () => Promise<void>;
  kampYerleskeleri?: KampYerleske[];
  kampKatlari?: KampKat[];
  sahaFaaliyetleri: SahaFaaliyeti[];
  setSahaFaaliyetleri: React.Dispatch<React.SetStateAction<SahaFaaliyeti[]>>;
  saveSahaFaaliyetNow?: (
    record: SahaFaaliyeti,
    kaynak?: SahaFaaliyetSaveSource
  ) => Promise<unknown>;
  removeSahaFaaliyetNow?: (record: SahaFaaliyeti) => Promise<unknown>;
  hazirTutanaklar: HazirTutanak[];
  setHazirTutanaklar: React.Dispatch<React.SetStateAction<HazirTutanak[]>>;
  cariKartlar: CariKart[];
  setCariKartlar: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar: React.Dispatch<React.SetStateAction<StokKart[]>>;
  epostaGonderimleri: EpostaGonderim[];
  setEpostaGonderimleri: React.Dispatch<React.SetStateAction<EpostaGonderim[]>>;
  personeller: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
  aracKmLoglari: any[];
  setAracKmLoglari: (updater: any) => void;
  yoklamalar?: AylikYoklamaMap;
  setYoklamalar?: React.Dispatch<React.SetStateAction<AylikYoklamaMap>>;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  programliFaaliyetler?: ProgramliFaaliyet[];
  setProgramliFaaliyetler?: (
    updater: ProgramliFaaliyet[] | ((prev: ProgramliFaaliyet[]) => ProgramliFaaliyet[])
  ) => void;
}

interface FormenGunlukRaporKaydi {
  id: string;
  tarih: string;
  guncellenmeTarihi?: string;
  olusturulma?: string;
  gonderen?: string;
  gonderenFormen?: string;
  toplamEkip?: number;
  genelNotlar?: string;
  ozetMetin?: string;
  faaliyetler?: any[];
}

export const IdariScreen: React.FC<IdariScreenProps> = ({
  currentSubTab,
  araclar, setAraclar,
  demirbaslar, setDemirbaslar,
  kampOdalari, setKampOdalari,
  kampKayitlari, setKampKayitlari,
  reloadKampData,
  kampYerleskeleri = [],
  kampKatlari = [],
  sahaFaaliyetleri, setSahaFaaliyetleri,
  saveSahaFaaliyetNow,
  removeSahaFaaliyetNow,
  hazirTutanaklar, setHazirTutanaklar,
  cariKartlar, setCariKartlar,
  stokKartlar, setStokKartlar,
  epostaGonderimleri, setEpostaGonderimleri,
  personeller,
  setPersoneller,
  aracKmLoglari,
  setAracKmLoglari,
  yoklamalar = {},
  setYoklamalar,
  saveYoklamalarNow,
  programliFaaliyetler = [],
  setProgramliFaaliyetler
}) => {

  // ─────────────────────────────────────────────────────────────
  // 🚛 1. ARAÇ & DEMİRBAŞ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [activeAracSub, setActiveAracSub] = useState<'arac' | 'demirbas'>('arac');
  const [aracSubTab, setAracSubTab] = useState<'liste' | 'km_takip'>('liste');
  const [selectedAracForPdf, setSelectedAracForPdf] = useState<AracBakim | null>(null);
  const [showKampKrokiModal, setShowKampKrokiModal] = useState(false);
  const [exportingKampExcel, setExportingKampExcel] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);



  const [formKmPlaka, setFormKmPlaka] = useState("34 KBR 888");
  const [formKmTarih, setFormKmTarih] = useState(new Date().toISOString().split('T')[0]);
  const [formKmDriver, setFormKmDriver] = useState("Ayhan Yılmaz");
  const [formSabahKm, setFormSabahKm] = useState(41580);
  const [formAksamKm, setFormAksamKm] = useState(0);
  const [formKmAciklama, setFormKmAciklama] = useState("");

  const [editingKmLog, setEditingKmLog] = useState<any | null>(null);

  const handleUndoKmLog = (logId: string) => {
    const logToUndo = aracKmLoglari.find(lg => lg.id === logId);
    if (!logToUndo) return;

    if (window.confirm(`${logToUndo.plaka} plakalı aracın ${logToUndo.tarih} tarihli KM kaydını GERİ ALMAK (silmek) istediğinize emin misiniz? Aracın mevcut KM sayacı ${logToUndo.sabahKm} olarak geri yüklenecektir.`)) {
      setAraclar(prev => prev.map(a => {
        if (a.plaka === logToUndo.plaka) {
          return {
            ...a,
            mevcutKm: logToUndo.sabahKm
          };
        }
        return a;
      }));

      setAracKmLoglari(prev => prev.filter(lg => lg.id !== logId));
      alert("KM kaydı başarıyla silindi ve araç sayacı geri alındı.");
    }
  };

  const handleUpdateKmLog = (updatedLog: any) => {
    if (Number(updatedLog.aksamKm) < Number(updatedLog.sabahKm)) {
      alert("Hata: Akşam kilometresi, sabah kilometresinden küçük olamaz.");
      return;
    }

    const diff = Number(updatedLog.aksamKm) - Number(updatedLog.sabahKm);
    setAracKmLoglari(prev => prev.map(lg => lg.id === updatedLog.id ? { ...updatedLog, fark: diff } : lg));

    setAraclar(prev => prev.map(a => {
      if (a.plaka === updatedLog.plaka) {
        return {
          ...a,
          mevcutKm: Number(updatedLog.aksamKm)
        };
      }
      return a;
    }));

    setEditingKmLog(null);
    alert("Kilometre kaydı ve araç sayacı başarıyla güncellendi.");
  };

  const handleCreateKmLog = () => {
    if (!formKmPlaka || !formKmDriver || formSabahKm <= 0 || formAksamKm <= 0) {
      alert("Lütfen araç plakası, sürücü/sorumlu ismi, sabah ve akşam kilometre değerlerini doldurunuz.");
      return;
    }
    if (Number(formAksamKm) < Number(formSabahKm)) {
      alert("Hata: Akşam kilometresi, sabah kilometresinden küçük olamaz.");
      return;
    }

    const diff = Number(formAksamKm) - Number(formSabahKm);
    const newLog = {
      id: `log_${Date.now()}`,
      tarih: formKmTarih,
      plaka: formKmPlaka,
      surucu: formKmDriver,
      sabahKm: Number(formSabahKm),
      aksamKm: Number(formAksamKm),
      fark: diff,
      aciklama: formKmAciklama.trim() || 'Sabah-Akşam seyrüsefer kaydı.'
    };

    setAracKmLoglari(prev => [newLog, ...prev]);

    // Update the vehicle's current KM
    setAraclar(prev => prev.map(a => {
      if (a.plaka === formKmPlaka) {
        const futureKm = Number(formAksamKm);
        if (a.yagBakimKm && futureKm >= a.yagBakimKm - 500) {
          alert(`⚠️ DİKKAT: ${a.plaka} plakalı aracın Yağ Değişim Bakımı (${a.yagBakimKm} KM) yaklaşmıştır veya geçmiştir! Mevcut: ${futureKm} KM`);
        }
        return {
          ...a,
          mevcutKm: futureKm
        };
      }
      return a;
    }));

    setFormSabahKm(Number(formAksamKm));
    setFormAksamKm(0);
    setFormKmAciklama("");
    alert("Sabah - Akşam kilometre takibi kaydedildi, araç sayacı güncellendi.");
  };

  const [logPlaka, setLogPlaka] = useState("34 KBR 888");
  const [logKm, setLogKm] = useState(42000);
  
  // Create / Edit states for Vehicle
  const [newPlaka, setNewPlaka] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newAracType, setNewAracType] = useState<'ARAC' | 'IS_MAKINESI' | 'DEMIRBAS'>("ARAC");
  const [newSorumlu, setNewSorumlu] = useState("p2");
  const [newMuayene, setNewMuayene] = useState("");
  const [newYagKm, setNewYagKm] = useState(10000);
  const [newBakimKm, setNewBakimKm] = useState(15000);
  const [editingAracId, setEditingAracId] = useState<string | null>(null);

  const handleStartEditArac = (ar: AracBakim) => {
    setEditingAracId(ar.id);
    setNewPlaka(ar.plaka);
    setNewModel(ar.markaModel);
    setNewAracType(ar.aracTipi as any);
    setNewSorumlu(ar.sorumluPersonelId || "");
    setNewMuayene(ar.muayeneTarihi || "");
    setNewYagKm(ar.yagBakimKm || 10000);
    setNewBakimKm(ar.kmBakimAraligi || 15000);
  };

  const handleCancelEditArac = () => {
    setEditingAracId(null);
    setNewPlaka("");
    setNewModel("");
    setNewAracType("ARAC");
    setNewSorumlu("p2");
    setNewMuayene("");
    setNewYagKm(10000);
    setNewBakimKm(15000);
  };

  const handleMileageUpdate = (id: string, currentVal: number) => {
    const updatedVal = currentVal + 1200; // Simulating kilometers accumulation
    setAraclar(prev => prev.map(a => a.id === id ? { ...a, mevcutKm: updatedVal } : a));
    alert("Kilometre kaydedilip veritabanına işlendi. Bakım durumları güncellendi.");
  };

  const handleCreateArac = () => {
    if (!newPlaka) {
      alert("Lütfen araç plakasını yazın.");
      return;
    }

    if (editingAracId) {
      // Edit Mode
      setAraclar(prev => prev.map(a => {
        if (a.id === editingAracId) {
          return {
            ...a,
            plaka: newPlaka.toUpperCase(),
            aracTipi: newAracType,
            markaModel: newModel || "Standart Model",
            sorumluPersonelId: newSorumlu,
            kmBakimAraligi: Number(newBakimKm) || 10000,
            yagBakimKm: Number(newYagKm) || 11200,
            muayeneTarihi: newMuayene,
          };
        }
        return a;
      }));
      setEditingAracId(null);
      alert("Araç / demirbaş başarıyla güncellendi.");
    } else {
      // Create Mode
      const brandNew: AracBakim = {
        id: `a_${Date.now()}`,
        plaka: newPlaka.toUpperCase(),
        aracTipi: newAracType,
        markaModel: newModel || "Standart Model",
        sorumluPersonelId: newSorumlu,
        mevcutKm: 1200,
        kmBakimAraligi: Number(newBakimKm) || 10000,
        yagBakimKm: Number(newYagKm) || 11200,
        muayeneTarihi: newMuayene || new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        sigortaTarihi: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        durum: "AKTIF",
        notlar: "Sisteme yeni eklenen şantiye demirbaşı."
      };
      setAraclar(prev => [brandNew, ...prev]);
      alert("Yeni araç / makine başarıyla kaydedildi.");
    }

    // Reset Form Fields
    setNewPlaka("");
    setNewModel("");
    setNewAracType("ARAC");
    setNewSorumlu("p2");
    setNewMuayene("");
    setNewYagKm(10000);
    setNewBakimKm(15000);
  };

  // ─────────────────────────────────────────────────────────────
  // 🏕️ 2. KAMP YÖNETİMİ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [selectedRoomToAssign, setSelectedRoomToAssign] = useState<KampOdasi | null>(null);
  const [residentInputName, setResidentInputName] = useState("");
  const [residentSearchQuery, setResidentSearchQuery] = useState("");
  const [residentInputFirma, setResidentInputFirma] = useState("");
  const [residentPersonelId, setResidentPersonelId] = useState("");
  const [residentFirmaTipi, setResidentFirmaTipi] = useState<'ANA_FIRMA' | 'TASERON'>('ANA_FIRMA');
  const [residentFirmaKaynak, setResidentFirmaKaynak] = useState<'DB' | 'MANUAL'>('MANUAL');
  const [assigningResident, setAssigningResident] = useState(false);
  const filteredResidentPersoneller = useMemo(() => {
    const q = residentSearchQuery.trim().toLocaleLowerCase('tr-TR');
    return personeller.filter((p) => {
      const isPasif = p.durum === false || String(p.durum).toLowerCase() === 'false' || String(p.durum).toLowerCase() === 'pasif';
      if (isPasif) return false;
      if (!q) return true;
      const fullName = `${p.ad || ''} ${p.soyad || ''}`.toLocaleLowerCase('tr-TR');
      return (
        fullName.includes(q) ||
        String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(p.firmaAdi || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [personeller, residentSearchQuery]);

  const yerleskeler = kampYerleskeleri;
  const katlar = kampKatlari;

  const campuses = useMemo(
    () => deriveCampusNames(yerleskeler),
    [yerleskeler]
  );

  const campusFloors = useMemo(
    () => deriveCampusFloors(campuses, katlar),
    [campuses, katlar]
  );

  const groupedKampYapisi = useMemo(() => {
    const campusMap = new Map<string, { campus: string; floors: Array<{ floor: string; rooms: KampOdasi[] }> }>();

    const ensureCampus = (name: string) => {
      if (!campusMap.has(name)) {
        campusMap.set(name, { campus: name, floors: [] });
      }
      return campusMap.get(name)!;
    };

    const floorSort = (a: string, b: string) =>
      a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
    const roomSort = (a: KampOdasi, b: KampOdasi) =>
      (a.odaNo || '').localeCompare(b.odaNo || '', 'tr', { numeric: true, sensitivity: 'base' });

    for (const campus of campuses) {
      ensureCampus(campus);
    }
    for (const room of kampOdalari) {
      ensureCampus(room.yerleskeAdi || 'Bilinmeyen Yerleşke');
    }

    for (const [campusName, node] of campusMap.entries()) {
      const floorNames = new Set<string>([
        ...(campusFloors[campusName] || []),
        ...kampOdalari
          .filter((r) => r.yerleskeAdi === campusName)
          .map((r) => r.kogusNo)
          .filter(Boolean),
      ]);

      node.floors = Array.from(floorNames)
        .sort(floorSort)
        .map((floor) => ({
          floor,
          rooms: kampOdalari
            .filter((r) => r.yerleskeAdi === campusName && r.kogusNo === floor)
            .sort(roomSort),
        }));
    }

    return Array.from(campusMap.values()).sort((a, b) => floorSort(a.campus, b.campus));
  }, [campuses, campusFloors, kampOdalari]);

  const taseronCariler = useMemo(
    () => cariKartlar.filter((c) => {
      const tip = String((c as any).kartTipi || (c as any).tur || '').trim().toLocaleUpperCase('tr-TR');
      return tip === 'TASERON' && c.durum === 'AKTIF';
    }),
    [cariKartlar]
  );

  const uniqueTaseronFirms = useMemo(() => {
    const firms = new Set<string>();
    kampKayitlari.filter(k => k.durum === 'AKTIF').forEach(k => {
      const p = personeller.find(p => p.id === k.personelId);
      const isAnaFirma = k.firmaTipi === 'ANA_FIRMA' || 
        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'KİBRİTÇİ İNŞAAT') ||
        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FİRMA') ||
        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FIRMA') ||
        (p?.firmaTipi === 'ANA_FIRMA');
      
      const fName = isAnaFirma ? 'KİBRİTÇİ İNŞAAT' : (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') || p?.firmaAdi?.trim().toLocaleUpperCase('tr-TR') || 'TAŞERON');
      firms.add(fName);
    });
    return Array.from(firms).sort();
  }, [kampKayitlari, personeller]);

  /** Firma bazında aktif kadro + kampta kalan özeti */
  const kampFirmaOzeti = useMemo(
    () => buildKampFirmaOzeti(personeller, kampKayitlari),
    [personeller, kampKayitlari]
  );
  const kampFirmaOzetToplam = useMemo(
    () => ({
      calisan: kampFirmaOzeti.reduce((s, r) => s + r.toplamCalisan, 0),
      kampta: kampFirmaOzeti.reduce((s, r) => s + r.kampta, 0),
    }),
    [kampFirmaOzeti]
  );
  const kampYerlesimAudit = useMemo(
    () => auditKampYerlesimCounts(personeller, kampKayitlari),
    [personeller, kampKayitlari]
  );

  const [selectedYerleske, setSelectedYerleske] = useState("");
  const [selectedKat, setSelectedKat] = useState("");
  
  const [campCreationStep, setCampCreationStep] = useState<'campus' | 'floor' | 'room'>('room');
  const [kampMainView, setKampMainView] = useState<'odalar' | 'faaliyet' | 'personel' | 'kroki'>('odalar');
  const [kampPersonelSearch, setKampPersonelSearch] = useState('');
  const [kampPersonelFirmFilter, setKampPersonelFirmFilter] = useState('');
  const [newCampusInput, setNewCampusInput] = useState("");
  const [newFloorInput, setNewFloorInput] = useState("");

  useEffect(() => {
    if (campuses.length > 0 && !selectedYerleske) {
      setSelectedYerleske(campuses[0]);
    }
  }, [campuses, selectedYerleske]);

  useEffect(() => {
    const floorsOfSelected = campusFloors[selectedYerleske] || [];
    if (floorsOfSelected.length > 0 && !floorsOfSelected.includes(selectedKat)) {
      setSelectedKat(floorsOfSelected[0]);
    } else if (floorsOfSelected.length === 0) {
      setSelectedKat("");
    }
  }, [selectedYerleske, campusFloors, selectedKat]);

  const [showNewRoomForm, setShowNewRoomForm] = useState(false);
  const [newRoomNo, setNewRoomNo] = useState("");
  const [newRoomKapasite, setNewRoomKapasite] = useState(4);
  const [newRoomFirma, setNewRoomFirma] = useState<'ANA_FIRMA' | 'TASERON'>("ANA_FIRMA");

  const handleDeleteRoom = async (id: string) => {
    if (!window.confirm("Bu odayı ve odaya ait olan tüm konaklama kayıtlarını sistemden silmek istediğinize emin misiniz?")) return;
    try {
      await deleteKampOdasi(id);
      setKampOdalari((prev) => prev.filter((r) => r.id !== id));
      setKampKayitlari((prev) => prev.filter((kk) => kk.odaId !== id && kk.roomId !== id));
      alert("Oda kaydı ve sakin yerleşimleri başarıyla kaldırıldı.");
    } catch {
      alert("Oda silinirken hata oluştu.");
    }
  };

  const handleReloadKampData = async () => {
    if (!reloadKampData) return;
    try {
      await reloadKampData();
      alert('Kamp verileri yenilendi.');
    } catch (err) {
      console.error(err);
      alert('Kamp verileri yenilenemedi.');
    }
  };

  const handleExportKampYerlesimExcel = async () => {
    if (kampOdalari.length === 0) {
      alert('Excel raporu için önce en az bir oda tanımlanmalıdır.');
      return;
    }
    setExportingKampExcel(true);
    try {
      await exportKampYerlesimExcel({
        yerleskeler,
        katlar,
        kampOdalari,
        kampKayitlari,
        personeller,
      });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Kamp yerleşim Excel raporu oluşturulamadı.');
    } finally {
      setExportingKampExcel(false);
    }
  };

  const handleDeleteCampus = async (campName: string) => {
    if (!window.confirm(`"${campName}" yerleşkesini ve bu yerleşkeye bağlı tüm odaları ve sakin kayıtlarını silmek istediğinize emin misiniz?`)) return;
    try {
      const roomsToDelete = await deleteYerleskeCascade(campName, yerleskeler, katlar, kampOdalari);
      setKampOdalari((prev) => prev.filter((r) => r.yerleskeAdi !== campName));
      setKampKayitlari((prev) => prev.filter((kk) => !roomsToDelete.includes(kk.odaId) && !roomsToDelete.includes(kk.roomId)));
      if (selectedYerleske === campName) {
        const remaining = campuses.filter((c) => c !== campName);
        setSelectedYerleske(remaining[0] ?? "");
      }
      alert(`"${campName}" yerleşkesi başarıyla silindi.`);
    } catch {
      alert("Yerleşke silinirken hata oluştu.");
    }
  };

  const handleDeleteFloor = async (campName: string, floorName: string) => {
    if (!window.confirm(`"${campName}" altındaki "${floorName}" katını/bloğunu ve bağlı tüm odaları silmek istediğinize emin misiniz?`)) return;
    try {
      const roomsToDelete = await deleteKatCascade(campName, floorName, katlar, kampOdalari);
      setKampOdalari((prev) => prev.filter((r) => !(r.yerleskeAdi === campName && r.kogusNo === floorName)));
      setKampKayitlari((prev) => prev.filter((kk) => !roomsToDelete.includes(kk.odaId) && !roomsToDelete.includes(kk.roomId)));
      if (selectedKat === floorName) {
        const remaining = (campusFloors[campName] || []).filter((f) => f !== floorName);
        setSelectedKat(remaining[0] ?? "");
      }
      alert(`"${floorName}" katı/bloğu başarıyla silindi.`);
    } catch {
      alert("Kat silinirken hata oluştu.");
    }
  };

  const handleCreateCampus = async () => {
    const trimmed = newCampusInput.trim();
    if (!trimmed) {
      alert("Lütfen geçerli bir Yerleşke adı girin!");
      return;
    }
    if (campuses.includes(trimmed)) {
      alert("Bu yerleşke zaten tanımlı!");
      return;
    }
    try {
      await createKampYerleske(trimmed);
      setSelectedYerleske(trimmed);
      setNewCampusInput("");
      setCampCreationStep('floor');
      alert(`"${trimmed}" yerleşkesi başarıyla eklendi! Şimdi bu yerleşke için kat oluşturabilirsiniz.`);
    } catch {
      alert("Yerleşke oluşturulamadı.");
    }
  };

  const handleCreateFloor = async () => {
    const trimmed = newFloorInput.trim();
    if (!selectedYerleske) {
      alert("Lütfen önce bir yerleşke seçin veya ekleyin!");
      return;
    }
    if (!trimmed) {
      alert("Lütfen geçerli bir Kat/Blok adı girin!");
      return;
    }
    const currentFloors = campusFloors[selectedYerleske] || [];
    if (currentFloors.includes(trimmed)) {
      alert("Bu kat/blok bu yerleşkede zaten tanımlı!");
      return;
    }
    try {
      const yerleske = await findOrCreateYerleske(selectedYerleske);
      await createKampKat(yerleske, trimmed, currentFloors.length + 1);
      setSelectedKat(trimmed);
      setNewFloorInput("");
      setCampCreationStep('room');
      alert(`"${trimmed}" katı, "${selectedYerleske}" yerleşkesine başarıyla eklendi! Şimdi oda açabilirsiniz.`);
    } catch {
      alert("Kat oluşturulamadı.");
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedYerleske) {
      alert("Lütfen önce bir Yerleşke oluşturun veya seçin.");
      return;
    }
    if (!selectedKat) {
      alert("Lütfen önce seçili yerleşkeye bir Kat/Blok oluşturun veya seçin.");
      return;
    }
    if (!newRoomNo) {
      alert("Lütfen oda numarası giriniz.");
      return;
    }
    try {
      const roomNo = newRoomNo;
      await createKampOdasi({
        yerleskeAdi: selectedYerleske,
        kogusNo: selectedKat,
        odaNo: roomNo,
        kapasite: Number(newRoomKapasite),
        firmaTipi: newRoomFirma,
      });
      setNewRoomNo("");
      setShowNewRoomForm(false);
      alert(`${selectedYerleske} - ${selectedKat} bünyesinde Oda No ${roomNo} başarıyla açılmıştır.`);
    } catch {
      alert("Oda oluşturulurken hata oluştu.");
    }
  };

  const handleEditCampus = async (campName: string) => {
    const y = yerleskeler.find((item) => item.ad === campName);
    if (!y) return;
    const yeniAd = window.prompt('Yeni yerleşke adı:', campName);
    if (!yeniAd?.trim() || yeniAd.trim() === campName) return;
    try {
      await updateKampYerleskeAdi(y, yeniAd.trim());
      if (selectedYerleske === campName) setSelectedYerleske(yeniAd.trim());
      alert('Yerleşke adı güncellendi.');
    } catch {
      alert('Yerleşke güncellenemedi.');
    }
  };

  const handleEditFloor = async (campName: string, floorName: string) => {
    const kat = katlar.find((k) => k.yerleskeAdi === campName && k.ad === floorName);
    if (!kat) return;
    const yeniAd = window.prompt('Yeni kat/blok adı:', floorName);
    if (!yeniAd?.trim() || yeniAd.trim() === floorName) return;
    try {
      await updateKampKatAdi(kat, yeniAd.trim());
      if (selectedKat === floorName) setSelectedKat(yeniAd.trim());
      alert('Kat/blok adı güncellendi.');
    } catch {
      alert('Kat güncellenemedi.');
    }
  };

  const handleEditRoom = async (room: KampOdasi) => {
    const yeniOdaNo = window.prompt('Yeni oda adı/no:', room.odaNo);
    if (!yeniOdaNo) return;
    const yeniKapasiteRaw = window.prompt('Yeni kapasite (yatak):', String(room.kapasite));
    if (!yeniKapasiteRaw) return;
    const yeniKapasite = Number(yeniKapasiteRaw);
    if (!Number.isFinite(yeniKapasite) || yeniKapasite < 1) {
      alert('Kapasite en az 1 olmalıdır.');
      return;
    }
    try {
      await updateKampOdasi({
        room,
        odaNo: yeniOdaNo.trim(),
        kapasite: yeniKapasite,
      });
      alert('Oda bilgisi güncellendi.');
    } catch (err) {
      console.error(err);
      alert('Oda güncellenemedi.');
    }
  };

  const resetAssignModal = () => {
    setSelectedRoomToAssign(null);
    setResidentInputName('');
    setResidentSearchQuery('');
    setResidentInputFirma('');
    setResidentPersonelId('');
    setResidentFirmaTipi('ANA_FIRMA');
    setResidentFirmaKaynak('MANUAL');
  };

  const handleAssignResident = async () => {
    if (!selectedRoomToAssign || !residentInputName.trim()) return;

    const firma =
      residentFirmaTipi === 'ANA_FIRMA'
        ? 'KİBRİTÇİ İNŞAAT'
        : residentFirmaKaynak === 'DB'
          ? residentInputFirma
          : residentInputFirma.trim();

    if (residentFirmaTipi === 'TASERON' && !firma) {
      alert('Taşeron personel için firma bilgisi zorunludur.');
      return;
    }

    setAssigningResident(true);
    try {
      await assignKampResident({
        roomId: selectedRoomToAssign.id,
        personelIsim: residentInputName.trim(),
        personelId: residentPersonelId || undefined,
        calistigiFirma: firma || undefined,
        firmaTipi: residentFirmaTipi,
        kampOdalari,
        kampKayitlari,
      });

      if (!residentPersonelId) {
        const targetFirma = residentFirmaTipi === 'ANA_FIRMA' ? 'KİBRİTÇİ İNŞAAT' : firma;
        suggestPersonelKaydi(residentInputName.trim(), targetFirma, () => {
          if (setPersoneller) {
            const isimTrim = residentInputName.trim();
            const parts = isimTrim.split(/\s+/);
            const ad = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
            const soyad = parts.length > 1 ? parts[parts.length - 1] : '';
            
            const newPersonel = {
              id: `p_${Date.now()}`,
              tcNo: '',
              ad: ad,
              soyad: soyad,
              babaAdi: '',
              dogumTarihi: '',
              telefonNo: '',
              eposta: '',
              adres: '',
              il: '',
              ilce: '',
              departman: 'ŞANTİYE',
              gorev: 'DÜZ İŞÇİ',
              iseGirisTarihi: new Date().toISOString().split('T')[0],
              cinsiyet: 'Erkek',
              maas: 30000,
              ucretTipi: 'Aylık' as const,
              sgkDurumu: "SGK'lı" as const,
              bankaAdi: '',
              subeAdi: '',
              ibanNo: '',
              durum: true,
              firmaTipi: residentFirmaTipi,
              firmaAdi: targetFirma,
            };
            setPersoneller(prev => [newPersonel, ...prev]);
            alert(`"${isimTrim}" isimli personel ${targetFirma} kaydıyla Personel veritabanına eklendi.`);
          }
        });
      }

      resetAssignModal();
      alert('Personel seçilen odaya başarıyla yerleştirildi.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Yerleşim kaydedilemedi.');
    } finally {
      setAssigningResident(false);
    }
  };

  const handleEvictResident = async (reg: KampKaydi) => {
    if (!window.confirm('Seçili personeli odadan tahliye etmek istediğinize emin misiniz?')) return;
    try {
      await evictKampResident(reg, kampOdalari, kampKayitlari);
      alert('Tahliye işlemi gerçekleşti.');
    } catch {
      alert('Tahliye sırasında hata oluştu.');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🏢 3. SAHA FAALİYETLERİ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [sahaTabView, setSahaTabView] = useState<'KOLAJ' | 'KAYIT' | 'PROGRAM'>('KAYIT');
  const [sahaKayitTarihi, setSahaKayitTarihi] = useState(todayDateKey());
  const [sahaNitelik, setSahaNitelik] = useState("");
  const [sahaParsel, setSahaParsel] = useState("GENEL SAHA");
  const [sahaBlok, setSahaBlok] = useState(defaultBlokForParsel('GENEL SAHA'));
  const [sahaAciklama, setSahaAciklama] = useState("");
  const [sahaUstaSayisi, setSahaUstaSayisi] = useState<number>(0);
  const [sahaIsciSayisi, setSahaIsciSayisi] = useState<number>(0);
  const [sahaFotoUrls, setSahaFotoUrls] = useState<string[]>([]);
  const [faaliyetTipi, setFaaliyetTipi] = useState<SahaFaaliyetTipi>('NORMAL');
  const [personelMesaiSaatleri, setPersonelMesaiSaatleri] = useState<Record<string, number>>({});
  
  // Selected daily/monthly field worker selection
  const [selectedFieldStaff, setSelectedFieldStaff] = useState<string[]>([]);
  const [sahaStaffSearch, setSahaStaffSearch] = useState('');
  
  const [sahaSearchKeyword, setSahaSearchKeyword] = useState("");
  const [editingSahaId, setEditingSahaId] = useState<string | null>(null);
  const [deleteConfirmSahaId, setDeleteConfirmSahaId] = useState<string | null>(null);
  const [sahaArchiveOpen, setSahaArchiveOpen] = useState(false);
  const [sahaArchives, setSahaArchives] = useState<SahaFaaliyetArchiveEntry[]>([]);
  const [sahaArchiveLoading, setSahaArchiveLoading] = useState(false);
  const [sahaArchiveRestoringId, setSahaArchiveRestoringId] = useState<string | null>(null);
  const [sahaSubTab, setSahaSubTab] = useState<'tum' | 'formen' | 'takvim' | 'gun_arsiv' | 'parsel_analiz'>('tum');
  const [sahaTakvimAy, setSahaTakvimAy] = useState(new Date().toISOString().slice(0, 7));
  const [showSahaGunModal, setShowSahaGunModal] = useState(false);
  const [selectedSahaGun, setSelectedSahaGun] = useState(new Date().toISOString().split('T')[0]);
  const [formenTarihFiltre, setFormenTarihFiltre] = useState('');
  const [tumKayitTarihFiltre, setTumKayitTarihFiltre] = useState('');
  const [gunArsivTarihFiltre, setGunArsivTarihFiltre] = useState('');
  const [gunRaporNotu, setGunRaporNotu] = useState('');
  const [sahaGunRaporArsivleri, setSahaGunRaporArsivleri] = useState<SahaGunRaporArsiv[]>([]);
  const [formenGunlukRaporlari, setFormenGunlukRaporlari] = useState<FormenGunlukRaporKaydi[]>([]);

  const sahaKayitDateParts = useMemo(() => {
    const [y, m, d] = sahaKayitTarihi.split('-').map(Number);
    return { y, m, d };
  }, [sahaKayitTarihi]);

  const assignedPersonelOnKayitTarihi = useMemo(() => {
    const ids = new Set<string>();
    sahaFaaliyetleri.forEach((sf) => {
      if (normalizeDateKey(sf.tarih) !== sahaKayitTarihi) return;
      if (editingSahaId && sf.id === editingSahaId) return;
      (sf.aktifPersonelListesi || []).forEach((id) => ids.add(id));
    });
    return ids;
  }, [sahaFaaliyetleri, sahaKayitTarihi, editingSahaId]);

  const geldiPersonelOnKayitTarihi = useMemo(() => {
    const { y, m, d } = sahaKayitDateParts;
    if (!y || !m || !d) return [] as Personel[];
    return personeller.filter((p) => {
      if (isTaseronPersonel(p) || isIdariPersonel(p)) return false;
      const dayData = getYoklamaDay(yoklamalar[p.id], y, m, d);
      return dayData?.durum === 'Geldi';
    });
  }, [personeller, yoklamalar, sahaKayitDateParts]);

  const selectedFieldStaffList = useMemo(
    () => personeller.filter((p) => selectedFieldStaff.includes(p.id)),
    [personeller, selectedFieldStaff]
  );
  const filteredStaffPool = useMemo(() => {
    const q = sahaStaffSearch.trim().toLocaleLowerCase('tr-TR');
    return geldiPersonelOnKayitTarihi.filter((p) => {
      if (assignedPersonelOnKayitTarihi.has(p.id)) return false;
      if (!q) return true;
      return (
        `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR').includes(q) ||
        String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [geldiPersonelOnKayitTarihi, assignedPersonelOnKayitTarihi, sahaStaffSearch]);

  // Saha PDF Report parameters
  const [sahaReportModal, setSahaReportModal] = useState(false);
  const [sahaReportType, setSahaReportType] = useState<'GUNLUK' | 'AYLIK'>('GUNLUK');
  const [sahaReportDate, setSahaReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [sahaReportMonth, setSahaReportMonth] = useState(6); // June
  const [expandedFoto, setExpandedFoto] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // ✍️ SAHA RAPORU ELEKTRONİK ONAY SİSTEMİ STATES & FUNCTIONS
  // ─────────────────────────────────────────────────────────────
  const [sahaRaporOnaylari, setSahaRaporOnaylari] = useState<Record<string, any>>({});
  const [onayLoading, setOnayLoading] = useState(false);
  
  const [tempHazirlayan, setTempHazirlayan] = useState('');
  const [tempKontrolEden, setTempKontrolEden] = useState('');
  const [tempOnaylayan, setTempOnaylayan] = useState('');

  // Load from database (Firestore collection 'sahaRaporOnaylari')
  React.useEffect(() => {
    async function loadOnaylar() {
      try {
        const querySnapshot = await getDocs(collection(db, 'sahaRaporOnaylari'));
        const data: Record<string, any> = {};
        querySnapshot.forEach((doc) => {
          data[doc.id] = doc.data();
        });
        setSahaRaporOnaylari(data);
      } catch (err) {
        console.warn("Saha onay raporlari yuklenemedi, local fallback kullaniliyor...", err);
      }
    }
    loadOnaylar();
  }, []);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sahaGunRaporArsiv'), (snapshot) => {
      const list: SahaGunRaporArsiv[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as SahaGunRaporArsiv));
      list.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih), 'tr'));
      setSahaGunRaporArsivleri(list);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'gunlukSahaRaporlari'), (snapshot) => {
      const list: FormenGunlukRaporKaydi[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as FormenGunlukRaporKaydi;
        if (typeof data?.tarih !== 'string' || !data.tarih) return;
        list.push({ id: d.id, ...data });
      });
      list.sort((a, b) => {
        const aTs = new Date(a.guncellenmeTarihi || a.olusturulma || a.tarih).getTime();
        const bTs = new Date(b.guncellenmeTarihi || b.olusturulma || b.tarih).getTime();
        return bTs - aTs;
      });
      setFormenGunlukRaporlari(list);
    });
    return () => unsub();
  }, []);

  // Sync temp variables when selected daily report date changes
  React.useEffect(() => {
    const activeOnayKey = sahaReportType === 'GUNLUK' ? sahaReportDate : `AYLIK_2026_${sahaReportMonth}`;
    const activeOnay = sahaRaporOnaylari[activeOnayKey];
    if (activeOnay) {
      setTempHazirlayan(activeOnay.hazirlayanName || '');
      setTempKontrolEden(activeOnay.kontrolEdenName || '');
      setTempOnaylayan(activeOnay.onaylayanName || '');
    } else {
      setTempHazirlayan('');
      setTempKontrolEden('');
      setTempOnaylayan('');
    }
  }, [sahaReportDate, sahaReportType, sahaReportMonth, sahaRaporOnaylari]);

  const handleOnayla = async (role: 'hazirlayan' | 'kontrolEden' | 'onaylayan', name: string) => {
    if (!name.trim()) {
      alert("Lütfen isim soyisim giriniz!");
      return;
    }
    setOnayLoading(true);
    try {
      const activeOnayKey = sahaReportType === 'GUNLUK' ? sahaReportDate : `AYLIK_2026_${sahaReportMonth}`;
      const existing = sahaRaporOnaylari[activeOnayKey] || {
        id: activeOnayKey,
        tarih: activeOnayKey,
        hazirlayanName: "",
        hazirlayanSigned: false,
        hazirlayanDate: "",
        kontrolEdenName: "",
        kontrolEdenSigned: false,
        kontrolEdenDate: "",
        onaylayanName: "",
        onaylayanSigned: false,
        onaylayanDate: ""
      };

      const updated = { ...existing };
      if (role === 'hazirlayan') {
        updated.hazirlayanName = name.trim();
        updated.hazirlayanSigned = true;
        updated.hazirlayanDate = new Date().toLocaleString('tr-TR');
      } else if (role === 'kontrolEden') {
        updated.kontrolEdenName = name.trim();
        updated.kontrolEdenSigned = true;
        updated.kontrolEdenDate = new Date().toLocaleString('tr-TR');
      } else if (role === 'onaylayan') {
        updated.onaylayanName = name.trim();
        updated.onaylayanSigned = true;
        updated.onaylayanDate = new Date().toLocaleString('tr-TR');
      }

      await setDoc(doc(db, 'sahaRaporOnaylari', activeOnayKey), updated);
      
      setSahaRaporOnaylari(prev => ({
        ...prev,
        [activeOnayKey]: updated
      }));
    } catch (err) {
      console.error("Onay kayit hatasi:", err);
      alert("Onay işlemi kaydedilirken hata oluştu!");
    } finally {
      setOnayLoading(false);
    }
  };

  const handleTemizleOnay = async (role: 'hazirlayan' | 'kontrolEden' | 'onaylayan') => {
    setOnayLoading(true);
    try {
      const activeOnayKey = sahaReportType === 'GUNLUK' ? sahaReportDate : `AYLIK_2026_${sahaReportMonth}`;
      const existing = sahaRaporOnaylari[activeOnayKey];
      if (!existing) return;

      const updated = { ...existing };
      if (role === 'hazirlayan') {
        updated.hazirlayanName = "";
        updated.hazirlayanSigned = false;
        updated.hazirlayanDate = "";
      } else if (role === 'kontrolEden') {
        updated.kontrolEdenName = "";
        updated.kontrolEdenSigned = false;
        updated.kontrolEdenDate = "";
      } else if (role === 'onaylayan') {
        updated.onaylayanName = "";
        updated.onaylayanSigned = false;
        updated.onaylayanDate = "";
      }

      await setDoc(doc(db, 'sahaRaporOnaylari', activeOnayKey), updated);
      
      setSahaRaporOnaylari(prev => ({
        ...prev,
        [activeOnayKey]: updated
      }));
    } catch (err) {
      console.error("Onay sifirlama hatasi:", err);
      alert("Onay sıfırlanırken hata oluştu!");
    } finally {
      setOnayLoading(false);
    }
  };

  const handleSahaPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const remaining = MAX_SAHA_FOTO_COUNT - sahaFotoUrls.length;
    if (remaining <= 0) {
      alert(`En fazla ${MAX_SAHA_FOTO_COUNT} fotoğraf eklenebilir.`);
      e.target.value = '';
      return;
    }

    const toProcess = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      alert(`En fazla ${MAX_SAHA_FOTO_COUNT} fotoğraf — ${remaining} adet eklendi.`);
    }

    try {
      const added: string[] = [];
      for (const file of toProcess) {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(String(event.target?.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(file as File);
        });
        try {
          added.push(await compressImage(rawBase64));
        } catch {
          added.push(rawBase64);
        }
      }
      setSahaFotoUrls((prev) => [...prev, ...added].slice(0, MAX_SAHA_FOTO_COUNT));
    } catch {
      alert('Fotoğraf yüklenemedi, tekrar deneyin.');
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveSahaFoto = (index: number) => {
    setSahaFotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const syncIdariMesaiFromFaaliyet = async (
    tarih: string,
    mesaiMap: Record<string, number> | undefined,
    previousMesaiMap?: Record<string, number>
  ) => {
    if (!setYoklamalar) return;
    const hasNew = mesaiMap && Object.values(mesaiMap).some((h) => Number(h) > 0);
    const hasPrev = previousMesaiMap && Object.values(previousMesaiMap).some((h) => Number(h) > 0);
    if (!hasNew && !hasPrev) return;
    let next: AylikYoklamaMap = { ...(yoklamalar || {}) };
    const gonderen = 'IDARI_SAHA';
    if (hasPrev) next = applySahaMesaiToYoklama(next, tarih, previousMesaiMap, gonderen, 'subtract');
    if (hasNew) next = applySahaMesaiToYoklama(next, tarih, mesaiMap, gonderen, 'add');
    if (saveYoklamalarNow) await saveYoklamalarNow(next);
    else setYoklamalar(next);
  };

  const buildMesaiMapFromSelection = (): Record<string, number> | undefined => {
    if (faaliyetTipi !== 'MESAI_SAHA') return undefined;
    const map = Object.fromEntries(
      selectedFieldStaff
        .map((id) => [id, normalizeSahaMesaiHours(Number(personelMesaiSaatleri[id] || 0))])
        .filter(([, h]) => Number(h) > 0)
    );
    return Object.keys(map).length > 0 ? map : undefined;
  };

  const resetSahaForm = () => {
    setEditingSahaId(null);
    setSahaAciklama('');
    setSahaNitelik('');
    setSahaFotoUrls([]);
    setSahaUstaSayisi(0);
    setSahaIsciSayisi(0);
    setSelectedFieldStaff([]);
    setSahaStaffSearch('');
    setFaaliyetTipi('NORMAL');
    setPersonelMesaiSaatleri({});
  };

  const handleSaveSahaFaaliyeti = async () => {
    if (!sahaNitelik) {
      alert("Lütfen iş niteliğini girin.");
      return;
    }
    if (!sahaAciklama) {
      alert("Lütfen günlük çalışma açıklamasını girin.");
      return;
    }
    if (faaliyetTipi === 'MESAI_SAHA' && !buildMesaiMapFromSelection()) {
      alert('Mesai Saha Faaliyeti için en az bir personele mesai saati girin.');
      return;
    }

    const applyAutoCountsFromSelection = () => {
      if (selectedFieldStaffList.length === 0) return { usta: sahaUstaSayisi, isci: sahaIsciSayisi };
      const usta = selectedFieldStaffList.filter((p) => String(p.gorev || '').toLocaleUpperCase('tr-TR').includes('USTA')).length;
      const isci = Math.max(0, selectedFieldStaffList.length - usta);
      return { usta, isci };
    };
    const selectedCounts = applyAutoCountsFromSelection();
    const mesaiMap = buildMesaiMapFromSelection();
    const previousRecord = editingSahaId ? sahaFaaliyetleri.find((sf) => sf.id === editingSahaId) : undefined;

    if (editingSahaId) {
      const faaliyetId = editingSahaId;
      const faaliyetTarih = sahaKayitTarihi;
      setSahaFaaliyetleri(prev => prev.map(sf => {
        if (sf.id === editingSahaId) {
          return {
            ...sf,
            tarih: faaliyetTarih,
            isNiteligi: sahaNitelik,
            parsel: sahaParsel,
            blok: sahaBlok,
            aciklama: sahaAciklama,
            fotoUrl: sahaFotoUrls[0] || undefined,
            fotoUrls: sahaFotoUrls.length ? sahaFotoUrls : undefined,
            ustaSayisi: selectedCounts.usta,
            isciSayisi: selectedCounts.isci,
            aktifPersonelListesi: selectedFieldStaff,
            faaliyetTipi,
            personelMesaiSaatleri: mesaiMap,
            kaynakEkran: sf.kaynakEkran || 'IDARI_SAHA'
          };
        }
        return sf;
      }));
      if (selectedFieldStaff.length > 0) {
        const assignmentText = `${faaliyetTarih} tarihinde ${sahaParsel} / ${sahaBlok} alanında "${sahaNitelik}" görevlendirmesi güncellendi.`;
        const assignmentPromises = selectedFieldStaff.map(async (personelId) => {
          const personel = personeller.find((p) => p.id === personelId);
          if (!personel) return;
          await updateDoc(doc(db, 'personeller', personelId), {
            gecmis: arrayUnion({
              id: `saha_${faaliyetId}_${personelId}_${Date.now()}`,
              tarih: new Date().toISOString(),
              islem: 'Saha Görevlendirme',
              detay: assignmentText,
              gorev: personel.gorev || 'Personel',
            }),
          });
        });
        await Promise.all(assignmentPromises);
      }
      if (faaliyetTipi === 'MESAI_SAHA' || isMesaiSahaFaaliyet(previousRecord)) {
        await syncIdariMesaiFromFaaliyet(
          faaliyetTarih,
          faaliyetTipi === 'MESAI_SAHA' ? mesaiMap : undefined,
          isMesaiSahaFaaliyet(previousRecord) ? previousRecord?.personelMesaiSaatleri : undefined
        );
      }
      resetSahaForm();
      alert("Saha faaliyeti başarıyla güncellendi.");
    } else {
      const faaliyetId = `sf_${Date.now()}`;
      const newLog: SahaFaaliyeti = {
        id: faaliyetId,
        personelId: "p1",
        tarih: sahaKayitTarihi,
        isNiteligi: sahaNitelik,
        parsel: sahaParsel,
        blok: sahaBlok,
        aciklama: sahaAciklama,
        fotoUrl: sahaFotoUrls[0] || undefined,
        fotoUrls: sahaFotoUrls.length ? sahaFotoUrls : undefined,
        ustaSayisi: selectedCounts.usta,
        isciSayisi: selectedCounts.isci,
        aktifPersonelListesi: selectedFieldStaff,
        faaliyetTipi,
        personelMesaiSaatleri: mesaiMap,
        kaynakEkran: 'IDARI_SAHA'
      };

      setSahaFaaliyetleri(prev => [newLog, ...prev]);
      if (selectedFieldStaff.length > 0) {
        const assignmentText = `${newLog.tarih} tarihinde ${newLog.parsel} / ${newLog.blok} alanında "${newLog.isNiteligi}" görevlendirmesi.`;
        const assignmentPromises = selectedFieldStaff.map(async (personelId) => {
          const personel = personeller.find((p) => p.id === personelId);
          if (!personel) return;
          await updateDoc(doc(db, 'personeller', personelId), {
            gecmis: arrayUnion({
              id: `saha_${faaliyetId}_${personelId}`,
              tarih: new Date().toISOString(),
              islem: 'Saha Görevlendirme',
              detay: assignmentText,
              gorev: personel.gorev || 'Personel',
            }),
          });
        });
        await Promise.all(assignmentPromises);
      }
      if (faaliyetTipi === 'MESAI_SAHA' && mesaiMap) {
        await syncIdariMesaiFromFaaliyet(sahaKayitTarihi, mesaiMap);
      }
      resetSahaForm();
      alert(faaliyetTipi === 'MESAI_SAHA'
        ? 'Mesai saha faaliyeti kaydedildi; mesai saatleri puantaja işlendi.'
        : 'Günlük saha imalat raporu başarıyla kaydedildi.');
    }
  };

  const handleStartEditSaha = (sf: SahaFaaliyeti) => {
    setEditingSahaId(sf.id);
    setSahaKayitTarihi(normalizeDateKey(sf.tarih) || todayDateKey());
    setSahaNitelik(sf.isNiteligi);
    setSahaParsel(sf.parsel);
    setSahaBlok(sf.blok);
    setSahaAciklama(sf.aciklama);
    setSahaUstaSayisi(sf.ustaSayisi || 0);
    setSahaIsciSayisi(sf.isciSayisi || 0);
    setSelectedFieldStaff(Array.isArray(sf.aktifPersonelListesi) ? sf.aktifPersonelListesi : []);
    setFaaliyetTipi(sf.faaliyetTipi || 'NORMAL');
    setPersonelMesaiSaatleri({ ...(sf.personelMesaiSaatleri || {}) });
    setSahaFotoUrls(getFaaliyetFotolar(sf));
  };

  const handleCancelEditSaha = () => {
    resetSahaForm();
  };

  const handleDeleteSahaFaaliyeti = async (id: string) => {
    if (deleteConfirmSahaId === id) {
      const target = sahaFaaliyetleri.find((sf) => sf.id === id);
      if (!target) return;
      try {
        if (removeSahaFaaliyetNow) {
          await removeSahaFaaliyetNow(target);
        } else {
          setSahaFaaliyetleri((prev) => prev.filter((sf) => sf.id !== id));
        }
        setDeleteConfirmSahaId(null);
        if (editingSahaId === id) {
          handleCancelEditSaha();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Silme engellendi';
        alert(msg);
        setDeleteConfirmSahaId(null);
      }
    } else {
      setDeleteConfirmSahaId(id);
      setTimeout(() => {
        setDeleteConfirmSahaId((prev) => (prev === id ? null : prev));
      }, 4000);
    }
  };

  const loadSahaArchiveList = async () => {
    setSahaArchiveLoading(true);
    try {
      setSahaArchives(await listSahaFaaliyetArchives(30));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Arşiv listesi alınamadı');
    } finally {
      setSahaArchiveLoading(false);
    }
  };

  const handleRestoreSahaArchive = async (archiveId: string) => {
    if (!window.confirm('Seçilen saha faaliyeti yedeği geri yüklenecek. Devam?')) return;
    setSahaArchiveRestoringId(archiveId);
    try {
      const result = await restoreSahaFaaliyetFromArchive(archiveId);
      if (!result.ok) throw new Error(result.error || 'Geri yükleme başarısız');
      alert('Saha faaliyeti arşivden geri yüklendi.');
      void loadSahaArchiveList();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Geri yükleme başarısız');
    } finally {
      setSahaArchiveRestoringId(null);
    }
  };

  const buildYoklamaSummaryForDate = (dateStr: string) => {
    const dayNum = Number(dateStr.split('-')[2] || '0');
    const summary = { gelen: 0, yok: 0, izinli: 0, raporlu: 0 };

    personeller.forEach((personel) => {
      const personMap = yoklamalar?.[personel.id];
      if (!personMap || typeof personMap !== 'object') return;
      const record = (personMap[dateStr] ??
        personMap[String(dayNum)] ??
        personMap[dayNum]) as { durum?: string } | undefined;
      const durum = (record?.durum || '').toLocaleLowerCase('tr-TR');
      if (!durum) return;
      if (durum.includes('geldi')) summary.gelen += 1;
      else if (durum.includes('yok')) summary.yok += 1;
      else if (durum.includes('izin')) summary.izinli += 1;
      else if (durum.includes('rapor')) summary.raporlu += 1;
    });
    return summary;
  };

  const daySahaFaaliyetleri = useMemo(
    () => sahaFaaliyetleri.filter((sf) => normalizeDateKey(sf.tarih) === selectedSahaGun),
    [sahaFaaliyetleri, selectedSahaGun]
  );
  const filteredTumSahaFaaliyetleri = useMemo(() => {
    const keyword = sahaSearchKeyword.toLocaleLowerCase('tr-TR').trim();
    return [...sahaFaaliyetleri]
      .filter((sf) => (tumKayitTarihFiltre ? normalizeDateKey(sf.tarih) === tumKayitTarihFiltre : true))
      .filter((sf) => {
        if (!keyword) return true;
        return (
          sf.isNiteligi.toLocaleLowerCase('tr-TR').includes(keyword) ||
          sf.aciklama.toLocaleLowerCase('tr-TR').includes(keyword) ||
          sf.parsel.toLocaleLowerCase('tr-TR').includes(keyword) ||
          String(sf.blok || '').toLocaleLowerCase('tr-TR').includes(keyword)
        );
      })
      .sort((a, b) => {
        const aTs = new Date(a.programaGonderimTarihi || a.tarih).getTime();
        const bTs = new Date(b.programaGonderimTarihi || b.tarih).getTime();
        return bTs - aTs;
      });
  }, [sahaFaaliyetleri, sahaSearchKeyword, tumKayitTarihFiltre]);
  const filteredFormenFaaliyetleri = useMemo(
    () =>
      sahaFaaliyetleri
        .filter((sf) => sf.kaynakEkran === 'FORMEN_MOBIL')
        .filter((sf) => (formenTarihFiltre ? normalizeDateKey(sf.tarih) === formenTarihFiltre : true))
        .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih), 'tr')),
    [sahaFaaliyetleri, formenTarihFiltre]
  );
  const filteredFormenGunlukRaporlari = useMemo(
    () =>
      formenGunlukRaporlari
        .filter((r) => (formenTarihFiltre ? normalizeDateKey(r.tarih) === formenTarihFiltre : true))
        .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih), 'tr')),
    [formenGunlukRaporlari, formenTarihFiltre]
  );
  const displayGunRaporArsivi = useMemo(() => {
    const byDate = new Map<string, SahaGunRaporArsiv>();

    // Formen saha faaliyetlerinden gün özetleri (PDF gönderilmemiş eski kayıtlar dahil)
    const faaliyetByDate = new Map<string, SahaFaaliyeti[]>();
    for (const sf of filteredFormenFaaliyetleri) {
      const tarih = normalizeDateKey(sf.tarih);
      if (!tarih) continue;
      const list = faaliyetByDate.get(tarih) || [];
      list.push(sf);
      faaliyetByDate.set(tarih, list);
    }
    for (const [tarih, list] of faaliyetByDate.entries()) {
      byDate.set(tarih, {
        id: `formen_faaliyet_gun_${tarih}`,
        tarih,
        olusturmaTarihi: '',
        olusturan: 'FORMEN_MOBIL',
        faaliyetIds: list.map((f) => f.id),
        faaliyetAdet: list.length,
        formenFaaliyetAdet: list.length,
        yoklamaOzet: { gelen: 0, yok: 0, izinli: 0, raporlu: 0 },
        aciklama: `${list.length} Formen saha faaliyeti`,
      } as SahaGunRaporArsiv);
    }

    // Eski Formen PDF gönderimleri (gunlukSahaRaporlari)
    for (const r of filteredFormenGunlukRaporlari) {
      const tarih = normalizeDateKey(r.tarih);
      if (!tarih) continue;
      byDate.set(tarih, {
        id: `formen_${r.id}`,
        tarih,
        olusturmaTarihi: r.guncellenmeTarihi || r.olusturulma || '',
        olusturan: r.gonderen || r.gonderenFormen || 'FORMEN',
        faaliyetIds: Array.isArray(r.faaliyetler)
          ? r.faaliyetler.map((f: any) => String(f?.id || '')).filter(Boolean)
          : [],
        faaliyetAdet: Array.isArray(r.faaliyetler)
          ? r.faaliyetler.length
          : Number(r.faaliyetAdet || 0),
        formenFaaliyetAdet: Array.isArray(r.faaliyetler)
          ? r.faaliyetler.length
          : Number(r.faaliyetAdet || 0),
        yoklamaOzet: {
          gelen: Number(r.toplamEkip || 0),
          yok: 0,
          izinli: 0,
          raporlu: 0,
        },
        aciklama: r.genelNotlar || r.ozetMetin || '',
      } as SahaGunRaporArsiv);
    }

    // İdari / Formen sahaGunRaporArsiv kayıtları (aynı günde öncelikli)
    for (const r of sahaGunRaporArsivleri) {
      const tarih = normalizeDateKey(r.tarih);
      if (!tarih) continue;
      byDate.set(tarih, r);
    }

    return Array.from(byDate.values()).sort((a, b) =>
      String(b.tarih).localeCompare(String(a.tarih), 'tr')
    );
  }, [sahaGunRaporArsivleri, filteredFormenGunlukRaporlari, filteredFormenFaaliyetleri]);
  const filteredDisplayGunRaporArsivi = useMemo(
    () =>
      displayGunRaporArsivi.filter((r) =>
        gunArsivTarihFiltre ? normalizeDateKey(r.tarih) === gunArsivTarihFiltre : true
      ),
    [displayGunRaporArsivi, gunArsivTarihFiltre]
  );

  const sahaTakvimGunleri = useMemo(() => {
    const [year, month] = sahaTakvimAy.split('-').map(Number);
    if (!year || !month) return [] as Array<{ date: string; day: number }>;
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { date, day };
    });
  }, [sahaTakvimAy]);

  const openSahaGunDetay = (date: string) => {
    setSelectedSahaGun(date);
    setShowSahaGunModal(true);
  };

  const handlePrintSahaGun = (date: string) => {
    const targetDate = normalizeDateKey(date);
    const gunlukFaaliyetler = sahaFaaliyetleri.filter((sf) => normalizeDateKey(sf.tarih) === targetDate);
    const yoklama = buildYoklamaSummaryForDate(targetDate);
    const rows = gunlukFaaliyetler
      .map(
        (sf, idx) =>
          `<tr><td>${idx + 1}</td><td>${sf.isNiteligi}</td><td>${sf.parsel} / ${sf.blok}</td><td>${sf.aciklama}</td><td>${sf.kaynakEkran || '-'}</td></tr>`
      )
      .join('');
    const html = `
      <html><head><title>Saha Gunu ${date}</title>
      <style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px;font-size:12px;text-align:left}
      h2{margin:0 0 8px 0} .meta{font-size:12px;color:#444}</style></head><body>
      <h2>${date} Saha Faaliyet ve Yoklama Ozeti</h2>
      <div class="meta">Yoklama - Geldi: ${yoklama.gelen} | Yok: ${yoklama.yok} | Izinli: ${yoklama.izinli} | Raporlu: ${yoklama.raporlu}</div>
      <table><thead><tr><th>#</th><th>Is Niteliği</th><th>Lokasyon</th><th>Aciklama</th><th>Kaynak</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Kayit yok</td></tr>'}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>
    `;
    const popup = window.open('', '_blank', 'width=1000,height=700');
    if (!popup) {
      alert('Yazdırma penceresi açılamadı.');
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  const getSahaFaaliyetFotoUrl = (sf: SahaFaaliyeti | any): string => getFaaliyetFoto(sf);

  const handleIceriAlVeGunRaporla = async () => {
    if (!formenTarihFiltre) {
      alert('Lütfen tarih seçin.');
      return;
    }
    const dayRecords = sahaFaaliyetleri.filter((sf) => normalizeDateKey(sf.tarih) === formenTarihFiltre);
    const formenRecords = dayRecords.filter((sf) => sf.kaynakEkran === 'FORMEN_MOBIL');
    if (formenRecords.length === 0) {
      alert('Seçili tarihte Formen kaydı bulunmuyor.');
      return;
    }
    const alreadyArchived = sahaGunRaporArsivleri.some((r) => normalizeDateKey(r.tarih) === formenTarihFiltre);
    if (alreadyArchived) {
      alert('Bu tarih daha önce arşivlenmiş. Mükerrer arşiv kaydı oluşturulmadı.');
      return;
    }

    const yoklama = buildYoklamaSummaryForDate(formenTarihFiltre);
    const rapor: SahaGunRaporArsiv = {
      id: `saha_gun_rapor_${formenTarihFiltre}_${Date.now()}`,
      tarih: formenTarihFiltre,
      olusturmaTarihi: new Date().toISOString(),
      olusturan: 'IDARI_SAHA',
      faaliyetIds: dayRecords.map((f) => f.id),
      faaliyetAdet: dayRecords.length,
      formenFaaliyetAdet: formenRecords.length,
      yoklamaOzet: yoklama,
      aciklama: gunRaporNotu.trim(),
    };

    await setDoc(doc(db, 'sahaGunRaporArsiv', rapor.id), rapor);
    setSahaFaaliyetleri((prev) =>
      prev.map((sf) =>
        normalizeDateKey(sf.tarih) === formenTarihFiltre && sf.kaynakEkran === 'FORMEN_MOBIL'
          ? { ...sf, iceriAktarimDurumu: 'AKTARILDI', programaGonderildi: true }
          : sf
      )
    );
    alert(`${formenTarihFiltre} günü raporlandı ve arşive kaydedildi.`);
    setGunRaporNotu('');
  };

  const renderSahaFaaliyetList = (list: SahaFaaliyeti[]) => (
    <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-50/20">
      {list.length === 0 && (
        <div className="border border-dashed border-slate-250 rounded-xl p-4 text-xs text-slate-500">
          Kayıt bulunamadı.
        </div>
      )}
      {list.map((sf) => (
        <div key={sf.id} className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between hover:shadow transition duration-150 shadow-sm">
          <div className="flex justify-between items-start text-xs border-b pb-2 mb-2">
            <div>
              <span className="font-bold text-slate-800">{sf.isNiteligi}</span>
              {isMesaiSahaFaaliyet(sf) && (
                <span className="ml-2 text-[8px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
                  Mesai Faaliyet
                </span>
              )}
              <p className="text-[9px] text-[#2563EB] font-bold mt-1">Saha Lokasyon: {sf.parsel} · {sf.blok} · {sf.tarih}</p>
            </div>
            {sf.kaynakEkran === 'FORMEN_MOBIL' && (
              <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5 font-bold">
                FORMEN
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600 font-sans tracking-tight leading-relaxed">{sf.aciklama}</p>

          {isMesaiSahaFaaliyet(sf) && (
            <p className="text-[10px] text-amber-800 font-semibold mt-2">
              Mesai ile gerçekleştirildi: {formatMesaiFaaliyetLabel(sf, personeller) || '—'}
            </p>
          )}

          {(sf.ustaSayisi !== undefined || sf.isciSayisi !== undefined) && (
            <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-150 flex gap-4">
              {sf.ustaSayisi !== undefined && (
                <div className="text-[10px]">
                  <span className="text-slate-400 font-bold block text-[8px] uppercase">Çalışan Usta</span>
                  <strong className="text-slate-800">{sf.ustaSayisi} Kişi</strong>
                </div>
              )}
              {sf.isciSayisi !== undefined && (
                <div className="text-[10px]">
                  <span className="text-slate-400 font-bold block text-[8px] uppercase">Çalışan Düz İşçi</span>
                  <strong className="text-slate-800">{sf.isciSayisi} Kişi</strong>
                </div>
              )}
            </div>
          )}

          {Array.isArray(sf.aktifPersonelListesi) && sf.aktifPersonelListesi.length > 0 && (
            <div className="mt-2 bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5">
              <span className="text-[8px] uppercase font-bold text-emerald-700 tracking-wider">DB Görevlendirilen Personel</span>
              <p className="text-[11px] text-emerald-900 font-semibold mt-1">
                {sf.aktifPersonelListesi
                  .map((id) => {
                    const personel = personeller.find((p) => p.id === id);
                    return personel ? `${personel.ad} ${personel.soyad}` : 'Bilinmeyen Personel';
                  })
                  .join(', ')}
              </p>
            </div>
          )}

          {(() => {
            const fotolar = getFaaliyetFotolar(sf);
            if (fotolar.length === 0) return null;
            return (
              <div className="mt-3 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">
                  📷 İMALAT SAHA FOTOĞRAFI ({fotolar.length}) — büyütmek için tıklayın
                </span>
                <div className="flex flex-wrap gap-2">
                  {fotolar.map((url, i) => (
                    <button
                      key={`${sf.id}-foto-${i}`}
                      type="button"
                      onClick={() => setExpandedFoto(url)}
                      className="relative border rounded-xl overflow-hidden bg-slate-50 w-28 h-28 cursor-zoom-in hover:ring-2 hover:ring-[#2563EB] transition group"
                      title="Büyütmek için tıklayın"
                    >
                      <img
                        src={url}
                        alt={`Saha İmalat Görseli ${i + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white rounded p-0.5 opacity-80 group-hover:opacity-100">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex justify-end gap-2 pt-2 border-t mt-3 text-[10px]">
            <button
              onClick={() => handleStartEditSaha(sf)}
              className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold py-1 px-2.5 rounded-lg transition cursor-pointer"
            >
              ✏️ Düzenle
            </button>
            {deleteConfirmSahaId === sf.id ? (
              <button
                onClick={() => handleDeleteSahaFaaliyeti(sf.id)}
                className="bg-red-600 hover:bg-red-700 text-white font-extrabold py-1 px-2.5 rounded-lg transition animate-pulse cursor-pointer"
              >
                Emin misiniz? Sil
              </button>
            ) : (
              <button
                onClick={() => handleDeleteSahaFaaliyeti(sf.id)}
                className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold py-1 px-2.5 rounded-lg transition cursor-pointer"
              >
                🗑️ Sil
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // 📜 4. HAZIR TUTANAKLAR (Taşındı -> PersonelIzinScreen)
  // ─────────────────────────────────────────────────────────────



  // ─────────────────────────────────────────────────────────────
  // 🏢 5. CARI & STOK STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [csTab, setCsTab] = useState<'cari' | 'stok'>('cari');
  const [cariSearchQuery, setCariSearchQuery] = useState("");
  const [stokSearchQuery, setStokSearchQuery] = useState("");
  const [newCariUnvan, setNewCariUnvan] = useState("");
  const [newCariType, setNewCariType] = useState<CariKart['kartTipi']>("TEDARIKCI");
  const [newCariYetkili, setNewCariYetkili] = useState("");
  const [newCariTelefon, setNewCariTelefon] = useState("");
  const [newCariEposta, setNewCariEposta] = useState("");
  const [newCariVergiNo, setNewCariVergiNo] = useState("");
  const [newCariVergiDairesi, setNewCariVergiDairesi] = useState("");
  const [newCariAdres, setNewCariAdres] = useState("");
  const [newCariIban, setNewCariIban] = useState("");
  const [newCariNotlar, setNewCariNotlar] = useState("");
  
  const [newStokAdi, setNewStokAdi] = useState("");
  const [newStokBirim, setNewStokBirim] = useState("TON");
  const [newStokKategori, setNewStokKategori] = useState("Kaba İnşaat İmalatı");
  const [newStokAciklama, setNewStokAciklama] = useState("");

  // Cari & Stok Edit, Delete, History state
  const [editingCariId, setEditingCariId] = useState<string | null>(null);
  const [editingStokId, setEditingStokId] = useState<string | null>(null);
  const [historyModalData, setHistoryModalData] = useState<{ type: 'cari' | 'stok'; id: string; name: string } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);

  const filteredCariKartlar = cariKartlar.filter((cr) => {
    const q = cariSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(cr.unvan || "").toLowerCase().includes(q) ||
      String(cr.kod || "").toLowerCase().includes(q) ||
      String(cr.kartTipi || "").toLowerCase().includes(q) ||
      String(cr.iban || "").toLowerCase().includes(q)
    );
  });

  const filteredStokKartlar = stokKartlar.filter((st) => {
    const q = stokSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(st.stokAdi || "").toLowerCase().includes(q) ||
      String(st.stokKodu || "").toLowerCase().includes(q) ||
      String(st.kategori || "").toLowerCase().includes(q) ||
      String(st.birim || "").toLowerCase().includes(q)
    );
  });

  const loadHistoryData = async (type: 'cari' | 'stok', id: string, name: string, code: string) => {
    setHistoryLoading(true);
    setHistoryList([]);
    try {
      const logs: any[] = [];

      // 1. Initial creation entry
      logs.push({
        id: 'init',
        type: 'KART AÇILIŞI',
        title: 'Kart Tanımlama ve Açılış Kaydı',
        desc: `"${name}" (${code || 'KODSUZ'}) kartı sisteme tanımlandı ve açılış kaydı tamamlandı.`,
        date: 'İlk Kayıt',
        badgeColor: 'bg-emerald-100 text-emerald-800'
      });

      if (type === 'cari') {
        // Fetch Purchases (satinAlmaTalepleri)
        const purchasesSnap = await getDocs(collection(db, 'satinAlmaTalepleri'));
        purchasesSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.cariFirma?.toLowerCase() === name.toLowerCase()) {
            logs.push({
              id: docSnap.id,
              type: 'SATIN ALMA',
              title: `Satın Alma Talebi: ${data.saId || 'SA-KOD'}`,
              desc: `${data.aciklama || 'Açıklama belirtilmedi.'} (${data.kalemler?.length || 0} kalem malzeme). Onay: ${data.onayDurumu}`,
              date: data.tarih || '',
              badgeColor: 'bg-slate-100 text-slate-800'
            });
          }
        });

        // Fetch Waybills (irsaliyeler)
        const waybillsSnap = await getDocs(collection(db, 'irsaliyeler'));
        waybillsSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.firma?.toLowerCase() === name.toLowerCase()) {
            logs.push({
              id: docSnap.id,
              type: 'İRSALİYE',
              title: `İrsaliye Girişi: ${data.irsaliyeNo || 'İRS-KOD'}`,
              desc: `Şantiyeye teslim alınan irsaliye. Durum: ${data.onayDurumu}`,
              date: data.tarih || '',
              badgeColor: 'bg-amber-100 text-amber-800'
            });
          }
        });

        // Fetch Invoices (faturalar)
        const invoicesSnap = await getDocs(collection(db, 'faturalar'));
        invoicesSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.cariUnvan?.toLowerCase() === name.toLowerCase()) {
            logs.push({
              id: docSnap.id,
              type: 'FATURA',
              title: `Fatura Kaydı: ${data.faturaNo || 'FAT-KOD'}`,
              desc: `Matrah: ₺${data.toplamTutar?.toLocaleString()} + KDV. Üçlü mutabakat: ${data.durum}`,
              date: data.tarih || '',
              badgeColor: 'bg-purple-100 text-purple-800'
            });
          }
        });

        // Fetch Lojman stays (kampKayitlari)
        const staysSnap = await getDocs(collection(db, 'kampKayitlari'));
        staysSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.calistigiFirma?.toLowerCase() === name.toLowerCase()) {
            logs.push({
              id: docSnap.id,
              type: 'LOJMAN KONAKLAMA',
              title: `Taşeron Konaklama: ${data.personelIsim}`,
              desc: `${data.girisTarihi} tarihli lojman oda yerleşimi (${data.durum === 'AKTIF' ? 'Hala Konaklıyor' : 'Ayrıldı'}).`,
              date: data.girisTarihi || '',
              badgeColor: 'bg-teal-100 text-teal-800'
            });
          }
        });

      } else {
        // Stok type
        // Fetch Purchases (satinAlmaTalepleri)
        const purchasesSnap = await getDocs(collection(db, 'satinAlmaTalepleri'));
        purchasesSnap.forEach(docSnap => {
          const data = docSnap.data();
          const hasItem = data.kalemler?.some((k: any) => 
            k.urunAdi?.toLowerCase() === name.toLowerCase() || 
            k.stokKartId === id
          );
          if (hasItem) {
            logs.push({
              id: docSnap.id,
              type: 'SATIN ALMA',
              title: `Satın Alma Talebi: ${data.saId || 'SA-KOD'}`,
              desc: `Bu malzemeden satın alma talebi oluşturuldu. Firma: ${data.cariFirma}`,
              date: data.tarih || '',
              badgeColor: 'bg-slate-100 text-slate-800'
            });
          }
        });

        // Fetch Waybills (irsaliyeler)
        const waybillsSnap = await getDocs(collection(db, 'irsaliyeler'));
        waybillsSnap.forEach(docSnap => {
          const data = docSnap.data();
          const hasItem = data.kalemler?.some((k: any) => 
            k.urunAdi?.toLowerCase() === name.toLowerCase() || 
            k.stokKartId === id
          );
          if (hasItem) {
            logs.push({
              id: docSnap.id,
              type: 'İRSALİYE GİRİŞİ',
              title: `Depoya Giriş: ${data.irsaliyeNo || 'İRS-KOD'}`,
              desc: `Şantiyeye teslim alınarak depoya girdi. Firma: ${data.firma}`,
              date: data.tarih || '',
              badgeColor: 'bg-amber-100 text-amber-800'
            });
          }
        });

        // Fetch Zimmers/Zimmetler (personelZimmetleri)
        const zimmetsSnap = await getDocs(collection(db, 'personelZimmetleri'));
        zimmetsSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.stockId === id || data.urunAdi?.toLowerCase() === name.toLowerCase()) {
            logs.push({
              id: docSnap.id,
              type: 'PERSONEL ZİMMET',
              title: `Zimmetlendi: ${data.personelName || 'Personel'}`,
              desc: `Depodan ${data.miktar} ${data.birim} malzeme personele teslim edildi. (${data.durum || 'ZİMMETLİ'})`,
              date: data.tarih || '',
              badgeColor: 'bg-indigo-100 text-indigo-800'
            });
          }
        });
      }

      // Sort logs by date descending (push 'İlk Kayıt' to end)
      logs.sort((a, b) => {
        if (a.date === 'İlk Kayıt') return 1;
        if (b.date === 'İlk Kayıt') return -1;
        return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      });

      setHistoryList(logs);
    } catch (e) {
      console.error("Geçmiş veri okuma hatası:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  React.useEffect(() => {
    if (historyModalData) {
      let code = '';
      if (historyModalData.type === 'cari') {
        const matched = cariKartlar.find(c => c.id === historyModalData.id);
        if (matched) code = matched.kod;
      } else {
        const matched = stokKartlar.find(s => s.id === historyModalData.id);
        if (matched) code = matched.stokKodu;
      }
      loadHistoryData(historyModalData.type, historyModalData.id, historyModalData.name, code);
    }
  }, [historyModalData]);

  const handleCreateCari = () => {
    if (!newCariUnvan) return;
    if (editingCariId) {
      if (warnIfDuplicateCari(cariKartlar, newCariUnvan, editingCariId)) return;
      setCariKartlar(prev => prev.map(c => c.id === editingCariId ? {
        ...c, 
        unvan: newCariUnvan, 
        kartTipi: newCariType,
        yetkili: newCariYetkili,
        telefon: newCariTelefon,
        eposta: newCariEposta,
        vergiNo: newCariVergiNo,
        vergiDairesi: newCariVergiDairesi,
        adres: newCariAdres,
        iban: newCariIban,
        notlar: newCariNotlar
      } : c));
      setEditingCariId(null);
      setNewCariUnvan("");
      setNewCariYetkili("");
      setNewCariTelefon("");
      setNewCariEposta("");
      setNewCariVergiNo("");
      setNewCariVergiDairesi("");
      setNewCariAdres("");
      setNewCariIban("");
      setNewCariNotlar("");
      alert("Cari kart başarıyla güncellendi.");
      return;
    }
    if (warnIfDuplicateCari(cariKartlar, newCariUnvan)) return;
    const newC: CariKart = {
      id: `c_${Date.now()}`,
      kartTipi: newCariType,
      kod: `CARI-${Math.floor(100+Math.random()*900)}`,
      unvan: newCariUnvan,
      yetkili: newCariYetkili || "Yetkili Tanımsız",
      telefon: newCariTelefon,
      eposta: newCariEposta,
      vergiNo: newCariVergiNo,
      vergiDairesi: newCariVergiDairesi,
      adres: newCariAdres,
      iban: newCariIban,
      durum: "AKTIF",
      notlar: newCariNotlar || "Şantiye cari kartı."
    };
    setCariKartlar(prev => [...prev, newC]);
    setNewCariUnvan("");
    setNewCariYetkili("");
    setNewCariTelefon("");
    setNewCariEposta("");
    setNewCariVergiNo("");
    setNewCariVergiDairesi("");
    setNewCariAdres("");
    setNewCariIban("");
    setNewCariNotlar("");
    alert("Yeni cari kart başarıyla eklendi.");
  };

  const handleCreateStok = () => {
    if (!newStokAdi) return;
    if (editingStokId) {
      if (warnIfDuplicateStok(stokKartlar, newStokAdi, editingStokId)) return;
      setStokKartlar(prev => prev.map(s => s.id === editingStokId ? { 
        ...s, 
        stokAdi: newStokAdi, 
        birim: newStokBirim,
        kategori: newStokKategori,
        aciklama: newStokAciklama
      } : s));
      setEditingStokId(null);
      setNewStokAdi("");
      setNewStokAciklama("");
      alert("Stok kartı başarıyla güncellendi.");
      return;
    }
    if (warnIfDuplicateStok(stokKartlar, newStokAdi)) return;
    const newS: StokKart = {
      id: `s_${Date.now()}`,
      stokKodu: `STK-${Math.random().toString(16).substring(2,6).toUpperCase()}`,
      stokAdi: newStokAdi,
      kategori: newStokKategori,
      birim: newStokBirim,
      kritikSeviye: 10,
      durum: "AKTIF",
      aciklama: newStokAciklama
    };
    setStokKartlar(prev => [...prev, newS]);
    setNewStokAdi("");
    setNewStokAciklama("");
    alert("Yeni stok kartı başarıyla eklendi.");
  };

  // ─────────────────────────────────────────────────────────────
  // 📧 6. E-POSTA MERKEZİ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [mailSubject, setMailSubject] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [mailModul, setMailModul] = useState<'PERSONEL' | 'FINANS' | 'IDARI' | 'RAPOR'>("RAPOR");

  const handleSendMail = () => {
    if (!mailSubject || !mailTo) {
      alert("Lütfen alıcı e-posta adreslerini ve konuyu doldurun.");
      return;
    }

    const newMail: EpostaGonderim = {
      id: `ep_${Date.now()}`,
      konu: mailSubject,
      alicilar: mailTo,
      modul: mailModul,
      raporTipi: "Otomatik Rapor",
      durum: "GONDERILDI",
      tarih: new Date().toISOString().split('T')[0],
      notlar: "E-posta istemcisi tetiklendi ve başarıyla ulaştırıldı."
    };

    void import('../lib/reportEmail').then(({ openReportEmailComposer }) => {
      openReportEmailComposer({
        subject: mailSubject,
        defaultTo: mailTo,
        body: `Sayın Yetkili,\n\nKibritçi ERP Dijital Portalı üzerinden oluşturulan "${mailSubject}" başlıklı ve ${mailModul} modülüne ait rapor bilginize sunulmuştur.\n\nBilgilerinize sunar, iyi çalışmalar dileriz.\n\nKibritçi İnşaat Sanayi ve Ticaret A.Ş.\nERP Otomasyon Merkezi`,
        fileName: `Kibritci_${mailModul}_${mailSubject.slice(0, 30)}.html`,
      });
    });

    setEpostaGonderimleri(prev => [newMail, ...prev]);
    setMailSubject("");
    setMailTo("");
  };



  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans select-none bg-slate-50/50">
      
      {/* ─────────────────────────────────────────────────────────────
          🚛 VIEW: ARAÇ & DEMİRBAŞ
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'arac' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          
          {/* Subtab Controllers */}
          <div className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-xl shrink-0">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setAracSubTab('liste')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
                  aracSubTab === 'liste' 
                    ? 'bg-[#2563EB] text-white shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                🚛 Araç Envanteri &amp; Kayıt
              </button>
              <button
                onClick={() => {
                  setAracSubTab('km_takip');
                  if (araclar.length > 0) {
                    setFormKmPlaka(araclar[0].plaka);
                    setFormSabahKm(araclar[0].mevcutKm);
                  }
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-150 cursor-pointer flex items-center space-x-1.5 ${
                  aracSubTab === 'km_takip' 
                    ? 'bg-[#2563EB] text-white shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>⏱️ Sabah / Akşam KM Girişleri</span>
                <span className="bg-amber-100 text-amber-800 text-[9px] rounded-full px-1.5 py-0.5">Fark Raporlama</span>
              </button>
              <button
                onClick={() => setAracSubTab('bakim_raporu')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
                  aracSubTab === 'bakim_raporu' 
                    ? 'bg-[#2563EB] text-white shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                🔧 Bakım Sayaç Raporu
              </button>
            </div>
            
            <span className="text-[10px] text-slate-400 font-mono tracking-tight font-medium mr-2">
              Şantiye Demirbaş Envanteri Kayıt Platformu · Kibritçi A.Ş.
            </span>
          </div>

          {aracSubTab === 'liste' && (
            <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
              
              {/* Creator form drawer */}
              <div className="w-full lg:w-[380px] lg:shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
                <div className={`p-4 shrink-0 text-white ${editingAracId ? 'bg-amber-600' : 'bg-[#2563EB]'}`}>
                  <span className="text-[10px] font-bold tracking-widest opacity-80 uppercase block">Zimmet &amp; Envanter</span>
                  <h3 className="font-display font-semibold text-sm">
                    {editingAracId ? "✏️ Demirbaş / Araç Düzenle" : "🚛 Demirbaş / Araç Ekle"}
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Plaka / Envanter Kodu *</label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none "
                      value={newPlaka}
                      onChange={(e) => setNewPlaka(e.target.value)}
                      placeholder="34 KBR ..."
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Marka &amp; Model Detayı</label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none "
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      placeholder="Ford Transit, Volvo FMX vb."
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Zimmetlenecek Sorumlu Personel</label>
                    <select 
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg cursor-pointer"
                      value={newSorumlu}
                      onChange={(e) => setNewSorumlu(e.target.value)}
                    >
                      {personeller.map(p => (
                        <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Vasıta Türü</label>
                    <select 
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg cursor-pointer"
                      value={newAracType}
                      onChange={(e) => setNewAracType(e.target.value as any)}
                    >
                      <option value="ARAC">Hafif Nakliye / Binek Araç</option>
                      <option value="IS_MAKINESI">Paletli Ekskavatör / Ağır İş Makinesi</option>
                      <option value="DEMIRBAS">Konstrüksiyon / Mobil Ekipman</option>
                    </select>
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <span className="font-bold text-[10px] text-slate-400 uppercase block">Fennî Muayene &amp; Sayaç Limitleri</span>
                    
                    <div>
                      <label className="text-[9px] font-bold text-slate-500">SON MUAYENE GEÇERLİLİK TARİHİ</label>
                      <input 
                        type="date"
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none "
                        value={newMuayene}
                        onChange={(e) => setNewMuayene(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-bold text-slate-400 block uppercase">YAĞ BAKIM HEDEFİ (KM)</label>
                        <input 
                          type="number"
                          className="w-full text-xs font-mono font-bold mt-1 p-1.5 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                          value={newYagKm}
                          onChange={(e) => setNewYagKm(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-bold text-slate-400 block uppercase">KM GENEL BAKIM PERİYODU</label>
                        <input 
                          type="number"
                          className="w-full text-xs font-mono font-bold mt-1 p-1.5 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                          value={newBakimKm}
                          onChange={(e) => setNewBakimKm(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t bg-slate-50 flex gap-2">
                  {editingAracId && (
                    <button 
                      onClick={handleCancelEditArac}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2.5 rounded-xl shadow cursor-pointer transition active:scale-95"
                    >
                      İptal
                    </button>
                  )}
                  <button 
                    onClick={handleCreateArac}
                    className={`flex-1 text-white font-bold text-xs py-2.5 rounded-xl shadow cursor-pointer transition active:scale-95 ${
                      editingAracId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#10b981] hover:bg-[#059669]'
                    }`}
                  >
                    {editingAracId ? "Değişiklikleri Kaydet" : "Araç / Demirbaşı Kaydet"}
                  </button>
                </div>
              </div>

              {/* List panel */}
              <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-2">
                    <Truck size={16} className="text-[#2563EB]" />
                    <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
                      Aktif Şantiye Araç &amp; Ekipman Listesi
                    </h4>
                  </div>
                  <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    Toplam {araclar.length} Vasıta Kayıtlı
                  </span>
                </div>

                {/* Grid display of active vehicles */}
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-max bg-slate-50/30">
                  {araclar.map(ar => {
                    const sorumluUser = personeller.find(p => p.id === ar.sorumluPersonelId);
                    
                    // Countdays to inspection logic
                    const today = new Date();
                    const inspectDate = ar.muayeneTarihi ? new Date(ar.muayeneTarihi) : null;
                    const daysRemaining = inspectDate ? Math.ceil((inspectDate.getTime() - today.getTime()) / (1000 * 3600 * 24)) : 0;
                    
                    // Oil limit computation
                    const oilRemaining = ar.yagBakimKm ? ar.yagBakimKm - ar.mevcutKm : 0;
                    const isOilCritical = oilRemaining <= 500;
                    
                    // Heavy maintenance check
                    const nextHeavyService = ar.kmBakimAraligi ? ar.kmBakimAraligi : 15000;
                    const heavyRemaining = nextHeavyService - ar.mevcutKm;

                    return (
                      <div key={ar.id} className="border border-slate-200 p-4 rounded-2xl hover:shadow-md transition duration-150 bg-white flex flex-col justify-between space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono bg-slate-150 rounded px-2.5 py-0.5 text-slate-800 text-[11px] font-bold border border-slate-200">
                              {ar.plaka}
                            </span>
                            <h4 className="font-bold text-slate-800 mt-2 text-xs">{ar.markaModel}</h4>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{ar.aracTipi}</span>
                          </div>
                          
                          <div className="flex flex-col items-end space-y-1.5">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              ar.durum === 'AKTIF' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-000'
                            }`}>
                              {ar.durum}
                            </span>
                            <button
                              onClick={() => setSelectedAracForPdf(ar)}
                              className="text-[9px] bg-amber-500 hover:bg-amber-600 text-white font-bold p-1 px-2 rounded shadow-sm transition flex items-center space-x-1 cursor-pointer"
                              title="Detaylı Sayaçlı PDF Teknik Refakat Raporu"
                            >
                              <span>🖨️ Sayaçlı Rapor</span>
                            </button>
                          </div>
                        </div>

                        {/* Bento Counters Container */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <span className="text-[8px] text-slate-400 uppercase font-bold block">Sayaç</span>
                            <strong className="font-mono text-slate-800 block mt-0.5">{ar.mevcutKm} KM</strong>
                          </div>
                          <div className={`p-2 rounded-xl border ${isOilCritical ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
                            <span className="text-[8px] text-slate-400 uppercase font-bold block">Yağ Değişimi</span>
                            <strong className="font-mono block mt-0.5">
                              {oilRemaining > 0 ? `${oilRemaining} KM` : "⚠️ Zamanı!"}
                            </strong>
                          </div>
                          <div 
                            onClick={(e) => {
                              if (daysRemaining <= 0) {
                                e.stopPropagation();
                                window.open('https://www.tuvturk.com.tr/', '_blank');
                              }
                            }}
                            className={`p-2 rounded-xl border transition-all ${
                              daysRemaining <= 0 
                                ? 'bg-rose-100 border-rose-350 text-rose-800 font-bold animate-pulse cursor-pointer hover:bg-rose-200' 
                                : daysRemaining <= 30 
                                  ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                  : 'bg-slate-50 border-slate-100 text-slate-800'
                            }`}
                            title={daysRemaining <= 0 ? "Araç muayene tarihi geçti! TÜVTÜRK resmi randevu sayfasına gitmek için tıklayın." : undefined}
                          >
                            <span className="text-[8px] text-slate-400 uppercase font-bold block">Muayene Kalan</span>
                            <strong className="font-mono block mt-0.5">
                              {daysRemaining <= 0 ? "⚠️ MUAYENE AL!" : `${daysRemaining} Gün`}
                            </strong>
                          </div>
                        </div>

                        {/* Diagnostics progress meters */}
                        <div className="space-y-1 border-t pt-2 border-slate-100 text-[10px]">
                          <div className="flex justify-between items-center text-slate-500 font-medium">
                            <span>Sorumlu: <strong className="text-slate-800">{sorumluUser ? `${sorumluUser.ad} ${sorumluUser.soyad}` : "Teknisyen Yok"}</strong></span>
                            <span>Ağır Bakım: <strong className="text-slate-800 font-mono font-bold text-[9px]">{heavyRemaining > 0 ? `${heavyRemaining} KM` : "HEMEN BAKIMA SOK!"}</strong></span>
                          </div>
                          <div className="flex justify-between items-center text-slate-400 text-[9px] pb-2">
                            <span>Muayene Tarihi: <strong>{ar.muayeneTarihi || "Girilmedi"}</strong></span>
                            <span>Yağ Hedefi: <strong>{ar.yagBakimKm || 10000} KM</strong></span>
                          </div>
                        </div>

                        <div className="flex gap-2 border-t pt-2.5 text-[9.5px]">
                          <button
                            type="button"
                            onClick={() => {
                              alert(`Araç Detay Kartı\n-----------------------\nPlaka: ${ar.plaka}\nMarka/Model: ${ar.markaModel}\nTip: ${ar.aracTipi}\nMevcut KM: ${ar.mevcutKm} KM\nSon Muayene: ${ar.muayeneTarihi || 'Yok'}\nYağ Bakım Hedef: ${ar.yagBakimKm || 10000} KM\nSorumlu Personel: ${sorumluUser ? `${sorumluUser.ad} ${sorumluUser.soyad} (${sorumluUser.gorev})` : "Teknisyen Yok"}`);
                            }}
                            className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 py-1 rounded font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>ℹ️ Detay Gör</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const vLogs = aracKmLoglari.filter(l => l.plaka === ar.plaka);
                              const txtLines = [
                                `KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.`,
                                `ARAÇ GEÇMİŞ RAPORU (TEKNİK VE HAREKET)`,
                                `---------------------------------------------`,
                                `Plaka: ${ar.plaka}`,
                                `Marka/Model: ${ar.markaModel}`,
                                `Araç Tipi: ${ar.aracTipi}`,
                                `Mevcut KM Sayacı: ${ar.mevcutKm} KM`,
                                `Sorumlu Sürücü/Personel: ${sorumluUser ? `${sorumluUser.ad} ${sorumluUser.soyad}` : "Belirtilmemiş"}`,
                                `Son Muayene Tarihi: ${ar.muayeneTarihi || "Belirtilmemiş"}`,
                                `Bir Sonraki Muayene Kalan: ${daysRemaining} Gün`,
                                `Yağ Değişimi Hedef: ${ar.yagBakimKm} KM (Kalan: ${oilRemaining} KM)`,
                                `Ağır Bakım Hedef: ${nextHeavyService} KM (Kalan: ${heavyRemaining} KM)`,
                                `---------------------------------------------`,
                                `KM VE SAYAÇ HAREKET LOGLARI (${vLogs.length} Adet):`,
                                ...vLogs.map((l, idx) =>
                                  `[${idx + 1}] Tarih: ${l.tarih} | Sürücü: ${l.surucu} | Sabah: ${l.sabahKm} KM | Akşam: ${l.aksamKm} KM | Yapılan Yol: ${l.fark || 0} KM`
                                )
                              ];
                              const blob = new Blob([txtLines.join('\n')], { type: 'text/plain;charset=utf-8' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `Kibritci_Arac_Gecmis_Raporu_${ar.plaka}.txt`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                              alert(`${ar.plaka} plakalı aracın teknik geçmiş raporu başarıyla indirildi.`);
                            }}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 py-1 rounded font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>📊 Geçmiş Raporla</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditArac(ar)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-1 px-2.5 rounded font-bold transition flex items-center justify-center cursor-pointer"
                            title="Aracı Düzenle"
                          >
                            <span>✏️ Düzenle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`${ar.plaka} plakalı aracı silmek istediğinize emin misiniz?`)) {
                                setAraclar(prev => prev.filter(a => a.id !== ar.id));
                                alert("Araç başarıyla silindi.");
                              }
                            }}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-1 px-2 rounded font-bold transition flex items-center justify-center cursor-pointer"
                            title="Aracı Sil"
                          >
                            <span>🗑️ Sil</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {aracSubTab === 'km_takip' && (
            
            /* morning/evening km log tracker */
            <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
              
              {/* Mileage logger submission form */}
              <div className="w-full lg:w-[380px] lg:shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
                <div className="bg-amber-500 text-slate-100 p-4 shrink-0">
                  <span className="text-[10px] font-bold tracking-widest text-amber-100 uppercase uppercase">Günlük Sefer Takibi</span>
                  <h3 className="font-display font-semibold text-sm">⏱️ Sabah - Akşam Odomat Kaydı</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Seyrüsefer Yapacak Araç Seçimi *</label>
                    <select 
                      className="w-full text-xs font-bold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg cursor-pointer"
                      value={formKmPlaka}
                      onChange={(e) => {
                        const plate = e.target.value;
                        setFormKmPlaka(plate);
                        const parentAr = araclar.find(a => a.plaka === plate);
                        if (parentAr) {
                          setFormSabahKm(parentAr.mevcutKm);
                        }
                      }}
                    >
                      {araclar.map(a => (
                        <option key={a.id} value={a.plaka}>{a.plaka} - {a.markaModel}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Sefer Tarihi *</label>
                    <input 
                      type="date"
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                      value={formKmTarih}
                      onChange={(e) => setFormKmTarih(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Sefer Sürücüsü (Görevli Operatör) *</label>
                    <select
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg cursor-pointer"
                      value={formKmDriver}
                      onChange={(e) => setFormKmDriver(e.target.value)}
                    >
                      {personeller.map(p => (
                        <option key={p.id} value={`${p.ad} ${p.soyad}`}>{p.ad} {p.soyad} ({p.gorev})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t pt-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">☀️ SABAH KM SAYAÇ</label>
                      <input 
                        type="number"
                        className="w-full text-xs font-mono font-bold text-slate-700 mt-1 p-2 bg-slate-100 border border-[#e2e8f0] rounded-lg"
                        value={formSabahKm}
                        onChange={(e) => setFormSabahKm(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-800 uppercase">🌙 AKŞAM KM SAYAÇ</label>
                      <input 
                        type="number"
                        className="w-full text-xs font-mono font-bold text-slate-800 mt-1 p-2 bg-slate-50 border border-slate-200 focus:outline-none  rounded-lg"
                        placeholder="Sayacı yazın..."
                        value={formAksamKm || ""}
                        onChange={(e) => setFormAksamKm(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Sefer Açıklaması / Detay *</label>
                    <input 
                      type="text"
                      className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] focus:outline-none  rounded-lg"
                      placeholder="Örn: Saha beton dökümü, şantiye içi sevk vb."
                      value={formKmAciklama}
                      onChange={(e) => setFormKmAciklama(e.target.value)}
                    />
                  </div>

                  {formAksamKm > formSabahKm && (
                    <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-center">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">HESAPLANAN GÜNLÜK FARK</span>
                      <strong className="text-sm text-emerald-800 font-mono font-bold">
                        {formAksamKm - formSabahKm} Kilometre Yol Yapıldı
                      </strong>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t bg-slate-50">
                  <button 
                    onClick={handleCreateKmLog}
                    className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl shadow cursor-pointer transition active:scale-95"
                  >
                    ⏱️ Sabah-Akşam Hareketini Sistemi Uygula
                  </button>
                </div>
              </div>

              {/* History list box of morning/evening mileage difference records */}
              <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex justify-between items-center shrink-0">
                  <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
                    Kronolojik Sefer Sayacı Raporları
                  </h4>
                  <span className="text-[10px] text-slate-800 font-bold bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                    Aradaki Fark Kilometresi Otomatik Hesaplanır
                  </span>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  <table className="w-full text-[11px] border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold border-b">
                        <th className="p-2.5">Sefer Tarih</th>
                        <th className="p-2.5">Plaka</th>
                        <th className="p-2.5">Sürücü Operatör</th>
                        <th className="p-2.5 text-right">Sabah Sayaç</th>
                        <th className="p-2.5 text-right">Akşam Sayaç</th>
                        <th className="p-2.5 text-right text-indigo-700 font-bold">Günlük Sefer Farkı</th>
                        <th className="p-2.5">Açıklama</th>
                        <th className="p-2.5 text-center">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-medium text-slate-700 text-xs">
                      {aracKmLoglari.map(lg => (
                        <tr key={lg.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-2.5 font-mono text-slate-500">{lg.tarih}</td>
                          <td className="p-2.5 font-bold font-mono text-slate-900">{lg.plaka}</td>
                          <td className="p-2.5 text-slate-800">👤 {lg.surucu}</td>
                          <td className="p-2.5 text-right font-mono text-slate-400">{lg.sabahKm} KM</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">{lg.aksamKm} KM</td>
                          <td className="p-2.5 text-right text-indigo-700 font-bold font-mono bg-indigo-50/30">
                            +{lg.fark} KM
                          </td>
                          <td className="p-2.5 text-slate-500 font-sans italic">{lg.aciklama || 'Belirtilmedi'}</td>
                          <td className="p-2.5 text-center space-x-1 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditingKmLog(lg)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] rounded font-bold transition cursor-pointer"
                            >
                              Düzelt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUndoKmLog(lg.id)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] rounded font-bold transition cursor-pointer"
                            >
                              Geri Al
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {aracSubTab === 'bakim_raporu' && (
            <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
              <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
                    🔧 Vasıta Bakım Sayaçları &amp; Muayene Raporu
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">
                    Muayenesi yaklaşan/geçen ve yağ değişim sayaçları dolmak üzere olan araçların takibi.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const el = document.querySelector('.bakim-raporu-print-area');
                    if (el) {
                      const printWindow = window.open('', '_blank');
                      printWindow?.document.write(`
                        <html>
                          <head>
                            <title>Bakım Sayaç Raporu</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                          </head>
                          <body class="p-8 bg-white text-slate-900 font-sans">
                            <div class="mb-4">${kibritciLogoHtml(44)}</div>
                            <h2 class="text-lg font-bold mb-4 uppercase">ARAÇ SAYAÇ & BAKIM RAPORU</h2>
                            ${el.innerHTML}
                          </body>
                        </html>
                      `);
                      printWindow?.document.close();
                      printWindow?.print();
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-[10.5px] px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  <Printer size={13} />
                  <span>Raporu Yazdır</span>
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 bakim-raporu-print-area">
                <CorporateReportLayout orientation="landscape" docCode="KBR-ARAC-BAKIM-RAPORU">
                <table className="w-full text-[11px] border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold border-b">
                      <th className="p-2.5">Plaka</th>
                      <th className="p-2.5">Marka &amp; Model</th>
                      <th className="p-2.5">Tür</th>
                      <th className="p-2.5">Sorumlu Operatör</th>
                      <th className="p-2.5 text-right">Mevcut Sayaç</th>
                      <th className="p-2.5 text-right">Yağ Bakımı Hedef</th>
                      <th className="p-2.5 text-right">Bakıma Kalan KM</th>
                      <th className="p-2.5">Muayene Tarihi</th>
                      <th className="p-2.5 text-right">Muayene Kalan Gün</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-medium text-slate-700 text-xs">
                    {araclar.map(a => {
                      const sorumlu = personeller.find(p => p.id === a.sorumluPersonelId);
                      const targetOil = a.yagBakimKm || 10000;
                      const oilRemaining = targetOil - (a.mevcutKm || 0);
                      
                      let muayeneDays = 999;
                      if (a.muayeneTarihi) {
                        const muayene = new Date(a.muayeneTarihi);
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const diffTime = muayene.getTime() - today.getTime();
                        muayeneDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      }

                      let oilStatusClass = "text-slate-800";
                      if (oilRemaining <= 0) {
                        oilStatusClass = "text-rose-650 font-black bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 animate-pulse";
                      } else if (oilRemaining <= 1000) {
                        oilStatusClass = "text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-250";
                      }

                      let muayeneStatusClass = "text-slate-800";
                      if (muayeneDays <= 0) {
                        muayeneStatusClass = "text-rose-650 font-black bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 animate-pulse";
                      } else if (muayeneDays <= 30) {
                        muayeneStatusClass = "text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-250";
                      }

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-2.5 font-bold font-mono text-slate-900">{a.plaka}</td>
                          <td className="p-2.5">{a.markaModel}</td>
                          <td className="p-2.5 text-[10px]">
                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                              a.aracTipi === 'ARAC' ? 'bg-sky-50 text-sky-700 border border-sky-100' :
                              a.aracTipi === 'IS_MAKINESI' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {a.aracTipi === 'ARAC' ? 'Binek/Hafif' :
                               a.aracTipi === 'IS_MAKINESI' ? 'İş Makinesi' : 'Demirbaş'}
                            </span>
                          </td>
                          <td className="p-2.5">
                            {sorumlu ? `👤 ${sorumlu.ad} ${sorumlu.soyad}` : <span className="text-slate-400 italic">Atanmamış</span>}
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold text-slate-650">{(a.mevcutKm || 0).toLocaleString('tr-TR')} KM</td>
                          <td className="p-2.5 text-right font-mono text-slate-400">{(targetOil).toLocaleString('tr-TR')} KM</td>
                          <td className={`p-2.5 text-right font-mono ${oilStatusClass}`}>
                            {oilRemaining <= 0 ? `GEÇTİ! (${Math.abs(oilRemaining).toLocaleString('tr-TR')} KM)` : `${oilRemaining.toLocaleString('tr-TR')} KM`}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500">{a.muayeneTarihi || 'Belirtilmedi'}</td>
                          <td className={`p-2.5 text-right font-mono ${muayeneStatusClass}`}>
                            {muayeneDays <= 0 ? 'GEÇTİ!' : `${muayeneDays} Gün`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </CorporateReportLayout>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🏕️ VIEW: KAMP YÖNETİMİ
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'kamp' && (
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setKampMainView('odalar')}
              className={`px-4 py-2 text-[10px] font-black rounded-lg transition ${
                kampMainView === 'odalar'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🏕️ Oda &amp; Yerleşim
            </button>
            <button
              type="button"
              onClick={() => setKampMainView('kroki')}
              className={`px-4 py-2 text-[10px] font-black rounded-lg transition ${
                kampMainView === 'kroki'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🗺️ Kamp Krokisi
            </button>
            <button
              type="button"
              onClick={() => setKampMainView('faaliyet')}
              className={`px-4 py-2 text-[10px] font-black rounded-lg transition ${
                kampMainView === 'faaliyet'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📋 Faaliyet Takip
            </button>
            <button
              type="button"
              onClick={() => setKampMainView('personel')}
              className={`px-4 py-2 text-[10px] font-black rounded-lg transition ${
                kampMainView === 'personel'
                  ? 'bg-white text-indigo-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              👤 Personel Listesi
            </button>
          </div>

          {kampMainView === 'faaliyet' ? (
            <KampFaaliyetTakipTab
              currentUser={auth.currentUser || undefined}
              personeller={personeller}
            />
          ) : kampMainView === 'kroki' ? (
            <KampKrokiGorunumTab
              kampOdalari={kampOdalari}
              kampKayitlari={kampKayitlari}
              personeller={personeller}
            />
          ) : kampMainView === 'personel' ? (
            <div className="bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm flex-1">
              <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Kamp & Barınma</span>
                  <h3 className="font-display font-semibold text-sm">👤 Kamp Yönetimi Personel Listesi</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const activeTaserons = kampKayitlari.filter(k => k.durum === 'AKTIF').filter(k => {
                        const p = personeller.find(p => p.id === k.personelId);
                        const isAnaFirma = k.firmaTipi === 'ANA_FIRMA' || 
                          (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'KİBRİTÇİ İNŞAAT') ||
                          (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FİRMA') ||
                          (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FIRMA') ||
                          (p?.firmaTipi === 'ANA_FIRMA');
                        const firm = isAnaFirma ? 'KİBRİTÇİ İNŞAAT' : (k.calistigiFirma || p?.firmaAdi || 'TAŞERON').trim().toLocaleUpperCase('tr-TR');
                        if (kampPersonelFirmFilter && firm !== kampPersonelFirmFilter) {
                          return false;
                        }
                        if (!kampPersonelSearch.trim()) return true;
                        const s = kampPersonelSearch.toLowerCase();
                        const name = (p ? `${p.ad} ${p.soyad}` : (k.personelIsim || '')).toLowerCase();
                        const tc = (p?.tcNo || '').toLowerCase();
                        return name.includes(s) || tc.includes(s);
                      });
                      
                      const pdfHtml = generateKampPersonelPdfHtml(activeTaserons, personeller, kampOdalari);
                      const w = window.open('', '_blank');
                      if (w) {
                        w.document.write(pdfHtml);
                        w.document.close();
                      } else {
                        alert('Pop-up engelleyiciyi kaldırıp tekrar deneyin.');
                      }
                    }}
                    className="py-1.5 px-3 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition active:scale-95 flex items-center space-x-1"
                  >
                    <span>🖨️ PDF YAZDIR</span>
                  </button>
                  <select
                    value={kampPersonelFirmFilter}
                    onChange={(e) => setKampPersonelFirmFilter(e.target.value)}
                    className="py-1.5 px-3 text-xs font-semibold rounded-lg bg-white/10 text-white border border-white/20 focus:outline-none focus:ring-1 focus:ring-white [&>option]:text-slate-800"
                  >
                    <option value="">-- Tüm Firmalar --</option>
                    {uniqueTaseronFirms.map((firm) => (
                      <option key={firm} value={firm}>{firm}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="İsim veya TC Ara..."
                      value={kampPersonelSearch}
                      onChange={(e) => setKampPersonelSearch(e.target.value)}
                      className="w-48 pl-8 py-1.5 text-xs font-semibold rounded-lg bg-white/10 text-white placeholder-slate-300 border border-white/20 focus:outline-none focus:ring-1 focus:ring-white"
                    />
                    <span className="absolute left-2.5 top-2 text-slate-300">🔍</span>
                  </div>
                </div>
              </div>
              <div className="flex-grow overflow-y-auto p-0">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 font-bold text-slate-600">Personel / Kimlik</th>
                      <th className="p-3 font-bold text-slate-600">Bağlı Olduğu Firma</th>
                      <th className="p-3 font-bold text-slate-600">Yerleşke / Oda</th>
                      <th className="p-3 font-bold text-slate-600">Kayıt / Giriş Tarihi</th>
                      <th className="p-3 font-bold text-slate-600">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kampKayitlari.filter(k => k.durum === 'AKTIF').filter(k => {
                      const p = personeller.find(p => p.id === k.personelId);
                      const isAnaFirma = k.firmaTipi === 'ANA_FIRMA' || 
                        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'KİBRİTÇİ İNŞAAT') ||
                        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FİRMA') ||
                        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FIRMA') ||
                        (p?.firmaTipi === 'ANA_FIRMA');
                      
                      const firm = isAnaFirma ? 'KİBRİTÇİ İNŞAAT' : (k.calistigiFirma || p?.firmaAdi || 'TAŞERON').trim().toLocaleUpperCase('tr-TR');
                      
                      if (kampPersonelFirmFilter && firm !== kampPersonelFirmFilter) {
                        return false;
                      }
                      if (!kampPersonelSearch.trim()) return true;
                      const s = kampPersonelSearch.toLowerCase();
                      const name = (p ? `${p.ad} ${p.soyad}` : (k.personelIsim || '')).toLowerCase();
                      const tc = (p?.tcNo || '').toLowerCase();
                      return name.includes(s) || tc.includes(s);
                    }).map(k => {
                      const p = personeller.find(p => p.id === k.personelId);
                      const name = p ? `${p.ad} ${p.soyad}` : (k.personelIsim || 'Bilinmiyor');
                      const tc = p?.tcNo ? `TC: ${p.tcNo}` : '';
                      const isAnaFirma = k.firmaTipi === 'ANA_FIRMA' || 
                        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'KİBRİTÇİ İNŞAAT') ||
                        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FİRMA') ||
                        (k.calistigiFirma?.trim().toLocaleUpperCase('tr-TR') === 'ANA FIRMA') ||
                        (p?.firmaTipi === 'ANA_FIRMA');
                      const firm = isAnaFirma ? 'KİBRİTÇİ İNŞAAT' : k.calistigiFirma?.trim() || p?.firmaAdi?.trim() || 'TAŞERON';
                      const room = kampOdalari.find(r => r.id === (k.odaId || k.roomId));
                      
                      return (
                        <tr key={k.id} className="hover:bg-slate-50 transition">
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{name}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{tc}</div>
                          </td>
                          <td className="p-3 font-medium text-slate-700">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] uppercase border border-slate-200">
                              {firm}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            {room ? (
                              <div>
                                <strong className="text-slate-800">Oda {room.odaNo}</strong>
                                <span className="text-[10px] block mt-0.5">({room.yerleskeAdi} / {room.katAdi})</span>
                              </div>
                            ) : (
                              <span className="text-red-500 italic">Oda Atanmamış</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 font-mono">
                            {k.girisTarihi || k.kayitTarihi || '-'}
                          </td>
                          <td className="p-3">
                            <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded text-[10px]">
                              AKTİF
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
          
          {/* Left panel: Room Creation Form & Global stats */}
          <div className="w-full lg:w-[360px] lg:shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Kamp &amp; Barınma</span>
              <h3 className="font-display font-semibold text-sm">🏕️ Oda Açma &amp; Kamp Yönetimi</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              
              {/* Oda Açma Menüsü */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-bold text-[10px] text-slate-800 uppercase block mb-2">🏢 Kamp Yapısı Oluşturma Paneli</span>
                
                {/* Step Sub-Tabs */}
                <div className="flex gap-1 bg-slate-200 p-1 rounded-lg mb-4 text-[9px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCampCreationStep('campus')}
                    className={`flex-1 py-1 rounded transition text-center ${
                      campCreationStep === 'campus' 
                        ? 'bg-slate-900 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    📍 1. Yerleşke
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampCreationStep('floor')}
                    className={`flex-1 py-1 rounded transition text-center ${
                      campCreationStep === 'floor' 
                        ? 'bg-slate-900 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    🏢 2. Kat / Blok
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampCreationStep('room')}
                    className={`flex-1 py-1 rounded transition text-center ${
                      campCreationStep === 'room' 
                        ? 'bg-slate-900 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    🔑 3. Oda Aç
                  </button>
                </div>

                {campCreationStep === 'campus' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-slate-550 font-semibold italic">Önce kampüs / şantiye alanı yerleşkesini tanımlayınız.</p>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Yerleşke (Kamp) Adı</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
                        value={newCampusInput}
                        onChange={(e) => setNewCampusInput(e.target.value)}
                        placeholder="Örn: Kuzey Barınma Yerleşkesi"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateCampus}
                      className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-lg cursor-pointer transition shadow active:scale-95 text-xs"
                    >
                      + Yeni Yerleşke Ekle ve Kaydet
                    </button>

                    <div className="pt-2 border-t mt-2">
                      <span className="text-[9px] text-slate-405 block font-bold uppercase mb-1">Mevcut Yerleşkeler:</span>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {campuses.map(camp => (
                          <div key={camp} className="text-[10px] bg-white p-1 px-2 rounded border font-semibold text-slate-700 flex justify-between items-center group">
                            <span>📍 {camp}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditCampus(camp)}
                                className="text-slate-800 hover:text-slate-800 font-bold p-0.5 hover:bg-slate-50 rounded transition cursor-pointer text-[9px]"
                                title="Düzenle"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCampus(camp)}
                                className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded transition cursor-pointer"
                                title="Yerleşkeyi Sil"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {campCreationStep === 'floor' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-slate-550 font-semibold italic">Seçilen yerleşke içerisine kat, koğuş bloğu veya bölüm tanımlayınız.</p>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Hangi Yerleşkeye?</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg"
                        value={selectedYerleske}
                        onChange={(e) => setSelectedYerleske(e.target.value)}
                      >
                        {campuses.map(camp => (
                          <option key={camp} value={camp}>{camp}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Kat / Blok Adı</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
                        value={newFloorInput}
                        onChange={(e) => setNewFloorInput(e.target.value)}
                        placeholder="Örn: C Blok (1. Kat)"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateFloor}
                      className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-lg cursor-pointer transition shadow active:scale-95 text-xs"
                    >
                      + Bu Yerleşkeye Kat/Blok Ekle ve Kaydet
                    </button>

                    <div className="pt-2 border-t mt-2">
                      <span className="text-[9px] text-slate-405 block font-bold uppercase mb-1">
                        "{selectedYerleske}" Katları:
                      </span>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {(campusFloors[selectedYerleske] || []).length === 0 ? (
                          <span className="text-[10px] text-slate-400 italic block">Tanımlı kat bulunamadı. Lütfen ekleyin.</span>
                        ) : (
                          (campusFloors[selectedYerleske] || []).map(fl => (
                            <div key={fl} className="text-[10px] bg-white p-1 px-2 rounded border font-semibold text-slate-700 flex justify-between items-center group">
                              <span>🏢 {fl}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditFloor(selectedYerleske, fl)}
                                  className="text-slate-800 hover:text-slate-800 font-bold p-0.5 hover:bg-slate-50 rounded transition cursor-pointer text-[9px]"
                                  title="Düzenle"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFloor(selectedYerleske, fl)}
                                  className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded transition cursor-pointer"
                                  title="Kat/Blok Sil"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {campCreationStep === 'room' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Yerleşke Seç *</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg cursor-pointer"
                        value={selectedYerleske}
                        onChange={(e) => setSelectedYerleske(e.target.value)}
                      >
                        {campuses.map(camp => (
                          <option key={camp} value={camp}>{camp}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Kat / Blok Seç *</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg cursor-pointer"
                        value={selectedKat}
                        onChange={(e) => setSelectedKat(e.target.value)}
                      >
                        {(campusFloors[selectedYerleske] || []).map(kat => (
                          <option key={kat} value={kat}>{kat}</option>
                        ))}
                      </select>
                      {(campusFloors[selectedYerleske] || []).length === 0 && (
                        <button
                          type="button"
                          onClick={() => setCampCreationStep('floor')}
                          className="text-[9.5px] text-red-600 font-extrabold hover:underline mt-1 block text-left"
                        >
                          ⚠️ Bu yerleşkede hiç kat yok! Tıkla ve yeni Kat/Blok oluştur.
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Oda No *</label>
                        <input 
                          type="text" 
                          className="w-full text-xs font-bold mt-1 p-2 bg-white border rounded-lg focus:outline-none "
                          value={newRoomNo}
                          onChange={(e) => setNewRoomNo(e.target.value)}
                          placeholder="Oda 105"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Kapasite (Yatak)</label>
                        <input 
                          type="number" 
                          className="w-full text-xs font-bold mt-1 p-1.5 bg-white border rounded-lg"
                          value={newRoomKapasite}
                          onChange={(e) => setNewRoomKapasite(Number(e.target.value))}
                          min={1}
                          max={10}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      disabled={(campusFloors[selectedYerleske] || []).length === 0}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg cursor-pointer transition shadow active:scale-95 disabled:bg-slate-350 disabled:cursor-not-allowed"
                    >
                      + Yeni Koğuş Odası Aç ve Kaydet
                    </button>
                  </div>
                )}
              </div>

              {/* Kamp summary widgets */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-[11px] text-slate-600">
                <span className="font-bold text-[10px] text-slate-500 uppercase block">Barınma Durumu</span>
                <div className="flex justify-between">
                  <span>Toplam Oda Adedi:</span>
                  <strong className="text-slate-800">{kampOdalari.length} Oda</strong>
                </div>
                <div className="flex justify-between">
                  <span>Toplam yerleşik:</span>
                  <strong className="text-emerald-800 text-sm tabular-nums">
                    {kampFirmaOzetToplam.kampta} Kişi
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Toplam Yatak Kapasitesi:</span>
                  <strong className="text-slate-800">
                    {kampOdalari.reduce((acc, current) => acc + current.kapasite, 0)} Yatak
                  </strong>
                </div>

                <div className="pt-2 border-t mt-2 pb-1 space-y-1.5">
                  <span className="font-bold text-[10px] text-slate-800 uppercase block tracking-wide">
                    Firma Bazlı Yerleşim
                  </span>
                  <p className="text-[9px] text-slate-500 leading-snug">
                    Her firmanın kampta <strong>kaç kişi</strong> yerleşik olduğu (aktif konaklama).
                  </p>
                  <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2.5 py-1.5 bg-emerald-50 text-[8px] font-black uppercase tracking-wide text-emerald-900">
                      <span>Firma</span>
                      <span className="text-right min-w-[4.5rem]">Yerleşim</span>
                      <span className="text-right w-10">Oda</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {kampFirmaOzeti.filter((r) => r.kampta > 0).length === 0 ? (
                        <p className="px-2 py-2 text-[10px] text-slate-400">Aktif yerleşim yok.</p>
                      ) : (
                        kampFirmaOzeti
                          .filter((r) => r.kampta > 0)
                          .map((row) => (
                            <div
                              key={row.firma}
                              className="grid grid-cols-[1fr_auto_auto] gap-2 px-2.5 py-2 text-[10px] items-center"
                            >
                              <span className="truncate font-bold text-slate-900" title={row.firma}>
                                {row.firma}
                              </span>
                              <span className="text-right min-w-[4.5rem] font-black tabular-nums text-emerald-700 text-[12px]">
                                {row.kampta} kişi
                              </span>
                              <span className="text-right w-10 font-semibold tabular-nums text-slate-500">
                                {row.odaSayisi}
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2.5 py-2 bg-emerald-50 border-t border-emerald-200 text-[11px] font-black">
                      <span className="text-emerald-950">TOPLAM YERLEŞİM</span>
                      <span className="text-right min-w-[4.5rem] tabular-nums text-emerald-900 text-[13px]">
                        {kampFirmaOzetToplam.kampta} kişi
                      </span>
                      <span className="text-right w-10 text-slate-400">—</span>
                    </div>
                  </div>
                  {kampYerlesimAudit.duplicateSkipped > 0 && (
                    <p className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                      {kampYerlesimAudit.duplicateSkipped} mükerrer aktif kayıt tek kişi sayıldı
                      (ham {kampYerlesimAudit.rawAktifKayit} → {kampYerlesimAudit.uniqueYerlesik}).
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      printKampFirmaYerlesim(personeller, kampKayitlari, {
                        odaToplam: kampOdalari.length,
                        yatakToplam: kampOdalari.reduce((acc, current) => acc + current.kapasite, 0),
                      })
                    }
                    disabled={kampFirmaOzetToplam.kampta === 0}
                    className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded-lg cursor-pointer transition flex items-center justify-center gap-1.5"
                  >
                    <Printer size={14} />
                    Firma Yerleşimini Yazdır
                  </button>
                </div>
                <div className="pt-2 border-t mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => void handleExportKampYerlesimExcel()}
                    disabled={exportingKampExcel || kampOdalari.length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded-lg cursor-pointer transition flex items-center justify-center space-x-1"
                  >
                    <Download size={14} />
                    <span>{exportingKampExcel ? 'Excel hazırlanıyor…' : 'Excel Yerleşim Planı (Logo)'}</span>
                  </button>
                  <button
                    onClick={() => setShowKampKrokiModal(true)}
                    className="w-full bg-[#2563EB] hover:bg-slate-900 text-white font-bold py-2 px-3 rounded-lg cursor-pointer transition flex items-center justify-center space-x-1"
                  >
                    <span>📋 Boş ve Dolu Kroki Raporu</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Lodgings rooms grouped by floor / Block ("1 Kat Bir Kaç Odadan Oluşur") */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Tent size={16} className="text-[#2563EB]" />
                <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest col-span-2">
                  Şantiye Konaklama Yerleşkeleri &amp; Kat / Blok Krokisi
                </h4>
              </div>
              <span className="text-[10px] text-indigo-800 font-bold bg-indigo-50 px-2 py-0.5 rounded-full">
                1 Kat Bir Kaç Odadan Oluşur
              </span>
              {reloadKampData && (
                <button
                  type="button"
                  onClick={handleReloadKampData}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Yenile
                </button>
              )}
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-6 bg-slate-50/20">
              {kampOdalari.length === 0 ? (
                <div className="text-center py-16 text-slate-500 space-y-2">
                  <p className="text-sm font-bold">Henüz açılmış oda yok</p>
                  <p className="text-xs">Sol panelden yerleşke → kat → oda oluşturun. Kampçı Mobil ile senkron çalışır.</p>
                </div>
              ) : (
                groupedKampYapisi.map((campusNode) => (
                  <div key={campusNode.campus} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border-l-4 border-slate-800">
                      <span className="font-bold text-slate-800 text-xs tracking-tight uppercase flex items-center">
                        📍 {campusNode.campus}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        {campusNode.floors.reduce((acc, f) => acc + f.rooms.length, 0)} Oda
                      </span>
                    </div>

                    {campusNode.floors.map((floorNode) => (
                      <div key={`${campusNode.campus}_${floorNode.floor}`} className="space-y-2">
                        {(() => {
                          const floorRoomIds = floorNode.rooms.map(r => r.id);
                          const floorOccupants = kampKayitlari.filter(cr => cr.durum === 'AKTIF' && (floorRoomIds.includes(cr.roomId || '') || floorRoomIds.includes(cr.odaId || '')));
                          
                          const roomFirmMap = new Map();
                          floorOccupants.forEach(cr => {
                            const rid = cr.roomId || cr.odaId || '';
                            const p = personeller.find(p => p.id === cr.personelId);
                            let firmaAdi = '';
                            if (p) {
                                firmaAdi = p.firmaTipi === 'TASERON' ? (p.firmaAdi?.trim() || 'Taşeron (Belirtilmemiş)') : 'KİBRİTÇİ İNŞAAT';
                            } else {
                                firmaAdi = cr.calistigiFirma?.trim() || (cr.firmaTipi === 'TASERON' ? 'Taşeron (Belirtilmemiş)' : 'KİBRİTÇİ İNŞAAT');
                            }
                            if (firmaAdi.length > 15) firmaAdi = firmaAdi.substring(0, 15) + '..';
                            
                            const firms = roomFirmMap.get(rid) || new Set();
                            firms.add(firmaAdi);
                            roomFirmMap.set(rid, firms);
                          });

                          return (
                            <div className="flex flex-col gap-1 bg-slate-100 p-2 rounded-lg border-l-4 border-amber-500 shadow-sm">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800 text-xs tracking-tight uppercase flex items-center">
                                  🏢 {floorNode.floor}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold text-right">
                                  Kayıtlı {floorNode.rooms.length} Oda • <strong className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{floorOccupants.length} Personel</strong>
                                </span>
                              </div>
                              {floorOccupants.length > 0 && (
                                <div className="mt-1 pt-1.5 border-t border-slate-200/60">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">🦅 Kuşbakışı Firma Dağılımı:</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {floorNode.rooms.filter(r => roomFirmMap.has(r.id)).map(r => (
                                      <span key={r.id} className="text-[9px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                        <strong className="text-slate-800">Oda {r.odaNo}</strong>: <span className="italic">{Array.from(roomFirmMap.get(r.id) || []).join(', ')}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {floorNode.rooms.length === 0 ? (
                          <div className="text-[10px] text-slate-400 italic px-2">Bu katta henüz oda yok.</div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {floorNode.rooms.map((room) => {
                              const occupants = kampKayitlari.filter(
                                (cr) => (cr.roomId === room.id || cr.odaId === room.id) && cr.durum === 'AKTIF'
                              );
                              const isFull = occupants.length >= room.kapasite;

                              return (
                                <div key={room.id} className="border border-slate-150 rounded-xl p-3 bg-slate-50/55 hover:bg-white hover:shadow transition duration-150 flex flex-col justify-between space-y-3">
                                  <div className="flex justify-between items-start text-xs border-b pb-1.5 border-slate-100">
                                    <div>
                                      <h5 className="font-bold text-slate-900">{room.yerleskeAdi}</h5>
                                      <p className="text-[9px] text-slate-800 font-semibold uppercase">{room.firmaTipi === 'ANA_FIRMA' ? 'Ana Kadro Lojmanı' : 'Taşeron Müfrezesi'}</p>
                                      <span className="text-[10px] font-bold text-slate-600 mt-1 block">Oda: {room.odaNo}</span>
                                    </div>

                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                      isFull
                                        ? 'bg-rose-100 text-rose-700'
                                        : occupants.length > 0
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      {isFull ? 'DOLU' : occupants.length > 0 ? 'KISMEN DOLU' : 'BOŞ'}
                                    </span>
                                  </div>

                                  <div className="space-y-1.5 min-h-[50px]">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Yatak Doluluğu ({occupants.length} / {room.kapasite})</span>
                                    {occupants.length === 0 ? (
                                      <p className="text-[9px] text-slate-400 italic">Oda şu an tamamen boş.</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {occupants.map((oc) => (
                                          <div key={oc.id} className="flex justify-between items-center bg-white border border-slate-200 px-1.5 py-1 rounded text-[10px]">
                                            <span className="font-bold text-slate-800">👤 {oc.personelIsim}</span>
                                            <button
                                              onClick={() => handleEvictResident(oc)}
                                              className="text-red-500 hover:text-red-700 font-bold transition text-[9px] cursor-pointer"
                                            >
                                              Tahliye Et
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex gap-1.5 mt-2">
                                    {!isFull ? (
                                      <button
                                        onClick={() => setSelectedRoomToAssign(room)}
                                        className="flex-grow bg-slate-50 text-slate-800 hover:bg-slate-900 hover:text-white text-[9px] font-bold py-1.5 rounded-lg border border-slate-200 transition duration-150 cursor-pointer text-center"
                                      >
                                        + Sakin Yerleştir (Elle / DB)
                                      </button>
                                    ) : (
                                      <div className="flex-grow py-1.5 rounded-lg bg-slate-100 border text-center text-slate-400 text-[9px] font-bold">
                                        🚫 Oda Maksimum Dolulukta
                                      </div>
                                    )}
                                    <button
                                      onClick={() => handleEditRoom(room)}
                                      className="px-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg border border-indigo-200 transition duration-150 cursor-pointer flex items-center justify-center text-[10px]"
                                      title="Oda Güncelle"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      onClick={() => handleDeleteRoom(room.id)}
                                      className="px-2 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg border border-rose-200 transition duration-150 cursor-pointer flex items-center justify-center text-[10px]"
                                      title="Odayı Sil"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 🏕️ RESIDENT ASSIGNMENT MODAL POPUP */}
          {selectedRoomToAssign && (
            <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-[440px] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                  <h4 className="font-display font-semibold text-sm">Odaya Personel Atama</h4>
                  <button onClick={resetAssignModal} className="text-slate-400 hover:text-white font-bold cursor-pointer">✖</button>
                </div>

                <div className="p-5 space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-[9px] text-slate-600 block mb-0.5">Atanacak Hedef Oda ve Kat:</span>
                    <p className="font-bold text-slate-800">{selectedRoomToAssign.yerleskeAdi}</p>
                    <span className="text-[10px] text-slate-600 block">{selectedRoomToAssign.kogusNo} · Oda No: {selectedRoomToAssign.odaNo}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setResidentFirmaTipi('ANA_FIRMA')}
                      className={`py-1.5 rounded-lg text-[10px] font-bold ${residentFirmaTipi === 'ANA_FIRMA' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      Ana Firma
                    </button>
                    <button
                      type="button"
                      onClick={() => setResidentFirmaTipi('TASERON')}
                      className={`py-1.5 rounded-lg text-[10px] font-bold ${residentFirmaTipi === 'TASERON' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      Taşeron
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Yerleştirilecek Personel İsmi *</label>
                    <input 
                      type="text"
                      className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-lg  transition focus:outline-none"
                      placeholder="Elle yazın veya aşağıdan seçin"
                      value={residentInputName}
                      onChange={(e) => setResidentInputName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Veritabanından Personel Seç</span>
                    <div className="relative mb-1.5">
                      <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="İsim/görev ara..."
                        value={residentSearchQuery}
                        onChange={(e) => setResidentSearchQuery(e.target.value)}
                        className="w-full text-[10px] bg-white border border-slate-200 rounded-lg pl-7 pr-2 py-1.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto border p-2 rounded-xl bg-slate-100/50">
                      {filteredResidentPersoneller.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setResidentInputName(`${p.ad} ${p.soyad}`);
                            setResidentPersonelId(p.id);
                            if (p.firmaTipi) {
                              setResidentFirmaTipi(p.firmaTipi);
                              if (p.firmaTipi === 'TASERON') {
                                setResidentFirmaKaynak('DB');
                                setResidentInputFirma(p.firmaAdi || (p as any).calistigiFirma || (p as any).firma || '');
                              }
                            } else if ((p as any).calistigiFirma || (p as any).firma) {
                              setResidentFirmaTipi('TASERON');
                              setResidentFirmaKaynak('DB');
                              setResidentInputFirma((p as any).calistigiFirma || (p as any).firma || '');
                            } else {
                              setResidentFirmaTipi('ANA_FIRMA');
                            }
                          }}
                          className="text-[10px] text-left bg-white border border-slate-200 hover:bg-slate-50 p-1.5 rounded font-medium text-slate-700 transition cursor-pointer flex items-center space-x-1"
                        >
                          <span>👤</span>
                          <span className="truncate">{p.ad} {p.soyad}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {residentFirmaTipi === 'TASERON' && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setResidentFirmaKaynak('DB')}
                          className={`py-1 rounded text-[9px] font-bold ${residentFirmaKaynak === 'DB' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}
                        >
                          DB Taşeron
                        </button>
                        <button
                          type="button"
                          onClick={() => setResidentFirmaKaynak('MANUAL')}
                          className={`py-1 rounded text-[9px] font-bold ${residentFirmaKaynak === 'MANUAL' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}
                        >
                          Elle Gir
                        </button>
                      </div>
                      {residentFirmaKaynak === 'DB' ? (
                        <select
                          className="w-full text-xs p-2 border rounded-lg"
                          value={residentInputFirma}
                          onChange={(e) => setResidentInputFirma(e.target.value)}
                        >
                          <option value="">-- Taşeron Seç --</option>
                          {taseronCariler.map((c) => (
                            <option key={c.id} value={c.unvan}>{c.unvan}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="w-full text-xs p-2 border rounded-lg"
                          placeholder="Taşeron firma adı"
                          value={residentInputFirma}
                          onChange={(e) => setResidentInputFirma(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
                  <button onClick={resetAssignModal} className="bg-slate-150 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl transition">İptal</button>
                  <button
                    onClick={handleAssignResident}
                    disabled={assigningResident}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold py-2 px-4 rounded-xl transition shadow active:scale-95"
                  >
                    {assigningResident ? 'Kaydediliyor…' : 'Odaya Sakin Olarak Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🏗️ VIEW: SAHA FAALİYETLERİ
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'saha' && (
        <div className="flex-1 flex flex-col min-h-0 relative">
          
          <div className="flex bg-slate-100 p-1.5 rounded-xl w-max mb-4 shrink-0 mx-auto lg:mx-0">
            <button 
              className={`px-5 py-2 rounded-lg text-xs font-black tracking-wide transition-all duration-200 ${sahaTabView === 'KOLAJ' ? 'bg-white shadow text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setSahaTabView('KOLAJ')}
            >
              📷 Güncel Faaliyetler (Kolaj)
            </button>
            <button 
              className={`px-5 py-2 rounded-lg text-xs font-black tracking-wide transition-all duration-200 ${sahaTabView === 'KAYIT' ? 'bg-white shadow text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setSahaTabView('KAYIT')}
            >
              📝 Veri Girişi & Yönetim
            </button>
            <button 
              className={`px-5 py-2 rounded-lg text-xs font-black tracking-wide transition-all duration-200 ${sahaTabView === 'PROGRAM' ? 'bg-white shadow text-[#2563EB]' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setSahaTabView('PROGRAM')}
            >
              📅 İş Programı Yönetimi
            </button>
          </div>

          {sahaTabView === 'KOLAJ' && (
            <div className="flex-1 bg-white border shadow-sm rounded-2xl overflow-hidden relative">
              <SahaKolajScreen currentUser={auth.currentUser || undefined} sahaFaaliyetleri={sahaFaaliyetleri} programliFaaliyetler={[]} />
            </div>
          )}

          {sahaTabView === 'PROGRAM' && setProgramliFaaliyetler && (
            <div className="flex-1 bg-white border shadow-sm rounded-2xl overflow-hidden relative">
              <ProgramliFaaliyetScreen 
                programliFaaliyetler={programliFaaliyetler}
                setProgramliFaaliyetler={setProgramliFaaliyetler}
                currentUser={auth.currentUser || undefined}
              />
            </div>
          )}

          {sahaTabView === 'KAYIT' && (
            <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0 lg:items-start">
          
          {/* Creator drawer */}
          <div className="w-full lg:w-[380px] lg:shrink-0 lg:self-start bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Saha Görev Kaydı</span>
              <h3 className="font-display font-semibold text-sm">🏗️ Günlük İmalat Girişi</h3>
            </div>

            <div className="overflow-y-auto max-h-[min(72vh,calc(100vh-14rem))] p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Faaliyet Tarihi *</label>
                <input
                  type="date"
                  value={sahaKayitTarihi}
                  onChange={(e) => {
                    setSahaKayitTarihi(e.target.value);
                    setSelectedFieldStaff([]);
                  }}
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none "
                />
                <p className="text-[9px] text-slate-400 mt-1">Personel listesi seçilen tarihte yoklamada &quot;Geldi&quot; olan ve başka faaliyete atanmamış kişilerden oluşur.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İş Niteliği / Yapılan İmalat *</label>
                <div className="grid grid-cols-2 gap-2 mt-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setFaaliyetTipi('NORMAL')}
                    className={`py-2 px-2 rounded-lg text-[10px] font-bold border ${
                      faaliyetTipi === 'NORMAL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Normal Saha Faaliyeti
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaaliyetTipi('MESAI_SAHA')}
                    className={`py-2 px-2 rounded-lg text-[10px] font-bold border ${
                      faaliyetTipi === 'MESAI_SAHA' ? 'bg-amber-500 text-slate-950 border-amber-600' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Mesai Saha Faaliyeti
                  </button>
                </div>
                {faaliyetTipi === 'MESAI_SAHA' && (
                  <p className="text-[9px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-2">
                    Girilen mesai saatleri Yoklama ve Puantaj sekmesine otomatik aktarılır.
                  </p>
                )}
                <input 
                  type="text"
                  placeholder="Örn: C30 Beton Dökümü, Demir Bağlama vb."
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none "
                  value={sahaNitelik}
                  onChange={(e) => setSahaNitelik(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Parsel</label>
                  <select 
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg cursor-pointer"
                    value={sahaParsel}
                    onChange={(e) => {
                      const parsel = e.target.value;
                      setSahaParsel(parsel);
                      setSahaBlok(defaultBlokForParsel(parsel));
                    }}
                  >
                    {Object.keys(PARSEL_BLOK_MAP).map((parselKey) => (
                      <option key={parselKey} value={parselKey}>{parselKey}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Blok</label>
                  <select 
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg cursor-pointer"
                    value={sahaBlok}
                    onChange={(e) => setSahaBlok(e.target.value)}
                  >
                    {(PARSEL_BLOK_MAP[sahaParsel] || []).length === 0 ? (
                      <option value="">- Blok Yok -</option>
                    ) : (
                      (PARSEL_BLOK_MAP[sahaParsel] || []).map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Günlük Faaliyet &amp; Metraj Notu *</label>
                <textarea 
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
                  rows={4}
                  placeholder="Yapılan imalat detaylarını, dökülen beton metrajını vb. yazın..."
                  value={sahaAciklama}
                  onChange={(e) => setSahaAciklama(e.target.value)}
                />
              </div>

              {/* WORKER COUNT INPUTS */}
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Çalışan Usta Sayısı</label>
                  <input 
                    type="number" 
                    min={0}
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={sahaUstaSayisi}
                    onChange={(e) => setSahaUstaSayisi(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Çalışan Düz İşçi Sayısı</label>
                  <input 
                    type="number" 
                    min={0}
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={sahaIsciSayisi}
                    onChange={(e) => setSahaIsciSayisi(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[10px] text-slate-500 block uppercase">DB Personel Görevlendirme (Yeni Metod)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const usta = selectedFieldStaffList.filter((p) => String(p.gorev || '').toLocaleUpperCase('tr-TR').includes('USTA')).length;
                      const isci = Math.max(0, selectedFieldStaffList.length - usta);
                      setSahaUstaSayisi(usta);
                      setSahaIsciSayisi(isci);
                    }}
                    className="text-[10px] bg-slate-900 hover:bg-slate-900 text-white px-2 py-1 rounded-lg font-bold cursor-pointer"
                  >
                    Seçimden Sayıyı Doldur
                  </button>
                </div>
                <input
                  type="text"
                  value={sahaStaffSearch}
                  onChange={(e) => setSahaStaffSearch(e.target.value)}
                  placeholder="Personel adı/görev ara..."
                  className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                />
                <div className="max-h-32 overflow-y-auto grid grid-cols-1 gap-1 pr-1">
                  {filteredStaffPool.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic py-2 px-1">
                      {sahaKayitTarihi} tarihinde görevlendirilebilir personel yok (Geldi işaretli ve başka faaliyete atanmamış).
                    </p>
                  )}
                  {filteredStaffPool.map((p) => {
                    const isSelected = selectedFieldStaff.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setSelectedFieldStaff((prev) =>
                            prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                          )
                        }
                        className={`text-left text-[10px] border rounded-lg px-2 py-1.5 font-semibold cursor-pointer transition ${isSelected ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                        {isSelected ? '✓ ' : ''}{p.ad} {p.soyad} · {p.gorev || 'Görevsiz'}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[10px] text-slate-600 font-semibold">
                  Seçili Personel: {selectedFieldStaffList.length}
                </div>
                {faaliyetTipi === 'MESAI_SAHA' && selectedFieldStaff.length > 0 && (
                  <div className="space-y-1.5 border border-amber-200 bg-amber-50/50 rounded-lg p-2 mt-2">
                    <div className="text-[9px] font-black text-amber-800 uppercase">Personel Mesai Saatleri</div>
                    {selectedFieldStaff.map((pid) => {
                      const p = personeller.find((x) => x.id === pid);
                      if (!p) return null;
                      return (
                        <div key={pid} className="flex items-center justify-between gap-2 bg-white border border-amber-100 rounded-lg px-2 py-1">
                          <span className="text-[10px] font-semibold text-slate-800">{p.ad} {p.soyad}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={14}
                              step={0.5}
                              value={personelMesaiSaatleri[pid] ?? 0}
                              onChange={(e) =>
                                setPersonelMesaiSaatleri((prev) => ({
                                  ...prev,
                                  [pid]: normalizeSahaMesaiHours(parseFloat(e.target.value) || 0),
                                }))
                              }
                              className="w-16 text-center text-[10px] font-mono font-bold border border-slate-200 rounded-lg py-1"
                            />
                            <span className="text-[9px] text-slate-500">sa</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Photo uploader — max 5 (Formen mobil ile aynı) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-[10px] text-slate-500 block">Saha Fotoğrafları</span>
                    <span className="text-[9px] text-slate-400 block">
                      {sahaFotoUrls.length === 0
                        ? 'Görsel yüklenmedi — birden fazla seçebilirsiniz'
                        : `${sahaFotoUrls.length} fotoğraf yüklendi`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      {sahaFotoUrls.length}/{MAX_SAHA_FOTO_COUNT}
                    </span>
                    <label
                      className={`bg-slate-900 hover:bg-black text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 cursor-pointer shadow-sm transition ${
                        sahaFotoUrls.length >= MAX_SAHA_FOTO_COUNT ? 'opacity-40 pointer-events-none' : ''
                      }`}
                    >
                      <FileUp size={12} />
                      <span>Dosya Seç</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={sahaFotoUrls.length >= MAX_SAHA_FOTO_COUNT}
                        onChange={handleSahaPhotoChange}
                      />
                    </label>
                  </div>
                </div>
                {sahaFotoUrls.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {sahaFotoUrls.map((url, idx) => (
                      <div key={`${idx}-${url.slice(0, 24)}`} className="relative border rounded-lg overflow-hidden bg-black/5 aspect-square">
                        <img src={url} alt={`Saha ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveSahaFoto(idx)}
                          className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold cursor-pointer shadow"
                          title="Fotoğrafı kaldır"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              {editingSahaId ? (
                <div className="flex flex-col space-y-2">
                  <button 
                    onClick={handleSaveSahaFaaliyeti}
                    className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer font-sans"
                  >
                    Saha Faaliyetini Güncelle
                  </button>
                  <button 
                    onClick={handleCancelEditSaha}
                    className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 rounded-xl transition cursor-pointer font-sans"
                  >
                    Düzenlemeyi İptal Et
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleSaveSahaFaaliyeti}
                  className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer font-sans"
                >
                  Raporu Veritabanına İşle
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-col space-y-2.5 shrink-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Building2 size={16} className="text-[#2563EB]" />
                  <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Saha Faaliyet İzleme Merkezi</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !sahaArchiveOpen;
                      setSahaArchiveOpen(next);
                      if (next && sahaArchives.length === 0) void loadSahaArchiveList();
                    }}
                    className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg shadow transition cursor-pointer"
                  >
                    🗄️ Faaliyet Arşivi
                  </button>
                  <button
                    onClick={() => setSahaReportModal(true)}
                    className="text-[10px] bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold px-2.5 py-1 rounded-lg shadow transition duration-150 flex items-center space-x-1 cursor-pointer"
                  >
                    <span>🖨️ Saha Aktif Raporu (Günlük / Aylık)</span>
                  </button>
                </div>
              </div>
              {sahaArchiveOpen && (
                <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-indigo-900 font-semibold">
                      Otomatik yedekler (fotoğraflar dahil). Formen Mobil ve bu sekme aynı veriyi paylaşır.
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadSahaArchiveList()}
                      disabled={sahaArchiveLoading}
                      className="text-[10px] bg-indigo-700 text-white px-2 py-1 rounded font-bold disabled:opacity-50"
                    >
                      {sahaArchiveLoading ? '...' : 'Yenile'}
                    </button>
                  </div>
                  {sahaArchives.length === 0 ? (
                    <p className="text-[10px] text-slate-500">Henüz arşiv kaydı yok.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-indigo-100 rounded-lg bg-white">
                      <table className="w-full text-[10px]">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left p-1.5">Tarih</th>
                            <th className="text-left p-1.5">İş</th>
                            <th className="text-left p-1.5">Parsel/Blok</th>
                            <th className="text-right p-1.5">Foto</th>
                            <th className="text-right p-1.5">İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sahaArchives.map((a) => (
                            <tr key={a.id} className="border-t">
                              <td className="p-1.5">{new Date(a.olusturmaTarihi).toLocaleString('tr-TR')}</td>
                              <td className="p-1.5">{a.isNiteligi || '-'}</td>
                              <td className="p-1.5">{a.parsel}/{a.blok}</td>
                              <td className="p-1.5 text-right">{a.fotoSayisi}</td>
                              <td className="p-1.5 text-right">
                                <button
                                  type="button"
                                  disabled={sahaArchiveRestoringId === a.id}
                                  onClick={() => void handleRestoreSahaArchive(a.id)}
                                  className="bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold disabled:opacity-50"
                                >
                                  Geri Yükle
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSahaSubTab('tum')} className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${sahaSubTab === 'tum' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-250'}`}>Tüm Kayıtlar</button>
                <button type="button" onClick={() => setSahaSubTab('formen')} className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${sahaSubTab === 'formen' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-250'}`}>Formen Gönderimleri</button>
                <button type="button" onClick={() => setSahaSubTab('takvim')} className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${sahaSubTab === 'takvim' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-250'}`}>Tarih Cetveli</button>
                <button type="button" onClick={() => setSahaSubTab('gun_arsiv')} className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${sahaSubTab === 'gun_arsiv' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-250'}`}>Gün Rapor Arşivi</button>
                <button type="button" onClick={() => setSahaSubTab('parsel_analiz')} className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${sahaSubTab === 'parsel_analiz' ? 'bg-violet-600 text-white border-violet-700' : 'bg-white text-slate-700 border-slate-250'}`}>Parsel Blok Analiz</button>
              </div>
              {sahaSubTab === 'tum' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="relative md:col-span-2">
                    <input
                      type="text"
                      placeholder="İş niteliği, açıklama veya parsel ara..."
                      value={sahaSearchKeyword}
                      onChange={(e) => setSahaSearchKeyword(e.target.value)}
                      className="w-full bg-white text-xs text-slate-800 border border-slate-250 rounded-lg py-1.5 pl-3 pr-8 placeholder-slate-400 focus:outline-none  transition font-medium"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={tumKayitTarihFiltre}
                      onChange={(e) => setTumKayitTarihFiltre(e.target.value)}
                      className="w-full text-xs border border-slate-250 rounded-lg px-2 py-1.5"
                    />
                    {tumKayitTarihFiltre && (
                      <button
                        type="button"
                        onClick={() => setTumKayitTarihFiltre('')}
                        className="text-[10px] border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 rounded-lg font-semibold cursor-pointer"
                      >
                        Temizle
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {sahaSubTab === 'tum' &&
              renderSahaFaaliyetList(filteredTumSahaFaaliyetleri)}

            {sahaSubTab === 'formen' && (
              <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50/20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="date" value={formenTarihFiltre} onChange={(e) => setFormenTarihFiltre(e.target.value)} className="text-xs border border-slate-250 rounded-lg px-2 py-1.5" />
                  <input type="text" value={gunRaporNotu} onChange={(e) => setGunRaporNotu(e.target.value)} placeholder="Gün raporu notu (opsiyonel)" className="text-xs border border-slate-250 rounded-lg px-2 py-1.5 md:col-span-2" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleIceriAlVeGunRaporla} className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer">
                    İçeri Al ve Günü Raporla
                  </button>
                  <button
                    onClick={() => {
                      if (!formenTarihFiltre) {
                        alert('Gün detayı için önce tarih seçin.');
                        return;
                      }
                      openSahaGunDetay(formenTarihFiltre);
                    }}
                    className="text-[11px] bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer"
                  >
                    Gün Detayı Aç
                  </button>
                  {formenTarihFiltre && (
                    <button onClick={() => setFormenTarihFiltre('')} className="text-[11px] bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-bold cursor-pointer">
                      Tüm Tarihler
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-700">Formen Günlük Kayıtları ({filteredFormenGunlukRaporlari.length})</div>
                  {filteredFormenGunlukRaporlari.length === 0 && (
                    <div className="border border-dashed border-slate-250 rounded-xl p-4 text-xs text-slate-500">
                      Seçili filtreye uygun formen günlük kaydı bulunamadı.
                    </div>
                  )}
                  {filteredFormenGunlukRaporlari.map((rapor) => (
                    <div key={rapor.id} className="bg-white border border-slate-200 rounded-xl p-3 text-xs">
                      <div className="flex justify-between items-center gap-2">
                        <div className="font-bold text-slate-800">{rapor.tarih} · Formen Günlük Raporu</div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-800 font-bold">
                          {(rapor.gonderen || rapor.gonderenFormen || 'FORMEN').split('@')[0]}
                        </span>
                      </div>
                      <p className="text-slate-500 mt-1">Toplam ekip: {rapor.toplamEkip || 0} · Faaliyet: {Array.isArray(rapor.faaliyetler) ? rapor.faaliyetler.length : 0}</p>
                      {(rapor.genelNotlar || rapor.ozetMetin) && (
                        <p className="text-slate-700 mt-1 line-clamp-2">{rapor.genelNotlar || rapor.ozetMetin}</p>
                      )}
                    </div>
                  ))}
                </div>
                {renderSahaFaaliyetList(filteredFormenFaaliyetleri)}
              </div>
            )}

            {sahaSubTab === 'takvim' && (
              <div className="flex-grow overflow-y-auto p-4 bg-slate-50/20">
                <div className="flex items-center gap-2 mb-3">
                  <input type="month" value={sahaTakvimAy} onChange={(e) => setSahaTakvimAy(e.target.value)} className="text-xs border border-slate-250 rounded-lg px-2 py-1.5" />
                  <span className="text-[11px] text-slate-500">Tarihe çift tıklayarak gün pop-up ekranını açabilirsiniz.</span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
                    <div key={d} className="text-[10px] font-bold text-slate-500 text-center">{d}</div>
                  ))}
                  {sahaTakvimGunleri.map((d) => {
                    const dayCount = sahaFaaliyetleri.filter((sf) => normalizeDateKey(sf.tarih) === d.date).length;
                    const dayFormen = sahaFaaliyetleri.filter((sf) => normalizeDateKey(sf.tarih) === d.date && sf.kaynakEkran === 'FORMEN_MOBIL').length;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onDoubleClick={() => openSahaGunDetay(d.date)}
                        onClick={() => setSelectedSahaGun(d.date)}
                        className={`min-h-[64px] rounded-xl border p-2 text-left cursor-pointer transition ${selectedSahaGun === d.date ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <div className="text-[11px] font-bold text-slate-800">{d.day}</div>
                        <div className="text-[9px] text-slate-500 mt-1">Faaliyet: {dayCount}</div>
                        <div className="text-[9px] text-amber-700">Formen: {dayFormen}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sahaSubTab === 'gun_arsiv' && (
              <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50/20">
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={gunArsivTarihFiltre}
                    onChange={(e) => setGunArsivTarihFiltre(e.target.value)}
                    className="text-xs border border-slate-250 rounded-lg px-2 py-1.5"
                  />
                  {gunArsivTarihFiltre && (
                    <button
                      type="button"
                      onClick={() => setGunArsivTarihFiltre('')}
                      className="text-[10px] border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 rounded-lg font-semibold cursor-pointer"
                    >
                      Tüm Tarihler
                    </button>
                  )}
                </div>
                {filteredDisplayGunRaporArsivi.length === 0 && (
                  <div className="border border-dashed border-slate-250 rounded-xl p-4 text-xs text-slate-500">
                    Henüz arşivlenmiş gün raporu yok.
                  </div>
                )}
                {filteredDisplayGunRaporArsivi.map((r) => (
                  <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 text-xs">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-slate-800">{r.tarih} Gün Raporu</div>
                      <button onClick={() => handlePrintSahaGun(r.tarih)} className="text-[10px] bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded-lg cursor-pointer">Yazdır</button>
                    </div>
                    <p className="text-slate-500 mt-1">Toplam faaliyet: {r.faaliyetAdet} · Formen: {r.formenFaaliyetAdet}</p>
                    <p className="text-slate-500">Yoklama: Geldi {r.yoklamaOzet.gelen} / Yok {r.yoklamaOzet.yok} / İzinli {r.yoklamaOzet.izinli} / Raporlu {r.yoklamaOzet.raporlu}</p>
                    {r.aciklama && <p className="text-slate-600 mt-1">{r.aciklama}</p>}
                  </div>
                ))}
              </div>
            )}

            {sahaSubTab === 'parsel_analiz' && (
              <ParselBlokAnalizPanel sahaFaaliyetleri={sahaFaaliyetleri} />
            )}
          </div>

          {showSahaGunModal && (
            <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-3">
              <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[88vh] overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{selectedSahaGun} Günlük Saha + Yoklama Detayı</h3>
                    <p className="text-[11px] text-slate-500">Takvimden çift tıklayarak açılan günlük izleme penceresi</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handlePrintSahaGun(selectedSahaGun)} className="text-[11px] bg-slate-700 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg font-bold cursor-pointer">Yazdır</button>
                    <button onClick={() => setShowSahaGunModal(false)} className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer">Kapat</button>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {(() => {
                    const yoklama = buildYoklamaSummaryForDate(selectedSahaGun);
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">Geldi: <strong>{yoklama.gelen}</strong></div>
                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2">Yok: <strong>{yoklama.yok}</strong></div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">İzinli: <strong>{yoklama.izinli}</strong></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">Raporlu: <strong>{yoklama.raporlu}</strong></div>
                      </div>
                    );
                  })()}
                  <div className="text-xs font-bold text-slate-700">Günlük Saha Faaliyetleri ({daySahaFaaliyetleri.length})</div>
                  {daySahaFaaliyetleri.length === 0 && (
                    <div className="text-xs text-slate-500 border border-dashed border-slate-250 rounded-lg p-3">Bu gün için saha faaliyet kaydı bulunmadı.</div>
                  )}
                  {daySahaFaaliyetleri.map((sf) => (
                    <div key={sf.id} className="border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-bold text-slate-800">{sf.isNiteligi}</div>
                      <div className="text-slate-500">{sf.parsel} / {sf.blok} · Kaynak: {sf.kaynakEkran || 'IDARI_SAHA'}</div>
                      <div className="text-slate-700">{sf.aciklama}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          📜 VIEW: HAZIR TUTANAKLAR (Taşındı -> PersonelIzinScreen)
          ───────────────────────────────────────────────────────────── */}

      {/* ─────────────────────────────────────────────────────────────
          💼 VIEW: CARI & STOK KARTLARI
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'cari_stok' && (
        <div className="flex-grow flex flex-col font-sans gap-6 overflow-hidden">
          
          {/* Subsub navigation layout */}
          <div className="flex space-x-2 border-b border-slate-200 shrink-0">
            <button
              onClick={() => setCsTab('cari')}
              className={`px-3 py-1.5 text-xs font-bold transition cursor-pointer border-b-2 ${
                csTab === 'cari' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              🏢 Cari Kartlar Kataloğu
            </button>
            <button
              onClick={() => setCsTab('stok')}
              className={`px-3 py-1.5 text-xs font-bold transition cursor-pointer border-b-2 ${
                csTab === 'stok' ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              📦 Stok Kartları Kataloğu
            </button>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0 lg:items-start">
            {csTab === 'cari' ? (
              <>
                {/* Form left */}
                <div className="w-full lg:w-[380px] lg:shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-9rem)] bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="bg-[#f59e0b] text-[#0f172a] p-4 shrink-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase">Finansal Rehber</span>
                    <h3 className="font-display font-semibold text-sm">
                      {editingCariId ? '✏️ Cari Kart Düzenle' : '🏢 Yeni Cari Firma Kaydet'}
                    </h3>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Ünvanı *</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        placeholder="Örn: ABC Demir Sanayi"
                        value={newCariUnvan}
                        onChange={(e) => setNewCariUnvan(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Yetkilisi</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        placeholder="Adı Soyadı"
                        value={newCariYetkili}
                        onChange={(e) => setNewCariYetkili(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Telefon No</label>
                        <input 
                          type="text" 
                          className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                          placeholder="05..."
                          value={newCariTelefon}
                          onChange={(e) => setNewCariTelefon(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">E-Posta</label>
                        <input 
                          type="email" 
                          className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                          placeholder="info@firma.com"
                          value={newCariEposta}
                          onChange={(e) => setNewCariEposta(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Vergi No</label>
                        <input 
                          type="text" 
                          className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                          placeholder="10 Haneli"
                          value={newCariVergiNo}
                          onChange={(e) => setNewCariVergiNo(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Vergi Dairesi</label>
                        <input 
                          type="text" 
                          className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                          placeholder="Vergi Dairesi"
                          value={newCariVergiDairesi}
                          onChange={(e) => setNewCariVergiDairesi(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Banka IBAN</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        placeholder="TR..."
                        value={newCariIban}
                        onChange={(e) => setNewCariIban(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Adresi</label>
                      <textarea 
                        rows={2}
                        className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
                        placeholder="Açık adres..."
                        value={newCariAdres}
                        onChange={(e) => setNewCariAdres(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Özel Notlar</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        placeholder="Notlar..."
                        value={newCariNotlar}
                        onChange={(e) => setNewCariNotlar(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Kart Tipi</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg font-bold"
                        value={newCariType}
                        onChange={(e) => setNewCariType(e.target.value as any)}
                      >
                        <option value="TEDARIKCI">Tedarikçi</option>
                        <option value="TASERON">Taşeron</option>
                        <option value="ALICI">Alıcı</option>
                        <option value="SATICI">Satıcı</option>
                        <option value="PERSONEL">Personel</option>
                        <option value="ORTAKLAR">Ortaklar</option>
                        <option value="CARI">Diğer Cari</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-4 border-t bg-slate-50 shrink-0 space-y-2">
                    {editingCariId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCariId(null);
                          setNewCariUnvan('');
                          setNewCariYetkili('');
                          setNewCariTelefon('');
                          setNewCariEposta('');
                          setNewCariVergiNo('');
                          setNewCariVergiDairesi('');
                          setNewCariAdres('');
                          setNewCariIban('');
                          setNewCariNotlar('');
                          setNewCariType('TEDARIKCI');
                        }}
                        className="w-full bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs py-2 rounded-xl border border-slate-200 transition"
                      >
                        Düzenlemeyi İptal
                      </button>
                    )}
                    <button 
                      onClick={handleCreateCari}
                      className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
                    >
                      {editingCariId ? 'Değişiklikleri Kaydet' : 'Cari Firma Kaydet'}
                    </button>
                  </div>
                </div>

                {/* List waybills screen column */}
                <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center space-x-2">
                    <ClipboardList size={16} className="text-[#f59e0b]" />
                    <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Mevcut Cariler</h4>
                  </div>

                  <div className="px-4 pt-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={cariSearchQuery}
                        onChange={(e) => setCariSearchQuery(e.target.value)}
                        placeholder="Cari ara (ünvan, kod, IBAN, tip)..."
                        className="w-full bg-white border border-slate-250 rounded-xl text-xs pl-8 pr-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {filteredCariKartlar.map(cr => (
                      <div key={cr.id} className="border border-slate-100 rounded-xl p-4 bg-white hover:shadow transition">
                        <div className="flex justify-between items-start text-xs border-b pb-2 mb-2">
                          <div>
                            <span className="font-mono bg-slate-100 rounded px-2.5 py-0.5 text-slate-700 font-bold border border-slate-200">{cr.kod}</span>
                            <h5 className="font-bold text-slate-900 mt-2">{cr.unvan}</h5>
                            <p className="text-[9px] text-amber-700 font-bold mt-1">Kart Tipi: {cr.kartTipi}</p>
                          </div>
                      
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            {cr.durum}
                          </span>
                        </div>

                        <p className="text-[10px] text-slate-500 font-medium mb-3">Banka IBAN: {cr.iban || "Girilmemiş"}</p>

                        <div className="flex gap-2 border-t pt-2.5 text-[10px]">
                          <button 
                            onClick={() => {
                              setEditingCariId(cr.id);
                              setNewCariUnvan(cr.unvan);
                              setNewCariType(cr.kartTipi);
                              setNewCariYetkili(cr.yetkili || "");
                              setNewCariTelefon(cr.telefon || "");
                              setNewCariEposta(cr.eposta || "");
                              setNewCariVergiNo(cr.vergiNo || "");
                              setNewCariVergiDairesi(cr.vergiDairesi || "");
                              setNewCariAdres(cr.adres || "");
                              setNewCariIban(cr.iban || "");
                              setNewCariNotlar(cr.notlar || "");
                            }}
                            className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>✏️ Düzelt</span>
                          </button>
                          <button 
                            onClick={() => {
                              void (async () => {
                                if (!window.confirm("Bu cari kartı silmek istediğinize emin misiniz?")) return;
                                try {
                                  const { removeDocument } = await import('../lib/firebase');
                                  await removeDocument('cariKartlar', cr.id);
                                  setCariKartlar(prev => prev.filter(c => c.id !== cr.id));
                                  alert("Cari kart silindi.");
                                } catch (err: any) {
                                  console.error(err);
                                  alert(err?.message || 'Cari kart silinemedi.');
                                }
                              })();
                            }}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>🗑️ Sil</span>
                          </button>
                          <button 
                            onClick={() => setHistoryModalData({ type: 'cari', id: cr.id, name: cr.unvan })}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>📊 Geçmiş Raporla</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Form left */}
                <div className="w-full lg:w-[380px] lg:shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-9rem)] bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="bg-[#2563eb] text-[#ffffff] p-4 shrink-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase">Malzeme Envanteri</span>
                    <h3 className="font-display font-semibold text-sm">
                      {editingStokId ? '✏️ Stok Kartı Düzenle' : '📦 Yeni Stok Kaydı Ekle'}
                    </h3>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Stok &amp; Malzeme Adı *</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        placeholder="Örn: Çimento Portland"
                        value={newStokAdi}
                        onChange={(e) => setNewStokAdi(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Stok Türü / Kategori</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg font-bold"
                        value={newStokKategori}
                        onChange={(e) => setNewStokKategori(e.target.value)}
                      >
                        <option value="Kaba İnşaat İmalatı">Kaba İnşaat İmalatı</option>
                        <option value="Dış Cephe İmalatı">Dış Cephe İmalatı</option>
                        <option value="İnce İşler İmalatı">İnce İşler İmalatı</option>
                        <option value="Elektrik Tesisat Malzemesi">Elektrik Tesisat Malzemesi</option>
                        <option value="Mekanik Tesisat Malzemesi">Mekanik Tesisat Malzemesi</option>
                        <option value="Diğer Malzeme">Diğer Malzeme</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Birim</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        value={newStokBirim}
                        onChange={(e) => setNewStokBirim(e.target.value)}
                      >
                        <option value="TON">TON</option>
                        <option value="M3">M3</option>
                        <option value="KG">KG</option>
                        <option value="ADET">ADET</option>
                        <option value="TORBA">TORBA</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Malzeme Açıklaması</label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        placeholder="Ek bilgiler..."
                        value={newStokAciklama}
                        onChange={(e) => setNewStokAciklama(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p-4 border-t bg-slate-50 shrink-0 space-y-2">
                    {editingStokId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStokId(null);
                          setNewStokAdi('');
                          setNewStokAciklama('');
                          setNewStokBirim('ADET');
                          setNewStokKategori('Kaba İnşaat İmalatı');
                        }}
                        className="w-full bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs py-2 rounded-xl border border-slate-200 transition"
                      >
                        Düzenlemeyi İptal
                      </button>
                    )}
                    <button 
                      onClick={handleCreateStok}
                      className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
                    >
                      {editingStokId ? 'Değişiklikleri Kaydet' : 'Stok Kartı Ekle'}
                    </button>
                  </div>
                </div>

                {/* List waybills screen column */}
                <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center space-x-2">
                    <Package size={16} className="text-[#2563eb]" />
                    <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Mevcut Malzemeler</h4>
                  </div>

                  <div className="px-4 pt-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={stokSearchQuery}
                        onChange={(e) => setStokSearchQuery(e.target.value)}
                        placeholder="Stok ara (adı, kod, kategori, birim)..."
                        className="w-full bg-white border border-slate-250 rounded-xl text-xs pl-8 pr-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {filteredStokKartlar.map(st => (
                      <div key={st.id} className="border border-slate-100 rounded-xl p-4 bg-white hover:shadow transition flex flex-col space-y-3 text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono bg-slate-100 rounded px-2.5 py-0.5 text-slate-700 font-bold border border-slate-200">{st.stokKodu}</span>
                            <h5 className="font-bold text-slate-900 mt-2">{st.stokAdi}</h5>
                            <p className="text-[9px] text-[#2563eb] font-bold mt-1">Ölçü Birimi: {st.birim}</p>
                          </div>
                      
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            {st.durum}
                          </span>
                        </div>

                        <div className="flex gap-2 border-t pt-2.5 text-[10px]">
                          <button 
                            onClick={() => {
                              setEditingStokId(st.id);
                              setNewStokAdi(st.stokAdi);
                              setNewStokBirim(st.birim);
                              setNewStokKategori(st.kategori || "Kaba İnşaat İmalatı");
                              setNewStokAciklama(st.aciklama || "");
                            }}
                            className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>✏️ Düzelt</span>
                          </button>
                          <button 
                            onClick={() => {
                              if (window.confirm("Bu stok kartını silmek istediğinize emin misiniz?")) {
                                setStokKartlar(prev => prev.filter(s => s.id !== st.id));
                                alert("Stok kartı silindi.");
                              }
                            }}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>🗑️ Sil</span>
                          </button>
                          <button 
                            onClick={() => setHistoryModalData({ type: 'stok', id: st.id, name: st.stokAdi })}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>📊 Geçmiş Raporla</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          📧 VIEW: E-POSTA MERKEZİ
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'eposta' && (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
          
          {/* Creator drawer */}
          <div className="w-full lg:w-[380px] lg:shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Haberleşme Havuzu</span>
              <h3 className="font-display font-semibold text-sm">📧 Rapor E-Postala</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Alıcı E-Postaları *</label>
                <input 
                  type="text" 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  placeholder="muhasebe@kibritci.com.tr"
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">E-Posta Başlığı / Konu *</label>
                <input 
                  type="text" 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  placeholder="Örn: Haziran 2026 Puantaj Raporu"
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Hangi Modüle Ait Veri?</label>
                <select 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  value={mailModul}
                  onChange={(e) => setMailModul(e.target.value as any)}
                >
                  <option value="RAPOR">Rapor Merkezi Dökümleri</option>
                  <option value="FINANS">Finansal Tablolar / Kasa</option>
                  <option value="PERSONEL">Personel Bilgileri</option>
                  <option value="IDARI">Saha &amp; Lojman Durumu</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              <button 
                onClick={handleSendMail}
                className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
              >
                E-Postayı Gönder
              </button>
            </div>
          </div>

          {/* List waybills screen column */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center space-x-2">
              <Mail size={16} className="text-[#2563EB]" />
              <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">E-Posta Kuyruk Günlüğü</h4>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {epostaGonderimleri.map(ep => (
                <div key={ep.id} className="border border-slate-100 rounded-xl p-4 bg-white hover:shadow transition flex justify-between items-center text-xs">
                  <div>
                    <h5 className="font-bold text-slate-900">{ep.konu}</h5>
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">Alıcılar: {ep.alicilar} · Dönem: {ep.tarih}</p>
                    <span className="text-[9px] font-bold text-slate-800 block mt-1 uppercase">MODÜL: {ep.modul}</span>
                  </div>
                      
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {ep.durum}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          📄 SAHA FAALİYETLERİ PDF & RAPOR ALMA MODALI
          ───────────────────────────────────────────────────────────── */}
      {sahaReportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 flex items-start justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col overflow-hidden my-4">
            
            {/* Modal Print & Config Header */}
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center px-6 shrink-0 print:hidden">
              <div className="flex items-center space-x-3">
                <span className="text-xl">📊</span>
                <div>
                  <h3 className="font-display font-bold text-sm">Resmi Şantiye Saha Faaliyetleri &amp; Aktif Personel Rapor Paneli</h3>
                  <p className="text-[10px] text-slate-400">Teknik şantiye imalat raporlarını günlük ve aylık bazda onay imza barlarıyla yazdırın.</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {/* Configuration controls */}
                <div className="flex items-center space-x-2 bg-slate-850 p-1.5 rounded-lg border border-slate-700 text-xs text-slate-200">
                  <span className="font-bold text-[9px] uppercase text-amber-500">Kapsam:</span>
                  <button
                    type="button"
                    onClick={() => setSahaReportType('GUNLUK')}
                    className={`px-2 py-0.5 font-bold rounded text-[10px] cursor-pointer ${sahaReportType === 'GUNLUK' ? 'bg-amber-500 text-slate-900' : 'hover:bg-slate-750'}`}
                  >
                    Günlük Rapor
                  </button>
                  <button
                    type="button"
                    onClick={() => setSahaReportType('AYLIK')}
                    className={`px-2 py-0.5 font-bold rounded text-[10px] cursor-pointer ${sahaReportType === 'AYLIK' ? 'bg-amber-500 text-slate-900' : 'hover:bg-slate-750'}`}
                  >
                    Aylık Rapor
                  </button>
                </div>

                {sahaReportType === 'GUNLUK' ? (
                  <input
                    type="date"
                    value={sahaReportDate}
                    onChange={(e) => setSahaReportDate(e.target.value)}
                    className="text-xs bg-slate-800 border border-slate-700 text-white p-1 rounded font-semibold focus:outline-none"
                  />
                ) : (
                  <select
                    value={sahaReportMonth}
                    onChange={(e) => setSahaReportMonth(parseInt(e.target.value))}
                    className="text-xs bg-slate-800 border border-slate-700 text-white p-1 rounded font-semibold focus:outline-none"
                  >
                    {[
                      {k: 1, v: "Ocak"}, {k: 2, v: "Şubat"}, {k: 3, v: "Mart"}, {k: 4, v: "Nisan"},
                      {k: 5, v: "Mayıs"}, {k: 6, v: "Haziran"}, {k: 7, v: "Temmuz"}, {k: 8, v: "Ağustos"},
                      {k: 9, v: "Eylül"}, {k: 10, v: "Ekim"}, {k: 11, v: "Kasım"}, {k: 12, v: "Aralık"}
                    ].map(m => (
                      <option key={m.k} value={m.k}>{m.v} (Ay {m.k})</option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => window.print()}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-sm"
                >
                  🖨️ Yazdır / PDF Al
                </button>
                <button
                  onClick={() => setSahaReportModal(false)}
                  className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            {/* Document Body (Landscape corporate style print) */}
            <div className="flex-1 overflow-auto bg-white p-12 text-slate-900 printable-document font-sans">
              <CorporateReportLayout
                orientation="landscape"
                docCode={`RAPOR MODELİ: KBR-SH-2026-${sahaReportType}`}
              >
              <div className="mb-4 pb-3 border-b border-black">
                <p className="text-xs text-black font-semibold mt-1">
                  Rapor Kapsamı: <strong className="text-black font-bold">{sahaReportType === 'GUNLUK' ? `GÜNLÜK (${sahaReportDate})` : `AYLIK (${sahaReportMonth}. Ay / 2026)`}</strong>
                </p>
              </div>

              {/* Title Header */}
              <div className="text-center mb-6">
                <h2 className="text-sm font-bold text-black tracking-wider uppercase border border-black py-2.5 bg-gray-100">
                  {sahaReportType === 'GUNLUK' ? 'GÜNLÜK SAHA FAALİYET RAPORU' : 'AYLIK SAHA FAALİYET RAPORU'}
                </h2>
                <p className="text-[9px] text-gray-600 mt-1 italic">
                  * Bu belge, o gün şantiyede aktif çalışan personelleri, metraj döküm ve imalat miktarlarını ispatlayan teknik referans belgesidir.
                </p>
              </div>

              {sahaReportType === 'GUNLUK' && (() => {
                const parts = sahaReportDate.split('-');
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const d = parseInt(parts[2], 10);

                const activePersonel = personeller.filter(
                  (p) => (p.durum === true || String(p.durum) === 'true') && !isTaseronPersonel(p) && !isIdariPersonel(p)
                );
                let countGeldi = 0;
                let countYok = 0;
                let countIzinli = 0;
                let countRaporlu = 0;
                let countGirilmedi = 0;

                activePersonel.forEach(p => {
                  const dayData = getYoklamaDay(yoklamalar[p.id], y, m, d);
                  if (dayData) {
                    if (dayData.durum === 'Geldi') countGeldi++;
                    else if (dayData.durum === 'Yok') countYok++;
                    else if (dayData.durum === 'İzinli') countIzinli++;
                    else if (dayData.durum === 'Raporlu') countRaporlu++;
                    else countGirilmedi++;
                  } else {
                    countGirilmedi++;
                  }
                });

                const totalPersonnel = activePersonel.length;

                return (
                  <div className="mb-6 bg-white border border-black p-4">
                    <span className="text-[11px] font-bold text-black uppercase tracking-widest block mb-3 border-b border-black pb-1">O Günkü Toplam Şantiye Yoklama/Katılım Durumu</span>
                    <div className="grid grid-cols-5 gap-0 text-center border-l border-t border-black">
                      <div className="bg-gray-100 border-b border-r border-black p-2">
                        <span className="text-[10px] text-black block font-bold">TOPLAM KADRO</span>
                        <strong className="text-xs font-bold text-black">{totalPersonnel} Kişi</strong>
                      </div>
                      <div className="bg-white border-b border-r border-black p-2 text-black">
                        <span className="text-[10px] text-black block font-bold">GELEN (AKTİF)</span>
                        <strong className="text-xs font-black">{countGeldi} Kişi</strong>
                      </div>
                      <div className="bg-white border-b border-r border-black p-2 text-black">
                        <span className="text-[10px] text-black block font-bold">GELMEYEN</span>
                        <strong className="text-xs font-black">{countYok} Kişi</strong>
                      </div>
                      <div className="bg-white border-b border-r border-black p-2 text-black">
                        <span className="text-[10px] text-black block font-bold">İZİNLİ / RAPORLU</span>
                        <strong className="text-xs font-bold">{countIzinli + countRaporlu} Kişi</strong>
                      </div>
                      <div className="bg-white border-b border-r border-black p-2 text-black">
                        <span className="text-[10px] text-black block font-bold">GİRİLMEMİŞ / DİĞER</span>
                        <strong className="text-xs font-bold text-black">{countGirilmedi} Kişi</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Work log loops */}
              <div className="space-y-4">
                {sahaFaaliyetleri.filter(sf => {
                  if (sahaReportType === 'GUNLUK') {
                    return sf.tarih === sahaReportDate;
                  } else {
                    const parts = sf.tarih.split('-');
                    return parts.length >= 2 && parseInt(parts[1]) === sahaReportMonth;
                  }
                }).length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-200 text-center text-slate-400 font-medium text-xs rounded-2xl">
                    Seçilen kriterlere uygun şantiye faaliyeti kaydı bulunamadı.
                  </div>
                ) : (
                  <div className="border border-black overflow-hidden bg-white">
                    <table className="w-full text-[11px] text-black border-collapse">
                      <thead>
                        <tr className="bg-gray-200 text-black font-bold border-b border-black uppercase tracking-wide">
                          <th className="p-2 border-r border-black w-24">Tarih</th>
                          <th className="p-2 border-r border-black w-48">İşin Niteliği / Lokasyon</th>
                          <th className="p-2 text-left">Teknik Çalışma Açıklaması &amp; Metraji &amp; Fotoğrafları</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sahaFaaliyetleri.filter(sf => {
                          if (sahaReportType === 'GUNLUK') {
                            return sf.tarih === sahaReportDate;
                          } else {
                            const parts = sf.tarih.split('-');
                            return parts.length >= 2 && parseInt(parts[1]) === sahaReportMonth;
                          }
                        }).map((sf, index) => (
                          <tr key={sf.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-black text-black font-sans`}>
                            <td className="p-2 border-r border-black font-bold text-center whitespace-nowrap">{sf.tarih}</td>
                            <td className="p-2 border-r border-black">
                              <span className="font-bold block">{sf.isNiteligi}</span>
                              <span className="text-[10px] font-semibold block uppercase mt-0.5">{sf.parsel} · {sf.blok}</span>
                            </td>
                            <td className="p-2 leading-relaxed font-normal">
                              <p className="whitespace-pre-line leading-relaxed">{sf.aciklama}</p>
                              {getSahaFaaliyetFotoUrl(sf) && (
                                <div 
                                  className="mt-3 inline-block border border-black p-1 bg-white max-w-[160px] cursor-pointer hover:opacity-90 transition group relative"
                                  onClick={() => setExpandedFoto(getSahaFaaliyetFotoUrl(sf))}
                                >
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center z-10">
                                    <span className="text-white text-[10px] font-bold tracking-wider pointer-events-none">🔍 BÜYÜT</span>
                                  </div>
                                  <img 
                                    src={getSahaFaaliyetFotoUrl(sf)} 
                                    alt="İmalat Saha Fotoğrafı" 
                                    referrerPolicy="no-referrer"
                                    className="h-24 w-auto object-cover block mx-auto relative z-0"
                                  />
                                  <span className="text-[8px] block mt-1 tracking-wider text-center font-mono font-bold uppercase">SAHA İMALAT GÖRSELİ</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* DYNAMIC SITE ACTIVE ROSTER AT THE BOTTOM */}
                {sahaReportType === 'GUNLUK' && (() => {
                  const parts = sahaReportDate.split('-');
                  const y = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10);
                  const d = parseInt(parts[2], 10);

                  const activePersonel = personeller.filter(
                    (p) => (p.durum === true || String(p.durum) === 'true') && !isTaseronPersonel(p) && !isIdariPersonel(p)
                  );
                  const sahadakiAktifKadro = activePersonel.filter(p => {
                    const dayData = getYoklamaDay(yoklamalar[p.id], y, m, d);
                    return dayData && dayData.durum === 'Geldi';
                  });

                  return (
                    <div className="mt-6 bg-white border border-black p-4">
                      <span className="text-[11px] font-extrabold text-black uppercase tracking-widest block mb-2.5 pb-1 border-b border-black">
                        O GÜN ŞANTİYEDE ÇALIŞAN AKTİF PERSONEL KADROSU ({sahadakiAktifKadro.length} Personel)
                      </span>
                      {sahadakiAktifKadro.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sahadakiAktifKadro.map((p) => (
                            <span key={p.id} className="text-[9px] font-bold bg-white text-black border border-black px-2 py-1 inline-flex items-center space-x-1.5">
                              <span>{p.ad} {p.soyad}</span>
                              <span className="text-[8px] font-medium">({p.gorev})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-500 italic">O gün için puantaj cetvelinde aktif şantiye çalışanı bulunmamaktadır.</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Official Signature Lines */}
              {(() => {
                return (
                  <div className="mt-12 text-xs">
                    <div className="grid grid-cols-3 gap-0 text-center border-l border-t border-black">
                      
                      {/* 1. HAZIRLAYAN */}
                      <div className="border-r border-b border-black p-4 bg-white flex flex-col justify-between min-h-[160px]">
                        <div>
                          <span className="font-extrabold text-black tracking-wider uppercase block mb-0.5 text-[11px]">HAZIRLAYAN</span>
                        </div>
                        <div className="my-auto">
                           <div className="text-gray-400 italic text-[10px] my-4">
                             (İmza)
                           </div>
                        </div>
                      </div>

                      {/* 2. ŞANTİYE ŞEFİ */}
                      <div className="border-r border-b border-black p-4 bg-white flex flex-col justify-between min-h-[160px]">
                        <div>
                          <span className="font-extrabold text-black tracking-wider uppercase block mb-0.5 text-[11px]">ŞANTİYE ŞEFİ</span>
                        </div>
                        <div className="my-auto">
                           <div className="text-gray-400 italic text-[10px] my-4">
                             (İmza)
                           </div>
                        </div>
                      </div>

                      {/* 3. PROJE MÜDÜRÜ */}
                      <div className="border-r border-b border-black p-4 bg-white flex flex-col justify-between min-h-[160px]">
                        <div>
                          <span className="font-extrabold text-black tracking-wider uppercase block mb-0.5 text-[11px]">PROJE MÜDÜRÜ</span>
                        </div>
                        <div className="my-auto">
                           <div className="text-gray-400 italic text-[10px] my-4">
                             (İmza)
                           </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}

              </CorporateReportLayout>
            </div>
          </div>
        </div>
      )}

      {/* 🚛 ARAÇ SAYAÇLI RAPOR DETAYLI MODAL POPUP */}
      {selectedAracForPdf && (() => {
        const sorumlu = personeller.find(p => p.id === selectedAracForPdf.sorumluPersonelId);
        const sorumluAd = sorumlu ? `${sorumlu.ad} ${sorumlu.soyad}` : "Belirlenmedi / Sürücü";
        const vehicleLogs = aracKmLoglari.filter(log => log.plaka.toUpperCase() === selectedAracForPdf.plaka.toUpperCase());
        return (
          <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-[750px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
              
              {/* Header */}
              <div className="bg-slate-900 text-white p-5 flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-2.5">
                  <span className="text-xl">🚛</span>
                  <div>
                    <h3 className="font-display font-semibold text-sm">Araç Muayene &amp; Sayaç Takip Teknik Raporu</h3>
                    <p className="text-[10px] text-slate-400">{selectedAracForPdf.plaka} - Şantiye Demirbaş Belgesi</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedAracForPdf(null)}
                  className="text-slate-400 hover:text-white font-bold cursor-pointer text-sm"
                >
                  ✖
                </button>
              </div>

              {/* Rapor İçeriği */}
              <div className="flex-grow overflow-y-auto p-6 space-y-6 text-xs text-slate-800 bg-slate-50/50">
                <div id="arac-print-area" className="bg-white border p-6 rounded-2xl shadow-sm text-slate-800 relative font-sans">
                  <CorporateReportLayout orientation="portrait" docCode={`Plaka: ${selectedAracForPdf.plaka} · KB-SRY-2026`}>
                  {/* Rapor Başlık Kartı */}
                  <div className="bg-slate-900 text-white rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest text-amber-400">DEMİRBAŞ SAYAÇ VE BAKIM TEKNİK REFAKAT KARTI</h4>
                      <p className="text-[9px] text-slate-300 mt-0.5 font-medium">Bu belge, vasıtanın şantiye sahasındaki tüm teknik izleme, muayene ve sürücü kayıt loglarını içerir.</p>
                    </div>
                    <span className="text-[19px]">📋</span>
                  </div>

                  {/* Detay Kartı */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                      <span className="text-slate-400 block font-bold uppercase text-[8px] tracking-wider">🚛 Araç / Ekipman Künyesi</span>
                      <div className="space-y-1 text-[10px] text-slate-705 font-semibold">
                        <div className="flex justify-between"><span>Marka / Model:</span> <strong className="text-slate-900">{selectedAracForPdf.markaModel}</strong></div>
                        <div className="flex justify-between"><span>Sınıf / Ekipman Tipi:</span> <strong className="text-slate-900">{selectedAracForPdf.aracTipi}</strong></div>
                        <div className="flex justify-between"><span>Maddi Sorumlu (Zimmet):</span> <strong className="text-slate-800">{sorumluAd}</strong></div>
                        <div className="flex justify-between"><span>Mevcut Sayaç Değeri:</span> <strong className="font-mono text-amber-700">{selectedAracForPdf.mevcutKm.toLocaleString('tr-TR')} KM</strong></div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                      <span className="text-slate-400 block font-bold uppercase text-[8px] tracking-wider">🛠️ Yasal &amp; Teknik Bakım Limitleri</span>
                      <div className="space-y-1 text-[10px] text-slate-705 font-semibold">
                        <div className="flex justify-between">
                          <span>⏱️ Fennî Muayene Geçerlilik:</span> 
                          <strong className={selectedAracForPdf.muayeneTarihi && new Date(selectedAracForPdf.muayeneTarihi) < new Date() ? 'text-red-650 font-black px-1.5 py-0.2 bg-red-100 rounded' : 'text-slate-900'}>
                            {selectedAracForPdf.muayeneTarihi || "Belirtilmedi"}
                          </strong>
                        </div>
                        <div className="flex justify-between"><span>📄 Zorunlu Trafik Sigortası:</span> <strong className="text-slate-900">{selectedAracForPdf.sigortaTarihi || "Belirtilmedi"}</strong></div>
                        <div className="flex justify-between"><span>🛢️ Motor Yağ Değişimi Hedef KM:</span> <strong className="font-mono text-slate-900">{selectedAracForPdf.yagBakimKm || 10000} KM</strong></div>
                        <div className="flex justify-between"><span>⚙️ Ağır Mekanik Periyot Aralığı:</span> <strong className="font-mono text-indigo-700">{selectedAracForPdf.kmBakimAraligi || 15000} KM</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Detaylı Geçmiş Muayene / Bakım İşlem Günlük Logları */}
                  <div className="space-y-2.5">
                    <span className="font-bold text-[9px] text-[#1e4e78] uppercase tracking-wider block">🔧 EN KAPSAMLI SAYAÇ VE TEKNİK PERİYODİK BAKIM TARİHÇESİ</span>
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-[10px] bg-white">
                      <div className="grid grid-cols-4 bg-slate-800 text-white font-bold p-2 text-[8px] tracking-wider uppercase">
                        <span>İŞLEM / BAKIM GRUBU</span>
                        <span className="text-center">KİLOMETRE SAYAÇ</span>
                        <span className="text-center">TARİH STAMPI</span>
                        <span className="text-right">UYGULAYICI / AMİR</span>
                      </div>
                      <div className="divide-y font-medium text-slate-600">
                        <div className="grid grid-cols-4 p-2 hover:bg-slate-50/50">
                          <span className="font-bold text-slate-900">🛢️ Motor Yağı &amp; Filtre Yenilemesi</span>
                          <span className="text-center font-mono">{(selectedAracForPdf.mevcutKm > 10000 ? selectedAracForPdf.mevcutKm - 7800 : 1500).toLocaleString()} KM</span>
                          <span className="text-center">12.04.2026</span>
                          <span className="text-right text-slate-500">Mekanik Atölye / Servis</span>
                        </div>
                        <div className="grid grid-cols-4 p-2 hover:bg-slate-50/50">
                          <span className="font-bold text-slate-900">🛡️ Trafik &amp; Kasko Sigortası Yenileme</span>
                          <span className="text-center font-mono">{(selectedAracForPdf.mevcutKm > 5000 ? selectedAracForPdf.mevcutKm - 4200 : 1200).toLocaleString()} KM</span>
                          <span className="text-center">24.03.2026</span>
                          <span className="text-right text-slate-500">Kibritçi Merkez Muhasebe</span>
                        </div>
                        <div className="grid grid-cols-4 p-2 hover:bg-slate-50/50">
                          <span className="font-bold text-slate-900">🔧 Lastik Değişimi &amp; Balans Ayarı</span>
                          <span className="text-center font-mono">{(selectedAracForPdf.mevcutKm > 12000 ? selectedAracForPdf.mevcutKm - 11200 : 500).toLocaleString()} KM</span>
                          <span className="text-center">02.02.2026</span>
                          <span className="text-right text-slate-500">Şantiye Lastik Sorumlusu</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Yol Geçmişi / KM Sürücü Logları */}
                  <div className="space-y-2.5">
                    <span className="font-bold text-[9px] text-[#1e4e78] uppercase tracking-wider block">📊 GÜNLÜK SÜRÜCÜ TAHSİS &amp; SEYİR SAYAÇ LOGLARI</span>
                    {vehicleLogs.length === 0 ? (
                      <div className="p-4 border border-dashed rounded-xl bg-slate-50 text-center text-slate-400 text-[10px]">
                        Araca ait sisteme girilmiş günlük sabah/akşam sayaç takip logu bulunmamaktadır.
                      </div>
                    ) : (
                      <table className="w-full text-left border rounded-xl overflow-hidden text-[10px]">
                        <thead>
                          <tr className="bg-slate-800 text-white font-bold uppercase text-[8px] tracking-wider">
                            <th className="p-2">Tarih</th>
                            <th className="p-2">Sürücü / Tahsis Edilen Personel</th>
                            <th className="p-2 text-right">Sabah Sayaç</th>
                            <th className="p-2 text-right">Akşam Sayaç</th>
                            <th className="p-2 text-right text-amber-400">Üretilen Mesafe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-medium text-slate-700 bg-white">
                          {vehicleLogs.map(l => (
                            <tr key={l.id} className="hover:bg-slate-50/70">
                              <td className="p-2 font-mono">{l.tarih}</td>
                              <td className="p-2 font-bold text-slate-950">{l.surucu}</td>
                              <td className="p-2 text-right font-mono">{l.sabahKm.toLocaleString('tr-TR')} KM</td>
                              <td className="p-2 text-right font-mono">{l.aksamKm.toLocaleString('tr-TR')} KM</td>
                              <td className="p-2 text-right font-mono text-amber-800 font-extrabold">+{l.fark.toLocaleString('tr-TR')} KM</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Teknik Amirlik Notu */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                    <span className="font-bold text-amber-800 uppercase text-[8px] block tracking-wider">📋 ŞANTİYE TEKNİK AMİRLİĞİ VE GÜVENLİK TALİMATNAMESİ</span>
                    <p className="text-[9px] text-slate-700 leading-relaxed font-semibold">
                      Bu vasıta Kibritçi İnşaat şantiye park envanterine tahsisli olup, sürüş esnasında şantiye içi hız limitlerine (Maks. 20 km/h) uyulması zorunludur. Günlük sabah ve akşam sayaç loglarının her şoför tarafından sisteme işlenmesi idari cezai yaptırıma tabidir.
                    </p>
                  </div>

                  {/* İmzalar */}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-4 text-center text-[9px]">
                      <div className="border p-2.5 rounded-xl bg-slate-50/50">
                        <span className="font-extrabold text-[#1e4e78] block mb-1">Şantiye Mekanik Atölye Amiri</span>
                        <span className="text-[8px] text-slate-400 block mb-5">Sayaç &amp; Bakım Doğrulandı</span>
                        <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                        <span className="text-[8px] font-bold text-indigo-700">DİJİTAL ONAYLI BELGE</span>
                      </div>
                      <div className="border p-2.5 rounded-xl bg-slate-50/50">
                        <span className="font-extrabold text-[#1e4e78] block mb-1">Şantiye Şefliği Genel Yönetimi</span>
                        <span className="text-[8px] text-slate-400 block mb-5">Kayıtlara İşlendi</span>
                        <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                        <span className="text-[8px] font-bold text-emerald-700">MÜHÜR BASILDI (KİBRİTÇİ A.Ş.)</span>
                      </div>
                    </div>
                  </div>

                  </CorporateReportLayout>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t flex gap-2 justify-end shrink-0">
                <button 
                  onClick={() => {
                    const printContent = document.getElementById('arac-print-area')?.innerHTML;
                    if (!printContent) return;
                    const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_Arac_Sayac_${selectedAracForPdf.plaka}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white p-8">
  <div class="max-w-4xl mx-auto border p-8 rounded-xl shadow-sm">
    ${printContent}
  </div>
  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
                    `;
                    try {
                      const win = window.open("", "_blank");
                      if (win) {
                        win.document.write(htmlSnippet);
                        win.document.close();
                      } else {
                        throw new Error("Popup blocked");
                      }
                    } catch (err) {
                      const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Kibritci_Arac_Sayac_${selectedAracForPdf.plaka}.html`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-950 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                >
                  <Printer size={13} />
                  <span>Yazdır / PDF Rapor Kaydet</span>
                </button>
                <button 
                  onClick={() => setSelectedAracForPdf(null)}
                  className="bg-slate-250 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 🏕️ KAMP BOŞ & DOLU KROKİ MODAL POPUP */}
      {showKampKrokiModal && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-[850px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">🏕️</span>
                <div>
                  <h3 className="font-display font-semibold text-sm">Şantiye Kamp/Barınma Boş &amp; Dolu Kroki Raporu</h3>
                  <p className="text-[10px] text-slate-400">Şantiye Lojman Kapasite Şeması ve Sakinleri</p>
                </div>
              </div>
              <button 
                onClick={() => setShowKampKrokiModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer text-sm"
              >
                ✖
              </button>
            </div>

            {/* Rapor İçeriği */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6 text-xs text-slate-800 bg-slate-50/50">
              <div id="kamp-print-area" className="bg-white border p-6 rounded-2xl shadow-sm text-slate-800 relative">
                <CorporateReportLayout orientation="portrait" docCode="BELGE NO: KAMP-2026-KRK">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-4">FİİLİ KONAKLAMA VE KOĞUŞ YERLEŞİM KROKİSİ</p>

                {/* Sinyal Widgets */}
                <div className="kamp-kroki-stats grid grid-cols-3 gap-4 text-center">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[8px] text-slate-800 font-bold block uppercase tracking-wide">TOPLAM YATAK KAPASİTESİ</span>
                    <span className="text-base font-extrabold text-[#2563EB] block mt-0.5">
                      {kampOdalari.reduce((acc, current) => acc + current.kapasite, 0)} Adet
                    </span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-150 rounded-xl p-3">
                    <span className="text-[8px] text-emerald-700 font-bold block uppercase tracking-wide">ANLIK KALAN PERSONEL</span>
                    <span className="text-base font-extrabold text-emerald-700 block mt-0.5">
                      {kampKayitlari.filter((k) => k.durum === 'AKTIF').length} Kadro
                    </span>
                  </div>
                  <div className="bg-amber-50 border border-amber-150 rounded-xl p-3">
                    <span className="text-[8px] text-amber-700 font-bold block uppercase tracking-wide">DOLULUK ORANI</span>
                    <span className="text-base font-extrabold text-amber-700 block mt-0.5">
                      {kampOdalari.reduce((acc, current) => acc + current.kapasite, 0) > 0 
                        ? `% ${Math.round((kampKayitlari.filter((k) => k.durum === 'AKTIF').length / kampOdalari.reduce((acc, current) => acc + current.kapasite, 0)) * 100)}` 
                        : "% 0"
                      }
                    </span>
                  </div>
                </div>

                {/* Kat Planı ve Krokiler */}
                <div className="space-y-6">
                  {groupedKampYapisi.map((campusNode) => (
                    <div key={`print_${campusNode.campus}`} className="kamp-campus-block border border-slate-200 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                      <span className="font-bold text-[10px] text-slate-700 block bg-slate-50 p-1 px-3 rounded border-l-4 border-slate-800 uppercase">
                        📍 {campusNode.campus}
                      </span>

                      {campusNode.floors.map((floorNode) => (
                        <div key={`print_${campusNode.campus}_${floorNode.floor}`} className="kamp-floor-block space-y-2">
                          <span className="font-bold text-[10px] text-slate-700 block bg-slate-100 p-1 px-3 rounded border-l-4 border-amber-500 uppercase">
                            🏢 {floorNode.floor} Mimari Taslağı
                          </span>
                          <div className="kamp-kroki-room-grid grid grid-cols-2 md:grid-cols-3 gap-3">
                            {floorNode.rooms.map((room) => {
                              const occupants = kampKayitlari.filter((cr) => (cr.roomId === room.id || cr.odaId === room.id) && cr.durum === 'AKTIF');
                              const isFull = occupants.length >= room.kapasite;
                              return (
                                <div key={room.id} className="bg-white border p-3 rounded-xl shadow-sm text-[10px] space-y-2 flex flex-col justify-between">
                                  <div>
                                    <div className="flex justify-between items-center">
                                      <strong className="text-slate-900 font-bold block">Oda: {room.odaNo}</strong>
                                      <span className={`text-[8px] font-black px-1 rounded uppercase min-w-[32px] text-center ${
                                        isFull ? 'bg-rose-100 text-rose-700' : occupants.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                                      }`}>
                                        {isFull ? 'Dolu' : occupants.length > 0 ? 'Kısmen' : 'Boş'}
                                      </span>
                                    </div>
                                    <span className="text-[8px] text-slate-400 block mt-0.5">{room.yerleskeAdi}</span>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">SAKİNLER ({occupants.length}/{room.kapasite})</span>
                                    {occupants.length === 0 ? (
                                      <span className="text-[9px] text-slate-400 italic block">Boş Yatak</span>
                                    ) : (
                                      <ul className="list-disc list-inside space-y-0.5 text-slate-700 font-medium">
                                        {occupants.map((o) => (
                                          <li key={o.id} className="truncate">{o.personelIsim}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Sorumlu ve İmzalar */}
                <div className="pt-6 border-t border-slate-200">
                  <div className="kamp-kroki-signatures grid grid-cols-2 gap-4 text-center text-[9px]">
                    <div className="border p-2 rounded bg-slate-50/50">
                      <span className="font-extrabold text-slate-705 block mb-1">Kamp İdari Amiri / Sürveyan</span>
                      <span className="text-[8px] text-slate-400 block mb-5">Bilgiler Doğrudur</span>
                      <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                      <span className="text-[8px] font-bold text-slate-400">İmza</span>
                    </div>
                    <div className="border p-2 rounded bg-slate-50/50">
                      <span className="font-extrabold text-slate-705 block mb-1">Şantiye Proje Müdürü</span>
                      <span className="text-[8px] text-slate-400 block mb-5">Onay</span>
                      <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                      <span className="text-[8px] font-bold text-slate-800">DİJİTAL SİMÜLE EDİLDİ</span>
                    </div>
                  </div>
                </div>

                </CorporateReportLayout>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t flex flex-wrap gap-2 justify-end shrink-0">
              {(['A4', 'A3'] as KampKrokiPageFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => {
                    const printContent = document.getElementById('kamp-print-area')?.innerHTML;
                    if (!printContent) return;
                    openKampKrokiPrintWindow(printContent, format);
                  }}
                  className="bg-slate-900 hover:bg-slate-950 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                >
                  <Printer size={13} />
                  <span>{format} Yazdır / PDF</span>
                </button>
              ))}
              <button 
                onClick={() => setShowKampKrokiModal(false)}
                className="bg-slate-250 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 📊 GEÇMİŞ RAPORLA MODAL OVERLAY */}
      {historyModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                <ClipboardList size={18} className="text-amber-400" />
                <div>
                  <h3 className="font-display font-black text-sm uppercase tracking-wider">📊 Geriye Dönük İşlem ve Hareket Raporu</h3>
                  <p className="text-[10px] text-slate-400 font-mono">ID: {historyModalData.id} • {historyModalData.type === 'cari' ? 'Cari Firma Geçmişi' : 'Stok Malzeme Geçmişi'}</p>
                </div>
              </div>
              <button 
                onClick={() => setHistoryModalData(null)}
                className="text-slate-400 hover:text-white transition font-bold text-sm bg-slate-800 p-1 rounded-full px-2.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Seçili Kart Kataloğu</span>
                <strong className="text-sm text-slate-900 block mt-0.5">{historyModalData.name}</strong>
                <p className="text-[10.5px] text-slate-500 mt-1">
                  Bu kart ile ilgili ERP sisteminde kayıtlı olan satın alma talebi, irsaliye girişleri ve onay hareketleri dökümü aşağıda kronolojik olarak listelenmiştir.
                </p>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">📝 Sistem Log Kayıtları ({historyList.length} Hareket)</span>
                
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12 text-slate-400 space-x-2">
                    <span className="text-sm animate-spin">🔄</span>
                    <span className="font-semibold">İşlem geçmişi buluttan çekiliyor...</span>
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="text-center py-12 text-slate-450 italic font-medium">
                    Bu kart ile ilgili herhangi bir işlem kaydı bulunamadı.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {historyList.map((log, idx) => (
                      <div key={log.id || idx} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex justify-between items-center hover:border-slate-300 transition">
                        <div>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${log.badgeColor || 'bg-slate-200 text-slate-800'}`}>
                            {log.type}
                          </span>
                          <p className="font-bold text-slate-900 mt-1.5">{log.title}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{log.desc}</p>
                        </div>
                        <span className="font-mono text-[9px] text-slate-450 font-bold shrink-0 ml-3">{log.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-[11px] text-amber-800">
                <span className="text-lg">ℹ️</span>
                <p className="leading-relaxed">
                  <strong>Not:</strong> Bu kartın silinmesi durumunda bağlı olduğu geçmiş satın alma kalemleri ve irsaliye kayıtları etkilenmez, fakat yeni işlemlerde bu referans seçilemez hale gelecektir.
                </p>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex flex-wrap gap-2 justify-between">
              <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  exportHistoryReport({
                    title: 'Kart Geçmiş Hareket Raporu',
                    fileBase: `Kibritci_${historyModalData.type === 'cari' ? 'Cari' : 'Stok'}_Gecmis_${historyModalData.id}`,
                    meta: [
                      `Kart Tipi: ${historyModalData.type === 'cari' ? 'Cari Firma' : 'Stok Malzeme'}`,
                      `Kart Adı: ${historyModalData.name}`,
                      `Kart ID: ${historyModalData.id}`,
                      `Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`,
                    ],
                    logs: historyList.map((log) => ({
                      date: log.date,
                      type: log.type,
                      title: log.title,
                      desc: log.desc,
                    })),
                    format: 'csv',
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer"
              >
                Excel (CSV) İndir
              </button>
              <button 
                onClick={() => {
                  exportHistoryReport({
                    title: 'Kart Geçmiş Hareket Raporu',
                    fileBase: `Kibritci_${historyModalData.type === 'cari' ? 'Cari' : 'Stok'}_Gecmis_${historyModalData.id}`,
                    meta: [
                      `Kart Tipi: ${historyModalData.type === 'cari' ? 'Cari Firma' : 'Stok Malzeme'}`,
                      `Kart Adı: ${historyModalData.name}`,
                    ],
                    logs: historyList.map((log) => ({
                      date: log.date,
                      type: log.type,
                      title: log.title,
                      desc: log.desc,
                    })),
                    format: 'html',
                  });
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer"
              >
                HTML İndir
              </button>
              <button 
                onClick={() => {
                  if (historyList.length === 0) {
                    alert("İndirilecek herhangi bir işlem geçmişi bulunmamaktadır.");
                    return;
                  }
                  const txtLines = [
                    `KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.`,
                    `KART GEÇMİŞ HAREKET RAPORU`,
                    `---------------------------------------------`,
                    `Kart Tipi: ${historyModalData.type === 'cari' ? 'Cari Firma' : 'Stok Malzeme'}`,
                    `Kart Adı: ${historyModalData.name}`,
                    `Kart ID: ${historyModalData.id}`,
                    `Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`,
                    `---------------------------------------------`,
                    `HAREKET LOGLARI:`,
                    ...historyList.map((log, idx) => 
                      `[${idx + 1}] Tarih: ${log.date} | Tip: ${log.type}\n    Başlık: ${log.title}\n    Açıklama: ${log.desc}\n`
                    )
                  ];
                  const blob = new Blob([txtLines.join('\n')], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `Kibritci_${historyModalData.type === 'cari' ? 'Cari' : 'Stok'}_Gecmis_Raporu_${historyModalData.id}.txt`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  alert("İşlem geçmişi raporu başarıyla .txt dosyası olarak indirildi.");
                }}
                className="bg-slate-600 hover:bg-slate-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer"
              >
                TXT İndir
              </button>
              </div>
              <button 
                onClick={() => setHistoryModalData(null)}
                className="bg-slate-900 hover:bg-black text-white font-bold text-xs py-2 px-5 rounded-xl transition cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {expandedFoto && (
        <div 
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm"
          onClick={() => setExpandedFoto(null)}
        >
          <img 
            src={expandedFoto} 
            alt="Büyütülmüş Fotoğraf" 
            className="max-w-full max-h-[90vh] object-contain cursor-default select-none shadow-2xl rounded-sm"
            onClick={(e) => e.stopPropagation()}
            referrerPolicy="no-referrer"
          />
          <button 
            type="button"
            className="absolute top-6 right-6 bg-white/10 hover:bg-red-500 hover:text-white text-white/70 rounded-full p-2.5 transition backdrop-blur-md cursor-pointer border border-white/20 shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedFoto(null);
            }}
            title="Kapat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          📸 MODAL: IMAGE FULLSCREEN VIEWER
          ───────────────────────────────────────────────────────────── */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 md:p-10"
          onClick={() => setFullScreenImage(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white bg-black/50 hover:bg-black/80 rounded-full w-10 h-10 flex items-center justify-center text-xl transition cursor-pointer"
            onClick={() => setFullScreenImage(null)}
          >
            ✕
          </button>
          <img 
            src={fullScreenImage} 
            alt="Büyük Görüntü" 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

    </div>
  );
};
export default IdariScreen;
