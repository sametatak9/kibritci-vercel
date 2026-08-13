import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Calendar, Trash2, ShieldAlert, CheckCircle, FileText, ChevronRight, RefreshCw, Database, Undo2, Redo2, Camera, DollarSign, Tag } from 'lucide-react';
import { Personel, AylikYoklamaMap, YoklamaDurum, SahaFaaliyeti, KampFaaliyet } from '../types/erp';
import { normalizeDateKey, formatDateLabelTr } from '../lib/dateKeyUtils';
import {
  formatMesaiFaaliyetLabel,
  getFaaliyetFotolar,
  isMesaiSahaFaaliyet,
  mesaiInputDisplayValue,
  parseMesaiInputValue,
} from '../lib/sahaFaaliyetUtils';
import {
  buildFaaliyetPersoneller,
  getPersonFaaliyetleriInPeriod,
} from '../lib/faaliyetPersonelUtils';
import { CorporateReportLayout } from './CorporateReportLayout';
import { loadKibritciLogoDataUrl } from '../lib/kibritciBrand';
import { buildPersonelListForMonth, findPersonelByName, getBoundaryDayInMonth, getYoklamaDay, isDayActiveForPersonel, isPersonelVisibleInMonth, normalizeTurkishName, parseFlexibleDateParts, setYoklamaDay } from '../lib/yoklamaUtils';
import { exportModernPuantajExcel } from '../lib/modernPuantajExcel';
import { exportAktifPersonelMaasMesaiExcel } from '../lib/aktifPersonelMaasMesaiExcel';
import { importAllLegacyExcelMonths, importLegacyExcelMonth, aiMonthlyDataToLegacyMonth, resolveStubPersonelFromLegacyId } from '../lib/legacyYoklamaImport';
import { LEGACY_EXCEL_MONTHS } from '../data/legacyExcelYoklama';
import { fetchApiJson } from '../lib/apiClient';
import {
  listYoklamaArchives,
  restoreYoklamaFromArchive,
  YoklamaArchiveEntry,
} from '../lib/yoklamaPersistence';
import type { YoklamaSaveSource } from '../lib/yoklamaPersistence';
import { countYoklamaFilledDays, countYoklamaPersons } from '../lib/yoklamaGuard';
import {
  buildGunlukYoklamaOzet,
  buildGunlukYoklamaRaporHtml,
  buildGunlukYoklamaSatirlari,
  groupGunlukYoklamaSatirlariByGorev,
  openGunlukYoklamaRaporHtml,
  type GunlukYoklamaRaporGrup,
} from '../lib/yoklamaGunRaporu';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  buildYoklamaEtiketOzeti,
  collectUsedYoklamaEtiketleri,
  mergeYoklamaEtiketKatalogu,
  normalizeYoklamaEtiketi,
  yoklamaEtiketBadgeClass,
  yoklamaEtiketOptionsWithCustom,
  YOKLAMA_ACIKLAMA_MAX,
  YOKLAMA_ETIKETSIZ,
} from '../lib/yoklamaEtiketUtils';
import {
  rememberYoklamaMeslekEtiketleri,
  subscribeYoklamaMeslekEtiketleri,
} from '../lib/yoklamaMeslekEtiketPersistence';

/** Seçili ayda Girilmedi dışı dolu hücre sayısı */
function countFilledDaysInMonth(map: AylikYoklamaMap, year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  let n = 0;
  for (const personMap of Object.values(map || {})) {
    if (!personMap || typeof personMap !== 'object') continue;
    for (const [key, data] of Object.entries(personMap)) {
      if (!key.startsWith(prefix)) continue;
      const durum = (data as { durum?: string })?.durum;
      if (durum && durum !== 'Girilmedi') n++;
    }
  }
  return n;
}

const maskName = (name?: string): string => {
  return name || '';
};

function YoklamaGunAciklamaInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = () => {
    const next = text.trim().slice(0, YOKLAMA_ACIKLAMA_MAX);
    if (next !== value) onCommit(next);
    else if (text !== next) setText(next);
  };

  return (
    <input
      type="text"
      value={text}
      maxLength={YOKLAMA_ACIKLAMA_MAX}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder="Açıklama yazın…"
      title="Etiketten bağımsız günlük açıklama"
      className="w-full min-w-[140px] text-[10px] font-semibold bg-amber-50 border border-amber-300 rounded px-1.5 py-1 text-slate-800 print:hidden"
    />
  );
}

interface YoklamaScreenProps {
  personeller: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
  yoklamalar: AylikYoklamaMap;
  setYoklamalar: React.Dispatch<React.SetStateAction<AylikYoklamaMap>>;
  saveYoklamalarNow?: (
    next: AylikYoklamaMap,
    kaynak?: YoklamaSaveSource
  ) => Promise<unknown>;
  /** IndexedDB atlayıp sunucudan oku (Firestore'a yazmaz) */
  reloadYoklamalarFromServer?: () => Promise<{
    personCount: number;
    filledDayCount: number;
    map: AylikYoklamaMap;
  }>;
  addNotification?: (mesaj: string) => void;
  sahaFaaliyetleri?: SahaFaaliyeti[];
  onOpenFaaliyetPersonel?: () => void;
}

