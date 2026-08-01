import { AylikYoklamaMap, GunlukYoklama, Personel, YoklamaDurum } from '../types/erp';

export interface YoklamaGunKaydi {
  durum: YoklamaDurum;
  mesaiSaati: number;
  gonderen?: string;
}

type PersonelYoklamaMap = GunlukYoklama | Record<string, YoklamaGunKaydi>;

function normalizeGorevKey(gorev?: string): string {
  return String(gorev || '')
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ğ/g, 'G');
}

export function isTesisatciGorev(gorev?: string): boolean {
  return normalizeGorevKey(gorev).includes('TESISATCI');
}

export function isMermerciGorev(gorev?: string): boolean {
  return normalizeGorevKey(gorev).includes('MERMERCI');
}

export function isSoforGorev(gorev?: string): boolean {
  const g = normalizeGorevKey(gorev);
  return (
    g.includes('SOFOR') ||
    g.includes('SOFÖR') ||
    g.includes('SURUCU') ||
    g.includes('LOJISTIK') ||
    g === 'DRIVER'
  );
}

export function isOperatorGorev(gorev?: string): boolean {
  const g = normalizeGorevKey(gorev);
  return (
    g.includes('OPERATOR') ||
    g.includes('OPERATÖR') ||
    g.includes('IS MAKINE') ||
    g.includes('ISMAKINE') ||
    g.includes('JCB') ||
    g.includes('EXCAVATOR') ||
    g.includes('KEKO')
  );
}

export function isKampciGorev(gorev?: string): boolean {
  const g = normalizeGorevKey(gorev);
  // KAMPÇI / Kampçı / KAMP GÖREVLİSİ / KAMP PERSONEL
  return (
    g.includes('KAMPCI') ||
    g.includes('KAMP GOREV') ||
    g === 'KAMP PERSONEL' ||
    g === 'KAMP PERSONELI' ||
    (g.includes('KAMP') && (g.includes('PERSONEL') || g.includes('GOREV')))
  );
}

/** Şenör (ölçüm / topograf yardımcı) — Kampçı yoklamasında takip edilir */
export function isSenorGorev(gorev?: string): boolean {
  const g = normalizeGorevKey(gorev);
  return g.includes('SENOR') || g.includes('SENÖR') || g === 'CHAINMAN';
}

/** Kampçı günlük / aylık yoklama listesi: kampçı + şenör */
export function isKampciYoklamaKapsami(gorev?: string): boolean {
  return isKampciGorev(gorev) || isSenorGorev(gorev);
}

export function isFormenGorev(gorev?: string): boolean {
  const g = normalizeGorevKey(gorev);
  // FORMEN / FORMAN / "şantiye formeni" vb.
  return g.includes('FORMEN') || g.includes('FORMAN');
}

/** Formen günlük yoklama / faaliyet havuzundan hariç tutulan roller */
export function isKampciTesisatciMermerci(gorev?: string): boolean {
  if (!gorev) return false;
  return (
    isKampciGorev(gorev) ||
    isSenorGorev(gorev) ||
    isTesisatciGorev(gorev) ||
    isMermerciGorev(gorev) ||
    isSoforGorev(gorev) ||
    isOperatorGorev(gorev)
  );
}

/** @deprecated Kampçı yoklaması artık yalnızca kampçı — isKampciGorev kullanın */
export function isKampciMermerciGorev(gorev?: string): boolean {
  return isKampciGorev(gorev);
}

/** GunlukYoklama → iterateMonthYoklama uyumlu kayıt haritası */
export function asYoklamaGunMap(
  personMap: PersonelYoklamaMap | undefined
): Record<string, YoklamaGunKaydi> | undefined {
  if (!personMap) return undefined;
  return personMap as unknown as Record<string, YoklamaGunKaydi>;
}

