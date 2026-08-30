import React, { useEffect, useMemo, useState, startTransition } from 'react';
import { 
  Users, Wallet, ShoppingCart, Truck, ClipboardList, CalendarCheck2, Tent,
  MapPin, Sparkles, Bell, HardHat, Building2, ShieldCheck, Camera,
  ChevronRight, FileText, UserCircle, LayoutGrid,
} from 'lucide-react';
import {
  Personel, KasaHareketi, SatinAlmaTalebi, AracBakim, AylikYoklamaMap,
  KampOdasi, KampKaydi, Fatura, Irsaliye,
} from '../types/erp';
import { KibritciLogo } from './KibritciLogo';
import { KIBRITCI_COMPANY } from '../lib/kibritciBrand';
import { DashboardPeriodSummary } from './DashboardPeriodSummary';
import { DashboardFavoriteTabsStrip } from './DashboardFavoriteTabsStrip';
import { DashboardGunlukYoklamaGorev } from './DashboardGunlukYoklamaGorev';
import { DashboardSonIslemlerFeed } from './DashboardSonIslemlerFeed';
import { DashboardKampOdaPanel } from './DashboardKampOdaPanel';
import { isPersonelActiveOnDate } from '../lib/guvenlikHelpers';
import { getYoklamaDay, isTaseronPersonel } from '../lib/yoklamaUtils';
import { buildOperasyonOzeti } from '../lib/operasyonUyarilari';
import { auditKampYerlesimCounts } from '../lib/kampFirmaOzet';

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

type ActionItem = {
  tab: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  badge?: number;
  highlight?: boolean;
};

