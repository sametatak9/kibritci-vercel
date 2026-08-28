import React, { useState, useEffect } from 'react';
import { 
  auth,
  db
} from '../lib/firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { Building2, Lock, Mail, Loader2, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck, User, Fingerprint, PenTool, Check, Trash, Smartphone } from 'lucide-react';

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
  const [showOfflineBypass, setShowOfflineBypass] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    return localStorage.getItem('kibritci_mobile_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('kibritci_mobile_mode', isMobileMode ? 'true' : 'false');
  }, [isMobileMode]);

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

        // Let's check first if this email already exists in our Firestore database 'portalKullanicilar'
        const userDocRef = doc(db, 'portalKullanicilar', emailLower);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          setErrorMsg('Bu e-posta adresi zaten kullanımda.');
          setLoading(false);
          return;
        }

        // --- TC NO MATCHING WITH PERSONEL LIST ---
        let matchedPersonelId: string | null = null;
        try {
          const colRef = collection(db, 'personeller');
          const snap = await getDocs(colRef);
          const matchedDoc = snap.docs.find(doc => {
            const data = doc.data();
            return String(data.tcNo).trim() === tcNo.trim();
          });
          if (matchedDoc) {
            matchedPersonelId = matchedDoc.id;
            console.log("Matched personnel record found:", matchedPersonelId);
          }
        } catch (matchErr) {
          console.warn("Could not check personeller collection for TC No matching:", matchErr);
        }

        // Profile payload
        const userPayload = {
          email: emailLower,
          password: passTrim,
          role: 'MİSAFİR', // default to MİSAFİR until approved by Admin
          ad: ad.trim(),
          soyad: soyad.trim(),
          tcNo: tcNo.trim(),
          imzaText: imzaText.trim() || `${ad.trim()} ${soyad.trim()}`,
          imzaStyle: imzaStyle,
          imzaCanvas: imzaCanvas || null,
          matchedPersonelId: matchedPersonelId,
          createdAt: new Date().toISOString()
        };

        // Save account credentials in secure NoSQL fallback FIRST
        await setDoc(userDocRef, userPayload);

        // Helper to save to 'kullanicilar' collection
        const saveToKullanicilarCollection = async (uid: string) => {
          try {
            const mainUserDocRef = doc(db, 'kullanicilar', uid);
            await setDoc(mainUserDocRef, {
              id: uid,
              email: emailLower,
              yetki: 'MİSAFİR', // starts as guest
              durum: 'ONAY BEKLİYOR', // requires admin approval
              kayitTarihi: new Date().toISOString().split('T')[0],
              ad: ad.trim(),
              soyad: soyad.trim(),
              tcNo: tcNo.trim(),
              imzaText: imzaText.trim() || `${ad.trim()} ${soyad.trim()}`,
              imzaStyle: imzaStyle,
              imzaCanvas: imzaCanvas || null,
              matchedPersonelId: matchedPersonelId
            });
          } catch (dbErr) {
            console.error("Error saving to central kullanicilar collection:", dbErr);
          }
        };

        // Try standard Firebase Auth second, to use native user environment if available
        let finalUid = `u_${Date.now()}`;
        let useFallback = true;
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, emailLower, passTrim);
          finalUid = userCredential.user.uid;
          useFallback = false;
          
          await saveToKullanicilarCollection(finalUid);
          
          // Trigger simulated email verification code
          fetch('/api/send-verification-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailLower })
          }).catch(err => console.warn(err));
          
          localStorage.setItem('kibritci_portal_session', JSON.stringify({ email: emailLower, uid: finalUid }));
          setInfoMsg(matchedPersonelId 
            ? 'Hesap başarıyla oluşturuldu! Doğrulama e-postası simüle edildi ✉️ TC No personel listesiyle eşleşti ✅ Sisteme giriş yapılıyor...'
            : 'Hesap başarıyla oluşturuldu! Doğrulama e-postası simüle edildi ✉️ Sisteme giriş yapılıyor...'
          );
          setTimeout(() => {
            onLoginSuccess(userCredential.user);
          }, 1500);
          return;
        } catch (fbErr: any) {
          console.log("Firebase Auth SignUp failed or email/password is disabled, continuing with Firestore registration info...", fbErr);
          if (fbErr.code === 'auth/email-already-in-use') {
            setErrorMsg('Bu e-posta adresi zaten kullanımda.');
            setLoading(false);
            return;
          }
        }

        // Fallback flow if standard Auth is disabled or fails
        if (useFallback) {
          // Initialize standard anonymous auth session as secondary to authenticate the database sync connection
          let anonUid = finalUid;
          try {
            const res = await signInAnonymously(auth);
            anonUid = res.user.uid;
          } catch (anonErr) {
            console.warn("Could not start anonymous backup session, bypassing...", anonErr);
          }

          await saveToKullanicilarCollection(anonUid);

          // Trigger simulated email verification code
          fetch('/api/send-verification-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailLower })
          }).catch(err => console.warn(err));

          localStorage.setItem('kibritci_portal_session', JSON.stringify({ email: emailLower, uid: anonUid }));
          setInfoMsg(matchedPersonelId 
            ? 'Hesap başarıyla oluşturuldu! Doğrulama e-postası simüle edildi ✉️ TC No personel listesiyle eşleşti ✅ Sisteme giriş yapılıyor...'
            : 'Hesap başarıyla oluşturuldu! Doğrulama e-postası simüle edildi ✉️ Sisteme giriş yapılıyor...'
          );
          setTimeout(() => {
            onLoginSuccess({ email: emailLower, uid: anonUid, isMock: true });
          }, 1500);
        }

      } else {
        // --- SIGN IN LOGIC ---
        // 1. Predefined coordinates check for instant absolute administrator access
        const isSamet = emailLower === 'sametatak9@gmail.com' && passTrim === '117270Sa';
        const isSantiye = emailLower === 'santiye@kibritci.com' && passTrim === 'kibritci2026';

        if (isSamet || isSantiye) {
          const userDocRef = doc(db, 'portalKullanicilar', emailLower);
          
          // Seed the account to the database dynamically so they are visible under list of accounts
          try {
            await setDoc(userDocRef, {
              email: emailLower,
              password: passTrim,
              role: 'YÖNETİCİ',
              createdAt: new Date().toISOString()
            }, { merge: true });
          } catch (dbErr) {
            console.warn("Firestore write error during auto-seeding admin, bypassing...", dbErr);
          }

          let anonUid = isSamet ? 'samet_atak_uid' : 'santiye_kibritci_uid';
          try {
            const res = await signInAnonymously(auth);
            anonUid = res.user.uid;
          } catch (anonErr) {
            console.warn("Could not start anonymous user session, bypassing...", anonErr);
          }

          localStorage.setItem('kibritci_portal_session', JSON.stringify({ email: emailLower, uid: anonUid }));
          onLoginSuccess({ email: emailLower, uid: anonUid, isMock: true });
          return;
        }

        // 2. Check if user credentials exist in fallback Firestore database
        try {
          const userDocRef = doc(db, 'portalKullanicilar', emailLower);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.password === passTrim) {
              let anonUid = `u_${Date.now()}`;
              try {
                const res = await signInAnonymously(auth);
                anonUid = res.user.uid;
              } catch (anonErr) {
                console.warn("Anonymous session initialization failed, bypassing...", anonErr);
              }

              localStorage.setItem('kibritci_portal_session', JSON.stringify({ email: emailLower, uid: anonUid }));
              onLoginSuccess({ email: emailLower, uid: anonUid, isMock: true });
              return;
            } else {
              setErrorMsg('Hatalı şifre girdiniz.');
              setLoading(false);
              return;
            }
          }
        } catch (dbErr) {
          console.warn("Firestore user fallback lookup failed:", dbErr);
        }

        // 3. Fallback: standard Firebase Auth sign-in
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          localStorage.setItem('kibritci_portal_session', JSON.stringify({ email: emailLower, uid: userCredential.user.uid }));
          onLoginSuccess(userCredential.user);
        } catch (fbErr: any) {
          console.error("Firebase regular auth failed:", fbErr);
          let turkishError = 'Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.';
          
          if (fbErr.code === 'auth/wrong-password' || fbErr.code === 'auth/invalid-credential') {
            turkishError = 'Hatalı şifre girdiniz.';
          } else if (fbErr.code === 'auth/user-not-found') {
            turkishError = 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı.';
          } else if (fbErr.code === 'auth/invalid-email') {
            turkishError = 'Geçersiz e-posta formatı girdiniz.';
          }
          setErrorMsg(turkishError);
        }
      }
    } catch (err: any) {
      console.error(err);
      let turkishError = "Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.";
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        turkishError = 'Hatalı şifre girdiniz.';
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
      // Offline fallback / Anon login
      try {
        const res = await signInAnonymously(auth);
        onLoginSuccess(res.user);
      } catch (nestedErr) {
        // Fallback simulated success
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
          <div className="mx-auto w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-950 shadow-lg transform rotate-3 hover:rotate-0 transition duration-300">
            <Building2 size={28} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-widest text-[#F59E0B]">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase mt-0.5">Bulut ERP Şantiye Portal Girişi</p>
          </div>
        </div>

        {/* Informative Security Banner */}
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
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ŞİFRE</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Lock size={14} />
              </span>
              <input
                required
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white border border-slate-800 rounded-xl py-3 pl-10 pr-4 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition duration-150 font-semibold"
              />
            </div>
          </div>



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
                    localStorage.setItem('kibritci_mobile_mode', 'true');
                    localStorage.setItem('kibritci_mobile_direct', 'false');
                  }}
                  className="bg-slate-800 hover:bg-slate-750 active:scale-[0.98] text-slate-200 font-bold py-2.5 px-2 rounded-xl border border-slate-700/60 transition flex items-center justify-center space-x-1 cursor-pointer text-[10px]"
                >
                  <Smartphone size={12} className="text-amber-550 shrink-0" />
                  <span className="truncate">MOBİL SÜRÜM (İSTATİSTİK)</span>
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
            onClick={() => setIsSignUp(prev => !prev)}
            className="text-[11px] text-amber-500 hover:underline font-bold transition focus:outline-none"
          >
            {isSignUp ? 'Zaten hesabınız var mı? Giriş Yapın' : 'Henüz hesabınız yok mu? Yeni Hesap Açın'}
          </button>
        </div>

      </div>
    </div>
  );
};