export function yoklamaDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseYoklamaDateKey(key: string): { year: number; month: number; day: number } | null {
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function isLegacyPersonelMap(personMap: Record<string, YoklamaGunKaydi>): boolean {
  return Object.keys(personMap).length > 0 && Object.keys(personMap).every(k => /^\d{1,2}$/.test(k));
}

export function getYoklamaDay(
  personMap: PersonelYoklamaMap | undefined,
  year: number,
  month: number,
  day: number
): YoklamaGunKaydi | undefined {
  const map = asYoklamaGunMap(personMap);
  if (!map) return undefined;
  const dateKey = yoklamaDateKey(year, month, day);
  return map[dateKey];
}

export function setYoklamaDay(
  personMap: PersonelYoklamaMap | undefined,
  year: number,
  month: number,
  day: number,
  data: YoklamaGunKaydi
): Record<string, YoklamaGunKaydi> {
  const map = asYoklamaGunMap(personMap);
  const dateKey = yoklamaDateKey(year, month, day);
  return { ...(map || {}), [dateKey]: data };
}

/** Formen sıfırlama: o günün Geldi/Yok kaydını kaldırır */
export function clearYoklamaDay(
  personMap: PersonelYoklamaMap | undefined,
  year: number,
  month: number,
  day: number
): Record<string, YoklamaGunKaydi> | undefined {
  const map = asYoklamaGunMap(personMap);
  if (!map) return undefined;
  const dateKey = yoklamaDateKey(year, month, day);
  const legacyKey = String(day);
  const next = { ...map };
  delete next[dateKey];
  if (legacyKey !== dateKey) delete next[legacyKey];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function personHasYoklamaInMonth(
  personMap: PersonelYoklamaMap | undefined,
  year: number,
  month: number
): boolean {
  let found = false;
  iterateMonthYoklama(personMap, year, month, (_day, data) => {
    if (data?.durum && data.durum !== 'Girilmedi') found = true;
  });
  return found;
}

export function personHasGeldiInMonth(
  personMap: PersonelYoklamaMap | undefined,
  year: number,
  month: number
): boolean {
  let found = false;
  iterateMonthYoklama(personMap, year, month, (_day, data) => {
    if (data?.durum === 'Geldi') found = true;
  });
  return found;
}

function parseFlexibleDateParts(
  raw?: string
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  // yyyy-mm-dd / yyyy/mm/dd
  const ymd = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // dd-mm-yyyy / dd.mm.yyyy / dd/mm/yyyy
  const dmy = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // dd.mm / dd/mm / dd-mm (without year)
  const dm = v.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    // Kibritci ERP verileri 2024 yılı çıkışlı olduğundan yıl belirtilmeyen tarihleri 2024 kabul ediyoruz.
    const year = 2024;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  return null;
}

/** Ay içindeki işe giriş veya çıkış günü (1–31); yoksa null. ISO ve TR formatlarını destekler. */
export function getBoundaryDayInMonth(
  dateStr: string | undefined | null,
  year: number,
  month: number
): number | null {
  const parts = parseFlexibleDateParts(dateStr || undefined);
  if (!parts) return null;
  if (parts.year === year && parts.month === month) return parts.day;
  return null;
}

/** Personel bu ayın yoklama listesinde görünmeli mi?
 *  İşe giriş/çıkış aralığı bu ayı hiç kapsamıyorsa — o ayda kayıtlı yoklama verisi olsa bile —
 *  satır listeye alınmaz (alakasız personel görünmesin). */
export function isPersonelVisibleInMonth(
  p: Personel,
  year: number,
  month: number,
  personMap?: PersonelYoklamaMap
): boolean {
  // 1. İşe giriş ayı bu aydan SONRA ise gizle (henüz işe girmemiş).
  const hireTarih = p.iseGirisTarihi || (p as any).girisTarihi || (p as any).kayitTarihi;
  const hire = parseFlexibleDateParts(hireTarih);
  if (hire) {
    const hireY = hire.year;
    const hireM = hire.month;
    if (hireY > year || (hireY === year && hireM > month)) return false;
  }

  // 2. İşten çıkış ayı bu aydan ÖNCE ise gizle (çoktan ayrılmış).
  const exitTarih = p.istenCikisTarihi || (p as any).cikisTarihi;
  const exit = parseFlexibleDateParts(exitTarih);
  if (exit) {
    const exitY = exit.year;
    const exitM = exit.month;
    if (exitY < year || (exitY === year && exitM < month)) return false;
  }

  // 3. İstihdam aralığı bu ayı kapsıyor; ayda kayıtlı yoklama verisi varsa her durumda göster.
  if (personMap && personHasYoklamaInMonth(personMap, year, month)) return true;

  // 4. Pasif ve çıkış tarihi de yoksa (eksik kayıt) gizle.
  const durumNorm = normalizeTurkishName(String(p.durum || ''));
  const isAktif = p.durum === true || durumNorm === 'TRUE' || durumNorm === 'AKTIF';
  if (!exit && !exitTarih && !isAktif) return false;

  return true;
}

/** İşe giriş–çıkış aralığında mı? (sınır günleri dahil — o günlerde yoklama alınabilir) */
export function isDateInEmploymentRange(
  p: Personel,
  year: number,
  month: number,
  day: number
): boolean {
  const currentDateVal = year * 10000 + month * 100 + day;

  const hireTarih = p.iseGirisTarihi || (p as any).girisTarihi || (p as any).kayitTarihi;
  const hire = parseFlexibleDateParts(hireTarih);
  if (hire) {
    const hireDateVal = hire.year * 10000 + hire.month * 100 + hire.day;
    if (currentDateVal < hireDateVal) return false;
  }

  const exitTarih = p.istenCikisTarihi || (p as any).cikisTarihi;
  const exit = parseFlexibleDateParts(exitTarih);
  if (exit) {
    const exitDateVal = exit.year * 10000 + exit.month * 100 + exit.day;
    if (currentDateVal > exitDateVal) return false;
  }

  return true;
}

/** Kayıtlı yoklama, işe giriş/çıkış aralığı dışını açmaz — aralık dışı her zaman kapalı */
export function isDayActiveForPersonel(
  p: Personel,
  year: number,
  month: number,
  day: number,
  _personMap?: PersonelYoklamaMap
): boolean {
  return isDateInEmploymentRange(p, year, month, day);
}

export function iterateMonthYoklama(
  personMap: PersonelYoklamaMap | undefined,
  year: number,
  month: number,
  callback: (day: number, data: YoklamaGunKaydi) => void
): void {
  const map = asYoklamaGunMap(personMap);
  if (!map) return;
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;

  Object.entries(map).forEach(([key, data]) => {
    if (key.startsWith(prefix)) {
      const day = Number(key.slice(prefix.length));
      if (day >= 1 && day <= 31) callback(day, data);
    }
  });
}

export function migrateLegacyYoklamaMap(
  map: AylikYoklamaMap,
  defaultYear = 2026,
  defaultMonth = 6
): AylikYoklamaMap {
  const migrated: AylikYoklamaMap = {};
  Object.entries(map).forEach(([personelId, personMap]) => {
    if (!personMap || typeof personMap !== 'object') return;
    if (!isLegacyPersonelMap(personMap as Record<string, YoklamaGunKaydi>)) {
      migrated[personelId] = personMap;
      return;
    }
    const nextMap: Record<string, YoklamaGunKaydi> = {};
    Object.entries(personMap as Record<string, YoklamaGunKaydi>).forEach(([dayKey, data]) => {
      const day = Number(dayKey);
      if (day >= 1 && day <= 31) {
        nextMap[yoklamaDateKey(defaultYear, defaultMonth, day)] = data;
      }
    });
    migrated[personelId] = nextMap;
  });
  return migrated;
}

export function normalizeTurkishName(name: string): string {
  return name
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s/g, '');
}

function normalizeCompanyName(name: string): string {
  return String(name || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ana firma için tek resmi ünvan — Excel ve listelerde birleştirilir. */
export const CANONICAL_ANA_FIRMA_ADI = 'KİBRİTÇİ İNŞAAT';

export function isKibritciCompany(name: string): boolean {
  const n = normalizeCompanyName(name);
  return !n || n.includes('KIBRITCI');
}

/** "Kibritçi İnşaat" / "KİBRİTÇİ İNŞAAT" vb. → tek kanonik ad. */
export function canonicalizeAnaFirmaAdi(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw) return CANONICAL_ANA_FIRMA_ADI;
  const upper = raw.toLocaleUpperCase('tr-TR');
  if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA' || isKibritciCompany(raw)) {
    return CANONICAL_ANA_FIRMA_ADI;
  }
  return upper;
}

export function isTaseronPersonel(p?: Personel): boolean {
  if (!p) return false;
  if (p.firmaTipi === 'TASERON') return true;
  const firmaAdi = String(p.firmaAdi || '').trim();
  if (!firmaAdi) return false;
  return !isKibritciCompany(firmaAdi);
}

/** İdari kadro — ana firma puantaj/yoklamasına girmez; izin/tutanak/araç tahsis vb. evraklarda seçilir */
export function isIdariPersonel(p?: Personel): boolean {
  if (!p) return false;
  if (p.personelGrubu === 'IDARI') return true;
  const dep = String(p.departman || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return dep === 'IDARI' || dep.includes('IDARI PERSONEL') || dep === 'OFIS / IDARI';
}

/**
 * Faaliyeti Olan Personeller kapsamı:
 * yalnızca Ana Firma saha işçileri (Düz işçi, Tesisatçı, Kampçı, …).
 * Taşeron, idari kadro ve Formen hariç.
 */
export function isFaaliyetPersonelKapsaminda(p?: Personel): boolean {
  if (!p) return false;
  if (isTaseronPersonel(p)) return false;
  if (isIdariPersonel(p)) return false;
  if (isFormenGorev(p.gorev)) return false;
  return true;
}

export function findPersonelByName(personeller: Personel[], adSoyad: string): Personel | undefined {
  const target = normalizeTurkishName(adSoyad);
  if (!target) return undefined;

  return personeller.find(p => {
    const full = normalizeTurkishName(`${p.ad} ${p.soyad}`);
    return full === target || full.includes(target) || target.includes(full);
  });
}

export function createMinimalPersonel(ad: string, soyad: string, opts?: {
  gorev?: string;
  maas?: number;
  iseGirisTarihi?: string;
  istenCikisTarihi?: string;
  legacyExcelId?: number;
}): Personel {
  const stamp = Date.now().toString().slice(-4);
  return {
    id: opts?.legacyExcelId != null ? `PRS-LEGACY-L${opts.legacyExcelId}` : `PRS-LEGACY-${stamp}`,
    tcNo: '',
    ad: ad.trim().toUpperCase(),
    soyad: soyad.trim().toUpperCase(),
    babaAdi: '',
    dogumTarihi: '1990-01-01',
    telefonNo: '',
    eposta: '',
    adres: 'Yüksekova Konut Şantiyesi Kampı',
    il: '',
    ilce: '',
    departman: 'Şantiye',
    gorev: opts?.gorev || 'DÜZ İŞÇİ',
    iseGirisTarihi: opts?.iseGirisTarihi || '2026-02-01',
    istenCikisTarihi: opts?.istenCikisTarihi,
    cinsiyet: 'Erkek',
    maas: opts?.maas ?? 30000,
    ucretTipi: 'Aylık',
    sgkDurumu: 'Sigortasız',
    bankaAdi: '',
    subeAdi: '',
    ibanNo: '',
    durum: !opts?.istenCikisTarihi,
  };
}

export function buildPersonelListForMonth(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  year: number,
  month: number,
  resolveStub?: (personelId: string) => Personel | undefined
): Personel[] {
  const byId = new Map(personeller.map(p => [p.id, p]));
  const ids = new Set<string>();

  personeller.forEach(p => {
    // Taşeron + idari kadro yoklama/puantaj listesine girmez.
    if (isTaseronPersonel(p) || isIdariPersonel(p)) return;
    if (isPersonelVisibleInMonth(p, year, month, asYoklamaGunMap(yoklamalar[p.id]))) ids.add(p.id);
  });
  Object.entries(yoklamalar).forEach(([id, map]) => {
    // Güvenlik: Personel yönetiminde olmayan (orphan / legacy-stub) ID'leri yoklama listesine taşımayız.
    // Bu, "kayıtlı olmayan personel yoklamada görünüyor" ve mükerrer satır riskini azaltır.
    const existing = byId.get(id);
    if (!existing) return;
    if (isTaseronPersonel(existing) || isIdariPersonel(existing)) return;
    const personMap = asYoklamaGunMap(map);
    if (!personHasYoklamaInMonth(personMap, year, month)) return;
    if (!isPersonelVisibleInMonth(existing, year, month, personMap)) return;
    ids.add(id);
  });

  const list = Array.from(ids)
    .map(id => byId.get(id) ?? resolveStub?.(id))
    .filter((p): p is Personel => !!p)
    .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));

  // Aynı kişinin (özellikle legacy/stub ID kaynaklı) birden fazla satır görünmesini engelle.
  const deduped = new Map<string, Personel>();
  const score = (p: Personel): number => {
    let s = 0;
    if ((p.tcNo || '').trim()) s += 100;
    if (!p.id.startsWith('PRS-LEGACY')) s += 50;
    if (p.durum === true || String(p.durum).toLowerCase() === 'true') s += 10;
    return s;
  };

  for (const p of list) {
    const key = (p.tcNo || '').trim() || normalizeTurkishName(`${p.ad} ${p.soyad}`);
    const existing = deduped.get(key);
    if (!existing || score(p) > score(existing)) {
      deduped.set(key, p);
    }
  }

  return Array.from(deduped.values()).sort((a, b) =>
    `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')
  );
}
