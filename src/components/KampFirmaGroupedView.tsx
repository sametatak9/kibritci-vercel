import React, { useState, useMemo } from 'react';
import { 
  Building2, Users, Search, Download, Printer, ChevronDown, ChevronUp, 
  DoorOpen, Layers, Filter, CheckCircle2, FileText, Sparkles 
} from 'lucide-react';
import { KampKaydi, KampOdasi, Personel } from '../types/erp';
import { firmaKrokiColor } from '../lib/kampKrokiUtils';
import { openHtmlReportWindow } from '../lib/reportEmail';
import {
  groupKampResidentsByFirma,
  generateFirmaPersonelOdaPdfHtml,
  exportFirmaPersonelOdaExcel,
  FirmaPersonelOdaGroup,
} from '../lib/kampFirmaPersonelExport';

interface KampFirmaGroupedViewProps {
  kampKayitlari: KampKaydi[];
  personeller: Personel[];
  kampOdalari: KampOdasi[];
  initialFirmaFilter?: string;
  onSelectOda?: (odaId: string) => void;
}

export const KampFirmaGroupedView: React.FC<KampFirmaGroupedViewProps> = ({
  kampKayitlari,
  personeller,
  kampOdalari,
  initialFirmaFilter = '',
  onSelectOda,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFirma, setSelectedFirma] = useState<string>(initialFirmaFilter);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Group raw data by firm
  const rawGroups = useMemo(() => {
    return groupKampResidentsByFirma(kampKayitlari, personeller, kampOdalari);
  }, [kampKayitlari, personeller, kampOdalari]);

  // Keep track of accordion open/close state
  const [openFirms, setOpenFirms] = useState<Record<string, boolean>>({});

  // Expand / collapse all toggle
  const toggleAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    rawGroups.forEach((g) => {
      next[g.firmaAdi] = expand;
    });
    setOpenFirms(next);
  };

  // Filter groups by search & firm selection
  const filteredGroups = useMemo(() => {
    let result = rawGroups;

    if (selectedFirma) {
      result = result.filter((g) => g.firmaAdi === selectedFirma);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLocaleLowerCase('tr-TR').trim();
      result = result
        .map((g) => {
          const matchingPersonel = g.personeller.filter((p) => {
            const name = p.personelIsim.toLocaleLowerCase('tr-TR');
            const tc = p.tcNo.toLowerCase();
            const firma = p.firmaAdi.toLocaleLowerCase('tr-TR');
            const room = `oda ${p.odaNo}`.toLocaleLowerCase('tr-TR');
            const block = p.yerleskeAdi.toLocaleLowerCase('tr-TR');
            return (
              name.includes(q) ||
              tc.includes(q) ||
              firma.includes(q) ||
              room.includes(q) ||
              block.includes(q)
            );
          });
          return {
            ...g,
            personeller: matchingPersonel,
            toplamPersonel: matchingPersonel.length,
            odaSayisi: new Set(matchingPersonel.map((x) => x.odaId).filter(Boolean)).size,
          };
        })
        .filter((g) => g.personeller.length > 0);
    }

    return result;
  }, [rawGroups, selectedFirma, searchTerm]);

  // General statistics
  const stats = useMemo(() => {
    const totalPeople = rawGroups.reduce((acc, g) => acc + g.toplamPersonel, 0);
    const totalFirms = rawGroups.length;
    const totalRooms = rawGroups.reduce((acc, g) => acc + g.odaSayisi, 0);
    return { totalPeople, totalFirms, totalRooms };
  }, [rawGroups]);

  // Export PDF / Print
  const handlePrintPdf = () => {
    const html = generateFirmaPersonelOdaPdfHtml(rawGroups, selectedFirma || undefined);
    const win = openHtmlReportWindow(html, 'Firma Bazlı Kamp Raporu');
    if (!win) {
      alert('Yazdırma penceresi açılamadı. Tarayıcı pop-up engellerini kontrol edin.');
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      await exportFirmaPersonelOdaExcel(
        selectedFirma ? rawGroups.filter((g) => g.firmaAdi === selectedFirma) : rawGroups
      );
    } catch (err: any) {
      alert(`Excel indirilirken hata oluştu: ${err?.message || err}`);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-hidden bg-slate-50/50 p-3 sm:p-4 rounded-2xl border border-slate-200">
      {/* Header Banner */}
      <div className="shrink-0 rounded-2xl border border-slate-800/80 overflow-hidden bg-[linear-gradient(135deg,#0F172A_0%,#1E293B_50%,#0F766E_100%)] text-white shadow-md">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 shadow-inner">
              <Building2 size={22} className="text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-teal-300 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles size={12} />
                Kamp Yönetimi · Detaylı Raporlama
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-0.5 text-white">
                Firma Bazlı Personel ve Oda Dağılımı
              </h2>
              <p className="text-[12px] text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Hangi firmada çalışan personellerin hangi oda, kat ve yerleşkede (blokta) kaldığını detaylarıyla inceleyin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="py-2 px-3.5 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition shadow-sm active:scale-95 flex items-center space-x-1.5"
            >
              <Printer size={15} />
              <span>🖨️ Yazdır / PDF</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={exportingExcel}
              className="py-2 px-3.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white cursor-pointer transition shadow-sm active:scale-95 flex items-center space-x-1.5"
            >
              <Download size={15} />
              <span>{exportingExcel ? 'Hazırlanıyor...' : '📊 Excel İndir'}</span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="px-4 sm:px-5 py-2.5 bg-black/20 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <span className="bg-white/10 px-3 py-1 rounded-lg border border-white/10 font-medium">
              <strong className="text-emerald-300 tabular-nums">{stats.totalPeople}</strong> Kampta Kalan Personel
            </span>
            <span className="bg-white/10 px-3 py-1 rounded-lg border border-white/10 font-medium">
              <strong className="text-amber-300 tabular-nums">{stats.totalFirms}</strong> Firma
            </span>
            <span className="bg-white/10 px-3 py-1 rounded-lg border border-white/10 font-medium">
              <strong className="text-cyan-300 tabular-nums">{stats.totalRooms}</strong> Yerleşik Oda
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => toggleAll(true)}
              className="text-[10px] font-bold text-slate-300 hover:text-white underline cursor-pointer"
            >
              Tümünü Genişlet
            </button>
            <span className="text-slate-500">|</span>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              className="text-[10px] font-bold text-slate-300 hover:text-white underline cursor-pointer"
            >
              Tümünü Kapat
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Personel Adı, TC, Firma veya Oda No Ara (ör. ODA 4, EMA MERMER)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 placeholder-slate-400 bg-slate-50/50 focus:bg-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              ×
            </button>
          )}
        </div>

        {/* Firma Quick Filter Select */}
        <div className="flex items-center space-x-2 shrink-0">
          <Filter size={14} className="text-slate-500" />
          <select
            value={selectedFirma}
            onChange={(e) => setSelectedFirma(e.target.value)}
            className="py-2 px-3 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">-- Tüm Firmalar ({rawGroups.length}) --</option>
            {rawGroups.map((g) => (
              <option key={g.firmaAdi} value={g.firmaAdi}>
                {g.firmaAdi} ({g.toplamPersonel} Kişi)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Firma Pills Row */}
      {rawGroups.length > 0 && (
        <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedFirma('')}
            className={`text-[10px] font-bold px-3 py-1 rounded-full transition cursor-pointer shrink-0 ${
              !selectedFirma
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Tüm Firmalar ({stats.totalPeople})
          </button>
          {rawGroups.map((g) => {
            const color = firmaKrokiColor(g.firmaAdi);
            const isSelected = selectedFirma === g.firmaAdi;
            return (
              <button
                key={g.firmaAdi}
                type="button"
                onClick={() => setSelectedFirma(isSelected ? '' : g.firmaAdi)}
                className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full transition cursor-pointer border shrink-0 ${
                  isSelected ? 'ring-2 ring-teal-600 font-extrabold shadow-sm' : 'opacity-85 hover:opacity-100'
                }`}
                style={{
                  background: isSelected ? color.bg : color.soft,
                  color: isSelected ? '#ffffff' : color.text,
                  borderColor: `${color.bg}40`,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: isSelected ? '#ffffff' : color.bg }}
                />
                {g.firmaAdi}
                <span className="tabular-nums font-mono opacity-90">({g.toplamPersonel})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Accordion Group List */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
        {filteredGroups.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <Building2 size={36} className="text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-slate-700 text-sm">Eşleşen Firma veya Personel Bulunamadı</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Arama kriterlerinizi değiştirin veya filtreyi kaldırarak tüm aktif kayıtları listeleyin.
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isOpen = openFirms[group.firmaAdi] !== false; // default open
            const color = firmaKrokiColor(group.firmaAdi);

            return (
              <div
                key={group.firmaAdi}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition hover:shadow-md"
              >
                {/* Firma Card Header */}
                <div
                  onClick={() =>
                    setOpenFirms((prev) => ({ ...prev, [group.firmaAdi]: !isOpen }))
                  }
                  className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer border-b border-slate-100 select-none hover:bg-slate-100/70 transition"
                >
                  <div className="flex items-center space-x-3">
                    <span
                      className="w-3.5 h-3.5 rounded-md shrink-0 shadow-sm"
                      style={{ background: color.bg }}
                    />
                    <div>
                      <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                        {group.firmaAdi}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                        Kampta kalan personel isimleri ve konakladıkları oda dağılımı
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                      👥 {group.toplamPersonel} Personel
                    </span>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                      🔑 {group.odaSayisi} Oda
                    </span>
                    <div className="text-slate-400 pl-1">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Table */}
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-black uppercase text-slate-600 tracking-wider">
                          <th className="p-2.5 text-center w-10">#</th>
                          <th className="p-2.5">PERSONEL AD SOYAD</th>
                          <th className="p-2.5 w-32">TC KİMLİK / TELEFON</th>
                          <th className="p-2.5">YERLEŞKE / BLOK</th>
                          <th className="p-2.5">KAT</th>
                          <th className="p-2.5 text-center w-24">ODA NO</th>
                          <th className="p-2.5 text-center w-28">GİRİŞ TARİHİ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {group.personeller.map((p, idx) => (
                          <tr key={p.kayitId} className="hover:bg-teal-50/40 transition">
                            <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="p-2.5">
                              <span className="font-extrabold text-slate-900 block text-xs">
                                {p.personelIsim}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-slate-500">
                              <div>{p.tcNo}</div>
                              {p.telefon !== '—' && (
                                <div className="text-[9px] text-slate-400">{p.telefon}</div>
                              )}
                            </td>
                            <td className="p-2.5">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                <Building2 size={13} className="text-slate-400" />
                                {p.yerleskeAdi}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Layers size={13} className="text-slate-400" />
                                {p.katAdi}
                              </span>
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => p.odaId && onSelectOda?.(p.odaId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-black text-xs border border-teal-200 transition cursor-pointer"
                                title="Odaya git"
                              >
                                <DoorOpen size={13} />
                                ODA {p.odaNo}
                              </button>
                            </td>
                            <td className="p-2.5 text-center font-mono text-[11px] text-slate-500">
                              {p.girisTarihi}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
