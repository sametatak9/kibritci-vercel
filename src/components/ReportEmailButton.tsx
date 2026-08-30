import React from 'react';
import { Mail } from 'lucide-react';
import { openReportEmailComposer, type ReportEmailPayload } from '../lib/reportEmail';

interface ReportEmailButtonProps {
  payload: ReportEmailPayload | (() => ReportEmailPayload | null | undefined);
  label?: string;
  className?: string;
  title?: string;
  iconOnly?: boolean;
}

/** Raporu kullanıcının posta uygulaması / Gmail / Outlook ile gönderme */
export const ReportEmailButton: React.FC<ReportEmailButtonProps> = ({
  payload,
  label = 'E-posta ile Gönder',
  className,
  title = 'E-posta ile gönder',
  iconOnly = false,
}) => {
  const handleClick = () => {
    const data = typeof payload === 'function' ? payload() : payload;
    if (!data) {
      alert('Gönderilecek rapor bulunamadı.');
      return;
    }
    openReportEmailComposer(data);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={
        className ||
        'inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer'
      }
    >
      <Mail size={iconOnly ? 14 : 12} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
};

export default ReportEmailButton;
