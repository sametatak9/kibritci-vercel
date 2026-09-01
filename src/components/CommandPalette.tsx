import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, ChevronRight, LayoutDashboard, Users, CreditCard, Tent, Truck,
  Settings, Camera, ShieldCheck, FileText, Package, Wallet, ClipboardList, MessageSquare, Pin, PinOff, Clock, Layers, BookOpen, Tags
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import {
  FAVORITES_STORAGE_KEY,
  pushRecentTab,
  readFavoriteTabs,
  readRecentTabs,
  toggleFavoriteTab,
} from '../lib/navPreferences';

interface CommandPaletteProps {
  onSelect: (route: string) => void;
}

const ROUTES = [
  { key: 'ana_sayfa', label: 'Ana Sayfa', icon: LayoutDashboard },
  { key: 'onay_islemleri', label: 'Onay Havuzu & İmzalar', icon: ShieldCheck },
  { key: 'guvenlik_ekrani', label: 'Güvenlik & Kapı Kontrol', icon: ShieldCheck },
  { key: 'personel', label: 'Personel Yönetimi', icon: Users },
  { key: 'personel_kartlari', label: 'Personel Kartı', icon: Users },
  { key: 'yoklama', label: 'Yoklama & Puantaj', icon: ClipboardList },
  { key: 'faaliyet_personel', label: 'Faaliyeti Olan Personeller', icon: Camera },
  { key: 'maas', label: 'Maaş Hesaplama', icon: CreditCard },
  { key: 'personel_izin', label: 'Personel İzin Formu', icon: FileText },
  { key: 'grup_kopru', label: 'Grup Köprüsü', icon: MessageSquare },
  { key: 'satin_alma', label: 'Satın Alma', icon: Package },
  { key: 'siparis_formu', label: 'Sipariş Formu', icon: ClipboardList },
  { key: 'irsaliye_giris', label: 'İrsaliye Girişi', icon: FileText },
  { key: 't_cetveli', label: 'T Cetveli', icon: BookOpen },
  { key: 'fatura_giris', label: 'Fatura Girişi', icon: FileText },
  { key: 'evrak_baglama', label: 'Evrak Bağlama', icon: FileText },
  { key: 'evrak_etiketleri', label: 'Evrak Etiketleri', icon: Tags },
  { key: 'cari_stok', label: 'Cari ve Stok Kartları', icon: Wallet },
  { key: 'kasa', label: 'Kasa', icon: Wallet },
  { key: 'kamp', label: 'Kamp Yönetimi', icon: Tent },
  { key: 'kampci_ekrani', label: 'Kampçı Ekranı', icon: Tent },
  { key: 'seramik_ekrani', label: 'Götürü / Seramik Mobil', icon: Layers },
  { key: 'arac', label: 'Araç ve Demirbaş', icon: Truck },
  { key: 'lojistik_ekrani', label: 'Lojistik', icon: Truck },
  { key: 'depocu_ekrani', label: 'Depocu', icon: Package },
  { key: 'formen_ekrani', label: 'Formen Ekranı', icon: Users },
  { key: 'proje_ilerleme', label: 'Proje İlerlemesi', icon: ClipboardList },
  { key: 'sohbet', label: 'Sohbet', icon: MessageSquare },
  { key: 'eposta', label: 'E-Posta', icon: MessageSquare },
  { key: 'admin', label: 'Üyelik Onay & İmza', icon: Settings },
  { key: 'yetki_verme', label: 'Yetki Verme', icon: Settings },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [favorites, setFavorites] = useState<string[]>(() => readFavoriteTabs());
  const [recents, setRecents] = useState<string[]>(() => readRecentTabs());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    const openFromEvent = () => setIsOpen(true);
    const syncFav = () => setFavorites(readFavoriteTabs());
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('kibritci-open-command-palette', openFromEvent as EventListener);
    window.addEventListener('storage', syncFav);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('kibritci-open-command-palette', openFromEvent as EventListener);
      window.removeEventListener('storage', syncFav);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setFavorites(readFavoriteTabs());
      setRecents(readRecentTabs());
      inputRef.current?.focus();
      setActiveIndex(0);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const kw = query.toLocaleLowerCase('tr-TR').trim();
    let list = ROUTES.filter((r) => r.label.toLocaleLowerCase('tr-TR').includes(kw));
    // Favoriler üste
    list = [...list].sort((a, b) => {
      const af = favorites.includes(a.key) ? 0 : 1;
      const bf = favorites.includes(b.key) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.label.localeCompare(b.label, 'tr');
    });
    return list;
  }, [query, favorites]);

  const recentRoutes = useMemo(() => {
    if (query.trim()) return [];
    return recents
      .map((key) => ROUTES.find((r) => r.key === key))
      .filter(Boolean) as typeof ROUTES;
  }, [recents, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleSelect = (key: string) => {
    pushRecentTab(key);
    setRecents(readRecentTabs());
    onSelect(key);
    setIsOpen(false);
    setQuery('');
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      handleSelect(filtered[activeIndex].key);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-900/35 backdrop-blur-sm flex items-start justify-center pt-[12vh] p-4">
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Hızlı menü"
      >
        <div className="flex items-center px-4 py-3 border-b border-slate-100 bg-slate-50/80">
          <Search size={18} className="text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 font-medium text-sm"
            placeholder="Modül ara… favoriler üstte görünür"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {!query.trim() && recentRoutes.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Clock size={10} /> Son gezilenler
              </p>
              <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                {recentRoutes.map((r) => (
                  <button
                    key={`recent-${r.key}`}
                    type="button"
                    onClick={() => handleSelect(r.key)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:border-[#B9DBD2] cursor-pointer"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Sonuç bulunamadı"
              description="Farklı bir kelime deneyin."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            filtered.map((route, i) => {
              const Icon = route.icon;
              const active = i === activeIndex;
              const isFav = favorites.includes(route.key);
              return (
                <div
                  key={route.key}
                  className={`flex items-center gap-1 rounded-xl ${active ? 'bg-[#E3F2EE]' : 'hover:bg-slate-50'}`}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(route.key)}
                    className="flex-1 flex items-center justify-between px-3.5 py-2.5 cursor-pointer group text-left min-w-0"
                  >
                    <div className="flex items-center gap-3 text-slate-700 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                          active
                            ? 'bg-white border-[#B9DBD2] text-[#0F6C5C]'
                            : 'bg-slate-100 border-transparent text-slate-500'
                        }`}
                      >
                        <Icon size={15} />
                      </div>
                      <span className="font-medium text-[13px] truncate">{route.label}</span>
                      {isFav && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                          Favori
                        </span>
                      )}
                    </div>
                    <ChevronRight size={15} className={active ? 'text-[#0F6C5C]' : 'text-slate-300'} />
                  </button>
                  <button
                    type="button"
                    title={isFav ? 'Favoriden çıkar' : 'Favoriye ekle'}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = toggleFavoriteTab(route.key);
                      setFavorites(next);
                      // Sidebar aynı key'i dinlesin diye storage event tetikle
                      window.dispatchEvent(
                        new StorageEvent('storage', { key: FAVORITES_STORAGE_KEY })
                      );
                    }}
                    className={`p-2 mr-1 rounded-lg cursor-pointer shrink-0 ${
                      isFav ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
                    }`}
                  >
                    {isFav ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="absolute inset-0 z-[-1]" onClick={() => setIsOpen(false)} />
    </div>
  );
};

export default CommandPalette;
