import React, { useState, useEffect } from 'react';
import { 
  Calendar, CheckCircle, XCircle, Users, ClipboardCheck, 
  MapPin, Camera, Sparkles, Undo2, ChevronRight, User, 
  Info, Smartphone, Monitor, Search, PlusCircle, Trash2, 
  FileSignature, Briefcase, RefreshCw, Send, Image as ImageIcon,
  Check, X, FileText, UserPlus, Upload, ShieldCheck, Edit2, ArrowLeft
} from 'lucide-react';
import { Personel, AylikYoklamaMap, YoklamaDurum, SahaFaaliyeti as SahaFaaliyetiType } from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface FormenScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  setYoklamalar: React.Dispatch<React.SetStateAction<AylikYoklamaMap>>;
  sahaFaaliyetleri: SahaFaaliyetiType[];
  setSahaFaaliyetleri: (updater: SahaFaaliyetiType[] | ((s: SahaFaaliyetiType[]) => SahaFaaliyetiType[])) => void;
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  kullanicilar?: any[];
}

export const FormenScreen: React.FC<FormenScreenProps> = ({
  personeller,
  yoklamalar,
  setYoklamalar,
  sahaFaaliyetleri,
  setSahaFaaliyetleri,
  currentUser,
  onSignOut,
  isStandalone,
  kullanicilar = []
}) => {
  // Mobile Frame simulation toggle
  const [isMobileFrame, setIsMobileFrame] = useState(true);
  
  // Real mobile detection (screen width < 768px or isStandalone)
  const [isRealMobile, setIsRealMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsRealMobile(window.innerWidth < 768 || isStandalone === true);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isStandalone]);

  // Active Tab: 'yoklama' | 'saha_faaliyet' | 'faaliyet_gecmis' | 'personel_giris' | 'personel_listesi' | 'toplu_puantaj'
  const [activeTab, setActiveTab] = useState<'yoklama' | 'saha_faaliyet' | 'faaliyet_gecmis' | 'personel_giris' | 'personel_listesi' | 'toplu_puantaj'>('yoklama');

  // Selected cell state for bulk weekly puantaj
  const [selectedCell, setSelectedCell] = useState<{
    personelId: string;
    personelName: string;
    date: Date;
    currentDurum: YoklamaDurum;
    currentMesai: number;
  } | null>(null);

  // Helper to match current user to a personnel record
  const matchUserToPersonel = () => {
    if (!currentUser) return null;
    const emailLower = currentUser.email?.toLowerCase();
    const nameLower = (currentUser.displayName || currentUser.ad || '').toLowerCase();
    
    if (emailLower) {
      const match = personeller.find(p => p.eposta?.toLowerCase() === emailLower);
      if (match) return match;
    }
    if (nameLower) {
      const match = personeller.find(p => `${p.ad} ${p.soyad}`.toLowerCase() === nameLower);
      if (match) return match;
    }
    return null;
  };

  // Helper to log action to matched personnel's history
  const logActionToPersonelHistory = async (islem: string, detay: string) => {
    const p = matchUserToPersonel();
    if (!p) return;
    
    const updatedGecmis = p.gecmis ? [...p.gecmis] : [];
    updatedGecmis.unshift({
      id: `log_${Date.now()}`,
      tarih: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      islem,
      detay
    });
    
    if (updatedGecmis.length > 50) updatedGecmis.pop();
    
    try {
      const docRef = doc(db, 'personeller', p.id);
      await setDoc(docRef, { ...p, gecmis: updatedGecmis });
    } catch (error) {
      console.error('Error logging to personnel history:', error);
    }
  };

  // Selected Date - Defaults to today's date in Turkey time
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    return localToday.toISOString().split('T')[0];
  });

  // Parsed date components
  const [year, month, day] = selectedDate.split('-').map(Number);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // 1. YOKLAMA LOCAL WORKSPACE STATE
  // To make the flow tactile, we hold the unsaved changes for the selectedDate in local state first
  // and commit with "Save & Digital Signature"
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  const [mesaiSaatleri, setMesaiSaatleri] = useState<Record<string, number>>({});
  const [spotlightMesai, setSpotlightMesai] = useState<string>('0');

  // 2. SAHA FAALİYETİ STATE
  const [isNiteligi, setIsNiteligi] = useState('');
  const [parsel, setParsel] = useState('Parsel Bölge 157/46');
  const [blok, setBlok] = useState('GENEL SAHA');
  const [aciklama, setAciklama] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [faaliyetPersonelIds, setFaaliyetPersonelIds] = useState<string[]>([]);
  const [sahaUstaSayisi, setSahaUstaSayisi] = useState<number>(0);
  const [sahaIsciSayisi, setSahaIsciSayisi] = useState<number>(0);

  // 3. PERSONEL GİRİŞE YOLLA STATE
  const [yeniAd, setYeniAd] = useState('');
  const [yeniSoyad, setYeniSoyad] = useState('');
  const [yeniGorev, setYeniGorev] = useState('');
  const [yeniKimlikFoto, setYeniKimlikFoto] = useState<string | null>(null);
  const [personelGirisListesi, setPersonelGirisListesi] = useState<any[]>([]);

  // 4. FAALİYET EDİT & SEARCH STATES
  const [faaliyetSearchKeyword, setFaaliyetSearchKeyword] = useState('');
  const [editingFaaliyet, setEditingFaaliyet] = useState<SahaFaaliyetiType | null>(null);
  const [lastDeletedFaaliyet, setLastDeletedFaaliyet] = useState<SahaFaaliyetiType | null>(null);

  // 5. FİİLİ GÜNLÜK RAPOR STATES
  const [havaDurumu, setHavaDurumu] = useState('Güneşli');
  const [genelNotlar, setGenelNotlar] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [gunlukRaporlar, setGunlukRaporlar] = useState<Record<string, any>>({});

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // New States for Personel Listesi, İşten Çıkış, ve Güncelleme
  const [sonGirisTalebi, setSonGirisTalebi] = useState<{ ad: string; soyad: string; gorev: string; id: string } | null>(null);
  const [personelSearchKeyword, setPersonelSearchKeyword] = useState('');
  const [selectedPersonelForDetail, setSelectedPersonelForDetail] = useState<any | null>(null);
  const [showCikisForm, setShowCikisForm] = useState(false);
  const [cikisTarihi, setCikisTarihi] = useState(new Date().toISOString().slice(0, 10));
  const [cikisNedeni, setCikisNedeni] = useState('');
  const [cikisYoneticiRole, setCikisYoneticiRole] = useState<'MUHASEBE' | 'İDARİ_İŞLER' | 'ŞANTİYE_ŞEFİ'>('MUHASEBE');
  const [showGuncellemeForm, setShowGuncellemeForm] = useState(false);
  const [guncelAd, setGuncelAd] = useState('');
  const [guncelSoyad, setGuncelSoyad] = useState('');
  const [guncelGorev, setGuncelGorev] = useState('');
  const [guncelTelefon, setGuncelTelefon] = useState('');
  const [guncelIban, setGuncelIban] = useState('');
  const [guncelBanka, setGuncelBanka] = useState('');
  const [guncellemeNedeni, setGuncellemeNedeni] = useState('');
  const [isCikisTalepleriList, setIsCikisTalepleriList] = useState<any[]>([]);
  const [isGuncellemeTalepleriList, setIsGuncellemeTalepleriList] = useState<any[]>([]);
  const [isGunuTamamlandi, setIsGunuTamamlandi] = useState(false);

  // Quick select lists
  const isNitelikleriList = [
    'Beton Dökümü',
    'Demir Bağlama',
    'Kalıp Çakımı',
    'Tuğla / Duvar Örümü',
    'İnce Alçı / Sıva',
    'Şap Dökümü',
    'Elektrik Tesisat Kablolama',
    'Sıhhi Tesisat Borulama',
    'Dış Cephe İskele / Mantolama',
    'Hafriyat ve Çevre Düzenleme'
  ];

  const PARSEL_BLOK_MAP: Record<string, string[]> = {
    "GENEL SAHA": [],
    "Parsel Bölge 157/46": ["GENEL SAHA", "A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2", "F1", "F2", "G", "H", "I"],
    "Parsel Bölge 157/51": ["GENEL SAHA", "A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "C4"],
    "Parsel Bölge 160/2":  ["GENEL SAHA", "A1A", "A1B", "A2A", "A2B", "B1", "B2", "C1", "C2", "C3", "C4", "B3"]
  };

  const parsellerList = Object.keys(PARSEL_BLOK_MAP);

  // Automatically filter personnel active on selectedDate
  const getActivePersonnelForDate = () => {
    return personeller.filter(p => {
      const isAktif = p.durum === true || String(p.durum).toLowerCase() === 'true';
      if (p.iseGirisTarihi) {
        if (p.iseGirisTarihi > selectedDate) return false;
      }
      if (p.istenCikisTarihi) {
        if (p.istenCikisTarihi < selectedDate) return false;
      } else if (!isAktif) {
        return false;
      }
      return true;
    });
  };

  const activeStaff = getActivePersonnelForDate();

  // Get start of the week (Monday) based on selectedDate
  const getDaysOfWeek = () => {
    const current = new Date(selectedDate);
    const dayOfWeek = current.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is sunday
    const startOfWeek = new Date(current.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(startOfWeek);
      nextDay.setDate(startOfWeek.getDate() + i);
      days.push(nextDay);
    }
    return days;
  };

  // Handlers for Personel Listesi, Günü Tamamla & Onay Talepleri
  const handleGunuTamamla = async () => {
    if (isGunuTamamlandi) {
      alert("Bugün zaten tamamlanmış olarak işaretlendi.");
      return;
    }

    if (!window.confirm(`${selectedDate.split('-').reverse().join('.')} tarihli iş gününü tamamlamak ve tüm raporların, puantaj kontrollerinin yapıldığını ana programa bildirmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const docId = `RAPOR-TAMAM-${selectedDate}-${currentUser?.email?.replace(/[@.]/g, '-')}`;
      await setDoc(doc(db, 'formenGunlukRaporlar', docId), {
        tarih: selectedDate,
        formen: currentUser?.email || 'Bilinmeyen Formen',
        tamamlamaTarihi: new Date().toISOString(),
        durum: 'TAMAMLANDI',
        notlar: "Formen günü tamamladı, puantaj ve saha raporları onaylandı.",
        hazirlayan: currentUser?.displayName || 'Sahadaki Formen'
      });
      await logActionToPersonelHistory('Günü Tamamladı', `${selectedDate.split('-').reverse().join('.')} tarihli iş gününü başarıyla tamamladı ve onay için ana programa bildirdi.`);
      alert("🎉 Şantiye iş günü başarıyla tamamlandı ve ana programa bildirildi!");
    } catch (err) {
      console.error(err);
      alert("Günü tamamlama kaydı oluşturulurken bir hata oluştu.");
    }
  };

  const handleSaveCikisTalebi = async () => {
    if (!cikisNedeni.trim()) {
      alert("Lütfen işten çıkış nedenini yazınız.");
      return;
    }
    try {
      const docId = `CIKIS-${Date.now()}`;
      await setDoc(doc(db, 'personelCikisTalepleri', docId), {
        id: docId,
        personelId: selectedPersonelForDetail.id,
        personelIsim: `${selectedPersonelForDetail.ad} ${selectedPersonelForDetail.soyad}`,
        personelGorev: selectedPersonelForDetail.gorev || '',
        personelMaas: selectedPersonelForDetail.netMaas || selectedPersonelForDetail.maas || 0,
        cikisTarihi,
        cikisNedeni,
        hedefYoneticiRole: cikisYoneticiRole,
        durum: 'BEKLEMEDE',
        tarih: new Date().toISOString(),
        gonderenFormen: currentUser?.email || 'Bilinmeyen Formen'
      });
      await logActionToPersonelHistory('İşten Çıkış Talebi Yolladı', `${selectedPersonelForDetail.ad} ${selectedPersonelForDetail.soyad} isimli personel için işten çıkış talebi oluşturdu. Gerekçe: ${cikisNedeni}`);
      alert(`🎉 İşten çıkarma talebi oluşturuldu ve ${cikisYoneticiRole} onayına gönderildi.`);
      setCikisNedeni('');
      setShowCikisForm(false);
      setSelectedPersonelForDetail(null);
    } catch (err) {
      console.error(err);
      alert("Talep gönderilemedi. Lütfen bağlantınızı kontrol edin.");
    }
  };

  const handleSaveGuncellemeTalebi = async () => {
    if (!guncellemeNedeni.trim()) {
      alert("Lütfen güncelleme gerekçesini/nedenini yazınız.");
      return;
    }
    try {
      const docId = `GUNCELLEME-${Date.now()}`;
      await setDoc(doc(db, 'personelGuncellemeTalepleri', docId), {
        id: docId,
        personelId: selectedPersonelForDetail.id,
        eskiBilgiler: {
          ad: selectedPersonelForDetail.ad,
          soyad: selectedPersonelForDetail.soyad,
          gorev: selectedPersonelForDetail.gorev || '',
          telefon: selectedPersonelForDetail.telefon || '',
          ibanNo: selectedPersonelForDetail.ibanNo || '',
          bankaAdi: selectedPersonelForDetail.bankaAdi || ''
        },
        yeniBilgiler: {
          ad: guncelAd,
          soyad: guncelSoyad,
          gorev: guncelGorev,
          telefon: guncelTelefon,
          ibanNo: guncelIban,
          bankaAdi: guncelBanka
        },
        guncellemeNedeni,
        durum: 'BEKLEMEDE',
        tarih: new Date().toISOString(),
        gonderenFormen: currentUser?.email || 'Bilinmeyen Formen'
      });
      await logActionToPersonelHistory('Bilgi Güncelleme Talebi Yolladı', `${selectedPersonelForDetail.ad} ${selectedPersonelForDetail.soyad} isimli personel için bilgi güncelleme talebi oluşturdu. Gerekçe: ${guncellemeNedeni}`);
      alert(`🎉 Personel bilgi güncelleme talebi başarıyla oluşturuldu ve yöneticilere iletildi.`);
      setGuncellemeNedeni('');
      setShowGuncellemeForm(false);
      setSelectedPersonelForDetail(null);
    } catch (err) {
      console.error(err);
      alert("Talep gönderilemedi. Lütfen bağlantınızı kontrol edin.");
    }
  };

  const openGuncellemeForm = (p: any) => {
    setGuncelAd(p.ad || '');
    setGuncelSoyad(p.soyad || '');
    setGuncelGorev(p.gorev || '');
    setGuncelTelefon(p.telefon || '');
    setGuncelIban(p.ibanNo || p.iban || '');
    setGuncelBanka(p.bankaAdi || p.banka || '');
    setGuncellemeNedeni('');
    setShowGuncellemeForm(true);
    setShowCikisForm(false);
  };

  // Load saved attendance for the selected date on load or date change
  useEffect(() => {
    const present: string[] = [];
    const absent: string[] = [];
    const localMesai: Record<string, number> = {};

    activeStaff.forEach(p => {
      const pMap = yoklamalar[p.id] || {};
      const dayData = pMap[day];
      if (dayData) {
        if (dayData.durum === 'Geldi') {
          present.push(p.id);
        } else if (dayData.durum === 'Yok') {
          absent.push(p.id);
        }
        localMesai[p.id] = dayData.mesaiSaati || 0;
      } else {
        localMesai[p.id] = 0;
      }
    });

    setPresentIds(present);
    setAbsentIds(absent);
    setMesaiSaatleri(localMesai);
    
    // Automatically pre-fill active activities staff with currently marked present staff
    setFaaliyetPersonelIds(present);
  }, [selectedDate, yoklamalar, personeller]);

  // Load and subscribe to Personnel entry requests from Firestore
  useEffect(() => {
    const coll = collection(db, 'personelGirisTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort by date descending
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setPersonelGirisListesi(list);
    });
    return () => unsubscribe();
  }, []);

  // Load and subscribe to exit requests
  useEffect(() => {
    const coll = collection(db, 'personelCikisTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setIsCikisTalepleriList(list);
    });
    return () => unsubscribe();
  }, []);

  // Load and subscribe to update requests
  useEffect(() => {
    const coll = collection(db, 'personelGuncellemeTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setIsGuncellemeTalepleriList(list);
    });
    return () => unsubscribe();
  }, []);

  // Check if day is marked completed
  useEffect(() => {
    const coll = collection(db, 'formenGunlukRaporlar');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      let completed = false;
      snapshot.forEach((doc) => {
        const d = doc.data();
        if (d.tarih === selectedDate && d.formen?.toLowerCase() === currentUser?.email?.toLowerCase() && d.durum === 'TAMAMLANDI') {
          completed = true;
        }
      });
      setIsGunuTamamlandi(completed);
    });
    return () => unsubscribe();
  }, [selectedDate, currentUser]);

  // Load and subscribe to Daily Field Reports
  useEffect(() => {
    const coll = collection(db, 'gunlukSahaRaporlari');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const reports: Record<string, any> = {};
      snapshot.forEach((doc) => {
        reports[doc.id] = doc.data();
      });
      setGunlukRaporlar(reports);
      
      const existing = reports[`report_${selectedDate}`];
      if (existing) {
        setHavaDurumu(existing.havaDurumu || 'Güneşli');
        setGenelNotlar(existing.genelNotlar || '');
      } else {
        setHavaDurumu('Güneşli');
        setGenelNotlar('');
      }
    });
    return () => unsubscribe();
  }, [selectedDate]);

  // Derived sets
  const remainingStaff = activeStaff.filter(p => !presentIds.includes(p.id) && !absentIds.includes(p.id));
  const filteredRemaining = remainingStaff.filter(p => 
    `${p.ad} ${p.soyad}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.gorev.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Spotlight staff (the first unmarked employee in the pile)
  const spotlightStaff = filteredRemaining[0] || null;

  // Actions
  const handleMarkPresent = (id: string, mesai: number = 0) => {
    setPresentIds(prev => [...prev.filter(x => x !== id), id]);
    setAbsentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: mesai }));
  };

  const handleMarkAbsent = (id: string) => {
    setAbsentIds(prev => [...prev.filter(x => x !== id), id]);
    setPresentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: 0 }));
  };

  const handleResetMark = (id: string) => {
    setPresentIds(prev => prev.filter(x => x !== id));
    setAbsentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleMarkAllPresent = () => {
    const unmarkedIds = remainingStaff.map(p => p.id);
    setPresentIds(prev => [...prev, ...unmarkedIds]);
    setAbsentIds(prev => prev.filter(id => !unmarkedIds.includes(id)));
    const copy = { ...mesaiSaatleri };
    unmarkedIds.forEach(id => {
      copy[id] = 0;
    });
    setMesaiSaatleri(copy);
  };

  // Digital Signature Save
  const handleSaveYoklama = () => {
    // Save to the main yoklamalar map
    setYoklamalar(prev => {
      const next = { ...prev };
      const gonderenYazar = currentUser?.displayName || (currentUser?.ad ? `${currentUser.ad} ${currentUser.soyad || ''}` : '') || 'FORMEN';
      
      activeStaff.forEach(p => {
        const pMap = next[p.id] ? { ...next[p.id] } : {};
        const dayData = pMap[day] || { durum: 'Girilmedi', mesaiSaati: 0 };

        if (presentIds.includes(p.id)) {
          pMap[day] = { ...dayData, durum: 'Geldi', mesaiSaati: mesaiSaatleri[p.id] || 0, gonderen: gonderenYazar };
        } else if (absentIds.includes(p.id)) {
          pMap[day] = { ...dayData, durum: 'Yok', mesaiSaati: 0, gonderen: gonderenYazar };
        } else {
          pMap[day] = { ...dayData, durum: 'Girilmedi', mesaiSaati: 0 };
        }

        next[p.id] = pMap;
      });

      return next;
    });

    showStatus('success', `📅 ${selectedDate} Tarihli Yoklama ve Mesai Saatleri, Formen imzasıyla başarıyla sisteme kaydedildi ve ana programa gönderildi!`);
  };

  // Quick status helper
  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 5000);
  };

  // Quick date modifiers
  const handleSetQuickDate = (daysOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const offset = d.getTimezoneOffset();
    const localD = new Date(d.getTime() - (offset * 60 * 1000));
    setSelectedDate(localD.toISOString().split('T')[0]);
  };

  // Image capture simulation
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const rawBase64 = event.target.result as string;
          const compressed = await compressImage(rawBase64);
          setFotoUrl(compressed);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Saha Faaliyeti
  const handleSaveFaaliyet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNiteligi) {
      showStatus('error', 'Lütfen iş niteliğini giriniz veya şablondan seçiniz!');
      return;
    }

    const newFaaliyet: SahaFaaliyetiType = {
      id: `sf_${Date.now()}`,
      personelId: currentUser?.uid || 'formen_uid', // Logged in foreman
      tarih: selectedDate,
      isNiteligi,
      parsel,
      blok,
      aciklama,
      fotoUrl: fotoUrl || undefined,
      ustaSayisi: sahaUstaSayisi,
      isciSayisi: sahaIsciSayisi
    };

    setSahaFaaliyetleri(prev => [newFaaliyet, ...prev]);
    logActionToPersonelHistory('Saha Faaliyeti Ekledi', `"${isNiteligi}" iş niteliğiyle, ${parsel} / ${blok} bölgesinde yeni saha imalat faaliyeti kaydetti.`);
    showStatus('success', '🧱 Saha faaliyeti başarıyla kaydedildi ve şantiye günlük raporuna eklendi!');
    
    // Reset form fields
    setIsNiteligi('');
    setAciklama('');
    setFotoUrl(null);
    setSahaUstaSayisi(0);
    setSahaIsciSayisi(0);
  };

  const handleSaveGunlukRapor = async () => {
    const reportId = `report_${selectedDate}`;
    const dayActivities = sahaFaaliyetleri.filter(f => f.tarih === selectedDate);
    const presentStaffNames = activeStaff
      .filter(p => presentIds.includes(p.id))
      .map(p => `${p.ad} ${p.soyad} (${p.gorev})`);

    const reportData = {
      id: reportId,
      tarih: selectedDate,
      havaDurumu,
      genelNotlar,
      gonderen: currentUser?.displayName || (currentUser?.ad ? `${currentUser.ad} ${currentUser.soyad || ''}` : '') || 'FORMEN',
      toplamEkip: presentIds.length,
      faaliyetler: dayActivities,
      yoklama: presentStaffNames,
      onayDurumu: 'BEKLİYOR',
      guncellenmeTarihi: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'gunlukSahaRaporlari', reportId), reportData);
      showStatus('success', '📄 Fiili Günlük Rapor başarıyla kaydedildi ve ana programa gönderildi!');
      setShowPdfPreview(false);
    } catch (err: any) {
      showStatus('error', 'Rapor kaydedilirken hata oluştu: ' + err.message);
    }
  };

  return (
    <div className={
      isRealMobile 
        ? "w-full h-full flex flex-col bg-slate-50 font-sans select-none overflow-hidden"
        : "flex-grow p-4 h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans bg-slate-100 select-none"
    }>
      
      {/* Simulation Toggle Bar - Top */}
      {!isRealMobile && (
        <div className="mb-4 bg-white p-3 rounded-2xl shadow-xs border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="text-lg">👷</span>
            <div>
              <h2 className="text-xs font-black text-slate-900 tracking-wide">FORMEN MOBİL SAHA PANELİ</h2>
              <p className="text-[10px] text-slate-500 font-medium">Sahadan anlık yoklama alma ve günlük faaliyet raporlama ekranı</p>
            </div>
          </div>
          
          {/* Toggle Mode */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setIsMobileFrame(true)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition duration-150 cursor-pointer ${
                isMobileFrame ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone size={12} />
              <span>Mobil Görünüm</span>
            </button>
            <button
              onClick={() => setIsMobileFrame(false)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition duration-150 cursor-pointer ${
                !isMobileFrame ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor size={12} />
              <span>Geniş Ekran</span>
            </button>
          </div>
        </div>
      )}

      {/* Banner message overlay */}
      {statusMessage && (
        <div className={`fixed top-16 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-11/12 p-3.5 rounded-2xl shadow-xl flex items-center space-x-3 text-xs font-bold border transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-850' 
            : 'bg-rose-50 border-rose-200 text-rose-850'
        }`}>
          <span>{statusMessage.type === 'success' ? '✅' : '❌'}</span>
          <div className="flex-1">{statusMessage.text}</div>
        </div>
      )}

      {/* Primary Layout */}
      <div className={isRealMobile ? "flex-1 flex flex-col overflow-hidden" : "flex-1 flex justify-center items-start overflow-hidden"}>
        
        {/* The Frame Wrapper */}
        <div className={
          isRealMobile 
            ? "w-full h-full flex flex-col overflow-hidden bg-slate-50"
            : `transition-all duration-300 ${
                isMobileFrame 
                  ? 'w-full max-w-[390px] h-[720px] bg-slate-950 rounded-[48px] p-3.5 border-[8px] border-slate-900 shadow-2xl relative flex flex-col overflow-hidden' 
                  : 'w-full h-full bg-white border rounded-3xl shadow-xs flex flex-col overflow-hidden'
              }`
        }>
          
          {/* Simulated phone Notch */}
          {!isRealMobile && isMobileFrame && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-50 flex items-center justify-center">
              <div className="w-12 h-1 bg-slate-800 rounded-full" />
              <div className="w-2.5 h-2.5 bg-slate-800 rounded-full ml-3" />
            </div>
          )}

          {/* Simulated phone inner screen */}
          <div className={`flex-1 flex flex-col bg-slate-50 text-slate-800 relative overflow-hidden ${
            (!isRealMobile && isMobileFrame) ? 'rounded-[34px] pt-4' : ''
          }`}>
            
            {/* Mobile Header */}
            <div className="bg-slate-900 text-white p-4 pt-5 pb-4 space-y-3 shrink-0 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center text-slate-900 font-bold text-xs">
                    K
                  </div>
                  <div>
                    <h3 className="text-xs font-black tracking-wide font-display text-amber-400">KİBRİTÇİ SAHA</h3>
                    <p className="text-[8px] text-slate-400 font-mono tracking-tighter uppercase">Kullanıcı: FORMEN</p>
                  </div>
                </div>
                
                {/* Active Date and Logout button row */}
                <div className="flex items-center space-x-1.5">
                  <div className="bg-slate-800 border border-slate-700 rounded-xl py-1 px-2.5 flex items-center space-x-1.5">
                    <Calendar size={10} className="text-amber-400" />
                    <span className="text-[10px] font-mono font-bold tracking-tight text-gray-200">
                      {selectedDate.split('-').reverse().join('.')}
                    </span>
                  </div>
                  
                  {onSignOut && (
                    <button 
                      onClick={onSignOut}
                      className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-[9px] py-1 px-2 rounded-lg transition cursor-pointer"
                    >
                      Çıkış
                    </button>
                  )}
                </div>
              </div>

              {/* Quick day buttons */}
              <div className="flex gap-1.5">
                <button 
                  onClick={() => handleSetQuickDate(-1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-[9px] font-bold py-1 px-1 rounded-lg text-slate-300 transition"
                >
                  ◀ Dün
                </button>
                <button 
                  onClick={() => handleSetQuickDate(0)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-[9px] font-extrabold py-1 px-1 rounded-lg text-slate-950 transition"
                >
                  Bugün
                </button>
                <button 
                  onClick={() => handleSetQuickDate(1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-[9px] font-bold py-1 px-1 rounded-lg text-slate-300 transition"
                >
                  Yarın ▶
                </button>
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-800 text-white border-0 py-0.5 px-1 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-amber-500 outline-none max-w-[28px] cursor-pointer"
                  title="Başka Tarih Seç"
                />
              </div>

              {/* Segmented control tabs */}
              <div className="grid grid-cols-6 gap-0.5 bg-slate-950 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('yoklama')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'yoklama' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ClipboardCheck size={11} className="mb-0.5" />
                  <span>Yoklama Al</span>
                </button>
                <button
                  onClick={() => setActiveTab('toplu_puantaj')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'toplu_puantaj' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar size={11} className="mb-0.5" />
                  <span>Toplu Puantaj</span>
                </button>
                <button
                  onClick={() => setActiveTab('saha_faaliyet')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'saha_faaliyet' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MapPin size={11} className="mb-0.5" />
                  <span>Saha Raporu</span>
                </button>
                <button
                  onClick={() => setActiveTab('faaliyet_gecmis')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'faaliyet_gecmis' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText size={11} className="mb-0.5" />
                  <span>Rapor Arşivi</span>
                </button>
                <button
                  onClick={() => setActiveTab('personel_giris')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'personel_giris' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus size={11} className="mb-0.5" />
                  <span>Girişe Yolla</span>
                </button>
                <button
                  onClick={() => setActiveTab('personel_listesi')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'personel_listesi' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users size={11} className="mb-0.5" />
                  <span>Personeller</span>
                </button>
              </div>
            </div>

            {/* Inner Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-8">
              
              {/* TAB 1: YOKLAMA ALMA PANELİ */}
              {activeTab === 'yoklama' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  
                  {/* Status Indicator stats bar */}
                  <div className="bg-white p-2.5 rounded-2xl border border-slate-200/60 shadow-xs grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50/50 p-1.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold block">Havuz (Kalan)</span>
                      <strong className="text-sm font-black text-blue-600 block">{remainingStaff.length}</strong>
                    </div>
                    <div className="bg-emerald-50/50 p-1.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold block">Present (Geldi)</span>
                      <strong className="text-sm font-black text-emerald-600 block">{presentIds.length}</strong>
                    </div>
                    <div className="bg-rose-50/50 p-1.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold block">Absent (Yok)</span>
                      <strong className="text-sm font-black text-rose-600 block">{absentIds.length}</strong>
                    </div>
                  </div>

                  {/* 1. THE SPOTLIGHT SINGLE STAFF CARD FOR EXTREME TACTILE SPEED */}
                  {spotlightStaff ? (
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-4 shadow-md border border-slate-800 space-y-3 relative overflow-hidden">
                      
                      {/* Decorative tag */}
                      <span className="absolute top-2 right-2 bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase">
                        Sıradaki Personel
                      </span>

                      <div className="flex items-center space-x-3 pt-1">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-lg uppercase shadow-inner shrink-0">
                          {spotlightStaff.ad.substring(0, 1)}{spotlightStaff.soyad.substring(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs tracking-wide text-gray-100 truncate">
                            {spotlightStaff.ad} {spotlightStaff.soyad}
                          </h4>
                          <p className="text-[9px] text-slate-400 font-mono font-medium tracking-tight mt-0.5">
                            💼 {spotlightStaff.departman} / {spotlightStaff.gorev}
                          </p>
                          <p className="text-[8px] text-slate-500 font-sans tracking-tight mt-0.5">
                            Baba Adı: {spotlightStaff.babaAdi || '-'} • TC: {spotlightStaff.tcNo?.substring(0, 4)}***
                          </p>
                        </div>
                      </div>

                      {/* Mesai Saati ve Eylem Butonları */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5">
                          <label className="text-[9px] font-bold text-slate-400 tracking-wider">İLAVE MESAİ (SAAT):</label>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => setSpotlightMesai(m => Math.max(0, Number(m) - 1).toString())}
                              className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-black text-xs hover:bg-slate-750 active:scale-90"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="12"
                              value={spotlightMesai}
                              onChange={(e) => setSpotlightMesai(e.target.value)}
                              className="w-9 bg-slate-950 border border-slate-800 text-center font-black text-amber-400 text-xs py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setSpotlightMesai(m => Math.min(12, Number(m) + 1).toString())}
                              className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-black text-xs hover:bg-slate-750 active:scale-90"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          {/* GELDİ (Green Button) */}
                          <button
                            onClick={() => {
                              handleMarkPresent(spotlightStaff.id, Number(spotlightMesai || 0));
                              setSpotlightMesai('0');
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-black py-3 px-3 rounded-2xl transition shadow-lg flex flex-col items-center justify-center space-y-1 cursor-pointer border-b-4 border-emerald-700"
                          >
                            <CheckCircle size={16} />
                            <span className="text-[10px] tracking-wider uppercase">GELDİ</span>
                            <span className="text-[7px] text-emerald-950 font-bold opacity-80">(Buradayım Dedi)</span>
                          </button>

                          {/* YOK (Red Button) */}
                          <button
                            onClick={() => {
                              handleMarkAbsent(spotlightStaff.id);
                              setSpotlightMesai('0');
                            }}
                            className="bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-black py-3 px-3 rounded-2xl transition shadow-lg flex flex-col items-center justify-center space-y-1 cursor-pointer border-b-4 border-rose-700"
                          >
                            <XCircle size={16} />
                            <span className="text-[10px] tracking-wider uppercase">YOK</span>
                            <span className="text-[7px] text-rose-100 font-medium opacity-80">(Sahada Yok)</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4 text-center space-y-2">
                      <span className="text-2xl block">🎉</span>
                      <h4 className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">TÜM LİSTE TAMAMLANDI!</h4>
                      <p className="text-[10px] text-slate-600">
                        Aktif {activeStaff.length} personelin tamamı işaretlendi. Değişiklikleri onaylayıp kaydetmek için aşağıdaki dijital imzayı vurun.
                      </p>
                    </div>
                  )}

                  {/* 2. SEARCH & LIST FOR MANUAL QUICK TAP / ALTERNATE INTERFACE */}
                  <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">Alternatif Personel Listesi</span>
                      {remainingStaff.length > 0 && (
                        <button 
                          onClick={handleMarkAllPresent}
                          className="text-emerald-600 hover:text-emerald-700 font-extrabold text-[8px] uppercase tracking-wider block cursor-pointer"
                        >
                          ✓ Kalanları Geldi Yap
                        </button>
                      )}
                    </div>

                    {/* Compact Search */}
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Personel adı veya görev ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-1.5 pl-8 pr-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold text-slate-700"
                      />
                      {searchQuery && (
                        <button 
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-2 text-[9px] font-bold text-slate-400 hover:text-slate-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Unmarked list table view */}
                    <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-slate-100 pr-1">
                      {filteredRemaining.length === 0 ? (
                        <p className="text-[9px] text-slate-400 italic text-center py-4">Kalan veya aranan personel bulunmuyor.</p>
                      ) : (
                        filteredRemaining.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 pt-2">
                            <div className="min-w-0">
                              <span className="font-bold text-[10px] text-slate-800 block truncate">{p.ad} {p.soyad}</span>
                              <span className="text-[8px] text-slate-400 font-medium block truncate">{p.gorev}</span>
                            </div>
                            <div className="flex space-x-1 shrink-0">
                              <button 
                                onClick={() => handleMarkPresent(p.id)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-1 rounded-lg border border-emerald-200 transition text-[9px] font-extrabold"
                                title="Geldi"
                              >
                                Geldi
                              </button>
                              <button 
                                onClick={() => handleMarkAbsent(p.id)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 p-1 rounded-lg border border-rose-200 transition text-[9px] font-extrabold"
                                title="Yok"
                              >
                                Yok
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 3. SUBMIT WITH DIGITAL SIGNATURE SECTION */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex items-center space-x-2 text-slate-800">
                      <FileSignature size={14} className="text-amber-500" />
                      <span className="font-bold text-[10px] uppercase tracking-wider">FORMEN DİJİTAL İMZA ONAYI</span>
                    </div>

                    <p className="text-[9px] text-slate-500 leading-snug">
                      Bu kayıt, şantiye müdürlüğüne dijital imzalı resmi yoklama olarak iletilecektir. İşaretli durumları kontrol ettikten sonra kilitleyin.
                    </p>

                    {/* Simulated hand signature block from user account info */}
                    <div className="border border-slate-150 rounded-2xl bg-amber-50/15 p-2.5 text-center relative overflow-hidden">
                      <div className="text-[7px] text-slate-400 uppercase tracking-widest block absolute top-1 left-2">E-İmza Sertifikası</div>
                      
                      {(() => {
                        const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
                        if (matchedUser && (matchedUser.imzaCanvas || matchedUser.imzaText)) {
                          return (
                            <div className="py-1">
                              {matchedUser.imzaCanvas ? (
                                <div className="flex justify-center my-1.5">
                                  <img src={matchedUser.imzaCanvas} alt="Dijital İmza" className="max-h-12 object-contain bg-transparent mix-blend-multiply" />
                                </div>
                              ) : (
                                <span className={`italic font-extrabold text-sm text-slate-900 block my-2 ${
                                  matchedUser.imzaStyle === 'cursive' ? 'font-serif' : 'font-mono'
                                }`}>
                                  {matchedUser.imzaText}
                                </span>
                              )}
                              <span className="text-[7.5px] font-mono tracking-wider text-slate-500 block">
                                {matchedUser.ad} {matchedUser.soyad} • {matchedUser.yetki || 'Saha Formeni'}
                              </span>
                            </div>
                          );
                        } else {
                          // Fallback
                          const nameFallback = currentUser?.displayName || currentUser?.email?.split('@')[0] || "Şantiye Formeni";
                          return (
                            <div className="py-2 transform -rotate-1">
                              <span className="font-serif italic font-extrabold text-xs text-slate-950 block">{nameFallback}</span>
                              <span className="text-[7px] font-mono tracking-widest text-slate-500 block">Saha Formen İmza Kaşesi</span>
                            </div>
                          );
                        }
                      })()}
                      
                      <div className="w-16 h-0.5 bg-amber-400/50 mx-auto rounded-full mt-0.5"></div>
                    </div>

                    <button
                      onClick={handleSaveYoklama}
                      className="w-full bg-slate-900 hover:bg-slate-950 text-white font-extrabold text-[10px] py-2.5 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <span>✍️ YOKLAMAYI İMZALA VE KAYDET</span>
                    </button>
                  </div>

                  {/* 4. MARKED HISTORY & UNDO OVERVIEW */}
                  {(presentIds.length > 0 || absentIds.length > 0) && (
                    <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">Mevcut İşaretliler ({presentIds.length + absentIds.length})</span>
                        <button
                          onClick={() => {
                            setPresentIds([]);
                            setAbsentIds([]);
                            setMesaiSaatleri({});
                          }}
                          className="text-[8px] text-rose-600 font-extrabold uppercase hover:underline"
                        >
                          Tümünü Sıfırla
                        </button>
                      </div>
                      
                      <div className="max-h-52 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-50">
                        {/* Gelenler */}
                        {presentIds.map(id => {
                          const p = personeller.find(emp => emp.id === id);
                          if (!p) return null;
                          const hrs = mesaiSaatleri[id] || 0;
                          return (
                            <div key={id} className="flex items-center justify-between py-1.5 text-[9px]">
                              <div className="min-w-0 flex-1">
                                <span className="text-emerald-700 font-bold block truncate">✓ {p.ad} {p.soyad}</span>
                                <span className="text-[7.5px] text-amber-600 font-bold">Mesai: {hrs} Saat</span>
                              </div>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                <div className="flex items-center bg-slate-100 rounded-lg px-1 py-0.5">
                                  <button
                                    onClick={() => setMesaiSaatleri(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) - 1) }))}
                                    className="w-4 h-4 bg-white text-slate-800 rounded font-black text-[9px] hover:bg-slate-200"
                                  >
                                    -
                                  </button>
                                  <span className="text-[9px] font-black mx-1.5 min-w-[8px] text-center text-slate-700">{hrs}</span>
                                  <button
                                    onClick={() => setMesaiSaatleri(prev => ({ ...prev, [id]: Math.min(12, (prev[id] || 0) + 1) }))}
                                    className="w-4 h-4 bg-white text-slate-800 rounded font-black text-[9px] hover:bg-slate-200"
                                  >
                                    +
                                  </button>
                                </div>
                                <button 
                                  onClick={() => handleResetMark(id)}
                                  className="text-slate-400 hover:text-slate-600 font-semibold text-[8px] px-1"
                                >
                                  Sıfırla
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Gelmeyenler */}
                        {absentIds.map(id => {
                          const p = personeller.find(emp => emp.id === id);
                          if (!p) return null;
                          return (
                            <div key={id} className="flex items-center justify-between py-1.5 text-[9px]">
                              <span className="text-rose-600 font-bold">✕ {p.ad} {p.soyad}</span>
                              <button 
                                onClick={() => handleResetMark(id)}
                                className="text-slate-400 hover:text-slate-600 font-semibold text-[8px] px-1"
                              >
                                Sıfırla
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* TAB 2: SAHA FAALİYETİ RAPORLAMA FORM */}
              {activeTab === 'saha_faaliyet' && (
                <>
                  <form onSubmit={handleSaveFaaliyet} className="space-y-3.5 animate-in fade-in duration-150">
                  
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    
                    {/* Header */}
                    <div className="flex items-center space-x-2 text-slate-950">
                      <Briefcase size={14} className="text-amber-500" />
                      <span className="font-bold text-[10px] uppercase tracking-wider">GÜNLÜK SAHA FAALİYET GİRİŞİ</span>
                    </div>

                    {/* İş Niteliği */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">İş Niteliği (Nitelik Seçimi)</label>
                      <input 
                        type="text"
                        placeholder="Örn: Blok 3 Duvar Örümü"
                        value={isNiteligi}
                        onChange={(e) => setIsNiteligi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold text-slate-800"
                        required
                      />

                      {/* Quick Select Quick Buttons */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {isNitelikleriList.slice(0, 5).map(it => (
                          <button
                            type="button"
                            key={it}
                            onClick={() => setIsNiteligi(it)}
                            className={`py-1 px-2 rounded-lg text-[8px] font-bold border transition ${
                              isNiteligi === it 
                                ? 'bg-amber-100 border-amber-300 text-slate-900' 
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                          >
                            {it}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Parsel & Blok row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Saha Parseli</label>
                        <select
                          value={parsel}
                          onChange={(e) => {
                            const selectedParsel = e.target.value;
                            setParsel(selectedParsel);
                            const associatedBloks = PARSEL_BLOK_MAP[selectedParsel] || [];
                            setBlok(associatedBloks[0] || 'GENEL SAHA');
                          }}
                          className="w-full bg-slate-50 border border-slate-200 p-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-bold text-slate-800"
                        >
                          {parsellerList.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">İlgili Blok</label>
                        <select
                          value={blok}
                          onChange={(e) => setBlok(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 p-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-bold text-slate-800"
                        >
                          {(PARSEL_BLOK_MAP[parsel] || []).length === 0 ? (
                            <option value="GENEL SAHA">GENEL SAHA</option>
                          ) : (
                            (PARSEL_BLOK_MAP[parsel] || []).map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Açıklama */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Faaliyet Detay / Açıklama</label>
                      <textarea
                        rows={3}
                        placeholder="Bugün yürütülen imalat detaylarını, dökülen beton metrajını veya ek notlarınızı buraya yazın..."
                        value={aciklama}
                        onChange={(e) => setAciklama(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold text-slate-800 leading-snug"
                      />
                    </div>

                    {/* Photo upload / camera */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Saha Fotoğrafı (Anlık Çekim / Yükleme)</label>
                      
                      <div className="flex items-center space-x-3">
                        <label className="bg-slate-100 hover:bg-slate-200 border-2 border-dashed border-slate-300 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition w-24 h-20 shrink-0 text-slate-500 hover:text-slate-800">
                          <Camera size={20} />
                          <span className="text-[8px] font-bold mt-1 text-center leading-none">Fotoğraf Ekle</span>
                          <input 
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                        </label>

                        {/* Photo Preview */}
                        <div className="flex-1 bg-slate-50 border rounded-2xl h-20 overflow-hidden flex items-center justify-center relative">
                          {fotoUrl ? (
                            <>
                              <img src={fotoUrl} alt="Saha Görseli" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setFotoUrl(null)}
                                className="absolute top-1 right-1 bg-red-650 hover:bg-red-700 text-white rounded-full p-1 shadow-md text-[8px] font-bold"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <div className="text-center p-3 text-slate-400">
                              <ImageIcon size={16} className="mx-auto text-slate-300 mb-1" />
                              <span className="text-[7px] block leading-none">Fotoğraf Seçilmedi</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* WORKER COUNT INPUTS */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Çalışan Usta Sayısı</label>
                        <input 
                          type="number" 
                          min={0}
                          className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-bold text-slate-800 mt-1"
                          value={sahaUstaSayisi}
                          onChange={(e) => setSahaUstaSayisi(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Çalışan Düz İşçi Sayısı</label>
                        <input 
                          type="number" 
                          min={0}
                          className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-bold text-slate-800 mt-1"
                          value={sahaIsciSayisi}
                          onChange={(e) => setSahaIsciSayisi(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {/* Submit activity report */}
                    <button
                      type="submit"
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-2.5 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer border-b-4 border-amber-700"
                    >
                      <Send size={12} />
                      <span>KAYDET &amp; ŞANTİYEYE BİLDİR</span>
                    </button>

                  </div>

                </form>

                <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3 mt-3">
                  <div className="flex items-center space-x-2 text-slate-950">
                    <FileText size={14} className="text-amber-500" />
                    <span className="font-bold text-[10px] uppercase tracking-wider">FİİLİ GÜNLÜK RAPOR PARAMETRELERİ</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">🌦️ Hava Durumu</label>
                      <select
                        value={havaDurumu}
                        onChange={(e) => setHavaDurumu(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 p-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-bold text-slate-800"
                      >
                        <option value="Güneşli">☀️ Güneşli</option>
                        <option value="Bulutlu">☁️ Bulutlu</option>
                        <option value="Yağmurlu">🌧️ Yağmurlu</option>
                        <option value="Karlı">❄️ Karlı</option>
                        <option value="Rüzgarlı">💨 Rüzgarlı</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">👥 Toplam Ekip</label>
                      <div className="w-full bg-slate-100 border border-slate-200 p-1.5 rounded-xl text-[10px] font-extrabold text-slate-800 text-center">
                        {presentIds.length} Personel Sahada
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">📝 Genel Şantiye Notları</label>
                    <textarea
                      rows={2}
                      placeholder="Şantiyeye dair genel notlar, malzeme teslimatları veya aksaklıkları buraya yazabilirsiniz..."
                      value={genelNotlar}
                      onChange={(e) => setGenelNotlar(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold text-slate-800 leading-snug"
                    />
                  </div>

                  <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-2xl space-y-2">
                    <p className="text-[8.5px] font-bold text-amber-900 leading-normal">
                      Bugün için girilen <strong>{sahaFaaliyetleri.filter(f => f.tarih === selectedDate).length} adet</strong> faaliyeti ve yoklama durumlarını tek bir resmi raporda birleştirip onaylayın.
                    </p>
                    
                    <button
                      type="button"
                      onClick={() => setShowPdfPreview(true)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-2.5 px-3 rounded-xl transition flex items-center justify-center space-x-1 cursor-pointer shadow-sm border border-amber-600"
                    >
                      <FileText size={12} />
                      <span>📄 FİİLİ RAPORU OLUŞTUR &amp; PDF ÖNİZLE</span>
                    </button>
                  </div>
                </div>
                </>
              )}

              {/* TAB 3: SAHA FAALİYETLERİ ARŞİV GEÇMİŞİ */}
              {activeTab === 'faaliyet_gecmis' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  
                  {/* Undo Deleted Alert Banner */}
                  {lastDeletedFaaliyet && (
                    <div className="bg-amber-50 border border-amber-300 p-2.5 rounded-2xl flex items-center justify-between text-[9px] font-bold text-amber-900 shadow-sm">
                      <span>🗑️ Faaliyet silindi. Geri almak ister misiniz?</span>
                      <button
                        onClick={() => {
                          setSahaFaaliyetleri(prev => [lastDeletedFaaliyet, ...prev]);
                          setLastDeletedFaaliyet(null);
                          showStatus('success', 'Silme işlemi geri alındı, faaliyet başarıyla kurtarıldı!');
                        }}
                        className="bg-amber-600 text-white px-2 py-1 rounded-lg text-[8px] uppercase tracking-wider hover:bg-amber-700"
                      >
                        Geri Al
                      </button>
                    </div>
                  )}

                  {/* Edit Form Modal/Inline Drawer */}
                  {editingFaaliyet && (
                    <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-3xl space-y-2.5 shadow-inner">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-[9px] text-amber-800 uppercase tracking-widest">Faaliyeti Düzenle</span>
                        <button
                          onClick={() => setEditingFaaliyet(null)}
                          className="text-slate-400 hover:text-slate-600 font-bold text-[10px]"
                        >
                          ✕ Kapat
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[8px] font-bold text-slate-500 uppercase">İş Niteliği</label>
                          <input
                            type="text"
                            value={editingFaaliyet.isNiteligi}
                            onChange={(e) => setEditingFaaliyet({ ...editingFaaliyet, isNiteligi: e.target.value })}
                            className="w-full bg-white border border-slate-200 py-1.5 px-2 rounded-xl text-[9px] font-bold text-slate-800"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[8px] font-bold text-slate-500 uppercase">Parsel</label>
                            <select
                              value={editingFaaliyet.parsel}
                              onChange={(e) => setEditingFaaliyet({ ...editingFaaliyet, parsel: e.target.value })}
                              className="w-full bg-white border border-slate-200 p-1 rounded-xl text-[9px] font-bold text-slate-850"
                            >
                              {parsellerList.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-500 uppercase">Blok</label>
                            <select
                              value={editingFaaliyet.blok}
                              onChange={(e) => setEditingFaaliyet({ ...editingFaaliyet, blok: e.target.value })}
                              className="w-full bg-white border border-slate-200 p-1 rounded-xl text-[9px] font-bold text-slate-850"
                            >
                              {(PARSEL_BLOK_MAP[editingFaaliyet.parsel] || ['GENEL SAHA']).map(b => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-[8px] font-bold text-slate-500 uppercase">Açıklama</label>
                          <textarea
                            rows={2}
                            value={editingFaaliyet.aciklama || ''}
                            onChange={(e) => setEditingFaaliyet({ ...editingFaaliyet, aciklama: e.target.value })}
                            className="w-full bg-white border border-slate-200 py-1 px-2 rounded-xl text-[9px] font-semibold text-slate-850 leading-tight"
                          />
                        </div>

                        <button
                          onClick={() => {
                            setSahaFaaliyetleri(prev => prev.map(f => f.id === editingFaaliyet.id ? editingFaaliyet : f));
                            setEditingFaaliyet(null);
                            showStatus('success', 'Saha faaliyeti başarıyla güncellendi!');
                          }}
                          className="w-full bg-slate-900 text-white font-extrabold text-[9px] py-2 rounded-xl uppercase hover:bg-slate-950"
                        >
                          Değişiklikleri Kaydet
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-slate-950">
                        <Users size={14} className="text-amber-500" />
                        <span className="font-bold text-[10px] uppercase tracking-wider">SAHA FAALİYETLERİ ARŞİVİ</span>
                      </div>
                      <span className="text-[8px] font-mono text-slate-400 font-bold">Toplam: {sahaFaaliyetleri.length}</span>
                    </div>

                    {/* Search Field */}
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Raporlarda ara (Nitelik, parsel, açıklama)..."
                        value={faaliyetSearchKeyword}
                        onChange={(e) => setFaaliyetSearchKeyword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-250 py-1.5 pl-8 pr-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[9px] font-semibold text-slate-700"
                      />
                    </div>

                    <div className="space-y-3.5 divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                      {sahaFaaliyetleri.filter(f => 
                        f.isNiteligi.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase()) ||
                        f.parsel.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase()) ||
                        (f.blok && f.blok.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase())) ||
                        (f.aciklama && f.aciklama.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase()))
                      ).length === 0 ? (
                        <p className="text-[9px] text-slate-400 italic text-center py-8">Aranan kriterlere uygun faaliyet bulunamadı.</p>
                      ) : (
                        sahaFaaliyetleri
                          .filter(f => 
                            f.isNiteligi.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase()) ||
                            f.parsel.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase()) ||
                            (f.blok && f.blok.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase())) ||
                            (f.aciklama && f.aciklama.toLowerCase().includes(faaliyetSearchKeyword.toLowerCase()))
                          )
                          .map((sf, idx) => {
                            return (
                              <div key={sf.id} className={`pt-3.5 ${idx === 0 ? 'pt-0' : ''} space-y-1.5 text-[9px]`}>
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="font-bold text-xs text-slate-900 leading-tight">{sf.isNiteligi}</h5>
                                    <span className="text-[8px] text-slate-400 font-bold block mt-0.5">Kimlik: {sf.id}</span>
                                  </div>
                                  <span className="text-[8px] font-mono font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-lg shrink-0">
                                    {sf.tarih.split('-').reverse().join('.')}
                                  </span>
                                </div>

                                <div className="flex items-center space-x-1.5 text-[8px] text-slate-500">
                                  <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                                    📍 {sf.parsel} / {sf.blok}
                                  </span>
                                </div>

                                {sf.aciklama && (
                                  <p className="text-slate-650 leading-relaxed font-medium bg-slate-50 p-2 rounded-xl border border-slate-150/40">
                                    {sf.aciklama}
                                  </p>
                                )}

                                {/* Photo image attachment if present */}
                                {sf.fotoUrl && (
                                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-32">
                                    <img src={sf.fotoUrl} alt="Saha İlerleme Görseli" className="w-full h-full object-cover" />
                                  </div>
                                )}

                                {/* Workers count if any */}
                                {(sf.ustaSayisi !== undefined || sf.isciSayisi !== undefined) && (
                                  <div className="flex gap-2.5 items-center bg-slate-50 p-1.5 rounded-lg border border-slate-100 mt-1">
                                    {sf.ustaSayisi !== undefined && (
                                      <span className="text-[8.5px] font-semibold text-blue-800">
                                        👷 Usta: <strong>{sf.ustaSayisi} Kişi</strong>
                                      </span>
                                    )}
                                    {sf.isciSayisi !== undefined && (
                                      <span className="text-[8.5px] font-semibold text-slate-700">
                                        👷 Düz İşçi: <strong>{sf.isciSayisi} Kişi</strong>
                                      </span>
                                    )}
                                  </div>
                                )}

                                {(!sf.ustaSayisi && !sf.isciSayisi && sf.aktifPersonelListesi && sf.aktifPersonelListesi.length > 0) && (
                                  <div className="flex flex-wrap gap-1 items-center">
                                    <span className="text-[8px] font-bold text-slate-400">Çalışanlar ({sf.aktifPersonelListesi.length}):</span>
                                    {sf.aktifPersonelListesi.map((pId) => {
                                      const p = personeller.find(emp => emp.id === pId);
                                      if (!p) return null;
                                      return (
                                        <span key={pId} className="bg-slate-100 text-slate-600 text-[8px] font-medium px-1 rounded">
                                          {p.ad} {p.soyad.substring(0, 1)}.
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Edit & Delete Controls (Değiştir ve Sil) */}
                                <div className="flex items-center justify-end space-x-2 pt-1">
                                  <button
                                    onClick={() => setEditingFaaliyet(sf)}
                                    className="text-amber-700 hover:text-amber-800 font-extrabold text-[8.5px] uppercase tracking-wider flex items-center space-x-0.5"
                                  >
                                    <Edit2 size={10} />
                                    <span>Değiştir</span>
                                  </button>
                                  <span className="text-slate-200">|</span>
                                  <button
                                    onClick={() => {
                                      if (window.confirm("Bu saha raporunu silmek istediğinize emin misiniz?")) {
                                        setLastDeletedFaaliyet(sf);
                                        setSahaFaaliyetleri(prev => prev.filter(item => item.id !== sf.id));
                                        showStatus('success', 'Rapor silindi. Ekranın üstünden geri alabilirsiniz.');
                                      }
                                    }}
                                    className="text-rose-600 hover:text-rose-700 font-extrabold text-[8.5px] uppercase tracking-wider flex items-center space-x-0.5"
                                  >
                                    <Trash2 size={10} />
                                    <span>Sil</span>
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

              {/* TAB 4: PERSONEL GİRİŞE YOLLA */}
              {activeTab === 'personel_giris' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3.5">
                    
                    {/* Header */}
                    <div className="flex items-center space-x-2 text-slate-950">
                      <UserPlus size={14} className="text-amber-500" />
                      <span className="font-bold text-[10px] uppercase tracking-wider">PERSONEL GİRİŞE YOLLA</span>
                    </div>

                    <p className="text-[9px] text-slate-500 leading-snug">
                      Saha kapısına gelen yeni personelin kimlik belgesinin fotoğrafını çekip, bilgilerini girerek 
                      <strong> Muhasebe, İdari İşler</strong> ve <strong>Şantiye Şefi</strong> onay havuzlarına giriş talebi gönderin.
                    </p>

                    {/* Form Fields */}
                    <div className="space-y-2.5">
                      
                      {/* Name Row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Adı</label>
                          <input
                            type="text"
                            placeholder="Personel Adı"
                            value={yeniAd}
                            onChange={(e) => setYeniAd(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 py-1.5 px-2.5 rounded-xl text-[10px] font-bold text-slate-850"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Soyadı</label>
                          <input
                            type="text"
                            placeholder="Personel Soyadı"
                            value={yeniSoyad}
                            onChange={(e) => setYeniSoyad(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 py-1.5 px-2.5 rounded-xl text-[10px] font-bold text-slate-850"
                          />
                        </div>
                      </div>

                      {/* Job Title / Görev */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Görevi / Branşı</label>
                        <input
                          type="text"
                          placeholder="Örn: Demirci Ustası, Kalıpçı Usta Yardımcısı, Düz İşçi"
                          value={yeniGorev}
                          onChange={(e) => setYeniGorev(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 py-1.5 px-2.5 rounded-xl text-[10px] font-bold text-slate-850"
                        />
                      </div>

                      {/* ID Photo (Kimlik Fotoğrafı) Upload */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Kimlik Belgesi Fotoğrafı (Çek / Yükle)</label>
                        
                        <div className="flex items-center space-x-3">
                          <label className="bg-slate-100 hover:bg-slate-200 border-2 border-dashed border-slate-300 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition w-24 h-20 shrink-0 text-slate-500 hover:text-slate-800">
                            <Camera size={20} />
                            <span className="text-[8px] font-bold mt-1 text-center leading-none">Kimlik Çek</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const r = new FileReader();
                                  r.onload = async (event) => {
                                    if (event.target?.result) {
                                      const rawBase64 = event.target.result as string;
                                      const compressed = await compressImage(rawBase64);
                                      setYeniKimlikFoto(compressed);
                                    }
                                  };
                                  r.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                          </label>

                          <div className="flex-1 border border-slate-150 rounded-2xl bg-slate-50 h-20 relative flex items-center justify-center overflow-hidden">
                            {yeniKimlikFoto ? (
                              <>
                                <img src={yeniKimlikFoto} alt="Kimlik Belgesi" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setYeniKimlikFoto(null)}
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[8px] font-bold"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <div className="text-center p-2 text-slate-400">
                                <ImageIcon size={14} className="mx-auto text-slate-300 mb-0.5" />
                                <span className="text-[7.5px] block leading-none">Fotoğraf Çekilmedi</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={async () => {
                        if (!yeniAd || !yeniSoyad || !yeniGorev) {
                          showStatus('error', 'Lütfen Adı, Soyadı ve Görevi alanlarını doldurunuz!');
                          return;
                        }
                        if (!yeniKimlikFoto) {
                          showStatus('error', 'Lütfen Personel Kimlik Fotoğrafını çekiniz veya yükleyiniz!');
                          return;
                        }

                        try {
                          const requestID = `GIRIS-${Date.now()}`;
                          const docRef = doc(db, 'personelGirisTalepleri', requestID);
                          const entryData = {
                            ad: yeniAd,
                            soyad: yeniSoyad,
                            gorev: yeniGorev,
                            kimlikFotoUrl: yeniKimlikFoto,
                            durum: 'BEKLEMEDE',
                            tarih: new Date().toISOString(),
                            gonderenFormen: currentUser?.email || 'Bilinmeyen Formen'
                          };
                          await setDoc(docRef, entryData);

                          setSonGirisTalebi({
                            id: requestID,
                            ad: yeniAd,
                            soyad: yeniSoyad,
                            gorev: yeniGorev
                          });

                          setYeniAd('');
                          setYeniSoyad('');
                          setYeniGorev('');
                          setYeniKimlikFoto(null);
                          showStatus('success', '🎉 Giriş talebi başarıyla oluşturuldu! Muhasebe, İdari İşler ve Şantiye Şefi paneline iletildi.');
                        } catch (err) {
                          console.error(err);
                          showStatus('error', 'Veritabanına bağlanılamadı. Giriş talebi kaydedilemedi.');
                        }
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-3 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer border-b-4 border-emerald-800"
                    >
                      <UserPlus size={12} />
                      <span>GİRİŞİNİ YAP VE GÖNDER</span>
                    </button>

                    {sonGirisTalebi && (
                      <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-extrabold text-emerald-800 tracking-wider">✅ ERP GİRİŞİ YAPILDI</span>
                          <button onClick={() => setSonGirisTalebi(null)} className="text-emerald-600 hover:text-emerald-800 font-bold text-xs p-0.5">✕</button>
                        </div>
                        <p className="text-[8.5px] text-emerald-700 font-medium leading-snug">
                          Kayıt veritabanına ulaştı. Muhasebeye bildirmek için aşağıdaki hazır metni <strong>WhatsApp</strong> ile gönderebilirsiniz:
                        </p>
                        <div className="bg-white border border-emerald-100 p-2.5 rounded-xl text-[8px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed select-all">
{`*KİBRİTÇİ ERP - YENİ PERSONEL İŞE GİRİŞ BİLDİRİMİ*
----------------------------------------
*Ad Soyad:* ${sonGirisTalebi.ad} ${sonGirisTalebi.soyad}
*Görev/Branş:* ${sonGirisTalebi.gorev}
*Tarih:* ${new Date().toLocaleDateString('tr-TR')}
*Gönderen:* ${currentUser?.email || 'Bilinmeyen Formen'}
----------------------------------------
_Lütfen bu personelin sigorta giriş işlemlerini başlatınız._`}
                        </div>
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                            `*KİBRİTÇİ ERP - YENİ PERSONEL İŞE GİRİŞ BİLDİRİMİ*\n----------------------------------------\n*Ad Soyad:* ${sonGirisTalebi.ad} ${sonGirisTalebi.soyad}\n*Görev/Branş:* ${sonGirisTalebi.gorev}\n*Tarih:* ${new Date().toLocaleDateString('tr-TR')}\n*Gönderen:* ${currentUser?.email || 'Bilinmeyen'}\n----------------------------------------\n_Lütfen bu personelin sigorta giriş işlemlerini başlatınız._`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] py-2 rounded-lg flex items-center justify-center space-x-1 shadow-sm transition active:scale-95"
                        >
                          <span>💬 WhatsApp'tan Gönder</span>
                        </a>
                      </div>
                    )}

                  </div>

                  {/* Sent Requests Log */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">GİRİŞ TALEPLERİ TAKİP DESTERİ</span>
                    
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {personelGirisListesi.length === 0 ? (
                        <p className="text-[8.5px] text-slate-400 italic text-center py-6">Son gönderilen giriş talebi bulunmuyor.</p>
                      ) : (
                        personelGirisListesi.map((item) => (
                          <div key={item.id} className="border border-slate-100 rounded-2xl p-2.5 bg-slate-50/50 space-y-1.5 text-[9px]">
                            <div className="flex justify-between items-start">
                              <div>
                                <h6 className="font-bold text-slate-900 text-xs leading-tight">{item.ad} {item.soyad}</h6>
                                <span className="text-[8px] font-semibold text-slate-400 block mt-0.5">Branş: {item.gorev}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase ${
                                item.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                item.durum === 'WP_GÖNDERİLDİ' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                item.durum === 'GİRİŞ_BELGESİ_YÜKLENDİ' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                                'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}>
                                {item.durum === 'ONAYLANDI' ? 'ONAYLANDI (KAYIT TAMAM)' :
                                 item.durum === 'WP_GÖNDERİLDİ' ? 'WP GÖNDERİLDİ' :
                                 item.durum === 'GİRİŞ_BELGESİ_YÜKLENDİ' ? 'BELGE YÜKLENDİ' :
                                 'BEKLEMEDE'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[7.5px] text-slate-400 pt-1">
                              <div>📅 Tarih: {new Date(item.tarih).toLocaleString('tr-TR')}</div>
                              <div>Formen: {item.gonderenFormen?.split('@')[0]}</div>
                            </div>

                            {/* Show Kimlik thumbnail & PDF state */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-1">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-slate-400 font-bold">Kimlik:</span>
                                {item.kimlikFotoUrl && (
                                  <img src={item.kimlikFotoUrl} alt="Kimlik Mini" className="w-8 h-5 object-cover rounded border" />
                                )}
                              </div>
                              
                              {item.girisEvrakPdfUrl && (
                                <a 
                                  href={item.girisEvrakPdfUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-[8px] text-purple-700 hover:underline font-extrabold flex items-center space-x-0.5"
                                >
                                  📄 Giriş Belgesi (PDF)
                                </a>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 5: PERSONEL LİSTESİ / ÇIKIŞA GÖNDER / BİLGI GÜNCELLEME */}
              {activeTab === 'personel_listesi' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  
                  {/* 1. Günü Tamamla Control Card */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <CheckCircle size={14} className={isGunuTamamlandi ? "text-emerald-500" : "text-amber-500"} />
                        <span className="font-bold text-[10px] uppercase tracking-wider">GÜNÜ TAMAMLA KONTROLÜ</span>
                      </div>
                      <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${isGunuTamamlandi ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {isGunuTamamlandi ? "GÜN TAMAMLANDI" : "İŞLEM BEKLİYOR"}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug">
                      Puantaj kontrolleri ve saha imalat raporlarını tamamladıktan sonra <strong>"Günü Tamamla"</strong> butonuna basarak iş gününü yöneticilerin onayına kapatın.
                    </p>
                    
                    <button
                      type="button"
                      onClick={handleGunuTamamla}
                      disabled={isGunuTamamlandi}
                      className={`w-full text-white font-black text-[10px] py-3 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer border-b-4 ${
                        isGunuTamamlandi 
                          ? "bg-slate-400 border-slate-500 cursor-not-allowed" 
                          : "bg-amber-600 hover:bg-amber-700 border-amber-800"
                      }`}
                    >
                      <CheckCircle size={12} />
                      <span>{isGunuTamamlandi ? "İŞ GÜNÜ BAŞARIYLA TAMAMLANDI" : "GÜNÜ TAMAMLA VE ANA PROGRAMA BİLDİR"}</span>
                    </button>
                  </div>

                  {/* 2. Active Personnel Directory */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3.5">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div className="flex items-center space-x-2 text-slate-950">
                        <Users size={14} className="text-amber-500" />
                        <span className="font-bold text-[10px] uppercase tracking-wider">ŞANTİYE PERSONEL LİSTESİ ({personeller.filter(p => p.durum === true || String(p.durum).toLowerCase() === 'true').length})</span>
                      </div>
                      
                      {/* Search Personnel */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Personel ara..."
                          value={personelSearchKeyword}
                          onChange={(e) => setPersonelSearchKeyword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 py-1 px-2.5 pl-6 rounded-lg text-[9px] font-bold text-slate-850 outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <Search size={10} className="absolute left-2 top-2 text-slate-400" />
                      </div>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {personeller
                        .filter(p => p.durum === true || String(p.durum).toLowerCase() === 'true')
                        .filter(p => {
                          const q = personelSearchKeyword.toLowerCase().trim();
                          if (!q) return true;
                          return (p.ad || '').toLowerCase().includes(q) || 
                                 (p.soyad || '').toLowerCase().includes(q) || 
                                 (p.gorev || '').toLowerCase().includes(q);
                        })
                        .map(p => (
                          <div key={p.id} className="border border-slate-100 rounded-2xl p-3 bg-slate-50/50 flex justify-between items-center text-[9px]">
                            <div>
                              <h6 className="font-bold text-slate-900 text-xs leading-none">{p.ad} {p.soyad}</h6>
                              <span className="text-[8px] font-bold text-slate-400 block mt-1">Branş: {p.gorev || 'Belirtilmedi'}</span>
                              <div className="flex gap-2 mt-1 font-mono text-[7px] text-slate-500">
                                <span>📞 {p.telefon || 'Telefon Yok'}</span>
                                <span>💳 {p.bankaAdi || 'Banka Yok'}</span>
                              </div>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPersonelForDetail(p);
                                setShowCikisForm(false);
                                setShowGuncellemeForm(false);
                              }}
                              className="bg-amber-500 hover:bg-amber-600 font-extrabold text-[8.5px] text-slate-950 py-1.5 px-3 rounded-lg transition active:scale-95 cursor-pointer shadow-xs"
                            >
                              İşlem Yap
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 3. Action Request Tracker Logs */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">GÜNCELLEME & ÇIKIŞ TAKİP HAVUZU</span>
                    
                    <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
                      {isCikisTalepleriList.length === 0 && isGuncellemeTalepleriList.length === 0 ? (
                        <p className="text-[8.5px] text-slate-400 italic text-center py-6">Son gönderilen talep kaydı bulunmuyor.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {/* Exits */}
                          {isCikisTalepleriList.map(item => (
                            <div key={item.id} className="border border-slate-100 rounded-2xl p-2.5 bg-rose-50/30 text-[9px] space-y-1">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-black text-rose-800 text-[8px] uppercase tracking-wider block mb-0.5">🛑 İŞTEN ÇIKIŞ TALEBİ</span>
                                  <h6 className="font-bold text-slate-900 text-xs leading-none">{item.personelIsim}</h6>
                                  <span className="text-[8px] text-slate-500 block mt-1">Gerekçe: {item.cikisNedeni}</span>
                                </div>
                                <span className={`text-[8px] font-black px-1.5 py-0.2 rounded ${
                                  item.durum === 'ONAYLANDI' 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : item.durum === 'REDDEDİLDİ' 
                                      ? 'bg-rose-100 text-rose-800' 
                                      : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {item.durum}
                                </span>
                              </div>
                            </div>
                          ))}
                          
                          {/* Updates */}
                          {isGuncellemeTalepleriList.map(item => (
                            <div key={item.id} className="border border-slate-100 rounded-2xl p-2.5 bg-blue-50/30 text-[9px] space-y-1">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-black text-blue-800 text-[8px] uppercase tracking-wider block mb-0.5">📝 BİLGİ GÜNCELLEME TALEBİ</span>
                                  <h6 className="font-bold text-slate-900 text-xs leading-none">
                                    {item.eskiBilgiler?.ad} {item.eskiBilgiler?.soyad} ➜ {item.yeniBilgiler?.ad} {item.yeniBilgiler?.soyad}
                                  </h6>
                                  <span className="text-[8px] text-slate-500 block mt-1">Neden: {item.guncellemeNedeni}</span>
                                </div>
                                <span className={`text-[8px] font-black px-1.5 py-0.2 rounded ${
                                  item.durum === 'ONAYLANDI' 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : item.durum === 'REDDEDİLDİ' 
                                      ? 'bg-rose-100 text-rose-800' 
                                      : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {item.durum}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. Personnel Details Action Modal */}
                  {selectedPersonelForDetail && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[999] flex items-end sm:items-center justify-center p-3 animate-fade-in">
                      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl border shadow-xl p-4 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up">
                        
                        {/* Modal Header */}
                        <div className="flex justify-between items-center border-b pb-2">
                          <div>
                            <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">PERSONEL DETAY & İŞLEMLER</span>
                            <h4 className="font-bold text-slate-900 text-sm">{selectedPersonelForDetail.ad} {selectedPersonelForDetail.soyad}</h4>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPersonelForDetail(null);
                              setShowCikisForm(false);
                              setShowGuncellemeForm(false);
                            }}
                            className="text-slate-400 hover:text-slate-800 text-sm font-bold p-1"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Basic Details Info */}
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[9px] space-y-1.5">
                          <div className="flex justify-between"><span className="text-slate-400 font-bold">Görevi / Branşı:</span> <span className="font-extrabold text-slate-800">{selectedPersonelForDetail.gorev || 'Yazılmamış'}</span></div>
                          <div className="flex justify-between"><span className="text-slate-400 font-bold">Telefon No:</span> <span className="font-mono text-slate-850 font-bold">{selectedPersonelForDetail.telefon || 'Belirtilmedi'}</span></div>
                          <div className="flex justify-between"><span className="text-slate-400 font-bold">IBAN Numarası:</span> <span className="font-mono text-slate-850 font-bold">{selectedPersonelForDetail.ibanNo || selectedPersonelForDetail.iban || 'Kayıtlı IBAN Yok'}</span></div>
                          <div className="flex justify-between"><span className="text-slate-400 font-bold">Banka Adı:</span> <span className="font-extrabold text-slate-800">{selectedPersonelForDetail.bankaAdi || 'Kayıtlı Banka Yok'}</span></div>
                        </div>

                        {/* Actions Selector Buttons */}
                        <div className="grid grid-cols-2 gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCikisForm(true);
                              setShowGuncellemeForm(false);
                            }}
                            className={`py-2 px-3 rounded-xl font-bold text-[9px] border transition flex items-center justify-center space-x-1 ${
                              showCikisForm 
                                ? 'bg-red-50 text-red-700 border-red-200' 
                                : 'bg-white text-red-600 border-red-100 hover:bg-red-50/50'
                            }`}
                          >
                            <span>🛑 İşten Çıkışa Gönder</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => openGuncellemeForm(selectedPersonelForDetail)}
                            className={`py-2 px-3 rounded-xl font-bold text-[9px] border transition flex items-center justify-center space-x-1 ${
                              showGuncellemeForm 
                                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50/50'
                            }`}
                          >
                            <span>📝 Bilgileri Güncelle</span>
                          </button>
                        </div>

                        {/* Form A: İşten Çıkış Talebi */}
                        {showCikisForm && (
                          <div className="border border-red-100 rounded-2xl p-3 bg-red-50/10 space-y-3 animate-in fade-in duration-150">
                            <span className="font-extrabold text-[8px] text-red-700 uppercase block tracking-wider">🛑 İŞTEN ÇIKARILMA TALEBİ FORMU</span>
                            
                            <div className="space-y-2">
                              <div>
                                <label className="text-[8px] font-bold text-slate-500 uppercase block mb-1">Planlanan Çıkış Tarihi</label>
                                <input
                                  type="date"
                                  value={cikisTarihi}
                                  onChange={(e) => setCikisTarihi(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                />
                              </div>
                              
                              <div>
                                <label className="text-[8px] font-bold text-slate-500 uppercase block mb-1">Yetkili Onay Grubu</label>
                                <select
                                  value={cikisYoneticiRole}
                                  onChange={(e) => setCikisYoneticiRole(e.target.value as any)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                >
                                  <option value="MUHASEBE">MUHASEBE (Çıkış Evrakları & Hesap Kesim)</option>
                                  <option value="İDARİ_İŞLER">İDARİ İŞLER (Lojman & Kamp İlişiği Kesim)</option>
                                  <option value="ŞANTİYE_ŞEFİ">ŞANTİYE ŞEFİ (Saha Devir & İş Bırakma)</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[8px] font-bold text-slate-500 uppercase block mb-1">İşten Çıkarma Sebebi / Notlar</label>
                                <textarea
                                  placeholder="Örn: Projedeki jobun bitmesi, devamsızlık..."
                                  value={cikisNedeni}
                                  onChange={(e) => setCikisNedeni(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-2 text-[9px] h-12 resize-none"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleSaveCikisTalebi}
                              className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-[9px] py-2 rounded-lg transition"
                            >
                              İŞTEN ÇIKIŞ TALEBİNİ YÖNETİCİYE GÖNDER
                            </button>
                          </div>
                        )}

                        {/* Form B: Bilgileri Güncelleme Talebi */}
                        {showGuncellemeForm && (
                          <div className="border border-blue-100 rounded-2xl p-3 bg-blue-50/10 space-y-3 animate-in fade-in duration-150">
                            <span className="font-extrabold text-[8px] text-blue-700 uppercase block tracking-wider">📝 BİLGİ DÜZELTME & GÜNCELLEME FORMU</span>
                            
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">Adı</label>
                                  <input
                                    type="text"
                                    value={guncelAd}
                                    onChange={(e) => setGuncelAd(e.target.value)}
                                    className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">Soyadı</label>
                                  <input
                                    type="text"
                                    value={guncelSoyad}
                                    onChange={(e) => setGuncelSoyad(e.target.value)}
                                    className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">Görevi</label>
                                <input
                                  type="text"
                                  value={guncelGorev}
                                  onChange={(e) => setGuncelGorev(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                />
                              </div>

                              <div>
                                <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">Telefon No</label>
                                <input
                                  type="text"
                                  value={guncelTelefon}
                                  onChange={(e) => setGuncelTelefon(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                />
                              </div>

                              <div>
                                <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">IBAN</label>
                                <input
                                  type="text"
                                  value={guncelIban}
                                  onChange={(e) => setGuncelIban(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold font-mono"
                                />
                              </div>

                              <div>
                                <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">Banka Adı</label>
                                <input
                                  type="text"
                                  value={guncelBanka}
                                  onChange={(e) => setGuncelBanka(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] font-bold"
                                />
                              </div>

                              <div>
                                <label className="text-[7.5px] font-bold text-slate-400 block mb-0.5">Güncelleme Gerekçesi / Açıklama *</label>
                                <textarea
                                  placeholder="Örn: Evlilik nedeniyle soyadı değişikliği, IBAN güncellemesi..."
                                  value={guncellemeNedeni}
                                  onChange={(e) => setGuncellemeNedeni(e.target.value)}
                                  className="w-full bg-white border rounded-lg p-1.5 text-[9px] h-12 resize-none"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleSaveGuncellemeTalebi}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[9px] py-2 rounded-lg transition"
                            >
                              GÜNCELLEME TALEBİNİ BİLDİR
                            </button>
                          </div>
                        )}

                      </div>
                    </div>
                  )}

                </div>
              )}

              {activeTab === 'toplu_puantaj' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Calendar size={14} className="text-amber-500" />
                        <span className="font-bold text-[10px] uppercase tracking-wider text-slate-900">HAFTALIK TOPLU PUANTAJ &amp; MESAİ</span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono font-bold">
                        Hafta: {(() => {
                          const days = getDaysOfWeek();
                          return `${days[0].getDate()}.${days[0].getMonth()+1} - ${days[6].getDate()}.${days[6].getMonth()+1}`;
                        })()}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug">
                      Seçilen haftanın tüm günlerindeki puantaj ve mesai (fazla mesai) durumlarını toplu olarak görün. Hücrelere dokunarak hızlıca durum veya mesai saati düzenleyebilirsiniz.
                    </p>

                    {/* Table Container - Horizontally scrollable on mobile */}
                    <div className="overflow-x-auto border rounded-2xl bg-slate-50">
                      <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="p-2 text-[9px] font-black uppercase text-slate-600 tracking-wider">PERSONEL</th>
                            {getDaysOfWeek().map((d, i) => {
                              const daysNames = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
                              const isToday = d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                              return (
                                <th key={i} className={`p-2 text-center text-[9px] font-black uppercase tracking-wider ${isToday ? 'bg-amber-100 text-amber-900 font-black' : 'text-slate-600'}`}>
                                  <div>{daysNames[i]}</div>
                                  <div className="text-[10px] font-mono">{d.getDate()}</div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {activeStaff.map(p => {
                            return (
                              <tr key={p.id} className="border-b border-slate-150 hover:bg-slate-100/50 transition duration-100">
                                <td className="p-2 flex items-center space-x-2">
                                  <div className="w-6 h-6 rounded-full bg-slate-250 flex items-center justify-center font-bold text-[9px] text-slate-700 uppercase">
                                    {p.ad[0]}{p.soyad[0]}
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold text-slate-900 leading-tight">{p.ad} {p.soyad}</div>
                                    <div className="text-[8px] text-slate-500 leading-none">{p.gorev}</div>
                                  </div>
                                </td>
                                {getDaysOfWeek().map((d, i) => {
                                  const pMap = yoklamalar[p.id] || {};
                                  const dayData = pMap[d.getDate()];
                                  const status = dayData?.durum || 'Girilmedi';
                                  const mesai = dayData?.mesaiSaati || 0;

                                  let badgeClass = "bg-slate-100 text-slate-450 border border-slate-200";
                                  let shortLabel = "–";

                                  if (status === 'Geldi') {
                                    badgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold";
                                    shortLabel = "G";
                                  } else if (status === 'Yok') {
                                    badgeClass = "bg-rose-50 text-rose-700 border border-rose-200 font-bold";
                                    shortLabel = "Y";
                                  } else if (status === 'İzinli') {
                                    badgeClass = "bg-amber-50 text-amber-700 border border-amber-200 font-bold";
                                    shortLabel = "İ";
                                  } else if (status === 'Raporlu') {
                                    badgeClass = "bg-purple-50 text-purple-700 border border-purple-200 font-bold";
                                    shortLabel = "R";
                                  } else if (status === 'Pazar') {
                                    badgeClass = "bg-slate-200 text-slate-700 border border-slate-300 font-bold";
                                    shortLabel = "P";
                                  } else if (status === 'Tatil') {
                                    badgeClass = "bg-blue-50 text-blue-700 border border-blue-200 font-bold";
                                    shortLabel = "T";
                                  }

                                  return (
                                    <td 
                                      key={i} 
                                      onClick={() => setSelectedCell({
                                        personelId: p.id,
                                        personelName: `${p.ad} ${p.soyad}`,
                                        date: d,
                                        currentDurum: status as any,
                                        currentMesai: mesai
                                      })}
                                      className="p-1 text-center cursor-pointer hover:bg-slate-200/40 transition duration-75"
                                    >
                                      <div className={`mx-auto rounded-lg py-1 px-1.5 text-[9px] inline-flex items-center justify-center space-x-1 ${badgeClass} min-w-[32px]`}>
                                        <span>{shortLabel}</span>
                                        {mesai > 0 && <span className="text-[7.5px] font-mono font-black opacity-80">+{mesai}</span>}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Cell Edit Popover Mini-Modal */}
                  {selectedCell && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
                      <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center pb-2 border-b">
                          <div>
                            <span className="text-[8px] font-extrabold text-amber-600 uppercase tracking-widest block">PUANTAJ DÜZENLE</span>
                            <h4 className="font-bold text-xs text-slate-900">{selectedCell.personelName}</h4>
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                            {selectedCell.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}
                          </span>
                        </div>

                        {/* Status Select */}
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Katılım Durumu *</label>
                          <select
                            value={selectedCell.currentDurum}
                            onChange={(e) => setSelectedCell(prev => prev ? { ...prev, currentDurum: e.target.value as any } : null)}
                            className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
                          >
                            <option value="Girilmedi">Girilmedi (–)</option>
                            <option value="Geldi">Geldi (G)</option>
                            <option value="Yok">Yok (Y)</option>
                            <option value="İzinli">İzinli (İ)</option>
                            <option value="Raporlu">Raporlu (R)</option>
                            <option value="Pazar">Pazar Tatili (P)</option>
                            <option value="Tatil">Resmi Tatil (T)</option>
                          </select>
                        </div>

                        {/* Overtime (Mesai) Selector */}
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Mesai Saati (Fazla Çalışma) *</label>
                          <div className="grid grid-cols-5 gap-1.5">
                            {[0, 1, 2, 3, 4].map(val => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setSelectedCell(prev => prev ? { ...prev, currentMesai: val } : null)}
                                className={`py-1.5 rounded-lg text-[10px] font-mono font-black border transition ${
                                  selectedCell.currentMesai === val
                                    ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-sm'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                +{val}
                              </button>
                            ))}
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={selectedCell.currentMesai}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSelectedCell(prev => prev ? { ...prev, currentMesai: v } : null);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none mt-1"
                            placeholder="Örn: 2.5 veya diğer saat girin"
                          />
                        </div>

                        {/* Buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCell(null)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-650 font-extrabold text-[10px] py-2.5 rounded-xl transition"
                          >
                            İptal Et
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const dVal = selectedCell.date;
                              const pId = selectedCell.personelId;
                              const status = selectedCell.currentDurum;
                              const mesai = selectedCell.currentMesai;

                              setYoklamalar(prev => {
                                const next = { ...prev };
                                const pMap = next[pId] ? { ...next[pId] } : {};
                                pMap[dVal.getDate()] = {
                                  durum: status,
                                  mesaiSaati: mesai,
                                  gonderen: currentUser?.email || 'FORMEN'
                                };
                                next[pId] = pMap;
                                return next;
                              });

                              await logActionToPersonelHistory(
                                'Puantaj Güncelledi',
                                `${selectedCell.personelName} için ${dVal.toLocaleDateString('tr-TR')} tarihli puantajı "${status}" ve ${mesai} saat mesai olarak güncelledi.`
                              );

                              showStatus('success', `📝 ${selectedCell.personelName} için puantaj kaydı güncellendi.`);
                              setSelectedCell(null);
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] py-2.5 rounded-xl transition shadow-md border-b-2 border-amber-800"
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

          </div>

        </div>

      </div>

      {/* FİİLİ GÜNLÜK SAHA RAPORU - A4 PDF ÖNİZLEME MODALI */}
      {showPdfPreview && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto font-sans">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] my-auto animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2">
                <FileText size={16} className="text-amber-400" />
                <h3 className="font-black text-xs uppercase tracking-wider text-amber-400">ŞANTİYE GÜNLÜK FİİLİ RAPORU (PDF FORMATI)</h3>
              </div>
              <button 
                onClick={() => setShowPdfPreview(false)}
                className="text-slate-400 hover:text-white font-extrabold text-xs transition p-1"
              >
                ✕ Kapat
              </button>
            </div>

            {/* Simulated Paper Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100/55 text-slate-800 leading-normal scrollbar-thin">
              <div className="bg-white border-2 border-slate-200/80 p-5 md:p-7 shadow-xs rounded-xl max-w-xl mx-auto space-y-5 text-[10px] text-slate-800 relative">
                
                {/* A4 Watermark Logo Background */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                  <span className="text-[6rem] font-black tracking-widest rotate-12">KİBRİTÇİ</span>
                </div>

                {/* Company Header */}
                <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3 relative z-10">
                  <div className="space-y-0.5">
                    <h1 className="text-sm font-black tracking-tight text-slate-900 uppercase">KİBRİTÇİ İNŞAAT VE TAAHHÜT A.Ş.</h1>
                    <p className="text-[7.5px] text-slate-500 font-mono tracking-wider uppercase">Merkez Ofis &amp; Şantiye İşleri Koordinatörlüğü</p>
                  </div>
                  <div className="bg-slate-900 text-white font-black px-2 py-1 text-[8.5px] rounded tracking-widest font-mono shrink-0">
                    GÜNLÜK RAPOR
                  </div>
                </div>

                {/* Document Subtitle */}
                <div className="text-center space-y-1 py-1 bg-slate-50 border rounded-lg relative z-10">
                  <h2 className="text-xs font-black tracking-wide text-slate-900">ŞANTİYE GÜNLÜK FİİLİ FAALİYET RAPORU</h2>
                  <p className="text-[7.5px] text-slate-500 font-medium">Bu rapor, Formen tarafından sahadan girilen anlık verilerle dinamik olarak üretilmiştir.</p>
                </div>

                {/* Metadata Grid */}
                <table className="w-full border-collapse text-[9px] relative z-10">
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 bg-slate-50/50 p-2 font-bold text-slate-500 w-1/4 uppercase">📅 RAPOR TARİHİ</td>
                      <td className="border border-slate-200 p-2 font-bold text-slate-900 font-mono">
                        {selectedDate.split('-').reverse().join('.')}
                      </td>
                      <td className="border border-slate-200 bg-slate-50/50 p-2 font-bold text-slate-500 w-1/4 uppercase">🌤️ HAVA DURUMU</td>
                      <td className="border border-slate-200 p-2 font-bold text-slate-900">
                        {havaDurumu || 'Güneşli'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 bg-slate-50/50 p-2 font-bold text-slate-500 uppercase">👷 HAZIRLAYAN (FORMEN)</td>
                      <td className="border border-slate-200 p-2 font-bold text-slate-900">
                        {currentUser?.displayName || (currentUser?.ad ? `${currentUser.ad} ${currentUser.soyad || ''}` : '') || 'Sahadaki Formen'}
                      </td>
                      <td className="border border-slate-200 bg-slate-50/50 p-2 font-bold text-slate-500 uppercase">👥 TOPLAM EKİP MEVCUDU</td>
                      <td className="border border-slate-200 p-2 font-bold text-slate-900 font-mono">
                        {presentIds.length} Personel (Aktif Sahada)
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Section 1: Attendance list */}
                <div className="space-y-2 relative z-10">
                  <div className="border-b-2 border-slate-700 pb-1 flex items-center space-x-1">
                    <span className="font-black text-[10px] text-slate-900">1. PUANTAJ VE YOKLAMA ÖZETİ</span>
                  </div>
                  <p className="text-[8.5px] text-slate-600 leading-normal font-medium">
                    Bugün şantiyede aktif hazır bulunan <strong>{presentIds.length} personelin</strong> yoklaması ve mesai saatleri Formen tarafından e-imzalanarak sisteme işlenmiştir. Gelmeyen personeller puantaj dışı bırakılmıştır.
                  </p>
                  
                  {/* Small scrollable inline grid of present staff */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded-xl border border-slate-150 max-h-24 overflow-y-auto">
                    {activeStaff.filter(p => presentIds.includes(p.id)).length === 0 ? (
                      <p className="col-span-2 text-slate-400 italic text-center py-2 text-[8px]">Bugün gelen personel kaydı girilmemiştir.</p>
                    ) : (
                      activeStaff.filter(p => presentIds.includes(p.id)).map(p => (
                        <div key={p.id} className="flex items-center space-x-1 py-0.5 border-b border-slate-100/60">
                          <span className="text-[6.5px] text-emerald-600">●</span>
                          <span className="font-bold text-slate-800">{p.ad} {p.soyad}</span>
                          <span className="text-slate-400 text-[8px]">({p.gorev})</span>
                          {mesaiSaatleri[p.id] > 0 && (
                            <span className="text-[8px] font-mono text-blue-700 font-black ml-auto bg-blue-50 px-1 rounded">
                              +{mesaiSaatleri[p.id]} Sa
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Section 2: Saha İmalat ve Faaliyetleri */}
                <div className="space-y-2.5 relative z-10">
                  <div className="border-b-2 border-slate-700 pb-1 flex items-center space-x-1">
                    <span className="font-black text-[10px] text-slate-900">2. FİİLİ SAHA İMALATLARI VE FAALİYETLERİ</span>
                  </div>

                  <div className="space-y-3">
                    {sahaFaaliyetleri.filter(f => f.tarih === selectedDate).length === 0 ? (
                      <div className="text-center py-4 bg-rose-50/50 border border-rose-100 rounded-xl text-rose-800 italic text-[9px]">
                        Bugün için girilmiş herhangi bir imalat faaliyeti bulunmamaktadır. Raporu göndermeden önce imalat girişi yapabilirsiniz.
                      </div>
                    ) : (
                      sahaFaaliyetleri.filter(f => f.tarih === selectedDate).map((sf, idx) => (
                        <div key={sf.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/30 space-y-1.5">
                          <div className="flex justify-between items-center border-b border-slate-150 pb-1.5">
                            <span className="font-black text-slate-900 text-[10.5px]">
                              {idx + 1}. {sf.isNiteligi}
                            </span>
                            <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[8px] uppercase">
                              📍 {sf.parsel} / {sf.blok}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2 space-y-1.5">
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 block uppercase">Açıklama / Detaylar</span>
                                <p className="text-slate-750 font-medium leading-relaxed bg-white p-2 rounded-lg border border-slate-150/60">
                                  {sf.aciklama || 'Detay açıklaması girilmemiştir.'}
                                </p>
                              </div>

                              <div>
                                <span className="text-[8px] font-bold text-slate-400 block uppercase">İmalatta Görev Alan Ekip</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {sf.aktifPersonelListesi && sf.aktifPersonelListesi.length > 0 ? (
                                    sf.aktifPersonelListesi.map(pid => {
                                      const p = personeller.find(x => x.id === pid);
                                      return (
                                        <span key={pid} className="bg-slate-100 border border-slate-250 text-slate-700 font-semibold py-0.5 px-1.5 rounded-md text-[8px] whitespace-nowrap">
                                          {p ? `${p.ad} ${p.soyad}` : 'Personel'}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="text-slate-400 italic text-[8px]">Ekip seçilmedi.</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Activity photo inside report */}
                            <div className="flex flex-col items-center justify-center bg-slate-50 border rounded-xl p-1 shrink-0 h-24 overflow-hidden">
                              {sf.fotoUrl ? (
                                <img src={sf.fotoUrl} alt="Kanıt Görsel" className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                <div className="text-slate-400 italic text-[7.5px] text-center p-2">
                                  📷 Görsel Eklenmedi
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Section 3: Genel Şantiye Notları */}
                <div className="space-y-2 relative z-10">
                  <div className="border-b-2 border-slate-700 pb-1">
                    <span className="font-black text-[10px] text-slate-900">3. EK ŞANTİYE NOTLARI &amp; AÇIKLAMALARI</span>
                  </div>
                  <p className="text-slate-750 leading-relaxed font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    {genelNotlar || 'Bugün şantiyede herhangi bir aksaklık, malzeme teslimatı veya ek genel durum bildirilmemiştir.'}
                  </p>
                </div>

                {/* Section 4: Digital Approval Stamper */}
                <div className="border-t-2 border-slate-900 pt-3 relative z-10 flex justify-between items-start text-[8.5px]">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900 uppercase">📝 BELGE GÜVENLİĞİ VE DOĞRULAMA</p>
                    <p className="text-slate-500 max-w-sm leading-tight">
                      Bu rapor şantiye sahasındaki mobil el terminali aracılığıyla dijital olarak onaylanıp zaman damgasıyla imzalanmıştır. Veritabanına aktarıldıktan sonra değiştirilemez veya tahrif edilemez.
                    </p>
                  </div>

                  {/* Stamp box mockup */}
                  <div className="border-2 border-dashed border-emerald-600 text-emerald-700 p-2 rounded-xl flex flex-col items-center justify-center text-center w-36 shrink-0 bg-emerald-50/40 select-none">
                    <ShieldCheck size={16} className="text-emerald-600 mb-0.5" />
                    <span className="font-black text-[8px] uppercase tracking-wide leading-none">KİBRİTÇİ İNŞAAT</span>
                    <span className="font-bold text-[7.5px] leading-tight mt-0.5">E-İMZA ONAYLANDI</span>
                    <span className="font-mono text-[7px] text-slate-500 leading-none mt-1 uppercase">FORMEN MOBİL ONAY</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="bg-slate-50 border-t p-4 flex justify-between items-center shrink-0">
              <button
                onClick={() => setShowPdfPreview(false)}
                className="bg-white border border-slate-350 hover:bg-slate-100 text-slate-700 font-extrabold text-[10px] py-2 px-4 rounded-xl transition cursor-pointer"
              >
                DÜZENLEMEYE DEVAM ET
              </button>

              <button
                onClick={handleSaveGunlukRapor}
                className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-[10px] py-2.5 px-6 rounded-xl transition cursor-pointer flex items-center space-x-1 border-b-4 border-amber-700"
              >
                <Check size={12} />
                <span>RAPORU ONAYLA &amp; ANA PROGRAMA GÖNDER</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
