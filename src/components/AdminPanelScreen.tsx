import React, { useState, useEffect } from 'react';
import { 
  Users, KeySquare, ShieldAlert, Trash2, CheckCircle, 
  XOctagon, UserCheck, AlertCircle, RefreshCw, Key,
  Eye, Check, Clipboard, CheckSquare
} from 'lucide-react';
import { fetchCollection, removeDocument, saveDocument } from '../lib/firebase';

export interface Kullanici {
  id: string; // auth uid
  email: string;
  yetki: 
    | 'YÖNETİCİ' 
    | 'MUHASEBE' 
    | 'İDARİ_İŞLER' 
    | 'SATIN_ALMA' 
    | 'ŞANTİYE_ŞEFİ' 
    | 'PROJE_MÜDÜRÜ' 
    | 'ELEKTRİK_ŞEFİ' 
    | 'TESİSAT_ŞEFİ' 
    | 'MEKANİK_ŞEFİ' 
    | 'İNCE_İŞLER_ŞEFİ' 
    | 'KABA_İŞLER_ŞEFİ' 
    | 'DİZAYN_ŞEFİ' 
    | 'PARSEL_ŞEFİ'
    | 'FORMEN'
    | 'KAMPÇI'
    | 'GÜVENLİK'
    | 'LOJİSTİK'
    | 'MİSAFİR';
  durum: 'AKTİF' | 'KISITLI' | 'ONAY BEKLİYOR';
  kayitTarihi: string;
  ad?: string;
  soyad?: string;
  tcNo?: string;
  imzaText?: string;
  imzaStyle?: string;
  imzaCanvas?: string;
  matchedPersonelId?: string;
  kisitliSayfalar?: string[];
}

export interface HataRaporu {
  id: string;
  tarih: string;
  kullanici: string;
  errorMsg: string;
  techDetails: string;
  contextInfo?: string;
  userNote: string;
  status: 'YENİ' | 'İNCELENİYOR' | 'ÇÖZÜLDÜ';
}

interface AdminPanelScreenProps {
  kullanicilar: Kullanici[];
  setKullanicilar: React.Dispatch<React.SetStateAction<Kullanici[]>>;
  currentUser: any;
  personeller?: any[];
  addNotification?: (mesaj: string) => void;
}

