import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck, Check, X, Pencil, RefreshCw, Camera, AlertTriangle, ZoomIn
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { CariKart, CariKartIslem, Fatura, Irsaliye, SatinAlmaTalebi, YildirimTankerFis } from '../types/erp';
import { db } from '../lib/firebase';
import { openBase64InNewTab } from '../lib/fileViewerUtils';
import { YILDIRIM_TANKER_UNVAN, findYildirimTankerCari } from '../lib/yildirimTankerUtils';
import {
  approveYildirimTankerFis,
  isYildirimFisPending,
  rejectYildirimTankerFis,
} from '../lib/yildirimTankerOnayUtils';
import { findMatchingYildirimSatinAlma, softBindIrsaliyelerToDraftFatura } from '../lib/tankerEvrakDonusum';

interface YildirimTankerFisOnayPanelProps {
  currentUser: any;
  cariKartlar: CariKart[];
  setCariKartlar?: React.Dispatch<React.SetStateAction<CariKart[]>>;
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
}

export const YildirimTankerFisOnayPanel: React.FC<YildirimTankerFisOnayPanelProps> = ({
  currentUser,
  cariKartlar,
  setCariKartlar,
  setIrsaliyeler,
  setCariIslemGecmisi,
  faturalar = [],
  setFaturalar,
  satinAlmaTalepleri = [],
  irsaliyeler = [],
  addNotification,
}) => {
  const [fisler, setFisler] = useState<YildirimTankerFis[]>([]);
  const [editing, setEditing] = useState<YildirimTankerFis | null>(null);
  const [tarih, setTarih] = useState('');
  const [fisNo, setFisNo] = useState('');
  const [icmeSuyuAdet, setIcmeSuyuAdet] = useState('');
  const [sanayiSuyuAdet, setSanayiSuyuAdet] = useState('');
  const [damacaAdet, setDamacaAdet] = useState('');
  const [saving, setSaving] = useState(false);

  const yildirimCari = useMemo(() => findYildirimTankerCari(cariKartlar), [cariKartlar]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'yildirimTankerFisleri'), (snap) => {
      const list: YildirimTankerFis[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<YildirimTankerFis, 'id'>) }));
      list.sort((a, b) => String(b.olusturulma || '').localeCompare(String(a.olusturulma || '')));
      setFisler(list);
    });
    return () => unsub();
  }, []);

  const pending = useMemo(() => fisler.filter((f) => isYildirimFisPending(f)), [fisler]);

  const openEdit = (f: YildirimTankerFis) => {
    setEditing(f);
    setTarih(f.tarih);
    setFisNo(f.fisNo);
    setIcmeSuyuAdet(String(f.icmeSuyuAdet ?? 0));
    setSanayiSuyuAdet(String(f.sanayiSuyuAdet ?? 0));
    setDamacaAdet(String(f.damacaAdet ?? 0));
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const icme = Number(icmeSuyuAdet || 0);
    const sanayi = Number(sanayiSuyuAdet || 0);
    const damaca = Number(damacaAdet || 0);
    if (!fisNo.trim() || !tarih) {
      alert('Tarih ve fiş no zorunlu.');
      return;
    }
    if (icme + sanayi + damaca <= 0) {
      alert('En az bir kalem (içme / sanayi / damaca) girin.');
      return;
    }
    if (
      !window.confirm(
        'Onaylanınca Yıldırım Tanker irsaliyesi + cari oluşur; SA varsa soft bağlanır. Devam?'
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const tipHint =
        icme > 0 ? ('ICME' as const) : sanayi > 0 ? ('SANAYI' as const) : damaca > 0 ? ('DAMACA' as const) : null;
      const previewSa = findMatchingYildirimSatinAlma(satinAlmaTalepleri, irsaliyeler, tipHint, {
        preferredSaId: editing.saId,
        preferredSaKalemId: editing.saKalemId,
      });
      const result = await approveYildirimTankerFis({
        fis: editing,
        correction: {
          tarih,
          fisNo: fisNo.trim().toUpperCase(),
          icmeSuyuAdet: icme,
          sanayiSuyuAdet: sanayi,
          damacaAdet: damaca,
          fisGorselUrl: editing.fisGorselUrl,
          firmaUnvan: yildirimCari?.unvan || editing.firmaUnvan || YILDIRIM_TANKER_UNVAN,
          cariKartId: yildirimCari?.id || editing.cariKartId,
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

      let faturaNo = '';
      if (
        setFaturalar &&
        setIrsaliyeler &&
        window.confirm(
          `İrsaliye oluştu: ${result.irsaliye.irsaliyeNo}${
            result.saMatch ? `\nSA bağlandı: ${result.saMatch.sa.saId}` : '\n(Eşleşen SA bulunamadı)'
          }\n\nTaslak fatura da oluşturulsun mu?\n(Evraklar kilitlenmez; fiyat sonra doldurulur.)`
        )
      ) {
        const bound = softBindIrsaliyelerToDraftFatura({
          irsaliyeler: [result.irsaliye],
          faturalar,
          cariKartlar,
          setFaturalar,
          setIrsaliyeler,
          setCariIslemGecmisi,
          baslik: 'Yıldırım İrsaliyesinden Taslak Fatura',
        });
        faturaNo = bound.fatura.faturaNo;
      }

      await addNotification?.(
        `Yıldırım Tanker irsaliyesi onaylandı: ${result.fis.fisNo}${faturaNo ? ` · fatura ${faturaNo}` : ''}`,
        {
          tip: 'YILDIRIM_TANKER_FIS_ONAYLANDI',
          hedefRol: 'TESİSATÇI',
          hedefEmail: String(editing.kaydeden || '').trim().toLowerCase() || undefined,
          yildirimTankerFisId: result.fis.id,
          irsaliyeId: result.irsaliye.id,
          cariKartId: result.cariIslem.cariKartId,
          saId: result.saMatch?.sa.saId,
          faturaNo: faturaNo || undefined,
        }
      );

      alert(
        `Onaylandı.\n\n1) İrsaliye: ${result.irsaliye.irsaliyeNo}\n2) Cari: ${result.fis.firmaUnvan}${
          result.saMatch ? `\n3) SA: ${result.saMatch.sa.saId}` : ''
        }${faturaNo ? `\n4) Taslak fatura: ${faturaNo}` : ''}`
      );
      setEditing(null);
    } catch (err: any) {
      console.error(err);
      alert('Onay başarısız: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (f: YildirimTankerFis) => {
    const neden = window.prompt('Red nedeni (opsiyonel):') || '';
    if (!window.confirm(`${f.fisNo} nolu fiş reddedilsin mi?`)) return;
    try {
      await rejectYildirimTankerFis({
        fis: f,
        onaylayan: currentUser?.email || 'yonetici',
        redNedeni: neden,
      });
      await addNotification?.(
        `Yıldırım Tanker fişi reddedildi: ${f.fisNo}${neden ? ` · ${neden}` : ''}`,
        {
          tip: 'YILDIRIM_TANKER_FIS_REDDEDILDI',
          hedefRol: 'TESİSATÇI',
          hedefEmail: String(f.kaydeden || '').trim().toLowerCase() || undefined,
          yildirimTankerFisId: f.id,
          redNedeni: neden,
        }
      );
      if (editing?.id === f.id) setEditing(null);
    } catch (err: any) {
      alert('Red başarısız: ' + (err?.message || ''));
    }
  };

  return (
    <div className="space-y-4">
      <div className="border bg-sky-950 p-4.5 rounded-2xl border-sky-800/80 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-sky-200 font-bold block text-[11px] tracking-widest uppercase flex items-center gap-1.5">
              <Truck size={13} /> Yıldırım Tanker İrsaliye Onayı
            </span>
            <p className="text-sky-100/80 leading-relaxed text-[11px]">
              Tesisatçı kaydı buraya düşer. Son kontrol / düzeltme sonrası onaylarsanız{' '}
              <strong>Yıldırım Tanker</strong> cari altına irsaliye oluşur (içme / sanayi / damaca).
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-black bg-amber-400 text-slate-950 px-2.5 py-1 rounded-full">
            {pending.length} bekleyen
          </span>
        </div>
      </div>

      {!yildirimCari && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            <strong>{YILDIRIM_TANKER_UNVAN}</strong> cari kartı henüz yok. Onay sırasında otomatik
            oluşturulacak.
          </p>
        </div>
      )}

      {pending.length === 0 ? (
        <div className="bg-slate-50 rounded-2xl p-10 text-center border border-slate-200">
          <p className="text-sm font-bold text-slate-600">Onay bekleyen Yıldırım Tanker fişi yok.</p>
          <p className="text-xs text-slate-400 mt-1">Tesisatçı yeni fiş gönderince burada listelenir.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {pending.map((f) => (
              <div
                key={f.id}
                className={`bg-white border rounded-xl p-3 flex gap-3 ${
                  editing?.id === f.id ? 'border-sky-400 ring-1 ring-sky-200' : 'border-slate-200'
                }`}
              >
                {f.fisGorselUrl ? (
                  <button
                    type="button"
                    onClick={() => openBase64InNewTab(f.fisGorselUrl!, `yildirim_${f.fisNo}.jpg`)}
                    className="shrink-0 cursor-pointer relative group"
                    title="Büyüt"
                  >
                    <img
                      src={f.fisGorselUrl}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                    <span className="absolute inset-0 rounded-lg bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <ZoomIn size={14} className="text-white" />
                    </span>
                  </button>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-100 border flex items-center justify-center shrink-0">
                    <Camera size={16} className="text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 truncate">{f.fisNo}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {f.tarih} · İçme: <strong>{f.icmeSuyuAdet} ton</strong> · Sanayi:{' '}
                    <strong>{f.sanayiSuyuAdet} ton</strong> · Damacana: <strong>{f.damacaAdet || 0} adet</strong>
                  </p>
                  <p className="text-[9px] text-slate-400 truncate">{f.firmaUnvan}</p>
                  <p className="text-[9px] text-slate-400">Kaydeden: {f.kaydeden || '—'}</p>
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => openEdit(f)}
                      className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-sky-600 text-white cursor-pointer"
                    >
                      <Pencil size={11} /> Düzelt / Onayla
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(f)}
                      className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                    >
                      <X size={11} /> Reddet
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            {!editing ? (
              <div className="h-full min-h-[240px] flex items-center justify-center text-slate-400 text-xs italic">
                Soldan bir fiş seçip düzeltme / onay formunu açın.
              </div>
            ) : (
              <form onSubmit={handleApprove} className="space-y-3 text-xs">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 border-b pb-2">
                  Yıldırım Tanker İrsaliye Düzelt &amp; Kaydet
                </h4>
                {editing.fisGorselUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      openBase64InNewTab(editing.fisGorselUrl!, `yildirim_${editing.fisNo}.jpg`)
                    }
                    className="w-full cursor-pointer relative group"
                    title="Büyüt"
                  >
                    <img
                      src={editing.fisGorselUrl}
                      alt="İrsaliye"
                      className="max-h-44 w-full object-contain rounded-xl border bg-slate-50"
                    />
                    <span className="absolute bottom-2 right-2 text-[9px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <ZoomIn size={10} /> Büyüt
                    </span>
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
                    <label className="text-[9px] font-black text-slate-500 uppercase">Fiş / İrsaliye No</label>
                    <input
                      required
                      value={fisNo}
                      onChange={(e) => setFisNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">İçme Suyu (Ton)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={icmeSuyuAdet}
                      onChange={(e) => setIcmeSuyuAdet(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Sanayi Suyu (Ton)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={sanayiSuyuAdet}
                      onChange={(e) => setSanayiSuyuAdet(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Damacana (Adet)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={damacaAdet}
                      onChange={(e) => setDamacaAdet(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  Kaydet → <strong>İrsaliye</strong> + <strong>Cari kart altına irsaliye geçmişi</strong>{' '}
                  oluşur ({yildirimCari?.unvan || YILDIRIM_TANKER_UNVAN}).
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-3 rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    ONAYLA &amp; İRSALİYE OLUŞTUR
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

export default YildirimTankerFisOnayPanel;
