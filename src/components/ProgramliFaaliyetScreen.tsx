import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, FilePlus2, FileText, Flag, Hammer, Image as ImageIcon, Search, Filter, Trash2, Pencil, Save, X } from 'lucide-react';

import { ProgramliFaaliyet, ProgramliFaaliyetAsama, ProgramliFaaliyetAsamaAnahtari } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { PARSEL_LIST, PARSEL_BLOK_MAP, defaultBlokForParsel } from '../data/parselBlokMap';

interface ProgramliFaaliyetScreenProps {
  programliFaaliyetler: ProgramliFaaliyet[];
  setProgramliFaaliyetler: (
    updater: ProgramliFaaliyet[] | ((prev: ProgramliFaaliyet[]) => ProgramliFaaliyet[])
  ) => void;
  currentUser?: any;
}

const ASAMA_SIRASI: ProgramliFaaliyetAsamaAnahtari[] = ['BASLANGIC', 'ILERLEME', 'TAMAMLANMA'];

const ASAMA_LABELS: Record<ProgramliFaaliyetAsamaAnahtari, string> = {
  BASLANGIC: '1. Aşama - Başlangıç',
  ILERLEME: '2. Aşama - İlerleme',
  TAMAMLANMA: '3. Aşama - Tamamlanma',
};

const makeEmptyAsamalar = (): ProgramliFaaliyetAsama[] =>
  ASAMA_SIRASI.map((adim) => ({
    adim,
    tamamlandi: false,
    tamamlanmaTarihi: '',
    aciklama: '',
    fotoUrl: '',
  }));

const todayIso = () => new Date().toISOString().slice(0, 10);

