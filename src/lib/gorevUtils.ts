/** Görev adlarını rapor / gruplama için standartlaştırır */

function gorevAsciiKey(gorev: string): string {
  return gorev
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ğ/g, 'G')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeGorev(gorev?: string): string {
  if (!gorev?.trim()) return 'DÜZ İŞÇİ';
  const key = gorevAsciiKey(gorev);

  if (
    key === 'D ISCI' ||
    key === 'DUZ ISCI' ||
    key === 'ISCI' ||
    key === 'DUZISCI'
  ) {
    return 'DÜZ İŞÇİ';
  }

  // FORMEN / Formen / FORMAN / "şantiye formeni" → tek grup
  if (key.includes('FORMEN') || key.includes('FORMAN')) {
    return 'FORMEN';
  }

  // KAMPÇI / Kampçı / KAMP GÖREVLİSİ / KAMP PERSONEL → tek çatı
  if (
    key === 'KAMPCI' ||
    key.startsWith('KAMPCI ') ||
    key === 'KAMP PERSONEL' ||
    key === 'KAMP PERSONELI' ||
    key === 'KAMP GOREVLISI' ||
    key === 'KAMP GOREVLI' ||
    key.includes('KAMP GOREV')
  ) {
    return 'KAMPÇI';
  }

  // Aynı yazım farklı büyük/küçük harf → tek satır
  return gorev.trim().toLocaleUpperCase('tr-TR');
}

/** ZER YAPI / hakediş — görev adında USTA geçenler (yardımcı usta dahil) */
export function isUstaGorev(gorev?: string): boolean {
  const key = gorevAsciiKey(String(gorev || ''));
  if (!key) return false;
  // "FORMEN" usta sayılmaz
  if (key.includes('FORMEN') || key.includes('FORMAN')) return false;
  return key.includes('USTA');
}
