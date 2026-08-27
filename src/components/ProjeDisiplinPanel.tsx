import React, { useEffect, useMemo, useState } from 'react';
import {
  Droplets,
  Leaf,
  Play,
  Pause,
  Trees,
} from 'lucide-react';
import type { ProjeDisiplinDurum, ProjeDisiplinIlerleme } from '../types/erp';
import { DisiplinGrup } from '../data/parsel15751DisiplinSeed';
import { DISIPLIN_DURUM_LABEL, calcDisiplinOzet } from '../lib/projeDisiplinUtils';

type Props = {
  grup: Exclude<DisiplinGrup, 'MIMARI'>;
  satirlari: ProjeDisiplinIlerleme[];
  busy?: boolean;
  onUpdate: (row: ProjeDisiplinIlerleme, patch: Partial<ProjeDisiplinIlerleme>) => void;
};

function durumTone(d: ProjeDisiplinDurum): string {
  if (d === 'TAMAMLANDI') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (d === 'IMALATTA') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (d === 'BEKLEMEDE') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-sky-50 text-sky-900 border-sky-200';
}

function gorselRenk(gorsel: string | undefined, yuzde: number, grup: DisiplinGrup): string {
  if (yuzde >= 100) return grup === 'ALTYAPI' ? '#0284c7' : '#059669';
  if (yuzde >= 50) return grup === 'ALTYAPI' ? '#38bdf8' : '#34d399';
  if (yuzde > 0) return grup === 'ALTYAPI' ? '#7dd3fc' : '#a7f3d0';
  return '#e2e8f0';
}