export const YoklamaScreen: React.FC<YoklamaScreenProps> = ({ 
  personeller,
  setPersoneller,
  yoklamalar, 
  setYoklamalar,
  saveYoklamalarNow,
  reloadYoklamalarFromServer,
  addNotification,
  sahaFaaliyetleri = [],
  onOpenFaaliyetPersonel,
}) => {
  const MAX_MESAI_SAATI = 14;
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Custom Overtime state variables
  const [overtimeStaffId, setOvertimeStaffId] = useState<string>("ALL");
  const [overtimeDay, setOvertimeDay] = useState<number>(() => {
    const now = new Date();
    return now.getDate();
  });
  const [overtimeHours, setOvertimeHours] = useState<number>(2);
  const [overtimeEtiket, setOvertimeEtiket] = useState<string>('');
  const [overtimeEtiketCustom, setOvertimeEtiketCustom] = useState<string>('');
  const [kayitliEtiketler, setKayitliEtiketler] = useState<string[]>([]);
  const [etiketYazanId, setEtiketYazanId] = useState<string | null>(null);
  const [etiketYazi, setEtiketYazi] = useState<string>('');
  const harvestedEtiketRef = useRef(false);

  // AI Daily Yoklama state variables
  const [showAiUpload, setShowAiUpload] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [parsedDate, setParsedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [parsedRecords, setParsedRecords] = useState<any[]>([]);
  const [aiSuccess, setAiSuccess] = useState(false);
  const [aiUnmatched, setAiUnmatched] = useState<string[]>([]);
  const [legacyImporting, setLegacyImporting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archives, setArchives] = useState<YoklamaArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveRestoringId, setArchiveRestoringId] = useState<string | null>(null);
  const [draftYoklamalar, setDraftYoklamalar] = useState<AylikYoklamaMap>(yoklamalar);
  const [undoStack, setUndoStack] = useState<AylikYoklamaMap[]>([]);
  const [redoStack, setRedoStack] = useState<AylikYoklamaMap[]>([]);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [serverRefreshLoading, setServerRefreshLoading] = useState(false);

  // Report formatting state
  const [reportType, setReportType] = useState<'NORMAL' | 'E-IMZALI'>('NORMAL');

  // Bireysel Yoklama modal states
  const [showBireyselModal, setShowBireyselModal] = useState(false);
  const [bireyselStaffId, setBireyselStaffId] = useState("");
  const [bireyselMonth, setBireyselMonth] = useState(selectedMonth);
  const [bireyselYear, setBireyselYear] = useState(selectedYear);

  const [sahaPreviewPerson, setSahaPreviewPerson] = useState<Personel | null>(null);
  const [kampFaaliyetleri, setKampFaaliyetleri] = useState<KampFaaliyet[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snap) => {
      const list: KampFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<KampFaaliyet, 'id'>) }));
      setKampFaaliyetleri(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    return subscribeYoklamaMeslekEtiketleri(setKayitliEtiketler);
  }, []);

  useEffect(() => {
    if (harvestedEtiketRef.current) return;
    if (Object.keys(yoklamalar || {}).length === 0) return;
    harvestedEtiketRef.current = true;
    const used = collectUsedYoklamaEtiketleri(yoklamalar);
    if (used.length === 0) return;
    void rememberYoklamaMeslekEtiketleri(used, kayitliEtiketler);
  }, [yoklamalar, kayitliEtiketler]);

  useEffect(() => {
    const now = new Date();
    if (selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1) {
      setOvertimeDay(now.getDate());
    } else {
      setOvertimeDay(1);
    }
  }, [selectedYear, selectedMonth]);

  const handlePersonDoubleClick = (p: Personel) => {
    setSahaPreviewPerson(p);
  };

  useEffect(() => {
    if (!sahaPreviewPerson) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSahaPreviewPerson(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sahaPreviewPerson]);

  useEffect(() => {
    if (!hasPendingChanges) {
      setDraftYoklamalar(yoklamalar);
      setUndoStack([]);
      setRedoStack([]);
      return;
    }
    // Takılı boş/zayıf taslak, dolu sunucu haritasını gizlemesin (masaüstü sık)
    const remoteFilled = countYoklamaFilledDays(yoklamalar);
    const localFilled = countYoklamaFilledDays(draftYoklamalar);
    if (remoteFilled > localFilled + 20) {
      setDraftYoklamalar(yoklamalar);
      setHasPendingChanges(false);
      setUndoStack([]);
      setRedoStack([]);
      if (addNotification) {
        addNotification(
          `Yoklama taslağı sunucu ile senkronlandı (${remoteFilled} dolu gün). Kaydedilmemiş zayıf taslak atıldı.`
        );
      }
    }
  }, [yoklamalar, hasPendingChanges, draftYoklamalar, addNotification]);

  const handleForceServerRefresh = async () => {
    if (!reloadYoklamalarFromServer) {
      alert('Sunucu yenileme bu oturumda kullanılamıyor. Sayfayı Ctrl+Shift+R ile yenileyin.');
      return;
    }
    setServerRefreshLoading(true);
    try {
      const stats = await reloadYoklamalarFromServer();
      setHasPendingChanges(false);
      setUndoStack([]);
      setRedoStack([]);
      setDraftYoklamalar(stats.map);
      if (addNotification) {
        addNotification(
          `Yoklama yenilendi: ${stats.personCount} personel · ${stats.filledDayCount} dolu gün.`
        );
      }
      alert(
        `Yoklama yüklendi.\nPersonel: ${stats.personCount}\nDolu gün: ${stats.filledDayCount}\n\nHâlâ boşsa «Yoklama Arşivi» ile yedek geri yükleyin. (PC önce önbellek/ay yedeği kullanır.)`
      );
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Sunucu yenilemesi başarısız';
      const msg = /FIRESTORE_TIMEOUT/i.test(raw)
        ? 'Bağlantı zaman aşımı. PC önbelleği veya ay yedeklerinden yüklenmeye çalışıldı; hâlâ boşsa «Yoklama Arşivi»nden geri yükleyin.'
        : raw;
      alert(msg);
    } finally {
      setServerRefreshLoading(false);
    }
  };

  const updateDraftYoklama = (
    updater: AylikYoklamaMap | ((prev: AylikYoklamaMap) => AylikYoklamaMap)
  ) => {
    setDraftYoklamalar((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (prev === next) return prev;
      // Derin klon yok: prev zaten immutable anlık görüntü
      setUndoStack((stack) => {
        const merged = [...stack, prev];
        return merged.length > 80 ? merged.slice(merged.length - 80) : merged;
      });
      setRedoStack([]);
      setHasPendingChanges(true);
      return next;
    });
  };

  const handleSaveYoklamaToDb = async () => {
    if (!hasPendingChanges || savingDraft) return;
    setSavingDraft(true);
    try {
      if (saveYoklamalarNow) {
        await saveYoklamalarNow(draftYoklamalar, 'yoklama_screen');
      } else {
        setYoklamalar(draftYoklamalar);
      }
      const now = new Date();
      const savedLabel = now.toLocaleString('tr-TR');
      setLastSavedAt(savedLabel);
      setHasPendingChanges(false);
      setUndoStack([]);
      setRedoStack([]);
      if (addNotification) {
        addNotification(`${selectedMonth}. Ay ${selectedYear} yoklama/mesai değişiklikleri güvenli kayıt ile veritabanına yazıldı.`);
      }
      void rememberYoklamaMeslekEtiketleri(
        collectUsedYoklamaEtiketleri(draftYoklamalar),
        kayitliEtiketler
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Yoklama kaydedilemedi';
      alert(`Kayıt başarısız — veriler korundu:\n${msg}`);
    } finally {
      setTimeout(() => setSavingDraft(false), 300);
    }
  };

  const loadArchiveList = async () => {
    setArchiveLoading(true);
    try {
      const list = await listYoklamaArchives(30);
      setArchives(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Arşiv listesi alınamadı';
      alert(msg);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleToggleArchivePanel = () => {
    const next = !archiveOpen;
    setArchiveOpen(next);
    if (next && archives.length === 0) {
      void loadArchiveList();
    }
  };

  const handleRestoreArchive = async (archiveId: string) => {
    const entry = archives.find((a) => a.id === archiveId);
    const label = entry
      ? new Date(entry.olusturmaTarihi).toLocaleString('tr-TR')
      : archiveId;
    if (
      !window.confirm(
        `${label} tarihli yoklama yedeği geri yüklenecek.\nMevcut kayıt da otomatik yedeklenir.\nDevam?`
      )
    ) {
      return;
    }
    setArchiveRestoringId(archiveId);
    try {
      const result = await restoreYoklamaFromArchive(archiveId);
      if (!result.ok) {
        throw new Error(result.error || 'Geri yükleme başarısız');
      }
      setHasPendingChanges(false);
      setUndoStack([]);
      setRedoStack([]);
      if (addNotification) {
        addNotification(
          `Yoklama arşivi geri yüklendi (${result.filledDayCount ?? '?'} dolu gün, ${result.personCount ?? '?'} personel).`
        );
      }
      alert('Arşiv başarıyla geri yüklendi. Ekran birkaç saniye içinde güncellenecek.');
      void loadArchiveList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Geri yükleme başarısız';
      alert(msg);
    } finally {
      setArchiveRestoringId(null);
    }
  };

  const handleResetDraftFromDb = () => {
    if (!hasPendingChanges) return;
    if (!window.confirm('Kaydedilmemiş değişiklikler silinecek ve son veritabanı hali geri yüklenecek. Devam?')) return;
    setDraftYoklamalar(yoklamalar);
    setHasPendingChanges(false);
    setUndoStack([]);
    setRedoStack([]);
  };

  const handleUndoDraftChange = () => {
    if (undoStack.length === 0 || savingDraft) return;
    const previous = undoStack[undoStack.length - 1];
    const current = draftYoklamalar;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current]);
    setDraftYoklamalar(previous);
    setHasPendingChanges(previous !== yoklamalar);
  };

  const handleRedoDraftChange = () => {
    if (redoStack.length === 0 || savingDraft) return;
    const next = redoStack[redoStack.length - 1];
    const current = draftYoklamalar;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current]);
    setDraftYoklamalar(next);
    setHasPendingChanges(next !== yoklamalar);
  };

  const handleAiFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiLoading(true);
    setAiError(null);
    setAiSuccess(false);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        try {
          const json = await fetchApiJson<{ success: boolean; data?: { tarih?: string; yoklamaKayitlari?: any[] }; error?: string }>(
            '/api/parse-daily-yoklama',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileBase64: base64Data,
                mimeType: file.type
              })
            }
          );
          if (json.success && json.data) {
            setParsedDate(json.data.tarih || new Date().toISOString().split('T')[0]);
            setParsedRecords(json.data.yoklamaKayitlari || []);
            setAiUnmatched([]);
            setAiSuccess(true);
          } else {
            setAiError(json.error || "Gemini AI yoklama tablosunu okuyamadı. Lütfen daha net bir fotoğraf veya PDF yükleyin.");
          }
        } catch (err: any) {
          setAiError(err.message || 'Bağlantı hatası');
        } finally {
          setAiLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setAiError(`Dosya okuma hatası: ${err.message}`);
      setAiLoading(false);
    }
  };

  const handleCommitAiYoklama = () => {
    if (parsedRecords.length === 0) return;

    const dateParts = parsedDate.split('-').map(Number);
    const pYear = dateParts[0] || selectedYear;
    const pMonth = dateParts[1] || selectedMonth;
    const pDay = dateParts[2] || 1;
    setSelectedMonth(pMonth);
    setSelectedYear(pYear);

    const unmatched: string[] = [];
    let matchedCount = 0;

    updateDraftYoklama(prev => {
      const updated = { ...prev };
      parsedRecords.forEach(rec => {
        const emp = findPersonelByName(personeller, rec.adSoyad || '');
        if (!emp) {
          unmatched.push(rec.adSoyad || 'Bilinmeyen');
          return;
        }
        const validDurum = ['Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil'].includes(rec.durum)
          ? rec.durum as YoklamaDurum
          : 'Geldi';
        updated[emp.id] = setYoklamaDay(updated[emp.id], pYear, pMonth, pDay, {
          ...getYoklamaDay(updated[emp.id], pYear, pMonth, pDay),
          durum: validDurum,
          mesaiSaati: Number(rec.mesaiSaati) || 0
        });
        matchedCount++;
      });
      return updated;
    });

    setAiUnmatched(unmatched);
    const msg = unmatched.length > 0
      ? `${matchedCount} kayıt işlendi. Eşleşmeyen isimler: ${unmatched.join(', ')}`
      : `${parsedDate} tarihli ${matchedCount} yoklama kaydı taslağa işlendi. "Günü Kaydet" ile DB'ye gönderin.`;
    alert(msg);
    if (unmatched.length === 0) {
      setShowAiUpload(false);
      setParsedRecords([]);
      setAiSuccess(false);
    }
  };

  const handleMonthlyExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !setPersoneller) return;

    setAiLoading(true);
    setAiError(null);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const json = await fetchApiJson<{ success: boolean; data?: any; error?: string }>(
        '/api/parse-monthly-excel-yoklama',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64Data, mimeType: file.type })
        }
      );
      if (!json.success || !json.data) throw new Error('Aylık Excel okunamadı');

      const monthData = aiMonthlyDataToLegacyMonth(json.data);
      const result = importLegacyExcelMonth(monthData, personeller, draftYoklamalar);
      setPersoneller(result.personeller);
      updateDraftYoklama(result.yoklamalar);
      setSelectedMonth(monthData.month);
      setSelectedYear(monthData.year);
      alert(
        `${monthData.month}/${monthData.year} Excel yoklaması aktarıldı.\n` +
        `• ${result.importedDays} gün yazıldı\n` +
        `• ${result.createdPersonel.length} yeni personel\n` +
        `• ${result.matchedPersonel.length} eşleşme`
      );
    } catch (err: any) {
      setAiError(err.message || 'Aylık Excel yüklenemedi');
    } finally {
      setAiLoading(false);
      e.target.value = '';
    }
  };

  const handleLegacyExcelImport = () => {
    const restoreMonths = LEGACY_EXCEL_MONTHS.filter((m) => m.year === 2026 && [3, 4, 5].includes(m.month));
    if (!window.confirm(`Sadece Mart-Nisan-Mayıs (${restoreMonths.length} ay) yoklamaları geri yüklenecek.\nHaziran AYNI KALACAK ve yeni personel oluşturulmayacak.\nDevam?`)) {
      return;
    }
    setLegacyImporting(true);
    try {
      const result = importAllLegacyExcelMonths(restoreMonths, personeller, draftYoklamalar, {
        allowCreatePersonel: false,
        replaceMonthData: true,
      });
      updateDraftYoklama(result.yoklamalar);
      const monthNames = restoreMonths.map(m => `${m.month}/${m.year}`).join(', ');
      alert(
        `Yoklama geri yükleme tamamlandı (${monthNames}).\n` +
        `• ${result.importedDays} gün yoklama yazıldı\n` +
        `• ${result.createdPersonel.length} yeni personel oluşturuldu (beklenen: 0)\n` +
        `• ${result.matchedPersonel.length} mevcut personelle eşleşti\n` +
        (result.skippedDuplicates > 0 ? `• ${result.skippedDuplicates} tekrar kayıt atlandı\n` : '') +
        (result.warnings.length > 0 ? `\nUyarılar:\n${result.warnings.join('\n')}` : '')
      );
      if (addNotification) {
        addNotification(`Mart-Nisan-Mayıs yoklamaları geri yüklendi (Haziran korundu): ${result.importedDays} gün, ${result.createdPersonel.length} yeni personel.`);
      }
    } finally {
      setLegacyImporting(false);
    }
  };

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const yoklamaLoadStats = useMemo(() => {
    const source = hasPendingChanges ? draftYoklamalar : yoklamalar;
    const thisMonth = countFilledDaysInMonth(source, selectedYear, selectedMonth);
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const prevFilled = countFilledDaysInMonth(source, prevYear, prevMonth);

    // Bu ay boş ama haritada başka ay doluysa (yanlış yıl/ay seçimi) en dolu dönemi bul
    let bestYear = selectedYear;
    let bestMonth = selectedMonth;
    let bestFilled = thisMonth;
    if (thisMonth === 0) {
      const monthTotals = new Map<string, number>();
      for (const personMap of Object.values(source || {})) {
        if (!personMap || typeof personMap !== 'object') continue;
        for (const [key, data] of Object.entries(personMap)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
          const durum = (data as { durum?: string })?.durum;
          if (!durum || durum === 'Girilmedi') continue;
          const ym = key.slice(0, 7);
          monthTotals.set(ym, (monthTotals.get(ym) || 0) + 1);
        }
      }
      for (const [ym, n] of monthTotals) {
        if (n > bestFilled) {
          bestFilled = n;
          bestYear = Number(ym.slice(0, 4));
          bestMonth = Number(ym.slice(5, 7));
        }
      }
    }

    return {
      persons: countYoklamaPersons(source),
      filledTotal: countYoklamaFilledDays(source),
      thisMonth,
      prevMonth,
      prevYear,
      prevFilled,
      bestYear,
      bestMonth,
      bestFilled,
    };
  }, [yoklamalar, draftYoklamalar, hasPendingChanges, selectedYear, selectedMonth]);

  // Yoklama codes list for cycling: G: Geldi, Y: Yok, İ: İzinli, R: Raporlu, P: Pazar, T: Tatil
  const statusCycle: YoklamaDurum[] = ['Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil', 'Girilmedi'];
   
  const getStatusColor = (status: YoklamaDurum) => {
    switch (status) {
      case 'Geldi': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Yok': return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'İzinli': return 'bg-sky-100 text-slate-800 border-sky-200';
      case 'Raporlu': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Pazar': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Tatil': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  const getStatusAbbreviation = (status: YoklamaDurum) => {
    switch (status) {
      case 'Geldi': return 'G';
      case 'Yok': return 'Y';
      case 'İzinli': return 'İ';
      case 'Raporlu': return 'R';
      case 'Pazar': return 'P';
      case 'Tatil': return 'T';
      default: return '-';
    }
  };

  const dayOfWeekAbbreviation = (day: number) => {
    const d = new Date(selectedYear, selectedMonth - 1, day);
    const dayNames = ["Pa", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];
    return dayNames[d.getDay()];
  };

  const isSundayOrPublicHoliday = (day: number) => {
    const d = new Date(selectedYear, selectedMonth - 1, day);
    const isSunday = d.getDay() === 0;
    
    // Check Turkey national holidays:
    const month = selectedMonth; // 1-indexed
    if (month === 1 && day === 1) return { isHoliday: true, name: 'Yılbaşı', isOfficial: true };
    if (month === 4 && day === 23) return { isHoliday: true, name: '23 Nisan', isOfficial: true };
    if (month === 5 && day === 1) return { isHoliday: true, name: '1 Mayıs', isOfficial: true };
    if (month === 5 && day === 19) return { isHoliday: true, name: '19 Mayıs', isOfficial: true };
    if (month === 7 && day === 15) return { isHoliday: true, name: '15 Temmuz', isOfficial: true };
    if (month === 8 && day === 30) return { isHoliday: true, name: '30 Ağustos', isOfficial: true };
    if (month === 10 && day === 29) return { isHoliday: true, name: '29 Ekim', isOfficial: true };
    
    return { isHoliday: isSunday, name: isSunday ? 'Pazar' : '', isOfficial: false };
  };

  const monthPersoneller = useMemo(
    () => buildPersonelListForMonth(personeller, draftYoklamalar, selectedYear, selectedMonth, resolveStubPersonelFromLegacyId),
    [personeller, draftYoklamalar, selectedYear, selectedMonth]
  );

  const faaliyetPersonelCount = useMemo(
    () =>
      buildFaaliyetPersoneller(
        sahaFaaliyetleri,
        personeller,
        selectedYear,
        selectedMonth,
        kampFaaliyetleri,
        draftYoklamalar
      ).length,
    [sahaFaaliyetleri, kampFaaliyetleri, personeller, selectedYear, selectedMonth, draftYoklamalar]
  );

  const sahaPreviewFaaliyetleri = useMemo(() => {
    if (!sahaPreviewPerson) return [] as SahaFaaliyeti[];
    return getPersonFaaliyetleriInPeriod(
      sahaPreviewPerson,
      sahaFaaliyetleri,
      selectedYear,
      selectedMonth
    );
  }, [sahaPreviewPerson, sahaFaaliyetleri, selectedYear, selectedMonth]);

  const isEmployeeVisibleInMonth = (p: Personel) =>
    isPersonelVisibleInMonth(p, selectedYear, selectedMonth, draftYoklamalar[p.id]);

  const isDayActiveForEmployeeInPeriod = (p: Personel, year: number, month: number, day: number) =>
    isDayActiveForPersonel(p, year, month, day, draftYoklamalar[p.id]);

  const isDayActiveForEmployee = (p: Personel, day: number) =>
    isDayActiveForEmployeeInPeriod(p, selectedYear, selectedMonth, day);

  const handleCellClick = (personelId: string, day: number) => {
    const p = personeller.find(emp => emp.id === personelId);
    if (p && !isDayActiveForEmployee(p, day)) return;

    const dayData = getYoklamaDay(draftYoklamalar[personelId], selectedYear, selectedMonth, day) || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 };
    
    const currentIndex = statusCycle.indexOf(dayData.durum);
    const nextIndex = (currentIndex + 1) % statusCycle.length;
    const nextStatus = statusCycle[nextIndex];

    updateDraftYoklama(prev => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], selectedYear, selectedMonth, day, {
        ...dayData,
        durum: nextStatus
      })
    }));

    if (addNotification && p) {
      addNotification(`${maskName(`${p.ad} ${p.soyad}`)} için ${day}. gün durumu "${nextStatus}" yapıldı.`);
    }
  };

  const normalizeMesaiHours = (raw: number): number => {
    const safe = Number.isFinite(raw) ? raw : 0;
    const clamped = Math.max(0, Math.min(MAX_MESAI_SAATI, safe));
    return Math.round(clamped * 2) / 2;
  };

  const parseMesaiInput = (raw: string): number => {
    const normalized = raw.replace(',', '.').trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;
    return normalizeMesaiHours(parsed);
  };

  const handleMesaiChange = (personelId: string, day: number, hours: number) => {
    const p = personeller.find(emp => emp.id === personelId);
    if (p && !isDayActiveForEmployee(p, day)) return;

    const dayData = getYoklamaDay(draftYoklamalar[personelId], selectedYear, selectedMonth, day) || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 };
    const normalizedHours = normalizeMesaiHours(hours);
    if (Number(dayData.mesaiSaati || 0) === normalizedHours) return;

    updateDraftYoklama(prev => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], selectedYear, selectedMonth, day, {
        ...dayData,
        mesaiSaati: normalizedHours
      })
    }));

    if (addNotification && p) {
      addNotification(`${maskName(`${p.ad} ${p.soyad}`)} için ${day}. gün mesai saati ${normalizedHours} olarak ayarlandı.`);
    }
  };

  const handleBulkSetStatus = (status: YoklamaDurum) => {
    if (status === 'Girilmedi') {
      if (
        !window.confirm(
          'Seçili ayın TÜM aktif personel günleri sıfırlanacak (Girilmedi).\nBu işlem kayıt sırasında güvenlik kontrolünden geçer; büyük silmeler engellenebilir.\nDevam?'
        )
      ) {
        return;
      }
    }
    const newYoklamalar = { ...draftYoklamalar };
    
    monthPersoneller.forEach(p => {
      let personMap = { ...(newYoklamalar[p.id] || {}) };
      daysArray.forEach(d => {
        if (!isDayActiveForEmployee(p, d)) return;
        const isSunday = new Date(selectedYear, selectedMonth - 1, d).getDay() === 0;
        const existing = getYoklamaDay(personMap, selectedYear, selectedMonth, d);
        personMap = setYoklamaDay(personMap, selectedYear, selectedMonth, d, {
          ...existing,
          durum: isSunday ? 'Pazar' : status,
          mesaiSaati: existing?.mesaiSaati || 0
        });
      });
      newYoklamalar[p.id] = personMap;
    });
    
    updateDraftYoklama(newYoklamalar);
    alert(`Seçili ayın tüm günleri aktif personeller için topluca "${status}" olarak güncellendi. Kaydet ile veritabanına gönderin.`);
    if (addNotification) {
      addNotification(`${selectedMonth}. Ay / ${selectedYear} dönemi tüm yoklama durumları topluca "${status}" yapıldı.`);
    }
  };

  const [printModal, setPrintModal] = useState<'NONE' | 'MAAS_RAPORU' | 'GUN_RAPORU'>('NONE');

  const gunRaporSatirlari = useMemo(
    () =>
      buildGunlukYoklamaSatirlari(
        personeller,
        draftYoklamalar,
        selectedYear,
        selectedMonth,
        overtimeDay
      ),
    [personeller, draftYoklamalar, selectedYear, selectedMonth, overtimeDay]
  );

  const gunRaporOzet = useMemo(() => buildGunlukYoklamaOzet(gunRaporSatirlari), [gunRaporSatirlari]);

  const gunRaporGruplari = useMemo(
    () => groupGunlukYoklamaSatirlariByGorev(gunRaporSatirlari),
    [gunRaporSatirlari]
  );

  const gunRaporEtiketOzeti = useMemo(
    () => buildYoklamaEtiketOzeti(gunRaporSatirlari),
    [gunRaporSatirlari]
  );

  const kullanilmisEtiketler = useMemo(
    () => collectUsedYoklamaEtiketleri(draftYoklamalar),
    [draftYoklamalar]
  );

  const etiketKatalogu = useMemo(
    () => mergeYoklamaEtiketKatalogu([kayitliEtiketler, kullanilmisEtiketler]),
    [kayitliEtiketler, kullanilmisEtiketler]
  );

  const gunRaporGrupHeaderClass: Record<GunlukYoklamaRaporGrup, string> = {
    FORMEN: 'bg-violet-700 text-white',
    USTA: 'bg-fuchsia-700 text-white',
    SENOR: 'bg-teal-700 text-white',
    KAMP: 'bg-amber-700 text-white',
    DUZ_ISCI: 'bg-blue-700 text-white',
    DIGER: 'bg-slate-600 text-white',
  };

  const gunRaporDateKey = useMemo(
    () =>
      `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(overtimeDay).padStart(2, '0')}`,
    [selectedYear, selectedMonth, overtimeDay]
  );

  const gunRaporLabel = useMemo(() => formatDateLabelTr(gunRaporDateKey), [gunRaporDateKey]);

  const handleOpenGunRapor = () => {
    if (gunRaporSatirlari.length === 0) {
      alert(
        `${gunRaporLabel} için yoklama kaydı bulunamadı.\n\nMesai panelindeki gün numarasını kontrol edin veya önce yoklama girin.`
      );
      return;
    }
    setPrintModal('GUN_RAPORU');
  };

  const filteredPersonel = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const base = monthPersoneller.filter((p) => {
      const fullName = `${p.ad} ${p.soyad}`.toLowerCase();
      return fullName.includes(term) || p.tcNo.includes(term) || (p.gorev || '').toLowerCase().includes(term);
    });

    // Aynı isim farklı ID ile gelirse (legacy/stub vb.) listede tek satır göster.
    const byName = new Map<string, Personel>();
    const score = (p: Personel) => {
      let s = 0;
      if ((p.tcNo || '').trim()) s += 100;
      if (!p.id.startsWith('PRS-LEGACY')) s += 50;
      if (p.durum === true || String(p.durum).toLowerCase() === 'true') s += 10;
      return s;
    };
    for (const p of base) {
      const key = normalizeTurkishName(`${p.ad} ${p.soyad}`);
      const prev = byName.get(key);
      if (!prev || score(p) > score(prev)) {
        byName.set(key, p);
      }
    }
    return Array.from(byName.values());
  }, [monthPersoneller, searchTerm]);

  const handleExportExcelTables = async (emptyMode: boolean = false) => {
    // onClick={fn} event nesnesini 1. argüman yapar; yalnızca true boş şablon demektir.
    const isEmptyTemplate = emptyMode === true;
    const filled = countFilledDaysInMonth(draftYoklamalar, selectedYear, selectedMonth);
    const periodLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
      month: 'long',
      year: 'numeric',
    });
    if (
      !window.confirm(
        isEmptyTemplate
          ? `${periodLabel} için BOŞ puantaj şablonu indirilsin mi?\n(Gün/mesai hücreleri boş kalır.)`
          : `${periodLabel} dönemi Excel puantajı indirilsin mi?\n` +
              `Personel: ${filteredPersonel.length} · Dolu gün kaydı: ${filled}\n` +
              `Rapor seçili aya göredir (basım tarihi yalnızca yazdırma anıdır).`
      )
    ) {
      return;
    }
    await exportModernPuantajExcel({
      personeller: filteredPersonel,
      yoklamalar: draftYoklamalar,
      year: selectedYear,
      month: selectedMonth,
      emptyMode: isEmptyTemplate,
      filledDayCountInMonth: filled,
      skipEmptyConfirm: true,
    });
  };

  const handleExportMaasMesaiExcel = async () => {
    const aktif = filteredPersonel.filter(
      (p) => p.durum !== false && String(p.durum).toLowerCase() !== 'pasif'
    );
    if (aktif.length === 0) {
      alert('Aktif personel bulunamadı. Filtreyi kontrol edin.');
      return;
    }
    const periodLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
      month: 'long',
      year: 'numeric',
    });
    if (
      !window.confirm(
        `${periodLabel} için ALACAK MAAŞ Excel indirilsin mi?\n` +
          `Formül: (Maaş÷30) × min(Geldi,30) + Mesai Hakediş\n` +
          `(Ay 31 gün olsa bile yevmiye en fazla 30 gündür)\n` +
          `Kişi: ${aktif.length} (idari hariç)\n` +
          `Sayfalar: Alacak Maaş + Tarih Cetveli`
      )
    ) {
      return;
    }
    try {
      const count = await exportAktifPersonelMaasMesaiExcel({
        personeller: aktif,
        yoklamalar: draftYoklamalar,
        year: selectedYear,
        month: selectedMonth,
        scopeLabel: 'Yoklama — Aktif Şantiye Kadrosu',
      });
      alert(`${count} kişi için maaş/mesai Excel indirildi.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    }
  };

  const handleBulkOvertime = (hours: number) => {
    const newYoklamalar = { ...draftYoklamalar };
    
    monthPersoneller.forEach(p => {
      let personMap = { ...(newYoklamalar[p.id] || {}) };
      daysArray.forEach(d => {
        if (!isDayActiveForEmployee(p, d)) return;
        const isSunday = new Date(selectedYear, selectedMonth - 1, d).getDay() === 0;
        const existing = getYoklamaDay(personMap, selectedYear, selectedMonth, d);
        personMap = setYoklamaDay(personMap, selectedYear, selectedMonth, d, {
          ...existing,
          durum: existing?.durum || (isSunday ? 'Pazar' : 'Geldi'),
          mesaiSaati: hours
        });
      });
      newYoklamalar[p.id] = personMap;
    });

    updateDraftYoklama(newYoklamalar);
    alert(`Seçili ayın tüm iş günlerine aktif personeller için topluca günlük ${hours} saat fazla mesai işlendi. Kaydet ile veritabanına gönderin.`);
    if (addNotification) {
      addNotification(`${selectedMonth}. Ay / ${selectedYear} dönemi tüm iş günlerine topluca günlük ${hours} saat fazla mesai yazıldı.`);
    }
  };

  const handleQuickOvertimeSubmit = () => {
    if (overtimeDay < 1 || overtimeDay > daysInMonth) {
      alert(`Lütfen geçerli bir gün seçin (1-${daysInMonth}).`);
      return;
    }

    updateDraftYoklama(prev => {
      const updated = { ...prev };

      const applyToPerson = (pid: string) => {
        const p = personeller.find(emp => emp.id === pid);
        if (!p || !isEmployeeVisibleInMonth(p) || !isDayActiveForEmployee(p, overtimeDay)) return;

        const currentPersonelMap = { ...updated[pid] };
        const dayData = getYoklamaDay(currentPersonelMap, selectedYear, selectedMonth, overtimeDay) || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 };
        const targetDurum = (dayData.durum === 'Girilmedi' || dayData.durum === 'Yok') ? 'Geldi' : dayData.durum;
        
        updated[pid] = setYoklamaDay(currentPersonelMap, selectedYear, selectedMonth, overtimeDay, {
          ...dayData,
          durum: targetDurum,
          mesaiSaati: overtimeHours
        });
      };

      if (overtimeStaffId === 'ALL') {
        personeller.forEach(p => applyToPerson(p.id));
      } else {
        applyToPerson(overtimeStaffId);
      }

      return updated;
    });

    alert(`Seçilen ${overtimeDay}. güne fiili +${overtimeHours} saat mesai taslağı işlendi. Kaydet ile veritabanına gönderin.`);
    if (addNotification) {
      if (overtimeStaffId === 'ALL') {
        addNotification(`${selectedMonth}. Ay / ${selectedYear} dönemi ${overtimeDay}. günü için tüm şantiyeye +${overtimeHours} saat mesai yazıldı.`);
      } else {
        const p = personeller.find(emp => emp.id === overtimeStaffId);
        addNotification(`${p ? maskName(`${p.ad} ${p.soyad}`) : 'Personel'} için ${overtimeDay}. güne +${overtimeHours} saat mesai yazıldı.`);
      }
    }
  };

  const resolvedOvertimeEtiket = () => {
    if (overtimeEtiket === '__CUSTOM__') {
      return normalizeYoklamaEtiketi(overtimeEtiketCustom);
    }
    return normalizeYoklamaEtiketi(overtimeEtiket);
  };

  const rememberEtiket = (etiket: string) => {
    const next = normalizeYoklamaEtiketi(etiket);
    if (!next) return;
    void rememberYoklamaMeslekEtiketleri([next], kayitliEtiketler);
  };

  const applyIsEtiketiToPersonDay = (personelId: string, day: number, etiket: string) => {
    const nextEtiket = normalizeYoklamaEtiketi(etiket);
    updateDraftYoklama((prev) => {
      const p = personeller.find((emp) => emp.id === personelId);
      if (!p || !isEmployeeVisibleInMonth(p) || !isDayActiveForEmployee(p, day)) return prev;
      const dayData = getYoklamaDay(prev[personelId], selectedYear, selectedMonth, day) || {
        durum: 'Girilmedi' as YoklamaDurum,
        mesaiSaati: 0,
      };
      if (normalizeYoklamaEtiketi(dayData.isEtiketi) === nextEtiket) return prev;
      return {
        ...prev,
        [personelId]: setYoklamaDay(prev[personelId], selectedYear, selectedMonth, day, {
          ...dayData,
          isEtiketi: nextEtiket || undefined,
        }),
      };
    });
    if (nextEtiket) rememberEtiket(nextEtiket);
  };

  const applyAciklamaToPersonDay = (personelId: string, day: number, aciklama: string) => {
    const next = aciklama.trim().slice(0, YOKLAMA_ACIKLAMA_MAX);
    updateDraftYoklama((prev) => {
      const p = personeller.find((emp) => emp.id === personelId);
      if (!p || !isEmployeeVisibleInMonth(p) || !isDayActiveForEmployee(p, day)) return prev;
      const dayData = getYoklamaDay(prev[personelId], selectedYear, selectedMonth, day) || {
        durum: 'Girilmedi' as YoklamaDurum,
        mesaiSaati: 0,
      };
      if (String(dayData.aciklama || '').trim() === next) return prev;
      return {
        ...prev,
        [personelId]: setYoklamaDay(prev[personelId], selectedYear, selectedMonth, day, {
          ...dayData,
          aciklama: next || undefined,
        }),
      };
    });
  };

  const commitYeniEtiketForPerson = (personelId: string) => {
    const next = normalizeYoklamaEtiketi(etiketYazi);
    if (!next) {
      alert('Yeni meslek grubu yazın (ör. İZOLASYON).');
      return;
    }
    applyIsEtiketiToPersonDay(personelId, overtimeDay, next);
    setEtiketYazanId(null);
    setEtiketYazi('');
  };

  const handleQuickEtiketSubmit = () => {
    if (overtimeDay < 1 || overtimeDay > daysInMonth) {
      alert(`Lütfen geçerli bir gün seçin (1-${daysInMonth}).`);
      return;
    }
    const etiket = resolvedOvertimeEtiket();
    if (overtimeEtiket === '__CUSTOM__' && !etiket) {
      alert('Özel meslek grubu yazın veya listeden bir etiket seçin.');
      return;
    }

    const targetIds =
      overtimeStaffId === 'ALL' ? monthPersoneller.map((p) => p.id) : [overtimeStaffId];
    const eligibleIds = targetIds.filter((pid) => {
      const p = personeller.find((emp) => emp.id === pid);
      if (!p || !isEmployeeVisibleInMonth(p) || !isDayActiveForEmployee(p, overtimeDay)) return false;
      const dayData = getYoklamaDay(draftYoklamalar[pid], selectedYear, selectedMonth, overtimeDay);
      return !!dayData && dayData.durum !== 'Girilmedi';
    });

    if (eligibleIds.length === 0) {
      alert(
        `${overtimeDay}. günde yoklaması girilmiş personel bulunamadı. Önce yoklamayı alın, sonra meslek grubu etiketleyin.`
      );
      return;
    }

    updateDraftYoklama((prev) => {
      const updated = { ...prev };
      for (const pid of eligibleIds) {
        const dayData = getYoklamaDay(updated[pid], selectedYear, selectedMonth, overtimeDay);
        if (!dayData || dayData.durum === 'Girilmedi') continue;
        updated[pid] = setYoklamaDay(updated[pid], selectedYear, selectedMonth, overtimeDay, {
          ...dayData,
          isEtiketi: etiket || undefined,
        });
      }
      return updated;
    });

    const label = etiket || 'etiket kaldırıldı';
    alert(`${overtimeDay}. gün yoklamasına ${eligibleIds.length} kişi için «${label}» işlendi. Kaydet ile veritabanına gönderin.`);
    if (etiket) rememberEtiket(etiket);
    if (addNotification) {
      addNotification(`${overtimeDay}. gün yoklaması meslek grubu: ${label} (${eligibleIds.length} kişi).`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-grow p-3 sm:p-4 lg:p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans gap-4 lg:gap-6 select-none bg-slate-50/50">
      
      {/* Filters Row Card */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-sm flex flex-col gap-4 shrink-0">
        
        {/* Top line controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700">Dönem Seçimi:</span>
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="text-xs font-semibold border border-slate-200 rounded-lg p-1.5 focus:border-amber-400 bg-slate-50 cursor-pointer text-slate-800"
              >
                {[
                  {k: 1, v: "Ocak"}, {k: 2, v: "Şubat"}, {k: 3, v: "Mart"}, {k: 4, v: "Nisan"},
                  {k: 5, v: "Mayıs"}, {k: 6, v: "Haziran"}, {k: 7, v: "Temmuz"}, {k: 8, v: "Ağustos"},
                  {k: 9, v: "Eylül"}, {k: 10, v: "Ekim"}, {k: 11, v: "Kasım"}, {k: 12, v: "Aralık"}
                ].map(m => (
                  <option key={m.k} value={m.k}>{m.v} (Dönem {m.k})</option>
                ))}
              </select>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="text-xs font-semibold border border-slate-200 rounded-lg p-1.5 focus:border-amber-400 bg-slate-50 cursor-pointer text-slate-800"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1">
                {new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void handleExportExcelTables(false)}
              className="text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm border border-emerald-800"
              title={`Seçili dönem (${selectedMonth}/${selectedYear}) gün + mesai + hakediş Excel puantajı. Basım tarihi raporu etkilemez.`}
            >
              <FileText size={13} />
              <span>
                Modern Excel —{' '}
                {new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportMaasMesaiExcel()}
              className="text-[11px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm border border-amber-800"
              title="SADECE bu buton: Alacak = (Maaş÷30)×min(Geldi,30) + mesai×1,5. Max 30 yevmiye. Modern Excel değişmez."
            >
              <DollarSign size={13} />
              <span>
                Alacak Maaş Excel —{' '}
                {new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </button>

            {/* Quick bulk actions */}
            <div className="flex flex-wrap items-center gap-2 border-l pl-4 border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Toplu Puantaj:</span>
              <button 
                onClick={() => handleBulkSetStatus('Geldi')}
                className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-150 rounded-lg px-2 py-1 font-bold cursor-pointer transition"
              >
                ✓ Herkesi Geldi Yap
              </button>
              <button 
                onClick={() => handleBulkOvertime(2)}
                className="text-[10px] bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer transition"
                title="Her iş gününe stabil 2 saat fazla mesai yazar"
              >
                ⏱ Herkese +2sa Mesai Girişi
              </button>
              <button 
                onClick={() => handleBulkSetStatus('Girilmedi')}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-150 rounded-lg px-2 py-1 font-bold cursor-pointer transition"
              >
                Sıfırla
              </button>
            </div>
          </div>

          {/* PDF & Reports buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleUndoDraftChange}
              disabled={undoStack.length === 0 || savingDraft}
              className="text-[11px] bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Taslakta bir adım geri alır."
            >
              <Undo2 size={13} />
              <span>Geri Al</span>
            </button>
            <button
              onClick={handleRedoDraftChange}
              disabled={redoStack.length === 0 || savingDraft}
              className="text-[11px] bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Geri alınan adımı tekrar uygular."
            >
              <Redo2 size={13} />
              <span>İleri Al</span>
            </button>
            <button
              onClick={handleSaveYoklamaToDb}
              disabled={!hasPendingChanges || savingDraft}
              className="text-[11px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white border border-emerald-700 rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Puantaj ve mesai düzenlemelerini veritabanına kalıcı kaydeder."
            >
              <CheckCircle size={13} className="text-white" />
              <span>{savingDraft ? 'Kaydediliyor...' : hasPendingChanges ? 'Günü Kaydet (DB)' : 'Kaydedildi'}</span>
            </button>
            <button
              onClick={handleResetDraftFromDb}
              disabled={!hasPendingChanges}
              className="text-[11px] bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 border border-rose-200 rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Kaydedilmemiş değişiklikleri iptal edip veritabanındaki son hali yükler."
            >
              <RefreshCw size={13} className="text-rose-600" />
              <span>Taslağı Geri Al</span>
            </button>
            <button
              type="button"
              onClick={() => void handleForceServerRefresh()}
              disabled={serverRefreshLoading || !reloadYoklamalarFromServer}
              className="text-[11px] bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm disabled:opacity-50"
              title="Telefon dolu / PC boş ise IndexedDB önbelleğini atlayıp sunucudan zorla çeker. Veritabanına yazmaz."
            >
              <RefreshCw size={13} className={serverRefreshLoading ? 'animate-spin' : ''} />
              <span>{serverRefreshLoading ? 'Sunucu…' : 'Sunucudan Yenile'}</span>
            </button>
            <button
              onClick={handleToggleArchivePanel}
              className="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Otomatik yoklama yedeklerini listeler ve geri yükler."
            >
              <Database size={13} />
              <span>Yoklama Arşivi</span>
            </button>
            <button
              onClick={() => setIsEditMode(prev => !prev)}
              className={`text-[11px] rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm ${
                isEditMode 
                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300' 
                  : 'bg-slate-800 hover:bg-slate-900 text-white border border-slate-700'
              }`}
              title="Yanlışlıkla tıklamaları önlemek için tabloyu kilitler veya açar."
            >
              <span>{isEditMode ? '🔓 Düzenleme Modu Açık' : '🔒 Yoklama Başlat'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcelTables(true)}
              className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Şantiyede günlük elle doldurmak için boş aylık puantaj cetvelini Excel olarak indirir."
            >
              <FileText size={13} className="text-white" />
              <span>Boş Excel Puantaj Raporu</span>
            </button>
            <button
              onClick={() => setPrintModal('MAAS_RAPORU')}
              className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title="Puantaj ve maaş detaylarını içeren genel rapor."
            >
              <FileText size={13} className="text-white" />
              <span>Puantaj Raporu</span>
            </button>
            <button
              type="button"
              onClick={handleOpenGunRapor}
              className="text-[11px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5 font-bold cursor-pointer transition flex items-center space-x-1 shadow-sm"
              title={`Mesai panelindeki ${overtimeDay}. günün yoklama kayıtlarını listeler (${gunRaporLabel}).`}
            >
              <Calendar size={13} className="text-white" />
              <span>Günü Raporla ({String(overtimeDay).padStart(2, '0')})</span>
            </button>


            {/* Search */}
            <div className="relative w-full sm:w-40 sm:ml-2">
              <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400">
                <span className="text-[10px]">🔍</span>
              </span>
              <input
                type="text"
                placeholder="Personel süz..."
                className="w-full bg-slate-50 text-[10px] border border-slate-200 rounded-lg py-1.5 pl-6 pr-2 text-slate-750 focus:outline-none focus:border-amber-500 transition duration-150"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="text-[11px] font-semibold">
          {hasPendingChanges ? (
            <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              Kaydedilmemiş değişiklik var. "Günü Kaydet (DB)" ile kalıcılaştırın.
            </span>
          ) : (
            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              Son değişiklikler veritabanı ile senkron.
            </span>
          )}
          {lastSavedAt && (
            <span className="ml-2 text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
              Son kayıt: {lastSavedAt}
            </span>
          )}
        </div>
      </div>

      {archiveOpen && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                <Database size={16} />
                Yoklama Arşivi (Otomatik Yedek)
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Her güvenli kayıt öncesi sunucudaki yoklama otomatik yedeklenir. Formen Mobil ve Puantaj sekmesi aynı veriyi paylaşır.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadArchiveList()}
              disabled={archiveLoading}
              className="text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 font-bold"
            >
              {archiveLoading ? 'Yükleniyor...' : 'Listeyi Yenile'}
            </button>
          </div>
          {archives.length === 0 && !archiveLoading ? (
            <p className="text-xs text-slate-500">Henüz arşiv kaydı yok veya liste yüklenmedi.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-2">Tarih</th>
                    <th className="text-left p-2">Kaynak</th>
                    <th className="text-right p-2">Personel</th>
                    <th className="text-right p-2">Dolu Gün</th>
                    <th className="text-right p-2">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="p-2">{new Date(a.olusturmaTarihi).toLocaleString('tr-TR')}</td>
                      <td className="p-2">{a.kaynak}</td>
                      <td className="p-2 text-right">{a.personelSayisi}</td>
                      <td className="p-2 text-right">{a.doluGunSayisi}</td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRestoreArchive(a.id)}
                          disabled={archiveRestoringId === a.id}
                          className="text-[10px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded px-2 py-1 font-bold"
                        >
                          {archiveRestoringId === a.id ? 'Yükleniyor...' : 'Geri Yükle'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AI Daily Yoklama Upload and Verification Panel */}
      {showAiUpload && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-md space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest block">🤖 GEMINI YAPAY ZEKA DESTEKLİ GÜNLÜK YOKLAMA</span>
              <h3 className="font-bold text-sm text-slate-800 mt-0.5">Yoklama Evrağı / Günlük Puantaj Kağıdı Yükleme</h3>
            </div>
            <button 
              onClick={() => setShowAiUpload(false)}
              className="text-xs bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg font-bold text-slate-650 cursor-pointer"
            >
              Paneli Kapat
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* File Upload Form (1 Col) */}
            <div className="md:col-span-1 border-r border-slate-200 pr-0 md:pr-6 space-y-4">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">1. Evrak Yükle</span>
                <p className="text-[10px] text-slate-400">Doldurulmuş olan günlük puantaj çizelgesinin net bir fotoğrafını veya PDF'ini yükleyin.</p>
              </div>

              <div className="border-2 border-dashed border-slate-250 rounded-xl p-4 text-center hover:border-slate-800 transition cursor-pointer relative bg-slate-50/50">
                <input 
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleAiFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={aiLoading}
                />
                <div className="space-y-2">
                  <span className="text-2xl block">📁</span>
                  <span className="text-xs font-bold text-slate-600 block">Dosya Seçin veya Sürükleyin</span>
                  <span className="text-[9px] text-slate-450 block">PNG, JPG, JPEG veya PDF (Maks 15MB)</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <span className="text-[10px] font-bold text-violet-600 block uppercase">Aylık Excel Puantaj (Mart–Haziran)</span>
                <p className="text-[10px] text-slate-400">Eski Excel aylık yoklama ekran görüntüsünü yükleyin — AI tüm personelleri ve X işaretlerini okur.</p>
                <label className="block border-2 border-dashed border-violet-200 rounded-xl p-3 text-center hover:border-violet-500 transition cursor-pointer bg-violet-50/30 relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleMonthlyExcelUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={aiLoading}
                  />
                  <span className="text-[10px] font-bold text-violet-700">📊 Aylık Excel Yükle ve Aktar</span>
                </label>
              </div>

              {aiLoading && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center space-x-2.5 animate-pulse text-xs font-bold text-slate-800">
                  <RefreshCw size={14} className="animate-spin text-slate-800" />
                  <span>Gemini AI Evrağı Çözümlüyor...</span>
                </div>
              )}

              {aiError && (
                <div className="p-3.5 bg-rose-50 border border-rose-150 rounded-xl text-rose-700 text-[11px] font-medium leading-relaxed">
                  ⚠️ <strong>Ayrıştırma Hatası:</strong> {aiError}
                </div>
              )}

              {aiUnmatched.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-150 rounded-xl text-amber-800 text-[11px] font-medium leading-relaxed">
                  ⚠️ <strong>Eşleşmeyen isimler:</strong> {aiUnmatched.join(', ')} — Personel ekranından ekleyip tekrar deneyin.
                </div>
              )}
            </div>

            {/* Verification Table (2 Cols) */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block uppercase">2. AI Veri Doğrulama Tablosu</span>
                  <p className="text-[10px] text-slate-400">Yapay zekanın evraktan okuduğu verileri kontrol edin, gerekirse el ile düzeltin.</p>
                </div>
                
                {aiSuccess && (
                  <div className="flex items-center space-x-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Rapor Tarihi:</label>
                    <input 
                      type="date"
                      value={parsedDate}
                      onChange={(e) => setParsedDate(e.target.value)}
                      className="border border-slate-300 text-xs font-bold p-1 rounded bg-slate-50 outline-none"
                    />
                  </div>
                )}
              </div>

              {!aiSuccess ? (
                <div className="border border-dashed rounded-xl p-12 text-center text-slate-400 text-xs italic bg-slate-50/20">
                  Ayrıştırılmış veri bulunmuyor. Lütfen sol taraftan bir evrak dosyası yükleyin.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border rounded-xl overflow-hidden text-xs max-h-64 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800 text-white font-bold uppercase text-[9px] tracking-wider">
                          <th className="p-2 w-12 text-center">SIRA</th>
                          <th className="p-2">AD SOYAD</th>
                          <th className="p-2">GÖREV</th>
                          <th className="p-2 w-28">YOKLAMA DURUMU</th>
                          <th className="p-2 w-24">FAZLA MESAİ (SAAT)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y font-medium text-slate-700 bg-white">
                        {parsedRecords.map((rec, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2 text-center font-mono">{idx + 1}</td>
                            <td className="p-2 font-bold text-slate-900">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                                <span>{rec.adSoyad}</span>
                                {(() => {
                                  const empExists = personeller.some(p => {
                                    const empName = `${p.ad} ${p.soyad}`.toLowerCase().replace(/\s+/g, '');
                                    const parsedName = rec.adSoyad.toLowerCase().replace(/\s+/g, '');
                                    return empName === parsedName || empName.includes(parsedName) || parsedName.includes(empName);
                                  });
                                  if (!empExists) {
                                    return (
                                      <span className="text-[9px] font-extrabold text-rose-600 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 animate-pulse shrink-0 w-fit">
                                        ⚠️ SGK Girişi Yapılmalı
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </td>
                            <td className="p-2 text-slate-500 text-[11px]">{rec.gorev || 'İŞÇİ'}</td>
                            <td className="p-2">
                              <select
                                value={rec.durum}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setParsedRecords(prev => prev.map((item, i) => i === idx ? { ...item, durum: val } : item));
                                }}
                                className="w-full text-xs p-0.5 border border-slate-300 rounded font-bold"
                              >
                                <option value="Geldi">Geldi</option>
                                <option value="Yok">Yok</option>
                                <option value="İzinli">İzinli</option>
                                <option value="Raporlu">Raporlu</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input 
                                type="number"
                                min={0}
                                max={MAX_MESAI_SAATI}
                                step={0.5}
                                placeholder="—"
                                value={mesaiInputDisplayValue(rec.mesaiSaati)}
                                onChange={(e) => {
                                  const parsed = parseMesaiInputValue(e.target.value);
                                  setParsedRecords((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, mesaiSaati: parsed ?? 0 } : item
                                    )
                                  );
                                }}
                                className="w-full text-xs p-0.5 border border-slate-300 rounded font-bold font-mono text-center"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end space-x-2 border-t pt-3">
                    <button
                      type="button"
                      onClick={() => setParsedRecords([])}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-1.5 px-4 rounded-xl text-xs transition cursor-pointer"
                    >
                      Sıfırla
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitAiYoklama}
                      className="bg-slate-900 hover:bg-slate-900 text-white font-bold py-1.5 px-5 rounded-xl text-xs transition shadow cursor-pointer"
                    >
                      Onayla ve Puantaja İşle
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

        {/* Bottom line: Interactive targeted / Overtime Input Panel */}
        <div className="bg-amber-50/55 rounded-xl border border-amber-200/70 p-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">MESAİ GİRİŞ PANELİ</span>
            <span className="text-[11px] text-slate-600 font-medium font-sans">Belirli güne özel saatlik fazla mesai işleyin:</span>
          </div>

          <div className="flex items-center space-x-3 flex-wrap text-xs">
            {/* Staff dropdown selector */}
            <div className="flex items-center space-x-1">
              <span className="text-slate-500 font-bold text-[10px]">Kadro:</span>
              <select
                value={overtimeStaffId}
                onChange={(e) => setOvertimeStaffId(e.target.value)}
                className="text-[11px] font-bold bg-white border border-slate-200 rounded p-1"
              >
                <option value="ALL">📋 Tüm Şantiye Kadrosu</option>
                {monthPersoneller.map(p => (
                  <option key={p.id} value={p.id}>👤 {p.ad} {p.soyad} ({p.gorev})</option>
                ))}
              </select>
            </div>

            {/* Target Day */}
            <div className="flex items-center space-x-1">
              <span className="text-slate-500 font-bold text-[10px]">Gün:</span>
              <input
                type="number"
                min={1}
                max={daysInMonth}
                value={overtimeDay}
                onChange={(e) => setOvertimeDay(Math.max(1, Math.min(daysInMonth, parseInt(e.target.value) || 1)))}
                className="w-12 text-center text-[11px] font-bold bg-white border border-slate-200 rounded p-1"
              />
            </div>

            {/* Overtime Hours */}
            <div className="flex items-center space-x-1">
              <span className="text-slate-500 font-bold text-[10px]">Mesai Saati:</span>
              <input
                type="number"
                min={0}
                max={MAX_MESAI_SAATI}
                step={0.5}
                placeholder="—"
                value={mesaiInputDisplayValue(overtimeHours)}
                onChange={(e) =>
                  setOvertimeHours(parseMesaiInputValue(e.target.value) ?? 0)
                }
                className="w-12 text-center text-[11px] font-bold bg-white border border-slate-200 rounded p-1"
              />
              <span className="text-slate-400 font-medium text-[10px]">Saat</span>
            </div>

            {/* Submit button */}
            <button
              onClick={handleQuickOvertimeSubmit}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-[10px] px-3.5 py-1 rounded transition duration-100 shadow-sm cursor-pointer"
            >
              ⏱️ Mesai Kaydet
            </button>
            <button
              type="button"
              onClick={handleOpenGunRapor}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] px-3.5 py-1 rounded transition duration-100 shadow-sm cursor-pointer inline-flex items-center gap-1"
              title={`${gunRaporLabel} — yoklaması alınmış personel listesi`}
            >
              <Calendar size={12} />
              Günü Raporla
            </button>
          </div>
        </div>

        <div className="bg-violet-50/70 rounded-xl border border-violet-200/80 p-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center space-x-2">
            <span className="bg-violet-100 text-violet-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase inline-flex items-center gap-1">
              <Tag size={10} /> MESLEK GRUBU ETİKETİ
            </span>
            <span className="text-[11px] text-slate-600 font-medium font-sans">
              Seçili günün yoklamasına ne iş yaptıklarını yazın. Yeni etiket kalıcı kaydolur:
            </span>
          </div>

          <div className="flex items-center space-x-3 flex-wrap text-xs">
            <div className="flex items-center space-x-1">
              <span className="text-slate-500 font-bold text-[10px]">Etiket:</span>
              <select
                value={overtimeEtiket}
                onChange={(e) => setOvertimeEtiket(e.target.value)}
                className="text-[11px] font-bold bg-white border border-slate-200 rounded p-1 max-w-[220px]"
              >
                <option value="">— Etiket yok / kaldır —</option>
                {etiketKatalogu.map((etiket) => (
                  <option key={etiket} value={etiket}>
                    {etiket}
                  </option>
                ))}
                <option value="__CUSTOM__">＋ Yeni etiket yaz…</option>
              </select>
            </div>
            {overtimeEtiket === '__CUSTOM__' && (
              <input
                type="text"
                value={overtimeEtiketCustom}
                onChange={(e) => setOvertimeEtiketCustom(e.target.value)}
                placeholder="Örn. İZOLASYON"
                className="w-36 text-[11px] font-bold bg-white border border-slate-200 rounded p-1 uppercase"
              />
            )}
            <button
              type="button"
              onClick={handleQuickEtiketSubmit}
              className="bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-bold text-[10px] px-3.5 py-1 rounded transition duration-100 shadow-sm cursor-pointer inline-flex items-center gap-1"
            >
              <Tag size={12} />
              Günü Etiketle
            </button>
            <button
              type="button"
              onClick={handleOpenGunRapor}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] px-3.5 py-1 rounded transition duration-100 shadow-sm cursor-pointer inline-flex items-center gap-1"
            >
              <Calendar size={12} />
              Etiketli Rapor
            </button>
          </div>
        </div>

      {yoklamaLoadStats.thisMonth === 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] font-extrabold text-amber-950">
              {new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
                month: 'long',
                year: 'numeric',
              })}{' '}
              dönemi şu an boş görünüyor
            </p>
            <p className="text-[10px] text-amber-900/80 font-semibold leading-snug">
              {yoklamaLoadStats.filledTotal > 0
                ? `Veritabanından ${yoklamaLoadStats.persons} personel · ${yoklamaLoadStats.filledTotal} dolu gün yüklü; bu ayda yevmiye/mesai kaydı yok. Mor ■ ve koyu mesai kutuları “işe giriş öncesi / çıkış sonrası kapalı gün”dir — silinmiş yoklama değildir. Formen kaydı başka bir tarihe (ör. bugün) yazılmış olabilir. Üstten «Sunucudan Yenile» veya «Yoklama Arşivi» deneyin.`
                : 'Henüz hiç yoklama günü yüklenmedi. Üstten «Sunucudan Yenile» ile PC önbelleğini atlayın; olmazsa «Yoklama Arşivi»nden geri yükleyin. Bu ekranda Kaydet’e basmayın.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {reloadYoklamalarFromServer && (
              <button
                type="button"
                onClick={() => void handleForceServerRefresh()}
                disabled={serverRefreshLoading}
                className="text-[11px] font-extrabold px-3 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white cursor-pointer disabled:opacity-50"
              >
                {serverRefreshLoading ? 'Yenileniyor…' : 'Sunucudan Yenile'}
              </button>
            )}
          {yoklamaLoadStats.bestFilled > 0 &&
            (yoklamaLoadStats.bestYear !== selectedYear ||
              yoklamaLoadStats.bestMonth !== selectedMonth) && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(yoklamaLoadStats.bestMonth);
                setSelectedYear(yoklamaLoadStats.bestYear);
              }}
              className="text-[11px] font-extrabold px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
            >
              {new Date(yoklamaLoadStats.bestYear, yoklamaLoadStats.bestMonth - 1, 1).toLocaleDateString(
                'tr-TR',
                { month: 'long', year: 'numeric' }
              )}{' '}
              aç ({yoklamaLoadStats.bestFilled} gün)
            </button>
          )}
          {yoklamaLoadStats.prevFilled > 0 &&
            !(
              yoklamaLoadStats.prevYear === yoklamaLoadStats.bestYear &&
              yoklamaLoadStats.prevMonth === yoklamaLoadStats.bestMonth
            ) && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(yoklamaLoadStats.prevMonth);
                setSelectedYear(yoklamaLoadStats.prevYear);
              }}
              className="text-[11px] font-extrabold px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white cursor-pointer"
            >
              {new Date(yoklamaLoadStats.prevYear, yoklamaLoadStats.prevMonth - 1, 1).toLocaleDateString(
                'tr-TR',
                { month: 'long', year: 'numeric' }
              )}{' '}
              aç ({yoklamaLoadStats.prevFilled} gün)
            </button>
          )}
          </div>
        </div>
      )}

      {/* Main Grid Card View */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Personel list header */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-slate-800">
            Tüm Personel
            <span className="ml-1.5 text-[9px] font-extrabold text-slate-500">({monthPersoneller.length})</span>
          </div>
          {onOpenFaaliyetPersonel && (
            <button
              type="button"
              onClick={onOpenFaaliyetPersonel}
              className="text-[11px] font-bold px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 transition cursor-pointer flex items-center gap-1.5"
            >
              <Camera className="w-3 h-3" />
              Faaliyeti Olan Personeller sekmesi
              <span className="text-[9px] font-extrabold opacity-70">({faaliyetPersonelCount})</span>
            </button>
          )}
        </div>
        
        {/* Info Legend */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-[10px] text-slate-400 font-sans tracking-tight">
          <div className="flex items-center space-x-3 flex-wrap">
            <span className="font-bold text-slate-600 uppercase">Hücre Değerini Değiştirmek İçin Harfe Tıklayınız:</span>
            <span className="flex items-center space-x-1"><span className="w-4 h-4 bg-emerald-100 text-emerald-800 rounded font-bold text-center inline-block">G</span> <span>Geldi (G)</span></span>
            <span className="flex items-center space-x-1"><span className="w-4 h-4 bg-rose-100 text-rose-800 rounded font-bold text-center inline-block">Y</span> <span>Yok (Y)</span></span>
            <span className="flex items-center space-x-1"><span className="w-4 h-4 bg-sky-100 text-slate-800 rounded font-bold text-center inline-block">İ</span> <span>İzinli (İ)</span></span>
            <span className="flex items-center space-x-1"><span className="w-4 h-4 bg-amber-100 text-amber-800 rounded font-bold text-center inline-block">R</span> <span>Raporlu (R)</span></span>
            <span className="flex items-center space-x-1"><span className="w-4 h-4 bg-orange-100 text-orange-800 rounded font-bold text-center inline-block">P</span> <span>Pazar (P)</span></span>
            <span className="flex items-center space-x-1"><span className="w-4 h-4 bg-purple-100 text-purple-800 rounded font-bold text-center inline-block">T</span> <span>Tatil (T)</span></span>
            <span className="flex items-center space-x-1">
              <span className="w-4 h-4 bg-emerald-50 text-emerald-800 rounded font-bold text-center inline-block ring-2 ring-emerald-500">G</span>
              <span className="text-emerald-800 font-semibold">İşe giriş günü</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-4 h-4 bg-rose-50 text-rose-800 rounded font-bold text-center inline-block ring-2 ring-rose-500">G</span>
              <span className="text-rose-800 font-semibold">İşten çıkış günü</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-4 h-4 bg-violet-100 border border-violet-300 text-violet-700 rounded font-bold text-center inline-block text-[8px]">■</span>
              <span className="text-violet-800 font-semibold">Yoklamaya kapalı (giriş öncesi / çıkış sonrası)</span>
            </span>
          </div>

          <span className="text-slate-800 font-bold bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200">
            Hücrelerin altındaki kutulardan günlük fazla mesai saatlerini (Saat) elle girebilirsiniz.
          </span>
        </div>

        {/* Scrollable Matrix Table grid wrapper */}
        <div className="flex-1 overflow-auto p-4">
          <div className="inline-block min-w-full align-middle">
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-100">
                
                {/* Header columns */}
                <thead className="sticky top-0 z-30 bg-slate-50 font-display text-[10px] font-bold text-slate-600 tracking-wider">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left w-56 sticky top-0 left-0 bg-slate-50 box-shadow z-40 shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r">
                      <div>Personel Künyesi</div>
                      <div className="text-[8px] font-normal text-slate-400 normal-case tracking-normal mt-0.5">Çift tık: saha faaliyetleri</div>
                    </th>
                    {daysArray.map(day => {
                      const dayName = dayOfWeekAbbreviation(day);
                      const { isHoliday, name, isOfficial } = isSundayOrPublicHoliday(day);
                      let thClass = "px-1 py-1.5 text-center w-8 min-w-8 transition-colors sticky top-0 bg-slate-50 z-30";
                      if (isHoliday) {
                        if (isOfficial) {
                          thClass += " bg-purple-100/80 text-purple-900 font-extrabold border-x border-purple-200 z-10";
                        } else {
                          thClass += " bg-orange-100/80 text-orange-900 font-extrabold border-x border-orange-200 z-10";
                        }
                      }
                      return (
                        <th 
                          key={day} 
                          scope="col" 
                          className={thClass}
                          title={name || undefined}
                        >
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-[10px]">{day.toString().padStart(2, '0')}</span>
                            <span className="text-[8px] font-bold opacity-80 uppercase tracking-wide">{dayName}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th scope="col" className="px-2 py-3 text-center w-16 min-w-16 border-l font-bold text-emerald-700 bg-slate-50">
                      Gelen Gün
                    </th>
                    <th scope="col" className="px-2 py-3 text-center w-20 min-w-20 font-bold text-slate-800 bg-slate-50">
                      Top. Mesai
                    </th>
                  </tr>
                </thead>
 
                {/* Table list rows */}
                <tbody className="bg-white divide-y divide-slate-100 text-[11px] font-sans">
                  {filteredPersonel.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 3} className="px-6 py-10 text-center text-slate-500">
                        Arama kriterine uygun personel bulunamadı.
                      </td>
                    </tr>
                  ) : filteredPersonel.map((p) => {
                    const personYoklama = draftYoklamalar[p.id] || {};
                    let totalGeldi = 0;
                    let totalMesai = 0;

                    const rowCells = daysArray.map(day => {
                      const dayData = getYoklamaDay(personYoklama, selectedYear, selectedMonth, day) || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 };
                      const isActiveDay = isDayActiveForEmployee(p, day);
                      const isHireDay = getBoundaryDayInMonth(p.iseGirisTarihi, selectedYear, selectedMonth) === day;
                      const isExitDay = getBoundaryDayInMonth(p.istenCikisTarihi, selectedYear, selectedMonth) === day;
                      
                      if (isActiveDay && dayData.durum === 'Geldi') {
                        totalGeldi++;
                      }
                      if (isActiveDay) {
                        totalMesai += dayData.mesaiSaati;
                      }

                      const { isHoliday, name, isOfficial } = isSundayOrPublicHoliday(day);
                      let tdClass = "px-0.5 py-1.5 text-center min-w-8 transition-colors";
                      if (isHoliday) {
                        if (isOfficial) {
                          tdClass += " bg-purple-100/60 border-x border-purple-200";
                        } else {
                          tdClass += " bg-orange-100/60 border-x border-orange-200";
                        }
                      }
                      if (isHireDay) tdClass += " bg-emerald-100/90";
                      if (isExitDay) tdClass += " bg-rose-100/90";
                      if (!isActiveDay) tdClass += " bg-violet-50/40";

                      const boundaryRing = isExitDay
                        ? 'ring-2 ring-rose-500 ring-offset-1'
                        : isHireDay
                          ? 'ring-2 ring-emerald-500 ring-offset-1'
                          : isHoliday
                            ? (isOfficial ? 'ring-1 ring-purple-300' : 'ring-1 ring-orange-300')
                            : '';

                      const hireBound = getBoundaryDayInMonth(p.iseGirisTarihi, selectedYear, selectedMonth);
                      const exitBound = getBoundaryDayInMonth(p.istenCikisTarihi, selectedYear, selectedMonth);
                      const hasRecorded =
                        !!dayData.durum && dayData.durum !== 'Girilmedi';
                      // Kayıtlı yoklama silinmedi — tarih aralığı dışı olsa bile mevcut kaydı göster
                      const showAsRecorded = isActiveDay || hasRecorded;
                      const closedTitle = !isActiveDay
                        ? exitBound != null && day > exitBound
                          ? `İşten çıkış sonrası — yoklamaya kapalı (${p.istenCikisTarihi})`
                          : hireBound != null && day < hireBound
                            ? `İşe giriş öncesi — yoklamaya kapalı (${p.iseGirisTarihi})`
                            : p.istenCikisTarihi
                              ? `İşten çıkış sonrası — yoklamaya kapalı (${p.istenCikisTarihi})`
                              : p.iseGirisTarihi
                                ? `İşe giriş öncesi — yoklamaya kapalı (${p.iseGirisTarihi})`
                                : 'Yoklamaya kapalı'
                        : undefined;

                      return (
                        <td key={day} className={`${tdClass} relative`}>
                          <button
                            type="button"
                            disabled={!isActiveDay || !isEditMode}
                            onClick={() => isActiveDay && isEditMode && handleCellClick(p.id, day)}
                            title={
                              closedTitle ||
                              (isExitDay
                                ? `İşten çıkış: ${p.istenCikisTarihi}`
                                : isHireDay
                                  ? `İşe giriş: ${p.iseGirisTarihi}`
                                  : undefined)
                            }
                            className={`w-7 h-7 rounded-md border font-bold text-[9px] flex items-center justify-center transition shadow-sm ${
                              isActiveDay
                                ? `${isEditMode ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default opacity-90 hover:opacity-100'} ${getStatusColor(dayData.durum)} ${boundaryRing}`
                                : hasRecorded
                                  ? `${getStatusColor(dayData.durum)} opacity-70 cursor-not-allowed ring-1 ring-violet-300`
                                  : 'bg-violet-100 border-violet-300 text-violet-700 opacity-95 cursor-not-allowed'
                            }`}
                          >
                            {showAsRecorded ? getStatusAbbreviation(dayData.durum) : '■'}
                          </button>
                          
                          {isActiveDay && dayData.gonderen && (
                            <span 
                              className="absolute top-0.5 right-0.5 text-[6px] text-amber-500 font-bold z-10 select-none cursor-help" 
                              title={`Formen tarafından gönderildi: ${dayData.gonderen}`}
                            >
                              👷
                            </span>
                          )}
                          
                          {/* Mini editable mesai box beneath */}
                          <div className="mt-1 flex items-center justify-center">
                            <input 
                              type="text"
                              disabled={!isActiveDay || !isEditMode}
                              inputMode="decimal"
                              pattern="^\\d+([.,]\\d{0,2})?$"
                              title={`0 ile ${MAX_MESAI_SAATI} saat arası girin (0.5 adım).`}
                              maxLength={5}
                              value={showAsRecorded ? (dayData.mesaiSaati || "") : ""}
                              placeholder="-"
                              onChange={(e) => isActiveDay && isEditMode && handleMesaiChange(p.id, day, parseMesaiInput(e.target.value))}
                              className={`w-7 text-[8px] font-bold font-mono text-center rounded border py-0.5 focus:outline-none ${
                                isExitDay
                                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                                  : isHireDay
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    : isActiveDay
                                      ? `${isHoliday ? (isOfficial ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-orange-50 border-orange-200 text-orange-700') : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'} `
                                      : hasRecorded
                                        ? 'bg-violet-50 border-violet-200 text-violet-700'
                                        : 'bg-slate-900 border-slate-800 text-slate-500'
                              }`}
                            />
                          </div>
                        </td>
                      );
                    });

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        
                        {/* Static Personel Name column */}
                        <td
                          className="px-3 py-3 whitespace-nowrap font-medium text-slate-900 sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)] z-10 border-r cursor-pointer hover:bg-slate-50/40 transition-colors select-none"
                          title="Çift tık: saha faaliyetleri ve fotoğraflar"
                          onDoubleClick={() => handlePersonDoubleClick(p)}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800">{p.ad} {p.soyad}</span>
                            <span className="text-[9px] text-[#2563EB] font-bold">{p.gorev} · {p.departman}</span>
                            {(() => {
                              const dayEtiket = normalizeYoklamaEtiketi(
                                getYoklamaDay(personYoklama, selectedYear, selectedMonth, overtimeDay)?.isEtiketi
                              );
                              if (!dayEtiket) return null;
                              return (
                                <span
                                  className={`mt-0.5 self-start text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${yoklamaEtiketBadgeClass(dayEtiket)}`}
                                  title={`${overtimeDay}. gün meslek grubu`}
                                >
                                  {dayEtiket}
                                </span>
                              );
                            })()}
                            <div className="text-[8px] font-mono mt-0.5 space-y-0.5 leading-none">
                              <div className="text-emerald-700 font-semibold">Giriş: {p.iseGirisTarihi || '-'}</div>
                              {p.istenCikisTarihi && (
                                <div className="text-rose-700 font-semibold">Çıkış: {p.istenCikisTarihi}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {rowCells}

                        {/* Summary cells */}
                        <td className="px-2 py-3 text-center whitespace-nowrap border-l font-bold text-emerald-700 bg-slate-50/50">
                          {totalGeldi} Gün
                        </td>
                        <td className="px-2 py-3 text-center whitespace-nowrap font-bold text-slate-800 font-mono bg-slate-50/50">
                          {totalMesai} Saat
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* 📄 REPORT OVERLAYS: BOŞ PUANTAJ REPORT & DOLU GÜNCEL PUANTAJ REPORT & GUNLUK_BOS */}
      {/* ========================================================================= */}
      {printModal === 'MAAS_RAPORU' && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 flex items-start justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-[1400px] shadow-2xl flex flex-col overflow-hidden my-4">
            
            {/* Modal Actions Header */}
            <div className="bg-slate-900 text-white p-4 flex flex-wrap justify-between items-center gap-3 px-6 shrink-0 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl">🖨️</span>
                <h3 className="font-display font-bold text-sm">
                  Genel Puantaj ve Maaş Hakediş Raporu
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.querySelector('.printable-document');
                    const html = el
                      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Yoklama / Maaş Raporu</title></head><body>${el.innerHTML}</body></html>`
                      : undefined;
                    void import('../lib/reportEmail').then(({ openReportEmailComposer }) => {
                      openReportEmailComposer({
                        subject: 'Kibritçi — Yoklama / Puantaj Raporu',
                        body: 'Yoklama ve puantaj raporu ekte / mesaj gövdesinde sunulmuştur.',
                        html,
                        fileName: 'Kibritci_Yoklama_Raporu.html',
                      });
                    });
                  }}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  📧 E-posta ile Gönder
                </button>
                <button
                  onClick={handlePrint}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  🖨️ Yazdır / PDF Olarak Kaydet (Ctrl+P)
                </button>
                <button
                  onClick={() => {
                    const el = document.querySelector('.printable-document');
                    if (el) {
                      const heading = "Kibritci_Insaat_Maas_Raporu";
                      const blob = new Blob([`
                        <html>
                          <head>
                            <meta charset="utf-8">
                            <title>Maaş Raporu</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                            <style>
                              @media print { .no-print { display: none; } }
                            </style>
                          </head>
                          <body class="p-8 bg-white text-slate-900 font-sans">
                            ${el.innerHTML}
                          </body>
                        </html>
                      `], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${heading}_${selectedMonth}_${selectedYear}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                      alert("GÜNCEL MAAŞ RAPORU BAŞARIYLA DERLENDİ\\n\\nKibritçi İnşaat Taahhüt A.Ş. onaylı puantaj cetveli masaüstünüze HTML/Yazdırılabilir formatta başarıyla kaydedildi.");
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  💾 Masaüstüne HTML Rapor Dosyası Kaydet
                </button>
                <button
                  onClick={() => setPrintModal('NONE')}
                  className="bg-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            {/* Document Body — Kurumsal antetli A4 yatay format */}
            <div className="flex-1 overflow-auto bg-white p-4 sm:p-8 lg:p-12 text-slate-900 printable-document font-sans">
              <CorporateReportLayout
                orientation="landscape"
                docCode={`BELGE NO: KBR-MAAS-2026-${selectedMonth}`}
              >
              {/* Birim & dönem bilgisi */}
              <div className="mb-4 pb-3 border-b border-slate-200">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ŞANTİYE VE MERKEZ BORDRO VE PUANTAJ DENETLEME ŞEFLİĞİ</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Dönem: <strong className="text-slate-900 font-bold">{selectedMonth}. Ay / {selectedYear}</strong></p>

              </div>

              {/* Title Header Section */}
              <div className="text-center mb-6">
                <h2 className="text-sm font-bold text-slate-900 tracking-wider uppercase border-y border-slate-200 py-2.5 bg-slate-50">
                  KİBRİTÇİ İNŞAAT {selectedMonth}. AY / {selectedYear} GENEL PUANTAJ VE MAAŞ HAKEDİŞ RAPORU
                </h2>
              </div>

              {/* Printable Matrix Table */}
              <div className="border border-slate-350 rounded-md overflow-hidden mb-8">
                <table className="w-full text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                      <th className="p-2 text-center border-r border-slate-300 w-10 font-bold">Sıra</th>
                      <th className="p-2 text-left border-r border-slate-300 w-48 font-bold">Personel Adı Soyadı</th>
                      <th className="p-2 text-left border-r border-slate-300 w-28 font-bold">TC Kimlik</th>
                      <th className="p-2 text-left border-r border-slate-300 w-28 font-bold">Görevi</th>
                      <th className="p-2 text-right border-r border-slate-300 w-24 font-bold">Aylık Maaş</th>
                      <th className="p-2 text-center border-r border-slate-300 w-20 font-bold">Gün<br/>Hak.</th>
                      <th className="p-2 text-center border-r border-slate-300 w-20 font-bold">Mesai<br/>Hak. (Saat)</th>
                      <th className="p-2 text-right border-r border-slate-300 w-28 font-bold">Günlük Yevmiye</th>
                      <th className="p-2 text-right border-r border-slate-300 w-28 font-bold text-indigo-700 bg-indigo-50/50">Maaş Hakedişi</th>
                      <th className="p-2 text-right border-r border-slate-300 w-28 font-bold text-amber-700 bg-amber-50/50">Mesai Hakedişi</th>
                      <th className="p-2 text-right border-r border-slate-300 w-32 font-black text-emerald-800 bg-emerald-50/50">Toplam Hakediş</th>
                      <th className="p-2 text-center font-bold w-24">İmza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPersonel.map((p, idx) => {
                      const personYoklama = draftYoklamalar[p.id] || {};
                      let geldiGun = 0;
                      let hakedisGun = 0;
                      let mesaiToplam = 0;

                      daysArray.forEach(day => {
                        const dayData = getYoklamaDay(personYoklama, selectedYear, selectedMonth, day) || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 };
                        if (isDayActiveForEmployee(p, day)) {
                          if (dayData.durum === 'Geldi') geldiGun++;
                          if (dayData.durum === 'Geldi' || dayData.durum === 'İzinli' || dayData.durum === 'Pazar' || dayData.durum === 'Tatil') hakedisGun++;
                          mesaiToplam += dayData.mesaiSaati;
                        }
                      });

                      const maas = Number(p.maas || 0);
                      const dailyWage = maas / Math.max(daysInMonth, 1);
                      const tahminiMaas = dailyWage * hakedisGun;
                      const tahminiMesai = mesaiToplam * (dailyWage / 7.5) * 1.5;
                      const tahminiToplam = tahminiMaas + tahminiMesai;

                      return (
                        <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                          <td className="p-2 text-center border-r border-slate-300 font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-300 font-bold text-slate-900">
                            <div>{p.ad} {p.soyad}</div>
                            {p.ibanNo && <div className="text-[7px] text-slate-400 font-mono mt-0.5">IBAN: {p.ibanNo}</div>}
                          </td>
                          <td className="p-2 border-r border-slate-300 font-mono text-slate-600">{p.tcNo || '-'}</td>
                          <td className="p-2 border-r border-slate-300 text-slate-700 uppercase">{p.gorev}</td>
                          <td className="p-2 text-right border-r border-slate-300 font-medium">
                            {maas.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </td>
                          <td className="p-2 text-center border-r border-slate-300 font-bold">{hakedisGun}</td>
                          <td className="p-2 text-center border-r border-slate-300 font-bold text-slate-700">{mesaiToplam.toFixed(1)}</td>
                          <td className="p-2 text-right border-r border-slate-300 font-mono text-slate-500">
                            {dailyWage.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </td>
                          <td className="p-2 text-right border-r border-slate-300 font-bold text-indigo-700 bg-indigo-50/30">
                            {tahminiMaas.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </td>
                          <td className="p-2 text-right border-r border-slate-300 font-bold text-amber-700 bg-amber-50/30">
                            {tahminiMesai.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </td>
                          <td className="p-2 text-right border-r border-slate-300 font-black text-emerald-800 bg-emerald-50/50">
                            {tahminiToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </td>
                          <td className="p-2 text-center text-slate-300 italic text-[7px] align-bottom pb-2">imza:</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                                {/* Official Sign-off Approval Bars arranged in strict order specified by user */}
              <div className="mt-12 text-xs">
                <div className="grid grid-cols-2 max-w-2xl mx-auto gap-8 text-center">
                  
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 flex flex-col justify-between h-28 shadow-sm">
                    <span className="font-extrabold text-slate-800 tracking-wider uppercase text-[11px] block">ŞANTİYE ŞEFİ</span>
                    <div className="h-10 border-b border-dashed border-slate-300 w-32 mx-auto my-2"></div>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 flex flex-col justify-between h-28 shadow-sm">
                    <span className="font-extrabold text-slate-800 tracking-wider uppercase text-[11px] block">PROJE MÜDÜRÜ</span>
                    <div className="h-10 border-b border-dashed border-slate-300 w-32 mx-auto my-2"></div>
                  </div>

                </div>
              </div>

              </CorporateReportLayout>
            </div>
          </div>
        </div>
      )}

      {printModal === 'GUN_RAPORU' && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 flex items-start justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col overflow-hidden my-4">
            <div className="bg-amber-600 text-white p-4 flex flex-wrap justify-between items-center gap-3 px-6 shrink-0 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <Calendar size={18} />
                <div>
                  <h3 className="font-display font-bold text-sm">Günlük Yoklama Raporu</h3>
                  <p className="text-[10px] text-amber-100 font-semibold">{gunRaporLabel}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-white/15 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-bold">Gün:</span>
                  <input
                    type="number"
                    min={1}
                    max={daysInMonth}
                    value={overtimeDay}
                    onChange={(e) =>
                      setOvertimeDay(
                        Math.max(1, Math.min(daysInMonth, parseInt(e.target.value, 10) || 1))
                      )
                    }
                    className="w-12 text-center text-[11px] font-bold bg-white text-slate-900 border-0 rounded p-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const html = buildGunlukYoklamaRaporHtml(
                      gunRaporSatirlari,
                      gunRaporOzet,
                      selectedYear,
                      selectedMonth,
                      overtimeDay
                    );
                    void import('../lib/reportEmail').then(({ openReportEmailComposer }) => {
                      openReportEmailComposer({
                        subject: `Kibritçi — Günlük Yoklama (${gunRaporLabel})`,
                        body: `${gunRaporLabel} günlük yoklama listesi ekte.`,
                        html,
                        fileName: `Kibritci_Yoklama_${gunRaporDateKey}.html`,
                      });
                    });
                  }}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  E-posta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const html = buildGunlukYoklamaRaporHtml(
                      gunRaporSatirlari,
                      gunRaporOzet,
                      selectedYear,
                      selectedMonth,
                      overtimeDay
                    );
                    openGunlukYoklamaRaporHtml(html, `Günlük Yoklama — ${gunRaporLabel}`);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  Yazdır / PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModal('NONE')}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-white p-4 sm:p-6 text-slate-900 printable-document font-sans">
              <CorporateReportLayout orientation="portrait" docCode={`KBR-YOK-${gunRaporDateKey}`}>
                <div className="mb-4 pb-3 border-b border-slate-200">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    ŞANTİYE PUANTAJ — GÜNLÜK YOKLAMA
                  </p>
                  <p className="text-sm font-black text-slate-900 mt-1">{gunRaporLabel}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {gunRaporOzet.toplam} kayıt · {gunRaporOzet.geldi} geldi · {gunRaporOzet.yok} yok ·{' '}
                    {gunRaporOzet.mesaiToplam} saat mesai
                  </p>
                  <p className="text-[10px] text-violet-700 font-semibold mt-1 print:hidden">
                    Görev yanındaki «İş / Meslek» etiketi ve «Açıklama» birbirinden bağımsızdır. Yazdır / PDF ikisini de alır.
                  </p>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mb-4">
                  {[
                    { label: 'Geldi', value: gunRaporOzet.geldi, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    { label: 'Yok', value: gunRaporOzet.yok, cls: 'text-rose-700 bg-rose-50 border-rose-200' },
                    { label: 'İzinli', value: gunRaporOzet.izinli, cls: 'text-sky-700 bg-sky-50 border-sky-200' },
                    { label: 'Raporlu', value: gunRaporOzet.raporlu, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
                    { label: 'Pazar', value: gunRaporOzet.pazar, cls: 'text-orange-700 bg-orange-50 border-orange-200' },
                    { label: 'Tatil', value: gunRaporOzet.tatil, cls: 'text-violet-700 bg-violet-50 border-violet-200' },
                    { label: 'Mesai', value: `${gunRaporOzet.mesaiToplam}s`, cls: 'text-slate-800 bg-slate-50 border-slate-200' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-xl border px-2 py-2 text-center ${item.cls}`}
                    >
                      <div className="text-lg font-black">{item.value}</div>
                      <div className="text-[9px] font-bold uppercase">{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {gunRaporGruplari.map((g) => (
                    <span
                      key={g.grup}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700"
                    >
                      {g.label}: {g.satirlar.length}
                    </span>
                  ))}
                </div>
                {gunRaporEtiketOzeti.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-[9px] font-black uppercase tracking-wider text-violet-800">
                      Meslek grupları
                    </span>
                    {gunRaporEtiketOzeti.map((e) => (
                      <span
                        key={e.etiket}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${yoklamaEtiketBadgeClass(e.etiket === YOKLAMA_ETIKETSIZ ? '' : e.etiket)}`}
                      >
                        {e.etiket === YOKLAMA_ETIKETSIZ ? 'Etiketsiz' : e.etiket}: {e.adet} · {e.geldi} geldi
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-4">
                  {gunRaporGruplari.map((grup) => (
                    <div key={grup.grup} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div
                        className={`px-3 py-2 flex items-center justify-between ${gunRaporGrupHeaderClass[grup.grup]}`}
                      >
                        <span className="text-[11px] font-black uppercase tracking-wide">{grup.label}</span>
                        <span className="text-[10px] font-bold opacity-90">
                          {grup.satirlar.length} kişi · {grup.ozet.geldi} geldi · {grup.ozet.mesaiToplam}s mesai
                        </span>
                      </div>
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="p-2 text-left border-b border-slate-200 w-8">#</th>
                            <th className="p-2 text-left border-b border-slate-200">Ad Soyad</th>
                            <th className="p-2 text-left border-b border-slate-200">Görev</th>
                            <th className="p-2 text-left border-b border-slate-200">İş / Meslek</th>
                            <th className="p-2 text-left border-b border-amber-200 bg-amber-50 min-w-[160px]">
                              Açıklama
                            </th>
                            <th className="p-2 text-left border-b border-slate-200 hidden lg:table-cell">Departman</th>
                            <th className="p-2 text-center border-b border-slate-200 w-24">Durum</th>
                            <th className="p-2 text-center border-b border-slate-200 w-16">Mesai</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grup.satirlar.map((row, idx) => (
                            <tr key={row.personelId} className="border-b border-slate-100 hover:bg-slate-50/80">
                              <td className="p-2 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-2 font-bold text-slate-900">{row.adSoyad}</td>
                              <td className="p-2 text-slate-600">{row.gorev}</td>
                              <td className="p-2">
                                <div className="flex flex-col gap-1 print:hidden">
                                  <select
                                    value={etiketYazanId === row.personelId ? '__YENI__' : row.isEtiketi}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '__YENI__') {
                                        setEtiketYazanId(row.personelId);
                                        setEtiketYazi('');
                                        return;
                                      }
                                      setEtiketYazanId(null);
                                      applyIsEtiketiToPersonDay(row.personelId, overtimeDay, val);
                                    }}
                                    className="w-full max-w-[180px] text-[10px] font-bold bg-white border border-slate-200 rounded px-1 py-1"
                                  >
                                    <option value="">—</option>
                                    {yoklamaEtiketOptionsWithCustom(row.isEtiketi, [
                                      etiketKatalogu,
                                    ]).map((etiket) => (
                                      <option key={etiket} value={etiket}>
                                        {etiket}
                                      </option>
                                    ))}
                                    <option value="__YENI__">＋ Yeni etiket yaz…</option>
                                  </select>
                                  {etiketYazanId === row.personelId && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={etiketYazi}
                                        onChange={(e) => setEtiketYazi(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            commitYeniEtiketForPerson(row.personelId);
                                          }
                                          if (e.key === 'Escape') {
                                            setEtiketYazanId(null);
                                            setEtiketYazi('');
                                          }
                                        }}
                                        placeholder="Örn. İZOLASYON"
                                        className="w-28 text-[10px] font-bold bg-white border border-violet-300 rounded px-1 py-1 uppercase"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => commitYeniEtiketForPerson(row.personelId)}
                                        className="text-[9px] font-black bg-violet-600 text-white px-2 py-1 rounded cursor-pointer"
                                      >
                                        Kaydet
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {row.isEtiketi ? (
                                  <span
                                    className={`hidden print:inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${yoklamaEtiketBadgeClass(row.isEtiketi)}`}
                                  >
                                    {row.isEtiketi}
                                  </span>
                                ) : (
                                  <span className="hidden print:inline text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-2 bg-amber-50/70">
                                <YoklamaGunAciklamaInput
                                  value={row.aciklama}
                                  onCommit={(next) =>
                                    applyAciklamaToPersonDay(row.personelId, overtimeDay, next)
                                  }
                                />
                                <span className="hidden print:inline text-[10px] text-slate-700">
                                  {row.aciklama || '—'}
                                </span>
                              </td>
                              <td className="p-2 text-slate-500 hidden lg:table-cell">{row.departman}</td>
                              <td className="p-2 text-center">
                                <span
                                  className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${getStatusColor(row.durum)}`}
                                >
                                  {getStatusAbbreviation(row.durum)}
                                </span>
                              </td>
                              <td className="p-2 text-center font-bold font-mono text-slate-700">
                                {row.mesaiSaati > 0 ? row.mesaiSaati : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </CorporateReportLayout>
            </div>
          </div>
        </div>
      )}
      {/* 👤 BİREYSEL YOKLAMA PANELİ (POP-UP MODAL) */}
      {showBireyselModal && (
        <div className="fixed inset-0 bg-slate-950/75 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-slate-900 border-b p-5 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">👤</span>
                <div>
                  <h3 className="font-display font-semibold text-sm">Bireysel Aylık Puantaj Kartı</h3>
                  <p className="text-[10px] text-slate-400">Seçili personelin ilgili aya ait tüm puantaj ve mesai kayıtları</p>
                </div>
              </div>
              <button 
                onClick={() => setShowBireyselModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer text-sm"
              >
                ✖
              </button>
            </div>

            {/* Selectors */}
            <div className="p-4 border-b bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase text-[9px] block mb-1">Personel Seçin</label>
                <select
                  value={bireyselStaffId}
                  onChange={(e) => setBireyselStaffId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none"
                >
                  {personeller.map(p => (
                    <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-500 uppercase text-[9px] block mb-1">Yıl</label>
                <select
                  value={bireyselYear}
                  onChange={(e) => setBireyselYear(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-500 uppercase text-[9px] block mb-1">Ay</label>
                <select
                  value={bireyselMonth}
                  onChange={(e) => setBireyselMonth(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}. Ay</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Monthly Day List Grid */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {(() => {
                const selectedEmp = personeller.find(emp => emp.id === bireyselStaffId);
                if (!selectedEmp) {
                  return <p className="text-center text-slate-400 text-xs py-10">Lütfen bir personel seçin.</p>;
                }

                const daysInMonth = new Date(bireyselYear, bireyselMonth, 0).getDate();
                const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {days.map(day => {
                      const isActive = isDayActiveForEmployeeInPeriod(selectedEmp, bireyselYear, bireyselMonth, day);
                      if (!isActive) return null;

                      const currentMap = draftYoklamalar[bireyselStaffId] || {};
                      const dayData = getYoklamaDay(currentMap, bireyselYear, bireyselMonth, day) || { durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 };
                      const isHireDay = getBoundaryDayInMonth(selectedEmp.iseGirisTarihi, bireyselYear, bireyselMonth) === day;
                      const isExitDay = getBoundaryDayInMonth(selectedEmp.istenCikisTarihi, bireyselYear, bireyselMonth) === day;

                      // Style maps
                      const statusStyles: Record<string, string> = {
                        'Geldi': 'bg-emerald-100 text-emerald-800 border-emerald-200',
                        'Yok': 'bg-rose-100 text-rose-800 border-rose-200',
                        'İzinli': 'bg-slate-100 text-slate-800 border-slate-200',
                        'Raporlu': 'bg-violet-100 text-violet-800 border-violet-200',
                        'Pazar': 'bg-amber-100 text-amber-800 border-amber-200',
                        'Tatil': 'bg-indigo-100 text-indigo-800 border-indigo-200',
                        'Girilmedi': 'bg-slate-100 text-slate-500 border-slate-200',
                      };

                      return (
                        <div 
                          key={day}
                          className={`bg-white border rounded-xl p-3 flex items-center justify-between shadow-xs transition ${
                            isExitDay
                              ? 'border-rose-400 ring-2 ring-rose-200'
                              : isHireDay
                                ? 'border-emerald-400 ring-2 ring-emerald-200'
                                : 'border-slate-150 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className={`font-mono font-bold text-xs px-2 py-1 rounded-lg ${
                              isExitDay
                                ? 'bg-rose-100 text-rose-800'
                                : isHireDay
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                            }`}>
                              {day < 10 ? `0${day}` : day}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              Gün
                              {isHireDay ? ' · İşe giriş' : ''}
                              {isExitDay ? ' · İşten çıkış' : ''}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3">
                            {/* Status selector */}
                            <select
                              value={dayData.durum}
                              onChange={(e) => {
                                const newStatus = e.target.value as YoklamaDurum;
                                updateDraftYoklama(prev => ({
                                  ...prev,
                                  [bireyselStaffId]: setYoklamaDay(prev[bireyselStaffId], bireyselYear, bireyselMonth, day, {
                                    ...dayData,
                                    durum: newStatus
                                  })
                                }));
                              }}
                              className={`text-[10px] font-bold border rounded-lg px-2.5 py-1 ${statusStyles[dayData.durum] || 'bg-slate-100'}`}
                            >
                              {['Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil', 'Girilmedi'].map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>

                            {/* Overtime input */}
                            <div className="flex items-center space-x-1">
                              <span className="text-[9px] text-slate-400 font-bold uppercase">Mesai:</span>
                              <input 
                                type="number"
                                min={0}
                                max={MAX_MESAI_SAATI}
                                step={0.5}
                                placeholder="—"
                                value={mesaiInputDisplayValue(dayData.mesaiSaati)}
                                onChange={(e) => {
                                  const hours = parseMesaiInputValue(e.target.value) ?? 0;
                                  updateDraftYoklama((prev) => ({
                                    ...prev,
                                    [bireyselStaffId]: setYoklamaDay(
                                      prev[bireyselStaffId],
                                      bireyselYear,
                                      bireyselMonth,
                                      day,
                                      {
                                        ...dayData,
                                        mesaiSaati: hours,
                                      }
                                    ),
                                  }));
                                }}
                                className="w-12 text-center bg-slate-50 border rounded-lg p-1 text-[10px] font-mono font-bold"
                              />
                              <span className="text-[9px] text-slate-400">sa</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button
                onClick={() => setShowBireyselModal(false)}
                className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition duration-150 cursor-pointer shadow-md"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 🏗️ SAHA FAALİYET ÖNİZLEME (SAĞ TIK) */}
      {sahaPreviewPerson && (
        <div
          className="fixed inset-0 bg-slate-950/75 flex items-center justify-center z-[60] p-4 animate-in fade-in duration-150 font-sans"
          onClick={() => setSahaPreviewPerson(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 border-b p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                <Camera className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-display font-semibold text-sm">
                    {sahaPreviewPerson.ad} {sahaPreviewPerson.soyad} — Saha Faaliyetleri
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} dönemi
                    {' · '}{sahaPreviewFaaliyetleri.length} kayıt
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSahaPreviewPerson(null)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer text-sm"
              >
                ✖
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {sahaPreviewFaaliyetleri.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Camera className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold text-sm">Bu dönemde saha faaliyet kaydı bulunamadı.</p>
                  <p className="text-[11px] mt-1 text-slate-400">Formen mobil veya idari saha ekranından girilen kayıtlar burada görünür.</p>
                </div>
              ) : (
                sahaPreviewFaaliyetleri.map((f) => {
                  const fotolar = getFaaliyetFotolar(f);
                  const foto = fotolar[0] || '';
                  const tarihLabel = (() => {
                    const dk = normalizeDateKey(f.tarih);
                    if (!dk) return f.tarih;
                    const [y, m, d] = dk.split('-').map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
                  })();
                  return (
                    <div key={f.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col sm:flex-row">
                      <div className={`shrink-0 bg-slate-100 flex items-center justify-center relative ${foto ? 'sm:w-44 h-36 sm:h-auto' : 'hidden'}`}>
                        {foto ? (
                          <>
                            <img
                              src={foto}
                              alt="Saha fotoğrafı"
                              className="w-full h-full object-cover min-h-[9rem]"
                              loading="lazy"
                            />
                            {fotolar.length > 1 && (
                              <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                                +{fotolar.length - 1} foto
                              </span>
                            )}
                          </>
                        ) : null}
                      </div>
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <span className="text-[11px] font-bold text-slate-700">{tarihLabel}</span>
                          {f.kaynakEkran && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-800 bg-slate-50 px-2 py-0.5 rounded-full">
                              {f.kaynakEkran.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                          {f.isNiteligi || 'İş niteliği belirtilmemiş'}
                          {isMesaiSahaFaaliyet(f) && (
                            <span className="text-[8px] font-black uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                              Mesai Faaliyet
                            </span>
                          )}
                        </div>
                        {isMesaiSahaFaaliyet(f) && (
                          <div className="text-[10px] text-amber-800 font-semibold mb-1.5">
                            Mesai: {formatMesaiFaaliyetLabel(f, personeller) || '—'}
                          </div>
                        )}
                        {(f.parsel || f.blok) && (
                          <div className="text-[10px] text-slate-500 font-semibold mb-1.5">
                            {[f.parsel && `Parsel: ${f.parsel}`, f.blok && `Blok: ${f.blok}`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {f.aciklama && (
                          <p className="text-[11px] text-slate-600 leading-relaxed">{f.aciklama}</p>
                        )}
                        {!foto && (
                          <div className="mt-2 text-[10px] text-slate-400 italic flex items-center gap-1">
                            <Camera className="w-3 h-3" /> Fotoğraf eklenmemiş
                          </div>
                        )}
                        {(f.ustaSayisi != null || f.isciSayisi != null) && (
                          <div className="mt-2 text-[9px] text-slate-400">
                            {[f.ustaSayisi != null && `Usta: ${f.ustaSayisi}`, f.isciSayisi != null && `İşçi: ${f.isciSayisi}`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSahaPreviewPerson(null)}
                className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition duration-150 cursor-pointer shadow-md"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default YoklamaScreen;
