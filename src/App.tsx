import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CircleAlert as AlertCircle, RefreshCw } from 'lucide-react';

// Core Screens
import { AdminPanelScreen, Kullanici } from './components/AdminPanelScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { PersonelScreen } from './components/PersonelScreen';
import { YoklamaScreen } from './components/YoklamaScreen';
import { MaasScreen } from './components/MaasScreen';
import { PersonelIzinScreen } from './components/PersonelIzinScreen';
import { SatinAlmaScreen } from './components/SatinAlmaScreen';
import { KasaScreen } from './components/KasaScreen';
import { IdariScreen } from './components/IdariScreen';
import { OnayIslemleriScreen } from './components/OnayIslemleriScreen';
import { SohbetScreen } from './components/SohbetScreen';
import { FormenScreen } from './components/FormenScreen';
import { GuvenlikScreen } from './components/GuvenlikScreen';
import { KampciScreen } from './components/KampciScreen';
import { LojistikScreen } from './components/LojistikScreen';
import { ProfilScreen } from './components/ProfilScreen';
import { DepocuScreen } from './components/DepocuScreen';
import { EvrakAktarimiScreen } from './components/EvrakAktarimiScreen';
import { MobileManagerScreen } from './components/MobileManagerScreen';
import { KibarHakedisScreen } from './components/KibarHakedisScreen';

// Type definitions
import { 
  Personel, AylikYoklamaMap, SatinAlmaTalebi, Irsaliye, Fatura, 
  KasaHareketi, AracBakim, Demisbas, KampOdasi, KampKaydi, 
  HazirTutanak, CariKart, StokKart, EpostaGonderim, SahaFaaliyeti as SahaFaaliyetiType,
  OperatorFaaliyet, TaseronKesintiRaporu, MaaşOdeme, PersonelIslemGecmisi, CariKartIslem, StokKartIslem
} from './types/erp';

// Initial Mock Data
import { 
  INITIAL_PERSONEL, INITIAL_YOKLAMA, INITIAL_CARI, INITIAL_STOK, 
  INITIAL_SATIN_ALMA, INITIAL_IRSALIYE, INITIAL_FATURA, INITIAL_KASA, 
  INITIAL_ARAC, INITIAL_KAMP, INITIAL_KAMP_KAYDI, 
  INITIAL_SAHA, INITIAL_TUTANAK, INITIAL_EPOSTA,
  INITIAL_OPERATOR_FAALIYET, INITIAL_TASERON_KESINTI, INITIAL_MAAS_ODEME,
  INITIAL_PERSONEL_ISLEM, INITIAL_CARI_ISLEM, INITIAL_STOK_ISLEM
} from './data/mockData';

