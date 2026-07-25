import React, { useEffect, useMemo, useState } from 'react';
import { 
  Users, User, Phone, Mail, MapPin, Calendar, CreditCard, 
  Truck, Tent, Clock, ClipboardList, Sparkles, ChevronRight, Activity, FileSpreadsheet
} from 'lucide-react';
import { Personel, AylikYoklamaMap, AracBakim, KampKaydi, KampOdasi, HazirTutanak, KasaHareketi, SahaFaaliyeti } from '../types/erp';
import { getYoklamaDay, iterateMonthYoklama, isDayActiveForPersonel, asYoklamaGunMap, parseYoklamaDateKey } from '../lib/yoklamaUtils';
import { PersonelIdCard } from './PersonelIdCard';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface PersonelIzinBelgesi {
  id: string;
  personelId: string;
  personelIsim?: string;
  izinTipi?: string;
  baslangicTarihi?: string;
  bitisTarihi?: string;
  toplamGun?: number;
  aciklama?: string;
  onayDurumu?: string;
}

interface PersonelKartlariScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  araclar: AracBakim[];
  kampKayitlari: KampKaydi[];
  kampOdalari: KampOdasi[];
  hazirTutanaklar?: HazirTutanak[];
  kasaHareketleri?: KasaHareketi[];
  sahaFaaliyetleri?: SahaFaaliyeti[];
}

