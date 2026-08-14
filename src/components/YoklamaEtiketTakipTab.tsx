import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ClipboardList, FileSpreadsheet, FileText, Loader2, Save, Search, Tag } from 'lucide-react';
import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { formatDateLabelTr, todayDateKey } from '../lib/dateKeyUtils';
import { displayPersonelGorev } from '../lib/guvenlikHelpers';
import { getYoklamaDay, type YoklamaGunKaydi } from '../lib/yoklamaUtils';
import {
  collectUsedPersonelTakipEtiketleri,
  mergePersonelTakipEtiketKatalogu,
  normalizePersonelTakipEtiketi,
  personelHasTakipEtiketi,
} from '../lib/personelTakipEtiketUtils';
import { subscribePersonelTakipEtiketleri } from '../lib/personelTakipEtiketPersistence';
import {
  buildYoklamaEtiketOzeti,
  normalizeYoklamaEtiketi,
  yoklamaEtiketBadgeClass,
  yoklamaEtiketOptionsWithCustom,
  YOKLAMA_ACIKLAMA_MAX,
  YOKLAMA_ETIKETSIZ,
} from '../lib/yoklamaEtiketUtils';

const DURUMLAR: Array<{ k: YoklamaDurum; short: string; on: string; off: string }> = [
  { k: 'Geldi', short: 'G', on: 'bg-emerald-600 text-white border-emerald-700', off: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { k: 'Yok', short: 'Y', on: 'bg-rose-600 text-white border-rose-700', off: 'bg-rose-50 text-rose-800 border-rose-200' },
  { k: 'İzinli', short: 'İ', on: 'bg-sky-600 text-white border-sky-700', off: 'bg-sky-50 text-sky-800 border-sky-200' },
  { k: 'Raporlu', short: 'R', on: 'bg-violet-600 text-white border-violet-700', off: 'bg-violet-50 text-violet-800 border-violet-200' },
  { k: 'Pazar', short: 'P', on: 'bg-slate-600 text-white border-slate-700', off: 'bg-slate-100 text-slate-700 border-slate-300' },
  { k: 'Tatil', short: 'T', on: 'bg-amber-600 text-white border-amber-700', off: 'bg-amber-50 text-amber-800 border-amber-200' },
];

function personelAd(p: Personel): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const parts = String(key || '').split('-').map((n) => parseInt(n, 10));
  return { year: parts[0] || 0, month: parts[1] || 0, day: parts[2] || 0 };
}

function emptyDay(): YoklamaGunKaydi {
  return { durum: 'Girilmedi', mesaiSaati: 0 };
}

export type YoklamaEtiketTakipPatch = Partial<
  Pick<YoklamaGunKaydi, 'durum' | 'mesaiSaati' | 'isEtiketi' | 'aciklama'>
>;

