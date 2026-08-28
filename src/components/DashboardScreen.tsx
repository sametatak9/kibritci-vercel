import React, { useState } from 'react';
import { 
  Users, Wallet, ShoppingCart, Truck, RefreshCw, 
  FileText, BarChart, ArrowUpRight, ArrowDownRight, Compass, Settings,
  Search, ClipboardList, Briefcase, CalendarCheck2, ChevronRight, UserCheck, AlertTriangle
} from 'lucide-react';
import { Personel, KasaHareketi, SatinAlmaTalebi, AracBakim, AylikYoklamaMap, KampOdasi, KampKaydi } from '../types/erp';
import { KibritciLogo } from './KibritciLogo';

interface DashboardScreenProps {
  personeller: Personel[];
  kasaHareketleri: KasaHareketi[];
  yoklamalar: AylikYoklamaMap;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  araclar: AracBakim[];
  aracKmLoglari?: any[];
  kampOdalari?: KampOdasi[];
  kampKayitlari?: KampKaydi[];
  onNavigate: (tab: string) => void;
  currentUser?: any;
  stokKartlar?: any[];
  bildirimler?: any[];
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
  onNavigate,
  currentUser,
  stokKartlar = [],
  bildirimler = []
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

  // Statistical numbers
  const totalPersonel = personeller.length;
  const activePersonelCount = personeller.filter(p => p.durum === true || String(p.durum) === 'true').length;
  
  // Calculate attendance rate (Geldi ratio) for the current month
  let totalCheckedDays = 0;
  let totalPresentDays = 0;
  Object.keys(yoklamalar || {}).forEach(pId => {
    const pYoklama = yoklamalar[pId] || {};
    Object.values(pYoklama).forEach((day: any) => {
      if (day?.durum && day?.durum !== 'Girilmedi') {
        totalCheckedDays++;
        if (day?.durum === 'Geldi') {
          totalPresentDays++;
        }
      }
    });
  });
  const attendanceRate = totalCheckedDays > 0 ? Math.round((totalPresentDays / totalCheckedDays) * 100) : 0;

  // Calculate pending manager approvals
  const pendingStokKartCount = (stokKartlar || []).filter((s: any) => s.durum === 'ONAY BEKLİYOR').length;
  const pendingSatinAlmaCount = (satinAlmaTalepleri || []).filter((sa: any) => sa.onayDurumu === 'BEKLİYOR').length;
  const totalPendingApprovals = pendingStokKartCount + pendingSatinAlmaCount;

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

  // Stats Card Arrays
  const stats = [
    {
      title: "Aktif Kadro (Personel)",
      value: `${activePersonelCount} / ${totalPersonel}`,
      color: "text-blue-600",
      bg: "bg-blue-50/70 border-blue-100",
      icon: Users,
      trend: "Canlı Şantiye Kadrosu",
      trendColor: "text-emerald-600"
    },
    {
      title: "Lojman Doluluk Oranı",
      value: `%${fillRatio}`,
      color: "text-emerald-600",
      bg: "bg-emerald-50/70 border-emerald-100",
      icon: Compass,
      trend: `${occupiedBeds} / ${totalBeds} Yatak Dolu`,
      trendColor: "text-emerald-700"
    },
    {
      title: "Puantaj Katılım Oranı",
      value: `%${attendanceRate}`,
      color: "text-[#8B1E1E]",
      bg: "bg-rose-50/70 border-rose-100",
      icon: CalendarCheck2,
      trend: "Aylık Ortalama Katılım",
      trendColor: "text-rose-700"
    },
    {
      title: "Bekleyen Onay Talepleri",
      value: `${totalPendingApprovals} Adet`,
      color: "text-amber-600",
      bg: "bg-amber-50/70 border-amber-100",
      icon: ClipboardList,
      trend: "Yönetici Kararı Bekleyen",
      trendColor: "text-amber-600"
    }
  ];

