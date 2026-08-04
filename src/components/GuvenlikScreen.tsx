import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldAlert, FileText, Users, Truck, UserCheck, Search, PlusCircle, Trash2, 
  Check, X, FileUp, Camera, Printer, Clock, AlertTriangle, Key, Download, ArrowRight, RefreshCw, Barcode,
  Archive, Calendar, Lock, ClipboardList, MessageCircle, Droplets, Fuel, Images
} from 'lucide-react';
import EvrakDuvariPanel, {
  type EvrakDuvariItem,
  isEvrakBekleyen,
} from './EvrakDuvariPanel';
import { Personel, Irsaliye, IrsaliyeItem, Fatura, MicirStabilizeFis, CariKart, StokKart, SatinAlmaTalebi } from '../types/erp';
import { db, cleanUndefined, ensureFirestoreAuth, withTimeout, saveDocument } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { fetchApiJson } from '../lib/apiClient';
import { collection, doc, setDoc, onSnapshot, addDoc, getDocs, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import {
  cariOneriReasonLabel,
  doubleCheckKapiMatch,
  formatKapiMatchLabel,
  suggestCariFromDb,
  suggestSatinAlmaForKapiEvrak,
  suggestStokFromDb,
  upsertKapiDraftIrsaliye,
  finalizeKapiIrsaliyeApproval,
} from '../lib/kapiIrsaliyeUtils';
import { resolveGuvenlikEvrakProvenance } from '../lib/evrakProvenance';
import { autoEnsureCari } from '../lib/evrakBatchImportUtils';
import {
  countPaketFotolar,
  createEmptyUploadPackage,
  createEmptyUploadKalem,
  GUVENLIK_FOTO_METOD_HINT,
  GUVENLIK_FOTO_METOD_LABEL,
  GuvenlikFotoMetod,
  GuvenlikFotoSlot,
  hasAnaFirmaUcFotograf,
  isLikelyImageUrl,
  pickPrimaryFotoUrl,
  formatEvrakGonderimLabel,
} from '../lib/guvenlikEvrakFotolar';
import { buildCariEvrakHistory } from '../lib/evrakCariStokSync';
import { getTaseronCariKartlar } from '../lib/taseronUtils';
import {
  buildLeanGuvenlikEvrakFotoFields,
  isPaketTooLargeForFirestore,
  prepareGuvenlikFotoPaketForSave,
} from '../lib/guvenlikFotoStorage';
import { CorporateReportLayout } from './CorporateReportLayout';
import { KibritciLogo } from './KibritciLogo';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { isTaseronPersonel } from '../lib/yoklamaUtils';
import {
  buildAracLoglariWhatsAppText,
  buildPersonelLoglariWhatsAppText,
  buildSuTankeriLoglariWhatsAppText,
  buildZiyaretciWhatsAppText,
  buildNobetGunlukRaporHtml,
  canAccessGuvenlikScreen,
  canTakeAkvizyonYoklama,
  collectNobetGunlukFotograflar,
  filterGuvenlikLogsByTarih,
  filterNobetAracZiyaretLoglari,
  filterNobetEvrakLoglari,
  filterNobetPersonelLoglari,
  firmaEtiketi,
  isAkvizyonPersonel,
  isPersonelActiveOnDate,
  openWhatsAppText,
  buildAkvizyonYoklamaReportHtml,
  resolveNobetArsivFotograflar,
  NobetVardiyaTipi,
} from '../lib/guvenlikHelpers';
import { GuvenlikTabDateBar } from './GuvenlikTabDateBar';
import {
  GuvenlikDuzenleKind,
  GuvenlikKayitDuzenleModal,
} from './GuvenlikKayitDuzenleModal';
import { normalizeDateKey, todayDateKey, formatDateLabelTr } from '../lib/dateKeyUtils';
import {
  AKVIZYON_NOBET_KAPANIS_SAAT,
  buildAkvizyonOtomatikKapanisPayload,
  isAkvizyonNobetKapanisZamaniGecti,
  isAkvizyonNobetKilitli,
  istanbulTodayKey,
  shouldAutoCloseAkvizyonNobet,
  type AkvizyonYoklamaDoc,
} from '../lib/akvizyonNobetAutoArchive';
import {
  ENTO_MADEN_UNVAN,
  formatMicirMiktarLabel,
  kgToTon,
  malzemeTipiLabel,
  MicirMalzemeTipi,
  normalizeMicirMalzemeTipi,
  resolveMicirKiloKg,
} from '../lib/micirUtils';
import {
  approveMicirFis,
  buildMicirKalemler,
  findMatchingMicirSatinAlma,
  isMicirFisPending,
  rejectMicirFis,
} from '../lib/micirOnayUtils';
import { YILDIRIM_TANKER_UNVAN } from '../lib/yildirimTankerUtils';
import { isFounderEmail } from '../lib/roleClaims';

interface GuvenlikScreenProps {
  personeller: Personel[];
  currentUser: any;
  onSignOut?: () => void;
  userYetki?: string;
  isStandalone?: boolean;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
}

export const GuvenlikScreen: React.FC<GuvenlikScreenProps> = ({
  personeller,
  currentUser,
  onSignOut,
  userYetki,
  isStandalone = false,
  addNotification,
  satinAlmaTalepleri: satinAlmaProp = [],
  irsaliyeler: irsaliyelerProp = [],
}) => {
  const [activeTab, setActiveTab] = useState<'irsaliye' | 'personel' | 'arac' | 'su_tankeri' | 'vidanjor' | 'petrol_tankeri' | 'mici_stabilize' | 'ziyaretci' | 'nobet_arsivi' | 'akvizyon_yoklama' | 'evrak_galerisi'>('irsaliye');
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  const [showGecmisKayitlar, setShowGecmisKayitlar] = useState(false);
  useEffect(() => {
    setShowGecmisKayitlar(false);
  }, [activeTab]);
  const [selectedPersonelLogIds, setSelectedPersonelLogIds] = useState<string[]>([]);
  const [selectedAracLogIds, setSelectedAracLogIds] = useState<string[]>([]);
  const [selectedSuTankeriLogIds, setSelectedSuTankeriLogIds] = useState<string[]>([]);
  
  // ─────────────────────────────────────────────────────────────
  // 📄 1. RE-DESIGNED EVRAK GİRİŞ STATE
  // ─────────────────────────────────────────────────────────────
  const [uploadQueue, setUploadQueue] = useState<any[]>([]);
  const [loadingIrsaliye, setLoadingIrsaliye] = useState(false);
  const sendInFlightRef = useRef(false);
  const [gelenEvraklar, setGelenEvraklar] = useState<any[]>([]);
  const [cariKartlarLive, setCariKartlarLive] = useState<CariKart[]>([]);
  const [stokKartlarLive, setStokKartlarLive] = useState<StokKart[]>([]);

  // Search & Filter States
  const [docSearch, setDocSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'HEPSİ' | 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDİLDİ'>('HEPSİ');
  const [typeFilter, setTypeFilter] = useState<'HEPSİ' | 'FATURA' | 'İRSALİYE' | 'MAKBUZ' | 'GENEL_EVRAK'>('HEPSİ');

  // Edit Mode States
  const [editingEvrak, setEditingEvrak] = useState<any | null>(null);
  const [editEvrakTuru, setEditEvrakTuru] = useState<'FATURA' | 'İRSALİYE' | 'MAKBUZ' | 'GENEL_EVRAK'>('İRSALİYE');
  const [editAciklama, setEditAciklama] = useState('');
  const [editEvrakNo, setEditEvrakNo] = useState('');
  const [editEvrakFirma, setEditEvrakFirma] = useState('');
  const [editEvrakTarih, setEditEvrakTarih] = useState('');
  const [editEvrakSaat, setEditEvrakSaat] = useState('');
  const [editCariKartId, setEditCariKartId] = useState('');
  const [editKalemler, setEditKalemler] = useState<any[]>([{ id: 'ek_1', urunAdi: '', miktar: '', birim: 'KG' }]);
  const [editingKayit, setEditingKayit] = useState<{
    kind: GuvenlikDuzenleKind;
    record: any;
    tankerLabel?: string;
  } | null>(null);

  const usableKalemler = (list: any[] | null | undefined) =>
    (Array.isArray(list) ? list : []).filter(
      (k) =>
        String(k?.urunAdi || '').trim() &&
        Number.isFinite(Number(String(k?.miktar ?? '').replace(',', '.'))) &&
        Number(String(k?.miktar ?? '').replace(',', '.')) > 0
    );

  const handleAddFotosToPackage = (
    packageId: string,
    metod: GuvenlikFotoMetod,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    void (async () => {
      const slots: GuvenlikFotoSlot[] = [];
      for (const file of files) {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        let displayBase64 = rawBase64;
        if (file.type.startsWith('image/')) {
          try {
            displayBase64 = await compressImage(rawBase64, 640, 640, 0.5, 4000);
          } catch (err) {
            console.error('Image compression failed, using original', err);
          }
        } else if (
          file.type.includes('pdf') ||
          rawBase64.startsWith('data:application/pdf')
        ) {
          // Büyük PDF kapı kaydını kilitler — reddet, fotoğraf iste
          if (rawBase64.length > 140_000) {
            alert(
              `"${file.name}" PDF’si çok büyük. Lütfen belgeyi fotoğraf olarak çekip yükleyin.`
            );
            continue;
          }
        }
        slots.push({
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: displayBase64,
          fileName: file.name,
          fileType: file.type,
          metod,
        });
      }
      if (!slots.length) return;
      setUploadQueue((prev) =>
        prev.map((pkg) => {
          if (pkg.id !== packageId) return pkg;
          const next = { ...pkg };
          if (metod === 'KALEM') next.kalemFotolar = [...(pkg.kalemFotolar || []), ...slots];
          if (metod === 'FIRMA') next.firmaFotolar = [...(pkg.firmaFotolar || []), ...slots];
          if (metod === 'FATURA') next.faturaFotolar = [...(pkg.faturaFotolar || []), ...slots];
          return next;
        })
      );
    })();
    e.target.value = '';
  };

  const handleRemoveFotoFromPackage = (
    packageId: string,
    metod: GuvenlikFotoMetod,
    fotoId: string
  ) => {
    setUploadQueue((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        const next = { ...pkg };
        if (metod === 'KALEM') next.kalemFotolar = (pkg.kalemFotolar || []).filter((f: GuvenlikFotoSlot) => f.id !== fotoId);
        if (metod === 'FIRMA') next.firmaFotolar = (pkg.firmaFotolar || []).filter((f: GuvenlikFotoSlot) => f.id !== fotoId);
        if (metod === 'FATURA') next.faturaFotolar = (pkg.faturaFotolar || []).filter((f: GuvenlikFotoSlot) => f.id !== fotoId);
        return next;
      })
    );
  };

  const handleNewUploadPackage = () => {
    setUploadQueue((prev) => [...prev, createEmptyUploadPackage()]);
  };

  // Toplu seçim: yeni paket açıp kalem yuvasına koyar (3 yöntemli paketlerle uyumlu)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files) as File[];
    void (async () => {
      const slots: GuvenlikFotoSlot[] = [];
      for (const file of files) {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        let displayBase64 = rawBase64;
        if (file.type.startsWith('image/')) {
          try {
            displayBase64 = await compressImage(rawBase64, 640, 640, 0.5, 4000);
          } catch {
            /* keep original */
          }
        } else if (
          file.type.includes('pdf') ||
          rawBase64.startsWith('data:application/pdf')
        ) {
          if (rawBase64.length > 140_000) {
            alert(
              `"${file.name}" PDF’si çok büyük. Lütfen belgeyi fotoğraf olarak çekip yükleyin.`
            );
            continue;
          }
        }
        slots.push({
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: displayBase64,
          fileName: file.name,
          fileType: file.type,
          metod: 'KALEM',
        });
      }
      setUploadQueue((prev) => [
        ...prev,
        { ...createEmptyUploadPackage(), kalemFotolar: slots },
      ]);
    })();
    e.target.value = '';
  };

  // ─────────────────────────────────────────────────────────────
  // 👥 2. PERSONEL GİRİŞ-ÇIKIŞ STATE & LISTS
  // ─────────────────────────────────────────────────────────────
  const [personelSearch, setPersonelSearch] = useState('');

  const [personelLoglar, setPersonelLoglar] = useState<any[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 🚛 3. ARAÇ GİRİŞ-ÇIKIŞ STATE & LISTS
  // ─────────────────────────────────────────────────────────────
  const [plaka, setPlaka] = useState('');
  const [hizliPlakaQ, setHizliPlakaQ] = useState('');
  const [aracTipi, setAracTipi] = useState('Hazır Beton Mikseri');
  const [aracFirma, setAracFirma] = useState('');
  const [yukDurumu, setYukDurumu] = useState('Dolu');
  const [surucuAdi, setSurucuAdi] = useState('');
  const [aracAciklama, setAracAciklama] = useState('');
  const [iceridekiAraclar, setIceridekiAraclar] = useState<any[]>([]);
  const [aracGecmisLoglar, setAracGecmisLoglar] = useState<any[]>([]);

  // ─────────────────────────────────────────────────────────────
  // 💧 TANKER/KONTROL GİRİŞ-ÇIKIŞ (Su Tankeri, Vidanjör, Petrol Tankeri)
  // ─────────────────────────────────────────────────────────────
  const [stPlaka, setStPlaka] = useState('');
  const [stFirma, setStFirma] = useState('');
  const [stSurucu, setStSurucu] = useState('');
  const [stMiktar, setStMiktar] = useState('');
  const [stAciklama, setStAciklama] = useState('');
  const [stIrsaliyeNo, setStIrsaliyeNo] = useState('');
  const [stMalzemeTipi, setStMalzemeTipi] = useState<MicirMalzemeTipi>('MICIR');
  /** Mıcır/stabilize irsaliye kilosu (kg) — tonaj = kg/1000 */
  const [stKiloKg, setStKiloKg] = useState('');
  const [tankerFotoUrl, setTankerFotoUrl] = useState('');
  const [tankerFileName, setTankerFileName] = useState('');
  const [micirArama, setMicirArama] = useState('');
  const [micirTumKayitlar, setMicirTumKayitlar] = useState<any[]>([]);
  
  const [iceridekiSuTankerleri, setIceridekiSuTankerleri] = useState<any[]>([]);
  const [suTankeriGecmisLoglar, setSuTankeriGecmisLoglar] = useState<any[]>([]);
  const [iceridekiVidanjorler, setIceridekiVidanjorler] = useState<any[]>([]);
  const [vidanjorGecmisLoglar, setVidanjorGecmisLoglar] = useState<any[]>([]);
  const [iceridekiPetrolTankerleri, setIceridekiPetrolTankerleri] = useState<any[]>([]);
  const [petrolTankeriGecmisLoglar, setPetrolTankeriGecmisLoglar] = useState<any[]>([]);
  const [iceridekiMiciStabilize, setIceridekiMiciStabilize] = useState<any[]>([]);
  const [miciStabilizeGecmisLoglar, setMiciStabilizeGecmisLoglar] = useState<any[]>([]);

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
  const [selectedVardiya, setSelectedVardiya] = useState<NobetVardiyaTipi>('TUM_GUN');

  // Akvizyon States
  const [akvizyonYoklamaMap, setAkvizyonYoklamaMap] = useState<Record<string, 'Geldi' | 'Gelmedi'>>({});
  const [akvizyonArchives, setAkvizyonArchives] = useState<any[]>([]);
  const [selectedAkvizyonArchive, setSelectedAkvizyonArchive] = useState<any | null>(null);
  const [selectedAkvizyonPersonel, setSelectedAkvizyonPersonel] = useState<Personel | null>(null);
  const [loadingAkvizyonYoklama, setLoadingAkvizyonYoklama] = useState(false);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [islemTarihi, setIslemTarihi] = useState(new Date().toISOString().split('T')[0]);
  const getIslemZamani = () => { 
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${islemTarihi}T${hours}:${minutes}:${seconds}.000Z`; 
  };

  const filteredPersonel = useMemo(() => {
    const q = personelSearch.toLowerCase();
    return (personeller || []).filter(p => {
      if (!isPersonelActiveOnDate(p, islemTarihi)) return false;
      return (
        (p.ad || '').toLowerCase().includes(q) ||
        (p.soyad || '').toLowerCase().includes(q) ||
        (p.tcNo || '').includes(q) ||
        (p.gorev || '').toLowerCase().includes(q) ||
        (p.firmaAdi || '').toLowerCase().includes(q) ||
        ((p as any).calistigiFirma || '').toLowerCase().includes(q)
      );
    });
  }, [personeller, personelSearch, islemTarihi]);

  const akvizyonPersoneller = useMemo(() => {
    return (personeller || []).filter(
      (p) => isAkvizyonPersonel(p) && isPersonelActiveOnDate(p, islemTarihi)
    );
  }, [personeller, islemTarihi]);

  const canSaveAkvizyonYoklama = canTakeAkvizyonYoklama(userYetki, currentUser?.email);

  const seciliGunAkvizyonDoc = useMemo(
    () =>
      (akvizyonArchives.find((a) => normalizeDateKey(a.tarih) === normalizeDateKey(islemTarihi)) ||
        null) as AkvizyonYoklamaDoc | null,
    [akvizyonArchives, islemTarihi]
  );

  const akvizyonNobetKilitli = useMemo(() => {
    if (isAkvizyonNobetKilitli(seciliGunAkvizyonDoc)) return true;
    return isAkvizyonNobetKapanisZamaniGecti(normalizeDateKey(islemTarihi) || islemTarihi);
  }, [seciliGunAkvizyonDoc, islemTarihi]);

  const canEditAkvizyonYoklama = canSaveAkvizyonYoklama && !akvizyonNobetKilitli;

  const autoCloseAkvizyonRunning = useRef(false);

  const runAkvizyonOtomatikKapanis = async (opts?: { silent?: boolean }) => {
    const tarih = istanbulTodayKey();
    const existing = (akvizyonArchives.find((a) => a.tarih === tarih) || null) as AkvizyonYoklamaDoc | null;
    if (!shouldAutoCloseAkvizyonNobet(tarih, existing)) return false;
    if (autoCloseAkvizyonRunning.current) return false;
    autoCloseAkvizyonRunning.current = true;
    try {
      const personelIds = (personeller || [])
        .filter((p) => isAkvizyonPersonel(p) && isPersonelActiveOnDate(p, tarih))
        .map((p) => p.id);
      const payload = buildAkvizyonOtomatikKapanisPayload({
        tarih,
        personelIds,
        existing,
        kaydeden: currentUser?.email || 'sistem_otomatik',
      });
      await setDoc(doc(db, 'akvizyonYoklamalari', tarih), payload, { merge: true });
      await setDoc(
        doc(db, 'akvizyonNobetArsivleri', tarih),
        {
          ...payload,
          arsivTipi: 'AKVIZYON_GRUP_NOBET',
          personelSayisi: personelIds.length,
          geldiSayisi: Object.values(payload.yoklama || {}).filter((v) => v === 'Geldi').length,
          gelmediSayisi: Object.values(payload.yoklama || {}).filter((v) => v === 'Gelmedi').length,
        },
        { merge: true }
      );
      if (!opts?.silent) {
        showStatus(
          'success',
          `Akvizyon grup nöbeti saat ${AKVIZYON_NOBET_KAPANIS_SAAT}:00'da otomatik kapatılıp arşivlendi.`
        );
      }
      if (addNotification) {
        addNotification(
          `${tarih} Akvizyon grup nöbeti otomatik kapatıldı ve arşivlendi (saat ${AKVIZYON_NOBET_KAPANIS_SAAT}:00).`
        );
      }
      return true;
    } catch (err) {
      console.error('Akvizyon otomatik kapanış hatası:', err);
      return false;
    } finally {
      autoCloseAkvizyonRunning.current = false;
    }
  };

  useEffect(() => {
    void runAkvizyonOtomatikKapanis({ silent: true });
    const timer = window.setInterval(() => {
      void runAkvizyonOtomatikKapanis({ silent: true });
    }, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [akvizyonArchives, personeller]);

  const handleSaveAkvizyonYoklama = async () => {
    if (!canSaveAkvizyonYoklama) {
      alert('Hata: Akvizyon yoklama kaydı yalnızca Güvenlik, Kurucu ve Yönetici yetkileriyle yapılabilir.');
      return;
    }
    if (akvizyonNobetKilitli) {
      alert(
        `Bu günün Akvizyon grup nöbeti kilitli. Saat ${AKVIZYON_NOBET_KAPANIS_SAAT}:00 sonrası otomatik arşivlenir / düzenlenemez.`
      );
      return;
    }
    setLoadingAkvizyonYoklama(true);
    try {
      const finalMap = { ...akvizyonYoklamaMap };
      akvizyonPersoneller.forEach(p => {
        if (!finalMap[p.id]) {
          finalMap[p.id] = 'Gelmedi';
        }
      });

      await setDoc(doc(db, 'akvizyonYoklamalari', islemTarihi), {
        tarih: islemTarihi,
        kayitZamani: getIslemZamani(),
        kaydeden: currentUser?.email,
        yoklama: finalMap,
        kilitli: false,
        otomatikKapanis: false,
      });

      if (addNotification) {
        addNotification(`Akvizyon Taşeron firmasının ${islemTarihi} tarihli yoklaması kaydedildi.`);
      }
      showStatus('success', 'Akvizyon yoklama verisi kaydedildi ve arşivlendi!');
    } catch (err: any) {
      console.error(err);
      showStatus('error', 'Yoklama kaydedilemedi: ' + err.message);
    } finally {
      setLoadingAkvizyonYoklama(false);
    }
  };

  useEffect(() => {
    const existing = akvizyonArchives.find(a => a.tarih === islemTarihi);
    if (existing && existing.yoklama) {
      setAkvizyonYoklamaMap(existing.yoklama);
    } else {
      setAkvizyonYoklamaMap({});
    }
  }, [islemTarihi, akvizyonArchives]);

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

    // 2b. Unified tanker logları (Su, Vidanjör, Petrol Tankeri)
    const stColl = collection(db, 'guvenlikTankerLoglari');
    const unsubSt = onSnapshot(stColl, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.girisZamani).getTime() - new Date(a.girisZamani).getTime());
      
      // Su Tankeri
      const suList = list.filter(x => x.tip === 'SU_TANKERI');
      setIceridekiSuTankerleri(suList.filter(x => x.durum === 'İÇERİDE'));
      setSuTankeriGecmisLoglar(suList.filter(x => x.durum === 'ÇIKTI'));

      // Vidanjör
      const vidList = list.filter(x => x.tip === 'VIDANJOR');
      setIceridekiVidanjorler(vidList.filter(x => x.durum === 'İÇERİDE'));
      setVidanjorGecmisLoglar(vidList.filter(x => x.durum === 'ÇIKTI'));

      // Petrol Tankeri
      const petList = list.filter(x => x.tip === 'PETROL_TANKERI');
      setIceridekiPetrolTankerleri(petList.filter(x => x.durum === 'İÇERİDE'));
      setPetrolTankeriGecmisLoglar(petList.filter(x => x.durum === 'ÇIKTI'));

      // Mıcır & Stabilize
      const micirList = list.filter(x => x.tip === 'MICIR_STABILIZE');
      setIceridekiMiciStabilize(micirList.filter(x => x.durum === 'İÇERİDE'));
      setMiciStabilizeGecmisLoglar(micirList.filter(x => x.durum === 'ÇIKTI'));
      setMicirTumKayitlar(
        [...micirList].sort((a, b) =>
          String(b.girisZamani || b.islemTarihi || '').localeCompare(
            String(a.girisZamani || a.islemTarihi || '')
          )
        )
      );
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

    // 4b. Cari / stok — kapı irsaliye AI eşleştirmesi için
    const unsubCari = onSnapshot(collection(db, 'cariKartlar'), (snap) => {
      const list: CariKart[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setCariKartlarLive(list);
    });
    const unsubStok = onSnapshot(collection(db, 'stokKartlar'), (snap) => {
      const list: StokKart[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setStokKartlarLive(list);
    });

    // 5. Nöbet Arşivleri
    const nobetColl = collection(db, 'guvenlikNobetArsivleri');
    const unsubNobet = onSnapshot(nobetColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.kayitZamani).getTime() - new Date(a.kayitZamani).getTime());
      setNobetArsivleri(list);
    });

    // 6. Akvizyon Yoklama Arşivleri
    const akvizyonColl = collection(db, 'akvizyonYoklamalari');
    const unsubAkvizyon = onSnapshot(akvizyonColl, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => b.tarih.localeCompare(a.tarih));
      setAkvizyonArchives(list);
    });

    return () => {
      unsubPLog();
      unsubArac();
      unsubSt();
      unsubViz();
      unsubEvrak();
      unsubCari();
      unsubStok();
      unsubNobet();
      unsubAkvizyon();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 💾 EVRAK GÖNDERİM EVENTLERİ
  // ─────────────────────────────────────────────────────────────
  const triggerBackgroundAiParsing = async (
    docId: string,
    fotoUrl: string,
    evrakTuru: string,
    hints?: {
      firmaHint?: string;
      cariKartId?: string;
      saId?: string;
      kalemFotoUrl?: string;
      firmaFotoUrl?: string;
      faturaFotoUrl?: string;
    }
  ) => {
    let docTypeParam = 'general';
    if (evrakTuru === 'FATURA') docTypeParam = 'fatura';
    if (evrakTuru === 'İRSALİYE') docTypeParam = 'irsaliye';
    if (evrakTuru === 'MAKBUZ') docTypeParam = 'makbuz';

    if (docTypeParam === 'general') return;

    const parseSingleFoto = async (url: string, docType: string) => {
      const { toAiParsePayload } = await import('../lib/guvenlikFotoStorage');
      const payload = await toAiParsePayload(url);
      if (!payload) return null;
      try {
        const response: any = await fetchApiJson('/api/parse-legacy-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: payload.fileBase64,
            mimeType: payload.mimeType,
            docType,
          }),
        });
        if (response && !response.error) {
          // API { success, data } veya düz gövde dönebilir
          return response.data ?? response;
        }
      } catch (err) {
        console.error('Tek foto YZ parse hatası:', err);
      }
      return null;
    };

    try {
      await updateDoc(doc(db, 'guvenlikGelenEvraklar', docId), {
        aiStatus: 'PARSING'
      });

      // Elle girilen firma/kalem/no — YZ boş okursa silmesin
      let existing: Record<string, any> = {};
      try {
        const snap = await getDoc(doc(db, 'guvenlikGelenEvraklar', docId));
        if (snap.exists()) existing = snap.data() as Record<string, any>;
      } catch {
        /* ignore */
      }
      const existingKalemler = usableKalemler(existing.kalemler);
      const hasManualKalem = existingKalemler.length > 0;
      const existingFirma = String(hints?.firmaHint || existing.firma || '').trim();
      const existingNo = String(existing.evrakNo || '').trim();
      const existingCariId = String(hints?.cariKartId || existing.cariKartId || '').trim();

      // 3 yöntem: firma foto → unvan, kalem foto → kalemler, fatura foto → mali alanlar
      const firmaUrl = hints?.firmaFotoUrl || fotoUrl;
      const kalemUrl = hints?.kalemFotoUrl || fotoUrl;
      const faturaUrl = hints?.faturaFotoUrl || fotoUrl;

      let parsed: any = null;
      if (evrakTuru === 'FATURA') {
        parsed = (await parseSingleFoto(faturaUrl, 'fatura')) || (await parseSingleFoto(fotoUrl, 'fatura'));
      } else if (evrakTuru === 'İRSALİYE') {
        const parsedFirma =
          firmaUrl && firmaUrl !== kalemUrl
            ? await parseSingleFoto(firmaUrl, 'irsaliye')
            : null;
        const parsedKalem = await parseSingleFoto(kalemUrl || fotoUrl, 'irsaliye');
        const parsedFaturaExtra =
          faturaUrl && faturaUrl !== kalemUrl && faturaUrl !== firmaUrl
            ? await parseSingleFoto(faturaUrl, 'fatura')
            : null;
        parsed = {
          ...(parsedKalem || {}),
          firma:
            existingFirma ||
            parsedFirma?.firma ||
            parsedKalem?.firma ||
            parsedFaturaExtra?.cariUnvan ||
            '',
          irsaliyeNo: existingNo || parsedKalem?.irsaliyeNo || parsedFirma?.irsaliyeNo || '',
          tarih: parsedKalem?.tarih || parsedFirma?.tarih || existing.tarih || '',
          kalemler: hasManualKalem
            ? existingKalemler
            : parsedKalem?.kalemler?.length
              ? parsedKalem.kalemler
              : parsedFirma?.kalemler || [],
          _multiFoto: true,
          _manualKalemKorundu: hasManualKalem,
        };
      } else if (evrakTuru === 'MAKBUZ') {
        parsed = (await parseSingleFoto(firmaUrl || fotoUrl, 'makbuz')) || (await parseSingleFoto(fotoUrl, 'makbuz'));
      }

      const response = parsed;

      if (response && !response.error) {
        const updates: any = {
          aiParsed: true,
          aiStatus: 'SUCCESS',
          aiMultiFoto: Boolean(response._multiFoto),
          aiManualKorundu: Boolean(response._manualKalemKorundu),
        };

        if (evrakTuru === 'FATURA') {
          updates.evrakNo = existingNo || parsed.faturaNo || '';
          updates.firma = existingFirma || parsed.cariUnvan || '';
          updates.tarih = parsed.tarih || existing.tarih || '';
          updates.toplamTutar = parsed.toplamTutar || 0;
          updates.kdvTutar = parsed.kdvTutar || 0;
          updates.genelToplam = parsed.genelToplam || 0;
          const aiKalem = usableKalemler(parsed.kalemler);
          updates.kalemler = hasManualKalem
            ? existingKalemler
            : aiKalem.length
              ? aiKalem
              : existing.kalemler || [];
          if (existingCariId) {
            updates.cariKartId = existingCariId;
            const c = cariKartlarLive.find((x) => x.id === existingCariId);
            if (c) updates.firma = c.unvan;
          } else {
            const cariOn = suggestCariFromDb(updates.firma, cariKartlarLive, 1)[0];
            if (cariOn) {
              updates.cariKartId = cariOn.id;
              updates.firma = cariOn.unvan;
              updates.cariOneriler = [cariOn];
            } else {
              updates.cariOneriler = suggestCariFromDb(updates.firma, cariKartlarLive, 5);
            }
          }
        } else if (evrakTuru === 'İRSALİYE') {
          updates.evrakNo = existingNo || parsed.irsaliyeNo || '';
          updates.firma = existingFirma || parsed.firma || '';
          updates.tarih = parsed.tarih || existing.tarih || '';
          const aiKalem = usableKalemler(parsed.kalemler);
          updates.kalemler = hasManualKalem
            ? existingKalemler
            : aiKalem.length
              ? aiKalem
              : existing.kalemler || [];
          if (existing.plaka) updates.plaka = existing.plaka;

          try {
            const [cariSnap, stokSnap] = await Promise.all([
              getDocs(collection(db, 'cariKartlar')),
              getDocs(collection(db, 'stokKartlar')),
            ]);
            const cariler: CariKart[] = [];
            cariSnap.forEach((d) => cariler.push({ id: d.id, ...(d.data() as any) }));
            const stoklar: StokKart[] = [];
            stokSnap.forEach((d) => stoklar.push({ id: d.id, ...(d.data() as any) }));
            const liveCari = cariler.length ? cariler : cariKartlarLive;
            const liveStok = stoklar.length ? stoklar : stokKartlarLive;

            let firmaForMatch = updates.firma;
            if (existingCariId) {
              const picked = liveCari.find((c) => c.id === existingCariId);
              if (picked) {
                firmaForMatch = picked.unvan;
                updates.cariKartId = picked.id;
              }
            }

            const { irsaliye, summary } = await upsertKapiDraftIrsaliye({
              guvenlikEvrakId: docId,
              firma: firmaForMatch,
              irsaliyeNo: updates.evrakNo || docId,
              tarih: updates.tarih || new Date().toISOString().split('T')[0],
              fotoUrl,
              kalemler: updates.kalemler,
              cariKartlar: liveCari,
              stokKartlar: liveStok,
              kaydeden: currentUser?.email || 'nobetci_guvenlik',
              saId: hints?.saId || existing.saId || undefined,
              satinAlmaTalepleri: satinAlmaProp,
              irsaliyeler: irsaliyelerProp,
            });
            updates.irsaliyeId = irsaliye.id;
            updates.cariKartId = summary.cariKartId || updates.cariKartId || '';
            updates.matchSummary = summary;
            // Elle kalem varsa stok eşleşmiş haliyle tut; yoksa AI/taslak
            updates.kalemler = hasManualKalem
              ? irsaliye.kalemler?.length
                ? irsaliye.kalemler
                : existingKalemler
              : irsaliye.kalemler;
            if (hints?.saId || existing.saId) updates.saId = hints?.saId || existing.saId;
            if (summary.cariUnvan) updates.firma = summary.cariUnvan;

            if (!summary.cariMatched) {
              updates.cariOneriler = suggestCariFromDb(updates.firma || parsed.firma || '', liveCari, 5);
            } else {
              updates.cariOneriler = [];
            }
            updates.stokOneriler = (updates.kalemler || [])
              .filter((k: any) => !k.stokKartId)
              .slice(0, 4)
              .flatMap((k: any) =>
                suggestStokFromDb(k.urunAdi, liveStok, 1).map((s) => ({
                  ...s,
                  kalemAdi: k.urunAdi,
                }))
              );

            const elleNot = hasManualKalem ? ' · kalemler güvenlik tarafından girildi' : '';
            updates.aciklama = `Kapı irsaliye girişi · ${formatKapiMatchLabel(summary)}${elleNot} (yönetici onayı bekleniyor)`;
          } catch (matchErr) {
            console.error('Kapı irsaliye eşleştirme/taslak hatası:', matchErr);
            updates.matchError = (matchErr as any)?.message || 'Eşleştirme başarısız';
            updates.cariOneriler = suggestCariFromDb(updates.firma, cariKartlarLive, 5);
          }
        } else if (evrakTuru === 'MAKBUZ') {
          updates.evrakNo = existingNo || parsed.referansId || '';
          updates.firma = existingFirma || parsed.firma || '';
          updates.tarih = parsed.tarih || existing.tarih || '';
          updates.tutar = parsed.tutar || 0;
          updates.aciklama = parsed.aciklama || existing.aciklama || '';
          updates.hareketTipi = parsed.hareketTipi || 'ÇIKIŞ';
          if (existingCariId) {
            updates.cariKartId = existingCariId;
            const c = cariKartlarLive.find((x) => x.id === existingCariId);
            if (c) updates.firma = c.unvan;
          } else {
            const cariOn = suggestCariFromDb(updates.firma, cariKartlarLive, 1)[0];
            if (cariOn) {
              updates.cariKartId = cariOn.id;
              updates.firma = cariOn.unvan;
            } else {
              updates.cariOneriler = suggestCariFromDb(updates.firma, cariKartlarLive, 5);
            }
          }
        }

        await updateDoc(doc(db, 'guvenlikGelenEvraklar', docId), updates);
      } else {
        await updateDoc(doc(db, 'guvenlikGelenEvraklar', docId), {
          aiStatus: 'FAILED',
          aiError: response?.error || 'Bilinmeyen YZ hatası'
        });
      }
    } catch (err: any) {
      console.error("Background AI parsing error:", err);
      await updateDoc(doc(db, 'guvenlikGelenEvraklar', docId), {
        aiStatus: 'FAILED',
        aiError: err?.message || 'Bağlantı hatası'
      });
    }
  };

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlarLive), [cariKartlarLive]);

  const isUploadPackageIncomplete = (x: any) => {
    const kaynak = String(x.firmaKaynakTipi || '');
    if (!kaynak) return true;
    if (countPaketFotolar(x) === 0) return true;

    if (kaynak === 'TASERON') {
      if (!String(x.cariKartId || '').trim() || !String(x.firma || '').trim()) return true;
      if (!String(x.evrakTuru || '').trim()) return true;
      return false;
    }

    // ANA_FIRMA — tam bilgi + 3 foto zorunlu
    if (!hasAnaFirmaUcFotograf(x)) return true;
    if (!String(x.aciklama || '').trim()) return true;
    if (!String(x.evrakTuru || '').trim()) return true;
    if (!String(x.firma || '').trim()) return true; // gönderen firma
    const kalemler = Array.isArray(x.kalemler) ? x.kalemler : [];
    return !kalemler.some(
      (k: any) => String(k.urunAdi || '').trim() && Number(String(k.miktar || '').replace(',', '.')) > 0
    );
  };

  const handleSendQueueToManager = async () => {
    if (uploadQueue.length === 0) {
      alert('Gönderilecek evrak bulunmuyor. Lütfen önce dosya yükleyin!');
      return;
    }
    // Takılı kaldıysa ikinci tık kilidi açar (yeniden denemek için bir kez daha basılır)
    if (sendInFlightRef.current) {
      sendInFlightRef.current = false;
      setLoadingIrsaliye(false);
      showStatus('error', 'Gönderim kilidi açıldı. Tekrar «Yönetici onayına gönder»e basın.');
      return;
    }
    const eksikKaynak = uploadQueue.filter((item) => !String(item.firmaKaynakTipi || '').trim());
    if (eksikKaynak.length > 0) {
      alert('Her evrak paketinde önce firma türünü seçin: Ana Firma (Kibritçi) veya Taşeron Firma.');
      return;
    }

    const eksikFoto = uploadQueue.filter((item) => countPaketFotolar(item) === 0);
    if (eksikFoto.length > 0) {
      alert('Her evrak paketinde en az bir fotoğraf olmalı.');
      return;
    }

    const anaEksikUcFoto = uploadQueue.filter(
      (item) => item.firmaKaynakTipi === 'ANA_FIRMA' && !hasAnaFirmaUcFotograf(item)
    );
    if (anaEksikUcFoto.length > 0) {
      alert(
        'Ana Firma (Kibritçi) evraklarında 3 foto zorunlu:\n1) Firma ismi görünen\n2) Ürünler görünen\n3) Tam hali'
      );
      return;
    }

    const taseronEksik = uploadQueue.filter(
      (item) =>
        item.firmaKaynakTipi === 'TASERON' &&
        (!String(item.cariKartId || '').trim() || !String(item.firma || '').trim())
    );
    if (taseronEksik.length > 0) {
      alert('Taşeron evraklarında listeden bir taşeron firma seçmelisiniz.');
      return;
    }

    const anaEksik = uploadQueue.filter((item) => {
      if (item.firmaKaynakTipi !== 'ANA_FIRMA') return false;
      if (!String(item.aciklama || '').trim()) return true;
      if (!String(item.firma || '').trim()) return true;
      const kalemler = Array.isArray(item.kalemler) ? item.kalemler : [];
      return !kalemler.some(
        (k: any) => String(k.urunAdi || '').trim() && Number(String(k.miktar || '').replace(',', '.')) > 0
      );
    });
    if (anaEksik.length > 0) {
      alert(
        'Ana Firma evraklarında zorunlu:\n• Evrak türü\n• Gönderen firma ismi\n• Kalemler (ürün adı + kilo)\n• 3 fotoğraf\n• Açıklama\n\nBu evraklar yönetici onayına gider.'
      );
      return;
    }

    const eksikAciklama = uploadQueue.filter(
      (item) => item.firmaKaynakTipi === 'ANA_FIRMA' && !String(item.aciklama || '').trim()
    );
    if (eksikAciklama.length > 0) {
      alert('Ana Firma evraklarında açıklama zorunludur.');
      return;
    }

    const irsaliyeEksik = uploadQueue.filter((item) => {
      if (item.firmaKaynakTipi !== 'ANA_FIRMA') return false;
      if (item.evrakTuru !== 'İRSALİYE') return false;
      if (!String(item.evrakNo || '').trim()) return true;
      if (!String(item.firma || '').trim()) return true;
      const kalemler = Array.isArray(item.kalemler) ? item.kalemler : [];
      return !kalemler.some(
        (k: any) => String(k.urunAdi || '').trim() && Number(String(k.miktar || '').replace(',', '.')) > 0
      );
    });
    if (irsaliyeEksik.length > 0) {
      alert(
        'Ana Firma İRSALİYE paketlerinde zorunlu:\n• İrsaliye / taşıma no\n• Gönderen firma\n• En az bir kalem (ürün + KG)\n• 3 fotoğraf'
      );
      return;
    }

    // Cari yoksa oluşturulsun mu? (yalnızca Ana Firma — gönderen tedarikçi)
    const yeniCariGereken = uploadQueue.filter(
      (item) =>
        item.firmaKaynakTipi === 'ANA_FIRMA' &&
        (item.evrakTuru === 'İRSALİYE' || item.evrakTuru === 'FATURA') &&
        String(item.firma || '').trim() &&
        !item.cariKartId &&
        suggestCariFromDb(item.firma, cariKartlarLive, 1).length === 0
    );
    if (yeniCariGereken.length > 0) {
      const names = yeniCariGereken.map((x) => x.firma).join(', ');
      const ok = window.confirm(
        `Sistemde cari bulunamadı:\n${names}\n\nKapıda yeni tedarikçi cari kartı oluşturulsun mu?\n(Yönetici sonra kontrol eder.)`
      );
      if (!ok) {
        alert('Önce cari önerisinden seçin veya firma adını düzeltin.');
        return;
      }
    }

    // SA akıllı eşleşme: yalnızca Ana Firma irsaliyeleri
    const resolvedSaByQueueId = new Map<string, string>();
    for (const item of uploadQueue) {
      if (item.firmaKaynakTipi !== 'ANA_FIRMA') continue;
      if (item.evrakTuru !== 'İRSALİYE') continue;
      let saId = String(item.saId || '').trim();
      if (!saId) {
        const oneriler = suggestSatinAlmaForKapiEvrak({
          firma: item.firma,
          cariKartId: item.cariKartId,
          kalemler: item.kalemler || [],
          satinAlmaTalepleri: satinAlmaProp,
          irsaliyeler: irsaliyelerProp,
          limit: 3,
        });
        const top = oneriler[0];
        if (top && top.score >= 40) {
          const kalemOzet =
            top.matchedKalemler.length > 0
              ? `\nKalem: ${top.matchedKalemler
                  .slice(0, 3)
                  .map((m) => `${m.kapiUrunAdi} ↔ ${m.saUrunAdi}`)
                  .join(', ')}`
              : '';
          const ok = window.confirm(
            `Akıllı eşleşme bulundu.\n\n` +
              `Satın alma: ${top.saId}\n` +
              `Firma: ${top.cariFirma}\n` +
              `Skor: ${top.reason}${kalemOzet}\n\n` +
              `İlgili satın alma talebine irsaliye bağlamak ister misiniz?\n` +
              `• Evet → karşılaştırma zinciri (SA ↔ irsaliye)\n` +
              `• Hayır → arşiv / doğrudan sevk`
          );
          if (ok) saId = top.saId;
        }
      }
      if (saId) resolvedSaByQueueId.set(item.id, saId);
    }

    sendInFlightRef.current = true;
    setLoadingIrsaliye(true);
    showStatus('success', 'Evraklar gönderiliyor, lütfen bekleyin…');
    const savedIds = new Set<string>();
    const failures: string[] = [];
    const queueSnapshot = [...uploadQueue];
    const watchdog = window.setTimeout(() => {
      sendInFlightRef.current = false;
      setLoadingIrsaliye(false);
      showStatus(
        'error',
        'Gönderim uzun sürdü. Buton açıldı — kayıt listede yoksa tekrar deneyin.'
      );
    }, 12000);

    try {
      await ensureFirestoreAuth();

      for (const item of queueSnapshot) {
        const uniqueId = `EVR-${islemTarihi.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        try {
          const prepared = await withTimeout(
            prepareGuvenlikFotoPaketForSave({
              kalemFotolar: item.kalemFotolar || [],
              firmaFotolar: item.firmaFotolar || [],
              faturaFotolar: item.faturaFotolar || [],
            }),
            8000
          );

          const lean = buildLeanGuvenlikEvrakFotoFields(prepared);
          const primarySlot =
            lean.kalemFotolar[0] || lean.firmaFotolar[0] || lean.faturaFotolar[0] || null;
          const fotoEksik =
            countPaketFotolar(prepared) === 0 && countPaketFotolar(item) > 0;

          if (isPaketTooLargeForFirestore(prepared)) {
            throw new Error(
              'Fotoğraflar çok büyük. Lütfen tek net fotoğraf kullanın (PDF yerine kamera).'
            );
          }

          let firmaAdi = String(item.firma || '').trim();
          let cariKartId = String(item.cariKartId || '').trim();
          let liveCari = [...cariKartlarLive];

          if (firmaAdi && !cariKartId && item.firmaKaynakTipi !== 'TASERON') {
            const hit = suggestCariFromDb(firmaAdi, liveCari, 1)[0];
            if (hit) {
              cariKartId = hit.id;
              firmaAdi = hit.unvan;
            } else if (item.evrakTuru === 'İRSALİYE' || item.evrakTuru === 'FATURA') {
              const ensured = autoEnsureCari(
                firmaAdi,
                liveCari,
                `Kapı güvenlik evrakı · ${uniqueId}`
              );
              if (ensured.cari) {
                ensured.cari.yetkili = currentUser?.email || 'güvenlik';
                ensured.cari.adres = 'Kapı girişinden oluşturuldu — yönetici onayı bekleniyor.';
                await saveDocument('cariKartlar', ensured.cari);
                liveCari = ensured.cariler;
                setCariKartlarLive(ensured.cariler);
                cariKartId = ensured.cari.id;
                firmaAdi = ensured.cari.unvan;
              }
            }
          } else if (cariKartId) {
            const c = liveCari.find((x) => x.id === cariKartId);
            if (c) firmaAdi = c.unvan;
          }

          const manualKalemler = (Array.isArray(item.kalemler) ? item.kalemler : [])
            .map((k: any) => ({
              id: k.id,
              urunAdi: String(k.urunAdi || '').trim(),
              miktar: Number(String(k.miktar || '').replace(',', '.')),
              birim: String(k.birim || 'KG').trim() || 'KG',
              stokKartId: k.stokKartId || undefined,
            }))
            .filter((k: any) => k.urunAdi && Number.isFinite(k.miktar) && k.miktar > 0);

          // Stok önerisi uygula (seçilmemişse)
          const matchedKalemler = manualKalemler.map((k: any) => {
            if (k.stokKartId) return k;
            const stokHit = suggestStokFromDb(k.urunAdi, stokKartlarLive, 1)[0];
            return stokHit ? { ...k, stokKartId: stokHit.id, birim: k.birim || stokHit.birim || 'KG' } : k;
          });

          const evrakNo = String(item.evrakNo || '').trim();
          const plaka = String(item.plaka || '').trim();
          const saIdBound = resolvedSaByQueueId.get(item.id) || String(item.saId || '').trim();

          const firmaKaynakTipi = item.firmaKaynakTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA';
          const isTaseronEvrak = firmaKaynakTipi === 'TASERON';

          const newEvrak = cleanUndefined({
            id: uniqueId,
            evrakNo: evrakNo || '',
            evrakTuru: item.evrakTuru,
            firma: firmaAdi,
            cariKartId: cariKartId || '',
            saId: isTaseronEvrak ? '' : saIdBound || '',
            plaka: plaka || '',
            tarih: islemTarihi,
            saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            fotoUrl: lean.fotoUrl || '',
            fotoUrls: lean.fotoUrls || [],
            kalemFotolar: lean.kalemFotolar,
            firmaFotolar: lean.firmaFotolar,
            faturaFotolar: lean.faturaFotolar,
            kalemler: isTaseronEvrak ? [] : matchedKalemler,
            fileName: primarySlot?.fileName || 'evrak_paketi',
            fileType: primarySlot?.fileType || 'image/jpeg',
            durum: isTaseronEvrak ? 'ONAYLANDI' : 'BEKLEMEDE',
            firmaKaynakTipi,
            aliciFirma: isTaseronEvrak ? firmaAdi : 'Kibritçi İnşaat',
            gonderenFirma: isTaseronEvrak ? '' : firmaAdi,
            aciklama:
              item.aciklama ||
              (isTaseronEvrak
                ? `Taşeron kapı evrakı · ${item.evrakTuru} · ${firmaAdi}`
                : `Ana Firma kapı evrakı · ${item.evrakTuru} · gönderen: ${firmaAdi} · yönetici onayı bekliyor`),
            kaydeden: currentUser?.email || 'nobetci_guvenlik',
            fotoMetodOzet: {
              kalem: lean.kalemFotolar.length,
              firma: lean.firmaFotolar.length,
              fatura: lean.faturaFotolar.length,
            },
            storageBackend: lean.storageBackend || 'INLINE_DATA_URL',
            fotoUyari: fotoEksik
              ? 'Fotoğraf boyutu limiti nedeniyle görsel kaydedilemedi; meta kayıt oluşturuldu. Tekrar fotoğraf ekleyin.'
              : null,
            kayitZamani: new Date().toISOString(),
            kapidaGirildi: true,
            kaynak: 'KAPI_EVRAK',
            donusumKaynagi: isTaseronEvrak
              ? 'KAPI_TASERON_DIREKT'
              : saIdBound
                ? 'KAPI_SA_ESLESME'
                : 'KAPI_EVRAK',
          });

          await withTimeout(
            setDoc(doc(db, 'guvenlikGelenEvraklar', uniqueId), newEvrak),
            10000
          );
          savedIds.add(item.id);

          // Taşeron: ilgili cari alt işlemlerine hemen işlenir (yönetici onayı gerekmez)
          if (isTaseronEvrak && cariKartId) {
            try {
              const cariRow = buildCariEvrakHistory({
                cariKartId,
                islemTipi: 'DIGER',
                islemId: uniqueId,
                islemBaslik: `Kapı Evrak · Taşeron · ${item.evrakTuru}`,
                islemDetay: `${firmaAdi} · geliş ${islemTarihi} · ${item.aciklama || item.evrakTuru}`,
                tarih: islemTarihi,
                belgeNo: evrakNo || uniqueId,
              });
              await saveDocument('cariIslemGecmisi', cariRow);
            } catch (cariErr) {
              console.warn('[kapı] taşeron cari işlem:', cariErr);
            }
          }

          // Ana Firma irsaliye: yönetici öncesi taslak (stok artmaz)
          if (
            !isTaseronEvrak &&
            item.evrakTuru === 'İRSALİYE' &&
            (evrakNo || matchedKalemler.length > 0)
          ) {
            try {
              const { irsaliye, summary } = await upsertKapiDraftIrsaliye({
                guvenlikEvrakId: uniqueId,
                firma: firmaAdi,
                irsaliyeNo: evrakNo || uniqueId,
                tarih: islemTarihi,
                fotoUrl: lean.fotoUrl || '',
                kalemler: matchedKalemler,
                cariKartlar: liveCari,
                stokKartlar: stokKartlarLive,
                kaydeden: currentUser?.email || 'nobetci_guvenlik',
                saId: saIdBound || undefined,
                satinAlmaTalepleri: satinAlmaProp,
                irsaliyeler: irsaliyelerProp,
              });
              await updateDoc(doc(db, 'guvenlikGelenEvraklar', uniqueId), cleanUndefined({
                irsaliyeId: irsaliye.id,
                matchSummary: summary,
                cariKartId: summary.cariKartId || cariKartId || '',
                firma: summary.cariUnvan || firmaAdi,
                kalemler: irsaliye.kalemler || matchedKalemler,
                saId: saIdBound || '',
                donusumKaynagi: saIdBound ? 'KAPI_SA_ESLESME' : 'KAPI_EVRAK',
              }));
            } catch (draftErr) {
              console.warn('[kapı] taslak irsaliye:', draftErr);
            }
          }

          if (!isTaseronEvrak && lean.fotoUrl) {
            void triggerBackgroundAiParsing(
              uniqueId,
              lean.fotoUrl,
              newEvrak.evrakTuru as string,
              {
                firmaHint: firmaAdi || undefined,
                cariKartId: cariKartId || undefined,
                saId: saIdBound || undefined,
                kalemFotoUrl: lean.kalemFotolar[0]?.dataUrl,
                firmaFotoUrl: lean.firmaFotolar[0]?.dataUrl,
                faturaFotoUrl: lean.faturaFotolar[0]?.dataUrl,
              }
            );
          }
        } catch (itemErr: any) {
          console.error('Evrak paketi kaydı başarısız:', item.id, itemErr);
          const code = itemErr?.code || '';
          const msg =
            itemErr?.message === 'FIRESTORE_TIMEOUT'
              ? 'veritabanı zaman aşımı'
              : code === 'permission-denied'
                ? 'yazma izni yok (oturum/yetki)'
                : itemErr?.message || 'kayıt hatası';
          failures.push(`${item.firma || item.evrakTuru || 'Paket'}: ${msg}`);
        }
      }

      if (savedIds.size > 0) {
        setUploadQueue((prev) => prev.filter((p) => !savedIds.has(p.id)));
        if (addNotification) {
          addNotification(`Güvenlik kapısından ${savedIds.size} adet yeni evrak yöneticiye gönderildi.`);
        }
      }

      if (failures.length === 0 && savedIds.size > 0) {
        showStatus('success', 'Evraklar başarıyla kaydedildi ve yöneticiye gönderildi!');
        alert('Evrak(lar) yönetici onayına gönderildi.');
      } else if (savedIds.size > 0) {
        const text = `${savedIds.size} paket kaydedildi, ${failures.length} başarısız:\n${failures.join('\n')}`;
        showStatus('error', text);
        alert(text);
      } else {
        const text = `Kayıt başarısız:\n${failures.join('\n') || 'Bilinmeyen hata'}`;
        showStatus('error', text);
        alert(text);
      }
    } catch (err: any) {
      console.error(err);
      const text = err?.message || 'Veritabanına kaydedilirken bir hata oluştu!';
      showStatus('error', text);
      alert(text);
    } finally {
      window.clearTimeout(watchdog);
      sendInFlightRef.current = false;
      setLoadingIrsaliye(false);
    }
  };

  const handleUpdateGelenEvrak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvrak) return;

    try {
      const firma = editEvrakFirma.trim();
      const cleanedKalemler = usableKalemler(editKalemler).map((k: any, i: number) => ({
        id: k.id || `ek_${i}`,
        urunAdi: String(k.urunAdi || '').trim(),
        miktar: Number(String(k.miktar || '').replace(',', '.')),
        birim: String(k.birim || 'KG').trim() || 'KG',
        stokKartId: k.stokKartId || undefined,
      }));

      if (editEvrakTuru === 'İRSALİYE' && cleanedKalemler.length === 0) {
        alert('İrsaliyede en az bir kalem (ürün adı + miktar) girin. Foto okunmasa da kapıda elle yazın.');
        return;
      }
      if (editEvrakTuru === 'İRSALİYE' && !firma) {
        alert('Firma adı zorunlu — evraktaki unvanı yazın veya cari önerisinden seçin.');
        return;
      }

      const patch: any = {
        ...editingEvrak,
        evrakTuru: editEvrakTuru,
        aciklama: editAciklama,
        evrakNo: editEvrakNo.trim() || editingEvrak.evrakNo,
        firma,
        cariKartId: editCariKartId || '',
        tarih: editEvrakTarih || editingEvrak.tarih,
        saat: editEvrakSaat || editingEvrak.saat,
        kalemler: cleanedKalemler.length ? cleanedKalemler : editingEvrak.kalemler || [],
        kapidaElleGirildi: cleanedKalemler.length > 0,
        duzeltmeZamani: new Date().toISOString(),
      };

      // İrsaliye: firma değişince cari/stok önerisini yenile (yeni kart açmaz)
      if (editEvrakTuru === 'İRSALİYE' && firma) {
        const matched = doubleCheckKapiMatch(
          firma,
          cleanedKalemler.length ? cleanedKalemler : editingEvrak.kalemler || [],
          cariKartlarLive,
          stokKartlarLive
        );
        patch.matchSummary = matched.summary;
        patch.kalemler = matched.kalemler;
        if (matched.summary.cariMatched) {
          patch.cariKartId = matched.summary.cariKartId;
          patch.firma = matched.summary.cariUnvan;
          patch.cariOneriler = [];
        } else {
          patch.cariOneriler = suggestCariFromDb(firma, cariKartlarLive, 5);
        }
        patch.aciklama =
          editAciklama ||
          `Kapı irsaliye · ${formatKapiMatchLabel(matched.summary)} · güvenlik elle güncelledi`;

        if (editingEvrak.irsaliyeId || editingEvrak.id) {
          await upsertKapiDraftIrsaliye({
            guvenlikEvrakId: editingEvrak.id,
            firma: patch.firma,
            irsaliyeNo: patch.evrakNo || editingEvrak.id,
            tarih: patch.tarih || islemTarihi,
            fotoUrl: editingEvrak.fotoUrl,
            kalemler: matched.kalemler,
            cariKartlar: cariKartlarLive,
            stokKartlar: stokKartlarLive,
            kaydeden: currentUser?.email || 'nobetci_guvenlik',
            saId: editingEvrak.saId,
            satinAlmaTalepleri: satinAlmaProp,
            irsaliyeler: irsaliyelerProp,
          });
        }
      } else if (firma && !editCariKartId) {
        const oneri = suggestCariFromDb(firma, cariKartlarLive, 1)[0];
        if (oneri) {
          patch.cariKartId = oneri.id;
          patch.firma = oneri.unvan;
        } else {
          patch.cariOneriler = suggestCariFromDb(firma, cariKartlarLive, 5);
        }
      }

      await setDoc(doc(db, 'guvenlikGelenEvraklar', editingEvrak.id), patch, { merge: true });

      showStatus('success', 'Evrak bilgileri güncellendi.');
      setEditingEvrak(null);
    } catch (err) {
      console.error(err);
      alert('Güncellenemedi.');
    }
  };

  const openEvrakDuzenle = (e: any) => {
    setEditingEvrak(e);
    setEditEvrakTuru(e.evrakTuru || 'İRSALİYE');
    setEditAciklama(e.aciklama || '');
    setEditEvrakNo(e.evrakNo || '');
    setEditEvrakFirma(e.firma || '');
    setEditEvrakTarih(e.tarih || islemTarihi);
    setEditEvrakSaat(e.saat || '');
    setEditCariKartId(e.cariKartId || '');
    const kals = Array.isArray(e.kalemler) && e.kalemler.length
      ? e.kalemler.map((k: any, i: number) => ({
          id: k.id || `ek_${i}`,
          urunAdi: k.urunAdi || '',
          miktar: k.miktar ?? '',
          birim: k.birim || 'KG',
          stokKartId: k.stokKartId || '',
        }))
      : [{ id: `ek_${Date.now()}`, urunAdi: '', miktar: '', birim: 'KG' }];
    setEditKalemler(kals);
  };

  const handleApplyCariOneri = async (evrak: any, oneri: { id: string; unvan: string }) => {
    try {
      const patch: any = {
        firma: oneri.unvan,
        cariKartId: oneri.id,
        cariOneriler: [],
      };
      if ((evrak.evrakTuru || 'İRSALİYE') === 'İRSALİYE') {
        const matched = doubleCheckKapiMatch(
          oneri.unvan,
          evrak.kalemler || [],
          cariKartlarLive,
          stokKartlarLive
        );
        patch.matchSummary = matched.summary;
        patch.kalemler = matched.kalemler;
        patch.aciklama = `Kapı irsaliye · ${formatKapiMatchLabel(matched.summary)} · cari seçildi: ${oneri.unvan}`;
        if (evrak.irsaliyeId || evrak.id) {
          await upsertKapiDraftIrsaliye({
            guvenlikEvrakId: evrak.id,
            firma: oneri.unvan,
            irsaliyeNo: evrak.evrakNo || evrak.id,
            tarih: evrak.tarih || islemTarihi,
            fotoUrl: evrak.fotoUrl,
            kalemler: matched.kalemler,
            cariKartlar: cariKartlarLive,
            stokKartlar: stokKartlarLive,
            kaydeden: currentUser?.email || 'nobetci_guvenlik',
          });
        }
      }
      await updateDoc(doc(db, 'guvenlikGelenEvraklar', evrak.id), patch);
      showStatus('success', `Cari önerisi uygulandı: ${oneri.unvan}`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Cari önerisi uygulanamadı.');
    }
  };

  const handleSaveDuzenlenenKayit = async (patch: Record<string, unknown>) => {
    if (!editingKayit) return;
    const { kind, record } = editingKayit;
    const collectionName =
      kind === 'personel'
        ? 'guvenlikGirisCikisLoglari'
        : kind === 'arac'
          ? 'guvenlikAracLoglari'
          : kind === 'tanker'
            ? 'guvenlikTankerLoglari'
            : 'guvenlikZiyaretciLoglari';

    await setDoc(doc(db, collectionName, record.id), patch, { merge: true });

    // Mıcır/stabilize düzenlemesi → fiş + gelen evrak senkron
    if (kind === 'tanker' && record.tip === 'MICIR_STABILIZE' && record.micirFisId) {
      const kiloKg = resolveMicirKiloKg({
        kiloKg: patch.kiloKg != null ? Number(patch.kiloKg) : record.kiloKg,
        tonaj: patch.tonaj != null ? Number(patch.tonaj) : record.tonaj,
      });
      const tonaj = kiloKg > 0 ? kgToTon(kiloKg) : Number(patch.tonaj || record.tonaj) || 0;
      const irsaliyeNo = String(patch.irsaliyeNo || record.irsaliyeNo || '').trim().toUpperCase();
      const tarih = String(patch.islemTarihi || record.islemTarihi || '').slice(0, 10);
      const plaka = String(patch.plaka || record.plaka || '').trim().toUpperCase();
      const malzemeTipi = normalizeMicirMalzemeTipi(
        patch.malzemeTipi || record.malzemeTipi || 'MICIR'
      );

      await setDoc(
        doc(db, 'micirStabilizeFisleri', record.micirFisId),
        {
          tarih,
          irsaliyeNo,
          plaka,
          tonaj,
          kiloKg,
          malzemeTipi,
          firmaUnvan: ENTO_MADEN_UNVAN,
          guncellenme: new Date().toISOString(),
        },
        { merge: true }
      );

      if (record.guvenlikEvrakId) {
        await setDoc(
          doc(db, 'guvenlikGelenEvraklar', record.guvenlikEvrakId),
          {
            evrakNo: irsaliyeNo,
            tarih,
            plaka,
            tonaj,
            kiloKg,
            malzemeTipi,
            firma: ENTO_MADEN_UNVAN,
            aciklama: `Kapı ${malzemeTipiLabel(malzemeTipi)} irsaliye teslimi · Plaka ${plaka} · ${formatMicirMiktarLabel(tonaj, kiloKg)}`,
            kalemler: buildMicirKalemler(record.micirFisId, tonaj, malzemeTipi, kiloKg),
          },
          { merge: true }
        );
      }
    }

    showStatus('success', 'Kayıt güncellendi.');
    setEditingKayit(null);
  };

  const handleDeleteTankerLog = async (id: string) => {
    if (!window.confirm('Bu tanker / kamyon kaydı silinsin mi?')) return;
    try {
      const matched = [
        ...iceridekiMiciStabilize,
        ...miciStabilizeGecmisLoglar,
        ...iceridekiSuTankerleri,
        ...suTankeriGecmisLoglar,
        ...iceridekiVidanjorler,
        ...vidanjorGecmisLoglar,
        ...iceridekiPetrolTankerleri,
        ...petrolTankeriGecmisLoglar,
      ].find((x) => x.id === id);

      await deleteDoc(doc(db, 'guvenlikTankerLoglari', id));

      if (matched?.tip === 'MICIR_STABILIZE') {
        if (matched.micirFisId) {
          try {
            await deleteDoc(doc(db, 'micirStabilizeFisleri', matched.micirFisId));
          } catch (_) {
            /* yoksa geç */
          }
        }
        if (matched.guvenlikEvrakId) {
          try {
            await deleteDoc(doc(db, 'guvenlikGelenEvraklar', matched.guvenlikEvrakId));
          } catch (_) {
            /* yoksa geç */
          }
        }
      }

      setSelectedSuTankeriLogIds((prev) => prev.filter((x) => x !== id));
      showStatus('success', 'Tanker kaydı silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Silinemedi.');
    }
  };

  const handleNobetRaporuAl = async () => {
    try {
      showStatus('success', 'Rapor oluşturuluyor, lütfen bekleyin...');
      
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const { generateGuvenlikReportHtml } = await import('../lib/guvenlikReportHtml');

      const todayStr = islemTarihi;
      const baseDate = new Date(todayStr);
      baseDate.setDate(baseDate.getDate() + 1);
      const nextDayStr = baseDate.toISOString().split('T')[0];

      const startLimit = selectedVardiya === 'GUNDUZ' ? `${todayStr}T08:00:00.000Z` : `${todayStr}T20:00:00.000Z`;
      const endLimit = selectedVardiya === 'GUNDUZ' ? `${todayStr}T20:00:00.000Z` : `${nextDayStr}T08:00:00.000Z`;

      const filterByTime = (timeStr: string) => {
        if (!timeStr) return false;
        return timeStr >= startLimit && timeStr < endLimit;
      };

      const todayLogs = personelLoglar.filter(l => filterByTime(l.zaman));
      const todayAraclar = [...iceridekiAraclar, ...aracGecmisLoglar].filter(a => {
        const inTime = a.girisZamani;
        const outTime = a.cikisZamani || getIslemZamani();
        return inTime < endLimit && outTime >= startLimit;
      });
      const todayZiyaretciler = [...aktifZiyaretciler, ...ziyaretciGecmisLoglar].filter(z => {
        const inTime = z.girisZamani;
        const outTime = z.cikisZamani || getIslemZamani();
        return inTime < endLimit && outTime >= startLimit;
      });
      const todayEvraklar = gelenEvraklar.filter(e => {
        if (!e.tarih || !e.saat) return false;
        const evrakTime = `${e.tarih}T${e.saat}:00.000Z`;
        return evrakTime >= startLimit && evrakTime < endLimit;
      });

      const htmlContent = generateGuvenlikReportHtml(
        islemTarihi,
        todayLogs,
        todayAraclar,
        todayZiyaretciler,
        todayEvraklar,
        selectedVardiya
      );

      const container = document.createElement('div');
      container.innerHTML = htmlContent;
      container.style.position = 'absolute';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = '1000px'; 
      document.body.appendChild(container);

      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      const shiftSuffix = selectedVardiya ? `_${selectedVardiya}` : '';
      pdf.save(`Kibritci_Guvenlik_Raporu_${islemTarihi}${shiftSuffix}.pdf`);
      showStatus('success', 'Rapor başarıyla indirildi.');
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      showStatus('error', 'Rapor oluşturulurken bir hata oluştu.');
    }
  };

  const handleArchivedNobetRaporuAl = async (archive: any) => {
    try {
      showStatus('success', 'Arşiv raporu oluşturuluyor, lütfen bekleyin...');
      
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const { generateGuvenlikReportHtml } = await import('../lib/guvenlikReportHtml');

      const htmlContent = generateGuvenlikReportHtml(
        archive.tarih,
        archive.personelLoglari || [],
        archive.aracLoglari || [],
        archive.ziyaretciLoglari || [],
        archive.evrakLoglari || [],
        archive.vardiya || 'TAM_GUN'
      );

      const container = document.createElement('div');
      container.innerHTML = htmlContent;
      container.style.position = 'absolute';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = '1000px'; 
      document.body.appendChild(container);

      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      const shiftSuffix = archive.vardiya ? `_${archive.vardiya}` : '';
      pdf.save(`Kibritci_Guvenlik_Raporu_${archive.tarih}${shiftSuffix}.pdf`);
      showStatus('success', 'Arşiv raporu başarıyla indirildi.');
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      showStatus('error', 'Rapor oluşturulurken bir hata oluştu.');
    }
  };

  const handleArchiveNobetGunu = async (notes: string) => {
    setIsArchiving(true);
    try {
      const todayStr = islemTarihi;
      const filteredLogs = filterNobetPersonelLoglari(personelLoglar, todayStr, selectedVardiya);
      const filteredAraclar = filterNobetAracZiyaretLoglari(
        tumAracLoglar,
        todayStr,
        selectedVardiya,
        getIslemZamani()
      );
      const filteredSuTanker = filterNobetAracZiyaretLoglari(
        tumSuTankeriLoglar,
        todayStr,
        selectedVardiya,
        getIslemZamani()
      );
      const filteredVidanjor = filterNobetAracZiyaretLoglari(
        tumVidanjorLoglar,
        todayStr,
        selectedVardiya,
        getIslemZamani()
      );
      const filteredPetrol = filterNobetAracZiyaretLoglari(
        tumPetrolTankeriLoglar,
        todayStr,
        selectedVardiya,
        getIslemZamani()
      );
      const filteredMiciStabilize = filterNobetAracZiyaretLoglari(
        tumMiciStabilizeLoglar,
        todayStr,
        selectedVardiya,
        getIslemZamani()
      );
      const filteredZiyaretciler = filterNobetAracZiyaretLoglari(
        tumZiyaretciLoglar,
        todayStr,
        selectedVardiya,
        getIslemZamani()
      );
      const filteredEvraklar = filterNobetEvrakLoglari(gelenEvraklar, todayStr, selectedVardiya);
      const gunlukFotograflar = collectNobetGunlukFotograflar({
        evrakLoglari: filteredEvraklar,
        suTankeriLoglari: filteredSuTanker,
        vidanjorLoglari: filteredVidanjor,
        petrolTankeriLoglari: filteredPetrol,
        miciStabilizeLoglari: filteredMiciStabilize,
      });
      const akvizyonSnap = akvizyonArchives.find((a) => a.tarih === todayStr);

      const archivePayload = {
        tarih: todayStr,
        vardiya: selectedVardiya,
        kayitZamani: getIslemZamani(),
        kaydeden: currentUser?.email || 'Nöbetçi Güvenlik',
        notlar: notes,
        personelLoglari: filteredLogs,
        aracLoglari: filteredAraclar,
        suTankeriLoglari: filteredSuTanker,
        vidanjorLoglari: filteredVidanjor,
        petrolTankeriLoglari: filteredPetrol,
        miciStabilizeLoglari: filteredMiciStabilize,
        ziyaretciLoglari: filteredZiyaretciler,
        evrakLoglari: filteredEvraklar,
        fotograflar: gunlukFotograflar,
        akvizyonYoklama: akvizyonSnap?.yoklama || null,
        ozet: {
          personel: filteredLogs.length,
          arac: filteredAraclar.length,
          suTankeri: filteredSuTanker.length,
          vidanjor: filteredVidanjor.length,
          petrolTankeri: filteredPetrol.length,
          miciStabilize: filteredMiciStabilize.length,
          ziyaretci: filteredZiyaretciler.length,
          evrak: filteredEvraklar.length,
          foto: gunlukFotograflar.length,
        },
      };

      const raporHtml = buildNobetGunlukRaporHtml(archivePayload);
      const archiveRef = doc(collection(db, 'guvenlikNobetArsivleri'));
      const archiveId = archiveRef.id;

      await setDoc(archiveRef, {
        id: archiveId,
        ...archivePayload,
        raporHtml,
      });

      if (addNotification) {
        const shiftText =
          selectedVardiya === 'TUM_GUN'
            ? 'Günlük Tam Rapor'
            : selectedVardiya === 'GUNDUZ'
              ? 'Gündüz Vardiyası'
              : 'Gece Vardiyası';
        addNotification(`${todayStr} güvenlik nöbeti (${shiftText}) arşivlendi.`);
      }
      showStatus('success', '🎉 Nöbet raporu arşive kaydedildi! Alttaki listeden görüntüleyebilirsiniz. Günlük loglar silinmedi.');
      setActiveTab('nobet_arsivi');
    } catch (err: any) {
      console.error(err);
      showStatus('error', 'Nöbet günü arşivlenirken hata oluştu: ' + err.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeletePersonelLog = async (id: string) => {
    if (!window.confirm('Bu personel kapı kaydı silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, 'guvenlikGirisCikisLoglari', id));
      setSelectedPersonelLogIds((prev) => prev.filter((x) => x !== id));
      showStatus('success', 'Personel log kaydı silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Silinemedi.');
    }
  };

  const handleDeleteAracLog = async (id: string) => {
    if (!window.confirm('Bu araç kaydı silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, 'guvenlikAracLoglari', id));
      setSelectedAracLogIds((prev) => prev.filter((x) => x !== id));
      showStatus('success', 'Araç log kaydı silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Silinemedi.');
    }
  };

  const handleDeleteSuTankeriLog = async (id: string) => {
    if (!window.confirm('Bu su tankeri kaydı silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, 'guvenlikSuTankeriLoglari', id));
      setSelectedSuTankeriLogIds((prev) => prev.filter((x) => x !== id));
      showStatus('success', 'Su tankeri kaydı silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Silinemedi.');
    }
  };

  const handleDeleteZiyaretciLog = async (id: string) => {
    if (!window.confirm('Bu ziyaretçi kaydı silinsin mi?')) return;
    try {
      await deleteDoc(doc(db, 'guvenlikZiyaretciLoglari', id));
      showStatus('success', 'Ziyaretçi kaydı silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Silinemedi.');
    }
  };

  const handleGosterSeciliGun = (tabLabel: string, count: number) => {
    showStatus(
      'success',
      `${formatDateLabelTr(islemTarihi)} — ${tabLabel}: ${count} kayıt listeleniyor. Loglar silinmedi.`
    );
  };

  const handleBulkDeletePersonelLogs = async () => {
    if (selectedPersonelLogIds.length === 0) return;
    if (!window.confirm(`${selectedPersonelLogIds.length} personel log kaydı silinsin mi?`)) return;
    try {
      await Promise.all(
        selectedPersonelLogIds.map((id) => deleteDoc(doc(db, 'guvenlikGirisCikisLoglari', id)))
      );
      setSelectedPersonelLogIds([]);
      showStatus('success', 'Seçili personel logları silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Toplu silme başarısız.');
    }
  };

  const handleBulkDeleteAracLogs = async () => {
    if (selectedAracLogIds.length === 0) return;
    if (!window.confirm(`${selectedAracLogIds.length} araç log kaydı silinsin mi?`)) return;
    try {
      await Promise.all(selectedAracLogIds.map((id) => deleteDoc(doc(db, 'guvenlikAracLoglari', id))));
      setSelectedAracLogIds([]);
      showStatus('success', 'Seçili araç logları silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Toplu silme başarısız.');
    }
  };

  const handleBulkDeleteSuTankeriLogs = async () => {
    if (selectedSuTankeriLogIds.length === 0) return;
    if (!window.confirm(`${selectedSuTankeriLogIds.length} su tankeri log kaydı silinsin mi?`)) return;
    try {
      await Promise.all(
        selectedSuTankeriLogIds.map((id) => deleteDoc(doc(db, 'guvenlikSuTankeriLoglari', id)))
      );
      setSelectedSuTankeriLogIds([]);
      showStatus('success', 'Seçili su tankeri logları silindi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Toplu silme başarısız.');
    }
  };

  const handleGuncelleSeciliPersonelTarih = async () => {
    if (selectedPersonelLogIds.length === 0) return;
    if (
      !window.confirm(
        `Seçili ${selectedPersonelLogIds.length} personel kaydının işlem tarihi ${formatDateLabelTr(islemTarihi)} olarak güncellensin mi?`
      )
    )
      return;
    try {
      await Promise.all(
        selectedPersonelLogIds.map((id) => {
          const log = personelLoglar.find((l) => l.id === id);
          if (!log) return Promise.resolve();
          const timePart = String(log.zaman || getIslemZamani()).slice(11);
          return setDoc(
            doc(db, 'guvenlikGirisCikisLoglari', id),
            { islemTarihi, zaman: `${islemTarihi}T${timePart || '12:00:00.000Z'}` },
            { merge: true }
          );
        })
      );
      showStatus('success', 'Seçili personel kayıtları seçili tarihe güncellendi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Güncelleme başarısız.');
    }
  };

  const handleGuncelleSeciliAracTarih = async () => {
    if (selectedAracLogIds.length === 0) return;
    if (
      !window.confirm(
        `Seçili ${selectedAracLogIds.length} araç kaydının işlem tarihi ${formatDateLabelTr(islemTarihi)} olarak güncellensin mi?`
      )
    )
      return;
    try {
      await Promise.all(
        selectedAracLogIds.map((id) => {
          const log = tumAracLoglar.find((l) => l.id === id);
          if (!log) return Promise.resolve();
          const timePart = String(log.girisZamani || getIslemZamani()).slice(11);
          return setDoc(
            doc(db, 'guvenlikAracLoglari', id),
            { islemTarihi, girisZamani: `${islemTarihi}T${timePart || '12:00:00.000Z'}` },
            { merge: true }
          );
        })
      );
      showStatus('success', 'Seçili araç kayıtları seçili tarihe güncellendi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Güncelleme başarısız.');
    }
  };

  const handleGuncelleSeciliSuTankeriTarih = async () => {
    if (selectedSuTankeriLogIds.length === 0) return;
    if (
      !window.confirm(
        `Seçili ${selectedSuTankeriLogIds.length} su tankeri kaydının işlem tarihi ${formatDateLabelTr(islemTarihi)} olarak güncellensin mi?`
      )
    )
      return;
    try {
      await Promise.all(
        selectedSuTankeriLogIds.map((id) => {
          const log = tumSuTankeriLoglar.find((l) => l.id === id);
          if (!log) return Promise.resolve();
          const timePart = String(log.girisZamani || getIslemZamani()).slice(11);
          return setDoc(
            doc(db, 'guvenlikSuTankeriLoglari', id),
            { islemTarihi, girisZamani: `${islemTarihi}T${timePart || '12:00:00.000Z'}` },
            { merge: true }
          );
        })
      );
      showStatus('success', 'Seçili su tankeri kayıtları seçili tarihe güncellendi.');
    } catch (e) {
      console.error(e);
      showStatus('error', 'Güncelleme başarısız.');
    }
  };

  const handleIndirNobetRaporHtml = (archive: any) => {
    const html = archive.raporHtml || buildNobetGunlukRaporHtml(archive);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guvenlik_nobet_${archive.tarih}_${archive.vardiya || 'TUM'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteEvrak = async (evrakId: string) => {
    if (!window.confirm('Bu evrak kaydını tamamen silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'guvenlikGelenEvraklar', evrakId));
      try {
        await deleteDoc(doc(db, 'irsaliyeler', evrakId));
      } catch {
        /* taslak yoksa sorun değil */
      }
      if (addNotification) addNotification('Evrak kaydı silindi.');
    } catch (e) {
      console.error(e);
      alert('Silinemedi.');
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
        zaman: getIslemZamani(),
        islemTarihi,
        kaydeden: currentUser?.email || 'kapici_kibritci',
        firmaTipi: isTaseronPersonel(personel) ? 'TASERON' : 'ANA',
        firmaAdi: firmaEtiketi(personel),
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
        girisZamani: getIslemZamani(),
        islemTarihi,
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
        cikisZamani: getIslemZamani()
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

  const handleTankerGiris = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentTip =
      activeTab === 'vidanjor'
        ? 'VIDANJOR'
        : activeTab === 'petrol_tankeri'
          ? 'PETROL_TANKERI'
          : activeTab === 'mici_stabilize'
            ? 'MICIR_STABILIZE'
            : 'SU_TANKERI';

    const currentLabel =
      activeTab === 'vidanjor'
        ? 'Vidanjör'
        : activeTab === 'petrol_tankeri'
          ? 'Petrol Tankeri'
          : activeTab === 'mici_stabilize'
            ? 'Mıcır / Stabilize / Taş Tozu'
            : 'Su Tankeri';

    const isMicir = currentTip === 'MICIR_STABILIZE';
    const firma = isMicir
      ? ENTO_MADEN_UNVAN
      : currentTip === 'SU_TANKERI'
        ? stFirma.trim() || YILDIRIM_TANKER_UNVAN
        : stFirma.trim();
    const kiloKgNum = Number(String(stKiloKg || stMiktar).replace(',', '.'));
    const tonajNum = isMicir
      ? kgToTon(kiloKgNum)
      : Number(String(stMiktar).replace(',', '.'));

    if (!stPlaka.trim() || !firma) {
      alert('Lütfen plaka ve firmasını girin!');
      return;
    }
    if (isMicir) {
      if (!islemTarihi) {
        alert('İrsaliye tarihi zorunludur.');
        return;
      }
      if (!stIrsaliyeNo.trim()) {
        alert('İrsaliye no zorunludur — evrak üzerindeki numarayı tam girin.');
        return;
      }
      if (!Number.isFinite(kiloKgNum) || kiloKgNum <= 0) {
        alert('Kilo zorunludur — irsaliyedeki ağırlığı kilogram olarak tam girin (örn: 25500).');
        return;
      }
      if (!tankerFotoUrl) {
        alert('İrsaliye fotoğrafı / belgesi zorunludur.');
        return;
      }
    }

    try {
      const logId = `tk_${Date.now()}`;
      const micirFisId = isMicir ? `mfis_${Date.now()}` : null;
      const guvenlikEvrakId = isMicir ? `EVR-MIC-${micirFisId}` : null;
      const irsaliyeId = isMicir ? `IR-MIC-${micirFisId}` : null;
      const malzeme = normalizeMicirMalzemeTipi(stMalzemeTipi);
      const malzemeAdi = malzemeTipiLabel(malzeme);
      const miktarLabel = isMicir ? formatMicirMiktarLabel(tonajNum, kiloKgNum) : '';

      const logData: Record<string, unknown> = {
        id: logId,
        tip: currentTip,
        plaka: stPlaka.toUpperCase().trim(),
        firma,
        surucuAdi: stSurucu.trim(),
        miktar: isMicir ? miktarLabel : stMiktar.trim() || 'Belirtilmedi',
        aciklama: isMicir
          ? `${malzemeAdi} irsaliye · ${stIrsaliyeNo.trim().toUpperCase()} · ${miktarLabel}${stAciklama.trim() ? ` · ${stAciklama.trim()}` : ''}`
          : stAciklama.trim(),
        fotoUrl: tankerFotoUrl || null,
        fileName: tankerFileName || null,
        durum: 'İÇERİDE',
        girisZamani: getIslemZamani(),
        islemTarihi,
        cikisZamani: null,
        kaydeden: currentUser?.email || 'guvenlik_gate',
      };

      if (isMicir && micirFisId) {
        logData.irsaliyeNo = stIrsaliyeNo.trim().toUpperCase();
        logData.tonaj = tonajNum;
        logData.kiloKg = kiloKgNum;
        logData.malzemeTipi = malzeme;
        logData.micirFisId = micirFisId;
        logData.guvenlikEvrakId = guvenlikEvrakId;
        logData.irsaliyeId = irsaliyeId;
        logData.onayDurumu = 'YONETICI_ONAYINDA';
      }

      await setDoc(doc(db, 'guvenlikTankerLoglari', logId), logData);

      // Mıcır/Stabilize = ENTO MADEN kapı irsaliyesi → yönetici onayı sonrası irsaliye + cari (+ SA)
      if (isMicir && micirFisId && guvenlikEvrakId && irsaliyeId) {
        const saMatch = findMatchingMicirSatinAlma(satinAlmaProp, irsaliyelerProp, malzeme, {});
        const fis: MicirStabilizeFis = {
          id: micirFisId,
          tarih: islemTarihi,
          irsaliyeNo: stIrsaliyeNo.trim().toUpperCase(),
          plaka: stPlaka.toUpperCase().trim(),
          tonaj: tonajNum,
          kiloKg: kiloKgNum,
          malzemeTipi: malzeme,
          fisGorselUrl: tankerFotoUrl || '',
          firmaUnvan: ENTO_MADEN_UNVAN,
          irsaliyeId,
          guvenlikEvrakId,
          kapıLogId: logId,
          saId: saMatch?.sa.saId,
          saKalemId: saMatch?.kalem.id,
          kaydeden: currentUser?.email || 'guvenlik_gate',
          durum: 'YONETICI_ONAYINDA',
          olusturulma: new Date().toISOString(),
          guncellenme: new Date().toISOString(),
        };
        await setDoc(doc(db, 'micirStabilizeFisleri', micirFisId), fis);
        const saNotu = saMatch ? ` · SA ${saMatch.sa.saId}` : '';
        await setDoc(
          doc(db, 'guvenlikGelenEvraklar', guvenlikEvrakId),
          {
            id: guvenlikEvrakId,
            evrakNo: fis.irsaliyeNo,
            evrakTuru: 'İRSALİYE',
            firma: ENTO_MADEN_UNVAN,
            tarih: fis.tarih,
            saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            fotoUrl: fis.fisGorselUrl || '',
            fileName: `micir_${fis.irsaliyeNo}.jpg`,
            fileType: 'image/jpeg',
            durum: 'BEKLEMEDE',
            aciklama: `ENTO MADEN ${malzemeAdi} irsaliyesi · Plaka ${fis.plaka} · ${miktarLabel}${saNotu} — yönetici onayı bekliyor`,
            kaydeden: currentUser?.email || 'guvenlik_gate',
            kaynak: 'MICIR_STABILIZE_FIS',
            micirFisId,
            kapıLogId: logId,
            irsaliyeId,
            saId: saMatch?.sa.saId || null,
            saKalemId: saMatch?.kalem.id || null,
            plaka: fis.plaka,
            tonaj: fis.tonaj,
            kiloKg: fis.kiloKg,
            malzemeTipi: fis.malzemeTipi,
            kalemler: buildMicirKalemler(micirFisId, fis.tonaj, malzeme, fis.kiloKg).map((k) => ({
              ...k,
              saKalemId: saMatch?.kalem.id,
            })),
            aiStatus: 'SKIPPED',
          },
          { merge: true }
        );
      }

      if (addNotification) {
        if (currentTip === 'VIDANJOR') {
          await addNotification(
            `🚛 Vidanjör sahaya girdi: ${logData.plaka} (${logData.firma}). Kampçı fiş yüklemeli.`,
            {
              tip: 'VIDANJOR_GIRIS',
              hedefRol: 'KAMPÇI',
              plaka: logData.plaka,
              firma: logData.firma,
              kapıLogId: logId,
            }
          );
        } else if (currentTip === 'SU_TANKERI') {
          // Vidanjör→kampçı gibi: Yıldırım Tanker girince tesisatçılara bildirim
          const yildirimFirma = String(logData.firma || YILDIRIM_TANKER_UNVAN);
          await addNotification(
            `💧 Yıldırım Tanker sahaya girdi: ${logData.plaka} (${yildirimFirma}). Tesisatçı fiş yüklemeli.`,
            {
              tip: 'YILDIRIM_TANKER_GIRIS',
              hedefRol: 'TESİSATÇI',
              plaka: logData.plaka,
              firma: yildirimFirma,
              kapıLogId: logId,
            }
          );
        } else if (isMicir) {
          await addNotification(
            `ENTO MADEN ${malzemeAdi} irsaliyesi onay bekliyor: ${stIrsaliyeNo.trim().toUpperCase()} · ${stPlaka.toUpperCase().trim()} · ${miktarLabel}`,
            {
              tip: 'MICIR_FIS_ONAY',
              hedefRol: 'YÖNETİCİ',
              micirFisId,
              guvenlikEvrakId,
              irsaliyeId,
              kapıLogId: logId,
              plaka: stPlaka.toUpperCase().trim(),
              firma: ENTO_MADEN_UNVAN,
              kiloKg: kiloKgNum,
              tonaj: tonajNum,
            }
          );
        } else {
          addNotification(`${currentLabel} ${logData.plaka} (${logData.firma}) şantiyeye giriş yaptı.`);
        }
      }
      setStPlaka('');
      setStFirma(isMicir ? ENTO_MADEN_UNVAN : '');
      setStSurucu('');
      setStMiktar('');
      setStKiloKg('');
      setStAciklama('');
      setStIrsaliyeNo('');
      setStMalzemeTipi('MICIR');
      setTankerFotoUrl('');
      setTankerFileName('');
      showStatus(
        'success',
        isMicir
          ? `${ENTO_MADEN_UNVAN} irsaliye kaydı oluşturuldu — yönetici onayına gönderildi.`
          : `${currentLabel} giriş kaydı yapıldı!`
      );
    } catch (err) {
      console.error(err);
      showStatus('error', 'Kayıt başarısız!');
    }
  };

  const handleTankerCikis = async (id: string) => {
    try {
      const matched = 
        iceridekiSuTankerleri.find((a) => a.id === id) ||
        iceridekiVidanjorler.find((a) => a.id === id) ||
        iceridekiMiciStabilize.find((a) => a.id === id) ||
        iceridekiPetrolTankerleri.find((a) => a.id === id);
      
      const plakaLabel = matched ? matched.plaka : id;
      const typeLabel = matched && matched.tip === 'VIDANJOR' ? 'vidanjör' : 
                        matched && matched.tip === 'PETROL_TANKERI' ? 'petrol tankeri' : 
                        matched && matched.tip === 'MICIR_STABILIZE' ? 'mıcır & stabilize kamyonu' : 
                        'su tankeri';

      await setDoc(
        doc(db, 'guvenlikTankerLoglari', id),
        { durum: 'ÇIKTI', cikisZamani: getIslemZamani() },
        { merge: true }
      );
      if (addNotification) {
        addNotification(`${plakaLabel} plakalı ${typeLabel} şantiyeden çıkış yaptı.`);
      }
      showStatus('success', 'Çıkış başarıyla kaydedildi!');
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
        girisZamani: getIslemZamani(),
        islemTarihi,
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
        cikisZamani: getIslemZamani()
      }, { merge: true });
      if (addNotification) {
        addNotification(`Ziyaretçi ${guestName} şantiyeden çıkış yaptı.`);
      }
      showStatus('success', 'Ziyaretçi çıkış işlemi tamamlandı!');
    } catch (err) {
      console.error(err);
    }
  };

  const isSeciliGunBugun = islemTarihi === todayDateKey();
  const seciliTarihLabel = formatDateLabelTr(islemTarihi);

  const tumAracLoglar = useMemo(
    () => [...iceridekiAraclar, ...aracGecmisLoglar],
    [iceridekiAraclar, aracGecmisLoglar]
  );
  const tumSuTankeriLoglar = useMemo(
    () => [...iceridekiSuTankerleri, ...suTankeriGecmisLoglar],
    [iceridekiSuTankerleri, suTankeriGecmisLoglar]
  );
  const tumVidanjorLoglar = useMemo(
    () => [...iceridekiVidanjorler, ...vidanjorGecmisLoglar],
    [iceridekiVidanjorler, vidanjorGecmisLoglar]
  );
  const tumPetrolTankeriLoglar = useMemo(
    () => [...iceridekiPetrolTankerleri, ...petrolTankeriGecmisLoglar],
    [iceridekiPetrolTankerleri, petrolTankeriGecmisLoglar]
  );
  const tumMiciStabilizeLoglar = useMemo(
    () => [...iceridekiMiciStabilize, ...miciStabilizeGecmisLoglar],
    [iceridekiMiciStabilize, miciStabilizeGecmisLoglar]
  );
  const tumZiyaretciLoglar = useMemo(
    () => [...aktifZiyaretciler, ...ziyaretciGecmisLoglar],
    [aktifZiyaretciler, ziyaretciGecmisLoglar]
  );

  const seciliGunPersonelLoglar = useMemo(
    () => filterGuvenlikLogsByTarih(personelLoglar, islemTarihi),
    [personelLoglar, islemTarihi]
  );
  const seciliGunAracLoglar = useMemo(
    () => filterGuvenlikLogsByTarih(tumAracLoglar, islemTarihi),
    [tumAracLoglar, islemTarihi]
  );
  const seciliGunSuTankeriLoglar = useMemo(
    () => filterGuvenlikLogsByTarih(tumSuTankeriLoglar, islemTarihi),
    [tumSuTankeriLoglar, islemTarihi]
  );
  const seciliGunMiciStabilizeLoglar = useMemo(
    () => filterGuvenlikLogsByTarih(tumMiciStabilizeLoglar, islemTarihi),
    [tumMiciStabilizeLoglar, islemTarihi]
  );
  const seciliGunZiyaretciLoglar = useMemo(
    () => filterGuvenlikLogsByTarih(tumZiyaretciLoglar, islemTarihi),
    [tumZiyaretciLoglar, islemTarihi]
  );
  const seciliGunEvraklar = useMemo(
    () => gelenEvraklar.filter((e) => normalizeDateKey(e.tarih) === normalizeDateKey(islemTarihi)),
    [gelenEvraklar, islemTarihi]
  );

  const canApproveEvrakDuvari = useMemo(() => {
    const y = String(userYetki || '')
      .trim()
      .toLocaleUpperCase('tr-TR');
    if (y === 'YÖNETİCİ' || y === 'KURUCU' || y === 'GÜVENLİK') return true;
    if (isFounderEmail(currentUser?.email)) return true;
    // Yetki henüz yüklenmediyse kapı ekranı zaten korumalı — onay açık
    if (!userYetki) return true;
    return false;
  }, [userYetki, currentUser?.email]);

  const evrakDuvariItems = useMemo((): EvrakDuvariItem[] => {
    const items: EvrakDuvariItem[] = [];
    const seenMicirIds = new Set<string>();

    (gelenEvraklar || []).forEach((e) => {
      const src = pickPrimaryFotoUrl(e) || e.fotoUrl || e.fisGorselUrl || '';
      if (!src) return;
      const micirFisId = String(e.micirFisId || '').trim();
      const isMicirKaynak =
        Boolean(micirFisId) ||
        String(e.kaynak || '').toUpperCase().includes('MICIR') ||
        String(e.evrakTuru || '').toUpperCase().includes('MICIR');
      if (isMicirKaynak && micirFisId) {
        seenMicirIds.add(micirFisId);
        const fis = (micirTumKayitlar || []).find((m) => m.id === micirFisId);
        const durum = fis?.durum || e.durum || 'BEKLEMEDE';
        items.push({
          id: `evrak-${e.id}`,
          src,
          title: e.evrakNo || fis?.irsaliyeNo || e.fileName || 'Mıcır irsaliye',
          meta: [e.firma || ENTO_MADEN_UNVAN, e.evrakTuru || 'İRSALİYE', durum]
            .filter(Boolean)
            .join(' · '),
          kategori: 'MICIR/STABILIZE',
          tarih: formatEvrakGonderimLabel(e) || e.tarih || e.islemTarihi || fis?.tarih || '',
          durum,
          sourceType: 'micirFis',
          sourceId: micirFisId,
          actionable: true,
        });
        return;
      }
      items.push({
        id: `evrak-${e.id}`,
        src,
        title: e.evrakNo || e.fileName || e.evrakTuru || 'Evrak',
        meta: [e.firma, e.evrakTuru, e.durum].filter(Boolean).join(' · '),
        kategori: e.evrakTuru || 'EVRAK',
        tarih: formatEvrakGonderimLabel(e) || e.tarih || e.islemTarihi || '',
        durum: e.durum || 'BEKLEMEDE',
        sourceType: 'gelenEvrak',
        sourceId: e.id,
        actionable: true,
      });
    });

    const tankerBuckets: Array<{ list: any[]; kategori: string }> = [
      { list: tumSuTankeriLoglar, kategori: 'SU TANKERİ' },
      { list: tumVidanjorLoglar, kategori: 'VİDANJÖR' },
      { list: tumPetrolTankeriLoglar, kategori: 'PETROL TANKERİ' },
      { list: tumMiciStabilizeLoglar, kategori: 'MICIR/STABILIZE' },
    ];
    tankerBuckets.forEach(({ list, kategori }) => {
      (list || []).forEach((t) => {
        const src = t.fotoUrl || t.fisGorselUrl || '';
        if (!src) return;
        const micirFisId = String(t.micirFisId || '').trim();
        if (kategori === 'MICIR/STABILIZE' && micirFisId) {
          if (seenMicirIds.has(micirFisId)) return;
          seenMicirIds.add(micirFisId);
          const fis = (micirTumKayitlar || []).find((m) => m.id === micirFisId);
          const durum = fis?.durum || t.onayDurumu || 'YONETICI_ONAYINDA';
          items.push({
            id: `tanker-${kategori}-${t.id}`,
            src,
            title: t.plaka || t.irsaliyeNo || kategori,
            meta: [
              t.firma || ENTO_MADEN_UNVAN,
              malzemeTipiLabel(t.malzemeTipi || fis?.malzemeTipi),
              formatMicirMiktarLabel(
                t.tonaj ?? fis?.tonaj,
                t.kiloKg ?? fis?.kiloKg ?? resolveMicirKiloKg(t)
              ),
              durum,
            ]
              .filter(Boolean)
              .join(' · '),
            kategori,
            tarih: t.islemTarihi || t.tarih || (t.girisZamani || '').slice(0, 10),
            durum,
            sourceType: 'micirFis',
            sourceId: micirFisId,
            actionable: true,
          });
          return;
        }
        items.push({
          id: `tanker-${kategori}-${t.id}`,
          src,
          title: t.plaka || t.irsaliyeNo || kategori,
          meta: [t.firma, t.malzeme, t.miktarKg ? `${t.miktarKg} kg` : null, t.kiloKg ? `${t.kiloKg} kg` : null]
            .filter(Boolean)
            .join(' · '),
          kategori,
          tarih: t.islemTarihi || t.tarih || (t.girisZamani || '').slice(0, 10),
          durum: undefined,
          sourceType: 'tanker',
          sourceId: t.id,
          actionable: false,
        });
      });
    });

    (micirTumKayitlar || []).forEach((m) => {
      const src = m.fotoUrl || m.fisGorselUrl || '';
      if (!src) return;
      if (seenMicirIds.has(m.id)) return;
      if (items.some((i) => i.id === `tanker-MICIR/STABILIZE-${m.id}` || i.sourceId === m.id)) return;
      seenMicirIds.add(m.id);
      const durum = m.durum || 'YONETICI_ONAYINDA';
      items.push({
        id: `micir-${m.id}`,
        src,
        title: m.plaka || m.irsaliyeNo || 'Mıcır irsaliye',
        meta: [
          m.firmaUnvan || m.firma || ENTO_MADEN_UNVAN,
          malzemeTipiLabel(m.malzemeTipi),
          formatMicirMiktarLabel(m.tonaj, m.kiloKg ?? resolveMicirKiloKg(m)),
          durum,
        ]
          .filter(Boolean)
          .join(' · '),
        kategori: 'MICIR/STABILIZE',
        tarih: m.islemTarihi || m.tarih || '',
        durum,
        sourceType: 'micirFis',
        sourceId: m.id,
        actionable: true,
      });
    });

    return items.sort((a, b) => {
      const ap = isEvrakBekleyen(a.durum) ? 0 : 1;
      const bp = isEvrakBekleyen(b.durum) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(b.tarih || '').localeCompare(String(a.tarih || ''));
    });
  }, [
    gelenEvraklar,
    tumSuTankeriLoglar,
    tumVidanjorLoglar,
    tumPetrolTankeriLoglar,
    tumMiciStabilizeLoglar,
    micirTumKayitlar,
  ]);

  const evrakDuvariBekleyenCount = useMemo(
    () => evrakDuvariItems.filter((i) => i.actionable !== false && isEvrakBekleyen(i.durum)).length,
    [evrakDuvariItems]
  );

  const handleEvrakDuvariApprove = async (item: EvrakDuvariItem) => {
    if (!item.sourceId) return;
    if (!window.confirm(`«${item.title}» evrakını onaylıyor musunuz?`)) return;
    const onaylayan = currentUser?.email || 'nobetci_guvenlik';
    try {
      if (item.sourceType === 'micirFis') {
        const fis =
          (micirTumKayitlar || []).find((m) => m.id === item.sourceId) ||
          (gelenEvraklar || [])
            .filter((e) => e.micirFisId === item.sourceId)
            .map((e) => ({
              id: item.sourceId!,
              tarih: e.tarih || islemTarihi,
              irsaliyeNo: e.evrakNo || '',
              plaka: e.plaka || '',
              tonaj: Number(e.tonaj) || 0,
              kiloKg: Number(e.kiloKg) || 0,
              malzemeTipi: e.malzemeTipi || 'MICIR',
              fisGorselUrl: e.fotoUrl || '',
              firmaUnvan: e.firma || ENTO_MADEN_UNVAN,
              guvenlikEvrakId: e.id,
              irsaliyeId: e.irsaliyeId,
              kapıLogId: e.kapıLogId || e.kapiLogId,
              durum: e.durum,
            }))[0];
        if (!fis?.id) {
          showStatus('error', 'Mıcır fişi bulunamadı.');
          return;
        }
        if (!isMicirFisPending(fis)) {
          showStatus('error', 'Bu fiş zaten işlenmiş.');
          return;
        }
        const micirTip: MicirMalzemeTipi = normalizeMicirMalzemeTipi(fis.malzemeTipi);
        const saMatch = findMatchingMicirSatinAlma(satinAlmaProp, irsaliyelerProp, micirTip, {
          preferredSaId: (fis as MicirStabilizeFis).saId,
          preferredSaKalemId: (fis as MicirStabilizeFis).saKalemId,
        });
        const result = await approveMicirFis({
          fis: fis as MicirStabilizeFis,
          correction: {
            tarih: String(fis.tarih || islemTarihi).slice(0, 10),
            irsaliyeNo: String(fis.irsaliyeNo || '').trim().toUpperCase(),
            plaka: String(fis.plaka || '').trim().toUpperCase(),
            tonaj: Number(fis.tonaj) || 0,
            kiloKg: resolveMicirKiloKg(fis),
            malzemeTipi: micirTip,
            fisGorselUrl: fis.fisGorselUrl || '',
            firmaUnvan: fis.firmaUnvan || ENTO_MADEN_UNVAN,
            cariKartId: fis.cariKartId,
            saId: (fis as MicirStabilizeFis).saId || saMatch?.sa.saId,
            saKalemId: (fis as MicirStabilizeFis).saKalemId || saMatch?.kalem.id,
          },
          onaylayan,
          cariKartlar: cariKartlarLive,
          setCariKartlar: setCariKartlarLive,
          satinAlmaTalepleri: satinAlmaProp,
          irsaliyeler: irsaliyelerProp,
        });
        showStatus(
          'success',
          result.saMatch
            ? `Mıcır/stabilize onaylandı · SA ${result.saMatch.sa.saId} bağlandı`
            : 'Mıcır / stabilize fişi onaylandı (irsaliye + cari; açık SA bulunamadı)'
        );
        void addNotification?.(
          `Evrak Duvarı: mıcır fişi onaylandı (${fis.irsaliyeNo || fis.id})${
            result.saMatch ? ` · SA ${result.saMatch.sa.saId}` : ''
          }`
        );
        return;
      }

      if (item.sourceType === 'gelenEvrak') {
        const e = (gelenEvraklar || []).find((x) => x.id === item.sourceId);
        if (!e) {
          showStatus('error', 'Evrak bulunamadı.');
          return;
        }
        const tur = String(e.evrakTuru || 'İRSALİYE').toLocaleUpperCase('tr-TR');
        if (tur === 'İRSALİYE' || tur === 'IRSALIYE') {
          const matched = doubleCheckKapiMatch(
            e.firma || '',
            e.kalemler || [],
            cariKartlarLive,
            stokKartlarLive
          );
          const { summary } = await finalizeKapiIrsaliyeApproval({
            guvenlikEvrakId: e.id,
            irsaliyeNo: e.evrakNo || e.id,
            firma: matched.summary.cariUnvan || e.firma || '',
            tarih: e.tarih || islemTarihi,
            fotoUrl: pickPrimaryFotoUrl(e) || e.fotoUrl || '',
            kalemler: matched.kalemler,
            onaylayan,
            cariKartlar: cariKartlarLive,
            stokKartlar: stokKartlarLive,
            setStokKartlar: setStokKartlarLive,
          });
          await updateDoc(doc(db, 'guvenlikGelenEvraklar', e.id), {
            durum: 'ONAYLANDI',
            onaylayanYonetici: onaylayan,
            islenenEvrakTuru: 'İRSALİYE',
            irsaliyeId: e.id,
            cariKartId: summary.cariKartId || '',
            matchSummary: summary,
            firma: summary.cariUnvan || e.firma || '',
            kalemler: matched.kalemler,
            onayTarihi: new Date().toISOString(),
          });
          showStatus('success', `İrsaliye onaylandı · ${formatKapiMatchLabel(summary)}`);
        } else {
          await updateDoc(doc(db, 'guvenlikGelenEvraklar', e.id), {
            durum: 'ONAYLANDI',
            onaylayanYonetici: onaylayan,
            islenenEvrakTuru: e.evrakTuru || tur,
            onayTarihi: new Date().toISOString(),
          });
          showStatus('success', 'Evrak onaylandı.');
        }
        void addNotification?.(`Evrak Duvarı: ${e.evrakNo || e.id} onaylandı`);
        return;
      }

      showStatus('error', 'Bu kayıt türü Evrak Duvarı’ndan onaylanamaz.');
    } catch (err: any) {
      console.error(err);
      showStatus('error', err?.message || 'Onay işlemi başarısız.');
    }
  };

  const handleEvrakDuvariReject = async (item: EvrakDuvariItem) => {
    if (!item.sourceId) return;
    if (!window.confirm(`«${item.title}» evrakını reddetmek istediğinize emin misiniz?`)) return;
    const onaylayan = currentUser?.email || 'nobetci_guvenlik';
    try {
      if (item.sourceType === 'micirFis') {
        const fis = (micirTumKayitlar || []).find((m) => m.id === item.sourceId);
        if (!fis?.id) {
          showStatus('error', 'Mıcır fişi bulunamadı.');
          return;
        }
        await rejectMicirFis({ fis: fis as MicirStabilizeFis, onaylayan });
        showStatus('success', 'Mıcır / stabilize fişi reddedildi.');
        return;
      }
      if (item.sourceType === 'gelenEvrak') {
        await updateDoc(doc(db, 'guvenlikGelenEvraklar', item.sourceId), {
          durum: 'REDDEDİLDİ',
          onaylayanYonetici: onaylayan,
          onayTarihi: new Date().toISOString(),
        });
        try {
          await updateDoc(doc(db, 'irsaliyeler', item.sourceId), {
            onayDurumu: 'REDDEDİLDİ',
            onaylayanYonetici: onaylayan,
            onayTarihi: new Date().toISOString(),
          });
        } catch {
          /* taslak yoksa sorun değil */
        }
        showStatus('success', 'Evrak reddedildi.');
        return;
      }
      showStatus('error', 'Bu kayıt türü Evrak Duvarı’ndan reddedilemez.');
    } catch (err: any) {
      console.error(err);
      showStatus('error', err?.message || 'Red işlemi başarısız.');
    }
  };
  const seciliGunNobetArsivleri = useMemo(
    () => nobetArsivleri.filter((a) => normalizeDateKey(a.tarih) === normalizeDateKey(islemTarihi)),
    [nobetArsivleri, islemTarihi]
  );

  const bugunkuPersonelLoglar = showGecmisKayitlar
    ? [...personelLoglar]
        .sort((a, b) => String(b.girisZamani || '').localeCompare(String(a.girisZamani || '')))
        .slice(0, 100)
    : seciliGunPersonelLoglar;
  const bugunkuAracLoglar = showGecmisKayitlar
    ? [...tumAracLoglar]
        .sort((a, b) => String(b.girisZamani || '').localeCompare(String(a.girisZamani || '')))
        .slice(0, 100)
    : seciliGunAracLoglar;
  const bugunkuSuTankeriLoglar = showGecmisKayitlar
    ? [...tumSuTankeriLoglar]
        .sort((a, b) => String(b.girisZamani || '').localeCompare(String(a.girisZamani || '')))
        .slice(0, 100)
    : seciliGunSuTankeriLoglar;
  const gorunenEvraklar = showGecmisKayitlar
    ? [...gelenEvraklar]
        .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')))
        .slice(0, 100)
    : seciliGunEvraklar;
  const gorunenZiyaretciLoglar = showGecmisKayitlar
    ? [...tumZiyaretciLoglar]
        .sort((a, b) => String(b.girisZamani || '').localeCompare(String(a.girisZamani || '')))
        .slice(0, 100)
    : seciliGunZiyaretciLoglar;

  const plakaQueryNorm = hizliPlakaQ.trim().toLocaleUpperCase('tr-TR');
  const filtreliIceridekiAraclar = useMemo(() => {
    if (!plakaQueryNorm) return iceridekiAraclar;
    return iceridekiAraclar.filter((a) =>
      String(a.plaka || '')
        .toLocaleUpperCase('tr-TR')
        .includes(plakaQueryNorm)
    );
  }, [iceridekiAraclar, plakaQueryNorm]);
  const filtreliBugunkuAracLoglar = useMemo(() => {
    if (!plakaQueryNorm) return bugunkuAracLoglar;
    return bugunkuAracLoglar.filter((a) =>
      String(a.plaka || '')
        .toLocaleUpperCase('tr-TR')
        .includes(plakaQueryNorm)
    );
  }, [bugunkuAracLoglar, plakaQueryNorm]);
  const hizliPlakaEslesen = useMemo(() => {
    if (!plakaQueryNorm) return [];
    return [...iceridekiAraclar, ...aracGecmisLoglar]
      .filter((a) =>
        String(a.plaka || '')
          .toLocaleUpperCase('tr-TR')
          .includes(plakaQueryNorm)
      )
      .slice(0, 6);
  }, [iceridekiAraclar, aracGecmisLoglar, plakaQueryNorm]);

  const togglePersonelLogSelect = (id: string) => {
    setSelectedPersonelLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAracLogSelect = (id: string) => {
    setSelectedAracLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSuTankeriLogSelect = (id: string) => {
    setSelectedSuTankeriLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSendSelectedPersonelLogsWp = () => {
    const selected = bugunkuPersonelLoglar.filter((l) => selectedPersonelLogIds.includes(l.id));
    if (selected.length === 0) {
      alert('WhatsApp için en az bir personel logu seçin.');
      return;
    }
    openWhatsAppText(buildPersonelLoglariWhatsAppText(selected, islemTarihi));
  };

  const handleSendSelectedAracLogsWp = () => {
    const selected = bugunkuAracLoglar.filter((l) => selectedAracLogIds.includes(l.id));
    if (selected.length === 0) {
      alert('WhatsApp için en az bir araç logu seçin.');
      return;
    }
    openWhatsAppText(buildAracLoglariWhatsAppText(selected, islemTarihi));
  };

  const handleSendSelectedSuTankeriLogsWp = () => {
    const selected = bugunkuSuTankeriLoglar.filter((l) => selectedSuTankeriLogIds.includes(l.id));
    if (selected.length === 0) {
      alert('WhatsApp için en az bir su tankeri logu seçin.');
      return;
    }
    openWhatsAppText(buildSuTankeriLoglariWhatsAppText(selected, islemTarihi));
  };

  const handleSuTankeriGunlukRaporWp = () => {
    if (bugunkuSuTankeriLoglar.length === 0) {
      alert('Bugün için su tankeri kaydı yok.');
      return;
    }
    openWhatsAppText(buildSuTankeriLoglariWhatsAppText(bugunkuSuTankeriLoglar, islemTarihi));
  };

  const handleZiyaretciWhatsApp = (z: any) => {
    openWhatsAppText(buildZiyaretciWhatsAppText(z));
  };

  const handleAkvizyonRaporIndir = () => {
    const rows = akvizyonPersoneller.map((p) => {
      const raw = akvizyonYoklamaMap[p.id];
      const durum = raw === 'Geldi' ? 'VAR' : raw === 'Gelmedi' ? 'YOK' : 'BELİRTİLMEDİ';
      return { ad: p.ad, soyad: p.soyad, gorev: p.gorev || '', durum };
    });
    const html = buildAkvizyonYoklamaReportHtml(islemTarihi, rows);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akvizyon_yoklama_${islemTarihi}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('success', 'Akvizyon yoklama raporu indirildi.');
  };

  const handleAkvizyonWpRapor = () => {
    const lines = [
      '📋 *Akvizyon (Taşeron) Günlük Yoklama*',
      `Tarih: ${islemTarihi}`,
      `Personel: ${akvizyonPersoneller.length}`,
      '',
      ...akvizyonPersoneller.map((p, i) => {
        const durum = akvizyonYoklamaMap[p.id] || 'Girilmedi';
        return `${i + 1}. ${p.ad} ${p.soyad} — *${durum}*`;
      }),
      '',
      '_Ana firma puantajından bağımsızdır._',
    ];
    openWhatsAppText(lines.join('\n'));
  };

  // 🔒 Authorization lock check
  const isAuthorized = canAccessGuvenlikScreen(userYetki, currentUser?.email);
  if (userYetki && !isAuthorized) {
    return (
      <div className="flex-1 min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none text-slate-800">
        <div className="w-20 h-20 bg-rose-100 border border-rose-200 text-rose-600 rounded-3xl flex items-center justify-center mb-6">
          <Lock size={40} className="stroke-[2]" />
        </div>
        <h1 className="text-xl font-black text-slate-900 tracking-widest uppercase mb-2">🚧 YETKİSİZ ERİŞİM ENGELLENDİ</h1>
        <p className="text-sm text-slate-600 max-w-md leading-relaxed font-sans mb-6">
          Şantiye güvenliği ve veri bütünlüğü nedeniyle Güvenlik Kapısı Ekranı sadece yetkili <span className="text-amber-600 font-bold">GÜVENLİK</span>, <span className="text-amber-600 font-bold">KURUCU</span> ve <span className="text-amber-600 font-bold">YÖNETİCİ</span> personeline açıktır.
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
          <KibritciLogo size="sm" className="h-9" />
          <div>
            <h1 className="text-sm font-black text-slate-850 tracking-widest uppercase">🚧 ŞANTİYE GÜVENLİK KAPISI</h1>
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

      {/* Mobil kapı kısayolları + hızlı plaka — büyük dokunma hedefleri */}
      {(isStandalone || viewMode === 'mobile') && (
        <div className="shrink-0 px-3 pt-3 pb-2 bg-slate-50 border-b border-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'irsaliye' as const, label: 'Evrak', icon: FileText, tone: 'bg-amber-500 text-slate-950' },
              { key: 'arac' as const, label: 'Araç', icon: Truck, tone: 'bg-sky-600 text-white' },
              { key: 'mici_stabilize' as const, label: 'Mıcır+', icon: Truck, tone: 'bg-emerald-600 text-white' },
              { key: 'evrak_galerisi' as const, label: 'Evrak Duvarı', icon: Images, tone: 'bg-[#0F6C5C] text-white' },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`min-h-[52px] rounded-2xl px-3 py-3 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wide border transition active:scale-[0.98] cursor-pointer ${
                    active
                      ? `${item.tone} border-transparent shadow-md`
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={hizliPlakaQ}
              onChange={(e) => setHizliPlakaQ(e.target.value.toLocaleUpperCase('tr-TR'))}
              placeholder="Hızlı plaka ara…"
              className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl pl-9 pr-3 text-xs font-mono font-bold tracking-wider"
              inputMode="text"
              autoCapitalize="characters"
            />
          </div>
          {plakaQueryNorm && (
            <div className="space-y-1">
              {hizliPlakaEslesen.length === 0 ? (
                <p className="text-[10px] text-slate-500 px-1">Eşleşen plaka yok</p>
              ) : (
                hizliPlakaEslesen.map((a) => (
                  <button
                    key={`hizli-${a.id}`}
                    type="button"
                    onClick={() => setActiveTab('arac')}
                    className="w-full text-left bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:border-sky-300"
                  >
                    <span className="font-mono font-black text-xs text-slate-900">{a.plaka}</span>
                    <span className="text-[10px] text-slate-500 truncate">
                      {a.durum === 'İÇERİDE' ? 'İçeride' : 'Çıkmış'} · {a.firma || a.aracTipi || '—'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
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
              onClick={() => {
                setActiveTab('su_tankeri');
                setStFirma((prev) => prev.trim() || 'YILDIRIM TANKER');
              }}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'su_tankeri' ? 'bg-sky-600 text-white shadow-md shadow-sky-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Droplets size={13} /> <span>4. Su Tankeri</span></span>
              {iceridekiSuTankerleri.length > 0 && (
                <span className="text-[9px] font-mono bg-sky-500/20 text-sky-600 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{iceridekiSuTankerleri.length}</span>
              )}
            </button>

            <button 
              onClick={() => {
                setActiveTab('vidanjor');
                setStFirma((prev) => prev.trim() || 'ŞEKER VİDANJÖR');
              }}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'vidanjor' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Droplets size={13} className="rotate-180" /> <span>5. Vidanjör</span></span>
              {iceridekiVidanjorler.length > 0 && (
                <span className="text-[9px] font-mono bg-indigo-500/20 text-indigo-400 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{iceridekiVidanjorler.length}</span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('petrol_tankeri')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'petrol_tankeri' ? 'bg-rose-600 text-white shadow-md shadow-rose-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Fuel size={13} /> <span>6. Petrol Tankeri</span></span>
              {iceridekiPetrolTankerleri.length > 0 && (
                <span className="text-[9px] font-mono bg-rose-500/20 text-rose-400 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{iceridekiPetrolTankerleri.length}</span>
              )}
            </button>

            <button 
              onClick={() => {
                setActiveTab('mici_stabilize');
                setStFirma(ENTO_MADEN_UNVAN);
              }}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'mici_stabilize' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Truck size={13} /> <span>7. Mıcır / Stabilize / Taş Tozu</span></span>
              {iceridekiMiciStabilize.length > 0 && (
                <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-400 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{iceridekiMiciStabilize.length}</span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('ziyaretci')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'ziyaretci' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><UserCheck size={13} /> <span>8. Ziyaretçi Defteri</span></span>
              {aktifZiyaretciler.length > 0 && (
                <span className="text-[9px] font-mono bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.2 ml-1 hidden lg:inline">{aktifZiyaretciler.length}</span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('nobet_arsivi')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'nobet_arsivi' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Archive size={13} /> <span>9. Nöbet Kapat &amp; Arşiv</span></span>
            </button>

            <button 
              onClick={() => setActiveTab('akvizyon_yoklama')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'akvizyon_yoklama' ? 'bg-amber-600 text-slate-950 shadow-md shadow-amber-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><ClipboardList size={13} /> <span>10. Akvizyon Yoklama</span></span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('evrak_galerisi')}
              className={`flex-1 lg:flex-none flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition cursor-pointer min-w-[120px] ${activeTab === 'evrak_galerisi' ? 'bg-[#0F6C5C] text-white shadow-md shadow-teal-700/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2">
                <Images size={13} /> <span>11. Evrak Duvarı</span>
                {evrakDuvariBekleyenCount > 0 ? (
                  <span
                    className={`text-[9px] font-mono rounded-full px-1.5 py-0.5 ml-1 ${
                      activeTab === 'evrak_galerisi'
                        ? 'bg-amber-400 text-slate-900'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {evrakDuvariBekleyenCount}
                  </span>
                ) : (
                  evrakDuvariItems.length > 0 && (
                    <span className="text-[9px] font-mono bg-teal-500/15 text-teal-700 rounded-full px-1.5 py-0.5 ml-1 hidden lg:inline">
                      {evrakDuvariItems.length}
                    </span>
                  )
                )}
              </span>
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
          
          {activeTab === 'irsaliye' && (
            <div className="space-y-6">
              <GuvenlikTabDateBar
                islemTarihi={islemTarihi}
                onTarihChange={setIslemTarihi}
                tabLabel="Evrak Girişi"
                logCount={gorunenEvraklar.length}
                archivedCount={seciliGunNobetArsivleri.length}
                onGoster={() => handleGosterSeciliGun('Evrak Girişi', seciliGunEvraklar.length)}
                onGecmisGoster={() =>
                  setShowGecmisKayitlar((v) => {
                    const next = !v;
                    showStatus(
                      'success',
                      next ? 'Geçmiş kayıtlar gösteriliyor.' : 'Seçili gün kayıtlarına dönüldü.'
                    );
                    return next;
                  })
                }
                gecmisAktif={showGecmisKayitlar}
                onKaydet={handleSendQueueToManager}
                kaydetLabel="Kuyruğu Kaydet"
                kaydetDisabled={
                  uploadQueue.length === 0 || uploadQueue.some(isUploadPackageIncomplete)
                }
                kaydetLoading={loadingIrsaliye}
                onGuncelle={() => {
                  if (seciliGunEvraklar[0]) {
                    openEvrakDuzenle(seciliGunEvraklar[0]);
                    showStatus('success', 'İlk kayıt düzenleme için açıldı. Listeden Düzenle ile de seçebilirsiniz.');
                  } else {
                    showStatus('error', 'Güncellenecek evrak yok.');
                  }
                }}
                guncelleDisabled={seciliGunEvraklar.length === 0}
                onSil={() => {
                  if (seciliGunEvraklar.length === 0) return;
                  handleDeleteEvrak(seciliGunEvraklar[0].id);
                }}
                silDisabled={seciliGunEvraklar.length === 0}
              />
              
              {/* 1. YENİ EVRAK YÜKLEME ALANI — önce firma türü */}
              <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <span className="font-display font-black text-xs text-slate-800 uppercase tracking-widest block border-b pb-2">
                  📄 KAPIDA EVRAK GİRİŞİ
                </span>
                <p className="text-[10px] text-slate-600 -mt-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 leading-relaxed">
                  <strong>1. adım:</strong> Evrak <strong>Ana Firma (Kibritçi İnşaat)</strong> mı yoksa{' '}
                  <strong>Taşeron Firma</strong> mı? Taşeron için geliş tarihi + evrak cinsi + foto yeter;
                  cariye işlenir. Ana Firma için gönderen firma, kalem/kilo ve <strong>3 foto</strong> zorunlu;
                  yönetici onayına gider.
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleNewUploadPackage}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold px-4 py-2 rounded-xl cursor-pointer"
                  >
                    + Yeni evrak paketi
                  </button>
                  <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-4 py-2 rounded-xl cursor-pointer border border-slate-200">
                    Hızlı: kalem yuvasına çoklu foto
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center text-[11px] text-slate-500 font-semibold">
                    Henüz paket yok. «Yeni evrak paketi» ile 3 yuvayı doldurun veya hızlı yükleme kullanın.
                  </div>
                ) : (
                  <div className="space-y-4 pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[10px] text-indigo-600 uppercase tracking-wider">
                        Kuyruktaki paketler ({uploadQueue.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setUploadQueue([])}
                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Tümünü Temizle
                      </button>
                    </div>

                    {uploadQueue.map((item, index) => (
                      <div
                        key={item.id}
                        className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3 shadow-sm relative"
                      >
                        <button
                          type="button"
                          onClick={() => setUploadQueue((prev) => prev.filter((x) => x.id !== item.id))}
                          className="absolute top-2 right-2 text-rose-500 hover:bg-rose-50 p-1 rounded-full cursor-pointer"
                          title="Paketi kaldır"
                        >
                          <X size={14} />
                        </button>

                        {/* 1) Firma türü — Ana Firma / Taşeron */}
                        <div className="pr-6 space-y-2">
                          <label className="text-[8px] font-black text-slate-500 uppercase block">
                            Evrak hangi firmaya? *
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...uploadQueue];
                                next[index] = {
                                  ...next[index],
                                  firmaKaynakTipi: 'ANA_FIRMA',
                                  firma: '',
                                  cariKartId: '',
                                  evrakTuru: 'İRSALİYE',
                                  kalemler: next[index].kalemler?.length
                                    ? next[index].kalemler
                                    : [createEmptyUploadKalem()],
                                };
                                setUploadQueue(next);
                              }}
                              className={`py-2.5 rounded-xl text-[10px] font-black border-2 cursor-pointer ${
                                item.firmaKaynakTipi === 'ANA_FIRMA'
                                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'
                              }`}
                            >
                              Ana Firma · Kibritçi İnşaat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...uploadQueue];
                                next[index] = {
                                  ...next[index],
                                  firmaKaynakTipi: 'TASERON',
                                  firma: '',
                                  cariKartId: '',
                                  kalemler: [],
                                  saId: '',
                                  evrakNo: '',
                                };
                                setUploadQueue(next);
                              }}
                              className={`py-2.5 rounded-xl text-[10px] font-black border-2 cursor-pointer ${
                                item.firmaKaynakTipi === 'TASERON'
                                  ? 'bg-teal-600 text-white border-teal-700'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-teal-50'
                              }`}
                            >
                              Taşeron Firma
                            </button>
                          </div>
                        </div>

                        {!item.firmaKaynakTipi ? (
                          <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-semibold">
                            Devam etmek için yukarıdan Ana Firma veya Taşeron seçin.
                          </p>
                        ) : item.firmaKaynakTipi === 'TASERON' ? (
                          <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                            <p className="text-[9px] font-black uppercase text-teal-900 tracking-wider">
                              Taşeron evrak · geliş {islemTarihi}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-500 uppercase block">
                                  Taşeron firma *
                                </label>
                                <select
                                  value={item.cariKartId || ''}
                                  onChange={(e) => {
                                    const id = e.target.value;
                                    const c = taseronCariler.find((x) => x.id === id);
                                    const next = [...uploadQueue];
                                    next[index] = {
                                      ...next[index],
                                      cariKartId: id,
                                      firma: c?.unvan || '',
                                    };
                                    setUploadQueue(next);
                                  }}
                                  className="w-full bg-white border border-teal-200 p-1.5 rounded-lg text-xs font-bold"
                                >
                                  <option value="">Taşeron seçin…</option>
                                  {taseronCariler.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.unvan} ({c.kod})
                                    </option>
                                  ))}
                                </select>
                                {taseronCariler.length === 0 && (
                                  <p className="text-[9px] text-rose-600 font-semibold">
                                    Taşeron cari kartı yok — Cari/Stok’tan TASERON ekleyin.
                                  </p>
                                )}
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-500 uppercase block">
                                  Evrak cinsi *
                                </label>
                                <select
                                  value={item.evrakTuru}
                                  onChange={(e) => {
                                    const next = [...uploadQueue];
                                    next[index] = { ...next[index], evrakTuru: e.target.value as any };
                                    setUploadQueue(next);
                                  }}
                                  className="w-full bg-white border border-teal-200 p-1.5 rounded-lg text-xs"
                                >
                                  <option value="İRSALİYE">İrsaliye / Taşıma</option>
                                  <option value="FATURA">Fatura</option>
                                  <option value="MAKBUZ">Makbuz</option>
                                  <option value="GENEL_EVRAK">Genel evrak / Teslim</option>
                                </select>
                              </div>
                            </div>
                            <div className="space-y-1 text-xs">
                              <label className="text-[8px] font-black text-slate-500 uppercase block">
                                Not (opsiyonel)
                              </label>
                              <input
                                type="text"
                                value={item.aciklama}
                                onChange={(e) => {
                                  const next = [...uploadQueue];
                                  next[index] = { ...next[index], aciklama: e.target.value };
                                  setUploadQueue(next);
                                }}
                                placeholder="Kısa not…"
                                className="w-full bg-white border border-teal-200 p-1.5 rounded-lg text-xs"
                              />
                            </div>
                            <p className="text-[9px] text-teal-800 font-semibold">
                              Kaydıyla seçili taşeron carinin alt işlemlerine işlenir. En az 1 foto yeterlidir.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {([
                                ['FIRMA', 'firmaFotolar'],
                                ['KALEM', 'kalemFotolar'],
                                ['FATURA', 'faturaFotolar'],
                              ] as const).map(([metod, key]) => {
                                const list = (item[key] || []) as GuvenlikFotoSlot[];
                                return (
                                  <div
                                    key={metod}
                                    className="rounded-xl border border-teal-100 bg-white p-2.5 space-y-2"
                                  >
                                    <div>
                                      <p className="text-[9px] font-black uppercase text-teal-800 tracking-wide">
                                        {GUVENLIK_FOTO_METOD_LABEL[metod]}
                                      </p>
                                      <p className="text-[8px] text-slate-400 font-semibold">
                                        {GUVENLIK_FOTO_METOD_HINT[metod]}
                                      </p>
                                    </div>
                                    <label className="flex flex-col items-center justify-center gap-1 border border-dashed border-teal-200 rounded-lg py-3 cursor-pointer hover:bg-teal-50/50 transition">
                                      <FileUp size={16} className="text-teal-600" />
                                      <span className="text-[9px] font-bold text-teal-800">Foto ekle</span>
                                      <input
                                        type="file"
                                        multiple
                                        accept="image/*,application/pdf"
                                        className="hidden"
                                        onChange={(e) => handleAddFotosToPackage(item.id, metod, e)}
                                      />
                                    </label>
                                    {list.length > 0 && (
                                      <div className="grid grid-cols-3 gap-1">
                                        {list.map((f) => (
                                          <div key={f.id} className="relative group">
                                            {String(f.fileType || '').startsWith('image/') ||
                                            isLikelyImageUrl(f.dataUrl) ? (
                                              <img
                                                src={f.dataUrl}
                                                alt={f.fileName}
                                                className="w-full h-14 object-cover rounded-md border border-slate-200"
                                              />
                                            ) : (
                                              <div className="h-14 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-[9px] font-bold text-slate-500">
                                                PDF
                                              </div>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleRemoveFotoFromPackage(item.id, metod, f.id)
                                              }
                                              className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 text-[9px] leading-none opacity-90 cursor-pointer"
                                              title="Kaldır"
                                            >
                                              ×
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-[8px] text-slate-400 font-bold">{list.length} foto</p>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[9px] text-slate-500 font-semibold">
                              Toplam foto: {countPaketFotolar(item)}
                              {!countPaketFotolar(item) ? ' — en az bir foto ekleyin' : ''}
                            </p>
                          </div>
                        ) : (
                          <>
                        <div className="rounded-xl border border-amber-300 bg-amber-50/60 px-3 py-2 text-[9px] text-amber-950 font-semibold leading-relaxed">
                          <strong>Ana Firma · Kibritçi İnşaat</strong> — Gönderen firma, kalem/kilo ve 3 foto
                          (firma ismi · ürünler · tam hali) zorunlu. Yönetici onayına gider.
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pr-6">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase block">Evrak Türü *</label>
                            <select
                              value={item.evrakTuru}
                              onChange={(e) => {
                                const next = [...uploadQueue];
                                const tur = e.target.value;
                                next[index] = {
                                  ...next[index],
                                  evrakTuru: tur as any,
                                  kalemler:
                                    tur === 'İRSALİYE' && !(next[index].kalemler || []).length
                                      ? [createEmptyUploadKalem()]
                                      : next[index].kalemler || [createEmptyUploadKalem()],
                                };
                                setUploadQueue(next);
                              }}
                              className="w-full bg-white border border-slate-200 p-1.5 rounded-lg text-xs"
                            >
                              <option value="İRSALİYE">📄 İRSALİYE / TAŞIMA</option>
                              <option value="FATURA">💰 FATURA</option>
                              <option value="MAKBUZ">🎫 MAKBUZ</option>
                              <option value="GENEL_EVRAK">📦 GENEL EVRAK / TESLİM</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase block">Açıklama *</label>
                            <input
                              type="text"
                              value={item.aciklama}
                              onChange={(e) => {
                                const next = [...uploadQueue];
                                next[index] = { ...next[index], aciklama: e.target.value };
                                setUploadQueue(next);
                              }}
                              placeholder="Kısa açıklama…"
                              className="w-full bg-white border border-slate-200 p-1.5 rounded-lg text-xs"
                            />
                          </div>
                        </div>

                        {(item.evrakTuru === 'İRSALİYE' || item.evrakTuru === 'FATURA') && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5">
                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-900">
                              {item.evrakTuru === 'İRSALİYE'
                                ? 'İrsaliye / taşıma rehberi (zorunlu)'
                                : 'Fatura rehberi'}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-500 uppercase block">
                                  {item.evrakTuru === 'İRSALİYE' ? 'İrsaliye / Taşıma No *' : 'Fatura No'}
                                </label>
                                <input
                                  type="text"
                                  value={item.evrakNo || ''}
                                  onChange={(e) => {
                                    const next = [...uploadQueue];
                                    next[index] = { ...next[index], evrakNo: e.target.value };
                                    setUploadQueue(next);
                                  }}
                                  placeholder="Evrak üzerindeki numara"
                                  className="w-full bg-white border border-amber-200 p-1.5 rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-500 uppercase block">
                                  Plaka (taşıma)
                                </label>
                                <input
                                  type="text"
                                  value={item.plaka || ''}
                                  onChange={(e) => {
                                    const next = [...uploadQueue];
                                    next[index] = { ...next[index], plaka: e.target.value.toLocaleUpperCase('tr-TR') };
                                    setUploadQueue(next);
                                  }}
                                  placeholder="34 ABC 123"
                                  className="w-full bg-white border border-amber-200 p-1.5 rounded-lg text-xs font-mono font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1 text-xs">
                          <label className="text-[8px] font-black text-slate-500 uppercase block">
                            Gönderen firma ismi *
                          </label>
                          <input
                            type="text"
                            placeholder="Evraktaki gönderen firma unvanı…"
                            value={item.firma || ''}
                            onChange={(e) => {
                              const next = [...uploadQueue];
                              next[index] = { ...next[index], firma: e.target.value, cariKartId: '' };
                              setUploadQueue(next);
                            }}
                            className="w-full bg-white border border-slate-200 p-1.5 rounded-lg text-xs"
                          />
                          {item.cariKartId ? (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[9px] font-bold text-teal-700">✓ Cari seçildi · {item.firma}</p>
                              <button
                                type="button"
                                className="text-[9px] font-bold text-slate-500 underline cursor-pointer"
                                onClick={() => {
                                  const next = [...uploadQueue];
                                  next[index] = { ...next[index], cariKartId: '' };
                                  setUploadQueue(next);
                                }}
                              >
                                Değiştir
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {suggestCariFromDb(item.firma || '', cariKartlarLive, 4).map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => {
                                    const next = [...uploadQueue];
                                    next[index] = { ...next[index], firma: o.unvan, cariKartId: o.id };
                                    setUploadQueue(next);
                                  }}
                                  className="text-[9px] font-bold px-2 py-1 rounded-lg border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 cursor-pointer"
                                >
                                  {o.unvan}
                                </button>
                              ))}
                              {String(item.firma || '').trim().length >= 3 &&
                                suggestCariFromDb(item.firma || '', cariKartlarLive, 1).length === 0 && (
                                  <span className="text-[9px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg">
                                    Cari yok → gönderimde oluşturulacak
                                  </span>
                                )}
                            </div>
                          )}
                        </div>

                        {item.evrakTuru === 'İRSALİYE' && (
                          <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[9px] font-black uppercase text-indigo-700 tracking-wider">
                                Gönderilen kalemler · isim + kilo *
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...uploadQueue];
                                  const kalemler = [...(next[index].kalemler || []), createEmptyUploadKalem()];
                                  next[index] = { ...next[index], kalemler };
                                  setUploadQueue(next);
                                }}
                                className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg cursor-pointer"
                              >
                                + Kalem
                              </button>
                            </div>
                            {(item.kalemler || [createEmptyUploadKalem()]).map((k: any, ki: number) => {
                              const stokOneriler = suggestStokFromDb(k.urunAdi || '', stokKartlarLive, 3);
                              return (
                                <div key={k.id || ki} className="rounded-lg border border-slate-150 bg-slate-50/80 p-2 space-y-1.5">
                                  <div className="grid grid-cols-12 gap-1.5">
                                    <input
                                      type="text"
                                      value={k.urunAdi || ''}
                                      onChange={(e) => {
                                        const next = [...uploadQueue];
                                        const kalemler = [...(next[index].kalemler || [])];
                                        kalemler[ki] = { ...kalemler[ki], urunAdi: e.target.value, stokKartId: '' };
                                        next[index] = { ...next[index], kalemler };
                                        setUploadQueue(next);
                                      }}
                                      placeholder="Malzeme / ürün adı"
                                      className="col-span-6 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold"
                                    />
                                    <input
                                      type="number"
                                      value={k.miktar || ''}
                                      onChange={(e) => {
                                        const next = [...uploadQueue];
                                        const kalemler = [...(next[index].kalemler || [])];
                                        kalemler[ki] = { ...kalemler[ki], miktar: e.target.value };
                                        next[index] = { ...next[index], kalemler };
                                        setUploadQueue(next);
                                      }}
                                      placeholder="Miktar"
                                      className="col-span-3 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold"
                                    />
                                    <select
                                      value={k.birim || 'KG'}
                                      onChange={(e) => {
                                        const next = [...uploadQueue];
                                        const kalemler = [...(next[index].kalemler || [])];
                                        kalemler[ki] = { ...kalemler[ki], birim: e.target.value };
                                        next[index] = { ...next[index], kalemler };
                                        setUploadQueue(next);
                                      }}
                                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-1 py-1.5 text-[10px] font-bold"
                                    >
                                      <option value="KG">KG</option>
                                      <option value="TON">TON</option>
                                      <option value="Adet">Adet</option>
                                      <option value="M3">M3</option>
                                      <option value="Lt">Lt</option>
                                    </select>
                                    <button
                                      type="button"
                                      title="Kalemi sil"
                                      onClick={() => {
                                        const next = [...uploadQueue];
                                        const kalemler = (next[index].kalemler || []).filter((_: any, i: number) => i !== ki);
                                        next[index] = {
                                          ...next[index],
                                          kalemler: kalemler.length ? kalemler : [createEmptyUploadKalem()],
                                        };
                                        setUploadQueue(next);
                                      }}
                                      className="col-span-1 text-rose-500 font-black text-sm cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  {k.stokKartId ? (
                                    <p className="text-[9px] font-bold text-teal-700">
                                      ✓ Stok:{' '}
                                      {stokKartlarLive.find((s) => s.id === k.stokKartId)?.stokAdi || k.stokKartId}
                                    </p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {stokOneriler.map((s) => (
                                        <button
                                          key={s.id}
                                          type="button"
                                          onClick={() => {
                                            const next = [...uploadQueue];
                                            const kalemler = [...(next[index].kalemler || [])];
                                            kalemler[ki] = {
                                              ...kalemler[ki],
                                              stokKartId: s.id,
                                              urunAdi: kalemler[ki].urunAdi || s.stokAdi,
                                              birim: kalemler[ki].birim || s.birim || 'KG',
                                            };
                                            next[index] = { ...next[index], kalemler };
                                            setUploadQueue(next);
                                          }}
                                          className="text-[8px] font-bold px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-800 cursor-pointer"
                                        >
                                          {s.stokAdi}
                                        </button>
                                      ))}
                                      {String(k.urunAdi || '').trim().length >= 2 && stokOneriler.length === 0 && (
                                        <span className="text-[8px] text-slate-400 font-semibold">
                                          Stok eşleşmedi — yönetici bağlar
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {item.evrakTuru === 'İRSALİYE' && (
                          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-teal-900">
                              Satın alma eşleşmesi (karşılaştırma)
                            </p>
                            <p className="text-[9px] text-teal-800/80 font-semibold leading-snug">
                              Eşleşirse zincire bağlanır; eşleşmezse arşiv / doğrudan sevk kalır. Otomatik bağlanmaz.
                            </p>
                            {item.saId ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold text-teal-800">
                                  ✓ SA bağlı · {item.saId}
                                </span>
                                <button
                                  type="button"
                                  className="text-[9px] font-bold text-slate-500 underline cursor-pointer"
                                  onClick={() => {
                                    const next = [...uploadQueue];
                                    next[index] = { ...next[index], saId: '' };
                                    setUploadQueue(next);
                                  }}
                                >
                                  Kaldır
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {suggestSatinAlmaForKapiEvrak({
                                  firma: item.firma,
                                  cariKartId: item.cariKartId,
                                  kalemler: item.kalemler || [],
                                  satinAlmaTalepleri: satinAlmaProp,
                                  irsaliyeler: irsaliyelerProp,
                                  limit: 4,
                                }).map((o) => (
                                  <button
                                    key={o.saId}
                                    type="button"
                                    title={o.reason}
                                    onClick={() => {
                                      const ok = window.confirm(
                                        `Satın alma ${o.saId} (${o.cariFirma}) ile irsaliye bağlansın mı?\n\n` +
                                          `İlgili satın alma talebine irsaliye oluşturmak / bağlamak ister misiniz?`
                                      );
                                      if (!ok) return;
                                      const next = [...uploadQueue];
                                      next[index] = { ...next[index], saId: o.saId };
                                      setUploadQueue(next);
                                    }}
                                    className="text-[9px] font-bold px-2 py-1 rounded-lg border border-teal-300 bg-white text-teal-900 hover:bg-teal-100 cursor-pointer"
                                  >
                                    {o.saId}
                                    <span className="block text-[7px] font-semibold text-teal-600 truncate max-w-[140px]">
                                      {o.cariFirma}
                                    </span>
                                  </button>
                                ))}
                                {suggestSatinAlmaForKapiEvrak({
                                  firma: item.firma,
                                  cariKartId: item.cariKartId,
                                  kalemler: item.kalemler || [],
                                  satinAlmaTalepleri: satinAlmaProp,
                                  irsaliyeler: irsaliyelerProp,
                                  limit: 1,
                                }).length === 0 &&
                                  String(item.firma || '').trim().length >= 2 && (
                                    <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
                                      Açık SA yok → arşiv / doğrudan sevk
                                    </span>
                                  )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {([
                            ['FIRMA', 'firmaFotolar'],
                            ['KALEM', 'kalemFotolar'],
                            ['FATURA', 'faturaFotolar'],
                          ] as const).map(([metod, key]) => {
                            const list = (item[key] || []) as GuvenlikFotoSlot[];
                            return (
                              <div
                                key={metod}
                                className="rounded-xl border border-indigo-100 bg-white p-2.5 space-y-2"
                              >
                                <div>
                                  <p className="text-[9px] font-black uppercase text-indigo-700 tracking-wide">
                                    {GUVENLIK_FOTO_METOD_LABEL[metod]}
                                  </p>
                                  <p className="text-[8px] text-slate-400 font-semibold">
                                    {GUVENLIK_FOTO_METOD_HINT[metod]}
                                  </p>
                                </div>
                                <label className="flex flex-col items-center justify-center gap-1 border border-dashed border-indigo-200 rounded-lg py-3 cursor-pointer hover:bg-indigo-50/50 transition">
                                  <FileUp size={16} className="text-indigo-500" />
                                  <span className="text-[9px] font-bold text-indigo-700">Foto ekle</span>
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => handleAddFotosToPackage(item.id, metod, e)}
                                  />
                                </label>
                                {list.length > 0 && (
                                  <div className="grid grid-cols-3 gap-1">
                                    {list.map((f) => (
                                      <div key={f.id} className="relative group">
                                        {String(f.fileType || '').startsWith('image/') || isLikelyImageUrl(f.dataUrl) ? (
                                          <img
                                            src={f.dataUrl}
                                            alt={f.fileName}
                                            className="w-full h-14 object-cover rounded-md border border-slate-200"
                                          />
                                        ) : (
                                          <div className="h-14 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-[9px] font-bold text-slate-500">
                                            PDF
                                          </div>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveFotoFromPackage(item.id, metod, f.id)}
                                          className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 text-[9px] leading-none opacity-90 cursor-pointer"
                                          title="Kaldır"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="text-[8px] text-slate-400 font-bold">{list.length} foto</p>
                              </div>
                            );
                          })}
                        </div>

                        <p className="text-[9px] text-slate-500 font-semibold">
                          Toplam foto: {countPaketFotolar(item)}
                          {!hasAnaFirmaUcFotograf(item)
                            ? ' — 3 yuvanın her birine en az 1 foto ekleyin'
                            : ' — 3 foto tamam ✓'}
                        </p>
                          </>
                        )}
                      </div>
                    ))}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSendQueueToManager}
                        disabled={uploadQueue.some(isUploadPackageIncomplete)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {loadingIrsaliye
                          ? 'Gönderiliyor... (iptal için tekrar basın)'
                          : '🚀 KAYDET / ONAYA GÖNDER'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. ARŞİV & GÖNDERİLEN EVRAKLAR LİSTESİ */}
              <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-2 gap-3">
                  <div>
                    <span className="font-display font-black text-xs text-slate-800 uppercase tracking-widest block">
                      🗂️ GÖNDERİLEN EVRAK HAREKETLERİ LİSTESİ
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                      Onaylanan, reddedilen veya bekleyen tüm kayıtlar.
                    </span>
                  </div>

                  {/* Arama ve Filtreler */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
                      <input
                        type="text"
                        placeholder="Evrak / Firma / Açıklama Ara..."
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs w-48 focus:outline-none"
                      />
                    </div>
                    
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as any)}
                      className="border border-slate-200 py-1.5 px-2 rounded-lg text-xs bg-white"
                    >
                      <option value="HEPSİ">Tüm Türler</option>
                      <option value="İRSALİYE">İrsaliye</option>
                      <option value="FATURA">Fatura</option>
                      <option value="MAKBUZ">Makbuz</option>
                      <option value="GENEL_EVRAK">Genel Evrak</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="border border-slate-200 py-1.5 px-2 rounded-lg text-xs bg-white"
                    >
                      <option value="HEPSİ">Tüm Durumlar</option>
                      <option value="BEKLEMEDE">Beklemede</option>
                      <option value="ONAYLANDI">Onaylandı</option>
                      <option value="REDDEDİLDİ">Reddedildi</option>
                    </select>
                  </div>
                </div>

                {/* Evrak Log Tablosu — seçili gün / geçmiş */}
                {gorunenEvraklar.filter(e => {
                  // Apply search
                  const q = docSearch.toLowerCase();
                  const matchesSearch = 
                    (e.fileName || '').toLowerCase().includes(q) ||
                    (e.aciklama || '').toLowerCase().includes(q) ||
                    (e.evrakNo || '').toLowerCase().includes(q) ||
                    (e.firma || '').toLowerCase().includes(q) ||
                    (e.kaydeden || '').toLowerCase().includes(q);

                  // Apply type filter
                  const matchesType = typeFilter === 'HEPSİ' || e.evrakTuru === typeFilter;

                  // Apply status filter
                  const matchesStatus = statusFilter === 'HEPSİ' || e.durum === statusFilter;

                  return matchesSearch && matchesType && matchesStatus;
                }).length === 0 ? (
                  <div className="text-center py-10 text-[11px] text-slate-400 font-bold">
                    {showGecmisKayitlar ? 'Geçmiş' : seciliTarihLabel} için aranan kriterlere uygun evrak kaydı bulunamadı.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                          <th className="p-3">Evrak Bilgisi / Dosya</th>
                          <th className="p-3">Tür</th>
                          <th className="p-3">Açıklama</th>
                          <th className="p-3">Gönderilme</th>
                          <th className="p-3">Durum</th>
                          <th className="p-3 text-center">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {gorunenEvraklar
                          .filter(e => {
                            const q = docSearch.toLowerCase();
                            const matchesSearch = 
                              (e.fileName || '').toLowerCase().includes(q) ||
                              (e.aciklama || '').toLowerCase().includes(q) ||
                              (e.evrakNo || '').toLowerCase().includes(q) ||
                              (e.firma || '').toLowerCase().includes(q) ||
                              (e.kaydeden || '').toLowerCase().includes(q);
                            const matchesType = typeFilter === 'HEPSİ' || e.evrakTuru === typeFilter;
                            const matchesStatus = statusFilter === 'HEPSİ' || e.durum === statusFilter;
                            return matchesSearch && matchesType && matchesStatus;
                          })
                          .map(e => (
                            <tr key={e.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-3 font-medium">
                                <div className="text-slate-800 font-bold truncate max-w-[180px]">{e.fileName || 'Belge'}</div>
                                <div className="text-[10px] text-indigo-500 font-mono mt-0.5">{e.id}</div>
                                {pickPrimaryFotoUrl(e) && (
                                  <a
                                    href="#"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      openBase64InNewTab(pickPrimaryFotoUrl(e), e.fileName || 'Belge');
                                    }}
                                    className="text-[9px] text-indigo-600 hover:underline flex items-center gap-0.5 mt-1"
                                  >
                                    <span>👁️ Evrakı Görüntüle</span>
                                  </a>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                  e.evrakTuru === 'FATURA' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                  e.evrakTuru === 'İRSALİYE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  e.evrakTuru === 'MAKBUZ' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  'bg-slate-50 text-slate-700 border-slate-200'
                                }`}>
                                  {e.evrakTuru}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600 max-w-[200px] truncate" title={e.aciklama}>
                                {e.aciklama || '-'}
                              </td>
                              <td className="p-3 text-slate-600 font-mono text-[10px]">
                                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
                                  Kapı gönderimi
                                </div>
                                <div className="font-bold text-slate-700">{formatEvrakGonderimLabel(e)}</div>
                                {(e.tarih || e.saat) && (
                                  <div className="text-[9px] mt-0.5 text-slate-400">
                                    İşlem günü: {e.tarih || '—'}{e.saat ? ` · ${e.saat}` : ''}
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full ${
                                    e.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' :
                                    e.durum === 'REDDEDİLDİ' ? 'bg-rose-100 text-rose-800' :
                                    'bg-amber-100 text-amber-800'
                                  }`}>
                                    {e.durum}
                                  </span>
                                  {resolveGuvenlikEvrakProvenance(e).map((b) => (
                                    <span key={b.label} className={b.className} title={b.title}>
                                      {b.label}
                                    </span>
                                  ))}
                                  {e.aiStatus === 'PARSING' && (
                                    <span className="text-[8px] font-bold text-indigo-600 animate-pulse">YZ okuyor…</span>
                                  )}
                                  {e.matchSummary && (
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                                      e.matchSummary.cariMatched
                                        ? 'bg-teal-50 text-teal-800 border-teal-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}>
                                      {formatKapiMatchLabel(e.matchSummary)}
                                    </span>
                                  )}
                                  {e.firma && !e.matchSummary && e.aiParsed && (
                                    <span className="text-[8px] text-slate-500 font-semibold truncate max-w-[140px]">{e.firma}</span>
                                  )}
                                  {Array.isArray(e.cariOneriler) && e.cariOneriler.length > 0 && e.durum === 'BEKLEMEDE' && (
                                    <div className="flex flex-col gap-0.5 max-w-[160px]">
                                      <span className="text-[8px] font-black uppercase text-indigo-600">Cari önerisi</span>
                                      {e.cariOneriler.slice(0, 2).map((o: any) => (
                                        <button
                                          key={o.id}
                                          type="button"
                                          onClick={() => handleApplyCariOneri(e, o)}
                                          className="text-left text-[8px] font-bold px-1.5 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 truncate cursor-pointer"
                                          title="Bu cariyi uygula"
                                        >
                                          → {o.unvan}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {Array.isArray(e.stokOneriler) && e.stokOneriler.length > 0 && (
                                    <span className="text-[8px] text-sky-700 font-semibold">
                                      Stok öneri: {e.stokOneriler.length} kalem
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex justify-center items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEvrakDuzenle(e)}
                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded transition cursor-pointer"
                                  >
                                    Düzenle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEvrak(e.id)}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold px-2.5 py-1 rounded transition cursor-pointer"
                                  >
                                    Sil
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DÜZENLEME MODAL (Editing Modal Overlay) */}
              {editingEvrak && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h3 className="font-display font-black text-sm text-slate-800 uppercase tracking-wider">
                        ✏️ EVRAK BİLGİLERİNİ DÜZENLE
                      </h3>
                      <button
                        onClick={() => setEditingEvrak(null)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleUpdateGelenEvrak} className="space-y-4 text-xs">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Evrak Türü</label>
                        <select
                          value={editEvrakTuru}
                          onChange={(e) => setEditEvrakTuru(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs"
                        >
                          <option value="İRSALİYE">📄 İRSALİYE</option>
                          <option value="FATURA">💰 FATURA</option>
                          <option value="MAKBUZ">🎫 MAKBUZ</option>
                          <option value="GENEL_EVRAK">📦 GENEL EVRAK</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Evrak No</label>
                          <input
                            type="text"
                            value={editEvrakNo}
                            onChange={(e) => setEditEvrakNo(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium text-slate-800 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Firma (cari önerisi)</label>
                          <input
                            type="text"
                            value={editEvrakFirma}
                            onChange={(e) => {
                              setEditEvrakFirma(e.target.value);
                              setEditCariKartId('');
                            }}
                            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium text-slate-800"
                            placeholder="Firma yazın — DB’de varsa önerilir"
                          />
                          {editCariKartId ? (
                            <p className="text-[9px] font-bold text-teal-700">✓ Cari seçildi</p>
                          ) : (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {suggestCariFromDb(editEvrakFirma, cariKartlarLive, 5).map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => {
                                    setEditEvrakFirma(o.unvan);
                                    setEditCariKartId(o.id);
                                  }}
                                  className="text-[9px] font-bold px-2 py-1 rounded-lg border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 cursor-pointer"
                                >
                                  {o.unvan}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {editEvrakTuru === 'İRSALİYE' && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[9px] font-black uppercase text-indigo-800 tracking-wider">
                              Stok kalemleri (elle girin) *
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                setEditKalemler((prev) => [
                                  ...prev,
                                  { id: `ek_${Date.now()}`, urunAdi: '', miktar: '', birim: 'KG' },
                                ])
                              }
                              className="text-[9px] font-bold text-indigo-700 underline cursor-pointer"
                            >
                              + Kalem
                            </button>
                          </div>
                          {editKalemler.map((k, ki) => (
                            <div key={k.id || ki} className="space-y-1">
                              <div className="grid grid-cols-12 gap-1">
                                <input
                                  value={k.urunAdi || ''}
                                  onChange={(e) => {
                                    const next = [...editKalemler];
                                    next[ki] = { ...next[ki], urunAdi: e.target.value, stokKartId: '' };
                                    setEditKalemler(next);
                                  }}
                                  placeholder="Ürün / malzeme adı"
                                  className="col-span-6 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold"
                                />
                                <input
                                  type="number"
                                  value={k.miktar ?? ''}
                                  onChange={(e) => {
                                    const next = [...editKalemler];
                                    next[ki] = { ...next[ki], miktar: e.target.value };
                                    setEditKalemler(next);
                                  }}
                                  placeholder="Miktar"
                                  className="col-span-3 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold"
                                />
                                <select
                                  value={k.birim || 'KG'}
                                  onChange={(e) => {
                                    const next = [...editKalemler];
                                    next[ki] = { ...next[ki], birim: e.target.value };
                                    setEditKalemler(next);
                                  }}
                                  className="col-span-2 bg-white border border-slate-200 rounded-lg px-1 py-1.5 text-[10px] font-bold"
                                >
                                  <option value="KG">KG</option>
                                  <option value="TON">TON</option>
                                  <option value="Adet">Adet</option>
                                  <option value="M3">M3</option>
                                  <option value="Lt">Lt</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditKalemler((prev) =>
                                      prev.length <= 1
                                        ? [{ id: `ek_${Date.now()}`, urunAdi: '', miktar: '', birim: 'KG' }]
                                        : prev.filter((_, i) => i !== ki)
                                    )
                                  }
                                  className="col-span-1 text-rose-500 font-black text-sm cursor-pointer"
                                >
                                  ×
                                </button>
                              </div>
                              {!k.stokKartId && String(k.urunAdi || '').trim().length >= 2 && (
                                <div className="flex flex-wrap gap-1">
                                  {suggestStokFromDb(k.urunAdi, stokKartlarLive, 3).map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => {
                                        const next = [...editKalemler];
                                        next[ki] = {
                                          ...next[ki],
                                          stokKartId: s.id,
                                          urunAdi: next[ki].urunAdi || s.stokAdi,
                                          birim: next[ki].birim || s.birim || 'KG',
                                        };
                                        setEditKalemler(next);
                                      }}
                                      className="text-[8px] font-bold px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-800 cursor-pointer"
                                    >
                                      {s.stokAdi}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {k.stokKartId && (
                                <p className="text-[9px] font-bold text-teal-700">
                                  ✓ Stok:{' '}
                                  {stokKartlarLive.find((s) => s.id === k.stokKartId)?.stokAdi || k.stokKartId}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Tarih</label>
                          <input
                            type="date"
                            required
                            value={editEvrakTarih}
                            onChange={(e) => setEditEvrakTarih(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Saat</label>
                          <input
                            type="time"
                            required
                            value={editEvrakSaat}
                            onChange={(e) => setEditEvrakSaat(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium text-slate-800"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Açıklama</label>
                        <input
                          type="text"
                          required
                          value={editAciklama}
                          onChange={(e) => setEditAciklama(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium text-slate-800"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingEvrak(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl transition cursor-pointer"
                        >
                          İptal
                        </button>
                        <button
                          type="submit"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-2 rounded-xl transition cursor-pointer"
                        >
                          Güncelle
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}


          {/* ─────────────────────────────────────────────────────────────
              TAB 2: PERSONEL GİRİŞ ÇIKIŞ TAKİBİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'personel' && (
            <div className="space-y-6">
              <GuvenlikTabDateBar
                islemTarihi={islemTarihi}
                onTarihChange={setIslemTarihi}
                tabLabel="Personel Kapı"
                logCount={bugunkuPersonelLoglar.length}
                archivedCount={seciliGunNobetArsivleri.length}
                onGoster={() => handleGosterSeciliGun('Personel Kapı', seciliGunPersonelLoglar.length)}
                onGecmisGoster={() =>
                  setShowGecmisKayitlar((v) => {
                    const next = !v;
                    showStatus(
                      'success',
                      next ? 'Geçmiş kayıtlar gösteriliyor.' : 'Seçili gün kayıtlarına dönüldü.'
                    );
                    return next;
                  })
                }
                gecmisAktif={showGecmisKayitlar}
                onKaydet={() =>
                  showStatus(
                    'success',
                    `${seciliTarihLabel} için personel giriş/çıkışları anında kaydedilir. Bu güne ${seciliGunPersonelLoglar.length} kayıt bağlı.`
                  )
                }
                kaydetLabel="Tarihe Bağla"
                onGuncelle={() => {
                  if (selectedPersonelLogIds.length === 1) {
                    const log = personelLoglar.find((l) => l.id === selectedPersonelLogIds[0]);
                    if (log) {
                      setEditingKayit({ kind: 'personel', record: log });
                      return;
                    }
                  }
                  handleGuncelleSeciliPersonelTarih();
                }}
                guncelleDisabled={selectedPersonelLogIds.length === 0}
                onSil={handleBulkDeletePersonelLogs}
                silDisabled={selectedPersonelLogIds.length === 0}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Personnel Search & Grid */}
                <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-display font-black text-xs text-slate-800 uppercase tracking-widest block">👥 ŞANTİYE PERSONEL GİRİŞ PANELİ</span>
                    <span className="bg-slate-900 text-white text-[9px] font-mono font-bold py-0.5 px-2 rounded">{seciliTarihLabel}</span>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 text-slate-500" size={14} />
                    <input 
                      type="text"
                      placeholder="Personel Adı, Soyadı, TC, Görev veya Firma Ara..."
                      value={personelSearch}
                      onChange={(e) => setPersonelSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 pl-10 rounded-xl text-xs placeholder-slate-650"
                    />
                  </div>

                  {/* Grid of employees */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                    {filteredPersonel.map((item) => {
                      const taseron = isTaseronPersonel(item);
                      return (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-3 flex flex-col justify-between space-y-3 transition ${
                          taseron
                            ? 'bg-amber-50 border border-amber-200 hover:border-amber-400'
                            : 'bg-slate-50 border border-slate-200/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start space-x-2.5">
                          {item.fotografUrl ? (
                            <img src={item.fotografUrl} alt={item.ad} className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold shrink-0 text-xs ${
                              taseron ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500'
                            }`}>
                              {item.ad[0]}{item.soyad[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-805 text-xs truncate">{item.ad} {item.soyad}</h4>
                            <span className="text-[9px] text-slate-500 block truncate font-mono mt-0.5">💼 {item.gorev}</span>
                            <span className={`inline-block mt-1 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${
                              taseron ? 'bg-amber-200/80 text-amber-900' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {firmaEtiketi(item)}
                            </span>
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
                      );
                    })}

                    {filteredPersonel.length === 0 && (
                      <div className="col-span-2 text-center p-6 text-slate-500 italic text-xs space-y-1">
                        <p>Arama kriterlerine uygun aktif personel bulunamadı.</p>
                        <p className="text-[10px] text-slate-400 not-italic">İşe giriş / işten çıkış tarihleri seçili güne uygun olmayan personel listelenmez.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live gate logs history */}
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2 gap-2">
                    <span className="font-display font-black text-xs text-amber-500 uppercase tracking-widest block">📋 {seciliTarihLabel} GİRİŞ-ÇIKIŞ LOGLARI</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSendSelectedPersonelLogsWp}
                        disabled={selectedPersonelLogIds.length === 0}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[9px] font-black rounded-lg cursor-pointer"
                      >
                        <MessageCircle size={11} />
                        WP Gönder
                      </button>
                      <Clock size={14} className="text-amber-500 animate-pulse" />
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {bugunkuPersonelLoglar.slice(0, 40).map((log) => {
                      const isGiris = log.tip === 'GİRİŞ';
                      const checked = selectedPersonelLogIds.includes(log.id);
                      return (
                        <div key={log.id} className="bg-slate-50 border border-slate-855 rounded-xl p-2.5 flex justify-between items-center text-[11px] gap-2">
                          <label className="flex items-start gap-2 min-w-0 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePersonelLogSelect(log.id)}
                              className="mt-0.5 accent-emerald-600"
                            />
                            <div className="space-y-0.5 min-w-0">
                              <span className="font-bold text-slate-805 block truncate">{log.ad} {log.soyad}</span>
                              <span className="text-[9px] text-slate-500 font-mono uppercase block truncate">{log.gorev}</span>
                              {log.firmaAdi && (
                                <span className={`inline-block text-[8px] font-bold px-1 py-0.5 rounded ${
                                  log.firmaTipi === 'TASERON' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {log.firmaAdi}
                                </span>
                              )}
                            </div>
                          </label>
                          
                          <div className="text-right shrink-0 space-y-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono tracking-wide ${
                              isGiris ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/10' : 'bg-rose-950 text-rose-400 border border-rose-500/10'
                            }`}>
                              {log.tip}
                            </span>
                            <span className="text-[9px] text-slate-500 block font-mono mt-0.5">
                              {new Date(log.zaman).toLocaleTimeString('tr-TR')}
                            </span>
                            <div className="flex gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingKayit({ kind: 'personel', record: log })}
                                className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer"
                              >
                                Düzenle
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePersonelLog(log.id)}
                                className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                              >
                                Sil
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {bugunkuPersonelLoglar.length === 0 && (
                      <div className="text-center p-10 text-slate-500 italic text-[11px]">
                        {seciliTarihLabel} için henüz personel giriş/çıkış kaydı yok. Tarih seçip Göster ile kontrol edin.
                      </div>
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
              <GuvenlikTabDateBar
                islemTarihi={islemTarihi}
                onTarihChange={setIslemTarihi}
                tabLabel="Araç Giriş-Çıkış"
                logCount={bugunkuAracLoglar.length}
                archivedCount={seciliGunNobetArsivleri.length}
                onGoster={() => handleGosterSeciliGun('Araç Giriş-Çıkış', seciliGunAracLoglar.length)}
                onGecmisGoster={() =>
                  setShowGecmisKayitlar((v) => {
                    const next = !v;
                    showStatus(
                      'success',
                      next ? 'Geçmiş kayıtlar gösteriliyor.' : 'Seçili gün kayıtlarına dönüldü.'
                    );
                    return next;
                  })
                }
                gecmisAktif={showGecmisKayitlar}
                onKaydet={() =>
                  showStatus(
                    'success',
                    `${seciliTarihLabel} için araç girişleri anında kaydedilir. Bu güne ${seciliGunAracLoglar.length} kayıt bağlı.`
                  )
                }
                kaydetLabel="Tarihe Bağla"
                onGuncelle={() => {
                  if (selectedAracLogIds.length === 1) {
                    const log = tumAracLoglar.find((l) => l.id === selectedAracLogIds[0]);
                    if (log) {
                      setEditingKayit({ kind: 'arac', record: log });
                      return;
                    }
                  }
                  handleGuncelleSeciliAracTarih();
                }}
                guncelleDisabled={selectedAracLogIds.length === 0}
                onSil={handleBulkDeleteAracLogs}
                silDisabled={selectedAracLogIds.length === 0}
              />
              
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
                      <input 
                        type="text"
                        required
                        placeholder="Örn: Hazır Beton Mikseri"
                        value={aracTipi}
                        onChange={(e) => setAracTipi(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                      />
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
                    {filtreliIceridekiAraclar.map((item) => (
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

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingKayit({ kind: 'arac', record: item })}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[10px] py-1.5 px-2 rounded-xl border border-indigo-200 transition cursor-pointer"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAracCikis(item.id)}
                            className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white font-extrabold text-[10px] py-1.5 px-2 rounded-xl border border-rose-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>ÇIKIŞ</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {filtreliIceridekiAraclar.length === 0 && (
                      <div className="col-span-2 bg-slate-900/40 p-10 rounded-2xl border border-slate-200 text-center text-slate-500 italic text-xs">
                        {plakaQueryNorm
                          ? 'Plaka filtresine uyan içeride araç yok.'
                          : 'Şantiyede aktif olarak bulunan hiçbir iş makinesi veya tedarikçi araç kaydı bulunmuyor.'}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Bugünkü Araç Logları + WP */}
              <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 gap-2">
                  <span className="font-display font-black text-xs text-amber-500 uppercase tracking-widest block">🚛 {seciliTarihLabel} ARAÇ LOGLARI</span>
                  <button
                    type="button"
                    onClick={handleSendSelectedAracLogsWp}
                    disabled={selectedAracLogIds.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[9px] font-black rounded-lg cursor-pointer"
                  >
                    <MessageCircle size={11} />
                    WP Gönder
                  </button>
                </div>

                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {filtreliBugunkuAracLoglar.map((log) => {
                    const checked = selectedAracLogIds.includes(log.id);
                    return (
                      <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex justify-between items-center text-[11px] gap-2">
                        <label className="flex items-start gap-2 min-w-0 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAracLogSelect(log.id)}
                            className="mt-0.5 accent-emerald-600"
                          />
                          <div className="space-y-0.5 min-w-0">
                            <span className="font-bold text-slate-800 font-mono block">{log.plaka}</span>
                            <span className="text-[9px] text-slate-500 block truncate">{log.aracTipi} · {log.firma}</span>
                            <span className="text-[9px] text-slate-400 block">Sürücü: {log.surucuAdi || '—'}</span>
                          </div>
                        </label>
                        <div className="text-right shrink-0 space-y-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                            log.durum === 'İÇERİDE' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {log.durum}
                          </span>
                          <span className="text-[9px] text-slate-500 block font-mono mt-0.5">
                            {log.girisZamani ? new Date(log.girisZamani).toLocaleTimeString('tr-TR') : '—'}
                          </span>
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingKayit({ kind: 'arac', record: log })}
                              className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAracLog(log.id)}
                              className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {bugunkuAracLoglar.length === 0 && (
                    <div className="text-center p-8 text-slate-500 italic text-[11px]">
                      {seciliTarihLabel} için henüz araç giriş/çıkış kaydı yok.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB: TANKER / KONTROL (SU TANKERİ, VİDANJÖR, PETROL TANKERİ)
              ───────────────────────────────────────────────────────────── */}
          {(activeTab === 'su_tankeri' || activeTab === 'vidanjor' || activeTab === 'petrol_tankeri' || activeTab === 'mici_stabilize') && (() => {
            const currentBg = 
              activeTab === 'vidanjor' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/15' : 
              activeTab === 'petrol_tankeri' ? 'bg-rose-600 text-white shadow-md shadow-rose-500/15' : 
              activeTab === 'mici_stabilize' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/15' : 
              'bg-sky-600 text-white shadow-md shadow-sky-500/15';

            const currentLabel = 
              activeTab === 'vidanjor' ? 'Vidanjör' : 
              activeTab === 'petrol_tankeri' ? 'Petrol Tankeri' : 
              activeTab === 'mici_stabilize' ? 'Mıcır / Stabilize / Taş Tozu' : 
              'Su Tankeri';

            const currentIcon = 
              activeTab === 'vidanjor' ? <Droplets size={13} className="rotate-180" /> : 
              activeTab === 'petrol_tankeri' ? <Fuel size={13} /> : 
              activeTab === 'mici_stabilize' ? <Truck size={13} /> : 
              <Droplets size={13} />;

            const currentTextClass = 
              activeTab === 'vidanjor' ? 'text-indigo-800 border-indigo-200 bg-indigo-50' : 
              activeTab === 'petrol_tankeri' ? 'text-rose-800 border-rose-200 bg-rose-50' : 
              activeTab === 'mici_stabilize' ? 'text-emerald-800 border-emerald-200 bg-emerald-50' : 
              'text-sky-800 border-sky-200 bg-sky-50';

            const currentButtonClass = 
              activeTab === 'vidanjor' ? 'bg-indigo-600 hover:bg-indigo-700 border-indigo-800' : 
              activeTab === 'petrol_tankeri' ? 'bg-rose-600 hover:bg-rose-700 border-rose-800' : 
              activeTab === 'mici_stabilize' ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800' : 
              'bg-sky-600 hover:bg-sky-700 border-sky-800';

            const insideList = 
              activeTab === 'vidanjor' ? iceridekiVidanjorler : 
              activeTab === 'petrol_tankeri' ? iceridekiPetrolTankerleri : 
              activeTab === 'mici_stabilize' ? iceridekiMiciStabilize : 
              iceridekiSuTankerleri;

            const pastList = 
              activeTab === 'vidanjor' ? vidanjorGecmisLoglar : 
              activeTab === 'petrol_tankeri' ? petrolTankeriGecmisLoglar : 
              activeTab === 'mici_stabilize' ? miciStabilizeGecmisLoglar : 
              suTankeriGecmisLoglar;

            const historyList = [...insideList, ...pastList]
              .filter((item) =>
                showGecmisKayitlar
                  ? true
                  : item.girisZamani && String(item.girisZamani).startsWith(islemTarihi)
              )
              .sort((a, b) =>
                String(b.girisZamani || '').localeCompare(String(a.girisZamani || ''))
              )
              .slice(0, showGecmisKayitlar ? 100 : 500);

            return (
              <div className="space-y-6">
                <GuvenlikTabDateBar
                  islemTarihi={islemTarihi}
                  onTarihChange={(t) => {
                    setShowGecmisKayitlar(false);
                    setIslemTarihi(t);
                  }}
                  tabLabel={currentLabel}
                  logCount={historyList.length}
                  archivedCount={seciliGunNobetArsivleri.length}
                  onGoster={() => handleGosterSeciliGun(currentLabel, historyList.length)}
                  onGecmisGoster={() => {
                    setShowGecmisKayitlar((v) => {
                      const next = !v;
                      showStatus(
                        'success',
                        next
                          ? `${currentLabel} geçmiş kayıtları gösteriliyor (${[...insideList, ...pastList].length} toplam).`
                          : `${seciliTarihLabel} kayıtlarına dönüldü.`
                      );
                      return next;
                    });
                  }}
                  gecmisAktif={showGecmisKayitlar}
                  onKaydet={() =>
                    showStatus(
                      'success',
                      `${seciliTarihLabel} için ${currentLabel.toLowerCase()} girişleri formdan kaydedilir. Bu güne ${historyList.length} kayıt bağlı.`
                    )
                  }
                  kaydetLabel="Formdan Kaydet"
                  onGuncelle={() => {
                    const first = historyList[0];
                    if (!first) {
                      showStatus('error', 'Güncellenecek kayıt yok. Listeden Düzenle seçin.');
                      return;
                    }
                    setEditingKayit({
                      kind: 'tanker',
                      record: first,
                      tankerLabel: currentLabel,
                    });
                  }}
                  guncelleDisabled={historyList.length === 0}
                  onSil={() => {
                    if (!historyList[0]) return;
                    handleDeleteTankerLog(historyList[0].id);
                  }}
                  silDisabled={historyList.length === 0}
                />

                <div className={`${currentTextClass} border rounded-2xl p-4 text-xs font-semibold`}>
                  {activeTab === 'mici_stabilize' ? (
                    <>
                      <strong>{ENTO_MADEN_UNVAN} irsaliye üretimi burada yapılır.</strong> Kapıdan
                      gelen her mıcır / stabilize evrakı bir irsaliyedir. <strong>Kilo</strong>,{' '}
                      <strong>tarih</strong> ve <strong>irsaliye no</strong> eksiksiz girilir; yönetici
                      onayından sonra <strong>İrsaliyeler</strong> ve{' '}
                      <strong>{ENTO_MADEN_UNVAN}</strong> cari kartının altına kaydedilir.
                    </>
                  ) : (
                    <>
                      {currentLabel} girişlerini bu sekmeden takip edebilirsiniz. Her kayıtta{' '}
                      <strong>Düzenle</strong> ile güncelleme yapabilirsiniz.
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Yeni Giriş Formu */}
                  <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                    <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">
                      {currentIcon}{' '}
                      {activeTab === 'mici_stabilize'
                        ? `${ENTO_MADEN_UNVAN.toUpperCase()} İRSALİYE KAYDI`
                        : `YENİ ${currentLabel.toUpperCase()} GİRİŞ KAYDI`}
                    </span>

                    <form onSubmit={handleTankerGiris} className="space-y-3.5 text-xs text-slate-700">
                      {activeTab !== 'mici_stabilize' && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Plaka *</label>
                        <input
                          type="text"
                          required
                          placeholder="Örn: 34 XYZ 456"
                          value={stPlaka}
                          onChange={(e) => setStPlaka(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold font-mono text-xs uppercase"
                        />
                      </div>
                      )}

                      {activeTab === 'mici_stabilize' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Cari Firma</label>
                            <input
                              type="text"
                              readOnly
                              value={ENTO_MADEN_UNVAN}
                              className="w-full bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded-xl font-bold text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">İrsaliye Tarihi *</label>
                            <input
                              type="date"
                              required
                              value={islemTarihi}
                              onChange={(e) => setIslemTarihi(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">İrsaliye No *</label>
                            <input
                              type="text"
                              required
                              placeholder="Evraktaki irsaliye numarası"
                              value={stIrsaliyeNo}
                              onChange={(e) => setStIrsaliyeNo(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs uppercase"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Plaka *</label>
                            <input
                              type="text"
                              required
                              placeholder="Örn: 34 XYZ 456"
                              value={stPlaka}
                              onChange={(e) => setStPlaka(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold font-mono text-xs uppercase"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Malzeme *</label>
                            <select
                              value={stMalzemeTipi}
                              onChange={(e) => setStMalzemeTipi(e.target.value as MicirMalzemeTipi)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                            >
                              <option value="MICIR">Mıcır</option>
                              <option value="STABILIZE">Stabilize</option>
                              <option value="TAS_TOZU">Taş Tozu</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Kilo (kg) *</label>
                            <input
                              type="number"
                              required
                              min={1}
                              step={1}
                              placeholder="Örn: 25500"
                              value={stKiloKg}
                              onChange={(e) => {
                                setStKiloKg(e.target.value);
                                setStMiktar(e.target.value);
                              }}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                            />
                            {Number(stKiloKg) > 0 && (
                              <p className="text-[10px] text-emerald-700 font-semibold">
                                = {kgToTon(Number(stKiloKg)).toLocaleString('tr-TR')} ton
                              </p>
                            )}
                            <p className="text-[9px] text-slate-400">
                              İrsaliyedeki ağırlığı kilogram olarak tam girin.
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Sürücü (opsiyonel)</label>
                            <input
                              type="text"
                              placeholder="Örn: Ahmet Yılmaz"
                              value={stSurucu}
                              onChange={(e) => setStSurucu(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Not</label>
                            <input
                              type="text"
                              placeholder="Opsiyonel açıklama..."
                              value={stAciklama}
                              onChange={(e) => setStAciklama(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Tedarikçi / Firma *</label>
                            <input
                              type="text"
                              required
                              placeholder="Örn: ABC Lojistik"
                              value={stFirma}
                              onChange={(e) => setStFirma(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-bold text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Sürücü Adı Soyadı</label>
                            <input
                              type="text"
                              placeholder="Örn: Ahmet Yılmaz"
                              value={stSurucu}
                              onChange={(e) => setStSurucu(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Miktar (m³ / Litre)</label>
                            <input
                              type="text"
                              placeholder="Örn: 15 m³ veya 10000 Lt"
                              value={stMiktar}
                              onChange={(e) => setStMiktar(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Açıklama</label>
                            <input
                              type="text"
                              placeholder="Genel şantiye ihtiyacı vb..."
                              value={stAciklama}
                              onChange={(e) => setStAciklama(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs"
                            />
                          </div>
                        </>
                      )}

                      {/* Document Upload Area */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">
                          {activeTab === 'mici_stabilize' ? 'İrsaliye Fotoğrafı / Belge *' : 'Fotoğraf / Belge Yükle'}
                        </label>
                        {tankerFotoUrl ? (
                          <div className="relative border border-slate-200 rounded-2xl p-2 bg-slate-50 flex items-center justify-between">
                            <span className="text-[10px] text-slate-600 font-bold font-mono truncate max-w-[180px]">
                              {tankerFileName || 'Belge Yüklendi'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setTankerFotoUrl('');
                                setTankerFileName('');
                              }}
                              className="text-rose-500 hover:text-rose-700 p-1 font-bold text-xs cursor-pointer border-0 bg-transparent"
                            >
                              Kaldır
                            </button>
                          </div>
                        ) : (
                          <div className="relative border border-dashed border-slate-350 rounded-2xl p-4 text-center bg-slate-50 hover:bg-slate-100/60 transition cursor-pointer group">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              capture="environment"
                              onChange={(e) => {
                                if (!e.target.files || !e.target.files[0]) return;
                                const file = e.target.files[0];
                                setTankerFileName(file.name);
                                const reader = new FileReader();
                                reader.onload = async () => {
                                  const rawBase64 = reader.result as string;
                                  let compressed = rawBase64;
                                  if (file.type.startsWith('image/')) {
                                    try {
                                      // Kapı mıcır onayında büyük foto timeout/rollback yapıyordu
                                      compressed = await compressImage(rawBase64, 720, 720, 0.52, 4000);
                                    } catch (err) {
                                      console.error('Image compression failed', err);
                                    }
                                  } else if (
                                    file.type.includes('pdf') ||
                                    rawBase64.startsWith('data:application/pdf')
                                  ) {
                                    if (rawBase64.length > 140_000) {
                                      alert(
                                        'PDF çok büyük. Lütfen irsaliyeyi fotoğraf olarak çekip yükleyin.'
                                      );
                                      return;
                                    }
                                  }
                                  setTankerFotoUrl(compressed);
                                };
                                reader.readAsDataURL(file);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="space-y-1 py-1">
                              <Camera size={18} className="text-slate-400 mx-auto" />
                              <span className="text-[10px] font-bold text-slate-500 block">Belge / Fotoğraf Çek veya Yükle</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        className={`w-full ${currentButtonClass} text-white font-black text-xs py-3 rounded-xl cursor-pointer border-b-2 transition`}
                      >
                        {activeTab === 'mici_stabilize'
                          ? 'İRSALİYEYİ KAYDET &amp; ONAYA GÖNDER'
                          : 'KAYDET &amp; ŞANTİYEYE GÖNDER'}
                      </button>
                    </form>
                  </div>

                  {/* Tarihli Tanker Hareketleri Listesi */}
                  <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                    <span className="font-display font-black text-xs text-amber-700 uppercase tracking-widest block border-b border-slate-200 pb-2">
                      {activeTab === 'mici_stabilize'
                        ? `${ENTO_MADEN_UNVAN.toUpperCase()} İRSALİYE LİSTESİ`
                        : `TARİHLİ ${currentLabel.toUpperCase()} HAREKET LİSTESİ`}
                    </span>

                    {activeTab === 'mici_stabilize' && (
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={micirArama}
                          onChange={(e) => setMicirArama(e.target.value)}
                          placeholder="İrsaliye no, plaka, kilo veya tarih ile ara..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-semibold"
                        />
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                      {(activeTab === 'mici_stabilize'
                        ? (() => {
                            const kw = micirArama.trim().toLowerCase();
                            const base = kw
                              ? micirTumKayitlar.filter((item) => {
                                  const blob = [
                                    item.plaka,
                                    item.firma,
                                    item.irsaliyeNo,
                                    item.miktar,
                                    item.tonaj,
                                    item.malzemeTipi,
                                    item.islemTarihi,
                                    item.aciklama,
                                    item.onayDurumu,
                                  ]
                                    .join(' ')
                                    .toLowerCase();
                                  return blob.includes(kw);
                                })
                              : historyList;
                            return base;
                          })()
                        : historyList
                      ).map((item) => (
                        <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3.5 relative overflow-hidden flex flex-col justify-between">
                          
                          <div>
                            <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                              <span className="font-mono text-xs font-black text-slate-800 bg-white px-2 py-0.5 border border-slate-200 rounded">{item.plaka}</span>
                              <div className="flex items-center space-x-1">
                                {item.fotoUrl && (
                                  <button
                                    type="button"
                                    onClick={() => openBase64InNewTab(item.fotoUrl, item.fileName || 'Belge')}
                                    className="text-emerald-700 hover:text-emerald-800 p-1 hover:bg-emerald-50 rounded transition cursor-pointer bg-transparent border-0"
                                    title="Belgeyi Görüntüle"
                                  >
                                    <FileText size={12} />
                                  </button>
                                )}
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${currentBg}`}>
                                  {activeTab === 'mici_stabilize'
                                    ? malzemeTipiLabel(item.malzemeTipi)
                                    : currentLabel}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1 text-[11px] text-slate-500 font-semibold mt-2.5">
                              {activeTab === 'mici_stabilize' ? (
                                <>
                                  <p>İrsaliye No: <span className="text-slate-800 font-bold font-mono">{item.irsaliyeNo || '—'}</span></p>
                                  <p>Cari: <span className="text-slate-800 font-bold">{item.firma || ENTO_MADEN_UNVAN}</span></p>
                                  <p>
                                    Miktar:{' '}
                                    <span className="text-emerald-700 font-bold">
                                      {formatMicirMiktarLabel(item.tonaj, item.kiloKg)}
                                    </span>
                                  </p>
                                  <p>Tarih: <span className="text-slate-800 font-bold">{item.islemTarihi || '—'}</span></p>
                                  <p>
                                    Onay:{' '}
                                    <span
                                      className={`font-black ${
                                        item.onayDurumu === 'ONAYLANDI'
                                          ? 'text-emerald-600'
                                          : item.onayDurumu === 'REDDEDILDI'
                                            ? 'text-rose-600'
                                            : 'text-amber-600'
                                      }`}
                                    >
                                      {item.onayDurumu === 'ONAYLANDI'
                                        ? `Onaylandı → ${ENTO_MADEN_UNVAN} cari`
                                        : item.onayDurumu === 'REDDEDILDI'
                                          ? 'Reddedildi'
                                          : 'Yönetici onayında'}
                                    </span>
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p>🏢 Tedarikçi / Firma: <span className="text-slate-800 font-bold">{item.firma}</span></p>
                                  <p>👤 Sürücü: <span className="text-slate-800 font-bold">{item.surucuAdi || 'Belirtilmedi'}</span></p>
                                  <p>⚖️ Miktar / Açıklama: <span className="text-amber-500 font-bold">{item.miktar ? `${item.miktar} m³ / Lt` : '—'} ({item.aciklama || 'Belirtilmedi'})</span></p>
                                </>
                              )}
                              <p className="text-[9px] text-slate-500 pt-1">Giriş Saati: {new Date(item.girisZamani).toLocaleString('tr-TR')}</p>
                              {item.cikisZamani && (
                                <p className="text-[9px] text-rose-500">Çıkış Saati: {new Date(item.cikisZamani).toLocaleString('tr-TR')}</p>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingKayit({
                                  kind: 'tanker',
                                  record: item,
                                  tankerLabel: currentLabel,
                                })
                              }
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[10px] py-1.5 px-2 rounded-xl border border-indigo-200 transition cursor-pointer"
                            >
                              Düzenle
                            </button>
                            {item.durum === 'ÇIKTI' ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteTankerLog(item.id)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-[10px] py-1.5 px-2 rounded-xl border border-rose-200 transition cursor-pointer"
                              >
                                Sil
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTankerCikis(item.id)}
                                className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white font-extrabold text-[10px] py-1.5 px-2 rounded-xl border border-rose-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                              >
                                <X size={11} />
                                <span>ÇIKIŞ</span>
                              </button>
                            )}
                          </div>
                          {item.durum !== 'ÇIKTI' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTankerLog(item.id)}
                              className="w-full text-[9px] font-bold text-slate-500 hover:text-rose-600 underline cursor-pointer"
                            >
                              Kaydı sil
                            </button>
                          )}
                        </div>
                      ))}

                      {((activeTab === 'mici_stabilize' && micirArama.trim()
                        ? micirTumKayitlar.filter((item) => {
                            const kw = micirArama.trim().toLowerCase();
                            const blob = [
                              item.plaka,
                              item.firma,
                              item.irsaliyeNo,
                              item.miktar,
                              item.tonaj,
                              item.malzemeTipi,
                              item.islemTarihi,
                              item.aciklama,
                              item.onayDurumu,
                            ]
                              .join(' ')
                              .toLowerCase();
                            return blob.includes(kw);
                          })
                        : historyList
                      ).length === 0) && (
                        <div className="col-span-2 bg-slate-900/40 p-10 rounded-2xl border border-slate-200 text-center text-slate-500 italic text-xs">
                          {activeTab === 'mici_stabilize' && micirArama.trim()
                            ? 'Aramayla eşleşen kapı irsaliye kaydı bulunamadı.'
                            : `Seçilen tarihte şantiyeye giriş yapmış ${currentLabel.toLowerCase()} kaydı bulunmuyor.`}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* ─────────────────────────────────────────────────────────────
              TAB 5: ZİYARETÇİ DEFTERİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'ziyaretci' && (
            <div className="space-y-6">
              <GuvenlikTabDateBar
                islemTarihi={islemTarihi}
                onTarihChange={setIslemTarihi}
                tabLabel="Ziyaretçi Defteri"
                logCount={gorunenZiyaretciLoglar.length}
                archivedCount={seciliGunNobetArsivleri.length}
                onGoster={() => handleGosterSeciliGun('Ziyaretçi Defteri', gorunenZiyaretciLoglar.length)}
                onGecmisGoster={() =>
                  setShowGecmisKayitlar((v) => {
                    const next = !v;
                    showStatus(
                      'success',
                      next ? 'Geçmiş kayıtlar gösteriliyor.' : 'Seçili gün kayıtlarına dönüldü.'
                    );
                    return next;
                  })
                }
                gecmisAktif={showGecmisKayitlar}
                onKaydet={() =>
                  showStatus(
                    'success',
                    `${seciliTarihLabel} için ziyaretçi girişleri anında kaydedilir. Bu güne ${gorunenZiyaretciLoglar.length} kayıt bağlı.`
                  )
                }
                kaydetLabel="Tarihe Bağla"
                onGuncelle={() => {
                  const first = gorunenZiyaretciLoglar[0];
                  if (!first) {
                    showStatus('error', 'Güncellenecek ziyaretçi kaydı yok.');
                    return;
                  }
                  setEditingKayit({ kind: 'ziyaretci', record: first });
                }}
                guncelleDisabled={gorunenZiyaretciLoglar.length === 0}
                onSil={() => {
                  if (gorunenZiyaretciLoglar.length === 0) return;
                  handleDeleteZiyaretciLog(gorunenZiyaretciLoglar[0].id);
                }}
                silDisabled={gorunenZiyaretciLoglar.length === 0}
              />
              
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
                          <p>🤝 Görüşülen Yetkili: <span className="text-slate-600 font-bold">{item.ziyaretEdilen}</span></p>
                          <p>💼 Neden: <span className="text-slate-805">{item.ziyaretSebebi || 'Genel Görüşme'}</span></p>
                          <p className="text-[9px] text-slate-500 pt-1">Giriş Saati: {new Date(item.girisZamani).toLocaleString('tr-TR')}</p>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-950/60">
                          <button
                            type="button"
                            onClick={() => setEditingKayit({ kind: 'ziyaretci', record: item })}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-extrabold py-1.5 rounded-xl border border-indigo-200 transition cursor-pointer"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveBadgeGuest(item)}
                            className="bg-slate-800 hover:bg-slate-750 text-slate-700 text-[9px] font-extrabold py-1.5 rounded-xl border border-slate-700 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <Printer size={11} />
                            <span>KART</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleZiyaretciWhatsApp(item)}
                            className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-600 hover:text-white text-[9px] font-extrabold py-1.5 rounded-xl border border-emerald-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <MessageCircle size={11} />
                            <span>WP</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleZiyaretciCikis(item.id)}
                            className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white text-[9px] font-extrabold py-1.5 rounded-xl border border-rose-500/20 transition cursor-pointer flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>ÇIKIŞ</span>
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

              <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4">
                <span className="font-display font-black text-xs text-amber-500 uppercase tracking-widest block border-b border-slate-200 pb-2">
                  🎫 {showGecmisKayitlar ? 'GEÇMİŞ' : seciliTarihLabel} ZİYARETÇİ LOGLARI ({gorunenZiyaretciLoglar.length})
                </span>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {gorunenZiyaretciLoglar.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex justify-between items-center text-[11px] gap-2"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <span className="font-bold text-slate-800 block truncate">{log.adSoyad}</span>
                        <span className="text-[9px] text-slate-500 block truncate">
                          {log.firma} · {log.ziyaretEdilen}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">{log.kartNo}</span>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                            log.durum === 'İÇERİDE' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {log.durum}
                        </span>
                        <span className="text-[9px] text-slate-500 block font-mono">
                          {log.girisZamani ? new Date(log.girisZamani).toLocaleTimeString('tr-TR') : '—'}
                        </span>
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingKayit({ kind: 'ziyaretci', record: log })}
                            className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer"
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleZiyaretciWhatsApp(log)}
                            className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer"
                          >
                            WP
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteZiyaretciLog(log.id)}
                            className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {gorunenZiyaretciLoglar.length === 0 && (
                    <div className="text-center p-8 text-slate-500 italic text-[11px]">
                      {showGecmisKayitlar ? 'Geçmiş ziyaretçi kaydı yok.' : `${seciliTarihLabel} için ziyaretçi kaydı yok. Tarih seçip Göster ile kontrol edin.`}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 5: NÖBET GÜNÜ KAPAT & ARŞİV
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'nobet_arsivi' && (
            <div className="space-y-6">
              <GuvenlikTabDateBar
                islemTarihi={islemTarihi}
                onTarihChange={setIslemTarihi}
                tabLabel="Nöbet Kapat & Arşiv"
                logCount={
                  seciliGunPersonelLoglar.length +
                  seciliGunAracLoglar.length +
                  seciliGunSuTankeriLoglar.length +
                  seciliGunMiciStabilizeLoglar.length +
                  seciliGunZiyaretciLoglar.length +
                  seciliGunEvraklar.length
                }
                archivedCount={seciliGunNobetArsivleri.length}
                onGoster={() =>
                  handleGosterSeciliGun(
                    'Nöbet günü',
                    seciliGunPersonelLoglar.length +
                      seciliGunAracLoglar.length +
                      seciliGunSuTankeriLoglar.length +
                      seciliGunMiciStabilizeLoglar.length +
                      seciliGunZiyaretciLoglar.length +
                      seciliGunEvraklar.length
                  )
                }
                onKaydet={() => {
                  const txt =
                    (document.getElementById('nobetNotlar') as HTMLTextAreaElement)?.value || '';
                  handleArchiveNobetGunu(txt);
                }}
                kaydetLabel="Nöbeti Arşivle"
                kaydetLoading={isArchiving}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Sol Panel: Aktif Günü Arşivle */}
                <div className="bg-white p-6 border border-slate-200 rounded-3xl space-y-5">
                  <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">
                    🔒 {seciliTarihLabel} NÖBET VARDİYASINI ARŞİVLE
                  </span>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Nöbet kapatınca seçili günün tüm giriş-çıkış ve evrak logları <strong>toplu rapora</strong> dönüşüp
                    arşive kaydedilir. Canlı loglar <strong className="text-emerald-700">silinmez</strong>; sekmelerden
                    tarihe göre yeniden görüntülenir.
                  </p>

                  {/* Vardiya Seçimi */}
                  <div className="space-y-1.5 text-xs text-slate-705">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block font-sans">Arşivlenecek Vardiya *</label>
                    <select
                      value={selectedVardiya}
                      onChange={(e) => setSelectedVardiya(e.target.value as NobetVardiyaTipi)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs text-slate-850"
                    >
                      <option value="TUM_GUN">📅 Tam Gün (24 Saat — tüm günlük loglar)</option>
                      <option value="GUNDUZ">☀️ Gündüz Vardiyası (08:00 - 20:00)</option>
                      <option value="GECE">🌙 Gece Vardiyası (20:00 - 08:00)</option>
                    </select>
                  </div>

                  {/* Vardiyaya Göre Dinamik İstatistikler */}
                  {(() => {
                    const sLogs = filterNobetPersonelLoglari(personelLoglar, islemTarihi, selectedVardiya).length;
                    const sAraclar = filterNobetAracZiyaretLoglari(
                      tumAracLoglar,
                      islemTarihi,
                      selectedVardiya,
                      getIslemZamani()
                    ).length;
                    const sSuLogs = filterNobetAracZiyaretLoglari(
                      tumSuTankeriLoglar,
                      islemTarihi,
                      selectedVardiya,
                      getIslemZamani()
                    );
                    const sVidLogs = filterNobetAracZiyaretLoglari(
                      tumVidanjorLoglar,
                      islemTarihi,
                      selectedVardiya,
                      getIslemZamani()
                    );
                    const sPetrolLogs = filterNobetAracZiyaretLoglari(
                      tumPetrolTankeriLoglar,
                      islemTarihi,
                      selectedVardiya,
                      getIslemZamani()
                    );
                    const sMiciLogs = filterNobetAracZiyaretLoglari(
                      tumMiciStabilizeLoglar,
                      islemTarihi,
                      selectedVardiya,
                      getIslemZamani()
                    );
                    const sGuests = filterNobetAracZiyaretLoglari(
                      tumZiyaretciLoglar,
                      islemTarihi,
                      selectedVardiya,
                      getIslemZamani()
                    ).length;
                    const sEvrakLogs = filterNobetEvrakLoglari(gelenEvraklar, islemTarihi, selectedVardiya);
                    const sFotolar = collectNobetGunlukFotograflar({
                      evrakLoglari: sEvrakLogs,
                      suTankeriLoglari: sSuLogs,
                      vidanjorLoglari: sVidLogs,
                      petrolTankeriLoglari: sPetrolLogs,
                      miciStabilizeLoglari: sMiciLogs,
                    }).length;

                    return (
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block font-sans">
                          Vardiya İstatistikleri Özeti — {seciliTarihLabel}
                        </span>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                            <span className="text-[9px] font-bold text-slate-500 block uppercase font-sans">Personel</span>
                            <span className="text-sm font-black text-slate-805 font-mono">{sLogs} Hareket</span>
                          </div>

                          <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                            <span className="text-[9px] font-bold text-slate-500 block uppercase font-sans">Araç</span>
                            <span className="text-sm font-black text-slate-805 font-mono">{sAraclar} Giriş</span>
                          </div>

                          <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                            <span className="text-[9px] font-bold text-slate-500 block uppercase font-sans">Su Tankeri</span>
                            <span className="text-sm font-black text-slate-805 font-mono">{sSuLogs.length} Sefer</span>
                          </div>

                          <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                            <span className="text-[9px] font-bold text-slate-500 block uppercase font-sans">Misafir</span>
                            <span className="text-sm font-black text-slate-805 font-mono">{sGuests} Kayıt</span>
                          </div>

                          <div className="bg-white/60 p-2.5 rounded-xl border border-slate-200/40">
                            <span className="text-[9px] font-bold text-slate-500 block uppercase font-sans">Evrak</span>
                            <span className="text-sm font-black text-slate-805 font-mono">{sEvrakLogs.length} Belge</span>
                          </div>

                          <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200/80">
                            <span className="text-[9px] font-bold text-amber-700 block uppercase font-sans">Fotoğraf</span>
                            <span className="text-sm font-black text-amber-900 font-mono">{sFotolar} Yükleme</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notlar */}
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold uppercase text-[9px] font-sans">GÜN SONU / VARDİYA DEVİR NOTLARI</label>
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
                    <span>{isArchiving ? 'Arşivleniyor...' : 'Nöbeti Kapat & Raporu Arşivle'}</span>
                  </button>

                  <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    ✓ Arşivleme sonrası günlük loglar sekmelerde kalır. Alttaki listeden raporları açabilirsiniz.
                  </p>

                </div>

                {/* Sağ Panel: Arşiv Arama ve Listeleme */}
                <div className="lg:col-span-2 bg-white p-6 border border-slate-200 rounded-3xl space-y-4">
                  
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-200 pb-3 gap-3">
                    <div>
                      <span className="font-display font-black text-xs text-slate-800 uppercase tracking-widest block">
                        📂 GEÇMİŞ GÜNLERİN GÜVENLİK ARŞİVLERİ
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">Nöbet kapatınca oluşan raporlar burada listelenir — günlük loglar silinmez</p>
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
                              <span className="text-sm font-black text-slate-800 font-mono">{archive.tarih}</span>
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                                archive.vardiya === 'GUNDUZ' ? 'bg-amber-100 text-amber-805 border border-amber-200' :
                                archive.vardiya === 'GECE' ? 'bg-indigo-105 text-indigo-850 border border-indigo-200' :
                                'bg-slate-100 text-slate-800 border border-slate-200'
                              }`}>
                                {archive.vardiya === 'GUNDUZ' ? '☀️ Gündüz' : archive.vardiya === 'GECE' ? '🌙 Gece' : 'Tüm Gün'}
                              </span>
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
                              <span className="text-slate-700">|</span>
                              <span>F: <strong className="text-amber-700">{resolveNobetArsivFotograflar(archive).length}</strong></span>
                            </div>

                            <button
                              onClick={() => setSelectedArchive(archive)}
                              className="bg-amber-600/10 hover:bg-amber-600 border border-amber-500/20 text-amber-700 hover:text-slate-950 text-[10px] font-black px-3.5 py-2 rounded-xl transition cursor-pointer"
                            >
                              Arşivi İncele
                            </button>
                            <button
                              type="button"
                              onClick={() => handleIndirNobetRaporHtml(archive)}
                              className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-3 py-2 rounded-xl transition cursor-pointer"
                            >
                              HTML Rapor
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

          {/* ─────────────────────────────────────────────────────────────
              TAB 6: AKVİZYON TAŞERON YOKLAMA TAKİBİ
              ───────────────────────────────────────────────────────────── */}
          {activeTab === 'akvizyon_yoklama' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <GuvenlikTabDateBar
                islemTarihi={islemTarihi}
                onTarihChange={setIslemTarihi}
                tabLabel="Akvizyon Yoklama"
                logCount={Object.keys(akvizyonYoklamaMap).length}
                archivedCount={akvizyonArchives.filter((a) => a.tarih === islemTarihi).length}
                onGoster={() =>
                  handleGosterSeciliGun('Akvizyon Yoklama', Object.keys(akvizyonYoklamaMap).length)
                }
                onKaydet={handleSaveAkvizyonYoklama}
                kaydetLabel="Yoklamayı Kaydet"
                kaydetDisabled={!canEditAkvizyonYoklama || akvizyonPersoneller.length === 0}
                kaydetLoading={loadingAkvizyonYoklama}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Sol Panel: Yoklama Alım Formu */}
                <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                  <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">
                    📋 AKVİZYON TAŞERON YOKLAMA FORMU
                  </span>

                  {/* Tarih ve Yetki Uyarı Alanı */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Yoklama Tarihi:</span>
                      <span className="font-mono font-black text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20 text-xs">
                        {seciliTarihLabel}
                      </span>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 text-[11px] text-indigo-900 leading-relaxed">
                      <p className="font-black uppercase tracking-wide text-[10px] mb-1">
                        Grup nöbeti otomatik kapanış
                      </p>
                      <p>
                        Her gün saat <strong>{AKVIZYON_NOBET_KAPANIS_SAAT}:00</strong> (İstanbul)
                        Akvizyon grup nöbeti otomatik kapanır ve arşivlenir. İşaretlenmeyen personel
                        <strong> Gelmedi</strong> sayılır.
                      </p>
                      {akvizyonNobetKilitli && (
                        <p className="mt-2 font-bold text-rose-700 flex items-center gap-1.5">
                          <Lock size={12} />
                          Bu gün kilitli
                          {seciliGunAkvizyonDoc?.otomatikKapanis ? ' · otomatik arşiv' : ''}.
                        </p>
                      )}
                    </div>

                    {!canSaveAkvizyonYoklama && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start space-x-2 text-amber-800 text-[11px] leading-relaxed">
                        <Lock size={16} className="shrink-0 mt-0.5 animate-pulse" />
                        <p>
                          <strong>Görüntüleme Modu:</strong> Yoklama alma/kaydetme yetkisi <strong className="font-extrabold text-amber-950">Güvenlik, Kurucu ve Yönetici</strong> yetkilerine aittir. Diğer hesaplar sadece geçmiş kayıtları inceleyebilir.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleAkvizyonRaporIndir}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-[10px] font-bold rounded-xl cursor-pointer"
                      >
                        <Download size={12} /> Rapor İndir
                      </button>
                      <button
                        type="button"
                        onClick={handleAkvizyonWpRapor}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded-xl cursor-pointer"
                      >
                        <MessageCircle size={12} /> WP Rapor
                      </button>
                    </div>
                  </div>

                  {/* Yoklama Listesi */}
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {akvizyonPersoneller.map((item) => {
                      const status = akvizyonYoklamaMap[item.id] || 'Girilmedi';
                      return (
                        <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex justify-between items-center gap-2 hover:border-slate-350 transition">
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-805 text-xs truncate">{item.ad} {item.soyad}</h4>
                            <span className="text-[9px] text-slate-500 block truncate font-mono mt-0.5">💼 {item.gorev}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={!canEditAkvizyonYoklama}
                              onClick={() => setAkvizyonYoklamaMap(prev => ({ ...prev, [item.id]: 'Geldi' }))}
                              className={`px-3 py-1.5 rounded-xl font-bold text-[9px] transition cursor-pointer ${
                                status === 'Geldi' ? 'bg-emerald-600 text-white shadow-sm font-black' : 'bg-white hover:bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              GELDİ
                            </button>
                            <button
                              type="button"
                              disabled={!canEditAkvizyonYoklama}
                              onClick={() => setAkvizyonYoklamaMap(prev => ({ ...prev, [item.id]: 'Gelmedi' }))}
                              className={`px-3 py-1.5 rounded-xl font-bold text-[9px] transition cursor-pointer ${
                                status === 'Gelmedi' ? 'bg-rose-600 text-white shadow-sm font-black' : 'bg-white hover:bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              GELMEDİ
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {akvizyonPersoneller.length === 0 && (
                      <div className="text-center p-6 text-slate-500 italic text-xs">
                        Akvizyon firmasına kayıtlı taşeron personel bulunamadı.
                      </div>
                    )}
                  </div>

                  {canEditAkvizyonYoklama && akvizyonPersoneller.length > 0 && (
                    <button
                      onClick={handleSaveAkvizyonYoklama}
                      disabled={loadingAkvizyonYoklama}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 text-slate-950 font-black text-xs py-3 rounded-2xl flex items-center justify-center space-x-1.5 border-b-2 border-amber-700 transition cursor-pointer shadow-md shadow-amber-500/10"
                    >
                      <Check size={13} />
                      <span>{loadingAkvizyonYoklama ? 'Kaydediliyor...' : 'YOKLAMAYI ARŞİVE KAYDET'}</span>
                    </button>
                  )}
                  {akvizyonNobetKilitli && (
                    <div className="w-full bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[11px] py-3 rounded-2xl flex items-center justify-center gap-2">
                      <Lock size={13} />
                      Nöbet kilitli — düzenleme kapalı (21:00 sonrası otomatik arşiv)
                    </div>
                  )}
                </div>

                {/* Sağ Panel: Geçmiş Arşivler & Personel Bazlı Arama */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Akvizyon Arşivi Listesi */}
                  <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                    <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">
                      📂 GEÇMİŞ AKVİZYON YOKLAMA ARŞİVLERİ
                    </span>

                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {akvizyonArchives.map((archive) => {
                        const presentCount = Object.values(archive.yoklama || {}).filter(v => v === 'Geldi').length;
                        const absentCount = Object.values(archive.yoklama || {}).filter(v => v === 'Gelmedi').length;
                        
                        return (
                          <div key={archive.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex justify-between items-center gap-4 hover:border-slate-350 transition">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <Calendar size={12} className="text-amber-500" />
                                <span className="font-bold text-xs text-slate-805 font-mono">{archive.tarih}</span>
                                <span className="text-[9px] text-slate-400 font-mono">Kaydeden: {archive.kaydeden}</span>
                                {(archive.kilitli || archive.otomatikKapanis) && (
                                  <span className="text-[8px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                                    {archive.otomatikKapanis ? 'Oto 21:00' : 'Kilitli'}
                                  </span>
                                )}
                              </div>
                              <div className="flex space-x-2 text-[9px] text-slate-500 font-mono font-bold">
                                <span>Geldi: <strong className="text-emerald-600">{presentCount}</strong></span>
                                <span>|</span>
                                <span>Gelmedi: <strong className="text-rose-600">{absentCount}</strong></span>
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedAkvizyonArchive(archive)}
                              className="bg-amber-600/10 hover:bg-amber-600 border border-amber-500/20 text-amber-400 hover:text-slate-950 text-[10px] font-black px-3.5 py-1.5 rounded-xl transition cursor-pointer"
                            >
                              Detayları İncele
                            </button>
                          </div>
                        );
                      })}

                      {akvizyonArchives.length === 0 && (
                        <div className="text-center p-6 text-slate-500 italic text-xs">
                          Arşivlenmiş Akvizyon yoklama kaydı bulunmuyor.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Personel Bazlı Yoklama Takip Havuzu */}
                  <div className="bg-white p-5 border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                    <span className="font-display font-black text-xs text-slate-805 uppercase tracking-widest block border-b border-slate-200 pb-2">
                      👤 PERSONEL BAZLI YOKLAMA SİCİL GEÇMİŞİ
                    </span>

                    <div className="space-y-3.5">
                      <select 
                        value={selectedAkvizyonPersonel?.id || ''} 
                        onChange={(e) => {
                          const found = akvizyonPersoneller.find(p => p.id === e.target.value);
                          setSelectedAkvizyonPersonel(found || null);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-850"
                      >
                        <option value="">-- Geçmişini İncelemek İstediğiniz Personeli Seçin --</option>
                        {akvizyonPersoneller.map(p => (
                          <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                        ))}
                      </select>

                      {selectedAkvizyonPersonel && (() => {
                        const history = akvizyonArchives.map(a => {
                          const status = a.yoklama?.[selectedAkvizyonPersonel.id] || 'Girilmedi';
                          return { tarih: a.tarih, status, kaydeden: a.kaydeden };
                        }).filter(h => h.status !== 'Girilmedi');

                        const cameDays = history.filter(h => h.status === 'Geldi').length;
                        const totalDays = history.length;
                        const attendanceRate = totalDays > 0 ? Math.round((cameDays / totalDays) * 100) : 0;

                        return (
                          <div className="space-y-3 text-xs">
                            {/* İstatistik Özet Kartı */}
                            <div className="grid grid-cols-3 gap-2.5 text-slate-750 font-semibold font-mono text-center">
                              <div className="bg-slate-50 border border-slate-200/50 p-2 rounded-xl">
                                <span className="text-[9px] text-slate-500 block uppercase font-sans">GELDİĞİ GÜN</span>
                                <strong className="text-emerald-600 text-sm">{cameDays} Gün</strong>
                              </div>
                              <div className="bg-slate-50 border border-slate-200/50 p-2 rounded-xl">
                                <span className="text-[9px] text-slate-500 block uppercase font-sans">GELMEDİĞİ GÜN</span>
                                <strong className="text-rose-600 text-sm">{totalDays - cameDays} Gün</strong>
                              </div>
                              <div className="bg-slate-50 border border-slate-200/50 p-2 rounded-xl">
                                <span className="text-[9px] text-slate-500 block uppercase font-sans">DEVAMLILIK ORANI</span>
                                <strong className="text-indigo-500 text-sm">%{attendanceRate}</strong>
                              </div>
                            </div>

                            {/* Tarih Bazlı Ayrıntılı Liste */}
                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                              {history.map((h, idx) => (
                                <div key={idx} className="bg-slate-50 border border-slate-100 p-2 px-3.5 rounded-xl flex justify-between items-center">
                                  <span className="font-mono text-[11px] font-bold text-slate-805">{h.tarih}</span>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-[9px] text-slate-400 font-mono">Kaydeden: {h.kaydeden}</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
                                      h.status === 'Geldi' ? 'bg-emerald-100 text-emerald-850 font-extrabold' : 'bg-rose-100 text-rose-850 font-extrabold'
                                    }`}>
                                      {h.status.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {history.length === 0 && (
                                <div className="text-center py-4 text-slate-500 italic text-[11px]">
                                  Bu personel için henüz yoklama geçmişi bulunmuyor.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

          {activeTab === 'evrak_galerisi' && (
            <div className="animate-in fade-in duration-150">
              <EvrakDuvariPanel
                items={evrakDuvariItems}
                canApprove={canApproveEvrakDuvari}
                onApprove={handleEvrakDuvariApprove}
                onReject={handleEvrakDuvariReject}
              />
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
                        <p className="text-[11px] text-slate-500">Görüşülen Yetkili: <strong className="text-slate-600">{guest.ziyaretEdilen}</strong></p>
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
                          <span className="font-bold text-amber-400 uppercase font-mono">{evr.evrakNo || evr.fileName || 'Evrak'}</span>
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
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[9px] font-mono text-slate-550 block">Giriş Saati: {evr.saat}</span>
                          {evr.fotoUrl && (
                            <button
                              type="button"
                              onClick={() => openBase64InNewTab(evr.fotoUrl, evr.fileName || 'Belge')}
                              className="text-[9px] font-black text-amber-700 hover:text-amber-900 underline cursor-pointer"
                            >
                              Belgeyi Aç
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!selectedArchive.evrakLoglari || selectedArchive.evrakLoglari.length === 0) && (
                      <p className="text-[11px] text-slate-500 italic">Bugün hiçbir evrak/teslimat kaydı bulunmuyor.</p>
                    )}
                  </div>
                </div>

              </div>

              {/* 5. O gün yüklenen fotoğraflar */}
              {(() => {
                const arsivFotolar = resolveNobetArsivFotograflar(selectedArchive);
                return (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest block border-b border-slate-200 pb-1.5">
                      📷 NÖBET GÜNÜ YÜKLENEN FOTOĞRAFLAR ({arsivFotolar.length})
                    </span>
                    {arsivFotolar.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto pr-1">
                        {arsivFotolar.map((foto) => {
                          const isImage =
                            String(foto.fotoUrl || '').startsWith('data:image/') ||
                            /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(foto.fotoUrl || '')) ||
                            /\.(jpe?g|png|webp|gif)$/i.test(String(foto.fileName || ''));
                          return (
                            <button
                              key={foto.id}
                              type="button"
                              onClick={() => openBase64InNewTab(foto.fotoUrl, foto.fileName || 'Fotoğraf')}
                              className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-amber-400 transition cursor-pointer"
                            >
                              {isImage ? (
                                <img
                                  src={foto.fotoUrl}
                                  alt={foto.fileName || 'Nöbet fotoğrafı'}
                                  className="w-full h-28 object-cover bg-slate-100"
                                />
                              ) : (
                                <div className="w-full h-28 bg-slate-100 flex flex-col items-center justify-center gap-1 text-slate-500 px-2">
                                  <FileText size={18} />
                                  <span className="text-[9px] font-bold text-center truncate w-full">
                                    {foto.fileName || 'Belge'}
                                  </span>
                                </div>
                              )}
                              <div className="p-2 space-y-0.5">
                                <span className="text-[9px] font-black uppercase text-amber-700 tracking-wide block">
                                  {foto.kaynakEtiket}
                                </span>
                                <p className="text-[10px] text-slate-600 line-clamp-2 leading-snug">
                                  {foto.aciklama || foto.fileName || '—'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        Bu nöbet arşivinde yüklenmiş fotoğraf bulunmuyor.
                      </p>
                    )}
                  </div>
                );
              })()}

            </div>

            {/* Modal Footer actions */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button
                type="button"
                onClick={() => handleArchivedNobetRaporuAl(selectedArchive)}
                className="bg-indigo-650 hover:bg-indigo-750 text-white font-extrabold px-5 py-2 rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer transition shadow-md shadow-indigo-600/10"
              >
                <Download size={13} />
                <span>PDF Rapor İndir</span>
              </button>
              <button
                onClick={() => setSelectedArchive(null)}
                className="bg-slate-850 hover:bg-slate-750 text-white font-bold px-6 py-2 rounded-xl text-xs cursor-pointer border border-slate-700"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 📂 AKVİZYON YOKLAMA DETAY MODAL */}
      {selectedAkvizyonArchive && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 text-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in duration-150">
            
            <div className="bg-slate-50 p-5 px-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <ClipboardList className="text-amber-500" size={18} />
                <div>
                  <h3 className="font-black text-sm uppercase tracking-widest text-slate-850">Akvizyon Yoklama Detayı</h3>
                  <p className="text-[10px] text-slate-500 font-mono">Tarih: {selectedAkvizyonArchive.tarih} | Kaydeden: {selectedAkvizyonArchive.kaydeden}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedAkvizyonArchive(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-500 hover:text-slate-700 rounded-xl p-1.5 cursor-pointer transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-2">
                <span className="font-bold text-[9px] block uppercase text-amber-500 tracking-wider">Yoklama Sonuçları</span>
                <div className="divide-y divide-slate-200 text-slate-700">
                  {akvizyonPersoneller.map(p => {
                    const status = selectedAkvizyonArchive.yoklama?.[p.id] || 'Girilmedi';
                    return (
                      <div key={p.id} className="py-2.5 flex justify-between items-center">
                        <div>
                          <strong className="text-slate-805 block text-xs">{p.ad} {p.soyad}</strong>
                          <span className="text-[9px] text-slate-500 font-mono uppercase">{p.gorev}</span>
                        </div>
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg ${
                          status === 'Geldi' ? 'bg-emerald-100 text-emerald-850' : 'bg-rose-100 text-rose-850'
                        }`}>
                          {status.toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedAkvizyonArchive(null)}
                className="bg-slate-805 hover:bg-slate-750 text-white font-bold px-6 py-2 rounded-xl text-xs cursor-pointer"
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
          <div className="bg-white text-slate-900 rounded-3xl w-80 overflow-hidden shadow-2xl border border-slate-200 flex flex-col p-5 animate-in zoom-in duration-150 print:shadow-none">
            <CorporateReportLayout orientation="portrait" docCode={`KART: ${activeBadgeGuest.kartNo}`}>
            <p className="text-[10px] text-slate-500 font-mono text-center mb-3">ŞANTİYE RESMİ GÜVENLİK GİRİŞ KARTI</p>
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
                  <span className="font-bold text-slate-800">{activeBadgeGuest.ziyaretEdilen}</span>
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

            </CorporateReportLayout>

            {/* Actions */}
            <div className="flex space-x-2 pt-2 text-xs print:hidden">
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
                type="button"
                onClick={() => handleZiyaretciWhatsApp(activeBadgeGuest)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl cursor-pointer flex items-center justify-center space-x-1"
              >
                <MessageCircle size={12} />
                <span>WP</span>
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

      {editingKayit && (
        <GuvenlikKayitDuzenleModal
          kind={editingKayit.kind}
          record={editingKayit.record}
          tankerLabel={editingKayit.tankerLabel}
          onClose={() => setEditingKayit(null)}
          onSave={handleSaveDuzenlenenKayit}
        />
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
