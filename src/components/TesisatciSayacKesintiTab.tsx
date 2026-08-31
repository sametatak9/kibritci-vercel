import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera, Check, Gauge, Pencil, Trash2, RefreshCw, Zap, Droplets, Flame
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  CariKart,
  CariKartIslem,
  TesisatciEnerjiTuru,
  TesisatciSayacKesinti,
} from '../types/erp';
import { db } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey, formatDateLabelTr } from '../lib/dateKeyUtils';
import { enerjiTuruBirim, enerjiTuruLabel } from '../lib/yildirimTankerUtils';

interface Props {
  cariKartlar?: CariKart[];
  currentUser: any;
  setCariIslemGecmisi?: React.Dispatch<React.SetStateAction<CariKartIslem[]>>;
  addNotification?: (mesaj: string, meta?: Record<string, unknown>) => void | Promise<void>;
  showStatus?: (type: 'success' | 'error' | 'info', text: string) => void;
}

const ENERJI_OPTIONS: Array<{
  key: TesisatciEnerjiTuru;
  label: string;
  icon: React.ElementType;
  tone: string;
}> = [
  { key: 'ELEKTRIK', label: 'Elektrik', icon: Zap, tone: 'bg-amber-500 text-slate-950' },
  { key: 'SU', label: 'Su', icon: Droplets, tone: 'bg-sky-600 text-white' },
  { key: 'DOGALGAZ', label: 'Doğalgaz', icon: Flame, tone: 'bg-orange-600 text-white' },
];

async function readCompressedImage(file: File): Promise<string> {
  const reader = new FileReader();
  const raw = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return file.type.startsWith('image/') ? compressImage(raw, 1280, 1280, 0.75) : raw;
}

