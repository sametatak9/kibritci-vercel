import React, { useState, useEffect } from 'react';
import { 
  Package, Search, RefreshCw, PlusCircle, UserCheck, AlertTriangle, FileText, 
  Check, X, ClipboardList, Layers, ArrowRight, TrendingDown, Trash2, UserPlus, LogOut, Plus
} from 'lucide-react';
import { db, saveDocument } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { StokKart, Personel, SatinAlmaTalebi } from '../types/erp';
import { KibritciLogo } from './KibritciLogo';

interface DepocuScreenProps {
  stokKartlar: StokKart[];
  setStokKartlar: React.Dispatch<React.SetStateAction<StokKart[]>>;
  personeller: Personel[];
  currentUser: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
  addNotification?: (mesaj: string) => void;
}

export const DepocuScreen: React.FC<DepocuScreenProps> = ({
  stokKartlar,
  setStokKartlar,
  personeller,
  currentUser,
  onSignOut,
  isStandalone = false,
  addNotification
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'stocks' | 'counting' | 'assignment' | 'history'>('stocks');
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ─────────────────────────────────────────────────────────────
  // SEARCH & FILTER STATE
  // ─────────────────────────────────────────────────────────────
  const [searchStockQuery, setSearchStockQuery] = useState('');
  const [searchPersonelQuery, setSearchPersonelQuery] = useState('');

  // ─────────────────────────────────────────────────────────────
  // 📦 NEW STOCK CARD FORM STATE (prevent duplicate, append logic)
  // ─────────────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createStokAdi, setCreateStokAdi] = useState('');
  const [createStokKodu, setCreateStokKodu] = useState('');
  const [createKategori, setCreateKategori] = useState('İnşaat Malzemesi');
  const [createBirim, setCreateBirim] = useState('Adet');
  const [createMiktar, setCreateMiktar] = useState('');
  const [createKritikSeviye, setCreateKritikSeviye] = useState('5');

  // ─────────────────────────────────────────────────────────────
  // 📦 1. SAYIM (WEEKLY COUNTING) STATE
  // ─────────────────────────────────────────────────────────────
  const [sayimMiktarlari, setSayimMiktarlari] = useState<Record<string, number>>({});
  const [sayimNot, setSayimNot] = useState('');
  const [loadingSayim, setLoadingSayim] = useState(false);
  const [sayimGecmisi, setSayimGecmisi] = useState<any[]>([]);

  // ─────────────────────────────────────────────────────────────
  // 👤 2. ZİMMETLEME / TAHSİSLEME STATE
  // ─────────────────────────────────────────────────────────────
  const [selectedStockId, setSelectedStockId] = useState('');
  const [selectedPersonelId, setSelectedPersonelId] = useState('');
  const [zimmetMiktar, setZimmetMiktar] = useState<number | ''>('');
  const [zimmetAciklama, setZimmetAciklama] = useState('');
  const [loadingZimmet, setLoadingZimmet] = useState(false);
  const [zimmetlerList, setZimmetlerList] = useState<any[]>([]);

  // Urgent notifications state
  const [showUrgentForm, setShowUrgentForm] = useState(false);
  const [urgentMessage, setUrgentMessage] = useState('');
  const [loadingUrgent, setLoadingUrgent] = useState(false);

  // Real-time listener for Counts and Assignments
  useEffect(() => {
    const unsubSayim = onSnapshot(collection(db, 'depoSayimlari'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setSayimGecmisi(list);
    });

    const unsubZimmet = onSnapshot(collection(db, 'personelZimmetleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setZimmetlerList(list);
    });

    return () => {
      unsubSayim();
      unsubZimmet();
    };
  }, []);

  // Sync counting fields with actual stocks
  useEffect(() => {
    if (stokKartlar.length > 0) {
      const initial: Record<string, number> = {};
      stokKartlar.forEach(s => {
        initial[s.id] = s.miktar || 0;
      });
      setSayimMiktarlari(initial);
    }
  }, [stokKartlar]);

  // Handle new stock card creation with duplicate record check & append quantity
  const handleCreateStokKart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createStokAdi.trim() || !createStokKodu.trim()) {
      alert("Lütfen Stok Adı ve Stok Kodu alanlarını doldurun!");
      return;
    }

    const qty = parseFloat(createMiktar) || 0;
    const crit = parseFloat(createKritikSeviye) || 5;

    // Normalization for duplicate checking
    const targetCode = createStokKodu.trim().toLowerCase();
    const targetName = createStokAdi.trim().toLowerCase();

    // Check if duplicate exists
    const duplicate = stokKartlar.find(s => 
      s.stokKodu.trim().toLowerCase() === targetCode ||
      s.stokAdi.trim().toLowerCase() === targetName
    );

    try {
      const cardId = `STOK-${Date.now()}`;
      const newDoc: StokKart = {
        id: cardId,
        stokKodu: createStokKodu.toUpperCase().trim(),
        stokAdi: createStokAdi.trim(),
        kategori: createKategori,
        birim: createBirim,
        miktar: qty,
        kritikSeviye: crit,
        tarih: new Date().toISOString().slice(0, 10),
        durum: 'ONAY BEKLİYOR',
        aciklama: duplicate 
          ? `Mükerrer Talep (Mevcut Miktar: ${duplicate.miktar || 0} ${duplicate.birim} üzerine +${qty} ekleme talebi)`
          : 'Mobil Depo Paneli üzerinden eklenmiştir.'
      };
      await setDoc(doc(db, 'stokKartlar', cardId), newDoc);
      if (addNotification) {
        addNotification(`Onay Bekleyen yeni stok kartı talebi (${createStokAdi}, Kod: ${createStokKodu}) oluşturuldu.`);
      }
      showStatus('success', `"${createStokAdi}" için onay bekleyen stok kartı talebi başarıyla oluşturuldu! Yönetici onayladığında sisteme yansıyacaktır.`);

      // Reset Create Form fields
      setCreateStokAdi('');
      setCreateStokKodu('');
      setCreateKategori('İnşaat Malzemesi');
      setCreateBirim('Adet');
      setCreateMiktar('');
      setCreateKritikSeviye('5');
      setShowCreateForm(false);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Stok kartı kaydedilirken bir sorun oluştu!');
    }
  };

  const handleQuantityChange = (stockId: string, val: string) => {
    const num = val === '' ? 0 : Number(val);
    setSayimMiktarlari(prev => ({ ...prev, [stockId]: num }));
  };

  const handleSaveWeeklyCount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSayim(true);

    try {
      const sayimId = `depo_sayim_${Date.now()}`;
      const kalemler = stokKartlar.filter(s => s.durum !== 'ONAY BEKLİYOR').map(stock => {
        const physicalQty = sayimMiktarlari[stock.id] ?? 0;
        const systemQty = stock.miktar || 0;
        const diff = physicalQty - systemQty;
        return {
          stockId: stock.id,
          urunAdi: stock.stokAdi,
          kod: stock.stokKodu,
          systemQty,
          physicalQty,
          diff,
          birim: stock.birim
        };
      });

      const countDoc = {
        id: sayimId,
        tarih: new Date().toISOString().slice(0, 10),
        haftaNo: getWeekNumber(new Date()),
        sayimYapan: currentUser?.email || 'depocu_amiri',
        notlar: sayimNot || 'Haftalık rutin depo sayımı.',
        kalemler,
        durum: 'ONAY BEKLİYOR'
      };

      // Save count to database
      await saveDocument('depoSayimlari', countDoc);
      if (addNotification) {
        addNotification(`Onay Bekleyen haftalık depo sayımı (${countDoc.haftaNo}. hafta) kaydedildi.`);
      }

      setSayimNot('');
      showStatus('success', 'Haftalık depo sayımı onay sırasına başarıyla gönderildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Sayım kaydedilirken hata oluştu!');
    } finally {
      setLoadingSayim(false);
    }
  };

  const handleSendKritikUyarisi = async (stock: StokKart) => {
    try {
      const msg = `🚨 KRİTİK STOK UYARISI: "${stock.stokAdi}" (${stock.stokKodu}) kritik seviyenin altına düştü. Mevcut: ${stock.miktar} ${stock.birim} (Limit: ${stock.kritikSeviye}).`;
      
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        tarih: new Date().toISOString(),
        kullanici: currentUser?.email || 'depo_sorumlusu',
        mesaj: msg,
        okundu: false
      };
      await saveDocument('bildirimler', newNotif);
      showStatus('success', `Kritik stok uyarısı yöneticilere başarıyla iletildi!`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Uyarı iletilirken hata oluştu.');
    }
  };

  const handleSendUrgentMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urgentMessage.trim()) return;
    setLoadingUrgent(true);
    try {
      const msg = `🚨 ACİL MALZEME / DEPO BİLDİRİMİ: ${urgentMessage.trim()}`;
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        tarih: new Date().toISOString(),
        kullanici: currentUser?.email || 'depo_sorumlusu',
        mesaj: msg,
        okundu: false
      };
      await saveDocument('bildirimler', newNotif);
      setUrgentMessage('');
      setShowUrgentForm(false);
      showStatus('success', 'Acil durum bildirimi başarıyla gönderildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Bildirim gönderilemedi.');
    } finally {
      setLoadingUrgent(false);
    }
  };

  // Helper to generate Purchase Request from missing items (eksikler)
  const handleCreatePurchaseRequestFromDeficit = async (deficitItems: any[]) => {
    if (deficitItems.length === 0) {
      alert("Eksik ürün bulunmamaktadır!");
      return;
    }

    if (!window.confirm(`Sayım sonucunda tespit edilen ${deficitItems.length} kalem eksik malzeme için şirket yönetimine Satın Alma Talebi oluşturmak istediğinize emin misiniz?`)) return;

    try {
      const saId = `SA-${Date.now().toString().slice(-6)}`;
      const requestDoc: SatinAlmaTalebi = {
        id: saId,
        saId,
        talepEden: currentUser?.email || 'depo_sorumlusu',
        tarih: new Date().toISOString().slice(0, 10),
        onayDurumu: 'ONAY BEKLİYOR',
        cariFirma: '', // To be chosen by admin
        aciklama: 'Haftalık depo sayımı eksiği doğrultusunda otomatik oluşturulan talep.',
        kalemler: deficitItems.map(item => ({
          id: `sa_item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          urunAdi: item.urunAdi,
          miktar: Math.abs(item.diff), // Absolute quantity needed
          birim: item.birim,
          onayMiktar: Math.abs(item.diff),
          birimFiyat: 0,
          kdv: 20,
          marka: '',
          kullanilacakYer: 'DEPO',
          aciklama: 'Haftalık sayım eksiği'
        }))
      };

      await saveDocument('satinAlmaTalepleri', requestDoc);
      if (addNotification) {
        addNotification(`Depo sayım eksiğine istinaden otomatik satın alma talebi (${saId}) oluşturuldu.`);
      }
      alert(`🎉 ${saId} numaralı Satın Alma Talebi başarıyla oluşturuldu ve Onay Havuzuna gönderildi!`);
    } catch (err) {
      console.error(err);
      alert("Talebi oluştururken bir hata oluştu.");
    }
  };

  // ─────────────────────────────────────────────────────────────
  // ACTIONS: ZİMMETLEME / TAHSİSLEME (ASSIGNMENT)
  // ─────────────────────────────────────────────────────────────
  const handleZimmetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockId || !selectedPersonelId || !zimmetMiktar || Number(zimmetMiktar) <= 0) {
      showStatus('error', 'Lütfen tüm alanları eksiksiz ve geçerli doldurun!');
      return;
    }

    const matchedStock = stokKartlar.find(s => s.id === selectedStockId);
    if (!matchedStock) return;

    if ((matchedStock.miktar || 0) < Number(zimmetMiktar)) {
      showStatus('error', `Depoda yeterli stok yok! Mevcut stok: ${matchedStock.miktar} ${matchedStock.birim}`);
      return;
    }

    setLoadingZimmet(true);
    try {
      const matchedPerson = personeller.find(p => p.id === selectedPersonelId);
      const personName = matchedPerson ? `${matchedPerson.ad} ${matchedPerson.soyad}` : 'Kayıtlı Personel';

      const zimmetId = `zimmet_${Date.now()}`;
      const zimmetDoc = {
        id: zimmetId,
        tarih: new Date().toISOString().slice(0, 10),
        personelId: selectedPersonelId,
        personelIsim: personName,
        stockId: selectedStockId,
        urunAdi: matchedStock.stokAdi,
        kod: matchedStock.stokKodu,
        miktar: Number(zimmetMiktar),
        birim: matchedStock.birim,
        aciklama: zimmetAciklama || 'Görevi gereği tahsis edildi.',
        teslimEden: currentUser?.email || 'depo_sorumlusu',
        durum: 'ZİMMETLİ' // ZİMMETLİ | İADE EDİLDİ
      };

      await saveDocument('personelZimmetleri', zimmetDoc);
      if (addNotification) {
        addNotification(`${zimmetMiktar} ${matchedStock.birim} ${matchedStock.stokAdi}, ${personName} adlı personele zimmetlendi.`);
      }

      // Deduct quantity from stock card
      const stockRef = doc(db, 'stokKartlar', selectedStockId);
      await updateDoc(stockRef, {
        miktar: (matchedStock.miktar || 0) - Number(zimmetMiktar)
      });

      setSelectedStockId('');
      setSelectedPersonelId('');
      setZimmetMiktar('');
      setZimmetAciklama('');

      showStatus('success', `🎉 ${zimmetMiktar} ${matchedStock.birim} ${matchedStock.stokAdi}, başarıyla ${personName} adlı personele zimmetlendi!`);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Zimmet kaydı oluşturulurken hata oluştu!');
    } finally {
      setLoadingZimmet(false);
    }
  };

  const handleReturnZimmet = async (zimmet: any) => {
    if (!window.confirm(`${zimmet.miktar} ${zimmet.birim} ${zimmet.urunAdi} malzemesini iade almak istediğinize emin misiniz?`)) return;

    try {
      // Update zimmet status
      const zimmetRef = doc(db, 'personelZimmetleri', zimmet.id);
      await updateDoc(zimmetRef, { durum: 'İADE EDİLDİ', iadeTarihi: new Date().toISOString().slice(0, 10) });

      // Return quantity back to stock card
      const matchedStock = stokKartlar.find(s => s.id === zimmet.stockId);
      if (matchedStock) {
        const stockRef = doc(db, 'stokKartlar', zimmet.stockId);
        await updateDoc(stockRef, {
          miktar: (matchedStock.miktar || 0) + zimmet.miktar
        });
      }

      showStatus('success', 'Malzeme başarıyla depoya iade alındı ve stok güncellendi.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'İade işlemi başarısız.');
    }
  };

  // Helper week number generator
  const getWeekNumber = (d: Date): number => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Filter stocks and personnel
  const filteredStocks = stokKartlar.filter(s => {
    const q = searchStockQuery.toLowerCase();
    return s.stokAdi.toLowerCase().includes(q) || s.stokKodu.toLowerCase().includes(q) || s.kategori.toLowerCase().includes(q);
  });

  const filteredPersonel = personeller.filter(p => {
    const q = searchPersonelQuery.toLowerCase();
    const name = `${p.ad || ''} ${p.soyad || ''}`.toLowerCase();
    return name.includes(q) || (p.gorev || '').toLowerCase().includes(q) || (p.departman || '').toLowerCase().includes(q);
  });

  const mainLayout = (
    <div className={`flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 text-slate-800 font-sans ${viewMode === 'mobile' ? 'max-w-md mx-auto shadow-2xl relative border-x border-slate-250' : 'w-full'}`}>
      
      {/* 📱💻 Görünüm Simülatörü Kontrolü */}
      <div className="bg-slate-100 border-b border-slate-200 p-2.5 px-6 flex justify-between items-center text-xs text-slate-600 shrink-0 print:hidden">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Görünüm:</span>
          <span className="text-[10px] bg-white text-slate-800 font-bold px-2 py-0.5 rounded-lg border border-slate-200 uppercase">
            {viewMode === 'mobile' ? '📱 MOBİL' : '💻 GENİŞ EKRAN'}
          </span>
        </div>
        <button
          onClick={() => setViewMode(viewMode === 'web' ? 'mobile' : 'web')}
          className="bg-slate-900 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          {viewMode === 'web' ? '📱 MOBİL GÖRÜNÜME GEÇ' : '💻 GENİŞ EKRANA GEÇ'}
        </button>
      </div>
      
      {/* 📦 Header */}
      <header className="bg-gradient-to-r from-slate-100 to-indigo-800 p-4 sticky top-0 z-40 flex items-center justify-between select-none shadow-md shrink-0 text-white">
        <div className="flex items-center space-x-2.5">
          <KibritciLogo size="sm" className="h-8" />
          <div>
            <h1 className="text-xs font-black tracking-widest text-white uppercase leading-none">DEPO SORUMLUSU</h1>
            <p className="text-[10px] text-slate-100 font-mono mt-0.5 uppercase tracking-wider font-semibold">MOBİL SAYIM &amp; ZİMMET PANELİ</p>
          </div>
        </div>

        {onSignOut && (
          <button 
            onClick={onSignOut}
            className="bg-white/10 hover:bg-rose-500/20 text-white p-2 rounded-lg transition cursor-pointer"
            title="Güvenli Çıkış"
          >
            <LogOut size={14} />
          </button>
        )}
      </header>

      {/* Status toast inside screen */}
      {statusMessage && (
        <div className={`p-4 text-xs text-center font-bold tracking-wide shrink-0 transition-all ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100' : 'bg-rose-50 text-rose-800 border-b border-rose-100'
        }`}>
          {statusMessage.type === 'success' ? '✓' : '⚠️'} {statusMessage.text}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex bg-white p-1.5 border-b border-slate-200 shrink-0 select-none space-x-1">
        <button
          onClick={() => setActiveSubTab('stocks')}
          className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-center transition cursor-pointer ${
            activeSubTab === 'stocks' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          STOKLAR
        </button>
        <button
          onClick={() => setActiveSubTab('counting')}
          className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-center transition cursor-pointer ${
            activeSubTab === 'counting' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          SAYIM YAP
        </button>
        <button
          onClick={() => setActiveSubTab('assignment')}
          className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-center transition cursor-pointer ${
            activeSubTab === 'assignment' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          ZİMMET/TAHSİS
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-center transition cursor-pointer ${
            activeSubTab === 'history' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          ARŞİV
        </button>
      </div>

      {/* Main Panel Content Area */}
      <div className="flex-grow p-4 space-y-4">

        {/* ─────────────────────────────────────────────────────────────
            TAB 1: STOCK CARD LISTINGS (WITH NEW STOCK CREATION)
            ───────────────────────────────────────────────────────────── */}
        {activeSubTab === 'stocks' && (
          <div className="space-y-4">
            
            {/* Header and Create Button */}
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">STOK KARTLARI LİSTESİ</span>
                <span className="text-[9px] font-mono bg-slate-200/60 px-2 py-0.5 rounded border border-slate-300 font-bold">{filteredStocks.length} Kart</span>
              </div>
              <div className="flex space-x-1.5">
                <button
                  onClick={() => setShowUrgentForm(!showUrgentForm)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition flex items-center space-x-1 shadow-sm cursor-pointer"
                >
                  <AlertTriangle size={12} />
                  <span>{showUrgentForm ? 'Kapat' : 'Acil Durum Bildir'}</span>
                </button>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="bg-slate-900 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl transition flex items-center space-x-1 shadow-sm cursor-pointer"
                >
                  {showCreateForm ? <X size={12} /> : <Plus size={12} />}
                  <span>{showCreateForm ? 'Kapat' : 'Stok Kartı Oluştur'}</span>
                </button>
              </div>
            </div>

            {/* ACİL DURUM / URGENT MESSAGE FORM */}
            {showUrgentForm && (
              <form onSubmit={handleSendUrgentMessage} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3.5 shadow-sm animate-in fade-in duration-200">
                <div className="border-b border-amber-250 pb-1.5">
                  <span className="text-[10px] font-black text-amber-800 block uppercase">🚨 Acil Malzeme / Depo Bildirimi Gönder</span>
                  <p className="text-[9px] text-amber-600">Bu bildiri anında yönetici ana sayfasındaki canlı akışa ve onay havuzuna düşecektir.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-amber-750">Bildirim Açıklaması *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Örn: 1. Etap beton dökümü için acil 50 torba çimento lazım, depoda kalmadı!"
                    value={urgentMessage}
                    onChange={(e) => setUrgentMessage(e.target.value)}
                    className="w-full bg-white border border-amber-200 rounded-xl p-2 px-3 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500/25 outline-none resize-none"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowUrgentForm(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold py-1.5 px-3 rounded-xl text-[10px] transition cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={loadingUrgent}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-4 rounded-xl text-[10px] transition cursor-pointer"
                  >
                    {loadingUrgent ? 'Gönderiliyor...' : 'Yöneticilere İlet'}
                  </button>
                </div>
              </form>
            )}

            {/* CREATE NEW STOCK CARD FORM (Appends if duplicate) */}
            {showCreateForm && (
              <form onSubmit={handleCreateStokKart} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-sm animate-in fade-in duration-200">
                <div className="border-b pb-1.5">
                  <span className="text-[10px] font-black text-slate-700 block uppercase">📦 Yeni Stok Kartı Ekle</span>
                  <p className="text-[9px] text-slate-400">Aynı isim veya kodda kart eklenirse otomatik olarak mevcut miktara iliştirilir.</p>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500">Stok Kodu *</label>
                    <input 
                      type="text"
                      placeholder="Örn: CM-325"
                      required
                      value={createStokKodu}
                      onChange={(e) => setCreateStokKodu(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500">Stok Adı *</label>
                    <input 
                      type="text"
                      placeholder="Örn: Çimento 50Kg Torba"
                      required
                      value={createStokAdi}
                      onChange={(e) => setCreateStokAdi(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-slate-900 focus:border-slate-900/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500">Kategori</label>
                    <select
                      value={createKategori}
                      onChange={(e) => setCreateKategori(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-slate-900 focus:border-slate-900/20"
                    >
                      <option value="İnşaat Malzemesi">İnşaat Malzemesi</option>
                      <option value="İş Güvenliği (İSG)">İş Güvenliği (İSG)</option>
                      <option value="El Aleti / Hırdavat">El Aleti / Hırdavat</option>
                      <option value="Sarf Malzeme">Sarf Malzeme</option>
                      <option value="Tesisat / Elektrik">Tesisat / Elektrik</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500">Ölçü Birimi</label>
                    <select
                      value={createBirim}
                      onChange={(e) => setCreateBirim(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-slate-900 focus:border-slate-900/20"
                    >
                      <option value="Adet">Adet</option>
                      <option value="Kg">Kg</option>
                      <option value="Metre">Metre</option>
                      <option value="Torba">Torba</option>
                      <option value="Koli">Koli</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500">Giriş Miktarı</label>
                    <input 
                      type="number"
                      placeholder="Örn: 150"
                      value={createMiktar}
                      onChange={(e) => setCreateMiktar(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500">Kritik Stok Seviyesi</label>
                    <input 
                      type="number"
                      placeholder="Örn: 5"
                      value={createKritikSeviye}
                      onChange={(e) => setCreateKritikSeviye(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-1.5 px-3 rounded-xl text-xs transition cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="bg-slate-900 hover:bg-slate-900 text-white font-bold py-1.5 px-4 rounded-xl text-xs transition cursor-pointer"
                  >
                    Stok Kartını Kaydet
                  </button>
                </div>
              </form>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Malzeme adı veya stok kodu ara..."
                value={searchStockQuery}
                onChange={(e) => setSearchStockQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 text-xs text-slate-800 pl-9 pr-3 py-2.5 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900/25 outline-none"
              />
            </div>

            {/* Stocks Cards Grid List */}
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredStocks.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 italic">Aranan kriterde stok kartı bulunamadı.</p>
              ) : (
                filteredStocks.map(stock => (
                  <div key={stock.id} className="bg-white border border-slate-200 p-3.5 rounded-2xl flex justify-between items-center hover:border-slate-200 transition shadow-3xs">
                    <div>
                      <span className="text-[8px] font-mono font-black text-slate-400 uppercase tracking-wider block">
                        {stock.kategori} | {stock.stokKodu}
                        {stock.durum === 'ONAY BEKLİYOR' && (
                          <span className="ml-2 text-[8px] bg-amber-500/10 text-amber-600 font-bold border border-amber-500/25 px-1.5 py-0.2 rounded font-sans">ONAY BEKLİYOR</span>
                        )}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 mt-1">{stock.stokAdi}</h4>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[8px] text-slate-400 block font-bold uppercase leading-none mb-1">Mevcut Adet</span>
                      {stock.durum === 'ONAY BEKLİYOR' ? (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          ONAY BEKLİYOR
                        </span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className={`text-xs font-mono font-black py-0.5 px-2.5 rounded-md ${
                            (stock.miktar || 0) <= (stock.kritikSeviye || 5) 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {stock.miktar || 0} {stock.birim}
                          </span>
                          {(stock.miktar || 0) <= (stock.kritikSeviye || 5) && (
                            <button
                              type="button"
                              onClick={() => handleSendKritikUyarisi(stock)}
                              className="mt-1 text-[8px] bg-amber-500 hover:bg-amber-600 text-slate-950 px-1.5 py-0.5 rounded font-bold cursor-pointer"
                            >
                              ⚠️ Yöneticiye Bildir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 2: DEPO SAYIMI (WEEKLY DISCREPANCY CALCULATION)
            ───────────────────────────────────────────────────────────── */}
        {activeSubTab === 'counting' && (
          <div className="space-y-4">
            <div className="bg-white p-4 border border-slate-200 rounded-3xl space-y-3.5 shadow-sm">
              <div>
                <span className="font-extrabold text-[9px] text-amber-600 uppercase tracking-wider block">HAFTALIK FİZİKSEL SAYIM &amp; FARKLAR</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Fiziksel sayım miktarını girin, sistem farkı (eksik/fazla) otomatik hesaplar.</p>
              </div>

              <form onSubmit={handleSaveWeeklyCount} className="space-y-4">
                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {stokKartlar.filter(s => s.durum !== 'ONAY BEKLİYOR').map(stock => {
                    const physical = sayimMiktarlari[stock.id] ?? 0;
                    const system = stock.miktar || 0;
                    const diff = physical - system;

                    return (
                      <div key={stock.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                        <div className="flex-1 pr-2">
                          <span className="text-[8px] font-mono text-slate-400">{stock.stokKodu}</span>
                          <span className="text-xs font-bold text-slate-800 block truncate">{stock.stokAdi}</span>
                          <span className="text-[9px] text-slate-500">Kayıtlı: {system} {stock.birim}</span>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          {/* Diff Badge */}
                          {diff !== 0 && (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                              diff < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {diff > 0 ? `+${diff}` : diff} {stock.birim}
                            </span>
                          )}

                          <input
                            type="number"
                            min={0}
                            required
                            value={sayimMiktarlari[stock.id] ?? ''}
                            onChange={(e) => handleQuantityChange(stock.id, e.target.value)}
                            className="w-16 bg-white border border-slate-300 rounded-xl p-1.5 text-xs text-right text-slate-800 font-bold font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10 outline-none"
                            placeholder="Sayı"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Sayım Açıklaması</label>
                  <textarea
                    placeholder="Örn: Hafta sonu sayımı, faturası gelmeyen 2 kalem stok fazlası var..."
                    value={sayimNot}
                    onChange={(e) => setSayimNot(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-xs text-slate-800 p-2.5 px-3 rounded-2xl outline-none h-14 resize-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loadingSayim}
                  className="w-full bg-slate-900 hover:bg-slate-900 disabled:bg-slate-900 text-white font-bold text-xs py-3 rounded-2xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-sm"
                >
                  {loadingSayim ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                  <span>HAFTALIK SAYIMI ONAYA GÖNDER</span>
                </button>
              </form>
            </div>

            {/* Generate purchase request option based on deficit items in previous counts */}
            {sayimGecmisi.length > 0 && (
              <div className="bg-rose-50 p-4 border border-rose-100 rounded-3xl text-center space-y-3">
                <div className="flex justify-center text-rose-600">
                  <TrendingDown size={22} className="stroke-[2.5]" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Eksik Malzeme Talebi</h4>
                  <p className="text-[10px] text-slate-500 mt-1">Son yapılan sayım sonuçlarındaki eksik kalemleri doğrudan şirket yönetimine Satın Alma Talebi olarak iletebilirsiniz.</p>
                </div>
                <button
                  onClick={() => {
                    const lastCount = sayimGecmisi[0];
                    if (!lastCount || !lastCount.kalemler) return;
                    const deficits = lastCount.kalemler.filter((k: any) => k.diff < 0);
                    handleCreatePurchaseRequestFromDeficit(deficits);
                  }}
                  className="w-full bg-white hover:bg-rose-100/50 border border-rose-200 text-rose-700 font-bold text-[10px] py-2 rounded-xl transition cursor-pointer"
                >
                  Son Sayım Eksikleri İçin Satın Alma Talebi Aç
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 3: ZİMMETLEME / TAHSİSLEME (ASSIGNMENT TO PERSONNEL)
            ───────────────────────────────────────────────────────────── */}
        {activeSubTab === 'assignment' && (
          <div className="space-y-4">
            <div className="bg-white p-4 border border-slate-200 rounded-3xl space-y-3.5 shadow-sm animate-in fade-in duration-200">
              <div>
                <span className="font-extrabold text-[9px] text-slate-800 uppercase tracking-wider block">PERSONEL MALZEME ZİMMETLEME</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Depo stok kartlarındaki malzemeleri aktif personelin üzerine zimmetleyin.</p>
              </div>

              <form onSubmit={handleZimmetSubmit} className="space-y-4">
                
                {/* 1. Stock Selector */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Zimmetlenecek Malzeme *</label>
                  <select
                    required
                    value={selectedStockId}
                    onChange={(e) => setSelectedStockId(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-xs text-slate-800 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10"
                  >
                    <option value="">-- Malzeme Seçin --</option>
                    {stokKartlar.filter(s => s.durum !== 'ONAY BEKLİYOR').map(s => (
                      <option key={s.id} value={s.id}>
                        {s.stokAdi} ({s.stokKodu}) - Depo: {s.miktar || 0} {s.birim}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Personnel Search & Selector */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Zimmetlenecek Personel *</label>
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-3.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Personel veya firma adı ara..."
                      value={searchPersonelQuery}
                      onChange={(e) => setSearchPersonelQuery(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-[10px] text-slate-800 pl-8 pr-3 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10"
                    />
                  </div>
                  <select
                    required
                    value={selectedPersonelId}
                    onChange={(e) => setSelectedPersonelId(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-xs text-slate-800 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10"
                  >
                    <option value="">-- Personel Seçin --</option>
                    {filteredPersonel.slice(0, 15).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.ad} {p.soyad} ({p.gorev} - {p.departman || 'Ana Firma'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Quantity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Zimmet Miktarı *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="Adet"
                      value={zimmetMiktar}
                      onChange={(e) => setZimmetMiktar(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 text-xs text-slate-800 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">Açıklama / Not</label>
                    <input
                      type="text"
                      placeholder="Örn: Baret + Maske seti"
                      value={zimmetAciklama}
                      onChange={(e) => setZimmetAciklama(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-xs text-slate-800 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900/10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loadingZimmet}
                  className="w-full bg-slate-900 hover:bg-slate-900 disabled:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-sm"
                >
                  {loadingZimmet ? <RefreshCw size={13} className="animate-spin" /> : <UserCheck size={14} />}
                  <span>ZİMMETI PERSONELE TAHSİS ET</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 4: ARŞİV (HISTORY OF COUNTS AND ASSIGNMENTS)
            ───────────────────────────────────────────────────────────── */}
        {activeSubTab === 'history' && (
          <div className="space-y-4">
            
            {/* Real Zimmetler List */}
            <div className="bg-white p-4 border border-slate-200 rounded-3xl space-y-3 shadow-sm animate-in fade-in duration-200">
              <span className="font-extrabold text-[9px] text-slate-500 uppercase tracking-wider block">GÜNCEL AKTİF ZİMMET LİSTESİ</span>
              
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {zimmetlerList.length === 0 ? (
                  <p className="text-[10px] text-slate-450 text-center py-4 italic">Zimmetli ürün bulunmamaktadır.</p>
                ) : (
                  zimmetlerList.map(z => (
                    <div key={z.id} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex justify-between items-center text-xs">
                      <div>
                        <h4 className="font-bold text-slate-800">{z.personelIsim}</h4>
                        <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">{z.miktar} {z.birim} {z.urunAdi} ({z.kod})</span>
                        {z.durum === 'İADE EDİLDİ' ? (
                          <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded mt-1 inline-block border border-emerald-100">Depoya İade Edildi</span>
                        ) : (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded mt-1 inline-block border border-amber-100">Personelde Zimmetli</span>
                        )}
                      </div>
                      
                      {z.durum === 'ZİMMETLİ' && (
                        <button
                          onClick={() => handleReturnZimmet(z)}
                          className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-[9px] px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          İade Al
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Counts Archive */}
            <div className="bg-white p-4 border border-slate-200 rounded-3xl space-y-3 shadow-sm animate-in fade-in duration-200">
              <span className="font-extrabold text-[9px] text-slate-500 uppercase tracking-wider block">GEÇMİŞ SAYIM ARŞİVİ</span>
              
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {sayimGecmisi.length === 0 ? (
                  <p className="text-[10px] text-slate-450 text-center py-4 italic">Kayıtlı geçmiş sayım bulunmuyor.</p>
                ) : (
                  sayimGecmisi.map(say => (
                    <div key={say.id} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="bg-slate-50 text-slate-800 border border-slate-200 text-[8px] font-black px-1.5 py-0.5 rounded uppercase font-mono">
                          Hafta {say.haftaNo || '1'} Sayımı
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">{say.tarih}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 italic">"{say.notlar}"</p>
                      <div className="text-[9px] text-slate-400 font-mono">Yapan: {say.sayimYapan}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );

  if (!isStandalone && viewMode === 'mobile') {
    return (
      <div className="flex-1 bg-slate-200 flex justify-center py-6 px-4 overflow-hidden min-h-screen print:hidden">
        <div className="w-full max-w-[420px] h-[720px] max-h-[82vh] bg-white rounded-[3rem] border-[10px] border-slate-800 shadow-2xl overflow-hidden flex flex-col relative">
          {/* Notch / Dynamic Island */}
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-800 mr-2"></div>
            <div className="w-10 h-0.5 bg-slate-900 rounded"></div>
          </div>
          <div className="flex-grow flex flex-col overflow-hidden pt-4">
            {mainLayout}
          </div>
        </div>
      </div>
    );
  }

  return mainLayout;
};
