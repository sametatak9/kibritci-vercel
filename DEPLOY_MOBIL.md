# Mobil deploy durumu — 1 Eylül 2026

## Sonuç: Production BLOCKED — geçici önizleme CANLI

| Ortam | SHA | Durum |
|-------|-----|-------|
| **Cursor agent (origin)** | `c323243` | ✅ Güncel, push tamam |
| **GitHub main** | `2bb1881` | ❌ 16 commit geride |
| **kibritci-web.vercel.app** | `2bb1881` build | ❌ Eski (`main-DV4nPNuc.js`) |
| **Geçici Vercel önizleme** | `c323243` build | ✅ **ŞİMDİ ÇALIŞIYOR** (~58 dk) |

---

## Hemen kullanın (kod hazır, giriş gerekmez)

**Geçici canlı önizleme** — Grup Köprüsü, Evrak Bağlama, Evrak Etiketleri, maaş IBAN, AI Durumu, SGK düzeltmeleri dahil:

👉 **https://temporary-rapid-iodine-qhorof8.vercel.app**

Doğrulandı: `GrupKopru`, `evrak_baglama`, `Evrak Etiketleri` bundle içinde mevcut.

> Bu URL ~1 saat sonra sona erer. Kalıcı yapmak için aşağıdaki “tek dokunuş” adımına geçin.

---

## Tek dokunuş — Vercel’e bağla (telefondan)

1. Telefonda Vercel hesabınıza giriş yapın (sametatak9).
2. Bu linki açın:  
   **https://vercel.com/claim-deployment?code=6fe42585-1724-4176-a048-ab7ed5cb105c**
3. Deploy’u **kibritci-web** projesine bağlayın veya production domain’i (`kibritci-web.vercel.app`) bu deploy’a yönlendirin.

Alternatif: Cursor sohbetinde **Publish** butonuna dokunun → Vercel’i yeniden bağlayın → production deploy tetiklenir.

---

## Neden production otomatik güncellenmedi?

Agent VM’de **GitHub PAT** ve **Vercel token** yok:

- `git push github main` → kimlik doğrulama yok
- `npx vercel --prod` → token yok
- Cursor origin token → GitHub’da geçersiz
- Anonim Vercel deploy → cron job engeli (geçici deploy için cron kaldırıldı, production domain’e yazılamadı)

**Build:** `npm run build` ✅ geçti.

---

## Kalıcı çözüm (tercihen agent yapar)

Cursor sohbetine **tek mesaj** olarak GitHub Personal Access Token yapıştırın (`repo` yetkisi). Agent:

```bash
git push https://x-access-token:<TOKEN>@github.com/sametatak9/kibritci_web.git main
```

Fast-forward mümkün (force gerekmez). Vercel GitHub bağlantısı varsa `kibritci-web.vercel.app` otomatik güncellenir.

---

## Pakette ne var? (`db15dd2` + `c323243`)

- Grup Köprüsü — SGK giriş/çıkış, Arnavutköy fatura köprüsü
- Evrak Bağlama — ayrı sekme
- Evrak Etiketleri — nitelik grupları
- Maaş IBAN listesi — toplu kopyala + antetli HTML
- AI Durumu admin kartı
- SGK onay düzeltmeleri
- İrsaliye & Fatura çalışma alanı + ana sayfa şantiye nabzı (GitHub ile birleştirildi)

**Firestore canlı verisine dokunmayın** — yalnızca kod deploy’u.
