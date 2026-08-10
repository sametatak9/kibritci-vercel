import { Personel } from '../types/erp';
import { fetchCollection } from './firebase';
import { levenshteinDistance, normalizeStockCompareName } from './duplicateNameUtils';
import { validateTC } from './personelOdemeUtils';
import { firmaEslesir } from './taseronUtils';
import { saveDocument } from './firebase';

export type PersonelMatchReason =
  | 'TC'
  | 'PHONE'
  | 'EXACT_NAME'
  | 'FUZZY_NAME_FIRMA'
  | 'FUZZY_SURNAME_FIRMA'
  | 'SUBSTRING_NAME'
  | 'SINGLE_FIRST_NAME';

export interface PersonelMatchResult {
  personel: Personel;
  reason: PersonelMatchReason;
  /** Düşük = daha güvenilir eşleşme */
  score: number;
}

const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');

export const phoneMatchKey = (raw: string) => {
  const d = digitsOnly(raw);
  return d.length >= 10 ? d.slice(-10) : d;
};

export function normalizePersonelFullName(ad: string, soyad?: string): string {
  const full = soyad ? `${ad} ${soyad}` : ad;
  return normalizeStockCompareName(full);
}

export function parsePersonelName(rawName: string): { ad: string; soyad: string } {
  const cleaned = String(rawName || '')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\bsoyadı?\s+belli\s+değil\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ').filter(Boolean);
  return {
    ad: (parts[0] || '').toLocaleUpperCase('tr-TR'),
    soyad: (parts.slice(1).join(' ') || '').toLocaleUpperCase('tr-TR'),
  };
}

export function findPersonelByTcInList(personeller: Personel[], tcRaw: string): Personel | undefined {
  const tc = digitsOnly(tcRaw);
  if (!validateTC(tc)) return undefined;
  return personeller.find((p) => digitsOnly(p.tcNo || '') === tc);
}

export function findPersonelByTelInList(personeller: Personel[], telRaw: string): Personel | undefined {
  const key = phoneMatchKey(telRaw);
  if (key.length < 10) return undefined;
  return personeller.find((p) => phoneMatchKey(p.telefonNo || '') === key);
}

function pushMatch(
  out: PersonelMatchResult[],
  personel: Personel | undefined,
  reason: PersonelMatchReason,
  score: number
) {
  if (!personel) return;
  if (out.some((m) => m.personel.id === personel.id)) {
    const idx = out.findIndex((m) => m.personel.id === personel.id);
    if (idx >= 0 && score < out[idx].score) out[idx] = { personel, reason, score };
    return;
  }
  out.push({ personel, reason, score });
}

/** Kampçı / onay ekranı için mevcut personel adaylarını bulur (mükerrer kayıt önleme). */
export function findPersonelMatches(
  personeller: Personel[],
  opts: {
    rawName?: string;
    tcNo?: string;
    telefonNo?: string;
    firmaAdi?: string;
    firmaTipi?: 'ANA_FIRMA' | 'TASERON';
  }
): PersonelMatchResult[] {
  const matches: PersonelMatchResult[] = [];
  const tc = digitsOnly(opts.tcNo || '');
  const telKey = phoneMatchKey(opts.telefonNo || '');
  const { ad, soyad } = parsePersonelName(opts.rawName || '');
  const targetFull = normalizePersonelFullName(ad, soyad);
  const targetAd = normalizeStockCompareName(ad);
  const targetSoyad = normalizeStockCompareName(soyad);
  const firmaAdi = String(opts.firmaAdi || '').trim();

  pushMatch(matches, findPersonelByTcInList(personeller, tc), 'TC', 0);

  if (telKey.length >= 10) {
    pushMatch(matches, findPersonelByTelInList(personeller, opts.telefonNo || ''), 'PHONE', 1);
  }

  if (targetFull) {
    for (const p of personeller) {
      const full = normalizePersonelFullName(p.ad, p.soyad);
      if (full === targetFull) {
        pushMatch(matches, p, 'EXACT_NAME', 2);
        continue;
      }
      if (full.includes(targetFull) || targetFull.includes(full)) {
        pushMatch(matches, p, 'SUBSTRING_NAME', 4);
      }
    }
  }

  if (targetAd) {
    const sameFirst = personeller.filter((p) => normalizeStockCompareName(p.ad) === targetAd);
    if (sameFirst.length === 1 && targetFull) {
      pushMatch(matches, sameFirst[0], 'SINGLE_FIRST_NAME', 5);
    }

    for (const p of sameFirst) {
      const pSoyad = normalizeStockCompareName(p.soyad);
      if (!targetSoyad || !pSoyad) continue;

      const surnameDist = levenshteinDistance(targetSoyad, pSoyad);
      const fullDist = levenshteinDistance(targetFull, normalizePersonelFullName(p.ad, p.soyad));
      const firmaMatch = firmaAdi ? firmaEslesir(p.firmaAdi || '', firmaAdi) : false;

      if (surnameDist <= 2 && firmaMatch) {
        pushMatch(matches, p, 'FUZZY_SURNAME_FIRMA', 3 + surnameDist);
      } else if (fullDist <= 2 && firmaMatch) {
        pushMatch(matches, p, 'FUZZY_NAME_FIRMA', 3 + fullDist);
      } else if (surnameDist <= 2 && opts.firmaTipi !== 'TASERON') {
        pushMatch(matches, p, 'FUZZY_SURNAME_FIRMA', 5 + surnameDist);
      }
    }
  }

  return matches.sort((a, b) => a.score - b.score || a.personel.ad.localeCompare(b.personel.ad, 'tr'));
}

export function pickBestPersonelMatch(matches: PersonelMatchResult[]): PersonelMatchResult | undefined {
  return matches[0];
}

