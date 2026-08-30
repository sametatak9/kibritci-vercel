import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, CheckCircle, Clock, Send, Users, AlertCircle, FileText, ShoppingCart, 
  Truck, CreditCard, ChevronRight, PenTool, Check, CheckCircle2, UserCheck, Eye, Trash2,
  FileUp, ExternalLink, MessageSquare, AlertTriangle, Sparkles, Package, Tent, X
} from 'lucide-react';
import { SatinAlmaTalebi, Irsaliye, Fatura } from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';

interface OnayIslemleriScreenProps {
  satinAlmaTalepleri: SatinAlmaTalebi[];
  setSatinAlmaTalepleri: React.Dispatch<React.SetStateAction<SatinAlmaTalebi[]>>;
  irsaliyeler: Irsaliye[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar: Fatura[];
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  kullanicilar: any[];
  currentUser: any;
  signatureText: string;
  signatureStyle: string;
  addNotification?: (mesaj: string) => void;
}

export const OnayIslemleriScreen: React.FC<OnayIslemleriScreenProps> = ({
  satinAlmaTalepleri,
  setSatinAlmaTalepleri,
  irsaliyeler,
  setIrsaliyeler,
  faturalar,
  setFaturalar,
  kullanicilar,
  currentUser,
  signatureText,
  signatureStyle,
  addNotification
}) => {
  const [activeTab, setActiveTab] = useState<'satin_alma' | 'guvenlik_belgeleri' | 'kampci_belgeleri' | 'formen_belgeleri' | 'sofor_talepleri' | 'depocu_talepleri' | 'gecmis' | 'imzalar'>('satin_alma');
  const [selectedYoneticiEmail, setSelectedYoneticiEmail] = useState<string>('');
  const [stampText, setStampText] = useState<string>('🔵 ŞİRKET GENEL MÜDÜRÜ (E-İMZA)');
  const [customStamp, setCustomStamp] = useState<string>('');
  
  const [onaySearchKeyword, setOnaySearchKeyword] = useState("");
  const [deleteConfirmOnayId, setDeleteConfirmOnayId] = useState<string | null>(null);
  const [editingOnayStampId, setEditingOnayStampId] = useState<string | null>(null);
  const [tempStampValue, setTempStampValue] = useState("");

  const [personelGirisTalepleri, setPersonelGirisTalepleri] = useState<any[]>([]);
  const [personelCikisTalepleri, setPersonelCikisTalepleri] = useState<any[]>([]);
  const [personelGuncellemeTalepleri, setPersonelGuncellemeTalepleri] = useState<any[]>([]);
  const [formenSubTab, setFormenSubTab] = useState<'giris' | 'cikis' | 'guncelleme'>('giris');
  const [activePdfUploadId, setActivePdfUploadId] = useState<string | null>(null);
  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | null>(null);

  const [kampSayimlar, setKampSayimlar] = useState<any[]>([]);
  const [kampFaaliyetler, setKampFaaliyetler] = useState<any[]>([]);

  const [aracOnayTalepleri, setAracOnayTalepleri] = useState<any[]>([]);
  const [yolHarcamalari, setYolHarcamalari] = useState<any[]>([]);

  const [stokKartTalepleri, setStokKartTalepleri] = useState<any[]>([]);
  const [depoSayimTalepleri, setDepoSayimTalepleri] = useState<any[]>([]);

  // Load and subscribe to Depocu collections from Firestore
  useEffect(() => {
    const unsubStok = onSnapshot(collection(db, 'stokKartlar'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.durum === 'ONAY BEKLİYOR') {
          list.push({ id: doc.id, ...data });
        }
      });
      setStokKartTalepleri(list);
    });

