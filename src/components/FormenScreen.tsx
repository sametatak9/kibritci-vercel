import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, CheckCircle, XCircle, Users, ClipboardCheck, 
  MapPin, Camera, Sparkles, Undo2, ChevronRight, User, 
  Info, Smartphone, Monitor, Search, PlusCircle, Trash2, 
  FileSignature, Briefcase, RefreshCw, Send, Image as ImageIcon, MessageCircle,
  Check, X, FileText, UserPlus, Upload, ShieldCheck, Edit2, ArrowLeft, Eye
} from 'lucide-react';
import { Personel, AylikYoklamaMap, YoklamaDurum, SahaFaaliyeti as SahaFaaliyetiType, SahaFaaliyetTipi } from '../types/erp';
import { db, saveDocument } from '../lib/firebase';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { compressImage } from '../lib/imageCompress';
import { buildPersonelListForMonth, getYoklamaDay, isDayActiveForPersonel, isTaseronPersonel, isIdariPersonel, setYoklamaDay, isKampciTesisatciMermerci } from '../lib/yoklamaUtils';
import { buildFormenGunlukOzet } from '../lib/gunlukAkisUtils';
import { buildWhatsAppUrl, isLegacySahaRecord } from '../lib/mobilOnayUtils';
import {
  applySahaMesaiToYoklama,
  filterFormenDayFaaliyetleri,
  formatMesaiFaaliyetLabel,
  isMesaiSahaFaaliyet,
  normalizeMesaiHours as normalizeSahaMesaiHours,
  getFaaliyetFoto,
  getFaaliyetFotolar,
  MAX_SAHA_FOTO_COUNT,
} from '../lib/sahaFaaliyetUtils';
import { PARSEL_BLOK_MAP, PARSEL_LIST, defaultBlokForParsel } from '../data/parselBlokMap';
import { normalizeDateKey, formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { downloadCsv } from '../lib/reportExport';
import { KibritciLogo } from './KibritciLogo';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import { KIBRITCI_LOGO_PATH } from '../lib/kibritciBrand';
import type { SahaFaaliyetSaveSource } from '../lib/sahaFaaliyetPersistence';
import { FAALIYET_ETIKET_ONSETLERI, normalizeFaaliyetEtiketi } from '../lib/faaliyetEtiketUtils';

interface FormenScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  setYoklamalar: React.Dispatch<React.SetStateAction<AylikYoklamaMap>>;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  sahaFaaliyetleri: SahaFaaliyetiType[];
  setSahaFaaliyetleri: (updater: SahaFaaliyetiType[] | ((s: SahaFaaliyetiType[]) => SahaFaaliyetiType[])) => void;
  saveSahaFaaliyetNow?: (
    record: SahaFaaliyetiType,
    kaynak?: SahaFaaliyetSaveSource
  ) => Promise<unknown>;
  removeSahaFaaliyetNow?: (record: SahaFaaliyetiType) => Promise<unknown>;
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  kullanicilar?: any[];
}

