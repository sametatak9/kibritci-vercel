/** Gün sonu saha faaliyet raporu — parsel / blok / etiket / personel */
import { Personel, SahaFaaliyeti, SahaGunRaporArsiv } from '../types/erp';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import { resolveFaaliyetEkip } from './faaliyetPersonelUtils';
import { ilerlemeDurumuLabel, normalizeFaaliyetEtiketi } from './faaliyetEtiketUtils';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';
import { saveDocument } from './firebase';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sonIlerlemeYorum(f: SahaFaaliyeti): string {
  const list = f.ilerlemeKayitlari || [];
  if (list.length === 0) return '';
  const last = list[list.length - 1];
  return String(last?.yorum || '').trim();
}

export function buildFaaliyetGunSonuReportHtml(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  personeller: Personel[];
  genelNotlar?: string;
  olusturan?: string;
}): string {
  const dk = normalizeDateKey(options.dateKey) || options.dateKey;
  const dayLabel = formatDateLabelTr(dk);
  const sorted = [...(options.sahaFaaliyetleri || [])].sort((a, b) => {
    const pa = `${a.parsel || ''} ${a.blok || ''}`.localeCompare(
      `${b.parsel || ''} ${b.blok || ''}`,
      'tr'
    );
    if (pa !== 0) return pa;
    const ea = normalizeFaaliyetEtiketi(a.isEtiketi).localeCompare(
      normalizeFaaliyetEtiketi(b.isEtiketi),
      'tr'
    );
    if (ea !== 0) return ea;
    return String(a.isNiteligi || '').localeCompare(String(b.isNiteligi || ''), 'tr');
  });

  type Group = {
    key: string;
    parsel: string;
    blok: string;
    etiket: string;
    items: SahaFaaliyeti[];
  };
  const groups = new Map<string, Group>();
  for (const f of sorted) {
    const parsel = f.parsel || '—';
    const blok = f.blok || '—';
    const etiket = normalizeFaaliyetEtiketi(f.isEtiketi) || 'ETİKETSİZ';
    const key = `${parsel}||${blok}||${etiket}`;
    if (!groups.has(key)) {
      groups.set(key, { key, parsel, blok, etiket, items: [] });
    }
    groups.get(key)!.items.push(f);
  }

  const groupHtml = Array.from(groups.values())
    .map((g) => {
      const rows = g.items
        .map((f, i) => {
          const ekip = resolveFaaliyetEkip(f, options.personeller)
            .map((u) => u.adSoyad)
            .join(', ');
          const yorum = sonIlerlemeYorum(f);
          const fotoN = getFaaliyetFotolar(f).length;
          return `<tr>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">${i + 1}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:700">${escapeHtml(f.isNiteligi || '—')}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0">${escapeHtml(ekip || '—')}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px">${escapeHtml(ilerlemeDurumuLabel(f.ilerlemeDurumu))}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px">${escapeHtml(yorum || f.aciklama || '—')}</td>
            <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center">${fotoN}</td>
          </tr>`;
        })
        .join('');

      return `
        <section style="margin:0 0 18px">
          <div style="background:#1e3a5f;color:#fff;padding:8px 12px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800">
            Parsel ${escapeHtml(g.parsel)} · Blok ${escapeHtml(g.blok)} · ${escapeHtml(g.etiket)}
            <span style="float:right;opacity:.9">${g.items.length} kayıt</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="padding:6px;border:1px solid #cbd5e1;width:36px">#</th>
                <th style="padding:6px;border:1px solid #cbd5e1;text-align:left">İş</th>
                <th style="padding:6px;border:1px solid #cbd5e1;text-align:left">Personel</th>
                <th style="padding:6px;border:1px solid #cbd5e1;text-align:left">İlerleme</th>
                <th style="padding:6px;border:1px solid #cbd5e1;text-align:left">Yorum / Açıklama</th>
                <th style="padding:6px;border:1px solid #cbd5e1;width:48px">Foto</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join('');

  const notlar = String(options.genelNotlar || '').trim();
  const title = 'SAHA GÜN SONU FAALİYET RAPORU';
  const subtitle = `${dayLabel} · parsel / blok / etiket / personel`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title} — ${dayLabel}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; color: #0f172a; }
    .page { max-width: 960px; margin: 0 auto; }
    @media print { body { padding: 8px; } section { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div style="margin:12px 0 16px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:11px;color:#475569">
      <p style="margin:2px 0">Toplam kayıt: <strong>${sorted.length}</strong> · Grup: <strong>${groups.size}</strong></p>
      <p style="margin:2px 0">Oluşturan: ${escapeHtml(options.olusturan || '—')}</p>
      <p style="margin:2px 0">Basım: ${new Date().toLocaleString('tr-TR')}</p>
    </div>
    ${
      notlar
        ? `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px">
            <div style="font-size:10px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:.04em">Formen / Yönetici görüşü</div>
            <p style="margin:8px 0 0;font-size:13px;line-height:1.55;white-space:pre-wrap">${escapeHtml(notlar)}</p>
          </div>`
        : ''
    }
    ${
      sorted.length === 0
        ? '<p style="color:#64748b;font-style:italic">Bu gün için saha faaliyet kaydı yok.</p>'
        : groupHtml
    }
    <footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
      Kibritçi ERP · Saha Gün Sonu Faaliyet Raporu
    </footer>
  </div>
</body>
</html>`;
}

export function openFaaliyetGunSonuReport(html: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcı izinlerini kontrol edin.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  setTimeout(() => w.print(), 500);
}

/** Arşiv + yönetim akış kuyruğuna yazar */
export async function submitFaaliyetGunSonuRapor(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  personeller: Personel[];
  genelNotlar: string;
  olusturanEmail: string;
  yoklamaOzet?: SahaGunRaporArsiv['yoklamaOzet'];
}): Promise<{ arsivId: string; akisId: string; html: string }> {
  const dk = normalizeDateKey(options.dateKey) || options.dateKey;
  const html = buildFaaliyetGunSonuReportHtml({
    dateKey: dk,
    sahaFaaliyetleri: options.sahaFaaliyetleri,
    personeller: options.personeller,
    genelNotlar: options.genelNotlar,
    olusturan: options.olusturanEmail,
  });

  const ids = options.sahaFaaliyetleri.map((f) => f.id);
  const formenAdet = options.sahaFaaliyetleri.filter(
    (f) => String(f.kaynakEkran || '').toUpperCase() === 'FORMEN_MOBIL'
  ).length;

  const arsivId = `saha_gun_rapor_${dk}_${Date.now()}`;
  const arsiv: SahaGunRaporArsiv = {
    id: arsivId,
    tarih: dk,
    olusturmaTarihi: new Date().toISOString(),
    olusturan: options.olusturanEmail,
    faaliyetIds: ids,
    faaliyetAdet: ids.length,
    formenFaaliyetAdet: formenAdet,
    yoklamaOzet: options.yoklamaOzet || { gelen: 0, yok: 0, izinli: 0, raporlu: 0 },
    aciklama: options.genelNotlar || `Gün sonu saha raporu · ${ids.length} faaliyet`,
    genelNotlar: options.genelNotlar,
    kaynak: 'FAALIYET_PERSONEL_GUN_SONU',
  };
  await saveDocument('sahaGunRaporArsiv', arsiv);

  const akisId = `akis_saha_${dk}_${Date.now()}`;
  const ozetMetin = [
    'KİBRİTÇİ A.Ş. — SAHA GÜN SONU FAALİYET RAPORU',
    `Tarih: ${dk.split('-').reverse().join('.')}`,
    `Gönderen: ${options.olusturanEmail}`,
    `Saha faaliyet: ${ids.length}`,
    `Formen kaynaklı: ${formenAdet}`,
    options.genelNotlar ? `Görüş: ${options.genelNotlar}` : '',
    '',
    ...options.sahaFaaliyetleri.slice(0, 12).map((f) => {
      const ekip = resolveFaaliyetEkip(f, options.personeller)
        .map((u) => u.adSoyad)
        .join(', ');
      return `• ${f.parsel || '?'}/${f.blok || '?'} · ${f.isEtiketi || '—'} · ${f.isNiteligi || '—'} · ${ekip || '—'}`;
    }),
  ]
    .filter(Boolean)
    .join('\n');

  await saveDocument('mobilGunlukAkisRaporlari', {
    id: akisId,
    tip: 'FORMEN',
    tarih: dk,
    gonderenEmail: options.olusturanEmail,
    ozetMetin,
    sahaFaaliyetSayisi: ids.length,
    durum: 'ONAY BEKLİYOR',
    olusturulma: new Date().toISOString(),
    kaynak: 'FAALIYET_PERSONEL_GUN_SONU',
  });

  return { arsivId, akisId, html };
}
