import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export type EvrakIslemItem = {
  label: string;
  onClick: () => void;
  hidden?: boolean;
  danger?: boolean;
};

export function EvrakIslemMenu({ items }: { items: EvrakIslemItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        Diğer
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-2 text-[11px] font-semibold cursor-pointer hover:bg-slate-50 ${
                item.danger ? 'text-rose-700' : 'text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
