import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, BarChart3, Bell, MessageSquare, ShieldCheck, 
  Users, Wallet, ShoppingCart, RefreshCw, LogOut, Monitor,
  Send, AlertTriangle, CheckCircle, XCircle, FileText, BadgeInfo, Clock, Calendar, Check, Ban, ArrowLeft
} from 'lucide-react';
import { db } from '../lib/firebase';
import { saveKullanici, findKullaniciByEmail } from '../lib/kullaniciUtils';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, limit, addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { KibritciLogo } from './KibritciLogo';

// Sub-screens for Manager preview
import { FormenScreen } from './FormenScreen';
import { GuvenlikScreen } from './GuvenlikScreen';
import { KampciScreen } from './KampciScreen';
import { LojistikScreen } from './LojistikScreen';
import { DepocuScreen } from './DepocuScreen';

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  durum: boolean;
  unvan?: string;
}

interface KasaHareketi {
  id: string;
  tarih: string;
  aciklama: string;
  tutar: number;
  hareketTipi: 'GİRİŞ' | 'ÇIKIŞ';
  ekleyen?: string;
}

interface SatinAlmaTalebi {
  id: string;
  tarih: string;
  talepEden: string;
  malzemeDetay: string;
  miktar: number;
  birim: string;
  tahminiTutar: number;
  onayDurumu: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDİLDİ';
  onaylayan?: string;
}

interface Kullanici {
  id: string;
  email: string;
  ad?: string;
  soyad?: string;
  yetki: string;
  durum: 'AKTİF' | 'KISITLI' | 'ONAY BEKLİYOR';
  kayitTarihi: string;
  kisitliSayfalar?: string[];
}

interface SahaFaaliyetiType {
  id: string;
  tarih: string;
  baslik: string;
  detay: string;
  ekleyen?: string;
}

interface IzinFormu {
  id: string;
  tarih: string;
  personelIsim: string;
  unvan: string;
  izinTipi: string;
  baslangicTarihi: string;
  bitisTarihi: string;
  toplamGun: number;
  aciklama: string;
  onayDurumu: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDİLDİ';
}

interface MobileManagerScreenProps {
  currentUser: any;
  onSignOut: () => void;
  personeller: Personel[];
  kasaHareketleri: KasaHareketi[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  kullanicilar: Kullanici[];
  sahaFaaliyetleri: SahaFaaliyetiType[];
  setSahaFaaliyetleri?: any;
  setKullanicilar: (updater: any) => void;
  setSatinAlmaTalepleri: (updater: any) => void;
  onToggleDesktopMode: () => void;
  yoklamalar?: any;
  setYoklamalar?: any;
  irsaliyeler?: any[];
  setIrsaliyeler?: any;
  araclar?: any[];
  setAraclar?: any;
  aracKmLoglari?: any[];
  setAracKmLoglari?: any;
  kampOdalari?: any[];
  setKampOdalari?: any;
  kampKayitlari?: any[];
  setKampKayitlari?: any;
  stokKartlar?: any[];
  setStokKartlar?: any;
}

export const MobileManagerScreen: React.FC<MobileManagerScreenProps> = ({
  currentUser,
  onSignOut,
  personeller,
  kasaHareketleri,
  satinAlmaTalepleri,
  kullanicilar,
  sahaFaaliyetleri,
  setSahaFaaliyetleri,
  setKullanicilar,
  setSatinAlmaTalepleri,
  onToggleDesktopMode,
  yoklamalar,
  setYoklamalar,
  irsaliyeler = [],
  setIrsaliyeler,
  araclar = [],
  setAraclar,
  aracKmLoglari = [],
  setAracKmLoglari,
  kampOdalari = [],
  setKampOdalari,
  kampKayitlari = [],
  setKampKayitlari,
  stokKartlar = [],
  setStokKartlar
}) => {
  const [activeTab, setActiveTab] = useState<'ozet' | 'akis' | 'sohbet' | 'onaylar' | 'formen' | 'guvenlik' | 'kampci' | 'lojistik' | 'depocu'>('ozet');
  
  // Realtime Live Chat state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedTag, setSelectedTag] = useState('GENEL');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Leave Requests state (Fetched inside here for simplicity)
  const [izinFormlari, setIzinFormlari] = useState<IzinFormu[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  // Depo Sayımları state
  const [depoSayimlar, setDepoSayimlar] = useState<any[]>([]);

  // Subscribe to real-time chat messages
  useEffect(() => {
    const q = query(
      collection(db, 'santiyeMesajlari'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          senderName: data.senderName || data.senderEmail?.split('@')[0].toUpperCase() || "BİLİNMEYEN",
          senderEmail: data.senderEmail || "",
          senderRole: data.senderRole || "GÖREVLİ",
          text: data.text || "",
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
          tag: data.tag || "GENEL"
        });
      });
      setChatMessages(list);
    });

