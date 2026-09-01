import React, { useMemo, useState } from 'react';
import { Tags, Plus, Pencil, Trash2, X, Search, ShoppingCart, Truck, CreditCard } from 'lucide-react';
import type { EvrakEtiketGrubu, Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import {
  assignDocsToEtiketGrubu,
  createEvrakEtiketGrubu,
  evrakEtiketAramaHayir,
  findEtiketByAd,
  kalemOzeti,
  normalizeEtiketAd,
  removeDocFromEtiketGrubu,
  renameEvrakEtiketGrubu,
} from '../lib/evrakEtiketUtils';
import { EmptyState } from './EmptyState';
import { EvrakPageShell, EvrakSectionHeader } from './evrakUi/EvrakScreenChrome';
import { muhasebeInputClass } from './evrakUi/MuhasebeBelgeForm';

interface EvrakEtiketleriScreenProps {
  evrakEtiketGruplari: EvrakEtiketGrubu[];
  setEvrakEtiketGruplari: React.Dispatch<React.SetStateAction<EvrakEtiketGrubu[]>>;
  satinAlmaTalepleri: SatinAlmaTalebi[];
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  currentUser?: { email?: string };
  hydrated?: boolean;
}

type PickerKind = 'sa' | 'irsaliye' | 'fatura';

const input = muhasebeInputClass;

function formatTarih(iso?: string): string {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

export const EvrakEtiketleriScreen: React.FC<EvrakEtiketleriScreenProps> = ({
  evrakEtiketGruplari,
  setEvrakEtiketGruplari,
  satinAlmaTalepleri,
  irsaliyeler,
  faturalar,
  currentUser,
  hydrated = true,
}) => {
  const [yeniAd, setYeniAd] = useState('');
  const [yeniNitelik, setYeniNitelik] = useState('');
  const [yeniAciklama, setYeniAciklama] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameAd, setRenameAd] = useState('');

  const [pickerId, setPickerId] = useState<string | null>(null);
  const [pickerKind, setPickerKind] = useState<PickerKind>('fatura');
  const [pickerQ, setPickerQ] = useState('');

  const sorted = useMemo(
    () =>
      [...evrakEtiketGruplari].sort((a, b) =>
        a.ad.localeCompare(b.ad, 'tr-TR') || String(b.createdAt).localeCompare(String(a.createdAt))
      ),
    [evrakEtiketGruplari]
  );

  const saById = useMemo(() => {
    const m = new Map<string, SatinAlmaTalebi>();
    for (const s of satinAlmaTalepleri) {
      m.set(s.id, s);
      if (s.saId) m.set(s.saId, s);
    }
    return m;
  }, [satinAlmaTalepleri]);

  const irById = useMemo(() => {
    const m = new Map<string, Irsaliye>();
    for (const ir of irsaliyeler) {
      m.set(ir.id, ir);
      if (ir.irsaliyeId) m.set(ir.irsaliyeId, ir);
      if (ir.irsaliyeNo) m.set(ir.irsaliyeNo, ir);
    }
    return m;
  }, [irsaliyeler]);

  const ftById = useMemo(() => {
    const m = new Map<string, Fatura>();
    for (const ft of faturalar) {
      m.set(ft.id, ft);
      if (ft.faturaNo) m.set(ft.faturaNo, ft);
    }
    return m;
  }, [faturalar]);

  const flash = (ok?: string, err?: string) => {
    setFormOk(ok || null);
    setFormErr(err || null);
  };

  const olustur = () => {
    const ad = normalizeEtiketAd(yeniAd);
    if (!ad) {
      flash(undefined, 'Grup adı zorunlu. Örn. İnce Grubu siparişleri.');
      return;
    }
    if (findEtiketByAd(evrakEtiketGruplari, ad)) {
      flash(undefined, `"${ad}" adında bir etiket grubu zaten kayıtlı.`);
      return;
    }
    setBusy(true);
    try {
      const grup = createEvrakEtiketGrubu({
        ad,
        nitelik: yeniNitelik,
        aciklama: yeniAciklama,
        createdBy: currentUser?.email,
      });
      setEvrakEtiketGruplari((prev) => [grup, ...prev]);
      setYeniAd('');
      setYeniNitelik('');
      setYeniAciklama('');
      flash(`"${grup.ad}" oluşturuldu. Satın alma, irsaliye ve fatura ekleyebilirsiniz.`);
    } finally {
      setBusy(false);
    }
  };

  const sil = (g: EvrakEtiketGrubu) => {
    const n = g.saIds.length + g.irsaliyeIds.length + g.faturaIds.length;
    const ok = window.confirm(
      n
        ? `"${g.ad}" grubunu silmek istiyor musunuz? ${n} evrak etiketten çıkarılır; evrak kayıtları silinmez.`
        : `"${g.ad}" grubunu silmek istiyor musunuz?`
    );
    if (!ok) return;
    setEvrakEtiketGruplari((prev) => prev.filter((x) => x.id !== g.id));
    flash(`"${g.ad}" silindi. Evraklar arşivlerinde duruyor.`);
  };

  const kaydetRename = (id: string) => {
    const result = renameEvrakEtiketGrubu(evrakEtiketGruplari, id, renameAd);
    if (result.error) {
      flash(undefined, result.error);
      return;
    }
    setEvrakEtiketGruplari(result.next);
    setRenameId(null);
    flash('Grup adı güncellendi.');
  };

  const cikar = (grupId: string, kind: PickerKind, docId: string) => {
    setEvrakEtiketGruplari((prev) =>
      prev.map((g) => (g.id === grupId ? removeDocFromEtiketGrubu(g, kind, docId) : g))
    );
  };

  const ekle = (grupId: string, kind: PickerKind, docId: string, extra?: { saIds?: string[] }) => {
    setEvrakEtiketGruplari((prev) =>
      assignDocsToEtiketGrubu(prev, {
        grupId,
        saIds: kind === 'sa' ? [docId, ...(extra?.saIds || [])] : extra?.saIds,
        irsaliyeIds: kind === 'irsaliye' ? [docId] : undefined,
        faturaIds: kind === 'fatura' ? [docId] : undefined,
      })
    );
    setPickerQ('');
  };

  const pickerRows = (g: EvrakEtiketGrubu) => {
    const q = pickerQ;
    if (pickerKind === 'sa') {
      return satinAlmaTalepleri
        .filter((s) => !g.saIds.includes(s.id) && !g.saIds.includes(s.saId))
        .filter((s) => evrakEtiketAramaHayir(q, s.saId, s.cariFirma, s.talepEden))
        .slice(0, 12)
        .map((s) => ({
          id: s.id,
          title: s.saId,
          sub: s.cariFirma,
          extra: formatTarih(s.tarih),
        }));
    }
    if (pickerKind === 'irsaliye') {
      return irsaliyeler
        .filter((ir) => !g.irsaliyeIds.includes(ir.id))
        .filter((ir) => evrakEtiketAramaHayir(q, ir.irsaliyeNo, ir.firma, ir.irsaliyeId))
        .slice(0, 12)
        .map((ir) => ({
          id: ir.id,
          title: ir.irsaliyeNo,
          sub: ir.firma,
          extra: formatTarih(ir.tarih),
        }));
    }
    return faturalar
      .filter((ft) => !g.faturaIds.includes(ft.id))
      .filter((ft) => evrakEtiketAramaHayir(q, ft.faturaNo, ft.cariUnvan))
      .slice(0, 12)
      .map((ft) => ({
        id: ft.id,
        title: ft.faturaNo,
        sub: ft.cariUnvan,
        extra: formatTarih(ft.tarih),
      }));
  };

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="sa"
        eyebrow="Nitelik takibi"
        title="Evrak etiketleri"
        subtitle="İnce, mıcır, demir gibi adlandırılmış klasörler. Satın alma, irsaliye ve fatura aynı etiketin altında kalem özetiyle durur. Evrak Bağlama zinciri değildir."
      />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-700 leading-relaxed">
        <strong className="text-slate-900">Ne işe yarar:</strong> Aynı niteliği (ör. İnce Grubu siparişleri)
        tek isim altında toplarsınız. Zincir bağlama evrakları birbirine kilitler; etiket klasörü ise kalem /
        malzeme cinsine göre takip içindir. Gruplar Firestore’da saklanır.
      </div>

      {formErr ? (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{formErr}</p>
      ) : null}
      {formOk ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{formOk}</p>
      ) : null}

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">Yeni etiket grubu</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Grup adı *
            <input
              className={input}
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              placeholder="Örn. İnce Grubu siparişleri"
              onKeyDown={(e) => e.key === 'Enter' && olustur()}
            />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Nitelik
            <input
              className={input}
              value={yeniNitelik}
              onChange={(e) => setYeniNitelik(e.target.value)}
              placeholder="Örn. İnce · 0–5 mm"
            />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500 sm:col-span-2 lg:col-span-1">
            Açıklama
            <input
              className={input}
              value={yeniAciklama}
              onChange={(e) => setYeniAciklama(e.target.value)}
              placeholder="İsteğe bağlı not"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy}
              onClick={olustur}
              className="w-full text-xs font-bold px-3 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              Grubu oluştur
            </button>
          </div>
        </div>
      </section>

      {!hydrated && sorted.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-10 text-center text-xs text-slate-500">
          Etiket grupları yükleniyor…
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Henüz etiket grubu yok"
          description="Malzeme niteliğine göre bir klasör açın — İnce, Mıcır, Demir. Sonra satın alma, irsaliye ve faturayı bu listenin altına ekleyin."
          actionLabel="Yukarıdaki formu doldurun"
          onAction={() => {
            const el = document.querySelector<HTMLInputElement>('input[placeholder="Örn. İnce Grubu siparişleri"]');
            el?.focus();
          }}
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((g) => {
            const pickerOpen = pickerId === g.id;
            const rows = pickerOpen ? pickerRows(g) : [];
            return (
              <article key={g.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <header className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-gradient-to-r from-white to-slate-50/80">
                  <div className="min-w-0 space-y-0.5">
                    {renameId === g.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className={`${input} max-w-xs`}
                          value={renameAd}
                          onChange={(e) => setRenameAd(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && kaydetRename(g.id)}
                        />
                        <button
                          type="button"
                          onClick={() => kaydetRename(g.id)}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white cursor-pointer"
                        >
                          Kaydet
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenameId(null)}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-900 truncate">{g.ad}</h3>
                    )}
                    <p className="text-[11px] text-slate-500">
                      {g.nitelik ? <span className="font-semibold text-slate-700">{g.nitelik} · </span> : null}
                      {g.saIds.length} SA · {g.irsaliyeIds.length} irsaliye · {g.faturaIds.length} fatura
                      {g.aciklama ? ` · ${g.aciklama}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRenameId(g.id);
                        setRenameAd(g.ad);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" /> Yeniden adlandır
                    </button>
                    <button
                      type="button"
                      onClick={() => sil(g)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Sil
                    </button>
                  </div>
                </header>

                <div className="p-3 sm:p-4 space-y-3">
                  <EtiketDocBlock
                    kind="sa"
                    title="Satın alma"
                    icon={<ShoppingCart className="w-3.5 h-3.5" />}
                    empty="Bu etiket altında satın alma yok."
                    rows={g.saIds.map((id) => {
                      const s = saById.get(id);
                      return {
                        id,
                        no: s?.saId || id,
                        firma: s?.cariFirma || (s ? '' : 'Kayıt listede yok'),
                        tarih: formatTarih(s?.tarih),
                        ozet: s ? kalemOzeti(s.kalemler) : '—',
                      };
                    })}
                    onRemove={(id) => cikar(g.id, 'sa', id)}
                  />
                  <EtiketDocBlock
                    kind="irsaliye"
                    title="İrsaliye"
                    icon={<Truck className="w-3.5 h-3.5" />}
                    empty="Bu etiket altında irsaliye yok."
                    rows={g.irsaliyeIds.map((id) => {
                      const ir = irById.get(id);
                      return {
                        id,
                        no: ir?.irsaliyeNo || id,
                        firma: ir?.firma || (ir ? '' : 'Kayıt listede yok'),
                        tarih: formatTarih(ir?.tarih),
                        ozet: ir ? kalemOzeti(ir.kalemler) : '—',
                      };
                    })}
                    onRemove={(id) => cikar(g.id, 'irsaliye', id)}
                  />
                  <EtiketDocBlock
                    kind="fatura"
                    title="Fatura"
                    icon={<CreditCard className="w-3.5 h-3.5" />}
                    empty="Bu etiket altında fatura yok."
                    rows={g.faturaIds.map((id) => {
                      const ft = ftById.get(id);
                      return {
                        id,
                        no: ft?.faturaNo || id,
                        firma: ft?.cariUnvan || (ft ? '' : 'Kayıt listede yok'),
                        tarih: formatTarih(ft?.tarih),
                        ozet: ft ? kalemOzeti(ft.kalemler) : '—',
                      };
                    })}
                    onRemove={(id) => cikar(g.id, 'fatura', id)}
                  />

                  <div className="rounded-xl border border-dashed border-slate-200 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Evrak ekle
                      </span>
                      {(
                        [
                          ['sa', 'Satın alma'],
                          ['irsaliye', 'İrsaliye'],
                          ['fatura', 'Fatura'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setPickerId(g.id);
                            setPickerKind(id);
                            setPickerQ('');
                          }}
                          className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                            pickerOpen && pickerKind === id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      {pickerOpen ? (
                        <button
                          type="button"
                          onClick={() => setPickerId(null)}
                          className="ml-auto text-[10px] font-bold text-slate-500 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" /> Kapat
                        </button>
                      ) : null}
                    </div>
                    {pickerOpen ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            className="w-full text-[11px] font-semibold pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400"
                            value={pickerQ}
                            onChange={(e) => setPickerQ(e.target.value)}
                            placeholder="Numara veya firma ara…"
                          />
                        </div>
                        <div className="max-h-48 overflow-auto border border-slate-100 rounded-xl">
                          {rows.length === 0 ? (
                            <p className="p-3 text-[11px] text-slate-400 text-center">
                              Eşleşen evrak yok veya hepsi bu grupta.
                            </p>
                          ) : (
                            rows.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => ekle(g.id, pickerKind, r.id)}
                                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                              >
                                <span className="font-semibold shrink-0">{r.title}</span>
                                <span className="text-slate-500 truncate">{r.sub}</span>
                                <span className="ml-auto text-slate-400 shrink-0">{r.extra}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </EvrakPageShell>
  );
};

function EtiketDocBlock({
  kind,
  title,
  icon,
  empty,
  rows,
  onRemove,
}: {
  kind: PickerKind;
  title: string;
  icon: React.ReactNode;
  empty: string;
  rows: { id: string; no: string; firma: string; tarih: string; ozet: string }[];
  onRemove: (id: string) => void;
}) {
  const bar =
    kind === 'sa' ? 'bg-amber-400' : kind === 'irsaliye' ? 'bg-emerald-400' : 'bg-sky-400';
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80">
        <span className={`w-1.5 h-1.5 rounded-full ${bar}`} />
        {icon}
        <h4 className="text-[10px] font-black uppercase tracking-wide text-slate-600">
          {title} ({rows.length})
        </h4>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-2.5 text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {rows.map((r) => (
            <li key={`${kind}-${r.id}`} className="px-3 py-2 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-800">
                  {r.no}
                  <span className="font-medium text-slate-500"> · {r.firma || '—'}</span>
                  <span className="font-medium text-slate-400"> · {r.tarih}</span>
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">{r.ozet}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="self-start text-[10px] font-bold text-slate-500 hover:text-rose-700 cursor-pointer"
              >
                Çıkar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EvrakEtiketleriScreen;
