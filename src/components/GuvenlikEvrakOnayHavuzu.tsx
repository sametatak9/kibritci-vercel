import React, { useState } from 'react';
import { Truck, CreditCard, Eye, Check, X, Sparkles, ExternalLink, FileText, Download, ZoomIn, Loader2 } from 'lucide-react';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { ImzaOnizlemeStrip } from './ImzaOnizlemeStrip';
import { AcilOnayBadge } from './AcilOnayBadge';
import {
  collectAllFotoUrls,
  GUVENLIK_FOTO_METOD_LABEL,
  GuvenlikFotoSlot,
  isLikelyImageUrl,
  pickPrimaryFotoUrl,
  formatEvrakGonderimLabel,
} from '../lib/guvenlikEvrakFotolar';

interface GuvenlikEvrakOnayHavuzuProps {
  pendingGateDocs: any[];
  pendingWaybills: any[];
  pendingInvoices: any[];
  signatureText?: string;
  setActiveDocForDetail: (val: any) => void;
  handleApproveDocument: (type: 'waybill' | 'invoice', id: string) => void;
  handleRejectGateDoc: (id: string) => void;
  handleOpenGateDocApproval: (doc: any) => void;
  handleQuickApproveGateIrsaliye?: (doc: any) => void;
  handleRematchActiveGateIrsaliye?: () => void;
  activeGateDoc: any | null;
  setActiveGateDoc: (val: any) => void;
  approvalStep: 'SELECT_METHOD' | 'FORM';
  setApprovalStep: (val: 'SELECT_METHOD' | 'FORM') => void;
  selectedDocType: 'FATURA' | 'İRSALİYE' | 'MAKBUZ' | 'GENEL_EVRAK';
  setSelectedDocType: (val: 'FATURA' | 'İRSALİYE' | 'MAKBUZ' | 'GENEL_EVRAK') => void;
  isAiResolving: boolean;
  handleAnalyzeGateDocWithAi: () => void;
  handleStartManualGateDocApproval: () => void;
  handleSaveGateDocApproval: (e: React.FormEvent) => void;

  faturaNo: string;
  setFaturaNo: (val: string) => void;
  faturaFirma: string;
  setFaturaFirma: (val: string) => void;
  faturaTarih: string;
  setFaturaTarih: (val: string) => void;
  faturaToplam: number;
  setFaturaToplam: (val: number) => void;
  faturaKdv: number;
  setFaturaKdv: (val: number) => void;
  faturaGenelToplam: number;
  setFaturaGenelToplam: (val: number) => void;
  faturaKalemler: any[];
  setFaturaKalemler: React.Dispatch<React.SetStateAction<any[]>>;

  irsaliyeNo: string;
  setIrsaliyeNo: (val: string) => void;
  irsaliyeFirma: string;
  setIrsaliyeFirma: (val: string) => void;
  irsaliyeTarih: string;
  setIrsaliyeTarih: (val: string) => void;
  irsaliyeKalemler: any[];
  setIrsaliyeKalemler: React.Dispatch<React.SetStateAction<any[]>>;

  makbuzRefNo: string;
  setMakbuzRefNo: (val: string) => void;
  makbuzFirma: string;
  setMakbuzFirma: (val: string) => void;
  makbuzTarih: string;
  setMakbuzTarih: (val: string) => void;
  makbuzTutar: number;
  setMakbuzTutar: (val: number) => void;
  makbuzAciklama: string;
  setMakbuzAciklama: (val: string) => void;
  makbuzTip: 'GİRİŞ' | 'ÇIKIŞ';
  setMakbuzTip: (val: 'GİRİŞ' | 'ÇIKIŞ') => void;

  genelAciklama: string;
  setGenelAciklama: (val: string) => void;

  itemUrunAdi: string;
  setItemUrunAdi: (val: string) => void;
  itemMiktar: number | '';
  setItemMiktar: (val: number | '') => void;
  itemBirim: string;
  setItemBirim: (val: string) => void;
  itemBirimFiyat: number | '';
  setItemBirimFiyat: (val: number | '') => void;
  itemKdvOran: number;
  setItemKdvOran: (val: number) => void;
}

