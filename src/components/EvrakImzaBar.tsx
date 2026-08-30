import React from 'react';
import { Upload, PenLine, Trash2 } from 'lucide-react';
import { compressImage } from '../lib/imageCompress';
import { confirmSignedUploadWithMismatchCheck } from '../lib/evrakOnayUtils';

interface EvrakImzaBarProps {
  evrakNo: string;
  evrakLabel: string;
  imzaliUrl?: string;
  uyumsuz?: boolean;
  onaylandi?: boolean;
  compact?: boolean;
  onSignedUpload: (url: string, uyumsuz: boolean) => void;
  onRemoveSigned?: () => void;
  onESign?: () => void;
}

export const EvrakImzaBar: React.FC<EvrakImzaBarProps> = ({
  evrakNo,
  evrakLabel,
  imzaliUrl,
  uyumsuz,
  onaylandi,
  compact,
  onSignedUpload,
  onRemoveSigned,
  onESign,
}) => {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { proceed, uyumsuz: u } = confirmSignedUploadWithMismatchCheck(
      file.name,
      evrakNo,
      evrakLabel
    );
    if (!proceed) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string);
      onSignedUpload(compressed, u);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const btn = compact ? 'text-[9px] px-2 py-1' : 'text-[10px] px-2.5 py-1.5';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onaylandi && (
        <span
          className={`${btn} font-bold rounded-lg ${
            uyumsuz ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {uyumsuz ? '⚠️ Onaylı (uyumsuz imza)' : '✓ Onaylandı'}
        </span>
      )}
      {!imzaliUrl && (
        <>
          <label
            className={`${btn} font-bold border rounded-lg cursor-pointer flex items-center gap-1 hover:bg-slate-50`}
          >
            <Upload className="w-3 h-3" /> İmzalı Yükle
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
          </label>
          {onESign && (
            <button
              type="button"
              onClick={onESign}
              className={`${btn} font-bold border rounded-lg flex items-center gap-1 hover:bg-slate-50 cursor-pointer`}
            >
              <PenLine className="w-3 h-3" /> E-İmza
            </button>
          )}
        </>
      )}
      {imzaliUrl && onRemoveSigned && (
        <button
          type="button"
          onClick={onRemoveSigned}
          className={`${btn} font-bold text-rose-600 border border-rose-200 rounded-lg flex items-center gap-1 cursor-pointer`}
        >
          <Trash2 className="w-3 h-3" /> Kaldır
        </button>
      )}
    </div>
  );
};