const ACTION_ZONES: Array<{ title: string; items: ActionItem[] }> = [
  {
    title: 'Günlük Operasyon',
    items: [
      { tab: 'yoklama', label: 'Yoklama', desc: 'Puantaj girişi', icon: ClipboardList },
      { tab: 'faaliyet_personel', label: 'Faaliyet Personel', desc: 'Saha & kamp kayıtları', icon: Camera },
      { tab: 'onay_islemleri', label: 'Onay Havuzu', desc: 'Bekleyen onaylar', icon: ShieldCheck },
    ],
  },
  {
    title: 'Personel & Kamp',
    items: [
      { tab: 'personel_kartlari', label: 'Personel Kartları', desc: 'Detay & saha geçmişi', icon: UserCircle },
      { tab: 'personel', label: 'Kadro', desc: 'Personel yönetimi', icon: Users },
      { tab: 'kamp', label: 'Kamp', desc: 'Oda & lojman', icon: Tent },
    ],
  },
  {
    title: 'Tedarik & Evrak',
    items: [
      { tab: 'satin_alma', label: 'Satın Alma', desc: 'Malzeme talebi', icon: ShoppingCart },
      { tab: 'kasa', label: 'Kasa', desc: 'Nakit hareketleri', icon: Wallet },
      { tab: 'guvenlik_ekrani', label: 'Güvenlik', desc: 'Kapı & evrak', icon: HardHat },
      { tab: 'arac', label: 'Araç & KM', desc: 'Filomatik', icon: Truck },
    ],
  },
];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ 
  personeller, 
  kasaHareketleri,
  yoklamalar,
  satinAlmaTalepleri,
  araclar: _araclar,
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
  const totalBeds = kampOdalari.reduce((sum, r) => sum + r.kapasite, 0);
  const kampAudit = useMemo(
    () => auditKampYerlesimCounts(personeller, kampKayitlari),
    [personeller, kampKayitlari]
  );
  const uniqueKampta = kampAudit.uniqueYerlesik;
  const fillRatio = totalBeds > 0 ? Math.round((uniqueKampta / totalBeds) * 100) : 0;

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
  const userLabel = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Yönetici';

  const kpiCards = [
    {
      title: 'Aktif Kadro',
      value: activePersonelCount,
      unit: 'kişi',
      sub: `Ana ${anaFirmaActiveCount} · Taşeron ${taseronActiveCount}`,
      icon: Users,
      ring: 'ring-orange-100',
      iconBg: 'bg-orange-100 text-orange-600',
      tab: 'personel',
    },
    {
      title: 'Kampta',
      value: uniqueKampta,
      unit: 'kişi',
      sub: totalBeds > 0 ? `${uniqueKampta}/${totalBeds} yatak · %${fillRatio}` : 'Yerleşim yok',
      icon: Tent,
      ring: 'ring-emerald-100',
      iconBg: 'bg-emerald-100 text-emerald-600',
      tab: 'kamp',
    },
    {
      title: 'Puantaj Katılım',
      value: attendanceRate,
      unit: '%',
      sub: 'Bu ay ortalama',
      icon: CalendarCheck2,
      ring: 'ring-sky-100',
      iconBg: 'bg-sky-100 text-sky-600',
      tab: 'yoklama',
    },
    {
      title: 'Bekleyen Onay',
      value: operasyonOzeti.bekleyenOnay,
      unit: 'adet',
      sub: operasyonOzeti.gecikenOnay > 0 ? `${operasyonOzeti.gecikenOnay} gecikmiş` : 'Onay havuzu',
      icon: ShieldCheck,
      ring: operasyonOzeti.bekleyenOnay > 0 ? 'ring-amber-200' : 'ring-amber-100',
      iconBg: 'bg-amber-100 text-amber-700',
      tab: 'onay_islemleri',
      highlight: operasyonOzeti.bekleyenOnay > 0,
    },
  ];

  const actionZonesWithBadges = useMemo(() => {
    return ACTION_ZONES.map((zone) => ({
      ...zone,
      items: zone.items.map((item) => {
        if (item.tab === 'onay_islemleri' && operasyonOzeti.bekleyenOnay > 0) {
          return { ...item, badge: operasyonOzeti.bekleyenOnay, highlight: true };
        }
        if (item.tab === 'satin_alma') {
          const pending = (satinAlmaTalepleri || []).filter(
            (sa) =>
              sa.onayDurumu === 'ONAY BEKLİYOR' ||
              sa.onayDurumu === 'BEKLİYOR' ||
              String(sa.onayDurumu || '').includes('BEKLİYOR')
          ).length;
          if (pending > 0) return { ...item, badge: pending };
        }
        return item;
      }),
    }));
  }, [operasyonOzeti.bekleyenOnay, satinAlmaTalepleri]);

  const primaryShortcuts = [
    { tab: 'yoklama', label: 'Yoklama', icon: ClipboardList },
    { tab: 'onay_islemleri', label: 'Onay', icon: ShieldCheck, badge: operasyonOzeti.bekleyenOnay },
    { tab: 'personel_kartlari', label: 'Personel Kartları', icon: UserCircle },
    { tab: 'satin_alma', label: 'Satın Alma', icon: ShoppingCart },
    { tab: 'kamp', label: 'Kamp', icon: Tent },
  ];

  return (
    <div className="flex-grow min-h-full overflow-y-auto bg-gradient-to-b from-[#FFFBF7] via-white to-orange-50/20">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-5 animate-slideUp">

        {(dataStillHydrating || !panelsReady) && (
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              {dataStillHydrating ? 'Canlı veriler yükleniyor…' : 'Paneller hazırlanıyor…'}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer"
            >
              Yenile
            </button>
          </div>
        )}

        {/* Hero — kompakt + hızlı kısayollar */}
        <section className="relative overflow-hidden rounded-2xl border border-orange-100/80 bg-white shadow-sm">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(251,191,36,0.1),transparent_55%)]" />
          <div className="relative z-10 p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-5">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 p-3 border border-orange-100/60 shrink-0">
                  <KibritciLogo size="lg" className="h-11 sm:h-12" />
        </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-orange-700 bg-orange-50 border border-orange-200/60 px-2 py-0.5 rounded-full">
                      <Sparkles size={10} /> {getGreeting()}, {userLabel}
                  </span>
                    {unreadNotifs > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                        <Bell size={10} /> {unreadNotifs}
                  </span>
                    )}
                </div>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Şantiye Yönetim Merkezi
                  </h1>
                  <p className="text-[11px] text-slate-500 capitalize mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={11} className="text-orange-500" /> Gebze
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} className="text-orange-500" /> {KIBRITCI_COMPANY.shortName}
                    </span>
                    <span>{todayLabel}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {primaryShortcuts.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.tab}
                      type="button"
                      onClick={() => onNavigate(s.tab)}
                      className="relative inline-flex items-center gap-1.5 bg-white hover:bg-orange-50 border border-orange-200/70 text-slate-800 font-bold text-[11px] px-3.5 py-2 rounded-xl transition cursor-pointer shadow-sm"
                    >
                      <Icon size={14} className="text-orange-600" />
                      {s.label}
                      {s.badge != null && s.badge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                          {s.badge > 99 ? '99+' : s.badge}
                </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <DashboardFavoriteTabsStrip onNavigate={onNavigate} />

        {/* KPI — tıklanabilir */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <button
                key={kpi.title}
                type="button"
                onClick={() => onNavigate(kpi.tab)}
                className={`text-left rounded-2xl bg-white border p-4 shadow-sm ring-1 ${kpi.ring} hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer ${
                  kpi.highlight ? 'border-amber-200' : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.title}</p>
                    <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                      {kpi.value}
                      <span className="text-sm font-semibold text-slate-400 ml-0.5">{kpi.unit}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1 font-medium">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-xl ${kpi.iconBg}`}>
                    <Icon size={17} strokeWidth={2.2} />
                  </div>
                </div>
              </button>
            );
          })}
              </div>

        <DashboardGunlukYoklamaGorev
          personeller={personeller}
          yoklamalar={yoklamalar}
          kasaHareketleri={kasaHareketleri}
          onNavigate={onNavigate}
        />

        {/* Ana grid: işler + akış */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7 space-y-5">
            <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <LayoutGrid size={16} className="text-orange-500" />
                <h2 className="font-display font-bold text-sm text-slate-900">Modüller</h2>
              </div>
              <div className="space-y-4">
                {actionZonesWithBadges.map((zone) => (
                  <div key={zone.title}>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      {zone.title}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {zone.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.tab}
                            type="button"
                            onClick={() => onNavigate(item.tab)}
                            className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-sm cursor-pointer ${
                              item.highlight
                                ? 'bg-amber-50/80 border-amber-200 hover:border-amber-300'
                                : 'bg-slate-50/50 border-slate-100 hover:border-orange-200 hover:bg-orange-50/30'
                            }`}
                          >
                            <span className="w-9 h-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0 text-orange-600">
                              <Icon size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12px] font-bold text-slate-900">{item.label}</span>
                              <span className="block text-[10px] text-slate-500 truncate">{item.desc}</span>
                            </span>
                            {item.badge != null && item.badge > 0 && (
                              <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                                {item.badge}
                              </span>
                            )}
                            <ChevronRight size={14} className="text-slate-300 shrink-0" />
                          </button>
                        );
                      })}
                      </div>
                      </div>
                    ))}
              </div>
            </section>

            <DashboardPeriodSummary
              personeller={personeller}
              satinAlmaTalepleri={satinAlmaTalepleri}
              kasaHareketleri={kasaHareketleri}
              yoklamalar={yoklamalar}
              bildirimler={bildirimler}
              onNavigate={onNavigate}
            />
          </div>
          
          <div className="xl:col-span-5">
            <DashboardSonIslemlerFeed
              kasaHareketleri={kasaHareketleri}
              satinAlmaTalepleri={satinAlmaTalepleri}
              bildirimler={bildirimler}
              onNavigate={onNavigate}
            />

            <section className="mt-5 rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={15} className="text-orange-500" />
                <h3 className="font-display font-bold text-sm text-slate-900">Hızlı Evrak</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { tab: 'irsaliye_giris', label: 'İrsaliye' },
                  { tab: 'fatura_giris', label: 'Fatura' },
                  { tab: 'cari_stok', label: 'Cari / Stok' },
                  { tab: 'personel_izin', label: 'İzin Formu' },
                ].map((link) => (
            <button 
                    key={link.tab}
                    type="button"
                    onClick={() => onNavigate(link.tab)}
                    className="text-[11px] font-bold px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-orange-50 hover:border-orange-200 text-slate-700 transition cursor-pointer"
                  >
                    {link.label}
            </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <DashboardKampOdaPanel
          kampOdalari={kampOdalari}
          kampKayitlari={kampKayitlari}
          personeller={personeller}
          onNavigate={onNavigate}
        />

        <footer className="text-center text-[10px] text-slate-400 pb-4 pt-1">
          {KIBRITCI_COMPANY.shortName} · ERP v2 · {KIBRITCI_COMPANY.web}
        </footer>
      </div>
    </div>
  );
};

export default DashboardScreen;
