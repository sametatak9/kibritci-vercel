import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Mail,
  Printer,
  FileText,
  Upload,
  ChevronDown,
  Archive,
  Eye,
  X,
} from 'lucide-react';
import {
  EvrakBaglantiGrubu,
  Fatura,
  Irsaliye,
  OnayliAnalizRaporu,
  SatinAlmaTalebi,
} from '../types/erp';
import { COMPARE_FOCUS_LABELS, CompareFocus } from '../lib/documentCompareTypes';
import { fetchApiJson } from '../lib/apiClient';
import { getAnalizHavuzu } from '../lib/evrakBaglamaUtils';
import { sendReportEmail } from '../lib/documentCompareUtils';
import { compressImage } from '../lib/imageCompress';
import { EvrakTabBilgi } from './EvrakTabBilgi';
import { EvrakDetayModal, EvrakDetayPayload } from './EvrakDetayModal';
import {
  buildKibritciReportHtml,
  downloadKibritciReportHtml,
  openKibritciReportPrint,
} from '../lib/kibritciReportTemplate';

const ANALIZ_FOCUS_OPTIONS: CompareFocus[] = [
  'miktar',
  'firma',
  'tarih',
  'tutar',
  'urun_adi',
  'birim',
  'fiyat',
  'kg_ton_donusum',
];

