export type KampTahliyeChoice =
  | { mode: 'cancelled' }
  | { mode: 'oda' }
  | { mode: 'isten'; cikisTarihi: string; cikisNedeni: string };

function promptIstenCikisDetaylari(personelIsim: string): { cikisTarihi: string; cikisNedeni: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const cikisTarihiRaw = window.prompt(
    `${personelIsim} — planlanan işten çıkış tarihi (YYYY-MM-DD):`,
    today
  );
  if (cikisTarihiRaw === null) return null;

  const cikisTarihi = cikisTarihiRaw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cikisTarihi)) {
    window.alert('Geçerli bir tarih girin (YYYY-MM-DD).');
    return promptIstenCikisDetaylari(personelIsim);
  }

  const cikisNedeniRaw = window.prompt(
    `${personelIsim} — işten çıkış açıklaması / gerekçe (zorunlu):`,
    ''
  );
  if (cikisNedeniRaw === null) return null;

  const cikisNedeni = cikisNedeniRaw.trim();
  if (!cikisNedeni) {
    window.alert('İşten çıkış açıklaması zorunludur.');
    return promptIstenCikisDetaylari(personelIsim);
  }

  return { cikisTarihi, cikisNedeni };
}

/**
 * Kampçı tahliye akışı:
 * - Ana firma: yalnız odadan tahliye
 * - Taşeron: 1 = odadan tahliye (hemen) · 2 = işten çıkarma talebi (yönetici onayı)
 */
export function resolveKampTahliyeChoice(personelIsim: string, anaFirma: boolean): KampTahliyeChoice {
  if (anaFirma) {
    const ok = window.confirm(
      `${personelIsim} odadan tahliye edilsin mi?\n\nAna firma personeli için işten çıkış yapılmaz.`
    );
    return ok ? { mode: 'oda' } : { mode: 'cancelled' };
  }

  const raw = window.prompt(
    `${personelIsim} — ne yapılsın?\n\n` +
      `1 = Sadece odadan tahliye (hemen, yönetici onayı yok)\n` +
      `2 = İşten çıkarma talebi (tarih + açıklama → yönetici onayı)\n\n` +
      `Seçiminiz (1 veya 2):`,
    '1'
  );
  if (raw === null) return { mode: 'cancelled' };

  const choice = raw.trim();
  if (choice === '1') {
    const ok = window.confirm(
      `${personelIsim} sadece odadan tahliye edilsin mi?\n\nPersonel aktif kalır; yönetici onayı gerekmez.`
    );
    return ok ? { mode: 'oda' } : { mode: 'cancelled' };
  }

  if (choice === '2') {
    const detay = promptIstenCikisDetaylari(personelIsim);
    if (!detay) return { mode: 'cancelled' };
    return { mode: 'isten', ...detay };
  }

  window.alert('Geçersiz seçim. Lütfen 1 veya 2 girin.');
  return resolveKampTahliyeChoice(personelIsim, anaFirma);
}

export function buildKampIstenCikisNedeni(options: {
  odaNo?: string;
  kaynak: 'KAMPCI_TAHLIYE' | 'KAMPCI_HAFTALIK_TAHLIYE' | 'KAMPCI_TASERON_SAYIM';
  aciklama: string;
}): string {
  const odaPart = options.odaNo ? ` · Oda ${options.odaNo}` : '';
  const kaynakLabel =
    options.kaynak === 'KAMPCI_HAFTALIK_TAHLIYE'
      ? 'haftalık sayım'
      : options.kaynak === 'KAMPCI_TASERON_SAYIM'
        ? 'taşeron sayım'
        : 'kamp tahliyesi';
  return `Kamp ${kaynakLabel}${odaPart} — ${options.aciklama.trim()} (yönetici onayı bekleniyor)`;
}
