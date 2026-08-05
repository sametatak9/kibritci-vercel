import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Truck, Save, RefreshCw, Printer, FileSpreadsheet } from 'lucide-react';
import type { AracBakim, KiralikKamyonPuantajKaydi, Personel } from '../types/erp';
import { todayDateKey } from '../lib/dateKeyUtils';
import { mesaiInputDisplayValue, parseMesaiInputValue } from '../lib/sahaFaaliyetUtils';
import { openKiralikKamyonPuantajReport } from '../lib/kiralikKamyonPuantajReport';
import { exportKiralikKamyonPuantajExcel } from '../lib/kiralikKamyonPuantajExcel';
import { isDayActiveForPersonel, isPersonelVisibleInMonth } from '../lib/yoklamaUtils';
export function isKiralikKamyonArac(a?: AracBakim | null): boolean {
  if (!a) return false;
  if (a.kiralikKamyon === true) return true;
  return a.mulkiyet === 'KIRALIK';
}

function isAktifArac(a: AracBakim): boolean {
  return a.durum === 'AKTIF' || !a.durum;
}

export function kiralikKamyonPuantajDocId(aracId: string, tarih: string): string {
  return `kkp_${aracId}_${tarih}`;
}

function resolveAracSofor(
  personeller: Personel[],
  arac: AracBakim
): Personel | null {
  const id = String(arac.sorumluPersonelId || '').trim();
  if (!id) return null;
  return personeller.find((p) => p.id === id) || null;
}

/** Şoförü olan + seçili ayda istihdamda görünen kiralık kamyonlar */
export function filterKiralikKamyonlarForPuantaj(
  araclar: AracBakim[],
  personeller: Personel[],
  year: number,
  month: number
): AracBakim[] {
  return araclar
    .filter((a) => isKiralikKamyonArac(a) && isAktifArac(a))
    .filter((a) => {
      const sofor = resolveAracSofor(personeller, a);
      if (!sofor) return false;
      return isPersonelVisibleInMonth(sofor, year, month);
    })
    .sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'));
}

type Durum = 'Geldi' | 'Yok' | 'Girilmedi';

type CellDraft = {
  durum: Durum;
  mesaiSaati: number;
};

/** aracId → gün (1–31) → hücre */
type DraftGrid = Record<string, Record<number, CellDraft>>;

interface KiralikKamyonPuantajTabProps {
  araclar: AracBakim[];
  personeller: Personel[];
  kayitlar: KiralikKamyonPuantajKaydi[];
  setKayitlar: React.Dispatch<React.SetStateAction<KiralikKamyonPuantajKaydi[]>>;
  currentUser?: { email?: string; displayName?: string } | null;
  addNotification?: (mesaj: string) => void;
}

const AYLAR = [
  { k: 1, v: 'Ocak' },
  { k: 2, v: 'Şubat' },
  { k: 3, v: 'Mart' },
  { k: 4, v: 'Nisan' },
  { k: 5, v: 'Mayıs' },
  { k: 6, v: 'Haziran' },
  { k: 7, v: 'Temmuz' },
  { k: 8, v: 'Ağustos' },
  { k: 9, v: 'Eylül' },
  { k: 10, v: 'Ekim' },
  { k: 11, v: 'Kasım' },
  { k: 12, v: 'Aralık' },
];

const MAX_MESAI = 14;
const emptyCell = (): CellDraft => ({ durum: 'Girilmedi', mesaiSaati: 0 });

function cycleDurum(d: Durum): Durum {
  if (d === 'Girilmedi') return 'Geldi';
  if (d === 'Geldi') return 'Yok';
  return 'Girilmedi';
}

function statusColor(d: Durum): string {
  switch (d) {
    case 'Geldi':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    case 'Yok':
      return 'bg-rose-50 text-rose-800 border-rose-300';
    default:
      return 'bg-slate-50 text-slate-400 border-slate-200';
  }
}

