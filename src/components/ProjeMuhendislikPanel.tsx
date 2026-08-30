import React, { useMemo } from 'react';
import { BarChart3, Package, Users } from 'lucide-react';
import { formatDateLabelTr } from '../lib/dateKeyUtils';
import {
  MuhendislikOzet,
  MuhendislikWbsSatir,
  buildKaynakHistogram,
} from '../lib/projeMuhendislikUtils';

type Props = {
  ozet: MuhendislikOzet;
  wbs: MuhendislikWbsSatir[];
  baslangicTarih: string;
  bitisTarih: string;
  faaliyetler: import('../types/erp').SahaFaaliyeti[];
  parsel?: string;
};

export const ProjeMuhendislikPanel: React.FC<Props> = ({
  ozet,
  wbs,
  baslangicTarih,
  bitisTarih,
  faaliyetler,
  parsel,
}) => {
  const histogram = useMemo(
    () => buildKaynakHistogram(faaliyetler, baslangicTarih, bitisTarih, parsel),
    [faaliyetler, baslangicTarih, bitisTarih, parsel]
  );
  const maxIsci = Math.max(1, ...histogram.map((h) => h.usta + h.isci + h.atanan));

  const blokSatirlari = wbs.filter((r) => r.seviye === 'BLOK');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          WBS · Plan vs fiili · Kaynak · Malzeme
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-stone-50 px-3 py-2 border border-stone-100">
            <p className="text-[9px] font-bold uppercase text-stone-500">Planlı (punch)</p>
            <p className="text-xl font-black">{ozet.planYuzde}%</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2 border border-emerald-100">
            <p className="text-[9px] font-bold uppercase text-emerald-800">Fiili</p>
            <p className="text-xl font-black text-emerald-900">{ozet.fiiliYuzde}%</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2 border border-amber-100">
            <p className="text-[9px] font-bold uppercase text-amber-900">Sapma</p>
            <p className="text-xl font-black">{ozet.sapmaPuan} puan</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-3 py-2 border border-sky-100">
            <p className="text-[9px] font-bold uppercase text-sky-800 flex items-center gap-1">
              <Users size={10} /> İşçi·gün
            </p>
            <p className="text-xl font-black">{ozet.isciGun}</p>
          </div>
          <div className="rounded-xl bg-violet-50 px-3 py-2 border border-violet-100">
            <p className="text-[9px] font-bold uppercase text-violet-800 flex items-center gap-1">
              <Package size={10} /> Malzeme satır
            </p>
            <p className="text-xl font-black">{ozet.malzemeTalep}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-4 py-2 flex items-center gap-2">
          <BarChart3 size={14} className="text-stone-500" />
          <p className="text-xs font-black uppercase text-stone-700">İş kırılımı (WBS) — blok seviyesi</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-stone-50 text-[10px] font-bold uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Kod</th>
                <th className="px-3 py-2">Plan %</th>
                <th className="px-3 py-2">Fiili %</th>
                <th className="px-3 py-2">Sapma</th>
                <th className="px-3 py-2">Punch</th>
                <th className="px-3 py-2">Faaliyet</th>
                <th className="px-3 py-2">İşçi·gün</th>
                <th className="px-3 py-2">Son saha</th>
              </tr>
            </thead>
            <tbody>
              {blokSatirlari.map((r) => (
                <tr key={r.id} className="border-t border-stone-100 hover:bg-stone-50/80">
                  <td className="px-3 py-2 font-bold text-stone-900">{r.kod}</td>
                  <td className="px-3 py-2 font-mono">{r.planYuzde}%</td>
                  <td className="px-3 py-2 font-mono text-emerald-800">{r.fiiliYuzde}%</td>
                  <td
                    className={`px-3 py-2 font-mono font-bold ${
                      r.sapmaPuan < 0 ? 'text-rose-700' : 'text-stone-600'
                    }`}
                  >
                    {r.sapmaPuan > 0 ? '+' : ''}
                    {r.sapmaPuan}
                  </td>
                  <td className="px-3 py-2">
                    {r.acikPunch}/{r.toplamPunch}
                  </td>
                  <td className="px-3 py-2">
                    {r.tamamlananFaaliyet}/{r.faaliyetAdet}
                  </td>
                  <td className="px-3 py-2">{r.isciGun}</td>
                  <td className="px-3 py-2 font-mono text-stone-500">
                    {r.sonFaaliyetTarihi ? formatDateLabelTr(r.sonFaaliyetTarihi) : '—'}
                  </td>
                </tr>
              ))}
              {!blokSatirlari.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-stone-400">
                    WBS satırı oluşmadı — punch veya saha faaliyeti ekleyin
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {histogram.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase text-stone-500 mb-3">Kaynak histogramı (işçi·gün)</p>
          <div className="flex items-end gap-1 h-24">
            {histogram.map((h) => {
              const top = h.usta + h.isci + h.atanan;
              const pct = Math.round((top / maxIsci) * 100);
              return (
                <div key={h.tarih} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                  <div
                    className="w-full rounded-t bg-sky-500/80"
                    style={{ height: `${Math.max(4, pct)}%` }}
                    title={`${formatDateLabelTr(h.tarih)}: ${top} kişi·gün`}
                  />
                  <span className="text-[8px] font-mono text-stone-400 truncate w-full text-center">
                    {h.tarih.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjeMuhendislikPanel;
