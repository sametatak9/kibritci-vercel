import { Personel } from '../types/erp';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { normalizeGorev } from './gorevUtils';
import { isDayActiveForPersonel, isTaseronPersonel } from './yoklamaUtils';
import { isFounderEmail } from './roleClaims';
import { buildWhatsAppUrl } from './mobilOnayUtils';

export type NobetVardiyaTipi = 'TUM_GUN' | 'GUNDUZ' | 'GECE';

type GuvenlikTarihliKayit = {
  islemTarihi?: string;
  zaman?: string;
  girisZamani?: string;
  tarih?: string;
};

/** Log/evrak kaydının işlem günü (YYYY-MM-DD) */
export function guvenlikKayitTarihi(log: GuvenlikTarihliKayit | null | undefined): string {
  if (!log) return '';
  if (log.islemTarihi) return normalizeDateKey(log.islemTarihi);
  const raw = log.zaman || log.girisZamani || log.tarih || '';
  return normalizeDateKey(String(raw).slice(0, 10));
}

export function filterGuvenlikLogsByTarih<T extends GuvenlikTarihliKayit>(
  logs: T[],
  tarih: string
): T[] {
  const key = normalizeDateKey(tarih);
  if (!key) return logs;
  return logs.filter((l) => guvenlikKayitTarihi(l) === key);
}

function nobetVardiyaAraligi(tarih: string, vardiya: NobetVardiyaTipi): { start: string; end: string } | null {
  if (vardiya === 'TUM_GUN') return null;
  const base = new Date(tarih + 'T12:00:00');
  base.setDate(base.getDate() + 1);
  const nextDay = base.toISOString().split('T')[0];
  if (vardiya === 'GUNDUZ') {
    return { start: `${tarih}T08:00:00.000Z`, end: `${tarih}T20:00:00.000Z` };
  }
  return { start: `${tarih}T20:00:00.000Z`, end: `${nextDay}T08:00:00.000Z` };
}

function zamanAralikta(zaman: string, start: string, end: string): boolean {
  if (!zaman) return false;
  return zaman >= start && zaman < end;
}

export function filterNobetPersonelLoglari(
  logs: Array<{ zaman?: string; islemTarihi?: string }>,
  tarih: string,
  vardiya: NobetVardiyaTipi
) {
  const day = filterGuvenlikLogsByTarih(logs, tarih);
  const aralik = nobetVardiyaAraligi(tarih, vardiya);
  if (!aralik) return day;
  return day.filter((l) => zamanAralikta(String(l.zaman || ''), aralik.start, aralik.end));
}

export function filterNobetAracZiyaretLoglari(
  logs: Array<{ girisZamani?: string; cikisZamani?: string; islemTarihi?: string }>,
  tarih: string,
  vardiya: NobetVardiyaTipi,
  simdiIso?: string
) {
  const day = filterGuvenlikLogsByTarih(logs, tarih);
  const aralik = nobetVardiyaAraligi(tarih, vardiya);
  if (!aralik) return day;
  const now = simdiIso || new Date().toISOString();
  return day.filter((a) => {
    const inTime = String(a.girisZamani || '');
    const outTime = a.cikisZamani || now;
    return inTime < aralik!.end && outTime >= aralik!.start;
  });
}

export function filterNobetEvrakLoglari(
  logs: Array<{ tarih?: string; saat?: string }>,
  tarih: string,
  vardiya: NobetVardiyaTipi
) {
  const day = logs.filter((e) => normalizeDateKey(e.tarih) === normalizeDateKey(tarih));
  const aralik = nobetVardiyaAraligi(tarih, vardiya);
  if (!aralik) return day;
  return day.filter((e) => {
    if (!e.tarih || !e.saat) return false;
    const evrakTime = `${normalizeDateKey(e.tarih)}T${e.saat}:00.000Z`;
    return zamanAralikta(evrakTime, aralik.start, aralik.end);
  });
}

