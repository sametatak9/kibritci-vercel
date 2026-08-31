import React, { useState, useEffect } from 'react';
import { 
  Hammer, 
  AlertTriangle, 
  KeySquare, 
  Camera, 
  Trash2, 
  LogOut, 
  MapPin, 
  Building2, 
  CheckCircle2, 
  Plus, 
  Edit2, 
  X, 
  FileText, 
  DollarSign, 
  AlertCircle,
  Eye
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';
import { compressImage } from '../lib/imageCompress';
import { PARSEL_LIST, blokListForParsel } from '../data/parselBlokMap';
import { KibritciLogo } from './KibritciLogo';

interface ImalatTerminaliScreenProps {
  cariKartlar: any[];
  personeller: any[];
  sahaFaaliyetleri: any[];
  setSahaFaaliyetleri: any;
  saveSahaFaaliyetNow: any;
  removeSahaFaaliyetNow: any;
  hazirTutanaklar: any[];
  setHazirTutanaklar: any;
  currentUser?: any;
  onSignOut?: () => void;
  isStandalone?: boolean;
}

export const ImalatTerminaliScreen: React.FC<ImalatTerminaliScreenProps> = ({
  cariKartlar,
  personeller,
  sahaFaaliyetleri,
  setSahaFaaliyetleri,
  saveSahaFaaliyetNow,
  removeSahaFaaliyetNow,
  hazirTutanaklar,
  setHazirTutanaklar,
  currentUser,
  onSignOut,
  isStandalone = false
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'imalat' | 'hasar' | 'daire_teslim'>('imalat');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subcontractors from Cari Kartlar
  const taseronlar = cariKartlar.filter(c => c.kartTipi === 'TASERON');

  // helper function to show status messages
  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // =========================================================================
  // 1. İMALAT GİRİŞİ STATE & HANDLERS
  // =========================================================================
  const [imalatTarih, setImalatTarih] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [imalatParsel, setImalatParsel] = useState<string>(PARSEL_LIST[0] || '');
  const [imalatBlok, setImalatBlok] = useState<string>('');
  const [imalatAciklama, setImalatAciklama] = useState<string>('');
  const [imalatFotos, setImalatFotos] = useState<string[]>([]);
  const [isSavingImalat, setIsSavingImalat] = useState(false);
  const [editingImalatId, setEditingImalatId] = useState<string | null>(null);

  // Update default block when parsel changes
  useEffect(() => {
    if (imalatParsel) {
      const bloks = blokListForParsel(imalatParsel);
      // Only reset block if not editing or if block not in current list
      if (!editingImalatId || !bloks.includes(imalatBlok)) {
        setImalatBlok(bloks[0] || '');
      }
    }
  }, [imalatParsel, editingImalatId]);

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'imalat' | 'hasar' | 'teslim' | 'iade' | 'edit_teslim' | 'edit_iade') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const added: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(String(event.target?.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        try {
          const compressed = await compressImage(rawBase64);
          added.push(compressed);
        } catch {
          added.push(rawBase64);
        }
      }

      if (target === 'imalat') {
        setImalatFotos(prev => [...prev, ...added].slice(0, 5));
      } else if (target === 'hasar') {
        setTutanakFotos(prev => [...prev, ...added].slice(0, 3));
      } else if (target === 'teslim') {
        setNewDelivery(prev => ({ ...prev, teslimFoto: added[0] || '' }));
      } else if (target === 'iade') {
        setReturnAction(prev => ({ ...prev, iadeFoto: added[0] || '' }));
      } else if (target === 'edit_teslim') {
        setEditDeliveryForm(prev => ({ ...prev, teslimFoto: added[0] || '' }));
      } else if (target === 'edit_iade') {
        setEditDeliveryForm(prev => ({ ...prev, iadeFoto: added[0] || '' }));
      }
      showStatus('success', 'Fotoğraf başarıyla eklendi.');
    } catch (err) {
      showStatus('error', 'Fotoğraf eklenirken hata oluştu.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveImalat = async () => {
    if (!imalatAciklama.trim()) {
      showStatus('error', 'Lütfen imalat açıklaması yazın.');
      return;
    }
    if (imalatFotos.length === 0) {
      showStatus('error', 'Lütfen en az 1 imalat fotoğrafı ekleyin.');
      return;
    }

    setIsSavingImalat(true);
    try {
      const recordId = editingImalatId || `sf_${Date.now()}`;
      const newRecord = {
        id: recordId,
        personelId: '',
        tarih: imalatTarih,
        isNiteligi: 'İmalat',
        parsel: imalatParsel,
        blok: imalatBlok,
        aciklama: imalatAciklama,
        fotoUrls: imalatFotos,
        fotoUrl: imalatFotos[0] || '',
        kaynakEkran: 'İMALAT_TERMİNALİ',
        kaydeden: currentUser?.email || 'anahtarci',
        kaydedenUid: currentUser?.uid || '',
      };

      await saveSahaFaaliyetNow(newRecord, 'formen_mobil');
      setImalatAciklama('');
      setImalatFotos([]);
      setEditingImalatId(null);
      showStatus('success', editingImalatId ? 'İmalat kaydı başarıyla güncellendi.' : 'İmalat kaydı başarıyla kaydedildi.');
    } catch (err: any) {
      showStatus('error', err?.message || 'İmalat kaydı kaydedilemedi.');
    } finally {
      setIsSavingImalat(false);
    }
  };

  const handleEditImalat = (record: any) => {
    setImalatTarih(record.tarih);
    setImalatParsel(record.parsel);
    setImalatBlok(record.blok);
    setImalatAciklama(record.aciklama);
    setImalatFotos(record.fotoUrls || (record.fotoUrl ? [record.fotoUrl] : []));
    setEditingImalatId(record.id);
    showStatus('success', 'İmalat kaydı düzenlemek üzere forma yüklendi.');
  };

  const handleDeleteImalat = async (record: any) => {
    if (!window.confirm('Bu imalat kaydını silmek istediğinize emin misiniz?')) return;
    try {
      await removeSahaFaaliyetNow(record);
      if (editingImalatId === record.id) {
        setEditingImalatId(null);
        setImalatAciklama('');
        setImalatFotos([]);
      }
      showStatus('success', 'İmalat kaydı silindi.');
    } catch (err: any) {
      showStatus('error', err?.message || 'İmalat silinemedi.');
    }
  };

  // Filter imalat records created from the Imalat Terminali
  const terminalImalatlar = sahaFaaliyetleri.filter(sf => sf.kaynakEkran === 'İMALAT_TERMİNALİ');

  // =========================================================================
  // 2. YÖNETİCİYE HASAR RAPORU (TUTANAK) STATE & HANDLERS
  // =========================================================================
  const [tutanakSubject, setTutanakSubject] = useState<string>('Hasarlı Bölge Tespit Tutanağı');
  const [tutanakDate, setTutanakDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [tutanakParsel, setTutanakParsel] = useState<string>(PARSEL_LIST[0] || '');
  const [tutanakBlok, setTutanakBlok] = useState<string>('');
  const [tutanakText, setTutanakText] = useState<string>('');
  const [tutanakFotos, setTutanakFotos] = useState<string[]>([]);
  const [isSavingTutanak, setIsSavingTutanak] = useState(false);
  const [editingTutanakId, setEditingTutanakId] = useState<string | null>(null);

  useEffect(() => {
    if (tutanakParsel) {
      const bloks = blokListForParsel(tutanakParsel);
      if (!editingTutanakId || !bloks.includes(tutanakBlok)) {
        setTutanakBlok(bloks[0] || '');
      }
    }
  }, [tutanakParsel, editingTutanakId]);

  const handleSendTutanak = async () => {
    if (!tutanakSubject.trim()) {
      showStatus('error', 'Lütfen tutanak konusunu doldurun.');
      return;
    }
    if (!tutanakText.trim()) {
      showStatus('error', 'Lütfen hasar / tutanak detayını yazın.');
      return;
    }
    if (tutanakFotos.length === 0) {
      showStatus('error', 'Lütfen en az 1 adet hasar görseli ekleyin.');
      return;
    }

    setIsSavingTutanak(true);
    try {
      const id = editingTutanakId || `t_${Date.now()}`;
      const docNo = editingTutanakId 
        ? hazirTutanaklar.find(t => t.id === editingTutanakId)?.belgeNo || ''
        : `TUT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      const newDoc = {
        id,
        tutanakTipi: 'HASAR',
        belgeNo: docNo,
        konu: tutanakSubject,
        tarih: tutanakDate,
        icerik: tutanakText,
        durum: 'ONAY BEKLİYOR',
        aciklama: 'İmalat Terminalinden hasar tutanağı gönderildi.',
        kaydedenAnahtarci: currentUser?.email || 'anahtarci',
        foto1: tutanakFotos[0] || '',
        foto2: tutanakFotos[1] || '',
        foto3: tutanakFotos[2] || '',
        parsel: tutanakParsel,
        blok: tutanakBlok
      };

      await setDoc(doc(db, 'hazirTutanaklar', id), newDoc);
      setTutanakText('');
      setTutanakFotos([]);
      setEditingTutanakId(null);
      setTutanakSubject('Hasarlı Bölge Tespit Tutanağı');
      showStatus('success', editingTutanakId ? 'Hasar raporu başarıyla güncellendi.' : 'Hasar raporu başarıyla onay havuzuna gönderildi.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Tutanak gönderilemedi.');
    } finally {
      setIsSavingTutanak(false);
    }
  };

  const handleEditTutanak = (item: any) => {
    if (item.durum !== 'ONAY BEKLİYOR') {
      alert('Sadece onay bekleyen (işlem görmemiş) tutanakları düzenleyebilirsiniz.');
      return;
    }
    setTutanakSubject(item.konu);
    setTutanakDate(item.tarih);
    setTutanakParsel(item.parsel || PARSEL_LIST[0]);
    setTutanakBlok(item.blok || '');
    setTutanakText(item.icerik);
    setTutanakFotos([item.foto1, item.foto2, item.foto3].filter(Boolean));
    setEditingTutanakId(item.id);
    showStatus('success', 'Tutanak bilgileri düzenlemek üzere forma yüklendi.');
  };

  const handleDeleteTutanak = async (item: any) => {
    if (item.durum !== 'ONAY BEKLİYOR') {
      alert('Sadece onay bekleyen (işlem görmemiş) tutanakları silebilirsiniz.');
      return;
    }
    if (!window.confirm('Bu raporu silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'hazirTutanaklar', item.id));
      if (editingTutanakId === item.id) {
        setEditingTutanakId(null);
        setTutanakText('');
        setTutanakFotos([]);
      }
      showStatus('success', 'Hasar raporu silindi.');
    } catch (err: any) {
      showStatus('error', 'Rapor silinirken hata oluştu.');
    }
  };

  // Filter tutanak records created by the Anahtarci
  const myTutanaklar = hazirTutanaklar.filter(t => t.kaydedenAnahtarci);

  // =========================================================================
  // 3. DAİRE TESLİM VE İADE TAKİBİ STATE & HANDLERS
  // =========================================================================
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [showNewDelivery, setShowNewDelivery] = useState(false);
  const [newDelivery, setNewDelivery] = useState({
    parsel: PARSEL_LIST[0] || '',
    blok: '',
    daireNo: '',
    taseronId: '',
    taseronAdi: '',
    manualTaseron: '',
    muhatapPersonel: '',
    teslimTarihi: new Date().toISOString().split('T')[0],
    teslimFoto: ''
  });

  const [returnAction, setReturnAction] = useState<{
    delivery: any | null;
    iadeTarihi: string;
    iadeFoto: string;
    hasDamage: boolean;
    damageDescription: string;
    penaltyAmount: number;
  }>({
    delivery: null,
    iadeTarihi: new Date().toISOString().split('T')[0],
    iadeFoto: '',
    hasDamage: false,
    damageDescription: '',
    penaltyAmount: 0
  });

  // Handoff Edit state
  const [editingDelivery, setEditingDelivery] = useState<any | null>(null);
  const [editDeliveryForm, setEditDeliveryForm] = useState({
    parsel: '',
    blok: '',
    daireNo: '',
    taseronId: '',
    taseronAdi: '',
    manualTaseron: '',
    muhatapPersonel: '',
    teslimTarihi: '',
    teslimFoto: '',
    iadeTarihi: '',
    iadeFoto: '',
    durum: '',
    hasDamage: false,
    damageDescription: '',
    penaltyAmount: 0
  });

  const [isSavingDelivery, setIsSavingDelivery] = useState(false);
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [isSavingEditDelivery, setIsSavingEditDelivery] = useState(false);

  useEffect(() => {
    if (newDelivery.parsel) {
      const bloks = blokListForParsel(newDelivery.parsel);
      setNewDelivery(prev => ({ ...prev, blok: bloks[0] || '' }));
    }
  }, [newDelivery.parsel]);

  useEffect(() => {
    if (editDeliveryForm.parsel && editingDelivery) {
      const bloks = blokListForParsel(editDeliveryForm.parsel);
      if (!bloks.includes(editDeliveryForm.blok)) {
        setEditDeliveryForm(prev => ({ ...prev, blok: bloks[0] || '' }));
      }
    }
  }, [editDeliveryForm.parsel, editingDelivery]);

  // Subscribe to daire teslimatları collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'daireTeslimatleri'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docItem) => {
        list.push({ id: docItem.id, ...docItem.data() });
      });
      list.sort((a, b) => new Date(b.teslimTarihi || 0).getTime() - new Date(a.teslimTarihi || 0).getTime());
      setDeliveries(list);
    });
    return () => unsub();
  }, []);

  const handleStartDelivery = async () => {
    const firmName = newDelivery.taseronId 
      ? taseronlar.find(t => t.id === newDelivery.taseronId)?.unvan || ''
      : newDelivery.manualTaseron;

    if (!newDelivery.daireNo.trim()) {
      showStatus('error', 'Lütfen daire numarasını girin.');
      return;
    }
    if (!firmName.trim()) {
      showStatus('error', 'Lütfen taşeron firmayı seçin veya girin.');
      return;
    }
    if (!newDelivery.muhatapPersonel.trim()) {
      showStatus('error', 'Lütfen muhatap personel ismini girin.');
      return;
    }
    if (!newDelivery.teslimFoto) {
      showStatus('error', 'Daire teslim anı fotoğrafı zorunludur.');
      return;
    }

    setIsSavingDelivery(true);
    try {
      const id = `dt_${Date.now()}`;
      const payload = {
        id,
        parsel: newDelivery.parsel,
        blok: newDelivery.blok,
        daireNo: newDelivery.daireNo.trim(),
        taseronId: newDelivery.taseronId || null,
        taseronAdi: firmName.trim(),
        muhatapPersonel: newDelivery.muhatapPersonel.trim(),
        teslimEden: currentUser?.displayName || currentUser?.email || 'Anahtarcı Personeli',
        teslimEdenEmail: currentUser?.email || '',
        teslimTarihi: newDelivery.teslimTarihi,
        teslimFoto: newDelivery.teslimFoto,
        durum: 'TESLİM EDİLDİ',
      };

      await setDoc(doc(db, 'daireTeslimatleri', id), payload);
      setShowNewDelivery(false);
      setNewDelivery({
        parsel: PARSEL_LIST[0] || '',
        blok: '',
        daireNo: '',
        taseronId: '',
        taseronAdi: '',
        manualTaseron: '',
        muhatapPersonel: '',
        teslimTarihi: new Date().toISOString().split('T')[0],
        teslimFoto: ''
      });
      showStatus('success', 'Anahtar teslim kaydı başarıyla oluşturuldu.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Teslim kaydı oluşturulamadı.');
    } finally {
      setIsSavingDelivery(false);
    }
  };

  const handleCompleteReturn = async () => {
    const delivery = returnAction.delivery;
    if (!delivery) return;

    if (!returnAction.iadeFoto) {
      showStatus('error', 'Teslim alma / iade anı fotoğrafı zorunludur.');
      return;
    }

    if (returnAction.hasDamage && !returnAction.damageDescription.trim()) {
      showStatus('error', 'Hasar varsa lütfen detaylı hasar açıklaması girin.');
      return;
    }

    setIsSavingReturn(true);
    try {
      const updatedStatus = returnAction.hasDamage ? 'HASARLI İADE ALINDI' : 'SORUNSUZ İADE ALINDI';
      
      // Update delivery record in Firestore
      const deliveryRef = doc(db, 'daireTeslimatleri', delivery.id);
      await updateDoc(deliveryRef, {
        durum: updatedStatus,
        iadeTarihi: returnAction.iadeTarihi,
        iadeFoto: returnAction.iadeFoto,
        hasarAciklamasi: returnAction.hasDamage ? returnAction.damageDescription : null,
        cezaTutari: returnAction.hasDamage ? returnAction.penaltyAmount : 0
      });

      // If damaged, generate a CEZA tutanak in hazirTutanaklar
      if (returnAction.hasDamage) {
        const tutanakId = `t_${Date.now()}`;
        const docNo = `TUT-CEZA-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        
        const cezaTutanak = {
          id: tutanakId,
          tutanakTipi: 'CEZA',
          belgeNo: docNo,
          konu: `${delivery.parsel} - ${delivery.blok} - Daire ${delivery.daireNo} Anahtar Teslim ve Hasar Ceza Tutanağı`,
          tarih: returnAction.iadeTarihi,
          icerik: `Şantiyemiz ${delivery.parsel} / ${delivery.blok} blok ${delivery.daireNo} numaralı daire, tamirat/onarım işlemleri yapılması maksadıyla ${delivery.teslimTarihi} tarihinde ${delivery.taseronAdi} firması personeli ${delivery.muhatapPersonel} isimli yetkiliye anahtar teslimiyle devredilmiştir.\n\nİşlemler tamamlandıktan sonra ${returnAction.iadeTarihi} tarihinde daire geri teslim alınırken yapılan kontrolde daireye hasar verildiği tespit edilmiştir.\n\nHasar Detayı: ${returnAction.damageDescription}\n\nİlgili taşeron firmaya ₺${returnAction.penaltyAmount.toLocaleString('tr-TR')} cezai işlem uygulanması ve hakedişinden kesilmesi kararlaştırılmıştır.`,
          taseronAdi: delivery.taseronAdi,
          cariKartId: delivery.taseronId || '',
          cezaTutari: returnAction.penaltyAmount,
          durum: 'ONAY BEKLİYOR',
          aciklama: 'Daire teslimatı hasarlı tamamlandığı için ceza tutanağı oluşturuldu.',
          kaydedenAnahtarci: currentUser?.email || 'anahtarci',
          foto1: delivery.teslimFoto, // initial state
          foto2: returnAction.iadeFoto, // final state
          parsel: delivery.parsel,
          blok: delivery.blok,
          muhatapPersonel: delivery.muhatapPersonel,
          teslimEden: delivery.teslimEden,
          teslimEdenEmail: delivery.teslimEdenEmail
        };

        await setDoc(doc(db, 'hazirTutanaklar', tutanakId), cezaTutanak);
        await updateDoc(deliveryRef, { cezaTutanakId: tutanakId });
      }

      setReturnAction({
        delivery: null,
        iadeTarihi: new Date().toISOString().split('T')[0],
        iadeFoto: '',
        hasDamage: false,
        damageDescription: '',
        penaltyAmount: 0
      });
      showStatus('success', 'Daire geri teslim kaydı başarıyla tamamlandı.');
    } catch (err: any) {
      showStatus('error', err?.message || 'İade işlemi kaydedilemedi.');
    } finally {
      setIsSavingReturn(false);
    }
  };

  const handleEditDelivery = (item: any) => {
    setEditingDelivery(item);
    setEditDeliveryForm({
      parsel: item.parsel,
      blok: item.blok,
      daireNo: item.daireNo,
      taseronId: item.taseronId || '',
      taseronAdi: item.taseronAdi || '',
      manualTaseron: item.taseronId ? '' : item.taseronAdi,
      muhatapPersonel: item.muhatapPersonel || '',
      teslimTarihi: item.teslimTarihi || '',
      teslimFoto: item.teslimFoto || '',
      iadeTarihi: item.iadeTarihi || new Date().toISOString().split('T')[0],
      iadeFoto: item.iadeFoto || '',
      durum: item.durum,
      hasDamage: item.durum === 'HASARLI İADE ALINDI',
      damageDescription: item.hasarAciklamasi || '',
      penaltyAmount: item.cezaTutari || 0
    });
  };

  const handleSaveEditDelivery = async () => {
    if (!editingDelivery) return;

    const firmName = editDeliveryForm.taseronId 
      ? taseronlar.find(t => t.id === editDeliveryForm.taseronId)?.unvan || ''
      : editDeliveryForm.manualTaseron;

    if (!editDeliveryForm.daireNo.trim()) {
      showStatus('error', 'Lütfen daire numarasını girin.');
      return;
    }
    if (!firmName.trim()) {
      showStatus('error', 'Lütfen taşeron firmayı belirtin.');
      return;
    }
    if (!editDeliveryForm.muhatapPersonel.trim()) {
      showStatus('error', 'Muhatap personel zorunludur.');
      return;
    }
    if (!editDeliveryForm.teslimFoto) {
      showStatus('error', 'Teslim anı fotoğrafı zorunludur.');
      return;
    }

    if (editDeliveryForm.durum !== 'TESLİM EDİLDİ') {
      if (!editDeliveryForm.iadeFoto) {
        showStatus('error', 'İade fotoğrafı zorunludur.');
        return;
      }
      if (editDeliveryForm.hasDamage && !editDeliveryForm.damageDescription.trim()) {
        showStatus('error', 'Lütfen hasar detayını girin.');
        return;
      }
    }

    setIsSavingEditDelivery(true);
    try {
      const isCompleted = editDeliveryForm.durum !== 'TESLİM EDİLDİ';
      let targetDurum = editDeliveryForm.durum;
      if (isCompleted) {
        targetDurum = editDeliveryForm.hasDamage ? 'HASARLI İADE ALINDI' : 'SORUNSUZ İADE ALINDI';
      }

      const deliveryRef = doc(db, 'daireTeslimatleri', editingDelivery.id);
      
      const payload: any = {
        parsel: editDeliveryForm.parsel,
        blok: editDeliveryForm.blok,
        daireNo: editDeliveryForm.daireNo.trim(),
        taseronId: editDeliveryForm.taseronId || null,
        taseronAdi: firmName.trim(),
        muhatapPersonel: editDeliveryForm.muhatapPersonel.trim(),
        teslimTarihi: editDeliveryForm.teslimTarihi,
        teslimFoto: editDeliveryForm.teslimFoto,
        durum: targetDurum
      };

      if (isCompleted) {
        payload.iadeTarihi = editDeliveryForm.iadeTarihi;
        payload.iadeFoto = editDeliveryForm.iadeFoto;
        payload.hasarAciklamasi = editDeliveryForm.hasDamage ? editDeliveryForm.damageDescription.trim() : null;
        payload.cezaTutari = editDeliveryForm.hasDamage ? editDeliveryForm.penaltyAmount : 0;
      } else {
        payload.iadeTarihi = null;
        payload.iadeFoto = null;
        payload.hasarAciklamasi = null;
        payload.cezaTutari = 0;
      }

      // Handle the associated ceza tutanak logic
      let cezaId = editingDelivery.cezaTutanakId || null;

      if (isCompleted && editDeliveryForm.hasDamage) {
        // We need a ceza tutanak
        const tutanakId = cezaId || `t_${Date.now()}`;
        const docNo = cezaId 
          ? hazirTutanaklar.find(t => t.id === cezaId)?.belgeNo || `TUT-CEZA-2026-${Math.floor(1000 + Math.random() * 9000)}`
          : `TUT-CEZA-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        const cezaTutanak = {
          id: tutanakId,
          tutanakTipi: 'CEZA',
          belgeNo: docNo,
          konu: `${editDeliveryForm.parsel} - ${editDeliveryForm.blok} - Daire ${editDeliveryForm.daireNo} Anahtar Teslim ve Hasar Ceza Tutanağı`,
          tarih: editDeliveryForm.iadeTarihi,
          icerik: `Şantiyemiz ${editDeliveryForm.parsel} / ${editDeliveryForm.blok} blok ${editDeliveryForm.daireNo} numaralı daire, tamirat/onarım işlemleri yapılması maksadıyla ${editDeliveryForm.teslimTarihi} tarihinde ${firmName} firması personeli ${editDeliveryForm.muhatapPersonel} isimli yetkiliye anahtar teslimiyle devredilmiştir.\n\nİşlemler tamamlandıktan sonra ${editDeliveryForm.iadeTarihi} tarihinde daire geri teslim alınırken yapılan kontrolde daireye hasar verildiği tespit edilmiştir.\n\nHasar Detayı: ${editDeliveryForm.damageDescription}\n\nİlgili taşeron firmaya ₺${editDeliveryForm.penaltyAmount.toLocaleString('tr-TR')} cezai işlem uygulanması ve hakedişinden kesilmesi kararlaştırılmıştır.`,
          taseronAdi: firmName,
          cariKartId: editDeliveryForm.taseronId || '',
          cezaTutari: editDeliveryForm.penaltyAmount,
          durum: 'ONAY BEKLİYOR',
          aciklama: 'Daire teslimatı hasarlı tamamlandığı için ceza tutanağı oluşturuldu.',
          kaydedenAnahtarci: currentUser?.email || 'anahtarci',
          foto1: editDeliveryForm.teslimFoto, // initial state
          foto2: editDeliveryForm.iadeFoto, // final state
          parsel: editDeliveryForm.parsel,
          blok: editDeliveryForm.blok,
          muhatapPersonel: editDeliveryForm.muhatapPersonel,
          teslimEden: editingDelivery.teslimEden || 'Anahtarcı Yetkilisi',
          teslimEdenEmail: editingDelivery.teslimEdenEmail || ''
        };

        await setDoc(doc(db, 'hazirTutanaklar', tutanakId), cezaTutanak);
        payload.cezaTutanakId = tutanakId;
      } else {
        // If it previously had a ceza tutanak but now it doesn't need it (either sorumsuz returned or returned to status TESLİM EDİLDİ)
        if (cezaId) {
          await deleteDoc(doc(db, 'hazirTutanaklar', cezaId));
          payload.cezaTutanakId = null;
        }
      }

      await updateDoc(deliveryRef, payload);
      setEditingDelivery(null);
      showStatus('success', 'Daire teslimat kaydı başarıyla güncellendi.');
    } catch (err: any) {
      showStatus('error', err?.message || 'Kayıt güncellenemedi.');
    } finally {
      setIsSavingEditDelivery(false);
    }
  };

  const handleDeleteDelivery = async (item: any) => {
    if (!window.confirm('Bu teslimat kaydını silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'daireTeslimatleri', item.id));
      if (item.cezaTutanakId) {
        await deleteDoc(doc(db, 'hazirTutanaklar', item.cezaTutanakId));
      }
      showStatus('success', 'Teslimat kaydı (ve varsa bağlantılı ceza tutanağı) silindi.');
    } catch (err: any) {
      showStatus('error', 'Kayıt silinirken hata oluştu.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans select-none">
      
      {/* 📱 Light Mode Header */}
      <header className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-30 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="bg-[#2563EB]/10 p-2 rounded-2xl border border-[#2563EB]/20">
            <Hammer className="text-[#2563EB] animate-pulse" size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-slate-800 flex items-center gap-1.5 font-sans">
              İMALAT TERMİNALİ
            </h1>
            <p className="text-[10px] text-slate-500">
              Anahtarcı & Usta Saha Bildirim Paneli
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {currentUser && (
            <div className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-right hidden xs:block">
              <span className="text-[7px] text-slate-500 block font-bold uppercase">Kullanıcı</span>
              <span className="text-[10px] font-mono font-bold text-[#2563EB]">{currentUser.email}</span>
            </div>
          )}
          {onSignOut && (
            <button 
              onClick={onSignOut}
              className="p-2 bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 rounded-xl transition cursor-pointer"
              title="Çıkış Yap"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </header>

      {/* 🔔 Toast notifications */}
      {statusMessage && (
        <div className="fixed top-16 left-4 right-4 z-45 animate-bounce">
          <div className={`p-3.5 rounded-2xl border flex items-center space-x-2.5 shadow-xl text-xs font-bold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-250 text-emerald-700'
              : 'bg-rose-50 border-rose-250 text-rose-700'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* 🧭 Tab Navigation Bar (Light style) */}
      <nav className="bg-white border-b border-slate-200 px-2 py-1.5 flex gap-1 justify-around shadow-2xs">
        <button
          onClick={() => { setActiveSubTab('imalat'); setShowNewDelivery(false); setReturnAction(prev => ({ ...prev, delivery: null })); setEditingDelivery(null); }}
          className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl text-[10px] font-extrabold tracking-wider transition ${
            activeSubTab === 'imalat' 
              ? 'bg-blue-50 border border-blue-200/50 text-[#2563EB]' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-55'
          }`}
        >
          <Hammer size={16} className="mb-1" />
          İmalat Girişi
        </button>
        <button
          onClick={() => { setActiveSubTab('hasar'); setShowNewDelivery(false); setReturnAction(prev => ({ ...prev, delivery: null })); setEditingDelivery(null); }}
          className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl text-[10px] font-extrabold tracking-wider transition ${
            activeSubTab === 'hasar' 
              ? 'bg-amber-50 border border-amber-200/50 text-amber-600' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-55'
          }`}
        >
          <AlertTriangle size={16} className="mb-1" />
          Yöneticiye Rapor
        </button>
        <button
          onClick={() => { setActiveSubTab('daire_teslim'); setEditingDelivery(null); }}
          className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl text-[10px] font-extrabold tracking-wider transition ${
            activeSubTab === 'daire_teslim' 
              ? 'bg-sky-50 border border-sky-200/50 text-sky-600' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-55'
          }`}
        >
          <KeySquare size={16} className="mb-1" />
          Daire Teslim / İade
        </button>
      </nav>

      {/* 📦 Main Screen Content */}
      <main className="flex-1 p-4 overflow-y-auto max-w-xl mx-auto w-full space-y-4">
        
        {/* ========================================================================= */}
        {/* TAB 1: İMALAT GİRİŞ PANELİ */}
        {/* ========================================================================= */}
        {activeSubTab === 'imalat' && (
          <div className="space-y-4">
            
            {/* Form Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
              <h2 className="text-xs font-black tracking-widest text-[#2563EB] uppercase flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Hammer size={14} /> {editingImalatId ? 'İMALAT BİLGİSİNİ DÜZENLE' : 'GÜNLÜK İMALAT BİLDİRİMİ'}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">TARİH</label>
                  <input 
                    type="date"
                    value={imalatTarih}
                    onChange={(e) => setImalatTarih(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-[#2563EB] focus:bg-white outline-none font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">PARSEL</label>
                  <select
                    value={imalatParsel}
                    onChange={(e) => setImalatParsel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-[#2563EB] focus:bg-white outline-none font-bold text-slate-800"
                  >
                    {PARSEL_LIST.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">BLOK / ALAN</label>
                <select
                  value={imalatBlok}
                  onChange={(e) => setImalatBlok(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-[#2563EB] focus:bg-white outline-none font-bold text-slate-800"
                >
                  {blokListForParsel(imalatParsel).map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">YAPILAN İMALAT TANIMI / AÇIKLAMA</label>
                <textarea
                  value={imalatAciklama}
                  onChange={(e) => setImalatAciklama(e.target.value)}
                  placeholder="Örn: 3. kat duvar örümü tamamlandı, sıva imalatı başlatıldı..."
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs rounded-xl focus:border-[#2563EB] focus:bg-white outline-none font-bold text-slate-800 h-24 placeholder:text-slate-400"
                />
              </div>

              {/* Photo Upload */}
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">İMALAT FOTOĞRAFLARI ({imalatFotos.length}/5)</label>
                
                <div className="grid grid-cols-5 gap-2">
                  {imalatFotos.map((img, idx) => (
                    <div key={idx} className="relative aspect-square border border-slate-200 rounded-xl overflow-hidden bg-slate-100 group">
                      <img src={img} alt="Imalat" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => setImalatFotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 p-1 bg-red-500 hover:bg-red-600 rounded-lg text-white"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                  {imalatFotos.length < 5 && (
                    <label className="aspect-square border border-dashed border-slate-350 hover:border-[#2563EB] rounded-xl flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-white transition">
                      <Camera size={20} className="text-slate-400" />
                      <span className="text-[8px] text-slate-400 font-bold mt-1">Ekle</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={(e) => handleFotoUpload(e, 'imalat')} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {editingImalatId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingImalatId(null);
                      setImalatAciklama('');
                      setImalatFotos([]);
                    }}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs py-3 rounded-2xl cursor-pointer transition text-center"
                  >
                    VAZGEÇ
                  </button>
                )}
                <button
                  onClick={handleSaveImalat}
                  disabled={isSavingImalat}
                  className="flex-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/5 transition"
                >
                  {isSavingImalat ? 'KAYDEDİLİYOR...' : (editingImalatId ? 'DEĞİŞİKLİKLERİ KAYDET' : 'İMALAT RAPORUNU KAYDET')}
                </button>
              </div>
            </div>

            {/* List Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3.5">
              <h3 className="text-xs font-black tracking-wider text-slate-800 uppercase border-b border-slate-100 pb-2 flex items-center justify-between">
                <span>TERMİNAL İMALAT KAYITLARI</span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{terminalImalatlar.length} Kayıt</span>
              </h3>

              {terminalImalatlar.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">Bu terminal üzerinden henüz imalat girişi yapılmamış.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {terminalImalatlar.map((item) => (
                    <div key={item.id} className="p-3 bg-slate-50 border border-slate-150 rounded-2xl space-y-2 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs">{item.parsel} - {item.blok}</h4>
                          <p className="text-[9px] font-mono text-slate-500 mt-0.5">Tarih: {item.tarih} | Kaydeden: {item.kaydeden}</p>
                        </div>
                        {item.fotoUrls && item.fotoUrls.length > 0 && (
                          <div className="flex gap-1">
                            {item.fotoUrls.slice(0, 3).map((img: string, i: number) => (
                              <img key={i} src={img} alt="thumb" className="w-8 h-8 rounded border object-cover shrink-0" />
                            ))}
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-650 leading-relaxed bg-white p-2 rounded-xl border border-slate-100 font-sans">{item.aciklama}</p>

                      <div className="flex gap-2 justify-end border-t border-slate-150 pt-2">
                        <button
                          onClick={() => handleEditImalat(item)}
                          className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#2563EB] text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition"
                        >
                          <Edit2 size={11} /> Düzenle
                        </button>
                        <button
                          onClick={() => handleDeleteImalat(item)}
                          className="flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition"
                        >
                          <Trash2 size={11} /> Sil
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: YÖNETİCİYE HASAR RAPORU */}
        {/* ========================================================================= */}
        {activeSubTab === 'hasar' && (
          <div className="space-y-4">
            
            {/* Form Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
              <h2 className="text-xs font-black tracking-widest text-amber-600 uppercase flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <AlertTriangle size={14} /> {editingTutanakId ? 'HASAR BİLGİSİNİ DÜZENLE' : 'HASAR VEYA OLAY RAPORU GÖNDER'}
              </h2>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">TUTANAK KONUSU</label>
                <input 
                  type="text"
                  value={tutanakSubject}
                  onChange={(e) => setTutanakSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-amber-400 focus:bg-white outline-none font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">TARİH</label>
                  <input 
                    type="date"
                    value={tutanakDate}
                    onChange={(e) => setTutanakDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-amber-400 focus:bg-white outline-none font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">PARSEL</label>
                  <select
                    value={tutanakParsel}
                    onChange={(e) => setTutanakParsel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-amber-400 focus:bg-white outline-none font-bold text-slate-800"
                  >
                    {PARSEL_LIST.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">BLOK / ALAN</label>
                <select
                  value={tutanakBlok}
                  onChange={(e) => setTutanakBlok(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-amber-400 focus:bg-white outline-none font-bold text-slate-800"
                >
                  {blokListForParsel(tutanakParsel).map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">HASAR DETAYI VE OLAY AÇIKLAMASI</label>
                <textarea
                  value={tutanakText}
                  onChange={(e) => setTutanakText(e.target.value)}
                  placeholder="Örn: 2. blok şaft boşluğunda asansör kasasının hasar aldığı tespit edilmiştir, tutanak tutulması gerekmektedir..."
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs rounded-xl focus:border-amber-400 focus:bg-white outline-none font-bold text-slate-800 h-24 placeholder:text-slate-400"
                />
              </div>

              {/* Photo Upload */}
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-bold block uppercase">TUTANAK GÖRSELLERİ ({tutanakFotos.length}/3)</label>
                
                <div className="grid grid-cols-3 gap-2">
                  {tutanakFotos.map((img, idx) => (
                    <div key={idx} className="relative aspect-square border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
                      <img src={img} alt="Tutanak" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => setTutanakFotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 p-1 bg-red-500 hover:bg-red-650 rounded-lg text-white"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                  {tutanakFotos.length < 3 && (
                    <label className="aspect-square border border-dashed border-slate-350 hover:border-amber-400 rounded-xl flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-white transition">
                      <Camera size={20} className="text-slate-400" />
                      <span className="text-[8px] text-slate-400 font-bold mt-1">Ekle</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={(e) => handleFotoUpload(e, 'hasar')} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {editingTutanakId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTutanakId(null);
                      setTutanakText('');
                      setTutanakFotos([]);
                      setTutanakSubject('Hasarlı Bölge Tespit Tutanağı');
                    }}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs py-3 rounded-2xl cursor-pointer transition text-center font-sans"
                  >
                    VAZGEÇ
                  </button>
                )}
                <button
                  onClick={handleSendTutanak}
                  disabled={isSavingTutanak}
                  className="flex-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/5 transition"
                >
                  <FileText size={14} /> {isSavingTutanak ? 'GÖNDERİLİYOR...' : (editingTutanakId ? 'RAPORU GÜNCELLE' : 'YÖNETİME YOLLA')}
                </button>
              </div>
            </div>

            {/* List Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3.5">
              <h3 className="text-xs font-black tracking-wider text-slate-800 uppercase border-b border-slate-100 pb-2 flex items-center justify-between font-sans">
                <span>GÖNDERDİĞİM RAPORLAR (TUTANAKLAR)</span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{myTutanaklar.length} Rapor</span>
              </h3>

              {myTutanaklar.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">Gönderilmiş herhangi bir hasar tutanağınız bulunmuyor.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {myTutanaklar.map((item) => {
                    const isPending = item.durum === 'ONAY BEKLİYOR';
                    return (
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-150 rounded-2xl space-y-2 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-[8px] px-2 py-0.5 rounded-md font-bold uppercase ${
                              item.durum === 'ONAYLANDI' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : item.durum === 'İPTAL'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {item.durum}
                            </span>
                            <h4 className="font-bold text-slate-800 text-xs mt-1.5">{item.konu}</h4>
                            <p className="text-[9px] font-mono text-slate-500 mt-0.5">{item.belgeNo} | Parsel/Blok: {item.parsel || '-'}/{item.blok || '-'} | Tarih: {item.tarih}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {[item.foto1, item.foto2, item.foto3].filter(Boolean).map((img, i) => (
                              <img key={i} src={img} alt="tutanak" className="w-8 h-8 rounded border object-cover" />
                            ))}
                          </div>
                        </div>

                        <p className="text-xs text-slate-650 leading-relaxed bg-white p-2 rounded-xl border border-slate-100 font-sans">{item.icerik}</p>

                        {isPending ? (
                          <div className="flex gap-2 justify-end border-t border-slate-150 pt-2">
                            <button
                              onClick={() => handleEditTutanak(item)}
                              className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#2563EB] text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition font-sans"
                            >
                              <Edit2 size={11} /> Düzenle
                            </button>
                            <button
                              onClick={() => handleDeleteTutanak(item)}
                              className="flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition font-sans"
                            >
                              <Trash2 size={11} /> Sil
                            </button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic text-right pt-1 font-sans">Bu rapor işlem gördüğü için artık düzenlenemez.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DAİRE ANAHTAR TESLİM / İADE TAKİBİ */}
        {/* ========================================================================= */}
        {activeSubTab === 'daire_teslim' && (
          <div className="space-y-4">
            
            {/* 🚪 Active deliveries list and forms */}
            {!showNewDelivery && !returnAction.delivery && !editingDelivery && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-sky-600 tracking-wider block uppercase font-sans">
                    ANAHTAR TESLİM AKIŞI
                  </h3>
                  <button
                    onClick={() => setShowNewDelivery(true)}
                    className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-slate-950 font-black text-[10px] px-3 py-1.5 rounded-xl cursor-pointer transition shadow-xs font-sans"
                  >
                    <Plus size={12} /> Yeni Teslimat Başlat
                  </button>
                </div>

                {deliveries.filter(d => d.durum === 'TESLİM EDİLDİ').length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center text-xs text-slate-400 italic">
                    Şu an taşeronda olan (teslim edilmiş) daire anahtarı bulunmuyor.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deliveries.filter(d => d.durum === 'TESLİM EDİLDİ').map((item) => (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-4.5 flex flex-col justify-between space-y-3 shadow-xs animate-fadeIn">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-sans">
                              {item.durum}
                            </span>
                            <h4 className="text-slate-800 text-xs font-extrabold mt-1.5 flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400" /> {item.parsel} - {item.blok} / Daire {item.daireNo}
                            </h4>
                          </div>
                          
                          {/* Mini Thumbnail */}
                          {item.teslimFoto && (
                            <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-50">
                              <img src={item.teslimFoto} alt="teslim" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-bold border-t border-slate-100 pt-2.5 font-sans">
                          <div>
                            <span className="text-[8px] text-slate-400 block font-bold">Taşeron</span>
                            <span className="text-slate-700 font-black">{item.taseronAdi}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-400 block font-bold">Muhatap Personel</span>
                            <span className="text-slate-700 font-black">{item.muhatapPersonel}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-400 block font-bold">Teslim Tarihi</span>
                            <span className="font-mono text-slate-700">{item.teslimTarihi}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-400 block font-bold">Teslim Eden</span>
                            <span className="text-slate-700 font-black">{item.teslimEden}</span>
                          </div>
                        </div>

                        <div className="flex gap-2 border-t border-slate-100 pt-3">
                          <button
                            onClick={() => setReturnAction(prev => ({ ...prev, delivery: item }))}
                            className="flex-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs py-2 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition font-sans uppercase"
                          >
                            <CheckCircle2 size={13} /> İade Al
                          </button>
                          <button
                            onClick={() => handleEditDelivery(item)}
                            className="flex-1 bg-blue-50 hover:bg-blue-105 border border-blue-200 text-[#2563EB] text-xs py-2 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition font-sans"
                            title="Düzenle"
                          >
                            <Edit2 size={12} /> Düzenle
                          </button>
                          <button
                            onClick={() => handleDeleteDelivery(item)}
                            className="p-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 rounded-xl transition cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 📝 FORM 1: Yeni Anahtar Teslimi Başlat */}
            {showNewDelivery && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-black text-sky-600 tracking-wider uppercase flex items-center gap-1.5 font-sans">
                    <Plus size={14} /> YENİ ANAHTAR TESLİMATI
                  </h3>
                  <button 
                    onClick={() => setShowNewDelivery(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer font-sans"
                  >
                    Vazgeç
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">PARSEL</label>
                    <select
                      value={newDelivery.parsel}
                      onChange={(e) => setNewDelivery(prev => ({ ...prev, parsel: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                    >
                      {PARSEL_LIST.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">BLOK</label>
                    <select
                      value={newDelivery.blok}
                      onChange={(e) => setNewDelivery(prev => ({ ...prev, blok: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                    >
                      {blokListForParsel(newDelivery.parsel).map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">DAİRE NO</label>
                    <input 
                      type="text"
                      placeholder="Örn: 5"
                      value={newDelivery.daireNo}
                      onChange={(e) => setNewDelivery(prev => ({ ...prev, daireNo: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">TESLİM TARİHİ</label>
                    <input 
                      type="date"
                      value={newDelivery.teslimTarihi}
                      onChange={(e) => setNewDelivery(prev => ({ ...prev, teslimTarihi: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">TAŞERON FİRMA</label>
                  <select
                    value={newDelivery.taseronId}
                    onChange={(e) => setNewDelivery(prev => ({ ...prev, taseronId: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                  >
                    <option value="">-- ELLE GİRİŞ VEYA SEÇİN --</option>
                    {taseronlar.map((t) => (
                      <option key={t.id} value={t.id}>{t.unvan}</option>
                    ))}
                  </select>
                  {!newDelivery.taseronId && (
                    <input 
                      type="text"
                      placeholder="Taşeron firma adı girin..."
                      value={newDelivery.manualTaseron}
                      onChange={(e) => setNewDelivery(prev => ({ ...prev, manualTaseron: e.target.value }))}
                      className="w-full mt-2 bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">MUHATAP TAŞERON PERSONEL</label>
                  <input 
                    type="text"
                    placeholder="Ad Soyad girin..."
                    value={newDelivery.muhatapPersonel}
                    onChange={(e) => setNewDelivery(prev => ({ ...prev, muhatapPersonel: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-sky-400 focus:bg-white outline-none font-bold text-slate-800"
                  />
                </div>

                {/* Single Handoff Photo */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">TESLİM ANINA AİT FOTOĞRAF (ZORUNLU)</label>
                  
                  {newDelivery.teslimFoto ? (
                    <div className="relative w-32 aspect-video border border-slate-200 rounded-2xl overflow-hidden bg-slate-100 group">
                      <img src={newDelivery.teslimFoto} alt="teslim foto" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => setNewDelivery(prev => ({ ...prev, teslimFoto: '' }))}
                        className="absolute top-1 right-1 p-1.5 bg-red-500 hover:bg-red-650 rounded-xl text-white font-sans"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full aspect-video max-h-36 border border-dashed border-slate-350 hover:border-sky-400 rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-white transition">
                      <Camera size={26} className="text-slate-400" />
                      <span className="text-[10px] text-slate-500 font-black mt-2">Dairenin İlk Halinin Fotoğrafını Çek</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleFotoUpload(e, 'teslim')} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>

                <button
                  onClick={handleStartDelivery}
                  disabled={isSavingDelivery}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-black text-xs py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-sky-500/5 transition font-sans"
                >
                  {isSavingDelivery ? 'KAYDEDİLİYOR...' : 'TESLİMATI BAŞLAT VE ANAHTARI VER'}
                </button>
              </div>
            )}

            {/* 🛠️ FORM 2: Anahtarı Geri Teslim Al (İade Alma) */}
            {returnAction.delivery && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-black text-emerald-600 tracking-wider uppercase flex items-center gap-1.5 font-sans">
                    <CheckCircle2 size={14} /> ANAHTAR GERİ TESLİM AL
                  </h3>
                  <button 
                    onClick={() => setReturnAction(prev => ({ ...prev, delivery: null }))}
                    className="text-xs text-slate-450 hover:text-slate-650 font-bold cursor-pointer font-sans"
                  >
                    Vazgeç
                  </button>
                </div>

                {/* Delivery Info Box */}
                <div className="bg-slate-55 border border-slate-200 p-3 rounded-xl text-xs space-y-1 font-sans">
                  <p className="text-slate-800 font-extrabold">{returnAction.delivery.parsel} - {returnAction.delivery.blok} / Daire {returnAction.delivery.daireNo}</p>
                  <p className="text-slate-500"><strong>Taşeron:</strong> {returnAction.delivery.taseronAdi}</p>
                  <p className="text-slate-500"><strong>Teslim Tarihi:</strong> {returnAction.delivery.teslimTarihi}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">İADE / GERİ ALMA TARİHİ</label>
                    <input 
                      type="date"
                      value={returnAction.iadeTarihi}
                      onChange={(e) => setReturnAction(prev => ({ ...prev, iadeTarihi: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-emerald-500 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  </div>
                </div>

                {/* Return Photo */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold block uppercase">İADE ANINA AİT FOTOĞRAF (ZORUNLU)</label>
                  
                  {returnAction.iadeFoto ? (
                    <div className="relative w-32 aspect-video border border-slate-200 rounded-2xl overflow-hidden bg-slate-100 group">
                      <img src={returnAction.iadeFoto} alt="iade foto" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => setReturnAction(prev => ({ ...prev, iadeFoto: '' }))}
                        className="absolute top-1 right-1 p-1.5 bg-red-500 hover:bg-red-655 rounded-xl text-white font-sans"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full aspect-video max-h-36 border border-dashed border-slate-350 hover:border-emerald-500 rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-white transition">
                      <Camera size={26} className="text-slate-400" />
                      <span className="text-[10px] text-slate-500 font-black mt-2">Dairenin Son Halinin Fotoğrafını Çek</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleFotoUpload(e, 'iade')} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>

                {/* Damage checkbox */}
                <div className="flex items-center space-x-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <input 
                    type="checkbox"
                    id="hasDamageCheckbox"
                    checked={returnAction.hasDamage}
                    onChange={(e) => setReturnAction(prev => ({ ...prev, hasDamage: e.target.checked }))}
                    className="w-4.5 h-4.5 rounded text-red-500 bg-slate-50 border-slate-300"
                  />
                  <label htmlFor="hasDamageCheckbox" className="text-xs font-black text-red-500 cursor-pointer uppercase select-none font-sans">
                    Dairede hasar oluşmuş (Ceza Kes)
                  </label>
                </div>

                {/* Damage penalty form details */}
                {returnAction.hasDamage && (
                  <div className="space-y-3.5 border border-red-200 bg-red-50/50 p-4 rounded-2xl animate-fadeIn font-sans">
                    <div className="space-y-1">
                      <label className="text-[10px] text-red-600 font-bold block uppercase">HASAR DETAYI & OLAY AÇIKLAMASI</label>
                      <textarea
                        value={returnAction.damageDescription}
                        onChange={(e) => setReturnAction(prev => ({ ...prev, damageDescription: e.target.value }))}
                        placeholder="Örn: Çalışma sırasında banyo seramikleri kırılmış ve mutfak dolap kapakları çizilmiştir..."
                        className="w-full bg-white border border-slate-250 px-3 py-2 text-xs rounded-xl focus:border-red-400 outline-none font-bold text-slate-800 h-20 placeholder:text-slate-400"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] text-red-600 font-bold block uppercase">KESİLECEK CEZA TUTARI (TL)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 text-slate-450" size={13} />
                        <input 
                          type="number"
                          placeholder="Örn: 2500"
                          value={returnAction.penaltyAmount || ''}
                          onChange={(e) => setReturnAction(prev => ({ ...prev, penaltyAmount: Number(e.target.value) }))}
                          className="w-full bg-white border border-slate-250 pl-8 pr-3 py-2 text-xs rounded-xl focus:border-red-400 outline-none font-bold text-slate-800 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCompleteReturn}
                  disabled={isSavingReturn}
                  className={`w-full font-black text-xs py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition font-sans ${
                    returnAction.hasDamage 
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/5' 
                      : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/5'
                  }`}
                >
                  {isSavingReturn ? 'KAYDEDİLİYOR...' : (
                    returnAction.hasDamage 
                      ? 'HASAR CEZA TUTANAĞINI YÖNETİME YOLLA' 
                      : 'ANAHTARI SORUNSUZ İADE AL'
                  )}
                </button>
              </div>
            )}

            {/* 🛠️ FORM 3: Daire Handoff Düzenleme Modalı (Inline Panel) */}
            {editingDelivery && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xl space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-black text-[#2563EB] tracking-wider uppercase flex items-center gap-1.5 font-sans">
                    <Edit2 size={14} /> TESLİMAT KAYDINI DÜZENLE
                  </h3>
                  <button 
                    onClick={() => setEditingDelivery(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer font-sans"
                  >
                    İptal
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 font-sans">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">PARSEL</label>
                    <select
                      value={editDeliveryForm.parsel}
                      onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, parsel: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                    >
                      {PARSEL_LIST.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">BLOK</label>
                    <select
                      value={editDeliveryForm.blok}
                      onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, blok: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                    >
                      {blokListForParsel(editDeliveryForm.parsel).map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 font-sans">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">DAİRE NO</label>
                    <input 
                      type="text"
                      value={editDeliveryForm.daireNo}
                      onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, daireNo: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold block uppercase">TESLİM TARİHİ</label>
                    <input 
                      type="date"
                      value={editDeliveryForm.teslimTarihi}
                      onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, teslimTarihi: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1 font-sans">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">TAŞERON FİRMA</label>
                  <select
                    value={editDeliveryForm.taseronId}
                    onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, taseronId: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                  >
                    <option value="">-- ELLE GİRİŞ VEYA SEÇİN --</option>
                    {taseronlar.map((t) => (
                      <option key={t.id} value={t.id}>{t.unvan}</option>
                    ))}
                  </select>
                  {!editDeliveryForm.taseronId && (
                    <input 
                      type="text"
                      value={editDeliveryForm.manualTaseron}
                      onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, manualTaseron: e.target.value }))}
                      className="w-full mt-2 bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                    />
                  )}
                </div>

                <div className="space-y-1 font-sans">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">MUHATAP PERSONEL</label>
                  <input 
                    type="text"
                    value={editDeliveryForm.muhatapPersonel}
                    onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, muhatapPersonel: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-blue-400 focus:bg-white outline-none font-bold text-slate-800"
                  />
                </div>

                <div className="space-y-2 font-sans">
                  <label className="text-[10px] text-slate-500 font-bold block uppercase">TESLİM FOTOĞRAFI</label>
                  {editDeliveryForm.teslimFoto ? (
                    <div className="relative w-32 aspect-video border rounded-xl overflow-hidden bg-slate-100">
                      <img src={editDeliveryForm.teslimFoto} alt="teslim" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setEditDeliveryForm(prev => ({ ...prev, teslimFoto: '' }))}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-32 aspect-video border border-dashed rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-white">
                      <Camera size={18} className="text-slate-400" />
                      <input type="file" accept="image/*" onChange={(e) => handleFotoUpload(e, 'edit_teslim')} className="hidden" />
                    </label>
                  )}
                </div>

                {/* Return values if already returned */}
                {editDeliveryForm.durum !== 'TESLİM EDİLDİ' && (
                  <div className="border-t pt-4 space-y-4 font-sans">
                    <h4 className="text-[10px] font-black text-emerald-600 block uppercase">İADE TESLİM DETAYLARI</h4>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold block uppercase">İADE ALMA TARİHİ</label>
                      <input 
                        type="date"
                        value={editDeliveryForm.iadeTarihi}
                        onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, iadeTarihi: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:border-emerald-400 focus:bg-white outline-none font-bold text-slate-800"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-450 block uppercase font-bold">İADE FOTOĞRAFI</label>
                      {editDeliveryForm.iadeFoto ? (
                        <div className="relative w-32 aspect-video border rounded-xl overflow-hidden bg-slate-100">
                          <img src={editDeliveryForm.iadeFoto} alt="iade" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setEditDeliveryForm(prev => ({ ...prev, iadeFoto: '' }))}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <label className="w-32 aspect-video border border-dashed rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-white">
                          <Camera size={18} className="text-slate-400" />
                          <input type="file" accept="image/*" onChange={(e) => handleFotoUpload(e, 'edit_iade')} className="hidden" />
                        </label>
                      )}
                    </div>

                    {/* Damage */}
                    <div className="flex items-center space-x-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <input 
                        type="checkbox"
                        id="editHasDamageCheckbox"
                        checked={editDeliveryForm.hasDamage}
                        onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, hasDamage: e.target.checked }))}
                        className="w-4 h-4 rounded text-red-500 border-slate-300"
                      />
                      <label htmlFor="editHasDamageCheckbox" className="text-xs font-black text-red-500 cursor-pointer uppercase select-none">
                        Hasar Var (Ceza Tutanağı Ekle/Güncelle)
                      </label>
                    </div>

                    {editDeliveryForm.hasDamage && (
                      <div className="space-y-3.5 border border-red-200 bg-red-50/50 p-4 rounded-2xl">
                        <div className="space-y-1">
                          <label className="text-[10px] text-red-600 block uppercase font-bold">HASAR DETAYI</label>
                          <textarea
                            value={editDeliveryForm.damageDescription}
                            onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, damageDescription: e.target.value }))}
                            className="w-full bg-white border border-slate-250 px-3 py-2 text-xs rounded-xl focus:border-red-400 outline-none font-bold text-slate-800 h-20"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-red-600 block uppercase font-bold">CEZA TUTARI (TL)</label>
                          <input 
                            type="number"
                            value={editDeliveryForm.penaltyAmount || ''}
                            onChange={(e) => setEditDeliveryForm(prev => ({ ...prev, penaltyAmount: Number(e.target.value) }))}
                            className="w-full bg-white border border-slate-250 px-3 py-2 text-xs rounded-xl focus:border-red-400 outline-none font-bold text-slate-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSaveEditDelivery}
                  disabled={isSavingEditDelivery}
                  className="w-full bg-[#2563EB] hover:bg-blue-600 text-white font-black text-xs py-3 rounded-2xl transition cursor-pointer shadow-md"
                >
                  {isSavingEditDelivery ? 'KAYDEDİLİYOR...' : 'DEĞİŞİKLİKLERİ KAYDET'}
                </button>
              </div>
            )}

            {/* 📋 Historic closed deliveries list */}
            {!showNewDelivery && !returnAction.delivery && !editingDelivery && (
              <div className="space-y-2">
                <h4 className="text-[10px] text-slate-500 font-bold tracking-wider block uppercase mt-2 font-sans">
                  GEÇMİŞ TESLİMATLAR
                </h4>

                {deliveries.filter(d => d.durum !== 'TESLİM EDİLDİ').length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4 bg-white border border-slate-200 rounded-3xl">Henüz tamamlanan bir teslimat bulunmuyor.</p>
                ) : (
                  deliveries.filter(d => d.durum !== 'TESLİM EDİLDİ').slice(0, 10).map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xs animate-fadeIn font-sans">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`text-[8px] border px-2 py-0.5 rounded-md font-bold uppercase ${
                            item.durum === 'SORUNSUZ İADE ALINDI' 
                              ? 'border-emerald-500/20 bg-emerald-50 text-emerald-700' 
                              : 'border-rose-500/20 bg-rose-50 text-rose-700'
                          }`}>
                            {item.durum === 'SORUNSUZ İADE ALINDI' ? 'Sorunsuz' : 'Hasarlı'}
                          </span>
                          <h5 className="font-extrabold text-slate-850 text-xs mt-2">{item.parsel} - {item.blok} / D. {item.daireNo}</h5>
                          <p className="text-[9px] text-slate-500 mt-0.5">Taşeron: {item.taseronAdi} | İade Tarihi: {item.iadeTarihi || item.teslimTarihi}</p>
                        </div>
                        
                        <div className="flex gap-1 shrink-0 bg-slate-50 p-1 rounded-lg">
                          {item.teslimFoto && <img src={item.teslimFoto} alt="teslim" className="w-8 h-8 rounded border object-cover" title="Teslim Foto" />}
                          {item.iadeFoto && <img src={item.iadeFoto} alt="iade" className="w-8 h-8 rounded border object-cover" title="İade Foto" />}
                        </div>
                      </div>

                      {item.durum === 'HASARLI İADE ALINDI' && item.hasarAciklamasi && (
                        <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800">
                          <span className="font-bold text-[8px] uppercase text-rose-600 block mb-0.5">Hasar &amp; Ceza Detayı (Ceza: ₺{item.cezaTutari?.toLocaleString()})</span>
                          <p className="italic leading-normal">{item.hasarAciklamasi}</p>
                        </div>
                      )}

                      <div className="flex gap-2 justify-end border-t border-slate-100 pt-2.5">
                        <button
                          onClick={() => handleEditDelivery(item)}
                          className="flex items-center gap-1 bg-blue-50 hover:bg-blue-105 border border-blue-200 text-[#2563EB] text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition"
                        >
                          <Edit2 size={11} /> Düzenle
                        </button>
                        <button
                          onClick={() => handleDeleteDelivery(item)}
                          className="flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition"
                        >
                          <Trash2 size={11} /> Sil
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
};
