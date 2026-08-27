/**
 * Blok kontrol — tek blok / kat / daire drill-down.
 * 157/46 · 157/51 · 160/2: duvar aplikasyon kat etiketleri + ruhsat daire sayıları.
 * Takip başlıkları: Kaba · İnce · Altyapı. Görsel: bina kesiti + kat plakası + oda planı.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Home,
  Image as ImageIcon,
  X,
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

function grupTone(g: TakipKalemGrup): string {
  if (g === 'KABA') return 'border-amber-200 bg-amber-50 text-amber-950';
  if (g === 'INCE') return 'border-violet-200 bg-violet-50 text-violet-950';
  return 'border-sky-200 bg-sky-50 text-sky-950';
}

function avgYuzde(rows: { yuzde?: number }[]): number {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + (r.yuzde || 0), 0) / rows.length);
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

function katFill(tip: BlokKatSablon['tip'] | undefined, yuzde: number, active: boolean): string {
  if (active) return '#5b21b6';
  if (tip === 'TEKNIK') return yuzde > 0 ? '#a8a29e' : '#e7e5e4';
  if (tip === 'ZEMIN') return yuzde >= 100 ? '#059669' : yuzde > 0 ? '#fbbf24' : '#fef3c7';
  if (tip === 'CATI') return yuzde > 0 ? '#7dd3fc' : '#e0f2fe';
  return odaRenk(yuzde);
}

/** Bina kesiti — üstten alta kat şeridi; tıklanınca kat seçilir */
const BinaKesit: React.FC<{
  blok: string;
  katlar: { label: string; tip?: BlokKatSablon['tip']; konut: boolean; yuzde: number }[];
  katNo: number;
  onSelect: (katNo: number) => void;
}> = ({ blok, katlar, katNo, onSelect }) => {
  const n = Math.max(katlar.length, 1);
  const rowH = Math.min(28, Math.max(16, Math.floor(220 / n)));
  const h = rowH * n + 36;
  const w = 148;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[168px] mx-auto block select-none">
      <rect x="8" y="4" width={w - 16} height={12} rx="2" fill="#78716c" />
      <text x={w / 2} y="13" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff">
        {blok}
      </text>
      {katlar
        .map((k, i) => ({ ...k, idx: i + 1 }))
        .slice()
        .reverse()
        .map((k, revI) => {
          const y = 20 + revI * rowH;
          const active = katNo === k.idx;
          return (
            <g
              key={k.idx}
              className="cursor-pointer"
              onClick={() => onSelect(k.idx)}
            >
              <rect
                x="18"
                y={y}
                width={w - 36}
                height={rowH - 2}
                rx="2"
                fill={katFill(k.tip, k.yuzde, active)}
                stroke={active ? '#4c1d95' : '#57534e'}
                strokeWidth={active ? 1.6 : 0.5}
              />
              <text
                x="24"
                y={y + rowH / 2}
                dominantBaseline="middle"
                fontSize="6.5"
                fontWeight="700"
                fill={active ? '#fff' : '#1c1917'}
              >
                {k.label}
              </text>
              <text
                x={w - 24}
                y={y + rowH / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="6"
                fontWeight="700"
                fill={active ? '#ede9fe' : '#57534e'}
              >
                {k.konut ? `%${k.yuzde}` : 'T'}
              </text>
            </g>
          );
        })}
      <rect x="8" y={h - 10} width={w - 16} height={8} rx="1" fill="#44403c" />
    </svg>
  );
};

