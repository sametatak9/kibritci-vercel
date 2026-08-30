import React, { useState, useMemo } from 'react';
import { Banknote, Search, CircleCheck as CheckCircle, Circle as XCircle, ListFilter as Filter, Download, Printer, Calendar, User, CreditCard, TriangleAlert as AlertTriangle, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { Personel, AylikYoklamaMap, MaaşOdeme, MaasKesinti } from '../types/erp';

interface MaasOdeScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  maasOdemeleri: MaaşOdeme[];
  setMaasOdemeleri: React.Dispatch<React.SetStateAction<MaaşOdeme[]>>;
  currentUser: any;
}

export const MaasOdeScreen: React.FC<MaasOdeScreenProps> = ({
  personeller,
  yoklamalar,
  maasOdemeleri,
  setMaasOdemeleri,
  currentUser
}) => {
  const [selectedAy, setSelectedAy] = useState(new Date().getMonth() + 1);
  const [selectedYil, setSelectedYil] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [showOdendiHavuzu, setShowOdendiHavuzu] = useState(false);
  const [expandedPersonel, setExpandedPersonel] = useState<string | null>(null);
  const [kesintiModal, setKesintiModal] = useState<{ personelId: string; odemeId?: string } | null>(null);
  const [kesintiTur, setKesintiTur] = useState<MaasKesinti['tur']>('DIGER');
  const [kesintiAciklama, setKesintiAciklama] = useState('');
  const [kesintiTutar, setKesintiTutar] = useState('');

  const daysInMonth = useMemo(() => new Date(selectedYil, selectedAy, 0).getDate(), [selectedAy, selectedYil]);

  const hesaplaMaas = (personel: Personel): { brut: number; mesai: number; kesinti: number; net: number; hakedisGun: number; mesaiSaat: number } => {
    const pYoklama = yoklamalar[personel.id] || {};
    let hakedisGun = 0;
    let mesaiSaat = 0;
    Object.values(pYoklama).forEach((day: any) => {
      if (day?.durum === 'Geldi' || day?.durum === 'İzinli' || day?.durum === 'Pazar' || day?.durum === 'Tatil') {
        hakedisGun++;
      }
      if (day?.mesaiSaati) mesaiSaat += Number(day.mesaiSaati);
    });

    if (hakedisGun === 0) {
      hakedisGun = daysInMonth;
    }

    const katsayi = hakedisGun / daysInMonth;
    const brutMaas = (personel.maas || 0) * katsayi;
    const saatlikUcret = (personel.maas || 0) / daysInMonth / 7.5;
    const mesaiUcreti = mesaiSaat * saatlikUcret * 1.5;
    const toplamHakedis = brutMaas + mesaiUcreti;

    const mevcutKesintiler = maasOdemeleri
      .filter(m => m.personelId === personel.id && m.ay === selectedAy && m.yil === selectedYil)
      .reduce((sum, m) => sum + m.kesintiToplami, 0);

    return {
      brut: Math.round(brutMaas * 100) / 100,
      mesai: Math.round(mesaiUcreti * 100) / 100,
      kesinti: mevcutKesintiler,
      net: Math.round((toplamHakedis - mevcutKesintiler) * 100) / 100,
      hakedisGun,
      mesaiSaat
    };
  };

  const filteredPersoneller = useMemo(() => {
    let list = personeller.filter(p => {
      const d = new Date(p.iseGirisTarihi || '2020-01-01');
      return d.getFullYear() < selectedYil || (d.getFullYear() === selectedYil && d.getMonth() + 1 <= selectedAy);
    });
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => 
        `${p.ad} ${p.soyad}`.toLowerCase().includes(q) ||
        (p.tcNo || '').includes(q) ||
        (p.gorev || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [personeller, selectedAy, selectedYil, searchQuery]);

  const odenecekListesi = filteredPersoneller.filter(p => {
    const odeme = maasOdemeleri.find(m => m.personelId === p.id && m.ay === selectedAy && m.yil === selectedYil);
    return !odeme || !odeme.odendi;
  });

  const odenenListesi = filteredPersoneller.filter(p => {
    const odeme = maasOdemeleri.find(m => m.personelId === p.id && m.ay === selectedAy && m.yil === selectedYil);
    return odeme && odeme.odendi;
  });

  const handleOdemeYap = (personel: Personel) => {
    const hesap = hesaplaMaas(personel);
    const mevcutOdeme = maasOdemeleri.find(m => m.personelId === personel.id && m.ay === selectedAy && m.yil === selectedYil);

    const yeniOdeme: MaaşOdeme = {
      id: mevcutOdeme?.id || `mo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      personelId: personel.id,
      personelAdSoyad: `${personel.ad} ${personel.soyad}`,
      ay: selectedAy,
      yil: selectedYil,
      brutMaas: hesap.brut,
      mesaiUcreti: hesap.mesai,
      toplamHakedis: hesap.brut + hesap.mesai,
      kesintiToplami: hesap.kesinti,
      netOdeme: hesap.net,
      odendi: true,
      odemeTarihi: new Date().toISOString().split('T')[0],
      odemeYapanKullanici: currentUser?.email || 'Sistem',
      iban: personel.ibanNo || '',
      bankaAdi: personel.bankaAdi || '',
      tcNo: personel.tcNo || '',
      kesintiler: mevcutOdeme?.kesintiler || [],
      notlar: mevcutOdeme?.notlar || ''
    };

    setMaasOdemeleri(prev => {
      const filtered = prev.filter(m => !(m.personelId === personel.id && m.ay === selectedAy && m.yil === selectedYil));
      return [...filtered, yeniOdeme];
    });
  };

  const handleKesintiEkle = () => {
    if (!kesintiModal || !kesintiTutar) return;
    const { personelId, odemeId } = kesintiModal;
    const personel = personeller.find(p => p.id === personelId);
    if (!personel) return;

    const yeniKesinti: MaasKesinti = {
      id: `mk_${Date.now()}`,
      tur: kesintiTur,
      aciklama: kesintiAciklama || 'Kesinti',
      tutar: Number(kesintiTutar),
      tarih: new Date().toISOString().split('T')[0]
    };

    const mevcutOdeme = maasOdemeleri.find(m => m.personelId === personelId && m.ay === selectedAy && m.yil === selectedYil);

    if (mevcutOdeme) {
      setMaasOdemeleri(prev => prev.map(m => {
        if (m.id === mevcutOdeme.id) {
          const yeniKesintiler = [...m.kesintiler, yeniKesinti];
          const yeniKesintiToplam = yeniKesintiler.reduce((s, k) => s + k.tutar, 0);
          return {
            ...m,
            kesintiler: yeniKesintiler,
            kesintiToplami: yeniKesintiToplam,
            netOdeme: m.toplamHakedis - yeniKesintiToplam
          };
        }
        return m;
      }));
    } else {
      const hesap = hesaplaMaas(personel);
      const yeniOdeme: MaaşOdeme = {
        id: odemeId || `mo_${Date.now()}`,
        personelId: personel.id,
        personelAdSoyad: `${personel.ad} ${personel.soyad}`,
        ay: selectedAy,
        yil: selectedYil,
        brutMaas: hesap.brut,
        mesaiUcreti: hesap.mesai,
        toplamHakedis: hesap.brut + hesap.mesai,
        kesintiToplami: Number(kesintiTutar),
        netOdeme: hesap.brut + hesap.mesai - Number(kesintiTutar),
        odendi: false,
        iban: personel.ibanNo || '',
        bankaAdi: personel.bankaAdi || '',
        tcNo: personel.tcNo || '',
        kesintiler: [yeniKesinti],
        notlar: ''
      };
      setMaasOdemeleri(prev => [...prev, yeniOdeme]);
    }

    setKesintiModal(null);
    setKesintiAciklama('');
    setKesintiTutar('');
  };

  const handleOdemeIptal = (personelId: string) => {
    if (confirm('Bu ödemeyi iptal etmek istediğinize emin misiniz?')) {
      setMaasOdemeleri(prev => prev.map(m => {
        if (m.personelId === personelId && m.ay === selectedAy && m.yil === selectedYil) {
          return { ...m, odendi: false, odemeTarihi: undefined, odemeYapanKullanici: undefined };
        }
        return m;
      }));
    }
  };

  const generateOdemelerRaporu = () => {
    const aylikOdemeler = maasOdemeleri.filter(m => m.ay === selectedAy && m.yil === selectedYil && m.odendi);
    if (aylikOdemeler.length === 0) {
      alert('Seçilen ay için ödeme kaydı bulunamadı.');
      return;
    }

    const html = `
      <html>
        <head><meta charset="utf-8"><title>Maaş Ödeme Raporu</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 1000px; margin: 0 auto;">
          <div style="text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="color: #1e3a5f; margin: 0; font-size: 24px;">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
            <p style="color: #666; margin: 5px 0; font-size: 12px;">MAAŞ ÖDEME RAPORU - ${String(selectedAy).padStart(2, '0')}/${selectedYil}</p>
            <p style="color: #999; font-size: 11px;">Oluşturulma: ${new Date().toLocaleString('tr-TR')}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #1e3a5f; color: white;">
                <th style="padding: 8px; border: 1px solid #ddd;">Sıra</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Ad Soyad</th>
                <th style="padding: 8px; border: 1px solid #ddd;">TC No</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Brüt Maaş</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Mesai</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Kesinti</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Net Ödeme</th>
                <th style="padding: 8px; border: 1px solid #ddd;">IBAN</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Ödeme Tarihi</th>
              </tr>
            </thead>
            <tbody>
              ${aylikOdemeler.map((m, i) => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${i + 1}</td>
                  <td style="padding: 6px; border: 1px solid #ddd;">${m.personelAdSoyad}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; font-family: monospace;">${m.tcNo}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${m.brutMaas.toFixed(2)}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${m.mesaiUcreti.toFixed(2)}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right; color: #c00;">${m.kesintiToplami.toFixed(2)}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${m.netOdeme.toFixed(2)}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; font-family: monospace; font-size: 10px;">${m.iban}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${m.odemeTarihi}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top: 20px; text-align: right; font-size: 12px;">
            <p><strong>Toplam Ödeme:</strong> ${aylikOdemeler.reduce((s, m) => s + m.netOdeme, 0).toFixed(2)} TL</p>
            <p><strong>Toplam Kesinti:</strong> ${aylikOdemeler.reduce((s, m) => s + m.kesintiToplami, 0).toFixed(2)} TL</p>
          </div>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Maas_Odeme_Raporu_${String(selectedAy).padStart(2, '0')}_${selectedYil}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validateTC = (tc: string): boolean => {
    if (!tc || tc.length !== 11) return false;
    if (!/^\d{11}$/.test(tc)) return false;
    return true;
  };

  const validateIBAN = (iban: string): boolean => {
    if (!iban) return false;
    const cleaned = iban.replace(/\s/g, '');
    return cleaned.startsWith('TR') && cleaned.length === 26;
  };

  return (
    <div className="flex-grow p-6 space-y-6 overflow-y-auto h-full font-sans bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block">Finans & İnsan Kaynakları</span>
          <h2 className="text-sm font-black tracking-widest font-display flex items-center gap-2">
            <Banknote size={16} /> MAAŞ ÖDEME YÖNETİMİ
          </h2>
          <p className="text-[10px] text-slate-400">Personel maaş ödemeleri, kesinti takibi, TC/IBAN doğrulama ve ödeme raporları.</p>
        </div>
        <div className="flex gap-2">
          <div>
            <select value={selectedAy} onChange={e => setSelectedAy(Number(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none focus:border-amber-500">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <div>
            <select value={selectedYil} onChange={e => setSelectedYil(Number(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none focus:border-amber-500">
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Ödenecek Personel</span>
          <span className="text-2xl font-black font-mono text-amber-600">{odenecekListesi.length}</span>
        </div>
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Ödenen Personel</span>
          <span className="text-2xl font-black font-mono text-emerald-600">{odenenListesi.length}</span>
        </div>
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Toplam Net Ödeme</span>
          <span className="text-2xl font-black font-mono text-blue-600">
            {maasOdemeleri.filter(m => m.ay === selectedAy && m.yil === selectedYil && m.odendi).reduce((s, m) => s + m.netOdeme, 0).toFixed(0)} TL
          </span>
        </div>
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Toplam Kesinti</span>
          <span className="text-2xl font-black font-mono text-rose-600">
            {maasOdemeleri.filter(m => m.ay === selectedAy && m.yil === selectedYil && m.odendi).reduce((s, m) => s + m.kesintiToplami, 0).toFixed(0)} TL
          </span>
        </div>
      </div>

      {/* Search & Actions */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            placeholder="Personel ara (ad, soyad, TC, görev)..." 
            className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 w-72" 
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowOdendiHavuzu(!showOdendiHavuzu)} className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${showOdendiHavuzu ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            <CheckCircle size={12} /> {showOdendiHavuzu ? 'Ödendi Havuzu (Açık)' : 'Ödendi Havuzu'}
          </button>
          <button onClick={generateOdemelerRaporu} className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5">
            <Download size={12} /> Ödeme Raporu
          </button>
        </div>
      </div>

      {/* Personel List */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex justify-between items-center">
          <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
            <User size={14} className="text-amber-500" />
            {showOdendiHavuzu ? 'Ödenen Personeller' : 'Ödenecek Personeller'}
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">{showOdendiHavuzu ? odenenListesi.length : odenecekListesi.length} kayıt</span>
        </div>

        <div className="divide-y divide-slate-100">
          {(showOdendiHavuzu ? odenenListesi : odenecekListesi).map(personel => {
            const hesap = hesaplaMaas(personel);
            const odeme = maasOdemeleri.find(m => m.personelId === personel.id && m.ay === selectedAy && m.yil === selectedYil);
            const tcValid = validateTC(personel.tcNo || '');
            const ibanValid = validateIBAN(personel.ibanNo || '');
            const isExpanded = expandedPersonel === personel.id;

            return (
              <div key={personel.id} className="p-4 hover:bg-slate-50/50 transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                        {personel.ad[0]}{personel.soyad[0]}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{personel.ad} {personel.soyad}</p>
                        <p className="text-[10px] text-slate-400">{personel.gorev} · {personel.departman}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${odeme?.odendi ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {odeme?.odendi ? 'ÖDENDİ' : 'BEKLİYOR'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[10px]">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <span className="text-slate-400 block">Brüt Maaş</span>
                        <span className="font-bold text-slate-800">{hesap.brut.toFixed(2)} TL</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <span className="text-slate-400 block">Mesai Ücreti</span>
                        <span className="font-bold text-slate-800">{hesap.mesai.toFixed(2)} TL</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <span className="text-slate-400 block">Kesinti</span>
                        <span className="font-bold text-rose-600">{hesap.kesinti.toFixed(2)} TL</span>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                        <span className="text-blue-400 block">Net Ödeme</span>
                        <span className="font-bold text-blue-800">{hesap.net.toFixed(2)} TL</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                      <span className={`flex items-center gap-1 ${tcValid ? 'text-emerald-600' : 'text-rose-500'}`}>
                        <User size={10} /> TC: {personel.tcNo || 'Yok'} {tcValid ? '✓' : '✗'}
                      </span>
                      <span className={`flex items-center gap-1 ${ibanValid ? 'text-emerald-600' : 'text-rose-500'}`}>
                        <CreditCard size={10} /> IBAN: {personel.ibanNo ? personel.ibanNo.slice(0, 8) + '...' : 'Yok'} {ibanValid ? '✓' : '✗'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={10} /> {hesap.hakedisGun} gün / {hesap.mesaiSaat.toFixed(1)} sa mesai
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setExpandedPersonel(isExpanded ? null : personel.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {!odeme?.odendi ? (
                      <button onClick={() => handleOdemeYap(personel)} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition flex items-center gap-1">
                        <CheckCircle size={10} /> Ödendi
                      </button>
                    ) : (
                      <button onClick={() => handleOdemeIptal(personel.id)} className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-600 text-[10px] font-bold rounded-lg transition flex items-center gap-1">
                        <XCircle size={10} /> İptal
                      </button>
                    )}
                    <button onClick={() => setKesintiModal({ personelId: personel.id, odemeId: odeme?.id })} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 transition" title="Kesinti Ekle">
                      <AlertTriangle size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && odeme && (
                  <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kesinti Detayları</p>
                    {odeme.kesintiler.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">Kesinti bulunmuyor.</p>
                    ) : (
                      <div className="space-y-1">
                        {odeme.kesintiler.map(k => (
                          <div key={k.id} className="flex justify-between text-[10px] bg-white rounded-lg p-2 border border-slate-100">
                            <span><strong>{k.tur}:</strong> {k.aciklama}</span>
                            <span className="text-rose-600 font-bold">-{k.tutar.toFixed(2)} TL</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {odeme.odendi && (
                      <div className="text-[10px] text-slate-400 mt-2">
                        <p>Ödeme Tarihi: {odeme.odemeTarihi}</p>
                        <p>Ödeme Yapan: {odeme.odemeYapanKullanici}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Kesinti Modal */}
      {kesintiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="font-display font-black text-slate-800 text-sm">Kesinti Ekle</h3>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kesinti Türü</label>
              <select value={kesintiTur} onChange={e => setKesintiTur(e.target.value as MaasKesinti['tur'])} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500">
                <option value="AVANS">Avans</option>
                <option value="CEZA">Ceza</option>
                <option value="DAMGA_VERGISI">Damga Vergisi</option>
                <option value="SGK_PRIMI">SGK Primi</option>
                <option value="GELIR_VERGISI">Gelir Vergisi</option>
                <option value="DIGER">Diğer</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Açıklama</label>
              <input type="text" value={kesintiAciklama} onChange={e => setKesintiAciklama(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tutar (TL)</label>
              <input type="number" value={kesintiTutar} onChange={e => setKesintiTutar(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleKesintiEkle} className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-2.5 rounded-xl transition">Ekle</button>
              <button onClick={() => setKesintiModal(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaasOdeScreen;
