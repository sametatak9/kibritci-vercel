import type {
  AylikYoklamaMap,
  Fatura,
  Irsaliye,
  KampKaydi,
  KampOdasi,
  SatinAlmaTalebi,
} from '../types/erp';
import { findFaturalarForIrsaliye } from './evrakDonusum';
import {
  countChromePendingOnay,
  countStaleChromePendingOnay,
  isSatinAlmaPending,
} from './onayInboxUtils';
import { getYoklamaDay, setYoklamaDay } from './yoklamaUtils';

export type KampDolulukUyarisi = {
  tip: 'DOLU_ODA' | 'YUKSEK_DOLULUK' | 'YETIM_KAYIT';
  seviye: 'info' | 'warn' | 'critical';
  baslik: string;
  detay: string;
};

export type FaturasizIrsaliyeOzet = {
  id: string;
  irsaliyeNo: string;
  firma: string;
  tarih: string;
  gunGecikme: number;
};

function daysSince(isoDate?: string | null): number {
  const raw = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  const then = new Date(`${raw}T12:00:00`).getTime();
  const now = Date.now();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
}

/** Kamp: dolu odalar, yüksek doluluk, odası bozuk aktif kayıtlar. */
export function buildKampDolulukUyarilari(
  kampOdalari: KampOdasi[],
  kampKayitlari: KampKaydi[]
): KampDolulukUyarisi[] {
  const aktif = (kampKayitlari || []).filter((k) => k.durum === 'AKTIF');
  const byRoom = new Map<string, number>();
  for (const k of aktif) {
    const rid = k.odaId || k.roomId;
    if (!rid) continue;
    byRoom.set(rid, (byRoom.get(rid) || 0) + 1);
  }

  const uyarilar: KampDolulukUyarisi[] = [];
  const roomIds = new Set((kampOdalari || []).map((r) => r.id));

  let kapasite = 0;
  let dolu = 0;
  for (const room of kampOdalari || []) {
    const n = byRoom.get(room.id) || 0;
    kapasite += Number(room.kapasite || 0);
    dolu += n;
    if (n > 0 && n >= Number(room.kapasite || 0) && Number(room.kapasite || 0) > 0) {
      uyarilar.push({
        tip: 'DOLU_ODA',
        seviye: n > Number(room.kapasite || 0) ? 'critical' : 'warn',
        baslik: `Dolu oda · ${room.yerleskeAdi || '—'} / ${room.kogusNo || '—'} / ${room.odaNo}`,
        detay: `${n}/${room.kapasite} yatak`,
      });
    }
  }

  const yetim = aktif.filter((k) => {
    const rid = k.odaId || k.roomId;
    return !rid || !roomIds.has(rid);
  });
  if (yetim.length > 0) {
    uyarilar.push({
      tip: 'YETIM_KAYIT',
      seviye: 'critical',
      baslik: `${yetim.length} aktif yerleşim odasız / geçersiz`,
      detay: 'Kamp kaydı ile oda bağlantısı kopuk — yerleşimi kontrol edin',
    });
  }

  const pct = kapasite > 0 ? Math.round((dolu / kapasite) * 100) : 0;
  if (kapasite > 0 && pct >= 90) {
    uyarilar.push({
      tip: 'YUKSEK_DOLULUK',
      seviye: pct >= 98 ? 'critical' : 'warn',
      baslik: `Kamp doluluk %${pct}`,
      detay: `${dolu}/${kapasite} yatak dolu`,
    });
  }

  return uyarilar.slice(0, 12);
}

