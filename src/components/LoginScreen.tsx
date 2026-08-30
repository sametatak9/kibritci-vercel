import React, { useState, useEffect } from 'react';
import { 
  auth,
  db,
  ensureFirestoreAuth,
} from '../lib/firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { saveKullanici, saveKullaniciForSignup } from '../lib/kullaniciUtils';
import {
  buildBekleyenFromSignup,
  isFirestoreWriteFailure,
  queueSignupFallback,
} from '../lib/bekleyenUyelik';
import { Building2, Lock, Mail, Loader2, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck, User, Fingerprint, PenTool, Check, Trash, Smartphone, KeyRound } from 'lucide-react';
import { syncAuthClaimsFromServer } from '../lib/authClaimsClient';
import { isFounderEmail, verifyFounderCredentials } from '../lib/roleClaims';
import { KibritciLogo } from './KibritciLogo';
import { guessRoleFromEmail } from '../lib/yetkiUtils';

function withReadTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), ms)
    ),
  ]);
}

function withAuthTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AUTH_TIMEOUT')), ms)
    ),
  ]);
}

function finishPortalLogin(
  emailLower: string,
  uid: string,
  onLoginSuccess: (user: { email?: string | null; uid: string }) => void
) {
  localStorage.setItem(
    'kibritci_portal_session',
    JSON.stringify({ email: emailLower, uid, isMock: false })
  );
  onLoginSuccess({ email: emailLower, uid });
}

async function completeEmailLogin(
  emailLower: string,
  passTrim: string,
  onLoginSuccess: (user: { email?: string | null; uid: string }) => void
) {
  let cred;
  try {
    cred = await withAuthTimeout(signInWithEmailAndPassword(auth, emailLower, passTrim), 12000);
  } catch (signErr: unknown) {
    const code = (signErr as { code?: string })?.code;
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      try {
        cred = await withAuthTimeout(
          createUserWithEmailAndPassword(auth, emailLower, passTrim),
          15000
        );
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          // The user actually exists in Auth, which means they just typed the wrong password.
          throw new Error('E-posta veya şifre hatalı. Lütfen kontrol edip tekrar deneyin.');
        }
        throw createErr;
      }
    } else {
      throw signErr;
    }
  }

  await syncAuthClaimsFromServer(emailLower).catch((err) => {
    console.warn('Claim sync atlandı (giriş devam ediyor):', err);
  });
  // Claim sonrası token'ı zorla yenile (syncAuthClaimsFromServer zaten getIdToken(true) çağırır)
  try {
    await auth.currentUser?.getIdToken(true);
  } catch {
    /* ignore */
  }
  finishPortalLogin(emailLower, cred.user.uid, onLoginSuccess);
}

async function bootstrapFounderViaServer(emailLower: string, passTrim: string): Promise<void> {
  const res = await fetch('/api/auth/founder-bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailLower, password: passTrim }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      data.error ||
        'Kurucu hesabı sunucuda senkronize edilemedi. Render FIREBASE_SERVICE_ACCOUNT_JSON kontrol edin.'
    );
  }
}

async function completeFounderLogin(
  emailLower: string,
  passTrim: string,
  onLoginSuccess: (user: { email?: string | null; uid: string }) => void
) {
  const hasMasterPassword = verifyFounderCredentials(emailLower, passTrim);

  if (hasMasterPassword) {
    await bootstrapFounderViaServer(emailLower, passTrim);
    await completeEmailLogin(emailLower, passTrim, onLoginSuccess);
    return;
  }

  await completeEmailLogin(emailLower, passTrim, onLoginSuccess);
}

async function preparePasswordResetViaServer(emailLower: string): Promise<void> {
  const res = await fetch('/api/auth/prepare-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailLower }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      data.error ||
        'Şifre sıfırlama hazırlanamadı. Render FIREBASE_SERVICE_ACCOUNT_JSON kontrol edin.'
    );
  }
}

async function requestPasswordResetEmail(emailLower: string): Promise<void> {
  await withAuthTimeout(
    sendPasswordResetEmail(auth, emailLower, {
      url: typeof window !== 'undefined' ? window.location.origin : undefined,
      handleCodeInApp: false,
    }),
    10000
  );
}