export const FormenScreen: React.FC<FormenScreenProps> = ({
  personeller,
  yoklamalar,
  setYoklamalar,
  saveYoklamalarNow,
  sahaFaaliyetleri,
  setSahaFaaliyetleri,
  saveSahaFaaliyetNow,
  removeSahaFaaliyetNow,
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

  // Active Tab: 'yoklama' | 'saha_faaliyet' | 'personel_giris' | 'personel_listesi'
  const [activeTab, setActiveTab] = useState<'yoklama' | 'saha_faaliyet' | 'personel_giris' | 'personel_listesi' | 'gunluk_akis' | 'aylik_puantaj'>('yoklama');
  const [sendingGunlukAkis, setSendingGunlukAkis] = useState(false);

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

    try {
      const docRef = doc(db, 'personeller', p.id);
      await updateDoc(docRef, {
        gecmis: arrayUnion({
          id: `log_${Date.now()}`,
          tarih: `${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
          islem,
          detay,
        }),
      });
    } catch (error) {
      console.error('Error logging to personnel history:', error);
    }
  };

  // Selected Date - Defaults to today's date in Turkey time
  const [selectedDate, setSelectedDate] = useState(todayDateKey);

  const formenEmail = currentUser?.email?.trim().toLowerCase() || '';
  const formenUid = currentUser?.uid || '';

  const selectedDateFaaliyetleri = useMemo(
    () => filterFormenDayFaaliyetleri(sahaFaaliyetleri, selectedDate, formenEmail, formenUid, isLegacySahaRecord),
    [sahaFaaliyetleri, selectedDate, formenEmail, formenUid]
  );

  const daySahaFaaliyetleri = selectedDateFaaliyetleri;

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
  const [aylikDraft, setAylikDraft] = useState<AylikYoklamaMap>({});
  const [aylikDirty, setAylikDirty] = useState(false);
  const [aylikSaving, setAylikSaving] = useState(false);
  const [aylikFocusDay, setAylikFocusDay] = useState(1);
  const [aylikPersonSearch, setAylikPersonSearch] = useState('');
  const [aylikDirtyKeys, setAylikDirtyKeys] = useState<string[]>([]);
  const [aylikShowGrid, setAylikShowGrid] = useState(false);
  const [aylikMesaiEdit, setAylikMesaiEdit] = useState<{ personelId: string; day: number } | null>(null);
  const [aylikMesaiInput, setAylikMesaiInput] = useState('');
  const aylikStatusOptions: YoklamaDurum[] = ['Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil', 'Girilmedi'];
  const [attendanceTouchedIds, setAttendanceTouchedIds] = useState<string[]>([]);
  const [hasLocalAttendanceDraft, setHasLocalAttendanceDraft] = useState(false);
  const [spotlightMesai, setSpotlightMesai] = useState<string>('0');
  const [lastAttendanceSaveAt, setLastAttendanceSaveAt] = useState<string | null>(null);

  // 2. SAHA FAALİYETİ STATE
  const [isNiteligi, setIsNiteligi] = useState('');
  const [parsel, setParsel] = useState('Parsel Bölge 157/46');
  const [blok, setBlok] = useState('GENEL SAHA');
  const [aciklama, setAciklama] = useState('');
  const [isEtiketi, setIsEtiketi] = useState('');
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [faaliyetPersonelIds, setFaaliyetPersonelIds] = useState<string[]>([]);
  const [faaliyetPersonelSearch, setFaaliyetPersonelSearch] = useState('');
  const [sahaUstaSayisi, setSahaUstaSayisi] = useState<number>(0);
  const [sahaIsciSayisi, setSahaIsciSayisi] = useState<number>(0);
  const [faaliyetTipi, setFaaliyetTipi] = useState<SahaFaaliyetTipi>('NORMAL');
  const [personelMesaiSaatleri, setPersonelMesaiSaatleri] = useState<Record<string, number>>({});
  /** Mesai input yazımı sırasında serbest metin (14'e zorlanma hatasını önler) */
  const [personelMesaiDraft, setPersonelMesaiDraft] = useState<Record<string, string>>({});

  // 3. PERSONEL GİRİŞE YOLLA STATE
  const [yeniAd, setYeniAd] = useState('');
  const [yeniSoyad, setYeniSoyad] = useState('');
  const [yeniGorev, setYeniGorev] = useState('');
  const [yeniKimlikFotolar, setYeniKimlikFotolar] = useState<string[]>([]);
  const MAX_KIMLIK_FOTO = 2;
  const [personelGirisListesi, setPersonelGirisListesi] = useState<any[]>([]);

  // 4. FAALİYET EDİT STATES
  const [editingFaaliyetId, setEditingFaaliyetId] = useState<string | null>(null);
  const [lastDeletedFaaliyet, setLastDeletedFaaliyet] = useState<SahaFaaliyetiType | null>(null);

  // 5. FİİLİ GÜNLÜK RAPOR STATES
  const [havaDurumu, setHavaDurumu] = useState('Güneşli');
  const [genelNotlar, setGenelNotlar] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [sendingPdfRapor, setSendingPdfRapor] = useState(false);

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
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savingFaaliyet, setSavingFaaliyet] = useState(false);

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

  const parsellerList = PARSEL_LIST;

  const monthPersonelList = buildPersonelListForMonth(personeller, yoklamalar, year, month);
  const activeStaff = monthPersonelList.filter((p) => {
    if (isTaseronPersonel(p) || isIdariPersonel(p)) return false;
    // Kampçı, Tesisatçı ve Mermerci personeller Kampçı ekranında listelenecektir.
    if (isKampciTesisatciMermerci(p.gorev)) return false;
    return isDayActiveForPersonel(p, year, month, day, yoklamalar[p.id] as any);
  });
  const assignedPersonelOnSelectedDate = useMemo(() => {
    const ids = new Set<string>();
    selectedDateFaaliyetleri.forEach((f) => {
      if (editingFaaliyetId === f.id) return;
      (f.aktifPersonelListesi || []).forEach((id) => ids.add(id));
    });
    return ids;
  }, [selectedDateFaaliyetleri, editingFaaliyetId]);

  const faaliyetPersonelPoolBase = activeStaff.filter(
    (p) => presentIds.includes(p.id) && !assignedPersonelOnSelectedDate.has(p.id)
  );
  const filteredFaaliyetPersonelPool = faaliyetPersonelPoolBase.filter((p) => {
    const q = faaliyetPersonelSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    return (
      `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR').includes(q) ||
      String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  });

  const parseDateParts = (dateStr: string) => {
    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    return { y, m, d };
  };
  const getAttendanceSummaryForDate = (dateStr: string) => {
    const { y, m, d } = parseDateParts(dateStr);
    if (!y || !m || !d) return { gelenCount: 0, gelenIds: [] as string[] };
    const gelenIds = activeStaff
      .filter((p) => {
        const dayData = getYoklamaDay(yoklamalar[p.id], y, m, d);
        return dayData?.durum === 'Geldi';
      })
      .map((p) => p.id);
    return { gelenCount: gelenIds.length, gelenIds };
  };
  const selectedDateAttendance = getAttendanceSummaryForDate(selectedDate);

  // Handlers for personel action requests

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
    if (hasLocalAttendanceDraft) return;
    const present: string[] = [];
    const absent: string[] = [];
    const localMesai: Record<string, number> = {};

    activeStaff.forEach(p => {
      const dayData = getYoklamaDay(yoklamalar[p.id], year, month, day);
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
    setFaaliyetPersonelIds([]);
  }, [selectedDate, yoklamalar, personeller, hasLocalAttendanceDraft]);

  useEffect(() => {
    setHasLocalAttendanceDraft(false);
    setAttendanceTouchedIds([]);
  }, [selectedDate]);

  useEffect(() => {
    setAylikFocusDay(day);
  }, [month, year]);

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

  // Load and subscribe to Daily Field Reports
  useEffect(() => {
    const coll = collection(db, 'gunlukSahaRaporlari');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const reports: Record<string, any> = {};
      snapshot.forEach((doc) => {
        reports[doc.id] = doc.data();
      });
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
  const getInitials = (ad?: string, soyad?: string): string => {
    const a = (ad || '?').trim();
    const s = (soyad || '').trim();
    return `${a.charAt(0) || '?'}${s.charAt(0) || ''}`;
  };
  const getDisplayName = (ad?: string, soyad?: string): string =>
    `${ad || '-'} ${soyad || ''}`.trim();

  const remainingStaff = activeStaff.filter(p => !presentIds.includes(p.id) && !absentIds.includes(p.id));
  const filteredRemaining = remainingStaff.filter(p => 
    `${p.ad} ${p.soyad}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.gorev || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Spotlight staff (the first unmarked employee in the pile)
  const spotlightStaff = filteredRemaining[0] || null;

  const setMesaiWithDraft = (id: string, value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(24, value)) : 0;
    touchAttendance(id);
    setMesaiSaatleri(prev => ({ ...prev, [id]: safe }));
  };

  const touchAttendance = (id: string) => {
    setHasLocalAttendanceDraft(true);
    setAttendanceTouchedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // Actions
  const handleMarkPresent = (id: string, mesai: number = 0) => {
    touchAttendance(id);
    setPresentIds(prev => [...prev.filter(x => x !== id), id]);
    setAbsentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: Math.max(0, Math.min(24, mesai)) }));
  };

  const handleMarkAbsent = (id: string) => {
    touchAttendance(id);
    setAbsentIds(prev => [...prev.filter(x => x !== id), id]);
    setPresentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: 0 }));
  };

  const handleResetMark = (id: string) => {
    touchAttendance(id);
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
    setHasLocalAttendanceDraft(true);
    setAttendanceTouchedIds((prev) => Array.from(new Set([...prev, ...unmarkedIds])));
    setPresentIds(prev => Array.from(new Set([...prev, ...unmarkedIds])));
    setAbsentIds(prev => prev.filter(id => !unmarkedIds.includes(id)));
    const copy = { ...mesaiSaatleri };
    unmarkedIds.forEach(id => {
      copy[id] = 0;
    });
    setMesaiSaatleri(copy);
  };

  // Digital Signature Save — yalnızca dokunulan personeller yazılır; işaretsiz eski kayıt silinmez
  const handleSaveYoklama = async () => {
    if (savingAttendance) return;
    setSavingAttendance(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) {
        showStatus('error', authBlock);
        return;
      }
      const next = { ...yoklamalar };
      const idsToWrite =
        attendanceTouchedIds.length > 0
          ? attendanceTouchedIds
          : [...presentIds, ...absentIds];

      idsToWrite.forEach((pid) => {
        const dayData = getYoklamaDay(next[pid], year, month, day);
        if (presentIds.includes(pid)) {
          next[pid] = setYoklamaDay(next[pid], year, month, day, {
            ...(dayData || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 }),
            durum: 'Geldi',
            mesaiSaati: mesaiSaatleri[pid] || 0,
            gonderen: currentUser?.email || 'formen',
          });
        } else if (absentIds.includes(pid)) {
          next[pid] = setYoklamaDay(next[pid], year, month, day, {
            ...(dayData || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 }),
            durum: 'Yok',
            mesaiSaati: 0,
            gonderen: currentUser?.email || 'formen',
          });
        } else {
          // Formen bu kişiyi bilinçli sıfırladı → ancak o zaman Girilmedi
          next[pid] = setYoklamaDay(next[pid], year, month, day, {
            durum: 'Girilmedi',
            mesaiSaati: 0,
            gonderen: currentUser?.email || 'formen',
          });
        }
      });

      if (saveYoklamalarNow) {
        await saveYoklamalarNow(next);
      } else {
        setYoklamalar(next);
      }

      setHasLocalAttendanceDraft(false);
      setAttendanceTouchedIds([]);
      setLastAttendanceSaveAt(new Date().toLocaleString('tr-TR'));
      showStatus('success', `📅 ${selectedDate} Tarihli Yoklama ve Mesai Saatleri, Formen imzasıyla başarıyla sisteme kaydedildi ve ana programa gönderildi!`);
    } catch (err: any) {
      showStatus('error', formatFirestoreWriteError(err, err?.message || 'Yoklama kaydedilemedi'));
    } finally {
      setSavingAttendance(false);
    }
  };

  const escapeHtml = (value: string): string =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const buildGunlukCalisanListesi = () => {
    const dateLabel = selectedDate.split('-').reverse().join('.');
    const presentStaff = activeStaff.filter((p) => presentIds.includes(p.id));
    const satirlar = presentStaff.map((p, index) => {
      const personAssignments = daySahaFaaliyetleri
        .filter((f) => Array.isArray((f as any).aktifPersonelListesi) && (f as any).aktifPersonelListesi.includes(p.id))
        .map((f) => `${f.parsel} / ${f.blok || 'GENEL SAHA'}`);
      const assignmentText = personAssignments.length > 0 ? personAssignments.join(', ') : 'GENEL SAHA / Planlama Bekleniyor';
      return {
        sira: index + 1,
        adSoyad: `${p.ad} ${p.soyad}`,
        gorev: p.gorev || '-',
        mesai: Number(mesaiSaatleri[p.id] || 0),
        yer: assignmentText,
      };
    });
    return { dateLabel, satirlar };
  };

  const handleShareGunlukCalisanWhatsApp = () => {
    const { dateLabel, satirlar } = buildGunlukCalisanListesi();
    if (satirlar.length === 0) {
      showStatus('error', 'Önce günlük yoklamada gelen personelleri kaydedin.');
      return;
    }
    const metin = [
      `KIBRITCI INSAAT - GUNLUK CALISAN LISTESI`,
      `Tarih: ${dateLabel}`,
      `Formen: ${currentUser?.displayName || currentUser?.email || '-'}`,
      `Toplam Calisan: ${satirlar.length}`,
      '----------------------------------------',
      ...satirlar.map((s) => `${s.sira}. ${s.adSoyad} | ${s.gorev} | Gorev Yeri: ${s.yer} | Mesai: +${s.mesai} saat`),
    ].join('\n');
    window.open(buildWhatsAppUrl(metin), '_blank');
  };

  const handlePrintGunlukCalisanPdf = () => {
    const { dateLabel, satirlar } = buildGunlukCalisanListesi();
    if (satirlar.length === 0) {
      showStatus('error', 'PDF için günlük çalışan listesi bulunamadı.');
      return;
    }
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Gunluk Calisan Listesi</title>
<style>
body{font-family:Arial,sans-serif;padding:20px;color:#0f172a}
h1{font-size:16px;margin:0 0 4px 0} .meta{font-size:12px;color:#475569;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}
th{background:#f1f5f9}
</style></head><body>
<h1>KIBRITCI INSAAT - GUNLUK CALISAN LISTESI</h1>
<div class="meta">Tarih: ${escapeHtml(dateLabel)} | Formen: ${escapeHtml(currentUser?.displayName || currentUser?.email || '-')} | Toplam: ${satirlar.length}</div>
<table>
<thead><tr><th>#</th><th>Ad Soyad</th><th>Gorev</th><th>Gorev Yeri</th><th>Mesai (+saat)</th></tr></thead>
<tbody>
${satirlar
  .map(
    (s) =>
      `<tr><td>${s.sira}</td><td>${escapeHtml(s.adSoyad)}</td><td>${escapeHtml(s.gorev)}</td><td>${escapeHtml(s.yer)}</td><td>${s.mesai}</td></tr>`
  )
  .join('')}
</tbody></table>
</body></html>`;
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => printWin.print(), 250);
  };

  const handleExportAylikPuantajCsv = () => {
    const sourceMap = aylikDirty ? aylikDraft : yoklamalar;
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const rows: string[][] = [
      ['Personel', 'Gorev', ...days.map((d) => String(d)), 'Gelen Gun', 'Toplam Mesai (saat)'],
    ];

    monthPersonelList.forEach((p) => {
      const map = sourceMap[p.id] as any;
      let geldi = 0;
      let toplamMesai = 0;
      const dayCells = days.map((d) => {
        if (!isDayActiveForPersonel(p, year, month, d, map)) return 'C';
        const dayData = getYoklamaDay(map, year, month, d);
        const durum = dayData?.durum || 'Girilmedi';
        const mesai = Number(dayData?.mesaiSaati || 0);
        if (durum === 'Geldi') geldi += 1;
        toplamMesai += mesai;
        return mesai > 0 ? `${durum} (+${mesai})` : durum;
      });
      rows.push([`${p.ad} ${p.soyad}`, p.gorev || '-', ...dayCells, String(geldi), toplamMesai.toFixed(2)]);
    });

    const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
    downloadCsv(rows, `Formen_Aylik_Puantaj_${periodLabel}.csv`);
    showStatus('success', 'Aylik puantaj CSV raporu indirildi.');
  };

  useEffect(() => {
    if (activeTab !== 'aylik_puantaj') return;
    if (aylikDirty) return;
    setAylikDraft(yoklamalar);
    setAylikDirtyKeys([]);
  }, [activeTab, yoklamalar, year, month, aylikDirty]);

  const markAylikDirtyCell = (personelId: string, d: number) => {
    const key = `${personelId}|${d}`;
    setAylikDirtyKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setAylikDirty(true);
  };

  const setAylikDayStatus = (personelId: string, d: number, status: YoklamaDurum) => {
    const p = monthPersonelList.find((x) => x.id === personelId);
    if (!p) return;
    const personMap = aylikDraft[personelId];
    if (!isDayActiveForPersonel(p, year, month, d, personMap as any)) return;

    const dayData =
      getYoklamaDay(personMap, year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });

    setAylikDraft((prev) => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], year, month, d, {
        ...dayData,
        durum: status,
        mesaiSaati: status === 'Geldi' ? dayData.mesaiSaati : status === 'Yok' || status === 'Girilmedi' ? 0 : dayData.mesaiSaati,
        gonderen: currentUser?.email || 'formen',
      }),
    }));
    markAylikDirtyCell(personelId, d);
  };

  const setAylikDayMesai = (personelId: string, d: number, hoursRaw: number) => {
    const hours = Math.max(0, Math.min(24, Math.round(Number(hoursRaw) * 2) / 2));
    const dayData =
      getYoklamaDay(aylikDraft[personelId], year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
    const nextDurum =
      hours > 0 && (dayData.durum === 'Girilmedi' || dayData.durum === 'Yok')
        ? ('Geldi' as YoklamaDurum)
        : dayData.durum;

    setAylikDraft((prev) => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], year, month, d, {
        ...dayData,
        durum: nextDurum,
        mesaiSaati: hours,
        gonderen: currentUser?.email || 'formen',
      }),
    }));
    markAylikDirtyCell(personelId, d);
  };

  const handleAylikCellCycle = (personelId: string, d: number) => {
    const dayData =
      getYoklamaDay(aylikDraft[personelId], year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
    const idx = aylikStatusOptions.indexOf(dayData.durum as YoklamaDurum);
    const nextStatus = aylikStatusOptions[(idx + 1) % aylikStatusOptions.length];
    setAylikDayStatus(personelId, d, nextStatus);
  };

  const openAylikMesaiEdit = (personelId: string, d: number) => {
    const dayData = getYoklamaDay(aylikDraft[personelId], year, month, d);
    setAylikMesaiEdit({ personelId, day: d });
    setAylikMesaiInput(String(Number(dayData?.mesaiSaati || 0) || ''));
  };

  const applyAylikMesaiEdit = () => {
    if (!aylikMesaiEdit) return;
    const raw = Number(String(aylikMesaiInput).replace(',', '.'));
    const hours = Number.isFinite(raw) ? Math.max(0, Math.min(24, Math.round(raw * 2) / 2)) : 0;
    setAylikDayMesai(aylikMesaiEdit.personelId, aylikMesaiEdit.day, hours);
    setAylikMesaiEdit(null);
    setAylikMesaiInput('');
  };

  const handleSaveAylikPuantaj = async () => {
    if (aylikSaving) return;
    if (aylikDirtyKeys.length === 0) {
      showStatus('error', 'Kaydedilecek değişiklik yok.');
      return;
    }
    setAylikSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) {
        showStatus('error', authBlock);
        return;
      }

      // Yalnızca değişen gün hücrelerini yaz — diğer kayıtlar korunur
      const sparse: AylikYoklamaMap = {};
      for (const key of aylikDirtyKeys) {
        const [personelId, dayStr] = key.split('|');
        const d = Number(dayStr);
        if (!personelId || !d) continue;
        const dayData = getYoklamaDay(aylikDraft[personelId], year, month, d);
        if (!dayData) continue;
        sparse[personelId] = setYoklamaDay(sparse[personelId], year, month, d, {
          ...dayData,
          gonderen: currentUser?.email || 'formen',
        });
      }

      if (Object.keys(sparse).length === 0) {
        showStatus('error', 'Kaydedilecek hücre bulunamadı.');
        return;
      }

      const changedCount = aylikDirtyKeys.length;
      if (saveYoklamalarNow) {
        await saveYoklamalarNow(sparse);
      } else {
        setYoklamalar((prev) => {
          const merged = { ...prev };
          for (const [pid, days] of Object.entries(sparse)) {
            merged[pid] = { ...(merged[pid] || {}), ...(days as object) } as any;
          }
          return merged;
        });
      }
      setAylikDirty(false);
      setAylikDirtyKeys([]);
      showStatus(
        'success',
        `${String(month).padStart(2, '0')}/${year} · ${changedCount} gün hücresi kaydedildi.`
      );
    } catch (err: any) {
      showStatus('error', formatFirestoreWriteError(err, err?.message || 'Aylık puantaj kaydedilemedi'));
    } finally {
      setAylikSaving(false);
    }
  };

  const resetAylikDraft = () => {
    setAylikDraft(yoklamalar);
    setAylikDirty(false);
    setAylikDirtyKeys([]);
    setAylikMesaiEdit(null);
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

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const remaining = MAX_SAHA_FOTO_COUNT - fotoUrls.length;
    if (remaining <= 0) {
      showStatus('error', `En fazla ${MAX_SAHA_FOTO_COUNT} fotoğraf eklenebilir.`);
      e.target.value = '';
      return;
    }

    const toProcess = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      showStatus('error', `En fazla ${MAX_SAHA_FOTO_COUNT} fotoğraf — ${remaining} adet eklendi.`);
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
      setFotoUrls((prev) => [...prev, ...added].slice(0, MAX_SAHA_FOTO_COUNT));
      if (files.length <= remaining) {
        showStatus('success', `${added.length} fotoğraf eklendi (${Math.min(fotoUrls.length + added.length, MAX_SAHA_FOTO_COUNT)}/${MAX_SAHA_FOTO_COUNT}).`);
      }
    } catch {
      showStatus('error', 'Fotoğraf yüklenemedi, tekrar deneyin.');
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveFoto = (index: number) => {
    setFotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFillWorkerCountsFromSelection = () => {
    if (!faaliyetPersonelIds.length) {
      setSahaUstaSayisi(0);
      setSahaIsciSayisi(0);
      showStatus('error', 'Önce listeden personel seçin.');
      return;
    }
    let usta = 0;
    let isci = 0;
    faaliyetPersonelIds.forEach((pid) => {
      const p = personeller.find((x) => x.id === pid);
      const gorev = String(p?.gorev || '').toLocaleLowerCase('tr-TR');
      if (gorev.includes('usta')) {
        usta += 1;
      } else {
        isci += 1;
      }
    });
    setSahaUstaSayisi(usta);
    setSahaIsciSayisi(isci);
    showStatus('success', `Seçimden sayı dolduruldu: ${usta} usta, ${isci} düz işçi.`);
  };

  const logAssignedPersonelHistory = async (faaliyet: SahaFaaliyetiType) => {
    if (!Array.isArray(faaliyet.aktifPersonelListesi) || faaliyet.aktifPersonelListesi.length === 0) return;
    const faaliyetOzeti = `${faaliyet.tarih} tarihinde "${faaliyet.isNiteligi}" işi için ${faaliyet.parsel} / ${faaliyet.blok} sahasında görevlendirildi.`;
    await Promise.all(
      faaliyet.aktifPersonelListesi.map(async (pid) => {
        try {
          const personelRef = doc(db, 'personeller', pid);
          await updateDoc(personelRef, {
            gecmis: arrayUnion({
              id: `saha_gorev_${faaliyet.id}_${pid}`,
              tarih: `${faaliyet.tarih} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
              islem: 'Saha Görevlendirme',
              detay: faaliyetOzeti,
              kaynak: 'FORMEN_MOBIL',
            }),
          });
        } catch (error) {
          console.error('Personel görev geçmişi güncellenemedi:', pid, error);
        }
      })
    );
  };

  // Submit Saha Faaliyeti
  const resetFaaliyetForm = () => {
    setIsNiteligi('');
    setAciklama('');
    setIsEtiketi('');
    setFotoUrls([]);
    setSahaUstaSayisi(0);
    setSahaIsciSayisi(0);
    setFaaliyetPersonelIds([]);
    setFaaliyetPersonelSearch('');
    setFaaliyetTipi('NORMAL');
    setPersonelMesaiSaatleri({});
    setPersonelMesaiDraft({});
    setEditingFaaliyetId(null);
  };

  const loadFaaliyetIntoForm = (sf: SahaFaaliyetiType) => {
    setEditingFaaliyetId(sf.id);
    setSelectedDate(normalizeDateKey(sf.tarih) || selectedDate);
    setIsNiteligi(sf.isNiteligi);
    setParsel(sf.parsel);
    setBlok(sf.blok);
    setAciklama(sf.aciklama || '');
    setIsEtiketi(sf.isEtiketi || '');
    setFotoUrls(getFaaliyetFotolar(sf));
    setFaaliyetPersonelIds(Array.isArray(sf.aktifPersonelListesi) ? [...sf.aktifPersonelListesi] : []);
    setSahaUstaSayisi(sf.ustaSayisi || 0);
    setSahaIsciSayisi(sf.isciSayisi || 0);
    setFaaliyetTipi(sf.faaliyetTipi || 'NORMAL');
    const mesaiMap = { ...(sf.personelMesaiSaatleri || {}) };
    setPersonelMesaiSaatleri(mesaiMap);
    setPersonelMesaiDraft(
      Object.fromEntries(
        Object.entries(mesaiMap).map(([id, h]) => [id, String(h)])
      )
    );
    setFaaliyetPersonelSearch('');
  };

  const syncMesaiFromFaaliyet = async (
    tarih: string,
    mesaiMap: Record<string, number> | undefined,
    previousMesaiMap?: Record<string, number>
  ) => {
    const hasNew = mesaiMap && Object.values(mesaiMap).some((h) => Number(h) > 0);
    const hasPrev = previousMesaiMap && Object.values(previousMesaiMap).some((h) => Number(h) > 0);
    if (!hasNew && !hasPrev) return;

    let next = { ...yoklamalar };
    const gonderen = formenEmail || 'FORMEN_MOBIL';
    if (hasPrev) {
      next = applySahaMesaiToYoklama(next, tarih, previousMesaiMap, gonderen, 'subtract');
    }
    if (hasNew) {
      next = applySahaMesaiToYoklama(next, tarih, mesaiMap, gonderen, 'add');
    }
    if (saveYoklamalarNow) {
      await saveYoklamalarNow(next);
    } else {
      setYoklamalar(next);
    }
  };

  const resolveMesaiMapForSave = (): Record<string, number> => {
    const map = { ...personelMesaiSaatleri };
    faaliyetPersonelIds.forEach((id) => {
      const draft = personelMesaiDraft[id];
      if (draft !== undefined && draft.trim() !== '') {
        const parsed = parseFloat(String(draft).replace(',', '.'));
        map[id] = normalizeSahaMesaiHours(Number.isFinite(parsed) ? parsed : 0);
      } else if (map[id] === undefined) {
        map[id] = 0;
      }
    });
    return map;
  };

  const handleSaveFaaliyet = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (savingFaaliyet) return;
    if (!isNiteligi) {
      showStatus('error', 'Lütfen iş niteliğini giriniz veya şablondan seçiniz!');
      return;
    }

    const mesaiMapForSave = faaliyetTipi === 'MESAI_SAHA' ? resolveMesaiMapForSave() : {};

    if (faaliyetTipi === 'MESAI_SAHA') {
      setPersonelMesaiSaatleri(mesaiMapForSave);
      const hasMesai = faaliyetPersonelIds.some((id) => Number(mesaiMapForSave[id] || 0) > 0);
      if (!hasMesai) {
        showStatus('error', 'Mesai Saha Faaliyeti için en az bir personele mesai saati girin.');
        return;
      }
    }

    const previousRecord = editingFaaliyetId
      ? sahaFaaliyetleri.find((f) => f.id === editingFaaliyetId)
      : undefined;

    const faaliyetPayload: SahaFaaliyetiType & { kaydedenFormen?: string } = {
      id: editingFaaliyetId || `sf_${Date.now()}`,
      personelId: previousRecord?.personelId || currentUser?.uid || 'formen_uid',
      tarih: normalizeDateKey(selectedDate),
      isNiteligi,
      parsel,
      blok,
      aciklama,
      isEtiketi: isEtiketi || previousRecord?.isEtiketi || undefined,
      ilerlemeDurumu: previousRecord?.ilerlemeDurumu || (isEtiketi ? 'BASLAMADI' : undefined),
      ilerlemeKayitlari: previousRecord?.ilerlemeKayitlari,
      fotoUrls: fotoUrls.length ? fotoUrls : undefined,
      fotoUrl: fotoUrls[0] || undefined,
      aktifPersonelListesi: faaliyetPersonelIds,
      ustaSayisi: sahaUstaSayisi,
      isciSayisi: sahaIsciSayisi,
      faaliyetTipi,
      personelMesaiSaatleri:
        faaliyetTipi === 'MESAI_SAHA'
          ? Object.fromEntries(
              faaliyetPersonelIds
                .map((id) => [id, normalizeSahaMesaiHours(Number(mesaiMapForSave[id] || 0))])
                .filter(([, h]) => Number(h) > 0)
            )
          : undefined,
      kaydedenFormen: previousRecord?.kaydedenFormen || formenEmail,
      kaydeden: previousRecord?.kaydeden || currentUser?.displayName || currentUser?.email || 'FORMEN',
      kaydedenUid: previousRecord?.kaydedenUid || currentUser?.uid || '',
      kaynakEkran: previousRecord?.kaynakEkran || 'FORMEN_MOBIL',
      programaGonderildi: true,
      programaGonderimTarihi: previousRecord?.programaGonderimTarihi || new Date().toISOString(),
      iceriAktarimDurumu: previousRecord?.iceriAktarimDurumu || 'BEKLIYOR',
    };

    setSavingFaaliyet(true);
    try {
      await saveSahaFaaliyetNow!(faaliyetPayload, 'formen_mobil');
      if (!editingFaaliyetId) {
        await logAssignedPersonelHistory(faaliyetPayload);
      }
      if (faaliyetTipi === 'MESAI_SAHA' || isMesaiSahaFaaliyet(previousRecord)) {
        await syncMesaiFromFaaliyet(
          selectedDate,
          faaliyetTipi === 'MESAI_SAHA' ? faaliyetPayload.personelMesaiSaatleri : undefined,
          isMesaiSahaFaaliyet(previousRecord) ? previousRecord?.personelMesaiSaatleri : undefined
        );
      }
    } catch (err: any) {
      const raw = String(err?.message || 'Bağlantı hatası');
      const low = raw.toLowerCase();
      const msg =
        low.includes('failed to fetch dynamically imported module') ||
        low.includes('importing a module script failed') ||
        low.includes('not a valid javascript mime') ||
        low.includes('text/html')
          ? 'Sayfa güncellenmiş (eski önbellek). Ctrl+F5 ile yenileyip kaydı tekrar deneyin.'
          : raw;
      showStatus('error', `Faaliyet gönderilemedi: ${msg}`);
      return;
    } finally {
      setSavingFaaliyet(false);
    }

    if (editingFaaliyetId) {
      logActionToPersonelHistory('Saha Faaliyeti Güncelledi', `"${isNiteligi}" faaliyet kaydı düzenlendi (${parsel} / ${blok}).`);
      showStatus('success', '✏️ Faaliyet kaydı güncellendi.');
    } else {
      logActionToPersonelHistory('Saha Faaliyeti Ekledi', `"${isNiteligi}" iş niteliğiyle, ${parsel} / ${blok} bölgesinde yeni saha imalat faaliyeti kaydetti.`);
      showStatus(
        'success',
        faaliyetTipi === 'MESAI_SAHA'
          ? '🧱 Mesai saha faaliyeti kaydedildi; mesai saatleri puantaja işlendi.'
          : '🧱 Faaliyet kaydedildi ve ana programa gönderildi.'
      );
    }

    resetFaaliyetForm();
  };

  const handleDeleteFaaliyet = async (faaliyet: SahaFaaliyetiType) => {
    if (!window.confirm('Bu saha raporunu silmek istediğinize emin misiniz?')) return;
    try {
      if (isMesaiSahaFaaliyet(faaliyet)) {
        await syncMesaiFromFaaliyet(faaliyet.tarih, undefined, faaliyet.personelMesaiSaatleri);
      }
      await removeSahaFaaliyetNow!(faaliyet);
      setLastDeletedFaaliyet(faaliyet);
      if (editingFaaliyetId === faaliyet.id) resetFaaliyetForm();
      showStatus('success', 'Rapor silindi veya arşivlendi. Gerekirse geri alabilirsiniz.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Silme işlemi başarısız');
    }
  };

  const buildFormenGunlukAkisMetin = () => {
    const gelenIsimler = activeStaff
      .filter((p) => presentIds.includes(p.id))
      .map((p) => `${p.ad} ${p.soyad}`);
    const mesaiToplamSaat = presentIds.reduce((sum, id) => sum + Number(mesaiSaatleri[id] || 0), 0);
    const sahaOzetleri = daySahaFaaliyetleri.map(
      (sf) => `${sf.isNiteligi || 'Faaliyet'} — ${sf.parsel || '?'}/${sf.blok || '?'}`
    );
    return buildFormenGunlukOzet({
      tarih: selectedDate,
      email: formenEmail,
      gelen: presentIds.length,
      gelmeyen: Math.max(0, activeStaff.length - presentIds.length),
      toplam: activeStaff.length,
      gelenIsimler,
      sahaCount: daySahaFaaliyetleri.length,
      girisCount: personelGirisListesi.filter((g) => g.tarih?.startsWith(selectedDate)).length,
      cikisCount: isCikisTalepleriList.filter((c) => c.tarih?.startsWith(selectedDate)).length,
      mesaiToplamSaat,
      sahaOzetleri,
    });
  };

  const handleShareGunlukAkisWhatsApp = () => {
    const metin = buildFormenGunlukAkisMetin();
    window.open(buildWhatsAppUrl(metin), '_blank');
    showStatus('success', 'Gün sonu özeti WhatsApp’ta açıldı — şefe iletebilirsiniz.');
  };

  const handleSendGunlukAkis = async () => {
    if (!window.confirm(`${selectedDate} tarihli günlük akış raporunu yönetime göndermek istiyor musunuz?`)) return;
    setSendingGunlukAkis(true);
    try {
      const ozetMetin = buildFormenGunlukAkisMetin();
      const gelenIsimler = activeStaff
        .filter((p) => presentIds.includes(p.id))
        .map((p) => `${p.ad} ${p.soyad}`);
      const raporId = `formen_akis_${selectedDate}_${formenEmail.replace(/[@.]/g, '-')}`;
      await saveDocument('mobilGunlukAkisRaporlari', {
        id: raporId,
        tip: 'FORMEN',
        tarih: selectedDate,
        gonderenEmail: formenEmail,
        ozetMetin,
        yoklamaOzet: {
          gelen: presentIds.length,
          gelmeyen: Math.max(0, activeStaff.length - presentIds.length),
          toplam: activeStaff.length,
          isimler: gelenIsimler,
        },
        sahaFaaliyetSayisi: daySahaFaaliyetleri.length,
        durum: 'ONAY BEKLİYOR',
        olusturulma: new Date().toISOString(),
      });
      showStatus('success', 'Günlük akış raporu yönetim onayına gönderildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Rapor gönderilemedi.');
    } finally {
      setSendingGunlukAkis(false);
    }
  };

  const handleSaveGunlukRapor = async () => {
    if (sendingPdfRapor) return;
    setSendingPdfRapor(true);

    const reportId = `report_${selectedDate}`;
    const dayActivities = selectedDateFaaliyetleri;
    const presentStaffNames = activeStaff
      .filter((p) => selectedDateAttendance.gelenIds.includes(p.id))
      .map((p) => `${p.ad} ${p.soyad} (${p.gorev})`);
    const gonderen =
      currentUser?.displayName ||
      (currentUser?.ad ? `${currentUser.ad} ${currentUser.soyad || ''}` : '') ||
      formenEmail ||
      'FORMEN';

    // Firestore 1MB sınırı: base64 fotoğrafları kayda yazma (PDF önizlemede bellekte kalır)
    const leanFaaliyetler = dayActivities.map((sf) => ({
      id: sf.id,
      tarih: sf.tarih,
      isNiteligi: sf.isNiteligi,
      parsel: sf.parsel,
      blok: sf.blok,
      aciklama: sf.aciklama || '',
      faaliyetTipi: sf.faaliyetTipi,
      aktifPersonelListesi: sf.aktifPersonelListesi || [],
      ustaSayisi: sf.ustaSayisi,
      isciSayisi: sf.isciSayisi,
      kaynakEkran: sf.kaynakEkran || 'FORMEN_MOBIL',
      fotoAdedi: getFaaliyetFotolar(sf).length,
    }));

    const reportData = {
      id: reportId,
      tarih: selectedDate,
      havaDurumu,
      genelNotlar,
      gonderen,
      gonderenFormen: formenEmail,
      toplamEkip: selectedDateAttendance.gelenCount,
      faaliyetler: leanFaaliyetler,
      faaliyetAdet: leanFaaliyetler.length,
      yoklama: presentStaffNames,
      onayDurumu: 'BEKLİYOR',
      durum: 'ONAY BEKLİYOR',
      guncellenmeTarihi: new Date().toISOString(),
      olusturulma: new Date().toISOString(),
      kaynak: 'FORMEN_MOBIL',
    };

    const arsivId = `saha_gun_rapor_${selectedDate}_formen`;
    const arsivData = {
      id: arsivId,
      tarih: selectedDate,
      olusturmaTarihi: new Date().toISOString(),
      olusturan: gonderen,
      gonderenFormen: formenEmail,
      faaliyetIds: dayActivities.map((f) => f.id),
      faaliyetAdet: dayActivities.length,
      formenFaaliyetAdet: dayActivities.length,
      yoklamaOzet: {
        gelen: selectedDateAttendance.gelenCount,
        yok: Math.max(0, activeStaff.length - selectedDateAttendance.gelenCount),
        izinli: 0,
        raporlu: 0,
      },
      aciklama: genelNotlar || '',
      havaDurumu,
      kaynak: 'FORMEN_MOBIL',
    };

    try {
      await Promise.all([
        setDoc(doc(db, 'gunlukSahaRaporlari', reportId), reportData, { merge: true }),
        setDoc(doc(db, 'sahaGunRaporArsiv', arsivId), arsivData, { merge: true }),
      ]);

      // Gün faaliyetlerini arşivlendi olarak işaretle
      const stamp = new Date().toISOString();
      await Promise.all(
        dayActivities.map((sf) =>
          updateDoc(doc(db, 'sahaFaaliyetleri', sf.id), {
            programaGonderildi: true,
            programaGonderimTarihi: stamp,
            iceriAktarimDurumu: 'AKTARILDI',
          }).catch(() => undefined)
        )
      );
      setSahaFaaliyetleri((prev) =>
        prev.map((sf) =>
          dayActivities.some((d) => d.id === sf.id)
            ? {
                ...sf,
                programaGonderildi: true,
                programaGonderimTarihi: stamp,
                iceriAktarimDurumu: 'AKTARILDI',
              }
            : sf
        )
      );

      const faaliyetHtml = dayActivities
        .map((sf, idx) => {
          const fotolar = getFaaliyetFotolar(sf);
          const ekip = (sf.aktifPersonelListesi || [])
            .map((pid) => {
              const p = personeller.find((x) => x.id === pid);
              return p ? `${p.ad} ${p.soyad}` : pid;
            })
            .filter(Boolean);
          const fotoBlock =
            fotolar.length > 0
              ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-top:6px;">${fotolar
                  .slice(0, 4)
                  .map(
                    (url) =>
                      `<img src="${escapeHtml(url)}" alt="foto" style="width:100%;height:72px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" />`
                  )
                  .join('')}</div>${
                  fotolar.length > 1
                    ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${fotolar.length} fotoğraf</div>`
                    : ''
                }`
              : `<div style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:6px;">📷 Görsel eklenmedi</div>`;

          return `<article style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px;page-break-inside:avoid;background:#f8fafc;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;">
              <strong style="font-size:12px;">${idx + 1}. ${escapeHtml(sf.isNiteligi || 'Faaliyet')}</strong>
              <span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;white-space:nowrap;">📍 ${escapeHtml(sf.parsel || '-')} / ${escapeHtml(sf.blok || '-')}</span>
            </div>
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
              <div>
                <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Açıklama</div>
                <p style="font-size:11px;margin:4px 0 8px;white-space:pre-wrap;">${escapeHtml(sf.aciklama || 'Detay açıklaması girilmemiştir.')}</p>
                <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Ekip</div>
                <p style="font-size:10px;margin:4px 0 0;">${escapeHtml(ekip.join(', ') || 'Ekip seçilmedi.')}</p>
              </div>
              <div>${fotoBlock}</div>
            </div>
          </article>`;
        })
        .join('');

      const innerBody = `
        <h1 style="font-size:15px;margin:0 0 6px;">ŞANTİYE GÜNLÜK FİİLİ RAPORU</h1>
        <div style="font-size:11px;color:#475569;margin-bottom:14px;">
          Tarih: ${escapeHtml(formatDateLabelTr(selectedDate))} · Gelen personel: ${selectedDateAttendance.gelenCount} ·
          Formen: ${escapeHtml(gonderen)} · Hava: ${escapeHtml(havaDurumu)}
        </div>
        <h2 style="font-size:12px;margin:16px 0 8px;border-bottom:2px solid #334155;padding-bottom:4px;">1. YOKLAMA ÖZETİ</h2>
        <p style="font-size:11px;">Gelen: <strong>${selectedDateAttendance.gelenCount}</strong> kişi
          ${presentStaffNames.length ? ` — ${escapeHtml(presentStaffNames.slice(0, 20).join(', '))}${presentStaffNames.length > 20 ? '…' : ''}` : ''}
        </p>
        <h2 style="font-size:12px;margin:16px 0 8px;border-bottom:2px solid #334155;padding-bottom:4px;">2. FİİLİ SAHA İMALATLARI (${dayActivities.length})</h2>
        ${faaliyetHtml || '<p style="color:#94a3b8;font-style:italic;">Bugün için faaliyet kaydı yok.</p>'}
        <h2 style="font-size:12px;margin:16px 0 8px;border-bottom:2px solid #334155;padding-bottom:4px;">3. EK ŞANTİYE NOTLARI</h2>
        <p style="font-size:11px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
          ${escapeHtml(genelNotlar || 'Bugün şantiyede herhangi bir aksaklık, malzeme teslimatı veya ek genel durum bildirilmemiştir.')}
        </p>
        <div style="margin-top:18px;padding-top:10px;border-top:2px solid #0f172a;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div style="font-size:10px;color:#64748b;max-width:60%;">
            <strong style="color:#0f172a;">BELGE GÜVENLİĞİ:</strong>
            Bu rapor Formen mobil panelinden dijital olarak onaylanıp arşive kaydedilmiştir.
          </div>
          <div style="border:2px dashed #059669;color:#047857;padding:8px 10px;border-radius:10px;text-align:center;font-size:9px;font-weight:800;">
            KİBRİTÇİ İNŞAAT<br/>E-İMZA ONAYLANDI<br/><span style="font-weight:600;color:#64748b;">FORMEN MOBİL ONAY</span>
          </div>
        </div>`;

      const html = wrapCorporateReportHtml(innerBody, {
        docCode: `FORMEN-${selectedDate}`,
        orientation: 'portrait',
        title: `Şantiye Günlük Fiili Raporu ${selectedDate}`,
        extraCss: 'article{break-inside:avoid}',
      });

      const popup = window.open('', '_blank', 'width=1000,height=700');
      if (popup) {
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        setTimeout(() => {
          try {
            popup.focus();
            popup.print();
          } catch {
            /* ignore */
          }
        }, 600);
        showStatus(
          'success',
          '📄 Rapor arşive kaydedildi. PDF penceresi açıldı — Yazdır / PDF olarak kaydedin.'
        );
      } else {
        // Popup engellendiyse HTML indir
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Santiye_Gunluk_Rapor_${selectedDate}.html`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus(
          'success',
          '📄 Rapor arşive kaydedildi. Pop-up engelli olduğu için HTML dosyası indirildi (açıp yazdırabilirsiniz).'
        );
      }
      setShowPdfPreview(false);
    } catch (err: any) {
      console.error(err);
      showStatus(
        'error',
        `Rapor gönderilemedi: ${err?.message || 'Bağlantı veya yetki hatası'}`
      );
    } finally {
      setSendingPdfRapor(false);
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
                  <KibritciLogo size="sm" className="h-7" />
                  <div>
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
                  onChange={(e) => setSelectedDate(normalizeDateKey(e.target.value))}
                  className="bg-slate-800 text-white border border-slate-700 py-1 px-1.5 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-amber-500 outline-none min-w-[7.5rem] cursor-pointer"
                  title="Başka Tarih Seç"
                />
              </div>

              {/* Segmented control tabs */}
              <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl">
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
                  onClick={() => setActiveTab('aylik_puantaj')}
                  className={`py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'aylik_puantaj' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText size={11} className="mb-0.5" />
                  <span>Aylık Puantaj</span>
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
                  <span>Personel</span>
                </button>
                <button
                  onClick={() => setActiveTab('gunluk_akis')}
                  className={`flex-1 min-w-[4.5rem] py-1.5 rounded-lg text-[8px] font-extrabold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                    activeTab === 'gunluk_akis' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Send size={11} className="mb-0.5" />
                  <span>Günlük Akış</span>
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
                    <div className="bg-slate-50/50 p-1.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold block">Havuz (Kalan)</span>
                      <strong className="text-sm font-black text-slate-800 block">{remainingStaff.length}</strong>
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
                          {getInitials(spotlightStaff.ad, spotlightStaff.soyad)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs tracking-wide text-gray-100 truncate">
                            {getDisplayName(spotlightStaff.ad, spotlightStaff.soyad)}
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
                        filteredRemaining.map(p => {
                          const hrs = mesaiSaatleri[p.id] || 0;
                          return (
                            <div key={p.id} className="flex items-center justify-between py-1.5 pt-2">
                              <div className="min-w-0 flex-grow">
                                <span className="font-bold text-[10px] text-slate-800 block truncate">{p.ad} {p.soyad}</span>
                                <span className="text-[8px] text-slate-400 font-medium block truncate">{p.gorev}</span>
                              </div>
                              <div className="flex items-center space-x-2 shrink-0">
                                {/* Mesai Input Area */}
                                <div className="flex items-center bg-slate-100 rounded-lg px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setMesaiWithDraft(p.id, Math.max(0, hrs - 1))}
                                    className="w-4 h-4 bg-white text-slate-800 rounded font-black text-[9px] hover:bg-slate-200 flex items-center justify-center shadow-sm"
                                  >
                                    -
                                  </button>
                                  <span className="text-[9px] font-black mx-1.5 min-w-[12px] text-center text-slate-700">{hrs}</span>
                                  <button
                                    type="button"
                                    onClick={() => setMesaiWithDraft(p.id, Math.min(24, hrs + 1))}
                                    className="w-4 h-4 bg-white text-slate-800 rounded font-black text-[9px] hover:bg-slate-200 flex items-center justify-center shadow-sm"
                                  >
                                    +
                                  </button>
                                </div>
                                <button 
                                  onClick={() => handleMarkPresent(p.id, hrs)}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-200 transition text-[9px] font-extrabold"
                                  title="Geldi"
                                >
                                  Geldi
                                </button>
                                <button 
                                  onClick={() => handleMarkAbsent(p.id)}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2 py-1 rounded-lg border border-rose-200 transition text-[9px] font-extrabold"
                                  title="Yok"
                                >
                                  Yok
                                </button>
                              </div>
                            </div>
                          );
                        })
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
                      Yalnızca dokunduğunuz personeller güncellenir. İşaretlemediğiniz eski yoklama kayıtları silinmez; yeniden işaretleyip kaydederseniz değişir.
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
                      className="w-full bg-slate-900 hover:bg-slate-950 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-extrabold text-[10px] py-2.5 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
                      disabled={!hasLocalAttendanceDraft || savingAttendance}
                    >
                      <span>{savingAttendance ? '⏳ KAYDEDİLİYOR...' : hasLocalAttendanceDraft ? '✍️ YOKLAMAYI İMZALA VE KAYDET' : '✅ YOKLAMA KAYITLI'}</span>
                    </button>
                    {hasLocalAttendanceDraft && (
                      <p className="text-[9px] text-amber-700 font-bold text-center bg-amber-50 border border-amber-200 rounded-lg py-1.5">
                        Kaydedilmemiş yoklama/mesai değişikliği var.
                      </p>
                    )}
                    {lastAttendanceSaveAt && (
                      <p className="text-[9px] text-slate-600 font-bold text-center bg-slate-100 border border-slate-200 rounded-lg py-1.5">
                        Son kayıt: {lastAttendanceSaveAt}
                      </p>
                    )}
                  </div>

                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex items-center space-x-2 text-slate-900">
                      <FileText size={14} className="text-amber-500" />
                      <span className="font-bold text-[10px] uppercase tracking-wider">FORMEN RAPORLARI</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug">
                      Günlük çalışan listesi (görev yeri + mesai) raporunu WhatsApp metni veya PDF olarak paylaşın. Aylık puantajı da CSV olarak dışa aktarabilirsiniz.
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={handleShareGunlukCalisanWhatsApp}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-2.5 rounded-xl transition"
                      >
                        WhatsApp: Günlük Çalışan Listesi
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintGunlukCalisanPdf}
                        className="w-full bg-slate-900 hover:bg-slate-950 text-white font-black text-[10px] py-2.5 rounded-xl transition"
                      >
                        PDF: Günlük Çalışan Listesi
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('aylik_puantaj')}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-2.5 rounded-xl transition"
                      >
                        Aylık Puantaj Tablosunu Aç
                      </button>
                    </div>
                  </div>

                  {/* 4. MARKED HISTORY & UNDO OVERVIEW */}
                  {(presentIds.length > 0 || absentIds.length > 0) && (
                    <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block">Mevcut İşaretliler ({presentIds.length + absentIds.length})</span>
                        <button
                          onClick={() => {
                            setHasLocalAttendanceDraft(true);
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
                                    onClick={() => setMesaiWithDraft(id, Math.max(0, (mesaiSaatleri[id] || 0) - 1))}
                                    className="w-4 h-4 bg-white text-slate-800 rounded font-black text-[9px] hover:bg-slate-200"
                                  >
                                    -
                                  </button>
                                  <span className="text-[9px] font-black mx-1.5 min-w-[8px] text-center text-slate-700">{hrs}</span>
                                  <button
                                    onClick={() => setMesaiWithDraft(id, Math.min(12, (mesaiSaatleri[id] || 0) + 1))}
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
                  {lastDeletedFaaliyet && (
                    <div className="bg-amber-50 border border-amber-300 p-2.5 rounded-2xl flex items-center justify-between text-[9px] font-bold text-amber-900 shadow-sm mb-3">
                      <span>🗑️ Faaliyet silindi. Geri almak ister misiniz?</span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!lastDeletedFaaliyet) return;
                          try {
                            await saveSahaFaaliyetNow!(lastDeletedFaaliyet, 'restore');
                            setLastDeletedFaaliyet(null);
                            showStatus('success', 'Silme işlemi geri alındı, faaliyet başarıyla kurtarıldı!');
                          } catch (err: any) {
                            showStatus('error', err?.message || 'Geri alma başarısız');
                          }
                        }}
                        className="bg-amber-600 text-white px-2 py-1 rounded-lg text-[8px] uppercase tracking-wider hover:bg-amber-700"
                      >
                        Geri Al
                      </button>
                    </div>
                  )}

                  {editingFaaliyetId && (
                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-2xl flex items-center justify-between text-[9px] font-bold text-slate-800 shadow-sm mb-3">
                      <span>✏️ Kayıt düzenleniyor — değişiklikleri kaydetmek için formu kullanın.</span>
                      <button
                        type="button"
                        onClick={resetFaaliyetForm}
                        className="bg-white border border-slate-200 text-slate-800 px-2 py-1 rounded-lg text-[8px] uppercase"
                      >
                        İptal
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSaveFaaliyet} className="space-y-3.5 animate-in fade-in duration-150">
                  
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    
                    {/* Header */}
                    <div className="flex items-center space-x-2 text-slate-950">
                      <Briefcase size={14} className="text-amber-500" />
                      <span className="font-bold text-[10px] uppercase tracking-wider">
                        {editingFaaliyetId ? 'SAHA FAALİYET DÜZENLE' : 'GÜNLÜK SAHA FAALİYET GİRİŞİ'}
                      </span>
                    </div>

                    {/* Faaliyet tipi */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFaaliyetTipi('NORMAL')}
                        className={`py-2 px-2 rounded-xl text-[9px] font-black border transition ${
                          faaliyetTipi === 'NORMAL'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Normal Saha Faaliyeti
                      </button>
                      <button
                        type="button"
                        onClick={() => setFaaliyetTipi('MESAI_SAHA')}
                        className={`py-2 px-2 rounded-xl text-[9px] font-black border transition ${
                          faaliyetTipi === 'MESAI_SAHA'
                            ? 'bg-amber-500 text-slate-950 border-amber-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50'
                        }`}
                      >
                        Mesai Saha Faaliyeti
                      </button>
                    </div>
                    {faaliyetTipi === 'MESAI_SAHA' && (
                      <p className="text-[8px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-snug">
                        Seçilen personellere girilen mesai saatleri otomatik olarak Yoklama ve Puantaj sekmesine işlenir.
                      </p>
                    )}

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

                    <div className="space-y-1">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">Faaliyet Tarihi</label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(normalizeDateKey(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold text-slate-800"
                      />
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

                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">
                        İş Etiketi
                      </label>
                      <select
                        value={isEtiketi}
                        onChange={(e) => setIsEtiketi(normalizeFaaliyetEtiketi(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 p-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-bold text-slate-800"
                      >
                        <option value="">— Etiket seç (opsiyonel) —</option>
                        {FAALIYET_ETIKET_ONSETLERI.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-1">
                        {FAALIYET_ETIKET_ONSETLERI.map((o) => (
                          <button
                            type="button"
                            key={o}
                            onClick={() => setIsEtiketi(o)}
                            className={`py-1 px-2 rounded-lg text-[8px] font-bold border transition ${
                              isEtiketi === o
                                ? 'bg-amber-100 border-amber-300 text-slate-900'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 border border-slate-200 rounded-2xl p-3 bg-slate-50/60">
                      <div className="flex items-center justify-between gap-2">
                        <label className="font-bold text-slate-600 uppercase text-[8px] tracking-wider block">DB Personel Görevlendirme (Yeni Metod)</label>
                        <button
                          type="button"
                          onClick={handleFillWorkerCountsFromSelection}
                          className="text-[8px] bg-slate-900 hover:bg-slate-900 text-white font-bold px-2 py-1 rounded-lg"
                        >
                          Seçimden Sayıyı Doldur
                        </button>
                      </div>
                      <input
                        type="text"
                        value={faaliyetPersonelSearch}
                        onChange={(e) => setFaaliyetPersonelSearch(e.target.value)}
                        placeholder="Personel ad/görev ara..."
                        className="w-full bg-white border border-slate-200 py-1.5 px-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 text-[10px] font-medium text-slate-800"
                      />
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                        {filteredFaaliyetPersonelPool.length === 0 && (
                          <div className="text-[10px] text-slate-400 border border-dashed border-slate-200 rounded-xl py-2 px-2">
                            Seçili tarihte yoklamada &quot;Geldi&quot; işaretli ve başka faaliyete atanmamış personel bulunamadı.
                          </div>
                        )}
                        {filteredFaaliyetPersonelPool.map((p) => {
                          const selected = faaliyetPersonelIds.includes(p.id);
                          return (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() =>
                                setFaaliyetPersonelIds((prev) => {
                                  const next = prev.includes(p.id)
                                    ? prev.filter((id) => id !== p.id)
                                    : [...prev, p.id];
                                  if (!prev.includes(p.id) && faaliyetTipi === 'MESAI_SAHA') {
                                    setPersonelMesaiDraft((d) => ({ ...d, [p.id]: d[p.id] ?? '0' }));
                                  }
                                  return next;
                                })
                              }
                              className={`w-full text-left border rounded-xl px-2.5 py-1.5 text-[10px] font-bold transition ${
                                selected
                                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {p.ad} {p.soyad} · {p.gorev || 'Görev yok'}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-slate-700 font-semibold">
                        Seçili Personel: {faaliyetPersonelIds.length}
                      </div>
                      {faaliyetTipi === 'MESAI_SAHA' && faaliyetPersonelIds.length > 0 && (
                        <div className="space-y-1.5 border border-amber-200 bg-amber-50/40 rounded-xl p-2">
                          <div className="text-[8px] font-black text-amber-800 uppercase">Personel Mesai Saatleri</div>
                          {faaliyetPersonelIds.map((pid) => {
                            const p = personeller.find((x) => x.id === pid);
                            if (!p) return null;
                            return (
                              <div key={pid} className="flex items-center justify-between gap-2 bg-white border border-amber-100 rounded-lg px-2 py-1">
                                <span className="text-[9px] font-bold text-slate-800 truncate">{p.ad} {p.soyad}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={
                                      personelMesaiDraft[pid] ??
                                      (personelMesaiSaatleri[pid] != null
                                        ? String(personelMesaiSaatleri[pid])
                                        : '')
                                    }
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(',', '.');
                                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                                      setPersonelMesaiDraft((prev) => ({ ...prev, [pid]: raw }));
                                    }}
                                    onBlur={() => {
                                      const raw = personelMesaiDraft[pid] ?? '';
                                      const parsed = parseFloat(raw);
                                      const safe = normalizeSahaMesaiHours(
                                        Number.isFinite(parsed) ? parsed : 0
                                      );
                                      setPersonelMesaiSaatleri((prev) => ({ ...prev, [pid]: safe }));
                                      setPersonelMesaiDraft((prev) => ({
                                        ...prev,
                                        [pid]: String(safe),
                                      }));
                                    }}
                                    className="w-16 text-center bg-slate-50 border border-slate-200 rounded-lg py-0.5 text-[9px] font-mono font-bold"
                                  />
                                  <span className="text-[8px] text-slate-500">sa</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Photo upload / camera — max 5 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">
                          Saha Fotoğrafları (Kamera / Galeri)
                        </label>
                        <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          {fotoUrls.length}/{MAX_SAHA_FOTO_COUNT}
                        </span>
                      </div>

                      <div className="flex items-start gap-2">
                        <label
                          className={`bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-3 flex flex-col items-center justify-center transition w-20 h-16 shrink-0 text-slate-500 ${
                            fotoUrls.length >= MAX_SAHA_FOTO_COUNT
                              ? 'opacity-40 pointer-events-none'
                              : 'hover:bg-slate-200 hover:text-slate-800 cursor-pointer'
                          }`}
                        >
                          <Camera size={18} />
                          <span className="text-[7px] font-bold mt-0.5 text-center leading-none">Kameradan</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            onChange={handleImageChange}
                            className="hidden"
                            disabled={fotoUrls.length >= MAX_SAHA_FOTO_COUNT}
                          />
                        </label>

                        <label
                          className={`bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-3 flex flex-col items-center justify-center transition w-20 h-16 shrink-0 text-slate-500 ${
                            fotoUrls.length >= MAX_SAHA_FOTO_COUNT
                              ? 'opacity-40 pointer-events-none'
                              : 'hover:bg-slate-200 hover:text-slate-800 cursor-pointer'
                          }`}
                        >
                          <ImageIcon size={18} />
                          <span className="text-[7px] font-bold mt-0.5 text-center leading-none">Galeriden</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageChange}
                            className="hidden"
                            disabled={fotoUrls.length >= MAX_SAHA_FOTO_COUNT}
                          />
                        </label>

                        <div className="flex-1 min-w-0">
                          {fotoUrls.length === 0 ? (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl h-16 flex items-center justify-center text-slate-400">
                              <div className="text-center p-2">
                                <ImageIcon size={14} className="mx-auto text-slate-300 mb-0.5" />
                                <span className="text-[7px] block leading-none">En fazla {MAX_SAHA_FOTO_COUNT} fotoğraf — tekrar ekleyebilirsiniz</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                              {fotoUrls.map((url, idx) => (
                                <div
                                  key={`${idx}-${url.slice(0, 24)}`}
                                  className="relative w-16 h-16 shrink-0 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden"
                                >
                                  <img src={url} alt={`Saha ${idx + 1}`} className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFoto(idx)}
                                    className="absolute top-0.5 right-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-bold shadow"
                                    aria-label="Fotoğrafı kaldır"
                                  >
                                    ✕
                                  </button>
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[6px] font-bold text-center py-0.5">
                                    {idx + 1}
                                  </span>
                                </div>
                              ))}
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
                      disabled={savingFaaliyet}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-wait text-slate-950 font-black text-[10px] py-2.5 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer border-b-4 border-amber-700"
                    >
                      <Send size={12} />
                      <span>
                        {savingFaaliyet
                          ? 'KAYDEDİLİYOR…'
                          : editingFaaliyetId
                            ? 'GÜNCELLE'
                            : 'KAYDET'}
                      </span>
                    </button>

                  </div>

                </form>

                <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-slate-950">
                      <FileText size={14} className="text-amber-500" />
                      <span className="font-bold text-[10px] uppercase tracking-wider">SEÇİLEN GÜN SAHA KAYITLARI</span>
                    </div>
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      Gelen: {selectedDateAttendance.gelenCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(normalizeDateKey(e.target.value))}
                      className="text-xs border border-slate-250 rounded-lg px-2 py-1.5"
                    />
                    <textarea
                      rows={1}
                      placeholder="Genel şantiye notu (opsiyonel)"
                      value={genelNotlar}
                      onChange={(e) => setGenelNotlar(e.target.value)}
                      className="sm:col-span-2 w-full bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-[10px] font-semibold text-slate-800 leading-snug"
                    />
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {selectedDateFaaliyetleri.length === 0 && (
                      <div className="border border-dashed border-slate-250 rounded-xl p-3 text-xs text-slate-500">
                        Seçilen tarihte faaliyet kaydı bulunamadı.
                      </div>
                    )}
                    {selectedDateFaaliyetleri.map((sf) => (
                      <div key={sf.id} className="border border-slate-200 rounded-xl p-2.5 text-[10px] space-y-1.5">
                        <div className="flex justify-between gap-2">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            {sf.isNiteligi}
                            {isMesaiSahaFaaliyet(sf) && (
                              <span className="text-[7px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                                Mesai Faaliyet
                              </span>
                            )}
                          </div>
                          <span className="text-[8px] text-slate-500 font-mono">{formatDateLabelTr(sf.tarih)}</span>
                        </div>
                        <div className="text-[9px] text-slate-500">{sf.parsel} / {sf.blok}</div>
                        {isMesaiSahaFaaliyet(sf) && (
                          <div className="text-[8px] text-amber-800 font-semibold">
                            Mesai: {formatMesaiFaaliyetLabel(sf, personeller) || '—'}
                          </div>
                        )}
                        {!!sf.aciklama && <div className="text-[9px] text-slate-700 line-clamp-2">{sf.aciklama}</div>}
                        <div className="flex flex-wrap gap-2 justify-end pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(normalizeDateKey(sf.tarih));
                              setShowPdfPreview(true);
                            }}
                            className="text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-250 px-2 py-1 rounded-lg font-bold flex items-center gap-1"
                          >
                            <Eye size={11} />
                            Önizleme
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(normalizeDateKey(sf.tarih));
                              setShowPdfPreview(true);
                            }}
                            className="text-[9px] bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600 px-2 py-1 rounded-lg font-black"
                          >
                            PDF Gönder
                          </button>
                          <button
                            type="button"
                            onClick={() => loadFaaliyetIntoForm(sf)}
                            className="text-[9px] bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 px-2 py-1 rounded-lg font-bold"
                          >
                            Düzelt
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaaliyet(sf)}
                            className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg font-bold"
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </>
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

                      {/* ID Photo (Kimlik Fotoğrafı) Upload — 2 foto: Ön / Arka */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block">
                          Kimlik Belgesi Fotoğrafları — Ön / Arka ({yeniKimlikFotolar.length}/{MAX_KIMLIK_FOTO})
                        </label>

                        <div className="flex items-center gap-2 flex-wrap">
                          {yeniKimlikFotolar.length < MAX_KIMLIK_FOTO && (
                            <label className="bg-slate-100 hover:bg-slate-200 border-2 border-dashed border-slate-300 rounded-2xl p-3 flex flex-col items-center justify-center cursor-pointer transition w-24 h-20 shrink-0 text-slate-500 hover:text-slate-800">
                              <Camera size={20} />
                              <span className="text-[8px] font-bold mt-1 text-center leading-none">
                                {yeniKimlikFotolar.length === 0 ? 'Ön Yüz Çek' : 'Arka Yüz Çek'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                multiple
                                onChange={(e) => {
                                  const files: File[] = e.target.files ? Array.from(e.target.files) : [];
                                  if (files.length === 0) return;
                                  const slots = MAX_KIMLIK_FOTO - yeniKimlikFotolar.length;
                                  files.slice(0, slots).forEach((file) => {
                                    const r = new FileReader();
                                    r.onload = async (event) => {
                                      if (event.target?.result) {
                                        const rawBase64 = event.target.result as string;
                                        const compressed = await compressImage(rawBase64);
                                        setYeniKimlikFotolar((prev) =>
                                          prev.length >= MAX_KIMLIK_FOTO ? prev : [...prev, compressed]
                                        );
                                      }
                                    };
                                    r.readAsDataURL(file);
                                  });
                                  e.target.value = '';
                                }}
                                className="hidden"
                              />
                            </label>
                          )}

                          {yeniKimlikFotolar.map((foto, idx) => (
                            <div
                              key={idx}
                              className="w-24 h-20 border border-slate-150 rounded-2xl bg-slate-50 relative flex items-center justify-center overflow-hidden shrink-0"
                            >
                              <img src={foto} alt={idx === 0 ? 'Kimlik Ön' : 'Kimlik Arka'} className="w-full h-full object-cover" />
                              <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[7px] font-bold px-1 rounded">
                                {idx === 0 ? 'ÖN' : 'ARKA'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setYeniKimlikFotolar((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[8px] font-bold"
                              >
                                ✕
                              </button>
                            </div>
                          ))}

                          {yeniKimlikFotolar.length === 0 && (
                            <div className="flex-1 min-w-[80px] border border-slate-150 rounded-2xl bg-slate-50 h-20 flex items-center justify-center text-center p-2 text-slate-400">
                              <div>
                                <ImageIcon size={14} className="mx-auto text-slate-300 mb-0.5" />
                                <span className="text-[7.5px] block leading-none">Fotoğraf Çekilmedi</span>
                              </div>
                            </div>
                          )}
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
                        if (yeniKimlikFotolar.length === 0) {
                          showStatus('error', 'Lütfen en az bir Kimlik Fotoğrafı (ön yüz) çekiniz veya yükleyiniz!');
                          return;
                        }

                        try {
                          const requestID = `GIRIS-${Date.now()}`;
                          const docRef = doc(db, 'personelGirisTalepleri', requestID);
                          const entryData = {
                            ad: yeniAd,
                            soyad: yeniSoyad,
                            gorev: yeniGorev,
                            kimlikFotoUrl: yeniKimlikFotolar[0],
                            kimlikFotoUrls: yeniKimlikFotolar,
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
                          setYeniKimlikFotolar([]);
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
                          href={buildWhatsAppUrl(
                            `*KİBRİTÇİ ERP - YENİ PERSONEL İŞE GİRİŞ BİLDİRİMİ*\n----------------------------------------\n*Ad Soyad:* ${sonGirisTalebi.ad} ${sonGirisTalebi.soyad}\n*Görev/Branş:* ${sonGirisTalebi.gorev}\n*Tarih:* ${new Date().toLocaleDateString('tr-TR')}\n*Gönderen:* ${currentUser?.email || 'Bilinmeyen Formen'}\n*Kayıt Linki:* ${window.location.origin}/?view_giris=${sonGirisTalebi.id}\n----------------------------------------\n_Lütfen bu personelin sigorta giriş işlemlerini başlatınız._`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={async () => {
                            try {
                              await setDoc(
                                doc(db, 'personelGirisTalepleri', sonGirisTalebi.id),
                                { durum: 'WP_GÖNDERİLDİ' },
                                { merge: true }
                              );
                            } catch (e) {
                              console.warn(e);
                            }
                          }}
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
                                item.durum === 'WP_GÖNDERİLDİ' ? 'bg-slate-100 text-slate-800 border border-slate-200' :
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
                  
                  {/* 1. Direct sync info card */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <CheckCircle size={14} className="text-emerald-500" />
                        <span className="font-bold text-[10px] uppercase tracking-wider">DOĞRUDAN YOKLAMA SENKRONU</span>
                      </div>
                      <span className="text-[8px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        ONAYSIZ GÜNCELLEME AKTİF
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug">
                      Formen yoklama ekranındaki <strong>“Yoklamayı İmzala ve Kaydet”</strong> işlemi artık doğrudan ana
                      <strong> Yoklama ve Puantaj</strong> verisini günceller. Ekstra “Günü Tamamla” adımı gerekmiyor.
                    </p>
                  </div>

                  {/* 2. Active Personnel Directory */}
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3.5">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div className="flex items-center space-x-2 text-slate-950">
                        <Users size={14} className="text-amber-500" />
                        <span className="font-bold text-[10px] uppercase tracking-wider">ŞANTİYE PERSONEL LİSTESİ ({personeller.filter(p => (p.durum === true || String(p.durum).toLowerCase() === 'true') && !isTaseronPersonel(p) && !isIdariPersonel(p)).length})</span>
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
                        .filter(p => (p.durum === true || String(p.durum).toLowerCase() === 'true') && !isTaseronPersonel(p) && !isIdariPersonel(p))
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
                            <div key={item.id} className="border border-slate-100 rounded-2xl p-2.5 bg-slate-50/30 text-[9px] space-y-1">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-black text-slate-800 text-[8px] uppercase tracking-wider block mb-0.5">📝 BİLGİ GÜNCELLEME TALEBİ</span>
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
                              setCikisTarihi(selectedDate);
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
                                ? 'bg-slate-50 text-slate-800 border-slate-200' 
                                : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50/50'
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
                                <div className="mt-1 flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCikisTarihi(selectedDate)}
                                    className="text-[8px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                                  >
                                    Seçili Gün
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCikisTarihi(new Date().toISOString().slice(0, 10))}
                                    className="text-[8px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                                  >
                                    Bugün
                                  </button>
                                </div>
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
                          <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50/10 space-y-3 animate-in fade-in duration-150">
                            <span className="font-extrabold text-[8px] text-slate-800 uppercase block tracking-wider">📝 BİLGİ DÜZELTME & GÜNCELLEME FORMU</span>
                            
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
                              className="w-full bg-slate-900 hover:bg-slate-900 text-white font-extrabold text-[9px] py-2 rounded-lg transition"
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

              {activeTab === 'gunluk_akis' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                    <h3 className="text-xs font-black text-slate-900">📋 Günlük Akış Özeti — {selectedDate.split('-').reverse().join('.')}</h3>
                    <p className="text-[10px] text-slate-500">Formen: <strong>{formenEmail}</strong></p>
                    <ul className="text-[10px] text-slate-700 space-y-1">
                      <li>✓ Yoklama: {presentIds.length} geldi / {activeStaff.length} toplam</li>
                      <li>
                        ✓ Mesai:{' '}
                        {presentIds.reduce((s, id) => s + Number(mesaiSaatleri[id] || 0), 0)} saat
                      </li>
                      <li>✓ Saha faaliyeti: {daySahaFaaliyetleri.length} kayıt</li>
                      <li>
                        ✓ Personel giriş:{' '}
                        {personelGirisListesi.filter((g) => g.tarih?.startsWith(selectedDate)).length} ·
                        çıkış:{' '}
                        {isCikisTalepleriList.filter((c) => c.tarih?.startsWith(selectedDate)).length}
                      </li>
                    </ul>
                    {daySahaFaaliyetleri.length > 0 && (
                      <div className="border-t pt-2 space-y-1">
                        {daySahaFaaliyetleri.map((sf) => (
                          <p key={sf.id} className="text-[9px] text-slate-600">• {sf.isNiteligi} — {sf.parsel}/{sf.blok}</p>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={handleShareGunlukAkisWhatsApp}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-3 rounded-xl flex items-center justify-center gap-2"
                      >
                        <MessageCircle size={14} />
                        WHATSAPP: GÜN SONU ÖZETİ (ŞEFE)
                      </button>
                      <button
                        type="button"
                        disabled={sendingGunlukAkis}
                        onClick={handleSendGunlukAkis}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {sendingGunlukAkis ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                        GÜN SONU RAPORUNU YÖNETİME GÖNDER
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'aylik_puantaj' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center space-x-2">
                        <FileText size={14} className="text-amber-500" />
                        <span className="font-bold text-[10px] uppercase tracking-wider text-slate-900">AYLIK PUANTAJ / MESAİ</span>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-slate-500">
                        {String(month).padStart(2, '0')}/{year}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug">
                      Günü seçin → personel durumunu ve mesaiyi ayarlayın → Kaydet.
                      Yalnızca değiştirdiğiniz günler yazılır; diğer yoklamalar silinmez.
                      {aylikDirty ? (
                        <span className="block mt-1 text-amber-700 font-bold">
                          Kaydedilmemiş: {aylikDirtyKeys.length} hücre
                        </span>
                      ) : null}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (aylikDirty && !window.confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return;
                          const d = new Date(year, month - 2, 1);
                          setSelectedDate(
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
                          );
                          setAylikDirty(false);
                          setAylikDirtyKeys([]);
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-2 rounded-xl cursor-pointer"
                      >
                        ← Önceki Ay
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (aylikDirty && !window.confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return;
                          const d = new Date(year, month, 1);
                          setSelectedDate(
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
                          );
                          setAylikDirty(false);
                          setAylikDirtyKeys([]);
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-2 rounded-xl cursor-pointer"
                      >
                        Sonraki Ay →
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveAylikPuantaj()}
                        disabled={aylikSaving || !aylikDirty}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[10px] py-2.5 rounded-xl transition cursor-pointer"
                      >
                        {aylikSaving ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                      <button
                        type="button"
                        onClick={resetAylikDraft}
                        disabled={!aylikDirty}
                        className="w-full bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-black text-[10px] py-2.5 rounded-xl transition cursor-pointer"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={handleExportAylikPuantajCsv}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-2.5 rounded-xl transition cursor-pointer"
                      >
                        CSV İndir
                      </button>
                      <button
                        type="button"
                        onClick={() => setAylikShowGrid((v) => !v)}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-2.5 rounded-xl transition cursor-pointer"
                      >
                        {aylikShowGrid ? 'Gün Listesi' : 'Tablo Görünümü'}
                      </button>
                    </div>
                  </div>

                  {/* Gün seçici */}
                  <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Gün seç</span>
                      <button
                        type="button"
                        onClick={() => setAylikFocusDay(day)}
                        className="text-[9px] font-bold text-amber-700 cursor-pointer"
                      >
                        Bugüne git ({day})
                      </button>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
                      {Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAylikFocusDay(d)}
                          className={`shrink-0 w-9 h-9 rounded-xl text-[11px] font-black cursor-pointer border transition ${
                            aylikFocusDay === d
                              ? 'bg-amber-500 text-slate-950 border-amber-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={aylikPersonSearch}
                        onChange={(e) => setAylikPersonSearch(e.target.value)}
                        placeholder="Personel ara…"
                        className="w-full bg-slate-50 border border-slate-200 py-1.5 pl-8 pr-3 rounded-xl text-[10px] font-semibold outline-none"
                      />
                    </div>
                  </div>

                  {/* Gün bazlı personel listesi */}
                  {!aylikShowGrid && (
                    <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between px-0.5">
                        <span className="text-[10px] font-black uppercase text-slate-800">
                          {aylikFocusDay}.{String(month).padStart(2, '0')}.{year}
                        </span>
                        <span className="text-[9px] text-slate-500 font-semibold">
                          {monthPersonelList.filter((p) => {
                            if (isTaseronPersonel(p) || isIdariPersonel(p) || isKampciTesisatciMermerci(p.gorev)) return false;
                            return isDayActiveForPersonel(p, year, month, aylikFocusDay, aylikDraft[p.id] as any);
                          }).length} personel
                        </span>
                      </div>
                      <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-0.5">
                        {monthPersonelList
                          .filter((p) => {
                            if (isTaseronPersonel(p) || isIdariPersonel(p) || isKampciTesisatciMermerci(p.gorev)) return false;
                            if (!isDayActiveForPersonel(p, year, month, aylikFocusDay, aylikDraft[p.id] as any)) return false;
                            const q = aylikPersonSearch.trim().toLocaleLowerCase('tr-TR');
                            if (!q) return true;
                            return (
                              `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR').includes(q) ||
                              String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)
                            );
                          })
                          .map((p) => {
                            const data =
                              getYoklamaDay(aylikDraft[p.id], year, month, aylikFocusDay) ||
                              ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
                            const mesai = Number(data.mesaiSaati || 0);
                            return (
                              <div
                                key={p.id}
                                className="rounded-2xl border border-slate-150 bg-slate-50/60 p-2.5 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-slate-900 truncate">
                                      {p.ad} {p.soyad}
                                    </div>
                                    <div className="text-[8px] text-slate-500 truncate">{p.gorev || '-'}</div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-lg px-1 py-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setAylikDayMesai(p.id, aylikFocusDay, mesai - 0.5)}
                                      className="w-6 h-6 rounded-md bg-slate-100 text-slate-800 font-black text-xs cursor-pointer"
                                    >
                                      −
                                    </button>
                                    <span className="text-[10px] font-black min-w-[28px] text-center text-amber-800">
                                      {mesai}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setAylikDayMesai(p.id, aylikFocusDay, mesai + 0.5)}
                                      className="w-6 h-6 rounded-md bg-slate-100 text-slate-800 font-black text-xs cursor-pointer"
                                    >
                                      +
                                    </button>
                                    <span className="text-[8px] font-bold text-slate-400 pl-0.5">saat</span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {aylikStatusOptions.map((st) => {
                                    const short =
                                      st === 'Geldi' ? 'G' :
                                      st === 'Yok' ? 'Y' :
                                      st === 'İzinli' ? 'İ' :
                                      st === 'Raporlu' ? 'R' :
                                      st === 'Pazar' ? 'P' :
                                      st === 'Tatil' ? 'T' : '−';
                                    const active = data.durum === st;
                                    return (
                                      <button
                                        key={st}
                                        type="button"
                                        title={st}
                                        onClick={() => setAylikDayStatus(p.id, aylikFocusDay, st)}
                                        className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                                          active
                                            ? st === 'Geldi'
                                              ? 'bg-emerald-600 text-white border-emerald-700'
                                              : st === 'Yok'
                                                ? 'bg-rose-600 text-white border-rose-700'
                                                : st === 'Girilmedi'
                                                  ? 'bg-slate-700 text-white border-slate-800'
                                                  : 'bg-amber-500 text-slate-950 border-amber-600'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      >
                                        {short}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {aylikShowGrid && (
                  <div className="bg-white rounded-3xl border p-3 shadow-xs">
                    <div className="overflow-x-auto border rounded-2xl bg-slate-50">
                      <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="p-2 text-[9px] font-black uppercase text-slate-600 tracking-wider sticky left-0 bg-slate-100 z-10">Personel</th>
                            {Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1).map((d) => (
                              <th key={d} className="p-2 text-center text-[9px] font-black uppercase text-slate-600 tracking-wider">
                                {d}
                              </th>
                            ))}
                            <th className="p-2 text-center text-[9px] font-black uppercase text-slate-600 tracking-wider">Gelen</th>
                            <th className="p-2 text-center text-[9px] font-black uppercase text-slate-600 tracking-wider">Mesai</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthPersonelList.map((p) => {
                            const personMap = aylikDraft[p.id] as any;
                            let geldiCount = 0;
                            let mesaiToplam = 0;
                            return (
                              <tr key={p.id} className="border-b border-slate-150 hover:bg-slate-100/60">
                                <td className="p-2 sticky left-0 bg-white z-10">
                                  <div className="text-[10px] font-bold text-slate-900 leading-tight">{p.ad} {p.soyad}</div>
                                  <div className="text-[8px] text-slate-500">{p.gorev || '-'}</div>
                                </td>
                                {Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1).map((d) => {
                                  const active = isDayActiveForPersonel(p, year, month, d, personMap);
                                  if (!active) {
                                    return (
                                      <td key={d} className="p-1 text-center bg-violet-50 text-violet-400 text-[9px] font-bold">
                                        Ç
                                      </td>
                                    );
                                  }
                                  const data = getYoklamaDay(personMap, year, month, d);
                                  const durum = data?.durum || 'Girilmedi';
                                  const mesai = Number(data?.mesaiSaati || 0);
                                  if (durum === 'Geldi') geldiCount += 1;
                                  mesaiToplam += mesai;
                                  const letter =
                                    durum === 'Geldi'
                                      ? 'G'
                                      : durum === 'Yok'
                                        ? 'Y'
                                        : durum === 'İzinli'
                                          ? 'İ'
                                          : durum === 'Raporlu'
                                            ? 'R'
                                            : durum === 'Pazar'
                                              ? 'P'
                                              : durum === 'Tatil'
                                                ? 'T'
                                                : '-';
                                  return (
                                    <td key={d} className="p-0.5 text-center">
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleAylikCellCycle(p.id, d)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleAylikCellCycle(p.id, d);
                                          }
                                        }}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          openAylikMesaiEdit(p.id, d);
                                        }}
                                        className={`w-full min-w-[28px] rounded-md border px-0.5 py-1 cursor-pointer select-none ${
                                          durum === 'Geldi'
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                            : durum === 'Yok'
                                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                                              : durum === 'Girilmedi'
                                                ? 'bg-white border-slate-200 text-slate-500'
                                                : 'bg-amber-50 border-amber-200 text-amber-900'
                                        }`}
                                        title="Dokun: durum · Sağ tık: mesai"
                                      >
                                        <span className="text-[9px] font-bold block">{letter}</span>
                                        <button
                                          type="button"
                                          className="block w-full text-[7px] font-mono text-amber-700 min-h-[10px] cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openAylikMesaiEdit(p.id, d);
                                          }}
                                        >
                                          {mesai > 0 ? `+${mesai}` : '·'}
                                        </button>
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="p-1 text-center text-[9px] font-black text-emerald-700">{geldiCount}</td>
                                <td className="p-1 text-center text-[9px] font-black text-amber-700">{mesaiToplam.toFixed(1)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                  {aylikMesaiEdit && (
                    <div className="fixed inset-0 z-[80] bg-slate-950/60 flex items-end sm:items-center justify-center p-4">
                      <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3 shadow-xl">
                        <h4 className="text-xs font-black uppercase text-slate-900">Mesai saati</h4>
                        <p className="text-[10px] text-slate-500">
                          Gün {aylikMesaiEdit.day} · 0–24 saat (0.5 adım)
                        </p>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          value={aylikMesaiInput}
                          onChange={(e) => setAylikMesaiInput(e.target.value)}
                          className="w-full text-sm font-bold p-2.5 border border-slate-200 rounded-xl bg-slate-50"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAylikMesaiEdit(null);
                              setAylikMesaiInput('');
                            }}
                            className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black cursor-pointer"
                          >
                            İptal
                          </button>
                          <button
                            type="button"
                            onClick={applyAylikMesaiEdit}
                            className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 text-[10px] font-black cursor-pointer"
                          >
                            Uygula
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
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
                  <img src={KIBRITCI_LOGO_PATH} alt="" className="max-w-[85%] h-auto rotate-12" />
                </div>

                {/* Company Header */}
                <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3 relative z-10">
                  <div className="space-y-0.5 flex items-center gap-3">
                    <KibritciLogo size="md" className="h-8" />
                    <p className="text-[7.5px] text-slate-500 font-mono tracking-wider uppercase">Merkez Ofis &amp; Şantiye İşleri Koordinatörlüğü</p>
                  </div>
                  <div className="bg-slate-900 text-white font-black px-2 py-1 text-[8.5px] rounded tracking-widest font-mono shrink-0">
                    GÜNLÜK SAHA FAALİYET RAPORU
                  </div>
                </div>

                {/* Document Subtitle */}
                <div className="text-center space-y-1 py-1 bg-slate-50 border rounded-lg relative z-10">
                  <h2 className="text-xs font-black tracking-wide text-slate-900">GÜNLÜK SAHA FAALİYET RAPORU</h2>
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
                        {selectedDateAttendance.gelenCount} Personel (Aktif Sahada)
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
                    Seçili günde şantiyede aktif hazır bulunan <strong>{selectedDateAttendance.gelenCount} personelin</strong> yoklaması ve mesai saatleri Formen tarafından e-imzalanarak sisteme işlenmiştir. Gelmeyen personeller puantaj dışı bırakılmıştır.
                  </p>
                  
                  {/* Small scrollable inline grid of present staff */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded-xl border border-slate-150 max-h-24 overflow-y-auto">
                    {activeStaff.filter(p => selectedDateAttendance.gelenIds.includes(p.id)).length === 0 ? (
                      <p className="col-span-2 text-slate-400 italic text-center py-2 text-[8px]">Bugün gelen personel kaydı girilmemiştir.</p>
                    ) : (
                      activeStaff.filter(p => selectedDateAttendance.gelenIds.includes(p.id)).map(p => (
                        <div key={p.id} className="flex items-center space-x-1 py-0.5 border-b border-slate-100/60">
                          <span className="text-[6.5px] text-emerald-600">●</span>
                          <span className="font-bold text-slate-800">{p.ad} {p.soyad}</span>
                          <span className="text-slate-400 text-[8px]">({p.gorev})</span>
                          {mesaiSaatleri[p.id] > 0 && (
                            <span className="text-[8px] font-mono text-slate-800 font-black ml-auto bg-slate-50 px-1 rounded">
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
                    {selectedDateFaaliyetleri.length === 0 ? (
                      <div className="text-center py-4 bg-rose-50/50 border border-rose-100 rounded-xl text-rose-800 italic text-[9px]">
                        Bugün için girilmiş herhangi bir imalat faaliyeti bulunmamaktadır. Raporu göndermeden önce imalat girişi yapabilirsiniz.
                      </div>
                    ) : (
                      selectedDateFaaliyetleri.map((sf, idx) => (
                        <div key={sf.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/30 space-y-1.5">
                          <div className="flex justify-between items-center border-b border-slate-150 pb-1.5">
                            <span className="font-black text-slate-900 text-[10.5px] flex items-center gap-1.5 flex-wrap">
                              {idx + 1}. {sf.isNiteligi}
                              {isMesaiSahaFaaliyet(sf) && (
                                <span className="text-[7px] font-black uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                  Mesai Faaliyet
                                </span>
                              )}
                            </span>
                            <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[8px] uppercase">
                              📍 {sf.parsel} / {sf.blok}
                            </span>
                          </div>
                          {isMesaiSahaFaaliyet(sf) && (
                            <div className="text-[8px] text-amber-900 font-bold bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                              Bu faaliyet mesai ile gerçekleştirildi: {formatMesaiFaaliyetLabel(sf, personeller) || '—'}
                            </div>
                          )}

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

                            {/* Activity photos inside report */}
                            <div className="flex flex-col items-center justify-center bg-slate-50 border rounded-xl p-1 shrink-0 min-w-[5.5rem] max-w-[8rem]">
                              {getFaaliyetFotolar(sf).length > 0 ? (
                                <div className="grid grid-cols-2 gap-0.5 w-full">
                                  {getFaaliyetFotolar(sf).slice(0, 4).map((url, i) => (
                                    <img key={i} src={url} alt={`Kanıt ${i + 1}`} className="w-full h-10 object-cover rounded" />
                                  ))}
                                </div>
                              ) : (
                                <div className="text-slate-400 italic text-[7.5px] text-center p-2 h-24 flex items-center">
                                  📷 Görsel Eklenmedi
                                </div>
                              )}
                              {getFaaliyetFotolar(sf).length > 1 && (
                                <span className="text-[6px] font-bold text-slate-500 mt-0.5">
                                  {getFaaliyetFotolar(sf).length} fotoğraf
                                </span>
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
                onClick={() => void handleSaveGunlukRapor()}
                disabled={sendingPdfRapor}
                className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-[10px] py-2.5 px-6 rounded-xl transition cursor-pointer flex items-center space-x-1 border-b-4 border-amber-700 disabled:opacity-50 disabled:cursor-wait"
              >
                {sendingPdfRapor ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                <span>{sendingPdfRapor ? 'GÖNDERİLİYOR…' : 'PDF OLARAK GÖNDER'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
