import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, Camera, Check, Pencil, Trash2, RefreshCw, AlertTriangle, Truck
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { CariKart, CariKartIslem, Fatura, Irsaliye, VidanjorFis } from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey, formatDateLabelTr } from '../lib/dateKeyUtils';
import {
  SEKER_VIDANJOR_UNVAN,
  compareCekimFatura,
  findSekerVidanjorCari,
  isSekerVidanjorFirma,
  filterFislerByMonth,
} from '../lib/vidanjorUtils';
import { softBindIrsaliyelerToDraftFatura } from '../lib/tankerEvrakDonusum';
import { openEvrakZincirRaporu } from '../lib/evrakZincirRapor';

interface KampVidanjorTabProps {
  cariKartlar?: CariKart[];
  faturalar?: Fatura[];
  setFaturalar?: React.Dispatch<React.SetStateAction<Fatura[]>>;
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  currentUser: any;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
  showStatus?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const KampVidanjorTab: React.FC<KampVidanjorTabProps> = ({
  cariKartlar = [],
  faturalar = [],
  setFaturalar,
  irsaliyeler = [],
  setIrsaliyeler,
  setCariIslemGecmisi,
  currentUser,
  addNotification,
  showStatus,
}) => {
  const sekerCari = useMemo(() => findSekerVidanjorCari(cariKartlar), [cariKartlar]);
  const firmaUnvan = sekerCari?.unvan || SEKER_VIDANJOR_UNVAN;

  const [islemTarihi, setIslemTarihi] = useState(todayDateKey());
  const [fisNo, setFisNo] = useState('');
  const [plaka, setPlaka] = useState('');
  const [cekimAdedi, setCekimAdedi] = useState('');
  const [fisGorselUrl, setFisGorselUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [fisler, setFisler] = useState<VidanjorFis[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [eslesmeAy, setEslesmeAy] = useState(() => new Date().getMonth() + 1);
  const [eslesmeYil, setEslesmeYil] = useState(() => new Date().getFullYear());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vidanjorFisleri'), (snap) => {
      const list: VidanjorFis[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<VidanjorFis, 'id'>) }));
      list.sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)) || String(b.olusturulma).localeCompare(String(a.olusturulma)));
      setFisler(list);
    });
    return () => unsub();
  }, []);

  const gunlukListe = useMemo(
    () => fisler.filter((f) => f.tarih === islemTarihi),
    [fisler, islemTarihi]
  );

  const eslesme = useMemo(
    () => compareCekimFatura(fisler, faturalar, eslesmeYil, eslesmeAy, firmaUnvan),
    [fisler, faturalar, eslesmeYil, eslesmeAy, firmaUnvan]
  );

  const ayOnayliFisler = useMemo(
    () => filterFislerByMonth(fisler, eslesmeYil, eslesmeAy).filter((f) => f.durum === 'ONAYLANDI'),
    [fisler, eslesmeYil, eslesmeAy]
  );

  const ayFaturasizIrsaliyeler = useMemo(() => {
    const ids = new Set(
      ayOnayliFisler.map((f) => f.irsaliyeId).filter(Boolean) as string[]
    );
    return irsaliyeler.filter((ir) => {
      const linked =
        ids.has(ir.id) ||
        (ir.irsaliyeId ? ids.has(ir.irsaliyeId) : false) ||
        (ir.kaynak === 'VIDANJOR_FIS' &&
          String(ir.tarih || '').startsWith(`${eslesmeYil}-${String(eslesmeAy).padStart(2, '0')}`));
      return linked && !ir.faturaNo && (ir.kalemler || []).length > 0;
    });
  }, [ayOnayliFisler, irsaliyeler, eslesmeYil, eslesmeAy]);

  const handleAyFaturayaBagla = () => {
    if (!setFaturalar || !setIrsaliyeler) {
      showStatus?.('error', 'Fatura kaydı için sistem bağlantısı yok.');
      return;
    }
    if (!ayFaturasizIrsaliyeler.length) {
      showStatus?.('info', 'Bu ayda faturasız onaylı vidanjör irsaliyesi yok.');
      return;
    }
    if (
      !window.confirm(
        `${ayFaturasizIrsaliyeler.length} onaylı vidanjör irsaliyesi tek taslak faturaya bağlansın mı?\n(Evraklar kilitlenmez.)`
      )
    ) {
      return;
    }
    try {
      const { fatura } = softBindIrsaliyelerToDraftFatura({
        irsaliyeler: ayFaturasizIrsaliyeler,
        faturalar,
        cariKartlar,
        setFaturalar,
        setIrsaliyeler,
        setCariIslemGecmisi,
        baslik: 'Vidanjör Aylık Taslak Fatura',
      });
      showStatus?.(
        'success',
        `Taslak fatura: ${fatura.faturaNo} · ${ayFaturasizIrsaliyeler.length} irsaliye bağlandı`
      );
      void addNotification?.(
        `Vidanjör aylık fatura taslağı: ${fatura.faturaNo}`,
        { tip: 'VIDANJOR_FATURA_TASLAK', faturaNo: fatura.faturaNo }
      );
      if (window.confirm('Zincir raporunu açmak ister misiniz?')) {
        openEvrakZincirRaporu({
          irsaliyeler: ayFaturasizIrsaliyeler.map((ir) => ({
            ...ir,
            faturaNo: fatura.faturaNo,
          })),
          faturalar: [fatura, ...faturalar],
          focusIrsaliyeIds: ayFaturasizIrsaliyeler.map((ir) => ir.id),
        });
      }
    } catch (err: any) {
      showStatus?.('error', err?.message || 'Fatura bağlanamadı');
    }
  };

  const resetForm = () => {
    setFisNo('');
    setPlaka('');
    setCekimAdedi('');
    setFisGorselUrl('');
    setEditingId(null);
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      const raw = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const compressed = file.type.startsWith('image/')
        ? await compressImage(raw, 1280, 1280, 0.75)
        : raw;
      setFisGorselUrl(compressed);
    } catch {
      showStatus?.('error', 'Görsel yüklenemedi.');
    }
    e.target.value = '';
  };

  const handleKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    const cekim = Number(cekimAdedi);
    if (!fisNo.trim() || !plaka.trim() || !Number.isFinite(cekim) || cekim <= 0) {
      showStatus?.('error', 'Fiş no, plaka ve çekim adedi zorunlu.');
      return;
    }
    if (!fisGorselUrl && !editingId) {
      showStatus?.('error', 'Fiş görseli yükleyin.');
      return;
    }

    setSaving(true);
    try {
      const id = editingId || `vfis_${Date.now()}`;
      const existing = editingId ? fisler.find((f) => f.id === editingId) : null;
      if (existing?.durum === 'ONAYLANDI') {
        showStatus?.('error', 'Onaylanmış fiş kampçı tarafından değiştirilemez.');
        setSaving(false);
        return;
      }
      const guvenlikEvrakId = existing?.guvenlikEvrakId || `EVR-VID-${id}`;
      const irsaliyeId = existing?.irsaliyeId || `IR-VID-${id}`;
      const fis: VidanjorFis = {
        id,
        tarih: islemTarihi,
        fisNo: fisNo.trim().toUpperCase(),
        plaka: plaka.trim().toUpperCase(),
        cekimAdedi: cekim,
        fisGorselUrl: fisGorselUrl || existing?.fisGorselUrl || '',
        firmaUnvan,
        cariKartId: sekerCari?.id,
        irsaliyeId,
        guvenlikEvrakId,
        kaydeden: currentUser?.email || 'kampci',
        durum: 'YONETICI_ONAYINDA',
        olusturulma: existing?.olusturulma || new Date().toISOString(),
        guncellenme: new Date().toISOString(),
      };

      // 1) Kampçı kaydı — yönetici onayına düşer (irsaliye/cari henüz oluşmaz)
      await setDoc(doc(db, 'vidanjorFisleri', id), fis);

      // 2) Onay kuyruğu için bekleyen evrak kaydı (yönetici düzeltip onaylar)
      await setDoc(
        doc(db, 'guvenlikGelenEvraklar', guvenlikEvrakId),
        {
          id: guvenlikEvrakId,
          evrakNo: fis.fisNo,
          evrakTuru: 'İRSALİYE',
          firma: firmaUnvan,
          tarih: fis.tarih,
          saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          fotoUrl: fis.fisGorselUrl || '',
          fileName: `vidanjor_${fis.fisNo}.jpg`,
          fileType: 'image/jpeg',
          durum: 'BEKLEMEDE',
          aciklama: `Kampçı vidanjör fişi · Plaka ${fis.plaka} · ${fis.cekimAdedi} çekim — yönetici onayı bekliyor`,
          kaydeden: currentUser?.email || 'kampci',
          kaynak: 'VIDANJOR_FIS',
          vidanjorFisId: id,
          irsaliyeId,
          cariKartId: sekerCari?.id || null,
          plaka: fis.plaka,
          cekimAdedi: fis.cekimAdedi,
          kalemler: [
            {
              id: `k_${id}`,
              urunAdi: 'Vidanjör Çekim',
              miktar: fis.cekimAdedi,
              birim: 'ADET',
            },
          ],
          aiStatus: 'SKIPPED',
        },
        { merge: true }
      );

      if (addNotification) {
        await addNotification(
          `Vidanjör fişi yönetici onayına gönderildi: ${fis.fisNo} · ${fis.plaka} · ${fis.cekimAdedi} çekim`,
          {
            tip: 'VIDANJOR_FIS_ONAY',
            hedefRol: 'YÖNETİCİ',
            vidanjorFisId: id,
            guvenlikEvrakId,
            irsaliyeId,
          }
        );
      }
      showStatus?.(
        'success',
        editingId
          ? 'Fiş güncellendi ve yönetici onayına yeniden gönderildi.'
          : 'Fiş yönetici onayına gönderildi. Onaylanınca irsaliye + cari kaydı oluşur.'
      );
      resetForm();
    } catch (err: any) {
      console.error(err);
      showStatus?.('error', 'Kayıt başarısız: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (f: VidanjorFis) => {
    if (f.durum === 'ONAYLANDI') {
      showStatus?.('error', 'Onaylanmış fiş düzenlenemez.');
      return;
    }
    setEditingId(f.id);
    setIslemTarihi(f.tarih);
    setFisNo(f.fisNo);
    setPlaka(f.plaka);
    setCekimAdedi(String(f.cekimAdedi));
    setFisGorselUrl(f.fisGorselUrl || '');
  };

  const handleSil = async (f: VidanjorFis) => {
    if (f.durum === 'ONAYLANDI') {
      showStatus?.('error', 'Onaylanmış fiş silinemez. Yönetici ile iletişime geçin.');
      return;
    }
    if (!window.confirm(`${f.fisNo} nolu vidanjör fişi silinsin mi?`)) return;
    try {
      await deleteDoc(doc(db, 'vidanjorFisleri', f.id));
      const evrakId = f.guvenlikEvrakId || `EVR-VID-${f.id}`;
      try {
        await deleteDoc(doc(db, 'guvenlikGelenEvraklar', evrakId));
      } catch {
        /* evrak yoksa geç */
      }
      if (editingId === f.id) resetForm();
      showStatus?.('success', 'Fiş silindi.');
    } catch (err: any) {
      showStatus?.('error', 'Silinemedi: ' + (err?.message || ''));
    }
  };

  const durumBadge = (durum?: VidanjorFis['durum']) => {
    if (durum === 'ONAYLANDI')
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (durum === 'REDDEDILDI')
      return 'bg-rose-100 text-rose-800 border-rose-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const durumLabel = (durum?: VidanjorFis['durum']) => {
    if (durum === 'ONAYLANDI') return 'Onaylandı';
    if (durum === 'REDDEDILDI') return 'Reddedildi';
    return 'Yönetici onayı';
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Truck size={14} className="text-indigo-600" /> Vidanjör Fiş Kaydı
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Cari: <strong>{firmaUnvan}</strong>
              {!sekerCari && (
                <span className="text-amber-700"> — cari yoksa yönetici onayında otomatik oluşturulur</span>
              )}
              <span className="block mt-0.5 text-slate-400">
                Kayıt yöneticiye gider; onaylanınca irsaliye + cari altına işlenir.
              </span>
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
            <Calendar size={12} />
            Tarih
            <input
              type="date"
              value={islemTarihi}
              onChange={(e) => setIslemTarihi(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
            />
          </label>
        </div>

        <form onSubmit={handleKaydet} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">Fiş No *</label>
            <input
              required
              value={fisNo}
              onChange={(e) => setFisNo(e.target.value)}
              placeholder="Örn: VF-001"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">Plaka *</label>
            <input
              required
              value={plaka}
              onChange={(e) => setPlaka(e.target.value)}
              placeholder="34 ABC 123"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono uppercase"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">Çekim Adeti *</label>
            <input
              required
              type="number"
              min={1}
              step={1}
              value={cekimAdedi}
              onChange={(e) => setCekimAdedi(e.target.value)}
              placeholder="Örn: 1"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">Fiş Görseli *</label>
            <label className="flex items-center justify-center gap-2 w-full bg-indigo-50 border border-dashed border-indigo-300 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-indigo-100">
              <Camera size={14} className="text-indigo-600" />
              <span className="font-bold text-indigo-700 text-[10px]">
                {fisGorselUrl ? 'Görsel seçildi — değiştir' : 'Fotoğraf / evrak yükle'}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFoto} />
            </label>
          </div>

          {fisGorselUrl && (
            <div className="sm:col-span-2">
              <img src={fisGorselUrl} alt="Fiş" className="max-h-40 rounded-xl border border-slate-200 object-contain bg-slate-50" />
            </div>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-w-[140px] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] py-3 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              {editingId ? 'GÜNCELLE & ONAYA GÖNDER' : 'YÖNETİCİYE GÖNDER'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-[10px]"
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Günlük liste */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
          {formatDateLabelTr(islemTarihi)} — Kayıtlı Fişler ({gunlukListe.length})
        </h4>
        {gunlukListe.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Bu tarihte fiş yok. Formu doldurup Kaydet’e basın.</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {gunlukListe.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px]"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {f.fisGorselUrl ? (
                    <img src={f.fisGorselUrl} alt="" className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">
                      {f.fisNo} · {f.plaka}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      Çekim: <strong>{f.cekimAdedi}</strong> · {f.firmaUnvan}
                    </p>
                    <span
                      className={`inline-block mt-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${durumBadge(f.durum)}`}
                    >
                      {durumLabel(f.durum)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {f.durum !== 'ONAYLANDI' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEdit(f)}
                        className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200"
                        title="Düzenle"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSil(f)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200"
                        title="Sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ay sonu fatura eşleşme */}
      <div
        className={`rounded-2xl p-4 border space-y-3 ${
          eslesme.faturaSayisi > 0 && !eslesme.uyumlu
            ? 'bg-rose-50 border-rose-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
            Ay Sonu Çekim Eşleşmesi — {firmaUnvan}
          </h4>
          <div className="flex gap-2">
            <select
              value={eslesmeAy}
              onChange={(e) => setEslesmeAy(Number(e.target.value))}
              className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {String(i + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
            <select
              value={eslesmeYil}
              onChange={(e) => setEslesmeYil(Number(e.target.value))}
              className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="bg-white/80 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Fiş çekim</span>
            <strong className="text-slate-900 text-sm">{eslesme.fisToplam}</strong>
          </div>
          <div className="bg-white/80 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Fatura çekim</span>
            <strong className="text-slate-900 text-sm">
              {eslesme.faturaSayisi === 0 ? '—' : eslesme.faturaToplam}
            </strong>
          </div>
          <div className="bg-white/80 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Durum</span>
            <strong
              className={`text-sm ${
                eslesme.faturaSayisi === 0
                  ? 'text-slate-500'
                  : eslesme.uyumlu
                    ? 'text-emerald-600'
                    : 'text-rose-600'
              }`}
            >
              {eslesme.faturaSayisi === 0
                ? 'Fatura yok'
                : eslesme.uyumlu
                  ? 'Uyumlu'
                  : `Fark: ${eslesme.fark}`}
            </strong>
          </div>
        </div>
        {eslesme.faturaSayisi > 0 && !eslesme.uyumlu && (
          <p className="text-[11px] text-rose-800 font-semibold flex items-start gap-1.5">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            Sorun: Fatura çekim miktarı ile biriken fiş çekim toplamı aynı değil. Kontrol edin.
          </p>
        )}
        {ayFaturasizIrsaliyeler.length > 0 && (
          <button
            type="button"
            onClick={handleAyFaturayaBagla}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-black uppercase tracking-wide cursor-pointer"
          >
            Bu ayın {ayFaturasizIrsaliyeler.length} irsaliyesini taslak faturaya bağla
          </button>
        )}
      </div>

      {/* Cari altındaki tüm fişler */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
          {firmaUnvan} — Tüm Fişler ({fisler.filter((f) => isSekerVidanjorFirma(f.firmaUnvan) || f.firmaUnvan === firmaUnvan).length})
        </h4>
        <div className="max-h-[240px] overflow-y-auto space-y-1.5">
          {fisler
            .filter((f) => isSekerVidanjorFirma(f.firmaUnvan) || f.firmaUnvan === firmaUnvan)
            .slice(0, 80)
            .map((f) => (
              <div key={f.id} className="text-[10px] flex justify-between gap-2 border-b border-slate-100 py-1.5">
                <span className="font-mono text-slate-600">{f.tarih}</span>
                <span className="font-bold text-slate-800 truncate">{f.fisNo}</span>
                <span className="font-mono">{f.plaka}</span>
                <span className="font-black text-indigo-700">{f.cekimAdedi}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
