import type { Personel } from '../types/erp';
import { resolveTaseronPersonelGorev, withTaseronPersonelGorev } from './taseronUtils';
import { isTaseronPersonel } from './yoklamaUtils';

/** Haftalık taşeron kadro satırı — ad/soyad zorunlu, TC opsiyonel */
export type TaseronListeRow = {
  ad: string;
  soyad: string;
  tcNo?: string;
  gorev?: string;
};

export type TaseronListeSyncResult = {
  list: Personel[];
  toSave: Personel[];
  created: Personel[];
  reactivated: Personel[];
  updated: Personel[];
  deactivated: Personel[];
  kept: Personel[];
  parseErrors: string[];
};

function normKey(s: string): string {
  return String(s || '')
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I')
    .replace(/İ/g, 'I')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(tc: string): string {
  return String(tc || '').replace(/\D/g, '');
}

function nameKey(ad: string, soyad: string): string {
  return normKey(`${ad} ${soyad}`);
}

function firmaKey(firmaAdi: string): string {
  return normKey(firmaAdi);
}

function sameTaseronFirma(p: Personel, firmaAdi: string): boolean {
  if (!isTaseronPersonel(p)) return false;
  return firmaKey(p.firmaAdi || '') === firmaKey(firmaAdi);
}

function isAktif(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

function splitAdSoyad(full: string): { ad: string; soyad: string } | null {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return {
      ad: parts[0].toLocaleUpperCase('tr-TR'),
      soyad: 'BİLİNMİYOR',
    };
  }
  return {
    ad: parts[0].toLocaleUpperCase('tr-TR'),
    soyad: parts.slice(1).join(' ').toLocaleUpperCase('tr-TR'),
  };
}

/**
 * Yapıştırılan metni satır satır parse eder.
 * Desteklenen biçimler:
 * - AD SOYAD
 * - AD SOYAD&lt;tab&gt;TC
 * - AD SOYAD;TC  veya  TC;AD SOYAD
 * - AD;SOYAD;TC
 */
export function parseTaseronListeText(raw: string): {
  rows: TaseronListeRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: TaseronListeRow[] = [];
  const seen = new Set<string>();

  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Başlık satırlarını atla
    if (/^(ad|isim|personel|tc|adı)/i.test(line) && line.length < 40) continue;

    let ad = '';
    let soyad = '';
    let tcNo = '';
    let gorev = '';

    if (line.includes('\t')) {
      const cols = line.split('\t').map((c) => c.trim());
      const maybeTc = cols.find((c) => /^\d{11}$/.test(digits(c)) && digits(c).length === 11);
      if (maybeTc) tcNo = digits(maybeTc);
      const nameCol = cols.find((c) => c && digits(c) !== digits(maybeTc || '') && !/^\d+$/.test(c));
      const split = splitAdSoyad(nameCol || cols[0] || '');
      if (!split) {
        errors.push(`Satır ${i + 1}: isim okunamadı`);
        continue;
      }
      ad = split.ad;
      soyad = split.soyad;
      if (cols[2] && !/^\d+$/.test(cols[2])) gorev = cols[2].toLocaleUpperCase('tr-TR');
    } else if (line.includes(';') || line.includes(',')) {
      const sep = line.includes(';') ? ';' : ',';
      const cols = line.split(sep).map((c) => c.trim()).filter(Boolean);
      if (cols.length === 1) {
        const split = splitAdSoyad(cols[0]);
        if (!split) {
          errors.push(`Satır ${i + 1}: isim okunamadı`);
          continue;
        }
        ad = split.ad;
        soyad = split.soyad;
      } else if (cols.length === 2) {
        const d0 = digits(cols[0]);
        const d1 = digits(cols[1]);
        if (d0.length === 11 && !/^\d{11}/.test(cols[1])) {
          tcNo = d0;
          const split = splitAdSoyad(cols[1]);
          if (!split) {
            errors.push(`Satır ${i + 1}: isim okunamadı`);
            continue;
          }
          ad = split.ad;
          soyad = split.soyad;
        } else if (d1.length === 11) {
          tcNo = d1;
          const split = splitAdSoyad(cols[0]);
          if (!split) {
            errors.push(`Satır ${i + 1}: isim okunamadı`);
            continue;
          }
          ad = split.ad;
          soyad = split.soyad;
        } else {
          ad = cols[0].toLocaleUpperCase('tr-TR');
          soyad = cols[1].toLocaleUpperCase('tr-TR');
        }
      } else {
        ad = cols[0].toLocaleUpperCase('tr-TR');
        soyad = cols[1].toLocaleUpperCase('tr-TR');
        const maybeTc = cols.find((c) => digits(c).length === 11);
        if (maybeTc) tcNo = digits(maybeTc);
        if (cols[2] && digits(cols[2]).length !== 11) {
          gorev = cols[2].toLocaleUpperCase('tr-TR');
        }
      }
    } else {
      // Satır sonunda 11 haneli TC olabilir
      const tcMatch = line.match(/\b(\d{11})\b/);
      const namePart = tcMatch ? line.replace(tcMatch[0], '').trim() : line;
      if (tcMatch) tcNo = tcMatch[1];
      const split = splitAdSoyad(namePart);
      if (!split) {
        errors.push(`Satır ${i + 1}: isim okunamadı`);
        continue;
      }
      ad = split.ad;
      soyad = split.soyad;
    }

    if (!ad) {
      errors.push(`Satır ${i + 1}: ad boş`);
      continue;
    }

    const key = tcNo || nameKey(ad, soyad);
    if (seen.has(key)) {
      errors.push(`Satır ${i + 1}: mükerrer (${ad} ${soyad}) — atlandı`);
      continue;
    }
    seen.add(key);
    rows.push({ ad, soyad, tcNo: tcNo || undefined, gorev: gorev || undefined });
  }

  return { rows, errors };
}

