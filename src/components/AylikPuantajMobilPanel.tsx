import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { Personel, AylikYoklamaMap, YoklamaDurum } from '../types/erp';
import {
  buildPersonelListForMonth,
  getYoklamaDay,
  isDayActiveForPersonel,
  setYoklamaDay,
} from '../lib/yoklamaUtils';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { downloadCsv } from '../lib/reportExport';
import { todayDateKey } from '../lib/dateKeyUtils';

const STATUS_OPTIONS: YoklamaDurum[] = [
  'Geldi',
  'Yok',
  'İzinli',
  'Raporlu',
  'Pazar',
  'Tatil',
  'Girilmedi',
];

export type AylikPuantajMobilPanelProps = {
  personeller: Personel[];
  /** Personel listesine uygulanacak filtre (ör. yalnızca KAMPÇI) */
  filterPersonel: (p: Personel) => boolean;
  yoklamalar: AylikYoklamaMap;
  setYoklamalar?: (
    updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)
  ) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  currentUser?: { email?: string; displayName?: string } | null;
  /** Firestore gonderen alanı */
  gonderenFallback?: string;
  title?: string;
  /** Başarı/hata bildirimi (yoksa alert) */
  onStatus?: (type: 'success' | 'error', text: string) => void;
};

/**
 * Mobil aylık yoklama / mesai paneli.
 * Aynı AylikYoklamaMap + YYYY-MM-DD anahtarlarını kullanır → puantaj / maaş ile uyumlu.
 * Kaydetme: yalnızca değişen hücreler (sparse) — diğer kayıtlar silinmez.
 */
