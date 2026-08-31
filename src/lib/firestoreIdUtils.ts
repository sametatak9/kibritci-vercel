/** Firestore doc id parçası — `/` ve `\` yol ayırıcı sayılır, encode edilir. */
export function encodeFirestoreDocIdSegment(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\/\\]/g, '-');
}

/** Birleşik Firestore belge kimliği (ör. parsel|blok|daire). */
export function joinFirestoreDocId(...parts: string[]): string {
  return parts.map(encodeFirestoreDocIdSegment).join('|');
}

/** Eski kimlik (yalnızca boşluk → `_`); okuma uyumluluğu için. */
export function legacyFirestoreDocId(...parts: string[]): string {
  return parts.map((p) => String(p ?? '').trim().replace(/\s+/g, '_')).join('|');
}
