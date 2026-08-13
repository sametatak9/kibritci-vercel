import { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { normalizeGorev, isUstaGorev } from './gorevUtils';
import {
  buildPersonelListForMonth,
  getYoklamaDay,
  isDayActiveForPersonel,
  isFormenGorev,
  isKampciGorev,
  isMermerciGorev,
  isOperatorGorev,
  isSeramikGorev,
  isSenorGorev,
  isSoforGorev,
  isTesisatciGorev,
} from './yoklamaUtils';
import { resolveStubPersonelFromLegacyId } from './legacyYoklamaImport';
import { formatDateLabelTr } from './dateKeyUtils';
import {
  buildYoklamaEtiketOzeti,
  normalizeYoklamaEtiketi,
  YOKLAMA_ETIKETSIZ,
} from './yoklamaEtiketUtils';

export interface GunlukYoklamaSatir {
  personelId: string;
  adSoyad: string;
  gorev: string;
  departman: string;
  tcNo: string;
  durum: YoklamaDurum;
  mesaiSaati: number;
  /** O gün yapılan iş / meslek grubu */
  isEtiketi: string;
  /** Etiketten bağımsız serbest açıklama */
  aciklama: string;
}

export interface GunlukYoklamaOzet {
  toplam: number;
  geldi: number;
  yok: number;
  izinli: number;
  raporlu: number;
  pazar: number;
  tatil: number;
  mesaiToplam: number;
}

/** Günlük yoklama raporu görev grupları */
export type GunlukYoklamaRaporGrup = 'FORMEN' | 'USTA' | 'SENOR' | 'KAMP' | 'DUZ_ISCI' | 'DIGER';

export const GUNLUK_YOKLAMA_RAPOR_GRUP_ORDER: GunlukYoklamaRaporGrup[] = [
  'FORMEN',
  'USTA',
  'SENOR',
  'KAMP',
  'DUZ_ISCI',
  'DIGER',
];

export function gunlukYoklamaRaporGrupLabel(grup: GunlukYoklamaRaporGrup): string {
  switch (grup) {
    case 'FORMEN':
      return 'FORMEN';
    case 'USTA':
      return 'USTA';
    case 'SENOR':
      return 'ŞENÖR';
    case 'KAMP':
      return 'KAMP';
    case 'DUZ_ISCI':
      return 'DÜZ İŞÇİ';
    default:
      return 'DİĞER';
  }
}

export function resolveGunlukYoklamaRaporGrup(gorev?: string): GunlukYoklamaRaporGrup {
  if (isFormenGorev(gorev)) return 'FORMEN';
  if (isUstaGorev(gorev)) return 'USTA';
  if (isSenorGorev(gorev)) return 'SENOR';
  if (isKampciGorev(gorev)) return 'KAMP';
  if (
    isTesisatciGorev(gorev) ||
    isMermerciGorev(gorev) ||
    isSeramikGorev(gorev) ||
    isOperatorGorev(gorev) ||
    isSoforGorev(gorev)
  ) {
    return 'DIGER';
  }
  const norm = normalizeGorev(gorev);
  if (norm === 'DÜZ İŞÇİ' || norm === 'İŞÇİ') return 'DUZ_ISCI';
  return 'DUZ_ISCI';
}

export interface GunlukYoklamaGorevGrubu {
  grup: GunlukYoklamaRaporGrup;
  label: string;
  satirlar: GunlukYoklamaSatir[];
  ozet: GunlukYoklamaOzet;
}

/** Satırları FORMEN / USTA / ŞENÖR / KAMP / DÜZ İŞÇİ / DİĞER olarak grupla */
export function groupGunlukYoklamaSatirlariByGorev(
  rows: GunlukYoklamaSatir[]
): GunlukYoklamaGorevGrubu[] {
  const buckets = new Map<GunlukYoklamaRaporGrup, GunlukYoklamaSatir[]>();
  for (const grup of GUNLUK_YOKLAMA_RAPOR_GRUP_ORDER) {
    buckets.set(grup, []);
  }

  for (const row of rows) {
    const grup = resolveGunlukYoklamaRaporGrup(row.gorev);
    buckets.get(grup)!.push(row);
  }

  return GUNLUK_YOKLAMA_RAPOR_GRUP_ORDER.map((grup) => {
    const satirlar = (buckets.get(grup) || [])
      .slice()
      .sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
    return {
      grup,
      label: gunlukYoklamaRaporGrupLabel(grup),
      satirlar,
      ozet: buildGunlukYoklamaOzet(satirlar),
    };
  }).filter((g) => g.satirlar.length > 0);
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Seçili günde yoklaması girilmiş (Girilmedi dışı) personel satırları */
export function buildGunlukYoklamaSatirlari(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  year: number,
  month: number,
  day: number
): GunlukYoklamaSatir[] {
  const list = buildPersonelListForMonth(
    personeller,
    yoklamalar,
    year,
    month,
    resolveStubPersonelFromLegacyId
  );
  const rows: GunlukYoklamaSatir[] = [];

  for (const p of list) {
    if (!isDayActiveForPersonel(p, year, month, day, yoklamalar[p.id])) continue;
    const dayData = getYoklamaDay(yoklamalar[p.id], year, month, day);
    const durum = (dayData?.durum || 'Girilmedi') as YoklamaDurum;
    if (durum === 'Girilmedi') continue;
    rows.push({
      personelId: p.id,
      adSoyad: `${p.ad} ${p.soyad}`.trim(),
      gorev: String(p.gorev || '—'),
      departman: String(p.departman || '—'),
      tcNo: String(p.tcNo || '—'),
      durum,
      mesaiSaati: Number(dayData?.mesaiSaati) || 0,
      isEtiketi: normalizeYoklamaEtiketi(dayData?.isEtiketi),
      aciklama: String(dayData?.aciklama || '').trim(),
    });
  }

  return rows.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));
}

