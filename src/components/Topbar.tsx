import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, CheckCircle, Clock, Smartphone, User, Shield, Activity, TrendingUp, Inbox, ChevronRight } from 'lucide-react';
import { KibritciLogo } from './KibritciLogo';

interface TopbarProps {
  currentTab: string;
  dbStatus?: 'loading' | 'synced' | 'error' | 'offline';
  currentUser?: any;
  kullanicilar?: any[];
  onToggleSidebar?: () => void;
  bildirimler?: any[];
  onClearNotifications?: () => void;
  onNotificationClick?: (notif: any) => void;
  onToggleMobileMode?: () => void;
  onProfileClick?: () => void;
  pendingOnayCount?: number;
  onOpenOnayInbox?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ 
  currentTab, 
  dbStatus = 'synced', 
  currentUser, 
  kullanicilar = [], 
  onToggleSidebar,
  bildirimler = [],
  onClearNotifications,
  onNotificationClick,
  onToggleMobileMode,
  onProfileClick,
  pendingOnayCount = 0,
  onOpenOnayInbox,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Simulated construction material USD / EUR rate ticker
  const [rates, setRates] = useState({ usd: 32.84, eur: 35.15 });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const ratesTimer = setInterval(() => {
      setRates(prev => ({
        usd: Number((prev.usd + (Math.random() - 0.5) * 0.01).toFixed(2)),
        eur: Number((prev.eur + (Math.random() - 0.5) * 0.01).toFixed(2))
      }));
    }, 8000);
    return () => clearInterval(ratesTimer);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTabName = (tab: string) => {
    const labels: { [key: string]: string } = {
      personel: "Personel Yönetimi",
      yoklama: "Yoklama ve Puantaj",
      faaliyet_personel: "Faaliyeti Olan Personeller",
      maas: "Maaş Hesaplama",
      personel_izin: "Personel İzin Formu",
      satin_alma: "Satın Alma Talep",
      siparis_formu: "Sipariş Formu",
      cari_stok: "Cari ve Stok Kartları",
      arac: "Araç ve Demirbaş Takibi",
      kamp: "Kamp Yönetimi",
      saha: "Daily Saha Faaliyetleri",
      rapor_programlama: "Raporlama & Programlama",
      tutanak: "Hazır Tutanak Hazırlama",
      rapor: "Rapor & Analiz Merkezi",
      eposta: "E-Posta Yönetim Merkezi",
      sohbet: "Sohbet & Haberleşme",
      onay_islemleri: "Onay Havuzu & İmzalar",
      admin: "Üyelik Onay & İmza",
      yetki_verme: "Sayfa Yetkilendirme",
      taseron_kesinti: "Taşeron Yönetimi",
      fatura_giris: "Fatura Girişi",
      irsaliye_giris: "İrsaliye ve Fiş Girişi",
      t_cetveli: "T Cetveli",
      imalat_terminali: "İmalat Terminali",
      temizlik_kirim: "Temizlik / Kırım Tespiti"
    };
    return labels[tab] || tab;
  };