export const YoklamaEtiketTakipTab: React.FC<{
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  etiketKatalogu: string[];
  initialGrupEtiket?: string;
  onPatchPersonDay: (
    personelId: string,
    year: number,
    month: number,
    day: number,
    patch: YoklamaEtiketTakipPatch
  ) => void;
  onSave: () => Promise<boolean> | boolean;
  saving?: boolean;
  hasPendingChanges?: boolean;
  lastSavedAt?: string | null;
}> = ({
  personeller,
  yoklamalar,
  etiketKatalogu,
  initialGrupEtiket,
  onPatchPersonDay,
  onSave,
  saving = false,
  hasPendingChanges = false,
  lastSavedAt,
}) => {
  const [kayitliGruplar, setKayitliGruplar] = useState<string[]>([]);
  const [grupEtiket, setGrupEtiket] = useState(
    () => normalizePersonelTakipEtiketi(initialGrupEtiket) || 'ZER YAPI'
  );
  const [selectedDate, setSelectedDate] = useState(todayDateKey());
  const [listQuery, setListQuery] = useState('');
  const [listeFiltre, setListeFiltre] = useState<'ALL' | 'GELDI' | 'GIRILMEDI'>('ALL');
  const [bulkMeslek, setBulkMeslek] = useState('');
  const [bulkMeslekYazi, setBulkMeslekYazi] = useState('');
  const [etiketYazanId, setEtiketYazanId] = useState<string | null>(null);
  const [etiketYazi, setEtiketYazi] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);

  useEffect(() => subscribePersonelTakipEtiketleri(setKayitliGruplar), []);

  useEffect(() => {
    const next = normalizePersonelTakipEtiketi(initialGrupEtiket);
    if (next) setGrupEtiket(next);
  }, [initialGrupEtiket]);

  const { year, month, day } = useMemo(() => parseDateKey(selectedDate), [selectedDate]);

  const grupKatalog = useMemo(
    () => mergePersonelTakipEtiketKatalogu([kayitliGruplar, collectUsedPersonelTakipEtiketleri(personeller)]),
    [kayitliGruplar, personeller]
  );

  const tagged = useMemo(
    () =>
      personeller
        .filter((p) => personelHasTakipEtiketi(p, grupEtiket))
        .sort((a, b) => personelAd(a).localeCompare(personelAd(b), 'tr')),
    [personeller, grupEtiket]
  );

  const dayOf = (p: Personel): YoklamaGunKaydi =>
    getYoklamaDay(yoklamalar[p.id], year, month, day) || emptyDay();

  const gorunen = useMemo(() => {
    const q = listQuery.trim().toLocaleLowerCase('tr-TR');
    return tagged.filter((p) => {
      const d = dayOf(p);
      if (listeFiltre === 'GELDI' && d.durum !== 'Geldi') return false;
      if (listeFiltre === 'GIRILMEDI' && d.durum && d.durum !== 'Girilmedi') return false;
      if (!q) return true;
      const hay = `${personelAd(p)} ${p.tcNo || ''} ${displayPersonelGorev(p)} ${d.isEtiketi || ''}`.toLocaleLowerCase(
        'tr-TR'
      );
      return hay.includes(q);
    });
  }, [tagged, listQuery, listeFiltre, yoklamalar, year, month, day]);

  const ozet = useMemo(() => {
    let geldi = 0;
    let yok = 0;
    let diger = 0;
    let girilmedi = 0;
    let mesai = 0;
    for (const p of tagged) {
      const d = dayOf(p);
      const durum = d.durum || 'Girilmedi';
      if (durum === 'Geldi') geldi += 1;
      else if (durum === 'Yok') yok += 1;
      else if (durum === 'Girilmedi') girilmedi += 1;
      else diger += 1;
      mesai += Number(d.mesaiSaati) || 0;
    }
    return { geldi, yok, diger, girilmedi, mesai, toplam: tagged.length };
  }, [tagged, yoklamalar, year, month, day]);

  const meslekOzeti = useMemo(
    () =>
      buildYoklamaEtiketOzeti(
        tagged.map((p) => {
          const d = dayOf(p);
          return { isEtiketi: d.isEtiketi, durum: d.durum, mesaiSaati: d.mesaiSaati };
        })
      ),
    [tagged, yoklamalar, year, month, day]
  );

  const patch = (personelId: string, next: YoklamaEtiketTakipPatch) => {
    onPatchPersonDay(personelId, year, month, day, next);
  };

  const applyDurum = (p: Personel, durum: YoklamaDurum) => {
    const cur = dayOf(p);
    patch(p.id, {
      durum,
      mesaiSaati: durum === 'Geldi' ? cur.mesaiSaati || 0 : 0,
      isEtiketi: cur.isEtiketi,
      aciklama: cur.aciklama,
    });
  };

  const applyMeslek = (p: Personel, etiket: string) => {
    const cur = dayOf(p);
    patch(p.id, { ...cur, isEtiketi: normalizeYoklamaEtiketi(etiket) || undefined });
  };

  const commitYeniMeslek = (p: Personel) => {
    const next = normalizeYoklamaEtiketi(etiketYazi);
    if (!next) {
      alert('Yeni meslek grubu yazın (ör. İNCE TEMİZLİK).');
      return;
    }
    applyMeslek(p, next);
    setEtiketYazanId(null);
    setEtiketYazi('');
  };

  const markVisibleGeldi = () => {
    for (const p of gorunen) applyDurum(p, 'Geldi');
  };

  const applyBulkMeslek = () => {
    const etiket =
      bulkMeslek === '__CUSTOM__'
        ? normalizeYoklamaEtiketi(bulkMeslekYazi)
        : normalizeYoklamaEtiketi(bulkMeslek);
    if (bulkMeslek === '__CUSTOM__' && !etiket) {
      alert('Yeni meslek grubu yazın.');
      return;
    }
    const targets = gorunen.filter((p) => dayOf(p).durum === 'Geldi');
    const list = targets.length > 0 ? targets : gorunen;
    for (const p of list) applyMeslek(p, etiket);
  };

  const downloadGunTxt = () => {
    const nl = '\r\n';
    const lines = [
      `${grupEtiket} — ${formatDateLabelTr(selectedDate)}`,
      `Geldi ${ozet.geldi} · Yok ${ozet.yok} · Girilmedi ${ozet.girilmedi}`,
      '',
    ];
    for (const p of tagged) {
      const d = dayOf(p);
      const durum = d.durum && d.durum !== 'Girilmedi' ? d.durum : 'Girilmedi';
      const meslek = normalizeYoklamaEtiketi(d.isEtiketi) || '—';
      lines.push(`${personelAd(p)}\t${durum}\t${meslek}`);
    }
    const blob = new Blob(['\uFEFF' + lines.join(nl)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kibritci_${grupEtiket.replace(/[^\wÇĞİÖŞÜçğıöşü]+/g, '_')}_${selectedDate}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleHakedisExcel = async () => {
    if (tagged.length === 0) {
      alert(`«${grupEtiket}» grubunda işaretli personel yok.`);
      return;
    }
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const { exportGrupYoklamaHakedisExcel } = await import('../lib/grupYoklamaExcel');
      await exportGrupYoklamaHakedisExcel({
        grupEtiket,
        personeller: tagged,
        yoklamalar,
        year,
        month,
      });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Excel oluşturulamadı.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleSave = async () => {
    const ok = await onSave();
    if (ok === false) return;
  };

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#c4a35a]">
            <ClipboardList size={13} />
            Grup yoklama
          </div>
          <h2 className="text-sm font-black text-slate-900 mt-0.5">
            {grupEtiket} — günlük yoklama ve meslek etiketi
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-3xl">
            Bu ekran ayrı bir yoklama defteri değildir. Puantaj’daki yoklama / meslek etiketi ve Formen
            günlük yoklaması ile <span className="font-bold text-slate-700">aynı kaydı</span> okur ve
            yazar. Orada bugün girilmiş Geldi / Yok / etiket burada görünür; burada kaydettiğiniz de
            orada görünür.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {grupKatalog.map((etiket) => {
            const count = personeller.filter((p) => personelHasTakipEtiketi(p, etiket)).length;
            const active = etiket === grupEtiket;
            return (
              <button
                key={etiket}
                type="button"
                onClick={() => setGrupEtiket(etiket)}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border cursor-pointer ${
                  active
                    ? 'bg-[#0f2744] text-[#f4ead5] border-[#c4a35a]/50'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {etiket}
                <span className="ml-1.5 tabular-nums opacity-80">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <Calendar size={13} />
            Tarih
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayDateKey())}
              className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50"
            />
          </label>
          <span className="text-[11px] font-bold text-slate-500">{formatDateLabelTr(selectedDate)}</span>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {[
              { k: 'geldi', n: ozet.geldi, l: 'Geldi', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
              { k: 'yok', n: ozet.yok, l: 'Yok', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
              { k: 'diger', n: ozet.diger, l: 'İzin/Rapor', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
              { k: 'bos', n: ozet.girilmedi, l: 'Girilmedi', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
            ].map((x) => (
              <span key={x.k} className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${x.cls}`}>
                {x.l} {x.n}
              </span>
            ))}
          </div>
        </div>

        {meslekOzeti.length > 0 && ozet.toplam > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-violet-800">
              Meslek
            </span>
            {meslekOzeti.map((e) => (
              <span
                key={e.etiket}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${yoklamaEtiketBadgeClass(
                  e.etiket === YOKLAMA_ETIKETSIZ ? '' : e.etiket
                )}`}
              >
                {e.etiket === YOKLAMA_ETIKETSIZ ? 'Etiketsiz' : e.etiket}: {e.geldi}/{e.adet}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/70 p-2.5">
          <Tag size={13} className="text-violet-700" />
          <span className="text-[10px] font-black uppercase text-violet-800">Toplu meslek</span>
          <select
            value={bulkMeslek}
            onChange={(e) => setBulkMeslek(e.target.value)}
            className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg p-1.5 max-w-[200px]"
          >
            <option value="">— Etiket yok / kaldır —</option>
            {etiketKatalogu.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value="__CUSTOM__">＋ Yeni etiket yaz…</option>
          </select>
          {bulkMeslek === '__CUSTOM__' && (
            <input
              type="text"
              value={bulkMeslekYazi}
              onChange={(e) => setBulkMeslekYazi(e.target.value)}
              placeholder="Örn. İNCE TEMİZLİK"
              className="w-36 text-[11px] font-bold bg-white border border-slate-200 rounded-lg p-1.5 uppercase"
            />
          )}
          <button
            type="button"
            onClick={applyBulkMeslek}
            disabled={gorunen.length === 0}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg cursor-pointer"
          >
            Görünene uygula
          </button>
          <span className="text-[9px] text-violet-700 font-medium">
            Önce Geldi olanlara; Geldi yoksa listedekilere yazılır.
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[480px] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="text-xs font-black text-slate-800">
            {grupEtiket}: {tagged.length} kişi
            {hasPendingChanges && (
              <span className="ml-2 text-amber-700 font-bold">· kaydedilmemiş değişiklik</span>
            )}
            {lastSavedAt && !hasPendingChanges && (
              <span className="ml-2 text-slate-400 font-semibold">· son kayıt {lastSavedAt}</span>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {(['ALL', 'GELDI', 'GIRILMEDI'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setListeFiltre(f)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer ${
                  listeFiltre === f
                    ? 'bg-slate-800 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {f === 'ALL' ? 'Tümü' : f === 'GELDI' ? 'Geldi' : 'Girilmedi'}
              </button>
            ))}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Ad, görev veya meslek"
                className="text-xs font-semibold border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-slate-50 w-44"
              />
            </div>
            <button
              type="button"
              onClick={markVisibleGeldi}
              disabled={gorunen.length === 0}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 cursor-pointer disabled:opacity-40"
            >
              Görünenlere Geldi
            </button>
            <button
              type="button"
              disabled={tagged.length === 0}
              onClick={downloadGunTxt}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
            >
              <FileText size={12} />
              TXT
            </button>
            <button
              type="button"
              disabled={tagged.length === 0 || exportingExcel}
              onClick={() => void handleHakedisExcel()}
              title="Seçili ayın Kibritçi antetli hakediş Excel’i — meslek grupları ayrı (ödeme cetveli)"
              className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
            >
              {exportingExcel ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
              {exportingExcel ? 'Excel…' : 'Hakediş Excel'}
            </button>
            <button
              type="button"
              disabled={saving || !hasPendingChanges}
              onClick={() => void handleSave()}
              className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-[#0f2744] hover:bg-[#17365c] text-[#f4ead5] cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
              title={hasPendingChanges ? 'Puantaj ve Formen ile aynı yoklama kaydına yazar' : 'Değişiklik yok'}
            >
              <Save size={13} />
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {tagged.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-16 italic px-6">
              «{grupEtiket}» grubunda işaretli personel yok. Önce Etiket Grupları sekmesinde kadroyu
              işaretleyip kaydedin.
            </p>
          ) : gorunen.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-16 italic">Filtreye uyan kişi yok.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 z-10">
                <tr>
                  <th className="px-3 py-2 font-bold w-8">#</th>
                  <th className="px-3 py-2 font-bold">Ad Soyad</th>
                  <th className="px-3 py-2 font-bold">Görev</th>
                  <th className="px-3 py-2 font-bold">Yoklama</th>
                  <th className="px-3 py-2 font-bold">Meslek etiketi</th>
                  <th className="px-3 py-2 font-bold min-w-[140px]">Açıklama</th>
                  <th className="px-3 py-2 font-bold w-16 text-center">Mesai</th>
                </tr>
              </thead>
              <tbody>
                {gorunen.map((p, i) => {
                  const d = dayOf(p);
                  const durum = (d.durum || 'Girilmedi') as YoklamaDurum;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-100 ${
                        durum === 'Geldi'
                          ? 'bg-emerald-50/50'
                          : durum === 'Yok'
                            ? 'bg-rose-50/40'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2 text-[11px] text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-slate-900">{personelAd(p)}</td>
                      <td className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                        {displayPersonelGorev(p)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-0.5">
                          {DURUMLAR.map((opt) => (
                            <button
                              key={opt.k}
                              type="button"
                              title={opt.k}
                              onClick={() => applyDurum(p, opt.k)}
                              className={`w-7 h-7 text-[10px] font-black rounded-md border cursor-pointer ${
                                durum === opt.k ? opt.on : opt.off
                              }`}
                            >
                              {opt.short}
                            </button>
                          ))}
                          <button
                            type="button"
                            title="Girilmedi"
                            onClick={() => applyDurum(p, 'Girilmedi')}
                            className={`w-7 h-7 text-[10px] font-black rounded-md border cursor-pointer ${
                              durum === 'Girilmedi'
                                ? 'bg-slate-800 text-white border-slate-900'
                                : 'bg-white text-slate-400 border-slate-200'
                            }`}
                          >
                            —
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <select
                            value={etiketYazanId === p.id ? '__YENI__' : normalizeYoklamaEtiketi(d.isEtiketi)}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__YENI__') {
                                setEtiketYazanId(p.id);
                                setEtiketYazi('');
                                return;
                              }
                              setEtiketYazanId(null);
                              applyMeslek(p, val);
                            }}
                            className="w-full max-w-[180px] text-[10px] font-bold bg-white border border-slate-200 rounded px-1 py-1"
                          >
                            <option value="">—</option>
                            {yoklamaEtiketOptionsWithCustom(d.isEtiketi, [etiketKatalogu]).map((etiket) => (
                              <option key={etiket} value={etiket}>
                                {etiket}
                              </option>
                            ))}
                            <option value="__YENI__">＋ Yeni etiket yaz…</option>
                          </select>
                          {etiketYazanId === p.id && (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                type="text"
                                value={etiketYazi}
                                onChange={(e) => setEtiketYazi(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitYeniMeslek(p);
                                  }
                                  if (e.key === 'Escape') {
                                    setEtiketYazanId(null);
                                    setEtiketYazi('');
                                  }
                                }}
                                placeholder="Örn. İNCE TEMİZLİK"
                                className="w-28 text-[10px] font-bold bg-white border border-violet-300 rounded px-1 py-1 uppercase"
                              />
                              <button
                                type="button"
                                onClick={() => commitYeniMeslek(p)}
                                className="text-[9px] font-black px-1.5 py-1 rounded bg-violet-600 text-white cursor-pointer"
                              >
                                Tamam
                              </button>
                            </div>
                          )}
                          {d.isEtiketi && etiketYazanId !== p.id && (
                            <span
                              className={`w-fit text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${yoklamaEtiketBadgeClass(
                                d.isEtiketi
                              )}`}
                            >
                              {d.isEtiketi}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          maxLength={YOKLAMA_ACIKLAMA_MAX}
                          value={d.aciklama || ''}
                          onChange={(e) =>
                            patch(p.id, {
                              ...d,
                              aciklama: e.target.value.slice(0, YOKLAMA_ACIKLAMA_MAX) || undefined,
                            })
                          }
                          placeholder="Açıklama"
                          className="w-full min-w-[120px] text-[10px] font-semibold bg-amber-50 border border-amber-200 rounded px-1.5 py-1"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={14}
                          step={0.5}
                          disabled={durum !== 'Geldi'}
                          value={durum === 'Geldi' ? d.mesaiSaati || 0 : 0}
                          onChange={(e) =>
                            patch(p.id, {
                              ...d,
                              durum: 'Geldi',
                              mesaiSaati: Math.max(0, Math.min(14, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-14 text-[11px] font-bold text-center border border-slate-200 rounded px-1 py-1 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
