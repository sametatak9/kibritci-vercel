import React, { useMemo, useState } from 'react';
import { Building2, Calendar, HardHat, Layers, Map, Users } from 'lucide-react';
import { formatDateLabelTr } from '../lib/dateKeyUtils';
import {
  BlokHaritaOzet,
  IMALAT_ASAMALARI,
  KaynakHavuzu,
  formatTahminiBitisLabel,
  parselGenelOzet,
} from '../lib/projeBlokHaritaUtils';
import { HARITA_PARSEL_LIST, siteLayoutForParsel } from '../data/parselSiteHaritaSeed';
import { ParselSiteHaritaSvg } from './ParselSiteHaritaSvg';
import type { ProjeImalatAsama } from '../types/erp';

type Props = {
  parsel: string;
  parselSecenek: string[];
  blokOzetleri: BlokHaritaOzet[];
  /** Tüm parseller — genel harita için */
  tumBlokOzetleri?: BlokHaritaOzet[];
  kaynakHavuzlari: KaynakHavuzu[];
  altyapiYuzde?: number;
  peyzajYuzde?: number;
  parselDisiplinOzeti?: Record<string, { altyapi: number; peyzaj: number }>;
  onParselChange: (p: string) => void;
};

function IsometricBlok({ ozet, secili, onClick }: { ozet: BlokHaritaOzet; secili: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left rounded-xl border p-2.5 transition cursor-pointer ${
        secili ? 'border-amber-500 bg-amber-50/80 shadow-md ring-2 ring-amber-300' : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-stone-400">Blok</p>
          <p className="text-base font-black text-stone-900">{ozet.profil.blok}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black tabular-nums text-stone-900">{ozet.genelYuzde}%</p>
        </div>
      </div>
      <div className="mt-2 flex justify-center perspective-[600px]">
        <div className="relative w-16 transition-transform group-hover:scale-105" style={{ transform: 'rotateX(12deg) rotateY(-18deg)' }}>
          <div className="flex flex-col-reverse gap-0.5 p-0.5 rounded-md border border-stone-300 bg-gradient-to-b from-stone-100 to-stone-200">
            {ozet.katKatmanlari.map((k) => (
              <div
                key={k.katNo}
                title={`Kat ${k.katNo}: %${k.yuzde}`}
                className="h-2 rounded-sm border border-white/40"
                style={{
                  background: `linear-gradient(90deg, ${k.renk} ${k.yuzde}%, #e2e8f0 ${k.yuzde}%)`,
                  opacity: k.yuzde > 0 ? 1 : 0.55,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-0.5 text-[8px] font-bold text-stone-600">
        <span>{ozet.profil.katSayisi} kat</span>
        <span>{ozet.fiiliDaireSayisi} daire</span>
      </div>
    </button>
  );
}

export const ProjeBlokHaritaPanel: React.FC<Props> = ({
  parsel,
  parselSecenek,
  blokOzetleri,
  tumBlokOzetleri = [],
  kaynakHavuzlari,
  altyapiYuzde = 0,
  peyzajYuzde = 0,
  parselDisiplinOzeti = {},
  onParselChange,
}) => {
  const [seciliBlok, setSeciliBlok] = useState<string | null>(null);
  const [gorunum, setGorunum] = useState<'genel' | 'parsel'>('parsel');
  const [katmanlar, setKatmanlar] = useState({
    blok: true,
    altyapi: true,
    peyzaj: true,
    yol: true,
  });

  const genel = useMemo(() => parselGenelOzet(blokOzetleri), [blokOzetleri]);
  const detay = useMemo(
    () => blokOzetleri.find((b) => b.profil.blok === seciliBlok) || null,
    [blokOzetleri, seciliBlok]
  );
  const siteLayout = siteLayoutForParsel(parsel);

  const genelParselKartlari = useMemo(() => {
    const kaynak = tumBlokOzetleri.length ? tumBlokOzetleri : blokOzetleri;
    return HARITA_PARSEL_LIST.map((p) => {
      const rows = kaynak.filter((b) => b.profil.parsel === p);
      const oz = parselGenelOzet(rows);
      const dis = parselDisiplinOzeti[p] || { altyapi: 0, peyzaj: 0 };
      return { parsel: p, kisa: p.replace('Parsel Bölge ', ''), oz, dis };
    });
  }, [tumBlokOzetleri, blokOzetleri, parselDisiplinOzeti]);

  const taseronHavuz = kaynakHavuzlari.filter((k) => k.firmaTipi === 'TASERON').slice(0, 8);
  const anaFirma = kaynakHavuzlari.filter((k) => k.firmaTipi === 'ANA_FIRMA');

  const katmanToggle = (key: keyof typeof katmanlar) =>
    setKatmanlar((k) => ({ ...k, [key]: !k[key] }));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-sky-50 via-white to-amber-50/30 p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-900/70">
              Mekan · Blok haritası · 3 parsel
            </p>
            <h2 className="text-lg font-black text-stone-900">Neredeyiz → Nereye</h2>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
              {(
                [
                  ['genel', 'Genel harita'],
                  ['parsel', 'Parsel detay'],
                ] as const
              ).map(([id, lab]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGorunum(id)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase cursor-pointer ${
                    gorunum === id ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>
            {gorunum === 'parsel' && (
              <select
                value={parsel}
                onChange={(e) => {
                  onParselChange(e.target.value);
                  setSeciliBlok(null);
                }}
                className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-semibold"
              >
                {parselSecenek.map((p) => (
                  <option key={p} value={p}>
                    {p.replace('Parsel Bölge ', '')}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase text-stone-500">Fiili ilerleme</p>
            <p className="text-xl font-black tabular-nums text-emerald-800">{genel.genelYuzde}%</p>
            <p className="text-[9px] text-stone-500">{genel.blokSayisi} blok</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase text-stone-500">Punch kapanış</p>
            <p className="text-xl font-black tabular-nums text-amber-800">{genel.planYuzde}%</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase text-stone-500">Altyapı (parsel)</p>
            <p className="text-xl font-black tabular-nums text-sky-800">{altyapiYuzde}%</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase text-stone-500">Peyzaj (parsel)</p>
            <p className="text-xl font-black tabular-nums text-green-800">{peyzajYuzde}%</p>
          </div>
        </div>
      </div>

      {gorunum === 'genel' ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {genelParselKartlari.map(({ parsel: p, kisa, oz, dis }) => {
            const layout = siteLayoutForParsel(p);
            const rows = (tumBlokOzetleri.length ? tumBlokOzetleri : blokOzetleri).filter(
              (b) => b.profil.parsel === p
            );
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onParselChange(p);
                  setGorunum('parsel');
                  setSeciliBlok(null);
                }}
                className="text-left rounded-2xl border border-stone-200 bg-white p-3 shadow-sm hover:border-sky-400 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-black text-stone-900 flex items-center gap-1">
                    <Map size={14} className="text-sky-600" />
                    Parsel {kisa}
                  </p>
                  <span className="text-lg font-black tabular-nums text-emerald-800">%{oz.genelYuzde}</span>
                </div>
                {layout && (
                  <ParselSiteHaritaSvg
                    layout={layout}
                    blokOzetleri={rows}
                    seciliBlok={null}
                    onBlokSec={() => {}}
                    katmanlar={{ blok: true, altyapi: true, peyzaj: true, yol: true }}
                    altyapiYuzde={dis.altyapi}
                    peyzajYuzde={dis.peyzaj}
                    compact
                  />
                )}
                <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-bold text-stone-600">
                  <span>{oz.blokSayisi} blok</span>
                  <span>Alt. %{dis.altyapi}</span>
                  <span>Pey. %{dis.peyzaj}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
                <Map size={12} /> Yerleşim haritası · {parsel.replace('Parsel Bölge ', '')}
              </p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['blok', 'Blok'],
                    ['yol', 'Yol'],
                    ['altyapi', 'Altyapı'],
                    ['peyzaj', 'Peyzaj'],
                  ] as const
                ).map(([k, lab]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => katmanToggle(k)}
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase cursor-pointer ${
                      katmanlar[k]
                        ? 'border-stone-800 bg-stone-800 text-white'
                        : 'border-stone-200 bg-white text-stone-500'
                    }`}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              {siteLayout ? (
                <ParselSiteHaritaSvg
                  layout={siteLayout}
                  blokOzetleri={blokOzetleri}
                  seciliBlok={seciliBlok}
                  onBlokSec={setSeciliBlok}
                  katmanlar={katmanlar}
                  altyapiYuzde={altyapiYuzde}
                  peyzajYuzde={peyzajYuzde}
                />
              ) : (
                <p className="text-sm text-stone-500 py-8 text-center">Bu parsel için yerleşim şeması yok.</p>
              )}
            </div>

            <p className="text-[10px] font-black uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
              <Building2 size={12} /> Kat katmanı (3D özet)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {blokOzetleri.map((b) => (
                <IsometricBlok
                  key={b.profil.id}
                  ozet={b}
                  secili={seciliBlok === b.profil.blok}
                  onClick={() => setSeciliBlok(b.profil.blok)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {detay ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm space-y-2">
                <p className="text-sm font-black text-stone-900">Blok {detay.profil.blok}</p>
                <div className="text-xs text-stone-600 space-y-0.5">
                  <p>
                    <Layers size={12} className="inline mr-1" />
                    {detay.profil.katSayisi} kat · {detay.fiiliDaireSayisi} daire
                  </p>
                  {detay.sonFaaliyetTarihi && (
                    <p>Son faaliyet: {formatDateLabelTr(detay.sonFaaliyetTarihi)}</p>
                  )}
                  {detay.acikPunch > 0 && (
                    <p className="text-rose-700 font-bold">{detay.acikPunch} açık punch</p>
                  )}
                </div>
                <div className="space-y-1">
                  {IMALAT_ASAMALARI.map((a) => {
                    const p = detay.asamaYuzdeleri[a.key as ProjeImalatAsama] || 0;
                    return (
                      <div key={a.key}>
                        <div className="flex justify-between text-[9px] font-bold text-stone-700">
                          <span>{a.label}</span>
                          <span>{p}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-stone-100 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${p}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-xs text-stone-500">
                Haritadan veya karttan blok seçin
              </div>
            )}

            <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
              <p className="text-[9px] font-black uppercase text-stone-500 flex items-center gap-1.5 mb-2">
                <Users size={11} /> Kaynak havuzu
              </p>
              {anaFirma.length > 0 && (
                <p className="text-[10px] font-bold text-stone-700 mb-1">
                  Ana firma: {anaFirma.reduce((s, k) => s + k.aktifPersonel, 0)} aktif
                </p>
              )}
              <ul className="space-y-1 max-h-40 overflow-y-auto text-[10px]">
                {taseronHavuz.map((k) => (
                  <li key={`${k.firmaTipi}_${k.firmaAdi}`} className="flex justify-between gap-2 border-b border-stone-50 pb-0.5">
                    <span className="font-semibold truncate">{k.firmaAdi}</span>
                    <span className="font-black shrink-0">{k.aktifPersonel}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-2 text-[9px] text-sky-950">
              <HardHat size={11} className="inline mr-1" />
              Yerleşim DWG/ruhsat özetidir; blok rengi fiili %, mavi hat altyapı, yeşil peyzaj katmanıdır.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjeBlokHaritaPanel;
