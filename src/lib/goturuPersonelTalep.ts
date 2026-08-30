export const GOTURU_PERSONEL_KAYNAK = 'GOTURU';
export const GOTURU_FIRMA_ADI = 'SERAMİK EKİBİ';
export const GOTURU_DEFAULT_GOREV = 'SERAMİKÇİ';
export const GOTURU_GOREV_OPTIONS = ['SERAMİKÇİ', 'FAYANSÇI', 'GÖTÜRÜ'] as const;

export function isGoturuPersonelTalep(item?: { kaynak?: string } | Record<string, unknown> | null): boolean {
  return String((item as { kaynak?: string } | undefined)?.kaynak || '').toUpperCase() === GOTURU_PERSONEL_KAYNAK;
}
