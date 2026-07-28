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

  const sections = groups
    .map((g, gi) => {
      const rows = g.personeller
        .map(
          (p, idx) => `<tr>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;width:36px">${idx + 1}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;font-weight:600">${esc(p.ad)} ${esc(p.soyad)}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;font-family:ui-monospace,monospace;font-size:11px">${esc(p.tcNo || '—')}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0">${esc(p.telefonNo || '—')}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0">${esc(p.iseGirisTarihi || '—')}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center">${p.durum ? 'Aktif' : 'Pasif'}</td>
        </tr>`
        )
        .join('');

      return `
      <section style="margin:${gi === 0 ? '0' : '22px'} 0 0;page-break-inside:avoid">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#1e3a5f;color:#fff;padding:8px 12px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:13px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase">${esc(g.gorev)}</h2>
          <span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:999px">${g.personeller.length} kişi</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:10px;text-transform:uppercase">#</th>
              <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;font-size:10px;text-transform:uppercase">Ad Soyad</th>
              <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;font-size:10px;text-transform:uppercase">TC</th>
              <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;font-size:10px;text-transform:uppercase">Telefon</th>
              <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;font-size:10px;text-transform:uppercase">İşe Giriş</th>
              <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:10px;text-transform:uppercase">Durum</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const ozet = groups
    .map(
      (g) =>
        `<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 8px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px"><strong>${esc(g.gorev)}</strong>: ${g.personeller.length}</span>`
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 10px;font-size:12px;color:#475569">Aynı görevdeki personeller alt alta gruplanmıştır. Toplam <strong>${total}</strong> kişi · <strong>${groups.length}</strong> görev grubu.</p>
    <div style="margin:0 0 16px">${ozet}</div>
    ${sections}
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