export const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({
  kullanicilar,
  setKullanicilar,
  currentUser,
  personeller = [],
  addNotification
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'errors'>('users');
  const [hataRaporlari, setHataRaporlari] = useState<HataRaporu[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [selectedError, setSelectedError] = useState<HataRaporu | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load error reports
  const loadErrorReports = async () => {
    setLoadingErrors(true);
    try {
      const data = await fetchCollection('hataRaporlari');
      // Sort by newest date
      const sorted = (data as HataRaporu[]).sort((a, b) => 
        new Date(b.tarih).getTime() - new Date(a.tarih).getTime()
      );
      setHataRaporlari(sorted);
    } catch (err) {
      console.error("Hata raporları çekilemedi:", err);
    } finally {
      setLoadingErrors(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'errors') {
      loadErrorReports();
    }
  }, [activeTab]);

  const handleToggleStatus = (id: string) => {
    const target = kullanicilar.find(u => u.id === id);
    if (target?.email === currentUser?.email) {
      alert("Hata: Kendi hesabınızın durumunu kısıtlayamazsınız!");
      return;
    }

    setKullanicilar(prev => prev.map(u => {
      if (u.id === id) {
        let nextDurum: 'AKTİF' | 'KISITLI' | 'ONAY BEKLİYOR' = 'AKTİF';
        if (u.durum === 'AKTİF') nextDurum = 'KISITLI';
        else if (u.durum === 'KISITLI') nextDurum = 'ONAY BEKLİYOR';
        else nextDurum = 'AKTİF';
        
        alert(`Kullanıcı (${u.email}) hesabı "${nextDurum}" durumuna getirildi.`);
        if (addNotification) {
          addNotification(`${u.email} kullanıcısının hesabı "${nextDurum}" durumuna getirildi.`);
        }
        return {
          ...u,
          durum: nextDurum
        };
      }
      return u;
    }));
  };

  const handleChangeRole = (id: string, newYetki: any) => {
    setKullanicilar(prev => prev.map(u => {
      if (u.id === id) {
        alert(`Kullanıcı (${u.email}) yetki seviyesi "${newYetki}" olarak değiştirildi.`);
        if (addNotification) {
          addNotification(`${u.email} kullanıcısının rolü "${newYetki}" olarak güncellendi.`);
        }
        return {
          ...u,
          yetki: newYetki
        };
      }
      return u;
    }));
  };

  const handleDeleteUser = (id: string, email: string) => {
    if (email === currentUser?.email) {
      alert("Hata: Kendi hesabınızı silemezsiniz!");
      return;
    }

    if (confirm(`"${email}" kullanıcısını sistemden ve üyelik listesinden tamamen silmek istediğinize emin misiniz?`)) {
      setKullanicilar(prev => prev.filter(u => u.id !== id));
      alert("Kullanıcı kaydı başarıyla silindi.");
      if (addNotification) {
        addNotification(`${email} kullanıcısı admin tarafından sistemden silindi.`);
      }
    }
  };

  // Change status of error report
  const handleChangeErrorStatus = async (errorId: string, nextStatus: 'YENİ' | 'İNCELENİYOR' | 'ÇÖZÜLDÜ') => {
    try {
      const match = hataRaporlari.find(h => h.id === errorId);
      if (!match) return;

      const updated = { ...match, status: nextStatus };
      await saveDocument('hataRaporlari', updated);
      setHataRaporlari(prev => prev.map(h => h.id === errorId ? updated : h));
      if (selectedError?.id === errorId) {
        setSelectedError(updated);
      }
    } catch (err) {
      alert("Durum güncellenirken hata oluştu.");
    }
  };

  // Delete error report
  const handleDeleteErrorReport = async (errorId: string) => {
    if (confirm("Bu hata raporunu sistemden kalıcı olarak silmek istiyor musunuz?")) {
      try {
        await removeDocument('hataRaporlari', errorId);
        setHataRaporlari(prev => prev.filter(h => h.id !== errorId));
        if (selectedError?.id === errorId) {
          setSelectedError(null);
        }
        alert("Hata raporu başarıyla silindi.");
      } catch (err) {
        alert("Rapor silinirken bir hata oluştu.");
      }
    }
  };

  // Copy diagnostic information as JSON for Gemini
  const handleCopyDiagnostics = (report: HataRaporu) => {
    const payload = JSON.stringify({
      tarih: report.tarih,
      kullanici: report.kullanici,
      hataMesaji: report.errorMsg,
      teknikDetaylar: report.techDetails,
      contextInfo: report.contextInfo || 'Yok',
      kullaniciNotu: report.userNote,
      kibritciErpVersion: "1.4-production-diagnostic"
    }, null, 2);

    navigator.clipboard.writeText(payload);
    setCopiedId(report.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="flex-grow p-6 flex flex-col font-sans select-none bg-slate-50 gap-4">
      
      {/* Title Header Card */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shrink-0 flex items-center justify-between border border-slate-800 shadow-md">
        <div className="space-y-1">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">Süper Admin Modülü</span>
          <h2 className="text-sm font-black tracking-widest font-display flex items-center gap-2">
            <KeySquare size={16} /> KİBRİTÇİ YÖNETİM VE DENETİM PANELİ
          </h2>
          <p className="text-[10px] text-slate-400">
            Sisteme yeni kayıt olan personellerin rollerini düzenleyin ve kullanıcıların karşılaştığı sistem hatalarını Türkçe açıklamalarıyla takip edin.
          </p>
        </div>
        <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-mono font-bold px-3 py-1 rounded-full uppercase">
          Kibritçi Güvenlik Altyapısı v1.5
        </span>
      </div>

      <div className="flex-grow bg-white border rounded-2xl flex flex-col shadow-sm">
        
        {/* Navigation Tabs inside Admin Box */}
        <div className="flex justify-between items-center bg-slate-100 border-b px-4 shrink-0">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'users'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users size={14} />
              <span>ÜYE YETKİLENDİRME VE ROLLER ({kullanicilar.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('errors')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'errors'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldAlert size={14} className={hataRaporlari.some(h => h.status === 'YENİ') ? 'text-rose-500 animate-pulse' : ''} />
              <span>SİSTEM HATA RAPORLARI ({hataRaporlari.length})</span>
            </button>
          </div>

          {activeTab === 'errors' && (
            <button
              onClick={loadErrorReports}
              disabled={loadingErrors}
              className="text-slate-500 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded transition outline-none cursor-pointer flex items-center gap-1 text-[10px] font-bold"
            >
              <RefreshCw size={11} className={loadingErrors ? 'animate-spin' : ''} />
              <span>Yenile</span>
            </button>
          )}
        </div>

        {/* Tab content wrapper */}
        <div className="flex-grow p-4">
          
          {/* TAB 1: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-3">
              {kullanicilar.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 space-y-2">
                  <AlertCircle size={32} />
                  <p className="text-xs font-semibold">Kayıtlı kullanıcı hesabı bulunamadı.</p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white max-w-5xl mx-auto w-full">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead>
                      <tr className="bg-slate-50 uppercase text-[9px] font-black text-slate-400 tracking-wider">
                        <th className="p-3">Kullanıcı Hesabı (E-Posta)</th>
                        <th className="p-3">Kayıt Tarihi</th>
                        <th className="p-3">Görev / Yetki Rolü</th>
                        <th className="p-3 text-center">Durum</th>
                        <th className="p-3 text-right">Eylemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-600">
                      {kullanicilar.map(user => {
                        const isSelf = user.email === currentUser?.email;
                        return (
                          <tr key={user.id} className={`hover:bg-slate-50/55 transition ${isSelf ? 'bg-amber-50/30 font-semibold' : ''}`}>
                            <td className="p-3">
                              <div className="flex items-center space-x-2.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[8px] outline outline-1 outline-offset-1 shrink-0">
                                  👤
                                </span>
                                <div className="min-w-0 space-y-1">
                                  <p className="font-bold text-slate-900 truncate">
                                    {user.email} {isSelf && <span className="text-[8px] bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded ml-1 uppercase font-bold">BEN</span>}
                                  </p>
                                  
                                  {(user.ad || user.soyad || user.tcNo) && (
                                    <p className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg inline-block font-medium">
                                      📋 {user.ad || ''} {user.soyad || ''} {user.tcNo ? `· TC: ${user.tcNo}` : ''}
                                    </p>
                                  )}

                                  {(() => {
                                    const matchedP = personeller.find(p => p.id === user.matchedPersonelId || (user.tcNo && p.tcNo === user.tcNo));
                                    if (matchedP) {
                                      return (
                                        <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center space-x-1 max-w-xs">
                                          <span>🔗 Eşleşti: {matchedP.ad} {matchedP.soyad} ({matchedP.gorev})</span>
                                        </div>
                                      );
                                    } else if (user.tcNo) {
                                      return (
                                        <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 inline-block">
                                          ⚠️ Personel listesinde eşleşen TC bulunamadı!
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}

                                  {(user.imzaText || user.imzaCanvas) && (
                                    <div className="text-[10px] text-slate-500 flex items-center space-x-2 mt-0.5 flex-wrap">
                                      <span>✍️ İmza Sahibi: <strong>{user.imzaText || `${user.ad || ''} ${user.soyad || ''}`}</strong> ({user.imzaStyle || 'Varsayılan'})</span>
                                      {user.imzaCanvas && (
                                        <div className="flex items-center space-x-1">
                                          <img src={user.imzaCanvas} className="h-6 object-contain border bg-white rounded p-0.5 inline-block" alt="imza" />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <p className="text-[9px] text-slate-400 font-mono block">UID: {user.id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-400">{user.kayitTarihi || new Date().toISOString().split('T')[0]}</td>
                            <td className="p-3">
                              <select 
                                className={`p-1.5 text-[11px] font-bold rounded-lg border bg-slate-50 outline-none cursor-pointer text-slate-855 focus:border-blue-500`}
                                value={user.yetki}
                                onChange={(e) => handleChangeRole(user.id, e.target.value as any)}
                              >
                                <option value="YÖNETİCİ">👑 Sistem Yöneticisi / Müdür</option>
                                <option value="MUHASEBE">💰 Muhasebe (Finans)</option>
                                <option value="İDARİ_İŞLER">🏡 İdari İşler (İK)</option>
                                <option value="SATIN_ALMA">🛒 Satın Alma Şefi</option>
                                <option value="ŞANTİYE_ŞEFİ">🚧 Şantiye Şefi</option>
                                <option value="PROJE_MÜDÜRÜ">📋 Proje Müdürü</option>
                                <option value="ELEKTRİK_ŞEFİ">⚡ Elektrik Şefi</option>
                                <option value="TESİSAT_ŞEFİ">🔧 Tesisat Şefi</option>
                                <option value="MEKANİK_ŞEFİ">⚙️ Mekanik Şefi</option>
                                <option value="İNCE_İŞLER_ŞEFİ">🪜 İnce İşler Şefi</option>
                                <option value="KABA_İŞLER_ŞEFİ">🧱 Kaba İşler Şefi</option>
                                <option value="DİZAYN_ŞEFİ">📐 Dizayn Şefi</option>
                                <option value="PARSEL_ŞEFİ">🗺️ Parsel Şefi</option>
                                <option value="FORMEN">👷 FORMEN (Saha Mobil)</option>
                                <option value="KAMPÇI">⛺ KAMPÇI (Kamp Amiri)</option>
                                <option value="GÜVENLİK">👮 GÜVENLİK (Kapı Kontrol)</option>
                                <option value="LOJİSTİK">🚚 LOJİSTİK (Malzeme ve Sevkiyat)</option>
                                <option value="MİSAFİR">⏳ MİSAFİR (Erişimsiz)</option>
                              </select>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleToggleStatus(user.id)}
                                className={`px-3 py-1 text-[10px] font-bold rounded-full border transition active:scale-95 cursor-pointer ${
                                  user.durum === 'AKTİF'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                    : user.durum === 'ONAY BEKLİYOR'
                                      ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                                      : 'bg-red-50 border-red-200 text-red-750 hover:bg-red-100'
                                }`}
                                title="Hesap Durumunu Kilitle/Aç"
                              >
                                {user.durum === 'AKTİF' ? '● Aktif Erişim' : user.durum === 'ONAY BEKLİYOR' ? '⌛ Onay Bekliyor' : '✕ Kısıtlanmış'}
                              </button>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                disabled={isSelf}
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                className={`p-2 rounded-lg border shadow-xs transition active:scale-95 ${
                                  isSelf 
                                    ? 'bg-slate-100 text-slate-350 cursor-not-allowed border-slate-150' 
                                    : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer'
                                }`}
                                title="Üye Hesabını Tamamen Sil"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SYSTEM ERRORS */}
          {activeTab === 'errors' && (
            <div className="space-y-4">
              {loadingErrors ? (
                <div className="py-24 text-center text-slate-500 flex flex-col items-center gap-3">
                  <RefreshCw className="animate-spin text-amber-500" size={24} />
                  <span className="text-xs font-bold font-mono">Hata raporları veritabanından yükleniyor...</span>
                </div>
              ) : hataRaporlari.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3">
                  <CheckSquare className="text-emerald-500" size={36} />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Şu anda sistemde çözülmemiş hiçbir mantıksal hata raporu yok!</p>
                  <p className="text-[10px] text-slate-500">Kullanıcılar sistemsel veya mantıksal bir hatayla karşılaştığında raporları burada listelenecektir.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                  
                  {/* Left panel: Reports list */}
                  <div className="lg:col-span-2 space-y-2.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">HATA RAPORU GEÇMİŞİ ({hataRaporlari.length})</span>
                    
                    <div className="space-y-2 pr-1">
                      {hataRaporlari.map(report => (
                        <div
                          key={report.id}
                          onClick={() => setSelectedError(report)}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition flex justify-between items-start gap-3 ${
                            selectedError?.id === report.id
                              ? 'bg-slate-900 border-slate-850 text-white'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded tracking-wide font-mono uppercase ${
                                report.status === 'YENİ' 
                                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/10' 
                                  : report.status === 'İNCELENİYOR'
                                    ? 'bg-amber-500/10 text-amber-600 border border-amber-500/10'
                                    : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/10'
                              }`}>
                                {report.status}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 font-mono">
                                {new Date(report.tarih).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                              <span className="text-[9px] text-slate-400 truncate max-w-[120px]" title={report.kullanici}>
                                👤 {report.kullanici}
                              </span>
                            </div>

                            <h4 className="text-xs font-black tracking-tight text-slate-800 line-clamp-2 block" style={selectedError?.id === report.id ? {color: '#f8fafc'} : {}}>
                              {report.errorMsg}
                            </h4>
                            
                            <p className="text-[10px] text-slate-500 italic truncate" style={selectedError?.id === report.id ? {color: '#94a3b8'} : {}}>
                              📝 {report.userNote || 'Kullanıcı not yazmadı.'}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyDiagnostics(report);
                              }}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition text-[9px] flex items-center gap-1 font-mono"
                              title="Yazılımcı için Tanı Kodlarını Kopyala (Gemini API Payload)"
                            >
                              {copiedId === report.id ? <Check size={10} className="text-emerald-500" /> : <Clipboard size={10} />}
                              <span>{copiedId === report.id ? 'Kopyalandı' : 'Tanı Kodu'}</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteErrorReport(report.id);
                              }}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition"
                              title="Raporu Kalıcı Olarak Sil"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right panel: Details Card */}
                  <div className="lg:col-span-1">
                    {selectedError ? (
                      <div className="bg-[#0f172a] text-slate-200 border border-slate-850 rounded-2xl p-4 space-y-4 shadow-lg">
                        <div className="border-b border-slate-800 pb-2.5 flex justify-between items-center">
                          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">HATA DETAY KARTI</span>
                          <span className="text-[8px] font-mono text-slate-500">ID: {selectedError.id.substring(0,10)}...</span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase">Kullanıcı Bildirimi</span>
                          <p className="text-xs text-white bg-slate-950 p-2.5 rounded-xl border border-slate-850 italic font-medium leading-relaxed">
                            "{selectedError.userNote}"
                          </p>
                          <span className="text-[8px] text-slate-500 block text-right">Gönderen: {selectedError.kullanici}</span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase">Türkçe Çevrilmiş Mantıksal Hata</span>
                          <p className="text-xs font-black text-rose-400 bg-rose-950/20 p-2.5 rounded-xl border border-rose-900/20 leading-relaxed">
                            ⚠️ {selectedError.errorMsg}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase">Oluştuğu Ekran / Bağlam</span>
                          <p className="text-[10px] font-mono bg-slate-950 p-2 rounded-lg border border-slate-850 text-slate-400">
                            {selectedError.contextInfo || 'Belirtilmedi'}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase">Teknik Detaylar (Yazılımcı Çıktısı)</span>
                          <pre className="text-[9px] font-mono bg-slate-950 p-2 rounded-lg border border-slate-850 overflow-x-auto max-h-36 text-slate-500 leading-normal whitespace-pre-wrap">
                            {selectedError.techDetails}
                          </pre>
                        </div>

                        <div className="space-y-2 border-t border-slate-800 pt-3">
                          <span className="text-[9px] text-slate-500 font-bold uppercase block">RAPOR DURUMUNU DEĞİŞTİR</span>
                          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                            <button
                              onClick={() => handleChangeErrorStatus(selectedError.id, 'YENİ')}
                              className={`py-1.5 rounded-lg border text-center font-bold tracking-wide transition cursor-pointer ${
                                selectedError.status === 'YENİ'
                                  ? 'bg-rose-500/10 border-rose-500 text-rose-400 font-extrabold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              YENİ
                            </button>
                            <button
                              onClick={() => handleChangeErrorStatus(selectedError.id, 'İNCELENİYOR')}
                              className={`py-1.5 rounded-lg border text-center font-bold tracking-wide transition cursor-pointer ${
                                selectedError.status === 'İNCELENİYOR'
                                  ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-extrabold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              İNCELENİYOR
                            </button>
                            <button
                              onClick={() => handleChangeErrorStatus(selectedError.id, 'ÇÖZÜLDÜ')}
                              className={`py-1.5 rounded-lg border text-center font-bold tracking-wide transition cursor-pointer ${
                                selectedError.status === 'ÇÖZÜLDÜ'
                                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-extrabold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              ÇÖZÜLDÜ
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => handleCopyDiagnostics(selectedError)}
                          className="w-full bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-800 font-black text-[10px] py-2.5 rounded-xl transition tracking-wide flex items-center justify-center space-x-1.5 cursor-pointer"
                        >
                          <Clipboard size={12} />
                          <span>AI (YAZILIMCI) İÇİN KOPYALA</span>
                        </button>
                      </div>
                    ) : (
                      <div className="h-full border border-dashed border-slate-300 bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-400 min-h-[300px]">
                        <Eye size={24} />
                        <p className="text-xs font-bold mt-2">Detayları İncelemek İçin Seçin</p>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[160px]">Soldaki listeden herhangi bir hata raporuna tıklayarak orijinal hata kaydını, teknik stack izini ve kullanıcı notunu inceleyin.</p>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

        </div>
      </div>
      
    </div>
  );
};

export default AdminPanelScreen;
