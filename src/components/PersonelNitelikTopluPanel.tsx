import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Search, Tags } from 'lucide-react';
import type { Personel } from '../types/erp';
import { saveDocumentsBatch } from '../lib/firebase';
import { addProgramCatalogItem } from '../lib/programKatalog';
import { useProgramCatalog } from '../hooks/useProgramCatalog';
import { isPersonelAktifDurum } from '../lib/kampPlacementUtils';
import { isIdariPersonel, isPendingKampPersonel, isTaseronPersonel } from '../lib/yoklamaUtils';
import { displayPersonelGorev } from '../lib/guvenlikHelpers';

type KadroFiltre = 'tumu' | 'ana' | 'idari' | 'taseron';

function normNitelik(value: string): string {
  return String(value || '').trim().toLocaleUpperCase('tr-TR');
}

function personelAd(p: Personel): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

interface PersonelNitelikTopluPanelProps {
  personeller: Personel[];
  setPersoneller: React.Dispatch<React.SetStateAction<Personel[]>>;
}

export const PersonelNitelikTopluPanel: React.FC<PersonelNitelikTopluPanelProps> = ({
  personeller,
  setPersoneller,
}) => {
  const extraOptions = useMemo(() => {
    const set = new Set<string>();
    personeller.forEach((p) => {
      const n = String(p.nitelik || '').trim();
      if (n) set.add(n);
    });
    return Array.from(set);
  }, [personeller]);
  const { options } = useProgramCatalog('nitelik', extraOptions);

  const aktifler = useMemo(
    () =>
      personeller
        .filter((p) => isPersonelAktifDurum(p.durum) && !isPendingKampPersonel(p))
        .sort((a, b) => personelAd(a).localeCompare(personelAd(b), 'tr')),
    [personeller]
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [kadro, setKadro] = useState<KadroFiltre>('tumu');
  const [sadeceBos, setSadeceBos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of aktifler) {
        if (!(p.id in next)) next[p.id] = String(p.nitelik || '');
      }
      return next;
    });
  }, [aktifler]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return aktifler.filter((p) => {
      if (kadro === 'idari' && !isIdariPersonel(p)) return false;
      if (kadro === 'taseron' && !isTaseronPersonel(p)) return false;
      if (kadro === 'ana' && (isIdariPersonel(p) || isTaseronPersonel(p))) return false;
      const draft = drafts[p.id] ?? String(p.nitelik || '');
      if (sadeceBos && draft.trim()) return false;
      if (!q) return true;
      const hay = `${personelAd(p)} ${p.tcNo || ''} ${p.gorev || ''} ${draft} ${p.firmaAdi || ''}`.toLocaleLowerCase(
        'tr-TR'
      );
      return hay.includes(q);
    });
  }, [aktifler, drafts, kadro, search, sadeceBos]);

  const dirty = useMemo(() => {
    return aktifler.filter((p) => {
      const next = normNitelik(drafts[p.id] ?? '');
      const prev = normNitelik(p.nitelik || '');
      return next !== prev;
    });
  }, [aktifler, drafts]);

  const handleSave = async () => {
    if (dirty.length === 0 || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const payloads = dirty.map((p) => ({
        id: p.id,
        nitelik: normNitelik(drafts[p.id] ?? ''),
      }));
      await saveDocumentsBatch('personeller', payloads);
      const yeniDegerler = Array.from(
        new Set(payloads.map((x) => x.nitelik).filter((v): v is string => Boolean(v)))
      );
      for (const val of yeniDegerler) {
        try {
          await addProgramCatalogItem('nitelik', val);
        } catch {
          /* katalog yazılamasa kart yine güncellenir */
        }
      }
      const byId = new Map(payloads.map((x) => [x.id, x.nitelik]));
      setPersoneller((prev) =>
        prev.map((p) => (byId.has(p.id) ? { ...p, nitelik: byId.get(p.id) || '' } : p))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of payloads) next[row.id] = row.nitelik;
        return next;
      });
      setStatus(`${payloads.length} personelin niteliği kaydedildi. Görev ve yoklama değişmedi.`);
    } catch (err: any) {
      setStatus(
        'Kayıt yazılamadı: ' +
          (err?.message === 'FIRESTORE_TIMEOUT' ? 'zaman aşımı' : err?.message || 'bilinmeyen hata')
      );
    } finally {
      setSaving(false);
    }
  };

  const bosSayisi = aktifler.filter((p) => !normNitelik(drafts[p.id] ?? p.nitelik ?? '')).length;

  return (
    <div className="w-full bg-white border border-orange-100 rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-[calc(100vh-10rem)]">
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Tags size={16} className="text-[#f59e0b] mt-0.5" />
            <div>
              <h4 className="font-display font-bold text-sm text-slate-800 uppercase tracking-widest">
                Nitelik toplu düzenleme
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Aktif kadro: {aktifler.length} · Görünen: {visible.length} · Boş nitelik: {bosSayisi} · Değişen:{' '}
                {dirty.length}
              </p>
              <p className="text-[11px] text-slate-500">
                Yalnızca nitelik yazılır. Görev, firma ve yoklama aynı kalır.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || dirty.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-black disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Kaydediliyor…' : `Kaydet (${dirty.length})`}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad, TC, görev veya nitelik ara…"
              className="w-full text-xs border border-slate-200 rounded-xl py-2 pl-8 pr-3 bg-white"
            />
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(
              [
                ['tumu', 'Tümü'],
                ['ana', 'Saha'],
                ['idari', 'İdari'],
                ['taseron', 'Taşeron'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKadro(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                  kadro === key ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer px-2">
            <input
              type="checkbox"
              checked={sadeceBos}
              onChange={(e) => setSadeceBos(e.target.checked)}
              className="rounded border-slate-300 text-amber-600"
            />
            Yalnızca boş nitelik
          </label>
        </div>
        {status && (
          <p className={`text-[11px] font-semibold ${status.startsWith('Kayıt yazılamadı') ? 'text-rose-600' : 'text-emerald-700'}`}>
            {status}
          </p>
        )}
      </div>

      <datalist id="personel-nitelik-catalog">
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2">Ad soyad</th>
              <th className="px-3 py-2 w-32">TC</th>
              <th className="px-3 py-2">Görev (değişmez)</th>
              <th className="px-3 py-2 w-28">Grup</th>
              <th className="px-3 py-2 min-w-[240px]">Nitelik</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const draft = drafts[p.id] ?? String(p.nitelik || '');
              const changed = normNitelik(draft) !== normNitelik(p.nitelik || '');
              const grup = isIdariPersonel(p) ? 'İdari' : isTaseronPersonel(p) ? 'Taşeron' : 'Saha';
              return (
                <tr
                  key={p.id}
                  className={`border-b border-slate-100 ${changed ? 'bg-amber-50/70' : 'bg-white'} hover:bg-orange-50/40`}
                >
                  <td className="px-3 py-1.5 text-[10px] text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs font-bold text-slate-800">{personelAd(p)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-slate-600">{p.tcNo || '—'}</td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-600">
                    {displayPersonelGorev(p) || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase">{grup}</td>
                  <td className="px-3 py-1.5">
                    <input
                      list="personel-nitelik-catalog"
                      value={draft}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      placeholder="Örn. BEDEN İŞÇİSİ (İNŞAAT)"
                      className={`w-full text-xs border rounded-lg px-2 py-1.5 ${
                        changed ? 'border-amber-400 bg-white' : 'border-slate-200 bg-slate-50'
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="p-8 text-center text-xs text-slate-500 font-semibold">Bu süzgeçte aktif personel yok.</p>
        )}
      </div>
    </div>
  );
};

export default PersonelNitelikTopluPanel;
