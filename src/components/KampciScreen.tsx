import React, { useState, useEffect } from 'react';
import { 
  Tent, Plus, Trash2, Camera, Check, RefreshCw, Eye, 
  Search, UserPlus, ClipboardList, Package, Layers, MapPin, Sparkles, CheckCircle, Clock, X, ArrowRight, ShieldCheck, DoorOpen, LogOut
} from 'lucide-react';
import { KampOdasi, KampKaydi, Personel, StokKart } from '../types/erp';
import { db, saveDocument } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';

interface KampciScreenProps {
  kampOdalari: KampOdasi[];
  setKampOdalari: React.Dispatch<React.SetStateAction<KampOdasi[]>>;
  kampKayitlari: KampKaydi[];
  setKampKayitlari: React.Dispatch<React.SetStateAction<KampKaydi[]>>;
  personeller: Personel[];
  stokKartlar?: StokKart[];
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  addNotification?: (mesaj: string) => void;
}

export const KampciScreen: React.FC<KampciScreenProps> = ({
  kampOdalari,
  setKampOdalari,
  kampKayitlari,
  setKampKayitlari,
  personeller,
  stokKartlar = [],
  currentUser,
  onSignOut,
  isStandalone = false,
  addNotification
}) => {
  // Tabs: 'rooms' (Oda & Kat Açma) | 'placement' (Kampa Yerleşim) | 'warehouse' (Depo Sayımı) | 'activities' (Günlük Faaliyetler)
  const [activeSubTab, setActiveSubTab] = useState<'rooms' | 'placement' | 'warehouse' | 'activities'>('placement');
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');

  // ─────────────────────────────────────────────────────────────
  // STATUS / ALERTS STATE
  // ─────────────────────────────────────────────────────────────
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ─────────────────────────────────────────────────────────────
  // 🏕️ 1. ODA & YERLEŞKE OLUŞTURMA STATE
  // ─────────────────────────────────────────────────────────────
  const [yerleskeAdi, setYerleskeAdi] = useState('Merkez Konteyner Kampı');
  const [customYerleskeAdi, setCustomYerleskeAdi] = useState("");
  const [showCustomYerleske, setShowCustomYerleske] = useState(false);
  const [kogusNo, setKogusNo] = useState('A Blok (Zemin Kat)'); // Acts as Floor / Block
  const [customKogusNo, setCustomKogusNo] = useState("");
  const [showCustomKogus, setShowCustomKogus] = useState(false);
  const [odaNo, setOdaNo] = useState('');
  const [kapasite, setKapasite] = useState<number>(4);
  const [firmaTipi, setFirmaTipi] = useState<'ANA_FIRMA' | 'TASERON'>('ANA_FIRMA');
  const [loadingRoom, setLoadingRoom] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 👥 2. YERLEŞİM (CHECK-IN / OUT) STATE
  // ─────────────────────────────────────────────────────────────
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [placementType, setPlacementType] = useState<'DB' | 'MANUAL'>('DB');
  const [selectedPersonelId, setSelectedPersonelId] = useState('');
  const [manualPersonelIsim, setManualPersonelIsim] = useState('');
  const [searchPersonelQuery, setSearchPersonelQuery] = useState('');
  const [firmaType, setFirmaType] = useState<'DB' | 'MANUAL'>('DB');
  const [selectedFirma, setSelectedFirma] = useState('');
  const [manualFirma, setManualFirma] = useState('');
  const [loadingPlacement, setLoadingPlacement] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 📦 3. DEPO SAYIMI (WAREHOUSE AUDIT) STATE
  // ─────────────────────────────────────────────────────────────
  const [searchRoomQuery, setSearchRoomQuery] = useState('');
  const [depoSavimlari, setDepoSayimlari] = useState<any[]>([]);
  const [loadingSayim, setLoadingSayim] = useState(false);
  const [sayimNotlar, setSayimNotlar] = useState('');

  // Fixed core inventory items to count easily
  const initialSayimMiktarlari: Record<string, number> = {
    'Nevresim Takımı': 0,
    'Battaniye': 0,
    'Yastık': 0,
    'Sünger Yatak': 0,
    'Sıvı Sabun (Litre)': 0,
    'Çamaşır Deterjanı (Kg)': 0,
    'Tuvalet Kağıdı (Rulo)': 0,
    'LED Ampul': 0,
  };
  const [sayimMiktarlari, setSayimMiktarlari] = useState<Record<string, number>>(initialSayimMiktarlari);

  // Sync sayimMiktarlari with real stock cards
  useEffect(() => {
    if (stokKartlar && stokKartlar.length > 0) {
      const dynamicMiktarlar: Record<string, number> = {};
      stokKartlar.forEach(item => {
        dynamicMiktarlar[item.urunAdi] = 0;
      });
      setSayimMiktarlari(dynamicMiktarlar);
    }
  }, [stokKartlar]);

  // ─────────────────────────────────────────────────────────────
  // 🧹 4. GÜNLÜK FAALİYETLER STATE
  // ─────────────────────────────────────────────────────────────
  const [gunlukFaaliyetler, setGunlukFaaliyetler] = useState<any[]>([]);
  const [faaliyetTipi, setFaaliyetTipi] = useState<'TEMİZLİK' | 'YEMEK' | 'GÜVENLİK' | 'BAKIM' | 'DİĞER'>('TEMİZLİK');
  const [faaliyetYerleske, setFaaliyetYerleske] = useState('Merkez Konteyner Kampı');
  const [faaliyetAciklama, setFaaliyetAciklama] = useState('');
  const [faaliyetFoto, setFaaliyetFoto] = useState<string | null>(null);
  const [loadingFaaliyet, setLoadingFaaliyet] = useState(false);

  // Real-time Firestore subscriptions for custom collections
  useEffect(() => {
    // 1. Warehouse counts
    const countsColl = collection(db, 'kampDepoSayimlari');
    const unsubCounts = onSnapshot(countsColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort by date desc
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setDepoSayimlari(list);
    });

    // 2. Daily activities
    const actsColl = collection(db, 'kampGunlukFaaliyetleri');
    const unsubActs = onSnapshot(actsColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort by date desc
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setGunlukFaaliyetler(list);
    });

    return () => {
      unsubCounts();
      unsubActs();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 🏕️ ACTIONS: ROOM MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odaNo) {
      showStatus('error', 'Lütfen Oda Numarasını belirtin!');
      return;
    }

    setLoadingRoom(true);
    try {
      const finalYerleskeAdi = showCustomYerleske ? (customYerleskeAdi.trim() || yerleskeAdi) : yerleskeAdi;
      const finalKogusNo = showCustomKogus ? (customKogusNo.trim() || kogusNo) : kogusNo;

      const roomId = `room_${Date.now()}`;
      const newRoom: KampOdasi = {
        id: roomId,
        yerleskeAdi: finalYerleskeAdi,
        kogusNo: finalKogusNo,
        odaNo,
        kapasite: Number(kapasite),
        firmaTipi,
        durum: 'BOŞ'
      };

      await saveDocument('kampOdalari', newRoom);
      if (addNotification) {
        addNotification(`${finalYerleskeAdi} / ${finalKogusNo} - Oda ${odaNo} başarıyla açıldı.`);
      }
      setOdaNo('');
      setCustomYerleskeAdi("");
      setCustomKogusNo("");
      setShowCustomYerleske(false);
      setShowCustomKogus(false);
      showStatus('success', `Oda ${odaNo} başarıyla açıldı.`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Oda oluşturulurken hata oluştu!');
    } finally {
      setLoadingRoom(false);
    }
  };

  const handleDeleteRoom = async (id: string, name: string) => {
    if (!window.confirm(`${name} numaralı odayı silmek istediğinize emin misiniz?`)) return;
    try {
      // Use local state update or deleteDoc directly
      setKampOdalari(prev => prev.filter(r => r.id !== id));
      if (addNotification) {
        addNotification(`${name} nolu oda silindi.`);
      }
      showStatus('success', 'Oda silindi.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Oda silinemedi.');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 👥 ACTIONS: PERSONNEL PLACEMENT
  // ─────────────────────────────────────────────────────────────
  const handlePlacementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId) {
      showStatus('error', 'Lütfen yerleşim yapılacak odayı seçin!');
      return;
    }

    let personelIsim = '';
    let personelId: string | undefined = undefined;

    if (placementType === 'DB') {
      if (!selectedPersonelId) {
        showStatus('error', 'Lütfen veritabanından bir personel seçin!');
        return;
      }
      const matched = personeller.find(p => p.id === selectedPersonelId);
      if (matched) {
        personelIsim = `${matched.ad} ${matched.soyad}`;
        personelId = matched.id;
      }
    } else {
      if (!manualPersonelIsim.trim()) {
        showStatus('error', 'Lütfen personel adını soyadını yazın!');
        return;
      }
      personelIsim = manualPersonelIsim.trim();
    }

    let resolvedFirma = '';
    if (firmaType === 'DB') {
      resolvedFirma = selectedFirma || 'Belirtilmedi';
    } else {
      resolvedFirma = manualFirma.trim() || 'Belirtilmedi';
    }

    // Check capacity limit
    const targetRoom = kampOdalari.find(r => r.id === selectedRoomId);
    if (!targetRoom) {
      showStatus('error', 'Oda bulunamadı!');
      return;
    }

    const currentOccupants = kampKayitlari.filter(
      k => (k.odaId === selectedRoomId || k.roomId === selectedRoomId) && k.durum === 'AKTIF'
    );

    if (currentOccupants.length >= targetRoom.kapasite) {
      showStatus('error', `Bu oda dolu! Kapasite sınırı: ${targetRoom.kapasite} kişi.`);
      return;
    }

    // Check if person already checked in elsewhere
    const alreadyRegistered = kampKayitlari.find(
      k => k.durum === 'AKTIF' && (
        (personelId && k.personelId === personelId) || 
        (!personelId && k.personelIsim.toLowerCase() === personelIsim.toLowerCase())
      )
    );

    if (alreadyRegistered) {
      showStatus('error', `${personelIsim} zaten aktif bir odada yerleşmiş durumda!`);
      return;
    }

    setLoadingPlacement(true);
    try {
      const regId = `reg_${Date.now()}`;
      const newReg: KampKaydi = {
        id: regId,
        personelIsim,
        personelId,
        odaId: selectedRoomId,
        girisTarihi: new Date().toISOString().slice(0, 10),
        durum: 'AKTIF',
        calistigiFirma: resolvedFirma
      };

      // Save registration
      await saveDocument('kampKayitlari', newReg);
      if (addNotification) {
        addNotification(`${personelIsim} (${resolvedFirma}) adlı personel ${targetRoom.odaNo} nolu odaya yerleştirildi.`);
      }

      // Update Room status
      const updatedOccupancyCount = currentOccupants.length + 1;
      let newRoomStatus: 'BOŞ' | 'DOLU' | 'KISMEN DOLU' = 'KISMEN DOLU';
      if (updatedOccupancyCount >= targetRoom.kapasite) {
        newRoomStatus = 'DOLU';
      }

      const updatedRoom: KampOdasi = {
        ...targetRoom,
        durum: newRoomStatus
      };

      await saveDocument('kampOdalari', updatedRoom);

      // Reset
      setSelectedPersonelId('');
      setManualPersonelIsim('');
      setSelectedFirma('');
      setManualFirma('');
      showStatus('success', `${personelIsim} (${resolvedFirma}) başarıyla ${targetRoom.odaNo} no'lu odaya yerleştirildi.`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Yerleşim yapılırken hata oluştu!');
    } finally {
      setLoadingPlacement(false);
    }
  };

  const handleCheckOut = async (reg: KampKaydi) => {
    if (!window.confirm(`${reg.personelIsim} isimli personeli odadan çıkarmak (Check-out) istediğinize emin misiniz?`)) return;

    try {
      // Find room
      const targetRoom = kampOdalari.find(r => r.id === reg.odaId || r.id === (reg as any).roomId);
      
      const updatedReg: KampKaydi = {
        ...reg,
        durum: 'PASIF',
        cikisTarihi: new Date().toISOString().slice(0, 10)
      };

      await saveDocument('kampKayitlari', updatedReg);
      if (addNotification) {
        const roomNo = targetRoom ? targetRoom.odaNo : 'oda';
        addNotification(`${reg.personelIsim} isimli personel ${roomNo} nolu odadan çıkış yaptı.`);
      }

      if (targetRoom) {
        const remainingOccupants = kampKayitlari.filter(
          k => (k.odaId === targetRoom.id || (k as any).roomId === targetRoom.id) && k.durum === 'AKTIF' && k.id !== reg.id
        );

        let newRoomStatus: 'BOŞ' | 'DOLU' | 'KISMEN DOLU' = 'KISMEN DOLU';
        if (remainingOccupants.length === 0) {
          newRoomStatus = 'BOŞ';
        }

        const updatedRoom: KampOdasi = {
          ...targetRoom,
          durum: newRoomStatus
        };

        await saveDocument('kampOdalari', updatedRoom);
      }

      showStatus('success', `${reg.personelIsim} çıkış işlemi tamamlandı.`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Çıkış işlemi başarısız.');
    }
  };

  const handleEvacuateRoom = async (roomId: string) => {
    const targetRoom = kampOdalari.find(r => r.id === roomId);
    if (!targetRoom) return;

    const occupants = kampKayitlari.filter(
      k => (k.odaId === roomId || k.roomId === roomId) && k.durum === 'AKTIF'
    );

    if (occupants.length === 0) {
      showStatus('error', 'Bu oda zaten boş!');
      return;
    }

    if (!window.confirm(`${targetRoom.odaNo} numaralı odadaki TÜM personelleri (${occupants.length} kişi) tahliye etmek istediğinize emin misiniz?`)) return;

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const reg of occupants) {
        const updatedReg: KampKaydi = {
          ...reg,
          durum: 'PASIF',
          cikisTarihi: todayStr
        };
        await saveDocument('kampKayitlari', updatedReg);
      }
      if (addNotification) {
        addNotification(`${targetRoom.odaNo} nolu odadaki tüm personeller (${occupants.length} kişi) tahliye edildi.`);
      }

      const updatedRoom: KampOdasi = {
        ...targetRoom,
        durum: 'BOŞ'
      };
      await saveDocument('kampOdalari', updatedRoom);

      showStatus('success', `${targetRoom.odaNo} numaralı odadaki tüm personeller tahliye edildi.`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Oda tahliye edilirken hata oluştu.');
    }
  };

  const handleSelectRoomForPlacement = (roomId: string) => {
    setSelectedRoomId(roomId);
    setActiveSubTab('placement');
    showStatus('success', 'Oda seçildi. Şimdi personeli seçerek kampa yerleştirebilirsiniz.');
  };

  // ─────────────────────────────────────────────────────────────
  // 📦 ACTIONS: WAREHOUSE AUDIT (DEPO SAYIMI)
  // ─────────────────────────────────────────────────────────────
  const handleQuantityChange = (item: string, val: string) => {
    const num = val === '' ? 0 : Number(val);
    setSayimMiktarlari(prev => ({ ...prev, [item]: num }));
  };

  const handleSaveAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSayim(true);

    try {
      const sayimId = `sayim_${Date.now()}`;
      const list = Object.entries(sayimMiktarlari).map(([urunAdi, miktar]) => ({
        urunAdi,
        miktar,
        birim: urunAdi.includes('Litre') ? 'Litre' : urunAdi.includes('Kg') ? 'Kg' : urunAdi.includes('Rulo') ? 'Rulo' : 'Adet'
      }));

      const auditData = {
        id: sayimId,
        tarih: new Date().toISOString().slice(0, 10),
        sayimYapan: currentUser?.email || 'kampci_amiri',
        kalemler: list,
        durum: 'ONAY BEKLİYOR',
        onaylayanIdariIsler: null,
        onaylayanMuhasebe: null,
        notlar: sayimNotlar || 'Aylık rutin kamp amirliği sayımı.'
      };

      await saveDocument('kampDepoSayimlari', auditData);
      if (addNotification) {
        addNotification(`Yeni kamp depo sayım raporu (${auditData.tarih}) oluşturuldu.`);
      }
      
      // Reset
      setSayimMiktarlari(initialSayimMiktarlari);
      setSayimNotlar('');
      showStatus('success', 'Kamp deposu sayımı kaydedildi ve İdari İşler & Muhasebe onay havuzuna gönderildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Depo sayımı kaydedilemedi.');
    } finally {
      setLoadingSayim(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🧹 ACTIONS: DAILY ROUTINE ACTIVITIES (GÜNLÜK FAALİYET)
  // ─────────────────────────────────────────────────────────────
  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faaliyetAciklama.trim()) {
      showStatus('error', 'Lütfen faaliyet açıklamasını doldurun!');
      return;
    }

    setLoadingFaaliyet(true);
    try {
      const actId = `act_${Date.now()}`;
      const actData = {
        id: actId,
        tarih: new Date().toISOString().slice(0, 10),
        kaydeden: currentUser?.email || 'kamp_sorumlusu',
        faaliyetTipi,
        yerleskeAdi: faaliyetYerleske,
        aciklama: faaliyetAciklama.trim(),
        fotoUrl: faaliyetFoto || null,
        durum: 'ONAY BEKLİYOR',
        onaylayanIdariIsler: null,
        onaylayanMuhasebe: null
      };

      await saveDocument('kampGunlukFaaliyetleri', actData);
      if (addNotification) {
        addNotification(`Kamp günlük faaliyet raporu (${faaliyetTipi}) sisteme girildi.`);
      }

      // Reset
      setFaaliyetAciklama('');
      setFaaliyetFoto(null);
      showStatus('success', 'Günlük faaliyet başarıyla kaydedildi, Onay Havuzuna iletildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Günlük faaliyet kaydedilirken hata oluştu.');
    } finally {
      setLoadingFaaliyet(false);
    }
  };

  // Filtered personnel list for DB selection
  const filteredPersonel = personeller.filter(p => {
    const statusLower = String(p.durum || '').toLowerCase();
    const isPasif = statusLower === 'pasif' || p.durum === false || statusLower === 'false';
    if (isPasif) return false;
    const nameStr = `${p.ad || ''} ${p.soyad || ''}`.toLowerCase();
    const queryStr = searchPersonelQuery.toLowerCase();
    return nameStr.includes(queryStr) || (p.gorev || '').toLowerCase().includes(queryStr);
  });

  const content = (
    <>
      
      {/* ⛺ Header Block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-blue-600/10 rounded-lg text-blue-500">
              <Tent size={20} />
            </span>
            <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">Lojman &amp; Kamp İşlemleri</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-800 mt-1">⛺ KAMP AMİRLİĞİ MOBİL PANELİ</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Oda açılışı, personel yerleşimleri, depo sayımları ve günlük kamp faaliyet raporları</p>
        </div>

        <div className="flex items-center space-x-2.5">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-right">
            <span className="text-[8px] text-slate-500 block font-bold uppercase">Giriş Yapan Yetkili</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">{currentUser?.email || 'kampci@kibritci.com'}</span>
          </div>
          {onSignOut && (
            <button 
              onClick={onSignOut}
              className="p-2.5 bg-rose-650/10 border border-rose-550/20 text-rose-400 hover:bg-rose-550/20 rounded-xl transition cursor-pointer"
              title="Çıkış Yap"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 🔔 Real-time status toast inside screen */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-center space-x-3 shadow-lg max-w-xl animate-bounce ${
          statusMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <CheckCircle size={16} />
          <span className="text-xs font-bold">{statusMessage.text}</span>
        </div>
      )}

      {/* 🧭 Panel Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveSubTab('placement')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'placement' 
              ? 'bg-blue-650 border-blue-600 text-white shadow-md shadow-blue-500/10' 
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <UserPlus size={14} />
          <span>👤 Kampa Personel Yerleşim</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rooms')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'rooms' 
              ? 'bg-blue-650 border-blue-600 text-white shadow-md shadow-blue-500/10' 
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Layers size={14} />
          <span>🏢 Oda &amp; Kat Açma</span>
        </button>

        <button
          onClick={() => setActiveSubTab('warehouse')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'warehouse' 
              ? 'bg-blue-650 border-blue-600 text-white shadow-md shadow-blue-500/10' 
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Package size={14} />
          <span>📦 Depo &amp; Stok Sayımı</span>
        </button>

        <button
          onClick={() => setActiveSubTab('activities')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'activities' 
              ? 'bg-blue-650 border-blue-600 text-white shadow-md shadow-blue-500/10' 
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ClipboardList size={14} />
          <span>🧹 Günlük Faaliyetler</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          🏕️ TAB 1: USER PLACEMENT (CHECK-IN)
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'placement' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Check-In Form (Left Panel) */}
          <div className="lg:col-span-1 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Lojmana Personel Yerleştir</span>
              <h3 className="font-bold text-sm text-white mt-0.5">🔑 Check-In Giriş İşlemi</h3>
            </div>

            <form onSubmit={handlePlacementSubmit} className="space-y-4">
              {/* Target Room Selection */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Yerleşim Yapılacak Oda *</label>
                <select
                  required
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                >
                  <option value="">-- Oda Seçiniz --</option>
                  {kampOdalari.map(r => {
                    const currentCount = kampKayitlari.filter(k => (k.odaId === r.id || k.roomId === r.id) && k.durum === 'AKTIF').length;
                    return (
                      <option key={r.id} value={r.id}>
                        {r.yerleskeAdi} - {r.kogusNo} - Oda: {r.odaNo} ({currentCount}/{r.kapasite} Yatak)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Source Type Toggle */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Giriş Türü</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPlacementType('DB')}
                    className={`py-1.5 rounded-lg text-[10px] font-bold text-center transition ${
                      placementType === 'DB' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    Kayıtlı Personel
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlacementType('MANUAL')}
                    className={`py-1.5 rounded-lg text-[10px] font-bold text-center transition ${
                      placementType === 'MANUAL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    Elle Giriş (Misafir/Taşeron)
                  </button>
                </div>
              </div>

              {/* STAGE 1: PERSONEL SEÇ VEYA İSİM GİR */}
              <div className="border-t border-slate-850 pt-3 space-y-3">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">ADIM 1: Personel Bilgisi</span>
                
                {placementType === 'DB' ? (
                  <div className="space-y-3 animate-in fade-in duration-100">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Personel Filtrele / Ara</label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Personel adı veya görevi..."
                          value={searchPersonelQuery}
                          onChange={(e) => setSearchPersonelQuery(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Kayıtlı Personel Listesinden Seçin *</label>
                      <select
                        required={placementType === 'DB'}
                        value={selectedPersonelId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setSelectedPersonelId(pid);
                          const matched = personeller.find(p => p.id === pid);
                          if (matched) {
                            if (matched.calistigiFirma) {
                              setFirmaType('MANUAL');
                              setManualFirma(matched.calistigiFirma);
                            } else if (matched.firma) {
                              setFirmaType('MANUAL');
                              setManualFirma(matched.firma);
                            }
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                      >
                        <option value="">-- Personel Seçin --</option>
                        {filteredPersonel.slice(0, 30).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.ad} {p.soyad} ({p.gorev})
                          </option>
                        ))}
                      </select>
                      {filteredPersonel.length > 30 && (
                        <span className="text-[9px] text-slate-500 italic block mt-1">+ {filteredPersonel.length - 30} personel daha filtrelendi. Kelime arayarak daraltın.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 animate-in fade-in duration-100">
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Personel Adı Soyadı *</label>
                    <input
                      type="text"
                      required={placementType === 'MANUAL'}
                      placeholder="Örn: Ahmet Yılmaz"
                      value={manualPersonelIsim}
                      onChange={(e) => setManualPersonelIsim(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none"
                    />
                  </div>
                )}
              </div>

              {/* STAGE 2: FİRMA SEÇ VEYA İSMİNİ YAZ */}
              <div className="border-t border-slate-850 pt-3 space-y-3">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">ADIM 2: Firma Bilgisi</span>
                
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setFirmaType('DB')}
                    className={`py-1 rounded-md text-[9px] font-bold text-center transition ${
                      firmaType === 'DB' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    Kayıtlı Firmalar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFirmaType('MANUAL')}
                    className={`py-1 rounded-md text-[9px] font-bold text-center transition ${
                      firmaType === 'MANUAL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    Yeni Firma Yaz
                  </button>
                </div>

                {firmaType === 'DB' ? (
                  <div className="space-y-1.5 animate-in fade-in duration-100">
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Kayıtlı Firmalardan Seçin *</label>
                    <select
                      required={firmaType === 'DB'}
                      value={selectedFirma}
                      onChange={(e) => setSelectedFirma(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                    >
                      <option value="">-- Firma Seçin --</option>
                      <option value="Özdemir Hafriyat A.Ş.">Özdemir Hafriyat A.Ş.</option>
                      <option value="Yıldız İnşaat ve Altyapı">Yıldız İnşaat ve Altyapı</option>
                      <option value="Aras Elektrik Mekanik">Aras Elektrik Mekanik</option>
                      <option value="Merkez Beton A.Ş.">Merkez Beton A.Ş.</option>
                      <option value="Doğu Mühendislik Grubu">Doğu Mühendislik Grubu</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5 animate-in fade-in duration-100">
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Firma Adını Yazın *</label>
                    <input
                      type="text"
                      required={firmaType === 'MANUAL'}
                      placeholder="Örn: Özdemir Hafriyat Ltd. Şti."
                      value={manualFirma}
                      onChange={(e) => setManualFirma(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loadingPlacement}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/40 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/10"
              >
                {loadingPlacement ? <RefreshCw size={13} className="animate-spin" /> : <UserPlus size={14} />}
                <span>Check-In Yerleşimini Kaydet</span>
              </button>
            </form>
          </div>

          {/* Rooms and Occupants Directory (Right Panel - taking 2 cols) */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-200 pb-3 gap-2">
              <div>
                <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Mevcut Kamp Odaları &amp; Doluluk Durumu</span>
                <h3 className="font-bold text-sm text-white mt-0.5">🏡 Lojman Odaları Listesi</h3>
              </div>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Blok veya oda ara..."
                  value={searchRoomQuery}
                  onChange={(e) => setSearchRoomQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-[10px] text-white pl-7 pr-2.5 py-1.5 rounded-lg outline-none w-44"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kampOdalari.filter(room => {
                const q = searchRoomQuery.toLowerCase();
                return (
                  (room.yerleskeAdi || '').toLowerCase().includes(q) ||
                  (room.kogusNo || '').toLowerCase().includes(q) ||
                  (room.odaNo || '').toLowerCase().includes(q)
                );
              }).map(room => {
                const occupants = kampKayitlari.filter(
                  k => (k.odaId === room.id || k.roomId === room.id) && k.durum === 'AKTIF'
                );

                return (
                  <div key={room.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3">
                    <div className="space-y-2 flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-[10px] text-slate-500 block">{room.yerleskeAdi}</span>
                            <span className="font-black text-xs text-white block mt-0.5">{room.kogusNo} / Oda {room.odaNo}</span>
                          </div>
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${
                            room.durum === 'BOŞ' 
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                              : room.durum === 'DOLU' 
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            {room.durum || 'BOŞ'}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-slate-200/40 space-y-1.5">
                          <div className="flex justify-between items-center text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                            <span>Kalan Personeller</span>
                            <span>{occupants.length} / {room.kapasite} Yatak</span>
                          </div>

                          {occupants.length === 0 ? (
                            <p className="text-[10px] text-slate-500 italic">Odada kalan kimse bulunmuyor.</p>
                          ) : (
                            <div className="space-y-1">
                              {occupants.map(occ => (
                                <div key={occ.id} className="flex justify-between items-center bg-white p-1.5 rounded-lg border border-slate-850">
                                  <div className="flex items-center space-x-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                    <span className="text-[10px] font-bold text-slate-700">{occ.personelIsim}</span>
                                  </div>
                                  <button
                                    onClick={() => handleCheckOut(occ)}
                                    className="text-[9px] font-bold text-rose-400 hover:text-rose-350 cursor-pointer p-0.5 hover:bg-rose-500/10 rounded transition"
                                    title="Odadan Çıkar"
                                  >
                                    Çıkış Yap
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 🚀 QUICK ACTIONS FOR ROOMS */}
                      <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2 mt-auto">
                        <button
                          onClick={() => handleSelectRoomForPlacement(room.id)}
                          className="flex-grow bg-blue-600/15 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 hover:border-blue-600 rounded-lg py-1.5 text-[9px] font-black uppercase tracking-wider cursor-pointer transition text-center"
                        >
                          Odaya Yerleştir
                        </button>
                        {occupants.length > 0 && (
                          <button
                            onClick={() => handleEvacuateRoom(room.id)}
                            className="bg-rose-500/15 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 hover:border-rose-600 rounded-lg py-1.5 px-2.5 text-[9px] font-black uppercase tracking-wider cursor-pointer transition text-center"
                          >
                            Tahliye Et
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🏕️ TAB 2: ROOM CREATOR
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'rooms' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Room Form */}
          <div className="lg:col-span-1 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Yeni Kamp Lojman Odası Ekle</span>
              <h3 className="font-bold text-sm text-white mt-0.5">🏢 Oda / Koğuş Tanımla</h3>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Yerleşke Adı *</label>
                <select
                  required
                  value={yerleskeAdi}
                  onChange={(e) => {
                    const val = e.target.value;
                    setYerleskeAdi(val);
                    if (val === 'CUSTOM') {
                      setShowCustomYerleske(true);
                    } else {
                      setShowCustomYerleske(false);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                >
                  <option value="Merkez Konteyner Kampı">Merkez Konteyner Kampı</option>
                  <option value="Kuzey Lojman Sahası">Kuzey Lojman Sahası</option>
                  <option value="Güney Teknik Kampı">Güney Teknik Kampı</option>
                  <option value="CUSTOM">➕ Yeni Yerleşke Ekle...</option>
                </select>
                {showCustomYerleske && (
                  <input
                    type="text"
                    required
                    placeholder="Yeni Yerleşke Adını Yazınız"
                    value={customYerleskeAdi}
                    onChange={(e) => setCustomYerleskeAdi(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none mt-1.5 animate-in slide-in-from-top-1 duration-150"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Kat / Blok Tanımı *</label>
                <select
                  required
                  value={kogusNo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setKogusNo(val);
                    if (val === 'CUSTOM') {
                      setShowCustomKogus(true);
                    } else {
                      setShowCustomKogus(false);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                >
                  <option value="A Blok (Zemin Kat)">A Blok (Zemin Kat)</option>
                  <option value="A Blok (1. Kat)">A Blok (1. Kat)</option>
                  <option value="A Blok (2. Kat)">A Blok (2. Kat)</option>
                  <option value="B Blok (Zemin Kat)">B Blok (Zemin Kat)</option>
                  <option value="B Blok (1. Kat)">B Blok (1. Kat)</option>
                  <option value="C Blok (Lojman)">C Blok (Lojman)</option>
                  <option value="CUSTOM">➕ Yeni Kat / Blok Ekle...</option>
                </select>
                {showCustomKogus && (
                  <input
                    type="text"
                    required
                    placeholder="Yeni Kat / Blok Tanımını Yazınız"
                    value={customKogusNo}
                    onChange={(e) => setCustomKogusNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none mt-1.5 animate-in slide-in-from-top-1 duration-150"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Oda Numarası *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 104"
                  value={odaNo}
                  onChange={(e) => setOdaNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Kapasite (Yatak Sayısı) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={20}
                  value={kapasite}
                  onChange={(e) => setKapasite(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Atanan Firma Türü *</label>
                <select
                  required
                  value={firmaTipi}
                  onChange={(e) => setFirmaTipi(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                >
                  <option value="ANA_FIRMA">Kibritçi İnşaat (Ana Firma)</option>
                  <option value="TASERON">Alt Yüklenici / Taşeron</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loadingRoom}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/10"
              >
                {loadingRoom ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={14} />}
                <span>Odayı Aç &amp; Kaydet</span>
              </button>
            </form>
          </div>

          {/* Rooms Table List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Şantiye Kamp Altyapısı</span>
              <h3 className="font-bold text-sm text-white mt-0.5">📋 Tanımlı Odaların Listesi</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-extrabold text-[10px] uppercase tracking-wider">
                    <th className="pb-3">Yerleşke</th>
                    <th className="pb-3">Blok / Kat</th>
                    <th className="pb-3">Oda No</th>
                    <th className="pb-3">Kapasite</th>
                    <th className="pb-3">Firma Tipi</th>
                    <th className="pb-3 text-right">Eylemler</th>
                  </tr>
                </thead>
                <tbody>
                  {kampOdalari.map(r => (
                    <tr key={r.id} className="border-b border-slate-200/50 hover:bg-slate-900/30 transition">
                      <td className="py-3 font-mono text-slate-500">{r.yerleskeAdi}</td>
                      <td className="py-3 font-bold text-white">{r.kogusNo}</td>
                      <td className="py-3 font-bold text-amber-400">{r.odaNo}</td>
                      <td className="py-3 font-bold font-mono">{r.kapasite} Yatak</td>
                      <td className="py-3 text-[10px]">
                        <span className={`px-2 py-0.5 rounded font-bold border ${
                          r.firmaTipi === 'ANA_FIRMA' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                        }`}>
                          {r.firmaTipi === 'ANA_FIRMA' ? 'Ana Firma' : 'Taşeron'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeleteRoom(r.id, r.odaNo)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {kampOdalari.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500 italic">Kayıtlı kamp odası bulunmuyor.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          📦 TAB 3: WAREHOUSE AUDIT (DEPO SAYIMI)
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'warehouse' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New Audit Form */}
          <div className="lg:col-span-1 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Aylık / Haftalık Kamp Depo Sayımı</span>
              <h3 className="font-bold text-sm text-white mt-0.5">📦 Yeni Depo Sayımı Gir</h3>
            </div>

            <form onSubmit={handleSaveAudit} className="space-y-4">
              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-900/40">
                <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Depo Malzeme Kalemleri Sayım Listesi</span>
                
                <div className="space-y-3 divide-y divide-slate-800/40">
                  {Object.entries(sayimMiktarlari).map(([item, val]) => (
                    <div key={item} className="flex justify-between items-center pt-2.5 first:pt-0">
                      <span className="text-[11px] font-bold text-slate-700">{item}</span>
                      <input
                        type="number"
                        min={0}
                        required
                        value={val}
                        onChange={(e) => handleQuantityChange(item, e.target.value)}
                        className="w-20 bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-right text-emerald-400 font-bold font-mono outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Sayım Notları / Açıklama</label>
                <textarea
                  placeholder="Sayım hakkında eklemek istediğiniz bir durum var mı?"
                  value={sayimNotlar}
                  onChange={(e) => setSayimNotlar(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-2.5 rounded-xl outline-none h-16 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loadingSayim}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/10"
              >
                {loadingSayim ? <RefreshCw size={13} className="animate-spin" /> : <ClipboardList size={14} />}
                <span>Sayımı Kaydet &amp; Onaya Gönder</span>
              </button>
            </form>
          </div>

          {/* Past Audits List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Kayıtlı Depo Sayım Arşivi</span>
              <h3 className="font-bold text-sm text-white mt-0.5">📋 Sayım Kayıtları ve Onay Durumları</h3>
            </div>

            <div className="space-y-4">
              {depoSavimlari.map(sayim => {
                const approvedByBoth = sayim.onaylayanIdariIsler && sayim.onaylayanMuhasebe;
                const rejected = sayim.durum === 'REDDEDİLDİ';

                return (
                  <div key={sayim.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 hover:border-slate-700 transition">
                    <div className="flex justify-between items-start border-b border-slate-200/60 pb-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-mono font-bold block">{sayim.tarih}</span>
                        <span className="text-xs font-bold text-white block mt-0.5">Sorumlu: {sayim.sayimYapan}</span>
                      </div>
                      
                      <div className="text-right">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border block ${
                          approvedByBoth 
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                            : rejected 
                              ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                              : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                        }`}>
                          {approvedByBoth 
                            ? 'ONAYLANDI' 
                            : rejected 
                              ? 'REDDEDİLDİ' 
                              : 'ONAY BEKLİYOR'}
                        </span>
                        
                        <div className="flex gap-1.5 mt-1.5">
                          <span className={`text-[8px] font-mono font-semibold px-1 rounded ${sayim.onaylayanIdariIsler ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white text-slate-600'}`}>
                            İdari: {sayim.onaylayanIdariIsler ? '✓' : '⌛'}
                          </span>
                          <span className={`text-[8px] font-mono font-semibold px-1 rounded ${sayim.onaylayanMuhasebe ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white text-slate-600'}`}>
                            Muhasebe: {sayim.onaylayanMuhasebe ? '✓' : '⌛'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stock Counts Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                      {sayim.kalemler?.map((k: any, idx: number) => (
                        <div key={idx} className="bg-white p-2 rounded-lg border border-slate-850/60 text-center">
                          <span className="text-[9px] text-slate-500 block truncate">{k.urunAdi}</span>
                          <span className="font-black text-xs text-amber-400 block mt-0.5 font-mono">{k.miktar} {k.birim}</span>
                        </div>
                      ))}
                    </div>

                    {sayim.notlar && (
                      <p className="text-[10px] text-slate-500 italic bg-white/40 p-2 rounded-lg border border-slate-850/30">
                        {sayim.notlar}
                      </p>
                    )}
                  </div>
                );
              })}

              {depoSavimlari.length === 0 && (
                <div className="text-center p-12 text-slate-500 italic">Depo sayım kaydı bulunmamaktadır.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🧹 TAB 4: DAILY ROUTINES / ACTIVITIES
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'activities' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New Activity Form */}
          <div className="lg:col-span-1 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Günlük Rutin &amp; İş Bildirimi</span>
              <h3 className="font-bold text-sm text-white mt-0.5">🧹 Yeni Faaliyet Raporu</h3>
            </div>

            <form onSubmit={handleSaveActivity} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Faaliyet Kategorisi *</label>
                <select
                  required
                  value={faaliyetTipi}
                  onChange={(e) => setFaaliyetTipi(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                >
                  <option value="TEMİZLİK">🧹 TEMİZLİK (Koğuş, Banyo, Çamaşır)</option>
                  <option value="YEMEK">🍲 YEMEK (Yemekhane, Aşevi)</option>
                  <option value="GÜVENLİK">👮 GÜVENLİK (Kamp kapısı, Nöbet)</option>
                  <option value="BAKIM">🔧 BAKIM (Tesisat, Elektrik, Arıza)</option>
                  <option value="DİĞER">📝 DİĞER (Sosyal alanlar, Genel)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Kamp Yerleşkesi *</label>
                <select
                  required
                  value={faaliyetYerleske}
                  onChange={(e) => setFaaliyetYerleske(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-white rounded-xl p-3 outline-none"
                >
                  <option value="Merkez Konteyner Kampı">Merkez Konteyner Kampı</option>
                  <option value="Kuzey Lojman Sahası">Kuzey Lojman Sahası</option>
                  <option value="Güney Teknik Kampı">Güney Teknik Kampı</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Yapılan İşin Detayı *</label>
                <textarea
                  required
                  placeholder="Yapılan rutin işlerin ayrıntısını yazınız..."
                  value={faaliyetAciklama}
                  onChange={(e) => setFaaliyetAciklama(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-white p-3 rounded-xl outline-none h-24 resize-none"
                />
              </div>

              {/* Photo Upload Attachment */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[9px] font-extrabold text-slate-500 uppercase block tracking-wider">📷 Çalışma Görseli / Fotoğraf Ekle</span>
                <div className="flex items-center gap-3">
                  <label className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-300 font-bold text-[10px] py-2 px-4 rounded-lg flex items-center justify-center space-x-2 cursor-pointer transition shrink-0">
                    <Camera size={13} className="text-amber-500" />
                    <span>{faaliyetFoto ? '✓ Görsel Seçildi' : 'Fotoğraf Çek / Seç'}</span>
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const r = new FileReader();
                          r.onload = async (ev) => {
                            if (ev.target?.result) {
                              const rawBase64 = ev.target.result as string;
                              const compressed = await compressImage(rawBase64);
                              setFaaliyetFoto(compressed);
                            }
                          };
                          r.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {faaliyetFoto && (
                    <button
                      type="button"
                      onClick={() => setFaaliyetFoto(null)}
                      className="text-[9px] font-bold text-rose-400 hover:underline cursor-pointer"
                    >
                      Kaldır
                    </button>
                  )}
                </div>

                {faaliyetFoto && (
                  <div className="mt-2 border border-slate-850 rounded bg-white p-1">
                    <img src={faaliyetFoto} alt="Activity Preview" className="max-h-24 mx-auto object-contain rounded" />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loadingFaaliyet}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/10"
              >
                {loadingFaaliyet ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                <span>Faaliyeti Kaydet &amp; Onaya Gönder</span>
              </button>
            </form>
          </div>

          {/* Activity List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Günlük Kamp Faaliyetleri</span>
              <h3 className="font-bold text-sm text-white mt-0.5">📋 Son Raporlanan Aktiviteler</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gunlukFaaliyetler.map(act => {
                const approvedByBoth = act.onaylayanIdariIsler && act.onaylayanMuhasebe;
                const rejected = act.durum === 'REDDEDİLDİ';

                return (
                  <div key={act.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3 hover:border-slate-700 transition">
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                            act.faaliyetTipi === 'TEMİZLİK' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                            act.faaliyetTipi === 'YEMEK' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                            act.faaliyetTipi === 'GÜVENLİK' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            act.faaliyetTipi === 'BAKIM' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                            'bg-slate-500/10 border-slate-500/20 text-slate-500'
                          }`}>
                            {act.faaliyetTipi}
                          </span>
                          <span className="font-mono text-[9px] text-slate-500 font-bold block mt-1">{act.tarih}</span>
                        </div>

                        <div className="text-right">
                          <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${
                            approvedByBoth 
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                              : rejected 
                                ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                                : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                          }`}>
                            {approvedByBoth ? 'ONAYLANDI' : rejected ? 'REDDEDİLDİ' : 'ONAY BEKLİYOR'}
                          </span>
                          
                          <div className="flex gap-1 justify-end mt-1">
                            <span className={`text-[7px] font-mono px-1 rounded ${act.onaylayanIdariIsler ? 'bg-emerald-500/25 text-emerald-400' : 'bg-white text-slate-650'}`}>
                              İd: {act.onaylayanIdariIsler ? '✓' : '⌛'}
                            </span>
                            <span className={`text-[7px] font-mono px-1 rounded ${act.onaylayanMuhasebe ? 'bg-emerald-500/25 text-emerald-400' : 'bg-white text-slate-650'}`}>
                              Mu: {act.onaylayanMuhasebe ? '✓' : '⌛'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 mt-1 line-clamp-3 leading-relaxed">
                        {act.aciklama}
                      </p>

                      {act.fotoUrl && (
                        <div className="border border-slate-200 rounded bg-white p-1 max-h-24 overflow-hidden flex items-center justify-center">
                          <img src={act.fotoUrl} alt="Activity" className="max-h-20 object-contain rounded" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {gunlukFaaliyetler.length === 0 && (
                <div className="col-span-2 text-center p-12 text-slate-500 italic">Günlük faaliyet raporu bulunmamaktadır.</div>
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );

  if (isStandalone) {
    return (
      <div className="w-full h-full overflow-y-auto bg-slate-50 text-slate-800 font-sans p-4 space-y-6">
        {content}
      </div>
    );
  }

  if (!isStandalone && viewMode === 'mobile') {
    return (
      <div className="flex-grow min-h-full bg-white flex justify-center py-6 px-4">
        <div className="w-full max-w-[420px] h-[720px] max-h-[82vh] bg-slate-50 rounded-[3rem] border-[10px] border-slate-200 shadow-2xl overflow-hidden flex flex-col relative">
          {/* Notch / Dynamic Island */}
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-800 mr-2"></div>
            <div className="w-10 h-0.5 bg-slate-50 rounded"></div>
          </div>
          <div className="flex-grow overflow-y-auto pt-6 pb-4 flex flex-col">
            {/* View switcher control at the top of phone */}
            <div className="px-5 py-3 border-b border-slate-200/60 flex justify-between items-center bg-white/80 sticky top-0 z-40 backdrop-blur-md">
              <span className="text-[10px] font-black tracking-wider text-slate-500 uppercase">📱 Mobil Sürüm</span>
              <button 
                onClick={() => setViewMode('web')}
                className="text-[9px] bg-blue-600/20 border border-blue-500/30 text-blue-400 px-2.5 py-1 rounded-lg font-bold hover:bg-blue-500/30 transition cursor-pointer"
              >
                💻 Web Sürüme Geç
              </button>
            </div>
            <div className="flex-grow p-4 space-y-5">
              {content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow h-full overflow-y-auto bg-slate-50 text-slate-800 font-sans p-4 md:p-6 space-y-6">
      {/* View switcher control at the top of Web view */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3.5 shadow-md">
        <div className="flex items-center space-x-2">
          <span className="p-1.5 bg-blue-600/10 rounded-lg text-blue-500">
            <Tent size={18} />
          </span>
          <span className="text-xs font-bold text-slate-600">Görünüm Sürümü:</span>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md uppercase font-black">💻 Web Sürüm</span>
        </div>
        <button
          onClick={() => setViewMode('mobile')}
          className="text-xs bg-blue-650 hover:bg-blue-600 text-white font-bold px-3 py-1.5 rounded-xl cursor-pointer transition shadow-md shadow-blue-500/10"
        >
          📱 Mobil Sürüm Test Et
        </button>
      </div>
      {content}
    </div>
  );
};
