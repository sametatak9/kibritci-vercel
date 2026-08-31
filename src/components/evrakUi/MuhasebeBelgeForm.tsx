import React from 'react';
import { Plus, Trash2, ScanLine, Paperclip, X } from 'lucide-react';

export type MuhasebeVariant = 'fatura' | 'irsaliye' | 'siparis';

const THEME: Record<
  MuhasebeVariant,
  { accent: string; accentHover: string; chip: string; title: string }
> = {
  fatura: {
    accent: 'bg-blue-600',
    accentHover: 'hover:bg-blue-700',
    chip: 'bg-blue-50 text-blue-800',
    title: 'Fatura',
  },
  irsaliye: {
    accent: 'bg-emerald-600',
    accentHover: 'hover:bg-emerald-700',
    chip: 'bg-emerald-50 text-emerald-800',
    title: 'İrsaliye',
  },
  siparis: {
    accent: 'bg-slate-900',
    accentHover: 'hover:bg-slate-800',
    chip: 'bg-slate-100 text-slate-800',
    title: 'Sipariş',
  },
};

const UNITS = ['ADET', 'TON', 'KG', 'M3', 'TORBA', 'METRE', 'PAKET'];

export function MuhasebeBelgeForm({
  variant,
  editing,
  banner,
  fields,
  extraFields,
  attachments,
  ai,
  itemsTable,
  totals,
  onClear,
  onSave,
  saveLabel,
}: {
  variant: MuhasebeVariant;
  editing?: boolean;
  banner?: React.ReactNode;
  fields: React.ReactNode;
  extraFields?: React.ReactNode;
  attachments?: React.ReactNode;
  ai?: React.ReactNode;
  itemsTable: React.ReactNode;
  totals?: React.ReactNode;
  onClear: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  const t = THEME[variant];
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.06)] overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${t.chip}`}>
            {editing ? 'Düzenleme' : 'Yeni'}
          </span>
          <h3 className="font-display font-semibold text-slate-900 text-sm truncate">
            {editing ? `${t.title} düzenle` : `Yeni ${t.title.toLocaleLowerCase('tr-TR')}`}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ai}
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onSave}
            className={`text-xs font-bold px-4 py-2 rounded-lg text-white cursor-pointer ${t.accent} ${t.accentHover}`}
          >
            {saveLabel}
          </button>
        </div>
      </header>

      <div className="p-5 space-y-5">
        {banner}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{fields}</div>
        {extraFields}
        {itemsTable}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end justify-between">
          <div className="flex-1 min-w-0">{attachments}</div>
          {totals}
        </div>
      </div>
    </section>
  );
}

export function MuhasebeField({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: 2;
}) {
  return (
    <label className={`block space-y-1 ${span === 2 ? 'sm:col-span-2' : ''}`}>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

export const muhasebeInputClass =
  'w-full text-sm font-medium px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5';

export function MuhasebeAiButton({
  loading,
  error,
  success,
  onFile,
  label = 'Belgeden oku',
}: {
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  onFile: (file: File) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer">
        <ScanLine className="w-3.5 h-3.5" />
        {loading ? 'Okunuyor…' : label}
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </label>
      {error ? <span className="text-[10px] font-semibold text-rose-600 max-w-[220px] truncate">{error}</span> : null}
      {success ? <span className="text-[10px] font-semibold text-emerald-700 max-w-[220px] truncate">{success}</span> : null}
    </div>
  );
}

export function MuhasebeAttach({
  label,
  loaded,
  onFile,
  previewUrl,
  onPreview,
}: {
  label: string;
  loaded?: boolean;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  previewUrl?: string | null;
  onPreview?: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-600 hover:bg-white cursor-pointer">
        <Paperclip className="w-3.5 h-3.5" />
        {loaded ? `✓ ${label}` : label}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
      </label>
      {previewUrl && onPreview ? (
        <button
          type="button"
          onClick={onPreview}
          className="text-[11px] font-bold text-indigo-700 underline cursor-pointer"
        >
          Taramayı aç
        </button>
      ) : null}
    </div>
  );
}

export function MuhasebeKalemTablosu({
  variant,
  children,
  onAdd,
  addDisabled,
}: {
  variant: MuhasebeVariant;
  children: React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
}) {
  const showMoney = variant === 'fatura';
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-bold text-[10px] uppercase tracking-wide">Hizmet / ürün</th>
              <th className="px-2 py-2.5 font-bold text-[10px] uppercase w-24">Miktar</th>
              <th className="px-2 py-2.5 font-bold text-[10px] uppercase w-28">Birim</th>
              {showMoney ? (
                <>
                  <th className="px-2 py-2.5 font-bold text-[10px] uppercase w-32">Birim fiyat</th>
                  <th className="px-2 py-2.5 font-bold text-[10px] uppercase w-24">KDV</th>
                  <th className="px-2 py-2.5 font-bold text-[10px] uppercase w-32 text-right">Tutar</th>
                </>
              ) : variant === 'siparis' ? (
                <th className="px-2 py-2.5 font-bold text-[10px] uppercase">Kullanım yeri</th>
              ) : null}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={addDisabled}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 text-slate-600 hover:bg-slate-50 border-t border-slate-100 cursor-pointer disabled:opacity-40"
      >
        <Plus className="w-3.5 h-3.5" /> Satır ekle
      </button>
    </div>
  );
}

export const MuhasebeKalemRow: React.FC<{
  children: React.ReactNode;
  onRemove?: () => void;
}> = ({ children, onRemove }) => {
  return (
    <tr className="border-t border-slate-100 align-middle">
      {children}
      <td className="px-1">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
            title="Satırı sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <X className="w-3.5 h-3.5 text-transparent mx-auto" />
        )}
      </td>
    </tr>
  );
};

export function MuhasebeTotals({
  araToplam,
  kdv,
  genel,
}: {
  araToplam: number;
  kdv: number;
  genel: number;
}) {
  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="w-full sm:w-72 border border-slate-200 rounded-xl overflow-hidden text-sm">
      <div className="flex justify-between px-3 py-2 bg-slate-50 text-slate-600">
        <span>Ara toplam</span>
        <span className="font-mono font-semibold">{fmt(araToplam)} TL</span>
      </div>
      <div className="flex justify-between px-3 py-2 text-slate-600 border-t border-slate-100">
        <span>KDV</span>
        <span className="font-mono font-semibold">{fmt(kdv)} TL</span>
      </div>
      <div className="flex justify-between px-3 py-2.5 bg-slate-900 text-white font-bold">
        <span>Genel toplam</span>
        <span className="font-mono">{fmt(genel)} TL</span>
      </div>
    </div>
  );
}

export function unitSelect(value: string, onChange: (v: string) => void) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={muhasebeInputClass}>
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}
