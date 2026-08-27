import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Home, Pause, Play, X } from 'lucide-react';
import type {
  ProjeCDaireKalem,
  ProjeDisiplinDurum,
  ProjeDisiplinIlerleme,
} from '../types/erp';
import {
  C_BLOK_DWG,
  C_BLOK_PROFILLERI,
  C_BLOKLAR_157_51,
  C_PLAN_DOGRULAMA_NOTU,
  cBlokDaireNo,
  cBlokDaireTipi,
  cBlokParselOzet,
  cDaireKalemId,
  kalemlerForOda,
  planOdalarForTip,
  profilForCBlok,
  type CBlokKodu,
  type CDaireOdaKey,
  type CDaireTipi,
} from '../data/parsel15751CBlokSeed';
import { PARSEL_157_51 } from '../data/parsel15751DisiplinSeed';
import { DISIPLIN_DURUM_LABEL, calcDisiplinOzet } from '../lib/projeDisiplinUtils';

type Props = {
  satirlari: ProjeDisiplinIlerleme[];
  daireKalemleri: ProjeCDaireKalem[];
  busy?: boolean;
  onUpdateBlok: (row: ProjeDisiplinIlerleme, patch: Partial<ProjeDisiplinIlerleme>) => void;
  onUpdateDaireKalem: (row: ProjeCDaireKalem) => void;
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

function avgYuzde(rows: { yuzde?: number }[]): number {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + (r.yuzde || 0), 0) / rows.length);
}

