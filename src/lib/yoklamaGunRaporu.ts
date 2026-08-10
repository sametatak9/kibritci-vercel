import { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import {
  buildPersonelListForMonth,
  getYoklamaDay,
  isDayActiveForPersonel,
} from './yoklamaUtils';
import { resolveStubPersonelFromLegacyId } from './legacyYoklamaImport';
import { formatDateLabelTr } from './dateKeyUtils';

export interface GunlukYoklamaSatir {
  personelId: string;
  adSoyad: string;
  gorev: string;
  departman: string;
  tcNo: string;
  durum: YoklamaDurum;
  mesaiSaati: number;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Yazdır / e-posta için bağımsız HTML rapor */
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

  const trs = rows
    .map(
      (r, i) => `<tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(r.adSoyad)}</strong></td>
        <td>${escapeHtml(r.gorev)}</td>
        <td>${escapeHtml(r.departman)}</td>
        <td style="font-family:monospace;font-size:11px">${escapeHtml(r.tcNo)}</td>
        <td style="font-weight:800;color:${DURUM_COLOR[r.durum] || '#64748b'}">${escapeHtml(r.durum)}</td>
        <td style="text-align:center;font-weight:700">${r.mesaiSaati > 0 ? r.mesaiSaati : '—'}</td>
      </tr>`
    )
    .join('');

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
    @media print { body { padding: 16px; } }
  </style></head><body>
  <span class="badge">KİBRİTÇİ İNŞAAT · PUANTAJ</span>
  <h1>Günlük Personel Yoklama Raporu</h1>
  <p class="meta">${escapeHtml(monthLabel)} · ${escapeHtml(dateLabel)} · ${ozet.toplam} kayıt</p>
  <div class="ozet">
    <div><strong style="color:#059669">${ozet.geldi}</strong>Geldi</div>
    <div><strong style="color:#e11d48">${ozet.yok}</strong>Yok</div>
    <div><strong style="color:#0284c7">${ozet.izinli}</strong>İzinli</div>
    <div><strong style="color:#d97706">${ozet.raporlu}</strong>Raporlu</div>
    <div><strong style="color:#ea580c">${ozet.pazar}</strong>Pazar</div>
    <div><strong style="color:#7c3aed">${ozet.tatil}</strong>Tatil</div>
    <div><strong>${ozet.mesaiToplam}</strong>Top. Mesai (saat)</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Ad Soyad</th><th>Görev</th><th>Departman</th><th>TC</th><th>Durum</th><th>Mesai</th></tr></thead>
    <tbody>${trs || '<tr><td colspan="7">Bu gün için yoklama kaydı yok.</td></tr>'}</tbody>
  </table>
  <p class="meta" style="margin-top:28px">Rapor yalnızca Girilmedi dışındaki yoklama kayıtlarını listeler.</p>
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
