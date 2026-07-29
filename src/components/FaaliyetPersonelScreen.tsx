import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  MapPin,
  Images,
  HardHat,
  UserRound,
  Layers,
  X,
  Tent,
  FileSpreadsheet,
  Printer,
  Loader2,
  UserX,
  Send,
  Tag,
} from 'lucide-react';
import { AylikYoklamaMap, KampFaaliyet, MermerciFaaliyet, Personel, SahaFaaliyeti, TesisatciFaaliyet } from '../types/erp';
import { FaaliyetEtiketIlerlemePanel } from './FaaliyetEtiketIlerlemePanel';
import {
  FAALIYET_ETIKET_ONSETLERI,
  normalizeFaaliyetEtiketi,
} from '../lib/faaliyetEtiketUtils';
import {
  formatMesaiFaaliyetLabel,
  getFaaliyetFotolar,
  getFaaliyetTumFotolar,
  isMesaiSahaFaaliyet,
} from '../lib/sahaFaaliyetUtils';
import {
  buildDayFaaliyetOzeti,
  buildDayPersonelRaporu,
  buildFaaliyetPersoneller,
  buildFaaliyetsizPersoneller,
  buildPeriodFaaliyetOzeti,
  buildPersonelAyOzeti,
  countPersonFaaliyetFotolar,
  filterFaaliyetlerByDate,
  formatFaaliyetTarihLabel,
  getPersonFaaliyetleriInPeriod,
  getPersonKampFaaliyetleriInPeriod,
  kampFaaliyetCalisanSayisi,
  resolveFaaliyetEkip,
} from '../lib/faaliyetPersonelUtils';
import { buildAtanmamisGeldiHavuzu } from '../lib/geldiHavuzuUtils';
import { displayPersonelGorev } from '../lib/guvenlikHelpers';
import { normalizeGorev } from '../lib/gorevUtils';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { isKampciGorev, normalizeTurkishName } from '../lib/yoklamaUtils';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { tesisatciToSaha, mermerciToSaha } from '../lib/mobilFaaliyetAdapter';
import { GunlukFaaliyetProgramScreen } from './GunlukFaaliyetProgramScreen';

type ViewMode = 'personel' | 'gun' | 'faaliyetsiz' | 'program';

interface FaaliyetPersonelScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  sahaFaaliyetleri?: SahaFaaliyeti[];
  setSahaFaaliyetleri: (
    updater: SahaFaaliyeti[] | ((prev: SahaFaaliyeti[]) => SahaFaaliyeti[])
  ) => void;
  saveSahaFaaliyetNow?: (
    record: SahaFaaliyeti,
    kaynak?: import('../lib/sahaFaaliyetPersistence').SahaFaaliyetSaveSource
  ) => Promise<unknown>;
  currentUser?: { email?: string; uid?: string } | null;
  canAssignProgram?: boolean;
}

const DURUM_STYLE: Record<string, string> = {
  Geldi: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Yok: 'bg-rose-100 text-rose-800 border-rose-200',
  İzinli: 'bg-sky-100 text-sky-800 border-sky-200',
  Raporlu: 'bg-violet-100 text-violet-800 border-violet-200',
  Pazar: 'bg-slate-100 text-slate-500 border-slate-200',
  Girilmedi: 'bg-white text-slate-300 border-slate-100',
};

const DURUM_KISA: Record<string, string> = {
  Geldi: 'G',
  Yok: 'Y',
  İzinli: 'İ',
  Raporlu: 'R',
  Pazar: 'P',
  Girilmedi: '·',
};

function kaynakEtiket(kaynak?: string): string {
  const k = String(kaynak || '').toUpperCase();
  if (k === 'FORMEN_MOBIL') return 'Formen Mobil';
  if (k === 'IDARI_SAHA') return 'İdari Saha';
  if (k === 'GUNLUK_PROGRAM') return 'Günlük Program';
  if (k === 'TESISATCI_MOBIL') return 'Tesisatçı';
  if (k === 'MERMERCI_MOBIL') return 'Mermerci';
  if (k === 'KAMPCI') return 'Kampçı';
  return k ? k.replace(/_/g, ' ') : 'Saha kaydı';
}

