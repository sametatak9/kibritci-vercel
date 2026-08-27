import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Pause, Play, Home } from 'lucide-react';
import type { ProjeDisiplinDurum, ProjeDisiplinIlerleme } from '../types/erp';
import {
  C_BLOK_DWG,
  C_BLOK_PROFILLERI,
  C_BLOKLAR_157_51,
  C_DAIRE_PLAN_ODALARI,
  cBlokDaireNo,
  cBlokDaireSayisi,
  cBlokParselOzet,
  profilForCBlok,
  type CBlokKodu,
} from '../data/parsel15751CBlokSeed';
import { DISIPLIN_DURUM_LABEL, calcDisiplinOzet } from '../lib/projeDisiplinUtils';

type Props = {
  satirlari: ProjeDisiplinIlerleme[];
  busy?: boolean;
  onUpdate: (row: ProjeDisiplinIlerleme, patch: Partial<ProjeDisiplinIlerleme>) => void;
};

function odaRenk(yuzde: number): string {
  if (yuzde >= 100) return '#059669';
  if (yuzde >= 50) return '#34d399';
  if (yuzde > 0) return '#a7f3d0';
  return '#f1f5f9';
}

function durumTone(d: ProjeDisiplinDurum): string {
  if (d === 'TAMAMLANDI') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (d === 'IMALATTA') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (d === 'BEKLEMEDE') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-sky-50 text-sky-900 border-sky-200';
}

function gorselYuzde(satirlar: ProjeDisiplinIlerleme[], gorsel: string): number {
  const rows = satirlar.filter((s) => s.gorsel === gorsel);
  if (!rows.length) return 0;
  return Math.round(rows.reduce((a, r) => a + (r.yuzde || 0), 0) / rows.length);
}

type CBlokKuleProps = {
  blok: CBlokKodu;
  genelYuzde: number;
  katSayisi: number;
  dairePerKat: number;
  secili: boolean;
  anim: boolean;
  onClick: () => void;
};

