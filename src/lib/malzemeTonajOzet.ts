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
  ton: number;
  micirAdet: number;
  micirTon: number;
  tasTozuAdet: number;
  tasTozuTon: number;
  stabilizeAdet: number;
  stabilizeTon: number;
  digerAdet: number;
  digerTon: number;
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
    ton: 0,
    micirAdet: 0,
    micirTon: 0,
    tasTozuAdet: 0,
    tasTozuTon: 0,
    stabilizeAdet: 0,
    stabilizeTon: 0,
    digerAdet: 0,
    digerTon: 0,
  };
}

export function fmtTon(n: number): string {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
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
    const ton = Number(it.ton) || 0;
    const kg = Number(it.kg) || (ton ? ton * 1000 : 0);
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
    ay.ton += ton;
    if (tip === 'MICIR') {
      ay.micirAdet += 1;
      ay.micirTon += ton;
    } else if (tip === 'TAS_TOZU') {
      ay.tasTozuAdet += 1;
      ay.tasTozuTon += ton;
    } else if (tip === 'STABILIZE') {
      ay.stabilizeAdet += 1;
      ay.stabilizeTon += ton;
    } else {
      ay.digerAdet += 1;
      ay.digerTon += ton;
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
      pay: toplamTon > 0 ? (b.ton / toplamTon) * 100 : 0,
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

export function malzemeOzetHtml(ozet: MalzemeOzet): string {
  const cards = ozet.byTip
    .filter((t) => t.adet > 0 || t.ton > 0)
    .map((t) => {
      const bg =
        t.tip === 'MICIR'
          ? '#d1fae5'
          : t.tip === 'TAS_TOZU'
            ? '#e7e5e4'
            : t.tip === 'STABILIZE'
              ? '#fef3c7'
              : '#e2e8f0';
      return `<div style="flex:1;min-width:160px;padding:12px 14px;border-radius:12px;background:${bg};border:1px solid #cbd5e1">
        <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#334155">${t.label}</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:4px">${fmtTon(t.ton)} <span style="font-size:12px;font-weight:700">ton</span></div>
        <div style="font-size:11px;color:#475569;margin-top:4px">${t.adet} irsaliye · ${t.plakaAdet} plaka · pay %${t.pay.toFixed(1)}</div>
        <div style="font-size:11px;color:#475569">${t.faturali} faturalı · ${t.bekleyen} bekleyen · ${fmtTon(t.kg)} kg</div>
      </div>`;
    })
    .join('');

  const ayRows = ozet.aylar
    .map(
      (a) => `<tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0">${a.ayLabel}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${a.adet}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-weight:700">${fmtTon(a.ton)}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${a.micirAdet} / ${fmtTon(a.micirTon)}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${a.tasTozuAdet} / ${fmtTon(a.tasTozuTon)}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${a.stabilizeAdet} / ${fmtTon(a.stabilizeTon)}</td>
      </tr>`
    )
    .join('');

  const evrak =
    ozet.evrakTipleri.length > 0
      ? `<p style="font-size:12px;color:#334155;margin:8px 0 0">${ozet.evrakTipleri
          .map((e) => `${e.tip}: <strong>${e.adet}</strong>`)
          .join(' · ')}</p>`
      : '';

  return `<section style="margin-bottom:22px">
    <h2 style="margin:0 0 10px;font-size:14px;color:#1e3a8a">Malzeme özeti — Mıcır / Taş Tozu / Stabilize</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#334155">
      ${ozet.toplamAdet} kayıt · <strong>${fmtTon(ozet.toplamTon)} ton</strong> · ${fmtTon(ozet.toplamKg)} kg
      · ${ozet.plakaAdet} farklı plaka · ${ozet.faturali} faturalı / ${ozet.bekleyen} bekleyen
      · dönem ${ozet.ilkTarih} — ${ozet.sonTarih}
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">${cards}</div>
    ${evrak}
    ${
      ozet.aylar.length
        ? `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:12px">
      <thead><tr style="background:#1e3a8a;color:#fff">
        <th style="padding:7px 8px;text-align:left">Ay</th>
        <th style="padding:7px 8px;text-align:right">Adet</th>
        <th style="padding:7px 8px;text-align:right">Toplam ton</th>
        <th style="padding:7px 8px;text-align:right">Mıcır (adet / ton)</th>
        <th style="padding:7px 8px;text-align:right">Taş Tozu (adet / ton)</th>
        <th style="padding:7px 8px;text-align:right">Stabilize (adet / ton)</th>
      </tr></thead>
      <tbody>${ayRows}</tbody>
    </table>`
        : ''
    }
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
  opts?: { kayitAdet?: number; irsaliyeAdet?: number }
): number {
  let row = startRow;
  const kayit = opts?.kayitAdet ?? ozet.toplamAdet;
  const irsAdet = opts?.irsaliyeAdet ?? ozet.toplamAdet;

  ws.mergeCells(row, 1, row, 9);
  ws.getCell(row, 1).value = 'GENEL — MALZEME ÖZETİ (Mıcır / Taş Tozu / Stabilize ayrı)';
  ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  const genel: Array<[string, string | number]> = [
    ['Toplam geçmiş kayıt', kayit],
    ['İrsaliye adedi', irsAdet],
    ['Toplam ağırlık (ton)', Number(ozet.toplamTon.toFixed(3))],
    ['Toplam ağırlık (kg)', Number(ozet.toplamKg.toFixed(1))],
    ['Dönem (ilk — son)', `${ozet.ilkTarih} — ${ozet.sonTarih}`],
    ['Farklı plaka', ozet.plakaAdet],
    ['Faturalı', ozet.faturali],
    ['Fatura bekleyen', ozet.bekleyen],
    ['Onaylı', ozet.onayli],
  ];
  for (const [label, val] of genel) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, size: 10 };
    ws.mergeCells(row, 2, row, 4);
    ws.getCell(row, 2).value = val;
    ws.getCell(row, 2).font = { size: 10, bold: label.includes('Toplam') };
    if (label.includes('Toplam')) fillCell(ws.getCell(row, 2), 'FFDBEAFE');
    row += 1;
  }
  row += 1;

  ws.mergeCells(row, 1, row, 8);
  ws.getCell(row, 1).value = 'MALZEME TİPLERİ — TONAJ AYRI';
  ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  const tipHeaders = ['Malzeme', 'Adet', 'Ton', 'Kg', 'Pay %', 'Faturalı', 'Bekleyen', 'Plaka'];
  tipHeaders.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    fillCell(c, 'FF1E3A8A');
    borderCell(c);
  });
  row += 1;

  for (const t of ozet.byTip) {
    if (t.adet === 0 && t.ton === 0) continue;
    const vals: Array<string | number> = [
      t.label,
      t.adet,
      Number(t.ton.toFixed(3)),
      Number(t.kg.toFixed(1)),
      Number(t.pay.toFixed(1)),
      t.faturali,
      t.bekleyen,
      t.plakaAdet,
    ];
    vals.forEach((val, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = val;
      c.font = { size: 9, bold: i <= 2 };
      fillCell(c, TIP_FILL[t.tip]);
      borderCell(c);
    });
    row += 1;
  }
  row += 1;

  ws.mergeCells(row, 1, row, 9);
  ws.getCell(row, 1).value = 'AYLIK DÖKÜM';
  ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  const ayHeaders = [
    'Ay',
    'Adet',
    'Toplam ton',
    'Mıcır adet',
    'Mıcır ton',
    'Taş tozu adet',
    'Taş tozu ton',
    'Stabilize adet',
    'Stabilize ton',
  ];
  ayHeaders.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    fillCell(c, 'FF1E3A8A');
    borderCell(c);
  });
  row += 1;
  for (const a of ozet.aylar) {
    const vals: Array<string | number> = [
      a.ayLabel,
      a.adet,
      Number(a.ton.toFixed(3)),
      a.micirAdet,
      Number(a.micirTon.toFixed(3)),
      a.tasTozuAdet,
      Number(a.tasTozuTon.toFixed(3)),
      a.stabilizeAdet,
      Number(a.stabilizeTon.toFixed(3)),
    ];
    vals.forEach((val, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = val;
      c.font = { size: 9, bold: i === 2 };
      borderCell(c);
      if (i === 3 || i === 4) fillCell(c, 'FFD1FAE5');
      if (i === 5 || i === 6) fillCell(c, 'FFE7E5E4');
      if (i === 7 || i === 8) fillCell(c, 'FFFEF3C7');
    });
    row += 1;
  }

  if (ozet.evrakTipleri.length) {
    row += 1;
    ws.mergeCells(row, 1, row, 4);
    ws.getCell(row, 1).value = 'EVRAK TİPİ DÖKÜMÜ';
    ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
    row += 1;
    ['Evrak tipi', 'Adet'].forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      fillCell(c, 'FF1E3A8A');
      borderCell(c);
    });
    row += 1;
    for (const e of ozet.evrakTipleri) {
      ws.getCell(row, 1).value = e.tip;
      ws.getCell(row, 2).value = e.adet;
      ws.getCell(row, 1).font = { size: 9 };
      ws.getCell(row, 2).font = { size: 9, bold: true };
      borderCell(ws.getCell(row, 1));
      borderCell(ws.getCell(row, 2));
      row += 1;
    }
  }

  return row;
}
