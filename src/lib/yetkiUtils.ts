/** Portal sayfa anahtarları — Sidebar ile YetkiVerme aynı listeyi kullanır */
export const PORTAL_PAGES = [
  { key: "ana_sayfa", label: "Ana Sayfa Dashboard", group: "BAŞLANGIÇ" },
  { key: "personel", label: "Personel Yönetimi", group: "PERSONEL" },
  { key: "personel_kartlari", label: "Personel Detay Kartları", group: "PERSONEL" },
  { key: "yoklama", label: "Yoklama ve Puantaj", group: "PERSONEL" },
  { key: "faaliyet_personel", label: "Faaliyeti Olan Personeller", group: "PERSONEL" },
  { key: "maas", label: "Maaş Hesaplama & Ödeme", group: "PERSONEL" },
  { key: "personel_izin", label: "Personel İzin Formu", group: "PERSONEL" },
  { key: "kasa", label: "Haftalık Kasa", group: "FİNANS & ENVANTER" },
  { key: "satin_alma", label: "Satın Alma Talep", group: "FİNANS & ENVANTER" },
  { key: "siparis_formu", label: "Sipariş Formu", group: "FİNANS & ENVANTER" },
  { key: "irsaliye_giris", label: "İrsaliye ve Fiş Girişi", group: "FİNANS & ENVANTER" },
  { key: "t_cetveli", label: "T Cetveli", group: "FİNANS & ENVANTER" },
  { key: "fatura_giris", label: "Fatura Girişi", group: "FİNANS & ENVANTER" },
  { key: "taseron_kesinti", label: "Taşeron Yönetimi", group: "FİNANS & ENVANTER" },
  { key: "cari_stok", label: "Cari ve Stok Kartları", group: "FİNANS & ENVANTER" },
  { key: "kibar_hakedis", label: "ZER YAPI Hakediş", group: "FİNANS & ENVANTER" },
  { key: "operator", label: "Operatör Faaliyetleri", group: "İŞ MAKİNESİ & OPERATÖR" },
  { key: "arac", label: "Araç ve Demirbaş", group: "İDARİ İŞLER & SAHA" },
  { key: "kamp", label: "Kamp Yönetimi", group: "İDARİ İŞLER & SAHA" },
  { key: "saha", label: "Daily Saha Faaliyetleri", group: "İDARİ İŞLER & SAHA" },
  { key: "rapor_programlama", label: "Raporlama & Programlama", group: "İDARİ İŞLER & SAHA" },
  { key: "tutanak", label: "Hazır Tutanaklar", group: "İDARİ İŞLER & SAHA" },
  { key: "formen_ekrani", label: "Formen Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "guvenlik_ekrani", label: "Güvenlik & Kapı Kontrol", group: "İDARİ İŞLER & SAHA" },
  { key: "kampci_ekrani", label: "Kampçı Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "tesisatci_ekrani", label: "Tesisatçı Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "mermerci_ekrani", label: "Mermerci Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "seramik_ekrani", label: "Götürü / Seramik Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "lojistik_ekrani", label: "Şöför Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "depocu_ekrani", label: "Depocu Mobil Paneli", group: "İDARİ İŞLER & SAHA" },
  { key: "imalat_terminali", label: "İmalat Terminali", group: "İDARİ İŞLER & SAHA" },
  { key: "temizlik_kirim", label: "Temizlik / Kırım Tespiti", group: "İDARİ İŞLER & SAHA" },
  { key: "parsel_temizlik_tespit", label: "Parsel Temizlik Tespit", group: "İDARİ İŞLER & SAHA" },
  { key: "onay_islemleri", label: "Onay Havuzu & İmzalar", group: "RAPOR VE İLETİŞİM" },
  { key: "admin", label: "Üyelik Onay & İmza", group: "ADMİNİSTRATOR" },
  { key: "yetki_verme", label: "Sayfa Yetkilendirme", group: "ADMİNİSTRATOR" },
] as const;

export type PortalPageKey = (typeof PORTAL_PAGES)[number]["key"];

/** Mobil saha rolleri → erişilebilir panel sekmeleri */
export const MOBILE_ROLE_ALLOWED_TABS: Record<string, PortalPageKey[]> = {
  // Formen günlük planı yönetirken ana sayfadaki genel özeti de görebilir.
  FORMEN: ['ana_sayfa', 'formen_ekrani', 'faaliyet_personel', 'rapor_programlama', 'personel', 'siparis_formu'],
  GÜVENLİK: ['guvenlik_ekrani', 'siparis_formu'],
  KAMPÇI: ['kampci_ekrani', 'siparis_formu'],
  TESİSATÇI: ['tesisatci_ekrani', 'siparis_formu'],
  MERMERCİ: ['mermerci_ekrani', 'siparis_formu'],
  GÖTÜRÜ: ['seramik_ekrani', 'siparis_formu'],
  LOJİSTİK: ['lojistik_ekrani', 'siparis_formu'],
  OPERATÖR: ['operator', 'siparis_formu'],
  DEPOCU: ['depocu_ekrani', 'siparis_formu'],
  ANAHTARCI: ['imalat_terminali', 'siparis_formu'],
};

/** @deprecated MOBILE_ROLE_ALLOWED_TABS kullanın */
export const MOBILE_ROLE_HOME_TAB: Record<string, PortalPageKey> = Object.fromEntries(
  Object.entries(MOBILE_ROLE_ALLOWED_TABS).map(([role, tabs]) => [role, tabs[0]])
) as Record<string, PortalPageKey>;

const YETKI_ALIASES: Record<string, string> = {
  KAMPCI: 'KAMPÇI',
  KAMPCİ: 'KAMPÇI',
  GUVENLIK: 'GÜVENLİK',
  LOJISTIK: 'LOJİSTİK',
  DEPO: 'DEPOCU',
  /** Personel/görev kataloğu ve üyelik formları “ŞÖFÖR” yazar; mobil rol LOJİSTİK */
  ŞÖFÖR: 'LOJİSTİK',
  ŞOFÖR: 'LOJİSTİK',
  SOFÖR: 'LOJİSTİK',
  SOFOR: 'LOJİSTİK',
  DRIVER: 'LOJİSTİK',
  TESISATCI: 'TESİSATÇI',
  TESİSATCI: 'TESİSATÇI',
  MERMERCI: 'MERMERCİ',
  GOTURU: 'GÖTÜRÜ',
  GÖTURU: 'GÖTÜRÜ',
  SERAMIK: 'GÖTÜRÜ',
  SERAMİK: 'GÖTÜRÜ',
  OPERATOR: 'OPERATÖR',
  OPERATÖR: 'OPERATÖR',
  'İDARİ İŞLER': 'İDARİ_İŞLER',
  'IDARI ISLER': 'İDARİ_İŞLER',
  IDARI_ISLER: 'İDARİ_İŞLER',
  IDARI: 'İDARİ_İŞLER',
};

/** Şöför Mobil Paneli — kayıtlı yetki ŞÖFÖR / LOJİSTİK */
export function isSoforYetki(yetki?: string | null): boolean {
  return normalizeYetki(yetki) === 'LOJİSTİK';
}

export function normalizeYetki(yetki?: string | null): string {
  if (!yetki) return "";
  let v = String(yetki).trim().toLocaleUpperCase("tr-TR");
  return YETKI_ALIASES[v] ?? v;
}

export function getRoleAllowedTabs(yetki?: string | null): PortalPageKey[] | null {
  const normalized = normalizeYetki(yetki);
  return MOBILE_ROLE_ALLOWED_TABS[normalized] ?? null;
}

export function getRoleHomeTab(yetki?: string | null): PortalPageKey | null {
  const allowed = getRoleAllowedTabs(yetki);
  return allowed?.[0] ?? null;
}

export function isMobileRole(yetki?: string | null): boolean {
  return getRoleAllowedTabs(yetki) !== null;
}

/** İdari İşler: üyelik onay / imza paneline erişebilir (süper admin araçları hariç) */
export function isIdariIslerRole(yetki?: string | null): boolean {
  return normalizeYetki(yetki) === 'İDARİ_İŞLER';
}

/** Üyelik & Admin paneli — kurucu/müdür veya İdari İşler */
export function canAccessUyelikAdminPanel(
  yetki?: string | null,
  options?: { isPrivilegedAdmin?: boolean }
): boolean {
  if (options?.isPrivilegedAdmin) return true;
  return isIdariIslerRole(yetki);
}

/** Onay Havuzu & İmzalar — yönetici rolleri + İdari İşler */
export function canAccessOnayHavuzu(
  yetki?: string | null,
  options?: { isYonetici?: boolean; isPrivilegedAdmin?: boolean }
): boolean {
  if (options?.isPrivilegedAdmin || options?.isYonetici) return true;
  return isIdariIslerRole(yetki);
}

/** Tek panel — tam ekran mobil (Formen hariç; o personel sekmesine de erişir) */
export function isStandaloneMobileRole(yetki?: string | null): boolean {
  const allowed = getRoleAllowedTabs(yetki);
  return !!allowed && allowed.length === 1;
}

export function getMobileRoleDisplayName(yetki?: string | null): string {
  const n = normalizeYetki(yetki);
  const labels: Record<string, string> = {
    FORMEN: 'Formen Mobil + Personel',
    KAMPÇI: 'Kampçı Mobil',
    TESİSATÇI: 'Tesisatçı Mobil',
    MERMERCİ: 'Mermerci Mobil',
    GÖTÜRÜ: 'Götürü / Seramik Mobil',
    GÜVENLİK: 'Güvenlik Mobil',
    LOJİSTİK: 'Şöför Mobil',
    OPERATÖR: 'Operatör Mobil',
    DEPOCU: 'Depocu Mobil',
    ANAHTARCI: 'İmalat Terminali Mobil',
  };
  return labels[n] || n;
}

/** Rol ana paneli kısıtlamalardan muaf; mobil roller yalnızca tanımlı panellere erişir */
export function isTabRestrictedForUser(
  tab: string,
  yetki?: string | null,
  kisitliSayfalar?: string[] | null
): boolean {
  const allowed = getRoleAllowedTabs(yetki);
  if (allowed) {
    return !allowed.includes(tab as PortalPageKey);
  }
  // İdari İşler: üyelik paneli + onay havuzu kısıt listesinden muaf
  if (isIdariIslerRole(yetki) && (tab === 'admin' || tab === 'onay_islemleri')) {
    return false;
  }
  if (!kisitliSayfalar?.length) return false;
  return kisitliSayfalar.includes(tab);
}

/** Kayıt sırasında mobil rolün ana paneli asla kısıtlı listeye eklenmez */
export function sanitizeKisitliSayfalar(
  yetki: string | undefined,
  kisitliSayfalar: string[] | undefined
): string[] {
  const homeTab = getRoleHomeTab(yetki);
  if (!homeTab || !kisitliSayfalar?.length) return kisitliSayfalar ?? [];
  return kisitliSayfalar.filter((k) => k !== homeTab);
}

/** Mobil saha rolleri yalnızca tanımlı panel sekmelerini görür */
export function buildKisitliSayfalarForRole(yetki?: string | null): string[] | undefined {
  const allowed = getRoleAllowedTabs(yetki);
  if (allowed) {
    return PORTAL_PAGES.map((p) => p.key).filter((k) => !allowed.includes(k));
  }
  if (normalizeYetki(yetki) === 'MİSAFİR') {
    return PORTAL_PAGES.map((p) => p.key);
  }
  return undefined;
}

/** Admin paneli rol combobox listesi */
export const YETKI_ROLLER = [
  'YÖNETİCİ',
  'MUHASEBE',
  'İDARİ_İŞLER',
  'SATIN_ALMA',
  'ŞANTİYE_ŞEFİ',
  'PROJE_MÜDÜRÜ',
  'ELEKTRİK_ŞEFİ',
  'TESİSAT_ŞEFİ',
  'MEKANİK_ŞEFİ',
  'İNCE_İŞLER_ŞEFİ',
  'KABA_İŞLER_ŞEFİ',
  'DİZAYN_ŞEFİ',
  'PARSEL_ŞEFİ',
  'FORMEN',
  'KAMPÇI',
  'TESİSATÇI',
  'MERMERCİ',
  'GÖTÜRÜ',
  'GÜVENLİK',
  'LOJİSTİK',
  'OPERATÖR',
  'DEPOCU',
  'ANAHTARCI',
  'MİSAFİR',
] as const;

export type YetkiRol = (typeof YETKI_ROLLER)[number];

export interface YetkiSablonu {
  id: string;
  yetki: string;
  /** Menüde gizlenecek sayfa anahtarları */
  kisitliSayfalar: string[];
  /** Salt okunur sayfalar (görür ama düzenleyemez) — listede olmayan görünür sayfalar düzenlenebilir */
  saltOkunurSayfalar: string[];
  guncellemeTarihi: string;
}

/** Rol değişince yetki + sayfa kısıtlarını tek seferde uygular */
export function applyRoleDefaults<T extends { yetki?: string; kisitliSayfalar?: string[] }>(
  user: T,
  newYetki: string
): T & { yetki: string; kisitliSayfalar?: string[] } {
  const yetki = normalizeYetki(newYetki);
  const autoRestricted = buildKisitliSayfalarForRole(yetki);
  if (autoRestricted) {
    return { ...user, yetki, kisitliSayfalar: autoRestricted };
  }
  if (isMobileRole(user.yetki)) {
    return { ...user, yetki, kisitliSayfalar: [] };
  }
  return {
    ...user,
    yetki,
    kisitliSayfalar: sanitizeKisitliSayfalar(yetki, user.kisitliSayfalar ?? []),
  };
}

export function guessRoleFromEmail(email: string): string {
  const norm = email.toLowerCase().trim();
  if (
    norm === 'sametatak9@gmail.com' ||
    norm === 'santiye@kibritci.com' ||
    norm === 'sekreter@kibritci.com'
  ) {
    return 'KURUCU';
  }
  if (norm.includes('guven') || norm.includes('security') || norm.includes('kapi')) {
    return 'GÜVENLİK';
  }
  if (norm.includes('formen')) {
    return 'FORMEN';
  }
  if (norm.includes('kamp') || norm.includes('camp')) {
    return 'KAMPÇI';
  }
  if (norm.includes('tesisat') || norm.includes('plumbing')) {
    return 'TESİSATÇI';
  }
  if (norm.includes('mermer') || norm.includes('marble')) {
    return 'MERMERCİ';
  }
  if (norm.includes('goturu') || norm.includes('götürü') || norm.includes('seramik')) {
    return 'GÖTÜRÜ';
  }
  if (norm.includes('depo') || norm.includes('store')) {
    return 'DEPOCU';
  }
  if (norm.includes('lojistik') || norm.includes('logistics')) {
    return 'LOJİSTİK';
  }
  if (norm.includes('sofor') || norm.includes('driver')) {
    return 'LOJİSTİK';
  }
  if (norm.includes('operator') || norm.includes('operatör') || norm.includes('is makine')) {
    return 'OPERATÖR';
  }
  if (norm.includes('anahtar') || norm.includes('key')) {
    return 'ANAHTARCI';
  }
  return 'MİSAFİR';
}
