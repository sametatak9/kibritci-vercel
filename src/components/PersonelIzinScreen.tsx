import React, { useState, useEffect } from 'react';
import {
  FileText, Trash2, Eye, Printer, Search, Edit3, Landmark, Check, X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { CorporateReportLayout } from './CorporateReportLayout';
import { collection, query, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { HazirTutanakTab } from './HazirTutanakTab';
import { ReportEmailButton } from './ReportEmailButton';

interface IzinFormu {
  id: string;
  tarih: string;
  personelId: string;
  personelIsim: string;
  unvan: string;
  izinTipi: 'YILLIK_IZIN' | 'MAZERET_IZINI' | 'SAGLIK_IZINI' | 'UCRETSIZ_IZIN' | 'DİĞER';
  baslangicTarihi: string;
  bitisTarihi: string;
  toplamGun: number;
  aciklama: string;
  onayDurumu: 'ONAY BEKLİYOR' | 'ONAYLANDI' | 'REDDEDİLDİ';
  onaylayanYonetici?: string;
  onayTarihi?: string;
  onayStamp?: string;
}

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  gorev: string;
}

interface PersonelIzinScreenProps {
  personeller: Personel[];
  currentUser: any;
  hazirTutanaklar?: any[];
  setHazirTutanaklar?: any;
  cariKartlar?: any[];
  stokKartlar?: any[];
  setCariIslemGecmisi?: any;
}

export const PersonelIzinScreen: React.FC<PersonelIzinScreenProps> = ({ 
  personeller, 
  currentUser,
  hazirTutanaklar = [], 
  setHazirTutanaklar,
  cariKartlar = [],
  stokKartlar = [],
  setCariIslemGecmisi,
}) => {
  const [activeTab, setActiveTab] = useState<'izin' | 'tutanak'>('izin');
  
  const [izinFormlari, setIzinFormlari] = useState<IzinFormu[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedPersonelId, setSelectedPersonelId] = useState('');
  const [isManualPersonnel, setIsManualPersonnel] = useState(false);
  const [manualNameInput, setManualNameInput] = useState('');
  const [manualUnvanInput, setManualUnvanInput] = useState('');
  const [izinTipi, setIzinTipi] = useState<'YILLIK_IZIN' | 'MAZERET_IZINI' | 'SAGLIK_IZINI' | 'UCRETSIZ_IZIN' | 'DİĞER'>('YILLIK_IZIN');
  const [baslangicTarihi, setBaslangicTarihi] = useState('');
  const [bitisTarihi, setBitisTarihi] = useState('');
  const [toplamGun, setToplamGun] = useState<number>(1);
  const [aciklama, setAciklama] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIzinForPdf, setSelectedIzinForPdf] = useState<IzinFormu | null>(null);
  const [editingIzinId, setEditingIzinId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-calculate difference in days
  useEffect(() => {
    if (baslangicTarihi && bitisTarihi) {
      const d1 = new Date(baslangicTarihi);
      const d2 = new Date(bitisTarihi);
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0) {
        setToplamGun(diffDays);
      } else {
        setToplamGun(1);
      }
    }
  }, [baslangicTarihi, bitisTarihi]);

  const resetForm = () => {
    setEditingIzinId(null);
    setSelectedPersonelId('');
    setIsManualPersonnel(false);
    setManualNameInput('');
    setManualUnvanInput('');
    setIzinTipi('YILLIK_IZIN');
    setAciklama('');
    setBaslangicTarihi('');
    setBitisTarihi('');
    setToplamGun(1);
  };

  const startEditIzin = (item: IzinFormu) => {
    setEditingIzinId(item.id);
    setIzinTipi(item.izinTipi);
    setBaslangicTarihi(item.baslangicTarihi || '');
    setBitisTarihi(item.bitisTarihi || '');
    setToplamGun(item.toplamGun || 1);
    setAciklama(item.aciklama || '');

    const inKadro = personeller.some((p) => p.id === item.personelId);
    if (inKadro) {
      setIsManualPersonnel(false);
      setSelectedPersonelId(item.personelId);
      setManualNameInput('');
      setManualUnvanInput('');
    } else {
      setIsManualPersonnel(true);
      setSelectedPersonelId('');
      setManualNameInput(item.personelIsim || '');
      setManualUnvanInput(item.unvan || '');
    }

    setActiveTab('izin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fetch from Firebase
  useEffect(() => {
    async function fetchIzınFormlari() {
      try {
        setLoading(true);
        const colRef = collection(db, 'personelIzinFormlari');
        const snap = await getDocs(colRef);
        const list: IzinFormu[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() } as IzinFormu);
        });
        
        if (list.length === 0) {
          // Add default fallback item if empty
          const sample: IzinFormu = {
            id: 'sample_1',
            tarih: '2026-06-18',
            personelId: personeller[0]?.id || 'p_1',
            personelIsim: personeller[0] ? `${personeller[0].ad} ${personeller[0].soyad}` : 'Ayhan Yılmaz',
            unvan: personeller[0]?.gorev || 'Kule Vinç Operatörü',
            izinTipi: 'YILLIK_IZIN',
            baslangicTarihi: '2026-07-01',
            bitisTarihi: '2026-07-07',
            toplamGun: 6,
            aciklama: 'Yaz dönemi memleket ziyareti ve aile tatili.',
            onayDurumu: 'ONAY BEKLİYOR'
          };
          setIzinFormlari([sample]);
          await setDoc(doc(db, 'personelIzinFormlari', sample.id), sample);
        } else {
          setIzinFormlari(list);
        }
      } catch (err) {
        console.warn("Could not load izin formlari from cloud, using offline state: ", err);
        // offline fallback
        setIzinFormlari([
          {
            id: 'sample_1',
            tarih: '2026-06-18',
            personelId: personeller[0]?.id || 'p_1',
            personelIsim: personeller[0] ? `${personeller[0].ad} ${personeller[0].soyad}` : 'Ayhan Yılmaz',
            unvan: personeller[0]?.gorev || 'Kule Vinç Operatörü',
            izinTipi: 'YILLIK_IZIN',
            baslangicTarihi: '2026-07-01',
            bitisTarihi: '2026-07-07',
            toplamGun: 6,
            aciklama: 'Yaz dönemi memleket ziyareti ve aile tatili.',
            onayDurumu: 'ONAY BEKLİYOR'
          }
        ]);
      } finally {
        setLoading(false);
      }
    }
    fetchIzınFormlari();
  }, [personeller]);

  const handleSaveIzinFormu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!isManualPersonnel && !selectedPersonelId) {
      alert('Lütfen izne çıkacak personeli seçin!');
      return;
    }
    if (isManualPersonnel && !manualNameInput.trim()) {
      alert('Lütfen personel adını girin!');
      return;
    }
    if (!baslangicTarihi || !bitisTarihi) {
      alert('Lütfen izin başlangıç ve bitiş tarihlerini girin!');
      return;
    }
    if (new Date(bitisTarihi) < new Date(baslangicTarihi)) {
      alert('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }

    let pId = selectedPersonelId;
    let pName = '';
    let pUnvan = '';

    if (isManualPersonnel) {
      const existing = editingIzinId
        ? izinFormlari.find((x) => x.id === editingIzinId)
        : undefined;
      pId = existing?.personelId?.startsWith('manual_')
        ? existing.personelId
        : `manual_${Date.now()}`;
      pName = manualNameInput.trim();
      pUnvan = manualUnvanInput.trim() || 'Serbest Giriş Kadrosu';
    } else {
      const matchedPers = personeller.find((p) => p.id === selectedPersonelId);
      if (!matchedPers) {
        alert('Seçilen personel bulunamadı. Listeyi yenileyip tekrar deneyin.');
        return;
      }
      pName = `${matchedPers.ad} ${matchedPers.soyad}`;
      pUnvan = matchedPers.gorev;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const existing = editingIzinId
      ? izinFormlari.find((x) => x.id === editingIzinId)
      : undefined;

    // Dijital e-imza alanları bilinçli yazılmaz; setDoc (merge yok) eski stamp'i siler
    const payload: IzinFormu = {
      id: editingIzinId || `iz_${Date.now()}`,
      tarih: existing?.tarih || todayStr,
      personelId: pId,
      personelIsim: pName,
      unvan: pUnvan,
      izinTipi,
      baslangicTarihi,
      bitisTarihi,
      toplamGun: Number(toplamGun) > 0 ? Number(toplamGun) : 1,
      aciklama: aciklama.trim(),
      onayDurumu: 'ONAY BEKLİYOR',
    };

    setSaving(true);
    try {
      await setDoc(doc(db, 'personelIzinFormlari', payload.id), payload);
      setIzinFormlari((prev) => {
        const idx = prev.findIndex((x) => x.id === payload.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = payload;
          return next;
        }
        return [payload, ...prev];
      });
      if (selectedIzinForPdf?.id === payload.id) {
        setSelectedIzinForPdf(payload);
      }
      alert(
        editingIzinId
          ? 'İzin formu güncellendi ve kaydedildi.'
          : 'Personel İzin Talep Formu başarıyla oluşturuldu.'
      );
      resetForm();
    } catch (err) {
      console.error('İzin kaydetme hatası:', err);
      alert(
        'Kaydetme işlemi sırasında hata oluştu. İnternet bağlantınızı kontrol edip tekrar deneyin.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIzinFormu = async (id: string) => {
    if (!window.confirm('Bu izin formunu sistemden kalıcı olarak silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'personelIzinFormlari', id));
      setIzinFormlari((prev) => prev.filter((x) => x.id !== id));
      if (editingIzinId === id) resetForm();
      if (selectedIzinForPdf?.id === id) setSelectedIzinForPdf(null);
      alert('İzin talep formu başarıyla silindi.');
    } catch (err) {
      console.error(err);
      alert('Silme işlemi başarısız.');
    }
  };

  const handleApproveIzin = async (item: IzinFormu) => {
    if (item.onayDurumu === 'ONAYLANDI') return;
    if (!window.confirm(`${item.personelIsim} için izin belgesini onaylamak istiyor musunuz?`)) return;
    try {
      const patch = {
        onayDurumu: 'ONAYLANDI' as const,
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'personelIzinFormlari', item.id), patch);
      setIzinFormlari((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      // İzinli personeller yoklama/puantaja girmez; belge yalnızca personel kartı arşivinde saklanır.
      alert('İzin belgesi onaylandı ve personel arşivine kaydedildi.');
    } catch (err) {
      console.error(err);
      alert('Onay işlemi başarısız.');
    }
  };

  const handleRejectIzin = async (item: IzinFormu) => {
    if (item.onayDurumu === 'REDDEDİLDİ') return;
    if (!window.confirm('Bu izin talebini reddetmek istediğinize emin misiniz?')) return;
    try {
      const patch = {
        onayDurumu: 'REDDEDİLDİ' as const,
        onaylayanYonetici: currentUser?.email || 'Yönetici',
        onayTarihi: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'personelIzinFormlari', item.id), patch);
      setIzinFormlari((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      alert('İzin talebi reddedildi.');
    } catch (err) {
      console.error(err);
      alert('Red işlemi başarısız.');
    }
  };

  const filteredIzinler = izinFormlari.filter(item => {
    const q = searchQuery.toLowerCase();
    return item.personelIsim.toLowerCase().includes(q) || 
           item.unvan.toLowerCase().includes(q) || 
           item.aciklama.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 font-sans">
      
      {/* Upper header card */}
      <div className="bg-white p-5 border-b border-[#e2e8f0] flex justify-between items-center shrink-0 shadow-sm relative z-10">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 bg-[#e2e8f0] rounded-xl flex items-center justify-center text-slate-800 shadow-sm">
            <FileText size={20} className="text-[#10b981]" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-widest uppercase">📋 PERSONEL RESMİ İZİN DURUM FORMU</h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Şantiye personeli yıllık, mazeret, sağlık onay ve talep süreçleri</p>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center space-x-1 mb-0 border-b border-slate-200 bg-white px-6 pt-2">
        <button
          onClick={() => setActiveTab('izin')}
          className={`px-4 py-2.5 text-xs font-bold transition border-b-2 ${
            activeTab === 'izin' 
              ? 'border-[#10b981] text-[#059669] bg-emerald-50/50' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Personel İzin Formları
        </button>
        <button
          onClick={() => setActiveTab('tutanak')}
          className={`px-4 py-2.5 text-xs font-bold transition border-b-2 ${
            activeTab === 'tutanak' 
              ? 'border-[#10b981] text-[#059669] bg-emerald-50/50' 
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Hazır Tutanaklar
        </button>
      </div>

      {activeTab === 'izin' && (
        <div className="flex-grow overflow-hidden flex flex-col lg:flex-row p-6 gap-6 relative">
        
        {/* Left Side: Create form card */}
        <div className="w-full lg:w-[410px] bg-white border border-[#e2e8f0] rounded-2xl p-5 flex flex-col overflow-y-auto shrink-0 shadow-sm">
          <div className="border-b pb-3 mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display font-black text-xs text-slate-800 uppercase tracking-widest flex items-center gap-1.5 focus:outline-none">
                <span>{editingIzinId ? '✏️ İzin Formunu Düzenle' : '✍️ Yeni İzin Formu Aç'}</span>
              </h3>
              <p className="text-[9px] text-slate-400 mt-0.5 uppercase font-mono">
                {editingIzinId
                  ? 'Değişiklikleri kaydedin — onay yalnızca Şantiye Şefi ıslak imza ile'
                  : 'Resmi şantiye şefi ıslak imza ile onaylanır'}
              </p>
            </div>
            {editingIzinId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline shrink-0"
              >
                Vazgeç
              </button>
            )}
          </div>

          <form onSubmit={handleSaveIzinFormu} className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">🔍 Personel Seçimi *</label>
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-[9px] font-bold border">
                  <button
                    type="button"
                    onClick={() => setIsManualPersonnel(false)}
                    className={`px-2 py-0.5 rounded transition ${!isManualPersonnel ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Kadro Listesi
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManualPersonnel(true)}
                    className={`px-2 py-0.5 rounded transition ${isManualPersonnel ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Serbest Giriş ✍️
                  </button>
                </div>
              </div>

              {!isManualPersonnel ? (
                <select 
                  required={!isManualPersonnel}
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-xl focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  value={selectedPersonelId}
                  onChange={(e) => setSelectedPersonelId(e.target.value)}
                >
                  <option value="">Lütfen listeden çalışan seçin</option>
                  {personeller.map(p => (
                    <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2 mt-1.5 p-3.5 bg-emerald-50/40 rounded-xl border border-dashed border-emerald-300">
                  <div>
                    <label className="text-[9px] font-bold text-emerald-800 block uppercase mb-1">Personel Adı Soyadı *</label>
                    <input 
                      type="text"
                      required={isManualPersonnel}
                      placeholder="Örn: Mehmet Can"
                      className="w-full text-xs font-bold p-2 bg-white border rounded-lg focus:ring-1 focus:ring-emerald-500"
                      value={manualNameInput}
                      onChange={(e) => setManualNameInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-emerald-800 block uppercase mb-1">Görevi / Unvanı</label>
                    <input 
                      type="text"
                      placeholder="Örn: Kalıp Ustası"
                      className="w-full text-xs font-semibold p-2 bg-white border rounded-lg focus:ring-1 focus:ring-emerald-500"
                      value={manualUnvanInput}
                      onChange={(e) => setManualUnvanInput(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">📌 İzin Tipi *</label>
              <select 
                required
                className="w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-xl focus:ring-1 focus:ring-emerald-500"
                value={izinTipi}
                onChange={(e) => setIzinTipi(e.target.value as any)}
              >
                <option value="YILLIK_IZIN">Yıllık Ücretli İzin</option>
                <option value="MAZERET_IZINI">Mazeret İzni (Ücretli)</option>
                <option value="SAGLIK_IZINI">Sağlık / Rapor İzni</option>
                <option value="UCRETSIZ_IZIN">Ücretsiz İzin</option>
                <option value="DİĞER">Diğer / Hususi İzin</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">📅 İzin Başlangıç *</label>
                <input 
                  type="date" 
                  required
                  className="w-full text-xs font-semibold p-2.5 bg-slate-50 border rounded-xl focus:ring-1 focus:ring-emerald-500"
                  value={baslangicTarihi}
                  onChange={(e) => setBaslangicTarihi(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">📅 İzin Bitiş *</label>
                <input 
                  type="date" 
                  required
                  className="w-full text-xs font-semibold p-2.5 bg-slate-50 border rounded-xl focus:ring-1 focus:ring-emerald-500"
                  value={bitisTarihi}
                  onChange={(e) => setBitisTarihi(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">🔢 Toplam İzin Günü *</label>
              <input 
                type="number" 
                min="1"
                required
                className="w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-xl focus:ring-1 focus:ring-emerald-500"
                value={toplamGun}
                onChange={(e) => setToplamGun(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">💬 Açıklama / Adres</label>
              <textarea 
                className="w-full text-xs font-semibold p-2.5 bg-slate-50 border rounded-xl focus:ring-1 focus:ring-emerald-500 min-h-[60px]"
                rows={3}
                placeholder="İzin gerekçesi, gidilecek şehir ve iletişim kanalları..."
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#10b981] hover:bg-[#059669] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer transition flex items-center justify-center space-x-1"
            >
              <span>
                {saving
                  ? 'Kaydediliyor...'
                  : editingIzinId
                    ? '✓ Değişiklikleri Kaydet / Güncelle'
                    : '+ İzin Talep Dilekçesi Kaydet'}
              </span>
            </button>
          </form>
        </div>

        {/* Right Side: Grid list columns */}
        <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Landmark size={15} className="text-[#10b981]" />
              <h4 className="font-display font-bold text-xs text-slate-800 uppercase tracking-widest">Sistem İzin Belgeleri Arşivi</h4>
            </div>
            <div className="relative w-48">
              <input 
                type="text" 
                placeholder="Personel veya Açıklama ara..." 
                className="w-full bg-white pl-8 pr-3 py-1.5 border rounded-lg text-[11px] focus:ring-1 focus:ring-[#10b981]" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {loading ? (
              <div className="text-center p-10 text-slate-550 font-medium">Veriler yükleniyor...</div>
            ) : filteredIzinler.length === 0 ? (
              <div className="text-center p-10 text-slate-550 font-bold italic">Sistemde izin kaydı veya eşleşen veri bulunamadı.</div>
            ) : (
              filteredIzinler.map(item => (
                <div key={item.id} className="border rounded-xl p-4 bg-white shadow-inner flex flex-col justify-between hover:border-emerald-355 transition">
                  <div className="flex justify-between items-start border-b pb-2 mb-2 text-xs">
                    <div>
                      <h5 className="font-black text-slate-900 text-sm">{item.personelIsim}</h5>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{item.unvan}</p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-full uppercase ${
                        item.onayDurumu === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' :
                        item.onayDurumu === 'REDDEDİLDİ' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.onayDurumu === 'ONAYLANDI'
                          ? '✓ Şantiye Şefi Onaylı (Islak)'
                          : item.onayDurumu === 'REDDEDİLDİ'
                            ? '✖ Reddedildi'
                            : '⌛ Şantiye Şefi Islak İmza Bekliyor'}
                      </span>
                      <span className="text-[9px] text-[#10b981] font-mono font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-150 rounded px-1.5 mt-0.5">{item.izinTipi.replace('_', ' ')}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                      <div className="bg-slate-50 p-1.5 rounded text-center">
                        <span className="text-slate-400 block text-[8px] uppercase font-mono">ÇIKIŞ TARİHİ</span>
                        <strong className="text-slate-800">{item.baslangicTarihi}</strong>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded text-center">
                        <span className="text-slate-400 block text-[8px] uppercase font-mono">DÖNÜŞ TARİHİ</span>
                        <strong className="text-slate-800">{item.bitisTarihi}</strong>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded text-center">
                        <span className="text-slate-400 block text-[8px] uppercase font-mono">TOPLAM GÜN</span>
                        <strong className="text-emerald-850 font-bold">{item.toplamGun} FİİLİ GÜN</strong>
                      </div>
                    </div>

                    <p className="text-slate-650 leading-relaxed italic bg-emerald-50/20 p-2.5 rounded border border-emerald-500/10 text-[11px] block text-slate-600">
                      <strong>İzin Gerekçesi / Adres:</strong> {item.aciklama || 'Belirtilmedi'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-3.5 mt-3 justify-end text-[10px]">
                    {item.onayDurumu === 'ONAY BEKLİYOR' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleApproveIzin(item)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 cursor-pointer"
                        >
                          <Check size={12} />
                          <span>Onayla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRejectIzin(item)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 cursor-pointer"
                        >
                          <X size={12} />
                          <span>Reddet</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditIzin(item)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 cursor-pointer"
                    >
                      <Edit3 size={12} />
                      <span>Düzenle / Güncelle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIzinForPdf(item)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 cursor-pointer"
                    >
                      <Eye size={12} />
                      <span>PDF Formu Gör / Yazdır</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteIzinFormu(item.id)}
                      className="text-red-800 bg-red-50 hover:bg-red-100 py-1 px-2 rounded cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      )}

      {activeTab === 'tutanak' && (
        <div className="flex-grow p-6 h-[calc(100vh-210px)]">
          <HazirTutanakTab 
            hazirTutanaklar={hazirTutanaklar}
            setHazirTutanaklar={setHazirTutanaklar}
            personeller={personeller as any}
            cariKartlar={cariKartlar}
            stokKartlar={stokKartlar}
            setCariIslemGecmisi={setCariIslemGecmisi}
          />
        </div>
      )}

      {/* 🏡 PDF / ONIZLEME MODAL */}
      {selectedIzinForPdf && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-[700px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-900 text-white p-4 font-bold flex justify-between items-center text-xs">
              <span>📋 Resmi Personel İzin Onay Formu Yazdır</span>
              <button onClick={() => setSelectedIzinForPdf(null)} className="text-slate-400 hover:text-white cursor-pointer select-none">✖</button>
            </div>

            <div className="flex-grow overflow-y-auto p-8 bg-[#f8fafc]">
              <div id="izin-print-area" className="bg-white p-8 border rounded-2xl shadow-sm text-slate-800 relative">
                <CorporateReportLayout
                  orientation="portrait"
                  docCode={`Belge No: IZIN-2026-${selectedIzinForPdf.id.split('_')[1] || '01'}`}
                  printDate={selectedIzinForPdf.tarih}
                >
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-4">RESMİ PERSONEL İZİN TALEP VE ONAY FORMU</p>

                {/* Body Table Details */}
                <div className="border rounded-2xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <tbody>
                      <tr className="bg-slate-50 border-b">
                        <td className="p-3 font-bold text-slate-500 w-44">İznin Çıkan Personel:</td>
                        <td className="p-3 font-semibold text-slate-800">{selectedIzinForPdf.personelIsim}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3 font-bold text-slate-500">Unvan ve Görev:</td>
                        <td className="p-3 font-semibold text-slate-800">{selectedIzinForPdf.unvan}</td>
                      </tr>
                      <tr className="bg-slate-50 border-b">
                        <td className="p-3 font-bold text-slate-500">İzin Türü:</td>
                        <td className="p-3 font-extrabold text-[#10b981]">{selectedIzinForPdf.izinTipi.replace('_', ' ')}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3 font-bold text-slate-500">Başlangıç ve Bitiş:</td>
                        <td className="p-3 font-bold text-slate-800">{selectedIzinForPdf.baslangicTarihi} ile {selectedIzinForPdf.bitisTarihi} Tarihleri Arası</td>
                      </tr>
                      <tr className="bg-slate-50 border-b">
                        <td className="p-3 font-bold text-slate-500">Toplam İzin Süresi:</td>
                        <td className="p-3 font-black text-rose-800">{selectedIzinForPdf.toplamGun} FİİLİ İŞ GÜNÜ</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-slate-500">Gerekçe / Adres / Tel:</td>
                        <td className="p-3 font-semibold text-slate-600 block whitespace-pre-wrap">{selectedIzinForPdf.aciklama || "Yok"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Sub signatures — yalnızca ıslak imza; dijital e-imza yok */}
                <div className="grid grid-cols-2 gap-8 pt-8 border-t text-xs">
                  <div className="text-center space-y-4">
                    <p className="font-bold text-slate-500 border-b pb-1 uppercase">İzin Talep Eden Personel</p>
                    <p className="text-slate-400 pt-6">Soyadı, Adı ve İmzası için Islak Alan</p>
                    <div className="h-0.5 bg-slate-200 w-32 mx-auto mt-2"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">PERSONEL GÖREV İMZASI</span>
                  </div>
                  <div className="text-center space-y-4">
                    <p className="font-bold text-slate-500 border-b pb-1 uppercase">Şantiye Şefi Onay Makamı</p>
                    <p className="text-slate-400 pt-6">Soyadı, Adı ve İmzası için Islak Alan</p>
                    <div className="h-0.5 bg-slate-200 w-32 mx-auto mt-2"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">ŞANTİYE ŞEFİ</span>
                  </div>
                </div>

                </CorporateReportLayout>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex flex-wrap justify-end gap-3 shrink-0">
              <ReportEmailButton
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1 cursor-pointer"
                payload={() => {
                  const printContent = document.getElementById('izin-print-area')?.innerHTML || '';
                  const htmlSnippet = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>İzin Formu</title><script src="https://cdn.tailwindcss.com"><\/script></head><body class="bg-white p-8">${printContent}</body></html>`;
                  return {
                    subject: `Kibritçi — Personel İzin Formu — ${selectedIzinForPdf.personelIsim}`,
                    body: `Personel: ${selectedIzinForPdf.personelIsim}\nUnvan: ${selectedIzinForPdf.unvan}\nİzin: ${selectedIzinForPdf.izinTipi}\nTarih: ${selectedIzinForPdf.baslangicTarihi} – ${selectedIzinForPdf.bitisTarihi}\nGün: ${selectedIzinForPdf.toplamGun}\nAçıklama: ${selectedIzinForPdf.aciklama || '-'}`,
                    html: htmlSnippet,
                    fileName: `Kibritci_IzinFormu_${selectedIzinForPdf.personelIsim.replace(/\s+/g, '_')}.html`,
                  };
                }}
              />
              <button 
                onClick={() => {
                  const printContent = document.getElementById('izin-print-area')?.innerHTML;
                  if (!printContent) return;
                  const htmlSnippet = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kibritci_Insaat_Personel_Izni_${selectedIzinForPdf.personelIsim.replace(/\s+/g, '_')}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white p-8">
  <div class="max-w-3xl mx-auto border p-8 rounded-2xl shadow-sm">
    ${printContent}
  </div>
  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
                  `;
                  try {
                    const win = window.open("", "_blank");
                    if (win) {
                      win.document.write(htmlSnippet);
                      win.document.close();
                    } else {
                      throw new Error("Popup blocked");
                    }
                  } catch (err) {
                    const blob = new Blob([htmlSnippet], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `Kibritci_IzinFormu_${selectedIzinForPdf.personelIsim.replace(/\s+/g, '_')}.html`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
                className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1 cursor-pointer"
              >
                <Printer size={13} />
                <span>Yazdır / PDF Raporu Al</span>
              </button>
              <button 
                onClick={() => setSelectedIzinForPdf(null)}
                className="bg-slate-205 hover:bg-slate-300 text-slate-800 font-bold text-xs py-2 px-4 rounded-xl cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
