/** Firebase Auth custom claims + Firestore rules ile paylaşılan rol sabitleri */

export const MOBILE_ROLES = [
  'FORMEN',
  'GÜVENLİK',
  'KAMPÇI',
  'TESİSATÇI',
  'MERMERCİ',
  'GÖTÜRÜ',
  'LOJİSTİK',
  'OPERATÖR',
  'DEPOCU',
  'ANAHTARCI',
] as const;

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
  'sametatak9@gmail.com': '117270.Sametatak',
  'santiye@kibritci.com': 'kibritci2026',
};

/** Eski kurucu şifreleri — Auth henüz güncellenmeden giriş kabulü için */
const FOUNDER_PASSWORD_ALIASES: Record<string, string[]> = {
  'sametatak9@gmail.com': ['117270.Sametatak', '117270Sa'],
  'santiye@kibritci.com': ['kibritci2026'],
};

export function isFounderEmail(email?: string | null): boolean {
  const key = email?.trim().toLowerCase() || '';
  return (FOUNDER_EMAILS as readonly string[]).includes(key);
}

export function getFounderCanonicalPassword(email: string): string | undefined {
  return FOUNDER_PASSWORDS[email.trim().toLowerCase()];
}

export function getFounderPasswordAliases(email: string): string[] {
  const key = email.trim().toLowerCase();
  return FOUNDER_PASSWORD_ALIASES[key] || (FOUNDER_PASSWORDS[key] ? [FOUNDER_PASSWORDS[key]] : []);
}

export function verifyFounderCredentials(email: string, password: string): boolean {
  const key = email.trim().toLowerCase();
  const aliases = FOUNDER_PASSWORD_ALIASES[key];
  if (aliases) return aliases.includes(password);
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
    TESISATCI: 'TESİSATÇI',
    TESİSATCI: 'TESİSATÇI',
    MERMERCI: 'MERMERCİ',
    GOTURU: 'GÖTÜRÜ',
    GÖTURU: 'GÖTÜRÜ',
    SERAMIK: 'GÖTÜRÜ',
    SERAMİK: 'GÖTÜRÜ',
    OPERATOR: 'OPERATÖR',
    OPERATÖR: 'OPERATÖR',
  };
  return aliases[v] ?? v;
}

/** Firestore rules ile uyumlu: AKTIF (ASCII) → AKTİF (Türkçe İ) */
export function normalizeClaimDurum(durum?: string | null): string {
  const raw = String(durum || 'ONAY BEKLİYOR').trim();
  if (!raw) return 'ONAY BEKLİYOR';
  const upper = raw.toLocaleUpperCase('tr-TR');
  // ASCII I / Turkish İ / mixed "AKTIF"
  const compact = upper.replace(/\s+/g, '');
  if (compact === 'AKTİF' || compact === 'AKTIF' || compact === 'ACTIVE') return 'AKTİF';
  if (compact === 'KISITLI' || compact.replace(/İ/g, 'I') === 'KISITLI') return 'KISITLI';
  if (upper.includes('ONAY') && upper.includes('BEK')) return 'ONAY BEKLİYOR';
  return upper;
}

export function isActivePortalDurum(durum?: string | null): boolean {
  const n = normalizeClaimDurum(durum);
  return n === 'AKTİF';
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
    durum: normalizeClaimDurum(input.durum),
  };
}

export function isMobileClaimRole(role: string): boolean {
  return (MOBILE_ROLES as readonly string[]).includes(normalizeClaimRole(role));
}

export function isFinanceDeskRole(role: string): boolean {
  return (FINANCE_DESK_ROLES as readonly string[]).includes(normalizeClaimRole(role));
}
