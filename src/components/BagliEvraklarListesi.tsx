import React, { useMemo, useState } from 'react';
import { Link2, Edit3, Search, Eye } from 'lucide-react';
import { EvrakBaglantiGrubu, Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { deriveBaglantiGruplariFromEntities, irsaliyeIsLinked } from '../lib/evrakBaglamaUtils';
import { faturaIsLinked } from '../lib/documentLinkUtils';
import { EvrakDetayModal, EvrakDetayPayload } from './EvrakDetayModal';
import { EvrakImzaBar } from './EvrakImzaBar';
import { EvrakTabBilgi } from './EvrakTabBilgi';

interface BagliEvraklarListesiProps {
  mode: 'fatura' | 'irsaliye' | 'unified';
  accent: 'blue' | 'emerald';
  faturalar: Fatura[];
  irsaliyeler: Irsaliye[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  evrakBaglantiGruplari: EvrakBaglantiGrubu[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  onEditBinding?: (grup: EvrakBaglantiGrubu) => void;
}

export const BagliEvraklarListesi: React.FC<BagliEvraklarListesiProps> = ({
  mode,
  accent,
  faturalar,
  irsaliyeler,
  satinAlmaTalepleri,
  evrakBaglantiGruplari,
  setFaturalar,
  setIrsaliyeler,
  onEditBinding,
}) => {
  const [search, setSearch] = useState('');
  const [detayPayload, setDetayPayload] = useState<EvrakDetayPayload | null>(null);
  const accentBadge = accent === 'emerald' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-800 bg-slate-50';

  const gruplar = useMemo(
    () =>
      deriveBaglantiGruplariFromEntities(
        faturalar,
        irsaliyeler,
        satinAlmaTalepleri,
        evrakBaglantiGruplari
      ).filter((g) => {
        if (mode === 'fatura') return Boolean(g.faturaId);
        return g.irsaliyeIds.length > 0;
      }),
    [faturalar, irsaliyeler, satinAlmaTalepleri, evrakBaglantiGruplari, mode]
  );

  const filtered = gruplar.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const ft = g.faturaId ? faturalar.find((f) => f.id === g.faturaId) : null;
    return (
      g.saId?.toLowerCase().includes(q) ||
      g.cariUnvan?.toLowerCase().includes(q) ||
      ft?.faturaNo.toLowerCase().includes(q) ||
      g.irsaliyeIds.some((id) => {
        const ir = irsaliyeler.find((x) => x.id === id);
        return ir?.irsaliyeNo.toLowerCase().includes(q);
      })
    );
  });

  const bagimsizCount =
    mode === 'fatura'
      ? faturalar.filter((f) => !faturaIsLinked(f)).length
      : irsaliyeler.filter((ir) => !irsaliyeIsLinked(ir)).length;

  const handleFaturaImza = (faturaId: string, url: string, uyumsuz: boolean) => {
    setFaturalar?.((prev) =>
      prev.map((f) =>
        f.id === faturaId
          ? { ...f, imzaliEvrakUrl: url, imzaliEvrakUyumsuz: uyumsuz, durum: 'ONAYLANDI' }
          : f
      )
    );
  };

  const handleIrImza = (irId: string, url: string, uyumsuz: boolean) => {
    setIrsaliyeler?.((prev) =>
      prev.map((ir) =>
        ir.id === irId
          ? {
              ...ir,
              imzaliEvrakUrl: url,
              imzaliEvrakUyumsuz: uyumsuz,
              onayDurumu: '1. ONAY TAMAMLANDI',
            }
          : ir
      )
    );
  };

  return (
    <div className="space-y-4">
      <EvrakTabBilgi tab={mode === 'fatura' ? 'fatura-bagli' : 'irsaliye-bagli'} />

      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Bağlı Evraklar
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {filtered.length} bağlı grup · {bagimsizCount} bağımsız evrak
          </p>
        </div>
        <input
          type="search"
          placeholder="PO, fatura, irsaliye, firma ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs border rounded-xl px-3 py-2 w-full sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-12 bg-white border border-dashed border-slate-200 rounded-2xl">
          Henüz bağlı evrak yok. &quot;Bağlama&quot; sekmesinden 2 aşamalı bağlama yapın.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => {
            const ft = g.faturaId ? faturalar.find((f) => f.id === g.faturaId) : undefined;
            const irs = irsaliyeler.filter((ir) => g.irsaliyeIds.includes(ir.id));
            const sa = g.saId ? satinAlmaTalepleri.find((s) => s.saId === g.saId) : undefined;

            return (
              <div
                key={g.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3"
              >
                <div className="flex flex-col gap-2 border-l-4 border-violet-400 pl-3">
                  {sa && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${accentBadge}`}>
                        SA · {sa.saId}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetayPayload({ kind: 'sa', sa })}
                        className="text-[9px] font-bold text-violet-600 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> Detay
                      </button>
                    </div>
                  )}
                  {irs.map((ir) => (
                    <div key={ir.id} className="flex flex-wrap items-center gap-2 ml-2">
                      <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-1 rounded-lg">
                        İRS · {ir.irsaliyeNo}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetayPayload({ kind: 'irsaliye', irsaliye: ir })}
                        className="text-[9px] font-bold text-violet-600 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> Detay
                      </button>
                      {setIrsaliyeler && (
                        <EvrakImzaBar
                          compact
                          evrakNo={ir.irsaliyeNo}
                          evrakLabel="İrsaliye"
                          imzaliUrl={ir.imzaliEvrakUrl}
                          uyumsuz={ir.imzaliEvrakUyumsuz}
                          onaylandi={ir.onayDurumu === '1. ONAY TAMAMLANDI'}
                          onSignedUpload={(url, u) => handleIrImza(ir.id, url, u)}
                          onRemoveSigned={() =>
                            setIrsaliyeler((prev) =>
                              prev.map((x) =>
                                x.id === ir.id
                                  ? {
                                      ...x,
                                      imzaliEvrakUrl: undefined,
                                      imzaliEvrakUyumsuz: false,
                                      onayDurumu: 'ONAY BEKLİYOR',
                                    }
                                  : x
                              )
                            )
                          }
                          onESign={() => {
                            const email = window.prompt(
                              'E-İmza yetkilisi e-posta:\n- sametatak9@gmail.com\n- santiye@kibritci.com',
                              'sametatak9@gmail.com'
                            );
                            if (email === 'sametatak9@gmail.com' || email === 'santiye@kibritci.com') {
                              setIrsaliyeler((prev) =>
                                prev.map((x) =>
                                  x.id === ir.id
                                    ? {
                                        ...x,
                                        onayDurumu: '1. ONAY TAMAMLANDI',
                                        eImzalar: [
                                          ...(x.eImzalar || []),
                                          `E-İmza (${email})`,
                                        ],
                                      }
                                    : x
                                )
                              );
                            }
                          }}
                        />
                      )}
                    </div>
                  ))}
                  {ft && (
                    <div className="flex flex-wrap items-center gap-2 ml-2">
                      <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-900 px-2 py-1 rounded-lg">
                        FAT · {ft.faturaNo}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetayPayload({ kind: 'fatura', fatura: ft })}
                        className="text-[9px] font-bold text-violet-600 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> Detay
                      </button>
                      {setFaturalar && (
                        <EvrakImzaBar
                          compact
                          evrakNo={ft.faturaNo}
                          evrakLabel="Fatura"
                          imzaliUrl={ft.imzaliEvrakUrl}
                          uyumsuz={ft.imzaliEvrakUyumsuz}
                          onaylandi={ft.durum === 'ONAYLANDI'}
                          onSignedUpload={(url, u) => handleFaturaImza(ft.id, url, u)}
                          onRemoveSigned={() =>
                            setFaturalar((prev) =>
                              prev.map((x) =>
                                x.id === ft.id
                                  ? {
                                      ...x,
                                      imzaliEvrakUrl: undefined,
                                      imzaliEvrakUyumsuz: false,
                                      durum: 'KONTROL BEKLEYOR',
                                    }
                                  : x
                              )
                            )
                          }
                          onESign={() => {
                            const email = window.prompt(
                              'E-İmza yetkilisi e-posta:\n- sametatak9@gmail.com\n- santiye@kibritci.com',
                              'sametatak9@gmail.com'
                            );
                            if (email === 'sametatak9@gmail.com' || email === 'santiye@kibritci.com') {
                              setFaturalar((prev) =>
                                prev.map((x) =>
                                  x.id === ft.id
                                    ? {
                                        ...x,
                                        durum: 'ONAYLANDI',
                                        eImzalar: [
                                          ...(x.eImzalar || []),
                                          `E-İmza (${email})`,
                                        ],
                                      }
                                    : x
                                )
                              );
                            }
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs font-semibold text-slate-800">
                  {g.cariUnvan || ft?.cariUnvan || irs[0]?.firma || sa?.talepEden}
                </p>
                <span className="text-[10px] text-slate-400">{g.olusturmaTarihi}</span>

                {g.kalemBaglantilari.length > 0 && (
                  <div className="text-[10px] text-slate-600 bg-slate-50 rounded-xl p-3 space-y-1">
                    <p className="font-bold uppercase text-slate-500 mb-1">Kalem önizleme</p>
                    {g.kalemBaglantilari.slice(0, 5).map((k) => (
                      <p key={k.id}>
                        • {k.urunAdi}
                        {k.saMiktar != null && ` · SA:${k.saMiktar}`}
                        {k.irsaliyeMiktar != null && ` · İRS:${k.irsaliyeMiktar}`}
                        {k.faturaMiktar != null && ` · FAT:${k.faturaMiktar}`}
                        {k.birim && ` ${k.birim}`}
                      </p>
                    ))}
                    {g.kalemBaglantilari.length > 5 && (
                      <p className="text-slate-400">+{g.kalemBaglantilari.length - 5} kalem daha</p>
                    )}
                  </div>
                )}

                {onEditBinding && (
                  <button
                    type="button"
                    onClick={() => onEditBinding(g)}
                    className="text-[10px] font-bold flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" /> Bağlamayı düzenle
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EvrakDetayModal
        open={!!detayPayload}
        payload={detayPayload}
        onClose={() => setDetayPayload(null)}
      />
    </div>
  );
};
