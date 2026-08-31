import React, { useMemo, useState } from 'react';
import { Link2, ListChecks, GitCompare, Layers } from 'lucide-react';
import {
  EvrakBaglantiGrubu,
  Fatura,
  Irsaliye,
  SatinAlmaTalebi,
} from '../types/erp';
import { EvrakBaglamaWizard, BaglamaAnchor } from './EvrakBaglamaWizard';
import { BagliEvraklarListesi } from './BagliEvraklarListesi';
import { openEvrakZincirRaporu } from '../lib/evrakZincirRapor';
import { EvrakPageShell, EvrakSectionHeader } from './evrakUi/EvrakScreenChrome';

export interface EvrakBaglamaPrefill {
  saId?: string;
  irIds?: string[];
  faturaId?: string;
  anchor?: BaglamaAnchor;
}

interface EvrakBaglamaScreenProps {
  satinAlmaTalepleri: SatinAlmaTalebi[];
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  evrakBaglantiGruplari: EvrakBaglantiGrubu[];
  setEvrakBaglantiGruplari: React.Dispatch<React.SetStateAction<EvrakBaglantiGrubu[]>>;
  prefill: EvrakBaglamaPrefill | null;
  onClearPrefill: () => void;
  onNavigateToBaglama?: (prefill: EvrakBaglamaPrefill) => void;
  currentUser?: { email?: string };
}

type SubTab = 'baglama' | 'karsilastir' | 'bagli';

export const EvrakBaglamaScreen: React.FC<EvrakBaglamaScreenProps> = ({
  satinAlmaTalepleri,
  irsaliyeler,
  faturalar,
  setIrsaliyeler,
  setFaturalar,
  evrakBaglantiGruplari,
  setEvrakBaglantiGruplari,
  prefill,
  onClearPrefill,
  onNavigateToBaglama,
  currentUser,
}) => {
  const [subTab, setSubTab] = useState<SubTab>(prefill ? 'baglama' : 'baglama');
  const [anchor, setAnchor] = useState<BaglamaAnchor>(prefill?.anchor ?? 'irsaliye');
  const [cmpSaId, setCmpSaId] = useState('');
  const [cmpIrIds, setCmpIrIds] = useState<string[]>([]);
  const [cmpFtId, setCmpFtId] = useState('');

  const cmpIrs = useMemo(
    () =>
      irsaliyeler.filter((ir) => {
        if (cmpSaId && ir.saId && ir.saId !== cmpSaId) return false;
        return true;
      }),
    [irsaliyeler, cmpSaId]
  );

  const toggleCmpIr = (id: string) => {
    setCmpIrIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runCompare = () => {
    const sa = satinAlmaTalepleri.find((s) => s.saId === cmpSaId);
    const irs = irsaliyeler.filter((ir) => cmpIrIds.includes(ir.id));
    const ft = faturalar.find((f) => f.id === cmpFtId);
    if (!sa && irs.length === 0 && !ft) {
      alert('Karşılaştırmak için en az bir evrak seçin.');
      return;
    }
    openEvrakZincirRaporu({
      sa,
      irsaliyeler: irs.length ? irs : irsaliyeler,
      faturalar: ft ? [ft, ...faturalar.filter((f) => f.id !== ft.id)] : faturalar,
      focusIrsaliyeIds: irs.map((x) => x.id),
    });
  };

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="sa"
        eyebrow="Muhasebe zinciri"
        title="Evrak bağlama"
        subtitle="Satın alma, irsaliye ve faturayı burada esnek bağlayın veya karşılaştırın. Oluşturma sekmeleri yalın kalır."
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['baglama', 'Bağla', Link2],
            ['karsilastir', 'Karşılaştır', GitCompare],
            ['bagli', `Bağlı evraklar (${evrakBaglantiGruplari.length})`, ListChecks],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
              subTab === id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'baglama' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ['satin_alma', 'Satın alma → İrsaliye / Fatura', 'Siparişten sevk veya faturaya bağla'],
                ['irsaliye', 'İrsaliye → Fatura / SA', 'Sevki faturaya veya siparişe bağla'],
                ['fatura', 'Fatura → İrsaliye / SA', 'Faturayı sevk veya siparişle eşle'],
              ] as const
            ).map(([id, title, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAnchor(id)}
                className={`text-left rounded-xl border p-3 cursor-pointer ${
                  anchor === id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="text-[11px] font-black uppercase tracking-wide">{title}</p>
                <p className={`text-[10px] mt-1 ${anchor === id ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</p>
              </button>
            ))}
          </div>
          <EvrakBaglamaWizard
            accent="blue"
            anchorHint={anchor}
            satinAlmaTalepleri={satinAlmaTalepleri}
            irsaliyeler={irsaliyeler}
            faturalar={faturalar}
            setIrsaliyeler={setIrsaliyeler}
            setFaturalar={setFaturalar}
            setEvrakBaglantiGruplari={setEvrakBaglantiGruplari}
            currentUser={currentUser}
            prefillSaId={prefill?.saId}
            prefillIrIds={prefill?.irIds}
            prefillFaturaId={prefill?.faturaId}
            onComplete={() => {
              onClearPrefill();
              setSubTab('bagli');
            }}
          />
        </div>
      )}

      {subTab === 'karsilastir' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-2">
            <Layers className="w-4 h-4 text-slate-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Zincir karşılaştırma</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                İstediğiniz evrakları seçin — üçünü birden doldurmak zorunda değilsiniz. Rapor antetli açılır.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Satın alma</span>
              <select
                value={cmpSaId}
                onChange={(e) => setCmpSaId(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white"
              >
                <option value="">Seçilmedi</option>
                {satinAlmaTalepleri.map((s) => (
                  <option key={s.id} value={s.saId}>
                    {s.saId} · {s.cariFirma}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Fatura</span>
              <select
                value={cmpFtId}
                onChange={(e) => setCmpFtId(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white"
              >
                <option value="">Seçilmedi</option>
                {faturalar.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.faturaNo} · {f.cariUnvan}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={runCompare}
                className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                Karşılaştırma raporunu aç
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">İrsaliyeler (çoklu)</p>
            <div className="max-h-56 overflow-auto border border-slate-100 rounded-xl">
              {cmpIrs.slice(0, 80).map((ir) => (
                <label
                  key={ir.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={cmpIrIds.includes(ir.id)}
                    onChange={() => toggleCmpIr(ir.id)}
                  />
                  <span className="font-semibold">{ir.irsaliyeNo}</span>
                  <span className="text-slate-500 truncate">{ir.firma}</span>
                  <span className="ml-auto text-slate-400">{ir.tarih}</span>
                </label>
              ))}
              {cmpIrs.length === 0 && (
                <p className="p-4 text-[11px] text-slate-400 text-center">İrsaliye yok.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {subTab === 'bagli' && (
        <BagliEvraklarListesi
          mode="unified"
          accent="blue"
          faturalar={faturalar}
          irsaliyeler={irsaliyeler}
          satinAlmaTalepleri={satinAlmaTalepleri}
          evrakBaglantiGruplari={evrakBaglantiGruplari}
          setFaturalar={setFaturalar}
          setIrsaliyeler={setIrsaliyeler}
          onEditBinding={(g) => {
            onNavigateToBaglama?.({
              saId: g.saId,
              irIds: g.irsaliyeIds,
              faturaId: g.faturaId,
            });
            setSubTab('baglama');
          }}
        />
      )}
    </EvrakPageShell>
  );
};

export default EvrakBaglamaScreen;
