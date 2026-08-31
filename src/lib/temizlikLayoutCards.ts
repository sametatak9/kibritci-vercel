import type { TemizlikBlokKart, TemizlikKoridorKart } from '../types/erp';
import { koridorlarForParsel, type BacaKoridorTanimi } from './temizlikKirimUtils';
import { PARSEL_BLOK_MAP } from '../data/parselBlokMap';

function slug(s: string): string {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '');
}

export function koridorKartId(parsel: string, kod: string): string {
  return `tkor_${slug(parsel)}_${String(kod || 'KX').replace(/\W+/g, '').toUpperCase()}`;
}

export function blokKartId(parsel: string, blok: string): string {
  return `tblok_${slug(parsel)}_${slug(blok)}`;
}

export function seedKoridorKartlari(parsel: string, kayitTarihi: string): TemizlikKoridorKart[] {
  return koridorlarForParsel(parsel).map((k, i) => ({
    id: koridorKartId(parsel, k.id),
    parsel,
    kod: k.id,
    baslik: k.baslik,
    aciklama: k.aciklama,
    bloklar: [...k.bloklar],
    sira: i + 1,
    kayitTarihi,
  }));
}

export function seedBlokKartlari(parsel: string, kayitTarihi: string): TemizlikBlokKart[] {
  return (PARSEL_BLOK_MAP[parsel] || [])
    .filter((b) => b && b !== 'GENEL SAHA')
    .map((blok) => ({
      id: blokKartId(parsel, blok),
      parsel,
      blok,
      kayitTarihi,
    }));
}

export function resolveKoridorlar(
  parsel: string,
  kartlar: TemizlikKoridorKart[]
): BacaKoridorTanimi[] {
  const mine = kartlar
    .filter((k) => k.parsel === parsel)
    .sort((a, b) => (a.sira || 0) - (b.sira || 0) || String(a.kod).localeCompare(String(b.kod)));
  if (mine.length > 0) {
    return mine.map((k) => ({
      id: k.kod,
      baslik: k.baslik || k.kod,
      aciklama: k.aciklama || '',
      bloklar: k.bloklar || [],
    }));
  }
  return koridorlarForParsel(parsel);
}

export function resolveBlokAdlari(
  parsel: string,
  kartlar: TemizlikBlokKart[],
  extra: string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const b = String(raw || '').trim();
    if (!b || b === 'GENEL SAHA') return;
    const key = b.toLocaleUpperCase('tr-TR');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(b);
  };
  for (const k of kartlar.filter((x) => x.parsel === parsel)) push(k.blok);
  for (const b of extra) push(b);
  if (out.length === 0) {
    for (const b of PARSEL_BLOK_MAP[parsel] || []) push(b);
  }
  return out.sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
}

export function nextKoridorKod(existing: BacaKoridorTanimi[]): string {
  const used = new Set(existing.map((k) => k.id.toUpperCase()));
  for (let i = 1; i <= 40; i++) {
    const kod = `K${i}`;
    if (!used.has(kod)) return kod;
  }
  return `K${Date.now().toString().slice(-4)}`;
}
