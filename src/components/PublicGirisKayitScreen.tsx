import React, { useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Personel } from '../types/erp';
import { fetchCollection, saveDocument, ensureFirestoreAuth } from '../lib/firebase';
import { resolvePersonelForGirisOnay } from '../lib/personelMatchUtils';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fetchApiJson } from '../lib/apiClient';
import { compressImage } from '../lib/imageCompress';
import { KibritciLogo } from './KibritciLogo';

export interface PersonelGirisTalebi {
  id: string;
  ad?: string;
  soyad?: string;
  gorev?: string;
  tcNo?: string;
  telefonNo?: string;
  firmaTipi?: 'ANA_FIRMA' | 'TASERON';
  firmaAdi?: string;
  personelId?: string;
  kimlikFotoUrl?: string;
  kimlikArkaFotoUrl?: string;
  durum?: string;
  tarih?: string;
  gonderenFormen?: string;
  gonderenKampci?: string;
  kaynakPanel?: string;
}

interface PublicGirisKayitScreenProps {
  talep: PersonelGirisTalebi;
  onClose: () => void;
}

const EMPTY_FORM: Omit<Personel, 'id'> = {
  tcNo: '',
  ad: '',
  soyad: '',
  babaAdi: '',
  dogumTarihi: '',
  telefonNo: '',
  eposta: '',
  adres: '',
  il: '',
  ilce: '',
  departman: 'SAHA',
  gorev: '',
  iseGirisTarihi: new Date().toISOString().slice(0, 10),
  cinsiyet: '',
  maas: 0,
  ucretTipi: 'Günlük',
  sgkDurumu: 'SGK\'lı',
  bankaAdi: '',
  subeAdi: '',
  ibanNo: '',
  durum: true,
  fotografUrl: '',
  firmaTipi: 'ANA_FIRMA',
  firmaAdi: 'Kibritçi İnşaat Taahhüt A.Ş.',
};

const GirisTalepNotFound: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
    <div className="max-w-md text-center space-y-4">
      <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
      <h1 className="text-lg font-black">Giriş Talebi Bulunamadı</h1>
      <p className="text-sm text-slate-400">
        <span className="font-mono text-amber-300">{id}</span> kimlik numaralı kayıt veritabanında yok.
        Link süresi dolmuş veya Firebase projesi güncellenmemiş olabilir.
      </p>
      <button type="button" onClick={onClose} className="px-6 py-2.5 bg-slate-800 rounded-xl text-xs font-bold cursor-pointer">
        Kapat
      </button>
    </div>
  </div>
);

export const PublicGirisKayitScreen: React.FC<PublicGirisKayitScreenProps> = ({
  talep,
  onClose,
}) => {
  if ((talep as any)._notFound) {
    return <GirisTalepNotFound id={talep.id} onClose={onClose} />;
  }

  return <PublicGirisKayitForm talep={talep} onClose={onClose} />;
};

