import { Express } from 'express';
import { Type } from '@google/genai';
import { formatGeminiKeyHint, testGeminiConnection } from './gemini';
import { generateGeminiWithFallback } from './geminiGenerate';
import {
  deletePendingSignup,
  listPendingSignups,
  upsertPendingSignup,
} from './pendingSignupsStore';
import { getFirebaseAdmin, isFirebaseAdminConfigured } from './firebaseAdmin';
import {
  bootstrapFounderAccount,
  callerIsYonetici,
  preparePasswordReset,
  syncClaimsForEmail,
  verifyIdToken,
} from './authClaimsService';

export function registerApiRoutes(app: Express): void {

async function readBearerToken(req: { headers: { authorization?: string } }): Promise<string | null> {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

app.get('/api/auth/claims-status', (_req, res) => {
  res.json({ adminConfigured: isFirebaseAdminConfigured() });
});

const PUBLIC_SA_SHARE_COLLECTION = 'publicSatinAlmaPaylasimlari';

function makePublicShareToken(): string {
  return `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function buildPublicShareUrl(req: { protocol?: string; get?: (name: string) => string | undefined; headers: { host?: string } }, token: string): string {
  const host = req.get?.('x-forwarded-host') || req.get?.('host') || req.headers.host || 'kibritci-erp.onrender.com';
  const proto = (req.get?.('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim() || 'https';
  return `${proto}://${host}/?view_po=${encodeURIComponent(token)}`;
}

/** Satın alma PO paylaşımı oluştur (e-posta indirme linki) */
app.post('/api/public/satin-alma-share', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const idToken = await readBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Authorization Bearer token gerekli' });
    const decoded = await verifyIdToken(idToken);
    const shareIn = req.body?.share || req.body || {};
    const saId = String(shareIn.saId || '').trim();
    if (!saId) return res.status(400).json({ error: 'saId zorunlu' });

    const token = makePublicShareToken();
    const payload = {
      kind: 'satin_alma_po',
      saDocId: String(shareIn.saDocId || ''),
      saId,
      tarih: String(shareIn.tarih || ''),
      talepEden: String(shareIn.talepEden || ''),
      cariFirma: String(shareIn.cariFirma || ''),
      aciklama: String(shareIn.aciklama || ''),
      onayDurumu: String(shareIn.onayDurumu || ''),
      kalemler: Array.isArray(shareIn.kalemler) ? shareIn.kalemler : [],
      eImzalar: Array.isArray(shareIn.eImzalar) ? shareIn.eImzalar : [],
      createdAt: String(shareIn.createdAt || new Date().toISOString()),
      createdBy: decoded.email || shareIn.createdBy || null,
    };

    const admin = getFirebaseAdmin();
    await admin.firestore().collection(PUBLIC_SA_SHARE_COLLECTION).doc(token).set(payload);
    return res.json({
      success: true,
      token,
      url: buildPublicShareUrl(req, token),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Paylaşım oluşturulamadı';
    return res.status(500).json({ error: message });
  }
});

/** Herkese açık satın alma PO paylaşımı oku */
app.get('/api/public/satin-alma-share/:token', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 8) {
      return res.status(400).json({ error: 'Geçersiz paylaşım kodu' });
    }
    const admin = getFirebaseAdmin();
    const snap = await admin.firestore().collection(PUBLIC_SA_SHARE_COLLECTION).doc(token).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Paylaşım bulunamadı' });
    }
    return res.json({ id: snap.id, ...snap.data() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Paylaşım okunamadı';
    return res.status(500).json({ error: message });
  }
});

const SAHA_SIPARIS_COLLECTION = 'sahaSiparisleri';

/** Üyeliksiz sipariş formu — stok + tedarikçi özeti (hassas alan yok) */
app.get('/api/public/siparis-katalog', async (_req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.json({ stoklar: [], tedarikciler: [] });
  }
  try {
    const admin = getFirebaseAdmin();
    const [stokSnap, cariSnap] = await Promise.all([
      admin.firestore().collection('stokKartlar').limit(800).get(),
      admin.firestore().collection('cariKartlar').limit(400).get(),
    ]);
    const stoklar = stokSnap.docs
      .map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          stokKodu: String(x.stokKodu || ''),
          stokAdi: String(x.stokAdi || ''),
          birim: String(x.birim || 'ADET'),
          kategori: String(x.kategori || ''),
          durum: String(x.durum || ''),
          arsivde: Boolean(x.arsivde),
        };
      })
      .filter((s) => s.stokAdi && s.durum !== 'PASIF' && !s.arsivde)
      .map(({ durum: _d, arsivde: _a, ...rest }) => rest)
      .sort((a, b) => a.stokAdi.localeCompare(b.stokAdi, 'tr'))
      .slice(0, 500);
    const tedarikciler = cariSnap.docs
      .map((d) => {
        const x = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          unvan: String(x.unvan || ''),
          kartTipi: String(x.kartTipi || ''),
          durum: String(x.durum || ''),
        };
      })
      .filter(
        (c) =>
          c.unvan &&
          c.durum !== 'PASIF' &&
          (c.kartTipi === 'TEDARIKCI' || c.kartTipi === 'SATICI' || !c.kartTipi)
      )
      .map(({ kartTipi: _k, durum: _d, ...rest }) => rest)
      .sort((a, b) => a.unvan.localeCompare(b.unvan, 'tr'))
      .slice(0, 200);
    return res.json({ stoklar, tedarikciler });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Katalog okunamadı';
    return res.status(500).json({ error: message });
  }
});

