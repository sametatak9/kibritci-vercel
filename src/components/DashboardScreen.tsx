import React, { useEffect, useMemo, useState, startTransition } from 'react';
import {
  Users, Wallet, ShoppingCart, Truck,
  ClipboardList, CalendarCheck2, Tent,
  MapPin, Plus, Sparkles, Bell,
  Download, Search, HardHat, Building2, ShieldCheck,
} from 'lucide-react';
import {
  Personel, KasaHareketi, SatinAlmaTalebi, AracBakim, AylikYoklamaMap,
  KampOdasi, KampKaydi, Fatura, Irsaliye,
} from '../types/erp';
import { KibritciLogo } from './KibritciLogo';
import { KIBRITCI_COMPANY } from '../lib/kibritciBrand';
import { DashboardPeriodSummary } from './DashboardPeriodSummary';
import { DashboardFavoriteTabsStrip } from './DashboardFavoriteTabsStrip';
import { DashboardSonIslemlerFeed } from './DashboardSonIslemlerFeed';
import { DashboardKampKroki3D } from './DashboardKampKroki3D';
import { isPersonelActiveOnDate } from '../lib/guvenlikHelpers';
import { getYoklamaDay, isTaseronPersonel } from '../lib/yoklamaUtils';
import { buildOperasyonOzeti } from '../lib/operasyonUyarilari';
import { downloadPersonelTraceReport } from '../lib/dashboardPersonelReportHtml';

