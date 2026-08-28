import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, CheckCircle, Clock, Smartphone } from 'lucide-react';

interface TopbarProps {
  currentTab: string;
  dbStatus?: 'loading' | 'synced' | 'error' | 'offline';
  currentUser?: any;
  kullanicilar?: any[];
  onToggleSidebar?: () => void;
  bildirimler?: any[];
  onClearNotifications?: () => void;
  onToggleMobileMode?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ 
  currentTab, 
  dbStatus = 'synced', 
  currentUser, 
  kullanicilar = [], 
  onToggleSidebar,
  bildirimler = [],
  onClearNotifications,
  onToggleMobileMode
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
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
      maas: "Maaş Hesaplama",
      personel_izin: "Personel İzin Formu",
      satin_alma: "Satın Alma Talep",
      cari_stok: "Cari ve Stok Kartları",
      arac: "Araç ve Demirbaş Takibi",
      kamp: "Kamp Yönetimi",
      saha: "Daily Saha Faaliyetleri",
      tutanak: "Hazır Tutanak Hazırlama",
      rapor: "Rapor & Analiz Merkezi",
      eposta: "E-Posta Yönetim Merkezi",
      sohbet: "Sohbet & Haberleşme",
      onay_islemleri: "Onay Havuzu & İmzalar",
      admin: "Üyelik & Admin Paneli",
      yetki_verme: "Sayfa Yetkilendirme"
    };
    return labels[tab] || tab;
  };

  const formattedDate = currentTime.toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
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

  return (
    <header className="h-[52px] bg-white border-b border-[#e2e8f0] px-4 md:px-6 flex items-center justify-between shrink-0 font-sans select-none relative">
      {/* Breadcrumb / Section Name */}
      <div className="flex items-center space-x-2.5 text-[13px]">
        <button 
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          title="Menüyü Aç"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-slate-400 font-medium font-sans hidden sm:inline">KİBRİTÇİ ERP</span>
        <span className="text-slate-300 hidden sm:inline">/</span>
        <span className="font-semibold text-slate-800 font-display transition-colors">
          {formatTabName(currentTab)}
        </span>
      </div>

      {/* Right-aligned Stats & Search */}
      <div className="flex items-center space-x-6">
        {currentUser && (
          <div className="hidden lg:flex items-center space-x-2 text-xs font-semibold text-slate-700 bg-slate-55 border border-slate-200 py-1 px-3 rounded-lg shadow-inner">
            <span className="text-slate-400">Aktif Kullanıcı:</span>
            <span className="text-blue-700 font-bold">
              {(() => {
                const matched = kullanicilar?.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
                return matched && matched.ad ? `${matched.ad} ${matched.soyad}` : currentUser.email?.split('@')[0].toUpperCase();
              })()}
            </span>
          </div>
        )}

        {/* Real-time Odometer Clock */}
        <div className="hidden md:flex items-center bg-slate-50 border border-slate-100 rounded-lg py-1 px-3 space-x-3 text-[11px] font-mono font-medium text-slate-505 shadow-inner">
          <span className="text-amber-600 font-semibold">{formattedDate}</span>
          <span className="text-slate-300">|</span>
          <span className="text-blue-600 font-bold tracking-widest">{formattedTime}</span>
        </div>

        {/* Live system status indicator badge */}
        {dbStatus === 'loading' && (
          <div className="flex items-center bg-blue-55 text-blue-700 border border-blue-100 py-1 px-3 rounded-full text-[10px] font-semibold space-x-1.5 shadow-sm animate-pulse">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
            <span>Bulut Veritabanı Eşitleniyor...</span>
          </div>
        )}
        {dbStatus === 'synced' && (
          <div className="flex items-center bg-emerald-50 text-emerald-800 border border-emerald-150 py-1 px-3 rounded-full text-[10px] font-bold space-x-1.5 shadow-sm">
            <CheckCircle size={11} className="stroke-[3] text-emerald-650" />
            <span>Bulut Aktif (Realtime SQL/NoSQL)</span>
          </div>
        )}
        {dbStatus === 'error' && (
          <div className="flex items-center bg-rose-50 text-rose-700 border border-rose-100 py-1 px-3 rounded-full text-[10px] font-semibold space-x-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
            <span>Bağlantı Hatası</span>
          </div>
        )}
        {dbStatus === 'offline' && (
          <div className="flex items-center bg-slate-100 text-slate-600 border border-slate-200 py-1 px-3 rounded-full text-[10px] font-semibold space-x-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span>Çevrimdışı Çalışma</span>
          </div>
        )}

        {/* Global Action Icons (Search simulation / Notifications) */}
        <div className="flex items-center space-x-4 border-l pl-4 border-slate-200 relative" ref={dropdownRef}>
          {onToggleMobileMode && (
            <button 
              onClick={onToggleMobileMode}
              className="text-slate-400 hover:text-blue-600 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold mr-1"
              title="Mobil Arayüze Geç"
            >
              <Smartphone size={15} />
              <span className="hidden sm:inline">Mobil Görünüm</span>
            </button>
          )}

          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="text-slate-400 hover:text-slate-600 transition relative cursor-pointer"
          >
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 border border-white text-slate-950 font-black text-[8px] rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
            <Bell size={16} />
          </button>

          {/* Notifications Dropdown Panel */}
          {showDropdown && (
            <div className="absolute right-0 top-9 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 text-xs text-slate-700 p-3 space-y-2 flex flex-col max-h-96 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b pb-2 shrink-0">
                <span className="font-extrabold text-slate-800 flex items-center space-x-1">
                  <span>🔔</span>
                  <span>Şantiye Aktivite Akışı</span>
                </span>
                {unreadCount > 0 && onClearNotifications && (
                  <button
                    onClick={() => {
                      onClearNotifications();
                      setShowDropdown(false);
                    }}
                    className="text-[9px] text-blue-600 hover:text-blue-700 hover:underline font-extrabold cursor-pointer"
                  >
                    Tümünü Okundu İşaretle
                  </button>
                )}
              </div>

              {/* Scrollable list */}
              <div className="flex-grow overflow-y-auto space-y-1.5 max-h-64 pr-1 scrollbar-thin">
                {bildirimler.length === 0 ? (
                  <div className="text-center py-8 space-y-1.5">
                    <span className="text-xl block">📭</span>
                    <p className="text-[10px] text-slate-400 font-semibold">Henüz güncel bir aktivite bulunmuyor.</p>
                  </div>
                ) : (
                  bildirimler.map((notif) => (
                    <div 
                      key={notif.id}
                      className={`p-2.5 rounded-xl border flex flex-col space-y-0.5 transition duration-150 ${
                        notif.okundu 
                          ? 'bg-slate-50 border-slate-100 text-slate-500' 
                          : 'bg-amber-500/5 border-amber-500/20 text-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className={`text-[9px] font-extrabold font-mono truncate max-w-[130px] uppercase ${notif.okundu ? 'text-slate-400' : 'text-amber-600'}`}>
                          {notif.kullanici?.split('@')[0]}
                        </span>
                        <span className="text-[8px] text-slate-405 font-mono shrink-0 flex items-center space-x-0.5">
                          <Clock size={8} />
                          <span>{formatNotifTime(notif.tarih)}</span>
                        </span>
                      </div>
                      <p className="text-[11px] font-medium leading-relaxed break-words">{notif.mesaj}</p>
                    </div>
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
