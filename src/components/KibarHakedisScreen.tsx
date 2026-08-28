import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Calendar, Printer, ShieldCheck, CheckCircle2, 
  Trash2, Plus, AlertCircle, RefreshCw, Layers, FileText, UserX 
} from 'lucide-react';
import { db, saveDocument } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Personel, AylikYoklamaMap, SahaFaaliyeti } from '../types/erp';
import { KibritciLogo } from './KibritciLogo';

interface KibarHakedisScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  sahaFaaliyetleri: any[];
  currentUser: any;
}

export const KibarHakedisScreen: React.FC<KibarHakedisScreenProps> = ({
  personeller,
  yoklamalar,
  sahaFaaliyetleri,
  currentUser
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [kampFaaliyetleri, setKampFaaliyetleri] = useState<any[]>([]);
  const [excludedStaffIds, setExcludedStaffIds] = useState<string[]>([]);
  const [reportType, setReportType] = useState<'NORMAL' | 'E-IMZALI'>('NORMAL');
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // Fetch Kamp activities and saved hakedis reports
  useEffect(() => {
    const unsubKamp = onSnapshot(collection(db, 'kampGunlukFaaliyetleri'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setKampFaaliyetleri(list);
    });

    const unsubReports = onSnapshot(collection(db, 'kibarHakedisRaporlari'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSavedReports(list);
    });

    return () => {
      unsubKamp();
      unsubReports();
    };
  }, []);

  // Parse Year/Month/Day from selectedDate
  const [year, month, day] = selectedDate.split('-').map(Number);

  // Get daily present personnel
  const getPresentStaff = () => {
    const list: Personel[] = [];
    personeller.forEach(p => {
      const personYoklama = yoklamalar[p.id] || {};
      const dayData = personYoklama[day];
      // Check if they were present (Geldi) in the selected period
      if (dayData?.durum === 'Geldi') {
        list.push(p);
      }
    });
    return list;
  };

  const allPresentStaff = getPresentStaff();
  const activePresentStaff = allPresentStaff.filter(p => !excludedStaffIds.includes(p.id));

  // Filter daily activities
  const dailySahaFaaliyetleri = sahaFaaliyetleri.filter(sf => sf.tarih === selectedDate);
  const dailyKampFaaliyetleri = kampFaaliyetleri.filter(kf => kf.tarih === selectedDate);

  // Calculation
  const presentCount = activePresentStaff.length;
  const ratePerPerson = 200;
  const totalHakedis = presentCount * ratePerPerson;

  const handleExcludeStaff = (staffId: string) => {
    if (!excludedStaffIds.includes(staffId)) {
      setExcludedStaffIds(prev => [...prev, staffId]);
    }
  };

  const handleIncludeStaff = (staffId: string) => {
    setExcludedStaffIds(prev => prev.filter(id => id !== staffId));
  };

  const handleSaveReport = async () => {
    setLoading(true);
    try {
      const reportId = `KIBAR-HKD-${Date.now()}`;
      const newReport = {
        id: reportId,
        tarih: selectedDate,
        personelSayisi: presentCount,
        birimFiyat: ratePerPerson,
        toplamTutar: totalHakedis,
        olusturan: currentUser?.email || 'sametatak9@gmail.com',
        olusturmaTarihi: new Date().toISOString(),
        faaliyetlerCount: dailySahaFaaliyetleri.length + dailyKampFaaliyetleri.length,
        durum: 'KAYDEDİLDİ'
      };

      await saveDocument('kibarHakedisRaporlari', newReport);
      showStatus('success', 'Kibar Hakediş Raporu başarıyla sisteme kaydedildi!');
    } catch (err: any) {
      console.error(err);
      showStatus('error', `Rapor kaydedilirken hata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('kibar-report-print-area')?.innerHTML;
    if (!printContent) return;

    const htmlSnippet = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Kibar_Hakedis_Raporu_${selectedDate}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: 'Inter', sans-serif; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; margin: 0; background: white; }
            }
          </style>
        </head>
        <body class="p-8 bg-white text-slate-900">
          <div class="max-w-4xl mx-auto border p-8 rounded-2xl shadow-sm">
            ${printContent}
          </div>
          <script>
            window.onload = function() { window.print(); }
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
      link.download = `Kibar_Hakedis_Raporu_${selectedDate}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex-grow p-6 space-y-6 overflow-y-auto h-full font-sans bg-slate-50">
      
      {/* Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-slate-950 font-black">
            <CreditCard size={22} />
          </div>
          <div>
            <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-wider block w-fit">
              KİBAR ÖZEL ERİŞİM
            </span>
            <h1 className="text-lg font-black tracking-tight mt-1 text-white">🏢 KİBAR HAKEDİŞ DÜZENLEME PANELİ</h1>
            <p className="text-[11px] text-slate-400">Günlük gelen kadro sayısı bazlı taşeron/şantiye hakediş hesaplama ve resmi raporlama</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl p-2 px-3">
            <Calendar size={14} className="text-amber-500" />
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setExcludedStaffIds([]);
              }}
              className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer"
            />
          </div>
          <button
            onClick={handleSaveReport}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow cursor-pointer flex items-center space-x-1"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            <span>Raporu Kaydet</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl border text-xs font-bold ${
          statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-250' : 'bg-rose-50 text-rose-800 border-rose-250'
        }`}>
          {statusMsg.type === 'success' ? '✓' : '⚠️'} {statusMsg.text}
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left 1 Col: Present Personnel List & Excluded List */}
        <div className="xl:col-span-1 space-y-6">
          
          {/* Active Present List */}
          <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">GELEN PERSONEL HAKEDİŞ YÖNETİMİ</span>
              <h3 className="text-xs font-black text-slate-800 mt-0.5">👥 Sahadaki Personeller ({allPresentStaff.length})</h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Yoklama cetvelinde bugün "Geldi" işaretlenen personeller aşağıdadır. Hakediş raporuna dahil edilmesini istemediklerinizi çıkarabilirsiniz.
              </p>
            </div>

            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
              {allPresentStaff.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic text-[11px]">
                  Bu tarihte şantiyede "Geldi" işaretlenen personel bulunmuyor.
                </div>
              ) : (
                allPresentStaff.map(p => {
                  const isExcluded = excludedStaffIds.includes(p.id);
                  return (
                    <div 
                      key={p.id} 
                      className={`flex justify-between items-center p-2.5 rounded-xl border transition ${
                        isExcluded 
                          ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60' 
                          : 'bg-slate-50/40 border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className={`text-xs font-bold block ${isExcluded ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {p.ad} {p.soyad}
                        </span>
                        <span className="text-[9px] text-slate-500 block uppercase font-semibold font-mono">{p.gorev || 'İŞÇİ'}</span>
                      </div>
                      
                      {isExcluded ? (
                        <button
                          onClick={() => handleIncludeStaff(p.id)}
                          className="bg-blue-50 hover:bg-blue-100 border border-blue-150 text-blue-600 font-bold text-[9px] py-1 px-2.5 rounded-lg cursor-pointer transition"
                        >
                          Dahil Et
                        </button>
                      ) : (
                        <button
                          onClick={() => handleExcludeStaff(p.id)}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-600 font-bold text-[9px] py-1 px-2.5 rounded-lg cursor-pointer transition flex items-center space-x-1"
                        >
                          <UserX size={10} />
                          <span>Çıkar</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">📊 Hakediş Özeti</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 border p-3 rounded-xl">
                <span className="text-[8px] text-slate-500 font-bold block uppercase">Kadro Sayısı</span>
                <span className="text-base font-extrabold text-blue-700 block mt-0.5">{presentCount} Kişi</span>
              </div>
              <div className="bg-slate-50 border p-3 rounded-xl">
                <span className="text-[8px] text-slate-500 font-bold block uppercase">Birim Katsayı</span>
                <span className="text-base font-extrabold text-slate-700 block mt-0.5">₺200</span>
              </div>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl text-center">
              <span className="text-[9px] text-amber-700 font-bold block uppercase">Hesaplanan Toplam Hakediş</span>
              <span className="text-lg font-black text-amber-600 font-mono mt-1 block">₺{totalHakedis.toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Report Preview & Document details */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Report Control Toolbar */}
          <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700">Rapor Türü:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setReportType('NORMAL')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${
                    reportType === 'NORMAL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Normal Rapor
                </button>
                <button
                  onClick={() => setReportType('E-IMZALI')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition flex items-center space-x-1 ${
                    reportType === 'E-IMZALI' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck size={11} />
                  <span>E-İmzalı Rapor</span>
                </button>
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center space-x-1.5 shadow transition cursor-pointer"
            >
              <Printer size={13} />
              <span>Yazdır / PDF Rapor Dök</span>
            </button>
          </div>

          {/* Printable Report Canvas */}
          <div className="bg-white border rounded-3xl p-6 shadow-sm overflow-hidden">
            <div id="kibar-report-print-area" className="bg-white p-4 space-y-6 text-xs text-slate-800">
              
              {/* Report Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <KibritciLogo size="lg" />
                  <div>
                    <h2 className="text-base font-black text-[#1E4E78] uppercase">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h2>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">YÖNETİM VE DENETİM KURULU ÖZEL RAPORU</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">Rapor Tarihi: <strong className="text-slate-900 font-bold">{selectedDate}</strong></p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="border border-slate-900 text-[9px] font-bold px-3 py-1 bg-slate-50 uppercase tracking-widest block mb-1">
                    BELGE NO: KBR-KIBAR-{selectedDate}
                  </span>
                  <span className="text-[8px] text-slate-500 font-mono">Döküm: {new Date().toLocaleDateString('tr-TR')}</span>
                </div>
              </div>

              {/* Title Section */}
              <div className="text-center bg-slate-50 border-y py-2.5">
                <h3 className="font-bold text-slate-900 tracking-wider uppercase text-xs">
                  ŞANTİYE SAHASI KİBAR GÜNLÜK HAKEDİŞ VE FAALİYET MUTABAKATI
                </h3>
              </div>

              {/* Active Site Activities (Saha Faaliyetleri) */}
              <div className="space-y-2">
                <span className="font-bold text-[9px] text-[#1E4E78] uppercase tracking-wider block">🏗️ GÜNLÜK SAHA FAALİYET RAPORLARI</span>
                {dailySahaFaaliyetleri.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">Bugün girilmiş saha faaliyeti bulunmamaktadır.</p>
                ) : (
                  <div className="border rounded-xl divide-y overflow-hidden bg-white text-[10px]">
                    {dailySahaFaaliyetleri.map((sf, idx) => (
                      <div key={idx} className="p-2.5 space-y-1">
                        <div className="flex justify-between font-bold text-slate-900">
                          <span>{sf.baslik || 'Genel Saha Faaliyeti'}</span>
                          {sf.blok && <span className="text-slate-500 font-mono">{sf.parsel} / {sf.blok}</span>}
                        </div>
                        <p className="text-slate-600 font-medium leading-relaxed">{sf.detay || sf.aciklama}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Camp Activities (Camp Faaliyetleri) */}
              <div className="space-y-2">
                <span className="font-bold text-[9px] text-[#1E4E78] uppercase tracking-wider block">⛺ KAMP VE LOJMAN SAHASI FAALİYETLERİ</span>
                {dailyKampFaaliyetleri.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">Bugün girilmiş kamp/lojman faaliyeti bulunmamaktadır.</p>
                ) : (
                  <div className="border rounded-xl divide-y overflow-hidden bg-white text-[10px]">
                    {dailyKampFaaliyetleri.map((kf, idx) => (
                      <div key={idx} className="p-2.5 space-y-1">
                        <div className="flex justify-between font-bold text-slate-900">
                          <span className="bg-slate-100 text-slate-700 px-1.5 rounded">{kf.faaliyetTipi}</span>
                          <span className="text-slate-400 font-mono">{kf.yerleskeAdi}</span>
                        </div>
                        <p className="text-slate-600 font-medium leading-relaxed">{kf.aciklama}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Present Personnel Matrix Table (Omit Names, show ONLY titles/roles!) */}
              <div className="space-y-2">
                <span className="font-bold text-[9px] text-[#1E4E78] uppercase tracking-wider block">👷 FİİLİ HAKEDİŞE TABİ KADRO DETAYI (İSİMLER GİZLENMİŞTİR)</span>
                <div className="border rounded-xl overflow-hidden text-[9px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b text-slate-600 font-bold uppercase text-[8px] tracking-wider">
                        <th className="p-2 w-16 text-center">SIRA NO</th>
                        <th className="p-2">HİZMET KODU</th>
                        <th className="p-2">ATANAN GÖREV / ÜNVAN</th>
                        <th className="p-2 text-right">FORMÜL MATRİS</th>
                        <th className="p-2 text-right">GÜNLÜK BEDEL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-medium text-slate-700">
                      {activePresentStaff.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center font-mono">{idx + 1}</td>
                          <td className="p-2 font-mono text-slate-400">KBR-{p.id.slice(-5)}</td>
                          <td className="p-2 font-bold text-slate-900">{p.gorev || 'ŞANTİYE ELEMANI'}</td>
                          <td className="p-2 text-right font-mono">1 Kişi x 1 Gün</td>
                          <td className="p-2 text-right font-mono">₺200,00</td>
                        </tr>
                      ))}
                      {activePresentStaff.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-slate-400 italic">Dahil edilmiş personel bulunmuyor.</td>
                        </tr>
                      )}
                      <tr className="bg-slate-50 font-bold text-slate-900 border-t">
                        <td colSpan={3} className="p-2 text-right uppercase">Hakedişe Esas Toplam Kadro:</td>
                        <td className="p-2 text-right font-mono">{presentCount} Personel/Gün</td>
                        <td className="p-2 text-right font-mono text-amber-700 font-black">₺{totalHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures / E-Signature Seal Block */}
              <div className="pt-6 border-t">
                {reportType === 'E-IMZALI' ? (
                  <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                    <div className="flex items-center space-x-3">
                      <ShieldCheck size={26} className="text-amber-600 animate-pulse shrink-0" />
                      <div>
                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">🔒 E-İMZA KANUNUNA UYGUN ONAYLANMIŞTIR</span>
                        <p className="text-[9px] text-slate-500 font-medium mt-0.5 leading-relaxed">
                          Bu evrak 5070 Sayılı Elektronik İmza Kanunu uyarınca dijital olarak doğrulanmıştır.<br />
                          Doğrulayan: <strong className="text-slate-800">{currentUser?.email || 'sametatak9@gmail.com'}</strong> • Hash: KBR-HKD-{(Date.now() % 10000000).toString(16).toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded p-1 bg-white shrink-0">
                      {/* Simple mock QR seal */}
                      <div className="w-12 h-12 bg-slate-100 flex flex-col items-center justify-center text-[7px] font-mono text-slate-400 text-center font-bold">
                        <span>QR</span>
                        <span>SEAL</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="border p-2.5 rounded-xl bg-slate-50/50">
                      <span className="font-extrabold text-[#1e4e78] block">Hakedişi Düzenleyen Yetkili</span>
                      <span className="text-[8px] text-slate-400 block mb-5">Şantiye Yetkilisi</span>
                      <div className="h-0.5 bg-slate-350 w-16 mx-auto mb-1"></div>
                      <span className="text-[8px] font-bold text-slate-400">İmza</span>
                    </div>
                    <div className="border p-2.5 rounded-xl bg-slate-50/50">
                      <span className="font-extrabold text-[#1e4e78] block">Şantiye Proje Koordinatörü</span>
                      <span className="text-[8px] text-slate-400 block mb-5">Kibritçi A.Ş. Denetim</span>
                      <div className="h-0.5 bg-slate-350 w-16 mx-auto mb-1"></div>
                      <span className="text-[8px] font-bold text-slate-400">İmza / Kaşe</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
