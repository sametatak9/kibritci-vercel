import React, { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen } from 'lucide-react';
import { Irsaliye, IrsaliyeItem, SatinAlmaTalebi, CariKart, StokKart, Fatura, EvrakBaglantiGrubu, CariKartIslem, StokKartIslem } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { fetchApiJson } from '../lib/apiClient';
import { fileToAiPayload } from '../lib/aiFileUpload';
import { warnIfDuplicateStok } from '../lib/duplicateNameUtils';
import { kibritciLogoHtml } from '../lib/kibritciBrand';
import { wrapCorporateReportHtml } from '../lib/corporateReportHtml';
import { getReportEmailToolbarHtml, openHtmlReportWindow } from '../lib/reportEmail';
import { ReportEmailButton } from './ReportEmailButton';
import {
  applyStokGirisFromKalemler,
  appendCariIslemOnce,
  buildCariEvrakHistory,
  countLinkedStok,
  linkIrsaliyeKalemler,
  resolveCariKartId,
} from '../lib/evrakCariStokSync';
import { type SaIrsaliyeFormPrefill } from '../lib/evrakDonusum';
import { findStokMatch } from '../lib/evrakBatchImportUtils';
import { listFaturasizIrsaliyeler } from '../lib/operasyonUyarilari';
import { resolveIrsaliyeProvenance } from '../lib/evrakProvenance';
import {
  irsaliyeNoChainSortKey,
  malzemeTipiLabel,
  micirMalzemeTipiSortKey,
  resolveMicirMalzemeTipiFromIrsaliye,
} from '../lib/micirUtils';
import { EvrakPageShell, EvrakSectionHeader } from './evrakUi/EvrakScreenChrome';
import { openEvrakTarama } from './evrakUi/EvrakTaramaOnizleme';
import {
  MuhasebeAiButton,
  MuhasebeAttach,
  MuhasebeBelgeForm,
  MuhasebeField,
  MuhasebeKalemRow,
  MuhasebeKalemTablosu,
  muhasebeInputClass,
} from './evrakUi/MuhasebeBelgeForm';

