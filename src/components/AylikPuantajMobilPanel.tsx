import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Search, Save } from 'lucide-react';
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

const DIGER_STATUS: YoklamaDurum[] = ['İzinli', 'Raporlu', 'Pazar', 'Tatil', 'Girilmedi'];

export type AylikPuantajMobilPanelProps = {
  personeller: Personel[];
  filterPersonel: (p: Personel) => boolean;
  yoklamalar: AylikYoklamaMap;
  setYoklamalar?: (
    updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)
  ) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  currentUser?: { email?: string; displayName?: string } | null;
  gonderenFallback?: string;
  title?: string;
  /** localStorage anahtarı — son kayıt zamanı kalıcı */
  storageKey?: string;
  onStatus?: (type: 'success' | 'error', text: string) => void;
};

/**
 * Formen / Kampçı ortak aylık yoklama-mesai paneli.
 * Güvenli kayıt: yalnızca değişen gün hücreleri sparse yazılır (merge + mass-write koruması).
 * Kaydet / güncelle aynı akış — mevcut kayıt üzerine yazar, diğer günleri silmez.
 */
export const AylikPuantajMobilPanel: React.FC<AylikPuantajMobilPanelProps> = ({
  personeller,
  filterPersonel,
  yoklamalar,
  setYoklamalar,
  saveYoklamalarNow,
  currentUser,
  gonderenFallback = 'mobil',
  title = 'AYLIK YOKLAMA / MESAİ',
  storageKey,
  onStatus,
}) => {
  const today = todayDateKey();
  const persistKey = storageKey || `aylik_puantaj_last_${gonderenFallback}`;

  const [selectedMonth, setSelectedMonth] = useState(() => today.slice(0, 7));
  const year = Number(selectedMonth.slice(0, 4));
  const month = Number(selectedMonth.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDay = today.startsWith(selectedMonth) ? Number(today.slice(8, 10)) : 1;

  const [aylikDraft, setAylikDraft] = useState<AylikYoklamaMap>({});
  const [aylikDirtyKeys, setAylikDirtyKeys] = useState<string[]>([]);
  const [aylikSaving, setAylikSaving] = useState(false);
  const [aylikFocusDay, setAylikFocusDay] = useState(todayDay);
  const [search, setSearch] = useState('');
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(persistKey);
    } catch {
      return null;
    }
  });
  const [digerOpenId, setDigerOpenId] = useState<string | null>(null);

  const aylikDirty = aylikDirtyKeys.length > 0;
  const gonderen = currentUser?.email || gonderenFallback;

  const notify = useCallback(
    (type: 'success' | 'error', text: string) => {
      if (onStatus) onStatus(type, text);
      else if (type === 'error') window.alert(text);
    },
    [onStatus]
  );

  const monthPersonelList = useMemo(
    () => buildPersonelListForMonth(personeller, yoklamalar, year, month).filter(filterPersonel),
    [personeller, yoklamalar, year, month, filterPersonel]
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const markDirty = (personelId: string, d: number) => {
    const key = `${personelId}|${d}`;
    setAylikDirtyKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const patchDay = (
    personelId: string,
    d: number,
    patch: Partial<{ durum: YoklamaDurum; mesaiSaati: number }>
  ) => {
    const p = monthPersonelList.find((x) => x.id === personelId);
    if (!p) return;
    if (!isDayActiveForPersonel(p, year, month, d, aylikDraft[personelId] as any)) return;

    const dayData =
      getYoklamaDay(aylikDraft[personelId], year, month, d) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });

    let durum = patch.durum ?? dayData.durum;
    let mesaiSaati = patch.mesaiSaati ?? dayData.mesaiSaati;

    if (patch.mesaiSaati !== undefined) {
      mesaiSaati = Math.max(0, Math.min(24, Math.round(Number(patch.mesaiSaati) * 2) / 2));
      if (mesaiSaati > 0 && (durum === 'Girilmedi' || durum === 'Yok')) durum = 'Geldi';
    }
    if (patch.durum === 'Yok' || patch.durum === 'Girilmedi') {
      mesaiSaati = 0;
    }

    setAylikDraft((prev) => ({
      ...prev,
      [personelId]: setYoklamaDay(prev[personelId], year, month, d, {
        ...dayData,
        durum,
        mesaiSaati,
        gonderen,
      }),
    }));
    markDirty(personelId, d);
  };

  const resetDraft = () => {
    setAylikDraft(yoklamalar);
    setAylikDirtyKeys([]);
    setDigerOpenId(null);
  };

  const shiftMonth = (delta: number) => {
    if (aylikDirty && !window.confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return;
    const d = new Date(year, month - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setAylikDirtyKeys([]);
    setDigerOpenId(null);
  };

  const handleSave = async () => {
    if (aylikSaving) return;
    if (!aylikDirty) {
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
        if (!monthPersonelList.some((x) => x.id === personelId)) continue;
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

      const stamp = new Date().toLocaleString('tr-TR');
      setLastSaveAt(stamp);
      try {
        localStorage.setItem(persistKey, stamp);
      } catch {
        /* ignore */
      }

      setAylikDirtyKeys([]);
      setDigerOpenId(null);
      notify('success', `${changedCount} gün kaydı güvenli şekilde kaydedildi / güncellendi.`);
    } catch (err: unknown) {
      notify('error', formatFirestoreWriteError(err, 'Aylık yoklama kaydedilemedi'));
    } finally {
      setAylikSaving(false);
    }
  };

  const handleExportCsv = () => {
    const sourceMap = aylikDirty ? aylikDraft : yoklamalar;
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const rows: string[][] = [
      ['Personel', 'Gorev', ...days.map(String), 'Gelen Gun', 'Toplam Mesai'],
    ];
    monthPersonelList.forEach((p) => {
      const map = sourceMap[p.id] as any;
      let geldi = 0;
      let toplamMesai = 0;
      const cells = days.map((d) => {
        if (!isDayActiveForPersonel(p, year, month, d, map)) return 'C';
        const dayData = getYoklamaDay(map, year, month, d);
        const durum = dayData?.durum || 'Girilmedi';
        const mesai = Number(dayData?.mesaiSaati || 0);
        if (durum === 'Geldi') geldi += 1;
        toplamMesai += mesai;
        return mesai > 0 ? `${durum}(+${mesai})` : durum;
      });
      rows.push([`${p.ad} ${p.soyad}`, p.gorev || '-', ...cells, String(geldi), toplamMesai.toFixed(1)]);
    });
    downloadCsv(rows, `Aylik_Puantaj_${selectedMonth}.csv`);
    notify('success', 'CSV indirildi.');
  };

  const dayStaff = monthPersonelList.filter((p) => {
    if (!isDayActiveForPersonel(p, year, month, aylikFocusDay, aylikDraft[p.id] as any)) return false;
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    return (
      `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR').includes(q) ||
      String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  });

  return (
    <div className="flex flex-col max-w-[480px] mx-auto min-h-[60vh] pb-24 animate-in fade-in duration-150">
      {/* Üst özet */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2.5 shadow-sm mb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar size={14} className="text-amber-500 shrink-0" />
            <span className="font-black text-[10px] uppercase tracking-wider text-slate-900 truncate">
              {title}
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-600 shrink-0">
            {String(month).padStart(2, '0')}/{year}
          </span>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Son kayıt</p>
            <p className="text-[11px] font-bold text-slate-800 truncate">
              {lastSaveAt || 'Henüz bu cihazdan kayıt yok'}
            </p>
          </div>
          {aylikDirty ? (
            <span className="shrink-0 text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg">
              {aylikDirtyKeys.length} değişiklik
            </span>
          ) : (
            <span className="shrink-0 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
              Güncel
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] py-2 rounded-xl cursor-pointer"
          >
            ← Ay
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] py-2 rounded-xl cursor-pointer"
          >
            Ay →
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 bg-white border border-slate-200 text-slate-600 font-bold text-[10px] py-2 rounded-xl cursor-pointer"
          >
            CSV
          </button>
        </div>

        <p className="text-[9px] text-slate-500 leading-snug">
          1) Günü seç · 2) Geldi / Yok / mesai · 3) Kaydet. Sadece değişenler yazılır; diğer günler silinmez.
        </p>
      </div>

      {/* Gün seçici */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2 shadow-sm mb-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase text-slate-500">Gün</span>
          <button
            type="button"
            onClick={() => setAylikFocusDay(todayDay)}
            className="text-[9px] font-bold text-amber-700 cursor-pointer"
          >
            Bugün ({todayDay})
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setAylikFocusDay(d);
                setDigerOpenId(null);
              }}
              className={`shrink-0 w-8 h-8 rounded-lg text-[11px] font-black cursor-pointer border ${
                aylikFocusDay === d
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Personel ara…"
            className="w-full bg-slate-50 border border-slate-200 py-1.5 pl-8 pr-3 rounded-xl text-[10px] font-semibold outline-none"
          />
        </div>
        <p className="text-[10px] font-bold text-slate-700">
          {aylikFocusDay}.{String(month).padStart(2, '0')}.{year} · {dayStaff.length} kişi
        </p>
      </div>

      {/* Personel listesi — sade */}
      <div className="space-y-2 flex-1">
        {dayStaff.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[10px] text-slate-400 italic">
            Bu gün için personel yok.
          </div>
        ) : (
          dayStaff.map((p) => {
            const data =
              getYoklamaDay(aylikDraft[p.id], year, month, aylikFocusDay) ||
              ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
            const mesai = Number(data.mesaiSaati || 0);
            const isGeldi = data.durum === 'Geldi';
            const isYok = data.durum === 'Yok';
            const isDiger = !isGeldi && !isYok && data.durum !== 'Girilmedi';

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-slate-900 truncate">
                      {p.ad} {p.soyad}
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">{p.gorev || '-'}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => patchDay(p.id, aylikFocusDay, { mesaiSaati: mesai - 0.5 })}
                      className="w-7 h-7 rounded-md bg-white border border-slate-200 font-black text-sm cursor-pointer"
                      aria-label="Mesai azalt"
                    >
                      −
                    </button>
                    <span className="text-[11px] font-black min-w-[36px] text-center text-amber-800">
                      {mesai}
                      <span className="block text-[7px] font-bold text-slate-400">saat</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => patchDay(p.id, aylikFocusDay, { mesaiSaati: mesai + 0.5 })}
                      className="w-7 h-7 rounded-md bg-white border border-slate-200 font-black text-sm cursor-pointer"
                      aria-label="Mesai artır"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => patchDay(p.id, aylikFocusDay, { durum: 'Geldi' })}
                    className={`py-2 rounded-xl text-[11px] font-black border cursor-pointer ${
                      isGeldi
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    Geldi
                  </button>
                  <button
                    type="button"
                    onClick={() => patchDay(p.id, aylikFocusDay, { durum: 'Yok' })}
                    className={`py-2 rounded-xl text-[11px] font-black border cursor-pointer ${
                      isYok
                        ? 'bg-rose-600 text-white border-rose-700'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    Yok
                  </button>
                  <button
                    type="button"
                    onClick={() => setDigerOpenId((id) => (id === p.id ? null : p.id))}
                    className={`py-2 rounded-xl text-[11px] font-black border cursor-pointer ${
                      isDiger || digerOpenId === p.id
                        ? 'bg-amber-500 text-slate-950 border-amber-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {isDiger ? data.durum : 'Diğer'}
                  </button>
                </div>

                {digerOpenId === p.id && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {DIGER_STATUS.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          patchDay(p.id, aylikFocusDay, { durum: st });
                          setDigerOpenId(null);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold border cursor-pointer ${
                          data.durum === st
                            ? 'bg-slate-800 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sabit alt kaydet çubuğu */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div className="max-w-[480px] mx-auto px-3 pb-3 pointer-events-auto">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 p-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Güvenli kayıt</p>
              <p className="text-[10px] font-bold truncate text-slate-200">
                {aylikDirty
                  ? `${aylikDirtyKeys.length} değişiklik bekliyor`
                  : lastSaveAt
                    ? `Son: ${lastSaveAt}`
                    : 'Değişiklik yok'}
              </p>
            </div>
            {aylikDirty && (
              <button
                type="button"
                onClick={resetDraft}
                disabled={aylikSaving}
                className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer disabled:opacity-40"
              >
                Vazgeç
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={aylikSaving || !aylikDirty}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-[11px] font-black cursor-pointer"
            >
              {aylikSaving ? (
                '…'
              ) : (
                <>
                  <Save size={14} />
                  Kaydet
                </>
              )}
            </button>
            {!aylikDirty && lastSaveAt && (
              <span className="shrink-0 text-emerald-400" title="Kayıtlı">
                <Check size={16} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
