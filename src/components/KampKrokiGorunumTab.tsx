import React, { useMemo, useState } from 'react';
import { Building2, Layers, Map as MapIcon, Users, ChevronDown, ChevronUp, FileSpreadsheet, X, FileText } from 'lucide-react';
import { KampKaydi, KampOdasi, Personel } from '../types/erp';
import {
  buildKampKrokiModel,
  firmaKrokiColor,
  type KampKatKroki,
  type KampYerleskeKroki,
} from '../lib/kampKrokiUtils';
import { exportKampKrokiTaseronExcel } from '../lib/kampKrokiTaseronExcel';
import { KampFirmaGroupedView } from './KampFirmaGroupedView';

interface KampKrokiGorunumTabProps {
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
  personeller: Personel[];
  onSelectOda?: (odaId: string) => void;
}

function OccupancyMeter({ dolu, kapasite }: { dolu: number; kapasite: number }) {
  const pct = kapasite > 0 ? Math.min(100, Math.round((dolu / kapasite) * 100)) : 0;
  const tone =
    pct >= 95 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : pct > 0 ? 'bg-teal-600' : 'bg-slate-300';
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FirmaStackBar({
  firmalar,
  total,
}: {
  firmalar: { firma: string; kisi: number }[];
  total: number;
}) {
  if (total <= 0 || firmalar.length === 0) {
    return (
      <div className="h-8 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400 font-bold uppercase tracking-wider">
        Boş kat
      </div>
    );
  }
  return (
    <div className="h-8 rounded-lg overflow-hidden flex border border-slate-200 shadow-inner bg-white">
      {firmalar.map((f) => {
        const color = firmaKrokiColor(f.firma);
        const w = Math.max(8, (f.kisi / total) * 100);
        return (
          <div
            key={f.firma}
            title={`${f.firma}: ${f.kisi} kişi`}
            className="h-full flex items-center justify-center text-[9px] font-black text-white transition-all duration-500 hover:brightness-110 min-w-[2rem]"
            style={{ width: `${w}%`, background: color.bg }}
          >
            {f.kisi}
          </div>
        );
      })}
    </div>
  );
}

const FloorPlanStrip: React.FC<{
  kat: KampKatKroki;
  expanded: boolean;
  onToggle: () => void;
}> = ({ kat, expanded, onToggle }) => {
  return (
    <div className="kamp-floor-strip relative rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* Corridor rail */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600" />

      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left pl-5 pr-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-slate-50/80 transition"
      >
        <div className="sm:w-44 shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-amber-600" />
            <span className="font-display font-bold text-sm text-slate-900 uppercase tracking-wide">
              {kat.kat}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">
            {kat.odaSayisi} oda · {kat.dolu}/{kat.kapasite} yatak
          </p>
          <div className="mt-1.5 max-w-[10rem]">
            <OccupancyMeter dolu={kat.dolu} kapasite={kat.kapasite} />
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <FirmaStackBar firmalar={kat.firmalar} total={kat.dolu} />
          <div className="flex flex-wrap gap-1.5">
            {kat.firmalar.length === 0 ? (
              <span className="text-[9px] text-slate-400 italic">Bu katta aktif konaklama yok</span>
            ) : (
              kat.firmalar.map((f) => {
                const c = firmaKrokiColor(f.firma);
                return (
                  <span
                    key={f.firma}
                    className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border"
                    style={{ background: c.soft, color: c.text, borderColor: `${c.bg}33` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.bg }} />
                    {f.firma}
                    <strong className="tabular-nums">{f.kisi}</strong>
                  </span>
                );
              })
            )}
          </div>
        </div>

        <span className="text-slate-400 shrink-0 self-start sm:self-center">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-5 border-t border-slate-100 bg-[linear-gradient(180deg,#f8fafc_0%,#fff_40%)] animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="pt-3 mb-2 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Kat planı · oda hücreleri
            </span>
            <span className="text-[9px] text-slate-400 font-semibold">
              Renk = baskın firma
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {kat.odalar.map((cell, idx) => {
              const empty = cell.dolu === 0;
              const c = cell.dominantFirma ? firmaKrokiColor(cell.dominantFirma) : null;
              return (
                <div
                  key={cell.room.id}
                  className="relative rounded-xl border p-2.5 min-h-[88px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-0.5"
                  style={{
                    background: empty ? '#F8FAFC' : c?.soft || '#fff',
                    borderColor: empty ? '#E2E8F0' : `${c?.bg || '#94A3B8'}55`,
                    animationDelay: `${idx * 30}ms`,
                  }}
                  title={
                    empty
                      ? `Oda ${cell.room.odaNo} — boş`
                      : cell.sakinler.map((s) => `${s.isim} (${s.firma})`).join('\n')
                  }
                >
                  <div className="flex justify-between items-start gap-1">
                    <span className="font-mono font-black text-[11px] text-slate-900">
                      {cell.room.odaNo}
                    </span>
                    <span
                      className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${
                        empty
                          ? 'bg-emerald-100 text-emerald-700'
                          : cell.dolu >= cell.kapasite
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {cell.dolu}/{cell.kapasite}
                    </span>
                  </div>

                  {/* Bed dots */}
                  <div className="flex flex-wrap gap-0.5 my-1.5">
                    {Array.from({ length: Math.max(cell.kapasite, cell.dolu) }).map((_, i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-[2px]"
                        style={{
                          background: i < cell.dolu ? c?.bg || '#0F6C5C' : '#CBD5E1',
                        }}
                      />
                    ))}
                  </div>

                  <div className="space-y-0.5 min-h-[1.25rem]">
                    {empty ? (
                      <span className="text-[8px] text-slate-400 italic">Boş</span>
                    ) : (
                      <>
                        {cell.firmalar.slice(0, 2).map((f) => (
                          <div key={f.firma} className="text-[8px] font-bold truncate" style={{ color: c?.text }}>
                            {f.firma.length > 18 ? `${f.firma.slice(0, 16)}…` : f.firma}
                            <span className="tabular-nums ml-1 opacity-80">×{f.kisi}</span>
                          </div>
                        ))}
                        {cell.sakinler.length > 0 && (
                          <div className="mt-1 pt-1 border-t border-slate-200/60 space-y-0.5">
                            {cell.sakinler.slice(0, 4).map((s, idx) => (
                              <p key={`${s.id}-${idx}`} className="text-[7px] text-slate-600 leading-tight truncate" title={`${s.isim} (${s.firma})`}>
                                {s.isim}
                              </p>
                            ))}
                            {cell.sakinler.length > 4 && (
                              <p className="text-[7px] text-slate-400">+{cell.sakinler.length - 4} kişi</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const CampusBuilding: React.FC<{
  campus: KampYerleskeKroki;
  defaultExpanded: boolean;
}> = ({ campus, defaultExpanded }) => {
  const [openFloors, setOpenFloors] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    campus.katlar.forEach((k, i) => {
      init[k.kat] = defaultExpanded || i === 0;
    });
    return init;
  });

  const doluluk =
    campus.kapasite > 0 ? Math.round((campus.dolu / campus.kapasite) * 100) : 0;

  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-amber-50/40 overflow-hidden shadow-sm">
      {/* Building crown */}
      <div className="relative px-5 py-4 border-b border-slate-200/80 bg-[#1A2B32] text-white">
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent 0, transparent 48%, #fff 49%, #fff 51%, transparent 52%), linear-gradient(#fff 1px, transparent 1px)',
            backgroundSize: '28px 18px',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-amber-300" />
            </div>
            <div>
              <h3
                className="text-lg font-extrabold tracking-tight"
                style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
              >
                {campus.yerleske}
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {campus.katlar.length} kat · {campus.dolu} kişi kampta · %{doluluk} doluluk
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {campus.firmalar.slice(0, 6).map((f) => {
              const c = firmaKrokiColor(f.firma);
              return (
                <span
                  key={f.firma}
                  className="text-[9px] font-bold px-2 py-1 rounded-lg border border-white/15"
                  style={{ background: `${c.bg}cc` }}
                  title={f.firma}
                >
                  {f.firma.length > 14 ? `${f.firma.slice(0, 12)}…` : f.firma} · {f.kisi}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Stacked floors = building section */}
        <div className="space-y-2.5">
          {[...campus.katlar].reverse().map((kat) => (
            <FloorPlanStrip
              key={kat.kat}
              kat={kat}
              expanded={Boolean(openFloors[kat.kat])}
              onToggle={() =>
                setOpenFloors((prev) => ({ ...prev, [kat.kat]: !prev[kat.kat] }))
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export const KampKrokiGorunumTab: React.FC<KampKrokiGorunumTabProps> = ({
  kampOdalari,
  kampKayitlari,
  personeller,
  onSelectOda,
}) => {
  const model = useMemo(
    () => buildKampKrokiModel(kampOdalari, kampKayitlari, personeller),
    [kampOdalari, kampKayitlari, personeller]
  );

  const [selectedCampus, setSelectedCampus] = useState<string>('HEPSI');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [modalFirmaFilter, setModalFirmaFilter] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (selectedCampus === 'HEPSI') return model;
    return model.filter((c) => c.yerleske === selectedCampus);
  }, [model, selectedCampus]);

  const totals = useMemo(() => {
    const firmaMap = new Map<string, number>();
    let dolu = 0;
    let kapasite = 0;
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
      firmaSayisi: firmaMap.size,
      firmalar: Array.from(firmaMap.entries())
        .map(([firma, kisi]) => ({ firma, kisi }))
        .sort((a, b) => b.kisi - a.kisi),
    };
  }, [model]);

  const visibleDolu = visible.reduce((s, c) => s + c.dolu, 0);

  const handleExportTaseronExcel = async () => {
    if (visibleDolu === 0) {
      alert('Excel için bu kapsamda aktif konaklayan personel yok.');
      return;
    }
    setExportingExcel(true);
    try {
      await exportKampKrokiTaseronExcel({
        kampOdalari,
        kampKayitlari,
        personeller,
        yerleske: selectedCampus === 'HEPSI' ? undefined : selectedCampus,
      });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Kamp krokisi Excel raporu oluşturulamadı.');
    } finally {
      setExportingExcel(false);
    }
  };

  if (kampOdalari.length === 0) {
    return (
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center p-12 text-center shadow-sm">
        <MapIcon size={28} className="text-slate-300 mb-3" />
        <h3 className="font-bold text-sm text-slate-800">Kamp krokisi için oda yok</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Önce Oda &amp; Yerleşim sekmesinden yerleşke, kat ve oda oluşturun; burada kat–firma–kişi krokisi görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-hidden">
      {/* Hero strip */}
      <div className="shrink-0 rounded-2xl border border-slate-200 overflow-hidden bg-[linear-gradient(135deg,#1A2B32_0%,#2C4A52_45%,#3D6B4F_100%)] text-white shadow-sm">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-amber-200/90 text-[10px] font-bold uppercase tracking-[0.2em]">
              <MapIcon size={12} />
              Kamp krokisi
            </div>
            <h2
              className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
            >
              Kat · Firma · Personel
            </h2>
            <p className="text-[12px] text-slate-300 mt-1 max-w-xl leading-relaxed">
              Hangi katta hangi firmadan kaç kişi kaldığını kuşbakışı görün. Sağdaki Excel veya Firma etiketlerine tıklayarak personel &amp; oda detay raporunu açabilirsiniz.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] items-center">
            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 min-w-[5.5rem]">
              <span className="block text-[9px] text-slate-300 uppercase font-bold">Kampta</span>
              <span className="font-display font-bold text-lg tabular-nums flex items-center gap-1">
                <Users size={14} className="text-emerald-300" />
                {totals.dolu}
              </span>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 min-w-[5.5rem]">
              <span className="block text-[9px] text-slate-300 uppercase font-bold">Kapasite</span>
              <span className="font-display font-bold text-lg tabular-nums">{totals.kapasite}</span>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 min-w-[5.5rem]">
              <span className="block text-[9px] text-slate-300 uppercase font-bold">Firma</span>
              <span className="font-display font-bold text-lg tabular-nums">{totals.firmaSayisi}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleExportTaseronExcel()}
              disabled={exportingExcel || visibleDolu === 0}
              title="Hangi taşeronun kaç personeli hangi odalarda kalıyor — Kibritçi antetli Excel"
              className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-[10px] uppercase tracking-wide rounded-xl px-3 py-2 cursor-pointer transition flex items-center gap-1.5 min-w-[7.5rem]"
            >
              <FileSpreadsheet size={14} />
              {exportingExcel ? 'Excel hazırlanıyor…' : 'Taşeron oda Excel'}
            </button>
            <button
              type="button"
              onClick={() => setModalFirmaFilter('')}
              className="py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-[10px] uppercase tracking-wide shadow-md transition cursor-pointer flex items-center space-x-1 shrink-0"
            >
              <FileText size={14} />
              <span>🏢 Firma Raporu</span>
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-5 pb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCampus('HEPSI')}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
              selectedCampus === 'HEPSI'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Tüm yerleşkeler
          </button>
          {model.map((c) => (
            <button
              key={c.yerleske}
              type="button"
              onClick={() => setSelectedCampus(c.yerleske)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedCampus === c.yerleske
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {c.yerleske} ({c.dolu})
            </button>
          ))}
        </div>
      </div>

      {/* Firm legend */}
      {totals.firmalar.length > 0 && (
        <div className="shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 shadow-sm">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">
            Firma efsanesi (Detay için firmaya tıklayın)
          </span>
          {totals.firmalar.map((f) => {
            const c = firmaKrokiColor(f.firma);
            return (
              <button
                key={f.firma}
                type="button"
                onClick={() => setModalFirmaFilter(f.firma)}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg border transition hover:scale-105 cursor-pointer shadow-2xs"
                style={{ background: c.soft, color: c.text, borderColor: `${c.bg}40` }}
                title={`${f.firma} çalışanlarını ve oda listesini gör`}
              >
                <span className="w-2.5 h-2.5 rounded" style={{ background: c.bg }} />
                {f.firma}
                <span className="tabular-nums opacity-80">{f.kisi}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-5 pr-0.5 pb-2">
        {visible.map((campus, i) => (
          <CampusBuilding
            key={campus.yerleske}
            campus={campus}
            defaultExpanded={selectedCampus !== 'HEPSI' || i === 0}
          />
        ))}
      </div>

      {/* Interactive Modal for Firma Grouped Personnel & Room View */}
      {modalFirmaFilter !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
            <div className="p-3.5 bg-slate-900 text-white shrink-0 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 size={18} className="text-teal-400" />
                <span className="font-extrabold text-sm">Firma Bazlı Kamp Sakinleri &amp; Oda Detayı</span>
              </div>
              <button
                type="button"
                onClick={() => setModalFirmaFilter(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-4 overflow-hidden">
              <KampFirmaGroupedView
                kampKayitlari={kampKayitlari}
                personeller={personeller}
                kampOdalari={kampOdalari}
                initialFirmaFilter={modalFirmaFilter}
                onSelectOda={(odaId) => {
                  setModalFirmaFilter(null);
                  onSelectOda?.(odaId);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
