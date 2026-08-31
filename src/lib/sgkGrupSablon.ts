/** SGK WhatsApp grubu — sabit bildirim metinleri ve kuyruk eşleştirme. */

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
    `_SGK işe giriş bildirgesi gelince ERP «Grup Köprüsü»nden Ana Firma kaydı resmileşir._`,
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
    `_Çıkış evrakı gelince ERP «Grup Köprüsü»nden çıkış resmileşir._`,
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

/** SGK evrakındaki kişi, gruba bildirilmiş kuyruk kaydıyla eşleşmeli. */
export function findSgkGrupBildirimi<T extends BildirimAday>(
  kuyruk: T[],
  opts: { ad?: string; soyad?: string; tcNo?: string; personelIsim?: string }
): T | undefined {
  const tc = digitsTc(opts.tcNo);
  if (tc.length === 11) {
    const byTc = kuyruk.find((x) => digitsTc(x.tcNo) === tc);
    if (byTc) return byTc;
  }
  const needle = normalizePersonName(
    opts.ad,
    opts.soyad
  ) || normalizePersonName(opts.personelIsim || '');
  if (!needle) return undefined;
  return kuyruk.find((x) => {
    const full = normalizePersonName(x.ad, x.soyad) || normalizePersonName(x.personelIsim || '');
    return full && (full === needle || full.includes(needle) || needle.includes(full));
  });
}

export function isAnaFirmaGirisAcik(bildirim?: BildirimAday | null): boolean {
  if (!bildirim) return false;
  const d = String(bildirim.durum || '');
  return d === 'BEKLEMEDE' || d === 'WP_GÖNDERİLDİ' || d === 'GRUP_BILDIRILDI';
}
