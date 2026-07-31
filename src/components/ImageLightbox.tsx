import React, { useEffect, useState } from 'react';
import { Download, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export type ImageLightboxProps = {
  url: string;
  title?: string;
  fileName?: string;
  onClose: () => void;
};

async function downloadImage(url: string, fileName: string) {
  try {
    if (url.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const res = await fetch(url);
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(obj);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Tam ekran fiş/foto önizleme — yakınlaştır / uzaklaştır / indir */
export function ImageLightbox({ url, title, fileName, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const safeName =
    (fileName || title || 'fis-gorseli')
      .replace(/[^\wğüşıöçĞÜŞİÖÇ\-_. ]+/gi, '_')
      .trim()
      .slice(0, 80) || 'fis-gorseli';
  const downloadName = /\.(jpe?g|png|webp|gif)$/i.test(safeName)
    ? safeName
    : `${safeName}.jpg`;

  useEffect(() => {
    setScale(1);
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)));
      if (e.key === '-') setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));
      if (e.key === '0') setScale(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/88 flex flex-col select-none"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Görsel önizleme'}
      onClick={onClose}
    >
      <div
        className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-black/50 border-b border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-bold text-white/90 truncate min-w-0 flex-1">
          {title || 'Evrak / Fiş Görseli'}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            title="Uzaklaştır (−)"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
            className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-[10px] font-mono font-bold text-white/80 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            title="Yakınlaştır (+)"
            onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))}
            className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            title="Sıfırla"
            onClick={() => setScale(1)}
            className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            title="İndir"
            onClick={() => void downloadImage(url, downloadName)}
            className="px-2.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download size={14} />
            İndir
          </button>
          <button
            type="button"
            title="Kapat"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.15 : 0.15;
          setScale((s) => Math.min(4, Math.max(0.5, +(s + delta).toFixed(2))));
        }}
      >
        <img
          src={url}
          alt={title || 'Fiş görseli'}
          referrerPolicy="no-referrer"
          className="max-w-none object-contain rounded-lg shadow-2xl origin-center transition-transform duration-100"
          style={{
            transform: `scale(${scale})`,
            maxHeight: scale <= 1 ? '82vh' : undefined,
            maxWidth: scale <= 1 ? 'min(96vw, 1100px)' : undefined,
          }}
          draggable={false}
        />
      </div>

      <p className="shrink-0 text-center text-[10px] text-white/55 font-semibold py-2">
        Fare tekeriği veya +/− ile yakınlaştır · Esc ile kapat
      </p>
    </div>
  );
}