export const GuvenlikEvrakOnayHavuzu: React.FC<GuvenlikEvrakOnayHavuzuProps> = ({
  pendingGateDocs,
  pendingWaybills,
  pendingInvoices,
  signatureText,
  setActiveDocForDetail,
  handleApproveDocument,
  handleRejectGateDoc,
  handleOpenGateDocApproval,
  handleQuickApproveGateIrsaliye,
  handleRematchActiveGateIrsaliye,
  activeGateDoc,
  setActiveGateDoc,
  approvalStep,
  setApprovalStep,
  selectedDocType,
  setSelectedDocType,
  isAiResolving,
  handleAnalyzeGateDocWithAi,
  handleStartManualGateDocApproval,
  handleSaveGateDocApproval,

  faturaNo,
  setFaturaNo,
  faturaFirma,
  setFaturaFirma,
  faturaTarih,
  setFaturaTarih,
  faturaToplam,
  setFaturaToplam,
  faturaKdv,
  setFaturaKdv,
  faturaGenelToplam,
  setFaturaGenelToplam,
  faturaKalemler,
  setFaturaKalemler,

  irsaliyeNo,
  setIrsaliyeNo,
  irsaliyeFirma,
  setIrsaliyeFirma,
  irsaliyeTarih,
  setIrsaliyeTarih,
  irsaliyeKalemler,
  setIrsaliyeKalemler,

  makbuzRefNo,
  setMakbuzRefNo,
  makbuzFirma,
  setMakbuzFirma,
  makbuzTarih,
  setMakbuzTarih,
  makbuzTutar,
  setMakbuzTutar,
  makbuzAciklama,
  setMakbuzAciklama,
  makbuzTip,
  setMakbuzTip,

  genelAciklama,
  setGenelAciklama,

  itemUrunAdi,
  setItemUrunAdi,
  itemMiktar,
  setItemMiktar,
  itemBirim,
  setItemBirim,
  itemBirimFiyat,
  setItemBirimFiyat,
  itemKdvOran,
  setItemKdvOran,
}) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [cardZoomUrl, setCardZoomUrl] = useState<string | null>(null);
  const [cardZoomName, setCardZoomName] = useState('');

  const isImageUrl = (url?: string | null) => isLikelyImageUrl(url || '');

  const isPdfUrl = (url?: string | null, fileName?: string) => {
    if (!url && !fileName) return false;
    const blob = `${url || ''} ${fileName || ''}`.toLowerCase();
    return blob.includes('pdf') || blob.startsWith('data:application/pdf');
  };

  const openCardPreview = (url: string, fileName?: string) => {
    if (isImageUrl(url)) {
      setCardZoomUrl(url);
      setCardZoomName(fileName || 'Belge');
      return;
    }
    openBase64InNewTab(url, fileName || 'Belge');
  };

  return (
    <div className="space-y-6">
      <datalist id="birim-listesi">
        <option value="Adet" />
        <option value="Kg" />
        <option value="Lt" />
        <option value="Ton" />
        <option value="M3" />
        <option value="Torba" />
        <option value="Kamyon" />
        <option value="Kutu" />
        <option value="Palet" />
        <option value="Set" />
        <option value="Metre" />
        <option value="Rulo" />
      </datalist>
      <div className="border bg-white/90 p-4 rounded-2xl border-[#D5DEE3] flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 text-xs">
        <div className="space-y-1">
          <h2
            className="text-xl font-extrabold tracking-tight text-[#15252B]"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
          >
            Güvenlik Belgeleri
          </h2>
          <p className="text-[#5B6B73] leading-relaxed text-[12px]">
            Kapıdan gelen evrakları önizleyin; yapay zeka veya manuel form ile onaylayıp arşivleyin.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
          <span className="bg-[#E3F2EE] text-[#0F6C5C] border border-[#B9DBD2] px-2 py-1 rounded-lg">{pendingGateDocs.length} kapı</span>
          <span className="bg-[#FFF6EB] text-[#9A5B12] border border-[#F0D9B5] px-2 py-1 rounded-lg">{pendingWaybills.length} irsaliye</span>
          <span className="bg-[#F3F6F7] text-[#3D4F56] border border-[#D5DEE3] px-2 py-1 rounded-lg">{pendingInvoices.length} fatura</span>
        </div>
      </div>

      {/* 1. GÜVENLİK KAPISINDAN GELEN EVRAKLAR */}
      <div className="space-y-3">
        <h3 className="font-semibold text-xs text-[#3D4F56] tracking-wide flex items-center space-x-2 uppercase">
          <FileText size={14} className="text-[#0F6C5C]" />
          <span>Kapı girişleri ({pendingGateDocs.length})</span>
        </h3>

        {pendingGateDocs.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center flex flex-col items-center justify-center space-y-3 border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-xs font-bold text-slate-800">Güvenlik kapısından onay bekleyen yeni evrak bulunmuyor.</h3>
              <p className="text-[10px] text-slate-500 mt-1">Kapı evrak girişleri mutabıktır.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingGateDocs.map(docItem => {
              const previewUrl = pickPrimaryFotoUrl(docItem);
              const allUrls = collectAllFotoUrls(docItem);
              const imagePreview = isImageUrl(previewUrl);
              const pdfPreview = isPdfUrl(previewUrl, docItem.fileName);
              const fotoGruplari: Array<{ label: string; list: GuvenlikFotoSlot[] }> = [
                { label: GUVENLIK_FOTO_METOD_LABEL.KALEM, list: docItem.kalemFotolar || [] },
                { label: GUVENLIK_FOTO_METOD_LABEL.FIRMA, list: docItem.firmaFotolar || [] },
                { label: GUVENLIK_FOTO_METOD_LABEL.FATURA, list: docItem.faturaFotolar || [] },
              ].filter((g) => g.list.length > 0);
              return (
              <div key={docItem.id} className="bg-white border border-[#D5DEE3] rounded-2xl flex flex-col hover:border-[#0F6C5C]/45 transition-all duration-200 overflow-hidden">
                {/* Evrak önizleme */}
                <button
                  type="button"
                  onClick={() => previewUrl && openCardPreview(previewUrl, docItem.fileName)}
                  className="relative w-full h-44 bg-[#F3F6F7] border-b border-[#E8EEF0] flex items-center justify-center overflow-hidden group cursor-zoom-in"
                  title={previewUrl ? 'Önizlemeyi büyüt' : 'Önizleme yok'}
                  disabled={!previewUrl}
                >
                  {imagePreview ? (
                    <img
                      src={previewUrl}
                      alt={docItem.fileName || 'Evrak önizleme'}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
                    />
                  ) : previewUrl ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500 px-4">
                      <FileText size={36} className={pdfPreview ? 'text-rose-500' : 'text-indigo-500'} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {pdfPreview ? 'PDF belgesi' : 'Dosya önizleme'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-full">{docItem.fileName || 'Belge'}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                      <FileText size={28} />
                      <span className="text-[10px] font-semibold">Önizleme yok</span>
                    </div>
                  )}
                  {allUrls.length > 1 && (
                    <span className="absolute top-2 left-2 bg-indigo-700 text-white text-[9px] font-black px-2 py-0.5 rounded-lg">
                      {allUrls.length} foto
                    </span>
                  )}
                  {previewUrl && (
                    <span className="absolute bottom-2 right-2 bg-white/95 border border-slate-200 text-slate-700 text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm opacity-0 group-hover:opacity-100 transition">
                      <ZoomIn size={11} /> Büyüt
                    </span>
                  )}
                </button>

                <div className="p-4 flex flex-col flex-1 space-y-3">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                        docItem.evrakTuru === 'FATURA' ? 'bg-violet-50 text-violet-700 border border-violet-200' :
                        docItem.evrakTuru === 'İRSALİYE' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                        docItem.evrakTuru === 'MAKBUZ' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>
                        {docItem.evrakTuru || 'EVRAK'}
                      </span>
                      <span className="flex flex-col items-end gap-0.5 shrink-0">
                        <AcilOnayBadge tarih={docItem.tarih} saat={docItem.saat} />
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                          Gönderilme
                        </span>
                        <span className="text-[9px] text-slate-700 font-mono font-bold">
                          {formatEvrakGonderimLabel(docItem)}
                        </span>
                      </span>
                    </div>

                    <div className="text-xs text-slate-800 font-bold mt-2 truncate" title={docItem.fileName}>
                      {docItem.fileName || 'Belge paketi'}
                    </div>

                    {fotoGruplari.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {fotoGruplari.map((g) => (
                          <div key={g.label} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[8px] font-black uppercase text-slate-500 w-full">{g.label}</span>
                            {g.list.slice(0, 4).map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => openCardPreview(f.dataUrl, f.fileName)}
                                className="w-10 h-10 rounded-md overflow-hidden border border-slate-200 cursor-pointer"
                                title={f.fileName}
                              >
                                {String(f.fileType || '').startsWith('image/') || isLikelyImageUrl(f.dataUrl) ? (
                                  <img src={f.dataUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[8px] font-bold text-slate-500 flex items-center justify-center h-full">PDF</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {docItem.aciklama && (
                      <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2 line-clamp-2">
                        {docItem.aciklama}
                      </p>
                    )}
                    
                    <div className="text-[10px] text-slate-500 mt-1.5 font-semibold">
                      Yükleyen: {docItem.kaydeden || 'Güvenlik'}
                    </div>

                    {docItem.aiParsed && (
                      <div className="mt-2 text-[10px] bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl text-indigo-800 font-sans">
                        <span className="font-bold block text-[8px] uppercase tracking-wider text-indigo-600 mb-1 flex items-center gap-1">
                          <Sparkles size={9} className="text-amber-500" /> YZ ön okuma · kapı irsaliye
                        </span>
                        <div className="truncate"><strong>Firma:</strong> {docItem.firma || '-'}</div>
                        <div className="truncate"><strong>No/Kod:</strong> {docItem.evrakNo || '-'}</div>
                        <div className="truncate"><strong>Kalem:</strong> {docItem.kalemler?.length || 0}</div>
                        {docItem.matchSummary && (
                          <div className={`mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded border inline-block ${
                            docItem.matchSummary.cariMatched
                              ? 'bg-teal-50 text-teal-800 border-teal-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            {docItem.matchSummary.cariMatched ? 'Cari eşleşti' : 'Cari bulunamadı'}
                            {' · '}
                            Stok {docItem.matchSummary.stokLinked || 0}/{docItem.matchSummary.stokTotal || 0}
                          </div>
                        )}
                      </div>
                    )}
                    {docItem.aiStatus === 'PARSING' && (
                      <div className="mt-2 text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-xl text-slate-600 font-sans flex items-center gap-1.5 animate-pulse">
                        <Loader2 size={10} className="animate-spin text-indigo-500" />
                        <span>Yapay Zeka evrakı okuyor...</span>
                      </div>
                    )}
                    <ImzaOnizlemeStrip doc={docItem} pendingSignatureText={signatureText} />
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 mt-auto">
                    <div className="flex gap-2">
                      {previewUrl && (
                        <button
                          type="button"
                          onClick={() => openCardPreview(previewUrl, docItem.fileName)}
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] py-2 px-2.5 rounded-lg transition flex items-center justify-center"
                          title="Önizle"
                        >
                          <Eye size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenGateDocApproval(docItem)}
                        className="flex-grow bg-[#0F6C5C] hover:bg-[#0C584B] text-white font-extrabold text-[10px] py-2 px-3 rounded-xl transition tracking-wider uppercase flex items-center justify-center space-x-1"
                      >
                        <Sparkles size={12} />
                        <span>Kontrol &amp; İşle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectGateDoc(docItem.id)}
                        className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[10px] py-2 px-3 rounded-lg transition"
                      >
                        Reddet
                      </button>
                    </div>
                    {docItem.evrakTuru === 'İRSALİYE' &&
                      (docItem.aiParsed || (docItem.kalemler || []).length > 0) &&
                      handleQuickApproveGateIrsaliye && (
                        <button
                          type="button"
                          onClick={() => handleQuickApproveGateIrsaliye(docItem)}
                          className="w-full bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-[10px] py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5"
                          title="2 kez cari/stok eşleştir · mevcut kart altına yaz · onayla (yeni kart açmaz)"
                        >
                          <Check size={13} />
                          Eşleştirip Onayla (cari/stok)
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* 2. DİĞER BEKLEYEN ONALAR (OFİS LİSTESİ) */}
      <div className="border-t border-slate-200 pt-6 space-y-4">
        {(pendingWaybills.length > 0 || pendingInvoices.length > 0) && (
          <div className="space-y-6">
            {/* İrsaliyeler Grid */}
            {pendingWaybills.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display font-black text-xs text-slate-500 tracking-wider flex items-center space-x-2 uppercase">
                  <Truck size={14} className="text-emerald-500" />
                  <span>Ofisten Kayıtlı Bekleyen İrsaliyeler ({pendingWaybills.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingWaybills.map(doc => (
                    <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition space-y-3 shadow-sm">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {doc.irsaliyeNo}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <AcilOnayBadge tarih={doc.tarih} />
                            <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 font-bold mt-2.5">Firma: {doc.firma}</p>
                        <p className="text-[10.5px] text-slate-500 mt-1">İlişkili Sipariş No: {doc.saId || 'Doğrudan Sevkiyat'}</p>

                        <div className="mt-2.5 pt-2 border-t border-slate-200">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Gelen Malzemeler</span>
                          <div className="space-y-1 text-[10px] font-mono text-slate-400">
                            {doc.kalemler?.slice(0, 3).map((k: any, idx: number) => (
                              <div key={k.id || idx} className="flex justify-between">
                                <span className="truncate max-w-[150px]">{k.urunAdi}</span>
                                <span className="text-slate-800 font-bold">{k.miktar} {k.birim}</span>
                              </div>
                            ))}
                            {doc.kalemler?.length > 3 && <div className="text-[9px] text-slate-500">+ {doc.kalemler.length - 3} kalem daha</div>}
                          </div>
                        </div>
                        <ImzaOnizlemeStrip doc={doc} pendingSignatureText={signatureText} className="mt-2" />
                      </div>

                      <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                        <button 
                          onClick={() => setActiveDocForDetail({ id: doc.id, type: 'waybill', data: doc })}
                          className="flex-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                        >
                          <Eye size={11} />
                          <span>Detay İncele</span>
                        </button>
                        <button 
                          onClick={() => handleApproveDocument('waybill', doc.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
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
                <h3 className="font-display font-black text-xs text-slate-500 tracking-wider flex items-center space-x-2 uppercase">
                  <CreditCard size={14} className="text-purple-500" />
                  <span>Ofisten Kayıtlı Bekleyen Faturalar ({pendingInvoices.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingInvoices.map(doc => (
                    <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition space-y-3 shadow-sm">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="font-mono bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {doc.faturaNo}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <AcilOnayBadge tarih={doc.tarih} />
                            <span className="text-[10px] text-slate-500 font-mono font-bold">{doc.tarih}</span>
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 font-bold mt-2.5">Cari Unvan: {doc.cariUnvan}</p>
                        <p className="text-[10.5px] text-slate-500 mt-1">Eşleşen İrsaliyeler: {doc.bagliIrsaliyeler?.join(', ') || 'Manuel Bağsız'}</p>
                        
                        <div className="mt-2.5 p-2 bg-purple-50 rounded border border-purple-100 flex justify-between items-center text-[10px]">
                          <span className="text-slate-500 font-bold">Toplam Tutar:</span>
                          <span className="text-purple-700 font-black font-mono">₺{doc.genelToplam?.toLocaleString()}</span>
                        </div>
                        <ImzaOnizlemeStrip doc={doc} pendingSignatureText={signatureText} className="mt-2" />
                      </div>

                      <div className="flex gap-2 pt-2.5 border-t border-slate-100">
                        <button 
                          onClick={() => setActiveDocForDetail({ id: doc.id, type: 'invoice', data: doc })}
                          className="flex-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
                        >
                          <Eye size={11} />
                          <span>Karşılaştır &amp; Gör</span>
                        </button>
                        <button 
                          onClick={() => handleApproveDocument('invoice', doc.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-1.5 px-3 rounded-lg text-[10px] font-black tracking-widest transition flex items-center justify-center space-x-1"
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

      {/* 3. EVRAK ONAY & ARŞİVLEME SİHİRBAZI MODAL */}
      {activeGateDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl text-slate-800">
            
            {/* Left half: Document image preview */}
            <div className="w-full md:w-1/2 p-5 bg-slate-50 flex flex-col justify-between border-r border-slate-200">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Evrak Görseli / Önizleme</span>
                {pickPrimaryFotoUrl(activeGateDoc) && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsZoomed(true)}
                      className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 font-semibold"
                    >
                      <ZoomIn size={12} />
                      <span>Yakınlaştır</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = pickPrimaryFotoUrl(activeGateDoc);
                        link.download = activeGateDoc.fileName || 'evrak.png';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="text-[10px] text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 font-semibold"
                    >
                      <Download size={12} />
                      <span>İndir</span>
                    </button>
                    <a
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        openBase64InNewTab(pickPrimaryFotoUrl(activeGateDoc), activeGateDoc.fileName || 'Belge');
                      }}
                      className="text-[10px] text-slate-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <ExternalLink size={12} />
                      <span>Yeni Sekmede Aç</span>
                    </a>
                  </div>
                )}
              </div>

              {(activeGateDoc.kalemFotolar?.length || activeGateDoc.firmaFotolar?.length || activeGateDoc.faturaFotolar?.length) ? (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {([
                    ['KALEM', activeGateDoc.kalemFotolar || []],
                    ['FIRMA', activeGateDoc.firmaFotolar || []],
                    ['FATURA', activeGateDoc.faturaFotolar || []],
                  ] as const).map(([metod, list]) => (
                    <div key={metod} className="rounded-xl border border-slate-200 bg-white p-2 space-y-1">
                      <p className="text-[8px] font-black uppercase text-slate-500">{GUVENLIK_FOTO_METOD_LABEL[metod]}</p>
                      {list.length === 0 ? (
                        <p className="text-[9px] text-slate-400 italic">Yok</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {list.map((f: GuvenlikFotoSlot) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setCardZoomUrl(f.dataUrl);
                                setCardZoomName(f.fileName);
                              }}
                              className="w-11 h-11 rounded-md overflow-hidden border border-slate-200 cursor-pointer"
                            >
                              <img src={f.dataUrl} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              
              <div className="flex-grow flex items-center justify-center overflow-hidden bg-white rounded-2xl border border-slate-200 p-3 min-h-[300px]">
                {pickPrimaryFotoUrl(activeGateDoc) ? (
                  isLikelyImageUrl(pickPrimaryFotoUrl(activeGateDoc)) ? (
                    <img
                      src={pickPrimaryFotoUrl(activeGateDoc)}
                      alt="Evrak"
                      onClick={() => setIsZoomed(true)}
                      className="max-w-full max-h-[60vh] object-contain rounded-lg cursor-zoom-in hover:opacity-90 transition"
                      title="Büyütmek için tıklayın"
                    />
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      <div className="text-5xl">📄</div>
                      <div className="text-xs text-slate-400">PDF veya Word Dosyası Yüklenmiş</div>
                      <a
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          openBase64InNewTab(pickPrimaryFotoUrl(activeGateDoc), activeGateDoc.fileName || 'Belge');
                        }}
                        className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
                      >
                        Dosyayı İndir / Aç
                      </a>
                    </div>
                  )
                ) : (
                  <span className="text-xs text-slate-500 font-bold">Fotoğraf yüklenmedi.</span>
                )}
              </div>
            </div>

            {/* Right half: Form & parsing wizard */}
            <div className="w-full md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto max-h-[90vh]">
              <div>
                {/* Header */}
                <div className="flex justify-between items-start border-b border-slate-200 pb-3 mb-4">
                  <div>
                    <h2
                      className="font-extrabold text-lg tracking-tight text-[#0F6C5C] flex items-center gap-1.5"
                      style={{ fontFamily: '"Barlow Condensed", sans-serif' }}
                    >
                      <Sparkles size={16} />
                      <span>Evrak İşleme</span>
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                      Kapı Kayıt Ref: <span className="font-mono text-slate-700">{activeGateDoc.id}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveGateDoc(null)}
                    className="text-slate-500 hover:text-slate-800 p-1 hover:bg-slate-100 rounded-full transition"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Step 1: Select Type & Method */}
                {approvalStep === 'SELECT_METHOD' && (
                  <div className="space-y-5 py-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">
                        Onaylanacak Evrak Türünü Belirleyin
                      </label>
                      <select
                        value={selectedDocType}
                        onChange={(e) => setSelectedDocType(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 text-amber-700 p-3 rounded-xl font-bold text-xs"
                      >
                        <option value="İRSALİYE">📄 İRSALİYE ARŞİVİNE KAYDET</option>
                        <option value="FATURA">💰 FATURA ARŞİVİNE KAYDET</option>
                        <option value="MAKBUZ">🎫 KASA DEKONT / MAKBUZ HAREKETİNE EKLE</option>
                        <option value="GENEL_EVRAK">📦 GENEL EVRAK DEKONTUNA KAYDET</option>
                      </select>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl space-y-1">
                      <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wide block">Nöbetçi Açıklaması</span>
                      <p className="text-slate-700 text-xs font-semibold italic">
                        "{activeGateDoc.aciklama || 'Açıklama belirtilmemiş'}"
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-3">
                      {selectedDocType !== 'GENEL_EVRAK' && (
                        <button
                          onClick={handleAnalyzeGateDocWithAi}
                          disabled={isAiResolving}
                          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs p-4 rounded-2xl transition disabled:opacity-50 flex items-center justify-center space-x-2 shadow-lg shadow-indigo-200"
                        >
                          {isAiResolving ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div>
                              <span>Yapay Zeka Analiz Ediyor...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} className="text-amber-300 animate-pulse" />
                              <span>YAPAY ZEKA İLE ÇÖZÜMLE &amp; DOLDUR</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={handleStartManualGateDocApproval}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-extrabold text-xs p-3.5 rounded-2xl transition flex items-center justify-center space-x-1.5"
                      >
                        <span>✍️ MANUEL OLARAK KART DOLDUR</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Form editing and review */}
                {approvalStep === 'FORM' && (
                  <form onSubmit={handleSaveGateDocApproval} className="space-y-4">
                    
                    {/* Form fields based on selectedDocType */}
                    {selectedDocType === 'FATURA' && (
                      <div className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">Fatura No *</label>
                            <input
                              type="text"
                              required
                              value={faturaNo}
                              onChange={(e) => setFaturaNo(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">Fatura Tarihi *</label>
                            <input
                              type="date"
                              required
                              value={faturaTarih}
                              onChange={(e) => setFaturaTarih(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="space-y-1 text-xs">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Satıcı Cari Ünvan *</label>
                          <input
                            type="text"
                            required
                            value={faturaFirma}
                            onChange={(e) => setFaturaFirma(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-bold"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-slate-400 block uppercase">Matrah (KDV Hariç) *</label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={faturaToplam}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setFaturaToplam(v);
                                setFaturaGenelToplam(v + faturaKdv);
                              }}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-slate-400 block uppercase">Toplam KDV *</label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={faturaKdv}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setFaturaKdv(v);
                                setFaturaGenelToplam(faturaToplam + v);
                              }}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-indigo-400 block uppercase">Genel Toplam (TL) *</label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={faturaGenelToplam}
                              onChange={(e) => setFaturaGenelToplam(Number(e.target.value))}
                              className="w-full bg-indigo-50 border border-indigo-200 text-indigo-800 p-2 rounded-lg font-mono font-black"
                            />
                          </div>
                        </div>

                {/* Items table for Fatura */}
                        <div className="space-y-2 border-t border-slate-200 pt-3">
                          <span className="text-[9px] font-black text-purple-400 block uppercase tracking-wider">Malzeme Kalemleri ({faturaKalemler.length})</span>
                          
                          <datalist id="birim-listesi">
                            <option value="Adet" />
                            <option value="Kg" />
                            <option value="Litre" />
                            <option value="Metre" />
                            <option value="Koli" />
                            <option value="Paket" />
                          </datalist>

                          {/* Add row */}
                          <div className="grid grid-cols-12 gap-1 bg-slate-50 p-2 border border-slate-200 rounded-xl">
                            <input
                              type="text"
                              placeholder="Malzeme Adı"
                              value={itemUrunAdi}
                              onChange={(e) => setItemUrunAdi(e.target.value)}
                              className="col-span-4 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded"
                            />
                            <input
                              type="number"
                              placeholder="Miktar"
                              value={itemMiktar}
                              onChange={(e) => setItemMiktar(e.target.value === '' ? '' : Number(e.target.value))}
                              className="col-span-2 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded text-right font-mono"
                            />
                            <input
                              type="text"
                              list="birim-listesi"
                              placeholder="Birim"
                              value={itemBirim}
                              onChange={(e) => setItemBirim(e.target.value)}
                              className="col-span-2 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded"
                            />
                            <input
                              type="number"
                              placeholder="B.Fiyat"
                              value={itemBirimFiyat}
                              onChange={(e) => setItemBirimFiyat(e.target.value === '' ? '' : Number(e.target.value))}
                              className="col-span-2 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded text-right font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!itemUrunAdi || !itemMiktar) return;
                                const m = Number(itemMiktar);
                                const bf = Number(itemBirimFiyat || 0);
                                const kdv = Number(itemKdvOran);
                                const sub = m * bf;
                                const tax = sub * (kdv / 100);
                                const tot = sub + tax;
                                setFaturaKalemler(prev => [...prev, {
                                  urunAdi: itemUrunAdi,
                                  miktar: m,
                                  birim: itemBirim,
                                  birimFiyat: bf,
                                  kdvOran: kdv,
                                  toplam: tot
                                }]);
                                setItemUrunAdi('');
                                setItemMiktar('');
                                setItemBirim('Adet');
                                setItemBirimFiyat('');
                              }}
                              className="col-span-2 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-[10px] rounded"
                            >
                              Ekle
                            </button>
                          </div>

                          {faturaKalemler.length > 0 && (
                            <div className="max-h-[150px] overflow-y-auto bg-white border border-slate-200 rounded-xl text-[10px] divide-y divide-slate-100">
                              {faturaKalemler.map((it, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 hover:bg-slate-50 transition">
                                  <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={it.urunAdi}>{it.urunAdi}</div>
                                  <div className="flex items-center space-x-3 text-right">
                                    <span className="font-mono text-slate-400">{it.miktar} {it.birim} × ₺{it.birimFiyat?.toLocaleString()}</span>
                                    <span className="font-mono font-bold text-indigo-400">₺{it.toplam?.toLocaleString()}</span>
                                    <button
                                      type="button"
                                      onClick={() => setFaturaKalemler(prev => prev.filter((_, i) => i !== idx))}
                                      className="text-rose-500 hover:text-rose-600 text-[10px] px-1 font-bold"
                                    >
                                      Sil
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedDocType === 'İRSALİYE' && (
                      <div className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">İrsaliye No *</label>
                            <input
                              type="text"
                              required
                              value={irsaliyeNo}
                              onChange={(e) => setIrsaliyeNo(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">İrsaliye Tarihi *</label>
                            <input
                              type="date"
                              required
                              value={irsaliyeTarih}
                              onChange={(e) => setIrsaliyeTarih(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="space-y-1 text-xs">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Gönderen Firma *</label>
                          <input
                            type="text"
                            required
                            value={irsaliyeFirma}
                            onChange={(e) => setIrsaliyeFirma(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-bold"
                          />
                          {activeGateDoc?.matchSummary && (
                            <p className={`text-[9px] font-bold mt-1 ${
                              activeGateDoc.matchSummary.cariMatched ? 'text-teal-700' : 'text-amber-700'
                            }`}>
                              {activeGateDoc.matchSummary.cariMatched
                                ? `Cari kart eşleşti${activeGateDoc.matchSummary.cariKartId ? ` · ${activeGateDoc.matchSummary.cariKartId}` : ''} — altına işlem yazılır (yeni kart açılmaz)`
                                : 'Cari kart bulunamadı — onayda unvan serbest kaydedilir, yeni kart açılmaz'}
                              {' · '}
                              Stok {activeGateDoc.matchSummary.stokLinked || 0}/{activeGateDoc.matchSummary.stokTotal || 0} kalem bağlandı
                            </p>
                          )}
                          {handleRematchActiveGateIrsaliye && (
                            <button
                              type="button"
                              onClick={() => handleRematchActiveGateIrsaliye()}
                              className="mt-2 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 cursor-pointer"
                            >
                              Yeniden eşleştir (2. kontrol)
                            </button>
                          )}
                        </div>

                        {/* Items table for Irsaliye */}
                        <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                          <span className="text-[9px] font-black text-amber-500 block uppercase tracking-wider">Sevk Edilen Malzeme Kalemleri ({irsaliyeKalemler.length})</span>
                          
                          {/* Add row */}
                          <div className="grid grid-cols-12 gap-1 bg-slate-50 p-2 border border-slate-200 rounded-xl">
                            <input
                              type="text"
                              placeholder="Malzeme Adı"
                              value={itemUrunAdi}
                              onChange={(e) => setItemUrunAdi(e.target.value)}
                              className="col-span-5 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded"
                            />
                            <input
                              type="number"
                              placeholder="Miktar"
                              value={itemMiktar}
                              onChange={(e) => setItemMiktar(e.target.value === '' ? '' : Number(e.target.value))}
                              className="col-span-2 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded text-right font-mono"
                            />
                            <input
                              type="text"
                              list="birim-listesi"
                              placeholder="Birim"
                              value={itemBirim}
                              onChange={(e) => setItemBirim(e.target.value)}
                              className="col-span-3 bg-white border border-slate-200 text-slate-900 text-[10px] p-1.5 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!itemUrunAdi || !itemMiktar) return;
                                setIrsaliyeKalemler(prev => [...prev, {
                                  urunAdi: itemUrunAdi,
                                  miktar: Number(itemMiktar),
                                  birim: itemBirim
                                }]);
                                setItemUrunAdi('');
                                setItemMiktar('');
                                setItemBirim('Adet');
                              }}
                              className="col-span-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] rounded"
                            >
                              Ekle
                            </button>
                          </div>

                          {irsaliyeKalemler.length > 0 && (
                            <div className="max-h-[150px] overflow-y-auto bg-white border border-slate-200 rounded-xl text-[10px] divide-y divide-slate-100">
                              {irsaliyeKalemler.map((it, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 hover:bg-slate-50 transition">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-800 truncate max-w-[220px]">{it.urunAdi}</div>
                                    {it.stokKartId ? (
                                      <span className="text-[8px] font-bold text-teal-700">Stok eşleşti</span>
                                    ) : (
                                      <span className="text-[8px] font-bold text-amber-600">Stok eşleşmedi</span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-3 text-right">
                                    <span className="font-mono text-amber-500 font-bold">{it.miktar} {it.birim || 'Adet'}</span>
                                    <button
                                      type="button"
                                      onClick={() => setIrsaliyeKalemler(prev => prev.filter((_, i) => i !== idx))}
                                      className="text-rose-500 hover:text-rose-600 text-[10px] px-1 font-bold"
                                    >
                                      Sil
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedDocType === 'MAKBUZ' && (
                      <div className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">İşlem / Fiş No *</label>
                            <input
                              type="text"
                              required
                              value={makbuzRefNo}
                              onChange={(e) => setMakbuzRefNo(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">İşlem Tarihi *</label>
                            <input
                              type="date"
                              required
                              value={makbuzTarih}
                              onChange={(e) => setMakbuzTarih(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-3 text-xs">
                          <div className="col-span-8 space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">Muhatap Firma / Cari Kart *</label>
                            <input
                              type="text"
                              required
                              value={makbuzFirma}
                              onChange={(e) => setMakbuzFirma(e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-bold"
                            />
                          </div>
                          <div className="col-span-4 space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 block uppercase">Kasa Tipi *</label>
                            <select
                              value={makbuzTip}
                              onChange={(e) => setMakbuzTip(e.target.value as any)}
                              className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg font-bold"
                            >
                              <option value="ÇIKIŞ">💰 NAKİT ÇIKIŞI</option>
                              <option value="GİRİŞ">💵 NAKİT TAHMİNAT / GİRİŞ</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">İşlem Tutarı (₺) *</label>
                          <input
                            type="number"
                            required
                            step="0.01"
                            value={makbuzTutar}
                            onChange={(e) => setMakbuzTutar(Number(e.target.value))}
                            className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg font-mono font-black text-sm"
                          />
                        </div>

                        <div className="space-y-1 text-xs">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">İşlem Açıklaması *</label>
                          <input
                            type="text"
                            required
                            value={makbuzAciklama}
                            onChange={(e) => setMakbuzAciklama(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-900 p-2 rounded-lg"
                          />
                        </div>
                      </div>
                    )}

                    {selectedDocType === 'GENEL_EVRAK' && (
                      <div className="space-y-3.5">
                        <div className="space-y-1 text-xs">
                          <label className="text-[9px] font-bold text-slate-400 block uppercase">Genel Evrak Kayıt Notu / Açıklaması</label>
                          <textarea
                            required
                            rows={4}
                            value={genelAciklama}
                            onChange={(e) => setGenelAciklama(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-900 p-3 rounded-lg text-xs leading-relaxed"
                            placeholder="Evrakın kime teslim edildiği, içeriği veya takip kargo numarası vb..."
                          />
                        </div>
                      </div>
                    )}

                    {/* Buttons */}
                    <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4 mt-6">
                      <button
                        type="button"
                        onClick={() => setApprovalStep('SELECT_METHOD')}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-5 rounded-xl transition"
                      >
                        Geri
                      </button>
                      <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs py-2.5 px-6 rounded-xl transition shadow-lg shadow-emerald-950/20"
                      >
                        ONAYLA &amp; ARŞİVE KAYDET
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. GÖRSEL YAKINLAŞTIRMA OVERLAY MODALI */}
      {(isZoomed && pickPrimaryFotoUrl(activeGateDoc || {})) || cardZoomUrl ? (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
            <button
              onClick={() => {
                const src = cardZoomUrl || pickPrimaryFotoUrl(activeGateDoc || {});
                if (!src) return;
                const link = document.createElement('a');
                link.href = src;
                link.download = cardZoomName || activeGateDoc?.fileName || 'evrak.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 transition shadow-lg cursor-pointer border-0"
            >
              <Download size={14} />
              <span>İndir</span>
            </button>
            <button
              onClick={() => {
                setIsZoomed(false);
                setCardZoomUrl(null);
              }}
              className="bg-white hover:bg-slate-100 text-slate-800 p-2 border border-slate-200 rounded-xl transition shadow-lg cursor-pointer"
              title="Kapat"
            >
              <X size={20} />
            </button>
          </div>
          <div className="max-w-5xl max-h-[85vh] overflow-auto flex items-center justify-center p-2 rounded-2xl bg-white border border-slate-200 shadow-xl">
            <img
              src={cardZoomUrl || pickPrimaryFotoUrl(activeGateDoc || {})}
              alt="Evrak Zoomed"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          </div>
          <span className="text-slate-600 text-xs mt-3 font-semibold font-mono bg-white/90 px-3 py-1 rounded-lg border border-slate-200">
            {cardZoomName || activeGateDoc?.fileName || 'Belge Görseli'}
          </span>
          <div
            className="absolute inset-0 -z-10 cursor-zoom-out"
            onClick={() => {
              setIsZoomed(false);
              setCardZoomUrl(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
