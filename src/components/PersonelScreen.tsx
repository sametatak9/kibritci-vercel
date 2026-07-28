import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, Trash2, CreditCard as Edit3, Camera, Search, ShieldCheck, Mail, Phone, MapPin, DollarSign, UserX, FileText, CloudUpload as UploadCloud, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Loader as Loader2, Building2, History, Download } from 'lucide-react';
import { CariKart, CariKartIslem, Personel } from '../types/erp';
import { fetchApiJson } from '../lib/apiClient';
import { compressImage } from '../lib/imageCompress';
import { exportPersonelRows } from '../lib/reportExport';
import { saveDocument } from '../lib/firebase';
import { kibritciLogoHtml } from '../lib/kibritciBrand';
import { findNearDuplicateCariNames, normalizeCardName } from '../lib/duplicateNameUtils';
import {
  exportAnaFirmaPersonelExcel,
  exportSeciliPersonelExcel,
  exportTaseronPersonelExcel,
  exportTumFirmalarPersonelExcel,
} from '../lib/taseronPersonelExcelExport';
import {
  AKVIZYON_GOREV,
  displayPersonelGorev,
  isAkvizyonFirmaAdi,
  personelNameKey,
  resolveAkvizyonGorev,
} from '../lib/guvenlikHelpers';
import { CANONICAL_ANA_FIRMA_ADI, isTaseronPersonel } from '../lib/yoklamaUtils';
import { getPersonelMissingDocs } from '../lib/personelMissingDocs';
import { listOdemeEngelleri, validateIBAN, validateTC } from '../lib/personelOdemeUtils';