/** Faturaya bağlanmamış onaylı/aktif irsaliyeler (salt okunur mutabakat). */
export function listFaturasizIrsaliyeler(
  irsaliyeler: Irsaliye[],
  faturalar: Fatura[],
  minGun = 0
): FaturasizIrsaliyeOzet[] {
  return (irsaliyeler || [])
    .filter((ir) => {
      // Mıcır ay sonu mutabakatı ayrı; vidanjör/yıldırım güvenlik gibi SA→İrsaliye→Fatura döngüsüne dahil
      if (ir.kaynak === 'MICIR_STABILIZE_FIS') return false;
      const durum = String(ir.onayDurumu || '');
      if (durum.includes('RED')) return false;
      if (ir.faturaNo) return false;
      return findFaturalarForIrsaliye(ir, faturalar).length === 0;
    })
    .map((ir) => ({
      id: ir.id,
      irsaliyeNo: ir.irsaliyeNo || ir.id,
      firma: ir.firma || '—',
      tarih: ir.tarih || '',
      gunGecikme: daysSince(ir.tarih),
    }))
    .filter((x) => x.gunGecikme >= minGun)
    .sort((a, b) => b.gunGecikme - a.gunGecikme || a.irsaliyeNo.localeCompare(b.irsaliyeNo, 'tr'));
}

export type OperasyonOzet = {
  bekleyenOnay: number;
  gecikenOnay: number;
  bekleyenSatinAlma: number;
  kampUyarilari: KampDolulukUyarisi[];
  faturasizIrsaliye: number;
  faturasizEski: number;
};

export function buildOperasyonOzeti(input: {
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  faturalar?: Fatura[];
  stokKartlar?: Array<{ durum?: string }>;
  kampOdalari?: KampOdasi[];
  kampKayitlari?: KampKaydi[];
}): OperasyonOzet {
  const chrome = {
    satinAlmaTalepleri: input.satinAlmaTalepleri,
    irsaliyeler: input.irsaliyeler,
    faturalar: input.faturalar,
  };
  const pendingStok = (input.stokKartlar || []).filter((s) => s.durum === 'ONAY BEKLİYOR').length;
  const bekleyenSatinAlma = (input.satinAlmaTalepleri || []).filter((sa) =>
    isSatinAlmaPending(sa.onayDurumu)
  ).length;
  const faturasiz = listFaturasizIrsaliyeler(input.irsaliyeler || [], input.faturalar || [], 0);
  const faturasizEski = faturasiz.filter((x) => x.gunGecikme >= 3).length;

  return {
    bekleyenOnay: countChromePendingOnay(chrome) + pendingStok,
    gecikenOnay: countStaleChromePendingOnay(chrome, 48),
    bekleyenSatinAlma,
    kampUyarilari: buildKampDolulukUyarilari(input.kampOdalari || [], input.kampKayitlari || []),
    faturasizIrsaliye: faturasiz.length,
    faturasizEski,
  };
}

function eachDateInclusive(startIso: string, endIso: string, fn: (y: number, m: number, d: number) => void) {
  const start = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return;
  const cur = new Date(start);
  while (cur <= end) {
    fn(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
    cur.setDate(cur.getDate() + 1);
  }
}

/**
 * Onaylı izni puantaja yazar.
 * Sadece boş / Girilmedi günlere dokunur — Geldi/Yok/Raporlu ezilmez.
 */
export function applyOnayliIzinToYoklama(
  yoklamalar: AylikYoklamaMap,
  opts: {
    personelId: string;
    baslangicTarihi: string;
    bitisTarihi: string;
  }
): { next: AylikYoklamaMap; yazilanGun: number; atlananGun: number } {
  const personelId = String(opts.personelId || '');
  if (!personelId || personelId.startsWith('manual_')) {
    return { next: yoklamalar, yazilanGun: 0, atlananGun: 0 };
  }

  let yazilanGun = 0;
  let atlananGun = 0;
  const personMap = { ...(yoklamalar[personelId] || {}) };

  eachDateInclusive(opts.baslangicTarihi, opts.bitisTarihi, (y, m, d) => {
    const existing = getYoklamaDay(personMap, y, m, d);
    const durum = String(existing?.durum || 'Girilmedi');
    if (durum && durum !== 'Girilmedi' && durum !== 'İzinli') {
      atlananGun += 1;
      return;
    }
    Object.assign(
      personMap,
      setYoklamaDay(personMap, y, m, d, {
        durum: 'İzinli',
        mesaiSaati: 0,
      })
    );
    yazilanGun += 1;
  });

  return {
    next: { ...yoklamalar, [personelId]: personMap },
    yazilanGun,
    atlananGun,
  };
}
