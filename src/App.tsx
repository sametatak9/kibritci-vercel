import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ToastProvider } from './components/ToastProvider';
import { SoundProvider } from './components/SoundProvider';
import { ContextMenuProvider } from './components/ContextMenuProvider';
import { KeyboardNavProvider } from './components/KeyboardNavProvider';
import { ConfettiProvider } from './components/ConfettiProvider';
import { EasterEggProvider } from './components/EasterEggProvider';
import { CommandPalette } from './components/CommandPalette';
import { StatusStrip } from './components/StatusStrip';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CircleAlert as AlertCircle, RefreshCw } from 'lucide-react';
import { pushRecentTab } from './lib/navPreferences';
import { countChromePendingOnay } from './lib/onayInboxUtils';

import { queueArrayStateSync } from './lib/collectionSyncQueue';
import { isPublicSiparisRoute } from './lib/sahaSiparisPublic';

// Core Screens — kod bölme (code splitting): her ekran ilk açıldığında ayrı paket olarak yüklenir,
// böylece ana paket küçülür ve uygulama ilk açılışta çok daha hızlı gelir.
import type { Kullanici } from './components/AdminPanelScreen';
const AdminPanelScreen = lazy(() => import('./components/AdminPanelScreen').then(m => ({ default: m.AdminPanelScreen })));
const DashboardScreen = lazy(() => import('./components/DashboardScreen').then(m => ({ default: m.DashboardScreen })));
const PersonelScreen = lazy(() => import('./components/PersonelScreen').then(m => ({ default: m.PersonelScreen })));
const YoklamaScreen = lazy(() => import('./components/YoklamaScreen').then(m => ({ default: m.YoklamaScreen })));
const FaaliyetPersonelScreen = lazy(() => import('./components/FaaliyetPersonelScreen').then(m => ({ default: m.FaaliyetPersonelScreen })));
const MaasMerkeziScreen = lazy(() => import('./components/MaasMerkeziScreen').then(m => ({ default: m.MaasMerkeziScreen })));
const PersonelIzinScreen = lazy(() => import('./components/PersonelIzinScreen').then(m => ({ default: m.PersonelIzinScreen })));
const SatinAlmaScreen = lazy(() => import('./components/SatinAlmaScreen').then(m => ({ default: m.SatinAlmaScreen })));
const IrsaliyeGirisScreen = lazy(() => import('./components/IrsaliyeGirisScreen').then(m => ({ default: m.IrsaliyeGirisScreen })));
const TCetveliScreen = lazy(() => import('./components/TCetveliScreen').then(m => ({ default: m.TCetveliScreen })));
const FaturaGirisScreen = lazy(() => import('./components/FaturaGirisScreen').then(m => ({ default: m.FaturaGirisScreen })));
const TaseronKesintiScreen = lazy(() => import('./components/TaseronKesintiScreen').then(m => ({ default: m.TaseronKesintiScreen })));
const PersonelKartlariScreen = lazy(() => import('./components/PersonelKartlariScreen').then(m => ({ default: m.PersonelKartlariScreen })));
const KasaScreen = lazy(() => import('./components/KasaScreen').then(m => ({ default: m.KasaScreen })));
const IdariScreen = lazy(() => import('./components/IdariScreen').then(m => ({ default: m.IdariScreen })));
const CariStokScreen = lazy(() => import('./components/CariStokScreen').then(m => ({ default: m.CariStokScreen })));
const OnayIslemleriScreen = lazy(() => import('./components/OnayIslemleriScreen').then(m => ({ default: m.OnayIslemleriScreen })));
const SiparisFormuScreen = lazy(() => import('./components/SiparisFormuScreen').then(m => ({ default: m.SiparisFormuScreen })));
const FormenScreen = lazy(() => import('./components/FormenScreen').then(m => ({ default: m.FormenScreen })));
const GuvenlikScreen = lazy(() => import('./components/GuvenlikScreen').then(m => ({ default: m.GuvenlikScreen })));
const KampciScreen = lazy(() => import('./components/KampciScreen').then(m => ({ default: m.KampciScreen })));
const TesisatciMobilScreen = lazy(() => import('./components/TesisatciMobilScreen').then(m => ({ default: m.TesisatciMobilScreen })));
const MermerciMobilScreen = lazy(() => import('./components/MermerciMobilScreen').then(m => ({ default: m.MermerciMobilScreen })));
const SeramikMobilScreen = lazy(() => import('./components/SeramikMobilScreen').then(m => ({ default: m.SeramikMobilScreen })));
const LojistikScreen = lazy(() => import('./components/LojistikScreen').then(m => ({ default: m.LojistikScreen })));
const ProfilScreen = lazy(() => import('./components/ProfilScreen').then(m => ({ default: m.ProfilScreen })));
const DepocuScreen = lazy(() => import('./components/DepocuScreen').then(m => ({ default: m.DepocuScreen })));
const ProjeIlerlemeScreen = lazy(() => import('./components/ProjeIlerlemeScreen').then(m => ({ default: m.ProjeIlerlemeScreen })));
const MobileManagerScreen = lazy(() => import('./components/MobileManagerScreen').then(m => ({ default: m.MobileManagerScreen })));
const KibarHakedisScreen = lazy(() => import('./components/KibarHakedisScreen').then(m => ({ default: m.KibarHakedisScreen })));

import { KibritciLogo } from './components/KibritciLogo';

// Type definitions
import { 
  Personel, AylikYoklamaMap, SatinAlmaTalebi, Irsaliye, Fatura, 
  KasaHareketi, AracBakim, Demisbas, KampOdasi, KampKaydi, KampYerleske, KampKat,
  HazirTutanak, CariKart, StokKart, EpostaGonderim, SahaFaaliyeti as SahaFaaliyetiType,
  OperatorFaaliyet, TaseronKesintiRaporu, TaseronEnerjiKaydi, TaseronYemekKaydi, MaaşOdeme, PersonelIslemGecmisi, CariKartIslem, StokKartIslem,
  EvrakBaglantiGrubu, OnayliAnalizRaporu, ProgramliFaaliyet, KiralikKamyonPuantajKaydi
} from './types/erp';

// Initial Mock Data
import { 
  INITIAL_PERSONEL, INITIAL_YOKLAMA, INITIAL_CARI, INITIAL_STOK, 
  INITIAL_SATIN_ALMA, INITIAL_IRSALIYE, INITIAL_FATURA, INITIAL_KASA, 
  INITIAL_ARAC, 
  INITIAL_SAHA, INITIAL_TUTANAK, INITIAL_EPOSTA,
  INITIAL_OPERATOR_FAALIYET, INITIAL_TASERON_KESINTI, INITIAL_TASERON_ENERJI, INITIAL_TASERON_YEMEK, INITIAL_MAAS_ODEME,
  INITIAL_PERSONEL_ISLEM, INITIAL_CARI_ISLEM, INITIAL_STOK_ISLEM
} from './data/mockData';

// Cloud Connection Modules
import {
  auth,
  db,
  seedCollectionIfEmpty,
  seedYoklamaIfEmpty,
  saveYoklamaDocument,
  parseYoklamaSnapshotData,
  syncArrayToFirestore,
  saveDocument,
  removeDocument,
  fetchCollection,
  ensureFirestoreAuth,
} from './lib/firebase';
import { withTaseronPersonelGorev } from './lib/taseronUtils';
import {
  isPlaceholderPersonelName,
  personelNameKey,
} from './lib/guvenlikHelpers';
import { loadKampStateSnapshot, ensureYapıFromOdalari } from './lib/kampYapisi';
import {
  evictActiveKampResidentsForPersonel,
  isPersonelAktifDurum,
  reactivateEvictedKampStays,
  detectMassKampEvictionDate,
} from './lib/kampPlacementUtils';
import { probeGeminiApi } from './lib/apiClient';
import {
  hasSubstantialYoklamaData,
  isProductionLive,
  initialSeedAllowed,
  markProductionLive,
} from './lib/productionDataGuard';
import {
  normalizeYetki,
  isSoforYetki,
  getRoleHomeTab,
  isMobileRole,
  isStandaloneMobileRole,
  isTabRestrictedForUser,
  sanitizeKisitliSayfalar,
  guessRoleFromEmail,
  canAccessUyelikAdminPanel,
  isIdariIslerRole,
  isRetiredPortalTab,
} from './lib/yetkiUtils';
import {
  dedupeKullanicilarByEmail,
  findKullaniciByEmail,
  hasDuplicateKullaniciEmails,
  parseKullanicilarSnapshot,
  repairKullaniciDocIdsIfNeeded,
  saveKullanici,
} from './lib/kullaniciUtils';
import {
  applyCariDedupPlan,
  applyCariDedupPlansInMemory,
  planCariKartDedup,
} from './lib/cariKartDedupUtils';
import {
  excludeYolHarcamaFromKasaLedger,
  yolHarcamaIdFromKasaDocId,
} from './lib/yolHarcamaUtils';
import { collection, onSnapshot, doc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { syncAuthClaimsFromServer } from './lib/authClaimsClient';
import { assertErpWriteAuth, formatFirestoreWriteError } from './lib/authWriteGuard';
import {
  countYoklamaFilledDays,
  resolveYoklamaSnapshotMap,
} from './lib/yoklamaGuard';
import { todayDateKey } from './lib/dateKeyUtils';
import {
  enqueueSahaFaaliyetSave,
  fetchSahaFaaliyetById,
  removeSahaFaaliyetSafe,
  type SahaFaaliyetSaveSource,
} from './lib/sahaFaaliyetPersistence';
import { fetchYoklamaMapPreferFast, scheduleYoklamaMonthShardSync } from './lib/yoklamaPersistence';
import { LoginScreen } from './components/LoginScreen';
const YetkiVermeScreen = lazy(() => import('./components/YetkiVermeScreen').then(m => ({ default: m.YetkiVermeScreen })));
const OperatorScreen = lazy(() => import('./components/OperatorScreen').then(m => ({ default: m.OperatorScreen })));
const PublicGirisKayitScreen = lazy(() => import('./components/PublicGirisKayitScreen').then(m => ({ default: m.PublicGirisKayitScreen })));
const PublicSatinAlmaShareScreen = lazy(() => import('./components/PublicSatinAlmaShareScreen').then(m => ({ default: m.PublicSatinAlmaShareScreen })));
const PublicKasaRaporShareScreen = lazy(() => import('./components/PublicKasaRaporShareScreen').then(m => ({ default: m.PublicKasaRaporShareScreen })));
import { fetchSatinAlmaPublicShare } from './lib/satinAlmaPublicShare';
import { fetchKasaRaporPublicShare } from './lib/kasaRaporPublicShare';
import { installReportEmailGlobalBridge } from './lib/reportEmail';
import { CANONICAL_ANA_FIRMA_ADI, isKibritciCompany, normalizeTurkishName } from './lib/yoklamaUtils';
import { findPersonelMatches, pickBestPersonelMatch } from './lib/personelMatchUtils';
import { suppressPersonelTcsFromDeleted } from './lib/personelSeedSuppress';
import { isActivePortalDurum } from './lib/roleClaims';
import {
  buildSaIrsaliyeFormPrefill,
  type SaIrsaliyeFormPrefill,
} from './lib/evrakDonusum';

/** Lazy ekran paketi indirilirken içerik alanında gösterilen kısa yükleme animasyonu */
const ScreenLoader: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-slate-500 select-none">
    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
    <p className="text-[10px] font-bold tracking-widest uppercase">Ekran yükleniyor...</p>
  </div>
);

installReportEmailGlobalBridge();

const LOGIN_NOTICE_KEY = 'kibritci_login_notice';
const ERP_DATA_SAFE_NOTICE =
  'Kayıtlarınız silinmedi. Bu oturum veritabanını okuyamadı. Şantiye e-posta ve şifresiyle tekrar giriş yapın; personel, yoklama ve geçmiş işlemler yerinde duruyor.';

function hasPublicShareQuery(): boolean {
  try {
    const s = new URLSearchParams(window.location.search);
    return s.has('view_giris') || s.has('view_po') || s.has('view_kasa_rapor');
  } catch {
    return false;
  }
}

