import React, { useState } from 'react';
import { Users, UserPlus, Trash2, CreditCard as Edit3, Camera, Search, ShieldCheck, Mail, Phone, MapPin, DollarSign, UserX, FileText, CloudUpload as UploadCloud, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Loader as Loader2, Building2, History, Download } from 'lucide-react';
import { Personel } from '../types/erp';

interface PersonelScreenProps {
  personeller: Personel[];
  setPersoneller: React.Dispatch<React.SetStateAction<Personel[]>>;
  cariKartlar?: any[];
}

export const PersonelScreen: React.FC<PersonelScreenProps> = ({
  personeller,
  setPersoneller,
  cariKartlar = []
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPersonel, setSelectedPersonel] = useState<Personel | null>(null);
  const [dismissingPersonel, setDismissingPersonel] = useState<Personel | null>(null);
  const [dismissDateStr, setDismissDateStr] = useState<string>("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPersonel, setHistoryPersonel] = useState<Personel | null>(null);

  // SGK PDF parsing states
  const [regMethod, setRegMethod] = useState<'manual' | 'sgk_pdf'>('manual');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSgkFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSgkFile(e.target.files[0]);
    }
  };

  const processSgkFile = (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setParseError("Lütfen sadece PDF veya Görsel (PNG, JPG, WEBP) formatında resmi SGK İşe Giriş Bildirgesi yükleyiniz.");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParseSuccess(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const response = await fetch('/api/parse-sgk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: file.type
          })
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "Belge yapay zeka tarafından çözümlenirken bir sorun oluştu.");
        }

        const parsed = resData.data;

        setFormData(prev => ({
          ...prev,
          tcNo: parsed.tcNo || prev.tcNo,
          ad: parsed.ad || prev.ad,
          soyad: parsed.soyad || prev.soyad,
          babaAdi: parsed.babaAdi || prev.babaAdi,
          dogumTarihi: parsed.dogumTarihi || prev.dogumTarihi,
          iseGirisTarihi: parsed.iseGirisTarihi || prev.iseGirisTarihi,
          cinsiyet: parsed.cinsiyet || prev.cinsiyet || 'Erkek',
          adres: parsed.adres || prev.adres,
          il: parsed.il || prev.il,
          ilce: parsed.ilce || prev.ilce,
          gorev: parsed.gorev || prev.gorev || 'İŞÇİ',
          ibanNo: parsed.ibanNo || prev.ibanNo || 'TR',
          bankaAdi: parsed.bankaAdi || prev.bankaAdi || '',
        }));

        let parsedMsg = `Yapay Zeka Çözümlemesi Başarılı! \nPersonel: ${parsed.ad || ''} ${parsed.soyad || ''} bilgileri form alanlarına otomatik dolduruldu.`;
        if (parsed.ibanNo) {
          parsedMsg += `\nIBAN: ${parsed.ibanNo} ve Banka: ${parsed.bankaAdi || ''} bilgileri de dekonttan çözümlendi.`;
        }
        setParseSuccess(parsedMsg);
        setRegMethod('manual');
      } catch (err: any) {
        console.error("SGK/Dekont parsing error:", err);
        let userFriendlyMsg = err.message || "Belge çözümlenemedi. Lütfen dosyanızın geçerli bir SGK İşe Giriş Bildirgesi veya Ödeme Dekontu olduğundan emin olun.";
        if (userFriendlyMsg.includes("503") || userFriendlyMsg.includes("UNAVAILABLE") || userFriendlyMsg.includes("high demand") || userFriendlyMsg.includes("experiencing high demand")) {
          userFriendlyMsg = "Yapay zeka servisi şu anda çok yoğun (Geçici 503 Hatası). Sunucu otomatik olarak yeniden denedi ancak yoğunluk devam ediyor. Lütfen birkaç saniye bekleyip tekrar dosya yüklemeyi deneyin veya Manuel Kayıt yöntemini kullanın.";
        }
        setParseError(userFriendlyMsg);
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Form States (for creating/updating)
  const emptyForm: Omit<Personel, 'id'> = {
    tcNo: "",
    ad: "",
    soyad: "",
    babaAdi: "",
    dogumTarihi: "",
    telefonNo: "+90 ",
    eposta: "",
    adres: "",
    il: "",
    ilce: "",
    departman: "Şantiye",
    gorev: "İŞÇİ",
    iseGirisTarihi: new Date().toISOString().split('T')[0],
    cinsiyet: "Erkek",
    maas: 30000,
    ucretTipi: "Aylık",
    sgkDurumu: "SGK'lı",
    bankaAdi: "",
    subeAdi: "",
    ibanNo: "TR",
    durum: true,
    firmaTipi: 'ANA_FIRMA',
    firmaAdi: 'Kibritçi İnşaat',
  };

  const [formData, setFormData] = useState<Omit<Personel, 'id'> | Personel>(emptyForm);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'maas' ? (parseFloat(value) || 0) : value
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleSelectPersonel = (p: Personel) => {
    setSelectedPersonel(p);
    setFormData(p);
  };

  const handleClearForm = () => {
    setSelectedPersonel(null);
    setFormData(emptyForm);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ad || !formData.soyad || !formData.tcNo) {
      alert("Lütfen en az Ad, Soyad ve TC Kimlik No alanlarını doldurun.");
      return;
    }

    if (formData.tcNo.length !== 11 || !/^\d+$/.test(dataToSave().tcNo)) {
      alert("TC Kimlik No tam 11 haneli ve sadece rakamlardan oluşmalıdır!");
      return;
    }

    if (!is_aktif_status(formData.durum) && !formData.istenCikisTarihi) {
      alert("HATA: İstihdam durumu 'Pasif / Ayrıldı' seçildiğinde, bir 'İşten Çıkış / Ayrılma Tarihi' girilmesi zorunludur! Lütfen tarihi yazın veya seçin.");
      return;
    }

    if ('id' in formData) {
      // Edit mode
      setPersoneller(prev => prev.map(p => p.id === formData.id ? (formData as Personel) : p));
      alert("Personel bilgileri başarıyla güncellendi.");
    } else {
      // Create mode
      const newPersonel: Personel = {
        ...formData,
        id: `p_${Date.now()}`
      };
      setPersoneller(prev => [newPersonel, ...prev]);
      alert("Yeni personel başarıyla kaydedildi.");
    }
    handleClearForm();
  };

  const handleDelete = (id: string) => {
    if (confirm("Seçili personeli kalıcı olarak silmek istediğinize emin misiniz?")) {
      setPersoneller(prev => prev.filter(p => p.id !== id));
      if (selectedPersonel?.id === id) {
        handleClearForm();
      }
    }
  };

  const dataToSave = () => formData;

  const filteredPersonel = personeller.filter(p => {
    const term = searchTerm.toLowerCase();
    const fullName = `${p.ad} ${p.soyad}`.toLowerCase();
    return fullName.includes(term) || p.tcNo.includes(term) || p.gorev.toLowerCase().includes(term);
  });

  const handleShowHistory = (p: Personel) => {
    setHistoryPersonel(p);
    setShowHistoryModal(true);
  };

  const generateHistoryReport = () => {
    if (!historyPersonel) return;
    const html = `
      <html>
        <head><meta charset="utf-8"><title>Personel Geçmiş Raporu</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
          <div style="text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="color: #1e3a5f; margin: 0; font-size: 24px;">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
            <p style="color: #666; margin: 5px 0; font-size: 12px;">PERSONEL GEÇMİŞ RAPORU</p>
            <p style="color: #999; font-size: 11px;">${historyPersonel.ad} ${historyPersonel.soyad} - ${historyPersonel.tcNo}</p>
          </div>
          <div style="font-size: 12px; line-height: 1.8;">
            <p><strong>Ad Soyad:</strong> ${historyPersonel.ad} ${historyPersonel.soyad}</p>
            <p><strong>TC No:</strong> ${historyPersonel.tcNo}</p>
            <p><strong>Görev:</strong> ${historyPersonel.gorev}</p>
            <p><strong>Departman:</strong> ${historyPersonel.departman}</p>
            <p><strong>İşe Giriş:</strong> ${historyPersonel.iseGirisTarihi || '-'}</p>
            <p><strong>Durum:</strong> ${historyPersonel.durum ? 'Aktif' : 'Pasif'} ${historyPersonel.istenCikisTarihi ? '(Çıkış: ' + historyPersonel.istenCikisTarihi + ')' : ''}</p>
            <p><strong>Firma:</strong> ${historyPersonel.firmaAdi || 'Kibritçi İnşaat'} ${historyPersonel.firmaTipi === 'TASERON' ? '(Taşeron)' : '(Ana Firma)'}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
            <p><em>Bu rapor personel kartı üzerinden otomatik oluşturulmuştur. İlişkili işlemler (izin, maaş, araç KM, kamp kaydı vb.) burada listelenecektir.</em></p>
          </div>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Personel_Gecmisi_${historyPersonel.tcNo}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col lg:flex-row font-sans gap-6 select-none bg-slate-50/50">

      {/* SOLID 40% LEFT PANEL: Dynamic Drawer for Create/Edit */}
      <div className="w-[430px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Header card indicator */}
        <div className="bg-[#2563EB] text-slate-100 p-4 shrink-0 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">
              Personel Kayıt & Düzenleme
            </span>
            <h3 className="font-display font-bold text-sm">
              { 'id' in formData ? "👤 Personel Bilgilerini Güncelle" : "👤 Yeni Personel Girişi" }
            </h3>
          </div>
          <span className="text-[10px] bg-blue-700/80 border border-blue-600 px-2 py-0.5 rounded-full font-mono font-bold">
            { 'id' in formData ? "Düzeltme Modu" : "Yeni Kayıt" }
          </span>
        </div>

        {/* Tab switcher for registration method - only shown in Create Mode */}
        { !('id' in formData) && (
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRegMethod('manual');
                setParseError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                regMethod === 'manual'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-150/80'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <UserPlus size={14} />
              Manuel Kayıt
            </button>
            <button
              type="button"
              onClick={() => {
                setRegMethod('sgk_pdf');
                setParseSuccess(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                regMethod === 'sgk_pdf'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-150/80'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <FileText size={14} />
              SGK veya Dekont ile Kayıt (AI)
            </button>
          </div>
        )}

        {regMethod === 'sgk_pdf' && !('id' in formData) ? (
          <div className="flex-1 flex flex-col p-5 space-y-4 overflow-y-auto">
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 space-y-1.5 text-slate-700">
              <h5 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-blue-600" />
                Yapay Zeka Destekli SGK & Dekont Girişi
              </h5>
              <p className="text-[11px] leading-relaxed text-blue-800">
                Resmi SGK İşe Giriş Bildirgesi veya Banka Transfer Dekontu (DEKONT.PDF) belgesini aşağıdaki alana yükleyerek; personelin Adı, Soyadı, TC No, IBAN No, Banka Adı ve diğer tüm bilgilerini yapay zeka aracılığıyla saniyeler içinde otomatik doldurabilirsiniz.
              </p>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`flex-grow min-h-[220px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition relative ${
                dragActive
                  ? "border-blue-500 bg-blue-50/30"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/30"
              }`}
            >
              {isParsing ? (
                <div className="space-y-3 flex flex-col items-center">
                  <Loader2 size={36} className="text-blue-600 animate-spin" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">Belge Analiz Ediliyor...</p>
                    <p className="text-[10px] text-slate-500">Gemini Yapay Zeka verileri çözümlüyor, lütfen bekleyin.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                    <UploadCloud size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700">
                      SGK Belgesini Sürükleyip Bırakın
                    </p>
                    <p className="text-[10px] text-slate-400">
                      veya bilgisayarınızdan seçmek için tıklayın
                    </p>
                  </div>
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-4 rounded-lg shadow-sm transition active:scale-95 inline-block">
                    Dosya Seç
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="text-[9px] text-slate-400">
                    Desteklenen formatlar: PDF, PNG, JPG, WEBP (Maks 10MB)
                  </p>
                </div>
              )}
            </div>

            {parseError && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex gap-2 text-rose-900">
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <div className="text-[11px] leading-normal font-medium">
                  {parseError}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Scrollable Form Body */
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
            {parseSuccess && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2 text-emerald-950 mb-3 animate-fade-in relative">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                <div className="text-[11px] leading-relaxed font-semibold pr-4">
                  {parseSuccess}
                </div>
                <button
                  type="button"
                  onClick={() => setParseSuccess(null)}
                  className="absolute top-2 right-2 text-emerald-500 hover:text-emerald-700 text-xs font-bold px-1"
                >
                  ×
                </button>
              </div>
            )}

          {/* Kimlik block */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Genel Künye
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">TC Kimlik No *</label>
                <input
                  type="text"
                  name="tcNo"
                  maxLength={11}
                  value={formData.tcNo}
                  onChange={handleInputChange}
                  className="w-full text-xs font-medium border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50 focus:border-blue-500 transition duration-150"
                  placeholder="11 Hane"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Cinsiyet</label>
                <select
                  name="cinsiyet"
                  value={formData.cinsiyet}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50 focus:border-blue-500 transition"
                >
                  <option value="Erkek">Erkek</option>
                  <option value="Kadın">Kadın</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Adı *</label>
                <input
                  type="text"
                  name="ad"
                  value={formData.ad}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50 focus:border-blue-500 transition"
                  placeholder="İsim"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Soyadı *</label>
                <input
                  type="text"
                  name="soyad"
                  value={formData.soyad}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50 focus:border-blue-500 transition"
                  placeholder="Soyisim"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Baba Adı</label>
                <input
                  type="text"
                  name="babaAdi"
                  value={formData.babaAdi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Doğum Tarihi</label>
                <input
                  type="date"
                  name="dogumTarihi"
                  value={formData.dogumTarihi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* İletişim block */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              İletişim &amp; Adres
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Telefon No</label>
                <input
                  type="text"
                  name="telefonNo"
                  value={formData.telefonNo}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="+90 "
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">E-Posta</label>
                <input
                  type="email"
                  name="eposta"
                  value={formData.eposta}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="ornek@kibritci.com"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Açık Adres</label>
              <textarea
                name="adres"
                value={formData.adres}
                onChange={handleInputChange}
                rows={2}
                className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50 resize-none"
                placeholder="Ev veya şantiye lojmanı adresi..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İkamet İl</label>
                <input
                  type="text"
                  name="il"
                  value={formData.il}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İkamet İlçe</label>
                <input
                  type="text"
                  name="ilce"
                  value={formData.ilce}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Firma Seçimi */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Firma Bağlılığı
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Tipi</label>
                <select
                  name="firmaTipi"
                  value={formData.firmaTipi || 'ANA_FIRMA'}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="ANA_FIRMA">Ana Firma (Kibritçi)</option>
                  <option value="TASERON">Taşeron Firma</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Adı</label>
                {formData.firmaTipi === 'TASERON' ? (
                  <select
                    name="firmaAdi"
                    value={formData.firmaAdi || ''}
                    onChange={handleInputChange}
                    className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  >
                    <option value="">Taşeron Seçin</option>
                    {cariKartlar.filter(c => c.tur === 'TASERON').map(c => (
                      <option key={c.id} value={c.unvan}>{c.unvan}</option>
                    ))}
                    <option value="MANUEL">Manuel Giriş (Diğer)</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    name="firmaAdi"
                    value={formData.firmaAdi || 'Kibritçi İnşaat'}
                    readOnly
                    className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-100 text-slate-500"
                  />
                )}
              </div>
            </div>
            {formData.firmaTipi === 'TASERON' && formData.firmaAdi === 'MANUEL' && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Firma Adı (Manuel)</label>
                <input
                  type="text"
                  name="firmaAdi"
                  value={formData.firmaAdi === 'MANUEL' ? '' : (formData.firmaAdi || '')}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="Taşeron firma adı..."
                />
              </div>
            )}
          </div>

          {/* Görev & Finansal block */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Görev &amp; Hak Ediş Bilgileri
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Departman</label>
                <select
                  name="departman"
                  value={formData.departman}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="Şantiye">Şantiye</option>
                  <option value="Ofis">Ofis</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Görev/Ünvan</label>
                <select
                  name="gorev"
                  value={formData.gorev}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="İŞÇİ">İŞÇİ</option>
                  <option value="FORMEN">FORMEN</option>
                  <option value="USTA">USTA</option>
                  <option value="MİRAR">MİMAR</option>
                  <option value="MÜHENDİS">MÜHENDİS</option>
                  <option value="ŞEF">ŞEF</option>
                  <option value="GÜVENLİK">GÜVENLİK</option>
                  <option value="DEPOCU">DEPOCU</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">İşe Giriş Tarihi</label>
                <input
                  type="date"
                  name="iseGirisTarihi"
                  value={formData.iseGirisTarihi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">SGK Durumu</label>
                <select
                  name="sgkDurumu"
                  value={formData.sgkDurumu}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="SGK'lı">SGK'lı</option>
                  <option value="Sigortasız">Sigortasız</option>
                  <option value="Stajyer">Stajyer</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Maaş (Brüt) *</label>
                <input
                  type="number"
                  name="maas"
                  value={formData.maas}
                  onChange={handleInputChange}
                  className="w-full text-xs font-semibold border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="30000"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Ücret Tipi</label>
                <select
                  name="ucretTipi"
                  value={formData.ucretTipi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                >
                  <option value="Aylık">Aylık</option>
                  <option value="Günlük">Günlük</option>
                  <option value="Saatlik">Saatlik</option>
                </select>
              </div>
            </div>
          </div>

          {/* Banka block */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Banka Hesap Bilgileri
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Banka Adı</label>
                <input
                  type="text"
                  name="bankaAdi"
                  value={formData.bankaAdi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="Örn: Garanti"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Şube Adı</label>
                <input
                  type="text"
                  name="subeAdi"
                  value={formData.subeAdi}
                  onChange={handleInputChange}
                  className="w-full text-xs border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                  placeholder="Örn: Merkez"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">IBAN Numarası</label>
              <input
                type="text"
                name="ibanNo"
                value={formData.ibanNo}
                onChange={handleInputChange}
                className="w-full text-xs font-mono font-medium border border-[#e2e8f0] rounded-lg mt-1 p-2 bg-slate-50"
                placeholder="TR000..."
              />
            </div>
          </div>

          {/* Status switch - matching custom color constraints */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 my-4">
            <span className="text-xs font-bold text-slate-700">İstihdam Durumu:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.durum}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setFormData(prev => ({
                    ...prev,
                    durum: isChecked,
                    istenCikisTarihi: isChecked ? undefined : (prev.istenCikisTarihi || new Date().toISOString().split('T')[0])
                  }));
                }}
              />
              <div className="w-11 h-6 bg-red-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              <span className={`ml-2 text-xs font-bold ${formData.durum ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formData.durum ? "Aktif Çalışan" : "Pasif / Ayrıldı"}
              </span>
            </label>
          </div>

          {!formData.durum && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg space-y-1.5 animate-fade-in my-3">
              <label className="text-[10px] font-bold text-rose-800 uppercase block">İşten Çıkış / Ayrılma Tarihi *</label>
              <input
                required
                type="date"
                name="istenCikisTarihi"
                value={formData.istenCikisTarihi || ''}
                onChange={handleInputChange}
                className="w-full text-xs border border-rose-200 rounded-lg p-2 bg-white text-rose-950 focus:outline-none focus:border-rose-500 font-semibold"
              />
              <p className="text-[9px] text-rose-600 font-medium font-sans">
                * Belirtilen çıkış tarihinden sonraki günler yoklamalarda ve maaş hakediş cetvellerinde otomatik kilitlenir.
              </p>
            </div>
          )}
        </form>
      )}

        {/* Action button bar */}
        {(regMethod === 'manual' || ('id' in formData)) && (
          <div className="p-4 border-t border-slate-100 flex gap-2 bg-slate-50/50">
            <button
              onClick={handleSave}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition cursor-pointer text-white font-bold text-xs py-2.5 rounded-xl shadow-md"
            >
              { 'id' in formData ? "Verileri Güncelle" : "Kaydı Tamamla" }
            </button>
            <button
              type="button"
              onClick={handleClearForm}
              className="bg-slate-500 hover:bg-slate-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition active:scale-[0.98]"
            >
              Formu Temizle
            </button>
          </div>
        )}
      </div>

      {/* SOLID 60% RIGHT PANEL: Quick filter table list */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Search header bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-550/10">
          <div className="flex items-center space-x-2">
            <Users size={16} className="text-[#f59e0b]" />
            <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest col-span-2">
              Kayıtlı Personel Kadrosu
            </h4>
          </div>

          <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <span className="text-xs">🔍</span>
            </span>
            <input
              type="text"
              placeholder="İsim veya soyisim ile filtrele..."
              className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-slate-700 focus:outline-none focus:border-blue-500 transition duration-150"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Scrollable list grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredPersonel.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 space-y-2">
              <span className="text-3xl">👤</span>
              <p className="text-xs font-medium">Uyanık personel kaydı bulunamadı.</p>
            </div>
          ) : (
            filteredPersonel.map((p) => {
              const isActive = p.durum;
              const isSelected = selectedPersonel?.id === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPersonel(p)}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs transition duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-500/50 shadow-sm'
                      : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.fotograf_url ? (
                        <p className="text-xl">🤵</p>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">{p.ad[0]}{p.soyad[0]}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                        {p.ad} {p.soyad}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          is_aktif_status(p.durum) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {is_aktif_status(p.durum) ? "Aktif" : "Pasif"}
                        </span>
                        {!is_aktif_status(p.durum) && p.istenCikisTarihi && (
                          <span className="text-[10px] bg-red-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-full font-bold">
                            Ayrılış: {p.istenCikisTarihi}
                          </span>
                        )}
                        {p.firmaTipi === 'TASERON' && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold">
                            {p.firmaAdi || 'Taşeron'}
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        TC: {p.tcNo} · Görev: <span className="text-slate-600 font-bold">{p.gorev}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="inline-flex items-center gap-1 bg-blue-50/60 border border-blue-100 text-[#1e4e78] px-2 py-0.5 rounded font-bold font-mono text-[9px]">
                          <span>📅 İşe Giriş:</span>
                          <span>{p.iseGirisTarihi || '-'}</span>
                        </span>
                        {!is_aktif_status(p.durum) && p.istenCikisTarihi && (
                          <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-100 text-rose-700 px-2 py-0.5 rounded font-black font-mono text-[9px]">
                            <span>🚫 İşten Çıkış:</span>
                            <span>{p.istenCikisTarihi}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Finance info */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-mono">Maas / Ücret</p>
                      <p className="font-bold text-emerald-600 font-mono text-xs">
                        ₺{p.maas.toLocaleString('tr-TR')} <span className="text-[9px] text-slate-400 font-normal">/ {p.ucretTipi}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 border-l pl-3 border-slate-100">
                      <button
                        title="Geçmiş Raporu"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowHistory(p);
                        }}
                        className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        <History size={13} />
                      </button>

                      <button
                        title="Bilgileri Düzenle"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPersonel(p);
                        }}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        <Edit3 size={13} />
                      </button>

                      {is_aktif_status(p.durum) && (
                        <button
                          title="İşten Çıkar"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissDateStr(new Date().toISOString().split('T')[0]);
                            setDismissingPersonel(p);
                          }}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition active:scale-95 flex items-center justify-center"
                        >
                          <UserX size={13} />
                        </button>
                      )}

                      <button
                        title="Sicil Sil"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* İŞTEN ÇIKARMA TARİH SEÇİM MODALİ */}
      {dismissingPersonel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl border border-slate-150 p-6 w-[400px] max-w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-rose-600">
              <UserX size={20} />
              <h3 className="font-display font-bold text-sm uppercase tracking-wider">Personel İşten Çıkarma</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>{dismissingPersonel.ad} {dismissingPersonel.soyad}</strong> isimli personelin işten çıkış kaydı yapılacaktır. Lütfen ayrılma tarihini belirleyin:
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">İşten Çıkış/Ayrılma Tarihi *</label>
              <input
                type="date"
                required
                value={dismissDateStr}
                onChange={(e) => setDismissDateStr(e.target.value)}
                className="w-full text-xs font-semibold border border-rose-200 rounded-lg p-2.5 bg-slate-50 text-rose-950 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!dismissDateStr) {
                    alert("Lütfen geçerli bir tarih seçin.");
                    return;
                  }
                  setPersoneller(prev => prev.map(p => {
                    if (p.id === dismissingPersonel.id) {
                      return {
                        ...p,
                        durum: false,
                        istenCikisTarihi: dismissDateStr
                      };
                    }
                    return p;
                  }));

                  if (formData && 'id' in formData && formData.id === dismissingPersonel.id) {
                    setFormData(prev => ({
                      ...prev,
                      durum: false,
                      istenCikisTarihi: dismissDateStr
                    }));
                  }

                  alert(`${dismissingPersonel.ad} ${dismissingPersonel.soyad} isimli personelin işten çıkış tarihi (${dismissDateStr}) kaydedildi ve statüsü Pasif yapıldı.`);
                  setDismissingPersonel(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-xl transition cursor-pointer select-none"
              >
                KAYDET
              </button>
              <button
                type="button"
                onClick={() => setDismissingPersonel(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer select-none"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GEÇMİŞ RAPORU MODALİ */}
      {showHistoryModal && historyPersonel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-150 p-6 w-[500px] max-w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-blue-600">
                <History size={20} />
                <h3 className="font-display font-bold text-sm uppercase tracking-wider">Personel Geçmiş Raporu</h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs">
              <p><strong>Ad Soyad:</strong> {historyPersonel.ad} {historyPersonel.soyad}</p>
              <p><strong>TC No:</strong> {historyPersonel.tcNo}</p>
              <p><strong>Görev:</strong> {historyPersonel.gorev}</p>
              <p><strong>Departman:</strong> {historyPersonel.departman}</p>
              <p><strong>İşe Giriş:</strong> {historyPersonel.iseGirisTarihi || '-'}</p>
              <p><strong>Durum:</strong> {historyPersonel.durum ? 'Aktif' : 'Pasif'} {historyPersonel.istenCikisTarihi ? `(Çıkış: ${historyPersonel.istenCikisTarihi})` : ''}</p>
              <p><strong>Firma:</strong> {historyPersonel.firmaAdi || 'Kibritçi İnşaat'} {historyPersonel.firmaTipi === 'TASERON' ? '(Taşeron)' : '(Ana Firma)'}</p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İlişkili İşlemler</p>
              <div className="space-y-1 text-[10px] text-slate-500">
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-blue-500" />
                  <span>İzin Dilekçeleri (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-amber-500" />
                  <span>Araç KM Girişleri (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-emerald-500" />
                  <span>Kamp Kayıtları (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <FileText size={12} className="text-rose-500" />
                  <span>Maaş Hakedişleri (bu modül entegrasyonu sonraki aşamada eklenecektir)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={generateHistoryReport} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1">
                <Download size={12} /> Raporu İndir
              </button>
              <button onClick={() => setShowHistoryModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function formData_durum_get(val: any) {
    return formData.durum;
  }

  function is_aktif_status(val: any) {
    return val === true || val === 1 || String(val).toLowerCase() === 'true';
  }
};
export default PersonelScreen;