interface IrsaliyeGirisScreenProps {
  irsaliyeler: Irsaliye[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  evrakBaglantiGruplari: EvrakBaglantiGrubu[];
  setEvrakBaglantiGruplari: React.Dispatch<React.SetStateAction<EvrakBaglantiGrubu[]>>;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: React.Dispatch<React.SetStateAction<StokKartIslem[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  currentUser?: any;
  addNotification?: (mesaj: string) => void;
  /** Satın Alma «İrsaliyeye Dönüştür» ile gelen ön doldurma */
  prefillFromSa?: SaIrsaliyeFormPrefill | null;
  onPrefillConsumed?: () => void;
  onOpenTCetveli?: () => void;
}

export const IrsaliyeGirisScreen: React.FC<IrsaliyeGirisScreenProps> = ({
  irsaliyeler,
  setIrsaliyeler,
  faturalar = [],
  satinAlmaTalepleri,
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  setStokIslemGecmisi,
  setCariIslemGecmisi,
  currentUser,
  addNotification,
  prefillFromSa = null,
  onPrefillConsumed,
  onOpenTCetveli,
}) => {

  // Form states
  const [irNo, setIrNo] = useState("");
  const [irDate, setIrDate] = useState(new Date().toISOString().split('T')[0]);
  const [irSupplier, setIrSupplier] = useState("");
  const [irProducts, setIrProducts] = useState<IrsaliyeItem[]>([]);
  const [tempProduct, setTempProduct] = useState({ name: "", qty: 0, unit: "ADET" });
  const [irAttachmentUrl, setIrAttachmentUrl] = useState<string | null>(null);
  const [irSignedAttachmentUrl, setIrSignedAttachmentUrl] = useState<string | null>(null);
  const [editingIrId, setEditingIrId] = useState<string | null>(null);
  const [linkedSaId, setLinkedSaId] = useState<string | null>(null);

  useEffect(() => {
    if (!prefillFromSa) return;
    setEditingIrId(null);
    setIrNo(prefillFromSa.suggestedIrNo);
    setIrDate(prefillFromSa.tarih || new Date().toISOString().split('T')[0]);
    setIrSupplier(prefillFromSa.firma || '');
    setIrProducts(prefillFromSa.kalemler || []);
    setLinkedSaId(prefillFromSa.saId);
    setIrAttachmentUrl(null);
    setIrSignedAttachmentUrl(null);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca yeni prefill geldiğinde uygula
  }, [prefillFromSa]);

  // AI Parser states
  const [isIrParsing, setIsIrParsing] = useState(false);
  const [irParseError, setIrParseError] = useState<string | null>(null);
  const [irParseSuccess, setIrParseSuccess] = useState<string | null>(null);

  // Suggestions/Modal states for Cari and Stok creation
  const [showCariSuggest, setShowCariSuggest] = useState(false);
  const [suggestedCariName, setSuggestedCariName] = useState("");
  const [suggestedCariType, setSuggestedCariType] = useState<CariKart['kartTipi']>('TEDARIKCI');
  
  const [showStokSuggest, setShowStokSuggest] = useState(false);
  const [suggestedStokName, setSuggestedStokName] = useState("");
  const [suggestedStokCat, setSuggestedStokCat] = useState("Kaba İnşaat İmalatı");
  const [suggestedStokUnit, setSuggestedStokUnit] = useState("ADET");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<'ALL' | 'KAPI' | 'CARI_YOK' | 'STOK_EKSIK' | 'FATURASIZ'>('ALL');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSignedFileChange = (e: React.ChangeEvent<HTMLInputElement>, irId?: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        
        if (irId) {
          // Direct upload from list
          setIrsaliyeler(prev => prev.map(ir => {
            if (ir.id === irId) {
              return {
                ...ir,
                imzaliEvrakUrl: compressed,
                onayDurumu: '1. ONAY TAMAMLANDI' // Sevkiyat Teslim Alındı
              };
            }
            return ir;
          }));
          alert("İmzalı sevkiyat evrağı başarıyla yüklendi! Teslimat durumu güncellendi.");
        } else {
          setIrSignedAttachmentUrl(compressed);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const processIrsaliyeAi = async (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setIrParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında İrsaliye yükleyiniz.");
      return;
    }

    setIsIrParsing(true);
    setIrParseError(null);
    setIrParseSuccess(null);

    try {
      const { fileBase64, mimeType } = await fileToAiPayload(file);
      const resData = await fetchApiJson<{ success: boolean; data?: any; error?: string }>(
        '/api/parse-irsaliye',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64, mimeType }),
        }
      );
        if (!resData.success) {
          throw new Error(resData.error || 'İrsaliye belgesi çözümlenirken hata oluştu.');
        }

        const parsed = resData.data;
        setIrNo(parsed.irsaliyeNo || "");
        if (parsed.tarih) setIrDate(parsed.tarih);
        if (parsed.firma) {
          setIrSupplier(parsed.firma);
          checkAndSuggestCari(parsed.firma);
        }
        if (parsed.kalemler && parsed.kalemler.length > 0) {
          const formatted = parsed.kalemler.map((x: any, idx: number) => ({
            id: `iri_ai_${Date.now()}_${idx}`,
            urunAdi: x.urunAdi,
            miktar: Number(x.miktar) || 0,
            birim: x.birim || "ADET"
          }));
          setIrProducts(formatted);
          formatted.forEach((item: any) => checkAndSuggestStok(item.urunAdi, item.birim));
        }
        setIrParseSuccess(`Yapay Zeka Okuması Başarılı! No: ${parsed.irsaliyeNo || ''}`);
    } catch (err: any) {
      setIrParseError(err.message || "Dosya çözümlenemedi.");
    } finally {
      setIsIrParsing(false);
    }
  };

