import React, { useMemo } from 'react';
import {
  ShieldCheck, ShoppingCart, Users, Bell, ChevronRight, CalendarDays
} from 'lucide-react';
import { Personel, SatinAlmaTalebi } from '../types/erp';
import { todayDateKey } from '../lib/dateKeyUtils';

type Props = {
  personeller: Personel[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  bildirimler?: any[];
  onNavigate: (tab: string) => void;
};

export const DashboardTodaySummary: React.FC<Props> = ({
  personeller,
  satinAlmaTalepleri,
  bildirimler = [],
  onNavigate,
}) => {
  const today = todayDateKey();
  const todayLabel = useMemo(() => {
    try {
      return new Date(`${today}T12:00:00`).toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return today;
    }
  }, [today]);

  const activePersonel = useMemo(
    () => personeller.filter((p) => p.durum === true || String(p.durum) === 'true').length,
    [personeller]
  );

  const pendingSatinAlma = useMemo(
    () =>
      (satinAlmaTalepleri || []).filter(
        (sa) =>
          sa.onayDurumu === 'ONAY BEKLİYOR' ||
          sa.onayDurumu === 'BEKLİYOR' ||
          String(sa.onayDurumu || '').includes('BEKLİYOR')
      ).length,
    [satinAlmaTalepleri]
  );

  const unreadNotifs = useMemo(
    () => (bildirimler || []).filter((n) => !n.okundu).length,
    [bildirimler]
  );

  const chips = [
    { key: 'onay', label: 'Onay bekleyen', value: pendingSatinAlma, icon: ShoppingCart, tab: 'onay_islemleri', tone: pendingSatinAlma > 0 ? 'amber' : 'muted' },
    { key: 'personel', label: 'Aktif personel', value: activePersonel, icon: Users, tab: 'personel', tone: 'orange' },
    { key: 'bildirim', label: 'Okunmamış', value: unreadNotifs, icon: Bell, tab: 'ana_sayfa', tone: unreadNotifs > 0 ? 'rose' : 'muted' },
  ] as const;

  const toneClass = (tone: string) => {
    if (tone === 'amber') return 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80';
    if (tone === 'rose') return 'bg-rose-50 border-rose-200 text-rose-900 hover:bg-rose-100/80';
    if (tone === 'orange') return 'bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100/80';
    return 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/80';
  };

  return (
    <section className="rounded-2xl bg-white border border-orange-100/60 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <CalendarDays size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-none">Bugün</h3>
            <p className="text-[11px] text-slate-500 mt-1 capitalize">{todayLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('onay_islemleri')}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-600 hover:underline cursor-pointer self-start sm:self-auto"
        >
          <ShieldCheck size={13} />
          Onay Havuzu
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {chips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onNavigate(chip.tab)}
              className={`text-left rounded-xl border px-3.5 py-3 transition hover:-translate-y-0.5 cursor-pointer ${toneClass(chip.tone)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{chip.label}</span>
                <Icon size={14} className="opacity-70" />
              </div>
              <div className="font-display text-2xl font-bold tabular-nums mt-1 leading-none">{chip.value}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardTodaySummary;
