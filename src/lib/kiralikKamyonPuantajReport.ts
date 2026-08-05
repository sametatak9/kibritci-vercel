import type { AracBakim, KiralikKamyonPuantajKaydi } from '../types/erp';
import {
  buildKibritciReportHtml,
  downloadKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';
import { loadKibritciReportAssets } from './kibritciBrand';

function isKiralikKamyonArac(a?: AracBakim | null): boolean {
  if (!a) return false;
  if (a.kiralikKamyon === true) return true;
  return a.mulkiyet === 'KIRALIK';
}
const AY_ADLARI = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const esc = (v: string | number | undefined | null): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function parsePeriod(periodYm: string): { year: number; month: number; label: string } {
  const [ys, ms] = String(periodYm || '').split('-');
  const year = Number(ys) || new Date().getFullYear();
  const month = Number(ms) || new Date().getMonth() + 1;
  const label = `${AY_ADLARI[month - 1] || month} ${year}`;
  return { year, month, label };
}

export type KiralikKamyonAyOzetSatir = {
  aracId: string;
  plaka: string;
  markaModel: string;
  geldi: number;
  yok: number;
  girilmedi: number;
  toplamMesai: number;
  soforler: string[];
};

/** Seçilen ay için araç bazlı özet (geldi / yok / mesai). */
export function buildKiralikKamyonAyOzeti(
  kayitlar: KiralikKamyonPuantajKaydi[],
  araclar: AracBakim[],
  periodYm: string
): KiralikKamyonAyOzetSatir[] {
  const prefix = periodYm.slice(0, 7);
  const { year, month } = parsePeriod(prefix);
  const gunSayisi = daysInMonth(year, month);

  const kamyonlar = araclar
    .filter((a) => isKiralikKamyonArac(a))
    .sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'));

  const byArac = new Map<string, KiralikKamyonPuantajKaydi[]>();
  for (const k of kayitlar) {
    if (!String(k.tarih || '').startsWith(prefix)) continue;
    const list = byArac.get(k.aracId) || [];
    list.push(k);
    byArac.set(k.aracId, list);
  }

  const ids = new Set<string>([
    ...kamyonlar.map((a) => a.id),
    ...[...byArac.keys()],
  ]);

  const rows: KiralikKamyonAyOzetSatir[] = [];
  for (const aracId of ids) {
    const arac = kamyonlar.find((a) => a.id === aracId);
    const list = byArac.get(aracId) || [];
    if (!arac && list.length === 0) continue;

    const plaka = arac?.plaka || list[0]?.plaka || aracId;
    const markaModel = arac?.markaModel || list[0]?.markaModel || '—';
    let geldi = 0;
    let yok = 0;
    let toplamMesai = 0;
    const soforSet = new Set<string>();
    const kayitGunleri = new Set<string>();

    for (const k of list) {
      kayitGunleri.add(k.tarih);
      if (k.durum === 'Geldi') {
        geldi += 1;
        toplamMesai += Number(k.mesaiSaati) || 0;
        if (k.soforAdi) soforSet.add(k.soforAdi.trim());
      } else if (k.durum === 'Yok') {
        yok += 1;
      }
    }

    rows.push({
      aracId,
      plaka,
      markaModel,
      geldi,
      yok,
      girilmedi: Math.max(0, gunSayisi - kayitGunleri.size),
      toplamMesai,
      soforler: [...soforSet].sort((a, b) => a.localeCompare(b, 'tr')),
    });
  }

  return rows.sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'));
}

function durumBadge(durum: string): string {
  if (durum === 'Geldi') {
    return '<span style="color:#047857;font-weight:800">Geldi</span>';
  }
  if (durum === 'Yok') {
    return '<span style="color:#be123c;font-weight:800">Yok</span>';
  }
  return '<span style="color:#94a3b8">—</span>';
}

export async function buildKiralikKamyonPuantajReportHtml(
  kayitlar: KiralikKamyonPuantajKaydi[],
  araclar: AracBakim[],
  periodYm: string
): Promise<string> {
  const prefix = periodYm.slice(0, 7);
  const { year, month, label } = parsePeriod(prefix);
  const gunSayisi = daysInMonth(year, month);
  const ozet = buildKiralikKamyonAyOzeti(kayitlar, araclar, prefix);
  const assets = await loadKibritciReportAssets();

  const aylikKayitlar = kayitlar
    .filter((k) => String(k.tarih || '').startsWith(prefix))
    .sort((a, b) => {
      const t = String(a.tarih).localeCompare(String(b.tarih));
      if (t !== 0) return t;
      return String(a.plaka).localeCompare(String(b.plaka), 'tr');
    });

  if (ozet.length === 0 && aylikKayitlar.length === 0) {
    return buildKibritciReportHtml({
      title: 'KİRALIK KAMYON AYLIK PUANTAJ RAPORU',
      subtitle: label,
      meta: [
        `Belge: KBR-KKP-${year}${String(month).padStart(2, '0')}`,
        `Dönem: ${label}`,
        `Oluşturma: ${new Date().toLocaleString('tr-TR')}`,
      ],
      assets,
      bodyHtml:
        '<p style="color:#64748b;font-size:13px">Bu dönem için kiralık kamyon puantaj kaydı bulunamadı. Önce günlük yoklamayı kaydedin.</p>',
    });
  }

  const cell = 'padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;';
  const th =
    'padding:7px 8px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#334155;font-weight:800';

  const toplamGeldi = ozet.reduce((s, r) => s + r.geldi, 0);
  const toplamYok = ozet.reduce((s, r) => s + r.yok, 0);
  const toplamMesai = ozet.reduce((s, r) => s + r.toplamMesai, 0);

  const ozetRows = ozet
    .map(
      (r, i) => `<tr>
        <td style="${cell};text-align:center;width:28px">${i + 1}</td>
        <td style="${cell};font-family:ui-monospace,monospace;font-weight:800">${esc(r.plaka)}</td>
        <td style="${cell}">${esc(r.markaModel)}</td>
        <td style="${cell};text-align:center;color:#047857;font-weight:800">${r.geldi}</td>
        <td style="${cell};text-align:center;color:#be123c;font-weight:800">${r.yok}</td>
        <td style="${cell};text-align:center;color:#64748b">${r.girilmedi}</td>
        <td style="${cell};text-align:right;font-weight:800">${r.toplamMesai.toLocaleString('tr-TR', {
          maximumFractionDigits: 1,
        })} sa</td>
        <td style="${cell};font-size:10px">${esc(r.soforler.join(', ') || '—')}</td>
      </tr>`
    )
    .join('');

  // Plaka × gün matrisi (G / Y / ·)
  const kayitMap = new Map<string, KiralikKamyonPuantajKaydi>();
  for (const k of aylikKayitlar) {
    kayitMap.set(`${k.aracId}|${k.tarih}`, k);
  }

  const dayHeaders = Array.from({ length: gunSayisi }, (_, i) => i + 1)
    .map(
      (d) =>
        `<th style="${th};text-align:center;padding:4px 2px;font-size:8px;min-width:18px">${d}</th>`
    )
    .join('');

  const matrixRows = ozet
    .map((r) => {
      const cells = Array.from({ length: gunSayisi }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');
        const tarih = `${prefix}-${day}`;
        const k = kayitMap.get(`${r.aracId}|${tarih}`);
        let mark = '·';
        let color = '#cbd5e1';
        let title = 'Girilmedi';
        if (k?.durum === 'Geldi') {
          mark = 'G';
          color = '#047857';
          title = `Geldi${k.soforAdi ? ` · ${k.soforAdi}` : ''}${
            k.mesaiSaati ? ` · ${k.mesaiSaati} sa` : ''
          }`;
        } else if (k?.durum === 'Yok') {
          mark = 'Y';
          color = '#be123c';
          title = 'Yok';
        }
        return `<td style="${cell};text-align:center;padding:3px 1px;font-weight:900;font-size:9px;color:${color}" title="${esc(
          title
        )}">${mark}</td>`;
      }).join('');
      return `<tr>
        <td style="${cell};font-family:ui-monospace,monospace;font-weight:800;white-space:nowrap">${esc(
          r.plaka
        )}</td>
        ${cells}
      </tr>`;
    })
    .join('');

  const detayRows = aylikKayitlar
    .filter((k) => k.durum === 'Geldi' || k.durum === 'Yok')
    .map(
      (k) => `<tr>
        <td style="${cell}">${esc(k.tarih)}</td>
        <td style="${cell};font-family:ui-monospace,monospace;font-weight:800">${esc(k.plaka)}</td>
        <td style="${cell}">${esc(k.markaModel || '—')}</td>
        <td style="${cell};text-align:center">${durumBadge(k.durum)}</td>
        <td style="${cell}">${esc(k.soforAdi || '—')}</td>
        <td style="${cell};text-align:right;font-weight:700">${
          k.durum === 'Geldi'
            ? `${(Number(k.mesaiSaati) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`
            : '—'
        }</td>
        <td style="${cell};font-size:10px;color:#64748b">${esc(k.notlar || '—')}</td>
      </tr>`
    )
    .join('');

  const bodyHtml = `
    <section style="margin-bottom:22px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">
          <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Kamyon</div>
          <div style="font-size:18px;font-weight:900;color:#0f172a">${ozet.length}</div>
        </div>
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px 12px">
          <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Geldi (gün·araç)</div>
          <div style="font-size:18px;font-weight:900;color:#047857">${toplamGeldi}</div>
        </div>
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:10px 12px">
          <div style="font-size:9px;font-weight:800;color:#be123c;text-transform:uppercase">Yok (gün·araç)</div>
          <div style="font-size:18px;font-weight:900;color:#be123c">${toplamYok}</div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 12px">
          <div style="font-size:9px;font-weight:800;color:#1d4ed8;text-transform:uppercase">Toplam mesai</div>
          <div style="font-size:18px;font-weight:900;color:#1d4ed8">${toplamMesai.toLocaleString('tr-TR', {
            maximumFractionDigits: 1,
          })} sa</div>
        </div>
      </div>

      <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;color:#1e4e78;letter-spacing:.04em;text-transform:uppercase">1. Araç özeti</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <thead>
          <tr>
            <th style="${th}">#</th>
            <th style="${th}">Plaka</th>
            <th style="${th}">Marka / Model</th>
            <th style="${th};text-align:center">Geldi</th>
            <th style="${th};text-align:center">Yok</th>
            <th style="${th};text-align:center">Girilmedi</th>
            <th style="${th};text-align:right">Mesai</th>
            <th style="${th}">Şoför(ler)</th>
          </tr>
        </thead>
        <tbody>${ozetRows || `<tr><td colspan="8" style="${cell};color:#94a3b8;text-align:center">Kayıt yok</td></tr>`}</tbody>
      </table>
      <p style="margin:4px 0 0;font-size:9px;color:#94a3b8">Girilmedi = ayın ${gunSayisi} gününden henüz yoklama girilmeyen gün sayısı.</p>
    </section>

    <section style="margin-bottom:22px">
      <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;color:#1e4e78;letter-spacing:.04em;text-transform:uppercase">2. Günlük matris (G = Geldi · Y = Yok · · = Girilmedi)</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:640px">
          <thead>
            <tr>
              <th style="${th}">Plaka</th>
              ${dayHeaders}
            </tr>
          </thead>
          <tbody>${matrixRows}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h3 style="margin:0 0 8px;font-size:12px;font-weight:900;color:#1e4e78;letter-spacing:.04em;text-transform:uppercase">3. Günlük detay (geldi / yok)</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="${th}">Tarih</th>
            <th style="${th}">Plaka</th>
            <th style="${th}">Model</th>
            <th style="${th};text-align:center">Durum</th>
            <th style="${th}">Şoför</th>
            <th style="${th};text-align:right">Mesai</th>
            <th style="${th}">Not</th>
          </tr>
        </thead>
        <tbody>
          ${
            detayRows ||
            `<tr><td colspan="7" style="${cell};color:#94a3b8;text-align:center">Bu ay geldi/yok kaydı yok</td></tr>`
          }
        </tbody>
      </table>
    </section>

    <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;min-height:88px;text-align:center">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Hazırlayan</div>
        <div style="margin-top:36px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;padding-top:6px">İmza / Kaşe</div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;min-height:88px;text-align:center">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Kontrol</div>
        <div style="margin-top:36px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;padding-top:6px">İmza / Kaşe</div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;min-height:88px;text-align:center">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Onay</div>
        <div style="margin-top:36px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;padding-top:6px">İmza / Kaşe</div>
      </div>
    </div>
  `;

  return buildKibritciReportHtml({
    title: 'KİRALIK KAMYON AYLIK PUANTAJ RAPORU',
    subtitle: `${label} · Geldi / Yok / Mesai`,
    meta: [
      `Belge: KBR-KKP-${year}${String(month).padStart(2, '0')}`,
      `Dönem: ${label} (${gunSayisi} gün)`,
      `Kamyon: ${ozet.length} · Geldi: ${toplamGeldi} · Yok: ${toplamYok} · Mesai: ${toplamMesai.toLocaleString(
        'tr-TR',
        { maximumFractionDigits: 1 }
      )} sa`,
      `Oluşturma: ${new Date().toLocaleString('tr-TR')}`,
    ],
    assets,
    bodyHtml,
  });
}

export async function openKiralikKamyonPuantajReport(
  kayitlar: KiralikKamyonPuantajKaydi[],
  araclar: AracBakim[],
  periodYm: string
): Promise<void> {
  const html = await buildKiralikKamyonPuantajReportHtml(kayitlar, araclar, periodYm);
  const { label } = parsePeriod(periodYm.slice(0, 7));
  openKibritciReportPrint(html, `Kiralık_Kamyon_Puantaj_${label.replace(/\s+/g, '_')}`);
}

export async function downloadKiralikKamyonPuantajReport(
  kayitlar: KiralikKamyonPuantajKaydi[],
  araclar: AracBakim[],
  periodYm: string
): Promise<void> {
  const html = await buildKiralikKamyonPuantajReportHtml(kayitlar, araclar, periodYm);
  const stamp = periodYm.slice(0, 7);
  downloadKibritciReportHtml(html, `Kiralik_Kamyon_Puantaj_${stamp}.html`);
}
