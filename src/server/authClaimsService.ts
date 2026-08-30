import { randomBytes } from 'crypto';
import { getFirebaseAdmin } from './firebaseAdmin';
import { AuthCustomClaims, buildAuthCustomClaims, isFounderEmail, normalizeClaimRole, verifyFounderCredentials } from '../lib/roleClaims';

export async function readKullaniciClaimsSource(email: string): Promise<AuthCustomClaims | null> {
  const admin = getFirebaseAdmin();
  const emailKey = email.trim().toLowerCase();
  const snap = await admin.firestore().collection('kullanicilar').doc(emailKey).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return buildAuthCustomClaims({
    email: emailKey,
    yetki: String(data.yetki || data.role || 'MİSAFİR'),
    durum: String(data.durum || 'ONAY BEKLİYOR'),
  });
}

export async function ensureAuthUser(email: string, password?: string): Promise<string> {
  const admin = getFirebaseAdmin();
  const emailKey = email.trim().toLowerCase();
  try {
    const existing = await admin.auth().getUserByEmail(emailKey);
    return existing.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== 'auth/user-not-found') throw err;
    if (!password) {
      throw new Error(`Firebase Auth kullanıcısı yok: ${emailKey}. Şifre ile oluşturulmalı.`);
    }
    const created = await admin.auth().createUser({
      email: emailKey,
      password,
      emailVerified: true,
    });
    return created.uid;
  }
}

export async function setUserCustomClaims(uid: string, claims: AuthCustomClaims): Promise<void> {
  const admin = getFirebaseAdmin();
  await admin.auth().setCustomUserClaims(uid, {
    role: claims.role,
    durum: claims.durum,
    email: claims.email,
  });
}

export async function syncClaimsForEmail(email: string, password?: string): Promise<AuthCustomClaims> {
  const claims = await readKullaniciClaimsSource(email);
  if (!claims) {
    throw new Error(`kullanicilar/${email.trim().toLowerCase()} bulunamadı`);
  }
  const uid = await ensureAuthUser(email, password);
  await setUserCustomClaims(uid, claims);
  return claims;
}

export async function verifyIdToken(idToken: string) {
  const admin = getFirebaseAdmin();
  return admin.auth().verifyIdToken(idToken);
}

export function callerIsYonetici(decoded: { role?: string; email?: string; [key: string]: unknown }): boolean {
  if (normalizeClaimRole(String(decoded.role || '')) === 'YÖNETİCİ') return true;
  return isFounderEmail(String(decoded.email || ''));
}

/** Kurucu hesap: Auth şifresini senkronize eder, Firestore kaydı ve YÖNETİCİ claim yazar */
export async function bootstrapFounderAccount(email: string, password: string): Promise<AuthCustomClaims> {
  if (!verifyFounderCredentials(email, password)) {
    throw new Error('Geçersiz kurucu giriş bilgileri');
  }

  const admin = getFirebaseAdmin();
  const emailKey = email.trim().toLowerCase();
  const claims: AuthCustomClaims = {
    email: emailKey,
    role: 'YÖNETİCİ',
    durum: 'AKTİF',
  };
  const today = new Date().toISOString().split('T')[0];

  await admin.firestore().collection('kullanicilar').doc(emailKey).set(
    {
      id: emailKey,
      email: emailKey,
      yetki: 'YÖNETİCİ',
      durum: 'AKTİF',
      kayitTarihi: today,
      yetkiUpdatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  await admin.firestore().collection('portalKullanicilar').doc(emailKey).set(
    {
      email: emailKey,
      password,
      role: 'YÖNETİCİ',
      yetki: 'YÖNETİCİ',
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  let uid: string;
  try {
    const existing = await admin.auth().getUserByEmail(emailKey);
    uid = existing.uid;
    await admin.auth().updateUser(uid, { password, emailVerified: true });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== 'auth/user-not-found') throw err;
    const created = await admin.auth().createUser({
      email: emailKey,
      password,
      emailVerified: true,
    });
    uid = created.uid;
  }

  await setUserCustomClaims(uid, claims);
  return claims;
}

async function emailMayResetPassword(emailKey: string): Promise<boolean> {
  const admin = getFirebaseAdmin();
  if (isFounderEmail(emailKey)) return true;
  const [userSnap, portalSnap] = await Promise.all([
    admin.firestore().collection('kullanicilar').doc(emailKey).get(),
    admin.firestore().collection('portalKullanicilar').doc(emailKey).get(),
  ]);
  return userSnap.exists || portalSnap.exists;
}

/** Firebase Auth kaydı yoksa oluşturur; böylece sendPasswordResetEmail gerçekten e-posta gönderir */
export async function preparePasswordReset(email: string): Promise<{ prepared: boolean; created: boolean }> {
  const admin = getFirebaseAdmin();
  const emailKey = email.trim().toLowerCase();
  if (!emailKey) throw new Error('E-posta zorunlu');

  const allowed = await emailMayResetPassword(emailKey);
  if (!allowed) {
    return { prepared: true, created: false };
  }

  // Admin paneline bildirim düşmesi için Firestore belgesine talep bayrağını yazıyoruz
  await admin.firestore().collection('kullanicilar').doc(emailKey).set({
    sifreSifirlamaTalebi: true
  }, { merge: true }).catch((e) => {
    console.warn('sifreSifirlamaTalebi yazilamadi:', e);
  });

  try {
    await admin.auth().getUserByEmail(emailKey);
    return { prepared: true, created: false };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== 'auth/user-not-found') throw err;
  }

  const tempPassword = randomBytes(24).toString('base64url');
  const created = await admin.auth().createUser({
    email: emailKey,
    password: tempPassword,
    emailVerified: isFounderEmail(emailKey),
  });

  if (isFounderEmail(emailKey)) {
    await setUserCustomClaims(created.uid, {
      email: emailKey,
      role: 'YÖNETİCİ',
      durum: 'AKTİF',
    });
  } else {
    const claims = await readKullaniciClaimsSource(emailKey);
    if (claims) {
      await setUserCustomClaims(created.uid, claims);
    }
  }

  return { prepared: true, created: true };
}
