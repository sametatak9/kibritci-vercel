import React, { useMemo } from 'react';
import { AlertTriangle, Download, Eye, Printer } from 'lucide-react';
import { SatinAlmaPublicShareDoc } from '../lib/satinAlmaPublicShare';
import { buildSatinAlmaReportHtml } from '../lib/satinAlmaReportHtml';
import { downloadReportHtmlFile, openHtmlReportWindow } from '../lib/reportEmail';
import { KibritciLogo } from './KibritciLogo';

interface PublicSatinAlmaShareScreenProps {
  share: SatinAlmaPublicShareDoc & { _notFound?: boolean };
  onClose: () => void;
}

export const PublicSatinAlmaShareScreen: React.FC<PublicSatinAlmaShareScreenProps> = ({
  share,
  onClose,
}) => {
  if (share._notFound) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h1 className="text-lg font-black">Evrak Bağlantısı Bulunamadı</h1>
          <p className="text-sm text-slate-400">
            Bu satın alma paylaşım linki geçersiz veya süresi dolmuş olabilir.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-800 rounded-xl text-xs font-bold cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  return <PublicSatinAlmaShareBody share={share} onClose={onClose} />;
};

const PublicSatinAlmaShareBody: React.FC<{
  share: SatinAlmaPublicShareDoc;
  onClose: () => void;
}> = ({ share, onClose }) => {
  const html = useMemo(() => buildSatinAlmaReportHtml(share), [share]);
  const fileName = `SatinAlma_${String(share.saId || share.id).replace(/[^\w.\-]+/g, '_')}.html`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <KibritciLogo size="md" className="h-10" />
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white cursor-pointer"
          >
            Kapat
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
            Satın Alma Siparişi
          </p>
          <h1 className="text-2xl font-black tracking-tight">{share.saId}</h1>
          <p className="text-sm text-slate-400">
            Evrakı tarayıcıda açabilir, HTML olarak indirebilir veya yazdırıp PDF kaydedebilirsiniz.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-2 text-sm">
          <p>
            <span className="text-slate-500">Tarih:</span> {share.tarih || '—'}
          </p>
          <p>
            <span className="text-slate-500">Firma:</span> {share.cariFirma || '—'}
          </p>
          <p>
            <span className="text-slate-500">Talep Eden:</span> {share.talepEden || '—'}
          </p>
          <p>
            <span className="text-slate-500">Durum:</span> {share.onayDurumu || '—'}
          </p>
          <p>
            <span className="text-slate-500">Kalem:</span> {(share.kalemler || []).length} adet
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openHtmlReportWindow(html, `Satın Alma ${share.saId}`)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 text-xs font-black cursor-pointer"
          >
            <Eye size={14} />
            Evrakı Aç
          </button>
          <button
            type="button"
            onClick={() => downloadReportHtmlFile(html, fileName)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-4 py-2.5 text-xs font-black cursor-pointer"
          >
            <Download size={14} />
            HTML İndir
          </button>
          <button
            type="button"
            onClick={() => {
              const w = openHtmlReportWindow(html, `Satın Alma ${share.saId}`);
              setTimeout(() => w?.print(), 400);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 text-xs font-black cursor-pointer border border-slate-700"
          >
            <Printer size={14} />
            Yazdır / PDF
          </button>
        </div>
      </div>
    </div>
  );
};