export const AylikPuantajMobilPanel: React.FC<AylikPuantajMobilPanelProps> = ({
  personeller,
  filterPersonel,
  yoklamalar,
  setYoklamalar,
  saveYoklamalarNow,
  currentUser,
  gonderenFallback = 'mobil',
  title = 'AYLIK PUANTAJ / MESAİ',
  onStatus,
}) => {
  const today = todayDateKey();
  const [selectedMonth, setSelectedMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const year = Number(selectedMonth.slice(0, 4));
  const month = Number(selectedMonth.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDay = today.startsWith(selectedMonth) ? Number(today.slice(8, 10)) : 1;

  const [aylikDraft, setAylikDraft] = useState<AylikYoklamaMap>({});
  const [aylikDirty, setAylikDirty] = useState(false);
  const [aylikDirtyKeys, setAylikDirtyKeys] = useState<string[]>([]);
  const [aylikSaving, setAylikSaving] = useState(false);
  const [aylikFocusDay, setAylikFocusDay] = useState(todayDay);
  const [aylikPersonSearch, setAylikPersonSearch] = useState('');
  const [aylikShowGrid, setAylikShowGrid] = useState(false);
  const [aylikMesaiEdit, setAylikMesaiEdit] = useState<{ personelId: string; day: number } | null>(null);
  const [aylikMesaiInput, setAylikMesaiInput] = useState('');

  const gonderen = currentUser?.email || gonderenFallback;

  const notify = (type: 'success' | 'error', text: string) => {
    if (onStatus) onStatus(type, text);
    else if (type === 'error') window.alert(text);
  };

  const monthPersonelList = useMemo(() => {
    return buildPersonelListForMonth(personeller, yoklamalar, year, month).filter(filterPersonel);
  }, [personeller, yoklamalar, year, month, filterPersonel]);

  useEffect(() => {
    if (aylikDirty) return;
    setAylikDraft(yoklamalar);
    setAylikDirtyKeys([]);
  }, [yoklamalar, year, month, aylikDirty]);

  useEffect(() => {
    setAylikFocusDay((d) => Math.min(Math.max(1, d), daysInMonth));
  }, [daysInMonth]);

  useEffect(() => {
    if (!aylikDirty) setAylikFocusDay(todayDay);
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const markDirtyCell = (personelId: string, d: number) => {
    const key = `${personelId}|${d}`;
    setAylikDirtyKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setAylikDirty(true);
  };

  const setDayStatus = (personelId: string, d: number, status: YoklamaDurum) => {
    const p = monthPersonelList.find((x) => x.id === personelId);
    if (!p) return;
    const personMap = aylikDraft[personelId];
    if (!isDayActiveForPersonel(p, year, month, d, personMap as any)) return;

    const dayData =
      getYoklamaDay(personMap, year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });

    setAylikDraft((prev) => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], year, month, d, {
        ...dayData,
        durum: status,
        mesaiSaati:
          status === 'Yok' || status === 'Girilmedi'
            ? 0
            : status === 'Geldi'
              ? dayData.mesaiSaati
              : dayData.mesaiSaati,
        gonderen,
      }),
    }));
    markDirtyCell(personelId, d);
  };

  const setDayMesai = (personelId: string, d: number, hoursRaw: number) => {
    const hours = Math.max(0, Math.min(24, Math.round(Number(hoursRaw) * 2) / 2));
    const dayData =
      getYoklamaDay(aylikDraft[personelId], year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
    const nextDurum =
      hours > 0 && (dayData.durum === 'Girilmedi' || dayData.durum === 'Yok')
        ? ('Geldi' as YoklamaDurum)
        : dayData.durum;

    setAylikDraft((prev) => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], year, month, d, {
        ...dayData,
        durum: nextDurum,
        mesaiSaati: hours,
        gonderen,
      }),
    }));
    markDirtyCell(personelId, d);
  };

  const cycleCell = (personelId: string, d: number) => {
    const dayData =
      getYoklamaDay(aylikDraft[personelId], year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
    const idx = STATUS_OPTIONS.indexOf(dayData.durum as YoklamaDurum);
    const nextStatus = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    setDayStatus(personelId, d, nextStatus);
  };

  const resetDraft = () => {
    setAylikDraft(yoklamalar);
    setAylikDirty(false);
    setAylikDirtyKeys([]);
    setAylikMesaiEdit(null);
  };

  const shiftMonth = (delta: number) => {
    if (aylikDirty && !window.confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return;
    const d = new Date(year, month - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setAylikDirty(false);
    setAylikDirtyKeys([]);
  };

  const handleSave = async () => {
    if (aylikSaving) return;
    if (aylikDirtyKeys.length === 0) {
      notify('error', 'Kaydedilecek değişiklik yok.');
      return;
    }
    if (!saveYoklamalarNow && !setYoklamalar) {
      notify('error', 'Yoklama kaydetme bağlantısı yok.');
      return;
    }

    setAylikSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) {
        notify('error', authBlock);
        return;
      }

      const sparse: AylikYoklamaMap = {};
      for (const key of aylikDirtyKeys) {
        const [personelId, dayStr] = key.split('|');
        const d = Number(dayStr);
        if (!personelId || !d) continue;
        // Güvenlik: yalnızca filtreye uyan personel yazılsın
        const p = monthPersonelList.find((x) => x.id === personelId);
        if (!p) continue;
        const dayData = getYoklamaDay(aylikDraft[personelId], year, month, d);
        if (!dayData) continue;
        sparse[personelId] = setYoklamaDay(sparse[personelId], year, month, d, {
          ...dayData,
          gonderen,
        });
      }

      if (Object.keys(sparse).length === 0) {
        notify('error', 'Kaydedilecek hücre bulunamadı.');
        return;
      }

      const changedCount = aylikDirtyKeys.length;
      if (saveYoklamalarNow) {
        await saveYoklamalarNow(sparse);
      } else if (setYoklamalar) {
        setYoklamalar((prev) => {
          const merged = { ...prev };
          for (const [pid, days] of Object.entries(sparse)) {
            merged[pid] = { ...(merged[pid] || {}), ...(days as object) } as any;
          }
          return merged;
        });
      }

      setAylikDirty(false);
      setAylikDirtyKeys([]);
      notify(
        'success',
        `${String(month).padStart(2, '0')}/${year} · ${changedCount} gün hücresi kaydedildi.`
      );
    } catch (err: unknown) {
      notify('error', formatFirestoreWriteError(err, 'Aylık puantaj kaydedilemedi'));
    } finally {
      setAylikSaving(false);
    }
  };

  const handleExportCsv = () => {
    const sourceMap = aylikDirty ? aylikDraft : yoklamalar;
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const rows: string[][] = [
      ['Personel', 'Gorev', ...days.map((d) => String(d)), 'Gelen Gun', 'Toplam Mesai (saat)'],
    ];

    monthPersonelList.forEach((p) => {
      const map = sourceMap[p.id] as any;
      let geldi = 0;
      let toplamMesai = 0;
      const dayCells = days.map((d) => {
        if (!isDayActiveForPersonel(p, year, month, d, map)) return 'C';
        const dayData = getYoklamaDay(map, year, month, d);
        const durum = dayData?.durum || 'Girilmedi';
        const mesai = Number(dayData?.mesaiSaati || 0);
        if (durum === 'Geldi') geldi += 1;
        toplamMesai += mesai;
        return mesai > 0 ? `${durum} (+${mesai})` : durum;
      });
      rows.push([`${p.ad} ${p.soyad}`, p.gorev || '-', ...dayCells, String(geldi), toplamMesai.toFixed(2)]);
    });

    downloadCsv(rows, `Aylik_Puantaj_${selectedMonth}.csv`);
    notify('success', 'Aylık puantaj CSV indirildi.');
  };

  const dayStaff = monthPersonelList.filter((p) => {
    if (!isDayActiveForPersonel(p, year, month, aylikFocusDay, aylikDraft[p.id] as any)) return false;
    const q = aylikPersonSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    return (
      `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR').includes(q) ||
      String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  });

  return (
    <div className="space-y-3.5 animate-in fade-in duration-150 max-w-[480px] mx-auto pb-8">
      <div className="bg-white rounded-3xl border p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2">
            <FileText size={14} className="text-amber-500" />
            <span className="font-bold text-[10px] uppercase tracking-wider text-slate-900">{title}</span>
          </div>
          <span className="text-[9px] font-mono font-bold text-slate-500">
            {String(month).padStart(2, '0')}/{year}
          </span>
        </div>
        <p className="text-[9px] text-slate-500 leading-snug">
          Günü seçin → durum / mesai girin → Kaydet. Yalnızca değişen hücreler yazılır; diğer yoklama ve maaş kayıtları korunur.
          {aylikDirty ? (
            <span className="block mt-1 text-amber-700 font-bold">
              Kaydedilmemiş: {aylikDirtyKeys.length} hücre
            </span>
          ) : null}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-2 rounded-xl cursor-pointer"
          >
            ← Önceki Ay
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-2 rounded-xl cursor-pointer"
          >
            Sonraki Ay →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={aylikSaving || !aylikDirty}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
          >
            {aylikSaving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button
            type="button"
            onClick={resetDraft}
            disabled={!aylikDirty}
            className="w-full bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
          >
            CSV İndir
          </button>
          <button
            type="button"
            onClick={() => setAylikShowGrid((v) => !v)}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
          >
            {aylikShowGrid ? 'Gün Listesi' : 'Tablo Görünümü'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Gün seç</span>
          <button
            type="button"
            onClick={() => setAylikFocusDay(todayDay)}
            className="text-[9px] font-bold text-amber-700 cursor-pointer"
          >
            Bugüne git ({todayDay})
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setAylikFocusDay(d)}
              className={`shrink-0 w-9 h-9 rounded-xl text-[11px] font-black cursor-pointer border transition ${
                aylikFocusDay === d
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={aylikPersonSearch}
            onChange={(e) => setAylikPersonSearch(e.target.value)}
            placeholder="Personel ara…"
            className="w-full bg-slate-50 border border-slate-200 py-1.5 pl-8 pr-3 rounded-xl text-[10px] font-semibold outline-none"
          />
        </div>
      </div>

      {!aylikShowGrid && (
        <div className="bg-white rounded-3xl border p-3 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-black uppercase text-slate-800">
              {aylikFocusDay}.{String(month).padStart(2, '0')}.{year}
            </span>
            <span className="text-[9px] text-slate-500 font-semibold">{dayStaff.length} personel</span>
          </div>
          {dayStaff.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic text-center py-6">Bu gün için personel yok.</p>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-2">
              {dayStaff.map((p) => {
                const data =
                  getYoklamaDay(aylikDraft[p.id], year, month, aylikFocusDay) ||
                  ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
                const mesai = Number(data.mesaiSaati || 0);
                return (
                  <div key={p.id} className="rounded-2xl border border-slate-150 bg-slate-50/60 p-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-900 truncate">
                          {p.ad} {p.soyad}
                        </div>
                        <div className="text-[8px] text-slate-500 truncate">{p.gorev || '-'}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-lg px-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => setDayMesai(p.id, aylikFocusDay, mesai - 0.5)}
                          className="w-6 h-6 rounded-md bg-slate-100 text-slate-800 font-black text-xs cursor-pointer"
                        >
                          −
                        </button>
                        <span className="text-[10px] font-black min-w-[28px] text-center text-amber-800">{mesai}</span>
                        <button
                          type="button"
                          onClick={() => setDayMesai(p.id, aylikFocusDay, mesai + 0.5)}
                          className="w-6 h-6 rounded-md bg-slate-100 text-slate-800 font-black text-xs cursor-pointer"
                        >
                          +
                        </button>
                        <span className="text-[8px] font-bold text-slate-400 pl-0.5">saat</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map((st) => {
                        const short =
                          st === 'Geldi' ? 'G' :
                          st === 'Yok' ? 'Y' :
                          st === 'İzinli' ? 'İ' :
                          st === 'Raporlu' ? 'R' :
                          st === 'Pazar' ? 'P' :
                          st === 'Tatil' ? 'T' : '−';
                        const active = data.durum === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            title={st}
                            onClick={() => setDayStatus(p.id, aylikFocusDay, st)}
                            className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                              active
                                ? st === 'Geldi'
                                  ? 'bg-emerald-600 text-white border-emerald-700'
                                  : st === 'Yok'
                                    ? 'bg-rose-600 text-white border-rose-700'
                                    : st === 'Girilmedi'
                                      ? 'bg-slate-700 text-white border-slate-800'
                                      : 'bg-amber-500 text-slate-950 border-amber-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {aylikShowGrid && (
        <div className="bg-white rounded-3xl border p-3 shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 border-b">
                <th className="p-2 text-[9px] font-black uppercase sticky left-0 bg-slate-100 z-10">Personel</th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <th key={d} className="p-2 text-center text-[9px] font-black">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthPersonelList.map((p) => {
                const personMap = aylikDraft[p.id] as any;
                return (
                  <tr key={p.id} className="border-b">
                    <td className="p-2 sticky left-0 bg-white z-10">
                      <div className="text-[10px] font-bold">{p.ad} {p.soyad}</div>
                      <div className="text-[8px] text-slate-500">{p.gorev || '-'}</div>
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      if (!isDayActiveForPersonel(p, year, month, d, personMap)) {
                        return (
                          <td key={d} className="p-1 text-center text-[9px] text-violet-400 font-bold">
                            Ç
                          </td>
                        );
                      }
                      const data = getYoklamaDay(personMap, year, month, d);
                      const durum = data?.durum || 'Girilmedi';
                      const mesai = Number(data?.mesaiSaati || 0);
                      const letter =
                        durum === 'Geldi' ? 'G' :
                        durum === 'Yok' ? 'Y' :
                        durum === 'İzinli' ? 'İ' :
                        durum === 'Raporlu' ? 'R' :
                        durum === 'Pazar' ? 'P' :
                        durum === 'Tatil' ? 'T' : '-';
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => cycleCell(p.id, d)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setAylikMesaiEdit({ personelId: p.id, day: d });
                              setAylikMesaiInput(String(mesai || ''));
                            }}
                            className={`w-full min-w-[28px] rounded-md border px-0.5 py-1 cursor-pointer ${
                              durum === 'Geldi'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : durum === 'Yok'
                                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                                  : durum === 'Girilmedi'
                                    ? 'bg-white border-slate-200 text-slate-500'
                                    : 'bg-amber-50 border-amber-200 text-amber-900'
                            }`}
                          >
                            <span className="text-[9px] font-bold block">{letter}</span>
                            <span className="text-[7px] font-mono text-amber-700">
                              {mesai > 0 ? `+${mesai}` : '·'}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aylikMesaiEdit && (
        <div className="fixed inset-0 z-[80] bg-slate-950/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3 shadow-xl">
            <h4 className="text-xs font-black uppercase text-slate-900">Mesai saati</h4>
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={aylikMesaiInput}
              onChange={(e) => setAylikMesaiInput(e.target.value)}
              className="w-full text-sm font-bold p-2.5 border border-slate-200 rounded-xl bg-slate-50"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAylikMesaiEdit(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 text-[10px] font-black cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => {
                  const raw = Number(String(aylikMesaiInput).replace(',', '.'));
                  const hours = Number.isFinite(raw) ? raw : 0;
                  setDayMesai(aylikMesaiEdit.personelId, aylikMesaiEdit.day, hours);
                  setAylikMesaiEdit(null);
                }}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 text-[10px] font-black cursor-pointer"
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