export type NobetArsivFotoKaynak =
  | 'EVRAK'
  | 'SU_TANKERI'
  | 'VIDANJOR'
  | 'PETROL_TANKERI'
  | 'MICIR_STABILIZE';

export type NobetArsivFotografi = {
  id: string;
  kaynak: NobetArsivFotoKaynak;
  kaynakEtiket: string;
  fotoUrl: string;
  fileName?: string | null;
  aciklama?: string;
  zaman?: string;
  refId?: string;
};

const NOBET_FOTO_KAYNAK_ETIKET: Record<NobetArsivFotoKaynak, string> = {
  EVRAK: 'Gelen Evrak',
  SU_TANKERI: 'Su Tankeri',
  VIDANJOR: 'Vidanjör',
  PETROL_TANKERI: 'Petrol Tankeri',
  MICIR_STABILIZE: 'Mıcır / Stabilize / Taş Tozu',
};

function isNobetImageUrl(fotoUrl?: string | null, fileName?: string | null): boolean {
  const url = String(fotoUrl || '');
  if (url.startsWith('data:image/')) return true;
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return true;
  if (fileName && /\.(jpe?g|png|webp|gif)$/i.test(fileName)) return true;
  return false;
}

function pushNobetFoto(
  out: NobetArsivFotografi[],
  seen: Set<string>,
  item: {
    id?: string;
    fotoUrl?: string | null;
    fileName?: string | null;
    kaynak: NobetArsivFotoKaynak;
    aciklama?: string;
    zaman?: string;
  }
) {
  const fotoUrl = String(item.fotoUrl || '').trim();
  if (!fotoUrl) return;
  const key = `${item.kaynak}:${item.id || ''}:${fotoUrl.slice(0, 80)}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    id: `${item.kaynak}_${item.id || out.length}`,
    kaynak: item.kaynak,
    kaynakEtiket: NOBET_FOTO_KAYNAK_ETIKET[item.kaynak],
    fotoUrl,
    fileName: item.fileName || null,
    aciklama: item.aciklama || '',
    zaman: item.zaman || '',
    refId: item.id,
  });
}

/** Nöbet gününde yüklenen fotoğrafları (evrak + tanker) tek listede toplar */
export function collectNobetGunlukFotograflar(input: {
  evrakLoglari?: Array<{
    id?: string;
    fotoUrl?: string | null;
    fileName?: string | null;
    evrakTuru?: string;
    aciklama?: string;
    firma?: string;
    saat?: string;
    tarih?: string;
  }>;
  suTankeriLoglari?: Array<{
    id?: string;
    tip?: string;
    fotoUrl?: string | null;
    fileName?: string | null;
    plaka?: string;
    firma?: string;
    miktar?: string;
    girisZamani?: string;
  }>;
  vidanjorLoglari?: Array<{
    id?: string;
    tip?: string;
    fotoUrl?: string | null;
    fileName?: string | null;
    plaka?: string;
    firma?: string;
    miktar?: string;
    girisZamani?: string;
  }>;
  petrolTankeriLoglari?: Array<{
    id?: string;
    tip?: string;
    fotoUrl?: string | null;
    fileName?: string | null;
    plaka?: string;
    firma?: string;
    miktar?: string;
    girisZamani?: string;
  }>;
  miciStabilizeLoglari?: Array<{
    id?: string;
    tip?: string;
    fotoUrl?: string | null;
    fileName?: string | null;
    plaka?: string;
    firma?: string;
    miktar?: string;
    girisZamani?: string;
  }>;
}): NobetArsivFotografi[] {
  const out: NobetArsivFotografi[] = [];
  const seen = new Set<string>();

  for (const e of input.evrakLoglari || []) {
    pushNobetFoto(out, seen, {
      id: e.id,
      fotoUrl: e.fotoUrl,
      fileName: e.fileName,
      kaynak: 'EVRAK',
      aciklama: [e.evrakTuru, e.firma, e.aciklama].filter(Boolean).join(' · '),
      zaman: e.tarih && e.saat ? `${e.tarih}T${e.saat}:00` : e.tarih || e.saat || '',
    });
  }

  const tankerGroups: Array<{
    kaynak: NobetArsivFotoKaynak;
    logs?: typeof input.suTankeriLoglari;
  }> = [
    { kaynak: 'SU_TANKERI', logs: input.suTankeriLoglari },
    { kaynak: 'VIDANJOR', logs: input.vidanjorLoglari },
    { kaynak: 'PETROL_TANKERI', logs: input.petrolTankeriLoglari },
    { kaynak: 'MICIR_STABILIZE', logs: input.miciStabilizeLoglari },
  ];

  for (const group of tankerGroups) {
    for (const t of group.logs || []) {
      pushNobetFoto(out, seen, {
        id: t.id,
        fotoUrl: t.fotoUrl,
        fileName: t.fileName,
        kaynak: group.kaynak,
        aciklama: [t.plaka, t.firma, t.miktar].filter(Boolean).join(' · '),
        zaman: t.girisZamani || '',
      });
    }
  }

  return out;
}

/** Eski arşivlerde fotograflar alanı yoksa loglardan türetir */
export function resolveNobetArsivFotograflar(archive: {
  fotograflar?: NobetArsivFotografi[];
  evrakLoglari?: any[];
  suTankeriLoglari?: any[];
  vidanjorLoglari?: any[];
  petrolTankeriLoglari?: any[];
  miciStabilizeLoglari?: any[];
}): NobetArsivFotografi[] {
  if (Array.isArray(archive.fotograflar) && archive.fotograflar.length > 0) {
    return archive.fotograflar.filter((f) => f?.fotoUrl);
  }
  return collectNobetGunlukFotograflar(archive);
}

export function buildNobetGunlukRaporHtml(archive: {
  tarih: string;
  vardiya?: string;
  kaydeden?: string;
  kayitZamani?: string;
  notlar?: string;
  personelLoglari?: any[];
  aracLoglari?: any[];
  suTankeriLoglari?: any[];
  vidanjorLoglari?: any[];
  petrolTankeriLoglari?: any[];
  miciStabilizeLoglari?: any[];
  ziyaretciLoglari?: any[];
  evrakLoglari?: any[];
  fotograflar?: NobetArsivFotografi[];
  akvizyonYoklama?: Record<string, string> | null;
}): string {
  const tarihLabel = formatDateLabelTr(archive.tarih);
  const vardiyaLabel =
    archive.vardiya === 'GECE' ? 'Gece Vardiyası' :
    archive.vardiya === 'GUNDUZ' ? 'Gündüz Vardiyası' : 'Tam Gün (24 Saat)';
  const p = archive.personelLoglari || [];
  const a = archive.aracLoglari || [];
  const st = archive.suTankeriLoglari || [];
  const vd = archive.vidanjorLoglari || [];
  const pt = archive.petrolTankeriLoglari || [];
  const ms = archive.miciStabilizeLoglari || [];
  const z = archive.ziyaretciLoglari || [];
  const e = archive.evrakLoglari || [];
  const fotos = resolveNobetArsivFotograflar(archive);

  const section = (title: string, rows: string) =>
    `<section style="margin-bottom:24px"><h2 style="font-size:14px;border-bottom:2px solid #cbd5e1;padding-bottom:6px;margin:0 0 10px">${title}</h2>${rows}</section>`;

  const personelRows = p.length
    ? `<table><tr><th>Saat</th><th>Ad Soyad</th><th>Tip</th><th>Firma</th></tr>${p.map((l) =>
        `<tr><td>${formatZamanTr(l.zaman).split(' ')[1] || '—'}</td><td>${l.ad || ''} ${l.soyad || ''}</td><td>${l.tip || '—'}</td><td>${l.firmaAdi || '—'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const aracRows = a.length
    ? `<table><tr><th>Plaka</th><th>Firma</th><th>Giriş</th><th>Çıkış</th></tr>${a.map((l) =>
        `<tr><td>${l.plaka || '—'}</td><td>${l.firma || '—'}</td><td>${formatZamanTr(l.girisZamani)}</td><td>${l.cikisZamani ? formatZamanTr(l.cikisZamani) : 'İçeride'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const stRows = st.length
    ? `<table><tr><th>Plaka</th><th>Firma</th><th>Miktar</th><th>Giriş</th><th>Çıkış</th></tr>${st.map((l) =>
        `<tr><td>${l.plaka || '—'}</td><td>${l.firma || '—'}</td><td>${l.miktar || '—'}</td><td>${formatZamanTr(l.girisZamani)}</td><td>${l.cikisZamani ? formatZamanTr(l.cikisZamani) : 'İçeride'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const vdRows = vd.length
    ? `<table><tr><th>Plaka</th><th>Firma</th><th>Çekim</th><th>Giriş</th><th>Çıkış</th></tr>${vd.map((l) =>
        `<tr><td>${l.plaka || '—'}</td><td>${l.firma || '—'}</td><td>${l.miktar || '—'}</td><td>${formatZamanTr(l.girisZamani)}</td><td>${l.cikisZamani ? formatZamanTr(l.cikisZamani) : 'İçeride'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const ptRows = pt.length
    ? `<table><tr><th>Plaka</th><th>Firma</th><th>Miktar</th><th>Giriş</th><th>Çıkış</th></tr>${pt.map((l) =>
        `<tr><td>${l.plaka || '—'}</td><td>${l.firma || '—'}</td><td>${l.miktar || '—'}</td><td>${formatZamanTr(l.girisZamani)}</td><td>${l.cikisZamani ? formatZamanTr(l.cikisZamani) : 'İçeride'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const msRows = ms.length
    ? `<table><tr><th>Plaka</th><th>Firma</th><th>Malzeme/Miktar</th><th>Giriş</th><th>Çıkış</th></tr>${ms.map((l) =>
        `<tr><td>${l.plaka || '—'}</td><td>${l.firma || '—'}</td><td>${l.miktar || '—'}</td><td>${formatZamanTr(l.girisZamani)}</td><td>${l.cikisZamani ? formatZamanTr(l.cikisZamani) : 'İçeride'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const zRows = z.length
    ? `<table><tr><th>Ad Soyad</th><th>Firma</th><th>Görüşülen</th><th>Giriş</th><th>Çıkış</th></tr>${z.map((l) =>
        `<tr><td>${l.adSoyad || '—'}</td><td>${l.firma || '—'}</td><td>${l.ziyaretEdilen || '—'}</td><td>${formatZamanTr(l.girisZamani)}</td><td>${l.cikisZamani ? formatZamanTr(l.cikisZamani) : 'İçeride'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const eRows = e.length
    ? `<table><tr><th>Tür</th><th>Dosya</th><th>Açıklama</th><th>Durum</th><th>Saat</th></tr>${e.map((l) =>
        `<tr><td>${l.evrakTuru || '—'}</td><td>${l.fileName || '—'}</td><td>${l.aciklama || '—'}</td><td>${l.durum || '—'}</td><td>${l.saat || '—'}</td></tr>`
      ).join('')}</table>`
    : '<p style="color:#64748b;font-size:12px">Kayıt yok</p>';

  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const fotoRows = fotos.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">${fotos
        .map((f) => {
          const caption = `${f.kaynakEtiket}${f.aciklama ? ` — ${f.aciklama}` : ''}`;
          const body = isNobetImageUrl(f.fotoUrl, f.fileName)
            ? `<img src="${f.fotoUrl}" alt="${esc(f.fileName || 'Fotoğraf')}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;display:block"/>`
            : `<div style="height:140px;border:1px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b;padding:8px;text-align:center">${esc(f.fileName || 'Belge')}</div>`;
          return `<figure style="margin:0"><div>${body}</div><figcaption style="font-size:10px;color:#475569;margin-top:6px;line-height:1.35">${esc(caption)}<br/><span style="color:#94a3b8">${esc(f.fileName || '')}</span></figcaption></figure>`;
        })
        .join('')}</div>`
    : '<p style="color:#64748b;font-size:12px">Bu nöbet gününde yüklenmiş fotoğraf yok</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Güvenlik Nöbet Raporu ${tarihLabel}</title>
  <style>body{font-family:system-ui,sans-serif;color:#1e293b;padding:32px;max-width:960px;margin:0 auto}
  h1{font-size:22px;margin:0}.meta{color:#64748b;font-size:13px;margin:8px 0 20px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
  th{background:#f1f5f9;text-align:left;padding:6px;border-bottom:2px solid #cbd5e1}
  td{padding:6px;border-bottom:1px solid #e2e8f0}
  .ozet{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:20px}
  .ozet div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center;font-size:11px}
  .ozet strong{display:block;font-size:18px}
  .note{background:#ecfdf5;border:1px solid #a7f3d0;padding:10px;border-radius:10px;font-size:12px;margin-bottom:16px;color:#065f46}</style></head><body>
  <h1>🚧 Güvenlik Nöbet Raporu</h1>
  <p class="meta">Kibritçi İnşaat · ${tarihLabel} · ${vardiyaLabel}<br/>Arşivleyen: ${archive.kaydeden || '—'} · ${formatZamanTr(archive.kayitZamani)}</p>
  <p class="note">Bu rapor günlük logların arşiv kopyasıdır. Canlı giriş-çıkış kayıtları silinmez; sekmelerden tarihe göre yeniden görüntülenebilir.</p>
  ${archive.notlar ? `<p style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:10px;font-size:12px"><strong>Devir Notu:</strong> ${archive.notlar}</p>` : ''}
  <div class="ozet">
    <div><strong>${p.length}</strong>Personel</div>
    <div><strong>${a.length}</strong>Araç</div>
    <div><strong>${st.length}</strong>Su Tankeri</div>
    <div><strong>${vd.length}</strong>Vidanjör</div>
    <div><strong>${pt.length}</strong>Petrol</div>
    <div><strong>${ms.length}</strong>Mıcır</div>
    <div><strong>${z.length}</strong>Ziyaretçi</div>
    <div><strong>${e.length}</strong>Evrak</div>
    <div><strong>${fotos.length}</strong>Fotoğraf</div>
  </div>
  ${section('Personel Kapı Logları', personelRows)}
  ${section('Araç Giriş-Çıkış', aracRows)}
  ${section('Su Tankeri Logları', stRows)}
  ${section('Vidanjör Logları', vdRows)}
  ${section('Petrol Tankeri Logları', ptRows)}
  ${section('Mıcır &amp; Stabilize Kamyon Takip', msRows)}
  ${section('Ziyaretçi Defteri', zRows)}
  ${section('Evrak Girişleri', eRows)}
  ${section(`Yüklenen Fotoğraflar (${fotos.length})`, fotoRows)}
  </body></html>`;
}

/** Ana firma (Kibritçi) vs taşeron görsel ayrımı */
export function isAnaFirmaPersonel(p?: Personel): boolean {
  if (!p) return true;
  return !isTaseronPersonel(p);
}

export function firmaEtiketi(p: Personel): string {
  if (isTaseronPersonel(p)) {
    return (p.firmaAdi || 'Taşeron').trim() || 'Taşeron';
  }
  return (p.firmaAdi || 'Kibritçi İnşaat').trim() || 'Kibritçi İnşaat';
}

/** Akvizyon taşeron firması (isim eşleşmesi) */
export function isAkvizyonFirmaAdi(name?: string | null): boolean {
  const n = String(name || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();
  return n.includes('AKVIZYON');
}

export function isAkvizyonPersonel(p?: Personel): boolean {
  if (!p) return false;
  if (!isTaseronPersonel(p)) return false;
  return isAkvizyonFirmaAdi(p.firmaAdi);
}

export const AKVIZYON_GOREV = 'GÜVENLİK';

/** Akvizyon güvenlik firması — görev her zaman GÜVENLİK olmalı */
export function resolveAkvizyonGorev(firmaAdi?: string | null, currentGorev?: string | null): string {
  if (isAkvizyonFirmaAdi(firmaAdi)) return AKVIZYON_GOREV;
  return String(currentGorev || '').trim() || 'DÜZ İŞÇİ';
}

/** Kadro görevi (nitelik hariç) — puantaj / USTA grubu bununla hesaplanır */
export function kadroPersonelGorev(p?: Personel): string {
  if (!p) return '—';
  return normalizeGorev(resolveAkvizyonGorev(p.firmaAdi, p.gorev));
}

export function displayPersonelNitelik(p?: Personel): string {
  return String(p?.nitelik || '').trim();
}

export function displayPersonelGorev(p?: Personel): string {
  if (!p) return '—';
  const gorev = kadroPersonelGorev(p);
  const nitelik = displayPersonelNitelik(p);
  if (!nitelik) return gorev || '—';
  const n = nitelik.toLocaleUpperCase('tr-TR');
  if (!n || n === gorev.toLocaleUpperCase('tr-TR')) return gorev || '—';
  return `${gorev} · ${n}`;
}

/** Personel araması: DURUKHAN / DURUKAN yazım farkı + görev/nitelik */
export function personelMatchesTextSearch(
  p: Pick<Personel, 'ad' | 'soyad' | 'tcNo' | 'gorev' | 'nitelik' | 'firmaAdi'>,
  term: string
): boolean {
  const q = term.trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  const digitsTerm = q.replace(/\D/g, '');
  const tcDigits = String(p.tcNo || '').replace(/\D/g, '');
  if (digitsTerm.length >= 5 && tcDigits.includes(digitsTerm)) return true;
  const hay = [
    `${p.ad || ''} ${p.soyad || ''}`,
    p.tcNo || '',
    displayPersonelGorev(p as Personel),
    p.nitelik || '',
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  if (hay.includes(q)) return true;
  const expanded = hay.replace(/durukhan/g, 'durukhan durukan').replace(/durukan/g, 'durukan durukhan');
  return expanded.includes(q);
}

/** YYYY-MM-DD için işe giriş / işten çıkış penceresi */
export function isPersonelActiveOnDate(p: Personel, dateStr: string): boolean {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return true;
  const [y, m, d] = parts;
  return isDayActiveForPersonel(p, y, m, d);
}

/** Güvenlik / Kurucu / Yönetici — Akvizyon yoklaması alabilir */
export function canTakeAkvizyonYoklama(yetki?: string | null, email?: string | null): boolean {
  const y = String(yetki || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (y === 'GÜVENLİK' || y === 'YÖNETİCİ') return true;
  if (isFounderEmail(email)) return true;
  return false;
}

/** Kapı ekranı erişimi: Güvenlik, Yönetici, Kurucu */
export function canAccessGuvenlikScreen(yetki?: string | null, email?: string | null): boolean {
  if (!yetki) return true;
  return canTakeAkvizyonYoklama(yetki, email);
}

export type AkvizyonYoklamaDurum = 'VAR' | 'YOK' | 'İZİN' | 'RAPOR';

export function formatZamanTr(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return String(iso);
  }
}

export function buildZiyaretciWhatsAppText(z: {
  adSoyad?: string;
  firma?: string;
  ziyaretSebebi?: string;
  ziyaretEdilen?: string;
  kartNo?: string;
  girisZamani?: string;
  cikisZamani?: string;
  durum?: string;
  tcNo?: string;
}): string {
  const lines = [
    '🎫 *KİBRİTÇİ İNŞAAT — Ziyaretçi Giriş Kaydı*',
    '',
    `Kart: ${z.kartNo || '—'}`,
    `Ad Soyad: ${z.adSoyad || '—'}`,
    `Firma: ${z.firma || '—'}`,
    `Görüşülen: ${z.ziyaretEdilen || '—'}`,
    `Neden: ${z.ziyaretSebebi || '—'}`,
    `Durum: ${z.durum || '—'}`,
    `Giriş: ${formatZamanTr(z.girisZamani)}`,
  ];
  if (z.cikisZamani) lines.push(`Çıkış: ${formatZamanTr(z.cikisZamani)}`);
  lines.push('', '_Şantiye Güvenlik Kapısı_');
  return lines.join('\n');
}

export function buildPersonelLoglariWhatsAppText(
  logs: Array<{
    ad?: string;
    soyad?: string;
    gorev?: string;
    tip?: string;
    zaman?: string;
    firmaAdi?: string;
    firmaTipi?: string;
  }>,
  tarih?: string
): string {
  const header = [
    '👥 *KİBRİTÇİ İNŞAAT — Personel Kapı Logları*',
    tarih ? `Tarih: ${tarih}` : '',
    `Seçili kayıt: ${logs.length}`,
    '',
  ].filter(Boolean);

  const body = logs.map((l, i) => {
    const firma =
      l.firmaTipi === 'TASERON'
        ? ` [Taşeron: ${l.firmaAdi || '—'}]`
        : l.firmaAdi
          ? ` [${l.firmaAdi}]`
          : '';
    return `${i + 1}. ${l.ad || ''} ${l.soyad || ''}${firma}\n   ${l.tip || '—'} · ${formatZamanTr(l.zaman)}\n   ${l.gorev || ''}`;
  });

  return [...header, ...body, '', '_Şantiye Güvenlik Kapısı_'].join('\n');
}

/** Kamp/kayıt hatası — otomatik personel oluşturmayı engelle */
export function isPlaceholderPersonelName(name?: string | null): boolean {
  const n = String(name || '').toLocaleUpperCase('tr-TR');
  return (
    n.includes('SOYADI?') ||
    n.includes('(SOYADI') ||
    n.includes('SOYAD?') ||
    /\(\?+\)/.test(n)
  );
}

export function personelNameKey(p?: { ad?: string; soyad?: string } | null): string {
  return `${p?.ad || ''} ${p?.soyad || ''}`.trim().toLocaleLowerCase('tr-TR');
}

export function buildSuTankeriLoglariWhatsAppText(
  logs: Array<{
    plaka?: string;
    firma?: string;
    surucuAdi?: string;
    miktar?: string;
    aciklama?: string;
    durum?: string;
    girisZamani?: string;
    cikisZamani?: string;
  }>,
  tarih?: string
): string {
  const header = [
    '💧 *KİBRİTÇİ İNŞAAT — Su Tankeri Giriş/Çıkış Logları*',
    tarih ? `Tarih: ${tarih}` : '',
    `Sefer sayısı: ${logs.length}`,
    '',
  ].filter(Boolean);

  const body = logs.map((l, i) => {
    const lines = [
      `${i + 1}. ${l.plaka || '—'} · ${l.firma || '—'}`,
      `   Sürücü: ${l.surucuAdi || '—'} · Miktar: ${l.miktar || '—'}`,
      `   Durum: ${l.durum || '—'}`,
      `   Giriş: ${formatZamanTr(l.girisZamani)}`,
    ];
    if (l.cikisZamani) lines.push(`   Çıkış: ${formatZamanTr(l.cikisZamani)}`);
    if (l.aciklama) lines.push(`   Not: ${l.aciklama}`);
    return lines.join('\n');
  });

  return [...header, ...body, '', '_Şantiye Güvenlik Kapısı_'].join('\n');
}

export function buildAracLoglariWhatsAppText(
  logs: Array<{
    plaka?: string;
    aracTipi?: string;
    firma?: string;
    surucuAdi?: string;
    yukDurumu?: string;
    aciklama?: string;
    durum?: string;
    girisZamani?: string;
    cikisZamani?: string;
  }>,
  tarih?: string
): string {
  const header = [
    '🚛 *KİBRİTÇİ İNŞAAT — Araç Giriş/Çıkış Logları*',
    tarih ? `Tarih: ${tarih}` : '',
    `Seçili kayıt: ${logs.length}`,
    '',
  ].filter(Boolean);

  const body = logs.map((l, i) => {
    const lines = [
      `${i + 1}. ${l.plaka || '—'} · ${l.aracTipi || ''}`,
      `   Firma: ${l.firma || '—'} · Durum: ${l.durum || '—'}`,
      `   Sürücü: ${l.surucuAdi || '—'} · Yük: ${l.yukDurumu || '—'}`,
      `   Giriş: ${formatZamanTr(l.girisZamani)}`,
    ];
    if (l.cikisZamani) lines.push(`   Çıkış: ${formatZamanTr(l.cikisZamani)}`);
    if (l.aciklama) lines.push(`   Not: ${l.aciklama}`);
    return lines.join('\n');
  });

  return [...header, ...body, '', '_Şantiye Güvenlik Kapısı_'].join('\n');
}

export function openWhatsAppText(text: string): void {
  window.open(buildWhatsAppUrl(text), '_blank');
}

export function buildAkvizyonYoklamaReportHtml(
  tarih: string,
  rows: Array<{ ad: string; soyad: string; gorev: string; durum: string }>
): string {
  const dateFormatted = new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const varCount = rows.filter((r) => r.durum === 'VAR').length;
  const yokCount = rows.filter((r) => r.durum === 'YOK').length;
  const otherCount = rows.length - varCount - yokCount;

  const trs = rows
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.ad} ${r.soyad}</strong></td>
        <td>${r.gorev || '—'}</td>
        <td style="font-weight:800;color:${r.durum === 'VAR' ? '#059669' : r.durum === 'YOK' ? '#e11d48' : '#64748b'}">${r.durum}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Akvizyon Yoklama — ${dateFormatted}</title>
  <style>
    body{font-family:system-ui,sans-serif;color:#1e293b;padding:32px;max-width:900px;margin:0 auto}
    h1{font-size:20px;margin:0} .meta{color:#64748b;font-size:13px;margin:8px 0 24px}
    .badge{display:inline-block;background:#f59e0b;color:#0f172a;font-weight:800;font-size:11px;padding:4px 10px;border-radius:999px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f1f5f9;text-align:left;padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px}
    td{padding:8px;border-bottom:1px solid #e2e8f0}
    .ozet{display:flex;gap:12px;margin-bottom:20px}
    .ozet div{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}
    .ozet strong{display:block;font-size:22px}
  </style></head><body>
  <span class="badge">TAŞERON · AKVİZYON</span>
  <h1>Günlük Personel Yoklama Raporu</h1>
  <p class="meta">Kibritçi İnşaat Şantiyesi · ${dateFormatted} · Ana firma puantajından bağımsızdır</p>
  <div class="ozet">
    <div><strong>${rows.length}</strong>Toplam</div>
    <div><strong style="color:#059669">${varCount}</strong>Var</div>
    <div><strong style="color:#e11d48">${yokCount}</strong>Yok</div>
    <div><strong>${otherCount}</strong>Diğer</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Ad Soyad</th><th>Görev</th><th>Durum</th></tr></thead>
    <tbody>${trs || '<tr><td colspan="4">Kayıt yok</td></tr>'}</tbody>
  </table>
  <p class="meta" style="margin-top:28px">Bu rapor yalnızca Akvizyon taşeron firması günlük takip içindir. Kibritçi İnşaat yoklama/puantajına dahil edilmez.</p>
  </body></html>`;
}
