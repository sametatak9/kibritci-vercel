import React, { useMemo, useState } from 'react';
import { Building2, Map as MapIcon, Tent, Users, ChevronRight, Maximize2 } from 'lucide-react';
import type { KampKaydi, KampOdasi, Personel } from '../types/erp';
import {
  buildKampKrokiModel,
  firmaKrokiColor,
  type KampKatKroki,
  type KampOdaKrokiHucre,
  type KampYerleskeKroki,
} from '../lib/kampKrokiUtils';

type Props = {
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
  personeller: Personel[];
  onNavigate: (tab: string) => void;
};

function groupSakinlerByFirma(cell: KampOdaKrokiHucre) {
  const map = new Map<string, string[]>();
  for (const s of cell.sakinler) {
    const firma = s.firma || 'TAŞERON';
    if (!map.has(firma)) map.set(firma, []);
    map.get(firma)!.push(s.isim);
  }
  return Array.from(map.entries())
    .map(([firma, isimler]) => ({
      firma,
      isimler: isimler.sort((a, b) => a.localeCompare(b, 'tr')),
    }))
    .sort((a, b) => b.isimler.length - a.isimler.length || a.firma.localeCompare(b.firma, 'tr'));
}

const OdaSakinKarti: React.FC<{ cell: KampOdaKrokiHucre; kat: string; yerleske: string }> = ({
  cell,
  kat,
  yerleske,
}) => {
  const gruplar = groupSakinlerByFirma(cell);
  const c = cell.dominantFirma ? firmaKrokiColor(cell.dominantFirma) : null;

  return (
    <div
      className="rounded-xl border p-3 bg-white shadow-sm hover:shadow-md transition-shadow"
      style={{ borderColor: c ? `${c.bg}44` : '#E2E8F0' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black text-slate-900">Oda {cell.room.odaNo}</p>
          <p className="text-[9px] text-slate-500 truncate" title={`${yerleske} · ${kat}`}>
            {yerleske} · {kat}
          </p>
        </div>
        <span
          className={`shrink-0 text-[9px] font-extrabold px-2 py-0.5 rounded-lg ${
            cell.dolu >= cell.kapasite ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {cell.dolu}/{cell.kapasite}
        </span>
      </div>
      <div className="space-y-2">
        {gruplar.map((g) => {
          const fc = firmaKrokiColor(g.firma);
          return (
            <div key={g.firma}>
              <div
                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md mb-1"
                style={{ background: fc.soft, color: fc.text }}
              >
                <span className="w-1.5 h-1.5 rounded-sm" style={{ background: fc.bg }} />
                {g.firma}
                <span className="tabular-nums opacity-70">({g.isimler.length})</span>
              </div>
              <ul className="space-y-0.5 pl-1">
                {g.isimler.map((isim, idx) => (
                  <li
                    key={`${g.firma}-${isim}-${idx}`}
                    className="text-[10px] font-semibold text-slate-800 leading-snug"
                  >
                    {isim}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const KampOdaListe: React.FC<{
  visible: KampYerleskeKroki[];
  firmaFilter: string | null;
}> = ({ visible, firmaFilter }) => {
  const doluOdalar = useMemo(() => {
    const rows: Array<{ campus: KampYerleskeKroki; kat: KampKatKroki; cell: KampOdaKrokiHucre }> = [];
    for (const campus of visible) {
      for (const kat of campus.katlar) {
        for (const cell of kat.odalar) {
          if (cell.dolu === 0) continue;
          if (firmaFilter && !cell.sakinler.some((s) => s.firma === firmaFilter)) continue;
          rows.push({ campus, kat, cell });
        }
      }
    }
    return rows;
  }, [visible, firmaFilter]);

  if (doluOdalar.length === 0) {
    return (
      <div className="px-5 sm:px-6 py-12 text-center text-sm text-slate-500">
        {firmaFilter
          ? `"${firmaFilter}" firmasına ait dolu oda bulunamadı.`
          : 'Seçili blokta dolu oda yok.'}
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-6 py-4 max-h-[560px] overflow-y-auto space-y-6">
      {visible.map((campus) => {
        const campusRows = doluOdalar.filter((r) => r.campus.yerleske === campus.yerleske);
        if (campusRows.length === 0) return null;

        return (
          <div key={campus.yerleske}>
            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-white/95 backdrop-blur py-1 z-10">
              <Building2 size={14} className="text-orange-500" />
              <h3 className="font-display font-bold text-sm text-slate-900">{campus.yerleske}</h3>
              <span className="text-[10px] text-slate-500 font-semibold tabular-nums">
                {campus.dolu}/{campus.kapasite} yatak
              </span>
            </div>
            <div className="space-y-4">
              {campus.katlar.map((kat) => {
                const katRows = campusRows.filter((r) => r.kat.kat === kat.kat);
                if (katRows.length === 0) return null;
                return (
                  <div key={`${campus.yerleske}-${kat.kat}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      {kat.kat} · {kat.dolu}/{kat.kapasite} yatak
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {katRows.map(({ cell }) => (
                        <OdaSakinKarti
                          key={cell.room.id}
                          cell={cell}
                          kat={kat.kat}
                          yerleske={campus.yerleske}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Ana sayfa kamp paneli — oda · firma · isim listesi (3D yok). */
export const DashboardKampOdaPanel: React.FC<Props> = ({
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
  const [firmaFilter, setFirmaFilter] = useState<string | null>(null);

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
        .sort((a, b) => b.kisi - a.kisi),
    };
  }, [model]);

  const visible = selected === 'HEPSI' ? model : model.filter((c) => c.yerleske === selected);

  if (kampOdalari.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-orange-200 bg-gradient-to-br from-orange-50/50 to-white p-8 text-center">
        <Tent size={32} className="mx-auto text-orange-300 mb-3" />
        <h3 className="font-display font-bold text-slate-900">Kamp yerleşimi</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Kamp odası tanımlayınca burada oda bazlı firma ve isim listesi görünür.
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
    <section className="rounded-2xl border border-orange-100/80 bg-white shadow-sm overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-orange-50 bg-gradient-to-r from-orange-50/80 via-white to-amber-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-200/40">
            <MapIcon size={20} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Kamp Yerleşimi</h2>
            <p className="text-[11px] text-slate-500">Oda · firma · konaklayan isimler</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold tabular-nums text-[11px]">
            <Users size={12} /> {totals.dolu} kişi
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 font-bold tabular-nums text-[11px]">
            {totals.kapasite} yatak · %{totals.pct}
          </span>
          <button
            type="button"
            onClick={() => onNavigate('kamp')}
            className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
          >
            <Maximize2 size={12} /> Kamp Modülü
          </button>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-2.5 flex flex-wrap gap-1.5 border-b border-slate-50 bg-slate-50/40">
        <button
          type="button"
          onClick={() => setSelected('HEPSI')}
          className={`text-[10px] font-bold px-3 py-1 rounded-lg cursor-pointer transition ${
            selected === 'HEPSI'
              ? 'bg-orange-500 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-200'
          }`}
        >
          Tümü ({model.length})
        </button>
        {model.map((c) => (
          <button
            key={c.yerleske}
            type="button"
            onClick={() => setSelected(c.yerleske)}
            className={`text-[10px] font-bold px-3 py-1 rounded-lg cursor-pointer transition max-w-[140px] truncate ${
              selected === c.yerleske
                ? 'bg-orange-500 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-200'
            }`}
            title={c.yerleske}
          >
            {c.yerleske} ({c.dolu})
          </button>
        ))}
      </div>

      <KampOdaListe visible={visible} firmaFilter={firmaFilter} />

      {totals.firmalar.length > 0 && (
        <div className="px-5 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/30">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">
              Firma filtresi
            </span>
            {firmaFilter && (
              <button
                type="button"
                onClick={() => setFirmaFilter(null)}
                className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Tümü
              </button>
            )}
            {totals.firmalar.map((f) => {
              const c = firmaKrokiColor(f.firma);
              const active = firmaFilter === f.firma;
              return (
                <button
                  key={f.firma}
                  type="button"
                  onClick={() => setFirmaFilter(active ? null : f.firma)}
                  className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border cursor-pointer hover:brightness-95 ${
                    active ? 'ring-2 ring-orange-400 ring-offset-1' : ''
                  }`}
                  style={{ background: c.soft, color: c.text, borderColor: `${c.bg}33` }}
                  title={`${f.firma} odalarını filtrele`}
                >
                  <span className="w-2 h-2 rounded-sm" style={{ background: c.bg }} />
                  {f.firma.length > 16 ? `${f.firma.slice(0, 14)}…` : f.firma}
                  <span className="tabular-nums opacity-80">{f.kisi}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardKampOdaPanel;
