/** Firebase Auth custom claims + Firestore rules ile paylaşılan rol sabitleri */

export const MOBILE_ROLES = ['FORMEN', 'GÜVENLİK', 'KAMPÇI', 'LOJİSTİK', 'DEPOCU', 'ANAHTARCI'] as const;

export const FINANCE_DESK_ROLES = [
  'YÖNETİCİ',
  'MUHASEBE',
  'İDARİ_İŞLER',
  'ŞANTİYE_ŞEFİ',
] as const;

export type PortalRole = (typeof FINANCE_DESK_ROLES)[number] | (typeof MOBILE_ROLES)[number] | 'MİSAFİR' | string;

export interface AuthCustomClaims {
  role: string;
  durum: string;
  email: string;
}

export const FOUNDER_EMAILS = ['sametatak9@gmail.com', 'santiye@kibritci.com'] as const;

const FOUNDER_PASSWORDS: Record<string, string> = {
  'sametatak9@gmail.com': '117270Sa',
  'santiye@kibritci.com': 'kibritci2026',
};

export function isFounderEmail(email?: string | null): boolean {
  const key = email?.trim().toLowerCase() || '';
  return (FOUNDER_EMAILS as readonly string[]).includes(key);
}

export function verifyFounderCredentials(email: string, password: string): boolean {
  const key = email.trim().toLowerCase();
  return FOUNDER_PASSWORDS[key] === password;
}

export function normalizeClaimRole(yetki?: string | null): string {
  if (!yetki) return 'MİSAFİR';
  let v = String(yetki).trim().toLocaleUpperCase('tr-TR');
  const aliases: Record<string, string> = {
    KAMPCI: 'KAMPÇI',
    KAMPCİ: 'KAMPÇI',
    GUVENLIK: 'GÜVENLİK',
    LOJISTIK: 'LOJİSTİK',
    DEPO: 'DEPOCU',
    ŞÖFÖR: 'LOJİSTİK',
    ŞOFÖR: 'LOJİSTİK',
    SOFÖR: 'LOJİSTİK',
    SOFOR: 'LOJİSTİK',
    DRIVER: 'LOJİSTİK',
  };
  return aliases[v] ?? v;
}

export function buildAuthCustomClaims(input: {
  email: string;
  yetki?: string | null;
  durum?: string | null;
}): AuthCustomClaims {
  const email = input.email.trim().toLowerCase();
  return {
    email,
    role: normalizeClaimRole(input.yetki),
    durum: String(input.durum || 'ONAY BEKLİYOR').trim(),
  };
}

export function isMobileClaimRole(role: string): boolean {
  return (MOBILE_ROLES as readonly string[]).includes(normalizeClaimRole(role));
}

export function isFinanceDeskRole(role: string): boolean {
  return (FINANCE_DESK_ROLES as readonly string[]).includes(normalizeClaimRole(role));
}
