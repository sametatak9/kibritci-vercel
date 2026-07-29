import { AylikYoklamaMap, KampFaaliyet, Personel, SahaFaaliyeti, YoklamaDurum } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';
import {
  findPersonelByName,
  getYoklamaDay,
  isFaaliyetPersonelKapsaminda,
  isFormenGorev,
  isKampciGorev,
  isPersonelVisibleInMonth,
  normalizeTurkishName,
  asYoklamaGunMap,
} from './yoklamaUtils';

/** Saha veya kamp faaliyetinde personel eşleştirme için ortak şekil */
export type FaaliyetPersonelKaynak = {
  aktifPersonelListesi?: string[];
  personelId?: string;
  personelMesaiSaatleri?: Record<string, number>;
  tarih?: string;
  kaydedenKampci?: string;
  kaydeden?: string;
  kaydedenFormen?: string;
  kaynakEkran?: string;
  durum?: string | null;
  onaylayan?: string | null;
};

function findPersonelByEmail(
  personeller: Personel[],
  email?: string | null
): Personel | undefined {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return undefined;
  return personeller.find((p) => String(p.eposta || '').trim().toLowerCase() === e);
}

/** Kamp faaliyetindeki çalışan (bağlı personel) sayısı */
export function kampFaaliyetCalisanSayisi(
  f: KampFaaliyet | FaaliyetPersonelKaynak | null | undefined,
  personeller?: Personel[]
): number {
  if (!f) return 0;

  // Personel listesi gelirse: sadece ana firma saha işçisi kapsamına girenleri say.
  if (personeller) {
    const ids = new Set<string>();
    const addIfScoped = (pid: string) => {
      const p = personeller.find((x) => x.id === pid);
      if (p && isFaaliyetPersonelKapsaminda(p)) ids.add(pid);
    };

    for (const raw of f.aktifPersonelListesi || []) {
      const pid = String(raw || '').trim();
      if (pid) addIfScoped(pid);
    }

    if (f.personelMesaiSaatleri) {
      for (const [pid, hrs] of Object.entries(f.personelMesaiSaatleri)) {
        if (Number(hrs) > 0) addIfScoped(pid);
      }
    }

    if (f.personelId) addIfScoped(f.personelId);

    if (ids.size > 0) return ids.size;
    return 0;
  }

  // Eski davranış (personeller filtre bilgisi yokken)
  const fromList = (f.aktifPersonelListesi || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (fromList.length > 0) return new Set(fromList).size;
  if (f.personelMesaiSaatleri) {
    const n = Object.values(f.personelMesaiSaatleri).filter((h) => Number(h) > 0).length;
    if (n > 0) return n;
  }
  return f.personelId ? 1 : 0;
}

function isAktifPersonel(p: Personel): boolean {
  if (p.durum === true) return true;
  if (p.durum === false || p.durum == null) return false;
  const s = String(p.durum).trim().toLocaleLowerCase('tr-TR');
  return s === 'true' || s === 'aktif' || s === '1';
}

/** İşten çıkarılmış / ayrılmış — görev atama listelerinde gösterilmez */
function isIstenCikmisPersonel(p: Personel): boolean {
  if (!isAktifPersonel(p)) return true;
  const exit = String(p.istenCikisTarihi || (p as { cikisTarihi?: string }).cikisTarihi || '').trim();
  return Boolean(exit);
}

function shouldIncludeFaaliyetPersonel(p: Personel | undefined | null): p is Personel {
  return !!p?.id && isFaaliyetPersonelKapsaminda(p);
}

export function personMatchesFaaliyet(
  p: Personel,
  f: SahaFaaliyeti | KampFaaliyet | FaaliyetPersonelKaynak
): boolean {
  // Formen fotoğraf/kayıt ekler; çalışan değildir — faaliyetli personel sayılmaz
  if (isFormenGorev(p.gorev) || !isFaaliyetPersonelKapsaminda(p)) return false;

  const list = f.aktifPersonelListesi || [];
  if (list.some((entry) => String(entry).trim() === p.id)) return true;
  const fullName = normalizeTurkishName(`${p.ad} ${p.soyad}`);
  if (list.some((entry) => normalizeTurkishName(String(entry).trim()) === fullName)) return true;
  if (f.personelMesaiSaatleri && Number(f.personelMesaiSaatleri[p.id]) > 0) return true;
  if (f.personelId === p.id) return true;

  // Yalnızca kampçı kaydeden e-postası — formen/kaydeden saha e-postası çalışan sayılmaz
  const kaydedenKampci = String((f as FaaliyetPersonelKaynak).kaydedenKampci || '')
    .trim()
    .toLowerCase();
  if (
    kaydedenKampci &&
    isKampciGorev(p.gorev) &&
    String(p.eposta || '').trim().toLowerCase() === kaydedenKampci
  ) {
    return true;
  }

  // Tesisatçı / Mermerci mobil kaydeden — kendi faaliyetine bağlanır
  const kaynak = String((f as FaaliyetPersonelKaynak).kaynakEkran || '');
  const kaydedenEmail = String((f as FaaliyetPersonelKaynak).kaydeden || '')
    .trim()
    .toLowerCase();
  if (
    kaydedenEmail &&
    (kaynak === 'TESISATCI_MOBIL' || kaynak === 'MERMERCI_MOBIL') &&
    String(p.eposta || '').trim().toLowerCase() === kaydedenEmail
  ) {
    return true;
  }
  return false;
}

/** Kamp faaliyet eşlemesi: kamp kaydındaki personel bağlantısına göre eşleştir. */
export function personMatchesKampFaaliyet(
  p: Personel,
  f: KampFaaliyet | FaaliyetPersonelKaynak
): boolean {
  if (!isFaaliyetPersonelKapsaminda(p)) return false;
  return personMatchesFaaliyet(p, f);
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

/** Yönetici onaylı kamp faaliyeti — faaliyetsiz listeden düşürmek için */
export function isKampFaaliyetOnayli(f?: {
  durum?: string | null;
  onaylayan?: string | null;
} | null): boolean {
  if (!f) return false;
  const d = String(f.durum || '').toLocaleUpperCase('tr-TR');
  if (d.includes('RED')) return false;
  if (d.includes('ONAYLANDI') || d.includes('ONAYLI') || d.includes('AKTARILDI')) return true;
  return Boolean(String(f.onaylayan || '').trim());
}

/** Faaliyetsiz / atanmamış hesaplarında sayılacak kamp kayıtları (onaylı) */
export function filterOnayliKampFaaliyetleri<
  T extends { durum?: string | null; onaylayan?: string | null }
>(list: T[] | null | undefined): T[] {
  return (list || []).filter((f) => isKampFaaliyetOnayli(f));
}

export function isFaaliyetOnDateKey(f: { tarih?: string }, dateKey: string): boolean {
  const dk = normalizeDateKey(f.tarih);
  const target = normalizeDateKey(dateKey);
  return !!dk && !!target && dk === target;
}

export function filterFaaliyetlerByPeriod(
  faaliyetler: SahaFaaliyeti[],
  year: number,
  month: number
): SahaFaaliyeti[] {
  return (faaliyetler || []).filter((f) => isFaaliyetInPeriod(f, year, month));
}

export function filterFaaliyetlerByDate<T extends { tarih?: string }>(
  faaliyetler: readonly T[] | null | undefined,
  dateKey: string
): T[] {
  return (faaliyetler ?? []).filter((f) => isFaaliyetOnDateKey(f, dateKey));
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
    if (shouldIncludeFaaliyetPersonel(p)) matched.set(p.id, p);
  };

  for (const entry of f.aktifPersonelListesi || []) {
    const raw = String(entry || '').trim();
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
  // Yalnızca kampçı kaydeden — saha kaydeden/formen e-postası çalışan listesine girmez
  const kaydedenKampci = findPersonelByEmail(personeller, f.kaydedenKampci);
  if (kaydedenKampci && isKampciGorev(kaydedenKampci.gorev)) addPerson(kaydedenKampci);

  // Tesisatçı / Mermerci mobil kaydeden
  const kaynak = String(f.kaynakEkran || '');
  if (kaynak === 'TESISATCI_MOBIL' || kaynak === 'MERMERCI_MOBIL') {
    const kaydedenMobil = findPersonelByEmail(personeller, f.kaydeden);
    if (kaydedenMobil) addPerson(kaydedenMobil);
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
    if (!shouldIncludeFaaliyetPersonel(p)) continue;
    const key = normalizeTurkishName(`${p.ad} ${p.soyad}`);
    const prev = byName.get(key);
    if (!prev || personScore(p) > personScore(prev)) byName.set(key, p);
  }
  return Array.from(byName.values()).sort((a, b) =>
    `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')
  );
}

/**
 * Seçili ayda faaliyet kapsamındaki aktif ana firma saha personelinden
 * henüz hiç saha/kamp faaliyetine bağlanmamışlar.
 * İşten çıkarılmış / pasif personel dahil edilmez (görev atama için).
 */
export function buildFaaliyetsizPersoneller(
  sahaFaaliyetleri: SahaFaaliyeti[],
  personeller: Personel[],
  year: number,
  month: number,
  kampFaaliyetleri: Array<KampFaaliyet | FaaliyetPersonelKaynak> = [],
  yoklamalar: AylikYoklamaMap = {}
): Personel[] {
  // Kampçılar: yönetici onayından sonra faaliyetli sayılır (bekleyen kayıt düşürmez)
  const onayliKamp = filterOnayliKampFaaliyetleri(kampFaaliyetleri);
  const faaliyetli = buildFaaliyetPersoneller(
    sahaFaaliyetleri,
    personeller,
    year,
    month,
    onayliKamp
  );
  const faaliyetliIds = new Set(faaliyetli.map((p) => p.id));
  const faaliyetliNames = new Set(
    faaliyetli.map((p) => normalizeTurkishName(`${p.ad} ${p.soyad}`))
  );

  // Onaylı kamp kaydı var ama aktifPersonelListesi boşsa → o gün Geldi kampçıları faaliyetli say
  for (const kf of onayliKamp) {
    if (!isFaaliyetInPeriod(kf, year, month)) continue;
    const tagged = (kf.aktifPersonelListesi || []).filter(Boolean);
    if (tagged.length > 0) continue;
    const dk = normalizeDateKey(kf.tarih);
    if (!dk) continue;
    const [y, m, d] = dk.split('-').map(Number);
    for (const p of personeller) {
      if (!shouldIncludeFaaliyetPersonel(p)) continue;
      if (!isKampciGorev(p.gorev)) continue;
      const cell = getYoklamaDay(yoklamalar[p.id], y, m, d);
      if (String(cell?.durum || '') !== 'Geldi') continue;
      faaliyetliIds.add(p.id);
      faaliyetliNames.add(normalizeTurkishName(`${p.ad} ${p.soyad}`));
    }
  }

  const byName = new Map<string, Personel>();
  for (const p of personeller) {
    if (!shouldIncludeFaaliyetPersonel(p)) continue;
    if (isIstenCikmisPersonel(p)) continue;
    if (!isPersonelVisibleInMonth(p, year, month, asYoklamaGunMap(yoklamalar[p.id]))) continue;
    if (faaliyetliIds.has(p.id)) continue;
    const nameKey = normalizeTurkishName(`${p.ad} ${p.soyad}`);
    if (faaliyetliNames.has(nameKey)) continue;
    const prev = byName.get(nameKey);
    if (!prev || personScore(p) > personScore(prev)) byName.set(nameKey, p);
  }

  return Array.from(byName.values()).sort((a, b) => {
    const ga = String(a.gorev || '').localeCompare(String(b.gorev || ''), 'tr');
    if (ga !== 0) return ga;
    return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr');
  });
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

export function getPersonKampFaaliyetleriInPeriod(
  person: Personel,
  kampFaaliyetleri: KampFaaliyet[],
  year: number,
  month: number
): KampFaaliyet[] {
  return (kampFaaliyetleri || [])
    .filter((f) => isFaaliyetInPeriod(f, year, month) && personMatchesKampFaaliyet(person, f))
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

/** Faaliyetteki ekip listesini okunur isimlere çevirir (saha veya kamp) */
export function resolveFaaliyetEkip(
  f: SahaFaaliyeti | KampFaaliyet | FaaliyetPersonelKaynak,
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

    // Sadece ana firma saha işçilerini göster (taşeron/idari/formenleri chip'e koyma)
    if (byId && !isFaaliyetPersonelKapsaminda(byId)) continue;
    if (byName && !isFaaliyetPersonelKapsaminda(byName)) continue;

    const adSoyad = byName
      ? `${byName.ad} ${byName.soyad}`.trim()
      : raw;
    // Personel bulunamazsa (raw id/nickname) chip'e yazmayalım.
    if (!byName) continue;
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

  if (f.personelMesaiSaatleri) {
    for (const [pid, hrs] of Object.entries(f.personelMesaiSaatleri)) {
      if (!(Number(hrs) > 0)) continue;
      const p = personeller.find((x) => x.id === pid);
      if (!p) continue;
      if (!isFaaliyetPersonelKapsaminda(p)) continue;
      const adSoyad = `${p.ad} ${p.soyad}`.trim();
      const key = normalizeTurkishName(adSoyad);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p?.id, adSoyad, mesaiSaati: Number(hrs) });
    }
  }

  if (out.length === 0 && f.personelId) {
    const p = personeller.find((x) => x.id === f.personelId);
    if (p) {
      if (!isFaaliyetPersonelKapsaminda(p)) return out;
      out.push({
        id: p.id,
        adSoyad: `${p.ad} ${p.soyad}`.trim(),
        mesaiSaati: f.personelMesaiSaatleri?.[p.id],
      });
    }
  }

  return out.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
}

export interface DayFaaliyetPersonelSatir {
  id: string;
  adSoyad: string;
  gorev: string;
  sahaSayisi: number;
  kampSayisi: number;
  faaliyetSayisi: number;
  fotoSayisi: number;
  yoklamaDurum: YoklamaDurum | 'Girilmedi';
}

export interface DayPersonelRaporu {
  sahaSayisi: number;
  kampSayisi: number;
  faaliyetSayisi: number;
  fotoSayisi: number;
  personelSayisi: number;
  yokSayisi: number;
  faaliyetliPersoneller: DayFaaliyetPersonelSatir[];
  yokPersoneller: Array<{
    id: string;
    adSoyad: string;
    gorev: string;
  }>;
}

/** Seçili günde faaliyetli personeller + yoklama "Yok" sayısı */
export function buildDayPersonelRaporu(
  sahaFaaliyetleri: SahaFaaliyeti[],
  kampFaaliyetleri: KampFaaliyet[],
  personeller: Personel[],
  dateKey: string,
  yoklamalar: AylikYoklamaMap = {}
): DayPersonelRaporu {
  const saha = filterFaaliyetlerByDate(sahaFaaliyetleri, dateKey);
  const kamp = filterFaaliyetlerByDate(kampFaaliyetleri, dateKey);
  const matched = new Map<string, Personel>();
  for (const f of saha) absorbFaaliyetPersonel(f, personeller, matched);
  for (const f of kamp) absorbFaaliyetPersonel(f, personeller, matched);

  const dk = normalizeDateKey(dateKey);
  const [y, m, d] = dk ? dk.split('-').map(Number) : [0, 0, 0];

  const faaliyetliPersoneller: DayFaaliyetPersonelSatir[] = Array.from(matched.values())
    .filter((p) => shouldIncludeFaaliyetPersonel(p))
    .map((p) => {
      const pSaha = saha.filter((f) => personMatchesFaaliyet(p, f));
      const pKamp = kamp.filter((f) => personMatchesKampFaaliyet(p, f));
      const cell = y && m && d ? getYoklamaDay(yoklamalar[p.id], y, m, d) : undefined;
      return {
        id: p.id,
        adSoyad: `${p.ad} ${p.soyad}`.trim(),
        gorev: p.gorev || '—',
        sahaSayisi: pSaha.length,
        kampSayisi: pKamp.length,
        faaliyetSayisi: pSaha.length + pKamp.length,
        fotoSayisi:
          pSaha.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0) +
          pKamp.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0),
        yoklamaDurum: (cell?.durum || 'Girilmedi') as YoklamaDurum | 'Girilmedi',
      };
    })
    .sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));

  const yokPersoneller: DayPersonelRaporu['yokPersoneller'] = [];
  if (y && m && d) {
    for (const p of personeller) {
      if (!shouldIncludeFaaliyetPersonel(p)) continue;
      const isAktif = p.durum === true || String(p.durum).toLowerCase() === 'true';
      if (!isAktif) continue;
      const cell = getYoklamaDay(yoklamalar[p.id], y, m, d);
      if (cell?.durum !== 'Yok') continue;
      yokPersoneller.push({
        id: p.id,
        adSoyad: `${p.ad} ${p.soyad}`.trim(),
        gorev: p.gorev || '—',
      });
    }
    yokPersoneller.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
  }

  return {
    sahaSayisi: saha.length,
    kampSayisi: kamp.length,
    faaliyetSayisi: saha.length + kamp.length,
    fotoSayisi:
      saha.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0) +
      kamp.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0),
    personelSayisi: faaliyetliPersoneller.length,
    yokSayisi: yokPersoneller.length,
    faaliyetliPersoneller,
    yokPersoneller,
  };
}

export function buildDayFaaliyetOzeti(
  sahaFaaliyetleri: SahaFaaliyeti[],
  kampFaaliyetleri: KampFaaliyet[],
  personeller: Personel[],
  dateKey: string,
  yoklamalar: AylikYoklamaMap = {}
): {
  sahaSayisi: number;
  kampSayisi: number;
  faaliyetSayisi: number;
  fotoSayisi: number;
  personelSayisi: number;
  yokSayisi: number;
} {
  const r = buildDayPersonelRaporu(
    sahaFaaliyetleri,
    kampFaaliyetleri,
    personeller,
    dateKey,
    yoklamalar
  );
  return {
    sahaSayisi: r.sahaSayisi,
    kampSayisi: r.kampSayisi,
    faaliyetSayisi: r.faaliyetSayisi,
    fotoSayisi: r.fotoSayisi,
    personelSayisi: r.personelSayisi,
    yokSayisi: r.yokSayisi,
  };
}

export function countPersonFaaliyetFotolar(
  person: Personel,
  sahaFaaliyetleri: SahaFaaliyeti[],
  year: number,
  month: number,
  kampFaaliyetleri: KampFaaliyet[] = []
): number {
  const saha = getPersonFaaliyetleriInPeriod(person, sahaFaaliyetleri, year, month).reduce(
    (sum, f) => sum + getFaaliyetFotolar(f).length,
    0
  );
  const kamp = getPersonKampFaaliyetleriInPeriod(person, kampFaaliyetleri, year, month).reduce(
    (sum, f) => sum + getFaaliyetFotolar(f).length,
    0
  );
  return saha + kamp;
}

export function buildPeriodFaaliyetOzeti(
  sahaFaaliyetleri: SahaFaaliyeti[],
  personeller: Personel[],
  year: number,
  month: number,
  kampFaaliyetleri: KampFaaliyet[] = []
): {
  personelSayisi: number;
  faaliyetSayisi: number;
  fotoSayisi: number;
  parselSayisi: number;
  mesaiFaaliyetSayisi: number;
  sahaFaaliyetSayisi: number;
  kampFaaliyetSayisi: number;
  kampCalisanSayisi: number;
  kampciPersonelSayisi: number;
} {
  const period = filterFaaliyetlerByPeriod(sahaFaaliyetleri, year, month);
  const kampPeriod = (kampFaaliyetleri || []).filter((f) => isFaaliyetInPeriod(f, year, month));
  const parseller = new Set(
    period.map((f) => String((f as SahaFaaliyeti).parsel || '').trim()).filter(Boolean)
  );
  const faaliyetPersoneller = buildFaaliyetPersoneller(
    sahaFaaliyetleri,
    personeller,
    year,
    month,
    kampFaaliyetleri
  );
  const kampCalisanSayisi = kampPeriod.reduce(
    (n, f) => n + kampFaaliyetCalisanSayisi(f, personeller),
    0
  );
  return {
    personelSayisi: faaliyetPersoneller.length,
    faaliyetSayisi: period.length + kampPeriod.length,
    sahaFaaliyetSayisi: period.length,
    kampFaaliyetSayisi: kampPeriod.length,
    fotoSayisi:
      period.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0) +
      kampPeriod.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0),
    parselSayisi: parseller.size,
    mesaiFaaliyetSayisi: period.filter((f) => f.faaliyetTipi === 'MESAI_SAHA').length,
    kampCalisanSayisi,
    kampciPersonelSayisi: faaliyetPersoneller.filter((p) => isKampciGorev(p.gorev)).length,
  };
}
