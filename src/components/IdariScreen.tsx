import React, { useState } from 'react';
import { 
  Truck, Tent, Building2, FileText, Users, Mail, Package,
  Plus, Trash2, ShieldAlert, Award, FileUp, CheckCircle, Check, HelpCircle, ClipboardList,
  Printer, Download, Upload, Send
} from 'lucide-react';
import { KibritciLogo } from './KibritciLogo';
import { 
  AracBakim, Demisbas, Tahsis, KampOdasi, KampKaydi, KampSarf, KampFaaliyet,
  SahaFaaliyeti, HazirTutanak, CariKart, StokKart, EpostaGonderim, Personel
} from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

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
  sahaFaaliyetleri: SahaFaaliyeti[];
  setSahaFaaliyetleri: React.Dispatch<React.SetStateAction<SahaFaaliyeti[]>>;
  hazirTutanaklar: HazirTutanak[];
  setHazirTutanaklar: React.Dispatch<React.SetStateAction<HazirTutanak[]>>;
  cariKartlar: CariKart[];
  setCariKartlar: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar: React.Dispatch<React.SetStateAction<StokKart[]>>;
  epostaGonderimleri: EpostaGonderim[];
  setEpostaGonderimleri: React.Dispatch<React.SetStateAction<EpostaGonderim[]>>;
  personeller: Personel[];
  aracKmLoglari: any[];
  setAracKmLoglari: (updater: any) => void;
  yoklamalar?: any;
}

