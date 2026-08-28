/**
 * Blok kontrol — saha komuta yüzeyi.
 * Parsel → blok cephesi → kat plakası → daire/oda → Kaba/İnce/Altyapı.
 * Kaynak: duvar aplikasyon + ruhsat (157/46 · 157/51 · 160/2).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  Layers,
  Map as MapIcon,
} from 'lucide-react';
import type {
  ProjeBlokProfili,
  ProjeCDaireKalem,
  ProjeDisiplinDurum,
  ProjeIlerlemeKova,
  ProjeTakipKalemGrup,
} from '../types/erp';
import {
  cBlokDaireNo,
  cBlokDaireTipi,
  cDaireKalemId,
  planOdalarForTip,
  type CDaireOdaKey,
  type CDaireTipi,
} from '../data/parsel15751CBlokSeed';
import { joinFirestoreDocId } from '../lib/firestoreIdUtils';
import {
  daireSayisiKatta15746,
  isParsel15746,
  katSablon15746,
  profil15746,
  tipForDaire15746,
  TEKNIK_KAT_ALANLARI,
  type BlokKatSablon,
} from '../data/parsel15746BlokSeed';
import {
  daireSayisiKatta15751,
  isParsel15751,
  katSablon15751,
  profil15751,
  tipForDaire15751,
} from '../data/parsel15751BlokSeed';
import {
  daireSayisiKatta1602,
  isParsel1602,
  katSablon1602,
  profil1602,
  tipForDaire1602,
} from '../data/parsel1602BlokSeed';
import {
  groupKalemlerByTakip,
  kalemlerForOdaTakip,
  kalemlerForTeknikAlan,
  TAKIP_KALEM_GRUP_LABEL,
  type TakipKalemGrup,
} from '../data/takipKalemSablon';
import { mimariGorsellerForOda, mimariGorsellerForParsel } from '../data/mimariGorselKatalog';
import { DISIPLIN_DURUM_LABEL } from '../lib/projeDisiplinUtils';
import { tomorrowDateKey } from '../lib/dateKeyUtils';
import { DaireKusbakisiPlan } from './DaireKusbakisiPlan';

export type BlokKontrolProgramDraft = {
  baslik: string;
  parsel: string;
  blok: string;
  kova: ProjeIlerlemeKova;
  refKalemId: string;
};

type Props = {
  parsel: string;
  parselSecenek: string[];
  blokProfilleri: ProjeBlokProfili[];
  daireKalemleri: ProjeCDaireKalem[];
  busy?: boolean;
  onParselChange: (p: string) => void;
  onUpdateDaireKalem: (row: ProjeCDaireKalem) => void;
  onIsProgramaAl: (drafts: BlokKontrolProgramDraft[], programTarih: string) => Promise<void>;
};

type KatRow = {
  label: string;
  tip?: BlokKatSablon['tip'];
  konut: boolean;
  yuzde: number;
  kaba: number;
  ince: number;
  altyapi: number;
};

type BlokOzet = {
  blok: string;
  profil: ProjeBlokProfili;
  yuzde: number;
  kaba: number;
  ince: number;
  altyapi: number;
  daire: number;
  kat: number;
};

type HeatMode = 'TOPLAM' | 'KABA' | 'INCE' | 'ALTYAPI';

function avgYuzde(rows: { yuzde?: number }[]): number {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + (r.yuzde || 0), 0) / rows.length);
}

function heat(yuzde: number, mode: HeatMode = 'TOPLAM'): string {
  if (mode === 'KABA') {
    if (yuzde >= 100) return '#b45309';
    if (yuzde >= 70) return '#d97706';
    if (yuzde >= 40) return '#fbbf24';
    if (yuzde > 0) return '#fed7aa';
    return '#e7e5e4';
  }
  if (mode === 'INCE') {
    if (yuzde >= 100) return '#6d28d9';
    if (yuzde >= 70) return '#8b5cf6';
    if (yuzde >= 40) return '#c4b5fd';
    if (yuzde > 0) return '#ede9fe';
    return '#e7e5e4';
  }
  if (mode === 'ALTYAPI') {
    if (yuzde >= 100) return '#0369a1';
    if (yuzde >= 70) return '#0ea5e9';
    if (yuzde >= 40) return '#7dd3fc';
    if (yuzde > 0) return '#e0f2fe';
    return '#e7e5e4';
  }
  if (yuzde >= 100) return '#059669';
  if (yuzde >= 70) return '#34d399';
  if (yuzde >= 40) return '#fbbf24';
  if (yuzde > 0) return '#fb923c';
  return '#e7e5e4';
}

function durumTone(d: ProjeDisiplinDurum): string {
  if (d === 'TAMAMLANDI') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (d === 'IMALATTA') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (d === 'BEKLEMEDE') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-sky-50 text-sky-900 border-sky-200';
}

function grupTone(g: TakipKalemGrup): string {
  if (g === 'KABA') return 'border-amber-300/80 bg-amber-500/15 text-amber-950';
  if (g === 'INCE') return 'border-violet-300/80 bg-violet-500/15 text-violet-950';
  return 'border-sky-300/80 bg-sky-500/15 text-sky-950';
}

function dairePerKatOf(p: ProjeBlokProfili): number {
  if (!p.katSayisi) return 4;
  return Math.max(1, Math.round((p.daireSayisi || 0) / p.katSayisi) || 4);
}

function tipForIndex(parsel: string, blok: string, daireIndex: number): CDaireTipi {
  if (isParsel15746(parsel)) return tipForDaire15746(blok, daireIndex);
  if (isParsel15751(parsel)) return tipForDaire15751(blok, daireIndex);
  if (isParsel1602(parsel)) return tipForDaire1602(blok, daireIndex);
  if (/^C[1-4]$/.test(blok)) return cBlokDaireTipi(daireIndex);
  return daireIndex <= 2 ? '2+1' : '3+1';
}

function resolveKatModel(parsel: string, blok: string) {
  if (isParsel15746(parsel)) {
    const p = profil15746(blok);
    if (!p) return null;
    return {
      katSayisi: p.katSayisi,
      daireSayisi: p.daireSayisi,
      katlar: p.katlar as BlokKatSablon[],
      dwgKaynak: p.dwgKaynak,
      daireKatta: (katNo: number) => daireSayisiKatta15746(blok, katNo),
      katSablon: (katNo: number) => katSablon15746(blok, katNo) as BlokKatSablon | undefined,
    };
  }
  if (isParsel15751(parsel)) {
    const p = profil15751(blok);
    if (!p) return null;
    return {
      katSayisi: p.katSayisi,
      daireSayisi: p.daireSayisi,
      katlar: p.katlar as unknown as BlokKatSablon[],
      dwgKaynak: p.dwgKaynak,
      daireKatta: (katNo: number) => daireSayisiKatta15751(blok, katNo),
      katSablon: (katNo: number) =>
        katSablon15751(blok, katNo) as unknown as BlokKatSablon | undefined,
    };
  }
  if (isParsel1602(parsel)) {
    const p = profil1602(blok);
    if (!p) return null;
    return {
      katSayisi: p.katSayisi,
      daireSayisi: p.daireSayisi,
      katlar: p.katlar as unknown as BlokKatSablon[],
      dwgKaynak: p.dwgKaynak,
      daireKatta: (katNo: number) => daireSayisiKatta1602(blok, katNo),
      katSablon: (katNo: number) =>
        katSablon1602(blok, katNo) as unknown as BlokKatSablon | undefined,
    };
  }
  return null;
}

function resolveGrup(row: ProjeCDaireKalem): TakipKalemGrup {
  if (row.kalemGrup) return row.kalemGrup;
  const all = [...kalemlerForOdaTakip(row.odaKey), ...kalemlerForTeknikAlan()];
  return all.find((k) => k.kod === row.kalemKod)?.grup || 'INCE';
}

function grupAvg(rows: ProjeCDaireKalem[], g: TakipKalemGrup): number {
  return avgYuzde(rows.filter((k) => resolveGrup(k) === g));
}

function buildSeedKalemler(
  parsel: string,
  blok: string,
  katNo: number,
  daireIndex: number,
  odaKey: string,
  odaLabel: string,
  existing: Map<string, ProjeCDaireKalem>,
  mode: 'daire' | 'teknik'
): ProjeCDaireKalem[] {
  const tip: ProjeCDaireKalem['tip'] =
    mode === 'teknik' ? 'TEKNIK' : tipForIndex(parsel, blok, daireIndex);
  const daireNo = mode === 'teknik' ? `T${katNo}` : cBlokDaireNo(katNo, daireIndex);
  const sablon =
    mode === 'teknik' ? kalemlerForTeknikAlan() : kalemlerForOdaTakip(odaKey);
  return sablon.map((k) => {
    const id = cDaireKalemId(parsel, blok, daireNo, odaKey, k.kod);
    const prev = existing.get(id);
    return {
      id,
      parsel,
      blok,
      daireNo,
      katNo,
      tip,
      odaKey,
      odaLabel,
      kalemKod: k.kod,
      kalemBaslik: k.baslik,
      kalemGrup: k.grup as ProjeTakipKalemGrup,
      durum: prev?.durum || 'PLANLANDI',
      yuzde: typeof prev?.yuzde === 'number' ? prev.yuzde : 0,
      eksikNot: prev?.eksikNot,
      guncellemeTarihi: prev?.guncellemeTarihi,
      olusturan: prev?.olusturan,
    };
  });
}

/** Dairesel ilerleme — Kaba / İnce / Altyapı */
const Ring: React.FC<{
  label: string;
  yuzde: number;
  color: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
}> = ({ label, yuzde, color, size = 64, active, onClick }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, yuzde)) / 100) * c;
  const inner = (
    <>
      <svg width={size} height={size} className="block">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="13"
          fontWeight="800"
          fill="#1c1917"
        >
          {yuzde}
        </text>
      </svg>
      <span className="text-[9px] font-black uppercase tracking-wide text-stone-500">{label}</span>
    </>
  );
  if (!onClick) {
    return <div className="flex flex-col items-center gap-1 min-w-[52px]">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 min-w-[52px] rounded-xl px-1 py-0.5 cursor-pointer ${
        active ? 'ring-2 ring-stone-900 bg-white' : 'hover:bg-white/50'
      }`}
    >
      {inner}
    </button>
  );
};

/** Parsel sahası — kompakt blok şeridi */
const ParselSahasi: React.FC<{
  ozetler: BlokOzet[];
  aktif: string;
  onSelect: (blok: string) => void;
}> = ({ ozetler, aktif, onSelect }) => (
  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
    {ozetler.map((o) => {
      const selected = o.blok === aktif;
      return (
        <button
          key={o.blok}
          type="button"
          onClick={() => onSelect(o.blok)}
          className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-left cursor-pointer min-w-[4.5rem] ${
            selected
              ? 'border-amber-400 bg-amber-400 text-stone-950'
              : 'border-stone-600 bg-stone-800 text-white hover:border-stone-400'
          }`}
        >
          <p className="text-sm font-black leading-none">{o.blok}</p>
          <p className={`text-[9px] font-bold mt-0.5 ${selected ? 'text-stone-800' : 'text-stone-400'}`}>
            %{o.yuzde} · {o.daire}d
          </p>
          <div className="mt-1 flex gap-0.5">
            {(
              [
                [o.kaba, '#d97706'],
                [o.ince, '#7c3aed'],
                [o.altyapi, '#0284c7'],
              ] as const
            ).map(([y, col], i) => (
              <div key={i} className={`h-0.5 flex-1 rounded-full ${selected ? 'bg-amber-800/40' : 'bg-stone-700'}`}>
                <div className="h-full rounded-full" style={{ width: `${y}%`, background: col }} />
              </div>
            ))}
          </div>
        </button>
      );
    })}
  </div>
);

