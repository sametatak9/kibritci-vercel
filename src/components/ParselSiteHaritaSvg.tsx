import React from 'react';
import type { BlokHaritaOzet } from '../lib/projeBlokHaritaUtils';
import type { ParselSiteLayout } from '../data/parselSiteHaritaSeed';

type Katman = 'blok' | 'altyapi' | 'peyzaj' | 'yol';

type Props = {
  layout: ParselSiteLayout;
  blokOzetleri: BlokHaritaOzet[];
  seciliBlok: string | null;
  onBlokSec: (blok: string) => void;
  katmanlar: Record<Katman, boolean>;
  altyapiYuzde?: number;
  peyzajYuzde?: number;
  compact?: boolean;
};

function blokRenk(yuzde: number, secili: boolean): string {
  if (secili) return '#f59e0b';
  if (yuzde >= 100) return '#059669';
  if (yuzde >= 50) return '#10b981';
  if (yuzde > 0) return '#f97316';
  return '#e7e5e4';
}

export const ParselSiteHaritaSvg: React.FC<Props> = ({
  layout,
  blokOzetleri,
  seciliBlok,
  onBlokSec,
  katmanlar,
  altyapiYuzde = 0,
  peyzajYuzde = 0,
  compact,
}) => {
  const ozetMap = new Map(blokOzetleri.map((b) => [b.profil.blok, b]));

  return (
    <div className={`relative w-full ${compact ? '' : 'min-h-[200px]'}`}>
      <svg
        viewBox={layout.viewBox}
        className="w-full h-auto block"
        role="img"
        aria-label={`${layout.kisaAd} parsel haritası`}
      >
        <rect x="0" y="0" width="100" height="88" fill="#f5f5f4" rx="2" />

        {katmanlar.peyzaj &&
          layout.peyzaj.map((p) => (
            <g key={p.id} opacity={0.35 + (peyzajYuzde / 100) * 0.45}>
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                fill="#86efac"
                stroke="#4ade80"
                strokeWidth="0.3"
                rx="1"
              />
              {!compact && (
                <text x={p.x + 1} y={p.y + 2.8} fontSize="2.2" fill="#14532d" fontWeight="700">
                  {p.baslik}
                </text>
              )}
            </g>
          ))}

        {katmanlar.yol && layout.yol && (
          <rect
            x={layout.yol.x}
            y={layout.yol.y}
            width={layout.yol.w}
            height={layout.yol.h}
            fill="#d6d3d1"
            stroke="#a8a29e"
            strokeWidth="0.4"
            rx={layout.yol.rx ?? 1}
          />
        )}

        {katmanlar.altyapi &&
          layout.altyapi.map((h) => (
            <polyline
              key={h.id}
              points={h.points}
              fill="none"
              stroke="#0284c7"
              strokeWidth={0.8 + (altyapiYuzde / 100) * 0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45 + (altyapiYuzde / 100) * 0.5}
            />
          ))}

        {katmanlar.blok &&
          layout.bloklar.map((b) => {
            const oz = ozetMap.get(b.blok);
            const yuzde = oz?.genelYuzde ?? 0;
            const secili = seciliBlok === b.blok;
            const fill = blokRenk(yuzde, secili);
            return (
              <g
                key={b.blok}
                className="cursor-pointer"
                onClick={() => onBlokSec(b.blok)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onBlokSec(b.blok);
                }}
              >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill={fill}
                  stroke={secili ? '#0c0a09' : '#78716c'}
                  strokeWidth={secili ? 1.2 : 0.5}
                  rx="1.5"
                />
                <rect
                  x={b.x}
                  y={b.y + b.h - 2.5}
                  width={(b.w * yuzde) / 100}
                  height={2.5}
                  fill="#1c1917"
                  opacity={0.35}
                  rx="0.5"
                />
                <text
                  x={b.x + b.w / 2}
                  y={b.y + b.h / 2 - 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={b.blok.length > 2 ? 4.5 : 5.5}
                  fontWeight="800"
                  fill={secili || yuzde > 40 ? '#0c0a09' : '#44403c'}
                >
                  {b.blok}
                </text>
                <text
                  x={b.x + b.w / 2}
                  y={b.y + b.h / 2 + 4}
                  textAnchor="middle"
                  fontSize="3.2"
                  fontWeight="700"
                  fill="#57534e"
                >
                  %{yuzde}
                </text>
              </g>
            );
          })}
      </svg>
      {!compact && (
        <p className="mt-1 text-[9px] text-stone-500 leading-snug">{layout.kaynakNot}</p>
      )}
    </div>
  );
};

export default ParselSiteHaritaSvg;