function statusAbbr(d: Durum): string {
  if (d === 'Geldi') return 'G';
  if (d === 'Yok') return 'Y';
  return '-';
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function soforLabel(personeller: Personel[], sorumluId?: string): string {
  if (!sorumluId) return '';
  const p = personeller.find((x) => x.id === sorumluId);
  if (!p) return '';
  return `${p.ad} ${p.soyad}`.trim();
}

export const KiralikKamyonPuantajTab: React.FC<KiralikKamyonPuantajTabProps> = ({
  araclar,
  personeller,
  kayitlar,
  setKayitlar,
  currentUser,
  addNotification,
}) => {
  const today = todayDateKey();
  const [selectedMonth, setSelectedMonth] = useState(() => Number(today.slice(5, 7)) || 7);
  const [selectedYear, setSelectedYear] = useState(() => Number(today.slice(0, 4)) || 2026);
  const [draft, setDraft] = useState<DraftGrid>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const periodPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const daysArray = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  const kamyonlar = useMemo(
    () => filterKiralikKamyonlarForPuantaj(araclar, personeller, selectedYear, selectedMonth),
    [araclar, personeller, selectedYear, selectedMonth]
  );

  const soforsuzKamyonSayisi = useMemo(
    () =>
      araclar.filter(
        (a) => isKiralikKamyonArac(a) && isAktifArac(a) && !String(a.sorumluPersonelId || '').trim()
      ).length,
    [araclar]
  );

  const isSoforDayActive = useCallback(
    (arac: AracBakim, day: number): boolean => {
      const sofor = resolveAracSofor(personeller, arac);
      if (!sofor) return false;
      return isDayActiveForPersonel(sofor, selectedYear, selectedMonth, day);
    },
    [personeller, selectedYear, selectedMonth]
  );

  const hydrate = useCallback(() => {
    const next: DraftGrid = {};
    for (const arac of kamyonlar) {
      next[arac.id] = {};
      for (const day of daysArray) {
        next[arac.id][day] = emptyCell();
      }
    }

    for (const k of kayitlar) {
      if (!String(k.tarih || '').startsWith(periodPrefix)) continue;
      const day = Number(String(k.tarih).slice(8, 10));
      if (!day || day < 1 || day > daysInMonth) continue;
      if (!next[k.aracId]) {
        next[k.aracId] = {};
        for (const d of daysArray) next[k.aracId][d] = emptyCell();
      }
      next[k.aracId][day] = {
        durum: k.durum === 'Geldi' || k.durum === 'Yok' ? k.durum : 'Girilmedi',
        mesaiSaati: Number(k.mesaiSaati) || 0,
      };
    }

    setDraft(next);
    setDirty(false);
  }, [kamyonlar, kayitlar, periodPrefix, daysArray, daysInMonth]);

  useEffect(() => {
    hydrate();
    // Dönem değişince taslağı yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (dirty) return;
    hydrate();
  }, [kayitlar, kamyonlar, dirty, hydrate]);

  const dayOfWeekAbbreviation = (day: number) => {
    const d = new Date(selectedYear, selectedMonth - 1, day);
    return ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][d.getDay()];
  };

  const isSundayOrHoliday = (day: number) => {
    const d = new Date(selectedYear, selectedMonth - 1, day);
    const isSunday = d.getDay() === 0;
    const m = selectedMonth;
    const official =
      (m === 1 && day === 1) ||
      (m === 4 && day === 23) ||
      (m === 5 && day === 1) ||
      (m === 5 && day === 19) ||
      (m === 7 && day === 15) ||
      (m === 8 && day === 30) ||
      (m === 10 && day === 29);
    return {
      isHoliday: isSunday || official,
      isOfficial: !!official,
      name: official ? 'Resmi tatil' : isSunday ? 'Pazar' : undefined,
    };
  };

  const getCell = (aracId: string, day: number): CellDraft =>
    draft[aracId]?.[day] || emptyCell();

  const patchCell = (aracId: string, day: number, patch: Partial<CellDraft>) => {
    setDraft((prev) => {
      const row = { ...(prev[aracId] || {}) };
      const base = row[day] || emptyCell();
      let nextCell = { ...base, ...patch };
      if (nextCell.durum === 'Yok' || nextCell.durum === 'Girilmedi') {
        if (patch.durum === 'Yok' || patch.durum === 'Girilmedi') {
          nextCell = { ...nextCell, mesaiSaati: 0 };
        }
      }
      row[day] = nextCell;
      return { ...prev, [aracId]: row };
    });
    setDirty(true);
  };

  const handleCellClick = (arac: AracBakim, day: number) => {
    if (!isSoforDayActive(arac, day)) return;
    const cur = getCell(arac.id, day);
    const next = cycleDurum(cur.durum);
    patchCell(arac.id, day, {
      durum: next,
      mesaiSaati: next === 'Geldi' ? cur.mesaiSaati : 0,
    });
  };

  const handleMesaiChange = (arac: AracBakim, day: number, hours: number) => {
    if (!isSoforDayActive(arac, day)) return;
    const clamped = Math.max(0, Math.min(MAX_MESAI, hours));
    const cur = getCell(arac.id, day);
    patchCell(arac.id, day, {
      mesaiSaati: clamped,
      durum: clamped > 0 && cur.durum !== 'Yok' ? 'Geldi' : cur.durum,
    });
  };

  const confirmPeriodChange = (): boolean => {
    if (!dirty) return true;
    return window.confirm('Kaydedilmemiş değişiklikler var. Dönemi değiştirmek istiyor musunuz?');
  };

  const handleBulkGeldi = () => {
    if (
      !window.confirm(
        `${AYLAR.find((a) => a.k === selectedMonth)?.v} ${selectedYear} — tüm kamyonlar için iş günlerini Geldi yapmak istiyor musunuz? (Pazar/tatil hariç)`
      )
    ) {
      return;
    }
    setDraft((prev) => {
      const next: DraftGrid = { ...prev };
      for (const arac of kamyonlar) {
        const row = { ...(next[arac.id] || {}) };
        for (const day of daysArray) {
          if (!isSoforDayActive(arac, day)) continue;
          const { isHoliday } = isSundayOrHoliday(day);
          if (isHoliday) continue;
          const cur = row[day] || emptyCell();
          row[day] = { ...cur, durum: 'Geldi' };
        }
        next[arac.id] = row;
      }
      return next;
    });
    setDirty(true);
  };

  const handleBulkReset = () => {
    if (!window.confirm('Seçili ayın tüm hücreleri sıfırlansın mı?')) return;
    setDraft((prev) => {
      const next: DraftGrid = { ...prev };
      for (const arac of kamyonlar) {
        const row: Record<number, CellDraft> = {};
        for (const day of daysArray) row[day] = emptyCell();
        next[arac.id] = row;
      }
      return next;
    });
    setDirty(true);
  };

  const monthStats = useMemo(() => {
    let geldi = 0;
    let yok = 0;
    let mesai = 0;
    for (const arac of kamyonlar) {
      for (const day of daysArray) {
        if (!isSoforDayActive(arac, day)) continue;
        const c = draft[arac.id]?.[day];
        if (!c) continue;
        if (c.durum === 'Geldi') {
          geldi += 1;
          mesai += c.mesaiSaati || 0;
        } else if (c.durum === 'Yok') yok += 1;
      }
    }
    return { geldi, yok, mesai };
  }, [draft, kamyonlar, daysArray, isSoforDayActive]);

  const handleSaveMonth = async () => {
    if (kamyonlar.length === 0) {
      alert(
        soforsuzKamyonSayisi > 0
          ? `Listede şoförü tanımlı kiralık kamyon yok.\n\n${soforsuzKamyonSayisi} araç şoförsüz — Araç Envanteri’nden sorumlu şoför seçin.`
          : 'Kiralık kamyon bulunamadı.\n\nAraç Envanteri’nden kiralık kamyon olarak kayıt açın ve şoför atayın.'
      );
      return;
    }

    setSaving(true);
    try {
      const kaydeden = currentUser?.email || currentUser?.displayName || 'sistem';
      const now = new Date().toISOString();
      const toUpsert: KiralikKamyonPuantajKaydi[] = [];
      const toRemoveKeys = new Set<string>();

      for (const arac of kamyonlar) {
        const soforId = arac.sorumluPersonelId || '';
        const soforAdi = soforLabel(personeller, soforId) || undefined;

        for (const day of daysArray) {
          const tarih = dateKey(selectedYear, selectedMonth, day);
          const existing = kayitlar.find((k) => k.aracId === arac.id && k.tarih === tarih);

          // İşe giriş öncesi / çıkış sonrası — kayıt yazılmaz; varsa silinir
          if (!isSoforDayActive(arac, day)) {
            if (existing) toRemoveKeys.add(`${arac.id}|${tarih}`);
            continue;
          }

          const c = getCell(arac.id, day);
          if (c.durum === 'Girilmedi' && !existing) continue;

          toUpsert.push({
            id: kiralikKamyonPuantajDocId(arac.id, tarih),
            tarih,
            aracId: arac.id,
            plaka: arac.plaka,
            markaModel: arac.markaModel,
            soforPersonelId: soforId || undefined,
            soforAdi,
            durum: c.durum,
            mesaiSaati: c.durum === 'Geldi' ? c.mesaiSaati || 0 : 0,
            kaydeden,
            updatedAt: now,
          });
        }
      }

      setKayitlar((prev) => {
        const upsertKeys = new Set(toUpsert.map((u) => `${u.aracId}|${u.tarih}`));
        const without = prev.filter((k) => {
          const key = `${k.aracId}|${k.tarih}`;
          if (toRemoveKeys.has(key)) return false;
          if (upsertKeys.has(key)) return false;
          return true;
        });
        return [...without, ...toUpsert];
      });

      setDirty(false);
      addNotification?.(
        `Kiralık kamyon aylık puantaj kaydedildi · ${periodPrefix} · Geldi ${monthStats.geldi} · Yok ${monthStats.yok}`
      );
      alert(
        `Ay kaydedildi.\n${AYLAR.find((a) => a.k === selectedMonth)?.v} ${selectedYear}\nGeldi: ${monthStats.geldi} · Yok: ${monthStats.yok} · Mesai: ${monthStats.mesai.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`
      );
    } catch (err) {
      console.error(err);
      alert('Kayıt başarısız: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  /** Ekrandaki taslak + DB kayıtlarını seçili ay için birleştir (rapor/Excel) */
  const buildMergedKayitlarForPeriod = (): KiralikKamyonPuantajKaydi[] => {
    const map = new Map<string, KiralikKamyonPuantajKaydi>();
    for (const k of kayitlar) map.set(`${k.aracId}|${k.tarih}`, k);
    const kaydeden = currentUser?.email || currentUser?.displayName || 'sistem';
    const now = new Date().toISOString();
    for (const arac of kamyonlar) {
      const soforId = arac.sorumluPersonelId || '';
      const soforAdi = soforLabel(personeller, soforId) || undefined;
      for (const day of daysArray) {
        if (!isSoforDayActive(arac, day)) continue;
        const c = getCell(arac.id, day);
        if (c.durum === 'Girilmedi') continue;
        const tarih = dateKey(selectedYear, selectedMonth, day);
        map.set(`${arac.id}|${tarih}`, {
          id: kiralikKamyonPuantajDocId(arac.id, tarih),
          tarih,
          aracId: arac.id,
          plaka: arac.plaka,
          markaModel: arac.markaModel,
          soforPersonelId: soforId || undefined,
          soforAdi,
          durum: c.durum,
          mesaiSaati: c.durum === 'Geldi' ? c.mesaiSaati || 0 : 0,
          kaydeden,
          updatedAt: now,
        });
      }
    }
    // İşe giriş öncesi eski kayıtları rapora/Excel’e taşıma
    return [...map.values()].filter((k) => {
      const arac = kamyonlar.find((a) => a.id === k.aracId) || araclar.find((a) => a.id === k.aracId);
      if (!arac) return false;
      const day = Number(String(k.tarih).slice(8, 10));
      if (!day) return false;
      return isSoforDayActive(arac, day);
    });
  };

  const handleAyiRaporla = async () => {
    if (dirty) {
      const ok = window.confirm(
        'Kaydedilmemiş değişiklikler var. Rapor ekrandaki taslağı da dahil eder.\nÖnce kaydetmek ister misiniz?\n\nTamam = önce kaydet · İptal = yine de raporla'
      );
      if (ok) {
        await handleSaveMonth();
      }
    }
    setReporting(true);
    try {
      const merged = buildMergedKayitlarForPeriod();
      await openKiralikKamyonPuantajReport(merged, araclar, periodPrefix, personeller);
      addNotification?.(`Kiralık kamyon aylık puantaj raporu · ${periodPrefix}`);
    } catch (err) {
      console.error(err);
      alert('Rapor açılamadı: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReporting(false);
    }
  };

  const handleAyiExcel = async () => {
    if (dirty) {
      const ok = window.confirm(
        'Kaydedilmemiş değişiklikler var. Excel ekrandaki taslağı da dahil eder.\nÖnce kaydetmek ister misiniz?\n\nTamam = önce kaydet · İptal = yine de Excel indir'
      );
      if (ok) {
        await handleSaveMonth();
      }
    }
    setExportingExcel(true);
    try {
      const merged = buildMergedKayitlarForPeriod();
      await exportKiralikKamyonPuantajExcel(merged, araclar, periodPrefix, personeller);
      addNotification?.(`Kiralık kamyon puantaj Excel indirildi · ${periodPrefix}`);
    } catch (err) {
      console.error(err);
      alert('Excel oluşturulamadı: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingExcel(false);
    }
  };
  const periodLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-teal-700" />
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wide">
                Kiralık Kamyon Puantajı
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-600">Dönem:</span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  if (!confirmPeriodChange()) return;
                  setSelectedMonth(Number(e.target.value));
                  setDirty(false);
                }}
                className="text-xs font-semibold border border-slate-200 rounded-lg p-1.5 bg-slate-50 cursor-pointer"
              >
                {AYLAR.map((m) => (
                  <option key={m.k} value={m.k}>
                    {m.v}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => {
                  if (!confirmPeriodChange()) return;
                  setSelectedYear(Number(e.target.value));
                  setDirty(false);
                }}
                className="text-xs font-semibold border border-slate-200 rounded-lg p-1.5 bg-slate-50 cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 capitalize">
                {periodLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-l pl-3 border-slate-200">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Toplu:</span>
              <button
                type="button"
                onClick={handleBulkGeldi}
                className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2 py-1 font-bold"
              >
                ✓ İş günleri Geldi
              </button>
              <button
                type="button"
                onClick={handleBulkReset}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg px-2 py-1 font-bold"
              >
                Sıfırla
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!dirty}
              onClick={() => {
                if (dirty && !window.confirm('Kaydedilmemiş değişiklikler iptal edilsin mi?')) return;
                hydrate();
              }}
              className="inline-flex items-center gap-1 text-[11px] bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 border border-rose-200 rounded-lg px-2.5 py-1.5 font-bold"
            >
              <RefreshCw size={12} />
              Taslağı Geri Al
            </button>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void handleSaveMonth()}
              className="inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg"
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Kaydediliyor…' : dirty ? 'Ayı Kaydet' : 'Kaydedildi'}
            </button>
            <button
              type="button"
              disabled={reporting}
              onClick={() => void handleAyiRaporla()}
              title="Seçili ayın Kibritçi antetli puantaj evrakını açar"
              className="inline-flex items-center gap-1.5 bg-[#1e4e78] hover:bg-[#163a5c] disabled:opacity-60 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg"
            >
              {reporting ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={12} />}
              Ayı Raporla
            </button>
            <button
              type="button"
              disabled={exportingExcel}
              onClick={() => void handleAyiExcel()}
              title="Seçili ayın Kibritçi antetli Excel puantajını indirir"
              className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg"
            >
              {exportingExcel ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={12} />
              )}
              Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px] font-bold items-center">
          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
            Kiralık kamyon: {kamyonlar.length}
          </span>
          {soforsuzKamyonSayisi > 0 && (
            <span
              className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg"
              title="Şoförsüz araçlar puantaj listesinde gösterilmez"
            >
              Şoförsüz (gizli): {soforsuzKamyonSayisi}
            </span>
          )}
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-lg">
            Geldi: {monthStats.geldi}
          </span>
          <span className="bg-rose-50 text-rose-800 border border-rose-100 px-2.5 py-1 rounded-lg">
            Yok: {monthStats.yok}
          </span>
          <span className="bg-sky-50 text-sky-800 border border-sky-100 px-2.5 py-1 rounded-lg">
            Mesai: {monthStats.mesai.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa
          </span>
          {dirty && (
            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg animate-pulse">
              Kaydedilmemiş değişiklik var
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[9px] text-slate-500 font-semibold">
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded font-bold flex items-center justify-center">
              G
            </span>
            Geldi
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 bg-rose-50 text-rose-800 border border-rose-300 rounded font-bold flex items-center justify-center">
              Y
            </span>
            Yok
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 bg-slate-50 text-slate-400 border border-slate-200 rounded font-bold flex items-center justify-center">
              -
            </span>
            Girilmedi (tıkla: G → Y → -)
          </span>
          <span className="text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
            Şoför araç kaydından gelir · hücre altına mesai saati yazın
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-xl shadow-sm">
        {kamyonlar.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Truck className="mx-auto text-amber-700" size={28} />
            <p className="text-xs font-bold text-amber-900">
              {soforsuzKamyonSayisi > 0
                ? 'Şoförü tanımlı kiralık kamyon yok'
                : 'Kiralık kamyon tanımlı değil'}
            </p>
            <p className="text-[10px] text-amber-800 max-w-md mx-auto">
              {soforsuzKamyonSayisi > 0
                ? `${soforsuzKamyonSayisi} araç şoförsüz olduğu için listede görünmüyor. Araç Envanteri’nden sorumlu şoför seçin; şoförün işe giriş tarihinden itibaren günler açılır.`
                : 'Araç Envanteri’nde mülkiyet Kiralık, sorumlu şoför seçin ve kiralık kamyon puantajına dahil edin.'}
            </p>
          </div>
        ) : (
          <div className="inline-block min-w-full align-middle p-2">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="sticky top-0 z-30 bg-slate-50 font-display text-[10px] font-bold text-slate-600 tracking-wider">
                <tr>
                  <th
                    scope="col"
                    className="px-3 py-3 text-left w-52 sticky top-0 left-0 bg-slate-50 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r"
                  >
                    <div>Plaka / Şoför</div>
                    <div className="text-[8px] font-normal text-slate-400 normal-case tracking-normal mt-0.5">
                      Şoför araç kaydından etiketlenir
                    </div>
                  </th>
                  {daysArray.map((day) => {
                    const dayName = dayOfWeekAbbreviation(day);
                    const { isHoliday, name, isOfficial } = isSundayOrHoliday(day);
                    let thClass =
                      'px-1 py-1.5 text-center w-9 min-w-9 transition-colors sticky top-0 bg-slate-50 z-30';
                    if (isHoliday) {
                      thClass += isOfficial
                        ? ' bg-purple-100/80 text-purple-900 border-x border-purple-200'
                        : ' bg-orange-100/80 text-orange-900 border-x border-orange-200';
                    }
                    return (
                      <th key={day} scope="col" className={thClass} title={name}>
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-[10px]">
                            {day.toString().padStart(2, '0')}
                          </span>
                          <span className="text-[8px] font-bold opacity-80 uppercase tracking-wide">
                            {dayName}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="px-2 py-3 text-center w-14 min-w-14 border-l font-bold text-emerald-700 bg-slate-50"
                  >
                    Gelen
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-3 text-center w-16 min-w-16 font-bold text-slate-800 bg-slate-50"
                  >
                    Top. Mesai
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 text-[11px]">
                {kamyonlar.map((arac) => {
                  const soforAdi = soforLabel(personeller, arac.sorumluPersonelId);
                  const sofor = resolveAracSofor(personeller, arac);
                  let totalGeldi = 0;
                  let totalMesai = 0;

                  const cells = daysArray.map((day) => {
                    const dayActive = isSoforDayActive(arac, day);
                    const cell = dayActive ? getCell(arac.id, day) : emptyCell();
                    if (dayActive && cell.durum === 'Geldi') {
                      totalGeldi += 1;
                      totalMesai += cell.mesaiSaati || 0;
                    }
                    const { isHoliday, isOfficial } = isSundayOrHoliday(day);
                    let tdClass = 'px-0.5 py-1.5 text-center min-w-9';
                    if (!dayActive) {
                      tdClass += ' bg-slate-100/80';
                    } else if (isHoliday) {
                      tdClass += isOfficial
                        ? ' bg-purple-100/50 border-x border-purple-200'
                        : ' bg-orange-100/50 border-x border-orange-200';
                    }

                    if (!dayActive) {
                      const hireHint = sofor?.iseGirisTarihi
                        ? `Şoför işe giriş: ${sofor.iseGirisTarihi} — bu günden önce yoklama yok`
                        : 'Şoför istihdam aralığı dışında';
                      return (
                        <td key={day} className={tdClass} title={hireHint}>
                          <div className="w-7 h-7 mx-auto rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-300 text-[9px] font-bold flex items-center justify-center select-none">
                            ·
                          </div>
                          <div className="mt-1 h-[18px]" />
                        </td>
                      );
                    }

                    return (
                      <td key={day} className={tdClass}>
                        <button
                          type="button"
                          onClick={() => handleCellClick(arac, day)}
                          title={`${arac.plaka} · ${day}.${selectedMonth}.${selectedYear} · ${cell.durum}${
                            soforAdi ? ` · ${soforAdi}` : ''
                          }`}
                          className={`w-7 h-7 mx-auto rounded-md border font-bold text-[9px] flex items-center justify-center transition shadow-sm hover:scale-105 active:scale-95 cursor-pointer ${statusColor(
                            cell.durum
                          )}`}
                        >
                          {statusAbbr(cell.durum)}
                        </button>
                        <div className="mt-1 flex items-center justify-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            maxLength={5}
                            placeholder="-"
                            title="Mesai saati (0–14)"
                            value={mesaiInputDisplayValue(
                              cell.durum === 'Geldi' || cell.mesaiSaati > 0
                                ? cell.mesaiSaati
                                : undefined
                            )}
                            onChange={(e) => {
                              const parsed = parseMesaiInputValue(e.target.value);
                              handleMesaiChange(arac, day, parsed ?? 0);
                            }}
                            className={`w-7 text-[8px] font-bold font-mono text-center rounded border py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400 ${
                              isHoliday
                                ? isOfficial
                                  ? 'bg-purple-50 border-purple-200 text-purple-700'
                                  : 'bg-orange-50 border-orange-200 text-orange-700'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          />
                        </div>
                      </td>
                    );
                  });

                  return (
                    <tr key={arac.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 border-r shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <div className="font-mono font-black text-slate-900 text-xs">{arac.plaka}</div>
                        <div className="text-[9px] text-slate-500 truncate max-w-[190px]">
                          {arac.markaModel || 'Kamyon'}
                        </div>
                        <span className="inline-block mt-0.5 text-[7px] font-black uppercase bg-teal-100 text-teal-800 px-1 py-0.5 rounded">
                          Kiralık kamyon
                        </span>
                        <div
                          className="mt-1.5 text-[10px] font-bold text-slate-800 bg-sky-50 border border-sky-100 rounded-md px-1.5 py-1 truncate max-w-[190px]"
                          title={`Araç kaydındaki sorumlu: ${soforAdi}${
                            sofor?.iseGirisTarihi ? ` · işe giriş ${sofor.iseGirisTarihi}` : ''
                          }`}
                        >
                          👤 {soforAdi}
                          {sofor?.iseGirisTarihi ? (
                            <span className="block text-[8px] font-semibold text-slate-500 mt-0.5">
                              İşe giriş: {sofor.iseGirisTarihi}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {cells}
                      <td className="px-2 py-2 text-center font-black text-emerald-700 border-l bg-emerald-50/30">
                        {totalGeldi}
                      </td>
                      <td className="px-2 py-2 text-center font-black text-slate-800 font-mono">
                        {totalMesai.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="shrink-0 text-[9px] text-slate-400 font-medium flex items-center gap-1.5 px-1">
        <CheckCircle size={11} className="text-teal-600" />
        Hücreye tıklayarak gün girin · altına mesai yazın · yalnızca şoförü olan araçlar listelenir ·
        şoförün işe girişinden önceki günler kapalı ·{' '}
        <strong className="text-slate-600">Ayı Kaydet</strong> /{' '}
        <strong className="text-slate-600">Ayı Raporla</strong> /{' '}
        <strong className="text-slate-600">Excel</strong>
      </div>
    </div>
  );
};
