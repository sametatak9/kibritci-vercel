import { KampKaydi, Personel } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { canonicalFirmaUnvan, firmaDedupKey, isJunkFirmaAdi } from './firmaCanonicalUtils';
import { isPersonelActiveOnDate } from './guvenlikHelpers';
import { isPersonelAktifDurum } from './kampPlacementUtils';
import { openHtmlReportWindow } from './reportEmail';
import { firmaEslesir } from './taseronUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  findPersonelByName,
  isKibritciCompany,
  isTaseronPersonel,
  normalizeTurkishName,
} from './yoklamaUtils';

export type KampFirmaOzetRow = {
  firma: string;
  /** Aktif kadro (işten çıkmamış personel kartı) */
  toplamCalisan: number;
  /** Aktif kamp konaklama (kişi, mükerrersiz) */
  kampta: number;
  odaSayisi: number;
};

function normalizeFirmaLabel(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || isJunkFirmaAdi(trimmed)) return 'TAŞERON';
  if (isKibritciCompany(trimmed)) return CANONICAL_ANA_FIRMA_ADI;
  const upper = trimmed.toLocaleUpperCase('tr-TR');
  if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') return CANONICAL_ANA_FIRMA_ADI;
  return canonicalFirmaUnvan(trimmed);
}

function normalizeFirmaKey(raw: string, existing: string[]): string {
  const label = normalizeFirmaLabel(raw);
  const dedup = firmaDedupKey(label);
  for (const key of existing) {
    if (firmaDedupKey(key) === dedup) return key;
    if (firmaEslesir(key, label)) return key;
  }
  return label;
}

function resolvePersonelFirma(p: Personel): string {
  if (!isTaseronPersonel(p)) return CANONICAL_ANA_FIRMA_ADI;
  return normalizeFirmaLabel(p.firmaAdi || 'TAŞERON');
}

/**
 * Yerleşim firması: önce kamp kaydındaki firma (yerleşim anı),
 * yoksa bağlı personel kartı. Boş string Kibritçi sayılmaz.
 */
export function resolveKampYerlesimFirma(k: KampKaydi, personeller: Personel[]): string {
  if (k.firmaTipi === 'ANA_FIRMA') return CANONICAL_ANA_FIRMA_ADI;

  const fromKamp = String(k.calistigiFirma || '').trim();
  if (fromKamp && !isJunkFirmaAdi(fromKamp)) {
    if (isKibritciCompany(fromKamp)) return CANONICAL_ANA_FIRMA_ADI;
    return normalizeFirmaLabel(fromKamp);
  }

  const p = k.personelId ? personeller.find((x) => x.id === k.personelId) : undefined;
  if (p) return resolvePersonelFirma(p);

  return 'TAŞERON';
}

/** Tek kişi = personel kartı id veya normalize isim (id/isim çapraz eşleşme). */
export function resolveResidentCanonicalKey(
  k: KampKaydi,
  personeller: Personel[] = []
): string {
  if (k.personelId) {
    const linked = personeller.find((p) => p.id === k.personelId);
    if (linked) return `pid:${linked.id}`;
    return `pid:${k.personelId}`;
  }

  const rawName = String(k.personelIsim || '').trim();
  if (rawName && personeller.length > 0) {
    const byName = findPersonelByName(personeller, rawName);
    if (byName?.id) return `pid:${byName.id}`;
  }

  const name = normalizeTurkishName(rawName);
  if (name) return `name:${name}`;

  return `row:${k.id}`;
}

function residentDedupeKey(k: KampKaydi, personeller: Personel[] = []): string {
  return resolveResidentCanonicalKey(k, personeller);
}

