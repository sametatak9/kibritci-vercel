import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, CheckCircle, XCircle, Users, FileSignature, RefreshCw, Search
} from 'lucide-react';
import { Personel, AylikYoklamaMap, YoklamaDurum } from '../types/erp';
import { 
  buildPersonelListForMonth, 
  getYoklamaDay, 
  isDayActiveForPersonel, 
  isTaseronPersonel, 
  setYoklamaDay, 
  isKampciYoklamaKapsami,
  isTesisatciGorev,
  isMermerciGorev,
  isSoforGorev,
  isOperatorGorev,
  isSeramikEkibiPersonel,
} from '../lib/yoklamaUtils';
import { todayDateKey, normalizeDateKey, formatDateLabelTr } from '../lib/dateKeyUtils';
import { downloadCsv } from '../lib/reportExport';

interface KampGunlukYoklamaTabProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  setYoklamalar?: (updater: AylikYoklamaMap | ((y: AylikYoklamaMap) => AylikYoklamaMap)) => void;
  saveYoklamalarNow?: (next: AylikYoklamaMap) => Promise<void>;
  currentUser: any;
  addNotification?: (mesaj: string) => void;
  /** Varsayılan: kampçı + şenör. Tesisatçı / mermerci / şöför / operatör kendi mobillerinde */
  personelKapsami?: 'kamp' | 'tesisatci' | 'mermerci' | 'sofor' | 'operator' | 'seramik';
}

