import React, { useMemo } from 'react';
import { Activity, ChevronRight, ShoppingCart, Wallet, Bell } from 'lucide-react';
import { KasaHareketi, SatinAlmaTalebi } from '../types/erp';
import { EmptyState } from './EmptyState';

type Props = {
  kasaHareketleri: KasaHareketi[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  bildirimler?: any[];
  onNavigate: (tab: string) => void;
};

type FeedItem = {
  id: string;
  kind: 'kasa' | 'satin_alma' | 'bildirim';
  title: string;
  meta: string;
  sortKey: string;
  tab: string;
};

function sortKeyFromDate(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T12:00:00`;
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  } catch {
    /* ignore */
  }
  return s;
}

/** Ana sayfa — son kasa / satın alma / bildirim hareketleri (salt okunur). */
export const DashboardSonIslemlerFeed: React.FC<Props> = ({
  kasaHareketleri,
  satinAlmaTalepleri,
  bildirimler = [],
  onNavigate,
}) => {
  const items = useMemo(() => {
    const list: FeedItem[] = [];

    (kasaHareketleri || []).forEach((k, idx) => {
      const tutar = Number(k.tutar) || 0;
      list.push({
        id: `kasa-${k.id || idx}`,
        kind: 'kasa',
        title: `${k.hareketTipi || 'Kasa'} · ${Math.round(tutar).toLocaleString('tr-TR')} ₺`,
        meta: k.aciklama || k.tarih || 'Kasa hareketi',
        sortKey: sortKeyFromDate(k.tarih),
        tab: 'kasa',
      });
    });

    (satinAlmaTalepleri || []).forEach((sa, idx) => {
      list.push({
        id: `sa-${sa.id || sa.saId || idx}`,
        kind: 'satin_alma',
        title: `${sa.saId || 'SA'} · ${sa.cariFirma || 'Firma'}`,
        meta: `${sa.onayDurumu || '—'} · ${sa.tarih || ''}`,
        sortKey: sortKeyFromDate((sa as any).gonderimTarihi || sa.tarih),
        tab: 'satin_alma',
      });
    });

    (bildirimler || []).slice(0, 20).forEach((n, idx) => {
      list.push({
        id: `ntf-${n.id || idx}`,
        kind: 'bildirim',
        title: String(n.mesaj || 'Bildirim').slice(0, 80),
        meta: n.tarih ? new Date(n.tarih).toLocaleString('tr-TR') : 'Bildirim',
        sortKey: sortKeyFromDate(n.tarih),
        tab: 'guvenlik_ekrani',
      });
    });

    return list
      .filter((x) => x.sortKey)
      .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)))
      .slice(0, 10);
  }, [kasaHareketleri, satinAlmaTalepleri, bildirimler]);

  const iconFor = (kind: FeedItem['kind']) => {
    if (kind === 'kasa') return Wallet;
    if (kind === 'satin_alma') return ShoppingCart;
    return Bell;
  };

  return (
    <section className="rounded-2xl bg-white border border-orange-100/60 p-4 sm:p-5 shadow-sm h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
            <Activity size={17} />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-none">Son İşlemler</h3>
            <p className="text-[11px] text-slate-500 mt-1">Kasa, satın alma, bildirimler</p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Henüz hareket yok"
          description="Kasa veya satın alma kaydı düştükçe burada listelenir."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const Icon = iconFor(item.kind);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="w-full flex items-center gap-2.5 py-2.5 text-left hover:bg-orange-50/50 rounded-lg px-1 transition cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 text-orange-600">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-bold text-slate-800 truncate">{item.title}</span>
                    <span className="block text-[10px] text-slate-500 truncate">{item.meta}</span>
                  </span>
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default DashboardSonIslemlerFeed;
