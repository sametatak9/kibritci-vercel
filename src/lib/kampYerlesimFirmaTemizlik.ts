import type { KampKaydi, Personel } from '../types/erp';
import { canonicalFirmaUnvan, isJunkFirmaAdi } from './firmaCanonicalUtils';
import { resolveKampYerlesimFirma } from './kampFirmaOzet';
import { saveDocument } from './firebase';
import { isTaseronPersonel } from './yoklamaUtils';

export type KampYerlesimFirmaTemizlikPlan = {
  kampPatches: Array<{ id: string; patch: Partial<KampKaydi> }>;
  summary: string[];
};

function resolvePersonelFirmaForPatch(p: Personel): string {
  if (!isTaseronPersonel(p)) return 'KİBRİTÇİ İNŞAAT';
  const raw = String(p.firmaAdi || '').trim();
  if (!raw || isJunkFirmaAdi(raw)) return 'TAŞERON';
  return canonicalFirmaUnvan(raw);
}

/** AAA, Y, BELİRTİLMEDİ vb. junk firmaları düzelt; EMA + EMA MERMER birleştir. */
export function planKampYerlesimFirmaTemizlik(
  personeller: Personel[],
  kampKayitlari: KampKaydi[]
): KampYerlesimFirmaTemizlikPlan {
  const summary: string[] = [];
  const kampPatches: Array<{ id: string; patch: Partial<KampKaydi> }> = [];
  const seen = new Set<string>();

  for (const k of kampKayitlari) {
    const raw = String(k.calistigiFirma || '').trim();
    const p = k.personelId ? personeller.find((x) => x.id === k.personelId) : undefined;

    let target = resolveKampYerlesimFirma(k, personeller);
    if (isJunkFirmaAdi(target)) {
      target = p ? resolvePersonelFirmaForPatch(p) : 'TAŞERON';
    }

    if (!raw) {
      if (target !== 'TAŞERON' || p) {
        kampPatches.push({ id: k.id, patch: { calistigiFirma: target } });
      }
      continue;
    }

    if (isJunkFirmaAdi(raw)) {
      kampPatches.push({ id: k.id, patch: { calistigiFirma: target } });
      continue;
    }

    const canon = canonicalFirmaUnvan(raw);
    if (canon !== raw) {
      kampPatches.push({ id: k.id, patch: { calistigiFirma: canon } });
    }
  }

  const deduped = kampPatches.filter(({ id, patch }) => {
    const key = `${id}::${patch.calistigiFirma || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const prev = kampKayitlari.find((k) => k.id === id);
    if (!prev) return false;
    return String(prev.calistigiFirma || '').trim() !== String(patch.calistigiFirma || '').trim();
  });

  const junkCount = deduped.filter(({ id }) => {
    const prev = kampKayitlari.find((k) => k.id === id);
    return isJunkFirmaAdi(prev?.calistigiFirma);
  }).length;
  if (junkCount > 0) {
    summary.push(`${junkCount} junk yerleşim firması düzeltilecek (AAA, Y, BELİRTİLMEDİ vb.)`);
  }

  const mergeCount = deduped.length - junkCount;
  if (mergeCount > 0) {
    summary.push(`${mergeCount} yerleşim firması kanonikleştirilecek (ör. EMA → EMA MERMER)`);
  }

  if (deduped.length === 0) {
    summary.push('Düzeltilecek yerleşim firması yok.');
  }

  return { kampPatches: deduped, summary };
}

export async function applyKampYerlesimFirmaTemizlik(
  kampKayitlari: KampKaydi[],
  plan: KampYerlesimFirmaTemizlikPlan
): Promise<KampKaydi[]> {
  let next = [...kampKayitlari];
  for (const { id, patch } of plan.kampPatches) {
    const prev = next.find((k) => k.id === id);
    if (!prev) continue;
    const merged = { ...prev, ...patch };
    await saveDocument('kampKayitlari', merged);
    next = next.map((k) => (k.id === id ? merged : k));
  }
  return next;
}
