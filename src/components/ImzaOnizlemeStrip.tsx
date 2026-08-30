import React from 'react';
import { PenLine } from 'lucide-react';
import { resolveImzaOnizlemeText } from '../lib/onayInboxUtils';

type Props = {
  doc?: {
    eImzalar?: string[] | null;
    onayStamp?: string | null;
    onaylayanYonetici?: string | null;
    onaySignatureText?: string | null;
  } | null;
  pendingSignatureText?: string | null;
  className?: string;
};

/** Onay kartında imza/kaşe önizleme — salt okunur, akışı bozmaz. */
export const ImzaOnizlemeStrip: React.FC<Props> = ({
  doc,
  pendingSignatureText,
  className = '',
}) => {
  const text = resolveImzaOnizlemeText(doc, pendingSignatureText);
  if (!text) return null;

  return (
    <div
      className={`flex items-start gap-1.5 text-[10px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 ${className}`}
      title={text}
    >
      <PenLine size={11} className="text-[#0F6C5C] shrink-0 mt-0.5" />
      <span className="font-mono leading-snug line-clamp-2">{text}</span>
    </div>
  );
};

export default ImzaOnizlemeStrip;
