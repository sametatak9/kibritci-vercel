import type { Personel } from '../types/erp';
import { validateTC } from './personelOdemeUtils';
import { firmaAnahtar } from './taseronUtils';
import { CANONICAL_ANA_FIRMA_ADI, isTaseronPersonel } from './yoklamaUtils';
import { buildKibritciReportHtml, openKibritciReportPrint } from './kibritciReportTemplate';

const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');
const phoneMatchKey = (raw: string) => {
  const d = digitsOnly(raw);
  return d.length >= 10 ? d.slice(-10) : d;
};

function personelAktif(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

function eksikTc(p: Personel): boolean {
  return !validateTC(p.tcNo || '');
}

function eksikTel(p: Personel): boolean {
  return phoneMatchKey(p.telefonNo || '').length < 10;
}

function mykLabel(p: Personel): string {
  const v = p.mykDurumu || 'BILINMIYOR';
  if (v === 'VAR') return 'VAR';
  if (v === 'YOK') return 'YOK';
  return '?';
}

function mykTone(p: Personel): { bg: string; color: string } {
  const v = p.mykDurumu || 'BILINMIYOR';
  if (v === 'VAR') return { bg: '#dcfce7', color: '#166534' };
  if (v === 'YOK') return { bg: '#e2e8f0', color: '#334155' };
  return { bg: '#fef3c7', color: '#92400e' };
}

const esc = (value: string | number | boolean | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function groupTaseronByFirma(personeller: Personel[]): Map<string, { firmaAdi: string; personeller: Personel[] }> {
  const groups = new Map<string, { firmaAdi: string; personeller: Personel[] }>();

  for (const p of personeller.filter(isTaseronPersonel)) {
    const firmaAdi = String(p.firmaAdi || '').trim() || '— Firma Belirtilmemiş —';
    const key = firmaAnahtar(firmaAdi) || firmaAdi.toLocaleLowerCase('tr-TR');
    const group = groups.get(key) || { firmaAdi, personeller: [] };
    if (!group.firmaAdi || group.firmaAdi === '— Firma Belirtilmemiş —') {
      group.firmaAdi = firmaAdi;
    }
    group.personeller.push(p);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.personeller.sort((a, b) =>
      `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' })
    );
  }

  return groups;
}

export function buildTaseronSayimListeRaporHtml(options: {
  personeller: Personel[];
  title?: string;
}): string {
  const rows = options.personeller.filter(isTaseronPersonel);
  const firmaGroups = groupTaseronByFirma(rows);
  const sortedFirmalar = Array.from(firmaGroups.values()).sort((a, b) =>
    a.firmaAdi.localeCompare(b.firmaAdi, 'tr', { sensitivity: 'base' })
  );

  const total = rows.length;
  const aktifCount = rows.filter(personelAktif).length;
  const eksikTcCount = rows.filter(eksikTc).length;
  const eksikTelCount = rows.filter(eksikTel).length;
  const mykBilinmiyorCount = rows.filter((p) => !p.mykDurumu || p.mykDurumu === 'BILINMIYOR').length;

  const summaryCard = (label: string, value: string | number, tone: string) => `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${tone};border-radius:8px;padding:8px 10px;background:#fff">
      <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.04em">${esc(label)}</div>
      <div style="font-size:18px;color:#0f172a;font-weight:900;line-height:1.15">${esc(value)}</div>
    </div>
  `;

  const cell = 'padding:5px 6px;border:1px solid #e2e8f0;vertical-align:top;line-height:1.25';
  const th =
    'padding:6px;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.03em';

  const sections = sortedFirmalar
    .map((group) => {
      const firmaEksik = group.personeller.filter(
        (p) => eksikTc(p) || eksikTel(p) || !p.mykDurumu || p.mykDurumu === 'BILINMIYOR'
      ).length;

      const bodyRows = group.personeller
        .map((p, index) => {
          const aktif = personelAktif(p);
          const tcBad = eksikTc(p);
          const telBad = eksikTel(p);
          const mykBad = !p.mykDurumu || p.mykDurumu === 'BILINMIYOR';
          const myk = mykTone(p);

          const eksikBadges = [
            tcBad ? '<span style="display:inline-block;margin:1px 2px 0 0;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;background:#fee2e2;color:#991b1b">TC</span>' : '',
            telBad ? '<span style="display:inline-block;margin:1px 2px 0 0;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;background:#ffedd5;color:#9a3412">TEL</span>' : '',
            mykBad ? '<span style="display:inline-block;margin:1px 2px 0 0;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;background:#ede9fe;color:#5b21b6">MYK</span>' : '',
          ]
            .filter(Boolean)
            .join('');

          return `<tr>
            <td style="${cell};text-align:center;color:#64748b;width:28px">${index + 1}</td>
            <td style="${cell};font-weight:800;color:#0f172a">${esc(p.ad)} ${esc(p.soyad)}</td>
            <td style="${cell}">${esc(p.gorev || '—')}</td>
            <td style="${cell};font-family:ui-monospace,Consolas,monospace;font-size:10px;color:${tcBad ? '#b91c1c' : '#0f172a'}">${esc(tcBad ? 'EKSİK' : p.tcNo || '—')}</td>
            <td style="${cell};font-size:10px;color:${telBad ? '#c2410c' : '#0f172a'}">${esc(telBad ? 'EKSİK' : p.telefonNo || '—')}</td>
            <td style="${cell};text-align:center">
              <span style="display:inline-block;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;background:${myk.bg};color:${myk.color}">${mykLabel(p)}</span>
            </td>
            <td style="${cell};text-align:center">
              <span style="display:inline-block;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;background:${aktif ? '#dcfce7' : '#fee2e2'};color:${aktif ? '#166534' : '#991b1b'}">${aktif ? 'Aktif' : 'Pasif'}</span>
            </td>
            <td style="${cell};font-size:10px">${eksikBadges || '<span style="color:#166534;font-weight:700">Tam</span>'}</td>
          </tr>`;
        })
        .join('');

      return `
        <section style="break-inside:avoid;margin-top:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;background:#92400e;color:#fff;border-radius:8px 8px 0 0;padding:7px 10px">
            <strong style="font-size:12px;letter-spacing:.02em">${esc(group.firmaAdi)}</strong>
            <span style="font-size:10px;font-weight:800;background:rgba(255,255,255,.16);border-radius:999px;padding:2px 8px">${group.personeller.length} kişi · ${firmaEksik} eksik</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr>
                <th style="${th};text-align:center">#</th>
                <th style="${th}">Ad Soyad</th>
                <th style="${th}">Görev</th>
                <th style="${th}">TC Kimlik</th>
                <th style="${th}">Telefon</th>
                <th style="${th};text-align:center">MYK</th>
                <th style="${th};text-align:center">Durum</th>
                <th style="${th}">Eksik</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const bodyHtml = `
    <style>
      .taseron-sayim-liste thead { display: table-header-group; }
      .taseron-sayim-liste tr { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        .taseron-sayim-liste .summary-grid { grid-template-columns: repeat(5, 1fr) !important; }
      }
    </style>
    <div class="taseron-sayim-liste">
      <div class="summary-grid" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px">
        ${summaryCard('Toplam Personel', total, '#92400e')}
        ${summaryCard('Aktif', aktifCount, '#16a34a')}
        ${summaryCard('TC Eksik', eksikTcCount, '#dc2626')}
        ${summaryCard('Tel Eksik', eksikTelCount, '#ea580c')}
        ${summaryCard('MYK ?', mykBilinmiyorCount, '#7c3aed')}
      </div>
      <p style="margin:0 0 8px;color:#475569;font-size:11px;line-height:1.35">
        Taşeron firmalar firma bazında ayrılmıştır. Her firma içinde personel ada göre sıralanmıştır.
      </p>
      ${sections || '<p style="color:#64748b;font-style:italic">Taşeron personeli bulunamadı.</p>'}
    </div>
  `;

  return buildKibritciReportHtml({
    title: options.title || `${CANONICAL_ANA_FIRMA_ADI} — Taşeron Sayım Listesi`,
    subtitle: 'Firma bazlı taşeron personel sayım raporu',
    meta: [
      `Toplam taşeron personel: ${total}`,
      `Aktif personel: ${aktifCount}`,
      `Firma sayısı: ${sortedFirmalar.length}`,
      `Rapor tarihi: ${new Date().toLocaleString('tr-TR')}`,
    ],
    bodyHtml,
  });
}

export function openTaseronSayimListeRaporu(options: { personeller: Personel[]; title?: string }): number {
  const count = options.personeller.filter(isTaseronPersonel).length;
  if (count === 0) {
    throw new Error('Taşeron sayım listesi oluşturulacak personel bulunamadı.');
  }
  const html = buildTaseronSayimListeRaporHtml(options);
  openKibritciReportPrint(html, options.title || 'Taşeron Sayım Listesi');
  return count;
}
