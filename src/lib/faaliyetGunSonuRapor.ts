/** Gün sonu saha faaliyet raporu — parsel / blok / etiket / personel + foto + yoklama */
import { AylikYoklamaMap, KampFaaliyet, Personel, SahaFaaliyeti, SahaGunRaporArsiv } from '../types/erp';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import { buildDayPersonelRaporu, resolveFaaliyetEkip } from './faaliyetPersonelUtils';
import { ilerlemeDurumuLabel, normalizeFaaliyetEtiketi } from './faaliyetEtiketUtils';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';
import { saveDocument } from './firebase';
import { getYoklamaDay, isIdariPersonel, isTaseronPersonel } from './yoklamaUtils';

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

/** İş etiketi yoksa kaynak ekrandan varsayılan etiket */
function resolveEtiket(f: SahaFaaliyeti): string {
  const explicit = normalizeFaaliyetEtiketi(f.isEtiketi);
  if (explicit) return explicit;
  const k = String(f.kaynakEkran || '').toUpperCase();
  if (k.includes('TESISAT')) return 'TESİSAT';
  if (k.includes('MERMER')) return 'DİĞER';
  if (k.includes('KAMP')) return 'KAMP';
  if (k.includes('FORMEN') || k.includes('GUNLUK')) return 'KABA İNŞAAT';
  return 'ETİKETSİZ';
}

function renderFotoStrip(fotolar: string[]): string {
  if (fotolar.length === 0) {
    return '<span style="color:#94a3b8;font-size:10px">—</span>';
  }
  const imgs = fotolar
    .slice(0, 6)
    .map(
      (url) =>
        `<img src="${escapeHtml(url)}" alt="Foto" style="width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc" />`
    )
    .join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center">${imgs}</div>`;
}

function buildYoklamaSectionHtml(options: {
  dateKey: string;
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  sahaFaaliyetleri: SahaFaaliyeti[];
  kampFaaliyetleri: KampFaaliyet[];
}): string {
  const dk = normalizeDateKey(options.dateKey) || options.dateKey;
  const parts = dk.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];

  const counts = { Geldi: 0, Yok: 0, İzinli: 0, Raporlu: 0, Girilmedi: 0, Diger: 0 };
  const byDurum: Record<string, string[]> = {
    Geldi: [],
    Yok: [],
    İzinli: [],
    Raporlu: [],
  };

  for (const p of options.personeller || []) {
    if (isTaseronPersonel(p) || isIdariPersonel(p)) continue;
    const aktif = p.durum === true || String(p.durum).toLowerCase() === 'true';
    if (!aktif) continue;
    if (String(p.istenCikisTarihi || '').trim()) continue;
    const day = getYoklamaDay(options.yoklamalar[p.id], y, m, d);
    const durum = String(day?.durum || 'Girilmedi');
    const name = `${p.ad} ${p.soyad}`.trim();
    if (durum === 'Geldi') {
      counts.Geldi += 1;
      byDurum.Geldi.push(name);
    } else if (durum === 'Yok') {
      counts.Yok += 1;
      byDurum.Yok.push(name);
    } else if (durum === 'İzinli') {
      counts.İzinli += 1;
      byDurum.İzinli.push(name);
    } else if (durum === 'Raporlu') {
      counts.Raporlu += 1;
      byDurum.Raporlu.push(name);
    } else if (durum === 'Girilmedi' || !day?.durum) {
      counts.Girilmedi += 1;
    } else {
      counts.Diger += 1;
    }
  }

  const personelRapor = buildDayPersonelRaporu(
    options.sahaFaaliyetleri,
    options.kampFaaliyetleri,
    options.personeller,
    dk,
    options.yoklamalar
  );

  const listBlock = (title: string, names: string[], color: string) => {
    if (names.length === 0) return '';
    const chips = names
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .map(
        (n) =>
          `<span style="display:inline-block;margin:2px;padding:2px 7px;border-radius:999px;background:#fff;border:1px solid ${color};font-size:10px;font-weight:600">${escapeHtml(n)}</span>`
      )
      .join('');
    return `<div style="margin-top:8px"><div style="font-size:10px;font-weight:800;color:#334155;margin-bottom:4px">${escapeHtml(title)} (${names.length})</div><div>${chips}</div></div>`;
  };

  return `
    <section style="margin:0 0 20px;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#0f766e;color:#fff;padding:8px 12px;font-size:12px;font-weight:800">
        Günlük yoklama özeti
      </div>
      <div style="padding:12px 14px;background:#f0fdfa">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:10px">
          <div style="background:#fff;border:1px solid #a7f3d0;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Geldi</div>
            <div style="font-size:18px;font-weight:900;color:#065f46">${counts.Geldi}</div>
          </div>
          <div style="background:#fff;border:1px solid #fecdd3;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;font-weight:800;color:#be123c;text-transform:uppercase">Yok</div>
            <div style="font-size:18px;font-weight:900;color:#9f1239">${counts.Yok}</div>
          </div>
          <div style="background:#fff;border:1px solid #bae6fd;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;font-weight:800;color:#0369a1;text-transform:uppercase">İzinli</div>
            <div style="font-size:18px;font-weight:900;color:#075985">${counts.İzinli}</div>
          </div>
          <div style="background:#fff;border:1px solid #ddd6fe;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;font-weight:800;color:#6d28d9;text-transform:uppercase">Raporlu</div>
            <div style="font-size:18px;font-weight:900;color:#5b21b6">${counts.Raporlu}</div>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Faaliyetli</div>
            <div style="font-size:18px;font-weight:900;color:#334155">${personelRapor.personelSayisi}</div>
          </div>
        </div>
        ${listBlock('Yok olanlar', byDurum.Yok, '#fecdd3')}
        ${listBlock('İzinli', byDurum.İzinli, '#bae6fd')}
        ${listBlock('Raporlu', byDurum.Raporlu, '#ddd6fe')}
      </div>
    </section>`;
}

