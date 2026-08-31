import React from 'react';
import { ArrowRight, Building2, Package, Link2, Unlink } from 'lucide-react';

export type ZincirAktif = 'satin_alma' | 'irsaliye' | 'fatura';

type Props = {
  aktif: ZincirAktif;
  cariBagli: boolean;
  cariAdi?: string;
  stokLinked: number;
  stokTotal: number;
  /** Küçük özet metrikler (ör. bağımsız sayı) */
  metrics?: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'neutral' }[];
};

const STEPS: { id: ZincirAktif; label: string; short: string; accent: string; soft: string }[] = [
  {
    id: 'satin_alma',
    label: 'Satın Alma',
    short: 'SA',
    accent: 'bg-slate-900 text-white border-slate-900',
    soft: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    id: 'irsaliye',
    label: 'İrsaliye',
    short: 'İR',
    accent: 'bg-emerald-700 text-white border-emerald-700',
    soft: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  },
  {
    id: 'fatura',
    label: 'Fatura',
    short: 'FT',
    accent: 'bg-blue-700 text-white border-blue-700',
    soft: 'bg-blue-50 text-blue-800 border-blue-100',
  },
];

/**
 * SA → İrsaliye → Fatura zinciri + cari/stok bağ durumu.
 * Mevcut ERP diline uyumlu görsel band.
 */
export const EvrakZincirBanner: React.FC<Props> = ({
  aktif,
  cariBagli,
  cariAdi,
  stokLinked,
  stokTotal,
  metrics = [],
}) => {
  const stokOk = stokTotal > 0 && stokLinked === stokTotal;
  const stokPartial = stokTotal > 0 && stokLinked > 0 && stokLinked < stokTotal;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-stone-100 shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 20%, rgba(15,23,42,0.06) 0, transparent 42%), radial-gradient(circle at 88% 10%, rgba(5,150,105,0.08) 0, transparent 38%), radial-gradient(circle at 70% 90%, rgba(29,78,216,0.07) 0, transparent 40%)',
        }}
      />
      <div className="relative p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Evrak · Cari · Stok zinciri
            </p>
            <p className="text-sm font-bold text-slate-900 leading-snug">
              Sipariş → sevk irsaliyesi → fatura aynı cari/stok kartlarına bağlanır.
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {STEPS.map((step, idx) => {
              const isActive = step.id === aktif;
              return (
                <React.Fragment key={step.id}>
                  {idx > 0 && (
                    <ArrowRight
                      className="w-3.5 h-3.5 text-slate-300 shrink-0 hidden sm:block"
                      aria-hidden
                    />
                  )}
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold tracking-wide transition ${
                      isActive ? step.accent + ' shadow-sm scale-[1.02]' : step.soft
                    }`}
                  >
                    <span className="font-mono opacity-80">{step.short}</span>
                    <span>{step.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <div
            className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
              cariBagli
                ? 'bg-emerald-50/80 border-emerald-200'
                : 'bg-amber-50/80 border-amber-200'
            }`}
          >
            <Building2
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                cariBagli ? 'text-emerald-700' : 'text-amber-700'
              }`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {cariBagli ? (
                  <Link2 className="w-3 h-3 text-emerald-700" />
                ) : (
                  <Unlink className="w-3 h-3 text-amber-700" />
                )}
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-700">
                  Cari kart
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                {cariBagli
                  ? cariAdi || 'Eşleşti'
                  : cariAdi
                    ? `"${cariAdi}" kartta yok — kayıtta önerilir`
                    : 'Firma seçince eşleşir'}
              </p>
            </div>
          </div>

          <div
            className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
              stokOk
                ? 'bg-emerald-50/80 border-emerald-200'
                : stokPartial
                  ? 'bg-sky-50/80 border-sky-200'
                  : stokTotal > 0
                    ? 'bg-amber-50/80 border-amber-200'
                    : 'bg-white/70 border-slate-200'
            }`}
          >
            <Package
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                stokOk
                  ? 'text-emerald-700'
                  : stokPartial
                    ? 'text-sky-700'
                    : stokTotal > 0
                      ? 'text-amber-700'
                      : 'text-slate-500'
              }`}
            />
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-700">
                Stok eşleşmesi
              </span>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                {stokTotal === 0
                  ? 'Kalem eklenince stok kartı aranır'
                  : `${stokLinked}/${stokTotal} kalem stok kartına bağlı`}
              </p>
            </div>
          </div>

          {metrics.map((m) => (
            <div
              key={m.label}
              className={`rounded-xl border px-3 py-2.5 bg-white/70 ${
                m.tone === 'warn'
                  ? 'border-amber-200'
                  : m.tone === 'ok'
                    ? 'border-emerald-200'
                    : 'border-slate-200'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                {m.label}
              </span>
              <p
                className={`text-sm font-bold mt-0.5 tabular-nums ${
                  m.tone === 'warn'
                    ? 'text-amber-800'
                    : m.tone === 'ok'
                      ? 'text-emerald-800'
                      : 'text-slate-900'
                }`}
              >
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
