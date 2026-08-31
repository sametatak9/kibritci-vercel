import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, Trash2, CreditCard as Edit3, Camera, Search, ShieldCheck, Mail, Phone, MapPin, Tent, DollarSign, UserX, FileText, CloudUpload as UploadCloud, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Loader as Loader2, Building2, History, Download, RefreshCw, ListPlus, ArrowLeft, ClipboardList, Tags } from 'lucide-react';
import { CariKart, CariKartIslem, KampKaydi, KampOdasi, Personel, SahaFaaliyeti, AylikYoklamaMap } from '../types/erp';
import { fetchApiJson } from '../lib/apiClient';
import { compressImage } from '../lib/imageCompress';
import { saveDocument } from '../lib/firebase';
import { kibritciLogoHtml } from '../lib/kibritciBrand';
import { findNearDuplicateCariNames, normalizeCardName } from '../lib/duplicateNameUtils';
import { normalizeTurkishName } from '../lib/yoklamaUtils';
import {
  AKVIZYON_GOREV,
  displayPersonelGorev,
  displayPersonelNitelik,
  isAkvizyonFirmaAdi,
  personelMatchesTextSearch,
  personelNameKey,
  resolveAkvizyonGorev,
} from '../lib/guvenlikHelpers';
import {
  personelHasTakipEtiketi,
  withPersonelTakipEtiketi,
} from '../lib/personelTakipEtiketUtils';
import {
  buildDedupedFirmaOptions,
  personelMatchesFirmaFilterKey,
} from '../lib/firmaCanonicalUtils';
import { getPersonelMissingDocs } from '../lib/personelMissingDocs';
import { validateIBAN, validateTC } from '../lib/personelOdemeUtils';
import {
  parseTaseronListeText,
  syncTaseronPersonelListe,
  type TaseronListeSyncResult,
} from '../lib/taseronPersonelListeGuncelle';
import { resolveTaseronPersonelGorev, TASERON_PERSONEL_DEPARTMAN, withTaseronPersonelGorev, isTaseronPersonelRecord, firmaEslesir } from '../lib/taseronUtils';
import {
  exportSeciliPersonelExcel,
  openPersonelListeRaporu,
} from '../lib/taseronPersonelExcelExport';
import {
  collectAktifAnaFirmaGorevGroups,
  exportAnaFirmaGorevPersonelExcel,
  printAnaFirmaGorevPersonelReport,
} from '../lib/anaFirmaGorevPersonelRapor';
import {
  CANONICAL_ANA_FIRMA_ADI,
  isIdariPersonel,
  isKibritciCompany,
  isPendingKampPersonel,
  isSeramikEkibiPersonel,
  isTaseronPersonel,
} from '../lib/yoklamaUtils';
import { findPersonelByTcInList, loadPersonellerForDedup, upsertPersonelAvoidDuplicate } from '../lib/personelMatchUtils';
import {
  buildPersonelKaliteIndex,
  gecersizIsimKaydi,
  isimdeRakamVar,
  isKritikPersonelSorunu,
  PERSONEL_SORUN_LABEL,
  type PersonelKayitSorunu,
} from '../lib/personelKayitKaliteUtils';
import {
  countPersonelByGorevGrup,
  PERSONEL_GOREV_GRUP_ORDER,
  personelGorevGrupChipClass,
  personelGorevGrupLabel,
  resolvePersonelGorevGrubu,
  type PersonelGorevGrup,
} from '../lib/personelGorevGrupUtils';
import { SmartCatalogField } from './SmartCatalogField';
import { PersonelNitelikTopluPanel } from './PersonelNitelikTopluPanel';

const MAX_PERSONEL_INLINE_MEDIA = 120_000;

type PersonelScreenView = 'liste' | 'kayit' | 'nitelik';
type KadroMode = 'ana_firma' | 'taseron';

/** Büyük foto/PDF’leri merge yazımında tekrar gönderme — timeout + rollback engeli */
function leanPersonelForFirestore(personel: Personel, prev?: Personel): Personel {
  const out: Personel = { ...personel };
  const stripIfHugeUnchanged = (key: 'fotografUrl' | 'sigortaEvrakUrl') => {
    const nextVal = String(out[key] || '');
    const prevVal = String(prev?.[key] || '');
    if (!nextVal.startsWith('data:')) return;
    if (nextVal.length <= MAX_PERSONEL_INLINE_MEDIA) return;
    if (!prev || nextVal === prevVal) {
      delete out[key];
    } else {
      // Yeni ama çok büyük — eskiyi koru
      delete out[key];
    }
  };
  stripIfHugeUnchanged('fotografUrl');
  stripIfHugeUnchanged('sigortaEvrakUrl');
  return out;
}

interface PersonelScreenProps {
  personeller: Personel[];
  setPersoneller: React.Dispatch<React.SetStateAction<Personel[]>>;
  onPersonelDeleted?: (deleted: Personel[]) => void;
  yoklamalar?: AylikYoklamaMap;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  cariKartlar?: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  sahaFaaliyetleri?: SahaFaaliyeti[];
}

const TASERON_MANUEL_KEY = '__MANUEL__';
const GOREV_PRESETS = [
  'DÜZ İŞÇİ',
  'FORMEN',
  'USTA',
  'MİMAR',
  'MÜHENDİS',
  'ŞEF',
  'GÜVENLİK',
  'DEPOCU',
  'KAYNAKÇI',
  'BOYACI',
  'ELEKTRİKÇİ',
  'TESİSATÇI',
  'MERMERCİ',
  'SERAMİKÇİ',
] as const;