export const FaaliyetPersonelScreen: React.FC<FaaliyetPersonelScreenProps> = ({
  personeller,
  yoklamalar,
  sahaFaaliyetleri = [],
  setSahaFaaliyetleri,
  saveSahaFaaliyetNow,
  currentUser,
  canAssignProgram = false,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('personel');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(todayDateKey());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [kampFaaliyetleri, setKampFaaliyetleri] = useState<KampFaaliyet[]>([]);
  const [tesisatciFaaliyetleri, setTesisatciFaaliyetleri] = useState<TesisatciFaaliyet[]>([]);
  const [mermerciFaaliyetleri, setMermerciFaaliyetleri] = useState<MermerciFaaliyet[]>([]);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [programFocusPersonId, setProgramFocusPersonId] = useState<string | null>(null);
  const [faaliyetsizSearch, setFaaliyetsizSearch] = useState('');
  const [etiketFilter, setEtiketFilter] = useState('');
  const [gunSonuNot, setGunSonuNot] = useState('');
  const [gunSonuBusy, setGunSonuBusy] = useState(false);
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snap) => {
      const list: KampFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<KampFaaliyet, 'id'>) }));
      setKampFaaliyetleri(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tesisatciFaaliyetleri'), (snap) => {
      const list: TesisatciFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TesisatciFaaliyet, 'id'>) }));
      setTesisatciFaaliyetleri(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'mermerciFaaliyetleri'), (snap) => {
      const list: MermerciFaaliyet[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<MermerciFaaliyet, 'id'>) }));
      setMermerciFaaliyetleri(list);
    });
    return () => unsub();
  }, []);

  /** Formen saha + tesisatçı + mermerci (program atama havuzuna karışmaz) */
  const tumSahaFaaliyetleri = useMemo(
    () => [
      ...sahaFaaliyetleri,
      ...tesisatciFaaliyetleri.map(tesisatciToSaha),
      ...mermerciFaaliyetleri.map(mermerciToSaha),
    ],
    [sahaFaaliyetleri, tesisatciFaaliyetleri, mermerciFaaliyetleri]
  );

  const periodLabel = useMemo(
    () =>
      new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
        month: 'long',
        year: 'numeric',
      }),
    [selectedYear, selectedMonth]
  );

  const faaliyetPersoneller = useMemo(
    () =>
      buildFaaliyetPersoneller(
        tumSahaFaaliyetleri,
        personeller,
        selectedYear,
        selectedMonth,
        kampFaaliyetleri
      ),
    [tumSahaFaaliyetleri, kampFaaliyetleri, personeller, selectedYear, selectedMonth]
  );

  const faaliyetsizPersoneller = useMemo(
    () =>
      buildFaaliyetsizPersoneller(
        tumSahaFaaliyetleri,
        personeller,
        selectedYear,
        selectedMonth,
        kampFaaliyetleri,
        yoklamalar
      ),
    [tumSahaFaaliyetleri, kampFaaliyetleri, personeller, selectedYear, selectedMonth, yoklamalar]
  );

  const filteredFaaliyetsiz = useMemo(() => {
    const term = faaliyetsizSearch.trim().toLowerCase();
    if (!term) return faaliyetsizPersoneller;
    return faaliyetsizPersoneller.filter((p) => {
      const full = `${p.ad} ${p.soyad}`.toLowerCase();
      return (
        full.includes(term) ||
        (p.tcNo || '').includes(term) ||
        displayPersonelGorev(p).toLowerCase().includes(term)
      );
    });
  }, [faaliyetsizPersoneller, faaliyetsizSearch]);

  const faaliyetsizByGorev = useMemo(() => {
    const map = new Map<string, Personel[]>();
    for (const p of filteredFaaliyetsiz) {
      const g = normalizeGorev(displayPersonelGorev(p));
      const list = map.get(g) || [];
      list.push(p);
      map.set(g, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'tr', { sensitivity: 'base' })
    );
  }, [filteredFaaliyetsiz]);

  const atanmamisGeldiGun = useMemo(
    () =>
      buildAtanmamisGeldiHavuzu(personeller, yoklamalar, tumSahaFaaliyetleri, selectedDate),
    [personeller, yoklamalar, tumSahaFaaliyetleri, selectedDate]
  );

  const periodOzet = useMemo(
    () =>
      buildPeriodFaaliyetOzeti(
        tumSahaFaaliyetleri,
        personeller,
        selectedYear,
        selectedMonth,
        kampFaaliyetleri
      ),
    [tumSahaFaaliyetleri, kampFaaliyetleri, personeller, selectedYear, selectedMonth]
  );

  const filteredList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const base = !term
      ? faaliyetPersoneller
      : faaliyetPersoneller.filter((p) => {
          const full = `${p.ad} ${p.soyad}`.toLowerCase();
          return (
            full.includes(term) ||
            (p.tcNo || '').includes(term) ||
            (p.gorev || '').toLowerCase().includes(term)
          );
        });
    const byName = new Map<string, Personel>();
    for (const p of base) {
      const key = normalizeTurkishName(`${p.ad} ${p.soyad}`);
      if (!byName.has(key)) byName.set(key, p);
    }
    return Array.from(byName.values());
  }, [faaliyetPersoneller, searchTerm]);

  useEffect(() => {
    if (!selectedPersonId) return;
    if (!filteredList.some((p) => p.id === selectedPersonId)) {
      setSelectedPersonId(filteredList[0]?.id || null);
    }
  }, [filteredList, selectedPersonId]);

  useEffect(() => {
    setSelectedPersonId((prev) => {
      if (prev && filteredList.some((p) => p.id === prev)) return prev;
      return filteredList[0]?.id || null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  const selectedPerson = useMemo(
    () => filteredList.find((p) => p.id === selectedPersonId) || null,
    [filteredList, selectedPersonId]
  );

  const personFaaliyetleri = useMemo(
    () =>
      selectedPerson
        ? getPersonFaaliyetleriInPeriod(
            selectedPerson,
            tumSahaFaaliyetleri,
            selectedYear,
            selectedMonth
          )
        : [],
    [selectedPerson, tumSahaFaaliyetleri, selectedYear, selectedMonth]
  );

  const personKampFaaliyetleri = useMemo(
    () =>
      selectedPerson
        ? getPersonKampFaaliyetleriInPeriod(
            selectedPerson,
            kampFaaliyetleri,
            selectedYear,
            selectedMonth
          )
        : [],
    [selectedPerson, kampFaaliyetleri, selectedYear, selectedMonth]
  );

  const personFotoSayisi = useMemo(
    () =>
      personFaaliyetleri.reduce((n, f) => n + getFaaliyetTumFotolar(f).length, 0) +
      personKampFaaliyetleri.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0),
    [personFaaliyetleri, personKampFaaliyetleri]
  );

  const ayOzeti = useMemo(
    () =>
      selectedPerson
        ? buildPersonelAyOzeti(selectedPerson, yoklamalar, selectedYear, selectedMonth)
        : null,
    [selectedPerson, yoklamalar, selectedYear, selectedMonth]
  );

  const daySahaFaaliyetleri = useMemo((): SahaFaaliyeti[] => {
    return filterFaaliyetlerByDate<SahaFaaliyeti>(tumSahaFaaliyetleri, selectedDate).sort((a, b) =>
      String(b.isNiteligi || '').localeCompare(String(a.isNiteligi || ''), 'tr')
    );
  }, [tumSahaFaaliyetleri, selectedDate]);

  const daySahaFiltered = useMemo(() => {
    const ef = normalizeFaaliyetEtiketi(etiketFilter);
    if (!ef) return daySahaFaaliyetleri;
    return daySahaFaaliyetleri.filter((f) => normalizeFaaliyetEtiketi(f.isEtiketi) === ef);
  }, [daySahaFaaliyetleri, etiketFilter]);

  const personFaaliyetFiltered = useMemo(() => {
    const ef = normalizeFaaliyetEtiketi(etiketFilter);
    if (!ef) return personFaaliyetleri;
    return personFaaliyetleri.filter((f) => normalizeFaaliyetEtiketi(f.isEtiketi) === ef);
  }, [personFaaliyetleri, etiketFilter]);

  const editableSahaIds = useMemo(
    () => new Set(sahaFaaliyetleri.map((f) => f.id)),
    [sahaFaaliyetleri]
  );

  const patchSahaFaaliyet = async (base: SahaFaaliyeti, patch: Partial<SahaFaaliyeti>) => {
    if (!editableSahaIds.has(base.id)) {
      alert('Bu kayıt Formen/program saha koleksiyonunda değil; etiket burada düzenlenemez.');
      return;
    }
    const next = { ...base, ...patch };
    setPatchBusyId(base.id);
    try {
      if (saveSahaFaaliyetNow) {
        await saveSahaFaaliyetNow(next, 'idari_saha');
      } else {
        setSahaFaaliyetleri((prev) => prev.map((f) => (f.id === next.id ? next : f)));
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Faaliyet güncellenemedi.');
    } finally {
      setPatchBusyId(null);
    }
  };

  const handleGunSonuGonder = async () => {
    if (daySahaFaaliyetleri.length === 0) {
      alert('Bu gün için yönetime gönderilecek saha faaliyeti yok.');
      return;
    }
    if (
      !window.confirm(
        `${dayLabel} için ${daySahaFaaliyetleri.length} saha kaydı + yoklama özeti yönetime gönderilsin mi?`
      )
    ) {
      return;
    }
    setGunSonuBusy(true);
    try {
      const { submitFaaliyetGunSonuRapor, openFaaliyetGunSonuReport } = await import(
        '../lib/faaliyetGunSonuRapor'
      );
      const { getYoklamaDay, isIdariPersonel, isTaseronPersonel } = await import(
        '../lib/yoklamaUtils'
      );
      const parts = selectedDate.split('-').map(Number);
      let geldi = 0;
      let yok = 0;
      let izinli = 0;
      let raporlu = 0;
      for (const p of personeller) {
        if (isTaseronPersonel(p) || isIdariPersonel(p)) continue;
        const aktif = p.durum === true || String(p.durum).toLowerCase() === 'true';
        if (!aktif || String(p.istenCikisTarihi || '').trim()) continue;
        const day = getYoklamaDay(yoklamalar[p.id], parts[0], parts[1], parts[2]);
        const d = String(day?.durum || '');
        if (d === 'Geldi') geldi += 1;
        else if (d === 'Yok') yok += 1;
        else if (d === 'İzinli') izinli += 1;
        else if (d === 'Raporlu') raporlu += 1;
      }
      const { html } = await submitFaaliyetGunSonuRapor({
        dateKey: selectedDate,
        sahaFaaliyetleri: daySahaFaaliyetleri,
        personeller,
        genelNotlar: gunSonuNot,
        olusturanEmail: currentUser?.email || 'yonetim',
        yoklamalar,
        kampFaaliyetleri: dayKampFaaliyetleri,
        yoklamaOzet: { gelen: geldi, yok, izinli, raporlu },
      });
      openFaaliyetGunSonuReport(html, `Gün Sonu — ${dayLabel}`);
      alert('Gün sonu raporu arşive ve onay kuyruğuna yazıldı.');
      setGunSonuNot('');
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Gün sonu raporu gönderilemedi.');
    } finally {
      setGunSonuBusy(false);
    }
  };

  const dayKampFaaliyetleri = useMemo((): KampFaaliyet[] => {
    return filterFaaliyetlerByDate<KampFaaliyet>(kampFaaliyetleri, selectedDate).sort((a, b) =>
      String(a.yerleskeAdi || '').localeCompare(String(b.yerleskeAdi || ''), 'tr')
    );
  }, [kampFaaliyetleri, selectedDate]);

  const dayOzet = useMemo(
    () =>
      buildDayFaaliyetOzeti(
        tumSahaFaaliyetleri,
        kampFaaliyetleri,
        personeller,
        selectedDate,
        yoklamalar
      ),
    [tumSahaFaaliyetleri, kampFaaliyetleri, personeller, selectedDate, yoklamalar]
  );

  const dayPersonelRaporu = useMemo(
    () =>
      buildDayPersonelRaporu(
        daySahaFaaliyetleri,
        dayKampFaaliyetleri,
        personeller,
        selectedDate,
        yoklamalar
      ),
    [daySahaFaaliyetleri, dayKampFaaliyetleri, personeller, selectedDate, yoklamalar]
  );

  const dayLabel = useMemo(() => formatDateLabelTr(selectedDate), [selectedDate]);

  const shiftMonth = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y < 2024 || y > 2027) return;
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  const shiftDay = (delta: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    if (y < 2024 || y > 2027) return;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${mm}-${dd}`);
  };

  const openLightbox = (urls: string[], index: number) => {
    if (!urls.length) return;
    setLightbox({ urls, index: Math.max(0, Math.min(index, urls.length - 1)) });
  };

  const dayHasRecords =
    daySahaFaaliyetleri.length > 0 || dayKampFaaliyetleri.length > 0;

  const handleDayPdfReport = () => {
    if (!dayHasRecords) {
      alert('Bu gün için raporlanacak faaliyet kaydı yok.');
      return;
    }
    void import('../lib/faaliyetGunlukReport').then(
      ({ buildFaaliyetGunlukReportHtml, openFaaliyetGunlukReportPdf }) => {
        const html = buildFaaliyetGunlukReportHtml({
          dateKey: selectedDate,
          sahaFaaliyetleri: daySahaFaaliyetleri,
          kampFaaliyetleri: dayKampFaaliyetleri,
          personeller,
          yoklamalar,
        });
        openFaaliyetGunlukReportPdf(html, `Günlük Faaliyet — ${dayLabel}`);
      }
    );
  };

  const handleDayExcelReport = async () => {
    if (!dayHasRecords) {
      alert('Bu gün için raporlanacak faaliyet kaydı yok.');
      return;
    }
    setExportingExcel(true);
    try {
      const { exportFaaliyetGunlukExcel } = await import('../lib/faaliyetGunlukReport');
      await exportFaaliyetGunlukExcel({
        dateKey: selectedDate,
        sahaFaaliyetleri: daySahaFaaliyetleri,
        kampFaaliyetleri: dayKampFaaliyetleri,
        personeller,
        yoklamalar,
      });
    } catch (err) {
      console.error(err);
      alert('Excel raporu oluşturulamadı. Tekrar deneyin.');
    } finally {
      setExportingExcel(false);
    }
  };

  /** Eski kamp kayıtlarında yanlış etiketlenen düz işçi/usta vb. temizle */
  const handleRepairKampEtiket = async () => {
    if (dayKampFaaliyetleri.length === 0) {
      alert('Bu gün için kamp faaliyeti yok.');
      return;
    }
    if (
      !window.confirm(
        `KAMP PERSONEL LİSTESİNİ DÜZELT\n\n` +
          `${dayLabel} tarihli kamp faaliyetlerinde:\n` +
          `• Faaliyet kaydı SİLİNMEZ\n` +
          `• Fotoğraf / açıklama DEĞİŞMEZ\n` +
          `• Sadece personel listesinden KAMPÇI olmayanlar (düz işçi, usta, formen vb.) çıkarılır\n\n` +
          `Devam edilsin mi?`
      )
    ) {
      return;
    }
    try {
      const { filterIdsToKampciOnly } = await import('../lib/mobilRolEtiketUtils');
      const { doc, updateDoc } = await import('firebase/firestore');
      let fixed = 0;
      for (const f of dayKampFaaliyetleri) {
        const before = f.aktifPersonelListesi || [];
        const after = filterIdsToKampciOnly(before, personeller);
        if (after.length === before.length && after.every((id, i) => id === before[i])) continue;
        await updateDoc(doc(db, 'kampGunlukFaaliyetleri', f.id), {
          aktifPersonelListesi: after,
          personelId: after[0] || f.personelId || null,
        });
        fixed += 1;
      }
      alert(
        fixed > 0
          ? `${fixed} kamp kaydında fazla personel etiketi temizlendi. Kayıtlar ve fotoğraflar duruyor.`
          : 'Düzeltilecek fazla etiket yok (listeler zaten yalnızca kampçı).'
      );
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Kamp etiket onarımı başarısız.');
    }
  };

  const renderFotoGrid = (id: string, fotolar: string[], emptyHint = 'Bu kayıtta saha fotoğrafı yok') =>
    fotolar.length > 0 ? (
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Camera size={12} className="text-amber-600" />
          Saha fotoğrafları ({fotolar.length})
        </p>
        <div
          className={`grid gap-2 ${
            fotolar.length === 1
              ? 'grid-cols-1'
              : fotolar.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {fotolar.map((url, idx) => (
            <button
              key={`${id}-foto-${idx}`}
              type="button"
              onClick={() => openLightbox(fotolar, idx)}
              className={`relative group overflow-hidden rounded-xl border border-slate-200 bg-slate-100 cursor-pointer ${
                fotolar.length === 1 ? 'h-52 sm:h-64' : 'h-36 sm:h-40'
              }`}
            >
              <img
                src={url}
                alt={`Saha fotoğrafı ${idx + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                loading="lazy"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.opacity = '0.35';
                  el.alt = 'Fotoğraf yüklenemedi';
                }}
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-2 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition">
                {idx + 1} / {fotolar.length} · büyüt
              </span>
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[11px] text-slate-400 italic flex items-center gap-2">
        <Camera size={14} />
        {emptyHint}
      </div>
    );

  const renderEkipChips = (
    id: string,
    ekip: Array<{ id?: string; adSoyad: string; mesaiSaati?: number }>,
    highlightPersonId?: string | null
  ) =>
    ekip.length > 0 ? (
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <UserRound size={12} />
          Bu işteki ekip ({ekip.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ekip.map((u) => {
            const isSelf =
              !!highlightPersonId &&
              (u.id === highlightPersonId ||
                (selectedPerson &&
                  normalizeTurkishName(u.adSoyad) ===
                    normalizeTurkishName(`${selectedPerson.ad} ${selectedPerson.soyad}`)));
            return (
              <span
                key={`${id}-${u.adSoyad}`}
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  isSelf
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                {u.adSoyad}
                {u.mesaiSaati != null && u.mesaiSaati > 0 && (
                  <span className="text-amber-700 font-black">· {u.mesaiSaati}sa</span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    ) : null;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') {
        setLightbox((prev) =>
          prev
            ? { ...prev, index: (prev.index + 1) % prev.urls.length }
            : prev
        );
      }
      if (e.key === 'ArrowLeft') {
        setLightbox((prev) =>
          prev
            ? {
                ...prev,
                index: (prev.index - 1 + prev.urls.length) % prev.urls.length,
              }
            : prev
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 rounded-3xl p-5 sm:p-6 text-white shadow-lg overflow-hidden relative">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(251,191,36,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(148,163,184,0.2), transparent 35%)',
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/90">
              Personel · Faaliyet Geçmişi
            </p>
            <h1 className="text-xl sm:text-2xl font-black mt-1 tracking-tight">
              Faaliyeti Olan Personeller
            </h1>
            <p className="text-xs text-slate-300 mt-2 max-w-xl leading-relaxed">
              Ana firma saha personeli (Düz işçi, Tesisatçı, Kampçı vb.) — Formen ve idari kadro
              hariç. Saha ve kampçı faaliyetleri, ekip ve fotoğraflarla.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <div className="flex rounded-2xl bg-white/10 border border-white/15 p-1">
              <button
                type="button"
                onClick={() => setViewMode('personel')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide cursor-pointer transition ${
                  viewMode === 'personel'
                    ? 'bg-amber-400 text-slate-900'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Personel
              </button>
              <button
                type="button"
                onClick={() => setViewMode('gun')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide cursor-pointer transition inline-flex items-center gap-1.5 ${
                  viewMode === 'gun'
                    ? 'bg-amber-400 text-slate-900'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Calendar size={12} />
                Güne Göre
              </button>
              <button
                type="button"
                onClick={() => setViewMode('faaliyetsiz')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide cursor-pointer transition inline-flex items-center gap-1.5 ${
                  viewMode === 'faaliyetsiz'
                    ? 'bg-rose-400 text-slate-900'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <UserX size={12} />
                Faaliyetsiz
                {faaliyetsizPersoneller.length > 0 ? (
                  <span className="ml-0.5 bg-slate-900/20 rounded-full px-1.5 py-0.5 text-[9px]">
                    {faaliyetsizPersoneller.length}
                  </span>
                ) : null}
              </button>
              {canAssignProgram && (
                <button
                  type="button"
                  onClick={() => {
                    setProgramFocusPersonId(null);
                    setViewMode('program');
                  }}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide cursor-pointer transition inline-flex items-center gap-1.5 ${
                    viewMode === 'program'
                      ? 'bg-amber-400 text-slate-900'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <HardHat size={12} />
                  Görev Ata
                </button>
              )}
            </div>
            {viewMode === 'personel' || viewMode === 'faaliyetsiz' ? (
              <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-2">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                  title="Önceki ay"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex gap-2 items-center px-1">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-slate-900/60 border border-white/20 rounded-lg text-xs font-bold px-2 py-1.5 cursor-pointer"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i, 1).toLocaleDateString('tr-TR', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-slate-900/60 border border-white/20 rounded-lg text-xs font-bold px-2 py-1.5 cursor-pointer"
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                  title="Sonraki ay"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            ) : viewMode === 'gun' ? (
              <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-2">
                <button
                  type="button"
                  onClick={() => shiftDay(-1)}
                  className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                  title="Önceki gün"
                >
                  <ChevronLeft size={18} />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  min="2024-01-01"
                  max="2027-12-31"
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="bg-slate-900/60 border border-white/20 rounded-lg text-xs font-bold px-2 py-1.5 cursor-pointer text-white"
                />
                <button
                  type="button"
                  onClick={() => shiftDay(1)}
                  className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                  title="Sonraki gün"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayDateKey())}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  Bugün
                </button>
              </div>
            ) : (
              <p className="text-[10px] font-bold text-amber-200 text-right px-2">
                Formen / Yönetici görev programı
              </p>
            )}
          </div>
        </div>

        {viewMode !== 'program' && (
        <div className={`relative mt-5 grid grid-cols-2 gap-2 ${
          viewMode === 'personel'
            ? 'sm:grid-cols-3 lg:grid-cols-6'
            : viewMode === 'faaliyetsiz'
              ? 'sm:grid-cols-3 lg:grid-cols-4'
              : 'sm:grid-cols-5'
        }`}>
          {(viewMode === 'personel'
            ? [
                { icon: Calendar, label: 'Dönem', value: periodLabel, mono: false },
                { icon: Users, label: 'Personel', value: String(periodOzet.personelSayisi) },
                { icon: Layers, label: 'Faaliyet', value: String(periodOzet.faaliyetSayisi) },
                { icon: Images, label: 'Fotoğraf', value: String(periodOzet.fotoSayisi) },
                {
                  icon: Tent,
                  label: 'Kamp çalışan',
                  value: String(periodOzet.kampCalisanSayisi),
                },
                {
                  icon: MapPin,
                  label: 'Saha / Kamp',
                  value: `${periodOzet.sahaFaaliyetSayisi} · ${periodOzet.kampFaaliyetSayisi}`,
                },
              ]
            : viewMode === 'faaliyetsiz'
              ? [
                  { icon: Calendar, label: 'Dönem', value: periodLabel, mono: false },
                  {
                    icon: UserX,
                    label: 'Faaliyetsiz',
                    value: String(faaliyetsizPersoneller.length),
                  },
                  {
                    icon: Users,
                    label: 'Faaliyetli',
                    value: String(periodOzet.personelSayisi),
                  },
                  {
                    icon: Layers,
                    label: 'Görev grubu',
                    value: String(faaliyetsizByGorev.length),
                  },
                ]
            : [
                { icon: Calendar, label: 'Gün', value: dayLabel, mono: false },
                { icon: Users, label: 'Faaliyetli', value: String(dayOzet.personelSayisi) },
                { icon: XCircle, label: 'Yok', value: String(dayOzet.yokSayisi) },
                { icon: Layers, label: 'Faaliyet', value: String(dayOzet.faaliyetSayisi) },
                { icon: Images, label: 'Fotoğraf', value: String(dayOzet.fotoSayisi) },
              ]
          ).map((item) => (
            <div
              key={item.label}
              className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-amber-200/90">
                <item.icon size={11} />
                {item.label}
              </div>
              <p
                className={`mt-1 font-black text-white ${
                  item.mono === false ? 'text-[11px] leading-snug capitalize' : 'text-lg'
                }`}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
        )}
      </div>

      {viewMode === 'program' ? (
        <GunlukFaaliyetProgramScreen
          personeller={personeller}
          yoklamalar={yoklamalar}
          sahaFaaliyetleri={sahaFaaliyetleri}
          setSahaFaaliyetleri={setSahaFaaliyetleri}
          saveSahaFaaliyetNow={saveSahaFaaliyetNow}
          currentUser={currentUser}
          initialDate={selectedDate}
          focusPersonId={programFocusPersonId}
        />
      ) : viewMode === 'faaliyetsiz' ? (
        <section className="bg-white border border-rose-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-rose-100 bg-rose-50/50 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <UserX size={16} className="text-rose-600" />
                Faaliyet Verilmemiş Personeller
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                {periodLabel} · Ana firma saha kadrosundan henüz hiç faaliyet kaydı olmayanlar
                (göreve göre gruplu)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={faaliyetsizSearch}
                  onChange={(e) => setFaaliyetsizSearch(e.target.value)}
                  placeholder="Ad, TC veya görev ara…"
                  className="w-56 pl-9 pr-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-xl outline-none focus:border-rose-400"
                />
              </label>
              {canAssignProgram && (
                <button
                  type="button"
                  onClick={() => {
                    setProgramFocusPersonId(null);
                    setViewMode('program');
                  }}
                  className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer"
                >
                  <HardHat size={13} />
                  Görev Ata Ekranı
                </button>
              )}
            </div>
          </div>

          {filteredFaaliyetsiz.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <CheckCircle2 className="mx-auto text-emerald-500 opacity-80" size={32} />
              <p className="font-bold text-slate-600">
                {faaliyetsizSearch.trim()
                  ? 'Aramaya uyan faaliyetsiz personel yok'
                  : 'Bu dönemde faaliyetsiz personel kalmadı'}
              </p>
              <p>Tüm kapsam personeline en az bir faaliyet bağlanmış görünüyor.</p>
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-[11px] text-slate-600 font-semibold">
                {filteredFaaliyetsiz.length} kişi · {faaliyetsizByGorev.length} görev grubu
                {!canAssignProgram
                  ? ' · Faaliyet atamak için Formen/Yönetici yetkisi gerekir'
                  : ' · Satırdan “Görev Ata” ile günlük programa geçebilirsiniz'}
              </p>
              {faaliyetsizByGorev.map(([gorev, list]) => (
                <div
                  key={gorev}
                  className="rounded-2xl border border-slate-200 overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2">
                    <h3 className="text-[11px] font-black uppercase tracking-wider">{gorev}</h3>
                    <span className="text-[10px] font-bold bg-white/15 rounded-full px-2.5 py-0.5">
                      {list.length} kişi
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {list.map((p) => (
                      <li
                        key={p.id}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-white hover:bg-rose-50/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {p.fotografUrl ? (
                            <img
                              src={p.fotografUrl}
                              alt=""
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                              {(p.ad?.[0] || '').toUpperCase()}
                              {(p.soyad?.[0] || '').toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">
                              {p.ad} {p.soyad}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                              {p.tcNo ? `TC ${p.tcNo}` : 'TC yok'}
                              {p.telefonNo ? ` · ${p.telefonNo}` : ''}
                              {p.iseGirisTarihi ? ` · Giriş ${p.iseGirisTarihi}` : ''}
                            </p>
                          </div>
                        </div>
                        {canAssignProgram ? (
                          <button
                            type="button"
                            onClick={() => {
                              setProgramFocusPersonId(p.id);
                              setSelectedDate(todayDateKey());
                              setViewMode('program');
                            }}
                            className="inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-xl bg-amber-500 text-slate-900 hover:bg-amber-400 cursor-pointer"
                          >
                            <HardHat size={12} />
                            Görev Ata
                          </button>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-100 px-2 py-1 rounded-lg">
                            Faaliyet yok
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : viewMode === 'personel' ? (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[60vh]">
        <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden max-h-[75vh]">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <label className="relative block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ad, TC veya görev ara…"
                className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400"
              />
            </label>
            <p className="text-[10px] text-slate-500 font-semibold">
              {filteredList.length} sonuç · tıklayınca sağda özet açılır
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                <Camera className="mx-auto opacity-30" size={28} />
                <p className="font-bold text-slate-500">Bu dönemde faaliyetli personel yok</p>
                <p>Formen / tesisatçı / mermerci / kampçı faaliyetleri girdikçe burada listelenir.</p>
              </div>
            ) : (
              filteredList.map((p) => {
                const count = getPersonFaaliyetleriInPeriod(
                  p,
                  tumSahaFaaliyetleri,
                  selectedYear,
                  selectedMonth
                ).length;
                const kampCount = getPersonKampFaaliyetleriInPeriod(
                  p,
                  kampFaaliyetleri,
                  selectedYear,
                  selectedMonth
                ).length;
                const fotoCount = countPersonFaaliyetFotolar(
                  p,
                  tumSahaFaaliyetleri,
                  selectedYear,
                  selectedMonth,
                  kampFaaliyetleri
                );
                const active = p.id === selectedPersonId;
                const isKampci = isKampciGorev(p.gorev);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPersonId(p.id)}
                    className={`w-full text-left px-3 py-3 border-b border-slate-50 transition cursor-pointer ${
                      active
                        ? 'bg-amber-50 border-l-4 border-l-amber-500'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <div className="min-w-0 flex items-start gap-2.5">
                        {p.fotografUrl ? (
                          <img
                            src={p.fotografUrl}
                            alt=""
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                            {(p.ad?.[0] || '').toUpperCase()}
                            {(p.soyad?.[0] || '').toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">
                            {p.ad} {p.soyad}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            {p.gorev || 'Görev yok'}
                            {p.tcNo ? ` · ${p.tcNo}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {isKampci && (
                              <span className="text-[8px] font-black uppercase bg-teal-50 text-teal-800 border border-teal-100 px-1.5 py-0.5 rounded-full">
                                Kampçı
                              </span>
                            )}
                            {fotoCount > 0 && (
                              <span className="text-[9px] text-amber-700 font-bold inline-flex items-center gap-1">
                                <Images size={10} /> {fotoCount} foto
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {count > 0 && (
                          <p className="text-[9px] font-black bg-slate-900 text-white rounded-full px-2 py-0.5">
                            {count} saha
                          </p>
                        )}
                        {kampCount > 0 && (
                          <p className="text-[9px] font-black bg-teal-700 text-white rounded-full px-2 py-0.5">
                            {kampCount} kamp
                          </p>
                        )}
                        {count === 0 && kampCount === 0 && (
                          <p className="text-[9px] font-black bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
                            0
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="lg:col-span-8 xl:col-span-9 space-y-4">
          {!selectedPerson || !ayOzeti ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm">
              Soldan bir personel seçin; o ay geldiği günler, mesai/devamsızlık, ekip ve tüm saha
              fotoğrafları burada açılır.
            </div>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex flex-wrap justify-between gap-3 items-start">
                  <div className="flex items-start gap-3 min-w-0">
                    {selectedPerson.fotografUrl ? (
                      <img
                        src={selectedPerson.fotografUrl}
                        alt=""
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-black text-slate-500 shrink-0">
                        {(selectedPerson.ad?.[0] || '').toUpperCase()}
                        {(selectedPerson.soyad?.[0] || '').toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-lg font-black text-slate-900">
                        {selectedPerson.ad} {selectedPerson.soyad}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {[
                          selectedPerson.gorev,
                          selectedPerson.tcNo && `TC ${selectedPerson.tcNo}`,
                          selectedPerson.iseGirisTarihi && `Giriş ${selectedPerson.iseGirisTarihi}`,
                          selectedPerson.firmaAdi,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2 font-medium">
                        {periodLabel}: {personFaaliyetleri.length} faaliyet · {personFotoSayisi}{' '}
                        saha fotoğrafı
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    Etiket &amp; ilerleme düzenlenebilir
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-center">
                    <CheckCircle2 size={14} className="mx-auto text-emerald-600 mb-1" />
                    <p className="text-[9px] font-black text-emerald-800 uppercase">Geldi</p>
                    <p className="text-lg font-black text-emerald-900">{ayOzeti.geldiGun}</p>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/80 p-3 text-center">
                    <XCircle size={14} className="mx-auto text-rose-600 mb-1" />
                    <p className="text-[9px] font-black text-rose-800 uppercase">Yok / Devamsız</p>
                    <p className="text-lg font-black text-rose-900">{ayOzeti.yokGun}</p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-center">
                    <FileText size={14} className="mx-auto text-sky-600 mb-1" />
                    <p className="text-[9px] font-black text-sky-800 uppercase">İzinli</p>
                    <p className="text-lg font-black text-sky-900">{ayOzeti.izinliGun}</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/80 p-3 text-center">
                    <AlertTriangle size={14} className="mx-auto text-violet-600 mb-1" />
                    <p className="text-[9px] font-black text-violet-800 uppercase">Raporlu</p>
                    <p className="text-lg font-black text-violet-900">{ayOzeti.raporluGun}</p>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-center col-span-2 sm:col-span-1">
                    <Clock size={14} className="mx-auto text-amber-600 mb-1" />
                    <p className="text-[9px] font-black text-amber-800 uppercase">Toplam Mesai</p>
                    <p className="text-lg font-black text-amber-900">{ayOzeti.toplamMesai} sa</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
                    Günlük yoklama / mesai şeridi (değiştirilemez)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {ayOzeti.gunDetay.map((g) => (
                      <div
                        key={g.day}
                        title={`${g.day}. gün: ${g.durum}${g.mesaiSaati ? ` · mesai ${g.mesaiSaati}` : ''}`}
                        className={`w-8 rounded-md border text-center py-1 ${DURUM_STYLE[g.durum] || DURUM_STYLE.Girilmedi}`}
                      >
                        <div className="text-[8px] font-bold opacity-70">{g.day}</div>
                        <div className="text-[10px] font-black leading-none">
                          {DURUM_KISA[g.durum] || '·'}
                        </div>
                        {g.mesaiSaati > 0 && (
                          <div className="text-[7px] font-bold mt-0.5 opacity-80">{g.mesaiSaati}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Camera size={14} className="text-amber-600" />
                    Yaptığı işler / saha faaliyetleri ({personFaaliyetFiltered.length}
                    {etiketFilter ? ` / ${personFaaliyetleri.length}` : ''})
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                      <Tag size={12} className="text-amber-600" />
                      <select
                        value={etiketFilter}
                        onChange={(e) => setEtiketFilter(e.target.value)}
                        className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer"
                      >
                        <option value="">Tüm etiketler</option>
                        {FAALIYET_ETIKET_ONSETLERI.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                    {personFotoSayisi > 0 && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                        <Images size={12} />
                        {personFotoSayisi} fotoğraf bu personelde
                      </span>
                    )}
                  </div>
                </div>

                {personFaaliyetFiltered.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs">
                    {etiketFilter
                      ? 'Bu etiket için saha faaliyet kartı yok.'
                      : 'Bu ay için saha faaliyet kartı yok.'}
                  </div>
                ) : (
                  personFaaliyetFiltered.map((f) => {
                    const fotolar = getFaaliyetTumFotolar(f);
                    const ekip = resolveFaaliyetEkip(f, personeller);
                    const mesaiLabel = isMesaiSahaFaaliyet(f)
                      ? formatMesaiFaaliyetLabel(f, personeller)
                      : '';
                    const canEdit = editableSahaIds.has(f.id);

                    return (
                      <article
                        key={f.id}
                        className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
                      >
                        <div className="p-4 sm:p-5 space-y-4">
                          <div className="flex flex-wrap justify-between gap-2 items-start">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-700">
                                  {formatFaaliyetTarihLabel(f.tarih)}
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                  {kaynakEtiket(f.kaynakEkran)}
                                </span>
                                {f.isEtiketi && (
                                  <span className="text-[9px] font-black uppercase bg-amber-600 text-white px-2 py-0.5 rounded-full">
                                    {normalizeFaaliyetEtiketi(f.isEtiketi)}
                                  </span>
                                )}
                                {isMesaiSahaFaaliyet(f) && (
                                  <span className="text-[8px] font-black uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                    Mesai faaliyet
                                  </span>
                                )}
                                {fotolar.length > 0 && (
                                  <span className="text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <Images size={10} />
                                    {fotolar.length} foto
                                  </span>
                                )}
                              </div>
                              <h4 className="text-base font-black text-slate-900">
                                {f.isNiteligi || 'İş niteliği belirtilmemiş'}
                              </h4>
                              {(f.parsel || f.blok) && (
                                <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                                  <MapPin size={12} className="text-amber-600" />
                                  {[f.parsel && `Parsel ${f.parsel}`, f.blok && `Blok ${f.blok}`]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-[10px] text-slate-500 space-y-1">
                              {(f.kaydeden || f.kaydedenFormen) && (
                                <p className="font-semibold">
                                  Kaydeden:{' '}
                                  <span className="text-slate-700">
                                    {f.kaydedenFormen || f.kaydeden}
                                  </span>
                                </p>
                              )}
                              {(f.ustaSayisi != null || f.isciSayisi != null) && (
                                <p className="inline-flex items-center gap-1 font-bold text-slate-600">
                                  <HardHat size={11} />
                                  {[
                                    f.ustaSayisi != null && `${f.ustaSayisi} usta`,
                                    f.isciSayisi != null && `${f.isciSayisi} işçi`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>

                          {renderFotoGrid(f.id, fotolar)}

                          {f.aciklama ? (
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                Açıklama
                              </p>
                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {f.aciklama}
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">Açıklama girilmemiş.</p>
                          )}

                          {canEdit ? (
                            <FaaliyetEtiketIlerlemePanel
                              faaliyet={f}
                              currentUserEmail={currentUser?.email}
                              busy={patchBusyId === f.id}
                              onPatch={(patch) => patchSahaFaaliyet(f, patch)}
                              onOpenFoto={openLightbox}
                            />
                          ) : (
                            f.isEtiketi || f.ilerlemeDurumu ? (
                              <p className="text-[10px] text-slate-500 font-semibold">
                                Etiket: {normalizeFaaliyetEtiketi(f.isEtiketi) || '—'} · İlerleme:{' '}
                                {f.ilerlemeDurumu || '—'}
                              </p>
                            ) : null
                          )}

                          {renderEkipChips(f.id, ekip, selectedPerson?.id)}

                          {isMesaiSahaFaaliyet(f) && (
                            <p className="text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                              Mesai özeti: {mesaiLabel || '—'}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Tent size={14} className="text-teal-600" />
                    Kampçı faaliyetleri ({personKampFaaliyetleri.length})
                  </h3>
                  <span className="text-[9px] font-bold text-teal-800 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                    Kaynak: Kampçı
                  </span>
                </div>
                {personKampFaaliyetleri.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs">
                    Bu ay için kampçı faaliyet kaydı yok.
                  </div>
                ) : (
                  personKampFaaliyetleri.map((f) => {
                    const fotolar = getFaaliyetTumFotolar(f);
                    const ekip = resolveFaaliyetEkip(f, personeller);
                    const calisan = kampFaaliyetCalisanSayisi(f, personeller);
                    return (
                      <article
                        key={`kamp-${f.id}`}
                        className="bg-white border border-teal-200 rounded-2xl overflow-hidden shadow-sm"
                      >
                        <div className="p-4 sm:p-5 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-700">
                              {formatFaaliyetTarihLabel(f.tarih)}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wide text-teal-800 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                              Kamp
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                              {f.faaliyetTipi}
                              {f.faaliyetGrubu ? ` · ${f.faaliyetGrubu}` : ''}
                            </span>
                            <span className="text-[9px] font-black uppercase bg-teal-700 text-white px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Users size={10} />
                              {calisan} çalışan
                            </span>
                            {fotolar.length > 0 && (
                              <span className="text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Images size={10} />
                                {fotolar.length} foto
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-black text-slate-900">
                            {f.yerleskeAdi || 'Kamp yerleşkesi'}
                          </h4>
                          {f.aciklama ? (
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                              {f.aciklama}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">Açıklama girilmemiş.</p>
                          )}
                          {renderFotoGrid(f.id, fotolar, 'Bu kayıtta kamp fotoğrafı yok')}
                          {renderEkipChips(f.id, ekip, selectedPerson?.id)}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      </div>
      ) : (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Calendar size={16} className="text-amber-600" />
              {dayLabel} faaliyetleri
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 font-semibold">
              Seçili günün saha ve kamp kayıtları · personel ve fotoğraflarla
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={handleDayPdfReport}
                disabled={!dayHasRecords}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-3 py-2 rounded-xl disabled:opacity-40 cursor-pointer"
                title="Yazdır / PDF olarak kaydet"
              >
                <Printer size={13} />
                PDF / Yazdır ({dayOzet.faaliyetSayisi})
              </button>
              <button
                type="button"
                onClick={() => void handleDayExcelReport()}
                disabled={!dayHasRecords || exportingExcel}
                className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-black px-3 py-2 rounded-xl disabled:opacity-40 cursor-pointer"
              >
                {exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                {exportingExcel ? 'Fotoğraflar…' : `Excel (${dayOzet.faaliyetSayisi})`}
              </button>
              <button
                type="button"
                onClick={() => void handleGunSonuGonder()}
                disabled={daySahaFaaliyetleri.length === 0 || gunSonuBusy}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-[10px] font-black px-3 py-2 rounded-xl disabled:opacity-40 cursor-pointer"
                title="Parsel/blok/etiket raporunu yönetime gönder"
              >
                {gunSonuBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Günü yönetime gönder
              </button>
              {dayKampFaaliyetleri.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRepairKampEtiket()}
                  className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer"
                  title="Kayıt silmez. Sadece kamp faaliyetlerindeki yanlış personel etiketlerini (düz işçi/usta) temizler."
                >
                  <Tent size={13} />
                  Kamp personel listesini düzelt
                </button>
              )}
            </div>
            <div className="w-full max-w-md space-y-1.5">
              <textarea
                value={gunSonuNot}
                onChange={(e) => setGunSonuNot(e.target.value)}
                rows={2}
                placeholder="Formen / yönetici günlük görüşü (rapora eklenir)…"
                className="w-full text-[10px] p-2 bg-amber-50/80 border border-amber-200 rounded-xl outline-none resize-none"
              />
              <label className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <Tag size={12} className="text-amber-600" />
                <select
                  value={etiketFilter}
                  onChange={(e) => setEtiketFilter(e.target.value)}
                  className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer"
                >
                  <option value="">Tüm etiketler</option>
                  {FAALIYET_ETIKET_ONSETLERI.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-bold justify-end">
              <span className="bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-1">
                {dayOzet.sahaSayisi} saha
              </span>
              <span className="bg-teal-50 text-teal-900 border border-teal-200 rounded-full px-2.5 py-1">
                {dayOzet.kampSayisi} kamp
              </span>
              <span className="bg-teal-700 text-white rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                <Users size={11} />
                {dayKampFaaliyetleri.reduce((n, f) => n + kampFaaliyetCalisanSayisi(f, personeller), 0)} kamp çalışan
              </span>
              <span className="bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                <Images size={11} />
                {dayOzet.fotoSayisi} foto
              </span>
              <span className="bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                <Users size={11} />
                {dayOzet.personelSayisi} faaliyetli
              </span>
              <span className="bg-rose-50 text-rose-800 border border-rose-200 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                <XCircle size={11} />
                {dayOzet.yokSayisi} yok
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Faaliyeti olan personeller özeti */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Users size={14} className="text-amber-600" />
                Faaliyeti Olan Personeller ({dayPersonelRaporu.personelSayisi})
              </h3>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-1">
                Yok: {dayPersonelRaporu.yokSayisi}
              </span>
            </div>
            {dayPersonelRaporu.faaliyetliPersoneller.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-slate-400 italic">
                Bu gün faaliyetli personel yok
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-3 py-2 font-black w-8">#</th>
                      <th className="px-3 py-2 font-black">Ad Soyad</th>
                      <th className="px-3 py-2 font-black">Görev</th>
                      <th className="px-3 py-2 font-black text-center">Saha</th>
                      <th className="px-3 py-2 font-black text-center">Kamp</th>
                      <th className="px-3 py-2 font-black text-center">Foto</th>
                      <th className="px-3 py-2 font-black text-center">Yoklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayPersonelRaporu.faaliyetliPersoneller.map((p, i) => (
                      <tr key={p.id} className="border-b border-slate-100 bg-white hover:bg-amber-50/40">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-bold text-slate-900">{p.adSoyad}</td>
                        <td className="px-3 py-2 text-slate-600">{p.gorev}</td>
                        <td className="px-3 py-2 text-center font-bold">{p.sahaSayisi}</td>
                        <td className="px-3 py-2 text-center font-bold">{p.kampSayisi}</td>
                        <td className="px-3 py-2 text-center">{p.fotoSayisi}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                              DURUM_STYLE[p.yoklamaDurum] || DURUM_STYLE.Girilmedi
                            }`}
                          >
                            {p.yoklamaDurum}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dayPersonelRaporu.yokPersoneller.length > 0 && (
              <div className="border-t border-rose-100 bg-rose-50/40 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-800 mb-2">
                  Yok Olan Personeller ({dayPersonelRaporu.yokSayisi})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dayPersonelRaporu.yokPersoneller.map((p) => (
                    <span
                      key={p.id}
                      className="text-[10px] font-bold bg-white border border-rose-200 text-rose-900 rounded-lg px-2 py-1"
                    >
                      {p.adSoyad}
                      <span className="text-rose-400 font-semibold"> · {p.gorev}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {atanmamisGeldiGun.length > 0 && (
              <div className="border-t border-amber-100 bg-amber-50/50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Geldi ama faaliyet atanmamış ({atanmamisGeldiGun.length})
                  </p>
                  {canAssignProgram && (
                    <button
                      type="button"
                      onClick={() => {
                        setProgramFocusPersonId(atanmamisGeldiGun[0]?.id || null);
                        setViewMode('program');
                      }}
                      className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-amber-500 text-slate-900 cursor-pointer"
                    >
                      <HardHat size={11} />
                      Görev Ata
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {atanmamisGeldiGun.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (!canAssignProgram) return;
                        setProgramFocusPersonId(p.id);
                        setViewMode('program');
                      }}
                      className={`text-[10px] font-bold bg-white border border-amber-200 text-amber-950 rounded-lg px-2 py-1 ${
                        canAssignProgram ? 'hover:bg-amber-100 cursor-pointer' : 'cursor-default'
                      }`}
                      title={canAssignProgram ? 'Görev atama ekranına git' : undefined}
                    >
                      {p.ad} {p.soyad}
                      <span className="text-amber-600 font-semibold">
                        {' '}
                        · {displayPersonelGorev(p)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {daySahaFaaliyetleri.length === 0 && dayKampFaaliyetleri.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Camera className="mx-auto opacity-30" size={32} />
              <p className="text-sm font-bold text-slate-600">{dayLabel} için faaliyet kaydı yok</p>
              <p className="text-xs">Başka bir gün seçin veya Formen / Kampçı girişlerini kontrol edin.</p>
            </div>
          ) : (
            <>
              {daySahaFiltered.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <HardHat size={14} className="text-amber-600" />
                    Saha faaliyetleri ({daySahaFiltered.length}
                    {etiketFilter ? ` / ${daySahaFaaliyetleri.length}` : ''})
                  </h3>
                  {daySahaFiltered.map((f) => {
                    const fotolar = getFaaliyetTumFotolar(f);
                    const ekip = resolveFaaliyetEkip(f, personeller);
                    const mesaiLabel = isMesaiSahaFaaliyet(f)
                      ? formatMesaiFaaliyetLabel(f, personeller)
                      : '';
                    const canEdit = editableSahaIds.has(f.id);
                    return (
                      <article
                        key={`day-saha-${f.id}`}
                        className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
                      >
                        <div className="p-4 sm:p-5 space-y-4">
                          <div className="flex flex-wrap justify-between gap-2 items-start">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                  {kaynakEtiket(f.kaynakEkran)}
                                </span>
                                {f.isEtiketi && (
                                  <span className="text-[9px] font-black uppercase bg-amber-600 text-white px-2 py-0.5 rounded-full">
                                    {normalizeFaaliyetEtiketi(f.isEtiketi)}
                                  </span>
                                )}
                                {isMesaiSahaFaaliyet(f) && (
                                  <span className="text-[8px] font-black uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                    Mesai faaliyet
                                  </span>
                                )}
                                {fotolar.length > 0 && (
                                  <span className="text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <Images size={10} />
                                    {fotolar.length} foto
                                  </span>
                                )}
                              </div>
                              <h4 className="text-base font-black text-slate-900">
                                {f.isNiteligi || 'İş niteliği belirtilmemiş'}
                              </h4>
                              {(f.parsel || f.blok) && (
                                <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                                  <MapPin size={12} className="text-amber-600" />
                                  {[f.parsel && `Parsel ${f.parsel}`, f.blok && `Blok ${f.blok}`]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-[10px] text-slate-500 space-y-1">
                              {(f.kaydeden || f.kaydedenFormen) && (
                                <p className="font-semibold">
                                  Kaydeden:{' '}
                                  <span className="text-slate-700">
                                    {f.kaydedenFormen || f.kaydeden}
                                  </span>
                                </p>
                              )}
                              {(f.ustaSayisi != null || f.isciSayisi != null) && (
                                <p className="inline-flex items-center gap-1 font-bold text-slate-600">
                                  <HardHat size={11} />
                                  {[
                                    f.ustaSayisi != null && `${f.ustaSayisi} usta`,
                                    f.isciSayisi != null && `${f.isciSayisi} işçi`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>

                          {renderFotoGrid(f.id, fotolar)}

                          {f.aciklama ? (
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                Açıklama
                              </p>
                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {f.aciklama}
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">Açıklama girilmemiş.</p>
                          )}

                          {canEdit ? (
                            <FaaliyetEtiketIlerlemePanel
                              faaliyet={f}
                              currentUserEmail={currentUser?.email}
                              busy={patchBusyId === f.id}
                              onPatch={(patch) => patchSahaFaaliyet(f, patch)}
                              onOpenFoto={openLightbox}
                              compact
                            />
                          ) : null}

                          {renderEkipChips(f.id, ekip) || (
                            <p className="text-[11px] text-slate-400 italic flex items-center gap-1.5">
                              <UserRound size={12} />
                              Bu kayıtta personel listesi yok
                            </p>
                          )}

                          {isMesaiSahaFaaliyet(f) && (
                            <p className="text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                              Mesai özeti: {mesaiLabel || '—'}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {dayKampFaaliyetleri.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Tent size={14} className="text-teal-600" />
                    Kampçı faaliyetleri ({dayKampFaaliyetleri.length})
                  </h3>
                  {dayKampFaaliyetleri.map((f) => {
                    const fotolar = getFaaliyetTumFotolar(f);
                    const ekip = resolveFaaliyetEkip(f, personeller);
                    const calisan = kampFaaliyetCalisanSayisi(f, personeller);
                    return (
                      <article
                        key={`day-kamp-${f.id}`}
                        className="bg-white border border-teal-200 rounded-2xl overflow-hidden shadow-sm"
                      >
                        <div className="p-4 sm:p-5 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-wide text-teal-800 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                              Kamp
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                              {f.faaliyetTipi}
                              {f.faaliyetGrubu ? ` · ${f.faaliyetGrubu}` : ''}
                            </span>
                            <span className="text-[9px] font-black uppercase bg-teal-700 text-white px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Users size={10} />
                              {calisan} çalışan
                            </span>
                            {fotolar.length > 0 && (
                              <span className="text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Images size={10} />
                                {fotolar.length} foto
                              </span>
                            )}
                            {f.kaydedenKampci && (
                              <span className="text-[10px] text-slate-500 font-semibold">
                                Kaydeden: {f.kaydedenKampci}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-black text-slate-900">
                            {f.yerleskeAdi || 'Kamp yerleşkesi'}
                          </h4>
                          {f.aciklama ? (
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                              {f.aciklama}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">Açıklama girilmemiş.</p>
                          )}
                          {renderFotoGrid(f.id, fotolar, 'Bu kayıtta kamp fotoğrafı yok')}
                          {renderEkipChips(f.id, ekip) || (
                            <p className="text-[11px] text-slate-400 italic flex items-center gap-1.5">
                              <UserRound size={12} />
                              Bu kayıtta personel listesi yok
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative w-full max-w-5xl flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white/90 text-xs font-bold px-1">
              <span>
                Fotoğraf {lightbox.index + 1} / {lightbox.urls.length}
              </span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-1.5 cursor-pointer"
              >
                <X size={14} /> Kapat
              </button>
            </div>

            <div className="relative w-full flex items-center justify-center">
              {lightbox.urls.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightbox((prev) =>
                      prev
                        ? {
                            ...prev,
                            index:
                              (prev.index - 1 + prev.urls.length) % prev.urls.length,
                          }
                        : prev
                    )
                  }
                  className="absolute left-0 sm:-left-2 z-10 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                  aria-label="Önceki fotoğraf"
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              <img
                src={lightbox.urls[lightbox.index]}
                alt={`Saha fotoğrafı ${lightbox.index + 1}`}
                referrerPolicy="no-referrer"
                className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
              {lightbox.urls.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightbox((prev) =>
                      prev
                        ? { ...prev, index: (prev.index + 1) % prev.urls.length }
                        : prev
                    )
                  }
                  className="absolute right-0 sm:-right-2 z-10 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                  aria-label="Sonraki fotoğraf"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            {lightbox.urls.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1.5 max-w-full overflow-x-auto pb-1">
                {lightbox.urls.map((url, idx) => (
                  <button
                    key={`thumb-${idx}`}
                    type="button"
                    onClick={() => setLightbox((prev) => (prev ? { ...prev, index: idx } : prev))}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 cursor-pointer shrink-0 ${
                      idx === lightbox.index
                        ? 'border-amber-400'
                        : 'border-white/20 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FaaliyetPersonelScreen;
