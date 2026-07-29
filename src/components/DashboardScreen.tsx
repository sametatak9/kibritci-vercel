import React, { useEffect, useMemo, useState, startTransition } from 'react';
import { 
  Users, Wallet, ShoppingCart, Truck, RefreshCw, 
  FileText, BarChart, ArrowUpRight, ArrowDownRight, Compass, Settings,
  Search, ClipboardList, Briefcase, CalendarCheck2, ChevronRight, AlertTriangle, Tent,
  MapPin, Sun, HelpCircle, Activity, ArrowRight, BookOpen, Plus, TrendingUp, CreditCard, Link2
} from 'lucide-react';
import { Personel, KasaHareketi, SatinAlmaTalebi, AracBakim, AylikYoklamaMap, KampOdasi, KampKaydi } from '../types/erp';
import { KibritciLogo } from './KibritciLogo';
import { getKibritciLogoUrl } from '../lib/kibritciBrand';
import { listOdemeEngelleri } from '../lib/personelOdemeUtils';
import { DashboardPeriodSummary } from './DashboardPeriodSummary';
import { DashboardFavoriteTabsStrip } from './DashboardFavoriteTabsStrip';
import { DashboardSonIslemlerFeed } from './DashboardSonIslemlerFeed';
import { isPersonelActiveOnDate } from '../lib/guvenlikHelpers';
import { getYoklamaDay, isTaseronPersonel } from '../lib/yoklamaUtils';
import { buildOperasyonOzeti } from '../lib/operasyonUyarilari';
import { EKSIK_HALKA_LABEL, listEksikHalka, summarizeEksikHalka } from '../lib/eksikHalkaUtils';
import { summarizeTaseronKadro } from '../lib/taseronMevcudiyetUtils';
import type { Fatura, Irsaliye } from '../types/erp';

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
  dataReady = false
}) => {
  // Sticky notepad local state
  const [stickyNotes, setStickyNotes] = useState<string>(() => {
    return localStorage.getItem("kibritci_dashboard_notes") || 
      "📌 Şantiye Günlük Önemli Hatırlatmaları:\n- İş güvenliği ekipman kontrolleri (baret/yelek) sabah saha girişinde tam yapılacak.\n- Hazır beton döküm mikser saatleri şantiye mühendisiyle eşleştirilecek.\n- B-Blok su kaçağı giderimi için sıhhi tesisat taşeronu çağırılacak.";
  });

  const handleNotesChange = (val: string) => {
    setStickyNotes(val);
    localStorage.setItem("kibritci_dashboard_notes", val);
  };

  // Camp occupancy stats
  const totalRooms = kampOdalari.length;
  const totalBeds = kampOdalari.reduce((sum, r) => sum + r.kapasite, 0);
  const occupiedBeds = kampKayitlari.filter(cr => cr.durum === 'AKTIF').length;
  const fillRatio = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  // Aktif kadro: durum aktif + bugün itibarıyla işten çıkış tarihi geçmemiş (işten çıkanlar sayılmaz)
  const totalPersonel = personeller.length;
  const bugun = new Date().toISOString().split('T')[0];
  const isAktifKadro = (p: Personel) =>
    (p.durum === true || String(p.durum) === 'true') && isPersonelActiveOnDate(p, bugun);
  const aktifKadro = personeller.filter(isAktifKadro);
  const activePersonelCount = aktifKadro.length;
  const anaFirmaActiveCount = aktifKadro.filter((p) => !isTaseronPersonel(p)).length;
  const taseronActiveCount = aktifKadro.filter((p) => isTaseronPersonel(p)).length;

  // Ağır paneller ilk boyamadan sonra (UI donmasın)
  const [panelsReady, setPanelsReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => {
      startTransition(() => setPanelsReady(true));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Puantaj: yalnızca içinde bulunulan ay (tüm geçmişi tarama)
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

  // Calculate pending manager approvals
  const pendingStokKartCount = (stokKartlar || []).filter((s: any) => s.durum === 'ONAY BEKLİYOR').length;
  const operasyonOzeti = useMemo(
    () =>
      panelsReady
        ? buildOperasyonOzeti({
            satinAlmaTalepleri,
            irsaliyeler,
            faturalar,
            stokKartlar,
            kampOdalari,
            kampKayitlari,
          })
        : {
            bekleyenOnay: 0,
            gecikenOnay: 0,
            bekleyenSatinAlma: 0,
            kampUyarilari: [],
            faturasizIrsaliye: 0,
            faturasizEski: 0,
          },
    [panelsReady, satinAlmaTalepleri, irsaliyeler, faturalar, stokKartlar, kampOdalari, kampKayitlari]
  );
  const eksikHalkaRows = useMemo(
    () =>
      panelsReady
        ? listEksikHalka({ satinAlmaTalepleri, irsaliyeler, faturalar, limit: 60 })
        : [],
    [panelsReady, satinAlmaTalepleri, irsaliyeler, faturalar]
  );
  const eksikHalkaOzet = useMemo(() => summarizeEksikHalka(eksikHalkaRows), [eksikHalkaRows]);
  const taseronKadro = useMemo(
    () =>
      panelsReady
        ? summarizeTaseronKadro(personeller, bugun)
        : { aktifKadro: 0, firmaSayisi: 0, byFirma: [] },
    [panelsReady, personeller, bugun]
  );
  const pendingSatinAlmaCount = operasyonOzeti.bekleyenSatinAlma;
  const totalPendingApprovals = operasyonOzeti.bekleyenOnay;
  // Boş koleksiyon geçerli bir sonuçtur. Hazır olmayı dizi uzunluğundan değil,
  // Firestore'un ilk snapshot'larının tamamlanmasından belirle.
  const dataStillHydrating = !dataReady;

  // Personnel selection state for tracing history
  const [selectedPersonelId, setSelectedPersonelId] = useState<string>('');
  
  // Find selected individual structure
  const currentSelectedIndividual = personeller.find(p => p.id === selectedPersonelId);
  
  // Dynamic statistics trace helper
  const getIndividualTraceHistory = (pId: string) => {
    if (!pId) return null;
    const p = personeller.find(item => item.id === pId);
    if (!p) return null;

    const fullName = `${p.ad} ${p.soyad}`.toLowerCase().trim();

    // 1. Yoklama (Attendance count)
    const AttendanceSummary = {
      geldi: 0,
      yok: 0,
      izinli: 0,
      raporlu: 0,
    };
    const pYoklama = yoklamalar[pId] || {};
    Object.values(pYoklama).forEach((day: any) => {
      if (day?.durum === 'Geldi') AttendanceSummary.geldi++;
      if (day?.durum === 'Yok') AttendanceSummary.yok++;
      if (day?.durum === 'İzinli') AttendanceSummary.izinli++;
      if (day?.durum === 'Raporlu') AttendanceSummary.raporlu++;
    });

    // 2. Vehicles allocated or driven
    const matchedVehicles = araclar.filter(a => a.sorumluPersonelId === pId);
    const matchedKmLogs = aracKmLoglari.filter(log => 
      String(log.surucu || '').toLowerCase().trim() === fullName || 
      String(log.personelId || '') === pId
    );

    // 3. Purchase orders requested
    const matchedPurchases = satinAlmaTalepleri.filter(sa => 
      String(sa.talepEden || '').toLowerCase().trim() === fullName
    );

    return {
      person: p,
      attendance: AttendanceSummary,
      vehicles: matchedVehicles,
      kmLogs: matchedKmLogs,
      purchases: matchedPurchases
    };
  };

  const traceData = getIndividualTraceHistory(selectedPersonelId);
  const odemeEngelleri = useMemo(() => listOdemeEngelleri(personeller), [personeller]);

  // Stats Card Arrays
  const stats = [
    {
      title: "Aktif Kadro (Personel)",
      value: `${activePersonelCount} Kişi`,
      color: "text-blue-600",
      iconBg: "bg-blue-50 text-blue-600 border-blue-100",
      icon: Users,
      trend: `Ana Firma: ${anaFirmaActiveCount} | Taşeron: ${taseronActiveCount}`,
      trendColor: "text-slate-600 font-semibold"
    },
    {
      title: "Lojman Doluluk Oranı",
      value: `%${fillRatio}`,
      color: "text-emerald-600",
      iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100",
      icon: Compass,
      trend: `${occupiedBeds} / ${totalBeds} Yatak Dolu`,
      trendColor: "text-emerald-600 font-semibold"
    },
    {
      title: "Puantaj Katılım Oranı",
      value: `%${attendanceRate}`,
      color: "text-rose-600",
      iconBg: "bg-rose-50 text-rose-600 border-rose-100",
      icon: CalendarCheck2,
      trend: "Aylık Ortalama Katılım",
      trendColor: "text-rose-600 font-semibold"
    },
    {
      title: "Bekleyen Onay Talepleri",
      value: `${totalPendingApprovals} Adet`,
      color: "text-amber-600",
      iconBg: "bg-amber-50 text-amber-600 border-amber-100",
      icon: ClipboardList,
      trend: "Yönetici Kararı Bekleyen",
      trendColor: "text-amber-600 font-semibold"
    }
  ];

  return (
    <div className="flex-grow p-6 space-y-6 overflow-y-auto h-full font-sans bg-slate-55 animate-slideUp">
      {(dataStillHydrating || !panelsReady) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-900 text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {dataStillHydrating
              ? 'Canlı veriler hâlâ yükleniyor — özet kartları az sonra dolacak.'
              : 'Operasyon panelleri hazırlanıyor…'}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-900 cursor-pointer hover:bg-amber-100"
          >
            Sayfayı yenile
          </button>
        </div>
      )}
      
      {/* Welcome Banner with Corporate Design */}
      <div className="flex flex-col bg-gradient-to-r from-slate-950 via-[#1e293b] to-slate-950 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden border border-slate-800 gap-6 gradient-border-accent">
        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-600 rounded-full mix-blend-screen filter blur-[90px] opacity-10 -translate-y-20 translate-x-10 pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-rose-600 rounded-full mix-blend-screen filter blur-[70px] opacity-5 translate-y-10 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center relative z-10 gap-4">
          <div className="flex items-center space-x-4">
            <div className="bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
              <KibritciLogo size="lg" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="bg-blue-500/20 text-blue-300 text-[9px] font-black tracking-widest px-2.5 py-0.5 rounded-full border border-blue-500/30 uppercase block w-fit">
                  BULUT YÖNETSEL ÖZET PANELİ
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-black tracking-widest px-2.5 py-0.5 rounded-full border border-emerald-500/30 uppercase block w-fit">
                  Realtime Aktif
                </span>
              </div>
              <h2 className="font-display font-black text-2xl tracking-tight text-white">
                Şantiye Kontrol &amp; Raporlama Merkezi
              </h2>
              <p className="text-[11px] text-slate-350 max-w-xl leading-relaxed">
                Google Cloud Firestore NoSQL canlı veritabanı aktif durumdadır. Personel, puantaj, satın alma talepleri ve hakediş harcamaları anlık senkronizedir.
              </p>
            </div>
          </div>
          
          <div className="flex space-x-2 shrink-0 w-full md:w-auto">
            <button 
              onClick={() => onNavigate("satin_alma")} 
              className="flex-1 md:flex-none bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-lg cursor-pointer flex items-center justify-center space-x-1"
            >
              <Plus size={14} className="stroke-[3]" />
              <span>Yeni Satın Alma Talebi</span>
            </button>
            <button 
              onClick={() => onNavigate("personel")} 
              className="flex-1 md:flex-none bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 font-bold text-xs px-5 py-3 rounded-xl transition shadow cursor-pointer flex items-center justify-center"
            >
              Personel Düzenle
            </button>
          </div>
        </div>

        {/* Live Operational Ticker Band */}
        <div className="relative z-10 flex flex-wrap items-center gap-y-2 gap-x-6 pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center space-x-1.5">
            <MapPin size={12} className="text-rose-500" />
            <span>Gebze Şantiyesi Merkez Ofisi</span>
          </div>
          <span className="hidden sm:inline text-slate-700">|</span>
          <div className="flex items-center space-x-1.5">
            <Sun size={12} className="text-amber-500 animate-spin-slow" />
            <span>29°C Açık Hava (Açık saha çalışmaları aktif)</span>
          </div>
          <span className="hidden md:inline text-slate-700">|</span>
          <div className="flex items-center space-x-3 ml-auto">
            <span className="text-slate-500">Satın Alma Döviz Takip:</span>
            <span className="text-slate-300">USD: <strong className="text-emerald-455">32.84 TL</strong></span>
            <span className="text-slate-350">EUR: <strong className="text-emerald-455">35.15 TL</strong></span>
            <span className="text-slate-350">ALTIN: <strong className="text-amber-400">2,540 TL</strong></span>
          </div>
        </div>
      </div>

      {/* Favori kısayollar + dönem özeti + son işlemler — mevcut panellere ek */}
      <DashboardFavoriteTabsStrip onNavigate={onNavigate} />

      <DashboardPeriodSummary
        personeller={personeller}
        satinAlmaTalepleri={satinAlmaTalepleri}
        kasaHareketleri={kasaHareketleri}
        yoklamalar={yoklamalar}
        bildirimler={bildirimler}
        onNavigate={onNavigate}
      />

      <DashboardSonIslemlerFeed
        kasaHareketleri={kasaHareketleri}
        satinAlmaTalepleri={satinAlmaTalepleri}
        bildirimler={bildirimler}
        onNavigate={onNavigate}
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st, i) => {
          const Icon = st.icon;
          let glowClass = "hover-glow-blue";
          if (st.color.includes("emerald")) glowClass = "hover-glow-emerald";
          else if (st.color.includes("rose")) glowClass = "hover-glow-rose";
          else if (st.color.includes("amber")) glowClass = "hover-glow-amber";

          return (
            <div 
              key={i} 
              className={`p-5 rounded-3xl bg-white border border-slate-200 text-slate-800 shadow-premium-sm flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 ${glowClass}`}
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    {st.title}
                  </span>
                  <span className={`text-2xl font-black font-mono tracking-tight ${st.color}`}>
                    {st.value}
                  </span>
                </div>
                <div className={`p-3 rounded-2xl border ${st.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={20} className="stroke-[2.5]" />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-semibold">Canlı Durum:</span>
                <span className={st.trendColor}>{st.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Operasyon uyarı şeridi — salt okunur, mevcut akışa dokunmaz */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-900 text-amber-300 shrink-0">
              <Activity size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Operasyon Uyarıları
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Geciken onay, faturasız irsaliye ve kamp doluluk — tıklayınca ilgili sekmeye gider.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onNavigate('onay_islemleri')}
            className="text-left rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3 cursor-pointer transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Bekleyen onay</span>
            <span className="text-lg font-black tabular-nums text-slate-900">{operasyonOzeti.bekleyenOnay}</span>
            {operasyonOzeti.gecikenOnay > 0 && (
              <span className="ml-2 text-[10px] font-bold text-amber-700">· {operasyonOzeti.gecikenOnay} gecikmiş (48s+)</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('irsaliye_giris')}
            className="text-left rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3 cursor-pointer transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Faturasız irsaliye</span>
            <span className="text-lg font-black tabular-nums text-slate-900">{operasyonOzeti.faturasizIrsaliye}</span>
            {operasyonOzeti.faturasizEski > 0 && (
              <span className="ml-2 text-[10px] font-bold text-rose-700">· {operasyonOzeti.faturasizEski} adet ≥3 gün</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('kamp')}
            className="text-left rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3 cursor-pointer transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Kamp uyarı</span>
            <span className="text-lg font-black tabular-nums text-slate-900">{operasyonOzeti.kampUyarilari.length}</span>
            <span className="ml-2 text-[10px] text-slate-500 font-semibold">doluluk / oda</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('satin_alma')}
            className="text-left rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3 cursor-pointer transition"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Bekleyen SA</span>
            <span className="text-lg font-black tabular-nums text-slate-900">{operasyonOzeti.bekleyenSatinAlma}</span>
            {pendingStokKartCount > 0 && (
              <span className="ml-2 text-[10px] font-bold text-slate-600">· {pendingStokKartCount} stok kartı</span>
            )}
          </button>
        </div>
        {operasyonOzeti.kampUyarilari.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {operasyonOzeti.kampUyarilari.slice(0, 4).map((u, i) => (
              <span
                key={`${u.tip}_${i}`}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                  u.seviye === 'critical'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : u.seviye === 'warn'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {u.baslik}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Eksik halka — SA ↔ irsaliye ↔ fatura (salt okunur mutabakat) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 shrink-0">
              <Link2 size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Evrak Eksik Halka
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Satın alma → irsaliye → fatura zincirinde kopuk kayıtlar (salt okunur).
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full">
            {eksikHalkaOzet.toplam} kayıt
          </span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {(
            [
              ['SA_IRSALIYESIZ', 'satin_alma'],
              ['IRSALIYE_SA_SIZ', 'irsaliye_giris'],
              ['IRSALIYE_FATURASIZ', 'irsaliye_giris'],
              ['FATURA_IRSALIYESIZ', 'fatura_giris'],
            ] as const
          ).map(([tip, tab]) => (
            <button
              key={tip}
              type="button"
              onClick={() => onNavigate(tab)}
              className="text-left rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3 cursor-pointer transition"
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                {EKSIK_HALKA_LABEL[tip]}
              </span>
              <span className="text-lg font-black tabular-nums text-slate-900">
                {eksikHalkaOzet[tip]}
              </span>
            </button>
          ))}
        </div>
        {eksikHalkaRows.length > 0 ? (
          <div className="overflow-x-auto max-h-[220px] rounded-2xl border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold sticky top-0">
                <tr>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">Kod</th>
                  <th className="px-3 py-2">Firma</th>
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2">Detay</th>
                </tr>
              </thead>
              <tbody>
                {eksikHalkaRows.slice(0, 40).map((r) => (
                  <tr
                    key={`${r.tip}_${r.id}`}
                    className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer"
                    onClick={() => onNavigate(r.navigateTab)}
                  >
                    <td className="px-3 py-2 font-bold text-indigo-800 whitespace-nowrap">
                      {EKSIK_HALKA_LABEL[r.tip]}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-800">{r.kod}</td>
                    <td className="px-3 py-2 text-slate-700">{r.firma}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.tarih || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.detay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 font-semibold">
            Görünür eksik halka yok — zincir şu an tutarlı görünüyor.
          </p>
        )}
      </div>

      {/* Taşeron kadro — günlük yoklama alınmaz; firma listesi aralıklı güncellenir */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 shrink-0">
            <Briefcase size={16} className="stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-wider">
              Taşeron personel listesi
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Günlük yoklama alınmaz. Firmalardan gelen listeyi aralıklı güncelleyin —{' '}
              <span className="font-bold text-slate-700 tabular-nums">
                {taseronKadro.aktifKadro} kişi
              </span>
              {' · '}
              <span className="font-bold text-slate-700 tabular-nums">
                {taseronKadro.firmaSayisi} firma
              </span>
            </p>
            {taseronKadro.byFirma.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1 truncate">
                {taseronKadro.byFirma
                  .slice(0, 8)
                  .map((f) => `${f.firma} (${f.aktifKadro})`)
                  .join(' · ')}
                {taseronKadro.byFirma.length > 8
                  ? ` · +${taseronKadro.byFirma.length - 8} firma`
                  : ''}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('personel')}
          className="text-[10px] font-bold px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 cursor-pointer shrink-0"
        >
          Listeyi güncelle
        </button>
      </div>

      {/* Ödeme Engeli Paneli — maaş günü öncesi */}
      <div className="bg-white border border-rose-200 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 shrink-0">
              <CreditCard size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Ödeme Engeli — Eksik TC / IBAN / SGK
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Aktif ana firma personeli. Maaş gününden önce tamamlanması gereken kayıtlar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                odemeEngelleri.length === 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {odemeEngelleri.length === 0 ? 'Engelsiz' : `${odemeEngelleri.length} personel`}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('personel')}
              className="text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            >
              Personele Git
            </button>
            <button
              type="button"
              onClick={() => onNavigate('maas_odeme')}
              className="text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-600 cursor-pointer"
            >
              Maaş Ödeme
            </button>
          </div>
        </div>

        {odemeEngelleri.length === 0 ? (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            Tüm aktif ana firma personelinin TC, IBAN ve SGK bilgileri ödeme için uygun görünüyor.
          </p>
        ) : (
          <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
            {odemeEngelleri.slice(0, 40).map(({ personel, engeller }) => (
              <div
                key={personel.id}
                className="flex items-center justify-between gap-2 bg-rose-50/60 border border-rose-100 rounded-xl px-3 py-2 text-[11px]"
              >
                <div className="min-w-0">
                  <span className="font-bold text-slate-800 block truncate">
                    {personel.ad} {personel.soyad}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono truncate block">
                    {personel.gorev || '—'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                  {engeller.map((e) => (
                    <span
                      key={e}
                      className="text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-white border border-rose-200 text-rose-700"
                    >
                      {e === 'SGK' ? 'SGK eksik' : `${e} eksik`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {odemeEngelleri.length > 40 && (
              <p className="text-[10px] text-slate-500 text-center pt-1">
                +{odemeEngelleri.length - 40} kişi daha — Personel ekranında &quot;Ödeme Engeli&quot; filtresini açın.
              </p>
            )}
            {odemeEngelleri.length > 0 && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('personel')}
                className="w-full mt-2 text-[10px] font-bold py-2 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 cursor-pointer hover:bg-rose-100"
              >
                Tümünü Personel ekranında göster
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions Hub (Hızlı Erişim Paneli) */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-1">HIZLI ERİŞİM VE İŞLEMLER</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div 
            onClick={() => onNavigate("yoklama")} 
            className="bg-white border border-slate-250 p-4 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-3.5 group"
          >
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 group-hover:scale-110 transition duration-200 shrink-0">
              <ClipboardList size={18} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition">Yoklama &amp; Puantaj Girişi</h5>
              <p className="text-[9.5px] text-slate-400 mt-0.5">Saha personelinin puantaj durumunu işle</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-slate-350 group-hover:translate-x-0.5 transition" />
          </div>

          <div 
            onClick={() => onNavigate("satin_alma")} 
            className="bg-white border border-slate-250 p-4 rounded-2xl hover:border-indigo-400 hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-3.5 group"
          >
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 group-hover:scale-110 transition duration-200 shrink-0">
              <ShoppingCart size={18} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition">Satın Alma İstemi Aç</h5>
              <p className="text-[9.5px] text-slate-400 mt-0.5">Şantiyeye yeni malzeme veya hizmet talep et</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-slate-350 group-hover:translate-x-0.5 transition" />
          </div>

          <div 
            onClick={() => onNavigate("kamp")} 
            className="bg-white border border-slate-250 p-4 rounded-2xl hover:border-emerald-400 hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-3.5 group"
          >
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 group-hover:scale-110 transition duration-200 shrink-0">
              <Tent size={18} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-800 group-hover:text-emerald-600 transition">Lojman &amp; Kamp Atama</h5>
              <p className="text-[9.5px] text-slate-400 mt-0.5">Personeli uygun odalara ve yataklara yerleştir</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-slate-350 group-hover:translate-x-0.5 transition" />
          </div>

          <div 
            onClick={() => onNavigate("kasa")} 
            className="bg-white border border-slate-250 p-4 rounded-2xl hover:border-amber-500 hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-3.5 group"
          >
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 group-hover:scale-110 transition duration-200 shrink-0">
              <Wallet size={18} />
            </div>
            <div>
              <h5 className="text-xs font-bold text-slate-800 group-hover:text-amber-600 transition">Haftalık Kasa Yönetimi</h5>
              <p className="text-[9.5px] text-slate-400 mt-0.5">Şantiye nakit giriş-çıkış evraklarını işle</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-slate-350 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </div>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Attendance Progress Card */}
        <div className="bg-white border border-slate-200/85 text-slate-800 rounded-3xl p-5 shadow-xs space-y-4 hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-850 text-xs uppercase tracking-wider">Puantaj Katılım Durumu</h3>
            <CalendarCheck2 size={16} className="text-rose-500" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>Genel Katılım</span>
              <span className="text-slate-800 font-mono">% {attendanceRate}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/40">
              <div 
                className="bg-gradient-to-r from-rose-400 to-[#8B1E1E] h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${Math.max(0, Math.min(100, attendanceRate))}%` }} 
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
            Bu ayki yoklama verilerine göre personelin sahada bulunma oranını gösterir.
          </p>
        </div>

        {/* Camp Occupancy Card */}
        <div className="bg-white border border-slate-200/85 text-slate-800 rounded-3xl p-5 shadow-xs space-y-4 hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-850 text-xs uppercase tracking-wider">Kamp & Lojman Doluluğu</h3>
            <Tent size={16} className="text-emerald-500" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>Dolu Yatak</span>
              <span className="text-slate-800 font-mono">{occupiedBeds} / {totalBeds} Yatak</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/40">
              <div 
                className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${Math.max(0, Math.min(100, fillRatio))}%` }} 
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
            Kamp alanındaki aktif konaklama oranını ve kullanılabilir kapasiteyi gösterir.
          </p>
        </div>

        {/* Personnel Status Card */}
        <div className="bg-white border border-slate-200/85 text-slate-800 rounded-3xl p-5 shadow-xs space-y-4 hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-850 text-xs uppercase tracking-wider">Kadro Aktivasyon Durumu</h3>
            <Users size={16} className="text-blue-500" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>Aktif Çalışanlar</span>
              <span className="text-slate-800 font-mono">{activePersonelCount} / {totalPersonel} Kişi</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/40">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${totalPersonel > 0 ? Math.round((activePersonelCount / totalPersonel) * 100) : 0}%` }} 
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
            Sisteme kayıtlı toplam personel ile şu anda aktif çalışan personelin oranını gösterir.
          </p>
        </div>
      </div>

      {/* 📘 Şantiye Hızlı Kılavuz & Sistem Rehberi */}
      <div className="bg-white border border-slate-250 text-slate-800 rounded-3xl p-6 shadow-xs space-y-4 relative overflow-hidden bg-gradient-to-r from-slate-50/20 to-transparent hover:shadow-md transition duration-200">
        <div className="absolute right-0 top-0 w-32 h-32 bg-slate-105 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -translate-y-10 translate-x-10" />
        <div className="space-y-1">
          <span className="bg-slate-100 text-slate-500 text-[9px] font-black tracking-wider px-2.5 py-0.5 rounded-full border border-slate-200 uppercase">
            EĞİTİM &amp; PRATİK KULLANIM REHBERLERİ
          </span>
          <h3 className="font-display font-black text-slate-900 text-sm tracking-tight pt-1">
            📘 Kibritçi ERP Şantiye Kullanım Kılavuzu
          </h3>
          <p className="text-[11px] text-slate-500 max-w-2xl leading-relaxed font-semibold">
            Aşağıdaki kartlar şantiyede sıkça yapılan operasyonların nasıl yürütüleceğini açıklar. İlgili modüle hızlıca gitmek için kılavuz başlıklarına tıklayabilirsiniz.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div 
            onClick={() => onNavigate("yoklama")} 
            className="p-3.5 rounded-2xl bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-blue-600 font-bold text-xs">
              <span className="group-hover:underline">1. Yoklama &amp; Puantaj</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition" />
            </div>
            <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
              Her sabah çalışanların şantiye durumlarını girin. AI ile yoklama kağıdının fotoğrafını çekip otomatik sisteme yükleyebilirsiniz.
            </p>
          </div>

          <div 
            onClick={() => onNavigate("satin_alma")} 
            className="p-3.5 rounded-2xl bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-amber-600 font-bold text-xs">
              <span className="group-hover:underline">2. Satın Alma Talebi</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition" />
            </div>
            <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
              Şantiyeye gerekli olan malzeme veya hizmet taleplerini oluşturun. Talebiniz yöneticinin Onay Havuzuna düşer.
            </p>
          </div>

          <div 
            onClick={() => onNavigate("kamp")} 
            className="p-3.5 rounded-2xl bg-white hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-emerald-600 font-bold text-xs">
              <span className="group-hover:underline">3. Lojman &amp; Kamp</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition" />
            </div>
            <p className="text-[10px] text-slate-455 leading-relaxed font-semibold">
              Kamp Yönetimi altından yatak atamalarını yapın. Personelin lojmana giriş-çıkış tarihlerini canlı takip edebilirsiniz.
            </p>
          </div>

          <div 
            onClick={() => onNavigate("arac")} 
            className="p-3.5 rounded-2xl bg-white hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-indigo-600 font-bold text-xs">
              <span className="group-hover:underline">4. Şoför &amp; Araç KM</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition" />
            </div>
            <p className="text-[10px] text-slate-455 leading-relaxed font-semibold">
              Şoförlerin sabah/akşam KM seyrini girin. Muayene ve yağ bakımı sayaçlarını araç panelinden sürekli izleyin.
            </p>
          </div>
        </div>
      </div>

      {/* 2 Cols: Main Graphics + Personel Trace Widget */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Grafik ve Puantaj */}
        <div className="bg-white border border-slate-250 rounded-3xl text-slate-800 p-5 shadow-xs space-y-4 xl:col-span-2 hover:shadow-md transition duration-200">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <BarChart size={16} className="text-blue-600" />
              <h3 className="font-display font-black text-slate-800 uppercase text-xs tracking-wider">
                Aylık Puantaj ve Mesai Oran Analizi
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Dinamik 30 Gün</span>
          </div>

          <div className="h-44 w-full flex items-end justify-between px-2 pt-4 relative">
            <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none pb-4">
              <div className="border-b border-slate-100 w-full" />
              <div className="border-b border-slate-100 w-full" />
              <div className="border-b border-slate-100 w-full" />
              <div className="border-b border-slate-200 w-full" />
            </div>

            {[
              { label: "01 Haz", height: "h-20", value: "3", fill: "bg-gradient-to-t from-slate-200 to-slate-400" },
              { label: "05 Haz", height: "h-28", value: "5", fill: "bg-gradient-to-t from-blue-600 to-indigo-500" },
              { label: "10 Haz", height: "h-14", value: "2", fill: "bg-gradient-to-t from-rose-500 to-[#8B1E1E]" },
              { label: "15 Haz", height: "h-36", value: "8", fill: "bg-gradient-to-t from-emerald-500 to-emerald-400" },
              { label: "20 Haz", height: "h-28", value: "6", fill: "bg-gradient-to-t from-blue-600 to-indigo-500" },
              { label: "25 Haz", height: "h-32", value: "7", fill: "bg-gradient-to-t from-slate-300 to-slate-500" },
              { label: "30 Haz", height: "h-40", value: "9", fill: "bg-gradient-to-t from-blue-800 to-slate-900" },
            ].map((bar, idx) => (
              <div key={idx} className="flex flex-col items-center space-y-2 group relative z-10 w-12">
                <div className="opacity-0 group-hover:opacity-100 absolute -top-6 bg-slate-900 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow transition-opacity select-none z-20">
                  {bar.value} Sa/Pers
                </div>
                <div className={`${bar.height} w-6 ${bar.fill} rounded-t-sm shadow-sm group-hover:brightness-105 transition-all duration-300`} />
                <span className="text-[9px] text-slate-400 font-semibold font-mono tracking-tight">
                  {bar.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-3 border-t border-slate-100 font-sans">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                <span className="font-semibold text-slate-500">Normal Mesailer</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B1E1E] inline-block" />
                <span className="font-semibold text-slate-500">Haftalık Tatili</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="font-semibold text-slate-500">Hakediş Günü</span>
              </span>
            </div>
            <span className="font-mono text-slate-400 font-semibold">Günlük Verim İncelemesi</span>
          </div>
        </div>

        {/* Right 1 Col: Dynamic Personnel History Finder */}
        <div className="bg-white border border-slate-250 rounded-3xl text-slate-800 p-5 shadow-xs flex flex-col space-y-4 hover:shadow-md transition duration-200">
          <div className="border-b border-slate-100 pb-3 flex items-center space-x-2">
            <ClipboardList size={16} className="text-blue-600" />
            <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider">
              Personel İşlem Geçmişi Sorgula
            </h3>
          </div>

          {/* Selector Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">PERSONEL SEÇİNİZ</label>
            <div className="relative">
              <select
                value={selectedPersonelId}
                onChange={(e) => setSelectedPersonelId(e.target.value)}
                className="w-full bg-slate-55 border border-slate-200 text-xs rounded-xl p-2.5 font-semibold text-slate-700 outline-none focus:border-blue-500 transition cursor-pointer animate-fade-in"
              >
                <option value="">-- Personel Seçin --</option>
                {personeller.map(p => (
                  <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected Personnel Tracing Summary */}
          {!selectedPersonelId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Users size={30} className="stroke-[1.5] text-slate-400" />
              <p className="text-[11px] leading-relaxed font-semibold text-slate-450">
                Şantiyedeki bir personeli seçerek araç sevklerini, puantaj kaydını, satın alma taleplerini ve zimmet dosya geçmişini anında listeleyin.
              </p>
            </div>
          ) : (
            <div className="flex-grow space-y-4 max-h-[300px] overflow-y-auto pr-1">
              
              {/* Individual Base Info */}
              <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold font-display text-xs">
                  {traceData?.person.ad[0]}{traceData?.person.soyad[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 truncate">{traceData?.person.ad} {traceData?.person.soyad}</p>
                  <p className="text-[10px] text-slate-400 font-semibold truncate">{traceData?.person.gorev} · {traceData?.person.departman}</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  traceData?.person.durum ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                }`}>
                  {traceData?.person.durum ? 'AKTİF KADRO' : 'AYRILMIŞ'}
                </span>
              </div>

              {/* Attendance Counts */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Yoklama / Puantaj Karnesi</span>
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                  <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg border border-emerald-100">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.geldi}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">Geldi</span>
                  </div>
                  <div className="bg-rose-50 text-rose-600 p-1.5 rounded-lg border border-rose-100">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.yok}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">Yok</span>
                  </div>
                  <div className="bg-amber-50 text-amber-600 p-1.5 rounded-lg border border-amber-100">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.izinli}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">İzin</span>
                  </div>
                  <div className="bg-slate-100 text-slate-700 p-1.5 rounded-lg border border-slate-200">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.raporlu}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">Rapor</span>
                  </div>
                </div>
              </div>

              {/* Allocated Vehicles */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Sorumlu Olduğu Araçlar</span>
                {traceData?.vehicles.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Üzerine zimmetli araç bulunmuyor.</p>
                ) : (
                  <div className="space-y-1">
                    {traceData?.vehicles.map(v => (
                      <div key={v.id} className="p-2 border border-slate-200 bg-slate-50 rounded-lg flex justify-between items-center text-[10px]">
                        <span className="font-bold text-slate-700 bg-white border px-1.5 py-0.5 rounded font-mono">{v.plaka}</span>
                        <span className="text-slate-500 font-semibold">{v.markaModel}</span>
                        <span className="text-amber-600 font-bold font-mono">{v.mevcutKm} KM</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sefer / KM Seyahat Logu */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Seyrüsefer Km Seferleri ({traceData?.kmLogs.length})</span>
                {traceData?.kmLogs.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Şoförlük / seyahat kilometre kaydı bulunmamaktadır.</p>
                ) : (
                  <div className="space-y-1">
                    {traceData?.kmLogs.slice(0, 3).map((log, i) => (
                      <div key={i} className="p-2 border border-slate-200 bg-slate-50 rounded-lg text-[9px] flex justify-between items-center">
                        <span className="font-mono text-slate-400">{log.tarih}</span>
                        <span className="font-bold text-slate-700">{log.plaka}</span>
                        <span className="text-slate-500">Fark: <strong>{log.fark} KM</strong></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Satın Alma Talepleri */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Satın Alma Talepleri ({traceData?.purchases.length})</span>
                {traceData?.purchases.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Talep ettiği bir malzeme bulunmuyor.</p>
                ) : (
                  <div className="space-y-1">
                    {traceData?.purchases.slice(0, 3).map(sa => (
                      <div key={sa.id} className="p-2 border border-slate-200 bg-slate-50 rounded-lg text-[10px] flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-700 truncate max-w-[130px]">{sa.aciklama}</p>
                          <span className="font-mono text-[8px] text-slate-400">{sa.saId}</span>
                        </div>
                        <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">{sa.onayDurumu}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Robust Personal History Print and Download Option */}
              <button 
                type="button"
                onClick={() => {
                  const p = traceData?.person;
                  if (!p) return;
                  const heading = `Kibritci_Insaat_Personel_Islem_Gecmisi_${p.ad}_${p.soyad}`;
                  
                  const activeVehiclesHtml = traceData.vehicles.length === 0 
                    ? `<tr><td colspan="3" class="p-2.5 text-slate-400 italic text-center">Zimmetli araç bulunmuyor.</td></tr>`
                    : traceData.vehicles.map(v => `
                      <tr class="border-b text-slate-700">
                        <td class="p-2.5 font-bold">${v.plaka}</td>
                        <td class="p-2.5">${v.markaModel}</td>
                        <td class="p-2.5 font-mono text-amber-600 font-bold">${v.mevcutKm.toLocaleString('tr-TR')} KM</td>
                      </tr>
                    `).join('');

                  const kmLogsHtml = traceData.kmLogs.length === 0
                    ? `<tr><td colspan="3" class="p-2.5 text-slate-400 italic text-center">Kilometre sefer kaydı bulunamadı.</td></tr>`
                    : traceData.kmLogs.map(log => `
                      <tr class="border-b text-slate-700">
                        <td class="p-2.5 font-mono text-slate-400">${log.tarih}</td>
                        <td class="p-2.5 font-bold">${log.plaka}</td>
                        <td class="p-2.5 font-mono font-bold">${log.fark} KM</td>
                      </tr>
                    `).join('');

                  const purchasesHtml = traceData.purchases.length === 0
                    ? `<tr><td colspan="4" class="p-2.5 text-slate-400 italic text-center">Talep edilen malzeme bulunmuyor.</td></tr>`
                    : traceData.purchases.map(sa => `
                      <tr class="border-b text-slate-700">
                        <td class="p-2.5 font-mono text-xs font-bold">${sa.saId}</td>
                        <td class="p-2.5 font-bold">${sa.aciklama || 'Genel Şantiye Malzemesi'}</td>
                        <td class="p-2.5 font-mono text-slate-400">${sa.tarih}</td>
                        <td class="p-2.5"><span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${sa.onayDurumu}</span></td>
                      </tr>
                    `).join('');

                  const blob = new Blob([`
                    <html>
                      <head>
                        <meta charset="utf-8">
                        <title>Personel İşlem Geçmişi Raporu - ${p.ad} ${p.soyad}</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                      </head>
                      <body class="p-12 bg-white text-slate-800 font-sans">
                        <div class="max-w-4xl mx-auto space-y-8">
                          
                          <!-- Header -->
                          <div class="border-b-2 border-slate-900 pb-4 flex justify-between items-center">
                            <div class="flex items-center space-x-4">
                              <img src="${getKibritciLogoUrl()}" alt="Kibritçi İnşaat" style="height:48px;width:auto;object-fit:contain;background:transparent;" />
                              <div>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">İNSAN KAYNAKLARI VE ŞANTİYE GÜVENLİK REFAKAT ŞEFLİĞİ</p>
                              </div>
                            </div>
                            <div class="text-right text-xs">
                              <span class="border border-slate-900 text-[10px] font-bold px-3 py-1 bg-slate-50 uppercase tracking-widest block mb-1">KBR-PERS-DOC-${Date.now()}</span>
                              <span class="text-slate-400 font-mono text-[9px]">Oluşturulma: ${new Date().toLocaleDateString('tr-TR')}</span>
                            </div>
                          </div>

                          <!-- Title -->
                          <div class="text-center">
                            <h2 class="text-base font-bold text-slate-800 tracking-wider uppercase border-y border-slate-200 py-2.5 bg-slate-50">
                              PERSONEL SAHA GEÇMİŞİ VE PORTAL FAALİYET RAPORU
                            </h2>
                          </div>

                          <!-- Person Details Grid -->
                          <div class="grid grid-cols-2 gap-4 border p-4 rounded-xl bg-slate-50">
                            <div>
                              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PERSONEL ADI SOYADI</p>
                              <p class="text-sm font-black text-slate-900 mt-0.5">${p.ad} ${p.soyad}</p>
                            </div>
                            <div>
                              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">DEPARTMAN & GÖREV</p>
                              <p class="text-sm font-bold text-[#1E4E78] mt-0.5">${p.departman} / ${p.gorev}</p>
                            </div>
                            <div class="mt-2">
                              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TC KİMLİK NUMARASI</p>
                              <p class="text-xs font-mono font-bold text-slate-650 mt-0.5">${p.tcNo || 'Belirtilmedi'}</p>
                            </div>
                            <div class="mt-2">
                              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">FİİLİ ÇALIŞMA DURUMU</p>
                              <p class="text-xs font-bold text-emerald-600 mt-0.5">AKTİF ŞANTİYE WH-KADROSU</p>
                            </div>
                          </div>

                          <!-- Attendance History -->
                          <div class="space-y-2">
                            <h3 class="text-xs font-extrabold text-[#1E4E78] uppercase tracking-wider flex items-center gap-1.5">
                              📅 1. Yoklama ve Aylık Puantaj Cetveli Durumu
                            </h3>
                            <div class="grid grid-cols-4 gap-4 text-center text-xs font-bold">
                              <div class="bg-emerald-50 border border-emerald-150 text-emerald-800 p-3 rounded-xl">
                                <p class="text-base font-mono font-black">${traceData.attendance.geldi}</p>
                                <span class="text-[10px] text-slate-400 font-normal">Geldiği Gün</span>
                              </div>
                              <div class="bg-rose-50 border border-rose-150 text-rose-800 p-3 rounded-xl">
                                <p class="text-base font-mono font-black">${traceData.attendance.yok}</p>
                                <span class="text-[10px] text-slate-400 font-normal">Yok (Eksik) Gün</span>
                              </div>
                              <div class="bg-amber-50 border border-amber-150 text-amber-800 p-3 rounded-xl">
                                <p class="text-base font-mono font-black">${traceData.attendance.izinli}</p>
                                <span class="text-[10px] text-slate-400 font-normal">İzinli Gün</span>
                              </div>
                              <div class="bg-slate-50 border border-slate-200 text-slate-700 p-3 rounded-xl">
                                <p class="text-base font-mono font-black">${traceData.attendance.raporlu}</p>
                                <span class="text-[10px] text-slate-400 font-normal">Raporlu Gün</span>
                              </div>
                            </div>
                          </div>

                          <!-- Responsible Vehicles -->
                          <div class="space-y-2">
                            <h3 class="text-xs font-extrabold text-[#1E4E78] uppercase tracking-wider flex items-center gap-1.5">
                              🚗 2. Üzerine Zimmetli Şantiye Araç Demirbaşları
                            </h3>
                            <table class="w-full text-left text-xs text-slate-800 border">
                              <thead>
                                <tr class="bg-slate-50 border-b">
                                  <th class="p-2.5 text-left font-bold">Plaka</th>
                                  <th class="p-2.5 text-left font-bold">Marka & Model</th>
                                  <th class="p-2.5 text-left font-bold">Mevcut Kilometre</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${activeVehiclesHtml}
                              </tbody>
                            </table>
                          </div>

                          <!-- Km Sefer logs -->
                          <div class="space-y-2">
                            <h3 class="text-xs font-extrabold text-[#1E4E78] uppercase tracking-wider flex items-center gap-1.5">
                              📈 3. Sürüş ve Seyahat Kilometre Kayıtları (Son Seferler)
                            </h3>
                            <table class="w-full text-left text-xs text-slate-800 border">
                              <thead>
                                <tr class="bg-slate-50 border-b">
                                  <th class="p-2.5 text-left font-bold">Sefer Tarihi</th>
                                  <th class="p-2.5 text-left font-bold">Kullanılan Araç Plakası</th>
                                  <th class="p-2.5 text-left font-bold">Gidilen Yol Farkı</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${kmLogsHtml}
                              </tbody>
                            </table>
                          </div>

                          <!-- Purchases Request History -->
                          <div class="space-y-2">
                            <h3 class="text-xs font-extrabold text-[#1E4E78] uppercase tracking-wider flex items-center gap-1.5">
                              🛒 4. Görevliye Bağlı Satın Alma / Malzeme İstihkak Talepleri
                            </h3>
                            <table class="w-full text-left text-xs text-slate-800 border">
                              <thead>
                                <tr class="bg-slate-50 border-b">
                                  <th class="p-2.5 text-left font-bold">İşlem Kodu</th>
                                  <th class="p-2.5 text-left font-bold">Malzeme Açıklaması</th>
                                  <th class="p-2.5 text-left font-bold">Tarih</th>
                                  <th class="p-2.5 text-left font-bold">Durum</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${purchasesHtml}
                              </tbody>
                            </table>
                          </div>

                          <!-- Official approval sign bar -->
                          <div class="mt-12 text-xs">
                            <div class="bg-[#1E4E78] text-white p-2 text-[10px] font-bold uppercase tracking-wider mb-6 rounded-md">
                              📌 RESMİ ŞANTİYE REFAKAT VE PERSONEL SİCİL MUTABAKAT MERCİLERİ
                            </div>
                            <div class="grid grid-cols-4 gap-4 text-center text-slate-800">
                              
                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50">
                                <span class="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">1. MUHASEBE</span>
                                <span class="text-[10px] text-slate-400 block mb-6">Bordro Masası</span>
                                <div class="h-10 border-b border-dashed border-slate-300 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold block">Bordro Yetkilisi</span>
                              </div>

                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50">
                                <span class="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">2. İDARİ İŞLER</span>
                                <span class="text-[10px] text-slate-400 block mb-6">Şantiye Şefliği</span>
                                <div class="h-10 border-b border-dashed border-slate-300 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold block">İdari İşler Şefi</span>
                              </div>

                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50">
                                <span class="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">3. ŞANTİYE ŞEFİ</span>
                                <span class="text-[10px] text-slate-400 block mb-6">Fiili Saha Mühendisi</span>
                                <div class="h-10 border-b border-dashed border-slate-300 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold block">Şantiye Şefi</span>
                              </div>

                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50">
                                <span class="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">4. PROJE MÜDÜRÜ</span>
                                <span class="text-[10px] text-slate-400 block mb-6">Nihai Onaycı Müdür</span>
                                <div class="h-10 border-b border-dashed border-slate-300 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold block">Proje Müdürü</span>
                              </div>

                            </div>
                          </div>

                        </div>
                      </body>
                    </html>
                  `], { type: 'text/html' });

                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${heading}_Rapor.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                  alert(`${p.ad} ${p.soyad} personeline ait işlem ve refakat geçmişi detaylı hakediş raporu başarıyla masaüstünüze HTML olarak kaydedildi.`);
                }}
                className="w-full mt-3 bg-slate-800 hover:bg-slate-700 border border-slate-200 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1 transition shadow-xs cursor-pointer"
              >
                <span>💾 Personel Raporunu İndir</span>
              </button>

            </div>
          )}
        </div>
      </div>

      {/* 🏕️ DYNAMIC CAMP OCCUPANCY & 📝 NOTEPAD EXTRA WIDGETS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Camp occupancy progress */}
        <div className="bg-white border border-slate-250 rounded-3xl text-slate-800 p-5 shadow-xs space-y-4 hover:shadow-md transition duration-200">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h4 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              🏕️ Lojman &amp; Kamp Doluluk Raporu ( Canlı )
            </h4>
            <button 
              onClick={() => onNavigate("idari")} 
              className="text-[10px] text-blue-600 hover:underline font-bold bg-blue-50/50 px-2 py-1 rounded border border-blue-100"
            >
              Kamp Yönetimine Git →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[18px] font-bold font-mono text-slate-800 block leading-none">{totalRooms}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mt-1">Toplam Oda</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl">
              <span className="text-[18px] font-bold font-mono text-slate-800 block leading-none">{totalBeds}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mt-1">Yatak Kapasitesi</span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="text-[18px] font-bold font-mono text-emerald-600 block leading-none">{occupiedBeds}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mt-1">Konaklayan Kişi</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
              <span className="uppercase">Genel Yatak Doluluk Oranı</span>
              <span className="text-slate-800 font-mono font-bold">%{fillRatio} Dolu</span>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200/40">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, fillRatio)}%` }} 
              />
            </div>
          </div>
          <p className="text-[9px] text-slate-400 font-semibold italic">
            * Yukarıdaki veriler idari işler kamp koordinatörlüğü odalarında fiilen kalan şantiye çalışanları veritabanı sayımlarına dayanmaktadır.
          </p>
        </div>

        {/* Browser Persistent manager notepad */}
        <div className="bg-white border border-slate-250 rounded-3xl text-slate-800 p-5 shadow-xs space-y-3 flex flex-col hover:shadow-md transition duration-200">
          <div className="border-b border-slate-100 pb-2.5 flex justify-between items-center shrink-0">
            <h4 className="font-display font-medium text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              📝 Yönetici Pratik Not Defteri
            </h4>
            <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-110 font-mono">
              Otomatik Kaydedilir
            </span>
          </div>
          
          <textarea
            className="w-full flex-grow min-h-[140px] p-3 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-400 transition resize-none font-sans"
            placeholder="Şantiye koordinasyonu için pratik notlarınızı buraya yazabilirsiniz. Bilgiler tarayıcınızda kalıcı kalır..."
            value={stickyNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
          />
        </div>
      </div>

      {/* Real-time Live Log Activity Stream / Recent Kadro lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Real-time Live Log Activity Stream */}
        <div className="bg-white border border-slate-250 rounded-3xl text-slate-800 p-5 shadow-xs space-y-4 hover:shadow-md transition duration-200">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h4 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              🔔 Şantiye Canlı Aktivite Akışı (Live Logs)
            </h4>
            <span className="text-[9px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-100 font-mono animate-pulse">
              Canlı Akış
            </span>
          </div>

          <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 relative pl-4 border-l border-slate-200/80 ml-2">
            {bildirimler && bildirimler.length > 0 ? (
              bildirimler.slice(0, 6).map((b, idx) => {
                // Style marker dot based on content
                let markerBg = "bg-blue-500 ring-blue-155";
                if (b.mesaj.includes("hata") || b.mesaj.includes("engellendi")) {
                  markerBg = "bg-rose-500 ring-rose-155";
                } else if (b.mesaj.includes("yeni") || b.mesaj.includes("yüklendi")) {
                  markerBg = "bg-emerald-500 ring-emerald-155";
                } else if (b.mesaj.includes("onay")) {
                  markerBg = "bg-amber-500 ring-amber-155";
                }
                return (
                  <div 
                    key={b.id || idx} 
                    className="relative flex flex-col space-y-1 hover:bg-slate-50 p-2 rounded-xl transition duration-150 animate-fade-in"
                  >
                    {/* Glowing vertical marker dot */}
                    <div className={`absolute -left-[21.5px] top-4 w-2.5 h-2.5 rounded-full ${markerBg} ring-4 shrink-0 z-10`} />
                    
                    <p className="text-xs font-semibold text-slate-700 leading-relaxed pr-1">{b.mesaj}</p>
                    <span className="text-[9px] text-slate-450 font-mono block mt-0.5">
                      {b.tarih ? new Date(b.tarih).toLocaleString('tr-TR') : 'Şimdi'}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs italic">
                Henüz canlı aktivite kaydı bulunmuyor.
              </div>
            )}
          </div>
        </div>

        {/* Active Kadro */}
        <div className="bg-white border border-slate-250 rounded-3xl text-slate-800 p-5 shadow-xs space-y-4 hover:shadow-md transition duration-200">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h4 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              👥 Aktif Şantiye Çalışan Kadrosu
            </h4>
            <button 
              onClick={() => onNavigate("personel")}
              className="text-[10px] text-blue-600 hover:underline font-bold cursor-pointer"
            >
              Kadroya Git →
            </button>
          </div>

          <div className="space-y-2.5">
            {personeller.slice(0, 5).map(p => (
              <div 
                key={p.id} 
                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition border border-transparent hover:border-slate-150"
              >
                <div className="flex items-center space-x-3 text-xs">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-650 text-[10px]">
                    {p.ad[0]}{p.soyad[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{p.ad} {p.soyad}</p>
                    <span className="text-[10px] text-slate-400 font-semibold">{p.gorev} · {p.departman}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-slate-800 font-bold text-xs">{p.departman}</span>
                  <p className="text-[9px] text-slate-400 font-mono">Giriş: {p.iseGirisTarihi || 'Belirtilmedi'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardScreen;
