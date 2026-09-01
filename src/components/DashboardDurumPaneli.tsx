import React from 'react';
import { AlertTriangle, FileWarning, ShoppingCart, ShieldCheck, Tent } from 'lucide-react';
import type { OperasyonOzet } from '../lib/operasyonUyarilari';

type Props = {
  ozet: OperasyonOzet;
  unreadNotifs: number;
  onNavigate: (tab: string) => void;
};

type Satir = {
  key: string;
  title: string;
  detail: string;
  seviye: 'ok' | 'warn' | 'critical';
  tab: string;
  icon: React.ElementType;
};

export const DashboardDurumPaneli: React.FC<Props> = ({ ozet, unreadNotifs, onNavigate }) => {
  const satirlar: Satir[] = [];

  if (ozet.bekleyenOnay > 0) {
    satirlar.push({
      key: 'onay',
      title: `${ozet.bekleyenOnay} bekleyen onay`,
      detail: ozet.gecikenOnay > 0 ? `${ozet.gecikenOnay} tanesi 48 saati geçti` : 'Onay havuzunda bekliyor',
      seviye: ozet.gecikenOnay > 0 ? 'critical' : 'warn',
      tab: 'onay_islemleri',
      icon: ShieldCheck,
    });
  }
  if (ozet.bekleyenSatinAlma > 0) {
    satirlar.push({
      key: 'sa',
      title: `${ozet.bekleyenSatinAlma} satın alma bekliyor`,
      detail: 'Talep henüz onaylanmadı',
      seviye: 'warn',
      tab: 'satin_alma',
      icon: ShoppingCart,
    });
  }
  if (ozet.faturasizIrsaliye > 0) {
    satirlar.push({
      key: 'ir',
      title: `${ozet.faturasizIrsaliye} faturasız irsaliye`,
      detail:
        ozet.faturasizEski > 0
          ? `${ozet.faturasizEski} tanesi 3 günden eski — fatura halkası açık`
          : 'İrsaliye–fatura eşlemesi bekleniyor',
      seviye: ozet.faturasizEski > 0 ? 'critical' : 'warn',
      tab: 'irsaliye_fatura',
      icon: FileWarning,
    });
  }
  for (const u of ozet.kampUyarilari.slice(0, 4)) {
    satirlar.push({
      key: `kamp-${u.tip}-${u.baslik}`,
      title: u.baslik,
      detail: u.detay,
      seviye: u.seviye === 'info' ? 'ok' : u.seviye,
      tab: 'kamp',
      icon: Tent,
    });
  }
  if (unreadNotifs > 0) {
    satirlar.push({
      key: 'bildirim',
      title: `${unreadNotifs} okunmamış bildirim`,
      detail: 'Üst çubuktan açılır',
      seviye: unreadNotifs > 8 ? 'warn' : 'ok',
      tab: 'ana_sayfa',
      icon: AlertTriangle,
    });
  }

  const tone = (seviye: Satir['seviye']) => {
    if (seviye === 'critical') return 'border-rose-200 bg-rose-50/70 text-rose-950';
    if (seviye === 'warn') return 'border-amber-200 bg-amber-50/70 text-amber-950';
    return 'border-slate-100 bg-slate-50 text-slate-800';
  };

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="font-display font-bold text-sm text-slate-900">Şantiye nabzı</h2>
          <p className="text-[11px] text-slate-500">Kısayol değil — açık işler ve uyarılar.</p>
        </div>
        {satirlar.length === 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
            Sakin
          </span>
        )}
      </div>

      {satirlar.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center leading-relaxed">
          Bekleyen onay, faturasız irsaliye veya kamp uyarısı yok. Günlük yoklama ve son işlemler aşağıda.
        </p>
      ) : (
        <ul className="space-y-2">
          {satirlar.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onNavigate(s.tab)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-3 cursor-pointer hover:shadow-sm transition ${tone(s.seviye)}`}
                >
                  <Icon size={15} className="mt-0.5 shrink-0 opacity-80" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold">{s.title}</span>
                    <span className="block text-[10px] opacity-80">{s.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