/** Kat plakası — daire kutuları (konut) veya teknik alan listesi */
const KatPlakasi: React.FC<{
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
      <div className="grid grid-cols-1 gap-1.5">
        {TEKNIK_KAT_ALANLARI.map((a) => {
          const y = odaYuzde(a.key);
          const active = odaKey === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => onTeknik(a.key)}
              className={`rounded-xl border px-3 py-2.5 text-left cursor-pointer transition-shadow ${
                active
                  ? 'border-violet-500 bg-violet-50 shadow-[0_0_0_2px_rgba(139,92,246,0.25)]'
                  : 'border-stone-200 bg-stone-50 hover:border-stone-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-stone-900">{a.label}</span>
                <span className="text-[10px] font-bold tabular-nums text-stone-500">%{y}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-stone-500 transition-[width]"
                  style={{ width: `${y}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const cols = dairePerKat <= 4 ? 2 : dairePerKat <= 6 ? 3 : 4;
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: Math.max(dairePerKat, 1) }, (_, i) => i + 1).map((di) => {
        const no = cBlokDaireNo(katNo, di);
        const y = avgYuzde(
          daireKalemleri.filter(
            (k) => k.parsel === parsel && k.blok === blok && k.daireNo === no
          )
        );
        const active = di === daireIndex;
        const t = tipForIndex(parsel, blok, di);
        return (
          <button
            key={di}
            type="button"
            onClick={() => onDaire(di)}
            className={`relative rounded-xl border p-2.5 text-left cursor-pointer overflow-hidden transition-shadow ${
              active
                ? 'border-violet-500 bg-white shadow-[0_0_0_2px_rgba(139,92,246,0.3)]'
                : 'border-stone-200 bg-stone-50/80 hover:border-stone-300'
            }`}
          >
            <div
              className="absolute inset-x-0 bottom-0 h-1"
              style={{ background: odaRenk(y) }}
            />
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wide">{t}</p>
            <p className="text-base font-black text-stone-900 tabular-nums leading-tight">{no}</p>
            <p className="text-[10px] font-bold text-stone-500 mt-0.5">%{y}</p>
          </button>
        );
      })}
    </div>
  );
};

