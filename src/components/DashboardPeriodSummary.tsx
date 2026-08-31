import React, { useState } from 'react';
import { Personel, SatinAlmaTalebi, KasaHareketi, AylikYoklamaMap } from '../types/erp';
import { DashboardTodaySummary } from './DashboardTodaySummary';
import { DashboardWeekSummary } from './DashboardWeekSummary';

type Props = {
  personeller: Personel[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  kasaHareketleri: KasaHareketi[];
  yoklamalar: AylikYoklamaMap;
  bildirimler?: any[];
  onNavigate: (tab: string) => void;
};

/** Bugün / Bu hafta özetlerini tek toggle altında gösterir. */
export const DashboardPeriodSummary: React.FC<Props> = ({
  personeller,
  satinAlmaTalepleri,
  kasaHareketleri,
  yoklamalar,
  bildirimler = [],
  onNavigate,
}) => {
  const [mode, setMode] = useState<'bugun' | 'hafta'>('bugun');

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => setMode('bugun')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
            mode === 'bugun'
              ? 'bg-[#0F6C5C] text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Bugün
        </button>
        <button
          type="button"
          onClick={() => setMode('hafta')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
            mode === 'hafta'
              ? 'bg-[#0F6C5C] text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Bu hafta
        </button>
      </div>

      {mode === 'bugun' ? (
        <DashboardTodaySummary
          personeller={personeller}
          satinAlmaTalepleri={satinAlmaTalepleri}
          bildirimler={bildirimler}
          onNavigate={onNavigate}
        />
      ) : (
        <DashboardWeekSummary
          personeller={personeller}
          satinAlmaTalepleri={satinAlmaTalepleri}
          kasaHareketleri={kasaHareketleri}
          yoklamalar={yoklamalar}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};

export default DashboardPeriodSummary;