interface YapayZekaKarsilastirScreenProps {
  faturalar: Fatura[];
  irsaliyeler: Irsaliye[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  evrakBaglantiGruplari: EvrakBaglantiGrubu[];
  onayliAnalizRaporlari: OnayliAnalizRaporu[];
  setOnayliAnalizRaporlari: React.Dispatch<React.SetStateAction<OnayliAnalizRaporu[]>>;
  currentUser?: { email?: string };
}

export const YapayZekaKarsilastirScreen: React.FC<YapayZekaKarsilastirScreenProps> = ({
  faturalar,
  irsaliyeler,
  satinAlmaTalepleri,
  evrakBaglantiGruplari,
  onayliAnalizRaporlari,
  setOnayliAnalizRaporlari,
  currentUser,
}) => {
  const [selectedGrupId, setSelectedGrupId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [analizOdak, setAnalizOdak] = useState<CompareFocus[]>(['miktar', 'tutar', 'tarih']);
  const [ozelTalimat, setOzelTalimat] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draftReport, setDraftReport] = useState('');
  const [draftGrupId, setDraftGrupId] = useState<string | null>(null);
  const [detayPayload, setDetayPayload] = useState<EvrakDetayPayload | null>(null);

  const havuz = useMemo(
    () => getAnalizHavuzu(evrakBaglantiGruplari, faturalar, irsaliyeler, satinAlmaTalepleri),
    [evrakBaglantiGruplari, faturalar, irsaliyeler, satinAlmaTalepleri]
  );

  const selectedGrup = havuz.find((g) => g.id === selectedGrupId);

  const openAnaliz = (grup: EvrakBaglantiGrubu) => {
    setSelectedGrupId(grup.id);
    setModalOpen(true);
    setDraftReport('');
    setDraftGrupId(null);
  };

  const toggleFocus = (f: CompareFocus) => {
    setAnalizOdak((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const runAnaliz = async () => {
    if (!selectedGrup) return;
    setIsAnalyzing(true);
    try {
      const sa = selectedGrup.saId
        ? satinAlmaTalepleri.find((s) => s.saId === selectedGrup.saId)
        : undefined;
      const irs = irsaliyeler.filter((ir) => selectedGrup.irsaliyeIds.includes(ir.id));
      const ft = selectedGrup.faturaId
        ? faturalar.find((f) => f.id === selectedGrup.faturaId)
        : undefined;

      const res = await fetchApiJson<{
        success: boolean;
        data?: { reportText: string; status: string; discrepancies: string[] };
        error?: string;
      }>('/api/analyze-linked-evrak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saTalebi: sa || { saId: selectedGrup.saId, kalemler: [] },
          irsaliyeler: irs,
          fatura: ft || { faturaNo: 'YOK', kalemler: [] },
          kalemBaglantilari: selectedGrup.kalemBaglantilari,
          analizOdak,
          ozelTalimat: ozelTalimat.trim(),
        }),
      });

      if (!res.success || !res.data) throw new Error(res.error || 'Analiz başarısız');
      setDraftReport(res.data.reportText);
      setDraftGrupId(selectedGrup.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Analiz hatası');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const printReport = (text: string, title: string, meta?: string[]) => {
    const html = buildKibritciReportHtml({
      title: 'YZ Evrak Analiz Raporu',
      subtitle: title,
      bodyHtml: text,
      meta,
    });
    openKibritciReportPrint(html, title);
  };

  const downloadReportHtml = (text: string, title: string, meta?: string[]) => {
    const html = buildKibritciReportHtml({
      title: 'YZ Evrak Analiz Raporu',
      subtitle: title,
      bodyHtml: text,
      meta,
    });
    downloadKibritciReportHtml(html, `kibritci-analiz-${Date.now()}`);
  };

  const openGrupDetay = (g: EvrakBaglantiGrubu) => {
    const sa = g.saId ? satinAlmaTalepleri.find((s) => s.saId === g.saId) : undefined;
    if (sa) {
      setDetayPayload({ kind: 'sa', sa });
      return;
    }
    const ir = irsaliyeler.find((i) => g.irsaliyeIds.includes(i.id));
    if (ir) {
      setDetayPayload({ kind: 'irsaliye', irsaliye: ir });
      return;
    }
    const ft = g.faturaId ? faturalar.find((f) => f.id === g.faturaId) : undefined;
    if (ft) setDetayPayload({ kind: 'fatura', fatura: ft });
  };

  const archiveReport = (imzaliUrl?: string) => {
    if (!draftReport || !draftGrupId) return;
    const grup = havuz.find((g) => g.id === draftGrupId);
    const ft = grup?.faturaId ? faturalar.find((f) => f.id === grup.faturaId) : undefined;
    const irs = grup ? irsaliyeler.filter((ir) => grup.irsaliyeIds.includes(ir.id)) : [];

    const rapor: OnayliAnalizRaporu = {
      id: `oar_${Date.now()}`,
      grupId: draftGrupId,
      tarih: new Date().toISOString().split('T')[0],
      analizOdak,
      ozelTalimat: ozelTalimat.trim() || undefined,
      raporMetni: draftReport,
      durum: imzaliUrl ? 'ONAYLANDI' : 'TASLAK',
      imzaliEvrakUrl: imzaliUrl,
      olusturan: currentUser?.email,
      saId: grup?.saId,
      faturaNo: ft?.faturaNo,
      irsaliyeNos: irs.map((i) => i.irsaliyeNo),
    };
    setOnayliAnalizRaporlari((prev) => [rapor, ...prev]);
    setModalOpen(false);
    alert(imzaliUrl ? 'İmzalı analiz raporu arşive eklendi.' : 'Analiz raporu arşive kaydedildi.');
  };

  const handleSignUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string);
      archiveReport(compressed);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" />
          Yapay Zeka ile Karşılaştır ve Yorumla
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Bağlı evrak grupları burada birikir. Analiz yapın, raporu PDF/e-posta ile paylaşın ve arşivleyin.
        </p>
      </header>

      <EvrakTabBilgi tab="yz" />

      <section className="space-y-3">
        <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
          Analiz Havuzu ({havuz.length})
        </h2>
        {havuz.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-8 text-center border border-dashed rounded-2xl">
            Havuz boş. Fatura veya İrsaliye ekranından 2 aşamalı bağlama yapın.
          </p>
        ) : (
          havuz.map((g) => {
            const ft = g.faturaId ? faturalar.find((f) => f.id === g.faturaId) : undefined;
            const irs = irsaliyeler.filter((ir) => g.irsaliyeIds.includes(ir.id));
            const sa = g.saId ? satinAlmaTalepleri.find((s) => s.saId === g.saId) : undefined;

            return (
              <div
                key={g.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
              >
                <div className="p-4 border-b bg-gradient-to-r from-violet-50 to-white flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-900">{g.cariUnvan || 'Evrak Grubu'}</p>
                    <p className="text-[10px] text-slate-500">{g.olusturmaTarihi} · Analiz bekliyor</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openGrupDetay(g)}
                      className="px-3 py-2 border border-slate-200 hover:bg-white text-slate-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" /> Evrak Detay Gör
                    </button>
                    <button
                      type="button"
                      onClick={() => openAnaliz(g)}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Analiz Yap
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-1 text-xs font-mono">
                  {sa && (
                    <div className="flex items-center gap-2 py-1 border-l-2 border-slate-800 pl-3">
                      <span className="text-slate-800 font-bold">SA</span>
                      <span>{sa.saId}</span>
                      <span className="text-slate-500 font-sans text-[10px]">
                        · {sa.kalemler.length} kalem
                      </span>
                    </div>
                  )}
                  {irs.map((ir) => (
                    <div
                      key={ir.id}
                      className="flex items-center gap-2 py-1 border-l-2 border-emerald-500 pl-6 ml-2"
                    >
                      <span className="text-emerald-700 font-bold">İRS</span>
                      <span>{ir.irsaliyeNo}</span>
                      <span className="text-slate-500 font-sans text-[10px]">· {ir.firma}</span>
                    </div>
                  ))}
                  {ft && (
                    <div className="flex items-center gap-2 py-1 border-l-2 border-amber-500 pl-6 ml-2">
                      <span className="text-amber-800 font-bold">FAT</span>
                      <span>{ft.faturaNo}</span>
                      <span className="text-slate-500 font-sans text-[10px]">
                        · {ft.genelToplam.toLocaleString('tr-TR')} TL
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-4 pb-4 space-y-3 text-xs">
                  {g.kalemBaglantilari.length > 0 && (
                    <details className="bg-slate-50 rounded-xl p-3">
                      <summary className="font-bold text-[10px] uppercase text-slate-500 cursor-pointer flex items-center gap-1">
                        <ChevronDown className="w-3 h-3" /> Kalem bağlantıları ({g.kalemBaglantilari.length})
                      </summary>
                      <ul className="mt-2 space-y-1 text-[10px]">
                        {g.kalemBaglantilari.map((k) => (
                          <li key={k.id}>
                            {k.urunAdi}
                            {k.saMiktar != null && ` · SA:${k.saMiktar}`}
                            {k.irsaliyeMiktar != null && ` · İRS:${k.irsaliyeMiktar}`}
                            {k.faturaMiktar != null && ` · FAT:${k.faturaMiktar}`}
                            {k.birim && ` ${k.birim}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
          <Archive className="w-4 h-4" /> Onaylanmış Analiz Raporları
        </h2>
        {onayliAnalizRaporlari.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Henüz arşivlenmiş rapor yok.</p>
        ) : (
          onayliAnalizRaporlari.map((r) => (
            <div key={r.id} className="bg-white border rounded-xl p-4 text-xs space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-bold">{r.tarih}</span>
                {r.saId && <span className="text-slate-800">SA:{r.saId}</span>}
                {r.faturaNo && <span>FAT:{r.faturaNo}</span>}
                <span
                  className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${
                    r.durum === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100'
                  }`}
                >
                  {r.durum}
                </span>
              </div>
              <p className="text-slate-600 line-clamp-3 whitespace-pre-wrap">{r.raporMetni}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printReport(r.raporMetni, 'Analiz Raporu')}
                  className="px-2 py-1 border rounded-lg font-bold cursor-pointer flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => sendReportEmail(r.raporMetni, `Analiz: ${r.faturaNo || r.saId}`)}
                  className="px-2 py-1 border rounded-lg font-bold cursor-pointer flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" /> E-posta
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {modalOpen && selectedGrup && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> AI Analiz
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <p className="text-slate-600">
                Bağlı evrakları hangi yönüyle analiz etmek istersiniz?
              </p>
              <div className="flex flex-wrap gap-2">
                {ANALIZ_FOCUS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFocus(f)}
                    className={`px-3 py-1.5 rounded-full border font-bold cursor-pointer ${
                      analizOdak.includes(f)
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-slate-200'
                    }`}
                  >
                    {COMPARE_FOCUS_LABELS[f]}
                  </button>
                ))}
              </div>
              <textarea
                value={ozelTalimat}
                onChange={(e) => setOzelTalimat(e.target.value)}
                placeholder="Ek talimat (isteğe bağlı)..."
                className="w-full border rounded-xl p-3 min-h-[80px]"
              />

              {!draftReport ? (
                <button
                  type="button"
                  disabled={isAnalyzing || analizOdak.length === 0}
                  onClick={runAnaliz}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-xl cursor-pointer"
                >
                  {isAnalyzing ? 'Analiz yapılıyor...' : 'Analizi Başlat'}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-50 border rounded-xl p-4 max-h-64 overflow-y-auto whitespace-pre-wrap text-slate-800">
                    {draftReport}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        printReport(draftReport, 'YZ Analiz Raporu', [
                          selectedGrup.saId ? `PO: ${selectedGrup.saId}` : '',
                          `Odak: ${analizOdak.join(', ')}`,
                        ].filter(Boolean))
                      }
                      className="flex items-center gap-1 px-3 py-2 border rounded-xl font-bold cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> PDF Yazdır
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadReportHtml(draftReport, 'YZ Analiz', [
                          selectedGrup.saId ? `PO: ${selectedGrup.saId}` : '',
                        ].filter(Boolean))
                      }
                      className="flex items-center gap-1 px-3 py-2 border rounded-xl font-bold cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" /> HTML Kaydet
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sendReportEmail(draftReport, `Evrak Analizi ${selectedGrup.saId || ''}`)
                      }
                      className="flex items-center gap-1 px-3 py-2 border rounded-xl font-bold cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" /> E-posta
                    </button>
                    <label className="flex items-center gap-1 px-3 py-2 border rounded-xl font-bold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" /> İmzalı Yükle
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleSignUpload} />
                    </label>
                    <button
                      type="button"
                      onClick={() => archiveReport()}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" /> Arşivle
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <EvrakDetayModal
        open={!!detayPayload}
        payload={detayPayload}
        onClose={() => setDetayPayload(null)}
      />
    </div>
  );
};