function App() {
  const SECONDARY_ADMIN_EMAIL = 'mudur@gmail.com';
  const LAST_TAB_STORAGE_KEY = 'kibritci_last_tab_v1';
  const readLastTab = (): string => {
    try {
      const removedTabs = new Set(['evrak_baglama', 'yz_karsilastir']);
      const normalize = (tab: string) =>
        removedTabs.has(tab) || isRetiredPortalTab(tab) ? 'ana_sayfa' : tab;
      const direct = localStorage.getItem(LAST_TAB_STORAGE_KEY);
      if (direct) return normalize(direct);
      const rawSession = localStorage.getItem('kibritci_portal_session');
      if (!rawSession) return 'ana_sayfa';
      const parsed = JSON.parse(rawSession) as { lastTab?: string };
      const last = parsed.lastTab || 'ana_sayfa';
      return normalize(last);
    } catch {
      return 'ana_sayfa';
    }
  };
  const persistLastTab = (tab: string) => {
    try {
      localStorage.setItem(LAST_TAB_STORAGE_KEY, tab);
      const rawSession = localStorage.getItem('kibritci_portal_session');
      if (!rawSession) return;
      const parsed = JSON.parse(rawSession) as Record<string, unknown>;
      localStorage.setItem('kibritci_portal_session', JSON.stringify({ ...parsed, lastTab: tab }));
    } catch {
      /* no-op */
    }
  };
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    return readLastTab();
  });
  const [yetkiVermeUnlocked, setYetkiVermeUnlocked] = useState(false);
  const [yetkiVermePasswordInput, setYetkiVermePasswordInput] = useState('');
  const [yetkiVermePasswordError, setYetkiVermePasswordError] = useState(false);
  const [maasSubTab, setMaasSubTab] = useState<'hesapla' | 'odeme'>('hesapla');
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

  // Guard debug-probe network calls on production/https hosts.
  // Some browsers can throw security errors for http://127.0.0.1 requests from https pages,
  // which may crash the app and leave a white screen.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (isLocalHost) return;

    const originalFetch = window.fetch.bind(window);
    const debugProbePrefix = 'http://127.0.0.1:7872/ingest/';

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;

        if (url.startsWith(debugProbePrefix)) {
          return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
        }
      } catch {
        // keep normal fetch flow below
      }
      return originalFetch(input as RequestInfo | URL, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);


  useEffect(() => {
    if (currentUser) {
      setIsMobileMode(localStorage.getItem('kibritci_mobile_mode') === 'true');
      setIsMobileDirect(localStorage.getItem('kibritci_mobile_direct') === 'true');
    }
  }, [currentUser]);

  // Realtime Cloud Connection Monitor Status
  const [dbStatus, setDbStatus] = useState<'loading' | 'synced' | 'error' | 'offline'>('loading');
  const [loadingMsg, setLoadingMsg] = useState('Google Cloud Veritabanı bağlantısı kuruluyor...');
  const [startupError, setStartupError] = useState<{ message: string; step: string; technical?: string } | null>(null);
  const [geminiApiAlert, setGeminiApiAlert] = useState<string | null>(null);
  const [authWriteWarning, setAuthWriteWarning] = useState<string | null>(null);
  const [claimsTick, setClaimsTick] = useState(0);
  const [dashboardDataReady, setDashboardDataReady] = useState(false);

  // Global State Engine
  
  // --- Toast Override (FIRESTORE_TIMEOUT ham metin göstermesin) ---
  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message) => {
      const raw = String(message ?? '');
      const friendly =
        /FIRESTORE_TIMEOUT/i.test(raw)
          ? 'Bağlantı zaman aşımı. Yoklama büyük belge olduğu için PC’de yavaş gelebilir — «Sunucudan Yenile» ile tekrar deneyin veya sayfayı yenileyin (önbellekten açılabilir).'
          : raw;
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: friendly } }));
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [yoklamalar, setYoklamalar] = useState<AylikYoklamaMap>({});
  const yoklamaPersonCount = Object.keys(yoklamalar || {}).length;
  const [payrollPeriod, setPayrollPeriod] = useState<{ month: number; year: number }>({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [satinAlmaTalepleri, setSatinAlmaTalepleri] = useState<SatinAlmaTalebi[]>([]);
  const [irsaliyeler, setIrsaliyeler] = useState<Irsaliye[]>([]);
  const [irsaliyeSaPrefill, setIrsaliyeSaPrefill] = useState<SaIrsaliyeFormPrefill | null>(null);
  const [faturalar, setFaturalar] = useState<Fatura[]>([]);
  const [evrakBaglantiGruplari, setEvrakBaglantiGruplari] = useState<EvrakBaglantiGrubu[]>([]);
  const [onayliAnalizRaporlari, setOnayliAnalizRaporlari] = useState<OnayliAnalizRaporu[]>([]);
  const [kasaHareketleri, setKasaHareketleri] = useState<KasaHareketi[]>([]);
  
  const [araclar, setAraclar] = useState<AracBakim[]>([]);
  const [demirbaslar, setDemirbaslar] = useState<Demisbas[]>([]);
  const [kiralikKamyonPuantaj, setKiralikKamyonPuantaj] = useState<KiralikKamyonPuantajKaydi[]>([]);
  const [kampOdalari, setKampOdalari] = useState<KampOdasi[]>([]);
  const [kampKayitlari, setKampKayitlari] = useState<KampKaydi[]>([]);
  const [kampYerleskeleri, setKampYerleskeleri] = useState<KampYerleske[]>([]);
  const [kampKatlari, setKampKatlari] = useState<KampKat[]>([]);
  const [sahaFaaliyetleri, setSahaFaaliyetleri] = useState<SahaFaaliyetiType[]>([]);
  const [programliFaaliyetler, setProgramliFaaliyetler] = useState<ProgramliFaaliyet[]>([]);
  const [hazirTutanaklar, setHazirTutanaklar] = useState<HazirTutanak[]>([]);
  
  const [cariKartlar, setCariKartlar] = useState<CariKart[]>([]);
  const [stokKartlar, setStokKartlar] = useState<StokKart[]>([]);
  const [epostaGonderimleri, setEpostaGonderimleri] = useState<EpostaGonderim[]>([]);

  // Realtime user accounts & vehicle logs
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [aracKmLoglari, setAracKmLoglari] = useState<any[]>([]);

  // Eski "mobil istatistik" oturumu: yönetici/Formen için tam ERP sekmelerini geri aç
  // NOT: kullanicilar declare edildikten sonra — aksi halde TDZ ("Cannot access before initialization")
  useEffect(() => {
    if (!currentUser || !isMobileMode || isMobileDirect) return;
    const matched = findKullaniciByEmail(kullanicilar, currentUser?.email);
    const yetki = normalizeYetki(matched?.yetki);
    const email = currentUser?.email?.toLowerCase() || '';
    const yonetici =
      yetki === 'YÖNETİCİ' ||
      yetki === 'KURUCU' ||
      yetki === 'PROJE_MÜDÜRÜ' ||
      email === 'sametatak9@gmail.com' ||
      email === SECONDARY_ADMIN_EMAIL ||
      email === 'santiye@kibritci.com';
    if (!(yonetici || isIdariIslerRole(yetki) || yetki === 'FORMEN')) return;
    setIsMobileDirect(true);
    localStorage.setItem('kibritci_mobile_direct', 'true');
  }, [currentUser, isMobileMode, isMobileDirect, kullanicilar]);

  // Operator & Heavy Equipment Activity Logs
  const [operatorFaaliyetleri, setOperatorFaaliyetleri] = useState<OperatorFaaliyet[]>([]);
  const [taseronKesintiRaporlari, setTaseronKesintiRaporlari] = useState<TaseronKesintiRaporu[]>([]);
  const [taseronEnerjiKayitlari, setTaseronEnerjiKayitlari] = useState<TaseronEnerjiKaydi[]>([]);
  const [taseronYemekKayitlari, setTaseronYemekKayitlari] = useState<TaseronYemekKaydi[]>([]);

  // Salary Payment Records
  const [maasOdemeleri, setMaasOdemeleri] = useState<MaaşOdeme[]>([]);

  // Personnel / Cari / Stock History Logs
  const [personelIslemGecmisi, setPersonelIslemGecmisi] = useState<PersonelIslemGecmisi[]>([]);
  const [cariIslemGecmisi, setCariIslemGecmisi] = useState<CariKartIslem[]>([]);
  const [stokIslemGecmisi, setStokIslemGecmisi] = useState<StokKartIslem[]>([]);

  // Public Personnel Boarding Document Viewer (WhatsApp link handler)
  const [publicViewGiris, setPublicViewGiris] = useState<any>(null);
  const [publicViewPo, setPublicViewPo] = useState<any>(null);
  const [publicViewKasaRapor, setPublicViewKasaRapor] = useState<any>(null);
  const [publicLoading, setPublicLoading] = useState<boolean>(false);
  const [publicSiparisOpen, setPublicSiparisOpen] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('siparis');
    } catch {
      return false;
    }
  });

  // Error reporting state
  const [errorReport, setErrorReport] = useState<{ message: string; techDetails: string; contextInfo?: string } | null>(null);
  const [errorUserNote, setErrorUserNote] = useState('');
  const [sendingError, setSendingError] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const roleHomeRoutedRef = useRef(false);
  const claimsSyncedRef = useRef(false);
  const bootstrapDoneRef = useRef(false);
  const idariPersonelSeedRef = useRef(false);
  const kuterPersonelSeedRef = useRef(false);
  const kuterCariSeedRef = useRef(false);
  const deltaKapiPersonelSeedRef = useRef(false);
  const deltaKapiCariSeedRef = useRef(false);
  const yeditepePersonelSeedRef = useRef(false);
  const yeditepeCariSeedRef = useRef(false);
  const yurtPersonelSeedRef = useRef(false);
  const yurtCariSeedRef = useRef(false);
  const cariDedupRanRef = useRef(false);
  const kampRepairInFlightRef = useRef(false);
  const yoklamaJsonSeenRef = useRef<string | null>(null);
  const yoklamaSyncPendingRef = useRef<{
    prev: AylikYoklamaMap;
    next: AylikYoklamaMap;
  } | null>(null);
  const personelAutoCreateBlocklistRef = useRef(new Set<string>());
  const personelDeletedIdBlocklistRef = useRef(new Set<string>());
  const kampKayitlariRef = useRef(kampKayitlari);
  const kampOdalariRef = useRef(kampOdalari);
  const kampAutoRestoreTriedRef = useRef(false);
  kampKayitlariRef.current = kampKayitlari;
  kampOdalariRef.current = kampOdalari;
  const persistenceFailureRef = useRef<(collection: string, message: string) => void>((c, m) => {
    console.error(`[persist:${c}]`, m);
  });
  const mainScrollRef = useRef<HTMLElement | null>(null);

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
    const viewPoToken = urlParams.get('view_po');
    const viewKasaRaporToken = urlParams.get('view_kasa_rapor');
    if (viewGirisId) {
      setPublicLoading(true);
      void (async () => {
        await ensureFirestoreAuth({ allowAnonymous: true });
        try {
          const snap = await getDoc(doc(db, 'personelGirisTalepleri', viewGirisId));
          if (snap.exists()) {
            setPublicViewGiris({ id: snap.id, ...snap.data() });
          } else {
            setPublicViewGiris({
              id: viewGirisId,
              _notFound: true,
              ad: '',
              soyad: '',
              gorev: '',
            });
          }
        } catch (err) {
          console.error(err);
        } finally {
          setPublicLoading(false);
        }
      })();
    } else if (viewKasaRaporToken) {
      setPublicLoading(true);
      void (async () => {
        try {
          const share = await fetchKasaRaporPublicShare(viewKasaRaporToken);
          if (share) {
            setPublicViewKasaRapor(share);
          } else {
            setPublicViewKasaRapor({ id: viewKasaRaporToken, _notFound: true });
          }
        } catch (err) {
          console.error(err);
          setPublicViewKasaRapor({ id: viewKasaRaporToken, _notFound: true });
        } finally {
          setPublicLoading(false);
        }
      })();
    } else if (viewPoToken) {
      setPublicLoading(true);
      void (async () => {
        try {
          const share = await fetchSatinAlmaPublicShare(viewPoToken);
          if (share) {
            setPublicViewPo(share);
          } else {
            setPublicViewPo({ id: viewPoToken, _notFound: true });
          }
        } catch (err) {
          console.error(err);
          setPublicViewPo({ id: viewPoToken, _notFound: true });
        } finally {
          setPublicLoading(false);
        }
      })();
    }
  }, []);

  // Monitor Authentication State Changes
  useEffect(() => {
    let authRestoreTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const savedSession = localStorage.getItem('kibritci_portal_session');
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession) as {
            email?: string;
            uid?: string;
            isMock?: boolean;
          };
          const isMockSession = parsed.isMock === true;

          // E-posta oturumu: Firebase Auth geri yüklenmeden DB bootstrap başlamasın
          if (!user && !isMockSession) {
            setAuthLoading(true);
            if (!authRestoreTimer) {
              authRestoreTimer = setTimeout(() => {
                console.warn('Firebase oturum geri yüklenemedi — yeniden giriş gerekli');
                localStorage.removeItem('kibritci_portal_session');
                setCurrentUser(null);
                setAuthLoading(false);
              }, 8000);
            }
            return;
          }

          if (authRestoreTimer) {
            clearTimeout(authRestoreTimer);
            authRestoreTimer = null;
          }

          setCurrentUser({
            ...(user || {}),
            email: parsed.email || user?.email,
            uid: user?.uid || parsed.uid || `u_${Date.now()}`,
            isMock: isMockSession,
          });
        } catch {
          setCurrentUser(user);
        }
      } else if (user?.isAnonymous && !hasPublicShareQuery()) {
        void signOut(auth).catch(() => undefined);
        setCurrentUser(null);
      } else {
        setCurrentUser(user);
      }
      setAuthLoading(false);
    });

    return () => {
      unsubscribe();
      if (authRestoreTimer) clearTimeout(authRestoreTimer);
    };
  }, []);

  // Giriş sonrası rol claim'lerini sunucudan senkronize et
  useEffect(() => {
    if (authLoading || !currentUser?.email || claimsSyncedRef.current) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.isAnonymous) return;

    claimsSyncedRef.current = true;
    void syncAuthClaimsFromServer(currentUser.email.toLowerCase())
      .then(async () => {
        try {
          await auth.currentUser?.getIdToken(true);
        } catch {
          /* ignore */
        }
        setClaimsTick((t) => t + 1);
      })
      .catch((err) => {
        console.warn('Claim senkronizasyonu atlandı:', err);
        claimsSyncedRef.current = false;
        setClaimsTick((t) => t + 1);
      });
  }, [authLoading, currentUser?.email, currentUser?.uid]);

  // ERP yazma oturumu uyarısı (anonim / durum claim)
  useEffect(() => {
    if (authLoading || !currentUser) {
      setAuthWriteWarning(null);
      return;
    }
    let cancelled = false;
    void assertErpWriteAuth().then((msg) => {
      if (!cancelled) setAuthWriteWarning(msg);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser?.uid, currentUser?.email, claimsTick]);

  // Son görülme tarihini güncelle (Her 5 dakikada bir en fazla)
  useEffect(() => {
    if (!currentUser || kullanicilar.length === 0) return;

    const updateLastSeen = () => {
      const userEmailNorm = currentUser.email?.trim().toLowerCase();
      const dbUser = kullanicilar.find(
        (u) => u.email?.trim().toLowerCase() === userEmailNorm || u.id === currentUser.uid
      );
      if (dbUser) {
        const now = new Date();
        const lastSeen = dbUser.sonGorulmeTarihi ? new Date(dbUser.sonGorulmeTarihi) : new Date(0);
        if (now.getTime() - lastSeen.getTime() > 5 * 60 * 1000) {
          saveKullanici({ ...dbUser, sonGorulmeTarihi: now.toISOString() }).catch(console.error);
        }
      }
    };

    // Run once on tab change or mount
    updateLastSeen();

    // Check periodically every 1 minute
    const interval = setInterval(updateLastSeen, 60 * 1000);
    return () => clearInterval(interval);
  }, [currentUser?.uid, currentUser?.email, kullanicilar.length, activeTab]);

  // 1. Core Synchronization Sync Loader
  useEffect(() => {
    if (authLoading || !currentUser || bootstrapDoneRef.current) return;
    if (hasPublicShareQuery() || isPublicSiparisRoute()) return;

    const releaseBlockedSession = async () => {
      try {
        sessionStorage.setItem(LOGIN_NOTICE_KEY, ERP_DATA_SAFE_NOTICE);
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem('kibritci_portal_session');
      } catch {
        /* ignore */
      }
      try {
        await signOut(auth);
      } catch {
        /* ignore */
      }
      setCurrentUser(null);
      setStartupError(null);
      setDbStatus('loading');
    };

    async function setupCloudDatabase(attempt = 1) {
      try {
        setDbStatus('loading');
        setStartupError(null);
        setLoadingMsg('Güvenli veritabanı oturumu kontrol ediliyor...');

        const authed = await ensureFirestoreAuth();
        if (!authed) {
          await releaseBlockedSession();
          return;
        }

        // Oturum hazır → UI hemen açılsın; aynı sorgular arka planda sürer
        setLoadingMsg('Veriler arka planda yükleniyor...');
        setDbStatus('synced');
        bootstrapDoneRef.current = true;

        const allowDemoSeed = initialSeedAllowed();

        // Canlı üretimde veriler aşağıdaki onSnapshot dinleyicilerinden gelir.
        // Aynı koleksiyonları burada da seed/fetch ederek iki kez okumak açılışı
        // ciddi biçimde yavaşlatıyordu. Sadece canlı dinleyicisi olmayan küçük
        // yardımcı koleksiyonları arka planda yükle.
        if (!allowDemoSeed) {
          const loadAuxiliaryCollections = () => {
            void Promise.allSettled([
              fetchCollection<Demisbas>('demirbaslar').then(setDemirbaslar),
              fetchCollection<EpostaGonderim>('epostaGonderimleri').then(setEpostaGonderimleri),
              fetchCollection<PersonelIslemGecmisi>('personelIslemGecmisi').then(setPersonelIslemGecmisi),
              fetchCollection<CariKartIslem>('cariIslemGecmisi').then(setCariIslemGecmisi),
              fetchCollection<StokKartIslem>('stokIslemGecmisi').then(setStokIslemGecmisi),
            ]).then((results) => {
              results.forEach((result, index) => {
                if (result.status === 'rejected') {
                  console.warn(`Yardımcı koleksiyon ${index} arka planda yüklenemedi:`, result.reason);
                }
              });
            });

            // Demo kasa seed temizliği bir kez (her girişte yazma yükü olmasın)
            const kasaCleanKey = 'kibritci_kasa_demo_cleaned_v1';
            try {
              if (typeof localStorage !== 'undefined' && !localStorage.getItem(kasaCleanKey)) {
                void Promise.allSettled(
                  INITIAL_KASA.map((seed) =>
                    removeDocument('kasaHareketleri', seed.id).catch((err) =>
                      console.warn('[kasa] demo seed silinemedi:', seed.id, err)
                    )
                  )
                ).then(() => {
                  try {
                    localStorage.setItem(kasaCleanKey, '1');
                  } catch {
                    /* ignore */
                  }
                });
              }
            } catch {
              /* ignore */
            }
          };

          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
              loadAuxiliaryCollections,
              { timeout: 2500 }
            );
          } else {
            setTimeout(loadAuxiliaryCollections, 600);
          }
          return;
        }

        const safeLoad = async <T,>(promise: Promise<T>, fallback: T, name: string): Promise<T> => {
          try {
            return await promise;
          } catch (err) {
            console.error(`Error loading ${name}:`, err);
            return fallback;
          }
        };

        const initialUsers: Kullanici[] = [
          { id: 'santiye@kibritci.com', email: 'santiye@kibritci.com', yetki: 'YÖNETİCİ', durum: 'AKTİF', kayitTarihi: '2026-06-19' }
        ];

        const initialKmLogs = [
          { id: 'log_1', tarih: '2026-06-15', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41200, aksamKm: 41350, fark: 150 },
          { id: 'log_2', tarih: '2026-06-16', plaka: '34 KBR 888', surucu: 'Ayhan Yılmaz', sabahKm: 41350, aksamKm: 41580, fark: 230 },
          { id: 'log_3', tarih: '2026-06-17', plaka: '06 KBR 101', surucu: 'Mehmet Kaplan', sabahKm: 85400, aksamKm: 85920, fark: 520 },
        ];

        const [
          rawPersonnel,
          rawAttData,
          reqData,
          waybillsData,
          invoicesData,
          baglantiData,
          analizData,
          cashLogData,
          vehicleData,
          toolData,
          roomData,
          stayLogData,
          rawReportData,
          loadedProgramliFaaliyetler,
          protocolData,
          companyData,
          stockData,
          emailLogData,
          loadedUsers,
          loadedKmLogs,
          loadedOperator,
          loadedTaseron,
          loadedTaseronEnerji,
          loadedTaseronYemek,
          loadedMaasOde,
          loadedPersIslem,
          loadedCariIslem,
          loadedStokIslem
        ] = await Promise.all([
          safeLoad(seedCollectionIfEmpty('personeller', allowDemoSeed ? INITIAL_PERSONEL : []), [], 'personeller'),
          safeLoad(seedYoklamaIfEmpty(allowDemoSeed ? INITIAL_YOKLAMA : {}), {}, 'yoklamalar'),
          safeLoad(seedCollectionIfEmpty('satinAlmaTalepleri', INITIAL_SATIN_ALMA), [], 'satinAlmaTalepleri'),
          safeLoad(seedCollectionIfEmpty('irsaliyeler', INITIAL_IRSALIYE), [], 'irsaliyeler'),
          safeLoad(seedCollectionIfEmpty('faturalar', INITIAL_FATURA), [], 'faturalar'),
          safeLoad(seedCollectionIfEmpty('evrakBaglantiGruplari', []), [], 'evrakBaglantiGruplari'),
          safeLoad(seedCollectionIfEmpty('onayliAnalizRaporlari', []), [], 'onayliAnalizRaporlari'),
          safeLoad(seedCollectionIfEmpty('kasaHareketleri', allowDemoSeed ? INITIAL_KASA : []), [], 'kasaHareketleri'),
          safeLoad(seedCollectionIfEmpty('araclar', INITIAL_ARAC), [], 'araclar'),
          safeLoad(seedCollectionIfEmpty('demirbaslar', []), [], 'demirbaslar'),
          safeLoad((async () => { await seedCollectionIfEmpty('kampOdalari', []); return await fetchCollection<KampOdasi>('kampOdalari'); })(), [], 'kampOdalari'),
          safeLoad(seedCollectionIfEmpty('kampKayitlari', []), [], 'kampKayitlari'),
          safeLoad(seedCollectionIfEmpty('sahaFaaliyetleri', []), [], 'sahaFaaliyetleri'),
          safeLoad(seedCollectionIfEmpty('programliFaaliyetler', []), [], 'programliFaaliyetler'),
          safeLoad(seedCollectionIfEmpty('hazirTutanaklar', INITIAL_TUTANAK), [], 'hazirTutanaklar'),
          safeLoad(seedCollectionIfEmpty('cariKartlar', INITIAL_CARI), [], 'cariKartlar'),
          safeLoad(seedCollectionIfEmpty('stokKartlar', INITIAL_STOK), [], 'stokKartlar'),
          safeLoad(seedCollectionIfEmpty('epostaGonderimleri', INITIAL_EPOSTA), [], 'epostaGonderimleri'),
          safeLoad(seedCollectionIfEmpty('kullanicilar', initialUsers), [], 'kullanicilar'),
          safeLoad(seedCollectionIfEmpty('aracKmLoglari', initialKmLogs), [], 'aracKmLoglari'),
          safeLoad(seedCollectionIfEmpty('operatorFaaliyetleri', INITIAL_OPERATOR_FAALIYET), [], 'operatorFaaliyetleri'),
          safeLoad(seedCollectionIfEmpty('taseronKesintiRaporlari', INITIAL_TASERON_KESINTI), [], 'taseronKesintiRaporlari'),
          safeLoad(seedCollectionIfEmpty('taseronEnerjiKayitlari', INITIAL_TASERON_ENERJI), [], 'taseronEnerjiKayitlari'),
          safeLoad(seedCollectionIfEmpty('taseronYemekKayitlari', INITIAL_TASERON_YEMEK), [], 'taseronYemekKayitlari'),
          safeLoad(seedCollectionIfEmpty('maasOdemeleri', INITIAL_MAAS_ODEME), [], 'maasOdemeleri'),
          safeLoad(seedCollectionIfEmpty('personelIslemGecmisi', INITIAL_PERSONEL_ISLEM), [], 'personelIslemGecmisi'),
          safeLoad(seedCollectionIfEmpty('cariIslemGecmisi', INITIAL_CARI_ISLEM), [], 'cariIslemGecmisi'),
          safeLoad(seedCollectionIfEmpty('stokIslemGecmisi', INITIAL_STOK_ISLEM), [], 'stokIslemGecmisi')
        ]);

        let personnelData = rawPersonnel;
        let attData = rawAttData;
        const personnelIdsBefore = new Set(personnelData.map(p => p.id));

        if (hasSubstantialYoklamaData(attData)) {
          markProductionLive();
        }

        const { bootstrapLegacyYoklama, markLegacyYoklamaBootstrapped, mayis2026NeedsBootstrap } = await import('./lib/legacyYoklamaBootstrap');
        const legacyMerge = bootstrapLegacyYoklama(personnelData, attData);
        if (legacyMerge) {
          personnelData = legacyMerge.personeller;
          attData = legacyMerge.yoklamalar;
          console.log(`Legacy yoklama bellekte birleştirildi: ${legacyMerge.importedDays} gün`);
          const mergedPersonel = personnelData;
          const mergedYoklama = attData;
          const idsBefore = personnelIdsBefore;
          void (async () => {
            try {
              const legacyResult = await saveYoklamaDocument(mergedYoklama, 'legacy_bootstrap');
              if (!legacyResult.ok) {
                console.warn('Legacy yoklama arka plan kaydı engellendi:', legacyResult.error);
                return;
              }
              for (const p of mergedPersonel) {
                if (!idsBefore.has(p.id)) {
                  await saveDocument('personeller', p);
                }
              }
              if (!mayis2026NeedsBootstrap(mergedYoklama)) {
                markLegacyYoklamaBootstrapped();
              }
              if (hasSubstantialYoklamaData(mergedYoklama)) {
                markProductionLive();
              }
              console.log('Legacy yoklama Firestore arka plan kaydı tamamlandı');
            } catch (bgErr) {
              console.error('Legacy yoklama arka plan kaydı başarısız (uygulama yine de açık):', bgErr);
            }
          })();
        }

        // İdari kadro: yoklamaya girmez; izin/tutanak/araç tahsis vb. için DB'ye yüklenir
        const { mergeIdariIntoPersonelList } = await import('./data/idariPersonelSeed');
        const idariMerged = mergeIdariIntoPersonelList(personnelData);
        // Kuter taşeron personeli: TC ile mükerrersiz seed
        const { mergeKuterIntoPersonelList, ensureKuterCari } = await import('./data/kuterPersonelSeed');
        const kuterMerged = mergeKuterIntoPersonelList(idariMerged.list);
        // DELTA KAPI taşeron personeli: TC ile mükerrersiz seed
        const { mergeDeltaKapiIntoPersonelList, ensureDeltaKapiCari } = await import('./data/deltaKapiPersonelSeed');
        const deltaMerged = mergeDeltaKapiIntoPersonelList(kuterMerged.list);
        // YEDİTEPE taşeron personeli: TC ile mükerrersiz seed
        const { mergeYeditepeIntoPersonelList, ensureYeditepeCari } = await import('./data/yeditepePersonelSeed');
        const yeditepeMerged = mergeYeditepeIntoPersonelList(deltaMerged.list);
        const { restoreUgurDurukhan } = await import('./data/ugurDurukhanRestore');
        const ugurRestored = restoreUgurDurukhan(yeditepeMerged.list);
        const { mergeYurtIntoPersonelList, ensureYurtCari } = await import('./data/yurtPersonelSeed');
        const yurtMerged = mergeYurtIntoPersonelList(ugurRestored.list);
        setPersoneller(yurtMerged.list);
        if (
          idariMerged.toSave.length > 0 ||
          kuterMerged.toSave.length > 0 ||
          deltaMerged.toSave.length > 0 ||
          yeditepeMerged.toSave.length > 0 ||
          ugurRestored.toSave.length > 0 ||
          yurtMerged.toSave.length > 0
        ) {
          void (async () => {
            for (const p of idariMerged.toSave) {
              try {
                await saveDocument('personeller', p);
              } catch (e) {
                console.warn('İdari personel kaydı atlandı:', p.tcNo, e);
              }
            }
            if (idariMerged.toSave.length > 0) {
              console.log(`İdari personel senkronu: ${idariMerged.toSave.length} kayıt`);
            }
            for (const p of kuterMerged.toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('Kuter personel kaydı atlandı:', p.tcNo, e);
              }
            }
            if (kuterMerged.toSave.length > 0) {
              console.log(`Kuter personel senkronu: ${kuterMerged.toSave.length} kayıt`);
            }
            for (const p of deltaMerged.toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('DELTA KAPI personel kaydı atlandı:', p.tcNo, e);
              }
            }
            if (deltaMerged.toSave.length > 0) {
              console.log(`DELTA KAPI personel senkronu: ${deltaMerged.toSave.length} kayıt`);
            }
            for (const p of yeditepeMerged.toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('YEDİTEPE personel kaydı atlandı:', p.tcNo, e);
              }
            }
            if (yeditepeMerged.toSave.length > 0) {
              console.log(`YEDİTEPE personel senkronu: ${yeditepeMerged.toSave.length} kayıt`);
            }
            for (const p of ugurRestored.toSave) {
              try {
                await saveDocument('personeller', p);
              } catch (e) {
                console.warn('Uğur Durukhan geri yükleme atlandı:', e);
              }
            }
            if (ugurRestored.toSave.length > 0) {
              console.log(`Uğur Durukhan geri yükleme: ${ugurRestored.toSave.length} kayıt`);
            }
            for (const p of yurtMerged.toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('YURT MEKANİK personel kaydı atlandı:', p.tcNo, e);
              }
            }
            if (yurtMerged.toSave.length > 0) {
              console.log(`YURT MEKANİK personel senkronu: ${yurtMerged.toSave.length} kayıt`);
            }
          })();
        }
        const kuterCari = ensureKuterCari(companyData as CariKart[]);
        const companyDataWithKuter = kuterCari
          ? [...(companyData as CariKart[]), kuterCari]
          : (companyData as CariKart[]);
        if (kuterCari) {
          void saveDocument('cariKartlar', kuterCari).catch((e) =>
            console.warn('Kuter cari kaydı atlandı:', e)
          );
        }
        const deltaCari = ensureDeltaKapiCari(companyDataWithKuter);
        const companyDataWithDelta = deltaCari
          ? [...companyDataWithKuter, deltaCari]
          : companyDataWithKuter;
        if (deltaCari) {
          void saveDocument('cariKartlar', deltaCari).catch((e) =>
            console.warn('DELTA KAPI cari kaydı atlandı:', e)
          );
        }
        const yeditepeCari = ensureYeditepeCari(companyDataWithDelta);
        const companyDataWithYeditepe = yeditepeCari
          ? [...companyDataWithDelta, yeditepeCari]
          : companyDataWithDelta;
        if (yeditepeCari) {
          void saveDocument('cariKartlar', yeditepeCari).catch((e) =>
            console.warn('YEDİTEPE cari kaydı atlandı:', e)
          );
        }
        const yurtCari = ensureYurtCari(companyDataWithYeditepe);
        const companyDataWithYurt = yurtCari
          ? [...companyDataWithYeditepe, yurtCari]
          : companyDataWithYeditepe;
        if (yurtCari) {
          void saveDocument('cariKartlar', yurtCari).catch((e) =>
            console.warn('YURT MEKANİK cari kaydı atlandı:', e)
          );
        }
        const cariDedupPlans = planCariKartDedup(companyDataWithYurt, yurtMerged.list);
        const companyDataDeduped = applyCariDedupPlansInMemory(companyDataWithYurt, cariDedupPlans);
        if (cariDedupPlans.length > 0) {
          cariDedupRanRef.current = true;
          void (async () => {
            for (const plan of cariDedupPlans) {
              try {
                await applyCariDedupPlan(plan);
              } catch (e) {
                console.warn('Cari mükerrer birleştirme atlandı:', plan.key, e);
              }
            }
            console.log(`Cari mükerrer birleştirme: ${cariDedupPlans.length} grup`);
          })();
        }
        setYoklamalar(attData);
        if (hasSubstantialYoklamaData(attData) || kuterMerged.list.length >= 20) {
          markProductionLive();
        }

        setSatinAlmaTalepleri(reqData);
        setIrsaliyeler(waybillsData);
        setFaturalar(invoicesData);
        setEvrakBaglantiGruplari(baglantiData);
        setOnayliAnalizRaporlari(analizData);
        setKasaHareketleri(cashLogData);
        setAraclar(vehicleData);
        setDemirbaslar(toolData);
        setKampOdalari(roomData);
        setKampKayitlari(stayLogData);

        let reportData = rawReportData;
        const { bootstrapLegacySahaFaaliyet, markLegacySahaFaaliyetBootstrapped, haziran2026SahaNeedsBootstrap } = await import('./lib/legacySahaFaaliyetBootstrap');
        const sahaMerge = bootstrapLegacySahaFaaliyet(reportData);
        if (sahaMerge) {
          reportData = sahaMerge;
          console.log(`Legacy saha faaliyet bellekte birleştirildi: ${reportData.length} kayıt`);
          if (!isProductionLive() && reportData.length < 50) {
            const mergedSaha = reportData;
            void (async () => {
              try {
                for (const sf of mergedSaha) {
                  if (sf.id?.startsWith('SF-MAY26-') || sf.id?.startsWith('SF-HAZ26-')) {
                    await enqueueSahaFaaliyetSave(sf, 'legacy_bootstrap');
                  }
                }
                if (!haziran2026SahaNeedsBootstrap(mergedSaha)) {
                  markLegacySahaFaaliyetBootstrapped();
                }
                console.log('Legacy saha faaliyet Firestore kaydı tamamlandı');
              } catch (bgErr) {
                console.error('Legacy saha faaliyet arka plan kaydı başarısız:', bgErr);
              }
            })();
          } else {
            markLegacySahaFaaliyetBootstrapped();
            markProductionLive();
          }
        }
        setSahaFaaliyetleri(reportData);
        setProgramliFaaliyetler(loadedProgramliFaaliyetler);
        setHazirTutanaklar(protocolData);
        setCariKartlar(companyDataDeduped);
        setStokKartlar(stockData);
        setEpostaGonderimleri(emailLogData);
        setKullanicilar(loadedUsers);
        setAracKmLoglari(loadedKmLogs);
        setOperatorFaaliyetleri(loadedOperator);
        setTaseronKesintiRaporlari(loadedTaseron.map((r) => ({ ...r, kesintiTipi: r.kesintiTipi || 'IS_MAKINESI' })));
        setTaseronEnerjiKayitlari(loadedTaseronEnerji);
        setTaseronYemekKayitlari(loadedTaseronYemek);
        setMaasOdemeleri(loadedMaasOde);
        setPersonelIslemGecmisi(loadedPersIslem);
        setCariIslemGecmisi(loadedCariIslem);
        setStokIslemGecmisi(loadedStokIslem);
      } catch (err) {
        console.error('Firebase synchronisation error: ', err);
        const errText =
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : typeof err === 'string'
              ? err
              : 'Bilinmeyen bağlantı hatası';

        // UI zaten açıksa arka plan hatası ekranı kilitlemesin
        if (bootstrapDoneRef.current) {
          console.warn('Arka plan veri yüklemesi kısmi başarısız (uygulama açık kalır):', errText);
          return;
        }

        if (attempt < 2 && /FIRESTORE_TIMEOUT|network|offline|unavailable/i.test(errText)) {
          console.warn(`Başlangıç yeniden deneniyor (${attempt + 1}/2)...`);
          setLoadingMsg('Bağlantı yavaş — yeniden deneniyor...');
          await new Promise((r) => setTimeout(r, 2000));
          return setupCloudDatabase(attempt + 1);
        }

        if (/insufficient permissions|permission-denied/i.test(errText)) {
          console.warn('Firestore izin hatası — kayıtlar silinmedi, oturum sıfırlanıyor');
          await releaseBlockedSession();
          return;
        }

        setStartupError({
          message:
            'Kayıtlarınız silinmedi. Bağlantı kurulamadı; çıkış yapıp şantiye hesabıyla tekrar giriş yapın.',
          step: loadingMsg || 'Veritabanı senkronizasyonu',
          technical: errText,
        });
        setDbStatus('error');
      }
    }

    setupCloudDatabase();
  }, [authLoading, currentUser]);

  /** Açılış 12 sn'den uzun sürerse takılmayı önle */
  useEffect(() => {
    if (authLoading || !currentUser || dbStatus !== 'loading') return;
    const failSafe = setTimeout(() => {
      setDbStatus(prev => {
        if (prev === 'loading') {
          console.warn('Başlangıç zaman aşımı — kısmi veri ile devam ediliyor');
          return 'synced';
        }
        return prev;
      });
    }, 12000);
    return () => clearTimeout(failSafe);
  }, [authLoading, currentUser, dbStatus]);

  useEffect(() => {
    if (!currentUser) {
      setGeminiApiAlert(null);
      return;
    }
    const cacheKey = 'kibritci_gemini_health_v1';
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { ok, message, at } = JSON.parse(cached) as { ok: boolean; message: string; at: number };
        if (Date.now() - at < 30 * 60 * 1000) {
          setGeminiApiAlert(ok ? null : message);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    probeGeminiApi().then((r) => {
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ ok: r.ok, message: r.message, at: Date.now() })
        );
      } catch {
        /* ignore */
      }
      setGeminiApiAlert(r.ok ? null : r.message);
    });
  }, [currentUser]);

  const switchToOfflineMode = () => {
    if (
      !window.confirm(
        'Bağlantı beklenmeden devam edilecek. Demo verisi YÜKLENMEZ; yalnızca Firestore\'dan gelen kayıtlar görünür. Devam?'
      )
    ) {
      return;
    }
    markProductionLive();
    setDbStatus('synced');
  };

  // 1.5 Real-time Synchronization for core collections when in synced mode
  useEffect(() => {
    if (dbStatus !== 'synced' || !currentUser) return;

    const dashboardSnapshots = new Set<string>();
    const markDashboardSnapshot = (name: string) => {
      dashboardSnapshots.add(name);
      if (dashboardSnapshots.size >= 4) setDashboardDataReady(true);
    };
    const markDashboardSnapshotError = (name: string) => (error: unknown) => {
      console.warn(`${name} canlı verisi yüklenemedi:`, error);
      markDashboardSnapshot(name);
    };

    const unsubIrsaliyeler = onSnapshot(collection(db, 'irsaliyeler'), (snapshot) => {
      const list: Irsaliye[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setIrsaliyeler(list);
      markDashboardSnapshot('irsaliyeler');
    }, markDashboardSnapshotError('irsaliyeler'));

    const unsubFaturalar = onSnapshot(collection(db, 'faturalar'), (snapshot) => {
      const list: Fatura[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setFaturalar(list);
      markDashboardSnapshot('faturalar');
    }, markDashboardSnapshotError('faturalar'));

    const unsubSatinAlma = onSnapshot(collection(db, 'satinAlmaTalepleri'), (snapshot) => {
      const list: SatinAlmaTalebi[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setSatinAlmaTalepleri(list);
      markDashboardSnapshot('satinAlmaTalepleri');
    }, markDashboardSnapshotError('satinAlmaTalepleri'));

    // İkincil koleksiyonlar: ilk boyamayı hızlandırmak için kısa gecikmeyle bağlanır (salt okuma)
    const deferredUnsubs: Array<() => void> = [];
    let deferredStarted = false;
    let deferredTimer: ReturnType<typeof setTimeout> | null = null;
    let deferredIdleId: number | null = null;

    const attachDeferredListeners = () => {
      if (deferredStarted) return;
      deferredStarted = true;

      deferredUnsubs.push(
        onSnapshot(collection(db, 'evrakBaglantiGruplari'), (snapshot) => {
          const list: EvrakBaglantiGrubu[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setEvrakBaglantiGruplari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'onayliAnalizRaporlari'), (snapshot) => {
          const list: OnayliAnalizRaporu[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setOnayliAnalizRaporlari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'sahaFaaliyetleri'), (snapshot) => {
          const list: SahaFaaliyetiType[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setSahaFaaliyetleri(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'programliFaaliyetler'), (snapshot) => {
          const list: ProgramliFaaliyet[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as ProgramliFaaliyet);
          });
          setProgramliFaaliyetler(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'kasaHareketleri'), (snapshot) => {
          const list: KasaHareketi[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ ...docSnap.data(), id: docSnap.id } as KasaHareketi);
          });
          setKasaHareketleri(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'kampOdalari'), (snapshot) => {
          const list: KampOdasi[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setKampOdalari(list);
          if (list.length > 0) markProductionLive();
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'kampKayitlari'), (snapshot) => {
          const list: KampKaydi[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setKampKayitlari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'kampYerleskeleri'), (snapshot) => {
          const list: KampYerleske[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setKampYerleskeleri(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'kampKatlari'), (snapshot) => {
          const list: KampKat[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setKampKatlari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'araclar'), (snapshot) => {
          const list: AracBakim[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setAraclar(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'aracKmLoglari'), (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() });
          });
          list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
          setAracKmLoglari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'kiralikKamyonPuantaj'), (snapshot) => {
          const list: KiralikKamyonPuantajKaydi[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() } as KiralikKamyonPuantajKaydi);
          });
          list.sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
          setKiralikKamyonPuantaj(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'operatorFaaliyetleri'), (snapshot) => {
          const list: OperatorFaaliyet[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setOperatorFaaliyetleri(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'taseronKesintiRaporlari'), (snapshot) => {
          const list: TaseronKesintiRaporu[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data() as TaseronKesintiRaporu;
            list.push({ ...data, id: doc.id, kesintiTipi: data.kesintiTipi || 'IS_MAKINESI' });
          });
          setTaseronKesintiRaporlari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'taseronEnerjiKayitlari'), (snapshot) => {
          const list: TaseronEnerjiKaydi[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as TaseronEnerjiKaydi);
          });
          setTaseronEnerjiKayitlari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'taseronYemekKayitlari'), (snapshot) => {
          const list: TaseronYemekKaydi[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as TaseronYemekKaydi);
          });
          setTaseronYemekKayitlari(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'maasOdemeleri'), (snapshot) => {
          const list: MaaşOdeme[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as any);
          });
          setMaasOdemeleri(list);
        })
      );

      deferredUnsubs.push(
        onSnapshot(collection(db, 'hazirTutanaklar'), (snapshot) => {
          const list: HazirTutanak[] = [];
          snapshot.forEach((docItem) => {
            list.push({ id: docItem.id, ...docItem.data() } as any);
          });
          setHazirTutanaklar(list);
        })
      );
    };

    deferredTimer = setTimeout(attachDeferredListeners, 280);
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      deferredIdleId = (
        window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(attachDeferredListeners, { timeout: 900 });
    }

    const unsubPersonel = onSnapshot(collection(db, 'personeller'), (snapshot) => {
      const fromCache = Boolean(snapshot.metadata?.fromCache);
      const list: Personel[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        // doc.id her zaman kazanır — data içindeki bozuk/eksik id alanı mükerrer kayıt üretmesin
        list.push({ ...data, id: docSnap.id } as Personel);
      });
      // Boş IndexedDB önbelleği kadroyu 0 göstermesin; sunucu listesi gelene kadar bekle
      if (fromCache && list.length === 0) {
        return;
      }
      setPersoneller((prev) => {
        if (prev.length >= 20 && list.length < Math.max(5, Math.floor(prev.length * 0.25))) {
          console.warn('[personel] Zayıf snapshot yok sayıldı', {
            fromCache,
            prev: prev.length,
            next: list.length,
          });
          return prev;
        }
        return list;
      });
      markDashboardSnapshot('personeller');
      if (list.length < 20) return;
      markProductionLive();

      // Eksik idari kadro TC'leri bir kez tamamla (snapshot üzerine yazılmaz; sadece eksikler kaydedilir)
      if (!idariPersonelSeedRef.current) {
        idariPersonelSeedRef.current = true;
        void import('./data/idariPersonelSeed').then(({ mergeIdariIntoPersonelList }) => {
          const { toSave } = mergeIdariIntoPersonelList(list);
          if (toSave.length === 0) return;
          void (async () => {
            for (const p of toSave) {
              try {
                await saveDocument('personeller', p);
              } catch (e) {
                console.warn('İdari personel snapshot senkronu atlandı:', p.tcNo, e);
              }
            }
          })();
        });
      }

      // Kuter taşeron personeli: TC ile mükerrersiz tamamla
      if (!kuterPersonelSeedRef.current) {
        kuterPersonelSeedRef.current = true;
        void import('./data/kuterPersonelSeed').then(({ mergeKuterIntoPersonelList }) => {
          const { toSave } = mergeKuterIntoPersonelList(list);
          if (toSave.length === 0) return;
          void (async () => {
            for (const p of toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('Kuter personel snapshot senkronu atlandı:', p.tcNo, e);
              }
            }
            console.log(`Kuter personel snapshot senkronu: ${toSave.length} kayıt`);
          })();
        });
      }

      // DELTA KAPI taşeron personeli: TC ile mükerrersiz tamamla
      if (!deltaKapiPersonelSeedRef.current) {
        deltaKapiPersonelSeedRef.current = true;
        void import('./data/deltaKapiPersonelSeed').then(({ mergeDeltaKapiIntoPersonelList }) => {
          const { toSave } = mergeDeltaKapiIntoPersonelList(list);
          if (toSave.length === 0) return;
          void (async () => {
            for (const p of toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('DELTA KAPI personel snapshot senkronu atlandı:', p.tcNo, e);
              }
            }
            console.log(`DELTA KAPI personel snapshot senkronu: ${toSave.length} kayıt`);
          })();
        });
      }

      // YEDİTEPE taşeron personeli: TC ile mükerrersiz tamamla
      if (!yeditepePersonelSeedRef.current) {
        yeditepePersonelSeedRef.current = true;
        void import('./data/yeditepePersonelSeed').then(({ mergeYeditepeIntoPersonelList }) => {
          const { toSave } = mergeYeditepeIntoPersonelList(list);
          if (toSave.length === 0) return;
          void (async () => {
            for (const p of toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('YEDİTEPE personel snapshot senkronu atlandı:', p.tcNo, e);
              }
            }
            console.log(`YEDİTEPE personel snapshot senkronu: ${toSave.length} kayıt`);
          })();
        });
      }

      if (!yurtPersonelSeedRef.current) {
        yurtPersonelSeedRef.current = true;
        void import('./data/yurtPersonelSeed').then(({ mergeYurtIntoPersonelList }) => {
          const { toSave } = mergeYurtIntoPersonelList(list);
          if (toSave.length === 0) return;
          void (async () => {
            for (const p of toSave) {
              try {
                await saveDocument('personeller', withTaseronPersonelGorev(p));
              } catch (e) {
                console.warn('YURT MEKANİK personel snapshot senkronu atlandı:', p.tcNo, e);
              }
            }
            console.log(`YURT MEKANİK personel snapshot senkronu: ${toSave.length} kayıt`);
          })();
        });
      }
    }, markDashboardSnapshotError('personeller'));

    const unsubYoklamalar = onSnapshot(
      doc(db, 'yoklamalar', 'global_yoklama_map'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Record<string, unknown>;
        const rawJson = typeof raw.dataJson === 'string' ? raw.dataJson : null;
        // Aynı payload tekrar parse/render edilmesin (kasma)
        if (rawJson && rawJson === yoklamaJsonSeenRef.current) return;

        const data = parseYoklamaSnapshotData(raw) as AylikYoklamaMap;
        const fromCache = Boolean(snap.metadata?.fromCache);

        setYoklamalar((prev) => {
          const resolved = resolveYoklamaSnapshotMap(prev, data, {
            fromCache,
            todayKey: todayDateKey(),
          });
          if (resolved === prev && prev !== data) {
            console.warn('[yoklama] Zayıf/eski snapshot yok sayıldı (sabah kaydı korundu)', {
              prevFilled: countYoklamaFilledDays(prev),
              nextFilled: countYoklamaFilledDays(data),
              fromCache,
            });
          }
          return resolved;
        });
        // Ref'i yalnızca kabul edilen (veya ilk) paket için güncelle — zayıf cache ezmesin
        if (
          !(
            fromCache &&
            countYoklamaFilledDays(data) < 30 &&
            (yoklamaJsonSeenRef.current?.length || 0) > 50_000
          )
        ) {
          if (rawJson) yoklamaJsonSeenRef.current = rawJson;
        }
        if (hasSubstantialYoklamaData(data)) markProductionLive();
      },
      (err) => {
        console.warn('Yoklama canlı dinleme hatası:', err);
      }
    );

    // Açılış: PC'de getDocFromServer mega-belgeyi timeout'a düşürüyordu.
    // Cache + ay shard öncelikli; sunucu sadece zayıfsa (PreferFast içinde).
    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, 600));
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        const { map, dataJson, source } = await fetchYoklamaMapPreferFast({
          yearMonths: [prevYm, ym],
          allowServerForce: true,
        });
        const serverFilled = countYoklamaFilledDays(map);
        setYoklamalar((prevMap) => {
          const prevFilled = countYoklamaFilledDays(prevMap);
          if (serverFilled >= prevFilled || prevFilled < 30) {
            return map;
          }
          console.warn('[yoklama] Yüklenen paket zayıf, mevcut daha dolu korunuyor', {
            prevFilled,
            serverFilled,
            source,
          });
          return prevMap;
        });
        if (dataJson && (serverFilled >= 30 || !yoklamaJsonSeenRef.current)) {
          yoklamaJsonSeenRef.current = dataJson;
        }
        if (hasSubstantialYoklamaData(map)) {
          markProductionLive();
          scheduleYoklamaMonthShardSync(map);
        }
      } catch (err) {
        console.warn('Yoklama hızlı yükleme atlandı (canlı dinleyici devam eder):', err);
      }
    })();

    const unsubKullanicilar = onSnapshot(collection(db, 'kullanicilar'), (snapshot) => {
      const raw = parseKullanicilarSnapshot(snapshot.docs) as Kullanici[];
      setKullanicilar(dedupeKullanicilarByEmail(raw) as Kullanici[]);
      const needsRepair =
        hasDuplicateKullaniciEmails(raw) ||
        raw.some((u) => {
          const key = u.email?.trim().toLowerCase();
          return key && ((u as any)._docId || u.id) !== key;
        });
      if (needsRepair) {
        repairKullaniciDocIdsIfNeeded(raw).catch((err) => {
          console.warn('Kullanıcı belgeleri onarılamadı:', err);
        });
      }
    });

    const unsubStoklar = onSnapshot(collection(db, 'stokKartlar'), (snapshot) => {
      const list: StokKart[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as StokKart);
      });
      setStokKartlar(list);
    });

    const unsubCari = onSnapshot(collection(db, 'cariKartlar'), (snapshot) => {
      let list: CariKart[] = [];
      snapshot.forEach((docSnap) => {
        // data.id, Firestore yolunu ezmesin (silme hedefi yanlış id olmasın)
        list.push({ ...docSnap.data(), id: docSnap.id } as CariKart);
      });

      if (!cariDedupRanRef.current) {
        const plans = planCariKartDedup(list);
        if (plans.length > 0) {
          cariDedupRanRef.current = true;
          list = applyCariDedupPlansInMemory(list, plans);
          void (async () => {
            for (const plan of plans) {
              try {
                await applyCariDedupPlan(plan);
              } catch (e) {
                console.warn('Cari mükerrer birleştirme atlandı:', plan.key, e);
              }
            }
            console.log(`Cari mükerrer birleştirme (snapshot): ${plans.length} grup`);
          })();
        }
      }

      setCariKartlar(list);

      if (!kuterCariSeedRef.current) {
        kuterCariSeedRef.current = true;
        void import('./data/kuterPersonelSeed').then(({ ensureKuterCari }) => {
          const cari = ensureKuterCari(list);
          if (!cari) return;
          void saveDocument('cariKartlar', cari).catch((e) =>
            console.warn('Kuter cari snapshot senkronu atlandı:', e)
          );
        });
      }

      if (!deltaKapiCariSeedRef.current) {
        deltaKapiCariSeedRef.current = true;
        void import('./data/deltaKapiPersonelSeed').then(({ ensureDeltaKapiCari }) => {
          const cari = ensureDeltaKapiCari(list);
          if (!cari) return;
          void saveDocument('cariKartlar', cari).catch((e) =>
            console.warn('DELTA KAPI cari snapshot senkronu atlandı:', e)
          );
        });
      }

      if (!yeditepeCariSeedRef.current) {
        yeditepeCariSeedRef.current = true;
        void import('./data/yeditepePersonelSeed').then(({ ensureYeditepeCari }) => {
          const cari = ensureYeditepeCari(list);
          if (!cari) return;
          void saveDocument('cariKartlar', cari).catch((e) =>
            console.warn('YEDİTEPE cari snapshot senkronu atlandı:', e)
          );
        });
      }

      if (!yurtCariSeedRef.current) {
        yurtCariSeedRef.current = true;
        void import('./data/yurtPersonelSeed').then(({ ensureYurtCari }) => {
          const cari = ensureYurtCari(list);
          if (!cari) return;
          void saveDocument('cariKartlar', cari).catch((e) =>
            console.warn('YURT MEKANİK cari snapshot senkronu atlandı:', e)
          );
        });
      }
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
      if (deferredTimer) clearTimeout(deferredTimer);
      if (
        deferredIdleId != null &&
        typeof window !== 'undefined' &&
        'cancelIdleCallback' in window
      ) {
        (
          window as Window & { cancelIdleCallback: (id: number) => void }
        ).cancelIdleCallback(deferredIdleId);
      }
      deferredUnsubs.forEach((u) => u());
      unsubIrsaliyeler();
      unsubFaturalar();
      unsubSatinAlma();
      unsubPersonel();
      unsubYoklamalar();
      unsubKullanicilar();
      unsubNotif();
      unsubStoklar();
      unsubCari();
    };
  }, [dbStatus, currentUser]);

  // Auto online signup sync and administrator check
  useEffect(() => {
    if (authLoading || !currentUser || !currentUser.email) return;
    const emailLower = currentUser.email.toLowerCase();
    
    // Check if user is in DB list of accounts
    const exists = !!findKullaniciByEmail(kullanicilar, emailLower);
    if (!exists && (dbStatus === 'synced' || dbStatus === 'offline')) {
      const newKullanici: Kullanici = {
        id: emailLower,
        email: currentUser.email,
        yetki: guessRoleFromEmail(emailLower) as any,
        durum: 'AKTİF',
        kayitTarihi: new Date().toISOString().split('T')[0]
      };
      
      if (dbStatus === 'synced') {
        // CRITICAL FIX: Make sure the document doesn't actually exist in Firestore
        // before overwriting it with a MİSAFİR payload, in case `kullanicilar` array failed to load.
        getDoc(doc(db, 'kullanicilar', emailLower)).then(snap => {
          if (!snap.exists()) {
            saveKullanici(newKullanici).catch(console.error);
            setKullanicilar(prev => {
              if (prev.some(u => u.email.toLowerCase() === emailLower)) return prev;
              return dedupeKullanicilarByEmail([...prev, newKullanici]);
            });
          } else {
            // User exists in Firestore but not in local state (network issue or timeout)
            // Bring them into state safely
            setKullanicilar(prev => {
              if (prev.some(u => u.email.toLowerCase() === emailLower)) return prev;
              return dedupeKullanicilarByEmail([...prev, snap.data() as Kullanici]);
            });
          }
        }).catch(err => {
          console.warn('Otomatik kayıt kontrolü başarısız:', err);
        });
      } else {
        setKullanicilar(prev => {
          if (prev.some(u => u.email.toLowerCase() === emailLower)) return prev;
          return [...prev, newKullanici];
        });
      }
    }
  }, [currentUser, kullanicilar, authLoading, dbStatus]);

  // İlk girişte mobil saha rolünü ana paneline yönlendir (sekme değişiminde tekrar etme)
  useEffect(() => {
    if (!currentUser || !kullanicilar.length) return;
    const matched = findKullaniciByEmail(kullanicilar, currentUser?.email);
    if (!matched) return;

    if (!roleHomeRoutedRef.current) {
      const homeTab = getRoleHomeTab(matched.yetki) || 'ana_sayfa';
      let initialTab = homeTab;
      let savedTab = '';
      let isRestricted = true;
      try {
        savedTab = readLastTab() || '';
        const yetki = normalizeYetki(matched.yetki);
        isRestricted = !savedTab || isTabRestrictedForUser(savedTab, yetki, matched.kisitliSayfalar);
        if (!isRestricted) {
          initialTab = savedTab as any;
        }
      } catch {
        /* no-op */
      }
      roleHomeRoutedRef.current = true;
      setActiveTab(initialTab);
    }

    if (matched.imzaText) {
      setSignatureText(matched.imzaText);
      localStorage.setItem('kibritci_sig_text', matched.imzaText);
    }
    if (matched.imzaStyle) {
      setSignatureStyle(matched.imzaStyle);
      localStorage.setItem('kibritci_sig_style', matched.imzaStyle);
    }
  }, [currentUser, kullanicilar]);

  useEffect(() => {
    if (!currentUser || !activeTab) return;
    try {
      persistLastTab(activeTab);
    } catch {
      /* no-op */
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (!currentUser || !activeTab) return;
    const main = mainScrollRef.current;
    if (!main) return;
    const sample = Array.from(main.querySelectorAll<HTMLElement>('*'))
      .slice(0, 600)
      .reduce<{ tag: string; className: string; scrollWidth: number; clientWidth: number } | null>((acc, el: any) => {
        if (!el || !el.className) return acc;
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 8) return acc;
        if (!acc || over > (acc.scrollWidth - acc.clientWidth)) {
          return {
            tag: el.tagName.toLowerCase(),
            className: String(el.className).slice(0, 120),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          };
        }
        return acc;
      }, null);
  }, [currentUser, activeTab, personeller.length, yoklamaPersonCount]);

  // Sekme bazlı scroll konumunu koru: sayfalar arası gidip gelince kaldığın yere dön.
  useEffect(() => {
    if (!currentUser || !activeTab) return;
    const main = mainScrollRef.current;
    if (!main) return;
    try {
      const saved = sessionStorage.getItem(`kibritci_tab_scroll_${activeTab}`);
      main.scrollTop = saved ? Number(saved) || 0 : 0;
    } catch {
      main.scrollTop = 0;
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (!currentUser || !activeTab) return;
    const main = mainScrollRef.current;
    if (!main) return;
    const key = `kibritci_tab_scroll_${activeTab}`;
    const handleScroll = () => {
      try {
        sessionStorage.setItem(key, String(main.scrollTop));
      } catch {
        /* no-op */
      }
    };
    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      handleScroll();
      main.removeEventListener('scroll', handleScroll);
    };
  }, [currentUser, activeTab]);

  // Kamp odaları var ama yerleşke/kat koleksiyonları eksildiyse otomatik geri oluştur.
  // Böylece Kamp Yönetimi ve Kampçı Mobil menülerinde "kayıtlar silindi" algısı oluşmaz.
  useEffect(() => {
    if (dbStatus !== 'synced' || !currentUser) return;
    if (kampRepairInFlightRef.current) return;
    if (kampOdalari.length === 0) return;
    if (kampYerleskeleri.length > 0 && kampKatlari.length > 0) return;

    kampRepairInFlightRef.current = true;
    ensureYapıFromOdalari(kampOdalari, currentUser?.email)
      .catch((err) => {
        console.warn('Kamp yapı onarımı başarısız:', err);
      })
      .finally(() => {
        kampRepairInFlightRef.current = false;
      });
  }, [dbStatus, currentUser, kampOdalari, kampYerleskeleri.length, kampKatlari.length]);

  const handleSignOut = async () => {
    try {
      roleHomeRoutedRef.current = false;
      claimsSyncedRef.current = false;
      bootstrapDoneRef.current = false;
      localStorage.removeItem('kibritci_portal_session');

      // Update last seen before sign out
      if (currentUser?.email && kullanicilar.length > 0) {
        const userEmailNorm = currentUser.email.trim().toLowerCase();
        const dbUser = kullanicilar.find(u => u.email?.trim().toLowerCase() === userEmailNorm);
        if (dbUser) {
          await saveKullanici({ ...dbUser, sonGorulmeTarihi: new Date().toISOString() }).catch(console.error);
        }
      }

      await signOut(auth);
      setCurrentUser(null);
    } catch (err) {
      console.error('Signout error:', err);
    }
  };

  // 2. Optimistic Intercepting Wrapper State Setters
  const syncListState = <T extends { id: string }>(
    collectionName: string,
    prev: T[],
    next: T[],
    setState: React.Dispatch<React.SetStateAction<T[]>>
  ) => {
    queueArrayStateSync(collectionName, prev, next, () => setState(prev), (msg) =>
      persistenceFailureRef.current(collectionName, msg)
    );
  };

  const handlePersonelDeleted = (deleted: Personel[]) => {
    if (!deleted.length) return;

    const deletedIds = deleted.map((p) => p.id).filter(Boolean);
    deletedIds.forEach((id) => personelDeletedIdBlocklistRef.current.add(id));

    deleted.forEach((p) => {
      const fullName = `${p.ad || ''} ${p.soyad || ''}`.trim();
      personelAutoCreateBlocklistRef.current.add(personelNameKey(p));
      personelAutoCreateBlocklistRef.current.add(normalizeTurkishName(fullName));
      // Kamp kaydındaki yazım farkları için de engelle
      personelAutoCreateBlocklistRef.current.add(fullName.toLocaleLowerCase('tr-TR'));
    });

    // Firestore silmeyi doğrudan da doğrula (array sync gecikse/başarısız olsa bile)
    deletedIds.forEach((id) => {
      void removeDocument('personeller', id).catch((err) =>
        console.warn('[personel-delete] Firestore silme:', id, err)
      );
    });

    suppressPersonelTcsFromDeleted(deleted);

    // Önce UI’da kampı boşalt, sonra Firestore tahliye — silinen kişi listelerde kalmasın
    const nameKeys = new Set(
      deleted.flatMap((p) => {
        const full = `${p.ad || ''} ${p.soyad || ''}`.trim();
        return [normalizeTurkishName(full), personelNameKey(p)];
      })
    );
    const idSet = new Set(deletedIds);
    const cikisTarihi = new Date().toISOString().slice(0, 10);

    setKampKayitlari((prev) =>
      prev.map((k) => {
        if (k.durum !== 'AKTIF') return k;
        const byId = Boolean(k.personelId && idSet.has(k.personelId));
        const byName = nameKeys.has(normalizeTurkishName(k.personelIsim || ''));
        if (!byId && !byName) return k;
        return { ...k, durum: 'PASIF' as const, cikisTarihi };
      })
    );

    void (async () => {
      let kayitlar = [...kampKayitlariRef.current];
      let odalar = [...kampOdalariRef.current];
      let totalEvicted = 0;

      for (const p of deleted) {
        const result = await evictActiveKampResidentsForPersonel({
          personelId: p.id,
          personelIds: deletedIds,
          personelIsim: `${p.ad || ''} ${p.soyad || ''}`.trim(),
          cikisTarihi: p.istenCikisTarihi || cikisTarihi,
          kampOdalari: odalar,
          kampKayitlari: kayitlar,
        });
        kayitlar = result.kampKayitlari;
        odalar = result.kampOdalari;
        totalEvicted += result.evictedCount;
      }

      setKampKayitlari(kayitlar);
      setKampOdalari(odalar);

      if (totalEvicted > 0) {
        addNotification?.(
          `Personel silindi — kamptan ${totalEvicted} oda kaydı tahliye edildi.`
        );
      }
    })().catch((err) => {
      console.error('[personel-delete] Kamp tahliye hatası:', err);
      addNotification?.('Personel silindi ancak kamp tahliyesi tamamlanamadı — kontrol edin.');
    });
  };

  // İşten çıkış / pasife alma → aktif kamp oda kaydı otomatik tahliye
  const prevPersonellerForKampRef = useRef<Personel[] | null>(null);
  const kampTahliyeInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevPersonellerForKampRef.current;
    prevPersonellerForKampRef.current = personeller;
    if (!prev || prev.length === 0) return;

    for (const p of personeller) {
      const old = prev.find((x) => x.id === p.id);
      if (!old) continue;
      if (!isPersonelAktifDurum(old.durum) || isPersonelAktifDurum(p.durum)) continue;
      if (kampTahliyeInFlightRef.current.has(p.id)) continue;
      kampTahliyeInFlightRef.current.add(p.id);
      void evictActiveKampResidentsForPersonel({
        personelId: p.id,
        personelIsim: `${p.ad || ''} ${p.soyad || ''}`.trim(),
        cikisTarihi: p.istenCikisTarihi || new Date().toISOString().slice(0, 10),
        kampOdalari: kampOdalariRef.current,
        kampKayitlari: kampKayitlariRef.current,
      })
        .then((result) => {
          if (result.evictedCount > 0) {
            setKampKayitlari(result.kampKayitlari);
            setKampOdalari(result.kampOdalari);
            addNotification?.(
              `${p.ad} ${p.soyad} işten çıkarıldı — kamptaki odasından otomatik tahliye edildi (${result.evictedCount} kayıt).`
            );
          }
        })
        .finally(() => {
          kampTahliyeInFlightRef.current.delete(p.id);
        });
    }
  }, [personeller, kampOdalari, kampKayitlari]);

  const setPersonellerWithSync = (updater: Personel[] | ((p: Personel[]) => Personel[])) => {
    setPersoneller(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      const next = nextRaw.map(p => 
        (p.ad === 'MURAT' && p.soyad === 'ÇÖREKÇİ' && p.iseGirisTarihi === '2026-08-06') 
          ? { ...p, iseGirisTarihi: '2026-06-08' } 
          : p
      );

      syncListState('personeller', prev, next, setPersoneller);
      return next;
    });
  };

  // Self-healing: Murat Çörekçi + toplu işe giriş bozulması (2024/2026-07-14 vb.)
  const hireRepairNotifiedRef = useRef(false);
  useEffect(() => {
    if (personeller.length === 0) return;
    if (Object.keys(yoklamalar || {}).length === 0) return;

    let cancelled = false;
    void import('./lib/repairIseGirisTarihi').then(({ repairCorruptedIseGirisTarihi }) => {
      if (cancelled) return;
      const muratNeeds = personeller.some(
        (p) => p.ad === 'MURAT' && p.soyad === 'ÇÖREKÇİ' && p.iseGirisTarihi === '2026-08-06'
      );
      const { changes } = repairCorruptedIseGirisTarihi(personeller, yoklamalar);
      if (!muratNeeds && changes.length === 0) return;

      setPersonellerWithSync((prev) => {
        const working = prev.map((p) =>
          p.ad === 'MURAT' && p.soyad === 'ÇÖREKÇİ' && p.iseGirisTarihi === '2026-08-06'
            ? { ...p, iseGirisTarihi: '2026-06-08' }
            : p
        );
        const repaired = repairCorruptedIseGirisTarihi(working, yoklamalar);
        if (repaired.changes.length > 0) {
          console.info(
            `[iseGiris-onarim] ${repaired.changes.length} personel düzeltildi`,
            repaired.changes.slice(0, 40)
          );
        }
        return repaired.next;
      });

      if (changes.length > 0 && !hireRepairNotifiedRef.current) {
        hireRepairNotifiedRef.current = true;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [personeller, yoklamalar]);

  // Ana firma adı birleştir: "Kibritçi İnşaat" / "KİBRİTÇİ İNŞAAT" → tek kanonik ad
  useEffect(() => {
    if (personeller.length === 0) return;
    const needsPersonelFirmaFix = personeller.some((p) => {
      if (p.firmaTipi === 'ANA_FIRMA' && p.firmaAdi !== CANONICAL_ANA_FIRMA_ADI) return true;
      if (!p.firmaAdi) return false;
      const upper = p.firmaAdi.trim().toLocaleUpperCase('tr-TR');
      if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') return true;
      if (isKibritciCompany(p.firmaAdi) && p.firmaAdi !== CANONICAL_ANA_FIRMA_ADI) return true;
      return p.firmaAdi !== upper;
    });
    if (!needsPersonelFirmaFix) return;
    setPersonellerWithSync((prev) =>
      prev.map((p) => {
        if (p.firmaTipi === 'ANA_FIRMA') {
          return { ...p, firmaAdi: CANONICAL_ANA_FIRMA_ADI };
        }
        if (p.firmaAdi) {
          const upper = p.firmaAdi.trim().toLocaleUpperCase('tr-TR');
          if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA' || isKibritciCompany(p.firmaAdi)) {
            return { ...p, firmaTipi: 'ANA_FIRMA', firmaAdi: CANONICAL_ANA_FIRMA_ADI };
          }
          if (p.firmaAdi !== upper) {
            return { ...p, firmaAdi: upper };
          }
        }
        return p;
      })
    );
  }, [personeller]);

  // Recovery: Auto-create missing personeller from active kampKayitlari & Uppercase company names
  useEffect(() => {
    if (personeller.length > 0 && kampKayitlari.length > 0) {
      // 2. Capitalize all calistigiFirma in kampKayitlari, convert "ANA FİRMA"/"ANA FIRMA" to "KİBRİTÇİ İNŞAAT" & sync them
      const needsKampFirmaFix = kampKayitlari.some((k) => {
        if (k.firmaTipi === 'ANA_FIRMA' && k.calistigiFirma !== CANONICAL_ANA_FIRMA_ADI) return true;
        if (!k.calistigiFirma) return false;
        const upper = k.calistigiFirma.trim().toLocaleUpperCase('tr-TR');
        if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') return true;
        if (isKibritciCompany(k.calistigiFirma) && k.calistigiFirma !== CANONICAL_ANA_FIRMA_ADI) {
          return true;
        }
        return k.calistigiFirma !== upper;
      });
      if (needsKampFirmaFix) {
        const nextKayitlar = kampKayitlari.map((k) => {
          if (k.firmaTipi === 'ANA_FIRMA') {
            const updated = { ...k, calistigiFirma: CANONICAL_ANA_FIRMA_ADI };
            void saveDocument('kampKayitlari', updated);
            return updated;
          }
          if (k.calistigiFirma) {
            const upper = k.calistigiFirma.trim().toLocaleUpperCase('tr-TR');
            if (
              upper === 'ANA FİRMA' ||
              upper === 'ANA FIRMA' ||
              isKibritciCompany(k.calistigiFirma)
            ) {
              const updated = {
                ...k,
                firmaTipi: 'ANA_FIRMA' as const,
                calistigiFirma: CANONICAL_ANA_FIRMA_ADI,
              };
              void saveDocument('kampKayitlari', updated);
              return updated;
            }
            if (k.calistigiFirma !== upper) {
              const updated = { ...k, calistigiFirma: upper };
              void saveDocument('kampKayitlari', updated);
              return updated;
            }
          }
          return k;
        });
        setKampKayitlari(nextKayitlar);
      }

      // 3. Aktif kamp sakinleri:
      //    - personelId kaymışsa İSİMLE eşleştirip yeniden bağla (asla otomatik tahliye etme)
      //    - yalnızca bilerek silinen / engelli listede olanları tahliye et
      //    - kartı hiç yoksa (isimle de yok) misafir kartı oluştur — odadan düşürme
      const activeResidents = kampKayitlari.filter((k) => k.durum === 'AKTIF');
      const toCreate: Personel[] = [];
      const orphanKayitIds = new Set<string>();
      const relinkPatches = new Map<string, string>(); // kayitId → personelId

      activeResidents.forEach((k) => {
        const nameClean = (k.personelIsim || '').trim();
        if (!nameClean) return;

        const nameKeyLower = nameClean.toLocaleLowerCase('tr-TR');
        const nameKeyNorm = normalizeTurkishName(nameClean);

        const kampFirma = (k.calistigiFirma || '').trim();
        const kampFirmaUpper = kampFirma.toLocaleUpperCase('tr-TR');
        const isAnaFirma =
          k.firmaTipi === 'ANA_FIRMA' ||
          kampFirmaUpper === 'ANA FİRMA' ||
          kampFirmaUpper === 'ANA FIRMA' ||
          (Boolean(kampFirma) && isKibritciCompany(kampFirma));

        const combinedPool = [...personeller, ...toCreate];

        const existsById = Boolean(
          k.personelId && combinedPool.some((p) => p.id === k.personelId)
        );

        const matchedPerson = pickBestPersonelMatch(
          findPersonelMatches(combinedPool, {
            rawName: nameClean,
            firmaAdi: isAnaFirma ? CANONICAL_ANA_FIRMA_ADI : kampFirmaUpper || kampFirma,
            firmaTipi: isAnaFirma ? 'ANA_FIRMA' : 'TASERON',
          })
        )?.personel;

        // Bilinçli silme engeli — yalnızca bunlar tahliye edilir
        if (personelAutoCreateBlocklistRef.current.has(nameKeyLower)) {
          orphanKayitIds.add(k.id);
          return;
        }
        if (personelAutoCreateBlocklistRef.current.has(nameKeyNorm)) {
          orphanKayitIds.add(k.id);
          return;
        }
        if (k.personelId && personelDeletedIdBlocklistRef.current.has(k.personelId)) {
          orphanKayitIds.add(k.id);
          return;
        }
        if (isPlaceholderPersonelName(nameClean)) return;

        // ID kaymış / isim+firma eşleşmesi → yeniden bağla (yeni personel açma)
        if (!existsById && matchedPerson) {
          if (k.personelId !== matchedPerson.id) {
            relinkPatches.set(k.id, matchedPerson.id);
          }
          return;
        }

        if (existsById || matchedPerson) return;

        const alreadyQueued = toCreate.some((p) =>
          Boolean(
            pickBestPersonelMatch(
              findPersonelMatches([p], {
                rawName: nameClean,
                firmaAdi: isAnaFirma ? CANONICAL_ANA_FIRMA_ADI : kampFirmaUpper || kampFirma,
                firmaTipi: isAnaFirma ? 'ANA_FIRMA' : 'TASERON',
              })
            )
          )
        );

        if (alreadyQueued) return;

        const parts = nameClean.split(/\s+/);
        const ad = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
        const soyad = parts.length > 1 ? parts[parts.length - 1] : '';

        const newP: Personel = {
          id: k.personelId || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
          iseGirisTarihi: k.girisTarihi || new Date().toISOString().split('T')[0],
          cinsiyet: 'Erkek',
          maas: 30000,
          ucretTipi: 'Aylık',
          sgkDurumu: "SGK'lı",
          bankaAdi: '',
          subeAdi: '',
          ibanNo: '',
          durum: true,
          firmaTipi: isAnaFirma ? 'ANA_FIRMA' : 'TASERON',
          firmaAdi: isAnaFirma
            ? CANONICAL_ANA_FIRMA_ADI
            : kampFirmaUpper || 'TAŞERON',
        };
        toCreate.push(newP);
      });

      let workingKayitlar = kampKayitlari;

      // ID yeniden bağlama — odada kalır
      if (relinkPatches.size > 0) {
        workingKayitlar = workingKayitlar.map((k) => {
          const newPid = relinkPatches.get(k.id);
          if (!newPid) return k;
          const updated = { ...k, personelId: newPid };
          void saveDocument('kampKayitlari', updated);
          return updated;
        });
        setKampKayitlari(workingKayitlar);
        console.log(
          `[kamp] ${relinkPatches.size} yerleşim personelId yeniden bağlandı (tahliye yok)`
        );
      }

      if (orphanKayitIds.size > 0) {
        const cikisTarihi = new Date().toISOString().slice(0, 10);
        workingKayitlar = workingKayitlar.map((k) =>
          orphanKayitIds.has(k.id) && k.durum === 'AKTIF'
            ? { ...k, durum: 'PASIF' as const, cikisTarihi }
            : k
        );
        setKampKayitlari(workingKayitlar);
        orphanKayitIds.forEach((id) => {
          const kayit = workingKayitlar.find((k) => k.id === id);
          if (kayit) void saveDocument('kampKayitlari', kayit);
        });
        const affectedRooms = new Set(
          [...orphanKayitIds]
            .map((id) => {
              const k = kampKayitlari.find((x) => x.id === id);
              return k?.odaId || k?.roomId;
            })
            .filter(Boolean) as string[]
        );
        if (affectedRooms.size > 0) {
          setKampOdalari((prev) =>
            prev.map((room) => {
              if (!affectedRooms.has(room.id)) return room;
              const remaining = workingKayitlar.filter(
                (k) =>
                  (k.odaId === room.id || k.roomId === room.id) && k.durum === 'AKTIF'
              ).length;
              const durum =
                remaining <= 0 ? 'BOŞ' : remaining >= room.kapasite ? 'DOLU' : 'KISMEN DOLU';
              const updated = { ...room, durum: durum as KampOdasi['durum'] };
              void saveDocument('kampOdalari', updated);
              return updated;
            })
          );
        }
      }

      if (toCreate.length > 0) {
        console.log(`Auto-creating ${toCreate.length} missing personeller from active kampKayitlari...`, toCreate);
        setPersonellerWithSync((prev) => [...toCreate, ...prev]);

        workingKayitlar = workingKayitlar.map((k) => {
          if (k.durum === 'AKTIF' && !orphanKayitIds.has(k.id)) {
            const matchedCreated = toCreate.find((p) => {
              const fullName = `${p.ad} ${p.soyad}`.trim().toLocaleLowerCase('tr-TR');
              return fullName === k.personelIsim.trim().toLocaleLowerCase('tr-TR');
            });
            if (matchedCreated && !k.personelId) {
              const updated = { ...k, personelId: matchedCreated.id };
              void saveDocument('kampKayitlari', updated);
              return updated;
            }
          }
          return k;
        });
        setKampKayitlari(workingKayitlar);
      }
    }
  }, [personeller, kampKayitlari]);

  // Toplu yanlış tahliye (PASIF) tespit edilirse bir kez otomatik geri yükle
  useEffect(() => {
    if (kampAutoRestoreTriedRef.current) return;
    if (!currentUser) return;
    if (kampKayitlari.length === 0 || kampOdalari.length === 0) return;

    const aktifCount = kampKayitlari.filter((k) => k.durum === 'AKTIF').length;
    const mass = detectMassKampEvictionDate(kampKayitlari, 5);
    if (!mass) return;

    // Aktif yerleşim hâlâ doluysa dokunma
    if (aktifCount >= mass.count) return;

    const storageKey = `kibritci_kamp_auto_restore_${mass.date}`;
    try {
      if (localStorage.getItem(storageKey) === '1') {
        kampAutoRestoreTriedRef.current = true;
        return;
      }
    } catch {
      /* ignore */
    }

    kampAutoRestoreTriedRef.current = true;

    void (async () => {
      try {
        const result = await reactivateEvictedKampStays({
          kampKayitlari: kampKayitlariRef.current,
          kampOdalari: kampOdalariRef.current,
          onlyCikisTarihi: mass.date,
          blockedPersonelIds: personelDeletedIdBlocklistRef.current,
          blockedNameKeys: personelAutoCreateBlocklistRef.current,
        });
        if (result.reactivatedCount > 0) {
          setKampKayitlari(result.kampKayitlari);
          setKampOdalari(result.kampOdalari);
          console.info(
            `[kamp] Toplu tahliye geri alındı: ${result.reactivatedCount} yerleşim (${mass.date}, atlanan ${result.skippedCount})`
          );
        }
        try {
          localStorage.setItem(storageKey, '1');
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.warn('[kamp] Otomatik yerleşim geri yükleme başarısız:', err);
        kampAutoRestoreTriedRef.current = false;
      }
    })();
  }, [currentUser, kampKayitlari, kampOdalari]);


  const setSatinAlmaTalepleriWithSync = (updater: SatinAlmaTalebi[] | ((s: SatinAlmaTalebi[]) => SatinAlmaTalebi[])) => {
    setSatinAlmaTalepleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('satinAlmaTalepleri', prev, next, setSatinAlmaTalepleri);
      return next;
    });
  };

  const setIrsaliyelerWithSync = (updater: Irsaliye[] | ((i: Irsaliye[]) => Irsaliye[])) => {
    setIrsaliyeler(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('irsaliyeler', prev, next, setIrsaliyeler);
      return next;
    });
  };

  const setFaturalarWithSync = (updater: Fatura[] | ((f: Fatura[]) => Fatura[])) => {
    setFaturalar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('faturalar', prev, next, setFaturalar);
      return next;
    });
  };

  const setEvrakBaglantiGruplariWithSync = (updater: EvrakBaglantiGrubu[] | ((g: EvrakBaglantiGrubu[]) => EvrakBaglantiGrubu[])) => {
    setEvrakBaglantiGruplari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('evrakBaglantiGruplari', prev, next, setEvrakBaglantiGruplari);
      return next;
    });
  };

  const setOnayliAnalizRaporlariWithSync = (updater: OnayliAnalizRaporu[] | ((r: OnayliAnalizRaporu[]) => OnayliAnalizRaporu[])) => {
    setOnayliAnalizRaporlari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('onayliAnalizRaporlari', prev, next, setOnayliAnalizRaporlari);
      return next;
    });
  };

  const setKasaHareketleriWithSync = (updater: KasaHareketi[] | ((k: KasaHareketi[]) => KasaHareketi[])) => {
    setKasaHareketleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('kasaHareketleri', prev, next, setKasaHareketleri);
      return next;
    });
  };

  const deleteKasaHareketi = async (id: string) => {
    // Onay havuzu / şoför fişi: senkron yeniden yaratmasın
    const yolId = yolHarcamaIdFromKasaDocId(id);
    if (yolId) {
      try {
        await excludeYolHarcamaFromKasaLedger(yolId);
      } catch (err) {
        console.warn('[kasa-delete] yol harcama işaretlenemedi:', yolId, err);
      }
    }
    await removeDocument('kasaHareketleri', id);
    setKasaHareketleri((prev) => prev.filter((k) => k.id !== id));
  };

  const setAraclarWithSync = (updater: AracBakim[] | ((a: AracBakim[]) => AracBakim[])) => {
    setAraclar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('araclar', prev, next, setAraclar);
      return next;
    });
  };

  const setDemirbaslarWithSync = (updater: Demisbas[] | ((d: Demisbas[]) => Demisbas[])) => {
    setDemirbaslar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('demirbaslar', prev, next, setDemirbaslar);
      return next;
    });
  };

  const setKampOdalariWithSync = (updater: KampOdasi[] | ((k: KampOdasi[]) => KampOdasi[])) => {
    // kampOdalari: toplu syncArrayToFirestore kullanılmaz — silinen odalar geri yazılır.
    // Tekil kayıtlar createKampOdasi / deleteKampOdasi ile Firestore'a yazılır.
    setKampOdalari((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  };

  const setKampKayitlariWithSync = (updater: KampKaydi[] | ((k: KampKaydi[]) => KampKaydi[])) => {
    setKampKayitlari((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  };

  const reloadKampData = async () => {
    const snapshot = await loadKampStateSnapshot();
    setKampOdalari(snapshot.odalar);
    setKampKayitlari(snapshot.kayitlar);
    setKampYerleskeleri(snapshot.yerleskeler);
    setKampKatlari(snapshot.katlar);
  };

  const setProgramliFaaliyetlerWithSync = (
    updater: ProgramliFaaliyet[] | ((s: ProgramliFaaliyet[]) => ProgramliFaaliyet[])
  ) => {
    setProgramliFaaliyetler((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('programliFaaliyetler', prev, next, setProgramliFaaliyetler);
      return next;
    });
  };

  const setHazirTutanaklarWithSync = (updater: HazirTutanak[] | ((h: HazirTutanak[]) => HazirTutanak[])) => {
    setHazirTutanaklar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('hazirTutanaklar', prev, next, setHazirTutanaklar);
      return next;
    });
  };



  const setCariKartlarWithSync = (updater: CariKart[] | ((c: CariKart[]) => CariKart[])) => {
    setCariKartlar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('cariKartlar', prev, next, setCariKartlar);
      return next;
    });
  };

  const setStokKartlarWithSync = (updater: StokKart[] | ((s: StokKart[]) => StokKart[])) => {
    setStokKartlar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('stokKartlar', prev, next, setStokKartlar);
      return next;
    });
  };

  const setEpostaGonderimleriWithSync = (updater: EpostaGonderim[] | ((e: EpostaGonderim[]) => EpostaGonderim[])) => {
    setEpostaGonderimleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('epostaGonderimleri', prev, next, setEpostaGonderimleri);
      return next;
    });
  };

  const setKullanicilarWithSync = (updater: Kullanici[] | ((u: Kullanici[]) => Kullanici[])) => {
    // kullanicilar: toplu syncArrayToFirestore kullanılmaz — eski state rolü geri yazar.
    // Tekil kayıtlar saveKullanici / persistKullaniciRole ile Firestore'a yazılır.
    setKullanicilar((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  };

  const setAracKmLoglariWithSync = (updater: any[] | ((a: any[]) => any[])) => {
    setAracKmLoglari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('aracKmLoglari', prev, next, setAracKmLoglari);
      return next;
    });
  };

  const setKiralikKamyonPuantajWithSync = (
    updater: KiralikKamyonPuantajKaydi[] | ((k: KiralikKamyonPuantajKaydi[]) => KiralikKamyonPuantajKaydi[])
  ) => {
    setKiralikKamyonPuantaj((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('kiralikKamyonPuantaj', prev, next, setKiralikKamyonPuantaj);
      return next;
    });
  };

  const setOperatorFaaliyetleriWithSync = (updater: OperatorFaaliyet[] | ((o: OperatorFaaliyet[]) => OperatorFaaliyet[])) => {
    setOperatorFaaliyetleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('operatorFaaliyetleri', prev, next, setOperatorFaaliyetleri);
      return next;
    });
  };

  const setTaseronKesintiRaporlariWithSync = (updater: TaseronKesintiRaporu[] | ((t: TaseronKesintiRaporu[]) => TaseronKesintiRaporu[])) => {
    setTaseronKesintiRaporlari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('taseronKesintiRaporlari', prev, next, setTaseronKesintiRaporlari);
      return next;
    });
  };

  const setTaseronEnerjiKayitlariWithSync = (updater: TaseronEnerjiKaydi[] | ((t: TaseronEnerjiKaydi[]) => TaseronEnerjiKaydi[])) => {
    setTaseronEnerjiKayitlari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('taseronEnerjiKayitlari', prev, next, setTaseronEnerjiKayitlari);
      return next;
    });
  };

  const setTaseronYemekKayitlariWithSync = (updater: TaseronYemekKaydi[] | ((t: TaseronYemekKaydi[]) => TaseronYemekKaydi[])) => {
    setTaseronYemekKayitlari(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('taseronYemekKayitlari', prev, next, setTaseronYemekKayitlari);
      return next;
    });
  };

  const setMaasOdemeleriWithSync = (updater: MaaşOdeme[] | ((m: MaaşOdeme[]) => MaaşOdeme[])) => {
    setMaasOdemeleri(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('maasOdemeleri', prev, next, setMaasOdemeleri);
      return next;
    });
  };

  const handlePayrollPeriodChange = (month: number, year: number) => {
    setPayrollPeriod((prev) => {
      if (prev.month === month && prev.year === year) return prev;
      return { month, year };
    });
  };

  const handleSaveMaasHesapTaslaklari = (payload: {
    month: number;
    year: number;
    rows: Array<{
      personel: Personel;
      brutMaas: number;
      mesaiUcreti: number;
      toplamHakedis: number;
      kesintiToplami: number;
      netOdeme: number;
    }>;
  }) => {
    setMaasOdemeleriWithSync((prev) => {
      const next = [...prev];
      for (const row of payload.rows) {
        const idx = next.findIndex(
          (m) => m.personelId === row.personel.id && m.ay === payload.month && m.yil === payload.year
        );
        if (idx >= 0) {
          const existing = next[idx];
          if (existing.odendi) continue;
          const kesintiToplami = existing.kesintiToplami || row.kesintiToplami || 0;
          next[idx] = {
            ...existing,
            brutMaas: Math.round(row.brutMaas * 100) / 100,
            mesaiUcreti: Math.round(row.mesaiUcreti * 100) / 100,
            toplamHakedis: Math.round(row.toplamHakedis * 100) / 100,
            kesintiToplami,
            netOdeme: Math.round((row.toplamHakedis - kesintiToplami) * 100) / 100,
            iban: row.personel.ibanNo || existing.iban || '',
            bankaAdi: row.personel.bankaAdi || existing.bankaAdi || '',
            tcNo: row.personel.tcNo || existing.tcNo || '',
            personelAdSoyad: `${row.personel.ad} ${row.personel.soyad}`,
          };
          continue;
        }

        next.push({
          id: `mo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          personelId: row.personel.id,
          personelAdSoyad: `${row.personel.ad} ${row.personel.soyad}`,
          ay: payload.month,
          yil: payload.year,
          brutMaas: Math.round(row.brutMaas * 100) / 100,
          mesaiUcreti: Math.round(row.mesaiUcreti * 100) / 100,
          toplamHakedis: Math.round(row.toplamHakedis * 100) / 100,
          kesintiToplami: Math.round((row.kesintiToplami || 0) * 100) / 100,
          netOdeme: Math.round(row.netOdeme * 100) / 100,
          odendi: false,
          iban: row.personel.ibanNo || '',
          bankaAdi: row.personel.bankaAdi || '',
          tcNo: row.personel.tcNo || '',
          kesintiler: [],
          notlar: 'Maas hesap ekranindan otomatik taslak olusturuldu.',
        });
      }
      return next;
    });
    setMaasSubTab('odeme');
    setActiveTab('maas');
    alert(`Maaş hesap taslakları ${payload.month}. ay / ${payload.year} dönemi için Maaş Ödeme ekranına aktarıldı.`);
  };

  // Veri güvenliği: Yoklama geçmişi arka planda otomatik silinmez.
  // İşten çıkış sonrası günler UI'da pasif/kapalı gösterilir, ancak kayıtlar korunur.

  const setPersonelIslemGecmisiWithSync = (updater: PersonelIslemGecmisi[] | ((p: PersonelIslemGecmisi[]) => PersonelIslemGecmisi[])) => {
    setPersonelIslemGecmisi(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('personelIslemGecmisi', prev, next, setPersonelIslemGecmisi);
      return next;
    });
  };

  const setCariIslemGecmisiWithSync = (updater: CariKartIslem[] | ((c: CariKartIslem[]) => CariKartIslem[])) => {
    setCariIslemGecmisi(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('cariIslemGecmisi', prev, next, setCariIslemGecmisi);
      return next;
    });
  };

  const setStokIslemGecmisiWithSync = (updater: StokKartIslem[] | ((s: StokKartIslem[]) => StokKartIslem[])) => {
    setStokIslemGecmisi(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('stokIslemGecmisi', prev, next, setStokIslemGecmisi);
      return next;
    });
  };

  const addNotification = async (mesaj: string, meta?: Record<string, unknown>) => {
    try {
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        tarih: new Date().toISOString(),
        kullanici: currentUser?.email || 'Sistem',
        mesaj,
        okundu: false,
        ...(meta || {}),
      };
      await saveDocument('bildirimler', newNotif);
    } catch (err) {
      console.error("Bildirim eklenemedi:", err);
    }
  };

  const notifyYoklamaSaveFailure = (message: string) => {
    const friendly = formatFirestoreWriteError(message, message);
    console.error('[yoklama]', friendly);
    void addNotification(`⚠️ Yoklama kaydı korundu: ${friendly}`);
  };

  persistenceFailureRef.current = (collection, message) => {
    const friendly = formatFirestoreWriteError(message, message);
    console.error(`[persist:${collection}]`, friendly);
    void addNotification(`⚠️ ${collection} kaydı korundu: ${friendly}`);
  };

  const saveYoklamalarNow = async (
    next: AylikYoklamaMap,
    kaynak: import('./lib/yoklamaPersistence').YoklamaSaveSource = 'formen_mobil'
  ) => {
    const authBlock = await assertErpWriteAuth();
    if (authBlock) {
      notifyYoklamaSaveFailure(authBlock);
      throw new Error(authBlock);
    }
    const result = await saveYoklamaDocument(next, kaynak);
    if (!result.ok) {
      notifyYoklamaSaveFailure(result.error || 'Bilinmeyen hata');
      throw new Error(result.error || 'Yoklama kaydedilemedi');
    }
    setYoklamalar(result.map || next);
    if (result.map) {
      try {
        yoklamaJsonSeenRef.current = JSON.stringify(result.map);
      } catch {
        /* ignore */
      }
    }
    return result;
  };

  /** Masaüstü: cache + ay shard öncelikli; mega-belge sunucu yalnızca gerekirse. */
  const reloadYoklamalarFromServer = async () => {
    const now = new Date();
    const months: string[] = [];
    for (let i = -3; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const { map, dataJson, source } = await fetchYoklamaMapPreferFast({
      yearMonths: months,
      allowServerForce: true,
    });
    if (dataJson) yoklamaJsonSeenRef.current = dataJson;
    setYoklamalar(map);
    if (hasSubstantialYoklamaData(map)) {
      markProductionLive();
      scheduleYoklamaMonthShardSync(map);
    }
    console.info('[yoklama] yenileme kaynağı:', source);
    return {
      personCount: Object.keys(map || {}).length,
      filledDayCount: countYoklamaFilledDays(map),
      map,
    };
  };

  const setYoklamalarWithSync = (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => {
    setYoklamalar((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      yoklamaSyncPendingRef.current = { prev, next };
      return next;
    });
    // Yan etki state updater dışında (StrictMode çift çağrıda çift yazma riski yok)
    queueMicrotask(() => {
      const pending = yoklamaSyncPendingRef.current;
      if (!pending) return;
      yoklamaSyncPendingRef.current = null;
      const { prev, next } = pending;
      void (async () => {
        const authBlock = await assertErpWriteAuth();
        if (authBlock) {
          setYoklamalar(prev);
          notifyYoklamaSaveFailure(authBlock);
          return;
        }
        const result = await saveYoklamaDocument(next, 'sync');
        if (!result.ok) {
          setYoklamalar(prev);
          notifyYoklamaSaveFailure(result.error || 'Yoklama kaydı sunucuya yazılamadı');
          return;
        }
        if (result.map) {
          const rawJson = JSON.stringify(result.map);
          yoklamaJsonSeenRef.current = rawJson;
          setYoklamalar(result.map);
        }
      })();
    });
  };

  const notifySahaFaaliyetFailure = (message: string) => {
    console.error('[saha-faaliyet]', message);
    void addNotification(`⚠️ Saha faaliyeti korundu: ${message}`);
  };

  const saveSahaFaaliyetNow = async (
    record: SahaFaaliyetiType,
    kaynak: SahaFaaliyetSaveSource = 'formen_mobil'
  ) => {
    const authBlock = await assertErpWriteAuth();
    if (authBlock) {
      notifySahaFaaliyetFailure(authBlock);
      throw new Error(authBlock);
    }
    const result = await enqueueSahaFaaliyetSave(record, kaynak);
    if (!result.ok) {
      notifySahaFaaliyetFailure(result.error || 'Bilinmeyen hata');
      throw new Error(result.error || 'Saha faaliyeti kaydedilemedi');
    }
    // Storage'a taşınmış foto URL'lerini state'e al
    let saved: SahaFaaliyetiType = record;
    try {
      const remote = await fetchSahaFaaliyetById(record.id);
      if (remote) saved = remote;
    } catch {
      /* local kaydı kullan */
    }
    setSahaFaaliyetleri((prev) => {
      const exists = prev.some((f) => f.id === saved.id);
      return exists ? prev.map((f) => (f.id === saved.id ? { ...f, ...saved } : f)) : [saved, ...prev];
    });
    return result;
  };

  const removeSahaFaaliyetNow = async (record: SahaFaaliyetiType) => {
    const result = await removeSahaFaaliyetSafe(record.id, 'delete', record);
    if (!result.ok) {
      notifySahaFaaliyetFailure(result.error || 'Silme işlemi engellendi');
      throw new Error(result.error || 'Saha faaliyeti silinemedi');
    }
    setSahaFaaliyetleri((prev) => prev.filter((f) => f.id !== record.id));
    return result;
  };

  const setSahaFaaliyetleriWithSync = (
    updater: SahaFaaliyetiType[] | ((s: SahaFaaliyetiType[]) => SahaFaaliyetiType[])
  ) => {
    setSahaFaaliyetleri((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      syncListState('sahaFaaliyetleri', prev, next, setSahaFaaliyetleri);
      return next;
    });
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

  /** Bildirim metninden ilgili sekmeyi (muhatabı) çıkarır */
  const resolveNotificationTab = (notif: any): string => {
    const explicit = notif?.hedefTab || notif?.route;
    if (explicit && typeof explicit === 'string') return explicit;
    const text = String(notif?.mesaj || '').toLocaleLowerCase('tr-TR');
    const has = (...keys: string[]) => keys.some((k) => text.includes(k));

    if (has('onay', 'reddedil', 'onaylandı', 'onaylandi', 'imza', 'kapı', 'kapi', 'gate', 'evrak')) return 'onay_islemleri';
    if (has('irsaliye', 'fiş', 'fis')) return 'irsaliye_giris';
    if (has('t cetvel', 't-cetvel', 'cetveli')) return 't_cetveli';
    if (has('fatura')) return 'fatura_giris';
    if (has('sipariş', 'siparis')) return 'siparis_formu';
    if (has('satın alma', 'satin alma', 'talep', 'po ')) return 'satin_alma';
    if (has('yoklama', 'mesai', 'puantaj')) return 'yoklama';
    if (has('saha', 'faaliyet')) return 'faaliyet_personel';
    if (has('oda', 'kamp', 'tahliye', 'yerleştir', 'yerlestir', 'sayım', 'sayim')) return 'kamp';
    if (has('kullanıcı', 'kullanici', 'rol', 'hesap', 'yetki', 'üyelik', 'uyelik', 'kayıttan', 'kayittan')) return 'admin';
    if (has('taşeron', 'taseron', 'kesinti')) return 'taseron_kesinti';
    if (has('operatör', 'operator')) return 'operator';
    if (has('araç', 'arac', 'demirbaş', 'demirbas', 'plaka')) return 'arac';
    if (has('personel')) return 'personel';
    if (has('yedek', 'program')) return 'admin';
    return 'ana_sayfa';
  };

  const handleNotificationClick = (notif: any) => {
    if (notif && !notif.okundu) {
      void saveDocument('bildirimler', { ...notif, okundu: true }).catch((err) =>
        console.error('Bildirim okundu işaretlenemedi:', err)
      );
    }
    const target = resolveNotificationTab(notif);
    handleTabNavigation(target);
  };

  const handleTabNavigation = (targetTab: string) => {
    const tab = isRetiredPortalTab(targetTab) ? 'ana_sayfa' : targetTab;
    try {
      persistLastTab(tab);
    } catch {
      /* no-op */
    }
    try {
      pushRecentTab(tab);
    } catch {
      /* no-op */
    }
    if (tab !== 'yetki_verme') {
      setYetkiVermeUnlocked(false);
      setYetkiVermePasswordInput('');
      setYetkiVermePasswordError(false);
    }
    setActiveTab(tab);
  };

  const openIrsaliyeFromSatinAlma = (sa: SatinAlmaTalebi) => {
    setIrsaliyeSaPrefill(buildSaIrsaliyeFormPrefill(sa, irsaliyeler));
    handleTabNavigation('irsaliye_giris');
  };

  const closePublicGiris = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('view_giris');
    window.history.replaceState({}, '', url.toString());
    setPublicViewGiris(null);
  };

  const closePublicPo = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('view_po');
    window.history.replaceState({}, '', url.toString());
    setPublicViewPo(null);
  };

  const closePublicKasaRapor = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('view_kasa_rapor');
    window.history.replaceState({}, '', url.toString());
    setPublicViewKasaRapor(null);
  };

  const closePublicSiparis = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('siparis');
    window.history.replaceState({}, '', url.toString());
    setPublicSiparisOpen(false);
  };

  // Public WhatsApp giriş / satın alma evrak linki — oturum gerekmez
  if (publicSiparisOpen) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100">
            <KibritciLogo size="lg" className="h-14" />
          </div>
        }
      >
        <SiparisFormuScreen isPublic onClose={closePublicSiparis} />
      </Suspense>
    );
  }

  if (publicLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 font-sans p-6">
        <KibritciLogo size="lg" className="h-14 mb-4" />
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">KİBRİTÇİ ERP GÖRSEL SORGU...</p>
      </div>
    );
  }

  if (publicViewGiris) {
    return (
      <PublicGirisKayitScreen talep={publicViewGiris} onClose={closePublicGiris} />
    );
  }

  if (publicViewKasaRapor) {
    return (
      <PublicKasaRaporShareScreen share={publicViewKasaRapor} onClose={closePublicKasaRapor} />
    );
  }

  if (publicViewPo) {
    return (
      <PublicSatinAlmaShareScreen share={publicViewPo} onClose={closePublicPo} />
    );
  }

  // Full screen auth checking loader
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-8 select-none">
        <div className="text-center space-y-4">
          <KibritciLogo size="lg" className="mx-auto h-14" />
          <span className="text-4xl animate-spin inline-block">⏳</span>
          <div className="space-y-1">
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
  if (dbStatus === 'error') {
    const errorMessage =
      typeof startupError === 'string'
        ? startupError
        : startupError?.message || "Kayıtlı verileriniz Firestore'da güvendedir. Bağlantı kurulamadı.";
    const errorStep =
      typeof startupError === 'string'
        ? 'Güvenlik oturumu'
        : startupError?.step || 'Bilinmiyor';
    const errorTechnical =
      typeof startupError === 'string' ? startupError : startupError?.technical;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8">
        <AlertCircle className="text-rose-400 mb-4" size={48} />
        <h1 className="text-lg font-bold mb-2">Veritabanı Bağlantı Hatası</h1>
        <p className="text-sm text-slate-400 text-center max-w-md mb-3">
          Kayıtlarınız silinmedi. Bu ekran geçmiş işlemleri yok etmez; yalnızca bu oturum veriyi okuyamadı.
        </p>
        <p className="text-sm text-slate-400 text-center max-w-md mb-6">{errorMessage}</p>
        <div className="w-full max-w-xl bg-slate-800/70 border border-slate-700 rounded-xl p-4 mb-5 space-y-2 text-xs">
          <p className="text-slate-300">
            <span className="font-bold text-amber-400">Sorun Adımı:</span> {errorStep}
          </p>
          {errorTechnical && (
            <p className="text-slate-400 break-all">
              <span className="font-bold text-rose-300">Teknik Detay:</span> {errorTechnical}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(LOGIN_NOTICE_KEY, ERP_DATA_SAFE_NOTICE);
                localStorage.removeItem('kibritci_portal_session');
              } catch {
                /* ignore */
              }
              void signOut(auth).finally(() => {
                setCurrentUser(null);
                setStartupError(null);
                setDbStatus('loading');
              });
            }}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-3 rounded-xl"
          >
            Çıkış yap ve yeniden giriş
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold px-6 py-3 rounded-xl"
          >
            <RefreshCw size={16} />
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }

  if (dbStatus === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8 select-none">
        <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
          <div className="space-y-3">
            <KibritciLogo size="xl" className="mx-auto h-16" />
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
                <span>⚡ BEKLEMEYİ ATLA (demo verisi yüklenmez)</span>
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

  const matchedU = findKullaniciByEmail(kullanicilar, currentUser?.email);
  const soforPortalUser = matchedU
    ? {
        ...currentUser,
        ...matchedU,
        email: currentUser?.email || matchedU.email,
        displayName: currentUser?.displayName,
        matchedPersonelId:
          matchedU.matchedPersonelId ||
          (matchedU.tcNo
            ? personeller.find((p) => String(p.tcNo || '').trim() === String(matchedU.tcNo).trim())?.id
            : undefined),
      }
    : currentUser;
  const userYetki = normalizeYetki(matchedU?.yetki);
  const emailLower = currentUser?.email?.toLowerCase();
  const isFounderAccount = emailLower === 'sametatak9@gmail.com';
  const isSecondaryAdmin = emailLower === SECONDARY_ADMIN_EMAIL;
  const isPrivilegedAdmin = isFounderAccount || isSecondaryAdmin;
  const canSeeUyelikAdmin = canAccessUyelikAdminPanel(userYetki, { isPrivilegedAdmin });
  const isIdariIsler = isIdariIslerRole(userYetki);
  const isYonetici = userYetki === 'YÖNETİCİ' || 
                     userYetki === 'KURUCU' ||
                     userYetki === 'PROJE_MÜDÜRÜ' ||
                     isPrivilegedAdmin || 
                     emailLower === 'santiye@kibritci.com';

  const hideSidebarAndTopbar = isStandaloneMobileRole(userYetki) && isMobileMode;

  const isActiveStandaloneFieldUser =
    matchedU?.durum === 'AKTİF' && isStandaloneMobileRole(userYetki) && !isYonetici;

  const isAllowedFormen = userYetki === 'FORMEN' || isYonetici;
  const isAllowedGuvenlik = userYetki === 'GÜVENLİK' || isYonetici;
  const isAllowedKampci = userYetki === 'KAMPÇI' || isYonetici;
  const isAllowedTesisatci = userYetki === 'TESİSATÇI' || isYonetici;
  const isAllowedMermerci = userYetki === 'MERMERCİ' || isYonetici;
  const isAllowedGoturu = userYetki === 'GÖTÜRÜ' || isYonetici;
  /** Şöför Mobil: yalnızca ŞÖFÖR/LOJİSTİK yetkisi (yönetici önizleme) */
  const isAllowedLojistik = isSoforYetki(userYetki) || isYonetici;
  const isAllowedDepocu = userYetki === 'DEPOCU' || isYonetici;
  const isTabRestricted =
    isPrivilegedAdmin && activeTab === 'yetki_verme'
      ? false
      : isTabRestrictedForUser(activeTab, userYetki, matchedU?.kisitliSayfalar);

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
            const homeTab = getRoleHomeTab(userYetki);
            if (homeTab) setActiveTab(homeTab);
            else setActiveTab('ana_sayfa');
          }} 
          className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold py-2.5 rounded-xl cursor-pointer transition shadow-lg"
        >
          {hideSidebarAndTopbar ? "Kendi Paneline Dön" : "Ana Sayfaya Dön"}
        </button>
      </div>
      
      <SoundProvider />
      <ContextMenuProvider />
      <KeyboardNavProvider />
      <ConfettiProvider />
      <EasterEggProvider />
      <ToastProvider />
      {/* CommandPalette ana kabukta mount edilir — burada çift dinleyici olmasın */}
    </div>
  );

  if (currentUser && isActiveStandaloneFieldUser) {
    if (userYetki === 'GÜVENLİK') {
      return (
        <GuvenlikScreen
          personeller={personeller}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          userYetki={matchedU?.yetki}
          isStandalone={true}
          addNotification={addNotification}
          satinAlmaTalepleri={satinAlmaTalepleri}
          irsaliyeler={irsaliyeler}
        />
      );
    }
    if (userYetki === 'KAMPÇI') {
      return (
        <KampciScreen
          kampOdalari={kampOdalari}
          setKampOdalari={setKampOdalariWithSync}
          kampKayitlari={kampKayitlari}
          setKampKayitlari={setKampKayitlariWithSync}
          reloadKampData={reloadKampData}
          kampYerleskeleri={kampYerleskeleri}
          kampKatlari={kampKatlari}
          personeller={personeller}
          setPersoneller={setPersonellerWithSync}
          cariKartlar={cariKartlar}
          setCariKartlar={setCariKartlarWithSync}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          stokKartlar={stokKartlar}
          faturalar={faturalar}
          setFaturalar={setFaturalarWithSync}
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          setCariIslemGecmisi={setCariIslemGecmisiWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (userYetki === 'TESİSATÇI') {
      return (
        <TesisatciMobilScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          cariKartlar={cariKartlar}
          faturalar={faturalar}
          setFaturalar={setFaturalarWithSync}
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          kampYerleskeleri={kampYerleskeleri}
          setCariKartlar={setCariKartlarWithSync}
          setCariIslemGecmisi={setCariIslemGecmisiWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (userYetki === 'MERMERCİ') {
      return (
        <MermerciMobilScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (userYetki === 'GÖTÜRÜ') {
      return (
        <SeramikMobilScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (isSoforYetki(userYetki)) {
      return (
        <LojistikScreen
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          satinAlmaTalepleri={satinAlmaTalepleri}
          araclar={araclar}
          setAraclar={setAraclarWithSync}
          aracKmLoglari={aracKmLoglari}
          setAracKmLoglari={setAracKmLoglariWithSync}
          currentUser={soforPortalUser}
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          addNotification={addNotification}
          onSignOut={handleSignOut}
          isStandalone={true}
        />
      );
    }
    if (userYetki === 'OPERATÖR') {
      return (
        <OperatorScreen
          araclar={araclar}
          personeller={personeller}
          cariKartlar={cariKartlar}
          operatorFaaliyetleri={operatorFaaliyetleri}
          setOperatorFaaliyetleri={setOperatorFaaliyetleriWithSync}
          taseronKesintiRaporlari={taseronKesintiRaporlari}
          setTaseronKesintiRaporlari={setTaseronKesintiRaporlariWithSync}
          setCariIslemGecmisi={setCariIslemGecmisiWithSync}
          currentUser={currentUser}
          addNotification={addNotification}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          onSignOut={handleSignOut}
          isStandalone={true}
        />
      );
    }
    if (userYetki === 'DEPOCU') {
      return (
        <DepocuScreen
          stokKartlar={stokKartlar}
          setStokKartlar={setStokKartlarWithSync}
          personeller={personeller}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
  }

  if (isMobileMode && currentUser) {
    const role = userYetki;
    // FORMEN çok sekmeli (Mobil + Faaliyeti Olan Personeller + …) — tam ekran kilitlenmez;
    // normal kabuk + sidebar ile faaliyet_personel vb. görünür.
    if (role === 'GÜVENLİK') {
      return (
        <GuvenlikScreen
          personeller={personeller}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          userYetki={matchedU?.yetki}
          isStandalone={true}
          addNotification={addNotification}
          satinAlmaTalepleri={satinAlmaTalepleri}
          irsaliyeler={irsaliyeler}
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
          reloadKampData={reloadKampData}
          kampYerleskeleri={kampYerleskeleri}
          kampKatlari={kampKatlari}
          personeller={personeller}
          setPersoneller={setPersonellerWithSync}
          cariKartlar={cariKartlar}
          setCariKartlar={setCariKartlarWithSync}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          stokKartlar={stokKartlar}
          faturalar={faturalar}
          setFaturalar={setFaturalarWithSync}
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          setCariIslemGecmisi={setCariIslemGecmisiWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (role === 'TESİSATÇI') {
      return (
        <TesisatciMobilScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          cariKartlar={cariKartlar}
          faturalar={faturalar}
          setFaturalar={setFaturalarWithSync}
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          kampYerleskeleri={kampYerleskeleri}
          setCariKartlar={setCariKartlarWithSync}
          setCariIslemGecmisi={setCariIslemGecmisiWithSync}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (role === 'MERMERCİ') {
      return (
        <MermerciMobilScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (role === 'GÖTÜRÜ') {
      return (
        <SeramikMobilScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isStandalone={true}
          addNotification={addNotification}
        />
      );
    }
    if (isSoforYetki(role)) {
      return (
        <LojistikScreen
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyelerWithSync}
          satinAlmaTalepleri={satinAlmaTalepleri}
          araclar={araclar}
          setAraclar={setAraclarWithSync}
          aracKmLoglari={aracKmLoglari}
          setAracKmLoglari={setAracKmLoglariWithSync}
          currentUser={soforPortalUser}
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
          addNotification={addNotification}
          onSignOut={handleSignOut}
          isStandalone={true}
        />
      );
    }
    if (role === 'OPERATÖR') {
      return (
        <OperatorScreen
          araclar={araclar}
          personeller={personeller}
          cariKartlar={cariKartlar}
          operatorFaaliyetleri={operatorFaaliyetleri}
          setOperatorFaaliyetleri={setOperatorFaaliyetleriWithSync}
          taseronKesintiRaporlari={taseronKesintiRaporlari}
          setTaseronKesintiRaporlari={setTaseronKesintiRaporlariWithSync}
          setCariIslemGecmisi={setCariIslemGecmisiWithSync}
          currentUser={currentUser}
          addNotification={addNotification}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalarWithSync}
          saveYoklamalarNow={saveYoklamalarNow}
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
          addNotification={addNotification}
        />
      );
    }

    // FORMEN / yönetici / idari / anahtarcı: mobilde de tam kabuk.
    const keepFullErpShell =
      isMobileDirect ||
      role === 'FORMEN' ||
      role === 'ANAHTARCI' ||
      isYonetici ||
      isIdariIsler ||
      !isMobileRole(role);

    if (!keepFullErpShell) {
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
    <div className="flex h-screen w-screen overflow-x-hidden bg-slate-100 text-slate-800 font-sans">
      
      {/* Sidebar - responsive custom figma menu */}
      {!hideSidebarAndTopbar && (
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={handleTabNavigation} 
          currentUser={currentUser} 
          onSignOut={handleSignOut} 
          onSignatureEdit={() => setShowSignatureModal(true)}
          isYonetici={isYonetici}
          userYetki={userYetki}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          kisitliSayfalar={sanitizeKisitliSayfalar(userYetki, matchedU?.kisitliSayfalar)}
          onToggleMobileMode={() => {
            // Tam ERP kabuğu (sidebar + Yoklama/Faaliyet/Saha); istatistik kabuğu sekmeleri yutmasın
            setIsMobileMode(true);
            setIsMobileDirect(true);
            localStorage.setItem('kibritci_mobile_mode', 'true');
            localStorage.setItem('kibritci_mobile_direct', 'true');
          }}
        />
      )}

      {/* Main Content Container wrapper Column */}
      <div className="flex h-screen bg-slate-50 font-sans overflow-hidden flex-1 flex-col">
      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-100/50 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-full transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <Suspense fallback={<ScreenLoader />}>
              <ProfilScreen 
                currentUser={currentUser}
                kullanicilar={kullanicilar}
                setKullanicilar={setKullanicilarWithSync}
                onSignOut={handleSignOut}
                isStandalone={false}
              />
            </Suspense>
          </div>
        </div>
      )}
        
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
            onNotificationClick={handleNotificationClick}
            onToggleMobileMode={() => {
              setIsMobileMode(true);
              setIsMobileDirect(true);
              localStorage.setItem('kibritci_mobile_mode', 'true');
              localStorage.setItem('kibritci_mobile_direct', 'true');
            }}
            onProfileClick={() => setIsProfileModalOpen(true)}
            pendingOnayCount={countChromePendingOnay({
              satinAlmaTalepleri,
              irsaliyeler,
              faturalar,
            })}
            onOpenOnayInbox={() => handleTabNavigation('onay_islemleri')}
          />
        )}

        {!hideSidebarAndTopbar && (
          <StatusStrip
            satinAlmaTalepleri={satinAlmaTalepleri}
            irsaliyeler={irsaliyeler}
            faturalar={faturalar}
            bildirimler={bildirimler}
            dbStatus={dbStatus}
            onNavigate={handleTabNavigation}
          />
        )}

        {authWriteWarning && (
          <div className="shrink-0 border-b border-rose-500/50 bg-rose-950/95 px-4 py-2.5 text-[11px] leading-relaxed text-rose-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold text-rose-200">Kayıt engeli:</span>{' '}
              {authWriteWarning}
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="shrink-0 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white cursor-pointer"
            >
              Çıkış / Yeniden Giriş
            </button>
          </div>
        )}

        {geminiApiAlert && !hideSidebarAndTopbar && isFounderAccount && (
          <div className="shrink-0 border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-[11px] leading-relaxed text-amber-100">
            <span className="font-bold text-amber-300">Yapay zeka API uyarısı:</span>{' '}
            <span className="whitespace-pre-line">{geminiApiAlert}</span>
          </div>
        )}

        {/* Dynamic Inner Screens Router wrapper */}
        <main ref={mainScrollRef} className="flex-1 overflow-auto relative bg-slate-50">
          
          {(() => {
            const matchedUser = findKullaniciByEmail(kullanicilar, currentUser?.email);
            const matchedYetki = normalizeYetki(matchedUser?.yetki);
            const currentEmail = currentUser?.email?.toLowerCase();
            const privileged = currentEmail === 'sametatak9@gmail.com' || currentEmail === SECONDARY_ADMIN_EMAIL;
            const hasActiveMobileRole = isMobileRole(matchedYetki) && isActivePortalDurum(matchedUser?.durum);
            const isBlocked =
              !privileged &&
              !hasActiveMobileRole &&
              (matchedUser?.durum === 'KISITLI' ||
                matchedUser?.durum === 'ONAY BEKLİYOR' ||
                matchedYetki === 'MİSAFİR');
            if (isBlocked) {
              const pending = matchedUser?.durum === 'ONAY BEKLİYOR';
              const isGuest = matchedYetki === 'MİSAFİR';
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
            <Suspense fallback={<ScreenLoader />}>
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
                  irsaliyeler={irsaliyeler}
                  faturalar={faturalar}
                  onNavigate={handleTabNavigation}
                  currentUser={currentUser}
                  stokKartlar={stokKartlar}
                  bildirimler={bildirimler}
                  dataReady={dashboardDataReady}
                />
              )}

              {activeTab === "admin" && (
                canSeeUyelikAdmin ? (
                  <AdminPanelScreen 
                    kullanicilar={kullanicilar}
                    setKullanicilar={setKullanicilarWithSync}
                    currentUser={currentUser}
                    personeller={personeller}
                    addNotification={addNotification}
                    yoklamalar={yoklamalar}
                    sahaFaaliyetleri={sahaFaaliyetleri}
                    kampKayitlari={kampKayitlari}
                    faturalar={faturalar}
                    uyelikOnly={isIdariIsler && !isPrivilegedAdmin}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "personel" && (
                <PersonelScreen 
                  personeller={personeller} 
                  setPersoneller={setPersonellerWithSync}
                  onPersonelDeleted={handlePersonelDeleted}
                  yoklamalar={yoklamalar}
                  saveYoklamalarNow={saveYoklamalarNow}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  kampKayitlari={kampKayitlari}
                  kampOdalari={kampOdalari}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                />
              )}

              {activeTab === "yoklama" && (
                <YoklamaScreen
                  personeller={personeller}
                  setPersoneller={setPersonellerWithSync}
                  yoklamalar={yoklamalar}
                  setYoklamalar={setYoklamalarWithSync}
                  saveYoklamalarNow={saveYoklamalarNow}
                  reloadYoklamalarFromServer={reloadYoklamalarFromServer}
                  addNotification={addNotification}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                  onOpenFaaliyetPersonel={() => handleTabNavigation('faaliyet_personel')}
                />
              )}

              {activeTab === "faaliyet_personel" && (
                <FaaliyetPersonelScreen
                  personeller={personeller}
                  yoklamalar={yoklamalar}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                  setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
                  saveSahaFaaliyetNow={saveSahaFaaliyetNow}
                  removeSahaFaaliyetNow={removeSahaFaaliyetNow}
                  currentUser={currentUser}
                  canAssignProgram={isAllowedFormen}
                />
              )}


              {activeTab === "maas" && (
                <MaasMerkeziScreen
                  subTab={maasSubTab}
                  setSubTab={setMaasSubTab}
                  isYonetici={isYonetici}
                  personeller={personeller}
                  yoklamalar={yoklamalar}
                  maasOdemeleri={maasOdemeleri}
                  setMaasOdemeleri={setMaasOdemeleriWithSync}
                  currentUser={currentUser}
                  initialMonth={payrollPeriod.month}
                  initialYear={payrollPeriod.year}
                  onPeriodChange={handlePayrollPeriodChange}
                  onSaveHesapTaslaklari={handleSaveMaasHesapTaslaklari}
                />
              )}

              {activeTab === "personel_izin" && (
                <PersonelIzinScreen
                  personeller={personeller}
                  currentUser={currentUser}
                  hazirTutanaklar={hazirTutanaklar}
                  setHazirTutanaklar={setHazirTutanaklarWithSync}
                  cariKartlar={cariKartlar}
                  stokKartlar={stokKartlar}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                />
              )}

              {activeTab === "satin_alma" && (
                <SatinAlmaScreen 
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  setSatinAlmaTalepleri={setSatinAlmaTalepleriWithSync}
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  faturalar={faturalar}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  setStokIslemGecmisi={setStokIslemGecmisiWithSync}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  kullanicilar={kullanicilar}
                  currentUser={currentUser}
                  addNotification={addNotification}
                  onOpenIrsaliyeFromSa={openIrsaliyeFromSatinAlma}
                />
              )}

              {activeTab === "siparis_formu" && (
                <SiparisFormuScreen
                  cariKartlar={cariKartlar}
                  stokKartlar={stokKartlar}
                  currentUser={currentUser}
                />
              )}

              {activeTab === "irsaliye_giris" && (
                <IrsaliyeGirisScreen 
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  faturalar={faturalar}
                  setFaturalar={setFaturalarWithSync}
                  evrakBaglantiGruplari={evrakBaglantiGruplari}
                  setEvrakBaglantiGruplari={setEvrakBaglantiGruplariWithSync}
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  setStokIslemGecmisi={setStokIslemGecmisiWithSync}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  currentUser={currentUser}
                  addNotification={addNotification}
                  prefillFromSa={irsaliyeSaPrefill}
                  onPrefillConsumed={() => setIrsaliyeSaPrefill(null)}
                  onOpenTCetveli={() => handleTabNavigation('t_cetveli')}
                />
              )}

              {activeTab === "t_cetveli" && (
                <TCetveliScreen
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  faturalar={faturalar}
                  setFaturalar={setFaturalarWithSync}
                  hazirTutanaklar={hazirTutanaklar}
                  setHazirTutanaklar={setHazirTutanaklarWithSync}
                  cariKartlar={cariKartlar}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                />
              )}

              {activeTab === "fatura_giris" && (
                <FaturaGirisScreen 
                  faturalar={faturalar}
                  setFaturalar={setFaturalarWithSync}
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  evrakBaglantiGruplari={evrakBaglantiGruplari}
                  setEvrakBaglantiGruplari={setEvrakBaglantiGruplariWithSync}
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  currentUser={currentUser}
                  addNotification={addNotification}
                />
              )}

              {activeTab === "taseron_kesinti" && (
                <TaseronKesintiScreen 
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  personeller={personeller}
                  setPersoneller={setPersonellerWithSync}
                  kampKayitlari={kampKayitlari}
                  setKampKayitlari={setKampKayitlariWithSync}
                  yoklamalar={yoklamalar}
                  saveYoklamalarNow={saveYoklamalarNow}
                  kampOdalari={kampOdalari}
                  operatorFaaliyetleri={operatorFaaliyetleri}
                  setOperatorFaaliyetleri={setOperatorFaaliyetleriWithSync}
                  hazirTutanaklar={hazirTutanaklar}
                  taseronKesintiRaporlari={taseronKesintiRaporlari}
                  setTaseronKesintiRaporlari={setTaseronKesintiRaporlariWithSync}
                  taseronEnerjiKayitlari={taseronEnerjiKayitlari}
                  setTaseronEnerjiKayitlari={setTaseronEnerjiKayitlariWithSync}
                  taseronYemekKayitlari={taseronYemekKayitlari}
                  setTaseronYemekKayitlari={setTaseronYemekKayitlariWithSync}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  addNotification={addNotification}
                  currentUser={currentUser}
                />
              )}

              {activeTab === "personel_kartlari" && (
                <PersonelKartlariScreen 
                  personeller={personeller}
                  yoklamalar={yoklamalar}
                  araclar={araclar}
                  kampKayitlari={kampKayitlari}
                  kampOdalari={kampOdalari}
                  hazirTutanaklar={hazirTutanaklar}
                  kasaHareketleri={kasaHareketleri}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                />
              )}

              {activeTab === "kasa" && (
                <KasaScreen 
                  kasaHareketleri={kasaHareketleri}
                  setKasaHareketleri={setKasaHareketleriWithSync}
                  deleteKasaHareketi={deleteKasaHareketi}
                  personeller={personeller}
                  yoklamalar={yoklamalar}
                />
              )}

              {activeTab === "cari_stok" && (
                <CariStokScreen
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  stokIslemGecmisi={stokIslemGecmisi}
                  setStokIslemGecmisi={setStokIslemGecmisiWithSync}
                  faturalar={faturalar}
                  setFaturalar={setFaturalarWithSync}
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyelerWithSync}
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  cariIslemGecmisi={cariIslemGecmisi}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  personeller={personeller}
                  setPersoneller={setPersonellerWithSync}
                />
              )}

              {/* Combined Idari Panels: arac, kamp, saha, tutanak */}
              {["arac", "kamp", "saha", "tutanak"].includes(activeTab) && (
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
                  reloadKampData={reloadKampData}
                  kampYerleskeleri={kampYerleskeleri}
                  kampKatlari={kampKatlari}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                  setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
                  programliFaaliyetler={programliFaaliyetler}
                  setProgramliFaaliyetler={setProgramliFaaliyetlerWithSync}
                  saveSahaFaaliyetNow={saveSahaFaaliyetNow}
                  removeSahaFaaliyetNow={removeSahaFaaliyetNow}
                  hazirTutanaklar={hazirTutanaklar}
                  setHazirTutanaklar={setHazirTutanaklarWithSync}
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  epostaGonderimleri={epostaGonderimleri}
                  setEpostaGonderimleri={setEpostaGonderimleriWithSync}
                  personeller={personeller}
                  setPersoneller={setPersonellerWithSync}
                  aracKmLoglari={aracKmLoglari}
                  setAracKmLoglari={setAracKmLoglariWithSync}
                  yoklamalar={yoklamalar}
                  setYoklamalar={setYoklamalarWithSync}
                  saveYoklamalarNow={saveYoklamalarNow}
                  kiralikKamyonPuantaj={kiralikKamyonPuantaj}
                  setKiralikKamyonPuantaj={setKiralikKamyonPuantajWithSync}
                  addNotification={addNotification}
                  currentUser={currentUser}
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
                  cariKartlar={cariKartlar}
                  setCariKartlar={setCariKartlarWithSync}
                  setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlarWithSync}
                  setStokIslemGecmisi={setStokIslemGecmisiWithSync}
                  personeller={personeller}
                  setPersoneller={setPersonellerWithSync}
                  kampKayitlari={kampKayitlari}
                  setKampKayitlari={setKampKayitlari}
                  kampOdalari={kampOdalari}
                  setKampOdalari={setKampOdalari}
                />
              )}

              {activeTab === "formen_ekrani" && (
                isAllowedFormen ? (
                  <FormenScreen 
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
                    sahaFaaliyetleri={sahaFaaliyetleri}
                    setSahaFaaliyetleri={setSahaFaaliyetleriWithSync}
                    saveSahaFaaliyetNow={saveSahaFaaliyetNow}
                    removeSahaFaaliyetNow={removeSahaFaaliyetNow}
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
                    satinAlmaTalepleri={satinAlmaTalepleri}
                    irsaliyeler={irsaliyeler}
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
                    reloadKampData={reloadKampData}
                    kampYerleskeleri={kampYerleskeleri}
                    kampKatlari={kampKatlari}
                    personeller={personeller}
                    setPersoneller={setPersonellerWithSync}
                    cariKartlar={cariKartlar}
                    setCariKartlar={setCariKartlarWithSync}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
                    stokKartlar={stokKartlar}
                    faturalar={faturalar}
                    setFaturalar={setFaturalarWithSync}
                    irsaliyeler={irsaliyeler}
                    setIrsaliyeler={setIrsaliyelerWithSync}
                    setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "tesisatci_ekrani" && (
                isAllowedTesisatci ? (
                  <TesisatciMobilScreen
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
                    cariKartlar={cariKartlar}
                    faturalar={faturalar}
                    setFaturalar={setFaturalarWithSync}
                    irsaliyeler={irsaliyeler}
                    setIrsaliyeler={setIrsaliyelerWithSync}
                    kampYerleskeleri={kampYerleskeleri}
                    setCariKartlar={setCariKartlarWithSync}
                    setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "mermerci_ekrani" && (
                isAllowedMermerci ? (
                  <MermerciMobilScreen
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
                    currentUser={currentUser}
                    onSignOut={handleSignOut}
                    addNotification={addNotification}
                  />
                ) : renderAccessDenied()
              )}

              {activeTab === "seramik_ekrani" && (
                isAllowedGoturu ? (
                  <SeramikMobilScreen
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
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
                    currentUser={soforPortalUser}
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
                    addNotification={addNotification}
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

              {activeTab === "proje_ilerleme" && (
                <ProjeIlerlemeScreen currentUser={currentUser} />
              )}

              {activeTab === "yetki_verme" && (
                isPrivilegedAdmin ? (
                  yetkiVermeUnlocked ? (
                    <YetkiVermeScreen 
                      kullanicilar={kullanicilar}
                      setKullanicilar={setKullanicilarWithSync}
                      currentUser={currentUser}
                      addNotification={addNotification}
                    />
                  ) : (
                    <div className="flex-grow flex items-center justify-center bg-slate-50 p-6">
                      <div className="bg-white border border-slate-200 rounded-3xl shadow-lg p-8 w-full max-w-sm space-y-6">
                        <div className="text-center space-y-2">
                          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          </div>
                          <h2 className="text-base font-black text-slate-900 uppercase tracking-wider">Erişim Şifresi</h2>
                          <p className="text-xs text-slate-500">Bu alan kurucu korumalıdır. Devam etmek için şifreyi girin.</p>
                        </div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (yetkiVermePasswordInput === '117270.Sametatak') {
                              setYetkiVermeUnlocked(true);
                              setYetkiVermePasswordError(false);
                              setYetkiVermePasswordInput('');
                            } else {
                              setYetkiVermePasswordError(true);
                              setYetkiVermePasswordInput('');
                            }
                          }}
                          className="space-y-4"
                        >
                          <div>
                            <input
                              type="password"
                              value={yetkiVermePasswordInput}
                              onChange={(e) => {
                                setYetkiVermePasswordInput(e.target.value);
                                setYetkiVermePasswordError(false);
                              }}
                              placeholder="Şifreyi girin..."
                              autoFocus
                              className={`w-full border rounded-xl py-2.5 px-4 text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none transition focus:border-slate-500 ${yetkiVermePasswordError ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
                            />
                            {yetkiVermePasswordError && (
                              <p className="text-xs text-red-600 font-bold mt-1.5 text-center">Hatalı şifre. Lütfen tekrar deneyin.</p>
                            )}
                          </div>
                          <button
                            type="submit"
                            className="w-full bg-slate-900 hover:bg-black text-white font-bold text-sm py-2.5 rounded-xl transition cursor-pointer"
                          >
                            Giriş
                          </button>
                        </form>
                      </div>
                    </div>
                  )
                ) : renderAccessDenied()
              )}

              {activeTab === "kibar_hakedis" && (
                  <KibarHakedisScreen
                    personeller={personeller}
                    yoklamalar={yoklamalar}
                    sahaFaaliyetleri={sahaFaaliyetleri}
                    programliFaaliyetler={programliFaaliyetler}
                    currentUser={currentUser}
                  />
              )}

              {activeTab === "operator" && (
                isYonetici || userYetki === 'OPERATÖR' ? (
                  <OperatorScreen
                    araclar={araclar}
                    personeller={personeller}
                    cariKartlar={cariKartlar}
                    operatorFaaliyetleri={operatorFaaliyetleri}
                    setOperatorFaaliyetleri={setOperatorFaaliyetleriWithSync}
                    taseronKesintiRaporlari={taseronKesintiRaporlari}
                    setTaseronKesintiRaporlari={setTaseronKesintiRaporlariWithSync}
                    setCariIslemGecmisi={setCariIslemGecmisiWithSync}
                    currentUser={currentUser}
                    addNotification={addNotification}
                    yoklamalar={yoklamalar}
                    setYoklamalar={setYoklamalarWithSync}
                    saveYoklamalarNow={saveYoklamalarNow}
                    onSignOut={handleSignOut}
                    isStandalone={hideSidebarAndTopbar}
                  />
                ) : renderAccessDenied()
              )}

            </>
            </Suspense>
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
                  <h3 className="font-display font-semibold text-sm">Üyelik Bilgileri Güncelle</h3>
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

      {/* Masaüstü hızlı menü — mevcut sekmeleri bozmadan ek navigasyon */}
      {!hideSidebarAndTopbar && (
        <CommandPalette onSelect={(tab) => handleTabNavigation(tab)} />
      )}
    </div>
  );
}

export default function AppRoot() {
  if (isPublicSiparisRoute()) {
    window.location.replace('/siparis.html');
    return null;
  }
  return <App />;
}
