import React from 'react';
import { Building2, Users, CalendarCheck2, CreditCard, ShoppingCart, Truck, KeySquare, FileText, Tent, Mail, ChartBar as BarChart3, BookOpen, Contact as Contact2, Package, LogOut, Wallet, Hop as Home, ShieldCheck, PenTool, MessageSquare, Smartphone, HardHat, Banknote } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser?: any;
  onSignOut?: () => void;
  onSignatureEdit?: () => void;
  isYonetici?: boolean;
  userYetki?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onToggleMobileMode?: () => void;
  kisitliSayfalar?: string[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onSignOut,
  onSignatureEdit,
  isYonetici = false,
  userYetki,
  isOpen = false,
  onClose,
  onToggleMobileMode,
  kisitliSayfalar = []
}) => {
  const menuItems = [
    {
      group: "BAŞLANGIÇ",
      items: [
        { key: "ana_sayfa", label: "Ana Sayfa", icon: Home },
      ]
    },
    {
      group: "PERSONEL",
      items: [
        { key: "personel", label: "Personel Yönetimi", icon: Users },
        { key: "yoklama", label: "Yoklama ve Puantaj", icon: CalendarCheck2 },
        { key: "maas", label: "Maaş Hesaplama", icon: CreditCard },
        { key: "maas_odeme", label: "Maaş Ödeme", icon: Banknote },
        { key: "personel_izin", label: "Personel İzin Formu", icon: FileText },
      ]
    },
    {
      group: "FINANS & ENVENTER",
      items: [
        { key: "kasa", label: "Haftalık Kasa", icon: Wallet },
        { key: "satin_alma", label: "Satın Alma Talep", icon: ShoppingCart },
        { key: "cari_stok", label: "Cari ve Stok Kartları", icon: Package },
        { key: "evrak_aktarimi", label: "AI Belge Aktarımı", icon: BookOpen },
        { key: "kibar_hakedis", label: "Kibar Hakediş", icon: CreditCard },
      ]
    },
    {
      group: "İŞ MAKİNESİ & OPERATÖR",
      items: [
        { key: "operator", label: "Operatör Faaliyetleri", icon: HardHat },
      ]
    },
    {
      group: "İDARİ İŞLER & SAHA",
      items: [
        { key: "arac", label: "Araç ve Demirbaş", icon: Truck },
        { key: "kamp", label: "Kamp Yönetimi", icon: Tent },
        { key: "saha", label: "Saha Faaliyetleri", icon: Building2 },
        { key: "tutanak", label: "Hazır Tutanaklar", icon: FileText },
        { key: "formen_ekrani", label: "Formen Mobil Paneli", icon: Contact2 },
        { key: "guvenlik_ekrani", label: "Güvenlik & Kapı Kontrol", icon: ShieldCheck },
        { key: "kampci_ekrani", label: "Kampçı Mobil Paneli", icon: Tent },
        { key: "lojistik_ekrani", label: "Şöför Mobil Paneli", icon: Truck },
        { key: "depocu_ekrani", label: "Depocu Mobil Paneli", icon: Package },
      ]
    },
    {
      group: "RAPOR VE İLETİŞİM",
      items: [
        { key: "sohbet", label: "Sohbet & Haberleşme", icon: MessageSquare },
        { key: "eposta", label: "E-Posta Merkezi", icon: Mail },
        { key: "onay_islemleri", label: "Onay Havuzu & İmzalar", icon: ShieldCheck },
      ]
    },
    {
      group: "ADMİNİSTRATOR",
      items: [
        { key: "admin", label: "Üyelik & Admin Paneli", icon: KeySquare },
        { key: "yetki_verme", label: "Sayfa Yetkilendirme", icon: ShieldCheck },
      ]
    }
  ];

  const filteredMenuItems = menuItems.map(group => {
    return {
      ...group,
      items: group.items.filter(item => {
        if (kisitliSayfalar && kisitliSayfalar.includes(item.key)) {
          return false;
        }

        if (item.key === 'kibar_hakedis') {
          const emailLower = currentUser?.email?.toLowerCase();
          return emailLower === 'sametatak9@gmail.com' || emailLower === 'santiye@kibritci.com';
        }

        if (item.key === 'yetki_verme') {
          const emailLower = currentUser?.email?.toLowerCase();
          return emailLower === 'sametatak9@gmail.com' || emailLower === 'santiye@kibritci.com';
        }

        if (userYetki === 'FORMEN') {
          return item.key === 'formen_ekrani';
        }

        if (userYetki === 'GÜVENLİK') {
          return item.key === 'guvenlik_ekrani';
        }

        if (userYetki === 'KAMPÇI') {
          return item.key === 'kampci_ekrani';
        }

        if (userYetki === 'LOJİSTİK') {
          return item.key === 'lojistik_ekrani';
        }

        if (userYetki === 'DEPOCU') {
          return item.key === 'depocu_ekrani';
        }

        if (item.key === 'formen_ekrani') {
          return isYonetici;
        }

        if (item.key === 'guvenlik_ekrani') {
          return isYonetici;
        }

        if (item.key === 'kampci_ekrani') {
          return isYonetici;
        }

        if (item.key === 'lojistik_ekrani') {
          return isYonetici;
        }

        if (item.key === 'depocu_ekrani') {
          return isYonetici;
        }

        if (item.key === 'onay_islemleri') {
          return isYonetici;
        }

        if (item.key === 'evrak_aktarimi') {
          return isYonetici;
        }

        if (item.key === 'maas_odeme') {
          return isYonetici;
        }

        if (item.key === 'operator') {
          return isYonetici;
        }

        return true;
      })
    };
  }).filter(group => {
    if (group.group === "ADMİNİSTRATOR") {
      const emailLower = currentUser?.email?.toLowerCase();
      const isSametOrAdmin = emailLower === "sametatak95@gmail.com" || emailLower === "sametatak9@gmail.com" || emailLower === "santiye@kibritci.com";
      return isSametOrAdmin || isYonetici;
    }
    return group.items.length > 0;
  });

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-35 lg:hidden backdrop-blur-xs transition-opacity cursor-pointer animate-fade-in"
        />
      )}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-68 bg-white h-screen border-r border-slate-200 flex flex-col select-none shrink-0 font-sans text-slate-800 transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm transform hover:rotate-3 transition">
              <Building2 size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-display font-bold text-[15px] tracking-wide text-slate-900 uppercase">
                KİBRİTÇİ ERP
              </h1>
              <p className="text-[11px] text-slate-500 font-medium tracking-tight">
                Şantiye Yönetim Sistemi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-slate-650 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          <div className="px-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Modüller
            </span>
          </div>

          {filteredMenuItems.map((group, grpIdx) => (
            <div key={grpIdx} className="space-y-1.5">
              <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                {group.group}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveTab(item.key);
                      if (onClose) onClose();
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200 group text-left cursor-pointer ${
                      isActive
                        ? "bg-blue-50 text-blue-700 border-l-4 border-blue-600 shadow-xs font-semibold"
                        : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={`shrink-0 transition-transform group-hover:scale-105 ${
                        isActive ? "text-blue-650" : "text-slate-400 group-hover:text-slate-700"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          {onSignatureEdit && (
            <button
              onClick={onSignatureEdit}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-slate-650 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
            >
              <PenTool size={16} className="text-slate-400" />
              <span>İmza Ayarları</span>
            </button>
          )}
          {onToggleMobileMode && (
            <button
              onClick={onToggleMobileMode}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-slate-650 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
            >
              <Smartphone size={16} className="text-slate-400" />
              <span>Mobil Mod</span>
            </button>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            >
              <LogOut size={16} />
              <span>Oturumu Kapat</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
