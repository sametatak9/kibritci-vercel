import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Copy, Check, MessageCircle, Upload, UserPlus, UserMinus, FileText, Link2 } from 'lucide-react';
import type { CariKart, Fatura, FaturaItem, Irsaliye, Personel, StokKart } from '../types/erp';
import { db, saveDocument } from '../lib/firebase';
import { fetchApiJson } from '../lib/apiClient';
import { compressImage } from '../lib/imageCompress';
import { buildWhatsAppUrl } from '../lib/mobilOnayUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';
import { upsertPersonelAvoidDuplicate } from '../lib/personelMatchUtils';
import { resolveCariKartId } from '../lib/evrakCariStokSync';
import { linkIrsaliyelerToFatura } from '../lib/evrakDonusum';
import { findStokMatch } from '../lib/evrakBatchImportUtils';
import {
  buildSgkCikisWhatsAppText,
  buildSgkGirisWhatsAppText,
  findSgkGrupBildirimi,
  isAnaFirmaGirisAcik,
  SGK_GRUP_ADI,
} from '../lib/sgkGrupSablon';
import { eslesmeNedenLabel, suggestIrsaliyelerForFaturaUnvan } from '../lib/faturaIrsaliyeEslesme';
import { EvrakPageShell, EvrakSectionHeader } from './evrakUi/EvrakScreenChrome';
import { muhasebeInputClass } from './evrakUi/MuhasebeBelgeForm';

type SubTab = 'giris' | 'cikis' | 'fatura';

type Talep = Record<string, any>;

interface GrupKopruScreenProps {
  personeller: Personel[];
  setPersoneller: React.Dispatch<React.SetStateAction<Personel[]>>;
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  setIrsaliyeler: React.Dispatch<React.SetStateAction<Irsaliye[]>>;
  setFaturalar: React.Dispatch<React.SetStateAction<Fatura[]>>;
  cariKartlar: CariKart[];
  stokKartlar: StokKart[];
  currentUser?: { email?: string };
  addNotification?: (mesaj: string) => void;
}

const input = muhasebeInputClass;

async function fileToBase64(file: File): Promise<{ base64: string; mime: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Dosya okunamadı.'));
    r.readAsDataURL(file);
  });
  const compressed = file.type.startsWith('image/') ? await compressImage(dataUrl, 1400, 1400, 0.75) : dataUrl;
  return { base64: compressed.split(',')[1] || '', mime: file.type, dataUrl: compressed };
}

