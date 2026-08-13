/**
 * Kibritçi İnşaat T cetveli — şantiyeye gelen (giriş) ve giden (çıkış) evrak defteri.
 */
import type { CariKart, Fatura, HazirTutanak, Irsaliye } from '../types/erp';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { irsaliyeHizmetMiktari, isTaslakMaliBagFatura } from './evrakDonusum';

export type TCetveliYon = 'GIRIS' | 'CIKIS';

export type TCetveliEvrakTipi = 'İRSALİYE' | 'FATURA' | 'TESLİM' | 'SEVK';

export type TCetveliSatir = {
  id: string;
  yon: TCetveliYon;
  tarih: string;
  evrakTipi: TCetveliEvrakTipi;
  belgeNo: string;
  muhatap: string;
  ozet: string;
  tutar: number;
  miktar: number;
  miktarEtiket: string;
};

export type TCetveliDefter = {
  giris: TCetveliSatir[];
  cikis: TCetveliSatir[];
  girisAdet: number;
  cikisAdet: number;
  girisTutar: number;
  cikisTutar: number;
};

function inRange(tarih: string, start?: string, end?: string): boolean {
  const k = normalizeDateKey(tarih) || String(tarih || '');
  if (!k) return !start && !end;
  if (start && k < start) return false;
  if (end && k > end) return false;
  return true;
}

function matchesQuery(row: TCetveliSatir, q: string): boolean {
  if (!q) return true;
  const hay = `${row.belgeNo} ${row.muhatap} ${row.ozet} ${row.evrakTipi}`.toLocaleLowerCase('tr-TR');
  return hay.includes(q);
}

function sortRows(rows: TCetveliSatir[]): TCetveliSatir[] {
  return [...rows].sort((a, b) => {
    const d = String(a.tarih).localeCompare(String(b.tarih));
    if (d !== 0) return d;
    return String(a.belgeNo).localeCompare(String(b.belgeNo), 'tr');
  });
}

function cariTipi(cariKartlar: CariKart[], id?: string): CariKart['kartTipi'] | '' {
  if (!id) return '';
  return cariKartlar.find((c) => c.id === id)?.kartTipi || '';
}

function irsaliyeSatir(ir: Irsaliye): TCetveliSatir {
  const h = irsaliyeHizmetMiktari(ir);
  const kalem = (ir.kalemler || []).length;
  return {
    id: `ir:${ir.id}`,
    yon: 'GIRIS',
    tarih: normalizeDateKey(ir.tarih) || String(ir.tarih || ''),
    evrakTipi: 'İRSALİYE',
    belgeNo: String(ir.irsaliyeNo || ir.fisNo || ir.id),
    muhatap: String(ir.firma || '—'),
    ozet: [
      ir.onayDurumu,
      ir.plaka,
      h.miktar > 0 ? `${h.miktar.toLocaleString('tr-TR')} ${h.etiket}` : '',
      kalem ? `${kalem} kalem` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    tutar: 0,
    miktar: h.miktar || 0,
    miktarEtiket: h.etiket || '',
  };
}

function faturaSatir(ft: Fatura, yon: TCetveliYon): TCetveliSatir {
  return {
    id: `ft:${ft.id}`,
    yon,
    tarih: normalizeDateKey(ft.tarih) || String(ft.tarih || ''),
    evrakTipi: 'FATURA',
    belgeNo: String(ft.faturaNo || ft.id),
    muhatap: String(ft.cariUnvan || '—'),
    ozet: `${(ft.kalemler || []).length} kalem · ${ft.durum || ''}`.trim(),
    tutar: Number(ft.genelToplam ?? ft.toplamTutar ?? 0) || 0,
    miktar: 0,
    miktarEtiket: '',
  };
}

function tutanakSatir(t: HazirTutanak): TCetveliSatir | null {
  const tip = String(t.tutanakTipi || '').toLocaleUpperCase('tr-TR');
  if (tip !== 'TESLİM' && tip !== 'TESLIM' && tip !== 'SEVK') return null;
  const evrakTipi: TCetveliEvrakTipi = tip === 'SEVK' ? 'SEVK' : 'TESLİM';
  const kalem = (t.kalemler || []).length;
  return {
    id: `tt:${t.id}`,
    yon: 'CIKIS',
    tarih: normalizeDateKey(t.tarih) || String(t.tarih || ''),
    evrakTipi,
    belgeNo: String(t.belgeNo || t.id),
    muhatap: String(t.taseronAdi || t.muhatapPersonel || t.teslimAlan || '—'),
    ozet: [t.konu, kalem ? `${kalem} kalem` : '', t.durum].filter(Boolean).join(' · '),
    tutar: Number(t.cezaTutari) || 0,
    miktar: kalem,
    miktarEtiket: kalem ? 'kalem' : '',
  };
}

/** Kibritçi T cetveli: giriş = gelen irsaliye/alış faturası · çıkış = teslim/sevk + satış faturası */
export function buildTCetveliDefteri(input: {
  irsaliyeler?: Irsaliye[];
  faturalar?: Fatura[];
  hazirTutanaklar?: HazirTutanak[];
  cariKartlar?: CariKart[];
  startDate?: string;
  endDate?: string;
  query?: string;
}): TCetveliDefter {
  const cariler = input.cariKartlar || [];
  const q = String(input.query || '').trim().toLocaleLowerCase('tr-TR');
  const start = input.startDate ? normalizeDateKey(input.startDate) : '';
  const end = input.endDate ? normalizeDateKey(input.endDate) : '';

  const giris: TCetveliSatir[] = [];
  const cikis: TCetveliSatir[] = [];

  for (const ir of input.irsaliyeler || []) {
    const row = irsaliyeSatir(ir);
    if (!inRange(row.tarih, start, end) || !matchesQuery(row, q)) continue;
    giris.push(row);
  }

  for (const ft of input.faturalar || []) {
    if (isTaslakMaliBagFatura(ft)) continue;
    const tip = cariTipi(cariler, ft.cariKartId);
    const yon: TCetveliYon = tip === 'ALICI' ? 'CIKIS' : 'GIRIS';
    const row = faturaSatir(ft, yon);
    if (!inRange(row.tarih, start, end) || !matchesQuery(row, q)) continue;
    if (yon === 'CIKIS') cikis.push(row);
    else giris.push(row);
  }

  for (const t of input.hazirTutanaklar || []) {
    if (String(t.durum || '').toLocaleUpperCase('tr-TR') === 'İPTAL') continue;
    const row = tutanakSatir(t);
    if (!row || !inRange(row.tarih, start, end) || !matchesQuery(row, q)) continue;
    cikis.push(row);
  }

  const g = sortRows(giris);
  const c = sortRows(cikis);
  return {
    giris: g,
    cikis: c,
    girisAdet: g.length,
    cikisAdet: c.length,
    girisTutar: g.reduce((s, r) => s + r.tutar, 0),
    cikisTutar: c.reduce((s, r) => s + r.tutar, 0),
  };
}

export function tCetveliDonemLabel(start?: string, end?: string): string {
  if (!start && !end) return 'Tüm dönem';
  const a = start ? formatDateLabelTr(start) : '…';
  const b = end ? formatDateLabelTr(end) : '…';
  return `${a} — ${b}`;
}
