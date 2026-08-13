import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Plus, Trash2, Search, Check, RefreshCw, Link2, Package, User, MapPin
} from 'lucide-react';
import { CariKart, SahaSiparisKalem, StokKart } from '../types/erp';
import { KibritciLogo } from './KibritciLogo';
import {
  buildPublicSiparisUrl,
  fetchSiparisKatalog,
  katalogFromErp,
  submitSahaSiparis,
  type SiparisKatalog,
  type SiparisKatalogStok,
} from '../lib/sahaSiparisUtils';

interface SiparisFormuScreenProps {
  isPublic?: boolean;
  onClose?: () => void;
  cariKartlar?: CariKart[];
  stokKartlar?: StokKart[];
  currentUser?: { email?: string | null };
  defaultPersonelAd?: string;
}

const BIRIMLER = ['ADET', 'KG', 'TON', 'M', 'M2', 'M3', 'LT', 'PAKET', 'KUTU', 'TAKIM'];

export const SiparisFormuScreen: React.FC<SiparisFormuScreenProps> = ({
  isPublic = false,
  onClose,
  cariKartlar = [],
  stokKartlar = [],
  currentUser,
  defaultPersonelAd = '',
}) => {
  const [katalog, setKatalog] = useState<SiparisKatalog>({ stoklar: [], tedarikciler: [] });
  const [katalogYukleniyor, setKatalogYukleniyor] = useState(isPublic);
  const [personelAdSoyad, setPersonelAdSoyad] = useState(defaultPersonelAd);
  const [personelGorev, setPersonelGorev] = useState('');
  const [telefon, setTelefon] = useState('');
  const [kullanilacakYer, setKullanilacakYer] = useState('');
  const [cariFirma, setCariFirma] = useState('');
  const [cariKartId, setCariKartId] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [kalemler, setKalemler] = useState<SahaSiparisKalem[]>([]);
  const [urunArama, setUrunArama] = useState('');
  const [miktar, setMiktar] = useState('1');
  const [birim, setBirim] = useState('ADET');
  const [marka, setMarka] = useState('');
  const [seciliStok, setSeciliStok] = useState<SiparisKatalogStok | null>(null);
  const [saving, setSaving] = useState(false);
  const [sonSiparisNo, setSonSiparisNo] = useState('');
  const [linkKopyalandi, setLinkKopyalandi] = useState(false);

  const fromErp = useMemo(() => katalogFromErp(cariKartlar, stokKartlar), [cariKartlar, stokKartlar]);
  const erpKatalog = useMemo(() => {
    if (fromErp.stoklar.length > 0 || fromErp.tedarikciler.length > 0) return fromErp;
    return katalog;
  }, [fromErp, katalog]);

  useEffect(() => {
    if (fromErp.stoklar.length > 0 || fromErp.tedarikciler.length > 0) return;
    let cancelled = false;
    setKatalogYukleniyor(true);
    void fetchSiparisKatalog()
      .then((k) => {
        if (!cancelled) setKatalog(k);
      })
      .finally(() => {
        if (!cancelled) setKatalogYukleniyor(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromErp.stoklar.length, fromErp.tedarikciler.length]);

  const stokOneriler = useMemo(() => {
    const q = urunArama.trim().toLowerCase();
    if (q.length < 2) return [];
    return erpKatalog.stoklar
      .filter(
        (s) =>
          s.stokAdi.toLowerCase().includes(q) ||
          s.stokKodu.toLowerCase().includes(q) ||
          s.kategori.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [erpKatalog.stoklar, urunArama]);

  const tedarikciOneriler = useMemo(() => {
    const q = cariFirma.trim().toLowerCase();
    if (q.length < 2) return [];
    return erpKatalog.tedarikciler.filter((t) => t.unvan.toLowerCase().includes(q)).slice(0, 6);
  }, [erpKatalog.tedarikciler, cariFirma]);

  const addKalem = () => {
    const ad = (seciliStok?.stokAdi || urunArama).trim();
    const qty = Number(String(miktar).replace(',', '.'));
    if (!ad) {
      alert('Malzeme adı girin veya stok listesinden seçin.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Geçerli bir miktar girin.');
      return;
    }
    setKalemler((prev) => [
      ...prev,
      {
        id: `sipk_${Date.now()}`,
        urunAdi: ad,
        miktar: qty,
        birim: birim || seciliStok?.birim || 'ADET',
        marka: marka.trim(),
        stokKartId: seciliStok?.id,
        kullanilacakYer: kullanilacakYer.trim(),
      },
    ]);
    setUrunArama('');
    setMiktar('1');
    setMarka('');
    setSeciliStok(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await submitSahaSiparis({
        personelAdSoyad,
        personelGorev,
        telefon,
        kullanilacakYer,
        cariFirma,
        cariKartId,
        aciklama,
        kalemler,
        olusturanEmail: currentUser?.email || '',
      });
      setSonSiparisNo(result.siparisNo);
      setKalemler([]);
      setAciklama('');
      setKullanilacakYer('');
      setCariFirma('');
      setCariKartId('');
    } catch (err: any) {
      alert(err?.message || 'Sipariş gönderilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = async () => {
    const url = buildPublicSiparisUrl();
    try {
      await navigator.clipboard.writeText(url);
      setLinkKopyalandi(true);
      setTimeout(() => setLinkKopyalandi(false), 2000);
    } catch {
      window.prompt('Linki kopyalayın:', url);
    }
  };

  const shell = (
    <div className={isPublic ? 'min-h-screen bg-slate-950 text-slate-100' : ''}>
      <div className={`mx-auto ${isPublic ? 'max-w-2xl px-4 py-8' : 'max-w-3xl'} space-y-4`}>
        {isPublic && (
          <div className="flex items-center justify-between gap-3">
            <KibritciLogo size="md" className="h-10" />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white cursor-pointer"
              >
                Kapat
              </button>
            )}
          </div>
        )}

        <div
          className={`rounded-2xl border p-4 space-y-1 ${
            isPublic ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <p
            className={`text-[10px] font-black uppercase tracking-[0.18em] ${
              isPublic ? 'text-amber-400' : 'text-emerald-700'
            }`}
          >
            Ortak malzeme siparişi
          </p>
          <h1 className={`text-lg font-black ${isPublic ? 'text-white' : 'text-slate-900'}`}>
            Sipariş Formu
          </h1>
          <p className={`text-[12px] leading-relaxed ${isPublic ? 'text-slate-400' : 'text-slate-500'}`}>
            Personel adını ve malzemenin nerede kullanılacağını yazın. Sipariş Onay Havuzu → Satın
            Alma kuyruğuna düşer; onaylanırsa içeride satın alma talebi oluşur.
            {katalogYukleniyor ? ' Katalog yükleniyor…' : ''}
          </p>
          {!isPublic && (
            <button
              type="button"
              onClick={copyPublicLink}
              className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              {linkKopyalandi ? <Check size={12} /> : <Link2 size={12} />}
              {linkKopyalandi ? 'Link kopyalandı' : 'Üyeliksiz ortak linki kopyala'}
            </button>
          )}
        </div>

        {sonSiparisNo ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 space-y-1">
            <p className="text-sm font-black">Sipariş gönderildi: {sonSiparisNo}</p>
            <p className="text-[12px]">
              Onay Havuzu → Satın Alma sekmesinde incelenecek. Onaylanırsa satın alma talebi olarak
              içeri alınır.
            </p>
            <button
              type="button"
              onClick={() => setSonSiparisNo('')}
              className="text-[11px] font-bold underline cursor-pointer"
            >
              Yeni sipariş
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                isPublic ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white'
              }`}
            >
              <h2 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <User size={13} /> Siparişi veren
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[9px] font-black uppercase text-slate-500">Ad soyad *</span>
                  <input
                    required
                    minLength={3}
                    value={personelAdSoyad}
                    onChange={(e) => setPersonelAdSoyad(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className={`w-full rounded-xl px-3 py-2.5 font-bold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500">Görev</span>
                  <input
                    value={personelGorev}
                    onChange={(e) => setPersonelGorev(e.target.value)}
                    placeholder="Formen / Kampçı / …"
                    className={`w-full rounded-xl px-3 py-2.5 font-bold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500">Telefon</span>
                  <input
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    placeholder="05xx"
                    className={`w-full rounded-xl px-3 py-2.5 font-bold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[9px] font-black uppercase text-slate-500 flex items-center gap-1">
                    <MapPin size={10} /> Nerede kullanılacak? *
                  </span>
                  <textarea
                    required
                    minLength={3}
                    rows={2}
                    value={kullanilacakYer}
                    onChange={(e) => setKullanilacakYer(e.target.value)}
                    placeholder="Örn: B blok 3. kat ıslak hacim / Kamp mutfak"
                    className={`w-full rounded-xl px-3 py-2.5 font-semibold resize-y ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2 relative">
                  <span className="text-[9px] font-black uppercase text-slate-500">
                    Tedarikçi (opsiyonel — cari kart)
                  </span>
                  <input
                    value={cariFirma}
                    onChange={(e) => {
                      setCariFirma(e.target.value);
                      setCariKartId('');
                    }}
                    placeholder="Cari listeden seçin veya yazın"
                    className={`w-full rounded-xl px-3 py-2.5 font-bold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                  {tedarikciOneriler.length > 0 && !cariKartId && (
                    <div
                      className={`absolute z-20 left-0 right-0 mt-1 rounded-xl border overflow-hidden ${
                        isPublic ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
                      }`}
                    >
                      {tedarikciOneriler.map((t) => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => {
                            setCariFirma(t.unvan);
                            setCariKartId(t.id);
                          }}
                          className="w-full text-left px-3 py-2 text-[11px] font-bold hover:bg-emerald-50 cursor-pointer"
                        >
                          {t.unvan}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[9px] font-black uppercase text-slate-500">Ek açıklama</span>
                  <input
                    value={aciklama}
                    onChange={(e) => setAciklama(e.target.value)}
                    placeholder="Acil / marka tercihi vb."
                    className={`w-full rounded-xl px-3 py-2.5 font-semibold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                </label>
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                isPublic ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white'
              }`}
            >
              <h2 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Package size={13} /> Malzeme kalemleri
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-xs relative">
                <div className="sm:col-span-3 space-y-1 relative">
                  <span className="text-[9px] font-black uppercase text-slate-500">Stok / malzeme</span>
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={urunArama}
                      onChange={(e) => {
                        setUrunArama(e.target.value);
                        setSeciliStok(null);
                      }}
                      placeholder="Stok kartından ara veya yaz"
                      className={`w-full rounded-xl pl-8 pr-3 py-2.5 font-bold ${
                        isPublic
                          ? 'bg-slate-950 border border-slate-700 text-white'
                          : 'bg-slate-50 border border-slate-200'
                      }`}
                    />
                  </div>
                  {stokOneriler.length > 0 && !seciliStok && (
                    <div
                      className={`absolute z-20 left-0 right-0 mt-1 rounded-xl border overflow-hidden ${
                        isPublic ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-lg'
                      }`}
                    >
                      {stokOneriler.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => {
                            setSeciliStok(s);
                            setUrunArama(s.stokAdi);
                            setBirim(s.birim || 'ADET');
                          }}
                          className="w-full text-left px-3 py-2 text-[11px] hover:bg-sky-50 cursor-pointer"
                        >
                          <span className="font-black">{s.stokAdi}</span>
                          <span className="text-slate-400 ml-1">
                            {s.stokKodu} · {s.birim}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500">Miktar</span>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={miktar}
                    onChange={(e) => setMiktar(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2.5 font-bold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-500">Birim</span>
                  <select
                    value={birim}
                    onChange={(e) => setBirim(e.target.value)}
                    className={`w-full rounded-xl px-2 py-2.5 font-bold ${
                      isPublic
                        ? 'bg-slate-950 border border-slate-700 text-white'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  >
                    {BIRIMLER.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={addKalem}
                    className="w-full inline-flex items-center justify-center gap-1 bg-sky-600 hover:bg-sky-700 text-white font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
                  >
                    <Plus size={13} /> Ekle
                  </button>
                </div>
              </div>
              <input
                value={marka}
                onChange={(e) => setMarka(e.target.value)}
                placeholder="Marka (opsiyonel)"
                className={`w-full rounded-xl px-3 py-2 text-[11px] font-semibold ${
                  isPublic
                    ? 'bg-slate-950 border border-slate-700 text-white'
                    : 'bg-slate-50 border border-slate-200'
                }`}
              />

              {kalemler.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Henüz kalem yok.</p>
              ) : (
                <div className="space-y-1.5">
                  {kalemler.map((k) => (
                    <div
                      key={k.id}
                      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] ${
                        isPublic ? 'bg-slate-950 border border-slate-800' : 'bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-black truncate">{k.urunAdi}</p>
                        <p className="text-slate-500">
                          {k.miktar} {k.birim}
                          {k.marka ? ` · ${k.marka}` : ''}
                          {k.stokKartId ? ' · stok kartı' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setKalemler((prev) => prev.filter((x) => x.id !== k.id))}
                        className="p-1.5 rounded-lg text-rose-600 cursor-pointer"
                        title="Kaldır"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[12px] py-3.5 rounded-2xl disabled:opacity-50 cursor-pointer"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <ClipboardList size={15} />}
              SİPARİŞİ ONAYA GÖNDER
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return shell;
};

export default SiparisFormuScreen;
