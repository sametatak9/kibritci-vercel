/** Bekleyen onay kartlarında 24s+ “acil” rozeti — salt görsel */

function parseDocDateTime(tarih?: string | null, saat?: string | null): Date | null {
  if (!tarih) return null;
  const t = String(tarih).trim();
  const timePart = (saat || '00:00').trim().slice(0, 5);

  // yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(`${t.slice(0, 10)}T${timePart}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd.MM.yyyy or dd/MM/yyyy
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(`${iso}T${timePart}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  try {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function isPendingOlderThanHours(
  tarih?: string | null,
  saat?: string | null,
  hours = 24
): boolean {
  const d = parseDocDateTime(tarih, saat);
  if (!d) return false;
  return Date.now() - d.getTime() >= hours * 60 * 60 * 1000;
}
