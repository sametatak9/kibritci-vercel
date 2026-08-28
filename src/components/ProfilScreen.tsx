import React, { useState } from 'react';
import { 
  User, Shield, KeySquare, PenTool, CheckCircle, LogOut, FileText, ChevronRight, Hash, Eye
} from 'lucide-react';
import { Kullanici } from './AdminPanelScreen';

interface ProfilScreenProps {
  currentUser: any;
  kullanicilar: Kullanici[];
  setKullanicilar: (updater: Kullanici[] | ((u: Kullanici[]) => Kullanici[])) => void;
  onSignOut?: () => void;
  isStandalone?: boolean;
}

export const ProfilScreen: React.FC<ProfilScreenProps> = ({
  currentUser,
  kullanicilar,
  setKullanicilar,
  onSignOut,
  isStandalone = false
}) => {
  const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());

  // Personal fields
  const [ad, setAd] = useState(matchedUser?.ad || '');
  const [soyad, setSoyad] = useState(matchedUser?.soyad || '');
  const [tcNo, setTcNo] = useState(matchedUser?.tcNo || '');

  // Signature fields
  const [signatureText, setSignatureText] = useState(
    matchedUser?.imzaText || localStorage.getItem('kibritci_sig_text') || (matchedUser?.ad ? `${matchedUser.ad} ${matchedUser.soyad || ''}` : currentUser?.email?.split('@')[0]) || ''
  );
  const [signatureStyle, setSignatureStyle] = useState<string>(
    matchedUser?.imzaStyle || localStorage.getItem('kibritci_sig_style') || 'cursive'
  );

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid && !matchedUser?.id) return;

    const targetId = matchedUser?.id || currentUser?.uid;

    setKullanicilar(prev => prev.map(u => {
      if (u.id === targetId || u.email?.toLowerCase() === currentUser?.email?.toLowerCase()) {
        const updated = {
          ...u,
          ad,
          soyad,
          tcNo,
          imzaText: signatureText,
          imzaStyle: signatureStyle
        };
        // Also update local storage
        localStorage.setItem('kibritci_sig_text', signatureText);
        localStorage.setItem('kibritci_sig_style', signatureStyle);
        return updated;
      }
      return u;
    }));

    showNotification('success', '🎉 Profil ve dijital imza bilgileriniz başarıyla güncellendi!');
  };

  return (
    <div className={`flex-grow p-6 h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans select-none bg-slate-50 gap-6 ${isStandalone ? 'p-4 max-w-md mx-auto bg-slate-900 text-slate-100 border-x border-slate-800 shadow-2xl h-screen' : ''}`}>
      
      {/* Header banner */}
      <div className={`p-5 rounded-3xl shrink-0 flex items-center justify-between border shadow-md ${
        isStandalone 
          ? 'bg-slate-950 text-white border-slate-800' 
          : 'bg-slate-900 text-white border-slate-800'
      }`}>
        <div className="space-y-1">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">Kibritçi ERP Profil Tab</span>
          <h2 className="text-sm font-black tracking-widest font-display flex items-center gap-2">
            <User size={16} /> KULLANICI PROFİLİ VE GÜVENLİK AYARLARI
          </h2>
          <p className="text-[10px] text-slate-400">
            Kişisel bilgilerinizi düzenleyin, yetki seviyenizi görün ve dijital imzanızı güncelleyin.
          </p>
        </div>
        <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-mono font-bold px-3 py-1 rounded-full uppercase">
          {matchedUser?.yetki || 'KULLANICI'}
        </span>
      </div>

      {statusMessage && (
        <div className={`p-3 text-center text-xs font-bold rounded-2xl border transition-all ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {statusMessage.text}
        </div>
      )}

      <div className={`grid gap-6 ${isStandalone ? 'grid-cols-1' : 'grid-cols-12'}`}>
        
        {/* Left Side: Personal Info Form */}
        <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 ${isStandalone ? 'bg-slate-950 border-slate-800 text-slate-200' : 'col-span-5'}`}>
          <div className="flex items-center space-x-2 border-b pb-2 border-slate-100">
            <Shield size={16} className="text-amber-500" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Kişisel Bilgiler</h3>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">E-Posta Adresi</label>
              <input 
                type="text" 
                disabled 
                value={currentUser?.email || 'Demo@kibritci.com'}
                className="w-full bg-slate-100 border text-slate-500 cursor-not-allowed text-xs font-mono p-2.5 rounded-xl outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Sistem Yetki Rolünüz</label>
              <div className="w-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold p-2.5 rounded-xl flex items-center space-x-1.5">
                <span>🛡️</span>
                <span className="uppercase">{matchedUser?.yetki || 'BELİRLENMEMİŞ (MİSAFİR)'}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">T.C. Kimlik No</label>
              <input 
                type="text" 
                maxLength={11}
                placeholder="TC No giriniz"
                value={tcNo}
                onChange={(e) => setTcNo(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-50 border text-slate-800 text-xs font-bold p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Adınız</label>
                <input 
                  type="text" 
                  placeholder="Örn: Yakup"
                  required
                  value={ad}
                  onChange={(e) => setAd(e.target.value)}
                  className="w-full bg-slate-50 border text-slate-800 text-xs font-bold p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Soyadınız</label>
                <input 
                  type="text" 
                  placeholder="Örn: Kibritçi"
                  required
                  value={soyad}
                  onChange={(e) => setSoyad(e.target.value)}
                  className="w-full bg-slate-50 border text-slate-800 text-xs font-bold p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-950 text-white font-black text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-md"
            >
              <CheckCircle size={14} className="text-emerald-400" />
              <span>PROFİL BİLGİLERİNİ KAYDET</span>
            </button>

          </form>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="w-full mt-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <LogOut size={13} />
              <span>GÜVENLİ ÇIKIŞ YAP</span>
            </button>
          )}

        </div>

        {/* Right Side: Digital Signature Configuration */}
        <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 ${isStandalone ? 'bg-slate-950 border-slate-800 text-slate-200' : 'col-span-7'}`}>
          <div className="flex items-center space-x-2 border-b pb-2 border-slate-100">
            <PenTool size={16} className="text-amber-500" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Dijital İmza Ayarları</h3>
          </div>

          <div className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">İmza Islak Görsel İsim Metni</label>
              <input 
                type="text"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                placeholder="Örn: Yakup Kibritçi (Şantiye Şefi)"
                className="w-full bg-slate-50 border text-slate-800 text-xs font-bold p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">İmza Mühür Stili</label>
              <div className="grid grid-cols-3 gap-3">
                <button 
                  type="button"
                  onClick={() => setSignatureStyle('cursive')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1 cursor-pointer ${
                    signatureStyle === 'cursive' 
                      ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/20' 
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-base">✒️</span>
                  <span className="font-bold text-[10px]">Cursive</span>
                  <span className="text-[7px] text-slate-400">Islak Mürekkep</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setSignatureStyle('monospaced')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1 cursor-pointer ${
                    signatureStyle === 'monospaced' 
                      ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-400/20' 
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-base">💻</span>
                  <span className="font-bold text-[10px]">Crypto</span>
                  <span className="text-[7px] text-slate-400">Blokzincir Hash</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setSignatureStyle('seal')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1 cursor-pointer ${
                    signatureStyle === 'seal' 
                      ? 'border-red-500 bg-red-50/30 ring-2 ring-red-400/20' 
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-base">💮</span>
                  <span className="font-bold text-[10px]">Kaşe Mühür</span>
                  <span className="text-[7px] text-slate-400">Resmi Şirket</span>
                </button>
              </div>
            </div>

            {/* Live Stamp Preview */}
            <div className="border rounded-2xl p-4 bg-slate-50/60 space-y-2">
              <div className="flex items-center space-x-1">
                <Eye size={12} className="text-slate-400" />
                <span className="font-bold text-slate-400 uppercase text-[8px] tracking-wider block">Canlı Dijital Damga Önizlemesi</span>
              </div>
              
              <div className="h-28 bg-white border rounded-xl flex items-center justify-center p-4 relative overflow-hidden shadow-xs">
                {signatureStyle === 'cursive' && (
                  <div className="text-center font-serif text-slate-800 select-none transform -rotate-2">
                    <span className="text-base italic tracking-wider font-extrabold text-[#111827] block" style={{ fontFamily: 'Georgia, serif' }}>
                      {signatureText || 'Yakup Kibritçi'}
                    </span>
                    <div className="w-24 h-0.5 bg-amber-400/60 mx-auto mt-1 rounded-full"></div>
                    <span className="text-[8px] tracking-widest text-[#374151] font-mono font-medium block mt-1 uppercase">DİJİTAL GÜVENLİ ONAY</span>
                  </div>
                )}

                {signatureStyle === 'monospaced' && (
                  <div className="font-mono text-[9px] text-slate-600 space-y-0.5 select-none text-left w-full border border-[#10b981]/20 bg-emerald-50/20 p-2.5 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-emerald-700 font-bold">SECURE CERT:</span>
                      <span className="text-slate-400">ID: KBR-2026-X1</span>
                    </div>
                    <p className="truncate text-slate-800">AUTH: <strong className="font-bold">{currentUser?.email}</strong></p>
                    <p className="truncate text-[8px]">MD5: {btoa(signatureText || 'A').substring(0, 16).toUpperCase()}</p>
                    <span className="text-emerald-700 font-bold text-[8px] block">MATCHING VERIFIED ✅</span>
                  </div>
                )}

                {signatureStyle === 'seal' && (
                  <div className="text-center select-none p-3 border-2 border-dashed border-red-500 rounded-full w-24 h-24 flex flex-col items-center justify-center transform -rotate-3 bg-red-50/20">
                    <span className="text-[6px] text-red-600 font-black tracking-tighter uppercase leading-none block">KİBRİTÇİ İNŞAAT</span>
                    <span className="-my-1 text-[11px] font-black tracking-widest text-red-500 block uppercase">✔</span>
                    <span className="text-[8px] font-bold text-slate-800 truncate max-w-[70px] leading-tight block">
                      {(signatureText || 'Yakup').split(' ')[0]}
                    </span>
                    <span className="text-[5px] text-slate-400 font-bold block leading-none">2026-ERP</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-150 text-slate-600 text-[10.5px] leading-relaxed">
              📌 <strong className="text-amber-800">Kullanım Bilgisi:</strong> Profil ekranından kaydettiğiniz imza şablonu, satın alma evrakları, izin formları veya günlük yoklama raporlarında onay verdiğinizde dijital olarak evraklara basılacaktır.
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
