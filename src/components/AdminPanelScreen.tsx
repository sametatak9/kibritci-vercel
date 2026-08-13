import React, { useState, useEffect, useCallback } from 'react';
import { persistKullaniciRole, dedupeKullanicilarByEmail, saveKullanici, deleteKullaniciByEmail, findKullaniciByEmail } from '../lib/kullaniciUtils';
import {
  approveBekleyenSignup,
  BekleyenUyelik,
  createManualUser,
  fetchApiPendingSignups,
  mergePendingLists,
  readLocalPendingQueue,
  rejectBekleyenSignup,
  subscribeBekleyenUyelikler,
} from '../lib/bekleyenUyelik';
import { 
  Users, KeySquare, ShieldAlert, Trash2, CheckCircle, 
  XOctagon, UserCheck, AlertCircle, RefreshCw, Key,
  Eye, Check, Clipboard, CheckSquare, Save, Loader2, UserPlus, Clock, Database, X
} from 'lucide-react';
import { AdminYetkiSablonTab } from './AdminYetkiSablonTab';
import { isFirestoreWriteFailure } from '../lib/bekleyenUyelik';
import { fetchCollection, removeDocument, saveDocument } from '../lib/firebase';
import { getMobileRoleDisplayName, isMobileRole } from '../lib/yetkiUtils';
import { provisionAuthUser, syncAuthClaimsFromServer, adminUpdateUserPassword } from '../lib/authClaimsClient';
import {
  createProgramVeriYedegi,
  fetchVeriKorumaOzeti,
  listProgramVeriYedekleri,
  ProgramVeriYedegi,
} from '../lib/veriKoruma';
import { AylikYoklamaMap, SahaFaaliyeti, KampKaydi, Fatura } from '../types/erp';

export interface Kullanici {
  id: string; // auth uid
  email: string;
  yetki: 
    | 'KURUCU'
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
    | 'TESİSATÇI'
    | 'MERMERCİ'
    | 'GÖTÜRÜ'
    | 'GÜVENLİK'
    | 'LOJİSTİK'
    | 'OPERATÖR'
    | 'DEPOCU'
    | 'ANAHTARCI'
    | 'MİSAFİR';
  durum: 'AKTİF' | 'KISITLI' | 'ONAY BEKLİYOR';
  kayitTarihi: string;
  ad?: string;
  soyad?: string;
  tcNo?: string;
  imzaText?: string;
  sonGorulmeTarihi?: string;
  imzaStyle?: string;
  imzaCanvas?: string;
  matchedPersonelId?: string;
  kisitliSayfalar?: string[];
  saltOkunurSayfalar?: string[];
  sifreSifirlamaTalebi?: boolean;
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
  yoklamalar?: AylikYoklamaMap;
  sahaFaaliyetleri?: SahaFaaliyeti[];
  kampKayitlari?: KampKaydi[];
  faturalar?: Fatura[];
  /** İdari İşler: yalnızca üyelik onay / imza sekmeleri */
  uyelikOnly?: boolean;
}

