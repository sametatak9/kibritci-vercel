import React from 'react';
import { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

/** Boş liste / sonuç yok — mevcut ekranları bozmadan eklenebilir. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-10 rounded-2xl border border-dashed border-slate-200 bg-white/80 ${className}`}
    >
      {Icon && (
        <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
          <Icon size={20} />
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {description && (
        <p className="text-[11px] text-slate-500 mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-[11px] font-bold px-3.5 py-2 rounded-xl bg-[#0F6C5C] text-white hover:bg-[#0C584B] transition cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