export const ProgramliFaaliyetScreen: React.FC<ProgramliFaaliyetScreenProps> = ({
  programliFaaliyetler,
  setProgramliFaaliyetler,
  currentUser,
}) => {
  const [hedefTanimi, setHedefTanimi] = useState('');
  const [parsel, setParsel] = useState(PARSEL_LIST[0] || 'Parsel Bölge 157/46');
  const [bloklar, setBloklar] = useState(defaultBlokForParsel(PARSEL_LIST[0] || 'Parsel Bölge 157/46'));
  const [isinAdi, setIsinAdi] = useState('');

  const [asamaDraftlari, setAsamaDraftlari] = useState<
    Record<string, Record<ProgramliFaaliyetAsamaAnahtari, { aciklama: string; fotoUrl: string; uploading?: boolean }>>
  >({});

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDurum, setFilterDurum] = useState<'ALL' | 'RAPORLANAN' | 'RAPORLANMAYAN'>('ALL');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ hedefTanimi: '', parsel: '', bloklar: '', isinAdi: '' });

  const filteredFaaliyetler = useMemo(() => {
    let result = [...programliFaaliyetler];
    if (filterDurum === 'RAPORLANAN') {
      result = result.filter(f => f.durum === 'TAMAMLANDI');
    } else if (filterDurum === 'RAPORLANMAYAN') {
      result = result.filter(f => f.durum !== 'TAMAMLANDI');
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(f => 
        (f.isinAdi || '').toLowerCase().includes(q) ||
        (f.hedefTanimi || '').toLowerCase().includes(q) ||
        (f.parsel || '').toLowerCase().includes(q) ||
        (f.bloklar || '').toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr'));
  }, [programliFaaliyetler, filterDurum, searchTerm]);

  const handleDelete = (id: string) => {
    if (confirm('Bu programlı faaliyeti silmek istediğinize emin misiniz?')) {
      setProgramliFaaliyetler(prev => prev.filter(f => f.id !== id));
    }
  };

  const startEditing = (f: ProgramliFaaliyet) => {
    setEditingId(f.id);
    setEditData({ hedefTanimi: f.hedefTanimi, parsel: f.parsel, bloklar: f.bloklar, isinAdi: f.isinAdi });
  };
  
  const saveEdit = () => {
    if (!editData.hedefTanimi.trim() || !editData.parsel.trim() || !editData.bloklar.trim() || !editData.isinAdi.trim()) {
      alert('Tüm alanları doldurun.');
      return;
    }
    setProgramliFaaliyetler(prev => prev.map(f => f.id === editingId ? { ...f, ...editData } : f));
    setEditingId(null);
  };

  const handleCreateProgram = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hedefTanimi.trim() || !parsel.trim() || !bloklar.trim() || !isinAdi.trim()) {
      alert('Lütfen hedef, parsel, bloklar ve iş adını doldurun.');
      return;
    }

    const yeniProgram: ProgramliFaaliyet = {
      id: `pf_${Date.now()}`,
      tarih: todayIso(),
      hedefTanimi: hedefTanimi.trim(),
      parsel: parsel.trim(),
      bloklar: bloklar.trim(),
      isinAdi: isinAdi.trim(),
      olusturan: currentUser?.displayName || currentUser?.email || 'FORMEN',
      olusturanUid: currentUser?.uid || '',
      durum: 'PLANLANDI',
      asamalar: makeEmptyAsamalar(),
    };

    setProgramliFaaliyetler((prev) => [yeniProgram, ...prev]);
    setHedefTanimi('');
    setParsel('');
    setBloklar('');
    setIsinAdi('');
  };

  const updateDraftField = (
    faaliyetId: string,
    adim: ProgramliFaaliyetAsamaAnahtari,
    field: 'aciklama' | 'fotoUrl' | 'uploading',
    value: string | boolean
  ) => {
    setAsamaDraftlari((prev) => {
      const faaliyetDraft = prev[faaliyetId] || ({} as Record<ProgramliFaaliyetAsamaAnahtari, { aciklama: string; fotoUrl: string; uploading?: boolean }>);
      const stepDraft = faaliyetDraft[adim] || { aciklama: '', fotoUrl: '' };
      return {
        ...prev,
        [faaliyetId]: {
          ...faaliyetDraft,
          [adim]: {
            ...stepDraft,
            [field]: value,
          },
        },
      };
    });
  };

  const handleAsamaFoto = async (
    faaliyetId: string,
    adim: ProgramliFaaliyetAsamaAnahtari,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateDraftField(faaliyetId, adim, 'uploading', true);
    try {
      const reader = new FileReader();
      const rawBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = (evt) => resolve(String(evt.target?.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(rawBase64);
      updateDraftField(faaliyetId, adim, 'fotoUrl', compressed);
    } catch (err) {
      console.error(err);
      alert('Fotoğraf yüklenemedi.');
    } finally {
      updateDraftField(faaliyetId, adim, 'uploading', false);
    }
  };

  const handleAsamaTamamla = (faaliyet: ProgramliFaaliyet, adim: ProgramliFaaliyetAsamaAnahtari) => {
    const adimIndex = ASAMA_SIRASI.indexOf(adim);
    const oncekiAdim = adimIndex > 0 ? faaliyet.asamalar.find((a) => a.adim === ASAMA_SIRASI[adimIndex - 1]) : null;

    if (oncekiAdim && !oncekiAdim.tamamlandi) {
      alert('Önce bir önceki aşamayı tamamlayın.');
      return;
    }

    const mevcutAsama = faaliyet.asamalar.find((a) => a.adim === adim);
    const draft = asamaDraftlari[faaliyet.id]?.[adim];
    const aciklama = (draft?.aciklama || mevcutAsama?.aciklama || '').trim();
    const fotoUrl = (draft?.fotoUrl || mevcutAsama?.fotoUrl || '').trim();

    if (!aciklama) {
      alert('Aşama açıklaması zorunludur.');
      return;
    }
    if (!fotoUrl) {
      alert('Aşama fotoğrafı zorunludur.');
      return;
    }

    setProgramliFaaliyetler((prev) =>
      prev.map((item) => {
        if (item.id !== faaliyet.id) return item;
        const asamalar = item.asamalar.map((s) =>
          s.adim === adim
            ? {
                ...s,
                tamamlandi: true,
                tamamlanmaTarihi: new Date().toISOString(),
                aciklama,
                fotoUrl,
              }
            : s
        );
        const hepsiTamam = asamalar.every((s) => s.tamamlandi);
        return {
          ...item,
          asamalar,
          durum: hepsiTamam ? 'TAMAMLANDI' : 'DEVAM_EDIYOR',
        };
      })
    );
  };

  const getStageState = (faaliyet: ProgramliFaaliyet, adim: ProgramliFaaliyetAsamaAnahtari) => {
    const kayit = faaliyet.asamalar.find((a) => a.adim === adim);
    const draft = asamaDraftlari[faaliyet.id]?.[adim];
    return {
      tamamlandi: !!kayit?.tamamlandi,
      aciklama: draft?.aciklama ?? kayit?.aciklama ?? '',
      fotoUrl: draft?.fotoUrl ?? kayit?.fotoUrl ?? '',
      uploading: !!draft?.uploading,
    };
  };

  const getDurumClass = (durum: ProgramliFaaliyet['durum']) => {
    if (durum === 'TAMAMLANDI') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (durum === 'DEVAM_EDIYOR') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getImageSize = (src: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width || 1200, height: img.height || 800 });
      img.onerror = reject;
      img.src = src;
    });

  const handleDownloadPdf = async (faaliyet: ProgramliFaaliyet) => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const maxTextWidth = pageWidth - marginX * 2;
      let y = 14;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('PROGRAMLI FAALIYET SUREC RAPORU', marginX, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const ustBilgi = [
        `Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`,
        `Isin Adi: ${faaliyet.isinAdi}`,
        `Parsel: ${faaliyet.parsel} | Bloklar: ${faaliyet.bloklar}`,
        `Hedef: ${faaliyet.hedefTanimi}`,
        `Durum: ${faaliyet.durum}`,
      ];
      for (const line of ustBilgi) {
        const wrapped = doc.splitTextToSize(line, maxTextWidth);
        doc.text(wrapped, marginX, y);
        y += wrapped.length * 5;
      }
      y += 2;

      for (const stageKey of ASAMA_SIRASI) {
        const stage = faaliyet.asamalar.find((a) => a.adim === stageKey);
        if (!stage) continue;

        if (y > pageHeight - 90) {
          doc.addPage();
          y = 14;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(ASAMA_LABELS[stageKey], marginX, y);
        y += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Tamamlanma: ${stage.tamamlanmaTarihi ? new Date(stage.tamamlanmaTarihi).toLocaleString('tr-TR') : '-'}`, marginX, y);
        y += 5;

        const aciklama = stage.aciklama?.trim() || '(Aciklama girilmemis)';
        const wrappedDesc = doc.splitTextToSize(`Aciklama: ${aciklama}`, maxTextWidth);
        doc.text(wrappedDesc, marginX, y);
        y += wrappedDesc.length * 5 + 2;

        if (stage.fotoUrl) {
          const size = await getImageSize(stage.fotoUrl);
          const maxImgWidth = maxTextWidth;
          const maxImgHeight = 70;
          const ratio = Math.min(maxImgWidth / size.width, maxImgHeight / size.height);
          const imgWidth = Math.max(20, size.width * ratio);
          const imgHeight = Math.max(12, size.height * ratio);

          if (y + imgHeight > pageHeight - 12) {
            doc.addPage();
            y = 14;
          }

          const format = stage.fotoUrl.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(stage.fotoUrl, format, marginX, y, imgWidth, imgHeight);
          y += imgHeight + 6;
        } else {
          y += 3;
        }
      }

      doc.save(`programli-faaliyet-${faaliyet.id}.pdf`);
    } catch (err) {
      console.error(err);
      alert('PDF raporu olusturulamadi.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Flag size={17} className="text-slate-800" />
          <h2 className="text-sm md:text-base font-bold text-slate-800 uppercase tracking-wide">Programlı Faaliyet Oluştur</h2>
        </div>
        <form onSubmit={handleCreateProgram} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            value={hedefTanimi}
            onChange={(e) => setHedefTanimi(e.target.value)}
            placeholder="Hedef Tanımı (ör. 157 Parsel A-B-C kaba temizlik)"
            className="md:col-span-2 border border-slate-250 rounded-xl px-3 py-2 text-sm"
          />
          <select
            value={parsel}
            onChange={(e) => {
              const val = e.target.value;
              setParsel(val);
              setBloklar(defaultBlokForParsel(val));
            }}
            className="border border-slate-250 rounded-xl px-3 py-2 text-sm"
          >
            {PARSEL_LIST.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={bloklar}
            onChange={(e) => setBloklar(e.target.value)}
            className="border border-slate-250 rounded-xl px-3 py-2 text-sm"
          >
            {PARSEL_BLOK_MAP[parsel]?.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <input
            type="text"
            value={isinAdi}
            onChange={(e) => setIsinAdi(e.target.value)}
            placeholder="İşin Adı"
            className="md:col-span-2 border border-slate-250 rounded-xl px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="md:col-span-2 inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-900 text-white rounded-xl py-2.5 font-bold text-sm cursor-pointer"
          >
            <FilePlus2 size={16} />
            Programı Başlat
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-emerald-600" />
            <h3 className="text-sm md:text-base font-bold text-slate-800 uppercase tracking-wide">Programlı Faaliyet Arşivi</h3>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Ara (İş Adı, Parsel, Hedef...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-slate-250 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
              {(['ALL', 'RAPORLANAN', 'RAPORLANMAYAN'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilterDurum(tab)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold whitespace-nowrap transition-all ${filterDurum === tab ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}
                >
                  {tab === 'ALL' ? 'Tümü' : tab === 'RAPORLANAN' ? 'Raporlananlar' : 'Raporlanmayanlar'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredFaaliyetler.length === 0 ? (
          <div className="text-xs text-slate-500 border border-dashed border-slate-250 rounded-xl p-4 text-center">
            Aradığınız kriterlere uygun kayıt bulunamadı.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFaaliyetler.map((faaliyet) => (
              <div key={faaliyet.id} className="border border-slate-200 rounded-2xl p-3 md:p-4 bg-slate-50/40 relative">
                
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                  <div className="flex-1">
                    {editingId === faaliyet.id ? (
                      <div className="space-y-2 mb-2 bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                        <input
                          type="text"
                          value={editData.isinAdi}
                          onChange={e => setEditData({ ...editData, isinAdi: e.target.value })}
                          className="w-full text-sm font-bold border border-slate-200 rounded-lg px-2 py-1"
                          placeholder="İşin Adı"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editData.parsel}
                            onChange={e => setEditData({ ...editData, parsel: e.target.value, bloklar: defaultBlokForParsel(e.target.value) })}
                            className="w-1/2 text-xs border border-slate-200 rounded-lg px-2 py-1"
                          >
                            {PARSEL_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <select
                            value={editData.bloklar}
                            onChange={e => setEditData({ ...editData, bloklar: e.target.value })}
                            className="w-1/2 text-xs border border-slate-200 rounded-lg px-2 py-1"
                          >
                            {PARSEL_BLOK_MAP[editData.parsel]?.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editData.hedefTanimi}
                          onChange={e => setEditData({ ...editData, hedefTanimi: e.target.value })}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1"
                          placeholder="Hedef Tanımı"
                        />
                        <div className="flex gap-2 justify-end mt-2">
                          <button onClick={() => setEditingId(null)} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
                            <X size={14} /> İptal
                          </button>
                          <button onClick={saveEdit} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
                            <Save size={14} /> Kaydet
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-extrabold text-slate-800">{faaliyet.isinAdi}</div>
                          <div className="flex items-center gap-1 md:hidden">
                            <button onClick={() => startEditing(faaliyet)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-white rounded-lg border shadow-sm"><Pencil size={12}/></button>
                            <button onClick={() => handleDelete(faaliyet.id)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-white rounded-lg border shadow-sm"><Trash2 size={12}/></button>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {faaliyet.parsel} / {faaliyet.bloklar} · {faaliyet.tarih}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{faaliyet.hedefTanimi}</div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold border rounded-full px-2.5 py-1 ${getDurumClass(faaliyet.durum)}`}>
                      {faaliyet.durum}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(faaliyet)}
                      className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer"
                    >
                      <FileText size={14} />
                      Rapor (PDF)
                    </button>
                    {!editingId && (
                      <div className="hidden md:flex items-center gap-1">
                        <button onClick={() => startEditing(faaliyet)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-white rounded-lg border border-slate-200 shadow-sm transition"><Pencil size={14}/></button>
                        <button onClick={() => handleDelete(faaliyet.id)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-white rounded-lg border border-slate-200 shadow-sm transition"><Trash2 size={14}/></button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {ASAMA_SIRASI.map((adim) => {
                    const stageState = getStageState(faaliyet, adim);
                    return (
                      <div key={adim} className="bg-white border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-bold text-slate-700">{ASAMA_LABELS[adim]}</div>
                          {stageState.tamamlandi ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                              <CheckCircle2 size={14} />
                              Tamamlandı
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold">
                              <Hammer size={13} />
                              Bekliyor
                            </span>
                          )}
                        </div>

                        <textarea
                          value={stageState.aciklama}
                          onChange={(e) => updateDraftField(faaliyet.id, adim, 'aciklama', e.target.value)}
                          placeholder="Açıklama girin..."
                          className="w-full h-20 border border-slate-250 rounded-lg p-2 text-xs"
                        />

                        <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700 border border-slate-250 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-slate-50">
                          <Camera size={14} />
                          {stageState.uploading ? 'Yükleniyor...' : 'Fotoğraf Yükle'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleAsamaFoto(faaliyet.id, adim, e)}
                          />
                        </label>

                        {stageState.fotoUrl && (
                          <div className="mt-2">
                            <img
                              src={stageState.fotoUrl}
                              alt={`${ASAMA_LABELS[adim]} görseli`}
                              className="w-full h-32 object-cover rounded-lg border border-slate-200"
                            />
                          </div>
                        )}
                        {!stageState.fotoUrl && (
                          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
                            <ImageIcon size={12} />
                            Fotoğraf bekleniyor
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleAsamaTamamla(faaliyet, adim)}
                          disabled={stageState.tamamlandi}
                          className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg py-2 text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                        >
                          {stageState.tamamlandi ? 'Aşama Tamamlandı' : `${ASAMA_LABELS[adim]} Tamamla`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgramliFaaliyetScreen;