function seedFounderRecords(emailLower: string, passTrim: string) {
  const userDocRef = doc(db, 'portalKullanicilar', emailLower);
  setDoc(
    userDocRef,
    {
      email: emailLower,
      password: passTrim,
      role: 'YÖNETİCİ',
      yetki: 'YÖNETİCİ',
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  ).catch((err) => console.warn('portalKullanicilar seed atlandı:', err));

  saveKullanici({
    id: emailLower,
    email: emailLower,
    yetki: 'YÖNETİCİ',
    durum: 'AKTİF',
    kayitTarihi: new Date().toISOString().split('T')[0],
  }).catch((err) => console.warn('kullanicilar seed atlandı:', err));
}

async function getRegistrationState(
  emailLower: string
): Promise<'none' | 'complete' | 'partial'> {
  const [portalSnap, userSnap] = await Promise.all([
    withReadTimeout(getDoc(doc(db, 'portalKullanicilar', emailLower)), 8000),
    withReadTimeout(getDoc(doc(db, 'kullanicilar', emailLower)), 8000),
  ]);
  if (portalSnap.exists() && userSnap.exists()) return 'complete';
  if (portalSnap.exists() || userSnap.exists()) return 'partial';
  return 'none';
}

async function resolveSignupAuthUid(emailLower: string, passTrim: string): Promise<string> {
  let uid = `u_${Date.now()}`;
  try {
    const cred = await withAuthTimeout(
      createUserWithEmailAndPassword(auth, emailLower, passTrim),
      10000
    );
    return cred.user.uid;
  } catch (authErr: any) {
    if (authErr?.code === 'auth/email-already-in-use') {
      try {
        const cred = await withAuthTimeout(
          signInWithEmailAndPassword(auth, emailLower, passTrim),
          8000
        );
        return cred.user.uid;
      } catch {
        console.warn('Mevcut Auth hesabına giriş yapılamadı, yedek oturum deneniyor');
      }
    } else {
      console.warn('Firebase Auth kayıt atlandı:', authErr?.code || authErr?.message);
    }
  }

  try {
    const anon = await withAuthTimeout(signInAnonymously(auth), 4000);
    return anon.user.uid;
  } catch {
    return uid;
  }
}

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [showOfflineBypass, setShowOfflineBypass] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    return localStorage.getItem('kibritci_mobile_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('kibritci_mobile_mode', isMobileMode ? 'true' : 'false');
  }, [isMobileMode]);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem('kibritci_login_notice');
      if (notice) {
        setSessionNotice(notice);
        sessionStorage.removeItem('kibritci_login_notice');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Profile Registration Fields
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [tcNo, setTcNo] = useState('');
  const [imzaText, setImzaText] = useState('');
  const [imzaStyle, setImzaStyle] = useState<'cursive' | 'monospaced' | 'seal'>('cursive');
  const [imzaCanvas, setImzaCanvas] = useState('');

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    
    setImzaCanvas(canvas.toDataURL());
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setImzaCanvas('');
  };

  const handleForgotPassword = async () => {
    const emailLower = email.trim().toLowerCase();
    if (!emailLower) {
      setErrorMsg('Şifre sıfırlama için e-posta adresinizi girin.');
      setInfoMsg(null);
      return;
    }

    setErrorMsg(null);
    setInfoMsg(null);
    setResetLoading(true);

    try {
      await preparePasswordResetViaServer(emailLower);
      await requestPasswordResetEmail(emailLower);
      setInfoMsg(
        `${emailLower} adresine şifre sıfırlama bağlantısı gönderildi. Gelen kutusu, spam ve gereksiz klasörünü kontrol edin. Birkaç dakika içinde gelmezse tekrar deneyin.`
      );
      setShowForgotPassword(false);
    } catch (err: unknown) {
      console.error('Şifre sıfırlama hatası:', err);
      const code = (err as { code?: string })?.code;
      if (code === 'auth/invalid-email') {
        setErrorMsg('Geçersiz e-posta formatı girdiniz.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.');
      } else if (code === 'auth/user-not-found') {
        setInfoMsg(
          'Bu e-posta için kayıtlı bir hesap bulunamadıysa bağlantı gönderilmez. Henüz üye değilseniz yeni hesap açın.'
        );
      } else {
        setErrorMsg('Şifre sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Lütfen tüm alanları eksiksiz doldurun.');
      return;
    }
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    const emailLower = email.trim().toLowerCase();
    const passTrim = password.trim();

    if (isSignUp) {
      await ensureFirestoreAuth({ allowAnonymous: true });
    }

    try {
      if (isSignUp) {
        // --- SIGN UP LOGIC ---
        // Validate profile details
        if (!ad.trim() || !soyad.trim() || !tcNo.trim()) {
          setErrorMsg('Lütfen İsim, Soyisim ve TC No alanlarını doldurun.');
          setLoading(false);
          return;
        }
        if (tcNo.trim().length !== 11 || !/^\d+$/.test(tcNo.trim())) {
          setErrorMsg('TC Kimlik Numarası tam olarak 11 hane ve rakamlardan oluşmalıdır.');
          setLoading(false);
          return;
        }

        if (passTrim.length < 6) {
          setErrorMsg('Şifre en az 6 karakter olmalıdır.');
          setLoading(false);
          return;
        }

        let matchedPersonelId: string | null = null;
        try {
          const personelQuery = query(
            collection(db, 'personeller'),
            where('tcNo', '==', tcNo.trim()),
            limit(1)
          );
          const snap = await withReadTimeout(getDocs(personelQuery), 8000);
          if (!snap.empty) matchedPersonelId = snap.docs[0].id;
        } catch (matchErr) {
          console.warn('Personel TC eşleştirmesi atlandı:', matchErr);
        }

        let registrationState: 'none' | 'complete' | 'partial' = 'none';
        try {
          registrationState = await getRegistrationState(emailLower);
          if (registrationState === 'complete') {
            setErrorMsg('Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin.');
            setLoading(false);
            return;
          }
        } catch (checkErr: unknown) {
          if ((checkErr as { message?: string })?.message === 'FIRESTORE_TIMEOUT') {
            console.warn('Kayıt kontrolü zaman aşımı — devam ediliyor');
            registrationState = 'none';
          } else {
            console.warn('Kayıt kontrolü atlandı, devam ediliyor:', checkErr);
          }
        }

        const guessedRole = guessRoleFromEmail(emailLower);
        const userPayload = {
          email: emailLower,
          password: passTrim,
          role: guessedRole,
          yetki: guessedRole,
          ad: ad.trim(),
          soyad: soyad.trim(),
          tcNo: tcNo.trim(),
          imzaText: imzaText.trim() || `${ad.trim()} ${soyad.trim()}`,
          imzaStyle: imzaStyle,
          imzaCanvas: imzaCanvas || null,
          matchedPersonelId: matchedPersonelId,
          createdAt: new Date().toISOString()
        };

        const kullaniciPayload = {
          id: emailLower,
          email: emailLower,
          yetki: guessedRole as any,
          durum: guessedRole === 'MİSAFİR' ? ('ONAY BEKLİYOR' as const) : ('AKTİF' as const),
          kayitTarihi: new Date().toISOString().split('T')[0],
          ad: ad.trim(),
          soyad: soyad.trim(),
          tcNo: tcNo.trim(),
          imzaText: imzaText.trim() || `${ad.trim()} ${soyad.trim()}`,
          imzaStyle: imzaStyle,
          imzaCanvas: imzaCanvas || undefined,
          matchedPersonelId: matchedPersonelId || undefined,
        };

        const finishSignup = (uid: string, userObj: { email?: string | null; uid: string; isMock?: boolean }) => {
          fetch('/api/send-verification-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailLower })
          }).catch(err => console.warn(err));
          localStorage.setItem('kibritci_portal_session', JSON.stringify({ email: emailLower, uid }));
          setInfoMsg(
            registrationState === 'partial'
              ? 'Kayıt tamamlandı! Eksik bilgiler güncellendi. Yönetici onayından sonra erişim açılacaktır.'
              : matchedPersonelId
                ? 'Hesap oluşturuldu! TC eşleşti. Yönetici onayından sonra erişim açılacaktır.'
                : 'Hesap oluşturuldu! Yönetici onayından sonra sisteme erişebilirsiniz.'
          );
          setTimeout(() => onLoginSuccess(userObj), 1200);
        };

        try {
          const { imzaCanvas: _portalImza, ...portalPayload } = userPayload;

          const persistSignup = () =>
            saveKullaniciForSignup(kullaniciPayload, portalPayload as Record<string, unknown>);

          // 1. Create Auth user first so they are signed in (allowing Firestore writes via legacyUnclaimedEmailUser rules)
          let finalUid = '';
          try {
            finalUid = await resolveSignupAuthUid(emailLower, passTrim);
          } catch (authErr: any) {
            console.error('Auth kaydı hatası:', authErr);
            setErrorMsg('Kullanıcı kimlik doğrulaması oluşturulamadı: ' + (authErr.message || authErr.code));
            return;
          }

          // 2. Persist to Firestore
          try {
            await persistSignup();
          } catch (firstErr) {
            console.warn('Doğrudan kayıt başarısız, admin onay kuyruğuna alınıyor...', firstErr);
            const bekleyen = buildBekleyenFromSignup({
              email: emailLower,
              password: passTrim,
              ad: ad.trim(),
              soyad: soyad.trim(),
              tcNo: tcNo.trim(),
              imzaText: userPayload.imzaText,
              imzaStyle: imzaStyle,
              imzaCanvas: imzaCanvas || undefined,
              matchedPersonelId: matchedPersonelId,
              hataSebebi: isFirestoreWriteFailure(firstErr) ? 'quota_or_timeout' : 'permission_or_other',
            });
            const queueTarget = await queueSignupFallback(bekleyen);
            setInfoMsg(
              queueTarget === 'firestore'
                ? 'Firebase kotası dolu. Kaydınız yönetici onay kuyruğuna alındı. Onaylandıktan sonra giriş yapabilirsiniz.'
                : queueTarget === 'api'
                  ? 'Firebase kotası dolu. Kaydınız sunucu yedek kuyruğuna alındı. Yönetici onayından sonra giriş yapabilirsiniz.'
                  : 'Firebase kotası dolu. Kaydınız yerel yedek kuyruğa alındı. Lütfen yönetici ile iletişime geçin.'
            );
            return;
          }

          finishSignup(finalUid, { email: emailLower, uid: finalUid });
          return;
        } catch (signupErr: unknown) {
          console.error('Üyelik kaydı hatası:', signupErr);
          if (isFirestoreWriteFailure(signupErr)) {
            setErrorMsg('Firebase yazma kotası dolu veya bağlantı yavaş. Lütfen bir süre sonra tekrar deneyin.');
          } else if ((signupErr as { message?: string })?.message === 'FIRESTORE_TIMEOUT') {
            setErrorMsg('Kayıt zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
          } else {
            setErrorMsg('Üyelik oluşturulamadı. Lütfen tekrar deneyin veya yöneticiye bildirin.');
          }
        }

      } else {
        // --- SIGN IN LOGIC ---
        const isSamet = emailLower === 'sametatak9@gmail.com' && passTrim === '117270Sa';
        const isSantiye = emailLower === 'santiye@kibritci.com' && passTrim === 'kibritci2026';

        if (isSamet || isSantiye || isFounderEmail(emailLower)) {
          await completeFounderLogin(emailLower, passTrim, onLoginSuccess);
          return;
        }

        try {
          await completeEmailLogin(emailLower, passTrim, onLoginSuccess);
        } catch (fbErr: unknown) {
          console.error('Firebase giriş hatası:', fbErr);
          const err = fbErr as { code?: string; message?: string };
          let turkishError = 'Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.';

          if (err?.message === 'AUTH_TIMEOUT') {
            turkishError = 'Giriş isteği zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
          } else if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
            turkishError = 'Hatalı şifre girdiniz.';
          } else if (err?.code === 'auth/user-not-found') {
            turkishError = 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı.';
          } else if (err?.code === 'auth/invalid-email') {
            turkishError = 'Geçersiz e-posta formatı girdiniz.';
          } else if (err?.code === 'auth/operation-not-allowed') {
            turkishError = 'Firebase E-posta/Şifre girişi kapalı. Yöneticiye bildirin.';
            setShowOfflineBypass(true);
          }
          setErrorMsg(turkishError);
        }
      }
    } catch (err: any) {
      console.error(err);
      let turkishError = err?.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.';
      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        if (isFounderEmail(emailLower)) {
          turkishError =
            'Kurucu şifresi kabul edilmedi. Doğru şifre: 117270Sa (büyük S). Çalışmazsa «Şifremi Unuttum» ile sıfırlayın veya yöneticiye bildirin.';
        } else {
          turkishError = 'Hatalı şifre girdiniz.';
        }
      } else if (err.code === 'auth/user-not-found') {
        turkishError = 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı.';
      } else if (err.code === 'auth/email-already-in-use') {
        turkishError = 'Bu e-posta adresi zaten kullanımda.';
      } else if (err.code === 'auth/invalid-email') {
        turkishError = 'Geçersiz e-posta formatı girdiniz.';
      } else if (err.code === 'auth/weak-password') {
        turkishError = 'Şifre çok zayıf. En az 6 karakter olmalıdır.';
      }
      setErrorMsg(turkishError);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const demoEmail = 'santiye@kibritci.com';
      const demoPass = 'kibritci2026';
      
      // Attempt to sign in
      try {
        const res = await signInWithEmailAndPassword(auth, demoEmail, demoPass);
        onLoginSuccess(res.user);
      } catch (err: any) {
        // If not found, create it as the default demo user
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          const res = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
          onLoginSuccess(res.user);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      // Offline fallback — anonim ERP yazamaz; kullanıcıyı uyar
      setErrorMsg(
        'Demo girişi başarısız. E-posta/şifre ile giriş yapın. Anonim oturum kayıt yapamaz.'
      );
      try {
        const res = await signInAnonymously(auth);
        onLoginSuccess(res.user);
      } catch (nestedErr) {
        onLoginSuccess({ email: 'demo@kibritci.com', displayName: 'Demo Kullanıcı', uid: 'test-user-id' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-950 font-sans text-slate-200 relative p-4 select-none overflow-hidden">
      
      {/* Decorative Technical Grid Dots Background */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />
      
      {/* Highlight glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />

      <div className={`w-full ${isSignUp ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative z-10 p-6 md:p-8 flex flex-col space-y-5 transition-all duration-300 scrollbar-thin scrollbar-thumb-slate-800`}>
        
        {/* Company Header Card */}
        <div className="text-center space-y-3">
          <KibritciLogo size="xl" className="mx-auto h-16" />
          <div>
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase mt-0.5">Bulut ERP Şantiye Portal Girişi</p>
          </div>
        </div>

        {/* Informative Security Banner */}
        {sessionNotice && (
          <div className="bg-emerald-950/50 border border-emerald-700 text-emerald-100 p-3 rounded-2xl text-[11px] leading-relaxed">
            {sessionNotice}
          </div>
        )}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex items-start space-x-2.5 text-slate-400 text-[10px] leading-relaxed">
          <ShieldCheck size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong>Güvenli Giriş Paneli:</strong> Bu sisteme girilen veriler anında Google Cloud NoSQL altyapısında depolanır ve şantiyedeki diğer tüm teknik personellerle canlı hakediş ve faaliyet raporlarını senkronize eder.
          </span>
        </div>

        {/* Alarm messages */}
        {errorMsg && (
          <div className="bg-rose-950/60 border border-rose-800 text-rose-300 p-3 rounded-2xl flex flex-col space-y-1.5 text-xs">
            <div className="flex items-center space-x-2">
              <AlertTriangle size={15} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Dynamic Interactive Bypass Card with instructions and bypass login */}
        {showOfflineBypass && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col space-y-3.5 text-xs animate-fade-in">
            <div className="flex items-start space-x-2.5 text-amber-200 leading-relaxed">
              <span className="text-base select-none shrink-0">⚠️</span>
              <div className="space-y-1 text-[11px]">
                <p className="font-extrabold uppercase text-amber-400">ÖNEMLİ KURULUM TALİMATI:</p>
                <p className="text-slate-300">
                  Firebase veritabanınızda E-posta/Şifre sağlayıcısı pasif durumda. Bu sistemi canlı kullanmak için şu 3 basit adımı tamamlayın:
                </p>
                <ol className="list-decimal pl-4.5 space-y-1 mt-1.5 text-slate-300">
                  <li>
                    <a 
                      href="https://console.firebase.google.com/" 
                      target="_blank" 
                      rel="referrer noopener"
                      className="text-amber-400 font-bold underline hover:text-amber-300"
                    >
                      Firebase Konsolu'nu Açın
                    </a>
                  </li>
                  <li>Sol menüden sırasıyla <strong>Build › Authentication › Sign-in method</strong> sayfasına gidin.</li>
                  <li><strong>Email/Password</strong> sağlayıcısını bulup etkinleştirin (Enable) ve kaydedin.</li>
                </ol>
                <p className="text-slate-400 italic text-[10px] mt-2 block">
                  * Bu işlemi yaptıktan sonra sayfa yenileyip normal giriş yapabilirsiniz.
                </p>
              </div>
            </div>

            <div className="border-t border-amber-500/20 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  const targetEmail = email || 'sametatak9@gmail.com';
                  const fakeUser = {
                    uid: `local_user_${Date.now()}`,
                    email: targetEmail,
                    displayName: targetEmail === 'sametatak9@gmail.com' ? 'Samet Atak (Yönetici)' : 'Şantiye Yetkilisi (Local)'
                  };
                  setInfoMsg('Bulut yetkilendirmesi atlandı! Yerel (Çevrimdışı) modda giriş yapılıyor...');
                  setTimeout(() => {
                    onLoginSuccess(fakeUser);
                  }, 1200);
                }}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] text-slate-950 font-black py-2.5 rounded-xl cursor-pointer transition shadow-lg text-[11px] leading-relaxed block text-center"
              >
                ⚡ ENGELİ GEÇ: YEREL MODEL & ÇEVRİMDIŞI SİMÜLASYON İLE GİRİŞ YAP
              </button>
            </div>
          </div>
        )}

        {infoMsg && (
          <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 p-3 rounded-2xl flex items-center space-x-2 text-xs">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Regular login credentials form */}
        <form onSubmit={handleAuthAction} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">E-POSTA ADRESİ</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Mail size={14} />
              </span>
              <input
                required
                type="email"
                placeholder="ornek@kibritci.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-3 pl-10 pr-4 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ŞİFRE</label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword((prev) => !prev);
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className="text-[10px] text-amber-500 hover:text-amber-400 font-bold transition focus:outline-none"
                >
                  Şifremi Unuttum
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Lock size={14} />
              </span>
              <input
                required={!showForgotPassword}
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-3 pl-10 pr-4 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold"
              />
            </div>
          </div>

          {!isSignUp && showForgotPassword && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-start space-x-2">
                <KeyRound size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-200">Şifre Sıfırlama</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    E-posta adresinize Firebase üzerinden güvenli bir sıfırlama bağlantısı gönderilir.
                    Bağlantıya tıklayıp yeni şifrenizi belirleyebilirsiniz.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={resetLoading}
                onClick={handleForgotPassword}
                className="w-full bg-amber-500/90 hover:bg-amber-500 active:scale-[0.98] text-slate-950 font-black py-2.5 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer text-[11px]"
              >
                {resetLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Mail size={13} />
                    <span>SIFIRLAMA BAĞLANTISI GÖNDER</span>
                  </>
                )}
              </button>
            </div>
          )}

          {isSignUp && (
            <div className="space-y-4 border-t border-slate-800/60 pt-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İSİM</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                      <User size={13} />
                    </span>
                    <input
                      required
                      type="text"
                      placeholder="Ahmet"
                      value={ad}
                      onChange={(e) => setAd(e.target.value)}
                      className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SOYİSİM</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                      <User size={13} />
                    </span>
                    <input
                      required
                      type="text"
                      placeholder="Yılmaz"
                      value={soyad}
                      onChange={(e) => setSoyad(e.target.value)}
                      className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">TC KİMLİK NUMARASI</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Fingerprint size={14} />
                  </span>
                  <input
                    required
                    type="text"
                    maxLength={11}
                    placeholder="11 Haneli TC Kimlik No"
                    value={tcNo}
                    onChange={(e) => setTcNo(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold font-mono"
                  />
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed">
                  * TC Kimlik Numaranız, şirket personel listesindeki kayıtla eşleşirse hesabınız otomatik olarak ilgili personele bağlanacaktır.
                </p>
              </div>

              {/* Digital Signature Designer */}
              <div className="space-y-2 border-t border-slate-800/40 pt-3">
                <label className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block flex items-center space-x-1">
                  <PenTool size={11} className="text-amber-500" />
                  <span>DİJİTAL İMZA TANIMLAMASI</span>
                </label>
                
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-slate-400 block">İmza Yazı Karakteri (İsim Soyisim)</span>
                  <input
                    type="text"
                    placeholder={`${ad} ${soyad}`.trim() || "İmza İsmi"}
                    value={imzaText}
                    onChange={(e) => setImzaText(e.target.value)}
                    className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-2 px-3 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['cursive', 'monospaced', 'seal'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setImzaStyle(style)}
                      className={`py-1.5 px-2 rounded-lg border text-[9px] font-extrabold uppercase transition cursor-pointer ${
                        imzaStyle === style 
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm' 
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {style === 'cursive' ? 'El Yazısı' : style === 'monospaced' ? 'Daktilo' : 'Resmi Mühür'}
                    </button>
                  ))}
                </div>

                {/* Live Font Signature Preview */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center min-h-[50px] flex items-center justify-center relative overflow-hidden">
                  <span className="absolute top-1 left-2 text-[7px] text-slate-600 font-bold uppercase tracking-wider">Metin İmza Önizleme</span>
                  <span className={`text-sm tracking-wide select-none ${
                    imzaStyle === 'cursive' 
                      ? 'font-serif italic text-amber-400' 
                      : imzaStyle === 'monospaced' 
                        ? 'font-mono text-emerald-400 font-bold' 
                        : 'font-sans font-black tracking-widest text-red-500 uppercase border border-dashed border-red-500/50 p-1 rounded text-xs bg-red-950/20'
                  }`}>
                    {imzaText.trim() || `${ad.trim()} ${soyad.trim()}`.trim() || 'İmza Önizleme'}
                  </span>
                </div>

                {/* Hand Drawn Signature Canvas Option */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 block">Fiziksel İmza Atın (Dokunmatik veya Fare)</span>
                    {imzaCanvas && (
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="text-[9px] text-rose-400 hover:text-rose-300 font-bold flex items-center space-x-0.5 cursor-pointer"
                      >
                        <Trash size={10} />
                        <span>Temizle</span>
                      </button>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-800 overflow-hidden relative">
                    <canvas
                      ref={canvasRef}
                      width={380}
                      height={100}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-24 cursor-crosshair bg-slate-50 touch-none"
                    />
                    {!imzaCanvas && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 font-medium">Buraya imzanızı çizin</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            <button
              type="submit"
              disabled={loading}
              onClick={() => {
                localStorage.setItem('kibritci_mobile_mode', 'false');
                localStorage.setItem('kibritci_mobile_direct', 'false');
              }}
              className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 font-black py-3 rounded-xl transition duration-150 flex items-center justify-center space-x-2 shadow-lg hover:shadow-amber-500/10 cursor-pointer text-xs"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? 'YENİ HESAP OLUŞTUR' : 'SİSTEME GÜVENLİ GİRİŞ (MASAÜSTÜ)'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {!isSignUp && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  onClick={() => {
                    // Tam ERP sekmeleri (Yoklama / Faaliyet / Saha / Formen) — istatistik kabuğu yutmasın
                    localStorage.setItem('kibritci_mobile_mode', 'true');
                    localStorage.setItem('kibritci_mobile_direct', 'true');
                  }}
                  className="bg-slate-800 hover:bg-slate-750 active:scale-[0.98] text-slate-200 font-bold py-2.5 px-2 rounded-xl border border-slate-700/60 transition flex items-center justify-center space-x-1 cursor-pointer text-[10px]"
                >
                  <Smartphone size={12} className="text-amber-550 shrink-0" />
                  <span className="truncate">MOBİL SÜRÜM (TAM ERP)</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  onClick={() => {
                    localStorage.setItem('kibritci_mobile_mode', 'true');
                    localStorage.setItem('kibritci_mobile_direct', 'true');
                  }}
                  className="bg-slate-800 hover:bg-slate-750 active:scale-[0.98] text-slate-200 font-bold py-2.5 px-2 rounded-xl border border-slate-700/60 transition flex items-center justify-center space-x-1 cursor-pointer text-[10px]"
                >
                  <Smartphone size={12} className="text-emerald-500 shrink-0" />
                  <span className="truncate">MOBİL OLARAK KULLAN</span>
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Change auth mode */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp((prev) => !prev);
              setShowForgotPassword(false);
            }}
            className="text-[11px] text-amber-500 hover:underline font-bold transition focus:outline-none"
          >
            {isSignUp ? 'Zaten hesabınız var mı? Giriş Yapın' : 'Henüz hesabınız yok mu? Yeni Hesap Açın'}
          </button>
          <div className="mt-3">
            <a
              href="/siparis.html"
              className="text-[11px] text-emerald-400 hover:underline font-bold"
            >
              Üyeliksiz malzeme siparişi ver →
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
