import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

export function isSiparisRequestPath(reqPath: string): boolean {
  const p = String(reqPath || '').toLowerCase().replace(/\/+$/, '') || '/';
  return p === '/siparis' || p === '/siparis.html';
}

function findSiparisHtmlFile(distPath: string): string | null {
  const candidates = [
    path.join(distPath, 'siparis.html'),
    path.join(process.cwd(), 'dist', 'siparis.html'),
    path.join(process.cwd(), 'siparis.html'),
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

/** React paketi yoksa bile ERP'yi açmayan yalın form — Firebase/App.tsx yok. */
export function siparisFallbackHtml(): string {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Kibritçi · Malzeme Siparişi</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; margin:0; padding:24px; }
    .box { max-width:640px; margin:0 auto; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:20px; }
    h1 { font-size:18px; margin:0 0 12px; }
    label { display:block; font-size:12px; font-weight:700; margin:12px 0 4px; color:#94a3b8; }
    input, textarea { width:100%; box-sizing:border-box; padding:10px; border-radius:10px; border:1px solid #475569; background:#0f172a; color:#fff; }
    button { margin-top:16px; width:100%; padding:12px; border:0; border-radius:12px; background:#f59e0b; color:#0f172a; font-weight:800; cursor:pointer; }
    .ok { color:#6ee7b7; margin-top:12px; }
    .err { color:#fda4af; margin-top:12px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Malzeme siparişi</h1>
    <p style="font-size:13px;color:#94a3b8">Üyelik gerekmez. Kayıt onay havuzuna düşer. Personel / yoklama verisine dokunulmaz.</p>
    <form id="f">
      <label>Ad soyad</label>
      <input name="personelAdSoyad" required minlength="3" maxlength="80" />
      <label>Kullanılacak yer</label>
      <input name="kullanilacakYer" required minlength="3" maxlength="400" />
      <label>Malzeme (her satır: ad, miktar, birim)</label>
      <textarea name="kalemler" rows="5" required placeholder="Çimento, 10, TON"></textarea>
      <button type="submit">Siparişi gönder</button>
    </form>
    <div id="msg"></div>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = document.getElementById('msg');
      msg.className = '';
      msg.textContent = 'Gönderiliyor…';
      var fd = new FormData(e.target);
      var kalemler = String(fd.get('kalemler') || '').split(/\\n/).map(function (line, i) {
        var parts = line.split(',').map(function (s) { return s.trim(); });
        return { id: 'sipk_' + Date.now() + '_' + i, urunAdi: parts[0] || '', miktar: Number(parts[1]) || 0, birim: parts[2] || 'ADET' };
      }).filter(function (k) { return k.urunAdi && k.miktar > 0; });
      try {
        var res = await fetch('/api/public/saha-siparis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personelAdSoyad: fd.get('personelAdSoyad'),
            kullanilacakYer: fd.get('kullanilacakYer'),
            kalemler: kalemler
          })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || 'Kayıt başarısız');
        msg.className = 'ok';
        msg.textContent = 'Alındı: ' + ((data.siparis && data.siparis.siparisNo) || 'sipariş kaydedildi');
        e.target.reset();
      } catch (err) {
        msg.className = 'err';
        msg.textContent = err && err.message ? err.message : String(err);
      }
    });
  </script>
</body>
</html>`;
}

export function sendSiparisHtml(res: Response, distPath: string): void {
  const file = findSiparisHtmlFile(distPath);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (file) {
    res.sendFile(file);
    return;
  }
  res.status(200).type('html').send(siparisFallbackHtml());
}

export function siparisPageMiddleware(distPath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!isSiparisRequestPath(req.path)) return next();
    sendSiparisHtml(res, distPath);
  };
}
