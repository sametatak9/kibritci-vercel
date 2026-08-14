import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import type { AylikYoklamaMap, Personel } from '../types/erp';
import { formatDateLabelTr, normalizeDateKey } from '../lib/dateKeyUtils';
import { displayPersonelGorev } from '../lib/guvenlikHelpers';
import {
  collectAralikYoklamaSahaHavuz,
  collectAralikYoklamaSahaPersonel,
  exportAralikYoklamaExcel,
  MAX_ARALIK_YOKLAMA_GUN,
} from '../lib/aktifPersonelListeExcel';
import {
  PERSONEL_GOREV_GRUP_ORDER,
  personelGorevGrupChipClass,
  personelGorevGrupLabel,
  resolvePersonelGorevGrubu,
  type PersonelGorevGrup,
} from '../lib/personelGorevGrupUtils';

const SAHA_GRUPLAR = PERSONEL_GOREV_GRUP_ORDER.filter((g) => g !== 'IDARI');

function personelAd(p: Personel): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

function matchesQuery(p: Personel, raw: string): boolean {
  const q = raw.trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  const hay = `${personelAd(p)} ${p.tcNo || ''} ${displayPersonelGorev(p)} ${personelGorevGrupLabel(
    resolvePersonelGorevGrubu(p)
  )}`.toLocaleLowerCase('tr-TR');
  return hay.includes(q);
}

