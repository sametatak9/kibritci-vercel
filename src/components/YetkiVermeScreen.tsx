import React, { useState } from 'react';
import { 
  ShieldCheck, ShieldAlert, Search, Save, User, 
  Settings, CheckSquare, Square, RefreshCw, HelpCircle
} from 'lucide-react';
import { Kullanici } from './AdminPanelScreen';
import { PORTAL_PAGES, sanitizeKisitliSayfalar } from '../lib/yetkiUtils';
import { saveKullanici } from '../lib/kullaniciUtils';

interface YetkiVermeScreenProps {
  kullanicilar: Kullanici[];
  setKullanicilar: React.Dispatch<React.SetStateAction<Kullanici[]>>;
  currentUser: any;
  addNotification?: (mesaj: string) => void;
}

const ALL_PAGES = PORTAL_PAGES;

export const YetkiVermeScreen: React.FC<YetkiVermeScreenProps> = ({
  kullanicilar,
  setKullanicilar,
  currentUser,
  addNotification
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Local permissions editing state
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[]>([]);

  const selectedUser = kullanicilar.find(u => u.id === selectedUserId);

  const handleSelectUser = (user: Kullanici) => {
    setSelectedUserId(user.id);
    setSuccessMsg(null);
    
    // An allowed page is one that is NOT in the user's kisitliSayfalar list.
    // If user's kisitliSayfalar is undefined, all pages are allowed.
    const restricted = user.kisitliSayfalar || [];
    const allowed = ALL_PAGES.filter(p => !restricted.includes(p.key)).map(p => p.key);
    setAllowedPageKeys(allowed);
  };

  const handleTogglePage = (pageKey: string) => {
    setAllowedPageKeys(prev => {
      if (prev.includes(pageKey)) {
        return prev.filter(key => key !== pageKey);
      } else {
        return [...prev, pageKey];
      }
    });
  };

  const handleToggleAllInGroup = (groupName: string) => {
    const groupKeys = ALL_PAGES.filter(p => p.group === groupName).map(p => p.key);
    const allActive = groupKeys.every(k => allowedPageKeys.includes(k));
    
    setAllowedPageKeys(prev => {
      if (allActive) {
        // Remove all group keys
        return prev.filter(k => !groupKeys.includes(k));
      } else {
        // Add all group keys (avoiding duplicates)
        const next = [...prev];
        groupKeys.forEach(k => {
          if (!next.includes(k)) next.push(k);
        });
        return next;
      }
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedUserId || !selectedUser) return;
    setSaving(true);
    setSuccessMsg(null);

    // Calculate restricted pages: pages that are NOT in allowedPageKeys
    const restricted = sanitizeKisitliSayfalar(
      selectedUser.yetki,
      ALL_PAGES.filter(p => !allowedPageKeys.includes(p.key)).map(p => p.key)
    );

    try {
      const updatedUser = { ...selectedUser, kisitliSayfalar: restricted };
      await saveKullanici(updatedUser);

      setKullanicilar(prev => prev.map(u => {
        if (u.email?.toLowerCase() === selectedUser.email.toLowerCase()) {
          return { ...u, kisitliSayfalar: restricted };
        }
        return u;
      }));

      const msg = `${selectedUser.ad || ''} ${selectedUser.soyad || ''} (${selectedUser.email}) sayfa erişim yetkileri başarıyla güncellendi!`;
      setSuccessMsg(msg);
      
      if (addNotification) {
        addNotification(`${selectedUser.email} kullanıcısının sayfa kısıtlamaları kurucu tarafından güncellendi.`);
      }
    } catch (err) {
      console.error(err);
      alert("Yetkiler güncellenirken hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = kullanicilar.filter(u => {
    const search = searchTerm.toLowerCase();
    const fullName = `${u.ad || ''} ${u.soyad || ''}`.toLowerCase();
    return (
      u.email.toLowerCase().includes(search) ||
      fullName.includes(search) ||
      (u.yetki || '').toLowerCase().includes(search)
    );
  });

  // Group pages by their groups
  const groups = Array.from(new Set(ALL_PAGES.map(p => p.group)));

  return (
    <div className="flex-grow p-6 flex flex-col font-sans select-none bg-slate-50 gap-4">
      {/* Title Header Card */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shrink-0 flex items-center justify-between border border-slate-800 shadow-md">
        <div className="space-y-1">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">Kurucu Özel Yetki Paneli</span>
          <h1 className="text-base font-black tracking-wider uppercase font-display">Sayfa Erişim ve Kısıtlama Sistemi</h1>
          <p className="text-[10px] text-slate-400">Tüm üyelerin şantiye portalında hangi sekmeleri görüntüleyip işlem yapabileceğini kısıtlayın.</p>
        </div>
        <div className="bg-slate-805/80 border border-slate-700 py-1.5 px-3 rounded-2xl flex items-center space-x-2 text-xs">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
          <span className="font-mono text-emerald-450 font-bold">Kurucu Modu Aktif</span>
        </div>
      </div>

      {/* Main Grid View split in two */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: Users list */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center space-x-1.5">
              <User size={13} className="text-slate-500" />
              <span>Üyeler ({filteredUsers.length})</span>
            </h3>
            
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Search size={13} />
              </span>
              <input
                type="text"
                placeholder="E-posta veya isim ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-55 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs placeholder-slate-400 focus:outline-none focus:border-amber-500 text-slate-855 font-semibold"
              />
            </div>
          </div>

          {/* List Scroll */}
          <div className="p-2.5 space-y-1.5">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-10 space-y-1.5">
                <span className="text-2xl block">🔍</span>
                <p className="text-xs text-slate-400 font-semibold">Aranan üye bulunamadı.</p>
              </div>
            ) : (
              filteredUsers.map(user => {
                const isSelected = user.id === selectedUserId;
                const hasRestrictions = user.kisitliSayfalar && user.kisitliSayfalar.length > 0;
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition duration-150 cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-900 border-slate-900 text-white shadow' 
                        : 'bg-white hover:bg-slate-50 border-slate-200/60 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs font-extrabold block truncate">
                        {user.ad ? `${user.ad} ${user.soyad}` : user.email.split('@')[0].toUpperCase()}
                      </span>
                      <span className={`text-[9px] font-mono block truncate ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                        {user.email}
                      </span>
                      <div className="flex items-center space-x-1.5 mt-1">
                        <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                          user.yetki === 'YÖNETİCİ' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {user.yetki}
                        </span>
                        {hasRestrictions && (
                          <span className="text-[8px] bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.5 rounded-full font-bold flex items-center space-x-0.5">
                            <ShieldAlert size={8} />
                            <span>{user.kisitliSayfalar?.length} Kısıt</span>
                          </span>
                        )}
                      </div>
                      {user.sonGorulmeTarihi && (
                        <span className={`text-[8px] font-semibold block mt-1 ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`}>
                          Son Görülme: {new Date(user.sonGorulmeTarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <span className="text-base select-none shrink-0 opacity-80">🪪</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Permissions detail grid */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col">
          {!selectedUserId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3.5">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 shadow-inner">
                <HelpCircle size={28} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">Üyelik Seçimi Bekleniyor</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                  Lütfen sol listeden erişim yetkilerini ve sayfa görünürlük kısıtlamalarını düzenlemek istediğiniz personeli seçin.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex flex-col">
              
              {/* Selected User Info Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <div className="min-w-0">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">YETKİ DETAYLARI:</span>
                  <div className="flex flex-col">
                    <div className="flex items-baseline space-x-1.5">
                      <h3 className="text-sm font-black text-slate-800 truncate">
                        {selectedUser?.ad ? `${selectedUser.ad} ${selectedUser.soyad}` : selectedUser?.email.split('@')[0].toUpperCase()}
                      </h3>
                      <span className="text-[10px] text-slate-500 font-mono">({selectedUser?.email})</span>
                    </div>
                    {selectedUser?.sonGorulmeTarihi && (
                      <span className="text-[9px] text-emerald-600 font-bold mt-0.5">
                        Son Görülme: {new Date(selectedUser.sonGorulmeTarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSavePermissions}
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-700/50 text-white font-bold text-xs py-2 px-4 rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow shadow-emerald-500/10"
                  >
                    {saving ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    <span>Yetkileri Kaydet &amp; Uygula</span>
                  </button>
                </div>
              </div>

              {/* Status Message Banner */}
              {successMsg && (
                <div className="bg-emerald-50 border-b border-emerald-100 text-emerald-800 p-3 text-xs font-bold flex items-center space-x-2 shrink-0 animate-fade-in">
                  <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Permissions Checklist Scroll Area */}
              <div className="p-5 space-y-6">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-start space-x-2 text-[10.5px] leading-relaxed text-amber-900">
                  <span className="text-base select-none shrink-0">📌</span>
                  <div>
                    <strong>Sayfa Erişim Kuralı:</strong> Aşağıdaki listede <strong>kutucuğu işaretli olan</strong> sayfalara personel erişim sağlayabilir. 
                    Kutucuğu <strong>boşaltılan (işareti kaldırılan)</strong> sayfalar ise personele tamamen kısıtlanır; menüden gizlenir ve doğrudan erişim girişleri engellenir.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {groups.map(groupName => {
                    const groupPages = ALL_PAGES.filter(p => p.group === groupName);
                    const allActive = groupPages.every(p => allowedPageKeys.includes(p.key));
                    
                    return (
                      <div key={groupName} className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                        {/* Group Header */}
                        <div className="bg-slate-900 text-white p-3 px-4 flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider">{groupName}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleAllInGroup(groupName)}
                            className="text-[9px] bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold px-2 py-0.5 rounded transition cursor-pointer border border-slate-700"
                          >
                            {allActive ? "Tümünü Kaldır" : "Tümünü Yetkilendir"}
                          </button>
                        </div>

                        {/* Pages list inside group */}
                        <div className="p-3 bg-white divide-y divide-slate-100">
                          {groupPages.map(page => {
                            const isAllowed = allowedPageKeys.includes(page.key);
                            return (
                              <button
                                key={page.key}
                                type="button"
                                onClick={() => handleTogglePage(page.key)}
                                className="w-full flex items-center space-x-2.5 py-2.5 px-2 text-left hover:bg-slate-50 transition cursor-pointer text-xs font-semibold text-slate-705"
                              >
                                <span className={isAllowed ? 'text-emerald-600' : 'text-slate-400'}>
                                  {isAllowed ? <CheckSquare size={16} className="stroke-[2.5]" /> : <Square size={16} />}
                                </span>
                                <div>
                                  <span className={`block font-bold text-xs ${isAllowed ? 'text-slate-800' : 'text-slate-405 line-through'}`}>
                                    {page.label}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono block">Sekme Kodu: {page.key}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
export default YetkiVermeScreen;
