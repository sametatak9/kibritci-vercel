/**
 * Kuşbakışı daire planı — duvar / kapı / mobilya silüeti + kamera kaydı.
 * Tip şema koordinatları (0–100) üzerine mimari okuma katmanı.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CDaireOdaSablon } from '../data/parsel15751CBlokSeed';

type Props = {
  plan: CDaireOdaSablon[];
  odaKey: string | null;
  yuzdeFor: (key: string) => number;
  onSelect: (key: string | null) => void;
  daireNo: string;
  tip: string;
};

function almost(a: number, b: number, e = 1.6) {
  return Math.abs(a - b) < e;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useAnimatedViewBox(target: [number, number, number, number], dur = 720) {
  const [vb, setVb] = useState(target);
  const cur = useRef(target);
  const key = target.join(',');
  useEffect(() => {
    const from = cur.current;
    const to = key.split(',').map(Number) as [number, number, number, number];
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = easeOut(t);
      const next: [number, number, number, number] = [
        from[0] + (to[0] - from[0]) * e,
        from[1] + (to[1] - from[1]) * e,
        from[2] + (to[2] - from[2]) * e,
        from[3] + (to[3] - from[3]) * e,
      ];
      cur.current = next;
      setVb(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, dur]);
  return vb;
}

function floorFill(key: string): string {
  if (key.startsWith('yatak')) return '#e4d2b0';
  if (key === 'salon') return '#d9c4a2';
  if (key === 'mutfak') return '#efe8dc';
  if (key === 'islak') return '#d2e0e6';
  if (key === 'hol') return '#cfc4b4';
  if (key === 'balkon') return '#b7c9b0';
  return '#d6d3d1';
}

function tint(hex: string, yuzde: number): string {
  if (yuzde <= 0) return hex;
  if (yuzde >= 100) return '#bbd5c4';
  if (yuzde >= 40) return '#e4d7b0';
  return hex;
}

type Edge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  axis: 'H' | 'V';
};

function sharedEdge(a: CDaireOdaSablon, b: CDaireOdaSablon): Edge | null {
  const aR = a.x + a.w;
  const aB = a.y + a.h;
  const bR = b.x + b.w;
  const bB = b.y + b.h;
  if (almost(aR, b.x)) {
    const y1 = Math.max(a.y, b.y);
    const y2 = Math.min(aB, bB);
    if (y2 - y1 > 7) return { x1: aR, y1, x2: aR, y2, axis: 'V' };
  }
  if (almost(bR, a.x)) {
    const y1 = Math.max(a.y, b.y);
    const y2 = Math.min(aB, bB);
    if (y2 - y1 > 7) return { x1: bR, y1, x2: bR, y2, axis: 'V' };
  }
  if (almost(aB, b.y)) {
    const x1 = Math.max(a.x, b.x);
    const x2 = Math.min(aR, bR);
    if (x2 - x1 > 7) return { x1, y1: aB, x2, y2: aB, axis: 'H' };
  }
  if (almost(bB, a.y)) {
    const x1 = Math.max(a.x, b.x);
    const x2 = Math.min(aR, bR);
    if (x2 - x1 > 7) return { x1, y1: bB, x2, y2: bB, axis: 'H' };
  }
  return null;
}

function doorAt(edge: Edge, width = 7) {
  const mx = (edge.x1 + edge.x2) / 2;
  const my = (edge.y1 + edge.y2) / 2;
  const hw = width / 2;
  if (edge.axis === 'V') {
    return {
      gap: { x: mx - 0.7, y: my - hw, w: 1.4, h: width },
      hinge: { x: mx, y: my - hw },
      swing: `M ${mx} ${my - hw} A ${width} ${width} 0 0 1 ${mx + width} ${my - hw}`,
    };
  }
  return {
    gap: { x: mx - hw, y: my - 0.7, w: width, h: 1.4 },
    hinge: { x: mx - hw, y: my },
    swing: `M ${mx - hw} ${my} A ${width} ${width} 0 0 1 ${mx - hw} ${my + width}`,
  };
}

function Mobilya({ oda }: { oda: CDaireOdaSablon }) {
  const { x, y, w, h, key } = oda;
  const m = Math.min(2.4, w * 0.08, h * 0.08);
  if (key.startsWith('yatak')) {
    const bw = Math.min(w - m * 2, h > w ? w * 0.55 : 16);
    const bh = Math.min(h - m * 2, 22);
    const bx = x + (w - bw) / 2;
    const by = y + m + 1;
    return (
      <g opacity="0.9">
        <rect x={bx} y={by} width={bw} height={bh} rx="1.2" fill="#c4a574" stroke="#8b6914" strokeWidth="0.35" />
        <rect x={bx + 0.8} y={by + 0.7} width={bw * 0.42} height={3.2} rx="0.7" fill="#efe6d6" />
        <rect x={bx + bw * 0.52} y={by + 0.7} width={bw * 0.42} height={3.2} rx="0.7" fill="#efe6d6" />
        <rect x={x + m} y={y + h - m - 3.2} width={3.2} height={3.2} rx="0.4" fill="#a16207" />
        <rect x={x + w - m - 3.2} y={y + h - m - 3.2} width={3.2} height={3.2} rx="0.4" fill="#a16207" />
      </g>
    );
  }
  if (key === 'salon') {
    return (
      <g opacity="0.88">
        <rect x={x + m} y={y + m} width={w * 0.42} height={5.5} rx="1.2" fill="#7c6a56" />
        <rect x={x + m} y={y + m} width={5.5} height={h * 0.48} rx="1.2" fill="#7c6a56" />
        <ellipse cx={x + w * 0.42} cy={y + h * 0.42} rx={4.2} ry={3.2} fill="#b45309" opacity="0.55" />
        <rect x={x + w - m - 11} y={y + m} width={11} height={1.6} rx="0.3" fill="#292524" />
      </g>
    );
  }
  if (key === 'mutfak') {
    return (
      <g opacity="0.9">
        <rect x={x + 0.8} y={y + h - 6.5} width={w - 1.6} height={5.6} rx="0.4" fill="#a8a29e" />
        <rect x={x + w - 6.4} y={y + 0.8} width={5.6} height={h - 1.6} rx="0.4" fill="#a8a29e" />
        <rect x={x + 1.6} y={y + h - 5.6} width={4.4} height={3.4} rx="0.3" fill="#78716c" />
        <circle cx={x + 8.4} cy={y + h - 3.9} r="1.1" fill="#38bdf8" opacity="0.7" />
        <rect x={x + w - 5.6} y={y + 1.6} width={4} height={7} rx="0.3" fill="#57534e" />
      </g>
    );
  }
  if (key === 'islak') {
    return (
      <g opacity="0.9">
        <rect x={x + m} y={y + m} width={w * 0.42} height={w * 0.42} rx="0.4" fill="#e0f2fe" stroke="#0284c7" strokeWidth="0.35" />
        <line x1={x + m} y1={y + m} x2={x + m + w * 0.42} y2={y + m + w * 0.42} stroke="#7dd3fc" strokeWidth="0.3" />
        <ellipse cx={x + w - m - 3.2} cy={y + h - m - 4} rx="2.1" ry="2.8" fill="#fafaf9" stroke="#a8a29e" strokeWidth="0.3" />
        <rect x={x + w - m - 6.5} y={y + m} width={5.8} height={2.6} rx="0.4" fill="#fafaf9" stroke="#a8a29e" strokeWidth="0.3" />
      </g>
    );
  }
  if (key === 'hol') {
    return (
      <g opacity="0.7">
        <rect x={x + w * 0.35} y={y + 2} width={w * 0.3} height={h - 4} rx="0.4" fill="#a8a29e" />
      </g>
    );
  }
  if (key === 'balkon') {
    return (
      <g>
        <rect
          x={x + 0.6}
          y={y + 0.6}
          width={w - 1.2}
          height={h - 1.2}
          fill="url(#balkonHatch)"
          stroke="#4d7c0f"
          strokeWidth="0.45"
        />
        <line x1={x + 1} y1={y + 2.2} x2={x + w - 1} y2={y + 2.2} stroke="#3f6212" strokeWidth="0.5" />
      </g>
    );
  }
  return null;
}

export const DaireKusbakisiPlan: React.FC<Props> = ({
  plan,
  odaKey,
  yuzdeFor,
  onSelect,
  daireNo,
  tip,
}) => {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const odalar = plan.filter((o) => o.key !== 'giris');
  const giris = plan.find((o) => o.key === 'giris');
  const hol = plan.find((o) => o.key === 'hol');
  const focusKey = odaKey && odaKey !== 'giris' ? odaKey : null;
  const focus = odalar.find((o) => o.key === focusKey);

  const targetVb = useMemo((): [number, number, number, number] => {
    if (!focus) return [-4, -6, 108, 110];
    const pad = 11;
    const x = Math.max(-4, focus.x - pad);
    const y = Math.max(-6, focus.y - pad);
    const w = Math.min(108 - x, focus.w + pad * 2);
    const h = Math.min(110 - y, focus.h + pad * 2);
    return [x, y, Math.max(w, 36), Math.max(h, 36)];
  }, [focus]);

  const vb = useAnimatedViewBox(targetVb);
  const cx = focus ? focus.x + focus.w / 2 : 50;
  const tiltZ = focus ? ((cx - 50) / 50) * 6 : -5;
  const tiltX = focus ? 22 : 16;

  const doors = useMemo(() => {
    const out: { key: string; edge: Edge }[] = [];
    const publicRooms = plan.filter((o) => o.key === 'hol' || o.key === 'salon' || o.key === 'mutfak');
    for (const oda of odalar) {
      if (oda.key === 'balkon') continue;
      let best: Edge | null = null;
      for (const pub of publicRooms) {
        if (pub.key === oda.key) continue;
        const e = sharedEdge(oda, pub);
        if (e) {
          best = e;
          if (pub.key === 'hol') break;
        }
      }
      if (best) out.push({ key: oda.key, edge: best });
    }
    return out;
  }, [odalar, plan]);

  const walkD = useMemo(() => {
    if (!focus || !giris) return '';
    const pts: string[] = [`${giris.x + giris.w / 2},${giris.y}`];
    if (hol && focus.key !== 'hol') {
      pts.push(`${hol.x + hol.w / 2},${hol.y + hol.h / 2}`);
    }
    pts.push(`${focus.x + focus.w / 2},${focus.y + focus.h / 2}`);
    return `M ${pts[0]} ` + pts.slice(1).map((p) => `L ${p}`).join(' ');
  }, [focus, giris, hol]);

  const outer = useMemo(() => {
    const xs = odalar.map((o) => o.x);
    const ys = odalar.map((o) => o.y);
    const x2 = odalar.map((o) => o.x + o.w);
    const y2 = odalar.map((o) => o.y + o.h);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...x2) - x, h: Math.max(...y2) - y };
  }, [odalar]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
          Kuşbakışı yerleşim · tıklayınca odaya yaklaşır
        </p>
        {focus && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[10px] font-black uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
          >
            Tüm daire
          </button>
        )}
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-stone-700/40 shadow-lg"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, #f4efe6 0%, #d7cbb8 55%, #c4b49a 100%)',
          perspective: '1400px',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(68,64,60,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(68,64,60,0.08) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div
          className="relative px-2 pt-3 pb-4"
          style={{
            transform: `rotateX(${tiltX}deg) rotateZ(${tiltZ}deg)`,
            transformOrigin: '50% 70%',
            transition: 'transform 0.75s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <svg
            viewBox={`${vb[0]} ${vb[1]} ${vb[2]} ${vb[3]}`}
            className="w-full h-auto drop-shadow-2xl"
            style={{ minHeight: 400 }}
          >
            <defs>
              <pattern id="balkonHatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="3" stroke="#65a30d" strokeWidth="0.6" />
              </pattern>
              <pattern id="woodGrain" width="8" height="4" patternUnits="userSpaceOnUse">
                <rect width="8" height="4" fill="#e4d2b0" />
                <path d="M0 2 Q4 1 8 2" fill="none" stroke="#c4a574" strokeWidth="0.25" opacity="0.5" />
              </pattern>
              <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="0" dy="1.4" stdDeviation="1.2" floodOpacity="0.28" />
              </filter>
              <linearGradient id="wallTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#57534e" />
                <stop offset="100%" stopColor="#292524" />
              </linearGradient>
            </defs>

            {/* zemin gölgesi */}
            <rect
              x={outer.x + 1.5}
              y={outer.y + 2.2}
              width={outer.w}
              height={outer.h}
              rx="1.5"
              fill="#1c1917"
              opacity="0.18"
            />

            {/* dış kütle */}
            <rect
              x={outer.x - 1.3}
              y={outer.y - 1.3}
              width={outer.w + 2.6}
              height={outer.h + 2.6}
              rx="1.2"
              fill="url(#wallTop)"
              filter="url(#softShadow)"
            />

            {odalar.map((oda) => {
              const yuzde = yuzdeFor(oda.key);
              const active = odaKey === oda.key;
              const hover = hoverKey === oda.key;
              return (
                <g
                  key={oda.key}
                  className="cursor-pointer"
                  onClick={() => onSelect(active ? null : oda.key)}
                  onMouseEnter={() => setHoverKey(oda.key)}
                  onMouseLeave={() => setHoverKey(null)}
                >
                  <rect
                    x={oda.x}
                    y={oda.y}
                    width={oda.w}
                    height={oda.h}
                    fill={oda.key.startsWith('yatak') || oda.key === 'salon' ? 'url(#woodGrain)' : tint(floorFill(oda.key), yuzde)}
                    stroke={active ? '#f59e0b' : hover ? '#44403c' : '#44403c'}
                    strokeWidth={active ? 1.15 : 0.55}
                    style={{
                      transition: 'stroke 0.25s ease, filter 0.35s ease',
                      filter: active ? 'url(#softShadow)' : undefined,
                    }}
                  />
                  {yuzde > 0 && (
                    <rect
                      x={oda.x}
                      y={oda.y + oda.h - 1.6}
                      width={(oda.w * yuzde) / 100}
                      height="1.6"
                      fill={yuzde >= 100 ? '#059669' : '#d97706'}
                      opacity="0.85"
                    />
                  )}
                  <Mobilya oda={oda} />
                  <text
                    x={oda.x + oda.w / 2}
                    y={oda.y + oda.h / 2 - (oda.h > 16 ? 1.2 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={oda.w < 22 ? 2.4 : 2.9}
                    fontWeight="800"
                    fill="#1c1917"
                    opacity="0.92"
                    style={{ pointerEvents: 'none' }}
                  >
                    {oda.label}
                  </text>
                  <text
                    x={oda.x + oda.w / 2}
                    y={oda.y + oda.h / 2 + 3.1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2.2"
                    fontWeight="700"
                    fill="#57534e"
                    style={{ pointerEvents: 'none' }}
                  >
                    %{yuzde}
                  </text>
                </g>
              );
            })}

            {/* kapı boşlukları + kanat yayları */}
            {doors.map(({ key, edge }) => {
              const d = doorAt(edge);
              return (
                <g key={`door-${key}`}>
                  <rect
                    x={d.gap.x}
                    y={d.gap.y}
                    width={d.gap.w}
                    height={d.gap.h}
                    fill={floorFill(key.startsWith('yatak') ? 'yatak1' : key === 'islak' ? 'islak' : 'hol')}
                  />
                  <path
                    d={d.swing}
                    fill="none"
                    stroke="#78716c"
                    strokeWidth="0.35"
                    strokeDasharray="1.1 0.7"
                    opacity="0.85"
                  />
                </g>
              );
            })}

            {/* pencereler — dış kenar */}
            {odalar
              .filter((o) => o.key !== 'hol' && o.key !== 'islak')
              .map((o) => {
                const top = almost(o.y, outer.y);
                if (!top) return null;
                const wx = o.x + o.w * 0.28;
                const ww = o.w * 0.44;
                return (
                  <g key={`win-${o.key}`}>
                    <rect x={wx} y={o.y - 1.5} width={ww} height="1.3" rx="0.2" fill="#7dd3fc" stroke="#0e7490" strokeWidth="0.25" />
                    <line x1={wx + ww / 2} y1={o.y - 1.5} x2={wx + ww / 2} y2={o.y - 0.2} stroke="#155e75" strokeWidth="0.2" />
                  </g>
                );
              })}

            {giris && (
              <g>
                <rect x={giris.x} y={giris.y - 0.4} width={giris.w} height={giris.h + 1.2} rx="0.4" fill="#1c1917" />
                <text
                  x={giris.x + giris.w / 2}
                  y={giris.y + 3.2}
                  textAnchor="middle"
                  fontSize="2.1"
                  fontWeight="800"
                  fill="#fafaf9"
                >
                  GİRİŞ
                </text>
              </g>
            )}

            {walkD && focus && (
              <g key={focus.key}>
                <path
                  d={walkD}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="0.9"
                  strokeDasharray="2.2 1.4"
                  opacity="0.95"
                  strokeLinecap="round"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="24"
                    to="0"
                    dur="1.1s"
                    fill="freeze"
                  />
                </path>
                <circle r="1.35" fill="#1c1917" stroke="#fafaf9" strokeWidth="0.35">
                  <animateMotion dur="1.25s" fill="freeze" rotate="auto" path={walkD} />
                </circle>
              </g>
            )}
          </svg>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/25 to-transparent" />
        <div className="absolute left-3 bottom-3 rounded-lg bg-stone-900/75 px-2 py-1 text-[10px] font-black text-white">
          {daireNo} · {tip} · kuşbakışı
        </div>
        <div className="absolute right-3 bottom-3 text-[9px] font-bold uppercase tracking-widest text-stone-700/80">
          Kuzey ↑
        </div>
      </div>
      <p className="text-[10px] text-stone-500 text-center font-semibold">
        Odaya gelince kamera yaklaşır · kesik çizgi girişten yürüyüş · kapı kanatları iş kalemini hayal etmek için
      </p>
    </div>
  );
};

export default DaireKusbakisiPlan;