function isTaseronCariKart(cari: CariKart): boolean {
  const tip = String((cari as CariKart & { tur?: string }).kartTipi || (cari as CariKart & { tur?: string }).tur || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  return tip === 'TASERON';
}

function createTaseronCariKart(unvan: string): CariKart {
  return {
    id: `ck_${Date.now()}`,
    kartTipi: 'TASERON',
    kod: `CAR-${Math.floor(100 + Math.random() * 900)}`,
    unvan,
    yetkili: 'Personel kaydından oluşturuldu',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'Personel kayıt ekranından otomatik oluşturuldu.',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Personel kaydından otomatik oluşturuldu.',
  };
}

type PendingPersonelSave = {
  normalizedPayload: Omit<Personel, 'id'> | Personel;
  isEdit: boolean;
  editingId?: string;
};

type TaseronResolveModalState =
  | {
      kind: 'create' | 'merge';
      manualName: string;
      matches?: CariKart[];
      pending: PendingPersonelSave;
    }
  | null;

export const PersonelScreen: React.FC<PersonelScreenProps> = ({
  personeller,
  setPersoneller,
  onPersonelDeleted,
  yoklamalar = {},
  cariKartlar = [],
  setCariKartlar,
  setCariIslemGecmisi,
  kampKayitlari = [],
  kampOdalari = [],
  sahaFaaliyetleri = [],
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  /** Ana firma modunda varsayılan ANA_FIRMA; taşeron modunda firma çoklu seçim */
  const [firmaFilters, setFirmaFilters] = useState<string[]>(['ANA_FIRMA']);
  const [firmaFilterOpen, setFirmaFilterOpen] = useState(false);
  const firmaFilterRef = useRef<HTMLDivElement | null>(null);
  const [kadroMode, setKadroMode] = useState<KadroMode>('ana_firma');
  const [selectedPersonel, setSelectedPersonel] = useState<Personel | null>(null);
  const [dismissingPersonel, setDismissingPersonel] = useState<Personel | null>(null);
  const [dismissDateStr, setDismissDateStr] = useState<string>("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPersonel, setHistoryPersonel] = useState<Personel | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [gorevGrupFilters, setGorevGrupFilters] = useState<PersonelGorevGrup[]>([]);
  const [sortMode, setSortMode] = useState<'NAME_ASC' | 'NAME_DESC' | 'DATE_NEWEST' | 'DATE_OLDEST'>('NAME_ASC');
  const [exportingListe, setExportingListe] = useState<'excel' | 'html' | null>(null);
  const [gorevListeOpen, setGorevListeOpen] = useState(false);
  const [gorevListeExporting, setGorevListeExporting] = useState(false);
  const [screenView, setScreenView] = useState<PersonelScreenView>('liste');
  const [savingPersonel, setSavingPersonel] = useState(false);
  const saveLockRef = useRef(false);

  // SGK PDF parsing states
  const [regMethod, setRegMethod] = useState<'manual' | 'sgk_pdf'>('manual');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSgkFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSgkFile(e.target.files[0]);
    }
  };

  const processSgkFile = (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında resmi SGK İşe Giriş Bildirgesi yükleyiniz.");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParseSuccess(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let dataUrl = reader.result as string;
        if (file.type.startsWith('image/')) {
          dataUrl = await compressImage(dataUrl, 1200, 1200, 0.75);
        } else if (file.size > 4 * 1024 * 1024) {
          throw new Error(
            'PDF dosyası çok büyük (4 MB üzeri). Vercel\'de zaman aşımı olmaması için daha küçük bir PDF veya belgenin fotoğrafını yükleyin.'
          );
        }
        const base64Data = dataUrl.split(',')[1];
        const resData = await fetchApiJson<{ success: boolean; data?: any; error?: string }>(
          '/api/parse-sgk',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: base64Data,
              mimeType: file.type
            })
          }
        );
        if (!resData.success) {
          throw new Error(resData.error || "Belge yapay zeka tarafından çözümlenirken bir sorun oluştu.");
        }

        const parsed = resData.data;

        setFormData(prev => ({
          ...prev,
          tcNo: parsed.tcNo || prev.tcNo,
          ad: parsed.ad || prev.ad,
          soyad: parsed.soyad || prev.soyad,
          babaAdi: parsed.babaAdi || prev.babaAdi,
          dogumTarihi: parsed.dogumTarihi || prev.dogumTarihi,
          iseGirisTarihi: parsed.iseGirisTarihi || prev.iseGirisTarihi,
          cinsiyet: parsed.cinsiyet || prev.cinsiyet || 'Erkek',
          adres: parsed.adres || prev.adres,
          il: parsed.il || prev.il,
          ilce: parsed.ilce || prev.ilce,
          gorev: normalizePersonelGorev(parsed.gorev || prev.gorev || 'DÜZ İŞÇİ'),
          ibanNo: parsed.ibanNo || prev.ibanNo || 'TR',
          bankaAdi: parsed.bankaAdi || prev.bankaAdi || '',
        }));

        let parsedMsg = `Yapay Zeka Çözümlemesi Başarılı! \nPersonel: ${parsed.ad || ''} ${parsed.soyad || ''} bilgileri form alanlarına otomatik dolduruldu.`;
        if (parsed.ibanNo) {
          parsedMsg += `\nIBAN: ${parsed.ibanNo} ve Banka: ${parsed.bankaAdi || ''} bilgileri de dekonttan çözümlendi.`;
        }
        setParseSuccess(parsedMsg);
        setRegMethod('manual');
      } catch (err: any) {
        console.error("SGK/Dekont parsing error:", err);
        let userFriendlyMsg = err.message || "Belge çözümlenemedi. Lütfen dosyanızın geçerli bir SGK İşe Giriş Bildirgesi veya Ödeme Dekontu olduğundan emin olun.";
        if (userFriendlyMsg.includes('504') || userFriendlyMsg.includes('zaman aşımı') || userFriendlyMsg.includes('timeout') || userFriendlyMsg.includes('Gateway')) {
          userFriendlyMsg = "Sunucu zaman aşımına uğradı (504). Çözüm: (1) Belgenin fotoğrafını (PDF yerine JPG) yükleyin, (2) https://kibritci-web.vercel.app adresini kullanın, (3) Vercel'de GEMINI_API_KEY tanımlı olduğundan emin olun.";
        } else if (userFriendlyMsg.includes('kibritci-web-1') || userFriendlyMsg.includes('kibritci-erp.onrender') || userFriendlyMsg.includes('boş yanıt') || userFriendlyMsg.includes('404')) {
          userFriendlyMsg = 'Yapay zeka sunucusuna ulaşılamadı. Lütfen siteyi https://kibritci-web.vercel.app adresinden açın.';
        } else if (/429|RESOURCE_EXHAUSTED|quota exceeded|kota doldu|prepayment credits are depleted|billing#prepay/i.test(userFriendlyMsg)) {
          userFriendlyMsg = 'Gemini kredisi/kotası tükendi (prepayment credits depleted). Google AI Studio > Projects > Billing bölümünde bakiye/faturalandırma açıp redeploy yapın: https://ai.google.dev/gemini-api/docs/billing#prepay';
        } else if (userFriendlyMsg.includes("503") || userFriendlyMsg.includes("UNAVAILABLE") || userFriendlyMsg.includes("high demand") || userFriendlyMsg.includes("experiencing high demand")) {
          userFriendlyMsg = "Yapay zeka servisi şu anda çok yoğun (Geçici 503 Hatası). Sunucu otomatik olarak yeniden denedi ancak yoğunluk devam ediyor. Lütfen birkaç saniye bekleyip tekrar dosya yüklemeyi deneyin veya Manuel Kayıt yöntemini kullanın.";
        }
        setParseError(userFriendlyMsg);
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Form States (for creating/updating)
  const emptyForm: Omit<Personel, 'id'> = {
    tcNo: "",
    ad: "",
    soyad: "",
    babaAdi: "",
    dogumTarihi: "",
    telefonNo: "+90 ",
    eposta: "",
    adres: "",
    il: "",
    ilce: "",
    departman: "Şantiye",
    gorev: "DÜZ İŞÇİ",
    nitelik: "",
    iseGirisTarihi: new Date().toISOString().split('T')[0],
    cinsiyet: "Erkek",
    maas: 30000,
    ucretTipi: "Aylık",
    sgkDurumu: "SGK'lı",
    bankaAdi: "",
    subeAdi: "",
    ibanNo: "TR",
    durum: true,
    firmaTipi: 'ANA_FIRMA',
    firmaAdi: CANONICAL_ANA_FIRMA_ADI,
    personelGrubu: 'SAHA',
    takipEtiketleri: [],
  };

  const [formData, setFormData] = useState<Omit<Personel, 'id'> | Personel>(emptyForm);
  const [taseronKaynak, setTaseronKaynak] = useState('');
  const [manuelTaseronAdi, setManuelTaseronAdi] = useState('');
  const [taseronResolveModal, setTaseronResolveModal] = useState<TaseronResolveModalState>(null);

  /** Haftalık taşeron kadro listesi güncelleme */
  const [listeModalOpen, setListeModalOpen] = useState(false);
  const [listeFirmaCariId, setListeFirmaCariId] = useState('');
  const [listeManuelFirma, setListeManuelFirma] = useState('');
  const [listeText, setListeText] = useState('');
  const [listeDonemBas, setListeDonemBas] = useState('');
  const [listeDonemBit, setListeDonemBit] = useState('');
  const [listePreview, setListePreview] = useState<TaseronListeSyncResult | null>(null);
  const [listeParseErrors, setListeParseErrors] = useState<string[]>([]);
  const [listeSaving, setListeSaving] = useState(false);

  const taseronCariList = useMemo(
    () =>
      cariKartlar
        .filter(isTaseronCariKart)
        .sort((a, b) => {
          const aPasif = String(a.durum || 'AKTIF').toUpperCase() === 'PASIF';
          const bPasif = String(b.durum || 'AKTIF').toUpperCase() === 'PASIF';
          if (aPasif !== bPasif) return aPasif ? 1 : -1;
          return a.unvan.localeCompare(b.unvan, 'tr');
        }),
    [cariKartlar]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'firmaTipi') {
      const nextTip = value as Personel['firmaTipi'];
      setFormData((prev) => ({
        ...prev,
        firmaTipi: nextTip,
        firmaAdi: nextTip === 'TASERON' ? '' : CANONICAL_ANA_FIRMA_ADI,
        gorev: nextTip === 'TASERON' ? prev.gorev : resolveAkvizyonGorev(CANONICAL_ANA_FIRMA_ADI, prev.gorev),
        // Taşeron: IBAN/maaş zorunlu değil
        maas: nextTip === 'TASERON' ? 0 : prev.maas || 30000,
        ibanNo: nextTip === 'TASERON' ? '' : prev.ibanNo || 'TR',
        ucretTipi: nextTip === 'TASERON' ? 'Günlük' : prev.ucretTipi,
        sgkDurumu: nextTip === 'TASERON' ? 'Sigortasız' : prev.sgkDurumu,
      }));
      setTaseronKaynak('');
      setManuelTaseronAdi('');
      return;
    }
    if (name === 'gorev' && isAkvizyonFirmaAdi(formData.firmaAdi)) {
      return;
    }
    setFormData(prev => ({
      ...prev,
      [name]: name === 'maas' ? (parseFloat(value) || 0) : value
    }));
  };

  const applyFirmaAdiToForm = (firmaAdi: string) => {
    setFormData((prev) => ({
      ...prev,
      firmaAdi,
      gorev: resolveAkvizyonGorev(firmaAdi, prev.gorev),
    }));
  };

  const akvizyonGorevFixDone = useRef(false);
  useEffect(() => {
    if (akvizyonGorevFixDone.current) return;
    const toFix = personeller.filter(
      (p) =>
        isAkvizyonFirmaAdi(p.firmaAdi) &&
        normalizePersonelGorev(p.gorev).toLocaleUpperCase('tr-TR') !== AKVIZYON_GOREV
    );
    if (toFix.length === 0) return;
    akvizyonGorevFixDone.current = true;
    setPersoneller((prev) =>
      prev.map((p) =>
        isAkvizyonFirmaAdi(p.firmaAdi) &&
        normalizePersonelGorev(p.gorev).toLocaleUpperCase('tr-TR') !== AKVIZYON_GOREV
          ? { ...p, gorev: AKVIZYON_GOREV, firmaTipi: 'TASERON' as const }
          : p
      )
    );
    // Yalnızca görev/firmaTipi — maaş vb. alanları eski snapshot ile ezme
    toFix.forEach((p) => {
      void saveDocument('personeller', {
        id: p.id,
        gorev: AKVIZYON_GOREV,
        firmaTipi: 'TASERON',
      } as Personel);
    });
  }, [personeller, setPersoneller]);

  const taseronDepartmanFixDone = useRef(false);
  useEffect(() => {
    if (taseronDepartmanFixDone.current) return;
    const toFix = personeller.filter(
      (p) => isTaseronPersonelRecord(p) && p.departman === 'TAŞERON'
    );
    if (toFix.length === 0) return;
    taseronDepartmanFixDone.current = true;
    setPersoneller((prev) =>
      prev.map((p) =>
        isTaseronPersonelRecord(p) && p.departman === 'TAŞERON'
          ? { ...p, departman: TASERON_PERSONEL_DEPARTMAN }
          : p
      )
    );
    toFix.forEach((p) => {
      void saveDocument('personeller', {
        id: p.id,
        departman: TASERON_PERSONEL_DEPARTMAN,
      } as Personel);
    });
  }, [personeller, setPersoneller]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleSelectPersonel = (p: Personel) => {
    openPersonelForEdit(p);
  };

  /** Liste filtreleri (pasif / taşeron / kampçı) yüzünden görünmeyen kaydı düzenlemeye açar */
  const openPersonelForEdit = (p: Personel, overrides?: Partial<Personel>) => {
    const corrected: Personel = {
      ...p,
      ...overrides,
      id: p.id,
      gorev: resolveAkvizyonGorev(
        overrides?.firmaAdi ?? p.firmaAdi,
        overrides?.gorev ?? p.gorev
      ),
    };
    if (!personeller.some((x) => x.id === p.id)) {
      setPersoneller((prev) => [...prev, p]);
    }
    if (!is_aktif_status(corrected.durum)) setShowOnlyActive(false);
    const asTaseron =
      corrected.firmaTipi === 'TASERON' ||
      (corrected.firmaTipi !== 'ANA_FIRMA' && isTaseronPersonel(corrected));
    switchKadroMode(asTaseron ? 'taseron' : 'ana_firma');
    setSearchTerm(String(corrected.tcNo || `${corrected.ad} ${corrected.soyad}`).trim());
    setSelectedPersonel(corrected);
    setFormData(corrected);
    setRegMethod('manual');
    setScreenView('kayit');
    if (asTaseron) {
      const match = taseronCariList.find(
        (c) =>
          c.unvan === corrected.firmaAdi ||
          normalizeCardName(c.unvan) === normalizeCardName(corrected.firmaAdi || '')
      );
      if (match) {
        setTaseronKaynak(match.id);
        setManuelTaseronAdi('');
      } else {
        setTaseronKaynak(TASERON_MANUEL_KEY);
        setManuelTaseronAdi(corrected.firmaAdi || '');
      }
    } else {
      setTaseronKaynak('');
      setManuelTaseronAdi('');
    }
  };

  const handleClearForm = () => {
    setSelectedPersonel(null);
    setFormData(emptyForm);
    setTaseronKaynak('');
    setManuelTaseronAdi('');
  };

  const resolveFirmaFields = (): { firmaTipi: 'ANA_FIRMA' | 'TASERON'; firmaAdi: string } | null => {
    const firmaTipi = formData.firmaTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA';
    if (firmaTipi === 'ANA_FIRMA') {
      return { firmaTipi: 'ANA_FIRMA', firmaAdi: CANONICAL_ANA_FIRMA_ADI };
    }

    let firmaAdi = '';
    if (taseronKaynak === TASERON_MANUEL_KEY) {
      firmaAdi = manuelTaseronAdi.trim();
    } else if (taseronKaynak) {
      firmaAdi = taseronCariList.find((c) => c.id === taseronKaynak)?.unvan || '';
    } else {
      firmaAdi = String(formData.firmaAdi || '').trim();
    }

    if (!firmaAdi || firmaAdi === 'MANUEL') {
      alert('Taşeron personel için cari karttan firma seçin veya firma adını elle yazın.');
      return null;
    }

    return { firmaTipi: 'TASERON', firmaAdi };
  };

  const normalizeIban = (value: string | undefined | null) =>
    String(value || '')
      .replace(/\s+/g, '')
      .toUpperCase()
      .trim();

  const normalizeRoleKey = (value: string | undefined | null) =>
    String(value || '')
      .trim()
      .toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ç/g, 'C')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/[^A-Z0-9]/g, '');

  const normalizePersonelGorev = (value: string | undefined | null) => {
    const raw = String(value || '').trim();
    const key = normalizeRoleKey(raw);
    if (!raw) return '';
    if (key === 'ISCI' || key === 'DUZISCI') return 'DÜZ İŞÇİ';
    return raw;
  };

  // NOT: Tüm kadroyu normalize edip setPersoneller ile senkronlamak
  // büyük fotoğraflı kayıtlarda timeout + rollback yapıyordu; kaldırıldı.
  // Görev normalizasyonu yalnızca kayıt / SGK parse anında uygulanır.

  const appendTaseronCariHistory = (
    cariKartId: string,
    personel: Personel,
    action: 'create' | 'edit',
    note?: string
  ) => {
    if (!setCariIslemGecmisi) return;
    const islem: CariKartIslem = {
      id: `cari_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cariKartId,
      islemTipi: 'DIGER',
      islemId: personel.id,
      islemBaslik: action === 'create' ? 'Taşeron Personel Kaydı' : 'Taşeron Personel Güncelleme',
      islemDetay: `${personel.ad} ${personel.soyad} · ${displayPersonelGorev(personel)} · TC ${personel.tcNo}${note ? ` · ${note}` : ''}`,
      tarih: new Date().toISOString().split('T')[0],
    };
    setCariIslemGecmisi((prev) => [islem, ...prev]);
  };

  const finalizePersonelSave = async (
    normalizedPayload: Omit<Personel, 'id'> | Personel,
    isEdit: boolean,
    taseronCariId?: string,
    historyNote?: string,
    editingId?: string
  ) => {
    const withRules = withTaseronPersonelGorev({
      ...normalizedPayload,
      gorev:
        normalizedPayload.firmaTipi === 'TASERON' || isAkvizyonFirmaAdi(normalizedPayload.firmaAdi)
          ? resolveTaseronPersonelGorev({
              firmaAdi: normalizedPayload.firmaAdi,
              firmaTipi: normalizedPayload.firmaTipi,
            })
          : normalizePersonelGorev(
              resolveAkvizyonGorev(normalizedPayload.firmaAdi, normalizedPayload.gorev)
            ),
      firmaTipi: isAkvizyonFirmaAdi(normalizedPayload.firmaAdi)
        ? ('TASERON' as const)
        : normalizedPayload.firmaTipi,
    } as Personel);

    // Aktif kartta eski çıkış tarihi kalmasın (yeniden giriş / liste sync artığı)
    if (is_aktif_status(withRules.durum)) {
      (withRules as Personel).istenCikisTarihi = null as unknown as string;
    }

    const resolvedEditId =
      (editingId && String(editingId).trim()) ||
      (isEdit && 'id' in withRules && withRules.id ? String(withRules.id).trim() : '') ||
      (selectedPersonel?.id ? String(selectedPersonel.id).trim() : '');

    let savedPersonel: Personel;
    if (resolvedEditId) {
      // Güncelleme: asla yeni id üretme
      savedPersonel = { ...(withRules as Omit<Personel, 'id'>), id: resolvedEditId };
    } else {
      savedPersonel = {
        ...(withRules as Omit<Personel, 'id'>),
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
    }
    let savingAsEdit = Boolean(resolvedEditId);

    try {
      setSavingPersonel(true);
      const prev = savingAsEdit ? personeller.find((p) => p.id === savedPersonel.id) : undefined;
      if (savingAsEdit) {
        const lean = leanPersonelForFirestore(savedPersonel, prev);
        await saveDocument('personeller', lean as Personel);
      } else {
        const result = await upsertPersonelAvoidDuplicate(personeller, savedPersonel, {
          rawName: `${savedPersonel.ad} ${savedPersonel.soyad}`,
          tcNo: savedPersonel.tcNo,
          telefonNo: savedPersonel.telefonNo,
          firmaAdi: savedPersonel.firmaAdi,
          firmaTipi: savedPersonel.firmaTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA',
        });
        savedPersonel = result.personel;
        savingAsEdit = !result.created;
      }
    } catch (err: any) {
      console.error(err);
      alert(
        'Personel kaydı veritabanına yazılamadı: ' +
          (err?.message === 'FIRESTORE_TIMEOUT'
            ? 'zaman aşımı (büyük fotoğraf kaydı engellemiş olabilir)'
            : err?.message || 'bilinmeyen hata')
      );
      return;
    } finally {
      // Kilit handleSave bitene kadar kalsın — erken bırakınca çift kayıt oluşabiliyordu
      setSavingPersonel(false);
    }

    setPersoneller((prev) => {
      if (savingAsEdit) {
        const exists = prev.some((p) => p.id === savedPersonel.id);
        if (exists) {
          return prev.map((p) =>
            p.id === savedPersonel.id
              ? {
                  ...p,
                  ...savedPersonel,
                  id: savedPersonel.id,
                  ...(is_aktif_status(savedPersonel.durum)
                    ? { istenCikisTarihi: undefined }
                    : null),
                }
              : p
          );
        }
        // Seçili kaydın id'si listedekiyle farklıysa (eski bozuk id alanı) seçiliye güncelle
        if (selectedPersonel?.id) {
          return prev.map((p) =>
            p.id === selectedPersonel.id ? { ...savedPersonel, id: selectedPersonel.id } : p
          );
        }
        return prev;
      }
      return [savedPersonel, ...prev];
    });
    alert(
      savingAsEdit && resolvedEditId
        ? 'Personel bilgileri başarıyla güncellendi.'
        : savingAsEdit
          ? 'Mevcut personel kaydı güncellendi (mükerrer oluşturulmadı).'
          : 'Yeni personel başarıyla kaydedildi.'
    );

    if (savedPersonel.firmaTipi === 'TASERON' && taseronCariId) {
      appendTaseronCariHistory(taseronCariId, savedPersonel, savingAsEdit ? 'edit' : 'create', historyNote);
    }

    setTaseronResolveModal(null);
    handleClearForm();
    setScreenView('liste');
  };

  const openNewPersonelKayit = () => {
    handleClearForm();
    setRegMethod('manual');
    setScreenView('kayit');
  };

  const handleGorevChange = (value: string) => {
    if (isAkvizyonFirmaAdi(formData.firmaAdi)) return;
    setFormData((prev) => ({ ...prev, gorev: normalizePersonelGorev(value) }));
  };

  const handleNitelikChange = (value: string) => {
    setFormData((prev) => ({ ...prev, nitelik: value }));
  };

  const resolveTaseronCariOnSave = async (
    firmaAdi: string,
    pending: PendingPersonelSave
  ): Promise<boolean> => {
    if (taseronKaynak && taseronKaynak !== TASERON_MANUEL_KEY) {
      const selected = taseronCariList.find((c) => c.id === taseronKaynak);
      await finalizePersonelSave(
        { ...pending.normalizedPayload, firmaAdi: selected?.unvan || firmaAdi },
        pending.isEdit,
        taseronKaynak,
        undefined,
        pending.editingId
      );
      return true;
    }

    const exact = taseronCariList.find(
      (c) => normalizeCardName(c.unvan) === normalizeCardName(firmaAdi)
    );
    if (exact) {
      await finalizePersonelSave(
        { ...pending.normalizedPayload, firmaAdi: exact.unvan },
        pending.isEdit,
        exact.id,
        undefined,
        pending.editingId
      );
      return true;
    }

    const near = findNearDuplicateCariNames(taseronCariList, firmaAdi, 2);
    if (near.length > 0) {
      setTaseronResolveModal({
        kind: 'merge',
        manualName: firmaAdi,
        matches: near,
        pending,
      });
      return false;
    }

    setTaseronResolveModal({
      kind: 'create',
      manualName: firmaAdi,
      pending,
    });
    return false;
  };

  const handleMergeTaseronCari = (selectedCari: CariKart) => {
    if (!taseronResolveModal || taseronResolveModal.kind !== 'merge') return;
    const { pending, manualName } = taseronResolveModal;
    void finalizePersonelSave(
      { ...pending.normalizedPayload, firmaAdi: selectedCari.unvan },
      pending.isEdit,
      selectedCari.id,
      `Manuel "${manualName}" → "${selectedCari.unvan}" ile birleştirildi`,
      pending.editingId
    );
    setTaseronKaynak(selectedCari.id);
    setManuelTaseronAdi('');
  };

  const handleCreateTaseronCari = () => {
    if (!taseronResolveModal || taseronResolveModal.kind !== 'create') return;
    const { pending, manualName } = taseronResolveModal;
    if (!setCariKartlar) {
      alert('Cari kart oluşturulamıyor. Personel yalnızca elle yazılan firma adıyla kaydedilecek.');
      void finalizePersonelSave(
        { ...pending.normalizedPayload, firmaAdi: manualName },
        pending.isEdit,
        undefined,
        undefined,
        pending.editingId
      );
      return;
    }
    const newCari = createTaseronCariKart(manualName);
    setCariKartlar((prev) => [newCari, ...prev]);
    void finalizePersonelSave(
      { ...pending.normalizedPayload, firmaAdi: newCari.unvan },
      pending.isEdit,
      newCari.id,
      'Yeni taşeron cari kartı açıldı',
      pending.editingId
    );
    setTaseronKaynak(newCari.id);
    setManuelTaseronAdi('');
  };

  const handleSkipTaseronCariCreate = () => {
    if (!taseronResolveModal) return;
    const { pending, manualName } = taseronResolveModal;
    void finalizePersonelSave(
      { ...pending.normalizedPayload, firmaAdi: manualName },
      pending.isEdit,
      undefined,
      undefined,
      pending.editingId
    );
  };

  const resolveListeFirmaAdi = (): string => {
    if (listeFirmaCariId === TASERON_MANUEL_KEY) {
      return String(listeManuelFirma || '').trim();
    }
    return taseronCariList.find((c) => c.id === listeFirmaCariId)?.unvan?.trim() || '';
  };

  const openListeModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (firmaFilters.length === 1) {
      const hit = firmaFilterOptions.find((o) => o.key === firmaFilters[0]);
      const label = hit?.label || firmaFilters[0];
      const cari = taseronCariList.find((c) => firmaEslesir(c.unvan, label));
      if (cari) {
        setListeFirmaCariId(cari.id);
        setListeManuelFirma('');
      } else {
        setListeFirmaCariId(TASERON_MANUEL_KEY);
        setListeManuelFirma(label);
      }
    }
    if (!listeDonemBas) setListeDonemBas(today);
    if (!listeDonemBit) setListeDonemBit(today);
    setListeModalOpen(true);
  };

  const handleListeOnizle = () => {
    const firmaAdi = resolveListeFirmaAdi();
    if (!firmaAdi) {
      alert('Taşeron firma seçin veya elle yazın.');
      return;
    }
    const { rows, errors } = parseTaseronListeText(listeText);
    setListeParseErrors(errors);
    if (rows.length === 0) {
      setListePreview(null);
      alert('Liste boş — satır satır Ad Soyad (isteğe bağlı TC) yapıştırın.');
      return;
    }
    const result = syncTaseronPersonelListe({
      firmaAdi,
      rows,
      existing: personeller,
      cikisTarihi: listeDonemBit || new Date().toISOString().slice(0, 10),
      iseGirisTarihi: listeDonemBas || new Date().toISOString().slice(0, 10),
    });
    setListePreview({ ...result, parseErrors: errors });
  };

  const handleListeUygula = async () => {
    if (!listePreview) {
      handleListeOnizle();
      return;
    }
    if (listePreview.toSave.length === 0) {
      alert('Değişiklik yok — liste mevcut kadroyla aynı.');
      return;
    }
    const firmaAdi = resolveListeFirmaAdi();
    const msg =
      `${firmaAdi} taşeron kadrosu güncellenecek:\n` +
      `+ ${listePreview.created.length} yeni\n` +
      `↻ ${listePreview.reactivated.length} yeniden aktif\n` +
      `✎ ${listePreview.updated.length} güncelleme\n` +
      `− ${listePreview.deactivated.length} pasife alınacak\n` +
      `= ${listePreview.kept.length} aynı kalacak\n\n` +
      `Devam? (Personel Yönetimi listesine yazılır; yoklama/maaş hesaplanmaz.)`;
    if (!window.confirm(msg)) return;

    setListeSaving(true);
    try {
      let created = 0;
      let merged = 0;
      let dedupList = await loadPersonellerForDedup(personeller);
      for (const p of listePreview.toSave) {
        const result = await upsertPersonelAvoidDuplicate(dedupList, p, {
          rawName: `${p.ad} ${p.soyad}`.trim(),
          tcNo: p.tcNo,
          telefonNo: p.telefonNo,
          firmaAdi: p.firmaAdi,
          firmaTipi: p.firmaTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA',
        });
        dedupList = dedupList.some((x) => x.id === result.personel.id)
          ? dedupList.map((x) => (x.id === result.personel.id ? result.personel : x))
          : [...dedupList, result.personel];
        if (result.created) created += 1;
        else if (result.merged) merged += 1;
      }
      setPersoneller(dedupList);
      alert(
        `Taşeron liste güncellendi.\nYeni: ${created} · Birleştirilen: ${merged} · Pasif: ${listePreview.deactivated.length}`
      );
      setListeModalOpen(false);
      setListePreview(null);
      setListeText('');
      setListeParseErrors([]);
    } catch (err: any) {
      console.error(err);
      alert('Liste kaydedilemedi: ' + (err?.message || 'bilinmeyen hata'));
    } finally {
      setListeSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveLockRef.current || savingPersonel) return;
    saveLockRef.current = true;
    setSavingPersonel(true);
    try {
    const isTaseronForm = formData.firmaTipi === 'TASERON';
    if (!formData.ad || !formData.soyad) {
      alert('Lütfen en az Ad ve Soyad alanlarını doldurun.');
      return;
    }
    if (isimdeRakamVar(formData) || gecersizIsimKaydi(formData)) {
      const ok = window.confirm(
        'Ad veya soyad geçersiz görünüyor (rakam, placeholder veya çok kısa).\n\nFirestore\'a yine de yazılsın mı?'
      );
      if (!ok) return;
    }
    const isIdariForm =
      formData.personelGrubu === 'IDARI' || formData.departman === 'İDARİ' || isIdariPersonel(formData as Personel);
    if (!isTaseronForm && !isIdariForm && !formData.tcNo) {
      alert('Ana firma personeli için TC Kimlik No zorunludur. İdari kadroda TC sonra girilebilir.');
      return;
    }

    const normalizedTc = String(formData.tcNo || '').trim();
    if (normalizedTc && !validateTC(normalizedTc)) {
      alert('TC Kimlik No tam 11 haneli ve sadece rakamlardan oluşmalıdır!');
      return;
    }
    if (!isTaseronForm && !isIdariForm && !validateTC(normalizedTc)) {
      alert('TC Kimlik No tam 11 haneli ve sadece rakamlardan oluşmalıdır!');
      return;
    }

    const editingId =
      (selectedPersonel?.id && String(selectedPersonel.id).trim()) ||
      ('id' in formData && formData.id ? String(formData.id).trim() : '');
    const isEdit = Boolean(editingId);

    const dedupList = await loadPersonellerForDedup(personeller);

    if (normalizedTc) {
      const duplicateTc = findPersonelByTcInList(
        dedupList.filter((p) => !(isEdit && p.id === editingId)),
        normalizedTc
      );
      if (duplicateTc) {
        const durumLabel = is_aktif_status(duplicateTc.durum) ? 'Aktif' : 'Pasif';
        const isTas = isTaseronPersonel(duplicateTc);
        const firmaLabel =
          duplicateTc.firmaAdi || (isTas ? 'Taşeron' : 'Ana firma');
        const wantsAna = !isTaseronForm;
        if (isTas && wantsAna) {
          const migrate = window.confirm(
            `Bu TC taşeron kadrosunda kayıtlı: ${duplicateTc.ad} ${duplicateTc.soyad}\n` +
              `Firma: ${firmaLabel} · ${durumLabel}\n\n` +
              `Aynı kişiyi ana firmaya taşımak için mevcut kaydı açayım mı?\n` +
              `(Yeni ikinci kayıt açılmaz — taşeron → ana firma güncellemesi yapılır.)`
          );
          if (migrate) {
            openPersonelForEdit(duplicateTc, {
              firmaTipi: 'ANA_FIRMA',
              firmaAdi: CANONICAL_ANA_FIRMA_ADI,
              tcNo: normalizedTc,
              ad: formData.ad || duplicateTc.ad,
              soyad: formData.soyad || duplicateTc.soyad,
              gorev: formData.gorev || duplicateTc.gorev,
              durum: formData.durum || duplicateTc.durum,
            });
          }
          return;
        }
        const hiddenHint = isHiddenPendingKampci(duplicateTc)
          ? '\nNot: Kampçı onay bekleyen kayıt — listede gizleniyordu.'
          : !is_aktif_status(duplicateTc.durum)
            ? '\nNot: Pasif kayıt — «Sadece Aktifler» filtresi kapalıyken görünür.'
            : isTas
              ? '\nNot: Taşeron kadrosunda.'
              : '';
        const openExisting = window.confirm(
          `Bu TC kimlik numarası zaten kayıtlı: ${duplicateTc.ad} ${duplicateTc.soyad}\n` +
            `Durum: ${durumLabel} · ${firmaLabel}${hiddenHint}\n\n` +
            `Mevcut kaydı açıp güncellemek ister misiniz?\n(Yeni mükerrer kayıt açılmaz.)`
        );
        if (openExisting) openPersonelForEdit(duplicateTc);
        return;
      }
    }

    if (!is_aktif_status(formData.durum) && !formData.istenCikisTarihi) {
      alert("HATA: İstihdam durumu 'Pasif / Ayrıldı' seçildiğinde, bir 'İşten Çıkış / Ayrılma Tarihi' girilmesi zorunludur! Lütfen tarihi yazın veya seçin.");
      return;
    }

    const existingPersonel = isEdit ? personeller.find((p) => p.id === editingId) : undefined;
    const inputIban = normalizeIban((formData as any).ibanNo || (formData as any).iban || '');
    const prevIban = normalizeIban(existingPersonel?.ibanNo || (existingPersonel as any)?.iban || '');
    const firmaFields = resolveFirmaFields();
    if (!firmaFields) return;

    const finalIban = inputIban && inputIban !== 'TR' ? inputIban : prevIban;
    const isAnaFirmaAktif =
      firmaFields.firmaTipi === 'ANA_FIRMA' && is_aktif_status(formData.durum);
    if (isAnaFirmaAktif && !isIdariForm && !validateIBAN(finalIban)) {
      alert('Ana firma aktif personeli için geçerli TR IBAN zorunludur (TR + 24 hane, toplam 26 karakter).');
      return;
    }
    if (finalIban && finalIban !== 'TR' && !validateIBAN(finalIban)) {
      alert('IBAN formatı geçersiz. Örnek: TR860006400000123456789012');
      return;
    }

    const normalizedPayload: Omit<Personel, 'id'> | Personel = isEdit
      ? {
          ...formData,
          id: editingId,
          tcNo: normalizedTc,
          ibanNo: finalIban,
          gorev:
            firmaFields.firmaTipi === 'TASERON'
              ? resolveTaseronPersonelGorev({ firmaAdi: firmaFields.firmaAdi, firmaTipi: 'TASERON' })
              : normalizePersonelGorev(
                  resolveAkvizyonGorev(firmaFields.firmaAdi, (formData as any).gorev)
                ),
          nitelik: String((formData as Personel).nitelik || '').trim().toLocaleUpperCase('tr-TR'),
          firmaTipi: firmaFields.firmaTipi,
          firmaAdi: firmaFields.firmaAdi,
        }
      : {
          ...formData,
          tcNo: normalizedTc,
          ibanNo: finalIban,
          gorev:
            firmaFields.firmaTipi === 'TASERON'
              ? resolveTaseronPersonelGorev({ firmaAdi: firmaFields.firmaAdi, firmaTipi: 'TASERON' })
              : normalizePersonelGorev(
                  resolveAkvizyonGorev(firmaFields.firmaAdi, (formData as any).gorev)
                ),
          nitelik: String((formData as Personel).nitelik || '').trim().toLocaleUpperCase('tr-TR'),
          firmaTipi: firmaFields.firmaTipi,
          firmaAdi: firmaFields.firmaAdi,
        };

    const pending: PendingPersonelSave = { normalizedPayload, isEdit, editingId: editingId || undefined };

    if (firmaFields.firmaTipi === 'TASERON') {
      const proceeded = await resolveTaseronCariOnSave(firmaFields.firmaAdi, pending);
      if (!proceeded) return;
      return;
    }

    await finalizePersonelSave(normalizedPayload, isEdit, undefined, undefined, editingId || undefined);
    } finally {
      saveLockRef.current = false;
      setSavingPersonel(false);
    }
  };

  const handleDelete = (id: string) => {
    const target = personeller.find((p) => p.id === id);
    if (!target) return;

    const msg = `"${target.ad} ${target.soyad}" silinsin mi?\nYalnızca bu kart silinir; aynı isimdeki diğer kayıt durur.\n(Kamp oda yerleşimi varsa bu kişi tahliye edilir.)`;
    if (!confirm(msg)) return;

    setPersoneller((prev) => prev.filter((p) => p.id !== id));
    onPersonelDeleted?.([target]);

    if (selectedPersonel?.id === id) {
      handleClearForm();
    }
  };

  const dataToSave = () => formData;

  useEffect(() => {
    if (!firmaFilterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!firmaFilterRef.current?.contains(e.target as Node)) {
        setFirmaFilterOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFirmaFilterOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [firmaFilterOpen]);

  const firmaFilterOptions = useMemo(() => {
    const names: string[] = [];
    personeller.forEach((p) => {
      if (p.firmaTipi === 'TASERON' || isTaseronPersonel(p) || isAkvizyonFirmaAdi(p.firmaAdi)) {
        names.push((p.firmaAdi || 'Taşeron').trim());
      }
    });
    kampKayitlari.forEach((k) => {
      const ad = String(k.calistigiFirma || '').trim();
      if (ad && !isKibritciCompany(ad)) names.push(ad);
    });
    cariKartlar.filter(isTaseronCariKart).forEach((c) => {
      const ad = String(c.unvan || '').trim();
      if (ad) names.push(ad);
    });
    return buildDedupedFirmaOptions(names);
  }, [personeller, kampKayitlari, cariKartlar]);

  /** Mevcut kadrodaki görev/ünvanlar — tekrar eden farklı yazımları önlemek için öneri listesinde */
  const existingGorevOptions = useMemo(() => {
    const set = new Set<string>([...GOREV_PRESETS]);
    personeller.forEach((p) => {
      const g = normalizePersonelGorev(String(p.gorev || '')).trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [personeller]);

  const existingNitelikOptions = useMemo(() => {
    const set = new Set<string>();
    personeller.forEach((p) => {
      const n = String(p.nitelik || '').trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [personeller]);

  const matchesFirmaFilter = (p: Personel, filters: string[]) => {
    if (!filters.length) return true;
    return filters.some((key) => {
      const hit = firmaFilterOptions.find((o) => o.key === key);
      return personelMatchesFirmaFilterKey(p, key, hit?.label || key);
    });
  };

  const toggleFirmaFilter = (key: string) => {
    setFirmaFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setGorevGrupFilters([]);
    setShowOnlyActive(false);
  };

  const firmaFilterSummary = useMemo(() => {
    if (kadroMode === 'ana_firma') return CANONICAL_ANA_FIRMA_ADI;
    if (firmaFilters.length === 0) return 'Tüm Taşeron Firmalar';
    if (firmaFilters.length === 1) {
      const hit = firmaFilterOptions.find((o) => o.key === firmaFilters[0]);
      return hit?.label || firmaFilters[0];
    }
    return `${firmaFilters.length} taşeron seçili`;
  }, [firmaFilters, firmaFilterOptions, kadroMode]);

  const switchKadroMode = (mode: KadroMode) => {
    setKadroMode(mode);
    setFirmaFilterOpen(false);
    setGorevGrupFilters([]);
    if (mode === 'ana_firma') {
      setFirmaFilters(['ANA_FIRMA']);
      setShowOnlyActive(true);
    } else {
      setFirmaFilters([]);
      setShowOnlyActive(true);
    }
  };

  const matchesKadroMode = (p: Personel) =>
    kadroMode === 'ana_firma' ? !isTaseronPersonel(p) : isTaseronPersonel(p);

  const isHiddenPendingKampci = (p: Personel) => isPendingKampPersonel(p);

  const personelSahaTagData = useMemo(() => {
    const byId = new Set<string>();
    const normalizedNames = new Set<string>();
    sahaFaaliyetleri.forEach((f) => {
      if (f.personelId) byId.add(String(f.personelId));
      (f.aktifPersonelListesi || []).forEach((name) => {
        if (!name) return;
        normalizedNames.add(normalizeTurkishName(String(name)));
      });
    });
    return { byId, normalizedNames };
  }, [sahaFaaliyetleri]);

  const personelCampData = useMemo(() => {
    const activeCamp = new Set<string>();
    const anyCamp = new Set<string>();
    kampKayitlari.forEach((k) => {
      if (!k.personelId) return;
      anyCamp.add(k.personelId);
      if (String(k.durum).toUpperCase() === 'AKTIF') activeCamp.add(k.personelId);
    });
    return { activeCamp, anyCamp };
  }, [kampKayitlari]);

  const personelKalite = useMemo(
    () => buildPersonelKaliteIndex(personeller, { yoklamalar }),
    [personeller, yoklamalar]
  );

  const kadroPool = useMemo(
    () => personeller.filter((p) => matchesKadroMode(p) && !isHiddenPendingKampci(p)),
    [personeller, kadroMode]
  );

  const gorevGrupPool = useMemo(() => {
    let pool = kadroPool;
    if (showOnlyActive) {
      pool = pool.filter((p) => is_aktif_status(p.durum));
    }
    if (kadroMode === 'ana_firma') {
      pool = pool.filter((p) => matchesFirmaFilter(p, firmaFilters.length ? firmaFilters : ['ANA_FIRMA']));
    } else if (firmaFilters.length > 0) {
      pool = pool.filter((p) => matchesFirmaFilter(p, firmaFilters));
    }
    return pool;
  }, [
    kadroPool,
    showOnlyActive,
    kadroMode,
    firmaFilters,
  ]);

  const gorevGrupCounts = useMemo(
    () => countPersonelByGorevGrup(gorevGrupPool),
    [gorevGrupPool]
  );

  const toggleGorevGrupFilter = (grup: PersonelGorevGrup) => {
    setGorevGrupFilters((prev) =>
      prev.includes(grup) ? prev.filter((g) => g !== grup) : [...prev, grup]
    );
  };

  const filteredPersonel = useMemo(
    () =>
      personeller.filter((p) => {
        const term = searchTerm.trim();
        const matchesSearch = !term || personelMatchesTextSearch(p, searchTerm);

        // Kampçı onay bekleyen kayıtlar varsayılan listede gizli; TC/isim aramasında bulunur
        if (isHiddenPendingKampci(p)) {
          return Boolean(term) && matchesSearch;
        }

        if (kadroMode === 'ana_firma') {
          if (isTaseronPersonel(p)) return false;
          if (!matchesFirmaFilter(p, firmaFilters.length ? firmaFilters : ['ANA_FIRMA'])) return false;
        } else {
          if (!isTaseronPersonel(p)) return false;
          if (firmaFilters.length > 0 && !matchesFirmaFilter(p, firmaFilters)) return false;
        }

        if (showOnlyActive && !is_aktif_status(p.durum)) {
          return false;
        }

        if (gorevGrupFilters.length > 0 && !gorevGrupFilters.includes(resolvePersonelGorevGrubu(p))) {
          return false;
        }

        return matchesSearch;
      }),
    [
      personeller,
      kadroMode,
      firmaFilters,
      showOnlyActive,
      gorevGrupFilters,
      searchTerm,
    ]
  );

  const parseDateValue = (value: string) => {
    if (!value) return 0;
    const parts = value.split('.').map((part) => Number(part));
    if (parts.length === 3 && parts.every((num) => !Number.isNaN(num))) {
      return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const visiblePersonel = useMemo(() => {
    const sorted = filteredPersonel.slice();
    switch (sortMode) {
      case 'NAME_DESC':
        return sorted.sort((a, b) =>
          `${b.ad} ${b.soyad}`.localeCompare(`${a.ad} ${a.soyad}`, 'tr', { sensitivity: 'base' })
        );
      case 'DATE_NEWEST':
        return sorted.sort(
          (a, b) => parseDateValue(b.iseGirisTarihi || '') - parseDateValue(a.iseGirisTarihi || '')
        );
      case 'DATE_OLDEST':
        return sorted.sort(
          (a, b) => parseDateValue(a.iseGirisTarihi || '') - parseDateValue(b.iseGirisTarihi || '')
        );
      default:
        return sorted.sort((a, b) =>
          `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' })
        );
    }
  }, [filteredPersonel, sortMode]);

  const groupedVisiblePersonel = useMemo(() => {
    const aktifler = visiblePersonel.filter((p) => is_aktif_status(p.durum));
    const pasifler = visiblePersonel.filter((p) => !is_aktif_status(p.durum));
    return { aktifler, pasifler };
  }, [visiblePersonel]);

  const seramikKadroOzet = useMemo(() => {
    const all = kadroPool.filter(isSeramikEkibiPersonel);
    const aktif = all.filter((p) => is_aktif_status(p.durum)).length;
    return { toplam: all.length, aktif, pasif: all.length - aktif };
  }, [kadroPool]);

  const seramikListeGizli =
    kadroMode !== 'ana_firma' &&
    seramikKadroOzet.toplam > 0 &&
    visiblePersonel.filter(isSeramikEkibiPersonel).length < seramikKadroOzet.toplam &&
    gorevGrupFilters.length > 0;

  const personelListSections = useMemo(() => {
    if (showOnlyActive) {
      return [{ key: 'all', title: null as string | null, rows: visiblePersonel }];
    }
    return [
      {
        key: 'aktif',
        title: `Aktifler (${groupedVisiblePersonel.aktifler.length})`,
        rows: groupedVisiblePersonel.aktifler,
      },
      {
        key: 'pasif',
        title: `Pasifler (${groupedVisiblePersonel.pasifler.length})`,
        rows: groupedVisiblePersonel.pasifler,
      },
    ].filter((s) => s.rows.length > 0);
  }, [showOnlyActive, visiblePersonel, groupedVisiblePersonel]);

  const sorunBadgeClass = (sorun: PersonelKayitSorunu) => {
    if (sorun === 'ISIMDE_RAKAM' || sorun === 'GECERSIZ_ISIM' || sorun === 'TEK_KELIME_ISIM') {
      return 'bg-orange-50 text-orange-900 border-orange-200';
    }
    if (sorun === 'LEGACY_KAYIT' || sorun === 'YAPAY_IMPORT') {
      return 'bg-violet-50 text-violet-900 border-violet-200';
    }
    if (sorun === 'YAKIN_ISIM') {
      return 'bg-amber-50 text-amber-900 border-amber-200';
    }
    if (sorun === 'GECERSIZ_TC' || sorun === 'EKSIK_BILGI') {
      return 'bg-sky-50 text-sky-900 border-sky-200';
    }
    return 'bg-rose-50 text-rose-800 border-rose-200';
  };

  const aktifAnaFirmaGorevGroups = useMemo(
    () => collectAktifAnaFirmaGorevGroups(personeller),
    [personeller]
  );

  const aktifAnaFirmaGorevToplam = useMemo(
    () => aktifAnaFirmaGorevGroups.reduce((s, g) => s + g.personeller.length, 0),
    [aktifAnaFirmaGorevGroups]
  );

  const handleOpenGorevListe = () => {
    if (aktifAnaFirmaGorevToplam === 0) {
      alert('Aktif ana firma personeli bulunamadı.');
      return;
    }
    setGorevListeOpen(true);
  };

  const handlePrintGorevListe = () => {
    try {
      const count = printAnaFirmaGorevPersonelReport(personeller, { onlyActive: true });
      alert(`${count} kişi için antetli görev raporu açıldı (yazdır / PDF kaydet).`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rapor oluşturulamadı.');
    }
  };

  const handleExportGorevListeExcel = async () => {
    setGorevListeExporting(true);
    try {
      const count = await exportAnaFirmaGorevPersonelExcel(personeller);
      alert(`${count} aktif ana firma personeli göreve göre Excel olarak indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    } finally {
      setGorevListeExporting(false);
    }
  };

  const buildListeRaporSubtitle = () => {
    const parts: string[] = [
      kadroMode === 'ana_firma' ? 'Ana Firma' : 'Taşeron',
      firmaFilterSummary,
    ];
    if (showOnlyActive) parts.push('Yalnız aktif');
    if (gorevGrupFilters.length > 0) {
      parts.push(`Görev: ${gorevGrupFilters.map(personelGorevGrupLabel).join(', ')}`);
    }
    if (searchTerm.trim()) parts.push(`Arama: ${searchTerm.trim()}`);
    return parts.join(' · ');
  };

  const handleExportListeExcel = async () => {
    if (visiblePersonel.length === 0) {
      alert('Dışa aktarılacak personel yok. Filtreleri kontrol edin.');
      return;
    }
    setExportingListe('excel');
    try {
      const count = await exportSeciliPersonelExcel({
        rows: visiblePersonel,
        title: `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi`,
        subtitle: buildListeRaporSubtitle(),
        fileNamePrefix: 'Personel_Listesi',
        kampKayitlari,
        kampOdalari,
        groupByFirma: true,
        onlyActive: showOnlyActive,
        splitByDurum: !showOnlyActive,
      });
      alert(`${count} personel Kibritçi antetli Excel olarak indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel raporu oluşturulamadı.');
    } finally {
      setExportingListe(null);
    }
  };

  const handleExportListeHtml = () => {
    if (visiblePersonel.length === 0) {
      alert('Rapor oluşturulacak personel yok. Filtreleri kontrol edin.');
      return;
    }
    try {
      const count = openPersonelListeRaporu({
        rows: visiblePersonel,
        title: `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi`,
        subtitle: buildListeRaporSubtitle(),
        onlyActive: showOnlyActive,
        splitByDurum: !showOnlyActive,
      });
      alert(`${count} personel için HTML rapor açıldı (yazdır / PDF kaydet).`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'HTML raporu oluşturulamadı.');
    }
  };

  const handleShowHistory = (p: Personel) => {
    setHistoryPersonel(p);
    setShowHistoryModal(true);
  };

  const generateHistoryReport = () => {
    if (!historyPersonel) return;
    const html = `
      <html>
        <head><meta charset="utf-8"><title>Personel Geçmiş Raporu</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
          <div style="text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px;">
            ${kibritciLogoHtml(48)}
            <p style="color: #666; margin: 8px 0 5px; font-size: 12px;">PERSONEL GEÇMİŞ RAPORU</p>
            <p style="color: #999; font-size: 11px;">${historyPersonel.ad} ${historyPersonel.soyad} - ${historyPersonel.tcNo}</p>
          </div>
          <div style="font-size: 12px; line-height: 1.8;">
            <p><strong>Ad Soyad:</strong> ${historyPersonel.ad} ${historyPersonel.soyad}</p>
            <p><strong>TC No:</strong> ${historyPersonel.tcNo}</p>
            <p><strong>Görev:</strong> ${historyPersonel.gorev}</p>
            <p><strong>Departman:</strong> ${historyPersonel.departman}</p>
            <p><strong>İşe Giriş:</strong> ${historyPersonel.iseGirisTarihi || '-'}</p>
            <p><strong>Durum:</strong> ${historyPersonel.durum ? 'Aktif' : 'Pasif'} ${historyPersonel.istenCikisTarihi ? '(Çıkış: ' + historyPersonel.istenCikisTarihi + ')' : ''}</p>
            <p><strong>Firma:</strong> ${historyPersonel.firmaAdi || CANONICAL_ANA_FIRMA_ADI} ${historyPersonel.firmaTipi === 'TASERON' ? '(Taşeron)' : '(Ana Firma)'}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
            <p><em>Bu rapor personel kartı üzerinden otomatik oluşturulmuştur. İlişkili işlemler (izin, maaş, araç KM, kamp kaydı vb.) burada listelenecektir.</em></p>
          </div>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Personel_Gecmisi_${historyPersonel.tcNo}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isEditMode = Boolean(selectedPersonel?.id) || ('id' in formData && Boolean((formData as Personel).id));

  return (
    <div className="flex-grow min-h-[calc(100vh-52px)] flex flex-col font-sans select-none bg-gradient-to-b from-[#FFFBF7] via-white to-orange-50/20">

      {/* Liste / Kayıt alt sayfa geçişi */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-orange-100 bg-white/90 backdrop-blur-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 p-1 bg-orange-50 rounded-xl border border-orange-100">
            <button
              type="button"
              onClick={() => setScreenView('liste')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                screenView === 'liste'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-orange-100'
              }`}
            >
              <Users size={14} />
              Kadro Listesi
            </button>
            <button
              type="button"
              onClick={openNewPersonelKayit}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                screenView === 'kayit'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-orange-100'
              }`}
            >
              <ClipboardList size={14} />
              Personel Kayıt
            </button>
            <button
              type="button"
              onClick={() => setScreenView('nitelik')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                screenView === 'nitelik'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-orange-100'
              }`}
            >
              <Tags size={14} />
              Nitelik Toplu
            </button>
          </div>

          {screenView === 'liste' ? (
            <button
              type="button"
              onClick={openNewPersonelKayit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-sm cursor-pointer"
            >
              <UserPlus size={14} />
              Yeni Personel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setScreenView('liste')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-orange-900 text-xs font-bold cursor-pointer"
            >
              <ArrowLeft size={14} />
              Listeye Dön
            </button>
          )}
        </div>

        {screenView === 'liste' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => switchKadroMode('ana_firma')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  kadroMode === 'ana_firma'
                    ? 'bg-white text-orange-700 shadow-sm border border-orange-200'
                    : 'text-slate-600 hover:bg-white/80'
                }`}
              >
                <ShieldCheck size={14} />
                Ana Firma Kadrosu
              </button>
              <button
                type="button"
                onClick={() => switchKadroMode('taseron')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  kadroMode === 'taseron'
                    ? 'bg-white text-amber-800 shadow-sm border border-amber-300'
                    : 'text-slate-600 hover:bg-white/80'
                }`}
              >
                <Building2 size={14} />
                Taşeron Kadrosu
              </button>
            </div>
            <span className="text-[10px] text-slate-500 font-semibold">
              {kadroMode === 'ana_firma'
                ? 'Varsayılan: aktif · ana firma · Firestore personeller'
                : 'Taşeron firmalar · Firestore personeller'}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      {screenView === 'nitelik' ? (
        <PersonelNitelikTopluPanel
          personeller={personeller}
          setPersoneller={setPersoneller}
          cariKartlar={cariKartlar}
        />
      ) : screenView === 'kayit' ? (
      <div className="max-w-4xl mx-auto w-full bg-white border border-orange-100 rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Header card indicator */}
        <div className="bg-white border-b border-slate-100 p-5 shrink-0 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Personel Kayıt & Düzenleme
            </span>
            <h3 className="font-display font-black text-slate-800 text-sm">
              { isEditMode ? "👤 Personel Bilgilerini Güncelle" : "👤 Yeni Personel Girişi" }
            </h3>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-mono font-bold shadow-sm">
            { isEditMode ? "Düzeltme Modu" : "Yeni Kayıt" }
          </span>
        </div>

        {/* Tab switcher for registration method - only shown in Create Mode */}
        { !isEditMode && (
          <div className="flex border-b border-slate-100 bg-white p-3 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRegMethod('manual');
                setParseError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                regMethod === 'manual'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                  : 'text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <UserPlus size={14} />
              Manuel Kayıt
            </button>
            <button
              type="button"
              onClick={() => {
                setRegMethod('sgk_pdf');
                setParseSuccess(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                regMethod === 'sgk_pdf'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                  : 'text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <FileText size={14} />
              SGK veya Dekont (AI)
            </button>
          </div>
        )}

        {regMethod === 'sgk_pdf' && !isEditMode ? (
          <div className="p-5 space-y-3 overflow-y-auto min-h-0">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1 text-slate-700">
              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-slate-900" />
                Yapay Zeka Destekli SGK & Dekont Girişi
              </h5>
              <p className="text-[10px] leading-relaxed text-slate-600">
                SGK İşe Giriş Bildirgesi veya banka dekontunu yükleyin; ad, soyad, TC, IBAN ve banka bilgileri otomatik doldurulur.
              </p>
            </div>

            {/* Drag and Drop Zone — sabit yükseklik, ekranın altına kaymaz */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`h-44 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center transition relative ${
                dragActive
                  ? "border-slate-800 bg-slate-50"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              {isParsing ? (
                <div className="space-y-3 flex flex-col items-center">
                  <Loader2 size={36} className="text-slate-800 animate-spin" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">Belge Analiz Ediliyor...</p>
                    <p className="text-[10px] text-slate-500">Gemini Yapay Zeka verileri çözümlüyor, lütfen bekleyin.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="p-3 bg-slate-100 text-slate-600 rounded-full shadow-sm">
                    <UploadCloud size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700">
                      SGK Belgesini Sürükleyip Bırakın
                    </p>
                    <p className="text-[10px] text-slate-400">
                      veya bilgisayarınızdan seçmek için tıklayın
                    </p>
                  </div>
                  <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-sm transition active:scale-95 inline-block">
                    Dosya Seç
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="text-[9px] text-slate-400">
                    Desteklenen formatlar: PDF, PNG, JPG, WEBP (Maks 10MB)
                  </p>
                </div>
              )}
            </div>

            {parseError && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex gap-2 text-rose-900">
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <div className="text-[11px] leading-normal font-medium">
                  {parseError}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Scrollable Form Body */
          <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {parseSuccess && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2 text-emerald-950 mb-3 animate-fade-in relative">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                <div className="text-[11px] leading-relaxed font-semibold pr-4">
                  {parseSuccess}
                </div>
                <button
                  type="button"
                  onClick={() => setParseSuccess(null)}
                  className="absolute top-2 right-2 text-emerald-500 hover:text-emerald-700 text-xs font-bold px-1"
                >
                  ×
                </button>
              </div>
            )}

          {/* Kimlik block */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Genel Künye
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  {formData.firmaTipi === 'TASERON' || formData.personelGrubu === 'IDARI' || formData.departman === 'İDARİ'
                    ? 'TC Kimlik No (idari: sonra girilebilir)'
                    : 'TC Kimlik No *'}
                </label>
                <input
                  type="text"
                  name="tcNo"
                  maxLength={11}
                  value={formData.tcNo}
                  onChange={handleInputChange}
                  className="w-full text-xs font-medium border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50  transition duration-150"
                  placeholder={
                    formData.firmaTipi === 'TASERON' || formData.personelGrubu === 'IDARI' || formData.departman === 'İDARİ'
                      ? 'Boş bırakılabilir — sahte 11 hane yazmayın'
                      : '11 Hane'
                  }
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Cinsiyet</label>
                <select
                  name="cinsiyet"
                  value={formData.cinsiyet}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50  transition"
                >
                  <option value="Erkek">Erkek</option>
                  <option value="Kadın">Kadın</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Adı *</label>
                <input
                  type="text"
                  name="ad"
                  value={formData.ad}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50  transition"
                  placeholder="İsim"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Soyadı *</label>
                <input
                  type="text"
                  name="soyad"
                  value={formData.soyad}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50  transition"
                  placeholder="Soyisim"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Baba Adı</label>
                <input
                  type="text"
                  name="babaAdi"
                  value={formData.babaAdi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Doğum Tarihi</label>
                <input
                  type="date"
                  name="dogumTarihi"
                  value={formData.dogumTarihi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* İletişim block */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              İletişim &amp; Adres
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Telefon No</label>
                <input
                  type="text"
                  name="telefonNo"
                  value={formData.telefonNo}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="+90 "
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">E-Posta</label>
                <input
                  type="email"
                  name="eposta"
                  value={formData.eposta}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="ornek@kibritci.com"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Açık Adres</label>
              <textarea
                name="adres"
                value={formData.adres}
                onChange={handleInputChange}
                rows={2}
                className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50 resize-none"
                placeholder="Ev veya şantiye lojmanı adresi..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İkamet İl</label>
                <input
                  type="text"
                  name="il"
                  value={formData.il}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İkamet İlçe</label>
                <input
                  type="text"
                  name="ilce"
                  value={formData.ilce}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Firma Seçimi */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Firma Bağlılığı
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Tipi</label>
                <select
                  name="firmaTipi"
                  value={formData.firmaTipi || 'ANA_FIRMA'}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="ANA_FIRMA">Ana Firma (Kibritçi)</option>
                  <option value="TASERON">Taşeron Firma</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Adı</label>
                {formData.firmaTipi === 'TASERON' ? (
                  <div className="space-y-2 mt-1">
                    <select
                      value={taseronKaynak}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTaseronKaynak(next);
                        if (next === TASERON_MANUEL_KEY) {
                          applyFirmaAdiToForm(manuelTaseronAdi.trim());
                          return;
                        }
                        const cari = taseronCariList.find((c) => c.id === next);
                        setManuelTaseronAdi('');
                        applyFirmaAdiToForm(cari?.unvan || '');
                      }}
                      className="w-full text-xs border border-[#e2e8f0] rounded-lg p-2 bg-slate-50"
                    >
                      <option value="">Cari karttan taşeron seçin…</option>
                      {taseronCariList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.unvan} ({c.kod}){String(c.durum || 'AKTIF').toUpperCase() === 'PASIF' ? ' · Pasif' : ''}
                        </option>
                      ))}
                      <option value={TASERON_MANUEL_KEY}>Elle yaz (manuel)</option>
                    </select>
                    {taseronKaynak === TASERON_MANUEL_KEY && (
                      <input
                        type="text"
                        value={manuelTaseronAdi}
                        onChange={(e) => {
                          const next = e.target.value;
                          setManuelTaseronAdi(next);
                          applyFirmaAdiToForm(next);
                        }}
                        className="w-full text-xs border border-[#e2e8f0] rounded-lg p-2 bg-slate-50"
                        placeholder="Taşeron firma adını yazın…"
                      />
                    )}
                    {taseronCariList.length === 0 && (
                      <p className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                        Cari kartlarda taşeron bulunamadı. İdari → Cari Kartlar’dan kart tipi Taşeron olan firma ekleyin veya elle yazın — kayıt sırasında yeni cari açılması önerilir.
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    name="firmaAdi"
                    value={formData.firmaAdi || CANONICAL_ANA_FIRMA_ADI}
                    readOnly
                    className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-100 text-slate-500"
                  />
                )}
              </div>
            </div>
            {formData.firmaTipi === 'TASERON' && isAkvizyonFirmaAdi(formData.firmaAdi) && (
              <p className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5">
                Akvizyon güvenlik taşeron firmasıdır — personel görevi otomatik olarak <strong>GÜVENLİK</strong> olarak kaydedilir.
              </p>
            )}
            {formData.firmaTipi === 'TASERON' && !isAkvizyonFirmaAdi(formData.firmaAdi) && (
              <p className="text-[9px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                Taşeron personelde IBAN ve maaş zorunlu değildir. Yoklama alınmaz, maaş hesaplanmaz.
                Haftalık kadro güncellemesi için sağ üstteki <strong>Taşeron Liste Güncelle</strong> kullanın.
              </p>
            )}
          </div>

          {/* Görev & Finansal block */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Görev &amp; Hak Ediş Bilgileri
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Departman</label>
                <select
                  name="departman"
                  value={formData.departman}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      departman: v,
                      personelGrubu: v === 'İDARİ' ? 'IDARI' : prev.personelGrubu === 'IDARI' ? 'SAHA' : prev.personelGrubu || 'SAHA',
                    }));
                  }}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="Şantiye">Şantiye</option>
                  <option value="Ofis">Ofis</option>
                  <option value="İDARİ">İdari (yoklama alınmaz)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Personel Grubu</label>
                <select
                  name="personelGrubu"
                  value={(formData as Personel).personelGrubu || (formData.departman === 'İDARİ' ? 'IDARI' : 'SAHA')}
                  onChange={(e) => {
                    const next = e.target.value as 'SAHA' | 'IDARI';
                    setFormData((prev) => ({
                      ...prev,
                      personelGrubu: next,
                      departman: next === 'IDARI' ? 'İDARİ' : prev.departman === 'İDARİ' ? 'Şantiye' : prev.departman,
                    }));
                  }}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="SAHA">Saha — yoklama / puantaj</option>
                  <option value="IDARI">İdari — yoklama yok (izin/tutanak/araç)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-emerald-800 uppercase">Kadro etiketi</label>
                <label className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personelHasTakipEtiketi(formData as Personel, 'ZER YAPI')}
                    onChange={(e) =>
                      setFormData((prev) => withPersonelTakipEtiketi(prev as Personel, 'ZER YAPI', e.target.checked))
                    }
                    className="w-4 h-4 accent-emerald-700 cursor-pointer"
                  />
                  ZER YAPI — bu personeli ZER YAPI grubunda takip et
                </label>
                <p className="text-[10px] text-slate-400 mt-1">
                  Yoklamayı değiştirmez. Puantaj → Etiket Grupları listesinde görünür.
                </p>
              </div>
              <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SmartCatalogField
                  kind="gorev"
                  name="gorev"
                  label="Görev/Ünvan"
                  value={formData.gorev}
                  onChange={handleGorevChange}
                  extraOptions={existingGorevOptions}
                  disabled={isAkvizyonFirmaAdi(formData.firmaAdi)}
                  autoRegisterNew={!isAkvizyonFirmaAdi(formData.firmaAdi)}
                  inputClassName={`w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 ${
                    isAkvizyonFirmaAdi(formData.firmaAdi)
                      ? 'bg-indigo-50 text-indigo-900 font-bold'
                      : 'bg-slate-50'
                  }`}
                  hint={
                    isAkvizyonFirmaAdi(formData.firmaAdi)
                      ? 'Akvizyon personeli için görev sabittir: GÜVENLİK'
                      : formData.gorev?.trim()
                        ? `${existingGorevOptions.length} kayıtlı görev — listeden seçin veya benzer yazım uyarısını dikkate alın`
                        : 'Boş = arafta. Formen / kampçı / tesisatçı / puantaja çıkmaz. Siz doldurunca yoklamaya girer.'
                  }
                />
                <SmartCatalogField
                  kind="nitelik"
                  name="nitelik"
                  label="Nitelik / detay etiket"
                  value={(formData as Personel).nitelik || ''}
                  onChange={handleNitelikChange}
                  extraOptions={existingNitelikOptions}
                  placeholder="Örn. ALÇI SIVA USTASI"
                  hint="Görevin yanında raporlarda görünür. Puantaj grubunu değiştirmez."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-emerald-700 uppercase">İşe Giriş Tarihi</label>
                <input
                  type="date"
                  name="iseGirisTarihi"
                  value={formData.iseGirisTarihi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-emerald-200 rounded-lg mt-1 p-2 bg-emerald-50/60 text-emerald-950 font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">SGK Durumu</label>
                <select
                  name="sgkDurumu"
                  value={formData.sgkDurumu}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="SGK'lı">SGK'lı</option>
                  <option value="Sigortasız">Sigortasız</option>
                  <option value="Stajyer">Stajyer</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  {formData.firmaTipi === 'TASERON' ? 'Maaş (opsiyonel)' : 'Maaş (Brüt) *'}
                </label>
                <input
                  type="number"
                  name="maas"
                  value={formData.maas || ''}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder={formData.firmaTipi === 'TASERON' ? 'Zorunlu değil' : '30000'}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Ücret Tipi</label>
                <select
                  name="ucretTipi"
                  value={formData.ucretTipi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="Aylık">Aylık</option>
                  <option value="Günlük">Günlük</option>
                  <option value="Saatlik">Saatlik</option>
                </select>
              </div>
            </div>
          </div>

          {/* Banka block */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Banka Hesap Bilgileri
              {formData.firmaTipi === 'TASERON' && (
                <span className="ml-2 text-amber-600 font-semibold normal-case tracking-normal">
                  (taşeron — zorunlu değil)
                </span>
              )}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Banka Adı</label>
                <input
                  type="text"
                  name="bankaAdi"
                  value={formData.bankaAdi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="Örn: Garanti"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Şube Adı</label>
                <input
                  type="text"
                  name="subeAdi"
                  value={formData.subeAdi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="Örn: Merkez"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                {formData.firmaTipi === 'TASERON' ? 'IBAN (opsiyonel)' : 'IBAN Numarası'}
              </label>
              <input
                type="text"
                name="ibanNo"
                value={formData.ibanNo}
                onChange={handleInputChange}
                className="w-full text-xs font-mono font-medium border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                placeholder={formData.firmaTipi === 'TASERON' ? 'Zorunlu değil' : 'TR000...'}
              />
            </div>
          </div>

          {/* Status switch - matching custom color constraints */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 my-4">
            <span className="text-xs font-bold text-slate-700">İstihdam Durumu:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.durum}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setFormData(prev => ({
                    ...prev,
                    durum: isChecked,
                    istenCikisTarihi: isChecked ? undefined : (prev.istenCikisTarihi || new Date().toISOString().split('T')[0])
                  }));
                }}
              />
              <div className="w-11 h-6 bg-red-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              <span className={`ml-2 text-xs font-bold ${formData.durum ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formData.durum ? "Aktif Çalışan" : "Pasif / Ayrıldı"}
              </span>
            </label>
          </div>

          {!formData.durum && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg space-y-1.5 animate-fade-in my-3">
              <label className="text-[10px] font-bold text-rose-800 uppercase block">İşten Çıkış / Ayrılma Tarihi *</label>
              <input
                required
                type="date"
                name="istenCikisTarihi"
                value={formData.istenCikisTarihi || ''}
                onChange={handleInputChange}
                className="w-full text-xs border border-rose-200 rounded-lg p-2 bg-white text-rose-950 focus:outline-none focus:border-rose-500 font-semibold"
              />
              <p className="text-[9px] text-rose-600 font-medium font-sans">
                * Belirtilen çıkış tarihinden sonraki günler yoklamalarda ve maaş hakediş cetvellerinde otomatik kilitlenir.
              </p>
            </div>
          )}
        </form>
      )}

        {/* Action button bar — panel altında sabit */}
        {(regMethod === 'manual' || isEditMode) && (
          <div className="shrink-0 p-4 border-t border-slate-100 flex gap-2 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-10">
            <button
              type="button"
              disabled={savingPersonel}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                void handleSave(ev as unknown as React.FormEvent);
              }}
              className="flex-1 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer text-white font-bold text-xs py-2.5 rounded-xl shadow-md disabled:opacity-60 disabled:cursor-wait"
            >
              {savingPersonel ? 'Kaydediliyor…' : isEditMode ? 'Verileri Güncelle' : 'Kaydı Tamamla'}
            </button>
            <button
              type="button"
              onClick={handleClearForm}
              className="bg-slate-500 hover:bg-slate-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition active:scale-[0.98]"
            >
              Formu Temizle
            </button>
          </div>
        )}
      </div>
      ) : (
      /* ═══ KADRO LİSTESİ — tam genişlik ═══ */
      <div className="w-full bg-white border border-orange-100 rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-[calc(100vh-10rem)]">

        {/* Search header bar */}
<div className="p-4 border-b border-slate-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-slate-550/10">
            <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
              <Users size={16} className="text-[#f59e0b]" />
              <div>
                <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
                  {kadroMode === 'ana_firma' ? 'Ana Firma Personel Kadrosu' : 'Taşeron Personel Kadrosu'}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Gösterilen: {visiblePersonel.length} / Toplam: {personeller.length} · {firmaFilterSummary}
                  {showOnlyActive
                    ? ' · Aktif'
                    : ` · Aktif ${groupedVisiblePersonel.aktifler.length} · Pasif ${groupedVisiblePersonel.pasifler.length}`}
                </p>
                {seramikListeGizli && (
                  <button
                    type="button"
                    onClick={() => {
                      setGorevGrupFilters([]);
                      setShowOnlyActive(false);
                    }}
                    className="block text-left text-[11px] text-amber-900 font-bold mt-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 hover:bg-amber-100 cursor-pointer"
                  >
                    Seramik Ekibi kadro duruyor: {seramikKadroOzet.aktif} aktif · {seramikKadroOzet.pasif} pasif
                    {' '}({seramikKadroOzet.toplam} kart). Görev filtresi listeden gizliyor — tıklayınca tüm kadro açılır.
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full lg:w-auto">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2 flex-wrap">
                {kadroMode === 'taseron' && (
                <div className="relative" ref={firmaFilterRef}>
                  <button
                    type="button"
                    onClick={() => setFirmaFilterOpen((v) => !v)}
                    className={`text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer max-w-full truncate inline-flex items-center gap-1.5 ${
                      firmaFilters.length > 0
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                    title="Taşeron firma seç (çoklu)"
                  >
                    <Building2 size={12} className="shrink-0" />
                    <span className="truncate">{firmaFilterSummary}</span>
                    {firmaFilters.length > 0 && (
                      <span className="shrink-0 bg-amber-600 text-white rounded-md px-1.5 py-0.5 text-[9px]">
                        {firmaFilters.length}
                      </span>
                    )}
                  </button>
                  {firmaFilterOpen && (
                    <div className="absolute left-0 top-full mt-1 z-40 w-72 max-h-72 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col">
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Taşeron firma
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setFirmaFilters([])}
                            className="text-[9px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            Tümü
                          </button>
                        </div>
                      </div>
                      <div className="overflow-y-auto p-2 space-y-0.5">
                        {firmaFilterOptions.map(({ key, label }) => {
                          const checked = firmaFilters.includes(key);
                          return (
                            <label
                              key={key}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-[11px] font-semibold ${
                                checked ? 'bg-amber-50 text-amber-950' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFirmaFilter(key)}
                                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                              />
                              <span className="truncate">{label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {firmaFilters.length > 0 && (
                        <div className="px-3 py-2 border-t border-slate-100 text-[9px] text-slate-500 font-medium">
                          Seçili taşeron firmalar · {filteredPersonel.length} kişi
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}

                {kadroMode === 'ana_firma' && (
                  <span className="text-[10px] font-bold px-3 py-2 rounded-xl border border-orange-200 bg-orange-50 text-orange-900">
                    {CANONICAL_ANA_FIRMA_ADI}
                  </span>
                )}

                {kadroMode === 'ana_firma' && (
                  <button
                    type="button"
                    onClick={handleOpenGorevListe}
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer bg-[#1e3a5f] text-white border-[#152a47] hover:bg-[#152a47]"
                    title="Aktif ana firma kadrosu — göreve göre gruplu liste + antetli rapor"
                  >
                    <ClipboardList size={14} />
                    Göreve Göre Kadro ({aktifAnaFirmaGorevToplam})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowOnlyActive((prev) => !prev)}
                  className={`text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer ${showOnlyActive ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  title="Sadece aktif personel göster"
                >
                  {showOnlyActive ? 'Sadece Aktifler' : 'Pasifler Dahil'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleExportListeExcel()}
                  disabled={exportingListe !== null || visiblePersonel.length === 0}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 disabled:opacity-50"
                  title="Ekrandaki filtrelenmiş listeyi Kibritçi logolu Excel olarak indir"
                >
                  {exportingListe === 'excel' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  Liste Excel
                </button>

                <button
                  type="button"
                  onClick={handleExportListeHtml}
                  disabled={exportingListe !== null || visiblePersonel.length === 0}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100 disabled:opacity-50"
                  title="Ekrandaki filtrelenmiş listeyi Kibritçi logolu HTML rapor olarak aç"
                >
                  <FileText size={12} />
                  Liste HTML
                </button>

                {kadroMode === 'taseron' && (
                <button
                  type="button"
                  onClick={openListeModal}
                  className="text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer bg-orange-600 text-white border-orange-700 hover:bg-orange-500"
                  title="Haftalık taşeron kadro listesi güncelle"
                >
                  Taşeron Liste Güncelle
                </button>
                )}

                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as 'NAME_ASC' | 'NAME_DESC' | 'DATE_NEWEST' | 'DATE_OLDEST')}
                  className="text-[10px] font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 cursor-pointer"
                  title="Sıralama seçeneği"
                >
                  <option value="NAME_ASC">Ada göre A → Z</option>
                  <option value="NAME_DESC">Ada göre Z → A</option>
                  <option value="DATE_NEWEST">İşe giriş: Yeni → Eski</option>
                  <option value="DATE_OLDEST">İşe giriş: Eski → Yeni</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 w-full">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                  Görev:
                </span>
                {gorevGrupFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setGorevGrupFilters([])}
                    className="text-[9px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Tümü
                  </button>
                )}
                {PERSONEL_GOREV_GRUP_ORDER.map((grup) => {
                  const count = gorevGrupCounts.get(grup) || 0;
                  if (count === 0 && !gorevGrupFilters.includes(grup)) return null;
                  const active = gorevGrupFilters.includes(grup);
                  return (
                    <button
                      key={grup}
                      type="button"
                      onClick={() => toggleGorevGrupFilter(grup)}
                      className={`text-[9px] font-bold px-2.5 py-1.5 rounded-xl border cursor-pointer transition ${personelGorevGrupChipClass(grup, active)}`}
                      title={`${personelGorevGrupLabel(grup)} grubunu filtrele (${count} kişi)`}
                    >
                      {personelGorevGrupLabel(grup)}
                      <span className="ml-1 opacity-80 tabular-nums">({count})</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full max-w-xs">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <span className="text-xs">🔍</span>
                </span>
                <input
                  type="text"
                  placeholder="İsim, soyisim veya görev ile filtrele..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-[10px] font-bold pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-slate-400"
                />
              </div>
            </div>
          </div>

        {/* Scrollable list grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visiblePersonel.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 space-y-2 px-6 text-center">
              <span className="text-3xl">👤</span>
              <p className="text-xs font-medium text-slate-600">
                Uygun personel kaydı bulunamadı.
              </p>
            </div>
          ) : (
            personelListSections.map((section) => (
              <div key={section.key} className="space-y-3">
                {section.title ? (
                  <div
                    className={`sticky top-0 z-[1] -mx-1 px-3 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wide ${
                      section.key === 'pasif'
                        ? 'bg-rose-50 text-rose-900 border-rose-200'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    }`}
                  >
                    {section.title}
                  </div>
                ) : null}
                {section.rows.map((p) => {
              const isActive = p.durum;
              const isSelected = selectedPersonel?.id === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPersonel(p)}
                  className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs transition duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-50 border-slate-900 shadow-sm'
                      : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.fotografUrl || (p as Personel & { fotograf_url?: string }).fotograf_url ? (
                        <img
                          src={p.fotografUrl || (p as Personel & { fotograf_url?: string }).fotograf_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-500">{p.ad[0]}{p.soyad[0]}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                        <span className="truncate min-w-0">{p.ad} {p.soyad}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          is_aktif_status(p.durum) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {is_aktif_status(p.durum) ? "Aktif" : "Pasif"}
                        </span>
                        {(p.firmaTipi === 'TASERON' || isTaseronPersonel(p)) && (
                          <>
                            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                              TAŞERON YOKLAMA ALINMAZ
                            </span>
                            {p.firmaAdi && (
                              <span className="text-[10px] bg-orange-50 text-orange-800 border border-orange-100 px-2 py-0.5 rounded-full font-bold truncate max-w-[180px]">
                                {p.firmaAdi}
                              </span>
                            )}
                          </>
                        )}
                        {p.onayDurumu === 'ONAY BEKLİYOR' && p.kaynak === 'KAMPCI' && (
                          <span className="text-[10px] bg-violet-50 text-violet-800 border border-violet-200 px-2 py-0.5 rounded-full font-bold">
                            Kampçı · Onay bekliyor
                          </span>
                        )}
                      </h4>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(personelKalite.issuesById.get(p.id) || [])
                          .filter(isKritikPersonelSorunu)
                          .map((sorun) => (
                          <span
                            key={`${p.id}-${sorun}`}
                            className={`text-[10px] border px-2 py-0.5 rounded-full font-bold ${sorunBadgeClass(sorun)}`}
                          >
                            {sorun === 'CIFT_ISIM'
                              ? `Çift İsim ×${personelKalite.duplicateNameGroups.find(([, list]) => list.some((x) => x.id === p.id))?.[1].length || 2}`
                              : PERSONEL_SORUN_LABEL[sorun]}
                          </span>
                        ))}
                        {(personelKalite.issuesById.get(p.id) || [])
                          .filter((s) => !isKritikPersonelSorunu(s))
                          .map((sorun) => (
                          <span
                            key={`${p.id}-soft-${sorun}`}
                            className={`text-[10px] border px-2 py-0.5 rounded-full font-bold ${sorunBadgeClass(sorun)}`}
                          >
                            {PERSONEL_SORUN_LABEL[sorun]}
                          </span>
                        ))}
                        {(personelSahaTagData.byId.has(p.id) || personelSahaTagData.normalizedNames.has(normalizeTurkishName(`${p.ad} ${p.soyad}`))) && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                            Saha Kayıtlı
                          </span>
                        )}
                        {personelCampData.activeCamp.has(p.id) ? (
                          <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                            Kamp Aktif
                          </span>
                        ) : personelCampData.anyCamp.has(p.id) ? (
                          <span className="text-[10px] bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full font-bold">
                            Kamp Geçmiş
                          </span>
                        ) : null}
                        {(() => {
                          const eksikler = getPersonelMissingDocs(p);
                          if (eksikler.length === 0) return null;
                          return (
                            <span
                              className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-bold"
                              title={eksikler.join(', ')}
                            >
                              Eksik: {eksikler.length}
                            </span>
                          );
                        })()}
                        {!is_aktif_status(p.durum) && p.istenCikisTarihi && (
                          <span className="bg-red-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-full font-bold">
                            Ayrılış: {p.istenCikisTarihi}
                          </span>
                        )}
                        {(p.personelGrubu === 'IDARI' || p.departman === 'İDARİ') && (
                          <span className="bg-sky-50 text-sky-800 border border-sky-100 px-2 py-0.5 rounded-full font-bold">
                            İdari · Yoklama yok
                          </span>
                        )}
                        {personelHasTakipEtiketi(p, 'ZER YAPI') && (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                            ZER YAPI
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">
                        TC: {p.tcNo || (isIdariPersonel(p) ? 'sonra girilecek' : '—')} · Görev: <span className="text-slate-600 font-bold">{displayPersonelGorev(p)}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-bold font-mono text-[9px]">
                          <span>📅 İşe Giriş:</span>
                          <span>{p.iseGirisTarihi || '-'}</span>
                        </span>
                        {!is_aktif_status(p.durum) && p.istenCikisTarihi && (
                          <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded font-black font-mono text-[9px]">
                            <span>🚫 İşten Çıkış:</span>
                            <span>{p.istenCikisTarihi}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Finance info */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-mono">Maas / Ücret</p>
                      <p className="font-bold text-emerald-600 font-mono text-xs">
                        ₺{p.maas.toLocaleString('tr-TR')} <span className="text-[9px] text-slate-400 font-normal">/ {p.ucretTipi}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 border-l pl-3 border-slate-100">
                      <button
                        title="Geçmiş Raporu"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowHistory(p);
                        }}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-900 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        <History size={13} />
                      </button>

                      <button
                        title="Bilgileri Düzenle"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPersonel(p);
                        }}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        <Edit3 size={13} />
                      </button>

                      {is_aktif_status(p.durum) && (
                        <button
                          title="İşten Çıkar"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissDateStr(new Date().toISOString().split('T')[0]);
                            setDismissingPersonel(p);
                          }}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition active:scale-95 flex items-center justify-center"
                        >
                          <UserX size={13} />
                        </button>
                      )}

                      <button
                        title="Sicil Sil"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            ))
          )}
        </div>
      </div>
      )}
      </div>

      {/* İŞTEN ÇIKARMA TARİH SEÇİM MODALİ */}
      {dismissingPersonel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl border border-slate-150 p-6 w-[400px] max-w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-rose-600">
              <UserX size={20} />
              <h3 className="font-display font-bold text-sm uppercase tracking-wider">Personel İşten Çıkarma</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>{dismissingPersonel.ad} {dismissingPersonel.soyad}</strong> isimli personelin işten çıkış kaydı yapılacaktır. Lütfen ayrılma tarihini belirleyin:
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">İşten Çıkış/Ayrılma Tarihi *</label>
              <input
                type="date"
                required
                value={dismissDateStr}
                onChange={(e) => setDismissDateStr(e.target.value)}
                className="w-full text-xs font-semibold border border-rose-200 rounded-lg p-2.5 bg-slate-50 text-rose-950 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!dismissDateStr) {
                    alert("Lütfen geçerli bir tarih seçin.");
                    return;
                  }
                  setPersoneller(prev => prev.map(p => {
                    if (p.id === dismissingPersonel.id) {
                      return {
                        ...p,
                        durum: false,
                        istenCikisTarihi: dismissDateStr
                      };
                    }
                    return p;
                  }));

                  if (formData && 'id' in formData && formData.id === dismissingPersonel.id) {
                    setFormData(prev => ({
                      ...prev,
                      durum: false,
                      istenCikisTarihi: dismissDateStr
                    }));
                  }

                  alert(
                    `${dismissingPersonel.ad} ${dismissingPersonel.soyad} işten çıkış tarihi (${dismissDateStr}) kaydedildi; durum Pasif.\n\nAktif kamp oda kaydı varsa otomatik tahliye edilir.`
                  );
                  setDismissingPersonel(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-xl transition cursor-pointer select-none"
              >
                KAYDET
              </button>
              <button
                type="button"
                onClick={() => setDismissingPersonel(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer select-none"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GEÇMİŞ RAPORU MODALİ */}
      {showHistoryModal && historyPersonel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-150 p-6 w-[500px] max-w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900">
                <History size={20} />
                <h3 className="font-display font-bold text-sm uppercase tracking-wider">Personel Geçmiş Raporu</h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs">
              <p><strong>Ad Soyad:</strong> {historyPersonel.ad} {historyPersonel.soyad}</p>
              <p><strong>TC No:</strong> {historyPersonel.tcNo}</p>
              <p><strong>Görev:</strong> {historyPersonel.gorev}</p>
              <p><strong>Departman:</strong> {historyPersonel.departman}</p>
              <p><strong>İşe Giriş:</strong> {historyPersonel.iseGirisTarihi || '-'}</p>
              <p><strong>Durum:</strong> {historyPersonel.durum ? 'Aktif' : 'Pasif'} {historyPersonel.istenCikisTarihi ? `(Çıkış: ${historyPersonel.istenCikisTarihi})` : ''}</p>
              <p><strong>Firma:</strong> {historyPersonel.firmaAdi || CANONICAL_ANA_FIRMA_ADI} {historyPersonel.firmaTipi === 'TASERON' ? '(Taşeron)' : '(Ana Firma)'}</p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İlişkili İşlemler</p>
              <div className="space-y-1 text-[10px] text-slate-500">
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-slate-600" />
                  <span>İzin Dilekçeleri (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-amber-500" />
                  <span>Araç KM Girişleri (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-emerald-500" />
                  <span>Kamp Kayıtları (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-rose-500" />
                  <span>Maaş Hakedişleri (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={generateHistoryReport} className="flex-1 bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1">
                <Download size={12} /> Raporu İndir
              </button>
              <button onClick={() => setShowHistoryModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {listeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-orange-800">
              <RefreshCw size={18} />
              <h3 className="font-display font-bold text-sm uppercase tracking-wide">
                Taşeron Personel Liste Güncelle
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Haftalık (6–7 gün) kadro değişiminde firma seçip güncel listeyi yapıştırın.
              Listedekiler Personel Yönetimi’nde aktif kalır / eklenir; listede olmayan aynı firma
              personeli pasife alınır. IBAN ve maaş gerekmez — yoklama alınmaz, maaş hesaplanmaz.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Taşeron Firma</label>
                <select
                  value={listeFirmaCariId}
                  onChange={(e) => {
                    setListeFirmaCariId(e.target.value);
                    setListePreview(null);
                  }}
                  className="w-full text-xs border border-slate-200 rounded-xl mt-1 p-2.5 bg-slate-50"
                >
                  <option value="">Firma seçin…</option>
                  {taseronCariList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.unvan}
                    </option>
                  ))}
                  <option value={TASERON_MANUEL_KEY}>Elle yaz (yeni / manuel)</option>
                </select>
                {listeFirmaCariId === TASERON_MANUEL_KEY && (
                  <input
                    type="text"
                    value={listeManuelFirma}
                    onChange={(e) => {
                      setListeManuelFirma(e.target.value);
                      setListePreview(null);
                    }}
                    placeholder="Taşeron firma adı"
                    className="w-full text-xs border border-amber-200 rounded-xl mt-2 p-2.5 bg-amber-50"
                  />
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Dönem başlangıç</label>
                <input
                  type="date"
                  value={listeDonemBas}
                  onChange={(e) => setListeDonemBas(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl mt-1 p-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Dönem bitiş / çıkış</label>
                <input
                  type="date"
                  value={listeDonemBit}
                  onChange={(e) => setListeDonemBit(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl mt-1 p-2 bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                Güncel personel listesi (satır satır)
              </label>
              <textarea
                value={listeText}
                onChange={(e) => {
                  setListeText(e.target.value);
                  setListePreview(null);
                }}
                rows={10}
                placeholder={'AHMET YILMAZ\nMEHMET DEMİR\t12345678901\nAYŞE KAYA;12345678901\n…'}
                className="w-full text-xs font-mono border border-slate-200 rounded-xl mt-1 p-3 bg-slate-50 resize-y"
              />
              <p className="text-[9px] text-slate-400 mt-1">
                Biçim: Ad Soyad · veya Ad Soyad + TC (sekme / noktalı virgül). Excel’den yapıştırabilirsiniz.
              </p>
            </div>

            {listeParseErrors.length > 0 && (
              <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 space-y-0.5 max-h-24 overflow-y-auto">
                {listeParseErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}

            {listePreview && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="font-bold text-emerald-800">Yeni</p>
                  <p className="text-lg font-black text-emerald-700">{listePreview.created.length}</p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                  <p className="font-bold text-sky-800">Yeniden aktif</p>
                  <p className="text-lg font-black text-sky-700">{listePreview.reactivated.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-bold text-slate-700">Güncelleme</p>
                  <p className="text-lg font-black text-slate-800">{listePreview.updated.length}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                  <p className="font-bold text-rose-800">Pasife</p>
                  <p className="text-lg font-black text-rose-700">{listePreview.deactivated.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="font-bold text-slate-600">Aynı</p>
                  <p className="text-lg font-black text-slate-700">{listePreview.kept.length}</p>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
                  <p className="font-bold text-orange-800">Yazılacak</p>
                  <p className="text-lg font-black text-orange-700">{listePreview.toSave.length}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleListeOnizle}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs"
              >
                Önizle
              </button>
              <button
                type="button"
                disabled={listeSaving}
                onClick={() => void handleListeUygula()}
                className="flex-1 bg-orange-700 hover:bg-orange-800 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-xs inline-flex items-center justify-center gap-1.5"
              >
                {listeSaving ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
                {listeSaving ? 'Kaydediliyor…' : 'Listeyi Uygula'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setListeModalOpen(false);
                  setListePreview(null);
                }}
                className="px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2.5 rounded-xl text-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {taseronResolveModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            {taseronResolveModal.kind === 'merge' ? (
              <>
                <div className="flex items-center gap-2 text-amber-700">
                  <Building2 size={18} />
                  <h3 className="font-display font-bold text-xs uppercase">Yakın İsimli Taşeron Kayıtları</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Elle yazdığınız <strong>&quot;{taseronResolveModal.manualName}&quot;</strong> için veritabanında benzer taşeron cari kartları bulundu.
                  Mevcut kayıtla birleştirmek ister misiniz?
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {taseronResolveModal.matches?.map((cari) => (
                    <button
                      key={cari.id}
                      type="button"
                      onClick={() => handleMergeTaseronCari(cari)}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition"
                    >
                      <p className="text-xs font-bold text-slate-900">{cari.unvan}</p>
                      <p className="text-[10px] text-slate-500">{cari.kod} · {cari.durum || 'AKTIF'}</p>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setTaseronResolveModal({
                      kind: 'create',
                      manualName: taseronResolveModal.manualName,
                      pending: taseronResolveModal.pending,
                    })}
                    className="flex-1 bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-xs"
                  >
                    Yeni Kart Aç
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaseronResolveModal(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs"
                  >
                    Vazgeç
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-slate-800">
                  <Building2 size={18} />
                  <h3 className="font-display font-bold text-xs uppercase">Yeni Taşeron Cari Kartı</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>&quot;{taseronResolveModal.manualName}&quot;</strong> veritabanında taşeron cari kartı olarak bulunamadı.
                  Bu firmayı yeni bir taşeron cari kartı olarak açmak ister misiniz?
                </p>
                <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  Evet derseniz yeni cari kartın geçmişine personel kaydı işlenir. Hayır derseniz personel yalnızca elle yazılan firma adıyla kaydedilir.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSkipTaseronCariCreate}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs"
                  >
                    Hayır, Geç
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTaseronCari}
                    className="flex-1 bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-xs"
                  >
                    Evet, Kart Aç
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {gorevListeOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-[#1e3a5f] uppercase tracking-wide">
                  {CANONICAL_ANA_FIRMA_ADI} — Aktif Kadro (Göreve Göre)
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {aktifAnaFirmaGorevToplam} kişi · {aktifAnaFirmaGorevGroups.length} görev grubu · taşeron hariç
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  <strong>Görev</strong> = program yoklama ünvanı · <strong>Nitelik</strong> = SGK meslek (kart)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportGorevListeExcel()}
                  disabled={gorevListeExporting}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 disabled:opacity-50"
                >
                  {gorevListeExporting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Antetli Excel
                </button>
                <button
                  type="button"
                  onClick={handlePrintGorevListe}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer bg-[#1e3a5f] text-white border-[#152a47] hover:bg-[#152a47]"
                >
                  <FileText size={14} />
                  Antetli Yazdır / PDF
                </button>
                <button
                  type="button"
                  onClick={() => setGorevListeOpen(false)}
                  className="text-[10px] font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {aktifAnaFirmaGorevGroups.map((grup) => (
                <section key={grup.gorev} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-[#1e3a5f] text-white px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wide">{grup.gorev}</span>
                    <span className="text-[10px] font-bold bg-white/15 px-2 py-0.5 rounded-full">
                      {grup.personeller.length} kişi
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 uppercase text-[9px]">
                          <th className="px-2 py-1.5 text-center w-8">#</th>
                          <th className="px-2 py-1.5 text-left">Ad Soyad</th>
                          <th className="px-2 py-1.5 text-left">T.C.</th>
                          <th className="px-2 py-1.5 text-left">Görev</th>
                          <th className="px-2 py-1.5 text-left">Nitelik (SGK)</th>
                          <th className="px-2 py-1.5 text-left">İşe Giriş</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grup.personeller.map((p, idx) => (
                          <tr key={p.id} className="border-t border-slate-100 even:bg-slate-50/60">
                            <td className="px-2 py-1.5 text-center text-slate-500">{idx + 1}</td>
                            <td className="px-2 py-1.5 font-semibold text-slate-900">
                              {p.ad} {p.soyad}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-[10px]">{p.tcNo || '—'}</td>
                            <td className="px-2 py-1.5 font-bold text-[#1e3a5f]">{grup.gorev}</td>
                            <td className="px-2 py-1.5 text-slate-600">
                              {displayPersonelNitelik(p) || '—'}
                            </td>
                            <td className="px-2 py-1.5">{p.iseGirisTarihi || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );

  function formData_durum_get(val: any) {
    return formData.durum;
  }

  function is_aktif_status(val: any) {
    return val === true || val === 1 || String(val).toLowerCase() === 'true';
  }
};
export default PersonelScreen;
