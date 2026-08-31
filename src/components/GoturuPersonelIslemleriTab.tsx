import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ImageIcon, Search, UserPlus, Users } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Personel } from '../types/erp';
import { db, cleanUndefined } from '../lib/firebase';
import { compressImage } from '../lib/imageCompress';
import { todayDateKey } from '../lib/dateKeyUtils';
import { isSeramikEkibiPersonel } from '../lib/yoklamaUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';
import { buildWhatsAppUrl } from '../lib/mobilOnayUtils';
import {
  GOTURU_DEFAULT_GOREV,
  GOTURU_FIRMA_ADI,
  GOTURU_GOREV_OPTIONS,
  GOTURU_PERSONEL_KAYNAK,
  isGoturuPersonelTalep,
} from '../lib/goturuPersonelTalep';

const MAX_KIMLIK_FOTO = 2;

type InnerTab = 'giris' | 'liste';

interface GoturuPersonelIslemleriTabProps {
  personeller: Personel[];
  currentUser: any;
  showStatus: (type: 'success' | 'error' | 'info', text: string, autoHideMs?: number) => void;
}

function personelAktif(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

export const GoturuPersonelIslemleriTab: React.FC<GoturuPersonelIslemleriTabProps> = ({
  personeller,
  currentUser,
  showStatus,
}) => {
  const [innerTab, setInnerTab] = useState<InnerTab>('giris');
  const [yeniAd, setYeniAd] = useState('');
  const [yeniSoyad, setYeniSoyad] = useState('');
  const [yeniGorev, setYeniGorev] = useState<string>(GOTURU_DEFAULT_GOREV);
  const [yeniTelefon, setYeniTelefon] = useState('');
  const [yeniKimlikFotolar, setYeniKimlikFotolar] = useState<string[]>([]);
  const [sonGirisTalebi, setSonGirisTalebi] = useState<{
    id: string;
    ad: string;
    soyad: string;
    gorev: string;
  } | null>(null);
  const [girisListesi, setGirisListesi] = useState<any[]>([]);
  const [cikisListesi, setCikisListesi] = useState<any[]>([]);
  const [guncellemeListesi, setGuncellemeListesi] = useState<any[]>([]);

  const [personelSearch, setPersonelSearch] = useState('');
  const [selectedPersonel, setSelectedPersonel] = useState<Personel | null>(null);
  const [showCikisForm, setShowCikisForm] = useState(false);
  const [showGuncellemeForm, setShowGuncellemeForm] = useState(false);
  const [cikisTarihi, setCikisTarihi] = useState(todayDateKey());
  const [cikisNedeni, setCikisNedeni] = useState('');
  const [guncelAd, setGuncelAd] = useState('');
  const [guncelSoyad, setGuncelSoyad] = useState('');
  const [guncelGorev, setGuncelGorev] = useState('');
  const [guncelTelefon, setGuncelTelefon] = useState('');
  const [guncelIban, setGuncelIban] = useState('');
  const [guncelBanka, setGuncelBanka] = useState('');
  const [guncellemeNedeni, setGuncellemeNedeni] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const gonderen = currentUser?.email || 'Götürü ekibi';

  useEffect(() => {
    const unsubGiris = onSnapshot(collection(db, 'personelGirisTalepleri'), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
        .filter((row) => isGoturuPersonelTalep(row))
        .sort((a: any, b: any) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
      setGirisListesi(rows);
    });
    const unsubCikis = onSnapshot(collection(db, 'personelCikisTalepleri'), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
        .filter((row) => isGoturuPersonelTalep(row))
        .sort((a: any, b: any) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
      setCikisListesi(rows);
    });
    const unsubGuncelleme = onSnapshot(collection(db, 'personelGuncellemeTalepleri'), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
        .filter((row) => isGoturuPersonelTalep(row))
        .sort((a: any, b: any) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
      setGuncellemeListesi(rows);
    });
    return () => {
      unsubGiris();
      unsubCikis();
      unsubGuncelleme();
    };
  }, []);

  const ekipListesi = useMemo(() => {
    const q = personelSearch.trim().toLocaleLowerCase('tr-TR');
    return personeller
      .filter(isSeramikEkibiPersonel)
      .filter((p) => {
        if (!q) return true;
        const haystack = `${p.ad} ${p.soyad} ${p.gorev || ''} ${p.telefonNo || ''} ${p.firmaAdi || ''}`.toLocaleLowerCase(
          'tr-TR'
        );
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const aAktif = personelAktif(a) ? 0 : 1;
        const bAktif = personelAktif(b) ? 0 : 1;
        if (aAktif !== bAktif) return aAktif - bAktif;
        return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr');
      });
  }, [personeller, personelSearch]);

  const openGuncellemeForm = (p: Personel) => {
    setGuncelAd(p.ad || '');
    setGuncelSoyad(p.soyad || '');
    setGuncelGorev(p.gorev || GOTURU_DEFAULT_GOREV);
    setGuncelTelefon(p.telefonNo || '');
    setGuncelIban(p.ibanNo || '');
    setGuncelBanka(p.bankaAdi || '');
    setGuncellemeNedeni('');
    setShowGuncellemeForm(true);
    setShowCikisForm(false);
  };

  const handleGirisGonder = async () => {
    if (!yeniAd.trim() || !yeniSoyad.trim() || !yeniGorev.trim()) {
      showStatus('error', 'Lütfen adı, soyadı ve görevi doldurun.');
      return;
    }
    if (yeniKimlikFotolar.length < 2) {
      showStatus('error', 'Kimlik belgesinin ön ve arka yüzünü çekin / yükleyin.');
      return;
    }
    setGonderiliyor(true);
    try {
      const requestID = `GIRIS-GOTURU-${Date.now()}`;
      await setDoc(
        doc(db, 'personelGirisTalepleri', requestID),
        cleanUndefined({
          id: requestID,
          ad: yeniAd.trim(),
          soyad: yeniSoyad.trim(),
          gorev: yeniGorev.trim(),
          telefonNo: yeniTelefon.trim() || '',
          kimlikFotoUrl: yeniKimlikFotolar[0],
          kimlikFotoUrls: yeniKimlikFotolar,
          durum: 'BEKLEMEDE',
          tarih: new Date().toISOString(),
          gonderenFormen: gonderen,
          kaynak: GOTURU_PERSONEL_KAYNAK,
          firmaTipi: 'TASERON',
          firmaAdi: GOTURU_FIRMA_ADI,
        })
      );
      setSonGirisTalebi({
        id: requestID,
        ad: yeniAd.trim(),
        soyad: yeniSoyad.trim(),
        gorev: yeniGorev.trim(),
      });
      setYeniAd('');
      setYeniSoyad('');
      setYeniGorev(GOTURU_DEFAULT_GOREV);
      setYeniTelefon('');
      setYeniKimlikFotolar([]);
      showStatus('success', 'İşçi giriş talebi yönetime gönderildi. Onay bekleniyor.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Giriş talebi kaydedilemedi. Bağlantıyı kontrol edin.');
    } finally {
      setGonderiliyor(false);
    }
  };

  const handleCikisGonder = async () => {
    if (!selectedPersonel) return;
    if (!cikisNedeni.trim()) {
      showStatus('error', 'Lütfen işten çıkış nedenini yazın.');
      return;
    }
    setGonderiliyor(true);
    try {
      await submitPersonelCikisTalebi({
        personelId: selectedPersonel.id,
        personelIsim: `${selectedPersonel.ad} ${selectedPersonel.soyad}`,
        personelGorev: selectedPersonel.gorev || '',
        personelMaas: selectedPersonel.maas || 0,
        cikisTarihi,
        cikisNedeni: cikisNedeni.trim(),
        gonderen,
        kaynak: GOTURU_PERSONEL_KAYNAK,
      });
      showStatus('success', 'İşten çıkarma talebi yönetime gönderildi. Onay bekleniyor.');
      setCikisNedeni('');
      setShowCikisForm(false);
      setSelectedPersonel(null);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Çıkış talebi gönderilemedi.');
    } finally {
      setGonderiliyor(false);
    }
  };

  const handleGuncellemeGonder = async () => {
    if (!selectedPersonel) return;
    if (!guncellemeNedeni.trim()) {
      showStatus('error', 'Lütfen güncelleme gerekçesini yazın.');
      return;
    }
    setGonderiliyor(true);
    try {
      const docId = `GUNCELLEME-GOTURU-${Date.now()}`;
      await setDoc(
        doc(db, 'personelGuncellemeTalepleri', docId),
        cleanUndefined({
          id: docId,
          personelId: selectedPersonel.id,
          eskiBilgiler: {
            ad: selectedPersonel.ad,
            soyad: selectedPersonel.soyad,
            gorev: selectedPersonel.gorev || '',
            telefon: selectedPersonel.telefonNo || '',
            ibanNo: selectedPersonel.ibanNo || '',
            bankaAdi: selectedPersonel.bankaAdi || '',
          },
          yeniBilgiler: {
            ad: guncelAd.trim(),
            soyad: guncelSoyad.trim(),
            gorev: guncelGorev.trim(),
            telefon: guncelTelefon.trim(),
            ibanNo: guncelIban.trim(),
            bankaAdi: guncelBanka.trim(),
          },
          guncellemeNedeni: guncellemeNedeni.trim(),
          durum: 'BEKLEMEDE',
          tarih: new Date().toISOString(),
          gonderenFormen: gonderen,
          kaynak: GOTURU_PERSONEL_KAYNAK,
        })
      );
      showStatus('success', 'Bilgi değişiklik talebi yönetime gönderildi. Onay bekleniyor.');
      setGuncellemeNedeni('');
      setShowGuncellemeForm(false);
      setSelectedPersonel(null);
    } catch (err) {
      console.error(err);
      showStatus('error', 'Güncelleme talebi gönderilemedi.');
    } finally {
      setGonderiliyor(false);
    }
  };

  const durumBadge = (durum?: string) => {
    const d = String(durum || 'BEKLEMEDE');
    if (d === 'ONAYLANDI') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (d === 'REDDEDİLDİ' || d === 'REDDEDILDI') return 'bg-rose-100 text-rose-800 border-rose-300';
    if (d === 'WP_GÖNDERİLDİ') return 'bg-slate-100 text-slate-700 border-slate-300';
    return 'bg-amber-100 text-amber-800 border-amber-300';
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setInnerTab('giris')}
          className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider border cursor-pointer ${
            innerTab === 'giris'
              ? 'bg-orange-600 border-orange-500 text-white'
              : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <UserPlus size={13} /> Girişe Yolla
          </span>
        </button>
        <button
          type="button"
          onClick={() => setInnerTab('liste')}
          className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider border cursor-pointer ${
            innerTab === 'liste'
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <Users size={13} /> Personel Listesi
          </span>
        </button>
      </div>

      {innerTab === 'giris' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-[10px] text-slate-500 leading-snug">
              Yeni işçinin kimlik belgesinin <strong>ön ve arka</strong> yüzünü çekin. Talep yönetimin{' '}
              <strong>Götürü Onayları</strong> sekmesine düşer; onaylanmadan personel kartı açılmaz.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block">Adı</span>
                <input
                  value={yeniAd}
                  onChange={(e) => setYeniAd(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  placeholder="Ad"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block">Soyadı</span>
                <input
                  value={yeniSoyad}
                  onChange={(e) => setYeniSoyad(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  placeholder="Soyad"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block">Görevi</span>
              <select
                value={yeniGorev}
                onChange={(e) => setYeniGorev(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
              >
                {GOTURU_GOREV_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block">
                Telefon (isteğe bağlı)
              </span>
              <input
                value={yeniTelefon}
                onChange={(e) => setYeniTelefon(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                placeholder="05xx"
              />
            </label>

            <div className="space-y-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block">
                Kimlik ön / arka ({yeniKimlikFotolar.length}/{MAX_KIMLIK_FOTO})
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {yeniKimlikFotolar.length < MAX_KIMLIK_FOTO && (
                  <label className="bg-slate-100 hover:bg-slate-200 border-2 border-dashed border-slate-300 rounded-2xl p-3 flex flex-col items-center justify-center cursor-pointer w-24 h-20 text-slate-500">
                    <Camera size={20} />
                    <span className="text-[8px] font-bold mt-1">
                      {yeniKimlikFotolar.length === 0 ? 'Ön Yüz Çek' : 'Arka Yüz Çek'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files: File[] = e.target.files ? Array.from(e.target.files) : [];
                        if (files.length === 0) return;
                        const slots = MAX_KIMLIK_FOTO - yeniKimlikFotolar.length;
                        files.slice(0, slots).forEach((file) => {
                          const r = new FileReader();
                          r.onload = async (event) => {
                            if (!event.target?.result) return;
                            const compressed = await compressImage(event.target.result as string);
                            setYeniKimlikFotolar((prev) =>
                              prev.length >= MAX_KIMLIK_FOTO ? prev : [...prev, compressed]
                            );
                          };
                          r.readAsDataURL(file);
                        });
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                {yeniKimlikFotolar.map((foto, idx) => (
                  <div
                    key={idx}
                    className="w-24 h-20 border border-slate-200 rounded-2xl relative overflow-hidden shrink-0"
                  >
                    <img src={foto} alt={idx === 0 ? 'Kimlik ön' : 'Kimlik arka'} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[7px] font-bold px-1 rounded">
                      {idx === 0 ? 'ÖN' : 'ARKA'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setYeniKimlikFotolar((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 text-[10px] font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {yeniKimlikFotolar.length === 0 && (
                  <div className="flex-1 min-w-[80px] border border-slate-150 rounded-2xl bg-slate-50 h-20 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <ImageIcon size={14} className="mx-auto mb-0.5" />
                      <span className="text-[7.5px] block">Fotoğraf yok</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={gonderiliyor}
              onClick={() => void handleGirisGonder()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-[11px] py-3 rounded-xl cursor-pointer"
            >
              {gonderiliyor ? 'Gönderiliyor…' : 'Girişi Yap ve Yönetime Gönder'}
            </button>

            {sonGirisTalebi && (
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl space-y-2">
                <p className="text-[10px] font-extrabold text-emerald-800">Talep oluşturuldu</p>
                <p className="text-[9px] text-emerald-700">
                  {sonGirisTalebi.ad} {sonGirisTalebi.soyad} · {sonGirisTalebi.gorev}
                </p>
                <a
                  href={buildWhatsAppUrl(
                    `*KİBRİTÇİ ERP - GÖTÜRÜ İŞÇİ GİRİŞ TALEBİ*\n${sonGirisTalebi.ad} ${sonGirisTalebi.soyad}\nGörev: ${sonGirisTalebi.gorev}\nOnay: ${window.location.origin}/?view_giris=${sonGirisTalebi.id}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async () => {
                    try {
                      await setDoc(
                        doc(db, 'personelGirisTalepleri', sonGirisTalebi.id),
                        { durum: 'WP_GÖNDERİLDİ' },
                        { merge: true }
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="block w-full text-center bg-emerald-600 text-white font-black text-[9px] py-2 rounded-lg"
                >
                  WhatsApp ile bildir
                </a>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Giriş talepleri</span>
            {girisListesi.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic py-4 text-center">Henüz Götürü giriş talebi yok.</p>
            ) : (
              girisListesi.slice(0, 30).map((item) => (
                <div key={item.id} className="border border-slate-100 rounded-xl p-2.5 bg-slate-50/60 text-[10px]">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-black text-slate-900">
                        {item.ad} {item.soyad}
                      </p>
                      <p className="text-[9px] text-slate-500">{item.gorev}</p>
                    </div>
                    <span className={`self-start px-2 py-0.5 rounded-full text-[8px] font-black border ${durumBadge(item.durum)}`}>
                      {item.durum}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {innerTab === 'liste' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                Götürü / Seramik ekibi ({ekipListesi.length})
              </span>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                value={personelSearch}
                onChange={(e) => setPersonelSearch(e.target.value)}
                placeholder="Ad, görev, telefon ara…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs font-bold"
              />
            </div>
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {ekipListesi.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic py-6 text-center">Kayıtlı seramik / götürü personeli yok.</p>
              ) : (
                ekipListesi.map((p) => (
                  <div
                    key={p.id}
                    className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 flex justify-between items-center gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 text-xs leading-tight">
                        {p.ad} {p.soyad}
                        {!personelAktif(p) && (
                          <span className="ml-1.5 text-[8px] font-black text-rose-600 uppercase">Pasif</span>
                        )}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {p.gorev || 'Görev yok'}
                        {p.firmaAdi ? ` · ${p.firmaAdi}` : ''}
                      </p>
                      <p className="text-[8px] font-mono text-slate-400 mt-0.5">📞 {p.telefonNo || 'Telefon yok'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPersonel(p);
                        setShowCikisForm(false);
                        setShowGuncellemeForm(false);
                        setCikisTarihi(todayDateKey());
                      }}
                      className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white font-black text-[9px] py-2 px-3 rounded-lg cursor-pointer"
                    >
                      İşlem Yap
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedPersonel && (
            <div className="bg-white border border-orange-200 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[8px] font-black text-orange-700 uppercase tracking-wider">Seçilen personel</p>
                  <p className="font-black text-slate-900 text-sm">
                    {selectedPersonel.ad} {selectedPersonel.soyad}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPersonel(null);
                    setShowCikisForm(false);
                    setShowGuncellemeForm(false);
                  }}
                  className="text-slate-400 hover:text-slate-800 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl text-[9px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Görev</span>
                  <span className="font-extrabold">{selectedPersonel.gorev || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Telefon</span>
                  <span className="font-mono font-bold">{selectedPersonel.telefonNo || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">IBAN</span>
                  <span className="font-mono font-bold truncate max-w-[60%]">{selectedPersonel.ibanNo || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Banka</span>
                  <span className="font-extrabold">{selectedPersonel.bankaAdi || '—'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCikisForm(true);
                    setShowGuncellemeForm(false);
                  }}
                  className={`py-2 rounded-xl font-black text-[9px] border cursor-pointer ${
                    showCikisForm
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-white text-red-600 border-red-100'
                  }`}
                >
                  İşten Çıkarma Talebi
                </button>
                <button
                  type="button"
                  onClick={() => openGuncellemeForm(selectedPersonel)}
                  className={`py-2 rounded-xl font-black text-[9px] border cursor-pointer ${
                    showGuncellemeForm
                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Bilgi Değiştir
                </button>
              </div>

              {showCikisForm && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="block space-y-1">
                    <span className="text-[8px] font-black text-slate-500 uppercase">Çıkış tarihi</span>
                    <input
                      type="date"
                      value={cikisTarihi}
                      onChange={(e) => setCikisTarihi(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[8px] font-black text-slate-500 uppercase">Neden / gerekçe</span>
                    <textarea
                      value={cikisNedeni}
                      onChange={(e) => setCikisNedeni(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      placeholder="İşten çıkarma nedeni"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={gonderiliyor}
                    onClick={() => void handleCikisGonder()}
                    className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
                  >
                    {gonderiliyor ? 'Gönderiliyor…' : 'Çıkış talebini yönetime gönder'}
                  </button>
                </div>
              )}

              {showGuncellemeForm && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={guncelAd}
                      onChange={(e) => setGuncelAd(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      placeholder="Ad"
                    />
                    <input
                      value={guncelSoyad}
                      onChange={(e) => setGuncelSoyad(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      placeholder="Soyad"
                    />
                  </div>
                  <select
                    value={guncelGorev}
                    onChange={(e) => setGuncelGorev(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    {GOTURU_GOREV_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                    {guncelGorev && !GOTURU_GOREV_OPTIONS.includes(guncelGorev as any) && (
                      <option value={guncelGorev}>{guncelGorev}</option>
                    )}
                  </select>
                  <input
                    value={guncelTelefon}
                    onChange={(e) => setGuncelTelefon(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    placeholder="Telefon"
                  />
                  <input
                    value={guncelBanka}
                    onChange={(e) => setGuncelBanka(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    placeholder="Banka"
                  />
                  <input
                    value={guncelIban}
                    onChange={(e) => setGuncelIban(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    placeholder="IBAN"
                  />
                  <textarea
                    value={guncellemeNedeni}
                    onChange={(e) => setGuncellemeNedeni(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    placeholder="Değişiklik gerekçesi"
                  />
                  <button
                    type="button"
                    disabled={gonderiliyor}
                    onClick={() => void handleGuncellemeGonder()}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-black text-[10px] py-2.5 rounded-xl cursor-pointer"
                  >
                    {gonderiliyor ? 'Gönderiliyor…' : 'Değişiklik talebini yönetime gönder'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
              Çıkış ve güncelleme talepleri
            </span>
            {cikisListesi.length === 0 && guncellemeListesi.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic py-4 text-center">Henüz talep yok.</p>
            ) : (
              <>
                {cikisListesi.slice(0, 15).map((item) => (
                  <div key={item.id} className="border border-rose-100 rounded-xl p-2.5 bg-rose-50/40 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-black text-rose-800 text-[8px] uppercase">İşten çıkış</p>
                        <p className="font-bold text-slate-900">{item.personelIsim}</p>
                      </div>
                      <span className={`self-start px-2 py-0.5 rounded-full text-[8px] font-black border ${durumBadge(item.durum)}`}>
                        {item.durum}
                      </span>
                    </div>
                  </div>
                ))}
                {guncellemeListesi.slice(0, 15).map((item) => (
                  <div key={item.id} className="border border-slate-100 rounded-xl p-2.5 bg-slate-50 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-black text-slate-500 text-[8px] uppercase">Bilgi güncelleme</p>
                        <p className="font-bold text-slate-900">
                          {item.eskiBilgiler?.ad} {item.eskiBilgiler?.soyad}
                        </p>
                      </div>
                      <span className={`self-start px-2 py-0.5 rounded-full text-[8px] font-black border ${durumBadge(item.durum)}`}>
                        {item.durum}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