const PublicGirisKayitForm: React.FC<PublicGirisKayitScreenProps> = ({
  talep,
  onClose,
}) => {
  const [form, setForm] = useState<Omit<Personel, 'id'>>({
    ...EMPTY_FORM,
    ad: talep.ad || '',
    soyad: talep.soyad || '',
    gorev: talep.gorev || '',
    tcNo: talep.tcNo || '',
    telefonNo: talep.telefonNo || '',
    firmaTipi: talep.firmaTipi || 'ANA_FIRMA',
    firmaAdi: talep.firmaAdi || EMPTY_FORM.firmaAdi,
    fotografUrl: talep.kimlikFotoUrl || '',
  });
  const [gorevListesi, setGorevListesi] = useState<string[]>([]);
  const [yeniGorev, setYeniGorev] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [kimlikGecerli, setKimlikGecerli] = useState<boolean | null>(null);
  const [eksikAlanlar, setEksikAlanlar] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [kimlikOnUrl, setKimlikOnUrl] = useState(talep.kimlikFotoUrl || '');
  const [kimlikArkaUrl, setKimlikArkaUrl] = useState(talep.kimlikArkaFotoUrl || '');

  useEffect(() => {
    fetchCollection<Personel>('personeller')
      .then((list) => {
        const gorevler = [...new Set(list.map((p) => p.gorev?.trim()).filter(Boolean))] as string[];
        gorevler.sort((a, b) => a.localeCompare(b, 'tr'));
        setGorevListesi(gorevler);
      })
      .catch(() => {});
  }, []);

  const gorevSecenekleri = useMemo(() => {
    const base = new Set<string>(gorevListesi);
    if (talep.gorev?.trim()) base.add(talep.gorev.trim());
    if (form.gorev?.trim()) base.add(form.gorev.trim());
    return [...base].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [gorevListesi, talep.gorev, form.gorev]);

  const patchForm = (data: Partial<Omit<Personel, 'id'>>) => {
    setForm((prev) => ({ ...prev, ...data }));
  };

  const handleKimlikUpload = async (file: File, yuz: 'on' | 'arka') => {
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string, 1400, 1400, 0.8);
      if (yuz === 'on') {
        setKimlikOnUrl(compressed);
        patchForm({ fotografUrl: compressed });
      } else {
        setKimlikArkaUrl(compressed);
      }
    };
    reader.readAsDataURL(file);
  };

  const runKimlikParse = async () => {
    if (!kimlikOnUrl) {
      setParseError('Kimlik ön yüz fotoğrafı zorunludur.');
      return;
    }
    setParsing(true);
    setParseError(null);
    setParseInfo(null);
    try {
      const onB64 = kimlikOnUrl.includes(',') ? kimlikOnUrl.split(',')[1] : kimlikOnUrl;
      const arkaB64 = kimlikArkaUrl?.includes(',') ? kimlikArkaUrl.split(',')[1] : kimlikArkaUrl;
      const res = await fetchApiJson<{
        success: boolean;
        data?: {
          tcNo?: string;
          ad?: string;
          soyad?: string;
          babaAdi?: string;
          dogumTarihi?: string;
          cinsiyet?: string;
          seriNo?: string;
          kimlikGecerli?: boolean;
          kimlikTipi?: string;
          eksikAlanlar?: string[];
          uyari?: string;
        };
        error?: string;
      }>('/api/parse-kimlik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onYuzBase64: onB64,
          arkaYuzBase64: arkaB64 || undefined,
          mimeType: 'image/jpeg',
        }),
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || 'Kimlik okunamadı');
      }

      const d = res.data;
      setKimlikGecerli(d.kimlikGecerli ?? false);
      setEksikAlanlar(d.eksikAlanlar || []);

      patchForm({
        tcNo: d.tcNo || form.tcNo,
        ad: d.ad || form.ad || talep.ad || '',
        soyad: d.soyad || form.soyad || talep.soyad || '',
        babaAdi: d.babaAdi || form.babaAdi,
        dogumTarihi: d.dogumTarihi || form.dogumTarihi,
        cinsiyet: d.cinsiyet || form.cinsiyet,
      });

      if (d.kimlikGecerli) {
        setParseInfo('Kimlik belgesi doğrulandı. Alanlar forma aktarıldı — eksikleri tamamlayıp kaydedin.');
      } else {
        setParseError(
          d.uyari ||
            'Yüklenen görsel geçerli bir T.C. kimlik kartı (ön/arka) olarak tanımlanamadı. Lütfen net fotoğraf yükleyin.'
        );
      }
    } catch (e: any) {
      setParseError(e.message || 'Kimlik analizi başarısız');
    } finally {
      setParsing(false);
    }
  };

  const handleGorevEkle = () => {
    const g = yeniGorev.trim();
    if (!g) return;
    setGorevListesi((prev) => (prev.includes(g) ? prev : [...prev, g]));
    patchForm({ gorev: g });
    setYeniGorev('');
  };

  const handleSave = async () => {
    if (!form.ad.trim() || !form.soyad.trim()) {
      alert('Ad ve soyad zorunludur.');
      return;
    }
    if (!form.gorev.trim()) {
      alert('Görev / branş seçin veya yeni görev ekleyin.');
      return;
    }
    if (form.tcNo && (form.tcNo.length !== 11 || !/^\d+$/.test(form.tcNo))) {
      alert('TC Kimlik No 11 haneli olmalıdır.');
      return;
    }

    setSaving(true);
    try {
      await ensureFirestoreAuth({ allowAnonymous: true });
      const allPersoneller = (await fetchCollection('personeller')) as Personel[];
      const existing = resolvePersonelForGirisOnay(allPersoneller, {
        personelId: talep.personelId,
        ad: form.ad,
        soyad: form.soyad,
        tcNo: form.tcNo,
        telefonNo: form.telefonNo,
        firmaAdi: form.firmaAdi,
        firmaTipi: form.firmaTipi,
      });

      const personelId = existing?.id || talep.personelId || `p_${Date.now()}`;
      const newPersonel: Personel = {
        ...(existing || form),
        ...form,
        id: personelId,
        ad: form.ad.trim(),
        soyad: form.soyad.trim(),
        gorev: form.gorev.trim(),
        fotografUrl: kimlikOnUrl || form.fotografUrl,
        durum: true,
      };
      await saveDocument('personeller', newPersonel);
      await updateDoc(doc(db, 'personelGirisTalepleri', talep.id), {
        durum: 'KAYIT_TAMAMLANDI',
        personelId: newPersonel.id,
        kimlikFotoUrl: kimlikOnUrl || talep.kimlikFotoUrl,
        kimlikArkaFotoUrl: kimlikArkaUrl || talep.kimlikArkaFotoUrl,
        gorev: newPersonel.gorev,
        ad: newPersonel.ad,
        soyad: newPersonel.soyad,
        kayitTarihi: new Date().toISOString(),
      });
      alert(`${newPersonel.ad} ${newPersonel.soyad} personel kaydı tamamlandı.`);
      onClose();
    } catch (e: any) {
      alert(`Kayıt hatası: ${e.message || 'Bilinmeyen hata'}`);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (key: keyof Omit<Personel, 'id'>) =>
    `w-full text-xs p-2 border rounded-lg ${
      eksikAlanlar.includes(key) ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center text-slate-100 font-sans p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl my-4">
        <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-5 flex items-center gap-3">
          <KibritciLogo size="md" className="h-10" />
          <div>
            <h1 className="text-sm font-black tracking-wider">PERSONEL İŞE GİRİŞ KAYDI</h1>
            <p className="text-[10px] text-amber-100 font-mono">Talep: {talep.id}</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-3 text-xs bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <div>
              <span className="text-slate-500 font-bold block text-[9px] uppercase">Gönderen</span>
              {(talep.gonderenFormen || talep.gonderenKampci || '-').split('@')[0]}
            </div>
            <div>
              <span className="text-slate-500 font-bold block text-[9px] uppercase">Talep Tarihi</span>
              {talep.tarih ? new Date(talep.tarih).toLocaleString('tr-TR') : '-'}
            </div>
            <div>
              <span className="text-slate-500 font-bold block text-[9px] uppercase">Kaynak</span>
              {talep.kaynakPanel || 'SAHA'}
            </div>
            <div>
              <span className="text-slate-500 font-bold block text-[9px] uppercase">Durum</span>
              {talep.durum || 'BEKLEMEDE'}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Kimlik Ön Yüz *</label>
              <div className="border border-dashed border-slate-700 rounded-2xl min-h-[140px] flex items-center justify-center overflow-hidden bg-slate-950 relative">
                {kimlikOnUrl ? (
                  <img src={kimlikOnUrl} alt="Kimlik ön" className="max-h-48 object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-500 italic p-4 text-center">Fotoğraf yok — yükleyin</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => e.target.files?.[0] && handleKimlikUpload(e.target.files[0], 'on')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Kimlik Arka Yüz (önerilir)</label>
              <div className="border border-dashed border-slate-700 rounded-2xl min-h-[140px] flex items-center justify-center overflow-hidden bg-slate-950 relative">
                {kimlikArkaUrl ? (
                  <img src={kimlikArkaUrl} alt="Kimlik arka" className="max-h-48 object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-500 italic p-4 text-center">Arka yüz yükleyin</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => e.target.files?.[0] && handleKimlikUpload(e.target.files[0], 'arka')}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={runKimlikParse}
            disabled={parsing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer disabled:opacity-60"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Yapay Zeka ile Kimlik Oku ve Formu Doldur
          </button>

          {parseError && (
            <p className="text-[10px] text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {parseError}
            </p>
          )}
          {parseInfo && (
            <p className="text-[10px] text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {parseInfo}
            </p>
          )}
          {kimlikGecerli === false && (
            <p className="text-[10px] text-amber-400">
              Kimlik doğrulaması başarısız — yine de formu elle doldurup kaydedebilirsiniz.
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">Ad *</label>
              <input
                value={form.ad}
                onChange={(e) => patchForm({ ad: e.target.value })}
                className={fieldClass('ad')}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">Soyad *</label>
              <input
                value={form.soyad}
                onChange={(e) => patchForm({ soyad: e.target.value })}
                className={fieldClass('soyad')}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">TC Kimlik No</label>
              <input
                value={form.tcNo}
                onChange={(e) => patchForm({ tcNo: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                className={fieldClass('tcNo')}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">Baba Adı</label>
              <input
                value={form.babaAdi}
                onChange={(e) => patchForm({ babaAdi: e.target.value })}
                className={fieldClass('babaAdi')}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">Doğum Tarihi</label>
              <input
                type="date"
                value={form.dogumTarihi}
                onChange={(e) => patchForm({ dogumTarihi: e.target.value })}
                className={fieldClass('dogumTarihi')}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">Cinsiyet</label>
              <select
                value={form.cinsiyet}
                onChange={(e) => patchForm({ cinsiyet: e.target.value })}
                className={fieldClass('cinsiyet')}
              >
                <option value="">—</option>
                <option value="Erkek">Erkek</option>
                <option value="Kadın">Kadın</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">İşe Giriş Tarihi</label>
              <input
                type="date"
                value={form.iseGirisTarihi}
                onChange={(e) => patchForm({ iseGirisTarihi: e.target.value })}
                className={fieldClass('iseGirisTarihi')}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase">Telefon</label>
              <input
                value={form.telefonNo}
                onChange={(e) => patchForm({ telefonNo: e.target.value })}
                className={fieldClass('telefonNo')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-400 uppercase">Görev / Branş *</label>
            <select
              value={form.gorev}
              onChange={(e) => patchForm({ gorev: e.target.value })}
              className={fieldClass('gorev')}
            >
              <option value="">— Görev seçin —</option>
              {gorevSecenekleri.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={yeniGorev}
                onChange={(e) => setYeniGorev(e.target.value)}
                placeholder="Yeni görev adı (elle)"
                className="flex-1 text-xs p-2 border border-slate-700 rounded-lg bg-slate-950"
              />
              <button
                type="button"
                onClick={handleGorevEkle}
                className="px-3 py-2 text-[10px] font-bold bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700"
              >
                Ekle
              </button>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase">Adres</label>
            <textarea
              value={form.adres}
              onChange={(e) => patchForm({ adres: e.target.value })}
              rows={2}
              className={`${fieldClass('adres')} w-full`}
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-800 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Personeli Kaydet
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
