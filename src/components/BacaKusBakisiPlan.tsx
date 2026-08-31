import React, { useMemo } from 'react';
import type {
  TemizlikBaca,
  TemizlikBacaTespit,
  TemizlikBacaUygulama,
} from '../types/erp';
import {
  deriveKartDurum,
  parselKisaAd,
  sumYevmiye,
  type BacaKoridorTanimi,
} from '../lib/temizlikKirimUtils';

type Props = {
  parsel: string;
  koridorlar: BacaKoridorTanimi[];
  bacalar: TemizlikBaca[];
  tespitler: TemizlikBacaTespit[];
  uygulamalar: TemizlikBacaUygulama[];
  selectedId?: string | null;
  onSelect: (bacaId: string) => void;
};

function nestFill(durum: string): string {
  if (durum === 'TAMAMLANDI') return '#0f766e';
  if (durum === 'UYGULAMA_DEVAM') return '#d97706';
  if (durum === 'PLANLANDI') return '#ca8a04';
  return '#94a3b8';
}

/** Kuş bakışı parsel şeması — bacalar yuva olarak; tıklanınca kart açılır */
export const BacaKusBakisiPlan: React.FC<Props> = ({
  parsel,
  koridorlar,
  bacalar,
  tespitler,
  uygulamalar,
  selectedId,
  onSelect,
}) => {
  const layout = useMemo(() => {
    const bandH = 118;
    const pad = 28;
    const width = 920;
    const height = pad * 2 + koridorlar.length * bandH;
    const nests: Array<{
      id: string;
      x: number;
      y: number;
      label: string;
      durum: string;
      tespit: boolean;
    }> = [];
    const blocks: Array<{ x: number; y: number; w: number; h: number; label: string }> = [];

    koridorlar.forEach((k, ki) => {
      const y0 = pad + ki * bandH;
      const bloklar = (k.bloklar || []).filter(Boolean);
      const bw = bloklar.length ? Math.min(88, (width - 160) / Math.max(bloklar.length, 1) - 8) : 72;
      bloklar.forEach((b, bi) => {
        blocks.push({
          x: 132 + bi * (bw + 10),
          y: y0 + 28,
          w: bw,
          h: 44,
          label: b,
        });
      });
      const mine = bacalar.filter((row) => (row.koridor || '') === k.id);
      mine.forEach((baca, i) => {
        const t = [...tespitler]
          .filter((x) => x.bacaId === baca.id)
          .sort((a, c) => String(c.tarih || '').localeCompare(String(a.tarih || '')))[0];
        const u = uygulamalar.filter((x) => x.bacaId === baca.id);
        const durum = deriveKartDurum({
          hasTespit: Boolean(t),
          planlananYevmiye: Number(t?.planlananYevmiye || 0),
          harcananYevmiye: sumYevmiye(u),
          uygulamalar: u.map((row) => ({ durum: row.durum })),
        });
        const col = bloklar.length
          ? Math.min(i, Math.max(0, bloklar.length - 1))
          : i;
        const x =
          132 +
          col * (bw + 10) +
          bw / 2 +
          (baca.konumTipi === 'BLOK_ARKASI' ? 0 : baca.konumTipi === 'BLOK_ONU' ? 0 : 8) +
          (i % 3) * 10 -
          10;
        const y =
          y0 +
          (baca.konumTipi === 'BLOK_ARKASI' ? 18 : baca.konumTipi === 'AVLU' ? 58 : baca.konumTipi === 'MERDIVEN' ? 86 : 18);
        nests.push({
          id: baca.id,
          x,
          y,
          label: baca.etiket,
          durum,
          tespit: Boolean(t),
        });
      });
    });

    return { width, height, bandH, pad, nests, blocks };
  }, [koridorlar, bacalar, tespitler, uygulamalar]);

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-amber-100 flex justify-between items-center">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-amber-800">Kuş bakışı baca planı</p>
          <p className="text-[11px] text-slate-600">
            {parselKisaAd(parsel)} — yuvalar tespit + proje yerleşimi. Tıklayınca kart açılır.
          </p>
        </div>
        <div className="flex gap-2 text-[8px] font-black uppercase text-slate-500">
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Tespit yok</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Plan / iş</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-teal-700 inline-block" /> Bitti</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="w-full min-w-[640px] h-auto">
          <rect x="0" y="0" width={layout.width} height={layout.height} fill="#f8fafc" />
          {koridorlar.map((k, ki) => {
            const y0 = layout.pad + ki * layout.bandH;
            return (
              <g key={k.id}>
                <rect x="12" y={y0} width={layout.width - 24} height={layout.bandH - 10} rx="16" fill="#fff7ed" stroke="#fed7aa" />
                <text x="24" y={y0 + 22} fill="#9a3412" fontSize="11" fontWeight="800">
                  {k.baslik}
                </text>
                <text x="24" y={y0 + 36} fill="#78716c" fontSize="9">
                  {k.aciklama}
                </text>
              </g>
            );
          })}
          {layout.blocks.map((b) => (
            <g key={`${b.label}_${b.x}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill="#fff" stroke="#cbd5e1" />
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0f172a">
                {b.label}
              </text>
            </g>
          ))}
          {layout.nests.map((n) => {
            const selected = n.id === selectedId;
            return (
              <g
                key={n.id}
                onClick={() => onSelect(n.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={selected ? 14 : 11}
                  fill={nestFill(n.durum)}
                  stroke={selected ? '#0f172a' : '#fff'}
                  strokeWidth={selected ? 3 : 2}
                />
                <circle cx={n.x} cy={n.y} r={4} fill={n.tespit ? '#fff' : 'transparent'} stroke="#fff" strokeWidth="1.5" />
                <text x={n.x} y={n.y + 22} textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default BacaKusBakisiPlan;
