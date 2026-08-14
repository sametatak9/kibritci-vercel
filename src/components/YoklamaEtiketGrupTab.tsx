import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileText, Save, Search, Tag } from 'lucide-react';
import type { Personel } from '../types/erp';
import { collectAktifAnaFirmaPersonelNow } from '../lib/aktifPersonelListeExcel';
import { displayPersonelGorev } from '../lib/guvenlikHelpers';
import { rememberPersonelTakipEtiketleri, subscribePersonelTakipEtiketleri } from '../lib/personelTakipEtiketPersistence';
import {
  collectUsedPersonelTakipEtiketleri,
  mergePersonelTakipEtiketKatalogu,
  normalizePersonelTakipEtiketi,
  personelHasTakipEtiketi,
  withPersonelTakipEtiketi,
} from '../lib/personelTakipEtiketUtils';

function personelAd(p: Personel): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

function downloadTaggedNamesTxt(etiket: string, people: Personel[]) {
  const nl = '\r\n';
  const lines = [
    etiket,
    '',
    ...people.map(personelAd).filter(Boolean),
    '',
  ];
  const blob = new Blob(['\uFEFF' + lines.join(nl)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kibritci_${etiket.replace(/[^\wÇĞİÖŞÜçğıöşü]+/g, '_')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const YoklamaEtiketGrupTab: React.FC<{
  personeller: Personel[];
  setPersoneller?: React.Dispatch<React.SetStateAction<Personel[]>>;
  onOpenGrupYoklama?: (etiket: string) => void;
}> = ({ personeller, setPersoneller, onOpenGrupYoklama }) => {
  const [kayitliEtiketler, setKayitliEtiketler] = useState<string[]>([]);
  const [selectedEtiket, setSelectedEtiket] = useState('ZER YAPI');
  const [yeniEtiket, setYeniEtiket] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [listeFiltre, setListeFiltre] = useState<'ALL' | 'TAGGED' | 'UNTAGGED'>('ALL');
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribePersonelTakipEtiketleri(setKayitliEtiketler), []);

  const aktif = useMemo(() => collectAktifAnaFirmaPersonelNow(personeller), [personeller]);
  const aktifIdSet = useMemo(() => new Set(aktif.map((p) => p.id)), [aktif]);

  const kullanilmis = useMemo(
    () => collectUsedPersonelTakipEtiketleri(personeller),
    [personeller]
  );
  const katalog = useMemo(
    () => mergePersonelTakipEtiketKatalogu([kayitliEtiketler, kullanilmis]),
    [kayitliEtiketler, kullanilmis]
  );

  const savedIdKey = useMemo(
    () =>
      aktif
        .filter((p) => personelHasTakipEtiketi(p, selectedEtiket))
        .map((p) => p.id)
        .sort()
        .join(','),
    [aktif, selectedEtiket]
  );

  useEffect(() => {
    setDraftIds(savedIdKey ? savedIdKey.split(',') : []);
  }, [savedIdKey, selectedEtiket]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const savedSet = useMemo(
    () => new Set(savedIdKey ? savedIdKey.split(',') : []),
    [savedIdKey]
  );

  const dirty =
    draftIds.length !== savedSet.size || draftIds.some((id) => !savedSet.has(id));

  const gorunen = useMemo(() => {
    const q = listQuery.trim().toLocaleLowerCase('tr-TR');
    return aktif.filter((p) => {
      const tagged = draftSet.has(p.id);
      if (listeFiltre === 'TAGGED' && !tagged) return false;
      if (listeFiltre === 'UNTAGGED' && tagged) return false;
      if (!q) return true;
      const hay = `${personelAd(p)} ${p.tcNo || ''} ${displayPersonelGorev(p)}`.toLocaleLowerCase(
        'tr-TR'
      );
      return hay.includes(q);
    });
  }, [aktif, draftSet, listQuery, listeFiltre]);

  const gorevGruplari = useMemo(() => {
    const map = new Map<string, Personel[]>();
    for (const p of gorunen) {
      const gorev = displayPersonelGorev(p) || 'BELİRTİLMEDİ';
      const list = map.get(gorev) || [];
      list.push(p);
      map.set(gorev, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
      .map(([gorev, personeller]) => ({ gorev, personeller }));
  }, [gorunen]);

  const taggedCount = draftIds.filter((id) => aktifIdSet.has(id)).length;

  const toggleOne = (id: string) => {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const markVisible = (on: boolean) => {
    const ids = gorunen.map((p) => p.id);
    setDraftIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return Array.from(next);
    });
  };

  const handleSave = () => {
    if (!setPersoneller) {
      alert('Personel kaydı bu oturumda güncellenemiyor.');
      return;
    }
    const etiket = normalizePersonelTakipEtiketi(selectedEtiket);
    if (!etiket) return;
    if (
      !window.confirm(
        `${etiket} etiketi ${taggedCount} aktif personele kaydedilsin mi?\n\n` +
          `Yoklama / puantaj işleyişi değişmez. Bu kayıt yalnızca grubu tespit etmek içindir.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const want = new Set(draftIds);
      setPersoneller((prev) =>
        prev.map((p) => {
          if (!aktifIdSet.has(p.id)) return p;
          return withPersonelTakipEtiketi(p, etiket, want.has(p.id));
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEtiket = async () => {
    const etiket = normalizePersonelTakipEtiketi(yeniEtiket);
    if (!etiket) {
      alert('Etiket adı yazın (ör. ZER YAPI).');
      return;
    }
    try {
      await rememberPersonelTakipEtiketleri([etiket], katalog);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Etiket kaydedilemedi.');
      return;
    }
    setSelectedEtiket(etiket);
    setYeniEtiket('');
  };

  const taggedPeople = aktif.filter((p) => draftSet.has(p.id));
  const canEdit = Boolean(setPersoneller);

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#c4a35a]">
            <Tag size={13} />
            Etiket grupları
          </div>
          <h2 className="text-sm font-black text-slate-900 mt-0.5">Aktif personel — grup tespiti</h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-3xl">
            Aşağıda aktif Kibritçi kadrosu durur. İstediğiniz kişileri bir kez «{selectedEtiket || 'ZER YAPI'}»
            diye işaretleyip kaydedin. Bu sayfa yoklama defterini değiştirmez; grubu tespit eder.
            İşaretli kadronun günlük yoklaması ve meslek etiketi «Grup Yoklama» sekmesinde, Puantaj ve
            Formen ile aynı kayıttan takip edilir.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {katalog.map((etiket) => {
            const count = aktif.filter((p) => personelHasTakipEtiketi(p, etiket)).length;
            const active = etiket === selectedEtiket;
            return (
              <button
                key={etiket}
                type="button"
                onClick={() => setSelectedEtiket(etiket)}
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
          <input
            value={yeniEtiket}
            onChange={(e) => setYeniEtiket(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreateEtiket();
              }
            }}
            placeholder="Yeni etiket adı"
            className="text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white uppercase min-w-[180px]"
          />
          <button
            type="button"
            onClick={() => void handleCreateEtiket()}
            className="text-[11px] font-bold px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
          >
            Etiket oluştur
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[480px] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="text-xs font-black text-slate-800">
            Aktif kadro {aktif.length}
            <span className="ml-2 font-bold text-emerald-700">
              {selectedEtiket}: {taggedCount} işaretli
            </span>
            {dirty && (
              <span className="ml-2 text-amber-700 font-bold">· kaydedilmemiş değişiklik</span>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {(['ALL', 'TAGGED', 'UNTAGGED'] as const).map((f) => (
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
                {f === 'ALL' ? 'Tümü' : f === 'TAGGED' ? 'İşaretli' : 'İşaretsiz'}
              </button>
            ))}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Ad, T.C. veya görev"
                className="text-xs font-semibold border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-slate-50 w-44"
              />
            </div>
            <button
              type="button"
              onClick={() => markVisible(true)}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 cursor-pointer"
            >
              Görünenleri işaretle
            </button>
            <button
              type="button"
              onClick={() => markVisible(false)}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer"
            >
              İşareti kaldır
            </button>
            <button
              type="button"
              disabled={taggedPeople.length === 0}
              onClick={() => downloadTaggedNamesTxt(selectedEtiket, taggedPeople)}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
            >
              <FileText size={12} />
              TXT
            </button>
            {onOpenGrupYoklama && (
              <button
                type="button"
                onClick={() => onOpenGrupYoklama(selectedEtiket)}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white cursor-pointer inline-flex items-center gap-1"
              >
                <ClipboardList size={12} />
                Grup yoklama
              </button>
            )}
            <button
              type="button"
              disabled={!canEdit || saving || !dirty}
              onClick={handleSave}
              title={
                dirty
                  ? 'Seçilen grubu personel kartına kaydet'
                  : 'Değişiklik yok — grup zaten kayıtlı'
              }
              className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-[#0f2744] hover:bg-[#17365c] text-[#f4ead5] cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
            >
              <Save size={13} />
              {saving ? 'Kaydediliyor…' : dirty ? 'Kaydet' : 'Kayıtlı'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {aktif.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-16 italic">
              Aktif Kibritçi personeli bulunamadı.
            </p>
          ) : gorunen.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-16 italic">Filtreye uyan kişi yok.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 z-10">
                <tr>
                  <th className="px-3 py-2 font-bold w-10 text-center">{selectedEtiket}</th>
                  <th className="px-3 py-2 font-bold w-8">#</th>
                  <th className="px-3 py-2 font-bold">Ad Soyad</th>
                  <th className="px-3 py-2 font-bold">T.C.</th>
                  <th className="px-3 py-2 font-bold">Görev</th>
                </tr>
              </thead>
              <tbody>
                {gorevGruplari.map((g) => (
                  <React.Fragment key={g.gorev}>
                    <tr className="bg-[#1e4e78] text-white">
                      <td colSpan={5} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide">
                        {g.gorev}
                        <span className="ml-2 font-bold opacity-80">{g.personeller.length} kişi</span>
                      </td>
                    </tr>
                    {g.personeller.map((p, i) => {
                      const on = draftSet.has(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-slate-100 cursor-pointer ${
                            on ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                          }`}
                          onClick={() => canEdit && toggleOne(p.id)}
                        >
                          <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!canEdit}
                              onChange={() => toggleOne(p.id)}
                              className="w-4 h-4 cursor-pointer accent-emerald-700"
                            />
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2 text-xs font-bold text-slate-900">{personelAd(p)}</td>
                          <td className="px-3 py-2 text-[11px] font-semibold tabular-nums text-slate-700">
                            {String(p.tcNo || '').trim() || '—'}
                          </td>
                          <td className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                            {displayPersonelGorev(p)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
