import React, { memo } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { Personel } from '../types/erp';

type Props = {
  person: Personel;
  isSelected: boolean;
  isChecked: boolean;
  firmaLabel: string;
  aktif: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
};

export const PersonelKartListRow = memo(function PersonelKartListRow({
  person,
  isSelected,
  isChecked,
  firmaLabel,
  aktif,
  onSelect,
  onToggleCheck,
}: Props) {
  return (
    <div
      onClick={() => onSelect(person.id)}
      className={`flex items-center gap-2 px-2.5 h-11 cursor-pointer border-b border-orange-50/80 transition-colors ${
        isSelected
          ? 'bg-orange-50 border-l-2 border-l-orange-500'
          : 'hover:bg-orange-50/40 border-l-2 border-l-transparent'
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(person.id);
        }}
        className="shrink-0 text-slate-400 hover:text-orange-600 cursor-pointer"
      >
        {isChecked ? <CheckSquare size={12} className="text-orange-600" /> : <Square size={12} />}
      </button>

      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ${
          aktif ? 'bg-gradient-to-br from-orange-400 to-amber-600' : 'bg-slate-400'
        }`}
      >
        {person.ad[0]}
        {person.soyad[0]}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-bold truncate ${isSelected ? 'text-orange-950' : 'text-slate-800'}`}>
          {person.ad} {person.soyad}
        </p>
        <p className="text-[9px] text-slate-500 truncate">
          {person.gorev || '—'}
          {firmaLabel ? ` · ${firmaLabel}` : ''}
        </p>
      </div>

      <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${aktif ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    </div>
  );
});

export default PersonelKartListRow;