/** Firma bazında: toplam çalışan + kampta kalan + oda sayısı. */
export function buildKampFirmaOzeti(
  personeller: Personel[],
  kampKayitlari: KampKaydi[],
  options?: { onlyActivePersonel?: boolean; asOfDate?: string }
): KampFirmaOzetRow[] {
  const onlyActive = options?.onlyActivePersonel !== false;
  const asOf = options?.asOfDate || new Date().toISOString().slice(0, 10);
  const map = new Map<string, KampFirmaOzetRow>();
  const roomsByFirm = new Map<string, Set<string>>();
  const seenResidents = new Set<string>();

  const ensure = (raw: string): KampFirmaOzetRow => {
    const key = normalizeFirmaKey(raw, Array.from(map.keys()));
    let row = map.get(key);
    if (!row) {
      row = { firma: key, toplamCalisan: 0, kampta: 0, odaSayisi: 0 };
      map.set(key, row);
    }
    return row;
  };

  for (const p of personeller) {
    if (onlyActive) {
      if (!isPersonelAktifDurum(p.durum)) continue;
      if (!isPersonelActiveOnDate(p, asOf)) continue;
    }
    ensure(resolvePersonelFirma(p)).toplamCalisan += 1;
  }

  for (const k of kampKayitlari) {
    if (k.durum !== 'AKTIF') continue;
    const dedupe = residentDedupeKey(k, personeller);
    if (seenResidents.has(dedupe)) continue;
    seenResidents.add(dedupe);

    const row = ensure(resolveKampYerlesimFirma(k, personeller));
    row.kampta += 1;
    const rid = k.odaId || k.roomId;
    if (rid) {
      if (!roomsByFirm.has(row.firma)) roomsByFirm.set(row.firma, new Set());
      roomsByFirm.get(row.firma)!.add(rid);
    }
  }

  for (const [firma, rooms] of roomsByFirm) {
    const row = map.get(firma);
    if (row) row.odaSayisi = rooms.size;
  }

  return Array.from(map.values())
    .filter((r) => r.toplamCalisan > 0 || r.kampta > 0)
    .sort(
      (a, b) =>
        b.kampta - a.kampta ||
        b.toplamCalisan - a.toplamCalisan ||
        a.firma.localeCompare(b.firma, 'tr')
    );
}