/** Üyeliksiz saha siparişi oluştur — onay havuzuna düşer */
app.post('/api/public/saha-siparis', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const body = req.body || {};
    const personelAdSoyad = String(body.personelAdSoyad || '').trim();
    const kullanilacakYer = String(body.kullanilacakYer || '').trim();
    const kalemlerIn = Array.isArray(body.kalemler) ? body.kalemler : [];
    const kalemler = kalemlerIn
      .map((k: Record<string, unknown>, i: number) => ({
        id: String(k.id || `sipk_${Date.now()}_${i}`),
        urunAdi: String(k.urunAdi || '').trim(),
        miktar: Number(k.miktar) || 0,
        birim: String(k.birim || 'ADET'),
        marka: String(k.marka || ''),
        kullanilacakYer: String(k.kullanilacakYer || kullanilacakYer),
        aciklama: String(k.aciklama || ''),
        stokKartId: String(k.stokKartId || ''),
      }))
      .filter((k: { urunAdi: string; miktar: number }) => k.urunAdi && k.miktar > 0);
    if (personelAdSoyad.length < 3) {
      return res.status(400).json({ error: 'Personel adı soyadı zorunlu' });
    }
    if (kullanilacakYer.length < 3) {
      return res.status(400).json({ error: 'Kullanılacak yer zorunlu' });
    }
    if (kalemler.length === 0) {
      return res.status(400).json({ error: 'En az bir malzeme kalemi gerekli' });
    }
    if (kalemler.length > 40) {
      return res.status(400).json({ error: 'En fazla 40 kalem' });
    }

    const tarih = String(body.tarih || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const now = new Date().toISOString();
    const id = String(body.id || `sip_${Date.now()}`).slice(0, 64);
    const siparisNo = String(
      body.siparisNo ||
        `SP-${tarih.replace(/-/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`
    );
    const payload = {
      id,
      siparisNo,
      tarih,
      personelAdSoyad: personelAdSoyad.slice(0, 80),
      personelGorev: String(body.personelGorev || '').slice(0, 80),
      telefon: String(body.telefon || '').slice(0, 40),
      kullanilacakYer: kullanilacakYer.slice(0, 400),
      cariFirma: String(body.cariFirma || '').slice(0, 160),
      cariKartId: String(body.cariKartId || ''),
      aciklama: String(body.aciklama || '').slice(0, 500),
      kalemler,
      durum: 'ONAY_BEKLIYOR',
      kaynak: 'SIPARIS_FORMU',
      olusturanEmail: 'siparis-link@kibritci.com',
      olusturulma: now,
    };

    const admin = getFirebaseAdmin();
    await admin.firestore().collection(SAHA_SIPARIS_COLLECTION).doc(id).set(payload);
    return res.json({ success: true, siparis: payload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sipariş kaydedilemedi';
    return res.status(500).json({ error: message });
  }
});

const PUBLIC_KASA_RAPOR_COLLECTION = 'publicKasaRaporPaylasimlari';
const KASA_RAPOR_STORAGE_BUCKET = 'kibritci-erp.firebasestorage.app';

function makeKasaRaporShareToken(): string {
  return `kr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function buildKasaRaporViewUrl(
  req: { protocol?: string; get?: (name: string) => string | undefined; headers: { host?: string } },
  token: string
): string {
  const host = req.get?.('x-forwarded-host') || req.get?.('host') || req.headers.host || 'kibritci-erp.onrender.com';
  const proto = (req.get?.('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim() || 'https';
  return `${proto}://${host}/?view_kasa_rapor=${encodeURIComponent(token)}`;
}

async function uploadKasaRaporFile(
  admin: ReturnType<typeof getFirebaseAdmin>,
  token: string,
  fileName: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = admin.storage().bucket(KASA_RAPOR_STORAGE_BUCKET);
  const objectPath = `kasa-raporlari/${token}/${fileName}`;
  const file = bucket.file(objectPath);
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: 'public, max-age=604800' },
  });
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 90 * 24 * 60 * 60 * 1000,
  });
  return signedUrl;
}

/** Kasa harcama HTML + Excel paylaşımı (e-posta indirme bağlantıları) */
app.post('/api/public/kasa-rapor-share', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const idToken = await readBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Authorization Bearer token gerekli' });
    const decoded = await verifyIdToken(idToken);

    const html = String(req.body?.html || '');
    if (!html || html.length < 40) {
      return res.status(400).json({ error: 'html zorunlu' });
    }
    const meta = req.body?.meta || {};
    const startDate = String(meta.startDate || '');
    const endDate = String(meta.endDate || '');
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate ve endDate zorunlu' });
    }

    const token = makeKasaRaporShareToken();
    const admin = getFirebaseAdmin();
    const htmlUrl = await uploadKasaRaporFile(
      admin,
      token,
      'report.html',
      Buffer.from(html, 'utf8'),
      'text/html; charset=utf-8'
    );

    let excelUrl = '';
    const excelBase64 = String(req.body?.excelBase64 || '').trim();
    if (excelBase64) {
      excelUrl = await uploadKasaRaporFile(
        admin,
        token,
        'report.xlsx',
        Buffer.from(excelBase64, 'base64'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    }

    const viewUrl = buildKasaRaporViewUrl(req, token);
    const payload = {
      kind: 'kasa_harcama',
      startDate,
      endDate,
      kalemCount: Number(meta.kalemCount) || 0,
      genelToplam: Number(meta.genelToplam) || 0,
      htmlUrl,
      excelUrl: excelUrl || null,
      viewUrl,
      createdAt: new Date().toISOString(),
      createdBy: decoded.email || meta.createdBy || null,
    };
    await admin.firestore().collection(PUBLIC_KASA_RAPOR_COLLECTION).doc(token).set(payload);

    return res.json({
      success: true,
      token,
      viewUrl,
      htmlUrl,
      excelUrl: excelUrl || undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Kasa rapor paylaşımı oluşturulamadı';
    return res.status(500).json({ error: message });
  }
});

/** Herkese açık kasa rapor paylaşımı oku */
app.get('/api/public/kasa-rapor-share/:token', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 8) {
      return res.status(400).json({ error: 'Geçersiz paylaşım kodu' });
    }
    const admin = getFirebaseAdmin();
    const snap = await admin.firestore().collection(PUBLIC_KASA_RAPOR_COLLECTION).doc(token).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Paylaşım bulunamadı' });
    }
    return res.json({ id: snap.id, ...snap.data() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Paylaşım okunamadı';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/founder-bootstrap', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error:
        'Sunucu yapılandırması eksik (FIREBASE_SERVICE_ACCOUNT_JSON). Render ortam değişkenine service account JSON ekleyin.',
    });
  }
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'email ve password zorunlu' });
    }
    const claims = await bootstrapFounderAccount(email, password);
    return res.json({ success: true, claims });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Kurucu bootstrap başarısız';
    const status = message.includes('Geçersiz kurucu') ? 403 : 500;
    return res.status(status).json({ error: message });
  }
});

