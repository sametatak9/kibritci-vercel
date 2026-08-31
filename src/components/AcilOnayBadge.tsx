import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { isPendingOlderThanHours } from '../lib/acilOnayUtils';

type Props = {
  tarih?: string | null;
  saat?: string | null;
  hours?: number;
};

/** 24 saatten eski bekleyen onaylar için hafif uyarı rozeti */
export const AcilOnayBadge: React.FC<Props> = ({ tarih, saat, hours = 24 }) => {
  if (!isPendingOlderThanHours(tarih, saat, hours)) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md shrink-0"
      title={`${hours} saatten uzun süredir bekliyor`}
    >
      <AlertTriangle size={10} />
      Acil
    </span>
  );
};

export default AcilOnayBadge;
