import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { PARSEL_LIST, blokListForParsel } from '../data/parselBlokMap';
import { db, removeDocument, saveDocument } from '../lib/firebase';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { todayDateKey } from '../lib/dateKeyUtils';
import {
  PROJE_ILERLEME_DURUM_LABEL,
  PROJE_ILERLEME_KOVALAR,
  PROJE_ILERLEME_KOVA_LABEL,
  calcKapanisYuzde,
  calcKovaYuzde,
  kirmiziListe,
  newProjeIlerlemeId,
  sortKalemler,
} from '../lib/projeIlerlemeUtils';
import type { ProjeIlerlemeDurum, ProjeIlerlemeKalemi, ProjeIlerlemeKova } from '../types/erp';

const COLLECTION = 'projeIlerlemeKalemleri';
const PARSEL_SECENEK = PARSEL_LIST.filter((p) => p !== 'GENEL SAHA');

type Props = {
  currentUser?: { email?: string; ad?: string; soyad?: string; displayName?: string } | null;
};

type Draft = {
  parsel: string;
  blok: string;
  baslik: string;
  kova: ProjeIlerlemeKova;
  durum: ProjeIlerlemeDurum;
  agirlik: 1 | 2 | 3;
  kirmiziEngel: boolean;
  hedefTarih: string;
  sorumlu: string;
  engel: string;
  not: string;
};

function emptyDraft(parsel = PARSEL_SECENEK[0] || ''): Draft {
  const bloklar = blokListForParsel(parsel).filter((b) => b !== 'GENEL SAHA');
  return {
    parsel,
    blok: bloklar[0] || '',
    baslik: '',
    kova: 'EKSIK_IMALAT',
    durum: 'ACIK',
    agirlik: 2,
    kirmiziEngel: false,
    hedefTarih: '',
    sorumlu: '',
    engel: '',
    not: '',
  };
}

function userLabel(u: Props['currentUser']): string {
  if (!u) return '';
  const name = [u.ad, u.soyad].filter(Boolean).join(' ').trim();
  return name || u.displayName || u.email || '';
}

function durumTone(d: ProjeIlerlemeDurum): string {
  if (d === 'KAPANDI') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (d === 'DEVAM') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (d === 'BEKLEMEDE') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-rose-50 text-rose-800 border-rose-200';
}

