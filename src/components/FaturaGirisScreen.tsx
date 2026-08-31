import React, { useMemo, useState } from 'react';
import { 
  CreditCard, FileText, ClipboardList, Plus, Trash2, Edit3, 
  Search, Eye, Printer, Upload, Sparkles, Send, CheckCircle2 
} from 'lucide-react';
import { Fatura, FaturaItem, Irsaliye, CariKart, StokKart, SatinAlmaTalebi, EvrakBaglantiGrubu, CariKartIslem } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { fetchApiJson } from '../lib/apiClient';
import { fileToAiPayload } from '../lib/aiFileUpload';
import { faturaIsLinked } from '../lib/documentLinkUtils';
import { kibritciLogoHtml } from '../lib/kibritciBrand';
import { getReportEmailToolbarHtml, openHtmlReportWindow } from '../lib/reportEmail';
import { ReportEmailButton } from './ReportEmailButton';
import {
  appendCariIslemOnce,
  buildCariEvrakHistory,
  countLinkedStok,
  linkFaturaKalemler,
  resolveCariKartId,
} from '../lib/evrakCariStokSync';
import { findStokMatch } from '../lib/evrakBatchImportUtils';
import { syncFaturaIrsaliyeBaglari } from '../lib/evrakDonusum';
import { resolveFaturaProvenance } from '../lib/evrakProvenance';
import { EvrakPageShell, EvrakSectionHeader } from './evrakUi/EvrakScreenChrome';
import { openEvrakTarama } from './evrakUi/EvrakTaramaOnizleme';
import {
  MuhasebeAiButton,
  MuhasebeAttach,
  MuhasebeBelgeForm,
  MuhasebeField,
  MuhasebeKalemRow,
  MuhasebeKalemTablosu,
  MuhasebeTotals,
  muhasebeInputClass,
} from './evrakUi/MuhasebeBelgeForm';

