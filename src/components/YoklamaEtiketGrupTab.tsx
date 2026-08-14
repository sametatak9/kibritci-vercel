import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search, Tag, UserMinus, UserPlus } from 'lucide-react';
import type { Personel } from '../types/erp';
import { displayPersonelGorev } from '../lib/guvenlikHelpers';
import { formatDateLabelTr, normalizeDateKey } from '../lib/dateKeyUtils';
import { rememberPersonelTakipEtiketleri, subscribePersonelTakipEtiketleri } from '../lib/personelTakipEtiketPersistence';
import {
  collectUsedPersonelTakipEtiketleri,
  isBuiltinPersonelTakipEtiketi,
  mergePersonelTakipEtiketKatalogu,
  normalizePersonelTakipEtiketi,
  personelHasTakipEtiketi,
  withPersonelTakipEtiketi,
} from '../lib/personelTakipEtiketUtils';

function personelAd(p: Personel): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

function isAktifKadro(p: Personel): boolean {
  if (p.durum === false) return false;
  const durum = String(p.durum ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (durum === 'PASIF' || durum === 'FALSE' || durum === '0') return false;
  return true;
}

function downloadNamesTxt(etiket: string, people: Personel[]) {
  const nl = '\r\n';
  const lines = [
    etiket,
    '',
    ...people
      .slice()
      .sort((a, b) => personelAd(a).localeCompare(personelAd(b), 'tr'))
      .map(personelAd)
      .filter(Boolean),
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
}> = ({ personeller, setPersoneller }) => {
  const [kayitliEtiketler, setKayitliEtiketler] = useState<string[]>([]);
  const [selectedEtiket, setSelectedEtiket] = useState('ZER YAPI');
  const [yeniEtiket, setYeniEtiket] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [addQuery, setAddQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribePersonelTakipEtiketleri(setKayitliEtiketler), []);

  const kullanilmis = useMemo(
    () => collectUsedPersonelTakipEtiketleri(personeller),
    [personeller]
  );
  const katalog = useMemo(
    () => mergePersonelTakipEtiketKatalogu([kayitliEtiketler, kullanilmis]),
    [kayitliEtiketler, kullanilmis]
  );

  useEffect(() => {
    if (!selectedEtiket && katalog[0]) setSelectedEtiket(katalog[0]);
  }, [katalog, selectedEtiket]);

  const grup = useMemo(
    () =>
      (personeller || [])
        .filter((p) => personelHasTakipEtiketi(p, selectedEtiket))
        .slice()
        .sort((a, b) => personelAd(a).localeCompare(personelAd(b), 'tr')),
    [personeller, selectedEtiket]
  );

  const gorunen = useMemo(() => {
    const q = listQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return grup;
    return grup.filter((p) => {
      const hay = `${personelAd(p)} ${p.tcNo || ''} ${displayPersonelGorev(p)}`.toLocaleLowerCase(
        'tr-TR'
      );
      return hay.includes(q);
    });
  }, [grup, listQuery]);

  const addHits = useMemo(() => {
    const q = addQuery.trim().toLocaleLowerCase('tr-TR');
    if (q.length < 2) return [];
    return (personeller || [])
      .filter((p) => !personelHasTakipEtiketi(p, selectedEtiket))
      .filter((p) => {
        const hay = `${personelAd(p)} ${p.tcNo || ''} ${displayPersonelGorev(p)}`.toLocaleLowerCase(
          'tr-TR'
        );
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [addQuery, personeller, selectedEtiket]);

  const applyTag = async (personelId: string, on: boolean) => {
    if (!setPersoneller) {
      alert('Personel kaydı bu oturumda güncellenemiyor.');
      return;
    }
    const etiket = normalizePersonelTakipEtiketi(selectedEtiket);
    if (!etiket) return;
    setSaving(true);
    try {
      setPersoneller((prev) =>
        prev.map((p) => (p.id === personelId ? withPersonelTakipEtiketi(p, etiket, on) : p))
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

  const canEdit = Boolean(setPersoneller);

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#c4a35a]">
            <Tag size={13} />
            Etiket grupları
          </div>
          <h2 className="text-sm font-black text-slate-900 mt-0.5">Kadro takibi</h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-3xl">
            Bu sayfa yoklama almaz. Belirlediğiniz etikete (ör. ZER YAPI) sahip personeli bir arada
            görür, ekler veya çıkarırsınız. Günlük puantaj eski yerinde durur.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {katalog.map((etiket) => {
            const count = (personeller || []).filter((p) => personelHasTakipEtiketi(p, etiket)).length;
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
            placeholder="Yeni etiket (ör. ZER YAPI)"
            className="text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white uppercase min-w-[200px]"
          />
          <button
            type="button"
            onClick={() => void handleCreateEtiket()}
            className="text-[11px] font-bold px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white cursor-pointer inline-flex items-center gap-1"
          >
            <Plus size={13} />
            Etiket oluştur
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.8fr)] gap-4 min-h-0 flex-1">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[420px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Seçili etiket
              </div>
              <div className="text-sm font-black text-slate-900">
                {selectedEtiket || '—'}
                <span className="ml-2 text-[11px] font-bold text-slate-500">{grup.length} kişi</span>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  placeholder="Ad, T.C. veya görev"
                  className="text-xs font-semibold border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-slate-50 w-48"
                />
              </div>
              <button
                type="button"
                disabled={grup.length === 0}
                onClick={() => downloadNamesTxt(selectedEtiket, grup)}
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white cursor-pointer inline-flex items-center gap-1"
              >
                <FileText size={12} />
                İsim listesi TXT
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {gorunen.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-16 italic px-6">
                Bu etikette henüz personel yok. Sağdan ad veya T.C. yazıp ekleyin.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-bold w-8">#</th>
                    <th className="px-3 py-2 font-bold">Ad Soyad</th>
                    <th className="px-3 py-2 font-bold">T.C.</th>
                    <th className="px-3 py-2 font-bold">Görev</th>
                    <th className="px-3 py-2 font-bold">İşe giriş</th>
                    {canEdit && <th className="px-3 py-2 font-bold w-24" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gorunen.map((p, i) => {
                    const giris = normalizeDateKey(p.iseGirisTarihi);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 text-[11px] text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="text-xs font-bold text-slate-900">{personelAd(p)}</div>
                          {!isAktifKadro(p) && (
                            <span className="text-[8px] font-black uppercase text-rose-700">Pasif</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-semibold tabular-nums text-slate-700">
                          {String(p.tcNo || '').trim() || '—'}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                          {displayPersonelGorev(p)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-500">
                          {giris ? formatDateLabelTr(giris) : '—'}
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void applyTag(p.id, false)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-lg px-2 py-1 cursor-pointer disabled:opacity-50"
                            >
                              <UserMinus size={11} />
                              Çıkar
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[320px] overflow-hidden">
          <div className="p-3 shrink-0">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
              <UserPlus size={12} />
              Gruba personel ekle
            </div>
            <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
              {isBuiltinPersonelTakipEtiketi(selectedEtiket)
                ? 'ZER YAPI kadrosunu buradan ayırın. Yoklama şart değil.'
                : 'Bu etikete yazılacak kişiyi ad veya T.C. ile bulun.'}
            </p>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Ad, T.C. veya görev (en az 2 harf)"
                disabled={!canEdit}
                className="w-full text-xs font-semibold border border-slate-200 rounded-lg pl-8 pr-3 py-2 bg-white disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {!canEdit ? (
              <p className="text-[11px] text-slate-400 italic">Bu oturumda personel eklenemez.</p>
            ) : addQuery.trim().length < 2 ? (
              <p className="text-[11px] text-slate-400 italic">Eklemek için ad veya T.C. yazın.</p>
            ) : addHits.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">Eşleşen personel yok veya zaten bu grupta.</p>
            ) : (
              addHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void applyTag(p.id, true);
                    setAddQuery('');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer disabled:opacity-50"
                >
                  <div className="text-xs font-bold text-slate-900">{personelAd(p)}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    T.C. {String(p.tcNo || '').trim() || '—'} · {displayPersonelGorev(p)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
