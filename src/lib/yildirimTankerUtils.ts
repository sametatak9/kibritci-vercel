import { CariKart, CariKartIslem, Fatura, YildirimTankerFis } from '../types/erp';
import { saveDocument } from './firebase';

export const YILDIRIM_TANKER_UNVAN = 'YILDIRIM TANKER';

/** Unvan normalize — karşılaştırma için */
export function normalizeFirmaUnvan(name?: string | null): string {
  return String(name || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isYildirimTankerFirma(name?: string | null): boolean {
  const n = normalizeFirmaUnvan(name);
  return n.includes('YILDIRIM') && n.includes('TANKER');
}

export function findYildirimTankerCari(cariKartlar: CariKart[]): CariKart | undefined {
  return (cariKartlar || []).find((c) => isYildirimTankerFirma(c.unvan));
}

/** Yoksa Yıldırım Tanker cari kartını oluşturur (vidanjör Şeker cari gibi) */
export async function ensureYildirimTankerCari(
  cariKartlar: CariKart[],
  setCariKartlar?: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void
): Promise<CariKart> {
  const existing = findYildirimTankerCari(cariKartlar);
  if (existing) return existing;

  const created: CariKart = {
    id: `cari_yildirim_tk_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CAR-YT-${Date.now().toString().slice(-6)}`,
    unvan: YILDIRIM_TANKER_UNVAN,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'Yıldırım Tanker su teslimatı — tesisatçı fişlerinden otomatik oluşturuldu.',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Sistem tarafından Yıldırım Tanker irsaliye onayında oluşturuldu. Fatura kontrolünde irsaliye toplamları bu cari altında toplanır.',
  };
  await saveDocument('cariKartlar', created);
  setCariKartlar?.((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
  return created;
}

export function buildYildirimCariIslem(options: {
  fisId: string;
  irsaliyeId: string;
  cariKartId: string;
  fisNo: string;
  tarih: string;
  icme: number;
  sanayi: number;
  damaca: number;
}): CariKartIslem {
  const { fisId, irsaliyeId, cariKartId, fisNo, tarih, icme, sanayi, damaca } = options;
  return {
    id: `cari_islem_yt_${fisId}`,
    cariKartId,
    islemTipi: 'IRSALIYE',
    islemId: irsaliyeId,
    islemBaslik: 'Yıldırım Tanker İrsaliyesi',
    islemDetay: `${fisNo} · içme ${icme} · sanayi ${sanayi} · damaca ${damaca}`,
    tarih,
    belgeNo: fisNo,
  };
}

export function vibrateYildirimAlert(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([220, 80, 220, 80, 320]);
    }
  } catch {
    /* ignore */
  }
}

export function filterYildirimFislerByMonth(
  fisler: YildirimTankerFis[],
  year: number,
  month: number
): YildirimTankerFis[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return (fisler || []).filter((f) => String(f.tarih || '').startsWith(prefix));
}

export function sumYildirimSular(fisler: YildirimTankerFis[]): {
  icme: number;
  sanayi: number;
  damaca: number;
  toplam: number;
} {
  let icme = 0;
  let sanayi = 0;
  let damaca = 0;
  for (const f of fisler || []) {
    icme += Number(f.icmeSuyuAdet) || 0;
    sanayi += Number(f.sanayiSuyuAdet) || 0;
    damaca += Number(f.damacaAdet) || 0;
  }
  return { icme, sanayi, damaca, toplam: icme + sanayi + damaca };
}

export function enerjiTuruLabel(turu: string): string {
  if (turu === 'ELEKTRIK') return 'Elektrik';
  if (turu === 'SU') return 'Su';
  if (turu === 'DOGALGAZ') return 'Doğalgaz';
  return turu;
}

export function enerjiTuruBirim(turu: string): string {
  if (turu === 'ELEKTRIK') return 'kWh';
  return 'm³';
}

export function filterFaturalarByCariMonth(
  faturalar: Fatura[],
  year: number,
  month: number,
  firmaUnvan: string
): Fatura[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const target = normalizeFirmaUnvan(firmaUnvan);
  return (faturalar || []).filter((f) => {
    if (!String(f.tarih || '').startsWith(prefix)) return false;
    return (
      normalizeFirmaUnvan(f.cariUnvan).includes(target) ||
      target.includes(normalizeFirmaUnvan(f.cariUnvan)) ||
      isYildirimTankerFirma(f.cariUnvan)
    );
  });
}

/** Fatura kalemlerinden su/tanker/damaca adet toplamı */
export function faturaYildirimAdedi(fatura: Fatura): number {
  const kalemler = fatura.kalemler || [];
  if (kalemler.length === 0) return 0;
  const suLike = kalemler.filter((k) => {
    const ad = String(k.urunAdi || '').toLocaleLowerCase('tr-TR');
    return (
      ad.includes('içme') ||
      ad.includes('icme') ||
      ad.includes('sanayi') ||
      ad.includes('damaca') ||
      ad.includes('tanker') ||
      ad.includes('su') ||
      ad.includes('adet')
    );
  });
  const pool = suLike.length > 0 ? suLike : kalemler;
  return pool.reduce((s, k) => s + (Number(k.miktar) || 0), 0);
}

export type YildirimEslesmeSonuc = {
  fisToplam: number;
  fisIcme: number;
  fisSanayi: number;
  fisDamaca: number;
  faturaToplam: number;
  fark: number;
  uyumlu: boolean;
  faturaSayisi: number;
};

/** Onaylı Yıldırım fişleri ↔ ayın faturaları (Şeker Vidanjör çekim eşleşmesi gibi) */
export function compareYildirimFatura(
  fisler: YildirimTankerFis[],
  faturalar: Fatura[],
  yil: number,
  ay: number,
  cariUnvan = YILDIRIM_TANKER_UNVAN
): YildirimEslesmeSonuc {
  const monthFis = filterYildirimFislerByMonth(fisler, yil, ay).filter(
    (f) => !f.durum || f.durum === 'ONAYLANDI'
  );
  const monthFat = filterFaturalarByCariMonth(faturalar, yil, ay, cariUnvan);
  const sums = sumYildirimSular(monthFis);
  const faturaToplam = monthFat.reduce((s, f) => s + faturaYildirimAdedi(f), 0);
  const fark = sums.toplam - faturaToplam;
  return {
    fisToplam: sums.toplam,
    fisIcme: sums.icme,
    fisSanayi: sums.sanayi,
    fisDamaca: sums.damaca,
    faturaToplam,
    fark,
    uyumlu: monthFat.length === 0 ? true : Math.abs(fark) < 0.001,
    faturaSayisi: monthFat.length,
  };
}
