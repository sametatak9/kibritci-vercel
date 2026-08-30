/** İmzalı evrak dosya adı ile evrak no uyumsuzluğu — basit sezgisel kontrol */
export function signedDocMayMismatch(fileName: string, evrakNo: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]/gi, '')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

  const fn = norm(fileName);
  const no = norm(evrakNo);
  if (!no || no.length < 3) return false;
  const chunk = no.slice(0, Math.min(6, no.length));
  return fn.length > 0 && !fn.includes(chunk);
}

export function confirmSignedUploadWithMismatchCheck(
  fileName: string,
  evrakNo: string,
  evrakLabel: string
): { proceed: boolean; uyumsuz: boolean } {
  if (!signedDocMayMismatch(fileName, evrakNo)) {
    return { proceed: true, uyumsuz: false };
  }
  const proceed = window.confirm(
    `⚠️ Uyarı: "${fileName}" dosyası ${evrakLabel} (${evrakNo}) ile eşleşmiyor olabilir.\n\n` +
      `Başka bir evrak yüklenmiş olabilir. Yine de yüklemek istiyor musunuz?\n` +
      `(Evet → yükleme yapılır ve evrak ⚠️ işareti ile onaylanır)`
  );
  return { proceed, uyumsuz: proceed };
}
