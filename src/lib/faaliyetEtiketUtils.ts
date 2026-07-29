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

export type FaaliyetAsamaAnahtari = 'BASLANGIC' | 'ILERLEME' | 'BITIS';

export const FAALIYET_ASAMA_ONSETLERI: Array<{
  key: FaaliyetAsamaAnahtari;
  label: string;
  hint: string;
}> = [
  { key: 'BASLANGIC', label: 'Başlangıç', hint: 'İşe başlarken / önce' },
  { key: 'ILERLEME', label: 'Devam', hint: 'Sıradaki aşama / ara' },
  { key: 'BITIS', label: 'Bitiş', hint: 'Tamamlandıktan sonra' },
];

export const FAALIYET_ASAMA_LABEL: Record<FaaliyetAsamaAnahtari, string> = {
  BASLANGIC: 'Başlangıç',
  ILERLEME: 'Devam',
  BITIS: 'Bitiş',
};

export function normalizeFaaliyetAsama(raw?: string | null): FaaliyetAsamaAnahtari | '' {
  const k = String(raw || '').trim().toLocaleUpperCase('tr-TR');
  if (k === 'BASLANGIC' || k === 'BAŞLANGIÇ' || k === 'ONCE' || k === 'ÖNCE') return 'BASLANGIC';
  if (k === 'ILERLEME' || k === 'DEVAM' || k === 'ARA') return 'ILERLEME';
  if (k === 'BITIS' || k === 'BİTİŞ' || k === 'SONRA' || k === 'TAMAM') return 'BITIS';
  return '';
}

export function faaliyetAsamaLabel(raw?: string | null): string {
  const k = normalizeFaaliyetAsama(raw);
  return k ? FAALIYET_ASAMA_LABEL[k] : '';
}
