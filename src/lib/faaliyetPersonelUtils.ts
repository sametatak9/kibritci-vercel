import { AylikYoklamaMap, KampFaaliyet, Personel, SahaFaaliyeti, YoklamaDurum } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';
import { findPersonelByName, getYoklamaDay, normalizeTurkishName } from './yoklamaUtils';

/** Saha veya kamp faaliyetinde personel eşleştirme için ortak şekil */
export type FaaliyetPersonelKaynak = {
  aktifPersonelListesi?: string[];
  personelId?: string;
  personelMesaiSaatleri?: Record<string, number>;
  tarih?: string;
};

export function personMatchesFaaliyet(
  p: Personel,
  f: SahaFaaliyeti | KampFaaliyet | FaaliyetPersonelKaynak
): boolean {
  const list = f.aktifPersonelListesi || [];
  if (list.some((entry) => String(entry).trim() === p.id)) return true;
  const fullName = normalizeTurkishName(`${p.ad} ${p.soyad}`);
  if (list.some((entry) => normalizeTurkishName(String(entry).trim()) === fullName)) return true;
  if (f.personelMesaiSaatleri && Number(f.personelMesaiSaatleri[p.id]) > 0) return true;
  return f.personelId === p.id;
}

export function isFaaliyetInPeriod(
  f: { tarih?: string },
  year: number,
  month: number
): boolean {
  const dk = normalizeDateKey(f.tarih);
  if (!dk) return false;
  const [y, m] = dk.split('-').map(Number);
  return y === year && m === month;
}

export function filterFaaliyetlerByPeriod(
  faaliyetler: SahaFaaliyeti[],
  year: number,
  month: number
): SahaFaaliyeti[] {
  return (faaliyetler || []).filter((f) => isFaaliyetInPeriod(f, year, month));
}

function personScore(p: Personel): number {
  let s = 0;
  if ((p.tcNo || '').trim()) s += 100;
  if (!p.id.startsWith('PRS-LEGACY')) s += 50;
  if (p.durum === true || String(p.durum).toLowerCase() === 'true') s += 10;
  return s;
}

function absorbFaaliyetPersonel(
  f: FaaliyetPersonelKaynak,
  personeller: Personel[],
  matched: Map<string, Personel>
) {
  const addPerson = (p: Personel | undefined | null) => {
    if (p?.id) matched.set(p.id, p);
  };

  for (const entry of f.aktifPersonelListesi || []) {
    const raw = String(entry).trim();
    if (!raw) continue;
    const byId = personeller.find((p) => p.id === raw);
    if (byId) {
      addPerson(byId);
      continue;
    }
    addPerson(findPersonelByName(personeller, raw));
  }
  if (f.personelId) addPerson(personeller.find((p) => p.id === f.personelId));
  if (f.personelMesaiSaatleri) {
    for (const pid of Object.keys(f.personelMesaiSaatleri)) {
      if (Number(f.personelMesaiSaatleri[pid]) > 0) {
        addPerson(personeller.find((p) => p.id === pid));
      }
    }
  }
}