export const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({
  kullanicilar,
  setKullanicilar,
  currentUser,
  personeller = [],
  addNotification,
  yoklamalar = {},
  sahaFaaliyetleri = [],
  kampKayitlari = [],
  faturalar = [],
  uyelikOnly = false,
}) => {
  const visibleKullanicilar = dedupeKullanicilarByEmail(kullanicilar);
  const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'pending' | 'create' | 'errors' | 'backup'>(
    'users'
  );

  useEffect(() => {
    if (!uyelikOnly) return;
    if (activeTab !== 'users' && activeTab !== 'pending' && activeTab !== 'create') {
      setActiveTab('users');
    }
  }, [uyelikOnly, activeTab]);
  const [hataRaporlari, setHataRaporlari] = useState<HataRaporu[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [selectedError, setSelectedError] = useState<HataRaporu | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [savingRoleEmail, setSavingRoleEmail] = useState<string | null>(null);

  const [firestorePending, setFirestorePending] = useState<BekleyenUyelik[]>([]);
  const [apiPending, setApiPending] = useState<BekleyenUyelik[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingApproveRoles, setPendingApproveRoles] = useState<Record<string, string>>({});
  const [approvingEmail, setApprovingEmail] = useState<string | null>(null);

  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createAd, setCreateAd] = useState('');
  const [createSoyad, setCreateSoyad] = useState('');
  const [createTcNo, setCreateTcNo] = useState('');
  const [createYetki, setCreateYetki] = useState<string>('KAMPÇI');
  const [creatingUser, setCreatingUser] = useState(false);

  const [backupLoading, setBackupLoading] = useState(false);
  const [backupOzeti, setBackupOzeti] = useState<Awaited<ReturnType<typeof fetchVeriKorumaOzeti>> | null>(null);
  const [programYedekleri, setProgramYedekleri] = useState<ProgramVeriYedegi[]>([]);

  // User edit state
  const [editingUser, setEditingUser] = useState<Kullanici | null>(null);
  const [editAd, setEditAd] = useState('');
  const [editSoyad, setEditSoyad] = useState('');
  const [editTcNo, setEditTcNo] = useState('');
  const [editYetki, setEditYetki] = useState<string>('MİSAFİR');
  const [editDurum, setEditDurum] = useState<'AKTİF' | 'KISITLI' | 'ONAY BEKLİYOR'>('ONAY BEKLİYOR');
  const [editPassword, setEditPassword] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const mergedPending = mergePendingLists(
    firestorePending,
    apiPending,
    readLocalPendingQueue()
  );

  const loadApiPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const items = await fetchApiPendingSignups();
      setApiPending(items);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'pending') return;
    loadApiPending();
    const unsub = subscribeBekleyenUyelikler(setFirestorePending, (err) =>
      console.warn('bekleyenUyelikler dinleyici hatası:', err)
    );
    return () => unsub();
  }, [activeTab, loadApiPending]);

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

  const loadBackupPanel = useCallback(async () => {
    setBackupLoading(true);
    try {
      const [ozet, yedekler] = await Promise.all([
        fetchVeriKorumaOzeti(),
        listProgramVeriYedekleri(15),
      ]);
      setBackupOzeti(ozet);
      setProgramYedekleri(yedekler);
    } catch (err) {
      console.error('Yedek paneli yüklenemedi:', err);
    } finally {
      setBackupLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'backup') {
      void loadBackupPanel();
    }
  }, [activeTab, loadBackupPanel]);

  const handleCreateProgramBackup = async () => {
    if (!window.confirm('Mevcut program verisinin anlık yedeği alınsın mı?\n(Yoklama arşivine tam kopya + özet manifest kaydedilir)')) {
      return;
    }
    setBackupLoading(true);
    try {
      const ozet = {
        personel: personeller.length,
        yoklamaKisi: Object.keys(yoklamalar).length,
        sahaFaaliyet: sahaFaaliyetleri.length,
        kampKayit: kampKayitlari.length,
        fatura: faturalar.length,
      };
      const yedek = await createProgramVeriYedegi(
        yoklamalar,
        ozet,
        currentUser?.email || 'admin',
        'Admin panel — manuel anlık yedek'
      );
      if (addNotification) {
        addNotification(`✅ Program yedeği alındı (${new Date(yedek.olusturmaTarihi).toLocaleString('tr-TR')})`);
      }
      alert(`✅ Yedek alındı.\nYoklama arşiv ID: ${yedek.yoklamaArsivId || '—'}`);
      await loadBackupPanel();
    } catch (err) {
      console.error(err);
      alert(`Yedek alınamadı: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    const target = findKullaniciByEmail(kullanicilar, id) || kullanicilar.find(u => u.id === id);
    if (target?.email === currentUser?.email) {
      alert("Hata: Kendi hesabınızın durumunu kısıtlayamazsınız!");
      return;
    }
    if (!target) return;

    let nextDurum: 'AKTİF' | 'KISITLI' | 'ONAY BEKLİYOR' = 'AKTİF';
    if (target.durum === 'AKTİF') nextDurum = 'KISITLI';
    else if (target.durum === 'KISITLI') nextDurum = 'ONAY BEKLİYOR';
    else nextDurum = 'AKTİF';

    try {
      const updated = await saveKullanici({ ...target, durum: nextDurum });
      setKullanicilar(prev => dedupeKullanicilarByEmail(
        prev.map(u => u.email?.toLowerCase() === target.email.toLowerCase() ? { ...u, ...updated } : u)
      ));
      alert(`Kullanıcı (${target.email}) hesabı "${nextDurum}" durumuna getirildi.`);
      await syncAuthClaimsFromServer(target.email).catch(() => undefined);
      if (addNotification) {
        addNotification(`${target.email} kullanıcısının hesabı "${nextDurum}" durumuna getirildi.`);
      }
    } catch {
      alert('Durum güncellenemedi.');
    }
  };

  const handleSaveRole = async (email: string) => {
    const newYetki = pendingRoles[email];
    const target = findKullaniciByEmail(kullanicilar, email);
    if (!target || !newYetki) return;
    if (newYetki === target.yetki) {
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });
      return;
    }

    setSavingRoleEmail(email);
    try {
      const updated = await persistKullaniciRole(kullanicilar, target.id, newYetki);
      setKullanicilar((prev) =>
        dedupeKullanicilarByEmail(
          prev.map((u) =>
            u.email?.trim().toLowerCase() === email.trim().toLowerCase()
              ? { ...u, ...updated }
              : u
          )
        )
      );
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });
      alert(
        `✅ ${email} — "${newYetki}" rolü kaydedildi.\n` +
          (isMobileRole(newYetki)
            ? `Erişim: ${getMobileRoleDisplayName(newYetki)} (aynı rolde sınırsız kullanıcı açılabilir).`
            : 'Masaüstü rol şablonu uygulandı.')
      );
      if (addNotification) {
        addNotification(`${email} kullanıcısının rolü "${newYetki}" olarak kaydedildi.`);
      }
      await syncAuthClaimsFromServer(email).catch(() => undefined);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(
        isFirestoreWriteFailure(err) || msg.includes('FIRESTORE_TIMEOUT')
          ? 'Firebase kotası veya bağlantı sorunu. Değişiklik kaydedilemedi — birkaç dakika sonra tekrar deneyin.'
          : 'Rol kaydedilemedi. Lütfen tekrar deneyin.'
      );
    } finally {
      setSavingRoleEmail(null);
    }
  };

  const handleApprovePending = async (record: BekleyenUyelik) => {
    const yetki = pendingApproveRoles[record.email] || 'MİSAFİR';
    setApprovingEmail(record.email);
    try {
      const created = await approveBekleyenSignup(record, yetki);
      setKullanicilar((prev) =>
        dedupeKullanicilarByEmail([
          ...prev.filter((u) => u.email?.toLowerCase() !== record.email.toLowerCase()),
          created as Kullanici,
        ])
      );
      await loadApiPending();
      const provisioned = await provisionAuthUser(record.email, record.password);
      if (!provisioned) {
        console.warn('Auth provision atlandı — FIREBASE_SERVICE_ACCOUNT_JSON kontrol edin');
      }
      alert(`✅ ${record.email} onaylandı ve "${yetki}" rolüyle oluşturuldu.`);
      if (addNotification) {
        addNotification(`${record.email} bekleyen kayıttan onaylandı (${yetki}).`);
      }
    } catch (err) {
      console.error(err);
      alert('Onay başarısız. Firebase kotası dolu olabilir — yarın tekrar deneyin.');
    } finally {
      setApprovingEmail(null);
    }
  };

  const handleRejectPending = async (record: BekleyenUyelik) => {
    if (!confirm(`"${record.email}" bekleyen kaydını reddetmek istiyor musunuz?`)) return;
    try {
      await rejectBekleyenSignup(record);
      await loadApiPending();
      alert('Kayıt reddedildi.');
    } catch {
      alert('Kayıt reddedilemedi.');
    }
  };

  const handleStartEditUser = (user: Kullanici) => {
    setEditingUser(user);
    setEditAd(user.ad || '');
    setEditSoyad(user.soyad || '');
    setEditTcNo(user.tcNo || '');
    setEditYetki(user.yetki || 'MİSAFİR');
    setEditDurum(user.durum || 'ONAY BEKLİYOR');
    setEditPassword('');
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editPassword && editPassword.length < 6) {
      alert('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setIsSavingEdit(true);
    try {
      let authCreated = false;
      if (editPassword) {
        const authResult = await adminUpdateUserPassword(editingUser.email, editPassword);
        authCreated = authResult.created;
      }

      const tcTrim = editTcNo.trim();
      const matchedByTc = tcTrim
        ? personeller.find((p) => String(p.tcNo || '').trim() === tcTrim)
        : undefined;

      const updatedUser: Kullanici = {
        ...editingUser,
        ad: editAd.trim() || matchedByTc?.ad || editingUser.ad,
        soyad: editSoyad.trim() || matchedByTc?.soyad || editingUser.soyad,
        tcNo: tcTrim,
        matchedPersonelId: matchedByTc?.id || editingUser.matchedPersonelId,
        yetki: editYetki as any,
        durum: editDurum,
        sifreSifirlamaTalebi: false,
      };

      const saved = await saveKullanici(updatedUser);
      
      setKullanicilar(prev =>
        dedupeKullanicilarByEmail(
          prev.map(u => u.email.toLowerCase() === editingUser.email.toLowerCase() ? { ...u, ...saved } : u)
        )
      );

      await syncAuthClaimsFromServer(editingUser.email).catch(() => undefined);

      alert(
        authCreated
          ? `✅ ${editingUser.email} için Firebase giriş hesabı oluşturuldu ve şifre atandı. Artık bu şifreyle giriş yapabilir.`
          : `✅ ${editingUser.email} kullanıcısının bilgileri başarıyla güncellendi!`
      );
      if (addNotification) {
        addNotification(`${editingUser.email} kullanıcısının kişisel bilgileri kurucu tarafından güncellendi.`);
      }
      setEditingUser(null);
    } catch (err: any) {
      console.error('Kullanıcı düzenleme hatası:', err);
      alert(`Hata: ${err.message || 'Kullanıcı bilgileri güncellenemedi.'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCreateManualUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail.trim() || !createPassword.trim() || !createAd.trim() || !createSoyad.trim()) {
      alert('E-posta, şifre, ad ve soyad zorunludur.');
      return;
    }
    if (createPassword.trim().length < 6) {
      alert('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (findKullaniciByEmail(kullanicilar, createEmail.trim())) {
      alert('Bu e-posta zaten kayıtlı.');
      return;
    }

    setCreatingUser(true);
    try {
      const { user, queued } = await createManualUser({
        email: createEmail.trim(),
        password: createPassword.trim(),
        ad: createAd.trim(),
        soyad: createSoyad.trim(),
        tcNo: createTcNo.trim() || undefined,
        yetki: createYetki,
      });

      if (queued) {
        alert('Firebase kotası dolu. Kullanıcı bekleyen kayıtlar sekmesine alındı — oradan onaylayın.');
        setActiveTab('pending');
        await loadApiPending();
      } else {
        setKullanicilar((prev) => dedupeKullanicilarByEmail([...prev, user as Kullanici]));
        alert(`✅ ${user.email} oluşturuldu (${createYetki}).`);
        if (addNotification) {
          addNotification(`Admin manuel kullanıcı oluşturdu: ${user.email} (${createYetki})`);
        }
        setCreateEmail('');
        setCreatePassword('');
        setCreateAd('');
        setCreateSoyad('');
        setCreateTcNo('');
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(
        isFirestoreWriteFailure(err) || msg.includes('FIRESTORE_TIMEOUT')
          ? 'Firebase kotası dolu veya bağlantı zaman aşımı. Kullanıcı "Bekleyen Kayıtlar" sekmesine alındı — oradan onaylayın.'
          : `Kullanıcı oluşturulamadı: ${msg}`
      );
      if (isFirestoreWriteFailure(err)) {
        setActiveTab('pending');
        await loadApiPending();
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (email === currentUser?.email) {
      alert("Hata: Kendi hesabınızı silemezsiniz!");
      return;
    }

    if (confirm(`"${email}" kullanıcısını sistemden tamamen silmek istediğinize emin misiniz?`)) {
      try {
        await deleteKullaniciByEmail(email);
        setKullanicilar(prev => prev.filter(u => u.email?.toLowerCase() !== email.toLowerCase()));
        alert("Kullanıcı kaydı Firebase'den kalıcı olarak silindi.");
        if (addNotification) {
          addNotification(`${email} kullanıcısı admin tarafından sistemden silindi.`);
        }
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        alert(
          isFirestoreWriteFailure(err) || msg.includes('FIRESTORE_TIMEOUT')
            ? 'Firebase kotası veya bağlantı sorunu — silme işlemi tamamlanamadı.'
            : 'Kullanıcı silinemedi.'
        );
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
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">
            {uyelikOnly ? 'İdari İşler · Üyelik' : 'Süper Admin Modülü'}
          </span>
          <h2 className="text-sm font-black tracking-widest font-display flex items-center gap-2">
            <KeySquare size={16} />{' '}
            {uyelikOnly
              ? 'ÜYELİK ONAY VE İMZA PANELİ'
              : 'KİBRİTÇİ YÖNETİM VE DENETİM PANELİ'}
          </h2>
          <p className="text-[10px] text-slate-400">
            {uyelikOnly
              ? 'Bekleyen üyelikleri onaylayın, roller atayın ve kayıtlı dijital imzaları görün.'
              : 'Sisteme yeni kayıt olan personellerin rollerini düzenleyin ve kullanıcıların karşılaştığı sistem hatalarını Türkçe açıklamalarıyla takip edin.'}
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
              <span>ÜYE YETKİLENDİRME ({visibleKullanicilar.length})</span>
            </button>
            {!uyelikOnly && (
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'permissions'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Key size={14} />
              <span>ROL YETKİ ŞABLONLARI</span>
            </button>
            )}
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'pending'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock size={14} className={mergedPending.length > 0 ? 'text-amber-500 animate-pulse' : ''} />
              <span>BEKLEYEN KAYITLAR ({mergedPending.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'create'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserPlus size={14} />
              <span>MANUEL KULLANICI OLUŞTUR</span>
            </button>
            {!uyelikOnly && (
            <>
            <button
              onClick={() => setActiveTab('errors')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'errors'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldAlert size={14} className={hataRaporlari.some(h => h.status === 'YENİ') ? 'text-rose-500 animate-pulse' : ''} />
              <span>HATA RAPORLARI ({hataRaporlari.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('backup')}
              className={`px-4 py-3 text-xs font-extrabold flex items-center gap-2 transition-all outline-none cursor-pointer border-b-2 ${
                activeTab === 'backup'
                  ? 'border-amber-500 text-slate-900 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Database size={14} />
              <span>VERİ KORUMA</span>
            </button>
            </>
            )}
          </div>

          {activeTab === 'pending' && (
            <button
              onClick={loadApiPending}
              disabled={loadingPending}
              className="text-slate-500 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded transition outline-none cursor-pointer flex items-center gap-1 text-[10px] font-bold"
            >
              <RefreshCw size={11} className={loadingPending ? 'animate-spin' : ''} />
              <span>Yenile</span>
            </button>
          )}

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

          {activeTab === 'backup' && (
            <button
              onClick={() => void loadBackupPanel()}
              disabled={backupLoading}
              className="text-slate-500 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded transition outline-none cursor-pointer flex items-center gap-1 text-[10px] font-bold"
            >
              <RefreshCw size={11} className={backupLoading ? 'animate-spin' : ''} />
              <span>Yenile</span>
            </button>
          )}
        </div>

        {/* Tab content wrapper */}
        <div className="flex-grow p-4">
          
          {/* TAB 1: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-3">
              {visibleKullanicilar.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 space-y-2">
                  <AlertCircle size={32} />
                  <p className="text-xs font-semibold">Kayıtlı kullanıcı hesabı bulunamadı.</p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl bg-white max-w-5xl mx-auto w-full overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[750px] text-left text-xs text-slate-700">
                      <thead>
                        <tr className="bg-slate-50 uppercase text-[9px] font-black text-slate-400 tracking-wider">
                        <th className="p-3">Kullanıcı Hesabı (E-Posta)</th>
                        <th className="p-3">Kayıt Tarihi</th>
                        <th className="p-3">Son Görülme</th>
                        <th className="p-3">Görev / Yetki Rolü</th>
                        <th className="p-3 text-center">Durum</th>
                        <th className="p-3 text-right">Eylemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-600">
                      {visibleKullanicilar.map(user => {
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
                                    {user.sifreSifirlamaTalebi && (
                                      <span className="text-[8px] bg-rose-600 text-white border border-rose-500 px-2 py-0.5 rounded-full ml-1.5 font-black uppercase inline-flex items-center gap-1 animate-pulse shadow-sm">
                                        🔑 ŞİFRE YENİLEME İSTEDİ
                                      </span>
                                    )}
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
                            <td className="p-3 font-mono text-emerald-600 font-bold">{user.sonGorulmeTarihi ? new Date(user.sonGorulmeTarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1.5">
                                <select 
                                  disabled={user.yetki === 'KURUCU' && currentUser?.email !== 'sametatak9@gmail.com'}
                                  className={`p-1.5 text-[11px] font-bold rounded-lg border bg-slate-50 outline-none cursor-pointer text-slate-855  ${
                                    pendingRoles[user.email] && pendingRoles[user.email] !== user.yetki
                                      ? 'border-amber-400 ring-1 ring-amber-300'
                                      : ''
                                  }`}
                                  value={pendingRoles[user.email] ?? user.yetki}
                                  onChange={(e) =>
                                    setPendingRoles((prev) => ({
                                      ...prev,
                                      [user.email]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="KURUCU">👑 Kurucu (Nihai Yetkili)</option>
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
                                  <option value="FORMEN">👷 FORMEN — Mobil Panel + Personel Yönetimi</option>
                                  <option value="KAMPÇI">⛺ KAMPÇI — Yalnızca Kampçı Mobil</option>
                                  <option value="TESİSATÇI">🔧 TESİSATÇI — Yalnızca Tesisatçı Mobil</option>
                                  <option value="MERMERCİ">🪨 MERMERCİ — Yalnızca Mermerci Mobil</option>
                                  <option value="GÖTÜRÜ">🧱 GÖTÜRÜ — Yalnızca Seramik / Götürü Mobil</option>
                                  <option value="GÜVENLİK">👮 GÜVENLİK — Yalnızca Güvenlik Mobil</option>
                                  <option value="LOJİSTİK">🚚 ŞÖFÖR — Yalnızca Şöför Mobil Paneli</option>
                                  <option value="OPERATÖR">🚜 OPERATÖR — Yalnızca Operatör Faaliyetleri</option>
                                  <option value="DEPOCU">📦 DEPOCU — Yalnızca Depocu Mobil</option>
                                  <option value="ANAHTARCI">🔑 ANAHTARCI — Yalnızca İmalat Terminali</option>
                                  <option value="MİSAFİR">⏳ MİSAFİR (Erişimsiz)</option>
                                </select>
                                {(pendingRoles[user.email] ?? user.yetki) !== user.yetki && (
                                  <button
                                    type="button"
                                    disabled={savingRoleEmail === user.email}
                                    onClick={() => handleSaveRole(user.email)}
                                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-black rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition active:scale-95 disabled:opacity-60 cursor-pointer"
                                  >
                                    {savingRoleEmail === user.email ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <Save size={12} />
                                    )}
                                    <span>YETKİYİ KAYDET</span>
                                  </button>
                                )}
                              </div>
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
                            <td className="p-3 text-right flex items-center justify-end gap-1.5">
                              {currentUser?.email === 'sametatak9@gmail.com' && (
                                <button
                                  onClick={() => handleStartEditUser(user as any)}
                                  className="p-2 rounded-lg border shadow-xs transition active:scale-95 bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 cursor-pointer"
                                  title="Kullanıcı Bilgilerini ve Şifresini Düzenle"
                                >
                                  <Key size={13} />
                                </button>
                              )}
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
                </div>
              )}
            </div>
          )}

          {/* TAB: ROL YETKİ ŞABLONLARI */}
          {activeTab === 'permissions' && (
            <AdminYetkiSablonTab
              kullanicilar={kullanicilar}
              setKullanicilar={setKullanicilar}
              addNotification={addNotification}
            />
          )}

          {/* TAB: BEKLEYEN KAYITLAR */}
          {activeTab === 'pending' && (
            <div className="space-y-3 max-w-5xl mx-auto w-full">
              <p className="text-[10px] text-slate-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Firebase kotası dolduğunda kayıt formundan gelen üyelikler buraya düşer. Rol seçip <strong>ONAYLA</strong> dediğinizde hesap oluşturulur.
              </p>
              {mergedPending.length === 0 ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                  <CheckCircle size={32} className="text-emerald-400" />
                  <p className="text-xs font-semibold">Bekleyen kayıt yok.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mergedPending.map((record) => (
                    <div
                      key={record.email}
                      className="border border-slate-200 rounded-2xl p-4 bg-white flex flex-col md:flex-row md:items-center gap-4"
                    >
                      <div className="flex-grow min-w-0 space-y-1">
                        <p className="font-bold text-slate-900 truncate">{record.email}</p>
                        <p className="text-[11px] text-slate-600">
                          {record.ad} {record.soyad} · TC: {record.tcNo}
                        </p>
                        <p className="text-[9px] text-slate-400 font-mono">
                          {new Date(record.olusturulma).toLocaleString('tr-TR')} · {record.kaynak}
                          {record.hataSebebi ? ` · ${record.hataSebebi}` : ''}
                          {record.apiYedek ? ' · API yedek' : ''}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        <select
                          className="p-2 text-[11px] font-bold rounded-lg border bg-slate-50"
                          value={pendingApproveRoles[record.email] ?? 'MİSAFİR'}
                          onChange={(e) =>
                            setPendingApproveRoles((prev) => ({
                              ...prev,
                              [record.email]: e.target.value,
                            }))
                          }
                        >
                          <option value="KURUCU">KURUCU</option>
                          <option value="YÖNETİCİ">YÖNETİCİ</option>
                          <option value="MUHASEBE">MUHASEBE</option>
                          <option value="FORMEN">FORMEN</option>
                          <option value="GÜVENLİK">GÜVENLİK</option>
                          <option value="LOJİSTİK">ŞÖFÖR</option>
                          <option value="OPERATÖR">OPERATÖR</option>
                          <option value="DEPOCU">DEPOCU</option>
                          <option value="ANAHTARCI">ANAHTARCI</option>
                          <option value="MİSAFİR">MİSAFİR</option>
                          <option value="KAMPÇI">KAMPÇI</option>
                          <option value="TESİSATÇI">TESİSATÇI</option>
                          <option value="MERMERCİ">MERMERCİ</option>
                          <option value="GÖTÜRÜ">GÖTÜRÜ</option>
                        </select>
                        <button
                          type="button"
                          disabled={approvingEmail === record.email}
                          onClick={() => handleApprovePending(record)}
                          className="flex items-center justify-center gap-1 px-3 py-2 text-[10px] font-black rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer disabled:opacity-60"
                        >
                          {approvingEmail === record.email ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          ONAYLA
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectPending(record)}
                          className="flex items-center justify-center gap-1 px-3 py-2 text-[10px] font-black rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer"
                        >
                          <XOctagon size={12} />
                          REDDET
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: MANUEL KULLANICI */}
          {activeTab === 'create' && (
            <form
              onSubmit={handleCreateManualUser}
              className="max-w-lg mx-auto w-full space-y-4 bg-white border border-slate-200 rounded-2xl p-5"
            >
              <p className="text-[10px] text-slate-500">
                Firebase kotası uygunsa kullanıcı anında oluşturulur. Kota doluysa bekleyen kayıtlara düşer.
              </p>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">E-posta *</label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full mt-1 p-2.5 text-xs border rounded-xl"
                  placeholder="ornek@firma.com"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">Şifre * (min 6)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full mt-1 p-2.5 text-xs border rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Ad *</label>
                  <input
                    required
                    value={createAd}
                    onChange={(e) => setCreateAd(e.target.value)}
                    className="w-full mt-1 p-2.5 text-xs border rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Soyad *</label>
                  <input
                    required
                    value={createSoyad}
                    onChange={(e) => setCreateSoyad(e.target.value)}
                    className="w-full mt-1 p-2.5 text-xs border rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">TC No (opsiyonel)</label>
                <input
                  value={createTcNo}
                  onChange={(e) => setCreateTcNo(e.target.value)}
                  className="w-full mt-1 p-2.5 text-xs border rounded-xl"
                  maxLength={11}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase">Rol *</label>
                <select
                  value={createYetki}
                  onChange={(e) => setCreateYetki(e.target.value)}
                  className="w-full mt-1 p-2.5 text-xs font-bold border rounded-xl bg-slate-50"
                >
                  <option value="KURUCU">KURUCU</option>
                  <option value="YÖNETİCİ">YÖNETİCİ</option>
                  <option value="MUHASEBE">MUHASEBE</option>
                  <option value="FORMEN">FORMEN</option>
                  <option value="GÜVENLİK">GÜVENLİK</option>
                  <option value="LOJİSTİK">ŞÖFÖR</option>
                  <option value="OPERATÖR">OPERATÖR</option>
                  <option value="DEPOCU">DEPOCU</option>
                  <option value="ANAHTARCI">ANAHTARCI</option>
                  <option value="KAMPÇI">KAMPÇI</option>
                  <option value="TESİSATÇI">TESİSATÇI</option>
                  <option value="MERMERCİ">MERMERCİ</option>
                  <option value="GÖTÜRÜ">GÖTÜRÜ</option>
                  <option value="MİSAFİR">MİSAFİR</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={creatingUser}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-3 rounded-xl cursor-pointer disabled:opacity-60"
              >
                {creatingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                KULLANICI OLUŞTUR
              </button>
            </form>
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

          {activeTab === 'backup' && (
            <div className="space-y-5 max-w-4xl mx-auto">
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <Database size={16} className="text-emerald-600" />
                  Program Veri Koruma Merkezi
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Yoklama ve saha faaliyetleri her kayıtta otomatik arşivlenir. Buradan ek olarak tüm programın anlık özet yedeğini alabilirsiniz.
                  Tam sunucu yedeği için bilgisayarınızda <code className="bg-white px-1 rounded text-[10px]">npm run backup:firestore</code> komutunu çalıştırın (gece 02:00 otomatik görev önerilir).
                </p>
                <button
                  type="button"
                  onClick={() => void handleCreateProgramBackup()}
                  disabled={backupLoading}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 rounded-xl disabled:opacity-60"
                >
                  {backupLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  ANLIK PROGRAM YEDEĞİ AL
                </button>
              </div>

              {backupLoading && !backupOzeti ? (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin text-emerald-500" size={22} />
                  <span className="text-xs font-bold">Yedek bilgileri yükleniyor...</span>
                </div>
              ) : (
                <>
                  {backupOzeti && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Yoklama arşivi', value: backupOzeti.yoklamaArsivSayisi },
                        { label: 'Saha arşivi', value: backupOzeti.sahaArsivSayisi },
                        { label: 'Program yedeği', value: backupOzeti.programYedekSayisi },
                        { label: 'Personel (şimdi)', value: personeller.length },
                      ].map((item) => (
                        <div key={item.label} className="bg-white border rounded-xl p-3 text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase">{item.label}</p>
                          <p className="text-xl font-black text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-white border rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Son program yedekleri
                    </div>
                    {programYedekleri.length === 0 ? (
                      <p className="p-6 text-xs text-slate-400 text-center">Henüz manuel program yedeği alınmamış.</p>
                    ) : (
                      <div className="divide-y">
                        {programYedekleri.map((y) => (
                          <div key={y.id} className="px-4 py-3 text-xs flex flex-wrap justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800">
                                {new Date(y.olusturmaTarihi).toLocaleString('tr-TR')}
                              </p>
                              <p className="text-[10px] text-slate-500">{y.kullanici} · {y.not || '—'}</p>
                            </div>
                            <div className="text-[10px] text-slate-600 font-mono">
                              P:{y.ozet?.personel ?? '—'} Y:{y.ozet?.yoklamaKisi ?? '—'} S:{y.ozet?.sahaFaaliyet ?? '—'} K:{y.ozet?.kampKayit ?? '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500 bg-slate-50 border rounded-xl p-4 space-y-1">
                    <p className="font-bold text-slate-700">Sekme bazlı geri yükleme</p>
                    <p>• Yoklama / Puantaj → Arşiv panelinden günlük yedekleri geri yükleyin</p>
                    <p>• Saha Faaliyetleri → İdari İşler sekmesindeki Faaliyet Arşivi</p>
                    <p>• Tam Firestore yedeği → <code>npm run restore:yoklama:dry-run</code> (sadece yoklama, kamp/saha dokunulmaz)</p>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 🔐 USER PROFILE & CREDENTIALS EDIT MODAL (FOUNDER ONLY) */}
      {editingUser && currentUser?.email === 'sametatak9@gmail.com' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl text-white p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-black tracking-wider text-amber-400 uppercase">👤 KULLANICI BİLGİLERİNİ DÜZENLE</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{editingUser.email}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditedUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400">Ad</label>
                  <input
                    type="text"
                    required
                    value={editAd}
                    onChange={(e) => setEditAd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 outline-none focus:border-amber-400 transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400">Soyad</label>
                  <input
                    type="text"
                    required
                    value={editSoyad}
                    onChange={(e) => setEditSoyad(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 outline-none focus:border-amber-400 transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">TC Kimlik No</label>
                <input
                  type="text"
                  maxLength={11}
                  value={editTcNo}
                  onChange={(e) => setEditTcNo(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 outline-none focus:border-amber-400 transition font-mono"
                  placeholder="Seçmeli (11 hane)"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">Görev / Yetki Rolü</label>
                <select
                  value={editYetki}
                  onChange={(e) => setEditYetki(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-2.5 py-2 outline-none focus:border-amber-400 transition cursor-pointer"
                >
                  <option value="KURUCU">👑 Kurucu (Nihai Yetkili)</option>
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
                  <option value="FORMEN">👷 FORMEN (Mobil)</option>
                  <option value="KAMPÇI">⛺ KAMPÇI (Mobil)</option>
                  <option value="TESİSATÇI">🔧 TESİSATÇI (Mobil)</option>
                  <option value="MERMERCİ">🪨 MERMERCİ (Mobil)</option>
                  <option value="GÖTÜRÜ">🧱 GÖTÜRÜ (Mobil)</option>
                  <option value="GÜVENLİK">👮 GÜVENLİK (Mobil)</option>
                  <option value="LOJİSTİK">🚚 ŞÖFÖR (Mobil)</option>
                  <option value="OPERATÖR">🚜 OPERATÖR (Mobil)</option>
                  <option value="DEPOCU">📦 DEPOCU (Mobil)</option>
                  <option value="ANAHTARCI">🔑 ANAHTARCI (Mobil)</option>
                  <option value="MİSAFİR">⏳ MİSAFİR (Erişimsiz)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">Hesap Durumu</label>
                <select
                  value={editDurum}
                  onChange={(e) => setEditDurum(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-2.5 py-2 outline-none focus:border-amber-400 transition cursor-pointer"
                >
                  <option value="AKTİF">🟢 Aktif Erişim</option>
                  <option value="ONAY BEKLİYOR">⌛ Onay Bekliyor</option>
                  <option value="KISITLI">🔴 Kısıtlanmış / Engelli</option>
                </select>
              </div>

              <div className="space-y-1 pt-1.5 border-t border-slate-800">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                    <Key size={10} />
                    <span>Şifreyi Değiştir (Firebase Auth)</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 outline-none focus:border-amber-400 transition"
                  placeholder="Yeni şifre (Değiştirmek istemiyorsanız boş bırakın)"
                />
              </div>

              <div className="flex gap-2.5 pt-3.5">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer text-center active:scale-95"
                >
                  İPTAL
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-60"
                >
                  {isSavingEdit ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckSquare size={13} />
                  )}
                  <span>KAYDET</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default AdminPanelScreen;