app.post('/api/auth/prepare-password-reset', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error:
        'Şifre sıfırlama için sunucu yapılandırması eksik (FIREBASE_SERVICE_ACCOUNT_JSON). Render ortam değişkenine service account JSON ekleyin.',
    });
  }
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email zorunlu' });
    const result = await preparePasswordReset(email);
    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Şifre sıfırlama hazırlığı başarısız';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/provision-user', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const idToken = await readBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Authorization Bearer token gerekli' });
    const decoded = await verifyIdToken(idToken);
    if (!callerIsYonetici(decoded)) {
      return res.status(403).json({ error: 'Yalnızca YÖNETİCİ kullanıcı oluşturabilir' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || password.length < 6) {
      return res.status(400).json({ error: 'email ve password (min 6) zorunlu' });
    }

    const claims = await syncClaimsForEmail(email, password);
    return res.json({ success: true, claims });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Kullanıcı provision başarısız';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/admin/update-user', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const idToken = await readBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Authorization Bearer token gerekli' });
    const decoded = await verifyIdToken(idToken);
    const callerEmail = String(decoded.email || '').trim().toLowerCase();
    
    // Only "sametatak9@gmail.com" is allowed to update user passwords
    if (callerEmail !== 'sametatak9@gmail.com') {
      return res.status(403).json({ error: 'Yalnızca sametatak9@gmail.com bu işlemi yapabilir' });
    }

    const targetEmail = String(req.body?.email || '').trim().toLowerCase();
    const newPassword = String(req.body?.password || '').trim();

    if (!targetEmail) {
      return res.status(400).json({ error: 'hedef e-posta (email) zorunludur' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'Yeni şifre zorunludur' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır' });
    }

    const admin = getFirebaseAdmin();
    const emailKey = targetEmail;
    let created = false;

    try {
      const existing = await admin.auth().getUserByEmail(emailKey);
      await admin.auth().updateUser(existing.uid, {
        password: newPassword,
        emailVerified: true,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/user-not-found') throw err;

      const kullaniciSnap = await admin.firestore().collection('kullanicilar').doc(emailKey).get();
      if (!kullaniciSnap.exists) {
        return res.status(404).json({
          error: `${emailKey} için ERP kullanıcı kaydı bulunamadı. Önce Admin panelden kullanıcı oluşturun.`,
        });
      }

      await admin.auth().createUser({
        email: emailKey,
        password: newPassword,
        emailVerified: true,
      });
      created = true;
    }

    await syncClaimsForEmail(emailKey);

    await admin.firestore().collection('portalKullanicilar').doc(emailKey).set(
      {
        email: emailKey,
        password: newPassword,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.json({
      success: true,
      created,
      message: created
        ? 'Firebase giriş hesabı oluşturuldu ve şifre atandı'
        : 'Kullanıcı şifresi başarıyla güncellendi',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Kullanıcı güncelleme başarısız';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/sync-claims', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error: 'Firebase Admin yapılandırılmamış. FIREBASE_SERVICE_ACCOUNT_JSON Render ortam değişkenine eklenmeli.',
    });
  }
  try {
    const idToken = await readBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Authorization Bearer token gerekli' });

    const decoded = await verifyIdToken(idToken);
    const callerEmail = String(decoded.email || '').trim().toLowerCase();
    const targetEmail = String(req.body?.email || callerEmail).trim().toLowerCase();

    if (!targetEmail) return res.status(400).json({ error: 'E-posta bulunamadı' });
    if (targetEmail !== callerEmail && !callerIsYonetici(decoded)) {
      return res.status(403).json({ error: 'Başka kullanıcı için claim yalnızca YÖNETİCİ yapabilir' });
    }

    const claims = await syncClaimsForEmail(targetEmail);
    return res.json({ success: true, claims });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Claim senkronizasyonu başarısız';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/admin/bootstrap-all-claims', async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }
  try {
    const idToken = await readBearerToken(req);
    if (!idToken) return res.status(401).json({ error: 'Authorization Bearer token gerekli' });
    const decoded = await verifyIdToken(idToken);
    if (!callerIsYonetici(decoded)) {
      return res.status(403).json({ error: 'Yalnızca YÖNETİCİ tüm claimleri senkronize edebilir' });
    }

    const admin = (await import('firebase-admin')).default;
    const snap = await admin.firestore().collection('kullanicilar').get();
    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const docSnap of snap.docs) {
      const email = String(docSnap.data()?.email || docSnap.id).trim().toLowerCase();
      if (!email) continue;
      try {
        await syncClaimsForEmail(email);
        results.push({ email, ok: true });
      } catch (e: unknown) {
        results.push({
          email,
          ok: false,
          error: e instanceof Error ? e.message : 'hata',
        });
      }
    }
    return res.json({ success: true, count: results.length, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Toplu claim senkronizasyonu başarısız';
    return res.status(500).json({ error: message });
  }
});

app.post("/api/pending-signup", (req, res) => {
  try {
    const { email, password, ad, soyad, tcNo } = req.body || {};
    if (!email || !password || !ad || !soyad || !tcNo) {
      return res.status(400).json({ error: 'email, password, ad, soyad, tcNo zorunludur' });
    }
    const emailKey = String(email).trim().toLowerCase();
    const saved = upsertPendingSignup({
      id: emailKey,
      email: emailKey,
      password: String(password),
      ad: String(ad).trim(),
      soyad: String(soyad).trim(),
      tcNo: String(tcNo).trim(),
      imzaText: req.body.imzaText,
      imzaStyle: req.body.imzaStyle,
      matchedPersonelId: req.body.matchedPersonelId ?? null,
      kaynak: req.body.kaynak || 'kayit_formu',
      durum: 'BEKLEMEDE',
      olusturulma: req.body.olusturulma || new Date().toISOString(),
      hataSebebi: req.body.hataSebebi || 'quota',
      apiYedek: true,
    });
    return res.json({ success: true, item: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Kayıt kuyruğuna alınamadı';
    return res.status(500).json({ error: message });
  }
});

app.get("/api/pending-signups", (_req, res) => {
  try {
    return res.json({ success: true, items: listPendingSignups() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Liste okunamadı';
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/pending-signups/:email", (req, res) => {
  try {
    const deleted = deletePendingSignup(req.params.email);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı' });
    return res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Silinemedi';
    return res.status(500).json({ error: message });
  }
});

app.get("/api/gemini-health", async (_req, res) => {
  const result = await testGeminiConnection();
  if (result.ok) {
    return res.json({
      success: true,
      keyFormat: result.keyInfo.format,
      keyPreview: result.keyInfo.preview,
      keyHint: formatGeminiKeyHint(result.keyInfo.format),
      modelResponse: result.modelResponse,
      message: 'Gemini API bağlantısı çalışıyor.',
    });
  }
  return res.status(503).json({
    success: false,
    keyFormat: result.keyInfo.format,
    keyPreview: result.keyInfo.preview,
    keyHint: formatGeminiKeyHint(result.keyInfo.format),
    error: result.error,
  });
});

app.post("/api/send-verification-email", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  console.log(`\n======================================================`);
  console.log(`[MAIL SIMULATION] Verification email successfully sent to: ${email}`);
  console.log(`[MAIL SIMULATION] Code: ${Math.floor(100000 + Math.random() * 900000)}`);
  console.log(`======================================================\n`);
  res.json({ success: true, message: `Verification email simulated and sent to ${email}` });
});

// API endpoint to parse Daily Yoklama / Puantaj Sheet
app.post("/api/parse-daily-yoklama", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const promptText = `
You are an expert HR and timesheet auditing assistant.
Analyze this uploaded Daily Puantaj (Daily Attendance) Sheet.
It contains columns for employee names (Adı Soyadı), role (Görevi), attendance status (Yoklama - Geldi/Yok/İzinli), overtime hours (Fazla Mesai), and signature (İmza).

Please extract:
1. "tarih": The date of the attendance sheet in YYYY-MM-DD format. If missing, default to the current date.
2. "yoklamaKayitlari": An array of all workers listed on the sheet with fields:
   - "adSoyad": Full name.
   - "gorev": Job title/role (e.g. İŞÇİ, FORMEN, USTA, GÜVENLİK, DEPOCU, etc.).
   - "durum": The attendance status mapped to one of: "Geldi", "Yok", "İzinli", "Raporlu", "Pazar", "Tatil".
   - "mesaiSaati": Varsa fazla mesai saati (number, default to 0).

Provide the output strictly conforming to the response schema.
`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında yoklama tarihi" },
        yoklamaKayitlari: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              adSoyad: { type: Type.STRING },
              gorev: { type: Type.STRING },
              durum: { type: Type.STRING, description: "'Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil'" },
              mesaiSaati: { type: Type.NUMBER }
            },
            required: ["adSoyad", "durum"]
          }
        }
      },
      required: ["tarih", "yoklamaKayitlari"]
    };

    const { text } = await generateGeminiWithFallback({
      contents: [promptText, imagePart],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
      label: 'Günlük yoklama analizi',
    });

    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in parse-daily-yoklama:", error);
    const msg = error.message || "Failed to parse daily yoklama sheet";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// API endpoint to parse Monthly Excel-style Puantaj (3-row blocks per employee with X marks)
app.post("/api/parse-monthly-excel-yoklama", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const imagePart = {
      inlineData: { mimeType, data: fileBase64 },
    };

    const promptText = `
You are an expert HR timesheet auditor for Turkish construction sites.
Analyze this MONTHLY Excel puantaj sheet. Each employee occupies a block of rows:
- Row 1: ID number, full name (AD SOYAD), status, exit date, days worked count, job title, salary
- Row 2: "TARİH" label followed by day numbers like 1.2, 2.2, ... 28.2 (day.month format)
- Row 3: "ÇALIŞMA" label followed by "X" marks under days the employee worked
- Row 4 (optional): "MESAİ" row with overtime hours

Extract:
1. "yil": 4-digit year (infer from dates, default 2026)
2. "ay": month number 1-12 (infer from date row like ".2" = February = 2)
3. "personelKayitlari": array of each employee block:
   - "excelId": the numeric ID in column 1 (unique per person on this sheet)
   - "adSoyad": full name exactly as written
   - "gorev": job title (default "DÜZ İŞÇİ")
   - "calismaGunleri": array of day numbers (1-31) where X appears in ÇALIŞMA row
   - "mesaiGunleri": optional object mapping day number to overtime hours
   - "istenCikisTarihi": exit date as YYYY-MM-DD if visible (e.g. ÇIKIŞ 10.03 → 2026-03-10)

Be precise with Turkish names (İ, Ş, Ğ, Ü, Ö, Ç). Each excelId is a distinct person even if names are similar.
`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        yil: { type: Type.NUMBER },
        ay: { type: Type.NUMBER },
        personelKayitlari: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              excelId: { type: Type.NUMBER },
              adSoyad: { type: Type.STRING },
              gorev: { type: Type.STRING },
              calismaGunleri: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              mesaiGunleri: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
              istenCikisTarihi: { type: Type.STRING },
            },
            required: ["excelId", "adSoyad", "calismaGunleri"],
          },
        },
      },
      required: ["yil", "ay", "personelKayitlari"],
    };

    const { text } = await generateGeminiWithFallback({
      contents: [promptText, imagePart],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.1,
      },
      label: 'Aylık Excel yoklama analizi',
    });

    res.json({ success: true, data: JSON.parse(text) });
  } catch (error: any) {
    console.error("Error in parse-monthly-excel-yoklama:", error);
    const msg = error.message || "Failed to parse monthly excel yoklama";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// API endpoint to parse SGK document (PDF or Image)
app.post("/api/parse-sgk", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType in request body" });
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const promptText = `
You are an expert HR and financial assistant.
Analyze this document. It could be either:
1. A Turkish SGK Job Entry Declaration ("SİGORTALI İŞE GİRİŞ BİLDİRGESİ")
2. A Bank Transfer/Payment Receipt ("DEKONT" / "ÖDEME DEKONTU" / "EFT / HAVALE DEKONTU")

Please extract the following fields and map them to our personnel database structure:

If it is a SGK Job Entry Declaration:
- "tcNo": SOSYAL GÜVENLİK SİCİL NUMARASI (T.C. KİMLİK NUMARASI) (11-digit string).
- "ad": Employee name ("Adı").
- "soyad": Employee surname ("Soyadı").
- "babaAdi": "Baba Adı".
- "dogumTarihi": Birth date in "YYYY-MM-DD" format.
- "iseGirisTarihi": Employment start date in "YYYY-MM-DD" format.
- "cinsiyet": Gender ("Erkek" or "Kadın").
- "adres": "İKAMETGAH ADRESİ" combining details.
- "il" & "ilce": Province & District of residence.
- "gorev": Infer role based on "Meslek Adı" (one of "İŞÇİ", "FORMEN", "USTA", "MÜHENDİS", "MİMAR", "ŞEF", "GÜVENLİK", "DEPOCU").

If it is a DEKONT (Payment/Transfer Receipt):
- "ad" and "soyad": Extract from "Alıcı Adı Soyadı" or "Alıcı" field (the receiver of the money).
- "ibanNo": Extract the Alıcı IBAN number (starting with TR). Remove spaces.
- "bankaAdi": Extract the Alıcı Bank name (the bank receiving the payment, e.g., "GARANTİ BBVA", "ZİRAAT BANKASI", "VAKIFBANK", etc.).
- "tcNo": Extract the Alıcı TC Kimlik No if visible, otherwise leave blank.
- "iseGirisTarihi": Use the transaction date / transfer date of the Dekont in "YYYY-MM-DD" format.
- "gorev": Default to "İŞÇİ" or infer if possible.

Provide the output strictly conforming to the response schema.
`;

    const sgkResponseSchema = {
      type: Type.OBJECT,
      properties: {
        tcNo: { type: Type.STRING, description: "11-digit Turkish TC Identification Number or receiver's TC" },
        ad: { type: Type.STRING, description: "First name" },
        soyad: { type: Type.STRING, description: "Last name" },
        babaAdi: { type: Type.STRING, description: "Father's name" },
        dogumTarihi: { type: Type.STRING, description: "Birthdate in YYYY-MM-DD format" },
        iseGirisTarihi: { type: Type.STRING, description: "Employment start date or transfer date in YYYY-MM-DD format" },
        cinsiyet: { type: Type.STRING, description: "Gender: 'Erkek' or 'Kadın'" },
        adres: { type: Type.STRING, description: "Full residential address" },
        il: { type: Type.STRING, description: "Residence province" },
        ilce: { type: Type.STRING, description: "Residence district" },
        gorev: { type: Type.STRING, description: "Role: 'İŞÇİ', 'FORMEN', 'USTA', 'MİMAR', 'MÜHENDİS', 'ŞEF', 'GÜVENLİK', or 'DEPOCU'" },
        ibanNo: { type: Type.STRING, description: "Alıcı IBAN number starting with TR" },
        bankaAdi: { type: Type.STRING, description: "Alıcı Bank name" }
      },
      required: ["ad", "soyad"]
    };

    const { text } = await generateGeminiWithFallback({
      contents: [imagePart, promptText],
      config: {
        responseMimeType: "application/json",
        responseSchema: sgkResponseSchema,
      },
      label: 'SGK/Dekont analizi',
    });

    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing SGK PDF/Image via Gemini:", error);
    const msg = error.message || "Failed to parse SGK document";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// API endpoint to parse Turkish ID card (Kimlik) — front/back
app.post("/api/parse-kimlik", async (req, res) => {
  try {
    const { onYuzBase64, arkaYuzBase64, mimeType } = req.body;
    if (!onYuzBase64) {
      return res.status(400).json({ error: "Kimlik ön yüz (onYuzBase64) zorunludur." });
    }

    const parts: object[] = [
      {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: onYuzBase64,
        },
      },
    ];
    if (arkaYuzBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: arkaYuzBase64,
        },
      });
    }

    const promptText = `
Analyze the uploaded image(s) of a Turkish Republic Identity Card (T.C. Kimlik Kartı).
The first image is the FRONT side. If a second image exists, it is the BACK side.

Rules:
1. Confirm whether the images show a valid Turkish ID card (not a random photo, selfie, or unrelated document).
2. Extract readable fields from front: TC Kimlik No (11 digits), Ad, Soyad, Baba Adı, Doğum Tarihi (YYYY-MM-DD), Cinsiyet (Erkek/Kadın).
3. If back side provided, use it to improve validation.
4. Set kimlikGecerli=false if images are blurry, not an ID card, or missing critical front data.
5. List missing field keys in eksikAlanlar (e.g. tcNo, ad, soyad, babaAdi, dogumTarihi, cinsiyet).
6. Provide a short Turkish uyari message when kimlikGecerli is false.

Output strictly as JSON per schema.
`;

    const kimlikSchema = {
      type: Type.OBJECT,
      properties: {
        tcNo: { type: Type.STRING },
        ad: { type: Type.STRING },
        soyad: { type: Type.STRING },
        babaAdi: { type: Type.STRING },
        dogumTarihi: { type: Type.STRING },
        cinsiyet: { type: Type.STRING },
        seriNo: { type: Type.STRING },
        kimlikGecerli: { type: Type.BOOLEAN },
        kimlikTipi: { type: Type.STRING },
        eksikAlanlar: { type: Type.ARRAY, items: { type: Type.STRING } },
        uyari: { type: Type.STRING },
      },
      required: ['kimlikGecerli', 'eksikAlanlar'],
    };

    const { text } = await generateGeminiWithFallback({
      contents: [...parts, promptText],
      config: {
        responseMimeType: 'application/json',
        responseSchema: kimlikSchema,
      },
      label: 'Kimlik kartı analizi',
    });

    res.json({ success: true, data: JSON.parse(text) });
  } catch (error: any) {
    console.error('Error parsing kimlik:', error);
    const msg = error.message || 'Kimlik analizi başarısız';
    res.status(500).json({ error: msg });
  }
});