    const unsubSayim = onSnapshot(collection(db, 'depoSayimlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.durum === 'ONAY BEKLİYOR') {
          list.push({ id: doc.id, ...data });
        }
      });
      setDepoSayimTalepleri(list);
    });

    return () => {
      unsubStok();
      unsubSayim();
    };
  }, []);

  // Load and subscribe to Chauffeur collections from Firestore
  useEffect(() => {
    const unsubArac = onSnapshot(collection(db, 'aracOnayTalepleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.talepTarihi || 0).getTime() - new Date(a.talepTarihi || 0).getTime());
      setAracOnayTalepleri(list);
    });

    const unsubHarcama = onSnapshot(collection(db, 'yolHarcamalari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime());
      setYolHarcamalari(list);
    });

    return () => {
      unsubArac();
      unsubHarcama();
    };
  }, []);

  const handleApproveAracTalebi = async (item: any) => {
    if (!window.confirm(`${item.plaka} plakalı araç kartını onaylıyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'aracOnayTalepleri', item.id), {
        durum: 'ONAYLANDI',
        onayleyenYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });

      const vehicleRef = doc(db, 'araclar', item.plaka.toUpperCase().replace(/\s+/g, ''));
      await setDoc(vehicleRef, {
        id: item.plaka.toUpperCase().replace(/\s+/g, ''),
        plaka: item.plaka.toUpperCase(),
        aracTipi: 'ARAC',
        markaModel: item.markaModel || 'Bilinmeyen Araç',
        mevcutKm: parseFloat(item.muayeneKm) || 0,
        kmBakimAraligi: parseFloat(item.yagBakimKmAraligi) || 10000,
        yagBakimKm: parseFloat(item.sonYagBakimKm) || 0,
        muayeneTarihi: item.muayeneTarihi || '',
        sigortaTarihi: item.yagBakimTarihi || '',
        durum: 'AKTIF',
        notlar: `Şöför tarafından girildi. Yağ Bakım Tarihi: ${item.yagBakimTarihi || ''}`
      });

      alert("🎉 Araç kartı onaylandı ve sisteme başarıyla işlendi!");
    } catch (err) {
      console.error(err);
      alert("Hata oluştu.");
    }
  };

  const handleRejectAracTalebi = async (item: any) => {
    if (!window.confirm("Bu araç talebini reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'aracOnayTalepleri', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert("Talep reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveYolHarcamasi = async (item: any) => {
    if (!window.confirm(`${item.tutar} TL tutarındaki yol harcamasını onaylıyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'yolHarcamalari', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });

      const kasaRef = doc(db, 'kasaHareketleri', `kh_yol_${item.id}`);
      await setDoc(kasaRef, {
        id: `kh_yol_${item.id}`,
        tarih: item.tarih || new Date().toISOString().split('T')[0],
        hareketTipi: 'ÇIKIŞ',
        tutar: parseFloat(item.tutar) || 0,
        aciklama: `Şöför Yol Harcaması (Ödeme: ${item.surucu || 'Bilinmeyen'}) - ${item.aciklama || ''}`,
        referansTipi: 'DİĞER',
        fisEvrakUrl: item.faturaFotoUrl || '',
        soforOdemesi: true,
        surucu: item.surucu || 'Bilinmeyen'
      });

      alert("🎉 Yol harcaması onaylandı ve Haftalık Kasa'ya işlendi (şöföre ödemeler listesine notlandı).");
    } catch (err) {
      console.error(err);
      alert("Hata oluştu.");
    }
  };

  const handleRejectYolHarcamasi = async (item: any) => {
    if (!window.confirm("Bu yol harcamasını reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'yolHarcamalari', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert("Harcama reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveStokKart = async (item: any) => {
    if (!window.confirm(`"${item.stokAdi}" (${item.stokKodu}) stok kartını onaylıyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'stokKartlar', item.id), {
        durum: 'AKTIF',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("🎉 Stok kartı onaylandı ve 'AKTIF' olarak kaydedildi!");
    } catch (err) {
      console.error(err);
      alert("Onaylama sırasında bir hata oluştu.");
    }
  };

  const handleRejectStokKart = async (item: any) => {
    if (!window.confirm(`"${item.stokAdi}" stok kartını reddetmek istiyor musunuz?`)) return;
    try {
      await deleteDoc(doc(db, 'stokKartlar', item.id));
      alert("🛑 Stok kartı talebi reddedildi ve sistemden silindi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveDepoSayim = async (item: any) => {
    if (!window.confirm(`Hafta ${item.haftaNo} depo sayımını onaylıyor musunuz? Bu işlem depodaki stok miktarlarını sayım miktarlarıyla güncelleyecektir.`)) return;
    try {
      // 1. Update sayim status to ONAYLANDI
      await updateDoc(doc(db, 'depoSayimlari', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });

      // 2. Update stock card quantities with count physical quantities
      if (item.kalemler && Array.isArray(item.kalemler)) {
        for (const k of item.kalemler) {
          if (k.stockId) {
            const stockRef = doc(db, 'stokKartlar', k.stockId);
            await updateDoc(stockRef, { miktar: k.physicalQty });
          }
        }
      }

      alert("🎉 Depo sayımı onaylandı ve tüm stoklar fiziksel miktarlarıyla güncellendi!");
    } catch (err) {
      console.error(err);
      alert("Onaylama işlemi sırasında bir hata oluştu.");
    }
  };

  const handleRejectDepoSayim = async (item: any) => {
    if (!window.confirm(`Hafta ${item.haftaNo} depo sayımını reddetmek istiyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, 'depoSayimlari', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString().split('T')[0]
      });
      alert("🛑 Depo sayımı reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  // Load and subscribe to personelGirisTalepleri from Firestore
  useEffect(() => {
    const coll = collection(db, 'personelGirisTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setPersonelGirisTalepleri(list);
    });
    return () => unsubscribe();
  }, []);

  // Load and subscribe to exit requests
  useEffect(() => {
    const coll = collection(db, 'personelCikisTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setPersonelCikisTalepleri(list);
    });
    return () => unsubscribe();
  }, []);

  // Load and subscribe to update requests
  useEffect(() => {
    const coll = collection(db, 'personelGuncellemeTalepleri');
    const unsubscribe = onSnapshot(coll, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
      setPersonelGuncellemeTalepleri(list);
    });
    return () => unsubscribe();
  }, []);

  // Load and subscribe to Kamp collections from Firestore
  useEffect(() => {
    const unsubSayim = onSnapshot(collection(db, 'kampDepoSayimlari'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setKampSayimlar(list);
    });

    const unsubFaaliyet = onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setKampFaaliyetler(list);
    });

    return () => {
      unsubSayim();
      unsubFaaliyet();
    };
  }, []);

  const handleApproveKampItem = async (type: 'sayim' | 'faaliyet', id: string) => {
    try {
      const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      const role = matchedUser?.yetki || 'YÖNETİCİ';
      
      const docRef = doc(db, type === 'sayim' ? 'kampDepoSayimlari' : 'kampGunlukFaaliyetleri', id);
      const updateData: any = {};
      
      if (role === 'İDARİ_İŞLER') {
        updateData.onaylayanIdariIsler = currentUser?.email || 'idari_isler@kibritci.com';
      } else if (role === 'MUHASEBE') {
        updateData.onaylayanMuhasebe = currentUser?.email || 'muhasebe@kibritci.com';
      } else {
        updateData.onaylayanIdariIsler = currentUser?.email || 'yonetici@kibritci.com';
        updateData.onaylayanMuhasebe = currentUser?.email || 'yonetici@kibritci.com';
      }
      
      const currentDoc = (type === 'sayim' ? kampSayimlar : kampFaaliyetler).find(x => x.id === id);
      if (currentDoc) {
        const hasIdari = updateData.onaylayanIdariIsler || currentDoc.onaylayanIdariIsler;
        const hasMuhasebe = updateData.onaylayanMuhasebe || currentDoc.onaylayanMuhasebe;
        if (hasIdari && hasMuhasebe) {
          updateData.durum = 'ONAYLANDI';
        }
      }
      
      await updateDoc(docRef, updateData);
      alert(`Kamp ${type === 'sayim' ? 'depo sayımı' : 'günlük faaliyeti'} başarıyla onaylandı.`);
    } catch (err) {
      console.error(err);
      alert("Onaylama işlemi sırasında bir hata oluştu.");
    }
  };

  const handleRejectKampItem = async (type: 'sayim' | 'faaliyet', id: string) => {
    if (!window.confirm("Bu kaydı reddetmek istediğinize emin misiniz?")) return;
    try {
      const docRef = doc(db, type === 'sayim' ? 'kampDepoSayimlari' : 'kampGunlukFaaliyetleri', id);
      await updateDoc(docRef, { durum: 'REDDEDİLDİ' });
      alert("Kayıt reddedildi.");
    } catch (err) {
      console.error(err);
      alert("Reddetme işlemi başarısız.");
    }
  };

  const handleApproveCikis = async (item: any) => {
    if (!window.confirm(`${item.personelIsim} için işten çıkış işlemini onaylamak istiyor musunuz?`)) return;
    try {
      // 1. Update request status to ONAYLANDI
      await updateDoc(doc(db, 'personelCikisTalepleri', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });

      // 2. Set actual personnel as inactive and save exit date
      await updateDoc(doc(db, 'personeller', item.personelId), {
        durum: false,
        istenCikisTarihi: item.cikisTarihi
      });

      alert(`🎉 ${item.personelIsim} için işten çıkış işlemi onaylandı ve personel inaktif edildi!`);
    } catch (err) {
      console.error(err);
      alert("İşlem onaylanırken bir hata oluştu.");
    }
  };

  const handleRejectCikis = async (item: any) => {
    if (!window.confirm("Bu işten çıkış talebini reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'personelCikisTalepleri', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert(`🛑 ${item.personelIsim} işten çıkış talebi reddedildi.`);
    } catch (err) {
      console.error(err);
      alert("İşlem gerçekleştirilemedi.");
    }
  };

  const handleApproveGuncelleme = async (item: any) => {
    if (!window.confirm("Bilgi güncelleme talebini onaylamak ve personeli güncellemek istiyor musunuz?")) return;
    try {
      // 1. Update request status to ONAYLANDI
      await updateDoc(doc(db, 'personelGuncellemeTalepleri', item.id), {
        durum: 'ONAYLANDI',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });

      // 2. Update actual personnel details
      await updateDoc(doc(db, 'personeller', item.personelId), {
        ad: item.yeniBilgiler.ad,
        soyad: item.yeniBilgiler.soyad,
        gorev: item.yeniBilgiler.gorev,
        telefon: item.yeniBilgiler.telefon,
        ibanNo: item.yeniBilgiler.ibanNo,
        bankaAdi: item.yeniBilgiler.bankaAdi
      });

      alert(`🎉 Personel bilgileri başarıyla güncellendi!`);
    } catch (err) {
      console.error(err);
      alert("İşlem onaylanırken bir hata oluştu.");
    }
  };

  const handleRejectGuncelleme = async (item: any) => {
    if (!window.confirm("Bu güncelleme talebini reddetmek istediğinize emin misiniz?")) return;
    try {
      await updateDoc(doc(db, 'personelGuncellemeTalepleri', item.id), {
        durum: 'REDDEDİLDİ',
        onaylayanYonetici: currentUser?.email || 'Sistem Yöneticisi',
        onayTarihi: new Date().toISOString()
      });
      alert(`🛑 Bilgi güncelleme talebi reddedildi.`);
    } catch (err) {
      console.error(err);
      alert("İşlem gerçekleştirilemedi.");
    }
  };

  const handleUndoApproval = (type: 'request' | 'waybill' | 'invoice', id: string) => {
    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === id || item.saId === id) {
          return {
            ...item,
            onayDurumu: 'ONAY BEKLİYOR',
            onaylayanYonetici: undefined,
            onayStamp: undefined,
            onayTarihi: undefined
          };
        }
        return item;
      }));
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === id || item.irsaliyeNo === id) {
          return {
            ...item,
            onayDurumu: 'ONAY BEKLİYOR',
            onaylayanYonetici: undefined,
            onayStamp: undefined,
            onayTarihi: undefined
          };
        }
        return item;
      }));
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === id || item.faturaNo === id) {
          return {
            ...item,
            durum: 'KONTROL BEKLEYOR',
            onaylayanYonetici: undefined,
            onayStamp: undefined,
            onayTarihi: undefined
          };
        }
        return item;
      }));
    }
    alert("Onay başarıyla geri alındı. Evrak Onay Bekleyenler havuzuna geri aktarıldı.");
  };

  const handleStartEditStamp = (id: string, currentStamp: string) => {
    setEditingOnayStampId(id);
    setTempStampValue(currentStamp);
  };

  const handleSaveUpdatedStamp = (type: 'request' | 'waybill' | 'invoice', id: string) => {
    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === id || item.saId === id) {
          return { ...item, onayStamp: tempStampValue };
        }
        return item;
      }));
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === id || item.irsaliyeNo === id) {
          return { ...item, onayStamp: tempStampValue };
        }
        return item;
      }));
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === id || item.faturaNo === id) {
          return { ...item, onayStamp: tempStampValue };
        }
        return item;
      }));
    }
    setEditingOnayStampId(null);
    alert("Onay kaşesi / e-imzası başarıyla güncellendi.");
  };

  const handleDeleteApprovedDoc = (type: 'request' | 'waybill' | 'invoice', id: string) => {
    if (deleteConfirmOnayId === id) {
      if (type === 'request') {
        setSatinAlmaTalepleri(prev => prev.filter(x => x.id !== id && x.saId !== id));
      } else if (type === 'waybill') {
        setIrsaliyeler(prev => prev.filter(x => x.id !== id && x.irsaliyeNo !== id));
      } else if (type === 'invoice') {
        setFaturalar(prev => prev.filter(x => x.id !== id && x.faturaNo !== id));
      }
      setDeleteConfirmOnayId(null);
      alert("Evrak sistemden kalıcı olarak silindi.");
    } else {
      setDeleteConfirmOnayId(id);
      setTimeout(() => {
        setDeleteConfirmOnayId(prev => prev === id ? null : prev);
      }, 4000);
    }
  };

  const handleGenerateSignedPdf = (type: 'request' | 'waybill' | 'invoice', doc: any) => {
    const todayStr = new Date().toLocaleDateString('tr-TR');
    let title = "";
    let code = "";
    let contentHtml = "";
    
    let signatureHtml = "";
    const activeText = doc.onaySignatureText || signatureText;
    const activeStyle = doc.onaySignatureStyle || signatureStyle;

    if (activeText) {
      if (activeStyle === 'cursive') {
        signatureHtml = `
          <div style="font-family: 'Georgia', serif; font-style: italic; color: #1e3a8a; font-size: 20px; border: 2px solid #1e3a8a; padding: 4px 10px; border-radius: 6px; display: inline-block; transform: rotate(-2deg); margin: 4px 0; font-weight: bold;">
            ${activeText}
          </div>
        `;
      } else if (activeStyle === 'monospaced') {
        signatureHtml = `
          <div style="font-family: 'Courier New', monospace; font-size: 11px; color: #b45309; border: 2px solid #b45309; border-style: dashed; padding: 4px 10px; border-radius: 6px; display: inline-block; transform: rotate(1deg); margin: 4px 0; text-align: center; background-color: #fffbeb;">
            <div style="font-weight: bold; letter-spacing: 1.5px;">${activeText.toUpperCase()}</div>
            <div style="font-size: 7px; opacity: 0.8; margin-top: 1px; font-weight: bold;">SECURE DİGİTAL ONAY</div>
          </div>
        `;
      } else if (activeStyle === 'seal') {
        signatureHtml = `
          <div style="width: 75px; height: 75px; border: 3px dashed #dc2626; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: rotate(6deg); color: #dcdc2626; font-weight: 900; font-family: sans-serif; text-align: center; margin: 4px auto; padding: 2px; background-color: #fef2f2; font-size: 8px;">
            <div style="font-size: 6px; letter-spacing: 0.5px; font-weight: bold; color:#dc2626;">KİBRİTÇİ</div>
            <div style="font-size: 9px; margin: 1px 0; max-width: 60px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-weight: bold; color:#dc2626;">${activeText.split(' ')[0]}</div>
            <div style="font-size: 5px; letter-spacing: 0.5px; font-weight: bold; color:#dc2626;">RESMİ ONAY</div>
          </div>
        `;
      }
    }
    
    // Determine info based on type
    if (type === 'request') {
      title = "SATIN ALMA SİPARİŞİ / TALEBİ";
      code = doc.saId || doc.id;
      contentHtml = `
        <div class="card bg-gray-50 p-4 rounded-xl border mb-6">
          <p class="mb-2"><strong>Cari Firma:</strong> ${doc.cariFirma}</p>
          <p class="mb-2"><strong>Ödeme Koşulu:</strong> ${doc.odemeKosulu || 'Şantiye Teslim / Vadeli'}</p>
          <p class="mb-2"><strong>Talep Tarihi:</strong> ${doc.tarih}</p>
          <p class="mb-2"><strong>Durum:</strong> ONAYLANDI & SEVK EDİLEBİLİR</p>
        </div>
        
        <h3 class="font-bold text-sm text-slate-800 mb-3">MALZEME DETAY KONTROL LİSTESİ</h3>
        <table class="w-full text-xs text-left border mb-6">
          <thead>
            <tr class="bg-indigo-950 text-white" style="background-color: #1e3a8a">
              <th class="p-2.5">Malzeme / Ürün Açıklaması</th>
              <th class="p-2.5 text-right">Miktar</th>
              <th class="p-2.5 text-right">Birim</th>
            </tr>
          </thead>
          <tbody>
            ${(doc.kalemler || []).map((item: any) => `
              <tr class="border-b">
                <td class="p-2.5 font-semibold text-slate-800">${item.urunAdi || item.malzemeAdi || 'İnşaat Malzemesi'}</td>
                <td class="p-2.5 text-right font-bold text-slate-900">${item.miktar}</td>
                <td class="p-2.5 text-right font-bold text-slate-600">${item.birim || 'Adet'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'waybill') {
      title = "MALZEME TESLİMAT İRSALİYESİ";
      code = doc.irsaliyeNo || doc.id;
      contentHtml = `
        <div class="card bg-gray-50 p-4 rounded-xl border mb-6">
          <p class="mb-2"><strong>Sevkiyat Yapan Firma / Şantiye:</strong> ${doc.firma}</p>
          <p class="mb-2"><strong>Sevk Tarihi:</strong> ${doc.tarih}</p>
          <p class="mb-2"><strong>İlişkili Satın Alma Sipariş Kodu:</strong> ${doc.saId || 'GENEL PLAN DIŞI'}</p>
          <p class="mb-2"><strong>Teslim Alan Personel Ünvanı:</strong> ŞANTİYE ŞEFİ</p>
        </div>
        
        <h3 class="font-bold text-sm text-slate-800 mb-3">TESLİM ALINAN MALZEMELER</h3>
        <table class="w-full text-xs text-left border mb-6">
          <thead>
            <tr class="bg-emerald-950 text-white" style="background-color: #064e3b">
              <th class="p-2.5">Teslim Alınan Kalem</th>
              <th class="p-2.5 text-right">Miktar</th>
              <th class="p-2.5 text-right">Birim</th>
            </tr>
          </thead>
          <tbody>
            ${(doc.kalemler || []).map((item: any) => `
              <tr class="border-b">
                <td class="p-2.5 font-semibold text-slate-800">${item.urunAdi || 'Malzeme'}</td>
                <td class="p-2.5 text-right font-bold text-slate-900">${item.miktar}</td>
                <td class="p-2.5 text-right font-bold text-slate-600">${item.birim || 'Adet'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'invoice') {
      title = "RESMİ CARİ ALIM FATURASI";
      code = doc.faturaNo || doc.id;
      contentHtml = `
        <div class="card bg-gray-50 p-4 rounded-xl border mb-6">
          <p class="mb-2"><strong>Mükellef Cari Firma:</strong> ${doc.cariUnvan}</p>
          <p class="mb-2"><strong>Fatura Tarihi:</strong> ${doc.tarih}</p>
          <p class="mb-2"><strong>Matrah Toplam Tutar:</strong> ₺${doc.toplamTutar?.toLocaleString() || '0'}</p>
          <p class="mb-2"><strong>KDV Tutarı (%20):</strong> ₺${doc.kdvTutar?.toLocaleString() || '0'}</p>
          <p class="mb-2"><strong>Genel Çekim Toplamı:</strong> ₺${doc.genelToplam?.toLocaleString() || '0'}</p>
        </div>
        
        <h3 class="font-bold text-sm text-slate-800 mb-3">FATURA KALEMLERİ LİSTESİ</h3>
        <table class="w-full text-xs text-left border mb-6">
          <thead>
            <tr class="bg-purple-950 text-white" style="background-color: #581c87">
              <th class="p-2.5">Hizmet / Malzeme Açıklaması</th>
              <th class="p-2.5 text-right">Birim Fiyat</th>
              <th class="p-2.5 text-right">Toplam (KDV Hariç)</th>
            </tr>
          </thead>
          <tbody>
            ${(doc.kalemler || []).map((item: any) => `
              <tr class="border-b">
                <td class="p-2.5 font-semibold text-slate-800">${item.urunAdi || item.hizmetadi || 'Hizmet Kalemi'}</td>
                <td class="p-2.5 text-right font-mono">₺${(item.fiyat || 0).toLocaleString()}</td>
                <td class="p-2.5 text-right font-bold text-purple-950 font-mono">₺${(item.tutar || (item.fiyat * item.miktar) || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>ONAYLI BELGE - ${code}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            background: #ffffff;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          .header-left {
            text-align: left;
            vertical-align: middle;
          }
          .header-right {
            text-align: right;
            vertical-align: middle;
          }
          .logo-text-title {
            color: #1e4e78;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 2px;
            margin: 0;
          }
          .logo-text-sub {
            color: #8b1e1e;
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 4px;
            margin: 2px 0 0 0;
          }
          .doc-title-badge {
            display: inline-block;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 700;
            font-style: normal;
            font-size: 11px;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          h1 {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: -0.5px;
            margin-top: 10px;
            margin-bottom: 5px;
            color: #0f172a;
          }
          .sub-header-line {
            height: 4px;
            background: linear-gradient(to right, #1e4e78 30%, #8b1e1e 100%);
            margin-bottom: 30px;
            border-radius: 2px;
          }
          .card {
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 25px;
          }
          .card p {
            margin: 6px 0;
            font-size: 13px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th {
            background-color: #0f172a;
            color: #ffffff;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 12px;
          }
          td {
            border-bottom: 1px solid #f1f5f9;
            padding: 12px;
          }
          /* Visual Stamp Stamp Design */
          .digital-stamp {
            display: inline-block;
            border: 3px double #1E4E78;
            padding: 16px;
            border-radius: 8px;
            color: #1E4E78;
            background-color: #f0f7ff;
            font-family: 'JetBrains Mono', monospace;
            text-align: center;
            max-width: 450px;
            margin-top: 40px;
            margin-bottom: 30px;
          }
          .stamp-header {
            font-weight: 800;
            font-size: 11px;
            letter-spacing: 1.5px;
            margin-bottom: 6px;
            text-transform: uppercase;
            border-bottom: 1px solid #1E4E78;
            padding-bottom: 4px;
          }
          .stamp-body {
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 8px;
            text-align: left;
          }
          .stamp-footer {
            font-size: 9px;
            font-style: italic;
            color: #0284c7;
            margin-top: 8px;
            border-top: 1px dashed #b9ddff;
            padding-top: 6px;
          }
          .signatures-grid {
            width: 100%;
            margin-top: 60px;
            border-top: 1px solid #f1f5f9;
            padding-top: 30px;
          }
          .sig-box {
            width: 33%;
            text-align: center;
            vertical-align: top;
            font-size: 11px;
            padding: 0 10px;
          }
          .sig-line {
            border-top: 1px dashed #cbd5e1;
            margin-top: 40px;
            margin-bottom: 8px;
          }
          .sig-title {
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
          }
          .footer-note {
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            margin-top: 100px;
            border-top: 1px solid #f1f5f9;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td class="header-left" style="border:none; padding:0;">
              <h2 class="logo-text-title">KİBRİTÇİ</h2>
              <h3 class="logo-text-sub">İNŞAAT</h3>
            </td>
            <td class="header-right" style="border:none; padding:0; text-align:right;">
              <div class="doc-title-badge">DİJİTAL GÜVENLİK HAVUZU RAPORU</div>
              <h1 style="margin:5px 0 0 0;">${title}</h1>
              <p style="margin:2px 0 0 0; font-size:12px; color:#475569;">Belge No: <strong>${code}</strong></p>
            </td>
          </tr>
        </table>
        
        <div class="sub-header-line"></div>
        
        ${contentHtml}

        <!-- Digital Approval Wax/Stamp -->
        <div class="digital-stamp" style="border: 2px uppercase dashed #d97706; padding: 15px; border-radius: 12px; background-color: #fffbeb; margin-bottom: 25px; display: flex; align-items: center; justify-content: space-between; gap: 20px;">
          <div class="stamp-info" style="flex:1;">
            <div class="stamp-header" style="font-weight: 900; font-size: 11px; color: #b45309; text-transform: uppercase; margin-bottom: 5px;">🔒 KİBRİTÇİ İNŞAAT - GÜVENLİ DİJİTAL ONAY RESMİ KAŞESİ</div>
            <div class="stamp-body" style="font-size: 11px; line-height: 1.5; color: #4b5563;">
              YÖNETİCİ ONAYI TAMAMLANDI<br>
              Kaşe / Mobil E-İmza: <span style="color:#d97706; font-weight: bold;">${doc.onayStamp || '🔵 KİBRİTÇİ İNŞAAT GRUBU YÖNETİM ONAYI'}</span><br>
              Onaylayan Yetkili Ünvanı: <span style="text-decoration: underline;">ŞİRKET GENEL MÜDÜRÜ / GÖREV ALANI</span><br>
              Onay Tarihi: ${doc.onayTarihi || todayStr}
            </div>
          </div>
          <div class="stamp-signature-drawing" style="shrink: 0;">
            ${signatureHtml}
          </div>
        </div>

        <!-- Role-only signature boxes as requested (no individual names printed) -->
        <table class="signatures-grid" style="border:none;">
          <tr>
            <td class="sig-box" style="border:none;">
              <div class="sig-line"></div>
              <div class="sig-title">TEKLİF / KABUL EDEN</div>
              <div style="font-size:10px; color:#64748b; margin-top:2px;">ŞANTİYE SORUMLUSU</div>
            </td>
            <td class="sig-box" style="border:none;">
              <div class="sig-line"></div>
              <div class="sig-title">KONTROL EDEN</div>
              <div style="font-size:10px; color:#64748b; margin-top:2px;">MÜHENDİS / TEKNİK OFİS Sorumlusu</div>
            </td>
            <td class="sig-box" style="border:none;">
              <div class="sig-line" style="border-top: 1px font-weight:bold solid #1e4e78;"></div>
              <div class="sig-title" style="color:#1e4e78; font-weight:800;">DİJİTAL ONAY VEREN</div>
              <div style="font-size:10px; color:#1e4e78; font-weight:bold; margin-top:2px;">ŞİRKET YÖNETİM KURULU / ORTAK</div>
            </td>
          </tr>
        </table>

        <div class="footer-note">
          Bu belge, Kibritçi ERP Dijital Onay Havuzu üzerinden oluşturulmuş resmi arşiv kopyasıdır.<br>
          © 2026 Kibritçi İnşaat Sanayi ve Ticaret A.Ş. Tüm hakları saklıdır.
        </div>
        
        <script>
          window.print();
        </script>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(htmlContent);
      printWin.document.close();
    } else {
      alert("Lütfen baskı pencerelerini açabilmek için tarayıcınızın pop-up engelleyicisini devre dışı bırakın.");
    }
  };

  // Custom states for view / detail modal in Approvals Screen
  const [activeDocForDetail, setActiveDocForDetail] = useState<{
    id: string;
    type: 'request' | 'waybill' | 'invoice';
    data: any;
  } | null>(null);

  // Filter managers
  const yoneticiler = kullanicilar.filter(u => u.yetki === 'YÖNETİCİ' || u.email === 'sametatak9@gmail.com' || u.email === 'santiye@kibritci.com');

  // Gelen onay istekleri filters:
  // Show documents where they are in pending states, and if they are marked for the current manager's email specifically,
  // or if no specific managers are target-assigned, default to showing in everyone's pool.
  const pendingRequests = satinAlmaTalepleri.filter(doc => {
    const isPending = doc.onayDurumu === 'ONAY BEKLİYOR';
    if (!isPending) return false;
    const targets = (doc as any).onayGonderilenYoneticiMailleri;
    if (targets && Array.isArray(targets) && targets.length > 0) {
      return targets.includes(currentUser?.email);
    }
    return true;
  });

  const pendingWaybills = irsaliyeler.filter(doc => {
    const isPending = doc.onayDurumu === 'ONAY BEKLİYOR' || doc.onayDurumu === 'FARK VAR — YÖNETİCİ BİLDİRİLDİ';
    if (!isPending) return false;
    const targets = (doc as any).onayGonderilenYoneticiMailleri;
    if (targets && Array.isArray(targets) && targets.length > 0) {
      return targets.includes(currentUser?.email);
    }
    return true;
  });

  const pendingInvoices = faturalar.filter(doc => {
    const isPending = doc.durum === 'KONTROL BEKLEYOR' || doc.durum === 'FARK VAR';
    if (!isPending) return false;
    const targets = (doc as any).onayGonderilenYoneticiMailleri;
    if (targets && Array.isArray(targets) && targets.length > 0) {
      return targets.includes(currentUser?.email);
    }
    return true;
  });

  const pendingGirisCount = personelGirisTalepleri.filter(p => p.durum === 'BEKLEMEDE' || p.durum === 'WP_GÖNDERİLDİ').length;
  const pendingCikisCount = personelCikisTalepleri.filter(p => p.durum === 'BEKLEMEDE').length;
  const pendingGuncellemeCount = personelGuncellemeTalepleri.filter(p => p.durum === 'BEKLEMEDE').length;
  const pendingPersonelCount = pendingGirisCount + pendingCikisCount + pendingGuncellemeCount;

  const matchedUserObj = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
  const currentUserRole = matchedUserObj?.yetki || 'YÖNETİCİ';

  const pendingKampSayimlar = kampSayimlar.filter(doc => {
    if (doc.durum === 'REDDEDİLDİ' || doc.durum === 'ONAYLANDI' || (doc.onaylayanIdariIsler && doc.onaylayanMuhasebe)) return false;
    if (currentUserRole === 'İDARİ_İŞLER' && !doc.onaylayanIdariIsler) return true;
    if (currentUserRole === 'MUHASEBE' && !doc.onaylayanMuhasebe) return true;
    if (currentUserRole === 'YÖNETİCİ' && (!doc.onaylayanIdariIsler || !doc.onaylayanMuhasebe)) return true;
    return false;
  });

  const pendingKampFaaliyetler = kampFaaliyetler.filter(doc => {
    if (doc.durum === 'REDDEDİLDİ' || doc.durum === 'ONAYLANDI' || (doc.onaylayanIdariIsler && doc.onaylayanMuhasebe)) return false;
    if (currentUserRole === 'İDARİ_İŞLER' && !doc.onaylayanIdariIsler) return true;
    if (currentUserRole === 'MUHASEBE' && !doc.onaylayanMuhasebe) return true;
    if (currentUserRole === 'YÖNETİCİ' && (!doc.onaylayanIdariIsler || !doc.onaylayanMuhasebe)) return true;
    return false;
  });

  const pendingAracTalepleri = aracOnayTalepleri.filter(x => x.durum === 'ONAY BEKLİYOR');
  const pendingYolHarcamalari = yolHarcamalari.filter(x => x.durum === 'ONAY BEKLİYOR');
  const pendingSoforCount = pendingAracTalepleri.length + pendingYolHarcamalari.length;

  const pendingStokCount = stokKartTalepleri.length;
  const pendingSayimCount = depoSayimTalepleri.length;
  const pendingDepocuCount = pendingStokCount + pendingSayimCount;

  const totalPendingCount = pendingRequests.length + pendingWaybills.length + pendingInvoices.length + pendingPersonelCount + pendingKampSayimlar.length + pendingKampFaaliyetler.length + pendingSoforCount + pendingDepocuCount;

  // Gecmis onaylar list (approved or updated documents)
  const approvedRequests = satinAlmaTalepleri.filter(doc => doc.onayDurumu.includes('TAMAMLANDI') || doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === 'DİJİTAL ONAYLANDI');
  const approvedWaybills = irsaliyeler.filter(doc => doc.onayDurumu.includes('TAMAMLANDI') || doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === 'DİJİTAL ONAYLANDI');
  const approvedInvoices = faturalar.filter(doc => doc.durum === 'ONAYLANDI' || doc.durum === 'DİJİTAL ONAYLANDI');

  const filteredApprovedRequests = approvedRequests.filter(item => {
    const kw = onaySearchKeyword.toLowerCase().trim();
    if (!kw) return true;
    return (
      (item.saId || '').toLowerCase().includes(kw) ||
      (item.cariFirma || '').toLowerCase().includes(kw) ||
      (item.onayStamp || '').toLowerCase().includes(kw)
    );
  });

  const filteredApprovedWaybills = approvedWaybills.filter(item => {
    const kw = onaySearchKeyword.toLowerCase().trim();
    if (!kw) return true;
    return (
      (item.irsaliyeNo || '').toLowerCase().includes(kw) ||
      (item.firma || '').toLowerCase().includes(kw) ||
      (item.onayStamp || '').toLowerCase().includes(kw)
    );
  });

  const filteredApprovedInvoices = approvedInvoices.filter(item => {
    const kw = onaySearchKeyword.toLowerCase().trim();
    if (!kw) return true;
    return (
      (item.faturaNo || '').toLowerCase().includes(kw) ||
      (item.cariUnvan || '').toLowerCase().includes(kw) ||
      (item.onayStamp || '').toLowerCase().includes(kw)
    );
  });

  const handleApproveDocument = (type: 'request' | 'waybill' | 'invoice', docId: string) => {
    const matchedUser = kullanicilar.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    const userRole = matchedUser?.yetki || "YÖNETİCİ";
    const uniqueHash = `KIB-SEC-${Math.abs(currentUser?.email?.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) || 1312)}-${Date.now().toString(36).toUpperCase()}`;
    const generatedStamp = `🔒 DİJİTAL ONAY VERİLDİ - Yetki Grubu: ${userRole} [Sertifika No: ${uniqueHash}]`;
    const todayStr = new Date().toISOString().split('T')[0];

    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === docId || item.saId === docId) {
          if (addNotification) {
            addNotification(`${item.saId} nolu satın alma talebi dijital olarak onaylandı.`);
          }
          return {
            ...item,
            onayDurumu: 'DİJİTAL ONAYLANDI', // transition to approved
            // Backed up approval stamp fields
            onaylayanYonetici: currentUser?.email || 'santiye@kibritci.com',
            onayStamp: generatedStamp,
            onayTarihi: todayStr,
            onaySignatureText: signatureText,
            onaySignatureStyle: signatureStyle
          } as any;
        }
        return item;
      }));
      alert("Satın Alma Talebi başarıyla onaylandı ve imzalandı.");
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === docId || item.irsaliyeId === docId || item.irsaliyeNo === docId) {
          if (addNotification) {
            addNotification(`${item.irsaliyeNo} nolu irsaliye teslimat belgesi dijital olarak onaylandı.`);
          }
          return {
            ...item,
            onayDurumu: 'DİJİTAL ONAYLANDI',
            onaylayanYonetici: currentUser?.email || 'santiye@kibritci.com',
            onayStamp: generatedStamp,
            onayTarihi: todayStr,
            onaySignatureText: signatureText,
            onaySignatureStyle: signatureStyle
          } as any;
        }
        return item;
      }));
      alert("İrsaliye Teslimat Belgesi başarıyla onaylandı ve imzalandı.");
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === docId || item.faturaNo === docId) {
          if (addNotification) {
            addNotification(`${item.faturaNo} nolu cari faturası onaylandı.`);
          }
          return {
            ...item,
            durum: 'DİJİTAL ONAYLANDI',
            onaylayanYonetici: currentUser?.email || 'santiye@kibritci.com',
            onayStamp: generatedStamp,
            onayTarihi: todayStr,
            onaySignatureText: signatureText,
            onaySignatureStyle: signatureStyle
          } as any;
        }
        return item;
      }));
      alert("Cari Faturası başarıyla muhasebeleştirilip onaylandı.");
    }
    setActiveDocForDetail(null);
  };

  const handleRejectDocument = (type: 'request' | 'waybill' | 'invoice', docId: string) => {
    if (!window.confirm("Bu belgeyi reddetmek istediğinize emin misiniz?")) return;

    if (type === 'request') {
      setSatinAlmaTalepleri(prev => prev.map(item => {
        if (item.id === docId || item.saId === docId) {
          if (addNotification) {
            addNotification(`${item.saId} nolu satın alma talebi reddedildi.`);
          }
          return { ...item, onayDurumu: 'REDDEDİLDİ' };
        }
        return item;
      }));
    } else if (type === 'waybill') {
      setIrsaliyeler(prev => prev.map(item => {
        if (item.id === docId || item.irsaliyeNo === docId) {
          if (addNotification) {
            addNotification(`${item.irsaliyeNo} nolu irsaliye teslimat belgesi reddedildi.`);
          }
          return { ...item, onayDurumu: 'FARK VAR — YÖNETİCİ BİLDİRİLDİ' };
        }
        return item;
      }));
    } else if (type === 'invoice') {
      setFaturalar(prev => prev.map(item => {
        if (item.id === docId || item.faturaNo === docId) {
          if (addNotification) {
            addNotification(`${item.faturaNo} nolu fatura reddedildi/fark bildirildi.`);
          }
          return { ...item, durum: 'FARK VAR' };
        }
        return item;
      }));
    }
    alert("Belge reddedildi.");
    setActiveDocForDetail(null);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 select-none text-slate-800">
      
      {/* Upper header */}
      <div className="bg-white p-5 px-6 border-b border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/10">
            <ShieldCheck size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-widest uppercase">✍️ ONAY MERKEZİ &amp; DİJİTAL İMZALAR</h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Güvenli ve Benzersiz Kullanıcı Dijital E-İmza Altyapısı</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 px-4 flex items-center space-x-4">
          <div className="text-right">
            <span className="text-[9px] text-slate-405 font-bold uppercase tracking-wider block">Aktif Kullanıcı</span>
            <strong className="text-[11px] text-slate-800 font-bold">{currentUser?.name || currentUser?.displayName || currentUser?.email || 'Bilinmeyen Kullanıcı'}</strong>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <span className="text-[9px] text-slate-405 font-bold uppercase tracking-wider block">Kullanıcı Rolü</span>
            <span className="bg-blue-100 text-blue-800 text-[9px] font-mono font-black py-0.5 px-2 rounded-lg uppercase tracking-widest block mt-0.5">
              {currentUser?.email === 'sametatak9@gmail.com' ? '👑 PROJE MÜDÜRÜ / YÖNETİCİ' : '👥 ŞANTİYE YETKİLİSİ'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left selector menu */}
        <div className="w-full lg:w-72 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col p-4 space-y-4 shrink-0 overflow-y-auto max-h-[45vh] lg:max-h-full">
          
          {/* Quick Counter Block */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5 shadow-sm hidden lg:block">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span className="text-slate-450 uppercase text-[9px] tracking-wider">Gelen Onay Bekleyenler</span>
              <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-mono font-bold">{totalPendingCount}</span>
            </div>
            
            <div className="space-y-2 text-[11px] text-slate-600 font-semibold">
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><ShoppingCart size={11} className="text-amber-500" /> <span>Satın Alma</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingRequests.length}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><Truck size={11} className="text-emerald-500" /> <span>İrsaliyeler</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingWaybills.length}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><CreditCard size={11} className="text-purple-500" /> <span>Faturalar</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingInvoices.length}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><UserCheck size={11} className="text-blue-500" /> <span>Saha Giriş Talebi</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingPersonelCount}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><Package size={11} className="text-blue-400" /> <span>Kamp Depo Sayımı</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingKampSayimlar.length}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><Tent size={11} className="text-amber-400" /> <span>Kamp Faaliyetleri</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingKampFaaliyetler.length}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><Truck size={11} className="text-sky-500" /> <span>Şöför Talepleri</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingSoforCount}</span>
              </div>
              <div className="flex justify-between p-1.5 bg-slate-50 rounded border border-slate-250/60">
                <span className="flex items-center space-x-1.5"><Package size={11} className="text-indigo-500" /> <span>Depocu Talepleri</span></span>
                <span className="font-mono text-slate-800 text-[10px] font-bold">{pendingDepocuCount}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1 bg-white p-2 rounded-2xl border border-slate-200">
            <span className="px-2.5 pt-1 text-[8px] font-bold text-slate-450 uppercase tracking-widest block mb-1.5">Görünüm Filtreleri</span>
            
            <button 
              onClick={() => setActiveTab('satin_alma')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'satin_alma' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><ShoppingCart size={13} className={activeTab === 'satin_alma' ? 'text-white' : 'text-amber-500'} /> <span>Satın Alma Talepleri</span></span>
              {pendingRequests.length > 0 && <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.2 ${activeTab === 'satin_alma' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>{pendingRequests.length}</span>}
            </button>

            <button 
              onClick={() => setActiveTab('guvenlik_belgeleri')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'guvenlik_belgeleri' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Truck size={13} className={activeTab === 'guvenlik_belgeleri' ? 'text-white' : 'text-emerald-500'} /> <span>Güvenlik Belgeleri</span></span>
              {(pendingWaybills.length + pendingInvoices.length) > 0 && <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.2 ${activeTab === 'guvenlik_belgeleri' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>{pendingWaybills.length + pendingInvoices.length}</span>}
            </button>

            <button 
              onClick={() => setActiveTab('kampci_belgeleri')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'kampci_belgeleri' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Package size={13} className={activeTab === 'kampci_belgeleri' ? 'text-white' : 'text-blue-500'} /> <span>Kampçı Belgeleri</span></span>
              {(pendingKampSayimlar.length + pendingKampFaaliyetler.length) > 0 && <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.2 ${activeTab === 'kampci_belgeleri' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'}`}>{pendingKampSayimlar.length + pendingKampFaaliyetler.length}</span>}
            </button>

            <button 
              onClick={() => setActiveTab('formen_belgeleri')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'formen_belgeleri' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><UserCheck size={13} className={activeTab === 'formen_belgeleri' ? 'text-white' : 'text-sky-500'} /> <span>Formen Belgeleri</span></span>
              {pendingPersonelCount > 0 && <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.2 ${activeTab === 'formen_belgeleri' ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'}`}>{pendingPersonelCount}</span>}
            </button>

            <button 
              onClick={() => setActiveTab('sofor_talepleri')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'sofor_talepleri' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Truck size={13} className={activeTab === 'sofor_talepleri' ? 'text-white' : 'text-sky-500'} /> <span>Şöför Talepleri</span></span>
              {pendingSoforCount > 0 && <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.2 ${activeTab === 'sofor_talepleri' ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'}`}>{pendingSoforCount}</span>}
            </button>

            <button 
              onClick={() => setActiveTab('depocu_talepleri')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'depocu_talepleri' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><Package size={13} className={activeTab === 'depocu_talepleri' ? 'text-white' : 'text-indigo-500'} /> <span>Depocu Talepleri</span></span>
              {pendingDepocuCount > 0 && <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.2 ${activeTab === 'depocu_talepleri' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'}`}>{pendingDepocuCount}</span>}
            </button>

            <button 
              onClick={() => setActiveTab('gecmis')}
              className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'gecmis' ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/15' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="flex items-center space-x-2"><CheckCircle size={13} /> <span>Geçmiş Onaylananlar</span></span>
            </button>
          </div>

        </div>

        {/* Right workspace listing */}
        <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-6">
          
          {activeTab === 'satin_alma' && (
            <div className="space-y-6">
              <div className="border bg-slate-950 p-4.5 rounded-2xl border-slate-800/80 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <span className="text-amber-500 font-bold block text-[11px] tracking-widest uppercase">🛒 SATIN ALMA TALEPLERİ</span>
                  <p className="text-slate-405 leading-relaxed text-[11px]">
                    Sisteme düşen satın alma taleplerini inceleyerek dijital imzanızla onaylayabilir veya reddedebilirsiniz.
                  </p>
                </div>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="bg-slate-950 rounded-3xl p-15 text-center flex flex-col items-center justify-center space-y-4 border border-slate-800/50">
                  <span className="text-4xl">🎉</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Onay bekleyen satın alma talebi bulunmuyor.</h3>
                    <p className="text-xs text-slate-500 mt-1">Sistem tamamen güncel ve mutabıktır.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Satın Alma Talepleri Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingRequests.map(doc => (
                      <div key={doc.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {doc.saId || 'KOD BELİRTİLMEDİ'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                          </div>
                          <p className="text-xs text-slate-200 font-bold mt-2.5">Tedarikçi Firma: {doc.cariFirma}</p>
                          <p className="text-[10.5px] text-slate-400 mt-1 italic">Talep Eden: {doc.talepEden}</p>
                          {doc.aciklama && <p className="text-[10.5px] text-slate-505 mt-1 truncate">Notlar: {doc.aciklama}</p>}
                          
                          <div className="mt-2.5 pt-2 border-t border-slate-800">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Talep Kalemleri</span>
                            <div className="space-y-1 text-[10px] font-mono text-slate-400">
                              {doc.kalemler?.slice(0, 3).map((k, idx) => (
                                <div key={k.id || idx} className="flex justify-between">
                                  <span className="truncate max-w-[150px]">{k.urunAdi}</span>
                                  <span className="text-white font-bold">{k.miktar} {k.birim}</span>
                                </div>
                              ))}
                              {doc.kalemler?.length > 3 && <div className="text-[9px] text-slate-500">+ {doc.kalemler.length - 3} kalem daha</div>}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2.5 border-t border-slate-900">
                          <button 
                            onClick={() => setActiveDocForDetail({ id: doc.id, type: 'request', data: doc })}
                            className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-705 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wiest transition flex items-center justify-center space-x-1"
                          >
                            <Eye size={11} />
                            <span>Detay İncele</span>
                          </button>
                          <button 
                            onClick={() => handleApproveDocument('request', doc.id)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wiest transition flex items-center justify-center space-x-1"
                          >
                            <Check size={11} />
                            <span>İmzala &amp; Onayla</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'guvenlik_belgeleri' && (
            <div className="space-y-6">
              <div className="border bg-slate-950 p-4.5 rounded-2xl border-slate-800/80 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <span className="text-emerald-500 font-bold block text-[11px] tracking-widest uppercase">🛡️ GÜVENLİK BELGELERİ (İRSALİYE &amp; FATURA)</span>
                  <p className="text-slate-405 leading-relaxed text-[11px]">
                    Kapıdaki güvenlik personelleri ve kantardan giriş yapılan sevkiyat irsaliyeleri ile muhasebe faturalarının kontrol ve onay paneli.
                  </p>
                </div>
              </div>

              {(pendingWaybills.length === 0 && pendingInvoices.length === 0) ? (
                <div className="bg-slate-950 rounded-3xl p-15 text-center flex flex-col items-center justify-center space-y-4 border border-slate-800/50">
                  <span className="text-4xl">🎉</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Onay bekleyen irsaliye veya fatura belgesi bulunmuyor.</h3>
                    <p className="text-xs text-slate-500 mt-1">Sistem tamamen güncel ve mutabıktır.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* İrsaliyeler Grid */}
                  {pendingWaybills.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-350 tracking-wider flex items-center space-x-2 uppercase">
                        <Truck size={14} className="text-emerald-500" />
                        <span>Gelen İrsaliye Teslimat Onayları ({pendingWaybills.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingWaybills.map(doc => (
                          <div key={doc.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  {doc.irsaliyeNo}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-200 font-bold mt-2.5">Gönderen Şantiyeci / Firma: {doc.firma}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">İlişkili Sipariş No: {doc.saId || 'Doğrudan Sevkiyat'}</p>
                              {doc.onayDurumu === 'FARK VAR — YÖNETİCİ BİLDİRİLDİ' && (
                                <p className="text-[10px] mt-1.5 p-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-bold uppercase">⚠️ Teslimat Miktar Farkı Var!</p>
                              )}

                              <div className="mt-2.5 pt-2 border-t border-slate-805">
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Gelen Malzemeler</span>
                                <div className="space-y-1 text-[10px] font-mono text-slate-400">
                                  {doc.kalemler?.slice(0, 3).map((k, idx) => (
                                    <div key={k.id || idx} className="flex justify-between">
                                      <span className="truncate max-w-[150px]">{k.urunAdi}</span>
                                      <span className="text-white font-bold">{k.miktar} {k.birim}</span>
                                    </div>
                                  ))}
                                  {doc.kalemler?.length > 3 && <div className="text-[9px] text-slate-500">+ {doc.kalemler.length - 3} kalem daha</div>}
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2.5 border-t border-slate-900">
                              <button 
                                onClick={() => setActiveDocForDetail({ id: doc.id, type: 'waybill', data: doc })}
                                className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-705 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wiest transition flex items-center justify-center space-x-1"
                              >
                                <Eye size={11} />
                                <span>Detay İncele</span>
                              </button>
                              <button 
                                onClick={() => handleApproveDocument('waybill', doc.id)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wiest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Onayla &amp; İmzala</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Faturalar Grid */}
                  {pendingInvoices.length > 0 && (
                    <div className="space-y-3 pt-4">
                      <h3 className="font-display font-black text-xs text-slate-350 tracking-wider flex items-center space-x-2 uppercase">
                        <CreditCard size={14} className="text-purple-500" />
                        <span>Fatura Girişleri &amp; Üçlü Mutabakat Onayları ({pendingInvoices.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingInvoices.map(doc => (
                          <div key={doc.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-purple-500/10 border border-purple-200/20 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  {doc.faturaNo}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-200 font-bold mt-2.5">Cari Unvan: {doc.cariUnvan}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Eşleşen İrsaliyeler: {doc.bagliIrsaliyeler?.join(', ') || 'Manuel Bağsız'}</p>
                              
                              <div className="mt-2.5 p-2 bg-purple-500/5 rounded border border-purple-500/10 flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold">Toplam Tutar:</span>
                                <span className="text-purple-400 font-black font-mono">₺{doc.genelToplam?.toLocaleString()}</span>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2.5 border-t border-slate-900">
                              <button 
                                onClick={() => setActiveDocForDetail({ id: doc.id, type: 'invoice', data: doc })}
                                className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-705 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wiest transition flex items-center justify-center space-x-1"
                              >
                                <Eye size={11} />
                                <span>Karşılaştır &amp; Gör</span>
                              </button>
                              <button 
                                onClick={() => handleApproveDocument('invoice', doc.id)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-wiest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Mutabakat Onayla</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'kampci_belgeleri' && (
            <div className="space-y-6">
              <div className="border bg-slate-950 p-4.5 rounded-2xl border-slate-800/80 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <span className="text-blue-450 font-bold block text-[11px] tracking-widest uppercase">🏕️ KAMPÇI BELGELERİ (AMİRLİK &amp; DEPO SAYIMI)</span>
                  <p className="text-slate-405 leading-relaxed text-[11px]">
                    Kamp sorumlusu tarafından gönderilen depo stok mutabakatları ile şantiye içi günlük kamp faaliyet raporları.
                  </p>
                </div>
              </div>

              {(pendingKampSayimlar.length === 0 && pendingKampFaaliyetler.length === 0) ? (
                <div className="bg-slate-950 rounded-3xl p-15 text-center flex flex-col items-center justify-center space-y-4 border border-slate-800/50">
                  <span className="text-4xl">🎉</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Onay bekleyen kamp amirliği veya depo belgesi bulunmuyor.</h3>
                    <p className="text-xs text-slate-500 mt-1">Sistem tamamen güncel ve mutabıktır.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Kamp Depo Sayımları Grid */}
                  {pendingKampSayimlar.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display font-black text-xs text-slate-350 tracking-wider flex items-center space-x-2 uppercase">
                        <Package size={14} className="text-blue-400" />
                        <span>Kamp Depo Sayım Onayları ({pendingKampSayimlar.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingKampSayimlar.map(doc => (
                          <div key={doc.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-blue-500/10 border border-blue-200/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  SAYIM #{doc.id.substring(0,6).toUpperCase()}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-200 font-bold mt-2.5">Kamp Alanı: {doc.kampAdi || 'Ana Kamp'}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Sayan Personel: {doc.sayanPersonel || 'Kamp Amiri'}</p>
                              
                              <div className="mt-2.5 p-2 bg-slate-900 rounded border border-slate-800 space-y-1.5">
                                <div className="text-[10px] font-bold text-slate-400 border-b border-slate-800 pb-1 flex justify-between">
                                  <span>Malzeme / Stok</span>
                                  <span>Miktar</span>
                                </div>
                                {doc.sayimlar && Object.entries(doc.sayimlar).map(([malzeme, miktar]: any) => (
                                  <div key={malzeme} className="text-[10px] font-mono text-slate-300 flex justify-between">
                                    <span>{malzeme}</span>
                                    <span className="font-bold text-white">{miktar} Adet</span>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-2 text-[10px] flex gap-2">
                                <span className={`px-2 py-0.5 rounded font-bold ${doc.onaylayanIdariIsler ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-900 text-slate-500'}`}>
                                  İdari İşler: {doc.onaylayanIdariIsler ? '✅ ONAYLADI' : '⏳ BEKLİYOR'}
                                </span>
                                <span className={`px-2 py-0.5 rounded font-bold ${doc.onaylayanMuhasebe ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-900 text-slate-500'}`}>
                                  Muhasebe: {doc.onaylayanMuhasebe ? '✅ ONAYLADI' : '⏳ BEKLİYOR'}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2.5 border-t border-slate-900">
                              <button 
                                onClick={() => handleRejectKampItem('sayim', doc.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <X size={11} />
                                <span>Reddet</span>
                              </button>
                              <button 
                                onClick={() => handleApproveKampItem('sayim', doc.id)}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Onayla ({currentUserRole === 'İDARİ_İŞLER' ? 'İdari' : currentUserRole === 'MUHASEBE' ? 'Muhasebe' : 'Tümü'})</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kamp Günlük Faaliyetleri Grid */}
                  {pendingKampFaaliyetler.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-slate-900 mt-4">
                      <h3 className="font-display font-black text-xs text-slate-350 tracking-wider flex items-center space-x-2 uppercase">
                        <Tent size={14} className="text-amber-400" />
                        <span>Kamp Günlük Faaliyet Onayları ({pendingKampFaaliyetler.length})</span>
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingKampFaaliyetler.map(doc => (
                          <div key={doc.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition space-y-3">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="font-mono bg-amber-500/10 border border-amber-200/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  FAALİYET #{doc.id.substring(0,6).toUpperCase()}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                              </div>
                              <p className="text-xs text-slate-200 font-bold mt-2.5">Kategori: {doc.kategori || 'Genel Rutin'}</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Açıklama: {doc.aciklama}</p>

                              {doc.photo && (
                                <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-800 aspect-video bg-slate-900 flex items-center justify-center relative group">
                                  <img 
                                    src={doc.photo} 
                                    alt="Faaliyet" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              )}

                              <div className="mt-2 text-[10px] flex gap-2">
                                <span className={`px-2 py-0.5 rounded font-bold ${doc.onaylayanIdariIsler ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-900 text-slate-500'}`}>
                                  İdari İşler: {doc.onaylayanIdariIsler ? '✅ ONAYLADI' : '⏳ BEKLİYOR'}
                                </span>
                                <span className={`px-2 py-0.5 rounded font-bold ${doc.onaylayanMuhasebe ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-900 text-slate-500'}`}>
                                  Muhasebe: {doc.onaylayanMuhasebe ? '✅ ONAYLADI' : '⏳ BEKLİYOR'}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2.5 border-t border-slate-900">
                              <button 
                                onClick={() => handleRejectKampItem('faaliyet', doc.id)}
                                className="flex-1 bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-300 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <X size={11} />
                                <span>Reddet</span>
                              </button>
                              <button 
                                onClick={() => handleApproveKampItem('faaliyet', doc.id)}
                                className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                              >
                                <Check size={11} />
                                <span>Onayla ({currentUserRole === 'İDARİ_İŞLER' ? 'İdari' : currentUserRole === 'MUHASEBE' ? 'Muhasebe' : 'Tümü'})</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'gecmis' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-950 p-4 border border-slate-805 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>✍️ Dijital İmza ile Onaylanmış Son Belgeler Arşivi</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Yönetici dijital imzası uygulanarak muhasebeye aktarılan arşiv.</p>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Arşivde ara (Belge no, unvan, kaşe...)"
                    value={onaySearchKeyword}
                    onChange={(e) => setOnaySearchKeyword(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-sans focus:outline-none focus:border-blue-500 w-full sm:w-64"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {/* Requests approved */}
                {filteredApprovedRequests.map(doc => {
                  const isEditing = editingOnayStampId === doc.id;
                  const isDeleteConfirm = deleteConfirmOnayId === doc.id;
                  return (
                    <div key={doc.id} className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          <span className="font-mono bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded">TALEP: {doc.saId}</span>
                          <span className="text-slate-500 font-mono text-[9px] font-semibold">{doc.tarih}</span>
                          <span className="bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[9.5px] font-bold px-2 py-0.2 rounded">Onaylandı</span>
                        </div>
                        <p className="text-slate-300 font-bold mt-1">Sipariş Cari Firma: {doc.cariFirma}</p>
                        
                        {isEditing ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <input
                              type="text"
                              value={tempStampValue}
                              onChange={(e) => setTempStampValue(e.target.value)}
                              className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs text-white max-w-sm"
                            />
                            <button
                              onClick={() => handleSaveUpdatedStamp('request', doc.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px]"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => setEditingOnayStampId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          doc.onayStamp && (
                            <p className="text-[10px] text-amber-500 font-mono font-bold mt-1 flex items-center gap-1">
                              <span>✒️ Eklenen Kaşe / E-İmza: {doc.onayStamp}</span>
                              <button
                                onClick={() => handleStartEditStamp(doc.id, doc.onayStamp || '')}
                                className="text-blue-400 hover:text-blue-300 font-sans hover:underline text-[9px] ml-2"
                              >
                                [Düzelt]
                              </button>
                            </p>
                          )
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
                        <button
                          onClick={() => handleGenerateSignedPdf('request', doc)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF Raporu Yap</span>
                        </button>
                        
                        <button
                          onClick={() => handleUndoApproval('request', doc.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition"
                          title="Onayı geri alıp bekleyenlere gönder"
                        >
                          Geri Al
                        </button>

                        <button
                          onClick={() => handleDeleteApprovedDoc('request', doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isDeleteConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-900/40 text-rose-500 hover:bg-rose-950/20'
                          }`}
                        >
                          {isDeleteConfirm ? 'Emin misiniz?' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Waybills approved */}
                {filteredApprovedWaybills.map(doc => {
                  const isEditing = editingOnayStampId === doc.id;
                  const isDeleteConfirm = deleteConfirmOnayId === doc.id;
                  return (
                    <div key={doc.id} className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          <span className="font-mono bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded">İRSALİYE: {doc.irsaliyeNo}</span>
                          <span className="text-slate-500 font-mono text-[9px] font-semibold">{doc.tarih}</span>
                          <span className="bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[9.5px] font-bold px-2 py-0.2 rounded">Onaylandı</span>
                        </div>
                        <p className="text-slate-300 font-bold mt-1">Şantiyeci Teslimat Noktası: {doc.firma}</p>
                        
                        {isEditing ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <input
                              type="text"
                              value={tempStampValue}
                              onChange={(e) => setTempStampValue(e.target.value)}
                              className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs text-white max-w-sm"
                            />
                            <button
                              onClick={() => handleSaveUpdatedStamp('waybill', doc.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px]"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => setEditingOnayStampId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          doc.onayStamp && (
                            <p className="text-[10px] text-amber-500 font-mono font-bold mt-1 flex items-center gap-1">
                              <span>✒️ Eklenen Kaşe / E-İmza: {doc.onayStamp}</span>
                              <button
                                onClick={() => handleStartEditStamp(doc.id, doc.onayStamp || '')}
                                className="text-blue-400 hover:text-blue-300 font-sans hover:underline text-[9px] ml-2"
                              >
                                [Düzelt]
                              </button>
                            </p>
                          )
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
                        <button
                          onClick={() => handleGenerateSignedPdf('waybill', doc)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF Raporu Yap</span>
                        </button>
                        
                        <button
                          onClick={() => handleUndoApproval('waybill', doc.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition"
                          title="Onayı geri alıp bekleyenlere gönder"
                        >
                          Geri Al
                        </button>

                        <button
                          onClick={() => handleDeleteApprovedDoc('waybill', doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isDeleteConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-900/40 text-rose-500 hover:bg-rose-950/20'
                          }`}
                        >
                          {isDeleteConfirm ? 'Emin misiniz?' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Invoices approved */}
                {filteredApprovedInvoices.map(doc => {
                  const isEditing = editingOnayStampId === doc.id;
                  const isDeleteConfirm = deleteConfirmOnayId === doc.id;
                  return (
                    <div key={doc.id} className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          <span className="font-mono bg-purple-500/10 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded">FATURA: {doc.faturaNo}</span>
                          <span className="text-slate-500 font-mono text-[9px] font-semibold">{doc.tarih}</span>
                          <span className="bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[9.5px] font-bold px-2 py-0.2 rounded">Yasa Uygun / Eşlendi</span>
                        </div>
                        <p className="text-slate-300 font-bold mt-1">Tutar: ₺{doc.genelToplam?.toLocaleString()} ({doc.cariUnvan})</p>
                        
                        {isEditing ? (
                          <div className="flex items-center space-x-2 mt-2">
                            <input
                              type="text"
                              value={tempStampValue}
                              onChange={(e) => setTempStampValue(e.target.value)}
                              className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs text-white max-w-sm"
                            />
                            <button
                              onClick={() => handleSaveUpdatedStamp('invoice', doc.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px]"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => setEditingOnayStampId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold px-2 py-1 rounded text-[10px]"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          doc.onayStamp && (
                            <p className="text-[10px] text-amber-500 font-mono font-bold mt-1 flex items-center gap-1">
                              <span>✒️ Eklenen Kaşe / E-İmza: {doc.onayStamp}</span>
                              <button
                                onClick={() => handleStartEditStamp(doc.id, doc.onayStamp || '')}
                                className="text-blue-400 hover:text-blue-300 font-sans hover:underline text-[9px] ml-2"
                              >
                                [Düzelt]
                              </button>
                            </p>
                          )
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
                        <button
                          onClick={() => handleGenerateSignedPdf('invoice', doc)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF Raporu Yap</span>
                        </button>
                        
                        <button
                          onClick={() => handleUndoApproval('invoice', doc.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition"
                          title="Onayı geri alıp bekleyenlere gönder"
                        >
                          Geri Al
                        </button>

                        <button
                          onClick={() => handleDeleteApprovedDoc('invoice', doc.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isDeleteConfirm ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-900/40 text-rose-500 hover:bg-rose-950/20'
                          }`}
                        >
                          {isDeleteConfirm ? 'Emin misiniz?' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredApprovedRequests.length === 0 && filteredApprovedWaybills.length === 0 && filteredApprovedInvoices.length === 0 && (
                  <div className="text-center p-10 text-slate-500 font-bold italic">Aranan kriterlere uygun onaylanmış belge kaydı bulunamadı.</div>
                )}

                {/* 📋 UNIFIED İŞLEM KAYITLARI AUDIT LOG */}
                <div className="mt-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs text-slate-350">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="font-display font-black text-xs text-white uppercase tracking-widest block">📋 Tesis Onaylı İşlem Kayıtları (Audit Log)</span>
                    <span className="bg-slate-800 text-slate-400 font-mono text-[9px] px-2 py-0.5 rounded">SİSTEM DENETİMİ</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Sistemde onaylanan evrakların mali ve idari işlem kayıtları (Audit Trail):
                  </p>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-800 text-left font-bold text-slate-500">
                          <th className="py-2 pr-4">Tarih</th>
                          <th className="py-2 pr-4">Belge Tipi</th>
                          <th className="py-2 pr-4">Belge Referansı</th>
                          <th className="py-2 pr-4">Cari / Sorumlu</th>
                          <th className="py-2 pr-4">Kaşe / İmza</th>
                          <th className="py-2 text-right">Tutar/Miktar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
                        {satinAlmaTalepleri.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === '2. ONAY TAMAMLANDI').map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-800/25 transition">
                            <td className="py-2 pr-4">{doc.tarih}</td>
                            <td className="py-2 pr-4 text-amber-400 font-bold">PO (Satın Alma)</td>
                            <td className="py-2 pr-4">{doc.saId}</td>
                            <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{doc.cariFirma}</td>
                            <td className="py-2 pr-4 text-emerald-400">{doc.onayStamp || 'Islak İmzalı / E-İmzalı'}</td>
                            <td className="py-2 text-right text-slate-400">{doc.kalemler?.length || 0} Kalem</td>
                          </tr>
                        ))}
                        {irsaliyeler.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu.includes('TAMAMLANDI')).map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-800/25 transition">
                            <td className="py-2 pr-4">{doc.tarih}</td>
                            <td className="py-2 pr-4 text-emerald-400 font-bold">İRSALİYE</td>
                            <td className="py-2 pr-4">{doc.irsaliyeNo}</td>
                            <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{doc.firma}</td>
                            <td className="py-2 pr-4 text-emerald-400">{doc.onayStamp || 'Müdür Onaylı'}</td>
                            <td className="py-2 text-right text-slate-400">{doc.kalemler?.length || 0} Kalem</td>
                          </tr>
                        ))}
                        {faturalar.filter(doc => doc.durum === 'ONAYLANDI' || doc.durum === 'UYUMLU').map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-800/25 transition">
                            <td className="py-2 pr-4">{doc.tarih}</td>
                            <td className="py-2 pr-4 text-purple-400 font-bold">FATURA</td>
                            <td className="py-2 pr-4">{doc.faturaNo}</td>
                            <td className="py-2 pr-4 text-slate-400 truncate max-w-[120px]">{doc.cariUnvan}</td>
                            <td className="py-2 pr-4 text-emerald-400">{doc.onayStamp || doc.eImzalar?.[0] || 'Kaşeli Onay'}</td>
                            <td className="py-2 text-right text-purple-300 font-bold">₺{doc.genelToplam?.toLocaleString()}</td>
                          </tr>
                        ))}
                        {satinAlmaTalepleri.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu === '2. ONAY TAMAMLANDI').length === 0 && 
                         irsaliyeler.filter(doc => doc.onayDurumu === 'ONAYLANDI' || doc.onayDurumu.includes('TAMAMLANDI')).length === 0 && 
                         faturalar.filter(doc => doc.durum === 'ONAYLANDI' || doc.durum === 'UYUMLU').length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-500 italic">Henüz onaylanmış herhangi bir işlem kaydı loglanmadı.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'imzalar' && (
            <div className="space-y-6">
              <div className="bg-slate-950 p-5 border border-slate-800 rounded-3xl space-y-4">
                <span className="font-display font-black text-xs text-white uppercase tracking-widest block border-b pb-2">✒️ Yetkili Dijital İmza &amp; Kaşe Seçenekleri</span>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Şirket yetkililerine atanan hazır e-imza kaşelerini aşağıdan görebilir, belge onaylarında basılmasını sağlayabilirsiniz:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-slate-900 p-4 border border-slate-805 rounded-xl space-y-2">
                    <span className="text-blue-400 font-bold block">🔵 YÖNETİM KURULU BAŞKANLIĞI (YKB)</span>
                    <p className="text-[11px] text-slate-500">Mevcut Kaşe: [KİBRİTÇİ İNŞAAT A.Ş. YÖNETİM KURULU ONAY MÜHRÜ]</p>
                  </div>
                  <div className="bg-slate-900 p-4 border border-slate-805 rounded-xl space-y-2">
                    <span className="text-amber-405 font-bold block">🔴 PROJELER GENEL KOORDİNATÖRLÜĞÜ (PGK)</span>
                    <p className="text-[11px] text-slate-500">Mevcut Kaşe: [ŞANTİYE VE PROJELER GENEL KOORDİNATÖRÜ MÜHRÜ]</p>
                  </div>
                  <div className="bg-slate-900 p-4 border border-slate-805 rounded-xl space-y-2">
                    <span className="text-emerald-400 font-bold block">🟢 GENEL MÜDÜRLÜK MAKAMI (GM)</span>
                    <p className="text-[11px] text-slate-500">Mevcut Kaşe: [KİBRİTÇİ İNŞAAT A.Ş. GENEL MÜDÜRLÜK KAŞESİ]</p>
                  </div>
                  <div className="bg-slate-900 p-4 border border-slate-805 rounded-xl space-y-2">
                    <span className="text-purple-400 font-bold block">🟣 MALİ İŞLER CONTRE DİREKTÖRLÜĞÜ (MİD)</span>
                    <p className="text-[11px] text-slate-500">Mevcut Kaşe: [MALİ İŞLER VE MUHASEBE GÜVENLİK CONTRESİ]</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'formen_belgeleri' && (
            <div className="space-y-6">
              
              {/* Header Info */}
              <div className="border bg-slate-950 p-4.5 rounded-2xl border-slate-800/80 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <span className="text-blue-400 font-bold block text-[11px] tracking-widest uppercase">👷 SAHA KAPISI PERSONEL GİRİŞ TAKİP SİSTEMİ</span>
                  <p className="text-slate-405 leading-relaxed text-[11px]">
                    Saha formenleri tarafından kapıdan gönderilen yeni personellerin bilgileri, işten çıkış talepleri ve bilgi güncelleme istekleri buraya düşer. Yetkililer talepleri onaylayarak personel veri havuzunu güncel tutabilir.
                  </p>
                </div>
              </div>

              {/* Subtabs for Personnel Management */}
              <div className="flex space-x-2 border-b border-slate-800 pb-px">
                <button
                  onClick={() => setFormenSubTab('giris')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition duration-150 cursor-pointer ${
                    formenSubTab === 'giris' ? 'border-[#2563EB] text-white font-black' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  🚪 İşe Giriş Talepleri ({personelGirisTalepleri.filter(p => p.durum === 'BEKLEMEDE' || p.durum === 'WP_GÖNDERİLDİ').length})
                </button>
                <button
                  onClick={() => setFormenSubTab('cikis')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition duration-150 cursor-pointer ${
                    formenSubTab === 'cikis' ? 'border-[#2563EB] text-white font-black' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  🛑 İşten Çıkış Talepleri ({personelCikisTalepleri.filter(p => p.durum === 'BEKLEMEDE').length})
                </button>
                <button
                  onClick={() => setFormenSubTab('guncelleme')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition duration-150 cursor-pointer ${
                    formenSubTab === 'guncelleme' ? 'border-[#2563EB] text-white font-black' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  📝 Bilgi Güncelleme ({personelGuncellemeTalepleri.filter(p => p.durum === 'BEKLEMEDE').length})
                </button>
              </div>

              {/* Request Cards Grid */}
              {formenSubTab === 'giris' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {personelGirisTalepleri.length === 0 ? (
                  <div className="bg-slate-950/40 border border-slate-850 rounded-3xl p-10 text-center col-span-2 text-slate-500 italic">
                    Şu an onay bekleyen veya kayıtlı herhangi bir saha giriş talebi bulunmuyor.
                  </div>
                ) : (
                  personelGirisTalepleri.map((item) => {
                    const isPending = item.durum === 'BEKLEMEDE' || item.durum === 'WP_GÖNDERİLDİ';
                    return (
                      <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-4.5 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                        
                        {/* Status Tag */}
                        <div className="flex justify-between items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                            item.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            item.durum === 'WP_GÖNDERİLDİ' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            item.durum === 'REDDEDİLDİ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {item.durum === 'ONAYLANDI' ? 'ONAYLANDI (GİRİŞ YAPILDI)' :
                             item.durum === 'WP_GÖNDERİLDİ' ? 'YÖNETİCİYE WP İLETİLDİ' :
                             item.durum === 'REDDEDİLDİ' ? 'REDDEDİLDİ (GİRİŞ ENGELLENDİ)' :
                             'BEKLEMEDE (KAPIDA)'}
                          </span>
                          <span className="text-[8px] font-mono text-slate-500">{new Date(item.tarih).toLocaleString('tr-TR')}</span>
                        </div>

                        {/* Person details */}
                        <div className="flex space-x-3">
                          {/* Thumbnail / Click to zoom */}
                          {item.kimlikFotoUrl ? (
                            <div className="w-20 h-20 bg-slate-905 rounded-2xl overflow-hidden border border-slate-800 shrink-0 relative group">
                              <img src={item.kimlikFotoUrl} alt="Kimlik Foto" className="w-full h-full object-cover" />
                              <a 
                                href={item.kimlikFotoUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[8px] font-bold text-white uppercase"
                              >
                                Kimliği Büyüt
                              </a>
                            </div>
                          ) : (
                            <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 shrink-0">
                              <span className="text-[8px] text-slate-500 text-center">Fotoğraf Yok</span>
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-slate-100 text-sm">{item.ad} {item.soyad}</h4>
                            <p className="text-[10px] text-slate-400 font-mono tracking-tight mt-1">💼 Görevi: {item.gorev}</p>
                            <p className="text-[9px] text-slate-500 mt-0.5">👷 Gönderen Formen: {item.gonderenFormen?.split('@')[0]}</p>
                          </div>
                        </div>

                        {/* Documents & Download link */}
                        {item.girisEvrakPdfUrl && (
                          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-bold">📄 İşe Giriş Bildirgesi:</span>
                            <a 
                              href={item.girisEvrakPdfUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-amber-400 hover:underline font-black uppercase text-[8px] flex items-center space-x-0.5"
                            >
                              <span>Belgeyi İndir</span>
                              <ExternalLink size={9} />
                            </a>
                          </div>
                        )}

                        {/* Action buttons based on status & role */}
                        <div className="border-t border-slate-900 pt-3 flex flex-wrap gap-2">
                          
                          {/* 1. WHATSAPP NOTIFICATION SEND (For Muhasebe, İdari İşler, Şantiye Şefi) */}
                          {isPending && (
                            <button
                              onClick={async () => {
                                const publicUrl = `${window.location.protocol}//${window.location.host}/?view_giris=${item.id}`;
                                const waMsg = `*KİBRİTÇİ İNŞAAT - PERSONEL ŞANTİYE GİRİŞ ONAY TALEBİ*%0A%0A*Personel Bilgileri:*%0A👤 Adı Soyadı: ${item.ad} ${item.soyad}%0A💼 Görevi/Branşı: ${item.gorev}%0A👷 Gönderen Formen: ${item.gonderenFormen || 'Bilinmeyen'}%0A📅 Tarih: ${new Date(item.tarih).toLocaleString('tr-TR')}%0A%0A🪪 *Kimlik Görseli ve Personel Kartı (Sorgula):*%0A${publicUrl}%0A%0ASaha Girişi için evrak onayı bekleniyor. Lütfen onay paneline girip bu personelin İşe Giriş Bildirgesini yükleyerek kaydı tamamlayın.`;
                                const waUrl = `https://wa.me/?text=${waMsg}`;
                                
                                // Set state to WP_GÖNDERİLDİ in database
                                try {
                                  await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
                                    durum: 'WP_GÖNDERİLDİ'
                                  });
                                  window.open(waUrl, '_blank');
                                } catch (e) {
                                  console.error(e);
                                  window.open(waUrl, '_blank');
                                }
                              }}
                              className="bg-blue-600 hover:bg-blue-750 active:scale-95 text-white font-extrabold text-[9px] py-1.5 px-3 rounded-xl flex items-center space-x-1.5 cursor-pointer border-b-2 border-blue-800 transition"
                            >
                              <MessageSquare size={11} />
                              <span>WhatsApp'tan Yöneticiye İlet</span>
                            </button>
                          )}

                          {/* 1.5 WHATSAPP FORWARD TO GATE/ENTRANCE (For Approved records, manager can notify the guard) */}
                          {item.durum === 'ONAYLANDI' && (
                            <button
                              onClick={() => {
                                const publicUrl = `${window.location.protocol}//${window.location.host}/?view_giris=${item.id}`;
                                const waMsg = `*KİBRİTÇİ İNŞAAT - GİRİŞ İZNİ ONAYLANDI*%0A%0A*Şantiye Giriş Kapısı / Güvenlik Nöbetçi Personeline:*%0A👤 *Personel:* ${item.ad} ${item.soyad}%0A💼 *Görevi:* ${item.gorev}%0A✅ *Bu personelin İşe Giriş Bildirgesi onaylanmıştır. Şantiyeye girişine izin verilmiştir.*%0A%0A🪪 *Kimlik Görseli ve Detaylar:*%0A${publicUrl}`;
                                const waUrl = `https://wa.me/?text=${waMsg}`;
                                window.open(waUrl, '_blank');
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[9px] py-1.5 px-3 rounded-xl flex items-center space-x-1.5 cursor-pointer border-b-2 border-emerald-800 transition"
                            >
                              <MessageSquare size={11} />
                              <span>WhatsApp ile Kapıya / Girişe Bildir</span>
                            </button>
                          )}

                          {/* 2. PDF UPLOAD PANEL (For Manager / Yönetici / Company Official) */}
                          {isPending && (
                            <div className="w-full space-y-2 mt-1.5 bg-slate-900/40 p-2.5 rounded-2xl border border-slate-850">
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">🔒 Yönetici Giriş Belgesi Onayı</span>
                              
                              {activePdfUploadId === item.id ? (
                                <div className="space-y-1.5">
                                  <label className="border border-dashed border-slate-700 bg-slate-950 p-2 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-900 transition text-[9px] text-slate-400">
                                    <FileUp size={14} className="text-amber-500 mb-0.5" />
                                    <span>{uploadedPdfBase64 ? '✓ Belge Yüklendi (Değiştir)' : 'PDF / Görsel Seç'}</span>
                                    <input 
                                      type="file"
                                      accept="application/pdf,image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const r = new FileReader();
                                          r.onload = async (ev) => {
                                            if (ev.target?.result) {
                                              const rawBase64 = ev.target.result as string;
                                              if (file.type.startsWith('image/')) {
                                                const compressed = await compressImage(rawBase64);
                                                setUploadedPdfBase64(compressed);
                                              } else {
                                                setUploadedPdfBase64(rawBase64);
                                              }
                                            }
                                          };
                                          r.readAsDataURL(file);
                                        }
                                      }}
                                      className="hidden"
                                    />
                                  </label>

                                  <div className="flex space-x-1.5 pt-0.5">
                                    <button
                                      onClick={async () => {
                                        if (!uploadedPdfBase64) {
                                          alert("Lütfen personelin İşe Giriş Bildirgesi belgesini (PDF/Görsel) yükleyin!");
                                          return;
                                        }
                                        try {
                                          await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
                                            durum: 'ONAYLANDI',
                                            girisEvrakPdfUrl: uploadedPdfBase64
                                          });
                                          setActivePdfUploadId(null);
                                          setUploadedPdfBase64(null);
                                          alert("🎉 Personel giriş talebi onaylandı! İşe Giriş Bildirgesi başarıyla sisteme yüklendi ve sahaya bildirildi.");
                                        } catch (err) {
                                          console.error(err);
                                          alert("Kaydedilemedi, veritabanı bağlantısını kontrol edin.");
                                        }
                                      }}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[8px] py-1.5 rounded-lg uppercase"
                                    >
                                      ✓ Onayla ve Gönder
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActivePdfUploadId(null);
                                        setUploadedPdfBase64(null);
                                      }}
                                      className="bg-slate-800 hover:bg-slate-750 text-slate-400 font-bold text-[8px] px-2 rounded-lg"
                                    >
                                      İptal
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 w-full">
                                  <button
                                    onClick={() => {
                                      setActivePdfUploadId(item.id);
                                      setUploadedPdfBase64(null);
                                    }}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-slate-950 font-black text-[9px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 border-b-2 border-emerald-800 transition cursor-pointer"
                                  >
                                    <Check size={11} />
                                    <span>ONAYLA VE GİRİŞ BİLDİRGESİ YÜKLE</span>
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (window.confirm("Bu giriş talebi kaydını reddetmek istediğinize emin misiniz?")) {
                                        try {
                                          await updateDoc(doc(db, 'personelGirisTalepleri', item.id), {
                                            durum: 'REDDEDİLDİ'
                                          });
                                          alert("Personel giriş talebi reddedildi.");
                                        } catch (err) {
                                          console.error(err);
                                        }
                                      }
                                    }}
                                    className="bg-rose-950 hover:bg-rose-900 border border-rose-850 text-rose-400 font-extrabold text-[9px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                  >
                                    <X size={11} />
                                    <span>REDDET</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Delete Request log option if approved or old */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm("Bu giriş talebi kaydını arşivden silmek istediğinize emin misiniz?")) {
                                try {
                                  await deleteDoc(doc(db, 'personelGirisTalepleri', item.id));
                                  alert("Kayıt başarıyla temizlendi.");
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                            className="text-slate-500 hover:text-rose-500 font-extrabold text-[8px] uppercase tracking-wider ml-auto self-center cursor-pointer"
                          >
                            Kaydı Temizle
                          </button>

                        </div>

                      </div>
                    );
                  })
                )}
              </div>
              )}

              {/* TAB 2: İŞTEN ÇIKIŞ TALEPLERİ */}
              {formenSubTab === 'cikis' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {personelCikisTalepleri.length === 0 ? (
                    <div className="bg-slate-950/40 border border-slate-850 rounded-3xl p-10 text-center col-span-2 text-slate-500 italic">
                      Şu an onay bekleyen veya kayıtlı herhangi bir işten çıkış talebi bulunmuyor.
                    </div>
                  ) : (
                    personelCikisTalepleri.map((item) => {
                      const isPending = item.durum === 'BEKLEMEDE';
                      return (
                        <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-4.5 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                          
                          {/* Status Tag */}
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                              item.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              item.durum === 'REDDEDİLDİ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {item.durum}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500">{new Date(item.tarih).toLocaleString('tr-TR')}</span>
                          </div>

                          {/* Person details */}
                          <div className="space-y-1.5 text-xs text-slate-300">
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[8px] block">PERSONEL ADI SOYADI</span>
                              <p className="font-extrabold text-white text-[13px]">{item.personelIsim}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500 font-bold block text-[8px]">GÖREVİ / BRANŞI</span>
                                <p className="font-medium text-slate-350">{item.personelGorev || 'Belirtilmedi'}</p>
                              </div>
                              <div>
                                <span className="text-slate-500 font-bold block text-[8px]">PLANLANAN ÇIKIŞ TARİHİ</span>
                                <p className="font-medium text-amber-450">{item.cikisTarihi ? new Date(item.cikisTarihi).toLocaleDateString('tr-TR') : 'Belirtilmedi'}</p>
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold block text-[8px]">GÖNDEREN FORMEN</span>
                              <p className="font-mono text-slate-400 text-[10px]">{item.gonderenFormen}</p>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold block text-[8px]">HEDEF ONAY GRUBU</span>
                              <p className="font-bold text-blue-400 text-[10px]">{item.hedefYoneticiRole || 'GENEL YÖNETİM'}</p>
                            </div>
                            <div className="bg-slate-900 border border-slate-850 p-2.5 rounded-xl">
                              <span className="text-rose-400 font-bold block text-[8px] mb-1">ÇIKIŞ SEBEBİ & GEREKÇE</span>
                              <p className="text-slate-300 italic text-[10.5px] leading-relaxed">"{item.cikisNedeni || 'Sebebi belirtilmemiş.'}"</p>
                            </div>
                          </div>

                          {/* Action Bar */}
                          <div className="flex flex-col space-y-2 pt-2 border-t border-slate-800/60">
                            {isPending ? (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleApproveCikis(item)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <Check size={11} />
                                  <span>ÇIKIŞI ONAYLA</span>
                                </button>
                                <button
                                  onClick={() => handleRejectCikis(item)}
                                  className="bg-rose-950 hover:bg-rose-900 border border-rose-850 text-rose-400 font-extrabold text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <X size={11} />
                                  <span>REDDET</span>
                                </button>
                              </div>
                            ) : (
                              <div className="w-full bg-slate-900/40 p-2 rounded-xl text-center text-[10px] text-slate-450">
                                Onaylayan Yetkili: <span className="font-bold text-slate-300">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                                {item.onayTarihi && <span className="block text-[8px] text-slate-500 mt-0.5">{new Date(item.onayTarihi).toLocaleString('tr-TR')}</span>}
                              </div>
                            )}

                            {/* Delete Request log option */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm("Bu çıkış talebini arşivden silmek istediğinize emin misiniz?")) {
                                  try {
                                    await deleteDoc(doc(db, 'personelCikisTalepleri', item.id));
                                    alert("Kayıt başarıyla temizlendi.");
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }
                              }}
                              className="text-slate-500 hover:text-rose-500 font-extrabold text-[8px] uppercase tracking-wider ml-auto self-center cursor-pointer"
                            >
                              Kaydı Temizle
                            </button>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: BİLGİ GÜNCELLEME TALEPLERİ */}
              {formenSubTab === 'guncelleme' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {personelGuncellemeTalepleri.length === 0 ? (
                    <div className="bg-slate-950/40 border border-slate-850 rounded-3xl p-10 text-center col-span-2 text-slate-500 italic">
                      Şu an onay bekleyen veya kayıtlı herhangi bir bilgi güncelleme talebi bulunmuyor.
                    </div>
                  ) : (
                    personelGuncellemeTalepleri.map((item) => {
                      const isPending = item.durum === 'BEKLEMEDE';
                      return (
                        <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-4.5 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                          
                          {/* Status Tag */}
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                              item.durum === 'ONAYLANDI' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              item.durum === 'REDDEDİLDİ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {item.durum}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500">{new Date(item.tarih).toLocaleString('tr-TR')}</span>
                          </div>

                          {/* Details comparing old vs new */}
                          <div className="space-y-3 text-xs text-slate-300">
                            <div>
                              <span className="text-slate-500 font-bold uppercase text-[8px] block">PERSONEL BİLGİ DEĞİŞİMİ</span>
                              <h6 className="font-extrabold text-white text-sm">{item.eskiBilgiler?.ad} {item.eskiBilgiler?.soyad}</h6>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                              {/* Old info column */}
                              <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-900/80 space-y-1">
                                <span className="text-slate-500 font-bold block text-[8px] uppercase">ESKİ BİLGİLER</span>
                                <div className="leading-snug">
                                  <p><span className="text-slate-400">Görev:</span> {item.eskiBilgiler?.gorev}</p>
                                  <p><span className="text-slate-400">Tel:</span> {item.eskiBilgiler?.telefon || '-'}</p>
                                  <p><span className="text-slate-400">Banka:</span> {item.eskiBilgiler?.bankaAdi || '-'}</p>
                                  <p className="font-mono text-[8px] overflow-hidden truncate"><span className="text-slate-400">IBAN:</span> {item.eskiBilgiler?.ibanNo || '-'}</p>
                                </div>
                              </div>
                              
                              {/* New info column */}
                              <div className="bg-blue-950/25 p-2 rounded-xl border border-blue-900/40 space-y-1">
                                <span className="text-blue-400 font-bold block text-[8px] uppercase">YENİ BİLGİLER</span>
                                <div className="leading-snug">
                                  <p><span className="text-slate-300">Görev:</span> <span className={item.eskiBilgiler?.gorev !== item.yeniBilgiler?.gorev ? "text-amber-400 font-bold" : ""}>{item.yeniBilgiler?.gorev}</span></p>
                                  <p><span className="text-slate-300">Tel:</span> <span className={item.eskiBilgiler?.telefon !== item.yeniBilgiler?.telefon ? "text-amber-400 font-bold" : ""}>{item.yeniBilgiler?.telefon || '-'}</span></p>
                                  <p><span className="text-slate-300">Banka:</span> <span className={item.eskiBilgiler?.bankaAdi !== item.yeniBilgiler?.bankaAdi ? "text-amber-400 font-bold" : ""}>{item.yeniBilgiler?.bankaAdi || '-'}</span></p>
                                  <p className="font-mono text-[8px] overflow-hidden truncate"><span className="text-slate-300">IBAN:</span> <span className={item.eskiBilgiler?.ibanNo !== item.yeniBilgiler?.ibanNo ? "text-amber-400 font-bold" : ""}>{item.yeniBilgiler?.ibanNo || '-'}</span></p>
                                </div>
                              </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-xl">
                              <span className="text-blue-400 font-bold block text-[8px] mb-0.5">DÜZELTME / GÜNCELLEME GEREKÇESİ</span>
                              <p className="text-slate-300 italic text-[10px] leading-relaxed">"{item.guncellemeNedeni || 'Neden belirtilmemiş.'}"</p>
                            </div>

                            <div className="text-[10px]">
                              <span className="text-slate-500 font-bold">GÖNDEREN FORMEN:</span> <span className="font-mono text-slate-450">{item.gonderenFormen}</span>
                            </div>
                          </div>

                          {/* Action Bar */}
                          <div className="flex flex-col space-y-2 pt-2 border-t border-slate-800/60">
                            {isPending ? (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleApproveGuncelleme(item)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <Check size={11} />
                                  <span>GÜNCELLEMEYİ ONAYLA</span>
                                </button>
                                <button
                                  onClick={() => handleRejectGuncelleme(item)}
                                  className="bg-rose-950 hover:bg-rose-900 border border-rose-850 text-rose-400 font-extrabold text-[10px] py-1.5 px-3 rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                                >
                                  <X size={11} />
                                  <span>REDDET</span>
                                </button>
                              </div>
                            ) : (
                              <div className="w-full bg-slate-900/40 p-2 rounded-xl text-center text-[10px] text-slate-450">
                                Onaylayan Yetkili: <span className="font-bold text-slate-300">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                                {item.onayTarihi && <span className="block text-[8px] text-slate-500 mt-0.5">{new Date(item.onayTarihi).toLocaleString('tr-TR')}</span>}
                              </div>
                            )}

                            {/* Delete Request log option */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm("Bu bilgi güncelleme talebini arşivden silmek istediğinize emin misiniz?")) {
                                  try {
                                    await deleteDoc(doc(db, 'personelGuncellemeTalepleri', item.id));
                                    alert("Kayıt başarıyla temizlendi.");
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }
                              }}
                              className="text-slate-500 hover:text-rose-500 font-extrabold text-[8px] uppercase tracking-wider ml-auto self-center cursor-pointer"
                            >
                              Kaydı Temizle
                            </button>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>
              )}

            </div>
          )}

          {activeTab === 'sofor_talepleri' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="border bg-slate-900 p-4.5 rounded-2xl border-slate-800 flex justify-between items-center text-xs text-white">
                <div className="space-y-1">
                  <span className="text-sky-400 font-bold block text-[11px] tracking-widest uppercase">🚛 ŞÖFÖR MOBİL PANELİ TALEPLERİ</span>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Şoförler tarafından eklenen yeni araç kartı talepleri ile seyahat yol harcamalarını (fiş/fatura) buradan inceleyip onaylayabilirsiniz. Onaylanan harcamalar otomatik olarak haftalık kasaya işlenir.
                  </p>
                </div>
              </div>

              {/* 1. ARAÇ KARTLARI TALEPLERİ */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <span>🚗 Araç Kartı & Bakım Talepleri ({pendingAracTalepleri.length})</span>
                </h3>
                {aracOnayTalepleri.length === 0 ? (
                  <div className="bg-white border rounded-2xl p-6 text-center text-slate-500 text-xs italic">
                    Kayıtlı araç onay talebi bulunmuyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aracOnayTalepleri.map((item) => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 space-y-3 shadow-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono bg-sky-50 text-sky-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-sky-100">
                              {item.plaka}
                            </span>
                            <h4 className="font-bold text-xs text-slate-800 mt-1">{item.markaModel}</h4>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.durum === 'ONAY BEKLİYOR' ? 'bg-amber-100 text-amber-800' :
                            item.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.durum}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono">
                          <div><span className="text-slate-450 font-sans">Muayene KM:</span> <span className="font-bold text-slate-800">{item.muayeneKm}</span></div>
                          <div><span className="text-slate-450 font-sans">Muayene Tar:</span> <span className="font-bold text-slate-800">{item.muayeneTarihi}</span></div>
                          <div><span className="text-slate-450 font-sans">Yag Bakım KM:</span> <span className="font-bold text-slate-800">{item.sonYagBakimKm}</span></div>
                          <div><span className="text-slate-450 font-sans">Yag Bakım Aralığı:</span> <span className="font-bold text-slate-800">{item.yagBakimKmAraligi} KM</span></div>
                          <div className="col-span-2"><span className="text-slate-450 font-sans">Yağ Bakım Tar:</span> <span className="font-bold text-slate-800">{item.yagBakimTarihi}</span></div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span>Talep Eden: {item.gonderen || 'Şöför'}</span>
                          <span>Tarih: {item.talepTarihi ? new Date(item.talepTarihi).toLocaleDateString('tr-TR') : ''}</span>
                        </div>

                        {item.durum === 'ONAY BEKLİYOR' && (
                          <div className="flex space-x-2 pt-2 border-t">
                            <button
                              onClick={() => handleApproveAracTalebi(item)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-xl text-[10px] transition cursor-pointer"
                            >
                              Onayla & Sisteme Ekle
                            </button>
                            <button
                              onClick={() => handleRejectAracTalebi(item)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-1.5 px-3 rounded-xl text-[10px] transition cursor-pointer"
                            >
                              Reddet
                            </button>
                          </div>
                        )}
                        {item.durum !== 'ONAY BEKLİYOR' && (
                          <div className="bg-slate-50 p-2 rounded-xl text-center text-[10px] text-slate-500 border border-dashed">
                            Onaylayan/Reddeden: <span className="font-bold">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. YOL HARCAMALARI TALEPLERİ */}
              <div className="space-y-3 pt-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <span>💳 Yol Harcaması (Fiş/Fatura) Onayları ({pendingYolHarcamalari.length})</span>
                </h3>
                {yolHarcamalari.length === 0 ? (
                  <div className="bg-white border rounded-2xl p-6 text-center text-slate-500 text-xs italic">
                    Kayıtlı yol harcaması talebi bulunmuyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {yolHarcamalari.map((item) => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 space-y-3 shadow-xs flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-xs text-slate-800">{item.surucu || 'Bilinmeyen Şöför'}</span>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Tarih: {item.tarih}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-rose-600 font-mono block">{item.tutar} TL</span>
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.2 rounded-full mt-1 ${
                                item.durum === 'ONAY BEKLİYOR' ? 'bg-amber-100 text-amber-800' :
                                item.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {item.durum}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                            <span className="text-[8px] font-bold text-slate-400 block uppercase">Açıklama:</span>
                            <p className="text-[10px] text-slate-700">{item.aciklama}</p>
                          </div>

                          {item.faturaFotoUrl && (
                            <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50 flex flex-col items-center justify-center p-2">
                              <span className="text-[8px] font-bold text-slate-450 uppercase tracking-wider block mb-1">📷 Harcama Belgesi (Fiş/Fatura)</span>
                              <img
                                src={item.faturaFotoUrl}
                                alt="Fis Görseli"
                                className="max-h-40 max-w-full rounded object-contain"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 mt-3">
                          {item.durum === 'ONAY BEKLİYOR' && (
                            <div className="flex space-x-2 pt-2 border-t">
                              <button
                                onClick={() => handleApproveYolHarcamasi(item)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-xl text-[10px] transition cursor-pointer"
                              >
                                Onayla & Kasaya Aktar
                              </button>
                              <button
                                onClick={() => handleRejectYolHarcamasi(item)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-1.5 px-3 rounded-xl text-[10px] transition cursor-pointer"
                              >
                                Reddet
                              </button>
                            </div>
                          )}
                          {item.durum !== 'ONAY BEKLİYOR' && (
                            <div className="bg-slate-50 p-2 rounded-xl text-center text-[10px] text-slate-500 border border-dashed">
                              Onaylayan/Reddeden: <span className="font-bold">{item.onaylayanYonetici || 'Bilinmiyor'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'depocu_talepleri' && (
            <div className="space-y-6">
              <div className="border bg-slate-900 p-4.5 rounded-2xl border-slate-800 flex justify-between items-center text-xs text-white">
                <div className="space-y-1">
                  <span className="text-indigo-400 font-bold block text-[11px] tracking-widest uppercase">📦 DEPOCU TALEPLERİ (STOK KARTLARI &amp; HAFTALIK SAYIMLAR)</span>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Depo sorumlusundan gelen onay bekleyen yeni stok kartı açma taleplerini ve haftalık depo fiziksel sayım tutanaklarını buradan inceleyip onaylayabilirsiniz.
                  </p>
                </div>
              </div>

              {/* A. Pending Stock Cards */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <Package size={14} className="text-indigo-500" />
                  <span>Yeni Stok Kartı Açma Talepleri ({stokKartTalepleri.length})</span>
                </h3>

                {stokKartTalepleri.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-white border p-4 rounded-xl">Onay bekleyen yeni stok kartı talebi bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stokKartTalepleri.map(item => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-300 transition space-y-3 shadow-xs">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-start">
                            <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {item.stokKodu}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{item.tarih}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-xs mt-1">{item.stokAdi}</h4>
                          <div className="grid grid-cols-2 gap-2 text-[10.5px] text-slate-650">
                            <div>Kategori: <strong className="text-slate-800 font-semibold">{item.kategori}</strong></div>
                            <div>Ölçü Birimi: <strong className="text-slate-800 font-semibold">{item.birim}</strong></div>
                            <div>Giriş Miktar: <strong className="text-blue-600 font-black">{item.miktar} {item.birim}</strong></div>
                            <div>Kritik Limit: <strong className="text-rose-650 font-bold">{item.kritikSeviye || 5}</strong></div>
                          </div>
                          {item.aciklama && <p className="text-[10px] text-slate-500 italic mt-1">Not: {item.aciklama}</p>}
                        </div>

                        <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                          <button 
                            onClick={() => handleRejectStokKart(item)}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>Reddet / Sil</span>
                          </button>
                          <button 
                            onClick={() => handleApproveStokKart(item)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1 border-b-2 border-emerald-800"
                          >
                            <Check size={11} />
                            <span>Kartı Onayla</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* B. Pending Sayım Counts */}
              <div className="space-y-3 pt-6 border-t">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-2">
                  <FileText size={14} className="text-indigo-500" />
                  <span>Depo Fiziksel Sayım Tutanakları ({depoSayimTalepleri.length})</span>
                </h3>

                {depoSayimTalepleri.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-white border p-4 rounded-xl">Onay bekleyen depo fiziksel sayım belgesi bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {depoSayimTalepleri.map(item => (
                      <div key={item.id} className="bg-white border rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-300 transition space-y-3 shadow-xs">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              Hafta {item.haftaNo || '1'} Sayımı
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{item.tarih}</span>
                          </div>
                          <p className="text-[10.5px] text-slate-650 font-medium">Sayım Yapan: <strong className="text-slate-800">{item.sayimYapan}</strong></p>
                          {item.notlar && <p className="text-[10.5px] bg-slate-50 p-2 rounded-xl text-slate-600 border italic">" {item.notlar} "</p>}
                          
                          <div className="pt-2">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Tespit Edilen Farklar</span>
                            <div className="space-y-1 text-[10px] font-mono text-slate-650 max-h-32 overflow-y-auto pr-1">
                              {item.kalemler?.map((k: any, idx: number) => (
                                <div key={idx} className="flex justify-between p-1 bg-slate-50 border rounded mt-0.5">
                                  <span>{k.urunAdi} ({k.kod})</span>
                                  <span className="font-bold flex items-center space-x-1">
                                    <span className="text-slate-400">{k.systemQty} ➔ {k.physicalQty}</span>
                                    <span className={k.diff < 0 ? 'text-rose-650' : k.diff > 0 ? 'text-emerald-600' : 'text-slate-500'}>
                                      ({k.diff > 0 ? `+${k.diff}` : k.diff} {k.birim})
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2.5 border-t border-slate-105">
                          <button 
                            onClick={() => handleRejectDepoSayim(item)}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                          >
                            <X size={11} />
                            <span>Sayımı İptal Et / Reddet</span>
                          </button>
                          <button 
                            onClick={() => handleApproveDepoSayim(item)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1 border-b-2 border-emerald-800"
                          >
                            <Check size={11} />
                            <span>Sayımı Onayla &amp; Güncelle</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Detail Modal */}
      {activeDocForDetail && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-[600px] overflow-hidden shadow-2xl animate-in scale-in duration-200">
            
            <div className="bg-slate-950 p-4 flex justify-between items-center border-b border-slate-800">
              <h4 className="font-display font-medium text-xs text-white uppercase tracking-wider">📋 Detaylı Belge İncelemesi</h4>
              <button onClick={() => setActiveDocForDetail(null)} className="text-slate-450 hover:text-white font-bold cursor-pointer">✖ Kapat</button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-300 max-h-[70vh] overflow-y-auto">
              {activeDocForDetail.type === 'request' && (
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-450">Talep Kodu / Tarih:</span>
                    <span className="font-bold text-white font-mono">{activeDocForDetail.data.saId} ({activeDocForDetail.data.tarih})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-450">Cari Firma:</span>
                    <span className="font-bold text-white">{activeDocForDetail.data.cariFirma}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-450">Talep Eden Sorumlu:</span>
                    <span className="font-bold text-white">{activeDocForDetail.data.talepEden}</span>
                  </div>
                  {activeDocForDetail.data.aciklama && (
                    <div className="p-3 bg-slate-950/60 rounded border border-slate-850">
                      <span className="text-[9px] text-slate-500 font-bold block uppercase mb-1">Açıklama / Şantiye Notu:</span>
                      <p>{activeDocForDetail.data.aciklama}</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Malzeme Listesi</span>
                    <table className="w-full text-left font-mono text-[10px] border border-slate-800 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400">
                          <th className="p-2">Urun Adı</th>
                          <th className="p-2 text-right">Miktar / Birim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDocForDetail.data.kalemler?.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-850">
                            <td className="p-2 text-slate-200">{item.urunAdi}</td>
                            <td className="p-2 text-right text-amber-400 font-bold">{item.miktar} {item.birim}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activeDocForDetail.data.imzaliEvrakUrl && (
                    <div className="pt-2">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold mb-1">📸 Yüklenen Evrak</span>
                      <img src={activeDocForDetail.data.imzaliEvrakUrl} alt="Signed Doc" className="max-h-36 rounded border object-contain mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {activeDocForDetail.type === 'waybill' && (
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-450">İrsaliye Kodu / Tarih:</span>
                    <span className="font-bold text-white font-mono">{activeDocForDetail.data.irsaliyeNo} ({activeDocForDetail.data.tarih})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-450">Sevkiyat Yapan Firma / Şantiye:</span>
                    <span className="font-bold text-white">{activeDocForDetail.data.firma}</span>
                  </div>
                  {activeDocForDetail.data.saId && (
                    <div className="flex justify-between">
                      <span className="text-slate-450 font-bold text-emerald-450">İlişkili Satın Alma Sipariş Kodu:</span>
                      <span className="font-black text-amber-400 font-mono">{activeDocForDetail.data.saId}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Teslim Alınan Malzemeler</span>
                    <table className="w-full text-left font-mono text-[10px] border border-slate-800 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400">
                          <th className="p-2">Urun Adı</th>
                          <th className="p-2 text-right">Teslim Miktarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDocForDetail.data.kalemler?.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-850">
                            <td className="p-2 text-slate-200">{item.urunAdi}</td>
                            <td className="p-2 text-right text-emerald-400 font-bold">{item.miktar} {item.birim}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activeDocForDetail.data.karsilastirmaRaporu && (
                    <div className="p-3 bg-indigo-950/40 border border-indigo-900 rounded-xl">
                      <span className="font-bold text-[9px] text-blue-300 block mb-1 uppercase tracking-wider">📋 İrsaliye Analiz &amp; Sapma Raporu</span>
                      <p className="font-mono text-[9px] text-slate-350 whitespace-pre-wrap leading-relaxed">{activeDocForDetail.data.karsilastirmaRaporu}</p>
                    </div>
                  )}

                  {activeDocForDetail.data.fisEvrakUrl && (
                    <div className="pt-2">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold mb-1">📸 Yüklenen Belge Resmî Fotoğrafı</span>
                      <img src={activeDocForDetail.data.fisEvrakUrl} alt="Waybill Doc" className="max-h-36 rounded border object-contain mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {activeDocForDetail.type === 'invoice' && (
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-450">Fatura Kodu / Tarih:</span>
                    <span className="font-bold text-white font-mono">{activeDocForDetail.data.faturaNo} ({activeDocForDetail.data.tarih})</span>
                  </div>
                  <div className="flex justify-between font-bold text-purple-400">
                    <span className="text-slate-400">Mükellef Cari Kart Unvanı:</span>
                    <span>{activeDocForDetail.data.cariUnvan}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-850 text-[10px]">
                    <span className="text-slate-505 font-bold">Matrah Tutarı:</span>
                    <span className="font-mono text-purple-300">₺{activeDocForDetail.data.toplamTutar?.toLocaleString()}</span>
                    <span className="text-slate-505 font-bold">KDV (%20):</span>
                    <span className="font-mono text-purple-300">₺{activeDocForDetail.data.kdvTutar?.toLocaleString()}</span>
                  </div>

                  <div className="pt-2">
                    <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Fatura Kalemleri &amp; Birim Fiyatlar</span>
                    <table className="w-full text-left font-mono text-[10px] border border-slate-800 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400">
                          <th className="p-2">Hizmet/Malzeme</th>
                          <th className="p-2 text-center">Fiyat (KDV Hariç)</th>
                          <th className="p-2 text-right">Toplam Tutarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDocForDetail.data.kalemler?.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-850">
                            <td className="p-2 text-slate-200">{item.urunAdi} ({item.miktar} {item.birim})</td>
                            <td className="p-2 text-center text-slate-400">₺{item.birimFiyat?.toLocaleString()}</td>
                            <td className="p-2 text-right text-purple-400 font-bold">₺{item.toplam?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {activeDocForDetail.data.rapor && (
                    <div className="p-3 bg-purple-950/40 border border-purple-900 rounded-xl">
                      <span className="font-bold text-[9px] text-purple-300 block mb-1 uppercase tracking-wider">📋 Üçlü Mutabakat Analiz &amp; Sapma Raporu</span>
                      <p className="font-mono text-[9px] text-slate-350 whitespace-pre-wrap leading-relaxed">{activeDocForDetail.data.rapor}</p>
                    </div>
                  )}

                  {activeDocForDetail.data.imzaliEvrakUrl && (
                    <div className="pt-2">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold mb-1">📸 Yüklenen Fatura Ek Evrakı</span>
                      <img src={activeDocForDetail.data.imzaliEvrakUrl} alt="Invoice Doc" className="max-h-36 rounded border object-contain mx-auto" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex gap-2.5 justify-end">
              <button 
                onClick={() => handleRejectDocument(activeDocForDetail.type, activeDocForDetail.id)}
                className="bg-rose-900/40 border border-rose-800/80 text-rose-300 py-1.5 px-4 rounded-xl text-xs font-bold hover:bg-rose-900/60 cursor-pointer transition"
              >
                Onaylama Kabul Etme (Reddet)
              </button>
              <button 
                onClick={() => handleApproveDocument(activeDocForDetail.type, activeDocForDetail.id)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/10 cursor-pointer transition font-black"
              >
                Seçilen Kaşe ile Evrakı Onayla
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
