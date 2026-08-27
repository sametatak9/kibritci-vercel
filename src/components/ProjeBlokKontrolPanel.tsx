/**
 * Blok kontrol — tek blok / kat / daire drill-down.
 * Amaç: seçili dairenin durumuna hakim olmak; eksiklerden iş programı çıkarmak.
 * Toplu analiz değil; kontrol mekanizması.
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
} from '../types/erp';
import {
  cBlokDaireNo,
  cBlokDaireTipi,
  cDaireKalemId,
  kalemlerForOda,
  planOdalarForTip,
  type CDaireOdaKey,
  type CDaireTipi,
} from '../data/parsel15751CBlokSeed';
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

function avgYuzde(rows: { yuzde?: number }[]): number {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + (r.yuzde || 0), 0) / rows.length);
}

function dairePerKatOf(p: ProjeBlokProfili): number {
  if (!p.katSayisi) return 4;
  return Math.max(1, Math.round((p.daireSayisi || 0) / p.katSayisi) || 4);
}

function tipForIndex(daireIndex: number, blok: string): CDaireTipi {
  if (/^C[1-4]$/.test(blok)) return cBlokDaireTipi(daireIndex);
  return daireIndex <= 2 ? '2+1' : '3+1';
}

function buildSeedKalemler(
  parsel: string,
  blok: string,
  katNo: number,
  daireIndex: number,
  odaKey: CDaireOdaKey,
  odaLabel: string,
  existing: Map<string, ProjeCDaireKalem>
): ProjeCDaireKalem[] {
  const tip = tipForIndex(daireIndex, blok);
  const daireNo = cBlokDaireNo(katNo, daireIndex);
  return kalemlerForOda(odaKey).map((k) => {
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
      durum: prev?.durum || 'PLANLANDI',
      yuzde: typeof prev?.yuzde === 'number' ? prev.yuzde : 0,
      eksikNot: prev?.eksikNot,
      guncellemeTarihi: prev?.guncellemeTarihi,
      olusturan: prev?.olusturan,
    };
  });
}

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
  const [odaKey, setOdaKey] = useState<CDaireOdaKey | null>(null);
  const [gorselIdx, setGorselIdx] = useState(0);
  const [programTarih, setProgramTarih] = useState(tomorrowDateKey());
  const [analizAcik, setAnalizAcik] = useState(false);

  const profil = bloklar.find((b) => b.blok === blok) || bloklar[0];
  const katSayisi = profil?.katSayisi || 7;
  const dairePerKat = profil ? dairePerKatOf(profil) : 4;
  const tip = tipForIndex(daireIndex, blok);
  const daireNo = cBlokDaireNo(katNo, daireIndex);

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
    setOdaKey(null);
    setGorselIdx(0);
  }, [daireIndex, katNo]);

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
  const plan = planOdalarForTip(tip);
  const seciliOda = plan.find((o) => o.key === odaKey) || null;

  const odaYuzde = (key: string) =>
    avgYuzde(daireRows.filter((k) => k.odaKey === key));

  const odaKalemleri = useMemo(() => {
    if (!seciliOda) return [];
    return buildSeedKalemler(
      parsel,
      blok,
      katNo,
      daireIndex,
      seciliOda.key,
      seciliOda.label,
      existingMap
    );
  }, [seciliOda, parsel, blok, katNo, daireIndex, existingMap]);

  const eksikler = useMemo(
    () =>
      (seciliOda ? odaKalemleri : daireRows).filter(
        (k) => k.durum !== 'TAMAMLANDI' || (k.yuzde || 0) < 100
      ),
    [seciliOda, odaKalemleri, daireRows]
  );

  const hedefGorseller = useMemo(() => {
    if (odaKey) return mimariGorsellerForOda(parsel, odaKey);
    return mimariGorsellerForParsel(parsel);
  }, [parsel, odaKey]);

  useEffect(() => {
    setGorselIdx(0);
  }, [hedefGorseller.length, odaKey]);

  const analiz = useMemo(() => {
    const tamam = daireRows.filter((k) => k.durum === 'TAMAMLANDI').length;
    const imalat = daireRows.filter((k) => k.durum === 'IMALATTA').length;
    const planli = daireRows.filter((k) => k.durum === 'PLANLANDI').length;
    const notlu = daireRows.filter((k) => Boolean(k.eksikNot?.trim())).length;
    const byOda = plan
      .filter((o) => o.key !== 'giris')
      .map((o) => ({
        label: o.label,
        yuzde: odaYuzde(o.key),
        eksik: daireRows.filter(
          (k) => k.odaKey === o.key && (k.durum !== 'TAMAMLANDI' || k.yuzde < 100)
        ).length,
      }));
    return { tamam, imalat, planli, notlu, byOda, toplam: daireRows.length };
  }, [daireRows, plan]);

  const handleProgramaAl = async () => {
    const kaynak = seciliOda ? odaKalemleri : [];
    const adaylar = (kaynak.length ? kaynak : daireRows).filter(
      (k) => k.durum !== 'TAMAMLANDI' || k.yuzde < 100
    );
    if (!adaylar.length) {
      alert('Programa alınacak açık kalem yok. Önce oda seçip eksik kalemleri işaretleyin.');
      return;
    }
    const drafts: BlokKontrolProgramDraft[] = adaylar.map((k) => ({
      baslik: `${blok} ${daireNo} · ${k.odaLabel} · ${k.kalemBaslik}${
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
          Tek blok → kat → daire durumu
        </h2>
        <p className="text-[11px] text-violet-900/80 mt-1 max-w-2xl leading-snug">
          Toplu analiz değil: seçtiğiniz dairenin odalarını, eksiklerini ve hedef mimari
          görünümü buradan kontrol edin; eksik kalemlerden iş programı çıkarın.
        </p>
      </div>

      {/* Seçim şeridi */}
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
              { label: 'Kat sayısı', value: String(katSayisi) },
              { label: 'Daire / kat', value: String(dairePerKat) },
              { label: 'Daire / blok', value: String(katSayisi * dairePerKat) },
              { label: 'Seçili', value: `${blok} · K${katNo}` },
              { label: 'Daire', value: `${daireNo} · ${tip}` },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-violet-100 bg-violet-50/50 px-2.5 py-2 text-center"
              >
                <p className="text-[9px] font-bold uppercase text-violet-700/80">{c.label}</p>
                <p className="text-base font-black tabular-nums text-violet-950">{c.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kat + daire */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 shadow-sm">
          <p className="text-[10px] font-black uppercase text-stone-500">
            {blok} · Kat seç ({katSayisi} kat)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: katSayisi }, (_, i) => i + 1).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKatNo(k)}
                className={`min-w-[2.4rem] rounded-lg border px-2 py-1.5 text-[11px] font-black cursor-pointer ${
                  katNo === k
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-stone-200 bg-stone-50 text-stone-700'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-black uppercase text-stone-500">
            Kat {katNo} · {dairePerKat} daire
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: dairePerKat }, (_, i) => i + 1).map((di) => {
              const no = cBlokDaireNo(katNo, di);
              const y = avgYuzde(
                daireKalemleri.filter(
                  (k) => k.parsel === parsel && k.blok === blok && k.daireNo === no
                )
              );
              const active = di === daireIndex;
              return (
                <button
                  key={di}
                  type="button"
                  onClick={() => setDaireIndex(di)}
                  className={`rounded-xl border p-2.5 text-left cursor-pointer ${
                    active
                      ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200'
                      : 'border-stone-200 bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <p className="text-[9px] font-bold text-stone-400 uppercase">
                    {tipForIndex(di, blok)}
                  </p>
                  <p className="text-sm font-black text-stone-900">{no}</p>
                  <div className="mt-1.5 h-1 rounded-full bg-stone-200 overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${y}%` }} />
                  </div>
                  <p className="text-[9px] font-bold text-stone-500 mt-0.5">%{y}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seçili daire çalışma alanı */}
        <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase text-violet-700 flex items-center gap-1">
                <Home size={12} /> Seçili daire
              </p>
              <h3 className="text-lg font-black text-stone-900">
                {blok} · {daireNo}
                <span className="text-stone-400 font-bold text-sm ml-2">{tip}</span>
              </h3>
              <p className="text-xs text-stone-500">
                Fiili %{daireYuzde}
                {analiz.toplam
                  ? ` · ${analiz.tamam} tamam / ${analiz.imalat} imalatta / ${analiz.planli} plan`
                  : ' · henüz kalem işlenmedi — oda seçin'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAnalizAcik(true)}
                className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[10px] font-black uppercase cursor-pointer"
              >
                Analiz
              </button>
            </div>
          </div>

          <svg viewBox="0 0 100 100" className="w-full rounded-xl border border-stone-300 bg-white">
            {plan.map((oda) => {
              const y = odaYuzde(oda.key);
              const isGiris = oda.key === 'giris';
              const active = odaKey === oda.key;
              return (
                <g
                  key={oda.key}
                  className="cursor-pointer"
                  onClick={() => setOdaKey(oda.key)}
                >
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
            Odaya tıklayın → kalem kalem kontrol + hedef görsel
          </p>
        </div>
      </div>

      {/* Oda detay + hedef görsel */}
      {seciliOda && seciliOda.key !== 'giris' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2 shadow-sm">
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
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {odaKalemleri.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 space-y-1.5"
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
                    placeholder="Eksik / kontrol notu…"
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

          <div className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2 shadow-sm">
            <p className="text-[10px] font-black uppercase text-stone-500 flex items-center gap-1">
              <ImageIcon size={12} /> Hedef görünüm (iç mimari)
            </p>
            {hedefGorseller.length === 0 ? (
              <p className="text-xs text-stone-400 italic py-8 text-center">
                Bu parsel için görsel yok.
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

      {/* İş programı */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <p className="text-[10px] font-black uppercase text-emerald-900">İş programı</p>
          <p className="text-[11px] text-emerald-900/80">
            {seciliOda && seciliOda.key !== 'giris'
              ? `${seciliOda.label} içindeki açık kalemler`
              : 'Önce oda seçin — o odanın eksikleri programa alınır'}
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

      {/* Analiz modal */}
      {analizAcik && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-stone-100 bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-700">Daire analizi</p>
                <h3 className="text-base font-black text-stone-900">
                  {blok} · {daireNo}
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
              <p className="text-xs text-stone-600">
                Tamam {analiz.tamam} · İmalatta {analiz.imalat} · Plan {analiz.planli} · Notlu{' '}
                {analiz.notlu}
              </p>
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