/** Animasyonlu izometrik saha sahnesi — altyapı boruları / peyzaj yeşili */
function DisiplinSahne({
  grup,
  satirlari,
  anim,
}: {
  grup: DisiplinGrup;
  satirlari: ProjeDisiplinIlerleme[];
  anim: boolean;
}) {
  const byGorsel = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of satirlari) {
      const key = s.gorsel || s.kod;
      const prev = m.get(key) || 0;
      m.set(key, Math.max(prev, s.yuzde || 0));
    }
    return m;
  }, [satirlari]);

  const genel = calcDisiplinOzet(satirlari).yuzde;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-br from-slate-100 via-white to-emerald-50/40 p-4 min-h-[280px]">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#64748b 1px, transparent 1px), linear-gradient(90deg, #64748b 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          transform: 'skewY(-6deg) scale(1.2)',
        }}
      />

      {/* Zemin plakası */}
      <div
        className="relative mx-auto mt-4 w-[min(100%,420px)] h-40 rounded-xl border border-stone-300/80 shadow-lg"
        style={{
          transform: 'perspective(800px) rotateX(52deg) rotateZ(-18deg)',
          background: `linear-gradient(135deg, #f8fafc 0%, ${
            grup === 'PEYZAJ' ? '#ecfdf5' : '#f0f9ff'
          } 100%)`,
        }}
      >
        {/* Blok kutuları */}
        <div className="absolute inset-4 grid grid-cols-3 gap-2 content-center">
          {['A', 'B', 'C'].map((row, ri) =>
            [1, 2, 3].map((c) => {
              const fill = Math.min(100, Math.max(0, genel - ri * 12 + c * 4));
              return (
                <div
                  key={`${row}${c}`}
                  className="h-8 rounded-md border border-stone-400/40 shadow-sm transition-all duration-700"
                  style={{
                    background: gorselRenk(
                      grup === 'PEYZAJ' ? 'bitki' : 'kanal',
                      fill,
                      grup
                    ),
                    opacity: 0.55 + (fill / 100) * 0.45,
                    animation: anim ? `pulseSoft ${2.4 + ri * 0.3}s ease-in-out infinite` : undefined,
                    animationDelay: `${ri * 0.2 + c * 0.1}s`,
                  }}
                  title={`Bölge ${row}${c}`}
                />
              );
            })
          )}
        </div>

        {/* Altyapı boru hatları */}
        {grup === 'ALTYAPI' && (
          <>
            <div
              className="absolute left-[8%] right-[8%] top-[42%] h-1.5 rounded-full origin-left"
              style={{
                background: gorselRenk('kanal', byGorsel.get('kanal') || 0, grup),
                width: `${Math.max(12, byGorsel.get('kanal') || 8)}%`,
                maxWidth: '84%',
                transition: 'width 0.8s ease',
                boxShadow: '0 0 8px rgba(14,165,233,0.45)',
                animation: anim ? 'flowPulse 2s ease-in-out infinite' : undefined,
              }}
            />
            <div
              className="absolute left-[20%] top-[20%] bottom-[20%] w-1.5 rounded-full"
              style={{
                background: gorselRenk('drenaj', byGorsel.get('drenaj') || 0, grup),
                height: `${Math.max(12, byGorsel.get('drenaj') || 8)}%`,
                maxHeight: '60%',
                transition: 'height 0.8s ease',
                animation: anim ? 'flowPulse 2.4s ease-in-out infinite' : undefined,
              }}
            />
            {[18, 42, 66].map((left, i) => (
              <div
                key={left}
                className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
                style={{
                  left: `${left}%`,
                  top: `${38 + (i % 2) * 10}%`,
                  background: gorselRenk('baca', byGorsel.get('baca') || 0, grup),
                  transform: anim ? undefined : undefined,
                  animation: anim ? `bacaBlink ${1.6 + i * 0.2}s ease-in-out infinite` : undefined,
                }}
              />
            ))}
          </>
        )}

        {/* Peyzaj yeşil dalgalar */}
        {grup === 'PEYZAJ' && (
          <>
            <div
              className="absolute left-[6%] right-[6%] bottom-[18%] h-3 rounded-full"
              style={{
                background: gorselRenk('yaya', byGorsel.get('yaya') || 0, grup),
                opacity: 0.85,
                width: `${Math.max(20, byGorsel.get('yaya') || 15)}%`,
                maxWidth: '88%',
                transition: 'width 0.8s ease',
              }}
            />
            <div
              className="absolute left-[10%] right-[10%] bottom-[28%] h-2 rounded-full"
              style={{
                background: gorselRenk('bisiklet', byGorsel.get('bisiklet') || 0, grup),
                width: `${Math.max(15, byGorsel.get('bisiklet') || 10)}%`,
                maxWidth: '80%',
                transition: 'width 0.8s ease',
              }}
            />
            {[22, 48, 72].map((left, i) => (
              <div
                key={left}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${left}%`,
                  bottom: `${32 + i * 4}%`,
                  animation: anim ? `growUp ${2 + i * 0.4}s ease-in-out infinite` : undefined,
                }}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{
                    background: gorselRenk('bitki', byGorsel.get('bitki') || 0, grup),
                    transform: `scale(${0.5 + ((byGorsel.get('bitki') || 0) / 100) * 0.8})`,
                    transition: 'transform 0.6s ease',
                  }}
                />
                <div className="w-1 h-3 bg-emerald-800/50 rounded-full" />
              </div>
            ))}
            <div
              className="absolute right-[14%] top-[22%] w-6 h-4 rounded-sm border border-amber-700/30"
              style={{
                background: gorselRenk('bank', byGorsel.get('bank') || 0, grup),
                opacity: 0.4 + ((byGorsel.get('bank') || 0) / 100) * 0.6,
              }}
            />
            <div
              className="absolute left-[12%] top-[18%] w-8 h-8 rounded-lg border border-rose-300/50"
              style={{
                background: gorselRenk('oyun', byGorsel.get('oyun') || 0, grup),
                opacity: 0.35 + ((byGorsel.get('oyun') || 0) / 100) * 0.65,
              }}
            />
          </>
        )}
      </div>

      <div className="relative mt-6 flex items-center justify-center gap-3">
        <div className="rounded-xl border border-stone-200 bg-white/90 px-4 py-2 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase text-stone-500">
            {grup === 'ALTYAPI' ? 'Altyapı fiili' : 'Peyzaj fiili'}
          </p>
          <p className="text-2xl font-black tabular-nums text-stone-900">{genel}%</p>
        </div>
      </div>

      <style>{`
        @keyframes pulseSoft {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.12); }
        }
        @keyframes flowPulse {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes bacaBlink {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes growUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

export const ProjeDisiplinPanel: React.FC<Props> = ({ grup, satirlari, busy, onUpdate }) => {
  const [anim, setAnim] = useState(true);
  const [filtreBlok, setFiltreBlok] = useState('');
  const ozet = useMemo(() => calcDisiplinOzet(satirlari), [satirlari]);

  const filtered = useMemo(() => {
    if (!filtreBlok) return satirlari;
    return satirlari.filter((s) => s.blok === filtreBlok || s.blok === 'GENEL');
  }, [satirlari, filtreBlok]);

  const bloklar = useMemo(
    () => [...new Set(satirlari.map((s) => s.blok).filter((b) => b !== 'GENEL'))].sort(),
    [satirlari]
  );

  useEffect(() => {
    setAnim(true);
  }, [grup]);

  const Icon = grup === 'ALTYAPI' ? Droplets : Trees;
  const title = grup === 'ALTYAPI' ? 'Altyapı (157/51)' : 'Bitkisel / yapısal peyzaj (157/51)';
  const subtitle =
    grup === 'ALTYAPI'
      ? 'Kaynak: 51-ALTYAPI-R11.dwg — kanal, drenaj, baca, boru, kot, yol'
      : 'Kaynak: XREF-157-51-YAPISAL-PEYZAJ — döşeme, yol, bank, oyun, KBR, bitki';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
              <Icon size={12} /> DWG → WBS → İlerleme
            </p>
            <h2 className="text-lg font-black text-stone-900">{title}</h2>
            <p className="mt-1 text-xs text-stone-600 max-w-xl">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAnim((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[10px] font-black uppercase cursor-pointer"
            >
              {anim ? <Pause size={12} /> : <Play size={12} />}
              {anim ? 'Animasyonu durdur' : 'Animasyonu başlat'}
            </button>
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center">
              <p className="text-[9px] font-bold uppercase text-stone-500">Genel</p>
              <p className="text-xl font-black tabular-nums">{ozet.yuzde}%</p>
              <p className="text-[9px] text-stone-500">
                {ozet.tamamlanan}/{ozet.toplam} tamam · {ozet.imalatta} imalatta
              </p>
            </div>
          </div>
        </div>
      </div>

      <DisiplinSahne grup={grup} satirlari={satirlari} anim={anim} />

      <div className="flex flex-wrap items-center gap-2">
        <Leaf size={12} className="text-stone-400" />
        <select
          value={filtreBlok}
          onChange={(e) => setFiltreBlok(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-semibold"
        >
          <option value="">Tüm kalemler</option>
          <option value="GENEL">Parsel geneli</option>
          {bloklar.map((b) => (
            <option key={b} value={b}>
              Blok {b}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map((row) => (
          <div
            key={row.id}
            className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm space-y-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400">
                  {row.kod}
                  {row.blok !== 'GENEL' ? ` · Blok ${row.blok}` : ' · Parsel geneli'}
                </p>
                <p className="text-sm font-black text-stone-900">{row.baslik}</p>
                {row.dwgKaynak && (
                  <p className="text-[10px] text-stone-500 mt-0.5">DWG: {row.dwgKaynak}</p>
                )}
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${durumTone(row.durum)}`}
              >
                {DISIPLIN_DURUM_LABEL[row.durum]}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['PLANLANDI', 'IMALATTA', 'TAMAMLANDI', 'BEKLEMEDE'] as ProjeDisiplinDurum[]).map(
                (d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={busy || row.durum === d}
                    onClick={() =>
                      onUpdate(row, {
                        durum: d,
                        yuzde: d === 'TAMAMLANDI' ? 100 : d === 'IMALATTA' ? Math.max(row.yuzde, 40) : row.yuzde,
                      })
                    }
                    className={`rounded-lg border px-2 py-1 text-[10px] font-black cursor-pointer disabled:opacity-40 ${
                      row.durum === d ? durumTone(d) : 'border-stone-200 bg-stone-50 text-stone-600'
                    }`}
                  >
                    {DISIPLIN_DURUM_LABEL[d]}
                  </button>
                )
              )}
            </div>

            <label className="block text-[10px] font-bold uppercase text-stone-500">
              İlerleme %{row.yuzde}
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={row.yuzde}
                disabled={busy}
                onChange={(e) => {
                  const yuzde = Number(e.target.value);
                  const durum: ProjeDisiplinDurum =
                    yuzde >= 100 ? 'TAMAMLANDI' : yuzde > 0 ? 'IMALATTA' : 'PLANLANDI';
                  onUpdate(row, { yuzde, durum });
                }}
                className="mt-1 w-full accent-emerald-700"
              />
            </label>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${row.yuzde}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjeDisiplinPanel;
