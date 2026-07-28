import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Plus } from 'lucide-react';
import {
  CatalogKind,
  findCatalogMatch,
  formatCatalogMergeHint,
} from '../lib/catalogFieldUtils';
import { addProgramCatalogItem } from '../lib/programKatalog';
import { useProgramCatalog } from '../hooks/useProgramCatalog';

interface SmartCatalogFieldProps {
  kind: CatalogKind;
  value: string;
  onChange: (value: string) => void;
  extraOptions?: string[];
  label?: string;
  placeholder?: string;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  name?: string;
  /** Form kaydı sırasında yeni değeri kataloğa eklemeyi dener */
  autoRegisterNew?: boolean;
}

export const SmartCatalogField: React.FC<SmartCatalogFieldProps> = ({
  kind,
  value,
  onChange,
  extraOptions = [],
  label,
  placeholder,
  hint,
  className = '',
  inputClassName = '',
  disabled = false,
  name,
  autoRegisterNew = true,
}) => {
  const { options } = useProgramCatalog(kind, extraOptions);
  const [open, setOpen] = useState(false);
  const [mergeMatch, setMergeMatch] = useState<ReturnType<typeof findCatalogMatch>>(null);
  const [registering, setRegistering] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLocaleLowerCase('tr-TR');
    if (!q) return options.slice(0, 12);
    return options
      .filter((opt) => opt.toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, 12);
  }, [options, value]);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setMergeMatch(null);
      return;
    }
    const match = findCatalogMatch(trimmed, options);
    if (match && match.reason === 'similar') {
      setMergeMatch(match);
    } else {
      setMergeMatch(null);
    }
  }, [value, options]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const kindLabel =
    kind === 'gorev' ? 'görev' : kind === 'birim' ? 'birim' : 'kullanım alanı';

  const handleMerge = () => {
    if (!mergeMatch) return;
    onChange(mergeMatch.canonical);
    setMergeMatch(null);
    setOpen(false);
  };

  const handleUseAsNew = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      await addProgramCatalogItem(kind, trimmed);
      onChange(trimmed);
      setMergeMatch(null);
      setOpen(false);
    } finally {
      setRegistering(false);
    }
  };

  const handleRegisterNew = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const existing = findCatalogMatch(trimmed, options);
    if (existing?.reason === 'exact') {
      onChange(existing.canonical);
      return;
    }
    await handleUseAsNew();
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      setOpen(false);
      const trimmed = value.trim();
      if (!trimmed || mergeMatch) return;
      const match = findCatalogMatch(trimmed, options);
      if (match?.reason === 'exact') {
        onChange(match.canonical);
      } else if (autoRegisterNew && trimmed) {
        void addProgramCatalogItem(kind, trimmed).catch(() => undefined);
      }
    }, 120);
  };

  return (
    <div ref={rootRef} className={`relative space-y-1 ${className}`}>
      {label ? (
        <label className="text-[10px] font-bold text-slate-500 uppercase block">{label}</label>
      ) : null}

      <input
        type="text"
        name={name}
        value={value}
        disabled={disabled}
        placeholder={placeholder || `Listeden seçin veya ${kindLabel} yazın`}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        className={
          inputClassName ||
          'w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50'
        }
        autoComplete="off"
      />

      {open && filtered.length > 0 ? (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setMergeMatch(null);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}

      {mergeMatch ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p>{formatCatalogMergeHint(kind, mergeMatch)}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleMerge}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600 text-white font-bold"
                >
                  <Check size={10} />
                  Birleştir: {mergeMatch.canonical}
                </button>
                <button
                  type="button"
                  onClick={() => void handleUseAsNew()}
                  disabled={registering}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-amber-300 font-bold"
                >
                  <Plus size={10} />
                  Yeni kayıt olarak kullan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : value.trim() && !findCatalogMatch(value, options) ? (
        <button
          type="button"
          onClick={() => void handleRegisterNew()}
          disabled={registering}
          className="text-[9px] font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
        >
          <Plus size={10} />
          &quot;{value.trim()}&quot; yeni {kindLabel} olarak listeye ekle
        </button>
      ) : null}

      {hint ? <p className="text-[8px] text-slate-400">{hint}</p> : null}
    </div>
  );
};

export default SmartCatalogField;
