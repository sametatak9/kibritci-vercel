import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  KampTaseronSayim,
  KampTaseronSayimIslem,
  KampTaseronSayimIslemTipi,
  KampTaseronSayimPersonelGuncelleme,
  Personel,
} from '../types/erp';
import {
  isAnaFirmaMykSayimPersoneli,
  isAnaFirmaMykSayimSession,
} from './anaFirmaMykSayimUtils';
import { cleanUndefined, db, saveDocument } from './firebase';
import { validateTC } from './personelOdemeUtils';
import { withTaseronPersonelGorev } from './taseronUtils';

const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');

export const phoneMatchKey = (raw: string) => {
  const d = digitsOnly(raw);
  return d.length >= 10 ? d.slice(-10) : d;
};

export function buildPersonelPatchFromDraft(
  personel: Personel,
  draft: { tcNo: string; telefonNo: string; mykDurumu: 'VAR' | 'YOK' | 'BILINMIYOR' }
): { patch: KampTaseronSayimPersonelGuncelleme | null; error?: string } {
  const changes: string[] = [];
  const patch: KampTaseronSayimPersonelGuncelleme = {
    personelId: personel.id,
    personelIsim: `${personel.ad} ${personel.soyad}`,
    islemTipi: 'GENEL_GUNCELLEME',
    detay: '',
  };

  if (draft.tcNo && !validateTC(draft.tcNo)) {
    return { patch: null, error: 'Geçerli 11 haneli TC girin.' };
  }
  if (
    draft.telefonNo &&
    phoneMatchKey(draft.telefonNo).length > 0 &&
    phoneMatchKey(draft.telefonNo).length < 10
  ) {
    return { patch: null, error: 'Telefon en az 10 hane olmalı.' };
  }

  if (draft.tcNo && digitsOnly(personel.tcNo || '') !== draft.tcNo) {
    patch.tcNo = draft.tcNo;
    changes.push('TC güncellendi');
  }
  if (draft.telefonNo && phoneMatchKey(personel.telefonNo || '') !== phoneMatchKey(draft.telefonNo)) {
    patch.telefonNo = draft.telefonNo.trim();
    changes.push('Telefon güncellendi');
  }
  if (draft.mykDurumu !== (personel.mykDurumu || 'BILINMIYOR')) {
    patch.mykDurumu = draft.mykDurumu;
    changes.push(`MYK: ${draft.mykDurumu}`);
  }

  if (changes.length === 0) {
    return { patch: null, error: 'Kaydedilecek değişiklik yok.' };
  }

  if (changes.some((c) => c.startsWith('TC'))) patch.islemTipi = 'TC_EKLENDI';
  else if (changes.some((c) => c.startsWith('Telefon'))) patch.islemTipi = 'TEL_EKLENDI';
  else if (changes.some((c) => c.startsWith('MYK'))) patch.islemTipi = 'MYK_ISARETLENDI';

  patch.detay = changes.join(' · ');
  return { patch };
}

export function buildIseGirisPatch(personel: Personel, today: string): KampTaseronSayimPersonelGuncelleme {
  return {
    personelId: personel.id,
    personelIsim: `${personel.ad} ${personel.soyad}`,
    durum: true,
    istenCikisTarihi: null,
    iseGirisTarihi: personel.iseGirisTarihi || today,
    islemTipi: 'ISE_GIRIS',
    detay: 'Personel aktif yapılacak (yönetici onayı sonrası)',
  };
}

export function filterSayimGuncellemeleriForSession(
  firmaAdi: string,
  guncellemeler: KampTaseronSayimPersonelGuncelleme[],
  personeller: Personel[]
): KampTaseronSayimPersonelGuncelleme[] {
  if (!isAnaFirmaMykSayimSession(firmaAdi)) return guncellemeler;
  return guncellemeler.filter((g) => {
    const p = personeller.find((x) => x.id === g.personelId);
    return p != null && isAnaFirmaMykSayimPersoneli(p);
  });
}

