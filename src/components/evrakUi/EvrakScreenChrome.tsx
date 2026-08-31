import React from 'react';
import { Search, Sparkles, FileStack, PenLine } from 'lucide-react';

export type EvrakAccent = 'sa' | 'ir' | 'ft';

const ACCENT: Record<
  EvrakAccent,
  {
    ring: string;
    soft: string;
    softBorder: string;
    solid: string;
    solidHover: string;
    text: string;
    glow: string;
    bar: string;
    drop: string;
    rowHover: string;
  }
> = {
  sa: {
    ring: 'ring-slate-900/10',
    soft: 'bg-slate-100',
    softBorder: 'border-slate-200',
    solid: 'bg-slate-900',
    solidHover: 'hover:bg-slate-800',
    text: 'text-slate-900',
    glow: 'from-slate-950 via-slate-900 to-slate-800',
    bar: 'bg-amber-400',
    drop: 'border-slate-300 hover:border-slate-500 hover:bg-slate-50',
    rowHover: 'hover:bg-slate-50/90',
  },
  ir: {
    ring: 'ring-emerald-700/10',
    soft: 'bg-emerald-50',
    softBorder: 'border-emerald-100',
    solid: 'bg-emerald-700',
    solidHover: 'hover:bg-emerald-800',
    text: 'text-emerald-900',
    glow: 'from-emerald-950 via-emerald-900 to-teal-900',
    bar: 'bg-emerald-400',
    drop: 'border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/40',
    rowHover: 'hover:bg-emerald-50/40',
  },
  ft: {
    ring: 'ring-blue-700/10',
    soft: 'bg-blue-50',
    softBorder: 'border-blue-100',
    solid: 'bg-blue-700',
    solidHover: 'hover:bg-blue-800',
    text: 'text-blue-900',
    glow: 'from-blue-950 via-blue-900 to-indigo-950',
    bar: 'bg-sky-400',
    drop: 'border-blue-200 hover:border-blue-500 hover:bg-blue-50/40',
    rowHover: 'hover:bg-blue-50/40',
  },
};

export function EvrakPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex-grow p-4 sm:p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans gap-5 select-none">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 10% -10%, rgba(15,23,42,0.06), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 0%, rgba(5,150,105,0.05), transparent 50%), linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        }}
      />
      {children}
    </div>
  );
}

export function EvrakSectionHeader({
  accent,
  eyebrow,
  title,
  subtitle,
  action,
}: {
  accent: EvrakAccent;
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.bar}`} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 pl-5">
        <div className="min-w-0 space-y-0.5">
          <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${a.text}`}>{eyebrow}</p>
          <h2 className="font-display font-bold text-base text-slate-900 tracking-tight">{title}</h2>
          {subtitle ? <p className="text-[11px] text-slate-500 font-medium">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EvrakFormCard({
  accent,
  icon,
  title,
  subtitle,
  badge,
  children,
  footer,
}: {
  accent: EvrakAccent;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`w-full lg:w-[440px] shrink-0 bg-white border border-slate-200/90 rounded-2xl flex flex-col overflow-hidden shadow-sm ring-1 ${a.ring} animate-[evrakFadeIn_0.35s_ease-out]`}
    >
      <div className={`bg-gradient-to-r ${a.glow} text-white p-4 shrink-0`}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-semibold text-sm leading-tight">{title}</h3>
              {badge ? (
                <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/15 border border-white/20">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="text-[10px] text-white/65 mt-0.5">{subtitle}</p>
          </div>
          <PenLine className="w-3.5 h-3.5 text-white/40 shrink-0 mt-1" />
        </div>
      </div>
      <div className="flex-grow p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 max-h-[min(72vh,720px)]">
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4">{footer}</div>
      ) : null}
    </div>
  );
}

