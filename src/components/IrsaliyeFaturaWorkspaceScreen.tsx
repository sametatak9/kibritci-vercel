import React, { useEffect, useState } from 'react';
import { CreditCard, FileStack, GitCompare, MessageCircle, Truck } from 'lucide-react';
import type {
  CariKart,
  CariKartIslem,
  EvrakBaglantiGrubu,
  Fatura,
  Irsaliye,
  OnayliAnalizRaporu,
  SatinAlmaTalebi,
  StokKart,
  StokKartIslem,
} from '../types/erp';
import type { SaIrsaliyeFormPrefill } from '../lib/evrakDonusum';
import {
  IRSALIYE_FATURA_PANES,
  type IrsaliyeFaturaPane,
  readWorkspacePane,
  writeWorkspacePane,
} from '../lib/irsaliyeFaturaNav';
import { IrsaliyeGirisScreen } from './IrsaliyeGirisScreen';
import { FaturaGirisScreen } from './FaturaGirisScreen';
import { EvrakBaglamaScreen, type EvrakBaglamaPrefill } from './EvrakBaglamaScreen';
import { YapayZekaKarsilastirScreen } from './YapayZekaKarsilastirScreen';
import { DocumentCompareWizard } from './DocumentCompareWizard';
import { WhatsAppIsciGirisPanel } from './WhatsAppIsciGirisPanel';

const PANE_ICON: Record<IrsaliyeFaturaPane, React.ElementType> = {
  irsaliye: Truck,
  fatura: CreditCard,
  birlestir: FileStack,
  karsilastir: GitCompare,
  isci: MessageCircle,
};

