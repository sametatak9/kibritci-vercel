/** Kaldırılan placeholder idari kayıtları — bir daha seed ile gelmesin */
export const REMOVED_IDARI_PLACEHOLDER_TCS = new Set(['23479948444', '14372424838']);

const STORAGE_KEY = 'kibritci_suppressed_personel_tcs_v1';

function readSet(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((t) => /^\d{11}$/.test(String(t || '').trim())));
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* no-op */
  }
}

export function loadSuppressedPersonelTcs(): Set<string> {
  return readSet();
}

export function isPersonelTcSuppressed(tc?: string | null): boolean {
  const t = String(tc || '').trim();
  if (!/^\d{11}$/.test(t)) return false;
  return readSet().has(t);
}

export function suppressPersonelTc(tc?: string | null): void {
  const t = String(tc || '').trim();
  if (!/^\d{11}$/.test(t)) return;
  const set = readSet();
  if (set.has(t)) return;
  set.add(t);
  writeSet(set);
}

export function suppressPersonelTcsFromDeleted(
  deleted: Array<{ tcNo?: string | null }>
): number {
  let added = 0;
  const set = readSet();
  for (const p of deleted) {
    const t = String(p.tcNo || '').trim();
    if (!/^\d{11}$/.test(t)) continue;
    if (!set.has(t)) {
      set.add(t);
      added += 1;
    }
  }
  if (added > 0) writeSet(set);
  return added;
}
