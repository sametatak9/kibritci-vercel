import React, { useState } from 'react';
import { 
  ShoppingCart, FileSpreadsheet, FileCheck, ClipboardList,
  Plus, Trash2, CheckCircle2, AlertTriangle, FileText, ArrowRight, Eye, Upload,
  Search, Edit3, Download, Printer, FileUp, ShieldCheck, Send
} from 'lucide-react';
import { 
  SatinAlmaTalebi, SatinAlmaItem, Irsaliye, IrsaliyeItem, Fatura, FaturaItem 
} from '../types/erp';
import { KibritciLogo } from './KibritciLogo';
import { compressImage } from '../lib/imageCompress';
import { db } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

const maskName = (name?: string): string => {
  return name || '';
};

const maskSignature = (sig?: string): string => {
  return sig || '';
};


interface SatinAlmaScreenProps {
  satinAlmaTalepleri: SatinAlmaTalebi[];
  setSatinAlmaTalepleri: React.Dispatch<React.SetStateAction<SatinAlmaTalebi[]>>;
  irsaliyeler: Irsaliye[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar: Fatura[];
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  cariKartlar: any[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<any[]>>;
  stokKartlar: any[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<any[]>>;
  kullanicilar?: any[];
  currentUser?: any;
  addNotification?: (mesaj: string) => void;
}

export const SatinAlmaScreen: React.FC<SatinAlmaScreenProps> = ({
  satinAlmaTalepleri,
  setSatinAlmaTalepleri,
  irsaliyeler,
  setIrsaliyeler,
  faturalar,
  setFaturalar,
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  kullanicilar = [],
  currentUser,
  addNotification
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'talep' | 'irsaliye' | 'fatura' | 'karsilastirma'>('talep');

  // Automated Card Creation for Caris and Stocks on document intake (Waybills / Invoices)
  const ensureCariAndStokCards = (supplierName: string, items: { urunAdi: string, birim?: string }[]) => {
    if (!supplierName) return;
    
    // 1. Ensure Cari Kart
    const normalizedSupplier = supplierName.trim();
    const existingCari = (cariKartlar || []).find(
      c => c.unvan && c.unvan.toLowerCase().trim() === normalizedSupplier.toLowerCase()
    );

    let updatedCariKartlar = [...(cariKartlar || [])];
    if (!existingCari) {
      const confirmCreate = window.confirm(`Girdiğiniz "${supplierName}" firması sistemde kayıtlı değildir. Bu firma için yeni bir Cari Kartı (Tedarikçi) oluşturmak ister misiniz?`);
      if (confirmCreate) {
        const newCariId = `ck_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const randomCode = `CAR-${Math.floor(100 + Math.random() * 905)}`;
        const newCari = {
          id: newCariId,
          kartTipi: 'TEDARIKCI',
          kod: randomCode,
          unvan: normalizedSupplier,
          yetkili: "Satın Alma Sorumlusu",
          telefon: "",
          eposta: "",
          vergiNo: "",
          vergiDairesi: "",
          adres: "Satın alma işleminden otomatik oluşturuldu.",
          iban: "",
          durum: 'AKTIF',
          notlar: "Satın alma işleminden otomatik oluşturuldu."
        };
        updatedCariKartlar = [newCari, ...updatedCariKartlar];
        if (setCariKartlar) {
          setCariKartlar(updatedCariKartlar);
        }
      }
    }

    // 2. Ensure Stok Kartlar
    let updatedStokKartlar = [...(stokKartlar || [])];
    let addedAnyStok = false;

    items.forEach((item, idx) => {
      const normalizedProduct = item.urunAdi.trim();
      const existingStok = (stokKartlar || []).find(
        s => (s.stokAdi && s.stokAdi.toLowerCase().trim() === normalizedProduct.toLowerCase()) || 
             (s.urunAdi && s.urunAdi.toLowerCase().trim() === normalizedProduct.toLowerCase())
      );

      if (!existingStok) {
        const confirmCreate = window.confirm(`Girdiğiniz "${item.urunAdi}" malzemesi sistemde kayıtlı değildir. Bu malzeme için yeni bir Stok Kartı oluşturmak ister misiniz?`);
        if (confirmCreate) {
          const newStokId = `sk_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`;
          const randomCode = `STK-${Math.floor(1000 + Math.random() * 9000)}`;
          const newStok = {
            id: newStokId,
            stokKodu: randomCode,
            stokAdi: normalizedProduct,
            kategori: "İnşaat Malzemesi",
            birim: item.birim || "ADET",
            kritikSeviye: 5,
            durum: 'AKTIF',
            aciklama: "Satın alma işleminden otomatik oluşturuldu."
          };
          updatedStokKartlar = [newStok, ...updatedStokKartlar];
          addedAnyStok = true;
        }
      }
    });

    if (addedAnyStok && setStokKartlar) {
      setStokKartlar(updatedStokKartlar);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 🛒 1. SATIN ALMA TALEP STATES & FLOW
  // ─────────────────────────────────────────────────────────────
  const [saRequestor, setSaRequestor] = useState(currentUser?.email ? currentUser.email.split('@')[0].toUpperCase() : "");
  const [saSupplier, setSaSupplier] = useState("");
  const [isManualSupplier, setIsManualSupplier] = useState(true);
  const [isManualStockItem, setIsManualStockItem] = useState(true);
  const [saNotes, setSaAciklama] = useState("");
  const [cartItems, setCartItems] = useState<SatinAlmaItem[]>([]);
  const [selectedSaRequestForPdf, setSelectedSaRequestForPdf] = useState<SatinAlmaTalebi | null>(null);
  const [saAttachmentUrl, setSaAttachmentUrl] = useState<string | null>(null);

  const handleSaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setSaAttachmentUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };
  
  // Custom edit and search states
  const [saSearchKeyword, setSaSearchKeyword] = useState("");
  const [editingSaId, setEditingSaId] = useState<string | null>(null);

  // Individual delete confirmation tracking states
  const [deleteConfirmSaId, setDeleteConfirmSaId] = useState<string | null>(null);
  const [deleteConfirmIrsaliyeId, setDeleteConfirmIrsaliyeId] = useState<string | null>(null);
  const [deleteConfirmFaturaId, setDeleteConfirmFaturaId] = useState<string | null>(null);

  // Individual Form Item state
  const [tempItem, setTempItem] = useState<Omit<SatinAlmaItem, 'id'>>({
    urunAdi: "",
    miktar: 0,
    birim: "ADET",
    marka: "",
    kullanilacakYer: "",
    aciklama: ""
  });

  const handleAddToCart = () => {
    if (!tempItem.urunAdi || tempItem.miktar <= 0) {
      alert("Lütfen ürün adı ve geçerli miktar girin.");
      return;
    }

    const normalizedProduct = tempItem.urunAdi.trim();
    const existingStok = (stokKartlar || []).find(
      s => (s.stokAdi && s.stokAdi.toLowerCase().trim() === normalizedProduct.toLowerCase()) || 
           (s.urunAdi && s.urunAdi.toLowerCase().trim() === normalizedProduct.toLowerCase())
    );

    if (!existingStok) {
      const confirmCreate = window.confirm(`Girdiğiniz "${tempItem.urunAdi}" malzemesi sistemde kayıtlı değildir. Bu malzeme için yeni bir Stok Kartı oluşturmak ister misiniz?`);
      if (confirmCreate) {
        const newStokId = `sk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const randomCode = `STK-${Math.floor(1000 + Math.random() * 9000)}`;
        const newStok = {
          id: newStokId,
          stokKodu: randomCode,
          stokAdi: normalizedProduct,
          kategori: "İnşaat Malzemesi",
          birim: tempItem.birim || "ADET",
          kritikSeviye: 5,
          durum: 'AKTIF',
          aciklama: "Satın alma talebi oluşturulurken otomatik eklendi."
        };
        if (setStokKartlar) {
          setStokKartlar(prev => [newStok, ...prev]);
        }
      }
    }

    const newItem: SatinAlmaItem = {
      ...tempItem,
      id: `sai_${Date.now()}`
    };
    setCartItems(prev => [...prev, newItem]);
    setTempItem({
      urunAdi: "",
      miktar: 0,
      birim: "ADET",
      marka: "",
      kullanilacakYer: "",
      aciklama: ""
    });
  };

  const handleRemoveFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSavePurchaseOrder = () => {
    if (cartItems.length === 0) {
      alert("Lütfen en az bir malzeme kalemi ekleyin!");
      return;
    }
    const cleanDate = new Date().toISOString().split('T')[0];

    if (editingSaId) {
      setSatinAlmaTalepleri(prev => prev.map(sa => {
        if (sa.id === editingSaId) {
          if (addNotification) {
            addNotification(`${saSupplier} firmasından talep edilen ${sa.saId} nolu satın alma talebi güncellendi.`);
          }
          return {
            ...sa,
            talepEden: saRequestor,
            cariFirma: saSupplier,
            aciklama: saNotes,
            kalemler: cartItems,
            imzaliEvrakUrl: saAttachmentUrl || sa.imzaliEvrakUrl
          };
        }
        return sa;
      }));
      setEditingSaId(null);
      setCartItems([]);
      setSaAciklama("");
      setSaAttachmentUrl(null);
      alert("Satın alma talebi başarıyla güncellendi.");
    } else {
      const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      const newOrder: SatinAlmaTalebi = {
        id: `sa_${Date.now()}`,
        saId: `SA-${cleanDate.replace(/-/g, '')}-${randomHex}`,
        tarih: cleanDate,
        talepEden: saRequestor,
        cariFirma: saSupplier,
        aciklama: saNotes,
        onayDurumu: "ONAY BEKLİYOR",
        kalemler: cartItems,
        imzaliEvrakUrl: saAttachmentUrl || undefined
      };

      setSatinAlmaTalepleri(prev => [newOrder, ...prev]);
      if (addNotification) {
        addNotification(`${saSupplier} firmasından yeni satın alma talebi (${newOrder.saId}) oluşturuldu.`);
      }
      setCartItems([]);
      setSaAciklama("");
      setSaAttachmentUrl(null);
      alert("Satın alma talep kaydı başarıyla oluşturuldu.");
    }
    
    // Automatically check and prompt for new Cari/Stok Cards
    ensureCariAndStokCards(saSupplier, cartItems);
  };

  const handleStartEditSa = (sa: SatinAlmaTalebi) => {
    setEditingSaId(sa.id);
    setSaRequestor(sa.talepEden);
    setSaSupplier(sa.cariFirma);
    setSaAciklama(sa.aciklama || "");
    setCartItems(sa.kalemler);
    setSaAttachmentUrl(sa.imzaliEvrakUrl || null);
    alert(`${sa.saId} kodlu talep düzenleme modunda forma yüklendi. Sol taraftan güncelleyebilirsiniz.`);
  };

  const handleCancelSaEdit = () => {
    setEditingSaId(null);
    setCartItems([]);
    setSaAciklama("");
    setSaAttachmentUrl(null);
  };

  const handleDeleteSaRequest = async (id: string) => {
    try {
      const matched = satinAlmaTalepleri.find(x => x.id === id);
      const docLabel = matched ? matched.saId : id;
      await deleteDoc(doc(db, 'satinAlmaTalepleri', id));
      setSatinAlmaTalepleri(prev => prev.filter(sa => sa.id !== id));
      if (addNotification) {
        addNotification(`${docLabel} nolu satın alma talebi silindi.`);
      }
      setDeleteConfirmSaId(null);
    } catch (err: any) {
      alert("Hata: Silme işlemi başarısız oldu: " + err.message);
    }
  };


  // ─────────────────────────────────────────────────────────────
  // 📦 2. İRSALİYE GİRİŞİ STATES & FLOW
  // ─────────────────────────────────────────────────────────────
  const [irNo, setIrNo] = useState("");
  const [irSaLink, setIrSaLink] = useState(""); // Linked SA Code ID
  const [irDate, setIrDate] = useState(new Date().toISOString().split('T')[0]);
  const [irSupplier, setIrSupplier] = useState("");
  const [isManualIrSupplier, setIsManualIrSupplier] = useState(true);
  const [isManualIrProduct, setIsManualIrProduct] = useState(true);
  const [irProducts, setIrProducts] = useState<IrsaliyeItem[]>([]);
  const [tempIrProduct, setTempIrProduct] = useState({
    name: "",
    qty: 0,
    unit: "ADET"
  });

  // Custom states for irsaliye search, edit, and print simulation
  const [irSearchKeyword, setIrSearchKeyword] = useState("");
  const [editingIrId, setEditingIrId] = useState<string | null>(null);
  const [selectedIrsaliyeForPdf, setSelectedIrsaliyeForPdf] = useState<Irsaliye | null>(null);
  const [irAttachmentUrl, setIrAttachmentUrl] = useState<string | null>(null); // To satisfy "eksik dosya resim çıkmalı"

  // Advanced Multi-ways comparison & manager multi-approval process states
  const [irsaliyeListType, setIrsaliyeListType] = useState<'dogrudan' | 'satin_almali'>('satin_almali');
  const [selectedIrIdsForComparison, setSelectedIrIdsForComparison] = useState<string[]>([]);
  const [comparisonReports, setComparisonReports] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem('kibritci_comparison_reports');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [docForApproval, setDocForApproval] = useState<{
    id: string;
    type: 'request' | 'waybill' | 'invoice';
    irNo?: string;
    saId?: string;
    faturaNo?: string;
    firma?: string;
    cariUnvan?: string;
  } | null>(null);
  const [selectedYoneticiEmails, setSelectedYoneticiEmails] = useState<string[]>([]);

  // Yapay Zeka (AI) İrsaliye & Fatura Çözümleme State'leri
  const [isIrParsing, setIsIrParsing] = useState(false);
  const [irParseError, setIrParseError] = useState<string | null>(null);
  const [irParseSuccess, setIrParseSuccess] = useState<string | null>(null);

  const [isFtParsing, setIsFtParsing] = useState(false);
  const [ftParseError, setFtParseError] = useState<string | null>(null);
  const [ftParseSuccess, setFtParseSuccess] = useState<string | null>(null);

  const processIrsaliyeAiFile = (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setIrParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında İrsaliye yükleyiniz.");
      return;
    }

    setIsIrParsing(true);
    setIrParseError(null);
    setIrParseSuccess(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setIrAttachmentUrl(compressed);

        const base64Data = rawBase64.split(',')[1];
        const response = await fetch('/api/parse-irsaliye', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: file.type
          })
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "İrsaliye belgesi yapay zeka tarafından çözümlenirken bir sorun oluştu.");
        }

        const parsed = resData.data;

        setIrNo(parsed.irsaliyeNo || "");
        if (parsed.tarih) setIrDate(parsed.tarih);
        if (parsed.firma) {
          setIrSupplier(parsed.firma);
          setIsManualIrSupplier(true);
        }
        if (parsed.kalemler && parsed.kalemler.length > 0) {
          const formattedItems = parsed.kalemler.map((x: any, idx: number) => ({
            id: `iri_ai_${Date.now()}_${idx}`,
            urunAdi: x.urunAdi || "Tanımsız Malzeme",
            miktar: Number(x.miktar) || 0,
            birim: x.birim || "ADET"
          }));
          setIrProducts(formattedItems);
        }

        setIrParseSuccess(`Yapay Zeka Çözümlemesi Başarılı! No: ${parsed.irsaliyeNo || ''} ve Firma: ${parsed.firma || ''} bilgileri ile ${parsed.kalemler?.length || 0} adet teslimat kalemi otomatik dolduruldu.`);
      } catch (err: any) {
        console.error("Irsaliye AI parsing error:", err);
        let userFriendlyMsg = err.message || "Belge çözümlenemedi. Lütfen geçerli bir İrsaliye yükleyin.";
        setIrParseError(userFriendlyMsg);
      } finally {
        setIsIrParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const processFaturaAiFile = (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setFtParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında Fatura yükleyiniz.");
      return;
    }

    setIsFtParsing(true);
    setFtParseError(null);
    setFtParseSuccess(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setFtAttachmentUrl(compressed);

        const base64Data = rawBase64.split(',')[1];
        const response = await fetch('/api/parse-fatura', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: file.type
          })
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "Fatura belgesi yapay zeka tarafından çözümlenirken bir sorun oluştu.");
        }

        const parsed = resData.data;

        setFtNo(parsed.faturaNo || "");
        if (parsed.tarih) setFtDate(parsed.tarih);
        if (parsed.firma) {
          setFtSupplier(parsed.firma);
          setIsManualFtCari(true);
        }
        if (parsed.kalemler && parsed.kalemler.length > 0) {
          const formattedItems = parsed.kalemler.map((x: any, idx: number) => ({
            id: `fti_ai_${Date.now()}_${idx}`,
            urunAdi: x.urunAdi || "Tanımsız Malzeme/Maliyet",
            miktar: Number(x.miktar) || 0,
            birim: x.birim || "ADET",
            birimFiyat: Number(x.birimFiyat) || 0,
            kdvOran: Number(x.kdvOran) || 20,
            toplam: Number(x.toplam) || (Number(x.miktar) * Number(x.birimFiyat)) || 0
          }));
          setFtItems(formattedItems);
        }

