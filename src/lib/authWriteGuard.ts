import { isActivePortalDurum, isFounderEmail } from './roleClaims';

/** Firestore permission-denied ve benzer hataları kullanıcıya anlaşılır metne çevirir */
export function formatFirestoreWriteError(err: unknown, fallback = 'Kayıt yazılamadı'): string {
  const code = String((err as { code?: string })?.code || '');
  const msg = String((err as { message?: string })?.message || err || '');
  const blob = `${code} ${msg}`.toLowerCase();
  if (
    code === 'permission-denied' ||
    blob.includes('permission-denied') ||
    blob.includes('missing or insufficient permissions') ||
    blob.includes('oturum yetkisiz')
  ) {
    return 'Oturum yetkisiz (Firestore). Anonim oturum kaydedemez — e-posta ile yeniden giriş yapın.';
  }
  if (blob.includes('firestore_timeout') || blob.includes('timeout') || blob.includes('zaman aşımı')) {
    return 'Kayıt zaman aşımı. Şantiye interneti zayıf olabilir — sistem 3 kez denedi. Kartı kontrol edin; yazıldıysa tekrar basmayın.';
  }
  return msg || fallback;
}

/**
 * ERP yazmadan önce Auth sağlık kontrolü.
 * null = yazmaya uygun; string = kullanıcıya gösterilecek engel mesajı.
 */
export async function assertErpWriteAuth(): Promise<string | null> {
  const { auth } = await import('./firebase');
  const user = auth.currentUser;
  if (!user) {
    return 'Oturum yok. E-posta ile yeniden giriş yapın.';
  }
  if (user.isAnonymous) {
    return 'Anonim oturum ile kayıt yapılamaz. E-posta ile yeniden giriş yapın.';
  }
  try {
    const token = await user.getIdTokenResult();
    const role = String(token.claims.role || '');
    const durum = String(token.claims.durum || '');
    if (isFounderEmail(user.email || String(token.claims.email || ''))) return null;
    // Legacy: henüz claim yok — rules legacyUnclaimedEmailUser ile yazar
    if (!('role' in token.claims)) return null;
    if (!role || role === 'MİSAFİR') {
      return 'Hesap rolü yetersiz (MİSAFİR). Yönetici onayından sonra yeniden giriş yapın.';
    }
    if (!isActivePortalDurum(durum)) {
      return `Hesap durumu kayıt için uygun değil (${durum || 'boş'}). Yönetici hesabı AKTİF yapıp yeniden giriş yapın.`;
    }
    return null;
  } catch {
    return 'Oturum doğrulanamadı. Yeniden giriş yapın.';
  }
}
