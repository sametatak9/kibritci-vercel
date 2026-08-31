import React from 'react';
import { Camera, FileText, FileUp } from 'lucide-react';
import type { GuvenlikFotoSlot } from '../lib/guvenlikEvrakFotolar';
import { GUVENLIK_FOTO_METOD_HINT, hasEvrakFotografi } from '../lib/guvenlikEvrakFotolar';
import { isLikelyImageUrl } from '../lib/guvenlikEvrakFotolar';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { GUVENLIK_EVRAK_ACCEPT } from '../lib/guvenlikFotoStorage';

type Accent = 'teal' | 'indigo';

const ACCENT: Record<
  Accent,
  { border: string; title: string; hint: string; dash: string; hover: string; btn: string; link: string }
> = {
  teal: {
    border: 'border-teal-200',
    title: 'text-teal-900',
    hint: 'text-slate-500',
    dash: 'border-teal-300',
    hover: 'hover:bg-teal-50/50',
    btn: 'text-teal-800',
    link: 'text-teal-700',
  },
  indigo: {
    border: 'border-indigo-200',
    title: 'text-indigo-900',
    hint: 'text-slate-500',
    dash: 'border-indigo-300',
    hover: 'hover:bg-indigo-50/50',
    btn: 'text-indigo-800',
    link: 'text-indigo-700',
  },
};

function isPdfSlot(slot: GuvenlikFotoSlot): boolean {
  const t = String(slot.fileType || '').toLowerCase();
  const url = String(slot.dataUrl || '').toLowerCase();
  return t.includes('pdf') || url.includes('application/pdf') || /\.pdf(\?|#|$)/i.test(url);
}

type Props = {
  accent: Accent;
  packageId: string;
  evrakFotolar?: GuvenlikFotoSlot[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
  scanPdfUrl?: string;
  onAdd: (packageId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (packageId: string) => void;
};

export function GuvenlikEvrakFotoUpload({
  accent,
  packageId,
  evrakFotolar = [],
  kalemFotolar = [],
  firmaFotolar = [],
  faturaFotolar = [],
  scanPdfUrl,
  onAdd,
  onRemove,
}: Props) {
  const a = ACCENT[accent];
  const evrakFoto =
    evrakFotolar[0] || faturaFotolar[0] || firmaFotolar[0] || kalemFotolar[0] || null;
  const paket = { evrakFotolar, kalemFotolar, firmaFotolar, faturaFotolar };
  const pdfSlot = evrakFoto && isPdfSlot(evrakFoto);

  return (
    <div className="space-y-2">
      <div className={`rounded-xl border border-dashed ${a.border} bg-white p-4 space-y-3`}>
        <div>
          <p className={`text-[10px] font-black uppercase ${a.title} tracking-wide`}>
            Evrak fotoğrafı / PDF *
          </p>
          <p className={`text-[9px] ${a.hint} font-semibold mt-1`}>
            {GUVENLIK_FOTO_METOD_HINT.EVRAK}
          </p>
        </div>
        {evrakFoto ? (
          <div className="space-y-2">
            <div className="relative max-w-xs">
              {!pdfSlot &&
              (String(evrakFoto.fileType || '').startsWith('image/') ||
                isLikelyImageUrl(evrakFoto.dataUrl)) ? (
                <img
                  src={evrakFoto.dataUrl}
                  alt={evrakFoto.fileName}
                  className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-slate-50"
                />
              ) : (
                <div className="min-h-[8rem] rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 px-3 py-4 text-center">
                  <FileText size={28} className="text-rose-600" />
                  <span className="text-[10px] font-bold text-slate-700 break-all">
                    {evrakFoto.fileName || 'PDF belgesi'}
                  </span>
                  <span className="text-[9px] text-slate-500">PDF yüklendi</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(packageId)}
                className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 text-[10px] cursor-pointer"
                title="Kaldır"
              >
                ×
              </button>
            </div>
            {(scanPdfUrl || pdfSlot) && (
              <button
                type="button"
                onClick={() => {
                  const url = scanPdfUrl || evrakFoto.dataUrl;
                  if (url.startsWith('http')) window.open(url, '_blank', 'noopener,noreferrer');
                  else openBase64InNewTab(url);
                }}
                className={`inline-flex items-center gap-1 text-[10px] font-bold ${a.link} underline cursor-pointer`}
              >
                <FileText size={12} /> PDF görüntüle
              </button>
            )}
            <label className={`inline-flex items-center gap-1 text-[10px] font-bold ${a.link} cursor-pointer`}>
              <Camera size={12} /> Değiştir (foto veya PDF)
              <input
                type="file"
                accept={GUVENLIK_EVRAK_ACCEPT}
                className="hidden"
                onChange={(e) => onAdd(packageId, e)}
              />
            </label>
          </div>
        ) : (
          <label
            className={`flex flex-col items-center justify-center gap-2 border border-dashed ${a.dash} rounded-xl py-8 cursor-pointer ${a.hover} transition`}
          >
            <FileUp size={22} className={a.btn.replace('text-', 'text-')} />
            <span className={`text-[11px] font-bold ${a.btn}`}>Fotoğraf çek veya PDF yükle</span>
            <span className="text-[9px] text-slate-400 text-center px-4">
              JPG · PNG · WEBP · PDF — fotoğraftan tarama PDF otomatik oluşur
            </span>
            <input
              type="file"
              accept={GUVENLIK_EVRAK_ACCEPT}
              className="hidden"
              onChange={(e) => onAdd(packageId, e)}
            />
          </label>
        )}
      </div>
      <p className="text-[9px] text-slate-500 font-semibold">
        {hasEvrakFotografi(paket)
          ? pdfSlot
            ? 'PDF evrak yüklendi ✓'
            : 'Evrak fotoğrafı yüklendi ✓'
          : 'En az bir evrak fotoğrafı veya PDF ekleyin'}
      </p>
    </div>
  );
}