/** 3D-ish kule — kat katmanları + daire hücreleri */
function CBlokKule(props: CBlokKuleProps): React.ReactElement {
  const { blok, genelYuzde, katSayisi, dairePerKat, secili, anim, onClick } = props;
  const katlar = Array.from({ length: katSayisi }, (_, i) => katSayisi - i);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-2xl border p-3 transition cursor-pointer ${
        secili
          ? 'border-violet-500 bg-violet-50/90 shadow-md ring-2 ring-violet-300'
          : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Blok</p>
          <p className="text-xl font-black text-stone-900">{blok}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tabular-nums text-stone-900">{genelYuzde}%</p>
          <p className="text-[9px] font-bold text-stone-500">mimari</p>
        </div>
      </div>

      <div
        className="mx-auto w-[88px] perspective-[700px]"
        style={{
          transform: 'rotateX(10deg) rotateY(-16deg)',
          animation: anim && secili ? 'cBlokFloat 3.2s ease-in-out infinite' : undefined,
        }}
      >
        <div className="flex flex-col gap-0.5 rounded-lg border border-stone-300 bg-gradient-to-b from-stone-50 to-stone-200 p-1 shadow-inner">
          {katlar.map((katNo, ki) => {
            const katFill = Math.min(100, Math.max(0, genelYuzde - ki * (100 / katSayisi) * 0.15));
            return (
              <div key={katNo} className="flex gap-0.5" title={`Kat ${katNo}`}>
                {Array.from({ length: dairePerKat }, (_, di) => (
                  <div
                    key={di}
                    className="h-2.5 flex-1 rounded-[2px] border border-white/50 transition-all duration-700"
                    style={{
                      background: odaRenk(katFill + di * 3),
                      opacity: 0.55 + (katFill / 100) * 0.45,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div
          className="absolute -right-1.5 top-1 bottom-1 w-2.5 rounded-sm bg-stone-300/80 border border-stone-400/40"
          style={{ transform: 'skewY(-28deg) translateX(2px)' }}
        />
      </div>

      <p className="mt-2 text-[9px] font-bold text-stone-500 text-center">
        {katSayisi} kat · {katSayisi * dairePerKat} daire
      </p>
    </button>
  );
}

/** Seçili blok — kat seç + şematik daire planı */
function DairePlanSahne({
  blok,
  satirlar,
  anim,
}: {
  blok: CBlokKodu;
  satirlar: ProjeDisiplinIlerleme[];
  anim: boolean;
}) {
  const profil = profilForCBlok(blok)!;
  const [katNo, setKatNo] = useState(1);
  const [daireIdx, setDaireIdx] = useState(1);
  const tavanY = gorselYuzde(satirlar, 'tavan');

  useEffect(() => {
    setKatNo(1);
    setDaireIdx(1);
  }, [blok]);

  const byGorsel = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of satirlar) {
      const key = s.gorsel || s.kod;
      m.set(key, Math.max(m.get(key) || 0, s.yuzde || 0));
    }
    return m;
  }, [satirlar]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-violet-50/40 via-white to-stone-50 p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-700 flex items-center gap-1">
            <Home size={12} /> Daire yerleşim planı
          </p>
          <h3 className="text-base font-black text-stone-900">
            {blok} · {cBlokDaireNo(katNo, daireIdx)} · {profil.tipEtiket}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-[9px] font-bold uppercase text-stone-500">
            Kat
            <select
              value={katNo}
              onChange={(e) => setKatNo(Number(e.target.value))}
              className="mt-0.5 ml-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold"
            >
              {Array.from({ length: profil.katSayisi }, (_, i) => i + 1).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase text-stone-500">
            Daire
            <select
              value={daireIdx}
              onChange={(e) => setDaireIdx(Number(e.target.value))}
              className="mt-0.5 ml-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold"
            >
              {Array.from({ length: profil.dairePerKat }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  .{String(d).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="relative mx-auto max-w-md">
        <svg
          viewBox="0 0 100 100"
          className="w-full rounded-xl border border-stone-300 bg-white shadow-sm"
          style={{
            animation: anim ? 'cPlanPulse 4s ease-in-out infinite' : undefined,
          }}
        >
          {/* Tavan katmanı overlay */}
          <rect
            x="2"
            y="2"
            width="96"
            height="96"
            rx="2"
            fill={odaRenk(tavanY)}
            opacity={0.12 + (tavanY / 100) * 0.25}
          />
          {C_DAIRE_PLAN_ODALARI.map((oda) => {
            const y = byGorsel.get(oda.gorsel) || 0;
            return (
              <g key={oda.key}>
                <rect
                  x={oda.x}
                  y={oda.y}
                  width={oda.w}
                  height={oda.h}
                  rx="1.2"
                  fill={odaRenk(y)}
                  stroke="#64748b"
                  strokeWidth="0.6"
                  opacity={0.75 + (y / 100) * 0.25}
                />
                <text
                  x={oda.x + oda.w / 2}
                  y={oda.y + oda.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="3.2"
                  fontWeight="700"
                  fill="#1e293b"
                >
                  {oda.label}
                </text>
                <text
                  x={oda.x + oda.w / 2}
                  y={oda.y + oda.h / 2 + 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="2.6"
                  fill="#475569"
                >
                  %{y}
                </text>
              </g>
            );
          })}
          {/* Kapı işareti antre */}
          <rect x="48" y="96" width="8" height="2.5" fill="#334155" rx="0.4" />
        </svg>
        <p className="mt-2 text-center text-[10px] text-stone-500">
          Tavan detayı %{tavanY} · odalar MIMARI WBS ile boyanır
        </p>
      </div>

      {/* Kat şeridi — 4 daire yan yana */}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: profil.dairePerKat }, (_, i) => i + 1).map((d) => {
          const active = d === daireIdx;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDaireIdx(d)}
              className={`rounded-xl border px-2 py-2 text-center cursor-pointer transition ${
                active
                  ? 'border-violet-500 bg-violet-100 text-violet-950'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
              }`}
            >
              <p className="text-[9px] font-bold uppercase text-stone-400">Daire</p>
              <p className="text-sm font-black">{cBlokDaireNo(katNo, d)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const ProjeCBlokPanel: React.FC<Props> = ({ satirlari, busy, onUpdate }) => {
  const [anim, setAnim] = useState(true);
  const [seciliBlok, setSeciliBlok] = useState<CBlokKodu>('C1');
  const ozet = useMemo(() => calcDisiplinOzet(satirlari), [satirlari]);
  const parselOzet = cBlokParselOzet();

  const blokOzet = useMemo(() => {
    const m = new Map<CBlokKodu, number>();
    for (const b of C_BLOKLAR_157_51) {
      const rows = satirlari.filter((s) => s.blok === b);
      m.set(b, calcDisiplinOzet(rows).yuzde);
    }
    return m;
  }, [satirlari]);

  const blokSatirlari = useMemo(
    () => satirlari.filter((s) => s.blok === seciliBlok).sort((a, b) => a.kod.localeCompare(b.kod)),
    [satirlari, seciliBlok]
  );

  const animOn = anim === true;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 flex items-center gap-1.5">
              <Building2 size={12} /> DWG → C blok daire planı
            </p>
            <h2 className="text-lg font-black text-stone-900">C Bloklar (157/51)</h2>
            <p className="mt-1 text-xs text-stone-600 max-w-xl">
              {parselOzet.blokSayisi} blok (C1–C4) · {parselOzet.kat} kat · {parselOzet.dairePerKat}{' '}
              daire/kat · toplam {parselOzet.daire} daire. Kaynak: {C_BLOK_DWG}
            </p>
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
              <p className="text-[9px] font-bold uppercase text-stone-500">Genel mimari</p>
              <p className="text-xl font-black tabular-nums">{ozet.yuzde}%</p>
              <p className="text-[9px] text-stone-500">
                {ozet.tamamlanan}/{ozet.toplam} · {ozet.imalatta} imalatta
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {C_BLOK_PROFILLERI.map((p) =>
          React.createElement(CBlokKule, {
            key: p.blok,
            blok: p.blok,
            genelYuzde: Number(blokOzet.get(p.blok) ?? 0),
            katSayisi: p.katSayisi,
            dairePerKat: p.dairePerKat,
            secili: seciliBlok === p.blok,
            anim: animOn,
            onClick: () => {
              setSeciliBlok(p.blok);
            },
          })
        )}
      </div>

      <DairePlanSahne
        blok={seciliBlok}
        satirlar={blokSatirlari}
        anim={animOn}
      />

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">
          {seciliBlok} — mimari WBS ({cBlokDaireSayisi(profilForCBlok(seciliBlok)!)} daire)
        </p>
        {blokSatirlari.map((row) => (
          <div
            key={row.id}
            className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm space-y-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400">
                  {row.kod} · Blok {row.blok}
                </p>
                <p className="text-sm font-black text-stone-900">{row.baslik}</p>
                {row.dwgKaynak && (
                  <p className="text-[10px] text-stone-500 mt-0.5 truncate max-w-md">
                    DWG: {row.dwgKaynak}
                  </p>
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
                        yuzde:
                          d === 'TAMAMLANDI'
                            ? 100
                            : d === 'IMALATTA'
                              ? Math.max(row.yuzde, 40)
                              : row.yuzde,
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
                className="mt-1 w-full accent-violet-700"
              />
            </label>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-500"
                style={{ width: `${row.yuzde}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes cBlokFloat {
          0%, 100% { transform: rotateX(10deg) rotateY(-16deg) translateY(0); }
          50% { transform: rotateX(10deg) rotateY(-16deg) translateY(-4px); }
        }
        @keyframes cPlanPulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.04); }
        }
      `}</style>
    </div>
  );
};

export default ProjeCBlokPanel;