export function validateTaseronSayimSession(opts: {
  firmaAdi: string;
  personelGuncellemeleri: KampTaseronSayimPersonelGuncelleme[];
  personeller: Personel[];
}): { ok: true } | { ok: false; error: string } {
  if (!opts.firmaAdi.trim()) {
    return { ok: false, error: 'Taşeron firma seçilmedi.' };
  }
  if (opts.personelGuncellemeleri.length === 0) {
    return { ok: false, error: 'Gönderilecek personel güncellemesi yok. Önce kartlarda Kaydet ile taslak oluşturun.' };
  }

  const anaFirmaMyk = isAnaFirmaMykSayimSession(opts.firmaAdi);
  const tcSeen = new Set<string>();
  for (const g of opts.personelGuncellemeleri) {
    const personel = opts.personeller.find((p) => p.id === g.personelId);
    if (!personel) {
      return { ok: false, error: `${g.personelIsim} personel kaydı bulunamadı.` };
    }
    if (anaFirmaMyk && !isAnaFirmaMykSayimPersoneli(personel)) {
      // Eski oturumlarda kapsam dışı kayıtlar olabilir — onayda atlanır, kayıt engellenmez
      continue;
    }

    if (g.tcNo) {
      if (!validateTC(g.tcNo)) {
        return { ok: false, error: `${g.personelIsim}: geçersiz TC.` };
      }
      const dup = opts.personeller.find(
        (p) => p.id !== g.personelId && digitsOnly(p.tcNo || '') === g.tcNo
      );
      if (dup) {
        return { ok: false, error: `${g.personelIsim}: TC başka personelde kayıtlı (${dup.ad} ${dup.soyad}).` };
      }
      if (tcSeen.has(g.tcNo)) {
        return { ok: false, error: 'Aynı TC birden fazla personele atanmış.' };
      }
      tcSeen.add(g.tcNo);
    }

    if (g.telefonNo && phoneMatchKey(g.telefonNo).length > 0 && phoneMatchKey(g.telefonNo).length < 10) {
      return { ok: false, error: `${g.personelIsim}: telefon en az 10 hane olmalı.` };
    }
  }

  if (anaFirmaMyk) {
    const inScope = filterSayimGuncellemeleriForSession(
      opts.firmaAdi,
      opts.personelGuncellemeleri,
      opts.personeller
    );
    if (inScope.length === 0) {
      return {
        ok: false,
        error:
          'KİBRİTÇİ MYK sayımında uygulanacak kayıt yok. Yalnızca aktif DÜZ İŞÇİ / TESİSATÇI / FORMEN / USTA personeli kapsanır.',
      };
    }
  }

  return { ok: true };
}

export function mergePendingPatches(
  prev: Record<string, KampTaseronSayimPersonelGuncelleme>,
  next: KampTaseronSayimPersonelGuncelleme
): Record<string, KampTaseronSayimPersonelGuncelleme> {
  const existing = prev[next.personelId];
  if (!existing) {
    return { ...prev, [next.personelId]: next };
  }
  return {
    ...prev,
    [next.personelId]: {
      ...existing,
      ...next,
      detay: [existing.detay, next.detay].filter(Boolean).join(' · '),
      islemTipi: next.islemTipi !== 'GENEL_GUNCELLEME' ? next.islemTipi : existing.islemTipi,
    },
  };
}

