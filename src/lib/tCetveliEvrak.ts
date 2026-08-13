/**
 * Kibritçi İnşaat gelen evrak defteri — irsaliye ve alış faturası (kalem / hizmet takibi).
 */
import type { CariKart, Fatura, FaturaItem, HazirTutanak, Irsaliye, IrsaliyeItem } from '../types/erp';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { irsaliyeHizmetMiktari, isTaslakMaliBagFatura } from './evrakDonusum';

export type TCetveliYon = 'GIRIS' | 'CIKIS';

export type TCetveliEvrakTipi = 'İRSALİYE' | 'FATURA';

export type TCetveliKaynak = 'irsaliye' | 'fatura';

export type TCetveliKalem = {
  id: string;
  urunAdi: string;
  miktar: number;
  birim: string;
};

export type TCetveliSatir = {
  id: string;
  kaynak: TCetveliKaynak;
  kaynakId: string;
  yon: TCetveliYon;
  tarih: string;
  evrakTipi: TCetveliEvrakTipi;
  belgeNo: string;
  muhatap: string;
  ozet: string;
  tutar: number;
  miktar: number;
  miktarEtiket: string;
  plaka: string;
  durum: string;
  faturaNo: string;
  saId: string;
  kaynakEtiket: string;
  malzemeTipi: string;
  kalemler: TCetveliKalem[];
  hizmetOzet: string;
};

