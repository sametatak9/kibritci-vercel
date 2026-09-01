/** Birleşik İrsaliye & Fatura çalışma alanı — eski sekmeler buraya yönlenir. */

export const IRSALIYE_FATURA_TAB = 'irsaliye_fatura';

export type IrsaliyeFaturaPane =
  | 'irsaliye'
  | 'fatura'
  | 'birlestir'
  | 'karsilastir'
  | 'isci';

export const IRSALIYE_FATURA_PANES: {
  key: IrsaliyeFaturaPane;
  label: string;
  hint: string;
}[] = [
  { key: 'irsaliye', label: 'İrsaliye', hint: 'Fiş / irsaliye girişi — mevcut kayıt mantığı' },
  { key: 'fatura', label: 'Fatura', hint: 'Paraşüt tarzı fatura girişi' },
  { key: 'birlestir', label: 'Birleştir', hint: 'Esnek evrak bağlama (SA · İR · FT)' },
  { key: 'karsilastir', label: 'Karşılaştır', hint: 'Birleşen evraklarda kalem karşılaştırması' },
  { key: 'isci', label: 'İşçi girişi', hint: 'WhatsApp ile işçi / personel giriş talebi' },
];

export const LEGACY_EVRAK_TABS: Record<string, IrsaliyeFaturaPane> = {
  irsaliye_giris: 'irsaliye',
  fatura_giris: 'fatura',
  evrak_baglama: 'birlestir',
  yz_karsilastir: 'karsilastir',
};

export const PANE_STORAGE_KEY = 'kibritci_irsaliye_fatura_pane';

export function isLegacyEvrakTab(tab: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_EVRAK_TABS, tab);
}

export function canonicalizePortalTab(tab: string): string {
  return isLegacyEvrakTab(tab) ? IRSALIYE_FATURA_TAB : tab;
}

export function paneForTab(tab: string): IrsaliyeFaturaPane | null {
  return LEGACY_EVRAK_TABS[tab] ?? null;
}

export function readWorkspacePane(fallback: IrsaliyeFaturaPane = 'irsaliye'): IrsaliyeFaturaPane {
  try {
    const raw = sessionStorage.getItem(PANE_STORAGE_KEY);
    if (raw && IRSALIYE_FATURA_PANES.some((p) => p.key === raw)) {
      return raw as IrsaliyeFaturaPane;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeWorkspacePane(pane: IrsaliyeFaturaPane): void {
  try {
    sessionStorage.setItem(PANE_STORAGE_KEY, pane);
  } catch {
    /* ignore */
  }
}

/** Eski kısıt listesinde her iki giriş de kapalıysa birleşik sayfa da kapalı. */
export function isIrsaliyeFaturaRestricted(kisitliSayfalar?: string[] | null): boolean {
  if (!kisitliSayfalar?.length) return false;
  if (kisitliSayfalar.includes(IRSALIYE_FATURA_TAB)) return true;
  const irBlocked = kisitliSayfalar.includes('irsaliye_giris');
  const ftBlocked = kisitliSayfalar.includes('fatura_giris');
  return irBlocked && ftBlocked;
}