const MAX_PERSONEL_INLINE_MEDIA = 120_000;

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
  cariKartlar?: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
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
  cariKartlar = [],
  setCariKartlar,
  setCariIslemGecmisi,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  /** Boş = tüm firmalar; 'ANA_FIRMA' veya taşeron firma adı */
  const [firmaFilters, setFirmaFilters] = useState<string[]>([]);
  const [firmaFilterOpen, setFirmaFilterOpen] = useState(false);
  const firmaFilterRef = useRef<HTMLDivElement | null>(null);
  const [odemeFilter, setOdemeFilter] = useState<'ALL' | 'TC' | 'IBAN' | 'ENGEL'>('ALL');
  const [selectedPersonel, setSelectedPersonel] = useState<Personel | null>(null);
  const [dismissingPersonel, setDismissingPersonel] = useState<Personel | null>(null);
  const [dismissDateStr, setDismissDateStr] = useState<string>("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPersonel, setHistoryPersonel] = useState<Personel | null>(null);
  const [exportFormat, setExportFormat] = useState<'html' | 'csv'>('csv');
  const [gorevReportMode, setGorevReportMode] = useState<'SIRALA' | 'AYRI_RAPOR'>('SIRALA');
  const [showOnlyActive, setShowOnlyActive] = useState(false);

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
          userFriendlyMsg = 'Sunucu zaman aşımına uğradı (504). Çözüm: (1) Belgenin fotoğrafını (PDF yerine JPG) yükleyin, (2) https://kibritci-erp.onrender.com adresini kullanın, (3) Render\'da GEMINI_API_KEY tanımlı olduğundan emin olun.';
        } else if (userFriendlyMsg.includes('kibritci-web-1') || userFriendlyMsg.includes('boş yanıt') || userFriendlyMsg.includes('404')) {
          userFriendlyMsg = 'Yapay zeka sunucusuna ulaşılamadı. Lütfen siteyi https://kibritci-erp.onrender.com adresinden açın (eski kibritci-web-1 adresi artık çalışmıyor).';
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
  };

  const [formData, setFormData] = useState<Omit<Personel, 'id'> | Personel>(emptyForm);
  const [taseronKaynak, setTaseronKaynak] = useState('');
  const [manuelTaseronAdi, setManuelTaseronAdi] = useState('');
  const [taseronResolveModal, setTaseronResolveModal] = useState<TaseronResolveModalState>(null);

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

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleSelectPersonel = (p: Personel) => {
    const corrected: Personel = {
      ...p,
      id: p.id, // Firestore doc id korunur
      gorev: resolveAkvizyonGorev(p.firmaAdi, p.gorev),
    };
    setSelectedPersonel(corrected);
    setFormData(corrected);
    setRegMethod('manual');
    if (p.firmaTipi === 'TASERON') {
      const match = taseronCariList.find(
        (c) =>
          c.unvan === p.firmaAdi ||
          normalizeCardName(c.unvan) === normalizeCardName(p.firmaAdi || '')
      );
      if (match) {
        setTaseronKaynak(match.id);
        setManuelTaseronAdi('');
      } else {
        setTaseronKaynak(TASERON_MANUEL_KEY);
        setManuelTaseronAdi(p.firmaAdi || '');
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
    if (key === 'ISCI' || key === 'DUZISCI') return 'DÜZ İŞÇİ';
    return raw || 'DÜZ İŞÇİ';
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
      islemDetay: `${personel.ad} ${personel.soyad} · ${personel.gorev || 'Görev yok'} · TC ${personel.tcNo}${note ? ` · ${note}` : ''}`,
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
    const withRules = {
      ...normalizedPayload,
      gorev: normalizePersonelGorev(
        resolveAkvizyonGorev(normalizedPayload.firmaAdi, normalizedPayload.gorev)
      ),
      firmaTipi: isAkvizyonFirmaAdi(normalizedPayload.firmaAdi)
        ? ('TASERON' as const)
        : normalizedPayload.firmaTipi,
    };

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
        id: `p_${Date.now()}`,
      };
    }
    const savingAsEdit = Boolean(resolvedEditId);

    try {
      // Doğrudan Firestore’a yaz — büyük görselleri tekrar gönderme (timeout/rollback engeli)
      const prev = savingAsEdit ? personeller.find((p) => p.id === savedPersonel.id) : undefined;
      const lean = leanPersonelForFirestore(savedPersonel, prev);
      await saveDocument('personeller', lean as Personel);
    } catch (err: any) {
      console.error(err);
      alert(
        'Personel kaydı veritabanına yazılamadı: ' +
          (err?.message === 'FIRESTORE_TIMEOUT'
            ? 'zaman aşımı (büyük fotoğraf kaydı engellemiş olabilir)'
            : err?.message || 'bilinmeyen hata')
      );
      return;
    }

    setPersoneller((prev) => {
      if (savingAsEdit) {
        const exists = prev.some((p) => p.id === savedPersonel.id);
        if (exists) {
          return prev.map((p) =>
            p.id === savedPersonel.id ? { ...p, ...savedPersonel, id: savedPersonel.id } : p
          );
        }
        // Seçili kaydın id'si listedekiyle farklıysa (eski bozuk id alanı) seçiliyi güncelle
        if (selectedPersonel?.id) {
          return prev.map((p) =>
            p.id === selectedPersonel.id ? { ...savedPersonel, id: selectedPersonel.id } : p
          );
        }
        return prev;
      }
      return [savedPersonel, ...prev];
    });
    alert(savingAsEdit ? 'Personel bilgileri başarıyla güncellendi.' : 'Yeni personel başarıyla kaydedildi.');

    if (savedPersonel.firmaTipi === 'TASERON' && taseronCariId) {
      appendTaseronCariHistory(taseronCariId, savedPersonel, savingAsEdit ? 'edit' : 'create', historyNote);
    }

    setTaseronResolveModal(null);
    handleClearForm();
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ad || !formData.soyad || !formData.tcNo) {
      alert("Lütfen en az Ad, Soyad ve TC Kimlik No alanlarını doldurun.");
      return;
    }

    const normalizedTc = String(formData.tcNo || '').trim();
    if (!validateTC(normalizedTc)) {
      alert("TC Kimlik No tam 11 haneli ve sadece rakamlardan oluşmalıdır!");
      return;
    }

    const editingId =
      (selectedPersonel?.id && String(selectedPersonel.id).trim()) ||
      ('id' in formData && formData.id ? String(formData.id).trim() : '');
    const isEdit = Boolean(editingId);

    const duplicateTc = personeller.find((p) => {
      const existingTc = String(p.tcNo || '').trim();
      if (isEdit && p.id === editingId) return false;
      return existingTc.length > 0 && existingTc === normalizedTc;
    });
    if (duplicateTc) {
      alert(`Bu TC kimlik numarası zaten kayıtlı: ${duplicateTc.ad} ${duplicateTc.soyad}`);
      return;
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
    if (isAnaFirmaAktif && !validateIBAN(finalIban)) {
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
          gorev: normalizePersonelGorev(
            resolveAkvizyonGorev(firmaFields.firmaAdi, (formData as any).gorev)
          ),
          firmaTipi: firmaFields.firmaTipi,
          firmaAdi: firmaFields.firmaAdi,
        }
      : {
          ...formData,
          tcNo: normalizedTc,
          ibanNo: finalIban,
          gorev: normalizePersonelGorev(
            resolveAkvizyonGorev(firmaFields.firmaAdi, (formData as any).gorev)
          ),
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
  };

  const handleDelete = (id: string) => {
    const target = personeller.find((p) => p.id === id);
    if (!target) return;

    const nameKey = personelNameKey(target);
    const dupes = personeller.filter((p) => personelNameKey(p) === nameKey);
    const toDelete = dupes.length > 1 ? dupes : [target];

    const msg =
      dupes.length > 1
        ? `"${target.ad} ${target.soyad}" için ${dupes.length} mükerrer kayıt bulundu. Hepsi kalıcı silinecek ve kamptaki oda kayıtları da tahliye edilecek. Devam?`
        : `"${target.ad} ${target.soyad}" kalıcı silinsin mi?\n(Kamp oda yerleşimi varsa otomatik tahliye edilir.)`;

    if (!confirm(msg)) return;

    const deleteIds = new Set(toDelete.map((p) => p.id));
    setPersoneller((prev) => prev.filter((p) => !deleteIds.has(p.id)));
    onPersonelDeleted?.(toDelete);

    if (selectedPersonel && deleteIds.has(selectedPersonel.id)) {
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
    const map = new Map<string, string>();
    personeller.forEach((p) => {
      if (p.firmaTipi === 'TASERON' || isAkvizyonFirmaAdi(p.firmaAdi)) {
        const ad = (p.firmaAdi || 'Taşeron').trim();
        if (ad) map.set(ad, ad);
      } else {
        map.set('ANA_FIRMA', `${CANONICAL_ANA_FIRMA_ADI} (Ana Firma)`);
      }
    });
    // Ana firma her zaman listede olsun (henüz personel yoksa bile seçilebilsin)
    if (!map.has('ANA_FIRMA')) {
      map.set('ANA_FIRMA', `${CANONICAL_ANA_FIRMA_ADI} (Ana Firma)`);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'ANA_FIRMA') return -1;
      if (b[0] === 'ANA_FIRMA') return 1;
      return a[1].localeCompare(b[1], 'tr', { sensitivity: 'base' });
    });
  }, [personeller]);

  const matchesFirmaFilter = (p: Personel, filters: string[]) => {
    if (!filters.length) return true;
    return filters.some((key) => {
      if (key === 'ANA_FIRMA') {
        return p.firmaTipi !== 'TASERON' && !isAkvizyonFirmaAdi(p.firmaAdi);
      }
      return (p.firmaAdi || '').trim() === key;
    });
  };

  const toggleFirmaFilter = (key: string) => {
    setFirmaFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const firmaFilterSummary = useMemo(() => {
    if (firmaFilters.length === 0) return 'Tüm Firmalar';
    if (firmaFilters.length === 1) {
      const hit = firmaFilterOptions.find(([k]) => k === firmaFilters[0]);
      return hit?.[1] || firmaFilters[0];
    }
    return `${firmaFilters.length} firma seçili`;
  }, [firmaFilters, firmaFilterOptions]);

  const odemeEngelIds = useMemo(() => {
    return new Set(listOdemeEngelleri(personeller).map((e) => e.personel.id));
  }, [personeller]);

  const filteredPersonel = personeller.filter((p) => {
    // Kampçının eklediği, yönetici onayı bekleyen personeller listede görünmez (Onay Havuzu'nda onaylanır)
    if (p.onayDurumu === 'ONAY BEKLİYOR' && p.kaynak === 'KAMPCI') return false;
    if (showOnlyActive && !is_aktif_status(p.durum)) return false;
    if (!matchesFirmaFilter(p, firmaFilters)) return false;
    if (odemeFilter === 'TC' && validateTC(p.tcNo || '')) return false;
    if (odemeFilter === 'IBAN' && validateIBAN(p.ibanNo || '')) return false;
    if (odemeFilter === 'ENGEL') {
      if (isTaseronPersonel(p) || !odemeEngelIds.has(p.id)) return false;
    }
    const term = searchTerm.toLowerCase();
    const fullName = `${p.ad} ${p.soyad}`.toLowerCase();
    return (
      fullName.includes(term) ||
      p.tcNo.includes(term) ||
      displayPersonelGorev(p).toLowerCase().includes(term)
    );
  });

  const handleShowHistory = (p: Personel) => {
    setHistoryPersonel(p);
    setShowHistoryModal(true);
  };

  const exportFilterLabel = useMemo(() => {
    if (firmaFilters.length === 0) return 'Tumu';
    if (firmaFilters.length === 1) {
      if (firmaFilters[0] === 'ANA_FIRMA') return 'Kibritci_Insaat';
      return firmaFilters[0].replace(/\s+/g, '_');
    }
    return `${firmaFilters.length}_Firma`;
  }, [firmaFilters]);

  const exportFilteredPersonel = () => {
    if (filteredPersonel.length === 0) {
      alert('Dışa aktarılacak personel bulunamadı. Filtreleri kontrol edin.');
      return;
    }
    const cols = [
      { key: 'ad', label: 'Ad' },
      { key: 'soyad', label: 'Soyad' },
      { key: 'tcNo', label: 'TC No' },
      { key: 'gorev', label: 'Görev' },
      { key: 'telefonNo', label: 'Telefon' },
      { key: 'iseGirisTarihi', label: 'İşe Giriş' },
      { key: 'sgkDurumu', label: 'SGK' },
      { key: 'firmaAdi', label: 'Firma' },
    ];
    const activeSuffix = showOnlyActive ? '_Aktif' : '';

    const gorevKeyOf = (p: Personel) => displayPersonelGorev(p);
    const safeFileKey = (raw: string) =>
      String(raw || '')
        .trim()
        .replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'GOREV';

    const rowOf = (p: Personel) => ({
      ad: p.ad,
      soyad: p.soyad,
      tcNo: p.tcNo,
      gorev: gorevKeyOf(p),
      telefonNo: p.telefonNo,
      iseGirisTarihi: p.iseGirisTarihi,
      sgkDurumu: p.sgkDurumu,
      firmaAdi: p.firmaAdi || '',
    });

    if (gorevReportMode === 'AYRI_RAPOR') {
      const byGorev = new Map<string, Personel[]>();
      for (const p of filteredPersonel) {
        const key = gorevKeyOf(p);
        const list = byGorev.get(key) || [];
        list.push(p);
        byGorev.set(key, list);
      }

      const gorevKeys = Array.from(byGorev.keys()).sort((a, b) =>
        a.localeCompare(b, 'tr', { sensitivity: 'base' })
      );

      let total = 0;
      for (const key of gorevKeys) {
        const group = (byGorev.get(key) || [])
          .slice()
          .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));

        const rows = group.map(rowOf);
        total += rows.length;

        exportPersonelRows(
          rows,
          cols,
          `Kibritci_Personel_${exportFilterLabel}${activeSuffix}_${safeFileKey(key)}_${Date.now()}`,
          exportFormat
        );
      }

      alert(`${total} personel için ${gorevKeys.length} ayrı rapor indirildi.`);
      return;
    }

    // SIRALA: tek dosya, önce göreve sonra isme göre
    const rows = filteredPersonel
      .slice()
      .sort((a, b) => {
        const ga = gorevKeyOf(a);
        const gb = gorevKeyOf(b);
        const d = ga.localeCompare(gb, 'tr', { sensitivity: 'base' });
        if (d !== 0) return d;
        return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr');
      })
      .map(rowOf);

    exportPersonelRows(
      rows,
      cols,
      `Kibritci_Personel_${exportFilterLabel}${activeSuffix}_GOREV_SIRALI_${Date.now()}`,
      exportFormat
    );
  };

  const handleExportAllTaseronExcel = async () => {
    try {
      const count = await exportTaseronPersonelExcel({
        personeller,
        onlyActive: showOnlyActive,
      });
      alert(`${count} taşeron personeli Excel olarak indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    }
  };

  const handleExportTumFirmalarExcel = async () => {
    try {
      const count = await exportTumFirmalarPersonelExcel({
        personeller,
        onlyActive: showOnlyActive,
      });
      alert(`${count} personel (tüm firmalar) Excel olarak indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    }
  };

  const handleExportAnaFirmaExcel = async () => {
    try {
      const count = await exportAnaFirmaPersonelExcel({
        personeller,
        onlyActive: showOnlyActive,
      });
      alert(`${count} ana firma personeli Excel olarak indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    }
  };

  const handleExportSeciliExcel = async () => {
    if (filteredPersonel.length === 0) {
      alert('Dışa aktarılacak personel bulunamadı. Filtreleri kontrol edin.');
      return;
    }
    try {
      const gorevKeyOf = (p: Personel) => displayPersonelGorev(p);
      const safeFileKey = (raw: string) =>
        String(raw || '')
          .trim()
          .replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'GOREV';

      if (gorevReportMode === 'AYRI_RAPOR') {
        const byGorev = new Map<string, Personel[]>();
        for (const p of filteredPersonel) {
          const key = gorevKeyOf(p);
          const list = byGorev.get(key) || [];
          list.push(p);
          byGorev.set(key, list);
        }

        const gorevKeys = Array.from(byGorev.keys()).sort((a, b) =>
          a.localeCompare(b, 'tr', { sensitivity: 'base' })
        );

        let total = 0;
        for (const key of gorevKeys) {
          const group = (byGorev.get(key) || [])
            .slice()
            .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));

          const count = await exportSeciliPersonelExcel({
            rows: group,
            onlyActive: showOnlyActive,
            title: `${CANONICAL_ANA_FIRMA_ADI} — ${firmaFilterSummary} Personel Listesi · ${key}`,
            fileNamePrefix: `Secili_${exportFilterLabel}_${safeFileKey(key)}`,
          });
          total += count;
        }

        alert(`${total} personel için ${gorevKeys.length} ayrı Excel raporu indirildi.`);
        return;
      }

      const rows = filteredPersonel
        .slice()
        .sort((a, b) => {
          const ga = gorevKeyOf(a);
          const gb = gorevKeyOf(b);
          const d = ga.localeCompare(gb, 'tr', { sensitivity: 'base' });
          if (d !== 0) return d;
          return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr');
        });

      const count = await exportSeciliPersonelExcel({
        rows,
        onlyActive: showOnlyActive,
        title: `${CANONICAL_ANA_FIRMA_ADI} — ${firmaFilterSummary} Personel Listesi (Göreve göre sırala)`,
        fileNamePrefix: `Secili_${exportFilterLabel}_GOREV_SIRALI`,
      });
      alert(`${count} personel (seçili filtre) Excel olarak indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    }
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
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col lg:flex-row font-sans gap-6 select-none bg-slate-50/50">

      {/* SOLID 40% LEFT PANEL: Dynamic Drawer for Create/Edit */}
      <div className="w-[430px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm max-h-[calc(100vh-3rem)] lg:sticky lg:top-6 lg:self-start">

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
                <label className="text-[10px] font-bold text-slate-500 uppercase">TC Kimlik No *</label>
                <input
                  type="text"
                  name="tcNo"
                  maxLength={11}
                  value={formData.tcNo}
                  onChange={handleInputChange}
                  className="w-full text-xs font-medium border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50  transition duration-150"
                  placeholder="11 Hane"
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
              <p className="text-[9px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5">
                Taşeron personel yoklama listesine dahil edilmez; yalnızca ana firma kadrosu yoklamaya girer.
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
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Görev/Ünvan</label>
                <input
                  type="text"
                  name="gorev"
                  list="personel-gorev-presets"
                  value={formData.gorev}
                  onChange={handleInputChange}
                  readOnly={isAkvizyonFirmaAdi(formData.firmaAdi)}
                  className={`w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 ${
                    isAkvizyonFirmaAdi(formData.firmaAdi)
                      ? 'bg-indigo-50 text-indigo-900 font-bold'
                      : 'bg-slate-50'
                  }`}
                  placeholder="Listeden seçin veya elle yazın"
                />
                <datalist id="personel-gorev-presets">
                  {GOREV_PRESETS.map((gorev) => (
                    <option key={gorev} value={gorev} />
                  ))}
                </datalist>
                <p className="text-[8px] text-slate-400 mt-1">
                  {isAkvizyonFirmaAdi(formData.firmaAdi)
                    ? 'Akvizyon personeli için görev sabittir: GÜVENLİK'
                    : 'Önerilen görevler listeden seçilebilir; özel ünvan da yazılabilir.'}
                </p>
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
                <label className="text-[10px] font-bold text-slate-500 uppercase">Maaş (Brüt) *</label>
                <input
                  type="number"
                  name="maas"
                  value={formData.maas}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="30000"
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
              <label className="text-[10px] font-bold text-slate-500 uppercase">IBAN Numarası</label>
              <input
                type="text"
                name="ibanNo"
                value={formData.ibanNo}
                onChange={handleInputChange}
                className="w-full text-xs font-mono font-medium border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                placeholder="TR000..."
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
              onClick={handleSave}
              className="flex-1 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer text-white font-bold text-xs py-2.5 rounded-xl shadow-md"
            >
              { isEditMode ? "Verileri Güncelle" : "Kaydı Tamamla" }
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

      {/* SOLID 60% RIGHT PANEL: Quick filter table list */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Search header bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-550/10">
          <div className="flex items-center space-x-2">
            <Users size={16} className="text-[#f59e0b]" />
            <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest col-span-2">
              Kayıtlı Personel Kadrosu
            </h4>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative" ref={firmaFilterRef}>
              <button
                type="button"
                onClick={() => setFirmaFilterOpen((v) => !v)}
                className={`text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer max-w-[240px] truncate inline-flex items-center gap-1.5 ${
                  firmaFilters.length > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="Firma seç (çoklu)"
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
                      Firma seç
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFirmaFilters([])}
                        className="text-[9px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Tümü
                      </button>
                      <button
                        type="button"
                        onClick={() => setFirmaFilters(['ANA_FIRMA'])}
                        className="text-[9px] font-bold px-2 py-1 rounded-lg bg-slate-900 text-white hover:bg-black cursor-pointer"
                      >
                        Sadece Ana Firma
                      </button>
                    </div>
                  </div>
                  <div className="overflow-y-auto p-2 space-y-0.5">
                    {firmaFilterOptions.map(([key, label]) => {
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
                      Seçili firmaların personeli listeleniyor · {filteredPersonel.length} kişi
                    </div>
                  )}
                </div>
              )}
            </div>
            <select
              value={odemeFilter}
              onChange={(e) => setOdemeFilter(e.target.value as 'ALL' | 'TC' | 'IBAN' | 'ENGEL')}
              className="text-[10px] font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 cursor-pointer"
              title="Eksik TC / IBAN / Ödeme engeli"
            >
              <option value="ALL">Ödeme: Tümü</option>
              <option value="TC">Eksik TC</option>
              <option value="IBAN">Eksik/Geçersiz IBAN</option>
              <option value="ENGEL">Ödeme Engeli (Ana Firma)</option>
            </select>
            <button
              type="button"
              onClick={() => setShowOnlyActive((prev) => !prev)}
              className={`text-[10px] font-bold px-3 py-2 rounded-xl border cursor-pointer ${showOnlyActive ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            >
              {showOnlyActive ? 'Sadece Aktifler: AÇIK' : 'Sadece Aktifleri Göster'}
            </button>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'html' | 'csv')}
              className="text-[10px] font-bold px-2 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 cursor-pointer"
              title="Dışa aktarma formatı"
            >
              <option value="csv">Excel (CSV)</option>
              <option value="html">HTML</option>
            </select>
            <select
              value={gorevReportMode}
              onChange={(e) => setGorevReportMode(e.target.value as 'SIRALA' | 'AYRI_RAPOR')}
              className="text-[10px] font-bold px-2 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 cursor-pointer"
              title="Personel raporu göreve göre"
            >
              <option value="SIRALA">Göreve göre sırala</option>
              <option value="AYRI_RAPOR">Görevlere göre ayrı rapor</option>
            </select>
            <button
              type="button"
              onClick={exportFilteredPersonel}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-black cursor-pointer"
              title={`Listedeki ${filteredPersonel.length} personeli CSV/HTML olarak dışa aktar`}
            >
              <Download size={12} /> Dışa Aktar ({filteredPersonel.length})
            </button>
            <button
              type="button"
              onClick={() => void handleExportSeciliExcel()}
              disabled={filteredPersonel.length === 0}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Ekrandaki seçili firma filtresindeki personeli Excel (.xlsx) olarak indir"
            >
              <Download size={12} /> Seçili Excel ({filteredPersonel.length})
            </button>
            <button
              type="button"
              onClick={() => void handleExportAnaFirmaExcel()}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-indigo-700 text-white rounded-xl hover:bg-indigo-800 cursor-pointer"
              title="Yalnızca ana firma (Kibritçi İnşaat) personelini Excel (.xlsx) olarak indir"
            >
              <Download size={12} /> Ana Firma Excel
            </button>
            <button
              type="button"
              onClick={() => void handleExportTumFirmalarExcel()}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-sky-700 text-white rounded-xl hover:bg-sky-800 cursor-pointer"
              title="Ana firma dahil tüm firmaların personelini Excel (.xlsx) olarak indir"
            >
              <Download size={12} /> Tüm Firmalar Excel
            </button>
            <button
              type="button"
              onClick={() => void handleExportAllTaseronExcel()}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 cursor-pointer"
              title="Tüm taşeron firma personelini Excel (.xlsx) olarak indir"
            >
              <Download size={12} /> Taşeron Excel
            </button>
            <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <span className="text-xs">🔍</span>
            </span>
            <input
              type="text"
              placeholder="İsim veya soyisim ile filtrele..."
              className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-slate-700 focus:outline-none  transition duration-150"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          </div>
        </div>

        {/* Scrollable list grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredPersonel.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 space-y-2">
              <span className="text-3xl">👤</span>
              <p className="text-xs font-medium">Uyanık personel kaydı bulunamadı.</p>
            </div>
          ) : (
            filteredPersonel.map((p) => {
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
                    <div>
                      <h4 className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                        {p.ad} {p.soyad}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          is_aktif_status(p.durum) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {is_aktif_status(p.durum) ? "Aktif" : "Pasif"}
                        </span>
                        {!is_aktif_status(p.durum) && p.istenCikisTarihi && (
                          <span className="text-[10px] bg-red-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-full font-bold">
                            Ayrılış: {p.istenCikisTarihi}
                          </span>
                        )}
                        {p.firmaTipi === 'TASERON' && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold">
                            {p.firmaAdi || 'Taşeron'}
                          </span>
                        )}
                        {(p.personelGrubu === 'IDARI' || p.departman === 'İDARİ') && (
                          <span className="text-[10px] bg-sky-50 text-sky-800 border border-sky-100 px-2 py-0.5 rounded-full font-bold">
                            İdari · Yoklama yok
                          </span>
                        )}
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
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        TC: {p.tcNo} · Görev: <span className="text-slate-600 font-bold">{displayPersonelGorev(p)}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-bold font-mono text-[9px]">
                          <span>📅 İşe Giriş:</span>
                          <span>{p.iseGirisTarihi || '-'}</span>
                        </span>
                        {p.istenCikisTarihi && (
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
            })
          )}
        </div>
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

                  alert(`${dismissingPersonel.ad} ${dismissingPersonel.soyad} isimli personelin işten çıkış tarihi (${dismissDateStr}) kaydedildi ve statüsü Pasif yapıldı.`);
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