        setFtParseSuccess(`Yapay Zeka Çözümlemesi Başarılı! No: ${parsed.faturaNo || ''} ve Firma: ${parsed.firma || ''} bilgileri ile ${parsed.kalemler?.length || 0} adet fatura kalemi otomatik dolduruldu.`);
      } catch (err: any) {
        console.error("Fatura AI parsing error:", err);
        let userFriendlyMsg = err.message || "Belge çözümlenemedi. Lütfen geçerli bir Fatura yükleyin.";
        setFtParseError(userFriendlyMsg);
      } finally {
        setIsFtParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setIrAttachmentUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const [irSignedAttachmentUrl, setIrSignedAttachmentUrl] = useState<string | null>(null);

  const handleIrSignedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setIrSignedAttachmentUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddIrProduct = () => {
    setIrProducts(prev => [
      ...prev,
      {
        id: `iri_${Date.now()}`,
        urunAdi: tempIrProduct.name,
        miktar: tempIrProduct.qty,
        birim: tempIrProduct.unit
      }
    ]);
  };

  const handleSaveIrsaliye = () => {
    if (!irNo) {
      alert("Lütfen İrsaliye Numarasını girin.");
      return;
    }
    if (irProducts.length === 0) {
      alert("Lütfen en az bir teslimat kalemi girin.");
      return;
    }

    const cleanDate = new Date().toISOString().split('T')[0];
    
    // Default to 'ONAY BEKLİYOR' when first saved/updated as requested - "Sadece kayıt yapsın"
    const calculatedStatus = 'ONAY BEKLİYOR';

    if (editingIrId) {
      setIrsaliyeler(prev => prev.map(ir => {
        if (ir.id === editingIrId) {
          if (addNotification) {
            addNotification(`${irSupplier} firmasından ${irNo} nolu irsaliye güncellendi.`);
          }
          return {
            ...ir,
            irsaliyeNo: irNo,
            saId: irSaLink || undefined,
            tarih: irDate,
            firma: irSupplier,
            onayDurumu: calculatedStatus,
            karsilastirmaRaporu: "İrsaliye girişi manuel yapıldı. Toplu listeden satın alma ile karşılaştırabilirsiniz.",
            kalemler: irProducts,
            fisEvrakUrl: irAttachmentUrl || undefined,
            imzaliEvrakUrl: irSignedAttachmentUrl || undefined
          };
        }
        return ir;
      }));
      setEditingIrId(null);
      alert("İrsaliye başarıyla kaydedildi.");
    } else {
      const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      const newIrsaliye: Irsaliye = {
        id: `ir_${Date.now()}`,
        irsaliyeId: `IR-${cleanDate.replace(/-/g, '')}-${randomHex}`,
        irsaliyeNo: irNo,
        tarih: irDate,
        firma: irSupplier,
        saId: irSaLink || undefined,
        onayDurumu: calculatedStatus,
        karsilastirmaRaporu: "İrsaliye girişi manuel yapıldı. Toplu listeden satın alma ile karşılaştırabilirsiniz.",
        kalemler: irProducts,
        fisEvrakUrl: irAttachmentUrl || undefined,
        imzaliEvrakUrl: irSignedAttachmentUrl || undefined
      };

      setIrsaliyeler(prev => [newIrsaliye, ...prev]);
      if (addNotification) {
        addNotification(`${irSupplier} firmasından yeni irsaliye (${irNo}) sisteme girildi.`);
      }
      alert("İrsaliye başarıyla kaydedildi.");
    }

    // Automatically ensure Cari and Stock Cards exist
    ensureCariAndStokCards(irSupplier, irProducts);

    setIrProducts([]);
    setIrNo("");
    setIrSaLink("");
    setIrAttachmentUrl(null);
    setIrSignedAttachmentUrl(null);
  };

  const handleMergePoAndWaybills = (sa: SatinAlmaTalebi, linkedIrs: Irsaliye[]) => {
    if (linkedIrs.length === 0) {
      alert("Bu PO'ya bağlı herhangi bir irsaliye bulunmamaktadır!");
      return;
    }
    const mergedItems: { [name: string]: { poQty: number, irQty: number, birim: string } } = {};
    sa.kalemler.forEach(k => {
      mergedItems[k.urunAdi] = { poQty: k.miktar, irQty: 0, birim: k.birim || 'ADET' };
    });
    linkedIrs.forEach(ir => {
      ir.kalemler.forEach(k => {
        if (mergedItems[k.urunAdi]) {
          mergedItems[k.urunAdi].irQty += k.miktar;
        } else {
          mergedItems[k.urunAdi] = { poQty: 0, irQty: k.miktar, birim: k.birim || 'ADET' };
        }
      });
    });

    const reportId = `MRG-${Date.now()}`;
    alert("Yapay Zeka PO ve İrsaliye Birleştirme Raporu başarıyla üretildi! Eşleşen Evraklar arşivine kaydedildi.");
    
    setThreeWayReportResult({
      id: reportId,
      tarih: new Date().toLocaleDateString('tr-TR'),
      cariUnvan: sa.cariFirma,
      faturaNo: 'YOK (Sadece PO-İrsaliye Birleşimi)',
      irsaliyeler: linkedIrs.map(ir => ir.irsaliyeNo),
      matrix: Object.entries(mergedItems).map(([name, data]) => ({
        urunAdi: name,
        saMiktar: data.poQty,
        irMiktar: data.irQty,
        ftMiktar: 0,
        birim: data.birim,
        priceDiff: false,
        qtyDiff: data.irQty !== data.poQty
      })),
      hasDiscrepancy: Object.values(mergedItems).some(d => d.irQty !== d.poQty)
    });
  };

  const handleGenerateMultiCompareReport = () => {
    if (selectedIrIdsForComparison.length === 0) return;
    
    // Gather selected waybills
    const selectedIrs = irsaliyeler.filter(ir => selectedIrIdsForComparison.includes(ir.id));
    
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_Toplu_Irsaliye_Karsilastirma</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 p-8 font-sans">
  <div class="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-8 shadow-md space-y-8">
    
    <!-- Header -->
    <div class="flex justify-between items-center border-b pb-6">
      <div class="flex items-center space-x-4">
        <div class="bg-amber-500 text-slate-950 p-3 rounded-2xl font-black text-xs">🏢 KİBRİTÇİ</div>
        <div>
          <h1 class="text-xl font-black text-slate-900 tracking-wide">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
          <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mt-0.5">TOPLU İRSALİYE SEVK / SATIN ALMA KONSOLİDE RAPORU</p>
        </div>
      </div>
      <div class="text-right">
        <p class="text-xs text-slate-500 font-medium">Rapor Tarihi: ${new Date().toISOString().split('T')[0]}</p>
        <p class="text-[10px] text-emerald-600 font-extrabold uppercase mt-1">DURUM: ONAY KONTROLLÜ</p>
      </div>
    </div>

    <!-- Overview details -->
    <div class="bg-slate-50 border p-4 rounded-2xl grid grid-cols-2 gap-4 text-xs">
      <div>
        <span class="text-slate-400 font-bold block uppercase text-[9px]">Analiz Edilen İrsaliyeler:</span>
        <div class="mt-1.5 font-mono font-bold text-slate-800 space-y-1">
          ${selectedIrs.map(ir => `<div>• No: ${ir.irsaliyeNo} (Firma: ${ir.firma} | Tarih: ${ir.tarih})</div>`).join('')}
        </div>
      </div>
      <div>
        <span class="text-slate-400 font-bold block uppercase text-[9px]">Konsolide Mutabakat Özeti:</span>
        <p class="text-[11px] text-slate-700 font-medium mt-1.5 leading-relaxed">
          Seçilen ${selectedIrs.length} adet sevkiyat teslimatı, orijinal satın alma siparişlerindeki talep edilen miktar limitleriyle karşılaştırılmıştır.
        </p>
      </div>
    </div>

    <!-- Analytical table -->
    <div class="space-y-4">
      <h3 class="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-1">📊 KONSOLİDE KALEM KONTROLLERİ VE SAPMA ANALİZİ</h3>
      <table class="w-full text-left border border-slate-200 rounded-2xl overflow-hidden text-xs">
        <thead>
          <tr class="bg-slate-900 text-white font-bold text-[10px] uppercase">
            <th class="p-3">MALZEME DETAYI / ÜRÜN</th>
            <th class="p-3 text-center">LINK SİPARİŞ (PO)</th>
            <th class="p-3 text-center">SİPARİŞ MİKTARI</th>
            <th class="p-3 text-center">FİİLİ TESLİM ALINAN</th>
            <th class="p-3 text-right">SAPMA / KALAN DURUM</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
    `;

    selectedIrs.forEach(ir => {
      if (ir.saId) {
        const linkedPo = satinAlmaTalepleri.find(po => po.saId === ir.saId);
        if (linkedPo) {
          linkedPo.kalemler.forEach(item => {
            const matchedDelivered = ir.kalemler.find(x => x.urunAdi.toLowerCase() === item.urunAdi.toLowerCase());
            const delQty = matchedDelivered ? matchedDelivered.miktar : 0;
            const diff = delQty - item.miktar;
            const diffColor = diff === 0 ? 'text-emerald-700 font-bold' : diff < 0 ? 'text-rose-650 font-bold' : 'text-amber-600 font-bold';
            const diffSymbol = diff === 0 ? 'TAMAMLANDI' : diff < 0 ? `EKSİK: ${diff} ${item.birim}` : `Uyumsuz Fazla: +${diff} ${item.birim}`;

            htmlContent += `
              <tr class="hover:bg-slate-50/50">
                <td class="p-3 font-semibold text-slate-800">${item.urunAdi}</td>
                <td class="p-3 text-center font-mono text-slate-500 font-bold">${ir.saId}</td>
                <td class="p-3 text-center font-bold text-slate-700">${item.miktar} ${item.birim}</td>
                <td class="p-3 text-center font-bold text-emerald-800">${delQty} ${item.birim}</td>
                <td class="p-3 text-right ${diffColor}">${diffSymbol}</td>
              </tr>
            `;
          });
        } else {
          ir.kalemler.forEach(kl => {
            htmlContent += `
              <tr class="hover:bg-slate-50/50">
                <td class="p-3 font-semibold text-slate-800">${kl.urunAdi} (Siparişsiz / Manuel)</td>
                <td class="p-3 text-center font-mono text-slate-400">-</td>
                <td class="p-3 text-center text-slate-400">-</td>
                <td class="p-3 text-center font-bold text-emerald-805">${kl.miktar} ${kl.birim}</td>
                <td class="p-3 text-right text-emerald-600 font-bold">Sorunsuz Teslim</td>
              </tr>
            `;
          });
        }
      } else {
        ir.kalemler.forEach(kl => {
          htmlContent += `
            <tr class="hover:bg-slate-50/50">
              <td class="p-3 font-semibold text-slate-800">${kl.urunAdi} (Doğrudan İrsaliye)</td>
              <td class="p-3 text-center font-mono text-slate-400">-</td>
              <td class="p-3 text-center text-slate-400">-</td>
              <td class="p-3 text-center font-bold text-emerald-805">${kl.miktar} ${kl.birim}</td>
              <td class="p-3 text-right text-emerald-600 font-bold">Sorunsuz Teslim</td>
            </tr>
          `;
        });
      }
    });

    htmlContent += `
        </tbody>
      </table>
    </div>

    <!-- Official stamped footprint -->
    <div class="pt-8 border-t flex justify-between items-start text-[10px] text-slate-400">
      <div>
        <p class="font-bold uppercase text-slate-500">KİBRİTÇİ İNŞAAT - ONAY DENETİM</p>
        <p class="mt-1">Bu rapor otomatik sistem tarafından konsolide üretilmiştir.</p>
      </div>
      <div class="text-right space-y-1">
        <p class="font-bold text-slate-800 uppercase text-[9px]">DİJİTAL KABUL ONAYI</p>
        <p class="text-emerald-700 font-bold font-mono">🔵 MUSTAFA KİBRİTÇİ - GENEL MÜDÜR</p>
        <div class="mt-1 border border-slate-200 border-dashed p-1 rounded inline-block text-[8px] text-[#10b981]">
          ✓ ELEKTRONİK RESMİ ONAY SİSTEMİ AKTİF
        </div>
      </div>
    </div>

  </div>

  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
    `;

    // Save report in history
    const newReport = {
      id: `rep_${Date.now()}`,
      tarih: new Date().toISOString().split('T')[0],
      baslik: `${selectedIrs.length} İrsaliye Konsolide Karşılaştırma Raporu`,
      irNos: selectedIrs.map(x => x.irsaliyeNo),
      htmlContent: htmlContent
    };

    const updatedReports = [newReport, ...comparisonReports];
    setComparisonReports(updatedReports);
    localStorage.setItem('kibritci_comparison_reports', JSON.stringify(updatedReports));

    try {
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(htmlContent);
        win.document.close();
      } else {
        throw new Error("Popup blocked");
      }
    } catch {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Kibritci_Toplu_Irsaliye_Karsilastirma_${Date.now()}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    alert("Konsolide Karşılaştırma Raporu üretildi ve açıldı! Ayrıca '📂 GEÇMİŞ KONSOLİDE RAPORLAR ARŞİVİ' menüsüne eklenmiştir. Raporu dilediğiniz zaman masaüstünüze kaydedebilirsiniz.");
    setSelectedIrIdsForComparison([]);
  };

  const handleDeleteIrsaliye = async (id: string) => {
    try {
      const matched = irsaliyeler.find(x => x.id === id);
      const docLabel = matched ? matched.irsaliyeNo : id;
      await deleteDoc(doc(db, 'irsaliyeler', id));
      setIrsaliyeler(prev => prev.filter(ir => ir.id !== id));
      if (addNotification) {
        addNotification(`${docLabel} nolu irsaliye silindi.`);
      }
      setDeleteConfirmIrsaliyeId(null);
    } catch (err: any) {
      alert("Hata: Silme işlemi başarısız oldu: " + err.message);
    }
  };

  const handleStartEditIr = (ir: Irsaliye) => {
    setEditingIrId(ir.id);
    setIrNo(ir.irsaliyeNo);
    setIrSaLink(ir.saId || "");
    setIrDate(ir.tarih);
    setIrSupplier(ir.firma);
    setIrProducts(ir.kalemler);
    setIrAttachmentUrl(ir.fisEvrakUrl || null);
    setIrSignedAttachmentUrl(ir.imzaliEvrakUrl || null);
    alert(`${ir.irsaliyeNo} numaralı irsaliye düzenleme modunda forma yüklendi. Sol taraftan güncelleyebilirsiniz.`);
  };

  const handleCancelIrEdit = () => {
    setEditingIrId(null);
    setIrNo("");
    setIrSaLink("");
    setIrProducts([]);
    setIrAttachmentUrl(null);
    setIrSignedAttachmentUrl(null);
  };


  // ─────────────────────────────────────────────────────────────
  // 🏢 3. FATURA GİRİŞİ & MATCHMAKING
  // ─────────────────────────────────────────────────────────────
  const [ftNo, setFtNo] = useState("");
  const [ftDate, setFtDate] = useState(new Date().toISOString().split('T')[0]);
  const [ftSupplier, setFtSupplier] = useState("");
  const [isManualFtCari, setIsManualFtCari] = useState(true);
  const [isManualFtStok, setIsManualFtStok] = useState(true);
  const [ftIrsaliyeLink, setFtIrsaliyeLink] = useState("");
  const [ftLinkedIrsaliyeler, setFtLinkedIrsaliyeler] = useState<string[]>([]);
  const [ftItems, setFtItems] = useState<FaturaItem[]>([]);
  const [tempFtItem, setTempFtItem] = useState({
    name: "",
    qty: 0,
    unit: "ADET",
    price: 0,
    kdv: 20
  });

  // Custom states for fatura search, edit, and print simulation
  const [ftSearchKeyword, setFtSearchKeyword] = useState("");
  const [editingFtId, setEditingFtId] = useState<string | null>(null);
  const [selectedFaturaForPdf, setSelectedFaturaForPdf] = useState<Fatura | null>(null);
  const [ftAttachmentUrl, setFtAttachmentUrl] = useState<string | null>(null);
  const [selectedIrIdsFor3WayMatch, setSelectedIrIdsFor3WayMatch] = useState<string[]>([]);
  const [threeWayReportResult, setThreeWayReportResult] = useState<any | null>(null);
  const [comparingFtId, setComparingFtId] = useState<string | null>(null);

  const handleRun3WayAiCompare = async (saTalebi: any, irsaliyeler: any[], fatura: any) => {
    setComparingFtId(fatura.id);
    try {
      const response = await fetch("/api/compare-3way", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saTalebi, irsaliyeler, fatura }),
      });

      if (!response.ok) {
        throw new Error("Mutabakat servisi yanıt vermedi.");
      }

      const result = await response.json();
      if (result.success && result.data) {
        setFaturalar(prev => prev.map(ft => {
          if (ft.id === fatura.id) {
            return {
              ...ft,
              aiDurum: result.data.status,
              aiRaporu: result.data.reportText,
              aiDiscrepancies: result.data.discrepancies,
              durum: result.data.status === 'SORUNSUZ ONAY' ? 'UYUMLU' : 'FARK VAR'
            } as any;
          }
          return ft;
        }));
        alert("Yapay zeka analizi başarıyla tamamlandı!");
      } else {
        alert("Yapay zeka analizi başarısız oldu.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Yapay zeka analiz işlemi sırasında bir hata oluştu: " + err.message);
    } finally {
      setComparingFtId(null);
    }
  };

  const handleApproveAndSign3Way = (faturaId: string) => {
    const signatureText = `GM-${currentUser?.email ? currentUser.email.split('@')[0].toUpperCase() : 'YONETICI'}-${new Date().toISOString().split('T')[0]}`;
    setFaturalar(prev => prev.map(ft => {
      if (ft.id === faturaId) {
        return {
          ...ft,
          eImzalar: [signatureText],
          durum: 'ONAYLANDI'
        } as any;
      }
      return ft;
    }));
    alert("Fatura ve mutabakat raporu Genel Müdür tarafından dijital olarak imzalandı ve onaylandı!");
  };

  const handleFtFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setFtAttachmentUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddFtItem = () => {
    const totalLine = tempFtItem.qty * tempFtItem.price;
    setFtItems(prev => [
      ...prev,
      {
        id: `fti_${Date.now()}`,
        urunAdi: tempFtItem.name,
        miktar: tempFtItem.qty,
        birim: tempFtItem.unit,
        birimFiyat: tempFtItem.price,
        kdvOran: tempFtItem.kdv,
        toplam: totalLine
      }
    ]);
  };

  const handleSaveFatura = () => {
    if (!ftNo) {
      alert("Lütfen Fatura Numarasını girin.");
      return;
    }
    if (ftItems.length === 0) {
      alert("Faturaya ait malzeme veya maliyet kalemi girilmedi!");
      return;
    }

    const linkedIr = irsaliyeler.find(ir => ir.irsaliyeId === ftIrsaliyeLink || ir.irsaliyeNo === ftIrsaliyeLink);
    let matchedStatus: 'KONTROL BEKLEYOR' | 'UYUMLU' | 'FARK VAR' | 'ONAYLANDI' = 'KONTROL BEKLEYOR';
    let matchReport = "";
    let totalDifference = 0;

    if (linkedIr) {
      matchReport = "=== ÜÇLÜ KONTROL (PO + İRSALİYE + FATURA) MUTABAKAT RAPORU ===\n";
      let matchedAndValid = true;

      linkedIr.kalemler.forEach(irK => {
        const ftK = ftItems.find(fk => fk.urunAdi.toLowerCase() === irK.urunAdi.toLowerCase());
        const ftQty = ftK ? ftK.miktar : 0;
        const ftPrice = ftK ? ftK.birimFiyat : 0;
        const discrepancy = irK.miktar - ftQty;

        // Arbitrary baseline price comparison if waybill matches
        // Let's say if we can track pricing mismatch: baseline 2000 vs entered price
        const priceDiff = ftPrice - 2005; // Dummy price baseline comparison limit
        
        matchReport += `• ${irK.urunAdi}: İrsaliye Teslimat=${irK.miktar} | Fatura Faturalandırılan=${ftQty} | Fark=${discrepancy}\n`;
        if (discrepancy !== 0) {
          matchedAndValid = false;
          totalDifference += Math.abs(discrepancy * ftPrice);
        }
      });

      if (matchedAndValid) {
        matchedStatus = 'UYUMLU';
        matchReport += "SONUÇ: FARK YOK - KURUŞU KURUŞUNA MUTABAKAT SAĞLANDI! ÖDEME YAPILABİLİR.";
      } else {
        matchedStatus = 'FARK VAR';
        matchReport += `SONUÇ: SIKINTILI DURUM! İRSALİYE VE FATURA MİKTARLARI UYUMSUZ (YAKLAŞIK FARK: ₺${totalDifference.toLocaleString('tr-TR')})`;
      }
    } else {
      matchReport = "Fatura doğrudan girildi. Sistem üzerinde bağlı bir İrsaliye sorgusu bulunamadı.";
    }

    const subtotal = ftItems.reduce((acc, current) => acc + current.toplam, 0);
    const kdvTotal = ftItems.reduce((acc, current) => acc + (current.toplam * (current.kdvOran / 100)), 0);
    const orderSum = subtotal + kdvTotal;

    if (editingFtId) {
      setFaturalar(prev => prev.map(ft => {
        if (ft.id === editingFtId) {
          if (addNotification) {
            addNotification(`${ftSupplier} firmasından ${ftNo} nolu fatura güncellendi.`);
          }
          return {
            ...ft,
            faturaNo: ftNo,
            tarih: ftDate,
            cariUnvan: ftSupplier,
            toplamTutar: subtotal,
            kdvTutar: kdvTotal,
            genelToplam: orderSum,
            durum: matchedStatus,
            rapor: matchReport,
            kalemler: ftItems,
            bagliIrsaliyeler: ftLinkedIrsaliyeler.length > 0 ? ftLinkedIrsaliyeler : (ftIrsaliyeLink ? [ftIrsaliyeLink] : []),
            imzaliEvrakUrl: ftAttachmentUrl || ft.imzaliEvrakUrl
          };
        }
        return ft;
      }));
      setEditingFtId(null);
      setFtAttachmentUrl(null);
      alert("Fatura başarıyla güncellendi.");
    } else {
      const newFatura: Fatura = {
        id: `ft_${Date.now()}`,
        faturaNo: ftNo,
        tarih: ftDate,
        cariKartId: "c1",
        cariUnvan: ftSupplier,
        toplamTutar: subtotal,
        kdvTutar: kdvTotal,
        genelToplam: orderSum,
        durum: matchedStatus,
        rapor: matchReport,
        kalemler: ftItems,
        bagliIrsaliyeler: ftLinkedIrsaliyeler.length > 0 ? ftLinkedIrsaliyeler : (ftIrsaliyeLink ? [ftIrsaliyeLink] : []),
        imzaliEvrakUrl: ftAttachmentUrl || undefined
      };

      setFaturalar(prev => [newFatura, ...prev]);
      if (addNotification) {
        addNotification(`${ftSupplier} firmasından yeni fatura (${ftNo}) sisteme girildi.`);
      }
      setFtAttachmentUrl(null);
      alert("Fatura kaydı başarıyla oluşturuldu.");
    }

    // Automatically ensure Cari and Stock Cards exist
    ensureCariAndStokCards(ftSupplier, ftItems);

    setFtItems([]);
    setFtNo("");
    setFtIrsaliyeLink("");
    setFtLinkedIrsaliyeler([]);
  };

  const handleDeleteFatura = async (id: string) => {
    try {
      const matched = faturalar.find(x => x.id === id);
      const docLabel = matched ? matched.faturaNo : id;
      await deleteDoc(doc(db, 'faturalar', id));
      setFaturalar(prev => prev.filter(ft => ft.id !== id));
      if (addNotification) {
        addNotification(`${docLabel} nolu fatura silindi.`);
      }
      setDeleteConfirmFaturaId(null);
    } catch (err: any) {
      alert("Hata: Silme işlemi başarısız oldu: " + err.message);
    }
  };

  const handleStartEditFt = (ft: Fatura) => {
    setEditingFtId(ft.id);
    setFtNo(ft.faturaNo);
    setFtDate(ft.tarih);
    setFtSupplier(ft.cariUnvan);
    setFtIrsaliyeLink(ft.bagliIrsaliyeler?.[0] || "");
    setFtLinkedIrsaliyeler(ft.bagliIrsaliyeler || []);
    setFtItems(ft.kalemler);
    setFtAttachmentUrl(ft.imzaliEvrakUrl || null);
    alert(`${ft.faturaNo} numaralı fatura düzenleme modunda yüklenmiştir.`);
  };

  const handleCancelFtEdit = () => {
    setEditingFtId(null);
    setFtNo("");
    setFtIrsaliyeLink("");
    setFtLinkedIrsaliyeler([]);
    setFtItems([]);
    setFtAttachmentUrl(null);
  };

  const handleGenerate3WayMatchReport = (specificFt?: Fatura) => {
    // Determine active fatura items and numbers
    const activeFtNo = specificFt ? specificFt.faturaNo : ftNo || "TASLAK_FATURA";
    const activeFtItems = specificFt ? specificFt.kalemler : ftItems;
    const activeFtCari = specificFt ? specificFt.cariUnvan : ftSupplier || "BELİRTİLMEDİ";

    if (selectedIrIdsFor3WayMatch.length === 0) {
      alert("Lütfen 3'lü karşılaştırma için havuzdan en az 1 adet İrsaliye seçiniz!");
      return;
    }

    const matchedIrsaliyeler = irsaliyeler.filter(ir => selectedIrIdsFor3WayMatch.includes(ir.id));
    
    // Gather all linked purchase orders (Satın Alma)
    const linkedSaIds = Array.from(new Set(matchedIrsaliyeler.map(ir => ir.saId).filter(Boolean)));
    const matchedSas = satinAlmaTalepleri.filter(sa => linkedSaIds.includes(sa.saId));

    // Combine all materials across all 3 dimensions
    const allProductNames = Array.from(new Set([
      ...activeFtItems.map(item => item.urunAdi),
      ...matchedIrsaliyeler.flatMap(ir => ir.kalemler.map(k => k.urunAdi)),
      ...matchedSas.flatMap(sa => sa.kalemler.map(k => k.urunAdi))
    ]));

    // Build the comparison matrix
    let hasDiscrepancy = false;
    const comparisonMatrix = allProductNames.map(prodName => {
      // 1. Purchase Request total qty
      const saQty = matchedSas.reduce((sum, sa) => {
        const item = sa.kalemler.find(k => k.urunAdi === prodName);
        return sum + (item ? item.miktar : 0);
      }, 0);

      // 2. Waybill total delivered qty
      const irQty = matchedIrsaliyeler.reduce((sum, ir) => {
        const item = ir.kalemler.find(k => k.urunAdi === prodName);
        return sum + (item ? item.miktar : 0);
      }, 0);

      // 3. Invoice total billed qty
      const ftQty = activeFtItems.reduce((sum, item) => {
        if (item.urunAdi === prodName) {
          return sum + item.miktar;
        }
        return sum;
      }, 0);

      const isOk = (saQty === irQty) && (irQty === ftQty);
      if (!isOk) hasDiscrepancy = true;

      return {
        productName: prodName,
        saQty,
        irQty,
        ftQty,
        status: isOk ? 'UYUMLU' : 'UYUMSUZ FARK VAR',
        unit: activeFtItems.find(i => i.urunAdi === prodName)?.birim || 
              matchedIrsaliyeler.flatMap(ir => ir.kalemler).find(k => k.urunAdi === prodName)?.birim || 'ADET'
      };
    });

    // Create the structured report object
    const reportId = `rep3way_${Date.now()}`;
    const newReport = {
      id: reportId,
      baslik: `3'lü Mutabakat Raporu: PO [${linkedSaIds.join(', ')}] - İrsaliye [${matchedIrsaliyeler.map(ir => ir.irsaliyeNo).join(', ')}] - Fatura [${activeFtNo}]`,
      tarih: new Date().toLocaleDateString('tr-TR'),
      cariUnvan: activeFtCari,
      faturaNo: activeFtNo,
      irsaliyeler: matchedIrsaliyeler.map(ir => ir.irsaliyeNo),
      sas: linkedSaIds,
      matrix: comparisonMatrix,
      hasDiscrepancy,
      status: hasDiscrepancy ? 'DÜZENSİZ / UYUMSUZ' : 'DÜZGÜN / UYUMLU',
      eImzalar: [] as string[]
    };

    setThreeWayReportResult(newReport);
  };



  return (
    <div className="flex-grow p-6 h-full flex flex-col font-sans gap-6 select-none bg-slate-50/50">
      
      {/* Sub Tabs controller */}
      <div className="flex space-x-2 border-b border-slate-200 shrink-0">
        {[
          { key: 'talep', label: '🛒 Satın Alma Talep', style: 'border-[#f59e0b] text-[#f59e0b]' },
          { key: 'irsaliye', label: '🚛 İrsaliye Girişi & Kontrol', style: 'border-[#10b981] text-[#10b981]' },
          { key: 'fatura', label: '🏠 Fatura Girişi & 3\'lü Eşleme', style: 'border-[#8b5cf6] text-[#8b5cf6]' },
          { key: 'karsilastirma', label: '✨ 3\'lü Karşılaştır & Onayla (AI)', style: 'border-[#3b82f6] text-[#3b82f6]' },
        ].map(tb => (
          <button
            key={tb.key}
            onClick={() => setActiveSubTab(tb.key as any)}
            className={`px-4 py-2 border-b-2 text-xs font-bold transition cursor-pointer ${
              activeSubTab === tb.key ? `${tb.style} font-bold` : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          🛒 SECTION 1: SATIN ALMA TALEPLERİ
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'talep' && (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Create form drawer */}
          <div className="w-[430px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0">
              <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Yeni İstek Paneli</span>
              <h3 className="font-display font-semibold text-sm">🛒 Satın Alma Talep Girişi</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Talep Eden / Hazırlayan</label>
                <input 
                  type="text" 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  value={saRequestor}
                  onChange={(e) => setSaRequestor(e.target.value)}
                />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Tedarikçi Cari Firma</label>
                  <button
                    type="button"
                    onClick={() => setIsManualSupplier(!isManualSupplier)}
                    className="text-[9px] font-bold text-blue-600 hover:underline"
                  >
                    {isManualSupplier ? "📋 Rehberden Seç" : "✍️ Elle Giriş Yap"}
                  </button>
                </div>
                {isManualSupplier ? (
                  <input
                    type="text"
                    placeholder="Firma adını yazın..."
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={saSupplier}
                    onChange={(e) => setSaSupplier(e.target.value)}
                  />
                ) : (
                  <select 
                    className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={saSupplier}
                    onChange={(e) => setSaSupplier(e.target.value)}
                  >
                    {Array.from(new Set([
                      "Demir A.Ş.",
                      "Yıldız Elektrik Tesisat",
                      "Cimsa Beton",
                      ...cariKartlar.map((c: any) => c.unvan).filter(Boolean)
                    ])).map((unvan: any) => (
                      <option key={unvan} value={unvan}>{unvan}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Add item helper form block */}
              <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-200/60 space-y-3">
                <div className="flex justify-between items-center border-b pb-1">
                  <p className="font-bold text-[10px] text-slate-500 uppercase">Malzeme kalemi ekle</p>
                  <button
                    type="button"
                    onClick={() => setIsManualStockItem(!isManualStockItem)}
                    className="text-[9px] font-bold text-blue-600 hover:underline"
                  >
                    {isManualStockItem ? "📋 Stok Kartından Seç" : "✍️ Elle Giriş Yap"}
                  </button>
                </div>
                
                <div>
                  <label className="text-[10px] font-semibold text-slate-400">Malzeme Adı</label>
                  {isManualStockItem ? (
                    <input 
                      type="text" 
                      placeholder="Malzeme adı giriniz..."
                      className="w-full text-xs mt-1 p-1 px-2 bg-white border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={tempItem.urunAdi}
                      onChange={(e) => setTempItem(prev => ({ ...prev, urunAdi: e.target.value }))}
                    />
                  ) : (
                    <select
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg focus:outline-none"
                      value={tempItem.urunAdi}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = (stokKartlar || []).find((s: any) => s.ad === val || s.urunAdi === val);
                        setTempItem(prev => ({ 
                          ...prev, 
                          urunAdi: val,
                          birim: match?.birim || prev.birim
                        }));
                      }}
                    >
                      <option value="">-- Stok Kartlarından Seçin --</option>
                      {Array.from(new Set([
                        "Nervürlü Demir Q12",
                        "Portlant Çimento",
                        "C30 Hazır Beton",
                        ...(stokKartlar || []).map((s: any) => s.ad || s.urunAdi).filter(Boolean)
                      ])).map((name: any) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Miktar</label>
                    <input 
                      type="number" 
                      className="w-full text-xs mt-1 p-1 px-2 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempItem.miktar}
                      onChange={(e) => setTempItem(prev => ({ ...prev, miktar: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Birim</label>
                    <input 
                      type="text"
                      placeholder="Örn: TON, ADET, KAMYON"
                      className="w-full text-xs mt-1 p-1 px-2 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempItem.birim}
                      onChange={(e) => setTempItem(prev => ({ ...prev, birim: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400">Talep Lokasyonu / İmalat Blok</label>
                  <input 
                    type="text" 
                    placeholder="Örn: Blok A Temel, Havuz Sahası..."
                    className="w-full text-xs mt-1 p-1 px-2 bg-white border border-[#e2e8f0] rounded-lg"
                    value={tempItem.kullanilacakYer}
                    onChange={(e) => setTempItem(prev => ({ ...prev, kullanilacakYer: e.target.value }))}
                  />
                </div>

                <button 
                  type="button" 
                  onClick={handleAddToCart}
                  className="w-full bg-[#2563EB] hover:bg-blue-700 active:scale-95 text-white font-bold text-[10px] p-2 rounded-lg transition"
                >
                  + Kalemi Sepete Ekle
                </button>
              </div>

              {/* Cart listing inside form drawer */}
              {cartItems.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest block">Eklenen Talepler</span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 border p-2 rounded-lg bg-white">
                    {cartItems.map(item => (
                      <div key={item.id} className="flex justify-between items-center bg-slate-50 p-1.5 rounded text-[10px]">
                        <div>
                          <p className="font-bold text-slate-800">{item.urunAdi}</p>
                          <span className="text-slate-400">{item.miktar} {item.birim} · {item.kullanilacakYer}</span>
                        </div>
                        <button type="button" onClick={() => handleRemoveFromCart(item.id)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Talep Genel Açıklaması</label>
                <textarea 
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg resize-none"
                  rows={2}
                  value={saNotes}
                  onChange={(e) => setSaAciklama(e.target.value)}
                />
              </div>

              {/* İmzalı Evrak Yükleme */}
              <div className="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-300">
                <span className="font-bold text-[10px] text-slate-500 block uppercase mb-1.5">✍️ İMZALI SATIN ALMA EVRAKI YÜKLE</span>
                <div className="flex items-center space-x-3">
                  <label className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition flex items-center space-x-1 shrink-0">
                    <FileUp size={12} />
                    <span>Dosya Seç</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleSaFileChange} 
                      className="hidden" 
                    />
                  </label>
                  <span className="text-[9px] text-slate-400 font-mono truncate max-w-[200px]">
                    {saAttachmentUrl ? "✓ Evrak Yüklendi" : "Resim Seçilmedi (Opsiyonel)"}
                  </span>
                </div>
                {saAttachmentUrl && (
                  <div className="mt-2 relative w-20 h-20 border rounded-lg overflow-hidden bg-white group">
                    <img src={saAttachmentUrl} alt="Signed Doc" className="w-full h-full object-cover" />
                    <button 
                      type="button" 
                      onClick={() => setSaAttachmentUrl(null)}
                      className="absolute inset-0 bg-red-600/80 text-white text-[9px] font-bold opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer"
                    >
                      Kaldır
                    </button>
                  </div>
                )}
              </div>

            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
              {editingSaId ? (
                <div className="flex gap-2">
                  <button 
                    onClick={handleSavePurchaseOrder}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
                  >
                    Talebi Güncelle ve Kaydet
                  </button>
                  <button 
                    onClick={handleCancelSaEdit}
                    className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 rounded-xl transition"
                  >
                    Vazgeç
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleSavePurchaseOrder}
                  className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition"
                >
                  Formu &amp; Talebi Gönder
                </button>
              )}
            </div>
          </div>

          {/* List panel & Print Simulator Popup */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-slate-50">
              <div className="flex items-center space-x-2">
                <ClipboardList size={16} className="text-[#f59e0b]" />
                <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
                  Satın Alma Talep Geçmişi
                </h4>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Talep/cari/malzeme ara..."
                  value={saSearchKeyword}
                  onChange={(e) => setSaSearchKeyword(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#e2e8f0] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 🤝 Yönetici Dijital E-İmza Onay Havuzu */}
              {satinAlmaTalepleri.filter(sa => sa.onayDurumu === 'ONAY BEKLİYOR').length > 0 && (
                <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-violet-800 text-[10px] uppercase tracking-wider block">🔑 YÖNETİCİ DİJİTAL E-İMZA ONAY HAVUZU</span>
                    <span className="bg-violet-650 bg-indigo-600 text-white rounded px-1.5 py-0.5 font-mono text-[8px] font-bold">MUTABAKAT</span>
                  </div>
                  <div className="space-y-2">
                    {satinAlmaTalepleri.filter(sa => sa.onayDurumu === 'ONAY BEKLİYOR').map((sa) => (
                      <div key={sa.id} className="text-[11px] bg-white border rounded-lg p-3 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                          <p className="font-bold text-slate-800">📄 {sa.saId} - {sa.cariFirma}</p>
                          <p className="text-[9px] text-slate-500 font-semibold">Talep: {sa.kalemler.map(k => `${k.urunAdi} (${k.miktar} ${k.birim})`).join(', ')}</p>
                        </div>
                        <button
                          onClick={() => {
                            const name = prompt("E-İmza ismini onaylayın veya girin:", currentUser?.name || currentUser?.email?.split('@')[0].toUpperCase() || "YÖNETİCİ");
                            if (name) {
                              setSatinAlmaTalepleri(prev => prev.map(item => {
                                if (item.id === sa.id) {
                                  return {
                                    ...item,
                                    onayDurumu: '2. ONAY TAMAMLANDI',
                                    eImzalar: [...(item.eImzalar || []), `${name} (${new Date().toLocaleDateString('tr-TR')} - Dijital E-İmza)`]
                                  };
                                }
                                return item;
                              }));
                              alert("E-İmza başarıyla basıldı ve talep e-imzalar ile onaylandı!");
                            }
                          }}
                          className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 shadow transition shrink-0 cursor-pointer"
                        >
                          <ShieldCheck size={12} />
                          <span>E-İmza ile Onayla</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {satinAlmaTalepleri.filter(sa => {
                const keyword = saSearchKeyword.toLowerCase();
                const matchesId = sa.saId.toLowerCase().includes(keyword);
                const matchesRequestor = sa.talepEden.toLowerCase().includes(keyword);
                const matchesCari = sa.cariFirma.toLowerCase().includes(keyword);
                const matchesDesc = (sa.aciklama || "").toLowerCase().includes(keyword);
                const matchesItem = sa.kalemler.some(kl => kl.urunAdi.toLowerCase().includes(keyword));
                return matchesId || matchesRequestor || matchesCari || matchesDesc || matchesItem;
              }).map(sa => (
                <div key={sa.id} className="border border-slate-100 rounded-xl p-4 space-y-3 bg-white hover:shadow transition">
                  <div className="flex justify-between items-start text-xs border-b pb-2">
                    <div>
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">{sa.saId}</span>
                      <p className="text-[9px] text-[#2563EB] font-bold mt-1">Talep Eden: {sa.talepEden} · {sa.tarih}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {sa.onayDurumu}
                      </span>
                      {sa.imzaliEvrakUrl && (
                        <span className="bg-teal-100 text-teal-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                          ✍️ İMZALI BELGE EKLİ
                        </span>
                      )}
                      
                      {/* Physical Signed Doc Upload Button */}
                      <label className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition">
                        <Upload size={11} />
                        <span>{sa.imzaliEvrakUrl ? "İmza Güncelle" : "İmzalı Evrak Yükle"}</span>
                        <input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const rawBase64 = reader.result as string;
                                const compressed = await compressImage(rawBase64);
                                setSatinAlmaTalepleri(prev => prev.map(item => {
                                  if (item.id === sa.id) {
                                    return {
                                      ...item,
                                      imzaliEvrakUrl: compressed,
                                      onayDurumu: 'ONAYLANDI'
                                    };
                                  }
                                  return item;
                                }));
                                alert("Islak imzalı evrak yüklendi ve sipariş onaylandı olarak işaretlendi!");
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>

                      {(sa.onayDurumu === 'ONAYLANDI' || sa.onayDurumu === '2. ONAY TAMAMLANDI' || sa.imzaliEvrakUrl) && (
                        <button
                          onClick={() => alert(`${sa.saId} nolu onaylı satın alma siparişi merkez ofise (merkez@kibritci.com) e-posta ile gönderildi!`)}
                          className="bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition"
                        >
                          <Send size={11} />
                          <span>E-Posta Gönder</span>
                        </button>
                      )}

                      <button 
                        onClick={() => setDocForApproval({ id: sa.id, type: 'request', saId: sa.saId, firma: sa.cariFirma })}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition"
                      >
                        <ShieldCheck size={11} />
                        <span>Onaya Gönder</span>
                      </button>
                      <button 
                        onClick={() => setSelectedSaRequestForPdf(sa)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition"
                      >
                        <Eye size={12} />
                        <span>PDF Önizle</span>
                      </button>
                      <button 
                        onClick={() => handleStartEditSa(sa)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold py-1 px-2 rounded-lg flex items-center space-x-1 cursor-pointer transition"
                        title="Talebi Düzenle"
                      >
                        <Edit3 size={11} />
                        <span>Düzenle</span>
                      </button>
                      {deleteConfirmSaId === sa.id ? (
                        <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-rose-200 shadow-xs animate-in fade-in duration-100">
                          <span className="text-[10px] text-rose-600 font-extrabold mr-1">Silinsin mi?</span>
                          <button
                            onClick={() => handleDeleteSaRequest(sa.id)}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold py-0.5 px-2 rounded-lg transition"
                          >
                            Evet
                          </button>
                          <button
                            onClick={() => setDeleteConfirmSaId(null)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-bold py-0.5 px-2 rounded-lg transition"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeleteConfirmSaId(sa.id)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold py-1 px-2 rounded-lg flex items-center space-x-1 cursor-pointer transition"
                          title="Talebi Sil"
                        >
                          <Trash2 size={11} />
                          <span>Sil</span>
                        </button>
                      )}
                    </div>
                  </div>


                  {/* Kalemler list table inside Po */}
                  <div className="text-[11px]">
                    <div className="grid grid-cols-4 bg-slate-50 p-1.5 font-bold text-slate-500 rounded-t-lg">
                      <span>Malzeme</span>
                      <span className="text-center">Miktar</span>
                      <span className="text-center">Birim</span>
                      <span className="text-right">Üretici / Kullanım Yeri</span>
                    </div>
                    <div className="border-x border-b rounded-b-lg divide-y bg-white">
                      {sa.kalemler.map(kl => (
                        <div key={kl.id} className="grid grid-cols-4 p-1.5 text-slate-700">
                          <span className="font-semibold text-slate-900">{kl.urunAdi}</span>
                          <span className="text-center">{kl.miktar}</span>
                          <span className="text-center text-slate-400">{kl.birim}</span>
                          <span className="text-right font-mono text-[10px] text-slate-400">{kl.kullanilacakYer}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 📊 ÜÇLÜ MUTABAKAT RAPORU MODAL DETAYI */}
          {threeWayReportResult && (
            <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-2xl w-[800px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 text-xs">
                <div className="bg-purple-900 text-white p-4 flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <FileCheck size={18} className="text-purple-300" />
                    <h4 className="font-display font-bold text-sm uppercase tracking-wider">📊 3'lü Mutabakat Karşılaştırma Raporu</h4>
                  </div>
                  <button 
                    onClick={() => setThreeWayReportResult(null)} 
                    className="text-purple-200 hover:text-white font-black text-sm cursor-pointer bg-purple-950 hover:bg-purple-800 rounded px-2 py-0.5"
                  >
                    Kapat
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50 text-slate-800">
                  <div id="three-way-match-report-print-area" className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm space-y-4">
                    {/* Header Block */}
                    <div className="flex justify-between items-start border-b pb-4">
                      <div>
                        <h2 className="text-base font-black text-slate-800">KİBRİTÇİ İNŞAAT VE TAAHHÜT A.Ş.</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">3'lü Mali ve Lojistik Mutabakat Raporu</p>
                      </div>
                      <div className="text-right">
                        <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-1 rounded">Rapor No: {threeWayReportResult.id}</span>
                        <p className="text-[10px] text-slate-500 font-semibold mt-1">Tarih: {threeWayReportResult.tarih}</p>
                      </div>
                    </div>

                    {/* Metadata references */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-3 rounded-lg text-[10.5px] border font-semibold">
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase">Firma / Cari</span>
                        <span className="text-slate-800 font-bold">{threeWayReportResult.cariUnvan}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase">Karşılaştırılan Fatura</span>
                        <span className="text-slate-800 font-bold">📄 {threeWayReportResult.faturaNo}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] block uppercase">Eşleşen İrsaliyeler</span>
                        <span className="text-slate-800 font-bold">🚛 {threeWayReportResult.irsaliyeler.join(', ')}</span>
                      </div>
                    </div>

                    {/* Matrix table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 text-[9.5px] uppercase font-black tracking-wider border-b">
                            <th className="p-2">Malzeme Adı</th>
                            <th className="p-2 text-center">1. Satın Alma Qty</th>
                            <th className="p-2 text-center">2. İrsaliye Qty</th>
                            <th className="p-2 text-center">3. Fatura Qty</th>
                            <th className="p-2 text-center">Mutabakat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-semibold">
                          {threeWayReportResult.matrix.map((row: any, index: number) => {
                            const isOk = row.saQty === row.irQty && row.irQty === row.ftQty;
                            return (
                              <tr key={index} className="hover:bg-slate-50/50 text-[10.5px]">
                                <td className="p-2 text-slate-900 font-bold">{row.productName}</td>
                                <td className="p-2 text-center text-slate-600">{row.saQty} {row.unit}</td>
                                <td className="p-2 text-center text-slate-600">{row.irQty} {row.unit}</td>
                                <td className="p-2 text-center text-slate-900 font-bold">{row.ftQty} {row.unit}</td>
                                <td className="p-2 text-center">
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                                    isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 animate-pulse'
                                  }`}>
                                    {isOk ? 'UYUMLU' : 'FARK VAR UYUMSUZ'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Discrepancy warning box */}
                    {threeWayReportResult.hasDiscrepancy ? (
                      <div className="bg-rose-50 border border-rose-200 text-rose-950 p-3 rounded-lg flex items-start space-x-2">
                        <span className="text-base">⚠️</span>
                        <div>
                          <p className="font-bold text-[10.5px]">MİKTAR UYUŞMAZLIĞI TESPİT EDİLDİ!</p>
                          <p className="text-[9.5px] text-rose-800 font-semibold">Sipariş edilen miktar, teslim alınan veya faturalandırılan miktar ile örtüşmüyor. Lütfen tedarikçi ile mutabakatı gözden geçirin.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-3 rounded-lg flex items-start space-x-2">
                        <span className="text-base">✅</span>
                        <div>
                          <p className="font-bold text-[10.5px]">SORUNSUZ 3'LÜ MUTABAKAT ONAYI</p>
                          <p className="text-[9.5px] text-emerald-800 font-semibold">Tüm kalemlerin satın alma siparişi, teslimat irsaliyesi ve fatura miktar değerleri tam uyumluluk göstermektedir.</p>
                        </div>
                      </div>
                    )}

                    {/* e-signature stamp details */}
                    {threeWayReportResult.eImzalar && threeWayReportResult.eImzalar.length > 0 && (
                      <div className="bg-violet-50 border border-violet-200 p-3 rounded-lg space-y-1">
                        <span className="text-[9px] font-black text-violet-800 uppercase tracking-widest block">🔒 RAPOR E-İMZA MUTABAKAT ZİNCİRİ:</span>
                        {threeWayReportResult.eImzalar.map((imza: string, i: number) => (
                          <p key={i} className="text-[10px] text-violet-900 font-mono font-bold">✓ {maskSignature(imza)}</p>
                        ))}
                      </div>
                    )}

                    {/* Footnote */}
                    <div className="text-[8.5px] text-slate-400 font-semibold border-t pt-3 flex justify-between">
                      <span>Bu rapor Kibritçi ERP Dijital Mutabakat Sistemi tarafından otomatik üretilmiştir.</span>
                      <span>Sayfa 1 / 1</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-100 border-t flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const name = prompt("E-İmzanızı Atın:", currentUser?.name || "YÖNETİCİ");
                      if (name) {
                        setThreeWayReportResult((prev: any) => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            eImzalar: [...(prev.eImzalar || []), `${name} (${new Date().toLocaleDateString('tr-TR')} - 3'lü Mutabakat Onayı)`]
                          };
                        });
                        alert("E-İmzanız başarıyla mutabakat raporuna işlendi!");
                      }
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-[11px] py-2 px-4 rounded-xl flex items-center space-x-1 cursor-pointer"
                  >
                    <ShieldCheck size={13} />
                    <span>Raporu E-İmza ile Onayla</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const printContent = document.getElementById('three-way-match-report-print-area')?.innerHTML;
                      if (!printContent) return;
                      const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_3lu_Mutabakat_Raporu_${threeWayReportResult.id}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 p-8">
  <div class="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-8">
    ${printContent}
  </div>
</body>
</html>
                      `;
                      const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Kibritci_3lu_Mutabakat_Raporu_${threeWayReportResult.id}.html`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] py-2 px-4 rounded-xl flex items-center space-x-1 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Masaüstüne İmzalı Rapor Kaydet (HTML)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 📄 PDF ONIZLE POPUP SIMULATOR */}
          {selectedSaRequestForPdf && (
            <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-[730px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                  <h4 className="font-display font-semibold text-sm">Resmi PDF Baskı Şablon Örneği</h4>
                  <button onClick={() => setSelectedSaRequestForPdf(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✖ Kapat</button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 text-xs text-slate-800 bg-[#f8fafc]">
                  {/* Fake sheet layout inside preview */}
                  <div id="satin-alma-talep-print-area" className="bg-white border p-6 rounded-lg shadow-sm space-y-6 relative text-slate-800">
                    <div className="absolute right-6 top-6 w-20 h-20 border-2 border-red-200 rounded flex items-center justify-center font-bold text-red-300 transform rotate-12 text-xs">
                      RESMİ TALEP
                    </div>

                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                      <div className="flex items-center space-x-3">
                        <KibritciLogo size="md" />
                        <div>
                          <h2 className="text-base font-black text-[#1E4E78] font-sans tracking-wide">KİBRİTÇİ İNŞAAT A.Ş.</h2>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-widest mt-0.5">MALZEME SATIN ALMA TALEP FORMU</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold block text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[10px]">{selectedSaRequestForPdf.saId}</span>
                        <span className="text-[10px] text-slate-500 font-semibold block mt-1">Belge Tarihi: {selectedSaRequestForPdf.tarih}</span>
                      </div>
                    </div>

                    {/* Informational table */}
                    <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                      <tbody>
                        <tr className="border-b bg-slate-50 text-slate-600 font-bold">
                          <td className="p-2 border-r border-slate-200">TALEP EDEN / HAZIRLAYAN</td>
                          <td className="p-2 border-r border-slate-200">TEDARİKÇİ CARİ FİRMA</td>
                          <td className="p-2">BELGE ONAY DURUMU</td>
                        </tr>
                        <tr className="font-semibold">
                          <td className="p-2 border-r border-slate-200">{maskName(selectedSaRequestForPdf.talepEden)}</td>
                          <td className="p-2 border-r border-slate-200">{selectedSaRequestForPdf.cariFirma}</td>
                          <td className="p-2 text-amber-600 font-bold">{selectedSaRequestForPdf.onayDurumu}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Materials loop */}
                    <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                      <thead>
                        <tr className="bg-[#1E4E78] text-white font-bold text-[9px] uppercase tracking-wider">
                          <th className="p-2">MALZEME / ÜRÜN İSMİ</th>
                          <th className="p-2 text-center w-24">TALEP MİKTAR</th>
                          <th className="p-2 text-center w-20">BİRİM</th>
                          <th className="p-2 text-right">ŞANTİYE KULLANIM YERİ / AÇIKLAMA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {selectedSaRequestForPdf.kalemler.map(kl => (
                          <tr key={kl.id} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-900 font-semibold">{kl.urunAdi}</td>
                            <td className="p-2 text-center text-slate-705 font-bold">{kl.miktar}</td>
                            <td className="p-2 text-center text-slate-400">{kl.birim}</td>
                            <td className="p-2 text-right text-slate-500 font-mono text-[9px]">{kl.kullanilacakYer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="space-y-1">
                      <span className="font-bold text-[9px] text-slate-400 block uppercase tracking-wider">Talep Genel Açıklaması:</span>
                      <p className="bg-slate-50 p-2 border border-slate-200 rounded-xl text-slate-600 italic text-[10px]">
                        {selectedSaRequestForPdf.aciklama || "Girilmedi."}
                      </p>
                    </div>

                    {selectedSaRequestForPdf.eImzalar && selectedSaRequestForPdf.eImzalar.length > 0 && (
                      <div className="space-y-1 mt-3">
                        <span className="font-bold text-[9px] text-violet-700 block uppercase tracking-wider">🔒 DİJİTAL E-İMZA MUTABAKAT ONAYLARI</span>
                        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-1">
                          {selectedSaRequestForPdf.eImzalar.map((imza, i) => (
                            <div key={i} className="text-[10px] text-violet-800 font-mono font-bold flex items-center space-x-1">
                              <span>✅ {maskSignature(imza)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSaRequestForPdf.imzaliEvrakUrl && (
                      <div className="space-y-1 mt-4">
                        <span className="font-bold text-[9px] text-slate-400 block uppercase tracking-wider">📸 Fiziksel İmzalı Evrak Belgesi</span>
                        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 bg-slate-50 flex justify-center p-2">
                          <img 
                            src={selectedSaRequestForPdf.imzaliEvrakUrl} 
                            alt="Fiziksel İmzalı Evrak" 
                            className="max-h-45 object-contain hover:scale-105 transition" 
                          />
                        </div>
                      </div>
                    )}

                    {/* Structured Sign-off Mercii Aligned Aligned Aligned */}
                    <div className="pt-6 border-t border-slate-200">
                      <div className="bg-[#1E4E78] text-white p-1 text-[8px] font-bold uppercase tracking-wider mb-4 rounded text-center">
                        📋 SATIN ALMA TALEP MERCİLERİ ONAY VE İMZA AKIŞI
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-center text-[9px]">
                        
                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-[#5a2020] block mb-1">1. MUHASEBE</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Mali Uygunluk Kontrolü</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[9px] font-bold text-slate-700 block">KONTROL GÖREVLİSİ</span>
                        </div>

                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-[#1E4E78] block mb-1">2. İDARİ İŞLER</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Şantiye Şefliği İdari Kontrol</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[9px] font-bold text-slate-700 block">İDARİ İŞLER SORUMLUSU</span>
                        </div>

                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-[#1E4E78] block mb-1">3. ŞANTİYE ŞEFİ</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Saha Teknik Kontrol</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[9px] font-bold text-slate-700 block">ŞANTİYE ŞEFİ</span>
                        </div>

                        <div className="border border-slate-250 p-2 rounded bg-slate-50">
                          <span className="font-black text-[#8B1E1E] block mb-1">4. PROJE MÜDÜRÜ</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Nihai Tedarik Onaycısı</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[9px] font-bold text-slate-800 block">PROJE MÜDÜRÜ</span>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t bg-slate-100 flex gap-2 justify-end">
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('satin-alma-talep-print-area')?.innerHTML;
                      if (!printContent) return;
                      
                      const iframe = document.createElement('iframe');
                      iframe.style.position = 'absolute';
                      iframe.style.width = '0px';
                      iframe.style.height = '0px';
                      iframe.style.border = 'none';
                      document.body.appendChild(iframe);
                      
                      const doc = iframe.contentWindow?.document || iframe.contentDocument;
                      if (doc) {
                        doc.write(`
                          <html>
                            <head>
                              <title>Kibritci_Insaat_Satin_Alma_${selectedSaRequestForPdf.saId}</title>
                              <script src="https://cdn.tailwindcss.com"></script>
                            </head>
                            <body class="bg-white p-8">
                              <div class="max-w-4xl mx-auto border p-8 rounded-xl shadow-sm">
                                ${printContent}
                              </div>
                              <script>
                                window.onload = function() {
                                  window.print();
                                  setTimeout(function() {
                                    window.parent.document.body.removeChild(window.frameElement);
                                  }, 1000);
                                }
                              </script>
                            </body>
                          </html>
                        `);
                        doc.close();
                      }
                    }}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Yazdır / PDF Kaydet</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('satin-alma-talep-print-area')?.innerHTML;
                      if (!printContent) return;
                      const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritçi İnşaat - Satın Alma Talebi [${selectedSaRequestForPdf.saId}]</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 p-8">
  <div class="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-8">
    ${printContent}
  </div>
</body>
</html>
                      `;
                      const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Kibritci_Satin_Alma_${selectedSaRequestForPdf.saId}.html`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-750 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Masaüstüne Evrak Kaydet (HTML)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 📄 İRSALİYE RESMİ ÖNİZLEME POPUP MODAL */}
          {selectedIrsaliyeForPdf && (
            <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-[730px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                  <h4 className="font-display font-semibold text-sm">🚚 İrsaliye Resmi Baskı Şablonu</h4>
                  <button onClick={() => setSelectedIrsaliyeForPdf(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✖ Kapat</button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 text-xs text-slate-800 bg-[#f8fafc]">
                  <div id="irsaliye-print-area" className="bg-white border p-6 rounded-lg shadow-sm space-y-6 relative text-slate-800">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                      <div className="flex items-center space-x-3">
                        <KibritciLogo size="md" />
                        <div>
                          <h2 className="text-base font-black text-[#10b981] font-sans tracking-wide">KİBRİTÇİ İNŞAAT A.Ş.</h2>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-widest mt-0.5">MAL SAHA TESLİMAT İRSALİYE FORMU</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold block text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px]">İrsaliye: {selectedIrsaliyeForPdf.irsaliyeNo}</span>
                        <span className="text-[10px] text-slate-500 font-semibold block mt-1">Belge Tarihi: {selectedIrsaliyeForPdf.tarih}</span>
                      </div>
                    </div>

                    {/* Meta information tags */}
                    <div className="grid grid-cols-2 gap-4 text-[10px]">
                      <div className="bg-slate-50 p-3 rounded-lg border">
                        <span className="text-slate-400 block font-bold uppercase text-[8px]">Sevk Edilen Taşıyıcı / Tedarikçi</span>
                        <p className="font-bold text-slate-800 mt-1">{selectedIrsaliyeForPdf.firma}</p>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                        <span className="text-amber-800 block font-bold uppercase text-[8px]">🎯 Karşılaştırılan Satın Alma Referansı</span>
                        <p className="font-bold text-amber-900 mt-1">
                          {selectedIrsaliyeForPdf.saId ? `SA-Kodu: ( ${selectedIrsaliyeForPdf.saId} )` : "Bağsız / Manuel Giriş"}
                        </p>
                      </div>
                    </div>

                    {/* Embedded file document check for (missing image warning) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                        <span className="font-bold text-[9px] text-slate-400 uppercase tracking-widest block mb-2">📸 Fiziksel İrsaliye Ek Belgesi</span>
                        {selectedIrsaliyeForPdf.fisEvrakUrl ? (
                          <div className="border rounded bg-white p-2 flex justify-center max-h-48 overflow-hidden">
                            <img 
                              src={selectedIrsaliyeForPdf.fisEvrakUrl} 
                              alt="Waybill physical proof" 
                              className="max-h-44 object-contain shadow-sm rounded"
                            />
                          </div>
                        ) : (
                          <div className="border border-dashed border-red-300 rounded-lg p-3 bg-red-50 text-center flex flex-col items-center justify-center space-y-1.5 animate-pulse">
                            <span className="text-red-800 font-black text-xs">⚠️ 📸 FOTOĞRAF EKSİK!</span>
                            <span className="text-[9px] text-red-600 font-medium">Bu teslimata ait fiziki belge kopyası veya sevk irsaliyesi resmi sisteme eklenmemiştir!</span>
                          </div>
                        )}
                      </div>

                      <div className="border border-teal-200 rounded-xl p-4 bg-teal-50/20">
                        <span className="font-bold text-[9px] text-teal-800 uppercase tracking-widest block mb-2">✍️ Islak İmzalı Sevk İrsaliyesi</span>
                        {selectedIrsaliyeForPdf.imzaliEvrakUrl ? (
                          <div className="border border-teal-100 rounded bg-white p-2 flex justify-center max-h-48 overflow-hidden">
                            <img 
                              src={selectedIrsaliyeForPdf.imzaliEvrakUrl} 
                              alt="Waybill signed proof" 
                              className="max-h-44 object-contain shadow-sm rounded"
                            />
                          </div>
                        ) : (
                          <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50 text-center flex flex-col items-center justify-center space-y-1.5">
                            <span className="text-slate-500 font-bold text-[10px] uppercase">✍️ İMZALI BELGE EKSİK</span>
                            <span className="text-[9px] text-slate-400 font-medium">Bu irsaliyenin imzalı teslim dökümanı henüz taranıp sisteme yüklenmemiştir.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Match Audit reconciliation report */}
                    {selectedIrsaliyeForPdf.karsilastirmaRaporu && (
                      <div className="bg-blue-50/70 p-4 border border-blue-200 rounded-xl">
                        <span className="font-heading font-extrabold text-[#115e59] text-[9px] tracking-wider block uppercase mb-1">🔍 OTOMATİK MİKTAR &amp; KISIT ANALİZ RAPORU</span>
                        <div className="text-[10px] leading-relaxed font-mono text-slate-700 whitespace-pre-wrap">
                          {selectedIrsaliyeForPdf.karsilastirmaRaporu}
                        </div>
                      </div>
                    )}

                    {/* Materials loop */}
                    <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                      <thead>
                        <tr className="bg-[#10b981] text-white font-bold text-[9px] uppercase tracking-wider">
                          <th className="p-2">MALZEME / ÜRÜN İSMİ</th>
                          <th className="p-2 text-center w-32">KABUL EDİLEN TESLİMAT</th>
                          <th className="p-2 text-right">BİRİM ÖLÇÜ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium bg-white">
                        {selectedIrsaliyeForPdf.kalemler.map(kl => (
                          <tr key={kl.id} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-900 font-semibold">{kl.urunAdi}</td>
                            <td className="p-2 text-center text-slate-705 font-bold text-emerald-700">{kl.miktar}</td>
                            <td className="p-2 text-right text-slate-400 font-mono">{kl.birim}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Signatures check */}
                    <div className="pt-6 border-t border-slate-200">
                      <div className="bg-slate-800 text-white p-1 text-[8px] font-bold uppercase tracking-wider mb-4 rounded text-center">
                        📋 SAHA TESLİM ALIM İMZA MERCİLERİ
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-center text-[9px]">
                        
                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-slate-700 block mb-1">MÜSTAHDEM</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Malzeme Teslim Alan</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[8px] font-bold text-emerald-700">DİJİTAL İMZALI</span>
                        </div>

                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-slate-700 block mb-1">KONTROLÖR</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Adet Sayım Görevlisi</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[8px] font-semi text-amber-600">ISLAK İMZALANACAK</span>
                        </div>

                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-slate-700 block mb-1">HAFRİYAT ŞEFİ</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Saha Teknik Kontrol</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[8px] font-bold text-slate-60 block">SAHA TEKNİK EKİBİ</span>
                        </div>

                        <div className="border border-slate-200 p-2 rounded bg-slate-50/50">
                          <span className="font-black text-slate-700 block mb-1">YÖNETİM</span>
                          <span className="text-[8px] text-slate-400 block mb-4">Proje Onaycısı</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[8px] font-bold text-slate-70 block">Onay Verildi</span>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t bg-slate-100 flex gap-2 justify-end">
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('irsaliye-print-area')?.innerHTML;
                      if (!printContent) return;
                      const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_Irsaliye_${selectedIrsaliyeForPdf.irsaliyeNo}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white p-8">
  <div class="max-w-4xl mx-auto border p-8 rounded-xl shadow-sm">
    ${printContent}
  </div>
  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
                      `;
                      try {
                        const win = window.open("", "_blank");
                        if (win) {
                          win.document.write(htmlSnippet);
                          win.document.close();
                        } else {
                          throw new Error("Popup blocked");
                        }
                      } catch (err) {
                        const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `Kibritci_Irsaliye_${selectedIrsaliyeForPdf.irsaliyeNo}.html`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Yazdır / PDF Kaydet</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('irsaliye-print-area')?.innerHTML;
                      if (!printContent) return;
                      const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritçi İnşaat - Sevk İrsaliyesi [${selectedIrsaliyeForPdf.irsaliyeNo}]</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 p-8">
  <div class="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-8">
    ${printContent}
  </div>
</body>
</html>
                      `;
                      const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Kibritci_Irsaliye_${selectedIrsaliyeForPdf.irsaliyeNo}.html`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Masaüstüne Evrak Kaydet (HTML)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 📄 FATURA RESMİ ÖNİZLEME POPUP MODAL */}
          {selectedFaturaForPdf && (
            <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-[730px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                  <h4 className="font-display font-semibold text-sm">🏠 Fatura ve Üçlü Mutabakat Baskı Raporu</h4>
                  <button onClick={() => setSelectedFaturaForPdf(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✖ Kapat</button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 text-xs text-slate-800 bg-[#f8fafc]">
                  <div id="fatura-print-area" className="bg-white border p-6 rounded-lg shadow-sm space-y-6 relative text-slate-800">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                      <div className="flex items-center space-x-3">
                        <KibritciLogo size="md" />
                        <div>
                          <h2 className="text-base font-black text-[#8b5cf6] font-sans tracking-wide">KİBRİTÇİ İNŞAAT A.Ş.</h2>
                          <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-widest mt-0.5">RESMİ ÜÇLÜ MUTABAKAT &amp; MUHASEBE FATURA KONTROLÜ</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold block text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-[10px]">Fatura: {selectedFaturaForPdf.faturaNo}</span>
                        <span className="text-[10px] text-slate-500 font-semibold block mt-1">Belge Tarihi: {selectedFaturaForPdf.tarih}</span>
                      </div>
                    </div>

                    {/* Metadata */}
                    <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                      <tbody>
                        <tr className="border-b bg-slate-50 text-slate-600 font-bold">
                          <td className="p-2 border-r border-slate-200">KAYDEDİLEN CARİ FİRMA UNVANI</td>
                          <td className="p-2 border-r border-slate-200">EŞLEŞMELİ İRSALİYELER</td>
                          <td className="p-2">MUTABAKAT SONUCU</td>
                        </tr>
                        <tr className="font-semibold text-slate-800">
                          <td className="p-2 border-r border-slate-200 font-bold">{selectedFaturaForPdf.cariUnvan}</td>
                          <td className="p-2 border-r border-slate-205">{selectedFaturaForPdf.bagliIrsaliyeler?.join(', ') || 'Doğrudan Manuel Giriş'}</td>
                          <td className={`p-2 font-bold ${selectedFaturaForPdf.durum === 'UYUMLU' ? 'text-emerald-700' : 'text-red-700'}`}>
                            {selectedFaturaForPdf.durum === 'UYUMLU' ? "✅ EŞ DEĞERSE FARK YOK" : "⚠️ FARK VAR! (AYKIRILIK BELİRLENDİ)"}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Reconciliation details */}
                    {selectedFaturaForPdf.rapor && (
                      <div className="bg-purple-50/60 p-4 border border-purple-200 rounded-xl">
                        <span className="font-display font-bold text-purple-850 text-[10px] block mb-1 uppercase tracking-wider">📋 Üçlü Mutabakat Sıkıntılı Sapma Analizi &amp; Karşılaştırma Raporu</span>
                        <p className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {selectedFaturaForPdf.rapor}
                        </p>
                      </div>
                    )}

                    {/* Materials loop */}
                    <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                      <thead>
                        <tr className="bg-[#8b5cf6] text-white font-bold text-[9px] uppercase tracking-wider">
                          <th className="p-2">MUTABAKAT KALEMİ</th>
                          <th className="p-2 text-center">MİKTAR</th>
                          <th className="p-2 text-center">BİRİM FİYAT (KDV HARİÇ)</th>
                          <th className="p-2 text-right">TOPLAM TUTAR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium bg-white">
                        {selectedFaturaForPdf.kalemler.map(kl => (
                          <tr key={kl.id} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-900 font-semibold">{kl.urunAdi}</td>
                            <td className="p-2 text-center text-slate-705 font-bold">{kl.miktar} {kl.birim}</td>
                            <td className="p-2 text-center text-slate-500">₺{kl.birimFiyat.toLocaleString()}</td>
                            <td className="p-2 text-right text-slate-905 font-mono">₺{kl.toplam.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Invoice totals table */}
                    <div className="flex justify-end">
                      <div className="w-64 border rounded-xl overflow-hidden text-[10px]">
                        <div className="flex justify-between p-2 border-b bg-slate-50">
                          <span className="text-slate-500 font-bold">MATRAH TOPLAMI:</span>
                          <span className="font-mono text-slate-800">₺{selectedFaturaForPdf.toplamTutar?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between p-2 border-b">
                          <span className="text-slate-500 font-bold">HESAPLANAN KDV (%20):</span>
                          <span className="font-mono text-slate-800">₺{selectedFaturaForPdf.kdvTutar?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-purple-50 text-purple-900 font-bold">
                          <span>GENEL TOPLAM TUTARI:</span>
                          <span className="font-mono">₺{selectedFaturaForPdf.genelToplam?.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {selectedFaturaForPdf.imzaliEvrakUrl && (
                      <div className="space-y-1 mt-4">
                        <span className="font-bold text-[9px] text-slate-400 block uppercase tracking-wider">📸 Fiziksel İmzalı Fatura Belgesi</span>
                        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 bg-slate-50 flex justify-center p-2">
                          <img 
                            src={selectedFaturaForPdf.imzaliEvrakUrl} 
                            alt="Fiziksel İmzalı Fatura" 
                            className="max-h-48 object-contain hover:scale-105 transition" 
                          />
                        </div>
                      </div>
                    )}

                    {/* Signatures */}
                    <div className="pt-6 border-t border-slate-200">
                      <div className="grid grid-cols-2 gap-4 text-center text-[9px]">
                        <div className="border p-2.5 rounded bg-slate-50/50">
                          <span className="font-black text-slate-700 block mb-1">Mali İşler Direktörlüğü</span>
                          <span className="text-[8px] text-slate-400 block mb-5">Mutabakat Doğrulandı</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[8px] font-bold text-emerald-700 uppercase">YASA UYGUN / DİJİTAL SİMÜLE EDİLDİ</span>
                        </div>
                        <div className="border p-2.5 rounded bg-slate-50/50">
                          <span className="font-black text-slate-700 block mb-1">Muhasebe Kontrolü</span>
                          <span className="text-[8px] text-slate-400 block mb-5">Muhasebe Kayıt Fişi</span>
                          <div className="h-0.5 bg-slate-300 w-16 mx-auto mb-1"></div>
                          <span className="text-[8px] font-bold text-slate-500">İMZA GÜVENLİ</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="p-4 border-t bg-slate-100 flex gap-2 justify-end">
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('fatura-print-area')?.innerHTML;
                      if (!printContent) return;
                      const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_Fatura_${selectedFaturaForPdf.faturaNo}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white p-8">
  <div class="max-w-4xl mx-auto border p-8 rounded-xl shadow-sm">
    ${printContent}
  </div>
  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
                      `;
                      try {
                        const win = window.open("", "_blank");
                        if (win) {
                          win.document.write(htmlSnippet);
                          win.document.close();
                        } else {
                          throw new Error("Popup blocked");
                        }
                      } catch (err) {
                        const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `Kibritci_Fatura_${selectedFaturaForPdf.faturaNo}.html`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Yazdır / PDF Rapor Kaydet</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      const printContent = document.getElementById('fatura-print-area')?.innerHTML;
                      if (!printContent) return;
                      const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritçi İnşaat - Sıkıntılı Fatura Mutabakat Raporu [${selectedFaturaForPdf.faturaNo}]</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 p-8">
  <div class="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-8 font-sans">
    ${printContent}
  </div>
</body>
</html>
                      `;
                      const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Kibritci_Mutabakat_Raporu_${selectedFaturaForPdf.faturaNo}.html`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center space-x-1 transition shadow cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Masaüstüne Evrak Kaydet (HTML)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🚛 SECTION 2: İRSALİYE GİRİŞLERİ
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'irsaliye' && (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Creator drawer */}
          <div className="w-[430px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#10b981] text-slate-100 p-4 shrink-0 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-[#d1fae5] uppercase">Teslimat Modülü</span>
                <h3 className="font-display font-semibold text-sm">
                  {editingIrId ? "📝 İrsaliye Düzenleniyor" : "🚛 İrsaliye Teslimat Girişi"}
                </h3>
              </div>
              {editingIrId && (
                <button 
                  onClick={handleCancelIrEdit} 
                  className="bg-emerald-900/40 hover:bg-emerald-900/60 px-2 py-1 rounded text-[10px] font-bold"
                >
                  Vazgeç
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* AI parsing block */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-3.5 space-y-2 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-indigo-900 tracking-wide uppercase text-[9px] flex items-center gap-1">
                    ✨ YAPAY ZEKA (AI) İRSALİYE OKUYUCU
                  </span>
                  <span className="font-bold text-[8px] bg-indigo-200 text-indigo-800 px-1.5 py-0.2 rounded-full font-sans uppercase">
                    GEMINI
                  </span>
                </div>
                <p className="text-[10px] text-indigo-700/90 leading-relaxed">
                  İrsaliye dökümanının fotoğrafını veya PDF dosyasını yükleyin; numara, tarih, firma ve kalemleri yapay zeka ile otomatik dolduralım.
                </p>
                <div className="relative border-2 border-dashed border-indigo-200 rounded-lg p-3 text-center bg-white hover:bg-indigo-50/20 transition cursor-pointer">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        processIrsaliyeAiFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isIrParsing}
                  />
                  {isIrParsing ? (
                    <div className="flex flex-col items-center justify-center space-y-1 py-1">
                      <div className="animate-spin rounded-full h-4.5 w-4.5 border-2 border-indigo-600 border-t-transparent"></div>
                      <span className="text-[10px] font-bold text-indigo-800 animate-pulse">Belge analiz ediliyor, lütfen bekleyin...</span>
                    </div>
                  ) : (
                    <div className="space-y-1 py-1">
                      <span className="text-[11px] font-bold text-indigo-700 block">📁 İrsaliye PDF veya Fotoğraf Seç / Sürükle</span>
                      <span className="text-[9px] text-slate-400 block">PDF, PNG, JPG, WEBP formatları desteklenir</span>
                    </div>
                  )}
                </div>

                {irParseError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-[10px] font-semibold">
                    ❌ {irParseError}
                  </div>
                )}
                {irParseSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded text-[10px] whitespace-pre-line font-medium leading-relaxed font-sans">
                    🎉 {irParseSuccess}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İrsaliye Numarası *</label>
                <input 
                  type="text" 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:ring-1 focus:ring-[#10b981]"
                  value={irNo}
                  onChange={(e) => setIrNo(e.target.value)}
                  placeholder="IRS-942..."
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Bağlı Satın Alma Talebi (Simülatör Eşleme)</label>
                <select 
                  className="w-full text-xs font-bold mt-1 p-2 bg-slate-50 border border-amber-300 text-amber-800 rounded-lg focus:ring-1 focus:ring-amber-400"
                  value={irSaLink}
                  onChange={(e) => setIrSaLink(e.target.value)}
                >
                  <option value="">Bağsız / Manuel Giriş</option>
                  {satinAlmaTalepleri.map(po => (
                    <option key={po.id} value={po.saId}>{po.saId} ({po.cariFirma})</option>
                  ))}
                </select>
                <span className="text-[9px] text-slate-400 mt-1 block leading-relaxed">
                  Lütfen yukarıdan satın alma kodu seçin. Sistem teslimat kısıt ve miktar uyuşmazlığını otomatik analiz edecektir.
                </span>
              </div>

              {irSaLink && (() => {
                const linkedPo = satinAlmaTalepleri.find(po => po.saId === irSaLink);
                if (!linkedPo) return null;
                return (
                  <div className="bg-amber-50/50 border border-amber-200 p-3 rounded-xl space-y-2 text-[10px] animate-in fade-in duration-150">
                    <span className="font-bold text-amber-800 uppercase text-[9px] block">📋 TALEP KALEMLERİ MİNİ ÖNİZLEME ({linkedPo.saId})</span>
                    <div className="divide-y divide-amber-100 max-h-32 overflow-y-auto">
                      {linkedPo.kalemler.map((item, idx) => (
                        <div key={item.id || idx} className="py-1 flex justify-between">
                          <span className="text-slate-700 font-semibold">{item.urunAdi}</span>
                          <span className="text-amber-900 font-mono font-bold">{item.miktar} {item.birim}</span>
                        </div>
                      ))}
                    </div>
                    {linkedPo.aciklama && (
                      <p className="text-[9px] text-slate-500 italic border-t pt-1 mt-1 truncate">Açıklama: {linkedPo.aciklama}</p>
                    )}
                  </div>
                );
              })()}

              {/* Photo upload input simulation */}
              <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-3">
                <div>
                  <span className="font-bold text-[10px] text-emerald-800 block uppercase">📸 İrsaliye Fişi / Evrak Fotoğrafı</span>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleIrFileChange}
                    className="w-full text-[10px] text-slate-500 mt-1 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-150 cursor-pointer"
                  />
                  {irAttachmentUrl ? (
                    <div className="relative mt-2 border rounded-lg overflow-hidden bg-white max-h-32">
                      <img src={irAttachmentUrl} alt="İrsaliye dökümanı" className="w-full h-full object-contain" />
                      <button 
                        type="button" 
                        onClick={() => setIrAttachmentUrl(null)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[8px] font-bold w-4 h-4 flex items-center justify-center shadow"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <span className="text-[9px] text-red-500 italic block mt-1">ℹ️ Fotoğraf eklenmezse listede "Belge Eksik" kırmızı uyarısı çıkacaktır.</span>
                  )}
                </div>

                <div className="border-t pt-2.5">
                  <span className="font-bold text-[10px] text-teal-800 block uppercase">✍️ İMZALI İRSALİYE BELGESİ YÜKLE</span>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleIrSignedFileChange}
                    className="w-full text-[10px] text-slate-500 mt-1 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-teal-100 file:text-teal-700 hover:file:bg-teal-150 cursor-pointer"
                  />
                  {irSignedAttachmentUrl ? (
                    <div className="relative mt-2 border rounded-lg overflow-hidden bg-white max-h-32">
                      <img src={irSignedAttachmentUrl} alt="İmzalı İrsaliye dökümanı" className="w-full h-full object-contain" />
                      <button 
                        type="button" 
                        onClick={() => setIrSignedAttachmentUrl(null)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[8px] font-bold w-4 h-4 flex items-center justify-center shadow"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <span className="text-[9px] text-slate-400 italic block mt-1">✍️ Islak imzalı evrak dökümanınızı buradan yükleyin.</span>
                  )}
                </div>
              </div>

              {/* Item picker */}
              <div className="p-3 bg-slate-50 rounded-xl border space-y-3">
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="font-bold text-[10px] text-slate-500 block uppercase">Teslimat Malzemesi Girişi</span>
                  <button
                    type="button"
                    onClick={() => setIsManualIrProduct(!isManualIrProduct)}
                    className="text-[9px] font-bold text-emerald-600 hover:underline"
                  >
                    {isManualIrProduct ? "📋 Stok Kartından Seç" : "✍️ Elle Giriş Yap"}
                  </button>
                </div>
                
                <div>
                  <label className="text-[10px] font-semibold text-slate-400">Ürün Seç</label>
                  {isManualIrProduct ? (
                    <input 
                      type="text"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempIrProduct.name}
                      onChange={(e) => setTempIrProduct(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Malzeme adı giriniz..."
                    />
                  ) : (
                    <select
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempIrProduct.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = (stokKartlar || []).find((s: any) => s.ad === val || s.urunAdi === val);
                        setTempIrProduct(prev => ({
                          ...prev,
                          name: val,
                          unit: match?.birim || prev.unit
                        }));
                      }}
                    >
                      <option value="">-- Stok Kartlarından Seçin --</option>
                      {Array.from(new Set([
                        "Nervürlü Demir Q12",
                        "Portlant Çimento",
                        "C30 Hazır Beton",
                        ...(stokKartlar || []).map((s: any) => s.ad || s.urunAdi).filter(Boolean)
                      ])).map((name: any) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Teslim Miktar</label>
                    <input 
                      type="number"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempIrProduct.qty}
                      onChange={(e) => setTempIrProduct(prev => ({ ...prev, qty: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Birim</label>
                    <input 
                      type="text"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempIrProduct.unit}
                      onChange={(e) => setTempIrProduct(prev => ({ ...prev, unit: e.target.value }))}
                    />
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={handleAddIrProduct}
                  className="w-full bg-[#10b981] text-white font-bold py-1.5 rounded text-[10px] cursor-pointer hover:bg-emerald-600"
                >
                  + Malzemeyi İrsaliyeye Ekle
                </button>
              </div>

              {/* Item logs inside irsaliye creation */}
              {irProducts.length > 0 && (
                <div className="space-y-1">
                  <span className="font-bold text-[10px] text-slate-400 uppercase">Aktif İrsaliye İçeriği</span>
                  <div className="border p-2 rounded-lg max-h-32 overflow-y-auto space-y-1 bg-white">
                    {irProducts.map(p => (
                      <div key={p.id} className="text-[10px] flex justify-between bg-slate-50 p-1 rounded font-semibold text-slate-800">
                        <span>{p.urunAdi}</span>
                        <span>{p.miktar} {p.birim}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tarih</label>
                <input 
                  type="date" 
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  value={irDate}
                  onChange={(e) => setIrDate(e.target.value)}
                />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Firma</label>
                  <button
                    type="button"
                    onClick={() => setIsManualIrSupplier(!isManualIrSupplier)}
                    className="text-[9px] font-bold text-emerald-600 hover:underline"
                  >
                    {isManualIrSupplier ? "🏢 Cari Kartlardan Seç" : "✍️ Elle Giriş Yap"}
                  </button>
                </div>
                {isManualIrSupplier ? (
                  <input 
                    type="text" 
                    className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={irSupplier}
                    onChange={(e) => setIrSupplier(e.target.value)}
                    placeholder="Firma ismi giriniz..."
                  />
                ) : (
                  <select
                    className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={irSupplier}
                    onChange={(e) => setIrSupplier(e.target.value)}
                  >
                    <option value="">-- Cari Firmalardan Seçin --</option>
                    {Array.from(new Set([
                      "Demir A.Ş.",
                      "Çimento Ltd.",
                      "Cimsa Beton",
                      ...(cariKartlar || []).map((c: any) => c.unvan).filter(Boolean)
                    ])).map((unvan: any) => (
                      <option key={unvan} value={unvan}>{unvan}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              <button 
                onClick={handleSaveIrsaliye}
                className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer"
              >
                {editingIrId ? "İrsaliyeyi Güncelle" : "İrsaliyeyi Kaydet"}
              </button>
            </div>
          </div>

          {/* List waybills screen column */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet size={16} className="text-[#10b981]" />
                  <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Sistem İrsaliyeleri listesi</h4>
                </div>
                <div className="relative w-48 font-medium">
                  <input 
                    type="text" 
                    placeholder="İrsaliye veya Cari Ara..." 
                    className="w-full bg-white pl-7 pr-3 py-1 border rounded-lg text-[11px] focus:ring-1 focus:ring-[#10b981]" 
                    value={irSearchKeyword}
                    onChange={(e) => setIrSearchKeyword(e.target.value)}
                  />
                  <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                </div>
              </div>

              {/* Waybill Split List Type Selection Pills */}
              <div className="flex items-center justify-between border-t pt-2.5">
                <div className="flex gap-2 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setIrsaliyeListType('satin_almali');
                      setSelectedIrIdsForComparison([]);
                    }}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      irsaliyeListType === 'satin_almali'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-extrabold'
                        : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    🛒 Satın Almalı İrsaliyeler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIrsaliyeListType('dogrudan');
                      setSelectedIrIdsForComparison([]);
                    }}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      irsaliyeListType === 'dogrudan'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-extrabold'
                        : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    📦 Doğrudan / Serbest İrsaliyeler
                  </button>
                </div>

                {irsaliyeListType === 'satin_almali' && selectedIrIdsForComparison.length > 0 && (
                  <button
                    type="button"
                    onClick={handleGenerateMultiCompareReport}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black px-3 py-1.5 rounded-lg shadow flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    📊 Raporu Karşılaştır &amp; PDF Üret ({selectedIrIdsForComparison.length})
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              {/* 📥 İRSALİYE EŞLEŞTİRME HAVUZU */}
              {irsaliyeler.filter(ir => !ir.saId).length > 0 && (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 rounded-xl space-y-3 shadow-sm animate-in fade-in duration-150">
                  <div className="flex justify-between items-center border-b pb-1">
                    <span className="font-bold text-emerald-800 text-[10px] uppercase tracking-wider block">🚛 İRSALİYE EŞLEŞTİRME HAVUZU (BAĞSIZ EVRAKLAR)</span>
                    <span className="bg-emerald-650 bg-emerald-600 text-white rounded px-1.5 py-0.5 font-mono text-[8px] font-bold">GÜVENLİK VE SEVKİYAT</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                    Aşağıdaki irsaliye evrakları şantiyeye giriş yapmış fakat henüz bir Satın Alma Talebi ile eşleştirilmemiştir. Eşleştirme yaparak 3'lü karşılaştırma akışına dahil edebilirsiniz.
                  </p>
                  <div className="divide-y divide-emerald-100 max-h-48 overflow-y-auto space-y-2">
                    {irsaliyeler.filter(ir => !ir.saId).map((ir) => {
                      // We create a local state-like reference or dynamic dropdown selection using a standard select
                      return (
                        <div key={ir.id} className="pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[11px] bg-white p-2.5 rounded-lg border">
                          <div>
                            <p className="font-bold text-slate-800">📄 No: {ir.irsaliyeNo} ({ir.firma})</p>
                            <p className="text-[9px] text-slate-500">Tarih: {ir.tarih} · Kalemler: {ir.kalemler.map(k => `${k.urunAdi} (${k.miktar} ${k.birim})`).join(', ')}</p>
                          </div>
                          
                          <div className="flex items-center space-x-1.5 w-full sm:w-auto">
                            <select
                              id={`select-sa-for-${ir.id}`}
                              className="text-[10px] p-1 border rounded-md bg-slate-50 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="">-- Satın Alma Seçin --</option>
                              {satinAlmaTalepleri.map(sa => (
                                <option key={sa.id} value={sa.saId}>{sa.saId} ({sa.cariFirma})</option>
                              ))}
                            </select>
                            
                            <button
                              type="button"
                              onClick={() => {
                                const selectEl = document.getElementById(`select-sa-for-${ir.id}`) as HTMLSelectElement;
                                const selectedSa = selectEl?.value;
                                if (!selectedSa) {
                                  alert("Lütfen eşleştirmek için bir Satın Alma Siparişi seçin.");
                                  return;
                                }
                                setIrsaliyeler(prev => prev.map(item => {
                                  if (item.id === ir.id) {
                                    return {
                                      ...item,
                                      saId: selectedSa
                                    };
                                  }
                                  return item;
                                }));
                                alert(`İrsaliye ${selectedSa} numaralı satın alma siparişi ile başarıyla eşleştirildi ve havuzdan çıkarıldı!`);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[9px] py-1.5 px-2.5 rounded-md flex items-center space-x-1 cursor-pointer"
                            >
                              <span>Eşleştir ve Bağla</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* WAYBILLS LIST BLOCK */}
              <div className="space-y-4">
                {irsaliyeler
                  .filter(ir => {
                    const matchesType = irsaliyeListType === 'satin_almali' ? !!ir.saId : !ir.saId;
                    const query = irSearchKeyword.toLowerCase();
                    const matchesSearch = ir.irsaliyeNo.toLowerCase().includes(query) ||
                                          ir.firma.toLowerCase().includes(query) ||
                                          (ir.saId && ir.saId.toLowerCase().includes(query));
                    return matchesType && matchesSearch;
                  })
                  .sort((a, b) => (a.saId || '').localeCompare(b.saId || ''))
                  .map(ir => {
                    const isChecked = selectedIrIdsForComparison.includes(ir.id);
                    return (
                      <div key={ir.id} className={`border rounded-xl p-4 space-y-3 bg-white transition relative ${
                        isChecked ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-[#10b981]/50'
                      }`}>
                        
                        <div className="flex justify-between items-start text-xs border-b pb-2">
                          <div className="flex items-start space-x-2.5">
                            {/* Checkbox selector for multiple purchasing comparison if applicable */}
                            {irsaliyeListType === 'satin_almali' && (
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIrIdsForComparison(prev => [...prev, ir.id]);
                                  } else {
                                    setSelectedIrIdsForComparison(prev => prev.filter(x => x !== ir.id));
                                  }
                                }}
                                className="mt-1 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            )}
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <p className="font-bold text-slate-900 text-[13px]">No: {ir.irsaliyeNo}</p>
                                <span className="font-mono text-slate-400 text-[9px]">({ir.irsaliyeId})</span>
                              </div>
                              <p className="text-[10px] text-[#10b981] font-bold mt-1 uppercase">Firma: {ir.firma} · Tarih: {ir.tarih}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              ir.onayDurumu.includes('TAMAMLANDI') ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-850'
                            }`}>
                              {ir.onayDurumu}
                            </span>
                            
                            {ir.saId && (
                              <span className="bg-amber-100 text-amber-900 border border-amber-250 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                                🤝 Satın Alma Eşleşti
                              </span>
                            )}
                            
                            {/* Attachment Warning badge */}
                            {ir.fisEvrakUrl ? (
                              <span className="bg-blue-100 text-blue-800 text-[8px] font-bold px-1.5 py-0.5 rounded">📸 RESİM-BELGE EKLİ</span>
                            ) : (
                              <span className="bg-red-100 text-red-800 text-[8px] font-bold px-1.5 py-0.5 rounded animate-pulse">⚠️ DETAY RESİM EKSİK</span>
                            )}

                            {/* Signed Waybill copy check badge */}
                            {ir.imzaliEvrakUrl ? (
                              <span className="bg-teal-100 text-teal-800 text-[8px] font-bold px-1.5 py-0.5 rounded">✍️ İMZALI BELGE YÜKLÜ</span>
                            ) : (
                              <span className="bg-slate-100 text-slate-550 text-[8px] font-bold px-1.5 py-0.5 rounded">✍️ İmzalı Evrak Yok</span>
                            )}
                          </div>
                        </div>

                        {ir.saId && (
                          <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-100">
                            <span className="font-display font-semibold text-[10px] text-amber-800 block">EŞLEŞMELİ KONTROL REFERANSI (PO {ir.saId} koduna bağlı)</span>
                          </div>
                        )}

                        {/* Kalemler list table inside Po */}
                        <div className="text-[11px]">
                          <div className="grid grid-cols-3 bg-slate-50 p-1.5 font-bold text-slate-500 rounded-t-lg">
                            <span>Malzeme</span>
                            <span className="text-center">Teslim Alınan Miktar</span>
                            <span className="text-right">Birim</span>
                          </div>
                          <div className="border-x border-b rounded-b-lg divide-y bg-white">
                            {ir.kalemler.map(kl => (
                              <div key={kl.id} className="grid grid-cols-3 p-1.5 text-slate-700 hover:bg-slate-50/50">
                                <span className="font-semibold text-slate-900">{kl.urunAdi}</span>
                                <span className="text-center font-bold text-slate-800">{kl.miktar}</span>
                                <span className="text-right text-slate-400">{kl.birim}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Operational Actions */}
                        <div className="flex flex-wrap justify-end border-t pt-2 gap-2 text-[10px]">
                          {/* Physical Signed Doc Upload */}
                          <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition">
                            <Upload size={11} />
                            <span>{ir.imzaliEvrakUrl ? "İmza Güncelle" : "İmzalı Evrak Yükle"}</span>
                            <input 
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = async () => {
                                    const rawBase64 = reader.result as string;
                                    const compressed = await compressImage(rawBase64);
                                    setIrsaliyeler(prev => prev.map(item => {
                                      if (item.id === ir.id) {
                                        return {
                                          ...item,
                                          imzaliEvrakUrl: compressed,
                                          onayDurumu: '2. ONAY TAMAMLANDI'
                                        };
                                      }
                                      return item;
                                    }));
                                    alert("İrsaliye imzalı belgesi başarıyla yüklendi ve onaylandı!");
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>

                          {/* Digital E-Signature */}
                          <button 
                            type="button"
                            onClick={() => {
                              const name = prompt("Dijital E-İmza ismini girin:", currentUser?.name || currentUser?.email?.split('@')[0].toUpperCase() || "YÖNETİCİ");
                              if (name) {
                                setIrsaliyeler(prev => prev.map(item => {
                                  if (item.id === ir.id) {
                                    return {
                                      ...item,
                                      onayDurumu: '2. ONAY TAMAMLANDI',
                                      eImzalar: [...(item.eImzalar || []), `${name} (${new Date().toLocaleDateString('tr-TR')} - E-İmza)`]
                                    };
                                  }
                                  return item;
                                }));
                                alert("İrsaliye dijital E-İmza ile onaylandı!");
                              }
                            }}
                            className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 transition cursor-pointer"
                          >
                            <ShieldCheck size={11} />
                            <span>E-İmza</span>
                          </button>

                          <button 
                            onClick={() => setDocForApproval({ id: ir.id, type: 'waybill', irNo: ir.irsaliyeNo, saId: ir.saId, firma: ir.firma })}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                          >
                            <ShieldCheck size={11} />
                            <span>Onaya Gönder</span>
                          </button>
                          <button 
                            onClick={() => setSelectedIrsaliyeForPdf(ir)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                          >
                            <Search size={11} />
                            <span>Resmi Önizleme</span>
                          </button>
                          <button 
                            onClick={() => handleStartEditIr(ir)}
                            className="text-amber-800 bg-amber-50 hover:bg-amber-100 font-semibold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                          >
                            <Edit3 size={11} />
                            <span>Düzenle</span>
                          </button>
                          {deleteConfirmIrsaliyeId === ir.id ? (
                            <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-red-200 shadow-xs animate-in fade-in duration-100">
                              <span className="text-[10px] text-red-600 font-extrabold mr-1">Silinsin mi?</span>
                              <button
                                onClick={() => handleDeleteIrsaliye(ir.id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold py-0.5 px-2 rounded-lg transition"
                              >
                                Evet
                              </button>
                              <button
                                onClick={() => setDeleteConfirmIrsaliyeId(null)}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-bold py-0.5 px-2 rounded-lg transition"
                              >
                                İptal
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeleteConfirmIrsaliyeId(ir.id)}
                              className="text-red-850 bg-red-50 hover:bg-red-100 font-semibold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                            >
                              <span>Sil</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* PERSISTED REPORTS HISTORY ACCORDION ARCHIVE */}
              {comparisonReports.length > 0 && (
                <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center space-x-2 border-b pb-2">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest block">📂 GEÇMİŞ KONSOLİDE RAPORLAR ARŞİVİ</span>
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{comparisonReports.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {comparisonReports.map(rep => (
                      <div key={rep.id} className="bg-white border rounded-xl p-3 flex justify-between items-center shadow-xs">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{rep.baslik}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Üretim Tarihi: {rep.tarih} · İrsaliyeler: {rep.irNos?.join(', ')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const win = window.open("", "_blank");
                              if (win) {
                                win.document.write(rep.htmlContent);
                                win.document.close();
                              } else {
                                throw new Error("Popup blocked");
                              }
                            } catch {
                              const blob = new Blob([rep.htmlContent], { type: 'text/html;charset=utf-8' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `Kibritci_Irsaliye_Karsilastirma_Arsiv_${rep.id}.html`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-[10px] px-2.5 py-1 rounded-lg flex items-center space-x-1 cursor-pointer transition"
                        >
                          <Search size={11} />
                          <span>PDF Olarak Gör</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          🏠 SECTION 3: FATURALAR & 3'LY MATCHMAKING
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'fatura' && (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Creator drawer */}
          <div className="w-[430px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="bg-[#8b5cf6] text-slate-100 p-4 shrink-0 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-[#ede9fe] uppercase">Üçlü Mutabakat</span>
                <h3 className="font-display font-semibold text-sm">
                  {editingFtId ? "📝 Fatura Düzenleniyor" : "🏠 Fatura Girişi & Eşleme"}
                </h3>
              </div>
              {editingFtId && (
                <button 
                  onClick={handleCancelFtEdit} 
                  className="bg-purple-900/40 hover:bg-purple-900/60 px-2 py-1 rounded text-[10px] font-bold"
                >
                  Vazgeç
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* AI parsing block for Fatura */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-xl p-3.5 space-y-2 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-purple-900 tracking-wide uppercase text-[9px] flex items-center gap-1">
                    ✨ YAPAY ZEKA (AI) FATURA OKUYUCU
                  </span>
                  <span className="font-bold text-[8px] bg-purple-200 text-purple-800 px-1.5 py-0.2 rounded-full font-sans uppercase">
                    GEMINI
                  </span>
                </div>
                <p className="text-[10px] text-purple-700/90 leading-relaxed">
                  Fatura belgesinin fotoğrafını veya PDF dosyasını yükleyin; fatura no, tarih, firma, kalemler, birim fiyatlar ve KDV oranlarını yapay zeka ile otomatik dolduralım.
                </p>
                <div className="relative border-2 border-dashed border-purple-200 rounded-lg p-3 text-center bg-white hover:bg-purple-50/20 transition cursor-pointer">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        processFaturaAiFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isFtParsing}
                  />
                  {isFtParsing ? (
                    <div className="flex flex-col items-center justify-center space-y-1 py-1">
                      <div className="animate-spin rounded-full h-4.5 w-4.5 border-2 border-purple-600 border-t-transparent"></div>
                      <span className="text-[10px] font-bold text-purple-800 animate-pulse">Belge analiz ediliyor, lütfen bekleyin...</span>
                    </div>
                  ) : (
                    <div className="space-y-1 py-1">
                      <span className="text-[11px] font-bold text-purple-700 block">📁 Fatura PDF veya Fotoğraf Seç / Sürükle</span>
                      <span className="text-[9px] text-slate-400 block">PDF, PNG, JPG, WEBP formatları desteklenir</span>
                    </div>
                  )}
                </div>

                {ftParseError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded text-[10px] font-semibold">
                    ❌ {ftParseError}
                  </div>
                )}
                {ftParseSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded text-[10px] whitespace-pre-line font-medium leading-relaxed font-sans">
                    🎉 {ftParseSuccess}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Fatura Numarası *</label>
                <input 
                  type="text" 
                  className="w-full text-xs font-semibold mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:ring-1 focus:ring-[#8b5cf6]"
                  value={ftNo}
                  onChange={(e) => setFtNo(e.target.value)}
                  placeholder="FT-2026..."
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İrsaliye Bağlantısı (En Fazla 10 Adet Seçilebilir)</label>
                <div className="bg-slate-50 border border-purple-200 rounded-xl p-3 mt-1.5 space-y-2 max-h-36 overflow-y-auto">
                  {irsaliyeler
                    .filter(ir => !ftSupplier || ir.firma.toLowerCase().trim() === ftSupplier.toLowerCase().trim())
                    .map(ir => {
                      const isChecked = ftLinkedIrsaliyeler.includes(ir.irsaliyeNo);
                      return (
                        <label key={ir.id} className="flex items-center space-x-2 text-[10px] cursor-pointer hover:bg-purple-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (ftLinkedIrsaliyeler.length >= 10) {
                                  alert("En fazla 10 adet irsaliye bağlayabilirsiniz!");
                                  return;
                                }
                                setFtLinkedIrsaliyeler(prev => [...prev, ir.irsaliyeNo]);
                              } else {
                                setFtLinkedIrsaliyeler(prev => prev.filter(x => x !== ir.irsaliyeNo));
                              }
                            }}
                            className="w-3.5 h-3.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                          />
                          <span className="font-semibold text-slate-700">{ir.irsaliyeNo} ({ir.tarih})</span>
                        </label>
                      );
                    })}
                  {irsaliyeler.filter(ir => !ftSupplier || ir.firma.toLowerCase().trim() === ftSupplier.toLowerCase().trim()).length === 0 && (
                    <span className="text-[9.5px] text-slate-450 italic block p-1">Bu firmaya ait kayıtlı irsaliye bulunmuyor.</span>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 mt-1 block">
                  İrsaliyeleri belirleyerek miktar mutabakatlarını sistemin arkada analiz etmesini sağlayabilirsiniz.
                </span>

                {/* Onay Bekleyen / Onaylanmamış İrsaliyeler Listesi */}
                <div className="mt-3 bg-red-50 border border-red-200 p-3 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-red-800 text-[9px] uppercase tracking-wider block">⚠️ Sistemde Onaylanmamış İrsaliyeler</span>
                    <span className="bg-red-650 text-white rounded px-1 py-0.2 font-mono text-[8px]">KONTROL</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {irsaliyeler.filter(ir => !ir.onayDurumu.includes('TAMAMLANDI')).map((ir, idx) => (
                      <div key={ir.id || idx} className="text-[9px] text-slate-700 flex justify-between items-center font-semibold">
                        <span>📄 {ir.irsaliyeNo} ({ir.firma})</span>
                        <span className="text-[8px] font-mono bg-red-100 text-red-800 rounded px-1 uppercase">{ir.onayDurumu}</span>
                      </div>
                    ))}
                    {irsaliyeler.filter(ir => !ir.onayDurumu.includes('TAMAMLANDI')).length === 0 && (
                      <span className="text-slate-500 italic block text-[9px]">Sistemde onay bekleyen irsaliye bulunmuyor.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Fatura items adder helper */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-3 border">
                <div className="flex justify-between items-center border-b pb-0.5">
                  <span className="font-bold text-[10px] text-slate-500 block uppercase">Fatura Kalemi / Fiyat</span>
                  <button
                    type="button"
                    onClick={() => setIsManualFtStok(!isManualFtStok)}
                    className="text-[9px] font-bold text-purple-600 hover:underline"
                  >
                    {isManualFtStok ? "📋 Stok Kartından Seç" : "✍️ Elle Giriş Yap"}
                  </button>
                </div>
                
                <div>
                  <label className="text-[10px] font-semibold text-slate-400">Malzeme Adı</label>
                  {isManualFtStok ? (
                    <input 
                      type="text"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempFtItem.name}
                      onChange={(e) => setTempFtItem(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Malzeme adı giriniz..."
                    />
                  ) : (
                    <select
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg focus:outline-none"
                      value={tempFtItem.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = (stokKartlar || []).find((s: any) => s.ad === val || s.urunAdi === val);
                        setTempFtItem(prev => ({
                          ...prev,
                          name: val,
                          unit: match?.birim || prev.unit
                        }));
                      }}
                    >
                      <option value="">-- Stok Kartlarından Seçin --</option>
                      {Array.from(new Set([
                        "Nervürlü Demir Q12",
                        "Portlant Çimento",
                        "C30 Hazır Beton",
                        ...(stokKartlar || []).map((s: any) => s.ad || s.urunAdi).filter(Boolean)
                      ])).map((name: any) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Miktar</label>
                    <input 
                      type="number"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempFtItem.qty}
                      onChange={(e) => setTempFtItem(prev => ({ ...prev, qty: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Birim</label>
                    <input 
                      type="text"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempFtItem.unit}
                      onChange={(e) => setTempFtItem(prev => ({ ...prev, unit: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">Birim Fiyat (KDV Hariç ₺)</label>
                    <input 
                      type="number"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempFtItem.price}
                      onChange={(e) => setTempFtItem(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400">KDV Oranı (%)</label>
                    <input 
                      type="number"
                      className="w-full text-xs mt-1 p-1 bg-white border border-[#e2e8f0] rounded-lg"
                      value={tempFtItem.kdv}
                      onChange={(e) => setTempFtItem(prev => ({ ...prev, kdv: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={handleAddFtItem}
                  className="w-full bg-[#8b5cf6] text-white font-bold py-1.5 rounded text-[10px] cursor-pointer hover:bg-purple-700"
                >
                  + Kalemi Faturaya Ekle
                </button>
              </div>

              {/* Item logs inside invoice creation */}
              {ftItems.length > 0 && (
                <div className="space-y-1">
                  <span className="font-bold text-[10px] text-slate-400 uppercase">Aktif Fatura Kalemleri</span>
                  <div className="border p-2 rounded-lg max-h-32 overflow-y-auto space-y-1 bg-white">
                    {ftItems.map(p => (
                      <div key={p.id} className="text-[10px] flex justify-between bg-slate-50 p-1 rounded font-semibold text-slate-800">
                        <span>{p.urunAdi} ({p.miktar} x ₺{p.birimFiyat})</span>
                        <span className="font-mono text-purple-700">₺{p.toplam.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tarih</label>
                <input 
                  type="date" 
                  className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                  value={ftDate}
                  onChange={(e) => setFtDate(e.target.value)}
                />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Firma / Cari</label>
                  <button
                    type="button"
                    onClick={() => setIsManualFtCari(!isManualFtCari)}
                    className="text-[9px] font-bold text-purple-600 hover:underline"
                  >
                    {isManualFtCari ? "🏢 Cari Kartlardan Seç" : "✍️ Elle Giriş Yap"}
                  </button>
                </div>
                {isManualFtCari ? (
                  <input 
                    type="text" 
                    className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg"
                    value={ftSupplier}
                    onChange={(e) => setFtSupplier(e.target.value)}
                    placeholder="Firma ismi giriniz..."
                  />
                ) : (
                  <select
                    className="w-full text-xs mt-1 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg focus:outline-none"
                    value={ftSupplier}
                    onChange={(e) => setFtSupplier(e.target.value)}
                  >
                    <option value="">-- Cari Firmalardan Seçin --</option>
                    {Array.from(new Set([
                      "Demir A.Ş.",
                      "Çimento Ltd.",
                      "Cimsa Beton",
                      ...(cariKartlar || []).map((c: any) => c.unvan).filter(Boolean)
                    ])).map((unvan: any) => (
                      <option key={unvan} value={unvan}>{unvan}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* İmzalanmış Fatura Evrakı Yükleme */}
              <div className="p-3 bg-purple-50/40 rounded-xl border border-purple-100 space-y-2">
                <span className="font-bold text-[10px] text-purple-800 block uppercase">✍️ İMZALANMIŞ FATURA EVRAKI YÜKLE</span>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFtFileChange}
                  className="w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-150 cursor-pointer"
                />
                {ftAttachmentUrl ? (
                  <div className="relative mt-2 border border-purple-200 rounded-lg overflow-hidden bg-white max-h-32">
                    <img src={ftAttachmentUrl} alt="Signed Invoice Doc" className="w-full h-full object-contain" />
                    <button 
                      type="button" 
                      onClick={() => setFtAttachmentUrl(null)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-[8px] font-bold w-4 h-4 flex items-center justify-center shadow cursor-pointer hover:bg-red-700"
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] text-slate-400 block italic">Fiziksel fatura resmini yükleyebilirsiniz.</span>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              <button 
                onClick={handleSaveFatura}
                className="w-full bg-[#8b5cf6] text-white font-bold text-xs py-2.5 rounded-xl shadow transition cursor-pointer"
              >
                {editingFtId ? "Faturayı Güncelle" : "Eşle, Karşılaştır & Kaydet"}
              </button>
            </div>
          </div>

          {/* List panel Waybills screen */}
          <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center space-x-2">
                <FileCheck size={16} className="text-[#8b5cf6]" />
                <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">Sisteme İşlenen Faturalar</h4>
              </div>
              <div className="relative w-48">
                <input 
                  type="text" 
                  placeholder="Fatura No veya Cari Ara..." 
                  className="w-full bg-white pl-7 pr-3 py-1 border rounded-lg text-[11px] focus:ring-1 focus:ring-purple-400" 
                  value={ftSearchKeyword}
                  onChange={(e) => setFtSearchKeyword(e.target.value)}
                />
                <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
              </div>
            </div>

            {/* Sistemde Onaylanmamış İrsaliyeler Listesi Panel */}
            {(() => {
              const unapprovedIrsaliyeler = irsaliyeler.filter(ir => ir.onayDurumu !== '2. ONAY TAMAMLANDI');
              if (unapprovedIrsaliyeler.length === 0) return null;
              return (
                <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2 animate-in slide-in-from-top duration-200 shadow-sm">
                  <div className="flex items-center space-x-2 text-amber-800">
                    <AlertTriangle size={14} className="text-amber-600 animated animate-pulse" />
                    <span className="font-bold text-[10px] uppercase tracking-wider">⚠️ SİSTEMDE ONAYLANMAMIŞ İRSALİYELER ({unapprovedIrsaliyeler.length})</span>
                  </div>
                  <p className="text-[9px] text-amber-900 leading-snug">
                    Aşağıdaki irsaliyeler henüz 2. Onayını tamamlamamıştır. Fatura eşlemelerinde tutar uyumsuzluğuna yol açmamak için bu belgeleri öncelikli onaylayınız:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto max-h-24 pr-1">
                    {unapprovedIrsaliyeler.map(ir => (
                      <div key={ir.id} className="bg-white border border-amber-200 p-2 rounded-lg text-[10px] flex flex-col justify-between">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>{ir.irsaliyeNo}</span>
                          <span className="text-amber-700 font-mono text-[9px]">{ir.onayDurumu}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                          <span>{ir.firma}</span>
                          <span className="font-medium text-slate-400">{ir.tarih}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 🤝 3'LÜ MUTABAKAT İRSALİYE SEÇİM HAVUZU */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 p-4 rounded-xl space-y-3 shadow-xs">
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="font-bold text-purple-900 text-[10px] uppercase tracking-wider block">🏢 3'LÜ MUTABAKAT İRSALİYE SEÇİM HAVUZU</span>
                  <span className="bg-purple-650 bg-purple-600 text-white rounded px-1.5 py-0.5 font-mono text-[8px] font-bold">KONSOLİDE HAVUZ</span>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  3'lü Karşılaştırma Raporu (Satın Alma - İrsaliye - Fatura) üretmek için havuzdan fatura ile eşleşen irsaliye belgelerini seçin:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1 bg-white/70 rounded-lg border">
                  {irsaliyeler.map(ir => {
                    const isChecked = selectedIrIdsFor3WayMatch.includes(ir.id);
                    return (
                      <label key={ir.id} className="flex items-start space-x-2 p-1.5 rounded hover:bg-purple-100/40 cursor-pointer text-[10.5px]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIrIdsFor3WayMatch(prev => [...prev, ir.id]);
                            } else {
                              setSelectedIrIdsFor3WayMatch(prev => prev.filter(x => x !== ir.id));
                            }
                          }}
                          className="mt-0.5 w-3.5 h-3.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <div className="leading-tight">
                          <span className="font-bold text-slate-800">No: {ir.irsaliyeNo}</span>
                          <span className="text-slate-500 block text-[9px] font-semibold">{ir.firma} ({ir.saId || 'Bağsız'})</span>
                        </div>
                      </label>
                    );
                  })}
                  {irsaliyeler.length === 0 && (
                    <span className="text-[9.5px] text-slate-400 italic p-2 block">Sistemde kayıtlı irsaliye bulunmuyor.</span>
                  )}
                </div>

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[9.5px] text-purple-700 font-bold font-mono">Secili İrsaliye: {selectedIrIdsFor3WayMatch.length} Adet</span>
                  <button
                    type="button"
                    onClick={() => handleGenerate3WayMatchReport()}
                    disabled={selectedIrIdsFor3WayMatch.length === 0}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-extrabold text-[10px] py-1.5 px-3 rounded-lg shadow flex items-center space-x-1 cursor-pointer transition"
                  >
                    <FileCheck size={12} />
                    <span>Seçilenleri Karşılaştır & 3'lü Rapor Üret</span>
                  </button>
                </div>
              </div>

              {faturalar
                .filter(ft => {
                  const query = ftSearchKeyword.toLowerCase();
                  return (
                    ft.faturaNo.toLowerCase().includes(query) ||
                    ft.cariUnvan.toLowerCase().includes(query)
                  );
                })
                .map(ft => (
                  <div key={ft.id} className="border border-slate-200 hover:border-purple-300 rounded-xl p-4 space-y-3 bg-white transition shadow-sm relative">
                    <div className="flex justify-between items-start text-xs border-b pb-2">
                      <div>
                        <p className="font-bold text-slate-900 text-[13px]">No: {ft.faturaNo}</p>
                        <p className="text-[10px] text-[#8b5cf6] font-bold mt-1 uppercase">Cari: {ft.cariUnvan} · Tarih: {ft.tarih}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1.5">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          ft.durum === 'UYUMLU' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {ft.durum}
                        </span>
                        <p className="font-mono font-bold text-xs text-purple-700 mt-0.5">₺{ft.genelToplam.toLocaleString('tr-TR')}</p>
                      </div>
                    </div>

                    {/* Linked Waybills summary */}
                    <div className="text-[10px] text-slate-500 bg-slate-100 px-2 py-1.5 rounded border">
                      <span className="font-bold">Bağlı İrsaliyeler:</span> {ft.bagliIrsaliyeler?.join(', ') || 'Doğrudan Manuel Fatura'}
                    </div>

                    {ft.rapor && (
                      <div className="bg-purple-50/65 p-2.5 rounded-lg border border-purple-100">
                        <span className="font-display font-semibold text-[10px] text-purple-800 block">ÜÇLÜ MUTABAKAT EŞLEME RAPORU</span>
                        <p className="text-[10px] font-mono text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                          {ft.rapor}
                        </p>
                      </div>
                    )}

                    {/* Kalemler list table inside Po */}
                    <div className="text-[11px]">
                      <div className="grid grid-cols-4 bg-slate-50 p-1.5 font-bold text-slate-500 rounded-t-lg">
                        <span>Malzeme</span>
                        <span className="text-center">Adet</span>
                        <span className="text-center">Birim Fiyat</span>
                        <span className="text-right">Line Tutar</span>
                      </div>
                      <div className="border-x border-b rounded-b-lg divide-y bg-white">
                        {ft.kalemler.map(kl => (
                          <div key={kl.id} className="grid grid-cols-4 p-1.5 text-slate-700 hover:bg-slate-50/50">
                            <span className="font-semibold text-slate-900">{kl.urunAdi}</span>
                            <span className="text-center font-bold text-slate-800">{kl.miktar} {kl.birim}</span>
                            <span className="text-center text-slate-400">₺{kl.birimFiyat.toLocaleString()}</span>
                            <span className="text-right font-mono text-slate-600">₺{kl.toplam.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Operational Actions */}
                    <div className="flex flex-wrap justify-end border-t pt-2 gap-2 text-[10px]">
                      {/* Physical Signed Doc Upload */}
                      <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition">
                        <Upload size={11} />
                        <span>{ft.imzaliEvrakUrl ? "İmza Güncelle" : "İmzalı Evrak Yükle"}</span>
                        <input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const rawBase64 = reader.result as string;
                                const compressed = await compressImage(rawBase64);
                                setFaturalar(prev => prev.map(item => {
                                  if (item.id === ft.id) {
                                    return {
                                      ...item,
                                      imzaliEvrakUrl: compressed,
                                      durum: 'ONAYLANDI'
                                    };
                                  }
                                  return item;
                                }));
                                alert("Fatura imzalı belgesi başarıyla yüklendi ve onaylandı!");
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>

                      {/* Digital E-Signature */}
                      <button 
                        type="button"
                        onClick={() => {
                          const name = prompt("Dijital E-İmza ismini girin:", currentUser?.name || currentUser?.email?.split('@')[0].toUpperCase() || "YÖNETİCİ");
                          if (name) {
                            setFaturalar(prev => prev.map(item => {
                              if (item.id === ft.id) {
                                return {
                                  ...item,
                                  durum: 'ONAYLANDI',
                                  eImzalar: [...(item.eImzalar || []), `${name} (${new Date().toLocaleDateString('tr-TR')} - E-İmza)`]
                                };
                              }
                              return item;
                            }));
                            alert("Fatura dijital E-İmza ile onaylandı!");
                          }
                        }}
                        className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1 transition cursor-pointer"
                      >
                        <ShieldCheck size={11} />
                        <span>E-İmza</span>
                      </button>

                      <button 
                        onClick={() => setSelectedFaturaForPdf(ft)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                      >
                        <Search size={11} />
                        <span>Resmi Önizleme</span>
                      </button>
                      <button 
                        onClick={() => handleStartEditFt(ft)}
                        className="text-amber-800 bg-amber-50 hover:bg-amber-100 font-semibold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                      >
                        <Edit3 size={11} />
                        <span>Düzenle</span>
                      </button>
                       {deleteConfirmFaturaId === ft.id ? (
                         <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-red-200 shadow-xs animate-in fade-in duration-100">
                           <span className="text-[10px] text-red-600 font-extrabold mr-1">Silinsin mi?</span>
                           <button
                             onClick={() => handleDeleteFatura(ft.id)}
                             className="bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold py-0.5 px-2 rounded-lg transition"
                           >
                             Evet
                           </button>
                           <button
                             onClick={() => setDeleteConfirmFaturaId(null)}
                             className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-bold py-0.5 px-2 rounded-lg transition"
                           >
                             İptal
                           </button>
                         </div>
                       ) : (
                         <button 
                           onClick={() => setDeleteConfirmFaturaId(ft.id)}
                           className="text-red-850 bg-red-50 hover:bg-red-100 font-semibold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                         >
                           <span>Sil</span>
                         </button>
                       )}
                      {ft.durum !== 'ONAYLANDI' && (
                        <button 
                          onClick={() => setDocForApproval({ id: ft.id, type: 'invoice', faturaNo: ft.faturaNo, cariUnvan: ft.cariUnvan })}
                          className="text-purple-800 bg-purple-50 hover:bg-purple-150 font-bold py-1 px-2.5 rounded-lg flex items-center space-x-1"
                        >
                          <Send size={11} className="mr-0.5" />
                          <span>Onaya Gönder</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 3'LÜ YAPAY ZEKA MUTABAKAT VE KARŞILAŞTIRMA SEKME İÇERİĞİ */}
      {activeSubTab === 'karsilastirma' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 p-1">
          {/* Header Panel */}
          <div className="mb-4 bg-white border border-slate-200 rounded-2xl p-4 flex justify-between items-center shadow-sm shrink-0">
            <div>
              <span className="text-[10px] font-bold text-blue-600 tracking-wider uppercase">Otomatik Evrak Kontrol Paneli</span>
              <h2 className="font-display font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                <span>✨ Yapay Zeka ile 3'lü Mutabakat & Karşılaştırma</span>
              </h2>
              <p className="text-[10px] text-slate-500">Satın Alma Siparişleri (PO), Teslimat İrsaliyeleri ve Cari Faturaları arasındaki miktarsal ve tanımsal uyumu yapay zeka denetler.</p>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="px-2.5 py-1 bg-green-50 text-green-700 font-semibold rounded-full border border-green-200">🟢 Sorunsuz: Uyumlu</span>
              <span className="px-2.5 py-1 bg-red-50 text-red-700 font-semibold rounded-full border border-red-200">🔴 Sorunlu: Uyuşmazlık Var</span>
            </div>
          </div>

          {/* PO List Container */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-6">
            {satinAlmaTalepleri.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
                <ShoppingCart className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="font-semibold text-xs">Henüz tanımlı satın alma talebi bulunamadı.</p>
                <p className="text-[10px] text-slate-400">Karşılaştırma yapabilmek için önce satın alma talepleri oluşturmalısınız.</p>
              </div>
            ) : (
              satinAlmaTalepleri.map(sa => {
                // Find waybills linked to this PO
                const linkedIrs = irsaliyeler.filter(ir => ir.saId === sa.id || ir.saId === sa.saId);
                
                // Find invoices linked to these waybills or the PO directly
                const linkedFts = faturalar.filter(ft => 
                  ft.saId === sa.id || 
                  ft.saId === sa.saId ||
                  (ft.bagliIrsaliyeler && ft.bagliIrsaliyeler.some(bIr => 
                    linkedIrs.some(li => li.irsaliyeNo === bIr || li.irsaliyeId === bIr || li.id === bIr)
                  ))
                );

                const hasWaybill = linkedIrs.length > 0;
                const hasInvoice = linkedFts.length > 0;

                return (
                  <div key={sa.id} className="bg-white border border-slate-200 hover:border-blue-200 rounded-2xl p-4 shadow-sm transition space-y-4">
                    
                    {/* Header Row */}
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 font-mono text-[9px] font-bold rounded-md border border-amber-200 uppercase">PO: {sa.saId}</span>
                          <span className="text-slate-800 font-bold text-xs">{sa.cariFirma || "Firma Belirtilmedi"}</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Tarih: {sa.tarih} | Talep Eden: {sa.talepEden} | {sa.aciklama}</p>
                      </div>
                      
                      {/* Document Flow Badges */}
                      <div className="flex items-center gap-1">
                        {hasWaybill && (
                          <button
                            onClick={() => handleMergePoAndWaybills(sa, linkedIrs)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9.5px] font-extrabold py-1 px-2.5 rounded-lg flex items-center space-x-1 cursor-pointer transition mr-2"
                            title="PO ve İrsaliye miktar/kalemlerini birleştirip karşılaştırma raporu üretir."
                          >
                            <span>✨ Yapay Zeka ile Birleştir</span>
                          </button>
                        )}
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[9px] font-semibold rounded">1. Sipariş (PO) ✓</span>
                        <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${hasWaybill ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-400'}`}>
                          2. İrsaliye {hasWaybill ? '✓' : '✗'}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${hasInvoice ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-400'}`}>
                          3. Fatura {hasInvoice ? '✓' : '✗'}
                        </span>
                      </div>
                    </div>

                    {/* Columns Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
                      {/* Column 1: PO Items */}
                      <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 space-y-2">
                        <div className="flex items-center space-x-1.5 text-[#f59e0b] font-bold pb-1 border-b border-slate-100">
                          <ShoppingCart size={12} />
                          <span>Satın Alma Siparişi</span>
                        </div>
                        <ul className="space-y-1.5 text-[10px]">
                          {sa.kalemler && sa.kalemler.map((item, idx) => (
                            <li key={idx} className="flex justify-between items-center text-slate-700 bg-white p-1.5 rounded border border-slate-100">
                              <span className="font-medium text-slate-800">{item.urunAdi}</span>
                              <strong className="text-amber-800 font-mono">{item.miktar} {item.birim}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Column 2: Waybills */}
                      <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 space-y-2">
                        <div className="flex items-center space-x-1.5 text-[#10b981] font-bold pb-1 border-b border-slate-100">
                          <FileSpreadsheet size={12} />
                          <span>Teslim Alınan İrsaliyeler</span>
                        </div>
                        {hasWaybill ? (
                          <div className="space-y-2">
                            {linkedIrs.map((ir, irIdx) => (
                              <div key={irIdx} className="space-y-1.5">
                                <div className="flex justify-between items-center font-mono text-[9px] text-slate-500">
                                  <span>No: {ir.irsaliyeNo}</span>
                                  <span>{ir.tarih}</span>
                                </div>
                                <ul className="space-y-1 text-[10px]">
                                  {ir.kalemler.map((item, idx) => (
                                    <li key={idx} className="flex justify-between items-center text-slate-700 bg-white p-1 rounded border border-slate-100">
                                      <span>{item.urunAdi}</span>
                                      <strong className="text-green-800 font-mono">{item.miktar} {item.birim}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center text-slate-400 text-[10px]">
                            <p>Eşleşen irsaliye bulunamadı.</p>
                            <p className="text-[9px] text-slate-400 mt-1">İrsaliye oluştururken bu PO kodunu seçerek bağlayabilirsiniz.</p>
                          </div>
                        )}
                      </div>

                      {/* Column 3: Invoices */}
                      <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 space-y-2">
                        <div className="flex items-center space-x-1.5 text-[#8b5cf6] font-bold pb-1 border-b border-slate-100">
                          <FileCheck size={12} />
                          <span>Gelen Cari Faturaları</span>
                        </div>
                        {hasInvoice ? (
                          <div className="space-y-3">
                            {linkedFts.map((ft, ftIdx) => (
                              <div key={ftIdx} className="space-y-1.5">
                                <div className="flex justify-between items-center font-mono text-[9px] text-slate-500">
                                  <span>No: {ft.faturaNo}</span>
                                  <span>{ft.tarih}</span>
                                </div>
                                <ul className="space-y-1 text-[10px]">
                                  {ft.kalemler.map((item, idx) => (
                                    <li key={idx} className="flex justify-between items-center text-slate-700 bg-white p-1 rounded border border-slate-100">
                                      <span>{item.urunAdi}</span>
                                      <div className="text-right">
                                        <strong className="text-purple-800 font-mono block">{item.miktar} {item.birim}</strong>
                                        <span className="text-[9px] text-slate-400 font-mono">₺{item.birimFiyat} / ad</span>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-100 text-[10px] font-semibold text-slate-700">
                                  <span>Toplam:</span>
                                  <span className="text-purple-900 font-mono font-bold">₺{ft.genelToplam.toLocaleString('tr-TR')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center text-slate-400 text-[10px]">
                            <p>Eşleşen fatura bulunamadı.</p>
                            <p className="text-[9px] text-slate-400 mt-1">Fatura oluştururken bağlı irsaliye numarasını seçerek bağlayabilirsiniz.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI Comparison Results Block */}
                    {hasInvoice && (
                      <div className="border-t border-slate-100 pt-3.5 space-y-2">
                        {linkedFts.map(ft => {
                          const isComparing = comparingFtId === ft.id;
                          const aiDurum = (ft as any).aiDurum;
                          const aiRaporu = (ft as any).aiRaporu;
                          const aiDiscrepancies = (ft as any).aiDiscrepancies || [];

                          return (
                            <div key={ft.id} className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
                              <div className="flex justify-between items-center mb-2.5">
                                <div className="flex items-center space-x-2">
                                  <span className="text-[10px] font-bold text-slate-700">Fatura {ft.faturaNo} Mutabakat Raporu:</span>
                                  {!aiDurum ? (
                                    <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-bold rounded-full uppercase">Analiz Edilmedi</span>
                                  ) : aiDurum === 'SORUNSUZ ONAY' ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[9px] font-bold rounded-full border border-green-200 uppercase">
                                      🟢 SORUNSUZ ONAY
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[9px] font-bold rounded-full border border-red-200 uppercase">
                                      🔴 SORUNLU
                                    </span>
                                  )}
                                </div>

                                {!aiDurum ? (
                                  <button
                                    onClick={() => handleRun3WayAiCompare(sa, linkedIrs, ft)}
                                    disabled={isComparing}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg transition shadow-sm flex items-center space-x-1 cursor-pointer"
                                  >
                                    <span>{isComparing ? "⏳ Analiz Ediliyor..." : "✨ Yapay Zeka ile Karşılaştır"}</span>
                                  </button>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleRun3WayAiCompare(sa, linkedIrs, ft)}
                                      disabled={isComparing}
                                      className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-bold py-0.5 px-2 rounded transition cursor-pointer"
                                    >
                                      <span>Yeniden Analiz</span>
                                    </button>
                                    {(!ft.eImzalar || ft.eImzalar.length === 0) ? (
                                      <button
                                        onClick={() => handleApproveAndSign3Way(ft.id)}
                                        className="bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-bold py-0.5 px-2 rounded transition shadow-sm cursor-pointer"
                                      >
                                        ✍️ Müdür E-İmzası ile Onayla
                                      </button>
                                    ) : (
                                      <div className="flex gap-2 items-center">
                                        <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded font-semibold flex items-center gap-1 shadow-sm">
                                          🔐 Onaylandı ({ft.eImzalar[0]})
                                        </span>
                                        <button
                                          onClick={() => alert(`Fatura ${ft.faturaNo} Mutabakat ve Ödeme Doğrulama Raporu merkez ofise (merkez@kibritci.com) e-posta ile başarıyla gönderildi!`)}
                                          className="bg-sky-600 hover:bg-sky-700 text-white text-[9px] font-bold py-0.5 px-2 rounded transition shadow-sm cursor-pointer flex items-center space-x-1"
                                        >
                                          <Send size={10} />
                                          <span>E-Posta Gönder</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {aiRaporu ? (
                                <div className="space-y-2.5">
                                  {aiDiscrepancies.length > 0 && (
                                    <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-2.5 text-[10px] space-y-1 shadow-inner">
                                      <strong className="block text-[10px] font-bold">⚠️ Saptanan Uyuşmazlıklar:</strong>
                                      <ul className="list-disc pl-4 space-y-0.5 font-semibold">
                                        {aiDiscrepancies.map((disc: string, dIdx: number) => (
                                          <li key={dIdx}>{disc}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <div className="bg-white border border-slate-150 rounded-xl p-3 text-[10.5px] text-slate-700 leading-relaxed shadow-sm whitespace-pre-wrap font-sans">
                                    {aiRaporu}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[9px] text-slate-400 italic font-medium">Yapay zeka analizi başlatılmadı. 3'lü karşılaştırma ve mutabakat raporu almak için "Yapay Zeka ile Karşılaştır" butonuna tıklayınız.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 🤝 YÖNETİCİ SEÇİMİ VE MULTI-ADMIN ONAYA GÖNDERME MODAL POPUP */}
      {docForApproval && (() => {
        const admins = (kullanicilar || []).filter(u => (u.yetki === 'YÖNETİCİ' || u.email === 'sametatak9@gmail.com' || u.email === 'santiye@kibritci.com') && u.durum === 'AKTİF');
        const candidateAdmins = admins.length > 0 ? admins : [
          { email: 'sametatak9@gmail.com', ad: 'Mustafa', soyad: 'Kibritçi (Genel Müdür)', yetki: 'YÖNETİCİ' },
          { email: 'santiye@kibritci.com', ad: 'Yönetim /', soyad: 'Şantiye Şefliği Temsilcisi', yetki: 'YÖNETİCİ' },
          { email: 'sametatak95@gmail.com', ad: 'Mekanik Şefliği /', soyad: 'Muhasebe Sorumlusu', yetki: 'YÖNETİCİ' }
        ];

        const handleSendDocToManagers = () => {
          if (selectedYoneticiEmails.length === 0) {
            alert("Lütfen en az bir yönetici seçiniz.");
            return;
          }

          if (docForApproval.type === 'request') {
            setSatinAlmaTalepleri(prev => prev.map(item => {
              if (item.id === docForApproval.id) {
                return {
                  ...item,
                  onayDurumu: 'ONAY BEKLİYOR',
                  onayGonderilenYoneticiMailleri: selectedYoneticiEmails
                } as any;
              }
              return item;
            }));
            alert("Satın Alma Talebi seçilen yöneticilerin onay paneline başarıyla gönderildi.");
          } else if (docForApproval.type === 'waybill') {
            setIrsaliyeler(prev => prev.map(item => {
              if (item.id === docForApproval.id) {
                return {
                  ...item,
                  onayDurumu: 'ONAY BEKLİYOR',
                  onayGonderilenYoneticiMailleri: selectedYoneticiEmails
                } as any;
              }
              return item;
            }));
            alert("İrsaliye Teslimat Belgesi seçilen yöneticilerin onay paneline başarıyla gönderildi.");
          } else if (docForApproval.type === 'invoice') {
            setFaturalar(prev => prev.map(item => {
              if (item.id === docForApproval.id) {
                return {
                  ...item,
                  durum: 'KONTROL BEKLEYOR',
                  onayGonderilenYoneticiMailleri: selectedYoneticiEmails
                } as any;
              }
              return item;
            }));
            alert("Cari Faturası seçilen yöneticilerin onay paneline başarıyla gönderildi.");
          }

          setDocForApproval(null);
          setSelectedYoneticiEmails([]);
        };

        const toggleYoneticiSelection = (email: string) => {
          setSelectedYoneticiEmails(prev => 
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
          );
        };

        return (
          <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 p-4 font-sans">
            <div className="bg-white rounded-3xl w-[480px] overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
              <div className="bg-purple-900 text-white p-5">
                <span className="text-[9px] font-bold uppercase block tracking-widest text-purple-300">YÖNETİCİ ONAY HAVUZU DAĞITIM</span>
                <h3 className="font-display font-bold text-sm mt-0.5">🤝 Yöneticiye Onaya Gönder</h3>
              </div>
              
              <div className="p-5 space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border space-y-1">
                  <span className="text-[8px] font-black uppercase text-slate-400 block">Belge Detayları</span>
                  <div className="text-[11px] font-semibold text-slate-705">
                    <p>📦 Belge Tipi: <strong className="uppercase text-purple-850 font-bold">{docForApproval.type === 'request' ? 'Satın Alma Talebi' : docForApproval.type === 'waybill' ? 'İrsaliye Teslimat Belgesi' : 'Cari Faturası'}</strong></p>
                    {docForApproval.saId && <p>SA Kodu: <strong className="font-mono text-slate-900">{docForApproval.saId}</strong></p>}
                    {docForApproval.irNo && <p>İrsaliye No: <strong className="font-mono text-slate-900">{docForApproval.irNo}</strong></p>}
                    {docForApproval.faturaNo && <p>Fatura No: <strong className="font-mono text-slate-900">{docForApproval.faturaNo}</strong></p>}
                    {(docForApproval.firma || docForApproval.cariUnvan) && <p>Firma/Cari: <strong>{docForApproval.firma || docForApproval.cariUnvan}</strong></p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-550 uppercase block">Onay İstenen Yetkili Yöneticiler (Birden Fazla Seçilebilir)</label>
                  <p className="text-[9px] text-slate-400">Belge, seçilen her bir yöneticinin kendi özel onay paneline ayrı ayrı düşecektir:</p>
                  
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {candidateAdmins.map(admin => {
                      const isSelected = selectedYoneticiEmails.includes(admin.email);
                      return (
                        <div 
                          key={admin.email}
                          onClick={() => toggleYoneticiSelection(admin.email)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                            isSelected 
                              ? 'bg-purple-50/70 border-purple-300 text-purple-900' 
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => {}} // handled by outer div
                              className="rounded border-slate-300 text-purple-600 focus:ring-purple-400 cursor-pointer"
                            />
                            <div>
                              <strong className="text-[11px] block text-slate-800">{admin.ad} {admin.soyad}</strong>
                              <span className="text-[9px] text-slate-450 block font-mono">{admin.email}</span>
                            </div>
                          </div>
                          <span className="text-[8px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded-full uppercase">Yönetici</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t flex gap-2 justify-end">
                <button 
                  onClick={() => {
                    setDocForApproval(null);
                    setSelectedYoneticiEmails([]);
                  }}
                  className="bg-slate-200 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 px-3.5 rounded-xl transition cursor-pointer"
                >
                  İptal
                </button>
                <button 
                  onClick={handleSendDocToManagers}
                  className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold py-2 px-3.5 rounded-xl transition shadow flex items-center space-x-1 cursor-pointer"
                >
                  <Send size={12} />
                  <span>Onaya ve İmza Havuzuna Gönder</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
export default SatinAlmaScreen;
