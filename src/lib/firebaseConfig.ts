import fileConfig from '../../firebase-applet-config.json';

export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  /** Boş veya yok → Firestore (default) veritabanı */
  firestoreDatabaseId?: string;
}

function env(key: string): string | undefined {
  const v = import.meta.env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Öncelik: Vite ortam değişkenleri (Render) → firebase-applet-config.json
 * kibritci-erp Firebase projesine geçmek için Render'da VITE_FIREBASE_* tanımlayın.
 */
export function resolveFirebaseConfig(): FirebaseClientConfig {
  const fromEnv: Partial<FirebaseClientConfig> = {
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    measurementId: env('VITE_FIREBASE_MEASUREMENT_ID'),
    firestoreDatabaseId: env('VITE_FIREBASE_FIRESTORE_DATABASE_ID'),
  };

  const merged: FirebaseClientConfig = {
    projectId: fromEnv.projectId ?? fileConfig.projectId,
    appId: fromEnv.appId ?? fileConfig.appId,
    apiKey: fromEnv.apiKey ?? fileConfig.apiKey,
    authDomain: fromEnv.authDomain ?? fileConfig.authDomain,
    storageBucket: fromEnv.storageBucket ?? fileConfig.storageBucket,
    messagingSenderId: fromEnv.messagingSenderId ?? fileConfig.messagingSenderId,
    measurementId: fromEnv.measurementId ?? fileConfig.measurementId,
    firestoreDatabaseId:
      fromEnv.firestoreDatabaseId ?? fileConfig.firestoreDatabaseId ?? undefined,
  };

  return merged;
}

export function getFirestoreDatabaseId(config: FirebaseClientConfig): string | undefined {
  const id = config.firestoreDatabaseId?.trim();
  if (!id || id === '(default)' || id === 'default') return undefined;
  return id;
}
