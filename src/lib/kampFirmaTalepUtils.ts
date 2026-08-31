import type { CariKart, KampFirmaTalep } from '../types/erp';
import {
  canonicalFirmaUnvan,
  firmaDedupKey,
  isExplicitAnaFirmaUnvan,
  isPlaceholderTaseronUnvan,
} from './firmaCanonicalUtils';
import { firmaAnahtar, firmaEslesir, getTaseronCariKartlar } from './taseronUtils';
import { CANONICAL_ANA_FIRMA_ADI } from './yoklamaUtils';

export function normalizeKampFirmaUnvan(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

export function kampFirmaTalepEslesir(a?: string | null, b?: string | null): boolean {
  const ka = firmaDedupKey(a);
  const kb = firmaDedupKey(b);
  if (ka && kb && ka === kb) return true;
  return firmaEslesir(String(a || ''), String(b || ''));
}

export function findMatchingTaseronCari(
  unvan: string,
  cariKartlar: CariKart[]
): CariKart | undefined {
  const cleaned = normalizeKampFirmaUnvan(unvan);
  if (!cleaned) return undefined;
  return getTaseronCariKartlar(cariKartlar).find((c) => kampFirmaTalepEslesir(c.unvan, cleaned));
}

export function findSimilarTaseronCariler(
  unvan: string,
  cariKartlar: CariKart[],
  limit = 6
): CariKart[] {
  const cleaned = normalizeKampFirmaUnvan(unvan);
  if (!cleaned) return [];
  const first = (firmaAnahtar(cleaned) || '').split(' ')[0] || '';
  const hits = getTaseronCariKartlar(cariKartlar).filter((c) => {
    if (kampFirmaTalepEslesir(c.unvan, cleaned)) return true;
    const cf = (firmaAnahtar(c.unvan) || '').split(' ')[0] || '';
    return first.length >= 3 && cf.length >= 3 && first === cf;
  });
  return hits.slice(0, limit);
}

export function findPendingKampFirmaTalep(
  unvan: string,
  talepler: KampFirmaTalep[]
): KampFirmaTalep | undefined {
  const cleaned = normalizeKampFirmaUnvan(unvan);
  if (!cleaned) return undefined;
  return talepler.find(
    (t) => t.durum === 'ONAY BEKLİYOR' && kampFirmaTalepEslesir(t.onerilenUnvan, cleaned)
  );
}

export type KampFirmaOneriSonuc =
  | { kind: 'invalid'; message: string }
  | { kind: 'existing'; cari: CariKart }
  | { kind: 'pending'; talep: KampFirmaTalep }
  | { kind: 'needs_approval'; unvan: string; benzerler: CariKart[] };

export function evaluateKampFirmaOnerisi(
  raw: string,
  cariKartlar: CariKart[],
  pendingTalepler: KampFirmaTalep[] = []
): KampFirmaOneriSonuc {
  const unvan = normalizeKampFirmaUnvan(raw);
  if (unvan.length < 3) {
    return { kind: 'invalid', message: 'Firma adı en az 3 karakter olmalı.' };
  }
  if (isPlaceholderTaseronUnvan(unvan)) {
    return {
      kind: 'invalid',
      message: 'AAA, Y, BELİRTİLMEDİ gibi geçersiz isimler kullanılamaz. Kayıtlı firmadan seçin.',
    };
  }
  if (isExplicitAnaFirmaUnvan(unvan)) {
    return {
      kind: 'invalid',
      message: `${CANONICAL_ANA_FIRMA_ADI} ana firmadır — taşeron olarak açılamaz.`,
    };
  }

  const existing = findMatchingTaseronCari(unvan, cariKartlar);
  if (existing) return { kind: 'existing', cari: existing };

  const pending = findPendingKampFirmaTalep(unvan, pendingTalepler);
  if (pending) return { kind: 'pending', talep: pending };

  return {
    kind: 'needs_approval',
    unvan,
    benzerler: findSimilarTaseronCariler(unvan, cariKartlar),
  };
}

export function buildKampFirmaTalep(opts: {
  unvan: string;
  email: string;
  benzerler?: CariKart[];
}): KampFirmaTalep {
  const unvan = normalizeKampFirmaUnvan(opts.unvan);
  return {
    id: `kft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    onerilenUnvan: unvan,
    durum: 'ONAY BEKLİYOR',
    kaynak: 'KAMPCI',
    gonderenEmail: opts.email,
    olusturmaTarihi: new Date().toISOString(),
    notlar:
      opts.benzerler && opts.benzerler.length > 0
        ? `Benzer kayıtlı firmalar: ${opts.benzerler.map((c) => c.unvan).join(', ')}`
        : '',
  };
}

function nextTaseronKod(existing: CariKart[]): string {
  const nums = existing
    .filter((c) => c.kartTipi === 'TASERON')
    .map((c) => c.kod?.match(/TSR-(\d+)/i)?.[1])
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n < 500);
  const next = nums.length ? Math.max(...nums) + 1 : existing.filter((c) => c.kartTipi === 'TASERON').length + 1;
  return `TSR-${String(next).padStart(2, '0')}`;
}

export function buildApprovedTaseronCari(unvan: string, existingCariler: CariKart[]): CariKart {
  const label = canonicalFirmaUnvan(unvan) || normalizeKampFirmaUnvan(unvan);
  const slug = (firmaDedupKey(label) || 'firma').replace(/\s+/g, '_').slice(0, 16);
  return {
    id: `ck_taseron_${slug}_${Date.now()}`,
    kartTipi: 'TASERON',
    kod: nextTaseronKod(existingCariler),
    unvan: label,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: '',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Kampçı firma talebi yönetici onayı ile oluşturuldu.',
  };
}
