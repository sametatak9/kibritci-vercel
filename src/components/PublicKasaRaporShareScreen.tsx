import React from 'react';
import { AlertTriangle, Download, ExternalLink, FileSpreadsheet, Printer } from 'lucide-react';
import { KasaRaporPublicShareDoc } from '../lib/kasaRaporPublicShare';
import { downloadReportHtmlFile, openHtmlReportWindow } from '../lib/reportEmail';
import { formatDateLabelTr, normalizeDateKey } from '../lib/dateKeyUtils';
import { KibritciLogo } from './KibritciLogo';

interface PublicKasaRaporShareScreenProps {
  share: KasaRaporPublicShareDoc & { _notFound?: boolean };
  onClose: () => void;
}

export const PublicKasaRaporShareScreen: React.FC<PublicKasaRaporShareScreenProps> = ({
  share,
  onClose,
}) => {
  if (share._notFound) {
    return (
      <div className="min-h-screen bg-[#FFFBF7] flex items-center justify-center p-6 text-[#0f172a]">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-[#EA580C] mx-auto" />
          <h1 className="text-lg font-black">Rapor Bağlantısı Bulunamadı</h1>
          <p className="text-sm text-[#64748b]">
            Bu kasa raporu paylaşım linki geçersiz veya süresi dolmuş olabilir.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-[#FFF7ED] border border-[#FDBA74] rounded-xl text-xs font-bold cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  const start = formatDateLabelTr(normalizeDateKey(share.startDate) || share.startDate);
  const end = formatDateLabelTr(normalizeDateKey(share.endDate) || share.endDate);
  const fileName = `Kibritci_Kasa_Rapor_${share.startDate}_${share.endDate}.html`;
  const html = share.htmlContent || '';
  const summary = {
    kalem: share.kalemCount || 0,
    toplam: Number(share.genelToplam) || 0,
  };

  const openFullReport = () => {
    if (share.htmlUrl && !share.htmlContent) {
      window.open(share.htmlUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (html) {
      openHtmlReportWindow(html, `Kasa Harcama Raporu ${start} — ${end}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF7] text-[#0f172a] font-sans">
      <div className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <KibritciLogo size="md" className="h-10" />
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] hover:text-[#9A3412] cursor-pointer"
          >
            Kapat
          </button>
        </div>

        <div className="rounded-2xl border border-[#FDBA74] bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-[#FFF7ED] border-b border-[#FDBA74]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9A3412]">
              Kasa Harcama Raporu
            </p>
            <h1 className="text-lg font-black text-[#0f172a] mt-1">
              {start} — {end}
            </h1>
          </div>
          <div className="px-5 py-4 space-y-3 text-sm">
            <p>
              <span className="text-[#64748b]">Kalem:</span>{' '}
              <strong>{summary.kalem}</strong>
            </p>
            <p>
              <span className="text-[#64748b]">Genel toplam:</span>{' '}
              <strong className="text-[#B91C1C]">
                −{summary.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </strong>
            </p>
          </div>
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {(html || share.htmlUrl) && (
              <>
                <button
                  type="button"
                  onClick={openFullReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-bold cursor-pointer"
                >
                  <ExternalLink size={14} />
                  HTML Raporu Aç
                </button>
                {html ? (
                  <button
                    type="button"
                    onClick={() => downloadReportHtmlFile(html, fileName)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFF7ED] border border-[#FDBA74] text-[#9A3412] text-[11px] font-bold cursor-pointer"
                  >
                    <Download size={14} />
                    HTML İndir
                  </button>
                ) : share.htmlUrl ? (
                  <a
                    href={share.htmlUrl}
                    download={fileName}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFF7ED] border border-[#FDBA74] text-[#9A3412] text-[11px] font-bold"
                  >
                    <Download size={14} />
                    HTML İndir
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={openFullReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#334155] hover:bg-[#1e293b] text-white text-[11px] font-bold cursor-pointer"
                >
                  <Printer size={14} />
                  Yazdır / PDF
                </button>
              </>
            )}
            {share.excelUrl && (
              <a
                href={share.excelUrl}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-[11px] font-bold"
              >
                <FileSpreadsheet size={14} />
                Excel İndir
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