// API endpoint to parse Waybill (İrsaliye) (PDF or Image)
app.post("/api/parse-irsaliye", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType in request body" });
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        irsaliyeNo: { type: Type.STRING },
        tarih: { type: Type.STRING },
        firma: { type: Type.STRING },
        kalemler: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              urunAdi: { type: Type.STRING },
              miktar: { type: Type.NUMBER },
              birim: { type: Type.STRING }
            },
            required: ["urunAdi", "miktar", "birim"]
          }
        }
      },
      required: ["irsaliyeNo", "tarih", "firma", "kalemler"]
    };

    const userPrompt = "Lütfen ekteki teslimat irsaliyesi (waybill / delivery note) belgesini analiz et. İrsaliye numarasını (irsaliyeNo), tarihini (tarih) (YYYY-MM-DD formatında), gönderen / satıcı firma adını (firma) ve teslim edilen tüm malzeme kalemlerini (kalemler listesi altında urunAdi, miktar ve birim olarak) çıkar.";

    const { text } = await generateGeminiWithFallback({
      contents: [userPrompt, imagePart],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
      label: 'İrsaliye analizi',
    });
    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing İrsaliye PDF/Image via Gemini:", error);
    const msg = error.message || "Failed to parse waybill document";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// API endpoint to parse Invoice (Fatura) (PDF or Image)