interface IrsaliyeFaturaWorkspaceScreenProps {
  initialPane?: IrsaliyeFaturaPane;
  irsaliyeler: Irsaliye[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  faturalar: Fatura[];
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  evrakBaglantiGruplari: EvrakBaglantiGrubu[];
  setEvrakBaglantiGruplari: React.Dispatch<React.SetStateAction<EvrakBaglantiGrubu[]>>;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  stokKartlar: StokKart[];
  setStokKartlar?: React.Dispatch<React.SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: React.Dispatch<React.SetStateAction<StokKartIslem[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  onayliAnalizRaporlari: OnayliAnalizRaporu[];
  setOnayliAnalizRaporlari: React.Dispatch<React.SetStateAction<OnayliAnalizRaporu[]>>;
  currentUser?: { email?: string };
  addNotification?: (mesaj: string) => void;
  prefillFromSa?: SaIrsaliyeFormPrefill | null;
  onPrefillConsumed?: () => void;
  onOpenTCetveli?: () => void;
}

export const IrsaliyeFaturaWorkspaceScreen: React.FC<IrsaliyeFaturaWorkspaceScreenProps> = ({
  initialPane,
  irsaliyeler,
  setIrsaliyeler,
  faturalar,
  setFaturalar,
  evrakBaglantiGruplari,
  setEvrakBaglantiGruplari,
  satinAlmaTalepleri,
  cariKartlar,
  setCariKartlar,
  stokKartlar,
  setStokKartlar,
  setStokIslemGecmisi,
  setCariIslemGecmisi,
  onayliAnalizRaporlari,
  setOnayliAnalizRaporlari,
  currentUser,
  addNotification,
  prefillFromSa,
  onPrefillConsumed,
  onOpenTCetveli,
}) => {
  const [pane, setPane] = useState<IrsaliyeFaturaPane>(() => initialPane || readWorkspacePane('irsaliye'));
  const [baglamaPrefill, setBaglamaPrefill] = useState<EvrakBaglamaPrefill | null>(null);

  useEffect(() => {
    if (initialPane) {
      setPane(initialPane);
      writeWorkspacePane(initialPane);
    }
  }, [initialPane]);

  const selectPane = (next: IrsaliyeFaturaPane) => {
    setPane(next);
    writeWorkspacePane(next);
  };

  const sharedGiris = {
    irsaliyeler,
    setIrsaliyeler,
    faturalar,
    setFaturalar,
    evrakBaglantiGruplari,
    setEvrakBaglantiGruplari,
    satinAlmaTalepleri,
    cariKartlar,
    setCariKartlar,
    stokKartlar,
    setStokKartlar,
    currentUser,
    addNotification,
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-52px)] bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-4 sm:px-6 pt-4 pb-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">Muhasebe evrakı</p>
              <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">İrsaliye &amp; Fatura</h1>
              <p className="text-[11px] text-slate-500 max-w-2xl">
                Paraşüt tarzı giriş: önce evrak, sonra cari ve kalemler. Birleştirme esnek; birleşen gruplar
                aynı ekranda karşılaştırılır. Eski irsaliye / fatura kayıt mantığı aynıdır.
              </p>
            </div>
            <div className="text-[10px] text-slate-400 font-semibold">
              {irsaliyeler.length} irsaliye · {faturalar.length} fatura · {evrakBaglantiGruplari.length} bağ
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-0.5 -mx-1 px-1" aria-label="İrsaliye fatura sekmeleri">
            {IRSALIYE_FATURA_PANES.map((item) => {
              const Icon = PANE_ICON[item.key];
              const active = pane === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  title={item.hint}
                  onClick={() => selectPane(item.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon size={13} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        {pane === 'irsaliye' && (
          <IrsaliyeGirisScreen
            {...sharedGiris}
            setStokIslemGecmisi={setStokIslemGecmisi}
            setCariIslemGecmisi={setCariIslemGecmisi}
            prefillFromSa={prefillFromSa}
            onPrefillConsumed={onPrefillConsumed}
            onOpenTCetveli={onOpenTCetveli}
          />
        )}

        {pane === 'fatura' && (
          <FaturaGirisScreen
            {...sharedGiris}
            setCariIslemGecmisi={setCariIslemGecmisi}
          />
        )}

        {pane === 'birlestir' && (
          <EvrakBaglamaScreen
            satinAlmaTalepleri={satinAlmaTalepleri}
            irsaliyeler={irsaliyeler}
            faturalar={faturalar}
            setIrsaliyeler={setIrsaliyeler}
            setFaturalar={setFaturalar}
            evrakBaglantiGruplari={evrakBaglantiGruplari}
            setEvrakBaglantiGruplari={setEvrakBaglantiGruplari}
            prefill={baglamaPrefill}
            onClearPrefill={() => setBaglamaPrefill(null)}
            onNavigateToBaglama={setBaglamaPrefill}
            onNavigateToYz={() => selectPane('karsilastir')}
            currentUser={currentUser}
          />
        )}

        {pane === 'karsilastir' && (
          <div className="space-y-4 p-4 sm:p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">Birleşen evrak karşılaştırması</h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Bağlanan grupları YZ ile analiz edin veya irsaliye / fatura kalemlerini üçlü karşılaştırın.
                Fiyat ve miktar farkı Paraşüt’teki irsaliye–fatura eşlemesine benzer şekilde listelenir.
              </p>
            </div>
            <YapayZekaKarsilastirScreen
              faturalar={faturalar}
              irsaliyeler={irsaliyeler}
              satinAlmaTalepleri={satinAlmaTalepleri}
              evrakBaglantiGruplari={evrakBaglantiGruplari}
              onayliAnalizRaporlari={onayliAnalizRaporlari}
              setOnayliAnalizRaporlari={setOnayliAnalizRaporlari}
              currentUser={currentUser}
            />
            <DocumentCompareWizard
              mode="fatura"
              accent="blue"
              storageKey="kibritci_compare_workspace"
              satinAlmaTalepleri={satinAlmaTalepleri}
              irsaliyeler={irsaliyeler}
              faturalar={faturalar}
            />
          </div>
        )}

        {pane === 'isci' && <WhatsAppIsciGirisPanel currentUser={currentUser} />}
      </div>
    </div>
  );
};
