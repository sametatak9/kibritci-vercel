import React from 'react';
import { Phone, CreditCard, BadgeCheck, Building2 } from 'lucide-react';
import { Personel } from '../types/erp';

type Props = {
  personel: Personel;
  className?: string;
};

/** Küçük kimlik kartı — mevcut personel ekranlarını bozmadan ek gösterim. */
export const PersonelIdCard: React.FC<Props> = ({ personel, className = '' }) => {
  const initials = `${personel.ad?.[0] || ''}${personel.soyad?.[0] || ''}`.toUpperCase();
  const aktif = personel.durum === true || String(personel.durum) === 'true';
  const taseron = personel.firmaTipi === 'TASERON';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-[#F7FAFA] to-[#E8F3F0] p-4 shadow-sm ${className}`}
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#0F6C5C]/8 pointer-events-none" />
      <div className="relative flex items-start gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[#0F6C5C] text-white font-black text-lg flex items-center justify-center shrink-0 shadow-sm">
          {personel.fotografUrl ? (
            <img
              src={personel.fotografUrl}
              alt=""
              className="w-full h-full object-cover rounded-2xl"
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                aktif
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {aktif ? 'Aktif' : 'Pasif'}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white text-slate-700 border-slate-200">
              {personel.gorev || 'Görev yok'}
            </span>
          </div>
          <h4
            className="text-lg font-extrabold tracking-tight text-slate-900 leading-tight truncate"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
          >
            {personel.ad} {personel.soyad}
          </h4>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            TC {personel.tcNo || '—'}
          </p>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-1 gap-1.5 text-[11px] text-slate-600">
        <div className="flex items-center gap-2">
          <Building2 size={12} className="text-[#0F6C5C] shrink-0" />
          <span className="truncate">
            {taseron
              ? personel.firmaAdi || 'Taşeron'
              : personel.personelGrubu === 'IDARI'
                ? 'Kibritçi · İdari'
                : 'Kibritçi İnşaat'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Phone size={12} className="text-[#0F6C5C] shrink-0" />
          <span>{personel.telefonNo || 'Telefon yok'}</span>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard size={12} className="text-[#0F6C5C] shrink-0" />
          <span>
            {personel.ucretTipi || 'Ücret'} ·{' '}
            {(personel.maas || 0).toLocaleString('tr-TR')} ₺
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BadgeCheck size={12} className="text-[#0F6C5C] shrink-0" />
          <span>Giriş: {personel.iseGirisTarihi || '—'}</span>
        </div>
      </div>
    </div>
  );
};

export default PersonelIdCard;
