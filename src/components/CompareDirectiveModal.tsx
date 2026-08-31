import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  COMPARE_FOCUS_LABELS,
  CompareFocus,
} from '../lib/documentCompareTypes';

const FOCUS_OPTIONS: CompareFocus[] = ['miktar', 'firma', 'urun_adi', 'birim', 'fiyat', 'kg_ton_donusum'];

interface CompareDirectiveModalProps {
  open: boolean;
  accent: 'emerald' | 'blue';
  evrakTitle: string;
  evrakDetail?: string;
  onClose: () => void;
  onConfirm: (focus: CompareFocus[], customInstructions: string) => void;
}

export const CompareDirectiveModal: React.FC<CompareDirectiveModalProps> = ({
  open,
  accent,
  evrakTitle,
  evrakDetail,
  onClose,
  onConfirm,
}) => {
  const accentBtn = accent === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-900';
  const accentRing = accent === 'emerald' ? 'ring-emerald-200' : 'ring-slate-800';

  const [compareFocus, setCompareFocus] = useState<CompareFocus[]>(['miktar', 'urun_adi']);
  const [customInstructions, setCustomInstructions] = useState('');

  useEffect(() => {
    if (open) {
      setCompareFocus(['miktar', 'urun_adi']);
      setCustomInstructions('');
    }
  }, [open]);

  if (!open) return null;

  const toggleFocus = (f: CompareFocus) => {
    setCompareFocus(prev => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));
  };

  const canProceed = compareFocus.length > 0 || customInstructions.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-slate-950/75 z-[60] flex items-center justify-center p-4">
      <div className={`bg-white rounded-3xl w-full max-w-lg shadow-2xl ring-4 ${accentRing} overflow-hidden`}>
        <div className="bg-slate-900 text-white p-4 flex justify-between items-start gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Yapay Zeka Karşılaştırma Direktifi</p>
            <h3 className="font-bold text-sm mt-1">{evrakTitle}</h3>
            {evrakDetail && <p className="text-[11px] text-slate-400 mt-1">{evrakDetail}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Yapay zekanın hangi alanlara odaklanmasını istediğinizi seçin veya aşağıya serbest direktif yazın.
            Örneğin: <em>&quot;Sadece mıcır kalemlerinde miktar farkına bak&quot;</em>
          </p>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
              Karşılaştırma niteliği (birden fazla seçilebilir)
            </span>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFocus(f)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                    compareFocus.includes(f)
                      ? `${accentBtn} text-white border-transparent`
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {COMPARE_FOCUS_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
              Serbest direktif (isteğe bağlı)
            </label>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Örn: Firma adı farklarını önemseme, sadece teslim miktarları ile sipariş miktarlarını karşılaştır."
              className="w-full text-xs p-3 border rounded-xl bg-slate-50 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {!canProceed && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              En az bir karşılaştırma alanı seçin veya serbest direktif yazın.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={!canProceed}
              onClick={() => onConfirm(compareFocus, customInstructions.trim())}
              className={`flex-1 ${accentBtn} disabled:opacity-40 text-white font-black py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer`}
            >
              <Sparkles size={14} />
              Karşılaştırmaya Git
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