app.post("/api/parse-fatura", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType in request body" });
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        faturaNo: { type: Type.STRING },
        tarih: { type: Type.STRING },
        firma: { type: Type.STRING },
        kalemler: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              urunAdi: { type: Type.STRING },
              miktar: { type: Type.NUMBER },
              birim: { type: Type.STRING },
              birimFiyat: { type: Type.NUMBER },
              kdvOran: { type: Type.NUMBER },
              toplam: { type: Type.NUMBER }
            },
            required: ["urunAdi", "miktar", "birim", "birimFiyat", "kdvOran", "toplam"]
          }
        },
        toplamTutar: { type: Type.NUMBER },
        kdvTutar: { type: Type.NUMBER },
        genelToplam: { type: Type.NUMBER }
      },
      required: ["faturaNo", "tarih", "firma", "kalemler", "toplamTutar", "kdvTutar", "genelToplam"]
    };

    const userPrompt = "Lütfen ekteki faturayı (invoice) analiz et. Fatura numarasını (faturaNo), faturanın kesildiği tarihi (tarih) (YYYY-MM-DD formatında), satıcı firma adını (firma), faturadaki tüm mal veya hizmet kalemlerini (kalemler listesi altında urunAdi, miktar, birim, birimFiyat, kdvOran yüzde olarak örn. 20, ve toplam tutarı) çıkar. Ayrıca toplam matrahı (toplamTutar), KDV tutarını (kdvTutar) ve ödenecek genel toplamı (genelToplam) çıkar.";

    const { text } = await generateGeminiWithFallback({
      contents: [userPrompt, imagePart],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
      label: 'Fatura analizi',
    });
    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing Fatura PDF/Image via Gemini:", error);
    const msg = error.message || "Failed to parse invoice document";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// API endpoint to perform AI-based 3-way match comparison
app.post("/api/compare-3way", async (req, res) => {
  try {
    const { saTalebi, irsaliyeler, fatura, compareFocus, customInstructions, userEdits } = req.body;
    if (!fatura) {
      return res.status(400).json({ error: "Missing fatura data in request body" });
    }

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: "Must be either 'SORUNSUZ ONAY' or 'SORUNLU'" },
        discrepancies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of found differences or discrepancies, empty if none"
        },
        reportText: { type: Type.STRING, description: "A detailed Turkish summary comparing PO vs Waybills vs Invoice" }
      },
      required: ["status", "discrepancies", "reportText"]
    };

    const focusList = Array.isArray(compareFocus) && compareFocus.length
      ? compareFocus.join(', ')
      : 'miktar, ürün adı, birim, firma, fiyat, kg-ton dönüşümü';

    const editsBlock = Array.isArray(userEdits) && userEdits.length
      ? `\n\nKULLANICI KARŞILAŞTIRMA ÖNCESİ MANUEL DÜZENLEMELER (raporun EN ALTINDA ayrı bölümde listele):\n${JSON.stringify(userEdits, null, 2)}`
      : '';

    const customBlock = customInstructions?.trim()
      ? `\n\nKULLANICI TALİMATI (öncelikli): ${customInstructions.trim()}`
      : '';

    const promptText = `
You are an expert construction auditor and accountant.
Perform a strict 3-way match audit between:
1. Satın Alma Siparişi (Purchase Order):
${JSON.stringify(saTalebi || "No PO linked", null, 2)}

2. Bağlı İrsaliyeler (Delivery Waybills):
${JSON.stringify(irsaliyeler || "No waybills linked", null, 2)}

3. Gelen Fatura (Invoice):
${JSON.stringify(fatura, null, 2)}

KULLANICI SADECE ŞUNLARI KARŞILAŞTIRMANI İSTİYOR: ${focusList}
${customBlock}
${editsBlock}

Perform a comparison of:
- Item names / categories (normalize differences like typo variants, e.g. "Stablize" vs "Stabilize", "Mıcır", "Grovak", "Taş Tozu").
- Quantities ordered in PO vs quantities delivered in waybills vs quantities billed in invoice.
- Any price discrepancies if unit prices are specified.

CRITICAL UNIT CONVERSION RULE:
- For construction bulk materials like "Mıcır", "Stabilize" (or "Stablize"), "Grovak", and "Taş Tozu":
  - The PO might specify quantity in "TIR" (Trucks) (e.g., 2 TIR).
  - The Waybills specify weight in "KG" (e.g., 50000 KG total).
  - The Invoice specifies weight in "TON" (e.g., 50 TON).
  - Standard shantiye conversion rate: 1 TIR is approximately 25 TON (25,000 KG).
  - Add up the Waybill weights (in KG) and convert to TON (KG / 1000). Compare it with the TON billed in the Invoice, and ensure they match the TIR ordered in the PO (allowing a +/- 5% scale tolerance).
  - If the math matches within tolerance, treat this as a perfect match ("SORUNSUZ ONAY") and detail the math clearly in your report.

Audit Rules:
- If all quantities and items match perfectly (meaning what was ordered matches what was delivered, which in turn matches what was billed), return status as "SORUNSUZ ONAY".
- If there is any discrepancy (e.g., delivered quantity is different from billed quantity, or items on invoice don't exist in waybills or PO), list them in 'discrepancies' and return status as "SORUNLU".
- Write a beautifully styled Turkish markdown report summary in 'reportText'. Explain details clearly to a site manager.
- If userEdits were provided, add a final section "Kullanıcı Düzenlemeleri" listing each change.

Provide the response strictly conforming to the requested schema.
`;

    const { text } = await generateGeminiWithFallback({
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
      label: '3-way karşılaştırma',
    });
    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in AI 3-Way Match:", error);
    const msg = error.message || "Failed to perform 3-way comparison";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// AI analysis for linked evrak groups (YZ Karşılaştır sekmesi)
