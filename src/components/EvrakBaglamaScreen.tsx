import React, { useState } from 'react';
import { Link2, ListChecks } from 'lucide-react';
import {
  EvrakBaglantiGrubu,
  Fatura,
  Irsaliye,
  SatinAlmaTalebi,
} from '../types/erp';
import { EvrakBaglamaWizard, BaglamaAnchor } from './EvrakBaglamaWizard';
import { BagliEvraklarListesi } from './BagliEvraklarListesi';
import { EvrakTabBilgi } from './EvrakTabBilgi';

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
  onNavigateToYz?: () => void;
  currentUser?: { email?: string };
}

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
  onNavigateToYz,
  currentUser,
}) => {
  const [subTab, setSubTab] = useState<'baglama' | 'bagli'>('baglama');

  return (
    <div className="flex-grow p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans select-none bg-slate-50/50 space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-xs gap-4 shrink-0">
        <div className="space-y-1">
          <span className="text-[10px] font-black tracking-widest text-indigo-600 uppercase">
            Evrak Bağlama Merkezi
          </span>
          <h2 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-indigo-600" />
            Satın Alma · İrsaliye · Fatura — Tek Ekran Bağlama
          </h2>
          <p className="text-[10px] text-slate-500 max-w-xl">
            Tüm evraklar birbirinden bağımsız seçilebilir. YZ karşılaştırma havuzunda sıralama her zaman
            Satın Alma → İrsaliye → Fatura şeklinde yapılır; eksik evrak atlanır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubTab('baglama')}
            className={`px-4 py-2 font-bold rounded-xl text-xs transition cursor-pointer ${
              subTab === 'baglama'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            1 · Bağlama Sihirbazı
          </button>
          <button
            type="button"
            onClick={() => setSubTab('bagli')}
            className={`px-4 py-2 font-bold rounded-xl text-xs transition cursor-pointer ${
              subTab === 'bagli'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            2 · Bağlı Evraklar ({evrakBaglantiGruplari.length})
          </button>
        </div>
      </div>

      {subTab === 'baglama' && (
        <>
          <EvrakTabBilgi tab="evrak-baglama" />
          <EvrakBaglamaWizard
            accent="blue"
            anchorHint={prefill?.anchor ?? 'fatura'}
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
        </>
      )}

      {subTab === 'bagli' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-indigo-900">
              <ListChecks className="w-4 h-4" />
              <span className="font-bold">Onaylanmış bağlantı grupları — YZ analiz havuzuna düşer.</span>
            </div>
            {onNavigateToYz && (
              <button
                type="button"
                onClick={onNavigateToYz}
                className="text-[10px] font-black px-3 py-1.5 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700"
              >
                YZ Karşılaştır sekmesine git →
              </button>
            )}
          </div>
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
        </div>
      )}
    </div>
  );
};