export function buildFaaliyetGunSonuReportHtml(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  personeller: Personel[];
  genelNotlar?: string;
  olusturan?: string;
  yoklamalar?: AylikYoklamaMap;
  kampFaaliyetleri?: KampFaaliyet[];
}): string {
  const dk = normalizeDateKey(options.dateKey) || options.dateKey;
  const dayLabel = formatDateLabelTr(dk);
  const sorted = [...(options.sahaFaaliyetleri || [])].sort((a, b) => {
    const pa = `${a.parsel || ''} ${a.blok || ''}`.localeCompare(
      `${b.parsel || ''} ${b.blok || ''}`,
      'tr'
    );
    if (pa !== 0) return pa;
    const ea = resolveEtiket(a).localeCompare(resolveEtiket(b), 'tr');
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
    const etiket = resolveEtiket(f);
    const key = `${parsel}||${blok}||${etiket}`;
    if (!groups.has(key)) {
      groups.set(key, { key, parsel, blok, etiket, items: [] });
    }
    groups.get(key)!.items.push(f);
  }

  const groupHtml = Array.from(groups.values())
    .map((g) => {
      const cards = g.items
        .map((f, i) => {
          const ekip = resolveFaaliyetEkip(f, options.personeller)
            .map((u) => u.adSoyad)
            .join(', ');
          const yorum = sonIlerlemeYorum(f);
          const fotolar = getFaaliyetFotolar(f);
          return `
            <article style="border:1px solid #e2e8f0;border-top:none;padding:10px 12px;background:#fff;page-break-inside:avoid">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
                <div>
                  <div style="font-size:10px;color:#64748b;font-weight:700">#${i + 1}</div>
                  <div style="font-size:13px;font-weight:800;color:#0f172a">${escapeHtml(f.isNiteligi || '—')}</div>
                  <div style="font-size:11px;color:#334155;margin-top:4px"><strong>Personel:</strong> ${escapeHtml(ekip || '—')}</div>
                  <div style="font-size:10px;color:#64748b;margin-top:2px">İlerleme: ${escapeHtml(ilerlemeDurumuLabel(f.ilerlemeDurumu))}</div>
                </div>
                <span style="font-size:9px;font-weight:800;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:3px 8px;white-space:nowrap">${fotolar.length} foto</span>
              </div>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#1e293b;white-space:pre-wrap">${escapeHtml(yorum || f.aciklama || '—')}</p>
              <div style="margin-top:8px">${renderFotoStrip(fotolar)}</div>
            </article>`;
        })
        .join('');

      return `
        <section style="margin:0 0 18px">
          <div style="background:#1e3a5f;color:#fff;padding:8px 12px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800">
            Parsel ${escapeHtml(g.parsel)} · Blok ${escapeHtml(g.blok)} · ${escapeHtml(g.etiket)}
            <span style="float:right;opacity:.9">${g.items.length} kayıt</span>
          </div>
          ${cards}
        </section>`;
    })
    .join('');

  const notlar = String(options.genelNotlar || '').trim();
  const title = 'SAHA GÜN SONU FAALİYET RAPORU';
  const subtitle = `${dayLabel} · parsel / blok / etiket / personel · fotoğraflı`;

  const yoklamaHtml =
    options.yoklamalar
      ? buildYoklamaSectionHtml({
          dateKey: dk,
          personeller: options.personeller,
          yoklamalar: options.yoklamalar,
          sahaFaaliyetleri: options.sahaFaaliyetleri,
          kampFaaliyetleri: options.kampFaaliyetleri || [],
        })
      : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title} — ${dayLabel}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; color: #0f172a; }
    .page { max-width: 960px; margin: 0 auto; }
    @media print {
      body { padding: 8px; }
      section, article { break-inside: avoid; }
      img { max-height: 80px !important; }
    }
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
    ${yoklamaHtml}
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
  setTimeout(() => w.print(), 700);
}