/** Cephe — kat şeritleri + daire pencereleri */
const BlokCephe: React.FC<{
  blok: string;
  katlar: KatRow[];
  katNo: number;
  daireIndex: number;
  dairePerKatFn: (katNo: number) => number;
  daireYuzdeFn: (katNo: number, di: number) => number;
  onKat: (n: number) => void;
  onDaire: (katNo: number, di: number) => void;
}> = ({
  blok,
  katlar,
  katNo,
  daireIndex,
  dairePerKatFn,
  daireYuzdeFn,
  onKat,
  onDaire,
}) => {
  const n = Math.max(katlar.length, 1);
  const rowH = Math.min(42, Math.max(26, Math.floor(340 / n)));
  const maxWin = Math.max(...katlar.map((_, i) => dairePerKatFn(i + 1) || 1), 1);
  const w = 56 + maxWin * 28;
  const h = 28 + rowH * n + 18;

  return (
    <div className="relative rounded-2xl border border-stone-800/20 bg-gradient-to-b from-stone-200 via-stone-100 to-stone-300 p-2 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />
      <div className="relative flex items-center justify-between mb-2 px-1">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-500">Cephe · ilerleme</p>
          <h3 className="text-xl font-black text-stone-900 tracking-tight">{blok} BLOK</h3>
        </div>
        <Layers size={16} className="text-stone-400" />
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-h-[28vh] mx-auto block relative">
        <rect x="8" y="4" width={w - 16} height="14" rx="2" fill="#57534e" />
        <text x={w / 2} y="14" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fafaf9">
          {blok}
        </text>
        {katlar
          .map((k, i) => ({ ...k, idx: i + 1 }))
          .slice()
          .reverse()
          .map((k, revI) => {
            const y = 22 + revI * rowH;
            const activeKat = katNo === k.idx;
            const wins = k.konut ? Math.max(dairePerKatFn(k.idx), 1) : 0;
            return (
              <g key={k.idx}>
                <rect
                  x="12"
                  y={y}
                  width={w - 24}
                  height={rowH - 3}
                  rx="2"
                  fill={activeKat ? '#1c1917' : k.tip === 'TEKNIK' ? '#d6d3d1' : '#fafaf9'}
                  stroke={activeKat ? '#0c0a09' : '#a8a29e'}
                  strokeWidth={activeKat ? 1.4 : 0.5}
                  className="cursor-pointer"
                  onClick={() => onKat(k.idx)}
                />
                <text
                  x="18"
                  y={y + rowH / 2 - 1}
                  dominantBaseline="middle"
                  fontSize="6.2"
                  fontWeight="800"
                  fill={activeKat ? '#fafaf9' : '#292524'}
                  className="cursor-pointer"
                  onClick={() => onKat(k.idx)}
                >
                  {k.label}
                </text>
                {!k.konut ? (
                  <text
                    x={w - 20}
                    y={y + rowH / 2 - 1}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="5.5"
                    fontWeight="700"
                    fill={activeKat ? '#a8a29e' : '#78716c'}
                  >
                    TEKNİK
                  </text>
                ) : (
                  Array.from({ length: wins }, (_, wi) => {
                    const di = wi + 1;
                    const yy = daireYuzdeFn(k.idx, di);
                    const ax = 72 + wi * 26;
                    const active = activeKat && daireIndex === di;
                    return (
                      <g
                        key={di}
                        className="cursor-pointer"
                        onClick={() => {
                          onKat(k.idx);
                          onDaire(k.idx, di);
                        }}
                      >
                        <rect
                          x={ax}
                          y={y + 5}
                          width="22"
                          height={rowH - 13}
                          rx="1.5"
                          fill={heat(yy)}
                          stroke={active ? '#fafaf9' : '#57534e'}
                          strokeWidth={active ? 1.5 : 0.4}
                        />
                        <text
                          x={ax + 11}
                          y={y + rowH / 2 - 0.5}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="5"
                          fontWeight="800"
                          fill={yy >= 40 ? '#14532d' : '#44403c'}
                        >
                          {di}
                        </text>
                      </g>
                    );
                  })
                )}
                {/* mini disiplin bars */}
                <rect x="18" y={y + rowH - 8} width="40" height="2.2" rx="1" fill={activeKat ? '#44403c' : '#e7e5e4'} />
                <rect
                  x="18"
                  y={y + rowH - 8}
                  width={(40 * k.kaba) / 100}
                  height="2.2"
                  rx="1"
                  fill="#d97706"
                />
              </g>
            );
          })}
        <rect x="6" y={h - 12} width={w - 12} height="8" rx="1" fill="#292524" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-2 text-[8px] font-bold text-stone-500 px-1">
        <span>pencere = daire %</span>
        <span className="text-amber-700">şerit = kaba</span>
      </div>
    </div>
  );
};

