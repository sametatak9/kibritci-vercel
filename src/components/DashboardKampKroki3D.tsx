import React, { useMemo, useState } from 'react';
import { Building2, Map as MapIcon, Tent, Users, ChevronRight, Maximize2 } from 'lucide-react';
import type { KampKaydi, KampOdasi, Personel } from '../types/erp';
import {
  buildKampKrokiModel,
  firmaKrokiColor,
  type KampKatKroki,
  type KampYerleskeKroki,
} from '../lib/kampKrokiUtils';

type Props = {
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
  personeller: Personel[];
  onNavigate: (tab: string) => void;
};

const IsoFloor: React.FC<{
  kat: KampKatKroki;
  layerIndex: number;
}> = ({ kat, layerIndex }) => {
  const pct = kat.kapasite > 0 ? Math.round((kat.dolu / kat.kapasite) * 100) : 0;
  const z = layerIndex * 26;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 w-[92%] rounded-sm border border-white/20 shadow-[4px_4px_0_rgba(15,23,42,0.12)] transition-transform duration-300 hover:scale-[1.02]"
      style={{
        bottom: `${12 + layerIndex * 22}px`,
        height: '20px',
        transform: `translateZ(${z}px)`,
        transformStyle: 'preserve-3d',
        background: `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(254,243,199,0.9) 100%)`,
      }}
      title={`${kat.kat}: ${kat.dolu}/${kat.kapasite} yatak (%${pct})`}
    >
      <div className="absolute inset-0 flex overflow-hidden rounded-sm">
        {kat.odalar.length === 0 ? (
          <div className="flex-1 bg-slate-200/80" />
        ) : (
          kat.odalar.map((cell) => {
            const empty = cell.dolu === 0;
            const c = cell.dominantFirma ? firmaKrokiColor(cell.dominantFirma) : null;
            const fill = empty ? '#E2E8F0' : c?.bg || '#0F6C5C';
            return (
              <div
                key={cell.room.id}
                className="h-full border-r border-white/30 last:border-r-0 min-w-[3px]"
                style={{
                  flex: Math.max(1, cell.kapasite),
                  background: fill,
                  opacity: empty ? 0.45 : cell.dolu >= cell.kapasite ? 1 : 0.82,
                }}
                title={`Oda ${cell.room.odaNo}: ${cell.dolu}/${cell.kapasite}`}
              />
            );
          })
        )}
      </div>
      <span className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full text-[7px] font-bold text-slate-500 whitespace-nowrap pr-1 opacity-0 group-hover:opacity-100 pointer-events-none">
        {kat.kat}
      </span>
    </div>
  );
};