/** Arşiv + yönetim akış kuyruğuna yazar */
export async function submitFaaliyetGunSonuRapor(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  personeller: Personel[];
  genelNotlar: string;
  olusturanEmail: string;
  yoklamaOzet?: SahaGunRaporArsiv['yoklamaOzet'];
  yoklamalar?: AylikYoklamaMap;
  kampFaaliyetleri?: KampFaaliyet[];
}): Promise<{ arsivId: string; akisId: string; html: string }> {
  const dk = normalizeDateKey(options.dateKey) || options.dateKey;
  const html = buildFaaliyetGunSonuReportHtml({
    dateKey: dk,
    sahaFaaliyetleri: options.sahaFaaliyetleri,
    personeller: options.personeller,
    genelNotlar: options.genelNotlar,
    olusturan: options.olusturanEmail,
    yoklamalar: options.yoklamalar,
    kampFaaliyetleri: options.kampFaaliyetleri,
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
    options.yoklamaOzet
      ? `Yoklama — Geldi/Faaliyetli: ${options.yoklamaOzet.gelen} · Yok: ${options.yoklamaOzet.yok} · İzin: ${options.yoklamaOzet.izinli} · Rapor: ${options.yoklamaOzet.raporlu}`
      : '',
    options.genelNotlar ? `Görüş: ${options.genelNotlar}` : '',
    '',
    ...options.sahaFaaliyetleri.slice(0, 12).map((f) => {
      const ekip = resolveFaaliyetEkip(f, options.personeller)
        .map((u) => u.adSoyad)
        .join(', ');
      return `• ${f.parsel || '?'}/${f.blok || '?'} · ${resolveEtiket(f)} · ${f.isNiteligi || '—'} · ${ekip || '—'}`;
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
