import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Mail, Printer, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { fetchApiJson } from '../lib/apiClient';
import {
  COMPARE_FOCUS_LABELS,
  CompareFocus,
  CompareLaunchPayload,
  ComparisonReport,
} from '../lib/documentCompareTypes';
import {
  applyKalemRowsToPayload,
  buildCompareKalemRows,
  collectUserEdits,
  loadComparisonReports,
  saveComparisonReports,
  sendReportEmail,
} from '../lib/documentCompareUtils';
import { filterLinkedIrsaliyeler } from '../lib/documentLinkUtils';

interface DocumentCompareWizardProps {
  mode: 'irsaliye' | 'fatura';
  accent: 'emerald' | 'blue';
  storageKey: string;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  irsaliyeler: Irsaliye[];
  faturalar?: Fatura[];
  launchConfig?: CompareLaunchPayload | null;
  onLaunchConsumed?: () => void;
}

const FOCUS_OPTIONS: CompareFocus[] = ['miktar', 'firma', 'urun_adi', 'birim', 'fiyat', 'kg_ton_donusum'];

export const DocumentCompareWizard: React.FC<DocumentCompareWizardProps> = ({
  mode,
  accent,
  storageKey,
  satinAlmaTalepleri,
  irsaliyeler,
  faturalar = [],
  launchConfig,
  onLaunchConsumed,
}) => {
  const accentBtn = accent === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-900';
  const accentText = accent === 'emerald' ? 'text-emerald-700' : 'text-slate-800';

  const [selectedSaId, setSelectedSaId] = useState('');
  const [selectedIrIds, setSelectedIrIds] = useState<string[]>([]);
  const [selectedFaturaId, setSelectedFaturaId] = useState('');
  const [kalemRows, setKalemRows] = useState<ReturnType<typeof buildCompareKalemRows>>([]);
  const [compareFocus, setCompareFocus] = useState<CompareFocus[]>(['miktar', 'urun_adi', 'kg_ton_donusum']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [activeReport, setActiveReport] = useState<ComparisonReport | null>(null);
  const [reports, setReports] = useState<ComparisonReport[]>(() => loadComparisonReports(storageKey));
  const focusStepRef = React.useRef<HTMLDivElement>(null);

  const selectedSa = satinAlmaTalepleri.find(s => s.saId === selectedSaId);
  const selectedIrs = irsaliyeler.filter(ir => selectedIrIds.includes(ir.id));
  const selectedFatura = faturalar.find(f => f.id === selectedFaturaId);

  const availableIrs = useMemo(() => {
    if (selectedSaId) return irsaliyeler.filter(ir => ir.saId === selectedSaId || !ir.saId);
    return irsaliyeler;
  }, [irsaliyeler, selectedSaId]);

  useEffect(() => {
    setKalemRows(buildCompareKalemRows(selectedSa, selectedIrs, mode === 'fatura' ? selectedFatura : undefined));
  }, [selectedSa, selectedIrs, selectedFatura, mode]);

  useEffect(() => {
    if (!launchConfig) return;
    if (launchConfig.saId) setSelectedSaId(launchConfig.saId);
    if (launchConfig.irIds?.length) setSelectedIrIds(launchConfig.irIds);
    if (launchConfig.faturaId) setSelectedFaturaId(launchConfig.faturaId);
    if (launchConfig.compareFocus?.length) setCompareFocus(launchConfig.compareFocus);
    if (launchConfig.customInstructions !== undefined) setCustomInstructions(launchConfig.customInstructions);
    onLaunchConsumed?.();
    if (launchConfig.emphasizeFocus) {
      requestAnimationFrame(() => {
        focusStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [launchConfig, onLaunchConsumed]);

  const toggleIr = (id: string) => {
    setSelectedIrIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleFocus = (f: CompareFocus) => {
    setCompareFocus(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const updateKalem = (id: string, field: 'urunAdi' | 'miktar' | 'birim', value: string | number) => {
    setKalemRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const toggleKalem = (id: string) => {
    setKalemRows(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const canCompare = mode === 'fatura'
    ? selectedFatura && (selectedSa || selectedIrs.length > 0) && kalemRows.some(r => r.selected)
    : selectedSa && selectedIrs.length > 0 && kalemRows.some(r => r.selected);

  const runCompare = async () => {
    if (!canCompare) return;
    setIsComparing(true);
    try {
      const userEdits = collectUserEdits(kalemRows);
      const { saPayload, irPayload, ftPayload } = applyKalemRowsToPayload(
        selectedSa,
        selectedIrs,
        mode === 'fatura' ? selectedFatura : undefined,
        kalemRows
      );

      const res = await fetchApiJson<{ success: boolean; data?: { status: string; reportText: string; discrepancies: string[] }; error?: string }>(
        '/api/compare-3way',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saTalebi: saPayload || { saId: 'BAĞLANTI YOK', kalemler: [] },
            irsaliyeler: irPayload,
            fatura: ftPayload || { faturaNo: 'KARŞILAŞTIRMA YOK', kalemler: [] },
            compareFocus,
            customInstructions,
            userEdits,
          }),
        }
      );
      if (!res.success || !res.data) throw new Error(res.error || 'Karşılaştırma başarısız');

      const report: ComparisonReport = {
        id: `rep_${Date.now()}`,
        tarih: new Date().toISOString().split('T')[0],
        mode,
        saId: selectedSaId || undefined,
        faturaNo: selectedFatura?.faturaNo,
        irsaliyeNos: selectedIrs.map(i => i.irsaliyeNo),
        status: res.data.status,
        report: res.data.reportText,
        discrepancies: res.data.discrepancies || [],
        compareFocus,
        userEdits,
        customInstructions: customInstructions.trim() || undefined,
      };

      const updated = [report, ...reports];
      setReports(updated);
      saveComparisonReports(storageKey, updated);
      setActiveReport(report);
    } catch (e: unknown) {
      alert('Hata: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsComparing(false);
    }
  };

  const printReport = (rep: ComparisonReport) => {
    const editsBlock = rep.userEdits.length
      ? `\n\n--- KULLANICI DÜZENLEMELERİ ---\n${rep.userEdits.map(e => `• ${e.alan}: "${e.eski}" → "${e.yeni}"`).join('\n')}`
      : '';
    const html = `<html><head><meta charset="utf-8"><title>Karşılaştırma Raporu</title></head><body style="font-family:sans-serif;padding:24px"><h2>Kibritçi — Karşılaştırma Raporu</h2><p><b>Durum:</b> ${rep.status}</p><pre style="white-space:pre-wrap;background:#f1f5f9;padding:16px;border-radius:8px">${rep.report}${editsBlock}</pre></body></html>`;
    const w = window.open('', '_blank');
    w?.document.write(html);
    w?.print();
  };

  return (
    <div className="space-y-6">
      {/* Adım 1: Evrak seçimi */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
        <h4 className={`font-bold text-xs uppercase tracking-widest ${accentText}`}>
          1 · Karşılaştırmaya dahil evrakları seçin
        </h4>
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Satın Alma Siparişi</label>
            <select value={selectedSaId} onChange={e => setSelectedSaId(e.target.value)} className="w-full p-2 border rounded-xl bg-slate-50">
              <option value="">— PO Seç —</option>
              {satinAlmaTalepleri.map(sa => (
                <option key={sa.id} value={sa.saId}>{sa.saId} · {sa.cariFirma}</option>
              ))}
            </select>
          </div>
          {mode === 'fatura' && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Fatura</label>
              <select
                value={selectedFaturaId}
                onChange={e => {
                  setSelectedFaturaId(e.target.value);
                  const ft = faturalar.find(f => f.id === e.target.value);
                  if (ft?.saId) setSelectedSaId(ft.saId);
                  if (ft?.bagliIrsaliyeler?.length) {
                    const linked = filterLinkedIrsaliyeler(irsaliyeler, ft.bagliIrsaliyeler);
                    setSelectedIrIds(linked.map(i => i.id));
                  }
                }}
                className="w-full p-2 border rounded-xl bg-slate-50"
              >
                <option value="">— Fatura Seç —</option>
                {faturalar.map(ft => (
                  <option key={ft.id} value={ft.id}>{ft.faturaNo} · {ft.cariUnvan}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">İrsaliyeler (çoklu seçim)</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {availableIrs.map(ir => (
              <button
                key={ir.id}
                type="button"
                onClick={() => toggleIr(ir.id)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                  selectedIrIds.includes(ir.id) ? `${accentBtn} text-white border-transparent` : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {ir.irsaliyeNo} · {ir.firma}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Adım 2: Kalem seçimi & düzenleme */}
      {kalemRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
          <h4 className={`font-bold text-xs uppercase tracking-widest ${accentText}`}>
            2 · Kalemleri seçin ve gerekirse düzenleyin
          </h4>
          <p className="text-[10px] text-slate-500">Karşılaştırmaya dahil olmayan kalemlerin işaretini kaldırın. Miktar, birim veya isim düzeltmesi raporda alt kısımda belirtilir.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="p-2 w-8"></th>
                  <th className="p-2">Kaynak</th>
                  <th className="p-2">Ürün</th>
                  <th className="p-2">Miktar</th>
                  <th className="p-2">Birim</th>
                </tr>
              </thead>
              <tbody>
                {kalemRows.map(row => (
                  <tr key={row.id} className={`border-b border-slate-50 ${!row.selected ? 'opacity-40' : ''}`}>
                    <td className="p-2">
                      <button type="button" onClick={() => toggleKalem(row.id)} className="cursor-pointer text-slate-500">
                        {row.selected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </td>
                    <td className="p-2 font-mono text-[10px]">{row.kaynak} · {row.kaynakRef}</td>
                    <td className="p-2">
                      <input value={row.urunAdi} onChange={e => updateKalem(row.id, 'urunAdi', e.target.value)} className="w-full border rounded px-1 py-0.5 bg-slate-50" />
                    </td>
                    <td className="p-2 w-20">
                      <input type="number" value={row.miktar} onChange={e => updateKalem(row.id, 'miktar', Number(e.target.value))} className="w-full border rounded px-1 py-0.5 bg-slate-50" />
                    </td>
                    <td className="p-2 w-24">
                      <input value={row.birim} onChange={e => updateKalem(row.id, 'birim', e.target.value)} className="w-full border rounded px-1 py-0.5 bg-slate-50" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adım 3: AI yönlendirme */}
      <div
        ref={focusStepRef}
        className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4 ring-1 ring-transparent focus-within:ring-amber-100"
      >
        <h4 className={`font-bold text-xs uppercase tracking-widest ${accentText}`}>
          3 · Yapay zekaya neyi karşılaştırmasını söyleyin
        </h4>
        <p className="text-[10px] text-slate-500">
          Havuzdan geldiyseniz seçimleriniz aşağıya aktarıldı; burada değiştirebilirsiniz.
        </p>
        <div className="flex flex-wrap gap-2">
          {FOCUS_OPTIONS.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFocus(f)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border cursor-pointer ${
                compareFocus.includes(f) ? `${accentBtn} text-white border-transparent` : 'bg-slate-50 border-slate-200'
              }`}
            >
              {COMPARE_FOCUS_LABELS[f]}
            </button>
          ))}
        </div>
        <textarea
          value={customInstructions}
          onChange={e => setCustomInstructions(e.target.value)}
          placeholder="Örn: Sadece mıcır ve stabilize kalemlerinde KG-TON dönüşümünü kontrol et. Firma adı farklarını karşılaştırma."
          className="w-full text-xs p-3 border rounded-xl bg-slate-50 min-h-[72px]"
        />
        <button
          type="button"
          disabled={!canCompare || isComparing}
          onClick={runCompare}
          className={`${accentBtn} disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 cursor-pointer`}
        >
          <Sparkles size={14} />
          {isComparing ? 'Yapay Zeka Analiz Ediyor…' : 'Karşılaştırmayı Başlat'}
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Rapor arşivi */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
        <h4 className="font-bold text-xs uppercase tracking-widest text-slate-700 mb-4">Karşılaştırma Raporları</h4>
        {reports.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">Henüz rapor yok.</p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {reports.map(rep => (
              <div key={rep.id} className="border rounded-xl p-3 text-xs flex justify-between items-center gap-2">
                <div>
                  <span className={`font-black text-[9px] px-2 py-0.5 rounded-full ${rep.status === 'SORUNSUZ ONAY' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{rep.status}</span>
                  <p className="font-bold mt-1">{rep.saId || '—'} {rep.faturaNo ? `· ${rep.faturaNo}` : ''} · {rep.tarih}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setActiveReport(rep)} className="px-2 py-1 bg-slate-100 rounded-lg font-bold cursor-pointer">Gör</button>
                  <button type="button" onClick={() => printReport(rep)} className="p-1.5 bg-slate-100 rounded-lg cursor-pointer" title="PDF"><Printer size={14} /></button>
                  <button type="button" onClick={() => sendReportEmail(rep, `Karşılaştırma — ${rep.faturaNo || rep.saId}`)} className="p-1.5 bg-slate-100 rounded-lg cursor-pointer" title="E-posta"><Mail size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeReport && (
        <div className="fixed inset-0 bg-slate-950/75 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-xs uppercase text-amber-400">AI Karşılaştırma Raporu</h3>
              <button type="button" onClick={() => setActiveReport(null)} className="cursor-pointer text-slate-400 hover:text-white">✖</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold">{activeReport.saId} {activeReport.faturaNo && `· ${activeReport.faturaNo}`}</span>
                <span className={`font-black text-[9px] px-2 py-0.5 rounded-full ${activeReport.status === 'SORUNSUZ ONAY' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{activeReport.status}</span>
              </div>
              <pre className="bg-slate-950 text-slate-300 p-4 rounded-xl whitespace-pre-wrap font-mono text-[10px]">{activeReport.report}</pre>
              {activeReport.discrepancies.length > 0 && (
                <ul className="list-disc pl-4 text-rose-800 bg-rose-50 p-3 rounded-xl space-y-1">
                  {activeReport.discrepancies.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
              {activeReport.userEdits.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                  <p className="font-bold text-amber-900 text-[10px] uppercase mb-2">Kullanıcı tarafından değiştirilen bilgiler</p>
                  <ul className="space-y-1 text-[11px]">
                    {activeReport.userEdits.map((e, i) => (
                      <li key={i}><b>{e.alan}:</b> &quot;{e.eski}&quot; → &quot;{e.yeni}&quot;</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex gap-2 justify-end shrink-0">
              <button type="button" onClick={() => printReport(activeReport)} className="px-4 py-2 border rounded-xl font-bold cursor-pointer flex items-center gap-1"><Printer size={14} /> PDF</button>
              <button type="button" onClick={() => sendReportEmail(activeReport, `Yönetim Raporu — ${activeReport.faturaNo || activeReport.saId}`)} className={`${accentBtn} text-white px-4 py-2 rounded-xl font-bold cursor-pointer flex items-center gap-1`}><Mail size={14} /> Yönetime E-posta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
