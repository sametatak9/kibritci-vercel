import React from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { isLikelyImageUrl, isPdfUrl } from '../../lib/guvenlikEvrakFotolar';
import { openBase64InNewTab } from '../../lib/fileViewerUtils';

export function openEvrakTarama(url?: string | null, fileName = 'Tarama PDF') {
  const raw = String(url || '').trim();
  if (!raw) return;
  if (raw.startsWith('http')) {
    window.open(raw, '_blank', 'noopener,noreferrer');
    return;
  }
  openBase64InNewTab(raw, fileName);
}

export function EvrakTaramaOnizleme({
  url,
  fileName,
  compact = false,
}: {
  url?: string | null;
  fileName?: string;
  compact?: boolean;
}) {
  const raw = String(url || '').trim();
  if (!raw) {
    return (
      <div
        className={`flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[9px] font-semibold text-slate-400 ${
          compact ? 'h-12 w-12' : 'h-16 w-[4.5rem]'
        }`}
      >
        <ImageOff size={12} />
      </div>
    );
  }

  const pdf = isPdfUrl(raw);
  const image = !pdf && isLikelyImageUrl(raw);

  return (
    <button
      type="button"
      onClick={() => openEvrakTarama(raw, fileName || 'Tarama PDF')}
      title="Taranmış evrakı aç"
      className={`group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left cursor-pointer hover:border-indigo-300 hover:ring-2 hover:ring-indigo-100 ${
        compact ? 'h-12 w-12' : 'h-16 w-[4.5rem]'
      }`}
    >
      {image ? (
        <img src={raw} alt={fileName || 'Evrak'} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
          <FileText size={compact ? 14 : 16} className="text-rose-600" />
          <span className="text-[7px] font-black uppercase tracking-wide text-slate-600">PDF</span>
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[7px] font-bold uppercase text-white opacity-0 group-hover:opacity-100">
        Aç
      </span>
    </button>
  );
}