  const checkAndSuggestCari = (name: string) => {
    const exists = cariKartlar.some(c => c.unvan.toLowerCase().trim() === name.toLowerCase().trim());
    if (!exists) {
      setSuggestedCariName(name);
      setShowCariSuggest(true);
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
    const newCari: CariKart = {
      id: `ck_${Date.now()}`,
      kartTipi: suggestedCariType,
      kod: `CAR-${Math.floor(100 + Math.random() * 900)}`,
      unvan: suggestedCariName,
      yetkili: "Otomatik Eklendi",
      telefon: "",
      eposta: "",
      vergiNo: "",
      vergiDairesi: "",
      adres: "İrsaliye girişinden otomatik oluşturuldu.",
      iban: "",
      durum: 'AKTIF',
      notlar: "Otomatik eklendi."
    };
    if (setCariKartlar) {
      setCariKartlar(prev => [newCari, ...prev]);
    }
    setShowCariSuggest(false);
    alert(`Yeni Cari Kart (${suggestedCariName}) başarıyla oluşturuldu!`);
  };

  const checkAndSuggestStok = (name: string, unit: string = "ADET") => {
    const exists = stokKartlar.some(s => s.stokAdi.toLowerCase().trim() === name.toLowerCase().trim());
    if (!exists) {
      setSuggestedStokName(name);
      setSuggestedStokUnit(unit);
      setShowStokSuggest(true);
    }
  };

  const handleCreateStok = () => {
    if (!suggestedStokName) return;
    if (warnIfDuplicateStok(stokKartlar, suggestedStokName)) {
      setShowStokSuggest(false);
      return;
    }
    const newStok: StokKart = {
      id: `sk_${Date.now()}`,
      stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
      stokAdi: suggestedStokName,
      kategori: suggestedStokCat,
      birim: suggestedStokUnit,
      kritikSeviye: 5,
      durum: 'AKTIF',
      aciklama: "İrsaliye girişinden otomatik oluşturuldu."
    };
    if (setStokKartlar) {
      setStokKartlar(prev => [newStok, ...prev]);
    }
    setShowStokSuggest(false);
    alert(`Yeni Stok Kartı (${suggestedStokName}) başarıyla oluşturuldu!`);
  };

  const handleAddProduct = () => {
    if (!tempProduct.name || tempProduct.qty <= 0) return;
    const matched = findStokMatch(tempProduct.name, stokKartlar);
    setIrProducts(prev => [
      ...prev,
      {
        id: `iri_${Date.now()}`,
        urunAdi: matched?.stokAdi || tempProduct.name,
        miktar: tempProduct.qty,
        birim: tempProduct.unit || matched?.birim || 'ADET',
        stokKartId: matched?.id,
      }
    ]);
    checkAndSuggestStok(tempProduct.name, tempProduct.unit);
    setTempProduct({ name: "", qty: 0, unit: "ADET" });
  };

  const handleSaveIrsaliye = () => {
    if (!irNo || !irSupplier || irProducts.length === 0) {
      alert("Lütfen İrsaliye No, Firma ve en az 1 Malzeme kalemi giriniz.");
      return;
    }

    const calculatedStatus = 'ONAY BEKLİYOR';
    const cariResolved = resolveCariKartId(irSupplier, cariKartlar);
    const linkedProducts = linkIrsaliyeKalemler(irProducts, stokKartlar);
    const recordId = editingIrId || `ir_${Date.now()}`;
    const bumpMiktar = true; // fiziksel giriş → stok miktarı

    if (editingIrId) {
      const existing = irsaliyeler.find((ir) => ir.id === editingIrId);
      setIrsaliyeler(prev => prev.map(ir => {
        if (ir.id === editingIrId) {
          return {
            ...ir,
            irsaliyeNo: irNo,
            tarih: irDate,
            firma: irSupplier,
            cariKartId: cariResolved.cariKartId || ir.cariKartId,
            saId: existing?.saId || linkedSaId || undefined,
            onayDurumu: calculatedStatus,
            kalemler: linkedProducts,
            fisEvrakUrl: irAttachmentUrl || undefined,
            imzaliEvrakUrl: irSignedAttachmentUrl || undefined
          };
        }
        return ir;
      }));
      setEditingIrId(null);
    } else {
      const newIr: Irsaliye = {
        id: recordId,
        irsaliyeId: `IR-${irDate.replace(/-/g, '')}-${Math.random().toString(16).substr(2, 4).toUpperCase()}`,
        irsaliyeNo: irNo,
        tarih: irDate,
        firma: irSupplier,
        cariKartId: cariResolved.cariKartId || undefined,
        saId: linkedSaId || undefined,
        onayDurumu: calculatedStatus,
        kalemler: linkedProducts,
        fisEvrakUrl: irAttachmentUrl || undefined,
        imzaliEvrakUrl: irSignedAttachmentUrl || undefined
      };
      setIrsaliyeler(prev => [newIr, ...prev]);
    }

    checkAndSuggestCari(irSupplier);

    applyStokGirisFromKalemler({
      kalemler: linkedProducts,
      belgeNo: irNo,
      tarih: irDate,
      supplier: irSupplier,
      islemBaslik: 'İrsaliye Girişi',
      islemDetayPrefix: 'Sevk irsaliyesi ·',
      bumpMiktar,
      stokKartlar,
      setStokKartlar,
      setStokIslemGecmisi,
      aciklamaTag: 'İrsaliye',
    });

    if (cariResolved.cariKartId) {
      appendCariIslemOnce(
        setCariIslemGecmisi,
        buildCariEvrakHistory({
          cariKartId: cariResolved.cariKartId,
          islemTipi: 'IRSALIYE',
          islemId: recordId,
          islemBaslik: 'İrsaliye Kaydı',
          islemDetay: `${irNo} · ${irSupplier} · ${linkedProducts.length} kalem`,
          tarih: irDate,
          belgeNo: irNo,
        })
      );
    }

    const stokLink = countLinkedStok(linkedProducts);
    if (addNotification) {
      addNotification(
        `${irNo} irsaliye kaydedildi. Cari: ${cariResolved.matched ? 'bağlı' : 'önerildi'} · Stok: ${stokLink.linked}/${stokLink.total}`
      );
    }

    setIrNo("");
    setIrSupplier("");
    setIrProducts([]);
    setIrAttachmentUrl(null);
    setIrSignedAttachmentUrl(null);
    setLinkedSaId(null);
    alert(
      `İrsaliye kaydedildi.\nCari: ${cariResolved.matched ? 'bağlı' : 'kart önerildi'}\nStok eşleşmesi: ${stokLink.linked}/${stokLink.total}`
    );
  };

  const handlePreviewIrsaliyePdf = (ir: Irsaliye) => {
    const innerBody = `
      <div class="mb-6">
        <h2 class="text-xl font-extrabold text-slate-800 tracking-tight">SEVK İRSALİYESİ RAPORU</h2>
        <p class="text-xs text-slate-500 mt-1">Malzeme Sevk ve Teslim Tesellüm Belgesi</p>
      </div>

      <!-- Bilgi Kartları -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="border border-slate-200 bg-slate-50/50 p-4 rounded-xl">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">🚚 Sevk &amp; İrsaliye Bilgileri</h4>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between"><span class="text-slate-500">İrsaliye No:</span> <strong class="text-slate-800">${ir.irsaliyeNo || '-'}</strong></div>
            <div class="flex justify-between"><span class="text-slate-500">İrsaliye Tarihi:</span> <strong class="text-slate-800">${ir.tarih || '-'}</strong></div>
            <div class="flex justify-between"><span class="text-slate-500">Onay Durumu:</span> <strong class="text-indigo-600">${ir.onayDurumu || 'ONAY BEKLİYOR'}</strong></div>
          </div>
        </div>
        
        <div class="border border-slate-200 bg-slate-50/50 p-4 rounded-xl">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">🏢 Gönderici / Tedarikçi</h4>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between"><span class="text-slate-500">Tedarikçi Firma:</span> <strong class="text-slate-800">${ir.firma || '-'}</strong></div>
            <div class="flex justify-between"><span class="text-slate-500">İlişkili Fatura No:</span> <strong class="text-slate-800">${ir.faturaNo || 'Bağlanmadı'}</strong></div>
            <div class="flex justify-between"><span class="text-slate-500">İlişkili Talep No:</span> <strong class="text-slate-800">${ir.saId || 'Bağlanmadı'}</strong></div>
          </div>
        </div>
      </div>

      <!-- Malzeme Kalemleri Tablosu -->
      <div class="border border-slate-200 rounded-xl overflow-hidden mb-6">
        <table class="w-full text-xs text-left border-collapse">
          <thead>
            <tr class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <th class="p-3 w-12 text-center">#</th>
              <th class="p-3">Malzeme / Ürün Adı</th>
              <th class="p-3 text-right w-32">Miktar</th>
              <th class="p-3 w-24">Birim</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${(ir.kalemler || []).map((k, index) => `
              <tr class="hover:bg-slate-50/50 transition">
                <td class="p-3 text-center text-slate-400 font-mono">${index + 1}</td>
                <td class="p-3 font-semibold text-slate-800">${k.urunAdi || '-'}</td>
                <td class="p-3 text-right font-mono font-bold text-slate-900">${k.miktar || 0}</td>
                <td class="p-3 text-slate-650">${k.birim || 'Adet'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Onay ve İmza Kanalları -->
      <div class="mt-8">
        <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">🖋️ Teslim Tesellüm İmza Alanları</h4>
        <div class="grid grid-cols-3 gap-4">
          <div class="border border-slate-200 p-4 rounded-xl text-center min-h-[100px] flex flex-col justify-between">
            <span class="text-[10px] font-bold text-slate-500 block uppercase">Teslim Eden (Firma Şoförü)</span>
            <span class="text-[10px] text-slate-400 font-mono italic">Ad Soyad / İmza</span>
          </div>
          <div class="border border-slate-200 p-4 rounded-xl text-center min-h-[100px] flex flex-col justify-between">
            <span class="text-[10px] font-bold text-slate-500 block uppercase">Teslim Alan (Güvenlik / Depo)</span>
            <span class="text-[10px] text-slate-400 font-mono italic">Ad Soyad / İmza</span>
          </div>
          <div class="border border-slate-200 p-4 rounded-xl text-center min-h-[100px] flex flex-col justify-between">
            <span class="text-[10px] font-bold text-slate-500 block uppercase">Kontrol Eden (Şantiye Şefi)</span>
            <span class="text-[10px] text-slate-400 font-mono italic">Ad Soyad / İmza</span>
          </div>
        </div>
      </div>

      <!-- Dijital e-İmzalar -->
      ${ir.eImzalar && ir.eImzalar.length > 0 ? `
        <div class="mt-6 border border-emerald-100 bg-emerald-50/30 p-3 rounded-xl text-[10px] text-emerald-800 leading-relaxed">
          <div class="font-bold flex items-center space-x-1 mb-1">
            <span>🛡️ DİJİTAL ONAY ZİNCİRİ VE E-İMZA KANITLARI</span>
          </div>
          ${ir.eImzalar.map(im => `<div>• ${im}</div>`).join('')}
        </div>
      ` : ''}
    `;

    const html = wrapCorporateReportHtml(innerBody, {
      docCode: `İRSALİYE NO: ${ir.irsaliyeNo || 'İRSALİYE'}`,
      orientation: 'portrait',
      title: `Kibritçi İnşaat - İrsaliye Raporu - ${ir.irsaliyeNo}`,
      autoPrint: false,
    });
    openHtmlReportWindow(html, `İrsaliye ${ir.irsaliyeNo}`);
  };

  const handleIrsaliyeArchiveReport = () => {
    const rows = [...irsaliyeler]
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))
      .map((ir, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${ir.tarih || '-'}</td>
          <td>${ir.irsaliyeNo || '-'}</td>
          <td>${ir.firma || '-'}</td>
          <td>${(ir.kalemler || []).length}</td>
          <td>${ir.fisEvrakUrl ? 'Var' : 'Yok'}</td>
          <td>${ir.imzaliEvrakUrl ? 'Var' : 'Yok'}</td>
        </tr>
      `)
      .join('');
    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>İrsaliye Evrak Arşiv Raporu</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { margin: 0 0 8px; font-size: 18px; }
            p { margin: 0 0 16px; font-size: 12px; color: #6b7280; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
            th { background: #f3f4f6; text-align: left; }
          </style>
        </head>
        <body>
          ${getReportEmailToolbarHtml({ subject: 'İrsaliye Evrak Arşiv Raporu', fileName: 'Kibritci_Irsaliye_Arsiv.html' })}
          <div style="margin-bottom:12px;">${kibritciLogoHtml(44)}</div>
          <h1 style="font-size:14px;margin:0 0 8px;">İRSALİYE EVRAK ARŞİV RAPORU</h1>
          <p>Kayıt sayısı: ${irsaliyeler.length} • Üretim: ${new Date().toLocaleString('tr-TR')}</p>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Tarih</th><th>İrsaliye No</th><th>Firma</th><th>Kalem</th><th>Evrak</th><th>İmzalı</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
    openHtmlReportWindow(html, 'İrsaliye Evrak Arşiv Raporu');
  };

  const faturasizIds = useMemo(() => {
    const ids = new Set(
      listFaturasizIrsaliyeler(irsaliyeler, faturalar, 0).map((x) => x.id)
    );
    return ids;
  }, [irsaliyeler, faturalar]);

  const filteredArchive = useMemo(() => {
    const q = archiveSearch.trim().toLocaleLowerCase('tr-TR');
    return [...irsaliyeler]
      .filter((ir) => {
        if (
          archiveFilter === 'KAPI' &&
          !(ir.kaynak === 'KAPI_EVRAK' || ir.guvenlikEvrakId || String(ir.donusumKaynagi || '').startsWith('KAPI'))
        ) {
          return false;
        }
        if (archiveFilter === 'CARI_YOK' && ir.cariKartId) return false;
        if (archiveFilter === 'STOK_EKSIK') {
          const link = countLinkedStok(ir.kalemler || []);
          if (link.total === 0 || link.linked === link.total) return false;
        }
        if (archiveFilter === 'FATURASIZ' && !faturasizIds.has(ir.id)) return false;
        if (!q) return true;
        const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
        const tipLabel = tip ? malzemeTipiLabel(tip).toLocaleLowerCase('tr-TR') : '';
        return (
          String(ir.irsaliyeNo || '').toLocaleLowerCase('tr-TR').includes(q) ||
          String(ir.firma || '').toLocaleLowerCase('tr-TR').includes(q) ||
          String(ir.onayDurumu || '').toLocaleLowerCase('tr-TR').includes(q) ||
          tipLabel.includes(q) ||
          String(ir.malzemeTipi || '').toLocaleLowerCase('tr-TR').includes(q)
        );
      })
      .sort((a, b) => {
        const aTip = resolveMicirMalzemeTipiFromIrsaliye(a);
        const bTip = resolveMicirMalzemeTipiFromIrsaliye(b);
        const aMicir = a.kaynak === 'MICIR_STABILIZE_FIS' || !!aTip;
        const bMicir = b.kaynak === 'MICIR_STABILIZE_FIS' || !!bTip;
        if (aMicir || bMicir) {
          const ak = aTip != null ? micirMalzemeTipiSortKey(aTip) : aMicir ? 0 : 99;
          const bk = bTip != null ? micirMalzemeTipiSortKey(bTip) : bMicir ? 0 : 99;
          if (ak !== bk) return ak - bk;
          const d = String(a.tarih || '').localeCompare(String(b.tarih || ''));
          if (d !== 0) return d;
          const na = irsaliyeNoChainSortKey(a.irsaliyeNo);
          const nb = irsaliyeNoChainSortKey(b.irsaliyeNo);
          if (na !== nb) return na - nb;
          return String(a.id).localeCompare(String(b.id));
        }
        return (b.tarih || '').localeCompare(a.tarih || '');
      })
      .slice(0, 200);
  }, [irsaliyeler, archiveSearch, archiveFilter, faturasizIds]);

  const faturasizCount = faturasizIds.size;

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="ir"
        eyebrow="Sevk irsaliyesi"
        title="İrsaliyeler"
        subtitle={`${irsaliyeler.length} kayıt · ${faturasizCount} faturasız`}
        action={
          onOpenTCetveli ? (
            <button
              type="button"
              onClick={onOpenTCetveli}
              className="px-3 py-2 font-bold rounded-lg text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              <BookOpen size={13} /> T Cetveli
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-5">
          <MuhasebeBelgeForm
            variant="irsaliye"
            editing={Boolean(editingIrId)}
            onClear={() => {
              setIrProducts([]);
              setIrNo('');
              setIrSupplier('');
              setIrAttachmentUrl(null);
              setIrSignedAttachmentUrl(null);
              setEditingIrId(null);
              setLinkedSaId(null);
              setTempProduct({ name: '', qty: 0, unit: 'ADET' });
            }}
            onSave={handleSaveIrsaliye}
            saveLabel={editingIrId ? 'İrsaliyeyi güncelle' : 'İrsaliyeyi kaydet'}
            ai={
              <MuhasebeAiButton
                loading={isIrParsing}
                error={irParseError}
                success={irParseSuccess}
                onFile={processIrsaliyeAi}
              />
            }
            banner={
              linkedSaId ? (
                <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Satın alma <span className="font-mono font-bold">{linkedSaId}</span> siparişinden dolduruldu.
                </p>
              ) : null
            }
            fields={
              <>
                <MuhasebeField label="Cari / satıcı *" span={2}>
                  <input
                    type="text"
                    list="ir-cari-list"
                    placeholder="Firma ünvanı"
                    value={irSupplier}
                    onChange={(e) => setIrSupplier(e.target.value)}
                    className={muhasebeInputClass}
                  />
                  <datalist id="ir-cari-list">
                    {cariKartlar.map((c) => (
                      <option key={c.id} value={c.unvan} />
                    ))}
                  </datalist>
                </MuhasebeField>
                <MuhasebeField label="İrsaliye no *">
                  <input
                    type="text"
                    placeholder="IRS-2026-…"
                    value={irNo}
                    onChange={(e) => setIrNo(e.target.value)}
                    className={muhasebeInputClass}
                  />
                </MuhasebeField>
                <MuhasebeField label="Sevk tarihi">
                  <input type="date" value={irDate} onChange={(e) => setIrDate(e.target.value)} className={muhasebeInputClass} />
                </MuhasebeField>
              </>
            }
            itemsTable={
              <MuhasebeKalemTablosu variant="irsaliye" onAdd={handleAddProduct} addDisabled={!tempProduct.name || tempProduct.qty <= 0}>
                {irProducts.map((p) => (
                  <MuhasebeKalemRow key={p.id} onRemove={() => setIrProducts((prev) => prev.filter((x) => x.id !== p.id))}>
                    <td className="px-2 py-1">
                      <input
                        className={muhasebeInputClass}
                        value={p.urunAdi}
                        onChange={(e) =>
                          setIrProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, urunAdi: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={muhasebeInputClass}
                        value={p.miktar || ''}
                        onChange={(e) =>
                          setIrProducts((prev) =>
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
                          setIrProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, birim: e.target.value } : x)))
                        }
                      />
                    </td>
                  </MuhasebeKalemRow>
                ))}
                <MuhasebeKalemRow>
                  <td className="px-2 py-1">
                    <input
                      list="ir-stok-list"
                      className={muhasebeInputClass}
                      placeholder="Malzeme adı"
                      value={tempProduct.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const matched = stokKartlar.find(
                          (s) => s.stokAdi.toLowerCase().trim() === name.toLowerCase().trim()
                        );
                        setTempProduct((prev) => ({ ...prev, name, unit: matched?.birim || prev.unit }));
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddProduct()}
                    />
                    <datalist id="ir-stok-list">
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
                      value={tempProduct.qty || ''}
                      onChange={(e) => setTempProduct((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className={muhasebeInputClass}
                      value={tempProduct.unit}
                      onChange={(e) => setTempProduct((prev) => ({ ...prev, unit: e.target.value }))}
                    >
                      <option value="ADET">ADET</option>
                      <option value="TON">TON</option>
                      <option value="KG">KG</option>
                      <option value="M3">M3</option>
                      <option value="TORBA">TORBA</option>
                    </select>
                  </td>
                </MuhasebeKalemRow>
              </MuhasebeKalemTablosu>
            }
            attachments={
              <div className="flex flex-wrap gap-2">
                <MuhasebeAttach
                  label="Evrak fotoğrafı"
                  loaded={Boolean(irAttachmentUrl)}
                  onFile={handleFileChange}
                  previewUrl={irAttachmentUrl}
                  onPreview={() => openEvrakTarama(irAttachmentUrl, irNo || 'İrsaliye taraması')}
                />
                <MuhasebeAttach
                  label="İmzalı evrak"
                  loaded={Boolean(irSignedAttachmentUrl)}
                  onFile={(e) => handleSignedFileChange(e)}
                  previewUrl={irSignedAttachmentUrl}
                  onPreview={() => openEvrakTarama(irSignedAttachmentUrl, 'İmzalı irsaliye')}
                />
              </div>
            }
          />

          <div className="flex-1 space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">İrsaliye Evrak Arşivi</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <ReportEmailButton
                    className="text-[10px] bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer inline-flex items-center gap-1"
                    payload={() => ({
                      subject: 'Kibritçi — İrsaliye Evrak Arşiv Raporu',
                      body: `İrsaliye arşiv özeti\nKayıt sayısı: ${irsaliyeler.length}\nÜretim: ${new Date().toLocaleString('tr-TR')}`,
                      fileName: 'Kibritci_Irsaliye_Arsiv.html',
                    })}
                  />
                  <button
                    type="button"
                    onClick={handleIrsaliyeArchiveReport}
                    className="text-[10px] bg-slate-900 hover:bg-slate-950 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer"
                  >
                    PDF Rapor (Yazdır)
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="No / firma / durum ara…"
                    className="w-full text-[11px] font-semibold pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {([
                    ['ALL', 'Tümü'],
                    ['KAPI', 'Kapı taraması'],
                    ['CARI_YOK', 'Cari yok'],
                    ['STOK_EKSIK', 'Stok eksik'],
                    ['FATURASIZ', `Faturasız${faturasizCount > 0 ? ` (${faturasizCount})` : ''}`],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setArchiveFilter(id)}
                      className={`text-[10px] font-bold px-2.5 py-2 rounded-lg border cursor-pointer ${
                        archiveFilter === id
                          ? id === 'FATURASIZ'
                            ? 'bg-rose-700 text-white border-rose-700'
                            : 'bg-emerald-700 text-white border-emerald-700'
                          : id === 'FATURASIZ' && faturasizCount > 0
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[min(58vh,520px)] overflow-auto border border-slate-100 rounded-xl shadow-inner">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm">
                    <tr className="text-left text-slate-600">
                      <th className="px-2 py-2">Tarih</th>
                      <th className="px-2 py-2">İrsaliye No</th>
                      <th className="px-2 py-2">Firma</th>
                      <th className="px-2 py-2">Bağ</th>
                      <th className="px-2 py-2">Kalem</th>
                      <th className="px-2 py-2">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchive.map((ir) => {
                      const stokLink = countLinkedStok(ir.kalemler || []);
                      return (
                        <tr key={ir.id} className="border-t border-slate-100 hover:bg-emerald-50/50 transition-colors">
                          <td className="px-2 py-1.5">{ir.tarih || '-'}</td>
                          <td className="px-2 py-1.5 font-semibold">
                            {ir.irsaliyeNo}
                            {(ir as any).kaynak === 'VIDANJOR_FIS' && (
                              <span className="ml-1 text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded">Vidanjör</span>
                            )}
                            {(ir as any).kaynak === 'YILDIRIM_TANKER_FIS' && (
                              <span className="ml-1 text-[8px] font-black uppercase bg-sky-100 text-sky-700 px-1 py-0.5 rounded">Yıldırım</span>
                            )}
                            {(ir as any).kaynak === 'MICIR_STABILIZE_FIS' && (
                              <span className="ml-1 text-[8px] font-black uppercase bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">
                                {malzemeTipiLabel(resolveMicirMalzemeTipiFromIrsaliye(ir))}
                              </span>
                            )}
                            {resolveIrsaliyeProvenance(ir).map((b) => (
                              <span key={b.label} className={`ml-1 inline-block ${b.className}`} title={b.title}>
                                {b.label}
                              </span>
                            ))}
                          </td>
                          <td className="px-2 py-1.5">
                            {ir.firma}
                            {(ir as any).plaka ? (
                              <span className="block text-[9px] text-slate-400 font-mono">{(ir as any).plaka}</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit ${ir.cariKartId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {ir.cariKartId ? 'Cari' : 'Cari yok'}
                              </span>
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit ${stokLink.total > 0 && stokLink.linked === stokLink.total ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                Stok {stokLink.linked}/{stokLink.total}
                              </span>
                              {ir.kaynak !== 'MICIR_STABILIZE_FIS' ? (
                                faturasizIds.has(ir.id) ? (
                                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit bg-rose-50 text-rose-700">
                                    Faturaya bağlanmadı
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit bg-violet-50 text-violet-700">
                                    Faturaya bağlandı
                                  </span>
                                )
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            {(ir as any).kaynak === 'VIDANJOR_FIS'
                              ? `${(ir as any).cekimAdedi ?? (ir.kalemler || [])[0]?.miktar ?? 0} çekim`
                              : (ir as any).kaynak === 'YILDIRIM_TANKER_FIS'
                                ? `İ:${(ir as any).icmeSuyuAdet ?? 0} / S:${(ir as any).sanayiSuyuAdet ?? 0}`
                              : (ir as any).kaynak === 'MICIR_STABILIZE_FIS'
                                ? `${(ir as any).tonaj ?? (ir.kalemler || [])[0]?.miktar ?? 0} ton`
                              : (ir.kalemler || []).length}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap gap-1 items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingIrId(ir.id);
                                  setIrNo(ir.irsaliyeNo || '');
                                  setIrDate(ir.tarih || new Date().toISOString().slice(0, 10));
                                  setIrSupplier(ir.firma || '');
                                  setIrProducts(ir.kalemler || []);
                                  setIrAttachmentUrl(ir.fisEvrakUrl || null);
                                  setIrSignedAttachmentUrl(ir.imzaliEvrakUrl || null);
                                  setLinkedSaId(ir.saId || null);
                                }}
                                className="text-[10px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded px-2 py-1 font-bold cursor-pointer"
                              >
                                Düzenle
                              </button>
                              {ir.fisEvrakUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openEvrakTarama(ir.fisEvrakUrl, ir.irsaliyeNo || 'İrsaliye taraması')}
                                  className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded px-2 py-1 font-bold cursor-pointer"
                                >
                                  Tarama
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handlePreviewIrsaliyePdf(ir)}
                                className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded px-2 py-1 font-bold cursor-pointer"
                              >
                                Aç
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredArchive.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">
                          Filtreye uyan irsaliye yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

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

    </EvrakPageShell>
  );
};

export default IrsaliyeGirisScreen;