export const KampGunlukYoklamaTab: React.FC<KampGunlukYoklamaTabProps> = ({
  personeller,
  yoklamalar,
  setYoklamalar,
  saveYoklamalarNow,
  currentUser,
  addNotification,
  personelKapsami = 'kamp',
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(todayDateKey());
  const [searchQuery, setSearchQuery] = useState('');
  
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  const [mesaiSaatleri, setMesaiSaatleri] = useState<Record<string, number>>({});
  
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [hasLocalAttendanceDraft, setHasLocalAttendanceDraft] = useState(false);
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('kamp_gunluk_yoklama_last');
    } catch {
      return null;
    }
  });

  const { year, month, day } = useMemo(() => {
    const parts = selectedDate.split('-');
    return {
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10),
      day: parseInt(parts[2], 10),
    };
  }, [selectedDate]);

  const monthPersonelList = useMemo(
    () => buildPersonelListForMonth(personeller, yoklamalar, year, month),
    [personeller, yoklamalar, year, month]
  );

  const activeStaff = useMemo(() => {
    return monthPersonelList.filter((p) => {
      if (personelKapsami === 'seramik') {
        if (!isSeramikEkibiPersonel(p)) return false;
        return isDayActiveForPersonel(p, year, month, day, yoklamalar[p.id] as any);
      }
      if (isTaseronPersonel(p)) return false;
      if (personelKapsami === 'tesisatci') {
        if (!isTesisatciGorev(p.gorev)) return false;
      } else if (personelKapsami === 'mermerci') {
        if (!isMermerciGorev(p.gorev)) return false;
      } else if (personelKapsami === 'sofor') {
        if (!isSoforGorev(p.gorev)) return false;
      } else if (personelKapsami === 'operator') {
        if (!isOperatorGorev(p.gorev)) return false;
      } else {
        // Kampçı yoklama: kampçılar + şenör (şöför/operatör kendi ekranlarında)
        if (isSoforGorev(p.gorev) || isOperatorGorev(p.gorev)) return false;
        if (!isKampciYoklamaKapsami(p.gorev)) return false;
      }
      return isDayActiveForPersonel(p, year, month, day, yoklamalar[p.id] as any);
    });
  }, [monthPersonelList, year, month, day, yoklamalar, personelKapsami]);

  // Load existing records when date changes
  useEffect(() => {
    if (hasLocalAttendanceDraft) return;

    const newPresent: string[] = [];
    const newAbsent: string[] = [];
    const newMesai: Record<string, number> = {};

    activeStaff.forEach((p) => {
      const map = yoklamalar[p.id] as any;
      const existing = getYoklamaDay(map, year, month, day);
      if (existing) {
        if (existing.durum === 'Geldi') {
          newPresent.push(p.id);
        } else if (existing.durum === 'Yok' || existing.durum === 'İzinli' || existing.durum === 'Raporlu') {
          newAbsent.push(p.id);
        }
        if (existing.mesaiSaati > 0) {
          newMesai[p.id] = existing.mesaiSaati;
        }
      }
    });

    setPresentIds(newPresent);
    setAbsentIds(newAbsent);
    setMesaiSaatleri(newMesai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, activeStaff, yoklamalar]); 

  const handleDateChange = (newDate: string) => {
    if (hasLocalAttendanceDraft) {
      if (!window.confirm("Kaydedilmemiş değişiklikleriniz var! Çıkmak istiyor musunuz?")) return;
    }
    const cleanDate = normalizeDateKey(newDate);
    setSelectedDate(cleanDate);
    setHasLocalAttendanceDraft(false);
    setSearchQuery('');
  };

  const setMesaiWithDraft = (id: string, value: number) => {
    setHasLocalAttendanceDraft(true);
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(24, value)) : 0;
    setMesaiSaatleri(prev => ({ ...prev, [id]: safe }));
  };

  const handleMarkPresent = (id: string, mesai: number = 0) => {
    setHasLocalAttendanceDraft(true);
    setPresentIds(prev => [...prev.filter(x => x !== id), id]);
    setAbsentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: Math.max(0, Math.min(24, mesai)) }));
  };

  const handleMarkAbsent = (id: string) => {
    setHasLocalAttendanceDraft(true);
    setAbsentIds(prev => [...prev.filter(x => x !== id), id]);
    setPresentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: 0 }));
  };

  const handleUndo = (id: string) => {
    setHasLocalAttendanceDraft(true);
    setPresentIds(prev => prev.filter(x => x !== id));
    setAbsentIds(prev => prev.filter(x => x !== id));
    setMesaiSaatleri(prev => ({ ...prev, [id]: 0 }));
  };

  const handleSave = async () => {
    if (!saveYoklamalarNow) {
      if (addNotification) addNotification("Yoklama kaydetme fonksiyonu bulunamadı!");
      return;
    }

    if (!window.confirm(`${formatDateLabelTr(selectedDate)} tarihli Kampçı / Tesisatçı yoklamasını sisteme kaydetmek istiyor musunuz?`)) {
      return;
    }

    setSavingAttendance(true);
    try {
      const sparse: AylikYoklamaMap = {};
      const gonderen = currentUser?.email || 'kampci';

      activeStaff.forEach((p) => {
        let durumToSave: YoklamaDurum | null = null;
        let mesaiToSave = 0;

        if (presentIds.includes(p.id)) {
          durumToSave = 'Geldi';
          mesaiToSave = mesaiSaatleri[p.id] || 0;
        } else if (absentIds.includes(p.id)) {
          durumToSave = 'Yok';
        }

        if (durumToSave) {
          sparse[p.id] = setYoklamaDay(sparse[p.id], year, month, day, {
            durum: durumToSave,
            mesaiSaati: mesaiToSave,
            gonderen,
          });
        }
      });

      if (Object.keys(sparse).length === 0) {
        if (addNotification) addNotification('Kaydedilecek işaretli personel yok.');
        return;
      }

      await saveYoklamalarNow(sparse);

      setHasLocalAttendanceDraft(false);
      const stamp = new Date().toLocaleString('tr-TR');
      setLastSaveAt(stamp);
      try {
        localStorage.setItem('kamp_gunluk_yoklama_last', stamp);
      } catch {
        /* ignore */
      }
      if (addNotification) addNotification(`📅 ${selectedDate} Yoklaması başarıyla kaydedildi!`);
    } catch (err: any) {
      if (addNotification) addNotification(`Yoklama kaydedilemedi: ${err?.message || 'Bilinmeyen hata'}`);
    } finally {
      setSavingAttendance(false);
    }
  };

  const remainingStaff = activeStaff.filter(p => !presentIds.includes(p.id) && !absentIds.includes(p.id));
  const filteredRemaining = remainingStaff.filter(p => 
    `${p.ad} ${p.soyad}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.gorev || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const processedStaff = activeStaff.filter(p => presentIds.includes(p.id) || absentIds.includes(p.id));
  const filteredProcessed = processedStaff.filter(p => 
    `${p.ad} ${p.soyad}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.gorev || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExportCsv = () => {
    const rows = [
      ['Ad', 'Soyad', 'Gorev', 'Durum', 'Mesai']
    ];
    activeStaff.forEach((p) => {
      let d = 'Belirsiz';
      let m = '';
      if (presentIds.includes(p.id)) {
        d = 'Geldi';
        m = (mesaiSaatleri[p.id] || 0).toString();
      } else if (absentIds.includes(p.id)) {
        d = 'Yok';
      }
      rows.push([p.ad, p.soyad, p.gorev || '', d, m]);
    });
    downloadCsv(rows, `Kamp_Yoklama_${selectedDate}`);
  };

  return (
    <div className="space-y-4 max-w-[420px] mx-auto pb-8 animate-in fade-in">
      
      {/* Date Picker Header */}
      <div className="bg-white rounded-3xl p-4 border shadow-sm flex flex-col gap-2">
        <div className="flex justify-between items-end">
          <div className="flex-1">
            <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest block mb-1">Yoklama Tarihi</label>
            <div className="flex items-center space-x-2">
              <Calendar size={18} className="text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                max={todayDateKey()}
                onChange={(e) => handleDateChange(e.target.value)}
                className="flex-grow bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 rounded-xl p-2 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>
          </div>
          <button 
            onClick={handleExportCsv}
            className="ml-3 shrink-0 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold px-3 py-2 rounded-xl border border-emerald-200 transition-colors flex items-center justify-center no-print"
          >
            Excel'e Aktar
          </button>
        </div>
        
        {hasLocalAttendanceDraft && (
          <div className="mt-1 text-[10px] text-amber-600 font-bold animate-pulse">
            ⚠️ Kaydedilmemiş değişiklikleriniz var!
          </div>
        )}
      </div>

      {/* Main List Area */}
      <div className="bg-white rounded-3xl p-4 border shadow-sm space-y-4">
        <div className="flex items-center space-x-2 text-slate-800 border-b border-slate-100 pb-2">
          <Users size={16} className="text-slate-600" />
          <span className="font-bold text-[11px] uppercase tracking-wider">Personel Yoklama Listesi</span>
          <span className="bg-slate-100 text-slate-800 text-[9px] font-black px-2 py-0.5 rounded-full ml-auto">
            {activeStaff.length} KİŞİ
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text"
            placeholder="Personel adı veya görev ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 text-xs font-semibold text-slate-700"
          />
        </div>

        {/* Unmarked list */}
        <div className="max-h-[30vh] overflow-y-auto space-y-1 divide-y divide-slate-100 pr-1">
          {filteredRemaining.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic text-center py-6">Kalan personel bulunmuyor.</p>
          ) : (
            filteredRemaining.map(p => {
              const hrs = mesaiSaatleri[p.id] || 0;
              return (
                <div key={p.id} className="flex items-center justify-between py-2 pt-3">
                  <div className="min-w-0 flex-grow">
                    <span className="font-bold text-xs text-slate-800 block truncate">{p.ad} {p.soyad}</span>
                    <span className="text-[9px] text-slate-400 font-medium block truncate">{p.gorev}</span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    {/* Mesai Input Area */}
                    <div className="flex items-center bg-slate-100 rounded-lg px-1.5 py-0.5">
                      <button
                        type="button"
                        onClick={() => setMesaiWithDraft(p.id, Math.max(0, hrs - 1))}
                        className="w-5 h-5 bg-white text-slate-800 rounded font-black text-[10px] hover:bg-slate-200 flex items-center justify-center shadow-sm"
                      >
                        -
                      </button>
                      <span className="text-[10px] font-black mx-1.5 min-w-[14px] text-center text-slate-700">{hrs}</span>
                      <button
                        type="button"
                        onClick={() => setMesaiWithDraft(p.id, Math.min(24, hrs + 1))}
                        className="w-5 h-5 bg-white text-slate-800 rounded font-black text-[10px] hover:bg-slate-200 flex items-center justify-center shadow-sm"
                      >
                        +
                      </button>
                    </div>
                    <button 
                      onClick={() => handleMarkPresent(p.id, hrs)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 transition text-[10px] font-extrabold"
                    >
                      Geldi
                    </button>
                    <button 
                      onClick={() => handleMarkAbsent(p.id)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200 transition text-[10px] font-extrabold"
                    >
                      Yok
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Processed list (Present / Absent) summary */}
      {(presentIds.length > 0 || absentIds.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-800">Gelenler</span>
            </div>
            <span className="text-emerald-700 font-black text-sm">{presentIds.length}</span>
          </div>
          <div className="bg-rose-50 rounded-2xl p-3 border border-rose-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <XCircle size={14} className="text-rose-500" />
              <span className="text-[10px] font-bold text-rose-800">Gelmeyenler</span>
            </div>
            <span className="text-rose-700 font-black text-sm">{absentIds.length}</span>
          </div>
        </div>
      )}

      {/* Processed Staff Pool (İşlem Görenler Havuzu) */}
      {filteredProcessed.length > 0 && (
        <div className="bg-white rounded-3xl p-4 border shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-800 border-b border-slate-100 pb-2">
            <CheckCircle size={16} className="text-slate-600" />
            <span className="font-bold text-[11px] uppercase tracking-wider">Yoklaması Alınanlar Havuzu</span>
            <span className="bg-slate-100 text-slate-800 text-[9px] font-black px-2 py-0.5 rounded-full ml-auto">
              {filteredProcessed.length} KİŞİ
            </span>
          </div>
          <div className="max-h-[30vh] overflow-y-auto space-y-1 divide-y divide-slate-100 pr-1">
            {filteredProcessed.map(p => {
              const isGeldi = presentIds.includes(p.id);
              const hrs = mesaiSaatleri[p.id] || 0;
              return (
                <div key={p.id} className="flex items-center justify-between py-2 pt-3">
                  <div className="min-w-0 flex-grow">
                    <span className="font-bold text-xs text-slate-800 block truncate">{p.ad} {p.soyad}</span>
                    <span className="text-[9px] text-slate-400 font-medium block truncate">
                      {p.gorev} &bull; <span className={isGeldi ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{isGeldi ? 'Geldi' : 'Yok'}</span>
                      {isGeldi && hrs > 0 && <span className="text-slate-800 font-bold ml-1">({hrs}s mesai)</span>}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button 
                      onClick={() => handleUndo(p.id)}
                      className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 transition text-[10px] font-extrabold flex items-center gap-1"
                    >
                      <RefreshCw size={10} />
                      Geri Al
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="bg-white rounded-3xl p-4 border shadow-sm space-y-2">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Son kayıt</p>
            <p className="text-[11px] font-bold text-slate-800 truncate">
              {lastSaveAt || 'Henüz bu cihazdan kayıt yok'}
            </p>
          </div>
          {hasLocalAttendanceDraft ? (
            <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg shrink-0">
              Kaydedilmedi
            </span>
          ) : (
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg shrink-0">
              Güncel
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={savingAttendance || !hasLocalAttendanceDraft}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {savingAttendance ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <FileSignature size={18} />
          )}
          {savingAttendance ? 'KAYDEDİLİYOR...' : 'KAYDET'}
        </button>
        <p className="text-center text-[9px] text-slate-400 italic">
          Güvenli kayıt: yalnızca işaretlediğiniz personeller yazılır; diğer günler silinmez.
        </p>
      </div>

    </div>
  );
};
