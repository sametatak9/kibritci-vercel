import admin from 'firebase-admin';

let initialized = false;

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export function getFirebaseAdmin(): typeof admin {
  if (initialized) return admin;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const cred = JSON.parse(json) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON tanımlı değil. Render Environment veya .env.local dosyasına Firebase service account JSON ekleyin.'
    );
  }

  initialized = true;
  return admin;
}
