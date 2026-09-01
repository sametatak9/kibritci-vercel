# Kibritçi İnşaat ERP

Kibritçi İnşaat şantiye yönetim uygulaması. React 19 + Vite 6 arayüzü ve Express API aynı Node sürecinde çalışır.

Kaynak depo: [sametatak9/kibritci_web](https://github.com/sametatak9/kibritci_web)  
Canlı: [kibritci-web.vercel.app](https://kibritci-web.vercel.app)

## Yerelde çalıştırma

**Gereksinim:** Node.js 20–22 (`nvm` kullanıyorsanız `.node-version` yeter).

```bash
npm install
npm run dev
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde açılır. Portu değiştirmek için `PORT` kullanın:

```bash
PORT=43147 npm run dev
```

İsteğe bağlı sırlar `.env.local` içine konur (şablon: `.env.example`). Tanımlı değilse istemci `firebase-applet-config.json` ile bağlanır.

- `GEMINI_API_KEY` — belge ayrıştırma ve sohbet. Yoksa yalnızca AI kapanır.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — kurucu/admin uçları (`/api/auth/*`). Yoksa normal e-posta/şifre girişi çalışır.

## Derleme ve üretim

```bash
npm run lint          # tsc --noEmit
npm run build         # Vite + Express (Vercel API dahil)
npm start             # dist/server.cjs
```

Vercel `vercel.json` ile `dist` çıktısını ve `api/[...path].js` fonksiyonunu kullanır.

## Uyarı

Firebase yapılandırması canlı `kibritci-erp` projesine işaret eder. Yerel geliştirmede gerçek şirket verisine yazmamaya dikkat edin.