/** Ham aktif kamp kaydı vs mükerrersiz yerleşim — tutarlılık kontrolü. */
export function auditKampYerlesimCounts(
  personeller: Personel[],
  kampKayitlari: KampKaydi[]
): {
  rawAktifKayit: number;
  uniqueYerlesik: number;
  firmaToplam: number;
  duplicateSkipped: number;
  totalsMatch: boolean;
  duplicateGroups: Array<{
    key: string;
    label: string;
    kayitlar: Array<{ id: string; personelIsim: string; odaNo?: string; yerleskeAdi?: string }>;
  }>;
  idsizAktifKayit: number;
  personelKartiEslesmeyen: number;
} {
  const rawAktif = kampKayitlari.filter((k) => k.durum === 'AKTIF');
  const groups = new Map<
    string,
    Array<{ id: string; personelIsim: string; odaNo?: string; yerleskeAdi?: string }>
  >();

  for (const k of rawAktif) {
    const key = residentDedupeKey(k, personeller);
    const row = {
      id: k.id,
      personelIsim: k.personelIsim || '—',
      odaNo: k.odaNo,
      yerleskeAdi: k.yerleskeAdi,
    };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let unique = 0;
  const duplicateGroups: Array<{
    key: string;
    label: string;
    kayitlar: Array<{ id: string; personelIsim: string; odaNo?: string; yerleskeAdi?: string }>;
  }> = [];

  for (const [key, kayitlar] of groups) {
    if (kayitlar.length === 1) {
      unique += 1;
      continue;
    }
    unique += 1;
    duplicateGroups.push({
      key,
      label: kayitlar.map((x) => x.personelIsim).join(' / '),
      kayitlar,
    });
  }

  duplicateGroups.sort((a, b) => b.kayitlar.length - a.kayitlar.length);

  const rows = buildKampFirmaOzeti(personeller, kampKayitlari);
  const firmaToplam = rows.reduce((s, r) => s + r.kampta, 0);

  let idsizAktifKayit = 0;
  let personelKartiEslesmeyen = 0;
  const seenUniqueResidents = new Set<string>();
  for (const k of rawAktif) {
    if (!k.personelId) idsizAktifKayit += 1;
    const key = resolveResidentCanonicalKey(k, personeller);
    if (seenUniqueResidents.has(key)) continue;
    seenUniqueResidents.add(key);
    if (!key.startsWith('pid:')) personelKartiEslesmeyen += 1;
  }

  return {
    rawAktifKayit: rawAktif.length,
    uniqueYerlesik: unique,
    firmaToplam,
    duplicateSkipped: Math.max(0, rawAktif.length - unique),
    totalsMatch: firmaToplam === unique,
    duplicateGroups,
    idsizAktifKayit,
    personelKartiEslesmeyen,
  };
}

export function buildKampFirmaYerlesimPrintHtml(
  rows: KampFirmaOzetRow[],
  options?: { odaToplam?: number; yatakToplam?: number }
): string {
  const yerlesimRows = rows.filter((r) => r.kampta > 0);
  const toplamKisi = yerlesimRows.reduce((s, r) => s + r.kampta, 0);
  const toplamOda = yerlesimRows.reduce((s, r) => s + r.odaSayisi, 0);
  const stamp = new Date().toLocaleString('tr-TR');

  const tableRows = yerlesimRows
    .map(
      (r, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">${r.firma}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800;color:#047857">${r.kampta}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#475569">${r.odaSayisi}</td>
      </tr>`
    )
    .join('');

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#0f172a">FİRMA BAZLI KAMP YERLEŞİMİ</h2>
    <p style="margin:0 0 16px;font-size:11px;color:#64748b">Aktif konaklama özeti · ${stamp}</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px">
        <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Toplam Yerleşik</div>
        <div style="font-size:20px;font-weight:900;color:#065f46">${toplamKisi} kişi</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Firma Sayısı</div>
        <div style="font-size:20px;font-weight:900;color:#0f172a">${yerlesimRows.length}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Oda / Yatak</div>
        <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:4px">
          ${options?.odaToplam ?? '—'} oda · ${options?.yatakToplam ?? '—'} yatak
        </div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">Firma odaları toplamı: ${toplamOda}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#065f46;color:#fff">
          <th style="padding:9px 10px;text-align:center;width:40px">#</th>
          <th style="padding:9px 10px;text-align:left">Firma</th>
          <th style="padding:9px 10px;text-align:right">Yerleşim (kişi)</th>
          <th style="padding:9px 10px;text-align:right">Oda</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8">Aktif yerleşim yok</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="background:#ecfdf5;font-weight:900">
          <td style="padding:10px"></td>
          <td style="padding:10px">TOPLAM YERLEŞİM</td>
          <td style="padding:10px;text-align:right;color:#065f46">${toplamKisi} kişi</td>
          <td style="padding:10px;text-align:right">${toplamOda}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:14px;font-size:9px;color:#94a3b8">
      Not: Yalnızca durumu AKTİF konaklama kayıtları sayılır. Aynı kişi mükerrer kayıtta bir kez sayılır.
    </p>
  `;

  return wrapCorporateReportHtml(body, {
    docCode: 'KAMP-FIRMA-YERLESIM',
    orientation: 'portrait',
    title: 'Firma Bazlı Kamp Yerleşimi',
    autoPrint: true,
  });
}

export function printKampFirmaYerlesim(
  personeller: Personel[],
  kampKayitlari: KampKaydi[],
  options?: { odaToplam?: number; yatakToplam?: number }
): void {
  const rows = buildKampFirmaOzeti(personeller, kampKayitlari);
  const html = buildKampFirmaYerlesimPrintHtml(rows, options);
  const win = openHtmlReportWindow(html, 'Firma Bazlı Kamp Yerleşimi');
  if (!win) {
    alert('Yazdırma penceresi açılamadı. Tarayıcı pop-up engelini kontrol edin.');
    return;
  }
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* no-op */
    }
  }, 350);
}
