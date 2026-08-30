import fs from 'fs';
import path from 'path';

export interface PendingSignupRecord {
  id: string;
  email: string;
  password: string;
  ad: string;
  soyad: string;
  tcNo: string;
  imzaText?: string;
  imzaStyle?: string;
  imzaCanvas?: string;
  matchedPersonelId?: string | null;
  kaynak?: string;
  durum?: string;
  olusturulma: string;
  hataSebebi?: string;
  apiYedek?: boolean;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'pending-signups.json');

function ensureDir(): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

export function readPendingSignups(): PendingSignupRecord[] {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingSignups(items: PendingSignupRecord[]): void {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

export function upsertPendingSignup(record: PendingSignupRecord): PendingSignupRecord {
  const emailKey = record.email.trim().toLowerCase();
  const normalized = { ...record, id: emailKey, email: emailKey };
  const items = readPendingSignups().filter((x) => x.email !== emailKey);
  items.push(normalized);
  writePendingSignups(items);
  return normalized;
}

export function deletePendingSignup(email: string): boolean {
  const emailKey = email.trim().toLowerCase();
  const items = readPendingSignups();
  const next = items.filter((x) => x.email !== emailKey);
  if (next.length === items.length) return false;
  writePendingSignups(next);
  return true;
}

export function listPendingSignups(): PendingSignupRecord[] {
  return readPendingSignups()
    .filter((x) => (x.durum || 'BEKLEMEDE') === 'BEKLEMEDE')
    .sort(
      (a, b) =>
        new Date(b.olusturulma).getTime() - new Date(a.olusturulma).getTime()
    );
}
