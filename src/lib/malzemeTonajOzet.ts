import type { Worksheet } from 'exceljs';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { malzemeTipiLabel, type MicirMalzemeTipi } from './micirUtils';

export type MalzemeOzetTip = MicirMalzemeTipi | 'DIGER';

export type MalzemeOzetKalem = {
  tip?: MicirMalzemeTipi | string | null;
  ton: number;
  kg?: number;
  faturali?: boolean;
  onayli?: boolean;
  plaka?: string;
  tarih?: string;
  evrakTipi?: string;
};

export type MalzemeTipOzet = {
  tip: MalzemeOzetTip;
  label: string;
  adet: number;
  ton: number;
  kg: number;
  faturali: number;
  bekleyen: number;
  onayli: number;
  plakaAdet: number;
  pay: number;
};

export type MalzemeAyOzet = {
  ayKey: string;
  ayLabel: string;
  adet: number;
  kg: number;
  micirAdet: number;
  micirKg: number;
  tasTozuAdet: number;
  tasTozuKg: number;
  stabilizeAdet: number;
  stabilizeKg: number;
  digerAdet: number;
  digerKg: number;
};

export type MalzemeOzet = {
  toplamAdet: number;
  toplamTon: number;
  toplamKg: number;
  faturali: number;
  bekleyen: number;
  onayli: number;
  plakaAdet: number;
  ilkTarih: string;
  sonTarih: string;
  byTip: MalzemeTipOzet[];
  aylar: MalzemeAyOzet[];
  evrakTipleri: Array<{ tip: string; adet: number }>;
};

const AY = [
  '',
  'OCAK',
  'ŞUBAT',
  'MART',
  'NİSAN',
  'MAYIS',
  'HAZİRAN',
  'TEMMUZ',
  'AĞUSTOS',
  'EYLÜL',
  'EKİM',
  'KASIM',
  'ARALIK',
];

const TIP_ORDER: MalzemeOzetTip[] = ['MICIR', 'TAS_TOZU', 'STABILIZE', 'DIGER'];

function tipOf(raw?: string | null): MalzemeOzetTip {
  const t = String(raw || '').toUpperCase();
  if (t === 'MICIR') return 'MICIR';
  if (t === 'TAS_TOZU') return 'TAS_TOZU';
  if (t === 'STABILIZE') return 'STABILIZE';
  return 'DIGER';
}

function tipLabel(tip: MalzemeOzetTip): string {
  if (tip === 'DIGER') return 'Diğer';
  return malzemeTipiLabel(tip);
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split('-');
  const ay = AY[Number(m)] || m;
  return y && m ? `${ay} ${y}` : 'Tarihsiz';
}

function emptyAy(ayKey: string): MalzemeAyOzet {
  return {
    ayKey,
    ayLabel: monthTitle(ayKey),
    adet: 0,
    kg: 0,
    micirAdet: 0,
    micirKg: 0,
    tasTozuAdet: 0,
    tasTozuKg: 0,
    stabilizeAdet: 0,
    stabilizeKg: 0,
    digerAdet: 0,
    digerKg: 0,
  };
}

