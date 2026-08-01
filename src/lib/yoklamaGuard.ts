import { AylikYoklamaMap } from '../types/erp';
import { isProductionLive } from './productionDataGuard';

export function countYoklamaDayEntries(map: AylikYoklamaMap): number {
  let total = 0;
  for (const personMap of Object.values(map || {})) {
    if (personMap && typeof personMap === 'object') {
      total += Object.keys(personMap).length;
    }
  }
  return total;
}

/** YYYY-MM-DD formatlı anahtar sayısı */
export function countYoklamaDateKeys(map: AylikYoklamaMap): number {
  let total = 0;
  for (const personMap of Object.values(map || {})) {
    if (!personMap || typeof personMap !== 'object') continue;
    for (const key of Object.keys(personMap)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) total++;
    }
  }
  return total;
}

/** Girilmedi dışındaki gerçek puantaj günleri */
export function countYoklamaFilledDays(map: AylikYoklamaMap): number {
  let total = 0;
  for (const personMap of Object.values(map || {})) {
    if (!personMap || typeof personMap !== 'object') continue;
    for (const data of Object.values(personMap)) {
      const durum = (data as { durum?: string })?.durum;
      if (durum && durum !== 'Girilmedi') total++;
    }
  }
  return total;
}

export function countYoklamaPersons(map: AylikYoklamaMap): number {
  return Object.keys(map || {}).length;
}

export interface YoklamaMassWriteCheck {
  blocked: boolean;
  reason?: string;
}

/**
 * Uzak kayıttan belirgin düşüş varsa yazmayı engeller (kazara silme / eksik yükleme).
 */
export function shouldBlockYoklamaMassWrite(
  remote: AylikYoklamaMap,
  merged: AylikYoklamaMap
): YoklamaMassWriteCheck {
  const remoteFilled = countYoklamaFilledDays(remote);
  const mergedFilled = countYoklamaFilledDays(merged);
  const remoteDateKeys = countYoklamaDateKeys(remote);
  const mergedDateKeys = countYoklamaDateKeys(merged);
  const remotePersons = countYoklamaPersons(remote);
  const mergedPersons = countYoklamaPersons(merged);

  if (!isProductionLive() && remoteFilled < 20) {
    return { blocked: false };
  }

  if (remoteFilled >= 20) {
    const filledDrop = remoteFilled - mergedFilled;
    // Kalıcı koruma: dolu günlerin %5'inden fazla veya 15+ gün kaybı engellenir
    if (filledDrop > 15 || mergedFilled < remoteFilled * 0.95) {
      return {
        blocked: true,
        reason: `Şüpheli toplu yoklama silme engellendi (${remoteFilled} → ${mergedFilled} dolu gün). Arşivden geri yükleyebilirsiniz.`,
      };
    }
  }

  if (remoteDateKeys >= 50) {
    if (mergedDateKeys < remoteDateKeys * 0.95) {
      return {
        blocked: true,
        reason: `Tarih anahtarı kaybı engellendi (${remoteDateKeys} → ${mergedDateKeys}). Bağlantı sorunu olabilir; tekrar deneyin.`,
      };
    }
  }

  if (remotePersons >= 10 && mergedPersons < remotePersons * 0.75) {
    return {
      blocked: true,
      reason: `Personel yoklama kaydı kaybı engellendi (${remotePersons} → ${mergedPersons} personel).`,
    };
  }

  return { blocked: false };
}

/** Uzak kayıttaki personelleri korur; yerel güncellemeler üstüne yazılır.
 *  Tam harita yazımında (çok gün anahtarı) yerel Girilmedi, uzaktaki dolu günü ezmez.
 *  Seyrek (sparse) yazımda bilinçli sıfırlama hâlâ uygulanır. */
export function mergeYoklamaMaps(
  remote: Record<string, unknown>,
  local: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...remote };
  for (const [personId, days] of Object.entries(local || {})) {
    const remoteDays = ((result[personId] as Record<string, unknown>) || {}) as Record<
      string,
      { durum?: string }
    >;
    const localDays = (days as Record<string, { durum?: string }>) || {};
    const localKeyCount = Object.keys(localDays).length;
    const mergedDays: Record<string, unknown> = { ...remoteDays };

    for (const [dayKey, localData] of Object.entries(localDays)) {
      if (!localData || typeof localData !== 'object') {
        mergedDays[dayKey] = localData;
        continue;
      }
      const localEmpty = !localData.durum || localData.durum === 'Girilmedi';
      const remoteFilled =
        !!remoteDays[dayKey]?.durum && remoteDays[dayKey].durum !== 'Girilmedi';
      // Tam harita gönderiminde (ör. eski Formen bug) Girilmedi ile dolu günü koru
      if (localEmpty && remoteFilled && localKeyCount > 5) {
        continue;
      }
      mergedDays[dayKey] = localData;
    }
    result[personId] = mergedDays;
  }
  return result;
}
