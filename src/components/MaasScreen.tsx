import React, { useState, useMemo } from 'react';
import { CreditCard, Copy, Check, Search, Clock, AlertTriangle, Wallet } from 'lucide-react';
import { Personel, AylikYoklamaMap, MaaşOdeme } from '../types/erp';
import { CorporateReportLayout } from './CorporateReportLayout';
import { buildPersonelListForMonth, getYoklamaDay, isDayActiveForPersonel, iterateMonthYoklama } from '../lib/yoklamaUtils';
import { resolveStubPersonelFromLegacyId } from '../lib/legacyYoklamaImport';

interface MaasScreenProps {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  maasOdemeleri: MaaşOdeme[];
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
  onOpenMaasOdeme?: () => void;
}

type IbanFilter = 'HEPSI' | 'IBAN_HAZIR' | 'IBAN_EKSIK';

export const MaasScreen: React.FC<MaasScreenProps> = ({
  personeller,
  yoklamalar,
  maasOdemeleri,
  initialMonth,
  initialYear,
  onPeriodChange,
  onSaveHesapTaslaklari,
  onOpenMaasOdeme,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth ?? (new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(initialYear ?? new Date().getFullYear());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ibanFilter, setIbanFilter] = useState<IbanFilter>('HEPSI');
  const [bulkCopied, setBulkCopied] = useState(false);

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  const monthPersoneller = useMemo(
    () => buildPersonelListForMonth(personeller, yoklamalar, selectedYear, selectedMonth, resolveStubPersonelFromLegacyId),
    [personeller, yoklamalar, selectedYear, selectedMonth]
  );

  const handleCopyIban = (personelId: string, iban: string) => {
    navigator.clipboard.writeText(iban);
    setCopiedId(personelId);
    setTimeout(() => {
      setCopiedId(null);
    }, 1200);
  };

  const isDayActiveForEmployee = (emp: Personel, day: number) =>
    isDayActiveForPersonel(emp, selectedYear, selectedMonth, day, yoklamalar[emp.id]);

  // Calculations loop
  let grandBaseHakedis = 0;
  let grandOvertimeHakedis = 0;
  let grandKesinti = 0;
  let grandNetPayment = 0;

  const calculatedSalaries = monthPersoneller
    .filter(p => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return `${p.ad} ${p.soyad}`.toLowerCase().includes(q) ||
        (p.tcNo || '').includes(q) ||
        (p.gorev || '').toLowerCase().includes(q) ||
        (p.departman || '').toLowerCase().includes(q);
    })
    .map(p => {
    const personYoklama = yoklamalar[p.id] || {};
    let hakedisDays = 0;
    let totalOvertimeHours = 0;
    let geldiGun = 0;
    let izinliGun = 0;
    let pazarGun = 0;
    let tatilGun = 0;
    let yokGun = 0;
    let raporluGun = 0;

    iterateMonthYoklama(personYoklama, selectedYear, selectedMonth, (day, dayData) => {
      if (dayData && isDayActiveForEmployee(p, day)) {
        if (dayData.durum === 'Geldi' || dayData.durum === 'İzinli' || dayData.durum === 'Pazar' || dayData.durum === 'Tatil') {
          hakedisDays++;
        }
        if (dayData.durum === 'Geldi') geldiGun++;
        if (dayData.durum === 'İzinli') izinliGun++;
        if (dayData.durum === 'Pazar') pazarGun++;
        if (dayData.durum === 'Tatil') tatilGun++;
        if (dayData.durum === 'Yok') yokGun++;
        if (dayData.durum === 'Raporlu') raporluGun++;
        totalOvertimeHours += dayData.mesaiSaati;
      }
    });

    const baseWage = p.maas;
    const katsayi = hakedisDays / daysInMonth;
    const totalBaseHakedis = katsayi * baseWage;

    const hourlyWage = baseWage / daysInMonth / 7.5;
    const hourlyOvertimeRate = hourlyWage * 1.5;
    const totalOvertimeHakedis = totalOvertimeHours * hourlyOvertimeRate;

    const periodPayment = maasOdemeleri.find((m) => m.personelId === p.id && m.ay === selectedMonth && m.yil === selectedYear);
    const cutAmount = periodPayment?.kesintiToplami || 0;
    const netPayable = (totalBaseHakedis + totalOvertimeHakedis) - cutAmount;
    const hasIban = Boolean(String(p.ibanNo || '').replace(/\s/g, '').length >= 15);

    grandBaseHakedis += totalBaseHakedis;
    grandOvertimeHakedis += totalOvertimeHakedis;
    grandKesinti += cutAmount;
    grandNetPayment += netPayable;

    return {
      personel: p,
      hakedisDays,
      totalOvertimeHours,
      totalBaseHakedis,
      totalOvertimeHakedis,
      cutAmount,
      netPayable,
      geldiGun,
      izinliGun,
      pazarGun,
      tatilGun,
      yokGun,
      raporluGun,
      hourlyWage,
      hourlyOvertimeRate,
      hasIban,
    };
  });

  const filteredSalaries = calculatedSalaries.filter((row) => {
    if (ibanFilter === 'IBAN_HAZIR') return row.hasIban;
    if (ibanFilter === 'IBAN_EKSIK') return !row.hasIban;
    return true;
  });

  const ibanHazirCount = calculatedSalaries.filter((r) => r.hasIban).length;
  const ibanEksikCount = calculatedSalaries.filter((r) => !r.hasIban).length;
  const odenebilirNet = calculatedSalaries
    .filter((r) => r.hasIban)
    .reduce((sum, r) => sum + r.netPayable, 0);

  const handleBulkCopyIbans = () => {
    const lines = calculatedSalaries
      .filter((r) => r.hasIban && r.netPayable > 0)
      .map((r) => {
        const iban = String(r.personel.ibanNo || '').replace(/\s/g, '');
        return `${r.personel.ad} ${r.personel.soyad}\t${iban}\t${r.netPayable.toFixed(2)}`;
      });
    if (lines.length === 0) {
      alert('Kopyalanacak IBAN bulunamadı.');
      return;
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 1600);
  };

  const [showMaasRaporu, setShowMaasRaporu] = useState(false);

  React.useEffect(() => {
    if (typeof initialMonth === 'number') setSelectedMonth(initialMonth);
  }, [initialMonth]);

  React.useEffect(() => {
    if (typeof initialYear === 'number') setSelectedYear(initialYear);
  }, [initialYear]);

  React.useEffect(() => {
    onPeriodChange?.(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear, onPeriodChange]);

  const handleSaveHesapTaslaklari = () => {
    if (!onSaveHesapTaslaklari) return;
    onSaveHesapTaslaklari({
      month: selectedMonth,
      year: selectedYear,
      rows: calculatedSalaries.map((row) => ({
        personel: row.personel,
        brutMaas: row.totalBaseHakedis,
        mesaiUcreti: row.totalOvertimeHakedis,
        toplamHakedis: row.totalBaseHakedis + row.totalOvertimeHakedis,
        kesintiToplami: row.cutAmount,
        netOdeme: row.netPayable,
      })),
    });
  };

  return (
    <div className="flex-grow p-3 sm:p-4 lg:p-6 min-h-[calc(100vh-52px)] overflow-y-auto flex flex-col font-sans gap-4 lg:gap-6 select-none bg-slate-50/50">
      
      {/* Top Total Statistics Odometer Center */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        {[
          { title: "Toplam Hakediş Maaş", value: `₺${grandBaseHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-slate-200 bg-white" },
          { title: "Toplam Mesai Hakediş", value: `₺${grandOvertimeHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-slate-200 bg-slate-50/30 text-slate-800" },
          { title: "Toplam Kesinti / Avans", value: `₺${grandKesinti.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-rose-100 bg-rose-50/30 text-rose-800" },
          { title: "Net Ödenecek Banka Tutarı", value: `₺${grandNetPayment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: "border-emerald-100 bg-emerald-50 text-emerald-800 font-bold" }
        ].map((item, idx) => (
          <div key={idx} className={`p-4 rounded-xl border flex flex-col shadow-sm ${item.color}`}>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              {item.title}
            </span>
            <span className="text-lg font-bold font-display">
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* Ödeme hazırlık şeridi */}
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4 flex flex-col lg:flex-row lg:items-center gap-4 shadow-sm">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Wallet size={18} className="text-emerald-300" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-sm tracking-wide">Banka Ödeme Hazırlığı</h3>
            <p className="text-[11px] text-slate-300 mt-0.5">
              IBAN’ı olan personelin net tutarı kopyalanabilir; eksik IBAN’lar ödeme listesinden ayrılır.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setIbanFilter('IBAN_HAZIR')}
            className={`font-bold px-2.5 py-1.5 rounded-lg transition cursor-pointer border ${
              ibanFilter === 'IBAN_HAZIR'
                ? 'bg-emerald-400 text-slate-900 border-emerald-300'
                : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25'
            }`}
            title="IBAN’ı hazır personel listesini göster"
          >
            Ödenebilir · {ibanHazirCount} kişi · ₺{odenebilirNet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
          </button>
          <button
            type="button"
            onClick={() => {
              setIbanFilter('IBAN_EKSIK');
              setSearchQuery('');
            }}
            className={`font-bold px-2.5 py-1.5 rounded-lg transition cursor-pointer border flex items-center gap-1 ${
              ibanFilter === 'IBAN_EKSIK'
                ? 'bg-amber-400 text-slate-900 border-amber-300'
                : 'bg-amber-500/15 border-amber-400/30 text-amber-100 hover:bg-amber-500/25'
            }`}
            title="Eksik IBAN’ı olan personel listesini göster"
          >
            <AlertTriangle size={12} />
            Eksik IBAN · {ibanEksikCount}
          </button>
          <button
            type="button"
            onClick={handleBulkCopyIbans}
            className="bg-white text-slate-900 hover:bg-emerald-50 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            title="Ad Soyad + IBAN + Net tutarı panoya kopyala"
          >
            {bulkCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            {bulkCopied ? 'Kopyalandı' : 'Toplu IBAN Kopyala'}
          </button>
        </div>
      </div>

      {/* Main List Box */}
      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Header bar controls */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center shrink-0 gap-3">
          <div className="flex items-center space-x-2">
            <CreditCard size={16} className="text-[#f59e0b]" />
            <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
              Hakediş &amp; Otomatik Banka Ödeme Talimatları
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative w-full sm:w-auto">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Personel ara..."
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 w-full sm:w-44"
              />
            </div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              {([
                { id: 'HEPSI' as const, label: 'Tümü' },
                { id: 'IBAN_HAZIR' as const, label: 'IBAN hazır' },
                { id: 'IBAN_EKSIK' as const, label: 'Eksik IBAN' },
              ]).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setIbanFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    ibanFilter === f.id
                      ? f.id === 'IBAN_EKSIK'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowMaasRaporu(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer flex items-center space-x-1"
            >
              <span>📄 Maaş Raporu</span>
            </button>
            {onSaveHesapTaslaklari && (
              <button
                type="button"
                onClick={handleSaveHesapTaslaklari}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
                title="Maaş hesaplarını Maaş Ödeme taslağına kaydet"
              >
                Maaş Hesabını Kaydet
              </button>
            )}
            <span className="font-semibold text-slate-600">Dönem:</span>
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="text-xs font-semibold border border-slate-200 rounded-lg p-1 px-2 bg-white cursor-pointer"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{m}. Ay</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="text-xs font-semibold border border-slate-200 rounded-lg p-1 px-2 bg-white cursor-pointer"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {onOpenMaasOdeme && (
              <button
                type="button"
                onClick={onOpenMaasOdeme}
                className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
              >
                Maaş Ödeme Ekranına Git
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list items panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredSalaries.length === 0 && (
            <div className="text-center py-12 text-xs text-slate-400 font-semibold">
              Bu filtreye uygun personel bulunamadı.
            </div>
          )}
          {filteredSalaries.map(({ personel, hakedisDays, totalOvertimeHours, totalBaseHakedis, totalOvertimeHakedis, cutAmount, netPayable, geldiGun, izinliGun, pazarGun, tatilGun, yokGun, raporluGun, hourlyWage, hourlyOvertimeRate, hasIban }) => {
            return (
              <div 
                key={personel.id}
                className={`border rounded-xl p-4 flex flex-col gap-4 transition duration-200 bg-white hover:border-slate-200 ${
                  hasIban ? 'border-slate-150' : 'border-amber-200/80 bg-amber-50/20'
                }`}
              >
                
                {/* Top row: Avatar, Identity, Stats, Payment */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  {/* Personel Avatar and Identity */}
                  <div className="flex items-center gap-3 w-full md:w-64 md:shrink-0 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ring-1 ${
                      'bg-slate-100 text-slate-500 ring-slate-200'
                    }`}>
                      {personel.ad[0]}{personel.soyad[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="font-bold text-slate-800 text-xs">
                          {personel.ad} {personel.soyad}
                        </h5>
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                          hasIban
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          {hasIban ? 'IBAN hazır' : 'IBAN eksik'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {personel.gorev} · Base: <span className="font-bold">₺{personel.maas.toLocaleString('tr-TR')}</span>
                      </p>
                    </div>
                  </div>

                  {/* Days and Overtime analysis stats */}
                  <div className="flex flex-wrap items-center gap-4 md:gap-6 md:shrink-0">
                    <div className="text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Hakediş Gün</span>
                      <span className="text-xs font-semibold text-slate-800">{hakedisDays} Gün</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Ört. Mesai</span>
                      <span className="text-xs font-semibold text-slate-800">{totalOvertimeHours} Saat</span>
                    </div>
                  </div>

                  {/* Hakediş breakdown components */}
                  <div className="flex flex-wrap items-center gap-4 md:gap-6 text-[11px] font-medium text-slate-500 md:shrink-0">
                    <div>
                      <span>Maaş:</span> <span className="font-bold text-slate-800">₺{totalBaseHakedis.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div>
                      <span>Mesai:</span> <span className="font-bold text-slate-800">₺{totalOvertimeHakedis.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                    </div>
                    
                    <div className="flex items-center space-x-1.5">
                      <span>Kesinti/Avans:</span>
                      <span className="w-20 text-center bg-slate-50 border border-slate-200 font-bold font-mono rounded py-0.5 text-rose-600 text-[10px]">
                        ₺{cutAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Banking details */}
                  <div className="flex items-center space-x-2 md:border-l md:pl-4 border-slate-100 md:shrink-0">
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Banka / IBAN</p>
                      <p className={`text-[10px] font-semibold font-mono truncate w-36 ${hasIban ? 'text-slate-700' : 'text-amber-700'}`}>
                        {personel.ibanNo ? personel.ibanNo : "IBAN GİRİLMEMİŞ"}
                      </p>
                    </div>
                    
                    {personel.ibanNo && (
                      <button
                        onClick={() => handleCopyIban(personel.id, personel.ibanNo)}
                        className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        title="IBAN Kopyala"
                      >
                        {copiedId === personel.id ? (
                          <Check size={12} className="text-emerald-600 stroke-[3]" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    )}
                  </div>

                  {/* NET PAYABLE AMOUNT & TOGGLE STATUS */}
                  <div className="flex items-center gap-3 md:gap-4 md:shrink-0 justify-between md:justify-start w-full md:w-auto">
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Ödenecek Net Tutar</span>
                      <span className="text-xs font-bold text-emerald-600 font-mono">
                        ₺{netPayable.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {onOpenMaasOdeme && (
                      <button
                        type="button"
                        onClick={onOpenMaasOdeme}
                        className="px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase cursor-pointer transition active:scale-95 shadow-sm border bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
                      >
                        💳 Ödemeyi Maaş Ödeme'den Yap
                      </button>
                    )}
                  </div>
                </div>

                {/* Mesai Detayı & Gün Özeti */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={12} className="text-amber-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mesai Detayı & Gün Özeti</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-[10px]">
                    <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                      <span className="text-slate-400 block">Geldi</span>
                      <span className="font-bold text-emerald-700">{geldiGun} gün</span>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                      <span className="text-slate-400 block">İzinli</span>
                      <span className="font-bold text-slate-800">{izinliGun} gün</span>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                      <span className="text-slate-400 block">Pazar</span>
                      <span className="font-bold text-amber-700">{pazarGun} gün</span>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                      <span className="text-slate-400 block">Tatil</span>
                      <span className="font-bold text-indigo-700">{tatilGun} gün</span>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                      <span className="text-slate-400 block">Yok</span>
                      <span className="font-bold text-rose-700">{yokGun} gün</span>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                      <span className="text-slate-400 block">Raporlu</span>
                      <span className="font-bold text-violet-700">{raporluGun} gün</span>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 text-center">
                      <span className="text-slate-600 block">Toplam Mesai</span>
                      <span className="font-bold text-slate-800">{totalOvertimeHours} saat</span>
                    </div>
                  </div>
                  <div className="mt-2 text-[9px] text-slate-400 flex gap-4">
                    <span>Saatlik Ücret: <strong className="text-slate-600">₺{hourlyWage.toFixed(2)}</strong></span>
                    <span>Mesai Katsayısı: <strong className="text-slate-600">x1.5</strong></span>
                    <span>Mesai Saat Ücreti: <strong className="text-slate-600">₺{hourlyOvertimeRate.toFixed(2)}</strong></span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* PDF / PRINT MODAL */}
      {showMaasRaporu && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 flex items-start justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-7xl shadow-2xl flex flex-col overflow-hidden my-4">
            
            {/* Modal Actions Header */}
            <div className="bg-slate-900 text-white p-4 flex flex-wrap justify-between items-center gap-3 px-6 shrink-0 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl">💰</span>
                <h3 className="font-display font-bold text-sm">
                  KİBRİTÇİ İNŞAAT ŞANTİYESİ AYI MAAŞ RAPORU
                </h3>
              </div>
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.querySelector('.printable-document');
                    const html = el
                      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Maaş Raporu</title></head><body>${el.innerHTML}</body></html>`
                      : undefined;
                    void import('../lib/reportEmail').then(({ openReportEmailComposer }) => {
                      openReportEmailComposer({
                        subject: 'Kibritçi — Maaş Hesaplama Raporu',
                        body: 'Maaş hesaplama raporu bilginize sunulmuştur.',
                        html,
                        fileName: 'Kibritci_Maas_Raporu.html',
                      });
                    });
                  }}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  📧 E-posta ile Gönder
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  🖨️ Yazdır / PDF Olarak Kaydet (Ctrl+P)
                </button>
                <button
                  onClick={() => {
                    const el = document.querySelector('.printable-document');
                    if (el) {
                      const heading = "Kibritci_Insaat_Santiye_Maas_Hakedis_Raporu";
                      const blob = new Blob([`
                        <html>
                          <head>
                            <meta charset="utf-8">
                            <title>Şantiye Maaş Hakediş Raporu</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                            <style>
                              @media print { .no-print { display: none; } }
                            </style>
                          </head>
                          <body class="p-8 bg-white text-slate-900 font-sans">
                            ${el.innerHTML}
                          </body>
                        </html>
                      `], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${heading}_${selectedMonth}_${selectedYear}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  💾 Masaüstüne HTML Rapor Dosyası Kaydet
                </button>
                <button
                  onClick={() => setShowMaasRaporu(false)}
                  className="bg-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div className="flex-1 overflow-auto bg-white p-4 sm:p-8 lg:p-12 text-slate-900 printable-document font-sans">
              <CorporateReportLayout
                orientation="landscape"
                docCode={`KOD: KBR-MAAS-2026-${selectedMonth}`}
              >
              <div className="mb-4 pb-3 border-b border-slate-200">
                <p className="text-xs text-slate-500 font-semibold tracking-wide uppercase">MUHASEBE VE FİNANSAL HAKEDİŞ DAİRE BAŞKANLIĞI</p>
                <p className="text-xs text-slate-600 mt-1">Hakediş Dönemi: <strong className="text-slate-900 font-bold">{selectedMonth}. Ay / {selectedYear}</strong></p>
              </div>

              {/* Document Subtitle */}
              <div className="text-center mb-6">
                <h2 className="text-sm font-bold text-slate-900 tracking-wider uppercase border-y border-slate-205 py-2.5 bg-slate-50">
                  KİBRİTÇİ İNŞAAT ŞANTİYESİ {["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][selectedMonth - 1]?.toUpperCase()} AYI MAAŞ RAPORU
                </h2>
              </div>

              {/* Data Table */}
              <div className="border border-slate-355 rounded-md overflow-hidden mb-8 font-sans">
                <table className="w-full text-[9px] border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                      <th className="p-2 text-left border-r border-slate-300">TC Kimlik No</th>
                      <th className="p-2 text-left border-r border-slate-300">Personel Adı Soyadı</th>
                      <th className="p-2 text-left border-r border-slate-300">Görevi</th>
                      <th className="p-2 text-center border-r border-slate-300">Çalışma Gün</th>
                      <th className="p-2 text-center border-r border-slate-300">Fazla Mesai (Saat)</th>
                      <th className="p-2 text-right border-r border-slate-300 text-[#1E4E78]">Günden Doğan Kazanç (₺)</th>
                      <th className="p-2 text-right border-r border-slate-300 text-slate-800">Mesayiden Doğan Kazanç (₺)</th>
                      <th className="p-2 text-right border-r border-slate-300 text-rose-800">Kesinti / Avans / Borç (₺)</th>
                      <th className="p-2 text-right text-emerald-800 font-bold bg-slate-55 w-28">Hesaplanan Net (₺)</th>
                      <th className="p-2 text-right text-emerald-800 font-bold bg-emerald-50 w-28">Yatırılan (₺)</th>
                      <th className="p-2 text-right text-rose-800 font-bold bg-rose-50 w-28">Eksik Tutar (₺)</th>
                      <th className="p-2 text-left border-r border-slate-300">Banka Bilgisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedSalaries.map(({ personel, hakedisDays, totalOvertimeHours, totalBaseHakedis, totalOvertimeHakedis, cutAmount, netPayable, geldiGun, izinliGun, pazarGun, tatilGun, yokGun, raporluGun }) => {
                      const personYoklama = yoklamalar[personel.id] || {};
                      return (
                        <React.Fragment key={personel.id}>
                          <tr className="border-b border-slate-100 hover:bg-slate-50 font-medium">
                            <td className="p-2 border-r border-slate-300 font-mono text-slate-500">{personel.tcNo}</td>
                            <td className="p-2 border-r border-slate-300 font-bold text-slate-850">{personel.ad} {personel.soyad}</td>
                            <td className="p-2 border-r border-slate-300 uppercase text-[8px] font-bold text-slate-600">{personel.gorev}</td>
                            <td className="p-2 text-center border-r border-slate-300">{hakedisDays} Gün</td>
                            <td className="p-2 text-center border-r border-slate-300 font-mono text-slate-800">{totalOvertimeHours} st</td>
                            <td className="p-2 text-right border-r border-slate-300 font-mono">₺{totalBaseHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right border-r border-slate-300 text-slate-800">₺{totalOvertimeHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right border-r border-slate-300 text-rose-700 font-mono">-₺{cutAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right text-emerald-755 font-bold bg-emerald-50/40 font-mono">
                              ₺{netPayable.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </td>
                            {(() => {
                              const periodPayment = maasOdemeleri.find((m) => m.personelId === personel.id && m.ay === selectedMonth && m.yil === selectedYear);
                              const yatirilan = periodPayment?.yatirilanTutar ?? netPayable;
                              const eksik = netPayable - yatirilan;
                              return (
                                <>
                                  <td className="p-2 text-right text-emerald-700 font-bold bg-emerald-100/40 font-mono">
                                    ₺{yatirilan.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2 text-right text-rose-700 font-bold bg-rose-100/40 font-mono">
                                    ₺{eksik.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                  </td>
                                </>
                              );
                            })()}
                            <td className="p-2 border-r border-slate-300 text-slate-500 text-[8px] truncate max-w-[120px]">{personel.bankaAdi} · {personel.ibanNo || "IBAN_YOK"}</td>
                          </tr>
                          {/* Gün Detayı + Mesai Detayı */}
                          <tr className="border-b border-slate-300 bg-slate-50/40 text-[7px] text-slate-500">
                            <td colSpan={10} className="p-1 px-3">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="font-bold text-[8px] uppercase tracking-wider text-slate-400">GÜN DETAYI:</span>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayData = getYoklamaDay(personYoklama, selectedYear, selectedMonth, day) || { durum: 'Girilmedi', mesaiSaati: 0 };
                                    let letter = "•";
                                    let color = "text-slate-450 bg-slate-100";
                                    if (dayData.durum === 'Geldi') { letter = "G"; color = "text-emerald-700 bg-emerald-100/50 font-bold"; }
                                    else if (dayData.durum === 'Yok') { letter = "Y"; color = "text-rose-700 bg-rose-100/50 font-bold"; }
                                    else if (dayData.durum === 'İzinli') { letter = "İ"; color = "text-slate-800 bg-slate-100/50"; }
                                    else if (dayData.durum === 'Raporlu') { letter = "R"; color = "text-violet-700 bg-violet-100/50"; }
                                    else if (dayData.durum === 'Pazar') { letter = "P"; color = "text-amber-700 bg-amber-100/50 font-bold"; }
                                    else if (dayData.durum === 'Tatil') { letter = "T"; color = "text-indigo-700 bg-indigo-100/50"; }
                                    
                                    const mesai = dayData.mesaiSaati > 0 ? ` (+${dayData.mesaiSaati})` : "";
                                    
                                    return (
                                      <span 
                                        key={day} 
                                        className={`px-1 py-0.5 rounded border border-slate-200/50 flex items-center justify-center font-mono ${color}`}
                                      >
                                        {day}:{letter}{mesai}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center space-x-4 text-[8px]">
                                <span><strong>Geldi:</strong> {geldiGun} gün</span>
                                <span><strong>İzinli:</strong> {izinliGun} gün</span>
                                <span><strong>Pazar:</strong> {pazarGun} gün</span>
                                <span><strong>Tatil:</strong> {tatilGun} gün</span>
                                <span><strong>Yok:</strong> {yokGun} gün</span>
                                <span><strong>Raporlu:</strong> {raporluGun} gün</span>
                                <span className="text-slate-800"><strong>Toplam Mesai:</strong> {totalOvertimeHours} saat</span>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    {/* Grand Total Row */}
                    <tr className="bg-slate-100 font-extrabold border-t-2 border-slate-900 text-slate-800">
                      <td colSpan={3} className="p-2.5 text-left uppercase text-[10px]">TOPLAM ÖDEME PORTFÖYÜ</td>
                      <td colSpan={2} className="p-2.5 text-center"></td>
                      <td className="p-2.5 text-right font-mono text-[#1E4E78]">₺{grandBaseHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2.5 text-right font-mono text-slate-800">₺{grandOvertimeHakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2.5 text-right text-rose-800 font-mono">-₺{grandKesinti.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2.5"></td>
                      <td className="p-2.5 text-right text-emerald-800 font-display font-mono text-[10px] bg-emerald-100 border-l border-emerald-250">
                        ₺{grandNetPayment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Corporate Sign-off Area */}
              <div className="mt-12 text-xs">
                <div className="grid grid-cols-4 gap-4 text-center">
                  
                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 flex flex-col justify-between h-28">
                    <span className="font-extrabold text-slate-800 tracking-wider uppercase text-[10px] block">MUHASEBE</span>
                    <div className="h-10 border-b border-dashed border-slate-350 w-24 mx-auto my-2"></div>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 flex flex-col justify-between h-28">
                    <span className="font-extrabold text-slate-800 tracking-wider uppercase text-[10px] block">İDARİ İŞLER</span>
                    <div className="h-10 border-b border-dashed border-slate-350 w-24 mx-auto my-2"></div>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 flex flex-col justify-between h-28">
                    <span className="font-extrabold text-slate-800 tracking-wider uppercase text-[10px] block">ŞANTİYE ŞEFİ</span>
                    <div className="h-10 border-b border-dashed border-slate-350 w-24 mx-auto my-2"></div>
                  </div>

                  <div className="border border-slate-200 p-3 rounded-xl bg-slate-50 flex flex-col justify-between h-28">
                    <span className="font-extrabold text-slate-800 tracking-wider uppercase text-[10px] block">PROJE MÜDÜRÜ</span>
                    <div className="h-10 border-b border-dashed border-slate-350 w-24 mx-auto my-2"></div>
                  </div>

                </div>
              </div>

              </CorporateReportLayout>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default MaasScreen;