app.post("/api/analyze-linked-evrak", async (req, res) => {
  try {
    const { saTalebi, irsaliyeler, fatura, kalemBaglantilari, analizOdak, ozelTalimat } = req.body;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: "Must be either 'SORUNSUZ ONAY' or 'SORUNLU'" },
        discrepancies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of found differences or discrepancies, empty if none"
        },
        reportText: { type: Type.STRING, description: "Detailed Turkish markdown analysis report" }
      },
      required: ["status", "discrepancies", "reportText"]
    };

    const focusList = Array.isArray(analizOdak) && analizOdak.length
      ? analizOdak.join(', ')
      : 'miktar, firma, tarih, tutar, ürün adı, birim, fiyat';

    const customBlock = ozelTalimat?.trim()
      ? `\n\nKULLANICI TALİMATI (öncelikli): ${ozelTalimat.trim()}`
      : '';

    const kalemBlock = Array.isArray(kalemBaglantilari) && kalemBaglantilari.length
      ? `\n\nKULLANICI ONAYLI KALEM BAĞLANTILARI (bu eşleştirmelere göre analiz yap):\n${JSON.stringify(kalemBaglantilari, null, 2)}`
      : '';

    const promptText = `
You are an expert construction auditor and accountant for a Turkish construction site ERP.
Analyze the following linked documents as a group. The user has explicitly linked line items between documents.

1. Satın Alma Siparişi (Purchase Order):
${JSON.stringify(saTalebi || "Bağlı PO yok", null, 2)}

2. Bağlı İrsaliyeler (Delivery Waybills):
${JSON.stringify(irsaliyeler || [], null, 2)}

3. Fatura (Invoice):
${JSON.stringify(fatura || "Bağlı fatura yok", null, 2)}
${kalemBlock}

KULLANICI ANALİZ ODAĞI: ${focusList}
${customBlock}

Rules:
- Focus your analysis primarily on the user's selected focus areas (${focusList}).
- Respect the kalem bağlantıları — compare linked line items across SA → İrsaliye → Fatura.
- For bulk materials (Mıcır, Stabilize, Grovak, Taş Tozu): apply 1 TIR ≈ 25 TON conversion with ±5% tolerance when comparing TIR/KG/TON.
- If quantities, amounts, dates, and firms align within tolerance, status = "SORUNSUZ ONAY".
- Otherwise status = "SORUNLU" and list discrepancies.
- Write a professional Turkish markdown report in reportText for a site manager. Include summary, detail per focus area, and recommendations.

Provide the response strictly conforming to the requested schema.
`;

    const { text } = await generateGeminiWithFallback({
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
      label: 'Bağlı evrak analizi',
    });
    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in AI linked evrak analysis:", error);
    const msg = error.message || "Failed to analyze linked evrak";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

// Surprise AI Document Tutanak Creator
app.post("/api/generate-tutanak", async (req, res) => {
  try {
    const { konu, detaylar, muhatap } = req.body;
    if (!konu || !detaylar) {
      return res.status(400).json({ error: "Missing konu or detaylar in request body" });
    }

    const prompt = `
Lütfen şantiye yönetimi için resmi ve hukuki açıdan geçerli Türkçe bir tutanak taslağı hazırla.
- Tutanak Konusu: ${konu}
- Olay / Durum Detayları: ${detaylar}
- Muhatap / İlgili Taraf: ${muhatap || "Belirtilmemiş"}

Tutanak içeriğini resmi, ağırbaşlı ve şantiye mevzuatlarına uygun hukuk diliyle yaz. En altta "Hazırlayan / Şantiye Şefi" ve "Muhatap / Teslim Alan" imza bölümleri olsun. HTML veya Markdown formatında yazma, düz metin olsun.
`;

    const { text } = await generateGeminiWithFallback({
      contents: prompt,
      label: 'Tutanak oluşturma',
    });

    res.json({ success: true, text });
  } catch (error: any) {
    console.error("Error in generate-tutanak:", error);
    res.status(500).json({ error: error.message || "Failed to generate tutanak" });
  }
});