// Cloud Connection Modules
import {
  auth,
  db,
  seedCollectionIfEmpty,
  seedYoklamaIfEmpty,
  saveYoklamaDocument,
  syncArrayToFirestore,
  saveDocument
} from './lib/firebase';
import { collection, onSnapshot, doc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { LoginScreen } from './components/LoginScreen';
import { YetkiVermeScreen } from './components/YetkiVermeScreen';
import { OperatorScreen } from './components/OperatorScreen';
import { MaasOdeScreen } from './components/MaasOdeScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("ana_sayfa");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureStyle, setSignatureStyle] = useState(() => localStorage.getItem('kibritci_sig_style') || 'cursive');
  const [signatureText, setSignatureText] = useState(() => localStorage.getItem('kibritci_sig_text') || 'Samet Atak');
  
  // Auth state management
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    return localStorage.getItem('kibritci_mobile_mode') === 'true';
  });
  const [isMobileDirect, setIsMobileDirect] = useState<boolean>(() => {
    return localStorage.getItem('kibritci_mobile_direct') === 'true';
  });

  const [bildirimler, setBildirimler] = useState<any[]>([]);

  useEffect(() => {
    if (currentUser) {
      setIsMobileMode(localStorage.getItem('kibritci_mobile_mode') === 'true');
      setIsMobileDirect(localStorage.getItem('kibritci_mobile_direct') === 'true');
    }
  }, [currentUser]);

  // Realtime Cloud Connection Monitor Status
  const [dbStatus, setDbStatus] = useState<'loading' | 'synced' | 'error' | 'offline'>('loading');
  const [loadingMsg, setLoadingMsg] = useState('Google Cloud Veritabanı bağlantısı kuruluyor...');

  // Global State Engine
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [yoklamalar, setYoklamalar] = useState<AylikYoklamaMap>({});
  const [satinAlmaTalepleri, setSatinAlmaTalepleri] = useState<SatinAlmaTalebi[]>([]);
  const [irsaliyeler, setIrsaliyeler] = useState<Irsaliye[]>([]);
  const [faturalar, setFaturalar] = useState<Fatura[]>([]);
  const [kasaHareketleri, setKasaHareketleri] = useState<KasaHareketi[]>([]);
  
  const [araclar, setAraclar] = useState<AracBakim[]>([]);
  const [demirbaslar, setDemirbaslar] = useState<Demisbas[]>([]);
  const [kampOdalari, setKampOdalari] = useState<KampOdasi[]>([]);
  const [kampKayitlari, setKampKayitlari] = useState<KampKaydi[]>([]);
  const [sahaFaaliyetleri, setSahaFaaliyetleri] = useState<SahaFaaliyetiType[]>([]);
  const [hazirTutanaklar, setHazirTutanaklar] = useState<HazirTutanak[]>([]);
  
  const [cariKartlar, setCariKartlar] = useState<CariKart[]>([]);
  const [stokKartlar, setStokKartlar] = useState<StokKart[]>([]);
  const [epostaGonderimleri, setEpostaGonderimleri] = useState<EpostaGonderim[]>([]);

  // Realtime user accounts & vehicle logs
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [aracKmLoglari, setAracKmLoglari] = useState<any[]>([]);

  // Operator & Heavy Equipment Activity Logs
  const [operatorFaaliyetleri, setOperatorFaaliyetleri] = useState<OperatorFaaliyet[]>([]);
  const [taseronKesintiRaporlari, setTaseronKesintiRaporlari] = useState<TaseronKesintiRaporu[]>([]);

  // Salary Payment Records
  const [maasOdemeleri, setMaasOdemeleri] = useState<MaaşOdeme[]>([]);

  // Personnel / Cari / Stock History Logs
  const [personelIslemGecmisi, setPersonelIslemGecmisi] = useState<PersonelIslemGecmisi[]>([]);
  const [cariIslemGecmisi, setCariIslemGecmisi] = useState<CariKartIslem[]>([]);
  const [stokIslemGecmisi, setStokIslemGecmisi] = useState<StokKartIslem[]>([]);

  // Public Personnel Boarding Document Viewer (WhatsApp link handler)
  const [publicViewGiris, setPublicViewGiris] = useState<any>(null);
  const [publicLoading, setPublicLoading] = useState<boolean>(false);

  // Error reporting state
  const [errorReport, setErrorReport] = useState<{ message: string; techDetails: string; contextInfo?: string } | null>(null);
  const [errorUserNote, setErrorUserNote] = useState('');
  const [sendingError, setSendingError] = useState(false);

  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<Array<{ sender: 'user' | 'assistant', text: string }>>([
    { sender: 'assistant', text: 'Merhaba! Ben Kibritçi Şantiye Yapay Zeka Asistanıyım. Size bugün nasıl yardımcı olabilirim?' }
  ]);
  const [assistantLoading, setAssistantLoading] = useState(false);

  useEffect(() => {
    (window as any).showErrorModal = (err: any, contextInfo?: string) => {
      console.error("Intercepted global error:", err, contextInfo);
      
      const translateErrorToTurkish = (error: any): string => {
        if (!error) return "Bilinmeyen bir hata oluştu.";
        const errMsg = (typeof error === 'string' ? error : (error.message || error.toString())).toLowerCase();
        
        if (errMsg.includes("permission") || errMsg.includes("insufficient")) {
          return "Erişim Yetkisi Hatası: Bu işlemi gerçekleştirmek için yetkiniz bulunmamaktadır veya oturumunuz kısıtlanmıştır.";
        }
        if (errMsg.includes("network") || errMsg.includes("offline") || errMsg.includes("failed to fetch") || errMsg.includes("websocket")) {
          return "Bağlantı Hatası: İnternet bağlantısı koptu veya çevrimdışısınız. Lütfen şebekenizi kontrol edip tekrar deneyin.";
        }
        if (errMsg.includes("timeout") || errMsg.includes("zaman aşımı")) {
          return "Zaman Aşımı Hatası: Sunucu bağlantısı zaman aşımına uğradı. Lütfen sayfayı yenileyip tekrar deneyin.";
        }
        if (errMsg.includes("not found") || errMsg.includes("bulunamadı")) {
          return "Kayıt Bulunamadı: Erişmeye çalıştığınız evrak, cari veya stok kartı veri tabanında mevcut değil.";
        }
        if (errMsg.includes("already exists") || errMsg.includes("already-exists")) {
          return "Mükerrer Kayıt Hatası: Bu numara veya koda sahip başka bir kayıt zaten mevcut.";
        }
        if (errMsg.includes("auth") || errMsg.includes("unauthorized") || errMsg.includes("user-not-found") || errMsg.includes("wrong-password")) {
          return "Kimlik Doğrulama Hatası: Giriş bilgileriniz geçersiz veya oturumunuzun süresi dolmuş.";
        }
        if (errMsg.includes("quota") || errMsg.includes("resource exhausted")) {
          return "Kota Aşım Hatası: Sunucu kaynak limitleri aşıldı. Lütfen birkaç dakika sonra tekrar deneyin.";
        }
        if (errMsg.includes("null") || errMsg.includes("undefined") || errMsg.includes("property")) {
          return "Veri Okuma Hatası: Kod içinde eksik veya tanımsız bir veri alanına erişilmeye çalışıldı.";
        }
        return `Beklenmeyen Mantıksal Hata: ${error.message || error.toString()}`;
      };

      const msg = translateErrorToTurkish(err);
      setErrorReport({
        message: msg,
        techDetails: err?.stack || err?.toString() || "Bilinmeyen teknik detay",
        contextInfo: contextInfo || "Bilinmeyen Ekran"
      });
      setErrorUserNote('');
    };

    return () => {
      (window as any).showErrorModal = undefined;
    };
  }, []);

  const handleSendErrorReport = async () => {
    if (!errorReport) return;
    setSendingError(true);
    try {
      const reportId = `error_${Date.now()}`;
      const payload = {
        id: reportId,
        tarih: new Date().toISOString(),
        kullanici: currentUser?.email || 'ziyaretci',
        errorMsg: errorReport.message,
        techDetails: errorReport.techDetails,
        contextInfo: errorReport.contextInfo || '',
        userNote: errorUserNote || 'Kullanıcı ek açıklama girmedi.',
        status: 'YENİ' as const
      };
      await saveDocument('hataRaporlari', payload);
      alert("Hata raporu kurucu panelimize başarıyla gönderildi. Programı geliştirmemize yardımcı olduğunuz için teşekkür ederiz!");
      setErrorReport(null);
    } catch (err) {
      console.error("Rapor gönderilemedi:", err);
      alert("Hata raporu gönderilirken ağ hatası oluştu. Lütfen tekrar deneyin.");
    } finally {
      setSendingError(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewGirisId = urlParams.get('view_giris');
    if (viewGirisId) {
      setPublicLoading(true);
      getDoc(doc(db, 'personelGirisTalepleri', viewGirisId)).then((snap) => {
        if (snap.exists()) {
          setPublicViewGiris({ id: snap.id, ...snap.data() });
        } else {
          alert('Aradığınız personel giriş talebi kaydı sistemde bulunamadı!');
        }
        setPublicLoading(false);
      }).catch((err) => {
        console.error(err);
        setPublicLoading(false);
      });
    }
  }, []);

  // 0. Monitor Authentication State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const savedSession = localStorage.getItem('kibritci_portal_session');
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          setCurrentUser({
            ...user,
            email: parsed.email || user?.email,
            uid: user?.uid || parsed.uid || `u_${Date.now()}`
          });
        } catch {
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(user);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. Core Synchronization Sync Loader
  useEffect(() => {
    if (authLoading || !currentUser) return;

    async function setupCloudDatabase() {
      try {
        setDbStatus('loading');
        setLoadingMsg('Güvenli veritabanı oturumu kontrol ediliyor...');
        
        setLoadingMsg('Şantiye personel kadrosu eşitleniyor...');
        const personnelData = await seedCollectionIfEmpty('personeller', INITIAL_PERSONEL);
        setPersoneller(personnelData);

        setLoadingMsg('Aylık personel puantaj cetvelleri yükleniyor...');
        const attData = await seedYoklamaIfEmpty(INITIAL_YOKLAMA);
        setYoklamalar(attData);

        setLoadingMsg('Satın alma ve hakediş talepleri eşitleniyor...');
        const reqData = await seedCollectionIfEmpty('satinAlmaTalepleri', INITIAL_SATIN_ALMA);
        setSatinAlmaTalepleri(reqData);

        setLoadingMsg('Kontrollü irsaliye dökümleri eşleşiyor...');
        const waybillsData = await seedCollectionIfEmpty('irsaliyeler', INITIAL_IRSALIYE);
        setIrsaliyeler(waybillsData);

        setLoadingMsg('Fatura ve vergi hakediş defterleri senkronize ediliyor...');
        const invoicesData = await seedCollectionIfEmpty('faturalar', INITIAL_FATURA);
        setFaturalar(invoicesData);

        setLoadingMsg('Kasa defteri hareket dökümleri indiriliyor...');
        const cashLogData = await seedCollectionIfEmpty('kasaHareketleri', INITIAL_KASA);
        setKasaHareketleri(cashLogData);

        setLoadingMsg('Araç, makine ve cansal ekipman parkı taranıyor...');
        const vehicleData = await seedCollectionIfEmpty('araclar', INITIAL_ARAC);
        setAraclar(vehicleData);

        setLoadingMsg('Demirbaş ve şantiye alet listeleri yükleniyor...');
        const toolData = await seedCollectionIfEmpty('demirbaslar', []);
        setDemirbaslar(toolData);

        setLoadingMsg('Yatakhane ve kamp oda yerleşimleri düzenleniyor...');
        const roomData = await seedCollectionIfEmpty('kampOdalari', INITIAL_KAMP);
        setKampOdalari(roomData);

        setLoadingMsg('Yatakhane personel giriş-çıkış kayıtları eşitleniyor...');
        const stayLogData = await seedCollectionIfEmpty('kampKayitlari', INITIAL_KAMP_KAYDI);
        setKampKayitlari(stayLogData);

        setLoadingMsg('Saha günlük faaliyet dökümleri arşivleniyor...');
        const reportData = await seedCollectionIfEmpty('sahaFaaliyetleri', INITIAL_SAHA);
        setSahaFaaliyetleri(reportData);

        setLoadingMsg('Hukuki ve resmi şantiye hazır tutanaklar yükleniyor...');
        const protocolData = await seedCollectionIfEmpty('hazirTutanaklar', INITIAL_TUTANAK);
        setHazirTutanaklar(protocolData);

        setLoadingMsg('Cari kartları ve firma rehberi çekiliyor...');
        const companyData = await seedCollectionIfEmpty('cariKartlar', INITIAL_CARI);
        setCariKartlar(companyData);

        setLoadingMsg('Malzeme ve donatı stok düzey dökümleri senkronize ediliyor...');
        const stockData = await seedCollectionIfEmpty('stokKartlar', INITIAL_STOK);
        setStokKartlar(stockData);

        setLoadingMsg('Eposta ve rapor arşiv logları derleniyor...');
        const emailLogData = await seedCollectionIfEmpty('epostaGonderimleri', INITIAL_EPOSTA);
        setEpostaGonderimleri(emailLogData);

        setLoadingMsg('Üyelik yetkilendirme ve izin listesi yükleniyor...');
        const initialUsers: Kullanici[] = [
          { id: 'uid_admin_kibritci', email: 'santiye@kibritci.com', yetki: 'YÖNETİCİ', durum: 'AKTİF', kayitTarihi: '2026-06-19' }
        ];
        const loadedUsers = await seedCollectionIfEmpty('kullanicilar', initialUsers);
        setKullanicilar(loadedUsers);

        setLoadingMsg('Araç kilometre seyrüsefer detay dökümleri alınıyor...');
        const initialKmLogs = [
          { id: 'log_1', tarih: '2026-06-15', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41200, aksamKm: 41350, fark: 150 },
          { id: 'log_2', tarih: '2026-06-16', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41350, aksamKm: 41580, fark: 230 },
          { id: 'log_3', tarih: '2026-06-17', plaka: '06 KBR 101', surucu: 'Mehmet Kaplan', sabahKm: 85400, aksamKm: 85920, fark: 520 },
        ];
        const loadedKmLogs = await seedCollectionIfEmpty('aracKmLoglari', initialKmLogs);
        setAracKmLoglari(loadedKmLogs);

        setLoadingMsg('İş makinesi operatör faaliyet kayıtları yükleniyor...');
        const loadedOperator = await seedCollectionIfEmpty('operatorFaaliyetleri', INITIAL_OPERATOR_FAALIYET);
        setOperatorFaaliyetleri(loadedOperator);

        setLoadingMsg('Taşeron kesinti raporları arşivleniyor...');
        const loadedTaseron = await seedCollectionIfEmpty('taseronKesintiRaporlari', INITIAL_TASERON_KESINTI);
        setTaseronKesintiRaporlari(loadedTaseron);

        setLoadingMsg('Maaş ödeme kayıtları senkronize ediliyor...');
        const loadedMaasOde = await seedCollectionIfEmpty('maasOdemeleri', INITIAL_MAAS_ODEME);
        setMaasOdemeleri(loadedMaasOde);

        setLoadingMsg('Personel işlem geçmişi kayıtları yükleniyor...');
        const loadedPersIslem = await seedCollectionIfEmpty('personelIslemGecmisi', INITIAL_PERSONEL_ISLEM);
        setPersonelIslemGecmisi(loadedPersIslem);

        setLoadingMsg('Cari kart işlem geçmişi kayıtları yükleniyor...');
        const loadedCariIslem = await seedCollectionIfEmpty('cariIslemGecmisi', INITIAL_CARI_ISLEM);
        setCariIslemGecmisi(loadedCariIslem);

        setLoadingMsg('Stok kart işlem geçmişi kayıtları yükleniyor...');
        const loadedStokIslem = await seedCollectionIfEmpty('stokIslemGecmisi', INITIAL_STOK_ISLEM);
        setStokIslemGecmisi(loadedStokIslem);

        setDbStatus('synced');
      } catch (err) {
        console.error('Firebase synchronisation error: ', err);
        setDbStatus('offline'); // fallback gracefully to offline sandbox simulation
        
        // Populate fallback sandbox state
        setPersoneller(INITIAL_PERSONEL);
        setYoklamalar(INITIAL_YOKLAMA);
        setSatinAlmaTalepleri(INITIAL_SATIN_ALMA);
        setIrsaliyeler(INITIAL_IRSALIYE);
        setFaturalar(INITIAL_FATURA);
        setKasaHareketleri(INITIAL_KASA);
        setAraclar(INITIAL_ARAC);
        setDemirbaslar([]);
        setKampOdalari(INITIAL_KAMP);
        setKampKayitlari(INITIAL_KAMP_KAYDI);
        setSahaFaaliyetleri(INITIAL_SAHA);
        setHazirTutanaklar(INITIAL_TUTANAK);
        setCariKartlar(INITIAL_CARI);
        setStokKartlar(INITIAL_STOK);
        setEpostaGonderimleri(INITIAL_EPOSTA);
        setKullanicilar([
          { id: 'uid_admin_kibritci', email: 'santiye@kibritci.com', yetki: 'YÖNETİCİ', durum: 'AKTİF', kayitTarihi: '2026-06-19' }
        ]);
        setAracKmLoglari([
          { id: 'log_1', tarih: '2026-06-15', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41200, aksamKm: 41350, fark: 150 },
          { id: 'log_2', tarih: '2026-06-16', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41350, aksamKm: 41580, fark: 230 },
          { id: 'log_3', tarih: '2026-06-17', plaka: '06 KBR 101', surucu: 'Mehmet Kaplan', sabahKm: 85400, aksamKm: 85920, fark: 520 },
        ]);
        setOperatorFaaliyetleri(INITIAL_OPERATOR_FAALIYET);
        setTaseronKesintiRaporlari(INITIAL_TASERON_KESINTI);
        setMaasOdemeleri(INITIAL_MAAS_ODEME);
        setPersonelIslemGecmisi(INITIAL_PERSONEL_ISLEM);
        setCariIslemGecmisi(INITIAL_CARI_ISLEM);
        setStokIslemGecmisi(INITIAL_STOK_ISLEM);
      }
    }

    setupCloudDatabase();
  }, [authLoading, currentUser]);

  const switchToOfflineMode = () => {
    setDbStatus('offline');
    setPersoneller(INITIAL_PERSONEL);
    setYoklamalar(INITIAL_YOKLAMA);
    setSatinAlmaTalepleri(INITIAL_SATIN_ALMA);
    setIrsaliyeler(INITIAL_IRSALIYE);
    setFaturalar(INITIAL_FATURA);
    setKasaHareketleri(INITIAL_KASA);
    setAraclar(INITIAL_ARAC);
    setDemirbaslar([]);
    setKampOdalari(INITIAL_KAMP);
    setKampKayitlari(INITIAL_KAMP_KAYDI);
    setSahaFaaliyetleri(INITIAL_SAHA);
    setHazirTutanaklar(INITIAL_TUTANAK);
    setCariKartlar(INITIAL_CARI);
    setStokKartlar(INITIAL_STOK);
    setEpostaGonderimleri(INITIAL_EPOSTA);
    setKullanicilar([
      { id: 'uid_admin_kibritci', email: 'santiye@kibritci.com', yetki: 'YÖNETİCİ', durum: 'AKTİF', kayitTarihi: '2026-06-19' }
    ]);
    setAracKmLoglari([
      { id: 'log_1', tarih: '2026-06-15', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41200, aksamKm: 41350, fark: 150 },
      { id: 'log_2', tarih: '2026-06-16', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41350, aksamKm: 41580, fark: 230 },
      { id: 'log_3', tarih: '2026-06-17', plaka: '06 KBR 101', surucu: 'Mehmet Kaplan', sabahKm: 85400, aksamKm: 85920, fark: 520 },
    ]);
  };

  // 1.5 Real-time Synchronization for core collections when in synced mode
  useEffect(() => {
    if (dbStatus !== 'synced' || !currentUser) return;

    const unsubIrsaliyeler = onSnapshot(collection(db, 'irsaliyeler'), (snapshot) => {
      const list: Irsaliye[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setIrsaliyeler(list);
    });

    const unsubFaturalar = onSnapshot(collection(db, 'faturalar'), (snapshot) => {
      const list: Fatura[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setFaturalar(list);
    });

    const unsubSatinAlma = onSnapshot(collection(db, 'satinAlmaTalepleri'), (snapshot) => {
      const list: SatinAlmaTalebi[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setSatinAlmaTalepleri(list);
    });

    const unsubPersonel = onSnapshot(collection(db, 'personeller'), (snapshot) => {
      const list: Personel[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setPersoneller(list);
    });

    const unsubKullanicilar = onSnapshot(collection(db, 'kullanicilar'), (snapshot) => {
      const list: Kullanici[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setKullanicilar(list);
    });

    const unsubSahaFaaliyetleri = onSnapshot(collection(db, 'sahaFaaliyetleri'), (snapshot) => {
      const list: SahaFaaliyetiType[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setSahaFaaliyetleri(list);
    });

    const unsubKasaHareketleri = onSnapshot(collection(db, 'kasaHareketleri'), (snapshot) => {
      const list: KasaHareketi[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setKasaHareketleri(list);
    });

    const unsubKampOdalari = onSnapshot(collection(db, 'kampOdalari'), (snapshot) => {
      const list: KampOdasi[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setKampOdalari(list);
    });

    const unsubKampKayitlari = onSnapshot(collection(db, 'kampKayitlari'), (snapshot) => {
      const list: KampKaydi[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setKampKayitlari(list);
    });

    const unsubStoklar = onSnapshot(collection(db, 'stokKartlar'), (snapshot) => {
      const list: StokKart[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setStokKartlar(list);
    });

    const unsubAraclar = onSnapshot(collection(db, 'araclar'), (snapshot) => {
      const list: AracBakim[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setAraclar(list);
    });

    const unsubAracKm = onSnapshot(collection(db, 'aracKmLoglari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setAracKmLoglari(list);
    });

    const unsubCari = onSnapshot(collection(db, 'cariKartlar'), (snapshot) => {
      const list: CariKart[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setCariKartlar(list);
    });

    const unsubOperator = onSnapshot(collection(db, 'operatorFaaliyetleri'), (snapshot) => {
      const list: OperatorFaaliyet[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setOperatorFaaliyetleri(list);
    });

    const unsubTaseronKesinti = onSnapshot(collection(db, 'taseronKesintiRaporlari'), (snapshot) => {
      const list: TaseronKesintiRaporu[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setTaseronKesintiRaporlari(list);
    });

    const unsubMaasOde = onSnapshot(collection(db, 'maasOdemeleri'), (snapshot) => {
      const list: MaaşOdeme[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setMaasOdemeleri(list);
    });

    const qNotif = query(collection(db, 'bildirimler'), orderBy('tarih', 'desc'), limit(30));
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setBildirimler(list);
    });

    return () => {
      unsubIrsaliyeler();
      unsubFaturalar();
      unsubSatinAlma();
      unsubPersonel();
      unsubKullanicilar();
      unsubSahaFaaliyetleri();
      unsubKasaHareketleri();
      unsubKampOdalari();
      unsubKampKayitlari();
      unsubNotif();
      unsubStoklar();
      unsubAraclar();
      unsubAracKm();
      unsubCari();
      unsubOperator();
      unsubTaseronKesinti();
      unsubMaasOde();
    };
  }, [dbStatus, currentUser]);

  // Auto online signup sync and administrator check
  useEffect(() => {
    if (authLoading || !currentUser || !currentUser.email) return;
    const emailLower = currentUser.email.toLowerCase();
    
    // Check if user is in DB list of accounts
    const exists = kullanicilar.some(u => u.email.toLowerCase() === emailLower);
    if (!exists && (dbStatus === 'synced' || dbStatus === 'offline')) {
      const isSamet = emailLower === 'sametatak9@gmail.com';
      const isDefaultAdmin = emailLower === 'santiye@kibritci.com';
      
      const newKullanici: Kullanici = {
        id: currentUser.uid || `u_${Date.now()}`,
        email: currentUser.email,
        yetki: isSamet || isDefaultAdmin ? 'YÖNETİCİ' : 'MİSAFİR',
        durum: 'AKTİF',
        kayitTarihi: new Date().toISOString().split('T')[0]
      };
      
      if (dbStatus === 'synced') {
        setKullanicilarWithSync(prev => {
          if (prev.some(u => u.email.toLowerCase() === emailLower)) return prev;
          return [...prev, newKullanici];
        });
      } else {
        setKullanicilar(prev => {
          if (prev.some(u => u.email.toLowerCase() === emailLower)) return prev;
          return [...prev, newKullanici];
        });
      }
    }
  }, [currentUser, kullanicilar, authLoading, dbStatus]);

  // Auto-redirect FORMEN to their mobile screen
  useEffect(() => {
    if (!currentUser || !kullanicilar.length) return;
    const matched = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    if (matched) {
      if (matched.yetki === 'FORMEN' && activeTab !== 'formen_ekrani') {
        setActiveTab('formen_ekrani');
      }
      if (matched.yetki === 'GÜVENLİK' && activeTab !== 'guvenlik_ekrani') {
        setActiveTab('guvenlik_ekrani');
      }
      if (matched.yetki === 'KAMPÇI' && activeTab !== 'kampci_ekrani') {
        setActiveTab('kampci_ekrani');
      }
      if (matched.yetki === 'LOJİSTİK' && activeTab !== 'lojistik_ekrani') {
        setActiveTab('lojistik_ekrani');
      }
      if (matched.yetki === 'DEPOCU' && activeTab !== 'depocu_ekrani') {
        setActiveTab('depocu_ekrani');
      }
      if (matched.imzaText) {
        setSignatureText(matched.imzaText);
        localStorage.setItem('kibritci_sig_text', matched.imzaText);
      }
      if (matched.imzaStyle) {
        setSignatureStyle(matched.imzaStyle);
        localStorage.setItem('kibritci_sig_style', matched.imzaStyle);
      }
    }
  }, [currentUser, kullanicilar, activeTab]);

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('kibritci_portal_session');
      await signOut(auth);
      setCurrentUser(null);
    } catch (err) {
      console.error('Signout error:', err);
    }
  };

  // 2. Optimistic Intercepting Wrapper State Setters
  const setPersonellerWithSync = (updater: Personel[] | ((p: Personel[]) => Personel[])) => {
    setPersoneller(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('personeller', prev, next), 0);
      return next;
    });
  };

  const setYoklamalarWithSync = (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => {
    setYoklamalar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => saveYoklamaDocument(next), 0);
      return next;
    });
  };

  const setSatinAlmaTalepleriWithSync = (updater: SatinAlmaTalebi[] | ((s: SatinAlmaTalebi[]) => SatinAlmaTalebi[])) => {
    setSatinAlmaTalepleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('satinAlmaTalepleri', prev, next), 0);
      return next;
    });
  };

  const setIrsaliyelerWithSync = (updater: Irsaliye[] | ((i: Irsaliye[]) => Irsaliye[])) => {
    setIrsaliyeler(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('irsaliyeler', prev, next), 0);
      return next;
    });
  };

  const setFaturalarWithSync = (updater: Fatura[] | ((f: Fatura[]) => Fatura[])) => {
    setFaturalar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('faturalar', prev, next), 0);
      return next;
    });
  };

  const setKasaHareketleriWithSync = (updater: KasaHareketi[] | ((k: KasaHareketi[]) => KasaHareketi[])) => {
    setKasaHareketleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('kasaHareketleri', prev, next), 0);
      return next;
    });
  };

  const setAraclarWithSync = (updater: AracBakim[] | ((a: AracBakim[]) => AracBakim[])) => {
    setAraclar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('araclar', prev, next), 0);
      return next;
    });
  };

  const setDemirbaslarWithSync = (updater: Demisbas[] | ((d: Demisbas[]) => Demisbas[])) => {
    setDemirbaslar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('demirbaslar', prev, next), 0);
      return next;
    });
  };

  const setKampOdalariWithSync = (updater: KampOdasi[] | ((k: KampOdasi[]) => KampOdasi[])) => {
    setKampOdalari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('kampOdalari', prev, next), 0);
      return next;
    });
  };

  const setKampKayitlariWithSync = (updater: KampKaydi[] | ((k: KampKaydi[]) => KampKaydi[])) => {
    setKampKayitlari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('kampKayitlari', prev, next), 0);
      return next;
    });
  };

  const setSahaFaaliyetleriWithSync = (updater: SahaFaaliyetiType[] | ((s: SahaFaaliyetiType[]) => SahaFaaliyetiType[])) => {
    setSahaFaaliyetleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('sahaFaaliyetleri', prev, next), 0);
      return next;
    });
  };

  const setHazirTutanaklarWithSync = (updater: HazirTutanak[] | ((h: HazirTutanak[]) => HazirTutanak[])) => {
    setHazirTutanaklar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('hazirTutanaklar', prev, next), 0);
      return next;
    });
  };

  const handleSendAssistantMessage = async () => {
    if (!assistantInput.trim() || assistantLoading) return;
    const userMsg = assistantInput.trim();
    setAssistantInput("");
    setAssistantMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setAssistantLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      if (!response.ok) {
        throw new Error("Asistan ile haberleşirken hata oluştu.");
      }
      const data = await response.json();
      setAssistantMessages(prev => [...prev, { sender: 'assistant', text: data.text || 'Cevap alınamadı.' }]);
    } catch (err: any) {
      setAssistantMessages(prev => [...prev, { sender: 'assistant', text: `Hata: ${err.message || 'Bir sorun oluştu. Gemini API etkin olduğundan emin olun.'}` }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  const setCariKartlarWithSync = (updater: CariKart[] | ((c: CariKart[]) => CariKart[])) => {
    setCariKartlar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('cariKartlar', prev, next), 0);
      return next;
    });
  };

  const setStokKartlarWithSync = (updater: StokKart[] | ((s: StokKart[]) => StokKart[])) => {
    setStokKartlar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('stokKartlar', prev, next), 0);
      return next;
    });
  };

  const setEpostaGonderimleriWithSync = (updater: EpostaGonderim[] | ((e: EpostaGonderim[]) => EpostaGonderim[])) => {
    setEpostaGonderimleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('epostaGonderimleri', prev, next), 0);
      return next;
    });
  };

  const setKullanicilarWithSync = (updater: Kullanici[] | ((u: Kullanici[]) => Kullanici[])) => {
    setKullanicilar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('kullanicilar', prev, next), 0);
      return next;
    });
  };

  const setAracKmLoglariWithSync = (updater: any[] | ((a: any[]) => any[])) => {
    setAracKmLoglari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('aracKmLoglari', prev, next), 0);
      return next;
    });
  };

  const setOperatorFaaliyetleriWithSync = (updater: OperatorFaaliyet[] | ((o: OperatorFaaliyet[]) => OperatorFaaliyet[])) => {
    setOperatorFaaliyetleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('operatorFaaliyetleri', prev, next), 0);
      return next;
    });
  };

  const setTaseronKesintiRaporlariWithSync = (updater: TaseronKesintiRaporu[] | ((t: TaseronKesintiRaporu[]) => TaseronKesintiRaporu[])) => {
    setTaseronKesintiRaporlari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('taseronKesintiRaporlari', prev, next), 0);
      return next;
    });
  };

  const setMaasOdemeleriWithSync = (updater: MaaşOdeme[] | ((m: MaaşOdeme[]) => MaaşOdeme[])) => {
    setMaasOdemeleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('maasOdemeleri', prev, next), 0);
      return next;
    });
  };

  const setPersonelIslemGecmisiWithSync = (updater: PersonelIslemGecmisi[] | ((p: PersonelIslemGecmisi[]) => PersonelIslemGecmisi[])) => {
    setPersonelIslemGecmisi(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('personelIslemGecmisi', prev, next), 0);
      return next;
    });
  };

  const setCariIslemGecmisiWithSync = (updater: CariKartIslem[] | ((c: CariKartIslem[]) => CariKartIslem[])) => {
    setCariIslemGecmisi(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('cariIslemGecmisi', prev, next), 0);
      return next;
    });
  };

  const setStokIslemGecmisiWithSync = (updater: StokKartIslem[] | ((s: StokKartIslem[]) => StokKartIslem[])) => {
    setStokIslemGecmisi(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setTimeout(() => syncArrayToFirestore('stokIslemGecmisi', prev, next), 0);
      return next;
    });
  };

  const addNotification = async (mesaj: string) => {
    try {
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        tarih: new Date().toISOString(),
        kullanici: currentUser?.email || 'Sistem',
        mesaj,
        okundu: false
      };
      await saveDocument('bildirimler', newNotif);
    } catch (err) {
      console.error("Bildirim eklenemedi:", err);
    }
  };

  const markAllNotificationsAsRead = async () => {
    try {
      const promises = bildirimler.map(n => {
        if (!n.okundu) {
          return saveDocument('bildirimler', { ...n, okundu: true });
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
    } catch (err) {
      console.error("Bildirimler okundu işaretlenirken hata:", err);
    }
  };

  const handleTabNavigation = (targetTab: string) => {
    setActiveTab(targetTab);
  };

  // Public image view check first
  if (publicLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 font-sans p-6">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">KİBRİTÇİ ERP GÖRSEL SORGU...</p>
      </div>
    );
  }

  if (publicViewGiris) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col p-5 space-y-4">
          
          {/* Header */}
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <div className="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-950 font-black">
              🪪
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 tracking-wider">KİBRİTÇİ İNŞAAT</h2>
              <p className="text-[10px] text-amber-500 font-mono uppercase font-black">PERSONEL KİMLİK SORGULAMA</p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-850/60 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-500 font-bold">AD SOYAD:</span>
              <span className="font-extrabold text-slate-100 uppercase">{publicViewGiris.ad} {publicViewGiris.soyad}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-500 font-bold">GÖREV / BRANŞ:</span>
              <span className="font-bold text-amber-400 uppercase">{publicViewGiris.gorev}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-500 font-bold">TALEP TARİHİ:</span>
              <span className="font-mono text-slate-300">{new Date(publicViewGiris.tarih).toLocaleString('tr-TR')}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-500 font-bold">GÖNDEREN FORMEN:</span>
              <span className="font-semibold text-slate-300">{publicViewGiris.gonderenFormen?.split('@')[0]}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-bold">ONAY DURUMU:</span>
              <span className="font-black text-emerald-400 uppercase">{publicViewGiris.durum}</span>
            </div>
          </div>

          {/* Image */}
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-sans">PERSONEL KİMLİK BELGESİ FOTOĞRAFI</span>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-2 flex items-center justify-center min-h-[160px]">
              {publicViewGiris.kimlikFotoUrl ? (
                <img 
                  src={publicViewGiris.kimlikFotoUrl} 
                  alt="Kimlik Fotoğrafı" 
                  className="max-h-64 object-contain rounded-lg border border-slate-800"
                />
              ) : (
                <span className="text-xs text-slate-500 italic">Kimlik fotoğrafı yüklenmemiş.</span>
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <button
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view_giris');
              window.history.replaceState({}, '', url.toString());
              setPublicViewGiris(null);
            }}
            className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition duration-150 cursor-pointer"
          >
            Sistem Giriş Paneline Git
          </button>

        </div>
      </div>
    );
  }

  // Full screen auth checking loader
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-8 select-none">
        <div className="text-center space-y-4">
          <span className="text-4xl animate-spin inline-block">⏳</span>
          <div className="space-y-1">
            <h1 className="text-xs font-mono font-bold tracking-widest text-[#F59E0B]">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider font-sans">OTURUM DOĞRULANIYOR / PORTAL ŞİFRELENİYOR...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render Login Screen if not authenticated
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  // Full screen high fidelity, stylized loader screen during first startup
  if (dbStatus === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8 select-none">
        <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
          <div className="space-y-3">
            <span className="text-4xl animate-bounce inline-block">🏢</span>
            <h1 className="text-xl font-black tracking-widest text-[#F59E0B]">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">Bulut ERP Yönetim Altyapısı v2.6</p>
          </div>

          <div className="bg-slate-850 p-6 rounded-2xl border border-slate-700/60 shadow-xl space-y-5">
            <div className="flex items-center justify-center space-x-3 text-sm text-amber-400 font-semibold min-h-[24px]">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
              <span>{loadingMsg}</span>
            </div>
            
            {/* Visual sleek layout progress line bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden border border-slate-700">
              <div className="bg-gradient-to-r from-amber-400 to-amber-600 h-full rounded-full animate-pulse transition-all duration-300 w-full" />
            </div>

            {/* Robust Interactive Timeout Bypass trigger */}
            <div className="pt-2 border-t border-slate-800/80">
              <p className="text-[9px] text-slate-400 italic mb-2">Başlatma adımı çok mu uzun sürdü? İnternet/Sunucu bağlantısını atlayabilirsiniz:</p>
              <button
                type="button"
                onClick={switchToOfflineMode}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-[11px] py-2.5 px-4 rounded-xl transition duration-150 shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>⚡ BAĞLANTIYI ATLA & DEMO SİMÜLASYONUNDA ÇALIŞTIR</span>
              </button>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 italic">
            * Güvenli Google Cloud Firestore Bulut NoSQL veritabanı aktif edilmiştir. Tüm kullanıcılar gerçek zamanlı eş zamanlı çalışabilir.
          </p>
        </div>
      </div>
    );
  }

  const matchedU = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
  const isYonetici = matchedU?.yetki === 'YÖNETİCİ' || 
                     currentUser?.email?.toLowerCase() === 'sametatak9@gmail.com' || 
                     currentUser?.email?.toLowerCase() === 'santiye@kibritci.com';

  const hideSidebarAndTopbar = matchedU?.yetki === 'FORMEN' || 
                               matchedU?.yetki === 'GÜVENLİK' || 
                               matchedU?.yetki === 'KAMPÇI' || 
                               matchedU?.yetki === 'LOJİSTİK' ||
                               matchedU?.yetki === 'DEPOCU';

  const isAllowedFormen = matchedU?.yetki === 'FORMEN' || isYonetici;
  const isAllowedGuvenlik = matchedU?.yetki === 'GÜVENLİK' || isYonetici;
  const isAllowedKampci = matchedU?.yetki === 'KAMPÇI' || isYonetici;
  const isAllowedLojistik = matchedU?.yetki === 'LOJİSTİK' || isYonetici;
  const isAllowedDepocu = matchedU?.yetki === 'DEPOCU' || isYonetici;
  const isTabRestricted = matchedU?.kisitliSayfalar?.includes(activeTab);

  const renderAccessDenied = () => (
    <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-8 z-50 select-none text-white">
      <div className="text-center space-y-5 max-w-md bg-slate-900 border border-red-500/30 p-8 rounded-3xl shadow-2xl">
        <span className="text-5xl block animate-pulse">🚫</span>
        <h1 className="text-sm font-black tracking-widest text-rose-500 uppercase">
          YETKİSİZ ERİŞİM ENGELİ!
        </h1>
        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Sayın yetkili, bu sayfaya erişim yetkiniz bulunmamaktadır. Sadece ilgili yetkili personel ve şantiye yöneticisi bu alanı görüntüleyebilir.
        </p>
        <button 
          onClick={() => {
            if (matchedU?.yetki === 'FORMEN') setActiveTab('formen_ekrani');
            else if (matchedU?.yetki === 'GÜVENLİK') setActiveTab('guvenlik_ekrani');
            else if (matchedU?.yetki === 'KAMPÇI') setActiveTab('kampci_ekrani');
            else if (matchedU?.yetki === 'LOJİSTİK') setActiveTab('lojistik_ekrani');
            else if (matchedU?.yetki === 'DEPOCU') setActiveTab('depocu_ekrani');
            else setActiveTab('ana_sayfa');
          }} 
          className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold py-2.5 rounded-xl cursor-pointer transition shadow-lg"
        >
          {hideSidebarAndTopbar ? "Kendi Paneline Dön" : "Ana Sayfaya Dön"}
        </button>
      </div>
    </div>
  );

  if (isMobileMode && currentUser) {
    const role = matchedU?.yetki;
    if (role === 'FORMEN') {
      return (
        <FormenScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          sahaFaaliyetleri={sahaFaaliyetleri}
          setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          kullanicilar={kullanicilar}
        />
      );
    }
    if (role === 'GÜVENLİK') {
      return (
        <GuvenlikScreen
          personeller={personeller}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          userYetki={matchedU?.yetki}
          isStandalone={true}
        />
      );
    }
    if (role === 'KAMPÇI') {
      return (
        <KampciScreen
          kampOdalari={kampOdalari}
          setKampOdalari={setKampOdalariWithSync}
          kampKayitlari={kampKayitlari}
          setKampKayitlari={setKampKayitlariWithSync}
          personeller={personeller}
          stokKartlar={stokKartlar}
          setStokKartlar={setStokKartlarWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
        />
      );
    }
    if (role === 'LOJİSTİK') {
      return (
        <LojistikScreen
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          satinAlmaTalepleri={satinAlmaTalepleri}
          araclar={araclar}
          setAraclar={setAraclarWithSync}
          aracKmLoglari={aracKmLoglari}
          setAracKmLoglari={setAracKmLoglariWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
        />
      );
    }
    if (role === 'DEPOCU') {
      return (
        <DepocuScreen
          stokKartlar={stokKartlar}
          setStokKartlar={setStokKartlarWithSync}
          personeller={personeller}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
        />
      );
    }

    if (isMobileDirect) {
      // Fall through to normal responsive layout
    } else {
      return (
        <MobileManagerScreen
          currentUser={currentUser}
          onSignOut={handleSignOut}
          personeller={personeller}
          kasaHareketleri={kasaHareketleri}
          satinAlmaTalepleri={satinAlmaTalepleri}
          kullanicilar={kullanicilar}
          sahaFaaliyetleri={sahaFaaliyetleri}
          setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
          setKullanicilar={setKullanicilarWithSync}
          setSatinAlmaTalepleri={setSatinAlmaTalepleriWithSync}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          araclar={araclar}
          setAraclar={setAraclarWithSync}
          aracKmLoglari={aracKmLoglari}
          setAracKmLoglari={setAracKmLoglariWithSync}
          kampOdalari={kampOdalari}
          setKampOdalari={setKampOdalariWithSync}
          kampKayitlari={kampKayitlari}
          setKampKayitlari={setKampKayitlariWithSync}
          stokKartlar={stokKartlar}
          setStokKartlar={setStokKartlarWithSync}
          onToggleDesktopMode={() => {
            setIsMobileMode(false);
            setIsMobileDirect(false);
            localStorage.setItem('kibritci_mobile_mode', 'false');
            localStorage.setItem('kibritci_mobile_direct', 'false');
          }}
        />
      );
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800 font-sans">
      
      {/* Sidebar - responsive custom figma menu */}
      {!hideSidebarAndTopbar && (
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={handleTabNavigation} 
          currentUser={currentUser} 
          onSignOut={handleSignOut} 
          onSignatureEdit={() => setShowSignatureModal(true)}
          isYonetici={isYonetici}
          userYetki={matchedU?.yetki}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          kisitliSayfalar={matchedU?.kisitliSayfalar}
          onToggleMobileMode={() => {
            setIsMobileMode(true);
            setIsMobileDirect(false);
            localStorage.setItem('kibritci_mobile_mode', 'true');
            localStorage.setItem('kibritci_mobile_direct', 'false');
          }}
        />
      )}

      {/* Main Content Container wrapper Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top bar with Breadcrumbs / real-time clock indicator */}
        {!hideSidebarAndTopbar && (
          <Topbar 
            currentTab={activeTab} 
            dbStatus={dbStatus} 
            currentUser={currentUser} 
            kullanicilar={kullanicilar} 
            onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
            bildirimler={bildirimler}
            onClearNotifications={markAllNotificationsAsRead}
            onToggleMobileMode={() => {
              setIsMobileMode(true);
              setIsMobileDirect(false);
              localStorage.setItem('kibritci_mobile_mode', 'true');
              localStorage.setItem('kibritci_mobile_direct', 'false');
            }}
          />
        )}

        {/* Dynamic Inner Screens Router wrapper */}
        <main className="flex-1 overflow-y-auto relative bg-slate-50">
          
          {(() => {
            const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
            if (matchedUser?.durum === 'KISITLI' || matchedUser?.durum === 'ONAY BEKLİYOR' || matchedUser?.yetki === 'MİSAFİR') {
              const pending = matchedUser?.durum === 'ONAY BEKLİYOR';
              const isGuest = matchedUser?.yetki === 'MİSAFİR';
              return (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-8 z-50 select-none text-white animate-fade-in">
                  <div className="text-center space-y-5 max-w-md bg-slate-900 border border-amber-500/30 p-8 rounded-3xl shadow-2xl">
                    <span className="text-5xl block animate-bounce">{isGuest ? '⏳' : pending ? '⌛' : '🚫'}</span>
                    <h1 className="text-sm font-black tracking-widest text-amber-500 uppercase">
                      {isGuest ? 'MİSAFİR HESABI - YETKİLENDİRME BEKLENİYOR' : pending ? 'ÜYELİK ONAYI BEKLENİYOR!' : 'YETKİNİZ SÜRESİZ KISITLANMIŞTIR!'}
                    </h1>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {isGuest
                        ? `Sayın yetkili, ${currentUser?.email} hesabınız başarıyla oluşturulmuştur. Ancak sisteme erişim yetkiniz henüz şantiye yöneticisi tarafından onaylanmamıştır. Rolünüz: MİSAFİR.`
                        : pending 
                          ? `Sayın yetkili, ${currentUser?.email} hesabınız başarıyla oluşturulmuştur. Ancak sisteme erişiminiz henüz şantiye yöneticisi tarafından onaylanmamıştır.`
                          : `Sistem güvenlik politikaları gereği dondurulan ${currentUser?.email} hesabı ile hiçbir işlem yürütülemez.`
                      }
                      <br />
                      <br />
                      Lütfen şirket yöneticisi (<strong className="text-amber-400 font-bold">sametatak9@gmail.com</strong>) ile iletişime geçiniz.
                    </p>
                    <button 
                      onClick={handleSignOut} 
                      className="w-full bg-amber-600 hover:bg-amber-700 text-slate-950 text-xs font-bold py-2.5 rounded-xl cursor-pointer transition shadow-lg active:scale-95"
                    >
                      Farklı Hesapla Giriş Yap
                    </button>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {isTabRestricted ? renderAccessDenied() : (
            <>
              {activeTab === "ana_sayfa" && (
                <DashboardScreen 
                  personeller={personeller}
                  kasaHareketleri={kasaHareketleri}
                  yoklamalar={yoklamalar}
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  araclar={araclar}
                  aracKmLoglari={aracKmLoglari}
                  kampOdalari={kampOdalari}
                  kampKayitlari={kampKayitlari}
                  onNavigate={handleTabNavigation}
                  currentUser={currentUser}
                  stokKartlar={stokKartlar}
                  bildirimler={bildirimler}
                />
              )}

              {activeTab === "admin" && (
                <AdminPanelScreen 
                  kullanicilar={kullanicilar}
                  setKullanicilar={setKullanicilarWithSync}
                  currentUser={currentUser}
                  personeller={personeller}
                  addNotification={addNotification}
                />
              )}

              {activeTab === "personel" && (
                <PersonelScreen 
                  personeller={personeller} 
                  setPersoneller={setPersonellerWithSync} 
                />
              )}

              {activeTab === "yoklama" && (
                <YoklamaScreen 
                  personeller={personeller} 
                  yoklamalar={yoklamalar} 
                  setYoklamalar={setYoklamalarWithSync} 
                  addNotification={addNotification}
                />
              )}

              {activeTab === "maas" && (
                <MaasScreen 
                  personeller={personeller} 
                  yoklamalar={yoklamalar} 
                  setYoklamalar={setYoklamalarWithSync}
                />
              )}

              {activeTab === "personel_izin" && (
                <PersonelIzinScreen 
                  personeller={personeller} 
                  currentUser={currentUser}
                />
              )}

              {activeTab === "satin_alma" && (
                <SatinAlmaScreen 
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  setSatinAlmaTalepleri={setSatinAlmaTalepleriWithSync}
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  faturalar={faturalar}
                  setFaturalar={setFaturalarWithSync}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  kullanicilar={kullanicilar}
                  currentUser={currentUser}
                  addNotification={addNotification}
                />
              )}

              {activeTab === "kasa" && (
                <KasaScreen 
                  kasaHareketleri={kasaHareketleri}
                  setKasaHareketleri={setKasaHareketleriWithSync}
                />
              )}

              {/* Combined Idari Panels: arac, kamp, saha, tutanak, cari_stok, eposta */}
              {["arac", "kamp", "saha", "tutanak", "cari_stok", "eposta"].includes(activeTab) && (
                <IdariScreen 
                  currentSubTab={activeTab}
                  araclar={araclar}
                  setAraclar={setAraclarWithSync}
                  demirbaslar={demirbaslar}
                  setDemirbaslar={setDemirbaslarWithSync}
                  kampOdalari={kampOdalari}
                  setKampOdalari={setKampOdalariWithSync}
                  kampKayitlari={kampKayitlari}
                  setKampKayitlari={setKampKayitlariWithSync}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                  setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
                  hazirTutanaklar={hazirTutanaklar}
                  setHazirTutanaklar={setHazirTutanaklarWithSync}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  epostaGonderimleri={epostaGonderimleri}
                  setEpostaGonderimleri={setEpostaGonderimleriWithSync}
                  personeller={personeller}
                  aracKmLoglari={aracKmLoglari}
                  setAracKmLoglari={setAracKmLoglariWithSync}
                  yoklamalar={yoklamalar}
                />
              )}

              {activeTab === "onay_islemleri" && (
                <OnayIslemleriScreen 
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  setSatinAlmaTalepleri={setSatinAlmaTalepleriWithSync}
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  faturalar={faturalar}
                  setFaturalar={setFaturalarWithSync}
                  kullanicilar={kullanicilar}
                  currentUser={currentUser}
                  signatureText={signatureText}
                  signatureStyle={signatureStyle}
                  addNotification={addNotification}
                />
              )}

              {activeTab === "sohbet" && (
                <SohbetScreen 
                  currentUser={currentUser}
                  kullanicilar={kullanicilar}
                />
              )}

              {activeTab === "formen_ekrani" && (
                isAllowedFormen ? (
                  <FormenScreen 
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    sahaFaaliyetleri={sahaFaaliyetleri}
                    setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    isStandalone={hideSidebarAndTopbar}
                    kullanicilar={kullanicilar}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "guvenlik_ekrani" && (
                isAllowedGuvenlik ? (
                  <GuvenlikScreen 
                    personeller={personeller}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    userYetki={matchedU?.yetki}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "kampci_ekrani" && (
                isAllowedKampci ? (
                  <KampciScreen 
                    kampOdalari={kampOdalari}
                    setKampOdalari={setKampOdalariWithSync}
                    kampKayitlari={kampKayitlari}
                    setKampKayitlari={setKampKayitlariWithSync}
                    personeller={personeller}
                    stokKartlar={stokKartlar}
                    setStokKartlar={setStokKartlarWithSync}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "lojistik_ekrani" && (
                isAllowedLojistik ? (
                  <LojistikScreen 
                    irsaliyeler={irsaliyeler}
                    setIrsaliyeler={setIrsaliyelerWithSync}
                    satinAlmaTalepleri={satinAlmaTalepleri}
                    araclar={araclar}
                    setAraclar={setAraclarWithSync}
                    aracKmLoglari={aracKmLoglari}
                    setAracKmLoglari={setAracKmLoglariWithSync}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    isStandalone={hideSidebarAndTopbar}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "depocu_ekrani" && (
                isAllowedDepocu ? (
                  <DepocuScreen 
                    stokKartlar={stokKartlar}
                    setStokKartlar={setStokKartlarWithSync}
                    personeller={personeller}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "evrak_aktarimi" && (
                isYonetici ? (
                  <EvrakAktarimiScreen 
                    cariKartlar={cariKartlar}
                    setCariKartlar={setCariKartlarWithSync}
                    stokKartlar={stokKartlar}
                    setStokKartlar={setStokKartlarWithSync}
                    currentUser={currentUser}
                    setFaturalar={setFaturalarWithSync}
                    setIrsaliyeler={setIrsaliyelerWithSync}
                    setKasaHareketleri={setKasaHareketleriWithSync}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    sahaFaaliyetleri={sahaFaaliyetleri}
                    setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
                    personeller={personeller}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "profil" && (
                <ProfilScreen 
                  currentUser={currentUser}
                  kullanicilar={kullanicilar}
                  setKullanicilar={setKullanicilarWithSync}
                  onSignOut={handleSignOut}
                  isStandalone={hideSidebarAndTopbar}
                />
              )}

              {activeTab === "yetki_verme" && (
                (currentUser?.email?.toLowerCase() === 'sametatak9@gmail.com' || currentUser?.email?.toLowerCase() === 'santiye@kibritci.com') ? (
                  <YetkiVermeScreen 
                    kullanicilar={kullanicilar}
                    setKullanicilar={setKullanicilarWithSync}
                    currentUser={currentUser}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "kibar_hakedis" && (
                (currentUser?.email?.toLowerCase() === 'sametatak9@gmail.com' || currentUser?.email?.toLowerCase() === 'santiye@kibritci.com') ? (
                  <KibarHakedisScreen
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    sahaFaaliyetleri={sahaFaaliyetleri}
                    currentUser={currentUser}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "operator" && (
                <OperatorScreen
                  araclar={araclar}
                  personeller={personeller}
                  cariKartlar={cariKartlar}
                  operatorFaaliyetleri={operatorFaaliyetleri}
                  setOperatorFaaliyetleri={setOperatorFaaliyetleriWithSync}
                  taseronKesintiRaporlari={taseronKesintiRaporlari}
                  setTaseronKesintiRaporlari={setTaseronKesintiRaporlariWithSync}
                  currentUser={currentUser}
                  addNotification={addNotification}
                />
              )}

              {activeTab === "maas_odeme" && (
                <MaasOdeScreen
                  personeller={personeller}
                  yoklamalar={yoklamalar}
                  maasOdemeleri={maasOdemeleri}
                  setMaasOdemeleri={setMaasOdemeleriWithSync}
                  currentUser={currentUser}
                />
              )}
            </>
          )}

        </main>
      </div>

      {/* ✍️ DİJİTAL İMZA BELİRLEME MODÜLÜ (MODAL OVERLAY) */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-slate-950/75 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
            
            {/* Header */}
            <div className="bg-slate-900 border-b p-5 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">✍️</span>
                <div>
                  <h3 className="font-display font-semibold text-sm">Dijital Onay &amp; İmza Ayarları</h3>
                  <p className="text-[10px] text-slate-400">Belgeleri onayladığınızda vurulacak imza şablonu</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSignatureModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer text-sm"
              >
                ✖
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 flex-1 text-xs text-slate-700">
              
              {/* Name field */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 uppercase text-[9px] tracking-wide block">İmza Sahibi İsim / Unvan</label>
                <input 
                  type="text"
                  value={signatureText}
                  onChange={(e) => {
                    setSignatureText(e.target.value);
                    localStorage.setItem('kibritci_sig_text', e.target.value);
                  }}
                  placeholder="Örn: Samet Atak (Şantiye Şefi)"
                  className="w-full bg-slate-50 border border-slate-205 py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-slate-800"
                />
              </div>

              {/* Style selection */}
              <div className="space-y-2">
                <label className="font-bold text-slate-500 uppercase text-[9px] tracking-wide block">İmza Görünüm Formatı (Visual Preset)</label>
                <div className="grid grid-cols-3 gap-3">
                  
                  <button 
                    onClick={() => {
                      setSignatureStyle('cursive');
                      localStorage.setItem('kibritci_sig_style', 'cursive');
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1 cursor-pointer ${
                      signatureStyle === 'cursive' 
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/20' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">✒️</span>
                    <span className="font-bold text-[10px]">Cursive Art</span>
                    <span className="text-[8px] text-slate-400">Sanatsal Islak Mürekkep</span>
                  </button>

                  <button 
                    onClick={() => {
                      setSignatureStyle('monospaced');
                      localStorage.setItem('kibritci_sig_style', 'monospaced');
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1 cursor-pointer ${
                      signatureStyle === 'monospaced' 
                        ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-400/20' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">💻</span>
                    <span className="font-bold text-[10px]">Cryptographic</span>
                    <span className="text-[8px] text-slate-400">Blokzincir Hash Kodlu</span>
                  </button>

                  <button 
                    onClick={() => {
                      setSignatureStyle('seal');
                      localStorage.setItem('kibritci_sig_style', 'seal');
                    }}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1 cursor-pointer ${
                      signatureStyle === 'seal' 
                        ? 'border-red-500 bg-red-50/30 ring-2 ring-red-400/20' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">💮</span>
                    <span className="font-bold text-[10px]">Şirket Mührü</span>
                    <span className="text-[8px] text-slate-400">Circular Resmi Kaşe</span>
                  </button>

                </div>
              </div>

              {/* Real-time preview panel */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-2">
                <span className="font-bold text-slate-400 uppercase text-[8px] tracking-wider block">Canlı Dijital Damga Önizlemesi</span>
                
                <div className="h-28 bg-white border border-slate-150 rounded-xl flex items-center justify-center p-4 relative overflow-hidden">
                  
                  {signatureStyle === 'cursive' && (
                    <div className="text-center font-serif text-slate-800 select-none transform -rotate-2">
                      <span className="text-lg italic tracking-wider font-extrabold text-[#111827] block" style={{ fontFamily: 'Georgia, serif' }}>
                        {signatureText}
                      </span>
                      <div className="w-24 h-0.5 bg-amber-400/60 mx-auto mt-1 rounded-full"></div>
                      <span className="text-[8px] tracking-widest text-[#374151] font-mono font-medium block mt-1 uppercase">DİJİTAL GÜVENLİ ONAY</span>
                    </div>
                  )}

                  {signatureStyle === 'monospaced' && (
                    <div className="font-mono text-[9px] text-slate-600 space-y-0.5 select-none text-left w-full border border-[#10b981]/20 bg-emerald-50/20 p-2.5 rounded-lg">
                      <div className="flex justify-between">
                        <span className="text-emerald-700 font-bold">SECURE CERT:</span>
                        <span className="text-slate-400">ID: KBR-2026-X1</span>
                      </div>
                      <p className="truncate text-slate-800">AUTH: <strong className="font-bold">{currentUser?.email}</strong></p>
                      <p className="truncate text-[8px]">MD5: {btoa(signatureText).substring(0, 16).toUpperCase()}</p>
                      <span className="text-emerald-700 font-bold text-[8px] block">MATCHING VERIFIED ✅</span>
                    </div>
                  )}

                  {signatureStyle === 'seal' && (
                    <div className="text-center select-none p-3 border-2 border-dashed border-red-500 rounded-full w-24 h-24 flex flex-col items-center justify-center transform -rotate-3 bg-red-50/20">
                      <span className="text-[7px] text-red-600 font-black tracking-tighter uppercase leading-none block">KİBRİTÇİ İNŞAAT</span>
                      <span className="-my-1 text-[11px] font-black tracking-widest text-red-500 block uppercase">✔</span>
                      <span className="text-[8px] font-bold text-slate-800 truncate max-w-[70px] leading-tight block">
                        {signatureText.split(' ')[0]}
                      </span>
                      <span className="text-[6px] text-slate-400 font-bold block leading-none">2026-ERP</span>
                    </div>
                  )}

                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-amber-900 leading-snug">
                📌 <strong className="font-bold">Nasıl Kullanılır?:</strong> Belirlediğiniz bu dijital imza formatı, siz Satın Alma Modülünde ve diğer şantiye evraklarında <strong className="font-bold">"İmzalayıp Onayla"</strong> butonuna tıkladığınızda bizzat raporlara basılacaktır.
              </div>

            </div>

            {/* Footer buttons */}
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button
                onClick={() => {
                  localStorage.setItem('kibritci_sig_text', signatureText);
                  localStorage.setItem('kibritci_sig_style', signatureStyle);
                  setShowSignatureModal(false);
                }}
                className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition duration-150 cursor-pointer shadow-md"
              >
                💾 Tercihlerimi Kaydet &amp; Uygula
              </button>
            </div>

          </div>
        </div>
      )}
      {/* Global AI Error Reporter Dialog */}
      {errorReport && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-slate-900 border border-slate-800 text-gray-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-500">
              <div className="w-10 h-10 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20 shrink-0">
                <AlertCircle size={20} className="animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-white">SİSTEMSEL VEYA MANTIKSAL HATA YAKALANDI</h3>
                <p className="text-[10px] text-slate-400">Hata Türkçeye dönüştürüldü ve kurucu paneliniz için hazırlanıyor.</p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 space-y-1.5 text-xs text-rose-400">
              <p className="font-extrabold">⚠️ {errorReport.message}</p>
              {errorReport.contextInfo && (
                <p className="text-[10px] text-slate-500 font-mono">Ekran/Bağlam: {errorReport.contextInfo}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">BU HATA OLUŞURKEN NE YAPIYORDUNUZ? (HATA TARİFİ) *</label>
              <textarea
                required
                rows={3}
                placeholder="Lütfen hatayı nasıl aldığınızı (tıklanan buton, girilen değer vb.) kısaca tarif edin. Kurucumuz sametatak9@gmail.com hataları buradan düzeltecektir."
                value={errorUserNote}
                onChange={e => setErrorUserNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500 transition-colors"
              />
            </div>

            <div className="flex gap-2.5 pt-1.5">
              <button
                type="button"
                onClick={() => setErrorReport(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
              >
                Vazgeç / Kapat
              </button>
              <button
                type="button"
                disabled={sendingError}
                onClick={handleSendErrorReport}
                className="flex-1 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 disabled:from-rose-800/40 text-white font-black text-xs py-2.5 rounded-xl transition tracking-wide flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/10"
              >
                {sendingError ? <RefreshCw size={12} className="animate-spin" /> : null}
                <span>KURUCUYA GÖNDER</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🤖 FLOATING AI ASSISTANT WIDGET */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
        {showAiAssistant && (
          <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 text-white rounded-3xl w-80 sm:w-96 h-[450px] shadow-2xl flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-xl">✨</span>
                <div>
                  <h4 className="font-display font-semibold text-xs text-white">Kibritçi Şantiye Asistanı</h4>
                  <span className="text-[9px] text-slate-400">Yapay Zeka Destekli Şantiye Yönetimi</span>
                </div>
              </div>
              <button 
                onClick={() => setShowAiAssistant(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✖
              </button>
            </div>

            {/* Quick Metrics Summary */}
            <div className="bg-slate-950/60 p-3 border-b border-slate-850 grid grid-cols-3 gap-2 text-[10px] text-center text-slate-300">
              <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                <p className="text-slate-500 font-bold uppercase text-[8px]">Personel</p>
                <p className="font-mono font-bold text-emerald-400 mt-0.5">{personeller.length} Kişi</p>
              </div>
              <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                <p className="text-slate-500 font-bold uppercase text-[8px]">Onay Bekleyen</p>
                <p className="font-mono font-bold text-amber-400 mt-0.5">
                  {satinAlmaTalepleri.filter(sa => sa.onayDurumu === 'ONAY BEKLİYOR').length + 
                   irsaliyeler.filter(ir => ir.onayDurumu === 'ONAY BEKLİYOR').length} Adet
                </p>
              </div>
              <div className="bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                <p className="text-slate-500 font-bold uppercase text-[8px]">Kritik Stok</p>
                <p className="font-mono font-bold text-rose-400 mt-0.5">
                  {stokKartlar.filter(s => (s.miktar || 0) <= (s.kritikSeviye || 5)).length} Kalem
                </p>
              </div>
            </div>

            {/* Message Log */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-[11px] leading-relaxed">
              {assistantMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] p-3 rounded-2xl ${
                    msg.sender === 'user' 
                      ? 'bg-emerald-600 text-white rounded-br-none' 
                      : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-750'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {assistantLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 text-slate-400 p-3 rounded-2xl rounded-bl-none border border-slate-750 flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendAssistantMessage(); }}
              className="p-3 border-t border-slate-800 bg-slate-950 flex space-x-2"
            >
              <input 
                type="text"
                placeholder="Şantiye hakkında soru sorun..."
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <button 
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Gönder
              </button>
            </form>
          </div>
        )}

        <button 
          onClick={() => setShowAiAssistant(!showAiAssistant)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white p-3.5 rounded-full shadow-2xl transition duration-150 flex items-center justify-center cursor-pointer hover:scale-105"
        >
          <span className="text-xl">🤖</span>
        </button>
      </div>

    </div>
  );
}
