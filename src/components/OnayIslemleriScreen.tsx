import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, CheckCircle, Clock, Send, Users, AlertCircle, FileText, ShoppingCart, 
  Truck, CreditCard, ChevronRight, PenTool, Check, CheckCircle2, UserCheck, Eye, Trash2, Pencil,
  FileUp, ExternalLink, MessageSquare, AlertTriangle, Sparkles, Package, Tent, X, HardHat, Loader2, Layers, Building2
} from 'lucide-react';
import {
  SatinAlmaTalebi,
  Irsaliye,
  Fatura,
  CariKart,
  CariKartIslem,
  StokKart,
  StokKartIslem,
  KampKaydi,
  KampOdasi,
  Personel,
  SahaSiparis,
  KampFirmaTalep,
} from '../types/erp';
import { db, cleanUndefined, saveDocument } from '../lib/firebase';
import { evictActiveKampResidentsForPersonel } from '../lib/kampPlacementUtils';
import { compressImage } from '../lib/imageCompress';
import { collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import {
  buildYolHarcamaKasaCikisPayload,
  appendSoforFisToPersonelGecmis,
  excludeYolHarcamaFromKasaLedger,
  syncApprovedYolHarcamalariToKasa,
  yolHarcamaKasaDocId,
} from '../lib/yolHarcamaUtils';
import { buildSatinAlmaReportHtml } from '../lib/satinAlmaReportHtml';
import { findIrsaliyelerForSa } from '../lib/evrakDonusum';
import { formatFirestoreWriteError } from '../lib/authWriteGuard';
import {
  buildSingleApprovalUpdate,
  buildWhatsAppUrl,
  canApproveMobilDocuments,
  isMobilDocPending,
  normalizeKampFaaliyetForDisplay,
  normalizeKampSayimForDisplay,
  normalizeKampTaseronSayimForDisplay,
} from '../lib/mobilOnayUtils';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import {
  buildApprovedTaseronCari,
  evaluateKampFirmaOnerisi,
  findSimilarTaseronCariler,
} from '../lib/kampFirmaTalepUtils';
import { getTaseronCariKartlar } from '../lib/taseronUtils';
import { fetchApiJson } from '../lib/apiClient';
import { GuvenlikEvrakOnayHavuzu } from './GuvenlikEvrakOnayHavuzu';
import { DijitalOnayScreen } from './DijitalOnayScreen';
import { ImzaOnizlemeStrip } from './ImzaOnizlemeStrip';
import { ImageLightbox } from './ImageLightbox';
import { AcilOnayBadge } from './AcilOnayBadge';
import { VidanjorFisOnayPanel } from './VidanjorFisOnayPanel';
import { YildirimTankerFisOnayPanel } from './YildirimTankerFisOnayPanel';
import { MicirFisOnayPanel } from './MicirFisOnayPanel';
import { MobilFaaliyetGecmisPanel } from './MobilFaaliyetGecmisPanel';
import { KibritciLogo } from './KibritciLogo';
import {
  doubleCheckKapiMatch,
  finalizeKapiIrsaliyeApproval,
  formatKapiMatchLabel,
  suggestSatinAlmaForKapiEvrak,
  KAPI_EVRAK_KAYNAK,
} from '../lib/kapiIrsaliyeUtils';
import {
  appendCariIslemOnce,
  buildCariEvrakHistory,
  resolveCariKartId,
} from '../lib/evrakCariStokSync';
import {
  buildCariIslemFromOperatorFaaliyet,
  makineEtiketi,
} from '../lib/taseronUtils';
import type { OperatorFaaliyet } from '../types/erp';
import { pickEvrakDisplayUrl, pickPrimaryFotoUrl } from '../lib/guvenlikEvrakFotolar';
import { toAiParsePayload } from '../lib/guvenlikFotoStorage';
import { GOTURU_DEFAULT_GOREV, GOTURU_FIRMA_ADI, isGoturuPersonelTalep } from '../lib/goturuPersonelTalep';
import {
  approveSahaSiparisToSatinAlma,
  rejectSahaSiparis,
  SAHA_SIPARIS_COLLECTION,
} from '../lib/sahaSiparisUtils';
import {
  applyTaseronSayimOnApproval,
  filterSayimGuncellemeleriForSession,
  markTaseronSayimApproved,
  markTaseronSayimRejected,
  validateTaseronSayimSession,
} from '../lib/kampTaseronSayimOnayUtils';
import { loadPersonellerForDedup, upsertPersonelAvoidDuplicate, findPersonelMatches, pickBestPersonelMatch, formatPersonelMatchLabel } from '../lib/personelMatchUtils';
import { applyPersonelDuplicateMerge, planManualPersonelMerge } from '../lib/personelDuplicateMerge';
import { resolveTaseronPersonelGorev, withTaseronPersonelGorev } from '../lib/taseronUtils';
import {
  anaFirmaSgkEngel,
  buildAnaFirmaPersonelFromSgkTalep,
  digitsTc,
  hasSgkEvrak,
  isPendingPersonelOnayDurum,
  isSgkGrupTalep,
  isSgkOnayHazir,
  normalizePersonName,
  sgkEvrakUrlOf,
} from '../lib/sgkGrupSablon';

interface OnayIslemleriScreenProps {
  satinAlmaTalepleri: SatinAlmaTalebi[];
  setSatinAlmaTalepleri: React.Dispatch<React.SetStateAction<SatinAlmaTalebi[]>>;
  irsaliyeler: Irsaliye[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar: Fatura[];
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  kullanicilar: any[];
  currentUser: any;
  signatureText: string;
  signatureStyle: string;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
  cariKartlar?: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  stokKartlar?: StokKart[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: React.Dispatch<React.SetStateAction<StokKartIslem[]>>;
  personeller?: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
  kampKayitlari?: KampKaydi[];
  setKampKayitlari?: React.Dispatch<React.SetStateAction<KampKaydi[]>>;
  kampOdalari?: KampOdasi[];
  setKampOdalari?: React.Dispatch<React.SetStateAction<KampOdasi[]>>;
}

export const OnayIslemleriScreen: React.FC<OnayIslemleriScreenProps> = ({
  satinAlmaTalepleri,
  setSatinAlmaTalepleri,
  irsaliyeler,
  setIrsaliyeler,
  faturalar,
  setFaturalar,
  kullanicilar,
  currentUser,
  signatureText,
  signatureStyle,
  addNotification,
  cariKartlar = [],
  setCariKartlar,
  setCariIslemGecmisi,
  stokKartlar = [],
  setStokKartlar,
  setStokIslemGecmisi,
  setPersoneller,
  personeller = [],
  kampKayitlari = [],
  setKampKayitlari,
  kampOdalari = [],
  setKampOdalari,
}) => {
  const [activeTab, setActiveTab] = useState<'satin_alma' | 'guvenlik_belgeleri' | 'kampci_belgeleri' | 'tesisat_mermer_belgeleri' | 'goturu_belgeleri' | 'operator_belgeleri' | 'formen_belgeleri' | 'gunluk_loglar' | 'sofor_talepleri' | 'depocu_talepleri' | 'gecmis' | 'imzalar' | 'anahtarci_tutanaklari'>('satin_alma');
  const [selectedYoneticiEmail, setSelectedYoneticiEmail] = useState<string>('');
  const [stampText, setStampText] = useState<string>('🔵 ŞİRKET GENEL MÜDÜRÜ (E-İMZA)');
  const [customStamp, setCustomStamp] = useState<string>('');
  
  const [onaySearchKeyword, setOnaySearchKeyword] = useState("");
  const [deleteConfirmOnayId, setDeleteConfirmOnayId] = useState<string | null>(null);
  const [editingOnayStampId, setEditingOnayStampId] = useState<string | null>(null);
  const [tempStampValue, setTempStampValue] = useState("");

  const [personelGirisTalepleri, setPersonelGirisTalepleri] = useState<any[]>([]);
  const [personelCikisTalepleri, setPersonelCikisTalepleri] = useState<any[]>([]);
  const [personelGuncellemeTalepleri, setPersonelGuncellemeTalepleri] = useState<any[]>([]);
  const [formenSubTab, setFormenSubTab] = useState<'giris' | 'cikis' | 'guncelleme'>('giris');
  const [activePdfUploadId, setActivePdfUploadId] = useState<string | null>(null);
  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | null>(null);

  const [kampSayimlar, setKampSayimlar] = useState<any[]>([]);
  const [kampTaseronSayimlari, setKampTaseronSayimlari] = useState<any[]>([]);
  const [kampFaaliyetler, setKampFaaliyetler] = useState<any[]>([]);
  const [tesisatciFaaliyetler, setTesisatciFaaliyetler] = useState<any[]>([]);
  const [mermerciFaaliyetler, setMermerciFaaliyetler] = useState<any[]>([]);
  const [seramikFaaliyetler, setSeramikFaaliyetler] = useState<any[]>([]);
  const [operatorKesintiFaaliyetler, setOperatorKesintiFaaliyetler] = useState<any[]>([]);
  const [operatorSahaFaaliyetler, setOperatorSahaFaaliyetler] = useState<any[]>([]);
  const [bekleyenKampPersonelleri, setBekleyenKampPersonelleri] = useState<any[]>([]);
  const [kampFirmaTalepleri, setKampFirmaTalepleri] = useState<KampFirmaTalep[]>([]);
  const [firmaTalepDrafts, setFirmaTalepDrafts] = useState<Record<string, { unvan: string; mergeId: string }>>({});
  const [gunlukAkisRaporlari, setGunlukAkisRaporlari] = useState<any[]>([]);
  const [approvingTaseronSayimId, setApprovingTaseronSayimId] = useState<string | null>(null);
  const [sahaSiparisleri, setSahaSiparisleri] = useState<SahaSiparis[]>([]);

  const [aracOnayTalepleri, setAracOnayTalepleri] = useState<any[]>([]);
  const [yolHarcamalari, setYolHarcamalari] = useState<any[]>([]);
  const [soforFisLightbox, setSoforFisLightbox] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Security Gate Document Approval States
  const [gelenEvraklar, setGelenEvraklar] = useState<any[]>([]);
  const [activeGateDoc, setActiveGateDoc] = useState<any | null>(null);
  const [anahtarciTutanaklari, setAnahtarciTutanaklari] = useState<any[]>([]);
  
  // Approval Wizard States
  const [approvalStep, setApprovalStep] = useState<'SELECT_METHOD' | 'FORM'>('SELECT_METHOD');
  const [selectedDocType, setSelectedDocType] = useState<'FATURA' | 'İRSALİYE' | 'MAKBUZ' | 'GENEL_EVRAK'>('İRSALİYE');
  const [isAiResolving, setIsAiResolving] = useState(false);

  // Form Fields for different types
  const [faturaNo, setFaturaNo] = useState('');
  const [faturaFirma, setFaturaFirma] = useState('');
  const [faturaTarih, setFaturaTarih] = useState('');
  const [faturaToplam, setFaturaToplam] = useState<number>(0);
  const [faturaKdv, setFaturaKdv] = useState<number>(0);
  const [faturaGenelToplam, setFaturaGenelToplam] = useState<number>(0);
  const [faturaKalemler, setFaturaKalemler] = useState<any[]>([]);

  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [irsaliyeFirma, setIrsaliyeFirma] = useState('');
  const [irsaliyeTarih, setIrsaliyeTarih] = useState('');
  const [irsaliyeKalemler, setIrsaliyeKalemler] = useState<any[]>([]);

  const [makbuzRefNo, setMakbuzRefNo] = useState('');
  const [makbuzFirma, setMakbuzFirma] = useState('');
  const [makbuzTarih, setMakbuzTarih] = useState('');
  const [makbuzTutar, setMakbuzTutar] = useState<number>(0);
  const [makbuzAciklama, setMakbuzAciklama] = useState('');
  const [makbuzTip, setMakbuzTip] = useState<'GİRİŞ' | 'ÇIKIŞ'>('ÇIKIŞ');

  const [genelAciklama, setGenelAciklama] = useState('');

  // Item adding states (Fatura / Irsaliye items)
  const [itemUrunAdi, setItemUrunAdi] = useState('');
  const [itemMiktar, setItemMiktar] = useState<number | ''>('');
  const [itemBirim, setItemBirim] = useState('Adet');
  const [itemBirimFiyat, setItemBirimFiyat] = useState<number | ''>('');
  const [itemKdvOran, setItemKdvOran] = useState<number>(20);

  // Subscribe to Security Gate Documents
  useEffect(() => {
    const unsubGelenEvrak = onSnapshot(collection(db, 'guvenlikGelenEvraklar'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docItem) => {
        list.push({ id: docItem.id, ...docItem.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setGelenEvraklar(list);
    });

    return () => {
      unsubGelenEvrak();
    };
  }, []);

  const [stokKartTalepleri, setStokKartTalepleri] = useState<any[]>([]);
  const [depoSayimTalepleri, setDepoSayimTalepleri] = useState<any[]>([]);

  // Load and subscribe to Depocu collections from Firestore
  useEffect(() => {
    const unsubStok = onSnapshot(collection(db, 'stokKartlar'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.durum === 'ONAY BEKLİYOR') {
          list.push({ id: doc.id, ...data });
        }
      });
      setStokKartTalepleri(list);
    });

    const unsubSayim = onSnapshot(collection(db, 'depoSayimlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.durum === 'ONAY BEKLİYOR') {
          list.push({ id: doc.id, ...data });
        }
      });
      setDepoSayimTalepleri(list);
    });

    return () => {
      unsubStok();
      unsubSayim();
    };
  }, []);

  // Load and subscribe to Chauffeur collections from Firestore
  useEffect(() => {
    const unsubArac = onSnapshot(collection(db, 'aracOnayTalepleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.talepTarihi || 0).getTime() - new Date(a.talepTarihi || 0).getTime());
      setAracOnayTalepleri(list);
    });

    const unsubHarcama = onSnapshot(collection(db, 'yolHarcamalari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setYolHarcamalari(list);
    });

    return () => {
      unsubArac();
      unsubHarcama();
    };
  }, []);

  // Subscribe to Hazir Tutanaklar for Anahtarcı Tutanakları
  useEffect(() => {
    const unsubTutanaklar = onSnapshot(collection(db, 'hazirTutanaklar'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docItem) => {
        const data = docItem.data();
        if (data.durum === 'ONAY BEKLİYOR' && (data.kaydedenAnahtarci || data.tutanakTipi === 'CEZA' || data.tutanakTipi === 'HASAR')) {
          list.push({ id: docItem.id, ...data });
        }
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setAnahtarciTutanaklari(list);
    });

    return () => {
      unsubTutanaklar();
    };
  }, []);

  const handleApproveAracTalebi = async (item: any) => {
    if (!window.confirm(`${item.plaka} plakalı araç kartını onaylıyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'aracOnayTalepleri', item.id), {
        durum: 'ONAYLANDI',
        onayleyenYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });

      const vehicleRef = doc(db, 'araclar', item.plaka.toUpperCase().replace(/\s+/g, ''));
      await setDoc(vehicleRef, {
        id: item.plaka.toUpperCase().replace(/\s+/g, ''),
        plaka: item.plaka.toUpperCase(),
        aracTipi: 'ARAC',
        markaModel: item.markaModel || 'Bilinmeyen Araç',
        mevcutKm: parseFloat(item.muayeneKm) || 0,
        kmBakimAraligi: parseFloat(item.yagBakimKmAraligi) || 10000,
        yagBakimKm: parseFloat(item.sonYagBakimKm) || 0,
        muayeneTarihi: item.muayeneTarihi || '',
        sigortaTarihi: item.yagBakimTarihi || '',
        durum: 'AKTIF',
        notlar: `Şöför tarafından girildi. Yağ Bakım Tarihi: ${item.yagBakimTarihi || ''}`
      });

      alert("🎉 Araç kartı onaylandı ve sisteme başarıyla işlendi!");
    } catch (err) {
      console.error(err);
      alert("Hata oluştu.");
    }
  };

  const handleRejectAracTalebi = async (item: any) => {
    if (!window.confirm("Bu araç talebini reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'aracOnayTalepleri', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert("Talep reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveYolHarcamasi = async (
    item: any,
    nihaiMasrafTipi: 'KENDI' | 'KASA'
  ) => {
    const tipLabel =
      nihaiMasrafTipi === 'KENDI'
        ? 'ŞOFÖR KENDİ HARCAMASI (şoföre ödenecek)'
        : 'KASA HARCAMASI (şirket kasasına işlenecek)';
    if (
      !window.confirm(
        `${item.tutar} TL · ${tipLabel}\n\nOnaylıyor musunuz?\n(Şoför beyanı: ${
          item.masrafTipi === 'KASA' ? 'Kasa' : item.masrafTipi === 'KENDI' ? 'Kendi' : 'Belirtilmemiş'
        })`
      )
    ) {
      return;
    }
    try {
      const payload = buildYolHarcamaKasaCikisPayload(
        { ...item, nihaiMasrafTipi },
        nihaiMasrafTipi
      );
      if (!payload.tutar || payload.tutar <= 0) {
        alert('Tutar geçersiz; kasa kaydı oluşturulamadı.');
        return;
      }

      // Önce kasa çıkışı — başarısızsa onay yazılmaz
      await saveDocument('kasaHareketleri', payload);

      await updateDoc(doc(db, 'yolHarcamalari', item.id), {
        durum: 'ONAYLANDI',
        nihaiMasrafTipi,
        masrafTipi: item.masrafTipi || nihaiMasrafTipi,
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString(),
        kasaHareketId: payload.id,
      });

      if (item.personelId) {
        await appendSoforFisToPersonelGecmis({
          personelId: item.personelId,
          yolHarcamaId: item.id,
          tarih: item.tarih,
          tutar: Number(item.tutar) || 0,
          fisNo: item.fisNo,
          aciklama: item.aciklama,
          masrafTipi: nihaiMasrafTipi,
          durum: 'ONAYLANDI',
        });
      }

      alert(
        nihaiMasrafTipi === 'KENDI'
          ? 'Onaylandı: Şoföre iade / kasa borcu olarak Haftalık Kasa çıkışına işlendi.\n\nNot: Haftalık Kasa’da tarih aralığını fiş tarihini kapsayacak şekilde genişletin.'
          : 'Onaylandı: Kasa harcaması olarak Haftalık Kasa çıkışına işlendi.\n\nNot: Haftalık Kasa’da tarih aralığını fiş tarihini kapsayacak şekilde genişletin.'
      );
    } catch (err) {
      console.error('[yol-harcama-onay]', err);
      alert(`Kasa kaydı / onay başarısız: ${formatFirestoreWriteError(err)}`);
    }
  };

  const handleRejectYolHarcamasi = async (item: any) => {
    if (!window.confirm("Bu yol harcamasını reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'yolHarcamalari', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString(),
        kasaDefterHaric: true,
      });
      // Daha önce onaylanıp kasaya düşmüşse çıkışı geri al
      try {
        await deleteDoc(doc(db, 'kasaHareketleri', yolHarcamaKasaDocId(item.id)));
      } catch {
        /* yoksa sorun değil */
      }
      alert("Harcama reddedildi.");
    } catch (err) {
      console.error(err);
      alert(`Reddetme işlemi başarısız: ${formatFirestoreWriteError(err)}`);
    }
  };

  const handleEditYolHarcamasi = async (item: any) => {
    const tutarStr = window.prompt('Tutar (TL)', String(item.tutar ?? ''));
    if (tutarStr == null) return;
    const tutar = Math.abs(parseFloat(String(tutarStr).replace(',', '.')) || 0);
    if (!tutar) {
      alert('Geçerli bir tutar girin.');
      return;
    }
    const tarih =
      window.prompt('Tarih (YYYY-MM-DD)', String(item.tarih || '').slice(0, 10)) ?? '';
    if (!tarih.trim()) return;
    const aciklama = window.prompt('Açıklama', String(item.aciklama || '')) ?? '';
    try {
      await updateDoc(doc(db, 'yolHarcamalari', item.id), {
        tutar,
        tarih: tarih.trim(),
        aciklama: aciklama.trim(),
      });
      if (String(item.durum || '').includes('ONAYLANDI') && !item.kasaDefterHaric) {
        const payload = buildYolHarcamaKasaCikisPayload({
          ...item,
          tutar,
          tarih: tarih.trim(),
          aciklama: aciklama.trim(),
        });
        await saveDocument('kasaHareketleri', {
          ...payload,
          kasaManuelKilidi: true,
        });
      }
      alert('Şoför kaydı güncellendi.');
    } catch (err) {
      console.error(err);
      alert(`Güncelleme başarısız: ${formatFirestoreWriteError(err)}`);
    }
  };

  const handleDeleteYolHarcamasi = async (item: any) => {
    if (
      !window.confirm(
        `${item.personelAdi || item.surucu || 'Şoför'} · ${item.tutar} TL kaydı silinsin mi?\nHaftalık Kasa’daki bağlı çıkış da kalkar. Bu işlem geri alınmaz.`
      )
    ) {
      return;
    }
    try {
      try {
        await excludeYolHarcamaFromKasaLedger(item.id);
      } catch {
        /* belge yoksa devam */
      }
      try {
        await deleteDoc(doc(db, 'kasaHareketleri', yolHarcamaKasaDocId(item.id)));
      } catch {
        /* yoksa sorun değil */
      }
      await updateDoc(doc(db, 'yolHarcamalari', item.id), {
        durum: 'SİLİNDİ',
        kasaDefterHaric: true,
        silenEmail: currentUser?.email || '',
        silinmeTarihi: new Date().toISOString(),
      });
      alert('Kayıt silindi.');
    } catch (err) {
      console.error(err);
      alert(`Silinemedi: ${formatFirestoreWriteError(err)}`);
    }
  };

  const handleViewSatinAlmaEvrak = (sa: SatinAlmaTalebi) => {
    const linked = findIrsaliyelerForSa(sa, irsaliyeler);
    const html = buildSatinAlmaReportHtml(sa, {
      linkedIrsaliyeler: linked.map((ir) => ({
        irsaliyeNo: ir.irsaliyeNo,
        tarih: ir.tarih,
        kalemOzet: (ir.kalemler || [])
          .map((k) => `${k.urunAdi} ${k.miktar} ${k.birim}`)
          .join(', '),
      })),
    });
    void import('../lib/reportEmail').then(({ openHtmlReportWindow }) => {
      const printWin = openHtmlReportWindow(html, `Satın Alma ${sa.saId}`);
      if (!printWin) {
        alert('Lütfen tarayıcınızın pop-up engelleyicisini kapatın; evrak yeni pencerede açılır.');
      }
    });
  };

  const handleSyncYolHarcamalariToKasa = async () => {
    if (!window.confirm(
      'Onaylanmış şoför fişlerinden Haftalık Kasa’da hiç kaydı olmayanları tamamlamak ister misiniz?\n\nDüzenlenen veya kasadan silinen kayıtlar geri alınmaz.'
    )) {
      return;
    }
    try {
      const result = await syncApprovedYolHarcamalariToKasa(yolHarcamalari);
      alert(
        `Kasa senkronu tamamlandı.\n\nYeni: ${result.created}\nGüncellenen: ${result.updated}\nDeğişmeyen: ${result.skipped}` +
          (result.errors.length
            ? `\nHata: ${result.errors.slice(0, 5).join('\n')}`
            : '') +
          '\n\nHaftalık Kasa’da tarih aralığını fiş tarihlerini kapsayacak şekilde açın.'
      );
    } catch (err) {
      console.error('[yol-kasa-sync]', err);
      alert(`Senkron başarısız: ${formatFirestoreWriteError(err)}`);
    }
  };

  const handleApproveStokKart = async (item: any) => {
    if (!window.confirm(`"${item.stokAdi}" (${item.stokKodu}) stok kartını onaylıyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'stokKartlar', item.id), {
        durum: 'AKTIF',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("🎉 Stok kartı onaylandı ve 'AKTIF' olarak kaydedildi!");
    } catch (err) {
      console.error(err);
      alert("Onaylama sırasında bir hata oluştu.");
    }
  };

  const handleRejectStokKart = async (item: any) => {
    if (!window.confirm(`"${item.stokAdi}" stok kartını reddetmek istiyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'stokKartlar', item.id), {
        durum: 'REDDEDILDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0],
        redNedeni: 'Yönetici tarafından reddedildi',
      });
      alert('🛑 Stok kartı talebi reddedildi (kayıt korunarak arşivlendi).');
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveDepoSayim = async (item: any) => {
    if (!window.confirm(`Hafta ${item.haftaNo} depo sayımını onaylıyor musunuz? Bu işlem depodaki stok miktarlarını sayım miktarlarıyla güncelleyecektir.`)) return;
    try {
      // 1. Update sayim status to ONAYLANDI
      await updateDoc(doc(db, 'depoSayimlari', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });

      // 2. Update stock card quantities with count physical quantities
      if (item.kalemler && Array.isArray(item.kalemler)) {
        for (const k of item.kalemler) {
          if (k.stockId) {
            const stockRef = doc(db, 'stokKartlar', k.stockId);
            await updateDoc(stockRef, { miktar: k.physicalQty });
          }
        }
      }

      alert("🎉 Depo sayımı onaylandı ve tüm stoklar fiziksel miktarlarıyla güncellendi!");
    } catch (err) {
      console.error(err);
      alert("Onaylama işlemi sırasında bir hata oluştu.");
    }
  };

  const handleRejectDepoSayim = async (item: any) => {
    if (!window.confirm(`Hafta ${item.haftaNo} depo sayımını reddetmek istiyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'depoSayimlari', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("🛑 Depo sayımı reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveAnahtarciTutanak = async (item: any) => {
    if (!window.confirm(`"${item.konu}" başlıklı tutanağı onaylıyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'hazirTutanaklar', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("🎉 Tutanak başarıyla onaylandı!");
    } catch (err) {
      console.error(err);
      alert("Onaylama işlemi başarısız.");
    }
  };

  const handleRejectAnahtarciTutanak = async (item: any) => {
    if (!window.confirm(`"${item.konu}" başlıklı tutanağı reddetmek istediğinize emin misiniz?`)) return;
    try {
      await updateDoc(doc(db, 'hazirTutanaklar', item.id), {
        durum: 'İPTAL',
        reddedenYonetici: currentUser?.email || 'Sistem Yöneticisi',
        redTarihi: new Date().toISOString().split('T')[0]
      });
      alert("🛑 Tutanak reddedildi (İptal durumuna getirildi).");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  // Load and subscribe to personelGirisTalepleri from Firestore
  useEffect(() => {
    const coll = collection(db, 'personelGirisTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setPersonelGirisTalepleri(list);
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
      setPersonelCikisTalepleri(list);
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
      setPersonelGuncellemeTalepleri(list);
    });
    return () => unsubscribe();
  }, []);

  // Load and subscribe to Kamp collections from Firestore
  useEffect(() => {
    const unsubSayim = onSnapshot(collection(db, 'kampDepoSayimlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setKampSayimlar(list);
    });

    const unsubTaseronSayim = onSnapshot(collection(db, 'kampTaseronSayimlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setKampTaseronSayimlari(list);
    });

    const unsubFaaliyet = onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setKampFaaliyetler(list);
    });

    return () => {
      unsubSayim();
      unsubTaseronSayim();
      unsubFaaliyet();
    };
  }, []);

  // Tesisatçı & Mermerci mobil faaliyetleri (onay havuzu)
  useEffect(() => {
    const unsubTesisatci = onSnapshot(collection(db, 'tesisatciFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setTesisatciFaaliyetler(list);
    });
    const unsubMermerci = onSnapshot(collection(db, 'mermerciFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setMermerciFaaliyetler(list);
    });
    const unsubSeramik = onSnapshot(collection(db, 'seramikFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setSeramikFaaliyetler(list);
    });
    return () => {
      unsubTesisatci();
      unsubMermerci();
      unsubSeramik();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, SAHA_SIPARIS_COLLECTION), (snapshot) => {
      const list: SahaSiparis[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<SahaSiparis, 'id'>) }));
      list.sort((a, b) => String(b.olusturulma || '').localeCompare(String(a.olusturulma || '')));
      setSahaSiparisleri(list);
    });
    return () => unsub();
  }, []);

  // Operatör taşeron kesinti + saha faaliyetleri (onay havuzu)
  useEffect(() => {
    const unsubKesinti = onSnapshot(collection(db, 'operatorFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setOperatorKesintiFaaliyetler(list);
    });
    const unsubSaha = onSnapshot(collection(db, 'operatorSahaFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setOperatorSahaFaaliyetler(list);
    });
    return () => {
      unsubKesinti();
      unsubSaha();
    };
  }, []);

  // Kampçının kurduğu, yönetici onayı bekleyen personeller
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'personeller'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => {
        const v = d.data() as any;
        if (v.onayDurumu === 'ONAY BEKLİYOR' && v.kaynak === 'KAMPCI') {
          list.push({ id: d.id, ...v });
        }
      });
      list.sort((a, b) => String(b.iseGirisTarihi || '').localeCompare(String(a.iseGirisTarihi || '')));
      setBekleyenKampPersonelleri(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'kampFirmaTalepleri'), (snapshot) => {
      const list: KampFirmaTalep[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<KampFirmaTalep, 'id'>) }));
      list.sort((a, b) => String(b.olusturmaTarihi || '').localeCompare(String(a.olusturmaTarihi || '')));
      setKampFirmaTalepleri(list);
    });
    return () => unsub();
  }, []);

  const pendingKampFirmaTalepleri = kampFirmaTalepleri.filter((t) => t.durum === 'ONAY BEKLİYOR');

  const handleApproveKampPersonel = async (id: string) => {
    try {
      const matchedUser = kullanicilar.find((u) => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Bu personeli onaylama yetkiniz bulunmuyor.');
        return;
      }
      await updateDoc(doc(db, 'personeller', id), {
        onayDurumu: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'yonetici',
        onayTarihi: new Date().toISOString(),
      });
      alert('Kampçı personeli onaylandı ve sisteme işlendi.');
    } catch (err) {
      console.error(err);
      alert('Onaylama sırasında hata oluştu.');
    }
  };

  const handleMergeKampPersonel = async (pendingId: string) => {
    const pending = bekleyenKampPersonelleri.find((x) => x.id === pendingId);
    if (!pending) return;
    const matches = findPersonelMatches(
      (personeller || []).filter((p) => p.id !== pendingId),
      {
        rawName: `${pending.ad || ''} ${pending.soyad || ''}`.trim(),
        tcNo: pending.tcNo,
        telefonNo: pending.telefonNo,
        firmaAdi: pending.firmaAdi,
        firmaTipi: pending.firmaTipi,
      }
    );
    const best = pickBestPersonelMatch(matches);
    if (!best) {
      alert('Birleştirilecek mevcut kart bulunamadı. Ayrı kart olarak onaylayın veya Personel ekranından manuel birleştirin.');
      return;
    }
    const keep = best.personel;
    if (
      !window.confirm(
        `Kampçı kaydı "${pending.ad} ${pending.soyad}" mevcut karta birleşecek:\n\n${formatPersonelMatchLabel(best)}\n\nYoklama, kamp odası ve yoklama arşivleri kalan karta taşınır. Kampçı kopyası silinir.`
      )
    ) {
      return;
    }
    try {
      const plan = planManualPersonelMerge(keep, [pending], undefined, kampKayitlari);
      const result = await applyPersonelDuplicateMerge(personeller || [], [plan], {}, kampKayitlari);
      setPersoneller?.(result.personeller);
      alert(
        `Birleştirildi → ${keep.ad} ${keep.soyad}.` +
          (result.archivePatched ? ` ${result.archivePatched} yoklama arşivi güncellendi.` : '')
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Birleştirme başarısız.');
    }
  };

  const handleRejectKampPersonel = async (id: string) => {
    const p = bekleyenKampPersonelleri.find((x) => x.id === id);
    if (!window.confirm(`"${p?.ad || ''} ${p?.soyad || ''}" kaydını reddedip silmek istiyor musunuz? (Kamp yerleşimi varsa otomatik tahliye edilir)`)) return;
    try {
      await deleteDoc(doc(db, 'personeller', id));
      alert('Kampçı personel kaydı reddedildi ve silindi.');
    } catch (err) {
      console.error(err);
      alert('Reddetme sırasında hata oluştu.');
    }
  };

  const kampFirmaDraft = (talep: KampFirmaTalep) =>
    firmaTalepDrafts[talep.id] || { unvan: talep.onerilenUnvan, mergeId: '' };

  const handleApproveKampFirmaTalep = async (talep: KampFirmaTalep) => {
    const matchedUser = kullanicilar.find((u) => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    const role = matchedUser?.yetki || 'YÖNETİCİ';
    if (!canApproveMobilDocuments(role, currentUser?.email)) {
      alert('Bu firma talebini onaylama yetkiniz bulunmuyor.');
      return;
    }
    const draft = kampFirmaDraft(talep);
    const liveCari = cariKartlar || [];
    try {
      let keep = liveCari.find((c) => c.id === draft.mergeId);
      if (!keep) {
        const evalr = evaluateKampFirmaOnerisi(draft.unvan, liveCari, []);
        if (evalr.kind === 'invalid') {
          alert(evalr.message);
          return;
        }
        if (evalr.kind === 'existing') keep = evalr.cari;
      }
      if (keep) {
        if (!window.confirm(`"${talep.onerilenUnvan}" mevcut karta bağlansın mı?\n${keep.unvan}`)) return;
        await updateDoc(doc(db, 'kampFirmaTalepleri', talep.id), {
          durum: 'ONAYLANDI',
          onaylananUnvan: keep.unvan,
          onaylananCariId: keep.id,
          onaylayanEmail: currentUser?.email || 'yonetici',
          onayTarihi: new Date().toISOString(),
        });
        await addNotification?.(`Kampçı firma talebi mevcut karta bağlandı: ${talep.onerilenUnvan} → ${keep.unvan}`);
        alert(`Bağlandı: ${keep.unvan}`);
        return;
      }
      if (!window.confirm(`Yeni taşeron cari açılsın mı?\n${draft.unvan.trim().toLocaleUpperCase('tr-TR')}`)) return;
      const created = buildApprovedTaseronCari(draft.unvan, liveCari);
      await saveDocument('cariKartlar', created);
      setCariKartlar?.((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
      await updateDoc(doc(db, 'kampFirmaTalepleri', talep.id), {
        durum: 'ONAYLANDI',
        onaylananUnvan: created.unvan,
        onaylananCariId: created.id,
        onaylayanEmail: currentUser?.email || 'yonetici',
        onayTarihi: new Date().toISOString(),
      });
      await addNotification?.(`Kampçı firma talebi onaylandı: ${created.unvan}`);
      alert(`Taşeron cari açıldı: ${created.unvan}`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Firma onayı başarısız.');
    }
  };

  const handleRejectKampFirmaTalep = async (talep: KampFirmaTalep) => {
    if (!window.confirm(`"${talep.onerilenUnvan}" firma talebi reddedilsin mi?`)) return;
    try {
      await updateDoc(doc(db, 'kampFirmaTalepleri', talep.id), {
        durum: 'REDDEDILDI',
        onaylayanEmail: currentUser?.email || 'yonetici',
        onayTarihi: new Date().toISOString(),
        redNedeni: 'Yönetici tarafından reddedildi',
      });
      await addNotification?.(`Kampçı firma talebi reddedildi: ${talep.onerilenUnvan}`);
    } catch (err) {
      console.error(err);
      alert('Reddetme başarısız.');
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'mobilGunlukAkisRaporlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setGunlukAkisRaporlari(
        list.sort(
          (a, b) =>
            new Date(b.olusturulma || 0).getTime() - new Date(a.olusturulma || 0).getTime()
        )
      );
    });
    return () => unsub();
  }, []);

  const handleApproveKampItem = async (type: 'sayim' | 'faaliyet', id: string) => {
    try {
      const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Bu belgeyi onaylama yetkiniz bulunmuyor.');
        return;
      }

      const docRef = doc(db, type === 'sayim' ? 'kampDepoSayimlari' : 'kampGunlukFaaliyetleri', id);
      const updateData: Record<string, unknown> = buildSingleApprovalUpdate(
        currentUser?.email || 'yonetici@kibritci.com',
        role
      );

      // Faaliyet onayında: NORMAL → Geldi kampçıları birleştir; MESAI → yoklama/puantaja mesai yaz
      if (type === 'faaliyet') {
        try {
          const { getDoc, getDocs: getAll } = await import('firebase/firestore');
          const snap = await getDoc(docRef);
          const raw = snap.exists() ? (snap.data() as any) : null;
          const existingList: string[] = Array.isArray(raw?.aktifPersonelListesi)
            ? raw.aktifPersonelListesi.map((x: unknown) => String(x || '').trim()).filter(Boolean)
            : [];
          const { fetchYoklamaMap, persistYoklamaDocument } = await import('../lib/yoklamaPersistence');
          const persSnap = await getAll(collection(db, 'personeller'));
          const personeller = persSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
          const yoklamalar = await fetchYoklamaMap();
          const tarih = String(raw?.tarih || new Date().toISOString().slice(0, 10));

          if (raw?.faaliyetGrubu === 'MESAI') {
            const mesaiMap = raw?.personelMesaiSaatleri as Record<string, number> | undefined;
            if (mesaiMap && Object.keys(mesaiMap).length > 0 && !raw?.mesaiYoklamayaIslendi) {
              const { applySahaMesaiToYoklama } = await import('../lib/sahaFaaliyetUtils');
              const { getYoklamaDay, setYoklamaDay } = await import('../lib/yoklamaUtils');
              const { normalizeDateKey } = await import('../lib/dateKeyUtils');
              const dk = normalizeDateKey(tarih);
              const gonderen = String(raw?.kaydedenKampci || currentUser?.email || 'kampci');
              const draft = applySahaMesaiToYoklama(yoklamalar, dk, mesaiMap, gonderen, 'add');
              const [y, m, d] = dk.split('-').map(Number);
              const sparse: Record<string, unknown> = {};
              for (const pid of Object.keys(mesaiMap)) {
                const cell = getYoklamaDay(draft[pid], y, m, d);
                if (!cell) continue;
                sparse[pid] = setYoklamaDay({}, y, m, d, cell) as any;
              }
              if (Object.keys(sparse).length > 0) {
                const result = await persistYoklamaDocument(sparse as any, 'kamp');
                if (result.ok) updateData.mesaiYoklamayaIslendi = true;
              }
            }
          } else {
            const { mergeGeldiKampciIntoList } = await import('../lib/mobilRolEtiketUtils');
            const merged = mergeGeldiKampciIntoList(existingList, personeller, yoklamalar, tarih, {
              ensureEmail: raw?.kaydedenKampci || null,
            });
            if (merged.length > 0) {
              updateData.aktifPersonelListesi = merged;
              updateData.personelId = merged[0];
            }
          }
        } catch (repairErr) {
          console.warn('[kamp-onay] personel/mesai onarımı atlandı:', repairErr);
        }
      }

      await updateDoc(docRef, updateData);
      alert(`Kamp ${type === 'sayim' ? 'depo sayımı' : 'günlük faaliyeti'} onaylandı ve ana programa aktarıldı.`);
    } catch (err) {
      console.error(err);
      alert("Onaylama işlemi sırasında bir hata oluştu.");
    }
  };

  const handleApproveGunlukAkis = async (id: string) => {
    try {
      const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Onay yetkiniz bulunmuyor.');
        return;
      }
      await updateDoc(
        doc(db, 'mobilGunlukAkisRaporlari', id),
        buildSingleApprovalUpdate(currentUser?.email || 'yonetici@kibritci.com', role)
      );
      alert('Günlük akış raporu onaylandı.');
    } catch (err) {
      console.error(err);
      alert('Onay başarısız.');
    }
  };

  const handleRejectGunlukAkis = async (id: string) => {
    if (!window.confirm('Bu günlük raporu reddetmek istiyor musunuz?')) return;
    try {
      await updateDoc(doc(db, 'mobilGunlukAkisRaporlari', id), { durum: 'REDDEDİLDİ' });
    } catch (err) {
      alert('Reddetme başarısız.');
    }
  };

  const handleRejectKampItem = async (type: 'sayim' | 'faaliyet', id: string) => {
    if (!window.confirm("Bu kaydı reddetmek istediğinize emin misiniz?")) return;
    try {
      const docRef = doc(db, type === 'sayim' ? 'kampDepoSayimlari' : 'kampGunlukFaaliyetleri', id);
      await updateDoc(docRef, { durum: 'REDDEDİLDİ' });
      alert("Kayıt reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveTaseronSayim = async (item: any) => {
    if (approvingTaseronSayimId) return;
    const guncellemeler = item.personelGuncellemeleri || [];
    const validation = validateTaseronSayimSession({
      firmaAdi: item.firmaAdi,
      personelGuncellemeleri: guncellemeler,
      personeller,
    });
    if (validation.ok === false) {
      alert(`Onaylanamadı: ${validation.error}`);
      return;
    }

    const inScopeCount = filterSayimGuncellemeleriForSession(item.firmaAdi, guncellemeler, personeller).length;
    const kapsamDisi = guncellemeler.length - inScopeCount;

    if (
      !window.confirm(
        `${item.firmaAdi} sayımını onaylıyor musunuz?\n\n${inScopeCount} personel kaydı güncellenecek.${
          kapsamDisi > 0 ? `\n(${kapsamDisi} kapsam dışı kayıt atlanacak.)` : ''
        }`
      )
    ) {
      return;
    }

    setApprovingTaseronSayimId(item.id);
    try {
      const matchedUser = kullanicilar.find((u) => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Bu sayımı onaylama yetkiniz bulunmuyor.');
        return;
      }

      const { updatedPersoneller, appliedCount, skippedCount } = await applyTaseronSayimOnApproval(
        item,
        personeller
      );
      await markTaseronSayimApproved(item.id, currentUser?.email || 'yonetici', role);
      setPersoneller?.(updatedPersoneller);
      alert(
        `Sayım onaylandı. ${appliedCount} personel kaydı güncellendi.${
          skippedCount > 0 ? ` (${skippedCount} kapsam dışı / bulunamayan kayıt atlandı.)` : ''
        }`
      );
    } catch (err) {
      console.error(err);
      alert(`Onaylama sırasında hata oluştu: ${formatFirestoreWriteError(err)}`);
    } finally {
      setApprovingTaseronSayimId(null);
    }
  };

  const handleRejectTaseronSayim = async (item: any) => {
    if (!window.confirm(`${item.firmaAdi} taşeron sayımını reddetmek istiyor musunuz? Personel kayıtları değişmeyecek.`)) {
      return;
    }
    try {
      await markTaseronSayimRejected(item.id, currentUser?.email || 'yonetici');
      alert('Taşeron sayımı reddedildi.');
    } catch (err) {
      console.error(err);
      alert('Reddetme işlemi başarısız.');
    }
  };

  const tesisatMermerCollection = (type: 'tesisatci' | 'mermerci' | 'seramik') =>
    type === 'tesisatci'
      ? 'tesisatciFaaliyetleri'
      : type === 'mermerci'
        ? 'mermerciFaaliyetleri'
        : 'seramikFaaliyetleri';

  const handleApproveTesisatMermer = async (type: 'tesisatci' | 'mermerci' | 'seramik', id: string) => {
    try {
      const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Bu belgeyi onaylama yetkiniz bulunmuyor.');
        return;
      }
      const updateData = buildSingleApprovalUpdate(currentUser?.email || 'yonetici@kibritci.com', role);
      await updateDoc(doc(db, tesisatMermerCollection(type), id), updateData);
      const label = type === 'tesisatci' ? 'Tesisatçı' : type === 'mermerci' ? 'Mermerci' : 'Götürü / Seramik';
      alert(`${label} faaliyeti onaylandı.`);
    } catch (err) {
      console.error(err);
      alert("Onaylama işlemi sırasında bir hata oluştu.");
    }
  };

  const handleRejectTesisatMermer = async (type: 'tesisatci' | 'mermerci' | 'seramik', id: string) => {
    if (!window.confirm("Bu faaliyeti reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, tesisatMermerCollection(type), id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'yonetici',
        onayTarihi: new Date().toISOString(),
      });
      alert("Faaliyet reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const isOperatorKesintiPending = (d: any) => {
    if (d.onayDurumu === 'ONAYLANDI' || d.onayDurumu === 'REDDEDİLDİ') return false;
    if (d.durum === 'ONAYLANDI' || d.durum === 'REDDEDİLDİ') return false;
    return (
      d.onayDurumu === 'BEKLEMEDE' ||
      d.durum === 'ONAY BEKLİYOR' ||
      d.durum === 'BEKLEMEDE'
    );
  };

  const approveOperatorKesintiCore = async (id: string, role: string, silent = false) => {
    const raw = operatorKesintiFaaliyetler.find((x) => x.id === id);
    if (!raw) {
      if (!silent) alert('Kayıt bulunamadı.');
      return false;
    }
    const updateData = {
      ...buildSingleApprovalUpdate(currentUser?.email || 'yonetici@kibritci.com', role),
      onayDurumu: 'ONAYLANDI',
    };
    await updateDoc(doc(db, 'operatorFaaliyetleri', id), updateData);
    const cariIslem = buildCariIslemFromOperatorFaaliyet({ ...raw, ...updateData } as OperatorFaaliyet);
    if (cariIslem && setCariIslemGecmisi) {
      setCariIslemGecmisi((prev) => {
        const rest = (prev || []).filter((x) => x.id !== cariIslem.id && x.islemId !== id);
        return [cariIslem, ...rest];
      });
    }
    return true;
  };

  const handleApproveOperatorKesinti = async (id: string) => {
    try {
      const matchedUser = kullanicilar.find((u) => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Bu belgeyi onaylama yetkiniz bulunmuyor.');
        return;
      }
      const ok = await approveOperatorKesintiCore(id, role);
      if (ok) alert('Operatör taşeron kesinti kaydı onaylandı; cari geçmişe işlendi.');
    } catch (err) {
      console.error(err);
      alert('Onaylama sırasında hata oluştu.');
    }
  };

  const rejectOperatorKesintiCore = async (id: string) => {
    await updateDoc(doc(db, 'operatorFaaliyetleri', id), {
      onayDurumu: 'REDDEDİLDİ',
      durum: 'REDDEDİLDİ',
      onaylayanYonetici: currentUser?.email || 'yonetici',
      onayTarihi: new Date().toISOString(),
    });
  };

  const handleRejectOperatorKesinti = async (id: string) => {
    if (!window.confirm('Bu kesinti kaydını reddetmek istediğinize emin misiniz?')) return;
    try {
      await rejectOperatorKesintiCore(id);
      alert('Kesinti kaydı reddedildi.');
    } catch (err) {
      console.error(err);
      alert('Reddetme başarısız.');
    }
  };

  const syncOperatorSahaMesaiOnApprove = async (saha: any) => {
    const mesaiMap = saha?.personelMesaiSaatleri as Record<string, number> | undefined;
    if (saha?.faaliyetGrubu !== 'MESAI' || !mesaiMap || Object.keys(mesaiMap).length === 0) return;
    // Kayıt anında zaten yoklamaya işlendiyse çift yazma
    if (saha?.mesaiYoklamayaIslendi) return;
    const { fetchYoklamaMap, persistYoklamaDocument } = await import('../lib/yoklamaPersistence');
    const { applySahaMesaiToYoklama, ensureGeldiForPersoneller } = await import('../lib/sahaFaaliyetUtils');
    const { getYoklamaDay, setYoklamaDay } = await import('../lib/yoklamaUtils');
    const { normalizeDateKey } = await import('../lib/dateKeyUtils');
    const tarih = normalizeDateKey(saha.tarih);
    const gonderen = String(saha.kaydeden || currentUser?.email || 'operator');
    let draft = await fetchYoklamaMap();
    // Eski bekleyen kayıtlar: onayda mesai + Geldi
    const gelidi = ensureGeldiForPersoneller(draft, tarih, Object.keys(mesaiMap), gonderen);
    draft = gelidi.next;
    draft = applySahaMesaiToYoklama(draft, tarih, mesaiMap, gonderen, 'add');
    const [y, m, d] = tarih.split('-').map(Number);
    const sparse: Record<string, unknown> = {};
    const touched = new Set([...Object.keys(mesaiMap), ...gelidi.touchedIds]);
    for (const pid of touched) {
      const cell = getYoklamaDay(draft[pid], y, m, d);
      if (!cell) continue;
      sparse[pid] = setYoklamaDay({}, y, m, d, cell) as any;
    }
    if (Object.keys(sparse).length === 0) return;
    const result = await persistYoklamaDocument(sparse as any, 'sync');
    if (!result.ok) {
      console.warn('Operatör mesai yoklama yazılamadı:', result.error);
    }
  };

  const handleApproveOperatorSaha = async (id: string) => {
    try {
      const matchedUser = kullanicilar.find((u) => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      if (!canApproveMobilDocuments(role, currentUser?.email)) {
        alert('Bu belgeyi onaylama yetkiniz bulunmuyor.');
        return;
      }
      const saha = operatorSahaFaaliyetler.find((x) => x.id === id);
      const updateData = buildSingleApprovalUpdate(currentUser?.email || 'yonetici@kibritci.com', role);
      await updateDoc(doc(db, 'operatorSahaFaaliyetleri', id), updateData);
      if (saha) {
        try {
          await syncOperatorSahaMesaiOnApprove(saha);
        } catch (mesaiErr) {
          console.warn('Mesai yoklama senkronu:', mesaiErr);
        }
      }
      if (saha?.bagliOperatorFaaliyetId) {
        await approveOperatorKesintiCore(String(saha.bagliOperatorFaaliyetId), role, true);
      }
      alert(
        saha?.bagliOperatorFaaliyetId
          ? 'Operatör saha faaliyeti ve bağlı taşeron kesinti onaylandı (reel kayıt).'
          : 'Operatör saha faaliyeti onaylandı (reel kayıt).'
      );
    } catch (err) {
      console.error(err);
      alert('Onaylama sırasında hata oluştu.');
    }
  };

  const handleRejectOperatorSaha = async (id: string) => {
    if (!window.confirm('Bu operatör faaliyetini reddetmek istediğinize emin misiniz?')) return;
    try {
      const saha = operatorSahaFaaliyetler.find((x) => x.id === id);
      await updateDoc(doc(db, 'operatorSahaFaaliyetleri', id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'yonetici',
        onayTarihi: new Date().toISOString(),
      });
      // Kayıtta yazılmış mesaiyi geri al
      if (
        saha?.faaliyetGrubu === 'MESAI' &&
        saha?.personelMesaiSaatleri &&
        (saha as any).mesaiYoklamayaIslendi
      ) {
        try {
          const { fetchYoklamaMap, persistYoklamaDocument } = await import('../lib/yoklamaPersistence');
          const { applySahaMesaiToYoklama } = await import('../lib/sahaFaaliyetUtils');
          const { getYoklamaDay, setYoklamaDay } = await import('../lib/yoklamaUtils');
          const { normalizeDateKey } = await import('../lib/dateKeyUtils');
          const tarih = normalizeDateKey(saha.tarih);
          const gonderen = String(saha.kaydeden || currentUser?.email || 'operator');
          let draft = await fetchYoklamaMap();
          draft = applySahaMesaiToYoklama(
            draft,
            tarih,
            saha.personelMesaiSaatleri as Record<string, number>,
            gonderen,
            'subtract'
          );
          const [y, m, d] = tarih.split('-').map(Number);
          const sparse: Record<string, unknown> = {};
          for (const pid of Object.keys(saha.personelMesaiSaatleri as object)) {
            const cell = getYoklamaDay(draft[pid], y, m, d);
            if (!cell) continue;
            sparse[pid] = setYoklamaDay({}, y, m, d, cell) as any;
          }
          if (Object.keys(sparse).length > 0) {
            await persistYoklamaDocument(sparse as any, 'sync');
          }
        } catch (mesaiErr) {
          console.warn('Red mesai geri alma:', mesaiErr);
        }
      }
      if (saha?.bagliOperatorFaaliyetId) {
        try {
          await rejectOperatorKesintiCore(String(saha.bagliOperatorFaaliyetId));
        } catch {
          /* ignore */
        }
      }
      alert('Faaliyet reddedildi.');
    } catch (err) {
      console.error(err);
      alert('Reddetme başarısız.');
    }
  };

  const handleApproveGirisTalep = async (item: any, evrakDataUrl?: string | null) => {
    const evrakUrl = evrakDataUrl || sgkEvrakUrlOf(item) || item.girisEvrakPdfUrl || '';
    const sgkItem = {
      ...item,
      girisEvrakPdfUrl: evrakUrl || item.girisEvrakPdfUrl,
      sgkEvrakUrl: evrakUrl || item.sgkEvrakUrl,
      sgkEvrakGeldi: item.sgkEvrakGeldi || Boolean(evrakUrl),
    };
    const sgkEngel = anaFirmaSgkEngel(sgkItem);
    if (sgkEngel) {
      alert(sgkEngel);
      return;
    }
    if (!isSgkGrupTalep(item) && !evrakUrl) {
      alert('Lütfen personelin İşe Giriş Bildirgesi belgesini (PDF/Görsel) yükleyin!');
      return;
    }
    try {
      const isGoturuKayit = isGoturuPersonelTalep(item);
      const firmaTipi = item.firmaTipi === 'TASERON' || isGoturuKayit ? 'TASERON' : 'ANA_FIRMA';
      const firmaAdi = item.firmaAdi || (isGoturuKayit ? GOTURU_FIRMA_ADI : undefined);
      const resolvedGorev = isGoturuKayit
        ? (item.gorev || GOTURU_DEFAULT_GOREV)
        : firmaTipi === 'TASERON'
          ? resolveTaseronPersonelGorev({ firmaAdi, firmaTipi: 'TASERON' })
          : item.gorev || 'İŞÇİ';

      const candidate: Personel = isSgkGrupTalep(item)
        ? buildAnaFirmaPersonelFromSgkTalep(sgkItem, item.personelId || `p_${Date.now()}`)
        : isGoturuKayit
          ? ({
              id: item.personelId || `p_${Date.now()}`,
              tcNo: item.tcNo || '',
              ad: item.ad || '',
              soyad: item.soyad || '',
              babaAdi: '',
              dogumTarihi: '',
              telefonNo: item.telefonNo || '',
              eposta: '',
              adres: '',
              il: '',
              ilce: '',
              departman: 'ŞANTİYE',
              gorev: resolvedGorev,
              iseGirisTarihi: (item.tarih || new Date().toISOString()).slice(0, 10),
              cinsiyet: 'Belirtilmedi',
              maas: 0,
              ucretTipi: 'Aylık',
              sgkDurumu: "SGK'lı",
              bankaAdi: '',
              subeAdi: '',
              ibanNo: '',
              durum: true,
              firmaTipi,
              firmaAdi,
            } as Personel)
          : withTaseronPersonelGorev({
              id: item.personelId || `p_${Date.now()}`,
              tcNo: item.tcNo || '',
              ad: item.ad || '',
              soyad: item.soyad || '',
              babaAdi: '',
              dogumTarihi: '',
              telefonNo: item.telefonNo || '',
              eposta: '',
              adres: '',
              il: '',
              ilce: '',
              departman: 'ŞANTİYE',
              gorev: resolvedGorev,
              iseGirisTarihi: (item.tarih || new Date().toISOString()).slice(0, 10),
              cinsiyet: 'Belirtilmedi',
              maas: 0,
              ucretTipi: 'Aylık',
              sgkDurumu: "SGK'lı",
              bankaAdi: '',
              subeAdi: '',
              ibanNo: '',
              durum: true,
              firmaTipi,
              firmaAdi,
            } as Personel);

      const allPersoneller = await loadPersonellerForDedup(personeller || []);
      const { personel: saved, merged } = await upsertPersonelAvoidDuplicate(
        allPersoneller,
        candidate,
        {
          rawName: `${item.ad || ''} ${item.soyad || ''}`.trim(),
          tcNo: item.tcNo || candidate.tcNo,
          telefonNo: item.telefonNo,
          firmaAdi: item.firmaAdi,
          firmaTipi,
        }
      );

      setPersoneller?.((prev) =>
        prev.some((p) => p.id === saved.id)
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [...prev, saved]
      );

      await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
        durum: 'ONAYLANDI',
        girisEvrakPdfUrl: evrakUrl || item.girisEvrakPdfUrl || '',
        personelId: saved.id,
        onaylayan: currentUser?.email,
        onayTarihi: new Date().toISOString(),
      });
      setActivePdfUploadId(null);
      setUploadedPdfBase64(null);
      alert(
        merged
          ? 'Personel giriş talebi onaylandı. Mevcut Ana Firma kaydı güncellendi (mükerrer kart açılmadı).'
          : isSgkGrupTalep(item)
            ? 'Personel giriş talebi onaylandı. Grup bildirimi ve SGK evrakı kontrol edildi; Ana Firma kadrosu yazıldı.'
            : 'Personel giriş talebi onaylandı. İşe Giriş Bildirgesi yüklendi ve sahaya bildirildi.'
      );
    } catch (err) {
      console.error(err);
      alert('Kaydedilemedi, veritabanı bağlantısını kontrol edin.');
    }
  };

  const handleApproveCikis = async (item: any) => {
    const sgkEngel = anaFirmaSgkEngel(item);
    if (sgkEngel) {
      alert(sgkEngel);
      return;
    }
    if (!window.confirm(`${item.personelIsim} için işten çıkış işlemini onaylamak istiyor musunuz?\n\nAktif kamp oda kaydı varsa otomatik tahliye edilir.`)) return;
    try {
      const cikisTarihi = String(item.sgkCikisTarihi || item.cikisTarihi || new Date().toISOString()).slice(0, 10);
      const tc = digitsTc(item.tcNo);
      const isimNeedle = normalizePersonName(item.personelIsim || '');
      const resolved =
        personeller.find((p) => p.id && p.id === item.personelId) ||
        (tc.length === 11
          ? personeller.find((p) => digitsTc(p.tcNo) === tc)
          : undefined) ||
        (isimNeedle
          ? personeller.find((p) => normalizePersonName(p.ad, p.soyad) === isimNeedle)
          : undefined);
      const personelId = resolved?.id || item.personelId;
      if (isSgkGrupTalep(item) && !personelId) {
        alert('Personel kartı bulunamadı. Ana Firma çıkışı yazılmadı. TC veya ad soyad eşleşmesini kontrol edin.');
        return;
      }

      // 1. Update request status to ONAYLANDI
      await updateDoc(doc(db, 'personelCikisTalepleri', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString(),
        personelId: personelId || item.personelId || '',
        cikisTarihi,
      });

      // 2. Set actual personnel as inactive and save exit date
      if (personelId) {
        await updateDoc(doc(db, 'personeller', personelId), {
          durum: false,
          istenCikisTarihi: cikisTarihi
        });
      }

      // 3. Local personel state (App effect + anında UI)
      if (setPersoneller && personelId) {
        setPersoneller((prev) =>
          prev.map((p) =>
            p.id === personelId
              ? { ...p, durum: false, istenCikisTarihi: cikisTarihi }
              : p
          )
        );
      }

      // 4. Kamp çıkışı (aktif oda kaydı varsa)
      let kampNot = '';
      if (personelId || item.personelIsim) {
        try {
          const result = await evictActiveKampResidentsForPersonel({
            personelId,
            personelIsim: item.personelIsim,
            cikisTarihi,
            kampOdalari,
            kampKayitlari,
          });
          if (result.evictedCount > 0) {
            setKampKayitlari?.(result.kampKayitlari);
            setKampOdalari?.(result.kampOdalari);
            kampNot = `\nKamp odasından otomatik tahliye: ${result.evictedCount} kayıt.`;
            void addNotification?.(
              `${item.personelIsim} işten çıkış onaylandı — kamptan ${result.evictedCount} oda kaydı tahliye edildi.`
            );
          }
        } catch (kampErr) {
          console.warn('Kamp tahliye atlandı:', kampErr);
        }
      }

      alert(`🎉 ${item.personelIsim} için işten çıkış onaylandı ve personel pasife alındı.${kampNot}`);
    } catch (err) {
      console.error(err);
      alert("İşlem onaylanırken bir hata oluştu.");
    }
  };

  const handleRejectCikis = async (item: any) => {
    if (!window.confirm("Bu işten çıkış talebini reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'personelCikisTalepleri', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert(`🛑 ${item.personelIsim} işten çıkış talebi reddedildi.`);
    } catch (err) {
      console.error(err);
      alert("İşlem gerçekleştirilemedi.");
    }
  };

  const handleApproveGuncelleme = async (item: any) => {
    if (!window.confirm("Bilgi güncelleme talebini onaylamak ve personeli güncellemek istiyor musunuz?")) return;
    try {
      // 1. Update request status to ONAYLANDI
      await updateDoc(doc(db, 'personelGuncellemeTalepleri', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });

      // 2. Update actual personnel details (blank IBAN must not erase existing data)
      const nextIban = String(item?.yeniBilgiler?.ibanNo || '')
        .replace(/\s+/g, '')
        .toUpperCase()
        .trim();
      const updatePayload: Record<string, unknown> = {
        ad: item.yeniBilgiler.ad,
        soyad: item.yeniBilgiler.soyad,
        gorev: item.yeniBilgiler.gorev,
      };
      if (item?.yeniBilgiler?.telefon) {
        updatePayload.telefonNo = item.yeniBilgiler.telefon;
      }
      if (nextIban && nextIban !== 'TR') {
        updatePayload.ibanNo = nextIban;
      }
      if (item?.yeniBilgiler?.bankaAdi) {
        updatePayload.bankaAdi = item.yeniBilgiler.bankaAdi;
      }
      await updateDoc(doc(db, 'personeller', item.personelId), updatePayload);

      alert(`🎉 Personel bilgileri başarıyla güncellendi!`);
    } catch (err) {
      console.error(err);
      alert("İşlem onaylanırken bir hata oluştu.");
    }
  };

  const handleRejectGuncelleme = async (item: any) => {
    if (!window.confirm("Bu güncelleme talebini reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'personelGuncellemeTalepleri', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert(`🛑 Bilgi güncelleme talebi reddedildi.`);
    } catch (err) {
      console.error(err);
      alert("İşlem gerçekleştirilemedi.");
    }
  };

  const handleUndoApproval = (type: 'request' | 'waybill' | 'invoice', id: string) => {
    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === id || item.saId === id) {
          return {
            ...item,
            onayDurumu: 'ONAY BEKLİYOR',
            onaylayanYonetici: undefined,
            onayStamp: undefined,
            onayTarihi: undefined
          };
        }
        return item;
      }));
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === id || item.irsaliyeNo === id) {
          return {
            ...item,
            onayDurumu: 'ONAY BEKLİYOR',
            onaylayanYonetici: undefined,
            onayStamp: undefined,
            onayTarihi: undefined
          };
        }
        return item;
      }));
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === id || item.faturaNo === id) {
          return {
            ...item,
            durum: 'KONTROL BEKLEYOR',
            onaylayanYonetici: undefined,
            onayStamp: undefined,
            onayTarihi: undefined
          };
        }
        return item;
      }));
    }
    alert("Onay başarıyla geri alındı. Evrak Onay Bekleyenler havuzuna geri aktarıldı.");
  };

  const handleStartEditStamp = (id: string, currentStamp: string) => {
    setEditingOnayStampId(id);
    setTempStampValue(currentStamp);
  };

  const handleSaveUpdatedStamp = (type: 'request' | 'waybill' | 'invoice', id: string) => {
    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === id || item.saId === id) {
          return { ...item, onayStamp: tempStampValue };
        }
        return item;
      }));
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === id || item.irsaliyeNo === id) {
          return { ...item, onayStamp: tempStampValue };
        }
        return item;
      }));
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === id || item.faturaNo === id) {
          return { ...item, onayStamp: tempStampValue };
        }
        return item;
      }));
    }
    setEditingOnayStampId(null);
    alert("Onay kaşesi / e-imzası başarıyla güncellendi.");
  };

  const handleDeleteApprovedDoc = (type: 'request' | 'waybill' | 'invoice', id: string) => {
    if (deleteConfirmOnayId === id) {
      if (type === 'request') {
        setSatinAlmaTalepleri(prev => prev.filter(x => x.id !== id && x.saId !== id));
      } else if (type === 'waybill') {
        setIrsaliyeler(prev => prev.filter(x => x.id !== id && x.irsaliyeNo !== id));
      } else if (type === 'invoice') {
        setFaturalar(prev => prev.filter(x => x.id !== id && x.faturaNo !== id));
      }
      setDeleteConfirmOnayId(null);
      alert("Evrak sistemden kalıcı olarak silindi.");
    } else {
      setDeleteConfirmOnayId(id);
      setTimeout(() => {
        setDeleteConfirmOnayId(prev => prev === id ? null : prev);
      }, 4000);
    }
  };

  const handleGenerateSignedPdf = (type: 'request' | 'waybill' | 'invoice', doc: any) => {
    let title = "";
    let code = "";
    let contentHtml = "";

    // Determine info based on type
    if (type === 'request') {
      title = "SATIN ALMA SİPARİŞİ / TALEBİ";
      code = doc.saId || doc.id;
      contentHtml = `
        <div class="card bg-gray-50 p-4 rounded-xl border mb-6">
          <p class="mb-2"><strong>Cari Firma:</strong> ${doc.cariFirma}</p>
          <p class="mb-2"><strong>Ödeme Koşulu:</strong> ${doc.odemeKosulu || 'Şantiye Teslim / Vadeli'}</p>
          <p class="mb-2"><strong>Talep Tarihi:</strong> ${doc.tarih}</p>
          <p class="mb-2"><strong>Durum:</strong> ${doc.onayDurumu || 'İmza Bekleniyor'}</p>
        </div>
        
        <h3 class="font-bold text-sm text-slate-800 mb-3">MALZEME DETAY KONTROL LİSTESİ</h3>
        <table class="w-full text-xs text-left border mb-6">
          <thead>
            <tr class="bg-indigo-950 text-white" style="background-color: #1e3a8a">
              <th class="p-2.5">Malzeme / Ürün Açıklaması</th>
              <th class="p-2.5 text-right">Miktar</th>
              <th class="p-2.5 text-right">Birim</th>
            </tr>
          </thead>
          <tbody>
            ${(doc.kalemler || []).map((item: any) => `
              <tr class="border-b">
                <td class="p-2.5 font-semibold text-slate-800">${item.urunAdi || item.malzemeAdi || 'İnşaat Malzemesi'}</td>
                <td class="p-2.5 text-right font-bold text-slate-900">${item.miktar}</td>
                <td class="p-2.5 text-right font-bold text-slate-600">${item.birim || 'Adet'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'waybill') {
      title = "MALZEME TESLİMAT İRSALİYESİ";
      code = doc.irsaliyeNo || doc.id;
      contentHtml = `
        <div class="card bg-gray-50 p-4 rounded-xl border mb-6">
          <p class="mb-2"><strong>Sevkiyat Yapan Firma / Şantiye:</strong> ${doc.firma}</p>
          <p class="mb-2"><strong>Sevk Tarihi:</strong> ${doc.tarih}</p>
          <p class="mb-2"><strong>İlişkili Satın Alma Sipariş Kodu:</strong> ${doc.saId || 'GENEL PLAN DIŞI'}</p>
          <p class="mb-2"><strong>Teslim Alan Personel Ünvanı:</strong> ŞANTİYE ŞEFİ</p>
        </div>
        
        <h3 class="font-bold text-sm text-slate-800 mb-3">TESLİM ALINAN MALZEMELER</h3>
        <table class="w-full text-xs text-left border mb-6">
          <thead>
            <tr class="bg-emerald-950 text-white" style="background-color: #064e3b">
              <th class="p-2.5">Teslim Alınan Kalem</th>
              <th class="p-2.5 text-right">Miktar</th>
              <th class="p-2.5 text-right">Birim</th>
            </tr>
          </thead>
          <tbody>
            ${(doc.kalemler || []).map((item: any) => `
              <tr class="border-b">
                <td class="p-2.5 font-semibold text-slate-800">${item.urunAdi || 'Malzeme'}</td>
                <td class="p-2.5 text-right font-bold text-slate-900">${item.miktar}</td>
                <td class="p-2.5 text-right font-bold text-slate-600">${item.birim || 'Adet'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'invoice') {
      title = "RESMİ CARİ ALIM FATURASI";
      code = doc.faturaNo || doc.id;
      contentHtml = `
        <div class="card bg-gray-50 p-4 rounded-xl border mb-6">
          <p class="mb-2"><strong>Mükellef Cari Firma:</strong> ${doc.cariUnvan}</p>
          <p class="mb-2"><strong>Fatura Tarihi:</strong> ${doc.tarih}</p>
          <p class="mb-2"><strong>Matrah Toplam Tutar:</strong> ₺${doc.toplamTutar?.toLocaleString() || '0'}</p>
          <p class="mb-2"><strong>KDV Tutarı (%20):</strong> ₺${doc.kdvTutar?.toLocaleString() || '0'}</p>
          <p class="mb-2"><strong>Genel Çekim Toplamı:</strong> ₺${doc.genelToplam?.toLocaleString() || '0'}</p>
        </div>
        
        <h3 class="font-bold text-sm text-slate-800 mb-3">FATURA KALEMLERİ LİSTESİ</h3>
        <table class="w-full text-xs text-left border mb-6">
          <thead>
            <tr class="bg-purple-950 text-white" style="background-color: #581c87">
              <th class="p-2.5">Hizmet / Malzeme Açıklaması</th>
              <th class="p-2.5 text-right">Birim Fiyat</th>
              <th class="p-2.5 text-right">Toplam (KDV Hariç)</th>
            </tr>
          </thead>
          <tbody>
            ${(doc.kalemler || []).map((item: any) => `
              <tr class="border-b">
                <td class="p-2.5 font-semibold text-slate-800">${item.urunAdi || item.hizmetadi || 'Hizmet Kalemi'}</td>
                <td class="p-2.5 text-right font-mono">₺${(item.fiyat || 0).toLocaleString()}</td>
                <td class="p-2.5 text-right font-bold text-purple-950 font-mono">₺${(item.tutar || (item.fiyat * item.miktar) || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const onayExtraCss = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
      .doc-title-badge{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;padding:8px 16px;border-radius:8px;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase}
      h1{font-size:20px;font-weight:800;margin:10px 0 5px;color:#0f172a}
      .sub-header-line{height:4px;background:linear-gradient(to right,#1e4e78 30%,#8b1e1e 100%);margin:16px 0 24px;border-radius:2px}
      .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px}
      table.w-full{width:100%;border-collapse:collapse}
      .signatures-grid{width:100%;margin-top:40px;border-top:1px solid #f1f5f9;padding-top:24px}
      .sig-box{width:33%;text-align:center;font-size:11px;padding:0 10px;display:inline-block;vertical-align:top}
      .sig-line{border-top:1px dashed #cbd5e1;margin-top:32px;margin-bottom:8px}
      .sig-title{font-weight:700;color:#64748b;text-transform:uppercase}
    `;

    const innerBody = `
        <div class="doc-title-badge">BELGE FORMU</div>
        <h1>${title}</h1>
        <p style="margin:2px 0 0;font-size:12px;color:#475569;">Belge No: <strong>${code}</strong></p>
        <div class="sub-header-line"></div>
        ${contentHtml}
        <div class="signatures-grid">
          <div class="sig-box"><div class="sig-line"></div><div class="sig-title">TEKLİF / KABUL EDEN</div><div style="font-size:10px;color:#64748b;margin-top:2px;">ŞANTİYE SORUMLUSU</div><div style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:6px;">İmza Bekleniyor</div></div>
          <div class="sig-box"><div class="sig-line"></div><div class="sig-title">KONTROL EDEN</div><div style="font-size:10px;color:#64748b;margin-top:2px;">MÜHENDİS / TEKNİK OFİS Sorumlusu</div><div style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:6px;">İmza Bekleniyor</div></div>
          <div class="sig-box"><div class="sig-line"></div><div class="sig-title">ONAY VEREN</div><div style="font-size:10px;color:#64748b;margin-top:2px;">ŞİRKET YÖNETİMİ</div><div style="font-size:10px;color:#94a3b8;font-style:italic;margin-top:6px;">İmza Bekleniyor</div></div>
        </div>
    `;

    const htmlContent = wrapCorporateReportHtml(innerBody, {
      docCode: `Belge No: ${code}`,
      orientation: 'portrait',
      title: `BELGE - ${code}`,
      extraCss: onayExtraCss,
      autoPrint: false,
    });

    void import('../lib/reportEmail').then(({ openHtmlReportWindow }) => {
      const printWin = openHtmlReportWindow(htmlContent, `BELGE - ${code}`);
      if (!printWin) {
        alert('Lütfen baskı pencerelerini açabilmek için tarayıcınızın pop-up engelleyicisini devre dışı bırakın.');
      }
    });
  };

  // Custom states for view / detail modal in Approvals Screen
  const [activeDocForDetail, setActiveDocForDetail] = useState<{
    id: string;
    type: 'request' | 'waybill' | 'invoice';
    data: any;
  } | null>(null);

  // Filter managers
  const yoneticiler = kullanicilar.filter(u => u.yetki === 'YÖNETİCİ' || u.email === 'sametatak9@gmail.com' || u.email === 'santiye@kibritci.com');

  // Gelen onay istekleri filters:
  // Show documents where they are in pending states, and if they are marked for the current manager's email specifically,
  // or if no specific managers are target-assigned, default to showing in everyone's pool.
  const pendingRequests = satinAlmaTalepleri.filter(doc => {
    const isPending = doc.onayDurumu === 'ONAY BEKLİYOR';
    if (!isPending) return false;
    const targets = (doc as any).onayGonderilenYoneticiMailleri;
    if (targets && Array.isArray(targets) && targets.length > 0) {
      return targets.includes(currentUser?.email);
    }
    return true;
  });

  const pendingSiparisler = sahaSiparisleri.filter((s) => s.durum === 'ONAY_BEKLIYOR');

  const pendingWaybills = irsaliyeler.filter(doc => {
    // Vidanjör / mıcır-stabilize / Yıldırım / kapı evrak özel panelden yönetilir
    if (
      doc.kaynak === 'VIDANJOR_FIS' ||
      doc.kaynak === 'MICIR_STABILIZE_FIS' ||
      doc.kaynak === 'YILDIRIM_TANKER_FIS' ||
      doc.kaynak === KAPI_EVRAK_KAYNAK
    ) {
      return false;
    }
    const isPending = doc.onayDurumu === 'ONAY BEKLİYOR' || doc.onayDurumu === 'FARK VAR — YÖNETİCİ BİLDİRİLDİ';
    if (!isPending) return false;
    const targets = (doc as any).onayGonderilenYoneticiMailleri;
    if (targets && Array.isArray(targets) && targets.length > 0) {
      return targets.includes(currentUser?.email);
    }
    return true;
  });

  const pendingInvoices = faturalar.filter(doc => {
    const isPending = doc.durum === 'KONTROL BEKLEYOR' || doc.durum === 'FARK VAR';
    if (!isPending) return false;
    const targets = (doc as any).onayGonderilenYoneticiMailleri;
    if (targets && Array.isArray(targets) && targets.length > 0) {
      return targets.includes(currentUser?.email);
    }
    return true;
  });

  const formenGirisTalepleri = personelGirisTalepleri.filter((p) => !isGoturuPersonelTalep(p));
  const goturuGirisTalepleri = personelGirisTalepleri.filter(isGoturuPersonelTalep);
  const formenCikisTalepleri = personelCikisTalepleri.filter((p) => !isGoturuPersonelTalep(p));
  const goturuCikisTalepleri = personelCikisTalepleri.filter(isGoturuPersonelTalep);
  const formenGuncellemeTalepleri = personelGuncellemeTalepleri.filter((p) => !isGoturuPersonelTalep(p));
  const goturuGuncellemeTalepleri = personelGuncellemeTalepleri.filter(isGoturuPersonelTalep);

  const isPendingGirisDurum = (p: any) => isPendingPersonelOnayDurum(p.durum);
  const isPendingCikisDurum = (p: any) => isPendingPersonelOnayDurum(p.durum);
  const pendingGirisCount = formenGirisTalepleri.filter(isPendingGirisDurum).length;
  const pendingCikisCount = formenCikisTalepleri.filter(isPendingCikisDurum).length;
  const pendingGuncellemeCount = formenGuncellemeTalepleri.filter((p) => p.durum === 'BEKLEMEDE').length;
  const pendingPersonelCount = pendingGirisCount + pendingCikisCount + pendingGuncellemeCount;
  const pendingGoturuGirisCount = goturuGirisTalepleri.filter(isPendingGirisDurum).length;
  const pendingGoturuCikisCount = goturuCikisTalepleri.filter(isPendingCikisDurum).length;
  const pendingGoturuGuncellemeCount = goturuGuncellemeTalepleri.filter((p) => p.durum === 'BEKLEMEDE').length;

  const matchedUserObj = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
  const currentUserRole = matchedUserObj?.yetki || 'YÖNETİCİ';

  const pendingKampSayimlar = kampSayimlar.filter((doc) => {
    if (!isMobilDocPending(doc)) return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const pendingKampFaaliyetler = kampFaaliyetler.filter((doc) => {
    if (!isMobilDocPending(doc)) return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const pendingTaseronSayimlar = kampTaseronSayimlari.filter((doc) => {
    if (doc.durum !== 'BEKLEMEDE') return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const pendingTesisatciFaaliyetler = tesisatciFaaliyetler.filter((doc) => {
    if (!isMobilDocPending(doc)) return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const pendingMermerciFaaliyetler = mermerciFaaliyetler.filter((doc) => {
    if (!isMobilDocPending(doc)) return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const pendingSeramikFaaliyetler = seramikFaaliyetler.filter((doc) => {
    if (!isMobilDocPending(doc)) return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const pendingOperatorSaha = operatorSahaFaaliyetler.filter((doc) => {
    if (!isMobilDocPending(doc)) return false;
    // Eski kayıtlar durum boşsa onaylı say — yalnızca açık ONAY BEKLİYOR / BEKLEMEDE
    if (!doc.durum || doc.durum === 'KAYITLI') return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const linkedKesintiIds = new Set(
    pendingOperatorSaha
      .map((s) => s.bagliOperatorFaaliyetId)
      .filter(Boolean)
      .map((id) => String(id))
  );

  const pendingOperatorKesintiler = operatorKesintiFaaliyetler.filter((doc) => {
    if (!isOperatorKesintiPending(doc)) return false;
    // Saha faaliyetine bağlı kesinti saha kartından onaylanır (çift listeleme yok)
    if (linkedKesintiIds.has(String(doc.id))) return false;
    return canApproveMobilDocuments(currentUserRole, currentUser?.email);
  });

  const operatorOnayCount = pendingOperatorKesintiler.length + pendingOperatorSaha.length;

  const pendingYildirimGateCount = gelenEvraklar.filter(
    (x) => x.durum === 'BEKLEMEDE' && x.kaynak === 'YILDIRIM_TANKER_FIS'
  ).length;

  const tesisatMermerCount =
    pendingTesisatciFaaliyetler.length +
    pendingMermerciFaaliyetler.length +
    pendingYildirimGateCount;

  const goturuOnayCount =
    pendingSeramikFaaliyetler.length +
    pendingGoturuGirisCount +
    pendingGoturuCikisCount +
    pendingGoturuGuncellemeCount;

  const isGoturuOnayTab = activeTab === 'goturu_belgeleri';
  const girisTalepleriForTab = isGoturuOnayTab ? goturuGirisTalepleri : formenGirisTalepleri;
  const cikisTalepleriForTab = isGoturuOnayTab ? goturuCikisTalepleri : formenCikisTalepleri;
  const guncellemeTalepleriForTab = isGoturuOnayTab ? goturuGuncellemeTalepleri : formenGuncellemeTalepleri;

  const pendingGunlukAkis = gunlukAkisRaporlari.filter(
    (doc) =>
      isMobilDocPending(doc) &&
      canApproveMobilDocuments(currentUserRole, currentUser?.email)
  );

  const pendingAracTalepleri = aracOnayTalepleri.filter(x => x.durum === 'ONAY BEKLİYOR');
  const pendingYolHarcamalari = yolHarcamalari.filter(x => x.durum === 'ONAY BEKLİYOR');
  const yolHarcamalariVisible = yolHarcamalari.filter(
    (x) => String(x.durum || '').toLocaleUpperCase('tr-TR') !== 'SİLİNDİ'
  );
  const pendingSoforCount = pendingAracTalepleri.length + pendingYolHarcamalari.length;

  const pendingStokCount = stokKartTalepleri.length;
  const pendingSayimCount = depoSayimTalepleri.length;
  const pendingDepocuCount = pendingStokCount + pendingSayimCount;

  // Vidanjör / mıcır-stabilize / Yıldırım Tanker özel panelde onaylanır — genel güvenlik sihirbazına düşmesin
  const pendingGateDocs = gelenEvraklar.filter(
    (x) =>
      x.durum === 'BEKLEMEDE' &&
      x.kaynak !== 'VIDANJOR_FIS' &&
      x.kaynak !== 'MICIR_STABILIZE_FIS' &&
      x.kaynak !== 'YILDIRIM_TANKER_FIS'
  );
  const pendingVidanjorGateCount = gelenEvraklar.filter(
    (x) => x.durum === 'BEKLEMEDE' && x.kaynak === 'VIDANJOR_FIS'
  ).length;
  const pendingMicirGateCount = gelenEvraklar.filter(
    (x) => x.durum === 'BEKLEMEDE' && x.kaynak === 'MICIR_STABILIZE_FIS'
  ).length;

  const totalPendingCount =
    pendingRequests.length +
    pendingWaybills.length +
    pendingInvoices.length +
    pendingPersonelCount +
    goturuOnayCount +
    pendingKampSayimlar.length +
    pendingKampFaaliyetler.length +
    pendingTaseronSayimlar.length +
    bekleyenKampPersonelleri.length +
    pendingKampFirmaTalepleri.length +
    tesisatMermerCount +
    operatorOnayCount +
    pendingGunlukAkis.length +
    pendingSoforCount +
    pendingDepocuCount +
    pendingGateDocs.length +
    pendingVidanjorGateCount +
    pendingMicirGateCount;

  const guvenlikCount =
    pendingWaybills.length + pendingMicirGateCount + pendingGateDocs.length;
  const kampciCount =
    pendingKampSayimlar.length +
    pendingKampFaaliyetler.length +
    pendingTaseronSayimlar.length +
    pendingVidanjorGateCount +
    bekleyenKampPersonelleri.length +
    pendingKampFirmaTalepleri.length;

  type OnayTab =
    | 'satin_alma'
    | 'guvenlik_belgeleri'
    | 'kampci_belgeleri'
    | 'tesisat_mermer_belgeleri'
    | 'goturu_belgeleri'
    | 'operator_belgeleri'
    | 'formen_belgeleri'
    | 'gunluk_loglar'
    | 'sofor_talepleri'
    | 'depocu_talepleri'
    | 'gecmis'
    | 'imzalar'
    | 'anahtarci_tutanaklari';

  const onayNavTabs: Array<{
    id: OnayTab;
    label: string;
    shortLabel: string;
    count?: number;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }> = [
    { id: 'satin_alma', label: 'Satın Alma', shortLabel: 'Satın Alma', count: pendingRequests.length + pendingSiparisler.length, icon: ShoppingCart },
    { id: 'guvenlik_belgeleri', label: 'Güvenlik Belgeleri', shortLabel: 'Güvenlik', count: guvenlikCount, icon: Truck },
    { id: 'kampci_belgeleri', label: 'Kampçı Belgeleri', shortLabel: 'Kampçı', count: kampciCount, icon: Package },
    { id: 'tesisat_mermer_belgeleri', label: 'Tesisatçı / Mermerci', shortLabel: 'Tesisat/Mermer', count: tesisatMermerCount, icon: FileText },
    { id: 'goturu_belgeleri', label: 'Götürü Onayları', shortLabel: 'Götürü', count: goturuOnayCount, icon: Layers },
    { id: 'operator_belgeleri', label: 'Operatör Belgeleri', shortLabel: 'Operatör', count: operatorOnayCount, icon: HardHat },
    { id: 'formen_belgeleri', label: 'Personel oluşturma', shortLabel: 'Personel', count: pendingPersonelCount, icon: UserCheck },
    { id: 'gunluk_loglar', label: 'Günlük Loglar', shortLabel: 'Loglar', count: pendingGunlukAkis.length, icon: FileText },
    { id: 'sofor_talepleri', label: 'Şoför Talepleri', shortLabel: 'Şoför', count: pendingSoforCount, icon: Truck },
    { id: 'depocu_talepleri', label: 'Depocu Talepleri', shortLabel: 'Depo', count: pendingDepocuCount, icon: Package },
    { id: 'anahtarci_tutanaklari', label: 'Anahtarcı Tutanakları', shortLabel: 'Anahtar', count: anahtarciTutanaklari.length, icon: FileText },
    { id: 'gecmis', label: 'Geçmiş Onaylar', shortLabel: 'Geçmiş', icon: CheckCircle },
    { id: 'imzalar', label: 'Dijital İmza & Onay', shortLabel: 'Dijital İmza', icon: PenTool },
  ];

  const activeTabMeta = onayNavTabs.find((t) => t.id === activeTab);

  // Gecmis onaylar list (approved or updated documents)
  const approvedRequests = satinAlmaTalepleri.filter(doc => doc.onayDurumu?.includes('TAMAMLANDI') || doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === 'DİJİTAL ONAYLANDI');
  const satinAlmaOnaylananListe = [...approvedRequests].sort(
    (a, b) =>
      String(b.tarih || '').localeCompare(String(a.tarih || '')) ||
      String(b.saId || '').localeCompare(String(a.saId || ''))
  );
  const approvedWaybills = irsaliyeler.filter(doc => doc.onayDurumu.includes('TAMAMLANDI') || doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === 'DİJİTAL ONAYLANDI');
  const approvedInvoices = faturalar.filter(doc => doc.durum === 'ONAYLANDI' || doc.durum === 'DİJİTAL ONAYLANDI');

  const filteredApprovedRequests = approvedRequests.filter(item => {
    const kw = onaySearchKeyword.toLowerCase().trim();
    if (!kw) return true;
    return (
      (item.saId || '').toLowerCase().includes(kw) ||
      (item.cariFirma || '').toLowerCase().includes(kw) ||
      (item.onayStamp || '').toLowerCase().includes(kw)
    );
  });

  const filteredApprovedWaybills = approvedWaybills.filter(item => {
    const kw = onaySearchKeyword.toLowerCase().trim();
    if (!kw) return true;
    return (
      (item.irsaliyeNo || '').toLowerCase().includes(kw) ||
      (item.firma || '').toLowerCase().includes(kw) ||
      (item.onayStamp || '').toLowerCase().includes(kw)
    );
  });

  const filteredApprovedInvoices = approvedInvoices.filter(item => {
    const kw = onaySearchKeyword.toLowerCase().trim();
    if (!kw) return true;
    return (
      (item.faturaNo || '').toLowerCase().includes(kw) ||
      (item.cariUnvan || '').toLowerCase().includes(kw) ||
      (item.onayStamp || '').toLowerCase().includes(kw)
    );
  });

  const handleApproveDocument = (type: 'request' | 'waybill' | 'invoice', docId: string) => {
    const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    const userRole = matchedUser?.yetki || "YÖNETİCİ";
    const uniqueHash = `KIB-SEC-${Math.abs(currentUser?.email?.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) || 1312)}-${Date.now().toString(36).toUpperCase()}`;
    const generatedStamp = `🔒 DİJİTAL ONAY VERİLDİ - Yetki Grubu: ${userRole} [Sertifika No: ${uniqueHash}]`;
    const todayStr = new Date().toISOString().split('T')[0];

    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === docId || item.saId === docId) {
          if (addNotification) {
            addNotification(`${item.saId} nolu satın alma talebi dijital olarak onaylandı.`);
          }
          return {
            ...item,
            onayDurumu: 'DİJİTAL ONAYLANDI', // transition to approved
            // Backed up approval stamp fields
            onaylayanYonetici: currentUser?.email || 'santiye@kibritci.com',
            onayStamp: generatedStamp,
            onayTarihi: todayStr,
            onaySignatureText: signatureText,
            onaySignatureStyle: signatureStyle
          } as any;
        }
        return item;
      }));
      alert("Satın Alma Talebi başarıyla onaylandı ve imzalandı.");
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === docId || item.irsaliyeId === docId || item.irsaliyeNo === docId) {
          if (addNotification) {
            addNotification(`${item.irsaliyeNo} nolu irsaliye teslimat belgesi dijital olarak onaylandı.`);
          }
          return {
            ...item,
            onayDurumu: 'DİJİTAL ONAYLANDI',
            onaylayanYonetici: currentUser?.email || 'santiye@kibritci.com',
            onayStamp: generatedStamp,
            onayTarihi: todayStr,
            onaySignatureText: signatureText,
            onaySignatureStyle: signatureStyle
          } as any;
        }
        return item;
      }));
      alert("İrsaliye Teslimat Belgesi başarıyla onaylandı ve imzalandı.");
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === docId || item.faturaNo === docId) {
          if (addNotification) {
            addNotification(`${item.faturaNo} nolu cari faturası onaylandı.`);
          }
          return {
            ...item,
            durum: 'DİJİTAL ONAYLANDI',
            onaylayanYonetici: currentUser?.email || 'santiye@kibritci.com',
            onayStamp: generatedStamp,
            onayTarihi: todayStr,
            onaySignatureText: signatureText,
            onaySignatureStyle: signatureStyle
          } as any;
        }
        return item;
      }));
      alert("Cari Faturası başarıyla muhasebeleştirilip onaylandı.");
    }
    setActiveDocForDetail(null);
  };

  const handleApproveSahaSiparis = async (siparis: SahaSiparis) => {
    if (
      !window.confirm(
        `${siparis.siparisNo} onaylansın mı?\nSatın alma talebi olarak içeri alınacak.`
      )
    ) {
      return;
    }
    try {
      const result = await approveSahaSiparisToSatinAlma({
        siparis,
        onaylayan: currentUser?.email || 'yonetici',
        cariKartlar,
        stokKartlar,
        satinAlmaTalepleri,
        setSatinAlmaTalepleri,
      });
      await addNotification?.(
        `Saha siparişi onaylandı ve satın alma talebi oluştu: ${result.sa.saId}`,
        {
          tip: 'SAHA_SIPARIS_ONAYLANDI',
          siparisId: siparis.id,
          saId: result.sa.saId,
          hedefTab: 'satin_alma',
        }
      );
      alert(`Onaylandı.\nSatın alma talebi: ${result.sa.saId}`);
    } catch (err: any) {
      alert('Onay başarısız: ' + (err?.message || ''));
    }
  };

  const handleRejectSahaSiparis = async (siparis: SahaSiparis) => {
    const neden = window.prompt('Red nedeni (opsiyonel):') || '';
    if (!window.confirm(`${siparis.siparisNo} reddedilsin mi?`)) return;
    try {
      await rejectSahaSiparis({
        siparis,
        onaylayan: currentUser?.email || 'yonetici',
        redNedeni: neden,
      });
      await addNotification?.(
        `Saha siparişi reddedildi: ${siparis.siparisNo}`,
        { tip: 'SAHA_SIPARIS_REDDEDILDI', siparisId: siparis.id }
      );
    } catch (err: any) {
      alert('Red başarısız: ' + (err?.message || ''));
    }
  };

  const handleRejectDocument = (type: 'request' | 'waybill' | 'invoice', docId: string) => {
    if (!window.confirm("Bu belgeyi reddetmek istediğinize emin misiniz?")) return;

    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === docId || item.saId === docId) {
          if (addNotification) {
            addNotification(`${item.saId} nolu satın alma talebi reddedildi.`);
          }
          return { ...item, onayDurumu: 'REDDEDİLDİ' };
        }
        return item;
      }));
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === docId || item.irsaliyeNo === docId) {
          if (addNotification) {
            addNotification(`${item.irsaliyeNo} nolu irsaliye teslimat belgesi reddedildi.`);
          }
          return { ...item, onayDurumu: 'FARK VAR — YÖNETİCİ BİLDİRİLDİ' };
        }
        return item;
      }));
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === docId || item.faturaNo === docId) {
          if (addNotification) {
            addNotification(`${item.faturaNo} nolu fatura reddedildi/fark bildirildi.`);
          }
          return { ...item, durum: 'FARK VAR' };
        }
        return item;
      }));
    }
    alert("Belge reddedildi.");
    setActiveDocForDetail(null);
  };

  const handleRejectGateDoc = async (id: string) => {
    if (!window.confirm("Bu güvenlik evrakını reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'guvenlikGelenEvraklar', id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Yönetici'
      });
      try {
        await updateDoc(doc(db, 'irsaliyeler', id), {
          onayDurumu: 'REDDEDİLDİ',
          onaylayanYonetici: currentUser?.email || 'Yönetici',
          onayTarihi: new Date().toISOString(),
        });
        setIrsaliyeler((prev) =>
          prev.map((item) =>
            item.id === id || item.irsaliyeId === id || item.guvenlikEvrakId === id
              ? { ...item, onayDurumu: 'REDDEDİLDİ' }
              : item
          )
        );
      } catch {
        /* kapı taslağı yoksa sorun değil */
      }
      alert("Evrak reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Hata oluştu.");
    }
  };

  const loadLiveCariStok = async (): Promise<{ cari: CariKart[]; stok: StokKart[] }> => {
    let liveCari = cariKartlar || [];
    let liveStok = stokKartlar || [];
    if (!liveCari.length || !liveStok.length) {
      const [cariSnap, stokSnap] = await Promise.all([
        getDocs(collection(db, 'cariKartlar')),
        getDocs(collection(db, 'stokKartlar')),
      ]);
      if (!liveCari.length) {
        liveCari = [];
        cariSnap.forEach((d) => liveCari.push({ id: d.id, ...(d.data() as any) }));
      }
      if (!liveStok.length) {
        liveStok = [];
        stokSnap.forEach((d) => liveStok.push({ id: d.id, ...(d.data() as any) }));
      }
    }
    return { cari: liveCari, stok: liveStok };
  };

  /** Güvenlik irsaliyesini 2 geçişli eşleştir; yeni kart açmaz. */
  const rematchGateIrsaliye = async (
    firma: string,
    kalemler: any[]
  ): Promise<ReturnType<typeof doubleCheckKapiMatch>> => {
    const { cari, stok } = await loadLiveCariStok();
    return doubleCheckKapiMatch(firma, kalemler || [], cari, stok);
  };

  const applyIrsaliyeMatchToForm = (matched: ReturnType<typeof doubleCheckKapiMatch>, base?: any) => {
    setIrsaliyeFirma(matched.summary.cariUnvan || base?.firma || irsaliyeFirma);
    setIrsaliyeKalemler(matched.kalemler);
    setActiveGateDoc((prev: any) =>
      prev
        ? {
            ...prev,
            matchSummary: matched.summary,
            cariKartId: matched.summary.cariKartId || prev.cariKartId,
            firma: matched.summary.cariUnvan || prev.firma,
            kalemler: matched.kalemler,
          }
        : prev
    );
  };

  const handleRematchActiveGateIrsaliye = async () => {
    if (!activeGateDoc) return;
    try {
      const matched = await rematchGateIrsaliye(
        irsaliyeFirma || activeGateDoc.firma || '',
        irsaliyeKalemler.length ? irsaliyeKalemler : activeGateDoc.kalemler || []
      );
      applyIrsaliyeMatchToForm(matched, activeGateDoc);
      alert(
        `İkinci kontrol tamam.\n${formatKapiMatchLabel(matched.summary)}` +
          (matched.summary.unmatchedKalemler?.length
            ? `\nEşleşmeyen (onayda stok kartı açılır): ${matched.summary.unmatchedKalemler.join(', ')}`
            : '\nMevcut cari/stok kartlarına bağlandı.') +
          (matched.summary.cariMatched
            ? ''
            : '\nCari yoksa onayda yeni tedarikçi kartı açılır.')
      );
    } catch (err) {
      console.error(err);
      alert('Yeniden eşleştirme başarısız.');
    }
  };

  /**
   * Listeden tek tık: 2× eşleştir → cari/stok oluştur veya bağla → onayla.
   */
  const handleQuickApproveGateIrsaliye = async (docItem: any) => {
    const tur = docItem?.evrakTuru || 'İRSALİYE';
    if (tur !== 'İRSALİYE') {
      handleOpenGateDocApproval(docItem);
      return;
    }
    if (!docItem?.firma && !(docItem?.kalemler || []).length) {
      alert('Evrakta firma/kalem yok. Önce YZ ile okutup kontrol edin.');
      handleOpenGateDocApproval(docItem);
      return;
    }

    try {
      const matched = await rematchGateIrsaliye(docItem.firma || '', docItem.kalemler || []);
      const label = formatKapiMatchLabel(matched.summary);
      let saId = String(docItem.saId || '').trim();
      if (!saId) {
        const oneriler = suggestSatinAlmaForKapiEvrak({
          firma: matched.summary.cariUnvan || docItem.firma,
          cariKartId: matched.summary.cariKartId || docItem.cariKartId,
          kalemler: matched.kalemler,
          satinAlmaTalepleri,
          irsaliyeler,
          limit: 3,
        });
        const top = oneriler[0];
        if (top && top.score >= 40) {
          const bind = window.confirm(
            `Akıllı eşleşme: ${top.saId} · ${top.cariFirma}\n(${top.reason})\n\n` +
              `İlgili satın alma talebine irsaliye bağlamak ister misiniz?\n` +
              `• Evet → karşılaştırma · • Hayır → arşiv/doğrudan sevk`
          );
          if (bind) saId = top.saId;
        }
      }
      const ok = window.confirm(
        `Güvenlik irsaliyesini eşleştirip onaylayayım mı?\n\n` +
          `No: ${docItem.evrakNo || docItem.id}\n` +
          `Firma: ${matched.summary.cariUnvan || docItem.firma || '—'}\n` +
          `${label}${saId ? `\nSA: ${saId}` : ' (SA bağlı değil)'}\n` +
          (matched.summary.cariMatched
            ? '→ Mevcut cari kartın altına işlem kaydı yazılacak.\n'
            : '→ Cari eşleşmezse cari işlem yazılmaz; evrak yine arşivlenir.\n') +
          (matched.summary.stokLinked
            ? `→ ${matched.summary.stokLinked} stok kartına giriş işlenecek.\n`
            : '→ Stok eşleşmezse stok hareketi yazılmaz; kalem irsaliyede kalır.\n')
      );
      if (!ok) return;

      const { cari, stok } = await loadLiveCariStok();
      const { irsaliye, summary } = await finalizeKapiIrsaliyeApproval({
        guvenlikEvrakId: docItem.id,
        irsaliyeNo: docItem.evrakNo || docItem.id,
        firma: matched.summary.cariUnvan || docItem.firma || '',
        tarih: docItem.tarih || new Date().toISOString().split('T')[0],
        fotoUrl: pickPrimaryFotoUrl(docItem) || docItem.fotoUrl || '',
        kalemler: matched.kalemler,
        onaylayan: currentUser?.email || 'Yönetici',
        cariKartlar: cari,
        stokKartlar: stok,
        setIrsaliyeler,
        setCariIslemGecmisi,
        setStokKartlar,
        setStokIslemGecmisi,
        saId: saId || undefined,
        satinAlmaTalepleri,
        irsaliyeler,
      });

      await updateDoc(doc(db, 'guvenlikGelenEvraklar', docItem.id), cleanUndefined({
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        islenenEvrakTuru: 'İRSALİYE',
        irsaliyeId: docItem.id,
        cariKartId: summary.cariKartId || '',
        matchSummary: summary,
        evrakNo: docItem.evrakNo || docItem.id,
        firma: summary.cariUnvan || docItem.firma || '',
        tarih: docItem.tarih || new Date().toISOString().split('T')[0],
        kalemler: irsaliye.kalemler,
        saId: saId || '',
        donusumKaynagi: saId ? 'KAPI_SA_ESLESME' : 'KAPI_EVRAK',
        onayTarihi: new Date().toISOString(),
      }));

      if (addNotification) {
        addNotification(`Kapı irsaliyesi onaylandı (${docItem.evrakNo || docItem.id}) · ${formatKapiMatchLabel(summary)}`);
      }
      alert(`Onaylandı.\n${formatKapiMatchLabel(summary)}\nCari ve stok kayıtları işlendi.`);
    } catch (err) {
      console.error(err);
      alert('Hızlı onay başarısız. Formdan kontrol edip tekrar deneyin.');
      handleOpenGateDocApproval(docItem);
    }
  };

  const handleOpenGateDocApproval = async (docItem: any) => {
    setActiveGateDoc(docItem);
    setSelectedDocType(docItem.evrakTuru || 'İRSALİYE');
    setIsAiResolving(false);
    
    if (docItem.aiParsed) {
      setFaturaNo(docItem.evrakNo || '');
      setFaturaFirma(docItem.firma || '');
      setFaturaTarih(docItem.tarih || new Date().toISOString().split('T')[0]);
      setFaturaToplam(docItem.toplamTutar || 0);
      setFaturaKdv(docItem.kdvTutar || 0);
      setFaturaGenelToplam(docItem.genelToplam || 0);
      setFaturaKalemler(docItem.kalemler || []);

      setIrsaliyeNo(docItem.evrakNo || '');
      setIrsaliyeFirma(docItem.firma || '');
      setIrsaliyeTarih(docItem.tarih || new Date().toISOString().split('T')[0]);
      setIrsaliyeKalemler(docItem.kalemler || []);

      setMakbuzRefNo(docItem.evrakNo || '');
      setMakbuzFirma(docItem.firma || '');
      setMakbuzTarih(docItem.tarih || new Date().toISOString().split('T')[0]);
      setMakbuzTutar(docItem.tutar || 0);
      setMakbuzAciklama(docItem.aciklama || '');
      setMakbuzTip(docItem.hareketTipi || 'ÇIKIŞ');

      setGenelAciklama(docItem.aciklama || '');

      setApprovalStep('FORM');

      // İrsaliye: açılışta 2. kontrol eşleştirmesi (yeni kart açmadan)
      if ((docItem.evrakTuru || 'İRSALİYE') === 'İRSALİYE' && (docItem.firma || docItem.kalemler?.length)) {
        try {
          const matched = await rematchGateIrsaliye(docItem.firma || '', docItem.kalemler || []);
          setIrsaliyeFirma(matched.summary.cariUnvan || docItem.firma || '');
          setIrsaliyeKalemler(matched.kalemler);
          setActiveGateDoc((prev: any) =>
            prev
              ? {
                  ...prev,
                  matchSummary: matched.summary,
                  cariKartId: matched.summary.cariKartId || prev.cariKartId,
                  firma: matched.summary.cariUnvan || prev.firma,
                  kalemler: matched.kalemler,
                }
              : prev
          );
        } catch (err) {
          console.error('Kapı açılış eşleştirme:', err);
        }
      }
    } else {
      // Clear all forms
      setFaturaNo('');
      setFaturaFirma('');
      setFaturaTarih('');
      setFaturaToplam(0);
      setFaturaKdv(0);
      setFaturaGenelToplam(0);
      setFaturaKalemler([]);

      setIrsaliyeNo('');
      setIrsaliyeFirma('');
      setIrsaliyeTarih('');
      setIrsaliyeKalemler([]);

      setMakbuzRefNo('');
      setMakbuzFirma('');
      setMakbuzTarih('');
      setMakbuzTutar(0);
      setMakbuzAciklama('');
      setMakbuzTip('ÇIKIŞ');

      setGenelAciklama('');

      setApprovalStep('SELECT_METHOD');
    }
  };

  const handleStartManualGateDocApproval = () => {
    if (activeGateDoc) {
      const type = selectedDocType;
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (type === 'FATURA') {
        setFaturaNo(activeGateDoc.evrakNo || '');
        setFaturaFirma(activeGateDoc.firma || '');
        setFaturaTarih(activeGateDoc.tarih || todayStr);
        setFaturaKalemler(activeGateDoc.kalemler || []);
      } else if (type === 'İRSALİYE') {
        setIrsaliyeNo(activeGateDoc.evrakNo || '');
        setIrsaliyeFirma(activeGateDoc.firma || '');
        setIrsaliyeTarih(activeGateDoc.tarih || todayStr);
        setIrsaliyeKalemler(activeGateDoc.kalemler || []);
      } else if (type === 'MAKBUZ') {
        setMakbuzRefNo(activeGateDoc.evrakNo || '');
        setMakbuzFirma(activeGateDoc.firma || '');
        setMakbuzTarih(activeGateDoc.tarih || todayStr);
        setMakbuzAciklama(activeGateDoc.aciklama || '');
      } else if (type === 'GENEL_EVRAK') {
        setGenelAciklama(activeGateDoc.aciklama || '');
      }
    }
    setApprovalStep('FORM');
  };

  const handleAnalyzeGateDocWithAi = async () => {
    if (!activeGateDoc) {
      alert("Evrak içeriği veya fotoğrafı bulunamadı!");
      return;
    }

    const primaryUrl = pickPrimaryFotoUrl(activeGateDoc);
    const kalemUrl = activeGateDoc.kalemFotolar?.[0]?.dataUrl || primaryUrl;
    const firmaUrl = activeGateDoc.firmaFotolar?.[0]?.dataUrl || primaryUrl;
    const faturaUrl = activeGateDoc.faturaFotolar?.[0]?.dataUrl || primaryUrl;
    const preferredUrl =
      selectedDocType === 'FATURA'
        ? faturaUrl
        : selectedDocType === 'İRSALİYE'
          ? kalemUrl || firmaUrl
          : firmaUrl || primaryUrl;

    if (!preferredUrl) {
      alert("Evrak içeriği veya fotoğrafı bulunamadı!");
      return;
    }

    const payload = await toAiParsePayload(preferredUrl);
    if (!payload) {
      alert("Evrak içeriği okunamadı (fotoğraf indirilemedi veya geçersiz)!");
      return;
    }
    const { mimeType, fileBase64 } = payload;

    let docTypeParam = 'general';
    if (selectedDocType === 'FATURA') docTypeParam = 'fatura';
    if (selectedDocType === 'İRSALİYE') docTypeParam = 'irsaliye';
    if (selectedDocType === 'MAKBUZ') docTypeParam = 'makbuz';

    setIsAiResolving(true);
    try {
      const response: any = await fetchApiJson('/api/parse-legacy-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mimeType,
          docType: docTypeParam
        })
      });

      if (response && !response.error) {
        const parsed = response;
        const todayStr = new Date().toISOString().split('T')[0];
        
        if (selectedDocType === 'FATURA') {
          setFaturaNo(parsed.faturaNo || activeGateDoc.evrakNo || '');
          setFaturaFirma(parsed.cariUnvan || activeGateDoc.firma || '');
          setFaturaTarih(parsed.tarih || activeGateDoc.tarih || todayStr);
          setFaturaToplam(parsed.toplamTutar || 0);
          setFaturaKdv(parsed.kdvTutar || 0);
          setFaturaGenelToplam(parsed.genelToplam || 0);
          setFaturaKalemler(parsed.kalemler || []);
        } else if (selectedDocType === 'İRSALİYE') {
          let firma = parsed.firma || activeGateDoc.firma || '';
          if (firmaUrl && firmaUrl !== preferredUrl) {
            const firmaPayload = await toAiParsePayload(firmaUrl);
            if (firmaPayload) {
              try {
                const firmaRes: any = await fetchApiJson('/api/parse-legacy-document', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    fileBase64: firmaPayload.fileBase64,
                    mimeType: firmaPayload.mimeType,
                    docType: 'irsaliye',
                  }),
                });
                if (firmaRes && !firmaRes.error && firmaRes.firma) {
                  firma = firmaRes.firma;
                }
              } catch {
                /* ignore */
              }
            }
          }
          const kalemler = parsed.kalemler || [];
          const { summary, kalemler: linked } = doubleCheckKapiMatch(
            firma,
            kalemler,
            cariKartlar,
            stokKartlar
          );
          setIrsaliyeNo(parsed.irsaliyeNo || activeGateDoc.evrakNo || '');
          setIrsaliyeFirma(summary.cariUnvan || firma);
          setIrsaliyeTarih(parsed.tarih || activeGateDoc.tarih || todayStr);
          setIrsaliyeKalemler(linked.length ? linked : kalemler);
          setActiveGateDoc((prev: any) =>
            prev
              ? {
                  ...prev,
                  matchSummary: summary,
                  cariKartId: summary.cariKartId || prev.cariKartId,
                }
              : prev
          );
        } else if (selectedDocType === 'MAKBUZ') {
          setMakbuzRefNo(parsed.referansId || activeGateDoc.evrakNo || '');
          setMakbuzFirma(parsed.firma || activeGateDoc.firma || '');
          setMakbuzTarih(parsed.tarih || activeGateDoc.tarih || todayStr);
          setMakbuzTutar(parsed.tutar || 0);
          setMakbuzAciklama(parsed.aciklama || activeGateDoc.aciklama || '');
          setMakbuzTip(parsed.hareketTipi === 'GİRİŞ' ? 'GİRİŞ' : 'ÇIKIŞ');
        }
        
        setApprovalStep('FORM');
        alert("Yapay Zeka evrakı başarıyla çözümledi! Lütfen bilgileri kontrol edip onaylayın.");
      } else {
        alert("Yapay Zeka çözümleme yapamadı: " + (response?.error || 'Bilinmeyen hata'));
        handleStartManualGateDocApproval();
      }
    } catch (err) {
      console.error(err);
      alert("Yapay Zeka servisiyle iletişim kurulurken hata oluştu! Manuel girişe yönlendiriliyorsunuz.");
      handleStartManualGateDocApproval();
    } finally {
      setIsAiResolving(false);
    }
  };

  const handleSaveGateDocApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGateDoc) return;

    try {
      const type = selectedDocType;
      const docId = activeGateDoc.id;

      if (type === 'FATURA') {
        if (!faturaNo || !faturaFirma || !faturaTarih) {
          alert("Lütfen Fatura No, Firma ve Tarih alanlarını doldurun!");
          return;
        }
        const { cari: liveCari } = await loadLiveCariStok();
        const cariHit = resolveCariKartId(faturaFirma, liveCari);
        const newFatura = {
          id: docId,
          faturaNo,
          tarih: faturaTarih,
          cariKartId: cariHit.cariKartId || '',
          cariUnvan: cariHit.cariUnvan || faturaFirma,
          toplamTutar: Number(faturaToplam),
          kdvTutar: Number(faturaKdv),
          genelToplam: Number(faturaGenelToplam),
          durum: 'ONAYLANDI',
          evrakUrl: pickEvrakDisplayUrl(activeGateDoc) || pickPrimaryFotoUrl(activeGateDoc) || "",
          kalemler: faturaKalemler.map(x => ({
            urunAdi: x.urunAdi,
            amount: Number(x.miktar),
            miktar: Number(x.miktar),
            birim: x.birim || 'Adet',
            birimFiyat: Number(x.birimFiyat || 0),
            kdvOran: Number(x.kdvOran || 20),
            toplam: Number(x.toplam || 0)
          })),
          bagliIrsaliyeler: [],
          donusumKaynagi: 'KAPI_EVRAK',
          kaynak: 'KAPI_EVRAK',
          guvenlikEvrakId: docId,
          onaylayanYonetici: currentUser?.email || 'Yönetici',
          onayTarihi: new Date().toISOString()
        };
        await setDoc(doc(db, 'faturalar', docId), newFatura);
        if (cariHit.matched && cariHit.cariKartId) {
          const cariRow = buildCariEvrakHistory({
            cariKartId: cariHit.cariKartId,
            islemTipi: 'FATURA',
            islemId: docId,
            islemBaslik: `Kapı Faturası · ${cariHit.cariUnvan}`,
            islemDetay: `${faturaNo} · güvenlik kapısı (yeni kart açılmadı)`,
            tarih: faturaTarih,
            belgeNo: faturaNo,
            tutar: Number(faturaGenelToplam) || Number(faturaToplam) || 0,
          });
          await saveDocument('cariIslemGecmisi', cariRow);
          appendCariIslemOnce(setCariIslemGecmisi, cariRow);
        }
      } else if (type === 'İRSALİYE') {
        if (!irsaliyeNo || !irsaliyeFirma || !irsaliyeTarih) {
          alert("Lütfen İrsaliye No, Firma ve Tarih alanlarını doldurun!");
          return;
        }

        let liveCari = cariKartlar;
        let liveStok = stokKartlar;
        if (!liveCari.length || !liveStok.length) {
          const loaded = await loadLiveCariStok();
          liveCari = loaded.cari;
          liveStok = loaded.stok;
        }

        const rematched = doubleCheckKapiMatch(
          irsaliyeFirma,
          irsaliyeKalemler,
          liveCari,
          liveStok
        );
        setIrsaliyeFirma(rematched.summary.cariUnvan || irsaliyeFirma);
        setIrsaliyeKalemler(rematched.kalemler);

        const { irsaliye, summary } = await finalizeKapiIrsaliyeApproval({
          guvenlikEvrakId: docId,
          irsaliyeNo,
          firma: rematched.summary.cariUnvan || irsaliyeFirma,
          tarih: irsaliyeTarih,
          fotoUrl: pickEvrakDisplayUrl(activeGateDoc) || pickPrimaryFotoUrl(activeGateDoc) || '',
          kalemler: rematched.kalemler,
          onaylayan: currentUser?.email || 'Yönetici',
          cariKartlar: liveCari,
          stokKartlar: liveStok,
          setIrsaliyeler,
          setCariIslemGecmisi,
          setStokKartlar,
          setStokIslemGecmisi,
          saId: String(activeGateDoc?.saId || '').trim() || undefined,
          satinAlmaTalepleri,
          irsaliyeler,
        });

        await updateDoc(doc(db, 'guvenlikGelenEvraklar', docId), cleanUndefined({
          durum: 'ONAYLANDI',
          onaylayanYonetici: currentUser?.email || 'Yönetici',
          islenenEvrakTuru: type,
          irsaliyeId: docId,
          cariKartId: summary.cariKartId || '',
          matchSummary: summary,
          evrakNo: irsaliyeNo,
          firma: summary.cariUnvan || irsaliyeFirma,
          tarih: irsaliyeTarih,
          kalemler: irsaliye.kalemler,
          saId: String(activeGateDoc?.saId || summary.saId || '').trim() || '',
          donusumKaynagi: String(activeGateDoc?.saId || summary.saId || '').trim()
            ? 'KAPI_SA_ESLESME'
            : 'KAPI_EVRAK',
          onayTarihi: new Date().toISOString(),
        }));

        if (addNotification) {
          addNotification(
            `Kapı irsaliyesi onaylandı (${irsaliyeNo}) · ${formatKapiMatchLabel(summary)}`
          );
        }

        alert(
          `İrsaliye onaylandı.\n${formatKapiMatchLabel(summary)}\n` +
            (summary.cariMatched
              ? 'Mevcut cari kartın altına işlem kaydı yazıldı.\n'
              : 'Cari eşleşmedi; evrak ve irsaliye arşivlendi.\n') +
            (summary.stokLinked
              ? `${summary.stokLinked}/${summary.stokTotal} stok kalemine giriş işlendi.`
              : 'Stok eşleşmedi; kalemler irsaliyede kaldı, stok hareketi yazılmadı.')
        );
        setActiveGateDoc(null);
        return;

      } else if (type === 'MAKBUZ') {
        if (!makbuzRefNo || !makbuzFirma || !makbuzTarih || !makbuzTutar) {
          alert("Lütfen Fiş/Makbuz No, Muhatap Firma, Tarih ve Tutar alanlarını doldurun!");
          return;
        }
        const newKasaHareket = {
          id: docId,
          referansNo: makbuzRefNo,
          tarih: makbuzTarih,
          cariUnvan: makbuzFirma,
          tutar: Number(makbuzTutar),
          aciklama: makbuzAciklama || 'Güvenlik kapısı makbuzu',
          hareketTipi: makbuzTip,
          kategori: 'GÜVENLİK_MAKBUZ',
          evrakUrl: pickEvrakDisplayUrl(activeGateDoc) || pickPrimaryFotoUrl(activeGateDoc) || "",
          durum: 'ONAYLANDI',
          kaydeden: activeGateDoc.kaydeden || '',
          onaylayanYonetici: currentUser?.email || 'Yönetici',
          onayTarihi: new Date().toISOString()
        };
        await setDoc(doc(db, 'kasaHareketleri', docId), newKasaHareket);

      } else if (type === 'GENEL_EVRAK') {
        const newGenelLog = {
          id: docId,
          tarih: new Date().toISOString().split('T')[0],
          saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          evrakNo: activeGateDoc.evrakNo || 'GENEL',
          aciklama: genelAciklama || activeGateDoc.aciklama || 'Genel Evrak Teslimi',
          fotoUrl: pickEvrakDisplayUrl(activeGateDoc) || pickPrimaryFotoUrl(activeGateDoc) || '',
          durum: 'ONAYLANDI',
          onayleyen: currentUser?.email || 'Yönetici'
        };
        await setDoc(doc(db, 'guvenlikGenelEvraklar', docId), newGenelLog);
      }

      await updateDoc(doc(db, 'guvenlikGelenEvraklar', docId), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        islenenEvrakTuru: type
      });

      if (addNotification) {
        addNotification(`Güvenlik kapısından gelen evrak (${type}, Ref: ${activeGateDoc.id}) onaylandı ve arşivlendi.`);
      }

      alert("Evrak başarıyla onaylandı ve ilgili arşive kaydedildi!");
      setActiveGateDoc(null);
    } catch (err) {
      console.error(err);
      const detail = formatFirestoreWriteError(err) || (err instanceof Error ? err.message : String(err || ''));
      alert(
        detail
          ? `Kaydedilirken hata oluştu:\n${detail}`
          : 'Kaydedilirken veritabanı hatası oluştu!'
      );
    }
  };

  return (
    <div
      className="flex-1 overflow-hidden flex flex-col select-none onay-havuzu-shell"
      style={{
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        color: '#15252B',
        background:
          'radial-gradient(1200px 420px at 0% -10%, rgba(15,108,92,0.10), transparent 55%), radial-gradient(900px 380px at 100% 0%, rgba(196,122,42,0.08), transparent 50%), linear-gradient(180deg, #F3F6F7 0%, #E8EEF0 100%)',
      }}
    >
      {/* Brand header */}
      <header className="shrink-0 border-b border-[#D5DEE3] bg-white/85 backdrop-blur-md">
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-end gap-3 min-w-0">
            <KibritciLogo size="lg" className="h-12 sm:h-14 shrink-0" />
            <div className="min-w-0 pb-0.5">
              <p
                className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#0F6C5C]"
                style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
              >
                Kibritçi İnşaat
              </p>
              <h1
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#15252B] leading-none"
                style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
              >
                Onay Havuzu
              </h1>
              <p className="text-[11px] text-[#5B6B73] mt-1 truncate">
                Bekleyen talepleri inceleyin, imzalayın ve arşivleyin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl border border-[#D5DEE3] bg-[#F7FAFA] px-3 py-2 text-right">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-[#7A8A91] block">Bekleyen</span>
              <strong
                className="text-lg font-extrabold text-[#0F6C5C] leading-none tabular-nums"
                style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
              >
                {totalPendingCount}
              </strong>
            </div>
            <div className="rounded-xl border border-[#D5DEE3] bg-white px-3 py-2 min-w-[140px]">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-[#7A8A91] block">Onaylayan</span>
              <strong className="text-[11px] font-semibold text-[#15252B] block truncate">
                {currentUser?.name || currentUser?.displayName || currentUser?.email || 'Kullanıcı'}
              </strong>
              <span className="text-[10px] text-[#5B6B73]">
                {currentUser?.email === 'sametatak9@gmail.com' ? 'Proje Müdürü' : 'Şantiye Yetkilisi'}
              </span>
            </div>
          </div>
        </div>

        {/* Horizontal tabs */}
        <nav className="px-3 sm:px-5 pb-3 overflow-x-auto">
          <div className="flex items-stretch gap-1.5 min-w-max">
            {onayNavTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              const hasCount = typeof tab.count === 'number' && tab.count > 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200 border ${
                    active
                      ? 'bg-[#0F6C5C] text-white border-[#0F6C5C] shadow-[0_8px_20px_-12px_rgba(15,108,92,0.7)]'
                      : 'bg-white/70 text-[#3D4F56] border-[#D5DEE3] hover:border-[#0F6C5C]/50 hover:bg-white'
                  }`}
                >
                  <Icon size={14} className={active ? 'text-white' : 'text-[#0F6C5C]'} />
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">{tab.shortLabel}</span>
                  {hasCount && (
                    <span
                      className={`tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        active ? 'bg-white/20 text-white' : 'bg-[#E3F2EE] text-[#0F6C5C]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Workspace */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
          {activeTabMeta && activeTab !== 'guvenlik_belgeleri' && (
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2
                  className="text-xl font-extrabold tracking-tight text-[#15252B]"
                  style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
                >
                  {activeTabMeta.label}
                </h2>
                <p className="text-[11px] text-[#5B6B73] mt-0.5">
                  {typeof activeTabMeta.count === 'number'
                    ? `${activeTabMeta.count} kayıt bu bölümde`
                    : 'Onay geçmişi ve arşiv kayıtları'}
                </p>
              </div>
              {typeof activeTabMeta.count === 'number' && activeTabMeta.count > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F6C5C] bg-[#E3F2EE] border border-[#B9DBD2] px-2.5 py-1 rounded-lg">
                  İnceleme bekliyor
                </span>
              )}
            </div>
          )}

          {activeTab === 'satin_alma' && (
            <div className="space-y-5">
              <div className="border bg-white/90 p-4 rounded-2xl border-[#D5DEE3]">
                <p className="text-[#5B6B73] leading-relaxed text-[12px]">
                  Saha sipariş formundan gelen talepler burada incelenir. Onaylarsanız içeride satın
                  alma talebi oluşur. Mevcut satın alma taleplerini de dijital imzanızla onaylayabilirsiniz.
                </p>
              </div>

              {pendingSiparisler.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-display font-black text-xs text-slate-600 tracking-wider uppercase">
                    Saha siparişleri ({pendingSiparisler.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingSiparisler.map((sip) => (
                      <div
                        key={sip.id}
                        className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-mono bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {sip.siparisNo}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono font-semibold">{sip.tarih}</span>
                        </div>
                        <div>
                          <p className="text-[13px] text-slate-900 font-semibold">
                            {sip.personelAdSoyad}
                            {sip.personelGorev ? ` · ${sip.personelGorev}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Kullanılacak yer: {sip.kullanilacakYer}
                          </p>
                          {sip.cariFirma ? (
                            <p className="text-[11px] text-slate-500 mt-0.5">Tedarikçi: {sip.cariFirma}</p>
                          ) : null}
                          {sip.aciklama ? (
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{sip.aciklama}</p>
                          ) : null}
                        </div>
                        <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] font-mono text-slate-600">
                          {(sip.kalemler || []).slice(0, 4).map((k) => (
                            <div key={k.id} className="flex justify-between gap-2">
                              <span className="truncate">{k.urunAdi}</span>
                              <span className="font-bold shrink-0">
                                {k.miktar} {k.birim}
                              </span>
                            </div>
                          ))}
                          {(sip.kalemler || []).length > 4 && (
                            <p className="text-[10px] text-slate-400">
                              + {(sip.kalemler || []).length - 4} kalem daha
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRejectSahaSiparis(sip)}
                            className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 py-2 px-3 rounded-xl text-[11px] font-bold cursor-pointer"
                          >
                            Reddet
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveSahaSiparis(sip)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-xl text-[11px] font-bold cursor-pointer"
                          >
                            Onayla → Satın Alma
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingRequests.length === 0 && pendingSiparisler.length === 0 ? (
                <div className="bg-white/90 rounded-2xl p-12 text-center border border-[#D5DEE3]">
                  <h3 className="text-sm font-bold text-[#15252B]">Onay bekleyen satın alma talebi yok</h3>
                  <p className="text-xs text-[#5B6B73] mt-1">Bu kuyruk güncel.</p>
                </div>
              ) : pendingRequests.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pendingRequests.map(doc => (
                    <div
                      key={doc.id}
                      className="bg-white border border-[#D5DEE3] rounded-2xl flex flex-col justify-between hover:border-[#0F6C5C]/40 transition-all duration-200 overflow-hidden"
                      style={{ boxShadow: '0 1px 0 rgba(21,37,43,0.04)' }}
                    >
                      <div className="h-1 bg-gradient-to-r from-[#0F6C5C] to-[#C47A2A]" />
                      <div className="p-4 space-y-3 flex flex-col flex-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-mono bg-[#FFF6EB] border border-[#F0D9B5] text-[#9A5B12] text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {doc.saId || 'KOD YOK'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <AcilOnayBadge tarih={(doc as any).gonderimTarihi || doc.tarih} />
                            <span className="text-[10px] text-[#7A8A91] font-mono font-semibold">{doc.tarih}</span>
                          </span>
                        </div>
                        <div>
                          <p className="text-[13px] text-[#15252B] font-semibold leading-snug">{doc.cariFirma}</p>
                          <p className="text-[11px] text-[#5B6B73] mt-0.5">Talep eden: {doc.talepEden}</p>
                          {doc.aciklama && (
                            <p className="text-[11px] text-[#5B6B73] mt-1 line-clamp-2">{doc.aciklama}</p>
                          )}
                        </div>
                        <div className="pt-2 border-t border-[#E8EEF0]">
                          <span className="text-[9px] text-[#7A8A91] font-bold uppercase tracking-wider block mb-1">Kalemler</span>
                          <div className="space-y-1 text-[11px] font-mono text-[#5B6B73]">
                            {doc.kalemler?.slice(0, 3).map((k, idx) => (
                              <div key={k.id || idx} className="flex justify-between gap-2">
                                <span className="truncate">{k.urunAdi}</span>
                                <span className="text-[#15252B] font-bold shrink-0">{k.miktar} {k.birim}</span>
                              </div>
                            ))}
                            {doc.kalemler?.length > 3 && (
                              <div className="text-[10px] text-[#7A8A91]">+ {doc.kalemler.length - 3} kalem daha</div>
                            )}
                          </div>
                        </div>
                        <ImzaOnizlemeStrip doc={doc} pendingSignatureText={signatureText} />
                        <div className="flex gap-2 pt-1 mt-auto">
                          <button
                            onClick={() => setActiveDocForDetail({ id: doc.id, type: 'request', data: doc })}
                            className="flex-1 bg-[#F3F6F7] border border-[#D5DEE3] hover:bg-[#E8EEF0] text-[#15252B] py-2 px-3 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1"
                          >
                            <Eye size={12} />
                            <span>Detay</span>
                          </button>
                          <button
                            onClick={() => handleApproveDocument('request', doc.id)}
                            className="flex-1 bg-[#0F6C5C] hover:bg-[#0C584B] active:scale-[0.98] text-white py-2 px-3 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1"
                          >
                            <Check size={12} />
                            <span>Onayla</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {satinAlmaOnaylananListe.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider uppercase">
                        Onaylanan satın almalar ({satinAlmaOnaylananListe.length})
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Onaylanan talepler burada kalır. Evrakı Gör ile Kibritçi antetli HTML belge açılır.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {satinAlmaOnaylananListe.map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-white border border-emerald-100 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {doc.saId || 'KOD YOK'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono font-semibold">{doc.tarih}</span>
                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full">
                              {doc.onayDurumu}
                            </span>
                          </div>
                          <p className="text-[13px] text-slate-900 font-semibold truncate">{doc.cariFirma}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {doc.talepEden ? `Talep eden: ${doc.talepEden}` : ''}
                            {(doc.kalemler || []).length
                              ? ` · ${(doc.kalemler || []).length} kalem`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleViewSatinAlmaEvrak(doc)}
                          className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-[#0f2744] hover:bg-[#17365c] text-[#f4ead5] px-3 py-2 rounded-xl text-[11px] font-bold cursor-pointer"
                        >
                          <FileText size={13} />
                          Evrakı Gör
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'guvenlik_belgeleri' && (
            <div className="space-y-6">
            <MicirFisOnayPanel
              currentUser={currentUser}
              cariKartlar={cariKartlar}
              setCariKartlar={setCariKartlar}
              setIrsaliyeler={setIrsaliyeler}
              setCariIslemGecmisi={setCariIslemGecmisi}
              satinAlmaTalepleri={satinAlmaTalepleri}
              irsaliyeler={irsaliyeler}
              addNotification={addNotification}
            />
            <GuvenlikEvrakOnayHavuzu
              pendingGateDocs={pendingGateDocs}
              pendingWaybills={pendingWaybills}
              signatureText={signatureText}
              setActiveDocForDetail={setActiveDocForDetail}
              handleApproveDocument={handleApproveDocument}
              handleRejectGateDoc={handleRejectGateDoc}
              handleOpenGateDocApproval={handleOpenGateDocApproval}
              handleQuickApproveGateIrsaliye={handleQuickApproveGateIrsaliye}
              handleRematchActiveGateIrsaliye={handleRematchActiveGateIrsaliye}
              activeGateDoc={activeGateDoc}
              setActiveGateDoc={setActiveGateDoc}
              approvalStep={approvalStep}
              setApprovalStep={setApprovalStep}
              selectedDocType={selectedDocType}
              setSelectedDocType={setSelectedDocType}
              isAiResolving={isAiResolving}
              handleAnalyzeGateDocWithAi={handleAnalyzeGateDocWithAi}
              handleStartManualGateDocApproval={handleStartManualGateDocApproval}
              handleSaveGateDocApproval={handleSaveGateDocApproval}
              faturaNo={faturaNo}
              setFaturaNo={setFaturaNo}
              faturaFirma={faturaFirma}
              setFaturaFirma={setFaturaFirma}
              faturaTarih={faturaTarih}
              setFaturaTarih={setFaturaTarih}
              faturaToplam={faturaToplam}
              setFaturaToplam={setFaturaToplam}
              faturaKdv={faturaKdv}
              setFaturaKdv={setFaturaKdv}
              faturaGenelToplam={faturaGenelToplam}
              setFaturaGenelToplam={setFaturaGenelToplam}
              faturaKalemler={faturaKalemler}
              setFaturaKalemler={setFaturaKalemler}
              irsaliyeNo={irsaliyeNo}
              setIrsaliyeNo={setIrsaliyeNo}
              irsaliyeFirma={irsaliyeFirma}
              setIrsaliyeFirma={setIrsaliyeFirma}
              irsaliyeTarih={irsaliyeTarih}
              setIrsaliyeTarih={setIrsaliyeTarih}
              irsaliyeKalemler={irsaliyeKalemler}
              setIrsaliyeKalemler={setIrsaliyeKalemler}
              makbuzRefNo={makbuzRefNo}
              setMakbuzRefNo={setMakbuzRefNo}
              makbuzFirma={makbuzFirma}
              setMakbuzFirma={setMakbuzFirma}
              makbuzTarih={makbuzTarih}
              setMakbuzTarih={setMakbuzTarih}
              makbuzTutar={makbuzTutar}
              setMakbuzTutar={setMakbuzTutar}
              makbuzAciklama={makbuzAciklama}
              setMakbuzAciklama={setMakbuzAciklama}
              makbuzTip={makbuzTip}
              setMakbuzTip={setMakbuzTip}
              genelAciklama={genelAciklama}
              setGenelAciklama={setGenelAciklama}
              itemUrunAdi={itemUrunAdi}
              setItemUrunAdi={setItemUrunAdi}
              itemMiktar={itemMiktar}
              setItemMiktar={setItemMiktar}
              itemBirim={itemBirim}
              setItemBirim={setItemBirim}
              itemBirimFiyat={itemBirimFiyat}
              setItemBirimFiyat={setItemBirimFiyat}
              itemKdvOran={itemKdvOran}
              setItemKdvOran={setItemKdvOran}
            />
            </div>
          )}

          {activeTab === 'kampci_belgeleri' && (
            <div className="space-y-6">
              <VidanjorFisOnayPanel
                currentUser={currentUser}
                cariKartlar={cariKartlar}
                setCariKartlar={setCariKartlar}
                setIrsaliyeler={setIrsaliyeler}
                setCariIslemGecmisi={setCariIslemGecmisi}
                faturalar={faturalar}
                setFaturalar={setFaturalar}
                satinAlmaTalepleri={satinAlmaTalepleri}
                irsaliyeler={irsaliyeler}
                addNotification={addNotification}
              />

              <div className="border bg-white p-4.5 rounded-2xl border-amber-200 text-xs">
                <div className="space-y-1">
                  <span className="text-amber-800 font-bold block text-[11px] tracking-widest uppercase flex items-center gap-1.5">
                    <Building2 size={13} /> Kampçı Firma Onayları ({pendingKampFirmaTalepleri.length})
                  </span>
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    Kampçı yeni taşeron firmasını kendisi açamaz. İsmi düzeltin, kayıtlı firmaya bağlayın veya reddedin — yanlış/çift unvan böyle kesilir.
                  </p>
                </div>

                {pendingKampFirmaTalepleri.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic mt-3">Onay bekleyen firma talebi yok.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {pendingKampFirmaTalepleri.map((talep) => {
                      const draft = kampFirmaDraft(talep);
                      const benzer = findSimilarTaseronCariler(draft.unvan || talep.onerilenUnvan, cariKartlar || []);
                      const taseronlar = getTaseronCariKartlar(cariKartlar || []);
                      return (
                        <div key={talep.id} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800 text-[13px]">{talep.onerilenUnvan}</p>
                              <p className="text-[9px] text-amber-800 font-mono mt-0.5">
                                {talep.gonderenEmail} · {String(talep.olusturmaTarihi || '').slice(0, 16).replace('T', ' ')}
                              </p>
                            </div>
                            <span className="text-[9px] font-black uppercase bg-amber-200 text-amber-900 rounded-full px-2 py-0.5 shrink-0">Onay Bekliyor</span>
                          </div>
                          {talep.notlar ? <p className="text-[10px] text-slate-500">{talep.notlar}</p> : null}
                          <label className="text-[9px] font-extrabold text-slate-500 uppercase block">Onaylanacak unvan</label>
                          <input
                            value={draft.unvan}
                            onChange={(e) =>
                              setFirmaTalepDrafts((prev) => ({
                                ...prev,
                                [talep.id]: { ...draft, unvan: e.target.value },
                              }))
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-800"
                          />
                          {benzer.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {benzer.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() =>
                                    setFirmaTalepDrafts((prev) => ({
                                      ...prev,
                                      [talep.id]: { unvan: c.unvan, mergeId: c.id },
                                    }))
                                  }
                                  className={`text-[9px] font-bold px-2 py-1 rounded-lg border ${
                                    draft.mergeId === c.id
                                      ? 'bg-emerald-600 text-white border-emerald-700'
                                      : 'bg-white text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {c.unvan}
                                </button>
                              ))}
                            </div>
                          )}
                          <select
                            value={draft.mergeId}
                            onChange={(e) =>
                              setFirmaTalepDrafts((prev) => ({
                                ...prev,
                                [talep.id]: { ...draft, mergeId: e.target.value },
                              }))
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
                          >
                            <option value="">Yeni cari aç (veya yukarıdan bağla)</option>
                            {taseronlar.map((c) => (
                              <option key={c.id} value={c.id}>
                                Mevcut: {c.unvan}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-2 pt-1 border-t border-amber-100">
                            <button
                              type="button"
                              onClick={() => void handleRejectKampFirmaTalep(talep)}
                              className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <X size={11} /> Reddet
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleApproveKampFirmaTalep(talep)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Check size={11} /> {draft.mergeId ? 'Mevcut karta bağla' : 'Onayla ve cari aç'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Kampçının kurduğu, onay bekleyen personeller */}
              <div className="border bg-white p-4.5 rounded-2xl border-amber-200 text-xs">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-amber-700 font-bold block text-[11px] tracking-widest uppercase">👤 Kampçı Personel Onayları ({bekleyenKampPersonelleri.length})</span>
                    <p className="text-slate-500 leading-relaxed text-[11px]">
                      Kampçının eklediği yeni personeller yönetici onayı olmadan yoklamaya/kadrolara işlenmez. Aynı kişi ana programda varsa «Birleştir» ile tek karta (yoklama + arşiv) alın.
                    </p>
                  </div>
                </div>

                {bekleyenKampPersonelleri.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {bekleyenKampPersonelleri.map((p) => {
                      const match = pickBestPersonelMatch(
                        findPersonelMatches(
                          (personeller || []).filter((x) => x.id !== p.id),
                          {
                            rawName: `${p.ad || ''} ${p.soyad || ''}`.trim(),
                            tcNo: p.tcNo,
                            telefonNo: p.telefonNo,
                            firmaAdi: p.firmaAdi,
                            firmaTipi: p.firmaTipi,
                          }
                        )
                      );
                      return (
                      <div key={p.id} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 text-[13px]">{p.ad} {p.soyad}</span>
                            <span className="text-[9px] font-black uppercase bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">Onay Bekliyor</span>
                          </div>
                          <p className="text-[10.5px] text-slate-500 mt-1">Görev: {p.gorev || '—'} · Firma: {p.firmaAdi || (p.firmaTipi === 'TASERON' ? 'Taşeron' : 'Kibritçi')}</p>
                          <p className="text-[10.5px] text-slate-500">TC: {p.tcNo || '—'} · Tel: {p.telefonNo || '—'}</p>
                          <p className="text-[9px] text-amber-700/80 mt-0.5 font-mono">Kaynak: KAMPÇI · Giriş: {p.iseGirisTarihi || '—'}</p>
                          {match ? (
                            <p className="text-[10px] text-sky-800 mt-1 font-bold">
                              Mevcut kart: {formatPersonelMatchLabel(match)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex gap-2 pt-1 border-t border-amber-100">
                          <button
                            type="button"
                            onClick={() => handleRejectKampPersonel(p.id)}
                            className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <X size={11} /> Reddet
                          </button>
                          {match ? (
                            <button
                              type="button"
                              onClick={() => void handleMergeKampPersonel(p.id)}
                              className="flex-1 bg-sky-700 hover:bg-sky-800 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              Birleştir
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleApproveKampPersonel(p.id)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Check size={11} /> Onayla
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border bg-white p-4.5 rounded-2xl border-slate-200 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <span className="text-slate-700 font-bold block text-[11px] tracking-widest uppercase">🏕️ KAMPÇI BELGELERİ (AMİRLİK &amp; DEPO SAYIMI)</span>
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    Kamp sorumlusu tarafından gönderilen depo stok mutabakatları ile şantiye içi günlük kamp faaliyet raporları.
                  </p>
                </div>
              </div>

              {(pendingKampSayimlar.length === 0 &&
                pendingKampFaaliyetler.length === 0 &&
                pendingTaseronSayimlar.length === 0) ? (
                <div className="bg-white rounded-3xl p-15 text-center flex flex-col items-center justify-center space-y-4 border border-slate-200">
                  <span className="text-4xl">🎉</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Onay bekleyen kamp amirliği veya depo belgesi bulunmuyor.</h3>
                    <p className="text-xs text-slate-500 mt-1">Sistem tamamen güncel ve mutabıktır.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Taşeron Sayım Onayları */}
                  {pendingTaseronSayimlar.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center space-x-2 uppercase">
                        <HardHat size={14} className="text-amber-700" />
                        <span>Taşeron Sayım Onayları ({pendingTaseronSayimlar.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingTaseronSayimlar.map((doc) => {
                          const view = normalizeKampTaseronSayimForDisplay(doc);
                          return (
                            <div
                              key={doc.id}
                              className="bg-white border border-amber-200 p-4 rounded-2xl flex flex-col justify-between hover:border-amber-300 transition space-y-3"
                            >
                              <div>
                                <div className="flex justify-between items-start">
                                  <span className="font-mono bg-amber-500/10 border border-amber-200/20 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    TAŞERON SAYIM #{doc.id.substring(0, 6).toUpperCase()}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono font-bold">{view.tarih}</span>
                                </div>
                                <p className="text-xs text-slate-800 font-bold mt-2.5">Firma: {view.firmaAdi}</p>
                                <p className="text-[10.5px] text-slate-400 mt-1">Gönderen: {view.yapan}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold">
                                  <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800">
                                    TC: {view.ozet.tcTamamlanan}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-800">
                                    Tel: {view.ozet.telTamamlanan}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-800">
                                    MYK: {view.ozet.mykIsaretlenen}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800">
                                    İşe giriş: {view.ozet.iseGiris}
                                  </span>
                                </div>

                                <div className="mt-2.5 p-2 bg-slate-50 rounded border border-slate-200 space-y-1.5 max-h-36 overflow-y-auto">
                                  <div className="text-[10px] font-bold text-slate-400 border-b border-slate-200 pb-1">
                                    Personel güncellemeleri ({view.islemSayisi})
                                  </div>
                                  {view.guncellemeler.map((g, idx) => (
                                    <div key={idx} className="text-[10px] text-slate-600">
                                      <span className="font-bold text-slate-800">{g.isim}</span>
                                      <span className="text-slate-400"> — {g.detay}</span>
                                    </div>
                                  ))}
                                  {view.dahaFazla > 0 && (
                                    <p className="text-[9px] text-slate-400 italic">+{view.dahaFazla} kayıt daha…</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => handleRejectTaseronSayim(doc)}
                                  className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                                >
                                  <X size={11} />
                                  <span>Reddet</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApproveTaseronSayim(doc)}
                                  disabled={approvingTaseronSayimId === doc.id}
                                  className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-50 disabled:cursor-wait text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                                >
                                  {approvingTaseronSayimId === doc.id ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : (
                                    <Check size={11} />
                                  )}
                                  <span>
                                    {approvingTaseronSayimId === doc.id
                                      ? 'Onaylanıyor…'
                                      : 'Onayla ve Personeli Güncelle'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Kamp Depo Sayımları Grid */}
                  {pendingKampSayimlar.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center space-x-2 uppercase">
                        <Package size={14} className="text-slate-600" />
                        <span>Kamp Depo Sayım Onayları ({pendingKampSayimlar.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingKampSayimlar.map(doc => {
                          const view = normalizeKampSayimForDisplay(doc);
                          return (
                          <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-slate-500/10 border border-slate-200/20 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  SAYIM #{doc.id.substring(0,6).toUpperCase()}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-800 font-bold mt-2.5">Kamp Alanı: {view.kampAdi}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Sayan: {view.sayanPersonel}</p>
                              <p className="text-[10px] text-amber-700/80 mt-0.5">Gönderen: {view.kaydeden}</p>
                              
                              <div className="mt-2.5 p-2 bg-slate-50 rounded border border-slate-200 space-y-1.5">
                                <div className="text-[10px] font-bold text-slate-400 border-b border-slate-200 pb-1 flex justify-between">
                                  <span>Malzeme / Stok</span>
                                  <span>Miktar</span>
                                </div>
                                {Object.entries(view.sayimlar).map(([malzeme, miktar]) => (
                                  <div key={malzeme} className="text-[10px] font-mono text-slate-600 flex justify-between">
                                    <span>{malzeme}</span>
                                    <span className="font-bold text-slate-800">{miktar}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                              <button 
                                onClick={() => handleRejectKampItem('sayim', doc.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <X size={11} />
                                <span>Reddet</span>
                              </button>
                              <button 
                                onClick={() => handleApproveKampItem('sayim', doc.id)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Onayla</span>
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Kamp Günlük Faaliyetleri Grid */}
                  {pendingKampFaaliyetler.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-slate-100 mt-4">
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center space-x-2 uppercase">
                        <Tent size={14} className="text-amber-700" />
                        <span>Kamp Günlük Faaliyet Onayları ({pendingKampFaaliyetler.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingKampFaaliyetler.map(doc => {
                          const view = normalizeKampFaaliyetForDisplay(doc);
                          return (
                          <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-amber-500/10 border border-amber-200/20 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  FAALİYET #{doc.id.substring(0,6).toUpperCase()}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-800 font-bold mt-2.5">Kategori: {view.kategori}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Yerleşke: {view.yerleske || '—'}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Açıklama: {view.aciklama}</p>
                              <p className="text-[10px] text-amber-700/80 mt-0.5">Gönderen: {view.kaydeden}</p>

                              {view.photo && (
                                <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 flex items-center justify-center relative group">
                                  <img 
                                    src={view.photo} 
                                    alt="Faaliyet" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                              <button 
                                onClick={() => handleRejectKampItem('faaliyet', doc.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <X size={11} />
                                <span>Reddet</span>
                              </button>
                              <button 
                                onClick={() => handleApproveKampItem('faaliyet', doc.id)}
                                className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Onayla</span>
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <MobilFaaliyetGecmisPanel
                title="Kampçı faaliyet geçmişi"
                kind="kamp"
                collectionName="kampGunlukFaaliyetleri"
                items={kampFaaliyetler}
              />
            </div>
          )}

          {activeTab === 'tesisat_mermer_belgeleri' && (
            <div className="space-y-6">
              <YildirimTankerFisOnayPanel
                currentUser={currentUser}
                cariKartlar={cariKartlar}
                setCariKartlar={setCariKartlar}
                setIrsaliyeler={setIrsaliyeler}
                setCariIslemGecmisi={setCariIslemGecmisi}
                faturalar={faturalar}
                setFaturalar={setFaturalar}
                satinAlmaTalepleri={satinAlmaTalepleri}
                irsaliyeler={irsaliyeler}
                addNotification={addNotification}
              />

              {pendingTesisatciFaaliyetler.length + pendingMermerciFaaliyetler.length === 0 ? (
                pendingYildirimGateCount === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    Onay bekleyen tesisatçı / mermerci faaliyeti bulunmuyor.
                  </div>
                ) : null
              ) : (
                [
                  { type: 'tesisatci' as const, title: 'Tesisatçı Faaliyet Onayları', items: pendingTesisatciFaaliyetler },
                  { type: 'mermerci' as const, title: 'Mermerci Faaliyet Onayları', items: pendingMermerciFaaliyetler },
                ].map(({ type, title, items }) =>
                  items.length === 0 ? null : (
                    <div key={type} className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center space-x-2 uppercase">
                        <FileText size={14} className="text-amber-700" />
                        <span>{title} ({items.length})</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {items.map((docItem) => {
                          const foto =
                            docItem.fotoUrl ||
                            (Array.isArray(docItem.fotoUrls) ? docItem.fotoUrls[0] : '') ||
                            '';
                          return (
                            <div key={docItem.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition space-y-3">
                              <div>
                                <div className="flex justify-between items-start">
                                  <span className="font-mono bg-amber-500/10 border border-amber-200/20 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    {type === 'tesisatci' ? 'TESİSAT' : 'MERMER'} #{String(docItem.id).substring(0, 6).toUpperCase()}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono font-bold">{docItem.tarih}</span>
                                </div>
                                <p className="text-xs text-slate-800 font-bold mt-2.5">İş: {docItem.isNiteligi || '—'}</p>
                                <p className="text-[10.5px] text-slate-400 mt-1">
                                  Alan: {docItem.calismaAlani || docItem.parsel || '—'}
                                  {docItem.yerleskeAdi ? ` · ${docItem.yerleskeAdi}` : ''}
                                </p>
                                <p className="text-[10.5px] text-slate-400 mt-1">Açıklama: {docItem.aciklama || '—'}</p>
                                <p className="text-[10px] text-amber-700/80 mt-0.5">Gönderen: {docItem.kaydeden || '—'}</p>
                                {foto && (
                                  <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 flex items-center justify-center relative group">
                                    <img src={foto} alt="Faaliyet" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" referrerPolicy="no-referrer" />
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                                <button
                                  onClick={() => handleRejectTesisatMermer(type, docItem.id)}
                                  className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                                >
                                  <X size={11} />
                                  <span>Reddet</span>
                                </button>
                                <button
                                  onClick={() => handleApproveTesisatMermer(type, docItem.id)}
                                  className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                                >
                                  <Check size={11} />
                                  <span>Onayla</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                )
              )}

              <MobilFaaliyetGecmisPanel
                title="Tesisatçı faaliyet geçmişi"
                kind="tesisatci"
                collectionName="tesisatciFaaliyetleri"
                items={tesisatciFaaliyetler}
              />
              <MobilFaaliyetGecmisPanel
                title="Mermerci faaliyet geçmişi"
                kind="mermerci"
                collectionName="mermerciFaaliyetleri"
                items={mermerciFaaliyetler}
              />
            </div>
          )}

          {activeTab === 'operator_belgeleri' && (
            <div className="space-y-6">
              {operatorOnayCount === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Onay bekleyen operatör faaliyeti / taşeron kesinti kaydı yok.
                </div>
              ) : (
                <>
                  {pendingOperatorKesintiler.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center gap-2 uppercase">
                        <HardHat size={14} className="text-rose-600" />
                        Taşeron Kesinti Onayları ({pendingOperatorKesintiler.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingOperatorKesintiler.map((docItem) => (
                          <div key={docItem.id} className="bg-white border border-rose-100 p-4 rounded-2xl space-y-3">
                            <div className="flex justify-between gap-2">
                              <span className="font-mono bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                KESİNTİ · {makineEtiketi(docItem as OperatorFaaliyet)}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono font-bold">{docItem.tarih}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-800">{docItem.yapilanIs}</p>
                            <p className="text-[10px] text-slate-500">
                              {docItem.operatorIsim} · {docItem.firmaAdi} · {docItem.baslangicSaat}–{docItem.bitisSaat} ({Number(docItem.calismaSuresi || 0).toFixed(1)} sa)
                            </p>
                            {docItem.fotoUrl && (
                              <img src={docItem.fotoUrl} alt="" className="max-h-36 w-full object-cover rounded-xl border" />
                            )}
                            <div className="flex gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => void handleRejectOperatorKesinti(docItem.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 py-1.5 rounded-lg text-[10px] font-black"
                              >
                                Reddet
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApproveOperatorKesinti(docItem.id)}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-1.5 rounded-lg text-[10px] font-black"
                              >
                                Onayla
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pendingOperatorSaha.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center gap-2 uppercase">
                        <HardHat size={14} className="text-amber-600" />
                        Operatör Saha Faaliyet Onayları ({pendingOperatorSaha.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingOperatorSaha.map((docItem) => (
                          <div key={docItem.id} className="bg-white border border-amber-100 p-4 rounded-2xl space-y-3">
                            <div className="flex justify-between gap-2">
                              <span className="font-mono bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                {docItem.faaliyetGrubu === 'MESAI' ? 'MESAİ' : 'NORMAL'} · {docItem.isNiteligi || '—'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono font-bold">{docItem.tarih}</span>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              {docItem.parsel} / {docItem.blok}
                              {docItem.taseronKesinti ? ` · Taşeron: ${docItem.taseronFirmaAdi || '—'}` : ''}
                              {docItem.isKaydiEtiketi || docItem.aracPlaka
                                ? ` · ${docItem.isKaydiEtiketi || docItem.aracPlaka}`
                                : ''}
                            </p>
                            <p className="text-xs text-slate-800">{docItem.aciklama || '—'}</p>
                            {docItem.fotoUrl && (
                              <img src={docItem.fotoUrl} alt="" className="max-h-36 w-full object-cover rounded-xl border" />
                            )}
                            <div className="flex gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => void handleRejectOperatorSaha(docItem.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 py-1.5 rounded-lg text-[10px] font-black"
                              >
                                Reddet
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApproveOperatorSaha(docItem.id)}
                                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded-lg text-[10px] font-black"
                              >
                                Onayla
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'gecmis' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-white p-4 border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <span>✍️ Dijital İmza ile Onaylanmış Son Belgeler Arşivi</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Yönetici dijital imzası uygulanarak muhasebeye aktarılan arşiv.</p>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Arşivde ara (Belge no, unvan, kaşe...)"
                    value={onaySearchKeyword}
                    onChange={(e) => setOnaySearchKeyword(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 bg-white font-sans focus:outline-none  w-full sm:w-64"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {/* Requests approved */}
                {filteredApprovedRequests.map(doc => {
                  const isEditing = editingOnayStampId === doc.id;
                  const isDeleteConfirm = deleteConfirmOnayId === doc.id;
                  return (
                    <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          <span className="font-mono bg-slate-500/10 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">TALEP: {doc.saId}</span>
                          <span className="text-slate-500 font-mono text-[9px] font-semibold">{doc.tarih}</span>
                          <span className="bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 text-[9.5px] font-bold px-2 py-0.2 rounded">Onaylandı</span>
                        </div>
                        <p className="text-slate-600 font-bold mt-1">Sipariş Cari Firma: {doc.cariFirma}</p>
                        
                        {isEditing ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <input
                              type="text"
                              value={tempStampValue}
                              onChange={(e) => setTempStampValue(e.target.value)}
                              className="bg-slate-50 border border-slate-300 px-2 py-1 rounded text-xs text-slate-800 max-w-sm bg-white"
                            />
                            <button
                              onClick={() => handleSaveUpdatedStamp('request', doc.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px]"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => setEditingOnayStampId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          doc.onayStamp && (
                            <p className="text-[10px] text-amber-500 font-mono font-bold mt-1 flex items-center gap-1">
                              <span>✒️ Eklenen Kaşe / E-İmza: {doc.onayStamp}</span>
                              <button
                                onClick={() => handleStartEditStamp(doc.id, doc.onayStamp || '')}
                                className="text-slate-600 hover:text-slate-500 font-sans hover:underline text-[9px] ml-2"
                              >
                                [Düzelt]
                              </button>
                            </p>
                          )
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleViewSatinAlmaEvrak(doc)}
                          className="bg-[#0f2744] hover:bg-[#17365c] text-[#f4ead5] px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>Evrakı Gör</span>
                        </button>
                        <button
                          onClick={() => handleGenerateSignedPdf('request', doc)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF Raporu Yap</span>
                        </button>
                        
                        <button
                          onClick={() => handleUndoApproval('request', doc.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition"
                          title="Onayı geri alıp bekleyenlere gönder"
                        >
                          Geri Al
                        </button>

                        <button
                          onClick={() => handleDeleteApprovedDoc('request', doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isDeleteConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-rose-50 text-rose-500 hover:bg-rose-50'
                          }`}
                        >
                          {isDeleteConfirm ? 'Emin misiniz?' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Waybills approved */}
                {filteredApprovedWaybills.map(doc => {
                  const isEditing = editingOnayStampId === doc.id;
                  const isDeleteConfirm = deleteConfirmOnayId === doc.id;
                  return (
                    <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          <span className="font-mono bg-emerald-500/10 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">İRSALİYE: {doc.irsaliyeNo}</span>
                          <span className="text-slate-500 font-mono text-[9px] font-semibold">{doc.tarih}</span>
                          <span className="bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 text-[9.5px] font-bold px-2 py-0.2 rounded">Onaylandı</span>
                        </div>
                        <p className="text-slate-600 font-bold mt-1">Şantiyeci Teslimat Noktası: {doc.firma}</p>
                        
                        {isEditing ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <input
                              type="text"
                              value={tempStampValue}
                              onChange={(e) => setTempStampValue(e.target.value)}
                              className="bg-slate-50 border border-slate-300 px-2 py-1 rounded text-xs text-slate-800 max-w-sm bg-white"
                            />
                            <button
                              onClick={() => handleSaveUpdatedStamp('waybill', doc.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px]"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => setEditingOnayStampId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          doc.onayStamp && (
                            <p className="text-[10px] text-amber-500 font-mono font-bold mt-1 flex items-center gap-1">
                              <span>✒️ Eklenen Kaşe / E-İmza: {doc.onayStamp}</span>
                              <button
                                onClick={() => handleStartEditStamp(doc.id, doc.onayStamp || '')}
                                className="text-slate-600 hover:text-slate-500 font-sans hover:underline text-[9px] ml-2"
                              >
                                [Düzelt]
                              </button>
                            </p>
                          )
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleGenerateSignedPdf('waybill', doc)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF Raporu Yap</span>
                        </button>
                        
                        <button
                          onClick={() => handleUndoApproval('waybill', doc.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition"
                          title="Onayı geri alıp bekleyenlere gönder"
                        >
                          Geri Al
                        </button>

                        <button
                          onClick={() => handleDeleteApprovedDoc('waybill', doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isDeleteConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-rose-50 text-rose-500 hover:bg-rose-50'
                          }`}
                        >
                          {isDeleteConfirm ? 'Emin misiniz?' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Invoices approved */}
                {filteredApprovedInvoices.map(doc => {
                  const isEditing = editingOnayStampId === doc.id;
                  const isDeleteConfirm = deleteConfirmOnayId === doc.id;
                  return (
                    <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          <span className="font-mono bg-purple-500/10 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded">FATURA: {doc.faturaNo}</span>
                          <span className="text-slate-500 font-mono text-[9px] font-semibold">{doc.tarih}</span>
                          <span className="bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 text-[9.5px] font-bold px-2 py-0.2 rounded">Yasa Uygun / Eşlendi</span>
                        </div>
                        <p className="text-slate-600 font-bold mt-1">Tutar: ₺{doc.genelToplam?.toLocaleString()} ({doc.cariUnvan})</p>
                        
                        {isEditing ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <input
                              type="text"
                              value={tempStampValue}
                              onChange={(e) => setTempStampValue(e.target.value)}
                              className="bg-slate-50 border border-slate-300 px-2 py-1 rounded text-xs text-slate-800 max-w-sm bg-white"
                            />
                            <button
                              onClick={() => handleSaveUpdatedStamp('invoice', doc.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px]"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => setEditingOnayStampId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          doc.onayStamp && (
                            <p className="text-[10px] text-amber-500 font-mono font-bold mt-1 flex items-center gap-1">
                              <span>✒️ Eklenen Kaşe / E-İmza: {doc.onayStamp}</span>
                              <button
                                onClick={() => handleStartEditStamp(doc.id, doc.onayStamp || '')}
                                className="text-slate-600 hover:text-slate-500 font-sans hover:underline text-[9px] ml-2"
                              >
                                [Düzelt]
                              </button>
                            </p>
                          )
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleGenerateSignedPdf('invoice', doc)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF Raporu Yap</span>
                        </button>
                        
                        <button
                          onClick={() => handleUndoApproval('invoice', doc.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition"
                          title="Onayı geri alıp bekleyenlere gönder"
                        >
                          Geri Al
                        </button>

                        <button
                          onClick={() => handleDeleteApprovedDoc('invoice', doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isDeleteConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-rose-50 text-rose-500 hover:bg-rose-50'
                          }`}
                        >
                          {isDeleteConfirm ? 'Emin misiniz?' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredApprovedRequests.length === 0 && filteredApprovedWaybills.length === 0 && filteredApprovedInvoices.length === 0 && (
                  <div className="text-center p-10 text-slate-500 font-bold italic">Aranan kriterlere uygun onaylanmış belge kaydı bulunamadı.</div>
                )}

                {/* 📋 UNIFIED İŞLEM KAYITLARI AUDIT LOG */}
                <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-xs text-slate-600">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-display font-black text-xs text-slate-800 uppercase tracking-widest block">Tesis Onaylı İşlem Kayıtları</span>
                    <span className="bg-slate-800 text-slate-400 font-mono text-[9px] px-2 py-0.5 rounded">SİSTEM DENETİMİ</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Sistemde onaylanan evrakların mali ve idari işlem kayıtları (Audit Trail):
                  </p>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-slate-600">
                      <thead>
                        <tr className="border-b border-slate-200 text-left font-bold text-slate-500">
                          <th className="py-2 pr-4">Tarih</th>
                          <th className="py-2 pr-4">Belge Tipi</th>
                          <th className="py-2 pr-4">Belge Referansı</th>
                          <th className="py-2 pr-4">Cari / Sorumlu</th>
                          <th className="py-2 pr-4">Kaşe / İmza</th>
                          <th className="py-2 text-right">Tutar/Miktar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                        {satinAlmaTalepleri.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === '2. ONAY TAMAMLANDI').map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-100/25 transition">
                            <td className="py-2 pr-4">{doc.tarih}</td>
                            <td className="py-2 pr-4 text-amber-700 font-bold">PO (Satın Alma)</td>
                            <td className="py-2 pr-4">{doc.saId}</td>
                            <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{doc.cariFirma}</td>
                            <td className="py-2 pr-4 text-emerald-700">{doc.onayStamp || 'Islak İmzalı / E-İmzalı'}</td>
                            <td className="py-2 text-right text-slate-400">{doc.kalemler?.length || 0} Kalem</td>
                          </tr>
                        ))}
                        {irsaliyeler.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu.includes('TAMAMLANDI')).map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-100/25 transition">
                            <td className="py-2 pr-4">{doc.tarih}</td>
                            <td className="py-2 pr-4 text-emerald-700 font-bold">İRSALİYE</td>
                            <td className="py-2 pr-4">{doc.irsaliyeNo}</td>
                            <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{doc.firma}</td>
                            <td className="py-2 pr-4 text-emerald-700">{doc.onayStamp || 'Müdür Onaylı'}</td>
                            <td className="py-2 text-right text-slate-400">{doc.kalemler?.length || 0} Kalem</td>
                          </tr>
                        ))}
                        {faturalar.filter(doc => doc.durum === 'ONAYLANDI' || doc.durum === 'UYUMLU').map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-100/25 transition">
                            <td className="py-2 pr-4">{doc.tarih}</td>
                            <td className="py-2 pr-4 text-purple-400 font-bold">FATURA</td>
                            <td className="py-2 pr-4">{doc.faturaNo}</td>
                            <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{doc.cariUnvan}</td>
                            <td className="py-2 pr-4 text-emerald-700">{doc.onayStamp || doc.eImzalar?.[0] || 'Kaşeli Onay'}</td>
                            <td className="py-2 text-right text-purple-300 font-bold">₺{doc.genelToplam?.toLocaleString()}</td>
                          </tr>
                        ))}
                        {satinAlmaTalepleri.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === '2. ONAY TAMAMLANDI').length === 0 && 
                         irsaliyeler.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu.includes('TAMAMLANDI')).length === 0 && 
                         faturalar.filter(doc => doc.durum === 'ONAYLANDI' || doc.durum === 'UYUMLU').length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-500 italic">Henüz onaylanmış herhangi bir işlem kaydı loglanmadı.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'imzalar' && (
            <DijitalOnayScreen currentUser={currentUser} kullanicilar={kullanicilar} embedded />
          )}

          {activeTab === 'gunluk_loglar' && (
            <div className="space-y-6">
              <div className="border bg-white p-4.5 rounded-2xl border-slate-200 text-xs">
                <span className="text-amber-700 font-bold block text-[11px] tracking-widest uppercase">Günlük Akış Raporları</span>
                <p className="text-slate-400 mt-1 text-[11px]">
                  Saha formenleri ve kampçıların gün sonu gönderdiği özet raporlar. İdari İşler, Muhasebe, Şantiye Şefi, Proje Müdürü veya Kurucu onayı ile arşive alınır.
                </p>
              </div>

              {pendingGunlukAkis.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
                  <p className="text-sm text-slate-600 font-bold">Onay bekleyen günlük rapor yok.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingGunlukAkis.map((rapor) => (
                    <div key={rapor.id} className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black text-amber-700 uppercase">{rapor.tip} · {rapor.tarih}</span>
                        <span className="text-[9px] text-slate-500">{new Date(rapor.olusturulma).toLocaleString('tr-TR')}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">Gönderen: <strong className="text-slate-800">{rapor.gonderenEmail}</strong></p>
                      <pre className="text-[9px] text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-48 overflow-y-auto font-mono leading-relaxed">
                        {rapor.ozetMetin}
                      </pre>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRejectGunlukAkis(rapor.id)}
                          className="flex-1 bg-red-950 text-red-300 py-1.5 rounded-lg text-[10px] font-bold"
                        >
                          Reddet
                        </button>
                        <button
                          onClick={() => handleApproveGunlukAkis(rapor.id)}
                          className="flex-1 bg-emerald-600 text-white py-1.5 rounded-lg text-[10px] font-bold"
                        >
                          Onayla & Arşivle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {gunlukAkisRaporlari.filter((r) => r.durum === 'ONAYLANDI').length > 0 && (
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <h3 className="text-xs font-black text-slate-600 uppercase">Onaylanmış Arşiv</h3>
                  {gunlukAkisRaporlari.filter((r) => r.durum === 'ONAYLANDI').slice(0, 10).map((rapor) => (
                    <div key={rapor.id} className="bg-white border p-3 rounded-xl text-[10px] flex justify-between">
                      <span>{rapor.tip} · {rapor.tarih} · {rapor.gonderenEmail}</span>
                      <span className="text-emerald-600 font-bold">✓ {rapor.onaylayanYetki}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeTab === 'formen_belgeleri' || activeTab === 'goturu_belgeleri') && (
            <div className="space-y-6">
              
              {/* Header Info */}
              <div className="border bg-white p-4.5 rounded-2xl border-slate-200 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <span className="text-slate-600 font-bold block text-[11px] tracking-widest uppercase">
                    {isGoturuOnayTab
                      ? '🧱 GÖTÜRÜ / SERAMİK ONAY HAVUZU'
                      : '👷 PERSONEL OLUŞTURMA / GİRİŞ-ÇIKIŞ ONAYI'}
                  </span>
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    {isGoturuOnayTab
                      ? 'Götürü / Seramik mobil ekranından gönderilen faaliyetler, işçi giriş talepleri, işten çıkarma ve bilgi değişiklik istekleri buraya düşer. Onaylanmadan personel kartı açılmaz veya güncellenmez.'
                      : 'Saha kapısı talepleri ve SGK grubu (Grup Köprüsü) bildirimleri buraya düşer. Ana Firma kadrosu ancak grup bildirimi + SGK evrakı görüldükten sonra, burada tek onayla yazılır. Onaylanmadan personel kartı açılmaz.'}
                  </p>
                </div>
              </div>

              {isGoturuOnayTab && (
                pendingSeramikFaaliyetler.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
                    Onay bekleyen Götürü / Seramik faaliyeti yok.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="font-display font-black text-xs text-slate-600 tracking-wider flex items-center space-x-2 uppercase">
                      <Layers size={14} className="text-orange-700" />
                      <span>Götürü / Seramik Faaliyet Onayları ({pendingSeramikFaaliyetler.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingSeramikFaaliyetler.map((docItem) => {
                        const foto =
                          docItem.fotoUrl ||
                          (Array.isArray(docItem.fotoUrls) ? docItem.fotoUrls[0] : '') ||
                          '';
                        return (
                          <div key={docItem.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-300 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-orange-500/10 border border-orange-200/20 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  GÖTÜRÜ #{String(docItem.id).substring(0, 6).toUpperCase()}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{docItem.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-800 font-bold mt-2.5">İş: {docItem.isNiteligi || '—'}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">
                                Alan: {docItem.calismaAlani || docItem.parsel || '—'}
                                {docItem.yerleskeAdi ? ` · ${docItem.yerleskeAdi}` : ''}
                              </p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Açıklama: {docItem.aciklama || '—'}</p>
                              <p className="text-[10px] text-orange-700/80 mt-0.5">Gönderen: {docItem.kaydeden || '—'}</p>
                              {foto && (
                                <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 flex items-center justify-center relative group">
                                  <img src={foto} alt="Faaliyet" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" referrerPolicy="no-referrer" />
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                              <button
                                onClick={() => handleRejectTesisatMermer('seramik', docItem.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <X size={11} />
                                <span>Reddet</span>
                              </button>
                              <button
                                onClick={() => handleApproveTesisatMermer('seramik', docItem.id)}
                                className="flex-1 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Onayla</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

              {isGoturuOnayTab && (
                <MobilFaaliyetGecmisPanel
                  title="Götürü / Seramik faaliyet geçmişi"
                  kind="seramik"
                  collectionName="seramikFaaliyetleri"
                  items={seramikFaaliyetler}
                />
              )}

              {/* Subtabs for Personnel Management */}
              <div className="flex space-x-2 border-b border-slate-200 pb-px">
                <button
                  onClick={() => setFormenSubTab('giris')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition duration-150 cursor-pointer ${
                    formenSubTab === 'giris' ? 'border-[#2563EB] text-slate-900 font-black' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🚪 İşe Giriş Talepleri ({girisTalepleriForTab.filter((p) => isPendingPersonelOnayDurum(p.durum)).length})
                </button>
                <button
                  onClick={() => setFormenSubTab('cikis')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition duration-150 cursor-pointer ${
                    formenSubTab === 'cikis' ? 'border-[#2563EB] text-slate-900 font-black' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🛑 İşten Çıkış Talepleri ({cikisTalepleriForTab.filter((p) => isPendingPersonelOnayDurum(p.durum)).length})
                </button>
                <button
                  onClick={() => setFormenSubTab('guncelleme')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition duration-150 cursor-pointer ${
                    formenSubTab === 'guncelleme' ? 'border-[#2563EB] text-slate-900 font-black' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📝 Bilgi Güncelleme ({guncellemeTalepleriForTab.filter(p => p.durum === 'BEKLEMEDE').length})
                </button>
              </div>

              {/* Request Cards Grid */}
              {formenSubTab === 'giris' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {girisTalepleriForTab.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-10 text-center col-span-2 text-slate-500 italic">
                    Şu an onay bekleyen veya kayıtlı herhangi bir saha giriş talebi bulunmuyor.
                  </div>
                ) : (
                  girisTalepleriForTab.map((item) => {
                    const isPending = isPendingPersonelOnayDurum(item.durum);
                    const sgkTalep = isSgkGrupTalep(item);
                    const sgkHazir = isSgkOnayHazir(item);
                    const evrakHref = sgkEvrakUrlOf(item) || item.girisEvrakPdfUrl;
                    return (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-4.5 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                        
                        {/* Status Tag */}
                        <div className="flex justify-between items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                            item.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' :
                            item.durum === 'WP_GÖNDERİLDİ' ? 'bg-slate-500/10 text-slate-600 border border-slate-200/20' :
                            item.durum === 'REDDEDİLDİ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                          }`}>
                            {item.durum === 'ONAYLANDI' ? 'ONAYLANDI (GİRİŞ YAPILDI)' :
                             item.durum === 'WP_GÖNDERİLDİ' ? 'YÖNETİCİYE WP İLETİLDİ' :
                             item.durum === 'REDDEDİLDİ' ? 'REDDEDİLDİ (GİRİŞ ENGELLENDİ)' :
                             'BEKLEMEDE (KAPIDA)'}
                          </span>
                          <span className="text-[8px] font-mono text-slate-500">{new Date(item.tarih).toLocaleString('tr-TR')}</span>
                        </div>

                        {/* Person details */}
                        <div className="flex space-x-3">
                          {/* Thumbnail / Click to zoom — ön + arka */}
                          {(() => {
                            const kimlikler: string[] = Array.isArray(item.kimlikFotoUrls) && item.kimlikFotoUrls.length
                              ? item.kimlikFotoUrls.slice(0, 2)
                              : item.kimlikFotoUrl
                                ? [item.kimlikFotoUrl]
                                : [];
                            if (kimlikler.length === 0) {
                              return (
                                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200 shrink-0">
                                  <span className="text-[8px] text-slate-500 text-center">Fotoğraf Yok</span>
                                </div>
                              );
                            }
                            return kimlikler.map((url: string, idx: number) => (
                              <div key={idx} className="w-20 h-20 bg-slate-905 rounded-2xl overflow-hidden border border-slate-200 shrink-0 relative group">
                                <img src={url} alt={idx === 0 ? 'Kimlik Ön' : 'Kimlik Arka'} className="w-full h-full object-cover" />
                                <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[7px] font-bold px-1 rounded">
                                  {idx === 0 ? 'ÖN' : 'ARKA'}
                                </span>
                                <a 
                                  href={url} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[8px] font-bold text-white uppercase"
                                >
                                  Büyüt
                                </a>
                              </div>
                            ));
                          })()}

                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-slate-100 text-sm">{item.ad} {item.soyad}</h4>
                            <p className="text-[10px] text-slate-400 font-mono tracking-tight mt-1">💼 Görevi: {item.gorev}</p>
                            <p className="text-[9px] text-slate-500 mt-0.5">
                              👷 Gönderen: {item.gonderenFormen?.split('@')[0]}
                              {isGoturuPersonelTalep(item) ? ' · Götürü' : ''}
                            </p>
                          </div>
                        </div>

                        {sgkTalep && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-1">
                            <p className="text-[8px] font-black uppercase tracking-wider text-amber-900">SGK grubu — tek kontrol</p>
                            <p className={`text-[10px] font-bold ${item.grupBildirildi ? 'text-emerald-800' : 'text-rose-700'}`}>
                              {item.grupBildirildi ? 'Grup bildirimi var (kimlik + görev + tarih).' : 'Grup bildirimi yok — Ana Firma onayı kapalı.'}
                            </p>
                            <p className={`text-[10px] font-bold ${hasSgkEvrak(item) ? 'text-emerald-800' : 'text-rose-700'}`}>
                              {hasSgkEvrak(item) ? 'SGK evrakı eklendi. Onaylayınca kadro yazılır.' : 'SGK evrakı henüz düşmedi. Grup Köprüsü’nden bildirge bekleniyor.'}
                            </p>
                            {item.tcNo ? <p className="text-[10px] text-slate-600 font-mono">TC {item.tcNo}</p> : null}
                            {item.iseGirisTarihi ? <p className="text-[10px] text-slate-600">SGK giriş tarihi: {String(item.iseGirisTarihi).slice(0, 10)}</p> : null}
                          </div>
                        )}

                        {/* Documents & Download link */}
                        {(item.girisEvrakPdfUrl || evrakHref) && (
                          <div className="bg-slate-50/60 p-2 rounded-xl border border-slate-200 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-bold">📄 İşe Giriş Bildirgesi:</span>
                            <a 
                              href={evrakHref || item.girisEvrakPdfUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-amber-700 hover:underline font-black uppercase text-[8px] flex items-center space-x-0.5"
                            >
                              <span>Belgeyi İndir</span>
                              <ExternalLink size={9} />
                            </a>
                          </div>
                        )}

                        {/* Action buttons based on status & role */}
                        <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-2">
                          
                          {/* 1. WHATSAPP NOTIFICATION SEND (For Muhasebe, İdari İşler, Şantiye Şefi) */}
                          {isPending && (
                            <button
                              onClick={async () => {
                                const publicUrl = `${window.location.protocol}//${window.location.host}/?view_giris=${item.id}`;
                                const waText = [
                                  '*KİBRİTÇİ İNŞAAT - PERSONEL ŞANTİYE GİRİŞ ONAY TALEBİ*',
                                  '',
                                  `👤 Adı Soyadı: ${item.ad} ${item.soyad}`,
                                  `💼 Görevi/Branşı: ${item.gorev}`,
                                  `👷 Gönderen Formen: ${item.gonderenFormen || 'Bilinmeyen'}`,
                                  `📅 Tarih: ${new Date(item.tarih).toLocaleString('tr-TR')}`,
                                  '',
                                  '🪪 Kimlik Görseli ve Personel Kartı (Sorgula):',
                                  publicUrl,
                                  '',
                                  'Saha girişi için evrak onayı bekleniyor.',
                                ].join('\n');
                                try {
                                  await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
                                    durum: 'WP_GÖNDERİLDİ',
                                  });
                                  window.open(buildWhatsAppUrl(waText), '_blank');
                                } catch (e) {
                                  console.error(e);
                                  window.open(buildWhatsAppUrl(waText), '_blank');
                                }
                              }}
                              className="bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold text-[9px] py-1.5 px-3 rounded-xl flex items-center space-x-1.5 cursor-pointer border-b-2 border-slate-200 transition"
                            >
                              <MessageSquare size={11} />
                              <span>WhatsApp'tan Yöneticiye İlet</span>
                            </button>
                          )}

                          {/* 1.5 WHATSAPP FORWARD TO GATE/ENTRANCE (For Approved records, manager can notify the guard) */}
                          {item.durum === 'ONAYLANDI' && (
                            <button
                              onClick={() => {
                                const publicUrl = `${window.location.protocol}//${window.location.host}/?view_giris=${item.id}`;
                                const waText = [
                                  '*KİBRİTÇİ İNŞAAT - GİRİŞ İZNİ ONAYLANDI*',
                                  '',
                                  'Şantiye Giriş Kapısı / Güvenlik Nöbetçi Personeline:',
                                  `👤 Personel: ${item.ad} ${item.soyad}`,
                                  `💼 Görevi: ${item.gorev}`,
                                  '✅ İşe Giriş Bildirgesi onaylanmıştır. Şantiyeye girişine izin verilmiştir.',
                                  '',
                                  '🪪 Kimlik Görseli ve Detaylar:',
                                  publicUrl,
                                ].join('\n');
                                window.open(buildWhatsAppUrl(waText), '_blank');
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[9px] py-1.5 px-3 rounded-xl flex items-center space-x-1.5 cursor-pointer border-b-2 border-emerald-800 transition"
                            >
                              <MessageSquare size={11} />
                              <span>WhatsApp ile Kapıya / Girişe Bildir</span>
                            </button>
                          )}

                          {/* 2. PDF UPLOAD PANEL (For Manager / Yönetici / Company Official) */}
                          {isPending && (
                            <div className="w-full space-y-2 mt-1.5 bg-rose-50 p-2.5 rounded-2xl border border-slate-200">
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">🔒 Yönetici Giriş Belgesi Onayı</span>
                              
                              {activePdfUploadId === item.id ? (
                                <div className="space-y-1.5">
                                  <label className="border border-dashed border-slate-300 bg-white p-2 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition text-[9px] text-slate-400">
                                    <FileUp size={14} className="text-amber-500 mb-0.5" />
                                    <span>{uploadedPdfBase64 ? '✓ Belge Yüklendi (Değiştir)' : 'PDF / Görsel Seç'}</span>
                                    <input 
                                      type="file"
                                      accept="application/pdf,image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const r = new FileReader();
                                          r.onload = async (ev) => {
                                            if (ev.target?.result) {
                                              const rawBase64 = ev.target.result as string;
                                              if (file.type.startsWith('image/')) {
                                                const compressed = await compressImage(rawBase64);
                                                setUploadedPdfBase64(compressed);
                                              } else {
                                                setUploadedPdfBase64(rawBase64);
                                              }
                                            }
                                          };
                                          r.readAsDataURL(file);
                                        }
                                      }}
                                      className="hidden"
                                    />
                                  </label>

                                  <div className="flex space-x-1.5 pt-0.5">
                                    <button
                                      onClick={async () => {
                                        if (!uploadedPdfBase64) {
                                          alert("Lütfen personelin İşe Giriş Bildirgesi belgesini (PDF/Görsel) yükleyin!");
                                          return;
                                        }
                                        try {
                                          const candidate: Personel = {
                                            id: item.personelId || `p_${Date.now()}`,
                                            tcNo: item.tcNo || '',
                                            ad: item.ad || '',
                                            soyad: item.soyad || '',
                                            babaAdi: '',
                                            dogumTarihi: '',
                                            telefonNo: item.telefonNo || '',
                                            eposta: '',
                                            adres: '',
                                            il: '',
                                            ilce: '',
                                            departman: 'ŞANTİYE',
                                            gorev: item.gorev || 'İŞÇİ',
                                            iseGirisTarihi: (item.tarih || new Date().toISOString()).slice(0, 10),
                                            cinsiyet: 'Belirtilmedi',
                                            maas: 0,
                                            ucretTipi: 'Aylık',
                                            sgkDurumu: "SGK'lı",
                                            bankaAdi: '',
                                            subeAdi: '',
                                            ibanNo: '',
                                            durum: true,
                                          };

                                          const isGoturuKayit = isGoturuPersonelTalep(item);
                                          const firmaTipi = item.firmaTipi === 'TASERON' || isGoturuKayit ? 'TASERON' : 'ANA_FIRMA';
                                          const firmaAdi = item.firmaAdi || (isGoturuKayit ? GOTURU_FIRMA_ADI : undefined);
                                          const resolvedGorev = isGoturuKayit
                                            ? (item.gorev || GOTURU_DEFAULT_GOREV)
                                            : firmaTipi === 'TASERON'
                                              ? resolveTaseronPersonelGorev({ firmaAdi, firmaTipi: 'TASERON' })
                                              : item.gorev || 'İŞÇİ';

                                          const mergedCandidate = isGoturuKayit
                                            ? ({
                                                ...candidate,
                                                gorev: resolvedGorev,
                                                firmaTipi,
                                                firmaAdi,
                                                departman: 'ŞANTİYE',
                                                telefonNo: item.telefonNo || candidate.telefonNo,
                                              } as Personel)
                                            : withTaseronPersonelGorev({
                                                ...candidate,
                                                gorev: resolvedGorev,
                                                firmaTipi,
                                                firmaAdi,
                                              } as Personel);

                                          const allPersoneller = await loadPersonellerForDedup(personeller || []);
                                          const { personel: saved, merged } = await upsertPersonelAvoidDuplicate(
                                            allPersoneller,
                                            mergedCandidate,
                                            {
                                              rawName: `${item.ad || ''} ${item.soyad || ''}`.trim(),
                                              tcNo: item.tcNo,
                                              telefonNo: item.telefonNo,
                                              firmaAdi: item.firmaAdi,
                                              firmaTipi,
                                            }
                                          );

                                          setPersoneller?.((prev) =>
                                            prev.some((p) => p.id === saved.id)
                                              ? prev.map((p) => (p.id === saved.id ? saved : p))
                                              : [...prev, saved]
                                          );

                                          await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
                                            durum: 'ONAYLANDI',
                                            girisEvrakPdfUrl: uploadedPdfBase64,
                                            personelId: saved.id,
                                            onaylayan: currentUser?.email,
                                            onayTarihi: new Date().toISOString(),
                                          });
                                          setActivePdfUploadId(null);
                                          setUploadedPdfBase64(null);
                                          alert(
                                            merged
                                              ? '🎉 Personel giriş talebi onaylandı! Mevcut personel kaydı güncellendi (mükerrer kayıt açılmadı).'
                                              : '🎉 Personel giriş talebi onaylandı! İşe Giriş Bildirgesi başarıyla sisteme yüklendi ve sahaya bildirildi.'
                                          );
                                        } catch (err) {
                                          console.error(err);
                                          alert("Kaydedilemedi, veritabanı bağlantısını kontrol edin.");
                                        }
                                      }}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[8px] py-1.5 rounded-lg uppercase"
                                    >
                                      ✓ Onayla ve Gönder
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActivePdfUploadId(null);
                                        setUploadedPdfBase64(null);
                                      }}
                                      className="bg-slate-800 hover:bg-slate-750 text-slate-400 font-bold text-[8px] px-2 rounded-lg"
                                    >
                                      İptal
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 w-full">
                                  <button
                                    onClick={() => {
                                      setActivePdfUploadId(item.id);
                                      setUploadedPdfBase64(null);
                                    }}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-slate-950 font-black text-[9px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 border-b-2 border-emerald-800 transition cursor-pointer"
                                  >
                                    <Check size={11} />
                                    <span>ONAYLA VE GİRİŞ BİLDİRGESİ YÜKLE</span>
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (window.confirm("Bu giriş talebi kaydını reddetmek istediğinize emin misiniz?")) {
                                        try {
                                          await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
                                            durum: 'REDDEDİLDİ'
                                          });
                                          alert("Personel giriş talebi reddedildi.");
                                        } catch (err) {
                                          console.error(err);
                                        }
                                      }
                                    }}
                                    className="bg-rose-950 hover:bg-rose-900 border border-rose-850 text-rose-400 font-extrabold text-[9px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                  >
                                    <X size={11} />
                                    <span>REDDET</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Delete Request log option if approved or old */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm("Bu giriş talebi kaydını arşivden silmek istediğinize emin misiniz?")) {
                                try {
                                  await deleteDoc(doc(db, 'personelGirisTalepleri', item.id));
                                  alert("Kayıt başarıyla temizlendi.");
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                            className="text-slate-500 hover:text-rose-500 font-extrabold text-[8px] uppercase tracking-wider ml-auto self-center cursor-pointer"
                          >
                            Kaydı Temizle
                          </button>

                        </div>

                      </div>
                    );
                  })
                )}
              </div>
              )}

              {/* TAB 2: İŞTEN ÇIKIŞ TALEPLERİ */}
              {formenSubTab === 'cikis' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cikisTalepleriForTab.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-10 text-center col-span-2 text-slate-500 italic">
                      Şu an onay bekleyen veya kayıtlı herhangi bir işten çıkış talebi bulunmuyor.
                    </div>
                  ) : (
                    cikisTalepleriForTab.map((item) => {
                      const isPending = item.durum === 'BEKLEMEDE';
                      return (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-4.5 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                          
                          {/* Status Tag */}
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                              item.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' :
                              item.durum === 'REDDEDİLDİ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                            }`}>
                              {item.durum}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500">{new Date(item.tarih).toLocaleString('tr-TR')}</span>
                          </div>

                          {/* Person details */}
                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[8px] block">PERSONEL ADI SOYADI</span>
                              <p className="font-extrabold text-slate-900 text-[13px]">{item.personelIsim}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500 font-bold block text-[8px]">GÖREVİ / BRANŞI</span>
                                <p className="font-medium text-slate-600">{item.personelGorev || 'Belirtilmedi'}</p>
                              </div>
                              <div>
                                <span className="text-slate-500 font-bold block text-[8px]">PLANLANAN ÇIKIŞ TARİHİ</span>
                                <p className="font-medium text-amber-450">{item.cikisTarihi ? new Date(item.cikisTarihi).toLocaleDateString('tr-TR') : 'Belirtilmedi'}</p>
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold block text-[8px]">GÖNDEREN FORMEN</span>
                              <p className="font-mono text-slate-400 text-[10px]">{item.gonderenFormen}</p>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold block text-[8px]">HEDEF ONAY GRUBU</span>
                              <p className="font-bold text-slate-600 text-[10px]">{item.hedefYoneticiRole || 'GENEL YÖNETİM'}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                              <span className="text-rose-400 font-bold block text-[8px] mb-1">ÇIKIŞ SEBEBİ & GEREKÇE</span>
                              <p className="text-slate-600 italic text-[10.5px] leading-relaxed">"{item.cikisNedeni || 'Sebebi belirtilmemiş.'}"</p>
                            </div>
                          </div>

                          {/* Action Bar */}
                          <div className="flex flex-col space-y-2 pt-2 border-t border-slate-200/60">
                            {isPending ? (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleApproveCikis(item)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <Check size={11} />
                                  <span>ÇIKIŞI ONAYLA</span>
                                </button>
                                <button
                                  onClick={() => handleRejectCikis(item)}
                                  className="bg-rose-950 hover:bg-rose-900 border border-rose-850 text-rose-400 font-extrabold text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <X size={11} />
                                  <span>REDDET</span>
                                </button>
                              </div>
                            ) : (
                              <div className="w-full bg-rose-50 p-2 rounded-xl text-center text-[10px] text-slate-500">
                                Onaylayan Yetkili: <span className="font-bold text-slate-600">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                                {item.onayTarihi && <span className="block text-[8px] text-slate-500 mt-0.5">{new Date(item.onayTarihi).toLocaleString('tr-TR')}</span>}
                              </div>
                            )}

                            {/* Delete Request log option */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm("Bu çıkış talebini arşivden silmek istediğinize emin misiniz?")) {
                                  try {
                                    await deleteDoc(doc(db, 'personelCikisTalepleri', item.id));
                                    alert("Kayıt başarıyla temizlendi.");
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }
                              }}
                              className="text-slate-500 hover:text-rose-500 font-extrabold text-[8px] uppercase tracking-wider ml-auto self-center cursor-pointer"
                            >
                              Kaydı Temizle
                            </button>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: BİLGİ GÜNCELLEME TALEPLERİ */}
              {formenSubTab === 'guncelleme' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {guncellemeTalepleriForTab.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-10 text-center col-span-2 text-slate-500 italic">
                      Şu an onay bekleyen veya kayıtlı herhangi bir bilgi güncelleme talebi bulunmuyor.
                    </div>
                  ) : (
                    guncellemeTalepleriForTab.map((item) => {
                      const isPending = item.durum === 'BEKLEMEDE';
                      return (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-4.5 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                          
                          {/* Status Tag */}
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                              item.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' :
                              item.durum === 'REDDEDİLDİ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                            }`}>
                              {item.durum}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500">{new Date(item.tarih).toLocaleString('tr-TR')}</span>
                          </div>

                          {/* Details comparing old vs new */}
                          <div className="space-y-3 text-xs text-slate-600">
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[8px] block">PERSONEL BİLGİ DEĞİŞİMİ</span>
                              <h6 className="font-extrabold text-slate-900 text-sm">{item.eskiBilgiler?.ad} {item.eskiBilgiler?.soyad}</h6>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                              {/* Old info column */}
                              <div className="bg-slate-50/50 p-2 rounded-xl border border-slate-900/80 space-y-1">
                                <span className="text-slate-500 font-bold block text-[8px] uppercase">ESKİ BİLGİLER</span>
                                <div className="leading-snug">
                                  <p><span className="text-slate-400">Görev:</span> {item.eskiBilgiler?.gorev}</p>
                                  <p><span className="text-slate-400">Tel:</span> {item.eskiBilgiler?.telefon || '-'}</p>
                                  <p><span className="text-slate-400">Banka:</span> {item.eskiBilgiler?.bankaAdi || '-'}</p>
                                  <p className="font-mono text-[8px] overflow-hidden truncate"><span className="text-slate-400">IBAN:</span> {item.eskiBilgiler?.ibanNo || '-'}</p>
                                </div>
                              </div>
                              
                              {/* New info column */}
                              <div className="bg-slate-50/25 p-2 rounded-xl border border-slate-200/40 space-y-1">
                                <span className="text-slate-600 font-bold block text-[8px] uppercase">YENİ BİLGİLER</span>
                                <div className="leading-snug">
                                  <p><span className="text-slate-600">Görev:</span> <span className={item.eskiBilgiler?.gorev !== item.yeniBilgiler?.gorev ? "text-amber-700 font-bold" : ""}>{item.yeniBilgiler?.gorev}</span></p>
                                  <p><span className="text-slate-600">Tel:</span> <span className={item.eskiBilgiler?.telefon !== item.yeniBilgiler?.telefon ? "text-amber-700 font-bold" : ""}>{item.yeniBilgiler?.telefon || '-'}</span></p>
                                  <p><span className="text-slate-600">Banka:</span> <span className={item.eskiBilgiler?.bankaAdi !== item.yeniBilgiler?.bankaAdi ? "text-amber-700 font-bold" : ""}>{item.yeniBilgiler?.bankaAdi || '-'}</span></p>
                                  <p className="font-mono text-[8px] overflow-hidden truncate"><span className="text-slate-600">IBAN:</span> <span className={item.eskiBilgiler?.ibanNo !== item.yeniBilgiler?.ibanNo ? "text-amber-700 font-bold" : ""}>{item.yeniBilgiler?.ibanNo || '-'}</span></p>
                                </div>
                              </div>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl">
                              <span className="text-slate-600 font-bold block text-[8px] mb-0.5">DÜZELTME / GÜNCELLEME GEREKÇESİ</span>
                              <p className="text-slate-600 italic text-[10px] leading-relaxed">"{item.guncellemeNedeni || 'Neden belirtilmemiş.'}"</p>
                            </div>

                            <div className="text-[10px]">
                              <span className="text-slate-500 font-bold">GÖNDEREN FORMEN:</span> <span className="font-mono text-slate-500">{item.gonderenFormen}</span>
                            </div>
                          </div>

                          {/* Action Bar */}
                          <div className="flex flex-col space-y-2 pt-2 border-t border-slate-200/60">
                            {isPending ? (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleApproveGuncelleme(item)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <Check size={11} />
                                  <span>GÜNCELLEMEYİ ONAYLA</span>
                                </button>
                                <button
                                  onClick={() => handleRejectGuncelleme(item)}
                                  className="bg-rose-950 hover:bg-rose-900 border border-rose-850 text-rose-400 font-extrabold text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <X size={11} />
                                  <span>REDDET</span>
                                </button>
                              </div>
                            ) : (
                              <div className="w-full bg-rose-50 p-2 rounded-xl text-center text-[10px] text-slate-500">
                                Onaylayan Yetkili: <span className="font-bold text-slate-600">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                                {item.onayTarihi && <span className="block text-[8px] text-slate-500 mt-0.5">{new Date(item.onayTarihi).toLocaleString('tr-TR')}</span>}
                              </div>
                            )}

                            {/* Delete Request log option */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm("Bu bilgi güncelleme talebini arşivden silmek istediğinize emin misiniz?")) {
                                  try {
                                    await deleteDoc(doc(db, 'personelGuncellemeTalepleri', item.id));
                                    alert("Kayıt başarıyla temizlendi.");
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }
                              }}
                              className="text-slate-500 hover:text-rose-500 font-extrabold text-[8px] uppercase tracking-wider ml-auto self-center cursor-pointer"
                            >
                              Kaydı Temizle
                            </button>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>
              )}

            </div>
          )}

          {activeTab === 'sofor_talepleri' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="border bg-white p-4.5 rounded-2xl border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-xs text-slate-800">
                <div className="space-y-1">
                  <span className="text-sky-400 font-bold block text-[11px] tracking-widest uppercase">🚛 ŞÖFÖR MOBİL PANELİ TALEPLERİ</span>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Şoför yol harcamalarını inceleyip onaylayın. Kurucu ve yönetici onaylı kayıtları da düzenleyebilir / silebilir; bu işlemler Haftalık Kasa’ya yansır ve senkron eski haline döndürmez.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSyncYolHarcamalariToKasa()}
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3 py-2 rounded-xl cursor-pointer"
                  title="Onaylı fişleri Haftalık Kasa’ya yaz"
                >
                  Onaylıları Kasaya Yaz
                </button>
              </div>

              {/* 1. ARAÇ KARTLARI TALEPLERİ */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <span>🚗 Araç Kartı & Bakım Talepleri ({pendingAracTalepleri.length})</span>
                </h3>
                {aracOnayTalepleri.length === 0 ? (
                  <div className="bg-white border rounded-2xl p-6 text-center text-slate-500 text-xs italic">
                    Kayıtlı araç onay talebi bulunmuyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aracOnayTalepleri.map((item) => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 space-y-3 shadow-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono bg-sky-50 text-sky-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-sky-100">
                              {item.plaka}
                            </span>
                            <h4 className="font-bold text-xs text-slate-800 mt-1">{item.markaModel}</h4>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.durum === 'ONAY BEKLİYOR' ? 'bg-amber-100 text-amber-800' :
                            item.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.durum}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono">
                          <div><span className="text-slate-500 font-sans">Muayene KM:</span> <span className="font-bold text-slate-800">{item.muayeneKm}</span></div>
                          <div><span className="text-slate-500 font-sans">Muayene Tar:</span> <span className="font-bold text-slate-800">{item.muayeneTarihi}</span></div>
                          <div><span className="text-slate-500 font-sans">Yag Bakım KM:</span> <span className="font-bold text-slate-800">{item.sonYagBakimKm}</span></div>
                          <div><span className="text-slate-500 font-sans">Yag Bakım Aralığı:</span> <span className="font-bold text-slate-800">{item.yagBakimKmAraligi} KM</span></div>
                          <div className="col-span-2"><span className="text-slate-500 font-sans">Yağ Bakım Tar:</span> <span className="font-bold text-slate-800">{item.yagBakimTarihi}</span></div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span>Talep Eden: {item.gonderen || 'Şöför'}</span>
                          <span>Tarih: {item.talepTarihi ? new Date(item.talepTarihi).toLocaleDateString('tr-TR') : ''}</span>
                        </div>

                        {item.durum === 'ONAY BEKLİYOR' && (
                          <div className="flex space-x-2 pt-2 border-t">
                            <button
                              onClick={() => handleApproveAracTalebi(item)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-xl text-[10px] transition cursor-pointer"
                            >
                              Onayla & Sisteme Ekle
                            </button>
                            <button
                              onClick={() => handleRejectAracTalebi(item)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-1.5 px-3 rounded-xl text-[10px] transition cursor-pointer"
                            >
                              Reddet
                            </button>
                          </div>
                        )}
                        {item.durum !== 'ONAY BEKLİYOR' && (
                          <div className="bg-slate-50 p-2 rounded-xl text-center text-[10px] text-slate-500 border border-dashed">
                            Onaylayan/Reddeden: <span className="font-bold">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. YOL HARCAMALARI TALEPLERİ */}
              <div className="space-y-3 pt-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <span>💳 Yol Harcaması (Fiş/Fatura) Onayları ({pendingYolHarcamalari.length})</span>
                </h3>
                {yolHarcamalariVisible.length === 0 ? (
                  <div className="bg-white border rounded-2xl p-6 text-center text-slate-500 text-xs italic">
                    Kayıtlı yol harcaması talebi bulunmuyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {yolHarcamalariVisible.map((item) => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 space-y-3 shadow-xs flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-xs text-slate-800">{item.personelAdi || item.surucu || 'Bilinmeyen Şöför'}</span>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Tarih: {item.tarih}</p>
                              {item.personelId && (
                                <p className="text-[9px] text-emerald-700 font-bold mt-0.5">Personel kartına bağlı</p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-rose-600 font-mono block">{item.tutar} TL</span>
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.2 rounded-full mt-1 ${
                                item.durum === 'ONAY BEKLİYOR' ? 'bg-amber-100 text-amber-800' :
                                item.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {item.durum}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[8px] font-bold text-slate-400 block uppercase">Açıklama:</span>
                            <p className="text-[10px] text-slate-700">{item.aciklama}</p>
                            {item.fisNo && (
                              <p className="text-[10px] font-mono font-bold text-slate-800 pt-1">
                                Fiş No: {item.fisNo}
                              </p>
                            )}
                            <p className="text-[10px] pt-1">
                              <span className="text-[8px] font-bold text-slate-400 uppercase">Şoför beyanı: </span>
                              <span
                                className={`font-black ${
                                  item.masrafTipi === 'KASA' ? 'text-sky-700' : 'text-rose-700'
                                }`}
                              >
                                {item.masrafTipi === 'KASA'
                                  ? 'Kasa harcaması'
                                  : item.masrafTipi === 'KENDI'
                                    ? 'Kendi harcaması'
                                    : 'Belirtilmemiş'}
                              </span>
                            </p>
                            {item.nihaiMasrafTipi && (
                              <p className="text-[10px]">
                                <span className="text-[8px] font-bold text-slate-400 uppercase">
                                  Yönetici nihai:{' '}
                                </span>
                                <span className="font-black text-slate-800">
                                  {item.nihaiMasrafTipi === 'KASA'
                                    ? 'Kasa harcaması'
                                    : 'Şoför kendi / iade'}
                                </span>
                              </p>
                            )}
                          </div>

                          {item.faturaFotoUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setSoforFisLightbox({
                                  url: item.faturaFotoUrl,
                                  title: `${item.surucu || 'Şoför'} · ${item.fisNo || item.tarih || 'Fiş'} · ${item.tutar} TL`,
                                })
                              }
                              className="w-full border border-slate-100 rounded-xl overflow-hidden bg-slate-50 flex flex-col items-center justify-center p-2 cursor-pointer hover:border-sky-300 hover:bg-sky-50/40 transition group text-left"
                              title="Büyütmek için tıklayın"
                            >
                              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block mb-1 group-hover:text-sky-700">
                                📷 Harcama Belgesi — büyüt / indir
                              </span>
                              <img
                                src={item.faturaFotoUrl}
                                alt="Fis Görseli"
                                className="max-h-40 max-w-full rounded object-contain pointer-events-none"
                                referrerPolicy="no-referrer"
                              />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 mt-3">
                          {item.durum === 'ONAY BEKLİYOR' && (
                            <div className="pt-2 border-t space-y-2">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                                Nihai ayrım (yönetici)
                              </p>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApproveYolHarcamasi(item, 'KENDI')}
                                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-[10px] transition cursor-pointer"
                                  title="Şoföre iade / ödeme"
                                >
                                  Şoföre öde (Kendi)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApproveYolHarcamasi(item, 'KASA')}
                                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 rounded-xl text-[10px] transition cursor-pointer"
                                  title="Şirket kasası harcaması"
                                >
                                  Kasaya işle (Kasa)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectYolHarcamasi(item)}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-2 px-3 rounded-xl text-[10px] transition cursor-pointer"
                                >
                                  Reddet
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleEditYolHarcamasi(item)}
                                  className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold py-2 rounded-xl text-[10px] transition cursor-pointer inline-flex items-center justify-center gap-1"
                                >
                                  <Pencil size={11} /> Düzenle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteYolHarcamasi(item)}
                                  className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-2 rounded-xl text-[10px] transition cursor-pointer inline-flex items-center justify-center gap-1"
                                >
                                  <Trash2 size={11} /> Sil
                                </button>
                              </div>
                            </div>
                          )}
                          {item.durum !== 'ONAY BEKLİYOR' && (
                            <div className="space-y-2 pt-2 border-t">
                              <div className="bg-slate-50 p-2 rounded-xl text-center text-[10px] text-slate-500 border border-dashed">
                                Onaylayan/Reddeden: <span className="font-bold">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleEditYolHarcamasi(item)}
                                  className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold py-2 rounded-xl text-[10px] transition cursor-pointer inline-flex items-center justify-center gap-1"
                                >
                                  <Pencil size={11} /> Düzenle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteYolHarcamasi(item)}
                                  className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-2 rounded-xl text-[10px] transition cursor-pointer inline-flex items-center justify-center gap-1"
                                >
                                  <Trash2 size={11} /> Sil
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'depocu_talepleri' && (
            <div className="space-y-6">
              <div className="border bg-white p-4.5 rounded-2xl border-slate-200 flex justify-between items-center text-xs text-slate-800">
                <div className="space-y-1">
                  <span className="text-indigo-400 font-bold block text-[11px] tracking-widest uppercase">📦 DEPOCU TALEPLERİ (STOK KARTLARI &amp; HAFTALIK SAYIMLAR)</span>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Depo sorumlusundan gelen onay bekleyen yeni stok kartı açma taleplerini ve haftalık depo fiziksel sayım tutanaklarını buradan inceleyip onaylayabilirsiniz.
                  </p>
                </div>
              </div>

              {/* A. Pending Stock Cards */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <Package size={14} className="text-indigo-500" />
                  <span>Yeni Stok Kartı Açma Talepleri ({stokKartTalepleri.length})</span>
                </h3>

                {stokKartTalepleri.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-white border p-4 rounded-xl">Onay bekleyen yeni stok kartı talebi bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stokKartTalepleri.map(item => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-300 transition space-y-3 shadow-xs">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-start">
                            <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {item.stokKodu}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{item.tarih}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-xs mt-1">{item.stokAdi}</h4>
                          <div className="grid grid-cols-2 gap-2 text-[10.5px] text-slate-650">
                            <div>Kategori: <strong className="text-slate-800 font-semibold">{item.kategori}</strong></div>
                            <div>Ölçü Birimi: <strong className="text-slate-800 font-semibold">{item.birim}</strong></div>
                            <div>Giriş Miktar: <strong className="text-slate-800 font-black">{item.miktar} {item.birim}</strong></div>
                            <div>Kritik Limit: <strong className="text-rose-650 font-bold">{item.kritikSeviye || 5}</strong></div>
                          </div>
                          {item.aciklama && <p className="text-[10px] text-slate-500 italic mt-1">Not: {item.aciklama}</p>}
                        </div>

                        <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                          <button 
                            onClick={() => handleRejectStokKart(item)}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>Reddet / Sil</span>
                          </button>
                          <button 
                            onClick={() => handleApproveStokKart(item)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1 border-b-2 border-emerald-800"
                          >
                            <Check size={11} />
                            <span>Kartı Onayla</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* B. Pending Sayım Counts */}
              <div className="space-y-3 pt-6 border-t">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <FileText size={14} className="text-indigo-500" />
                  <span>Depo Fiziksel Sayım Tutanakları ({depoSayimTalepleri.length})</span>
                </h3>

                {depoSayimTalepleri.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-white border p-4 rounded-xl">Onay bekleyen depo fiziksel sayım belgesi bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {depoSayimTalepleri.map(item => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-300 transition space-y-3 shadow-xs">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              Hafta {item.haftaNo || '1'} Sayımı
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{item.tarih}</span>
                          </div>
                          <p className="text-[10.5px] text-slate-650 font-medium">Sayım Yapan: <strong className="text-slate-800">{item.sayimYapan}</strong></p>
                          {item.notlar && <p className="text-[10.5px] bg-slate-50 p-2 rounded-xl text-slate-600 border italic">" {item.notlar} "</p>}
                          
                          <div className="pt-2">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Tespit Edilen Farklar</span>
                            <div className="space-y-1 text-[10px] font-mono text-slate-650 max-h-32 overflow-y-auto pr-1">
                              {item.kalemler?.map((k: any, idx: number) => (
                                <div key={idx} className="flex justify-between p-1 bg-slate-50 border rounded mt-0.5">
                                  <span>{k.urunAdi} ({k.kod})</span>
                                  <span className="font-bold flex items-center space-x-1">
                                    <span className="text-slate-400">{k.systemQty} ➔ {k.physicalQty}</span>
                                    <span className={k.diff < 0 ? 'text-rose-650' : k.diff > 0 ? 'text-emerald-600' : 'text-slate-500'}>
                                      ({k.diff > 0 ? `+${k.diff}` : k.diff} {k.birim})
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2.5 border-t border-slate-105">
                          <button 
                            onClick={() => handleRejectDepoSayim(item)}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>Sayımı İptal Et / Reddet</span>
                          </button>
                          <button 
                            onClick={() => handleApproveDepoSayim(item)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1 border-b-2 border-emerald-800"
                          >
                            <Check size={11} />
                            <span>Sayımı Onayla &amp; Güncelle</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'anahtarci_tutanaklari' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border bg-white p-4.5 rounded-2xl border-slate-200 flex justify-between items-center text-xs text-slate-800">
                <div className="space-y-1">
                  <span className="text-amber-700 font-bold block text-[11px] tracking-widest uppercase">🔑 ANAHTARCI &amp; İMALAT TUTANAKLARI ONAY HAVUZU</span>
                  <p className="text-slate-500 leading-relaxed text-[11px]">
                    İmalat terminalinden gönderilen hasarlı alan tutanaklarını ve taşeron ceza tutanaklarını buradan inceleyip onaylayabilirsiniz.
                  </p>
                </div>
              </div>

              {anahtarciTutanaklari.length === 0 ? (
                <p className="text-xs text-slate-500 italic bg-white border p-4 rounded-xl">Onay bekleyen herhangi bir anahtarcı tutanağı bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {anahtarciTutanaklari.map((item) => {
                    const isCeza = item.tutanakTipi === 'CEZA';
                    return (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col space-y-4 shadow-sm relative overflow-hidden">
                        
                        {/* Header Info */}
                        <div className="flex justify-between items-start border-b pb-3">
                          <div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                              isCeza ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {item.tutanakTipi} TUTANAĞI
                            </span>
                            <h4 className="font-extrabold text-slate-800 text-sm mt-2">{item.konu}</h4>
                            <p className="text-[10px] text-slate-400 mt-1 font-mono">{item.belgeNo} | Tarih: {item.tarih}</p>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-[8px] text-slate-500 block uppercase font-bold">Gönderen Anahtarcı</span>
                            <span className="text-[10.5px] font-bold text-slate-800 font-mono">{item.kaydedenAnahtarci}</span>
                          </div>
                        </div>

                        {/* Ceza Details if any */}
                        {isCeza && (
                          <div className="bg-rose-50/30 p-4 rounded-2xl border border-rose-100 grid grid-cols-2 gap-4 text-xs font-sans">
                            <div>
                              <span className="text-slate-500 block text-[9px] uppercase font-bold">Muhatap Taşeron Firma</span>
                              <strong className="text-rose-800 font-extrabold">{item.taseronAdi}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px] uppercase font-bold">Kesilecek Ceza Tutarı</span>
                              <strong className="text-rose-800 font-mono text-sm font-black">₺{(item.cezaTutari || 0).toLocaleString('tr-TR')}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px] uppercase font-bold">Muhatap Personel</span>
                              <span className="text-slate-700 font-bold">{item.muhatapPersonel || '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px] uppercase font-bold">Teslim Eden Personel</span>
                              <span className="text-slate-700 font-bold">{item.teslimEden || '-'}</span>
                            </div>
                          </div>
                        )}

                        {/* Content text */}
                        <div className="space-y-1">
                          <span className="text-slate-400 text-[9px] uppercase font-bold block">Tutanak Metni ve Olay Özeti</span>
                          <div className="p-4 bg-slate-50 border rounded-2xl text-xs text-slate-800 font-serif leading-relaxed whitespace-pre-wrap">
                            {item.icerik}
                          </div>
                        </div>

                        {/* Comparative Images or Single Images */}
                        {(item.foto1 || item.foto2 || item.foto3) && (
                          <div className="space-y-2">
                            <span className="text-slate-400 text-[9px] uppercase font-bold block">Kanıt Fotoğrafları / Durum Karşılaştırması</span>
                            
                            {isCeza && item.foto1 && item.foto2 ? (
                              // Ceza has initial and final photos side by side
                              <div className="grid grid-cols-2 gap-4">
                                <div className="border rounded-2xl overflow-hidden bg-white flex flex-col">
                                  <div className="bg-slate-50 text-[9px] text-sky-400 p-2 font-bold text-center border-b border-slate-200 font-sans">
                                    FOTOĞRAF 1: ANAHTAR TESLİM ANI (İLK HAL)
                                  </div>
                                  <img src={item.foto1} alt="Teslim" className="w-full aspect-video object-cover max-h-56" />
                                </div>
                                <div className="border rounded-2xl overflow-hidden bg-white flex flex-col">
                                  <div className="bg-slate-50 text-[9px] text-rose-450 p-2 font-bold text-center border-b border-slate-200 font-sans">
                                    FOTOĞRAF 2: GERİ ALMA ANI (HASAR DURUMU)
                                  </div>
                                  <img src={item.foto2} alt="Iade" className="w-full aspect-video object-cover max-h-56" />
                                </div>
                              </div>
                            ) : (
                              // HASAR tutanagi, show up to 3 photos in a row
                              <div className="grid grid-cols-3 gap-3">
                                {item.foto1 && (
                                  <div className="border rounded-2xl overflow-hidden bg-white">
                                    <img src={item.foto1} alt="hasar1" className="w-full aspect-square object-cover" />
                                  </div>
                                )}
                                {item.foto2 && (
                                  <div className="border rounded-2xl overflow-hidden bg-white">
                                    <img src={item.foto2} alt="hasar2" className="w-full aspect-square object-cover" />
                                  </div>
                                )}
                                {item.foto3 && (
                                  <div className="border rounded-2xl overflow-hidden bg-white">
                                    <img src={item.foto3} alt="hasar3" className="w-full aspect-square object-cover" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Signature block with Kibritci Logo */}
                        <div className="border-t pt-4 flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100 font-sans">
                          <div className="flex items-center space-x-2 shrink-0">
                            <KibritciLogo size="sm" />
                            <span className="text-[10px] font-black text-slate-850 tracking-wide">KİBRİTÇİ İNŞAAT A.Ş.</span>
                          </div>
                          
                          <div className="flex gap-4 text-[9px] text-slate-500 font-bold">
                            <div className="text-right">
                              <span className="text-slate-400 block uppercase font-bold text-[8px]">Hazırlayan Yetkili</span>
                              <span className="text-slate-800 font-extrabold">{item.teslimEden || 'Anahtarcı Yetkilisi'}</span>
                            </div>
                            {item.muhatapPersonel && (
                              <div className="text-right border-l pl-4">
                                <span className="text-slate-400 block uppercase font-bold text-[8px]">Muhatap Taşeron Yetkilisi</span>
                                <span className="text-slate-800 font-extrabold">{item.muhatapPersonel}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => handleRejectAnahtarciTutanak(item)}
                            className="flex-1 bg-rose-50 hover:bg-rose-105 text-rose-700 border border-rose-150 py-2.5 px-4 rounded-xl text-xs font-black tracking-widest transition flex items-center justify-center space-x-1.5 cursor-pointer uppercase"
                          >
                            <span>Tutanağı İptal Et / Reddet</span>
                          </button>
                          <button
                            onClick={() => handleApproveAnahtarciTutanak(item)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white py-2.5 px-4 rounded-xl text-xs font-black tracking-widest transition flex items-center justify-center space-x-1.5 border-b-2 border-emerald-800 cursor-pointer uppercase shadow-lg shadow-emerald-600/10"
                          >
                            <span>Tutanağı Onayla</span>
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Detail Modal */}
      {activeDocForDetail && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-[600px] overflow-hidden shadow-2xl animate-in scale-in duration-200">
            
            <div className="bg-white p-4 flex justify-between items-center border-b border-slate-200">
              <h4
                className="font-extrabold text-base tracking-tight text-[#15252B]"
                style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
              >
                Belge Detayı
              </h4>
              <button
                onClick={() => setActiveDocForDetail(null)}
                className="text-[#5B6B73] hover:text-[#15252B] font-semibold text-xs cursor-pointer px-2 py-1 rounded-lg hover:bg-[#F3F6F7]"
              >
                Kapat
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-600 max-h-[70vh] overflow-y-auto">
              {activeDocForDetail.type === 'request' && (
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Talep Kodu / Tarih:</span>
                    <span className="font-bold text-slate-900 font-mono">{activeDocForDetail.data.saId} ({activeDocForDetail.data.tarih})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cari Firma:</span>
                    <span className="font-bold text-slate-900">{activeDocForDetail.data.cariFirma}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Talep Eden Sorumlu:</span>
                    <span className="font-bold text-slate-900">{activeDocForDetail.data.talepEden}</span>
                  </div>
                  {activeDocForDetail.data.aciklama && (
                    <div className="p-3 bg-white rounded border border-slate-200">
                      <span className="text-[9px] text-slate-500 font-bold block uppercase mb-1">Açıklama / Şantiye Notu:</span>
                      <p>{activeDocForDetail.data.aciklama}</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Malzeme Listesi</span>
                    <table className="w-full text-left font-mono text-[10px] border border-slate-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-white text-slate-400">
                          <th className="p-2">Urun Adı</th>
                          <th className="p-2 text-right">Miktar / Birim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDocForDetail.data.kalemler?.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-200">
                            <td className="p-2 text-slate-800">{item.urunAdi}</td>
                            <td className="p-2 text-right text-amber-700 font-bold">{item.miktar} {item.birim}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activeDocForDetail.data.imzaliEvrakUrl && (
                    <div className="pt-2">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold mb-1">📸 Yüklenen Evrak</span>
                      <img src={activeDocForDetail.data.imzaliEvrakUrl} alt="Signed Doc" className="max-h-36 rounded border object-contain mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {activeDocForDetail.type === 'waybill' && (
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">İrsaliye Kodu / Tarih:</span>
                    <span className="font-bold text-slate-900 font-mono">{activeDocForDetail.data.irsaliyeNo} ({activeDocForDetail.data.tarih})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sevkiyat Yapan Firma / Şantiye:</span>
                    <span className="font-bold text-slate-900">{activeDocForDetail.data.firma}</span>
                  </div>
                  {activeDocForDetail.data.saId && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold text-emerald-700">İlişkili Satın Alma Sipariş Kodu:</span>
                      <span className="font-black text-amber-700 font-mono">{activeDocForDetail.data.saId}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Teslim Alınan Malzemeler</span>
                    <table className="w-full text-left font-mono text-[10px] border border-slate-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-white text-slate-400">
                          <th className="p-2">Urun Adı</th>
                          <th className="p-2 text-right">Teslim Miktarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDocForDetail.data.kalemler?.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-200">
                            <td className="p-2 text-slate-800">{item.urunAdi}</td>
                            <td className="p-2 text-right text-emerald-700 font-bold">{item.miktar} {item.birim}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activeDocForDetail.data.karsilastirmaRaporu && (
                    <div className="p-3 bg-indigo-950/40 border border-indigo-900 rounded-xl">
                      <span className="font-bold text-[9px] text-slate-500 block mb-1 uppercase tracking-wider">📋 İrsaliye Analiz &amp; Sapma Raporu</span>
                      <p className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap leading-relaxed">{activeDocForDetail.data.karsilastirmaRaporu}</p>
                    </div>
                  )}

                  {activeDocForDetail.data.fisEvrakUrl && (
                    <div className="pt-2">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold mb-1">📸 Yüklenen Belge Resmî Fotoğrafı</span>
                      <img src={activeDocForDetail.data.fisEvrakUrl} alt="Waybill Doc" className="max-h-36 rounded border object-contain mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {activeDocForDetail.type === 'invoice' && (
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Fatura Kodu / Tarih:</span>
                    <span className="font-bold text-slate-900 font-mono">{activeDocForDetail.data.faturaNo} ({activeDocForDetail.data.tarih})</span>
                  </div>
                  <div className="flex justify-between font-bold text-purple-400">
                    <span className="text-slate-400">Mükellef Cari Kart Unvanı:</span>
                    <span>{activeDocForDetail.data.cariUnvan}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-white rounded border border-slate-200 text-[10px]">
                    <span className="text-slate-500 font-bold">Matrah Tutarı:</span>
                    <span className="font-mono text-purple-300">₺{activeDocForDetail.data.toplamTutar?.toLocaleString()}</span>
                    <span className="text-slate-500 font-bold">KDV (%20):</span>
                    <span className="font-mono text-purple-300">₺{activeDocForDetail.data.kdvTutar?.toLocaleString()}</span>
                  </div>

                  <div className="pt-2">
                    <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Fatura Kalemleri &amp; Birim Fiyatlar</span>
                    <table className="w-full text-left font-mono text-[10px] border border-slate-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-white text-slate-400">
                          <th className="p-2">Hizmet/Malzeme</th>
                          <th className="p-2 text-center">Fiyat (KDV Hariç)</th>
                          <th className="p-2 text-right">Toplam Tutarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDocForDetail.data.kalemler?.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-200">
                            <td className="p-2 text-slate-800">{item.urunAdi} ({item.miktar} {item.birim})</td>
                            <td className="p-2 text-center text-slate-400">₺{item.birimFiyat?.toLocaleString()}</td>
                            <td className="p-2 text-right text-purple-400 font-bold">₺{item.toplam?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activeDocForDetail.data.rapor && (
                    <div className="p-3 bg-purple-950/40 border border-purple-900 rounded-xl">
                      <span className="font-bold text-[9px] text-purple-300 block mb-1 uppercase tracking-wider">📋 Üçlü Mutabakat Analiz &amp; Sapma Raporu</span>
                      <p className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap leading-relaxed">{activeDocForDetail.data.rapor}</p>
                    </div>
                  )}

                  {activeDocForDetail.data.imzaliEvrakUrl && (
                    <div className="pt-2">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold mb-1">📸 Yüklenen Fatura Ek Evrakı</span>
                      <img src={activeDocForDetail.data.imzaliEvrakUrl} alt="Invoice Doc" className="max-h-36 rounded border object-contain mx-auto" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-white/80 border-t border-slate-200 flex gap-2.5 justify-end">
              <button 
                onClick={() => handleRejectDocument(activeDocForDetail.type, activeDocForDetail.id)}
                className="bg-rose-900/40 border border-rose-800/80 text-rose-300 py-1.5 px-4 rounded-xl text-xs font-bold hover:bg-rose-900/60 cursor-pointer transition"
              >
                Onaylama Kabul Etme (Reddet)
              </button>
              <button 
                onClick={() => handleApproveDocument(activeDocForDetail.type, activeDocForDetail.id)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/10 cursor-pointer transition font-black"
              >
                Seçilen Kaşe ile Evrakı Onayla
              </button>
            </div>

          </div>
        </div>
      )}

      {soforFisLightbox && (
        <ImageLightbox
          url={soforFisLightbox.url}
          title={soforFisLightbox.title}
          fileName={`sofor-fis-${soforFisLightbox.title.slice(0, 40)}`}
          onClose={() => setSoforFisLightbox(null)}
        />
      )}

    </div>
  );
};
