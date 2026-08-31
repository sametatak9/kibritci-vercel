import React, { useState } from 'react';
import { BookOpen, CalendarCheck2, Images, ClipboardList } from 'lucide-react';
import { ProgramliFaaliyetScreen } from './ProgramliFaaliyetScreen';
import { SahaKolajScreen } from './SahaKolajScreen';
import { ProgramliFaaliyet, SahaFaaliyeti } from '../types/erp';

interface RaporlamaProgramlamaScreenProps {
  programliFaaliyetler: ProgramliFaaliyet[];
  setProgramliFaaliyetler: (
    updater: ProgramliFaaliyet[] | ((prev: ProgramliFaaliyet[]) => ProgramliFaaliyet[])
  ) => void;
  sahaFaaliyetleri: SahaFaaliyeti[];
  currentUser: any;
}

export const RaporlamaProgramlamaScreen: React.FC<RaporlamaProgramlamaScreenProps> = ({
  programliFaaliyetler,
  setProgramliFaaliyetler,
  sahaFaaliyetleri,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'program' | 'dergi'>('program');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-amber-500" />
            Raporlama ve Programlama
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            İş programları planlaması ve detaylı saha kolaj raporları
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-700/50 pb-4">
        <button
          onClick={() => setActiveTab('program')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'program'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <CalendarCheck2 className="w-4 h-4" />
          İş Programı Oluştur
        </button>

        <button
          onClick={() => setActiveTab('dergi')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'dergi'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Images className="w-4 h-4" />
          Aylık/Günlük Dergi Arşivi
        </button>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm min-h-[500px]">
        {activeTab === 'program' && (
          <ProgramliFaaliyetScreen
            programliFaaliyetler={programliFaaliyetler}
            setProgramliFaaliyetler={setProgramliFaaliyetler}
            currentUser={currentUser}
          />
        )}
        
        {activeTab === 'dergi' && (
          <SahaKolajScreen 
            currentUser={currentUser} 
            sahaFaaliyetleri={sahaFaaliyetleri}
            programliFaaliyetler={programliFaaliyetler}
          />
        )}
      </div>
    </div>
  );
};
