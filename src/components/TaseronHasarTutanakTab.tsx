import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, Edit3, Eye, Plus, Search, Trash2,
} from 'lucide-react';
import { CariKart, HazirTutanak, MalzemeTeslimKalem } from '../types/erp';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey } from '../lib/dateKeyUtils';
import { PARSEL_LIST, blokListForParsel } from '../data/parselBlokMap';
import { firmaEslesir, getTaseronCariKartlar } from '../lib/taseronUtils';
import { hasarKalemlerindeFiyatVar, openTaseronHasarTutanakPrint } from '../lib/taseronHasarTutanakReport';

export const TASERON_HASAR_KAYNAK = 'PERSONEL_IZIN_HASAR';

const BIRIMLER = ['Adet', 'm²', 'm³', 'm', 'kg', 'ton', 'lt', 'takım'];

function emptyKalem(): MalzemeTeslimKalem {
  return {
    id: `hk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    malzemeAdi: '',
    miktar: '',
    cinsi: 'Adet',
    aciklama: '',
    birimFiyat: '',
  };
}

const MiniImzaPad: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({
  value,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (drawing.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!value) return;
    const img = new Image();
    img.onload = () => {
      if (drawing.current) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
    };
    img.src = value;
  }, [value]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    return {
      x: ((src.clientX - r.left) / r.width) * c.width,
      y: ((src.clientY - r.top) / r.height) * c.height,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const p = pos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL('image/png'));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden relative">
      <canvas
        ref={canvasRef}
        width={320}
        height={88}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
        className="w-full h-[72px] cursor-crosshair bg-slate-50 touch-none"
      />
      {!value && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <span className="text-[10px] text-slate-400 font-medium">İmza çizin</span>
        </div>
      )}
    </div>
  );
}

interface TaseronHasarTutanakTabProps {
  hazirTutanaklar: HazirTutanak[];
  setHazirTutanaklar: React.Dispatch<React.SetStateAction<HazirTutanak[]>>;
  cariKartlar?: CariKart[];
  currentUser?: { email?: string | null; displayName?: string | null };
}

export const TaseronHasarTutanakTab: React.FC<TaseronHasarTutanakTabProps> = ({
  hazirTutanaklar,
  setHazirTutanaklar,
  cariKartlar = [],
  currentUser,
}) => {
  const [konu, setKonu] = useState('Hasarlı Bölge Tespit Tutanağı');
  const [tarih, setTarih] = useState(todayDateKey());
  const [parsel, setParsel] = useState(PARSEL_LIST[0] || 'GENEL SAHA');
  const [blok, setBlok] = useState('');
  const [taseronKaynak, setTaseronKaynak] = useState('');
  const [taseronManuel, setTaseronManuel] = useState('');
  const [taseronYetkili, setTaseronYetkili] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [fotolar, setFotolar] = useState<string[]>([]);
  const [hazirlayanAd, setHazirlayanAd] = useState(currentUser?.displayName || '');
  const [hazirlayanImza, setHazirlayanImza] = useState('');
  const [taseronImza, setTaseronImza] = useState('');
  const [kalemler, setKalemler] = useState<MalzemeTeslimKalem[]>([]);
  const [showMaddi, setShowMaddi] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const taseronCariler = useMemo(() => getTaseronCariKartlar(cariKartlar), [cariKartlar]);
  const bloklar = useMemo(() => {
    const list = blokListForParsel(parsel);
    return list.length ? list : ['GENEL SAHA'];
  }, [parsel]);

  useEffect(() => {
    if (!bloklar.includes(blok)) setBlok(bloklar[0] || '');
  }, [parsel, bloklar, blok]);

  const kayitlar = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (hazirTutanaklar || [])
      .filter((t) => t.kaynak === TASERON_HASAR_KAYNAK)
      .filter((t) => {
        if (!q) return true;
        return [t.taseronAdi, t.taseronYetkili, t.konu, t.icerik, t.belgeNo, t.parsel, t.blok]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
  }, [hazirTutanaklar, searchQuery]);

  const resolveTaseron = (): { cariKartId?: string; taseronAdi: string } => {
    if (taseronKaynak && taseronKaynak !== 'MANUEL') {
      const c = taseronCariler.find((x) => x.id === taseronKaynak) || cariKartlar.find((x) => x.id === taseronKaynak);
      return { cariKartId: c?.id, taseronAdi: c?.unvan || '' };
    }
    const name = taseronManuel.trim();
    if (!name) return { taseronAdi: '' };
    const match =
      taseronCariler.find((c) => firmaEslesir(c.unvan, name)) ||
      cariKartlar.find((c) => firmaEslesir(c.unvan, name));
    return { cariKartId: match?.id, taseronAdi: match?.unvan || name };
  };

  const resetForm = () => {
    setEditingId(null);
    setKonu('Hasarlı Bölge Tespit Tutanağı');
    setTarih(todayDateKey());
    setParsel(PARSEL_LIST[0] || 'GENEL SAHA');
    setBlok('');
    setTaseronKaynak('');
    setTaseronManuel('');
    setTaseronYetkili('');
    setAciklama('');
    setFotolar([]);
    setHazirlayanAd(currentUser?.displayName || '');
    setHazirlayanImza('');
    setTaseronImza('');
    setKalemler([]);
    setShowMaddi(false);
  };

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remain = 3 - fotolar.length;
    const picked = files.slice(0, remain);
    const next: string[] = [];
    for (const file of picked) {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Dosya okunamadı'));
        reader.readAsDataURL(file as unknown as Blob);
      });
      next.push(await compressImage(raw, 900, 900, 0.65));
    }
    setFotolar((prev) => [...prev, ...next].slice(0, 3));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const { cariKartId, taseronAdi } = resolveTaseron();
    if (!konu.trim()) {
      alert('Tutanak konusu zorunludur.');
      return;
    }
    if (!taseronAdi) {
      alert('Taşeron firma seçin veya yazın.');
      return;
    }
    if (!taseronYetkili.trim()) {
      alert('Taşeron firma yetkilisini belirtin.');
      return;
    }
    if (!aciklama.trim()) {
      alert('Hasar detayı / açıklama zorunludur.');
      return;
    }
    if (fotolar.length === 0) {
      alert('En az bir hasar fotoğrafı ekleyin.');
      return;
    }

    const validKalemler = kalemler
      .filter((k) => String(k.malzemeAdi || '').trim())
      .map((k) => ({
        ...k,
        malzemeAdi: String(k.malzemeAdi).trim(),
        miktar: k.miktar === '' ? '' : Number(String(k.miktar).replace(',', '.')) || k.miktar,
        cinsi: String(k.cinsi || '').trim() || 'Adet',
        aciklama: String(k.aciklama || '').trim(),
        birimFiyat: k.birimFiyat === '' || k.birimFiyat == null ? '' : Number(String(k.birimFiyat).replace(',', '.')) || '',
      }));

    setSaving(true);
    try {
      if (editingId) {
        setHazirTutanaklar((prev) =>
          prev.map((ht) =>
            ht.id !== editingId
              ? ht
              : {
                  ...ht,
                  konu: konu.trim(),
                  tarih,
                  icerik: aciklama.trim(),
                  aciklama: aciklama.trim(),
                  taseronAdi,
                  cariKartId: cariKartId || ht.cariKartId,
                  taseronYetkili: taseronYetkili.trim(),
                  parsel,
                  blok,
                  foto1: fotolar[0] || '',
                  foto2: fotolar[1] || '',
                  foto3: fotolar[2] || '',
                  hazirlayanAd: hazirlayanAd.trim(),
                  hazirlayanImza,
                  taseronImza,
                  kalemler: validKalemler,
                }
          )
        );
        alert('Hasar tutanağı güncellendi.');
      } else {
        const newDoc: HazirTutanak = {
          id: `th_${Date.now()}`,
          tutanakTipi: 'HASAR',
          belgeNo: `TUT-HAS-${Date.now().toString().slice(-6)}`,
          konu: konu.trim(),
          tarih,
          icerik: aciklama.trim(),
          durum: 'TASLAK',
          aciklama: aciklama.trim(),
          taseronAdi,
          cariKartId,
          taseronYetkili: taseronYetkili.trim(),
          parsel,
          blok,
          foto1: fotolar[0] || '',
          foto2: fotolar[1] || '',
          foto3: fotolar[2] || '',
          hazirlayanAd: hazirlayanAd.trim(),
          hazirlayanImza,
          taseronImza,
          kalemler: validKalemler,
          kaynak: TASERON_HASAR_KAYNAK,
        };
        setHazirTutanaklar((prev) => [newDoc, ...prev]);
        alert(`${newDoc.belgeNo} kaydedildi. Raporu yazdırabilir, maddi kalemleri sonradan girebilirsiniz.`);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (ht: HazirTutanak) => {
    setEditingId(ht.id);
    setKonu(ht.konu || 'Hasarlı Bölge Tespit Tutanağı');
    setTarih(ht.tarih || todayDateKey());
    setParsel(ht.parsel || PARSEL_LIST[0] || 'GENEL SAHA');
    setBlok(ht.blok || '');
    setAciklama(ht.icerik || ht.aciklama || '');
    setFotolar([ht.foto1, ht.foto2, ht.foto3].filter(Boolean) as string[]);
    setTaseronYetkili(ht.taseronYetkili || '');
    setHazirlayanAd(ht.hazirlayanAd || '');
    setHazirlayanImza(ht.hazirlayanImza || '');
    setTaseronImza(ht.taseronImza || '');
    setKalemler(ht.kalemler?.length ? ht.kalemler.map((k) => ({ ...k })) : []);
    setShowMaddi(true);
    if (ht.cariKartId && taseronCariler.some((c) => c.id === ht.cariKartId)) {
      setTaseronKaynak(ht.cariKartId);
      setTaseronManuel('');
    } else if (ht.taseronAdi) {
      const match = taseronCariler.find((c) => c.unvan === ht.taseronAdi);
      if (match) {
        setTaseronKaynak(match.id);
        setTaseronManuel('');
      } else {
        setTaseronKaynak('MANUEL');
        setTaseronManuel(ht.taseronAdi);
      }
    } else {
      setTaseronKaynak('');
      setTaseronManuel('');
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Bu hasar tutanağını silmek istediğinize emin misiniz?')) return;
    setHazirTutanaklar((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) resetForm();
  };

  const updateKalem = (id: string, patch: Partial<MalzemeTeslimKalem>) => {
    setKalemler((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  };

  return (
    <div className="flex-grow overflow-hidden flex flex-col lg:flex-row p-6 gap-6 relative">
      <div className="w-full lg:w-[430px] bg-white border border-[#e2e8f0] rounded-2xl p-5 flex flex-col overflow-y-auto shrink-0 shadow-sm">
        <div className="border-b pb-3 mb-4 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-black text-xs text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {editingId ? 'Hasar Tutanağını Düzenle' : 'Yeni Hasar Tutanağı'}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase font-mono">
              Taşeron seçilir, hasar fotoğraflanır, muhataplar imzalar
            </p>
          </div>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline shrink-0">
              Vazgeç
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tutanak konusu *</label>
            <input
              value={konu}
              onChange={(e) => setKonu(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:border-amber-400 focus:bg-white outline-none font-bold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tarih *</label>
              <input
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:border-amber-400 outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Parsel</label>
              <select
                value={parsel}
                onChange={(e) => setParsel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:border-amber-400 outline-none font-bold"
              >
                {PARSEL_LIST.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Blok / Alan</label>
            <select
              value={blok}
              onChange={(e) => setBlok(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:border-amber-400 outline-none font-bold"
            >
              {bloklar.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Taşeron firma *</label>
            <select
              value={taseronKaynak}
              onChange={(e) => {
                const v = e.target.value;
                setTaseronKaynak(v);
                if (v && v !== 'MANUEL') {
                  const c = taseronCariler.find((x) => x.id === v);
                  if (c?.yetkili && !taseronYetkili.trim()) setTaseronYetkili(c.yetkili);
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:border-amber-400 outline-none font-bold"
            >
              <option value="">Cari listeden seçin…</option>
              {taseronCariler.map((c) => (
                <option key={c.id} value={c.id}>{c.unvan}</option>
              ))}
              <option value="MANUEL">Elle yaz…</option>
            </select>
            {taseronKaynak === 'MANUEL' && (
              <input
                value={taseronManuel}
                onChange={(e) => setTaseronManuel(e.target.value)}
                placeholder="Firma unvanı"
                className="mt-2 w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none font-bold"
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Taşeron firma yetkilisi *</label>
            <input
              value={taseronYetkili}
              onChange={(e) => setTaseronYetkili(e.target.value)}
              placeholder="Ad soyad"
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none font-bold"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hasar detayı ve olay açıklaması *</label>
            <textarea
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="Örn: 2. blok şaft boşluğunda asansör kasasının hasar aldığı tespit edilmiştir…"
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-semibold h-24 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Tutanak görselleri ({fotolar.length}/3) *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {fotolar.map((img, idx) => (
                <div key={idx} className="relative aspect-square border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
                  <img src={img} alt="Hasar" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFotolar((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute top-0.5 right-0.5 p-1 bg-red-500 rounded-lg text-white"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {fotolar.length < 3 && (
                <label className="aspect-square border border-dashed border-slate-300 hover:border-amber-400 rounded-xl flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-white">
                  <Camera size={20} className="text-slate-400" />
                  <span className="text-[8px] text-slate-400 font-bold mt-1">Ekle</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => void handleFotoUpload(e)} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2 bg-amber-50/30">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Muhatap imzaları</p>
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Kibritçi yetkilisi</label>
              <input
                value={hazirlayanAd}
                onChange={(e) => setHazirlayanAd(e.target.value)}
                placeholder="Ad soyad"
                className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg mb-1.5 outline-none font-semibold"
              />
              <MiniImzaPad key={`k_${editingId || 'new'}`} value={hazirlayanImza} onChange={setHazirlayanImza} />
              {hazirlayanImza && (
                <button type="button" onClick={() => setHazirlayanImza('')} className="text-[9px] text-rose-600 font-bold mt-1">
                  İmza temizle
                </button>
              )}
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Taşeron yetkilisi imzası</label>
              <MiniImzaPad key={`t_${editingId || 'new'}`} value={taseronImza} onChange={setTaseronImza} />
              {taseronImza && (
                <button type="button" onClick={() => setTaseronImza('')} className="text-[9px] text-rose-600 font-bold mt-1">
                  İmza temizle
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Maddi kalemler</p>
              <button
                type="button"
                onClick={() => {
                  setShowMaddi((v) => !v);
                  if (!showMaddi && kalemler.length === 0) setKalemler([emptyKalem()]);
                }}
                className="text-[9px] font-bold text-amber-700 underline"
              >
                {showMaddi ? 'Gizle' : editingId ? 'Birim fiyat gir / düzenle' : 'İsteğe bağlı ekle'}
              </button>
            </div>
            <p className="text-[9px] text-slate-400">
              Birim fiyat rapor açılırken zorunlu değildir. Sonradan düzenlemeden girilebilir.
            </p>
            {showMaddi && (
              <div className="space-y-2">
                {kalemler.map((k) => (
                  <div key={k.id} className="grid grid-cols-12 gap-1.5 items-end">
                    <input
                      value={k.malzemeAdi}
                      onChange={(e) => updateKalem(k.id, { malzemeAdi: e.target.value })}
                      placeholder="Kalem"
                      className="col-span-5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px]"
                    />
                    <input
                      value={String(k.miktar)}
                      onChange={(e) => updateKalem(k.id, { miktar: e.target.value })}
                      placeholder="Miktar"
                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px]"
                    />
                    <select
                      value={k.cinsi}
                      onChange={(e) => updateKalem(k.id, { cinsi: e.target.value })}
                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-1 py-1.5 text-[10px]"
                    >
                      {BIRIMLER.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <input
                      value={String(k.birimFiyat ?? '')}
                      onChange={(e) => updateKalem(k.id, { birimFiyat: e.target.value })}
                      placeholder="₺ fiyat"
                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px]"
                    />
                    <button
                      type="button"
                      onClick={() => setKalemler((prev) => prev.filter((x) => x.id !== k.id))}
                      className="col-span-1 text-rose-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setKalemler((prev) => [...prev, emptyKalem()])}
                  className="text-[10px] font-bold text-slate-600 inline-flex items-center gap-1"
                >
                  <Plus size={11} /> Kalem ekle
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-3 rounded-2xl disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Kaydediliyor…' : editingId ? 'Raporu güncelle' : '+ Hasar tutanağını kaydet'}
          </button>
        </form>
      </div>

      <div className="flex-1 bg-white border border-[#e2e8f0] rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-[420px]">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Hasar tutanakları arşivi</h3>
            <p className="text-[9px] text-slate-400 font-mono uppercase">{kayitlar.length} kayıt</p>
          </div>
          <div className="relative w-52">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Firma, yetkili, konu ara…"
              className="w-full bg-white pl-8 pr-3 py-1.5 border rounded-lg text-[11px] focus:ring-1 focus:ring-amber-400"
            />
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {kayitlar.length === 0 ? (
            <p className="text-center p-10 text-slate-400 font-bold italic text-xs">Kayıtlı taşeron hasar tutanağı yok.</p>
          ) : (
            kayitlar.map((item) => {
              const fotolarItem = [item.foto1, item.foto2, item.foto3].filter(Boolean) as string[];
              const fiyatli = hasarKalemlerindeFiyatVar(item);
              const imzali = Boolean(item.hazirlayanImza && item.taseronImza);
              return (
                <div key={item.id} className="border rounded-xl p-4 bg-white shadow-inner flex flex-col hover:border-amber-300 transition">
                  <div className="flex justify-between items-start border-b pb-2 mb-2">
                    <div>
                      <h5 className="font-black text-slate-900 text-sm">{item.taseronAdi}</h5>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{item.taseronYetkili || 'Yetkili belirtilmedi'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-full uppercase ${imzali ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {imzali ? '✓ Karşılıklı imza' : 'İmza bekliyor'}
                      </span>
                      <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-full uppercase ${fiyatli ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>
                        {fiyatli ? 'Maddi kalem girildi' : 'Birim fiyat yok'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10.5px] mb-2">
                    <div className="bg-slate-50 p-1.5 rounded text-center">
                      <span className="text-slate-400 block text-[8px] uppercase font-mono">Tarih</span>
                      <strong>{item.tarih}</strong>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded text-center">
                      <span className="text-slate-400 block text-[8px] uppercase font-mono">Parsel / Blok</span>
                      <strong>{item.parsel || '—'}/{item.blok || '—'}</strong>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded text-center">
                      <span className="text-slate-400 block text-[8px] uppercase font-mono">Belge</span>
                      <strong className="font-mono">{item.belgeNo}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 italic bg-amber-50/40 p-2.5 rounded border border-amber-100 line-clamp-3">
                    {item.icerik}
                  </p>
                  {fotolarItem.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {fotolarItem.map((src, i) => (
                        <img key={i} src={src} alt="" className="w-10 h-10 rounded-lg border object-cover" />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t pt-3.5 mt-3 justify-end text-[10px]">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 font-bold py-1.5 px-3 rounded-lg flex items-center gap-1"
                    >
                      <Edit3 size={12} /> Düzenle / Güncelle
                    </button>
                    <button
                      type="button"
                      onClick={() => openTaseronHasarTutanakPrint(item)}
                      className="bg-slate-900 hover:bg-slate-950 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1"
                    >
                      <Eye size={12} /> PDF Formu Gör / Yazdır
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-red-800 bg-red-50 hover:bg-red-100 py-1 px-2 rounded"
                      title="Sil"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