export function buildGunlukYoklamaOzet(rows: GunlukYoklamaSatir[]): GunlukYoklamaOzet {
  const ozet: GunlukYoklamaOzet = {
    toplam: rows.length,
    geldi: 0,
    yok: 0,
    izinli: 0,
    raporlu: 0,
    pazar: 0,
    tatil: 0,
    mesaiToplam: 0,
  };
  for (const r of rows) {
    ozet.mesaiToplam += r.mesaiSaati;
    switch (r.durum) {
      case 'Geldi':
        ozet.geldi += 1;
        break;
      case 'Yok':
        ozet.yok += 1;
        break;
      case 'İzinli':
        ozet.izinli += 1;
        break;
      case 'Raporlu':
        ozet.raporlu += 1;
        break;
      case 'Pazar':
        ozet.pazar += 1;
        break;
      case 'Tatil':
        ozet.tatil += 1;
        break;
      default:
        break;
    }
  }
  return ozet;
}

const DURUM_COLOR: Record<string, string> = {
  Geldi: '#059669',
  Yok: '#e11d48',
  İzinli: '#0284c7',
  Raporlu: '#d97706',
  Pazar: '#ea580c',
  Tatil: '#7c3aed',
};

const GRUP_HEADER_BG: Record<GunlukYoklamaRaporGrup, string> = {
  FORMEN: '#5b21b6',
  USTA: '#c026d3',
  SENOR: '#0f766e',
  KAMP: '#b45309',
  DUZ_ISCI: '#1d4ed8',
  DIGER: '#475569',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSatirRows(satirlar: GunlukYoklamaSatir[]): string {
  return satirlar
    .map(
      (r, i) => `<tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(r.adSoyad)}</strong></td>
        <td>${escapeHtml(r.gorev)}</td>
        <td>${r.isEtiketi ? `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:10px;font-weight:800">${escapeHtml(r.isEtiketi)}</span>` : '<span style="color:#94a3b8">—</span>'}</td>
        <td style="font-size:11px;color:#334155">${r.aciklama ? escapeHtml(r.aciklama) : '<span style="color:#94a3b8">—</span>'}</td>
        <td>${escapeHtml(r.departman)}</td>
        <td style="font-family:monospace;font-size:11px">${escapeHtml(r.tcNo)}</td>
        <td style="font-weight:800;color:${DURUM_COLOR[r.durum] || '#64748b'}">${escapeHtml(r.durum)}</td>
        <td style="text-align:center;font-weight:700">${r.mesaiSaati > 0 ? r.mesaiSaati : '—'}</td>
      </tr>`
    )
    .join('');
}

function renderGrupSection(grup: GunlukYoklamaGorevGrubu, index: number): string {
  const bg = GRUP_HEADER_BG[grup.grup];
  const rows = renderSatirRows(grup.satirlar);
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:${index === 0 ? '0' : '16px'} 0 0">
      <thead>
        <tr>
          <th colspan="9" style="background:${bg};color:#fff;padding:6px 10px;text-align:left;font-size:11px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;border:1px solid ${bg}">
            ${escapeHtml(grup.label)}
            <span style="float:right;font-size:10px;font-weight:700;background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:999px;text-transform:none">
              ${grup.satirlar.length} kişi · ${grup.ozet.geldi} geldi · ${grup.ozet.mesaiToplam}s mesai
            </span>
          </th>
        </tr>
        <tr style="background:#f1f5f9">
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px;width:32px">#</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">Ad Soyad</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">Görev</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">İş / Meslek</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">Açıklama</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">Departman</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">TC</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px">Durum</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px;text-align:center">Mesai</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Yazdır / e-posta için bağımsız HTML rapor — görev grupları ayrı tablolar */
export function buildGunlukYoklamaRaporHtml(
  rows: GunlukYoklamaSatir[],
  ozet: GunlukYoklamaOzet,
  year: number,
  month: number,
  day: number
): string {
  const dateKey = dateKeyFromParts(year, month, day);
  const dateLabel = formatDateLabelTr(dateKey);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });

  const gruplar = groupGunlukYoklamaSatirlariByGorev(rows);
  const grupOzet = gruplar
    .map(
      (g) =>
        `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:10px"><strong>${escapeHtml(g.label)}</strong>: ${g.satirlar.length}</span>`
    )
    .join('');
  const etiketOzet = buildYoklamaEtiketOzeti(rows)
    .map(
      (e) =>
        `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-size:10px"><strong>${escapeHtml(e.etiket === YOKLAMA_ETIKETSIZ ? 'Etiketsiz' : e.etiket)}</strong>: ${e.adet} kişi · ${e.geldi} geldi</span>`
    )
    .join('');

  const sections =
    gruplar.length > 0
      ? gruplar.map((g, i) => renderGrupSection(g, i)).join('')
      : '<p style="color:#64748b">Bu gün için yoklama kaydı yok.</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Günlük Yoklama — ${escapeHtml(dateLabel)}</title>
  <style>
    body{font-family:system-ui,sans-serif;color:#1e293b;padding:32px;max-width:1100px;margin:0 auto}
    h1{font-size:20px;margin:0} .meta{color:#64748b;font-size:13px;margin:8px 0 24px}
    .badge{display:inline-block;background:#f59e0b;color:#0f172a;font-weight:800;font-size:11px;padding:4px 10px;border-radius:999px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f1f5f9;text-align:left;padding:8px;border-bottom:2px solid #cbd5e1;text-transform:uppercase;font-size:10px}
    td{padding:8px;border-bottom:1px solid #e2e8f0}
    .ozet{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
    .ozet div{min-width:90px;flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}
    .ozet strong{display:block;font-size:20px}
    thead{display:table-header-group}
    tbody tr{page-break-inside:avoid;break-inside:avoid}
    @media print { body { padding: 16px; } }
  </style></head><body>
  <span class="badge">KİBRİTÇİ İNŞAAT · PUANTAJ</span>
  <h1>Günlük Personel Yoklama Raporu</h1>
  <p class="meta">${escapeHtml(monthLabel)} · ${escapeHtml(dateLabel)} · ${ozet.toplam} kayıt · görev + meslek grubu etiketleri</p>
  <div class="ozet">
    <div><strong style="color:#059669">${ozet.geldi}</strong>Geldi</div>
    <div><strong style="color:#e11d48">${ozet.yok}</strong>Yok</div>
    <div><strong style="color:#0284c7">${ozet.izinli}</strong>İzinli</div>
    <div><strong style="color:#d97706">${ozet.raporlu}</strong>Raporlu</div>
    <div><strong style="color:#ea580c">${ozet.pazar}</strong>Pazar</div>
    <div><strong style="color:#7c3aed">${ozet.tatil}</strong>Tatil</div>
    <div><strong>${ozet.mesaiToplam}</strong>Top. Mesai (saat)</div>
  </div>
  <div style="margin:0 0 8px;line-height:1.4">${grupOzet}</div>
  ${etiketOzet ? `<div style="margin:0 0 12px;line-height:1.4"><span style="font-size:10px;font-weight:800;color:#9a3412;margin-right:6px">MESLEK GRUPLARI</span>${etiketOzet}</div>` : ''}
  ${sections}
  <p class="meta" style="margin-top:28px">Rapor yalnızca Girilmedi dışındaki yoklama kayıtlarını listeler. Görev grupları (FORMEN · USTA · ŞENÖR · KAMP · DÜZ İŞÇİ) ayrı tablolardır; meslek etiketleri o gün yapılan işi belirtir.</p>
  </body></html>`;
}

export function openGunlukYoklamaRaporHtml(html: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcıda yeni pencere açılmasına izin verin.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
}
