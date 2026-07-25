import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  HardHat,
  Images,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  Loader2,
  Clock,
} from 'lucide-react';
import { AylikYoklamaMap, Personel, SahaFaaliyeti } from '../types/erp';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { PARSEL_LIST, blokListForParsel, defaultBlokForParsel } from '../data/parselBlokMap';
import { getFaaliyetFotolar } from '../lib/sahaFaaliyetUtils';
import {
  buildAtanmamisGeldiHavuzu,
  buildGunlukProgramCetveli,
  buildGunlukProgramOzeti,
  filterSahaFaaliyetleriByDate,
} from '../lib/geldiHavuzuUtils';
import { personMatchesFaaliyet } from '../lib/faaliyetPersonelUtils';

interface GunlukFaaliyetProgramScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  sahaFaaliyetleri: SahaFaaliyeti[];
  setSahaFaaliyetleri: (
    updater: SahaFaaliyeti[] | ((prev: SahaFaaliyeti[]) => SahaFaaliyeti[])
  ) => void;
  currentUser?: { email?: string; uid?: string } | null;
}

const DURUM_STYLE: Record<string, string> = {
  Geldi: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Yok: 'bg-rose-100 text-rose-800 border-rose-200',
  İzinli: 'bg-sky-100 text-sky-800 border-sky-200',
  Raporlu: 'bg-violet-100 text-violet-800 border-violet-200',
  Pazar: 'bg-slate-100 text-slate-500 border-slate-200',
  Girilmedi: 'bg-white text-slate-300 border-slate-100',
};

