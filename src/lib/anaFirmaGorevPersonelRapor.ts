import type { Personel } from '../types/erp';
import { displayPersonelGorev } from './guvenlikHelpers';
import {
  buildKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';
import { CANONICAL_ANA_FIRMA_ADI, isTaseronPersonel } from './yoklamaUtils';

export type GorevPersonelGroup = {
  gorev: string;
  personeller: Personel[];
};

const esc = (v: string | number | undefined | null): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function isAktif(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

function sortByName(a: Personel, b: Personel): number {
  return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', {
    sensitivity: 'base',
  });
}

/** Aynı görevdekiler alt alta; görev grupları alfabetik */
export function groupPersonelByGorev(personeller: Personel[]): GorevPersonelGroup[] {
  const map = new Map<string, Personel[]>();
  for (const p of personeller) {
    const gorev = displayPersonelGorev(p) || '—';
    const list = map.get(gorev) || [];
    list.push(p);
    map.set(gorev, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
    .map(([gorev, list]) => ({
      gorev,
      personeller: list.slice().sort(sortByName),
    }));
}

/** Ana firma kadrosu → göreve göre gruplanmış liste */
export function collectAnaFirmaGorevGroups(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): GorevPersonelGroup[] {
  const pool = personeller
    .filter((p) => !isTaseronPersonel(p))
    .filter((p) => (options?.onlyActive ? isAktif(p) : true));
  return groupPersonelByGorev(pool);
}

/** Düz satır listesi: önce görev, sonra isim (Excel sırası için) */
export function flattenGorevGroups(groups: GorevPersonelGroup[]): Personel[] {
  return groups.flatMap((g) => g.personeller);
}

export function buildAnaFirmaGorevPersonelReportHtml(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): string {
  const groups = collectAnaFirmaGorevGroups(personeller, options);
  const total = groups.reduce((s, g) => s + g.personeller.length, 0);

  if (total === 0) {
    return buildKibritciReportHtml({
      title: `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi (Göreve Göre)`,
      subtitle: 'Ana firma kadrosu',
      meta: [`Kayıt: 0${options?.onlyActive ? ' (yalnız aktif)' : ''}`],
      bodyHtml: '<p style="color:#64748b">Listelenecek ana firma personeli bulunamadı.</p>',
    });
  }

  const cell = 'padding:2px 6px;border:1px solid #e2e8f0;line-height:1.25';
  const th = 'padding:3px 6px;border:1px solid #cbd5e1;font-size:9px;text-transform:uppercase;letter-spacing:0.02em';

  const sections = groups
    .map((g, gi) => {
      const rows = g.personeller
        .map(
          (p, idx) => `<tr>
          <td style="${cell};text-align:center;width:28px">${idx + 1}</td>
          <td style="${cell};font-weight:600">${esc(p.ad)} ${esc(p.soyad)}</td>
          <td style="${cell};font-family:ui-monospace,monospace;font-size:10px">${esc(p.tcNo || '—')}</td>
          <td style="${cell}">${esc(p.telefonNo || '—')}</td>
          <td style="${cell}">${esc(p.iseGirisTarihi || '—')}</td>
          <td style="${cell};text-align:center">${p.durum ? 'Aktif' : 'Pasif'}</td>
        </tr>`
        )
        .join('');

  // Görev adı thead içinde: yazdırmada başlık listeden ayrılmaz; sayfa bölünürse tekrarlanır
  return `
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin:${gi === 0 ? '0' : '8px'} 0 0">
        <thead>
          <tr>
            <th colspan="6" style="background:#1e3a5f;color:#fff;padding:4px 8px;text-align:left;border:1px solid #1e3a5f;font-size:11px;font-weight:800;letter-spacing:0.03em;text-transform:uppercase">
              ${esc(g.gorev)}
              <span style="float:right;font-size:10px;font-weight:700;background:rgba(255,255,255,0.15);padding:1px 7px;border-radius:999px;text-transform:none;letter-spacing:0">${g.personeller.length} kişi</span>
            </th>
          </tr>
          <tr style="background:#f1f5f9">
            <th style="${th};text-align:center">#</th>
            <th style="${th};text-align:left">Ad Soyad</th>
            <th style="${th};text-align:left">TC</th>
            <th style="${th};text-align:left">Telefon</th>
            <th style="${th};text-align:left">İşe Giriş</th>
            <th style="${th};text-align:center">Durum</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    })
    .join('');

  const ozet = groups
    .map(
      (g) =>
        `<span style="display:inline-block;margin:1px 4px 1px 0;padding:1px 6px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;font-size:10px"><strong>${esc(g.gorev)}</strong>: ${g.personeller.length}</span>`
    )
    .join('');

  const bodyHtml = `
    <style>
      .gorev-rapor table { page-break-inside: auto; }
      .gorev-rapor thead { display: table-header-group; }
      .gorev-rapor tbody tr { page-break-inside: avoid; break-inside: avoid; }
    </style>
    <div class="gorev-rapor">
      <p style="margin:0 0 6px;font-size:11px;color:#475569;line-height:1.3">Aynı görevdeki personeller alt alta gruplanmıştır. Toplam <strong>${total}</strong> kişi · <strong>${groups.length}</strong> görev grubu.</p>
      <div style="margin:0 0 8px;line-height:1.35">${ozet}</div>
      ${sections}
    </div>
  `;

  return buildKibritciReportHtml({
    title: `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi (Göreve Göre)`,
    subtitle: 'Ana firma kadrosu · görev grupları',
    meta: [
      `Firma: ${CANONICAL_ANA_FIRMA_ADI}`,
      `Toplam personel: ${total}`,
      `Görev grubu: ${groups.length}`,
      options?.onlyActive ? 'Filtre: Yalnız aktif' : 'Filtre: Aktif + pasif',
      `Rapor tarihi: ${new Date().toLocaleString('tr-TR')}`,
    ],
    bodyHtml,
  }).replace(
    '</body>',
    '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body>'
  );
}

export function printAnaFirmaGorevPersonelReport(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): void {
  const groups = collectAnaFirmaGorevGroups(personeller, options);
  const total = groups.reduce((s, g) => s + g.personeller.length, 0);
  if (total === 0) {
    alert('Listelenecek ana firma personeli bulunamadı.');
    return;
  }
  const html = buildAnaFirmaGorevPersonelReportHtml(personeller, options);
  openKibritciReportPrint(html, `${CANONICAL_ANA_FIRMA_ADI} Personel (Göreve Göre)`);
}
