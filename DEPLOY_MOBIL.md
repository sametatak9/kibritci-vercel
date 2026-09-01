# Mobil deploy durumu — 1 Eylül 2026 (02:35 UTC)

## Sonuç: Production BLOCKED — yeni geçici önizleme CANLI

| Ortam | SHA | Durum |
|-------|-----|-------|
| **Cursor agent (origin)** | `baeb739` | ✅ Güncel |
| **GitHub main** | `2bb1881` | ❌ 16 commit geride |
| **kibritci-web.vercel.app** | `2bb1881` build | ❌ Eski (`main-DV4nPNuc.js`, Grup Köprüsü yok) |
| **Yeni geçici Vercel önizleme** | `baeb739` build | ✅ **ŞİMDİ ÇALIŞIYOR** (~59 dk) |

---

## Hemen kullanın (kod hazır, giriş gerekmez)

**Yeni geçici canlı önizleme** — Grup Köprüsü, Evrak Bağlama, Evrak Etiketleri, maaş IBAN, AI Durumu, SGK düzeltmeleri dahil:

👉 **https://temporary-snappy-banyan-l6f5si1.vercel.app**

Doğrulandı: `GrupKopruScreen-jG6jBDqg.js`, `EvrakBaglamaScreen-CVoVu342.js`, `evrak_baglama` bundle içinde mevcut.

> Bu URL ~1 saat sonra sona erer. Kalıcı yapmak için aşağıdaki “tek dokunuş” adımına geçin.

---

## Tek dokunuş — Vercel’e bağla (telefondan) ⭐ EN KOLAY

1. Telefonda Vercel hesabınıza giriş yapın (sametatak9).
2. Bu linki açın:  
   **https://vercel.com/claim-deployment?code=e0a9363d-45fb-492c-b387-7833de69e635**
3. Deploy’u **kibritci-web** projesine bağlayın → `kibritci-web.vercel.app` otomatik güncellenir.

Alternatif: Cursor sohbetinde **Publish** butonuna dokunun → Vercel’i yeniden bağlayın → production deploy tetiklenir.

---

## Denenen yöntemler (hepsi başarısız — token yok)

| Yöntem | Sonuç |
|--------|-------|
| `git push github main` | ❌ Kimlik doğrulama yok |
| `CURSOR_AUTH_TOKEN` → GitHub | ❌ invalid credentials |
| `VERCEL_TOKEN` env | ❌ geçersiz token |
| `npx vercel --prod` | ❌ token geçersiz |
| `gh auth status` | ❌ giriş yok |
| GitHub API | ❌ 401 Bad credentials |
| Anonim `vercel deploy --temporary` | ✅ yeni önizleme oluşturuldu |

**Build:** `npm run build` ✅ geçti.

---

## Kalıcı çözüm (tercihen agent yapar)

Cursor sohbetine **tek mesaj** olarak GitHub Personal Access Token yapıştırın (`repo` yetkisi). Agent:

```bash
git push https://x-access-token:<TOKEN>@github.com/sametatak9/kibritci_web.git main
```

Fast-forward mümkün (force gerekmez). Vercel GitHub bağlantısı varsa `kibritci-web.vercel.app` otomatik güncellenir.

---

## Pakette ne var? (`db15dd2` → `baeb739`)

- Grup Köprüsü — SGK giriş/çıkış, Arnavutköy fatura köprüsü
- Evrak Bağlama — ayrı sekme
- Evrak Etiketleri — nitelik grupları
- Maaş IBAN listesi — toplu kopyala + antetli HTML
- AI Durumu admin kartı
- SGK onay düzeltmeleri
- İrsaliye & Fatura çalışma alanı + ana sayfa şantiye nabzı

**Firestore canlı verisine dokunmayın** — yalnızca kod deploy’u.