function buildSeedKalemler(
  blok: CBlokKodu,
  katNo: number,
  daireIndex: number,
  odaKey: CDaireOdaKey,
  odaLabel: string,
  existing: Map<string, ProjeCDaireKalem>
): ProjeCDaireKalem[] {
  const tip = cBlokDaireTipi(daireIndex);
  const daireNo = cBlokDaireNo(katNo, daireIndex);
  return kalemlerForOda(odaKey).map((k) => {
    const id = cDaireKalemId(PARSEL_157_51, blok, daireNo, odaKey, k.kod);
    const prev = existing.get(id);
    return {
      id,
      parsel: PARSEL_157_51,
      blok,
      daireNo,
      katNo,
      tip,
      odaKey,
      odaLabel,
      kalemKod: k.kod,
      kalemBaslik: k.baslik,
      durum: prev?.durum || 'PLANLANDI',
      yuzde: typeof prev?.yuzde === 'number' ? prev.yuzde : 0,
      eksikNot: prev?.eksikNot,
      guncellemeTarihi: prev?.guncellemeTarihi,
      olusturan: prev?.olusturan,
    };
  });
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
        className="mx-auto w-[88px]"
        style={{
          transform: 'perspective(700px) rotateX(10deg) rotateY(-16deg)',
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
                    className="h-2.5 flex-1 rounded-[2px] border border-white/50"
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
      </div>
      <p className="mt-2 text-[9px] font-bold text-stone-500 text-center">
        {katSayisi} kat · {katSayisi * dairePerKat} daire
      </p>
    </button>
  );
}

export const ProjeCBlokPanel: React.FC<Props> = ({
  satirlari,
  daireKalemleri,
  busy,
  onUpdateBlok,
  onUpdateDaireKalem,
}) => {
  const [anim, setAnim] = useState(true);
  const [seciliBlok, setSeciliBlok] = useState<CBlokKodu>('C1');
  const [katNo, setKatNo] = useState(1);
  const [popupDaire, setPopupDaire] = useState<{
    daireIndex: number;
    daireNo: string;
    tip: CDaireTipi;
  } | null>(null);
  const [popupOda, setPopupOda] = useState<{
    key: CDaireOdaKey;
    label: string;
  } | null>(null);

  const ozet = useMemo(() => calcDisiplinOzet(satirlari), [satirlari]);
  const parselOzet = cBlokParselOzet();
  const profil = profilForCBlok(seciliBlok)!;

  const existingMap = useMemo(
    () => new Map(daireKalemleri.map((k) => [k.id, k])),
    [daireKalemleri]
  );

  const blokOzet = useMemo(() => {
    const m = new Map<CBlokKodu, number>();
    for (const b of C_BLOKLAR_157_51) {
      m.set(b, calcDisiplinOzet(satirlari.filter((s) => s.blok === b)).yuzde);
    }
    return m;
  }, [satirlari]);

  const blokSatirlari = useMemo(
    () => satirlari.filter((s) => s.blok === seciliBlok).sort((a, b) => a.kod.localeCompare(b.kod)),
    [satirlari, seciliBlok]
  );

  const animOn = anim === true;

  useEffect(() => {
    setKatNo(1);
    setPopupDaire(null);
    setPopupOda(null);
  }, [seciliBlok]);

  useEffect(() => {
    setPopupOda(null);
  }, [popupDaire?.daireNo]);

  const daireYuzdeOnKat = (daireIndex: number): number => {
    const daireNo = cBlokDaireNo(katNo, daireIndex);
    const rows = daireKalemleri.filter(
      (k) => k.blok === seciliBlok && k.daireNo === daireNo
    );
    return avgYuzde(rows);
  };

  const odaPlan = popupDaire ? planOdalarForTip(popupDaire.tip) : [];

  const odaYuzde = (odaKey: string): number => {
    if (!popupDaire) return 0;
    return avgYuzde(
      daireKalemleri.filter(
        (k) =>
          k.blok === seciliBlok &&
          k.daireNo === popupDaire.daireNo &&
          k.odaKey === odaKey
      )
    );
  };

  const odaKalemSatirlari = useMemo(() => {
    if (!popupDaire || !popupOda) return [];
    return buildSeedKalemler(
      seciliBlok,
      katNo,
      popupDaire.daireIndex,
      popupOda.key,
      popupOda.label,
      existingMap
    );
  }, [popupDaire, popupOda, seciliBlok, katNo, existingMap]);

  const openDaire = (daireIndex: number) => {
    const tip = cBlokDaireTipi(daireIndex);
    setPopupDaire({
      daireIndex,
      daireNo: cBlokDaireNo(katNo, daireIndex),
      tip,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-950 leading-snug">
        <strong>Doğrulama:</strong> {C_PLAN_DOGRULAMA_NOTU}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 flex items-center gap-1.5">
              <Building2 size={12} /> C blok · kat · daire · oda
            </p>
            <h2 className="text-lg font-black text-stone-900">C Bloklar (157/51)</h2>
            <p className="mt-1 text-xs text-stone-600 max-w-xl">
              {parselOzet.blokSayisi} blok · {parselOzet.kat} kat · {parselOzet.dairePerKat}{' '}
              daire/kat · {parselOzet.daire} daire. DWG: {C_BLOK_DWG}
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
            onClick: () => setSeciliBlok(p.blok),
          })
        )}
      </div>

      {/* Kat seç + daire grid */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase text-violet-700 flex items-center gap-1">
              <Home size={12} /> {seciliBlok} · kat planı
            </p>
            <p className="text-xs text-stone-600">Daireye tıklayınca popup açılır</p>
          </div>
          <label className="text-[9px] font-bold uppercase text-stone-500">
            Kat
            <select
              value={katNo}
              onChange={(e) => setKatNo(Number(e.target.value))}
              className="mt-0.5 ml-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-semibold"
            >
              {Array.from({ length: profil.katSayisi }, (_, i) => i + 1).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: profil.dairePerKat }, (_, i) => i + 1).map((di) => {
            const tip = cBlokDaireTipi(di);
            const no = cBlokDaireNo(katNo, di);
            const y = daireYuzdeOnKat(di);
            return (
              <button
                key={di}
                type="button"
                onClick={() => openDaire(di)}
                className="rounded-2xl border border-stone-200 bg-stone-50 hover:border-violet-400 hover:bg-violet-50 p-3 text-left cursor-pointer transition"
              >
                <p className="text-[9px] font-bold uppercase text-stone-400">{tip}</p>
                <p className="text-lg font-black text-stone-900">{no}</p>
                <div className="mt-2 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${y}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] font-bold text-stone-600">%{y} · detay aç</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Blok WBS özet */}
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">
          {seciliBlok} — blok mimari WBS
        </p>
        {blokSatirlari.map((row) => (
          <div key={row.id} className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400">{row.kod}</p>
                <p className="text-sm font-black text-stone-900">{row.baslik}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${durumTone(row.durum)}`}>
                {DISIPLIN_DURUM_LABEL[row.durum]}
              </span>
            </div>
            <label className="block text-[10px] font-bold uppercase text-stone-500">
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
                  onUpdateBlok(row, { yuzde, durum });
                }}
                className="mt-1 w-full accent-violet-700"
              />
            </label>
          </div>
        ))}
      </div>

      {/* DAIRE POPUP */}
      {popupDaire && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-stone-100 bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-700">
                  {seciliBlok} · Kat {katNo} · {popupDaire.tip}
                </p>
                <h3 className="text-lg font-black text-stone-900">Daire {popupDaire.daireNo}</h3>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Odaya tıkla → kalem kalem eksik / ilerleme
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPopupDaire(null);
                  setPopupOda(null);
                }}
                className="rounded-lg border border-stone-200 p-2 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <svg viewBox="0 0 100 100" className="w-full rounded-xl border border-stone-300 bg-white">
                {odaPlan.map((oda) => {
                  const y = odaYuzde(oda.key);
                  const isGiris = oda.key === 'giris';
                  return (
                    <g
                      key={oda.key}
                      className="cursor-pointer"
                      onClick={() => setPopupOda({ key: oda.key, label: oda.label })}
                    >
                      <rect
                        x={oda.x}
                        y={oda.y}
                        width={oda.w}
                        height={oda.h}
                        rx="1"
                        fill={isGiris ? '#334155' : odaRenk(y)}
                        stroke={popupOda?.key === oda.key ? '#7c3aed' : '#64748b'}
                        strokeWidth={popupOda?.key === oda.key ? 1.4 : 0.6}
                      />
                      {!isGiris && (
                        <>
                          <text
                            x={oda.x + oda.w / 2}
                            y={oda.y + oda.h / 2 - 1.5}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="2.8"
                            fontWeight="700"
                            fill="#1e293b"
                          >
                            {oda.label}
                          </text>
                          <text
                            x={oda.x + oda.w / 2}
                            y={oda.y + oda.h / 2 + 3}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="2.4"
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
                Giriş (koyu) mutfak/hol yanında — tip SketchUp doğrulaması
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                {odaPlan
                  .filter((o) => o.key !== 'giris')
                  .map((oda) => (
                    <button
                      key={oda.key}
                      type="button"
                      onClick={() => setPopupOda({ key: oda.key, label: oda.label })}
                      className={`rounded-xl border px-2 py-2 text-left cursor-pointer ${
                        popupOda?.key === oda.key
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-stone-200 bg-stone-50'
                      }`}
                    >
                      <p className="text-[10px] font-black text-stone-800">{oda.label}</p>
                      <p className="text-[9px] text-stone-500">%{odaYuzde(oda.key)} · kalemler</p>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ODA KALEM POPUP */}
      {popupDaire && popupOda && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-stone-100 bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-700">
                  {seciliBlok} · {popupDaire.daireNo}
                </p>
                <h3 className="text-base font-black text-stone-900">{popupOda.label}</h3>
                <p className="text-[10px] text-stone-500">Kalem kalem eksik / ilerleme</p>
              </div>
              <button
                type="button"
                onClick={() => setPopupOda(null)}
                className="rounded-lg border border-stone-200 p-2 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {odaKalemSatirlari.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-black text-stone-900">{row.kalemBaslik}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${durumTone(row.durum)}`}
                    >
                      {DISIPLIN_DURUM_LABEL[row.durum]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(['PLANLANDI', 'IMALATTA', 'TAMAMLANDI', 'BEKLEMEDE'] as ProjeDisiplinDurum[]).map(
                      (d) => (
                        <button
                          key={d}
                          type="button"
                          disabled={busy || row.durum === d}
                          onClick={() =>
                            onUpdateDaireKalem({
                              ...row,
                              durum: d,
                              yuzde:
                                d === 'TAMAMLANDI'
                                  ? 100
                                  : d === 'IMALATTA'
                                    ? Math.max(row.yuzde, 40)
                                    : row.yuzde,
                            })
                          }
                          className={`rounded-lg border px-2 py-0.5 text-[9px] font-black cursor-pointer disabled:opacity-40 ${
                            row.durum === d ? durumTone(d) : 'border-stone-200 bg-white text-stone-600'
                          }`}
                        >
                          {DISIPLIN_DURUM_LABEL[d]}
                        </button>
                      )
                    )}
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
                        onUpdateDaireKalem({ ...row, yuzde, durum });
                      }}
                      className="mt-1 w-full accent-violet-700"
                    />
                  </label>
                  <input
                    type="text"
                    placeholder="Eksik notu…"
                    value={row.eksikNot || ''}
                    disabled={busy}
                    onChange={(e) =>
                      onUpdateDaireKalem({ ...row, eksikNot: e.target.value || undefined })
                    }
                    className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes cBlokFloat {
          0%, 100% { transform: perspective(700px) rotateX(10deg) rotateY(-16deg) translateY(0); }
          50% { transform: perspective(700px) rotateX(10deg) rotateY(-16deg) translateY(-4px); }
        }
      `}</style>
    </div>
  );
};

export default ProjeCBlokPanel;