export function EvrakAiDropzone({
  accent,
  title,
  hint,
  loading,
  error,
  success,
  onFile,
}: {
  accent: EvrakAccent;
  title: string;
  hint: string;
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  onFile: (file: File) => void;
}) {
  const a = ACCENT[accent];
  return (
    <div className={`rounded-2xl border ${a.softBorder} ${a.soft} p-3.5 space-y-2.5`}>
      <div className="flex items-center gap-1.5">
        <Sparkles className={`w-3.5 h-3.5 ${a.text}`} />
        <span className={`font-extrabold tracking-wide text-[9px] uppercase ${a.text}`}>{title}</span>
      </div>
      <p className="text-[10px] text-slate-600 font-medium leading-relaxed">{hint}</p>
      <div
        className={`relative border-2 border-dashed rounded-xl p-5 text-center bg-white transition-colors duration-200 cursor-pointer ${a.drop}`}
      >
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {loading ? (
          <span className={`text-[10px] font-bold ${a.text} block animate-pulse`}>Belge çözümleniyor…</span>
        ) : (
          <div className="space-y-1 pointer-events-none">
            <FileStack className="w-5 h-5 mx-auto text-slate-400" />
            <span className="text-[10px] font-bold text-slate-600 block">Dosya seçin veya sürükleyin</span>
            <span className="text-[9px] text-slate-400">PDF / görsel</span>
          </div>
        )}
      </div>
      {error ? <p className="text-[9px] font-bold text-rose-600">{error}</p> : null}
      {success ? <p className="text-[9px] font-bold text-emerald-700">{success}</p> : null}
    </div>
  );
}

export function EvrakField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      {children}
      {hint ? <span className="text-[9px] text-slate-400 font-medium">{hint}</span> : null}
    </label>
  );
}

export const evrakInputClass =
  'w-full text-xs font-semibold mt-0.5 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 transition';

export function EvrakArchivePanel({
  accent,
  title,
  toolbar,
  children,
  empty,
  isEmpty,
}: {
  accent: EvrakAccent;
  title: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  empty?: string;
  isEmpty?: boolean;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`flex-1 min-w-0 bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden ring-1 ${a.ring} flex flex-col animate-[evrakFadeIn_0.45s_ease-out]`}
    >
      <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gradient-to-r from-white to-slate-50/80">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${a.bar}`} />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{title}</h4>
        </div>
        {toolbar}
      </div>
      <div className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col min-h-0">
        {children}
        {isEmpty ? (
          <div className="flex-1 flex items-center justify-center py-12 text-center">
            <div className="space-y-1">
              <FileStack className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs text-slate-400 italic">{empty || 'Kayıt bulunamadı.'}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EvrakArchiveSearch({
  value,
  onChange,
  placeholder,
  filters,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  filters?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-[11px] font-semibold pl-8 pr-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
        />
      </div>
      {filters}
    </div>
  );
}

export function EvrakFilterChips<T extends string>({
  accent,
  options,
  value,
  onChange,
}: {
  accent: EvrakAccent;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const a = ACCENT[accent];
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`text-[10px] font-bold px-2.5 py-2 rounded-xl border cursor-pointer transition ${
            value === opt.id
              ? `${a.solid} text-white border-transparent shadow-sm`
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EvrakTableWrap({
  accent,
  children,
}: {
  accent: EvrakAccent;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className="flex-1 min-h-[220px] max-h-[min(58vh,520px)] overflow-auto border border-slate-100 rounded-xl bg-white">
      <table className="w-full text-[11px] border-collapse">
        <style>{`
          @keyframes evrakFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        {children}
      </table>
      {/* row hover class available via accent */}
      <span className="hidden" data-row-hover={a.rowHover} />
    </div>
  );
}

export function EvrakTableHead({ cols }: { cols: string[] }) {
  return (
    <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm">
      <tr className="text-left text-slate-500 border-b border-slate-100">
        {cols.map((c) => (
          <th key={c} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function EvrakListCard({
  accent,
  children,
  className = '',
}: {
  accent: EvrakAccent;
  children: React.ReactNode;
  className?: string;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`border border-slate-150 rounded-2xl p-4 bg-white ${a.rowHover} hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col space-y-3 text-xs text-slate-700 ${className}`}
    >
      {children}
    </div>
  );
}

export function EvrakPrimaryButton({
  accent,
  children,
  onClick,
  type = 'button',
}: {
  accent: EvrakAccent;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  const a = ACCENT[accent];
  return (
    <button
      type={type}
      onClick={onClick}
      className={`flex-1 ${a.solid} ${a.solidHover} text-white font-bold py-2.5 rounded-xl text-center shadow-sm cursor-pointer transition text-xs`}
    >
      {children}
    </button>
  );
}

export function EvrakGhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 rounded-xl text-center cursor-pointer transition text-xs"
    >
      {children}
    </button>
  );
}