// API endpoint to parse legacy documents for import
app.post("/api/parse-legacy-document", async (req, res) => {
  try {
    const { fileBase64, mimeType, docType } = req.body;
    if (!fileBase64 || !mimeType || !docType) {
      return res.status(400).json({ error: "Missing fileBase64, mimeType or docType in request body" });
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: fileBase64,
      },
    };

    let responseSchema: any;
    let userPrompt = "";

    if (docType === "fatura") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          faturaNo: { type: Type.STRING },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
          cariUnvan: { type: Type.STRING, description: "Faturayı kesen / satan satıcı firma adı (cari ünvan)" },
          toplamTutar: { type: Type.NUMBER, description: "Toplam matrah tutarı (KDV hariç)" },
          kdvTutar: { type: Type.NUMBER, description: "Toplam hesaplanan KDV tutarı" },
          genelToplam: { type: Type.NUMBER, description: "Ödenecek genel toplam tutar (KDV dahil)" },
          kalemler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urunAdi: { type: Type.STRING, description: "Ürün veya hizmet adı" },
                miktar: { type: Type.NUMBER, description: "Miktar" },
                birim: { type: Type.STRING, description: "Birim (ADET, KG, TON, M3 vb.)" },
                birimFiyat: { type: Type.NUMBER, description: "Birim fiyatı" },
                kdvOran: { type: Type.NUMBER, description: "KDV oranı yüzde olarak (örn: 20)" },
                toplam: { type: Type.NUMBER, description: "Kalem toplamı" }
              },
              required: ["urunAdi", "miktar", "birim", "birimFiyat", "kdvOran", "toplam"]
            }
          }
        },
        required: ["faturaNo", "tarih", "cariUnvan", "toplamTutar", "kdvTutar", "genelToplam", "kalemler"]
      };
      userPrompt = "Lütfen ekteki faturayı (invoice) analiz et. Fatura numarasını, tarihini (YYYY-MM-DD formatında), faturayı kesen firma ünvanını, toplam matrahı, KDV tutarını, genel toplamı ve kalem listesini (urunAdi, miktar, birim, birimFiyat, kdvOran, toplam) çıkar.";
    } else if (docType === "irsaliye") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          irsaliyeNo: { type: Type.STRING },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
          firma: { type: Type.STRING, description: "Sevk eden / gönderen firma adı" },
          kalemler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urunAdi: { type: Type.STRING, description: "Malzeme adı" },
                miktar: { type: Type.NUMBER, description: "Miktar" },
                birim: { type: Type.STRING, description: "Birim (ADET, KG, TON vb.)" }
              },
              required: ["urunAdi", "miktar", "birim"]
            }
          }
        },
        required: ["irsaliyeNo", "tarih", "firma", "kalemler"]
      };
      userPrompt = "Lütfen ekteki irsaliyeyi (waybill / sevk irsaliyesi) analiz et. İrsaliye numarasını, tarihini (YYYY-MM-DD formatında), sevk eden firma ünvanını ve sevk edilen malzeme listesini (urunAdi, miktar, birim) çıkar.";
    } else if (docType === "makbuz") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          referansId: { type: Type.STRING, description: "Makbuz numarası, işlem no veya dekont referans no" },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında işlem tarihi" },
          aciklama: { type: Type.STRING, description: "Ödeme açıklaması veya makbuz içeriği" },
          tutar: { type: Type.NUMBER, description: "Ödenen / tahsil edilen toplam tutar" },
          firma: { type: Type.STRING, description: "Ödemeyi yapan ya da alan muhatap firma/kişi adı" },
          hareketTipi: { type: Type.STRING, description: "İşlem tipine göre 'ÇIKIŞ' (ödeme yapıldıysa) veya 'GİRİŞ' (tahsilat/para alındıysa)" }
        },
        required: ["referansId", "tarih", "aciklama", "tutar", "firma", "hareketTipi"]
      };
      userPrompt = "Lütfen ekteki makbuzu, tediye fişini, gider makbuzunu veya banka dekontunu analiz et. Referans numarasını/makbuz no, tarihini (YYYY-MM-DD), açıklamasını, ödenen/alınan net tutarı, muhatap firma veya kişi adını ve para çıkışı ise 'ÇIKIŞ', para girişi ise 'GİRİŞ' olacak şekilde hareketTipi alanını çıkar.";
    } else if (docType === "hakedis") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          faturaNo: { type: Type.STRING, description: "Hakediş kapağı no, fatura no veya hakediş no" },
          donem: { type: Type.STRING, description: "Hangi döneme ait olduğu (örn: Haziran 2026, Hakediş No: 3 vb.)" },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında hakediş onay veya düzenleme tarihi" },
          cariUnvan: { type: Type.STRING, description: "Hakediş sahibi yüklenici / taşeron / ana firma adı" },
          toplamTutar: { type: Type.NUMBER, description: "KDV hariç hakediş tutarı (ara toplam)" },
          kdvTutar: { type: Type.NUMBER, description: "Hakediş KDV tutarı" },
          genelToplam: { type: Type.NUMBER, description: "KDV dahil ödenecek hakediş toplam tutarı" },
          aciklama: { type: Type.STRING, description: "Hakediş açıklaması, yapılan işler vb. detaylar" }
        },
        required: ["faturaNo", "donem", "tarih", "cariUnvan", "toplamTutar", "kdvTutar", "genelToplam", "aciklama"]
      };
      userPrompt = "Lütfen ekteki hakediş belgesini, hakediş kapağını veya hakediş raporunu analiz et. Hakediş/fatura numarasını, dönemini (donem), tarihini (YYYY-MM-DD), yüklenici/taşeron firma ünvanını, KDV hariç toplamı (toplamTutar), KDV tutarını, genel toplamı ve kısa iş açıklamasını çıkar.";
    } else if (docType === "yoklama") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: "İlgili ay, dönem veya tarih (örn: Haziran 2026 veya 2026-06-15)" },
          yoklamaKayitlari: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                adSoyad: { type: Type.STRING, description: "Personel adı soyadı (örn: 'Ahmet Yılmaz')" },
                durum: { type: Type.STRING, description: "'Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil' durumlarından biri" },
                gunNo: { type: Type.NUMBER, description: "Hangi gün olduğu (1-31 arası tamsayı, örn: 15. gün ise 15)" },
                mesaiSaati: { type: Type.NUMBER, description: "Varsa fazla mesai saati" }
              },
              required: ["adSoyad", "durum"]
            }
          }
        },
        required: ["yoklamaKayitlari"]
      };
      userPrompt = "Lütfen ekteki personel yoklama listesini, puantaj tablosunu veya şantiye yoklama tutanağını analiz et. İlgili ayı veya tarihi tespit et, listedeki tüm personellerin isimlerini ve yoklama/puantaj durumlarını ('Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil') yoklamaKayitlari dizisinde çıkar.";
    } else if (docType === "saha_faaliyet") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında rapor tarihi" },
          isNiteligi: { type: Type.STRING, description: "İşin niteliği, türü (örn: 'Beton Dökümü', 'Kalıp Çakımı', 'Hafriyat ve Kazı')" },
          parsel: { type: Type.STRING, description: "Parsel no (örn: 'Parsel A' veya 'Parsel 3')" },
          blok: { type: Type.STRING, description: "Blok no (örn: 'Blok 1' veya 'Blok B')" },
          aciklama: { type: Type.STRING, description: "Günlük şantiyede yapılan faaliyet açıklamaları ve detayları" },
          aktifPersonelListesi: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Şantiye sahasında aktif görev alan personellerin isim listesi"
          }
        },
        required: ["tarih", "isNiteligi", "aciklama"]
      };
      userPrompt = "Lütfen ekteki Günlük Saha Faaliyet Raporunu veya şantiye günlük faaliyet logunu analiz et. Rapor tarihini (YYYY-MM-DD), yapılan işlerin niteliğini (isNiteligi), parsel ve blok bilgilerini, günlük özet faaliyet detaylarını ve sahada çalışan aktif personellerin isim listesini çıkar.";
    } else if (docType === "auto") {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          detectedType: { type: Type.STRING, description: "Tespit edilen döküman türü: 'fatura', 'irsaliye', 'makbuz', 'hakedis', 'yoklama', or 'saha_faaliyet'" },
          
          faturaNo: { type: Type.STRING },
          irsaliyeNo: { type: Type.STRING },
          referansId: { type: Type.STRING },
          tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
          donem: { type: Type.STRING, description: "Dönem (örn: Haziran 2026)" },
          firma: { type: Type.STRING, description: "Firma / Şahıs / Alıcı / Satıcı / Cari adı" },
          cariUnvan: { type: Type.STRING, description: "Cari ünvan veya firma ünvanı" },
          toplamTutar: { type: Type.NUMBER },
          kdvTutar: { type: Type.NUMBER },
          genelToplam: { type: Type.NUMBER },
          tutar: { type: Type.NUMBER },
          aciklama: { type: Type.STRING },
          hareketTipi: { type: Type.STRING, description: "'GİRİŞ' veya 'ÇIKIŞ'" },
          kalemler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urunAdi: { type: Type.STRING },
                miktar: { type: Type.NUMBER },
                birim: { type: Type.STRING },
                birimFiyat: { type: Type.NUMBER },
                kdvOran: { type: Type.NUMBER },
                toplam: { type: Type.NUMBER }
              }
            }
          },

          yoklamaKayitlari: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                adSoyad: { type: Type.STRING, description: "Personel adı soyadı (örn: 'Ahmet Yılmaz')" },
                durum: { type: Type.STRING, description: "'Geldi', 'Yok', 'İzinli', 'Raporlu', 'Pazar', 'Tatil' durumlarından biri" },
                gunNo: { type: Type.NUMBER, description: "Ayın hangi günü olduğu (1-31 arası sayı, örn: 15)" },
                mesaiSaati: { type: Type.NUMBER, description: "Fazla mesai saati" }
              },
              required: ["adSoyad", "durum"]
            }
          },

          isNiteligi: { type: Type.STRING, description: "İşin niteliği (örn: 'Beton Dökümü')" },
          parsel: { type: Type.STRING, description: "Şantiye parseli (örn: 'Parsel A')" },
          blok: { type: Type.STRING, description: "Şantiye blok bilgisi (örn: 'Blok 1')" },
          aktifPersonelListesi: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Sahada görev alan personellerin isimleri"
          },
          records: {
            type: Type.ARRAY,
            description: "Aynı belgede birden fazla satın alma kaydı varsa, her bir talep için ayrı kayıt dizisi",
            items: {
              type: Type.OBJECT,
              properties: {
                tarih: { type: Type.STRING, description: "YYYY-MM-DD formatında tarih" },
                firma: { type: Type.STRING, description: "Tedarikçi / cari firma" },
                cariUnvan: { type: Type.STRING, description: "Firma ünvanı" },
                aciklama: { type: Type.STRING, description: "Talep açıklaması veya not" },
                onayDurumu: { type: Type.STRING, description: "ONAYLANDI veya BİLİNMİYOR" },
                kalemler: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      urunAdi: { type: Type.STRING },
                      miktar: { type: Type.NUMBER },
                      birim: { type: Type.STRING },
                      birimFiyat: { type: Type.NUMBER },
                      kdvOran: { type: Type.NUMBER },
                      toplam: { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          }
        },
        required: ["detectedType"]
      };
      userPrompt = `Lütfen ekteki dökümanı analiz et ve tipini otomatik tespit et.
Döküman tipleri şunlar olabilir:
1. 'fatura' (Fatura / Gider Faturası) - Fatura numarası, tarih, satıcı firma, tutarlar, KDV, kalemler varsa buraya girer.
2. 'irsaliye' (Sevk İrsaliyesi / Teslimat Evrakı) - Ürün teslimat dökümleri, irsaliye numarası, gönderici, miktarlar buraya girer.
3. 'makbuz' (Dekont / Makbuz / Gider Pusulası) - Ödeme dekontu, tediye fişi, banka havalesi, tutar ve hareketTipi ('ÇIKIŞ' veya 'GİRİŞ') buraya girer.
4. 'hakedis' (Hakediş Kapağı / Taşeron Hakedişi) - Taşeron hakediş raporları, dönemler, hakediş bedeli, iş açıklamaları buraya girer.
5. 'yoklama' (Yoklama / Puantaj Listesi) - Personel yoklama listesi, puantaj tablosu, günlük/aylık yoklama durumları buraya girer.
6. 'saha_faaliyet' (Günlük Saha Faaliyet Raporu) - Şantiyede yapılan işler, beton dökümü, kalıp işleri, parsel, blok ve sahada çalışan aktif personellerin adları buraya girer.

Eğer belge çok sayfalı ve birden fazla satın alma talebi içeriyorsa, her talebi records dizisinde ayrı bir kayıt olarak ver.
Geriye dönük uyumluluk için üst seviyedeki alanları ilk kayda göre de doldur.

Lütfen en uygun kategoriyi 'detectedType' alanına atayıp dökümandaki ilgili tüm alanları büyük bir titizlikle çıkar.`;
    } else {
      return res.status(400).json({ error: "Invalid docType specified" });
    }

    const { text } = await generateGeminiWithFallback({
      contents: [userPrompt, imagePart],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
      label: `Legacy döküman analizi (${docType})`,
    });
    const parsedData = JSON.parse(text);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error in parse-legacy-document endpoint:", error);
    const msg = error.message || "Failed to parse legacy document";
    const status = /zaman aşımı|timeout|504/i.test(msg) ? 504 : 500;
    res.status(status).json({ error: msg });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    const { text } = await generateGeminiWithFallback({
      contents: `Sen Kibritçi İnşaat ERP sisteminin akıllı yapay zeka şantiye asistanısın. Kullanıcıya şantiye yönetimi, personel, stok ve genel inşaat ERP süreçleri hakkında yardımcı oluyorsun. Lütfen kısa, anlaşılır, kibar ve çözüm odaklı bir yanıt ver. Kullanıcı mesajı: ${message}`,
      label: 'Asistan sohbeti',
    });
    res.json({ text });
  } catch (error: any) {
    console.error("Error in chat assistant endpoint:", error);
    res.status(500).json({ error: error.message || "Failed to process message" });
  }
});

