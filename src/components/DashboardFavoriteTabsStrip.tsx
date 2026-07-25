import React, { useEffect, useState } from 'react';
import {
  Pin, LayoutDashboard, ShieldCheck, Users, ClipboardList, Camera, CreditCard,
  FileText, Package, Wallet, Tent, Truck, Settings, MessageSquare, ShoppingCart, Home
} from 'lucide-react';
import { readFavoriteTabs, FAVORITES_STORAGE_KEY } from '../lib/navPreferences';

type Props = {
  onNavigate: (tab: string) => void;
};

const TAB_META: Record<string, { label: string; icon: React.ElementType }> = {
  ana_sayfa: { label: 'Ana Sayfa', icon: Home },
  onay_islemleri: { label: 'Onay Havuzu', icon: ShieldCheck },
  guvenlik_ekrani: { label: 'Güvenlik', icon: ShieldCheck },
  personel: { label: 'Personel', icon: Users },
  personel_kartlari: { label: 'Personel Kartları', icon: Users },
  yoklama: { label: 'Yoklama', icon: ClipboardList },
  faaliyet_personel: { label: 'Faaliyet Personel', icon: Camera },
  maas: { label: 'Maaş', icon: CreditCard },
  maas_odeme: { label: 'Maaş Ödeme', icon: CreditCard },
  personel_izin: { label: 'İzin Formu', icon: FileText },
  satin_alma: { label: 'Satın Alma', icon: ShoppingCart },
  irsaliye_giris: { label: 'İrsaliye', icon: FileText },
  fatura_giris: { label: 'Fatura', icon: FileText },
  cari_stok: { label: 'Cari / Stok', icon: Wallet },
  kasa: { label: 'Kasa', icon: Wallet },
  kamp: { label: 'Kamp', icon: Tent },
  kampci_ekrani: { label: 'Kampçı', icon: Tent },
  arac: { label: 'Araç', icon: Truck },
  lojistik_ekrani: { label: 'Lojistik', icon: Truck },
  depocu_ekrani: { label: 'Depocu', icon: Package },
  formen_ekrani: { label: 'Formen', icon: Users },
  imalat_terminali: { label: 'İmalat', icon: Settings },
  sohbet: { label: 'Sohbet', icon: MessageSquare },
  eposta: { label: 'E-Posta', icon: MessageSquare },
  admin: { label: 'Admin', icon: Settings },
  yetki_verme: { label: 'Yetki', icon: Settings },
};

/** Sidebar pin’lerini ana sayfada büyük kısayol şeridi olarak gösterir. */
export const DashboardFavoriteTabsStrip: React.FC<Props> = ({ onNavigate }) => {
  const [favorites, setFavorites] = useState<string[]>(() => readFavoriteTabs());

  useEffect(() => {
    const sync = () => setFavorites(readFavoriteTabs());
    window.addEventListener('storage', sync);
    window.addEventListener('kibritci-favorites-changed', sync as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('kibritci-favorites-changed', sync as EventListener);
    };
  }, []);

  // Favori yoksa şeridi gizle — paneli şişirmesin
  if (favorites.length === 0) {
    return (
      <section className="bg-white border border-dashed border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-[11px] text-slate-500">
        <Pin size={14} className="text-slate-400 shrink-0" />
        <span>
          Favori modül yok. Sol menüde veya Ctrl+K’de pinleyin; burada kısayol olarak görünür.
        </span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('kibritci-open-command-palette'))}
          className="ml-auto shrink-0 font-bold text-[#0F6C5C] hover:underline cursor-pointer"
        >
          Ctrl+K
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#E3F2EE] text-[#0F6C5C] flex items-center justify-center">
          <Pin size={15} />
        </div>
        <div>
          <h3
            className="text-base font-extrabold tracking-tight text-slate-900 leading-none"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
          >
            Favori modüller
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Pinlediğiniz sekmelere tek tık</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {favorites.map((key) => {
          const meta = TAB_META[key] || { label: key, icon: LayoutDashboard };
          const Icon = meta.icon;
          return (
            <button
              key={`${FAVORITES_STORAGE_KEY}-${key}`}
              type="button"
              onClick={() => onNavigate(key)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-[#B9DBD2] text-[11px] font-bold text-slate-800 transition cursor-pointer"
            >
              <Icon size={14} className="text-[#0F6C5C]" />
              {meta.label}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardFavoriteTabsStrip;