function makeTaseronPersonel(opts: {
  row: TaseronListeRow;
  firmaAdi: string;
  iseGirisTarihi: string;
}): Personel {
  const tc = digits(opts.row.tcNo || '');
  return {
    id: `prs_tsr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tcNo: tc,
    ad: opts.row.ad,
    soyad: opts.row.soyad,
    babaAdi: '',
    dogumTarihi: '',
    telefonNo: '',
    eposta: '',
    adres: '',
    il: '',
    ilce: '',
    departman: 'TAŞERON',
    gorev: resolveTaseronPersonelGorev({ firmaAdi: opts.firmaAdi, firmaTipi: 'TASERON' }),
    iseGirisTarihi: opts.iseGirisTarihi,
    cinsiyet: 'Belirtilmedi',
    maas: 0,
    ucretTipi: 'Günlük',
    sgkDurumu: 'Sigortasız',
    bankaAdi: '',
    subeAdi: '',
    ibanNo: '',
    durum: true,
    firmaTipi: 'TASERON',
    firmaAdi: opts.firmaAdi,
    personelGrubu: 'SAHA',
    onayDurumu: 'ONAYLANDI',
    kaynak: 'TASERON_LISTE',
  };
}

/**
 * Firma bazlı haftalık taşeron personel listesini senkronlar.
 * Listedekiler aktif kalır / oluşturulur; firmadaki listede olmayan aktifler pasife alınır.
 * IBAN ve maaş zorunlu değildir; yoklama/maaş hesaplarına zaten isTaseronPersonel ile girmezler.
 */
export function syncTaseronPersonelListe(options: {
  firmaAdi: string;
  rows: TaseronListeRow[];
  existing: Personel[];
  /** Pasife alınanlar için çıkış tarihi (YYYY-MM-DD) */
  cikisTarihi?: string;
  /** Yeni giriş / yeniden aktif için işe giriş (varsayılan bugün) */
  iseGirisTarihi?: string;
}): TaseronListeSyncResult {
  const firmaAdi = String(options.firmaAdi || '').trim();
  const today = new Date().toISOString().slice(0, 10);
  const cikisTarihi = options.cikisTarihi || today;
  const iseGirisTarihi = options.iseGirisTarihi || today;

  const list = [...options.existing];
  const toSave: Personel[] = [];
  const created: Personel[] = [];
  const reactivated: Personel[] = [];
  const updated: Personel[] = [];
  const deactivated: Personel[] = [];
  const kept: Personel[] = [];

  if (!firmaAdi) {
    return {
      list,
      toSave,
      created,
      reactivated,
      updated,
      deactivated,
      kept,
      parseErrors: ['Taşeron firma adı gerekli'],
    };
  }

  const firmPool = list.filter((p) => sameTaseronFirma(p, firmaAdi));
  const usedIds = new Set<string>();

  const findMatch = (row: TaseronListeRow): Personel | undefined => {
    const tc = digits(row.tcNo || '');
    if (tc) {
      const byTc = list.find((p) => digits(p.tcNo) === tc);
      if (byTc) return byTc;
    }
    const nk = nameKey(row.ad, row.soyad);
    return firmPool.find(
      (p) => !usedIds.has(p.id) && nameKey(p.ad, p.soyad) === nk
    );
  };

  for (const row of options.rows) {
    const match = findMatch(row);
    if (!match) {
      const neu = makeTaseronPersonel({ row, firmaAdi, iseGirisTarihi });
      list.push(neu);
      toSave.push(neu);
      created.push(neu);
      usedIds.add(neu.id);
      continue;
    }

    usedIds.add(match.id);
    const tc = digits(row.tcNo || '') || digits(match.tcNo);
    const wasAktif = isAktif(match);
    const needsFirma =
      match.firmaTipi !== 'TASERON' || firmaKey(match.firmaAdi || '') !== firmaKey(firmaAdi);
    const needsName =
      (match.ad || '') !== row.ad || (match.soyad || '') !== row.soyad;
    const needsTc = Boolean(tc) && digits(match.tcNo) !== tc;
    const targetGorev = resolveTaseronPersonelGorev({ firmaAdi, firmaTipi: 'TASERON' });
    const needsGorev = match.gorev !== targetGorev;
    const needsActivate = !wasAktif;

    if (!needsFirma && !needsName && !needsTc && !needsGorev && !needsActivate) {
      kept.push(match);
      continue;
    }

    const patched: Personel = withTaseronPersonelGorev({
      ...match,
      ad: row.ad,
      soyad: row.soyad,
      tcNo: tc || match.tcNo || '',
      firmaTipi: 'TASERON',
      firmaAdi,
      gorev: targetGorev,
      departman: match.departman || 'TAŞERON',
      durum: true,
      istenCikisTarihi: '',
      iseGirisTarihi: needsActivate
        ? iseGirisTarihi
        : match.iseGirisTarihi || iseGirisTarihi,
      personelGrubu: match.personelGrubu || 'SAHA',
      onayDurumu: match.onayDurumu || 'ONAYLANDI',
      kaynak: match.kaynak || 'TASERON_LISTE',
      // Taşeron: maaş/IBAN zorunlu değil — mevcut boşsa boş kalsın
      maas: Number(match.maas) || 0,
      ibanNo: match.ibanNo || '',
    });

    const idx = list.findIndex((p) => p.id === match.id);
    if (idx >= 0) list[idx] = patched;
    toSave.push(patched);
    if (needsActivate) reactivated.push(patched);
    else updated.push(patched);
  }

  // Firmadaki aktif olup listede olmayanlar → pasif
  for (const p of firmPool) {
    if (usedIds.has(p.id)) continue;
    if (!isAktif(p)) continue;
    const patched: Personel = {
      ...p,
      durum: false,
      istenCikisTarihi: cikisTarihi,
    };
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) list[idx] = patched;
    toSave.push(patched);
    deactivated.push(patched);
  }

  return {
    list,
    toSave,
    created,
    reactivated,
    updated,
    deactivated,
    kept,
    parseErrors: [],
  };
}
