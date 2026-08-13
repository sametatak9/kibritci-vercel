/**
 * Mobil el terminali kayıtlarında otomatik personel etiketleme.
 * Kampçı / Tesisatçı / Mermerci: yalnızca kendi görev grubundaki Geldi personeller.
 */
import { AylikYoklamaMap, Personel } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import {
  getYoklamaDay,
  isIdariPersonel,
  isKampciGorev,
  isMermerciGorev,
  isOperatorGorev,
  isSeramikEkibiPersonel,
  isSeramikGorev,
  isSoforGorev,
  isTaseronPersonel,
  isTesisatciGorev,
} from './yoklamaUtils';
import { normalizeGorev } from './gorevUtils';

export type MobilRolEtiket =
  | 'KAMPCI'
  | 'TESISATCI'
  | 'MERMERCI'
  | 'SERAMIK'
  | 'SOFOR'
  | 'OPERATOR';

function isKampciRol(gorev?: string): boolean {
  if (isKampciGorev(gorev)) return true;
  return normalizeGorev(gorev) === 'KAMPÇI';
}

function parseDateParts(dateKey: string): { y: number; m: number; d: number } | null {
  const key = normalizeDateKey(dateKey) || dateKey;
  const parts = String(key).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !n)) return null;
  return { y: parts[0], m: parts[1], d: parts[2] };
}

function isAktifPersonel(p: Personel): boolean {
  if (String(p.istenCikisTarihi || '').trim()) return false;
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

export function roleGorevMatcher(rol: MobilRolEtiket): (gorev?: string) => boolean {
  if (rol === 'KAMPCI') return isKampciRol;
  if (rol === 'TESISATCI') return isTesisatciGorev;
  if (rol === 'MERMERCI') return isMermerciGorev;
  if (rol === 'SERAMIK') return (gorev?: string) => isSeramikGorev(gorev);
  if (rol === 'SOFOR') return isSoforGorev;
  return isOperatorGorev;
}

function isGeldiDurum(durum?: string | null): boolean {
  const d = String(durum || '').toLowerCase();
  return (
    d.includes('geldi') ||
    d === 'var' ||
    d === 'çalıştı' ||
    d === 'calisti'
  );
}

/**
 * O gün yoklamada Geldi (veya eşdeğeri) olan, verilen roldeki personel id'leri.
 * Taşeron / idari / işten çıkmış hariç. Yerleşim veya diğer görevler dahil edilmez.
 */
export function resolveGeldiRolPersonelIds(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  dateKey: string,
  rol: MobilRolEtiket,
  options?: {
    /** Kaydı yapanın personel id'si — yoklamada görünmese bile eklenir */
    ensurePersonelId?: string | null;
    /** Eşleşen e-posta ile self bul */
    ensureEmail?: string | null;
  }
): string[] {
  const parts = parseDateParts(dateKey);
  const matchGorev = roleGorevMatcher(rol);
  const ids: string[] = [];
  const seen = new Set<string>();

  const push = (id?: string | null) => {
    const v = String(id || '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    ids.push(v);
  };

  if (!parts) {
    // Tarih parse edilemezse en azından self
    if (options?.ensurePersonelId) push(options.ensurePersonelId);
    return ids;
  }

  const { y, m, d } = parts;
  for (const p of personeller || []) {
    if (!isAktifPersonel(p)) continue;
    if (isIdariPersonel(p)) continue;
    if (rol === 'SERAMIK') {
      if (!isSeramikEkibiPersonel(p)) continue;
    } else {
      if (isTaseronPersonel(p)) continue;
      if (!matchGorev(p.gorev)) continue;
    }
    const day = getYoklamaDay(yoklamalar[p.id], y, m, d);
    if (!isGeldiDurum(day?.durum)) continue;
    push(p.id);
  }

  const email = String(options?.ensureEmail || '')
    .trim()
    .toLowerCase();
  if (email) {
    const self = (personeller || []).find(
      (p) =>
        (rol === 'SERAMIK' ? isSeramikEkibiPersonel(p) : matchGorev(p.gorev)) &&
        String(p.eposta || '')
          .trim()
          .toLowerCase() === email
    );
    if (self) push(self.id);
  }
  if (options?.ensurePersonelId) push(options.ensurePersonelId);

  return ids;
}

/** Mevcut liste + o gün Geldi kampçı id'leri (tekrarsız birleşim). */
export function mergeGeldiKampciIntoList(
  existing: string[] | undefined,
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  dateKey: string,
  options?: {
    ensurePersonelId?: string | null;
    ensureEmail?: string | null;
  }
): string[] {
  const geldi = resolveGeldiRolPersonelIds(personeller, yoklamalar, dateKey, 'KAMPCI', options);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...(existing || []), ...geldi]) {
    const v = String(id || '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Eski kamp kayıtlarındaki yanlış ekibi yalnızca kampçılara indirger (onarım). */
export function filterIdsToKampciOnly(
  personelIds: string[] | undefined,
  personeller: Personel[]
): string[] {
  const byId = new Map((personeller || []).map((p) => [p.id, p]));
  return (personelIds || []).filter((id) => {
    const p = byId.get(id);
    return p ? isKampciRol(p.gorev) : false;
  });
}