export const GrupKopruScreen: React.FC<GrupKopruScreenProps> = ({
  personeller,
  setPersoneller,
  irsaliyeler,
  faturalar,
  setIrsaliyeler,
  setFaturalar,
  cariKartlar,
  stokKartlar,
  currentUser,
  addNotification,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('giris');
  const [girisTalepler, setGirisTalepler] = useState<Talep[]>([]);
  const [cikisTalepler, setCikisTalepler] = useState<Talep[]>([]);

  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [tcNo, setTcNo] = useState('');
  const [gorev, setGorev] = useState('');
  const [nitelik, setNitelik] = useState('');
  const [girisTarihi, setGirisTarihi] = useState(new Date().toISOString().slice(0, 10));
  const [kimlikUrl, setKimlikUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<'giris' | 'cikis' | ''>('');

  const [cikisPersonelId, setCikisPersonelId] = useState('');
  const [cikisTarihi, setCikisTarihi] = useState(new Date().toISOString().slice(0, 10));
  const [cikisNedeni, setCikisNedeni] = useState('İş akdinin sona ermesi');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [sgkPreview, setSgkPreview] = useState<any | null>(null);
  const [sgkKind, setSgkKind] = useState<'giris' | 'cikis'>('giris');

  const [ftParsed, setFtParsed] = useState<any | null>(null);
  const [ftEvrakUrl, setFtEvrakUrl] = useState<string | null>(null);
  const [seciliIrIds, setSeciliIrIds] = useState<string[]>([]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'personelGirisTalepleri'), (snap) => {
      setGirisTalepler(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u2 = onSnapshot(collection(db, 'personelCikisTalepleri'), (snap) => {
      setCikisTalepler(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const gonderen = currentUser?.email || 'şantiye';
  const girisMetin = useMemo(
    () =>
      buildSgkGirisWhatsAppText({
        ad,
        soyad,
        tcNo,
        gorev,
        nitelik,
        girisTarihi,
        gonderen,
      }),
    [ad, soyad, tcNo, gorev, nitelik, girisTarihi, gonderen]
  );

  const cikisPersonel = personeller.find((p) => p.id === cikisPersonelId);
  const cikisMetin = useMemo(
    () =>
      buildSgkCikisWhatsAppText({
        ad: cikisPersonel?.ad || '',
        soyad: cikisPersonel?.soyad || '',
        tcNo: cikisPersonel?.tcNo,
        gorev: cikisPersonel?.gorev,
        cikisTarihi,
        cikisNedeni,
        gonderen,
      }),
    [cikisPersonel, cikisTarihi, cikisNedeni, gonderen]
  );

  const bekleyenGiris = girisTalepler.filter(
    (t) => t.kaynak === 'SGK_GRUP' && isAnaFirmaGirisAcik(t)
  );
  const bekleyenCikis = cikisTalepler.filter(
    (t) => (t.kaynak === 'SGK_GRUP' || t.kaynak === 'MANUEL') && (t.durum === 'BEKLEMEDE' || t.durum === 'WP_GÖNDERİLDİ')
  );
  const aktifAnaFirma = personeller.filter((p) => p.durum !== false && p.firmaTipi !== 'TASERON');

  const irAdaylari = useMemo(
    () => suggestIrsaliyelerForFaturaUnvan(ftParsed?.firma || '', irsaliyeler, faturalar, cariKartlar),
    [ftParsed, irsaliyeler, faturalar, cariKartlar]
  );

  const copyText = async (kind: 'giris' | 'cikis', text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(''), 1600);
  };

  const handleKimlik = async (file?: File | null) => {
    if (!file) return;
    const { dataUrl } = await fileToBase64(file);
    setKimlikUrl(dataUrl);
  };

  const kaydetGirisBildirimi = async () => {
    setErr(null);
    setOk(null);
    if (!ad.trim() || !soyad.trim() || !gorev.trim()) {
      setErr('Ad, soyad ve görev (yoklama niteliği) zorunlu. Gruba kimlik + ne iş yapacağı yazılmadan Ana Firma girişi olmaz.');
      return;
    }
    if (!kimlikUrl) {
      setErr('Kimlik görseli ekleyin. SGK grubuna kimlik gitmeden giriş kuyruğu açılamaz.');
      return;
    }
    setBusy(true);
    try {
      const id = `GIRIS-SGK-${Date.now()}`;
      await setDoc(doc(db, 'personelGirisTalepleri', id), {
        id,
        ad: ad.trim().toLocaleUpperCase('tr-TR'),
        soyad: soyad.trim().toLocaleUpperCase('tr-TR'),
        tcNo: tcNo.replace(/\D/g, ''),
        gorev: gorev.trim().toLocaleUpperCase('tr-TR'),
        nitelik: nitelik.trim().toLocaleUpperCase('tr-TR'),
        iseGirisTarihi: girisTarihi,
        tarih: new Date().toISOString(),
        kimlikFotoUrl: kimlikUrl,
        kimlikFotoUrls: [kimlikUrl],
        durum: 'WP_GÖNDERİLDİ',
        kaynak: 'SGK_GRUP',
        firmaTipi: 'ANA_FIRMA',
        grupBildirildi: true,
        gonderenFormen: gonderen,
      });
      setOk('Kuyruk yazıldı. Sabit metni SGK grubuna atın; evrak gelince bu kayıttan Ana Firma girişi resmileşir.');
      addNotification?.(`${ad} ${soyad} SGK grubuna giriş bildirimi yazıldı.`);
    } catch (e: any) {
      setErr(e.message || 'Bildirim kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const kaydetCikisBildirimi = async () => {
    setErr(null);
    setOk(null);
    if (!cikisPersonel) {
      setErr('Çıkış yapılacak personeli seçin. Gruba paylaşılmayan çıkış resmileşmez.');
      return;
    }
    setBusy(true);
    try {
      const id = await submitPersonelCikisTalebi({
        personelId: cikisPersonel.id,
        personelIsim: `${cikisPersonel.ad} ${cikisPersonel.soyad}`,
        personelGorev: cikisPersonel.gorev,
        personelMaas: cikisPersonel.maas,
        cikisTarihi,
        cikisNedeni,
        gonderen,
        kaynak: 'SGK_GRUP',
      });
      await updateDoc(doc(db, 'personelCikisTalepleri', id), {
        durum: 'WP_GÖNDERİLDİ',
        tcNo: cikisPersonel.tcNo || '',
        grupBildirildi: true,
      });
      setOk('Çıkış kuyruğa yazıldı. Sabit metni gruba atın; çıkış evrakı gelince resmileşir.');
      addNotification?.(`${cikisPersonel.ad} ${cikisPersonel.soyad} SGK grubuna çıkış bildirimi yazıldı.`);
    } catch (e: any) {
      setErr(e.message || 'Çıkış bildirimi kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const parseSgk = async (file: File, kind: 'giris' | 'cikis') => {
    setErr(null);
    setOk(null);
    setBusy(true);
    setSgkKind(kind);
    try {
      const { base64, mime } = await fileToBase64(file);
      const res = await fetchApiJson<{ success: boolean; data?: any; error?: string }>('/api/parse-sgk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mimeType: mime }),
      });
      if (!res.success || !res.data) throw new Error(res.error || 'SGK evrakı okunamadı.');
      setSgkPreview(res.data);
      setOk(`Evrak okundu: ${res.data.ad || ''} ${res.data.soyad || ''}`.trim());
    } catch (e: any) {
      setSgkPreview(null);
      setErr(e.message || 'SGK evrakı çözümlenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const resmilestirGiris = async () => {
    if (!sgkPreview) return;
    const bildirim = findSgkGrupBildirimi(bekleyenGiris, sgkPreview);
    if (!isAnaFirmaGirisAcik(bildirim)) {
      setErr(
        'Bu kimlik SGK grubuna bildirilmemiş. Ana Firma girişi yapılamaz. Önce kimlik, görev ve giriş tarihini gruba atıp kuyruğa yazın.'
      );
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const candidate: Personel = {
        id: `p_${Date.now()}`,
        tcNo: String(sgkPreview.tcNo || bildirim?.tcNo || ''),
        ad: String(sgkPreview.ad || bildirim?.ad || '').toLocaleUpperCase('tr-TR'),
        soyad: String(sgkPreview.soyad || bildirim?.soyad || '').toLocaleUpperCase('tr-TR'),
        babaAdi: sgkPreview.babaAdi || '',
        dogumTarihi: sgkPreview.dogumTarihi || '',
        telefonNo: '',
        eposta: '',
        adres: sgkPreview.adres || '',
        il: sgkPreview.il || '',
        ilce: sgkPreview.ilce || '',
        departman: 'ŞANTİYE',
        gorev: String(bildirim?.gorev || sgkPreview.gorev || 'İŞÇİ').toLocaleUpperCase('tr-TR'),
        nitelik: String(bildirim?.nitelik || '').toLocaleUpperCase('tr-TR') || undefined,
        iseGirisTarihi: String(sgkPreview.iseGirisTarihi || bildirim?.iseGirisTarihi || girisTarihi).slice(0, 10),
        cinsiyet: sgkPreview.cinsiyet || 'Belirtilmedi',
        maas: 0,
        ucretTipi: 'Aylık',
        sgkDurumu: "SGK'lı",
        bankaAdi: sgkPreview.bankaAdi || '',
        subeAdi: '',
        ibanNo: sgkPreview.ibanNo || '',
        durum: true,
        firmaTipi: 'ANA_FIRMA',
        kaynak: 'SGK_GRUP',
        onayDurumu: 'ONAYLANDI',
        fotografUrl: bildirim?.kimlikFotoUrl,
        sigortaEvrakUrl: undefined,
      };
      const { personel: saved, created } = await upsertPersonelAvoidDuplicate(personeller, candidate, {
        rawName: `${candidate.ad} ${candidate.soyad}`,
        tcNo: candidate.tcNo,
        firmaTipi: 'ANA_FIRMA',
      });
      setPersoneller((prev) => (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]));
      if (bildirim?.id) {
        await updateDoc(doc(db, 'personelGirisTalepleri', bildirim.id), {
          durum: 'KAYIT_TAMAMLANDI',
          personelId: saved.id,
          tcNo: saved.tcNo,
        });
      }
      setSgkPreview(null);
      setOk(`${saved.ad} ${saved.soyad} Ana Firma kadrosuna ${created ? 'alındı' : 'güncellendi'}.`);
      addNotification?.(`${saved.ad} ${saved.soyad} SGK evrakı ile Ana Firma girişi resmileşti.`);
    } catch (e: any) {
      setErr(e.message || 'Kayıt yazılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const resmilestirCikis = async () => {
    if (!sgkPreview) return;
    const bildirim = findSgkGrupBildirimi(bekleyenCikis, {
      ad: sgkPreview.ad,
      soyad: sgkPreview.soyad,
      tcNo: sgkPreview.tcNo,
      personelIsim: `${sgkPreview.ad || ''} ${sgkPreview.soyad || ''}`,
    });
    if (!bildirim) {
      setErr('Bu kişi için gruba çıkış bildirimi yok. Önce personeli çıkış tarihi ile gruba paylaşın.');
      return;
    }
    const mevcut =
      personeller.find((p) => p.id === bildirim.personelId) ||
      personeller.find((p) => String(p.tcNo || '').replace(/\D/g, '') === String(sgkPreview.tcNo || '').replace(/\D/g, ''));
    if (!mevcut) {
      setErr('Personel kartı bulunamadı. Çıkış resmileşmedi.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const next: Personel = {
        ...mevcut,
        durum: false,
        istenCikisTarihi: String(sgkPreview.iseGirisTarihi || bildirim.cikisTarihi || cikisTarihi).slice(0, 10),
      };
      await saveDocument('personeller', next);
      setPersoneller((prev) => prev.map((p) => (p.id === next.id ? next : p)));
      await updateDoc(doc(db, 'personelCikisTalepleri', bildirim.id), { durum: 'ONAYLANDI' });
      setSgkPreview(null);
      setOk(`${next.ad} ${next.soyad} çıkışı resmileşti (${next.istenCikisTarihi}).`);
      addNotification?.(`${next.ad} ${next.soyad} SGK çıkış evrakı ile işten çıkışı resmileşti.`);
    } catch (e: any) {
      setErr(e.message || 'Çıkış yazılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const parseFatura = async (file: File) => {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const { base64, mime, dataUrl } = await fileToBase64(file);
      setFtEvrakUrl(dataUrl);
      const res = await fetchApiJson<{ success: boolean; data?: any; error?: string }>('/api/parse-fatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mimeType: mime }),
      });
      if (!res.success || !res.data) throw new Error(res.error || 'Fatura okunamadı.');
      setFtParsed(res.data);
      const aday = suggestIrsaliyelerForFaturaUnvan(res.data.firma || '', irsaliyeler, faturalar, cariKartlar);
      setSeciliIrIds(aday.filter((x) => x.skor >= 70).map((x) => x.irsaliye.id));
      setOk(`Fatura okundu: ${res.data.faturaNo || 'numara yok'} · ${res.data.firma || ''}`);
    } catch (e: any) {
      setFtParsed(null);
      setErr(e.message || 'Fatura çözümlenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const kaydetFatura = () => {
    if (!ftParsed?.firma) {
      setErr('Önce Arnavutköy grubundan gelen faturayı yükleyin.');
      return;
    }
    const kalemler: FaturaItem[] = (ftParsed.kalemler || []).map((k: any, i: number) => {
      const stok = findStokMatch(k.urunAdi || k.ad || '', stokKartlar);
      const miktar = Number(k.miktar || 0);
      const birimFiyat = Number(k.birimFiyat || k.fiyat || 0);
      const kdvOran = Number(k.kdvOran || 20);
      const toplam = Number(k.toplam || miktar * birimFiyat);
      return {
        id: `fk_${Date.now()}_${i}`,
        urunAdi: k.urunAdi || k.ad || `Kalem ${i + 1}`,
        miktar,
        birim: k.birim || 'ADET',
        birimFiyat,
        kdvOran,
        toplam,
        stokKartId: stok?.id,
      };
    });
    if (!kalemler.length) {
      setErr('Faturada kalem okunamadı. Fatura Girişi sekmesinden elle tamamlayın.');
      return;
    }
    const sub = kalemler.reduce((s, k) => s + (k.toplam || 0), 0);
    const kdv = kalemler.reduce((s, k) => s + k.toplam * (k.kdvOran / 100), 0);
    const cari = resolveCariKartId(ftParsed.firma, cariKartlar);
    const fatura: Fatura = {
      id: `ft_wp_${Date.now()}`,
      faturaNo: ftParsed.faturaNo || `WP-${Date.now()}`,
      tarih: String(ftParsed.tarih || new Date().toISOString().slice(0, 10)).slice(0, 10),
      cariUnvan: ftParsed.firma,
      cariKartId: cari.cariKartId || '',
      toplamTutar: sub,
      kdvTutar: kdv,
      genelToplam: sub + kdv,
      durum: seciliIrIds.length ? 'UYUMLU' : 'KONTROL BEKLEYOR',
      kalemler,
      evrakUrl: ftEvrakUrl || undefined,
      bagliIrsaliyeler: seciliIrIds,
      donusumKaynagi: 'GRUP_KOPRU',
      kaynak: 'ARNAVUTKOY_WP',
    };
    setFaturalar((prev) => [fatura, ...prev]);
    if (seciliIrIds.length) {
      setIrsaliyeler((prev) => linkIrsaliyelerToFatura(prev, fatura));
    }
    setOk(
      seciliIrIds.length
        ? `${fatura.faturaNo} kaydedildi ve ${seciliIrIds.length} irsaliye eşleştirildi.`
        : `${fatura.faturaNo} kaydedildi. Eşleşen irsaliye yok; Evrak Bağlama’dan elle bağlayabilirsiniz.`
    );
    addNotification?.(`Arnavutköy faturası ${fatura.faturaNo} köprüden işlendi.`);
    setFtParsed(null);
    setSeciliIrIds([]);
  };

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="sa"
        eyebrow="WhatsApp köprüsü"
        title="Grup Köprüsü"
        subtitle={`${SGK_GRUP_ADI} ve Arnavutköy muhasebe grubu. Gruba gitmeyen Ana Firma giriş/çıkış resmileşmez.`}
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[12px] text-amber-950 leading-relaxed">
        <strong>Kural:</strong> Ana Firma işçi ancak SGK grubuna <em>kimlik + görev + giriş tarihi</em> atıldıktan
        ve SGK evrakı geldikten sonra kadroya alınır. Çıkış da önce gruba personel + tarih, evrak gelince resmileşir.
        WhatsApp grubunu program dinleyemez; sabit metni siz atarsınız, dönen evrakı buraya bırakırsınız.
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['giris', 'SGK işe giriş', UserPlus],
            ['cikis', 'SGK işten çıkış', UserMinus],
            ['fatura', 'Arnavutköy fatura', FileText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSubTab(id);
              setErr(null);
              setOk(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
              subTab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {err ? <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p> : null}
      {ok ? <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{ok}</p> : null}

      {subTab === 'giris' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">1 · Gruba bildir</h3>
            <p className="text-[11px] text-slate-500">Kimlik, görev (yoklama) ve giriş tarihi olmadan kuyruk açılmaz.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase text-slate-500 col-span-1">
                Ad *
                <input className={input} value={ad} onChange={(e) => setAd(e.target.value)} />
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Soyad *
                <input className={input} value={soyad} onChange={(e) => setSoyad(e.target.value)} />
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                TC (varsa)
                <input className={input} value={tcNo} onChange={(e) => setTcNo(e.target.value)} inputMode="numeric" />
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Giriş tarihi *
                <input type="date" className={input} value={girisTarihi} onChange={(e) => setGirisTarihi(e.target.value)} />
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500 col-span-2">
                Görevi (yoklama) *
                <input className={input} value={gorev} onChange={(e) => setGorev(e.target.value)} placeholder="Örn. DÜZ İŞÇİ" />
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500 col-span-2">
                Niteliği (SGK meslek)
                <input className={input} value={nitelik} onChange={(e) => setNitelik(e.target.value)} placeholder="Örn. ALÇI SIVA USTASI" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Kimlik görseli *
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void handleKimlik(e.target.files?.[0])} />
              {kimlikUrl ? <span className="text-emerald-700 font-medium">yüklendi</span> : <span className="text-slate-400 font-medium">yok</span>}
            </label>
            <pre className="text-[10px] bg-slate-50 border border-slate-100 rounded-xl p-3 whitespace-pre-wrap font-mono text-slate-700 max-h-40 overflow-auto">
              {girisMetin}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyText('giris', girisMetin)} className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1">
                {copied === 'giris' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Sabit metni kopyala
              </button>
              <a href={buildWhatsAppUrl(girisMetin)} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp’ta aç
              </a>
              <button type="button" disabled={busy} onClick={() => void kaydetGirisBildirimi()} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 cursor-pointer disabled:opacity-50">
                Gruba bildirildi — kuyruğa yaz
              </button>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">2 · SGK evrakı gelince resmileştir</h3>
            <label className="block text-xs font-bold text-slate-600 cursor-pointer border border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50">
              <Upload className="w-4 h-4 mx-auto mb-1" />
              {busy ? 'Okunuyor…' : 'İşe giriş bildirgesi (PDF / foto) bırakın'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void parseSgk(e.target.files[0], 'giris')} />
            </label>
            {sgkPreview && sgkKind === 'giris' ? (
              <div className="text-xs space-y-2 border border-slate-100 rounded-xl p-3">
                <p className="font-semibold">{sgkPreview.ad} {sgkPreview.soyad} · TC {sgkPreview.tcNo || '—'}</p>
                <p className="text-slate-500">SGK giriş: {sgkPreview.iseGirisTarihi || '—'}</p>
                {findSgkGrupBildirimi(bekleyenGiris, sgkPreview) ? (
                  <p className="text-emerald-700 font-bold">Grup bildirimi bulundu — Ana Firma girişi açılabilir.</p>
                ) : (
                  <p className="text-rose-700 font-bold">Grup bildirimi yok. Ana Firma kaydı engellendi.</p>
                )}
                <button type="button" disabled={busy} onClick={() => void resmilestirGiris()} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white cursor-pointer disabled:opacity-50">
                  Ana Firma girişini resmileştir
                </button>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Bekleyen grup bildirimleri ({bekleyenGiris.length})</p>
              <div className="max-h-48 overflow-auto border border-slate-100 rounded-xl">
                {bekleyenGiris.length === 0 ? (
                  <p className="p-3 text-[11px] text-slate-400 text-center">Kuyruk boş.</p>
                ) : (
                  bekleyenGiris.map((t) => (
                    <div key={t.id} className="px-3 py-2 text-[11px] border-b border-slate-50 flex justify-between gap-2">
                      <span className="font-semibold">{t.ad} {t.soyad}</span>
                      <span className="text-slate-500 truncate">{t.gorev} · {String(t.iseGirisTarihi || '').slice(0, 10)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {subTab === 'cikis' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">1 · Çıkacak personeli gruba bildir</h3>
            <label className="text-[10px] font-bold uppercase text-slate-500 block">
              Personel *
              <select className={input} value={cikisPersonelId} onChange={(e) => setCikisPersonelId(e.target.value)}>
                <option value="">Seçin</option>
                {aktifAnaFirma.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ad} {p.soyad} · {p.gorev} · {p.tcNo || 'TC yok'}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Çıkış tarihi
                <input type="date" className={input} value={cikisTarihi} onChange={(e) => setCikisTarihi(e.target.value)} />
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Neden
                <input className={input} value={cikisNedeni} onChange={(e) => setCikisNedeni(e.target.value)} />
              </label>
            </div>
            <pre className="text-[10px] bg-slate-50 border border-slate-100 rounded-xl p-3 whitespace-pre-wrap font-mono text-slate-700 max-h-40 overflow-auto">
              {cikisPersonel ? cikisMetin : 'Personel seçince sabit metin oluşur.'}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!cikisPersonel} onClick={() => void copyText('cikis', cikisMetin)} className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 bg-white cursor-pointer disabled:opacity-40 inline-flex items-center gap-1">
                {copied === 'cikis' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Sabit metni kopyala
              </button>
              <a href={cikisPersonel ? buildWhatsAppUrl(cikisMetin) : undefined} target="_blank" rel="noreferrer" className={`text-xs font-bold px-3 py-2 rounded-lg inline-flex items-center gap-1 ${cikisPersonel ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400 pointer-events-none'}`}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp’ta aç
              </a>
              <button type="button" disabled={busy || !cikisPersonel} onClick={() => void kaydetCikisBildirimi()} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white cursor-pointer disabled:opacity-50">
                Gruba bildirildi — kuyruğa yaz
              </button>
            </div>
          </section>
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">2 · Çıkış evrakı gelince resmileştir</h3>
            <label className="block text-xs font-bold text-slate-600 cursor-pointer border border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50">
              <Upload className="w-4 h-4 mx-auto mb-1" />
              {busy ? 'Okunuyor…' : 'Çıkış bildirgesi (PDF / foto) bırakın'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void parseSgk(e.target.files[0], 'cikis')} />
            </label>
            {sgkPreview && sgkKind === 'cikis' ? (
              <div className="text-xs space-y-2 border border-slate-100 rounded-xl p-3">
                <p className="font-semibold">{sgkPreview.ad} {sgkPreview.soyad}</p>
                <button type="button" disabled={busy} onClick={() => void resmilestirCikis()} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white cursor-pointer">
                  Çıkışı resmileştir
                </button>
              </div>
            ) : null}
            <div className="max-h-48 overflow-auto border border-slate-100 rounded-xl">
              {bekleyenCikis.length === 0 ? (
                <p className="p-3 text-[11px] text-slate-400 text-center">Bekleyen çıkış bildirimi yok.</p>
              ) : (
                bekleyenCikis.map((t) => (
                  <div key={t.id} className="px-3 py-2 text-[11px] border-b border-slate-50">
                    <span className="font-semibold">{t.personelIsim}</span>
                    <span className="text-slate-500"> · {String(t.cikisTarihi || '').slice(0, 10)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {subTab === 'fatura' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Arnavutköy muhasebe grubu</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Gruptaki faturayı buraya bırakın. Firma adı, açık irsaliyelerle eşleştirilir; onaylayınca fatura yazılır ve bağ kurulur.
            </p>
          </div>
          <label className="block text-xs font-bold text-slate-600 cursor-pointer border border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50">
            <Upload className="w-5 h-5 mx-auto mb-1" />
            {busy ? 'Fatura okunuyor…' : 'Fatura PDF / foto bırakın'}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void parseFatura(e.target.files[0])} />
          </label>
          {ftParsed ? (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                <p><span className="text-slate-500">No</span> <strong>{ftParsed.faturaNo || '—'}</strong></p>
                <p><span className="text-slate-500">Firma</span> <strong>{ftParsed.firma || '—'}</strong></p>
                <p><span className="text-slate-500">Tarih</span> <strong>{ftParsed.tarih || '—'}</strong></p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-2 inline-flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Eşleşen faturasız irsaliyeler
                </p>
                {irAdaylari.length === 0 ? (
                  <p className="text-[11px] text-slate-400 border border-slate-100 rounded-xl p-3">
                    Bu ünvanla açık irsaliye yok. Faturayı yine kaydedebilirsiniz; bağlama sonra Evrak Bağlama’dan yapılır.
                  </p>
                ) : (
                  <div className="border border-slate-100 rounded-xl max-h-56 overflow-auto">
                    {irAdaylari.map((a) => (
                      <label key={a.irsaliye.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-50 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={seciliIrIds.includes(a.irsaliye.id)}
                          onChange={() =>
                            setSeciliIrIds((prev) =>
                              prev.includes(a.irsaliye.id) ? prev.filter((x) => x !== a.irsaliye.id) : [...prev, a.irsaliye.id]
                            )
                          }
                        />
                        <span className="font-semibold">{a.irsaliye.irsaliyeNo}</span>
                        <span className="text-slate-500 truncate">{a.irsaliye.firma}</span>
                        <span className="ml-auto text-[10px] font-bold text-slate-600">
                          {eslesmeNedenLabel(a.neden)} · {a.skor}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={kaydetFatura} className="text-xs font-bold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 cursor-pointer">
                Faturayı kaydet{seciliIrIds.length ? ` ve ${seciliIrIds.length} irsaliyeyi bağla` : ''}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </EvrakPageShell>
  );
};

export default GrupKopruScreen;
