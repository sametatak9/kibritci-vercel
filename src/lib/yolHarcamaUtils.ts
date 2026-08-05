/** Şoför yol / masraf fişi yardımcıları — onay sonrası Haftalık Kasa çıkışı */
import { doc, getDoc, arrayUnion, updateDoc } from 'firebase/firestore';
import { KasaHareketi, KasaOdemeDurumu, SoforMasrafTipi, YolHarcamasi } from '../types/erp';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import { formatDateLabelTr, normalizeDateKey, todayDateKey } from './dateKeyUtils';
import { db, saveDocument } from './firebase';
import {
  getReportEmailToolbarHtml,
  htmlToPlainText,
  openHtmlReportWindow,
  openReportEmailComposer,
} from './reportEmail';

/** Merkez muhasebe / yönetim alıcısı (şoför masraf & kasa harcama raporları) */
export const MERKEZ_KASA_EMAIL = 'yonetim@kibritci.com';

export function normalizeSoforMasrafTipi(
  value?: string | null
): SoforMasrafTipi {
  const v = String(value || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (v === 'KASA' || v.includes('KASA')) return 'KASA';
  return 'KENDI';
}

export function resolveNihaiMasrafTipi(
  item?: Pick<YolHarcamasi, 'masrafTipi' | 'nihaiMasrafTipi'> | null
): SoforMasrafTipi {
  if (item?.nihaiMasrafTipi) return normalizeSoforMasrafTipi(item.nihaiMasrafTipi);
  if (item?.masrafTipi) return normalizeSoforMasrafTipi(item.masrafTipi);
  return 'KENDI';
}

export function soforMasrafTipiLabel(tip?: SoforMasrafTipi | string | null): string {
  return normalizeSoforMasrafTipi(tip) === 'KASA'
    ? 'Kasa harcaması'
    : 'Şoför kendi harcaması';
}

/** Şoför kaynaklı herhangi bir kasa satırı (iade veya kasa gideri) */
export function isSoforKaynakliKasaHareketi(
  k?: Pick<KasaHareketi, 'id' | 'soforOdemesi' | 'soforKasaHarcamasi' | 'masrafTipi'> | null
): boolean {
  if (!k) return false;
  return (
    Boolean(k.soforOdemesi) ||
    Boolean(k.soforKasaHarcamasi) ||
    String(k.id || '').startsWith('kh_yol_')
  );
}

/** @deprecated — isSoforKaynakliKasaHareketi kullanın; eski ad iade+kasa karışıyordu */
export function isSoforKasaHareketi(
  k?: Pick<KasaHareketi, 'id' | 'soforOdemesi' | 'soforKasaHarcamasi' | 'masrafTipi'> | null
): boolean {
  return isSoforKaynakliKasaHareketi(k);
}

/**
 * Yönetici / kayıt ödeme durumu — kasaya yazılan her çıkış için.
 * BORC = kasanın ödemesi gereken borç (personel/şoföre).
 */
export function resolveKasaOdemeDurumu(
  k?: Pick<
    KasaHareketi,
    | 'hareketTipi'
    | 'odemeDurumu'
    | 'harcamaKaynagi'
    | 'soforOdemesi'
    | 'soforKasaHarcamasi'
    | 'masrafTipi'
    | 'id'
  > | null
): KasaOdemeDurumu | null {
  if (!k || k.hareketTipi === 'GİRİŞ') return null;
  if (k.odemeDurumu === 'BORC' || k.odemeDurumu === 'PERSONEL_ODEDI' || k.odemeDurumu === 'KASA_ODEDI') {
    return k.odemeDurumu;
  }

  // Şoför kaynaklı: masraf tipi / bayraklar, harcamaKaynagi'nden önce (eski karışık kayıtlar)
  if (isSoforKaynakliKasaHareketi(k)) {
    if (k.soforKasaHarcamasi || normalizeSoforMasrafTipi(k.masrafTipi) === 'KASA') {
      return 'KASA_ODEDI';
    }
    if (k.soforOdemesi || String(k.id || '').startsWith('kh_yol_')) return 'BORC';
  }

  if (k.harcamaKaynagi === 'KASA_HARCAMA') return 'KASA_ODEDI';
  if (k.harcamaKaynagi === 'PERSONEL_HARCAMA') return 'PERSONEL_ODEDI';

  if (normalizeSoforMasrafTipi(k.masrafTipi) === 'KASA') return 'KASA_ODEDI';
  if (k.hareketTipi === 'ÇIKIŞ') return 'KASA_ODEDI';
  return null;
}

export function kasaOdemeDurumuLabel(d?: KasaOdemeDurumu | null): string {
  if (d === 'BORC') return 'BORÇ';
  if (d === 'PERSONEL_ODEDI') return 'PERSONEL ÖDEDİ';
  if (d === 'KASA_ODEDI') return 'KASA ÖDEDİ';
  return '';
}

/**
 * Rapor / eski KASA|KENDI ayrımı.
 * KASA_ODEDI → KASA; BORC ve PERSONEL_ODEDI → KENDI (şoför/personel tarafı).
 */
export function resolveKasaRaporMasrafTipi(
  k?: Pick<
    KasaHareketi,
    | 'hareketTipi'
    | 'odemeDurumu'
    | 'harcamaKaynagi'
    | 'soforOdemesi'
    | 'soforKasaHarcamasi'
    | 'masrafTipi'
    | 'id'
  > | null
): SoforMasrafTipi | null {
  const d = resolveKasaOdemeDurumu(k);
  if (d === 'KASA_ODEDI') return 'KASA';
  if (d === 'BORC' || d === 'PERSONEL_ODEDI') return 'KENDI';
  return null;
}

/** Şoföre iade / kasa borcu — yönetici KASA veya Personel ödedi ise false */
export function isSoforIadeKasaHareketi(k?: KasaHareketi | null): boolean {
  if (!k || !isSoforKaynakliKasaHareketi(k)) return false;
  const d = resolveKasaOdemeDurumu(k);
  if (d === 'KASA_ODEDI' || d === 'PERSONEL_ODEDI') return false;
  if (d === 'BORC') return true;
  if (k.soforKasaHarcamasi) return false;
  if (normalizeSoforMasrafTipi(k.masrafTipi) === 'KASA') return false;
  return Boolean(k.soforOdemesi) || String(k.id || '').startsWith('kh_yol_');
}

/** Şirket kasasından ödenen (şoför üzerinden veya yönetici KASA ÖDEDİ) */
export function isSoforUzerindenKasaGideri(k?: KasaHareketi | null): boolean {
  if (!k || !isSoforKaynakliKasaHareketi(k)) return false;
  return resolveKasaOdemeDurumu(k) === 'KASA_ODEDI';
}

export function yolHarcamaKasaDocId(yolHarcamaId: string): string {
  return `kh_yol_${String(yolHarcamaId || '').trim()}`;
}

/** Şoför fişini eşleşen personel kartının geçmişine yazar */
export async function appendSoforFisToPersonelGecmis(options: {
  personelId: string;
  yolHarcamaId: string;
  tarih: string;
  tutar: number;
  fisNo?: string;
  aciklama?: string;
  masrafTipi?: string;
  durum?: string;
}): Promise<void> {
  const { personelId, yolHarcamaId, tarih, tutar, fisNo, aciklama, masrafTipi, durum } =
    options;
  if (!personelId) return;
  const tipLabel =
    String(masrafTipi || '').toUpperCase() === 'KASA' ? 'Kasa harcaması' : 'Kendi / borç';
  const entry = {
    id: `sofor_fis_${yolHarcamaId}`,
    tarih: `${tarih} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
    islem: 'Şoför Yol Harcaması / Fiş',
    detay: `${durum || 'KAYIT'} · ${tipLabel} · ${Number(tutar).toLocaleString('tr-TR')} ₺ · Fiş: ${fisNo || '—'} · ${String(aciklama || '').slice(0, 120)}`,
    kaynak: 'SOFOR_MOBIL',
    yolHarcamaId,
  };
  try {
    await updateDoc(doc(db, 'personeller', personelId), {
      gecmis: arrayUnion(entry),
    });
  } catch (err) {
    console.warn('[sofor-fis] personel geçmişi yazılamadı:', personelId, err);
  }
}

/** Onaylanan şoför fişinden Haftalık Kasa ÇIKIŞ kaydı */
export function buildYolHarcamaKasaCikisPayload(
  item: Pick<
    YolHarcamasi,
    | 'id'
    | 'tarih'
    | 'tutar'
    | 'aciklama'
    | 'fisNo'
    | 'faturaFotoUrl'
    | 'surucu'
    | 'masrafTipi'
    | 'nihaiMasrafTipi'
    | 'personelId'
    | 'personelAdi'
  >,
  nihaiOverride?: SoforMasrafTipi
): KasaHareketi {
  const tip = nihaiOverride
    ? normalizeSoforMasrafTipi(nihaiOverride)
    : resolveNihaiMasrafTipi(item);
  const id = yolHarcamaKasaDocId(item.id);
  const tarih =
    normalizeDateKey(item.tarih) ||
    String(item.tarih || '').slice(0, 10) ||
    todayDateKey();
  const surucu = String(item.surucu || '').trim() || 'Bilinmeyen';
  let personelAdi =
    String(item.personelAdi || '').trim() || (tip === 'KENDI' ? surucu : '');
  // Portal e-postası unvan olarak kalmasın
  if (personelAdi.toLocaleLowerCase('tr-TR') === 'celal@kibritciinsaat.com') {
    personelAdi = 'CELAL YILMAZ';
  }
  if (!personelAdi && surucu.toLocaleLowerCase('tr-TR') === 'celal@kibritciinsaat.com') {
    personelAdi = 'CELAL YILMAZ';
  }
  const fisNo = String(item.fisNo || '').trim();
  const aciklamaExtra = String(item.aciklama || '').trim();
  const isKendi = tip === 'KENDI';

  const payload: KasaHareketi = {
    id,
    tarih,
    hareketTipi: 'ÇIKIŞ',
    tutar: Math.abs(parseFloat(String(item.tutar)) || 0),
    aciklama: isKendi
      ? `Şoför kendi harcaması — kasa borcu / iade (Fiş: ${fisNo || '—'} · ${surucu})${
          aciklamaExtra ? ` — ${aciklamaExtra}` : ''
        }`
      : `Şoför üzerinden KASA harcaması (Fiş: ${fisNo || '—'} · ${surucu})${
          aciklamaExtra ? ` — ${aciklamaExtra}` : ''
        }`,
    referansTipi: 'DİĞER',
    referansId: item.id,
    fisEvrakUrl: item.faturaFotoUrl || '',
    soforOdemesi: isKendi,
    soforKasaHarcamasi: !isKendi,
    masrafTipi: tip,
    odemeDurumu: isKendi ? 'BORC' : 'KASA_ODEDI',
    harcamaKaynagi: isKendi ? 'PERSONEL_HARCAMA' : 'KASA_HARCAMA',
    surucu,
    fisNo,
  };
  if (item.personelId) {
    payload.personelId = item.personelId;
  }
  if (personelAdi) {
    payload.personelAdi = personelAdi;
  }
  return payload;
}

/** Onaylı şoför fişlerini Haftalık Kasa'ya yazar; mevcut kayıtları yol fişiyle hizalar */
export async function syncApprovedYolHarcamalariToKasa(
  yolHarcamalari: Array<
    Pick<
      YolHarcamasi,
      | 'id'
      | 'tarih'
      | 'tutar'
      | 'aciklama'
      | 'fisNo'
      | 'faturaFotoUrl'
      | 'surucu'
      | 'masrafTipi'
      | 'nihaiMasrafTipi'
      | 'durum'
      | 'personelId'
      | 'personelAdi'
    >
  >,
  options?: {
    /** true ise PERSONEL_ODEDI dahil tüm alanları nihai masraf tipine göre yeniden yazar */
    forceFromNihai?: boolean;
  }
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const forceFromNihai = Boolean(options?.forceFromNihai);

  const approved = (yolHarcamalari || []).filter((y) => {
    const d = String(y.durum || '').toLocaleUpperCase('tr-TR');
    return d.includes('ONAYLANDI') && !d.includes('RED');
  });

  for (const item of approved) {
    if (!item?.id) continue;
    const kasaId = yolHarcamaKasaDocId(item.id);
    try {
      const payload = buildYolHarcamaKasaCikisPayload(item);
      if (!payload.tutar || payload.tutar <= 0) {
        errors.push(`${item.id}: tutar geçersiz`);
        continue;
      }

      const existing = await getDoc(doc(db, 'kasaHareketleri', kasaId));
      if (!existing.exists()) {
        await saveDocument('kasaHareketleri', payload);
        created += 1;
        continue;
      }

      const prev = existing.data() as Partial<KasaHareketi>;
      const prevOdeme = resolveKasaOdemeDurumu(prev as KasaHareketi);

      // Manuel PERSONEL_ODEDI seçimini koru (force değilse) — tutar/personel/masraf yine hizalanır
      const keepPersonelOdedi =
        !forceFromNihai && prevOdeme === 'PERSONEL_ODEDI';

      const next: KasaHareketi = {
        ...payload,
        id: kasaId,
        fisEvrakUrl: payload.fisEvrakUrl || prev.fisEvrakUrl || '',
      };
      if (keepPersonelOdedi) {
        next.odemeDurumu = 'PERSONEL_ODEDI';
        next.harcamaKaynagi = 'PERSONEL_HARCAMA';
        // Masraf tipi yol nihai ile kalsın; ödeme durumu personel ödedi olarak işaretli
      }

      const changed =
        Number(prev.tutar) !== Number(next.tutar) ||
        String(prev.tarih || '') !== String(next.tarih || '') ||
        String(prev.odemeDurumu || '') !== String(next.odemeDurumu || '') ||
        String(prev.masrafTipi || '') !== String(next.masrafTipi || '') ||
        Boolean(prev.soforOdemesi) !== Boolean(next.soforOdemesi) ||
        Boolean(prev.soforKasaHarcamasi) !== Boolean(next.soforKasaHarcamasi) ||
        String(prev.personelAdi || '') !== String(next.personelAdi || '') ||
        String(prev.personelId || '') !== String(next.personelId || '') ||
        String(prev.aciklama || '') !== String(next.aciklama || '');

      if (!changed) {
        skipped += 1;
        continue;
      }

      await saveDocument('kasaHareketleri', next);
      updated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${item.fisNo || item.id}: ${msg}`);
    }
  }

  return { created, updated, skipped, errors };
}

