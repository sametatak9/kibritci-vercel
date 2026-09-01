# Kibritçi İnşaat — Şantiye ERP (`kibritci-web`)

Kibritçi İnşaat şantiye yönetim portalı: personel, yoklama, kamp, kasa, evrak, satın alma ve saha faaliyetleri. Veriler **Firebase / Firestore (`kibritci-erp`)** üzerindedir.

Kaynak depo: [sametatak9/kibritci_web](https://github.com/sametatak9/kibritci_web)  
Canlı: [kibritci-web.vercel.app](https://kibritci-web.vercel.app)

## Render → Vercel

| Eski | Yeni |
| --- | --- |
| `https://kibritci-web.onrender.com` (askıda) | `https://kibritci-web.vercel.app` |
| Render Web Service | Vercel static + `/api` serverless |
| Firestore `personeller`, `yoklamalar` | Aynı `kibritci-erp` projesi — veri taşınmaz, yerinde kalır |

Personel ve yoklama kayıtları Render diskinde değildi. Aynı Firebase projesine bağlanan her Vercel deploy'u mevcut kadroyu ve yoklamayı görür. Seed / import scriptleri canlı veriye **çalıştırılmaz**.

## Yerel çalıştırma

**Gereksinim:** Node.js 20–22 (`nvm` kullanıyorsanız `.node-version` yeter).

```bash
npm install
cp .env.example .env.local   # isteğe bağlı; yoksa firebase-applet-config.json kullanılır
npm run dev
```

Geliştirme sunucusu varsayılan olarak `http://localhost:3000` (veya `PORT`).

## Vercel ortam değişkenleri

Zorunlu değil (istemci `firebase-applet-config.json` ile `kibritci-erp`'ye bağlanır). AI, cron ve admin için:

- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `CRON_SECRET`

Akvizyon nöbet kapanışı: her gün 18:00 UTC (21:00 İstanbul) → `GET /api/cron/akvizyon-nobet-kapat`.

## Grup Köprüsü (SGK + Arnavutköy fatura)

WhatsApp grubunu program dinleyemez (resmi API mevcut gruba bot olarak giremez). Köprü şöyle işler:

1. **SGK giriş:** Kimlik + görev (yoklama) + giriş tarihi forma yazılır, sabit metin gruba atılır, `personelGirisTalepleri` kuyruğu açılır. SGK evrakı gelince buraya bırakılır; grup bildirimi yoksa işlem durur. **Personel kartı Grup Köprüsü'nden yazılmaz.** Evrak, talebe bağlanır ve **Onay → Personel oluşturma** kuyruğuna düşer. Tek insan onayı orada `upsertPersonelAvoidDuplicate` ile Ana Firma kaydını açar.
2. **SGK çıkış:** Personel + çıkış tarihi gruba bildirilir (`personelCikisTalepleri`). Çıkış evrakı talebe bağlanır; kart ancak Onay → Personel giriş-çıkış'ta pasife alınır.
3. **Arnavutköy fatura:** WhatsApp grubunu program dinlemez; faturayı buraya bırakın. Yükleme → yapay zeka okuma → açık irsaliye önerisi (firma / ünvan) → kaydet. Kayıt **Fatura Girişi** arşivine düşer (`Arnavutköy köprü` süzgeci). İsteğe bağlı aynı anda **Evrak Etiketleri** grubuna (mevcut veya yeni ad) fatura + eşleşen irsaliyeler eklenir. Personel yazılmaz.

## Evrak bağlama

Satın alma, irsaliye ve fatura **oluşturma** sekmeleri yalın tutulur (belge yaz, listele, raporla). Karşılaştırma ve zincir bağlama **Evrak Bağlama** sekmesindedir: SA ↔ irsaliye ↔ fatura esnek seçilir.

## Evrak etiketleri

Adlandırılmış klasör / etiket (İnce, Mıcır, Demir…). Kullanıcı oluşturur; Firestore `evrakEtiketGruplari` koleksiyonunda saklanır. Her grubun altında satın alma, irsaliye ve fatura satırları **kalem özeti** (ürün + miktar + birim) ile durur — nitelik takibi içindir.

Evrak Bağlama zincir ID'lerinden ayrıdır: bağlama evrakları birbirine kilitler; etiket aynı cinsi bir isim altında toplar. Kenar çubuğunda Evrak Bağlama'nın yanında **Evrak Etiketleri**. Grup Köprüsü fatura kaydında da mevcut gruba ekleme veya yeni ad yazma vardır.

## Maaş IBAN listesi

Satır satır IBAN kopyalama yoktur. Maaş Hesaplama ve Maaş Ödeme'de **Tüm liste IBAN kopyala** (Ad Soyad, TC, görev, IBAN) ve antetli / logolu HTML IBAN listesi vardır.

## Kapı evrakı (Güvenlik)

Ana Firma evrakı genelde **fatura** veya **irsaliye**dir. Güvenlik sekmesinde fotoğraf veya PDF yüklenir; fotoğraftan taranmış PDF otomatik oluşur ve Firebase Storage'a yazılır. Kayıt hem kapı defterinde hem Fatura / İrsaliye sekmelerinde görünür (`Tarama` ile açılır). Taşeron evrakı ayrı akar; yönetici onayı Ana Firma için geçerlidir.

## Derleme ve üretim

```bash
npm run lint          # tsc --noEmit
npm run build         # Vite + Express (Vercel API dahil)
npm start             # dist/server.cjs
```

Vercel `vercel.json` ile `dist` çıktısını ve `api/[...path].js` fonksiyonunu kullanır.

## Sağlık

- `GET /api/health` — sunucu ayakta
- `GET /api/public/siparis-health` — üyeliksiz sipariş formu

## Uyarı

Firebase yapılandırması canlı `kibritci-erp` projesine işaret eder. Yerel geliştirmede gerçek şirket verisine yazmamaya dikkat edin.
