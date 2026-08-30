/** Word antetli şablon — beyaz zemin üzerinde logo + hologram kaynağı */
export const KIBRITCI_ANTET_PATH = '/kibritci-antetli.png';

export function getAntetliUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${KIBRITCI_ANTET_PATH}`;
  }
  return KIBRITCI_ANTET_PATH;
}

/** Antetli PNG yarı ölçek genişliği (orijinal 1837px) */
export const ANTET_SCALE_WIDTH = 918;
