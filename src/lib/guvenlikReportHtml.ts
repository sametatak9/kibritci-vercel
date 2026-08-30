export const generateGuvenlikReportHtml = (
  islemTarihi: string,
  personelLoglar: any[],
  araclar: any[],
  ziyaretciler: any[],
  evraklar: any[],
  vardiya: 'GUNDUZ' | 'GECE' | 'TAM_GUN' = 'TAM_GUN'
): string => {
  const KIBRITCI_LOGO_BASE64 = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgMTAwIiBmaWxsPSJub25lIj4KICA8cGF0aCBkPSJNMzAgODBMNzAgMjBMMTEwIDgwSDMwWiIgZmlsbD0iI0Y1OTUwNiIvPgogIDxwYXRoIGQ9Ik03MCAyMEwxMTAgODBIMzBMMzAgODBMMzAgODBMMzAgODBaIiBmaWxsPSIjRjU5NTA2IiBmaWxsLW9wYWNpdHk9IjAuMSIvPgogIDx0ZXh0IHg9IjE0MCIgeT0iNzAiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjU1IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzFFMjkyQiI+S0k8dHNwYW4gZmlsbD0iI0Y1OTUwNiI+QjwvdHNwYW4+UklUQ8SwPC90ZXh0Pgo8L3N2Zz4=`;

  const dateFormatted = new Date(islemTarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const vardiyaLabel = 
    vardiya === 'GUNDUZ' ? 'GÜNDÜZ VARDİYASI (08:00 - 20:00)' :
    vardiya === 'GECE' ? 'GECE VARDİYASI (20:00 - 08:00)' :
    'TÜM GÜN RAPORU';

  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Güvenlik Raporu - ${dateFormatted} (${vardiyaLabel})</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
      body {
        font-family: 'Inter', sans-serif;
        color: #1e293b;
        margin: 0;
        padding: 40px;
        background-color: white;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 3px solid #f59e0b;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      .logo img {
        height: 60px;
      }
      .report-title {
        text-align: right;
      }
      .report-title h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        text-transform: uppercase;
        color: #0f172a;
      }
      .report-title p {
        margin: 5px 0 0 0;
        font-size: 14px;
        color: #64748b;
        font-weight: 600;
      }
      .section-title {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
        margin-top: 30px;
        margin-bottom: 10px;
        background-color: #f8fafc;
        padding: 10px 15px;
        border-left: 4px solid #f59e0b;
        border-radius: 4px;
        text-transform: uppercase;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 11px;
      }
      th {
        background-color: #f1f5f9;
        color: #475569;
        font-weight: 800;
        text-transform: uppercase;
        padding: 8px;
        text-align: left;
        border-bottom: 2px solid #cbd5e1;
      }
      td {
        padding: 8px;
        border-bottom: 1px solid #e2e8f0;
        color: #334155;
      }
      .footer {
        margin-top: 50px;
        text-align: center;
        font-size: 10px;
        color: #94a3b8;
        border-top: 1px solid #e2e8f0;
        padding-top: 20px;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="logo">
        <img src="${KIBRITCI_LOGO_BASE64}" alt="Kibritçi Logo" />
      </div>
      <div class="report-title">
        <h1>GÜVENLİK RAPORU</h1>
        <p>${vardiyaLabel}</p>
        <p>Tarih: ${dateFormatted}</p>
      </div>
    </div>
  `;

  // 1. Ziyaretçiler Tablosu
  html += `
    <div class="section-title">1. ZİYARETÇİ KAYITLARI (\${ziyaretciler.length})</div>
    <table>
      <thead>
        <tr>
          <th>Ad Soyad</th>
          <th>Firma</th>
          <th>Ziyaret Nedeni</th>
          <th>Görüşülen Yetkili</th>
          <th>Giriş Saati</th>
          <th>Çıkış Saati</th>
        </tr>
      </thead>
      <tbody>
  `;
  if (ziyaretciler.length === 0) {
    html += `<tr><td colspan="6" style="text-align: center; font-style: italic;">Kayıt bulunamadı.</td></tr>`;
  } else {
    ziyaretciler.forEach(z => {
      const giris = z.girisZamani ? new Date(z.girisZamani).toLocaleTimeString('tr-TR') : '-';
      const cikis = z.cikisZamani ? new Date(z.cikisZamani).toLocaleTimeString('tr-TR') : '-';
      html += `
        <tr>
          <td><strong>\${z.adSoyad || ''}</strong></td>
          <td>\${z.firma || ''}</td>
          <td>\${z.ziyaretSebebi || ''}</td>
          <td>\${z.ziyaretEdilen || ''}</td>
          <td>\${giris}</td>
          <td>\${cikis}</td>
        </tr>
      `;
    });
  }
  html += `</tbody></table>`;

  // 2. Araç Kayıtları Tablosu
  html += `
    <div class="section-title">2. ARAÇ GİRİŞ-ÇIKIŞ KAYITLARI (\${araclar.length})</div>
    <table>
      <thead>
        <tr>
          <th>Plaka</th>
          <th>Sürücü</th>
          <th>Firma / Tür</th>
          <th>Yük / Nedeni</th>
          <th>Giriş Saati</th>
          <th>Çıkış Saati</th>
        </tr>
      </thead>
      <tbody>
  `;
  if (araclar.length === 0) {
    html += `<tr><td colspan="6" style="text-align: center; font-style: italic;">Kayıt bulunamadı.</td></tr>`;
  } else {
    araclar.forEach(a => {
      const giris = a.girisZamani ? new Date(a.girisZamani).toLocaleTimeString('tr-TR') : '-';
      const cikis = a.cikisZamani ? new Date(a.cikisZamani).toLocaleTimeString('tr-TR') : '-';
      html += `
        <tr>
          <td><strong>\${a.plaka || ''}</strong></td>
          <td>\${a.surucuAdi || ''}</td>
          <td>\${a.firma || ''} (\${a.aracTipi || ''})</td>
          <td>\${a.yukDurumu || ''} (\${a.aciklama || ''})</td>
          <td>\${giris}</td>
          <td>\${cikis}</td>
        </tr>
      `;
    });
  }
  html += `</tbody></table>`;

  // 3. Gelen Evraklar Tablosu
  html += `
    <div class="section-title">3. TESLİM ALINAN EVRAKLAR (\${evraklar.length})</div>
    <table>
      <thead>
        <tr>
          <th>Evrak Türü</th>
          <th>Evrak No</th>
          <th>Firma</th>
          <th>Kayıt Saati</th>
          <th>Durum</th>
        </tr>
      </thead>
      <tbody>
  `;
  if (evraklar.length === 0) {
    html += `<tr><td colspan="5" style="text-align: center; font-style: italic;">Kayıt bulunamadı.</td></tr>`;
  } else {
    evraklar.forEach(e => {
      html += `
        <tr>
          <td><strong>\${e.evrakTuru || ''}</strong></td>
          <td>\${e.evrakNo || ''}</td>
          <td>\${e.firma || ''}</td>
          <td>\${e.saat || '-'}</td>
          <td>\${e.durum || ''}</td>
        </tr>
      `;
    });
  }
  html += `</tbody></table>`;

  // 4. Personel Logları Tablosu
  html += `
    <div class="section-title">4. PERSONEL GİRİŞ-ÇIKIŞ (\${personelLoglar.length})</div>
    <table>
      <thead>
        <tr>
          <th>Personel Adı</th>
          <th>Görev</th>
          <th>İşlem</th>
          <th>Saat</th>
        </tr>
      </thead>
      <tbody>
  `;
  if (personelLoglar.length === 0) {
    html += `<tr><td colspan="4" style="text-align: center; font-style: italic;">Kayıt bulunamadı.</td></tr>`;
  } else {
    personelLoglar.forEach(p => {
      const saat = p.zaman ? new Date(p.zaman).toLocaleTimeString('tr-TR') : '-';
      html += `
        <tr>
          <td><strong>\${p.ad || ''} \${p.soyad || ''}</strong></td>
          <td>\${p.gorev || ''}</td>
          <td style="color: \${p.tip === 'GİRİŞ' ? 'green' : 'red'}; font-weight: bold;">\${p.tip || ''}</td>
          <td>\${saat}</td>
        </tr>
      `;
    });
  }
  html += `</tbody></table>`;

  html += `
    <div class="footer">
      Bu belge KIBRITCI ERP sistemi tarafından otomatik oluşturulmuştur. <br/>
      Rapor Oluşturma Zamanı: \${new Date().toLocaleString('tr-TR')}
    </div>
  </body>
  </html>
  `;

  return html;
};
