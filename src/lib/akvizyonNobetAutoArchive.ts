import type { Personel } from '../types/erp';
import { isAkvizyonPersonel, isPersonelActiveOnDate } from './guvenlikHelpers';

/** Akvizyon grup nöbeti otomatik kapanış saati (Europe/Istanbul) */
export const AKVIZYON_NOBET_KAPANIS_SAAT = 21;

export type AkvizyonYoklamaMap = Record<string, 'Geldi' | 'Gelmedi'>;

export type AkvizyonYoklamaDoc = {
  id?: string;
  tarih: string;
  kayitZamani?: string;
  kaydeden?: string;
  yoklama?: AkvizyonYoklamaMap;
  kilitli?: boolean;
  otomatikKapanis?: boolean;
  kapanisZamani?: string;
  kapanisSaati?: number;
  notlar?: string;
};

export function getIstanbulDateParts(now: Date = new Date()): {
  dateKey: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
  return {
    dateKey,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

export function istanbulTodayKey(now: Date = new Date()): string {
  return getIstanbulDateParts(now).dateKey;
}

/** Seçili gün için 21:00 İstanbul geçti mi? (bugün = saat; geçmiş gün = her zaman evet) */
export function isAkvizyonNobetKapanisZamaniGecti(
  tarih: string,
  now: Date = new Date()
): boolean {
  const { dateKey, hour, minute } = getIstanbulDateParts(now);
  if (tarih < dateKey) return true;
  if (tarih > dateKey) return false;
  return hour > AKVIZYON_NOBET_KAPANIS_SAAT || (hour === AKVIZYON_NOBET_KAPANIS_SAAT && minute >= 0);
}

export function isAkvizyonNobetKilitli(doc: AkvizyonYoklamaDoc | null | undefined): boolean {
  return Boolean(doc?.kilitli || doc?.otomatikKapanis);
}

export function collectAkvizyonPersonelForDate(
  personeller: Personel[],
  tarih: string
): Personel[] {
  return (personeller || []).filter(
    (p) => isAkvizyonPersonel(p) && isPersonelActiveOnDate(p, tarih)
  );
}

/** İşaretlenmeyenleri Gelmedi sayarak yoklama haritasını tamamla */
export function finalizeAkvizyonYoklamaMap(
  personelIds: string[],
  existing: AkvizyonYoklamaMap | null | undefined
): AkvizyonYoklamaMap {
  const next: AkvizyonYoklamaMap = { ...(existing || {}) };
  for (const id of personelIds) {
    if (!next[id]) next[id] = 'Gelmedi';
  }
  return next;
}

export function buildAkvizyonOtomatikKapanisPayload(options: {
  tarih: string;
  personelIds: string[];
  existing?: AkvizyonYoklamaDoc | null;
  kaydeden?: string;
  nowIso?: string;
}): AkvizyonYoklamaDoc {
  const nowIso = options.nowIso || new Date().toISOString();
  const yoklama = finalizeAkvizyonYoklamaMap(
    options.personelIds,
    options.existing?.yoklama
  );
  return {
    id: options.tarih,
    tarih: options.tarih,
    kayitZamani: options.existing?.kayitZamani || nowIso,
    kaydeden: options.existing?.kaydeden || options.kaydeden || 'sistem_otomatik',
    yoklama,
    kilitli: true,
    otomatikKapanis: true,
    kapanisZamani: nowIso,
    kapanisSaati: AKVIZYON_NOBET_KAPANIS_SAAT,
    notlar:
      options.existing?.notlar ||
      `Akvizyon grup nöbeti saat ${AKVIZYON_NOBET_KAPANIS_SAAT}:00'da otomatik kapatılıp arşivlendi.`,
  };
}

export function shouldAutoCloseAkvizyonNobet(
  tarih: string,
  existing: AkvizyonYoklamaDoc | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isAkvizyonNobetKapanisZamaniGecti(tarih, now)) return false;
  if (isAkvizyonNobetKilitli(existing)) return false;
  return true;
}