export type TCetveliDefter = {
  evraklar: TCetveliSatir[];
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
  const kalem = row.kalemler.map((k) => `${k.urunAdi} ${k.miktar} ${k.birim}`).join(' ');
  const hay = `${row.belgeNo} ${row.muhatap} ${row.ozet} ${row.evrakTipi} ${row.plaka} ${row.durum} ${row.faturaNo} ${row.hizmetOzet} ${row.kaynakEtiket} ${row.malzemeTipi} ${kalem}`.toLocaleLowerCase(
    'tr-TR'
  );
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

export function malzemeTipiEtiket(raw?: string): string {
  const u = String(raw || '').toUpperCase();
  if (u === 'MICIR') return 'Mıcır';
  if (u === 'STABILIZE') return 'Stabilize';
  if (u === 'TAS_TOZU') return 'Taş tozu';
  return String(raw || '').trim();
}

export function irsaliyeKaynakEtiket(ir: Irsaliye): string {
  if (ir.kaynak === 'VIDANJOR_FIS') return 'Vidanjör fişi';
  if (ir.kaynak === 'YILDIRIM_TANKER_FIS') return 'Yıldırım tanker';
  if (ir.kaynak === 'MICIR_STABILIZE_FIS') return 'Mıcır / stabilize';
  if (ir.kaynak === 'KAPI_EVRAK') return 'Kapı evrakı';
  return 'İrsaliye';
}

function mapIrsaliyeKalem(k: IrsaliyeItem): TCetveliKalem {
  return {
    id: k.id,
    urunAdi: String(k.urunAdi || '').trim(),
    miktar: Number(k.miktar) || 0,
    birim: String(k.birim || '').trim(),
  };
}

function mapFaturaKalem(k: FaturaItem): TCetveliKalem {
  return {
    id: k.id,
    urunAdi: String(k.urunAdi || '').trim(),
    miktar: Number(k.miktar) || 0,
    birim: String(k.birim || '').trim(),
  };
}

export function irsaliyeKalemListesi(ir: Irsaliye): TCetveliKalem[] {
  const fromItems = (ir.kalemler || []).map(mapIrsaliyeKalem).filter((k) => k.urunAdi || k.miktar);
  if (fromItems.length) return fromItems;

  const extra: TCetveliKalem[] = [];
  const malzeme = malzemeTipiEtiket(ir.malzemeTipi);
  const ton =
    Number(ir.tonaj) > 0
      ? Number(ir.tonaj)
      : Number(ir.kiloKg) > 0
        ? Math.round((Number(ir.kiloKg) / 1000) * 1000) / 1000
        : 0;
  if (ton > 0) {
    extra.push({
      id: `${ir.id}-tonaj`,
      urunAdi: malzeme || 'Malzeme',
      miktar: ton,
      birim: 'ton',
    });
  }
  if (Number(ir.cekimAdedi) > 0) {
    extra.push({
      id: `${ir.id}-cekim`,
      urunAdi: 'Vidanjör çekim',
      miktar: Number(ir.cekimAdedi),
      birim: 'çekim',
    });
  }
  if (Number(ir.icmeSuyuAdet) > 0) {
    extra.push({
      id: `${ir.id}-icme`,
      urunAdi: 'İçme suyu',
      miktar: Number(ir.icmeSuyuAdet),
      birim: 'adet',
    });
  }
  if (Number(ir.sanayiSuyuAdet) > 0) {
    extra.push({
      id: `${ir.id}-sanayi`,
      urunAdi: 'Sanayi suyu',
      miktar: Number(ir.sanayiSuyuAdet),
      birim: 'adet',
    });
  }
  if (Number(ir.damacaAdet) > 0) {
    extra.push({
      id: `${ir.id}-damaca`,
      urunAdi: 'Damacana',
      miktar: Number(ir.damacaAdet),
      birim: 'adet',
    });
  }
  return extra;
}

function kalemOzetSatir(k: TCetveliKalem): string {
  const miktar = k.miktar ? `${k.miktar.toLocaleString('tr-TR')} ${k.birim}`.trim() : k.birim;
  return [k.urunAdi, miktar].filter(Boolean).join(' · ');
}

function irsaliyeSatir(ir: Irsaliye): TCetveliSatir {
  const h = irsaliyeHizmetMiktari(ir);
  const kalemler = irsaliyeKalemListesi(ir);
  const hizmetOzet = kalemler.map(kalemOzetSatir).join(' | ') || (h.miktar > 0 ? `${h.miktar.toLocaleString('tr-TR')} ${h.etiket}` : '');
  return {
    id: `ir:${ir.id}`,
    kaynak: 'irsaliye',
    kaynakId: ir.id,
    yon: 'GIRIS',
    tarih: normalizeDateKey(ir.tarih) || String(ir.tarih || ''),
    evrakTipi: 'İRSALİYE',
    belgeNo: String(ir.irsaliyeNo || ir.fisNo || ir.id),
    muhatap: String(ir.firma || '—'),
    ozet: [
      ir.onayDurumu,
      ir.plaka,
      ir.faturaNo ? `Fatura ${ir.faturaNo}` : '',
      hizmetOzet,
    ]
      .filter(Boolean)
      .join(' · '),
    tutar: 0,
    miktar: h.miktar || 0,
    miktarEtiket: h.etiket || '',
    plaka: String(ir.plaka || ''),
    durum: String(ir.onayDurumu || ''),
    faturaNo: String(ir.faturaNo || ''),
    saId: String(ir.saId || ''),
    kaynakEtiket: irsaliyeKaynakEtiket(ir),
    malzemeTipi: malzemeTipiEtiket(ir.malzemeTipi),
    kalemler,
    hizmetOzet,
  };
}

function faturaSatir(ft: Fatura): TCetveliSatir {
  const kalemler = (ft.kalemler || []).map(mapFaturaKalem).filter((k) => k.urunAdi || k.miktar);
  const hizmetOzet = kalemler.map(kalemOzetSatir).join(' | ');
  return {
    id: `ft:${ft.id}`,
    kaynak: 'fatura',
    kaynakId: ft.id,
    yon: 'GIRIS',
    tarih: normalizeDateKey(ft.tarih) || String(ft.tarih || ''),
    evrakTipi: 'FATURA',
    belgeNo: String(ft.faturaNo || ft.id),
    muhatap: String(ft.cariUnvan || '—'),
    ozet: [ft.durum, hizmetOzet].filter(Boolean).join(' · '),
    tutar: Number(ft.genelToplam ?? ft.toplamTutar ?? 0) || 0,
    miktar: kalemler.reduce((s, k) => s + (k.miktar || 0), 0),
    miktarEtiket: kalemler[0]?.birim || 'kalem',
    plaka: '',
    durum: String(ft.durum || ''),
    faturaNo: String(ft.faturaNo || ''),
    saId: String(ft.saId || ''),
    kaynakEtiket: 'Alış faturası',
    malzemeTipi: '',
    kalemler,
    hizmetOzet,
  };
}

/** Gelen evrak: irsaliyeler + alış faturaları (satış / tutanak yok). */
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

  const evraklar: TCetveliSatir[] = [];

  for (const ir of input.irsaliyeler || []) {
    const row = irsaliyeSatir(ir);
    if (!inRange(row.tarih, start, end) || !matchesQuery(row, q)) continue;
    evraklar.push(row);
  }

  for (const ft of input.faturalar || []) {
    if (isTaslakMaliBagFatura(ft)) continue;
    if (cariTipi(cariler, ft.cariKartId) === 'ALICI') continue;
    const row = faturaSatir(ft);
    if (!inRange(row.tarih, start, end) || !matchesQuery(row, q)) continue;
    evraklar.push(row);
  }

  const g = sortRows(evraklar);
  return {
    evraklar: g,
    giris: g,
    cikis: [],
    girisAdet: g.length,
    cikisAdet: 0,
    girisTutar: g.reduce((s, r) => s + r.tutar, 0),
    cikisTutar: 0,
  };
}

export function tCetveliDonemLabel(start?: string, end?: string): string {
  if (!start && !end) return 'Tüm dönem';
  const a = start ? formatDateLabelTr(start) : '…';
  const b = end ? formatDateLabelTr(end) : '…';
  return `${a} — ${b}`;
}