export const IdariScreen: React.FC<IdariScreenProps> = ({
  currentSubTab,
  araclar, setAraclar,
  demirbaslar, setDemirbaslar,
  kampOdalari, setKampOdalari,
  kampKayitlari, setKampKayitlari,
  sahaFaaliyetleri, setSahaFaaliyetleri,
  hazirTutanaklar, setHazirTutanaklar,
  cariKartlar, setCariKartlar,
  stokKartlar, setStokKartlar,
  epostaGonderimleri, setEpostaGonderimleri,
  personeller,
  aracKmLoglari,
  setAracKmLoglari,
  yoklamalar = {}
}) => {

  // ─────────────────────────────────────────────────────────────
  // 🚛 1. ARAÇ & DEMİRBAŞ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [activeAracSub, setActiveAracSub] = useState<'arac' | 'demirbas'>('arac');
  const [aracSubTab, setAracSubTab] = useState<'liste' | 'km_takip'>('liste');
  const [selectedAracForPdf, setSelectedAracForPdf] = useState<AracBakim | null>(null);
  const [showKampKrokiModal, setShowKampKrokiModal] = useState(false);



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
    setNewPlaka("");
    setNewModel("");
    alert("Yeni araç / makine başarıyla kaydedildi.");
  };

  // ─────────────────────────────────────────────────────────────
  // 🏕️ 2. KAMP YÖNETİMİ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [selectedRoomToAssign, setSelectedRoomToAssign] = useState<KampOdasi | null>(null);
  const [residentInputName, setResidentInputName] = useState("");
  const [residentInputFirma, setResidentInputFirma] = useState("");

  // Room Creation Hierarchical States
  const [campuses, setCampuses] = useState<string[]>([
    "A Yerleşkesi",
    "B Yerleşkesi",
    "C Yerleşkesi",
    "D Yerleşkesi"
  ]);

  const [campusFloors, setCampusFloors] = useState<Record<string, string[]>>({
    "A Yerleşkesi": ["1. Kat", "2. Kat", "3. Kat"],
    "B Yerleşkesi": ["1. Kat", "2. Kat", "3. Kat"],
    "C Yerleşkesi": ["1. Kat", "2. Kat", "3. Kat"],
    "D Yerleşkesi": ["1. Kat", "2. Kat", "3. Kat"]
  });

  const [selectedYerleske, setSelectedYerleske] = useState("A Yerleşkesi");
  const [selectedKat, setSelectedKat] = useState("1. Kat");
  
  const [campCreationStep, setCampCreationStep] = useState<'campus' | 'floor' | 'room'>('room');
  const [newCampusInput, setNewCampusInput] = useState("");
  const [newFloorInput, setNewFloorInput] = useState("");

  // Sync campuses & floors with currently loaded rooms in database
  React.useEffect(() => {
    if (kampOdalari && kampOdalari.length > 0) {
      const uniqueCamps = Array.from(new Set(kampOdalari.map(r => r.yerleskeAdi as string))).filter(Boolean) as string[];
      
      setCampuses(prev => {
        const merged = Array.from(new Set([...prev, ...uniqueCamps]));
        return merged;
      });

      setCampusFloors(prev => {
        const updated = { ...prev } as Record<string, string[]>;
        uniqueCamps.forEach(camp => {
          if (!updated[camp]) {
            updated[camp] = [];
          }
          const roomsInCamp = kampOdalari.filter(r => r.yerleskeAdi === camp);
          const floorsInCamp = Array.from(new Set(roomsInCamp.map(r => r.kogusNo as string))).filter(Boolean) as string[];
          
          updated[camp] = Array.from(new Set([...updated[camp], ...floorsInCamp]));
        });
        return updated;
      });
    }
  }, [kampOdalari]);

  // Handle selectedYerleske change to auto-update selectedKat option
  React.useEffect(() => {
    const floorsOfSelected = campusFloors[selectedYerleske] || [];
    if (floorsOfSelected.length > 0) {
      setSelectedKat(floorsOfSelected[0]);
    } else {
      setSelectedKat("");
    }
  }, [selectedYerleske, campusFloors]);

  const [showNewRoomForm, setShowNewRoomForm] = useState(false);
  const [newRoomNo, setNewRoomNo] = useState("");
  const [newRoomKapasite, setNewRoomKapasite] = useState(4);
  const [newRoomFirma, setNewRoomFirma] = useState<'ANA_FIRMA' | 'TASERON'>("ANA_FIRMA");

  const handleDeleteRoom = (id: string) => {
    if (window.confirm("Bu odayı ve odaya ait olan tüm konaklama kayıtlarını sistemden silmek istediğinize emin misiniz?")) {
      setKampOdalari(prev => prev.filter(r => r.id !== id));
      setKampKayitlari(prev => prev.filter(kk => kk.odaId !== id && kk.roomId !== id));
      alert("Oda kaydı ve sakin yerleşimleri başarıyla kaldırıldı.");
    }
  };

  const handleDeleteCampus = (campName: string) => {
    if (window.confirm(`"${campName}" yerleşkesini ve bu yerleşkeye bağlı tüm odaları ve sakin kayıtlarını silmek istediğinize emin misiniz?`)) {
      setCampuses(prev => prev.filter(c => c !== campName));
      setCampusFloors(prev => {
        const updated = { ...prev };
        delete updated[campName];
        return updated;
      });
      // Filter out rooms and records
      const roomsToDelete = kampOdalari.filter(r => r.yerleskeAdi === campName).map(r => r.id);
      setKampOdalari(prev => prev.filter(r => r.yerleskeAdi !== campName));
      setKampKayitlari(prev => prev.filter(kk => !roomsToDelete.includes(kk.odaId) && !roomsToDelete.includes(kk.roomId)));
      
      // Select another campus if the current active one was deleted
      if (selectedYerleske === campName) {
        const remaining = campuses.filter(c => c !== campName);
        if (remaining.length > 0) {
          setSelectedYerleske(remaining[0]);
        } else {
          setSelectedYerleske("");
        }
      }
      alert(`"${campName}" yerleşkesi başarıyla silindi.`);
    }
  };

  const handleDeleteFloor = (campName: string, floorName: string) => {
    if (window.confirm(`"${campName}" altındaki "${floorName}" katını/bloğunu ve bağlı tüm odaları silmek istediğinize emin misiniz?`)) {
      setCampusFloors(prev => {
        const updated = { ...prev };
        if (updated[campName]) {
          updated[campName] = updated[campName].filter(f => f !== floorName);
        }
        return updated;
      });
      // Filter out rooms and records
      const roomsToDelete = kampOdalari.filter(r => r.yerleskeAdi === campName && r.kogusNo === floorName).map(r => r.id);
      setKampOdalari(prev => prev.filter(r => !(r.yerleskeAdi === campName && r.kogusNo === floorName)));
      setKampKayitlari(prev => prev.filter(kk => !roomsToDelete.includes(kk.odaId) && !roomsToDelete.includes(kk.roomId)));

      if (selectedKat === floorName) {
        const remaining = (campusFloors[campName] || []).filter(f => f !== floorName);
        if (remaining.length > 0) {
          setSelectedKat(remaining[0]);
        } else {
          setSelectedKat("");
        }
      }
      alert(`"${floorName}" katı/bloğu başarıyla silindi.`);
    }
  };

  const handleCreateCampus = () => {
    const trimmed = newCampusInput.trim();
    if (!trimmed) {
      alert("Lütfen geçerli bir Yerleşke adı girin!");
      return;
    }
    if (campuses.includes(trimmed)) {
      alert("Bu yerleşke zaten tanımlı!");
      return;
    }
    setCampuses(prev => [...prev, trimmed]);
    setCampusFloors(prev => ({
      ...prev,
      [trimmed]: []
    }));
    setSelectedYerleske(trimmed);
    setNewCampusInput("");
    setCampCreationStep('floor');
    alert(`"${trimmed}" yerleşkesi başarıyla eklendi! Şimdi bu yerleşke için kat oluşturabilirsiniz.`);
  };

  const handleCreateFloor = () => {
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
    setCampusFloors(prev => ({
      ...prev,
      [selectedYerleske]: [...currentFloors, trimmed]
    }));
    setSelectedKat(trimmed);
    setNewFloorInput("");
    setCampCreationStep('room');
    alert(`"${trimmed}" katı, "${selectedYerleske}" yerleşkesine başarıyla eklendi! Şimdi oda açabilirsiniz.`);
  };

  const handleCreateRoom = () => {
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
    const brandNewRoom: KampOdasi = {
      id: `room_${Date.now()}`,
      yerleskeAdi: selectedYerleske,
      kogusNo: selectedKat,
      odaNo: newRoomNo,
      kapasite: Number(newRoomKapasite),
      firmaTipi: newRoomFirma,
      durum: 'BOŞ'
    };

    setKampOdalari(prev => [...prev, brandNewRoom]);
    setNewRoomNo("");
    setShowNewRoomForm(false);
    alert(`${selectedYerleske} - ${selectedKat} bünyesinde Oda No ${newRoomNo} başarıyla açılmıştır.`);
  };

  const handleResetToStandardCampBlocks = () => {
    if (!window.confirm("Dikkat! Tüm kamp odaları silinecek ve yerine A, B, C, D BLOK (3 kat, her katta 10 oda - Toplam 120 Oda) olarak sıfırdan oluşturulacaktır. Emin misiniz?")) {
      return;
    }
    const rooms: KampOdasi[] = [];
    const blocks = ["A BLOK", "B BLOK", "C BLOK", "D BLOK"];
    const floors = ["1. Kat", "2. Kat", "3. Kat"];
    
    let idCounter = 1;
    blocks.forEach(block => {
      floors.forEach((floor, fIdx) => {
        const floorNum = fIdx + 1; // 1, 2, 3
        for (let roomNum = 1; roomNum <= 10; roomNum++) {
          const roomStr = `${block.split(' ')[0]}-${floorNum}${roomNum < 10 ? '0' : ''}${roomNum}`; // A-101, B-204 etc.
          rooms.push({
            id: `ko_room_${idCounter++}_${Date.now()}`,
            yerleskeAdi: block,
            kogusNo: floor,
            odaNo: roomStr,
            kapasite: 6, // 6 beds capacity
            firmaTipi: "ANA_FIRMA",
            durum: "BOŞ"
          });
        }
      });
    });
    setKampOdalari(rooms);
    alert("120 Odalı Standart Kibritçi Blok Yapısı başarıyla kuruldu.");
  };

  const handleAssignResident = () => {
    if (!selectedRoomToAssign || !residentInputName) return;
    
    // Add assignment record
    const newReg: KampKaydi = {
      id: `kk_${Date.now()}`,
      personelIsim: residentInputName,
      odaId: selectedRoomToAssign.id,
      girisTarihi: new Date().toISOString().split('T')[0],
      durum: 'AKTIF',
      calistigiFirma: residentInputFirma
    };

    setKampKayitlari(prev => [...prev, newReg]);

    // Update room status
    setKampOdalari(prev => prev.map(room => {
      if (room.id === selectedRoomToAssign.id) {
        return { ...room, durum: "KISMEN DOLU" };
      }
      return room;
    }));

    setSelectedRoomToAssign(null);
    setResidentInputName("");
    setResidentInputFirma("");
    alert("Personel seçilen odaya başarıyla yerleştirildi.");
  };

  const handleEvictResident = (id: string, roomId: string) => {
    if (confirm("Seçili personeli odadan tahliye etmek istediğinize emin misiniz?")) {
      setKampKayitlari(prev => prev.filter(k => k.id !== id));
      alert("Tahliye işlemi gerçekleşti.");
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🏢 3. SAHA FAALİYETLERİ STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const PARSEL_BLOK_MAP: Record<string, string[]> = {
    "GENEL SAHA": [],
    "Parsel Bölge 157/46": ["GENEL SAHA", "A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2", "F1", "F2", "G", "H", "I"],
    "Parsel Bölge 157/51": ["GENEL SAHA", "A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "C4"],
    "Parsel Bölge 160/2":  ["GENEL SAHA", "A1A", "A1B", "A2A", "A2B", "B1", "B2", "C1", "C2", "C3", "C4", "B3"]
  };

  const [sahaNitelik, setSahaNitelik] = useState("");
  const [sahaParsel, setSahaParsel] = useState("GENEL SAHA");
  const [sahaBlok, setSahaBlok] = useState("");
  const [sahaAciklama, setSahaAciklama] = useState("");
  const [sahaUstaSayisi, setSahaUstaSayisi] = useState<number>(0);
  const [sahaIsciSayisi, setSahaIsciSayisi] = useState<number>(0);
  const [sahaFotoBase64, setSahaFotoBase64] = useState<string | undefined>(undefined);
  const [photoSelectedSim, setPhotoSelectedSim] = useState(false);
  
  // Selected daily/monthly field worker selection
  const [selectedFieldStaff, setSelectedFieldStaff] = useState<string[]>([]);
  
  const [sahaSearchKeyword, setSahaSearchKeyword] = useState("");
  const [editingSahaId, setEditingSahaId] = useState<string | null>(null);
  const [deleteConfirmSahaId, setDeleteConfirmSahaId] = useState<string | null>(null);

  // Saha PDF Report parameters
  const [sahaReportModal, setSahaReportModal] = useState(false);
  const [sahaReportType, setSahaReportType] = useState<'GUNLUK' | 'AYLIK'>('GUNLUK');
  const [sahaReportDate, setSahaReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [sahaReportMonth, setSahaReportMonth] = useState(6); // June

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

  const handleSahaPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setSahaFotoBase64(compressed);
        setPhotoSelectedSim(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSahaFaaliyeti = () => {
    if (!sahaNitelik) {
      alert("Lütfen iş niteliğini girin.");
      return;
    }
    if (!sahaAciklama) {
      alert("Lütfen günlük çalışma açıklamasını girin.");
      return;
    }

    if (editingSahaId) {
      setSahaFaaliyetleri(prev => prev.map(sf => {
        if (sf.id === editingSahaId) {
          return {
            ...sf,
            isNiteligi: sahaNitelik,
            parsel: sahaParsel,
            blok: sahaBlok,
            aciklama: sahaAciklama,
            fotoUrl: sahaFotoBase64 !== undefined ? (sahaFotoBase64 || undefined) : sf.fotoUrl,
            ustaSayisi: sahaUstaSayisi,
            isciSayisi: sahaIsciSayisi
          };
        }
        return sf;
      }));
      setEditingSahaId(null);
      setSahaAciklama("");
      setSahaNitelik("");
      setSahaFotoBase64(undefined);
      setPhotoSelectedSim(false);
      setSahaUstaSayisi(0);
      setSahaIsciSayisi(0);
      alert("Saha faaliyeti başarıyla güncellendi.");
    } else {
      const newLog: SahaFaaliyeti = {
        id: `sf_${Date.now()}`,
        personelId: "p1",
        tarih: new Date().toISOString().split('T')[0],
        isNiteligi: sahaNitelik,
        parsel: sahaParsel,
        blok: sahaBlok,
        aciklama: sahaAciklama,
        fotoUrl: sahaFotoBase64 || (photoSelectedSim ? "saha_foto_example.jpg" : undefined),
        ustaSayisi: sahaUstaSayisi,
        isciSayisi: sahaIsciSayisi
      };

      setSahaFaaliyetleri(prev => [newLog, ...prev]);
      setSahaAciklama("");
      setSahaNitelik("");
      setSahaFotoBase64(undefined);
      setPhotoSelectedSim(false);
      setSahaUstaSayisi(0);
      setSahaIsciSayisi(0);
      alert("Günlük saha imalat raporu başarıyla kaydedildi.");
    }
  };

  const handleStartEditSaha = (sf: SahaFaaliyeti) => {
    setEditingSahaId(sf.id);
    setSahaNitelik(sf.isNiteligi);
    setSahaParsel(sf.parsel);
    setSahaBlok(sf.blok);
    setSahaAciklama(sf.aciklama);
    setSahaUstaSayisi(sf.ustaSayisi || 0);
    setSahaIsciSayisi(sf.isciSayisi || 0);
  };

  const handleCancelEditSaha = () => {
    setEditingSahaId(null);
    setSahaAciklama("");
    setSahaNitelik("");
    setSahaFotoBase64(undefined);
    setPhotoSelectedSim(false);
    setSahaUstaSayisi(0);
    setSahaIsciSayisi(0);
  };

  const handleDeleteSahaFaaliyeti = (id: string) => {
    if (deleteConfirmSahaId === id) {
      setSahaFaaliyetleri(prev => prev.filter(sf => sf.id !== id));
      setDeleteConfirmSahaId(null);
      if (editingSahaId === id) {
        handleCancelEditSaha();
      }
    } else {
      setDeleteConfirmSahaId(id);
      setTimeout(() => {
        setDeleteConfirmSahaId(prev => prev === id ? null : prev);
      }, 4000);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 📜 4. HAZIR TUTANAKLAR STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [tutanakType, setTutanakType] = useState<'TAHSİS' | 'TESLİM' | 'SEVK' | 'HASAR' | 'GENEL' | 'CEZA'>("TAHSİS");
  const [tutanakSubject, setTutanakSubject] = useState("");
  const [tutanakPerson, setTutanakPerson] = useState("p1");
  const [tutanakText, setTutanakText] = useState("");
  const [taseronAdi, setTaseronAdi] = useState("");
  const [cezaTutari, setCezaTutari] = useState<number>(0);

  const [tutanakSearch, setTutanakSearch] = useState("");
  const [editingTutanakId, setEditingTutanakId] = useState<string | null>(null);
  const [deleteConfirmTutanakId, setDeleteConfirmTutanakId] = useState<string | null>(null);

  const handleSaveTutanak = () => {
    if (!tutanakSubject || !tutanakText) {
      alert("Lütfen tutanak konusu ve metin içeriğini doldurun.");
      return;
    }

    if (editingTutanakId) {
      setHazirTutanaklar(prev => prev.map(ht => {
        if (ht.id === editingTutanakId) {
          return {
            ...ht,
            tutanakTipi: tutanakType,
            personelId: tutanakPerson,
            konu: tutanakSubject,
            icerik: tutanakText,
            taseronAdi: taseronAdi,
            cezaTutari: cezaTutari
          };
        }
        return ht;
      }));
      setEditingTutanakId(null);
      setTutanakSubject("");
      setTutanakText("");
      setTaseronAdi("");
      setCezaTutari(0);
      alert("Tutanak başarıyla güncellendi.");
    } else {
      const docNo = `TUT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const newDoc: HazirTutanak = {
        id: `t_${Date.now()}`,
        tutanakTipi: tutanakType,
        belgeNo: docNo,
        personelId: tutanakPerson,
        konu: tutanakSubject,
        tarih: new Date().toISOString().split('T')[0],
        icerik: tutanakText,
        durum: "TASLAK",
        aciklama: "Yeni tutanak taslağı açıldı.",
        taseronAdi: taseronAdi,
        cezaTutari: cezaTutari
      };

      setHazirTutanaklar(prev => [newDoc, ...prev]);
      setTutanakSubject("");
      setTutanakText("");
      setTaseronAdi("");
      setCezaTutari(0);
      alert(`${docNo} numaralı resmi tutanak taslağı başarıyla kaydedildi.`);
    }
  };

  const handleStartEditTutanak = (ht: HazirTutanak) => {
    setEditingTutanakId(ht.id);
    setTutanakType(ht.tutanakTipi);
    setTutanakSubject(ht.konu);
    setTutanakPerson(ht.personelId || "p1");
    setTutanakText(ht.icerik);
    setTaseronAdi(ht.taseronAdi || "");
    setCezaTutari(ht.cezaTutari || 0);
  };

  const handleCancelEditTutanak = () => {
    setEditingTutanakId(null);
    setTutanakSubject("");
    setTutanakText("");
    setTaseronAdi("");
    setCezaTutari(0);
  };

  const handleDeleteTutanak = (id: string) => {
    if (deleteConfirmTutanakId === id) {
      setHazirTutanaklar(prev => prev.filter(t => t.id !== id));
      setDeleteConfirmTutanakId(null);
      if (editingTutanakId === id) {
        handleCancelEditTutanak();
      }
    } else {
      setDeleteConfirmTutanakId(id);
      setTimeout(() => {
        setDeleteConfirmTutanakId(prev => prev === id ? null : prev);
      }, 4000);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🏢 5. CARI & STOK STATES & EVENTS
  // ─────────────────────────────────────────────────────────────
  const [csTab, setCsTab] = useState<'cari' | 'stok'>('cari');
  const [newCariUnvan, setNewCariUnvan] = useState("");
  const [newCariType, setNewCariType] = useState<'CARI' | 'TEDARIKCI' | 'TASERON' | 'MUSTERI'>("TEDARIKCI");
  
  const [newStokAdi, setNewStokAdi] = useState("");
  const [newStokBirim, setNewStokBirim] = useState("TON");

  // Cari & Stok Edit, Delete, History state
  const [editingCariId, setEditingCariId] = useState<string | null>(null);
  const [editingStokId, setEditingStokId] = useState<string | null>(null);
  const [historyModalData, setHistoryModalData] = useState<{ type: 'cari' | 'stok'; id: string; name: string } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);

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
              badgeColor: 'bg-blue-100 text-blue-800'
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
              badgeColor: 'bg-blue-100 text-blue-800'
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
      setCariKartlar(prev => prev.map(c => c.id === editingCariId ? { ...c, unvan: newCariUnvan, kartTipi: newCariType } : c));
      setEditingCariId(null);
      setNewCariUnvan("");
      alert("Cari kart başarıyla güncellendi.");
      return;
    }
    const newC: CariKart = {
      id: `c_${Date.now()}`,
      kartTipi: newCariType,
      kod: `CARI-${Math.floor(100+Math.random()*900)}`,
      unvan: newCariUnvan,
      yetkili: "Yetkili Tanımsız",
      telefon: "",
      eposta: "",
      vergiNo: "",
      vergiDairesi: "",
      adres: "",
      iban: "",
      durum: "AKTIF",
      notlar: "Şantiye cari kartı."
    };
    setCariKartlar(prev => [...prev, newC]);
    setNewCariUnvan("");
    alert("Yeni cari kart başarıyla eklendi.");
  };

  const handleCreateStok = () => {
    if (!newStokAdi) return;
    if (editingStokId) {
      setStokKartlar(prev => prev.map(s => s.id === editingStokId ? { ...s, stokAdi: newStokAdi, birim: newStokBirim } : s));
      setEditingStokId(null);
      setNewStokAdi("");
      alert("Stok kartı başarıyla güncellendi.");
      return;
    }
    const newS: StokKart = {
      id: `s_${Date.now()}`,
      stokKodu: `STK-${Math.random().toString(16).substring(2,6).toUpperCase()}`,
      stokAdi: newStokAdi,
      kategori: "İnşaat Malzemesi",
      birim: newStokBirim,
      kritikSeviye: 10,
      durum: "AKTIF",
      aciklama: ""
    };
    setStokKartlar(prev => [...prev, newS]);
    setNewStokAdi("");
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

    // Trigger standard native mail client with the predefined subject and template content!
    const emailBody = encodeURIComponent(`Sayın Yetkili,\n\nKibritçi ERP Dijital Portalı üzerinden oluşturulan "${mailSubject}" başlıklı ve ${mailModul} modülüne ait rapor eki ekte bilginize sunulmuştur.\n\nBilgilerinize sunar, iyi çalışmalar dileriz.\n\nKibritçi İnşaat Sanayi ve Ticaret A.Ş.\nERP Otomasyon Merkezi`);
    window.open(`mailto:${mailTo}?subject=${encodeURIComponent(mailSubject)}&body=${emailBody}`, '_self');

    setEpostaGonderimleri(prev => [newMail, ...prev]);
    setMailSubject("");
    setMailTo("");
    alert("E-posta istemciniz başarıyla tetiklendi. Rapor gönderiliyor!");
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
            <div className="flex-1 flex gap-6 overflow-hidden">
              
              {/* Creator form drawer */}
              <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
                  <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Zimmet &amp; Envanter</span>
                  <h3 className="font-display font-semibold text-sm">🚛 Demirbaş / Araç Ekle</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Plaka / Envanter Kodu *</label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-blue-500"
                      value={newPlaka}
                      onChange={(e) => setNewPlaka(e.target.value)}
                      placeholder="34 KBR ..."
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Marka &amp; Model Detayı</label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-blue-500"
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
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-blue-500"
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

                <div className="p-4 border-t bg-slate-50">
                  <button 
                    onClick={handleCreateArac}
                    className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow cursor-pointer transition active:scale-95"
                  >
                    Araç / Demirbaşı Kaydet
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
                            <span>Ağır Bakım: <strong className="text-blue-700 font-mono font-bold text-[9px]">{heavyRemaining > 0 ? `${heavyRemaining} KM` : "HEMEN BAKIMA SOK!"}</strong></span>
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
                            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 py-1 rounded font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
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
            <div className="flex-1 flex gap-6 overflow-hidden">
              
              {/* Mileage logger submission form */}
              <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
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
                      <label className="text-[10px] font-bold text-blue-600 uppercase">🌙 AKŞAM KM SAYAÇ</label>
                      <input 
                        type="number"
                        className="w-full text-xs font-mono font-bold text-blue-800 mt-1 p-2 bg-blue-50 border border-blue-200 focus:outline-none focus:border-blue-500 rounded-lg"
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
                      className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] focus:outline-none focus:border-blue-500 rounded-lg"
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
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow cursor-pointer transition active:scale-95"
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
                  <span className="text-[10px] text-blue-800 font-bold bg-blue-50 border border-blue-105 px-2.5 py-0.5 rounded-full">
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
                            <h2 class="text-xl font-bold mb-4 uppercase">KİBRİTÇİ İNŞAAT - ARAÇ SAYAÇ & BAKIM RAPORU</h2>
                            ${el.innerHTML}
                          </body>
                        </html>
                      `);
                      printWindow?.document.close();
                      printWindow?.print();
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  <Printer size={13} />
                  <span>Raporu Yazdır</span>
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 bakim-raporu-print-area">
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
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🏕️ VIEW: KAMP YÖNETİMİ
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'kamp' && (
        <div className="flex-1 flex gap-6 overflow-hidden">
          
          {/* Left panel: Room Creation Form & Global stats */}
          <div className="w-[360px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Kamp &amp; Barınma</span>
              <h3 className="font-display font-semibold text-sm">🏕️ Oda Açma &amp; Kamp Yönetimi</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              
              {/* Oda Açma Menüsü */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-bold text-[10px] text-blue-700 uppercase block mb-2">🏢 Kamp Yapısı Oluşturma Paneli</span>
                
                {/* Step Sub-Tabs */}
                <div className="flex gap-1 bg-slate-200 p-1 rounded-lg mb-4 text-[9px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCampCreationStep('campus')}
                    className={`flex-1 py-1 rounded transition text-center ${
                      campCreationStep === 'campus' 
                        ? 'bg-blue-600 text-white shadow-sm' 
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
                        ? 'bg-blue-600 text-white shadow-sm' 
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
                        ? 'bg-blue-600 text-white shadow-sm' 
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
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg focus:ring-1 focus:ring-blue-500"
                        value={newCampusInput}
                        onChange={(e) => setNewCampusInput(e.target.value)}
                        placeholder="Örn: Kuzey Barınma Yerleşkesi"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateCampus}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg cursor-pointer transition shadow active:scale-95 text-xs"
                    >
                      + Yeni Yerleşke Ekle
                    </button>

                    <div className="pt-2 border-t mt-2">
                      <span className="text-[9px] text-slate-405 block font-bold uppercase mb-1">Mevcut Yerleşkeler:</span>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {campuses.map(camp => (
                          <div key={camp} className="text-[10px] bg-white p-1 px-2 rounded border font-semibold text-slate-700 flex justify-between items-center group">
                            <span>📍 {camp}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCampus(camp)}
                              className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Yerleşkeyi Sil"
                            >
                              ✕
                            </button>
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
                        className="w-full text-xs font-semibold mt-1 p-2 bg-white border rounded-lg focus:ring-1 focus:ring-blue-500"
                        value={newFloorInput}
                        onChange={(e) => setNewFloorInput(e.target.value)}
                        placeholder="Örn: C Blok (1. Kat)"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateFloor}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg cursor-pointer transition shadow active:scale-95 text-xs"
                    >
                      + Bu Yerleşkeye Kat/Blok Ekle
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
                              <button
                                type="button"
                                onClick={() => handleDeleteFloor(selectedYerleske, fl)}
                                className="text-red-500 hover:text-red-700 font-bold p-0.5 hover:bg-red-50 rounded transition cursor-pointer"
                                title="Kat/Blok Sil"
                              >
                                ✕
                              </button>
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
                          className="w-full text-xs font-bold mt-1 p-2 bg-white border rounded-lg focus:outline-none focus:border-blue-500"
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
                      + Yeni Koğuş Odası Aç
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
                  <span>Yerleşik Toplam Kadro:</span>
                  <strong className="text-slate-800">{kampKayitlari.length} Personel</strong>
                </div>
                <div className="flex justify-between">
                  <span>Toplam Yatak Kapasitesi:</span>
                  <strong className="text-slate-800">
                    {kampOdalari.reduce((acc, current) => acc + current.kapasite, 0)} Yatak
                  </strong>
                </div>

                <div className="pt-2 border-t mt-2 space-y-2">
                  <button
                    onClick={() => setShowKampKrokiModal(true)}
                    className="w-full bg-[#2563EB] hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg cursor-pointer transition flex items-center justify-center space-x-1"
                  >
                    <span>📋 Boş ve Dolu Kroki Raporu</span>
                  </button>

                  <button
                    onClick={handleResetToStandardCampBlocks}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-1.5 px-3 rounded-lg cursor-pointer transition text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                  >
                    <span>🏢 Blok Yapısını Kur (120 Oda)</span>
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
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-6 bg-slate-50/20">
              {/* Grouping logic by Floors (KogusNo) */}
              {Array.from(new Set(kampOdalari.map(r => r.kogusNo))).map(floorKey => {
                const floorRooms = kampOdalari.filter(r => r.kogusNo === floorKey);
                
                return (
                  <div key={floorKey} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                    {/* Floor Header */}
                    <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg border-l-4 border-blue-600">
                      <span className="font-bold text-slate-800 text-xs tracking-tight uppercase flex items-center">
                        🏢 {floorKey} Krokisi
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Kayıtlı {floorRooms.length} Oda Bulunuyor
                      </span>
                    </div>

                    {/* Rooms within this floor */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {floorRooms.map(room => {
                        const occupants = kampKayitlari.filter(cr => cr.roomId === room.id || cr.odaId === room.id);
                        const isFull = occupants.length >= room.kapasite;

                        return (
                          <div key={room.id} className="border border-slate-150 rounded-xl p-3 bg-slate-50/55 hover:bg-white hover:shadow transition duration-150 flex flex-col justify-between space-y-3">
                            <div className="flex justify-between items-start text-xs border-b pb-1.5 border-slate-100">
                              <div>
                                <h5 className="font-bold text-slate-900">{room.yerleskeAdi}</h5>
                                <p className="text-[9px] text-blue-600 font-semibold uppercase">{room.firmaTipi === 'ANA_FIRMA' ? 'Ana Kadro Lojmanı' : 'Taşeron Müfrezesi'}</p>
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
                                  {occupants.map(oc => (
                                    <div key={oc.id} className="flex justify-between items-center bg-white border border-slate-200 px-1.5 py-1 rounded text-[10px]">
                                      <span className="font-bold text-slate-800">👤 {oc.personelIsim}</span>
                                      <button 
                                        onClick={() => handleEvictResident(oc.id, room.id)}
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
                                  className="flex-grow bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white text-[9px] font-bold py-1.5 rounded-lg border border-blue-200 transition duration-150 cursor-pointer text-center"
                                >
                                  + Sakin Yerleştir (Elle / DB)
                                </button>
                              ) : (
                                <div className="flex-grow py-1.5 rounded-lg bg-slate-100 border text-center text-slate-400 text-[9px] font-bold">
                                  🚫 Oda Maksimum Dolulukta
                                </div>
                              )}
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
                  </div>
                );
              })}
            </div>
          </div>

          {/* 🏕️ RESIDENT ASSIGNMENT MODAL POPUP */}
          {selectedRoomToAssign && (
            <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-[440px] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                  <h4 className="font-display font-semibold text-sm">Odaya Personel Atama</h4>
                  <button onClick={() => setSelectedRoomToAssign(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✖</button>
                </div>

                <div className="p-5 space-y-4 text-xs">
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-150">
                    <span className="font-bold text-[9px] text-blue-500 block mb-0.5">Atanacak Hedef Oda ve Kat:</span>
                    <p className="font-bold text-slate-800">{selectedRoomToAssign.yerleskeAdi}</p>
                    <span className="text-[10px] text-slate-600 block">{selectedRoomToAssign.kogusNo} · Oda No: {selectedRoomToAssign.odaNo}</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Yerleştirilecek Personel İsmi *</label>
                    <input 
                      type="text"
                      className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 transition focus:outline-none"
                      placeholder="Buraya elle yazabilir veya aşağıdaki veritabaından seçebilirsiniz"
                      value={residentInputName}
                      onChange={(e) => setResidentInputName(e.target.value)}
                    />
                  </div>

                  {/* Personel Bilgisi Database'den ve Elle Girişe Açık 2 Türlü de Serbest */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Veritabanından Hızlı Personel Seçin</span>
                    <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border p-2 rounded-xl bg-slate-100/50">
                      {personeller.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setResidentInputName(`${p.ad} ${p.soyad}`)}
                          className="text-[10px] text-left bg-white border border-slate-200 hover:bg-blue-50 p-1.5 rounded font-medium text-slate-700 transition cursor-pointer flex items-center space-x-1"
                        >
                          <span>👤</span>
                          <span className="truncate">{p.ad} {p.soyad}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
                  <button onClick={() => setSelectedRoomToAssign(null)} className="bg-slate-150 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl transition">İptal</button>
                  <button onClick={handleAssignResident} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-xl transition shadow active:scale-95">Odaya Sakin Olarak Kaydet</button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🏗️ VIEW: SAHA FAALİYETLERİ
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'saha' && (
        <div className="flex-1 flex gap-6 overflow-hidden">
          
          {/* Creator drawer */}
          <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Saha Görev Kaydı</span>
              <h3 className="font-display font-semibold text-sm">🏗️ Günlük İmalat Girişi</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İş Niteliği / Yapılan İmalat *</label>
                <input 
                  type="text"
                  placeholder="Örn: C30 Beton Dökümü, Demir Bağlama vb."
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-blue-500"
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
                      const availableBloks = PARSEL_BLOK_MAP[parsel] || [];
                      setSahaBlok(availableBloks.length > 0 ? availableBloks[0] : "");
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

              {/* Photo uploader with true file selection */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-[10px] text-slate-500 block">Saha Fotoğrafı</span>
                    <span className="text-[9px] text-slate-400 block">
                      {sahaFotoBase64 ? "✓ Gerçek fotoğraf yüklendi" : photoSelectedSim ? "✓ foto_saha.jpg seçildi" : "Görsel yüklenmedi"}
                    </span>
                  </div>
                  <label className="bg-blue-600 hover:bg-blue-750 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 cursor-pointer shadow-sm transition">
                    <FileUp size={12} />
                    <span>Dosya Seç</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleSahaPhotoChange}
                    />
                  </label>
                </div>
                {sahaFotoBase64 && (
                  <div className="relative border rounded-lg overflow-hidden max-h-24 bg-black/5">
                    <img src={sahaFotoBase64} alt="Pre-upload" className="w-full h-24 object-contain" />
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

          {/* List waybills screen column */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-col space-y-2.5 shrink-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Building2 size={16} className="text-[#2563EB]" />
                  <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Saha Günlük Çalışma Listesi</h4>
                </div>
                <button
                  onClick={() => setSahaReportModal(true)}
                  className="text-[10px] bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold px-2.5 py-1 rounded-lg shadow transition duration-150 flex items-center space-x-1 cursor-pointer"
                >
                  <span>🖨️ Saha Aktif Raporu (Günlük / Aylık)</span>
                </button>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="İş niteliği, açıklama veya parsel ara..."
                  value={sahaSearchKeyword}
                  onChange={(e) => setSahaSearchKeyword(e.target.value)}
                  className="w-full bg-white text-xs text-slate-800 border border-slate-250 rounded-lg py-1.5 pl-3 pr-8 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition font-medium"
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-50/20">
              {sahaFaaliyetleri
                .filter(sf => {
                  const keyword = sahaSearchKeyword.toLowerCase().trim();
                  if (!keyword) return true;
                  return (
                    sf.isNiteligi.toLowerCase().includes(keyword) ||
                    sf.aciklama.toLowerCase().includes(keyword) ||
                    sf.parsel.toLowerCase().includes(keyword) ||
                    (sf.blok && sf.blok.toLowerCase().includes(keyword))
                  );
                })
                .map(sf => (
                <div key={sf.id} className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between hover:shadow transition duration-150 shadow-sm">
                  <div className="flex justify-between items-start text-xs border-b pb-2 mb-2">
                    <div>
                      <span className="font-bold text-slate-800">{sf.isNiteligi}</span>
                      <p className="text-[9px] text-[#2563EB] font-bold mt-1">Saha Lokasyon: {sf.parsel} · {sf.blok} · {sf.tarih}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 font-sans tracking-tight leading-relaxed">
                    {sf.aciklama}
                  </p>

                  {/* Render worker count badges */}
                  {(sf.ustaSayisi !== undefined || sf.isciSayisi !== undefined) && (
                    <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-150 flex gap-4">
                      {sf.ustaSayisi !== undefined && (
                        <div className="text-[10px]">
                          <span className="text-slate-400 font-bold block text-[8px] uppercase">Çalışan Usta</span>
                          <strong className="text-blue-800">{sf.ustaSayisi} Kişi</strong>
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

                  {/* Render checked field labor staff tags */}
                  {(!sf.ustaSayisi && !sf.isciSayisi && sf.aktifPersonelListesi && sf.aktifPersonelListesi.length > 0) && (
                    <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">👷 Aktif Sahadaki Kadro:</span>
                      <div className="flex flex-wrap gap-1">
                        {sf.aktifPersonelListesi.map((name, i) => (
                          <span key={i} className="text-[9px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-150 px-1.5 py-0.5 rounded">
                            👤 {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {sf.fotoUrl && (
                    <div className="mt-3 space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">📷 İMALAT SAHA FOTOĞRAFI:</span>
                      <div className="relative border rounded-xl overflow-hidden max-w-sm max-h-48 bg-slate-50">
                        <img 
                          src={sf.fotoUrl} 
                          alt="Saha İmalat Görseli" 
                          referrerPolicy="no-referrer"
                          className="max-h-48 max-w-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Card Actions: Edit and Safe Delete */}
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
                        title="Tıklayarak kalıcı olarak silin"
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
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          📜 VIEW: HAZIR TUTANAKLAR
          ───────────────────────────────────────────────────────────── */}
      {currentSubTab === 'tutanak' && (
        <div className="flex-1 flex gap-6 overflow-hidden">
          
          {/* Creator drawer */}
          <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Hukuki Belgeler</span>
              <h3 className="font-display font-semibold text-sm">📜 Yeni Tutanak Oluştur</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tutanak Şablon Tipi</label>
                <select 
                  className="w-full text-xs font-bold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  value={tutanakType}
                  onChange={(e) => setTutanakType(e.target.value as any)}
                >
                  <option value="TAHSİS">Tahsis / Zimmet Tutanağı</option>
                  <option value="TESLİM">Malzeme Teslim Tutanağı</option>
                  <option value="SEVK">Sevk / Sevkiyat Tutanağı</option>
                  <option value="HASAR">Zarar / Hasar Tespit Protokolü</option>
                  <option value="GENEL">Normal Şantiye Genel Tutanağı</option>
                  <option value="CEZA">Ceza İhtar Tutanağı</option>
                </select>
              </div>

              {tutanakType === 'CEZA' && (
                <div className="space-y-4 bg-red-50/50 p-3.5 rounded-xl border border-red-200 animate-in fade-in duration-150">
                  <span className="font-bold text-[9px] text-red-800 uppercase tracking-widest block">⚠️ CEZA UYGULAMA BİLGİLERİ</span>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Ceza Kesilecek Taşeron Firma</label>
                    <div className="flex gap-2 mt-1">
                      <select 
                        className="flex-1 text-xs font-semibold p-2 bg-white border border-[#e2e8f0] rounded-lg"
                        value={taseronAdi}
                        onChange={(e) => setTaseronAdi(e.target.value)}
                      >
                        <option value="">-- Taşeron Seç (Cari Rehber) --</option>
                        {cariKartlar.map(c => (
                          <option key={c.id} value={c.unvan}>{c.unvan}</option>
                        ))}
                      </select>
                      <input 
                        type="text"
                        placeholder="Veya manuel yazın"
                        className="w-1/2 text-xs font-semibold p-2 bg-white border border-[#e2e8f0] rounded-lg"
                        value={taseronAdi}
                        onChange={(e) => setTaseronAdi(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Uygulanacak Ceza Tutarı (₺)</label>
                    <input 
                      type="number" 
                      min={0}
                      className="w-full text-xs font-semibold mt-1 p-2 bg-white border border-[#e2e8f0] rounded-lg"
                      placeholder="₺0.00"
                      value={cezaTutari || ""}
                      onChange={(e) => setCezaTutari(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tutanak Konusu / Başlığı *</label>
                <input 
                  type="text" 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  placeholder="Örn: Transit Kaza Hasar Tespit"
                  value={tutanakSubject}
                  onChange={(e) => setTutanakSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Muhatap Personel</label>
                <select 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  value={tutanakPerson}
                  onChange={(e) => setTutanakPerson(e.target.value)}
                >
                  {personeller.map(p => (
                    <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tutanak Metin İçeriği *</label>
                <textarea 
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
                  rows={6}
                  placeholder="Hukuki dili koruyarak şantiye kurallarına göre tutanak detaylarını yazın..."
                  value={tutanakText}
                  onChange={(e) => setTutanakText(e.target.value)}
                />
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              {editingTutanakId ? (
                <div className="flex flex-col space-y-2">
                  <button 
                    onClick={handleSaveTutanak}
                    className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer"
                  >
                    Tutanak Taslağını Güncelle
                  </button>
                  <button 
                    onClick={handleCancelEditTutanak}
                    className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 rounded-xl transition cursor-pointer"
                  >
                    Düzenlemeyi İptal Et
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleSaveTutanak}
                  className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer"
                >
                  Tutanak Taslağını Kaydet
                </button>
              )}
            </div>
          </div>

          {/* List waybills screen column */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-col space-y-2.5">
              <div className="flex items-center space-x-2">
                <FileText size={16} className="text-[#2563EB]" />
                <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Hazır Şantiye Tutanakları</h4>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Belge no, konu, içerik veya tip ara..."
                  value={tutanakSearch}
                  onChange={(e) => setTutanakSearch(e.target.value)}
                  className="w-full bg-white text-xs text-slate-800 border border-slate-250 rounded-lg py-1.5 pl-3 pr-8 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition font-medium"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {hazirTutanaklar
                .filter(ht => {
                  const keyword = tutanakSearch.toLowerCase().trim();
                  if (!keyword) return true;
                  return (
                    ht.belgeNo.toLowerCase().includes(keyword) ||
                    ht.konu.toLowerCase().includes(keyword) ||
                    ht.icerik.toLowerCase().includes(keyword) ||
                    ht.tutanakTipi.toLowerCase().includes(keyword)
                  );
                })
                .map(ht => {
                  const targetP = personeller.find(p => p.id === ht.personelId);
                return (
                  <div key={ht.id} className="border border-slate-150 rounded-xl p-5 bg-white space-y-4 hover:shadow transition">
                    <div className="flex justify-between items-center text-xs border-b pb-2.5">
                      <div>
                        <span className="font-mono bg-slate-100 rounded px-2.5 py-0.5 text-slate-700 font-bold border border-slate-200">{ht.belgeNo}</span>
                        <p className="text-[9px] text-[#2563EB] font-bold mt-1.5 uppercase">TİP: {ht.tutanakTipi} · {ht.tarih}</p>
                      </div>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {ht.durum}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 text-xs">{ht.konu}</h4>
                      <p className="text-xs text-slate-500 font-medium">Birlikte Tutulan Kişi: <strong className="text-slate-700">{targetP ? `${targetP.ad} ${targetP.soyad}` : "Genel"}</strong></p>
                    </div>

                    <p className="text-xs text-slate-600 bg-slate-50 border p-3 rounded-lg font-sans tracking-tight leading-relaxed italic">
                      "{ht.icerik}"
                    </p>

                    {ht.tutanakTipi === 'CEZA' && (
                      <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-[10.5px] space-y-1">
                        <span className="font-bold text-red-800 uppercase block">⚠️ CEZA DETAYLARI:</span>
                        <p><strong>Cezalı Taşeron:</strong> {ht.taseronAdi || 'Belirtilmemiş'}</p>
                        <p><strong>Uygulanan Para Cezası:</strong> ₺{(ht.cezaTutari || 0).toLocaleString('tr-TR')}</p>
                      </div>
                    )}

                    {ht.imzaliEvrakUrl && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-32">
                        <img src={ht.imzaliEvrakUrl} alt="İmzalı Belge Görseli" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="flex flex-wrap justify-end gap-2 pt-2 border-t text-[10px]">
                      {/* Physical Signed Doc Upload */}
                      <label className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition">
                        <Upload size={11} />
                        <span>{ht.imzaliEvrakUrl ? "İmza Güncelle" : "İmzalı Belge Yükle"}</span>
                        <input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const rawBase64 = reader.result as string;
                                const compressed = await compressImage(rawBase64);
                                setHazirTutanaklar(prev => prev.map(item => {
                                  if (item.id === ht.id) {
                                    return {
                                      ...item,
                                      imzaliEvrakUrl: compressed,
                                      durum: 'ONAYLANDI'
                                    };
                                  }
                                  return item;
                                }));
                                alert("Islak imzalı tutanak başarıyla sisteme yüklendi!");
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>

                      {/* E-Posta Gönder button if signed */}
                      {(ht.imzaliEvrakUrl || ht.durum === 'ONAYLANDI') && (
                        <button
                          type="button"
                          onClick={() => alert(`${ht.belgeNo} nolu ıslak imzalı ${ht.tutanakTipi} tutanağı merkez ofise (merkez@kibritci.com) e-posta ile başarıyla gönderildi!`)}
                          className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-1 px-2.5 rounded-lg transition cursor-pointer flex items-center space-x-1"
                        >
                          <Send size={11} />
                          <span>E-Posta Gönder</span>
                        </button>
                      )}

                      <button 
                        onClick={() => handleStartEditTutanak(ht)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold py-1 px-2.5 rounded-lg transition cursor-pointer"
                      >
                        ✏️ Düzenle
                      </button>

                      {deleteConfirmTutanakId === ht.id ? (
                        <button 
                          onClick={() => handleDeleteTutanak(ht.id)}
                          className="bg-red-650 hover:bg-red-700 text-white font-extrabold py-1 px-2.5 rounded-lg transition animate-pulse cursor-pointer"
                          title="Silmek için tekrar tıklayın"
                        >
                          Emin misiniz? Sil
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleDeleteTutanak(ht.id)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-1 px-2.5 rounded-lg transition cursor-pointer"
                        >
                          🗑️ Sil
                        </button>
                      )}

                      <button 
                        onClick={() => alert("Hukuki imzalı kopya yazıcıya gönderildi.")}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-1 px-3 rounded-lg transition cursor-pointer"
                      >
                        🖨️ Islak İmzalı Çıkart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

          <div className="flex-1 flex gap-6 overflow-hidden">
            {csTab === 'cari' ? (
              <>
                {/* Form left */}
                <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="bg-[#f59e0b] text-[#0f172a] p-4 shrink-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase">Finansal Rehber</span>
                    <h3 className="font-display font-semibold text-sm">🏢 Yeni Cari Firma Kaydet</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
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
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Kart Tipi</label>
                      <select 
                        className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                        value={newCariType}
                        onChange={(e) => setNewCariType(e.target.value as any)}
                      >
                        <option value="TEDARIKCI">Tedarikçi Filtresi</option>
                        <option value="TASERON">Altyüklenici Taşeron</option>
                        <option value="MUSTERI">Müşteri / Malik</option>
                        <option value="CARI">Diğer Cari</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-4 border-t bg-slate-50">
                    <button 
                      onClick={handleCreateCari}
                      className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
                    >
                      Cari Firma Kaydet
                    </button>
                  </div>
                </div>

                {/* List waybills screen column */}
                <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center space-x-2">
                    <ClipboardList size={16} className="text-[#f59e0b]" />
                    <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Mevcut Cariler</h4>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {cariKartlar.map(cr => (
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
                            }}
                            className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                          >
                            <span>✏️ Düzelt</span>
                          </button>
                          <button 
                            onClick={() => {
                              if (window.confirm("Bu cari kartı silmek istediğinize emin misiniz?")) {
                                setCariKartlar(prev => prev.filter(c => c.id !== cr.id));
                                alert("Cari kart silindi.");
                              }
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
                <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="bg-[#2563eb] text-[#ffffff] p-4 shrink-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase">Malzeme Envanteri</span>
                    <h3 className="font-display font-semibold text-sm">📦 Yeni Stok Kaydı Ekle</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
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
                  </div>

                  <div className="p-4 border-t bg-slate-50">
                    <button 
                      onClick={handleCreateStok}
                      className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
                    >
                      Stok Kartı Ekle
                    </button>
                  </div>
                </div>

                {/* List waybills screen column */}
                <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center space-x-2">
                    <Package size={16} className="text-[#2563eb]" />
                    <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Mevcut Malzemeler</h4>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {stokKartlar.map(st => (
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
        <div className="flex-1 flex gap-6 overflow-hidden">
          
          {/* Creator drawer */}
          <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Haberleşme Havuzu</span>
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
                    <span className="text-[9px] font-bold text-blue-600 block mt-1 uppercase">MODÜL: {ep.modul}</span>
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
              
              {/* Header decor */}
              <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
                  <p className="text-xs text-slate-500 font-semibold tracking-wide uppercase">TEKNİK MÜHENDİSLİK VE SAHA FAALİYETLERİ DAİRE BAŞKANLIĞI</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Rapor Kapsamı: <strong className="text-slate-900 font-bold">{sahaReportType === 'GUNLUK' ? `GÜNLÜK (${sahaReportDate})` : `AYLIK (${sahaReportMonth}. Ay / 2026)`}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="border border-slate-900 text-[10px] font-bold px-3 py-1 bg-slate-50 uppercase tracking-widest block mb-1">
                    RAPOR MODELİ: KBR-SH-2026-{sahaReportType}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Baskı Tarihi: {new Date().toLocaleDateString('tr-TR')}</span>
                </div>
              </div>

              {/* Title Header */}
              <div className="text-center mb-6">
                <h2 className="text-sm font-bold text-slate-900 tracking-wider uppercase border-y border-slate-200 py-2.5 bg-slate-50">
                  {sahaReportType === 'GUNLUK' ? 'GÜNLÜK ŞANTİYE İMALAT VE FAALİYET REFERANS RAPORU' : 'AYLIK DETAYLI ŞANTİYE İMALAT VE FAALİYET KONSOLİDE RAPORU'}
                </h2>
                <p className="text-[9px] text-slate-400 mt-1 italic">
                  * Bu belge, o gün şantiyede aktif çalışan personelleri, metraj döküm ve imalat miktarlarını ispatlayan teknik referans belgesidir.
                </p>
              </div>

              {sahaReportType === 'GUNLUK' && (() => {
                const parts = sahaReportDate.split('-');
                const dayNum = parseInt(parts[2]);
                const activePersonel = personeller.filter(p => p.durum === true || String(p.durum) === 'true');
                let countGeldi = 0;
                let countYok = 0;
                let countIzinli = 0;
                let countRaporlu = 0;
                let countGirilmedi = 0;

                activePersonel.forEach(p => {
                  const pYoklama = yoklamalar[p.id] || {};
                  const dayData = pYoklama[dayNum];
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
                  <div className="mb-6 bg-slate-50 border border-slate-300 p-4 rounded-xl">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2">📊 O Günkü Toplam Şantiye Yoklama/Katılım Durumu</span>
                    <div className="grid grid-cols-5 gap-3 text-center">
                      <div className="bg-white border rounded-lg p-2">
                        <span className="text-[9px] text-slate-400 block font-bold">TOPLAM KADRO</span>
                        <strong className="text-xs font-bold text-slate-800">{totalPersonnel} Kişi</strong>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-250 rounded-lg p-2 text-emerald-800">
                        <span className="text-[9px] text-emerald-600 block font-bold">GELEN (AKTİF)</span>
                        <strong className="text-xs font-black">{countGeldi} Kişi</strong>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-850">
                        <span className="text-[9px] text-red-650 block font-bold">GELMEYEN</span>
                        <strong className="text-xs font-black">{countYok} Kişi</strong>
                      </div>
                      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-2 text-cyan-800">
                        <span className="text-[9px] text-cyan-600 block font-bold">İZİNLİ / RAPORLU</span>
                        <strong className="text-xs font-bold">{countIzinli + countRaporlu} Kişi</strong>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800">
                        <span className="text-[9px] text-amber-600 block font-bold">GİRİLMEMİŞ / DİĞER</span>
                        <strong className="text-xs font-bold text-slate-600">{countGirilmedi} Kişi</strong>
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
                  <div className="border border-slate-350 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-slate-800 border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800/80 font-bold border-b border-slate-300 text-[10px] uppercase tracking-wide">
                          <th className="p-2.5 text-left border-r border-slate-200 w-24">Tarih</th>
                          <th className="p-2.5 text-left border-r border-slate-200 w-44">İşin Niteliği / Lokasyon</th>
                          <th className="p-2.5 text-left">Teknik Çalışma Açıklaması &amp; Metraji &amp; Fotoğrafları</th>
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
                        }).map(sf => (
                          <tr key={sf.id} className="border-b border-slate-200 text-[11px] font-sans hover:bg-slate-50/50">
                            <td className="p-3 border-r border-slate-200 font-bold text-slate-950 whitespace-nowrap">{sf.tarih}</td>
                            <td className="p-3 border-r border-slate-200">
                              <span className="font-bold text-slate-900 block">{sf.isNiteligi}</span>
                              <span className="text-[9px] font-semibold text-blue-600 block uppercase mt-0.5">{sf.parsel} · {sf.blok}</span>
                            </td>
                            <td className="p-3 text-slate-650 leading-relaxed font-normal">
                              <p className="whitespace-pre-line leading-relaxed">{sf.aciklama}</p>
                              {sf.fotoUrl && (
                                <div className="mt-3 inline-block border border-slate-200 rounded-lg p-1 bg-white max-w-[160px] shadow-xs">
                                  <img 
                                    src={sf.fotoUrl} 
                                    alt="İmalat Saha Fotoğrafı" 
                                    referrerPolicy="no-referrer"
                                    className="h-20 w-auto object-cover rounded-md block mx-auto"
                                  />
                                  <span className="text-[7px] text-slate-400 block mt-1 tracking-wider text-center font-mono font-bold uppercase">📷 SAHA İMALAT GÖRSELİ</span>
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
                  const dayNum = parseInt(parts[2]);
                  const activePersonel = personeller.filter(p => p.durum === true || String(p.durum) === 'true');
                  const sahadakiAktifKadro = activePersonel.filter(p => {
                    const pYoklama = yoklamalar[p.id] || {};
                    const dayData = pYoklama[dayNum];
                    return dayData && dayData.durum === 'Geldi';
                  });

                  return (
                    <div className="mt-6 bg-slate-50 border border-slate-300 rounded-xl p-4">
                      <span className="text-[10px] font-extrabold text-slate-700 uppercase tracking-widest block mb-2.5 pb-1 border-b border-slate-200">
                        👷 O GÜN ŞANTİYEDE ÇALIŞAN AKTİF PERSONEL KADROSU ({sahadakiAktifKadro.length} Personel)
                      </span>
                      {sahadakiAktifKadro.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sahadakiAktifKadro.map((p) => (
                            <span key={p.id} className="text-[9px] font-bold bg-white text-slate-800 border border-slate-200 px-2 py-1 rounded-md shadow-xs inline-flex items-center space-x-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>{p.ad} {p.soyad}</span>
                              <span className="text-[8px] text-slate-400 font-medium">({p.gorev})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">O gün için puantaj cetvelinde aktif şantiye çalışanı (GELDI durumunda) bulunmamaktadır.</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Official Signature Lines */}
              {(() => {
                const activeOnayKey = sahaReportType === 'GUNLUK' ? sahaReportDate : `AYLIK_2026_${sahaReportMonth}`;
                const currentOnay = sahaRaporOnaylari[activeOnayKey] || {};

                return (
                  <div className="mt-12 text-xs">
                    <div className="bg-slate-200 border border-slate-300 p-2.5 text-[9px] font-extrabold text-slate-800 uppercase tracking-wider mb-6">
                      📌 TEKNİK MERKEZ VE ŞANTİYE ONAY DEPARTMANLARI (E-İMZA SİSTEMİ)
                    </div>
                    <div className="grid grid-cols-3 gap-6 text-center">
                      
                      {/* 1. HAZIRLAYAN (FORMEN) */}
                      <div className="border border-slate-300 p-4 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[160px]">
                        <div>
                          <span className="font-extrabold text-[#2563EB] tracking-wider uppercase block mb-0.5 text-[10px]">HAZIRLAYAN (FORMEN)</span>
                          <span className="text-[9px] text-slate-500 block mb-4">Saha Şantiye Formeni</span>
                        </div>
                        
                        <div className="my-auto">
                          {currentOnay.hazirlayanSigned ? (
                            <div className="relative group">
                              <span className="font-serif italic font-black text-blue-700 text-sm tracking-wide block py-1 bg-blue-50/50 rounded border border-dashed border-blue-200 shadow-3xs">
                                ✍️ {currentOnay.hazirlayanName}
                              </span>
                              <span className="text-[7px] text-emerald-600 font-bold block mt-1">
                                ✔️ E-İMZA ONAYLI · {currentOnay.hazirlayanDate}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTemizleOnay('hazirlayan')}
                                className="print:hidden mt-2 text-[8px] font-extrabold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded transition inline-block cursor-pointer"
                              >
                                ✖ Onayı Kaldır
                              </button>
                            </div>
                          ) : (
                            <div className="print:hidden space-y-2">
                              <input
                                type="text"
                                placeholder="Formen İsim Soyisim"
                                className="w-full text-center border-b pb-1 text-[11px] text-slate-800 outline-none focus:border-blue-500 font-semibold bg-transparent"
                                value={tempHazirlayan}
                                onChange={(e) => setTempHazirlayan(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={onayLoading}
                                onClick={() => handleOnayla('hazirlayan', tempHazirlayan)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] py-1 px-2 rounded tracking-wide uppercase transition cursor-pointer"
                              >
                                {onayLoading ? 'Lütfen Bekleyin...' : '✅ E-İmza ile Onayla'}
                              </button>
                            </div>
                          )}
                          {!currentOnay.hazirlayanSigned && (
                            <div className="hidden print:block text-slate-300 italic text-[10px] my-4">
                              (Paraf / Islak İmza)
                            </div>
                          )}
                        </div>

                        <div className="mt-4">
                          <div className="h-0.5 bg-slate-200 w-32 mx-auto mb-1"></div>
                          <span className="text-[8px] text-slate-400 italic block">Formen İmza</span>
                        </div>
                      </div>

                      {/* 2. KONTROL EDEN (ŞANTİYE ŞEFİ) */}
                      <div className="border border-slate-300 p-4 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[160px]">
                        <div>
                          <span className="font-extrabold text-[#2563EB] tracking-wider uppercase block mb-0.5 text-[10px]">KONTROL EDEN (ŞANTİYE ŞEFİ)</span>
                          <span className="text-[9px] text-slate-500 block mb-4">Şantiye Şefi / Başmühendis</span>
                        </div>

                        <div className="my-auto">
                          {currentOnay.kontrolEdenSigned ? (
                            <div className="relative group">
                              <span className="font-serif italic font-black text-blue-700 text-sm tracking-wide block py-1 bg-blue-50/50 rounded border border-dashed border-blue-200 shadow-3xs">
                                ✍️ {currentOnay.kontrolEdenName}
                              </span>
                              <span className="text-[7px] text-emerald-600 font-bold block mt-1">
                                ✔️ E-İMZA ONAYLI · {currentOnay.kontrolEdenDate}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTemizleOnay('kontrolEden')}
                                className="print:hidden mt-2 text-[8px] font-extrabold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded transition inline-block cursor-pointer"
                              >
                                ✖ Onayı Kaldır
                              </button>
                            </div>
                          ) : (
                            <div className="print:hidden space-y-2">
                              <input
                                type="text"
                                placeholder="Şantiye Şefi İsim Soyisim"
                                className="w-full text-center border-b pb-1 text-[11px] text-slate-800 outline-none focus:border-blue-500 font-semibold bg-transparent"
                                value={tempKontrolEden}
                                onChange={(e) => setTempKontrolEden(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={onayLoading}
                                onClick={() => handleOnayla('kontrolEden', tempKontrolEden)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] py-1 px-2 rounded tracking-wide uppercase transition cursor-pointer"
                              >
                                {onayLoading ? 'Lütfen Bekleyin...' : '✅ E-İmza ile Onayla'}
                              </button>
                            </div>
                          )}
                          {!currentOnay.kontrolEdenSigned && (
                            <div className="hidden print:block text-slate-300 italic text-[10px] my-4">
                              (Paraf / Islak İmza)
                            </div>
                          )}
                        </div>

                        <div className="mt-4">
                          <div className="h-0.5 bg-slate-200 w-32 mx-auto mb-1"></div>
                          <span className="text-[8px] text-slate-400 italic block">Şantiye Şefi İmza</span>
                        </div>
                      </div>

                      {/* 3. ONAYLAYAN (PROJE MÜDÜRÜ) */}
                      <div className="border border-slate-300 p-4 rounded-xl bg-slate-50 flex flex-col justify-between min-h-[160px]">
                        <div>
                          <span className="font-extrabold text-[#2563EB] tracking-wider uppercase block mb-0.5 text-[10px]">ONAYLAYAN (PROJE MÜDÜRÜ)</span>
                          <span className="text-[9px] text-slate-500 block mb-4">Proje Müdürü / Kibritçi Temsilcisi</span>
                        </div>

                        <div className="my-auto">
                          {currentOnay.onaylayanSigned ? (
                            <div className="relative group">
                              <span className="font-serif italic font-black text-blue-700 text-sm tracking-wide block py-1 bg-blue-50/50 rounded border border-dashed border-blue-200 shadow-3xs">
                                ✍️ {currentOnay.onaylayanName}
                              </span>
                              <span className="text-[7px] text-emerald-600 font-bold block mt-1">
                                ✔️ E-İMZA ONAYLI · {currentOnay.onaylayanDate}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTemizleOnay('onaylayan')}
                                className="print:hidden mt-2 text-[8px] font-extrabold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded transition inline-block cursor-pointer"
                              >
                                ✖ Onayı Kaldır
                              </button>
                            </div>
                          ) : (
                            <div className="print:hidden space-y-2">
                              <input
                                type="text"
                                placeholder="Proje Müdürü İsim Soyisim"
                                className="w-full text-center border-b pb-1 text-[11px] text-slate-800 outline-none focus:border-blue-500 font-semibold bg-transparent"
                                value={tempOnaylayan}
                                onChange={(e) => setTempOnaylayan(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={onayLoading}
                                onClick={() => handleOnayla('onaylayan', tempOnaylayan)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] py-1 px-2 rounded tracking-wide uppercase transition cursor-pointer"
                              >
                                {onayLoading ? 'Lütfen Bekleyin...' : '✅ E-İmza ile Onayla'}
                              </button>
                            </div>
                          )}
                          {!currentOnay.onaylayanSigned && (
                            <div className="hidden print:block text-slate-300 italic text-[10px] my-4">
                              (Kaşe / Kağıt İmza)
                            </div>
                          )}
                        </div>

                        <div className="mt-4">
                          <div className="h-0.5 bg-slate-200 w-32 mx-auto mb-1"></div>
                          <span className="text-[8px] text-slate-400 italic block">Proje Müdürü İmza</span>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}

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
            <div className="bg-white rounded-3xl w-[750px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
              
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
                <div id="arac-print-area" className="bg-white border p-6 rounded-2xl shadow-sm space-y-6 text-slate-800 relative font-sans">
                  
                  {/* Kibritci Logo & Rapor Başlığı */}
                  <div className="flex justify-between items-center border-b pb-4">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2 shrink-0 h-10">
                        {/* Elegant Architectural K-shaped SVG Logo */}
                        <svg viewBox="0 0 140 120" className="h-full w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="5" y="5" width="112" height="112" rx="10" stroke="#1E4E78" strokeWidth="4" />
                          <path d="M15 115 V75 L35 50 V115" fill="#8B1E1E" />
                          <path d="M35 115 V52 L58 30 V115" fill="#B91C1C" />
                          <path d="M58 52 L95 90 H72 L45 61 Z" fill="#8B1E1E" />
                          <path d="M58 85 L95 115 H72 L58 100 Z" fill="#1E4E78" />
                          <line x1="15" y1="115" x2="115" y2="115" stroke="#1E4E78" strokeWidth="4" />
                        </svg>
                        <div className="flex flex-col leading-none font-bold">
                          <span className="text-[#1E4E78] tracking-wider text-sm uppercase">KİBRİTÇİ</span>
                          <span className="text-[#8B1E1E] tracking-widest text-[9px] mt-0.5">İNŞAAT A.Ş.</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold block text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px] uppercase">Plaka/Kod: {selectedAracForPdf.plaka}</span>
                      <span className="text-[8px] text-slate-400 font-bold block mt-1 tracking-widest uppercase">LİSANS NO: KB-SRY-2026</span>
                    </div>
                  </div>

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
                        <div className="flex justify-between"><span>Maddi Sorumlu (Zimmet):</span> <strong className="text-blue-800">{sorumluAd}</strong></div>
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
          <div className="bg-white rounded-3xl w-[850px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">🏕️</span>
                <div>
                  <h3 className="font-display font-semibold text-sm">Şantiye Kamp/Barınma Boş &amp; Dolu Kroki Raporu</h3>
                  <p className="text-[10px] text-slate-400">Şantiye Lojman Konteyner Kapasite Şeması ve Sakinleri</p>
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
              <div id="kamp-print-area" className="bg-white border p-6 rounded-2xl shadow-sm space-y-6 text-slate-800 relative">
                
                {/* Kibritci Logo & Başlık */}
                <div className="flex justify-between items-center border-b pb-4">
                  <div className="flex items-center space-x-3">
                    <KibritciLogo size="md" />
                    <div>
                      <h2 className="text-base font-black text-[#2563EB] font-sans tracking-wide">KİBRİTÇİ İNŞAAT A.Ş.</h2>
                      <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-widest mt-0.5">FİİLİ KONAKLAMA VE KOĞUŞ YERLEŞİM KROKİSİ</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-semibold block">Rapor Tarihi: {new Date().toISOString().split('T')[0]}</span>
                    <span className="text-[9px] font-bold text-slate-400 block mt-1">BELGE NO: KAMP-2026-KRK</span>
                  </div>
                </div>

                {/* Sinyal Widgets */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-blue-50 border border-blue-150 rounded-xl p-3">
                    <span className="text-[8px] text-blue-700 font-bold block uppercase tracking-wide">TOPLAM YATAK KAPASİTESİ</span>
                    <span className="text-base font-extrabold text-[#2563EB] block mt-0.5">
                      {kampOdalari.reduce((acc, current) => acc + current.kapasite, 0)} Adet
                    </span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-150 rounded-xl p-3">
                    <span className="text-[8px] text-emerald-700 font-bold block uppercase tracking-wide">ANLIK KALAN PERSONEL</span>
                    <span className="text-base font-extrabold text-emerald-700 block mt-0.5">
                      {kampKayitlari.length} Kadro
                    </span>
                  </div>
                  <div className="bg-amber-50 border border-amber-150 rounded-xl p-3">
                    <span className="text-[8px] text-amber-700 font-bold block uppercase tracking-wide">DOLULUK ORANI</span>
                    <span className="text-base font-extrabold text-amber-700 block mt-0.5">
                      {kampOdalari.reduce((acc, current) => acc + current.kapasite, 0) > 0 
                        ? `% ${Math.round((kampKayitlari.length / kampOdalari.reduce((acc, current) => acc + current.kapasite, 0)) * 100)}` 
                        : "% 0"
                      }
                    </span>
                  </div>
                </div>

                {/* Kat Planı ve Krokiler */}
                <div className="space-y-6">
                  {Array.from(new Set(kampOdalari.map(r => r.kogusNo))).map(floorKey => {
                    const floorRooms = kampOdalari.filter(r => r.kogusNo === floorKey);
                    return (
                      <div key={floorKey} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                        <span className="font-bold text-[10px] text-slate-700 block bg-slate-100 p-1 px-3 rounded border-l-4 border-blue-600 uppercase">
                          📍 {floorKey} Mimari Taslağı
                        </span>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {floorRooms.map(room => {
                            const occupants = kampKayitlari.filter(cr => cr.roomId === room.id || cr.odaId === room.id);
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
                                      {occupants.map(o => (
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
                    );
                  })}
                </div>

                {/* Sorumlu ve İmzalar */}
                <div className="pt-6 border-t border-slate-200">
                  <div className="grid grid-cols-2 gap-4 text-center text-[9px]">
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
                      <span className="text-[8px] font-bold text-blue-700">DİJİTAL SİMÜLE EDİLDİ</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-2 justify-end shrink-0">
              <button 
                onClick={() => {
                  const printContent = document.getElementById('kamp-print-area')?.innerHTML;
                  if (!printContent) return;
                  const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_Kamp_Krokisi</title>
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
                    link.download = `Kibritci_Kamp_Krokisi.html`;
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

            <div className="p-4 border-t bg-slate-50 flex justify-between">
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 rounded-xl transition cursor-pointer flex items-center space-x-1.5"
              >
                <span>💾 Raporu İndir (.txt)</span>
              </button>
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

    </div>
  );
};
export default IdariScreen;
