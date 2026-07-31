import React, { useMemo, useState, useRef, useEffect } from 'react';
import { 
  Wallet, Plus, Trash2, ArrowUpRight, ArrowDownRight, Printer, Edit3,
  Calendar, FileText, Search, CreditCard, ChevronRight, Eye, Image as ImageIcon, CheckCircle, AlertCircle, Mail, RefreshCw
} from 'lucide-react';
import { KasaHareketi, KasaOdemeDurumu, Personel, YolHarcamasi } from '../types/erp';
import { CorporateReportLayout } from './CorporateReportLayout';
import { exportKasaExcel } from '../lib/kasaExcelExport';
import { compressImage } from '../lib/imageCompress';
import { db, removeDocument, saveDocument } from '../lib/firebase';
import { ensureKasaFisFotoPersisted } from '../lib/sahaFaaliyetFotoStorage';
import { todayDateKey } from '../lib/dateKeyUtils';
import {
  isSoforIadeKasaHareketi,
  isSoforKaynakliKasaHareketi,
  isSoforUzerindenKasaGideri,
  resolveKasaOdemeDurumu,
  resolveKasaRaporMasrafTipi,
  syncApprovedYolHarcamalariToKasa,
} from '../lib/yolHarcamaUtils';
import { collection, getDocs } from 'firebase/firestore';

type HarcamaKaynagi = 'KASA_HARCAMA' | 'PERSONEL_HARCAMA';

