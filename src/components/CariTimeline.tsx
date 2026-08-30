import React, { useMemo } from 'react';
import { FileText, Receipt, Truck } from 'lucide-react';
import { EmptyState } from './EmptyState';

export type CariTimelineItem = {
  id: string;
  type: string;
  title: string;
  desc?: string;
  date: string;
};

type Props = {
  cariUnvan: string;
  items: CariTimelineItem[];
  onOpenAll?: () => void;
  className?: string;
};

function iconFor(type: string) {
  const t = type.toLocaleUpperCase('tr-TR');
  if (t.includes('FATURA')) return Receipt;
  if (t.includes('İRSALİYE') || t.includes('IRSALIYE')) return Truck;
  return FileText;
}

/** Cari kart altında salt-okunur irsaliye/fatura zaman çizelgesi. */
export const CariTimeline: React.FC<Props> = ({
  cariUnvan,
  items,
  onOpenAll,
  className = '',
}) => {
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [items]);

  const top = sorted.slice(0, 8);

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3
            className="text-base font-extrabold tracking-tight text-slate-900"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
          >
            Geçmiş İrsaliyeler
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">
            {cariUnvan} · seçerek faturaya dönüştürülebilir
          </p>
        </div>
        {onOpenAll && (
          <button
            type="button"
            onClick={onOpenAll}
            className="text-[10px] font-bold text-[#0F6C5C] hover:underline cursor-pointer shrink-0"
          >
            Listeye git
          </button>
        )}
      </div>

      {top.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Henüz irsaliye yok"
          description="Yıldırım / Vidanjör vb. onaylanınca irsaliye olarak buraya düşer; istenirse seçilip faturaya dönüştürülür."
          className="py-6 border-slate-100"
        />
      ) : (
        <ol className="relative border-l border-slate-200 ml-2.5 space-y-0">
          {top.map((item) => {
            const Icon = iconFor(item.type);
            return (
              <li key={item.id} className="relative pl-5 pb-4 last:pb-0">
                <span className="absolute -left-[9px] top-1 w-[17px] h-[17px] rounded-full bg-[#E3F2EE] border border-[#B9DBD2] flex items-center justify-center">
                  <Icon size={9} className="text-[#0F6C5C]" />
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {item.type}
                    </p>
                    <p className="text-[12px] font-semibold text-slate-800 truncate">{item.title}</p>
                    {item.desc && (
                      <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{item.desc}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{item.date}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default CariTimeline;