export function fmtKg(n: number): string {
  return Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

export function computeMalzemeOzet(items: MalzemeOzetKalem[]): MalzemeOzet {
  const tipMap: Record<
    MalzemeOzetTip,
    { adet: number; ton: number; kg: number; faturali: number; bekleyen: number; onayli: number; plaka: Set<string> }
  > = {
    MICIR: { adet: 0, ton: 0, kg: 0, faturali: 0, bekleyen: 0, onayli: 0, plaka: new Set() },
    TAS_TOZU: { adet: 0, ton: 0, kg: 0, faturali: 0, bekleyen: 0, onayli: 0, plaka: new Set() },
    STABILIZE: { adet: 0, ton: 0, kg: 0, faturali: 0, bekleyen: 0, onayli: 0, plaka: new Set() },
    DIGER: { adet: 0, ton: 0, kg: 0, faturali: 0, bekleyen: 0, onayli: 0, plaka: new Set() },
  };
  const ayMap = new Map<string, MalzemeAyOzet>();
  const evrakMap = new Map<string, number>();
  const allPlaka = new Set<string>();
  let toplamTon = 0;
  let toplamKg = 0;
  let faturali = 0;
  let onayli = 0;
  let minDate = '';
  let maxDate = '';

  for (const it of items) {
    const tip = tipOf(it.tip);
    const rawTon = Number(it.ton) || 0;
    const kg = Number(it.kg) > 0 ? Number(it.kg) : rawTon > 0 ? rawTon * 1000 : 0;
    const ton = rawTon > 0 ? rawTon : kg > 0 ? kg / 1000 : 0;
    const bucket = tipMap[tip];
    bucket.adet += 1;
    bucket.ton += ton;
    bucket.kg += kg;
    if (it.faturali) {
      bucket.faturali += 1;
      faturali += 1;
    } else bucket.bekleyen += 1;
    if (it.onayli) {
      bucket.onayli += 1;
      onayli += 1;
    }
    const plaka = String(it.plaka || '').trim();
    if (plaka) {
      bucket.plaka.add(plaka);
      allPlaka.add(plaka);
    }
    toplamTon += ton;
    toplamKg += kg;

    const dk = normalizeDateKey(it.tarih || '') || '';
    if (dk) {
      if (!minDate || dk < minDate) minDate = dk;
      if (!maxDate || dk > maxDate) maxDate = dk;
    }
    const ym = dk ? dk.slice(0, 7) : '0000-00';
    const ay = ayMap.get(ym) || emptyAy(ym);
    ay.adet += 1;
    ay.kg += kg;
    if (tip === 'MICIR') {
      ay.micirAdet += 1;
      ay.micirKg += kg;
    } else if (tip === 'TAS_TOZU') {
      ay.tasTozuAdet += 1;
      ay.tasTozuKg += kg;
    } else if (tip === 'STABILIZE') {
      ay.stabilizeAdet += 1;
      ay.stabilizeKg += kg;
    } else {
      ay.digerAdet += 1;
      ay.digerKg += kg;
    }
    ayMap.set(ym, ay);

    const evrak = String(it.evrakTipi || '').trim();
    if (evrak) evrakMap.set(evrak, (evrakMap.get(evrak) || 0) + 1);
  }

  const byTip: MalzemeTipOzet[] = TIP_ORDER.map((tip) => {
    const b = tipMap[tip];
    return {
      tip,
      label: tipLabel(tip),
      adet: b.adet,
      ton: b.ton,
      kg: b.kg,
      faturali: b.faturali,
      bekleyen: b.bekleyen,
      onayli: b.onayli,
      plakaAdet: b.plaka.size,
      pay: toplamKg > 0 ? (b.kg / toplamKg) * 100 : 0,
    };
  });

  return {
    toplamAdet: items.length,
    toplamTon,
    toplamKg,
    faturali,
    bekleyen: Math.max(0, items.length - faturali),
    onayli,
    plakaAdet: allPlaka.size,
    ilkTarih: minDate ? formatDateLabelTr(minDate) : '—',
    sonTarih: maxDate ? formatDateLabelTr(maxDate) : '—',
    byTip,
    aylar: [...ayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v),
    evrakTipleri: [...evrakMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
      .map(([tip, adet]) => ({ tip, adet })),
  };
}

const MAIN_TIPS: MalzemeOzetTip[] = ['MICIR', 'STABILIZE', 'TAS_TOZU'];

export function malzemeOzetHtml(ozet: MalzemeOzet): string {
  const rows = MAIN_TIPS.map((tip) => ozet.byTip.find((t) => t.tip === tip) || {
    tip,
    label: tipLabel(tip),
    adet: 0,
    ton: 0,
    kg: 0,
    faturali: 0,
    bekleyen: 0,
    onayli: 0,
    plakaAdet: 0,
    pay: 0,
  });
  const cards = rows
    .map((t) => {
      const bg =
        t.tip === 'MICIR' ? '#d1fae5' : t.tip === 'TAS_TOZU' ? '#e7e5e4' : '#fef3c7';
      return `<div style="flex:1;min-width:180px;padding:14px 16px;border-radius:12px;background:${bg};border:1px solid #cbd5e1">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#334155">${t.label}</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:6px">${fmtKg(t.kg)} <span style="font-size:13px;font-weight:700">kg</span></div>
        <div style="font-size:12px;color:#475569;margin-top:4px">${t.adet} evrak</div>
      </div>`;
    })
    .join('');

  return `<section style="margin-bottom:22px">
    <h2 style="margin:0 0 10px;font-size:14px;color:#1e3a8a">Gelen kilo özeti</h2>
    <div style="display:flex;flex-wrap:wrap;gap:10px">${cards}</div>
  </section>`;
}

const TIP_FILL: Record<MalzemeOzetTip, string> = {
  MICIR: 'FFD1FAE5',
  TAS_TOZU: 'FFE7E5E4',
  STABILIZE: 'FFFEF3C7',
  DIGER: 'FFE2E8F0',
};

function fillCell(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function borderCell(cell: { border?: unknown }) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
}

export function writeMalzemeOzetSheetContent(
  ws: Worksheet,
  ozet: MalzemeOzet,
  startRow: number,
  _opts?: { kayitAdet?: number; irsaliyeAdet?: number }
): number {
  let row = startRow;
  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = 'GELEN KİLO';
  ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  ['Malzeme', 'Toplam kg', 'Evrak'].forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    fillCell(c, 'FF1E3A8A');
    borderCell(c);
  });
  row += 1;

  for (const tip of MAIN_TIPS) {
    const t = ozet.byTip.find((x) => x.tip === tip);
    const vals: Array<string | number> = [tipLabel(tip), Number((t?.kg || 0).toFixed(2)), t?.adet || 0];
    vals.forEach((val, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = val;
      c.font = { size: 11, bold: true };
      fillCell(c, TIP_FILL[tip]);
      borderCell(c);
    });
    row += 1;
  }
  return row;
}
