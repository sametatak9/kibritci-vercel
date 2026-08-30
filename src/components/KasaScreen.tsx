import React, { useState, useRef } from 'react';
import { 
  Wallet, Plus, Trash2, ArrowUpRight, ArrowDownRight, Printer, Edit3,
  Calendar, FileText, Search, CreditCard, ChevronRight, Eye, Image as ImageIcon, CheckCircle, AlertCircle
} from 'lucide-react';
import { KasaHareketi } from '../types/erp';
import { KibritciLogo } from './KibritciLogo';
import { compressImage } from '../lib/imageCompress';

interface KasaScreenProps {
  kasaHareketleri: KasaHareketi[];
  setKasaHareketleri: React.Dispatch<React.SetStateAction<KasaHareketi[]>>;
}


export const KasaScreen: React.FC<KasaScreenProps> = ({ 
  kasaHareketleri, 
  setKasaHareketleri 
}) => {
  // Exact layout filters matching top of table in the screenshot
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-30");
  const [appliedStartDate, setAppliedStartDate] = useState("2026-06-01");
  const [appliedEndDate, setAppliedEndDate] = useState("2026-06-30");
  const [searchKeyword, setSearchKeyword] = useState("");

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form Fields
  const [newDate, setNewDate] = useState("2026-06-19");
  const [newType, setNewType] = useState<'GİRİŞ' | 'ÇIKIŞ'>("GİRİŞ");
  const [newAmount, setNewAmount] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRefType, setNewRefType] = useState<'DİĞER' | 'FATURA' | 'İRSALİYE' | 'MAAS' | 'SATIN ALMA'>("DİĞER");
  const [newRefId, setNewRefId] = useState("");
  
  // File Upload State
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected receipt for preview modal
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);
  const [selectedReceiptName, setSelectedReceiptName] = useState<string | null>(null);

  // Weekly Cash Report Print Modal Toggle
  const [showWeeklyReportModal, setShowWeeklyReportModal] = useState(false);

  // Totals calculations based on currently loaded state
  const totalIn = kasaHareketleri
    .filter(k => k.hareketTipi === 'GİRİŞ')
    .reduce((sum, current) => sum + current.tutar, 0);

  const totalOut = kasaHareketleri
    .filter(k => k.hareketTipi === 'ÇIKIŞ')
    .reduce((sum, current) => sum + current.tutar, 0);

  // Handle Drag & Drop Events
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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file: File) => {
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64);
      setUploadedFileBase64(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === "") return;
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Safe validation & submit
  const handleSaveKasaHareketi = (e: React.FormEvent) => {
    e.preventDefault();
    const amountFloat = parseFloat(newAmount) || 0;
    if (amountFloat <= 0) {
      alert("Lütfen geçerli bir tutar yazın.");
      return;
    }
    if (!newDesc) {
      alert("Lütfen açıklama girin.");
      return;
    }

    if (editingId) {
      // Editing Mode
      setKasaHareketleri(prev => prev.map(item => {
        if (item.id === editingId) {
          return {
            ...item,
            tarih: newDate,
            hareketTipi: newType,
            tutar: amountFloat,
            aciklama: newDesc,
            referansTipi: newRefType,
            referansId: newRefId || undefined,
            fisEvrakUrl: uploadedFileBase64 || item.fisEvrakUrl
          };
        }
        return item;
      }));
      setEditingId(null);
      alert("Kasa hareketi başarıyla güncellendi.");
    } else {
      // Create Mode
      const newHareketi: KasaHareketi = {
        id: `kh_${Date.now()}`,
        tarih: newDate,
        hareketTipi: newType,
        tutar: amountFloat,
        aciklama: newDesc,
        referansTipi: newRefType,
        referansId: newRefId || undefined,
        fisEvrakUrl: uploadedFileBase64 || undefined
      };
      setKasaHareketleri(prev => [newHareketi, ...prev]);
      alert("Kasa hareketi ve fatura/fiş görseli başarıyla arşivlendi.");
    }

    // Clear Form fields
    setNewAmount("");
    setNewDesc("");
    setNewRefId("");
    setUploadedFileName(null);
    setUploadedFileBase64(null);
  };

  const handleStartEdit = (kh: KasaHareketi) => {
    setEditingId(kh.id);
    setNewDate(kh.tarih);
    setNewType(kh.hareketTipi);
    setNewAmount(String(kh.tutar));
    setNewDesc(kh.aciklama);
    setNewRefType(kh.referansTipi);
    setNewRefId(kh.referansId || "");
    setUploadedFileName(kh.fisEvrakUrl ? "Kayıtlı Fiş Görseli Mevcut" : null);
    setUploadedFileBase64(kh.fisEvrakUrl || null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewAmount("");
    setNewDesc("");
    setNewRefId("");
    setUploadedFileName(null);
    setUploadedFileBase64(null);
  };

  const handleDeleteKasaHareketi = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Bu kasa hareketini silmek istediğinize emin misiniz?")) {
      setKasaHareketleri(prev => prev.filter(k => k.id !== id));
      if (editingId === id) {
        handleCancelEdit();
      }
    }
  };

  const handleFilterSubmit = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  // Filter records in range and search text keyword match
  const filteredHareketler = kasaHareketleri.filter(kh => {
    const isWithinDate = kh.tarih >= appliedStartDate && kh.tarih <= appliedEndDate;
    if (!isWithinDate) return false;

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchDesc = kh.aciklama.toLowerCase().includes(kw);
      const matchType = kh.referansTipi.toLowerCase().includes(kw);
      const matchId = (kh.referansId || "").toLowerCase().includes(kw);
      return matchDesc || matchType || matchId;
    }
    return true;
  });

  return (
    <div className="flex-grow p-6 h-full flex flex-col font-sans gap-6 select-none bg-slate-50">
      
      {/* Dynamic Module Header Section aligned with style */}
      <div className="flex items-center justify-between shrink-0 border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center space-x-2">
            <span>Haftalık Kasa</span>
          </h1>
          <p className="text-[#64748b] text-xs font-semibold mt-0.5">
            Fiş yüklemeli kasa hareketleri, düzenleme ve döküm yönetimi
          </p>
        </div>
        
        <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
          Aktif Modül
        </span>
      </div>

      {/* Financial statistics dashboard grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        {[
          { title: "Toplam Giriş", value: `₺${totalIn.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-emerald-100 bg-emerald-50/70 text-emerald-800", icon: ArrowUpRight },
          { title: "Toplam Çıkış", value: `₺${totalOut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-rose-100 bg-rose-50/70 text-rose-800", icon: ArrowDownRight },
          { title: "Net Kasa Bakiyesi", value: `₺${(totalIn - totalOut).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-amber-150 bg-amber-50/70 text-amber-800 font-bold", icon: Wallet }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs ${item.color}`}>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                  {item.title}
                </span>
                <span className="text-xl font-black font-mono">
                  {item.value}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border shadow-xs text-slate-700">
                <Icon size={20} className="stroke-[2.5]" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main split dashboard view */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        
        {/* Left side Form creator */}
        <div className="w-[380px] shrink-0 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          
          {/* Header styling exactly matching screenshot blue/amber block */}
          <div className={`p-4 shrink-0 shadow-sm flex items-center justify-between text-white ${editingId ? 'bg-amber-600' : 'bg-[#2563EB]'}`}>
            <div className="flex items-center space-x-2">
              <Wallet size={16} />
              <h3 className="font-bold text-xs uppercase tracking-widest">
                {editingId ? "KASA KAYDI DÜZENLE" : "YENİ KASA HAREKETİ"}
              </h3>
            </div>
            {editingId && (
              <button 
                onClick={handleCancelEdit}
                className="text-[10px] bg-amber-700 font-bold px-2 py-0.5 rounded cursor-pointer hover:bg-amber-805"
              >
                Vazgeç
              </button>
            )}
          </div>

          <form onSubmit={handleSaveKasaHareketi} className="flex-grow overflow-y-auto p-5 space-y-4 text-xs">
            
            {/* Tarih Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1 font-sans">
                <span>🗓️ Tarih</span>
              </label>
              <input 
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 max-h-10 outline-none"
              />
            </div>

            {/* Hareket Tipi Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>📊 Hareket Tipi</span>
              </label>
              <select 
                className="w-full text-xs font-bold p-2 bg-slate-55 border border-slate-200 rounded-xl max-h-10 cursor-pointer outline-none"
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
              >
                <option value="GİRİŞ">📈 GİRİŞ (Gelir / Hakediş)</option>
                <option value="ÇIKIŞ">📉 ÇIKIŞ (Fişli Gider / Avans)</option>
              </select>
            </div>

            {/* Tutar Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>💵 Tutar (₺)</span>
              </label>
              <input 
                type="number"
                required
                placeholder="0.00"
                className="w-full text-xs font-black p-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>

            {/* Açıklama Row */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>📝 Açıklama</span>
              </label>
              <input 
                type="text"
                required
                placeholder="Harcama veya Gelir Açıklaması..."
                className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>

            {/* Referans Tipi */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">🔗 Referans Tipi</label>
              <select 
                className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer outline-none"
                value={newRefType}
                onChange={(e) => setNewRefType(e.target.value as any)}
              >
                <option value="DİĞER">DİĞER</option>
                <option value="FATURA">FATURA</option>
                <option value="İRSALİYE">İRSALİYE</option>
                <option value="MAAS">PERSONEL MAAŞI</option>
                <option value="SATIN ALMA">SATIN ALMA</option>
              </select>
            </div>

            {/* Referans ID */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center space-x-1">
                <span>🆔 Referans ID</span>
              </label>
              <input 
                type="text"
                placeholder="İsteğe bağlı döküman no veya referans kodu..."
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                value={newRefId}
                onChange={(e) => setNewRefId(e.target.value)}
              />
            </div>

            {/* Fiş/Fotoğraf Dropzone Drag & Drop */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block font-sans">📷 Fiş/Fatura Evrak Fotoğrafı</label>
              
              <div 
                className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center transition text-center relative ${
                  dragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  type="file"
                  id="receipt-file-input"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,application/pdf"
                  className="hidden"
                />

                {uploadedFileName ? (
                  <div className="space-y-2 py-1">
                    <FileText className="mx-auto text-blue-500 animate-bounce" size={24} />
                    <div className="text-[10px] font-bold text-slate-700 max-w-[280px] truncate">
                      {uploadedFileName}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setUploadedFileName(null); setUploadedFileBase64(null); }}
                      className="text-[9px] text-rose-500 hover:underline font-bold cursor-pointer"
                    >
                      Evrak Görselini Kaldır
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <p className="text-[10px] text-slate-400 font-medium font-sans">Fiş/Fatura yüklenmedi</p>
                    <button 
                      type="button"
                      onClick={triggerFileInput}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg shadow-sm transition cursor-pointer"
                    >
                      📁 Evrak Görseli Seç
                    </button>
                    <p className="text-[9px] text-slate-400 font-sans">veya buraya sürükleyip bırakın</p>
                  </div>
                )}
              </div>
            </div>

            {/* Submit movement to secure database */}
            <button 
              type="submit"
              className={`w-full text-white font-bold py-2.5 rounded-xl transition shadow-md cursor-pointer text-xs uppercase ${
                editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {editingId ? "KAYDI GÜNCELLE VE VUR" : "Hareketi Veritabanına İşle"}
            </button>
          </form>
        </div>

        {/* Right side Table history */}
        <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
          
          {/* Header toolbar exactly matching screenshot style */}
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center space-x-2">
              <h4 className="font-bold text-sm text-slate-800 uppercase tracking-widest">Kasa Hareketleri Defteri</h4>
            </div>

            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md shrink-0 font-mono">
              {filteredHareketler.length} kayıt listelendi
            </span>
          </div>

          {/* Filters and search input boxes */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 select-none">
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2">
                <span className="text-slate-400">📅</span>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none"
                />
              </div>
              
              <span className="text-slate-400 font-bold">-</span>

              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2">
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none"
                />
              </div>

              <button 
                onClick={handleFilterSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] py-1.5 px-3 rounded-lg shadow-sm transition cursor-pointer font-sans"
              >
                Filtrele
              </button>
            </div>

            {/* Real Search Input Box */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs space-x-2 w-48">
              <span className="text-slate-400">🔍</span>
              <input 
                type="text"
                placeholder="Açıklama, ref vb. ara..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-transparent border-none text-[11px] font-semibold text-slate-700 focus:outline-none w-full"
              />
            </div>
          </div>

          {/* List area customized exactly as visual table with custom headers */}
          <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
            
            {/* Headers row exactly mimicking table headers */}
            <div className="grid grid-cols-5 bg-slate-100/80 border-b border-slate-250 text-[10px] font-bold text-slate-500 uppercase tracking-wider py-2 px-4 shadow-3xs shrink-0 select-none">
              <div>Tarih</div>
              <div>Tip</div>
              <div>Tutar</div>
              <div className="col-span-2">Açıklama &amp; Referans &amp; İşlem Barları</div>
            </div>

            {filteredHareketler.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                <AlertCircle className="text-slate-350" size={32} />
                <p className="text-xs font-semibold font-sans">Bu kriterlerde şantiye kasa kaydı bulunmamaktadır.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 divide-dashed overflow-y-auto">
                {filteredHareketler.map(kh => (
                  <div 
                    key={kh.id} 
                    className={`grid grid-cols-5 items-center py-2.5 px-4 text-xs transition cursor-default group ${
                      editingId === kh.id ? 'bg-amber-50' : 'hover:bg-amber-500/5'
                    }`}
                  >
                    {/* Tarih Column */}
                    <div className="font-mono text-[11px] font-bold text-slate-500 flex items-center space-x-1">
                      <Calendar size={11} className="text-slate-400" />
                      <span>{kh.tarih}</span>
                    </div>

                    {/* Tip Column */}
                    <div>
                      <span className={`inline-block py-0.5 px-2 rounded-full text-[10px] font-extrabold ${
                        kh.hareketTipi === 'GİRİŞ' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        {kh.hareketTipi}
                      </span>
                    </div>

                    {/* Tutar Column */}
                    <div className={`font-mono font-black text-xs ${
                      kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {kh.hareketTipi === 'GİRİŞ' ? '+' : '-'}₺{kh.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>

                    {/* Açıklama & Referans Column details combo span 2 */}
                    <div className="col-span-2 flex items-center justify-between pr-2 min-w-0">
                      <div className="truncate pr-4">
                        <h5 className="font-bold text-slate-800 truncate leading-tight" title={kh.aciklama}>{kh.aciklama}</h5>
                        <p className="text-[9px] text-[#64748b] font-semibold uppercase tracking-wider mt-0.5 truncate">
                          {kh.referansTipi} {kh.referansId && `[ No: ${kh.referansId} ]`}
                        </p>
                      </div>

                      {/* Interactive Visual Action Icons */}
                      <div className="flex items-center space-x-1 shrink-0">
                        {kh.fisEvrakUrl && (
                          <button 
                            onClick={() => {
                              setSelectedReceiptUrl(kh.fisEvrakUrl || null);
                              setSelectedReceiptName(kh.aciklama);
                            }}
                            className="p-1 px-1.5 bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-700 rounded-lg flex items-center space-x-1 transition shadow-xs text-[9px] font-bold cursor-pointer"
                            title="Fatura/Fiş Evrak Görselini Göster"
                          >
                            <ImageIcon size={10} />
                            <span>Evrak Gör</span>
                          </button>
                        )}
                        <button 
                          onClick={() => handleStartEdit(kh)}
                          className="p-1 px-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 rounded-lg flex items-center space-x-1 transition text-[9px] font-bold cursor-pointer"
                          title="Düzenle"
                        >
                          <Edit3 size={11} />
                          <span>Düz.</span>
                        </button>
                        <button 
                          onClick={(e) => handleDeleteKasaHareketi(kh.id, e)}
                          className="p-1.5 hover:bg-rose-50 text-slate-350 hover:text-rose-600 rounded-lg transition shrink-0 cursor-pointer"
                          title="Hareketi Sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PDF Download summary bar */}
          <div className="p-3 border-t bg-slate-50/50 flex justify-end shrink-0 select-none">
            <button 
              onClick={() => setShowWeeklyReportModal(true)}
              className="bg-amber-500 hover:bg-amber-600 border border-amber-600 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Printer size={12} />
              <span>📊 Haftalık Kasa PDF Raporu Al</span>
            </button>
          </div>
        </div>
      </div>

      {/* High Fidelity Receipt Image Preview Modal Frame */}
      {selectedReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs select-none">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono tracking-widest text-[#F59E0B] uppercase font-bold">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</p>
                <h4 className="text-xs font-bold text-white truncate max-w-[320px]">{selectedReceiptName} - EVRAK / FİŞ DOSYA GÖRSELİ</h4>
              </div>
              <button 
                onClick={() => { setSelectedReceiptUrl(null); setSelectedReceiptName(null); }}
                className="text-slate-400 hover:text-white bg-slate-850 p-1.5 rounded-lg border border-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 flex justify-center items-center bg-slate-950/40">
              <img 
                src={selectedReceiptUrl} 
                alt="Şantiye Fiş Görseli" 
                className="max-w-full max-h-[50vh] object-contain rounded-xl border border-slate-850"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex justify-between items-center">
              <span className="text-[9px] text-slate-500 font-mono">Güvenli Cloud Depolama Noktası / Fatura-Fiş Arşivi</span>
              <button 
                onClick={() => { setSelectedReceiptUrl(null); setSelectedReceiptName(null); }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl shadow transition"
              >
                Pencereyi Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 HIGH FIDELITY WEEKLY CASH REPORT PRINT OVERLAY MODEL WITH IMAGES      */}
      {/* ========================================================================= */}
      {showWeeklyReportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 flex items-start justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-7xl shadow-2xl flex flex-col overflow-hidden my-4 text-slate-900">
            
            {/* Modal Actions Header */}
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center px-6 shrink-0 print:hidden">
              <div className="flex items-center space-x-2">
                <span className="text-xl">💰</span>
                <h3 className="font-display font-bold text-sm">
                  Haftalık Kasa Gelir / Gider Defteri Baskı Önizlemesi
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  🖨️ Yazdır / PDF Olarak Kaydet (Ctrl+P)
                </button>
                <button
                  onClick={() => {
                    const el = document.querySelector('.kasa-report-printable-area');
                    if (el) {
                      const heading = `Kibritci_Insaat_Haftalik_Kasa_Raporu_${appliedStartDate}_to_${appliedEndDate}`;
                      const blob = new Blob([`
                        <html>
                          <head>
                            <meta charset="utf-8">
                            <title>Şantiye Haftalık Kasa Raporu</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                          </head>
                          <body class="p-8 bg-white text-slate-900 font-sans">
                            ${el.innerHTML}
                          </body>
                        </html>
                      `], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${heading}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                      alert("Haftalık kasa döküm mutabakat raporu başarıyla derlendi ve masaüstünüze HTML/Yazdırılabilir formatta kaydedildi.");
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  💾 Masaüstüne HTML Rapor Dosyası Kaydet
                </button>
                <button
                  onClick={() => setShowWeeklyReportModal(false)}
                  className="bg-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            {/* Document Body Area suitable for landscape rendering */}
            <div className="flex-1 overflow-auto bg-white p-12 text-slate-900 kasa-report-printable-area font-sans">
              
              {/* Report Corporate Header */}
              <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <KibritciLogo size="xl" />
                  <div>
                    <h1 className="text-xl font-black text-[#1E4E78] tracking-tight">KİBRİTÇİ İNŞAAT TAAHHÜT A.Ş.</h1>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ŞANTİYE MERKEZ VE MUHASEBE VE FİNANSAL HAKEDİŞ DAİRESİ</p>
                    <p className="text-[10px] text-slate-650 mt-1">Sorgu Aralığı: <strong className="text-slate-900 font-black">{appliedStartDate} / {appliedEndDate}</strong></p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="border border-slate-900 text-[10px] font-bold px-3 py-1 bg-slate-50 uppercase tracking-widest block mb-1">
                    KOD: KBR-KASA-{Date.now().toString().substring(0, 8)}
                  </span>
                  <p className="text-[9px] text-slate-405 font-mono">Baskı Zamanı: {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR')}</p>
                </div>
              </div>

              {/* Title Header Section */}
              <div className="text-center mb-6">
                <h2 className="text-sm font-bold text-slate-905 tracking-wider uppercase border-y border-slate-200 py-2.5 bg-slate-50">
                  ŞANTİYE HAFTALIK NAKİT AKIŞ VE KASA HAREKETLERİ CETVELİ
                </h2>
              </div>

              {/* Statistical Summary Box inside Report */}
              <div className="grid grid-cols-3 gap-4 border p-4 rounded-xl mb-6 bg-slate-50/50 text-xs">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">YAZDIRILAN GİRİŞ TOPLAMI</p>
                  <p className="text-sm font-black text-emerald-700 mt-1">₺{filteredHareketler.filter(k=>k.hareketTipi==='GİRİŞ').reduce((s,c)=>s+c.tutar,0).toLocaleString('tr-TR', {minimumFractionDigits:2})}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">YAZDIRILAN ÇIKIŞ TOPLAMI</p>
                  <p className="text-sm font-black text-rose-700 mt-1">₺{filteredHareketler.filter(k=>k.hareketTipi==='ÇIKIŞ').reduce((s,c)=>s+c.tutar,0).toLocaleString('tr-TR', {minimumFractionDigits:2})}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">SORGULANAN ARALIK NET KASA BAKİYESİ</p>
                  <p className="text-sm font-black text-amber-700 mt-1">₺{(filteredHareketler.filter(k=>k.hareketTipi==='GİRİŞ').reduce((s,c)=>s+c.tutar,0) - filteredHareketler.filter(k=>k.hareketTipi==='ÇIKIŞ').reduce((s,c)=>s+c.tutar,0)).toLocaleString('tr-TR', {minimumFractionDigits:2})}</p>
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-slate-350 rounded-md overflow-hidden mb-8">
                <table className="w-full text-[9px] border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                      <th className="p-2 border-r border-slate-300 w-24 text-left">Tarih</th>
                      <th className="p-2 border-r border-slate-300 w-24 text-left">İşlem Tipi</th>
                      <th className="p-2 border-r border-slate-300 text-left">Açıklama</th>
                      <th className="p-2 border-r border-slate-300 w-32 text-left">Referans / Evrak No</th>
                      <th className="p-2 text-right w-36">İşlem Tutarı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHareketler.map((kh, idx) => (
                      <tr key={kh.id || idx} className="border-b border-slate-200 hover:bg-slate-50 font-medium">
                        <td className="p-2 border-r border-slate-300 font-mono text-slate-500">{kh.tarih}</td>
                        <td className="p-2 border-r border-slate-300 font-bold text-[9px]">
                          <span className={kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-700' : 'text-rose-700'}>
                            {kh.hareketTipi}
                          </span>
                        </td>
                        <td className="p-2 border-r border-slate-300 text-slate-800 font-semibold">{kh.aciklama}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-slate-450 uppercase">{kh.referansTipi} {kh.referansId ? `[No: ${kh.referansId}]` : ""}</td>
                        <td className={`p-2 text-right font-mono font-bold ${kh.hareketTipi === 'GİRİŞ' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {kh.hareketTipi === 'GİRİŞ' ? '+' : '-'} ₺{kh.tutar.toLocaleString('tr-TR', {minimumFractionDigits:2})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* INLINE ATTACHMENTS / RECEIPTS SECTION AS REQUESTED */}
              <div className="mt-8 space-y-4 print:break-inside-avoid">
                <h3 className="text-xs font-black text-[#1E4E78] uppercase border-b-2 border-[#1E4E78] pb-1 tracking-wider">
                  📷 RAPOR EKİ FİŞ, FATURA VE HARCAMA DOSYA RESİMLERİ
                </h3>
                
                {filteredHareketler.filter(k => k.fisEvrakUrl).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Rapor kapsamına girmiş herhangi bir fiş görseli veya fatura eki eklenmemiştir.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {filteredHareketler.filter(k => k.fisEvrakUrl).map((kh, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col items-center justify-between text-center space-y-2">
                        <div className="text-[10px] text-slate-600 font-bold uppercase truncate max-w-[200px]">
                          {kh.tarih} · {kh.aciklama}
                        </div>
                        <img 
                          src={kh.fisEvrakUrl} 
                          alt="Fiş Fotoğrafı" 
                          className="max-h-[140px] rounded object-contain border bg-white" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[8px] text-slate-400 font-mono uppercase tracking-tight">KONTROL ID: {kh.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Official corporate Sign-off Area arranged in user specified order */}
              <div className="mt-12 text-xs print:break-inside-avoid">
                <div className="bg-[#1E4E78] text-white p-2 text-[9px] font-bold uppercase tracking-wider mb-6 rounded-md">
                  📌 FİNANSAL HAKEDİŞ VE BORDRO NAKİT AKIŞ MERCİLERİ
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">1. MUHASEBE</span>
                    <span className="text-[10px] text-slate-500 block mb-6">Finansal hakediş ve kasa girişi</span>
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">Bordro Yetkilisi</span>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">2. İDARİ İŞLER</span>
                    <span className="text-[10px] text-slate-500 block mb-6">Şantiye Şefliği</span>
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">İdari İşler Şefi</span>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                    <span className="font-extrabold text-[#1E4E78] tracking-wider uppercase block mb-1">3. ŞANTİYE ŞEFİ</span>
                    <span className="text-[10px] text-slate-500 block mb-6">Saha organizasyonu fiili kontrol</span>
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">Şantiye Şefi</span>
                  </div>

                  <div className="border border-slate-150 p-3 rounded-xl bg-slate-50">
                    <span className="font-extrabold text-[#8B1E1E] tracking-wider uppercase block mb-1">4. PROJE MÜDÜRÜ</span>
                    <span className="text-[10px] text-slate-500 block mb-6">Müteahhit ve Nihai Onaycı Müdür</span>
                    <div className="h-10 border-b border-dashed border-slate-200 w-24 mx-auto mb-2"></div>
                    <span className="text-[10px] font-bold text-slate-800 block">Proje Müdürü</span>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default KasaScreen;