/** Kat plakası — daire hücreleri */
const KatPlaka: React.FC<{
  label: string;
  teknikKat: boolean;
  dairePerKat: number;
  katNo: number;
  daireIndex: number;
  parsel: string;
  blok: string;
  daireKalemleri: ProjeCDaireKalem[];
  odaKey: string | null;
  onDaire: (di: number) => void;
  onTeknik: (key: string) => void;
  odaYuzde: (key: string) => number;
}> = ({
  label,
  teknikKat,
  dairePerKat,
  katNo,
  daireIndex,
  parsel,
  blok,
  daireKalemleri,
  odaKey,
  onDaire,
  onTeknik,
  odaYuzde,
}) => {
  if (teknikKat) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          {label} · teknik alanlar
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TEKNIK_KAT_ALANLARI.map((a) => {
            const y = odaYuzde(a.key);
            const active = odaKey === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => onTeknik(a.key)}
                className={`rounded-xl border px-3 py-3 text-left cursor-pointer ${
                  active
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white hover:border-stone-400'
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-black">{a.label}</span>
                  <span className={`text-xs font-bold tabular-nums ${active ? 'text-stone-300' : 'text-stone-500'}`}>
                    %{y}
                  </span>
                </div>
                <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${active ? 'bg-stone-700' : 'bg-stone-100'}`}>
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${y}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const cols = Math.min(Math.max(dairePerKat, 2), 6);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          {label} · kat plakası · {dairePerKat} daire
        </p>
      </div>
      <div
        className="rounded-2xl border-2 border-stone-800/80 bg-stone-50 p-3"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(120,113,108,0.18) 1px, transparent 0)',
          backgroundSize: '12px 12px',
        }}
      >
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: Math.max(dairePerKat, 1) }, (_, i) => i + 1).map((di) => {
            const no = cBlokDaireNo(katNo, di);
            const rows = daireKalemleri.filter(
              (k) => k.parsel === parsel && k.blok === blok && k.daireNo === no
            );
            const y = avgYuzde(rows);
            const kaba = grupAvg(rows, 'KABA');
            const ince = grupAvg(rows, 'INCE');
            const alty = grupAvg(rows, 'ALTYAPI');
            const active = di === daireIndex;
            const t = tipForIndex(parsel, blok, di);
            return (
              <button
                key={di}
                type="button"
                onClick={() => onDaire(di)}
                className={`relative min-h-[68px] rounded-xl border-2 p-2 text-left cursor-pointer transition-transform ${
                  active
                    ? 'border-stone-900 bg-white shadow-md scale-[1.03] z-[1]'
                    : 'border-stone-300/80 bg-white/90 hover:border-stone-500'
                }`}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-[10px]"
                  style={{ background: heat(y) }}
                />
                <p className="text-[9px] font-bold uppercase text-stone-400 pl-1">{t}</p>
                <p className="text-lg font-black tabular-nums text-stone-900 leading-none pl-1">{no}</p>
                <p className="text-[11px] font-black text-stone-600 mt-1 pl-1">%{y}</p>
                <div className="mt-2 space-y-0.5 pl-1">
                  {(
                    [
                      [kaba, '#d97706'],
                      [ince, '#7c3aed'],
                      [alty, '#0284c7'],
                    ] as const
                  ).map(([yy, col], idx) => (
                    <div key={idx} className="h-1 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${yy}%`, background: col }} />
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const KalemEditor: React.FC<{
  row: ProjeCDaireKalem;
  busy?: boolean;
  onUpdate: (row: ProjeCDaireKalem) => void;
}> = ({ row, busy, onUpdate }) => (
  <div className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 space-y-1">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] font-black text-stone-900 truncate">{row.kalemBaslik}</p>
      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${durumTone(row.durum)}`}>
        {DISIPLIN_DURUM_LABEL[row.durum]}
      </span>
    </div>
    <div className="flex items-center gap-2">
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
          onUpdate({ ...row, yuzde, durum });
        }}
        className="flex-1 accent-stone-800 h-1.5"
      />
      <span className="w-8 text-right text-[10px] font-black tabular-nums">%{row.yuzde}</span>
    </div>
    <div className="flex flex-wrap gap-0.5">
      {(['PLANLANDI', 'IMALATTA', 'TAMAMLANDI'] as ProjeDisiplinDurum[]).map((d) => (
        <button
          key={d}
          type="button"
          disabled={busy || row.durum === d}
          onClick={() =>
            onUpdate({
              ...row,
              durum: d,
              yuzde: d === 'TAMAMLANDI' ? 100 : d === 'IMALATTA' ? Math.max(row.yuzde, 40) : row.yuzde,
            })
          }
          className={`rounded border px-1.5 py-0.5 text-[8px] font-black cursor-pointer disabled:opacity-40 ${
            row.durum === d ? durumTone(d) : 'border-stone-200 bg-white text-stone-500'
          }`}
        >
          {DISIPLIN_DURUM_LABEL[d]}
        </button>
      ))}
    </div>
    <input
      type="text"
      placeholder="Not…"
      value={row.eksikNot || ''}
      disabled={busy}
      onChange={(e) => onUpdate({ ...row, eksikNot: e.target.value || undefined })}
      className="w-full rounded border border-stone-200 px-1.5 py-1 text-[10px]"
    />
  </div>
);

const GrupSlider: React.FC<{
  label: string;
  yuzde: number;
  color: string;
  busy?: boolean;
  onChange: (yuzde: number) => void;
}> = ({ label, yuzde, color, busy, onChange }) => (
  <label className="block rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-black uppercase tracking-wide" style={{ color }}>
        {label}
      </span>
      <span className="text-sm font-black tabular-nums text-stone-900">%{yuzde}</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={yuzde}
      disabled={busy}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mt-1 w-full h-2"
      style={{ accentColor: color }}
    />
  </label>
);

export const ProjeBlokKontrolPanel: React.FC<Props> = ({
  parsel,
  parselSecenek,
  blokProfilleri,
  daireKalemleri,
  busy,
  onParselChange,
  onUpdateDaireKalem,
  onIsProgramaAl,
}) => {
  const bloklar = useMemo(
    () =>
      blokProfilleri
        .filter((p) => p.parsel === parsel && p.blok !== 'GENEL SAHA')
        .sort((a, b) => a.blok.localeCompare(b.blok, 'tr')),
    [blokProfilleri, parsel]
  );

  const [blok, setBlok] = useState(bloklar[0]?.blok || '');
  const [katNo, setKatNo] = useState(1);
  const [daireIndex, setDaireIndex] = useState(1);
  const [odaKey, setOdaKey] = useState<string | null>(null);
  const [planGenel, setPlanGenel] = useState(true);
  const [gorselIdx, setGorselIdx] = useState(0);
  const [programTarih, setProgramTarih] = useState(tomorrowDateKey());
  const [progKapsam, setProgKapsam] = useState<'oda' | 'daire'>('oda');
  const [progGrup, setProgGrup] = useState<Record<TakipKalemGrup, boolean>>({
    KABA: true,
    INCE: true,
    ALTYAPI: true,
  });

  const profil = bloklar.find((b) => b.blok === blok) || bloklar[0];
  const model = resolveKatModel(parsel, blok);
  const katMeta = model?.katSablon(katNo);
  const teknikKat = Boolean(katMeta && !katMeta.konut);
  const katSayisi = model?.katSayisi || profil?.katSayisi || 7;
  const dairePerKat = model
    ? model.daireKatta(katNo)
    : profil
      ? dairePerKatOf(profil)
      : 4;
  const tip = teknikKat ? null : tipForIndex(parsel, blok, daireIndex);
  const daireNo = teknikKat ? `T${katNo}` : cBlokDaireNo(katNo, daireIndex);

  useEffect(() => {
    if (!bloklar.length) return;
    if (!bloklar.some((b) => b.blok === blok)) {
      setBlok(bloklar[0].blok);
      setKatNo(1);
      setDaireIndex(1);
    }
  }, [bloklar, blok]);

  useEffect(() => {
    setKatNo(1);
    setDaireIndex(1);
    setPlanGenel(true);
  }, [blok]);

  useEffect(() => {
    if (daireIndex > Math.max(dairePerKat, 1)) setDaireIndex(1);
  }, [dairePerKat, daireIndex]);

  useEffect(() => {
    setGorselIdx(0);
    setPlanGenel(true);
    if (teknikKat) {
      setOdaKey(TEKNIK_KAT_ALANLARI[0]?.key ?? null);
      return;
    }
    if (tip) {
      const first = planOdalarForTip(tip).find((o) => o.key !== 'giris');
      setOdaKey(first?.key ?? null);
    }
  }, [katNo, daireIndex, teknikKat, tip]);

  const existingMap = useMemo(() => {
    const m = new Map<string, ProjeCDaireKalem>();
    for (const k of daireKalemleri) {
      m.set(k.id, k);
      const canon = joinFirestoreDocId(
        k.parsel,
        k.blok,
        k.daireNo,
        k.odaKey,
        k.kalemKod
      );
      if (canon !== k.id) m.set(canon, k);
    }
    return m;
  }, [daireKalemleri]);

  const daireRows = useMemo(
    () =>
      daireKalemleri.filter(
        (k) => k.parsel === parsel && k.blok === blok && k.daireNo === daireNo
      ),
    [daireKalemleri, parsel, blok, daireNo]
  );

  const blokRows = useMemo(
    () => daireKalemleri.filter((k) => k.parsel === parsel && k.blok === blok),
    [daireKalemleri, parsel, blok]
  );

  const plan = tip ? planOdalarForTip(tip) : [];
  const teknikPlan = TEKNIK_KAT_ALANLARI.map((a) => ({
    key: a.key,
    label: a.label,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  }));

  const odaYuzde = (key: string) => avgYuzde(daireRows.filter((k) => k.odaKey === key));

  const katKesitRows = useMemo((): KatRow[] => {
    const rows: KatRow[] = [];
    for (let i = 1; i <= katSayisi; i++) {
      const meta = model?.katSablon(i);
      const label = meta?.label || String(i);
      const konut = meta ? meta.konut : true;
      if (!konut) {
        const tNo = `T${i}`;
        const rowsT = daireKalemleri.filter(
          (k) => k.parsel === parsel && k.blok === blok && k.daireNo === tNo
        );
        rows.push({
          label,
          tip: meta?.tip,
          konut: false,
          yuzde: avgYuzde(rowsT),
          kaba: grupAvg(rowsT, 'KABA'),
          ince: grupAvg(rowsT, 'INCE'),
          altyapi: grupAvg(rowsT, 'ALTYAPI'),
        });
        continue;
      }
      const nD = model ? model.daireKatta(i) : profil ? dairePerKatOf(profil) : 4;
      const collected: ProjeCDaireKalem[] = [];
      for (let di = 1; di <= Math.max(nD, 1); di++) {
        const no = cBlokDaireNo(i, di);
        for (const k of daireKalemleri) {
          if (k.parsel === parsel && k.blok === blok && k.daireNo === no) collected.push(k);
        }
      }
      rows.push({
        label,
        tip: meta?.tip,
        konut: true,
        yuzde: avgYuzde(collected),
        kaba: grupAvg(collected, 'KABA'),
        ince: grupAvg(collected, 'INCE'),
        altyapi: grupAvg(collected, 'ALTYAPI'),
      });
    }
    return rows;
  }, [katSayisi, model, daireKalemleri, parsel, blok, profil]);

  const blokOzetler = useMemo((): BlokOzet[] => {
    return bloklar.map((p) => {
      const rows = daireKalemleri.filter((k) => k.parsel === parsel && k.blok === p.blok);
      const m = resolveKatModel(parsel, p.blok);
      return {
        blok: p.blok,
        profil: p,
        yuzde: avgYuzde(rows),
        kaba: grupAvg(rows, 'KABA'),
        ince: grupAvg(rows, 'INCE'),
        altyapi: grupAvg(rows, 'ALTYAPI'),
        daire: m?.daireSayisi ?? p.daireSayisi,
        kat: m?.katSayisi ?? p.katSayisi,
      };
    });
  }, [bloklar, daireKalemleri, parsel]);

  const seciliOda = teknikKat
    ? teknikPlan.find((o) => o.key === odaKey) || null
    : plan.find((o) => o.key === odaKey) || null;

  const odaKalemleri = useMemo(() => {
    if (!seciliOda) return [];
    return buildSeedKalemler(
      parsel,
      blok,
      katNo,
      daireIndex,
      seciliOda.key,
      seciliOda.label,
      existingMap,
      teknikKat ? 'teknik' : 'daire'
    );
  }, [seciliOda, parsel, blok, katNo, daireIndex, existingMap, teknikKat]);

  const odaGruplari = useMemo(
    () => groupKalemlerByTakip(odaKalemleri, resolveGrup),
    [odaKalemleri]
  );

  const programKaynak = useMemo(() => {
    if (progKapsam === 'daire' && !teknikKat) {
      return plan
        .filter((o) => o.key !== 'giris')
        .flatMap((oda) =>
          buildSeedKalemler(
            parsel,
            blok,
            katNo,
            daireIndex,
            oda.key,
            oda.label,
            existingMap,
            'daire'
          )
        );
    }
    return seciliOda ? odaKalemleri : daireRows;
  }, [
    progKapsam,
    teknikKat,
    plan,
    parsel,
    blok,
    katNo,
    daireIndex,
    existingMap,
    seciliOda,
    odaKalemleri,
    daireRows,
  ]);

  const eksikler = useMemo(
    () =>
      programKaynak.filter(
        (k) => progGrup[resolveGrup(k)] && (k.durum !== 'TAMAMLANDI' || (k.yuzde || 0) < 100)
      ),
    [programKaynak, progGrup]
  );

  const hedefGorseller = useMemo(() => {
    if (teknikKat) return [];
    if (odaKey) return mimariGorsellerForOda(parsel, odaKey as CDaireOdaKey);
    return mimariGorsellerForParsel(parsel);
  }, [parsel, odaKey, teknikKat]);

  useEffect(() => {
    setGorselIdx(0);
  }, [hedefGorseller.length, odaKey]);

  const blokKaba = grupAvg(blokRows, 'KABA');
  const blokInce = grupAvg(blokRows, 'INCE');
  const blokAlty = grupAvg(blokRows, 'ALTYAPI');
  const blokYuzde = avgYuzde(blokRows);
  const daireYuzde = avgYuzde(daireRows);
  const daireKaba = grupAvg(daireRows, 'KABA');
  const daireInce = grupAvg(daireRows, 'INCE');
  const daireAlty = grupAvg(daireRows, 'ALTYAPI');

  const heroSrc =
    hedefGorseller.length > 0
      ? hedefGorseller[gorselIdx % hedefGorseller.length]
      : null;

  const handleProgramaAl = async () => {
    if (!eksikler.length) {
      alert('Programa alınacak açık kalem yok. Disiplin kutularını ve kapsamı kontrol edin.');
      return;
    }
    const drafts: BlokKontrolProgramDraft[] = eksikler.map((k) => ({
      baslik: `${blok} ${daireNo} · ${k.odaLabel} · [${TAKIP_KALEM_GRUP_LABEL[resolveGrup(k)]}] ${k.kalemBaslik}${
        k.eksikNot ? ` — ${k.eksikNot}` : ''
      }`,
      parsel,
      blok,
      kova: 'EKSIK_IMALAT' as ProjeIlerlemeKova,
      refKalemId: k.id,
    }));
    await onIsProgramaAl(drafts, programTarih);
  };

  const applyGrupYuzde = (grup: TakipKalemGrup, yuzde: number) => {
    const durum: ProjeDisiplinDurum =
      yuzde >= 100 ? 'TAMAMLANDI' : yuzde > 0 ? 'IMALATTA' : 'PLANLANDI';
    const yaz = (rows: ProjeCDaireKalem[]) => {
      for (const row of rows) {
        if (resolveGrup(row) !== grup) continue;
        onUpdateDaireKalem({ ...row, yuzde, durum });
      }
    };
    if (progKapsam === 'daire' && !teknikKat) {
      for (const oda of plan.filter((o) => o.key !== 'giris')) {
        yaz(
          buildSeedKalemler(
            parsel,
            blok,
            katNo,
            daireIndex,
            oda.key,
            oda.label,
            existingMap,
            'daire'
          )
        );
      }
      return;
    }
    if (seciliOda) yaz(odaKalemleri);
  };

  const izlemeKaba =
    progKapsam === 'daire' || !seciliOda ? daireKaba : grupAvg(odaKalemleri, 'KABA');
  const izlemeInce =
    progKapsam === 'daire' || !seciliOda ? daireInce : grupAvg(odaKalemleri, 'INCE');
  const izlemeAlty =
    progKapsam === 'daire' || !seciliOda ? daireAlty : grupAvg(odaKalemleri, 'ALTYAPI');

  const daireYuzdeFn = (kNo: number, di: number) => {
    const no = cBlokDaireNo(kNo, di);
    return avgYuzde(
      daireKalemleri.filter((k) => k.parsel === parsel && k.blok === blok && k.daireNo === no)
    );
  };

  const dairePerKatFn = (kNo: number) =>
    model ? model.daireKatta(kNo) : profil ? dairePerKatOf(profil) : 4;

  return (
    <div className="flex flex-col gap-2 xl:h-[calc(100dvh-10.5rem)] xl:min-h-[600px]">
      <div className="relative shrink-0 overflow-hidden rounded-2xl border border-stone-800 bg-stone-900 text-white">
        {heroSrc && (
          <img
            src={heroSrc.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-900/92 to-stone-900/75" />
        <div className="relative px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <div className="shrink-0">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-400/90 flex items-center gap-1">
                <MapIcon size={11} /> Blok kontrol
              </p>
              <h2 className="text-base font-black tracking-tight leading-none">
                {parsel.replace('Parsel Bölge ', '')}
                <span className="text-stone-400 font-bold text-sm ml-1">/ {blok}</span>
              </h2>
            </div>
            <label className="text-[8px] font-bold uppercase text-stone-400">
              Parsel
              <select
                value={parsel}
                onChange={(e) => onParselChange(e.target.value)}
                className="mt-0.5 block min-w-[110px] rounded-md border border-stone-600 bg-stone-800 px-1.5 py-1 text-[11px] font-semibold text-white"
              >
                {parselSecenek.map((p) => (
                  <option key={p} value={p}>
                    {p.replace('Parsel Bölge ', '')}
                  </option>
                ))}
              </select>
            </label>
            <div className="min-w-0 flex-1">
              <ParselSahasi ozetler={blokOzetler} aktif={blok} onSelect={setBlok} />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Ring label="Blok" yuzde={blokYuzde} color="#a8a29e" size={46} />
            <Ring label="Kaba" yuzde={blokKaba} color="#d97706" size={46} />
            <Ring label="İnce" yuzde={blokInce} color="#7c3aed" size={46} />
            <Ring label="Alty." yuzde={blokAlty} color="#0284c7" size={46} />
          </div>
        </div>
        <p className="relative px-3 pb-1.5 text-[10px] text-stone-400 truncate">
          {blok}
          <ChevronRight size={10} className="inline mx-0.5" />
          {katMeta?.label || `Kat ${katNo}`}
          {!teknikKat && (
            <>
              <ChevronRight size={10} className="inline mx-0.5" />
              {daireNo}
            </>
          )}
          {seciliOda && seciliOda.key !== 'giris' && (
            <>
              <ChevronRight size={10} className="inline mx-0.5" />
              <span className="text-amber-300 font-black">{seciliOda.label}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(200px,0.85fr)_minmax(0,1.2fr)_minmax(270px,24rem)] gap-2">
        <div className="min-h-0 overflow-y-auto space-y-2">
          <BlokCephe
            blok={blok}
            katlar={katKesitRows}
            katNo={katNo}
            daireIndex={daireIndex}
            dairePerKatFn={dairePerKatFn}
            daireYuzdeFn={daireYuzdeFn}
            onKat={setKatNo}
            onDaire={(_k, di) => setDaireIndex(di)}
          />
          <div className="rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
            <KatPlaka
              label={katMeta?.label || `Kat ${katNo}`}
              teknikKat={teknikKat}
              dairePerKat={dairePerKat}
              katNo={katNo}
              daireIndex={daireIndex}
              parsel={parsel}
              blok={blok}
              daireKalemleri={daireKalemleri}
              odaKey={odaKey}
              onDaire={setDaireIndex}
              onTeknik={(key) => {
                setOdaKey(key);
                setPlanGenel(false);
              }}
              odaYuzde={odaYuzde}
            />
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-2">
          {!teknikKat && tip ? (
            <div className="flex-1 min-h-0 rounded-2xl border border-stone-200 bg-white p-2 overflow-hidden">
              <DaireKusbakisiPlan
                compact
                plan={plan}
                odaKey={odaKey}
                focusOdaKey={planGenel ? null : odaKey}
                yuzdeFor={odaYuzde}
                grupFor={(key) => {
                  const rows = daireRows.filter((k) => k.odaKey === key);
                  return {
                    kaba: grupAvg(rows, 'KABA'),
                    ince: grupAvg(rows, 'INCE'),
                    altyapi: grupAvg(rows, 'ALTYAPI'),
                  };
                }}
                onSelect={(k) => {
                  if (k) {
                    setOdaKey(k);
                    setPlanGenel(false);
                  }
                }}
                onFitAll={() => setPlanGenel(true)}
                daireNo={daireNo}
                tip={tip}
              />
            </div>
          ) : (
            <div className="flex-1 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-[12px] text-stone-600">
              Bu kat konut değil (bodrum / teknik). Soldan alan seçip sağdaki disiplin kaydırıcılarıyla işleyin.
            </div>
          )}
          {heroSrc && (
            <div className="relative h-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-stone-800">
              <img src={heroSrc.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/65 to-transparent" />
              <div className="relative h-full flex items-end px-2.5 py-1.5">
                <p className="text-[10px] font-black text-white truncate">Hedef · {heroSrc.baslik}</p>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex flex-col rounded-2xl border border-stone-800 bg-white overflow-hidden shadow-lg">
          <div className="shrink-0 bg-stone-900 text-white px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">
              İlerleme + program
            </p>
            <h3 className="text-base font-black leading-tight">
              {blok} · {daireNo}{' '}
              {tip && <span className="text-stone-400 text-xs font-bold">{tip}</span>}
            </h3>
            <p className="text-[11px] text-stone-300 truncate">
              {progKapsam === 'daire'
                ? `Tüm daire · %${daireYuzde}`
                : `${seciliOda && seciliOda.key !== 'giris' ? seciliOda.label : 'Oda'} · %${avgYuzde(odaKalemleri)}`}
            </p>
          </div>

          <div className="shrink-0 px-3 pt-2 flex gap-1">
            {(
              [
                ['oda', 'Bu oda'],
                ['daire', 'Tüm daire'],
              ] as const
            ).map(([id, lab]) => (
              <button
                key={id}
                type="button"
                onClick={() => setProgKapsam(id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase cursor-pointer ${
                  progKapsam === id
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                {lab}
              </button>
            ))}
          </div>

          <div className="shrink-0 px-3 py-2 space-y-1.5">
            <GrupSlider
              label="Kaba"
              yuzde={izlemeKaba}
              color="#d97706"
              busy={busy}
              onChange={(y) => applyGrupYuzde('KABA', y)}
            />
            <GrupSlider
              label="İnce"
              yuzde={izlemeInce}
              color="#7c3aed"
              busy={busy}
              onChange={(y) => applyGrupYuzde('INCE', y)}
            />
            <GrupSlider
              label="Altyapı"
              yuzde={izlemeAlty}
              color="#0284c7"
              busy={busy}
              onChange={(y) => applyGrupYuzde('ALTYAPI', y)}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-2">
            {seciliOda && seciliOda.key !== 'giris' ? (
              odaGruplari.map((g) => (
                <div key={g.grup} className="space-y-1">
                  <p
                    className={`sticky top-0 z-[1] rounded-md border px-2 py-1 text-[9px] font-black uppercase ${grupTone(g.grup)}`}
                  >
                    {g.label} · %{avgYuzde(g.rows)}
                  </p>
                  {g.rows.map((row) => (
                    <KalemEditor
                      key={row.id}
                      row={row}
                      busy={busy}
                      onUpdate={onUpdateDaireKalem}
                    />
                  ))}
                </div>
              ))
            ) : (
              <p className="text-[11px] text-stone-500 py-4 text-center">
                Plandan oda seçin — kalemler burada açılır.
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-emerald-900 bg-emerald-950 text-white p-3 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">
              İş programı
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(['KABA', 'INCE', 'ALTYAPI'] as TakipKalemGrup[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setProgGrup((p) => ({ ...p, [g]: !p[g] }))}
                  className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase cursor-pointer ${
                    progGrup[g]
                      ? 'border-emerald-400 bg-emerald-400 text-emerald-950'
                      : 'border-emerald-800 bg-emerald-900 text-emerald-200/60'
                  }`}
                >
                  {g === 'INCE' ? 'İnce' : g === 'KABA' ? 'Kaba' : 'Altyapı'}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <label className="text-[8px] font-bold uppercase text-emerald-300 flex-1">
                Gün
                <input
                  type="date"
                  value={programTarih}
                  onChange={(e) => setProgramTarih(e.target.value)}
                  className="mt-0.5 block w-full rounded-md border border-emerald-700 bg-emerald-900 px-2 py-1.5 text-[11px] font-semibold text-white"
                />
              </label>
              <button
                type="button"
                disabled={busy || !eksikler.length}
                onClick={() => void handleProgramaAl()}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-400 px-3 py-2.5 text-[10px] font-black uppercase text-emerald-950 disabled:opacity-40 cursor-pointer hover:bg-emerald-300"
              >
                <CalendarDays size={12} />
                Al ({eksikler.length})
              </button>
            </div>
            <p className="text-[10px] text-emerald-100/80">
              {progKapsam === 'daire' ? 'Tüm daire açık kalemleri' : 'Seçili oda açık kalemleri'}
              {eksikler.length ? ` · ${eksikler.length} adet` : ' · açık yok'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjeBlokKontrolPanel;
