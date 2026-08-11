import React, { useMemo, useState, useRef } from 'react';
import { 
  Wallet, ArrowUpRight, ArrowDownRight, Printer,
  Calendar, FileText, Search, Eye, Image as ImageIcon, AlertCircle,
  Pencil, Trash2, Mail, Upload, BookOpen,
} from 'lucide-react';
import { KasaHareketi, KasaOdemeDurumu, Personel, AylikYoklamaMap } from '../types/erp';
import { ImageLightbox } from './ImageLightbox';
import { exportKasaExcel, buildKasaExcelBuffer, exportKasaDefterExcel, exportKasaHaftalikIcmalExcel } from '../lib/kasaExcelExport';
import { saveDocument } from '../lib/firebase';
import {
  ensureKasaFisFotoPersisted,
  isKasaFisPdfUrl,
  KASA_FIS_EVRAK_ACCEPT,
  prepareKasaFisEvrakFromFile,
} from '../lib/sahaFaaliyetFotoStorage';
import { todayDateKey } from '../lib/dateKeyUtils';
import {
  isSoforIadeKasaHareketi,
  isSoforKaynakliKasaHareketi,
  isSoforUzerindenKasaGideri,
  resolveKasaOdemeDurumu,
} from '../lib/yolHarcamaUtils';
import { resolvePersonelUnvan } from '../lib/personelUnvanUtils';
import { prepareKasaLedgerExportData } from '../lib/kasaLedgerUtils';

type HarcamaKaynagi = 'KASA_HARCAMA' | 'PERSONEL_HARCAMA';

const ODEME_OPTIONS: { id: KasaOdemeDurumu; label: string; short: string; hint: string }[] = [
  {
    id: 'BORC',
    label: 'BORÇ',
    short: 'Borç',
    hint: 'Kasaya yazılır — genelde firmaya borç (personel zorunlu değil)',
  },
  {
    id: 'PERSONEL_ODEDI',
    label: 'PERSONEL ÖDEDİ',
    short: 'Personel',
    hint: 'Personel cebinden ödedi (kasa ödemedi)',
  },
  {
    id: 'KASA_ODEDI',
    label: 'KASA ÖDEDİ',
    short: 'Kasa',
    hint: 'Şirket kasasından ödendi',
  },
];

function odemeDurumuLabel(d?: KasaOdemeDurumu | null): string {
  if (d === 'BORC') return 'BORÇ';
  if (d === 'PERSONEL_ODEDI') return 'PERSONEL ÖDEDİ';
  if (d === 'KASA_ODEDI') return 'KASA ÖDEDİ';
  return '';
}

/** Eski kayıtlardan ödeme durumunu çıkar */
function resolveOdemeDurumu(kh: KasaHareketi): KasaOdemeDurumu | null {
  return resolveKasaOdemeDurumu(kh);
}

function harcamaKaynagiFromOdeme(d: KasaOdemeDurumu): HarcamaKaynagi {
  return d === 'KASA_ODEDI' ? 'KASA_HARCAMA' : 'PERSONEL_HARCAMA';
}

/** Yalnızca personel cebinden ödediyse personel zorunlu; BORÇ firmaya da olabilir */
function personelZorunluMu(d: KasaOdemeDurumu | ''): boolean {
  return d === 'PERSONEL_ODEDI';
}

function personelAlanGoster(d: KasaOdemeDurumu | ''): boolean {
  return d === 'PERSONEL_ODEDI' || d === 'BORC';
}

function formatKasaSaveError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (
    low.includes('failed to fetch dynamically imported module') ||
    low.includes('importing a module script failed') ||
    low.includes('error loading dynamically imported module')
  ) {
    return 'Sayfa güncellenmiş (eski önbellek). Ctrl+F5 ile yenileyip kaydı tekrar deneyin.';
  }
  if (low.includes('permission') || low.includes('oturum yetkisiz')) {
    return 'Oturum yetkisiz. E-posta ile yeniden giriş yapıp tekrar deneyin.';
  }
  return msg || 'Bilinmeyen hata';
}

interface KasaScreenProps {
  kasaHareketleri: KasaHareketi[];
  setKasaHareketleri: React.Dispatch<React.SetStateAction<KasaHareketi[]>>;
  deleteKasaHareketi?: (id: string) => Promise<void>;
  personeller?: Personel[];
  yoklamalar?: AylikYoklamaMap;
}

