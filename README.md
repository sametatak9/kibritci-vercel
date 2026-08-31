# Kibritçi İnşaat — Şantiye ERP (`kibritci-web`)

Kibritçi İnşaat şantiye yönetim portalı: personel, yoklama, kamp, kasa, evrak, satın alma ve saha faaliyetleri. Veriler **Firebase / Firestore (`kibritci-erp`)** üzerindedir; Render yalnızca Node sunucusuydu.

## Render → Vercel

| Eski | Yeni |
| --- | --- |
| `https://kibritci-web.onrender.com` (askıda) | `https://kibritci-web.vercel.app` |
| Render Web Service | Vercel static + `/api` serverless |
| Firestore `personeller`, `yoklamalar` | Aynı `kibritci-erp` projesi — veri taşınmaz, yerinde kalır |

Personel ve yoklama kayıtları Render diskinde değildi. Aynı Firebase projesine bağlanan her Vercel deploy’u mevcut kadroyu ve yoklamayı görür. Seed / import scriptleri canlı veriye **çalıştırılmaz**.

## Yerel çalıştırma

```bash
npm install
cp .env.example .env.local   # isteğe bağlı; yoksa firebase-applet-config.json kullanılır
npm run dev
```

Geliştirme sunucusu varsayılan olarak `http://localhost:3000` (veya `PORT`).

## Vercel ortam değişkenleri

Zorunlu değil (istemci `firebase-applet-config.json` ile `kibritci-erp`’ye bağlanır). AI, cron ve admin için:

- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `CRON_SECRET`

Akvizyon nöbet kapanışı: her gün 18:00 UTC (21:00 İstanbul) → `GET /api/cron/akvizyon-nobet-kapat`.

## Kapı evrakı (Güvenlik)

Ana Firma evrakı genelde **fatura** veya **irsaliye**dir. Güvenlik sekmesinde fotoğraf veya PDF yüklenir; fotoğraftan taranmış PDF otomatik oluşur ve Firebase Storage’a yazılır. Kayıt hem kapı defterinde hem Fatura / İrsaliye sekmelerinde görünür (`Tarama` ile açılır). Taşeron evrakı ayrı akar; yönetici onayı Ana Firma için geçerlidir.

## Sağlık

- `GET /api/health` — sunucu ayakta
- `GET /api/public/siparis-health` — üyeliksiz sipariş formu
