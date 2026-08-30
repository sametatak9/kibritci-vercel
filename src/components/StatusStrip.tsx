import React, { useMemo } from 'react';
import { Bell, Inbox, Search, Activity, Clock } from 'lucide-react';
import { SatinAlmaTalebi, Irsaliye, Fatura } from '../types/erp';
import { countChromePendingOnay, countStaleChromePendingOnay } from '../lib/onayInboxUtils';

type Props = {
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  faturalar?: Fatura[];
  bildirimler?: any[];
  dbStatus?: 'loading' | 'synced' | 'error' | 'offline';
  onNavigate: (tab: string) => void;
  onOpenCommandPalette?: () => void;
};

/** Üst ince durum şeridi — salt okunur özet, mevcut akışı bozmaz. */
export const StatusStrip: React.FC<Props> = ({
  satinAlmaTalepleri = [],
  irsaliyeler = [],
  faturalar = [],
  bildirimler = [],
  dbStatus = 'synced',
  onNavigate,
  onOpenCommandPalette,
}) => {
  const pendingOnay = useMemo(
    () => countChromePendingOnay({ satinAlmaTalepleri, irsaliyeler, faturalar }),
    [satinAlmaTalepleri, irsaliyeler, faturalar]
  );
  const staleOnay = useMemo(
    () => countStaleChromePendingOnay({ satinAlmaTalepleri, irsaliyeler, faturalar }, 48),
    [satinAlmaTalepleri, irsaliyeler, faturalar]
  );
  const unread = useMemo(() => bildirimler.filter((n) => !n.okundu).length, [bildirimler]);

  const dbLabel =
    dbStatus === 'loading'
      ? 'Senkron…'
      : dbStatus === 'error'
        ? 'Bağlantı hatası'
        : dbStatus === 'offline'
          ? 'Çevrimdışı'
          : 'Canlı';

  const dbTone =
    dbStatus === 'synced'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : dbStatus === 'loading'
        ? 'text-sky-700 bg-sky-50 border-sky-200'
        : 'text-rose-700 bg-rose-50 border-rose-200';

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur-sm px-3 sm:px-4 py-1.5 flex items-center gap-2 overflow-x-auto text-[11px]">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold shrink-0 ${dbTone}`}>
        <Activity size={11} />
        {dbLabel}
      </span>

      <button
        type="button"
        onClick={() => onNavigate('onay_islemleri')}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold shrink-0 cursor-pointer transition ${
          pendingOnay > 0
            ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
        }`}
        title="Onay havuzuna git"
      >
        <Inbox size={11} />
        Onay inbox: {pendingOnay}
      </button>

      {staleOnay > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('onay_islemleri')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold shrink-0 cursor-pointer transition bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100"
          title="48 saatten uzun süredir bekleyen onaylar"
        >
          <Clock size={11} />
          Geciken onay: {staleOnay}
        </button>
      )}

      <button
        type="button"
        onClick={() => onNavigate('ana_sayfa')}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold shrink-0 cursor-pointer transition ${
          unread > 0
            ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Bell size={11} />
        Bildirim: {unread}
      </button>

      <button
        type="button"
        onClick={() => {
          if (onOpenCommandPalette) onOpenCommandPalette();
          else window.dispatchEvent(new CustomEvent('kibritci-open-command-palette'));
        }}
        className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-600 font-semibold shrink-0 hover:bg-slate-100 cursor-pointer"
        title="Hızlı menü (Ctrl+K)"
      >
        <Search size={11} />
        <span className="hidden sm:inline">Hızlı menü</span>
        <kbd className="hidden md:inline text-[9px] font-mono px-1 rounded border border-slate-200 bg-white">
          Ctrl+K
        </kbd>
      </button>
    </div>
  );
};

export default StatusStrip;