const KalemEditor: React.FC<{
  row: ProjeCDaireKalem;
  busy?: boolean;
  onUpdate: (row: ProjeCDaireKalem) => void;
}> = ({ row, busy, onUpdate }) => {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-black text-stone-900">{row.kalemBaslik}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${durumTone(row.durum)}`}
        >
          {DISIPLIN_DURUM_LABEL[row.durum]}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {(['PLANLANDI', 'IMALATTA', 'TAMAMLANDI', 'BEKLEMEDE'] as ProjeDisiplinDurum[]).map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy || row.durum === d}
            onClick={() =>
              onUpdate({
                ...row,
                durum: d,
                yuzde:
                  d === 'TAMAMLANDI' ? 100 : d === 'IMALATTA' ? Math.max(row.yuzde, 40) : row.yuzde,
              })
            }
            className={`rounded-lg border px-2 py-0.5 text-[9px] font-black cursor-pointer disabled:opacity-40 ${
              row.durum === d ? durumTone(d) : 'border-stone-200 bg-white text-stone-600'
            }`}
          >
            {DISIPLIN_DURUM_LABEL[d]}
          </button>
        ))}
      </div>
      <label className="block text-[9px] font-bold uppercase text-stone-500">
        %{row.yuzde}
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
          className="mt-1 w-full accent-violet-700"
        />
      </label>
      <input
        type="text"
        placeholder="Eksik / kontrol notu…"
        value={row.eksikNot || ''}
        disabled={busy}
        onChange={(e) => onUpdate({ ...row, eksikNot: e.target.value || undefined })}
        className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px]"
      />
    </div>
  );
};

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
  const [gorselIdx, setGorselIdx] = useState(0);
  const [programTarih, setProgramTarih] = useState(tomorrowDateKey());
  const [analizAcik, setAnalizAcik] = useState(false);

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
  const konutKatN = model?.katlar.filter((k) => k.konut).length || katSayisi;

  useEffect(() => {
    if (!bloklar.length) return;
    if (!bloklar.some((b) => b.blok === blok)) {
      setBlok(bloklar[0].blok);
      setKatNo(1);
      setDaireIndex(1);
      setOdaKey(null);
    }
  }, [bloklar, blok]);

  useEffect(() => {
    setKatNo(1);
    setDaireIndex(1);
    setOdaKey(null);
  }, [blok]);

  useEffect(() => {
    setDaireIndex(1);
    setOdaKey(null);
    setGorselIdx(0);
  }, [katNo]);

  useEffect(() => {
    setOdaKey(null);
    setGorselIdx(0);
  }, [daireIndex]);

  const existingMap = useMemo(
    () => new Map(daireKalemleri.map((k) => [k.id, k])),
    [daireKalemleri]
  );

  const daireRows = useMemo(
    () =>
      daireKalemleri.filter(
        (k) => k.parsel === parsel && k.blok === blok && k.daireNo === daireNo
      ),
    [daireKalemleri, parsel, blok, daireNo]
  );

  const daireYuzde = avgYuzde(daireRows);
  const plan = tip ? planOdalarForTip(tip) : [];
  const teknikPlan = TEKNIK_KAT_ALANLARI.map((a) => ({
    key: a.key,
    label: a.label,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  }));

  const katKesitRows = useMemo(() => {
    const rows: { label: string; tip?: BlokKatSablon['tip']; konut: boolean; yuzde: number }[] =
      [];
    for (let i = 1; i <= katSayisi; i++) {
      const meta = model?.katSablon(i);
      const label = meta?.label || String(i);
      const konut = meta ? meta.konut : true;
      if (!konut) {
        const tNo = `T${i}`;
        const y = avgYuzde(
          daireKalemleri.filter(
            (k) => k.parsel === parsel && k.blok === blok && k.daireNo === tNo
          )
        );
        rows.push({ label, tip: meta?.tip, konut: false, yuzde: y });
        continue;
      }
      const nD = model ? model.daireKatta(i) : profil ? dairePerKatOf(profil) : 4;
      const ys: number[] = [];
      for (let di = 1; di <= Math.max(nD, 1); di++) {
        const no = cBlokDaireNo(i, di);
        ys.push(
          avgYuzde(
            daireKalemleri.filter(
              (k) => k.parsel === parsel && k.blok === blok && k.daireNo === no
            )
          )
        );
      }
      rows.push({
        label,
        tip: meta?.tip,
        konut: true,
        yuzde: avgYuzde(ys.map((y) => ({ yuzde: y }))),
      });
    }
    return rows;
  }, [katSayisi, model, daireKalemleri, parsel, blok, profil]);

  const seciliOda = teknikKat
    ? teknikPlan.find((o) => o.key === odaKey) || null
    : plan.find((o) => o.key === odaKey) || null;

  const odaYuzde = (key: string) => avgYuzde(daireRows.filter((k) => k.odaKey === key));

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

  const eksikler = useMemo(
    () =>
      (seciliOda ? odaKalemleri : daireRows).filter(
        (k) => k.durum !== 'TAMAMLANDI' || (k.yuzde || 0) < 100
      ),
    [seciliOda, odaKalemleri, daireRows]
  );

  const hedefGorseller = useMemo(() => {
    if (teknikKat) return [];
    if (odaKey) return mimariGorsellerForOda(parsel, odaKey as CDaireOdaKey);
    return mimariGorsellerForParsel(parsel);
  }, [parsel, odaKey, teknikKat]);

  useEffect(() => {
    setGorselIdx(0);
  }, [hedefGorseller.length, odaKey]);

  const analiz = useMemo(() => {
    const tamam = daireRows.filter((k) => k.durum === 'TAMAMLANDI').length;
    const imalat = daireRows.filter((k) => k.durum === 'IMALATTA').length;
    const planli = daireRows.filter((k) => k.durum === 'PLANLANDI').length;
    const notlu = daireRows.filter((k) => Boolean(k.eksikNot?.trim())).length;
    const byGrup = (['KABA', 'INCE', 'ALTYAPI'] as TakipKalemGrup[]).map((g) => {
      const rows = daireRows.filter((k) => resolveGrup(k) === g);
      return { grup: g, label: TAKIP_KALEM_GRUP_LABEL[g], yuzde: avgYuzde(rows), n: rows.length };
    });
    const byOda = (teknikKat ? teknikPlan : plan.filter((o) => o.key !== 'giris')).map((o) => ({
      label: o.label,
      yuzde: odaYuzde(o.key),
      eksik: daireRows.filter(
        (k) => k.odaKey === o.key && (k.durum !== 'TAMAMLANDI' || k.yuzde < 100)
      ).length,
    }));
    return { tamam, imalat, planli, notlu, byOda, byGrup, toplam: daireRows.length };
  }, [daireRows, plan, teknikKat]);

  const handleProgramaAl = async () => {
    const kaynak = seciliOda ? odaKalemleri : [];
    const adaylar = (kaynak.length ? kaynak : daireRows).filter(
      (k) => k.durum !== 'TAMAMLANDI' || k.yuzde < 100
    );
    if (!adaylar.length) {
      alert('Programa alınacak açık kalem yok. Önce alan seçip eksik kalemleri işaretleyin.');
      return;
    }
    const drafts: BlokKontrolProgramDraft[] = adaylar.map((k) => ({
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-800 flex items-center gap-1.5">
          <ClipboardList size={12} /> Blok kontrol
        </p>
        <h2 className="text-lg font-black text-violet-950 mt-0.5">
          Tek blok → kat → {teknikKat ? 'teknik alan' : 'daire'} durumu
        </h2>
        <p className="text-[11px] text-violet-900/80 mt-1 max-w-2xl leading-snug">
          Takip başlıkları: <strong>Kaba</strong> · <strong>İnce</strong> · <strong>Altyapı</strong>.
          {model
            ? ' Kat etiketleri duvar aplikasyon + ruhsat daire sayılarından.'
            : ' Seçili dairenin odalarını ve eksiklerini buradan kontrol edin.'}
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 shadow-sm">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-[9px] font-bold uppercase text-stone-500">
            Parsel
            <select
              value={parsel}
              onChange={(e) => onParselChange(e.target.value)}
              className="mt-0.5 block min-w-[160px] rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
            >
              {parselSecenek.map((p) => (
                <option key={p} value={p}>
                  {p.replace('Parsel Bölge ', '')}
                </option>
              ))}
            </select>
          </label>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[9px] font-bold uppercase text-stone-500 mb-0.5">Blok (tek seçim)</p>
            <div className="flex flex-wrap gap-1.5">
              {bloklar.map((b) => (
                <button
                  key={b.blok}
                  type="button"
                  onClick={() => setBlok(b.blok)}
                  className={`rounded-lg border px-3 py-2 text-xs font-black cursor-pointer ${
                    blok === b.blok
                      ? 'border-violet-700 bg-violet-700 text-white'
                      : 'border-stone-200 bg-stone-50 text-stone-700'
                  }`}
                >
                  {b.blok}
                </button>
              ))}
            </div>
          </div>
        </div>

        {profil && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Toplam kat', value: String(katSayisi) },
              { label: 'Konut katı', value: String(konutKatN) },
              { label: 'Daire / blok', value: String(profil.daireSayisi) },
              {
                label: 'Bu kat',
                value: teknikKat ? 'Teknik' : `${dairePerKat} daire`,
              },
              {
                label: 'Seçili',
                value: teknikKat
                  ? `${blok} · ${katMeta?.label || `K${katNo}`}`
                  : `${daireNo}${tip ? ` · ${tip}` : ''}`,
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-violet-100 bg-violet-50/50 px-2.5 py-2 text-center"
              >
                <p className="text-[9px] font-bold uppercase text-violet-700/80">{c.label}</p>
                <p className="text-sm font-black tabular-nums text-violet-950 leading-tight">
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        )}
        {model && (
          <p className="text-[10px] text-stone-500 truncate" title={model.dwgKaynak}>
            Kaynak: {model.dwgKaynak}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-black uppercase text-stone-500">
              {blok} · bina kesiti
            </p>
            <p className="text-[10px] font-semibold text-stone-400">
              {katMeta?.label || `Kat ${katNo}`}
              {teknikKat ? ' · teknik' : ` · ${dairePerKat} daire`}
            </p>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
            <div className="rounded-xl border border-stone-200 bg-gradient-to-b from-stone-100 to-stone-50 p-2">
              <BinaKesit
                blok={blok}
                katlar={katKesitRows}
                katNo={katNo}
                onSelect={setKatNo}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-[10px] font-black uppercase text-stone-500">
                {teknikKat ? 'Teknik / ortak alan' : 'Kat plakası'}
              </p>
              <KatPlakasi
                teknikKat={teknikKat}
                dairePerKat={dairePerKat}
                katNo={katNo}
                daireIndex={daireIndex}
                parsel={parsel}
                blok={blok}
                daireKalemleri={daireKalemleri}
                odaKey={odaKey}
                onDaire={setDaireIndex}
                onTeknik={setOdaKey}
                odaYuzde={odaYuzde}
              />
              {!model && (
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: katSayisi }, (_, i) => i + 1).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKatNo(k)}
                      className={`rounded-md border px-2 py-1 text-[10px] font-black cursor-pointer ${
                        katNo === k
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-stone-200 bg-stone-50 text-stone-600'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase text-violet-700 flex items-center gap-1">
                <Home size={12} /> {teknikKat ? 'Teknik kat' : 'Seçili daire · oda planı'}
              </p>
              <h3 className="text-lg font-black text-stone-900">
                {blok} · {teknikKat ? katMeta?.label || daireNo : daireNo}
                {!teknikKat && tip && (
                  <span className="text-stone-400 font-bold text-sm ml-2">{tip}</span>
                )}
              </h3>
              <p className="text-xs text-stone-500">
                Fiili %{daireYuzde}
                {analiz.toplam
                  ? ` · ${analiz.tamam} tamam / ${analiz.imalat} imalatta / ${analiz.planli} plan`
                  : ' · henüz kalem işlenmedi — alan seçin'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAnalizAcik(true)}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[10px] font-black uppercase cursor-pointer"
            >
              Analiz
            </button>
          </div>

          {teknikKat ? (
            <p className="text-[11px] text-stone-500 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-3">
              Bu kat daire katı değil (bodrum / teknik). Soldan kalorifer, sığınak, depo vb. alanı
              seçip kaba / ince / altyapı kalemlerini işleyin.
            </p>
          ) : (
            <>
              <svg viewBox="0 0 100 100" className="w-full rounded-xl border border-stone-300 bg-white">
                {plan.map((oda) => {
                  const y = odaYuzde(oda.key);
                  const isGiris = oda.key === 'giris';
                  const active = odaKey === oda.key;
                  return (
                    <g key={oda.key} className="cursor-pointer" onClick={() => setOdaKey(oda.key)}>
                      <rect
                        x={oda.x}
                        y={oda.y}
                        width={oda.w}
                        height={oda.h}
                        rx="1"
                        fill={isGiris ? '#334155' : odaRenk(y)}
                        stroke={active ? '#7c3aed' : '#64748b'}
                        strokeWidth={active ? 1.5 : 0.6}
                      />
                      {!isGiris && (
                        <>
                          <text
                            x={oda.x + oda.w / 2}
                            y={oda.y + oda.h / 2 - 1.2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="2.7"
                            fontWeight="700"
                            fill="#1e293b"
                          >
                            {oda.label}
                          </text>
                          <text
                            x={oda.x + oda.w / 2}
                            y={oda.y + oda.h / 2 + 2.8}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="2.3"
                            fill="#475569"
                          >
                            %{y}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
              <p className="text-[10px] text-stone-500 text-center">
                Odaya tıklayın → kaba / ince / altyapı kalemleri
              </p>
            </>
          )}
        </div>
      </div>

      {seciliOda && seciliOda.key !== 'giris' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-700">
                  {blok} · {daireNo}
                </p>
                <h4 className="text-base font-black text-stone-900">{seciliOda.label}</h4>
              </div>
              <button
                type="button"
                onClick={() => setOdaKey(null)}
                className="rounded-lg border border-stone-200 p-1.5 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 max-h-[480px] overflow-y-auto">
              {odaGruplari.map((g) => (
                <div key={g.grup} className="space-y-1.5">
                  <p
                    className={`sticky top-0 z-[1] rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide ${grupTone(g.grup)}`}
                  >
                    {g.label}
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
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2 shadow-sm">
            <p className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-1">
              <ImageIcon size={12} /> Hedef görünüm (iç mimari)
            </p>
            {hedefGorseller.length === 0 ? (
              <p className="text-xs text-stone-400 italic py-8 text-center">
                {teknikKat
                  ? 'Teknik kat — mimari iç görsel yok.'
                  : 'Bu parsel / oda için görsel yok.'}
              </p>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-stone-100 aspect-[4/3]">
                  <img
                    src={hedefGorseller[gorselIdx % hedefGorseller.length].src}
                    alt={hedefGorseller[gorselIdx % hedefGorseller.length].baslik}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-[11px] font-semibold text-stone-700 truncate">
                  {hedefGorseller[gorselIdx % hedefGorseller.length].baslik}
                </p>
                <div className="flex flex-wrap gap-1">
                  {hedefGorseller.map((g, i) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGorselIdx(i)}
                      className={`h-12 w-16 overflow-hidden rounded-lg border cursor-pointer ${
                        i === gorselIdx % hedefGorseller.length
                          ? 'border-violet-500 ring-1 ring-violet-300'
                          : 'border-stone-200'
                      }`}
                    >
                      <img src={g.src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <p className="text-[10px] font-black uppercase text-emerald-900">İş programı</p>
          <p className="text-[11px] text-emerald-900/80">
            {seciliOda && seciliOda.key !== 'giris'
              ? `${seciliOda.label} içindeki açık kalemler (kaba/ince/altyapı)`
              : 'Önce alan seçin — eksikler programa alınır'}
            {eksikler.length ? ` (${eksikler.length} açık)` : ''}
          </p>
        </div>
        <label className="text-[9px] font-bold uppercase text-emerald-900">
          Program günü
          <input
            type="date"
            value={programTarih}
            onChange={(e) => setProgramTarih(e.target.value)}
            className="mt-0.5 block rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-semibold"
          />
        </label>
        <button
          type="button"
          disabled={busy || !seciliOda || seciliOda.key === 'giris'}
          onClick={() => void handleProgramaAl()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-40 cursor-pointer"
        >
          <CalendarDays size={12} />
          Eksikleri iş programına al
          <ChevronRight size={12} />
        </button>
      </div>

      {analizAcik && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-stone-100 bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-700">Analiz</p>
                <h3 className="text-base font-black text-stone-900">
                  {blok} · {teknikKat ? katMeta?.label : daireNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAnalizAcik(false)}
                className="rounded-lg border border-stone-200 p-2 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase text-violet-700">Fiili</p>
                  <p className="text-2xl font-black">%{daireYuzde}</p>
                </div>
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase text-stone-500">Kalem</p>
                  <p className="text-2xl font-black">{analiz.toplam || '—'}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {analiz.byGrup.map((g) => (
                  <div
                    key={g.grup}
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-2 ${grupTone(g.grup)}`}
                  >
                    <span className="text-xs font-bold">{g.label}</span>
                    <span className="text-[11px] font-black">
                      %{g.yuzde}
                      {g.n ? ` · ${g.n}` : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {analiz.byOda.map((o) => (
                  <div
                    key={o.label}
                    className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-2"
                  >
                    <span className="text-xs font-bold text-stone-800">{o.label}</span>
                    <span className="text-[11px] font-black text-stone-600">
                      %{o.yuzde}
                      {o.eksik ? ` · ${o.eksik} açık` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjeBlokKontrolPanel;