export const ProjeIlerlemeScreen: React.FC<Props> = ({ currentUser }) => {
  const [kalemler, setKalemler] = useState<ProjeIlerlemeKalemi[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [filtreParsel, setFiltreParsel] = useState('');
  const [filtreKova, setFiltreKova] = useState<ProjeIlerlemeKova | ''>('');
  const [filtreDurum, setFiltreDurum] = useState<ProjeIlerlemeDurum | ''>('');
  const [sadeceAcik, setSadeceAcik] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        const rows: ProjeIlerlemeKalemi[] = snap.docs.map((d) => {
          const data = d.data() as Omit<ProjeIlerlemeKalemi, 'id'>;
          return { ...data, id: d.id };
        });
        setKalemler(rows);
        setLoading(false);
      },
      (err) => {
        console.error('[proje-ilerleme] snapshot', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const kapanisYuzde = useMemo(() => calcKapanisYuzde(kalemler), [kalemler]);
  const kirmizilar = useMemo(() => kirmiziListe(kalemler), [kalemler]);
  const kovaOzet = useMemo(
    () => PROJE_ILERLEME_KOVALAR.map((kova) => ({ kova, ...calcKovaYuzde(kalemler, kova) })),
    [kalemler]
  );

  const filtered = useMemo(() => {
    return kalemler
      .filter((k) => {
        if (filtreParsel && k.parsel !== filtreParsel) return false;
        if (filtreKova && k.kova !== filtreKova) return false;
        if (filtreDurum && k.durum !== filtreDurum) return false;
        if (sadeceAcik && k.durum === 'KAPANDI') return false;
        return true;
      })
      .slice()
      .sort(sortKalemler);
  }, [kalemler, filtreParsel, filtreKova, filtreDurum, sadeceAcik]);

  const draftBloklar = useMemo(
    () => blokListForParsel(draft.parsel).filter((b) => b !== 'GENEL SAHA'),
    [draft.parsel]
  );

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(filtreParsel || PARSEL_SECENEK[0] || ''));
    setModalOpen(true);
  };

  const openEdit = (k: ProjeIlerlemeKalemi) => {
    setEditingId(k.id);
    setDraft({
      parsel: k.parsel,
      blok: k.blok,
      baslik: k.baslik,
      kova: k.kova,
      durum: k.durum,
      agirlik: k.agirlik || 2,
      kirmiziEngel: Boolean(k.kirmiziEngel),
      hedefTarih: k.hedefTarih || '',
      sorumlu: k.sorumlu || '',
      engel: k.engel || '',
      not: k.not || '',
    });
    setModalOpen(true);
  };

  const persist = async () => {
    const baslik = draft.baslik.trim();
    if (!baslik) {
      alert('İş başlığı zorunlu.');
      return;
    }
    if (!draft.parsel || !draft.blok) {
      alert('Parsel ve blok seçin.');
      return;
    }
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      const now = todayDateKey();
      const id = editingId || newProjeIlerlemeId();
      const prev = editingId ? kalemler.find((k) => k.id === editingId) : undefined;
      const payload: ProjeIlerlemeKalemi = {
        id,
        parsel: draft.parsel,
        blok: draft.blok,
        baslik,
        kova: draft.kova,
        durum: draft.durum,
        agirlik: draft.agirlik,
        kirmiziEngel: draft.kirmiziEngel,
        hedefTarih: draft.hedefTarih || undefined,
        sorumlu: draft.sorumlu.trim() || undefined,
        engel: draft.engel.trim() || undefined,
        not: draft.not.trim() || undefined,
        olusturmaTarihi: prev?.olusturmaTarihi || now,
        guncellemeTarihi: now,
        olusturan: prev?.olusturan || userLabel(currentUser) || undefined,
      };
      await saveDocument(COLLECTION, payload);
      setModalOpen(false);
      setEditingId(null);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Kayıt yazılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const markKapandi = async (k: ProjeIlerlemeKalemi) => {
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      await saveDocument(COLLECTION, {
        ...k,
        durum: 'KAPANDI',
        guncellemeTarihi: todayDateKey(),
      } as ProjeIlerlemeKalemi);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const removeKalem = async (k: ProjeIlerlemeKalemi) => {
    if (!confirm(`«${k.baslik}» silinsin mi?`)) return;
    setSaving(true);
    try {
      const authBlock = await assertErpWriteAuth();
      if (authBlock) throw new Error(authBlock);
      await removeDocument(COLLECTION, k.id);
    } catch (err) {
      alert(formatFirestoreWriteError(err) || 'Silinemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-50 via-white to-amber-50/40 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800/80">
              Kapanış · Punch · Kuşbakışı
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">Proje İlerlemesi</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              2 yıllık şantiye yüzdesi değil — bitişe kalan işlerin listesi. Yüzde = ağırlıklı punch
              (giriş–çıkış / yoklama değil). Gün içinde ilettiğiniz ilerlemeyi buraya işleyin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-center shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Kapanış</div>
              <div className="text-3xl font-black tabular-nums text-stone-900">{kapanisYuzde}%</div>
              <div className="text-[10px] text-stone-500">
                {kalemler.filter((k) => k.durum === 'KAPANDI').length}/{kalemler.length} madde
              </div>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-stone-800"
            >
              <Plus size={16} /> Yeni madde
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {kovaOzet.map(({ kova, yuzde, acik, toplam }) => (
            <button
              key={kova}
              type="button"
              onClick={() => setFiltreKova((prev) => (prev === kova ? '' : kova))}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                filtreKova === kova
                  ? 'border-amber-400 bg-amber-50 shadow-sm'
                  : 'border-stone-200 bg-white/80 hover:border-stone-300'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                {PROJE_ILERLEME_KOVA_LABEL[kova]}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xl font-black tabular-nums text-stone-900">{toplam ? yuzde : 0}%</span>
                <span className="text-[10px] font-semibold text-stone-500">
                  {acik} açık / {toplam}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${toplam ? yuzde : 0}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {kirmizilar.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
          <div className="mb-2 flex items-center gap-2 text-rose-900">
            <AlertTriangle size={16} />
            <span className="text-xs font-black uppercase tracking-wide">
              Kırmızı liste — teslimi bloke ({kirmizilar.length})
            </span>
          </div>
          <ul className="space-y-1.5">
            {kirmizilar.slice(0, 12).map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 text-sm text-rose-950">
                <span className="font-bold">
                  {k.parsel.replace('Parsel Bölge ', '')} · {k.blok}
                </span>
                <span className="text-rose-800/80">—</span>
                <button
                  type="button"
                  onClick={() => openEdit(k)}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {k.baslik}
                </button>
                {k.engel && <span className="text-xs text-rose-700">({k.engel})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <Filter size={14} className="text-stone-400" />
        <select
          value={filtreParsel}
          onChange={(e) => setFiltreParsel(e.target.value)}
          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
        >
          <option value="">Tüm parseller</option>
          {PARSEL_SECENEK.map((p) => (
            <option key={p} value={p}>
              {p.replace('Parsel Bölge ', '')}
            </option>
          ))}
        </select>
        <select
          value={filtreKova}
          onChange={(e) => setFiltreKova(e.target.value as ProjeIlerlemeKova | '')}
          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
        >
          <option value="">Tüm kovalar</option>
          {PROJE_ILERLEME_KOVALAR.map((k) => (
            <option key={k} value={k}>
              {PROJE_ILERLEME_KOVA_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          value={filtreDurum}
          onChange={(e) => setFiltreDurum(e.target.value as ProjeIlerlemeDurum | '')}
          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold"
        >
          <option value="">Tüm durumlar</option>
          {(Object.keys(PROJE_ILERLEME_DURUM_LABEL) as ProjeIlerlemeDurum[]).map((d) => (
            <option key={d} value={d}>
              {PROJE_ILERLEME_DURUM_LABEL[d]}
            </option>
          ))}
        </select>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-bold text-stone-600">
          <input
            type="checkbox"
            checked={sadeceAcik}
            onChange={(e) => setSadeceAcik(e.target.checked)}
            className="rounded border-stone-300"
          />
          Sadece açıklar
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-stone-500">Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div className="space-y-3 p-10 text-center">
            <Target className="mx-auto text-stone-300" size={36} />
            <p className="text-sm font-semibold text-stone-700">Henüz punch maddesi yok</p>
            <p className="mx-auto max-w-md text-xs text-stone-500">
              Gün içinde ilettiğiniz eksik imalat / tadilat / peyzaj maddelerini «Yeni madde» ile
              ekleyin. Kova yüzdeleri otomatik oluşur.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"
            >
              <Plus size={14} /> İlk maddeyi ekle
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-stone-100 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2.5">Yer</th>
                  <th className="px-3 py-2.5">İş</th>
                  <th className="px-3 py-2.5">Kova</th>
                  <th className="px-3 py-2.5">Durum</th>
                  <th className="px-3 py-2.5 text-center">Ağırlık</th>
                  <th className="px-3 py-2.5">Hedef</th>
                  <th className="px-3 py-2.5">Sorumlu / Engel</th>
                  <th className="px-3 py-2.5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => (
                  <tr
                    key={k.id}
                    className={`border-t border-stone-100 hover:bg-stone-50/80 ${
                      k.kirmiziEngel && k.durum !== 'KAPANDI' ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-bold text-stone-800 whitespace-nowrap">
                      {String(k.parsel || '').replace('Parsel Bölge ', '')}
                      <span className="text-stone-400"> · </span>
                      {k.blok}
                      {k.kirmiziEngel && k.durum !== 'KAPANDI' && (
                        <span className="ml-1 inline-flex rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-800">
                          KRİTİK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openEdit(k)}
                        className="font-semibold text-stone-900 hover:underline"
                      >
                        {k.baslik}
                      </button>
                      {k.not && <div className="mt-0.5 text-[10px] text-stone-500 line-clamp-1">{k.not}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-stone-700">{PROJE_ILERLEME_KOVA_LABEL[k.kova]}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${durumTone(k.durum)}`}>
                        {PROJE_ILERLEME_DURUM_LABEL[k.durum]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-stone-700">{k.agirlik}</td>
                    <td className="px-3 py-2.5 font-mono text-stone-600">{k.hedefTarih || '—'}</td>
                    <td className="px-3 py-2.5 text-stone-600">
                      <div>{k.sorumlu || '—'}</div>
                      {k.engel && <div className="text-[10px] text-rose-700">{k.engel}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        {k.durum !== 'KAPANDI' && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void markKapandi(k)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-800 hover:bg-emerald-100"
                            title="Kapandı işaretle"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void removeKalem(k)}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                          title="Sil"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-3 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-stone-100 bg-white px-4 py-3">
              <h2 className="text-sm font-black text-stone-900">
                {editingId ? 'Maddeyi düzenle' : 'Yeni punch maddesi'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Parsel</label>
                  <select
                    value={draft.parsel}
                    onChange={(e) => {
                      const parsel = e.target.value;
                      const bloklar = blokListForParsel(parsel).filter((b) => b !== 'GENEL SAHA');
                      setDraft((d) => ({ ...d, parsel, blok: bloklar[0] || '' }));
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {PARSEL_SECENEK.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Blok</label>
                  <select
                    value={draft.blok}
                    onChange={(e) => setDraft((d) => ({ ...d, blok: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {draftBloklar.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">İş başlığı *</label>
                <input
                  value={draft.baslik}
                  onChange={(e) => setDraft((d) => ({ ...d, baslik: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold"
                  placeholder="Örn. C2 cephe boya tadilat / A1 peyzaj sulama"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Kova</label>
                  <select
                    value={draft.kova}
                    onChange={(e) => setDraft((d) => ({ ...d, kova: e.target.value as ProjeIlerlemeKova }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {PROJE_ILERLEME_KOVALAR.map((k) => (
                      <option key={k} value={k}>
                        {PROJE_ILERLEME_KOVA_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Durum</label>
                  <select
                    value={draft.durum}
                    onChange={(e) => setDraft((d) => ({ ...d, durum: e.target.value as ProjeIlerlemeDurum }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    {(Object.keys(PROJE_ILERLEME_DURUM_LABEL) as ProjeIlerlemeDurum[]).map((d) => (
                      <option key={d} value={d}>
                        {PROJE_ILERLEME_DURUM_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Ağırlık (1–3)</label>
                  <select
                    value={draft.agirlik}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, agirlik: Number(e.target.value) as 1 | 2 | 3 }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  >
                    <option value={1}>1 — kolay</option>
                    <option value={2}>2 — normal</option>
                    <option value={3}>3 — kritik</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500">Hedef tarih</label>
                  <input
                    type="date"
                    value={draft.hedefTarih}
                    onChange={(e) => setDraft((d) => ({ ...d, hedefTarih: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-semibold"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs font-bold text-rose-900">
                <input
                  type="checkbox"
                  checked={draft.kirmiziEngel}
                  onChange={(e) => setDraft((d) => ({ ...d, kirmiziEngel: e.target.checked }))}
                />
                Teslimi bloke eden kırmızı madde
              </label>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">Sorumlu</label>
                <input
                  value={draft.sorumlu}
                  onChange={(e) => setDraft((d) => ({ ...d, sorumlu: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold"
                  placeholder="Mühendis / taşeron / ekip"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">Engel</label>
                <input
                  value={draft.engel}
                  onChange={(e) => setDraft((d) => ({ ...d, engel: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold"
                  placeholder="Malzeme / karar / işçilik / onay…"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500">Not</label>
                <textarea
                  value={draft.not}
                  onChange={(e) => setDraft((d) => ({ ...d, not: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-stone-100 bg-white p-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-xs font-bold text-stone-700"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist()}
                className="flex-1 rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjeIlerlemeScreen;
