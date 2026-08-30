import React from 'react';
import { Calendar, Clock, Eye, Save, Pencil, Trash2, History } from 'lucide-react';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';

interface GuvenlikTabDateBarProps {
  islemTarihi: string;
  onTarihChange: (tarih: string) => void;
  tabLabel: string;
  logCount?: number;
  archivedCount?: number;
  onGoster?: () => void;
  onGecmisGoster?: () => void;
  gecmisAktif?: boolean;
  onKaydet?: () => void;
  onGuncelle?: () => void;
  onSil?: () => void;
  kaydetLabel?: string;
  kaydetDisabled?: boolean;
  guncelleDisabled?: boolean;
  silDisabled?: boolean;
  kaydetLoading?: boolean;
}

export const GuvenlikTabDateBar: React.FC<GuvenlikTabDateBarProps> = ({
  islemTarihi,
  onTarihChange,
  tabLabel,
  logCount = 0,
  archivedCount = 0,
  onGoster,
  onGecmisGoster,
  gecmisAktif = false,
  onKaydet,
  onGuncelle,
  onSil,
  kaydetLabel = 'Kaydet',
  kaydetDisabled = false,
  guncelleDisabled = true,
  silDisabled = true,
  kaydetLoading = false,
}) => {
  const bugun = todayDateKey();
  const isBugun = islemTarihi === bugun;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[9px] font-black uppercase text-amber-600 tracking-widest flex items-center gap-1">
            <Calendar size={12} /> İşlem Tarihi — {tabLabel}
          </span>
          <p className="text-[11px] text-slate-600 leading-snug">
            Tarih seç → kayıt gir → Kaydet. Loglar kalıcıdır; Nöbet Kapat günlükleri silmez, rapor arşivine kopyalar.
            {isBugun ? ' Bugün için canlı giriş/çıkış yapabilirsiniz.' : ' Geçmiş gün — kayıtları görüntüleyebilir / düzeltebilirsiniz.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="date"
            value={islemTarihi}
            onChange={(e) => onTarihChange(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
          />
          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg">
            {formatDateLabelTr(islemTarihi)}
          </span>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
            <Clock size={11} />
            {logCount} kayıt
          </span>
          {archivedCount > 0 && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg">
              {archivedCount} arşiv
            </span>
          )}
          {!isBugun && (
            <button
              type="button"
              onClick={() => onTarihChange(bugun)}
              className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-amber-100"
            >
              Bugüne Dön
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
        {onGoster && (
          <button
            type="button"
            onClick={onGoster}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
          >
            <Eye size={12} />
            Göster
          </button>
        )}
        {onGecmisGoster && (
          <button
            type="button"
            onClick={onGecmisGoster}
            className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl border cursor-pointer ${
              gecmisAktif
                ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <History size={12} />
            {gecmisAktif ? 'Geçmişi gizle' : 'Geçmiş kayıtları göster'}
          </button>
        )}
        {onKaydet && (
          <button
            type="button"
            onClick={onKaydet}
            disabled={kaydetDisabled}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save size={12} />
            {kaydetLoading ? 'Kaydediliyor... (iptal için tekrar basın)' : kaydetLabel}
          </button>
        )}
        {onGuncelle && (
          <button
            type="button"
            onClick={onGuncelle}
            disabled={guncelleDisabled}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Pencil size={12} />
            Güncelle
          </button>
        )}
        {onSil && (
          <button
            type="button"
            onClick={onSil}
            disabled={silDisabled}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-3 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 size={12} />
            Sil
          </button>
        )}
      </div>
    </div>
  );
};