/**
 * Akvizyon grup nöbeti — 21:00 Europe/Istanbul sonrası otomatik kapat/arşiv.
 * Auth: X-Cron-Secret veya Authorization: Bearer <CRON_SECRET>
 */
app.post('/api/cron/akvizyon-nobet-kapat', async (req, res) => {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({ error: 'CRON_SECRET tanımlı değil' });
  }
  const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (headerSecret !== expected && bearer !== expected) {
    return res.status(401).json({ error: 'Yetkisiz cron isteği' });
  }
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase Admin yapılandırılmamış' });
  }

  try {
    const {
      buildAkvizyonOtomatikKapanisPayload,
      collectAkvizyonPersonelForDate,
      istanbulTodayKey,
      shouldAutoCloseAkvizyonNobet,
      AKVIZYON_NOBET_KAPANIS_SAAT,
    } = await import('../lib/akvizyonNobetAutoArchive');

    const force = Boolean(req.body?.force);
    const tarih = String(req.body?.tarih || istanbulTodayKey()).slice(0, 10);
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    const existingSnap = await db.collection('akvizyonYoklamalari').doc(tarih).get();
    const existing = existingSnap.exists
      ? ({ id: existingSnap.id, ...existingSnap.data() } as any)
      : null;

    if (!force && !shouldAutoCloseAkvizyonNobet(tarih, existing)) {
      return res.json({
        success: true,
        skipped: true,
        reason: existing?.kilitli
          ? 'already_locked'
          : 'before_close_time',
        tarih,
        closeHour: AKVIZYON_NOBET_KAPANIS_SAAT,
      });
    }

    const personelSnap = await db.collection('personeller').get();
    const personeller = personelSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const akvizyonList = collectAkvizyonPersonelForDate(personeller, tarih);
    const payload = buildAkvizyonOtomatikKapanisPayload({
      tarih,
      personelIds: akvizyonList.map((p) => p.id),
      existing,
      kaydeden: 'sistem_otomatik_cron',
    });

    await db.collection('akvizyonYoklamalari').doc(tarih).set(payload, { merge: true });
    await db.collection('akvizyonNobetArsivleri').doc(tarih).set(
      {
        ...payload,
        arsivTipi: 'AKVIZYON_GRUP_NOBET',
        personelSayisi: akvizyonList.length,
        geldiSayisi: Object.values(payload.yoklama || {}).filter((v) => v === 'Geldi').length,
        gelmediSayisi: Object.values(payload.yoklama || {}).filter((v) => v === 'Gelmedi').length,
      },
      { merge: true }
    );

    return res.json({
      success: true,
      archived: true,
      tarih,
      personelSayisi: akvizyonList.length,
      kapanisZamani: payload.kapanisZamani,
    });
  } catch (error: any) {
    console.error('Akvizyon nöbet otomatik kapanış hatası:', error);
    return res.status(500).json({ error: error.message || 'Otomatik kapanış başarısız' });
  }
});

}