const ODEME_OPTIONS: { id: KasaOdemeDurumu; label: string; short: string; hint: string }[] = [
  {
    id: 'BORC',
    label: 'BORÇ',
    short: 'Borç',
    hint: 'Kasaya yazılır — kasanın personele ödemesi gereken borç',
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
  if (d === 'BORC') return 'KASA BORCU';
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

function personelZorunluMu(d: KasaOdemeDurumu | ''): boolean {
  return d === 'BORC' || d === 'PERSONEL_ODEDI';
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
}) => {
  const week0 = defaultWeekRange();
  // Exact layout filters matching top of table in the screenshot
  const [startDate, setStartDate] = useState(week0.start);
  const [endDate, setEndDate] = useState(week0.end);
  const [appliedStartDate, setAppliedStartDate] = useState(week0.start);
  const [appliedEndDate, setAppliedEndDate] = useState(week0.end);
  const [searchKeyword, setSearchKeyword] = useState("");

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
  const [showWeeklyReportModal, setShowWeeklyReportModal] = useState(false);
  const [soforIadeStart, setSoforIadeStart] = useState(week0.start);
  const [soforIadeEnd, setSoforIadeEnd] = useState(week0.end);
  const [soforIadeFiltre, setSoforIadeFiltre] = useState('');
  const [savingKasa, setSavingKasa] = useState(false);
  const yolKasaSyncRef = useRef(false);

  /** Onaylı şoför fişlerini kasaya tamamla (eksik kalanlar) */
  const runYolKasaSync = async (silent = false) => {
    try {
      const snap = await getDocs(collection(db, 'yolHarcamalari'));
      const list: YolHarcamasi[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<YolHarcamasi, 'id'>) }));
      const result = await syncApprovedYolHarcamalariToKasa(list);
      if (!silent) {
        alert(
          `Şoför fiş → kasa senkronu\n\nYeni: ${result.created} · Zaten vardı: ${result.skipped}` +
            (result.errors.length ? `\nHata: ${result.errors.slice(0, 3).join('; ')}` : '') +
            '\n\nTarih aralığını fiş tarihlerini kapsayacak şekilde genişletin.'
        );
      } else if (result.created > 0) {
        console.info(`[kasa] ${result.created} onaylı şoför fişi kasaya yazıldı`);
      }
      return result;
    } catch (err) {
      console.error('[kasa] yol sync', err);
      if (!silent) {
        alert(`Senkron başarısız: ${err instanceof Error ? err.message : String(err)}`);
      }
      return null;
    }
  };

  useEffect(() => {
    if (yolKasaSyncRef.current) return;
    yolKasaSyncRef.current = true;
    void runYolKasaSync(true);
  }, []);

  const buildSoforReportBundle = async () => {
    const {
      filterSoforKasaHareketleri,
      buildSoforMasrafIadeReportHtml,
    } = await import('../lib/yolHarcamaUtils');
    const start = soforIadeStart || appliedStartDate;
    const end = soforIadeEnd || appliedEndDate;
    const rows = filterSoforKasaHareketleri(
      kasaHareketleri,
      start,
      end,
      soforIadeFiltre || undefined
    );
    if (rows.length === 0) {
      alert('Seçili aralıkta şoför masraf kasa çıkışı yok.\n\nŞoför fişi yönetici onayından sonra burada ÇIKIŞ olarak görünür.');
      return null;
    }
    const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
    const html = buildSoforMasrafIadeReportHtml({
      startDate: start,
      endDate: end,
      items: rows.map((r) => ({
        id: r.id,
        tarih: r.tarih,
        fisNo: r.fisNo,
        aciklama: r.aciklama,
        tutar: Number(r.tutar) || 0,
        surucu: r.surucu,
        fotoUrl: r.fisEvrakUrl,
        masrafTipi: resolveKasaRaporMasrafTipi(r) || (isSoforUzerindenKasaGideri(r) ? 'KASA' : 'KENDI'),
        odemeDurumu: resolveKasaOdemeDurumu(r),
      })),
      surucuFiltre: soforIadeFiltre || undefined,
      olusturan: 'Haftalık Kasa',
    });
    return { html, start, end, toplam, rows };
  };

  const handleSoforMasrafIadeRaporu = async () => {
    const {
      openSoforMasrafIadeReport,
    } = await import('../lib/yolHarcamaUtils');
    const bundle = await buildSoforReportBundle();
    if (!bundle) return;
    openSoforMasrafIadeReport(bundle.html, 'Şoför Masraf İade Raporu');
  };

  const handleSoforMasrafMerkezeEmail = async () => {
    const { emailSoforMasrafIadeReport } = await import('../lib/yolHarcamaUtils');
    const bundle = await buildSoforReportBundle();
    if (!bundle) return;
    emailSoforMasrafIadeReport({
      html: bundle.html,
      startDate: bundle.start,
      endDate: bundle.end,
      toplam: bundle.toplam,
      items: bundle.rows,
    });
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
    const html = buildKasaHarcamaAralikReportHtml({
      startDate: start,
      endDate: end,
      items: rows,
      olusturan: 'Haftalık Kasa',
    });
    return { html, start, end, toplam, rows };
  };

  const handleAralikHarcamaRaporu = async () => {
    const { openSoforMasrafIadeReport } = await import('../lib/yolHarcamaUtils');
    const bundle = await buildAralikHarcamaBundle();
    if (!bundle) return;
    openSoforMasrafIadeReport(bundle.html, 'Kasa Harcama Raporu');
  };

  const handleAralikHarcamaMerkezeEmail = async () => {
    const { emailKasaHarcamaAralikReport } = await import('../lib/yolHarcamaUtils');
    const bundle = await buildAralikHarcamaBundle();
    if (!bundle) return;
    emailKasaHarcamaAralikReport({
      html: bundle.html,
      startDate: bundle.start,
      endDate: bundle.end,
      toplam: bundle.toplam,
      items: bundle.rows,
    });
  };

  // Filter records in range and search text keyword match
  const filteredHareketler = useMemo(
    () =>
      kasaHareketleri.filter((kh) => {
        const isWithinDate = kh.tarih >= appliedStartDate && kh.tarih <= appliedEndDate;
        if (!isWithinDate) return false;

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
    [kasaHareketleri, appliedStartDate, appliedEndDate, searchKeyword]
  );

  // KPI: seçili aralık (filtre) üzerinden — şoför onaylı çıkışlar eksi bakiyeye yansır
  const totalIn = filteredHareketler
    .filter((k) => k.hareketTipi === 'GİRİŞ')
    .reduce((sum, current) => sum + current.tutar, 0);

  const totalOut = filteredHareketler
    .filter((k) => k.hareketTipi === 'ÇIKIŞ')
    .reduce((sum, current) => sum + current.tutar, 0);

  const soforIadeOut = filteredHareketler
    .filter((k) => k.hareketTipi === 'ÇIKIŞ' && isSoforIadeKasaHareketi(k))
    .reduce((sum, current) => sum + current.tutar, 0);
  const soforKasaOut = filteredHareketler
    .filter((k) => k.hareketTipi === 'ÇIKIŞ' && isSoforUzerindenKasaGideri(k))
    .reduce((sum, current) => sum + current.tutar, 0);

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
      if (durum === 'BORC') {
        const name = String(kh.personelAdi || kh.surucu || 'Personel (adsız)').trim();
        add(
          `borc:${kh.personelId || name}`,
          `KASA BORCU · ${name}`,
          'BORC',
          tutar
        );
        continue;
      }
      const name = String(kh.personelAdi || kh.surucu || 'Personel (adsız)').trim();
      add(
        `podedi:${kh.personelId || name}`,
        `${name} · PERSONEL ÖDEDİ`,
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
  }, [filteredHareketler]);

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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file: File) => {
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64);
      setUploadedFileBase64(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === "") return;
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
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
      const id = editingId || `kh_${Date.now()}`;
      const existing = editingId
        ? kasaHareketleri.find((x) => x.id === editingId)
        : undefined;

      let fisUrl = String(uploadedFileBase64 || '').trim();
      // Yeni çekilen/yüklenen data URL → Storage; mevcut https/storage URL dokunma
      if (fisUrl.startsWith('data:')) {
        try {
          const persisted = await ensureKasaFisFotoPersisted(id, fisUrl);
          if (persisted) {
            fisUrl = persisted;
          } else {
            const keep = window.confirm(
              'Fiş görseli yüklenemedi (çok büyük veya ağ hatası).\nKayıt görselsiz / eski görselle kaydedilsin mi?'
            );
            if (!keep) return;
            fisUrl = String(existing?.fisEvrakUrl || '').trim();
          }
        } catch (fotoErr) {
          console.warn('[kasa] fiş Storage atlandı:', fotoErr);
          const keep = window.confirm(
            'Fiş görseli Storage’a taşınamadı.\nKayıt mevcut görselle / görselsiz devam etsin mi?'
          );
          if (!keep) return;
          fisUrl = String(existing?.fisEvrakUrl || '').trim();
        }
      } else if (!fisUrl) {
        fisUrl = String(existing?.fisEvrakUrl || '').trim();
      }

      const needsPersonel = newType === 'ÇIKIŞ' && personelZorunluMu(newOdemeDurumu);

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
      if (needsPersonel) {
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
        if (editingId) {
          return prev.map((item) => (item.id === editingId ? record : item));
        }
        if (prev.some((x) => x.id === id)) {
          return prev.map((item) => (item.id === id ? record : item));
        }
        return [record, ...prev];
      });

      // Liste filtresi kaydı gizlemesin
      if (newDate < appliedStartDate) {
        setAppliedStartDate(newDate);
        setStartDate(newDate);
        setSoforIadeStart(newDate);
      }
      if (newDate > appliedEndDate) {
        setAppliedEndDate(newDate);
        setEndDate(newDate);
        setSoforIadeEnd(newDate);
      }

      setEditingId(null);
      setNewAmount('');
      setNewDesc('');
      setNewRefId('');
      setNewOdemeDurumu('');
      setNewPersonelId('');
      setPersonelArama('');
      setUploadedFileName(null);
      setUploadedFileBase64(null);
      setNewDate(todayDateKey());
      alert(
        editingId
          ? 'Kasa hareketi güncellendi.'
          : 'Kasa hareketi kaydedildi.'
      );
    } catch (err) {
      console.error('[kasa] kayıt hatası:', err);
      alert(`Kasa hareketi kaydedilemedi: ${formatKasaSaveError(err)}`);
    } finally {
      setSavingKasa(false);
    }
  };

  const handleStartEdit = (kh: KasaHareketi) => {
    setEditingId(kh.id);
    setNewDate(kh.tarih);
    setNewType(kh.hareketTipi);
    setNewAmount(String(kh.tutar));
    setNewDesc(kh.aciklama);
    setNewRefType(kh.referansTipi);
    setNewRefId(kh.referansId || "");
    setNewOdemeDurumu(kh.hareketTipi === 'ÇIKIŞ' ? resolveOdemeDurumu(kh) || 'KASA_ODEDI' : '');
    setNewPersonelId(kh.personelId || '');
    setPersonelArama(kh.personelAdi || '');
    setUploadedFileName(kh.fisEvrakUrl ? "Kayıtlı Fiş Görseli Mevcut" : null);
    setUploadedFileBase64(kh.fisEvrakUrl || null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewAmount("");
    setNewDesc("");
    setNewRefId("");
    setNewOdemeDurumu('');
    setNewPersonelId('');
    setPersonelArama('');
    setUploadedFileName(null);
    setUploadedFileBase64(null);
  };

  const handleDeleteKasaHareketi = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) {
      alert('Bu kaydın kimliği eksik; silinemiyor. Sayfayı yenileyip tekrar deneyin.');
      return;
    }
    if (!window.confirm('Bu kasa hareketini silmek istediğinize emin misiniz?')) return;

    try {
      if (deleteKasaHareketi) {
        await deleteKasaHareketi(id);
      } else {
        await removeDocument('kasaHareketleri', id);
        setKasaHareketleri((list) => list.filter((k) => k.id !== id));
      }
      if (editingId === id) {
        handleCancelEdit();
      }
    } catch (err) {
      console.error('[kasa] silme hatası:', id, err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Kasa hareketi silinemedi: ${msg}`);
    }
  };

  const handleFilterSubmit = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setSoforIadeStart(startDate);
    setSoforIadeEnd(endDate);
  };

  /** Yönetici: kayıt üzerinde ödeme durumunu hızlı değiştir */
  const handleQuickOdemeDurumu = async (
    kh: KasaHareketi,
    durum: KasaOdemeDurumu
  ) => {
    if (kh.hareketTipi !== 'ÇIKIŞ') {
      alert('Ödeme durumu yalnızca ÇIKIŞ kayıtlarında değiştirilir.');
      return;
    }
    if (personelZorunluMu(durum) && !kh.personelId && !kh.personelAdi) {
      handleStartEdit(kh);
      setNewOdemeDurumu(durum);
      alert(`${odemeDurumuLabel(durum)} için soldaki formdan personeli seçip kaydı güncelleyin.`);
      return;
    }
    if (savingKasa) return;
    setSavingKasa(true);
    try {
      const next: KasaHareketi = {
        ...kh,
        odemeDurumu: durum,
        harcamaKaynagi: harcamaKaynagiFromOdeme(durum),
      };
      // Rapor / şoför ayrımı da yönetici durumuna uysun
      const raporTip = durum === 'KASA_ODEDI' ? 'KASA' : 'KENDI';
      next.masrafTipi = raporTip;
      if (isSoforKaynakliKasaHareketi(kh)) {
        next.soforKasaHarcamasi = raporTip === 'KASA';
        next.soforOdemesi = raporTip === 'KENDI';
      }
      if (!personelZorunluMu(durum)) {
        delete next.personelId;
        delete next.personelAdi;
      }
      await saveDocument('kasaHareketleri', {
        ...next,
        odemeDurumu: durum,
        harcamaKaynagi: next.harcamaKaynagi,
        masrafTipi: next.masrafTipi,
        soforKasaHarcamasi: next.soforKasaHarcamasi ?? null,
        soforOdemesi: next.soforOdemesi ?? null,
        personelId: personelZorunluMu(durum) ? next.personelId || null : null,
        personelAdi: personelZorunluMu(durum) ? next.personelAdi || null : null,
      } as KasaHareketi);
      setKasaHareketleri((prev) => prev.map((x) => (x.id === kh.id ? next : x)));
    } catch (err) {
      console.error('[kasa] ödeme durumu değişimi:', err);
      alert(formatKasaSaveError(err));
    } finally {
      setSavingKasa(false);
    }
  };

  return (
    <div className="flex-grow p-3 sm:p-4 lg:p-6 h-full flex flex-col font-sans gap-4 lg:gap-6 select-none bg-slate-50">
      
      {/* Dynamic Module Header Section aligned with style */}
      <div className="flex items-center justify-between shrink-0 border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center space-x-2">
            <span>Haftalık Kasa</span>
          </h1>
          <p className="text-[#64748b] text-xs font-semibold mt-0.5">
            Çıkışlar: BORÇ · Personel ödedi · Kasa ödedi · Şoför fişleri onaydan sonra düşer
          </p>
        </div>
        
        <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
          Aktif Modül
        </span>
      </div>

      {/* Financial statistics dashboard grid — seçili aralık */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 shrink-0">
        {[
          { title: "Giriş (aralık)", value: `₺${totalIn.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-emerald-100 bg-emerald-50/70 text-emerald-800", icon: ArrowUpRight },
          { title: "Çıkış (aralık)", value: `₺${totalOut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-rose-100 bg-rose-50/70 text-rose-800", icon: ArrowDownRight },
          { title: "Şoföre iade", value: `₺${soforIadeOut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-rose-100 bg-rose-50/50 text-rose-900", icon: CreditCard },
          { title: "Şoför→Kasa", value: `₺${soforKasaOut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-sky-100 bg-sky-50/70 text-sky-800", icon: CreditCard },
          { title: "Net bakiye", value: `₺${(totalIn - totalOut).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-amber-150 bg-amber-50/70 text-amber-800 font-bold", icon: Wallet }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs ${item.color}`}>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                  {item.title}
                </span>
                <span className="text-xl font-black font-mono">
                  {item.value}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border shadow-xs text-slate-700">
                <Icon size={20} className="stroke-[2.5]" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Ödeme durumu özeti — BORÇ / Personel / Kasa */}
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">
              Ödeme durumu özeti (seçili aralık)
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              BORÇ = kasanın ödemesi gereken · Personel ödedi · Kasa ödedi
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono font-bold">
            <span className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 rounded-lg">
              Kasa borcu ₺{odemeBazliOzet.totals.BORC.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
            <span className="bg-violet-50 border border-violet-200 text-violet-900 px-2 py-1 rounded-lg">
              Personel ₺{odemeBazliOzet.totals.PERSONEL_ODEDI.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
            <span className="bg-slate-900 text-white px-2 py-1 rounded-lg">
              Kasa ₺{odemeBazliOzet.totals.KASA_ODEDI.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
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
                    ? 'bg-slate-900 text-white border-slate-900'
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

      {/* Main split dashboard view */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
        
        {/* Left side Form creator */}
        <div className="w-full lg:w-[380px] lg:shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
          
          {/* Header styling exactly matching screenshot blue/amber block */}
          <div className={`p-4 shrink-0 shadow-sm flex items-center justify-between text-white ${editingId ? 'bg-amber-600' : 'bg-[#2563EB]'}`}>
            <div className="flex items-center space-x-2">
              <Wallet size={16} />
              <h3 className="font-bold text-xs uppercase tracking-widest">
                {editingId ? "KASA KAYDI DÜZENLE (Yönetici)" : "YENİ KASA HAREKETİ"}
              </h3>
            </div>
            {editingId && (
              <button 
                onClick={handleCancelEdit}
                className="text-[10px] bg-amber-700 font-bold px-2 py-0.5 rounded cursor-pointer hover:bg-amber-805"
              >
                Vazgeç
              </button>
            )}
          </div>

          <form onSubmit={handleSaveKasaHareketi} className="flex-grow overflow-y-auto p-5 space-y-4 text-xs">
            
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
                        if (!personelZorunluMu(opt.id)) {
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

                {personelZorunluMu(newOdemeDurumu) && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-violet-900 uppercase block">
                      Personel <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={personelArama}
                      onChange={(e) => setPersonelArama(e.target.value)}
                      placeholder="Ad / soyad ara…"
                      className="w-full text-xs font-semibold p-2 bg-white border border-violet-200 rounded-xl outline-none"
                    />
                    <select
                      required
                      value={newPersonelId}
                      onChange={(e) => setNewPersonelId(e.target.value)}
                      className="w-full text-xs font-bold p-2 bg-white border border-violet-200 rounded-xl cursor-pointer outline-none"
                    >
                      <option value="">Personel seçin…</option>
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
                    ) : (
                      <p className="text-[10px] text-rose-700 font-semibold">
                        Personel seçilmeden kayıt yapılamaz.
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

            

            

            {/* Fiş/Fotoğraf Dropzone Drag & Drop */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block font-sans">📷 Fiş/Fatura Evrak Fotoğrafı</label>
              
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
                  accept="image/*,application/pdf"
                  className="hidden"
                />

                {uploadedFileName ? (
                  <div className="space-y-2 py-1">
                    <FileText className="mx-auto text-slate-600 animate-bounce" size={24} />
                    <div className="text-[10px] font-bold text-slate-700 max-w-[280px] truncate">
                      {uploadedFileName}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setUploadedFileName(null); setUploadedFileBase64(null); }}
                      className="text-[9px] text-rose-500 hover:underline font-bold cursor-pointer"
                    >
                      Evrak Görselini Kaldır
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
                      📁 Evrak Görseli Seç
                    </button>
                    <p className="text-[9px] text-slate-400 font-sans">veya buraya sürükleyip bırakın</p>
                  </div>
                )}
              </div>
            </div>

            {/* Submit movement to secure database */}
            <button 
              type="submit"
              disabled={savingKasa}
              className={`w-full text-white font-bold py-2.5 rounded-xl transition shadow-md cursor-pointer text-xs uppercase disabled:opacity-60 disabled:cursor-wait ${
                editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {savingKasa
                ? 'Kaydediliyor…'
                : editingId
                  ? 'KAYDI GÜNCELLE'
                  : 'Hareketi Kaydet'}
            </button>
          </form>
        </div>

        {/* Right side Table history */}
        <div className="flex-1 min-w-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          
          {/* Header toolbar exactly matching screenshot style */}
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center space-x-2">
              <h4 className="font-bold text-sm text-slate-800 uppercase tracking-widest">Kasa Hareketleri Defteri</h4>
            </div>

            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md shrink-0 font-mono">
              {filteredHareketler.length} kayıt listelendi
            </span>
          </div>

          {/* Filters and search input boxes */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 select-none">
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2">
                <span className="text-slate-400">📅</span>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none"
                />
              </div>
              
              <span className="text-slate-400 font-bold">-</span>

              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2">
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none"
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
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2 w-48">
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

          {/* List area customized exactly as visual table with custom headers */}
          <div className="flex-1 overflow-auto flex flex-col min-w-0">
            
            {/* Headers row exactly mimicking table headers */}
            <div className="grid grid-cols-5 min-w-[720px] bg-slate-100/80 border-b border-slate-250 text-[10px] font-bold text-slate-500 uppercase tracking-wider py-2 px-4 shadow-3xs shrink-0 select-none">
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
                  <div 
                    key={kh.id} 
                    className={`grid grid-cols-5 min-w-[720px] items-center py-2.5 px-4 text-xs transition cursor-default group ${
                      editingId === kh.id
                        ? 'bg-amber-50'
                        : soforKasa
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
                          KASA BORCU
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
                      {kh.hareketTipi === 'ÇIKIŞ' && (
                        <div className="flex flex-wrap gap-0.5 w-full mt-0.5">
                          {ODEME_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={savingKasa}
                              onClick={() => void handleQuickOdemeDurumu(kh, opt.id)}
                              className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border cursor-pointer disabled:opacity-50 ${
                                odeme === opt.id
                                  ? opt.id === 'KASA_ODEDI'
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : opt.id === 'BORC'
                                      ? 'bg-amber-600 text-white border-amber-600'
                                      : 'bg-violet-700 text-white border-violet-700'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                              title={`${opt.label} olarak işaretle`}
                            >
                              → {opt.short}
                            </button>
                          ))}
                        </div>
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
                        {kh.fisEvrakUrl && (
                          <button 
                            onClick={() => {
                              setSelectedReceiptUrl(kh.fisEvrakUrl || null);
                              setSelectedReceiptName(kh.aciklama);
                            }}
                            className="p-1 px-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-lg flex items-center space-x-1 transition shadow-xs text-[9px] font-bold cursor-pointer"
                            title="Fatura/Fiş Evrak Görselini Göster"
                          >
                            <ImageIcon size={10} />
                            <span>Evrak Gör</span>
                          </button>
                        )}
                        <button 
                          onClick={() => handleStartEdit(kh)}
                          className="p-1 px-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 rounded-lg flex items-center space-x-1 transition text-[9px] font-bold cursor-pointer"
                          title="Düzenle"
                        >
                          <Edit3 size={11} />
                          <span>Düz.</span>
                        </button>
                        <button 
                          onClick={(e) => handleDeleteKasaHareketi(kh.id, e)}
                          className="p-1.5 hover:bg-rose-50 text-slate-350 hover:text-rose-600 rounded-lg transition shrink-0 cursor-pointer"
                          title="Hareketi Sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PDF & Excel Download summary bar */}
          <div className="p-3 border-t bg-slate-50/50 flex flex-col gap-2 shrink-0 select-none">
            <div className="flex flex-wrap items-end gap-2 justify-end">
              <div className="space-y-0.5">
                <label className="text-[8px] font-bold text-slate-400 uppercase block">Şoför iade başlangıç</label>
                <input
                  type="date"
                  value={soforIadeStart}
                  onChange={(e) => setSoforIadeStart(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-[10px]"
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-[8px] font-bold text-slate-400 uppercase block">Bitiş</label>
                <input
                  type="date"
                  value={soforIadeEnd}
                  onChange={(e) => setSoforIadeEnd(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-[10px]"
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-[8px] font-bold text-slate-400 uppercase block">Şoför filtresi</label>
                <input
                  type="text"
                  value={soforIadeFiltre}
                  onChange={(e) => setSoforIadeFiltre(e.target.value)}
                  placeholder="Tümü"
                  className="border border-slate-200 rounded-lg px-2 py-1 text-[10px] w-28"
                />
              </div>
              <button
                type="button"
                onClick={() => void runYolKasaSync(false)}
                className="bg-violet-700 hover:bg-violet-800 border border-violet-800 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
                title="Onaylı şoför fişlerini Haftalık Kasa’ya yaz"
              >
                <RefreshCw size={12} />
                <span>Şoför Fiş → Kasa</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSoforMasrafIadeRaporu()}
                className="bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Printer size={12} />
                <span>Şoför Masraf Raporu</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSoforMasrafMerkezeEmail()}
                className="bg-sky-600 hover:bg-sky-700 border border-sky-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
                title="yonetim@kibritci.com"
              >
                <Mail size={12} />
                <span>Şoför → Merkeze E-posta</span>
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleAralikHarcamaRaporu()}
              className="bg-rose-600 hover:bg-rose-700 border border-rose-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
              title="Filtredeki aralığın tüm kasa çıkışları"
            >
              <Printer size={12} />
              <span>Aralık Harcama Raporu</span>
            </button>
            <button
              type="button"
              onClick={() => void handleAralikHarcamaMerkezeEmail()}
              className="bg-sky-700 hover:bg-sky-800 border border-sky-800 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Mail size={12} />
              <span>Harcama → Merkeze E-posta</span>
            </button>
            <button 
              onClick={() => {
                exportKasaExcel(filteredHareketler, appliedStartDate, appliedEndDate);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer text-left"
            >
              <FileText size={12} />
              <span>Kasa Excel</span>
            </button>
            <button 
              onClick={() => setShowWeeklyReportModal(true)}
              className="bg-amber-500 hover:bg-amber-600 border border-amber-600 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer text-left"
            >
              <Printer size={12} />
              <span>Haftalık Kasa PDF</span>
            </button>
            </div>
          </div>
        </div>
      </div>

      {/* High Fidelity Receipt Image Preview Modal Frame */}
      {selectedReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs select-none">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono tracking-widest text-[#F59E0B] uppercase font-bold">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</p>
                <h4 className="text-xs font-bold text-white truncate max-w-[320px]">{selectedReceiptName} - EVRAK / FİŞ DOSYA GÖRSELİ</h4>
              </div>
              <button 
                onClick={() => { setSelectedReceiptUrl(null); setSelectedReceiptName(null); }}
                className="text-slate-400 hover:text-white bg-slate-850 p-1.5 rounded-lg border border-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 flex justify-center items-center bg-slate-950/40">
              <img 
                src={selectedReceiptUrl} 
                alt="Şantiye Fiş Görseli" 
                className="max-w-full max-h-[50vh] object-contain rounded-xl border border-slate-850"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex justify-between items-center">
              <span className="text-[9px] text-slate-500 font-mono">Güvenli Cloud Depolama Noktası / Fatura-Fiş Arşivi</span>
              <button 
                onClick={() => { setSelectedReceiptUrl(null); setSelectedReceiptName(null); }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl shadow transition"
              >
                Pencereyi Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 HIGH FIDELITY WEEKLY CASH REPORT PRINT OVERLAY MODEL WITH IMAGES      */}
      {/* ========================================================================= */}
      {showWeeklyReportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 flex items-start justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-7xl shadow-2xl flex flex-col overflow-hidden my-4 text-slate-900">
            
            {/* Modal Actions Header */}
            <div className="bg-slate-900 text-white p-4 flex flex-wrap justify-between items-center gap-3 px-6 shrink-0 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl">💰</span>
                <h3 className="font-display font-bold text-sm">
                  Haftalık Kasa Gelir / Gider Defteri Baskı Önizlemesi
                </h3>
              </div>
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.querySelector('.kasa-report-printable-area');
                    const html = el
                      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Haftalık Kasa Raporu</title></head><body>${el.innerHTML}</body></html>`
                      : undefined;
                    void import('../lib/reportEmail').then(({ openReportEmailComposer }) => {
                      openReportEmailComposer({
                        subject: 'Kibritçi — Haftalık Kasa Raporu',
                        body: 'Haftalık kasa mutabakat raporu merkeze bilginize sunulmuştur.',
                        html,
                        fileName: 'Kibritci_Haftalik_Kasa.html',
                        defaultTo: 'yonetim@kibritci.com',
                      });
                    });
                  }}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  📧 E-posta ile Gönder
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  🖨️ Yazdır / PDF Olarak Kaydet (Ctrl+P)
                </button>
                <button
                  onClick={() => {
                    const el = document.querySelector('.kasa-report-printable-area');
                    if (el) {
                      const heading = `Kibritci_Insaat_Haftalik_Kasa_Raporu_${appliedStartDate}_to_${appliedEndDate}`;
                      const blob = new Blob([`
                        <html>
                          <head>
                            <meta charset="utf-8">
                            <title>Şantiye Haftalık Kasa Raporu</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                          </head>
                          <body class="p-8 bg-white text-slate-900 font-sans">
                            ${el.innerHTML}
                          </body>
                        </html>
                      `], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${heading}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                      alert("Haftalık kasa döküm mutabakat raporu başarıyla derlendi ve masaüstünüze HTML/Yazdırılabilir formatta kaydedildi.");
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  💾 Masaüstüne HTML Rapor Dosyası Kaydet
                </button>
                <button
                  onClick={() => setShowWeeklyReportModal(false)}
                  className="bg-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            {/* Document Body Area suitable for landscape rendering */}
            <div className="flex-1 overflow-auto bg-white p-4 sm:p-8 lg:p-12 text-slate-900 kasa-report-printable-area font-sans">
              <CorporateReportLayout
                orientation="landscape"
                docCode={`KOD: KBR-KASA-${Date.now().toString().substring(0, 8)}`}
              >
              <div className="mb-4 pb-3 border-b border-slate-200">
                
                <p className="text-[10px] text-slate-650 mt-1">Sorgu Aralığı: <strong className="text-slate-900 font-black">{appliedStartDate} / {appliedEndDate}</strong></p>
              </div>

              {/* Title Header Section */}
              <div className="text-center mb-6">
                <h2 className="text-sm font-bold text-slate-905 tracking-wider uppercase border-y border-slate-200 py-2.5 bg-slate-50">
                  ŞANTİYE HAFTALIK NAKİT AKIŞ VE KASA HAREKETLERİ CETVELİ
                </h2>
              </div>

              {/* Statistical Summary Box inside Report */}
              <div className="grid grid-cols-3 gap-4 border p-4 rounded-xl mb-6 bg-slate-50/50 text-xs">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">YAZDIRILAN GİRİŞ TOPLAMI</p>
                  <p className="text-sm font-black text-emerald-700 mt-1">₺{filteredHareketler.filter(k=>k.hareketTipi==='GİRİŞ').reduce((s,c)=>s+c.tutar,0).toLocaleString('tr-TR', {minimumFractionDigits:2})}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">YAZDIRILAN ÇIKIŞ TOPLAMI</p>
                  <p className="text-sm font-black text-rose-700 mt-1">₺{filteredHareketler.filter(k=>k.hareketTipi==='ÇIKIŞ').reduce((s,c)=>s+c.tutar,0).toLocaleString('tr-TR', {minimumFractionDigits:2})}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">SORGULANAN ARALIK NET KASA BAKİYESİ</p>
                  <p className="text-sm font-black text-amber-700 mt-1">₺{(filteredHareketler.filter(k=>k.hareketTipi==='GİRİŞ').reduce((s,c)=>s+c.tutar,0) - filteredHareketler.filter(k=>k.hareketTipi==='ÇIKIŞ').reduce((s,c)=>s+c.tutar,0)).toLocaleString('tr-TR', {minimumFractionDigits:2})}</p>
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-slate-350 rounded-md overflow-hidden mb-8">
                <table className="w-full text-[9px] border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                      <th className="p-2 border-r border-slate-300 w-24 text-left">Tarih</th>
                      <th className="p-2 border-r border-slate-300 w-24 text-left">İşlem Tipi</th>
                      <th className="p-2 border-r border-slate-300 text-left">Açıklama</th>
                      
                      <th className="p-2 text-right w-36">İşlem Tutarı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHareketler.map((kh, idx) => (
                      <tr key={kh.id || idx} className="border-b border-slate-200 hover:bg-slate-50 font-medium">
                        <td className="p-2 border-r border-slate-300 font-mono text-slate-500">{kh.tarih}</td>
                        <td className="p-2 border-r border-slate-300 font-bold text-[9px]">
                          <span className={kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-700' : 'text-rose-700'}>
                            {kh.hareketTipi}
                          </span>
                        </td>
                        <td className="p-2 border-r border-slate-300 text-slate-800 font-semibold">{kh.aciklama}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-slate-450 uppercase">{kh.referansTipi} {kh.referansId ? `[No: ${kh.referansId}]` : ""}</td>
                        <td className={`p-2 text-right font-mono font-bold ${kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {kh.hareketTipi === 'GİRİŞ' ? '+' : '-'} ₺{kh.tutar.toLocaleString('tr-TR', {minimumFractionDigits:2})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* INLINE ATTACHMENTS / RECEIPTS SECTION AS REQUESTED */}
              <div className="mt-8 space-y-4 print:break-inside-avoid">
                <h3 className="text-xs font-black text-[#1E4E78] uppercase border-b-2 border-[#1E4E78] pb-1 tracking-wider">
                  📷 RAPOR EKİ FİŞ, FATURA VE HARCAMA DOSYA RESİMLERİ
                </h3>
                
                {filteredHareketler.filter(k => k.fisEvrakUrl).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Rapor kapsamına girmiş herhangi bir fiş görseli veya fatura eki eklenmemiştir.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {filteredHareketler.filter(k => k.fisEvrakUrl).map((kh, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col items-center justify-between text-center space-y-2">
                        <div className="text-[10px] text-slate-600 font-bold uppercase truncate max-w-[200px]">
                          {kh.tarih} · {kh.aciklama}
                        </div>
                        <img 
                          src={kh.fisEvrakUrl} 
                          alt="Fiş Fotoğrafı" 
                          className="max-h-[140px] rounded object-contain border bg-white" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[8px] text-slate-400 font-mono uppercase tracking-tight">KONTROL ID: {kh.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Official corporate Sign-off Area arranged in user specified order */}
              <div className="mt-12 text-xs print:break-inside-avoid">
                <div className="bg-[#1E4E78] text-white p-2 text-[9px] font-bold uppercase tracking-wider mb-6 rounded-md">
                  📌 FİNANSAL HAKEDİŞ VE BORDRO NAKİT AKIŞ MERCİLERİ
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">1. MUHASEBE</span>
                    
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">Bordro Yetkilisi</span>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">2. İDARİ İŞLER</span>
                    
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">İdari İşler Şefi</span>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">3. ŞANTİYE ŞEFİ</span>
                    
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">Şantiye Şefi</span>
                  </div>

                  <div className="border border-slate-150 p-3 rounded-xl bg-slate-50">
                    <span className="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">4. PROJE MÜDÜRÜ</span>
                    
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">Proje Müdürü</span>
                  </div>

                </div>
              </div>

              </CorporateReportLayout>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default KasaScreen;

