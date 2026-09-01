/** SGK WhatsApp grubu — sabit bildirim metinleri ve kuyruk eşleştirme. */

import type { Personel } from '../types/erp';

export const SGK_GRUP_ADI = 'SGK Giriş / Çıkış';

export type SgkGirisBildirimi = {
  id?: string;
  ad: string;
  soyad: string;
  tcNo?: string;
  gorev: string;
  nitelik?: string;
  girisTarihi: string;
  gonderen?: string;
};

export type SgkCikisBildirimi = {
  id?: string;
  ad: string;
  soyad: string;
  tcNo?: string;
  gorev?: string;
  cikisTarihi: string;
  cikisNedeni?: string;
  gonderen?: string;
};

function trDate(iso: string): string {
  const raw = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || '—';
  const [y, m, d] = raw.split('-');
  return `${d}.${m}.${y}`;
}

function line(label: string, value?: string) {
  const v = String(value || '').trim();
  return v ? `*${label}:* ${v}` : '';
}

/** Gruba atılacak sabit işe giriş metni. Ana Firma kaydı bu metin olmadan açılamaz. */
export function buildSgkGirisWhatsAppText(b: SgkGirisBildirimi): string {
  const body = [
    `*KİBRİTÇİ — ${SGK_GRUP_ADI}*`,
    `*İŞE GİRİŞ TALEBİ*`,
    `----------------------------------------`,
    line('Ad Soyad', `${b.ad} ${b.soyad}`.trim()),
    line('TC Kimlik', b.tcNo),
    line('Görevi (yoklama)', b.gorev),
    line('Niteliği (SGK meslek)', b.nitelik),
    line('Giriş tarihi', trDate(b.girisTarihi)),
    line('Gönderen', b.gonderen),
    `----------------------------------------`,
    `_Kimlik görseli bu mesajla birlikte gruba eklenir._`,
    `_SGK işe giriş bildirgesi gelince Grup Köprüsü’ne bırakılır; Ana Firma kaydı yalnızca Onay → Personel oluşturma’da tek kontrolle açılır._`,
  ]
    .filter(Boolean)
    .join('\n');
  return body;
}

