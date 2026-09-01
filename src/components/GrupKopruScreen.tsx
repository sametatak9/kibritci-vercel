import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Copy, Check, MessageCircle, Upload, UserPlus, UserMinus, FileText, Link2 } from 'lucide-react';
import type { CariKart, EvrakEtiketGrubu, Fatura, FaturaItem, Irsaliye, Personel, StokKart } from '../types/erp';
import { db, cleanUndefined } from '../lib/firebase';
import { fetchApiJson } from '../lib/apiClient';
import { compressImage } from '../lib/imageCompress';
import { buildWhatsAppUrl } from '../lib/mobilOnayUtils';
import { submitPersonelCikisTalebi } from '../lib/personelCikisTalebiUtils';
import { resolveCariKartId } from '../lib/evrakCariStokSync';
import { linkIrsaliyelerToFatura } from '../lib/evrakDonusum';
import { findStokMatch } from '../lib/evrakBatchImportUtils';
import {
  buildSgkCikisWhatsAppText,
  buildSgkGirisWhatsAppText,
  buildSgkTalepPatchFromParse,
  findSgkGrupBildirimi,
  hasSgkEvrak,
  isAnaFirmaGirisAcik,
  isSgkOnayHazir,
  sgkDurumEtiketi,
  SGK_GRUP_ADI,
} from '../lib/sgkGrupSablon';
import { eslesmeNedenLabel, suggestIrsaliyelerForFaturaUnvan } from '../lib/faturaIrsaliyeEslesme';
import { assignDocsToEtiketGrubu } from '../lib/evrakEtiketUtils';
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
  evrakEtiketGruplari?: EvrakEtiketGrubu[];
  setEvrakEtiketGruplari?: React.Dispatch<React.SetStateAction<EvrakEtiketGrubu[]>>;
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
  setPersoneller: _setPersoneller,
  irsaliyeler,
  faturalar,
  setIrsaliyeler,
  setFaturalar,
  evrakEtiketGruplari = [],
  setEvrakEtiketGruplari,
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
  const [sgkEvrakUrl, setSgkEvrakUrl] = useState<string | null>(null);
  const [sgkKind, setSgkKind] = useState<'giris' | 'cikis'>('giris');

  const [ftParsed, setFtParsed] = useState<any | null>(null);
  const [ftEvrakUrl, setFtEvrakUrl] = useState<string | null>(null);
  const [seciliIrIds, setSeciliIrIds] = useState<string[]>([]);
  const [etiketGrupId, setEtiketGrupId] = useState('');
  const [etiketYeniAd, setEtiketYeniAd] = useState('');

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
    (t) => t.kaynak === 'SGK_GRUP' && t.grupBildirildi && isAnaFirmaGirisAcik(t)
  );
  const bekleyenCikis = cikisTalepler.filter(
    (t) => t.kaynak === 'SGK_GRUP' && t.grupBildirildi && isAnaFirmaGirisAcik(t)
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
    if (!girisTarihi) {
      setErr('Giriş tarihi zorunlu. Gruba tarih yazılmadan Ana Firma kuyruğu açılamaz.');
      return;
    }
    const mevcut = findSgkGrupBildirimi(bekleyenGiris, { ad, soyad, tcNo });
    if (mevcut) {
      setErr(
        `Bu kişi için zaten açık bir grup bildirimi var (${mevcut.ad || ''} ${mevcut.soyad || ''} · ${mevcut.durum}). Aynı kişiye ikinci kuyruk açılmaz; evrakı mevcut bildirime bırakın.`
      );
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
      setOk('Grup bildirimi kuyruğa yazıldı. Sabit metni SGK grubuna atın. Evrak gelince buraya bırakın; kadro ancak Onay → Personel oluşturma’da tek kontrolle açılır.');
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
    if (!cikisTarihi) {
      setErr('Çıkış tarihi zorunlu. Gruba tarih yazılmadan çıkış kuyruğu açılamaz.');
      return;
    }
    const mevcut = findSgkGrupBildirimi(bekleyenCikis, {
      ad: cikisPersonel.ad,
      soyad: cikisPersonel.soyad,
      tcNo: cikisPersonel.tcNo,
      personelIsim: `${cikisPersonel.ad} ${cikisPersonel.soyad}`,
    });
    if (mevcut) {
      setErr(
        `Bu personel için zaten açık bir çıkış bildirimi var (${mevcut.durum}). Evrakı mevcut kuyruğa bırakın; ikinci talep açılmaz.`
      );
      return;
    }
    setBusy(true);
    try {
      await submitPersonelCikisTalebi({
        personelId: cikisPersonel.id,
        personelIsim: `${cikisPersonel.ad} ${cikisPersonel.soyad}`,
        personelGorev: cikisPersonel.gorev,
        personelMaas: cikisPersonel.maas,
        cikisTarihi,
        cikisNedeni,
        gonderen,
        kaynak: 'SGK_GRUP',
        tcNo: cikisPersonel.tcNo || '',
        durum: 'WP_GÖNDERİLDİ',
        grupBildirildi: true,
        firmaTipi: 'ANA_FIRMA',
      });
      setOk('Çıkış bildirimi kuyruğa yazıldı. Sabit metni gruba atın. Evrak gelince buraya bırakın; çıkış ancak Onay → Personel giriş-çıkış’ta resmileşir.');
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
      const { base64, mime, dataUrl } = await fileToBase64(file);
      const res = await fetchApiJson<{ success: boolean; data?: any; error?: string }>('/api/parse-sgk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mimeType: mime }),
      });
      if (!res.success || !res.data) throw new Error(res.error || 'SGK evrakı okunamadı.');
      setSgkEvrakUrl(dataUrl);
      setSgkPreview(res.data);
      setOk(`Evrak okundu: ${res.data.ad || ''} ${res.data.soyad || ''}`.trim());
    } catch (e: any) {
      setSgkPreview(null);
      setSgkEvrakUrl(null);
      setErr(e.message || 'SGK evrakı çözümlenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const onayaBirakGiris = async () => {
    if (!sgkPreview) return;
    const bildirim = findSgkGrupBildirimi(bekleyenGiris, sgkPreview);
    if (!isAnaFirmaGirisAcik(bildirim) || !bildirim?.id) {
      setErr(
        'Bu kimlik SGK grubuna bildirilmemiş. Ana Firma girişi yapılamaz. Önce kimlik, görev ve giriş tarihini gruba atıp kuyruğa yazın.'
      );
      return;
    }
    if (!sgkEvrakUrl) {
      setErr('SGK evrakı okunamadı. Bildirgeyi yeniden bırakın.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await updateDoc(
        doc(db, 'personelGirisTalepleri', bildirim.id),
        cleanUndefined(buildSgkTalepPatchFromParse(sgkPreview, sgkEvrakUrl, 'giris', bildirim))
      );
      setSgkPreview(null);
      setSgkEvrakUrl(null);
      setOk(
        `${sgkPreview.ad || bildirim.ad} ${sgkPreview.soyad || bildirim.soyad} için grup bildirimi + SGK evrakı Onay → Personel oluşturma kuyruğuna düştü. Kadrosu orada tek onayla açılır.`
      );
      addNotification?.(
        `${sgkPreview.ad || bildirim.ad} ${sgkPreview.soyad || bildirim.soyad} SGK evrakı Onay kuyruğuna bırakıldı (personel yazılmadı).`
      );
    } catch (e: any) {
      setErr(e.message || 'Onay kuyruğuna yazılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const onayaBirakCikis = async () => {
    if (!sgkPreview) return;
    const bildirim = findSgkGrupBildirimi(bekleyenCikis, {
      ad: sgkPreview.ad,
      soyad: sgkPreview.soyad,
      tcNo: sgkPreview.tcNo,
      personelIsim: `${sgkPreview.ad || ''} ${sgkPreview.soyad || ''}`,
    });
    if (!bildirim?.id) {
      setErr('Bu kişi için gruba çıkış bildirimi yok. Önce personeli çıkış tarihi ile gruba paylaşın.');
      return;
    }
    if (!sgkEvrakUrl) {
      setErr('SGK çıkış evrakı okunamadı. Bildirgeyi yeniden bırakın.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await updateDoc(
        doc(db, 'personelCikisTalepleri', bildirim.id),
        cleanUndefined(buildSgkTalepPatchFromParse(sgkPreview, sgkEvrakUrl, 'cikis', bildirim))
      );
      setSgkPreview(null);
      setSgkEvrakUrl(null);
      setOk(
        `${bildirim.personelIsim || `${sgkPreview.ad || ''} ${sgkPreview.soyad || ''}`.trim()} çıkış evrakı Onay → Personel giriş-çıkış kuyruğuna düştü. Çıkış orada tek onayla resmileşir.`
      );
      addNotification?.(
        `${bildirim.personelIsim || 'Personel'} SGK çıkış evrakı Onay kuyruğuna bırakıldı (kart pasife alınmadı).`
      );
    } catch (e: any) {
      setErr(e.message || 'Onay kuyruğuna yazılamadı.');
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
    const etiketAd = etiketYeniAd.trim();
    let etiketNot = '';
    if (setEvrakEtiketGruplari && (etiketGrupId || etiketAd)) {
      const saFromIrs = irsaliyeler
        .filter((ir) => seciliIrIds.includes(ir.id) && ir.saId)
        .map((ir) => String(ir.saId));
      setEvrakEtiketGruplari((prev) =>
        assignDocsToEtiketGrubu(prev, {
          grupId: etiketGrupId || undefined,
          yeniAd: etiketAd || undefined,
          createdBy: currentUser?.email,
          faturaIds: [fatura.id],
          irsaliyeIds: seciliIrIds,
          saIds: saFromIrs,
        })
      );
      const hedef =
        evrakEtiketGruplari.find((g) => g.id === etiketGrupId)?.ad || etiketAd;
      etiketNot = hedef ? ` Evrak Etiketleri → ${hedef}.` : '';
    }
    setOk(
      seciliIrIds.length
        ? `${fatura.faturaNo} kaydedildi ve ${seciliIrIds.length} irsaliye eşleştirildi. Fatura Girişi arşivinde görünür.${etiketNot}`
        : `${fatura.faturaNo} kaydedildi. Eşleşen irsaliye yok; Evrak Bağlama’dan elle bağlayabilirsiniz. Fatura Girişi arşivinde görünür.${etiketNot}`
    );
    addNotification?.(`Arnavutköy faturası ${fatura.faturaNo} köprüden işlendi.`);
    setFtParsed(null);
    setFtEvrakUrl(null);
    setSeciliIrIds([]);
    setEtiketGrupId('');
    setEtiketYeniAd('');
  };

  return (
    <EvrakPageShell>
      <EvrakSectionHeader
        accent="sa"
        eyebrow="WhatsApp köprüsü"
        title="Grup Köprüsü"
        subtitle={`${SGK_GRUP_ADI} ve Arnavutköy muhasebe grubu. Gruba gitmeyen Ana Firma giriş/çıkış onaya bile düşmez.`}
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[12px] text-amber-950 leading-relaxed">
        <strong>Kural:</strong> Ana Firma işçi ancak SGK grubuna <em>kimlik + görev + giriş tarihi</em> atıldıktan
        ve SGK evrakı geldikten sonra Onay → Personel oluşturma kuyruğuna düşer. Kadro buradan yazılmaz;
        tek insan kontrolü Onay sekmesindedir. Çıkış da aynı: önce gruba personel + tarih, evrak gelince onaya düşer.
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
            <h3 className="text-sm font-semibold text-slate-900">2 · SGK evrakı gelince onaya bırak</h3>
            <p className="text-[11px] text-slate-500">Personel kartı burada açılmaz. Evrak, mevcut grup bildirimine bağlanır ve Onay kuyruğuna düşer.</p>
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
                  <p className="text-emerald-700 font-bold">Grup bildirimi bulundu — Onay kuyruğuna bırakılabilir. Personel kartı burada yazılmaz.</p>
                ) : (
                  <p className="text-rose-700 font-bold">Eşleşen grup bildirimi yok (TC veya birebir ad-soyad). Ana Firma işlemi engellendi; onaya da düşmez.</p>
                )}
                <button
                  type="button"
                  disabled={busy || !findSgkGrupBildirimi(bekleyenGiris, sgkPreview)}
                  onClick={() => void onayaBirakGiris()}
                  className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white cursor-pointer disabled:opacity-50"
                >
                  Onay → Personel oluşturma’ya bırak
                </button>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Bekleyen grup bildirimleri ({bekleyenGiris.length})</p>
              <div className="max-h-48 overflow-auto border border-slate-100 rounded-xl">
                {bekleyenGiris.length === 0 ? (
                  <p className="p-3 text-[11px] text-slate-500 text-center">
                    Henüz grup bildirimi yok. Kimlik, görev (yoklama) ve giriş tarihini yazıp «Gruba bildirildi» deyin.
                  </p>
                ) : (
                  bekleyenGiris.map((t) => (
                    <div key={t.id} className="px-3 py-2 text-[11px] border-b border-slate-50 flex justify-between gap-2">
                      <span className="font-semibold">{t.ad} {t.soyad}</span>
                      <span className="text-slate-500 truncate">
                        {sgkDurumEtiketi(t.durum, { sgkTalep: true, kind: 'giris' })}
                        {' · '}
                        {t.gorev} · {String(t.iseGirisTarihi || '').slice(0, 10)}
                        {isSgkOnayHazir(t) ? ' · onaya düştü' : hasSgkEvrak(t) ? ' · evrak var' : ' · evrak bekleniyor'}
                      </span>
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
            <h3 className="text-sm font-semibold text-slate-900">2 · Çıkış evrakı gelince onaya bırak</h3>
            <p className="text-[11px] text-slate-500">Kart burada pasife alınmaz. Evrak, grup bildirimine bağlanır; çıkış Onay’da tek tıkla resmileşir.</p>
            <label className="block text-xs font-bold text-slate-600 cursor-pointer border border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50">
              <Upload className="w-4 h-4 mx-auto mb-1" />
              {busy ? 'Okunuyor…' : 'Çıkış bildirgesi (PDF / foto) bırakın'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void parseSgk(e.target.files[0], 'cikis')} />
            </label>
            {sgkPreview && sgkKind === 'cikis' ? (
              <div className="text-xs space-y-2 border border-slate-100 rounded-xl p-3">
                <p className="font-semibold">{sgkPreview.ad} {sgkPreview.soyad}</p>
                {findSgkGrupBildirimi(bekleyenCikis, {
                  ad: sgkPreview.ad,
                  soyad: sgkPreview.soyad,
                  tcNo: sgkPreview.tcNo,
                  personelIsim: `${sgkPreview.ad || ''} ${sgkPreview.soyad || ''}`,
                }) ? (
                  <p className="text-emerald-700 font-bold">Grup bildirimi bulundu — Onay kuyruğuna bırakılabilir. Kart burada pasife alınmaz.</p>
                ) : (
                  <p className="text-rose-700 font-bold">Eşleşen çıkış bildirimi yok (TC veya birebir ad-soyad). Çıkış onaya düşmez.</p>
                )}
                <button
                  type="button"
                  disabled={
                    busy ||
                    !findSgkGrupBildirimi(bekleyenCikis, {
                      ad: sgkPreview.ad,
                      soyad: sgkPreview.soyad,
                      tcNo: sgkPreview.tcNo,
                      personelIsim: `${sgkPreview.ad || ''} ${sgkPreview.soyad || ''}`,
                    })
                  }
                  onClick={() => void onayaBirakCikis()}
                  className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white cursor-pointer disabled:opacity-50"
                >
                  Onay → Personel çıkış’a bırak
                </button>
              </div>
            ) : null}
            <div className="max-h-48 overflow-auto border border-slate-100 rounded-xl">
              {bekleyenCikis.length === 0 ? (
                <p className="p-3 text-[11px] text-slate-500 text-center">
                  Bekleyen Ana Firma çıkış bildirimi yok. Önce personeli ve çıkış tarihini gruba bildirin.
                </p>
              ) : (
                bekleyenCikis.map((t) => (
                  <div key={t.id} className="px-3 py-2 text-[11px] border-b border-slate-50">
                    <span className="font-semibold">{t.personelIsim}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {sgkDurumEtiketi(t.durum, { sgkTalep: true, kind: 'cikis' })} · {String(t.cikisTarihi || '').slice(0, 10)}
                      {isSgkOnayHazir(t) ? ' · onaya düştü' : hasSgkEvrak(t) ? ' · evrak var' : ' · evrak bekleniyor'}
                    </span>
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
              Grubu program dinlemez; faturayı buraya bırakın. WhatsApp API mevcut gruba bot olarak giremez.
              Yüklediğiniz belge okunur, firma / ünvana göre açık irsaliyeler önerilir; kaydedince fatura
              Fatura Girişi arşivine düşer. İsterseniz etiket grubuna da eklenir.
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
              <div className="rounded-xl border border-slate-100 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">Etiket grubuna ekle (isteğe bağlı)</p>
                <p className="text-[11px] text-slate-500">
                  Yeni faturayı ve işaretlenen irsaliyeleri bir nitelik klasörüne koyun — İnce, Mıcır, Demir.
                  Bu, Evrak Bağlama zinciri değildir.
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    Kayıtlı grup
                    <select
                      className={input}
                      value={etiketGrupId}
                      onChange={(e) => {
                        setEtiketGrupId(e.target.value);
                        if (e.target.value) setEtiketYeniAd('');
                      }}
                    >
                      <option value="">Seçilmedi</option>
                      {evrakEtiketGruplari
                        .slice()
                        .sort((a, b) => a.ad.localeCompare(b.ad, 'tr-TR'))
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.ad}
                            {g.nitelik ? ` · ${g.nitelik}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    veya yeni ad yazın
                    <input
                      className={input}
                      value={etiketYeniAd}
                      onChange={(e) => {
                        setEtiketYeniAd(e.target.value);
                        if (e.target.value.trim()) setEtiketGrupId('');
                      }}
                      placeholder="Örn. İnce Grubu siparişleri"
                    />
                  </label>
                </div>
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