const IsoBuilding: React.FC<{ campus: KampYerleskeKroki }> = ({ campus }) => {
  const floors = [...campus.katlar].reverse();
  const doluluk = campus.kapasite > 0 ? Math.round((campus.dolu / campus.kapasite) * 100) : 0;

  return (
    <div className="group flex flex-col items-center shrink-0">
      <div
        className="relative mx-auto"
        style={{
          width: '112px',
          height: `${Math.max(80, 24 + floors.length * 22)}px`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Roof cap */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[98%] h-3 rounded-t-md bg-gradient-to-b from-orange-400 to-orange-500 border border-orange-600/30 shadow-md"
          style={{ bottom: `${12 + floors.length * 22}px`, transform: `translateZ(${floors.length * 26 + 8}px)` }}
        />
        {floors.map((kat, i) => (
          <IsoFloor key={kat.kat} kat={kat} layerIndex={i} />
        ))}
        {/* Ground shadow */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[85%] h-3 rounded-[50%] bg-slate-900/10 blur-sm"
          style={{ bottom: '4px' }}
        />
      </div>
      <div className="mt-3 text-center max-w-[120px]">
        <p className="text-[10px] font-black text-slate-800 uppercase tracking-wide leading-tight truncate" title={campus.yerleske}>
          {campus.yerleske}
        </p>
        <p className="text-[9px] text-slate-500 font-semibold tabular-nums mt-0.5">
          {campus.dolu}/{campus.kapasite} · %{doluluk}
        </p>
      </div>
    </div>
  );
};

export const DashboardKampKroki3D: React.FC<Props> = ({
  kampOdalari,
  kampKayitlari,
  personeller,
  onNavigate,
}) => {
  const model = useMemo(
    () => buildKampKrokiModel(kampOdalari, kampKayitlari, personeller),
    [kampOdalari, kampKayitlari, personeller]
  );

  const [selected, setSelected] = useState<string>('HEPSI');

  const totals = useMemo(() => {
    let dolu = 0;
    let kapasite = 0;
    const firmaMap = new Map<string, number>();
    for (const c of model) {
      dolu += c.dolu;
      kapasite += c.kapasite;
      for (const f of c.firmalar) {
        firmaMap.set(f.firma, (firmaMap.get(f.firma) || 0) + f.kisi);
      }
    }
    return {
      dolu,
      kapasite,
      pct: kapasite > 0 ? Math.round((dolu / kapasite) * 100) : 0,
      firmaSayisi: firmaMap.size,
      firmalar: Array.from(firmaMap.entries())
        .map(([firma, kisi]) => ({ firma, kisi }))
        .sort((a, b) => b.kisi - a.kisi)
        .slice(0, 10),
    };
  }, [model]);

  const visible = selected === 'HEPSI' ? model : model.filter((c) => c.yerleske === selected);

  if (kampOdalari.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-orange-200 bg-gradient-to-br from-orange-50/50 to-white p-8 text-center">
        <Tent size={32} className="mx-auto text-orange-300 mb-3" />
        <h3 className="font-display font-bold text-slate-900">Kamp krokisi</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Henüz kamp odası tanımlı değil. Kamp modülünden yerleşke ve oda ekleyince 3D kroki burada görünür.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('kamp')}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
        >
          Kamp Yönetimine Git <ChevronRight size={14} />
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-orange-100/80 bg-white shadow-[0_12px_48px_-16px_rgba(251,146,60,0.25)] overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 py-4 border-b border-orange-50 bg-gradient-to-r from-orange-50/80 via-white to-amber-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-200/50">
            <MapIcon size={20} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Kamp Kroki — 3D Görünüm</h2>
            <p className="text-[11px] text-slate-500">Blok · kat · oda doluluk haritası (canlı)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold tabular-nums">
              <Users size={12} /> {totals.dolu}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 font-bold tabular-nums">
              {totals.kapasite} yatak
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-100 text-orange-800 font-bold tabular-nums">
              %{totals.pct}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('kamp')}
            className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
          >
            <Maximize2 size={12} /> Detaylı Kroki
          </button>
        </div>
      </div>

      {/* Campus filter */}
      <div className="px-5 sm:px-6 py-2.5 flex flex-wrap gap-1.5 border-b border-slate-50 bg-slate-50/40">
        <button
          type="button"
          onClick={() => setSelected('HEPSI')}
          className={`text-[10px] font-bold px-3 py-1 rounded-lg cursor-pointer transition ${selected === 'HEPSI' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-200'}`}
        >
          Tümü ({model.length})
        </button>
        {model.map((c) => (
          <button
            key={c.yerleske}
            type="button"
            onClick={() => setSelected(c.yerleske)}
            className={`text-[10px] font-bold px-3 py-1 rounded-lg cursor-pointer transition max-w-[140px] truncate ${selected === c.yerleske ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-200'}`}
            title={c.yerleske}
          >
            {c.yerleske} ({c.dolu})
          </button>
        ))}
      </div>

      {/* 3D Scene */}
      <div className="relative px-4 sm:px-6 py-8 sm:py-10 overflow-x-auto">
        {/* Grid floor */}
        <div
          className="absolute inset-x-6 bottom-6 top-16 rounded-2xl opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(251,146,60,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(251,146,60,0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            transform: 'perspective(400px) rotateX(72deg)',
            transformOrigin: 'center bottom',
          }}
        />

        <div
          className="kamp-iso-scene relative mx-auto flex flex-wrap justify-center gap-8 sm:gap-12 min-h-[220px] items-end pb-6"
          style={{
            perspective: '1100px',
            perspectiveOrigin: '50% 35%',
          }}
        >
          <div
            className="flex flex-wrap justify-center gap-8 sm:gap-14 items-end"
            style={{
              transform: 'rotateX(52deg) rotateZ(-38deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {visible.map((campus) => (
              <IsoBuilding key={campus.yerleske} campus={campus} />
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-2">
          Her kat şeridi = odalar · renk = baskın firma · boş gri
        </p>
      </div>

      {/* Legend + dolu oda list */}
      <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/30 space-y-3">
        {totals.firmalar.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">Firma</span>
            {totals.firmalar.map((f) => {
              const c = firmaKrokiColor(f.firma);
              return (
                <span
                  key={f.firma}
                  className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border"
                  style={{ background: c.soft, color: c.text, borderColor: `${c.bg}33` }}
                >
                  <span className="w-2 h-2 rounded-sm" style={{ background: c.bg }} />
                  {f.firma.length > 16 ? `${f.firma.slice(0, 14)}…` : f.firma}
                  <span className="tabular-nums opacity-80">{f.kisi}</span>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Building2 size={12} className="text-orange-500" />
            {visible.length} blok · {totals.firmaSayisi} firma kampta
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-700 font-semibold">■ Boş oda</span>
          <span className="text-slate-400">■ Dolu (firma rengi)</span>
        </div>
      </div>
    </section>
  );
};

export default DashboardKampKroki3D;