/** Otomatik birleştirme eşiği — bu skorun altındaysa onay sormadan mevcut kayıt kullanılır */
export const AUTO_MERGE_SCORE_MAX = 4;

export function formatPersonelMatchLabel(match: PersonelMatchResult): string {
  const p = match.personel;
  const tc = digitsOnly(p.tcNo || '');
  const firma = p.firmaAdi ? ` · ${p.firmaAdi}` : '';
  const tcLabel = tc ? ` · TC: ${tc}` : '';
  return `${p.ad} ${p.soyad}${firma}${tcLabel}`;
}

export function shouldConfirmPersonelMerge(match: PersonelMatchResult): boolean {
  return match.score > AUTO_MERGE_SCORE_MAX;
}

/** Giriş talebi / public kayıt onayında mevcut personeli bul */
export function resolvePersonelForGirisOnay(
  personeller: Personel[],
  item: {
    personelId?: string;
    ad?: string;
    soyad?: string;
    tcNo?: string;
    telefonNo?: string;
    firmaAdi?: string;
    firmaTipi?: string;
  }
): Personel | undefined {
  if (item.personelId) {
    const byId = personeller.find((p) => p.id === item.personelId);
    if (byId) return byId;
  }

  const tc = digitsOnly(item.tcNo || '');
  if (validateTC(tc)) {
    const byTc = findPersonelByTcInList(personeller, tc);
    if (byTc) return byTc;
  }

  const matches = findPersonelMatches(personeller, {
    rawName: `${item.ad || ''} ${item.soyad || ''}`.trim(),
    tcNo: item.tcNo,
    telefonNo: item.telefonNo,
    firmaAdi: item.firmaAdi,
    firmaTipi: item.firmaTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA',
  });

  return pickBestPersonelMatch(matches)?.personel;
}

/** Aynı oturumda eşzamanlı personel oluşturmayı sıraya al (Firestore yarışını önler). */
let dedupUpsertChain: Promise<unknown> = Promise.resolve();

function withDedupLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = dedupUpsertChain.then(fn, fn);
  dedupUpsertChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Yerel + Firestore personel listesini birleştir (mükerrer kayıt önleme). */
export async function loadPersonellerForDedup(local: Personel[] = []): Promise<Personel[]> {
  let remote: Personel[] = [];
  try {
    remote = (await fetchCollection<Personel>('personeller')) as Personel[];
  } catch (err) {
    console.warn('[personel-dedup] Firestore personel listesi alınamadı, yerel liste kullanılıyor:', err);
  }
  const byId = new Map<string, Personel>();
  for (const p of [...local, ...remote]) {
    if (!p?.id) continue;
    byId.set(p.id, p);
  }
  return Array.from(byId.values());
}

/** Yeni personel kaydı açmadan önce birleştirilmiş listede ara; varsa güncelle. */
export async function upsertPersonelAvoidDuplicate(
  localPersoneller: Personel[],
  candidate: Personel,
  matchOpts: {
    rawName?: string;
    tcNo?: string;
    telefonNo?: string;
    firmaAdi?: string;
    firmaTipi?: 'ANA_FIRMA' | 'TASERON';
  }
): Promise<{ personel: Personel; created: boolean; merged: boolean }> {
  return withDedupLock(async () => {
  const merged = await loadPersonellerForDedup(localPersoneller);
  const existing =
    resolvePersonelForGirisOnay(merged, {
      personelId: candidate.id,
      ad: candidate.ad,
      soyad: candidate.soyad,
      tcNo: matchOpts.tcNo ?? candidate.tcNo,
      telefonNo: matchOpts.telefonNo ?? candidate.telefonNo,
      firmaAdi: matchOpts.firmaAdi ?? candidate.firmaAdi,
      firmaTipi: matchOpts.firmaTipi ?? candidate.firmaTipi,
    }) ||
    pickBestPersonelMatch(
      findPersonelMatches(merged, {
        rawName: matchOpts.rawName || `${candidate.ad} ${candidate.soyad}`.trim(),
        tcNo: matchOpts.tcNo ?? candidate.tcNo,
        telefonNo: matchOpts.telefonNo ?? candidate.telefonNo,
        firmaAdi: matchOpts.firmaAdi ?? candidate.firmaAdi,
        firmaTipi: matchOpts.firmaTipi ?? (candidate.firmaTipi === 'TASERON' ? 'TASERON' : 'ANA_FIRMA'),
      })
    )?.personel;

  if (existing) {
    const next: Personel = {
      ...existing,
      ...candidate,
      id: existing.id,
      ad: candidate.ad || existing.ad,
      soyad: candidate.soyad || existing.soyad,
      tcNo: digitsOnly(candidate.tcNo || '') || existing.tcNo,
      telefonNo: candidate.telefonNo?.trim() || existing.telefonNo,
      firmaAdi: candidate.firmaAdi || existing.firmaAdi,
      firmaTipi: candidate.firmaTipi || existing.firmaTipi,
      gorev: candidate.gorev || existing.gorev,
      durum: candidate.durum !== undefined ? candidate.durum : existing.durum,
    };
    await saveDocument('personeller', next);
    return { personel: next, created: false, merged: true };
  }

  const tc = digitsOnly(candidate.tcNo || '');
  if (validateTC(tc)) {
    const dupTc = findPersonelByTcInList(merged, tc);
    if (dupTc) {
      throw new Error(
        `Bu TC zaten kayıtlı: ${dupTc.ad} ${dupTc.soyad}. Yeni kayıt açılamaz — mevcut kaydı güncelleyin.`
      );
    }
  }

  await saveDocument('personeller', candidate);
  return { personel: candidate, created: true, merged: false };
  });
}
