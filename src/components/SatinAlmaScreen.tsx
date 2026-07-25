import React, { useRef, useState, useMemo } from 'react';
import { 
  ShoppingCart, Plus, Trash2, Edit3, Eye, Upload, 
  Send, ShieldCheck, Search, Sparkles, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { SatinAlmaTalebi, SatinAlmaItem, CariKart, StokKart, StokKartIslem, Irsaliye } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { confirmSignedUploadWithMismatchCheck } from '../lib/evrakOnayUtils';
import { findNearDuplicateStokName, normalizeCardName } from '../lib/duplicateNameUtils';
import { fetchApiJson } from '../lib/apiClient';
import { normalizeDateKey } from '../lib/dateKeyUtils';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import {
  buildNDeliveryTemplates,
  createIrsaliyelerFromSatinAlma,
  deliveredMiktarForSaKalem,
  kalanMiktarForSaKalem,
} from '../lib/satinAlmaIrsaliyeUtils';

interface SatinAlmaScreenProps {
  satinAlmaTalepleri: SatinAlmaTalebi[];
  setSatinAlmaTalepleri: React.Dispatch<React.SetStateAction<SatinAlmaTalebi[]>>;
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar?: any;
  setFaturalar?: any;
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: React.Dispatch<React.SetStateAction<StokKartIslem[]>>;
  kullanicilar?: any[];
  currentUser?: any;
  addNotification?: (mesaj: string) => void;
}

export const SatinAlmaScreen: React.FC<SatinAlmaScreenProps> = ({
  satinAlmaTalepleri,
  setSatinAlmaTalepleri,
  irsaliyeler = [],
  setIrsaliyeler,
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  setStokIslemGecmisi,
  currentUser,
  addNotification
}) => {
  const [saSupplier, setSaSupplier] = useState("");
  const [saDate, setSaDate] = useState(new Date().toISOString().split('T')[0]);
  const [saNotes, setSaNotes] = useState("");
  const [cartItems, setCartItems] = useState<SatinAlmaItem[]>([]);
  const [editingSaId, setEditingSaId] = useState<string | null>(null);
  const [saAttachmentUrl, setSaAttachmentUrl] = useState<string | null>(null);
  const [saSearchKeyword, setSaSearchKeyword] = useState("");
  const [talepTab, setTalepTab] = useState<'MEVCUT' | 'ARSIV'>('MEVCUT');
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
      if (window.confirm(`'${name}' ismine çok benzer olan '${near.stokAdi}' kaydı bulundu. Bununla eşleştirmek ister misiniz?\n\nİptal'e basarsanız yeni bir kayıt açma ekranına yönlendirileceksiniz.`)) {
        setCartItems(prev => {
          const newCart = [...prev];
          const lastItem = newCart[newCart.length - 1];
          if (lastItem && lastItem.urunAdi === name) {
            lastItem.urunAdi = near.stokAdi;
          }
          return newCart;
        });
        return;
      } else {
        setSuggestedStokName(name);
        setSuggestedStokUnit(unit);
        setShowStokSuggest(true);
        return;
      }
    }
    if (!exact && !near) {
      setSuggestedStokName(name);
      setSuggestedStokUnit(unit);
      setShowStokSuggest(true);
      return;
    }
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
    const near = findNearDuplicateStokName(stokKartlar, suggestedStokName, 1);
    if (exists || near) {
      const existingName = stokKartlar.find(s => s.stokAdi.toLowerCase().trim() === suggestedStokName.toLowerCase().trim())?.stokAdi || near?.stokAdi;
      alert(`Hata: Bu isme çok yakın stok zaten var (${existingName}). Mükerrer kart açılmadı.`);
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
      const match = findExistingStok(item.urunAdi, stokKartlar);
      if (!match) return item;
      return { ...item, urunAdi: match.stokAdi, birim: item.birim || match.birim || 'ADET' };
    });

  const syncPurchaseToStokCards = (items: SatinAlmaItem[], saId: string, tarih: string, supplier: string) => {
    if (!setStokKartlar) return;
    const islemSatirlari: StokKartIslem[] = [];

    setStokKartlar((prev) => {
      let next = [...prev];
      for (const kalem of items) {
        const rawName = String(kalem.urunAdi || '').trim();
        if (!rawName) continue;

        let stok = findExistingStok(rawName, next);
        if (!stok) {
          stok = {
            id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
            stokAdi: rawName,
            kategori: suggestedStokCat || 'Kaba İnşaat İmalatı',
            birim: kalem.birim || suggestedStokUnit || 'ADET',
            kritikSeviye: 5,
            durum: 'AKTIF',
            aciklama: 'Satın alma entegrasyonuyla otomatik oluşturuldu.',
          };
          next = [stok, ...next];
        }

        const historyLine = `${tarih} ${saId} · ${supplier} · ${kalem.miktar} ${kalem.birim || stok.birim}`;
        next = next.map((s) => {
          if (s.id !== stok!.id) return s;
          const oldDesc = String(s.aciklama || '');
          const alreadyLogged = oldDesc.includes(saId);
          const mergedDesc = alreadyLogged
            ? oldDesc
            : `${oldDesc}\n[Satın Alma] ${historyLine}`.trim();
          return {
            ...s,
            stokAdi: stok!.stokAdi,
            birim: s.birim || kalem.birim || 'ADET',
            aciklama: mergedDesc,
          };
        });

        islemSatirlari.push({
          id: `stk_islem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          stokKartId: stok.id,
          islemTipi: 'GIRIS',
          islemId: saId,
          islemBaslik: 'Satın Alma Talebi',
          islemDetay: `${supplier} firmasından satın alma kaydı işlendi.`,
          miktarDegisimi: Number(kalem.miktar || 0),
          tarih,
          belgeNo: saId,
        });
      }
      return next;
    });

    if (setStokIslemGecmisi && islemSatirlari.length > 0) {
      setStokIslemGecmisi((prev) => {
        const existingKeys = new Set(
          prev.map((row) => `${row.stokKartId}|${row.belgeNo}|${row.islemTipi}`)
        );
        const uniqueIncoming = islemSatirlari.filter((row) => {
          const key = `${row.stokKartId}|${row.belgeNo}|${row.islemTipi}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });
        return [...uniqueIncoming, ...prev];
      });
    }
  };

  const handleAddToCart = () => {
    if (!tempItem.urunAdi || tempItem.miktar <= 0) {
      alert("Lütfen ürün adı ve miktarını doldurun.");
      return;
    }
    const existingStok = findExistingStok(tempItem.urunAdi, stokKartlar);
    const newItem: SatinAlmaItem = {
      ...tempItem,
      urunAdi: existingStok?.stokAdi || tempItem.urunAdi.trim(),
      birim: tempItem.birim || existingStok?.birim || 'ADET',
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
    const normalizedCartItems = normalizeCartItemsByKnownStok(cartItems);
    const purchaseSaId = editingSaId
      ? satinAlmaTalepleri.find((s) => s.id === editingSaId)?.saId || buildSaId(cleanDate)
      : buildSaId(cleanDate);

    if (editingSaId) {
      setSatinAlmaTalepleri(prev => prev.map(sa => {
        if (sa.id === editingSaId) {
          return {
            ...sa,
            tarih: cleanDate,
            saId: purchaseSaId,
            cariFirma: saSupplier,
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
        id: `sa_${Date.now()}`,
        saId: purchaseSaId,
        tarih: cleanDate,
        talepEden: '',
        cariFirma: saSupplier,
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
    if (addNotification) {
      addNotification(`${purchaseSaId} satın alma kaydı işlendi. ${normalizedCartItems.length} kalem stok kart geçmişine eklendi.`);
    }

    // reset
    setSaSupplier("");
    setSaDate(new Date().toISOString().split('T')[0]);
    setSaNotes("");
    setCartItems([]);
    setSaAttachmentUrl(null);
    alert("Satın alma talebi kaydedildi.");
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
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();

    const current = satinAlmaTalepleri.filter((t) => !t.arsivde);
    const archive = satinAlmaTalepleri.filter((t) => t.arsivde);

    const buildSheet = (name: string, data: SatinAlmaTalebi[]) => {
      const ws = wb.addWorksheet(name);
      ws.addRow([
        'SA ID',
        'Tarih',
        'Cari Firma',
        'Talep Eden',
        'Durum',
        'Arşiv',
        'Kalem Sayısı',
        'Açıklama',
        'İmzalı Evrak',
      ]);
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      data.forEach((sa) => {
        ws.addRow([
          sa.saId,
          sa.tarih,
          sa.cariFirma,
          sa.talepEden,
          sa.onayDurumu,
          sa.arsivde ? 'EVET' : 'HAYIR',
          sa.kalemler.length,
          sa.aciklama || '',
          sa.imzaliEvrakUrl ? 'VAR' : 'YOK',
        ]);
      });
      ws.columns = [
        { width: 22 },
        { width: 14 },
        { width: 24 },
        { width: 20 },
        { width: 20 },
        { width: 10 },
        { width: 12 },
        { width: 38 },
        { width: 12 },
      ];
    };

    buildSheet('Mevcut Talepler', current);
    buildSheet('Arşiv Talepler', archive);

    const lines = wb.addWorksheet('Kalem Dökümü');
    lines.addRow([
      'SA ID',
      'Tarih',
      'Cari',
      'Ürün',
      'Miktar',
      'Birim',
      'Marka',
      'Kullanım Yeri',
      'Kalem Notu',
      'Durum',
      'Arşiv',
    ]);
    lines.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    lines.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    satinAlmaTalepleri.forEach((sa) => {
      sa.kalemler.forEach((k) => {
        lines.addRow([
          sa.saId,
          sa.tarih,
          sa.cariFirma,
          k.urunAdi,
          k.miktar,
          k.birim,
          k.marka || '',
          k.kullanilacakYer || '',
          k.aciklama || '',
          sa.onayDurumu,
          sa.arsivde ? 'EVET' : 'HAYIR',
        ]);
      });
    });
    lines.columns = [
      { width: 22 },
      { width: 14 },
      { width: 20 },
      { width: 32 },
      { width: 12 },
      { width: 10 },
      { width: 18 },
      { width: 18 },
      { width: 30 },
      { width: 18 },
      { width: 10 },
    ];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SatinAlma_Rapor_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSpecificTaleplerToExcel = async (rows: SatinAlmaTalebi[], fileName: string) => {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    const ws = wb.addWorksheet('Satın Alma Raporu');
    ws.addRow(['SA ID', 'Tarih', 'Cari Firma', 'Talep Eden', 'Durum', 'Arşiv', 'Açıklama']);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    rows.forEach((r) => {
      ws.addRow([
        r.saId,
        r.tarih,
        r.cariFirma,
        r.talepEden,
        r.onayDurumu,
        r.arsivde ? 'EVET' : 'HAYIR',
        r.aciklama || '',
      ]);
      r.kalemler.forEach((k) => {
        ws.addRow(['', '', '↳ Kalem', k.urunAdi, `${k.miktar} ${k.birim}`, k.marka || '', k.kullanilacakYer || '']);
      });
    });
    ws.columns = [
      { width: 22 },
      { width: 14 },
      { width: 24 },
      { width: 20 },
      { width: 20 },
      { width: 10 },
      { width: 34 },
    ];
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
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

  const openIrsaliyeModal = (sa: SatinAlmaTalebi) => {
    const firstKalem = sa.kalemler[0];
    setIrsaliyeModalSa(sa);
    setIrsaliyeKalemId(firstKalem?.id || '');
    const kalan = firstKalem ? kalanMiktarForSaKalem(sa, firstKalem, irsaliyeler) : 1;
    setIrsaliyeAdet(Math.max(1, Math.min(50, Math.ceil(kalan) || 1)));
    setIrsaliyeMiktarEach(1);
  };

  const handleCreateIrsaliyelerFromSa = () => {
    if (!irsaliyeModalSa || !setIrsaliyeler) {
      alert('İrsaliye yazma bağlantısı yok. Sayfayı yenileyip tekrar deneyin.');
      return;
    }
    const kalem = irsaliyeModalSa.kalemler.find((k) => k.id === irsaliyeKalemId);
    if (!kalem) {
      alert('Kalem seçin.');
      return;
    }
    const kalan = kalanMiktarForSaKalem(irsaliyeModalSa, kalem, irsaliyeler);
    const totalWanted = irsaliyeAdet * irsaliyeMiktarEach;
    if (totalWanted <= 0) {
      alert('Adet ve miktar 0 olamaz.');
      return;
    }
    if (totalWanted > kalan + 0.0001) {
      if (
        !confirm(
          `Sipariş kalanı ${kalan} ${kalem.birim}, üreteceğiniz toplam ${totalWanted} ${kalem.birim}. Yine de devam edilsin mi?`
        )
      ) {
        return;
      }
    }
    const deliveries = buildNDeliveryTemplates(
      irsaliyeModalSa,
      kalem.id,
      irsaliyeAdet,
      irsaliyeMiktarEach
    );
    const created = createIrsaliyelerFromSatinAlma(irsaliyeModalSa, deliveries, {
      tarih: new Date().toISOString().split('T')[0],
      firma: irsaliyeModalSa.cariFirma,
    });
    setIrsaliyeler((prev) => [...created, ...prev]);
    addNotification?.(
      `${irsaliyeModalSa.saId}: ${created.length} irsaliye üretildi (${kalem.urunAdi}). Evrak Bağlama / Fatura ile ödeme adımına geçebilirsiniz.`
    );
    alert(`${created.length} irsaliye belgesi oluşturuldu.\nİlk no: ${created[0]?.irsaliyeNo || '—'}`);
    setIrsaliyeModalSa(null);
  };

  const handlePreviewPdf = (sa: SatinAlmaTalebi) => {
    const poExtraCss = `
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:25px}
      .info-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;font-size:11px}
      .info-card h4{margin:0 0 8px;color:#1e3a8a;border-bottom:1px solid #cbd5e1;padding-bottom:4px;font-size:12px}
      .items-table{width:100%;border-collapse:collapse;margin-top:10px}
      .items-table th{background-color:#1e3a8a;color:#fff;padding:10px;text-align:left;font-size:11px}
      .items-table td{border-bottom:1px solid #e2e8f0;padding:10px;font-size:11px}
      .signatures-title{margin-top:30px;font-size:11px;font-weight:bold;color:#1e3a8a;border-bottom:2px dashed #cbd5e1;padding-bottom:5px}
      .signatures-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:15px}
      .sig-col{border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;font-size:10px;min-height:90px}
      .sig-title{font-weight:bold;color:#475569;display:block;margin-bottom:8px}
      .sig-status{font-weight:800;color:#10b981;font-size:8px}
      .e-imza-bar{margin-top:20px;font-size:9px;color:#059669;font-weight:bold;background:#ecfdf5;border:1px solid #a7f3d0;padding:8px;border-radius:8px}
    `;
    const innerBody = `
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">SATIN ALMA SİPARİŞİ / PO FORMU</h2>
          <div class="info-grid">
            <div class="info-card"><h4>📋 SİPARİŞ BİLGİLERİ</h4><p><strong>Belge Tarihi:</strong> ${sa.tarih}</p><p><strong>Onay Durumu:</strong> ${sa.onayDurumu}</p></div>
            <div class="info-card"><h4>🏗️ SİPARİŞ EDEN ŞANTİYE</h4><p><strong>Şantiye Ünvanı:</strong> ${sa.cariFirma}</p><p><strong>Açıklama/Not:</strong> ${sa.aciklama || 'Belirtilmemiş'}</p></div>
          </div>
          <table class="items-table"><thead><tr><th>Malzeme / Ürün Adı</th><th>Sipariş Miktarı</th><th>Marka / Üretici</th><th>Kullanılacak Yer</th></tr></thead><tbody>
              ${sa.kalemler.map(x => `<tr><td>${x.urunAdi}</td><td>${x.miktar} ${x.birim}</td><td>${x.marka || 'Belirtilmemiş'}</td><td>${x.kullanilacakYer || 'Genel Şantiye'}</td></tr>`).join('')}
          </tbody></table>
          <div class="signatures-title">🖋️ ONAY VE İMZA KANALLARI</div>
          <div class="signatures-grid">
            <div class="sig-col"><span class="sig-title">Talep Eden</span><span style="color:#94a3b8;font-style:italic;">İmza Bekleniyor</span></div>
            <div class="sig-col"><span class="sig-title">Muhasebe</span><span style="color:#94a3b8;font-style:italic;">İmza Yetkisi</span></div>
            <div class="sig-col"><span class="sig-title">Satın Alma Md.</span><span style="color:#94a3b8;font-style:italic;">İmza Yetkisi</span></div>
            <div class="sig-col"><span class="sig-title">Şantiye Şefi</span><span class="${sa.onayDurumu === 'ONAYLANDI' ? 'sig-status' : ''}" style="${sa.onayDurumu !== 'ONAYLANDI' ? 'color:#94a3b8' : ''}">${sa.onayDurumu === 'ONAYLANDI' ? '✓ ONAYLANDI' : 'İmza Bekleniyor'}</span></div>
            <div class="sig-col"><span class="sig-title">Proje Müdürü</span><span class="${sa.onayDurumu === 'ONAYLANDI' ? 'sig-status' : ''}" style="${sa.onayDurumu !== 'ONAYLANDI' ? 'color:#94a3b8' : ''}">${sa.onayDurumu === 'ONAYLANDI' ? '✓ ONAYLANDI' : 'İmza Bekleniyor'}</span></div>
          </div>
          ${sa.eImzalar && sa.eImzalar.length > 0 ? `<div class="e-imza-bar">🛡️ DİJİTAL E-İMZA KANIT ZİNCİRİ:<br/>${sa.eImzalar.map(im => `• ${im}`).join('<br/>')}</div>` : ''}
    `;
    const htmlContent = wrapCorporateReportHtml(innerBody, {
      docCode: `BELGE NO: ${sa.saId}`,
      orientation: 'portrait',
      title: `Kibritçi İnşaat - PO: ${sa.saId}`,
      extraCss: poExtraCss,
    });
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) win.print();
  };

  const filteredTalepler = useMemo(() => {
    const kw = saSearchKeyword.toLowerCase();
    return satinAlmaTalepleri
      .filter((sa) => {
        const inTab = talepTab === 'MEVCUT' ? !sa.arsivde : Boolean(sa.arsivde);
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
  }, [satinAlmaTalepleri, talepTab, talepTarihFiltre, saSearchKeyword]);

  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col lg:flex-row font-sans gap-6 select-none bg-slate-50/50">
      
      {/* LEFT FORM PANEL */}
      <div className="w-full lg:w-[420px] lg:h-[680px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
        <div className="bg-slate-900 text-white p-4 shrink-0 flex items-center gap-2">
          <ShoppingCart size={18} className="text-amber-500" />
          <div>
            <h3 className="font-display font-semibold text-sm">🛒 Satın Alma Sipariş Talebi</h3>
            <p className="text-[10px] text-slate-400">Yeni bir malzeme tedarik sipariş talebi oluşturun.</p>
          </div>
        </div>

        <div className="flex-grow p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Belge Tarihi *</label>
            <input
              type="date"
              value={saDate}
              onChange={(e) => setSaDate(e.target.value)}
              className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Tedarikçi Cari Firma *</label>
            <input 
              type="text"
              list="cari-datalist"
              placeholder="Örn: ABC İnşaat Ltd."
              value={saSupplier}
              onChange={(e) => setSaSupplier(e.target.value)}
              className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
            />
            <datalist id="cari-datalist">
              {cariKartlar.map(c => (
                <option key={c.id} value={c.unvan} />
              ))}
            </datalist>
          </div>

          <div className="bg-slate-50 border p-3 rounded-2xl space-y-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">📦 Malzeme / Sipariş Kalemleri</span>
            
            <div className="grid grid-cols-3 gap-2">
              <input 
                type="text"
                list="stok-datalist"
                placeholder="Malzeme Adı"
                value={tempItem.urunAdi}
                onChange={(e) => setTempItem(prev => ({ ...prev, urunAdi: e.target.value }))}
                className="col-span-2 p-1.5 border border-slate-200 bg-white rounded-lg text-[10px]"
              />
              <datalist id="stok-datalist">
                {stokKartlar.map(s => (
                  <option key={s.id} value={s.stokAdi} />
                ))}
              </datalist>
              <input 
                type="number"
                placeholder="Miktar"
                value={tempItem.miktar || ""}
                onChange={(e) => setTempItem(prev => ({ ...prev, miktar: Number(e.target.value) }))}
                className="p-1.5 border border-slate-200 bg-white rounded-lg text-[10px] text-center"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input 
                type="text"
                list="birim-datalist"
                placeholder="Ölçü Birimi (Örn: ADET)"
                value={tempItem.birim}
                onChange={(e) => setTempItem(prev => ({ ...prev, birim: e.target.value as any }))}
                className="p-1.5 border border-slate-200 bg-white rounded-lg text-[10px]"
              />
              <datalist id="birim-datalist">
                <option value="ADET" />
                <option value="TON" />
                <option value="KG" />
                <option value="M3" />
                <option value="TORBA" />
                <option value="METRE" />
                <option value="PAKET" />
              </datalist>
              <input 
                type="text"
                placeholder="Kullanılacak Alan (Opsiyonel)"
                value={tempItem.kullanilacakYer || ""}
                onChange={(e) => setTempItem(prev => ({ ...prev, kullanilacakYer: e.target.value }))}
                className="p-1.5 border border-slate-200 bg-white rounded-lg text-[10px]"
              />
              <button
                type="button"
                onClick={handleAddToCart}
                className="bg-slate-900 text-white font-bold text-[10px] rounded-lg hover:bg-slate-950 transition cursor-pointer"
              >
                Kalem Ekle
              </button>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto pt-2 border-t text-[11px] font-semibold text-slate-700">
              {cartItems.map((p) => (
                <div key={p.id} className="flex justify-between items-center bg-white p-2 rounded-lg border">
                  <span>{p.urunAdi} {p.kullanilacakYer ? <span className="text-[9px] text-slate-400">({p.kullanilacakYer})</span> : null}</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-slate-900">{p.miktar} {p.birim}</span>
                    <button
                      type="button"
                      onClick={() => setCartItems(prev => prev.filter(x => x.id !== p.id))}
                      className="text-rose-600 hover:text-rose-800"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Açıklama / Özel Notlar</label>
            <textarea 
              rows={2}
              placeholder="Sipariş detayları veya kargo notu..."
              value={saNotes}
              onChange={(e) => setSaNotes(e.target.value)}
              className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t bg-slate-50 shrink-0">
          <button
            onClick={handleSavePurchaseOrder}
            className="w-full bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer"
          >
            Satın Alma Talebini Kaydet
          </button>
        </div>
      </div>

      {/* RIGHT LIST PANEL */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-[450px]">
        <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <h4 className="font-display font-bold text-xs text-slate-800 uppercase tracking-widest">
              📋 Satın Alma Talepleri
            </h4>
            <button
              type="button"
              onClick={() => setTalepTab('MEVCUT')}
              className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${talepTab === 'MEVCUT' ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-250'}`}
            >
              Mevcut Talepler
            </button>
            <button
              type="button"
              onClick={() => setTalepTab('ARSIV')}
              className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${talepTab === 'ARSIV' ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-slate-700 border-slate-250'}`}
            >
              Eski Talepler (Arşiv)
            </button>
            <input
              type="date"
              value={talepTarihFiltre}
              onChange={(e) => setTalepTarihFiltre(e.target.value)}
              className="text-xs border border-slate-250 rounded-lg px-2 py-1"
              title="Tarihe göre filtrele"
            />
            {talepTarihFiltre && (
              <button
                type="button"
                onClick={() => setTalepTarihFiltre('')}
                className="text-[10px] border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 rounded-lg font-semibold"
              >
                Tüm Tarihler
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportSatinAlmaExcel}
              className="text-[10px] font-bold px-2.5 py-2 rounded-lg border bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
            >
              Tümünü Excel Raporla
            </button>
            <button
              type="button"
              onClick={handleExportSelectedExcel}
              className="text-[10px] font-bold px-2.5 py-2 rounded-lg border bg-slate-900 text-white border-slate-800 hover:bg-slate-900"
            >
              Seçili Satın Almaları Excel Raporla
            </button>
            <input
              type="text"
              placeholder="Kod veya firma ara..."
              value={saSearchKeyword}
              onChange={(e) => setSaSearchKeyword(e.target.value)}
              className="text-xs border p-2 rounded-xl bg-white w-48 sm:w-64"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {filteredTalepler.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Kayıtlı talep bulunmuyor.</p>
          ) : (
            filteredTalepler.map(sa => {
              const isLocked = sa.onayDurumu === 'ONAYLANDI';
              return (
                <div key={sa.id} className="border border-slate-100 rounded-2xl p-4 bg-white hover:shadow transition flex flex-col space-y-3.5 text-xs text-slate-700">
                  <div className="flex justify-between items-start border-b pb-2">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
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
                      </div>
                      <h5 className="font-bold text-slate-950 mt-1">Şantiye: {sa.cariFirma} · Tarih: {sa.tarih}</h5>
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
                      const teslim = deliveredMiktarForSaKalem(sa, item, irsaliyeler);
                      const kalan = Math.max(0, (Number(item.miktar) || 0) - teslim);
                      return (
                        <p key={idx}>
                          • {item.urunAdi}: {item.miktar} {item.birim}
                          {item.marka ? ` (${item.marka})` : ''}
                          <span className="text-slate-400 font-normal">
                            {' '}
                            · teslim {teslim} · kalan {kalan}
                          </span>
                        </p>
                      );
                    })}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex flex-wrap gap-2 pt-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => openIrsaliyeModal(sa)}
                      className="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                      title="Örn: 20 araba mıcır → 20 irsaliye"
                    >
                      <Plus size={13} />
                      İrsaliye(ler) Oluştur
                    </button>
                    <button
                      onClick={() =>
                        exportSpecificTaleplerToExcel(
                          [sa],
                          `SatinAlma_${String(sa.saId).replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx`
                        )
                      }
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      Excel İndir
                    </button>
                    <button
                      onClick={() => handlePreviewPdf(sa)}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Eye size={13} />
                      PDF Raporu Önizle
                    </button>

                    {!isLocked ? (
                      <>
                        <button
                          onClick={() => handleSimulateESignature(sa)}
                          className="bg-indigo-650 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <ShieldCheck size={13} />
                          E-İmzaya Gönder
                        </button>

                        <label className="cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-250 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1">
                          <Upload size={13} />
                          İmzalı Evrak Yükle
                          <input 
                            type="file" 
                            onChange={(e) => handleUploadSignedFile(e, sa.id)} 
                            className="hidden" 
                            accept="image/*,application/pdf" 
                          />
                        </label>

                        <button
                          onClick={() => {
                            setEditingSaId(sa.id);
                            setSaDate(sa.tarih || new Date().toISOString().split('T')[0]);
                            setSaSupplier(sa.cariFirma);
                            setSaNotes(sa.aciklama || "");
                            setCartItems(sa.kalemler);
                          }}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                        >
                          ✏️ Düzenle
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm("Bu satın alma talebini silmek istediğinize emin misiniz?")) {
                              setSatinAlmaTalepleri(prev => prev.filter(x => x.id !== sa.id));
                              alert("Talep silindi.");
                            }
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-250 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                        >
                          🗑️ Sil
                        </button>
                        {!sa.arsivde ? (
                          <button
                            onClick={() => toggleArsiv(sa.id, true)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                          >
                            Arşive Gönder
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleArsiv(sa.id, false)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                          >
                            Arşivden Çıkar
                          </button>
                        )}
                        <button
                          onClick={() => setTalepDurumu(sa.id, 'ONAYLANDI')}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                        >
                          Durumu ONAYLANDI Yap
                        </button>
                        <button
                          onClick={() => setTalepDurumu(sa.id, 'BİLİNMİYOR')}
                          className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
                        >
                          Durumu BİLİNMİYOR Yap
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5 text-slate-400 font-mono text-[9px]">
                        <span>✍️ İmzalayanlar: {sa.eImzalar && sa.eImzalar.length > 0 ? sa.eImzalar.join(', ') : 'Fiziksel Evrak Yüklendi'}</span>
                        {!sa.arsivde ? (
                          <button
                            onClick={() => toggleArsiv(sa.id, true)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                          >
                            Arşive Gönder
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleArsiv(sa.id, false)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                          >
                            Arşivden Çıkar
                          </button>
                        )}
                        <button
                          onClick={() => setTalepDurumu(sa.id, 'BİLİNMİYOR')}
                          className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                        >
                          BİLİNMİYOR Yap
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* N irsaliye üretim modalı */}
      {irsaliyeModalSa && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-display font-bold text-xs text-slate-900 uppercase">
              İrsaliye(ler) Oluştur — {irsaliyeModalSa.saId}
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Örnek: 20 araba mıcır siparişi → her sevk için ayrı irsaliye (tonajlı). Sonra bir veya birden fazla fatura ile
              ödeme bağlanır. Mevcut bağlı irsaliyeler silinmez.
            </p>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">SA Kalemi</label>
              <select
                value={irsaliyeKalemId}
                onChange={(e) => {
                  setIrsaliyeKalemId(e.target.value);
                  const k = irsaliyeModalSa.kalemler.find((x) => x.id === e.target.value);
                  if (k) {
                    const kalan = kalanMiktarForSaKalem(irsaliyeModalSa, k, irsaliyeler);
                    setIrsaliyeAdet(Math.max(1, Math.min(50, Math.ceil(kalan) || 1)));
                  }
                }}
                className="w-full text-xs p-2.5 bg-slate-50 border rounded-xl font-bold"
              >
                {irsaliyeModalSa.kalemler.map((k) => {
                  const kalan = kalanMiktarForSaKalem(irsaliyeModalSa, k, irsaliyeler);
                  return (
                    <option key={k.id} value={k.id}>
                      {k.urunAdi} — sipariş {k.miktar} {k.birim} · kalan {kalan}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">İrsaliye adedi (N)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={irsaliyeAdet}
                  onChange={(e) => setIrsaliyeAdet(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full text-xs p-2.5 bg-slate-50 border rounded-xl font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Her irsaliyede miktar</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={irsaliyeMiktarEach}
                  onChange={(e) => setIrsaliyeMiktarEach(Math.max(0.01, Number(e.target.value) || 1))}
                  className="w-full text-xs p-2.5 bg-slate-50 border rounded-xl font-mono font-bold"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Toplam teslim: <strong>{(irsaliyeAdet * irsaliyeMiktarEach).toLocaleString('tr-TR')}</strong> · {irsaliyeAdet}{' '}
              ayrı irsaliye belgesi üretilecek.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIrsaliyeModalSa(null)}
                className="flex-1 py-2.5 rounded-xl border text-xs font-bold text-slate-600 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCreateIrsaliyelerFromSa}
                className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-bold cursor-pointer"
              >
                {irsaliyeAdet} İrsaliye Üret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ➕ CARİ SUGGEST MODAL */}
      {showCariSuggest && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display font-bold text-xs text-slate-900 uppercase">🏢 Cari Firma Önerisi</h3>
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
                className="flex-1 bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-center text-xs"
              >
                Evet, Kart Aç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ➕ STOK SUGGEST MODAL */}
      {showStokSuggest && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display font-bold text-xs text-slate-900 uppercase">📦 Stok Malzeme Önerisi</h3>
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
                className="flex-1 bg-slate-900 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-center text-xs"
              >
                Evet, Kart Aç
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SatinAlmaScreen;