/** Tesisatçı — taşeron sayaç kesintisi (ilk/son ölçüm × birim fiyat → cari geçmiş) */
export const TesisatciSayacKesintiTab: React.FC<Props> = ({
  cariKartlar = [],
  currentUser,
  setCariIslemGecmisi,
  addNotification,
  showStatus,
}) => {
  const taseronlar = useMemo(
    () =>
      (cariKartlar || [])
        .filter((c) => c.kartTipi === 'TASERON' && c.durum !== 'PASIF')
        .sort((a, b) => a.unvan.localeCompare(b.unvan, 'tr')),
    [cariKartlar]
  );

  const [tarih, setTarih] = useState(todayDateKey());
  const [enerjiTuru, setEnerjiTuru] = useState<TesisatciEnerjiTuru>('ELEKTRIK');
  const [cariId, setCariId] = useState('');
  const [ilkOlcum, setIlkOlcum] = useState('');
  const [sonOlcum, setSonOlcum] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [ilkFotoUrl, setIlkFotoUrl] = useState('');
  const [sonFotoUrl, setSonFotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kayitlar, setKayitlar] = useState<TesisatciSayacKesinti[]>([]);
  const [filtreCariId, setFiltreCariId] = useState('HEPSI');
  const [filtreAy, setFiltreAy] = useState(() => new Date().getMonth() + 1);
  const [filtreYil, setFiltreYil] = useState(() => new Date().getFullYear());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tesisatciSayacKesintileri'), (snap) => {
      const list: TesisatciSayacKesinti[] = [];
      snap.forEach((d) =>
        list.push({ id: d.id, ...(d.data() as Omit<TesisatciSayacKesinti, 'id'>) })
      );
      list.sort(
        (a, b) =>
          String(b.tarih).localeCompare(String(a.tarih)) ||
          String(b.olusturulma).localeCompare(String(a.olusturulma))
      );
      setKayitlar(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!cariId && taseronlar.length > 0) setCariId(taseronlar[0].id);
  }, [taseronlar, cariId]);

  const ilkN = Number(ilkOlcum);
  const sonN = Number(sonOlcum);
  const birimN = Number(birimFiyat);
  const fark =
    Number.isFinite(ilkN) && Number.isFinite(sonN) ? Math.max(0, sonN - ilkN) : 0;
  const tutar =
    Number.isFinite(birimN) && birimN >= 0 ? Math.round(fark * birimN * 100) / 100 : 0;

  const aylikListe = useMemo(() => {
    const prefix = `${filtreYil}-${String(filtreAy).padStart(2, '0')}`;
    return kayitlar.filter((k) => {
      if (!String(k.tarih || '').startsWith(prefix)) return false;
      if (filtreCariId !== 'HEPSI' && k.taseronCariId !== filtreCariId) return false;
      return true;
    });
  }, [kayitlar, filtreAy, filtreYil, filtreCariId]);

  const aylikToplam = useMemo(
    () => aylikListe.reduce((s, k) => s + (Number(k.tutar) || 0), 0),
    [aylikListe]
  );

  const resetForm = () => {
    setIlkOlcum('');
    setSonOlcum('');
    setBirimFiyat('');
    setIlkFotoUrl('');
    setSonFotoUrl('');
    setEditingId(null);
    setTarih(todayDateKey());
  };

  const handleFoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    which: 'ilk' | 'son'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await readCompressedImage(file);
      if (which === 'ilk') setIlkFotoUrl(url);
      else setSonFotoUrl(url);
    } catch {
      showStatus?.('error', 'Fotoğraf yüklenemedi.');
    }
    e.target.value = '';
  };

  const handleKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    const cari = taseronlar.find((c) => c.id === cariId);
    if (!cari) {
      showStatus?.('error', 'Taşeron firma seçin.');
      return;
    }
    if (!Number.isFinite(ilkN) || !Number.isFinite(sonN)) {
      showStatus?.('error', 'İlk ve son ölçüm geçerli sayı olmalı.');
      return;
    }
    if (sonN < ilkN) {
      showStatus?.('error', 'Son ölçüm ilk ölçümden küçük olamaz.');
      return;
    }
    if (!Number.isFinite(birimN) || birimN < 0) {
      showStatus?.('error', 'Birim fiyat geçerli olmalı.');
      return;
    }
    if (fark <= 0) {
      showStatus?.('error', 'Sayaç farkı 0 olamaz.');
      return;
    }
    if (!ilkFotoUrl && !editingId) {
      showStatus?.('error', 'Sayaçın ilk hali fotoğrafını yükleyin.');
      return;
    }
    if (!sonFotoUrl && !editingId) {
      showStatus?.('error', 'Sayaçın son hali fotoğrafını yükleyin.');
      return;
    }

    setSaving(true);
    try {
      const id = editingId || `tsk_${Date.now()}`;
      const existing = editingId ? kayitlar.find((k) => k.id === editingId) : null;
      const cariIslemId = existing?.cariIslemId || `cari_islem_tsk_${id}`;
      const birim = enerjiTuruBirim(enerjiTuru);
      const turLabel = enerjiTuruLabel(enerjiTuru);

      const kayit: TesisatciSayacKesinti = {
        id,
        tarih,
        enerjiTuru,
        taseronCariId: cari.id,
        taseronFirmaAdi: cari.unvan,
        ilkOlcum: ilkN,
        sonOlcum: sonN,
        fark,
        birimFiyat: birimN,
        tutar,
        ilkFotoUrl: ilkFotoUrl || existing?.ilkFotoUrl || '',
        sonFotoUrl: sonFotoUrl || existing?.sonFotoUrl || '',
        cariIslemId,
        kaydeden: currentUser?.email || 'tesisatci',
        olusturulma: existing?.olusturulma || new Date().toISOString(),
        guncellenme: new Date().toISOString(),
      };

      await setDoc(doc(db, 'tesisatciSayacKesintileri', id), kayit);

      const cariIslem: CariKartIslem = {
        id: cariIslemId,
        cariKartId: cari.id,
        islemTipi: 'OPERATOR_KESINTI',
        islemId: id,
        islemBaslik: `${turLabel} Sayaç Kesintisi · ${cari.unvan}`,
        islemDetay: `${tarih} · ${turLabel}: ${ilkN} → ${sonN} ${birim} (fark ${fark}) × ${birimN.toLocaleString('tr-TR')} ₺ = ${tutar.toLocaleString('tr-TR')} ₺`,
        tutar,
        tarih,
        belgeNo: id,
      };

      await setDoc(doc(db, 'cariIslemGecmisi', cariIslemId), cariIslem);
      if (setCariIslemGecmisi) {
        setCariIslemGecmisi((prev) => {
          const rest = (prev || []).filter((x) => x.id !== cariIslemId);
          return [cariIslem, ...rest];
        });
      }

      if (addNotification) {
        await addNotification(
          `Taşeron sayaç kesintisi: ${cari.unvan} · ${turLabel} · ${tutar.toLocaleString('tr-TR')} ₺`
        );
      }
      showStatus?.(
        'success',
        editingId
          ? 'Kesinti güncellendi; cari geçmişe yansıtıldı.'
          : 'Kesinti kaydedildi; taşeron cari geçmişine eklendi.'
      );
      resetForm();
    } catch (err: any) {
      console.error(err);
      showStatus?.('error', 'Kayıt başarısız: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (k: TesisatciSayacKesinti) => {
    setEditingId(k.id);
    setTarih(k.tarih);
    setEnerjiTuru(k.enerjiTuru);
    setCariId(k.taseronCariId);
    setIlkOlcum(String(k.ilkOlcum));
    setSonOlcum(String(k.sonOlcum));
    setBirimFiyat(String(k.birimFiyat));
    setIlkFotoUrl(k.ilkFotoUrl || '');
    setSonFotoUrl(k.sonFotoUrl || '');
  };

  const handleSil = async (k: TesisatciSayacKesinti) => {
    if (!window.confirm(`${k.taseronFirmaAdi} · ${enerjiTuruLabel(k.enerjiTuru)} kesintisi silinsin mi?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'tesisatciSayacKesintileri', k.id));
      if (k.cariIslemId) {
        try {
          await deleteDoc(doc(db, 'cariIslemGecmisi', k.cariIslemId));
        } catch {
          /* ignore */
        }
        if (setCariIslemGecmisi) {
          setCariIslemGecmisi((prev) => (prev || []).filter((x) => x.id !== k.cariIslemId));
        }
      }
      if (editingId === k.id) resetForm();
      showStatus?.('success', 'Kesinti silindi.');
    } catch (err: any) {
      showStatus?.('error', 'Silinemedi: ' + (err?.message || ''));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Gauge size={14} className="text-violet-600" /> Taşeron Sayaç Kesinti
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            İlk / son ölçüm farkı × birim fiyat → ilgili taşeron cari geçmişine kesinti
          </p>
        </div>

        <form onSubmit={handleKaydet} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[9px] font-black text-slate-500 uppercase">Tarih *</span>
              <input
                type="date"
                required
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[9px] font-black text-slate-500 uppercase">Taşeron Firma *</span>
              <select
                required
                value={cariId}
                onChange={(e) => setCariId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
              >
                {taseronlar.length === 0 && <option value="">Taşeron cari yok</option>}
                {taseronlar.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.unvan}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] font-black text-slate-500 uppercase block">Enerji Türü *</span>
            <div className="grid grid-cols-3 gap-2">
              {ENERJI_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = enerjiTuru === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setEnerjiTuru(opt.key)}
                    className={`min-h-[44px] rounded-xl px-2 py-2 flex flex-col items-center justify-center gap-0.5 font-black text-[10px] uppercase border cursor-pointer ${
                      active
                        ? `${opt.tone} border-transparent`
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    <Icon size={14} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 block">
              <span className="text-[9px] font-black text-slate-500 uppercase">
                İlk ölçüm ({enerjiTuruBirim(enerjiTuru)}) *
              </span>
              <input
                required
                type="number"
                min={0}
                step="any"
                value={ilkOlcum}
                onChange={(e) => setIlkOlcum(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[9px] font-black text-slate-500 uppercase">
                Son ölçüm ({enerjiTuruBirim(enerjiTuru)}) *
              </span>
              <input
                required
                type="number"
                min={0}
                step="any"
                value={sonOlcum}
                onChange={(e) => setSonOlcum(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[9px] font-black text-slate-500 uppercase">Birim fiyat (₺) *</span>
              <input
                required
                type="number"
                min={0}
                step="any"
                value={birimFiyat}
                onChange={(e) => setBirimFiyat(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
              <span className="text-[9px] text-slate-500 uppercase block">Fark</span>
              <strong className="text-sm text-slate-900 tabular-nums">
                {fark.toLocaleString('tr-TR')} {enerjiTuruBirim(enerjiTuru)}
              </strong>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-2 col-span-2">
              <span className="text-[9px] text-violet-700 uppercase block">Kesinti tutarı</span>
              <strong className="text-base text-violet-900 tabular-nums">
                {tutar.toLocaleString('tr-TR')} ₺
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[9px] font-black text-slate-500 uppercase block">İlk sayaç fotoğrafı *</span>
              <label className="flex items-center justify-center gap-2 w-full bg-violet-50 border border-dashed border-violet-300 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-violet-100">
                <Camera size={14} className="text-violet-600" />
                <span className="font-bold text-violet-700 text-[10px]">
                  {ilkFotoUrl ? 'İlk foto seçildi' : 'İlk hali yükle'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFoto(e, 'ilk')}
                />
              </label>
              {ilkFotoUrl && (
                <img
                  src={ilkFotoUrl}
                  alt="İlk sayaç"
                  className="max-h-28 rounded-xl border object-contain bg-slate-50"
                />
              )}
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-black text-slate-500 uppercase block">Son sayaç fotoğrafı *</span>
              <label className="flex items-center justify-center gap-2 w-full bg-violet-50 border border-dashed border-violet-300 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-violet-100">
                <Camera size={14} className="text-violet-600" />
                <span className="font-bold text-violet-700 text-[10px]">
                  {sonFotoUrl ? 'Son foto seçildi' : 'Son hali yükle'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFoto(e, 'son')}
                />
              </label>
              {sonFotoUrl && (
                <img
                  src={sonFotoUrl}
                  alt="Son sayaç"
                  className="max-h-28 rounded-xl border object-contain bg-slate-50"
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || taseronlar.length === 0}
              className="flex-1 min-w-[140px] bg-violet-600 hover:bg-violet-700 text-white font-black text-[10px] py-3 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              {editingId ? 'GÜNCELLE' : 'KESİNTİYİ KAYDET'}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
            Aylık kesintiler — {formatDateLabelTr(`${filtreYil}-${String(filtreAy).padStart(2, '0')}-01`).replace(/^\d+\s/, '')}
          </h4>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={filtreCariId}
              onChange={(e) => setFiltreCariId(e.target.value)}
              className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white max-w-[160px]"
            >
              <option value="HEPSI">Tüm taşeronlar</option>
              {taseronlar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.unvan}
                </option>
              ))}
            </select>
            <select
              value={filtreAy}
              onChange={(e) => setFiltreAy(Number(e.target.value))}
              className="text-[10px] font-bold border rounded-lg px-2 py-1 bg-white"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {String(i + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
            <select
              value={filtreYil}
              onChange={(e) => setFiltreYil(Number(e.target.value))}
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

        <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 flex justify-between items-center text-[11px]">
          <span className="font-bold text-violet-800">{aylikListe.length} kayıt</span>
          <strong className="text-violet-950 tabular-nums">
            Toplam: {aylikToplam.toLocaleString('tr-TR')} ₺
          </strong>
        </div>

        {aylikListe.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Bu dönemde kayıt yok.</p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {aylikListe.map((k) => (
              <div
                key={k.id}
                className="flex items-start justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px]"
              >
                <div className="min-w-0 flex gap-2">
                  {(k.ilkFotoUrl || k.sonFotoUrl) && (
                    <div className="flex gap-1 shrink-0">
                      {k.ilkFotoUrl && (
                        <img src={k.ilkFotoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                      )}
                      {k.sonFotoUrl && (
                        <img src={k.sonFotoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{k.taseronFirmaAdi}</p>
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      {k.tarih} · <strong>{enerjiTuruLabel(k.enerjiTuru)}</strong> · {k.ilkOlcum}→{k.sonOlcum}{' '}
                      {enerjiTuruBirim(k.enerjiTuru)} (Δ{k.fark})
                    </p>
                    <p className="text-[10px] font-black text-violet-800 mt-0.5 tabular-nums">
                      {Number(k.tutar).toLocaleString('tr-TR')} ₺
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(k)}
                    className="p-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 cursor-pointer"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSil(k)}
                    className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TesisatciSayacKesintiTab;