export const PersonelKartlariScreen: React.FC<PersonelKartlariScreenProps> = ({
  personeller,
  yoklamalar,
  araclar,
  kampKayitlari,
  kampOdalari,
  hazirTutanaklar = [],
  kasaHareketleri = [],
  sahaFaaliyetleri = []
}) => {
  const [selectedPersId, setSelectedPersId] = useState<string>(personeller[0]?.id || "");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [firmaFilter, setFirmaFilter] = useState<string>('HEPSI');
  const [durumFilter, setDurumFilter] = useState<'AKTIF' | 'HEPSI'>('AKTIF');

  const isPersonelAktif = (p: Personel) => p.durum === true || String(p.durum) === 'true';
  const getFirmaLabel = (p: Personel): string =>
    p.firmaTipi === 'TASERON' ? (p.firmaAdi?.trim() || 'Taşeron (Diğer)') : 'Kibritçi İnşaat';

  const firmaOptions = useMemo(() => {
    const set = new Set<string>();
    personeller.forEach((p) => set.add(getFirmaLabel(p)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [personeller]);

  const filteredPersoneller = useMemo(() => {
    return personeller.filter((p) => {
      if (durumFilter === 'AKTIF' && !isPersonelAktif(p)) return false;
      if (firmaFilter !== 'HEPSI' && getFirmaLabel(p) !== firmaFilter) return false;
      return true;
    });
  }, [personeller, durumFilter, firmaFilter]);

  // Seçili personel filtre dışında kalırsa listenin ilkine geç
  useEffect(() => {
    if (!filteredPersoneller.some((p) => p.id === selectedPersId)) {
      setSelectedPersId(filteredPersoneller[0]?.id || '');
    }
  }, [filteredPersoneller, selectedPersId]);

  const selectedPersonnel = personeller.find(p => p.id === selectedPersId);

  // Remaining receivables math
  const getReceivableDetails = (p: Personel) => {
    const pYoklama = yoklamalar[p.id] || {};
    let workedDays = 0;
    iterateMonthYoklama(pYoklama, selectedYear, selectedMonth, (day, d) => {
      if (d?.durum === 'Geldi' && isDayActiveForPersonel(p, selectedYear, selectedMonth, day, pYoklama)) {
        workedDays += 1;
      }
    });
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dailyWage = p.maas / Math.max(1, daysInMonth);
    const grossEarned = workedDays * dailyWage;

    // Check cash advances in kasa
    const personalAdvances = kasaHareketleri.filter(
      k => k.hareketTipi === 'ÇIKIŞ' && 
           k.referansTipi === 'MAAS' && 
           k.aciklama.toLowerCase().includes(p.ad.toLowerCase()) && 
           k.aciklama.toLowerCase().includes(p.soyad.toLowerCase())
    );
    const totalAvans = personalAdvances.reduce((acc, curr) => acc + curr.tutar, 0);
    const balance = Math.max(0, grossEarned - totalAvans);

    return {
      workedDays,
      grossEarned: Math.round(grossEarned),
      totalAvans: Math.round(totalAvans),
      balance: Math.round(balance)
    };
  };

  // Assigned vehicle
  const assignedVehicle = selectedPersonnel 
    ? araclar.find(a => a.sorumluPersonelId === selectedPersonnel.id) 
    : null;

  // Active camp room stay
  const activeStay = selectedPersonnel
    ? kampKayitlari.find(k => k.personelId === selectedPersonnel.id && k.durum === 'AKTIF')
    : null;
  const activeRoom = activeStay 
    ? kampOdalari.find(r => r.id === activeStay.odaId || r.id === activeStay.roomId)
    : null;

  const personelStayHistory = selectedPersonnel
    ? kampKayitlari
        .filter((k) => {
          if (k.personelId && k.personelId === selectedPersonnel.id) return true;
          return k.personelIsim.trim().toLowerCase() === `${selectedPersonnel.ad} ${selectedPersonnel.soyad}`.trim().toLowerCase();
        })
        .sort((a, b) => (b.girisTarihi || '').localeCompare(a.girisTarihi || ''))
    : [];

  // Leave records (from hazirTutanaklar or mock list)
  const leaveTutanaklar = selectedPersonnel
    ? hazirTutanaklar.filter(
        t => t.personelId === selectedPersonnel.id && t.tutanakTipi === 'TESLİM'
      )
    : [];

  // Personel izin formları (personelIzinFormlari koleksiyonundan — izin arşivi personel kartında görünür)
  const [izinBelgeleri, setIzinBelgeleri] = useState<PersonelIzinBelgesi[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'personelIzinFormlari'));
        if (cancelled) return;
        const list: PersonelIzinBelgesi[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<PersonelIzinBelgesi, 'id'>) }));
        setIzinBelgeleri(list);
      } catch (err) {
        console.warn('İzin belgeleri yüklenemedi:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const personelIzinBelgeleri = useMemo(() => {
    if (!selectedPersonnel) return [] as PersonelIzinBelgesi[];
    const fullName = `${selectedPersonnel.ad} ${selectedPersonnel.soyad}`.trim().toLocaleLowerCase('tr-TR');
    return izinBelgeleri
      .filter(
        (b) =>
          b.personelId === selectedPersonnel.id ||
          (b.personelIsim || '').trim().toLocaleLowerCase('tr-TR') === fullName
      )
      .sort((a, b) => String(b.baslangicTarihi || '').localeCompare(String(a.baslangicTarihi || '')));
  }, [izinBelgeleri, selectedPersonnel]);

  const sahaGorevKayitlari = useMemo(() => {
    if (!selectedPersonnel) return [] as Array<{ id: string; tarih?: string; islem?: string; detay?: string }>;
    const raw = ((selectedPersonnel as any).gecmis || []) as Array<{ id?: string; tarih?: string; islem?: string; detay?: string }>;
    return raw
      .filter((x) => String(x.islem || '').toLocaleLowerCase('tr-TR').includes('saha'))
      .map((x) => ({ id: x.id || `${x.tarih || ''}_${x.detay || ''}`, tarih: x.tarih, islem: x.islem, detay: x.detay }))
      .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr'));
  }, [selectedPersonnel]);

  const personelSahaFaaliyetleri = useMemo(() => {
    if (!selectedPersonnel) return [] as SahaFaaliyeti[];
    return sahaFaaliyetleri
      .filter((f) => {
        if (f.personelId === selectedPersonnel.id) return true;
        const fullName = `${selectedPersonnel.ad} ${selectedPersonnel.soyad}`.trim().toLowerCase();
        return (f.aktifPersonelListesi || []).some(
          (n) => String(n).trim().toLowerCase() === fullName
        );
      })
      .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr'));
  }, [selectedPersonnel, sahaFaaliyetleri]);

  const hasActiveCamp = !!(activeRoom || (activeStay && (activeStay.yerleskeAdi || activeStay.odaNo)));
  const showTahsisSection = !!(assignedVehicle || hasActiveCamp || personelStayHistory.length > 0);

  const exportPersonelDetayExcel = async () => {
    if (!selectedPersonnel) return;
    const p = selectedPersonnel;
    const { createExcelWorkbook } = await import('../lib/exceljsLoader');
    const wb = await createExcelWorkbook();
    const ws = wb.addWorksheet('Personel Detay');
    const addSection = (title: string) => {
      ws.addRow([]);
      const row = ws.addRow([title]);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    };
    const addHeader = (...cols: string[]) => {
      const row = ws.addRow(cols);
      row.font = { bold: true };
    };

    ws.addRow(['Personel Detay Raporu', `${p.ad} ${p.soyad}`]);
    ws.addRow(['Oluşturma', new Date().toLocaleString('tr-TR')]);

    addSection('KİMLİK BİLGİLERİ');
    addHeader('Alan', 'Değer');
    [
      ['Ad Soyad', `${p.ad} ${p.soyad}`],
      ['Görev', p.gorev || ''],
      ['Telefon', p.telefonNo || ''],
      ['E-posta', p.eposta || ''],
      ['TC Kimlik', p.tcNo || ''],
      ['Adres', p.adres || ''],
      ['İşe Giriş', p.iseGirisTarihi || ''],
      ['İşten Çıkış', p.istenCikisTarihi || ''],
      ['Maaş (TL)', String(p.maas ?? '')],
      ['Durum', p.durum ? 'Aktif' : 'Pasif'],
    ].forEach(([a, b]) => ws.addRow([a, b]));

    addSection('YOKLAMA KAYITLARI');
    addHeader('Tarih', 'Durum', 'Mesai Saati', 'Gönderen');
    const personMap = asYoklamaGunMap(yoklamalar[p.id]);
    if (personMap) {
      Object.entries(personMap)
        .map(([key, data]) => {
          const parsed = parseYoklamaDateKey(key);
          const tarih = parsed
            ? `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`
            : key;
          return { tarih, data };
        })
        .sort((a, b) => a.tarih.localeCompare(b.tarih, 'tr'))
        .forEach(({ tarih, data }) => {
          if (!data?.durum || data.durum === 'Girilmedi') return;
          ws.addRow([tarih, data.durum, String(data.mesaiSaati ?? ''), data.gonderen || '']);
        });
    }

    addSection('KAMP / LOJMAN KAYITLARI');
    addHeader('Yerleşke', 'Oda', 'Giriş', 'Çıkış', 'Durum');
    personelStayHistory.forEach((k) => {
      const room = kampOdalari.find((r) => r.id === k.odaId || r.id === k.roomId);
      ws.addRow([
        room?.yerleskeAdi || k.yerleskeAdi || '',
        room ? `${room.kogusNo} / Oda ${room.odaNo}` : (k.odaNo || ''),
        k.girisTarihi || '',
        k.cikisTarihi || '',
        k.durum || '',
      ]);
    });

    addSection('ARAÇ TAHSİSİ');
    addHeader('Plaka', 'Marka/Model', 'Durum', 'Muayene Tarihi');
    if (assignedVehicle) {
      ws.addRow([
        assignedVehicle.plaka,
        assignedVehicle.markaModel || '',
        assignedVehicle.durum || '',
        assignedVehicle.muayeneTarihi || '',
      ]);
    }

    addSection('SAHA FAALİYETLERİ');
    addHeader('Tarih', 'İş Niteliği', 'Parsel', 'Blok', 'Açıklama', 'Kaynak');
    personelSahaFaaliyetleri.forEach((f) => {
      ws.addRow([
        f.tarih,
        f.isNiteligi || '',
        f.parsel || '',
        f.blok || '',
        f.aciklama || '',
        f.kaynakEkran || '',
      ]);
    });
    sahaGorevKayitlari.forEach((g) => {
      ws.addRow([g.tarih || '', g.islem || 'Saha Görev', '', '', g.detay || '', 'Personel Geçmişi']);
    });

    addSection('TUTANAK / EVRAK');
    addHeader('Belge No', 'Tarih', 'Konu', 'Tip');
    hazirTutanaklar
      .filter((t) => t.personelId === p.id)
      .forEach((t) => ws.addRow([t.belgeNo || '', t.tarih || '', t.konu || '', t.tutanakTipi || '']));

    addSection('KASA / AVANS HAREKETLERİ');
    addHeader('Tarih', 'Tutar', 'Açıklama', 'Referans');
    kasaHareketleri
      .filter(
        (k) =>
          k.hareketTipi === 'ÇIKIŞ' &&
          k.referansTipi === 'MAAS' &&
          k.aciklama.toLowerCase().includes(p.ad.toLowerCase()) &&
          k.aciklama.toLowerCase().includes(p.soyad.toLowerCase())
      )
      .forEach((k) => ws.addRow([k.tarih || '', String(k.tutar), k.aciklama || '', k.referansTipi || '']));

    ws.columns = [{ width: 18 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 34 }, { width: 18 }];

    const safeName = `${p.ad}_${p.soyad}`.replace(/[^a-zA-Z0-9-_ğüşıöçĞÜŞİÖÇ]/g, '_');
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Personel_Detay_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Attendance calendar grid status helpers
  const getDayStatusColor = (durum: string) => {
    switch (durum) {
      case 'Geldi': return 'bg-emerald-500 text-white';
      case 'Yok': return 'bg-rose-500 text-white';
      case 'İzinli': return 'bg-slate-200 text-white';
      case 'Raporlu': return 'bg-amber-400 text-slate-900';
      case 'Pazar': case 'Tatil': return 'bg-slate-300 text-slate-700';
      default: return 'bg-slate-100 text-slate-400';
    }
  };

  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans select-none bg-slate-50/50 space-y-6">
      
      {/* Top Selector Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-xs gap-4 shrink-0">
        <div className="space-y-1">
          <span className="text-[10px] font-black tracking-widest text-slate-800 uppercase">Personel Künyesi &amp; Raporlar</span>
          <h2 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
            👤 Şantiye Personel Detay ve Geçmiş Kartları
          </h2>
        </div>
        
        {/* Dropdown selector */}
        <div className="flex items-center flex-wrap gap-2">
          <select
            value={firmaFilter}
            onChange={(e) => setFirmaFilter(e.target.value)}
            className="text-xs font-bold border border-[#e2e8f0] rounded-xl p-2.5 bg-slate-50 outline-none"
            title="Firma filtresi"
          >
            <option value="HEPSI">🏢 Tüm Firmalar</option>
            {firmaOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select
            value={durumFilter}
            onChange={(e) => setDurumFilter(e.target.value as 'AKTIF' | 'HEPSI')}
            className="text-xs font-bold border border-[#e2e8f0] rounded-xl p-2.5 bg-slate-50 outline-none"
            title="Durum filtresi"
          >
            <option value="AKTIF">Sadece Aktif</option>
            <option value="HEPSI">Tümü</option>
          </select>
          <select
            value={selectedPersId}
            onChange={(e) => setSelectedPersId(e.target.value)}
            className="text-xs font-bold border border-[#e2e8f0] rounded-xl p-2.5 bg-slate-50  outline-none"
          >
            {filteredPersoneller.length === 0 ? (
              <option value="">Personel bulunamadı</option>
            ) : (
              filteredPersoneller.map(p => (
                <option key={p.id} value={p.id}>{p.ad} {p.soyad} ({p.gorev})</option>
              ))
            )}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="text-xs font-bold border border-[#e2e8f0] rounded-xl p-2.5 bg-slate-50  outline-none"
          >
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
              <option key={m} value={m}>{m}. Ay</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs font-bold border border-[#e2e8f0] rounded-xl p-2.5 bg-slate-50  outline-none"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportPersonelDetayExcel}
            disabled={!selectedPersonnel}
            className="text-xs font-bold px-3 py-2.5 rounded-xl border bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition"
          >
            <FileSpreadsheet size={14} />
            Personel Detay Raporla
          </button>
        </div>
      </div>

      {selectedPersonnel ? (
        <div className="flex-grow flex flex-col lg:flex-row gap-6">
          
          {/* LEFT 40%: General Info & Financials */}
          <div className="w-full lg:w-[400px] shrink-0 space-y-6">
            
            {/* Kimlik kartı — tek personel kartı (tasarımsal tekrar kaldırıldı) */}
            <PersonelIdCard personel={selectedPersonnel} />

            {/* İletişim & ek detaylar (kimlik kartında olmayan alanlar) */}
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-4 shadow-sm space-y-2.5 text-xs text-slate-650 font-medium">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">📇 İletişim &amp; Detay</h4>
              <div className="flex items-center space-x-2.5">
                <Mail size={14} className="text-slate-400 shrink-0" />
                <span className="truncate">{selectedPersonnel.eposta || "E-posta Belirtilmemiş"}</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <MapPin size={14} className="text-slate-400 shrink-0" />
                <span className="truncate">{[selectedPersonnel.ilce, selectedPersonnel.il].filter(Boolean).join(' / ') || 'Adres yok'}</span>
              </div>
              {selectedPersonnel.istenCikisTarihi && (
                <div className="flex items-center space-x-2.5">
                  <Calendar size={14} className="text-rose-400 shrink-0" />
                  <span className="text-rose-600">İşten Çıkış: {selectedPersonnel.istenCikisTarihi}</span>
                </div>
              )}
            </div>

            {/* Financial Card Info */}
            {(() => {
              const fin = getReceivableDetails(selectedPersonnel);
              return (
                <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-4 border border-slate-800">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                    <span>💵 HAKEDİŞ &amp; ALACAK HESABI</span>
                    <span className="text-amber-500 font-mono">{selectedMonth}. Ay / {selectedYear}</span>
                  </h4>

                  <div className="space-y-2.5 text-xs text-slate-300 font-semibold">
                    <div className="flex justify-between">
                      <span className="text-slate-450">Aylık Net Maaş:</span>
                      <span className="font-mono text-white">{selectedPersonnel.maas.toLocaleString('tr-TR')} TL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-450">Çalıştığı Gün:</span>
                      <span className="font-mono text-white">{fin.workedDays} Gün</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-450">Kazanılan Hakediş:</span>
                      <span className="font-mono text-emerald-400">{fin.grossEarned.toLocaleString('tr-TR')} TL</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2.5">
                      <span className="text-slate-450">Dağıtılan Avans:</span>
                      <span className="font-mono text-rose-400">{fin.totalAvans.toLocaleString('tr-TR')} TL</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-end pt-1 font-black text-amber-400">
                    <span className="text-xs">KALAN NET ALACAK:</span>
                    <span className="text-sm font-mono">{fin.balance.toLocaleString('tr-TR')} TL</span>
                  </div>
                </div>
              );
            })()}

            {/* Assigned Logistics & Lodgings info */}
            {showTahsisSection && (
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">📋 ŞANTİYE ALAN TAHSİSLERİ</h4>
              
              <div className="space-y-3.5 text-xs font-semibold text-slate-700">
                {assignedVehicle && (
                <div className="flex items-start space-x-3 bg-slate-50/50 p-2.5 rounded-xl border border-slate-150/50">
                  <div className="p-2 bg-slate-50 text-slate-800 rounded-lg">
                    <Truck size={15} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Tahsisli Araç</p>
                    <p className="text-slate-900 mt-0.5">{assignedVehicle.plaka} - {assignedVehicle.markaModel}</p>
                  </div>
                </div>
                )}

                {hasActiveCamp && (
                <div className="flex items-start space-x-3 bg-slate-50/50 p-2.5 rounded-xl border border-slate-150/50">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Tent size={15} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Yatakhane Lojman Odası</p>
                    <p className="text-slate-900 mt-0.5">
                      {activeRoom
                        ? `${activeRoom.yerleskeAdi} / ${activeRoom.kogusNo} / Oda ${activeRoom.odaNo}`
                        : `${activeStay?.yerleskeAdi} / ${activeStay?.katAdi || '-'} / Oda ${activeStay?.odaNo || '-'}`}
                    </p>
                  </div>
                </div>
                )}

                {personelStayHistory.length > 0 && (
                <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-150/50">
                  <p className="text-[9px] text-slate-400 uppercase font-bold mb-1">Kamp Konaklama Geçmişi</p>
                    <div className="space-y-1">
                      {personelStayHistory.slice(0, 4).map((k) => {
                        const room = kampOdalari.find((r) => r.id === k.odaId || r.id === k.roomId);
                        const roomText = room
                          ? `${room.yerleskeAdi} / ${room.kogusNo} / Oda ${room.odaNo}`
                          : `${k.yerleskeAdi || '-'} / ${k.katAdi || '-'} / Oda ${k.odaNo || '-'}`;
                        return (
                          <div key={k.id} className="text-[10px] text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 flex justify-between gap-2">
                            <span className="font-semibold truncate">{roomText}</span>
                            <span className="text-slate-500 shrink-0">{k.girisTarihi} {k.cikisTarihi ? `→ ${k.cikisTarihi}` : '(Aktif)'}</span>
                          </div>
                        );
                      })}
                    </div>
                </div>
                )}
              </div>
            </div>
            )}

          </div>

          {/* RIGHT 60%: Attendance Calendar & History List */}
          <div className="flex-1 space-y-6">
            
            {/* Devam Grafiği Calendar Grid */}
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={14} className="text-emerald-500" />
                  📅 Günlük Devam Takvimi ({selectedMonth}. Ay / {selectedYear})
                </h4>
                <div className="flex gap-2 text-[8px] font-bold">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500 block"></span>Geldi</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500 block"></span>Yok</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200 block"></span>İzin</span>
                </div>
              </div>

              {/* Grid 7 Columns for Days */}
              <div className="grid grid-cols-7 gap-2.5 text-center font-bold text-[10px]">
                {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map(d => (
                  <div key={d} className="text-slate-400 uppercase tracking-wider">{d}</div>
                ))}
                {Array.from({ length: new Date(selectedYear, selectedMonth, 0).getDate() }).map((_, idx) => {
                  const dayNo = idx + 1;
                  const dayData = getYoklamaDay(yoklamalar[selectedPersonnel.id], selectedYear, selectedMonth, dayNo) || { durum: 'Girilmedi' as const };
                  return (
                    <div 
                      key={idx} 
                      className={`h-9 border border-slate-100 rounded-lg flex flex-col items-center justify-center font-mono ${getDayStatusColor(dayData.durum)}`}
                    >
                      <span className="text-[8px] opacity-75">{dayNo}</span>
                      <span className="text-[7px] font-black tracking-tight">{dayData.durum === 'Geldi' ? 'G' : dayData.durum === 'Yok' ? 'Y' : dayData.durum === 'İzinli' ? 'İ' : dayData.durum === 'Raporlu' ? 'R' : dayData.durum[0] || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leave certificates / Tutanaklar list */}
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <ClipboardList size={14} className="text-slate-500" />
                İmzalı Evrak &amp; İzin Formları Arşivi
              </h4>

              <div className="space-y-3">
                {personelIzinBelgeleri.length === 0 && leaveTutanaklar.length === 0 ? (
                  <div className="h-20 border border-dashed border-slate-100 rounded-xl flex items-center justify-center text-[10px] text-slate-400 font-medium italic">
                    Arşivlenmiş izin veya teslim tutanağı bulunmuyor.
                  </div>
                ) : (
                  <>
                    {personelIzinBelgeleri.map((b) => (
                      <div key={b.id} className="border border-emerald-100 rounded-xl p-3 flex items-center justify-between bg-emerald-50/40 hover:bg-emerald-50 transition text-xs font-semibold text-slate-700">
                        <div className="space-y-1">
                          <p className="text-slate-900">
                            İzin Belgesi · {(b.izinTipi || 'İZİN').replace(/_/g, ' ')}
                          </p>
                          <p className="text-[9px] text-slate-450 font-mono">
                            {b.baslangicTarihi} → {b.bitisTarihi} · {b.toplamGun || 1} gün
                          </p>
                        </div>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${
                          b.onayDurumu === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' :
                          b.onayDurumu === 'REDDEDİLDİ' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {b.onayDurumu === 'ONAYLANDI' ? '✓ Onaylı' : b.onayDurumu === 'REDDEDİLDİ' ? '✖ Red' : '⌛ Bekliyor'}
                        </span>
                      </div>
                    ))}
                    {leaveTutanaklar.map(t => (
                      <div key={t.id} className="border border-slate-100 rounded-xl p-3 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition text-xs font-semibold text-slate-700">
                        <div className="space-y-1">
                          <p className="text-slate-900">{t.konu}</p>
                          <p className="text-[9px] text-slate-450 font-mono">Kod: {t.belgeNo} · Tarih: {t.tarih}</p>
                        </div>
                        <ChevronRight size={15} className="text-slate-400" />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Activity size={14} className="text-slate-600" />
                Saha Görevlendirme Kayıtları
              </h4>
              <div className="space-y-2.5">
                {sahaGorevKayitlari.length === 0 ? (
                  <div className="h-16 border border-dashed border-slate-100 rounded-xl flex items-center justify-center text-[10px] text-slate-400 font-medium italic">
                    Bu personel için saha görevlendirme geçmişi yok.
                  </div>
                ) : (
                  sahaGorevKayitlari.slice(0, 8).map((g) => (
                    <div key={g.id} className="border border-slate-150 rounded-xl p-2.5 bg-slate-50/60 text-xs">
                      <p className="text-[10px] text-slate-450 font-mono">{g.tarih ? new Date(g.tarih).toLocaleString('tr-TR') : '-'}</p>
                      <p className="text-slate-900 font-semibold mt-0.5">{g.islem || 'Saha Görevlendirme'}</p>
                      <p className="text-slate-600 text-[11px] mt-1">{g.detay || '-'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      ) : (
        <div className="h-60 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-slate-400">
          <Sparkles size={36} className="text-slate-350 animate-pulse mb-3" />
          <p className="text-xs font-bold">Kayıtlı Personel Bulunmuyor</p>
          <p className="text-[10px] text-slate-400 mt-1">Lütfen Personel Yönetimi menüsünden yeni personel kaydı ekleyin.</p>
        </div>
      )}

    </div>
  );
};

export default PersonelKartlariScreen;
