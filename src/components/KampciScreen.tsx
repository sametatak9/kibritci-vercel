import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Tent, Plus, Trash2, Camera, Check, RefreshCw, Eye, 
  Search, UserPlus, ClipboardList, Package, Layers, MapPin, Sparkles, CheckCircle, Clock, X, ArrowRight, ShieldCheck, DoorOpen, LogOut, Image as ImageIcon, MessageSquare, Calendar, Truck, AlertTriangle
} from 'lucide-react';
import { KampOdasi, KampKaydi, Personel, StokKart, KampYerleske, KampKat, CariKart, CariKartIslem, AylikYoklamaMap, Fatura, Irsaliye } from '../types/erp';
import { db, saveDocument } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { ensureKampFaaliyetFotoPersisted } from '../lib/sahaFaaliyetFotoStorage';
import { createKampYerleske, createKampKat, katsForYerleske, createKampOdasi, deleteKampOdasi, updateKampOdasi } from '../lib/kampYapisi';
import { assignKampResident, evictKampResident, reactivateEvictedKampStays, detectMassKampEvictionDate } from '../lib/kampPlacementUtils';
import { buildKampciGunlukOzet } from '../lib/gunlukAkisUtils';
import { buildWhatsAppUrl } from '../lib/mobilOnayUtils';
import { KampHaftalikYoklamaTab } from './KampHaftalikYoklamaTab';
import { KampGunlukYoklamaTab } from './KampGunlukYoklamaTab';
import { KampVidanjorTab } from './KampVidanjorTab';
import { KampTaseronSayimTab } from './KampTaseronSayimTab';
import { AylikPuantajMobilPanel } from './AylikPuantajMobilPanel';
import { collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy } from 'firebase/firestore';
import {
  applySahaMesaiToYoklama,
  mesaiInputDisplayValue,
  setMesaiHoursInMap,
} from '../lib/sahaFaaliyetUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  canonicalizeAnaFirmaAdi,
  isTaseronPersonel,
  isKampciYoklamaKapsami,
  isSoforGorev,
  isOperatorGorev,
  isIdariPersonel,
} from '../lib/yoklamaUtils';
import { firmaEslesir } from '../lib/taseronUtils';
import { validateTC } from '../lib/personelOdemeUtils';
import { vibrateVidanjorAlert } from '../lib/vidanjorUtils';
import { resolveGeldiRolPersonelIds } from '../lib/mobilRolEtiketUtils';
interface KampciScreenProps {
  kampOdalari: KampOdasi[];
  setKampOdalari: React.Dispatch<React.SetStateAction<KampOdasi[]>>;
  kampKayitlari: KampKaydi[];
  setKampKayitlari: React.Dispatch<React.SetStateAction<KampKaydi[]>>;
  reloadKampData?: () => Promise<void>;
  kampYerleskeleri?: KampYerleske[];
  kampKatlari?: KampKat[];
  personeller: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
  cariKartlar?: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  yoklamalar?: AylikYoklamaMap;
  setYoklamalar?: (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  stokKartlar?: StokKart[];
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
}

export const KampciScreen: React.FC<KampciScreenProps> = ({
  kampOdalari,
  setKampOdalari,
  kampKayitlari,
  setKampKayitlari,
  reloadKampData,
  kampYerleskeleri = [],
  kampKatlari = [],
  personeller,
  setPersoneller,
  cariKartlar = [],
  setCariKartlar,
  yoklamalar = {},
  setYoklamalar,
  saveYoklamalarNow,
  stokKartlar = [],
  faturalar = [],
  setFaturalar,
  irsaliyeler = [],
  setIrsaliyeler,
  setCariIslemGecmisi,
  currentUser,
  onSignOut,
  isStandalone = false,
  addNotification
}) => {
  // Tabs: 'rooms' | 'placement' | 'warehouse' | 'activities' | 'haftalik_yoklama' | 'yoklama' | 'aylik_puantaj' | 'vidanjor' | ...
  const [activeSubTab, setActiveSubTab] = useState<'rooms' | 'placement' | 'warehouse' | 'activities' | 'gunluk_akis' | 'personel_giris' | 'taseron_sayim' | 'haftalik_yoklama' | 'yoklama' | 'aylik_puantaj' | 'vidanjor'>('placement');

  const filterKampciPersonel = React.useCallback(
    (p: Personel) => {
      if (isTaseronPersonel(p) || isIdariPersonel(p)) return false;
      // Şöför / operatör kendi yoklamalarında; kampçı listesinde görünmez
      if (isSoforGorev(p.gorev) || isOperatorGorev(p.gorev)) return false;
      // Kampçı + Şenör
      return isKampciYoklamaKapsami(p.gorev);
    },
    []
  );
  const [sendingKampAkis, setSendingKampAkis] = useState(false);
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');

  // ─────────────────────────────────────────────────────────────
  // STATUS / ALERTS STATE
  // ─────────────────────────────────────────────────────────────
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const statusHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (type: 'success' | 'error' | 'info', text: string, autoHideMs = 4000) => {
    if (statusHideTimer.current) clearTimeout(statusHideTimer.current);
    setStatusMessage({ type, text });
    if (type !== 'info' && autoHideMs > 0) {
      statusHideTimer.current = setTimeout(() => setStatusMessage(null), autoHideMs);
    }
  };

  const showKampYoklamaStatus = (type: 'success' | 'error', text: string) => {
    showStatus(type, text);
    void addNotification?.(text);
  };

  // Kapı vidanjör girişi → kampçı her sekmedeyken bildirim + titreşim
  const [vidanjorAlert, setVidanjorAlert] = useState<string | null>(null);
  const seenVidanjorNotifIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bildirimler'), (snap) => {
      const now = Date.now();
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const id = change.doc.id;
        if (seenVidanjorNotifIds.current.has(id)) return;
        const data = change.doc.data() as Record<string, unknown>;
        const tip = String(data.tip || data.metaTip || '');
        const hedef = String(data.hedefRol || '').toLocaleUpperCase('tr-TR');
        const mesaj = String(data.mesaj || '');
        const ts = new Date(String(data.tarih || 0)).getTime();
        if (Number.isFinite(ts) && now - ts > 120_000) return;
        const isVidanjor =
          tip === 'VIDANJOR_GIRIS' ||
          (hedef.includes('KAMP') && mesaj.toLocaleLowerCase('tr-TR').includes('vidanj'));
        if (!isVidanjor) return;
        seenVidanjorNotifIds.current.add(id);
        vibrateVidanjorAlert();
        setVidanjorAlert(mesaj || 'Vidanjör sahaya giriş yaptı — fiş yükleyin.');
        setActiveSubTab('vidanjor');
        try {
          window.dispatchEvent(
            new CustomEvent('app-toast', {
              detail: { type: 'info', message: mesaj || 'Vidanjör girişi' },
            })
          );
        } catch {
          /* ignore */
        }
      });
    });
    return () => unsub();
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 🏕️ 1. YERLEŞKE / KAT / ODA — App seviyesinde Firestore dinleyicisi ile senkron
  // ─────────────────────────────────────────────────────────────
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [selectedYerleskeId, setSelectedYerleskeId] = useState('');
  const [selectedKatId, setSelectedKatId] = useState('');
  const [newYerleskeAd, setNewYerleskeAd] = useState('');
  const [newKatAd, setNewKatAd] = useState('');
  const [odaNo, setOdaNo] = useState('');
  const [kapasite, setKapasite] = useState<number>(4);
  const [firmaTipi, setFirmaTipi] = useState<'ANA_FIRMA' | 'TASERON'>('ANA_FIRMA');
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [loadingYapı, setLoadingYapı] = useState(false);

  const yerleskeler = kampYerleskeleri;
  const katlar = kampKatlari;

  const taseronCariler = cariKartlar.filter((c) => c.kartTipi === 'TASERON' && c.durum === 'AKTIF');
  const [placementFirmaTipi, setPlacementFirmaTipi] = useState<'ANA_FIRMA' | 'TASERON'>('ANA_FIRMA');

  const selectedYerleske = yerleskeler.find(y => y.id === selectedYerleskeId);
  const selectedKat = katlar.find(k => k.id === selectedKatId);
  const yerleskeKatlari = selectedYerleskeId ? katsForYerleske(katlar, selectedYerleskeId) : [];

  // ─────────────────────────────────────────────────────────────
  // 👥 2. YERLEŞİM (CHECK-IN / OUT) STATE
  // ─────────────────────────────────────────────────────────────
  const [placementYerleskeId, setPlacementYerleskeId] = useState('');
  const [placementKatId, setPlacementKatId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');

  const placementYerleskeOptions = useMemo(() => {
    const seen = new Map<string, string>();

    // Primary source: centrally managed campus definitions
    for (const y of yerleskeler) {
      if (y.id && y.ad) seen.set(y.id, y.ad);
    }

    // Fallback source: legacy rooms that may not have normalized structure
    for (const room of kampOdalari) {
      const key = room.yerleskeId || room.yerleskeAdi;
      if (key) seen.set(key, room.yerleskeAdi);
    }

    return [...seen.entries()]
      .map(([id, ad]) => ({ id, ad }))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [yerleskeler, kampOdalari]);

  const placementKatOptions = useMemo(() => {
    if (!placementYerleskeId) return [] as KampKat[];
    const yerleske = placementYerleskeOptions.find(y => y.id === placementYerleskeId);
    const yerleskeAd = yerleske?.ad || '';
    const yerleskeRecord = yerleskeler.find(y => y.id === placementYerleskeId || y.ad === yerleskeAd);

    if (yerleskeRecord) {
      // Do not require an existing room for a floor to be selectable.
      // This keeps Kampçı and Kamp Yönetimi in sync as soon as floor is created.
      const kats = katsForYerleske(katlar, yerleskeRecord.id);
      if (kats.length > 0) {
        return kats.sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr'));
      }
    }

    const seen = new Map<string, string>();
    kampOdalari
      .filter(r => r.yerleskeId === placementYerleskeId || r.yerleskeAdi === yerleskeAd)
      .forEach(r => {
        const key = r.katId || r.kogusNo;
        if (key) seen.set(key, r.kogusNo);
      });

    return [...seen.entries()]
      .map(([id, ad]) => ({
        id,
        ad,
        yerleskeId: placementYerleskeId,
        yerleskeAdi: yerleskeAd,
        sira: 0,
        olusturmaTarihi: '',
      }))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [placementYerleskeId, kampOdalari, katlar, yerleskeler, placementYerleskeOptions]);

  const placementOdaOptions = useMemo(() => {
    if (!placementYerleskeId || !placementKatId) return [];
    const yerleske = placementYerleskeOptions.find(y => y.id === placementYerleskeId);
    const kat = placementKatOptions.find(k => k.id === placementKatId);
    if (!yerleske || !kat) return [];

    return kampOdalari
      .filter(r => {
        const yerleskeMatch = r.yerleskeId === placementYerleskeId || r.yerleskeAdi === yerleske.ad;
        const katMatch = r.katId === placementKatId || r.kogusNo === kat.ad;
        return yerleskeMatch && katMatch;
      })
      .sort((a, b) => a.odaNo.localeCompare(b.odaNo, 'tr', { numeric: true }));
  }, [placementYerleskeId, placementKatId, kampOdalari, placementYerleskeOptions, placementKatOptions]);
  const [placementType, setPlacementType] = useState<'DB' | 'MANUAL'>('DB');
  const [selectedPersonelId, setSelectedPersonelId] = useState('');
  const [manualPersonelIsim, setManualPersonelIsim] = useState('');
  const [searchPersonelQuery, setSearchPersonelQuery] = useState('');
  const [placementTcNo, setPlacementTcNo] = useState('');
  const [placementTelefonNo, setPlacementTelefonNo] = useState('');
  const [firmaType, setFirmaType] = useState<'DB' | 'MANUAL'>('DB');
  const [selectedFirma, setSelectedFirma] = useState('');
  const [manualFirma, setManualFirma] = useState('');
  const [loadingPlacement, setLoadingPlacement] = useState(false);
  const [placementModalRoom, setPlacementModalRoom] = useState<KampOdasi | null>(null);

  const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');
  const phoneMatchKey = (raw: string) => {
    const d = digitsOnly(raw);
    if (d.length >= 10) return d.slice(-10);
    return d;
  };

  const normalizeNameKey = (raw: string) =>
    String(raw || '')
      .toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .replace(/["']/g, '')
      .replace(/\(.*?\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const sanitizeManualName = (raw: string) =>
    raw
      .replace(/"[^"]*"/g, ' ')
      .replace(/\bsoyadı?\s+belli\s+değil\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const isKibritciName = (firma: string) =>
    normalizeNameKey(firma).includes('KIBRITCI');

  const findDbPersonelByRawName = (rawName: string) => {
    const cleaned = sanitizeManualName(rawName);
    const targetKey = normalizeNameKey(cleaned);
    if (!targetKey) return undefined;
    const tokens = targetKey.split(' ').filter(Boolean);
    const exact = personeller.find((p) => normalizeNameKey(`${p.ad} ${p.soyad}`) === targetKey);
    if (exact) return exact;
    if (tokens.length >= 2) {
      return personeller.find((p) => {
        const full = normalizeNameKey(`${p.ad} ${p.soyad}`);
        return full.includes(targetKey) || targetKey.includes(full);
      });
    }
    const sameFirstName = personeller.filter((p) => normalizeNameKey(p.ad) === tokens[0]);
    if (sameFirstName.length === 1) return sameFirstName[0];
    return undefined;
  };

  const findExistingTaseronPersonel = (rawName: string, firmaAdi: string) => {
    const nameKey = normalizeNameKey(sanitizeManualName(rawName));
    const firmaKey = normalizeNameKey(firmaAdi);
    if (!nameKey || !firmaKey) return undefined;
    return personeller.find(
      (p) =>
        p.firmaTipi === 'TASERON' &&
        normalizeNameKey(`${p.ad} ${p.soyad}`) === nameKey &&
        normalizeNameKey(p.firmaAdi || '') === firmaKey
    );
  };

  const findPersonelByTc = (tcRaw: string) => {
    const tc = digitsOnly(tcRaw);
    if (!validateTC(tc)) return undefined;
    return personeller.find((p) => digitsOnly(p.tcNo || '') === tc);
  };

  /** İsim ve TC birlikte eşleşirse mevcut personeli döndürür (fazladan kayıt açılmasın). */
  const findPersonelByNameAndTc = (rawName: string, tcRaw: string) => {
    const tc = digitsOnly(tcRaw);
    if (!validateTC(tc)) return undefined;
    const nameKey = normalizeNameKey(sanitizeManualName(rawName));
    if (!nameKey) return undefined;
    return personeller.find(
      (p) =>
        digitsOnly(p.tcNo || '') === tc &&
        normalizeNameKey(`${p.ad} ${p.soyad}`) === nameKey
    );
  };

  const findPersonelByTel = (telRaw: string) => {
    const key = phoneMatchKey(telRaw);
    if (key.length < 10) return undefined;
    return personeller.find((p) => phoneMatchKey(p.telefonNo || '') === key);
  };

  /** Kamp kaydı / personel Ana Firma mı? Tahliyede işten çıkış YASAK. */
  const isAnaFirmaKampKaydi = (reg: KampKaydi): boolean => {
    if (reg.firmaTipi === 'ANA_FIRMA') return true;
    if (reg.firmaTipi === 'TASERON') return false;
    const p = reg.personelId ? personeller.find((x) => x.id === reg.personelId) : undefined;
    if (p) return !isTaseronPersonel(p);
    const firma = String(reg.calistigiFirma || '').trim();
    if (!firma) return true;
    return isKibritciName(firma);
  };

  /**
   * Oda yerleşimi: varsa birleştir (TC / isim+TC / tel / isim), yoksa yeni kur.
   * Çift kayıt açılmaz.
   */
  const resolveOrCreateKampPersonel = async (
    rawName: string,
    firmaAdi: string,
    firmaTipi: 'ANA_FIRMA' | 'TASERON',
    tcNo: string,
    telefonNo: string
  ): Promise<{ personel: Personel; created: boolean; merged: boolean }> => {
    const tc = digitsOnly(tcNo);
    const candidates: Personel[] = [];
    const pushUnique = (p?: Personel) => {
      if (p && !candidates.some((c) => c.id === p.id)) candidates.push(p);
    };
    pushUnique(findPersonelByNameAndTc(rawName, tc));
    pushUnique(findPersonelByTc(tc));
    pushUnique(findPersonelByTel(telefonNo));
    pushUnique(findDbPersonelByRawName(rawName));
    if (firmaTipi === 'TASERON') {
      pushUnique(findExistingTaseronPersonel(rawName, firmaAdi));
    }

    if (candidates.length > 0) {
      let best = candidates[0];
      // TC eşleşeni önceliklendir
      if (validateTC(tc)) {
        const byTc = candidates.find((p) => digitsOnly(p.tcNo || '') === tc);
        if (byTc) best = byTc;
      }
      const nextTc = (validateTC(tc) ? tc : '') || digitsOnly(best.tcNo || '');
      const nextTel = telefonNo.trim() || best.telefonNo || '';
      const nextFirmaAdi =
        firmaTipi === 'ANA_FIRMA'
          ? CANONICAL_ANA_FIRMA_ADI
          : String(firmaAdi || best.firmaAdi || '').trim() || best.firmaAdi || 'Taşeron';
      const wasKampGorev = /KAMP\s*PERSONEL/i.test(String(best.gorev || ''));
      const needsPatch =
        (nextTc && digitsOnly(best.tcNo || '') !== nextTc) ||
        (nextTel && phoneMatchKey(best.telefonNo || '') !== phoneMatchKey(nextTel)) ||
        best.firmaTipi !== firmaTipi ||
        !firmaEslesir(best.firmaAdi || '', nextFirmaAdi) ||
        (firmaTipi === 'TASERON' && wasKampGorev) ||
        (firmaTipi === 'TASERON' && best.onayDurumu === 'ONAY BEKLİYOR');

      if (needsPatch) {
        const patched: Personel = {
          ...best,
          tcNo: nextTc || best.tcNo,
          telefonNo: nextTel || best.telefonNo,
          firmaTipi,
          firmaAdi: nextFirmaAdi,
          departman: firmaTipi === 'TASERON' ? 'TAŞERON' : best.departman || 'SAHA',
          gorev:
            firmaTipi === 'TASERON' && wasKampGorev ? 'TAŞERON PERSONEL' : best.gorev,
          onayDurumu: firmaTipi === 'TASERON' ? 'ONAYLANDI' : best.onayDurumu,
          durum: best.durum === false ? true : best.durum,
        };
        await saveDocument('personeller', patched);
        return { personel: patched, created: false, merged: true };
      }
      return { personel: best, created: false, merged: true };
    }

    const created = await createKampPersonel(rawName, firmaAdi, firmaTipi, tcNo, telefonNo);
    // createKampPersonel kendi içinde de eşleşme yapabilir
    const wasExisting = personeller.some((p) => p.id === created.id);
    return { personel: created, created: !wasExisting, merged: wasExisting };
  };

  const createKampPersonel = async (
    rawName: string,
    firmaAdi: string,
    firmaTipi: 'ANA_FIRMA' | 'TASERON',
    tcNo: string,
    telefonNo: string
  ) => {
    const tc = digitsOnly(tcNo);
    const byNameAndTc = findPersonelByNameAndTc(rawName, tc);
    if (byNameAndTc) return byNameAndTc;
    const byTc = findPersonelByTc(tc);
    if (byTc) return byTc;
    const byTel = findPersonelByTel(telefonNo);
    if (byTel) return byTel;
    const byName = findDbPersonelByRawName(rawName);
    if (byName) return byName;

    if (firmaTipi === 'TASERON') {
      const existing = findExistingTaseronPersonel(rawName, firmaAdi);
      if (existing) {
        const needsPatch =
          (tc && digitsOnly(existing.tcNo || '') !== tc) ||
          (telefonNo && phoneMatchKey(existing.telefonNo || '') !== phoneMatchKey(telefonNo));
        if (needsPatch) {
          const patched: Personel = {
            ...existing,
            tcNo: tc || existing.tcNo,
            telefonNo: telefonNo.trim() || existing.telefonNo,
            firmaTipi: 'TASERON',
            firmaAdi: String(firmaAdi || existing.firmaAdi || '').trim() || existing.firmaAdi,
          };
          await saveDocument('personeller', patched);
          return patched;
        }
        return existing;
      }
    }

    const cleaned = sanitizeManualName(rawName);
    const parts = cleaned.split(' ').filter(Boolean);
    const ad = (parts[0] || 'ADI').toLocaleUpperCase('tr-TR');
    const soyad = (parts.slice(1).join(' ') || 'BİLİNMİYOR').toLocaleUpperCase('tr-TR');
    const normalizedFirma =
      firmaTipi === 'ANA_FIRMA'
        ? CANONICAL_ANA_FIRMA_ADI
        : String(firmaAdi || '').trim() || 'Taşeron';
    const personel: Personel = {
      id: `prs_kamp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tcNo: tc,
      ad,
      soyad,
      babaAdi: '',
      dogumTarihi: '1990-01-01',
      telefonNo: telefonNo.trim() || '',
      eposta: '',
      adres: 'Kamp Yerleşimi',
      il: '',
      ilce: '',
      departman: firmaTipi === 'TASERON' ? 'TAŞERON' : 'SAHA',
      gorev: firmaTipi === 'TASERON' ? 'TAŞERON PERSONEL' : 'KAMP PERSONEL',
      iseGirisTarihi: new Date().toISOString().slice(0, 10),
      cinsiyet: 'Belirtilmedi',
      maas: 0,
      ucretTipi: 'Günlük',
      sgkDurumu: firmaTipi === 'TASERON' ? 'Sigortasız' : "SGK'lı",
      bankaAdi: '',
      subeAdi: '',
      ibanNo: '',
      durum: true,
      firmaTipi,
      firmaAdi: normalizedFirma,
      // Ana firma kampçı kayıtları Onay Havuzu'na düşer; taşeron firma kadrosu doğrudan listelenir
      onayDurumu: firmaTipi === 'TASERON' ? 'ONAYLANDI' : 'ONAY BEKLİYOR',
      kaynak: 'KAMPCI',
    };
    await saveDocument('personeller', personel);
    return personel;
  };

  const ensureTaseronCari = async (firmaAdi: string): Promise<CariKart | null> => {
    const cleanedFirma = String(firmaAdi || '').trim();
    if (!cleanedFirma || isKibritciName(cleanedFirma)) return null;
    const existing = cariKartlar.find(
      (c) => c.kartTipi === 'TASERON' && normalizeNameKey(c.unvan) === normalizeNameKey(cleanedFirma)
    );
    if (existing) return existing;
    const newCari: CariKart = {
      id: `ck_taseron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kartTipi: 'TASERON',
      kod: `TSR-${Math.floor(100 + Math.random() * 900)}`,
      unvan: cleanedFirma,
      yetkili: '',
      telefon: '',
      eposta: '',
      vergiNo: '',
      vergiDairesi: '',
      adres: 'Kamp yerleşim entegrasyonu ile oluşturuldu.',
      iban: '',
      durum: 'AKTIF',
      notlar: 'Kamp oda yerleşiminden otomatik oluşturulan taşeron cari kartı.',
    };
    await saveDocument('cariKartlar', newCari);
    return newCari;
  };

  // ─────────────────────────────────────────────────────────────
  // 📦 3. DEPO SAYIMI (WAREHOUSE AUDIT) STATE
  // ─────────────────────────────────────────────────────────────
  const [searchRoomQuery, setSearchRoomQuery] = useState('');
  const [mesaiPersonelSearch, setMesaiPersonelSearch] = useState('');
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
        const ad = item.stokAdi || item.urunAdi || 'Stok';
        dynamicMiktarlar[ad] = 0;
      });
      setSayimMiktarlari(dynamicMiktarlar);
    }
  }, [stokKartlar]);

  // ─────────────────────────────────────────────────────────────
  // 🧹 4. GÜNLÜK FAALİYETLER STATE
  // ─────────────────────────────────────────────────────────────
  const [gunlukFaaliyetler, setGunlukFaaliyetler] = useState<any[]>([]);
  const [faaliyetTipi, setFaaliyetTipi] = useState<'TEMİZLİK' | 'YEMEK' | 'GÜVENLİK' | 'BAKIM' | 'DİĞER'>('TEMİZLİK');
  const [faaliyetGrubu, setFaaliyetGrubu] = useState<'NORMAL' | 'MESAI'>('NORMAL');
  const [personelMesaiSaatleri, setPersonelMesaiSaatleri] = useState<Record<string, number>>({});
  const [faaliyetYerleske, setFaaliyetYerleske] = useState('');
  const [faaliyetAciklama, setFaaliyetAciklama] = useState('');
  const [faaliyetFoto, setFaaliyetFoto] = useState<string | null>(null);
  const [loadingFaaliyet, setLoadingFaaliyet] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 🚪 PERSONEL GİRİŞE YOLLA (Formen ile aynı onay akışı)
  // ─────────────────────────────────────────────────────────────
  const [yeniAd, setYeniAd] = useState('');
  const [yeniSoyad, setYeniSoyad] = useState('');
  const [yeniGorev, setYeniGorev] = useState('');
  const [yeniTcNo, setYeniTcNo] = useState('');
  const [yeniTelefonNo, setYeniTelefonNo] = useState('');
  const [girisFirmaTipi, setGirisFirmaTipi] = useState<'ANA_FIRMA' | 'TASERON'>('ANA_FIRMA');
  const [girisFirmaType, setGirisFirmaType] = useState<'DB' | 'MANUAL'>('DB');
  const [girisSelectedFirma, setGirisSelectedFirma] = useState('');
  const [girisManualFirma, setGirisManualFirma] = useState('');
  const [yeniKimlikFoto, setYeniKimlikFoto] = useState<string | null>(null);
  const [sonGirisTalebi, setSonGirisTalebi] = useState<{ id: string; ad: string; soyad: string; gorev: string } | null>(null);
  const [girisTalepleriList, setGirisTalepleriList] = useState<any[]>([]);

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

    // 3. Personel giriş talepleri
    const girisColl = collection(db, 'personelGirisTalepleri');
    const unsubGiris = onSnapshot(girisColl, (snap) => {
      const list: any[] = [];
      const email = currentUser?.email?.toLowerCase() || '';
      snap.forEach((d) => {
        const data: any = { id: d.id, ...(d.data() as Record<string, any>) };
        const sender = String(data.gonderenKampci || data.gonderenFormen || '').toLowerCase();
        if (sender === email && (data.kaynakPanel === 'KAMPÇI' || data.gonderenKampci)) {
          list.push(data);
        }
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setGirisTalepleriList(list);
    });

    return () => {
      unsubCounts();
      unsubActs();
      unsubGiris();
    };
  }, [currentUser?.email]);

  useEffect(() => {
    if (yerleskeler.length > 0 && !selectedYerleskeId) {
      setSelectedYerleskeId(yerleskeler[0].id);
    }
    if (yerleskeler.length > 0 && !faaliyetYerleske) {
      setFaaliyetYerleske(yerleskeler[0].ad);
    }
  }, [yerleskeler, selectedYerleskeId, faaliyetYerleske]);

  useEffect(() => {
    const kats = selectedYerleskeId ? katsForYerleske(katlar, selectedYerleskeId) : [];
    if (kats.length > 0 && !kats.some(k => k.id === selectedKatId)) {
      setSelectedKatId(kats[0].id);
    }
    if (kats.length === 0) setSelectedKatId('');
  }, [selectedYerleskeId, katlar, selectedKatId]);

  const handleCreateYerleske = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYerleskeAd.trim()) return;
    setLoadingYapı(true);
    try {
      const y = await createKampYerleske(newYerleskeAd, currentUser?.email);
      setSelectedYerleskeId(y.id);
      setNewYerleskeAd('');
      setSetupStep(2);
      showStatus('success', `Yerleşke "${y.ad}" oluşturuldu. Şimdi kat ekleyin.`);
    } catch (err) {
      showStatus('error', 'Yerleşke oluşturulamadı.');
    } finally {
      setLoadingYapı(false);
    }
  };

  const handleCreateKat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYerleske || !newKatAd.trim()) return;
    setLoadingYapı(true);
    try {
      const k = await createKampKat(selectedYerleske, newKatAd, yerleskeKatlari.length + 1);
      setSelectedKatId(k.id);
      setNewKatAd('');
      setSetupStep(3);
      showStatus('success', `Kat "${k.ad}" eklendi. Oda tanımlayabilirsiniz.`);
    } catch (err) {
      showStatus('error', 'Kat oluşturulamadı.');
    } finally {
      setLoadingYapı(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🏕️ ACTIONS: ROOM MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odaNo || !selectedYerleske || !selectedKat) {
      showStatus('error', 'Önce yerleşke ve kat seçin, oda numarası girin.');
      return;
    }

    setLoadingRoom(true);
    try {
      const savedOdaNo = odaNo;
      await createKampOdasi({
        yerleskeAdi: selectedYerleske.ad,
        kogusNo: selectedKat.ad,
        odaNo: savedOdaNo,
        kapasite: Number(kapasite),
        firmaTipi,
        yerleskeId: selectedYerleske.id,
        katId: selectedKat.id,
        olusturan: currentUser?.email,
      });
      if (addNotification) {
        addNotification(`${selectedYerleske.ad} / ${selectedKat.ad} - Oda ${savedOdaNo} açıldı.`);
      }
      setOdaNo('');
      showStatus('success', `Oda ${savedOdaNo} başarıyla açıldı.`);
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
      await deleteKampOdasi(id);
      if (addNotification) {
        addNotification(`${name} nolu oda silindi.`);
      }
      showStatus('success', 'Oda silindi.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Oda silinemedi.');
    }
  };

  const handleReloadKamp = async () => {
    if (!reloadKampData) {
      showStatus('info', 'Canlı güncelleme açık. Veriler otomatik yenileniyor.');
      return;
    }
    showStatus('info', 'Kamp verileri yenileniyor…', 0);
    try {
      await reloadKampData();
      showStatus('success', 'Kamp verileri Firestore üzerinden yenilendi.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Kamp verileri yenilenemedi.');
    }
  };

  const handleRestoreYerlesim = async () => {
    const aktif = kampKayitlari.filter((k) => k.durum === 'AKTIF').length;
    const mass = detectMassKampEvictionDate(kampKayitlari, 3);
    const pasifRecent = kampKayitlari.filter((k) => {
      if (k.durum !== 'PASIF') return false;
      const d = (k.cikisTarihi || '').slice(0, 10);
      if (!d) return true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 45);
      return d >= cutoff.toISOString().slice(0, 10);
    }).length;

    if (pasifRecent === 0) {
      showStatus('info', 'Geri yüklenecek yakın tarihli PASIF yerleşim bulunamadı.');
      return;
    }

    const msg = mass
      ? `Aktif yerleşim: ${aktif}\n${mass.date} tarihinde ${mass.count} kişi PASIF görünüyor.\n\nBu toplu tahliyeyi geri alıp personelleri odalarına yerleştirmek istiyor musunuz?`
      : `Aktif yerleşim: ${aktif}\nSon 45 günde ${pasifRecent} PASIF yerleşim var.\n\nUygun olanları odalarına geri yüklemek istiyor musunuz?`;

    if (!window.confirm(msg)) return;

    showStatus('info', 'Yerleşimler geri yükleniyor…', 0);
    try {
      const result = await reactivateEvictedKampStays({
        kampKayitlari,
        kampOdalari,
        withinDays: 45,
        onlyCikisTarihi: mass?.date,
      });
      setKampKayitlari(result.kampKayitlari);
      setKampOdalari(result.kampOdalari);
      if (result.reactivatedCount > 0) {
        showStatus(
          'success',
          `${result.reactivatedCount} personel odalarına geri yerleştirildi${result.skippedCount ? ` (${result.skippedCount} atlandı)` : ''}.`
        );
        void addNotification?.(
          `Kamp yerleşim geri yükleme: ${result.reactivatedCount} kayıt AKTIF yapıldı.`
        );
      } else {
        showStatus(
          'info',
          result.skippedCount > 0
            ? `Geri yükleme yapılamadı (${result.skippedCount} kayıt atlandı — kapasite veya mükerrer aktif).`
            : 'Geri yüklenecek uygun kayıt bulunamadı.'
        );
      }
    } catch (err) {
      console.error(err);
      showStatus('error', err instanceof Error ? err.message : 'Yerleşim geri yüklenemedi.');
    }
  };

  const handleUpdateRoom = async (room: KampOdasi) => {
    const nextOdaNo = window.prompt('Yeni oda adı/no', room.odaNo);
    if (!nextOdaNo) return;
    const nextKapasiteRaw = window.prompt('Yeni kapasite (yatak)', String(room.kapasite));
    if (!nextKapasiteRaw) return;
    const nextKapasite = Number(nextKapasiteRaw);
    if (!Number.isFinite(nextKapasite) || nextKapasite < 1) {
      showStatus('error', 'Kapasite en az 1 olmalıdır.');
      return;
    }
    try {
      await updateKampOdasi({
        room,
        odaNo: nextOdaNo.trim(),
        kapasite: nextKapasite,
        olusturan: currentUser?.email,
      });
      showStatus('success', `Oda güncellendi: ${room.odaNo} → ${nextOdaNo.trim()}`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Oda güncellenemedi.');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 👥 ACTIONS: PERSONNEL PLACEMENT
  // ─────────────────────────────────────────────────────────────
  const resetPlacementPersonFields = () => {
    setSelectedPersonelId('');
    setManualPersonelIsim('');
    setSearchPersonelQuery('');
    setPlacementTcNo('');
    setPlacementTelefonNo('');
    setSelectedFirma('');
    setManualFirma('');
    setPlacementType('DB');
    setPlacementFirmaTipi('ANA_FIRMA');
    setFirmaType('DB');
  };

  const prefillPlacementFromRoom = (room: KampOdasi) => {
    setSelectedRoomId(room.id);
    const yerleskeMatch = placementYerleskeOptions.find(
      (y) => y.id === room.yerleskeId || y.ad === room.yerleskeAdi
    );
    setPlacementYerleskeId(room.yerleskeId || yerleskeMatch?.id || '');
    setPlacementKatId(room.katId || room.kogusNo || '');
  };

  const applyPersonelFirmaMatch = (person: Personel) => {
    if (person.firmaTipi === 'TASERON' || isTaseronPersonel(person)) {
      setPlacementFirmaTipi('TASERON');
      const firmaAdi = String(person.firmaAdi || '').trim();
      if (!firmaAdi) return;
      const inDb = taseronCariler.some(
        (c) => normalizeNameKey(c.unvan) === normalizeNameKey(firmaAdi)
      );
      if (inDb) {
        setFirmaType('DB');
        setSelectedFirma(firmaAdi);
        setManualFirma('');
      } else {
        setFirmaType('MANUAL');
        setManualFirma(firmaAdi);
        setSelectedFirma('');
      }
      return;
    }
    setPlacementFirmaTipi('ANA_FIRMA');
    setFirmaType('DB');
    setSelectedFirma('');
    setManualFirma('');
  };

  const applyPersonelFromLookup = (person: Personel) => {
    setPlacementType('DB');
    setSelectedPersonelId(person.id);
    setManualPersonelIsim(`${person.ad} ${person.soyad}`);
    setPlacementTcNo(digitsOnly(person.tcNo || ''));
    setPlacementTelefonNo(String(person.telefonNo || '').trim());
    applyPersonelFirmaMatch(person);
  };

  const runPlacementTcSorgu = () => {
    const tc = digitsOnly(placementTcNo);
    if (!validateTC(tc)) {
      showStatus('error', 'TC SORGU için 11 haneli geçerli TC girin.');
      return;
    }
    const found = findPersonelByTc(tc);
    if (!found) {
      showStatus('info', 'Bu TC ile kayıtlı personel bulunamadı — yeni kayıt için ad/soyad ve firmayı girin.');
      return;
    }
    applyPersonelFromLookup(found);
    showStatus('success', `${found.ad} ${found.soyad} bulundu (${found.firmaAdi || CANONICAL_ANA_FIRMA_ADI}).`);
  };

  const runPlacementTelSorgu = () => {
    const key = phoneMatchKey(placementTelefonNo);
    if (key.length < 10) {
      showStatus('error', 'TEL NO SORGU için en az 10 haneli telefon girin.');
      return;
    }
    const found = findPersonelByTel(placementTelefonNo);
    if (!found) {
      showStatus('info', 'Bu telefon ile kayıtlı personel bulunamadı — yeni kayıt için ad/soyad ve firmayı girin.');
      return;
    }
    applyPersonelFromLookup(found);
    showStatus('success', `${found.ad} ${found.soyad} bulundu (${found.firmaAdi || CANONICAL_ANA_FIRMA_ADI}).`);
  };

  const openPlacementModalForRoom = (room: KampOdasi) => {
    prefillPlacementFromRoom(room);
    resetPlacementPersonFields();
    setPlacementModalRoom(room);
  };

  const closePlacementModal = () => {
    setPlacementModalRoom(null);
  };

  const handlePlacementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeRoomId = placementModalRoom?.id || selectedRoomId;
    if (!activeRoomId) {
      showStatus('error', 'Lütfen yerleşim yapılacak odayı seçin!');
      return;
    }
    if (!placementModalRoom && (!placementYerleskeId || !placementKatId || !selectedRoomId)) {
      showStatus('error', 'Lütfen sırayla yerleşke, kat ve oda seçin!');
      return;
    }

    let personelIsim = '';
    let personelId: string | undefined = undefined;
    let matchedPersonel: Personel | undefined = undefined;

    if (placementType === 'DB') {
      if (!selectedPersonelId) {
        showStatus('error', 'Lütfen veritabanından bir personel seçin!');
        return;
      }
      const matched = personeller.find(p => p.id === selectedPersonelId);
      if (matched) {
        personelIsim = `${matched.ad} ${matched.soyad}`;
        personelId = matched.id;
        matchedPersonel = matched;
      }
    } else {
      if (!manualPersonelIsim.trim()) {
        showStatus('error', 'Lütfen personel adını soyadını yazın!');
        return;
      }
      const isManualTaseronPair =
        placementFirmaTipi === 'TASERON' && firmaType === 'MANUAL';
      if (isManualTaseronPair) {
        personelIsim = sanitizeManualName(manualPersonelIsim);
      } else {
        const found = findDbPersonelByRawName(manualPersonelIsim);
        if (found) {
          personelIsim = `${found.ad} ${found.soyad}`;
          personelId = found.id;
          matchedPersonel = found;
        } else {
          personelIsim = sanitizeManualName(manualPersonelIsim);
        }
      }
    }

    let resolvedFirma = '';
    if (placementFirmaTipi === 'ANA_FIRMA') {
      resolvedFirma = matchedPersonel
        ? canonicalizeAnaFirmaAdi(matchedPersonel.firmaAdi)
        : CANONICAL_ANA_FIRMA_ADI;
    } else if (firmaType === 'DB') {
      resolvedFirma = selectedFirma || '';
    } else {
      resolvedFirma = manualFirma.trim();
    }

    const targetRoom = kampOdalari.find(r => r.id === activeRoomId);
    if (!targetRoom) {
      showStatus('error', 'Oda bulunamadı!');
      return;
    }

    if (placementFirmaTipi === 'TASERON' && !resolvedFirma) {
      showStatus('error', 'Taşeron personel için firma bilgisi zorunludur.');
      return;
    }

    if (placementType === 'MANUAL' && !matchedPersonel) {
      if (!validateTC(placementTcNo)) {
        showStatus('error', 'Yeni personel kaydı için geçerli 11 haneli TC zorunludur. Önce TC SORGU deneyin.');
        return;
      }
      if (phoneMatchKey(placementTelefonNo).length < 10) {
        showStatus('error', 'Yeni personel kaydı için geçerli telefon numarası zorunludur. Önce TEL NO SORGU deneyin.');
        return;
      }
    }

    setLoadingPlacement(true);
    try {
      let createdPersonel = false;
      let createdCari = false;

      if (placementFirmaTipi === 'TASERON' && resolvedFirma) {
        const cari = await ensureTaseronCari(resolvedFirma);
        if (cari) {
          createdCari = !cariKartlar.some((c) => c.id === cari.id);
          setCariKartlar?.((prev) => (prev.some((c) => c.id === cari.id) ? prev : [...prev, cari]));
        }
      }

      if (!matchedPersonel && placementType === 'MANUAL') {
        const resolved = await resolveOrCreateKampPersonel(
          personelIsim,
          resolvedFirma || (placementFirmaTipi === 'ANA_FIRMA' ? CANONICAL_ANA_FIRMA_ADI : 'Taşeron'),
          placementFirmaTipi,
          placementTcNo,
          placementTelefonNo
        );
        personelId = resolved.personel.id;
        personelIsim = `${resolved.personel.ad} ${resolved.personel.soyad}`;
        createdPersonel = resolved.created;
        setPersoneller?.((prev) =>
          prev.some((p) => p.id === resolved.personel.id)
            ? prev.map((p) => (p.id === resolved.personel.id ? resolved.personel : p))
            : [...prev, resolved.personel]
        );
        matchedPersonel = resolved.personel;
        if (resolved.merged) {
          showStatus(
            'info',
            `${personelIsim} sistemde vardı — mevcut kayda birleştirildi (yeni personel açılmadı).`
          );
        }
      } else if (matchedPersonel) {
        // Seçili personelin TC/tel boşsa kampçı girdikleriyle güncelle; firma seçimini yaz
        const nextTc = digitsOnly(placementTcNo) || digitsOnly(matchedPersonel.tcNo || '');
        const nextTel = placementTelefonNo.trim() || matchedPersonel.telefonNo || '';
        const nextFirmaTipi = placementFirmaTipi;
        const nextFirmaAdi =
          nextFirmaTipi === 'ANA_FIRMA'
            ? CANONICAL_ANA_FIRMA_ADI
            : resolvedFirma || matchedPersonel.firmaAdi || '';
        const needsUpdate =
          (nextTc && digitsOnly(matchedPersonel.tcNo || '') !== nextTc) ||
          (nextTel && phoneMatchKey(matchedPersonel.telefonNo || '') !== phoneMatchKey(nextTel)) ||
          matchedPersonel.firmaTipi !== nextFirmaTipi ||
          !firmaEslesir(matchedPersonel.firmaAdi || '', nextFirmaAdi);
        if (needsUpdate && nextFirmaAdi) {
          const wasKampGorev = /KAMP\s*PERSONEL/i.test(String(matchedPersonel.gorev || ''));
          const patched: Personel = {
            ...matchedPersonel,
            tcNo: nextTc || matchedPersonel.tcNo,
            telefonNo: nextTel || matchedPersonel.telefonNo,
            firmaTipi: nextFirmaTipi,
            firmaAdi: nextFirmaAdi,
            departman:
              nextFirmaTipi === 'TASERON'
                ? 'TAŞERON'
                : matchedPersonel.departman || 'SAHA',
            gorev:
              nextFirmaTipi === 'TASERON' && wasKampGorev
                ? 'TAŞERON PERSONEL'
                : matchedPersonel.gorev,
            onayDurumu:
              nextFirmaTipi === 'TASERON'
                ? 'ONAYLANDI'
                : matchedPersonel.onayDurumu,
          };
          await saveDocument('personeller', patched);
          setPersoneller?.((prev) => prev.map((p) => (p.id === patched.id ? patched : p)));
          matchedPersonel = patched;
        }
      }

      const finalFirmaTipi: 'ANA_FIRMA' | 'TASERON' = placementFirmaTipi;

      await assignKampResident({
        roomId: activeRoomId,
        personelIsim,
        personelId,
        calistigiFirma: resolvedFirma || undefined,
        firmaTipi: finalFirmaTipi,
        kampOdalari,
        kampKayitlari,
      });

      if (addNotification) {
        addNotification(`${personelIsim} (${resolvedFirma}) ${targetRoom.odaNo} nolu odaya yerleştirildi.`);
      }

      setSelectedPersonelId('');
      setManualPersonelIsim('');
      setPlacementTcNo('');
      setPlacementTelefonNo('');
      setSelectedFirma('');
      setManualFirma('');
      setPlacementModalRoom(null);
      const dbNote =
        createdPersonel || createdCari
          ? ` (${[
              createdCari ? 'taşeron firma DB' : '',
              createdPersonel ? 'personel DB' : '',
            ]
              .filter(Boolean)
              .join(' + ')})`
          : '';
      showStatus('success', `${personelIsim} başarıyla ${targetRoom.odaNo} no'lu odaya yerleştirildi.${dbNote}`);
    } catch (err) {
      console.error(err);
      showStatus('error', err instanceof Error ? err.message : 'Yerleşim yapılırken hata oluştu!');
    } finally {
      setLoadingPlacement(false);
    }
  };

  const sendCikisTalebiForKampTahliye = async (reg: KampKaydi, odaNo?: string) => {
    // Ana firma personeli kamp tahliyesinde ASLA işten çıkarılmaz / çıkış talebi gitmez
    if (isAnaFirmaKampKaydi(reg)) {
      throw new Error('ANA_FIRMA_ISTEN_CIKIS_YASAK');
    }
    const p = personeller.find((x) => x.id === reg.personelId);
    if (p && !isTaseronPersonel(p)) {
      throw new Error('ANA_FIRMA_ISTEN_CIKIS_YASAK');
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    await submitPersonelCikisTalebi({
      personelId: reg.personelId || p?.id,
      personelIsim: reg.personelIsim || `${p?.ad || ''} ${p?.soyad || ''}`.trim(),
      personelGorev: p?.gorev || '',
      personelMaas: p?.netMaas ?? p?.maas ?? 0,
      cikisTarihi: todayStr,
      cikisNedeni: `Kamp tahliyesi${odaNo ? ` · Oda ${odaNo}` : ''} — taşeron personel; kampçı tarafından odadan çıkarıldı; işten çıkış onayı bekleniyor.`,
      gonderen: currentUser?.email || 'kampci',
      kaynak: 'KAMPCI_TAHLIYE',
      hedefYoneticiRole: 'YÖNETİCİ',
    });
  };

  const handleCheckOut = async (reg: KampKaydi) => {
    if (
      !window.confirm(
        `${reg.personelIsim} odadan çıkarılsın mı?\n\nKamp çıkışı (tahliye) yapılacak.`
      )
    ) {
      return;
    }

    const anaFirma = isAnaFirmaKampKaydi(reg);
    // Ana firma: sadece odadan çıkar; işten çıkış sorulmaz / gönderilmez
    let sendIstenCikis = false;
    if (!anaFirma) {
      sendIstenCikis = window.confirm(
        `${reg.personelIsim} (taşeron) için işten çıkış talebi yönetime gönderilsin mi?\n\nEvet: işten çıkış onay havuzuna düşer.\nHayır: sadece kamp odasından çıkarılır.\n\nNot: Ana firma personelinde işten çıkış kamp tahliyesiyle yapılmaz.`
      );
    }

    try {
      const targetRoom = kampOdalari.find(r => r.id === reg.odaId || r.id === reg.roomId);
      await evictKampResident(reg, kampOdalari, kampKayitlari);
      if (sendIstenCikis) {
        try {
          await sendCikisTalebiForKampTahliye(reg, targetRoom?.odaNo);
        } catch (talebiErr) {
          if (String(talebiErr).includes('ANA_FIRMA_ISTEN_CIKIS_YASAK')) {
            showStatus(
              'info',
              `${reg.personelIsim} odadan çıktı. Ana firma personeli için işten çıkış yapılmadı.`
            );
          } else {
            console.warn('İşten çıkış talebi gönderilemedi:', talebiErr);
            showStatus(
              'error',
              `${reg.personelIsim} odadan çıktı ancak işten çıkış talebi gönderilemedi — Onay Havuzu'nu kontrol edin.`
            );
            return;
          }
        }
      }
      if (addNotification) {
        const roomNo = targetRoom ? targetRoom.odaNo : 'oda';
        addNotification(
          sendIstenCikis
            ? `${reg.personelIsim} ${roomNo} nolu odadan çıkış yaptı · işten çıkış talebi yönetime gönderildi.`
            : anaFirma
              ? `${reg.personelIsim} ${roomNo} nolu odadan çıkış yaptı (ana firma — işten çıkış yok).`
              : `${reg.personelIsim} ${roomNo} nolu odadan çıkış yaptı (işten çıkış talebi gönderilmedi).`
        );
      }
      showStatus(
        'success',
        sendIstenCikis
          ? `${reg.personelIsim} odadan çıkarıldı; işten çıkış talebi yönetime iletildi.`
          : anaFirma
            ? `${reg.personelIsim} odadan çıkarıldı. Ana firma personeli işten çıkarılmaz.`
            : `${reg.personelIsim} odadan çıkarıldı (işten çıkış talebi gönderilmedi).`
      );
    } catch (err) {
      console.error(err);
      showStatus('error', 'Check-out işlemi başarısız!');
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

    if (
      !window.confirm(
        `${targetRoom.odaNo} numaralı odadaki TÜM personeller (${occupants.length} kişi) tahliye edilsin mi?\n\nKamp çıkışı yapılacak.\nAna firma personeli işten çıkarılmaz.`
      )
    ) {
      return;
    }

    const taseronOccupants = occupants.filter((r) => !isAnaFirmaKampKaydi(r));
    let sendIstenCikis = false;
    if (taseronOccupants.length > 0) {
      sendIstenCikis = window.confirm(
        `Tahliyede ${taseronOccupants.length} taşeron personel var.\n\nBunlar için işten çıkış talebi yönetime gönderilsin mi?\n\nAna firma personeli (${occupants.length - taseronOccupants.length} kişi) için işten çıkış ASLA yapılmaz.`
      );
    }

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      let cikisTalebiSayisi = 0;
      for (const reg of occupants) {
        const updatedReg: KampKaydi = {
          ...reg,
          durum: 'PASIF',
          cikisTarihi: todayStr
        };
        await saveDocument('kampKayitlari', updatedReg);
        if (sendIstenCikis && !isAnaFirmaKampKaydi(reg)) {
          try {
            await sendCikisTalebiForKampTahliye(reg, targetRoom.odaNo);
            cikisTalebiSayisi += 1;
          } catch (talebiErr) {
            console.warn('İşten çıkış talebi atlandı:', reg.personelIsim, talebiErr);
          }
        }
      }
      if (addNotification) {
        addNotification(
          `${targetRoom.odaNo} nolu oda tahliye edildi (${occupants.length} kişi)${
            cikisTalebiSayisi > 0 ? ` · ${cikisTalebiSayisi} taşeron işten çıkış talebi` : ''
          }.`
        );
      }

      const updatedRoom: KampOdasi = {
        ...targetRoom,
        durum: 'BOŞ'
      };
      await saveDocument('kampOdalari', updatedRoom);

      showStatus(
        'success',
        `${targetRoom.odaNo} tahliye edildi. Ana firma işten çıkış yok${
          cikisTalebiSayisi > 0 ? ` · ${cikisTalebiSayisi} taşeron çıkış talebi gönderildi` : ''
        }.`
      );
    } catch (err) {
      console.error(err);
      showStatus('error', 'Oda tahliye edilirken hata oluştu.');
    }
  };

  const handleSelectRoomForPlacement = (roomId: string) => {
    const room = kampOdalari.find((r) => r.id === roomId);
    if (!room) return;
    openPlacementModalForRoom(room);
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
        kaydeden: currentUser?.email || 'kampci_amiri',
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
  const syncKampMesaiFromFaaliyet = async (
    tarih: string,
    mesaiMap: Record<string, number> | undefined
  ) => {
    const hasNew = mesaiMap && Object.values(mesaiMap).some((h) => Number(h) > 0);
    if (!hasNew) return;

    let next = { ...yoklamalar };
    const gonderen = currentUser?.email || 'KAMP_MOBIL';
    next = applySahaMesaiToYoklama(next, tarih, mesaiMap, gonderen, 'add');
    
    if (saveYoklamalarNow) {
      await saveYoklamalarNow(next);
    } else if (setYoklamalar) {
      setYoklamalar(next);
    }
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faaliyetAciklama.trim()) {
      showStatus('error', 'Lütfen faaliyet açıklamasını doldurun!');
      return;
    }
    
    if (faaliyetGrubu === 'MESAI') {
      const hasMesai = Object.values(personelMesaiSaatleri).some(h => Number(h) > 0);
      if (!hasMesai) {
        showStatus('error', 'Mesai Faaliyeti için en az bir personele mesai saati girmelisiniz!');
        return;
      }
    }

    setLoadingFaaliyet(true);
    try {
      const actId = `act_${Date.now()}`;
      const bugunTarih = new Date().toISOString().slice(0, 10);

      let aktifPersonelListesi: string[] = [];
      if (faaliyetGrubu === 'MESAI') {
        aktifPersonelListesi = Object.entries(personelMesaiSaatleri)
          .filter(([, hrs]) => Number(hrs) > 0)
          .map(([pid]) => pid);
      } else {
        // NORMAL: yalnızca yoklamada Geldi olan kampçılar (düz işçi / usta / formen / yerleşim yok)
        aktifPersonelListesi = resolveGeldiRolPersonelIds(
          personeller,
          yoklamalar,
          bugunTarih,
          'KAMPCI',
          { ensureEmail: currentUser?.email }
        );
      }

      const persistedFoto = faaliyetFoto
        ? await ensureKampFaaliyetFotoPersisted(actId, faaliyetFoto)
        : null;

      const actData = {
        id: actId,
        tarih: bugunTarih,
        kaydedenKampci: currentUser?.email || 'kamp_sorumlusu',
        faaliyetTipi,
        faaliyetGrubu,
        personelMesaiSaatleri: faaliyetGrubu === 'MESAI' ? personelMesaiSaatleri : undefined,
        aktifPersonelListesi,
        personelId: aktifPersonelListesi[0],
        yerleskeAdi: faaliyetYerleske,
        aciklama: faaliyetAciklama.trim(),
        fotoUrl: persistedFoto || null,
        durum: 'ONAY BEKLİYOR',
        onaylayanIdariIsler: null,
        onaylayanMuhasebe: null
      };

      await saveDocument('kampGunlukFaaliyetleri', actData);
      
      if (faaliyetGrubu === 'MESAI') {
        await syncKampMesaiFromFaaliyet(bugunTarih, personelMesaiSaatleri);
      }

      if (addNotification) {
        addNotification(
          `Kamp günlük faaliyet (${faaliyetTipi}) kaydedildi · ${aktifPersonelListesi.length} personel bağlandı.`
        );
      }

      // Reset
      setFaaliyetAciklama('');
      setFaaliyetFoto(null);
      setPersonelMesaiSaatleri({});
      showStatus(
        'success',
        `Günlük faaliyet kaydedildi (${aktifPersonelListesi.length} personel). Onay havuzuna iletildi.`
      );
    } catch (err) {
      console.error(err);
      showStatus('error', 'Günlük faaliyet kaydedilirken hata oluştu.');
    } finally {
      setLoadingFaaliyet(false);
    }
  };

  const handleSubmitKampGirisTalebi = async () => {
    if (!yeniAd.trim() || !yeniSoyad.trim() || !yeniGorev.trim()) {
      showStatus('error', 'Ad, soyad ve görev alanlarını doldurunuz.');
      return;
    }
    if (!validateTC(yeniTcNo)) {
      showStatus('error', 'Geçerli 11 haneli TC zorunludur. Önce TC SORGU deneyin.');
      return;
    }
    if (phoneMatchKey(yeniTelefonNo).length < 10) {
      showStatus('error', 'Geçerli telefon numarası zorunludur. Önce TEL NO SORGU deneyin.');
      return;
    }
    if (!yeniKimlikFoto) {
      showStatus('error', 'Kimlik fotoğrafı zorunludur.');
      return;
    }
    const firmaTipi = girisFirmaTipi;
    const firmaAdi =
      firmaTipi === 'ANA_FIRMA'
        ? CANONICAL_ANA_FIRMA_ADI
        : (girisFirmaType === 'DB' ? girisSelectedFirma : girisManualFirma).trim();
    if (firmaTipi === 'TASERON' && !firmaAdi) {
      showStatus('error', 'Taşeron personel için firma seçin veya yazın.');
      return;
    }
    try {
      const requestID = `GIRIS-KAMP-${Date.now()}`;
      const email = currentUser?.email || 'kampci';
      let createdPersonelNote = '';

      // İsim + TC / TC / tel / isim eşleşirse mevcut kaydı kullan; fazladan personel açma
      const fullName = `${yeniAd.trim()} ${yeniSoyad.trim()}`;
      const resolved = await resolveOrCreateKampPersonel(
        fullName,
        firmaAdi,
        firmaTipi,
        yeniTcNo,
        yeniTelefonNo
      );
      if (firmaTipi === 'TASERON' && firmaAdi) {
        await ensureTaseronCari(firmaAdi);
      }
      if (resolved.created) {
        const created = resolved.personel;
        // görev güncelle
        if (created.gorev !== yeniGorev.trim()) {
          const patched = { ...created, gorev: yeniGorev.trim(), ad: yeniAd.trim().toLocaleUpperCase('tr-TR'), soyad: yeniSoyad.trim().toLocaleUpperCase('tr-TR') };
          await saveDocument('personeller', patched);
          setPersoneller?.((prev) =>
            prev.some((p) => p.id === patched.id)
              ? prev.map((p) => (p.id === patched.id ? patched : p))
              : [...prev, patched]
          );
        } else {
          setPersoneller?.((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
        }
        createdPersonelNote = ' · personel kaydı oluşturuldu';
      } else {
        const patched: Personel = {
          ...resolved.personel,
          ad: yeniAd.trim().toLocaleUpperCase('tr-TR') || resolved.personel.ad,
          soyad: yeniSoyad.trim().toLocaleUpperCase('tr-TR') || resolved.personel.soyad,
          telefonNo: yeniTelefonNo.trim() || resolved.personel.telefonNo,
          firmaTipi,
          firmaAdi,
          gorev: yeniGorev.trim() || resolved.personel.gorev,
          departman: firmaTipi === 'TASERON' ? 'TAŞERON' : resolved.personel.departman || 'SAHA',
          onayDurumu: firmaTipi === 'TASERON' ? 'ONAYLANDI' : resolved.personel.onayDurumu,
        };
        await saveDocument('personeller', patched);
        setPersoneller?.((prev) =>
          prev.some((p) => p.id === patched.id)
            ? prev.map((p) => (p.id === patched.id ? patched : p))
            : [...prev, patched]
        );
        createdPersonelNote = ' · mevcut personel birleştirildi / güncellendi';
      }

      await setDoc(doc(db, 'personelGirisTalepleri', requestID), {
        ad: yeniAd.trim(),
        soyad: yeniSoyad.trim(),
        gorev: yeniGorev.trim(),
        tcNo: digitsOnly(yeniTcNo),
        telefonNo: yeniTelefonNo.trim(),
        firmaTipi,
        firmaAdi,
        kimlikFotoUrl: yeniKimlikFoto,
        durum: 'BEKLEMEDE',
        tarih: new Date().toISOString(),
        gonderenFormen: email,
        gonderenKampci: email,
        kaynakPanel: 'KAMPÇI',
      });
      setSonGirisTalebi({ id: requestID, ad: yeniAd.trim(), soyad: yeniSoyad.trim(), gorev: yeniGorev.trim() });
      setYeniAd('');
      setYeniSoyad('');
      setYeniGorev('');
      setYeniTcNo('');
      setYeniTelefonNo('');
      setGirisSelectedFirma('');
      setGirisManualFirma('');
      setGirisFirmaTipi('ANA_FIRMA');
      setYeniKimlikFoto(null);
      showStatus('success', `Giriş talebi oluşturuldu${createdPersonelNote} — yönetim onay havuzuna iletildi.`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Giriş talebi kaydedilemedi.');
    }
  };

  const handleSendKampGunlukAkis = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const email = currentUser?.email?.trim().toLowerCase() || 'kampci';
    if (!window.confirm(`${today} kamp günlük akış raporunu yönetime göndermek istiyor musunuz?`)) return;
    setSendingKampAkis(true);
    try {
      const ozetMetin = buildKampciGunlukOzet({
        tarih: today,
        email,
        yerlesimCount: kampKayitlari.filter((k) => k.girisTarihi?.startsWith(today)).length,
        sayimCount: depoSavimlari.filter((s) => s.tarih === today).length,
        faaliyetCount: gunlukFaaliyetler.filter((f) => f.tarih === today).length,
      });
      await saveDocument('mobilGunlukAkisRaporlari', {
        id: `kamp_akis_${today}_${email.replace(/[@.]/g, '-')}`,
        tip: 'KAMPÇI',
        tarih: today,
        gonderenEmail: email,
        ozetMetin,
        kampIslemSayisi:
          kampKayitlari.filter((k) => k.girisTarihi?.startsWith(today)).length +
          depoSavimlari.filter((s) => s.tarih === today).length +
          gunlukFaaliyetler.filter((f) => f.tarih === today).length,
        durum: 'ONAY BEKLİYOR',
        olusturulma: new Date().toISOString(),
      });
      showStatus('success', 'Kamp günlük akış raporu yönetim onayına gönderildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Rapor gönderilemedi.');
    } finally {
      setSendingKampAkis(false);
    }
  };

  // Filtered personnel list for DB selection — seçili firmaya göre
  const resolvedPlacementFirmaAdi = useMemo(() => {
    if (placementFirmaTipi === 'ANA_FIRMA') return CANONICAL_ANA_FIRMA_ADI;
    return (firmaType === 'DB' ? selectedFirma : manualFirma).trim();
  }, [placementFirmaTipi, firmaType, selectedFirma, manualFirma]);

  const filteredPersonel = personeller.filter(p => {
    const statusLower = String(p.durum || '').toLowerCase();
    const isPasif = statusLower === 'pasif' || p.durum === false || statusLower === 'false';
    if (isPasif) return false;

    if (placementFirmaTipi === 'ANA_FIRMA') {
      if (isTaseronPersonel(p)) return false;
    } else {
      if (!isTaseronPersonel(p) && p.firmaTipi !== 'TASERON') return false;
      if (resolvedPlacementFirmaAdi && !firmaEslesir(p.firmaAdi || '', resolvedPlacementFirmaAdi)) {
        return false;
      }
    }

    const nameStr = `${p.ad || ''} ${p.soyad || ''}`.toLowerCase();
    const queryStr = searchPersonelQuery.toLowerCase();
    if (!queryStr) return true;
    return (
      nameStr.includes(queryStr) ||
      (p.gorev || '').toLowerCase().includes(queryStr) ||
      (p.tcNo || '').toLowerCase().includes(queryStr) ||
      digitsOnly(p.telefonNo || '').includes(digitsOnly(queryStr)) ||
      (p.firmaAdi || '').toLowerCase().includes(queryStr)
    );
  });

  const mesaiPersonelListesi = useMemo(() => {
    const base = personeller.filter(
      (p) =>
        isTaseronPersonel(p) ||
        kampKayitlari.some((k) => k.personelId === p.id && k.durum === 'AKTIF')
    );
    const q = mesaiPersonelSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => {
      const name = `${p.ad || ''} ${p.soyad || ''}`.toLowerCase();
      return (
        name.includes(q) ||
        (p.gorev || '').toLowerCase().includes(q) ||
        (p.tcNo || '').includes(q) ||
        (p.firmaAdi || '').toLowerCase().includes(q)
      );
    });
  }, [personeller, kampKayitlari, mesaiPersonelSearch]);

  const filteredRoomsWithOccupants = useMemo(() => {
    const q = searchRoomQuery.trim().toLowerCase();
    return kampOdalari.filter((room) => {
      if (!q) return true;
      const roomHit =
        (room.yerleskeAdi || '').toLowerCase().includes(q) ||
        (room.kogusNo || '').toLowerCase().includes(q) ||
        (room.odaNo || '').toLowerCase().includes(q);
      if (roomHit) return true;
      return kampKayitlari.some(
        (k) =>
          (k.odaId === room.id || k.roomId === room.id) &&
          k.durum === 'AKTIF' &&
          (k.personelIsim || '').toLowerCase().includes(q)
      );
    });
  }, [kampOdalari, kampKayitlari, searchRoomQuery]);

  const renderPlacementPersonForm = () => (
    <>
      <div className="space-y-1.5">
        <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Giriş Türü</label>
        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setPlacementType('DB')}
            className={`py-1.5 rounded-lg text-[10px] font-bold text-center transition ${
              placementType === 'DB' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Kayıtlı Personel
          </button>
          <button
            type="button"
            onClick={() => setPlacementType('MANUAL')}
            className={`py-1.5 rounded-lg text-[10px] font-bold text-center transition ${
              placementType === 'MANUAL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Yeni Personel Kaydı
          </button>
        </div>
      </div>

      <div className="border-t border-slate-850 pt-3 space-y-3">
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest block">ADIM 1: Firma Bilgisi</span>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setPlacementFirmaTipi('ANA_FIRMA');
              setSelectedPersonelId('');
              setSelectedFirma('');
              setManualFirma('');
            }}
            className={`py-1.5 rounded-lg text-[10px] font-bold ${placementFirmaTipi === 'ANA_FIRMA' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Ana Firma
          </button>
          <button
            type="button"
            onClick={() => {
              setPlacementFirmaTipi('TASERON');
              setSelectedPersonelId('');
            }}
            className={`py-1.5 rounded-lg text-[10px] font-bold ${placementFirmaTipi === 'TASERON' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Taşeron
          </button>
        </div>

        {placementFirmaTipi === 'ANA_FIRMA' ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700">
            {CANONICAL_ANA_FIRMA_ADI}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200/60">
              <button
                type="button"
                onClick={() => setFirmaType('DB')}
                className={`py-1 rounded-md text-[9px] font-bold text-center transition ${
                  firmaType === 'DB' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Kayıtlı Firmalar
              </button>
              <button
                type="button"
                onClick={() => setFirmaType('MANUAL')}
                className={`py-1 rounded-md text-[9px] font-bold text-center transition ${
                  firmaType === 'MANUAL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'
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
                  onChange={(e) => {
                    setSelectedFirma(e.target.value);
                    setSelectedPersonelId('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
                >
                  <option value="">-- Taşeron / Firma Seçin --</option>
                  {taseronCariler.map((c) => (
                    <option key={c.id} value={c.unvan}>{c.unvan}</option>
                  ))}
                  {cariKartlar.filter((c) => c.kartTipi !== 'TASERON' && c.durum === 'AKTIF').map((c) => (
                    <option key={c.id} value={c.unvan}>{c.unvan}</option>
                  ))}
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
                  onChange={(e) => {
                    setManualFirma(e.target.value);
                    setSelectedPersonelId('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl outline-none"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-slate-850 pt-3 space-y-3">
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest block">ADIM 2: TC / Tel Sorgu</span>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={11}
              placeholder="TC Kimlik No"
              value={placementTcNo}
              onChange={(e) => setPlacementTcNo(e.target.value.replace(/\D/g, '').slice(0, 11))}
              className="flex-1 bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-xl outline-none"
            />
            <button
              type="button"
              onClick={runPlacementTcSorgu}
              className="shrink-0 px-3 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-[10px] font-black tracking-wide"
            >
              TC SORGU
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="Telefon No"
              value={placementTelefonNo}
              onChange={(e) => setPlacementTelefonNo(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-xl outline-none"
            />
            <button
              type="button"
              onClick={runPlacementTelSorgu}
              className="shrink-0 px-3 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-black tracking-wide"
            >
              TEL NO SORGU
            </button>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">
            Kayıtlı personel varsa sorgu ile bulunur ve firması otomatik seçilir. Yoksa yeni kayıt için ad soyad + TC + telefon girin; personel seçili firmaya kaydedilir.
          </p>
        </div>
      </div>

      <div className="border-t border-slate-850 pt-3 space-y-3">
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest block">ADIM 3: Personel Bilgisi</span>

        {placementType === 'DB' ? (
          <div className="space-y-3 animate-in fade-in duration-100">
            <div className="space-y-1.5">
              <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">
                {placementFirmaTipi === 'ANA_FIRMA'
                  ? `${CANONICAL_ANA_FIRMA_ADI} Personelleri`
                  : resolvedPlacementFirmaAdi
                    ? `${resolvedPlacementFirmaAdi} Personelleri`
                    : 'Önce taşeron firma seçin'}
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ad, TC, telefon veya görev ara..."
                  value={searchPersonelQuery}
                  onChange={(e) => setSearchPersonelQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 pl-9 pr-3 py-2.5 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Firmaya Ait Personel Listesi ({filteredPersonel.length}) *
              </label>
              <select
                required={placementType === 'DB'}
                value={selectedPersonelId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSelectedPersonelId(pid);
                  const matched = personeller.find((p) => p.id === pid);
                  if (matched) {
                    setPlacementTcNo(digitsOnly(matched.tcNo || ''));
                    setPlacementTelefonNo(String(matched.telefonNo || '').trim());
                    applyPersonelFirmaMatch(matched);
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
              >
                <option value="">-- Personel Seçin --</option>
                {filteredPersonel.slice(0, 50).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ad} {p.soyad} ({p.gorev || '-'}){p.firmaAdi ? ` · ${p.firmaAdi}` : ''}
                  </option>
                ))}
              </select>
              {filteredPersonel.length > 50 && (
                <span className="text-[9px] text-slate-500 italic block mt-1">+ {filteredPersonel.length - 50} personel daha — arama ile daraltın.</span>
              )}
              {placementFirmaTipi === 'TASERON' && !resolvedPlacementFirmaAdi && (
                <span className="text-[9px] text-amber-600 font-bold block mt-1">Firma seçilmeden tüm taşeron personeller listelenir.</span>
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
              className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl outline-none"
            />
            <p className="text-[9px] text-slate-500">
              Bu kişi seçili firmaya ({resolvedPlacementFirmaAdi || '—'}) personel olarak kaydedilir.
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loadingPlacement}
        className="w-full bg-slate-900 hover:bg-slate-900 disabled:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-slate-500/10"
      >
        {loadingPlacement ? <RefreshCw size={13} className="animate-spin" /> : <UserPlus size={14} />}
        <span>Odaya Yerleştir ve Kaydet</span>
      </button>
    </>
  );

  const content = (
    <>
      
      {/* ⛺ Header Block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-slate-900/10 rounded-lg text-slate-600">
              <Tent size={20} />
            </span>
            <span className="text-[10px] font-bold text-slate-600 tracking-wider uppercase">Lojman &amp; Kamp İşlemleri</span>
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
        <div className={`p-4 rounded-xl border flex items-center space-x-3 shadow-lg max-w-xl ${
          statusMessage.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
            : statusMessage.type === 'info'
              ? 'bg-slate-500/10 border-slate-800/30 text-slate-800'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600'
        }`}>
          {statusMessage.type === 'info' ? (
            <RefreshCw size={16} className="animate-spin shrink-0" />
          ) : (
            <CheckCircle size={16} className="shrink-0" />
          )}
          <span className="text-xs font-bold">{statusMessage.text}</span>
        </div>
      )}

      {vidanjorAlert && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-start gap-2 max-w-2xl shadow-sm">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Vidanjör Giriş Uyarısı</p>
            <p className="text-xs text-amber-900 mt-0.5">{vidanjorAlert}</p>
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('vidanjor');
                setVidanjorAlert(null);
              }}
              className="mt-2 text-[10px] font-black uppercase tracking-wide text-indigo-700 hover:underline cursor-pointer"
            >
              Vidanjör fiş sekmesine git →
            </button>
          </div>
          <button
            type="button"
            onClick={() => setVidanjorAlert(null)}
            className="text-amber-700 cursor-pointer"
            aria-label="Uyarıyı kapat"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 🧭 Panel Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveSubTab('placement')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'placement' 
              ? 'bg-slate-900 border-slate-800 text-white shadow-md shadow-slate-500/10' 
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <UserPlus size={14} />
          <span>👤 Kampa Personel Yerleşim</span>
        </button>

        <button
          onClick={() => setActiveSubTab('personel_giris')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'personel_giris'
              ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-500/20'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <DoorOpen size={14} />
          <span>🚪 Girişe Yolla</span>
        </button>

        <button
          onClick={() => setActiveSubTab('taseron_sayim')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'taseron_sayim'
              ? 'bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-500/20'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ClipboardList size={14} />
          <span>📋 Taşeron Sayım</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rooms')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'rooms' 
              ? 'bg-slate-900 border-slate-800 text-white shadow-md shadow-slate-500/10' 
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
              ? 'bg-slate-900 border-slate-800 text-white shadow-md shadow-slate-500/10' 
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
              ? 'bg-slate-900 border-slate-800 text-white shadow-md shadow-slate-500/10' 
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ClipboardList size={14} />
          <span>🧹 Günlük Faaliyetler</span>
        </button>

        <button
          onClick={() => setActiveSubTab('yoklama')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'yoklama'
              ? 'bg-slate-900 border-slate-800 text-white shadow-md shadow-slate-500/10'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ClipboardList size={14} />
          <span>📝 Günlük Yoklama</span>
        </button>

        <button
          onClick={() => setActiveSubTab('aylik_puantaj')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'aylik_puantaj'
              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Calendar size={14} />
          <span>📊 Aylık Puantaj</span>
        </button>

        <button
          onClick={() => setActiveSubTab('haftalik_yoklama')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'haftalik_yoklama'
              ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-500/20'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Calendar size={14} />
          <span>📅 Haftalık Yoklama</span>
        </button>

        <button
          onClick={() => setActiveSubTab('vidanjor')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'vidanjor'
              ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Truck size={14} />
          <span>🚛 Vidanjör</span>
        </button>

        <button
          onClick={() => setActiveSubTab('gunluk_akis')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 border cursor-pointer ${
            activeSubTab === 'gunluk_akis'
              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Sparkles size={14} />
          <span>📋 Günlük Akış</span>
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
              <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Lojmana Personel Yerleştir</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">🔑 Check-In Giriş İşlemi</h3>
            </div>

            {kampKayitlari.filter((k) => k.durum === 'AKTIF').length === 0 &&
              kampKayitlari.some((k) => k.durum === 'PASIF') && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2">
                <p className="text-[10px] font-bold text-amber-950 leading-snug">
                  Aktif yerleşim görünmüyor. Kayıtlar silinmedi; PASIF’e alınmış olabilir.
                </p>
                <button
                  type="button"
                  onClick={() => void handleRestoreYerlesim()}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-lg cursor-pointer"
                >
                  Yerleşimleri geri yükle
                </button>
              </div>
            )}

            <form onSubmit={handlePlacementSubmit} className="space-y-4">
              {/* Target Room Selection — yerleşke → kat → oda */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Yerleşim Yapılacak Oda *</label>
                <div className="grid grid-cols-1 gap-1.5">
                  <select
                    value={placementYerleskeId}
                    onChange={(e) => {
                      setPlacementYerleskeId(e.target.value);
                      setPlacementKatId('');
                      setSelectedRoomId('');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 rounded-lg px-2.5 py-2 outline-none"
                  >
                    <option value="">1. Yerleşke seçin</option>
                    {placementYerleskeOptions.map(y => (
                      <option key={y.id} value={y.id}>{y.ad}</option>
                    ))}
                  </select>
                  <select
                    value={placementKatId}
                    disabled={!placementYerleskeId}
                    onChange={(e) => {
                      setPlacementKatId(e.target.value);
                      setSelectedRoomId('');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 rounded-lg px-2.5 py-2 outline-none disabled:opacity-50"
                  >
                    <option value="">2. Kat seçin</option>
                    {placementKatOptions.map(k => (
                      <option key={k.id} value={k.id}>{k.ad}</option>
                    ))}
                  </select>
                  <select
                    required
                    value={selectedRoomId}
                    disabled={!placementKatId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 rounded-lg px-2.5 py-2 outline-none disabled:opacity-50"
                  >
                    <option value="">3. Oda seçin</option>
                    {placementOdaOptions.map(r => {
                      const currentCount = kampKayitlari.filter(k => (k.odaId === r.id || k.roomId === r.id) && k.durum === 'AKTIF').length;
                      return (
                        <option key={r.id} value={r.id}>
                          Oda {r.odaNo} ({currentCount}/{r.kapasite} yatak)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {renderPlacementPersonForm()}
            </form>
          </div>

          {/* Rooms and Occupants Directory (Right Panel - taking 2 cols) */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-200 pb-3 gap-2">
              <div>
                <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Mevcut Kamp Odaları &amp; Doluluk Durumu</span>
                <h3 className="font-bold text-sm text-slate-800 mt-0.5">🏡 Lojman Odaları Listesi</h3>
              </div>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Oda veya personel ara..."
                  value={searchRoomQuery}
                  onChange={(e) => setSearchRoomQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-[10px] text-slate-800 pl-7 pr-2.5 py-1.5 rounded-lg outline-none w-52"
                />
              </div>
              <button
                type="button"
                onClick={handleReloadKamp}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
              >
                <RefreshCw size={11} /> Yenile
              </button>
              <button
                type="button"
                onClick={() => void handleRestoreYerlesim()}
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                title="Yanlışlıkla PASIF’e alınan yerleşimleri odalara geri alır"
              >
                <DoorOpen size={11} /> Yerleşim Geri Yükle
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRoomsWithOccupants.map(room => {
                const q = searchRoomQuery.trim().toLowerCase();
                const occupants = kampKayitlari.filter(
                  k => (k.odaId === room.id || k.roomId === room.id) && k.durum === 'AKTIF'
                );
                const highlightedOccupants = q
                  ? occupants.filter((o) => (o.personelIsim || '').toLowerCase().includes(q))
                  : [];

                return (
                  <div key={room.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3">
                    <div className="space-y-2 flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-[10px] text-slate-500 block">{room.yerleskeAdi}</span>
                            <span className="font-black text-xs text-slate-800 block mt-0.5">{room.kogusNo} / Oda {room.odaNo}</span>
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
                              {occupants.map(occ => {
                                const nameHit =
                                  q.length > 0 &&
                                  (occ.personelIsim || '').toLowerCase().includes(q);
                                return (
                                <div
                                  key={occ.id}
                                  className={`flex justify-between items-center p-1.5 rounded-lg border ${
                                    nameHit
                                      ? 'bg-amber-50 border-amber-300'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${nameHit ? 'bg-amber-500' : 'bg-slate-500'}`}></div>
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
                              );
                              })}
                              {highlightedOccupants.length > 0 && (
                                <p className="text-[8px] font-bold text-amber-700 pt-0.5">
                                  {highlightedOccupants.length} eşleşen personel
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 🚀 QUICK ACTIONS FOR ROOMS */}
                      <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2 mt-auto">
                        <button
                          onClick={() => handleSelectRoomForPlacement(room.id)}
                          className="flex-grow bg-slate-900/15 hover:bg-slate-900 text-slate-600 hover:text-white border border-slate-800/20 hover:border-slate-800 rounded-lg py-1.5 text-[9px] font-black uppercase tracking-wider cursor-pointer transition text-center"
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
                        <button
                          onClick={() => handleUpdateRoom(room)}
                          className="bg-indigo-500/15 hover:bg-indigo-600 text-indigo-500 hover:text-white border border-indigo-500/20 hover:border-indigo-600 rounded-lg py-1.5 px-2.5 text-[9px] font-black uppercase tracking-wider cursor-pointer transition text-center"
                        >
                          Oda Güncelle
                        </button>
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
              <span className="font-extrabold text-[10px] text-slate-800 uppercase tracking-wider">Kamp Yapısı Kurulumu</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">Yerleşke → Kat → Oda</h3>
              <p className="text-[10px] text-slate-500 mt-1">Kamp Yönetimi ile senkron; sıfırdan kendi yapınızı kurun.</p>
            </div>

            <div className="flex gap-1 text-[9px] font-bold">
              {[1, 2, 3].map(step => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setSetupStep(step as 1 | 2 | 3)}
                  className={`flex-1 py-1.5 rounded-lg border ${setupStep === step ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                >
                  {step}. {step === 1 ? 'Yerleşke' : step === 2 ? 'Kat' : 'Oda'}
                </button>
              ))}
            </div>

            {setupStep === 1 && (
              <form onSubmit={handleCreateYerleske} className="space-y-3">
                {yerleskeler.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Mevcut Yerleşkeler</label>
                    <select
                      value={selectedYerleskeId}
                      onChange={(e) => { setSelectedYerleskeId(e.target.value); setSetupStep(2); }}
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 rounded-xl p-3"
                    >
                      {yerleskeler.map(y => (
                        <option key={y.id} value={y.id}>{y.ad}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Yeni Yerleşke Adı *</label>
                  <input
                    type="text"
                    value={newYerleskeAd}
                    onChange={(e) => setNewYerleskeAd(e.target.value)}
                    placeholder="Örn: Şantiye Merkez Kampı"
                    className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl"
                  />
                </div>
                    <button type="submit" disabled={loadingYapı} className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl cursor-pointer">
                      {loadingYapı ? 'Kaydediliyor...' : '1. Yerleşkeyi Oluştur ve Kaydet'}
                </button>
              </form>
            )}

            {setupStep === 2 && (
              <form onSubmit={handleCreateKat} className="space-y-3">
                {!selectedYerleske ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">Önce 1. adımda yerleşke oluşturun.</p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-700">Yerleşke: {selectedYerleske.ad}</p>
                    {yerleskeKatlari.length > 0 && (
                      <select
                        value={selectedKatId}
                        onChange={(e) => { setSelectedKatId(e.target.value); setSetupStep(3); }}
                        className="w-full bg-slate-50 border border-slate-200 text-xs p-3 rounded-xl text-slate-800"
                      >
                        {yerleskeKatlari.map(k => (
                          <option key={k.id} value={k.id}>{k.ad}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={newKatAd}
                      onChange={(e) => setNewKatAd(e.target.value)}
                      placeholder="Kat / blok adı (Örn: A Blok Zemin)"
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl"
                    />
                    <button type="submit" disabled={loadingYapı} className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl cursor-pointer">
                      {loadingYapı ? 'Kaydediliyor...' : '2. Kat Ekle ve Kaydet'}
                    </button>
                  </>
                )}
              </form>
            )}

            {setupStep === 3 && (
              <form onSubmit={handleCreateRoom} className="space-y-3">
                {!selectedYerleske || !selectedKat ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">Önce yerleşke ve kat tanımlayın.</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600">
                      <span className="font-bold">{selectedYerleske.ad}</span> / <span className="font-bold">{selectedKat.ad}</span>
                    </p>
                    <input
                      type="text"
                      required
                      placeholder="Oda no (Örn: 104)"
                      value={odaNo}
                      onChange={(e) => setOdaNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl"
                    />
                    <input
                      type="number"
                      required
                      min={1}
                      max={20}
                      value={kapasite}
                      onChange={(e) => setKapasite(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl"
                    />
                    <select
                      value={firmaTipi}
                      onChange={(e) => setFirmaTipi(e.target.value as 'ANA_FIRMA' | 'TASERON')}
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl"
                    >
                      <option value="ANA_FIRMA">Ana Firma</option>
                      <option value="TASERON">Taşeron</option>
                    </select>
                    <button type="submit" disabled={loadingRoom} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl cursor-pointer flex items-center justify-center gap-2">
                      {loadingRoom ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={14} />}
                      3. Odayı Aç & Kaydet
                    </button>
                  </>
                )}
              </form>
            )}
          </div>

          {/* Rooms Table List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
              <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Şantiye Kamp Altyapısı</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">📋 Tanımlı Odaların Listesi</h3>
              </div>
              <button
                type="button"
                onClick={handleReloadKamp}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
              >
                <RefreshCw size={11} /> Yenile
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {kampOdalari.map((r) => (
                <div key={r.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/60 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500">{r.yerleskeAdi} / {r.kogusNo}</p>
                  <p className="text-xs font-black text-slate-800">Oda: {r.odaNo}</p>
                  <p className="text-[10px] font-semibold text-slate-600">{r.kapasite} yatak</p>
                  <span className={`inline-block px-2 py-0.5 rounded font-bold border text-[10px] ${
                    r.firmaTipi === 'ANA_FIRMA' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-purple-50 border-purple-200 text-purple-700'
                  }`}>
                    {r.firmaTipi === 'ANA_FIRMA' ? 'Ana Firma' : 'Taşeron'}
                  </span>
                  <div className="pt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateRoom(r)}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Oda Güncelle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRoom(r.id, r.odaNo)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold px-2.5 rounded-lg transition cursor-pointer"
                      title="Sil"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
              {kampOdalari.length === 0 && (
                <div className="col-span-full text-center py-8 text-slate-500 italic border border-dashed rounded-xl bg-slate-50">
                  Kayıtlı kamp odası bulunmuyor.
                </div>
              )}
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
              <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Aylık / Haftalık Kamp Depo Sayımı</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">📦 Yeni Depo Sayımı Gir</h3>
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
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-xl outline-none h-16 resize-none"
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
              <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Kayıtlı Depo Sayım Arşivi</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">📋 Sayım Kayıtları ve Onay Durumları</h3>
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
                        <span className="text-xs font-bold text-slate-800 block mt-0.5">Sorumlu: {sayim.sayimYapan}</span>
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
              <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Günlük Rutin &amp; İş Bildirimi</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">🧹 Yeni Faaliyet Raporu</h3>
            </div>

            <form onSubmit={handleSaveActivity} className="space-y-4">
              {/* FAALİYET GRUBU TOGGLE */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFaaliyetGrubu('NORMAL')}
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors ${
                    faaliyetGrubu === 'NORMAL' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  Normal Faaliyet
                </button>
                <button
                  type="button"
                  onClick={() => setFaaliyetGrubu('MESAI')}
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors ${
                    faaliyetGrubu === 'MESAI' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  Mesai Faaliyeti
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Faaliyet Kategorisi *</label>
                <select
                  required
                  value={faaliyetTipi}
                  onChange={(e) => setFaaliyetTipi(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
                >
                  <option value="TEMİZLİK">🧹 TEMİZLİK (Koğuş, Banyo, Çamaşır)</option>
                  <option value="YEMEK">🍲 YEMEK (Yemekhane, Aşevi)</option>
                  <option value="GÜVENLİK">👮 GÜVENLİK (Kamp kapısı, Nöbet)</option>
                  <option value="BAKIM">🔧 BAKIM (Tesisat, Elektrik, Arıza)</option>
                  <option value="DİĞER">📝 DİĞER (Sosyal alanlar, Genel)</option>
                </select>
              </div>

              {faaliyetGrubu === 'MESAI' && (
                <div className="space-y-1.5 bg-amber-50/40 border border-amber-200 p-3 rounded-xl">
                  <label className="text-[9px] font-extrabold text-amber-800 uppercase tracking-wider block">İlgili Personeller & Mesai Saati *</label>
                  <p className="text-[8px] text-amber-700/70 leading-tight mb-2">Taşeron ve kamp personelleri listelenmektedir. Yalnızca mesaiye kalanların saatini artırın.</p>
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2.5 top-2.5 text-amber-700/60" />
                    <input
                      type="text"
                      value={mesaiPersonelSearch}
                      onChange={(e) => setMesaiPersonelSearch(e.target.value)}
                      placeholder="Personel adı, TC, görev veya firma ara..."
                      className="w-full bg-white border border-amber-200 text-[10px] text-slate-800 pl-7 pr-2.5 py-2 rounded-lg outline-none focus:border-amber-400"
                    />
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {mesaiPersonelListesi.length === 0 ? (
                      <div className="text-[9px] text-slate-400 italic p-2 text-center">
                        {mesaiPersonelSearch.trim()
                          ? 'Aramaya uygun personel yok.'
                          : 'İlgili personel bulunamadı.'}
                      </div>
                    ) : (
                      mesaiPersonelListesi.map(p => {
                        const hrs = personelMesaiSaatleri[p.id];
                        const hasHrs = Number(hrs) > 0;
                        return (
                          <div key={p.id} className={`flex items-center justify-between gap-2 border rounded-lg px-2 py-1.5 transition-colors ${hasHrs ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[9px] font-bold text-slate-800 truncate">{p.ad} {p.soyad}</span>
                              <span className="text-[7px] font-semibold text-slate-500 truncate">{p.gorev} • {p.firmaTipi === 'TASERON' ? 'Taşeron' : 'Kamp'}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min={0}
                                max={14}
                                step={0.5}
                                placeholder="—"
                                value={mesaiInputDisplayValue(hrs)}
                                onChange={(e) =>
                                  setPersonelMesaiSaatleri((prev) =>
                                    setMesaiHoursInMap(prev, p.id, e.target.value)
                                  )
                                }
                                className="w-14 text-center bg-white border border-slate-300 rounded-lg py-1 text-[9px] font-mono font-bold"
                              />
                              <span className="text-[8px] text-slate-500 font-bold">sa</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {mesaiPersonelSearch.trim() && (
                    <p className="text-[8px] font-bold text-amber-800 pt-1">
                      {mesaiPersonelListesi.length} personel listeleniyor
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Kamp Yerleşkesi *</label>
                {yerleskeler.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">
                    Önce &quot;Odalar&quot; sekmesinden yerleşke tanımlayın.
                  </p>
                ) : (
                  <select
                    required
                    value={faaliyetYerleske}
                    onChange={(e) => setFaaliyetYerleske(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none"
                  >
                    {yerleskeler.map(y => (
                      <option key={y.id} value={y.ad}>{y.ad}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Yapılan İşin Detayı *</label>
                <textarea
                  required
                  placeholder="Yapılan rutin işlerin ayrıntısını yazınız..."
                  value={faaliyetAciklama}
                  onChange={(e) => setFaaliyetAciklama(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl outline-none h-24 resize-none"
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
                className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-slate-500/10"
              >
                {loadingFaaliyet ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                <span>Faaliyeti Kaydet &amp; Onaya Gönder</span>
              </button>
            </form>
          </div>

          {/* Activity List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">Günlük Kamp Faaliyetleri</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">📋 Son Raporlanan Aktiviteler</h3>
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
                            act.faaliyetTipi === 'TEMİZLİK' ? 'bg-slate-500/10 border-slate-800/20 text-slate-600' :
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

                      {act.faaliyetGrubu === 'MESAI' && act.personelMesaiSaatleri && (
                        <div className="mt-2 space-y-1 bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                          <span className="text-[8px] font-black text-amber-700 uppercase">Girilen Mesailer:</span>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(act.personelMesaiSaatleri).map(([pid, hrs]) => {
                              const p = personeller.find(x => x.id === pid);
                              if (!p || !hrs) return null;
                              return (
                                <span key={pid} className="text-[9px] bg-white border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded shadow-sm">
                                  {p.ad} {p.soyad}: <strong>{hrs as number}sa</strong>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {act.fotoUrl && (
                        <div className="border border-slate-200 rounded bg-white p-1 max-h-24 overflow-hidden flex items-center justify-center mt-2">
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

      {activeSubTab === 'personel_giris' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <span className="font-extrabold text-[10px] text-emerald-500 uppercase tracking-wider">Personel İşe Giriş</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">🚪 Girişe Yolla</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Kamp alanına gelen personelin TC / telefon sorgu yapın, firmasını seçin ve kimlik fotoğrafıyla kaydedin.
              Kayıt ilgili firmaya personel olarak işlenir; talep ayrıca onay havuzuna gider.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGirisFirmaTipi('ANA_FIRMA')}
                className={`py-1.5 rounded-lg text-[10px] font-bold ${girisFirmaTipi === 'ANA_FIRMA' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                Ana Firma
              </button>
              <button
                type="button"
                onClick={() => setGirisFirmaTipi('TASERON')}
                className={`py-1.5 rounded-lg text-[10px] font-bold ${girisFirmaTipi === 'TASERON' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                Taşeron
              </button>
            </div>
            {girisFirmaTipi === 'ANA_FIRMA' ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700">
                {CANONICAL_ANA_FIRMA_ADI}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setGirisFirmaType('DB')} className={`py-1 rounded-md text-[9px] font-bold ${girisFirmaType === 'DB' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Kayıtlı Firma</button>
                  <button type="button" onClick={() => setGirisFirmaType('MANUAL')} className={`py-1 rounded-md text-[9px] font-bold ${girisFirmaType === 'MANUAL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Yeni Firma</button>
                </div>
                {girisFirmaType === 'DB' ? (
                  <select value={girisSelectedFirma} onChange={(e) => setGirisSelectedFirma(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none">
                    <option value="">-- Taşeron Seçin --</option>
                    {taseronCariler.map((c) => (
                      <option key={c.id} value={c.unvan}>{c.unvan}</option>
                    ))}
                  </select>
                ) : (
                  <input value={girisManualFirma} onChange={(e) => setGirisManualFirma(e.target.value)} placeholder="Firma adı" className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 p-3 rounded-xl outline-none" />
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="TC Kimlik No"
                  value={yeniTcNo}
                  onChange={(e) => setYeniTcNo(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="flex-1 bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-xl outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const found = findPersonelByTc(yeniTcNo);
                    if (!validateTC(yeniTcNo)) {
                      showStatus('error', 'TC SORGU için 11 haneli TC girin.');
                      return;
                    }
                    if (!found) {
                      showStatus('info', 'Bu TC ile kayıt bulunamadı — yeni personel olarak kaydedilecek.');
                      return;
                    }
                    setYeniAd(found.ad || '');
                    setYeniSoyad(found.soyad || '');
                    setYeniGorev(found.gorev || '');
                    setYeniTelefonNo(found.telefonNo || '');
                    if (isTaseronPersonel(found)) {
                      setGirisFirmaTipi('TASERON');
                      setGirisSelectedFirma(found.firmaAdi || '');
                      setGirisFirmaType('DB');
                    } else {
                      setGirisFirmaTipi('ANA_FIRMA');
                    }
                    showStatus('success', `${found.ad} ${found.soyad} bulundu.`);
                  }}
                  className="shrink-0 px-3 py-2.5 rounded-xl bg-sky-700 text-white text-[10px] font-black"
                >
                  TC SORGU
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="Telefon No"
                  value={yeniTelefonNo}
                  onChange={(e) => setYeniTelefonNo(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-xl outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (phoneMatchKey(yeniTelefonNo).length < 10) {
                      showStatus('error', 'TEL NO SORGU için en az 10 hane girin.');
                      return;
                    }
                    const found = findPersonelByTel(yeniTelefonNo);
                    if (!found) {
                      showStatus('info', 'Bu telefon ile kayıt bulunamadı — yeni personel olarak kaydedilecek.');
                      return;
                    }
                    setYeniAd(found.ad || '');
                    setYeniSoyad(found.soyad || '');
                    setYeniGorev(found.gorev || '');
                    setYeniTcNo(digitsOnly(found.tcNo || ''));
                    if (isTaseronPersonel(found)) {
                      setGirisFirmaTipi('TASERON');
                      setGirisSelectedFirma(found.firmaAdi || '');
                      setGirisFirmaType('DB');
                    } else {
                      setGirisFirmaTipi('ANA_FIRMA');
                    }
                    showStatus('success', `${found.ad} ${found.soyad} bulundu.`);
                  }}
                  className="shrink-0 px-3 py-2.5 rounded-xl bg-teal-700 text-white text-[10px] font-black"
                >
                  TEL NO SORGU
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Ad</label>
                <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none" placeholder="Ad" />
              </div>
              <div>
                <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Soyad</label>
                <input value={yeniSoyad} onChange={(e) => setYeniSoyad(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none" placeholder="Soyad" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Görev / Branş</label>
              <input value={yeniGorev} onChange={(e) => setYeniGorev(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-3 outline-none" placeholder="Örn: Kamp Görevlisi, Aşçı" />
            </div>
            <div>
              <label className="text-[9px] font-extrabold text-slate-500 uppercase block mb-1">Kimlik Fotoğrafı</label>
              <div className="flex gap-3">
                <label className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer w-24 h-20 shrink-0 text-slate-500">
                  <Camera size={20} />
                  <span className="text-[8px] font-bold mt-1">Çek</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const r = new FileReader();
                    r.onload = async (ev) => {
                      if (ev.target?.result) setYeniKimlikFoto(await compressImage(ev.target.result as string));
                    };
                    r.readAsDataURL(file);
                  }} />
                </label>
                <div className="flex-1 border border-slate-200 rounded-xl bg-slate-50 h-20 overflow-hidden flex items-center justify-center">
                  {yeniKimlikFoto ? (
                    <img src={yeniKimlikFoto} alt="Kimlik" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">Fotoğraf yok</span>
                  )}
                </div>
              </div>
            </div>

            <button type="button" onClick={handleSubmitKampGirisTalebi} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl cursor-pointer flex items-center justify-center gap-2">
              <UserPlus size={14} />
              GİRİŞİNİ YAP VE GÖNDER
            </button>

            {sonGirisTalebi && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3">
                <p className="text-xs text-emerald-800 font-bold">✅ Kayıt oluşturuldu — WhatsApp ile yönetime iletebilirsiniz</p>
                <a
                  href={buildWhatsAppUrl(
                    `*KİBRİTÇİ ERP - KAMP PERSONEL İŞE GİRİŞ*\n*Ad Soyad:* ${sonGirisTalebi.ad} ${sonGirisTalebi.soyad}\n*Görev:* ${sonGirisTalebi.gorev}\n*Tarih:* ${new Date().toLocaleDateString('tr-TR')}\n*Gönderen Kampçı:* ${currentUser?.email || '-'}\n*Kayıt Linki:* ${window.location.origin}/?view_giris=${sonGirisTalebi.id}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async () => {
                    try {
                      await setDoc(doc(db, 'personelGirisTalepleri', sonGirisTalebi.id), { durum: 'WP_GÖNDERİLDİ' }, { merge: true });
                    } catch (e) { console.warn(e); }
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageSquare size={14} />
                  WhatsApp&apos;tan Gönder
                </a>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-3">
            <h3 className="font-bold text-sm text-slate-800">📋 Giriş Talepleri Takibi</h3>
            {girisTalepleriList.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-8 text-center">Henüz giriş talebi yok.</p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {girisTalepleriList.map((item) => (
                  <div key={item.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-sm text-slate-800">{item.ad} {item.soyad}</span>
                        <span className="text-[10px] text-slate-500 block">{item.gorev}</span>
                      </div>
                      <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${
                        item.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' :
                        item.durum === 'WP_GÖNDERİLDİ' ? 'bg-slate-100 text-slate-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>{item.durum || 'BEKLEMEDE'}</span>
                    </div>
                    {item.durum === 'ONAYLANDI' && (
                      <a
                        href={buildWhatsAppUrl(
                          `*KİBRİTÇİ - GİRİŞ İZNİ ONAYLANDI*\n👤 ${item.ad} ${item.soyad}\n💼 ${item.gorev}\n✅ Kapı/güvenliğe bildirin.\n${window.location.origin}/?view_giris=${item.id}`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-[10px] font-bold text-emerald-700 hover:underline"
                      >
                        Kapıya WhatsApp ile bildir →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'taseron_sayim' && (
        <KampTaseronSayimTab
          personeller={personeller}
          setPersoneller={setPersoneller}
          cariKartlar={cariKartlar}
          currentUser={currentUser}
          addNotification={addNotification}
          showStatus={showStatus}
        />
      )}

      {activeSubTab === 'haftalik_yoklama' && setYoklamalar && (
        <KampHaftalikYoklamaTab
          kampOdalari={kampOdalari}
          kampKayitlari={kampKayitlari}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalar}
          personeller={personeller}
          currentUser={currentUser}
          addNotification={addNotification}
        />
      )}

      {activeSubTab === 'yoklama' && setYoklamalar && saveYoklamalarNow && (
        <KampGunlukYoklamaTab
          personeller={personeller}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalar}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          addNotification={addNotification}
        />
      )}

      {activeSubTab === 'aylik_puantaj' && setYoklamalar && saveYoklamalarNow && (
        <AylikPuantajMobilPanel
          personeller={personeller}
          filterPersonel={filterKampciPersonel}
          yoklamalar={yoklamalar}
          setYoklamalar={setYoklamalar}
          saveYoklamalarNow={saveYoklamalarNow}
          currentUser={currentUser}
          gonderenFallback="kampci"
          storageKey="aylik_puantaj_last_kampci"
          title="KAMPÇI AYLIK YOKLAMA / MESAİ"
          onStatus={showKampYoklamaStatus}
        />
      )}

      {activeSubTab === 'vidanjor' && (
        <KampVidanjorTab
          cariKartlar={cariKartlar}
          faturalar={faturalar}
          setFaturalar={setFaturalar}
          irsaliyeler={irsaliyeler}
          setIrsaliyeler={setIrsaliyeler}
          setCariIslemGecmisi={setCariIslemGecmisi}
          currentUser={currentUser}
          addNotification={addNotification}
          showStatus={showStatus}
        />
      )}

      {activeSubTab === 'gunluk_akis' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="p-2 bg-amber-100 rounded-xl">
              <Sparkles className="text-amber-600" size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Günlük Akış Raporu</h3>
              <p className="text-xs text-slate-500">Bugünkü yerleşim, depo sayımı ve faaliyet kayıtlarının özeti</p>
            </div>
          </div>

          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const yerlesimToday = kampKayitlari.filter((k) => k.girisTarihi?.startsWith(today));
            const sayimToday = depoSavimlari.filter((s) => s.tarih === today);
            const faaliyetToday = gunlukFaaliyetler.filter((f) => f.tarih === today);
            return (
              <>
                <ul className="text-sm text-slate-700 space-y-2 bg-slate-50 rounded-xl p-4">
                  <li>📅 Tarih: <strong>{today.split('-').reverse().join('.')}</strong></li>
                  <li>👤 Kampçı: <strong>{currentUser?.email || '—'}</strong></li>
                  <li>🏕️ Yerleşim işlemi: <strong>{yerlesimToday.length}</strong></li>
                  <li>📦 Depo sayım kaydı: <strong>{sayimToday.length}</strong></li>
                  <li>🧹 Günlük faaliyet: <strong>{faaliyetToday.length}</strong></li>
                </ul>

                <pre className="text-xs whitespace-pre-wrap bg-slate-900 text-slate-100 rounded-xl p-4 font-mono leading-relaxed">
                  {buildKampciGunlukOzet({
                    tarih: today,
                    email: currentUser?.email || 'kampci',
                    yerlesimCount: yerlesimToday.length,
                    sayimCount: sayimToday.length,
                    faaliyetCount: faaliyetToday.length,
                  })}
                </pre>

                <button
                  type="button"
                  onClick={handleSendKampGunlukAkis}
                  disabled={sendingKampAkis}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {sendingKampAkis ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Gönderiliyor…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      Gün Sonu Raporunu Yönetime Gönder
                    </>
                  )}
                </button>
              </>
            );
          })()}
        </div>
      )}

      {placementModalRoom && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-950/70 p-3 sm:p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
              <div>
                <span className="text-[9px] font-extrabold text-slate-600 uppercase tracking-wider block">Odaya Personel Yerleştir</span>
                <h3 className="font-black text-sm text-slate-900 mt-0.5">
                  {placementModalRoom.yerleskeAdi} · {placementModalRoom.kogusNo} / Oda {placementModalRoom.odaNo}
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  DB, taşeron veya elle giriş — firmaya göre otomatik eşleştirilir.
                </p>
              </div>
              <button
                type="button"
                onClick={closePlacementModal}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg leading-none px-2"
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <form onSubmit={handlePlacementSubmit} className="p-4 space-y-4">
              {renderPlacementPersonForm()}
            </form>
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
                className="text-[9px] bg-slate-900/20 border border-slate-800/30 text-slate-600 px-2.5 py-1 rounded-lg font-bold hover:bg-slate-500/30 transition cursor-pointer"
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
          <span className="p-1.5 bg-slate-900/10 rounded-lg text-slate-600">
            <Tent size={18} />
          </span>
          <span className="text-xs font-bold text-slate-600">Görünüm Sürümü:</span>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md uppercase font-black">💻 Web Sürüm</span>
        </div>
        <button
          onClick={() => setViewMode('mobile')}
          className="text-xs bg-slate-900 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-xl cursor-pointer transition shadow-md shadow-slate-500/10"
        >
          📱 Mobil Sürüm Test Et
        </button>
      </div>
      {content}
    </div>
  );
};
