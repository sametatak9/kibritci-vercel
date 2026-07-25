import React, { useEffect, useState } from 'react';
import { Building2, Users, CalendarCheck2, CreditCard, ShoppingCart, Truck, KeySquare, FileText, Tent, Mail, ChartBar as BarChart3, BookOpen, Contact as Contact2, Package, LogOut, Moon, Sun, Wallet, Hop as Home, ShieldCheck, PenTool, MessageSquare, Smartphone, HardHat, Banknote, Images, Sparkles, Link2, ChevronDown, ChevronRight, Search, Pin, PinOff, Wrench, Gem, Camera, ClipboardList } from 'lucide-react';
import {
  canAccessOnayHavuzu,
  canAccessUyelikAdminPanel,
  getRoleAllowedTabs,
  isIdariIslerRole,
  normalizeYetki,
} from '../lib/yetkiUtils';
import { readFavoriteTabs, writeFavoriteTabs } from '../lib/navPreferences';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser?: any;
  onSignOut?: () => void;
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
  isYonetici = false,
  userYetki,
  isOpen = false,
  onClose,
  onToggleMobileMode,
  kisitliSayfalar = []
}) => {
  const GROUP_STATE_KEY = 'kibritci_sidebar_group_state_v1';
  const normalizedYetki = normalizeYetki(userYetki);
  const roleAllowedTabs = getRoleAllowedTabs(normalizedYetki);
  const [searchTerm, setSearchTerm] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => readFavoriteTabs());

  useEffect(() => {
    writeFavoriteTabs(favorites);
  }, [favorites]);

  useEffect(() => {
    const sync = () => setFavorites(readFavoriteTabs());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

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
        { key: "personel_kartlari", label: "Personel Detay Kartları", icon: Users },
        { key: "yoklama", label: "Yoklama ve Puantaj", icon: CalendarCheck2 },
        { key: "faaliyet_personel", label: "Faaliyeti Olan Personeller", icon: Camera },
        { key: "gunluk_faaliyet_programi", label: "Günlük Faaliyet Programı", icon: ClipboardList },
        { key: "maas", label: "Maaş Hesaplama & Ödeme", icon: CreditCard },
        { key: "personel_izin", label: "Personel İzin Formu", icon: FileText },
      ]
    },
    {
      group: "FINANS & ENVENTER",
      items: [
        { key: "kasa", label: "Haftalık Kasa", icon: Wallet },
        { key: "satin_alma", label: "Satın Alma Talebi", icon: ShoppingCart },
        { key: "irsaliye_giris", label: "İrsaliye ve Fiş Girişi", icon: Truck },
        { key: "fatura_giris", label: "Fatura Girişi", icon: CreditCard },
        { key: "taseron_kesinti", label: "Taşeron Yönetimi", icon: Wallet },
        { key: "cari_stok", label: "Cari ve Stok Kartları", icon: Package },
        { key: "kibar_hakedis", label: "ZER YAPI Hakediş", icon: CreditCard },
      ]
    },
    {
      group: "İDARİ İŞLER & SAHA",
      items: [
        { key: "arac", label: "Araç ve Demirbaş", icon: Truck },
        { key: "kamp", label: "Kamp Yönetimi", icon: Tent },
        { key: "saha", label: "Saha Faaliyetleri", icon: Building2 },
        { key: "operator", label: "Operatör Faaliyetleri", icon: HardHat },
        { key: "formen_ekrani", label: "Formen Mobil Paneli", icon: Contact2 },
        { key: "guvenlik_ekrani", label: "Güvenlik & Kapı Kontrol", icon: ShieldCheck },
        { key: "kampci_ekrani", label: "Kampçı Mobil Paneli", icon: Tent },
        { key: "tesisatci_ekrani", label: "Tesisatçı Mobil Paneli", icon: Wrench },
        { key: "mermerci_ekrani", label: "Mermerci Mobil Paneli", icon: Gem },
        { key: "lojistik_ekrani", label: "Şöför Mobil Paneli", icon: Truck },
        { key: "depocu_ekrani", label: "Depocu Mobil Paneli", icon: Package },
        { key: "imalat_terminali", label: "İmalat Terminali", icon: Smartphone },
      ]
    },
    {
      group: "RAPOR VE İLETİŞİM",
      items: [
        { key: "onay_islemleri", label: "Onay Havuzu & İmzalar", icon: ShieldCheck },
      ]
    },
    {
      group: "ADMİNİSTRATOR",
      items: [
        { key: "admin", label: "Üyelik Onay & İmza", icon: KeySquare },
        { key: "yetki_verme", label: "Sayfa Yetkilendirme", icon: ShieldCheck },
      ]
    }
  ];

  const emailLower = currentUser?.email?.toLowerCase();
  const isFounderAdmin = emailLower === 'sametatak9@gmail.com';
  const isSecondaryAdmin = emailLower === 'mudur@gmail.com';
  const isPrivilegedAdmin = isFounderAdmin || isSecondaryAdmin;
  const canSeeUyelikAdmin = canAccessUyelikAdminPanel(normalizedYetki, { isPrivilegedAdmin });
  const canSeeOnayHavuzu = canAccessOnayHavuzu(normalizedYetki, {
    isYonetici,
    isPrivilegedAdmin,
  });
  const isIdariIsler = isIdariIslerRole(normalizedYetki);

  const filteredMenuItems = menuItems.map(group => {
    return {
      ...group,
      items: group.items.filter(item => {
        if (!isPrivilegedAdmin && roleAllowedTabs) {
          return roleAllowedTabs.includes(item.key as typeof roleAllowedTabs[number]);
        }

        if (kisitliSayfalar && kisitliSayfalar.includes(item.key)) {
          // İdari İşler: üyelik onay + onay havuzu kısıt listesinde olsa bile görünür
          if (!(isIdariIsler && (item.key === 'admin' || item.key === 'onay_islemleri'))) {
            return false;
          }
        }

        if (item.key === 'kibar_hakedis') {
          const emailLower = currentUser?.email?.toLowerCase();
          return emailLower === 'sametatak9@gmail.com' || emailLower === 'santiye@kibritci.com';
        }

        if (item.key === 'admin') {
          return canSeeUyelikAdmin;
        }

        if (item.key === 'yetki_verme') {
          return isPrivilegedAdmin;
        }

        if (item.key === 'formen_ekrani') {
          return isYonetici;
        }

        if (item.key === 'rapor_programlama') {
          return isYonetici;
        }

        if (item.key === 'guvenlik_ekrani') {
          return isYonetici;
        }

        if (item.key === 'kampci_ekrani') {
          return isYonetici;
        }

        if (item.key === 'tesisatci_ekrani') {
          return isYonetici;
        }

        if (item.key === 'mermerci_ekrani') {
          return isYonetici;
        }

        if (item.key === 'lojistik_ekrani') {
          return isYonetici;
        }

        if (item.key === 'depocu_ekrani') {
          return isYonetici;
        }

        if (item.key === 'imalat_terminali') {
          return isYonetici;
        }

        if (item.key === 'onay_islemleri') {
          return canSeeOnayHavuzu;
        }

        if (item.key === 'operator') {
          return isYonetici;
        }

        return true;
      }).filter(item => {
        if (!searchTerm) return true;
        return item.label.toLowerCase().includes(searchTerm.toLowerCase());
      })
    };
  }).filter(group => {
    if (group.group === "ADMİNİSTRATOR" && !canSeeUyelikAdmin && !isPrivilegedAdmin) {
      return false;
    }
    return group.items.length > 0;
  });

  const favItems = menuItems.flatMap(g => g.items).filter(item => favorites.includes(item.key)).filter(item => {
    // Only show if user is allowed
    return filteredMenuItems.some(g => g.items.some(it => it.key === item.key));
  });

  const displayMenuItems = favItems.length > 0 && !searchTerm
    ? [{ group: "SIK KULLANILANLAR", items: favItems }, ...filteredMenuItems]
    : filteredMenuItems;

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(GROUP_STATE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    return Object.fromEntries(menuItems.map((g) => [g.group, false]));
  });

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(expandedGroups));
    } catch {
      /* ignore */
    }
  }, [expandedGroups]);

  useEffect(() => {
    const activeGroup = displayMenuItems.find((g) => g.items.some((it) => it.key === activeTab));
    if (!activeGroup) return;
    setExpandedGroups((prev) => {
      if (prev[activeGroup.group]) return prev;
      return { ...prev, [activeGroup.group]: true };
    });
  }, [activeTab]);

  useEffect(() => {
    if (searchTerm) {
      const allExpanded = Object.fromEntries(displayMenuItems.map(g => [g.group, true]));
      setExpandedGroups(prev => ({ ...prev, ...allExpanded }));
    }
  }, [searchTerm]);

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 z-35 lg:hidden backdrop-blur-sm transition-opacity cursor-pointer animate-fade-in"
        />
      )}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-68 bg-white/95 backdrop-blur-2xl h-screen border-r border-slate-200/60 flex flex-col select-none shrink-0 font-sans text-slate-700 shadow-sm transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-sm transform hover:rotate-3 transition">
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
            className="lg:hidden text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          
        <div className="px-3">
          <button
            onClick={() => document.documentElement.classList.toggle('dark-mode')}
            className="w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl font-bold text-[11px] transition cursor-pointer shadow-sm keep-colors"
          >
            <Moon size={14} />
            <span>Gece Modu</span>
          </button>
        </div>

          <div className="px-3">
            <div className="relative mb-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Modül ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-slate-400 focus:bg-white transition-colors"
              />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Modüller
            </span>
          </div>

          {displayMenuItems.map((group, grpIdx) => (
            <div key={grpIdx} className="space-y-1.5">
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups((prev) => ({ ...prev, [group.group]: !prev[group.group] }))
                }
                className="w-full px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-between hover:text-slate-600 transition cursor-pointer"
              >
                <span>{group.group}</span>
                {expandedGroups[group.group] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expandedGroups[group.group] && group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                const isFav = favorites.includes(item.key);
                return (
                  <div key={item.key} className="relative group flex items-center">
                    <button
                      onClick={() => {
                        setActiveTab(item.key);
                        if (onClose) onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] transition-all duration-300 text-left cursor-pointer ${
                        isActive
                          ? "bg-slate-900 text-white shadow-md shadow-slate-900/15 font-bold translate-x-0.5"
                          : "text-slate-600 font-medium hover:bg-slate-100/70 hover:text-slate-900 hover:translate-x-0.5"
                      }`}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <Icon
                          size={16}
                          className={`shrink-0 transition-transform group-hover:scale-105 ${
                            isActive ? "text-slate-200" : "text-slate-400 group-hover:text-slate-600"
                          }`}
                        />
                        <span className="truncate pr-4">{item.label}</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFavorites(prev => 
                          isFav ? prev.filter(k => k !== item.key) : [...prev, item.key]
                        );
                      }}
                      className={`absolute right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                        isActive ? "hover:bg-slate-800 text-amber-400" : "hover:bg-slate-200 text-slate-400 hover:text-amber-500"
                      } ${isFav ? "opacity-100 text-amber-400" : ""}`}
                      title={isFav ? "Favorilerden Çıkar" : "Sık Kullanılanlara Ekle"}
                    >
                      {isFav ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 space-y-2">

          {onToggleMobileMode && (
            <button
              onClick={onToggleMobileMode}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer lg:hidden"
            >
              <Smartphone size={16} className="text-slate-400" />
              <span>Mobil Görünüme Geç</span>
            </button>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-[13px] font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
            >
              <LogOut size={16} />
              <span>Çıkış Yap</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
