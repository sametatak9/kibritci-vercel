import React from 'react';
import { CreditCard, Banknote } from 'lucide-react';
import { MaasScreen } from './MaasScreen';
import { MaasOdeScreen } from './MaasOdeScreen';
import { Personel, AylikYoklamaMap, MaaşOdeme } from '../types/erp';

type MaasSubTab = 'hesapla' | 'odeme';

interface MaasMerkeziScreenProps {
  subTab: MaasSubTab;
  setSubTab: (tab: MaasSubTab) => void;
  isYonetici: boolean;
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  maasOdemeleri: MaaşOdeme[];
  setMaasOdemeleri: React.Dispatch<React.SetStateAction<MaaşOdeme[]>>;
  currentUser: any;
  initialMonth?: number;
  initialYear?: number;
  onPeriodChange?: (month: number, year: number) => void;
  onSaveHesapTaslaklari?: (payload: {
    month: number;
    year: number;
    rows: Array<{
      personel: Personel;
      brutMaas: number;
      mesaiUcreti: number;
      toplamHakedis: number;
      kesintiToplami: number;
      netOdeme: number;
    }>;
  }) => void;
}

/**
 * "Maaş Hesaplama" ve "Maaş Ödeme" ekranlarını tek sekmede birleştirir.
 * Alt sekmeler ile geçiş yapılır; Ödeme alt sekmesi yalnızca yöneticilere görünür.
 */
export const MaasMerkeziScreen: React.FC<MaasMerkeziScreenProps> = ({
  subTab,
  setSubTab,
  isYonetici,
  personeller,
  yoklamalar,
  maasOdemeleri,
  setMaasOdemeleri,
  currentUser,
  initialMonth,
  initialYear,
  onPeriodChange,
  onSaveHesapTaslaklari,
}) => {
  const activeSubTab: MaasSubTab = subTab === 'odeme' && !isYonetici ? 'hesapla' : subTab;

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('hesapla')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition cursor-pointer ${
              activeSubTab === 'hesapla'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CreditCard size={16} />
            <span>Maaş Hesaplama</span>
          </button>
          {isYonetici && (
            <button
              type="button"
              onClick={() => setSubTab('odeme')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition cursor-pointer ${
                activeSubTab === 'odeme'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Banknote size={16} />
              <span>Maaş Ödeme</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {activeSubTab === 'hesapla' ? (
          <MaasScreen
            personeller={personeller}
            yoklamalar={yoklamalar}
            maasOdemeleri={maasOdemeleri}
            initialMonth={initialMonth}
            initialYear={initialYear}
            onPeriodChange={onPeriodChange}
            onSaveHesapTaslaklari={onSaveHesapTaslaklari}
            onOpenMaasOdeme={isYonetici ? () => setSubTab('odeme') : undefined}
          />
        ) : (
          <MaasOdeScreen
            personeller={personeller}
            yoklamalar={yoklamalar}
            maasOdemeleri={maasOdemeleri}
            setMaasOdemeleri={setMaasOdemeleri}
            currentUser={currentUser}
            initialMonth={initialMonth}
            initialYear={initialYear}
            onPeriodChange={onPeriodChange}
          />
        )}
      </div>
    </div>
  );
};

export default MaasMerkeziScreen;