interface DashboardScreenProps {
  personeller: Personel[];
  kasaHareketleri: KasaHareketi[];
  yoklamalar: AylikYoklamaMap;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  araclar: AracBakim[];
  aracKmLoglari?: any[];
  kampOdalari?: KampOdasi[];
  kampKayitlari?: KampKaydi[];
  irsaliyeler?: Irsaliye[];
  faturalar?: Fatura[];
  onNavigate: (tab: string) => void;
  currentUser?: any;
  stokKartlar?: any[];
  bildirimler?: any[];
  dataReady?: boolean;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

const QUICK_MODULES = [
  { tab: 'yoklama', label: 'Yoklama', desc: 'Puantaj girişi', icon: ClipboardList, tone: 'bg-orange-50 text-orange-700 border-orange-100 hover:border-orange-300' },
  { tab: 'satin_alma', label: 'Satın Alma', desc: 'Malzeme talebi', icon: ShoppingCart, tone: 'bg-amber-50 text-amber-800 border-amber-100 hover:border-amber-300' },
  { tab: 'personel', label: 'Personel', desc: 'Kadro yönetimi', icon: Users, tone: 'bg-sky-50 text-sky-800 border-sky-100 hover:border-sky-300' },
  { tab: 'kamp', label: 'Kamp', desc: 'Lojman atama', icon: Tent, tone: 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:border-emerald-300' },
  { tab: 'kasa', label: 'Kasa', desc: 'Nakit hareketleri', icon: Wallet, tone: 'bg-violet-50 text-violet-800 border-violet-100 hover:border-violet-300' },
  { tab: 'onay_islemleri', label: 'Onay Havuzu', desc: 'Bekleyen işlemler', icon: ShieldCheck, tone: 'bg-rose-50 text-rose-800 border-rose-100 hover:border-rose-300' },
  { tab: 'guvenlik_ekrani', label: 'Güvenlik', desc: 'Kapı & evrak', icon: HardHat, tone: 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300' },
  { tab: 'arac', label: 'Araç & KM', desc: 'Filomatik', icon: Truck, tone: 'bg-indigo-50 text-indigo-800 border-indigo-100 hover:border-indigo-300' },
] as const;

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  personeller,
  kasaHareketleri,
  yoklamalar,
  satinAlmaTalepleri,
  araclar,
  aracKmLoglari = [],
  kampOdalari = [],
  kampKayitlari = [],
  irsaliyeler = [],
  faturalar = [],
  onNavigate,
  currentUser,
  stokKartlar = [],
  bildirimler = [],
  dataReady = false,
}) => {
  const totalRooms = kampOdalari.length;
  const totalBeds = kampOdalari.reduce((sum, r) => sum + r.kapasite, 0);
  const occupiedBeds = kampKayitlari.filter((cr) => cr.durum === 'AKTIF').length;
  const fillRatio = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const bugun = new Date().toISOString().split('T')[0];
  const todayLabel = useMemo(() => {
    try {
      return new Date(`${bugun}T12:00:00`).toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return bugun;
    }
  }, [bugun]);

  const isAktifKadro = (p: Personel) =>
    (p.durum === true || String(p.durum) === 'true') && isPersonelActiveOnDate(p, bugun);
  const aktifKadro = personeller.filter(isAktifKadro);
  const activePersonelCount = aktifKadro.length;
  const anaFirmaActiveCount = aktifKadro.filter((p) => !isTaseronPersonel(p)).length;
  const taseronActiveCount = aktifKadro.filter((p) => isTaseronPersonel(p)).length;

  const [panelsReady, setPanelsReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => startTransition(() => setPanelsReady(true)), 0);
    return () => window.clearTimeout(id);
  }, []);

  const attendanceRate = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const daysInMonth = new Date(y, m, 0).getDate();
    let totalCheckedDays = 0;
    let totalPresentDays = 0;
    for (const pId of Object.keys(yoklamalar || {})) {
      const personMap = yoklamalar[pId] || {};
      for (let d = 1; d <= daysInMonth; d += 1) {
        const day = getYoklamaDay(personMap, y, m, d);
        const durum = day?.durum;
        if (durum && durum !== 'Girilmedi') {
          totalCheckedDays += 1;
          if (durum === 'Geldi') totalPresentDays += 1;
        }
      }
    }
    return totalCheckedDays > 0 ? Math.round((totalPresentDays / totalCheckedDays) * 100) : 0;
  }, [yoklamalar]);

  const operasyonOzeti = useMemo(
    () =>
      panelsReady
        ? buildOperasyonOzeti({ satinAlmaTalepleri, irsaliyeler, faturalar, stokKartlar, kampOdalari, kampKayitlari })
        : { bekleyenOnay: 0, gecikenOnay: 0 },
    [panelsReady, satinAlmaTalepleri, irsaliyeler, faturalar, stokKartlar, kampOdalari, kampKayitlari]
  );

  const dataStillHydrating = !dataReady;
  const unreadNotifs = useMemo(() => (bildirimler || []).filter((n) => !n.okundu).length, [bildirimler]);

  const [selectedPersonelId, setSelectedPersonelId] = useState('');

  const getIndividualTraceHistory = (pId: string) => {
    if (!pId) return null;
    const p = personeller.find((item) => item.id === pId);
    if (!p) return null;
    const fullName = `${p.ad} ${p.soyad}`.toLowerCase().trim();
    const AttendanceSummary = { geldi: 0, yok: 0, izinli: 0, raporlu: 0 };
    const pYoklama = yoklamalar[pId] || {};
    Object.values(pYoklama).forEach((day: any) => {
      if (day?.durum === 'Geldi') AttendanceSummary.geldi++;
      if (day?.durum === 'Yok') AttendanceSummary.yok++;
      if (day?.durum === 'İzinli') AttendanceSummary.izinli++;
      if (day?.durum === 'Raporlu') AttendanceSummary.raporlu++;
    });
    return {
      person: p,
      attendance: AttendanceSummary,
      vehicles: araclar.filter((a) => a.sorumluPersonelId === pId),
      kmLogs: aracKmLoglari.filter(
        (log) => String(log.surucu || '').toLowerCase().trim() === fullName || String(log.personelId || '') === pId
      ),
      purchases: satinAlmaTalepleri.filter((sa) => String(sa.talepEden || '').toLowerCase().trim() === fullName),
    };
  };

  const traceData = getIndividualTraceHistory(selectedPersonelId);
  const userLabel = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Yönetici';

  const kpiCards = [
    { title: 'Aktif Kadro', value: activePersonelCount, unit: 'kişi', sub: `Ana ${anaFirmaActiveCount} · Taşeron ${taseronActiveCount}`, icon: Users, ring: 'ring-orange-100', iconBg: 'bg-orange-100 text-orange-600' },
    { title: 'Kamp Doluluk', value: fillRatio, unit: '%', sub: `${occupiedBeds} / ${totalBeds} yatak`, icon: Tent, ring: 'ring-emerald-100', iconBg: 'bg-emerald-100 text-emerald-600' },
    { title: 'Puantaj Katılım', value: attendanceRate, unit: '%', sub: 'Bu ay ortalama', icon: CalendarCheck2, ring: 'ring-sky-100', iconBg: 'bg-sky-100 text-sky-600' },
    { title: 'Bekleyen Onay', value: operasyonOzeti.bekleyenOnay, unit: 'adet', sub: operasyonOzeti.gecikenOnay > 0 ? `${operasyonOzeti.gecikenOnay} gecikmiş` : 'Onay havuzu', icon: ClipboardList, ring: 'ring-amber-100', iconBg: 'bg-amber-100 text-amber-700' },
  ];

  const aktifPreview = useMemo(
    () => aktifKadro.slice(0, 6),
    [aktifKadro]
  );

  return (
    <div className="flex-grow min-h-full overflow-y-auto bg-gradient-to-b from-[#FFFBF7] via-white to-orange-50/20">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-slideUp">

        {(dataStillHydrating || !panelsReady) && (
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              {dataStillHydrating ? 'Canlı veriler yükleniyor…' : 'Paneller hazırlanıyor…'}
            </div>
            <button type="button" onClick={() => window.location.reload()} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer">
              Yenile
            </button>
          </div>
        )}

        {/* ── Hero ── */}
        <section className="relative overflow-hidden rounded-[28px] border border-orange-100/80 bg-white shadow-[0_8px_40px_-12px_rgba(245,158,11,0.15)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(251,191,36,0.12),transparent_55%)]" />
          <div className="absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-orange-100/30 blur-3xl" />
          <div className="relative z-10 p-6 md:p-8 lg:p-10">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0">
                <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-4 border border-orange-100/60 shadow-sm">
                  <KibritciLogo size="xl" className="h-14 sm:h-16 md:h-[4.5rem]" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-orange-700 bg-orange-50 border border-orange-200/60 px-2.5 py-1 rounded-full">
                      <Sparkles size={11} /> {getGreeting()}, {userLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Canlı
                    </span>
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl lg:text-[2rem] font-bold text-slate-900 tracking-tight leading-tight">
                    Şantiye Yönetim Merkezi
                  </h1>
                  <p className="text-sm text-slate-500 max-w-xl leading-relaxed capitalize">
                    {todayLabel}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1">
                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-orange-500" /> Gebze Şantiyesi</span>
                    <span className="inline-flex items-center gap-1"><Building2 size={12} className="text-orange-500" /> {KIBRITCI_COMPANY.shortName}</span>
                    {unreadNotifs > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-600 font-semibold"><Bell size={12} /> {unreadNotifs} yeni bildirim</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('satin_alma')}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-orange-200/50 transition active:scale-[0.98] cursor-pointer"
                >
                  <Plus size={15} strokeWidth={2.5} />
                  Satın Alma Talebi
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('onay_islemleri')}
                  className="inline-flex items-center gap-2 bg-white hover:bg-orange-50 text-slate-800 border border-orange-200/80 font-bold text-xs px-5 py-3 rounded-2xl transition cursor-pointer"
                >
                  <ShieldCheck size={15} />
                  Onay Havuzu
                </button>
              </div>
            </div>
          </div>
        </section>

        <DashboardFavoriteTabsStrip onNavigate={onNavigate} />

        <DashboardPeriodSummary
          personeller={personeller}
          satinAlmaTalepleri={satinAlmaTalepleri}
          kasaHareketleri={kasaHareketleri}
          yoklamalar={yoklamalar}
          bildirimler={bildirimler}
          onNavigate={onNavigate}
        />

        {/* ── KPI ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.title} className={`rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 shadow-sm ring-1 ${kpi.ring} hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.title}</p>
                    <p className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                      {kpi.value}<span className="text-base font-semibold text-slate-400 ml-0.5">{kpi.unit}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1 font-medium">{kpi.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${kpi.iconBg}`}>
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Hızlı modüller ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-1">Hızlı Erişim</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {QUICK_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.tab}
                  type="button"
                  onClick={() => onNavigate(mod.tab)}
                  className={`group flex flex-col items-center text-center gap-2 p-3.5 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${mod.tone}`}
                >
                  <div className="p-2 rounded-xl bg-white/70 group-hover:scale-110 transition-transform">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold leading-tight">{mod.label}</p>
                    <p className="text-[9px] opacity-70 mt-0.5 hidden sm:block">{mod.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Kamp kroki 3D ── */}
        <DashboardKampKroki3D
          kampOdalari={kampOdalari}
          kampKayitlari={kampKayitlari}
          personeller={personeller}
          onNavigate={onNavigate}
        />

        <DashboardSonIslemlerFeed
          kasaHareketleri={kasaHareketleri}
          satinAlmaTalepleri={satinAlmaTalepleri}
          bildirimler={bildirimler}
          onNavigate={onNavigate}
        />

        {/* ── Personel sorgu + Aktif kadro ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-orange-500" />
              <h3 className="font-display font-bold text-sm text-slate-900">Personel Sorgula</h3>
            </div>
            <select
              value={selectedPersonelId}
              onChange={(e) => setSelectedPersonelId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-medium text-slate-700 outline-none focus:border-orange-300 cursor-pointer"
            >
              <option value="">Personel seçin…</option>
              {personeller.map((p) => (
                <option key={p.id} value={p.id}>{p.ad} {p.soyad} — {p.gorev}</option>
              ))}
            </select>
            {!traceData ? (
              <p className="text-[11px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">Araç, puantaj ve satın alma geçmişi için personel seçin.</p>
            ) : (
              <div className="space-y-3 text-[11px]">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-orange-50/50 border border-orange-100">
                  <div className="w-9 h-9 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-bold text-xs">{traceData.person.ad[0]}{traceData.person.soyad[0]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{traceData.person.ad} {traceData.person.soyad}</p>
                    <p className="text-slate-500 truncate">{traceData.person.gorev}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center font-bold">
                  {[['Geldi', traceData.attendance.geldi, 'text-emerald-700 bg-emerald-50'], ['Yok', traceData.attendance.yok, 'text-rose-700 bg-rose-50'], ['İzin', traceData.attendance.izinli, 'text-amber-700 bg-amber-50'], ['Rapor', traceData.attendance.raporlu, 'text-slate-700 bg-slate-50']].map(([lbl, val, cls]) => (
                    <div key={String(lbl)} className={`rounded-lg py-1.5 ${cls}`}>
                      <p className="text-sm tabular-nums">{val}</p>
                      <span className="text-[8px] opacity-70">{lbl}</span>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => downloadPersonelTraceReport(traceData)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-700 cursor-pointer">
                  <Download size={13} /> Rapor İndir
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-orange-500" />
                <h3 className="font-display font-bold text-sm text-slate-900">Aktif Kadro</h3>
              </div>
              <button type="button" onClick={() => onNavigate('personel')} className="text-[10px] font-bold text-orange-600 hover:underline cursor-pointer">Tümü →</button>
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {aktifPreview.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-4">Aktif personel yok</p>
              ) : (
                aktifPreview.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-orange-50/40 transition">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 text-orange-800 flex items-center justify-center text-[10px] font-bold">{p.ad[0]}{p.soyad[0]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-slate-800 truncate">{p.ad} {p.soyad}</p>
                      <p className="text-[9px] text-slate-400 truncate">{p.gorev}</p>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Aktif" />
                  </div>
                ))
              )}
            </div>
            <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[10px]">
              <div><span className="font-black text-lg text-slate-900 block tabular-nums">{totalRooms}</span><span className="text-slate-400">Oda</span></div>
              <div><span className="font-black text-lg text-slate-900 block tabular-nums">{totalBeds}</span><span className="text-slate-400">Yatak</span></div>
              <div><span className="font-black text-lg text-emerald-600 block tabular-nums">{occupiedBeds}</span><span className="text-slate-400">Dolu</span></div>
            </div>
          </section>
        </div>

        {/* ── Bildirim akışı ── */}
        {bildirimler && bildirimler.length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-orange-500" />
              <h3 className="font-display font-bold text-sm text-slate-900">Son Bildirimler</h3>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {bildirimler.slice(0, 8).map((b, idx) => (
                <div key={b.id || idx} className="flex gap-3 p-2.5 rounded-xl hover:bg-orange-50/30 border border-transparent hover:border-orange-100/60 transition">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-700 leading-snug">{b.mesaj}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{b.tarih ? new Date(b.tarih).toLocaleString('tr-TR') : 'Az önce'}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center text-[10px] text-slate-400 pb-4 pt-2">
          {KIBRITCI_COMPANY.shortName} · ERP v2 · {KIBRITCI_COMPANY.web}
        </footer>
      </div>
    </div>
  );
};

export default DashboardScreen;
