/** Saha faaliyet iş etiketleri (KIRIM / DRENAJ vb.) */

export const FAALIYET_ETIKET_ONSETLERI = [
  'KIRIM İŞLERİ',
  'DRENAJ İŞLERİ',
  'KABA İNŞAAT',
  'TESİSAT',
  'KAMP',
  'DİĞER',
] as const;

export type FaaliyetIlerlemeDurumu = 'BASLAMADI' | 'DEVAM' | 'TAMAMLANDI';

export const ILERLEME_DURUM_LABEL: Record<FaaliyetIlerlemeDurumu, string> = {
  BASLAMADI: 'Başlamadı',
  DEVAM: 'Devam ediyor',
  TAMAMLANDI: 'Tamamlandı',
};

export function normalizeFaaliyetEtiketi(raw?: string | null): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  return t.toLocaleUpperCase('tr-TR');
}

export function etiketOptionsWithCustom(current?: string | null): string[] {
  const cur = normalizeFaaliyetEtiketi(current);
  const base = [...FAALIYET_ETIKET_ONSETLERI] as string[];
  if (cur && !base.includes(cur)) base.push(cur);
  return base;
}

export function ilerlemeDurumuLabel(d?: string | null): string {
  const k = String(d || '').toUpperCase() as FaaliyetIlerlemeDurumu;
  return ILERLEME_DURUM_LABEL[k] || '—';
}
