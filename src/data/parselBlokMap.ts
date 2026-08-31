/** Şantiye parsel / blok hiyerarşisi — Saha Faaliyetleri, Formen Mobil, Kolaj, Analiz */
export const PARSEL_BLOK_MAP: Record<string, string[]> = {
  'GENEL SAHA': [],
  'Parsel Bölge 157/46': ['GENEL SAHA', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2', 'G', 'H', 'I'],
  'Parsel Bölge 157/51': ['GENEL SAHA', 'A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4'],
  'Parsel Bölge 160/2': ['GENEL SAHA', 'A1A', 'A1B', 'A2A', 'A2B', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'B3'],
};

export const PARSEL_LIST = Object.keys(PARSEL_BLOK_MAP);

export function blokListForParsel(parsel: string): string[] {
  return PARSEL_BLOK_MAP[parsel] || [];
}

export function defaultBlokForParsel(parsel: string): string {
  const bloks = blokListForParsel(parsel);
  return bloks.length > 0 ? bloks[0] : 'GENEL SAHA';
}