  const formattedDate = currentTime.toLocaleDateString('tr-TR', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  const formattedTime = currentTime.toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const unreadCount = bildirimler.filter(n => !n.okundu).length;

  const formatNotifTime = (tarihStr: string) => {
    try {
      const d = new Date(tarihStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Şimdi';
      if (diffMins < 60) return `${diffMins} dk önce`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} saat önce`;
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  // Get active user full name & initials
  const userFullName = (() => {
    if (!currentUser) return "MİSAFİR";
    const matched = kullanicilar?.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    return matched && matched.ad ? `${matched.ad} ${matched.soyad}` : currentUser.email?.split('@')[0].toUpperCase();
  })();

  const userInitials = userFullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-[56px] bg-white/80 backdrop-blur-xl border-b border-slate-200/80 px-3 md:px-6 flex items-center justify-between shrink-0 font-sans select-none relative text-slate-800 shadow-sm gap-2 z-40">
      
      {/* Left Area: Sidebar Toggle & Section Title */}
      <div className="flex items-center space-x-2 md:space-x-3 text-[13px] min-w-0">
        <button 
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition duration-150 cursor-pointer shadow-xs"
          title="Menüyü Aç"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 min-w-0">
          <div className="flex items-center space-x-1.5">
            <KibritciLogo size="sm" showText={false} className="h-5" />
            <span className="text-slate-800 font-black tracking-wider text-[11px] uppercase">KİBRİTÇİ ERP</span>
          </div>
          <span className="text-slate-400 hidden sm:inline">/</span>
          <span className="font-bold text-slate-800 tracking-wide text-xs truncate max-w-[160px] sm:max-w-[260px] md:max-w-[340px]">
            {formatTabName(currentTab)}
          </span>
        </div>
      </div>

      {/* Center Area: Financial Currency Ticker & Real-time Clock */}
      <div className="hidden xl:flex items-center space-x-6">
        
        {/* Exchange Rates Ticker */}
        <div className="flex items-center bg-slate-100/80 border border-slate-200/80 rounded-xl px-3 py-1 space-x-3.5 text-[10px] font-mono text-slate-600">
          <span className="flex items-center gap-1 font-bold text-slate-700">
            <TrendingUp size={11} className="text-amber-500" />
            PİYASA:
          </span>
          <span><span className="text-slate-400 mr-1">US</span>USD <span className="font-bold text-emerald-600">{rates.usd} TL</span></span>
          <span className="text-slate-300">|</span>
          <span><span className="text-slate-400 mr-1">EU</span>EUR <span className="font-bold text-emerald-600">{rates.eur} TL</span></span>
        </div>

        {/* Date & Time Widget */}
        <div className="flex items-center text-slate-600 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/80 text-[10px] shadow-xs">
          <Clock size={12} className="mr-2 text-amber-500" />
          <span className="text-slate-400 font-mono">{formattedDate}</span>
          <span className="text-slate-700 mx-2">|</span>
          <span className="text-slate-800 font-mono font-bold tracking-wider">{formattedTime}</span>
        </div>
      </div>

      {/* Right Area: Status Indicator, User Profile Pill, Mobile Mode & Notifications */}
      <div className="flex items-center space-x-2 md:space-x-4 min-w-0">
        
        {/* Live system status indicator badge */}
        {dbStatus === 'loading' && (
          <div className="hidden sm:flex items-center bg-slate-500/10 text-slate-600 border border-slate-800/20 py-1 px-3 rounded-full text-[10px] font-bold space-x-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-ping" />
            <span>Bulut Eşitleniyor...</span>
          </div>
        )}
        {dbStatus === 'synced' && (
          <div className="hidden sm:flex items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-1 px-3 rounded-full text-[10px] font-bold space-x-1.5">
            <CheckCircle size={11} className="stroke-[3] text-emerald-450" />
            <span>Realtime Aktif</span>
          </div>
        )}
        {dbStatus === 'error' && (
          <div className="hidden sm:flex items-center bg-rose-500/10 text-rose-400 border border-rose-500/20 py-1 px-3 rounded-full text-[10px] font-bold space-x-1.5">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
            <span>Bağlantı Kesildi</span>
          </div>
        )}
        {dbStatus === 'offline' && (
          <div className="hidden sm:flex items-center bg-slate-800 text-slate-400 border border-slate-700 py-1 px-3 rounded-full text-[10px] font-bold space-x-1.5">
            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
            <span>Çevrimdışı Mod</span>
          </div>
        )}

        {/* User Card with Avatar Initials */}
        {currentUser && (
          <div 
            onClick={onProfileClick}
            className="flex items-center space-x-2 bg-slate-100 border border-slate-200 hover:bg-slate-200/80 transition duration-150 rounded-xl p-1 pr-2 md:pr-3 max-w-[140px] sm:max-w-[190px] md:max-w-none cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 text-white font-black text-[10px] flex items-center justify-center shadow-sm shrink-0">
              {userInitials}
            </div>
            <div className="text-[10px] font-bold truncate text-slate-700 hidden sm:block">
              {userFullName}
            </div>
          </div>
        )}

        {/* Global Action Icons (Search simulation / Notifications) */}
        <div className="flex items-center space-x-2 md:space-x-3.5 border-l border-slate-200 pl-2 md:pl-3.5 relative shrink-0" ref={dropdownRef}>
          
          {/* Mobil Görünüm (Must remain exactly as is) */}
          {onToggleMobileMode && (
            <button 
              onClick={onToggleMobileMode}
              className="text-slate-500 hover:text-slate-800 transition duration-150 cursor-pointer flex items-center gap-1.5 text-[10px] font-extrabold mr-1"
              title="Mobil Arayüze Geç"
            >
              <Smartphone size={14} className="text-slate-500" />
              <span className="hidden sm:inline text-slate-600">Mobil Görünüm</span>
            </button>
          )}

          {onOpenOnayInbox && (
            <button
              type="button"
              onClick={onOpenOnayInbox}
              className={`relative cursor-pointer p-1 rounded-lg transition flex items-center gap-1 ${
                pendingOnayCount > 0
                  ? 'text-amber-700 hover:bg-amber-50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Onay inbox"
            >
              <Inbox size={15} />
              <span className="hidden md:inline text-[10px] font-extrabold">
                Onay{pendingOnayCount > 0 ? `: ${pendingOnayCount}` : ''}
              </span>
              {pendingOnayCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 md:hidden bg-amber-500 border-2 border-white text-slate-950 font-black text-[8px] rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center">
                  {pendingOnayCount > 99 ? '99+' : pendingOnayCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('kibritci-open-command-palette'))}
            className="text-slate-500 hover:text-slate-800 transition relative cursor-pointer p-1 rounded-lg hover:bg-slate-100"
            title="Hızlı menü (Ctrl+K)"
          >
            <Search size={15} />
          </button>

          {/* Bildirim Lambası (Must remain exactly as is) */}
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="text-slate-500 hover:text-slate-800 transition relative cursor-pointer p-1 rounded-lg hover:bg-slate-100"
          >
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 border-2 border-white text-slate-950 font-black text-[8px] rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
            <Bell size={15} />
          </button>

          {/* Notifications Dropdown Panel */}
          {showDropdown && (
            <div className="absolute right-0 top-9 w-[min(20rem,calc(100vw-1rem))] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 text-xs text-slate-600 p-3.5 space-y-3 flex flex-col max-h-96 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
                <span className="font-extrabold text-slate-800 flex items-center space-x-1.5">
                  <span>🔔</span>
                  <span>Şantiye Aktivite Akışı</span>
                </span>
                {unreadCount > 0 && onClearNotifications && (
                  <button
                    onClick={() => {
                      onClearNotifications();
                      setShowDropdown(false);
                    }}
                    className="text-[9px] text-amber-500 hover:text-amber-400 hover:underline font-extrabold cursor-pointer"
                  >
                    Tümünü Okundu İşaretle
                  </button>
                )}
              </div>

              {/* Scrollable list */}
              <div className="flex-grow overflow-y-auto space-y-1.5 max-h-64 pr-1 scrollbar-thin">
                {bildirimler.length === 0 ? (
                  <div className="text-center py-6 px-2">
                    <p className="text-[11px] font-bold text-slate-700">Bildirim yok</p>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Yeni onay veya kapı kaydı gelince burada görünür.
                    </p>
                  </div>
                ) : (
                  bildirimler.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => {
                        onNotificationClick?.(notif);
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border flex flex-col space-y-0.5 transition duration-150 cursor-pointer hover:border-amber-300 hover:shadow-sm ${
                        notif.okundu 
                          ? 'bg-slate-50 border-slate-200 text-slate-600' 
                          : 'bg-amber-50 border-amber-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className={`text-[9px] font-extrabold font-mono truncate max-w-[130px] uppercase ${notif.okundu ? 'text-slate-500' : 'text-amber-700'}`}>
                          {notif.kullanici?.split('@')[0]}
                        </span>
                        <span className="text-[8px] text-slate-500 font-mono shrink-0 flex items-center space-x-0.5">
                          <span>{formatNotifTime(notif.tarih)}</span>
                        </span>
                      </div>
                      <p className="text-[11px] font-medium leading-relaxed break-words text-slate-700">{notif.mesaj}</p>
                      <span className="text-[9px] font-bold text-amber-600 inline-flex items-center gap-0.5 mt-0.5">
                        Muhataba git
                        <ChevronRight size={11} />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
