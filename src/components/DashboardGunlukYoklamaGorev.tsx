import React, { useMemo } from 'react';
import { CalendarCheck2, ChevronRight, ClipboardList } from 'lucide-react';
import type { AylikYoklamaMap, Personel } from '../types/erp';
import { todayDateKey } from '../lib/dateKeyUtils';
import {
  buildGunlukYoklamaGorevOzeti,
  personelGorevGrupChipClass,
  type PersonelGorevGrup,
} from '../lib/personelGorevGrupUtils';

type Props = {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  onNavigate: (tab: string) => void;
};

const GRUP_ACCENT: Record<PersonelGorevGrup, string> = {
  IDARI: 'ring-violet-100',
  DUZ_ISCI: 'ring-blue-100',
  USTA: 'ring-fuchsia-100',
  FORMEN: 'ring-purple-100',
  TESISATCI: 'ring-orange-100',
  MERMERCI: 'ring-rose-100',
  OPERATOR: 'ring-cyan-100',
  SOFOR: 'ring-indigo-100',
  SENOR: 'ring-teal-100',
};

export const DashboardGunlukYoklamaGorev: React.FC<Props> = ({
  personeller,
  yoklamalar,
  onNavigate,
}) => {
  const today = todayDateKey();
  const todayLabel = useMemo(() => {
    try {
      return new Date(`${today}T12:00:00`).toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return today;
    }
  }, [today]);

  const ozet = useMemo(
    () => buildGunlukYoklamaGorevOzeti(personeller, yoklamalar, today),
    [personeller, yoklamalar, today]
  );

  const toplam = useMemo(
    () =>
      ozet.reduce(
        (acc, g) => ({
          kadro: acc.kadro + g.kadro,
          geldi: acc.geldi + g.geldi,
          kayit: acc.kayit + g.toplamKayit,
        }),
        { kadro: 0, geldi: 0, kayit: 0 }
      ),
    [ozet]
  );

  return (
    <section className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
            <CalendarCheck2 size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold tracking-tight text-slate-900 leading-none">
              Bugünkü Yoklama · Göreve Göre
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 capitalize">{todayLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('yoklama')}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-600 hover:underline cursor-pointer self-start sm:self-auto"
        >
          <ClipboardList size={13} />
          Yoklama ekranı
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1">
          Geldi: <strong className="tabular-nums">{toplam.geldi}</strong>
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1">
          Kayıt: <strong className="tabular-nums">{toplam.kayit}</strong> / {toplam.kadro} kadro
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9 gap-2">
        {ozet.map((g) => {
          const hasActivity = g.toplamKayit > 0;
          const inactive = g.kadro === 0;
          const geldiIsimleri = g.geldiIsimleri || [];
          return (
            <button
              key={g.grup}
              type="button"
              onClick={() => onNavigate('yoklama')}
              className={`text-left rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm cursor-pointer ring-1 ${GRUP_ACCENT[g.grup]} ${
                inactive ? 'opacity-50 border-slate-100 bg-slate-50/50' : 'border-slate-100 bg-white'
              }`}
              title={`${g.label}: ${g.geldi} geldi · ${g.yok} yok · ${g.kadro} kadro${
                geldiIsimleri.length ? ` · ${geldiIsimleri.join(', ')}` : ''
              }`}
            >
              <span
                className={`inline-block text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md border mb-2 ${personelGorevGrupChipClass(g.grup, hasActivity && g.geldi > 0)}`}
              >
                {g.label}
              </span>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {g.geldi}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                geldi · {g.kadro} kadro
              </p>
              {g.toplamKayit > 0 && (
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {g.yok > 0 && `${g.yok} yok`}
                  {g.yok > 0 && g.izinli > 0 && ' · '}
                  {g.izinli > 0 && `${g.izinli} izin`}
                  {g.girilmedi > 0 && (g.yok > 0 || g.izinli > 0) && ' · '}
                  {g.girilmedi > 0 && `${g.girilmedi} girilmedi`}
                </p>
              )}
              {geldiIsimleri.length > 0 && (
                <p className="text-[8px] text-emerald-700 font-semibold mt-1.5 leading-snug border-t border-emerald-100 pt-1.5">
                  {geldiIsimleri.slice(0, 5).join(' · ')}
                  {geldiIsimleri.length > 5 && (
                    <span className="text-emerald-600/80"> +{geldiIsimleri.length - 5}</span>
                  )}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardGunlukYoklamaGorev;
