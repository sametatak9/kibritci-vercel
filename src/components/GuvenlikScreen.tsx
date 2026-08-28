import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, FileText, Users, Truck, UserCheck, Search, PlusCircle, Trash2, 
  Check, X, FileUp, Camera, Printer, Clock, AlertTriangle, Key, Download, ArrowRight, RefreshCw, Barcode,
  Archive, Calendar, Lock
} from 'lucide-react';
import { Personel, Irsaliye, IrsaliyeItem, Fatura } from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { collection, doc, setDoc, onSnapshot, addDoc, getDocs, deleteDoc } from 'firebase/firestore';

interface GuvenlikScreenProps {
  personeller: Personel[];
  currentUser: any;
  onSignOut?: () => void;
  userYetki?: string;
  isStandalone?: boolean;
  addNotification?: (mesaj: string) => void;
}

export const GuvenlikScreen: React.FC<GuvenlikScreenProps> = ({
  personeller,
  currentUser,
  onSignOut,
  userYetki,
  isStandalone = false,
  addNotification
}) => {
  const [activeTab, setActiveTab] = useState<'irsaliye' | 'personel' | 'arac' | 'ziyaretci' | 'nobet_arsivi'>('irsaliye');
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  
  // ─────────────────────────────────────────────────────────────
  // 📄 1. İRSALİYE & EVRAK GİRİŞ STATE
  // ─────────────────────────────────────────────────────────────
  const [evrakTuru, setEvrakTuru] = useState<'İRSALİYE' | 'FATURA' | 'MAKBUZ' | 'GENEL_EVRAK'>('İRSALİYE');
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [firma, setFirma] = useState('');
  const [kalemUrunAdi, setKalemUrunAdi] = useState('');
  const [kalemMiktar, setKalemMiktar] = useState<number | ''>('');
  const [kalemBirim, setKalemBirim] = useState('Adet');
  const [eklenenKalemler, setEklenenKalemler] = useState<any[]>([]);
  const [irsaliyeFoto, setIrsaliyeFoto] = useState<string | null>(null);
  const [loadingIrsaliye, setLoadingIrsaliye] = useState(false);
  const [gelenEvraklar, setGelenEvraklar] = useState<any[]>([]);

  // Yapay Zeka (AI) Evrak Okuyucu State'leri
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [aiParseSuccess, setAiParseSuccess] = useState<string | null>(null);

  const processSecurityDocumentAi = (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAiParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında evrak yükleyiniz.");
      return;
    }

    setIsAiParsing(true);
    setAiParseError(null);
    setAiParseSuccess(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawBase64 = reader.result as string;
        // Keep the raw image as irsaliyeFoto base64 so they can see/submit it
        setIrsaliyeFoto(rawBase64);

        const base64Data = rawBase64.split(',')[1];
        
        // Use parse-fatura or parse-irsaliye based on selected type
        const endpoint = (evrakTuru === 'FATURA') ? '/api/parse-fatura' : '/api/parse-irsaliye';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: file.type
          })
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "Evrak yapay zeka tarafından çözümlenirken bir sorun oluştu.");
        }

        const parsed = resData.data;

        // Populate fields
        setIrsaliyeNo(parsed.irsaliyeNo || parsed.faturaNo || "");
        if (parsed.firma) setFirma(parsed.firma);
        
        if (parsed.kalemler && parsed.kalemler.length > 0) {
          const formattedItems = parsed.kalemler.map((x: any, idx: number) => ({
            id: `item_${Date.now()}_${idx}`,
            urunAdi: x.urunAdi || "Tanımsız Malzeme",
            miktar: Number(x.miktar) || 0,
            birim: x.birim || "ADET"
          }));
          setEklenenKalemler(formattedItems);
        }

        setAiParseSuccess(`Yapay Zeka Çözümlemesi Başarılı!\nNo: ${parsed.irsaliyeNo || parsed.faturaNo || ''} ve Firma: ${parsed.firma || ''} bilgileri ile ${parsed.kalemler?.length || 0} adet malzeme kalemi otomatik dolduruldu.`);
      } catch (err: any) {
        console.error("Security Document AI parsing error:", err);
        setAiParseError(err.message || "Belge çözümlenemedi. Lütfen geçerli bir evrak yükleyin.");
      } finally {
        setIsAiParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ─────────────────────────────────────────────────────────────
  // 👥 2. PERSONEL GİRİŞ-ÇIKIŞ STATE & LISTS
  // ─────────────────────────────────────────────────────────────
  const [personelSearch, setPersonelSearch] = useState('');
  
  const filteredPersonel = (personeller || []).filter(p => {
    const q = personelSearch.toLowerCase();
    return (
      (p.ad || '').toLowerCase().includes(q) ||
      (p.soyad || '').toLowerCase().includes(q) ||
      (p.tcNo || '').includes(q) ||
      (p.gorev || '').toLowerCase().includes(q)
    );
  });

  const [personelLoglar, setPersonelLoglar] = useState<any[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 🚛 3. ARAÇ GİRİŞ-ÇIKIŞ STATE & LISTS
  // ─────────────────────────────────────────────────────────────
  const [plaka, setPlaka] = useState('');
  const [aracTipi, setAracTipi] = useState('Hazır Beton Mikseri');
  const [aracFirma, setAracFirma] = useState('');
  const [yukDurumu, setYukDurumu] = useState('Dolu');
  const [surucuAdi, setSurucuAdi] = useState('');
  const [aracAciklama, setAracAciklama] = useState('');
  const [iceridekiAraclar, setIceridekiAraclar] = useState<any[]>([]);
  const [aracGecmisLoglar, setAracGecmisLoglar] = useState<any[]>([]);

  // ─────────────────────────────────────────────────────────────
  // 🎫 4. ZİYARETÇİ STATE & BADGE
  // ─────────────────────────────────────────────────────────────
  const [ziyaretciAd, setZiyaretciAd] = useState('');
  const [ziyaretciTc, setZiyaretciTc] = useState('');
  const [ziyaretciFirma, setZiyaretciFirma] = useState('');
  const [ziyaretSebebi, setZiyaretSebebi] = useState('');
  const [ziyaretEdilen, setZiyaretEdilen] = useState('');
  const [aktifZiyaretciler, setAktifZiyaretciler] = useState<any[]>([]);
  const [ziyaretciGecmisLoglar, setZiyaretciGecmisLoglar] = useState<any[]>([]);
  const [activeBadgeGuest, setActiveBadgeGuest] = useState<any | null>(null);

  // ─────────────────────────────────────────────────────────────
  // 🗃️ 5. NÖBET ARŞİVİ STATE
  // ─────────────────────────────────────────────────────────────
  const [nobetArsivleri, setNobetArsivleri] = useState<any[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<any | null>(null);
  const [nobetSearch, setNobetSearch] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  // ─────────────────────────────────────────────────────────────
  // 🔌 REALTIME FIRESTORE LISTENER
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Personel giriş çıkış logları
    const pLogColl = collection(db, 'guvenlikGirisCikisLoglari');
    const unsubPLog = onSnapshot(pLogColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.zaman).getTime() - new Date(a.zaman).getTime());
      setPersonelLoglar(list);
    });

    // 2. İçerideki ve geçmiş araçlar
    const aracColl = collection(db, 'guvenlikAracLoglari');
    const unsubArac = onSnapshot(aracColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.girisZamani).getTime() - new Date(a.girisZamani).getTime());
      
      setIceridekiAraclar(list.filter(x => x.durum === 'İÇERİDE'));
      setAracGecmisLoglar(list.filter(x => x.durum === 'ÇIKTI'));
    });

    // 3. Aktif ve geçmiş ziyaretçiler
    const vizColl = collection(db, 'guvenlikZiyaretciLoglari');
    const unsubViz = onSnapshot(vizColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.girisZamani).getTime() - new Date(a.girisZamani).getTime());

      setAktifZiyaretciler(list.filter(x => x.durum === 'İÇERİDE'));
      setZiyaretciGecmisLoglar(list.filter(x => x.durum === 'ÇIKTI'));
    });

    // 4. Gelen Evraklar (Security uploaded document logs)
    const evrakColl = collection(db, 'guvenlikGelenEvraklar');
    const unsubEvrak = onSnapshot(evrakColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setGelenEvraklar(list);
    });

    // 5. Nöbet Arşivleri
    const nobetColl = collection(db, 'guvenlikNobetArsivleri');
    const unsubNobet = onSnapshot(nobetColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.kayitZamani).getTime() - new Date(a.kayitZamani).getTime());
      setNobetArsivleri(list);
    });

    return () => {
      unsubPLog();
      unsubArac();
      unsubViz();
      unsubEvrak();
      unsubNobet();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 💾 İRSALİYE GÖNDERİM EVENTİ
  // ─────────────────────────────────────────────────────────────
  const handleAddIrsaliyeItem = () => {
    if (!kalemUrunAdi || !kalemMiktar) {
      alert("Malzeme adı ve miktarını yazın!");
      return;
    }
    const newItem = {
      id: `item_${Date.now()}`,
      urunAdi: kalemUrunAdi,
      miktar: Number(kalemMiktar),
      birim: kalemBirim
    };
    setEklenenKalemler(prev => [...prev, newItem]);
    setKalemUrunAdi('');
    setKalemMiktar('');
  };

  const handleRemoveIrsaliyeItem = (id: string) => {
    setEklenenKalemler(prev => prev.filter(x => x.id !== id));
  };

  const handleArchiveNobetGunu = async (notes: string) => {
    setIsArchiving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayLogs = personelLoglar.filter(l => l.zaman && l.zaman.startsWith(todayStr));
      const todayAraclar = [...iceridekiAraclar, ...aracGecmisLoglar].filter(a => a.girisZamani && a.girisZamani.startsWith(todayStr));
      const todayZiyaretciler = [...aktifZiyaretciler, ...ziyaretciGecmisLoglar].filter(z => z.girisZamani && z.girisZamani.startsWith(todayStr));
      const todayEvraklar = gelenEvraklar.filter(e => e.tarih === todayStr);

      const archiveRef = doc(collection(db, 'guvenlikNobetArsivleri'));
      await setDoc(archiveRef, {
        tarih: todayStr,
        kayitZamani: new Date().toISOString(),
        kaydeden: currentUser?.email || 'Nöbetçi Güvenlik',
        notlar: notes,
        personelLoglari: todayLogs,
        aracLoglari: todayAraclar,
        ziyaretciLoglari: todayZiyaretciler,
        evrakLoglari: todayEvraklar
      });

      if (addNotification) {
        addNotification(`Bugünkü güvenlik nöbeti (${currentUser?.email || 'Güvenlik'}) tarafından arşivlendi.`);
      }
      showStatus('success', '🎉 Bugünkü nöbet günü başarıyla kalıcı olarak arşivlendi!');
    } catch (err: any) {
      console.error(err);
      showStatus('error', 'Nöbet günü arşivlenirken hata oluştu: ' + err.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleSaveIrsaliye = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!irsaliyeNo || !firma) {
      showStatus('error', `Lütfen ${evrakTuru === 'İRSALİYE' ? 'İrsaliye' : evrakTuru === 'FATURA' ? 'Fatura' : evrakTuru === 'MAKBUZ' ? 'Makbuz' : 'Evrak'} Numarasını ve Firma adını belirtin!`);
      return;
    }
    if (eklenenKalemler.length === 0) {
      showStatus('error', 'Lütfen en az bir malzeme kalemi ekleyin!');
      return;
    }

    setLoadingIrsaliye(true);
    try {
      const uniqueId = `EVR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      // 1. Save to the general received documents pool (Guvenlik Gelen Evraklar)
      const newEvrak = {
        id: uniqueId,
        evrakNo: irsaliyeNo,
        evrakTuru, // 'İRSALİYE' | 'FATURA' | 'MAKBUZ' | 'GENEL_EVRAK'
        firma,
        tarih: new Date().toISOString().slice(0, 10),
        saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        fotoUrl: irsaliyeFoto || "",
        durum: 'BEKLEMEDE',
        kalemler: eklenenKalemler.map(x => ({
          id: x.id,
          urunAdi: x.urunAdi,
          miktar: x.miktar,
          birim: x.birim
        })),
        aciklama: `Güvenlik kapısı evrak teslim alımı (${evrakTuru})`,
        kaydeden: currentUser?.email || 'nobetci_guvenlik'
      };

      await setDoc(doc(db, 'guvenlikGelenEvraklar', uniqueId), newEvrak);

      if (addNotification) {
        addNotification(`Güvenlik kapısında yeni evrak (${evrakTuru}, Firma: ${firma}) teslim alındı.`);
      }

      // 2. If it is a Waybill (İrsaliye), also save to legacy irsaliyeler collection for instant office review!
      if (evrakTuru === 'İRSALİYE') {
        const newIrsaliye: Irsaliye = {
          id: uniqueId,
          irsaliyeId: uniqueId,
          irsaliyeNo,
          firma,
          saId: "", // Removed preselected PO match from gate - matched in office instead!
          tarih: new Date().toISOString().slice(0, 10),
          onayDurumu: 'ONAY BEKLİYOR',
          fisEvrakUrl: irsaliyeFoto || "",
          kalemler: eklenenKalemler.map(x => ({
            id: x.id,
            urunAdi: x.urunAdi,
            miktar: x.miktar,
            birim: x.birim
          }))
        };
        await setDoc(doc(db, 'irsaliyeler', uniqueId), newIrsaliye);
      } else if (evrakTuru === 'FATURA') {
        const newFatura: Fatura = {
          id: uniqueId,
          faturaNo: irsaliyeNo,
          tarih: new Date().toISOString().slice(0, 10),
          cariKartId: "",
          cariUnvan: firma,
          toplamTutar: 0,
          kdvTutar: 0,
          genelToplam: 0,
          durum: 'KONTROL BEKLEYOR',
          evrakUrl: irsaliyeFoto || "",
          kalemler: eklenenKalemler.map(x => ({
            id: x.id,
            urunAdi: x.urunAdi,
            miktar: x.miktar,
            birim: x.birim,
            birimFiyat: 0,
            kdvOran: 20,
            toplam: 0
          })),
          bagliIrsaliyeler: []
        };
        await setDoc(doc(db, 'faturalar', uniqueId), newFatura);
      }
      
      // Clear inputs
      setIrsaliyeNo('');
      setFirma('');
      setEklenenKalemler([]);
      setIrsaliyeFoto(null);

      showStatus('success', `${evrakTuru} başarıyla kaydedildi ve Ofis Havuzuna gönderildi!`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Veritabanına kaydedilirken bir hata oluştu!');
    } finally {
      setLoadingIrsaliye(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 👥 PERSONEL GİRİŞ-ÇIKIŞ EVENTİ
  // ─────────────────────────────────────────────────────────────
  const handlePersonelGirisCikis = async (personel: Personel, tip: 'GİRİŞ' | 'ÇIKIŞ') => {
    setLoadingLog(true);
    try {
      const logId = `plog_${Date.now()}`;
      const logData = {
        id: logId,
        personelId: personel.id,
        ad: personel.ad,
        soyad: personel.soyad,
        tcNo: personel.tcNo,
        gorev: personel.gorev,
        tip,
        zaman: new Date().toISOString(),
        kaydeden: currentUser?.email || 'kapici_kibritci'
      };

      await setDoc(doc(db, 'guvenlikGirisCikisLoglari', logId), logData);
      if (addNotification) {
        addNotification(`${personel.ad} ${personel.soyad} için şantiyeye ${tip} kaydı yapıldı.`);
      }
      showStatus('success', `${personel.ad} ${personel.soyad} için ${tip} kaydı başarıyla girildi!`);
    } catch (e) {
      console.error(e);
      showStatus('error', 'Giriş çıkış kaydı oluşturulamadı.');
    } finally {
      setLoadingLog(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🚛 ARAÇ GİRİŞ-ÇIKIŞ EVENTLERİ
  // ─────────────────────────────────────────────────────────────
  const handleAracGiris = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plaka || !aracFirma) {
      alert("Lütfen Plaka ve Firma belirtin!");
      return;
    }

    try {
      const logId = `arac_${Date.now()}`;
      const logData = {
        id: logId,
        plaka: plaka.toUpperCase().trim(),
        aracTipi,
        firma: aracFirma,
        yukDurumu,
        surucuAdi,
        aciklama: aracAciklama,
        durum: 'İÇERİDE',
        girisZamani: new Date().toISOString(),
        cikisZamani: null,
        kaydeden: currentUser?.email || 'guvenlik_gate'
      };

      await setDoc(doc(db, 'guvenlikAracLoglari', logId), logData);
      if (addNotification) {
        addNotification(`${plaka.toUpperCase().trim()} plakalı araç (${aracFirma}) şantiyeye giriş yaptı.`);
      }
      setPlaka('');
      setAracFirma('');
      setSurucuAdi('');
      setAracAciklama('');
      showStatus('success', 'Araç giriş kaydı yapıldı, şantiyede aktif olarak işaretlendi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Kayıt başarısız!');
    }
  };

  const handleAracCikis = async (id: string) => {
    try {
      const matchedArac = iceridekiAraclar.find(a => a.id === id);
      const vehiclePlaka = matchedArac ? matchedArac.plaka : id;
      await setDoc(doc(db, 'guvenlikAracLoglari', id), {
        durum: 'ÇIKTI',
        cikisZamani: new Date().toISOString()
      }, { merge: true });
      if (addNotification) {
        addNotification(`${vehiclePlaka} plakalı araç şantiyeden çıkış yaptı.`);
      }
      showStatus('success', 'Araç çıkışı başarıyla kaydedildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Hata oluştu!');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🎫 ZİYARETÇİ KAYIT & KART EVENTLERİ
  // ─────────────────────────────────────────────────────────────
  const handleZiyaretciGiris = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ziyaretciAd || !ziyaretEdilen) {
      alert("Lütfen Ziyaretçi Adı ve Ziyaret Edilen yetkiliyi girin!");
      return;
    }

    try {
      const id = `guest_${Date.now()}`;
      const logData = {
        id,
        adSoyad: ziyaretciAd,
        tcNo: ziyaretciTc || 'Belirtilmedi',
        firma: ziyaretciFirma || 'Bireysel',
        ziyaretSebebi,
        ziyaretEdilen,
        durum: 'İÇERİDE',
        girisZamani: new Date().toISOString(),
        cikisZamani: null,
        kartNo: `ZK-${Math.floor(1000 + Math.random() * 9000)}`
      };

      await setDoc(doc(db, 'guvenlikZiyaretciLoglari', id), logData);
      if (addNotification) {
        addNotification(`Ziyaretçi ${ziyaretciAd} (${logData.firma}) şantiyeye giriş yaptı.`);
      }
      
      // Display Visitor Badge Modal
      setActiveBadgeGuest(logData);

      setZiyaretciAd('');
      setZiyaretciTc('');
      setZiyaretciFirma('');
      setZiyaretSebebi('');
      setZiyaretEdilen('');
      showStatus('success', 'Ziyaretçi giriş kaydı tamamlandı! Giriş kartı hazırlandı.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Hata!');
    }
  };

  const handleZiyaretciCikis = async (id: string) => {
    try {
      const matchedGuest = aktifZiyaretciler.find(z => z.id === id);
      const guestName = matchedGuest ? matchedGuest.adSoyad : id;
      await setDoc(doc(db, 'guvenlikZiyaretciLoglari', id), {
        durum: 'ÇIKTI',
        cikisZamani: new Date().toISOString()
      }, { merge: true });
      if (addNotification) {
        addNotification(`Ziyaretçi ${guestName} şantiyeden çıkış yaptı.`);
      }
      showStatus('success', 'Ziyaretçi çıkış işlemi tamamlandı!');
    } catch (err) {
      console.error(err);
    }
  };

  // 🔒 Authorization lock check
  const isAuthorized = userYetki === 'GÜVENLİK' || userYetki === 'YÖNETİCİ';
  if (userYetki && !isAuthorized) {
    return (
      <div className="flex-1 min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none text-slate-800">
        <div className="w-20 h-20 bg-rose-100 border border-rose-200 text-rose-600 rounded-3xl flex items-center justify-center mb-6">
          <Lock size={40} className="stroke-[2]" />
        </div>
        <h1 className="text-xl font-black text-slate-900 tracking-widest uppercase mb-2">🚧 YETKİSİZ ERİŞİM ENGELLENDİ</h1>
        <p className="text-sm text-slate-600 max-w-md leading-relaxed font-sans mb-6">
          Şantiye güvenliği ve veri bütünlüğü nedeniyle Güvenlik Kapısı Ekranı sadece yetkili <span className="text-amber-600 font-bold">GÜVENLİK</span> ve <span className="text-amber-600 font-bold">YÖNETİCİ</span> personeline açıktır.
        </p>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col space-y-2 text-xs font-mono w-full max-w-xs text-left mb-6 shadow-sm">
          <div className="flex justify-between"><span className="text-slate-400">Kullanıcı:</span> <span className="text-slate-700 font-bold">{currentUser?.email}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Mevcut Rolünüz:</span> <span className="text-rose-600 font-bold uppercase">{userYetki || 'Belirtilmedi'}</span></div>
        </div>
        {onSignOut && (
          <button 
            onClick={onSignOut}
            className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl px-5 py-2.5 text-xs font-bold transition cursor-pointer shadow-xs"
          >
            Sistemden Güvenli Çıkış Yap
          </button>
        )}
      </div>
    );
  }

  const mainLayout = (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 select-none">
      {/* 📱💻 Görünüm Simülatörü Kontrolü */}
      {!isStandalone && (
        <div className="bg-white border-b border-slate-200 p-2.5 px-6 flex justify-between items-center text-xs text-slate-700 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-black uppercase text-slate-500">Görünüm Modu:</span>
            <span className="text-[10px] bg-slate-100 text-amber-600 font-bold px-2 py-0.5 rounded-lg border border-slate-200 uppercase">
              {viewMode === 'mobile' ? '📱 MOBİL SÜMÜLATÖR' : '💻 GENİŞ EKRAN'}
            </span>
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'web' ? 'mobile' : 'web')}
            className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 text-[10px] font-black px-3 py-1.5 rounded-lg transition cursor-pointer"
          >
            {viewMode === 'web' ? '📱 MOBİL SÜRÜMÜ TEST ET' : '💻 GENİŞ EKRANA GEÇ'}
          </button>
        </div>
      )}
      
      {/* 🛡️ Header section */}
      <div className="bg-white p-5 px-6 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 bg-gradient-to-tr from-amber-600 to-orange-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-orange-500/10">
            <ShieldAlert size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-850 tracking-widest uppercase">🚧 KİBRİTÇİ ŞANTİYE GÜVENLİK KAPISI</h1>
            <p className="text-[10px] text-slate-550 font-mono uppercase tracking-wider">İrsaliye Kayıt, Araç Kantarı, Misafir Defteri ve Personel Giriş Kapısı</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 px-4 flex items-center space-x-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Giriş Noktası:</span>
            <span className="bg-amber-500 text-slate-950 text-[9px] font-mono font-black py-1 px-2 rounded-lg uppercase tracking-widest">
              NÖBETÇİ GÜVENLİK AMİRLİĞİ
            </span>
          </div>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="bg-rose-950/40 text-rose-400 hover:bg-rose-900 hover:text-white border border-rose-900/30 text-[10px] font-bold px-3 py-2 rounded-xl transition cursor-pointer"
            >
              Güvenli Çıkış
            </button>
          )}
        </div>
      </div>

      {/* State message banner */}
      {statusMsg && (
        <div className={`p-4 text-xs text-center font-bold tracking-wide shrink-0 transition-all ${
          statusMsg.type === 'success' ? 'bg-emerald-950/80 text-emerald-400 border-b border-emerald-800' : 'bg-rose-950/80 text-rose-400 border-b border-rose-800'
        }`}>
          {statusMsg.type === 'success' ? '✓' : '⚠️'} {statusMsg.text}
        </div>
      )}

      {/* Layout Grid */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        
        {/* Left Side Tab Controls */}
        <div className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col p-4 space-y-4 shrink-0 lg:overflow-y-auto">
          
          <div className="flex flex-row lg:flex-col flex-wrap lg:flex-nowrap gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <span className="w-full lg:w-auto px-2.5 pt-1 text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Nöbetçi Menüsü</span>
            
            <button 
              onClick={() => setActiveTab('irsaliye')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'irsaliye' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><FileText size={13} /> <span>1. Evrak Girişi</span></span>
            </button>

            <button 
              onClick={() => setActiveTab('personel')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'personel' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Users size={13} /> <span>2. Personel Kapı</span></span>
            </button>

            <button 
              onClick={() => setActiveTab('arac')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'arac' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Truck size={13} /> <span>3. Araç Giriş-Çıkış</span></span>
              {iceridekiAraclar.length > 0 && (
                <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{iceridekiAraclar.length}</span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('ziyaretci')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'ziyaretci' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><UserCheck size={13} /> <span>4. Ziyaretçi Defteri</span></span>
              {aktifZiyaretciler.length > 0 && (
                <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{aktifZiyaretciler.length}</span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('nobet_arsivi')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'nobet_arsivi' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Archive size={13} /> <span>5. Nöbet Kapat &amp; Arşiv</span></span>
            </button>
          </div>

          {/* Gate Status & Alerts */}
          <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl space-y-2 text-xs hidden lg:block">
            <span className="font-bold text-[9px] block uppercase text-amber-500 tracking-widest">NÖBET DEFTERİ NOTU</span>
            <p className="text-[11px] text-slate-450 leading-relaxed italic">
              "Kıymetli Nöbetçi Personel; Şantiyeye gelen her çimento mikseri, hafriyat kamyonu ve ziyaretçinin giriş-çıkış saatini saniyesiyle sisteme kaydedin. Evraksız hiçbir tedarikçi aracını şantiyeye sokmayın."
            </p>
          </div>

        </div>

        {/* Right workspace details area */}
        <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-6">
          
          {/* ─────────────────────────────────────────────────────────────
              TAB 1: İRSALİYE GİRİŞLERİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'irsaliye' && (
            <div className="space-y-6">
              
              <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b pb-2">📄 YENİ İRSALİYE &amp; TESLİMAT EVRAKI GİRİŞİ</span>
                
                {/* AI Document Scanner block */}
                <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-indigo-400 tracking-wide uppercase text-[10px] flex items-center gap-1.5">
                      ✨ YAPAY ZEKA (AI) MOBİL EVRAK OKUYUCU
                    </span>
                    <span className="font-bold text-[8px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-sans uppercase">
                      GEMINI DESTEKLİ
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-305 leading-relaxed">
                    Şantiyeye giren aracın teslim ettiği belgenin (İrsaliye veya Fatura) fotoğrafını çekip/yükleyin; evrak türünü, numarasını, firmasını ve içindeki tüm kalemleri saniyeler içinde yapay zeka ile otomatik dolduralım.
                  </p>
                  
                  <div className="relative border border-dashed border-indigo-950 rounded-xl p-3.5 text-center bg-white/45 hover:bg-indigo-950/20 transition cursor-pointer">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          processSecurityDocumentAi(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isAiParsing}
                    />
                    {isAiParsing ? (
                      <div className="flex flex-col items-center justify-center space-y-1.5 py-1">
                        <div className="animate-spin rounded-full h-4.5 w-4.5 border-2 border-indigo-500 border-t-transparent"></div>
                        <span className="text-[10.5px] font-bold text-indigo-300 animate-pulse">Fotoğraf yapay zeka ile çözümleniyor, lütfen bekleyin...</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-indigo-400 block">📷 Evrak Fotoğrafı Çek veya Dosya Seç</span>
                        <span className="text-[9px] text-slate-500 block">Kamera, PDF, PNG, JPG, WEBP formatları desteklenir</span>
                      </div>
                    )}
                  </div>

                  {aiParseError && (
                    <div className="bg-red-950/40 border border-red-900/50 text-red-400 p-2.5 rounded-xl text-[10.5px] font-semibold">
                      ❌ {aiParseError}
                    </div>
                  )}
                  {aiParseSuccess && (
                    <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 p-2.5 rounded-xl text-[10.5px] whitespace-pre-line font-medium leading-relaxed font-sans">
                      🎉 {aiParseSuccess}
                    </div>
                  )}
                </div>

                <form onSubmit={handleSaveIrsaliye} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold uppercase text-[9px]">Evrak Türü *</label>
                    <select
                      value={evrakTuru}
                      onChange={(e) => setEvrakTuru(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 text-amber-400 p-2.5 rounded-xl font-bold text-xs"
                    >
                      <option value="İRSALİYE">📄 İRSALİYE GİRİŞİ</option>
                      <option value="FATURA">💰 FATURA GİRİŞİ</option>
                      <option value="MAKBUZ">🎫 MAKBUZ GİRİŞİ</option>
                      <option value="GENEL_EVRAK">📦 GENEL EVRAK / KARGO ALIMI</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold uppercase text-[9px]">Evrak Numarası / Kod *</label>
                    <input 
                      type="text"
                      required
                      placeholder="Örn: IRS-2026-9874 veya FAT-4521"
                      value={irsaliyeNo}
                      onChange={(e) => setIrsaliyeNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold font-mono text-xs uppercase"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold uppercase text-[9px]">Tedarikçi / Gönderen Firma *</label>
                    <input 
                      type="text"
                      required
                      placeholder="Örn: Kibritçi Çimento A.Ş."
                      value={firma}
                      onChange={(e) => setFirma(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                    />
                  </div>

                  {/* Attachment Waybill Image */}
                  <div className="md:col-span-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                    <span className="font-bold text-[10px] text-slate-350 uppercase block tracking-wider">📷 İrsaliye Evrak Fotoğrafı / Taraması Yükle</span>
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <label className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs py-3 px-6 rounded-xl flex items-center justify-center space-x-2.5 cursor-pointer transition shrink-0">
                        <Camera size={16} className="text-amber-500" />
                        <span>{irsaliyeFoto ? '✓ Evrak Fotoğrafı Seçildi (Değiştir)' : 'Evrak Fotoğrafı Çek / Seç'}</span>
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
                                  setIrsaliyeFoto(compressed);
                                }
                              };
                              r.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {irsaliyeFoto && (
                        <div className="w-24 h-24 bg-white rounded-xl overflow-hidden border border-slate-200 relative group shrink-0">
                          <img src={irsaliyeFoto} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setIrsaliyeFoto(null)}
                            className="absolute inset-0 bg-black/75 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[10px] text-rose-500 font-black uppercase transition"
                          >
                            Sil
                          </button>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-500 leading-relaxed italic">
                        "Şantiyeye giren her malzemenin teslim faturasının/irsaliyesinin okunaklı bir fotoğrafını çekip sisteme yükleyin. Bu evraklar muhasebe paneline ve proje müdürünün onay havuzuna eş zamanlı düşecektir."
                      </p>
                    </div>
                  </div>

                  {/* Add materials section */}
                  <div className="md:col-span-3 border-t border-slate-200 pt-4 space-y-3">
                    <span className="font-bold text-[10px] text-amber-500 uppercase block tracking-wider">📦 SEVK EDİLEN MALZEME KALEMLERİ EKLE</span>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-200">
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-500 block uppercase">Malzeme / Ürün Adı</label>
                        <input 
                          type="text"
                          placeholder="Örn: C30 Hazır Beton"
                          value={kalemUrunAdi}
                          onChange={(e) => setKalemUrunAdi(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-805 p-2 rounded-xl text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-500 block uppercase">Miktar</label>
                        <input 
                          type="number"
                          placeholder="Örn: 15"
                          value={kalemMiktar}
                          onChange={(e) => setKalemMiktar(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 text-slate-805 p-2 rounded-xl text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-500 block uppercase">Birim</label>
                        <select 
                          value={kalemBirim}
                          onChange={(e) => setKalemBirim(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-805 p-2 rounded-xl text-xs"
                        >
                          <option value="Adet">Adet</option>
                          <option value="m³ (Metreküp)">m³ (Metreküp)</option>
                          <option value="Ton">Ton</option>
                          <option value="Torba">Torba</option>
                          <option value="Kg">Kg</option>
                          <option value="Metre">Metre</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddIrsaliyeItem}
                          className="w-full bg-slate-850 hover:bg-slate-800 text-amber-500 font-extrabold text-xs py-2 px-3 rounded-xl border border-slate-750 transition cursor-pointer flex items-center justify-center space-x-1.5"
                        >
                          <PlusCircle size={14} />
                          <span>Kalem Ekle</span>
                        </button>
                      </div>
                    </div>

                    {/* Added items list */}
                    {eklenenKalemler.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 font-black uppercase text-[9px] border-b border-slate-200">
                              <th className="p-3">Malzeme Açıklaması</th>
                              <th className="p-3 text-right">Miktar</th>
                              <th className="p-3">Birim</th>
                              <th className="p-3 text-center">İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eklenenKalemler.map((item, i) => (
                              <tr key={item.id} className="border-b border-slate-900 text-slate-700">
                                <td className="p-3 font-bold">{item.urunAdi}</td>
                                <td className="p-3 text-right font-mono font-bold text-amber-450">{item.miktar}</td>
                                <td className="p-3 text-slate-500">{item.birim}</td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveIrsaliyeItem(item.id)}
                                    className="text-rose-500 hover:text-rose-400 font-black font-mono px-2 py-1"
                                  >
                                    Sil
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="md:col-span-3 pt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={loadingIrsaliye}
                      className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-slate-950 font-black text-xs py-3 px-8 rounded-xl cursor-pointer border-b-2 border-amber-800 transition shadow-lg shadow-amber-600/10"
                    >
                      {loadingIrsaliye ? 'Kaydediliyor...' : 'EVRAKI ONAY HAVUZUNA GÖNDER'}
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 2: PERSONEL GİRİŞ ÇIKIŞ TAKİBİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'personel' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Personnel Search & Grid */}
                <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-display font-black text-xs text-white uppercase tracking-widest block">👥 ŞANTİYE PERSONEL GİRİŞ PANELİ</span>
                    <span className="bg-blue-950 text-blue-400 text-[9px] font-mono font-bold py-0.5 px-2 rounded">REALTIME</span>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 text-slate-500" size={14} />
                    <input 
                      type="text"
                      placeholder="Personel Adı, Soyadı, TC veya Görev Ara..."
                      value={personelSearch}
                      onChange={(e) => setPersonelSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 pl-10 rounded-xl text-xs placeholder-slate-650"
                    />
                  </div>

                  {/* Grid of employees */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                    {filteredPersonel.map((item) => (
                      <div key={item.id} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between space-y-3 hover:border-slate-700 transition">
                        <div className="flex items-start space-x-2.5">
                          {item.fotografUrl ? (
                            <img src={item.fotografUrl} alt={item.ad} className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 font-bold shrink-0 text-xs">
                              {item.ad[0]}{item.soyad[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-805 text-xs truncate">{item.ad} {item.soyad}</h4>
                            <span className="text-[9px] text-slate-500 block truncate font-mono mt-0.5">💼 {item.gorev}</span>
                            <span className="text-[8px] text-slate-600 block font-mono mt-0.2">TC: {item.tcNo.replace(/(\d{3})\d{5}(\d{3})/, '$1*****$2')}</span>
                          </div>
                        </div>

                        {/* Gate actions */}
                        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-950">
                          <button
                            onClick={() => handlePersonelGirisCikis(item, 'GİRİŞ')}
                            className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-slate-950 text-[9px] font-black py-1.5 rounded-xl border border-emerald-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <Check size={10} />
                            <span>KAPI GİRİŞ</span>
                          </button>
                          <button
                            onClick={() => handlePersonelGirisCikis(item, 'ÇIKIŞ')}
                            className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white text-[9px] font-black py-1.5 rounded-xl border border-rose-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <X size={10} />
                            <span>KAPI ÇIKIŞ</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {filteredPersonel.length === 0 && (
                      <div className="col-span-2 text-center p-6 text-slate-500 italic text-xs">Arama kriterlerine uygun personel bulunamadı.</div>
                    )}
                  </div>
                </div>

                {/* Live gate logs history */}
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-display font-black text-xs text-amber-500 uppercase tracking-widest block">📋 BUGÜNKÜ GİRİŞ-ÇIKIŞ LOGLARI</span>
                    <Clock size={14} className="text-amber-500 animate-pulse" />
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {personelLoglar.slice(0, 20).map((log) => {
                      const isGiris = log.tip === 'GİRİŞ';
                      return (
                        <div key={log.id} className="bg-slate-50 border border-slate-855 rounded-xl p-2.5 flex justify-between items-center text-[11px]">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-805 block">{log.ad} {log.soyad}</span>
                            <span className="text-[9px] text-slate-500 font-mono uppercase">{log.gorev}</span>
                          </div>
                          
                          <div className="text-right">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono tracking-wide ${
                              isGiris ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/10' : 'bg-rose-950 text-rose-400 border border-rose-500/10'
                            }`}>
                              {log.tip}
                            </span>
                            <span className="text-[9px] text-slate-500 block font-mono mt-0.5">
                              {new Date(log.zaman).toLocaleTimeString('tr-TR')}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {personelLoglar.length === 0 && (
                      <div className="text-center p-10 text-slate-500 italic text-[11px]">Kapıda bugün henüz hiçbir personel girişi veya çıkışı kaydedilmedi.</div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 3: ARAÇ GİRİŞ-ÇIKIŞ TAKİBİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'arac' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Vehicle In Form */}
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">🚚 ARAÇ ŞANTİYE GİRİŞ GİRİŞİ</span>
                  
                  <form onSubmit={handleAracGiris} className="space-y-3.5 text-xs text-slate-700">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Araç Plakası *</label>
                      <input 
                        type="text"
                        required
                        placeholder="Örn: 34 ABC 123"
                        value={plaka}
                        onChange={(e) => setPlaka(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold font-mono text-xs uppercase"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Araç Tipi / Cinsi *</label>
                      <select 
                        value={aracTipi}
                        onChange={(e) => setAracTipi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                      >
                        <option value="Hazır Beton Mikseri">Hazır Beton Mikseri</option>
                        <option value="Hafriyat Kamyonu">Hafriyat Kamyonu</option>
                        <option value="Tedarikçi Teslimat Kamyoneti">Tedarikçi Teslimat Kamyoneti</option>
                        <option value="Ziyaretçi Hususi Araç">Ziyaretçi Hususi Araç</option>
                        <option value="Beton Pompası">Beton Pompası</option>
                        <option value="Vinç / Mobil Vinç">Vinç / Mobil Vinç</option>
                        <option value="Diğer Şantiye İş Makinesi">Diğer Şantiye İş Makinesi</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Firma / Kurum *</label>
                      <input 
                        type="text"
                        required
                        placeholder="Örn: Kibritçi Çimento A.Ş."
                        value={aracFirma}
                        onChange={(e) => setAracFirma(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Yük Durumu</label>
                        <select 
                          value={yukDurumu}
                          onChange={(e) => setYukDurumu(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2 rounded-xl text-xs font-bold"
                        >
                          <option value="Dolu">Dolu</option>
                          <option value="Boş">Boş</option>
                          <option value="Kısmi">Kısmi Yüklü</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Sürücü Adı Soyadı</label>
                        <input 
                          type="text"
                          placeholder="Örn: Ahmet Yılmaz"
                          value={surucuAdi}
                          onChange={(e) => setSurucuAdi(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2 rounded-xl text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Açıklama / Sevk Nedeni</label>
                      <input 
                        type="text"
                        placeholder="Beton döküm faaliyeti için döküm sahasına sevk."
                        value={aracAciklama}
                        onChange={(e) => setAracAciklama(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-slate-950 font-black text-xs py-3 rounded-xl cursor-pointer border-b-2 border-amber-800 transition"
                    >
                      KAYDET &amp; ŞANTİYEYE GÖNDER
                    </button>
                  </form>
                </div>

                {/* Vehicles Currently Inside */}
                <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <span className="font-display font-black text-xs text-amber-500 uppercase tracking-widest block border-b border-slate-200 pb-2">🚧 AKTİF OLARAK ŞANTİYE İÇİNDEKİ ARAÇLAR</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                    {iceridekiAraclar.map((item) => (
                      <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3.5 relative overflow-hidden">
                        
                        <div className="flex justify-between items-center border-b border-slate-950 pb-1.5">
                          <span className="font-mono text-xs font-black text-white bg-white px-2 py-0.5 border border-slate-200 rounded">{item.plaka}</span>
                          <span className="text-[9px] text-amber-400 font-bold uppercase">{item.aracTipi}</span>
                        </div>

                        <div className="space-y-1 text-[11px] text-slate-500 font-semibold">
                          <p>🏢 Tedarikçi: <span className="text-slate-150 font-bold">{item.firma}</span></p>
                          <p>👤 Sürücü: <span className="text-slate-150 font-bold">{item.surucuAdi || 'Belirtilmedi'}</span></p>
                          <p>⚖️ Yük / Sevk Nedeni: <span className="text-amber-500 font-bold">{item.yukDurumu} ({item.aciklama || 'Genel'})</span></p>
                          <p className="text-[9px] text-slate-500 pt-1">Giriş Saati: {new Date(item.girisZamani).toLocaleString('tr-TR')}</p>
                        </div>

                        <button
                          onClick={() => handleAracCikis(item.id)}
                          className="w-full bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white font-extrabold text-[10px] py-1.5 px-3 rounded-xl border border-rose-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <X size={11} />
                          <span>ŞANTİYEDEN ÇIKIŞ YAPTI OLARAK İŞARETLE</span>
                        </button>
                      </div>
                    ))}

                    {iceridekiAraclar.length === 0 && (
                      <div className="col-span-2 bg-slate-900/40 p-10 rounded-2xl border border-slate-200 text-center text-slate-500 italic text-xs">
                        Şantiyede aktif olarak bulunan hiçbir iş makinesi veya tedarikçi araç kaydı bulunmuyor.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 4: ZİYARETÇİ DEFTERİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'ziyaretci' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Guest Form */}
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">🎫 YENİ MİSAFİR GİRİŞ KAYDI</span>
                  
                  <form onSubmit={handleZiyaretciGiris} className="space-y-3.5 text-xs text-slate-700">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Ziyaretçi Adı Soyadı *</label>
                      <input 
                        type="text"
                        required
                        placeholder="Örn: Ahmet Karaca"
                        value={ziyaretciAd}
                        onChange={(e) => setZiyaretciAd(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Kimlik No / TC Kodu (Son 4 Hane)</label>
                      <input 
                        type="text"
                        maxLength={11}
                        placeholder="Örn: 2478"
                        value={ziyaretciTc}
                        onChange={(e) => setZiyaretciTc(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Firma / Kurum / Ünvan</label>
                      <input 
                        type="text"
                        placeholder="Örn: Yapı Denetim Sorumlusu"
                        value={ziyaretciFirma}
                        onChange={(e) => setZiyaretciFirma(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Ziyaret Nedeni</label>
                      <input 
                        type="text"
                        placeholder="Örn: Beton Demir Kalıp Kontrolü"
                        value={ziyaretSebebi}
                        onChange={(e) => setZiyaretSebebi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Görüşülecek Şantiye Yetkilisi *</label>
                      <input 
                        type="text"
                        required
                        placeholder="Örn: Samet Atak veya Şantiye Şefi (Elle yazın)"
                        value={ziyaretEdilen}
                        onChange={(e) => setZiyaretEdilen(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-slate-950 font-black text-xs py-3 rounded-xl cursor-pointer border-b-2 border-amber-800 transition"
                    >
                      ✓ GİRİŞ KAYDI YAP &amp; KART YAZDIR
                    </button>
                  </form>
                </div>

                {/* Active Visitors */}
                <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <span className="font-display font-black text-xs text-amber-500 uppercase tracking-widest block border-b border-slate-200 pb-2">🚧 ŞANTİYEDEKİ MİSAFİRLER / GÖREV ALANLAR</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                    {aktifZiyaretciler.map((item) => (
                      <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3 flex flex-col justify-between relative overflow-hidden">
                        
                        <div className="flex justify-between items-center border-b border-slate-950 pb-1.5">
                          <span className="font-mono text-xs font-black text-white bg-white px-2 py-0.5 border border-slate-200 rounded">{item.kartNo}</span>
                          <span className="bg-amber-500/15 text-amber-400 text-[8px] font-mono font-black py-0.5 px-2 rounded-lg uppercase tracking-wider">MİSAFİR</span>
                        </div>

                        <div className="space-y-1 text-[11px] text-slate-500 font-semibold">
                          <p>👤 Adı Soyadı: <span className="text-slate-800 font-bold">{item.adSoyad}</span></p>
                          <p>🏢 Kurum: <span className="text-slate-150">{item.firma}</span></p>
                          <p>🤝 Görüşülen Yetkili: <span className="text-blue-400 font-bold">{item.ziyaretEdilen}</span></p>
                          <p>💼 Neden: <span className="text-slate-805">{item.ziyaretSebebi || 'Genel Görüşme'}</span></p>
                          <p className="text-[9px] text-slate-500 pt-1">Giriş Saati: {new Date(item.girisZamani).toLocaleString('tr-TR')}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-950/60">
                          <button
                            onClick={() => setActiveBadgeGuest(item)}
                            className="bg-slate-800 hover:bg-slate-750 text-slate-700 text-[9px] font-extrabold py-1.5 rounded-xl border border-slate-700 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <Printer size={11} />
                            <span>KART YAZDIR</span>
                          </button>
                          
                          <button
                            onClick={() => handleZiyaretciCikis(item.id)}
                            className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white text-[9px] font-extrabold py-1.5 rounded-xl border border-rose-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>ÇIKIŞ YAPTI</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {aktifZiyaretciler.length === 0 && (
                      <div className="col-span-2 bg-slate-900/40 p-10 rounded-2xl border border-slate-200 text-center text-slate-500 italic text-xs">
                        Şantiyede aktif olarak bulunan hiçbir ziyaretçi kaydı bulunmuyor.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 5: NÖBET GÜNÜ KAPAT & ARŞİV
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'nobet_arsivi' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Sol Panel: Aktif Günü Arşivle */}
                <div className="bg-white p-6 border border-slate-200 rounded-3xl space-y-5">
                  <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">
                    🔒 BUGÜNKÜ NÖBET GÜNÜNÜ ARŞİVLE
                  </span>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Nöbet değişimi veya gün sonu geldiğinde, bugünkü tüm aktif giriş-çıkış hareketlerini dondurup geriye dönük arama havuzuna kalıcı arşiv olarak kaydedebilirsiniz.
                  </p>

                  {/* Bugünkü İstatistikler */}
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Bugünkü Hareketler Özeti</span>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                        <span className="text-[9px] font-bold text-slate-500 block uppercase">Personel Hareketi</span>
                        <span className="text-sm font-black text-slate-805 font-mono">
                          {personelLoglar.filter(l => l.zaman && l.zaman.startsWith(new Date().toISOString().slice(0, 10))).length} Kayıt
                        </span>
                      </div>

                      <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                        <span className="text-[9px] font-bold text-slate-500 block uppercase">Araç Kaydı</span>
                        <span className="text-sm font-black text-slate-805 font-mono">
                          {[...iceridekiAraclar, ...aracGecmisLoglar].filter(a => (a.girisZamani && a.girisZamani.startsWith(new Date().toISOString().slice(0, 10)))).length} Araç
                        </span>
                      </div>

                      <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                        <span className="text-[9px] font-bold text-slate-500 block uppercase">Misafir Sayısı</span>
                        <span className="text-sm font-black text-slate-805 font-mono">
                          {[...aktifZiyaretciler, ...ziyaretciGecmisLoglar].filter(z => (z.girisZamani && z.girisZamani.startsWith(new Date().toISOString().slice(0, 10)))).length} Ziyaretçi
                        </span>
                      </div>

                      <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                        <span className="text-[9px] font-bold text-slate-500 block uppercase">Evrak Alımı</span>
                        <span className="text-sm font-black text-slate-805 font-mono">
                          {gelenEvraklar.filter(e => e.tarih === new Date().toISOString().slice(0, 10)).length} Evrak
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notlar */}
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold uppercase text-[9px]">GÜN SONU / NÖBET NOTLARI</label>
                    <textarea
                      placeholder="Örn: Nöbette herhangi bir olumsuz durum yaşanmadı. Vardiya eksiksiz devredildi."
                      id="nobetNotlar"
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-805 p-3 rounded-xl text-xs focus:ring-1 focus:ring-amber-500 outline-none resize-none"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const txt = (document.getElementById('nobetNotlar') as HTMLTextAreaElement)?.value || '';
                      handleArchiveNobetGunu(txt);
                      if ((document.getElementById('nobetNotlar') as HTMLTextAreaElement)) {
                        (document.getElementById('nobetNotlar') as HTMLTextAreaElement).value = '';
                      }
                    }}
                    disabled={isArchiving}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-slate-950 font-black text-xs py-3.5 rounded-2xl flex items-center justify-center space-x-2 border-b-2 border-amber-700 cursor-pointer transition uppercase tracking-wider"
                  >
                    <Archive size={14} />
                    <span>{isArchiving ? 'Arşivleniyor...' : 'Nöbet Gününü Kalıcı Arşivle'}</span>
                  </button>

                </div>

                {/* Sağ Panel: Arşiv Arama ve Listeleme */}
                <div className="lg:col-span-2 bg-white p-6 border border-slate-200 rounded-3xl space-y-4">
                  
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-200 pb-3 gap-3">
                    <div>
                      <span className="font-display font-black text-xs text-white uppercase tracking-widest block">
                        📂 GEÇMİŞ GÜNLERİN GÜVENLİK ARŞİVLERİ
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">Geriye dönük güvenlik nöbet kayıtları havuzu</p>
                    </div>

                    {/* Arama Barı */}
                    <div className="relative w-full sm:w-64 shrink-0">
                      <Search className="absolute left-3 top-3 text-slate-500" size={13} />
                      <input 
                        type="text"
                        placeholder="Tarih veya açıklama ara..."
                        value={nobetSearch}
                        onChange={(e) => setNobetSearch(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-805 pl-8.5 pr-4 py-2 rounded-xl text-xs outline-none focus:border-amber-500 font-bold"
                      />
                    </div>
                  </div>

                  {/* Arşiv Kart Listesi */}
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                    {nobetArsivleri
                      .filter(x => {
                        const q = nobetSearch.toLowerCase();
                        return (x.tarih || '').toLowerCase().includes(q) || (x.notlar || '').toLowerCase().includes(q) || (x.kaydeden || '').toLowerCase().includes(q);
                      })
                      .map((archive) => (
                        <div 
                          key={archive.id}
                          className="bg-slate-50 hover:bg-slate-850 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center space-x-2">
                              <Calendar size={13} className="text-amber-500" />
                              <span className="text-sm font-black text-white font-mono">{archive.tarih}</span>
                              <span className="bg-white text-slate-500 text-[9px] px-2 py-0.5 rounded-lg border border-slate-200">
                                {new Date(archive.kayitZamani).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-sans leading-relaxed">
                              {archive.notlar}
                            </p>
                            <span className="text-[10px] font-mono text-slate-500 block uppercase">
                              Arşivleyen: {archive.kaydeden}
                            </span>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            {/* Küçük istatistik barları */}
                            <div className="flex items-center space-x-1 bg-white/50 p-2 rounded-xl border border-slate-200/40 text-[9px] font-mono font-bold text-slate-450">
                              <span>P: <strong className="text-slate-805">{archive.personelLoglari?.length || 0}</strong></span>
                              <span className="text-slate-700">|</span>
                              <span>A: <strong className="text-slate-805">{archive.aracLoglari?.length || 0}</strong></span>
                              <span className="text-slate-700">|</span>
                              <span>Z: <strong className="text-slate-805">{archive.ziyaretciLoglari?.length || 0}</strong></span>
                              {archive.evrakLoglari && (
                                <>
                                  <span className="text-slate-700">|</span>
                                  <span>E: <strong className="text-slate-805">{archive.evrakLoglari?.length || 0}</strong></span>
                                </>
                              )}
                            </div>

                            <button
                              onClick={() => setSelectedArchive(archive)}
                              className="bg-amber-600/10 hover:bg-amber-600 border border-amber-500/20 text-amber-400 hover:text-slate-950 text-[10px] font-black px-3.5 py-2 rounded-xl transition cursor-pointer"
                            >
                              Arşivi İncele
                            </button>
                          </div>
                        </div>
                      ))}

                    {nobetArsivleri.length === 0 && (
                      <div className="bg-slate-900/40 p-12 rounded-2xl border border-slate-200 text-center text-slate-500 italic text-xs">
                        Henüz sisteme kaydedilmiş hiçbir Nöbet Günü Arşivi bulunmuyor.
                      </div>
                    )}
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>
      </div>

      {/* 📂 GÜVENLİK ARŞİVİ DETAY GÖRÜNTÜLEYİCİ MODAL */}
      {selectedArchive && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 text-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-50 p-5 px-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
                  <Archive size={16} />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-widest">NÖBET DEFTERİ GÜVENLİK KAYITLARI DETAYI</h3>
                  <p className="text-[10px] text-slate-500 font-mono uppercase">Tarih: <strong className="text-amber-400">{selectedArchive.tarih}</strong> | Arşivleyen: {selectedArchive.kaydeden}</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedArchive(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-white rounded-xl p-2 cursor-pointer transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Scrollable Workspace */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {/* Not */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl">
                <span className="font-bold text-[9px] block uppercase text-amber-500 tracking-wider mb-1">NÖBET AMİRİ DEVİR NOTU</span>
                <p className="text-xs text-slate-700 leading-relaxed italic">
                  "{selectedArchive.notlar || 'Açıklama belirtilmemiş.'}"
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Personel Giriş Çıkış Kayıtları */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest block border-b border-slate-200 pb-1.5">
                    👥 PERSONEL GİRİŞ-ÇIKIŞ LOGLARI ({selectedArchive.personelLoglari?.length || 0})
                  </span>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {selectedArchive.personelLoglari?.map((log: any, idx: number) => (
                      <div key={log.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-805">{log.ad} {log.soyad}</span>
                          <span className="text-[9px] text-slate-500 block uppercase">{log.gorev}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded ${log.tip === 'GİRİŞ' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {log.tip}
                          </span>
                          <span className="text-[9px] text-slate-500 block font-mono mt-0.5">{new Date(log.zaman).toLocaleTimeString('tr-TR')}</span>
                        </div>
                      </div>
                    ))}
                    {(!selectedArchive.personelLoglari || selectedArchive.personelLoglari.length === 0) && (
                      <p className="text-[11px] text-slate-500 italic">Bugün hiçbir personel giriş-çıkış işlemi kaydedilmedi.</p>
                    )}
                  </div>
                </div>

                {/* 2. Araç Giriş Çıkış Kayıtları */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest block border-b border-slate-200 pb-1.5">
                    🚛 ARAÇ HAREKET KAYITLARI ({selectedArchive.aracLoglari?.length || 0})
                  </span>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {selectedArchive.aracLoglari?.map((arac: any, idx: number) => (
                      <div key={arac.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-black text-amber-400 uppercase">{arac.plaka}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${arac.durum === 'İÇERİDE' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                            {arac.durum}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-350">{arac.surucuAdi} | {arac.firma} ({arac.aracTipi})</p>
                        <div className="flex justify-between text-[9px] text-slate-550 font-mono">
                          <span>Giriş: {arac.girisZamani ? new Date(arac.girisZamani).toLocaleTimeString('tr-TR') : '-'}</span>
                          <span>Çıkış: {arac.cikisZamani ? new Date(arac.cikisZamani).toLocaleTimeString('tr-TR') : '-'}</span>
                        </div>
                      </div>
                    ))}
                    {(!selectedArchive.aracLoglari || selectedArchive.aracLoglari.length === 0) && (
                      <p className="text-[11px] text-slate-500 italic">Bugün hiçbir araç giriş-çıkış işlemi kaydedilmedi.</p>
                    )}
                  </div>
                </div>

                {/* 3. Ziyaretçi Defteri Kayıtları */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest block border-b border-slate-200 pb-1.5">
                    🎫 ZİYARETÇİ DEFTERİ KAYITLARI ({selectedArchive.ziyaretciLoglari?.length || 0})
                  </span>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {selectedArchive.ziyaretciLoglari?.map((guest: any, idx: number) => (
                      <div key={guest.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-805">{guest.adSoyad}</span>
                          <span className="font-mono text-[9px] text-amber-500">{guest.kartNo}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">Görüşülen Yetkili: <strong className="text-blue-400">{guest.ziyaretEdilen}</strong></p>
                        <p className="text-[10px] text-slate-500">{guest.firma} | {guest.ziyaretSebebi}</p>
                        <div className="flex justify-between text-[9px] text-slate-550 font-mono pt-1">
                          <span>Giriş: {guest.girisZamani ? new Date(guest.girisZamani).toLocaleTimeString('tr-TR') : '-'}</span>
                          <span>Çıkış: {guest.cikisZamani ? new Date(guest.cikisZamani).toLocaleTimeString('tr-TR') : '-'}</span>
                        </div>
                      </div>
                    ))}
                    {(!selectedArchive.ziyaretciLoglari || selectedArchive.ziyaretciLoglari.length === 0) && (
                      <p className="text-[11px] text-slate-500 italic">Bugün hiçbir ziyaretçi kaydı bulunmuyor.</p>
                    )}
                  </div>
                </div>

                {/* 4. Teslim Alınan Evrak Kayıtları */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest block border-b border-slate-200 pb-1.5">
                    📦 TESLİM ALINAN EVRAKLAR &amp; TESLİMATLAR ({selectedArchive.evrakLoglari?.length || 0})
                  </span>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {selectedArchive.evrakLoglari?.map((evr: any, idx: number) => (
                      <div key={evr.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-amber-400 uppercase font-mono">{evr.evrakNo}</span>
                          <span className="bg-slate-50 text-slate-500 text-[8px] font-bold px-2 py-0.5 rounded">
                            {evr.evrakTuru}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-350">{evr.firma}</p>
                        {evr.kalemler && evr.kalemler.length > 0 && (
                          <div className="bg-slate-50 p-1 px-2 rounded text-[10px] text-slate-500 font-mono">
                            {evr.kalemler.map((k: any) => `${k.urunAdi} (${k.miktar} ${k.birim})`).join(', ')}
                          </div>
                        )}
                        <span className="text-[9px] font-mono text-slate-550 block mt-1">Giriş Saati: {evr.saat}</span>
                      </div>
                    ))}
                    {(!selectedArchive.evrakLoglari || selectedArchive.evrakLoglari.length === 0) && (
                      <p className="text-[11px] text-slate-500 italic">Bugün hiçbir evrak/teslimat kaydı bulunmuyor.</p>
                    )}
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Footer actions */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedArchive(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-700 font-bold px-6 py-2 rounded-xl text-xs cursor-pointer"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 💳 VISITOR BADGE MODAL / GİRİŞ KARTI */}
      {activeBadgeGuest && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white text-slate-900 rounded-3xl w-80 overflow-hidden shadow-2xl border border-slate-200 flex flex-col p-5 space-y-4 animate-in zoom-in duration-150">
            
            {/* Header Badge */}
            <div className="flex flex-col items-center space-y-1.5 text-center border-b pb-4">
              <span className="text-amber-500"><ShieldAlert size={28} className="fill-amber-500/10" /></span>
              <h3 className="font-black text-xs uppercase tracking-widest text-slate-800">KİBRİTÇİ İNŞAAT A.Ş.</h3>
              <p className="text-[10px] text-slate-500 font-mono">ŞANTİYE RESMİ GÜVENLİK GİRİŞ KARTI</p>
            </div>

            {/* Core Card Info */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border">
                <span className="text-[9px] font-bold text-slate-500 uppercase">KART NO:</span>
                <span className="font-mono font-black text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">{activeBadgeGuest.kartNo}</span>
              </div>

              <div className="space-y-1.5 border-b pb-3">
                <p className="flex justify-between">
                  <span className="text-slate-500 font-bold text-[9px] uppercase">ZİYARETÇİ:</span>
                  <span className="font-black text-slate-800 text-[11px] uppercase">{activeBadgeGuest.adSoyad}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500 font-bold text-[9px] uppercase">TC/KİMLİK:</span>
                  <span className="font-mono text-slate-700">{activeBadgeGuest.tcNo}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500 font-bold text-[9px] uppercase">FİRMA:</span>
                  <span className="font-bold text-slate-700">{activeBadgeGuest.firma}</span>
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-[11px]">
                <p className="flex justify-between">
                  <span className="text-slate-500 font-bold text-[9px] uppercase">GÖRÜŞÜLECEK:</span>
                  <span className="font-bold text-blue-600">{activeBadgeGuest.ziyaretEdilen}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500 font-bold text-[9px] uppercase">GİRİŞ SAATİ:</span>
                  <span className="font-mono text-slate-600">{new Date(activeBadgeGuest.girisZamani).toLocaleTimeString('tr-TR')}</span>
                </p>
              </div>
            </div>

            {/* Fake Barcode visualization */}
            <div className="flex flex-col items-center justify-center py-2 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <Barcode size={32} className="text-slate-750 stroke-[1.2]" />
              <span className="text-[8px] font-mono tracking-[4px] text-slate-500 uppercase">{activeBadgeGuest.kartNo}</span>
            </div>

            {/* Actions */}
            <div className="flex space-x-2 pt-2 text-xs">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 bg-slate-50 hover:bg-slate-800 active:scale-95 text-white font-black py-2 rounded-xl border-b-2 border-slate-950 cursor-pointer flex items-center justify-center space-x-1"
              >
                <Printer size={12} />
                <span>Yazdır</span>
              </button>
              
              <button
                onClick={() => setActiveBadgeGuest(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-4 py-2 rounded-xl border"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );

  if (!isStandalone && viewMode === 'mobile') {
    return (
      <div className="flex-1 bg-white flex justify-center py-6 px-4 overflow-hidden min-h-screen">
        <div className="w-full max-w-[420px] h-[720px] max-h-[82vh] bg-slate-50 rounded-[3rem] border-[10px] border-slate-200 shadow-2xl overflow-hidden flex flex-col relative">
          {/* Notch / Dynamic Island */}
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-800 mr-2"></div>
            <div className="w-10 h-0.5 bg-slate-50 rounded"></div>
          </div>
          <div className="flex-grow flex flex-col overflow-hidden pt-4">
            {mainLayout}
          </div>
        </div>
      </div>
    );
  }

  return mainLayout;
};