export function filterYolHarcamalariByRange(
  items: YolHarcamasi[],
  startDate: string,
  endDate: string,
  surucu?: string
): YolHarcamasi[] {
  const a = normalizeDateKey(startDate) || startDate;
  const b = normalizeDateKey(endDate) || endDate;
  const driver = String(surucu || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return (items || [])
    .filter((x) => {
      const t = normalizeDateKey(x.tarih) || x.tarih;
      if (t < a || t > b) return false;
      if (driver) {
        return String(x.surucu || '')
          .trim()
          .toLocaleLowerCase('tr-TR')
          .includes(driver);
      }
      return true;
    })
    .sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
}

export function filterSoforKasaHareketleri(
  items: KasaHareketi[],
  startDate: string,
  endDate: string,
  surucu?: string,
  onlyTip?: SoforMasrafTipi
): KasaHareketi[] {
  const a = normalizeDateKey(startDate) || startDate;
  const b = normalizeDateKey(endDate) || endDate;
  const driver = String(surucu || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return (items || [])
    .filter((x) => {
      if (!isSoforKaynakliKasaHareketi(x)) return false;
      if (onlyTip === 'KENDI' && !isSoforIadeKasaHareketi(x)) return false;
      if (onlyTip === 'KASA' && !isSoforUzerindenKasaGideri(x)) return false;
      const t = normalizeDateKey(x.tarih) || x.tarih;
      if (t < a || t > b) return false;
      if (driver) {
        return String(x.surucu || '')
          .trim()
          .toLocaleLowerCase('tr-TR')
          .includes(driver);
      }
      return true;
    })
    .sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
}

/** Seçili aralıktaki tüm kasa çıkışları (şoför + diğer harcamalar) */
export function filterKasaCikisHareketleri(
  items: KasaHareketi[],
  startDate: string,
  endDate: string
): KasaHareketi[] {
  const a = normalizeDateKey(startDate) || startDate;
  const b = normalizeDateKey(endDate) || endDate;
  return (items || [])
    .filter((x) => {
      if (x.hareketTipi !== 'ÇIKIŞ') return false;
      const t = normalizeDateKey(x.tarih) || x.tarih;
      return t >= a && t <= b;
    })
    .sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type RaporKalem = {
  id: string;
  tarih: string;
  fisNo?: string;
  aciklama: string;
  tutar: number;
  surucu?: string;
  fotoUrl?: string;
  tipEtiket?: string;
  masrafTipi?: SoforMasrafTipi | string;
  odemeDurumu?: KasaOdemeDurumu | null;
};

function raporKalemOdemeDurumu(r: RaporKalem): KasaOdemeDurumu {
  if (r.odemeDurumu === 'BORC' || r.odemeDurumu === 'PERSONEL_ODEDI' || r.odemeDurumu === 'KASA_ODEDI') {
    return r.odemeDurumu;
  }
  return normalizeSoforMasrafTipi(r.masrafTipi) === 'KASA' ? 'KASA_ODEDI' : 'BORC';
}

function buildMasrafTableHtml(rows: RaporKalem[], toplam: number): string {
  const tableRows = rows
    .map(
      (r, i) => {
        const durum = raporKalemOdemeDurumu(r);
        const tipColor =
          durum === 'KASA_ODEDI' ? '#1d4ed8' : durum === 'BORC' ? '#b45309' : '#6d28d9';
        return `<tr>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-family:ui-monospace,monospace">${escapeHtml(r.tarih)}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:700">${escapeHtml(r.fisNo || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:10px;font-weight:800;color:${tipColor}">${escapeHtml(kasaOdemeDurumuLabel(durum))}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${escapeHtml(r.tipEtiket || '')}${escapeHtml(r.aciklama || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${escapeHtml(r.surucu || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:800;color:#b91c1c">−${Number(r.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
    </tr>`;
      }
    )
    .join('');

  const borcToplam = rows
    .filter((r) => raporKalemOdemeDurumu(r) === 'BORC')
    .reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const personelToplam = rows
    .filter((r) => raporKalemOdemeDurumu(r) === 'PERSONEL_ODEDI')
    .reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const kasaToplam = rows
    .filter((r) => raporKalemOdemeDurumu(r) === 'KASA_ODEDI')
    .reduce((s, r) => s + (Number(r.tutar) || 0), 0);

  return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:7px;border:1px solid #1e3a5f">#</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Tarih</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Fiş No</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Ödeme durumu</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Açıklama</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Şoför / Personel</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:right">Çıkış (−)</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="7" style="padding:12px;text-align:center;color:#94a3b8">Kayıt yok</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background:#fffbeb;font-weight:700">
          <td colspan="6" style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right">BORÇ</td>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;color:#b45309">−${borcToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
        </tr>
        <tr style="background:#f5f3ff;font-weight:700">
          <td colspan="6" style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right">PERSONEL ÖDEDİ</td>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;color:#6d28d9">−${personelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
        </tr>
        <tr style="background:#eff6ff;font-weight:700">
          <td colspan="6" style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right">KASA ÖDEDİ</td>
          <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;color:#1d4ed8">−${kasaToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
        </tr>
        <tr style="background:#f1f5f9;font-weight:800">
          <td colspan="6" style="padding:8px;border:1px solid #cbd5e1;text-align:right">TOPLAM (3’ü)</td>
          <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#b91c1c">−${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
        </tr>
      </tfoot>
    </table>`;
}

function buildFotoGridHtml(rows: RaporKalem[]): string {
  const photos = rows
    .filter((r) => r.fotoUrl)
    .map(
      (r) => `<figure style="margin:0;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;page-break-inside:avoid">
      <div style="padding:6px 8px;background:#f1f5f9;font-size:10px;font-weight:700;color:#334155">
        ${escapeHtml(r.fisNo || r.id)} · ${escapeHtml(r.tarih)} · −${Number(r.tutar || 0).toLocaleString('tr-TR')} ₺
      </div>
      <img src="${escapeHtml(r.fotoUrl!)}" alt="Fiş" style="display:block;width:100%;max-height:320px;object-fit:contain;background:#f8fafc" />
      <figcaption style="padding:6px 8px;font-size:10px;color:#64748b">${escapeHtml(r.aciklama || '')}</figcaption>
    </figure>`
    )
    .join('');
  return `<h3 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#1e3a5f;margin:0 0 10px">Fiş görselleri (taranmış ek)</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${photos || '<p style="color:#94a3b8;font-style:italic;grid-column:1/-1">Fiş görseli yok</p>'}
    </div>`;
}

/** A4: şoför masraf / iade dökümü */
export function buildSoforMasrafIadeReportHtml(options: {
  startDate: string;
  endDate: string;
  items: RaporKalem[];
  surucuFiltre?: string;
  olusturan?: string;
}): string {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const rows = [...options.items].sort((a, b) => a.tarih.localeCompare(b.tarih));
  const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const title = 'ŞOFÖR MASRAF / KASA AYRIM RAPORU';
  const subtitle = `${start} — ${end}${options.surucuFiltre ? ` · ${options.surucuFiltre}` : ''}`;
  const subject = `Kibritçi — Şoför Masraf Ayrım (${start} / ${end})`;
  const fileName = `Sofor_Masraf_Ayirim_${options.startDate}_${options.endDate}.html`;
  const toolbar = getReportEmailToolbarHtml({ subject, fileName });

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 16px; color: #0f172a; }
    .page { max-width: 210mm; margin: 0 auto; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${toolbar}
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div style="margin:12px 0;padding:10px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:11px;color:#9f1239">
      <p style="margin:2px 0">Kalem: <strong>${rows.length}</strong> · Toplam: <strong>−${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Oluşturan: ${escapeHtml(options.olusturan || '—')} · ${new Date().toLocaleString('tr-TR')}</p>
      <p style="margin:2px 0;font-style:italic">Her çıkışta ödeme durumu: <strong>BORÇ</strong> · <strong>PERSONEL ÖDEDİ</strong> · <strong>KASA ÖDEDİ</strong> (ayrı + toplam).</p>
    </div>
    ${buildMasrafTableHtml(rows, toplam)}
    ${buildFotoGridHtml(rows)}
    <footer style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
      Kibritçi ERP · Şoför masraf ayrımı · Haftalık Kasa
    </footer>
  </div>
</body>
</html>`;
}

/** A4: seçili aralıktaki tüm kasa çıkış / harcama dökümü */
export function buildKasaHarcamaAralikReportHtml(options: {
  startDate: string;
  endDate: string;
  items: KasaHareketi[];
  olusturan?: string;
}): string {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const rows: RaporKalem[] = [...options.items]
    .sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)))
    .map((r) => ({
      id: r.id,
      tarih: r.tarih,
      fisNo: r.fisNo,
      aciklama: r.aciklama,
      tutar: Number(r.tutar) || 0,
      surucu: r.surucu || (isSoforKaynakliKasaHareketi(r) ? 'Şoför' : r.referansTipi),
      fotoUrl: r.fisEvrakUrl,
      tipEtiket: isSoforKaynakliKasaHareketi(r) ? '[Şoför] ' : '',
      masrafTipi: resolveKasaRaporMasrafTipi(r) || r.masrafTipi || 'KASA',
      odemeDurumu: resolveKasaOdemeDurumu(r),
    }));
  const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const soforToplam = options.items
    .filter((x) => isSoforKaynakliKasaHareketi(x))
    .reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const title = 'KASA HARCAMA (ÇIKIŞ) RAPORU';
  const subtitle = `${start} — ${end}`;
  const subject = `Kibritçi — Kasa Harcama Raporu (${start} / ${end})`;
  const fileName = `Kasa_Harcama_${options.startDate}_${options.endDate}.html`;
  const toolbar = getReportEmailToolbarHtml({ subject, fileName });

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 16px; color: #0f172a; }
    .page { max-width: 210mm; margin: 0 auto; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${toolbar}
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div style="margin:12px 0;padding:10px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:11px;color:#9f1239">
      <p style="margin:2px 0">Çıkış kalemi: <strong>${rows.length}</strong> · Toplam: <strong>−${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Şoför fişleri payı: <strong>−${soforToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Oluşturan: ${escapeHtml(options.olusturan || '—')} · ${new Date().toLocaleString('tr-TR')}</p>
    </div>
    ${buildMasrafTableHtml(rows, toplam)}
    ${buildFotoGridHtml(rows)}
    <footer style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
      Kibritçi ERP · Haftalık Kasa · Aralık harcama dökümü
    </footer>
  </div>
</body>
</html>`;
}

/** Düz metin kasa dökümü — e-posta gövdesi için */
export function buildKasaCikisMailPlainText(
  items: KasaHareketi[],
  startDate: string,
  endDate: string
): string {
  const start = formatDateLabelTr(normalizeDateKey(startDate) || startDate);
  const end = formatDateLabelTr(normalizeDateKey(endDate) || endDate);
  const rows = [...(items || [])].sort((a, b) =>
    String(a.tarih).localeCompare(String(b.tarih))
  );

  let borc = 0;
  let personel = 0;
  let kasa = 0;
  const lines: string[] = [
    'KASA HARCAMA / ÇIKIŞ DÖKÜMÜ',
    `Tarih aralığı: ${start} — ${end}`,
    `Kalem: ${rows.length}`,
    '',
  ];

  rows.forEach((r, i) => {
    const durum = resolveKasaOdemeDurumu(r) || 'KASA_ODEDI';
    const tutar = Number(r.tutar) || 0;
    if (durum === 'BORC') borc += tutar;
    else if (durum === 'PERSONEL_ODEDI') personel += tutar;
    else kasa += tutar;

    const who = String(r.personelAdi || r.surucu || '—').trim();
    const aciklama = String(r.aciklama || '—').replace(/\s+/g, ' ').trim();
    lines.push(
      `${i + 1}) ${r.tarih} · ${kasaOdemeDurumuLabel(durum)} · −${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
    );
    lines.push(`   ${aciklama.slice(0, 160)}${aciklama.length > 160 ? '…' : ''}`);
    lines.push(
      `   ${who}${r.fisNo ? ` · Fiş: ${r.fisNo}` : ''}`
    );
    lines.push('');
  });

  const toplam = borc + personel + kasa;
  lines.push('────────────────────────');
  lines.push(
    `BORÇ: −${borc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
  );
  lines.push(
    `PERSONEL ÖDEDİ: −${personel.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
  );
  lines.push(
    `KASA ÖDEDİ: −${kasa.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
  );
  lines.push(
    `TOPLAM (3’ü): −${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
  );
  return lines.join('\n');
}

export function openSoforMasrafIadeReport(html: string, title: string): void {
  openHtmlReportWindow(html, title);
}

export function emailSoforMasrafIadeReport(options: {
  html: string;
  startDate: string;
  endDate: string;
  toplam?: number;
  items?: KasaHareketi[];
}): void {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const body =
    options.items && options.items.length > 0
      ? buildKasaCikisMailPlainText(options.items, options.startDate, options.endDate)
      : htmlToPlainText(options.html);
  openReportEmailComposer({
    subject: `Kibritçi — Şoför Masraf İade (${start} / ${end})`,
    body,
    html: options.html,
    fileName: `Sofor_Masraf_Iade_${options.startDate}_${options.endDate}.html`,
    defaultTo: MERKEZ_KASA_EMAIL,
  });
}

export function emailKasaHarcamaAralikReport(options: {
  html: string;
  startDate: string;
  endDate: string;
  toplam?: number;
  items?: KasaHareketi[];
}): void {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const body =
    options.items && options.items.length > 0
      ? buildKasaCikisMailPlainText(options.items, options.startDate, options.endDate)
      : htmlToPlainText(options.html);
  openReportEmailComposer({
    subject: `Kibritçi — Kasa Harcama Raporu (${start} / ${end})`,
    body,
    html: options.html,
    fileName: `Kasa_Harcama_${options.startDate}_${options.endDate}.html`,
    defaultTo: MERKEZ_KASA_EMAIL,
  });
}
