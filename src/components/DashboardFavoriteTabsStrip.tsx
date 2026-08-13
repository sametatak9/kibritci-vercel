import React, { useEffect, useState } from 'react';
import {
  Pin, LayoutDashboard, ShieldCheck, Users, ClipboardList, Camera, CreditCard,
  FileText, Package, Wallet, Tent, Truck, Settings, MessageSquare, ShoppingCart, Home, BookOpen
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
  siparis_formu: { label: 'Sipariş Formu', icon: ClipboardList },
  irsaliye_giris: { label: 'İrsaliye', icon: FileText },
  t_cetveli: { label: 'T Cetveli', icon: BookOpen },
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

  if (favorites.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-orange-200/70 bg-orange-50/30 px-4 py-3 flex items-center gap-2 text-[11px] text-slate-600">
        <Pin size={14} className="text-orange-400 shrink-0" />
        <span>Favori modül yok — sol menüden pinleyin; burada kısayol olarak görünür.</span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('kibritci-open-command-palette'))}
          className="ml-auto shrink-0 font-bold text-orange-600 hover:underline cursor-pointer"
        >
          Ctrl+K
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border border-orange-100/60 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
          <Pin size={15} />
        </div>
        <div>
          <h3 className="font-display font-bold text-sm text-slate-900">Favori Modüller</h3>
          <p className="text-[10px] text-slate-500">Pinlediğiniz sekmelere tek tık</p>
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
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-2 rounded-xl border border-orange-100 bg-orange-50/40 hover:bg-orange-50 hover:border-orange-200 text-[11px] font-bold text-slate-800 transition cursor-pointer"
            >
              <Icon size={14} className="text-orange-600" />
              {meta.label}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardFavoriteTabsStrip;
