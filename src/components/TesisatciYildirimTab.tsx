import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, Camera, Check, Pencil, Trash2, RefreshCw, Truck, Download, ZoomIn, X
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { CariKart, CariKartIslem, Fatura, Irsaliye, YildirimTankerFis } from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey, formatDateLabelTr } from '../lib/dateKeyUtils';
import { downloadCsv } from '../lib/reportExport';
import {
  YILDIRIM_TANKER_UNVAN,
  findYildirimTankerCari,
  filterYildirimFislerByMonth,
  sumYildirimSular,
  isYildirimTankerFirma,
  compareYildirimFatura,
} from '../lib/yildirimTankerUtils';
import { buildYildirimKalemler } from '../lib/yildirimTankerOnayUtils';
import { softBindIrsaliyelerToDraftFatura } from '../lib/tankerEvrakDonusum';
import { openEvrakZincirRaporu } from '../lib/evrakZincirRapor';

interface TesisatciYildirimTabProps {
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

function durumBadge(durum?: YildirimTankerFis['durum']) {
  if (durum === 'ONAYLANDI') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
        ONAYLANDI
      </span>
    );
  }
  if (durum === 'REDDEDILDI') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
        REDDEDİLDİ
      </span>
    );
  }
  if (durum === 'YONETICI_ONAYINDA') {
    return (
      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
        ONAY BEKLİYOR
      </span>
    );
  }
  return (
    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
      KAYITLI
    </span>
  );
}

