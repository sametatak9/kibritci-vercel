import { auth } from './firebase';

export interface SyncedClaims {
  role: string;
  durum: string;
  email: string;
}

/** Sunucudan Firestore kullanicilar kaydına göre custom claims yazar ve token yeniler */
export async function syncAuthClaimsFromServer(targetEmail?: string): Promise<SyncedClaims | null> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/sync-claims', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(targetEmail ? { email: targetEmail.trim().toLowerCase() } : {}),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[authClaims] sync başarısız:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { claims: SyncedClaims };
  await user.getIdToken(true);
  return data.claims;
}

/** Yönetici: yeni kullanıcı için Auth hesabı oluşturur ve claim yazar */
export async function provisionAuthUser(
  email: string,
  password: string
): Promise<SyncedClaims | null> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/provision-user', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[authClaims] provision başarısız:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { claims: SyncedClaims };
  return data.claims;
}

/** Yönetici (sametatak9@gmail.com): bir kullanıcının şifresini Auth üzerinde günceller; Auth yoksa oluşturur */
export async function adminUpdateUserPassword(
  email: string,
  password: string
): Promise<{ created: boolean }> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return { created: false };

  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/admin/update-user', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const raw = String(data.error || '');
    if (raw.includes('user-not-found') || raw.includes('no user record')) {
      throw new Error(
        'Firebase giriş hesabı bulunamadı ve oluşturulamadı. Render\'da FIREBASE_SERVICE_ACCOUNT_JSON tanımlı mı kontrol edin.'
      );
    }
    throw new Error(raw || 'Şifre güncellenemedi.');
  }

  const data = (await res.json()) as { created?: boolean };
  return { created: Boolean(data.created) };
}