    return () => unsubscribe();
  }, []);

  // Fetch leave requests for real-time approval
  useEffect(() => {
    setLoadingLeaves(true);
    const unsubscribe = onSnapshot(collection(db, 'izinFormlari'), (snapshot) => {
      const list: IzinFormu[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          tarih: data.tarih || '',
          personelIsim: data.personelIsim || 'Bilinmeyen Personel',
          unvan: data.unvan || 'Saha Elemanı',
          izinTipi: data.izinTipi || 'DİĞER',
          baslangicTarihi: data.baslangicTarihi || '',
          bitisTarihi: data.bitisTarihi || '',
          toplamGun: data.toplamGun || 1,
          aciklama: data.aciklama || '',
          onayDurumu: data.onayDurumu || 'ONAY BEKLİYOR'
        });
      });
      setIzinFormlari(list);
      setLoadingLeaves(false);
    }, (error) => {
      console.error("Izin formlari dinlenemedi:", error);
      setLoadingLeaves(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch depo sayimlari for real-time approval
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'depoSayimlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setDepoSayimlar(list);
    });
    return () => unsubscribe();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'sohbet') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Statistics calculations
  const totalPersonel = personeller.length;
  const activePersonelCount = personeller.filter(p => p.durum === true || String(p.durum) === 'true').length;

  const totalIn = kasaHareketleri
    .filter(k => k.hareketTipi === 'GİRİŞ')
    .reduce((sum, current) => sum + current.tutar, 0);
    
  const totalOut = kasaHareketleri
    .filter(k => k.hareketTipi === 'ÇIKIŞ')
    .reduce((sum, current) => sum + current.tutar, 0);
    
  const netBalance = totalIn - totalOut;

  // Pending items counts
  const pendingUsers = kullanicilar.filter(u => u.durum === 'ONAY BEKLİYOR');
  const pendingPurchases = satinAlmaTalepleri.filter(s => s.onayDurumu === 'ONAY BEKLİYOR');
  const pendingLeaves = izinFormlari.filter(i => i.onayDurumu === 'ONAY BEKLİYOR');
  const pendingStokKartlar = stokKartlar.filter(s => s.durum === 'ONAY BEKLİYOR');
  const pendingSayimlar = depoSayimlar.filter(s => s.durum === 'ONAY BEKLİYOR');
  const totalPendingApprovals = pendingUsers.length + pendingPurchases.length + pendingLeaves.length + pendingStokKartlar.length + pendingSayimlar.length;

  // Handle send chat message
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    const senderRole = matchedUser?.yetki || "YÖNETİCİ";
    const senderName = matchedUser?.ad && matchedUser?.soyad ? `${matchedUser.ad} ${matchedUser.soyad}` : currentUser?.email?.split('@')[0].toUpperCase();

    try {
      await addDoc(collection(db, 'santiyeMesajlari'), {
        senderName,
        senderEmail: currentUser?.email || "anonim@kibritci.com",
        senderRole,
        text: inputText,
        tag: selectedTag,
        timestamp: new Date()
      });
      setInputText("");
    } catch (err) {
      console.error("Mesaj gönderilemedi:", err);
    }
  };

  // Live feed updates logic: combine recent field logs & cash movements sorted by date
  const getCombinedFeed = () => {
    const feedItems: any[] = [];

    // Add cash movements
    kasaHareketleri.forEach(k => {
      feedItems.push({
        type: 'KASA',
        title: k.hareketTipi === 'GİRİŞ' ? 'Kasa Gelir Girişi' : 'Kasa Gider Çıkışı',
        desc: `${k.aciklama} - ₺${k.tutar.toLocaleString('tr-TR')}`,
        tarih: k.tarih,
        icon: Wallet,
        color: k.hareketTipi === 'GİRİŞ' ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
      });
    });

    // Add field activities
    sahaFaaliyetleri.forEach(sf => {
      feedItems.push({
        type: 'SAHA',
        title: 'Saha Faaliyet Raporu',
        desc: `${sf.baslik}: ${sf.detay}`,
        tarih: sf.tarih,
        icon: FileText,
        color: 'text-amber-500 bg-amber-500/10'
      });
    });

    // Add purchases
    satinAlmaTalepleri.forEach(s => {
      feedItems.push({
        type: 'SATIN_ALMA',
        title: 'Satın Alma Talebi',
        desc: `${s.talepEden}: ${s.malzemeDetay} (${s.miktar} ${s.birim})`,
        tarih: s.tarih,
        icon: ShoppingCart,
        color: 'text-slate-600 bg-slate-500/10'
      });
    });

    // Sort by date descending
    return feedItems.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime()).slice(0, 30);
  };

  const feedItems = getCombinedFeed();

  // Approval Handlers
  const handleApproveUser = async (userId: string) => {
    const target = findKullaniciByEmail(kullanicilar, userId) || kullanicilar.find(u => u.id === userId);
    if (!target) return;
    const updated = {
      ...target,
      durum: 'AKTİF' as const,
      yetki: target.yetki === 'MİSAFİR' ? 'YÖNETİCİ' : target.yetki,
    };
    try {
      const saved = await saveKullanici(updated);
      setKullanicilar((prev: Kullanici[]) =>
        prev.map(u => (u.email?.toLowerCase() === target.email.toLowerCase() ? { ...u, ...saved } : u))
      );
      alert("Kullanıcı hesabı onaylandı ve 'AKTİF' statüsüne getirildi.");
    } catch {
      alert('Onay kaydedilemedi. Lütfen tekrar deneyin.');
    }
  };

  const handleRestrictUser = async (userId: string) => {
    const target = findKullaniciByEmail(kullanicilar, userId) || kullanicilar.find(u => u.id === userId);
    if (!target) return;
    try {
      const saved = await saveKullanici({ ...target, durum: 'KISITLI' });
      setKullanicilar((prev: Kullanici[]) =>
        prev.map(u => (u.email?.toLowerCase() === target.email.toLowerCase() ? { ...u, ...saved } : u))
      );
      alert("Kullanıcı hesabı kısıtlandı.");
    } catch {
      alert('Kısıtlama kaydedilemedi.');
    }
  };

  const handleApprovePurchase = (purchaseId: string) => {
    setSatinAlmaTalepleri((prev: SatinAlmaTalebi[]) => prev.map(p => {
      if (p.id === purchaseId) {
        return { ...p, onayDurumu: 'ONAYLANDI', onaylayan: currentUser?.email || 'Yönetici' };
      }
      return p;
    }));
    alert("Satın alma talebi onaylandı!");
  };

  const handleRejectPurchase = (purchaseId: string) => {
    setSatinAlmaTalepleri((prev: SatinAlmaTalebi[]) => prev.map(p => {
      if (p.id === purchaseId) {
        return { ...p, onayDurumu: 'REDDEDİLDİ', onaylayan: currentUser?.email || 'Yönetici' };
      }
      return p;
    }));
    alert("Satın alma talebi reddedildi.");
  };

  const handleApproveLeave = async (leaveId: string) => {
    try {
      const docRef = doc(db, 'izinFormlari', leaveId);
      await updateDoc(docRef, {
        onayDurumu: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("İzin talebi onaylandı!");
    } catch (err) {
      console.error("Izin onaylanırken hata oluştu:", err);
    }
  };

  const handleRejectLeave = async (leaveId: string) => {
    try {
      const docRef = doc(db, 'izinFormlari', leaveId);
      await updateDoc(docRef, {
        onayDurumu: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("İzin talebi reddedildi.");
    } catch (err) {
      console.error("Izin reddedilirken hata oluştu:", err);
    }
  };

  const handleApproveStokKart = async (itemId: string) => {
    try {
      await updateDoc(doc(db, 'stokKartlar', itemId), {
        durum: 'AKTIF',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("Stok kartı onaylandı!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectStokKart = async (itemId: string) => {
    try {
      const docRef = doc(db, 'stokKartlar', itemId);
      await deleteDoc(docRef);
      alert("Stok kartı talebi reddedildi ve silindi.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveDepoSayim = async (item: any) => {
    try {
      await updateDoc(doc(db, 'depoSayimlari', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString().split('T')[0]
      });

      if (item.kalemler && Array.isArray(item.kalemler)) {
        for (const k of item.kalemler) {
          if (k.stockId) {
            await updateDoc(doc(db, 'stokKartlar', k.stockId), { miktar: k.physicalQty });
          }
        }
      }
      alert("Depo sayımı onaylandı ve stoklar güncellendi!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectDepoSayim = async (sayimId: string) => {
    try {
      await updateDoc(doc(db, 'depoSayimlari', sayimId), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("Depo sayımı reddedildi.");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 md:bg-slate-200 md:py-6 flex items-center justify-center font-sans overflow-hidden text-slate-800 select-none">
      
      {/* Phone Simulator Frame Wrapper for Desktop, fluid full screen for Mobile */}
      <div className="w-full max-w-md h-screen md:h-[820px] bg-white flex flex-col relative md:rounded-[2.8rem] md:border-8 md:border-slate-800 md:shadow-2xl overflow-hidden">
        
        {/* Mobile Phone Status Bar Bezel on Desktop screens */}
        <div className="bg-slate-100 shrink-0 h-6 px-6 pt-1 flex items-center justify-between text-[10px] font-black tracking-widest text-slate-500 border-b border-slate-200">
          <span>KİBRİTÇİ MOBILE</span>
          <div className="w-16 h-3.5 bg-slate-200 rounded-full flex items-center justify-center border border-slate-300 shrink-0 mx-2">
            <div className="w-2.5 h-2.5 bg-slate-300 rounded-full" />
          </div>
          <div className="flex items-center space-x-1.5 font-mono">
            <span>📶 5G</span>
            <span>🔋 100%</span>
          </div>
        </div>

        {/* Standalone Screen Preview Mode Rendering */}
        {['formen', 'guvenlik', 'kampci', 'lojistik', 'depocu'].includes(activeTab) ? (
          <div className="flex-grow flex flex-col overflow-hidden bg-slate-50">
            <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800 shrink-0 select-none">
              <button 
                onClick={() => setActiveTab('ozet')}
                className="flex items-center space-x-1 text-xs text-amber-500 font-black cursor-pointer hover:text-amber-400 transition"
              >
                <ArrowLeft size={14} />
                <span>GERİ DÖN</span>
              </button>
              <span className="text-[10px] font-black tracking-wider uppercase text-slate-400">
                {activeTab === 'formen' ? 'Formen Paneli Önizleme' :
                 activeTab === 'guvenlik' ? 'Güvenlik Kapısı Önizleme' :
                 activeTab === 'kampci' ? 'Kampçı Paneli Önizleme' :
                 activeTab === 'lojistik' ? 'Şoför Paneli Önizleme' :
                 activeTab === 'depocu' ? 'Depocu Paneli Önizleme' : ''}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'formen' && (
                <FormenScreen 
                  personeller={personeller}
                  yoklamalar={yoklamalar}
                  setYoklamalar={setYoklamalar}
                  sahaFaaliyetleri={sahaFaaliyetleri}
                  setSahaFaaliyetleri={setSahaFaaliyetleri || (() => {})}
                  currentUser={currentUser}
                  onSignOut={onSignOut}
                  isStandalone={true}
                  kullanicilar={kullanicilar}
                />
              )}
              {activeTab === 'guvenlik' && (
                <GuvenlikScreen 
                  personeller={personeller}
                  currentUser={currentUser}
                  onSignOut={onSignOut}
                  userYetki="GÜVENLİK"
                  isStandalone={true}
                />
              )}
              {activeTab === 'kampci' && (
                <KampciScreen 
                  kampOdalari={kampOdalari}
                  setKampOdalari={setKampOdalari || (() => {})}
                  kampKayitlari={kampKayitlari}
                  setKampKayitlari={setKampKayitlari || (() => {})}
                  personeller={personeller}
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlar || (() => {})}
                  currentUser={currentUser}
                  onSignOut={onSignOut}
                  isStandalone={true}
                />
              )}
              {activeTab === 'lojistik' && (
                <LojistikScreen 
                  irsaliyeler={irsaliyeler}
                  setIrsaliyeler={setIrsaliyeler || (() => {})}
                  satinAlmaTalepleri={satinAlmaTalepleri}
                  araclar={araclar}
                  setAraclar={setAraclar || (() => {})}
                  aracKmLoglari={aracKmLoglari}
                  setAracKmLoglari={setAracKmLoglari || (() => {})}
                  currentUser={currentUser}
                  onSignOut={onSignOut}
                  isStandalone={true}
                />
              )}
              {activeTab === 'depocu' && (
                <DepocuScreen 
                  stokKartlar={stokKartlar}
                  setStokKartlar={setStokKartlar || (() => {})}
                  personeller={personeller}
                  currentUser={currentUser}
                  onSignOut={onSignOut}
                  isStandalone={true}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Premium App Bar Header */}
            <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
              <div className="flex items-center space-x-2.5">
                <KibritciLogo size="sm" className="h-8" />
                <div>
                  <span className="text-[9px] text-slate-500 font-medium">{currentUser?.email || 'Yönetici'}</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-1">
                <button
                  onClick={onToggleDesktopMode}
                  title="Masaüstü ERP Moduna Geç"
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center justify-center"
                >
                  <Monitor size={15} />
                </button>
                <button
                  onClick={onSignOut}
                  title="Çıkış Yap"
                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer flex items-center justify-center"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </header>

            {/* Screen Content Wrapper */}
            <main className="flex-1 overflow-y-auto bg-slate-50 p-4 pb-20 scrollbar-none">
              {activeTab === 'ozet' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-1 shadow-sm">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block">SAHA ÖZET RAPORU</span>
                <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                  Şantiye finansı, hakedişler, ekip mevcutları ve satın alma talepleri anlık olarak aşağıda özetlenmiştir.
                </p>
              </div>

              {/* Grid 2x2 Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col justify-between space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aktif Kadro</span>
                    <Users size={16} className="text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">{activePersonelCount} <span className="text-[11px] text-slate-400">/ {totalPersonel}</span></h3>
                    <span className="text-[9px] text-emerald-600 font-bold block mt-0.5">● Sahada Aktif</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col justify-between space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kasa Durumu</span>
                    <Wallet size={16} className="text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">₺{netBalance.toLocaleString('tr-TR')}</h3>
                    <span className={`text-[9px] font-bold block mt-0.5 ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {netBalance >= 0 ? '▲ Artıda' : '▼ Ekside'}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col justify-between space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Satın Alma</span>
                    <ShoppingCart size={16} className="text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">{pendingPurchases.length} Adet</h3>
                    <span className="text-[9px] text-amber-600 font-bold block mt-0.5">Onay Bekleyen</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-3 rounded-2xl flex flex-col justify-between space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">İzin Talepleri</span>
                    <Clock size={16} className="text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">{pendingLeaves.length} Adet</h3>
                    <span className="text-[9px] text-indigo-600 font-bold block mt-0.5">Cevap Bekliyor</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-sm">
                <h3 className="text-xs font-black tracking-wider text-slate-500 uppercase">HIZLI YÖNLENDİRMELER</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setActiveTab('akis')}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition duration-150 cursor-pointer"
                  >
                    <span className="text-sm block">🔔</span>
                    <span className="text-xs font-bold text-slate-700 block mt-1">Saha Akışı</span>
                    <span className="text-[9px] text-slate-400 block">Günlük son faaliyetler</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('onaylar')}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition duration-150 relative cursor-pointer"
                  >
                    <span className="text-sm block">🛡️</span>
                    {totalPendingApprovals > 0 && (
                      <span className="absolute top-2 right-2 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-black">
                        {totalPendingApprovals}
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-700 block mt-1">Onay Havuzu</span>
                    <span className="text-[9px] text-slate-400 block">Bekleyen evrak ve talepler</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('formen')}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition duration-150 cursor-pointer"
                  >
                    <span className="text-sm block">👷</span>
                    <span className="text-xs font-bold text-slate-700 block mt-1">Formen Paneli</span>
                    <span className="text-[9px] text-slate-400 block">Puantaj ve Raporlama</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('guvenlik')}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition duration-150 cursor-pointer"
                  >
                    <span className="text-sm block">🚧</span>
                    <span className="text-xs font-bold text-slate-700 block mt-1">Güvenlik Kapısı</span>
                    <span className="text-[9px] text-slate-400 block">Tedarikçi Giriş & Kantar</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('kampci')}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition duration-150 cursor-pointer"
                  >
                    <span className="text-sm block">⛺</span>
                    <span className="text-xs font-bold text-slate-700 block mt-1">Kampçı Paneli</span>
                    <span className="text-[9px] text-slate-400 block">Lojman & Oda Dağıtımı</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('lojistik')}
                    className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition duration-150 cursor-pointer"
                  >
                    <span className="text-sm block">🚛</span>
                    <span className="text-xs font-bold text-slate-700 block mt-1">Şöför Paneli</span>
                    <span className="text-[9px] text-slate-400 block">Araç KM Defteri & Sefer</span>
                  </button>
                </div>
              </div>

              {/* Project Status Gauge Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-sm">
                <h3 className="text-xs font-black tracking-wider text-slate-500 uppercase flex items-center space-x-1">
                  <BadgeInfo size={12} className="text-amber-500" />
                  <span>ŞANTİYE AKTİF DURUM göstergeleri</span>
                </h3>
                
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Kadro Doluluk Seviyesi</span>
                      <span>{Math.round((activePersonelCount / (totalPersonel || 1)) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div 
                        className="bg-slate-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${(activePersonelCount / (totalPersonel || 1)) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Satın Alma Onay Oranı</span>
                      <span>{satinAlmaTalepleri.length > 0 ? Math.round((satinAlmaTalepleri.filter(s => s.onayDurumu === 'ONAYLANDI').length / satinAlmaTalepleri.length) * 100) : 100}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${satinAlmaTalepleri.length > 0 ? (satinAlmaTalepleri.filter(s => s.onayDurumu === 'ONAYLANDI').length / satinAlmaTalepleri.length) * 100 : 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SAHA AKIŞI (FEED) */}
          {activeTab === 'akis' && (
            <div className="space-y-3.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">ANLIK SAHA RAPORLARI & LOGLARI</h3>
                <span className="text-[9px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">CANLI EŞZAMANLI</span>
              </div>

              {feedItems.length === 0 ? (
                <div className="text-center py-12 space-y-2 bg-slate-900 rounded-2xl border border-slate-850">
                  <span className="text-3xl block">📭</span>
                  <p className="text-xs text-slate-500">Şantiyede henüz güncel bir hareket veya kayıt yok.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {feedItems.map((item, index) => {
                    const IconComp = item.icon;
                    return (
                      <div key={index} className="bg-slate-900 border border-slate-850 p-3 rounded-2xl flex items-start space-x-3">
                        <div className={`p-2 rounded-xl shrink-0 ${item.color}`}>
                          <IconComp size={16} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-300 block uppercase tracking-wider">{item.title}</span>
                            <span className="text-[9px] text-slate-500 font-medium block shrink-0">{item.tarih}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed font-medium break-words">{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CANLI SOHBET (CHAT) */}
          {activeTab === 'sohbet' && (
            <div className="h-full flex flex-col justify-between space-y-3 animate-fade-in relative">
              
              {/* Tag Selection Row */}
              <div className="flex space-x-1.5 overflow-x-auto shrink-0 pb-1 scrollbar-none">
                {['GENEL', 'ONAY', 'İZİN', 'MALZEME'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className={`py-1 px-3.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 transition cursor-pointer ${
                      selectedTag === tag
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {tag === 'GENEL' ? '💬 Genel' : tag === 'ONAY' ? '🛡️ Onay' : tag === 'İZİN' ? '📅 İzin' : '📦 Malzeme'}
                  </button>
                ))}
              </div>

              {/* Chat Messages Frame */}
              <div className="flex-1 overflow-y-auto bg-slate-900 border border-slate-850 rounded-2xl p-3.5 space-y-3 h-[450px]">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-12 space-y-1.5 text-slate-500">
                    <span className="text-2xl block">💬</span>
                    <p className="text-xs">Sohbet odasına henüz mesaj yazılmadı.</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.senderEmail?.toLowerCase() === currentUser?.email?.toLowerCase();
                    return (
                      <div key={msg.id} className={`flex flex-col space-y-0.5 max-w-[85%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[8px] font-black uppercase text-slate-500">{msg.senderName}</span>
                          <span className="text-[8px] font-mono bg-slate-800 text-slate-400 px-1 rounded">{msg.senderRole}</span>
                        </div>
                        
                        <div className={`p-2.5 rounded-2xl text-xs break-words leading-relaxed font-semibold ${
                          isMe 
                            ? 'bg-amber-500 text-slate-950 rounded-tr-none shadow-md shadow-amber-500/5' 
                            : 'bg-slate-950 text-slate-200 rounded-tl-none border border-slate-800'
                        }`}>
                          {msg.tag && msg.tag !== 'GENEL' && (
                            <span className="text-[8px] font-black block uppercase mb-1 tracking-wider opacity-60">
                              [{msg.tag}]
                            </span>
                          )}
                          {msg.text}
                        </div>
                        <span className="text-[7px] text-slate-600 font-mono">{new Date(msg.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSendChat} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  placeholder={`${selectedTag} kanalına mesaj yazın...`}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition"
                />
                <button
                  type="submit"
                  className="bg-amber-500 text-slate-950 p-2.5 rounded-xl cursor-pointer hover:bg-amber-600 transition flex items-center justify-center shrink-0"
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: ONAY HAVUZU (APPROVALS) */}
          {activeTab === 'onaylar' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">ONAY VE KONTROL HAVUZU</h3>
                <span className="text-[9px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2.5 py-0.5 rounded-full">{totalPendingApprovals} Bekleyen</span>
              </div>

              {/* Section A: Pending Users */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black tracking-wider text-slate-500 uppercase">👥 HESAP ONAYLARI ({pendingUsers.length})</h4>
                {pendingUsers.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic px-1">Kayıt veya onay bekleyen yeni hesap yok.</p>
                ) : (
                  pendingUsers.map(user => (
                    <div key={user.id} className="bg-slate-900 border border-slate-850 p-3 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-black text-white block">{user.ad || ''} {user.soyad || ''}</span>
                          <span className="text-[9px] text-slate-500 block">{user.email}</span>
                        </div>
                        <span className="text-[8px] font-mono bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20">ONAY BEKLİYOR</span>
                      </div>
                      <div className="flex space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRestrictUser(user.id)}
                          className="flex-1 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <Ban size={10} />
                          <span>Kısıtla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveUser(user.id)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 shadow-md shadow-emerald-500/5"
                        >
                          <Check size={11} />
                          <span>Hesabı Onayla</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Section B: Pending Purchase Requests */}
              <div className="space-y-2.5 pt-2 border-t border-slate-900">
                <h4 className="text-[10px] font-black tracking-wider text-slate-500 uppercase">📦 SATIN ALMA ONAYLARI ({pendingPurchases.length})</h4>
                {pendingPurchases.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic px-1">Onay sırasına alınmış yeni satın alma talebi bulunmuyor.</p>
                ) : (
                  pendingPurchases.map(p => (
                    <div key={p.id} className="bg-slate-900 border border-slate-850 p-3 rounded-2xl space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <span className="text-xs font-black text-white block uppercase truncate">{p.malzemeDetay}</span>
                          <p className="text-[9px] text-slate-500 font-medium">Talep Eden: {p.talepEden} | {p.tarih}</p>
                          <span className="text-[10px] font-black text-amber-500 block mt-1">Miktar: {p.miktar} {p.birim}</span>
                        </div>
                        <span className="text-[10px] font-black text-emerald-400 font-mono shrink-0">₺{p.tahminiTutar.toLocaleString('tr-TR')}</span>
                      </div>
                      <div className="flex space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRejectPurchase(p.id)}
                          className="flex-1 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <XCircle size={10} />
                          <span>Reddet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprovePurchase(p.id)}
                          className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 shadow-md shadow-amber-500/5"
                        >
                          <Check size={11} />
                          <span>Talebi Onayla</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Section C: Pending Leaves */}
              <div className="space-y-2.5 pt-2 border-t border-slate-900">
                <h4 className="text-[10px] font-black tracking-wider text-slate-500 uppercase">📅 PERSONEL İZİN ONAYLARI ({pendingLeaves.length})</h4>
                {loadingLeaves ? (
                  <p className="text-[10px] text-slate-500 italic px-1 animate-pulse">İzin talepleri çekiliyor...</p>
                ) : pendingLeaves.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic px-1">Onaylanmayı bekleyen personel izin formu yok.</p>
                ) : (
                  pendingLeaves.map(leave => (
                    <div key={leave.id} className="bg-slate-900 border border-slate-850 p-3 rounded-2xl space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-black text-white block">{leave.personelIsim}</span>
                          <span className="text-[9px] text-slate-500 block">{leave.unvan}</span>
                          <span className="text-[9px] text-slate-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-850 inline-block mt-1 uppercase tracking-wide">
                            {leave.izinTipi.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-indigo-400 block">{leave.toplamGun} Gün</span>
                          <span className="text-[8px] text-slate-500 block font-mono">{leave.baslangicTarihi} / {leave.bitisTarihi}</span>
                        </div>
                      </div>
                      
                      {leave.aciklama && (
                        <p className="text-[10px] bg-slate-950 p-2 rounded-xl text-slate-400 leading-relaxed font-semibold italic">
                          " {leave.aciklama} "
                        </p>
                      )}

                      <div className="flex space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRejectLeave(leave.id)}
                          className="flex-1 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <XCircle size={10} />
                          <span>Reddet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveLeave(leave.id)}
                          className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 shadow-md"
                        >
                          <Check size={11} />
                          <span>İzni Onayla</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Section D: Pending Stock Cards */}
              <div className="space-y-2.5 pt-2 border-t border-slate-900">
                <h4 className="text-[10px] font-black tracking-wider text-slate-500 uppercase">📦 YENİ STOK KARTLARI ({pendingStokKartlar.length})</h4>
                {pendingStokKartlar.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic px-1">Onay bekleyen yeni stok kartı açma talebi yok.</p>
                ) : (
                  pendingStokKartlar.map(card => (
                    <div key={card.id} className="bg-slate-900 border border-slate-850 p-3 rounded-2xl space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono bg-indigo-500/10 text-indigo-400 text-[9px] font-bold px-1.5 py-0.2 rounded border border-indigo-500/20">{card.stokKodu}</span>
                          <span className="text-white font-bold block mt-1">{card.stokAdi}</span>
                          <span className="text-[9px] text-slate-500 block">Kategori: {card.kategori} | Giriş: {card.miktar} {card.birim}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRejectStokKart(card.id)}
                          className="flex-1 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <XCircle size={10} />
                          <span>Sil / Reddet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveStokKart(card.id)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 shadow-md"
                        >
                          <Check size={11} />
                          <span>Kartı Onayla</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Section E: Pending Depo Sayımları */}
              <div className="space-y-2.5 pt-2 border-t border-slate-900">
                <h4 className="text-[10px] font-black tracking-wider text-slate-500 uppercase">📊 DEPO SAYIM ONAYLARI ({pendingSayimlar.length})</h4>
                {pendingSayimlar.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic px-1">Onay bekleyen haftalık depo sayım belgesi yok.</p>
                ) : (
                  pendingSayimlar.map(say => (
                    <div key={say.id} className="bg-slate-900 border border-slate-850 p-3 rounded-2xl space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono bg-indigo-500/10 text-indigo-400 text-[9px] font-bold px-1.5 py-0.2 rounded border border-indigo-500/20">Hafta {say.haftaNo} Sayımı</span>
                          <span className="text-white font-bold block mt-1">Yapan: {say.sayimYapan}</span>
                          {say.notlar && <p className="text-[9.5px] text-slate-400 italic">" {say.notlar} "</p>}
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono shrink-0">{say.tarih}</span>
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 space-y-0.5 bg-slate-950 p-2 rounded-xl border border-slate-900">
                        {say.kalemler?.slice(0, 3).map((k: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span className="truncate max-w-[120px]">{k.urunAdi}</span>
                            <span className={k.diff < 0 ? 'text-rose-400 font-bold' : k.diff > 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                              {k.systemQty}➔{k.physicalQty} ({k.diff > 0 ? `+${k.diff}` : k.diff})
                            </span>
                          </div>
                        ))}
                        {say.kalemler?.length > 3 && <div className="text-[8px] text-slate-500">+ {say.kalemler.length - 3} kalem daha</div>}
                      </div>
                      <div className="flex space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRejectDepoSayim(say.id)}
                          className="flex-1 py-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-400 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
                        >
                          <XCircle size={10} />
                          <span>İptal / Reddet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveDepoSayim(say)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 shadow-md"
                        >
                          <Check size={11} />
                          <span>Sayımı Onayla</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </main>

        {/* BOTTOM MOBILE APP TAB NAVIGATION BAR */}
        <nav className="absolute bottom-0 inset-x-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 flex items-center justify-between z-10">
          <button
            onClick={() => setActiveTab('ozet')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
              activeTab === 'ozet' ? 'text-amber-600 scale-105' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <BarChart3 size={18} />
            <span className="text-[9px] font-black tracking-widest mt-1">ÖZET</span>
          </button>

          <button
            onClick={() => setActiveTab('akis')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
              activeTab === 'akis' ? 'text-amber-600 scale-105' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Bell size={18} />
            <span className="text-[9px] font-black tracking-widest mt-1">AKIŞ</span>
          </button>

          <button
            onClick={() => setActiveTab('sohbet')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
              activeTab === 'sohbet' ? 'text-amber-600 scale-105' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <MessageSquare size={18} />
            <span className="text-[9px] font-black tracking-widest mt-1">SOHBET</span>
          </button>

          <button
            onClick={() => setActiveTab('onaylar')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition relative cursor-pointer ${
              activeTab === 'onaylar' ? 'text-amber-600 scale-105' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ShieldCheck size={18} />
            {totalPendingApprovals > 0 && (
              <span className="absolute top-0 right-5 w-4.5 h-4.5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-lg animate-pulse">
                {totalPendingApprovals}
              </span>
            )}
            <span className="text-[9px] font-black tracking-widest mt-1">ONAYLAR</span>
          </button>
        </nav>
      </>
    )}

      </div>
    </div>
  );
};