export const TesisatciYildirimTab: React.FC<TesisatciYildirimTabProps> = ({
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
  const yildirimCari = useMemo(() => findYildirimTankerCari(cariKartlar), [cariKartlar]);
  const firmaUnvan = yildirimCari?.unvan || YILDIRIM_TANKER_UNVAN;

  const [islemTarihi, setIslemTarihi] = useState(todayDateKey());
  const [fisNo, setFisNo] = useState('');
  const [icmeSuyuAdet, setIcmeSuyuAdet] = useState('');
  const [sanayiSuyuAdet, setSanayiSuyuAdet] = useState('');
  const [damacaAdet, setDamacaAdet] = useState('');
  const [fisGorselUrl, setFisGorselUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [fisler, setFisler] = useState<YildirimTankerFis[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [raporAy, setRaporAy] = useState(() => new Date().getMonth() + 1);
  const [raporYil, setRaporYil] = useState(() => new Date().getFullYear());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'yildirimTankerFisleri'), (snap) => {
      const list: YildirimTankerFis[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<YildirimTankerFis, 'id'>) }));
      list.sort(
        (a, b) =>
          String(b.tarih).localeCompare(String(a.tarih)) ||
          String(b.olusturulma).localeCompare(String(a.olusturulma))
      );
      setFisler(list);
    });
    return () => unsub();
  }, []);

  const gunlukListe = useMemo(
    () => fisler.filter((f) => f.tarih === islemTarihi),
    [fisler, islemTarihi]
  );

  const aylikFisler = useMemo(
    () => filterYildirimFislerByMonth(fisler, raporYil, raporAy),
    [fisler, raporYil, raporAy]
  );

  const aylikToplam = useMemo(() => sumYildirimSular(aylikFisler), [aylikFisler]);

  const eslesme = useMemo(
    () => compareYildirimFatura(fisler, faturalar, raporYil, raporAy, firmaUnvan),
    [fisler, faturalar, raporYil, raporAy, firmaUnvan]
  );

  const ayOnayliFisler = useMemo(
    () => filterYildirimFislerByMonth(fisler, raporYil, raporAy).filter((f) => f.durum === 'ONAYLANDI'),
    [fisler, raporYil, raporAy]
  );

  const ayFaturasizIrsaliyeler = useMemo(() => {
    const ids = new Set(
      ayOnayliFisler.map((f) => f.irsaliyeId).filter(Boolean) as string[]
    );
    return irsaliyeler.filter((ir) => {
      const linked =
        ids.has(ir.id) ||
        (ir.irsaliyeId ? ids.has(ir.irsaliyeId) : false) ||
        (ir.kaynak === 'YILDIRIM_TANKER_FIS' &&
          String(ir.tarih || '').startsWith(`${raporYil}-${String(raporAy).padStart(2, '0')}`));
      return linked && !ir.faturaNo && (ir.kalemler || []).length > 0;
    });
  }, [ayOnayliFisler, irsaliyeler, raporYil, raporAy]);

  const handleAyFaturayaBagla = () => {
    if (!setFaturalar || !setIrsaliyeler) {
      showStatus?.('error', 'Fatura kaydı için sistem bağlantısı yok.');
      return;
    }
    if (!ayFaturasizIrsaliyeler.length) {
      showStatus?.('info', 'Bu ayda faturasız onaylı Yıldırım irsaliyesi yok.');
      return;
    }
    if (
      !window.confirm(
        `${ayFaturasizIrsaliyeler.length} onaylı Yıldırım irsaliyesi tek taslak faturaya bağlansın mı?\n(Evraklar kilitlenmez.)`
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
        baslik: 'Yıldırım Tanker Aylık Taslak Fatura',
      });
      showStatus?.(
        'success',
        `Taslak fatura: ${fatura.faturaNo} · ${ayFaturasizIrsaliyeler.length} irsaliye bağlandı`
      );
      void addNotification?.(
        `Yıldırım aylık fatura taslağı: ${fatura.faturaNo}`,
        { tip: 'YILDIRIM_FATURA_TASLAK', faturaNo: fatura.faturaNo }
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

  const openFoto = (url?: string) => {
    if (!url) return;
    setLightboxUrl(url);
  };

  const resetForm = () => {
    setFisNo('');
    setIcmeSuyuAdet('');
    setSanayiSuyuAdet('');
    setDamacaAdet('');
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
    const icme = Number(icmeSuyuAdet || 0);
    const sanayi = Number(sanayiSuyuAdet || 0);
    const damaca = Number(damacaAdet || 0);
    if (!fisNo.trim()) {
      showStatus?.('error', 'Fiş / irsaliye no zorunlu.');
      return;
    }
    if (
      !Number.isFinite(icme) ||
      icme < 0 ||
      !Number.isFinite(sanayi) ||
      sanayi < 0 ||
      !Number.isFinite(damaca) ||
      damaca < 0
    ) {
      showStatus?.('error', 'İçme, sanayi ve damaca adetleri geçerli sayı olmalı.');
      return;
    }
    if (icme + sanayi + damaca <= 0) {
      showStatus?.('error', 'En az bir kalem (içme / sanayi / damaca) girin.');
      return;
    }
    if (!fisGorselUrl && !editingId) {
      showStatus?.('error', 'İrsaliye görseli yükleyin.');
      return;
    }

    setSaving(true);
    try {
      const id = editingId || `ytfis_${Date.now()}`;
      const existing = editingId ? fisler.find((f) => f.id === editingId) : null;
      if (existing?.durum === 'ONAYLANDI') {
        showStatus?.('error', 'Onaylanmış irsaliye tesisatçı tarafından değiştirilemez.');
        setSaving(false);
        return;
      }

      const guvenlikEvrakId = existing?.guvenlikEvrakId || `EVR-YT-${id}`;
      const irsaliyeId = existing?.irsaliyeId || `IR-YT-${id}`;
      const kalemler = buildYildirimKalemler(id, icme, sanayi, damaca);

      const fis: YildirimTankerFis = {
        id,
        tarih: islemTarihi,
        fisNo: fisNo.trim().toUpperCase(),
        icmeSuyuAdet: icme,
        sanayiSuyuAdet: sanayi,
        damacaAdet: damaca,
        fisGorselUrl: fisGorselUrl || existing?.fisGorselUrl || '',
        firmaUnvan,
        cariKartId: yildirimCari?.id,
        irsaliyeId,
        guvenlikEvrakId,
        kaydeden: currentUser?.email || 'tesisatci',
        durum: 'YONETICI_ONAYINDA',
        olusturulma: existing?.olusturulma || new Date().toISOString(),
        guncellenme: new Date().toISOString(),
      };

      // 1) Tesisatçı kaydı — yönetici onayına düşer (irsaliye/cari henüz oluşmaz)
      await setDoc(doc(db, 'yildirimTankerFisleri', id), fis);

      // 2) Onay kuyruğu (Şeker Vidanjör ile aynı model)
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
          fileName: `yildirim_${fis.fisNo}.jpg`,
          fileType: 'image/jpeg',
          durum: 'BEKLEMEDE',
          aciklama: `Tesisatçı Yıldırım Tanker irsaliyesi · İçme ${fis.icmeSuyuAdet} ton · Sanayi ${fis.sanayiSuyuAdet} ton · Damacana ${fis.damacaAdet || 0} adet — yönetici onayı bekliyor`,
          kaydeden: currentUser?.email || 'tesisatci',
          kaynak: 'YILDIRIM_TANKER_FIS',
          yildirimTankerFisId: id,
          irsaliyeId,
          cariKartId: yildirimCari?.id || null,
          icmeSuyuAdet: fis.icmeSuyuAdet,
          sanayiSuyuAdet: fis.sanayiSuyuAdet,
          damacaAdet: fis.damacaAdet || 0,
          kalemler,
          aiStatus: 'SKIPPED',
        },
        { merge: true }
      );

      if (addNotification) {
        await addNotification(
          `Yıldırım Tanker irsaliyesi yönetici onayına gönderildi: ${fis.fisNo} · içme ${fis.icmeSuyuAdet} ton · sanayi ${fis.sanayiSuyuAdet} ton · damacana ${fis.damacaAdet || 0} adet`,
          {
            tip: 'YILDIRIM_TANKER_FIS_ONAY',
            hedefRol: 'YÖNETİCİ',
            yildirimTankerFisId: id,
            guvenlikEvrakId,
            irsaliyeId,
          }
        );
      }
      showStatus?.(
        'success',
        editingId
          ? 'Fiş güncellendi ve yönetici onayına yeniden gönderildi.'
          : 'İrsaliye yönetici onayına gönderildi. Onaylanınca Yıldırım Tanker cari altına yazılır.'
      );
      resetForm();
    } catch (err: any) {
      console.error(err);
      showStatus?.('error', 'Kayıt başarısız: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (f: YildirimTankerFis) => {
    if (f.durum === 'ONAYLANDI') {
      showStatus?.('error', 'Onaylanmış irsaliye düzenlenemez.');
      return;
    }
    setEditingId(f.id);
    setIslemTarihi(f.tarih);
    setFisNo(f.fisNo);
    setIcmeSuyuAdet(String(f.icmeSuyuAdet));
    setSanayiSuyuAdet(String(f.sanayiSuyuAdet));
    setDamacaAdet(String(f.damacaAdet ?? 0));
    setFisGorselUrl(f.fisGorselUrl || '');
  };

  const handleSil = async (f: YildirimTankerFis) => {
    if (f.durum === 'ONAYLANDI') {
      showStatus?.('error', 'Onaylanmış irsaliye silinemez.');
      return;
    }
    if (!window.confirm(`${f.fisNo} nolu Yıldırım Tanker fişi silinsin mi?`)) return;
    try {
      await deleteDoc(doc(db, 'yildirimTankerFisleri', f.id));
      const evrakId = f.guvenlikEvrakId || `EVR-YT-${f.id}`;
      try {
        await deleteDoc(doc(db, 'guvenlikGelenEvraklar', evrakId));
      } catch {
        /* ignore */
      }
      if (editingId === f.id) resetForm();
      showStatus?.('success', 'Fiş silindi.');
    } catch (err: any) {
      showStatus?.('error', 'Silinemedi: ' + (err?.message || ''));
    }
  };

  const handleRaporIndir = () => {
    const rows = [
      ['Tarih', 'Fiş No', 'İçme Suyu (Ton)', 'Sanayi Suyu (Ton)', 'Damacana (Adet)', 'Toplam', 'Durum', 'Firma', 'Kaydeden'],
      ...aylikFisler.map((f) => [
        f.tarih,
        f.fisNo,
        String(f.icmeSuyuAdet),
        String(f.sanayiSuyuAdet),
        String(f.damacaAdet || 0),
        String(
          (Number(f.icmeSuyuAdet) || 0) +
            (Number(f.sanayiSuyuAdet) || 0) +
            (Number(f.damacaAdet) || 0)
        ),
        f.durum || '—',
        f.firmaUnvan,
        f.kaydeden || '',
      ]),
      [
        '',
        'TOPLAM',
        String(aylikToplam.icme),
        String(aylikToplam.sanayi),
        String(aylikToplam.damaca),
        String(aylikToplam.toplam),
        '',
        '',
        '',
      ],
    ];
    downloadCsv(rows, `yildirim_tanker_${raporYil}_${String(raporAy).padStart(2, '0')}.csv`);
    showStatus?.('success', 'Aylık rapor indirildi.');
  };

  return (
    <div className="space-y-4">
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white cursor-pointer"
            onClick={() => setLightboxUrl(null)}
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt="İrsaliye büyütülmüş"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Truck size={14} className="text-sky-600" /> Yıldırım Tanker İrsaliye Kaydı
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Cari: <strong>{firmaUnvan}</strong>
              {' — '}içme / sanayi / damaca kalemleri. Kayıt yönetici onayına gider; onayda irsaliye
              oluşur (Şeker Vidanjör gibi).
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
            <label className="text-[9px] font-black text-slate-500 uppercase">İrsaliye / Fiş No *</label>
            <input
              required
              value={fisNo}
              onChange={(e) => setFisNo(e.target.value)}
              placeholder="Örn: YT-001"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">İrsaliye Görseli *</label>
            <label className="flex items-center justify-center gap-2 w-full bg-sky-50 border border-dashed border-sky-300 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-sky-100">
              <Camera size={14} className="text-sky-600" />
              <span className="font-bold text-sky-700 text-[10px]">
                {fisGorselUrl ? 'Görsel seçildi — değiştir' : 'Fotoğraf / evrak yükle'}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFoto} />
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">Tanker İçme Suyu (Ton)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={icmeSuyuAdet}
              onChange={(e) => setIcmeSuyuAdet(e.target.value)}
              placeholder="0"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase">Tanker Sanayi Suyu (Ton)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={sanayiSuyuAdet}
              onChange={(e) => setSanayiSuyuAdet(e.target.value)}
              placeholder="0"
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
              placeholder="0"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
            />
          </div>

          {fisGorselUrl && (
            <div className="sm:col-span-2 relative">
              <button
                type="button"
                onClick={() => openFoto(fisGorselUrl)}
                className="w-full cursor-pointer group relative"
                title="Büyüt"
              >
                <img
                  src={fisGorselUrl}
                  alt="İrsaliye"
                  className="max-h-40 w-full rounded-xl border border-slate-200 object-contain bg-slate-50"
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[9px] font-black bg-black/65 text-white px-2 py-1 rounded-full">
                  <ZoomIn size={11} /> Büyüt
                </span>
              </button>
            </div>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-w-[140px] bg-sky-600 hover:bg-sky-700 text-white font-black text-[10px] py-3 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              {editingId ? 'GÜNCELLE → ONAYA' : 'ONAYA GÖNDER'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-[10px] cursor-pointer"
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
          {formatDateLabelTr(islemTarihi)} — Kayıtlı İrsaliyeler ({gunlukListe.length})
        </h4>
        {gunlukListe.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Bu tarihte kayıt yok.</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {gunlukListe.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px]"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {f.fisGorselUrl ? (
                    <button
                      type="button"
                      onClick={() => openFoto(f.fisGorselUrl)}
                      className="relative shrink-0 cursor-pointer group"
                      title="Büyüt"
                    >
                      <img
                        src={f.fisGorselUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover border"
                      />
                      <span className="absolute inset-0 rounded-lg bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <ZoomIn size={12} className="text-white" />
                      </span>
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate flex items-center gap-1.5 flex-wrap">
                      {f.fisNo} {durumBadge(f.durum)}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      İçme: <strong>{f.icmeSuyuAdet} ton</strong> · Sanayi: <strong>{f.sanayiSuyuAdet} ton</strong> ·
                      Damacana: <strong>{f.damacaAdet || 0} adet</strong>
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(f)}
                    disabled={f.durum === 'ONAYLANDI'}
                    className="p-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 cursor-pointer disabled:opacity-40"
                    title="Düzenle"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSil(f)}
                    disabled={f.durum === 'ONAYLANDI'}
                    className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer disabled:opacity-40"
                    title="Sil"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl p-4 border space-y-3 ${
          eslesme.faturaSayisi > 0 && !eslesme.uyumlu
            ? 'bg-rose-50 border-rose-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
            Ay Sonu Fatura Eşleşmesi — {firmaUnvan}
          </h4>
          <p className="text-[9px] text-slate-500">
            Onaylı fiş: İ{eslesme.fisIcme} · S{eslesme.fisSanayi} · D{eslesme.fisDamaca}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="bg-white/80 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Fiş toplam</span>
            <strong className="text-slate-900 text-sm">{eslesme.fisToplam}</strong>
          </div>
          <div className="bg-white/80 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Fatura toplam</span>
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
          <p className="text-[10px] text-rose-700 font-semibold">
            Onaylı irsaliye adetleri ile fatura kalem toplamı uyuşmuyor — fatura geldiğinde kontrol edin.
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

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
            Aylık Rapor — {firmaUnvan}
          </h4>
          <div className="flex gap-2 items-center">
            <select
              value={raporAy}
              onChange={(e) => setRaporAy(Number(e.target.value))}
              className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {String(i + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
            <select
              value={raporYil}
              onChange={(e) => setRaporYil(Number(e.target.value))}
              className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRaporIndir}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg cursor-pointer"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
          <div className="bg-slate-50 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">İçme (Ton)</span>
            <strong className="text-slate-900 text-sm">{aylikToplam.icme}</strong>
          </div>
          <div className="bg-slate-50 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Sanayi (Ton)</span>
            <strong className="text-slate-900 text-sm">{aylikToplam.sanayi}</strong>
          </div>
          <div className="bg-slate-50 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Damacana (Adet)</span>
            <strong className="text-slate-900 text-sm">{aylikToplam.damaca}</strong>
          </div>
          <div className="bg-slate-50 border rounded-xl p-2">
            <span className="text-[9px] text-slate-500 block uppercase">Fiş adedi</span>
            <strong className="text-slate-900 text-sm">{aylikFisler.length}</strong>
          </div>
        </div>
        <div className="max-h-[200px] overflow-y-auto space-y-1">
          {aylikFisler
            .filter((f) => isYildirimTankerFirma(f.firmaUnvan) || f.firmaUnvan === firmaUnvan)
            .map((f) => (
              <div key={f.id} className="text-[10px] flex justify-between gap-2 border-b border-slate-100 py-1.5 items-center">
                <span className="font-mono text-slate-600">{f.tarih}</span>
                <span className="font-bold text-slate-800 truncate">{f.fisNo}</span>
                <span>İ:{f.icmeSuyuAdet}t</span>
                <span>S:{f.sanayiSuyuAdet}t</span>
                <span>D:{f.damacaAdet || 0}</span>
                {durumBadge(f.durum)}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
