/** Sidebar / Ctrl+K ortak tercihler — ACL'ye dokunmaz */

export const FAVORITES_STORAGE_KEY = 'kibritci_sidebar_favorites_v1';
export const RECENT_TABS_STORAGE_KEY = 'kibritci_recent_tabs_v1';
const MAX_RECENT = 8;

export function readFavoriteTabs(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavoriteTabs(keys: string[]) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(keys));
    window.dispatchEvent(new CustomEvent('kibritci-favorites-changed'));
  } catch {
    /* ignore */
  }
}

export function toggleFavoriteTab(key: string): string[] {
  const prev = readFavoriteTabs();
  const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
  writeFavoriteTabs(next);
  return next;
}

export function readRecentTabs(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TABS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentTab(key: string) {
  if (!key || key === 'ana_sayfa') {
    // ana_sayfa da kaydedilebilir ama listeyi şişirmesin diye yine ekle
  }
  try {
    const prev = readRecentTabs().filter((k) => k !== key);
    const next = [key, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_TABS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
