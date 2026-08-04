import { Personel } from '../types/erp';

/** Personelde eksik görülen temel alanlar — salt uyarı, kayıt engellemez. */
export type PersonelMissingField =
  | 'TC No'
  | 'IBAN'
  | 'İşe Giriş'
  | 'SGK'
  | 'Fotoğraf'
  | 'Sigorta Evrakı'
  | 'Telefon';

function hasPhoto(p: Personel): boolean {
  const anyP = p as Personel & { fotograf_url?: string };
  return Boolean(String(p.fotografUrl || anyP.fotograf_url || '').trim());
}

/** TC numarasının geçerli format olup olmadığını kontrol et (11 haneli, sıfırla başlamayan) */
export function isTcNoValid(tc: string): boolean {
  const trimmed = String(tc || '').trim().replace(/\s/g, '');
  if (!trimmed) return false;
  if (!/^\d{11}$/.test(trimmed)) return false;
  if (trimmed[0] === '0') return false;
  return true;
}

/** IBAN'ın TR formatında geçerli olup olmadığını kontrol et (TR + 24 rakam = 26 karakter) */
export function isIbanValid(iban: string): boolean {
  const trimmed = String(iban || '').trim().replace(/\s/g, '').toUpperCase();
  if (!trimmed) return false;
  return /^TR\d{24}$/.test(trimmed);
}

export function getPersonelMissingDocs(p: Personel): PersonelMissingField[] {
  const missing: PersonelMissingField[] = [];
  if (!isTcNoValid(p.tcNo)) missing.push('TC No');
  if (!isIbanValid(p.ibanNo)) missing.push('IBAN');
  if (!String(p.iseGirisTarihi || '').trim()) missing.push('İşe Giriş');
  if (!String(p.sgkDurumu || '').trim()) missing.push('SGK');
  if (!hasPhoto(p)) missing.push('Fotoğraf');
  // Sigorta evrakı yalnızca SGK'lı personelde zorunlu sayılır
  const sgk = String(p.sgkDurumu || '');
  if (sgk.includes('SGK') && !String(p.sigortaEvrakUrl || '').trim()) {
    missing.push('Sigorta Evrakı');
  }
  if (!String(p.telefonNo || '').trim()) missing.push('Telefon');
  return missing;
}

export function formatPersonelMissingDocs(p: Personel): string {
  return getPersonelMissingDocs(p).join(', ');
}

export function hasPersonelMissingDocs(p: Personel): boolean {
  return getPersonelMissingDocs(p).length > 0;
}

/** Yalnızca TC / IBAN eksik/hatalı personelleri filtrele */
export function getPersonellerWithMissingTcIban(personeller: Personel[]): Array<{
  personel: Personel;
  eksikTc: boolean;
  eksikIban: boolean;
}> {
  return personeller
    .map((p) => ({
      personel: p,
      eksikTc: !isTcNoValid(p.tcNo),
      eksikIban: !isIbanValid(p.ibanNo),
    }))
    .filter((r) => r.eksikTc || r.eksikIban);
}