export const AralikYoklamaExcelModal: React.FC<{
  open: boolean;
  onClose: () => void;
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  startDate: string;
  endDate: string;
}> = ({ open, onClose, personeller, yoklamalar, startDate, endDate }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [listQuery, setListQuery] = useState('');
  const [addQuery, setAddQuery] = useState('');
  const [grupFilter, setGrupFilter] = useState<PersonelGorevGrup | 'ALL'>('ALL');
  const [exporting, setExporting] = useState(false);

  const from = normalizeDateKey(startDate);
  const to = normalizeDateKey(endDate);
  const start = from && to && from <= to ? from : to;
  const end = from && to && from <= to ? to : from;
  const daySpan =
    start && end
      ? Math.floor(
          (Date.UTC(
            Number(end.slice(0, 4)),
            Number(end.slice(5, 7)) - 1,
            Number(end.slice(8, 10))
          ) -
            Date.UTC(
              Number(start.slice(0, 4)),
              Number(start.slice(5, 7)) - 1,
              Number(start.slice(8, 10))
            )) /
            86400000
        ) + 1
      : 0;
  const rangeTooLong = daySpan > MAX_ARALIK_YOKLAMA_GUN;
  const periodLabel =
    start && end
      ? start === end
        ? formatDateLabelTr(start)
        : `${formatDateLabelTr(start)} — ${formatDateLabelTr(end)}`
      : '';

  const defaultPeople = useMemo(
    () => (start && end ? collectAralikYoklamaSahaPersonel(personeller, start, end) : []),
    [personeller, start, end]
  );
  const defaultIdSet = useMemo(() => new Set(defaultPeople.map((p) => p.id)), [defaultPeople]);
  const havuz = useMemo(() => collectAralikYoklamaSahaHavuz(personeller), [personeller]);
  const byId = useMemo(() => new Map(havuz.map((p) => [p.id, p])), [havuz]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(collectAralikYoklamaSahaPersonel(personeller, start, end).map((p) => p.id));
    setListQuery('');
    setAddQuery('');
    setGrupFilter('ALL');
    setExporting(false);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPeople = useMemo(
    () => selectedIds.map((id) => byId.get(id)).filter((p): p is Personel => !!p),
    [selectedIds, byId]
  );

  const addedCount = selectedPeople.filter((p) => !defaultIdSet.has(p.id)).length;
  const removedCount = defaultPeople.filter((p) => !selectedSet.has(p.id)).length;

  const grupCounts = useMemo(() => {
    const map = new Map<PersonelGorevGrup, number>();
    for (const p of selectedPeople) {
      const g = resolvePersonelGorevGrubu(p);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return map;
  }, [selectedPeople]);

  const grouped = useMemo(() => {
    const q = listQuery;
    const visible = selectedPeople.filter((p) => {
      if (!matchesQuery(p, q)) return false;
      if (grupFilter !== 'ALL' && resolvePersonelGorevGrubu(p) !== grupFilter) return false;
      return true;
    });
    return SAHA_GRUPLAR.map((grup) => {
      const people = visible
        .filter((p) => resolvePersonelGorevGrubu(p) === grup)
        .slice()
        .sort((a, b) => personelAd(a).localeCompare(personelAd(b), 'tr', { sensitivity: 'base' }));
      return { grup, label: personelGorevGrupLabel(grup), people };
    }).filter((g) => g.people.length > 0);
  }, [selectedPeople, listQuery, grupFilter]);

  const addHits = useMemo(() => {
    const q = addQuery.trim();
    if (q.length < 2) return [];
    return havuz
      .filter((p) => !selectedSet.has(p.id) && matchesQuery(p, q))
      .slice(0, 40);
  }, [addQuery, havuz, selectedSet]);

  const addPerson = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const removePerson = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };
  const removeGrup = (grup: PersonelGorevGrup) => {
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const p = byId.get(id);
        return !p || resolvePersonelGorevGrubu(p) !== grup;
      })
    );
  };
  const fillGrup = (grup: PersonelGorevGrup) => {
    const extra = defaultPeople
      .filter((p) => resolvePersonelGorevGrubu(p) === grup)
      .map((p) => p.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      extra.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleExport = async () => {
    if (rangeTooLong) {
      alert(`En fazla ${MAX_ARALIK_YOKLAMA_GUN} günlük yoklama dökülebilir. Aralığı kısaltın.`);
      return;
    }
    if (selectedIds.length === 0) {
      alert('Excel için en az bir saha personeli bırakın veya ekleyin.');
      return;
    }
    setExporting(true);
    try {
      const count = await exportAralikYoklamaExcel({
        personeller,
        yoklamalar,
        startDate: start,
        endDate: end,
        selectedIds,
      });
      alert(`${count} saha personeli için ${periodLabel} yoklaması Excel olarak indirildi.`);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/80 flex items-start justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden my-4 max-h-[92vh]">
        <div className="bg-[#0f2744] text-[#f4ead5] px-5 py-4 flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#c4a35a]">
              <Calendar size={13} />
              Aralık yoklama Excel
            </div>
            <h3 className="font-display font-bold text-base mt-0.5">{periodLabel || 'Tarih aralığı'}</h3>
            <p className="text-[11px] text-white/70 mt-1 max-w-2xl leading-relaxed">
              Saha kadrosunun bu aralıktaki yoklaması görev / nitelik grubuna, T.C. ve göreve göre
              dökülür. İdari personelde yoklama yoktur; rapora girmez. İstemediğiniz kişiyi çıkarın,
              eksik kalanı sağdan ekleyin.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-[#f4ead5] cursor-pointer"
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2 text-[11px] shrink-0">
          <span className="font-black text-slate-800">{selectedPeople.length} kişi seçili</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">Varsayılan kadro {defaultPeople.length}</span>
          {removedCount > 0 && (
            <span className="text-rose-700 font-bold">· {removedCount} çıkarıldı</span>
          )}
          {addedCount > 0 && (
            <span className="text-emerald-700 font-bold">· {addedCount} eklendi</span>
          )}
          {rangeTooLong && (
            <span className="text-rose-700 font-bold">
              · {daySpan} gün — en fazla {MAX_ARALIK_YOKLAMA_GUN} gün seçin
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedIds(defaultPeople.map((p) => p.id))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Varsayılan kadro
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1 rounded-lg border border-rose-100 bg-rose-50 font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
            >
              Tümünü çıkar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)] min-h-0 flex-1 overflow-hidden">
          <div className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="p-3 space-y-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setGrupFilter('ALL')}
                  className={`text-[9px] font-bold px-2.5 py-1.5 rounded-xl border cursor-pointer ${
                    grupFilter === 'ALL'
                      ? 'bg-slate-800 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tüm gruplar
                </button>
                {SAHA_GRUPLAR.map((grup) => {
                  const count = grupCounts.get(grup) || 0;
                  if (count === 0 && grupFilter !== grup) return null;
                  return (
                    <button
                      key={grup}
                      type="button"
                      onClick={() => setGrupFilter(grupFilter === grup ? 'ALL' : grup)}
                      className={`text-[9px] font-bold px-2.5 py-1.5 rounded-xl border cursor-pointer ${personelGorevGrupChipClass(
                        grup,
                        grupFilter === grup
                      )}`}
                    >
                      {personelGorevGrupLabel(grup)}
                      <span className="ml-1 opacity-80 tabular-nums">({count})</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  placeholder="Seçililerde ad, T.C. veya görev ara"
                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
              {grouped.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-10 italic">
                  Seçili saha personeli yok. Sağdan ekleyin veya Varsayılan kadroya dönün.
                </p>
              ) : (
                grouped.map((g) => (
                  <div key={g.grup} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#1e4e78] text-white">
                      <span className="text-[11px] font-black uppercase tracking-wide">
                        {g.label}
                        <span className="ml-1.5 font-bold opacity-80">{g.people.length} kişi</span>
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => fillGrup(g.grup)}
                          className="text-[9px] font-bold px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 cursor-pointer"
                        >
                          Grubu doldur
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGrup(g.grup)}
                          className="text-[9px] font-bold px-2 py-1 rounded-md bg-rose-500/90 hover:bg-rose-600 cursor-pointer"
                        >
                          Grubu çıkar
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {g.people.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {personelAd(p)}
                              {!defaultIdSet.has(p.id) && (
                                <span className="ml-1.5 text-[8px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                                  Eklendi
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold tabular-nums">
                              T.C. {String(p.tcNo || '').trim() || '—'} · {displayPersonelGorev(p)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePerson(p.id)}
                            className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-lg px-2 py-1 cursor-pointer"
                          >
                            <UserMinus size={11} />
                            Çıkar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col min-h-0 bg-slate-50/80">
            <div className="p-3 shrink-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                <UserPlus size={12} />
                Personel ekle
              </div>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                Yalnız Kibritçi saha kadrosu. İdari personel listelenmez.
              </p>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder="Ad, T.C. veya görev (en az 2 harf)"
                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
              {addQuery.trim().length < 2 ? (
                <p className="text-[11px] text-slate-400 italic px-1">
                  Eklemek için ad, T.C. veya görev yazın.
                </p>
              ) : addHits.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic px-1">Eşleşen saha personeli yok.</p>
              ) : (
                addHits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPerson(p.id)}
                    className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-900">{personelAd(p)}</div>
                    <div className="text-[10px] text-slate-500 font-semibold">
                      T.C. {String(p.tcNo || '').trim() || '—'} · {displayPersonelGorev(p)} ·{' '}
                      {personelGorevGrupLabel(resolvePersonelGorevGrubu(p))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={exporting || selectedPeople.length === 0 || rangeTooLong}
            onClick={() => void handleExport()}
            className="px-4 py-2 rounded-xl bg-[#1e4e78] hover:bg-[#2563a8] disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Users size={13} />
            {exporting ? 'Hazırlanıyor…' : `Excel’e dök (${selectedPeople.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
