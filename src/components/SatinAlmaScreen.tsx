import React, { useRef, useState, useMemo } from 'react';
import { 
  ShoppingCart, Plus, Trash2, Edit3, Eye, Upload, 
  Send, ShieldCheck, Search, Sparkles, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { SatinAlmaTalebi, SatinAlmaItem, CariKart, StokKart, StokKartIslem, CariKartIslem, Irsaliye, Fatura } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { confirmSignedUploadWithMismatchCheck } from '../lib/evrakOnayUtils';
import { findNearDuplicateStokName, normalizeCardName } from '../lib/duplicateNameUtils';
import { fetchApiJson } from '../lib/apiClient';
import { normalizeDateKey } from '../lib/dateKeyUtils';
import { openHtmlReportWindow, openReportEmailComposer } from '../lib/reportEmail';
import { buildSatinAlmaReportHtml } from '../lib/satinAlmaReportHtml';
import { createSatinAlmaPublicShare } from '../lib/satinAlmaPublicShare';
import {
  applyStokGirisFromKalemler,
  appendCariIslemOnce,
  buildCariEvrakHistory,
  countLinkedStok,
  linkSatinAlmaKalemler,
  resolveCariKartId,
} from '../lib/evrakCariStokSync';
import {
  buildIrsaliyeFromSatinAlma,
  buildMultiIrsaliyeFromSatinAlma,
  describeEvrakZinciri,
  ensureIrsaliyeSaBaglari,
  findIrsaliyelerForSa,
} from '../lib/evrakDonusum';
import { openEvrakZincirRaporu } from '../lib/evrakZincirRapor';
import {
  buildNDeliveryTemplates,
  createIrsaliyelerFromSatinAlma,
  kalanMiktarForSaKalem,
} from '../lib/satinAlmaIrsaliyeUtils';
import {
  EvrakArchivePanel,
  EvrakArchiveSearch,
  EvrakPageShell,
  EvrakSectionHeader,
} from './evrakUi/EvrakScreenChrome';
import { EvrakIslemMenu } from './evrakUi/EvrakIslemMenu';
import {
  MuhasebeBelgeForm,
  MuhasebeField,
  MuhasebeKalemRow,
  MuhasebeKalemTablosu,
  muhasebeInputClass,
} from './evrakUi/MuhasebeBelgeForm';

interface SatinAlmaScreenProps {
  satinAlmaTalepleri: SatinAlmaTalebi[];
  setSatinAlmaTalepleri: React.Dispatch<React.SetStateAction<SatinAlmaTalebi[]>>;
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: React.Dispatch<React.SetStateAction<StokKartIslem[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  kullanicilar?: any[];
  currentUser?: any;
  addNotification?: (mesaj: string) => void;
  /** İrsaliye Giriş ekranına SA ön doldurma ile geçiş */
  onOpenIrsaliyeFromSa?: (sa: SatinAlmaTalebi) => void;
}

export const SatinAlmaScreen: React.FC<SatinAlmaScreenProps> = ({
  satinAlmaTalepleri,
  setSatinAlmaTalepleri,
  irsaliyeler = [],
  setIrsaliyeler,
  faturalar = [],
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  setStokIslemGecmisi,
  setCariIslemGecmisi,
  currentUser,
  addNotification,
  onOpenIrsaliyeFromSa,
}) => {
  const [saSupplier, setSaSupplier] = useState("");
  const [saDate, setSaDate] = useState(new Date().toISOString().split('T')[0]);
  const [saNotes, setSaNotes] = useState("");
  const [cartItems, setCartItems] = useState<SatinAlmaItem[]>([]);
  const [editingSaId, setEditingSaId] = useState<string | null>(null);
  const [saAttachmentUrl, setSaAttachmentUrl] = useState<string | null>(null);
  const [saSearchKeyword, setSaSearchKeyword] = useState("");
  const [talepTab, setTalepTab] = useState<'MEVCUT' | 'DONUSTURULDU' | 'ARSIV'>('MEVCUT');
  const [emailSendingId, setEmailSendingId] = useState<string | null>(null);
  const [talepTarihFiltre, setTalepTarihFiltre] = useState('');
  const legacyDocInputRef = useRef<HTMLInputElement | null>(null);
  const [legacyImportLoading, setLegacyImportLoading] = useState(false);
  const [selectedSaIds, setSelectedSaIds] = useState<Set<string>>(new Set());
  const [irsaliyeModalSa, setIrsaliyeModalSa] = useState<SatinAlmaTalebi | null>(null);
  const [irsaliyeKalemId, setIrsaliyeKalemId] = useState('');
  const [irsaliyeAdet, setIrsaliyeAdet] = useState(1);
  const [irsaliyeMiktarEach, setIrsaliyeMiktarEach] = useState(1);

  const [tempItem, setTempItem] = useState<Omit<SatinAlmaItem, 'id'>>({
    urunAdi: "",
    miktar: 0,
    birim: "ADET",
    marka: "",
    kullanilacakYer: "",
    aciklama: ""
  });

  // Suggest modals
  const [showCariSuggest, setShowCariSuggest] = useState(false);
  const [suggestedCariName, setSuggestedCariName] = useState("");
  const [suggestedCariType, setSuggestedCariType] = useState<CariKart['kartTipi']>('TEDARIKCI');

  const [showStokSuggest, setShowStokSuggest] = useState(false);
  const [suggestedStokName, setSuggestedStokName] = useState("");
  const [suggestedStokCat, setSuggestedStokCat] = useState("Kaba İnşaat İmalatı");
  const [suggestedStokUnit, setSuggestedStokUnit] = useState("ADET");

  const [nearStokSuggest, setNearStokSuggest] = useState<{
    originalName: string;
    nearStok: StokKart;
    unit: string;
  } | null>(null);

  const checkAndSuggestCari = (name: string) => {
    const exists = cariKartlar.some(c => c.unvan.toLowerCase().trim() === name.toLowerCase().trim());
    if (!exists) {
      setSuggestedCariName(name);
      setShowCariSuggest(true);
    }
  };

  const checkAndSuggestStok = (name: string, unit: string = "ADET") => {
    const exact = stokKartlar.find((s) => normalizeCardName(s.stokAdi) === normalizeCardName(name));
    const near = findNearDuplicateStokName(stokKartlar, name, 1);
    if (!exact && near) {
      setNearStokSuggest({
        originalName: name,
        nearStok: near,
        unit: unit || "ADET",
      });
      return;
    }
    if (!exact && !near) {
      setSuggestedStokName(name);
      setSuggestedStokUnit(unit);
      setShowStokSuggest(true);
      return;
    }
  };

  const handleAcceptNearStok = () => {
    if (!nearStokSuggest) return;
    setCartItems(prev => {
      const newCart = [...prev];
      const lastItem = newCart[newCart.length - 1];
      if (lastItem && lastItem.urunAdi === nearStokSuggest.originalName) {
        lastItem.urunAdi = nearStokSuggest.nearStok.stokAdi;
        lastItem.stokKartId = nearStokSuggest.nearStok.id;
      }
      return newCart;
    });
    setNearStokSuggest(null);
  };

  const handleCreateNewStokFromNear = () => {
    if (!nearStokSuggest) return;
    setSuggestedStokName(nearStokSuggest.originalName);
    setSuggestedStokUnit(nearStokSuggest.unit);
    setNearStokSuggest(null);
    setShowStokSuggest(true);
  };

  const handleRejectNearStokAndContinue = () => {
    setNearStokSuggest(null);
  };

  const handleCreateCari = () => {
    if (!suggestedCariName) return;
    const exists = cariKartlar.some(c => c.unvan.toLowerCase().trim() === suggestedCariName.toLowerCase().trim());
    if (exists) {
      alert("Hata: Bu isimde bir cari zaten bulunmaktadır.");
      setShowCariSuggest(false);
      return;
    }
    const newC: CariKart = {
      id: `ck_${Date.now()}`,
      kartTipi: suggestedCariType,
      kod: `CAR-${Math.floor(100 + Math.random() * 900)}`,
      unvan: suggestedCariName,
      yetkili: "Otomatik Eklendi",
      telefon: "",
      eposta: "",
      vergiNo: "",
      vergiDairesi: "",
      adres: "Satın alma talebinden otomatik oluşturuldu.",
      iban: "",
      durum: 'AKTIF',
      notlar: "Otomatik eklendi."
    };
    if (setCariKartlar) {
      setCariKartlar(prev => [newC, ...prev]);
    }
    setShowCariSuggest(false);
    alert(`Yeni Cari Kart (${suggestedCariName}) başarıyla oluşturuldu!`);
  };

  const handleCreateStok = () => {
    if (!suggestedStokName) return;
    const exists = stokKartlar.some(s => s.stokAdi.toLowerCase().trim() === suggestedStokName.toLowerCase().trim());
    if (exists) {
      alert(`Hata: "${suggestedStokName}" adında birebir aynı stok zaten var. Mükerrer kart açılmadı.`);
      setShowStokSuggest(false);
      return;
    }
    const newS: StokKart = {
      id: `sk_${Date.now()}`,
      stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
      stokAdi: suggestedStokName,
      kategori: suggestedStokCat,
      birim: suggestedStokUnit,
      kritikSeviye: 5,
      durum: 'AKTIF',
      aciklama: "Satın alma talebinden otomatik oluşturuldu."
    };
    if (setStokKartlar) {
      setStokKartlar(prev => [newS, ...prev]);
    }
    setShowStokSuggest(false);
    alert(`Yeni Stok Kartı (${suggestedStokName}) başarıyla oluşturuldu!`);
  };

  const buildSaId = (orderDate: string) => {
    const dateKey = String(orderDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const existing = new Set(satinAlmaTalepleri.map((s) => s.saId));
    let seq = satinAlmaTalepleri.filter((s) => String(s.saId || '').includes(`SA-${dateKey}-`)).length + 1;
    let candidate = `SA-${dateKey}-${String(seq).padStart(3, '0')}`;
    while (existing.has(candidate)) {
      seq += 1;
      candidate = `SA-${dateKey}-${String(seq).padStart(3, '0')}`;
    }
    return candidate;
  };

  const findExistingStok = (name: string, list: StokKart[]) => {
    const exact = list.find((s) => normalizeCardName(s.stokAdi) === normalizeCardName(name));
    if (exact) return exact;
    return findNearDuplicateStokName(list, name, 1);
  };

  const normalizeCartItemsByKnownStok = (items: SatinAlmaItem[]) =>
    items.map((item) => {
      const match = stokKartlar.find((s) => normalizeCardName(s.stokAdi) === normalizeCardName(item.urunAdi));
      if (!match) return item;
      return { ...item, urunAdi: match.stokAdi, stokKartId: item.stokKartId || match.id, birim: item.birim || match.birim || 'ADET' };
    });

  const syncPurchaseToStokCards = (items: SatinAlmaItem[], saId: string, tarih: string, supplier: string) => {
    applyStokGirisFromKalemler({
      kalemler: items,
      belgeNo: saId,
      tarih,
      supplier,
      islemBaslik: 'Satın Alma Talebi',
      islemDetayPrefix: 'Satın alma kaydı ·',
      bumpMiktar: true,
      stokKartlar,
      setStokKartlar,
      setStokIslemGecmisi,
      aciklamaTag: 'Satın Alma',
    });
  };

  const handleAddToCart = () => {
    if (!tempItem.urunAdi || tempItem.miktar <= 0) {
      alert("Lütfen ürün adı ve miktarını doldurun.");
      return;
    }
    const exactStok = stokKartlar.find((s) => normalizeCardName(s.stokAdi) === normalizeCardName(tempItem.urunAdi));
    const newItem: SatinAlmaItem = {
      ...tempItem,
      urunAdi: exactStok?.stokAdi || tempItem.urunAdi.trim(),
      birim: tempItem.birim || exactStok?.birim || 'ADET',
      stokKartId: exactStok?.id,
      id: `sai_${Date.now()}`
    };
    setCartItems(prev => [...prev, newItem]);
    checkAndSuggestStok(tempItem.urunAdi, tempItem.birim);
    setTempItem({
      urunAdi: "",
      miktar: 0,
      birim: "ADET",
      marka: "",
      kullanilacakYer: "",
      aciklama: ""
    });
  };

  const handleSavePurchaseOrder = () => {
    if (cartItems.length === 0 || !saSupplier) {
      alert("Lütfen firma adını ve en az bir malzeme kalemi ekleyin!");
      return;
    }

    const cleanDate = saDate || new Date().toISOString().split('T')[0];
    const cariResolved = resolveCariKartId(saSupplier, cariKartlar);
    const normalizedCartItems = linkSatinAlmaKalemler(
      normalizeCartItemsByKnownStok(cartItems),
      stokKartlar
    );
    const purchaseSaId = editingSaId
      ? satinAlmaTalepleri.find((s) => s.id === editingSaId)?.saId || buildSaId(cleanDate)
      : buildSaId(cleanDate);
    const recordId = editingSaId || `sa_${Date.now()}`;

    if (editingSaId) {
      setSatinAlmaTalepleri(prev => prev.map(sa => {
        if (sa.id === editingSaId) {
          return {
            ...sa,
            tarih: cleanDate,
            saId: purchaseSaId,
            cariFirma: saSupplier,
            cariKartId: cariResolved.cariKartId || sa.cariKartId,
            aciklama: saNotes,
            kalemler: normalizedCartItems,
            imzaliEvrakUrl: saAttachmentUrl || sa.imzaliEvrakUrl
          };
        }
        return sa;
      }));
      setEditingSaId(null);
    } else {
      const newSa: SatinAlmaTalebi = {
        id: recordId,
        saId: purchaseSaId,
        tarih: cleanDate,
        talepEden: '',
        cariFirma: saSupplier,
        cariKartId: cariResolved.cariKartId || undefined,
        onayDurumu: 'ONAY BEKLİYOR',
        aciklama: saNotes,
        kalemler: normalizedCartItems,
        imzaliEvrakUrl: saAttachmentUrl || undefined,
        eImzalar: []
      };
      setSatinAlmaTalepleri(prev => [newSa, ...prev]);
    }

    checkAndSuggestCari(saSupplier);
    syncPurchaseToStokCards(normalizedCartItems, purchaseSaId, cleanDate, saSupplier);

    if (cariResolved.cariKartId) {
      appendCariIslemOnce(
        setCariIslemGecmisi,
        buildCariEvrakHistory({
          cariKartId: cariResolved.cariKartId,
          islemTipi: 'SATIN_ALMA',
          islemId: recordId,
          islemBaslik: 'Satın Alma Talebi',
          islemDetay: `${purchaseSaId} · ${saSupplier} · ${normalizedCartItems.length} kalem`,
          tarih: cleanDate,
          belgeNo: purchaseSaId,
        })
      );
    }

    const stokLink = countLinkedStok(normalizedCartItems);
    if (addNotification) {
      addNotification(
        `${purchaseSaId} kaydedildi. Cari: ${cariResolved.matched ? 'bağlı' : 'önerildi'} · Stok: ${stokLink.linked}/${stokLink.total}`
      );
    }

    // reset
    setSaSupplier("");
    setSaDate(new Date().toISOString().split('T')[0]);
    setSaNotes("");
    setCartItems([]);
    setSaAttachmentUrl(null);
    alert(
      cariResolved.matched
        ? `Satın alma kaydedildi.\nCari kart bağlı · Stok eşleşmesi ${stokLink.linked}/${stokLink.total}`
        : `Satın alma kaydedildi.\nCari kart bulunamadı — öneri penceresini kontrol edin.\nStok eşleşmesi ${stokLink.linked}/${stokLink.total}`
    );
  };

  const handleConvertSaToIrsaliye = (sa: SatinAlmaTalebi) => {
    if (!sa.kalemler?.length) {
      alert('Bu siparişte kalem yok; irsaliyeye dönüştürülemez.');
      return;
    }

    const existing = findIrsaliyelerForSa(sa, irsaliyeler);
    if (existing.length > 0) {
      const ok = window.confirm(
        `Bu sipariş için zaten ${existing.length} irsaliye var:\n${existing
          .map((x) => x.irsaliyeNo)
          .join(', ')}\n\nİrsaliye giriş formuna kalan kalemlerle geçilsin mi?`
      );
      if (!ok) return;
    }

    if (onOpenIrsaliyeFromSa) {
      onOpenIrsaliyeFromSa(sa);
      if (addNotification) {
        addNotification(
          `${sa.saId} → İrsaliye Giriş formu açıldı. Ürünler siparişten dolduruldu; kaydedince evrak oluşur.`
        );
      }
      return;
    }

    // Fallback: App bağlantısı yoksa eski anlık üretim
    if (!setIrsaliyeler) {
      alert('İrsaliye kaydı için sistem bağlantısı yok. Sayfayı yenileyip tekrar deneyin.');
      return;
    }
    const { irsaliye } = buildIrsaliyeFromSatinAlma(sa, {
      irsaliyeler,
      cariKartlar,
      stokKartlar,
    });
    setIrsaliyeler((prev) => [irsaliye, ...prev]);
    setTalepTab('DONUSTURULDU');
    alert(`İrsaliye oluşturuldu: ${irsaliye.irsaliyeNo}`);
  };

  const openMultiIrsaliyeModal = (sa: SatinAlmaTalebi) => {
    if (!setIrsaliyeler) {
      alert('İrsaliye kaydı için sistem bağlantısı yok. Sayfayı yenileyip tekrar deneyin.');
      return;
    }
    // Mevcut irsaliye sayısı
    const mevcutSayisi = findIrsaliyelerForSa(sa, irsaliyeler).length;

    // Kullanıcıdan kaç irsaliye üreteceğini sor
    const rawInput = window.prompt(
      `"${sa.saId}" siparışi için kaç adet sevk irsaliyesi üretilsin?\n` +
        `(Firma: ${sa.cariFirma} · ${sa.kalemler.length} kalem)\n` +
        (mevcutSayisi > 0 ? `\nBu siparış için halihazırda ${mevcutSayisi} irsaliye var.\n` : '') +
        `\nÖrnek: 20 araba mıcır için 20 girin.`,
      '1'
    );
    if (rawInput === null) return; // iptal

    const adet = parseInt(rawInput.trim(), 10);
    if (!Number.isFinite(adet) || adet < 1 || adet > 500) {
      alert('Geçersiz sayı. 1 ile 500 arasında bir değer girin.');
      return;
    }

    // Miktar bölünüsümü sorusu (sadece >1 irsaliye için)
    let bolunmuslu = false;
    if (adet > 1) {
      bolunmuslu = window.confirm(
        `Toplam miktarlar ${adet} irsaliyeye bölünsün mü?\n\n` +
          `EVET: Her irsaliyede miktar = Toplam / ${adet} (tonaj bölümü)\n` +
          `HAYIR: Her irsaliyede siparişteki tam miktar bulunur (siz düzenlersiniz)`
      );
    }
    if (!sa.kalemler?.length) {
      alert('Bu siparişte kalem yok.');
      return;
    }
    const firstKalem = sa.kalemler[0];
    const kalan = firstKalem ? kalanMiktarForSaKalem(sa, firstKalem, irsaliyeler) : 1;
    setIrsaliyeModalSa(sa);
    setIrsaliyeKalemId(firstKalem.id);
    setIrsaliyeMiktarEach(1);
    setIrsaliyeAdet(Math.max(1, Math.min(Math.ceil(kalan) || 1, 50)));
  };

  const handleCreateMultiIrsaliye = () => {
    if (!irsaliyeModalSa || !setIrsaliyeler) return;
    const sa = irsaliyeModalSa;
    const { irsaliyeler: yeniIrsaliyeler, alreadyExists, warning } =
      buildMultiIrsaliyeFromSatinAlma(sa, irsaliyeAdet, {
        irsaliyeler,
        cariKartlar,
        stokKartlar,
        bolunmuslu: false, // Varsayılan tutum
      });

    if (alreadyExists.length > 0 && warning) {
      const devam = window.confirm(`${warning}\n\nDevam etmek istiyor musunuz?`);
      if (!devam) return;
    }

    setIrsaliyeler((prev) => [...yeniIrsaliyeler, ...prev]);

    // Her irsaliye için cari güncelle (ilk irsaliye yeterli, tekrar etme)
    const firstWithCari = yeniIrsaliyeler.find((ir) => ir.cariKartId);
    if (firstWithCari?.cariKartId) {
      appendCariIslemOnce(
        setCariIslemGecmisi,
        buildCariEvrakHistory({
          cariKartId: firstWithCari.cariKartId,
          islemTipi: 'IRSALIYE',
          islemId: firstWithCari.id,
          islemBaslik: 'Siparışten Çoklu İrsaliye',
          islemDetay:
            `${sa.saId} → ${irsaliyeAdet} irsaliye ` +
            `(${yeniIrsaliyeler[0].irsaliyeNo}${irsaliyeAdet > 1 ? ` – ${yeniIrsaliyeler[irsaliyeAdet - 1].irsaliyeNo}` : ''}) · ${sa.cariFirma}`,
          tarih: firstWithCari.tarih,
          belgeNo: yeniIrsaliyeler[0].irsaliyeNo,
        })
      );
    }

    if (addNotification) {
      const nos = yeniIrsaliyeler.map((ir) => ir.irsaliyeNo).join(', ');
      addNotification(
        `${sa.saId} → ${irsaliyeAdet} irsaliye üretildi (${nos.length > 80 ? nos.slice(0, 80) + '…' : nos})`
      );
    }
    
    const saForRapor = sa;
    setIrsaliyeModalSa(null);
    setTalepTab('DONUSTURULDU');
    
    const openRapor = window.confirm(
      `${yeniIrsaliyeler.length} adet irsaliye oluşturuldu!\n` +
        `Sipariş: ${sa.saId}\n` +
        `İlk: ${yeniIrsaliyeler[0].irsaliyeNo}\n` +
        (yeniIrsaliyeler.length > 1 ? `Son: ${yeniIrsaliyeler[yeniIrsaliyeler.length - 1].irsaliyeNo}\n` : '') +
        `\nSipariş «Dönüştürüldü» listesine alındı. Dönüşüm zincir raporunu açmak ister misiniz?`
    );
    
    if (openRapor) {
      openEvrakZincirRaporu({
        sa: saForRapor,
        irsaliyeler: [...yeniIrsaliyeler, ...irsaliyeler],
        faturalar,
        focusIrsaliyeIds: yeniIrsaliyeler.map((ir) => ir.id),
      });
    }
  };

  const handleSimulateESignature = (sa: SatinAlmaTalebi) => {
    const selectedEmail = window.prompt(
      "E-İmza ile onaylayacak yetkiliyi giriniz:\n- sametatak9@gmail.com\n- santiye@kibritci.com",
      "sametatak9@gmail.com"
    );

    if (selectedEmail === "sametatak9@gmail.com" || selectedEmail === "santiye@kibritci.com") {
      const name = selectedEmail === "sametatak9@gmail.com" ? "SAMET ATAK" : "ŞANTİYE SORUMLUSU";
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === sa.id) {
          return {
            ...item,
            onayDurumu: 'ONAYLANDI',
            eImzalar: [...(item.eImzalar || []), `${name} (${selectedEmail} - Dijital E-İmza)`]
          };
        }
        return item;
      }));
      alert(`Dijital E-İmza onaylandı! (${name}) Sipariş durumu ONAYLANDI olarak işaretlendi ve kilitlendi.`);
    } else {
      alert("Hata: Geçersiz e-imza yetkilisi seçildi.");
    }
  };

  const handleUploadSignedFile = (e: React.ChangeEvent<HTMLInputElement>, saId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sa = satinAlmaTalepleri.find((s) => s.id === saId);
    if (!sa) return;

    const { proceed, uyumsuz } = confirmSignedUploadWithMismatchCheck(
      file.name,
      sa.saId,
      'Satın Alma'
    );
    if (!proceed) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64);
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === saId) {
          return {
            ...item,
            imzaliEvrakUrl: compressed,
            imzaliEvrakUyumsuz: uyumsuz,
            onayDurumu: 'ONAYLANDI'
          };
        }
        return item;
      }));
      alert(
        uyumsuz
          ? 'İmzalı evrak yüklendi (⚠️ evrak no ile uyumsuz olabilir). Onaylandı olarak işaretlendi.'
          : 'Fiziksel ıslak imzalı evrak sisteme yüklendi! Talep onaylandı.'
      );
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const setTalepDurumu = (saId: string, durum: SatinAlmaTalebi['onayDurumu']) => {
    setSatinAlmaTalepleri((prev) =>
      prev.map((item) => (item.id === saId ? { ...item, onayDurumu: durum } : item))
    );
  };

  const toggleArsiv = (saId: string, arsivde: boolean) => {
    setSatinAlmaTalepleri((prev) =>
      prev.map((item) => (item.id === saId ? { ...item, arsivde } : item))
    );
  };

  const sanitizeOnayDurumu = (durum: unknown): SatinAlmaTalebi['onayDurumu'] => {
    const allowed: SatinAlmaTalebi['onayDurumu'][] = [
      'ONAY BEKLİYOR',
      '1. ONAY TAMAMLANDI',
      '2. ONAY TAMAMLANDI',
      'REDDEDİLDİ',
      'KAPATILDI',
      'ONAYLANDI',
      'BİLİNMİYOR',
    ];
    const text = String(durum || '').trim().toUpperCase();
    return allowed.find((x) => x === text) || 'BİLİNMİYOR';
  };

  const handleExportSatinAlmaExcel = async () => {
    const { exportSatinAlmaListeExcel } = await import('../lib/satinAlmaExcelExport');
    await exportSatinAlmaListeExcel(satinAlmaTalepleri);
  };

  const exportSpecificTaleplerToExcel = async (rows: SatinAlmaTalebi[], fileName: string) => {
    const { exportSatinAlmaTaleplerExcel } = await import('../lib/satinAlmaExcelExport');
    await exportSatinAlmaTaleplerExcel(rows, fileName);
  };

  const handleExportSelectedExcel = async () => {
    const selected = filteredTalepler.filter((x) => selectedSaIds.has(x.id));
    if (selected.length === 0) {
      alert('Lütfen önce raporlanacak kayıtları seçin.');
      return;
    }
    await exportSpecificTaleplerToExcel(
      selected,
      `SatinAlma_Secili_Rapor_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const toIsoDate = (raw: unknown): string => {
    const text = String(raw || '').trim();
    if (!text) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const m = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return new Date().toISOString().slice(0, 10);
  };

  const buildSaIdFromSet = (orderDate: string, usedSaIds: Set<string>) => {
    const dateKey = String(orderDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    let seq = 1;
    let candidate = `SA-${dateKey}-${String(seq).padStart(3, '0')}`;
    while (usedSaIds.has(candidate)) {
      seq += 1;
      candidate = `SA-${dateKey}-${String(seq).padStart(3, '0')}`;
    }
    usedSaIds.add(candidate);
    return candidate;
  };

  const mapParsedLegacyToTalep = (parsed: any, rootParsed: any, usedSaIds: Set<string>): SatinAlmaTalebi => {
    const tarih = toIsoDate(parsed?.tarih);
    const saId = buildSaIdFromSet(tarih, usedSaIds);
    const firma = String(
      parsed?.firma ||
      parsed?.cariUnvan ||
      rootParsed?.firma ||
      rootParsed?.cariUnvan ||
      saSupplier ||
      'Eski Kayıt'
    );
    const kalemlerRaw = Array.isArray(parsed?.kalemler) ? parsed.kalemler : [];
    const detectedType = String(parsed?.detectedType || rootParsed?.detectedType || 'legacy');
    const kalemler: SatinAlmaItem[] =
      kalemlerRaw.length > 0
        ? kalemlerRaw.map((k: any) => ({
            id: `sai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            urunAdi: String(k?.urunAdi || detectedType || 'Malzeme'),
            miktar: Number(k?.miktar || 1),
            birim: String(k?.birim || 'ADET'),
            marka: String(k?.marka || ''),
            kullanilacakYer: String(k?.kullanilacakYer || ''),
            aciklama: String(k?.aciklama || ''),
          }))
        : [
            {
              id: `sai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              urunAdi: String(parsed?.aciklama || rootParsed?.aciklama || 'Toplu Satın Alma Kalemi'),
              miktar: 1,
              birim: 'ADET',
              marka: '',
              kullanilacakYer: '',
              aciklama: String(parsed?.aciklama || rootParsed?.aciklama || ''),
            },
          ];

    const isSigned = Boolean(parsed?.imzaliEvrakUrl || rootParsed?.imzaliEvrakUrl);
    const onayDurumu = parsed?.onayDurumu
      ? sanitizeOnayDurumu(parsed?.onayDurumu)
      : isSigned
      ? 'ONAYLANDI'
      : 'BİLİNMİYOR';
    return {
      id: `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      saId,
      tarih,
      talepEden: currentUser?.email?.split('@')?.[0]?.toUpperCase() || 'SİSTEM AKTARIM',
      cariFirma: firma,
      aciklama: String(parsed?.aciklama || rootParsed?.aciklama || `${detectedType} belgesinden içe aktarıldı.`),
      onayDurumu,
      kalemler,
      eImzalar: [],
      // Legacy belge importları doğrudan arşiv sekmesinde başlar.
      arsivde: true,
    };
  };

  const handleImportLegacyPurchaseDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLegacyImportLoading(true);
      let dataUrl: string;
      if (file.type.startsWith('image/')) {
        const rawData = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => reject(new Error('Dosya okunamadı'));
          r.readAsDataURL(file);
        });
        dataUrl = await compressImage(rawData, 1800, 1800, 0.8);
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => reject(new Error('PDF okunamadı'));
          r.readAsDataURL(file);
        });
      }
      const fileBase64 = dataUrl.split(',')[1];
      const mimeType = file.type || 'application/pdf';
      const resData = await fetchApiJson<{ success: boolean; data?: any; error?: string }>(
        '/api/parse-legacy-document',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64, mimeType, docType: 'auto' }),
        }
      );
      if (!resData.success || !resData.data) {
        throw new Error(resData.error || 'Belge içeriği ayrıştırılamadı.');
      }

      const parsedRoot = resData.data;
      const rawRecords = Array.isArray(parsedRoot?.records) && parsedRoot.records.length > 0
        ? parsedRoot.records
        : [parsedRoot];
      const usedSaIds = new Set<string>(satinAlmaTalepleri.map((x) => x.saId || ''));
      const finalTalepler = rawRecords.map((record: any) => {
        const talep = mapParsedLegacyToTalep(record, parsedRoot, usedSaIds);
        const normalizedKalemler = normalizeCartItemsByKnownStok(talep.kalemler);
        return { ...talep, kalemler: normalizedKalemler };
      });
      setSatinAlmaTalepleri((prev) => [...finalTalepler, ...prev]);
      finalTalepler.forEach((talep) => {
        syncPurchaseToStokCards(talep.kalemler, talep.saId, talep.tarih, talep.cariFirma);
        checkAndSuggestCari(talep.cariFirma);
      });
      if (addNotification) {
        const first = finalTalepler[0];
        const suffix = finalTalepler.length > 1 ? ` ve ${finalTalepler.length - 1} kayıt daha` : '';
        addNotification(
          `${first?.saId || 'SA'} belgeden otomatik içe aktarıldı${suffix} (${parsedRoot?.detectedType || 'auto'}).`
        );
      }
      alert(
        `Belge başarıyla içe aktarıldı.\nAktarılan kayıt: ${finalTalepler.length}\n` +
          `İlk SA ID: ${finalTalepler[0]?.saId || '-'}`
      );
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Belge içe aktarımı başarısız oldu.');
    } finally {
      setLegacyImportLoading(false);
      e.target.value = '';
    }
  };

  const buildSaReportHtml = (sa: SatinAlmaTalebi) => {
    const linked = findIrsaliyelerForSa(sa, irsaliyeler);
    return buildSatinAlmaReportHtml(sa, {
      linkedIrsaliyeler: linked.map((ir) => ({
        irsaliyeNo: ir.irsaliyeNo,
        tarih: ir.tarih,
        kalemOzet: (ir.kalemler || [])
          .map((k) => `${k.urunAdi} ${k.miktar} ${k.birim}`)
          .join(', '),
      })),
    });
  };

  const handlePreviewPdf = (sa: SatinAlmaTalebi) => {
    const htmlContent = buildSaReportHtml(sa);
    openHtmlReportWindow(htmlContent, `Satın Alma ${sa.saId}`);
  };

  const handleEmailTalep = async (sa: SatinAlmaTalebi) => {
    if (emailSendingId) return;
    setEmailSendingId(sa.id);
    const html = buildSaReportHtml(sa);
    const kalemOzet = (sa.kalemler || [])
      .slice(0, 8)
      .map((k) => `• ${k.urunAdi}: ${k.miktar} ${k.birim}`)
      .join('\n');
    const more =
      (sa.kalemler || []).length > 8 ? `\n… +${sa.kalemler.length - 8} kalem daha` : '';

    let downloadUrl = '';
    try {
      const share = await createSatinAlmaPublicShare({
        sa,
        createdBy: currentUser?.email || currentUser?.eposta || '',
      });
      downloadUrl = share.url;
    } catch (err) {
      console.error(err);
      alert(
        'Evrak indirme bağlantısı oluşturulamadı. Yine de e-posta açılacak; HTML dosyasını elle ekleyebilirsiniz.'
      );
    } finally {
      setEmailSendingId(null);
    }

    openReportEmailComposer({
      subject: `Satın Alma Talebi ${sa.saId} — ${sa.cariFirma || 'Kibritçi'}`,
      body: `Satın alma sipariş talebi bilginize sunulmuştur.

Belge No: ${sa.saId}
Tarih: ${sa.tarih}
Firma: ${sa.cariFirma}
Talep Eden: ${sa.talepEden || '-'}
Durum: ${sa.onayDurumu}
Açıklama: ${sa.aciklama || '-'}

Kalemler:
${kalemOzet || '—'}${more}`,
      html,
      fileName: `SatinAlma_${String(sa.saId).replace(/[^\w.\-]+/g, '_')}.html`,
      defaultTo: '',
      downloadUrl: downloadUrl || undefined,
    });
  };

  const tabCounts = useMemo(() => {
    let mevcut = 0;
    let donusturuldu = 0;
    let arsiv = 0;
    for (const sa of satinAlmaTalepleri) {
      if (sa.arsivde) {
        arsiv += 1;
        continue;
      }
      if (findIrsaliyelerForSa(sa, irsaliyeler).length > 0) donusturuldu += 1;
      else mevcut += 1;
    }
    return { mevcut, donusturuldu, arsiv };
  }, [satinAlmaTalepleri, irsaliyeler]);

  const filteredTalepler = useMemo(() => {
    const kw = saSearchKeyword.toLowerCase();
    return satinAlmaTalepleri
      .filter((sa) => {
        const donusturuldu = findIrsaliyelerForSa(sa, irsaliyeler).length > 0;
        let inTab = false;
        if (talepTab === 'MEVCUT') inTab = !sa.arsivde && !donusturuldu;
        else if (talepTab === 'DONUSTURULDU') inTab = !sa.arsivde && donusturuldu;
        else inTab = Boolean(sa.arsivde);
        if (!inTab) return false;
        if (talepTarihFiltre && normalizeDateKey(sa.tarih) !== talepTarihFiltre) return false;
        if (!kw) return true;
        return (
          sa.saId.toLowerCase().includes(kw) ||
          sa.cariFirma.toLowerCase().includes(kw) ||
          sa.talepEden.toLowerCase().includes(kw)
        );
      })
      .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr'));
  }, [satinAlmaTalepleri, talepTab, talepTarihFiltre, saSearchKeyword, irsaliyeler]);

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="sa"
        eyebrow="Satın alma siparişi"
        title="Satın Alma"
        subtitle={`${tabCounts.mevcut} bekleyen · ${tabCounts.donusturuldu} sevk edildi`}
      />

      <div className="flex flex-col gap-5 flex-1 min-h-0">
      <MuhasebeBelgeForm
        variant="siparis"
        editing={Boolean(editingSaId)}
        onClear={() => {
          setEditingSaId(null);
          setSaSupplier('');
          setSaNotes('');
          setCartItems([]);
          setTempItem({ urunAdi: '', miktar: 0, birim: 'ADET', marka: '', kullanilacakYer: '', aciklama: '' });
        }}
        onSave={handleSavePurchaseOrder}
        saveLabel={editingSaId ? 'Siparişi güncelle' : 'Siparişi kaydet'}
        fields={
          <>
            <MuhasebeField label="Tedarikçi *" span={2}>
              <input
                type="text"
                list="sa-cari-list"
                placeholder="Cari firma"
                value={saSupplier}
                onChange={(e) => setSaSupplier(e.target.value)}
                className={muhasebeInputClass}
              />
              <datalist id="sa-cari-list">
                {cariKartlar.map((c) => (
                  <option key={c.id} value={c.unvan} />
                ))}
              </datalist>
            </MuhasebeField>
            <MuhasebeField label="Sipariş tarihi">
              <input type="date" value={saDate} onChange={(e) => setSaDate(e.target.value)} className={muhasebeInputClass} />
            </MuhasebeField>
            <MuhasebeField label="Açıklama">
              <input
                type="text"
                placeholder="Teslimat veya kargo notu"
                value={saNotes}
                onChange={(e) => setSaNotes(e.target.value)}
                className={muhasebeInputClass}
              />
            </MuhasebeField>
          </>
        }
        itemsTable={
          <MuhasebeKalemTablosu variant="siparis" onAdd={handleAddToCart} addDisabled={!tempItem.urunAdi || tempItem.miktar <= 0}>
            {cartItems.map((p) => (
              <MuhasebeKalemRow key={p.id} onRemove={() => setCartItems((prev) => prev.filter((x) => x.id !== p.id))}>
                <td className="px-2 py-1">
                  <input
                    className={muhasebeInputClass}
                    value={p.urunAdi}
                    onChange={(e) =>
                      setCartItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, urunAdi: e.target.value } : x)))
                    }
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    className={muhasebeInputClass}
                    value={p.miktar || ''}
                    onChange={(e) =>
                      setCartItems((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, miktar: Number(e.target.value) || 0 } : x))
                      )
                    }
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    className={muhasebeInputClass}
                    value={p.birim}
                    onChange={(e) =>
                      setCartItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, birim: e.target.value } : x)))
                    }
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    className={muhasebeInputClass}
                    placeholder="Şantiye / blok"
                    value={p.kullanilacakYer || ''}
                    onChange={(e) =>
                      setCartItems((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, kullanilacakYer: e.target.value } : x))
                      )
                    }
                  />
                </td>
              </MuhasebeKalemRow>
            ))}
            <MuhasebeKalemRow>
              <td className="px-2 py-1">
                <input
                  list="sa-stok-list"
                  className={muhasebeInputClass}
                  placeholder="Malzeme adı"
                  value={tempItem.urunAdi}
                  onChange={(e) => setTempItem((prev) => ({ ...prev, urunAdi: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddToCart()}
                />
                <datalist id="sa-stok-list">
                  {stokKartlar.map((s) => (
                    <option key={s.id} value={s.stokAdi} />
                  ))}
                </datalist>
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  className={muhasebeInputClass}
                  placeholder="0"
                  value={tempItem.miktar || ''}
                  onChange={(e) => setTempItem((prev) => ({ ...prev, miktar: Number(e.target.value) }))}
                />
              </td>
              <td className="px-2 py-1">
                <input
                  list="sa-birim-list"
                  className={muhasebeInputClass}
                  value={tempItem.birim}
                  onChange={(e) => setTempItem((prev) => ({ ...prev, birim: e.target.value as any }))}
                />
                <datalist id="sa-birim-list">
                  <option value="ADET" />
                  <option value="TON" />
                  <option value="KG" />
                  <option value="M3" />
                  <option value="TORBA" />
                  <option value="METRE" />
                </datalist>
              </td>
              <td className="px-2 py-1">
                <input
                  className={muhasebeInputClass}
                  placeholder="Kullanım yeri"
                  value={tempItem.kullanilacakYer || ''}
                  onChange={(e) => setTempItem((prev) => ({ ...prev, kullanilacakYer: e.target.value }))}
                />
              </td>
            </MuhasebeKalemRow>
          </MuhasebeKalemTablosu>
        }
      />

      <EvrakArchivePanel
        accent="sa"
        title="Sipariş listesi"
        toolbar={
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={handleExportSatinAlmaExcel} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Excel</button>
            <button type="button" onClick={handleExportSelectedExcel} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900">Seçili Excel</button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTalepTab('MEVCUT')}
              className={`text-[10px] px-2.5 py-1.5 rounded-xl border font-bold transition cursor-pointer ${talepTab === 'MEVCUT' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            >
              Mevcut ({tabCounts.mevcut})
            </button>
            <button
              type="button"
              onClick={() => setTalepTab('DONUSTURULDU')}
              className={`text-[10px] px-2.5 py-1.5 rounded-xl border font-bold transition cursor-pointer ${talepTab === 'DONUSTURULDU' ? 'bg-violet-700 text-white border-violet-800' : 'bg-white text-violet-800 border-violet-200 hover:bg-violet-50'}`}
            >
              Dönüştürüldü ({tabCounts.donusturuldu})
            </button>
            <button
              type="button"
              onClick={() => setTalepTab('ARSIV')}
              className={`text-[10px] px-2.5 py-1.5 rounded-xl border font-bold transition cursor-pointer ${talepTab === 'ARSIV' ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            >
              Arşiv ({tabCounts.arsiv})
            </button>
            <input
              type="date"
              value={talepTarihFiltre}
              onChange={(e) => setTalepTarihFiltre(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50"
              title="Tarihe göre filtrele"
            />
            {talepTarihFiltre && (
              <button
                type="button"
                onClick={() => setTalepTarihFiltre('')}
                className="text-[10px] border border-slate-200 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-xl font-semibold"
              >
                Tüm tarihler
              </button>
            )}
            <div className="flex-1 min-w-[160px]">
              <EvrakArchiveSearch
                value={saSearchKeyword}
                onChange={setSaSearchKeyword}
                placeholder="Kod veya firma ara…"
              />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 max-h-[min(58vh,560px)] pr-0.5">
          {filteredTalepler.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">
              {talepTab === 'DONUSTURULDU'
                ? 'İrsaliyeye dönüştürülmüş sipariş yok.'
                : talepTab === 'ARSIV'
                  ? 'Arşivde kayıt yok.'
                  : 'Dönüştürülmeyi bekleyen sipariş yok.'}
            </p>
          ) : (
            filteredTalepler.map(sa => {
              const isLocked = sa.onayDurumu === 'ONAYLANDI';
              const linkedIrs = findIrsaliyelerForSa(sa, irsaliyeler);
              const donusturuldu = linkedIrs.length > 0;
              return (
                <div key={sa.id} className={`border rounded-2xl p-4 bg-white hover:shadow-md transition-all duration-200 flex flex-col space-y-3.5 text-xs text-slate-700 ${
                  donusturuldu ? 'border-violet-200 hover:border-violet-300' : 'border-slate-150 hover:border-slate-200'
                }`}>
                  <div className="flex justify-between items-start border-b pb-2">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-mono bg-slate-900 text-amber-500 rounded px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          {sa.saId}
                        </span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          sa.onayDurumu === 'ONAYLANDI'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : sa.onayDurumu === 'BİLİNMİYOR'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-amber-50 text-amber-800 border-amber-100'
                        }`}>
                          {sa.onayDurumu === 'ONAYLANDI' ? '✓ ONAYLANDI (KİLİTLİ)' : sa.onayDurumu}
                        </span>
                        {donusturuldu && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase border bg-violet-100 text-violet-800 border-violet-200">
                            Dönüştürüldü · {linkedIrs.length} irsaliye
                          </span>
                        )}
                        {sa.kaynak === 'SIPARIS_FORMU' && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase border bg-sky-50 text-sky-800 border-sky-200">
                            Saha siparişi
                          </span>
                        )}
                      </div>
                      <h5 className="font-bold text-slate-950 mt-1">
                        {sa.cariFirma} · {sa.tarih}
                        {sa.cariKartId ? (
                          <span className="ml-2 text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">
                            Cari bağlı
                          </span>
                        ) : (
                          <span className="ml-2 text-[8px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded">
                            Cari yok
                          </span>
                        )}
                        {countLinkedStok(sa.kalemler).linked > 0 && (
                          <span className="ml-1 text-[8px] font-black uppercase bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded">
                            Stok {countLinkedStok(sa.kalemler).linked}/{sa.kalemler.length}
                          </span>
                        )}
                        {(() => {
                          const z = describeEvrakZinciri(sa, irsaliyeler, faturalar);
                          if (!z.sevk && !z.fatura) return null;
                          return (
                            <span
                              className={`ml-1 text-[8px] font-black uppercase border px-1.5 py-0.5 rounded ${
                                z.tamamlandi
                                  ? 'bg-violet-100 text-violet-800 border-violet-200'
                                  : z.fatura > 0
                                    ? 'bg-sky-50 text-sky-800 border-sky-100'
                                    : 'bg-amber-50 text-amber-800 border-amber-100'
                              }`}
                              title={z.durumMetni}
                            >
                              {z.tamamlandi
                                ? `Faturaya bağlandı · ${z.sevk} sevk`
                                : z.fatura > 0
                                  ? `${z.faturayaBagliSevk}/${z.sevk} faturaya bağlandı`
                                  : `Sevk ${z.sevk} · fatura bekliyor`}
                            </span>
                          );
                        })()}
                      </h5>
                      {donusturuldu && (
                        <p className="text-[10px] text-violet-700 font-semibold">
                          İrsaliye: {linkedIrs.map((ir) => ir.irsaliyeNo).join(', ')}
                        </p>
                      )}
                    </div>

                    {isLocked && (
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-xl font-bold flex items-center gap-1 text-[10px]">
                        <CheckCircle2 size={13} />
                        Kilitli
                      </span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedSaIds.has(sa.id)}
                      onChange={(e) =>
                        setSelectedSaIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(sa.id);
                          else next.delete(sa.id);
                          return next;
                        })
                      }
                    />
                    Rapor için seç
                  </label>

                  <p className="text-[10px] text-slate-500 font-medium">
                    Açıklama: {sa.aciklama || "Yok"}
                  </p>
                  
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150/50 space-y-1 text-[10px] font-semibold text-slate-650">
                    {sa.kalemler.map((item, idx) => {
                      const kalan = kalanMiktarForSaKalem(sa, item, irsaliyeler);
                      const siparis = Number(item.miktar) || 0;
                      return (
                        <p key={idx}>
                          • {item.urunAdi}: {item.miktar} {item.birim}{' '}
                          {item.marka ? `(${item.marka})` : ''}
                          <span className="ml-1 text-violet-700 font-bold">
                            · kalan {kalan}/{siparis}
                          </span>
                        </p>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1.5 text-[10px] items-center">
                    <button
                      type="button"
                      onClick={() => handleConvertSaToIrsaliye(sa)}
                      className="px-3 py-1.5 rounded-lg font-bold cursor-pointer border bg-slate-900 text-white hover:bg-slate-800"
                    >
                      {donusturuldu ? `İrsaliye aç (${linkedIrs.length})` : 'İrsaliyeye çevir'}
                    </button>
                    {!isLocked ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSaId(sa.id);
                          setSaDate(sa.tarih || new Date().toISOString().split('T')[0]);
                          setSaSupplier(sa.cariFirma);
                          setSaNotes(sa.aciklama || '');
                          setCartItems(sa.kalemler);
                        }}
                        className="px-3 py-1.5 rounded-lg font-bold cursor-pointer border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        Düzenle
                      </button>
                    ) : null}
                    <EvrakIslemMenu
                      items={[
                        { label: 'Çoklu irsaliye oluştur', onClick: () => openMultiIrsaliyeModal(sa) },
                        {
                          label: 'Evrak karşılaştır',
                          onClick: () => {
                            const { irsaliyeler: repaired, repairedIds } = ensureIrsaliyeSaBaglari(sa, irsaliyeler);
                            if (repairedIds.length && setIrsaliyeler) setIrsaliyeler(repaired);
                            openEvrakZincirRaporu({ sa, irsaliyeler: repaired, faturalar });
                          },
                        },
                        { label: 'PDF önizle', onClick: () => handlePreviewPdf(sa) },
                        { label: emailSendingId === sa.id ? 'E-posta hazırlanıyor…' : 'E-posta gönder', onClick: () => void handleEmailTalep(sa) },
                        {
                          label: 'Excel indir',
                          onClick: () =>
                            exportSpecificTaleplerToExcel(
                              [sa],
                              `SatinAlma_${String(sa.saId).replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx`
                            ),
                        },
                        { label: 'E-imzaya gönder', hidden: isLocked, onClick: () => handleSimulateESignature(sa) },
                        { label: sa.arsivde ? 'Arşivden çıkar' : 'Arşive gönder', onClick: () => toggleArsiv(sa.id, !sa.arsivde) },
                        { label: 'Onaylandı yap', hidden: isLocked, onClick: () => setTalepDurumu(sa.id, 'ONAYLANDI') },
                        { label: 'Bilinmiyor yap', onClick: () => setTalepDurumu(sa.id, 'BİLİNMİYOR') },
                        {
                          label: 'Sil',
                          hidden: isLocked,
                          danger: true,
                          onClick: () => {
                            if (window.confirm('Bu satın alma talebini silmek istediğinize emin misiniz?')) {
                              setSatinAlmaTalepleri((prev) => prev.filter((x) => x.id !== sa.id));
                            }
                          },
                        },
                      ]}
                    />
                    {!isLocked ? (
                      <label className="cursor-pointer text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                        İmzalı yükle
                        <input type="file" onChange={(e) => handleUploadSignedFile(e, sa.id)} className="hidden" accept="image/*,application/pdf" />
                      </label>
                    ) : (
                      <span className="text-slate-400 font-mono text-[9px]">
                        {sa.eImzalar && sa.eImzalar.length > 0 ? sa.eImzalar.join(', ') : 'İmzalı evrak yüklendi'}
                      </span>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      </EvrakArchivePanel>
      </div>

      {/* ➕ CARİ SUGGEST MODAL */}
      {showCariSuggest && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display font-bold text-xs text-slate-900 uppercase">Cari Firma Önerisi</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Girdiğiniz <strong>"{suggestedCariName}"</strong> firması veritabanında bulunamadı. Bu firmayı yeni bir Cari Kart olarak eklemek ister misiniz?
            </p>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Cari Kart Türü (Etiket):</label>
              <select
                value={suggestedCariType}
                onChange={(e) => setSuggestedCariType(e.target.value as any)}
                className="w-full text-xs p-2 bg-slate-50 border rounded-lg font-bold"
              >
                <option value="TEDARIKCI">Tedarikçi</option>
                <option value="TASERON">Altyüklenici / Taşeron</option>
                <option value="ALICI">Alıcı</option>
                <option value="SATICI">Satıcı</option>
                <option value="PERSONEL">Personel</option>
                <option value="ORTAKLAR">Ortaklar</option>
                <option value="CARI">Diğer Cari</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowCariSuggest(false)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-center text-xs"
              >
                Hayır, Geç
              </button>
              <button 
                onClick={handleCreateCari} 
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-center text-xs"
              >
                Evet, Kart Aç
              </button>
            </div>
          </div>
        </div>
      )}

      {nearStokSuggest && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-black text-sm text-slate-900 uppercase tracking-wide">
                  Benzer Stok Kaydı Bulundu
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Sistemde birbirine çok yakın bir stok ismi tespit edildi.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Girilen Malzeme:</span>
                <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  {nearStokSuggest.originalName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-amber-700 font-semibold">Mevcut Benzer Stok:</span>
                <span className="font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  {nearStokSuggest.nearStok.stokAdi}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Bu malzemeyi mevcut <strong>"{nearStokSuggest.nearStok.stokAdi}"</strong> kaydı ile eşleştirmek mi istersiniz, yoksa eşleştirmeyi reddedip yeni kart açmak veya olduğu gibi devam etmek mi istersiniz?
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleAcceptNearStok}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mevcut Kart ile Eşleştir ('{nearStokSuggest.nearStok.stokAdi}')
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCreateNewStokFromNear}
                  className="bg-slate-900 hover:bg-black text-white font-bold py-2.5 px-3 rounded-xl text-xs text-center transition-colors cursor-pointer"
                >
                  Yeni Kart Oluştur
                </button>

                <button
                  type="button"
                  onClick={handleRejectNearStokAndContinue}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs text-center transition-colors cursor-pointer border border-slate-200"
                >
                  Reddet & Devam Et
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showStokSuggest && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display font-bold text-xs text-slate-900 uppercase">Stok Malzeme Önerisi</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Girdiğiniz <strong>"{suggestedStokName}"</strong> malzemesi veritabanında bulunamadı. Bu malzemeyi yeni bir Stok Kartı olarak envantere eklemek ister misiniz?
            </p>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Stok Türü / Kategori (Etiket):</label>
                <select
                  value={suggestedStokCat}
                  onChange={(e) => setSuggestedStokCat(e.target.value)}
                  className="w-full p-2 bg-slate-50 border rounded-lg font-bold"
                >
                  <option value="Kaba İnşaat İmalatı">Kaba İnşaat İmalatı</option>
                  <option value="Dış Cephe İmalatı">Dış Cephe İmalatı</option>
                  <option value="İnce İşler İmalatı">İnce İşler İmalatı</option>
                  <option value="Elektrik Tesisat Malzemesi">Elektrik Tesisat Malzemesi</option>
                  <option value="Mekanik Tesisat Malzemesi">Mekanik Tesisat Malzemesi</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Ölçü Birimi:</label>
                <input 
                  type="text"
                  value={suggestedStokUnit}
                  onChange={(e) => setSuggestedStokUnit(e.target.value)}
                  className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-center"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowStokSuggest(false)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-center text-xs"
              >
                Hayır, Geç
              </button>
              <button 
                onClick={handleCreateStok} 
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-center text-xs"
              >
                Evet, Kart Aç
              </button>
            </div>
          </div>
        </div>
      )}

      {irsaliyeModalSa && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 border border-slate-200">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              İrsaliye(ler) Oluştur — {irsaliyeModalSa.saId}
            </h3>
            <p className="text-[11px] text-slate-500">
              Her sevk (TIR/araba) için ayrı irsaliye üretilir. Kalan miktar sipariş − önceki
              teslimatlardır.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Kalem</label>
              <select
                value={irsaliyeKalemId}
                onChange={(e) => {
                  setIrsaliyeKalemId(e.target.value);
                  const k = irsaliyeModalSa.kalemler.find((x) => x.id === e.target.value);
                  if (k) {
                    const kalan = kalanMiktarForSaKalem(irsaliyeModalSa, k, irsaliyeler);
                    setIrsaliyeAdet(Math.max(1, Math.min(Math.ceil(kalan) || 1, 50)));
                  }
                }}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                {irsaliyeModalSa.kalemler.map((k) => {
                  const kalan = kalanMiktarForSaKalem(irsaliyeModalSa, k, irsaliyeler);
                  return (
                    <option key={k.id} value={k.id}>
                      {k.urunAdi} · kalan {kalan} {k.birim}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  İrsaliye adedi (N)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={irsaliyeAdet}
                  onChange={(e) => setIrsaliyeAdet(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  Miktar / irsaliye
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={irsaliyeMiktarEach}
                  onChange={(e) =>
                    setIrsaliyeMiktarEach(Math.max(0.01, Number(e.target.value) || 1))
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
            <p className="text-[10px] text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 font-semibold">
              Toplam teslim: {irsaliyeAdet * irsaliyeMiktarEach} · {irsaliyeAdet} ayrı irsaliye
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIrsaliyeModalSa(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCreateMultiIrsaliye}
                className="flex-1 bg-slate-900 hover:bg-black text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer"
              >
                {irsaliyeAdet} İrsaliye Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </EvrakPageShell>
  );
};

export default SatinAlmaScreen;