export const GunlukFaaliyetProgramScreen: React.FC<GunlukFaaliyetProgramScreenProps> = ({
  personeller,
  yoklamalar,
  sahaFaaliyetleri,
  setSahaFaaliyetleri,
  currentUser,
}) => {
  const [selectedDate, setSelectedDate] = useState(todayDateKey());
  const [havuzSearch, setHavuzSearch] = useState('');
  const [selectedHavuzIds, setSelectedHavuzIds] = useState<string[]>([]);
  const [editingGorevId, setEditingGorevId] = useState<string | null>(null);

  const [isNiteligi, setIsNiteligi] = useState('');
  const [parsel, setParsel] = useState(PARSEL_LIST[0] || 'GENEL SAHA');
  const [blok, setBlok] = useState(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
  const [aciklama, setAciklama] = useState('');
  const [draftStaff, setDraftStaff] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [detailPersonId, setDetailPersonId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const dayLabel = useMemo(() => formatDateLabelTr(selectedDate), [selectedDate]);

  const ozet = useMemo(
    () => buildGunlukProgramOzeti(personeller, yoklamalar, sahaFaaliyetleri, selectedDate),
    [personeller, yoklamalar, sahaFaaliyetleri, selectedDate]
  );

  const atanmamisHavuz = useMemo(
    () =>
      buildAtanmamisGeldiHavuzu(
        personeller,
        yoklamalar,
        sahaFaaliyetleri,
        selectedDate,
        editingGorevId || undefined
      ),
    [personeller, yoklamalar, sahaFaaliyetleri, selectedDate, editingGorevId]
  );

  const filteredHavuz = useMemo(() => {
    const q = havuzSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return atanmamisHavuz;
    return atanmamisHavuz.filter(
      (p) =>
        `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR').includes(q) ||
        String(p.gorev || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [atanmamisHavuz, havuzSearch]);

  const dayGorevler = useMemo(
    () => filterSahaFaaliyetleriByDate(sahaFaaliyetleri, selectedDate),
    [sahaFaaliyetleri, selectedDate]
  );

  const cetvel = useMemo(
    () => buildGunlukProgramCetveli(personeller, yoklamalar, sahaFaaliyetleri, selectedDate),
    [personeller, yoklamalar, sahaFaaliyetleri, selectedDate]
  );

  const detailPerson = useMemo(
    () => personeller.find((p) => p.id === detailPersonId) || null,
    [personeller, detailPersonId]
  );

  const detailFaaliyetler = useMemo(() => {
    if (!detailPerson) return [] as SahaFaaliyeti[];
    return dayGorevler.filter((sf) => personMatchesFaaliyet(detailPerson, sf));
  }, [detailPerson, dayGorevler]);

  const blokOptions = useMemo(() => blokListForParsel(parsel), [parsel]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    if (y < 2024 || y > 2027) return;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${mm}-${dd}`);
    resetGorevForm();
    setSelectedHavuzIds([]);
  };

  const resetGorevForm = () => {
    setEditingGorevId(null);
    setIsNiteligi('');
    setParsel(PARSEL_LIST[0] || 'GENEL SAHA');
    setBlok(defaultBlokForParsel(PARSEL_LIST[0] || 'GENEL SAHA'));
    setAciklama('');
    setDraftStaff([]);
  };

  const toggleHavuzSelect = (id: string) => {
    setSelectedHavuzIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addSelectedToDraft = () => {
    if (selectedHavuzIds.length === 0) return;
    setDraftStaff((prev) => {
      const next = new Set(prev);
      selectedHavuzIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
    setSelectedHavuzIds([]);
  };

  const removeFromDraft = (id: string) => {
    setDraftStaff((prev) => prev.filter((x) => x !== id));
  };

  const startEditGorev = (sf: SahaFaaliyeti) => {
    setEditingGorevId(sf.id);
    setIsNiteligi(sf.isNiteligi || '');
    setParsel(sf.parsel || PARSEL_LIST[0] || 'GENEL SAHA');
    setBlok(sf.blok || defaultBlokForParsel(sf.parsel || ''));
    setAciklama(sf.aciklama || '');
    setDraftStaff(Array.isArray(sf.aktifPersonelListesi) ? [...sf.aktifPersonelListesi] : []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const countUstaIsci = (ids: string[]) => {
    const list = personeller.filter((p) => ids.includes(p.id));
    const usta = list.filter((p) =>
      String(p.gorev || '').toLocaleUpperCase('tr-TR').includes('USTA')
    ).length;
    return { usta, isci: Math.max(0, list.length - usta) };
  };

  const handleSaveGorev = () => {
    if (!isNiteligi.trim()) {
      alert('İş niteliği zorunludur.');
      return;
    }
    if (draftStaff.length === 0) {
      alert('En az bir personel görevlendirin.');
      return;
    }
    const counts = countUstaIsci(draftStaff);
    setSaving(true);
    try {
      if (editingGorevId) {
        setSahaFaaliyetleri((prev) =>
          prev.map((sf) =>
            sf.id === editingGorevId
              ? {
                  ...sf,
                  tarih: selectedDate,
                  isNiteligi: isNiteligi.trim(),
                  parsel,
                  blok,
                  aciklama: aciklama.trim(),
                  aktifPersonelListesi: draftStaff,
                  ustaSayisi: counts.usta,
                  isciSayisi: counts.isci,
                  kaynakEkran: sf.kaynakEkran || 'GUNLUK_PROGRAM',
                  kaydeden: currentUser?.email || sf.kaydeden,
                }
              : sf
          )
        );
      } else {
        const id = `sf_prog_${Date.now()}`;
        const newLog: SahaFaaliyeti = {
          id,
          personelId: draftStaff[0] || 'p1',
          tarih: selectedDate,
          isNiteligi: isNiteligi.trim(),
          parsel,
          blok,
          aciklama: aciklama.trim() || `${isNiteligi.trim()} — günlük program`,
          aktifPersonelListesi: draftStaff,
          ustaSayisi: counts.usta,
          isciSayisi: counts.isci,
          faaliyetTipi: 'NORMAL',
          kaynakEkran: 'GUNLUK_PROGRAM',
          kaydeden: currentUser?.email || 'Günlük Program',
          kaydedenUid: currentUser?.uid,
          programaGonderildi: true,
          programaGonderimTarihi: new Date().toISOString(),
          iceriAktarimDurumu: 'BEKLIYOR',
        };
        setSahaFaaliyetleri((prev) => [newLog, ...prev]);
      }
      resetGorevForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGorev = (id: string) => {
    if (!window.confirm('Bu görev kaydını silmek istediğinize emin misiniz?')) return;
    setSahaFaaliyetleri((prev) => prev.filter((sf) => sf.id !== id));
    if (editingGorevId === id) resetGorevForm();
  };

  const removePersonFromGorev = (gorevId: string, personelId: string) => {
    setSahaFaaliyetleri((prev) =>
      prev.map((sf) => {
        if (sf.id !== gorevId) return sf;
        const nextList = (sf.aktifPersonelListesi || []).filter((x) => x !== personelId);
        const counts = countUstaIsci(nextList);
        return {
          ...sf,
          aktifPersonelListesi: nextList,
          ustaSayisi: counts.usta,
          isciSayisi: counts.isci,
        };
      })
    );
  };

  const handleDayPdfReport = () => {
    if (dayGorevler.length === 0) {
      alert('Bu gün için raporlanacak faaliyet kaydı yok.');
      return;
    }
    if (!ozet.programTamam && ozet.geldiSayisi > 0) {
      const ok = window.confirm(
        `Uyarı: ${ozet.atanmamisSayisi} Geldi personel henüz görevlendirilmedi.\nYine de PDF raporu açılsın mı?`
      );
      if (!ok) return;
    }
    void import('../lib/faaliyetGunlukReport').then(
      ({ buildFaaliyetGunlukReportHtml, openFaaliyetGunlukReportPdf }) => {
        const html = buildFaaliyetGunlukReportHtml({
          dateKey: selectedDate,
          sahaFaaliyetleri: dayGorevler,
          kampFaaliyetleri: [],
          personeller,
          yoklamalar,
          olusturan: currentUser?.email || 'Günlük Faaliyet Programı',
        });
        openFaaliyetGunlukReportPdf(html, `Günlük Faaliyet Programı — ${dayLabel}`);
      }
    );
  };

  const handleDayExcelReport = async () => {
    if (dayGorevler.length === 0) {
      alert('Bu gün için raporlanacak faaliyet kaydı yok.');
      return;
    }
    if (!ozet.programTamam && ozet.geldiSayisi > 0) {
      const ok = window.confirm(
        `Uyarı: ${ozet.atanmamisSayisi} Geldi personel henüz görevlendirilmedi.\nYine de Excel raporu indirilsin mi?`
      );
      if (!ok) return;
    }
    setExportingExcel(true);
    try {
      const { exportFaaliyetGunlukExcel } = await import('../lib/faaliyetGunlukReport');
      await exportFaaliyetGunlukExcel({
        dateKey: selectedDate,
        sahaFaaliyetleri: dayGorevler,
        kampFaaliyetleri: [],
        personeller,
        yoklamalar,
      });
    } catch (err) {
      console.error(err);
      alert('Excel raporu oluşturulamadı.');
    } finally {
      setExportingExcel(false);
    }
  };

  const draftStaffPeople = personeller.filter((p) => draftStaff.includes(p.id));

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 text-white p-5 sm:p-6 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_#fbbf24,_transparent_50%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">
              Geldi Havuzu · Günlük Program
            </p>
            <h1 className="text-xl sm:text-2xl font-black mt-1 tracking-tight">
              Günlük Faaliyet Programı
            </h1>
            <p className="text-[11px] text-slate-300 mt-1.5 max-w-xl font-medium">
              Yoklamada Geldi işaretlenen her personel o gün bir göreve atanmalıdır. Atamalar saha
              faaliyetleriyle aynı parsel / blok kayıtlarına yazılır.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-1.5">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-2 text-center min-w-[140px]">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                    resetGorevForm();
                    setSelectedHavuzIds([]);
                  }
                }}
                className="bg-transparent text-center text-sm font-black text-white outline-none [color-scheme:dark]"
              />
              <p className="text-[9px] text-amber-200/80 font-bold uppercase tracking-wider">
                {dayLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => shiftDay(1)}
              className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'Geldi', value: String(ozet.geldiSayisi), icon: Users },
            { label: 'Atanan', value: String(ozet.atananSayisi), icon: CheckCircle2 },
            { label: 'Atanmamış', value: String(ozet.atanmamisSayisi), icon: XCircle },
            { label: 'Görev', value: String(ozet.gorevSayisi), icon: ClipboardList },
            {
              label: 'Durum',
              value: ozet.geldiSayisi === 0 ? 'Yoklama yok' : ozet.programTamam ? 'Tamam' : 'Eksik',
              icon: ozet.programTamam ? CheckCircle2 : AlertTriangle,
              mono: false as const,
            },
          ].map((item) => (
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
                  item.mono === false ? 'text-[11px] leading-snug' : 'text-lg'
                }`}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {!ozet.programTamam && ozet.geldiSayisi > 0 && (
          <div className="relative mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/20 border border-amber-400/30 px-3 py-2.5 text-[11px] font-semibold text-amber-50">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Program tamamlanmadı: {ozet.atanmamisSayisi} Geldi personel henüz görevlendirilmedi.
              Her Geldi personelin en az bir saha kaydında olması zorunludur.
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={handleDayPdfReport}
          disabled={dayGorevler.length === 0}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-3 py-2 rounded-xl disabled:opacity-40 cursor-pointer"
        >
          <Printer size={13} />
          PDF / Yazdır
        </button>
        <button
          type="button"
          onClick={() => void handleDayExcelReport()}
          disabled={dayGorevler.length === 0 || exportingExcel}
          className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-black px-3 py-2 rounded-xl disabled:opacity-40 cursor-pointer"
        >
          {exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
          {exportingExcel ? 'Excel…' : 'Excel'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Geldi Havuzu */}
        <aside className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden max-h-[70vh]">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Users size={14} className="text-amber-600" />
              Geldi Havuzu
              <span className="ml-auto text-[10px] font-bold text-slate-500">
                {filteredHavuz.length} atanmamış
              </span>
            </h2>
            <label className="relative block">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={havuzSearch}
                onChange={(e) => setHavuzSearch(e.target.value)}
                placeholder="Ad veya görev ara…"
                className="w-full pl-8 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400"
              />
            </label>
            <button
              type="button"
              onClick={addSelectedToDraft}
              disabled={selectedHavuzIds.length === 0}
              className="w-full inline-flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wide bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white py-2 rounded-xl cursor-pointer"
            >
              <UserPlus size={12} />
              Seçilenleri göreve ekle ({selectedHavuzIds.length})
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {filteredHavuz.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                <CheckCircle2 className="mx-auto text-emerald-400 opacity-60" size={28} />
                <p className="font-bold text-slate-600">
                  {ozet.geldiSayisi === 0
                    ? 'Bu gün Geldi yoklama kaydı yok'
                    : 'Tüm Geldi personel görevlendirildi'}
                </p>
              </div>
            ) : (
              filteredHavuz.map((p) => {
                const selected = selectedHavuzIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleHavuzSelect(p.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2 cursor-pointer transition ${
                      selected ? 'bg-amber-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selected
                          ? 'bg-amber-600 border-amber-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {selected && <CheckCircle2 size={10} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 truncate">
                        {p.ad} {p.soyad}
                      </span>
                      <span className="block text-[10px] text-slate-500 font-semibold uppercase truncate">
                        {p.gorev || '—'}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Program / Görev formu + kartlar */}
        <section className="xl:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <HardHat size={14} className="text-amber-600" />
                {editingGorevId ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}
              </h2>
              {editingGorevId && (
                <button
                  type="button"
                  onClick={resetGorevForm}
                  className="text-[10px] font-bold text-slate-500 underline cursor-pointer"
                >
                  Vazgeç
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  İş Niteliği *
                </label>
                <input
                  value={isNiteligi}
                  onChange={(e) => setIsNiteligi(e.target.value)}
                  placeholder="Örn: Tuğla / Duvar Örümü"
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Parsel *
                </label>
                <select
                  value={parsel}
                  onChange={(e) => {
                    const next = e.target.value;
                    setParsel(next);
                    setBlok(defaultBlokForParsel(next));
                  }}
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400"
                >
                  {PARSEL_LIST.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Blok *
                </label>
                <select
                  value={blok}
                  onChange={(e) => setBlok(e.target.value)}
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400"
                >
                  {(blokOptions.length ? blokOptions : ['GENEL SAHA']).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                  Açıklama
                </label>
                <textarea
                  value={aciklama}
                  onChange={(e) => setAciklama(e.target.value)}
                  rows={2}
                  placeholder="Günlük iş açıklaması…"
                  className="w-full text-xs font-medium p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400 resize-none"
                />
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 p-2.5">
              <p className="text-[9px] font-black uppercase text-amber-800 mb-2 flex items-center gap-1">
                <UserPlus size={11} />
                Görev ekibi ({draftStaff.length})
              </p>
              {draftStaffPeople.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">
                  Soldaki havuzdan personel seçip “Göreve ekle” deyin.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draftStaffPeople.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 text-[10px] font-bold bg-white border border-amber-200 text-slate-800 rounded-lg px-2 py-1"
                    >
                      {p.ad} {p.soyad}
                      <button
                        type="button"
                        onClick={() => removeFromDraft(p.id)}
                        className="text-rose-500 hover:text-rose-700 cursor-pointer"
                        title="Çıkar"
                      >
                        <UserMinus size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveGorev}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-black py-3 rounded-xl cursor-pointer"
            >
              <Plus size={14} />
              {editingGorevId ? 'Görevi Güncelle' : 'Görevi Kaydet (Saha Faaliyeti)'}
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 px-1">
              Günün görevleri ({dayGorevler.length})
            </h3>
            {dayGorevler.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs">
                Bu gün henüz program görevi yok.
              </div>
            ) : (
              dayGorevler.map((sf) => {
                const fotolar = getFaaliyetFotolar(sf);
                const ekip = (sf.aktifPersonelListesi || [])
                  .map((id) => {
                    const p = personeller.find((x) => x.id === id);
                    return p ? `${p.ad} ${p.soyad}` : id;
                  })
                  .join(', ');
                return (
                  <article
                    key={sf.id}
                    className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm space-y-2"
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase text-slate-400">
                          {sf.kaynakEkran || 'SAHA'} · {fotolar.length} foto
                        </p>
                        <h4 className="text-sm font-black text-slate-900 truncate">
                          {sf.isNiteligi || '—'}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="text-amber-600" />
                          {sf.parsel} · {sf.blok}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditGorev(sf)}
                          className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 cursor-pointer"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGorev(sf.id)}
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {sf.aciklama && (
                      <p className="text-[11px] text-slate-600 leading-relaxed">{sf.aciklama}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(sf.aktifPersonelListesi || []).map((pid) => {
                        const p = personeller.find((x) => x.id === pid);
                        const label = p ? `${p.ad} ${p.soyad}` : pid;
                        return (
                          <span
                            key={`${sf.id}-${pid}`}
                            className="inline-flex items-center gap-1 text-[9px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5"
                          >
                            {label}
                            <button
                              type="button"
                              onClick={() => removePersonFromGorev(sf.id, pid)}
                              className="text-rose-400 hover:text-rose-600 cursor-pointer"
                              title="Görevden çıkar"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    {!ekip && (
                      <p className="text-[10px] text-rose-500 italic">Personel atanmamış</p>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Günlük Cetvel */}
        <section className="xl:col-span-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden max-h-[70vh]">
          <div className="p-3 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <ClipboardList size={14} className="text-amber-600" />
              Günlük Cetvel
            </h2>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">
              İsme çift tıklayın → saha kayıtları ve fotoğraflar
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            {cetvel.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Bu gün için Geldi personel yok.
              </div>
            ) : (
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-900 text-white">
                  <tr>
                    <th className="px-2.5 py-2 font-black">Personel</th>
                    <th className="px-2 py-2 font-black text-center">Yoklama</th>
                    <th className="px-2 py-2 font-black text-center">
                      <Clock size={11} className="inline" /> Mesai
                    </th>
                    <th className="px-2 py-2 font-black text-center">Faaliyet</th>
                  </tr>
                </thead>
                <tbody>
                  {cetvel.map((row) => (
                    <tr
                      key={row.personelId}
                      onDoubleClick={() => setDetailPersonId(row.personelId)}
                      className={`border-b border-slate-100 cursor-pointer select-none ${
                        row.atandi ? 'bg-white hover:bg-emerald-50/50' : 'bg-rose-50/40 hover:bg-rose-50'
                      }`}
                      title="Çift tık: detay"
                    >
                      <td className="px-2.5 py-2">
                        <p className="font-bold text-slate-900 leading-tight">{row.adSoyad}</p>
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">
                          {row.gorev}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border ${
                            DURUM_STYLE[row.yoklamaDurum] || DURUM_STYLE.Girilmedi
                          }`}
                        >
                          {row.yoklamaDurum}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center font-mono font-bold text-slate-700">
                        {row.mesaiSaati > 0 ? `${row.mesaiSaati}sa` : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {row.faaliyetVar ? (
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200"
                            title={`${row.faaliyetSayisi} faaliyet · ${row.fotoSayisi} foto`}
                          >
                            <Camera size={13} />
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-300 border border-slate-200"
                            title="Faaliyet kaydı yok"
                          >
                            <Camera size={13} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Personel detay popup */}
      {detailPerson && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-start gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">
                  Saha Kayıt Raporu · {dayLabel}
                </p>
                <h3 className="text-lg font-black mt-0.5">
                  {detailPerson.ad} {detailPerson.soyad}
                </h3>
                <p className="text-[11px] text-slate-300 font-semibold uppercase">
                  {detailPerson.gorev}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailPersonId(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
              {detailFaaliyetler.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                  <AlertTriangle className="mx-auto opacity-40" size={28} />
                  <p className="font-bold text-slate-600">Bu personel için saha kaydı yok</p>
                  <p>Havuzdan seçip bir göreve atayın.</p>
                </div>
              ) : (
                detailFaaliyetler.map((sf) => {
                  const fotolar = getFaaliyetFotolar(sf);
                  return (
                    <article
                      key={sf.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm"
                    >
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400">
                          {sf.kaynakEkran || 'SAHA'}
                        </p>
                        <h4 className="text-sm font-black text-slate-900">
                          {sf.isNiteligi || '—'}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="text-amber-600" />
                          {sf.parsel} · {sf.blok}
                        </p>
                      </div>
                      {sf.aciklama && (
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {sf.aciklama}
                        </p>
                      )}
                      {fotolar.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1">
                            <Images size={11} />
                            Fotoğraflar ({fotolar.length}) — tıklayınca büyüt
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {fotolar.map((url, idx) => (
                              <button
                                key={`${sf.id}-foto-${idx}`}
                                type="button"
                                onClick={() => setLightbox({ urls: fotolar, index: idx })}
                                className="relative h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group"
                              >
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-105 transition"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Fotoğraf eklenmemiş</p>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white cursor-pointer"
            onClick={() => setLightbox(null)}
          >
            <X size={28} />
          </button>
          {lightbox.urls.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 text-white/80 hover:text-white cursor-pointer p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index - 1 + prev.urls.length) % prev.urls.length,
                        }
                      : null
                  );
                }}
              >
                <ChevronLeft size={32} />
              </button>
              <button
                type="button"
                className="absolute right-4 text-white/80 hover:text-white cursor-pointer p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? { ...prev, index: (prev.index + 1) % prev.urls.length }
                      : null
                  );
                }}
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}
          <img
            src={lightbox.urls[lightbox.index]}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-white/70 text-xs font-bold">
            {lightbox.index + 1} / {lightbox.urls.length}
          </p>
        </div>
      )}
    </div>
  );
};