export function buildSessionIslemFromPatch(
  sessionId: string,
  firmaAdi: string,
  patch: KampTaseronSayimPersonelGuncelleme,
  yapan: string
): KampTaseronSayimIslem {
  return {
    id: `tsayim_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    personelId: patch.personelId,
    personelIsim: patch.personelIsim,
    firmaAdi,
    islemTipi: patch.islemTipi,
    detay: patch.detay,
    tarih: new Date().toISOString(),
    yapan,
  };
}

function finalizePersonelFromSayimPatch(
  current: Personel,
  g: KampTaseronSayimPersonelGuncelleme,
  anaFirmaMyk: boolean
): Personel {
  const payload: Personel = { ...current };

  if (g.tcNo !== undefined) payload.tcNo = g.tcNo;
  if (g.telefonNo !== undefined) payload.telefonNo = g.telefonNo;
  if (g.mykDurumu !== undefined) payload.mykDurumu = g.mykDurumu;
  if (g.durum !== undefined) payload.durum = g.durum;
  if (g.istenCikisTarihi !== undefined) {
    payload.istenCikisTarihi = g.istenCikisTarihi || undefined;
  }
  if (g.iseGirisTarihi !== undefined) payload.iseGirisTarihi = g.iseGirisTarihi;

  return anaFirmaMyk ? payload : withTaseronPersonelGorev(payload);
}

async function commitPersonelBatches(updates: Personel[]): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = writeBatch(db);
    updates.slice(i, i + CHUNK).forEach((p) => {
      batch.set(doc(db, 'personeller', p.id), cleanUndefined(p), { merge: true });
    });
    await batch.commit();
  }
}

export async function applyTaseronSayimOnApproval(
  session: KampTaseronSayim,
  personeller: Personel[]
): Promise<{ updatedPersoneller: Personel[]; appliedCount: number; skippedCount: number }> {
  const guncellemeler = session.personelGuncellemeleri || [];
  const anaFirmaMyk = isAnaFirmaMykSayimSession(session.firmaAdi);
  const updatedIds = new Set<string>();
  let skippedCount = 0;
  const nextPersoneller = [...personeller];
  const toPersist: Personel[] = [];

  for (const g of guncellemeler) {
    const idx = nextPersoneller.findIndex((p) => p.id === g.personelId);
    if (idx < 0) {
      skippedCount += 1;
      continue;
    }

    const current = nextPersoneller[idx];
    if (anaFirmaMyk && !isAnaFirmaMykSayimPersoneli(current)) {
      skippedCount += 1;
      continue;
    }

    const merged = finalizePersonelFromSayimPatch(current, g, anaFirmaMyk);
    nextPersoneller[idx] = merged;
    toPersist.push(merged);
    updatedIds.add(g.personelId);
  }

  if (toPersist.length > 0) {
    await commitPersonelBatches(toPersist);
  }

  return { updatedPersoneller: nextPersoneller, appliedCount: updatedIds.size, skippedCount };
}

export async function markTaseronSayimApproved(
  sessionId: string,
  approverEmail: string,
  approverRole: string
): Promise<void> {
  await updateDoc(doc(db, 'kampTaseronSayimlari', sessionId), {
    durum: 'ONAYLANDI',
    onaylayan: approverEmail,
    onaylayanYetki: approverRole,
    onayTarihi: new Date().toISOString(),
  });
}

export async function markTaseronSayimRejected(sessionId: string, approverEmail: string): Promise<void> {
  await updateDoc(doc(db, 'kampTaseronSayimlari', sessionId), {
    durum: 'REDDEDİLDİ',
    onaylayan: approverEmail,
    onayTarihi: new Date().toISOString(),
  });
}

export async function fetchTaseronSayimSession(sessionId: string): Promise<KampTaseronSayim | null> {
  const snap = await getDoc(doc(db, 'kampTaseronSayimlari', sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as KampTaseronSayim;
}

export function summarizeTaseronSayimGuncellemeleri(
  guncellemeler: KampTaseronSayimPersonelGuncelleme[]
): Record<KampTaseronSayimIslemTipi, number> {
  const counts: Record<KampTaseronSayimIslemTipi, number> = {
    TC_EKLENDI: 0,
    TEL_EKLENDI: 0,
    MYK_ISARETLENDI: 0,
    ISTEN_CIKIS: 0,
    ISE_GIRIS: 0,
    GENEL_GUNCELLEME: 0,
  };
  guncellemeler.forEach((g) => {
    counts[g.islemTipi] = (counts[g.islemTipi] || 0) + 1;
  });
  return counts;
}
