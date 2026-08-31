import { CariKart, StokKart, StokKartIslem } from '../types/erp';
import { isBirbesanStokArsiv, normalizeImportText } from './cariStokExcelImport';
import { buildKibritciReportHtml } from './kibritciReportTemplate';

const ISLEM_TIP_LABEL: Record<StokKartIslem['islemTipi'], string> = {
  GIRIS: 'Giriş',
  CIKIS: 'Çıkış',
  SAYIM: 'Sayım',
  DEGISIM: 'Değişim',
  DIGER: 'Diğer',
};

const esc = (v: string | number | undefined | null): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const tableStyle =
  'width:100%;border-collapse:collapse;font-size:11px;margin-top:8px';
const thStyle =
  'padding:6px 8px;text-align:left;border:1px solid #cbd5e1;background:#f1f5f9;font-size:10px;text-transform:uppercase';
const tdStyle = 'padding:6px 8px;border:1px solid #e2e8f0;vertical-align:top';

/** Cari karta bağlı stok kartları (BİRBESAN arşiv dahil) */
export const stoklarForCariKart = (cari: CariKart, stoklar: StokKart[]): StokKart[] => {
  const isBirbesan = normalizeImportText(cari.unvan).includes('birbesan');
  return stoklar
    .filter(
      (s) =>
        s.tedarikciCariId === cari.id ||
        (isBirbesan && isBirbesanStokArsiv(s))
    )
    .sort((a, b) => String(a.stokAdi || '').localeCompare(String(b.stokAdi || ''), 'tr-TR'));
};

export const stokIslemleriForCariStoklar = (
  stoklar: StokKart[],
  islemler: StokKartIslem[]
): StokKartIslem[] => {
  const ids = new Set(stoklar.map((s) => s.id));
  return islemler
    .filter((i) => ids.has(i.stokKartId))
    .sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
};

export function buildCariStokTopluYazdirHtml(
  cari: CariKart,
  stoklar: StokKart[],
  islemler: StokKartIslem[]
): string {
  const stokById = new Map(stoklar.map((s) => [s.id, s]));
  const toplamMiktar = stoklar.reduce((sum, s) => sum + Number(s.miktar ?? 0), 0);

  const stokRows = stoklar
    .map(
      (s, idx) => `<tr>
        <td style="${tdStyle};text-align:center">${idx + 1}</td>
        <td style="${tdStyle}"><strong>${esc(s.stokAdi)}</strong><br/><span style="color:#64748b;font-size:10px">${esc(s.stokKodu)}</span></td>
        <td style="${tdStyle}">${esc(s.birim)}</td>
        <td style="${tdStyle};text-align:right;font-weight:600">${Number(s.miktar ?? 0).toLocaleString('tr-TR')}</td>
        <td style="${tdStyle};text-align:right">${s.sonBirimFiyat != null && s.sonBirimFiyat > 0 ? `₺${Number(s.sonBirimFiyat).toLocaleString('tr-TR')}` : '—'}</td>
        <td style="${tdStyle}">${esc(s.sonFiyatTarihi || '—')}</td>
      </tr>`
    )
    .join('');

  const islemRows =
    islemler.length === 0
      ? `<tr><td colspan="7" style="${tdStyle};text-align:center;color:#64748b">Hareket kaydı bulunamadı.</td></tr>`
      : islemler
          .map((i) => {
            const stok = stokById.get(i.stokKartId);
            const tip = ISLEM_TIP_LABEL[i.islemTipi] || i.islemTipi;
            const miktar = Number(i.miktarDegisimi ?? 0);
            const miktarStr =
              i.islemTipi === 'CIKIS'
                ? `-${miktar.toLocaleString('tr-TR')}`
                : miktar.toLocaleString('tr-TR');
            return `<tr>
              <td style="${tdStyle}">${esc(i.tarih)}</td>
              <td style="${tdStyle}"><strong>${esc(stok?.stokAdi || '—')}</strong></td>
              <td style="${tdStyle}">${esc(stok?.birim || '—')}</td>
              <td style="${tdStyle};font-weight:700;color:${i.islemTipi === 'CIKIS' ? '#b91c1c' : '#047857'}">${esc(tip)}</td>
              <td style="${tdStyle};text-align:right;font-weight:600">${esc(miktarStr)}</td>
              <td style="${tdStyle}">${esc(i.belgeNo || '—')}</td>
              <td style="${tdStyle}"><strong>${esc(i.islemBaslik)}</strong><br/><span style="color:#64748b;font-size:10px">${esc(i.islemDetay)}</span></td>
            </tr>`;
          })
          .join('');

  const bodyHtml = `
    <h2 style="font-size:14px;margin:0 0 4px">Stok Kartları Özeti</h2>
    <p style="margin:0 0 8px;font-size:11px;color:#64748b">${stoklar.length} kalem · toplam miktar: ${toplamMiktar.toLocaleString('tr-TR')}</p>
    <table style="${tableStyle}">
      <thead>
        <tr>
          <th style="${thStyle};width:32px">#</th>
          <th style="${thStyle}">Stok Adı</th>
          <th style="${thStyle}">Birim</th>
          <th style="${thStyle};text-align:right">Miktar</th>
          <th style="${thStyle};text-align:right">Son Fiyat</th>
          <th style="${thStyle}">Fiyat Tarihi</th>
        </tr>
      </thead>
      <tbody>${stokRows}</tbody>
    </table>

    <h2 style="font-size:14px;margin:24px 0 4px">Stok Giriş / Çıkış Hareketleri</h2>
    <p style="margin:0 0 8px;font-size:11px;color:#64748b">${islemler.length} hareket kaydı (yeniden eskiye)</p>
    <table style="${tableStyle}">
      <thead>
        <tr>
          <th style="${thStyle}">Tarih</th>
          <th style="${thStyle}">Stok</th>
          <th style="${thStyle}">Birim</th>
          <th style="${thStyle}">İşlem</th>
          <th style="${thStyle};text-align:right">Miktar</th>
          <th style="${thStyle}">Belge No</th>
          <th style="${thStyle}">Açıklama</th>
        </tr>
      </thead>
      <tbody>${islemRows}</tbody>
    </table>
  `;

  return buildKibritciReportHtml({
    title: `${cari.unvan} — Stok & Hareket Raporu`,
    subtitle: 'Toplu stok kartları ve giriş/çıkış hareketleri',
    meta: [
      `Cari Kod: ${cari.kod}`,
      `Cari Unvan: ${cari.unvan}`,
      `Kart Tipi: ${cari.kartTipi}`,
      `Stok Kalemi: ${stoklar.length}`,
      `Hareket Kaydı: ${islemler.length}`,
      `Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`,
    ],
    bodyHtml,
  }).replace(
    '</body>',
    '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body>'
  );
}

export function printCariStokTopluYazdir(
  cari: CariKart,
  stoklar: StokKart[],
  islemler: StokKartIslem[]
): void {
  if (stoklar.length === 0) {
    alert('Bu cari karta bağlı stok kartı bulunamadı.');
    return;
  }
  const html = buildCariStokTopluYazdirHtml(cari, stoklar, islemler);
  const w = window.open('', '_blank');
  if (!w) {
    alert('Yazdırma penceresi açılamadı. Tarayıcı pop-up engelini kontrol edin.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.document.title = `${cari.unvan} Stok Hareketleri`;
}
