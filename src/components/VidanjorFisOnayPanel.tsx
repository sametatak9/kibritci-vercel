import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck, Check, X, Pencil, RefreshCw, Camera, AlertTriangle, History, Search, Trash2
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { CariKart, CariKartIslem, Fatura, Irsaliye, SatinAlmaTalebi, VidanjorFis } from '../types/erp';
import { db } from '../lib/firebase';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { SEKER_VIDANJOR_UNVAN, findSekerVidanjorCari } from '../lib/vidanjorUtils';
import {
  approveVidanjorFis,
  isVidanjorFisPending,
  rejectVidanjorFis,
} from '../lib/vidanjorOnayUtils';
import { findMatchingVidanjorSatinAlma } from '../lib/tankerEvrakDonusum';
import { deleteVidanjorFisCascade, fisDurumLabel } from '../lib/fisGecmisUtils';

interface VidanjorFisOnayPanelProps {
  currentUser: any;
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  /** @deprecated Onayda fatura oluşturulmaz; Cari Kartlar → Geçmiş İrsaliyeler'den dönüştürülür. */
  faturalar?: Fatura[];
  /** @deprecated Onayda fatura oluşturulmaz. */
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
}

export const VidanjorFisOnayPanel: React.FC<VidanjorFisOnayPanelProps> = ({
  currentUser,
  cariKartlar,
  setCariKartlar,
  setIrsaliyeler,
  setCariIslemGecmisi,
  satinAlmaTalepleri = [],
  irsaliyeler = [],
  addNotification,
}) => {
  const [fisler, setFisler] = useState<VidanjorFis[]>([]);
  const [editing, setEditing] = useState<VidanjorFis | null>(null);
  const [tarih, setTarih] = useState('');
  const [fisNo, setFisNo] = useState('');
  const [plaka, setPlaka] = useState('');
  const [cekimAdedi, setCekimAdedi] = useState('');
  const [saving, setSaving] = useState(false);
  const [listMode, setListMode] = useState<'bekleyen' | 'gecmis'>('bekleyen');
  const [gecmisArama, setGecmisArama] = useState('');

  const sekerCari = useMemo(() => findSekerVidanjorCari(cariKartlar), [cariKartlar]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vidanjorFisleri'), (snap) => {
      const list: VidanjorFis[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<VidanjorFis, 'id'>) }));
      list.sort((a, b) => String(b.olusturulma || '').localeCompare(String(a.olusturulma || '')));
      setFisler(list);
    });
    return () => unsub();
  }, []);

  const pending = useMemo(() => fisler.filter((f) => isVidanjorFisPending(f)), [fisler]);
  const gecmis = useMemo(() => fisler.filter((f) => !isVidanjorFisPending(f)), [fisler]);
  const filteredGecmis = useMemo(() => {
    const q = gecmisArama.trim().toLowerCase();
    if (!q) return gecmis;
    return gecmis.filter((f) =>
      [f.fisNo, f.plaka, f.tarih, f.kaydeden, f.firmaUnvan, f.durum]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
        .includes(q)
    );
  }, [gecmis, gecmisArama]);
  const visibleList = listMode === 'bekleyen' ? pending : filteredGecmis;
  const editingApproved = editing?.durum === 'ONAYLANDI';

  const openEdit = (f: VidanjorFis) => {
    setEditing(f);
    setTarih(f.tarih);
    setFisNo(f.fisNo);
    setPlaka(f.plaka);
    setCekimAdedi(String(f.cekimAdedi));
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const cekim = Number(cekimAdedi);
    if (!fisNo.trim() || !plaka.trim() || !Number.isFinite(cekim) || cekim <= 0 || !tarih) {
      alert('Tarih, fiş no, plaka ve çekim adedi zorunlu.');
      return;
    }
    if (
      !window.confirm(
        editingApproved
          ? 'Onaylı kayıt güncellenecek. İrsaliye ve cari geçmişi de yazılır. Devam?'
          : 'Onaylanınca irsaliye + cari kaydı oluşur (MICIR/güvenlik döngüsü). Satın alma varsa soft bağlanır. Devam?'
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const previewSa = findMatchingVidanjorSatinAlma(satinAlmaTalepleri, irsaliyeler, {
        preferredSaId: editing.saId,
        preferredSaKalemId: editing.saKalemId,
      });
      const result = await approveVidanjorFis({
        fis: editing,
        correction: {
          tarih,
          fisNo: fisNo.trim().toUpperCase(),
          plaka: plaka.trim().toUpperCase(),
          cekimAdedi: cekim,
          fisGorselUrl: editing.fisGorselUrl,
          firmaUnvan: sekerCari?.unvan || editing.firmaUnvan || SEKER_VIDANJOR_UNVAN,
          cariKartId: sekerCari?.id || editing.cariKartId,
          saId: previewSa?.sa.saId || editing.saId,
          saKalemId: previewSa?.kalem.id || editing.saKalemId,
        },
        onaylayan: currentUser?.email || 'yonetici',
        cariKartlar,
        satinAlmaTalepleri,
        irsaliyeler,
        setCariKartlar,
        setIrsaliyeler,
        setCariIslemGecmisi,
      });

      // Giriş her zaman irsaliye olarak kalır; fatura Cari Kartlar → Geçmiş İrsaliyeler'den seçilerek birleştirilir.
      await addNotification?.(
        `Vidanjör fişi onaylandı: ${result.fis.fisNo} · irsaliye`,
        {
          tip: 'VIDANJOR_FIS_ONAYLANDI',
          vidanjorFisId: result.fis.id,
          irsaliyeId: result.irsaliye.id,
          cariKartId: result.cariIslem.cariKartId,
          saId: result.saMatch?.sa.saId,
        }
      );

      alert(
        editingApproved
          ? `Güncellendi — irsaliye: ${result.irsaliye.irsaliyeNo}`
          : `Onaylandı — irsaliye olarak kaydedildi.\n\n1) İrsaliye: ${result.irsaliye.irsaliyeNo}\n2) Cari: ${result.fis.firmaUnvan}${
              result.saMatch ? `\n3) SA: ${result.saMatch.sa.saId}` : ''
            }\n\nFatura için: Cari Kartlar → ${result.fis.firmaUnvan || 'Şeker Vidanjör'} → Geçmiş İrsaliyeler listesinden bir veya birden fazla irsaliye seçip faturaya dönüştürebilirsiniz.`
      );
      setEditing(null);
    } catch (err: any) {
      console.error(err);
      alert('Onay başarısız: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f: VidanjorFis) => {
    const extra =
      f.durum === 'ONAYLANDI'
        ? '\n\nOnaylı irsaliye ve cari kaydı da silinecek.'
        : '';
    if (!window.confirm(`${f.fisNo} nolu fiş silinsin mi?${extra}`)) return;
    try {
      await deleteVidanjorFisCascade({
        fis: f,
        irsaliyeler,
        setIrsaliyeler,
        setCariIslemGecmisi,
      });
      await addNotification?.(
        `Vidanjör fişi silindi: ${f.fisNo}`,
        { tip: 'VIDANJOR_FIS_SILINDI', vidanjorFisId: f.id }
      );
      if (editing?.id === f.id) setEditing(null);
    } catch (err: any) {
      alert('Silinemedi: ' + (err?.message || ''));
    }
  };

  const handleReject = async (f: VidanjorFis) => {
    const neden = window.prompt('Red nedeni (opsiyonel):') || '';
    if (!window.confirm(`${f.fisNo} nolu fiş reddedilsin mi?`)) return;
    try {
      await rejectVidanjorFis({
        fis: f,
        onaylayan: currentUser?.email || 'yonetici',
        redNedeni: neden,
      });
      await addNotification?.(
        `Vidanjör fişi reddedildi: ${f.fisNo}${neden ? ` · ${neden}` : ''}`,
        { tip: 'VIDANJOR_FIS_REDDEDILDI', vidanjorFisId: f.id }
      );
      if (editing?.id === f.id) setEditing(null);
    } catch (err: any) {
      alert('Red başarısız: ' + (err?.message || ''));
    }
  };

  return (
    <div className="space-y-4">
      <div className="border bg-indigo-950 p-4.5 rounded-2xl border-indigo-800/80 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-indigo-200 font-bold block text-[11px] tracking-widest uppercase flex items-center gap-1.5">
              <Truck size={13} /> Kampçı Vidanjör Fiş Onayı
            </span>
            <p className="text-indigo-100/80 leading-relaxed text-[11px]">
              Kampçı kaydı buraya düşer. Onayda <strong>irsaliye + cari</strong> oluşur; satın alma
              varsa soft bağlanır. İsterseniz aynı anda <strong>taslak fatura</strong> da
              oluşturulabilir (kilit yok).
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-black bg-amber-400 text-slate-950 px-2.5 py-1 rounded-full">
            {pending.length} bekleyen
          </span>
        </div>
        <div className="flex gap-1.5 mt-3">
          <button
            type="button"
            onClick={() => { setListMode('bekleyen'); setEditing(null); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide cursor-pointer ${
              listMode === 'bekleyen' ? 'bg-white text-indigo-950' : 'bg-indigo-900/60 text-indigo-100'
            }`}
          >
            Bekleyen ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => { setListMode('gecmis'); setEditing(null); }}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide cursor-pointer ${
              listMode === 'gecmis' ? 'bg-white text-indigo-950' : 'bg-indigo-900/60 text-indigo-100'
            }`}
          >
            <History size={11} /> Geçmiş ({gecmis.length})
          </button>
        </div>
      </div>

      {!sekerCari && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            <strong>{SEKER_VIDANJOR_UNVAN}</strong> cari kartı henüz yok. Onay sırasında otomatik
            oluşturulacak.
          </p>
        </div>
      )}

      {listMode === 'gecmis' && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={gecmisArama}
            onChange={(e) => setGecmisArama(e.target.value)}
            placeholder="Fiş no, plaka, tarih, kaydeden…"
            className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-[11px] font-semibold"
          />
        </div>
      )}

      {visibleList.length === 0 ? (
        <div className="bg-slate-50 rounded-2xl p-10 text-center border border-slate-200">
          <p className="text-sm font-bold text-slate-600">
            {listMode === 'bekleyen'
              ? 'Onay bekleyen vidanjör fişi yok.'
              : gecmis.length === 0
                ? 'Henüz geçmiş fiş yok.'
                : 'Aramaya uyan geçmiş fiş yok.'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {listMode === 'bekleyen'
              ? 'Kampçı yeni fiş gönderince burada listelenir.'
              : 'Onaylanan ve reddedilen fişler Geçmiş sekmesinde görünür.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {visibleList.map((f) => {
              const badge = fisDurumLabel(f.durum);
              return (
              <div
                key={f.id}
                className={`bg-white border rounded-xl p-3 flex gap-3 ${
                  editing?.id === f.id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'
                }`}
              >
                {f.fisGorselUrl ? (
                  <button
                    type="button"
                    onClick={() => openBase64InNewTab(f.fisGorselUrl!, `vidanjor_${f.fisNo}.jpg`)}
                    className="shrink-0 cursor-pointer"
                  >
                    <img
                      src={f.fisGorselUrl}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                  </button>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-100 border flex items-center justify-center shrink-0">
                    <Camera size={16} className="text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 truncate flex items-center gap-1.5 flex-wrap">
                    {f.fisNo} · {f.plaka}
                    {listMode === 'gecmis' && (
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${badge.className}`}>
                        {badge.text}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {f.tarih} · Çekim: <strong>{f.cekimAdedi}</strong>
                  </p>
                  <p className="text-[9px] text-slate-400 truncate">{f.firmaUnvan}</p>
                  <p className="text-[9px] text-slate-400">Kaydeden: {f.kaydeden || '—'}</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openEdit(f)}
                      className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-indigo-600 text-white cursor-pointer"
                    >
                      <Pencil size={11} /> {listMode === 'gecmis' ? 'Düzelt' : 'Düzelt / Onayla'}
                    </button>
                    {listMode === 'bekleyen' ? (
                      <button
                        type="button"
                        onClick={() => handleReject(f)}
                        className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                      >
                        <X size={11} /> Reddet
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                      >
                        <Trash2 size={11} /> Sil
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            {!editing ? (
              <div className="h-full min-h-[240px] flex items-center justify-center text-slate-400 text-xs italic">
                Soldan bir fiş seçip düzeltme / onay formunu açın.
              </div>
            ) : (
              <form onSubmit={handleApprove} className="space-y-3 text-xs">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 border-b pb-2">
                  Vidanjör Fiş Düzelt &amp; Kaydet
                </h4>
                {editing.fisGorselUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      openBase64InNewTab(editing.fisGorselUrl!, `vidanjor_${editing.fisNo}.jpg`)
                    }
                    className="w-full cursor-pointer"
                  >
                    <img
                      src={editing.fisGorselUrl}
                      alt="Fiş"
                      className="max-h-44 w-full object-contain rounded-xl border bg-slate-50"
                    />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Tarih</label>
                    <input
                      type="date"
                      required
                      value={tarih}
                      onChange={(e) => setTarih(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Fiş No</label>
                    <input
                      required
                      value={fisNo}
                      onChange={(e) => setFisNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Plaka</label>
                    <input
                      required
                      value={plaka}
                      onChange={(e) => setPlaka(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Çekim Adeti</label>
                    <input
                      required
                      type="number"
                      min={1}
                      step={1}
                      value={cekimAdedi}
                      onChange={(e) => setCekimAdedi(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  {editingApproved
                    ? 'Kaydet → mevcut irsaliye ve cari kaydı güncellenir.'
                    : <>Kaydet → <strong>İrsaliye</strong> + <strong>Cari kart altına irsaliye geçmişi</strong>{' '}
                      oluşur ({sekerCari?.unvan || SEKER_VIDANJOR_UNVAN}).</>}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-3 rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    {editingApproved ? 'KAYDET' : 'ONAYLA & KAYDET'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-[10px] cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VidanjorFisOnayPanel;