  return (
    <div className="flex-grow p-6 space-y-6 overflow-y-auto h-full font-sans bg-slate-50">
      
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden border border-slate-800 gap-4">
        <div className="absolute right-0 top-0 w-64 h-64 bg-slate-800 rounded-full mix-blend-multiply filter blur-xl opacity-30 -translate-y-20 translate-x-10" />
        <div className="absolute right-10 bottom-0 w-48 h-48 bg-amber-500 rounded-full mix-blend-multiply filter blur-2xl opacity-10 translate-y-10" />
        
        <div className="relative z-10 space-y-2 flex items-center space-x-4">
          <KibritciLogo size="lg" className="mr-2" />
          <div className="space-y-1">
            <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-amber-500/20 uppercase block w-fit">
              BULUT YÖNETSSEL ÖZET PANELİ
            </span>
            <h2 className="font-display font-black text-xl tracking-tight text-white">
              Şantiye Kontrol &amp; Raporlama Merkezi
            </h2>
            <p className="text-[11px] text-slate-350 font-sans tracking-tight max-w-lg leading-relaxed">
              Google Cloud Firestore NoSQL canlı veritabanı aktif durumdadır. Personel, puantaj, satın alma talepleri ve hakediş harcamaları anlık senkronizedir.
            </p>
          </div>
        </div>
        
        <div className="relative z-10 flex space-x-2 shrink-0">
          <button 
            onClick={() => onNavigate("satin_alma")} 
            className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold text-[11px] px-4 py-2.5 rounded-xl transition shadow-md cursor-pointer"
          >
            + Yeni Satın Alma Talebi
          </button>
          <button 
            onClick={() => onNavigate("personel")} 
            className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 font-semibold text-[11px] px-4 py-2.5 rounded-xl transition shadow-md cursor-pointer"
          >
            Personel Düzenle
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st, i) => {
          const Icon = st.icon;
          return (
            <div key={i} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition duration-200">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    {st.title}
                  </span>
                  <span className={`text-2xl font-black font-mono tracking-tight ${st.color}`}>
                    {st.value}
                  </span>
                </div>
                <div className={`p-2 rounded-xl border ${st.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={18} className={`${st.color}`} />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Canlı Durum:</span>
                <span className={`font-semibold ${st.trendColor}`}>{st.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 📘 Şantiye Hızlı Kılavuz & Sistem Rehberi */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 relative overflow-hidden bg-gradient-to-r from-blue-50/20 to-transparent">
        <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 -translate-y-10 translate-x-10" />
        <div className="space-y-1">
          <span className="bg-blue-500/10 text-blue-700 text-[9px] font-black tracking-wider px-2.5 py-0.5 rounded-full border border-blue-500/10 uppercase">
            EĞİTİM &amp; PRATİK KULLANIM REHBERLERİ
          </span>
          <h3 className="font-display font-black text-slate-800 text-sm tracking-tight">
            📘 Kibritçi ERP Şantiye Kullanım Kılavuzu
          </h3>
          <p className="text-[11px] text-slate-500 max-w-2xl">
            Aşağıdaki kartlar şantiyede sıkça yapılan operasyonların nasıl yürütüleceğini açıklar. İlgili modüle hızlıca gitmek için kılavuz başlıklarına tıklayabilirsiniz.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div 
            onClick={() => onNavigate("yoklama")} 
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-55/40 border border-slate-100 hover:border-blue-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-blue-700 font-bold text-xs">
              <span className="group-hover:underline">1. Yoklama &amp; Puantaj</span>
              <span>→</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Her sabah çalışanların şantiye durumlarını girin. AI ile yoklama kağıdının fotoğrafını çekip otomatik sisteme yükleyebilirsiniz.
            </p>
          </div>

          <div 
            onClick={() => onNavigate("satin_alma")} 
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-amber-55/45 border border-slate-100 hover:border-amber-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-amber-700 font-bold text-xs">
              <span className="group-hover:underline">2. Satın Alma Talebi</span>
              <span>→</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Şantiyeye gerekli olan malzeme veya hizmet taleplerini oluşturun. Talebiniz yöneticinin Onay Havuzuna düşer.
            </p>
          </div>

          <div 
            onClick={() => onNavigate("kamp")} 
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-55/40 border border-slate-100 hover:border-emerald-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-emerald-700 font-bold text-xs">
              <span className="group-hover:underline">3. Lojman &amp; Kamp</span>
              <span>→</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Kamp Yönetimi altından yatak atamalarını yapın. Personelin lojmana giriş-çıkış tarihlerini canlı takip edebilirsiniz.
            </p>
          </div>

          <div 
            onClick={() => onNavigate("arac")} 
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-purple-55/40 border border-slate-100 hover:border-purple-200 transition duration-200 cursor-pointer space-y-1.5 group"
          >
            <div className="flex items-center justify-between text-purple-700 font-bold text-xs">
              <span className="group-hover:underline">4. Şoför &amp; Araç KM</span>
              <span>→</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Şoförlerin sabah/akşam KM seyrini girin. Muayene ve yağ bakımı sayaçlarını araç panelinden sürekli izleyin.
            </p>
          </div>
        </div>
      </div>

      {/* 2 Cols: Main Graphics + Personel Trace Widget */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Grafik ve Puantaj */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4 xl:col-span-2">
          <div className="flex justify-between items-center border-b border-rose-100 pb-3">
            <div className="flex items-center space-x-2">
              <BarChart size={16} className="text-[#8B1E1E]" />
              <h3 className="font-display font-black text-slate-800 uppercase text-xs tracking-wider">
                Aylık Puantaj ve Mesai Oran Analizi
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Dinamik 30 Gün</span>
          </div>

          <div className="h-44 w-full flex items-end justify-between px-2 pt-4 relative">
            <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none pb-4">
              <div className="border-b border-slate-50 w-full" />
              <div className="border-b border-slate-50 w-full" />
              <div className="border-b border-slate-50 w-full" />
              <div className="border-b border-slate-100 w-full" />
            </div>

            {[
              { label: "01 Haz", height: "h-20", value: "3", fill: "bg-gradient-to-t from-blue-500 to-blue-400" },
              { label: "05 Haz", height: "h-28", value: "5", fill: "bg-gradient-to-t from-[#1E4E78] to-blue-500" },
              { label: "10 Haz", height: "h-14", value: "2", fill: "bg-gradient-to-t from-[#8B1E1E] to-red-500" },
              { label: "15 Haz", height: "h-36", value: "8", fill: "bg-gradient-to-t from-emerald-500 to-emerald-400" },
              { label: "20 Haz", height: "h-28", value: "6", fill: "bg-gradient-to-t from-[#1E4E78] to-blue-500" },
              { label: "25 Haz", height: "h-32", value: "7", fill: "bg-gradient-to-t from-blue-500 to-blue-450" },
              { label: "30 Haz", height: "h-40", value: "9", fill: "bg-gradient-to-t from-[#1E4E78] to-[#8B1E1E]" },
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

          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-3 border-t border-slate-50 font-sans">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1E4E78] inline-block" />
                <span>Normal Mesailer</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B1E1E] inline-block" />
                <span>Haftalık Tatili</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>Hakediş Günü</span>
              </span>
            </div>
            <span className="font-mono">Günlük Verim İncelemesi</span>
          </div>
        </div>

        {/* Right 1 Col: Dynamic Personnel History Finder */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm flex flex-col space-y-4">
          <div className="border-b border-rose-100 pb-3 flex items-center space-x-2">
            <ClipboardList size={16} className="text-[#8B1E1E]" />
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
                className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl p-2.5 font-semibold text-slate-700 outline-none focus:border-[#8B1E1E] transition cursor-pointer"
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
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2 border border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
              <Users size={30} className="stroke-[1.5] text-slate-300" />
              <p className="text-[11px] leading-relaxed">
                Şantiyedeki bir personeli seçerek araç sevklerini, puantaj kaydını, satın alma taleplerini ve zimmet dosya geçmişini anında listeleyin.
              </p>
            </div>
          ) : (
            <div className="flex-grow space-y-4 max-h-[300px] overflow-y-auto pr-1">
              
              {/* Individual Base Info */}
              <div className="bg-slate-50 border p-3 rounded-xl flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-[#1E4E78] text-white flex items-center justify-center font-bold font-display text-xs">
                  {traceData?.person.ad[0]}{traceData?.person.soyad[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">{traceData?.person.ad} {traceData?.person.soyad}</p>
                  <p className="text-[10px] text-slate-400 font-semibold truncate">{traceData?.person.gorev} · {traceData?.person.departman}</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  traceData?.person.durum ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}>
                  {traceData?.person.durum ? 'AKTİF KADRO' : 'AYRILMIŞ'}
                </span>
              </div>

              {/* Attendance Counts */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Yoklama / Puantaj Karnesi</span>
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                  <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg border border-emerald-100">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.geldi}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">Geldi</span>
                  </div>
                  <div className="bg-rose-50 text-rose-700 p-1.5 rounded-lg border border-rose-100">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.yok}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">Yok</span>
                  </div>
                  <div className="bg-amber-50 text-amber-700 p-1.5 rounded-lg border border-amber-100">
                    <p className="text-xs font-mono font-bold leading-none">{traceData?.attendance.izinli}</p>
                    <span className="text-[8px] font-semibold text-slate-400 block mt-1">İzin</span>
                  </div>
                  <div className="bg-blue-50 text-blue-700 p-1.5 rounded-lg border border-blue-100">
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
                      <div key={v.id} className="p-2 border bg-white rounded-lg flex justify-between items-center text-[10px]">
                        <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{v.plaka}</span>
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
                      <div key={i} className="p-2 border bg-[#FAF9F5] rounded-lg text-[9px] flex justify-between items-center">
                        <span className="font-mono text-slate-500">{log.tarih}</span>
                        <span className="font-bold text-slate-800">{log.plaka}</span>
                        <span className="text-slate-600">Fark: <strong>{log.fark} KM</strong></span>
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
                      <div key={sa.id} className="p-2 border bg-white rounded-lg text-[10px] flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-800 truncate max-w-[130px]">{sa.aciklama}</p>
                          <span className="font-mono text-[8px] text-slate-400">{sa.saId}</span>
                        </div>
                        <span className="text-[9px] font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100">{sa.onayDurumu}</span>
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
                      <tr class="border-b">
                        <td class="p-2.5 font-bold">${v.plaka}</td>
                        <td class="p-2.5">${v.markaModel}</td>
                        <td class="p-2.5 font-mono text-amber-600 font-bold">${v.mevcutKm.toLocaleString('tr-TR')} KM</td>
                      </tr>
                    `).join('');

                  const kmLogsHtml = traceData.kmLogs.length === 0
                    ? `<tr><td colspan="3" class="p-2.5 text-slate-400 italic text-center">Kilometre sefer kaydı bulunamadı.</td></tr>`
                    : traceData.kmLogs.map(log => `
                      <tr class="border-b">
                        <td class="p-2.5 font-mono text-slate-500">${log.tarih}</td>
                        <td class="p-2.5 font-bold text-slate-700">${log.plaka}</td>
                        <td class="p-2.5 font-mono font-bold text-slate-900">${log.fark} KM</td>
                      </tr>
                    `).join('');

                  const purchasesHtml = traceData.purchases.length === 0
                    ? `<tr><td colspan="4" class="p-2.5 text-slate-400 italic text-center">Talep edilen malzeme bulunmuyor.</td></tr>`
                    : traceData.purchases.map(sa => `
                      <tr class="border-b">
                        <td class="p-2.5 font-mono text-xs font-bold">${sa.saId}</td>
                        <td class="p-2.5 font-bold">${sa.aciklama || 'Genel Şantiye Malzemesi'}</td>
                        <td class="p-2.5 font-mono text-slate-500">${sa.tarih}</td>
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
                      <body class="p-12 bg-white text-slate-900 font-sans">
                        <div class="max-w-4xl mx-auto space-y-8">
                          
                          <!-- Header -->
                          <div class="border-b-2 border-slate-900 pb-4 flex justify-between items-center">
                            <div class="flex items-center space-x-4">
                              <div class="w-12 h-12 bg-[#1E4E78] text-white rounded-xl flex items-center justify-center text-xl font-bold font-sans">
                                K
                              </div>
                              <div>
                                <h1 class="text-xl font-black text-[#1E4E78] tracking-tight">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
                                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">İNSAN KAYNAKLARI VE ŞANTİYE GÜVENLİK REFAKAT ŞEFLİĞİ</p>
                              </div>
                            </div>
                            <div class="text-right text-xs">
                              <span class="border border-slate-900 text-[10px] font-bold px-3 py-1 bg-slate-50 uppercase tracking-widest block mb-1">KBR-PERS-DOC-${Date.now()}</span>
                              <span class="text-slate-400 font-mono text-[9px]">Oluşturulma: ${new Date().toLocaleDateString('tr-TR')}</span>
                            </div>
                          </div>

                          <!-- Title -->
                          <div class="text-center">
                            <h2 class="text-base font-bold text-slate-900 tracking-wider uppercase border-y border-slate-200 py-2.5 bg-slate-50">
                              PERSONEL SAHA GEÇMİŞİ VE PORTAL FAALİYET RAPORU
                            </h2>
                          </div>

                          <!-- Person Details Grid -->
                          <div class="grid grid-cols-2 gap-4 border p-4 rounded-xl bg-slate-50/50">
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
                              <p class="text-xs font-mono font-bold text-slate-600 mt-0.5">${p.tcNo || 'Belirtilmedi'}</p>
                            </div>
                            <div class="mt-2">
                              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">FİİLİ ÇALIŞMA DURUMU</p>
                              <p class="text-xs font-bold text-emerald-700 mt-0.5">AKTİF ŞANTİYE WH-KADROSU</p>
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
                              <div class="bg-blue-50 border border-blue-150 text-blue-800 p-3 rounded-xl">
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
                            <table class="w-full text-left text-xs text-slate-700 border">
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
                            <table class="w-full text-left text-xs text-slate-700 border">
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
                            <table class="w-full text-left text-xs text-slate-700 border">
                              <thead>
                                <tr class="bg-slate-55 border-b">
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
                            <div class="grid grid-cols-4 gap-4 text-center">
                              
                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                                <span class="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">1. MUHASEBE</span>
                                <span class="text-[10px] text-slate-500 block mb-6">Bordro Masası</span>
                                <div class="h-10 border-b border-dashed border-slate-350 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold text-slate-800 block">Bordro Yetkilisi</span>
                              </div>

                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                                <span class="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">2. İDARİ İŞLER</span>
                                <span class="text-[10px] text-slate-500 block mb-6">Şantiye Şefliği</span>
                                <div class="h-10 border-b border-dashed border-slate-350 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold text-slate-800 block">İdari İşler Şefi</span>
                              </div>

                              <div class="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                                <span class="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">3. ŞANTİYE ŞEFİ</span>
                                <span class="text-[10px] text-slate-500 block mb-6">Fiili Saha Mühendisi</span>
                                <div class="h-10 border-b border-dashed border-slate-350 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold text-slate-800 block">Şantiye Şefi</span>
                              </div>

                              <div class="border border-slate-150 p-3 rounded-xl bg-slate-50">
                                <span class="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">4. PROJE MÜDÜRÜ</span>
                                <span class="text-[10px] text-slate-500 block mb-6">Nihai Onaycı Müdür</span>
                                <div class="h-10 border-b border-dashed border-slate-350 w-24 mx-auto mb-2"></div>
                                <span class="text-[10px] font-bold text-slate-800 block">Proje Müdürü</span>
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
                className="w-full mt-3 bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1 transition shadow-sm cursor-pointer"
              >
                <span>💾 Personel Geçmiş Raporunu Masaüstüne Kaydet</span>
              </button>

            </div>
          )}
        </div>
      </div>

      {/* 🏕️ DYNAMIC CAMP OCCUPANCY & 📝 NOTEPAD EXTRA WIDGETS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Camp occupancy progress */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-rose-100 pb-3 flex justify-between items-center">
            <h4 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              🏕️ Lojman &amp; Kamp Doluluk Raporu ( Canlı )
            </h4>
            <button 
              onClick={() => onNavigate("idari")} 
              className="text-[10px] text-blue-800 hover:underline font-bold bg-blue-50 px-2 py-1 rounded border border-blue-100"
            >
              Kamp Yönetimine Git →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-slate-50 border rounded-xl">
              <span className="text-[18px] font-bold font-mono text-slate-800 block leading-none">{totalRooms}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mt-1">Toplam Oda</span>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-105 rounded-xl">
              <span className="text-[18px] font-bold font-mono text-blue-700 block leading-none">{totalBeds}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mt-1">Yatak Kapasitesi</span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-105 rounded-xl">
              <span className="text-[18px] font-bold font-mono text-emerald-700 block leading-none">{occupiedBeds}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mt-1">Konaklayan Kişi</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
              <span className="uppercase">Genel Yatak Doluluk Oranı</span>
              <span className="text-blue-750 font-mono font-bold">%{fillRatio} Görüntüleniyor</span>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, fillRatio)}%` }} 
              />
            </div>
          </div>
          <p className="text-[9px] text-slate-400 font-semibold italic">
            * Yukarıdaki veriler idari işler kamp koordinatörlüğü odalarında fiilen kalan şantiye çalışanları veritabanı sayımlarına dayanmaktadır.
          </p>
        </div>

        {/* Browser Persistent manager notepad */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3 flex flex-col">
          <div className="border-b border-rose-100 pb-2.5 flex justify-between items-center shrink-0">
            <h4 className="font-display font-medium text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              📝 Yönetici Pratik Not Defteri
            </h4>
            <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-110 font-mono">
              Otomatik Kaydedilir
            </span>
          </div>
          
          <textarea
            className="w-full flex-grow min-h-[140px] p-3 text-xs font-semibold text-slate-700 bg-[#FAF9F5] border border-[#e2e8f0] rounded-xl outline-none focus:border-amber-400 transition resize-none font-sans"
            placeholder="Şantiye koordinasyonu için pratik notlarınızı buraya yazabilirsiniz. Bilgiler tarayıcınızda kalıcı kalır..."
            value={stickyNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
          />
        </div>
      </div>

      {/* Real-time Live Log Activity Stream / Recent Kadro lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Real-time Live Log Activity Stream */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-rose-100 pb-3 flex justify-between items-center">
            <h4 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              🔔 Şantiye Canlı Aktivite Akışı (Live Logs)
            </h4>
            <span className="text-[9px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-mono animate-pulse">
              Canlı Akış
            </span>
          </div>

          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {bildirimler && bildirimler.length > 0 ? (
              bildirimler.slice(0, 6).map((b, idx) => (
                <div 
                  key={b.id || idx} 
                  className="flex items-start space-x-3 p-2.5 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-medium text-slate-700 leading-normal">{b.mesaj}</p>
                    <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                      {b.tarih ? new Date(b.tarih).toLocaleString('tr-TR') : 'Şimdi'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs italic">
                Henüz canlı aktivite kaydı bulunmuyor.
              </div>
            )}
          </div>
        </div>

        {/* Active Kadro */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-rose-100 pb-3 flex justify-between items-center">
            <h4 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider">
              Aktif Şantiye Çalışan Kadrosu
            </h4>
            <button 
              onClick={() => onNavigate("personel")}
              className="text-[10px] text-[#1E4E78] hover:underline font-bold cursor-pointer"
            >
              Kadroya Git →
            </button>
          </div>

          <div className="space-y-2.5">
            {personeller.slice(0, 5).map(p => (
              <div 
                key={p.id} 
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100"
              >
                <div className="flex items-center space-x-3 text-xs">
                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-700 text-[10px]">
                    {p.ad[0]}{p.soyad[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{p.ad} {p.soyad}</p>
                    <span className="text-[10px] text-slate-450 font-semibold">{p.gorev} · {p.departman}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-blue-750 font-bold text-xs">{p.departman}</span>
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
