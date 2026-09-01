# Mobil — Gece toplu güncellemeyi canlıya alma

Bu dosya, VM'den GitHub'a doğrudan push yapılamadığında **tek seferde** tüm gece değişikliklerini `github.com/sametatak9/kibritci_web` `main` dalına ve `kibritci-web.vercel.app` üzerine taşımak içindir.

## Pakette ne var?

- **Grup Köprüsü** — SGK giriş/çıkış, Arnavutköy fatura köprüsü
- **Evrak Bağlama** — ayrı sekme, SA ↔ irsaliye ↔ fatura zinciri
- **Evrak Etiketleri** — nitelik grupları (İnce, Mıcır…)
- **Maaş IBAN listesi** — toplu kopyala + antetli HTML
- **AI Durumu** admin kartı
- **SGK onay** düzeltmeleri (Ana Firma WhatsApp, Onay havuzu)
- **İrsaliye & Fatura çalışma alanı** (GitHub main ile birleştirildi)
- **Ana sayfa şantiye nabzı** (GitHub main ile birleştirildi)

**Hazır commit (Cursor agent deposu):** `db15dd2`  
**GitHub main şu an:** `2bb1881` (eski — Grup Köprüsü yok)

---

## Adım 1 — Kodu al (bilgisayar veya GitHub Codespaces)

Telefonda terminal yoksa **github.com → Codespaces → New** ile boş bir Codespace açın.

```bash
git clone https://github.com/sametatak9/kibritci_web.git
cd kibritci_web
```

Cursor agent deposundan güncel kodu çekmek için (Cursor'da bu oturumun **Git → Remote URL** bilgisini kullanın):

```bash
git remote add agent <CURSOR_ORIGIN_GIT_URL>
git fetch agent main
git checkout main
git merge agent/main --allow-unrelated-histories -m "merge: gece toplu güncelleme"
```

Çakışma çıkarsa **Grup Köprüsü, Evrak Bağlama, Evrak Etiketleri, maaş IBAN** dosyalarında agent (oturum) tarafını koruyun; `IrsaliyeFaturaWorkspaceScreen` ve `DashboardDurumPaneli` gibi GitHub tarafı dosyalarını da tutun.

---

## Adım 2 — GitHub'a push

[GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) üzerinden `repo` yetkili bir token oluşturun.

```bash
git remote set-url origin https://<GITHUB_KULLANICI>:<TOKEN>@github.com/sametatak9/kibritci_web.git
git push origin main
```

İlk push reddedilirse (tarihçe ayrışmış):

```bash
git pull origin main --no-rebase
# çakışmaları çöz, sonra:
git push origin main
```

**Force push kullanmayın** (`--force` yok).

Doğrulama:

```bash
curl -s https://api.github.com/repos/sametatak9/kibritci_web/commits/main | grep '"sha"'
```

Beklenen SHA: `db15dd2` ile başlayan hash.

---

## Adım 3 — Vercel canlı deploy

Push sonrası Vercel genelde otomatik deploy eder. Olmazsa:

1. [vercel.com](https://vercel.com) → **kibritci-web** projesi
2. **Deployments** → en son commit → **Redeploy** → **Production**

CLI ile (token varsa):

```bash
npm install
npm run build
npx vercel deploy --prod
```

---

## Adım 4 — Canlı doğrulama

Tarayıcıda `https://kibritci-web.vercel.app` açın; kenar çubuğunda şunlar görünmeli:

- Grup Köprüsü
- Evrak Bağlama
- Evrak Etiketleri

Terminalden (lazy chunk yüklendikten sonra):

```bash
curl -sL https://kibritci-web.vercel.app/ | grep -o '/assets/[^"]*GrupKopru[^"]*'
```

Boş dönerse deploy henüz eski sürümdür — Adım 3'ü tekrarlayın.

---

## Özet

| Adım | Durum |
|------|--------|
| Kod birleştirildi (`db15dd2`) | ✅ Cursor agent deposunda |
| `tsc --noEmit` | ✅ Geçti |
| GitHub `main` push | ⏳ Sizin PAT ile (mobil VM'de kimlik yok) |
| Vercel canlı | ⏳ Push sonrası Redeploy |

**Firestore canlı verisine dokunmayın** — yalnızca kod deploy'u.
