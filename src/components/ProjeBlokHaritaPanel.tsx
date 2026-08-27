import React, { useMemo, useState } from 'react';
import { Building2, Calendar, HardHat, Layers, Users } from 'lucide-react';
import { formatDateLabelTr } from '../lib/dateKeyUtils';
import {
  BlokHaritaOzet,
  IMALAT_ASAMALARI,
  KaynakHavuzu,
  formatTahminiBitisLabel,
  parselGenelOzet,
} from '../lib/projeBlokHaritaUtils';
import type { ProjeImalatAsama } from '../types/erp';

type Props = {
  parsel: string;
  parselSecenek: string[];
  blokOzetleri: BlokHaritaOzet[];
  kaynakHavuzlari: KaynakHavuzu[];
  onParselChange: (p: string) => void;
};

function IsometricBlok({ ozet, secili, onClick }: { ozet: BlokHaritaOzet; secili: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left rounded-2xl border p-3 transition cursor-pointer ${
        secili ? 'border-amber-500 bg-amber-50/80 shadow-md ring-2 ring-amber-300' : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Blok</p>
          <p className="text-lg font-black text-stone-900">{ozet.profil.blok}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tabular-nums text-stone-900">{ozet.genelYuzde}%</p>
          <p className="text-[9px] font-bold text-stone-500">fiili ilerleme</p>
        </div>
      </div>

      <div className="mt-3 flex justify-center perspective-[600px]">
        <div
          className="relative w-20 transition-transform group-hover:scale-105"
          style={{ transform: 'rotateX(12deg) rotateY(-18deg)' }}
        >
          <div className="absolute inset-x-0 bottom-0 h-3 rounded-sm bg-stone-400/40 blur-[1px]" />
          <div className="flex flex-col-reverse gap-0.5 p-1 rounded-lg border border-stone-300 bg-gradient-to-b from-stone-100 to-stone-200 shadow-inner">
            {ozet.katKatmanlari.map((k) => (
              <div
                key={k.katNo}
                title={`Kat ${k.katNo}: %${k.yuzde}`}
                className="h-2.5 rounded-sm border border-white/40 transition-all"
                style={{
                  background: `linear-gradient(90deg, ${k.renk} ${k.yuzde}%, #e2e8f0 ${k.yuzde}%)`,
                  opacity: k.yuzde > 0 ? 1 : 0.55,
                }}
              />
            ))}
          </div>
          <div
            className="absolute -right-2 top-2 w-3 h-full rounded-sm bg-stone-300/80 border border-stone-400/50"
            style={{ transform: 'skewY(-30deg) translateX(4px)' }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 text-[9px] font-bold text-stone-600">
        <span>{ozet.profil.katSayisi} kat</span>
        <span>{ozet.fiiliDaireSayisi} daire</span>
        <span className="col-span-2 truncate">
          Aşama: {IMALAT_ASAMALARI.find((a) => a.key === ozet.aktifAsama)?.label}
        </span>
      </div>
    </button>
  );
}

export const ProjeBlokHaritaPanel: React.FC<Props> = ({
  parsel,
  parselSecenek,
  blokOzetleri,
  kaynakHavuzlari,
  onParselChange,
}) => {
  const [seciliBlok, setSeciliBlok] = useState<string | null>(null);
  const genel = useMemo(() => parselGenelOzet(blokOzetleri), [blokOzetleri]);
  const detay = useMemo(
    () => blokOzetleri.find((b) => b.profil.blok === seciliBlok) || null,
    [blokOzetleri, seciliBlok]
  );

  const taseronHavuz = kaynakHavuzlari.filter((k) => k.firmaTipi === 'TASERON').slice(0, 8);
  const anaFirma = kaynakHavuzlari.filter((k) => k.firmaTipi === 'ANA_FIRMA');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-sky-50 via-white to-amber-50/30 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-900/70">
              Mekan · Blok haritası · İlerleme yönetimi
            </p>
            <h2 className="text-lg font-black text-stone-900">Neredeyiz → Nereye</h2>
            <p className="mt-1 max-w-2xl text-xs text-stone-600">
              Kat katmanları fiili ilerlemeyi gösterir. Başlangıç–bitiş tarihi ve güncel % ile yaklaşık
              teslim tarihi tahmin edilir. Veri: punch, saha faaliyeti, temizlik daire envanteri, personel
              havuzu.
            </p>
          </div>
          <label className="text-[10px] font-bold uppercase text-stone-500">
            Parsel
            <select
              value={parsel}
              onChange={(e) => {
                onParselChange(e.target.value);
                setSeciliBlok(null);
              }}
              className="mt-1 block min-w-[160px] rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-semibold"
            >
              {parselSecenek.map((p) => (
                <option key={p} value={p}>
                  {p.replace('Parsel Bölge ', '')}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-stone-500">Fiili ilerleme (bugün)</p>
            <p className="text-2xl font-black tabular-nums text-emerald-800">{genel.genelYuzde}%</p>
            <p className="text-[10px] text-stone-500">{genel.blokSayisi} blok ortalaması</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-stone-500">Planlı kapanış (punch)</p>
            <p className="text-2xl font-black tabular-nums text-amber-800">{genel.planYuzde}%</p>
            <p className="text-[10px] text-stone-500">Sapma: {genel.planYuzde - genel.genelYuzde} puan</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-stone-500 flex items-center gap-1">
              <Calendar size={11} /> Hedef bitiş
            </p>
            <p className="text-lg font-black text-stone-900">{formatTahminiBitisLabel(genel.hedefBitis)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-stone-500">Tahmini bitiş (trend)</p>
            <p className="text-lg font-black text-sky-900">{formatTahminiBitisLabel(genel.tahminiBitis)}</p>
            <p className="text-[10px] text-stone-500">Mevcut hızla extrapolasyon</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
            <Building2 size={12} /> Blok 3D görünüm (kat planı simülasyonu)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {blokOzetleri.map((b) => (
              <div key={b.profil.id}>
                <IsometricBlok
                  ozet={b}
                  secili={seciliBlok === b.profil.blok}
                  onClick={() => setSeciliBlok(b.profil.blok)}
                />
              </div>
            ))}
          </div>
          {!blokOzetleri.length && (
            <p className="text-sm text-stone-500 p-6 text-center border border-dashed rounded-xl">
              Bu parselde blok profili yok.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {detay ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-sm font-black text-stone-900">
                Blok {detay.profil.blok} · detay
              </p>
              <div className="text-xs text-stone-600 space-y-1">
                <p>
                  <Layers size={12} className="inline mr-1" />
                  {detay.profil.katSayisi} kat · {detay.fiiliDaireSayisi} daire
                </p>
                {detay.sonFaaliyetTarihi && (
                  <p>Son saha faaliyeti: {formatDateLabelTr(detay.sonFaaliyetTarihi)}</p>
                )}
                {detay.acikPunch > 0 && (
                  <p className="text-rose-700 font-bold">{detay.acikPunch} açık punch kalemi</p>
                )}
              </div>
              <p className="text-[10px] font-black uppercase text-stone-500">İmalat aşamaları</p>
              <div className="space-y-1.5">
                {IMALAT_ASAMALARI.map((a) => {
                  const p = detay.asamaYuzdeleri[a.key as ProjeImalatAsama] || 0;
                  return (
                    <div key={a.key}>
                      <div className="flex justify-between text-[10px] font-bold text-stone-700">
                        <span>{a.label}</span>
                        <span>{p}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {detay.scheduleSapmaGun !== undefined && detay.hedefBitis && (
                <p
                  className={`text-[11px] font-bold ${
                    (detay.scheduleSapmaGun || 0) > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  Tahmini bitiş hedeften {(detay.scheduleSapmaGun || 0) > 0 ? '+' : ''}
                  {detay.scheduleSapmaGun} gün
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-xs text-stone-500">
              Detay için bir blok seçin
            </div>
          )}

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-1.5 mb-2">
              <Users size={12} /> Kaynak havuzu — taşeron / ekip
            </p>
            {anaFirma.length > 0 && (
              <p className="text-[10px] font-bold text-stone-700 mb-1">
                Ana firma: {anaFirma.reduce((s, k) => s + k.aktifPersonel, 0)} aktif
              </p>
            )}
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {taseronHavuz.map((k) => (
                <li
                  key={`${k.firmaTipi}_${k.firmaAdi}`}
                  className="flex justify-between gap-2 text-[11px] border-b border-stone-100 pb-1"
                >
                  <span className="font-semibold text-stone-800 truncate">{k.firmaAdi}</span>
                  <span className="shrink-0 font-black text-stone-600">
                    {k.aktifPersonel}{' '}
                    <span className="font-normal text-stone-400">
                      ({k.ustalar}u/{k.isciler}i)
                    </span>
                  </span>
                </li>
              ))}
              {!taseronHavuz.length && (
                <li className="text-[11px] text-stone-400">Aktif taşeron personeli yok</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 text-[10px] text-sky-950 leading-snug">
            <HardHat size={12} className="inline mr-1" />
            Tam BIM/3D yerine kat katmanı simülasyonu kullanılıyor. Kat/daire sayıları profilden;
            daire sayısı temizlik envanterinden güncellenir. İleride IFC/kat planı PDF bağlanabilir.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjeBlokHaritaPanel;
