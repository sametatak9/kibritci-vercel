import { SatinAlmaTalebi } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';

export type SatinAlmaReportLinkedIrsaliye = {
  irsaliyeNo: string;
  tarih?: string;
  kalemOzet?: string;
};

/** Satın alma PO HTML raporu (önizleme, e-posta, public paylaşım). */
export function buildSatinAlmaReportHtml(
  sa: Pick<
    SatinAlmaTalebi,
    | 'saId'
    | 'tarih'
    | 'talepEden'
    | 'cariFirma'
    | 'aciklama'
    | 'onayDurumu'
    | 'kalemler'
    | 'eImzalar'
  >,
  opts?: {
    linkedIrsaliyeler?: SatinAlmaReportLinkedIrsaliye[];
  }
): string {
  const kalemler = sa.kalemler || [];
  const linked = opts?.linkedIrsaliyeler || [];
  const donusturuldu = linked.length > 0;
  const poExtraCss = `
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:25px}
      .info-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;font-size:11px}
      .info-card h4{margin:0 0 8px;color:#1e3a8a;border-bottom:1px solid #cbd5e1;padding-bottom:4px;font-size:12px}
      .items-table{width:100%;border-collapse:collapse;margin-top:10px}
      .items-table th{background-color:#1e3a8a;color:#fff;padding:10px;text-align:left;font-size:11px}
      .items-table td{border-bottom:1px solid #e2e8f0;padding:10px;font-size:11px}
      .signatures-title{margin-top:30px;font-size:11px;font-weight:bold;color:#1e3a8a;border-bottom:2px dashed #cbd5e1;padding-bottom:5px}
      .signatures-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:15px}
      .sig-col{border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;font-size:10px;min-height:90px}
      .sig-title{font-weight:bold;color:#475569;display:block;margin-bottom:8px}
      .e-imza-bar{margin-top:20px;font-size:9px;color:#059669;font-weight:bold;background:#ecfdf5;border:1px solid #a7f3d0;padding:8px;border-radius:8px}
      .donusum-bar{margin:0 0 18px;padding:10px 12px;border-radius:10px;border:1px solid #c4b5fd;background:#f5f3ff;font-size:11px;color:#5b21b6}
      .donusum-bar strong{display:block;margin-bottom:4px;font-size:12px}
    `;
  const donusumHtml = donusturuldu
    ? `<div class="donusum-bar"><strong>İRSALİYEYE DÖNÜŞTÜRÜLDÜ</strong>Bu siparişten üretilen sevk irsaliyesi: ${linked
        .map(
          (ir) =>
            `${ir.irsaliyeNo}${ir.tarih ? ` (${ir.tarih})` : ''}${
              ir.kalemOzet ? ` — ${ir.kalemOzet}` : ''
            }`
        )
        .join('; ')}</div>`
    : `<div class="donusum-bar" style="border-color:#fcd34d;background:#fffbeb;color:#92400e"><strong>İRSALİYE BEKLİYOR</strong>Bu sipariş henüz irsaliyeye dönüştürülmedi.</div>`;
  const innerBody = `
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">SATIN ALMA SİPARİŞİ / PO FORMU</h2>
          ${donusumHtml}
          <div class="info-grid">
            <div class="info-card"><h4>📋 SİPARİŞ BİLGİLERİ</h4><p><strong>Belge Tarihi:</strong> ${sa.tarih}</p><p><strong>Onay Durumu:</strong> ${sa.onayDurumu}</p><p><strong>Talep Eden:</strong> ${sa.talepEden || '-'}</p></div>
            <div class="info-card"><h4>🏗️ TEDARİKÇİ / ŞANTİYE</h4><p><strong>Firma:</strong> ${sa.cariFirma}</p><p><strong>Açıklama/Not:</strong> ${sa.aciklama || 'Belirtilmemiş'}</p></div>
          </div>
          <table class="items-table"><thead><tr><th>Malzeme / Ürün Adı</th><th>Sipariş Miktarı</th><th>Marka / Üretici</th><th>Kullanılacak Yer</th></tr></thead><tbody>
              ${kalemler.map((x) => `<tr><td>${x.urunAdi}</td><td>${x.miktar} ${x.birim}</td><td>${x.marka || 'Belirtilmemiş'}</td><td>${x.kullanilacakYer || 'Genel Şantiye'}</td></tr>`).join('')}
          </tbody></table>
          <div class="signatures-title">🖋️ ONAY VE İMZA KANALLARI</div>
          <div class="signatures-grid">
            <div class="sig-col"><span class="sig-title">Talep Eden</span><span style="color:#94a3b8;font-style:italic;">İmza Bekleniyor</span></div>
            <div class="sig-col"><span class="sig-title">Muhasebe</span><span style="color:#94a3b8;font-style:italic;">İmza Bekleniyor</span></div>
            <div class="sig-col"><span class="sig-title">Satın Alma Md.</span><span style="color:#94a3b8;font-style:italic;">İmza Bekleniyor</span></div>
            <div class="sig-col"><span class="sig-title">Şantiye Şefi</span><span style="color:#94a3b8;font-style:italic;">İmza Bekleniyor</span></div>
            <div class="sig-col"><span class="sig-title">Proje Müdürü</span><span style="color:#94a3b8;font-style:italic;">İmza Bekleniyor</span></div>
          </div>
          ${sa.eImzalar && sa.eImzalar.length > 0 ? `<div class="e-imza-bar">🛡️ DİJİTAL E-İMZA KANIT ZİNCİRİ:<br/>${sa.eImzalar.map((im) => `• ${im}`).join('<br/>')}</div>` : ''}
    `;
  return wrapCorporateReportHtml(innerBody, {
    docCode: `BELGE NO: ${sa.saId}`,
    orientation: 'portrait',
    title: `Kibritçi İnşaat - PO: ${sa.saId}`,
    extraCss: poExtraCss,
    autoPrint: false,
    letterhead: true,
  });
}