/** Seçili ayda saha ∪ kamp faaliyetine bağlı personeller */
export function buildFaaliyetPersoneller(
  sahaFaaliyetleri: SahaFaaliyeti[],
  personeller: Personel[],
  year: number,
  month: number,
  kampFaaliyetleri: Array<KampFaaliyet | FaaliyetPersonelKaynak> = []
): Personel[] {
  const period = filterFaaliyetlerByPeriod(sahaFaaliyetleri, year, month);
  const kampPeriod = (kampFaaliyetleri || []).filter((f) => isFaaliyetInPeriod(f, year, month));
  const matched = new Map<string, Personel>();

  for (const f of period) absorbFaaliyetPersonel(f, personeller, matched);
  for (const f of kampPeriod) absorbFaaliyetPersonel(f, personeller, matched);

  const byName = new Map<string, Personel>();
  for (const p of matched.values()) {
    const key = normalizeTurkishName(`${p.ad} ${p.soyad}`);
    const prev = byName.get(key);
    if (!prev || personScore(p) > personScore(prev)) byName.set(key, p);
  }
  return Array.from(byName.values()).sort((a, b) =>
    `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')
  );
}

export function getPersonFaaliyetleriInPeriod(
  person: Personel,
  sahaFaaliyetleri: SahaFaaliyeti[],
  year: number,
  month: number
): SahaFaaliyeti[] {
  return filterFaaliyetlerByPeriod(sahaFaaliyetleri, year, month)
    .filter((f) => personMatchesFaaliyet(person, f))
    .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr'));
}

export interface PersonelAyOzeti {
  geldiGun: number;
  yokGun: number;
  izinliGun: number;
  raporluGun: number;
  pazarGun: number;
  toplamMesai: number;
  gunDetay: Array<{
    day: number;
    durum: YoklamaDurum | 'Girilmedi';
    mesaiSaati: number;
  }>;
}

/** Salt okunur yoklama / mesai özeti (düzenlenemez) */
export function buildPersonelAyOzeti(
  person: Personel,
  yoklamalar: AylikYoklamaMap,
  year: number,
  month: number
): PersonelAyOzeti {
  const daysInMonth = new Date(year, month, 0).getDate();
  let geldiGun = 0;
  let yokGun = 0;
  let izinliGun = 0;
  let raporluGun = 0;
  let pazarGun = 0;
  let toplamMesai = 0;
  const gunDetay: PersonelAyOzeti['gunDetay'] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = getYoklamaDay(yoklamalar[person.id], year, month, day);
    const durum = (cell?.durum || 'Girilmedi') as YoklamaDurum | 'Girilmedi';
    const mesaiSaati = Number(cell?.mesaiSaati || 0);
    if (durum === 'Geldi') geldiGun += 1;
    else if (durum === 'Yok') yokGun += 1;
    else if (durum === 'İzinli') izinliGun += 1;
    else if (durum === 'Raporlu') raporluGun += 1;
    else if (durum === 'Pazar') pazarGun += 1;
    toplamMesai += mesaiSaati;
    gunDetay.push({ day, durum, mesaiSaati });
  }

  return {
    geldiGun,
    yokGun,
    izinliGun,
    raporluGun,
    pazarGun,
    toplamMesai: Math.round(toplamMesai * 2) / 2,
    gunDetay,
  };
}

export function formatFaaliyetTarihLabel(tarih?: string): string {
  const dk = normalizeDateKey(tarih || '');
  if (!dk) return tarih || '—';
  const [y, m, d] = dk.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'short',
  });
}

/** Faaliyetteki ekip listesini okunur isimlere çevirir */
export function resolveFaaliyetEkip(
  f: SahaFaaliyeti,
  personeller: Personel[]
): Array<{ id?: string; adSoyad: string; mesaiSaati?: number }> {
  const entries = f.aktifPersonelListesi || [];
  const out: Array<{ id?: string; adSoyad: string; mesaiSaati?: number }> = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const raw = String(entry || '').trim();
    if (!raw) continue;
    const byId = personeller.find((p) => p.id === raw);
    const byName = byId || findPersonelByName(personeller, raw);
    const adSoyad = byName
      ? `${byName.ad} ${byName.soyad}`.trim()
      : raw;
    const key = normalizeTurkishName(adSoyad);
    if (seen.has(key)) continue;
    seen.add(key);
    const mesaiKey = byName?.id || raw;
    const mesaiRaw = f.personelMesaiSaatleri?.[mesaiKey];
    out.push({
      id: byName?.id,
      adSoyad,
      mesaiSaati:
        mesaiRaw != null && Number.isFinite(Number(mesaiRaw))
          ? Number(mesaiRaw)
          : undefined,
    });
  }

  if (out.length === 0 && f.personelId) {
    const p = personeller.find((x) => x.id === f.personelId);
    if (p) {
      out.push({
        id: p.id,
        adSoyad: `${p.ad} ${p.soyad}`.trim(),
        mesaiSaati: f.personelMesaiSaatleri?.[p.id],
      });
    }
  }

  return out.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
}

export function countPersonFaaliyetFotolar(
  person: Personel,
  sahaFaaliyetleri: SahaFaaliyeti[],
  year: number,
  month: number
): number {
  return getPersonFaaliyetleriInPeriod(person, sahaFaaliyetleri, year, month).reduce(
    (sum, f) => sum + getFaaliyetFotolar(f).length,
    0
  );
}

export function buildPeriodFaaliyetOzeti(
  sahaFaaliyetleri: SahaFaaliyeti[],
  personeller: Personel[],
  year: number,
  month: number,
  kampFaaliyetleri: Array<KampFaaliyet | FaaliyetPersonelKaynak> = []
): {
  personelSayisi: number;
  faaliyetSayisi: number;
  fotoSayisi: number;
  parselSayisi: number;
  mesaiFaaliyetSayisi: number;
  sahaFaaliyetSayisi: number;
  kampFaaliyetSayisi: number;
} {
  const period = filterFaaliyetlerByPeriod(sahaFaaliyetleri, year, month);
  const kampPeriod = (kampFaaliyetleri || []).filter((f) => isFaaliyetInPeriod(f, year, month));
  const parseller = new Set(
    period.map((f) => String((f as SahaFaaliyeti).parsel || '').trim()).filter(Boolean)
  );
  return {
    personelSayisi: buildFaaliyetPersoneller(
      sahaFaaliyetleri,
      personeller,
      year,
      month,
      kampFaaliyetleri
    ).length,
    faaliyetSayisi: period.length + kampPeriod.length,
    sahaFaaliyetSayisi: period.length,
    kampFaaliyetSayisi: kampPeriod.length,
    fotoSayisi: period.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0),
    parselSayisi: parseller.size,
    mesaiFaaliyetSayisi: period.filter((f) => f.faaliyetTipi === 'MESAI_SAHA').length,
  };
}