/** Gruba atılacak sabit işten çıkış metni. */
export function buildSgkCikisWhatsAppText(b: SgkCikisBildirimi): string {
  return [
    `*KİBRİTÇİ — ${SGK_GRUP_ADI}*`,
    `*İŞTEN ÇIKIŞ TALEBİ*`,
    `----------------------------------------`,
    line('Ad Soyad', `${b.ad} ${b.soyad}`.trim()),
    line('TC Kimlik', b.tcNo),
    line('Görevi', b.gorev),
    line('Çıkış tarihi', trDate(b.cikisTarihi)),
    line('Neden', b.cikisNedeni),
    line('Gönderen', b.gonderen),
    `----------------------------------------`,
    `_Çıkış evrakı gelince Grup Köprüsü’ne bırakılır; çıkış yalnızca Onay → Personel giriş-çıkış onayı’nda resmileşir._`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function normalizePersonName(ad?: string, soyad?: string): string {
  return `${ad || ''} ${soyad || ''}`
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsTc(raw?: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export type BildirimAday = {
  id: string;
  ad?: string;
  soyad?: string;
  tcNo?: string;
  personelIsim?: string;
  personelId?: string;
  gorev?: string;
  nitelik?: string;
  iseGirisTarihi?: string;
  cikisTarihi?: string;
  kimlikFotoUrl?: string;
  durum?: string;
};

function fullNameOf(x: { ad?: string; soyad?: string; personelIsim?: string }): string {
  return normalizePersonName(x.ad, x.soyad) || normalizePersonName(x.personelIsim || '');
}

/** Ad + soyad zorunlu; tek kelime ("ALI") ile eşleşme yok — yanlış kişiye evrak yapışmasını keser. */
export function namesMatchExact(
  a: { ad?: string; soyad?: string; personelIsim?: string },
  b: { ad?: string; soyad?: string; personelIsim?: string }
): boolean {
  const na = fullNameOf(a);
  const nb = fullNameOf(b);
  if (!na || !nb) return false;
  if (na.split(' ').filter(Boolean).length < 2) return false;
  if (nb.split(' ').filter(Boolean).length < 2) return false;
  return na === nb;
}

function evrakBekliyorMu(x: BildirimAday): boolean {
  const d = String(x.durum || '');
  return d === 'WP_GÖNDERİLDİ' || d === 'GRUP_BILDIRILDI';
}

function rankBildirim(x: BildirimAday): number {
  // Önce evrak bekleyen (WP), sonra evrakı gelmiş (BEKLEMEDE). Böylece ikinci evrak yanlışlıkla
  // zaten onaya düşmüş kaydı ezmez; açık grup bildirimine yapışır.
  if (evrakBekliyorMu(x)) return 0;
  if (isPendingPersonelOnayDurum(x.durum)) return 1;
  return 2;
}

/** SGK evrakındaki kişi, gruba bildirilmiş kuyruk kaydıyla eşleşmeli. Alt-dize eşleşme yok. */
export function findSgkGrupBildirimi<T extends BildirimAday>(
  kuyruk: T[],
  opts: { ad?: string; soyad?: string; tcNo?: string; personelIsim?: string }
): T | undefined {
  const pending = kuyruk.filter((x) => isPendingPersonelOnayDurum(x.durum));
  const pool = pending.length ? pending : kuyruk;
  const pick = (hits: T[]): T | undefined =>
    hits.length ? [...hits].sort((a, b) => rankBildirim(a) - rankBildirim(b))[0] : undefined;

  const tc = digitsTc(opts.tcNo);
  if (tc.length === 11) {
    const byTc = pick(pool.filter((x) => digitsTc(x.tcNo) === tc));
    if (byTc) return byTc;
  }

  const needle = fullNameOf(opts);
  if (!needle || needle.split(' ').filter(Boolean).length < 2) return undefined;
  return pick(pool.filter((x) => namesMatchExact(x, opts)));
}

export function isPendingPersonelOnayDurum(durum?: string | null): boolean {
  const d = String(durum || '');
  return d === 'BEKLEMEDE' || d === 'WP_GÖNDERİLDİ' || d === 'GRUP_BILDIRILDI';
}

export function isAnaFirmaGirisAcik(bildirim?: BildirimAday | null): boolean {
  if (!bildirim) return false;
  return isPendingPersonelOnayDurum(bildirim.durum);
}

export type SgkTalepKayit = BildirimAday & {
  kaynak?: string;
  grupBildirildi?: boolean;
  firmaTipi?: string;
  sgkEvrakGeldi?: boolean;
  sgkEvrakUrl?: string;
  girisEvrakPdfUrl?: string;
  cikisEvrakPdfUrl?: string;
  babaAdi?: string;
  dogumTarihi?: string;
  adres?: string;
  il?: string;
  ilce?: string;
  cinsiyet?: string;
  bankaAdi?: string;
  ibanNo?: string;
  telefonNo?: string;
  personelIsim?: string;
  sgkCikisTarihi?: string;
};

/** Onay tıklanınca Ana Firma kartı — Grup Köprüsü bu fonksiyonu çağırmaz. */
export function buildAnaFirmaPersonelFromSgkTalep(item: SgkTalepKayit, fallbackId?: string): Personel {
  const evrak = sgkEvrakUrlOf(item);
  return {
    id: item.personelId || fallbackId || `p_${Date.now()}`,
    tcNo: String(item.tcNo || ''),
    ad: String(item.ad || '').toLocaleUpperCase('tr-TR'),
    soyad: String(item.soyad || '').toLocaleUpperCase('tr-TR'),
    babaAdi: item.babaAdi || '',
    dogumTarihi: item.dogumTarihi || '',
    telefonNo: item.telefonNo || '',
    eposta: '',
    adres: item.adres || '',
    il: item.il || '',
    ilce: item.ilce || '',
    departman: 'ŞANTİYE',
    gorev: String(item.gorev || 'İŞÇİ').toLocaleUpperCase('tr-TR'),
    nitelik: item.nitelik ? String(item.nitelik).toLocaleUpperCase('tr-TR') : undefined,
    iseGirisTarihi: String(item.iseGirisTarihi || new Date().toISOString()).slice(0, 10),
    cinsiyet: item.cinsiyet || 'Belirtilmedi',
    maas: 0,
    ucretTipi: 'Aylık',
    sgkDurumu: "SGK'lı",
    bankaAdi: item.bankaAdi || '',
    subeAdi: '',
    ibanNo: item.ibanNo || '',
    durum: true,
    firmaTipi: 'ANA_FIRMA',
    kaynak: 'SGK_GRUP',
    onayDurumu: 'ONAYLANDI',
    fotografUrl: item.kimlikFotoUrl,
    sigortaEvrakUrl: evrak || undefined,
  };
}

export function isSgkGrupTalep(item?: { kaynak?: string; grupBildirildi?: boolean } | null): boolean {
  if (!item) return false;
  return String(item.kaynak || '') === 'SGK_GRUP' || item.grupBildirildi === true;
}

export function sgkEvrakUrlOf(
  item?: {
    sgkEvrakUrl?: string;
    girisEvrakPdfUrl?: string;
    cikisEvrakPdfUrl?: string;
  } | null
): string {
  if (!item) return '';
  return String(item.sgkEvrakUrl || item.girisEvrakPdfUrl || item.cikisEvrakPdfUrl || '');
}

export function hasSgkEvrak(
  item?: {
    sgkEvrakGeldi?: boolean;
    sgkEvrakUrl?: string;
    girisEvrakPdfUrl?: string;
    cikisEvrakPdfUrl?: string;
  } | null
): boolean {
  if (!item) return false;
  return Boolean(item.sgkEvrakGeldi) || Boolean(sgkEvrakUrlOf(item));
}

/** Grup bildirimi + SGK evrakı tamam; Onay’da tek kontrolle yazılabilir. */
export function isSgkOnayHazir(item?: SgkTalepKayit | null): boolean {
  return (
    isSgkGrupTalep(item) &&
    Boolean(item?.grupBildirildi) &&
    hasSgkEvrak(item) &&
    isPendingPersonelOnayDurum(item?.durum)
  );
}

/** Kuyruk / Onay rozeti — makine: WP_GÖNDERİLDİ → BEKLEMEDE → ONAYLANDI. */
export function sgkDurumEtiketi(
  durum?: string | null,
  opts?: { sgkTalep?: boolean; kind?: 'giris' | 'cikis' }
): string {
  const d = String(durum || '');
  const sgk = Boolean(opts?.sgkTalep);
  const cikis = opts?.kind === 'cikis';
  if (d === 'ONAYLANDI' || d === 'KAYIT_TAMAMLANDI') {
    return sgk
      ? cikis
        ? 'KAYIT TAMAMLANDI (ÇIKIŞ RESMİ)'
        : 'KAYIT TAMAMLANDI (GİRİŞ YAZILDI)'
      : cikis
        ? 'ONAYLANDI'
        : 'ONAYLANDI (GİRİŞ YAPILDI)';
  }
  if (d === 'WP_GÖNDERİLDİ' || d === 'GRUP_BILDIRILDI') {
    return sgk ? 'WP GÖNDERİLDİ — EVRAK BEKLENİYOR' : 'YÖNETİCİYE WP İLETİLDİ';
  }
  if (d === 'REDDEDİLDİ') return cikis ? 'REDDEDİLDİ' : 'REDDEDİLDİ (GİRİŞ ENGELLENDİ)';
  if (d === 'BEKLEMEDE') {
    return sgk ? 'BEKLEMEDE — EVRAK GELDİ, ONAY BEKLİYOR' : cikis ? 'BEKLEMEDE' : 'BEKLEMEDE (KAPIDA)';
  }
  return d || '—';
}

/** Ana Firma SGK yolu: grup veya evrak yoksa onay/yazım engeli. */
export function anaFirmaSgkEngel(item?: SgkTalepKayit | null): string | null {
  if (!isSgkGrupTalep(item)) return null;
  if (!item?.grupBildirildi) {
    return 'SGK WhatsApp grubuna bildirim yok. Ana Firma işlemi onaylanamaz. Önce Grup Köprüsü’nden kimlik, görev ve tarihi gruba bildirin.';
  }
  if (!hasSgkEvrak(item)) {
    return 'SGK evrakı henüz düşmedi. Grup Köprüsü’nden bildirgenin bırakılması gerekir; evraksız Ana Firma kaydı açılamaz.';
  }
  return null;
}

export function buildSgkTalepPatchFromParse(
  parsed: Record<string, any>,
  evrakUrl: string,
  kind: 'giris' | 'cikis',
  bildirim?: BildirimAday
): Record<string, unknown> {
  const ad = String(parsed.ad || bildirim?.ad || '').toLocaleUpperCase('tr-TR');
  const soyad = String(parsed.soyad || bildirim?.soyad || '').toLocaleUpperCase('tr-TR');
  const tcNo = digitsTc(parsed.tcNo || bildirim?.tcNo);
  const evrakTarihi = String(
    parsed.iseGirisTarihi ||
      (kind === 'giris' ? bildirim?.iseGirisTarihi : bildirim?.cikisTarihi) ||
      ''
  ).slice(0, 10);
  const gorev = String(bildirim?.gorev || parsed.gorev || '').toLocaleUpperCase('tr-TR');
  const nitelik = String(bildirim?.nitelik || '').toLocaleUpperCase('tr-TR');
  return {
    durum: 'BEKLEMEDE',
    kaynak: 'SGK_GRUP',
    grupBildirildi: true,
    firmaTipi: 'ANA_FIRMA',
    sgkEvrakGeldi: true,
    sgkEvrakUrl: evrakUrl,
    ad: ad || undefined,
    soyad: soyad || undefined,
    personelIsim: `${ad} ${soyad}`.trim() || bildirim?.personelIsim || undefined,
    tcNo: tcNo || undefined,
    babaAdi: parsed.babaAdi || undefined,
    dogumTarihi: parsed.dogumTarihi || undefined,
    adres: parsed.adres || undefined,
    il: parsed.il || undefined,
    ilce: parsed.ilce || undefined,
    cinsiyet: parsed.cinsiyet || undefined,
    bankaAdi: parsed.bankaAdi || undefined,
    ibanNo: parsed.ibanNo || undefined,
    gorev: gorev || undefined,
    nitelik: nitelik || undefined,
    onayaDusmeTarihi: new Date().toISOString(),
    ...(kind === 'giris'
      ? { girisEvrakPdfUrl: evrakUrl, iseGirisTarihi: evrakTarihi || undefined }
      : { cikisEvrakPdfUrl: evrakUrl, cikisTarihi: evrakTarihi || undefined, sgkCikisTarihi: evrakTarihi || undefined }),
  };
}