interface FaturaGirisScreenProps {
  faturalar: Fatura[];
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  irsaliyeler: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<StokKart[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  evrakBaglantiGruplari: EvrakBaglantiGrubu[];
  setEvrakBaglantiGruplari: React.Dispatch<React.SetStateAction<EvrakBaglantiGrubu[]>>;
  currentUser?: any;
  addNotification?: (mesaj: string) => void;
}

export const FaturaGirisScreen: React.FC<FaturaGirisScreenProps> = ({
  faturalar,
  setFaturalar,
  irsaliyeler,
  setIrsaliyeler,
  satinAlmaTalepleri,
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  setCariIslemGecmisi,
  currentUser,
  addNotification,
}) => {
  
  // Form states
  const [ftNo, setFtNo] = useState("");
  const [ftDate, setFtDate] = useState(new Date().toISOString().split('T')[0]);
  const [ftSupplier, setFtSupplier] = useState("");
  const [ftItems, setFtItems] = useState<FaturaItem[]>([]);
  const [tempItem, setTempItem] = useState({ name: "", qty: 0, unit: "ADET", price: 0, kdv: 20 });
  const [ftAttachmentUrl, setFtAttachmentUrl] = useState<string | null>(null);
  const [ftSignedAttachmentUrl, setFtSignedAttachmentUrl] = useState<string | null>(null);
  const [editingFtId, setEditingFtId] = useState<string | null>(null);
  const [editBagliIrsaliyeIds, setEditBagliIrsaliyeIds] = useState<string[]>([]);
  const [addBagliIrId, setAddBagliIrId] = useState('');

  // AI Parser states
  const [isFtParsing, setIsFtParsing] = useState(false);
  const [ftParseError, setFtParseError] = useState<string | null>(null);
  const [ftParseSuccess, setFtParseSuccess] = useState<string | null>(null);

  // Suggestions/Modal states for Cari and Stok creation
  const [showCariSuggest, setShowCariSuggest] = useState(false);
  const [suggestedCariName, setSuggestedCariName] = useState("");
  const [suggestedCariType, setSuggestedCariType] = useState<CariKart['kartTipi']>('TEDARIKCI');
  
  const [showStokSuggest, setShowStokSuggest] = useState(false);
  const [suggestedStokName, setSuggestedStokName] = useState("");
  const [suggestedStokCat, setSuggestedStokCat] = useState("Kaba İnşaat İmalatı");
  const [suggestedStokUnit, setSuggestedStokUnit] = useState("ADET");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<'ALL' | 'BAGIMSIZ' | 'CARI_YOK' | 'KAPI'>('ALL');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSignedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressImage(rawBase64);
        setFtSignedAttachmentUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const processFaturaAi = async (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setFtParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında Fatura yükleyiniz.");
      return;
    }

    setIsFtParsing(true);
    setFtParseError(null);
    setFtParseSuccess(null);

    try {
      const { fileBase64, mimeType } = await fileToAiPayload(file);
      const resData = await fetchApiJson<{ success: boolean; data?: any; error?: string }>(
        '/api/parse-fatura',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64, mimeType }),
        }
      );
      if (!resData.success) {
        throw new Error(resData.error || 'Fatura belgesi çözümlenirken hata oluştu.');
      }

      const parsed = resData.data;
      setFtNo(parsed.faturaNo || "");
      if (parsed.tarih) setFtDate(parsed.tarih);
      if (parsed.firma) {
        setFtSupplier(parsed.firma);
        checkAndSuggestCari(parsed.firma);
      }
      if (parsed.kalemler && parsed.kalemler.length > 0) {
        const formatted = parsed.kalemler.map((x: any, idx: number) => ({
          id: `fti_ai_${Date.now()}_${idx}`,
          urunAdi: x.urunAdi,
          miktar: Number(x.miktar) || 0,
          birim: x.birim || "ADET",
          birimFiyat: Number(x.birimFiyat) || 0,
          kdvOran: Number(x.kdvOran) || 20,
          toplam: Number(x.toplam) || (Number(x.miktar) * Number(x.birimFiyat)) || 0
        }));
        setFtItems(formatted);
        formatted.forEach((item: any) => checkAndSuggestStok(item.urunAdi, item.birim));
      }
      setFtParseSuccess(`Yapay Zeka Okuması Başarılı! No: ${parsed.faturaNo || ''}`);
    } catch (err: any) {
      setFtParseError(err.message || "Dosya çözümlenemedi.");
    } finally {
      setIsFtParsing(false);
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
      adres: "Fatura girişinden otomatik oluşturuldu.",
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
    const exists = stokKartlar.some(s => s.stokAdi.toLowerCase().trim() === suggestedStokName.toLowerCase().trim());
    if (exists) {
      alert("Hata: Bu isimde bir stok zaten bulunmaktadır.");
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
      aciklama: "Fatura girişinden otomatik oluşturuldu."
    };
    if (setStokKartlar) {
      setStokKartlar(prev => [newStok, ...prev]);
    }
    setShowStokSuggest(false);
    alert(`Yeni Stok Kartı (${suggestedStokName}) başarıyla oluşturuldu!`);
  };

  const handleAddItem = () => {
    if (!tempItem.name || tempItem.qty <= 0 || tempItem.price <= 0) return;
    const itemTotal = tempItem.qty * tempItem.price;
    const matched = findStokMatch(tempItem.name, stokKartlar);
    setFtItems(prev => [
      ...prev,
      {
        id: `fti_${Date.now()}`,
        urunAdi: matched?.stokAdi || tempItem.name,
        miktar: tempItem.qty,
        birim: tempItem.unit || matched?.birim || 'ADET',
        birimFiyat: tempItem.price,
        kdvOran: tempItem.kdv,
        toplam: itemTotal,
        stokKartId: matched?.id,
      }
    ]);
    checkAndSuggestStok(tempItem.name, tempItem.unit);
    setTempItem({ name: "", qty: 0, unit: "ADET", price: 0, kdv: 20 });
  };

  const handleSaveFatura = () => {
    if (!ftNo || !ftSupplier || ftItems.length === 0) {
      alert("Lütfen Fatura No, Firma ve en az 1 Fatura Kalemi giriniz.");
      return;
    }

    const linkedItems = linkFaturaKalemler(ftItems, stokKartlar);
    const calculatedSub = linkedItems.reduce((acc, curr) => acc + curr.toplam, 0);
    const calculatedKdv = linkedItems.reduce((acc, curr) => acc + (curr.toplam * (curr.kdvOran / 100)), 0);
    const calculatedGrand = calculatedSub + calculatedKdv;
    const cariResolved = resolveCariKartId(ftSupplier, cariKartlar);
    const recordId = editingFtId || `ft_${Date.now()}`;

    if (editingFtId) {
      const existing = faturalar.find((f) => f.id === editingFtId);
      const baseUpdated: Fatura = {
        ...(existing as Fatura),
        id: editingFtId,
        faturaNo: ftNo,
        tarih: ftDate,
        cariUnvan: ftSupplier,
        cariKartId: cariResolved.cariKartId || existing?.cariKartId || "",
        saId: existing?.saId,
        toplamTutar: calculatedSub,
        kdvTutar: calculatedKdv,
        genelToplam: calculatedGrand,
        kalemler: linkedItems,
        evrakUrl: ftAttachmentUrl || undefined,
        imzaliEvrakUrl: ftSignedAttachmentUrl || undefined,
        bagliIrsaliyeler: editBagliIrsaliyeIds,
      };
      if (setIrsaliyeler && existing) {
        const synced = syncFaturaIrsaliyeBaglari(existing, editBagliIrsaliyeIds, irsaliyeler);
        setIrsaliyeler(() => synced.irsaliyeler);
        setFaturalar((prev) =>
          prev.map((ft) => (ft.id === editingFtId ? { ...synced.fatura, ...baseUpdated, bagliIrsaliyeler: editBagliIrsaliyeIds } : ft))
        );
      } else {
        setFaturalar((prev) => prev.map((ft) => (ft.id === editingFtId ? baseUpdated : ft)));
      }
      setEditingFtId(null);
      setEditBagliIrsaliyeIds([]);
      setAddBagliIrId('');
    } else {
      const newFt: Fatura = {
        id: recordId,
        faturaNo: ftNo,
        tarih: ftDate,
        cariUnvan: ftSupplier,
        cariKartId: cariResolved.cariKartId || "",
        toplamTutar: calculatedSub,
        kdvTutar: calculatedKdv,
        genelToplam: calculatedGrand,
        durum: 'KONTROL BEKLEYOR',
        kalemler: linkedItems,
        evrakUrl: ftAttachmentUrl || undefined,
        imzaliEvrakUrl: ftSignedAttachmentUrl || undefined,
        bagliIrsaliyeler: [],
      };
      setFaturalar(prev => [newFt, ...prev]);
    }

    checkAndSuggestCari(ftSupplier);

    if (cariResolved.cariKartId) {
      appendCariIslemOnce(
        setCariIslemGecmisi,
        buildCariEvrakHistory({
          cariKartId: cariResolved.cariKartId,
          islemTipi: 'FATURA',
          islemId: recordId,
          islemBaslik: 'Fatura Kaydı',
          islemDetay: `${ftNo} · ${ftSupplier} · ₺${calculatedGrand.toLocaleString('tr-TR')}`,
          tarih: ftDate,
          belgeNo: ftNo,
          tutar: calculatedGrand,
        })
      );
    }

    const stokLink = countLinkedStok(linkedItems);
    if (addNotification) {
      addNotification(
        `${ftNo} fatura kaydedildi. Cari: ${cariResolved.matched ? 'bağlı' : 'önerildi'} · Stok: ${stokLink.linked}/${stokLink.total}`
      );
    }

    setFtNo("");
    setFtSupplier("");
    setFtItems([]);
    setFtAttachmentUrl(null);
    setFtSignedAttachmentUrl(null);
    alert(
      `Fatura kaydedildi.\nCari: ${cariResolved.matched ? 'bağlı' : 'kart önerildi'}\nStok eşleşmesi: ${stokLink.linked}/${stokLink.total}`
    );
  };

  const handlePreviewPdf = (ft: Fatura) => {
    const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Kibritçi İnşaat - Fatura Raporu: ${ft.faturaNo}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
            .corporate-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 25px; }
            .logo { font-weight: 900; font-size: 22px; color: #1e3a8a; display: flex; align-items: center; gap: 8px; }
            .logo svg { fill: #1e3a8a; }
            .title-area { text-align: right; }
            .title-area h2 { margin: 0; font-size: 16px; color: #0f172a; }
            .title-area p { margin: 2px 0 0 0; font-size: 10px; font-weight: bold; color: #64748b; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
            .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; font-size: 11px; }
            .info-card h4 { margin: 0 0 8px 0; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; font-size: 12px; }
            .info-card p { margin: 4px 0; font-weight: 500; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; }
            .items-table th { background-color: #1e3a8a; color: white; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
            .items-table td { border-bottom: 1px solid #e2e8f0; padding: 10px; font-size: 11px; font-weight: 500; }
            .items-table tr:nth-child(even) { background-color: #f8fafc; }
            .total-section { float: right; width: 280px; margin-top: 20px; font-size: 11px; }
            .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-weight: 500; }
            .grand-total { font-weight: bold; color: #1e3a8a; border-bottom: 2px double #1e3a8a; font-size: 12px; }
            .signatures-title { margin-top: 180px; font-size: 11px; font-weight: bold; color: #1e3a8a; border-bottom: 2px dashed #cbd5e1; padding-bottom: 5px; text-transform: uppercase; }
            .signatures-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 15px; }
            .sig-col { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; font-size: 10px; background: #fff; min-height: 80px; display: flex; flex-direction: column; justify-content: space-between; }
            .sig-title { font-weight: bold; color: #475569; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="corporate-header">
            <div class="logo">
              ${kibritciLogoHtml(48)}
            </div>
            <div class="title-area">
              <h2>RESMİ FATURA İNCELEME FORMU</h2>
              <p>FATURA NO: ${ft.faturaNo}</p>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-card">
              <h4>📋 FATURA DETAYI</h4>
              <p><strong>Tarih:</strong> ${ft.tarih}</p>
              <p><strong>Cari Ünvan:</strong> ${ft.cariUnvan}</p>
              <p><strong>Bağlı Sipariş (PO):</strong> ${ft.saId || 'BAĞLANTI YOK'}</p>
            </div>
            <div class="info-card">
              <h4>🚛 SEVKİYAT İLİŞKİLERİ</h4>
              <p><strong>Bağlı İrsaliye Sayısı:</strong> ${ft.bagliIrsaliyeler ? ft.bagliIrsaliyeler.length : 0}</p>
              <p><strong>Bağlı Belgeler:</strong> ${ft.bagliIrsaliyeler ? ft.bagliIrsaliyeler.join(', ') : 'Yok'}</p>
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th>Malzeme / Hizmet Adı</th>
                <th style="text-align: right;">Miktar</th>
                <th style="text-align: right;">Birim Fiyat</th>
                <th style="text-align: right;">KDV %</th>
                <th style="text-align: right;">Tutar (KDV Hariç)</th>
              </tr>
            </thead>
            <tbody>
              ${ft.kalemler.map(x => `
                <tr>
                  <td>${x.urunAdi}</td>
                  <td style="text-align: right;">${x.miktar} ${x.birim}</td>
                  <td style="text-align: right;">${x.birimFiyat.toLocaleString('tr-TR')} TL</td>
                  <td style="text-align: right;">%${x.kdvOran}</td>
                  <td style="text-align: right;">${x.toplam.toLocaleString('tr-TR')} TL</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total-section">
            <div class="total-row">
              <span>Toplam Matrah:</span>
              <span>${ft.toplamTutar.toLocaleString('tr-TR')} TL</span>
            </div>
            <div class="total-row">
              <span>Hesaplanan KDV:</span>
              <span>${ft.kdvTutar.toLocaleString('tr-TR')} TL</span>
            </div>
            <div class="total-row grand-total">
              <span>GENEL TOPLAM (KDV Dahil):</span>
              <span>${ft.genelToplam.toLocaleString('tr-TR')} TL</span>
            </div>
          </div>

          <div class="signatures-title">🖋️ ONAY VE İMZA KANALLARI</div>
          <div class="signatures-grid">
            <div class="sig-col">
              <span class="sig-title">Hazırlayan</span>
              <span style="font-weight:bold; color:#0f172a; margin-top:10px;">${currentUser?.email ? currentUser.email.split('@')[0].toUpperCase() : 'ŞANTİYE'}</span>
            </div>
            <div class="sig-col">
              <span class="sig-title">Muhasebe</span>
              <span style="color:#94a3b8; font-style:italic;">İmza Yetkisi</span>
            </div>
            <div class="sig-col">
              <span class="sig-title">Satın Alma Md.</span>
              <span style="color:#94a3b8; font-style:italic;">İmza Yetkisi</span>
            </div>
            <div class="sig-col">
              <span class="sig-title">Şantiye Şefi</span>
              <span style="color:#10b981; font-weight:850; margin-top:10px;">✓ ONAYLANDI</span>
            </div>
            <div class="sig-col">
              <span class="sig-title">Proje Müdürü</span>
              <span style="color:#10b981; font-weight:850; margin-top:10px;">✓ ONAYLANDI</span>
            </div>
          </div>
        </body>
      </html>
    `;
    const withToolbar = htmlContent.replace(
      '<body>',
      `<body>${getReportEmailToolbarHtml({
        subject: `Kibritçi Fatura — ${ft.faturaNo || ''}`,
        fileName: `Kibritci_Fatura_${ft.faturaNo || 'rapor'}.html`,
      })}`
    );
    openHtmlReportWindow(withToolbar, `Fatura ${ft.faturaNo}`);
  };

  const handleFaturaArchiveReport = () => {
    const rows = [...faturalar]
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))
      .map((ft, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${ft.tarih || '-'}</td>
          <td>${ft.faturaNo || '-'}</td>
          <td>${ft.cariUnvan || '-'}</td>
          <td style="text-align:right">${Number(ft.genelToplam || 0).toLocaleString('tr-TR')} TL</td>
          <td>${ft.evrakUrl ? 'Var' : 'Yok'}</td>
          <td>${ft.imzaliEvrakUrl ? 'Var' : 'Yok'}</td>
        </tr>
      `)
      .join('');

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Fatura Evrak Arşiv Raporu</title>
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
          ${getReportEmailToolbarHtml({ subject: 'Fatura Evrak Arşiv Raporu', fileName: 'Kibritci_Fatura_Arsiv.html' })}
          <div style="margin-bottom:12px;">${kibritciLogoHtml(44)}</div>
          <h1 style="font-size:14px;margin:0 0 8px;">FATURA EVRAK ARŞİV RAPORU</h1>
          <p>Kayıt sayısı: ${faturalar.length} • Üretim: ${new Date().toLocaleString('tr-TR')}</p>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Tarih</th><th>Fatura No</th><th>Firma</th><th>Genel Toplam</th><th>Evrak</th><th>İmzalı</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
    openHtmlReportWindow(html, 'Fatura Evrak Arşiv Raporu');
  };

  const filteredArchive = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase('tr-TR');
    return [...faturalar]
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))
      .filter((ft) => {
        if (archiveFilter === 'BAGIMSIZ' && faturaIsLinked(ft)) return false;
        if (archiveFilter === 'CARI_YOK' && ft.cariKartId) return false;
        if (
          archiveFilter === 'KAPI' &&
          !(ft.donusumKaynagi === 'KAPI_EVRAK' || ft.kaynak === 'KAPI_EVRAK' || ft.guvenlikEvrakId)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          String(ft.faturaNo || '').toLocaleLowerCase('tr-TR').includes(q) ||
          String(ft.cariUnvan || '').toLocaleLowerCase('tr-TR').includes(q) ||
          String(ft.durum || '').toLocaleLowerCase('tr-TR').includes(q)
        );
      })
      .slice(0, 200);
  }, [faturalar, searchTerm, archiveFilter]);

  const bagimsizFaturalar = faturalar.filter(ft => !faturaIsLinked(ft));

  const ftAra = ftItems.reduce((s, i) => s + i.miktar * i.birimFiyat, 0);
  const ftKdv = ftItems.reduce((s, i) => s + i.miktar * i.birimFiyat * (i.kdvOran / 100), 0);

  const clearFaturaForm = () => {
    setFtItems([]);
    setFtNo('');
    setFtSupplier('');
    setFtAttachmentUrl(null);
    setFtSignedAttachmentUrl(null);
    setEditingFtId(null);
    setEditBagliIrsaliyeIds([]);
    setAddBagliIrId('');
    setTempItem({ name: '', qty: 0, unit: 'ADET', price: 0, kdv: 20 });
  };

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="ft"
        eyebrow="Gider faturası"
        title="Faturalar"
        subtitle={`${faturalar.length} kayıt · ${bagimsizFaturalar.length} bağımsız`}
      />

      {(
        <div className="flex flex-col gap-5">
          <MuhasebeBelgeForm
            variant="fatura"
            editing={Boolean(editingFtId)}
            onClear={clearFaturaForm}
            onSave={handleSaveFatura}
            saveLabel={editingFtId ? 'Faturayı güncelle' : 'Faturayı kaydet'}
            ai={
              <MuhasebeAiButton
                loading={isFtParsing}
                error={ftParseError}
                success={ftParseSuccess}
                onFile={processFaturaAi}
              />
            }
            fields={
              <>
                <MuhasebeField label="Cari / tedarikçi *" span={2}>
                  <input
                    type="text"
                    list="ft-cari-list"
                    placeholder="Firma ünvanı"
                    value={ftSupplier}
                    onChange={(e) => setFtSupplier(e.target.value)}
                    className={muhasebeInputClass}
                  />
                  <datalist id="ft-cari-list">
                    {cariKartlar.map((c) => (
                      <option key={c.id} value={c.unvan} />
                    ))}
                  </datalist>
                </MuhasebeField>
                <MuhasebeField label="Fatura no *">
                  <input
                    type="text"
                    placeholder="FAT-2026-…"
                    value={ftNo}
                    onChange={(e) => setFtNo(e.target.value)}
                    className={muhasebeInputClass}
                  />
                </MuhasebeField>
                <MuhasebeField label="Düzenleme tarihi">
                  <input type="date" value={ftDate} onChange={(e) => setFtDate(e.target.value)} className={muhasebeInputClass} />
                </MuhasebeField>
              </>
            }
            extraFields={
              editingFtId ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-bold text-slate-500 uppercase tracking-wide">Bağlı irsaliye</span>
                  {editBagliIrsaliyeIds.map((id) => {
                    const ir = irsaliyeler.find((x) => x.id === id || x.irsaliyeNo === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                        {ir?.irsaliyeNo || id}
                        <button type="button" className="text-rose-600 cursor-pointer" onClick={() => setEditBagliIrsaliyeIds((p) => p.filter((x) => x !== id))}>
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <select
                    value={addBagliIrId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setEditBagliIrsaliyeIds((prev) => (prev.includes(v) ? prev : [...prev, v]));
                      setAddBagliIrId('');
                    }}
                    className={`${muhasebeInputClass} w-auto min-w-[200px]`}
                  >
                    <option value="">İrsaliye ekle…</option>
                    {irsaliyeler
                      .filter((ir) => !editBagliIrsaliyeIds.includes(ir.id) && !editBagliIrsaliyeIds.includes(ir.irsaliyeNo))
                      .slice(0, 80)
                      .map((ir) => (
                        <option key={ir.id} value={ir.id}>
                          {ir.irsaliyeNo} · {ir.firma}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null
            }
            itemsTable={
              <MuhasebeKalemTablosu variant="fatura" onAdd={handleAddItem} addDisabled={!tempItem.name || tempItem.qty <= 0}>
                {ftItems.map((p) => (
                  <MuhasebeKalemRow key={p.id} onRemove={() => setFtItems((prev) => prev.filter((x) => x.id !== p.id))}>
                    <td className="px-2 py-1">
                      <input
                        className={muhasebeInputClass}
                        value={p.urunAdi}
                        onChange={(e) =>
                          setFtItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, urunAdi: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={muhasebeInputClass}
                        value={p.miktar || ''}
                        onChange={(e) => {
                          const miktar = Number(e.target.value) || 0;
                          setFtItems((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, miktar, toplam: miktar * x.birimFiyat } : x))
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={muhasebeInputClass}
                        value={p.birim}
                        onChange={(e) =>
                          setFtItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, birim: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={muhasebeInputClass}
                        value={p.birimFiyat || ''}
                        onChange={(e) => {
                          const birimFiyat = Number(e.target.value) || 0;
                          setFtItems((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, birimFiyat, toplam: x.miktar * birimFiyat } : x))
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className={muhasebeInputClass}
                        value={p.kdvOran}
                        onChange={(e) =>
                          setFtItems((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, kdvOran: Number(e.target.value) } : x))
                          )
                        }
                      >
                        <option value={20}>%20</option>
                        <option value={10}>%10</option>
                        <option value={1}>%1</option>
                        <option value={0}>%0</option>
                      </select>
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-semibold">
                      {(p.miktar * p.birimFiyat).toLocaleString('tr-TR')} TL
                    </td>
                  </MuhasebeKalemRow>
                ))}
                <MuhasebeKalemRow>
                  <td className="px-2 py-1">
                    <input
                      list="ft-stok-list"
                      className={muhasebeInputClass}
                      placeholder="Ürün veya hizmet"
                      value={tempItem.name}
                      onChange={(e) => setTempItem((prev) => ({ ...prev, name: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                    />
                    <datalist id="ft-stok-list">
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
                      value={tempItem.qty || ''}
                      onChange={(e) => setTempItem((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className={muhasebeInputClass}
                      value={tempItem.unit}
                      onChange={(e) => setTempItem((prev) => ({ ...prev, unit: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className={muhasebeInputClass}
                      placeholder="0,00"
                      value={tempItem.price || ''}
                      onChange={(e) => setTempItem((prev) => ({ ...prev, price: Number(e.target.value) }))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className={muhasebeInputClass}
                      value={tempItem.kdv}
                      onChange={(e) => setTempItem((prev) => ({ ...prev, kdv: Number(e.target.value) }))}
                    >
                      <option value={20}>%20</option>
                      <option value={10}>%10</option>
                      <option value={1}>%1</option>
                      <option value={0}>%0</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-400">
                    {(tempItem.qty * tempItem.price || 0).toLocaleString('tr-TR')}
                  </td>
                </MuhasebeKalemRow>
              </MuhasebeKalemTablosu>
            }
            attachments={
              <div className="flex flex-wrap gap-2">
                <MuhasebeAttach
                  label="Fatura belgesi"
                  loaded={Boolean(ftAttachmentUrl)}
                  onFile={handleFileChange}
                  previewUrl={ftAttachmentUrl}
                  onPreview={() => openEvrakTarama(ftAttachmentUrl, ftNo || 'Fatura taraması')}
                />
                <MuhasebeAttach
                  label="İmzalı nüsha"
                  loaded={Boolean(ftSignedAttachmentUrl)}
                  onFile={handleSignedFileChange}
                  previewUrl={ftSignedAttachmentUrl}
                  onPreview={() => openEvrakTarama(ftSignedAttachmentUrl, 'İmzalı fatura')}
                />
              </div>
            }
            totals={<MuhasebeTotals araToplam={ftAra} kdv={ftKdv} genel={ftAra + ftKdv} />}
          />

          <div className="flex-1 space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">💡 Finansal Uyarı</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Kaydedilen faturalar cari/stok kartlarına bağlanır; arşivden düzenleyip raporlayabilirsiniz.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Fatura Evrak Arşivi</h4>
                <div className="flex items-center gap-2">
                  <ReportEmailButton
                    className="text-[10px] bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer inline-flex items-center gap-1"
                    payload={() => ({
                      subject: 'Kibritçi — Fatura Evrak Arşiv Raporu',
                      body: `Fatura arşiv özeti\nKayıt sayısı: ${faturalar.length}\nÜretim: ${new Date().toLocaleString('tr-TR')}`,
                      fileName: 'Kibritci_Fatura_Arsiv.html',
                    })}
                  />
                  <button
                    type="button"
                    onClick={handleFaturaArchiveReport}
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
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="No / firma / durum ara…"
                    className="w-full text-[11px] font-semibold pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex gap-1">
                  {([
                    ['ALL', 'Tümü'],
                    ['KAPI', 'Kapı taraması'],
                    ['BAGIMSIZ', 'Bağımsız'],
                    ['CARI_YOK', 'Cari yok'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setArchiveFilter(id)}
                      className={`text-[10px] font-bold px-2.5 py-2 rounded-lg border cursor-pointer ${
                        archiveFilter === id
                          ? 'bg-blue-700 text-white border-blue-700'
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
                      <th className="px-2 py-2">Fatura No</th>
                      <th className="px-2 py-2">Firma</th>
                      <th className="px-2 py-2">Bağ</th>
                      <th className="px-2 py-2 text-right">Toplam</th>
                      <th className="px-2 py-2">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchive.map((ft) => {
                      const stokLink = countLinkedStok(ft.kalemler || []);
                      const linked = faturaIsLinked(ft);
                      return (
                        <tr key={ft.id} className="border-t border-slate-100 hover:bg-blue-50/50 transition-colors">
                          <td className="px-2 py-1.5">{ft.tarih || '-'}</td>
                          <td className="px-2 py-1.5 font-semibold">{ft.faturaNo}</td>
                          <td className="px-2 py-1.5">{ft.cariUnvan}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit ${ft.cariKartId ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {ft.cariKartId ? 'Cari' : 'Cari yok'}
                              </span>
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit ${linked ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                {linked ? 'Evrak bağlı' : 'Bağımsız'}
                              </span>
                              {resolveFaturaProvenance(ft).map((b) => (
                                <span key={b.label} className={b.className} title={b.title}>
                                  {b.label}
                                </span>
                              ))}
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit bg-slate-50 text-slate-600">
                                Stok {stokLink.linked}/{stokLink.total}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{Number(ft.genelToplam || 0).toLocaleString('tr-TR')} TL</td>
                          <td className="px-2 py-1.5">
                            <div className="flex gap-1 items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFtId(ft.id);
                                  setFtNo(ft.faturaNo || '');
                                  setFtDate(ft.tarih || new Date().toISOString().slice(0, 10));
                                  setFtSupplier(ft.cariUnvan || '');
                                  setFtItems(ft.kalemler || []);
                                  setFtAttachmentUrl(ft.evrakUrl || null);
                                  setFtSignedAttachmentUrl(ft.imzaliEvrakUrl || null);
                                  setEditBagliIrsaliyeIds([...(ft.bagliIrsaliyeler || [])]);
                                  setAddBagliIrId('');
                                }}
                                className="text-[10px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded px-2 py-1 font-bold cursor-pointer"
                              >
                                Düzenle
                              </button>
                              {ft.evrakUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openEvrakTarama(ft.evrakUrl, ft.faturaNo || 'Fatura taraması')}
                                  className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded px-2 py-1 font-bold cursor-pointer"
                                >
                                  Tarama
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handlePreviewPdf(ft)}
                                className="text-[10px] bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded px-2 py-1 font-bold cursor-pointer"
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
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400 italic">
                          Filtreye uyan fatura yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

    </EvrakPageShell>
  );
};

export default FaturaGirisScreen;
