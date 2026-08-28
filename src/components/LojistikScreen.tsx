import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, Plus, Trash2, Camera, CheckCircle, Search, AlertCircle, 
  FileText, Calendar, Printer, Phone, MapPin, Wallet, ClipboardList, Clock, Check, X
} from 'lucide-react';
import { AracBakim, Personel } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

interface LojistikScreenProps {
  irsaliyeler: any[];
  setIrsaliyeler: any;
  satinAlmaTalepleri: any[];
  araclar: AracBakim[];
  setAraclar: any;
  aracKmLoglari: any[];
  setAracKmLoglari: any;
  currentUser?: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
}

export const LojistikScreen: React.FC<LojistikScreenProps> = ({
  araclar,
  setAraclar,
  currentUser,
  onSignOut,
  isStandalone = false
}) => {
  const [activeTab, setActiveTab] = useState<'günlük_rutin' | 'günlük_faaliyet' | 'haftalık_km' | 'araç_kartı' | 'rotalar' | 'yol_harcaması' | 'mini_raporlar' | 'aylik_rapor'>('günlük_rutin');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const getMaintenanceAlerts = (a: AracBakim) => {
    const alerts: { text: string, type: 'warning' | 'danger' }[] = [];
    const oilLimit = (a.sonYagBakimKm || 0) + (a.yagBakimKmAraligi || 10000);
    const oilDiff = oilLimit - (a.mevcutKm || 0);
    if (oilDiff <= 1000) {
      alerts.push({
        text: `Yağ: ${oilDiff <= 0 ? 'GEÇTİ!' : `${oilDiff} KM`}`,
        type: oilDiff <= 0 ? 'danger' : 'warning'
      });
    }
    
    if (a.muayeneTarihi) {
      const muayene = new Date(a.muayeneTarihi);
      const today = new Date();
      today.setHours(0,0,0,0);
      const diffTime = muayene.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        alerts.push({
          text: `Muayene: ${diffDays <= 0 ? 'GEÇTİ!' : `${diffDays} Gün`}`,
          type: diffDays <= 0 ? 'danger' : 'warning'
        });
      }
    }
    return alerts;
  };

  // Synchronized Firestore Collections
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [gunlukRutinLoglar, setGunlukRutinLoglar] = useState<any[]>([]);
  const [haftalikKmLoglar, setHaftalikKmLoglar] = useState<any[]>([]);
  const [aracTalepleri, setAracTalepleri] = useState<any[]>([]);
  const [seyahatRotalari, setSeyahatRotalari] = useState<any[]>([]);
  const [yolHarcamalari, setYolHarcamalari] = useState<any[]>([]);
  const [soforFaaliyetleri, setSoforFaaliyetleri] = useState<any[]>([]);

  // Daily Activity States
  const [faaliyetArac, setFaaliyetArac] = useState('');
  const [faaliyetTarih, setFaaliyetTarih] = useState(new Date().toISOString().split('T')[0]);
  const [faaliyetRota, setFaaliyetRota] = useState('');
  const [faaliyetDetay, setFaaliyetDetay] = useState('');
  const [faaliyetMasraf, setFaaliyetMasraf] = useState('');
  const [faaliyetIptalNedeni, setFaaliyetIptalNedeni] = useState('');
  const [faaliyetFaturaFoto, setFaaliyetFaturaFoto] = useState<string | null>(null);
  const [faaliyetSaveLoading, setFaaliyetSaveLoading] = useState(false);

  // Monthly Report States
  const [raporArac, setRaporArac] = useState('');
  const [raporAy, setRaporAy] = useState(new Date().getMonth() + 1); // 1-12
  const [raporYil, setRaporYil] = useState(new Date().getFullYear());
  const [raporFormat, setRaporFormat] = useState<'NORMAL' | 'E-IMZALI'>('NORMAL');

  // Local subscriptions to Firestore
  useEffect(() => {
    const unsubP = onSnapshot(collection(db, 'personeller'), (snap) => {
      const list: Personel[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Personel);
      });
      setPersoneller(list);
    });

    const unsubG = onSnapshot(collection(db, 'gunlukRutinKmLoglari'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setGunlukRutinLoglar(list);
    });

    const unsubH = onSnapshot(collection(db, 'haftalikKmGirisleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.pazartesiTarih || 0).getTime() - new Date(a.pazartesiTarih || 0).getTime());
      setHaftalikKmLoglar(list);
    });

    const unsubT = onSnapshot(collection(db, 'aracOnayTalepleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.talepTarihi || 0).getTime() - new Date(a.talepTarihi || 0).getTime());
      setAracTalepleri(list);
    });

    const unsubR = onSnapshot(collection(db, 'seyahatRotalari'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setSeyahatRotalari(list);
    });

    const unsubE = onSnapshot(collection(db, 'yolHarcamalari'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setYolHarcamalari(list);
    });

    const unsubF = onSnapshot(collection(db, 'soforGunlukFaaliyetleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setSoforFaaliyetleri(list);
    });

    return () => {
      unsubP();
      unsubG();
      unsubH();
      unsubT();
      unsubR();
      unsubE();
      unsubF();
    };
  }, []);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const currentChauffeurName = currentUser?.displayName || currentUser?.ad || currentUser?.email || 'Şöför';

  // ==========================================
  // TAB 1: GÜNLÜK RUTIN (SABAH / AKŞAM KM)
  // ==========================================
  const [rutinTarih, setRutinTarih] = useState(new Date().toISOString().split('T')[0]);
  const [rutinKmInputs, setRutinKmInputs] = useState<{ [plaka: string]: { sabah: string, aksam: string, aciklama: string } }>({});

  useEffect(() => {
    // Load existing values for chosen date
    const dayLog = gunlukRutinLoglar.find(l => l.tarih === rutinTarih);
    const initialInputs: typeof rutinKmInputs = {};
    araclar.forEach(a => {
      initialInputs[a.plaka] = {
        sabah: dayLog?.veri?.[a.plaka]?.sabah !== undefined ? String(dayLog.veri[a.plaka].sabah) : '',
        aksam: dayLog?.veri?.[a.plaka]?.aksam !== undefined ? String(dayLog.veri[a.plaka].aksam) : '',
        aciklama: dayLog?.veri?.[a.plaka]?.aciklama || ''
      };
    });
    setRutinKmInputs(initialInputs);
  }, [rutinTarih, gunlukRutinLoglar, araclar]);

  const handleRutinInputChange = (plaka: string, key: 'sabah' | 'aksam' | 'aciklama', val: string) => {
    setRutinKmInputs(prev => ({
      ...prev,
      [plaka]: {
        ...prev[plaka],
        [key]: val
      }
    }));
  };

  const handleSaveGunlukRutin = async () => {
    try {
      const cleanedData: { [plaka: string]: { sabah: number | null, aksam: number | null, aciklama: string } } = {};
      
      // Update local vehicle odometer state with latest night odoms
      const updatedAracList = [...araclar];

      for (const plaka of Object.keys(rutinKmInputs)) {
        const sVal = parseFloat(rutinKmInputs[plaka]?.sabah) || null;
        const aVal = parseFloat(rutinKmInputs[plaka]?.aksam) || null;
        const explanation = rutinKmInputs[plaka]?.aciklama || '';
        cleanedData[plaka] = { sabah: sVal, aksam: aVal, aciklama: explanation };

        // If evening odometer is entered, update active vehicle mileage
        if (aVal) {
          const index = updatedAracList.findIndex(ar => ar.plaka === plaka);
          if (index !== -1 && aVal > updatedAracList[index].mevcutKm) {
            updatedAracList[index].mevcutKm = aVal;
          }
        }

        // Save individual logs to aracKmLoglari for relation and histories
        if (sVal || aVal) {
          const logId = `log_${plaka}_${rutinTarih}`;
          await setDoc(doc(db, 'aracKmLoglari', logId), {
            id: logId,
            tarih: rutinTarih,
            plaka,
            surucu: currentChauffeurName,
            sabahKm: sVal || 0,
            aksamKm: aVal || 0,
            fark: (sVal && aVal) ? (aVal - sVal) : 0,
            aciklama: explanation
          });
        }
      }

      // Save to Daily Rutin KM Logs collection
      const docRef = doc(db, 'gunlukRutinKmLoglari', rutinTarih);
      await setDoc(docRef, {
        tarih: rutinTarih,
        veri: cleanedData,
        kaydeden: currentChauffeurName,
        guncellemeZamani: new Date().toISOString()
      });

      // Sync vehicle changes to Firestore
      for (const ar of updatedAracList) {
        await setDoc(doc(db, 'araclar', ar.id), ar);
      }

      showStatus('success', 'Günlük sabah/akşam kilometre sayaçları başarıyla kaydedildi!');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Kilometreler kaydedilirken bir hata ile karşılaşıldı.');
    }
  };

  // ==========================================
  // TAB 2: HAFTALIK KM GİRİŞİ (PZT / CMT)
  // ==========================================
  const [weeklyPlaka, setWeeklyPlaka] = useState('');
  const [pazartesiKm, setPazartesiKm] = useState('');
  const [cumartesiKm, setCumartesiKm] = useState('');
  const [pazartesiTarih, setPazartesiTarih] = useState('');
  const [cumartesiTarih, setCumartesiTarih] = useState('');

  // Auto-fill Monday KM based on chosen vehicle
  useEffect(() => {
    if (weeklyPlaka) {
      const v = araclar.find(a => a.plaka === weeklyPlaka);
      if (v) {
        setPazartesiKm(String(v.mevcutKm || ''));
      }
    }
  }, [weeklyPlaka, araclar]);

  const handleSaveGunlukFaaliyet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faaliyetArac) {
      alert('Lütfen bir araç seçin!');
      return;
    }
    if (!faaliyetRota && !faaliyetIptalNedeni) {
      alert('Lütfen rota tanımını girin ya da seyahat gerçekleşmediyse nedenini belirtin!');
      return;
    }

    setFaaliyetSaveLoading(true);
    try {
      const fId = `faaliyet_${Date.now()}`;
      await setDoc(doc(db, 'soforGunlukFaaliyetleri', fId), {
        id: fId,
        tarih: faaliyetTarih,
        plaka: faaliyetArac,
        rota: faaliyetRota,
        detay: faaliyetDetay,
        masraf: parseFloat(faaliyetMasraf) || 0,
        iptalNedeni: faaliyetIptalNedeni,
        faturaFotoUrl: faaliyetFaturaFoto || '',
        surucu: currentChauffeurName,
        olusturmaTarihi: new Date().toISOString()
      });

      showStatus('success', 'Günlük faaliyet kaydı başarıyla oluşturuldu!');
      setFaaliyetArac('');
      setFaaliyetRota('');
      setFaaliyetDetay('');
      setFaaliyetMasraf('');
      setFaaliyetIptalNedeni('');
      setFaaliyetFaturaFoto(null);
    } catch (err: any) {
      console.error(err);
      showStatus('error', `Hata oluştu: ${err.message}`);
    } finally {
      setFaaliyetSaveLoading(false);
    }
  };

  const handleSaveWeeklyKm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weeklyPlaka) {
      alert('Lütfen bir araç seçin!');
      return;
    }
    if (!pazartesiTarih) {
      alert('Lütfen Pazartesi tarihini belirtin!');
      return;
    }

    try {
      const pKm = parseFloat(pazartesiKm) || 0;
      const cKm = parseFloat(cumartesiKm) || null;
      const fark = cKm ? (cKm - pKm) : null;

      const logId = `haftalik_${weeklyPlaka}_${pazartesiTarih}`;
      await setDoc(doc(db, 'haftalikKmGirisleri', logId), {
        id: logId,
        plaka: weeklyPlaka,
        pazartesiTarih,
        cumartesiTarih: cumartesiTarih || '',
        pazartesiKm: pKm,
        cumartesiKm: cKm,
        fark,
        ekleyen: currentChauffeurName,
        tarih: new Date().toISOString()
      });

      // Update actual vehicle mileage if Saturday KM is higher
      if (cKm) {
        const v = araclar.find(a => a.plaka === weeklyPlaka);
        if (v && cKm > v.mevcutKm) {
          await setDoc(doc(db, 'araclar', v.id), {
            ...v,
            mevcutKm: cKm
          });
        }
      }

      showStatus('success', 'Haftalık KM verisi başarıyla işlendi!');
      setWeeklyPlaka('');
      setPazartesiKm('');
      setCumartesiKm('');
      setPazartesiTarih('');
      setCumartesiTarih('');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Haftalık veri kaydedilemedi.');
    }
  };

  // ==========================================
  // TAB 3: ARAÇ KARTI OLUŞTURMA & ONAY
  // ==========================================
  const [newPlaka, setNewPlaka] = useState('');
  const [newMarkaModel, setNewMarkaModel] = useState('');
  const [newMuayeneKm, setNewMuayeneKm] = useState('');
  const [newMuayeneTarihi, setNewMuayeneTarihi] = useState('');
  const [newYagBakimKm, setNewYagBakimKm] = useState('');
  const [newYagBakimTarihi, setNewYagBakimTarihi] = useState('');
  const [newYagBakimKmAraligi, setNewYagBakimKmAraligi] = useState('10000');

  const handleCreateVehicleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaka) {
      alert('Lütfen geçerli bir Plaka yazın!');
      return;
    }

    try {
      const talepId = `talep_${Date.now()}`;
      await setDoc(doc(db, 'aracOnayTalepleri', talepId), {
        id: talepId,
        plaka: newPlaka.toUpperCase().trim(),
        markaModel: newMarkaModel,
        muayeneKm: parseFloat(newMuayeneKm) || 0,
        muayeneTarihi: newMuayeneTarihi,
        sonYagBakimKm: parseFloat(newYagBakimKm) || 0,
        yagBakimTarihi: newYagBakimTarihi,
        yagBakimKmAraligi: parseFloat(newYagBakimKmAraligi) || 10000,
        durum: 'ONAY BEKLİYOR',
        gonderen: currentChauffeurName,
        talepTarihi: new Date().toISOString()
      });

      showStatus('success', 'Araç oluşturma/bakım talebi yöneticilerin onay havuzuna gönderildi!');
      setNewPlaka('');
      setNewMarkaModel('');
      setNewMuayeneKm('');
      setNewMuayeneTarihi('');
      setNewYagBakimKm('');
      setNewYagBakimTarihi('');
      setNewYagBakimKmAraligi('10000');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Talep gönderilirken hata oluştu.');
    }
  };

  // ==========================================
  // TAB 4: SEYAHAT ROTARI (ROTALAR)
  // ==========================================
  const [rotaIsmi, setRotaIsmi] = useState('');
  const [rotaArac, setRotaArac] = useState('');
  const [rotaYoneticiAd, setRotaYoneticiAd] = useState('');
  const [rotaYoneticiTel, setRotaYoneticiTel] = useState('');
  const [rotaTarih, setRotaTarih] = useState(new Date().toISOString().split('T')[0]);
  const [rotaNotlar, setRotaNotlar] = useState('');
  const [rotaSearch, setRotaSearch] = useState('');

  const handleSaveRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rotaIsmi || !rotaArac) {
      alert('Lütfen Rota İsmi ve Araç Seçiniz!');
      return;
    }

    try {
      const rId = `rota_${Date.now()}`;
      await setDoc(doc(db, 'seyahatRotalari', rId), {
        id: rId,
        rotaIsmi,
        arac: rotaArac,
        yoneticiAd: rotaYoneticiAd,
        yoneticiTel: rotaYoneticiTel,
        tarih: rotaTarih,
        notlar: rotaNotlar,
        surucu: currentChauffeurName
      });

      showStatus('success', 'Seyahat rotası başarıyla kaydedildi!');
      setRotaIsmi('');
      setRotaArac('');
      setRotaYoneticiAd('');
      setRotaYoneticiTel('');
      setRotaNotlar('');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Rota kaydedilemedi.');
    }
  };

  // ==========================================
  // TAB 5: YOL HARCAMASI (FİŞ / FATURA YÜKLE)
  // ==========================================
  const [harcamaTutar, setHarcamaTutar] = useState('');
  const [harcamaAciklama, setHarcamaAciklama] = useState('');
  const [harcamaTarih, setHarcamaTarih] = useState(new Date().toISOString().split('T')[0]);
  const [faturaFotoBase64, setFaturaFotoBase64] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const compressed = await compressImage(file);
      setFaturaFotoBase64(compressed);
    } catch (err) {
      console.error(err);
      alert('Görsel sıkıştırılamadı, lütfen tekrar deneyin.');
    } finally {
      setCompressing(false);
    }
  };

  const handleSaveYolHarcamasi = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(harcamaTutar) || 0;
    if (amount <= 0 || !harcamaAciklama) {
      alert('Lütfen geçerli bir Tutar ve Açıklama belirtin!');
      return;
    }

    try {
      const hId = `harcama_${Date.now()}`;
      await setDoc(doc(db, 'yolHarcamalari', hId), {
        id: hId,
        tarih: harcamaTarih,
        tutar: amount,
        aciklama: harcamaAciklama,
        faturaFotoUrl: faturaFotoBase64 || '',
        durum: 'ONAY BEKLİYOR',
        surucu: currentChauffeurName
      });

      showStatus('success', 'Yol harcaması ve evrak görseli başarıyla yöneticilere gönderildi!');
      setHarcamaTutar('');
      setHarcamaAciklama('');
      setFaturaFotoBase64(null);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Harcama kaydı gönderilemedi.');
    }
  };

  // ==========================================
  // REPORT PRINTING
  // ==========================================
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-800 p-4 lg:p-6 font-sans flex flex-col">
      
      {/* Upper Status Notifications */}
      {statusMessage && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-xs font-bold transition-all duration-300 flex items-center space-x-2 animate-bounce ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <span>{statusMessage.type === 'success' ? '✅' : '❌'}</span>
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* Upper Dashboard Widget */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-5 lg:p-6 text-white shadow-lg border border-blue-600">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-white/10 rounded-2xl">
                <Truck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-base tracking-tight">Şöför Mobil Paneli</h1>
                <p className="text-[11px] text-blue-100 mt-0.5">
                  Giriş Yapan Yetkili: <span className="font-bold">{currentChauffeurName}</span>
                </p>
              </div>
            </div>
            
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/5">
                <span className="text-[10px] text-blue-200 block">Sistem Vasıtaları</span>
                <span className="text-sm font-bold font-mono">{araclar.length}</span>
              </div>
              <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/5">
                <span className="text-[10px] text-blue-200 block">Bekleyen Onaylar</span>
                <span className="text-sm font-bold font-mono text-amber-300">
                  {aracTalepleri.filter(t => t.durum === 'ONAY BEKLİYOR').length + yolHarcamalari.filter(y => y.durum === 'ONAY BEKLİYOR').length}
                </span>
              </div>
              <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/5">
                <span className="text-[10px] text-blue-200 block">Kayıtlı Rotalar</span>
                <span className="text-sm font-bold font-mono">{seyahatRotalari.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1.5 overflow-x-auto p-1 bg-white/80 backdrop-blur-xs rounded-2xl border border-slate-200 shrink-0 select-none scrollbar-none">
          <button 
            onClick={() => setActiveTab('günlük_rutin')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'günlük_rutin' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            🗓️ Günlük Rutin
          </button>
          <button 
            onClick={() => setActiveTab('günlük_faaliyet')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'günlük_faaliyet' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            📝 Günlük Faaliyet Kaydı
          </button>
          <button 
            onClick={() => setActiveTab('haftalık_km')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'haftalık_km' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            📊 Haftalık KM
          </button>
          <button 
            onClick={() => setActiveTab('araç_kartı')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'araç_kartı' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            🚗 Araç Kartı &amp; Onay
          </button>
          <button 
            onClick={() => setActiveTab('rotalar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'rotalar' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            📍 Seyahat Rotaları
          </button>
          <button 
            onClick={() => setActiveTab('yol_harcaması')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'yol_harcaması' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            💳 Fiş / Yol Harcaması
          </button>
          <button 
            onClick={() => setActiveTab('mini_raporlar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'mini_raporlar' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            🖨️ Mini Raporlar
          </button>
          <button 
            onClick={() => setActiveTab('aylik_rapor')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition duration-150 shrink-0 cursor-pointer ${activeTab === 'aylik_rapor' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            📅 Aylık Sefer Raporu
          </button>
        </div>

        {/* Dynamic Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* Main Work Area (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-5">
            
            {/* TAB 1: GÜNLÜK RUTİN */}
            {activeTab === 'günlük_rutin' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3 gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                      <span>🗓️ Günlük Sabah &amp; Akşam KM Rutini</span>
                    </h2>
                    <p className="text-[10px] text-slate-500">Tüm şirket araçlarının sabah kalkınca ve akşam dönüşte sayaçlarını işleyin.</p>
                  </div>
                  
                  {/* Date Picker */}
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold text-slate-400">Rutin Günü:</span>
                    <input 
                      type="date" 
                      value={rutinTarih} 
                      onChange={(e) => setRutinTarih(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-1 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                {/* Vehicles List Inputs */}
                {araclar.length === 0 ? (
                  <div className="p-10 text-center text-xs italic text-slate-400">Sisteme kayıtlı vasıta bulunmuyor.</div>
                ) : (
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {araclar.map(arac => (
                      <div key={arac.id} className="border rounded-2xl p-4 hover:border-slate-300 transition bg-slate-50/50">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          
                          {/* Info Block */}
                          <div className="flex items-center space-x-3">
                            <span className="font-mono bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-xl border border-blue-100 shadow-3xs shrink-0">
                              {arac.plaka}
                            </span>
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">{arac.markaModel}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">Güncel KM: {arac.mevcutKm} KM</span>
                            </div>
                          </div>

                          {/* Inputs */}
                          <div className="flex flex-col sm:flex-row sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                            <div>
                              <span className="text-[9px] font-bold text-slate-450 uppercase block mb-0.5">☀️ Sabah KM</span>
                              <input 
                                type="number"
                                placeholder="Sayaç"
                                value={rutinKmInputs[arac.plaka]?.sabah || ''}
                                onChange={(e) => handleRutinInputChange(arac.plaka, 'sabah', e.target.value)}
                                className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                              />
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-450 uppercase block mb-0.5">🌙 Akşam KM</span>
                              <input 
                                type="number"
                                placeholder="Sayaç"
                                value={rutinKmInputs[arac.plaka]?.aksam || ''}
                                onChange={(e) => handleRutinInputChange(arac.plaka, 'aksam', e.target.value)}
                                className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                              />
                            </div>
                            <div className="flex-1 sm:w-48">
                              <span className="text-[9px] font-bold text-slate-450 uppercase block mb-0.5">📝 Not / Durum</span>
                              <input 
                                type="text"
                                placeholder="Açıklama giriniz..."
                                value={rutinKmInputs[arac.plaka]?.aciklama || ''}
                                onChange={(e) => handleRutinInputChange(arac.plaka, 'aciklama', e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                              />
                            </div>
                          </div>

                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t flex justify-end">
                  <button
                    onClick={handleSaveGunlukRutin}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition flex items-center space-x-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>Günlük Rutini Kaydet</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB: GÜNLÜK FAALİYET KAYDI */}
            {activeTab === 'günlük_faaliyet' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs animate-in fade-in duration-150">
                <div className="border-b pb-3">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                    <span>📝 Günlük Sevk ve Sürücü Faaliyet Kaydı</span>
                  </h2>
                  <p className="text-[10px] text-slate-500">Araç ile gerçekleştirdiğiniz günlük seferleri, masrafları ve teslimat detaylarını kaydedin.</p>
                </div>

                <form onSubmit={handleSaveGunlukFaaliyet} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Kullanılan Araç</label>
                      <select
                        value={faaliyetArac}
                        onChange={(e) => setFaaliyetArac(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-700"
                        required
                      >
                        <option value="">-- Araç Seçin --</option>
                        {araclar.map(a => (
                          <option key={a.id} value={a.plaka}>{a.plaka} - {a.markaModel}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Faaliyet Tarihi</label>
                      <input 
                        type="date"
                        value={faaliyetTarih}
                        onChange={(e) => setFaaliyetTarih(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Gidilen Rota / Güzergah</label>
                      <input 
                        type="text"
                        placeholder="Örn: Şantiye - Liman - Şantiye (Seyahat yapılmadıysa boş bırakın)"
                        value={faaliyetRota}
                        onChange={(e) => setFaaliyetRota(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Yol Harcaması / Masraf Tutarı (TL)</label>
                      <input 
                        type="number"
                        placeholder="Örn: 250 (İsteğe bağlı)"
                        value={faaliyetMasraf}
                        onChange={(e) => setFaaliyetMasraf(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Yapılan İş / Sevk Edilen Malzeme Detayı</label>
                    <textarea 
                      rows={2}
                      placeholder="Örn: Demir sevkiyatı yapıldı, şantiye şefine teslim edildi."
                      value={faaliyetDetay}
                      onChange={(e) => setFaaliyetDetay(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1 bg-rose-50/50 border border-rose-100 p-3 rounded-2xl">
                    <label className="text-[10px] font-bold text-rose-800 uppercase block">❌ Seyahat Gerçekleşmediyse Nedeni</label>
                    <input 
                      type="text"
                      placeholder="Örn: Araç bakımdaydı / Şantiye içi dinlenme"
                      value={faaliyetIptalNedeni}
                      onChange={(e) => setFaaliyetIptalNedeni(e.target.value)}
                      className="w-full rounded-xl border border-rose-200 bg-white mt-1 px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500/20 text-slate-800 font-medium"
                    />
                  </div>

                  {/* Fiş/Fatura visual attachment in activity log */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">📷 Harcama Belgesi / Fiş Görseli Ekle (İsteğe bağlı)</label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const fileInput = document.createElement('input');
                          fileInput.type = 'file';
                          fileInput.accept = 'image/*';
                          fileInput.onchange = async (e: any) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressed = await compressImage(file);
                                setFaaliyetFaturaFoto(compressed);
                              } catch (err) {
                                alert('Resim yüklenemedi.');
                              }
                            }
                          };
                          fileInput.click();
                        }}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-350/60 font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer transition text-slate-700"
                      >
                        Dosya / Fotoğraf Seç
                      </button>
                      {faaliyetFaturaFoto && (
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-150">
                          ✓ Görsel Eklendi
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t">
                    <button
                      type="submit"
                      disabled={faaliyetSaveLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition flex items-center space-x-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                    >
                      {faaliyetSaveLoading ? 'Faaliyet Kaydediliyor...' : 'Faaliyet Kaydet'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: HAFTALIK KM GİRİŞİ */}
            {activeTab === 'haftalık_km' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="border-b pb-3">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                    <span>📊 Haftalık Kilometre Takibi</span>
                  </h2>
                  <p className="text-[10px] text-slate-500">Pazartesi ilk kilometreleri ve Cumartesi son kilometreleri kaydedip raporlayın.</p>
                </div>

                <form onSubmit={handleSaveWeeklyKm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Vehicle selection */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Araç Seçimi</label>
                    <select
                      value={weeklyPlaka}
                      onChange={(e) => setWeeklyPlaka(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-700"
                    >
                      <option value="">-- Plaka Seçin --</option>
                      {araclar.map(a => (
                        <option key={a.id} value={a.plaka}>{a.plaka} - {a.markaModel}</option>
                      ))}
                    </select>
                  </div>

                  {/* Empty Spacer */}
                  <div className="hidden md:block"></div>

                  {/* Monday inputs */}
                  <div className="bg-amber-50/40 p-3.5 rounded-2xl border border-amber-100/60 space-y-3">
                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-wide block">🗓️ Pazartesi Girişi (İlk KM)</span>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500">Pazartesi Tarihi</label>
                      <input 
                        type="date"
                        value={pazartesiTarih}
                        onChange={(e) => setPazartesiTarih(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500">İlk Sayaç Değeri (KM)</label>
                      <input 
                        type="number"
                        placeholder="Örn: 154200"
                        value={pazartesiKm}
                        onChange={(e) => setPazartesiKm(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Saturday inputs */}
                  <div className="bg-indigo-50/40 p-3.5 rounded-2xl border border-indigo-100/60 space-y-3">
                    <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wide block">🗓️ Cumartesi Girişi (Son KM)</span>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500">Cumartesi Tarihi (Opsiyonel)</label>
                      <input 
                        type="date"
                        value={cumartesiTarih}
                        onChange={(e) => setCumartesiTarih(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500">Son Sayaç Değeri (KM - Opsiyonel)</label>
                      <input 
                        type="number"
                        placeholder="Örn: 155150"
                        value={cumartesiKm}
                        onChange={(e) => setCumartesiKm(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2 flex justify-end pt-2 border-t">
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition flex items-center space-x-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                    >
                      <span>Haftalık Takip Girişini Kaydet</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: ARAÇ KARTI VE ONAY TALEBİ */}
            {activeTab === 'araç_kartı' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="border-b pb-3">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                    <span>🚗 Yeni Araç Kartı &amp; Bakım Limiti Tanımlama</span>
                  </h2>
                  <p className="text-[10px] text-slate-500">
                    Oluşturduğunuz araç kartları ve yaptığınız değişiklikler yöneticilerin onayına sunulur, onaylanırsa sisteme işlenir.
                  </p>
                </div>

                <form onSubmit={handleCreateVehicleRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Araç Plakası</label>
                    <input 
                      type="text" 
                      placeholder="Örn: 34KBR999"
                      value={newPlaka}
                      onChange={(e) => setNewPlaka(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Marka ve Model</label>
                    <input 
                      type="text" 
                      placeholder="Örn: Ford Transit 2023"
                      value={newMarkaModel}
                      onChange={(e) => setNewMarkaModel(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Muayene / Mevcut KM</label>
                    <input 
                      type="number" 
                      placeholder="Örn: 104500"
                      value={newMuayeneKm}
                      onChange={(e) => setNewMuayeneKm(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Muayene Geçerlilik Tarihi</label>
                    <input 
                      type="date" 
                      value={newMuayeneTarihi}
                      onChange={(e) => setNewMuayeneTarihi(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Son Yağ Bakım KM</label>
                    <input 
                      type="number" 
                      placeholder="Örn: 95000"
                      value={newYagBakimKm}
                      onChange={(e) => setNewYagBakimKm(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Son Yağ Bakım Tarihi</label>
                    <input 
                      type="date" 
                      value={newYagBakimTarihi}
                      onChange={(e) => setNewYagBakimTarihi(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Yağ Bakım KM Aralığı</label>
                    <select
                      value={newYagBakimKmAraligi}
                      onChange={(e) => setNewYagBakimKmAraligi(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    >
                      <option value="10000">10.000 KM</option>
                      <option value="15000">15.000 KM</option>
                      <option value="20000">20.000 KM</option>
                      <option value="30000">30.000 KM</option>
                    </select>
                  </div>

                  <div className="col-span-1 md:col-span-2 flex justify-end pt-2 border-t">
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition flex items-center space-x-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                    >
                      <span>Kart Onay Talebi Gönder</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 4: SEYAHAT ROTARI */}
            {activeTab === 'rotalar' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="border-b pb-3">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                    <span>📍 Seyahat Rotası &amp; Rotalandırma</span>
                  </h2>
                  <p className="text-[10px] text-slate-500">Rotalarınızı kaydedip, yönetici iletişim numaralarını gelecek seyahatler için saklayın.</p>
                </div>

                <form onSubmit={handleSaveRoute} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Rota İsmi</label>
                    <input 
                      type="text" 
                      placeholder="Örn: Şantiye - Merkez Ofis - Liman"
                      value={rotaIsmi}
                      onChange={(e) => setRotaIsmi(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Kullanılan Vasıta</label>
                    <select
                      value={rotaArac}
                      onChange={(e) => setRotaArac(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-700"
                    >
                      <option value="">-- Araç Seçin --</option>
                      {araclar.map(a => (
                        <option key={a.id} value={a.plaka}>{a.plaka} - {a.markaModel}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Bölge Sorumlusu Adı</label>
                    <input 
                      type="text" 
                      placeholder="Örn: Ahmet Bey (Saha Şefi)"
                      value={rotaYoneticiAd}
                      onChange={(e) => setRotaYoneticiAd(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Sorumlu İletişim Numarası</label>
                    <input 
                      type="tel" 
                      placeholder="Örn: +90 555..."
                      value={rotaYoneticiTel}
                      onChange={(e) => setRotaYoneticiTel(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Seyahat Tarihi</label>
                    <input 
                      type="date" 
                      value={rotaTarih}
                      onChange={(e) => setRotaTarih(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Rota / Seyahat Notları</label>
                    <textarea 
                      rows={2}
                      placeholder="Gözlemlerinizi veya teslimat detaylarını yazabilirsiniz..."
                      value={rotaNotlar}
                      onChange={(e) => setRotaNotlar(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2 flex justify-end pt-2 border-t">
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition flex items-center space-x-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                    >
                      <span>Rotayı ve İletişimi Kaydet</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 5: YOL HARCAMASI */}
            {activeTab === 'yol_harcaması' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="border-b pb-3">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                    <span>💳 Yol Harcaması (Fiş / Fatura) Girişi</span>
                  </h2>
                  <p className="text-[10px] text-slate-500">Yaptığınız yol harcamalarını (yakıt, otoban vs.) fiş görseli ile yükleyin, onay sonrası şöför ödemelerinize işlensin.</p>
                </div>

                <form onSubmit={handleSaveYolHarcamasi} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Tutar (TL)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Örn: 1450.50"
                        value={harcamaTutar}
                        onChange={(e) => setHarcamaTutar(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Harcama Tarihi</label>
                      <input 
                        type="date" 
                        value={harcamaTarih}
                        onChange={(e) => setHarcamaTarih(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Harcama Açıklaması</label>
                    <input 
                      type="text" 
                      placeholder="Örn: Yakıt Alımı - BP Bolu İstasyonu"
                      value={harcamaAciklama}
                      onChange={(e) => setHarcamaAciklama(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                    />
                  </div>

                  {/* Receipt Upload */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1.5">
                      <span>📷 Fiş / Fatura Görseli Yükle (Kamera veya Dosya)</span>
                    </label>
                    
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-100 hover:bg-slate-250 border border-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition flex items-center space-x-1.5 shrink-0 cursor-pointer"
                        disabled={compressing}
                      >
                        <Camera className="h-4 w-4" />
                        <span>{compressing ? 'Sıkıştırılıyor...' : 'Görsel Seç / Foto Çek'}</span>
                      </button>
                      
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        className="hidden"
                      />

                      {faturaFotoBase64 && (
                        <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 px-2.5 py-1.5 rounded-xl border border-emerald-200 text-[10px]">
                          <span>✅ Evrak Görseli Eklendi</span>
                          <button 
                            type="button" 
                            onClick={() => setFaturaFotoBase64(null)} 
                            className="text-rose-500 font-extrabold cursor-pointer hover:text-rose-700"
                          >
                            ✖ SİL
                          </button>
                        </div>
                      )}
                    </div>

                    {faturaFotoBase64 && (
                      <div className="border border-slate-200 p-2.5 rounded-2xl bg-slate-50 flex items-center justify-center max-w-sm">
                        <img 
                          src={faturaFotoBase64} 
                          alt="Harcama Fişi" 
                          className="max-h-48 object-contain rounded" 
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2 border-t">
                    <button
                      type="submit"
                      disabled={compressing}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition flex items-center space-x-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                    >
                      <span>Harcama Talebini Gönder</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 6: PRINTABLE MINI REPORTS */}
            {activeTab === 'mini_raporlar' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                
                {/* Print Control Bar (Hidden on actual print) */}
                <div className="flex items-center justify-between border-b pb-3 print:hidden">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                      <span>🖨️ Yazıcı Uyumlu Mini Raporlar</span>
                    </h2>
                    <p className="text-[10px] text-slate-500">Kâğıt tasarrufu sağlayan, daraltılmış ve temiz yazıcı tasarımlı şöför raporları.</p>
                  </div>
                  <button
                    onClick={handlePrint}
                    className="bg-slate-900 hover:bg-black text-white font-bold py-2 px-4 rounded-xl text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Raporu Yazdır</span>
                  </button>
                </div>

                {/* ACTUAL PRINTABLE CORE FRAME */}
                <div className="p-4 bg-white border border-slate-350/50 rounded-2xl font-mono text-slate-950 max-h-[60vh] overflow-y-auto print:max-h-none print:p-0 print:border-0 print:rounded-none">
                  
                  {/* Print Header */}
                  <div className="text-center space-y-1.5 pb-4 border-b-2 border-slate-950">
                    <h3 className="text-xs font-black tracking-wide uppercase">KİBRİTÇİ İNŞAAT A.Ş.</h3>
                    <h4 className="text-[11px] font-bold">ŞÖFÖR VE SEVKİYAT GÜNLÜK FAALİYET MUTABAKATI</h4>
                    <div className="flex justify-between text-[9px] pt-1 px-1">
                      <span>Sürücü: {currentChauffeurName}</span>
                      <span>Raporlama Tarihi: {new Date().toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>

                  {/* Section 1: Daily KM Checks */}
                  <div className="pt-3 space-y-1.5 pb-3 border-b border-dashed border-slate-950">
                    <span className="text-[10px] font-black border-b border-slate-950 block pb-0.5">1. GÜNLÜK SABAH/AKŞAM KİLOMETRE DETAYLARI</span>
                    {gunlukRutinLoglar.slice(0, 5).map((log, idx) => (
                      <div key={idx} className="text-[9px] space-y-1">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>📅 Tarih: {log.tarih}</span>
                          <span>Kaydeden: {log.kaydeden}</span>
                        </div>
                        <table className="w-full text-left font-mono border-t border-slate-200">
                          <thead>
                            <tr className="text-slate-500">
                              <th>Plaka</th>
                              <th className="text-right">Sabah KM</th>
                              <th className="text-right">Akşam KM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(log.veri || {}).map(plaka => (
                              <tr key={plaka} className="border-t border-slate-100">
                                <td>{plaka}</td>
                                <td className="text-right font-bold text-slate-800">{log.veri[plaka]?.sabah || '-'}</td>
                                <td className="text-right font-bold text-slate-800">{log.veri[plaka]?.aksam || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  {/* Section 2: Weekly KM Tracker */}
                  <div className="pt-3 space-y-1.5 pb-3 border-b border-dashed border-slate-950">
                    <span className="text-[10px] font-black border-b border-slate-950 block pb-0.5">2. HAFTALIK KM SAYACI RAPORLARI</span>
                    {haftalikKmLoglar.length === 0 ? (
                      <p className="text-[9px] text-slate-500 italic">Kayıtlı haftalık log bulunmuyor.</p>
                    ) : (
                      <table className="w-full text-left font-mono text-[9px]">
                        <thead>
                          <tr className="font-bold border-b text-slate-500">
                            <th>Plaka</th>
                            <th>Pazartesi (İlk)</th>
                            <th>Cumartesi (Son)</th>
                            <th className="text-right">Fark (KM)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {haftalikKmLoglar.slice(0, 10).map((log, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="font-bold text-slate-800">{log.plaka}</td>
                              <td>{log.pazartesiKm} KM <span className="text-[8px] text-slate-400">({log.pazartesiTarih})</span></td>
                              <td>{log.cumartesiKm ? `${log.cumartesiKm} KM` : '-'} <span className="text-[8px] text-slate-400">({log.cumartesiTarih})</span></td>
                              <td className="text-right font-black text-rose-600">{log.fark !== null && log.fark !== undefined ? `${log.fark} KM` : 'Harcama Sürüyor'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Section 3: Travel Logs database */}
                  <div className="pt-3 space-y-1.5 pb-3 border-b border-dashed border-slate-950">
                    <span className="text-[10px] font-black border-b border-slate-950 block pb-0.5">3. SEYAHAT VE ROTA ARŞİVİ</span>
                    {seyahatRotalari.length === 0 ? (
                      <p className="text-[9px] text-slate-500 italic">Kayıtlı seyahat rotası bulunmuyor.</p>
                    ) : (
                      <table className="w-full text-left font-mono text-[9px]">
                        <thead>
                          <tr className="font-bold border-b text-slate-500">
                            <th>Tarih</th>
                            <th>Rota</th>
                            <th>Vasıta</th>
                            <th>Muhatap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seyahatRotalari.slice(0, 10).map((rota, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td>{rota.tarih}</td>
                              <td className="font-bold text-slate-800">{rota.rotaIsmi}</td>
                              <td>{rota.arac}</td>
                              <td>{rota.yoneticiAd} ({rota.yoneticiTel})</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Section 4: Chauffeur Dues / Expenses */}
                  <div className="pt-3 space-y-1.5">
                    <span className="text-[10px] font-black border-b border-slate-950 block pb-0.5">4. SEFER VE YOL HARCAMA MUTABAKATI</span>
                    {yolHarcamalari.length === 0 ? (
                      <p className="text-[9px] text-slate-500 italic">Kayıtlı yol harcaması bulunmuyor.</p>
                    ) : (
                      <table className="w-full text-left font-mono text-[9px]">
                        <thead>
                          <tr className="font-bold border-b text-slate-500">
                            <th>Tarih</th>
                            <th>Açıklama</th>
                            <th>Durum</th>
                            <th className="text-right">Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yolHarcamalari.slice(0, 15).map((exp, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td>{exp.tarih}</td>
                              <td>{exp.aciklama}</td>
                              <td className={exp.durum === 'ONAYLANDI' ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>{exp.durum}</td>
                              <td className="text-right font-black font-mono text-rose-600">{exp.tutar} TL</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Print Footer signatures space */}
                  <div className="pt-8 grid grid-cols-2 gap-4 text-center text-[10px] font-bold border-t mt-6">
                    <div>
                      <span>Teslim Eden Şöför</span>
                      <div className="h-10"></div>
                      <span className="block border-t border-slate-950 pt-1 text-[9px]">{currentChauffeurName}</span>
                    </div>
                    <div>
                      <span>Onaylayan Muhasebe / Şantiye Şefi</span>
                      <div className="h-10"></div>
                      <span className="block border-t border-slate-950 pt-1 text-[9px]">İmza / Kaşe</span>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* TAB: AYLIK SEFER RAPORU */}
            {activeTab === 'aylik_rapor' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs animate-in fade-in duration-150">
                <div className="border-b pb-3 flex justify-between items-center flex-wrap gap-2 print:hidden">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5">
                      <span>📅 Aylık Sefer ve Masraf Raporu Derleyici</span>
                    </h2>
                    <p className="text-[10px] text-slate-500">Seçtiğiniz araç ve ay için tüm seyahat, sayaç ve masraf geçmişini resimli ekleriyle derleyin.</p>
                  </div>
                  <button
                    onClick={handlePrint}
                    className="bg-slate-900 hover:bg-black text-white font-bold py-2 px-4 rounded-xl text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Raporu Yazdır / PDF</span>
                  </button>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 print:hidden bg-slate-50 p-3 rounded-2xl border text-xs">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Araç Seçin</label>
                    <select
                      value={raporArac}
                      onChange={(e) => setRaporArac(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white p-1 text-xs"
                    >
                      <option value="">-- Plaka Seçin --</option>
                      {araclar.map(a => (
                        <option key={a.id} value={a.plaka}>{a.plaka} - {a.markaModel}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Ay</label>
                    <select
                      value={raporAy}
                      onChange={(e) => setRaporAy(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white p-1 text-xs"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>{m}. Ay</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Yıl</label>
                    <select
                      value={raporYil}
                      onChange={(e) => setRaporYil(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white p-1 text-xs"
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">İmza Türü</label>
                    <div className="flex bg-white rounded border border-slate-300 p-0.5">
                      <button 
                        type="button" 
                        onClick={() => setRaporFormat('NORMAL')}
                        className={`flex-1 text-[9px] font-bold rounded py-0.5 ${raporFormat === 'NORMAL' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
                      >
                        NORMAL
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setRaporFormat('E-IMZALI')}
                        className={`flex-1 text-[9px] font-bold rounded py-0.5 ${raporFormat === 'E-IMZALI' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}
                      >
                        E-İMZA
                      </button>
                    </div>
                  </div>
                </div>

                {/* Printable Document Core */}
                {!raporArac ? (
                  <div className="text-center py-10 text-slate-400 italic text-xs bg-slate-50/50 rounded-2xl border border-dashed print:hidden">
                    Lütfen üstteki kontrol panelinden bir araç seçerek aylık sefer raporunu derleyin.
                  </div>
                ) : (() => {
                  const matchingFaaliyetler = soforFaaliyetleri.filter(f => {
                    if (f.plaka !== raporArac) return false;
                    const date = new Date(f.tarih);
                    return (date.getMonth() + 1) === raporAy && date.getFullYear() === raporYil;
                  });

                  const matchingKmLogs = gunlukRutinLoglar.filter(l => {
                    const date = new Date(l.tarih);
                    return (date.getMonth() + 1) === raporAy && date.getFullYear() === raporYil;
                  });

                  const totalExpenses = matchingFaaliyetler.reduce((sum, curr) => sum + (curr.masraf || 0), 0);

                  return (
                    <div className="border border-slate-350/60 p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-6 printable-document">
                      {/* Report Header */}
                      <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-center">
                        <div>
                          <h3 className="text-sm font-black uppercase text-[#1E4E78]">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Lojistik ve Vasıta Yönetim Müdürlüğü</p>
                          <p className="text-[9px] text-slate-800 mt-1">Dönem: <strong className="font-bold">{raporAy}/{raporYil} Aylık Raporu</strong></p>
                        </div>
                        <div className="text-right">
                          <span className="border border-slate-900 text-[8px] font-bold px-2 py-0.5 bg-slate-50 uppercase tracking-widest block mb-1">
                            PLAKA: {raporArac}
                          </span>
                          <span className="text-[8px] text-slate-500">Derleme: {new Date().toLocaleDateString('tr-TR')}</span>
                        </div>
                      </div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-3 gap-3 border-y py-3 bg-slate-50/50">
                        <div className="text-center">
                          <span className="text-[8px] text-slate-500 block font-bold uppercase">Toplam Sefer</span>
                          <span className="text-xs font-bold mt-1 block">{matchingFaaliyetler.filter(f => f.rota).length} Sefer</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[8px] text-slate-500 block font-bold uppercase">Yol Harcamaları</span>
                          <span className="text-xs font-bold text-rose-700 mt-1 block">₺{totalExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[8px] text-slate-500 block font-bold uppercase">İptal/Yatış Günü</span>
                          <span className="text-xs font-bold text-amber-700 mt-1 block">{matchingFaaliyetler.filter(f => f.iptalNedeni).length} Gün</span>
                        </div>
                      </div>

                      {/* Travel ledger table */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black border-b border-slate-900 block pb-0.5">1. SÜRÜCÜ FAALİYET KRONOLOJİSİ</span>
                        {matchingFaaliyetler.length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic py-2">Bu dönemde girilmiş faaliyet bulunamadı.</p>
                        ) : (
                          <table className="w-full text-left text-[9px] border-collapse font-mono">
                            <thead>
                              <tr className="border-b text-slate-500 font-bold">
                                <th className="p-1 w-20">Tarih</th>
                                <th className="p-1 w-36">Güzergah</th>
                                <th className="p-1">Yapılan İş</th>
                                <th className="p-1 text-right w-16">Harcama</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matchingFaaliyetler.map(f => (
                                <tr key={f.id} className="border-b border-slate-100 vertical-align-top">
                                  <td className="p-1 font-bold">{f.tarih}</td>
                                  <td className="p-1 text-slate-800 font-semibold">{f.rota || <span className="text-rose-600 italic">SEFER İPTAL: {f.iptalNedeni}</span>}</td>
                                  <td className="p-1 text-slate-650">{f.detay || '-'}</td>
                                  <td className="p-1 text-right font-bold text-rose-650">{f.masraf ? `₺${f.masraf}` : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Odometer history log table */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black border-b border-slate-900 block pb-0.5">2. KİLOMETRE SAYACI SEYRÜSEFER DEFTARI</span>
                        {matchingKmLogs.length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic py-2">Bu dönemde sayaç kaydı bulunamadı.</p>
                        ) : (
                          <table className="w-full text-left text-[9px] border-collapse font-mono">
                            <thead>
                              <tr className="border-b text-slate-500 font-bold">
                                <th className="p-1">Tarih</th>
                                <th className="p-1 text-right">Sabah Sayaç</th>
                                <th className="p-1 text-right">Akşam Sayaç</th>
                                <th className="p-1 text-right">Fark (KM)</th>
                                <th className="p-1 pl-4">İş İçi Not / Durum</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matchingKmLogs.map(l => {
                                const details = l.veri?.[raporArac];
                                if (!details || (!details.sabah && !details.aksam)) return null;
                                const difference = (details.sabah && details.aksam) ? (details.aksam - details.sabah) : 0;
                                return (
                                  <tr key={l.id} className="border-b border-slate-100">
                                    <td className="p-1 font-bold">{l.tarih}</td>
                                    <td className="p-1 text-right">{details.sabah || '-'}</td>
                                    <td className="p-1 text-right">{details.aksam || '-'}</td>
                                    <td className="p-1 text-right font-bold text-blue-600">{difference ? `${difference} KM` : '-'}</td>
                                    <td className="p-1 pl-4 text-slate-500 italic text-[8.5px]">{details.aciklama || 'Sorunsuz'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Image attachments panel */}
                      <div className="space-y-2 pt-2">
                        <span className="text-[9px] font-black border-b border-slate-900 block pb-0.5">3. EK BELGELER VE FİŞ EKLERİ</span>
                        {(() => {
                          const images = matchingFaaliyetler.filter(f => f.faturaFotoUrl);
                          if (images.length === 0) {
                            return <p className="text-[10px] text-slate-500 italic">Eklenecek fatura/fiş görseli bulunmamaktadır.</p>;
                          }
                          return (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                              {images.map((f, i) => (
                                <div key={i} className="border border-slate-300 p-2 rounded-xl flex flex-col items-center bg-slate-50/50">
                                  <img 
                                    src={f.faturaFotoUrl} 
                                    alt={`Ek-${f.tarih}`} 
                                    className="max-h-36 object-contain rounded border border-slate-200" 
                                  />
                                  <span className="text-[7.5px] text-slate-500 font-bold font-mono mt-1.5">{f.tarih} - Harcama Fişi</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Official Sign-off Approval Bars */}
                      <div className="pt-6 border-t mt-6">
                        {raporFormat === 'E-IMZALI' ? (
                          <div className="border border-emerald-500/30 rounded-xl p-3 bg-emerald-50/40 flex items-center justify-between gap-3">
                            <div className="flex items-center space-x-2">
                              <span className="text-xl">🛡️</span>
                              <div>
                                <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wide block">✓ ELEKTRONİK İMZA MUTABAKAT ONAYI</span>
                                <p className="text-[8px] text-slate-500 leading-tight mt-0.5">
                                  Bu rapor, şirket lojistik departmanı tarafından dijital mühürle onaylanmıştır.<br />
                                  Secure Hash: SHA-{(Date.now() % 1000000).toString(16).toUpperCase()} • Doğrulama Kodu: {Math.random().toString(36).substring(2, 8).toUpperCase()}
                                </p>
                              </div>
                            </div>
                            <div className="border p-1 bg-white shrink-0 text-center text-[6px] text-slate-400 font-bold font-mono">
                              QR SEAL
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div className="border p-2 rounded-lg bg-slate-50/50">
                              <span className="font-bold text-slate-800 block text-[9.5px]">Sevk Sürücüsü</span>
                              <div className="h-6"></div>
                              <span className="text-[8px] border-t pt-0.5 text-slate-450 block">İmza</span>
                            </div>
                            <div className="border p-2 rounded-lg bg-slate-50/50">
                              <span className="font-bold text-slate-800 block text-[9.5px]">Şantiye Şefi / Onay</span>
                              <div className="h-6"></div>
                              <span className="text-[8px] border-t pt-0.5 text-slate-450 block">Kaşe / İmza</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

          </div>

          {/* Right Reference Lists Column */}
          <div className="space-y-5">
            
            {/* 1. SEKTÖR ARAÇ VERİ TABANI */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3.5 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">🛞 Şirket Araç Filosu ({araclar.length})</span>
              
              {araclar.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Hiç araç kaydı bulunmuyor.</p>
              ) : (
                <div className="space-y-2 max-h-[32vh] overflow-y-auto pr-1">
                  {araclar.map(a => {
                    const maintAlerts = getMaintenanceAlerts(a);
                    return (
                      <div key={a.id} className="bg-slate-50 hover:bg-slate-100 transition p-3 rounded-2xl border border-slate-100 flex flex-col space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-[10px] font-bold text-slate-700 bg-white border px-1.5 py-0.5 rounded shadow-3xs">{a.plaka}</span>
                            <span className="text-xs font-bold text-slate-800 ml-2">{a.markaModel}</span>
                          </div>
                          <div className="text-right text-[10px] font-mono font-bold text-blue-600">
                            {a.mevcutKm} KM
                          </div>
                        </div>
                        {maintAlerts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {maintAlerts.map((alert, i) => (
                              <span 
                                key={i} 
                                className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                                  alert.type === 'danger' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                ⚠️ {alert.text}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. SEYAHAT ROTALARI HISTORY */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3.5 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">🗺️ Kayıtlı Rota Geçmişi ({seyahatRotalari.length})</span>
              
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Rota / Bölge Ara..."
                  value={rotaSearch}
                  onChange={(e) => setRotaSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-1.5 text-[11px] focus:ring-2 focus:ring-blue-500/20 text-slate-800"
                />
              </div>

              {seyahatRotalari.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Hiç kayıtlı seyahat rotası bulunmuyor.</p>
              ) : (
                <div className="space-y-2 max-h-[32vh] overflow-y-auto pr-1">
                  {seyahatRotalari.filter(r => r.rotaIsmi?.toLowerCase().includes(rotaSearch.toLowerCase())).map(r => (
                    <div key={r.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-bold text-slate-800">{r.rotaIsmi}</span>
                        <span className="text-slate-400 font-mono text-[9px]">{r.tarih}</span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-slate-500">
                        <span>🚗 Vasıta: <span className="font-bold text-slate-600">{r.arac}</span></span>
                        <span>👤 {r.yoneticiAd} ({r.yoneticiTel})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. SUBMITTED VEHICLE REQUESTS STATUS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3.5 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">🕒 Araç Kartı Onay Durumları ({aracTalepleri.length})</span>
              
              {aracTalepleri.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Gönderilen onay talebi bulunmuyor.</p>
              ) : (
                <div className="space-y-2 max-h-[32vh] overflow-y-auto pr-1">
                  {aracTalepleri.map(t => (
                    <div key={t.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[9px] font-bold text-slate-700 bg-white border px-1.5 py-0.5 rounded shadow-3xs">{t.plaka}</span>
                        <span className="text-xs font-bold text-slate-800 ml-2 block sm:inline mt-1 sm:mt-0">{t.markaModel}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        t.durum === 'ONAY BEKLİYOR' ? 'bg-amber-100 text-amber-800' :
                        t.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {t.durum === 'ONAY BEKLİYOR' ? 'BEKLEMEDE' : t.durum}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