function defaultWeekRange(): { start: string; end: string } {
  const end = todayDateKey();
  const d = new Date(`${end}T12:00:00`);
  d.setDate(d.getDate() - 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { start: `${y}-${m}-${day}`, end };
}

export const KasaScreen: React.FC<KasaScreenProps> = ({ 
  kasaHareketleri, 
  setKasaHareketleri,
  deleteKasaHareketi,
  personeller = [],
  yoklamalar = {},
}) => {
  const week0 = defaultWeekRange();
  // Exact layout filters matching top of table in the screenshot
  const [startDate, setStartDate] = useState(week0.start);
  const [endDate, setEndDate] = useState(week0.end);
  const [appliedStartDate, setAppliedStartDate] = useState(week0.start);
  const [appliedEndDate, setAppliedEndDate] = useState(week0.end);
  const [searchKeyword, setSearchKeyword] = useState("");

  // Form Fields
  const [newDate, setNewDate] = useState(todayDateKey());
  const [newType, setNewType] = useState<'GİRİŞ' | 'ÇIKIŞ'>("GİRİŞ");
  const [newAmount, setNewAmount] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRefType, setNewRefType] = useState<'DİĞER' | 'FATURA' | 'İRSALİYE' | 'MAAS' | 'SATIN ALMA'>("DİĞER");
  const [newRefId, setNewRefId] = useState("");
  const [newOdemeDurumu, setNewOdemeDurumu] = useState<KasaOdemeDurumu | ''>('');
  const [newPersonelId, setNewPersonelId] = useState('');
  const [personelArama, setPersonelArama] = useState('');
  
  // File Upload State
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected receipt for preview modal
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);
  const [selectedReceiptName, setSelectedReceiptName] = useState<string | null>(null);

  // Weekly Cash Report Print Modal Toggle
  const [exportingKasaExcel, setExportingKasaExcel] = useState(false);
  const [exportingKasaDefter, setExportingKasaDefter] = useState(false);
  const [exportingKasaIcmal, setExportingKasaIcmal] = useState(false);
  const [printingGunlukRapor, setPrintingGunlukRapor] = useState(false);
  const [importingKasaDefter, setImportingKasaDefter] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const kasaDefterImportRef = useRef<HTMLInputElement>(null);
  const [sendingKasaEmail, setSendingKasaEmail] = useState(false);
  const [savingKasa, setSavingKasa] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const handleGunlukYoklamaKasaRaporu = async () => {
    if (printingGunlukRapor) return;
    setPrintingGunlukRapor(true);
    try {
      const { buildGunlukYoklamaKasaRaporHtml, openGunlukYoklamaKasaRaporHtml } = await import(
        '../lib/kasaGunlukRapor'
      );
      const today = todayDateKey();
      const html = buildGunlukYoklamaKasaRaporHtml({
        personeller,
        yoklamalar,
        kasaHareketleri,
        dateKey: today,
      });
      openGunlukYoklamaKasaRaporHtml(html, `Bugünkü Yoklama + Kasa — ${today}`);
    } catch (err) {
      console.error('[kasa-gunluk-rapor]', err);
      alert(
        'Günlük rapor oluşturulamadı:\n' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setPrintingGunlukRapor(false);
    }
  };

  const buildAralikHarcamaBundle = async () => {
    const {
      filterKasaCikisHareketleri,
      buildKasaHarcamaAralikReportHtml,
    } = await import('../lib/yolHarcamaUtils');
    const start = appliedStartDate;
    const end = appliedEndDate;
    const rows = filterKasaCikisHareketleri(kasaHareketleri, start, end);
    if (rows.length === 0) {
      alert('Seçili aralıkta kasa çıkışı / harcama kaydı yok. Önce tarih aralığını filtreleyin.');
      return null;
    }
    const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
    const html = await buildKasaHarcamaAralikReportHtml({
      startDate: start,
      endDate: end,
      items: rows,
      olusturan: 'Haftalık Kasa',
    });
    return { html, start, end, toplam, rows };
  };

  const handleKasaDefterImport = async (file: File) => {
    if (importingKasaDefter) return;
    setImportingKasaDefter(true);
    setImportProgress('Excel okunuyor…');
    try {
      const buffer = await file.arrayBuffer();
      const {
        parseKasaDefterWorkbook,
        buildLegacyKasaHareketleri,
        formatKasaDefterImportSummary,
        importKasaDefterFromBuffer,
      } = await import('../lib/kasaDefterImportExport');

      const parse = await parseKasaDefterWorkbook(buffer);
      const importOpts = { minTarih: '2026-01-01' as string | undefined };
      const only2026 = window.confirm(
        `${file.name} dosyası okundu (${parse.rows.length} satır).\n\n` +
          'Varsayılan: yalnızca 2026 ve sonrası kayıtlar aktarılır (mevcut kayıtlara dokunulmaz).\n\n' +
          'Tamam = 2026+  |  İptal = tüm yıllar'
      );
      if (!only2026) importOpts.minTarih = undefined;

      const previewPlan = buildLegacyKasaHareketleri(parse.rows, kasaHareketleri, importOpts);
      const summary = formatKasaDefterImportSummary(parse, previewPlan, importOpts);

      if (previewPlan.toImport.length === 0) {
        alert(`İçe aktarılacak yeni kayıt yok.\n\n${summary}`);
        return;
      }

      const ok = window.confirm(
        `${file.name} dosyasından ${previewPlan.toImport.length} yeni geçmiş kasa hareketi aktarılacak.\n\n` +
          `${summary}\n\n` +
          'Mevcut kayıtlar değiştirilmez; yalnızca yeni satırlar eklenir.\n\nDevam edilsin mi?'
      );
      if (!ok) return;

      setImportProgress(`0 / ${previewPlan.toImport.length}`);
      const { plan, saved } = await importKasaDefterFromBuffer(buffer, kasaHareketleri, {
        ...importOpts,
        onProgress: (done, total) => setImportProgress(`${done} / ${total}`),
      });

      if (saved > 0) {
        setKasaHareketleri((prev) => {
          const ids = new Set(prev.map((k) => k.id));
          const merged = [...prev];
          for (const kh of plan.toImport) {
            if (!ids.has(kh.id)) merged.push(kh);
          }
          return merged.sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));
        });
      }

      alert(
        saved > 0
          ? `${saved} geçmiş kasa hareketi aktarıldı.\n\n${formatKasaDefterImportSummary(parse, plan, importOpts)}`
          : `Yeni kayıt eklenmedi.\n\n${formatKasaDefterImportSummary(parse, plan, importOpts)}`
      );
    } catch (err) {
      console.error('[kasa-defter-import]', err);
      alert(
        'Kasa defteri içe aktarılamadı:\n' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setImportProgress('');
      setImportingKasaDefter(false);
      if (kasaDefterImportRef.current) kasaDefterImportRef.current.value = '';
    }
  };

  const handleAralikHarcamaRaporu = async () => {
    const { openSoforMasrafIadeReport } = await import('../lib/yolHarcamaUtils');
    const bundle = await buildAralikHarcamaBundle();
    if (!bundle) return;
    openSoforMasrafIadeReport(bundle.html, 'Kasa Harcama Raporu');
  };

  const handleAralikHarcamaEmail = async () => {
    if (sendingKasaEmail) return;
    const { emailKasaHarcamaAralikReport } = await import('../lib/yolHarcamaUtils');
    const { KASA_REPORT_FORMAT } = await import('../lib/kasaReportTheme');
    const bundle = await buildAralikHarcamaBundle();
    if (!bundle) return;
    setSendingKasaEmail(true);
    try {
      let excelBuffer: ArrayBuffer | null = null;
      try {
        excelBuffer = await buildKasaExcelBuffer(
          hareketlerInRange.filter(
            (kh) => kh.tarih >= bundle.start && kh.tarih <= bundle.end
          ),
          bundle.start,
          bundle.end,
          personeller,
          kasaHareketleri
        );
      } catch (err) {
        console.warn('[kasa-email-excel]', err);
      }
      await emailKasaHarcamaAralikReport({
        html: bundle.html,
        startDate: bundle.start,
        endDate: bundle.end,
        toplam: bundle.toplam,
        items: bundle.rows,
        excelBuffer,
        excelFileName: `${KASA_REPORT_FORMAT.excel.filePrefix}_${bundle.start}_${bundle.end}.xlsx`,
        downloadExcel: excelBuffer
          ? () =>
              exportKasaExcel(
                hareketlerInRange.filter(
                  (kh) => kh.tarih >= bundle.start && kh.tarih <= bundle.end
                ),
                bundle.start,
                bundle.end,
                personeller,
                kasaHareketleri
              )
          : undefined,
      });
    } catch (err) {
      console.error('[kasa-email]', err);
      alert(
        'E-posta hazırlanamadı:\n' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSendingKasaEmail(false);
    }
  };

  // Filter records in range and search text keyword match (mükerrer legacy/program kayıtları ayıklanır)
  const ledgerExport = useMemo(
    () => prepareKasaLedgerExportData(kasaHareketleri, appliedStartDate, appliedEndDate),
    [kasaHareketleri, appliedStartDate, appliedEndDate]
  );

  const hareketlerInRange = ledgerExport.inRange;
  const openingBalance = ledgerExport.opening;

  const filteredHareketler = useMemo(
    () =>
      hareketlerInRange.filter((kh) => {
        if (searchKeyword.trim()) {
          const kw = searchKeyword.toLowerCase();
          const matchDesc = kh.aciklama.toLowerCase().includes(kw);
          const matchType = kh.referansTipi.toLowerCase().includes(kw);
          const matchId = (kh.referansId || '').toLowerCase().includes(kw);
          const matchSurucu = String(kh.surucu || '')
            .toLowerCase()
            .includes(kw);
          const matchPersonel = String(kh.personelAdi || '')
            .toLowerCase()
            .includes(kw);
          return matchDesc || matchType || matchId || matchSurucu || matchPersonel;
        }
        return true;
      }),
    [hareketlerInRange, searchKeyword]
  );

  // KPI: seçili aralık (filtre) üzerinden — şoför onaylı çıkışlar eksi bakiyeye yansır
  const totalIn = filteredHareketler
    .filter((k) => k.hareketTipi === 'GİRİŞ')
    .reduce((sum, current) => sum + current.tutar, 0);

  const totalOut = filteredHareketler
    .filter((k) => k.hareketTipi === 'ÇIKIŞ')
    .reduce((sum, current) => sum + current.tutar, 0);

  /** Tüm kasa çıkışları — tek “Kasa Harcaması” kartı (BORÇ + Personel + Kasa ödedi) */
  const kasaHarcamaOut = totalOut;
  const cikisKayitSayisi = filteredHareketler.filter((k) => k.hareketTipi === 'ÇIKIŞ').length;

  /** Seçili aralık — BORÇ / Personel Ödedi / Kasa Ödedi + kişi kırılımı */
  const odemeBazliOzet = useMemo(() => {
    type Row = {
      key: string;
      label: string;
      tutar: number;
      durum: KasaOdemeDurumu;
    };
    const buckets = new Map<string, Row>();
    const totals: Record<KasaOdemeDurumu, number> = {
      BORC: 0,
      PERSONEL_ODEDI: 0,
      KASA_ODEDI: 0,
    };

    const add = (key: string, label: string, durum: KasaOdemeDurumu, tutar: number) => {
      totals[durum] += tutar;
      const prev = buckets.get(key);
      if (prev) prev.tutar += tutar;
      else buckets.set(key, { key, label, tutar, durum });
    };

    for (const kh of filteredHareketler) {
      if (kh.hareketTipi !== 'ÇIKIŞ') continue;
      const tutar = Number(kh.tutar) || 0;
      if (tutar <= 0) continue;
      const durum = resolveOdemeDurumu(kh) || 'KASA_ODEDI';

      if (durum === 'KASA_ODEDI') {
        add('kasa-odedi', 'KASA ÖDEDİ', 'KASA_ODEDI', tutar);
        continue;
      }
      const unvan = resolvePersonelUnvan(
        {
          personelId: kh.personelId,
          personelAdi: kh.personelAdi,
          surucu: kh.surucu,
        },
        personeller
      );
      if (durum === 'BORC') {
        add(`borc:${unvan.key}`, `BORÇ · ${unvan.label}`, 'BORC', tutar);
        continue;
      }
      add(
        `podedi:${unvan.key}`,
        `${unvan.label} · PERSONEL ÖDEDİ`,
        'PERSONEL_ODEDI',
        tutar
      );
    }

    const satirlar = [...buckets.values()].sort((a, b) => {
      const order = { BORC: 0, PERSONEL_ODEDI: 1, KASA_ODEDI: 2 };
      if (order[a.durum] !== order[b.durum]) return order[a.durum] - order[b.durum];
      return b.tutar - a.tutar || a.label.localeCompare(b.label, 'tr');
    });

    return { satirlar, totals };
  }, [filteredHareketler, personeller]);

  const openFisLightbox = (url?: string | null, title?: string) => {
    const u = String(url || '').trim();
    if (!u) return;
    setSelectedReceiptUrl(u);
    setSelectedReceiptName(title || 'Fiş / Fatura');
  };
  const personelSecenekleri = useMemo(() => {
    const q = personelArama.trim().toLocaleLowerCase('tr-TR');
    const list = (personeller || [])
      .filter((p) => {
        const durum = String(p.durum || '').toLocaleUpperCase('tr-TR');
        if (durum.includes('ÇIKIŞ') || durum.includes('PASIF') || durum.includes('PASİF')) return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        label: `${p.ad || ''} ${p.soyad || ''}`.trim() || p.tcNo || p.id,
        gorev: p.gorev || '',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
    if (!q) return list.slice(0, 200);
    return list
      .filter((p) => p.label.toLocaleLowerCase('tr-TR').includes(q) || p.gorev.toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, 200);
  }, [personeller, personelArama]);

  const selectedPersonelLabel = useMemo(() => {
    if (!newPersonelId) return '';
    const p = (personeller || []).find((x) => x.id === newPersonelId);
    if (!p) return '';
    return `${p.ad || ''} ${p.soyad || ''}`.trim() || p.tcNo || p.id;
  }, [personeller, newPersonelId]);

  // Handle Drag & Drop Events
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
      void processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = async (file: File) => {
    try {
      setUploadedFileName(file.name);
      const prepared = await prepareKasaFisEvrakFromFile(file);
      setUploadedFileBase64(prepared);
    } catch (err) {
      setUploadedFileName(null);
      setUploadedFileBase64(null);
      alert(err instanceof Error ? err.message : 'Evrak yüklenemedi.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === "") return;
    if (e.target.files && e.target.files[0]) {
      void processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearKasaForm = () => {
    setEditingId(null);
    setNewDate(todayDateKey());
    setNewType('GİRİŞ');
    setNewAmount('');
    setNewDesc('');
    setNewRefType('DİĞER');
    setNewRefId('');
    setNewOdemeDurumu('');
    setNewPersonelId('');
    setPersonelArama('');
    setUploadedFileName(null);
    setUploadedFileBase64(null);
  };

  const loadKasaForEdit = (kh: KasaHareketi) => {
    setEditingId(kh.id);
    setNewDate(kh.tarih);
    setNewType(kh.hareketTipi);
    setNewAmount(String(kh.tutar ?? ''));
    setNewDesc(kh.aciklama || '');
    setNewRefType(kh.referansTipi || 'DİĞER');
    setNewRefId(kh.referansId || '');
    const odeme = resolveOdemeDurumu(kh);
    setNewOdemeDurumu(odeme || (kh.hareketTipi === 'ÇIKIŞ' ? 'KASA_ODEDI' : ''));
    setNewPersonelId(kh.personelId || '');
    setPersonelArama(kh.personelAdi || kh.surucu || '');
    setUploadedFileBase64(null);
    setUploadedFileName(kh.fisEvrakUrl ? 'Mevcut fiş (değiştirmek için yeni seçin)' : null);
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDeleteKasaKayit = async (kh: KasaHareketi) => {
    if (!deleteKasaHareketi) {
      alert('Silme işlemi yapılandırılmamış.');
      return;
    }
    const soforKaynak = isSoforKaynakliKasaHareketi(kh);
    const msg = soforKaynak
      ? `Bu kayıt şoför/onay havuzu kaynağından gelmiş olabilir (${kh.id}).\n\nKasa defterinden kalıcı olarak silinsin mi?\n(Firestore: kasaHareketleri)`
      : `“${kh.aciklama || kh.id}” kaydı kalıcı olarak silinsin mi?\n(Firestore: kasaHareketleri)`;
    if (!window.confirm(msg)) return;
    try {
      await deleteKasaHareketi(kh.id);
      if (editingId === kh.id) clearKasaForm();
    } catch (err) {
      console.error('[kasa-delete]', err);
      alert(`Silinemedi: ${formatKasaSaveError(err)}`);
    }
  };

  // Safe validation & submit
  const handleSaveKasaHareketi = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountFloat = parseFloat(newAmount) || 0;
    if (amountFloat <= 0) {
      alert('Lütfen geçerli bir tutar yazın.');
      return;
    }
    if (!newDesc.trim()) {
      alert('Lütfen açıklama girin.');
      return;
    }
    if (newType === 'ÇIKIŞ') {
      if (!newOdemeDurumu) {
        alert('Çıkış kaydı için ödeme durumu seçin:\n• BORÇ\n• PERSONEL ÖDEDİ\n• KASA ÖDEDİ');
        return;
      }
      if (personelZorunluMu(newOdemeDurumu) && !newPersonelId) {
        alert('Bu durum için personel seçmeden kayıt yapılamaz.');
        return;
      }
    }
    if (savingKasa) return;

    setSavingKasa(true);
    try {
      const existing = editingId ? kasaHareketleri.find((k) => k.id === editingId) : undefined;
      const id = editingId || `kh_${Date.now()}`;

      let fisUrl = String(uploadedFileBase64 || '').trim();
      if (!fisUrl && existing?.fisEvrakUrl) {
        fisUrl = existing.fisEvrakUrl;
      }
      // Yeni çekilen/yüklenen data URL → Storage; mevcut https/storage URL dokunma
      if (fisUrl.startsWith('data:')) {
        try {
          const persisted = await ensureKasaFisFotoPersisted(id, fisUrl);
          if (persisted) {
            fisUrl = persisted;
          } else {
            const keep = window.confirm(
              'Fiş evrakı yüklenemedi (çok büyük veya ağ hatası).\nKayıt evraksız devam edilsin mi?'
            );
            if (!keep) return;
            fisUrl = '';
          }
        } catch (fotoErr) {
          console.warn('[kasa] fiş Storage atlandı:', fotoErr);
          const keep = window.confirm(
            'Fiş evrakı Storage’a taşınamadı.\nKayıt evraksız devam etsin mi?'
          );
          if (!keep) return;
          fisUrl = '';
        }
      }

      const record: KasaHareketi = {
        ...(existing || {}),
        id,
        tarih: newDate,
        hareketTipi: newType,
        tutar: amountFloat,
        aciklama: newDesc.trim(),
        referansTipi: newRefType,
        referansId: newRefId || undefined,
        fisEvrakUrl: fisUrl || undefined,
      };

      if (newType === 'ÇIKIŞ' && newOdemeDurumu) {
        record.odemeDurumu = newOdemeDurumu;
        record.harcamaKaynagi = harcamaKaynagiFromOdeme(newOdemeDurumu);
        const raporTip = newOdemeDurumu === 'KASA_ODEDI' ? 'KASA' : 'KENDI';
        record.masrafTipi = raporTip;
        if (isSoforKaynakliKasaHareketi(record)) {
          record.soforKasaHarcamasi = raporTip === 'KASA';
          record.soforOdemesi = raporTip === 'KENDI';
        }
      } else {
        delete record.odemeDurumu;
        delete record.harcamaKaynagi;
      }
      // PERSONEL ÖDEDİ: zorunlu; BORÇ: isteğe bağlı; KASA ÖDEDİ: yok
      if (
        newType === 'ÇIKIŞ' &&
        (personelZorunluMu(newOdemeDurumu) || (newOdemeDurumu === 'BORC' && newPersonelId))
      ) {
        record.personelId = newPersonelId;
        record.personelAdi = selectedPersonelLabel || undefined;
      } else {
        delete record.personelId;
        delete record.personelAdi;
      }

      await saveDocument('kasaHareketleri', {
        ...record,
        odemeDurumu: record.odemeDurumu ?? null,
        harcamaKaynagi: record.harcamaKaynagi ?? null,
        masrafTipi: record.masrafTipi ?? null,
        soforKasaHarcamasi: record.soforKasaHarcamasi ?? null,
        soforOdemesi: record.soforOdemesi ?? null,
        personelId: record.personelId ?? null,
        personelAdi: record.personelAdi ?? null,
      } as KasaHareketi);

      setKasaHareketleri((prev) => {
        if (prev.some((x) => x.id === id)) {
          return prev.map((item) => (item.id === id ? record : item));
        }
        return [record, ...prev];
      });

      // Liste filtresi kaydı gizlemesin
      if (newDate < appliedStartDate) {
        setAppliedStartDate(newDate);
        setStartDate(newDate);
      }
      if (newDate > appliedEndDate) {
        setAppliedEndDate(newDate);
        setEndDate(newDate);
      }

      const wasEditing = Boolean(editingId);
      clearKasaForm();
      alert(wasEditing ? 'Kasa hareketi güncellendi.' : 'Kasa hareketi kaydedildi.');
    } catch (err) {
      console.error('[kasa] kayıt hatası:', err);
      alert(`Kasa hareketi kaydedilemedi: ${formatKasaSaveError(err)}`);
    } finally {
      setSavingKasa(false);
    }
  };

  const handleFilterSubmit = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  return (
    <div className="flex-grow p-3 sm:p-4 lg:p-6 min-h-0 lg:h-full flex flex-col font-sans gap-4 lg:gap-6 select-none bg-[#FFFBF7]">
      
      {/* Üst başlık — Kibritçi turuncu antet */}
      <div className="shrink-0 rounded-2xl border border-[#FED7AA] bg-gradient-to-r from-[#FFF7ED] via-white to-[#FFFBF7] p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#EA580C] text-white flex items-center justify-center shadow-md shrink-0">
              <Wallet size={22} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#9A3412]">
                Haftalık Kasa
              </h1>
              <p className="text-[11px] text-[#64748B] font-semibold mt-0.5 leading-relaxed">
                {appliedStartDate} — {appliedEndDate} · Kasa harcaması · BORÇ · Personel ödedi · Kasa ödedi · Firestore kayıtlı
              </p>
            </div>
          </div>
          <span className="bg-[#FFEDD5] text-[#9A3412] border border-[#FDBA74] text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shrink-0">
            Aktif Modül
          </span>
        </div>
      </div>

      {/* Özet kartları — seçili aralık */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        {[
          { title: 'Giriş (aralık)', value: `₺${totalIn.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, card: 'border-emerald-200 bg-white text-emerald-800', icon: ArrowUpRight, iconBg: 'bg-emerald-50 text-emerald-700' },
          { title: 'Kasa harcaması', value: `₺${kasaHarcamaOut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, card: 'border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]', icon: Wallet, iconBg: 'bg-[#FFEDD5] text-[#C2410C]', sub: `${cikisKayitSayisi} çıkış · borç + personel + kasa ödedi` },
          { title: 'Kapanış bakiyesi', value: `₺${(openingBalance + totalIn - totalOut).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, card: 'border-[#FDBA74] bg-white text-[#9A3412] font-bold', icon: Wallet, iconBg: 'bg-[#FFF7ED] text-[#EA580C]', sub: `Devreden: ₺${openingBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} · dönem net: ₺${(totalIn - totalOut).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${item.card}`}>
              <div className="min-w-0">
                <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block mb-1">
                  {item.title}
                </span>
                <span className="text-lg sm:text-xl font-black font-mono tabular-nums block truncate">
                  {item.value}
                </span>
                {'sub' in item && item.sub ? (
                  <span className="text-[9px] text-[#94A3B8] font-semibold mt-0.5 block">{item.sub}</span>
                ) : null}
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border border-[#FED7AA]/80 shrink-0 ${item.iconBg}`}>
                <Icon size={20} className="stroke-[2.5]" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Ödeme durumu özeti */}
      <div className="shrink-0 rounded-2xl border border-[#FED7AA] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#9A3412]">
              Ödeme durumu özeti (seçili aralık)
            </h3>
            <p className="text-[10px] text-[#64748B] mt-0.5">
              BORÇ · PERSONEL ÖDEDİ · KASA ÖDEDİ kırılımı — TOPLAM = Kasa Harcaması kartı
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono font-bold">
            <span className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 rounded-lg">
              BORÇ ₺{odemeBazliOzet.totals.BORC.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
            <span className="bg-violet-50 border border-violet-200 text-violet-900 px-2 py-1 rounded-lg">
              PERSONEL ₺{odemeBazliOzet.totals.PERSONEL_ODEDI.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
            <span className="bg-[#FFEDD5] border border-[#FDBA74] text-[#9A3412] px-2 py-1 rounded-lg">
              KASA ₺{odemeBazliOzet.totals.KASA_ODEDI.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
            <span className="bg-rose-50 border border-rose-200 text-rose-900 px-2 py-1 rounded-lg">
              TOPLAM ₺{(
                odemeBazliOzet.totals.BORC +
                odemeBazliOzet.totals.PERSONEL_ODEDI +
                odemeBazliOzet.totals.KASA_ODEDI
              ).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        {odemeBazliOzet.satirlar.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Bu aralıkta çıkış / harcama yok.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {odemeBazliOzet.satirlar.map((row) => (
              <div
                key={row.key}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  row.durum === 'KASA_ODEDI'
                    ? 'bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]'
                    : row.durum === 'BORC'
                      ? 'bg-amber-50 text-amber-950 border-amber-200'
                      : 'bg-violet-50 text-violet-950 border-violet-200'
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-wide opacity-90">
                  {row.label}
                </span>
                <span className="text-sm font-black font-mono tabular-nums">
                  ₺{row.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main split dashboard view — mobilde defter üstte (geçmiş işlemler görünür) */}
      <div className="flex flex-col lg:flex-1 lg:flex-row gap-4 lg:gap-6 lg:min-h-0">
        
        {/* Left side Form creator */}
        <div ref={formPanelRef} className="order-2 lg:order-1 w-full lg:w-[380px] lg:shrink-0 bg-white border border-[#FED7AA] rounded-2xl flex flex-col overflow-hidden shadow-sm lg:min-h-0 lg:max-h-full">
          
          <div className="p-4 shrink-0 shadow-sm flex items-center justify-between text-white bg-gradient-to-r from-[#EA580C] to-[#C2410C]">
            <div className="flex items-center space-x-2">
              <Wallet size={16} />
              <h3 className="font-bold text-xs uppercase tracking-widest">
                {editingId ? 'Kasa Hareketi Düzenle' : 'Yeni Kasa Hareketi'}
              </h3>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={clearKasaForm}
                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 cursor-pointer"
              >
                İptal
              </button>
            )}
          </div>

          <form onSubmit={handleSaveKasaHareketi} className="lg:flex-grow overflow-y-auto p-5 space-y-4 text-xs max-h-[70vh] lg:max-h-none bg-[#FFFBF7]/50">
            
            {/* Tarih Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1 font-sans">
                <span>🗓️ Tarih</span>
              </label>
              <input 
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl  max-h-10 outline-none"
              />
            </div>

            {/* Hareket Tipi Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>📊 Hareket Tipi</span>
              </label>
              <select 
                className="w-full text-xs font-bold p-2 bg-slate-55 border border-slate-200 rounded-xl max-h-10 cursor-pointer outline-none"
                value={newType}
                onChange={(e) => {
                  const next = e.target.value as 'GİRİŞ' | 'ÇIKIŞ';
                  setNewType(next);
                  if (next === 'GİRİŞ') {
                    setNewOdemeDurumu('');
                    setNewPersonelId('');
                    setPersonelArama('');
                  } else if (!newOdemeDurumu) {
                    setNewOdemeDurumu('KASA_ODEDI');
                  }
                }}
              >
                <option value="GİRİŞ">📈 GİRİŞ</option>
                <option value="ÇIKIŞ">📉 ÇIKIŞ</option>
              </select>
            </div>

            {newType === 'ÇIKIŞ' && (
              <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                <label className="text-[10px] font-bold text-rose-800 uppercase block">
                  Ödeme Durumu <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {ODEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setNewOdemeDurumu(opt.id);
                        if (opt.id === 'KASA_ODEDI') {
                          setNewPersonelId('');
                          setPersonelArama('');
                        }
                      }}
                      className={`text-left text-[10px] font-black uppercase py-2 px-3 rounded-xl border cursor-pointer transition ${
                        newOdemeDurumu === opt.id
                          ? opt.id === 'KASA_ODEDI'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : opt.id === 'BORC'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-violet-700 text-white border-violet-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block">{opt.label}</span>
                      <span className={`block text-[9px] font-semibold normal-case tracking-normal mt-0.5 ${
                        newOdemeDurumu === opt.id ? 'opacity-90' : 'text-slate-500'
                      }`}>
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                </div>

                {personelAlanGoster(newOdemeDurumu) && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-violet-900 uppercase block">
                      Personel
                      {personelZorunluMu(newOdemeDurumu) ? (
                        <span className="text-rose-600"> *</span>
                      ) : (
                        <span className="text-slate-500 font-semibold normal-case"> (isteğe bağlı)</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={personelArama}
                      onChange={(e) => setPersonelArama(e.target.value)}
                      placeholder="Ad / soyad ara…"
                      className="w-full text-xs font-semibold p-2 bg-white border border-violet-200 rounded-xl outline-none"
                    />
                    <select
                      required={personelZorunluMu(newOdemeDurumu)}
                      value={newPersonelId}
                      onChange={(e) => setNewPersonelId(e.target.value)}
                      className="w-full text-xs font-bold p-2 bg-white border border-violet-200 rounded-xl cursor-pointer outline-none"
                    >
                      <option value="">
                        {personelZorunluMu(newOdemeDurumu)
                          ? 'Personel seçin…'
                          : 'Personel yok / firma borcu…'}
                      </option>
                      {personelSecenekleri.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}{p.gorev ? ` · ${p.gorev}` : ''}
                        </option>
                      ))}
                    </select>
                    {newPersonelId ? (
                      <p className="text-[10px] text-violet-800 font-semibold">
                        Seçilen: {selectedPersonelLabel}
                      </p>
                    ) : personelZorunluMu(newOdemeDurumu) ? (
                      <p className="text-[10px] text-rose-700 font-semibold">
                        Personel seçilmeden kayıt yapılamaz.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500 font-semibold">
                        Firma borcu için personel seçmeden kaydedebilirsiniz.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tutar Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>💵 Tutar (₺)</span>
              </label>
              <input 
                type="number"
                required
                placeholder="0.00"
                className="w-full text-xs font-black p-2 bg-slate-50 border border-slate-200 rounded-xl  outline-none"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>

            {/* Açıklama Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>📝 Açıklama</span>
              </label>
              <input 
                type="text"
                required
                placeholder="Harcama veya Gelir Açıklaması..."
                className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none "
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>

            

            

            {/* Fiş/Fotoğraf/PDF Dropzone */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block font-sans">
                📷 Fiş / Fatura Evrakı (Foto veya PDF)
              </label>
              
              <div 
                className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center transition text-center relative ${
                  dragActive ? "border-slate-800 bg-slate-50/50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  type="file"
                  id="receipt-file-input"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept={KASA_FIS_EVRAK_ACCEPT}
                  className="hidden"
                />

                {uploadedFileName ? (
                  <div className="space-y-2 py-1">
                    <FileText className="mx-auto text-slate-600 animate-bounce" size={24} />
                    <div className="text-[10px] font-bold text-slate-700 max-w-[280px] truncate">
                      {uploadedFileName}
                    </div>
                    {uploadedFileBase64 && isKasaFisPdfUrl(uploadedFileBase64) && (
                      <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                        PDF evrak
                      </span>
                    )}
                    <button 
                      type="button" 
                      onClick={() => { setUploadedFileName(null); setUploadedFileBase64(null); }}
                      className="text-[9px] text-rose-500 hover:underline font-bold cursor-pointer"
                    >
                      Evrakı Kaldır
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <p className="text-[10px] text-slate-400 font-medium font-sans">Fiş/Fatura yüklenmedi</p>
                    <button 
                      type="button"
                      onClick={triggerFileInput}
                      className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg shadow-sm transition cursor-pointer"
                    >
                      📁 Fotoğraf veya PDF Seç
                    </button>
                    <p className="text-[9px] text-slate-400 font-sans">
                      JPG · PNG · WEBP · PDF — veya buraya sürükleyip bırakın
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Submit movement to secure database */}
            <button 
              type="submit"
              disabled={savingKasa}
              className="w-full text-white font-bold py-2.5 rounded-xl transition shadow-md cursor-pointer text-xs uppercase disabled:opacity-60 disabled:cursor-wait bg-emerald-600 hover:bg-emerald-700"
            >
              {savingKasa ? 'Kaydediliyor…' : editingId ? 'Değişiklikleri Kaydet' : 'Hareketi Kaydet'}
            </button>
          </form>
        </div>

        {/* Right side Table history — mobilde üstte + min yükseklik (geçmiş görünür) */}
        <div className="order-1 lg:order-2 flex-1 min-w-0 min-h-[52vh] lg:min-h-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          
          {/* Header toolbar exactly matching screenshot style */}
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center space-x-2">
              <h4 className="font-bold text-sm text-slate-800 uppercase tracking-widest">Kasa Hareketleri Defteri</h4>
            </div>
            <p className="w-full text-[10px] text-slate-500 leading-snug">
              Kayıtlar Firestore <span className="font-mono">kasaHareketleri</span> koleksiyonunda saklanır. Düzenle / sil listeden veya soldaki formdan yapılır; şoför fişleri de aynı defterde güncellenebilir.
            </p>

            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md shrink-0 font-mono">
              {filteredHareketler.length} kayıt listelendi
            </span>
          </div>

          {/* Filters and search input boxes */}
          <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 sm:gap-3 text-xs shrink-0 select-none">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2 flex-1 sm:flex-none min-w-0">
                <span className="text-slate-400">📅</span>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none w-full min-w-0"
                />
              </div>
              
              <span className="text-slate-400 font-bold hidden sm:inline">-</span>

              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2 flex-1 sm:flex-none min-w-0">
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none w-full min-w-0"
                />
              </div>

              <button 
                onClick={handleFilterSubmit}
                className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-[11px] py-1.5 px-3 rounded-lg shadow-sm transition cursor-pointer font-sans"
              >
                Filtrele
              </button>
            </div>

            {/* Real Search Input Box */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2 w-full sm:w-48">
              <span className="text-slate-400">🔍</span>
              <input 
                type="text"
                placeholder="Açıklama, ref vb. ara..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none w-full"
              />
            </div>
          </div>

          {/* List area — mobilde kaydırılabilir, min yükseklik garantili */}
          <div className="flex-1 overflow-auto flex flex-col min-w-0 min-h-[240px]">
            
            {/* Headers row — masaüstü */}
            <div className="hidden md:grid grid-cols-5 min-w-[720px] bg-slate-100/80 border-b border-slate-250 text-[10px] font-bold text-slate-500 uppercase tracking-wider py-2 px-4 shadow-3xs shrink-0 select-none">
              <div>Tarih</div>
              <div>Tip</div>
              <div>Tutar</div>
              <div className="col-span-2">Açıklama &amp; İşlem Barları</div>
            </div>

            {filteredHareketler.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                <AlertCircle className="text-slate-350" size={32} />
                <p className="text-xs font-semibold font-sans">Bu kriterlerde şantiye kasa kaydı bulunmamaktadır.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 divide-dashed overflow-y-auto">
                {filteredHareketler.map(kh => {
                  const sofor = isSoforKaynakliKasaHareketi(kh);
                  const soforIade = isSoforIadeKasaHareketi(kh);
                  const soforKasa = isSoforUzerindenKasaGideri(kh);
                  const odeme = resolveOdemeDurumu(kh);
                  return (
                  <React.Fragment key={kh.id}>
                  {/* Mobil kart görünümü */}
                  <div
                    className={`md:hidden p-3 space-y-2 ${
                      soforKasa
                        ? 'bg-sky-50/50'
                        : soforIade
                          ? 'bg-rose-50/40'
                          : sofor
                            ? 'bg-indigo-50/40'
                            : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1.5">
                        <div className="font-mono text-[11px] font-bold text-slate-500 flex items-center gap-1">
                          <Calendar size={11} className="text-slate-400 shrink-0" />
                          <span>{kh.tarih}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className={`inline-block py-0.5 px-2 rounded-full text-[10px] font-extrabold ${
                            kh.hareketTipi === 'GİRİŞ' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}>
                            {kh.hareketTipi}
                          </span>
                          {soforIade && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">ŞOFÖR İADE</span>
                          )}
                          {soforKasa && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200">KASA (ŞOFÖR)</span>
                          )}
                          {sofor && !soforIade && !soforKasa && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">ŞOFÖR FİŞ</span>
                          )}
                          {odeme === 'BORC' && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">BORÇ</span>
                          )}
                          {odeme === 'PERSONEL_ODEDI' && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-violet-100 text-violet-800 border border-violet-200">PERSONEL ÖDEDİ</span>
                          )}
                          {odeme === 'KASA_ODEDI' && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">KASA ÖDEDİ</span>
                          )}
                          {kh.hareketTipi === 'ÇIKIŞ' && !odeme && (
                            <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">ÖDEME DURUMU SEÇİN</span>
                          )}
                        </div>
                      </div>
                      <span className={`font-mono text-sm font-black shrink-0 ${
                        kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {kh.hareketTipi === 'GİRİŞ' ? '+' : '-'}₺{Number(kh.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-800 font-semibold leading-snug break-words">{kh.aciklama || '—'}</p>
                    <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">
                      {kh.referansTipi}{kh.referansId ? ` [${kh.referansId}]` : ''}
                      {kh.personelAdi ? ` · ${kh.personelAdi}` : ''}
                      {kh.surucu ? ` · ${kh.surucu}` : ''}
                    </p>
                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => loadKasaForEdit(kh)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 hover:bg-amber-50 text-amber-800 rounded-lg cursor-pointer text-[10px] font-bold border border-amber-200"
                        title="Soldaki formda düzenle"
                      >
                        <Pencil size={14} />
                        Düzenle
                      </button>
                      {deleteKasaHareketi && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteKasaKayit(kh)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 hover:bg-rose-50 text-rose-700 rounded-lg cursor-pointer text-[10px] font-bold border border-rose-200"
                          title="Firestore kaydını sil"
                        >
                          <Trash2 size={14} />
                          Sil
                        </button>
                      )}
                      {kh.fisEvrakUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReceiptUrl(kh.fisEvrakUrl || null);
                            setSelectedReceiptName(
                              `${kh.tarih} · ${kh.fisNo || kh.id.slice(-6)} · ${kh.aciklama || 'Fiş'}`
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1.5 hover:bg-sky-50 text-slate-600 hover:text-sky-700 rounded-lg cursor-pointer text-[10px] font-bold border border-slate-200"
                          title={isKasaFisPdfUrl(kh.fisEvrakUrl) ? 'PDF evrakı aç' : 'Fiş görselini aç'}
                        >
                          <Eye size={14} />
                          {isKasaFisPdfUrl(kh.fisEvrakUrl) ? 'PDF Gör' : 'Fiş Gör'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Masaüstü satır */}
                  <div 
                    className={`hidden md:grid grid-cols-5 min-w-[720px] items-center py-2.5 px-4 text-xs transition cursor-default group ${
                      soforKasa
                        ? 'bg-sky-50/50 hover:bg-sky-50/80'
                        : soforIade
                        ? 'bg-rose-50/40 hover:bg-rose-50/70'
                        : sofor
                        ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                        : 'hover:bg-amber-500/5'
                    }`}
                  >
                    {/* Tarih Column */}
                    <div className="font-mono text-[11px] font-bold text-slate-500 flex items-center space-x-1">
                      <Calendar size={11} className="text-slate-400" />
                      <span>{kh.tarih}</span>
                    </div>

                    {/* Tip Column */}
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-block py-0.5 px-2 rounded-full text-[10px] font-extrabold ${
                        kh.hareketTipi === 'GİRİŞ' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        {kh.hareketTipi}
                      </span>
                      {soforIade && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                          ŞOFÖR İADE
                        </span>
                      )}
                      {soforKasa && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200">
                          KASA (ŞOFÖR)
                        </span>
                      )}
                      {sofor && !soforIade && !soforKasa && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          ŞOFÖR FİŞ
                        </span>
                      )}
                      {odeme === 'BORC' && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                          BORÇ
                        </span>
                      )}
                      {odeme === 'PERSONEL_ODEDI' && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-violet-100 text-violet-800 border border-violet-200">
                          PERSONEL ÖDEDİ
                        </span>
                      )}
                      {odeme === 'KASA_ODEDI' && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                          KASA ÖDEDİ
                        </span>
                      )}
                      {kh.hareketTipi === 'ÇIKIŞ' && !odeme && (
                        <span className="inline-block py-0.5 px-2 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                          ÖDEME DURUMU SEÇİN
                        </span>
                      )}
                    </div>

                    {/* Tutar Column */}
                    <div className={`font-mono font-black text-xs ${
                      kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {kh.hareketTipi === 'GİRİŞ' ? '+' : '-'}₺{kh.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>

                    {/* Açıklama & Referans Column details combo span 2 */}
                    <div className="col-span-2 flex items-center justify-between pr-2 min-w-0">
                      <div className="truncate pr-4">
                        <h5 className="font-bold text-slate-800 truncate leading-tight" title={kh.aciklama}>{kh.aciklama}</h5>
                        <p className="text-[9px] text-[#64748b] font-semibold uppercase tracking-wider mt-0.5 truncate">
                          {kh.referansTipi} {kh.referansId && `[ No: ${kh.referansId} ]`}
                          {kh.personelAdi ? ` · Personel: ${kh.personelAdi}` : ''}
                          {kh.surucu ? ` · ${kh.surucu}` : ''}
                        </p>
                      </div>

                      {/* Interactive Visual Action Icons */}
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadKasaForEdit(kh)}
                          className="p-1 px-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-900 rounded-lg flex items-center space-x-1 transition shadow-xs text-[9px] font-bold cursor-pointer"
                          title="Soldaki formda düzenle"
                        >
                          <Pencil size={10} />
                          <span>Düzenle</span>
                        </button>
                        {deleteKasaHareketi && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteKasaKayit(kh)}
                            className="p-1 px-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-lg flex items-center space-x-1 transition shadow-xs text-[9px] font-bold cursor-pointer"
                            title="Firestore kaydını sil"
                          >
                            <Trash2 size={10} />
                            <span>Sil</span>
                          </button>
                        )}
                        {kh.fisEvrakUrl && (
                          <button 
                            onClick={() => {
                              setSelectedReceiptUrl(kh.fisEvrakUrl || null);
                              setSelectedReceiptName(
                                `${kh.tarih} · Fiş ${kh.fisNo || kh.id.slice(-6)} · ${kh.aciklama || '—'}`
                              );
                            }}
                            className="p-1 px-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-lg flex items-center space-x-1 transition shadow-xs text-[9px] font-bold cursor-pointer"
                            title={isKasaFisPdfUrl(kh.fisEvrakUrl) ? 'PDF evrakı aç' : 'Fiş görselini aç'}
                          >
                            <ImageIcon size={10} />
                            <span>{isKasaFisPdfUrl(kh.fisEvrakUrl) ? 'PDF Gör' : 'Fiş Gör'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {/* Raporlar — HTML + Excel + defter dışa/içe aktar */}
          <div className="p-3 border-t border-[#FED7AA] bg-[#FFF7ED]/80 flex flex-wrap justify-end gap-2 shrink-0 select-none">
            <input
              ref={kasaDefterImportRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleKasaDefterImport(file);
              }}
            />
            <button
              type="button"
              disabled={importingKasaDefter}
              onClick={() => kasaDefterImportRef.current?.click()}
              className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-wait border border-slate-800 text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="ARNAVUTKÖY tarzı Excel defterinden geçmiş kasa işlemlerini içe aktar (.xls / .xlsx)"
            >
              <Upload size={12} />
              <span>
                {importingKasaDefter
                  ? importProgress || 'İçe aktarılıyor…'
                  : 'Geçmiş Kasa İçe Aktar'}
              </span>
            </button>
            <button
              type="button"
              disabled={exportingKasaDefter}
              onClick={() => {
                void (async () => {
                  if (exportingKasaDefter) return;
                  setExportingKasaDefter(true);
                  try {
                    await exportKasaDefterExcel(
                      hareketlerInRange,
                      appliedStartDate,
                      appliedEndDate,
                      personeller,
                      kasaHareketleri
                    );
                  } catch (err) {
                    console.error('[kasa-defter-excel]', err);
                    alert(
                      'Kasa defter Excel oluşturulamadı:\n' +
                        (err instanceof Error ? err.message : String(err))
                    );
                  } finally {
                    setExportingKasaDefter(false);
                  }
                })();
              }}
              className="bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-60 disabled:cursor-wait border border-[#1E40AF] text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="ARNAVUTKÖY tarzı tek sayfa defter — Tarih · Giren · Çıkan · Bakiye"
            >
              <BookOpen size={12} />
              <span>
                {exportingKasaDefter ? 'Defter hazırlanıyor…' : 'Kasa Defter Excel (Arnavutköy)'}
              </span>
            </button>
            <button
              type="button"
              disabled={exportingKasaIcmal}
              onClick={() => {
                void (async () => {
                  if (exportingKasaIcmal) return;
                  setExportingKasaIcmal(true);
                  try {
                    await exportKasaHaftalikIcmalExcel(
                      hareketlerInRange,
                      appliedStartDate,
                      appliedEndDate,
                      personeller,
                      kasaHareketleri
                    );
                  } catch (err) {
                    console.error('[kasa-icmal-excel]', err);
                    alert(
                      'Haftalık Kasa İcmali oluşturulamadı:\n' +
                        (err instanceof Error ? err.message : String(err))
                    );
                  } finally {
                    setExportingKasaIcmal(false);
                  }
                })();
              }}
              className="bg-violet-700 hover:bg-violet-800 disabled:opacity-60 disabled:cursor-wait border border-violet-800 text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="Seçili aralık — toplam giren/çıkan/bakiye + defter satırları (Haftalık Kasa İcmali)"
            >
              <FileText size={12} />
              <span>
                {exportingKasaIcmal ? 'İcmal hazırlanıyor…' : 'Haftalık Kasa İcmali Excel'}
              </span>
            </button>
            <button
              type="button"
              disabled={printingGunlukRapor}
              onClick={() => void handleGunlukYoklamaKasaRaporu()}
              className="bg-sky-700 hover:bg-sky-800 disabled:opacity-60 disabled:cursor-wait border border-sky-800 text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="Bugünün yoklama listesi + bugünkü kasa giriş/çıkışları — HTML yazdır"
            >
              <Calendar size={12} />
              <span>
                {printingGunlukRapor ? 'Rapor hazırlanıyor…' : 'Bugünkü Yoklama + Kasa (HTML)'}
              </span>
            </button>
            <button
              type="button"
              disabled={sendingKasaEmail}
              onClick={() => void handleAralikHarcamaEmail()}
              className="bg-[#047857] hover:bg-[#065f46] disabled:opacity-60 disabled:cursor-wait border border-[#065f46] text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="HTML + Excel raporu e-posta ile gönder (indirme bağlantıları + ek dosya)"
            >
              <Mail size={12} />
              <span>{sendingKasaEmail ? 'Bağlantılar hazırlanıyor…' : 'E-posta ile Gönder'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleAralikHarcamaRaporu()}
              className="bg-[#EA580C] hover:bg-[#C2410C] border border-[#C2410C] text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="Filtredeki aralığın tüm kasa çıkışları — HTML rapor"
            >
              <Printer size={12} />
              <span>Aralık Harcama Raporu (HTML)</span>
            </button>
            <button
              type="button"
              disabled={exportingKasaExcel}
              onClick={() => {
                void (async () => {
                  if (exportingKasaExcel) return;
                  setExportingKasaExcel(true);
                  try {
                    await exportKasaExcel(
                      hareketlerInRange,
                      appliedStartDate,
                      appliedEndDate,
                      personeller,
                      kasaHareketleri
                    );
                  } catch (err) {
                    console.error('[kasa-excel]', err);
                    alert(
                      'Kasa Excel oluşturulamadı:\n' +
                        (err instanceof Error ? err.message : String(err))
                    );
                  } finally {
                    setExportingKasaExcel(false);
                  }
                })();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait border border-emerald-700 text-white text-[11px] font-bold py-2 px-4 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              title="Excel — 1. sayfa sade defter (Giren/Çıkan/Bakiye) + özet + fiş evrakları"
            >
              <FileText size={12} />
              <span>{exportingKasaExcel ? 'Excel hazırlanıyor…' : 'Kasa Excel'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fiş büyütme */}
      {selectedReceiptUrl && (
        <ImageLightbox
          url={selectedReceiptUrl}
          title={`${selectedReceiptName || 'Evrak'} — Fiş / Fatura Görseli`}
          fileName={`kasa-fis-${(selectedReceiptName || 'evrak').slice(0, 40)}`}
          onClose={() => {
            setSelectedReceiptUrl(null);
            setSelectedReceiptName(null);
          }}
        />
      )}

    </div>
  );
};
export default KasaScreen;

