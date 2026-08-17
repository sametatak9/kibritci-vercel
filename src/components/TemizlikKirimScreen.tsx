import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera, Droplets, MapPin, Plus, Printer, Trash2, X,
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import {
  TemizlikBaca,
  TemizlikBacaTespit,
  TemizlikBacaUygulama,
  TemizlikDaire,
  TemizlikIsTipi,
  TemizlikOdaDurum,
  TemizlikOdaTespit,
  TemizlikTespit,
  TemizlikUygulama,
  TemizlikUygulamaDurum,
  TemizlikBacaKirlilik,
} from '../types/erp';
import { db, cleanUndefined, saveDocument } from '../lib/firebase';
import { todayDateKey } from '../lib/dateKeyUtils';
import { PARSEL_LIST, blokListForParsel } from '../data/parselBlokMap';
import { uploadTemizlikKirimFoto } from '../lib/temizlikKirimFotoStorage';
import {
  TEMIZLIK_DEFAULT_PARSEL,
  TEMIZLIK_KART_DURUM_LABEL,
  TEMIZLIK_ODA_CHIPS,
  deriveKartDurum,
  latestByDate,
  newTemizlikId,
  nextBacaEtiket,
  ozetBacaParsel,
  ozetDaireParsel,
  sumYevmiye,
} from '../lib/temizlikKirimUtils';
import {
  buildBacaParselRaporHtml,
  buildDaireParselRaporHtml,
  openTemizlikRapor,
} from '../lib/temizlikKirimReport';

const PARSEL_SECENEK = PARSEL_LIST.filter((p) => p !== 'GENEL SAHA');

const ODA_DURUM: { id: TemizlikOdaDurum; label: string }[] = [
  { id: 'KIRLI', label: 'Kirli' },
  { id: 'ORTA', label: 'Orta' },
  { id: 'TEMIZ', label: 'Temiz' },
  { id: 'KIRIM_GEREKIYOR', label: 'Kırım gerekli' },
];

const BACA_KIRLILIK: { id: TemizlikBacaKirlilik; label: string }[] = [
  { id: 'KIRLI', label: 'Kirli' },
  { id: 'ORTA', label: 'Orta' },
  { id: 'TEMIZ', label: 'Temiz' },
  { id: 'AGIR_CAMUR', label: 'Ağır çamur' },
];

async function persistFotoUrls(
  kind: 'daire' | 'baca',
  entityId: string,
  asama: string,
  urls: string[]
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (!u) continue;
    if (/^https?:\/\//i.test(u)) out.push(u);
    else out.push(await uploadTemizlikKirimFoto(kind, entityId, `${asama}_${i}`, u));
  }
  return out;
}

function readFilesAsDataUrls(files: FileList | null, max: number, existing: string[]): Promise<string[]> {
  const list = files ? Array.from(files).slice(0, Math.max(0, max - existing.length)) : [];
  return Promise.all(
    list.map(
      (file) =>
        new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => resolve('');
          r.readAsDataURL(file);
        })
    )
  ).then((rows) => [...existing, ...rows.filter(Boolean)]);
}

const FotoAlani: React.FC<{
  urls: string[];
  onChange: (next: string[]) => void;
  max?: number;
}> = ({ urls, onChange, max = 4 }) => (
  <div className="flex flex-wrap gap-2">
    {urls.map((u, i) => (
      <div key={`${u.slice(0, 24)}_${i}`} className="relative w-20 h-16 rounded-xl overflow-hidden border border-slate-200">
        <img src={u} alt="" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(urls.filter((_, j) => j !== i))}
          className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full w-4 h-4 text-[9px] font-bold cursor-pointer"
        >
          ×
        </button>
      </div>
    ))}
    {urls.length < max && (
      <label className="w-20 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer">
        <Camera size={16} />
        <span className="text-[8px] font-bold mt-0.5">Foto</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void readFilesAsDataUrls(e.target.files, max, urls).then(onChange);
            e.target.value = '';
          }}
        />
      </label>
    )}
  </div>
);

interface Props {
  currentUser?: { email?: string } | null;
}

export const TemizlikKirimScreen: React.FC<Props> = ({ currentUser }) => {
  const kaydeden = currentUser?.email || 'saha';
  const [mainTab, setMainTab] = useState<'daire' | 'baca'>('daire');
  const [parsel, setParsel] = useState(TEMIZLIK_DEFAULT_PARSEL);
  const [selectedBlok, setSelectedBlok] = useState('A1');
  const [selectedDaireId, setSelectedDaireId] = useState<string | null>(null);
  const [selectedBacaId, setSelectedBacaId] = useState<string | null>(null);
  const [kartTab, setKartTab] = useState<'tespit' | 'uygulama'>('tespit');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [daireler, setDaireler] = useState<TemizlikDaire[]>([]);
  const [tespitler, setTespitler] = useState<TemizlikTespit[]>([]);
  const [uygulamalar, setUygulamalar] = useState<TemizlikUygulama[]>([]);
  const [bacalar, setBacalar] = useState<TemizlikBaca[]>([]);
  const [bacaTespitler, setBacaTespitler] = useState<TemizlikBacaTespit[]>([]);
  const [bacaUygulamalar, setBacaUygulamalar] = useState<TemizlikBacaUygulama[]>([]);

  const [yeniDaireNo, setYeniDaireNo] = useState('');
  const [yeniKat, setYeniKat] = useState('');
  const [yeniBacaYer, setYeniBacaYer] = useState('');
  const [yeniBacaBlok, setYeniBacaBlok] = useState('');

  const [isTipi, setIsTipi] = useState<TemizlikIsTipi>('TEMIZLIK');
  const [odalar, setOdalar] = useState<TemizlikOdaTespit[]>([]);
  const [genelYorum, setGenelYorum] = useState('');
  const [planYevmiye, setPlanYevmiye] = useState('1');
  const [planNotu, setPlanNotu] = useState('');
  const [customOda, setCustomOda] = useState('');

  const [bacaKirlilik, setBacaKirlilik] = useState<TemizlikBacaKirlilik>('KIRLI');
  const [bacaYorum, setBacaYorum] = useState('');
  const [bacaFotolar, setBacaFotolar] = useState<string[]>([]);
  const [bacaPlanYevmiye, setBacaPlanYevmiye] = useState('1');
  const [bacaPlanNotu, setBacaPlanNotu] = useState('');

  const [uygTarih, setUygTarih] = useState(todayDateKey());
  const [uygYevmiye, setUygYevmiye] = useState('1');
  const [uygDurum, setUygDurum] = useState<TemizlikUygulamaDurum>('DEVAM');
  const [uygAciklama, setUygAciklama] = useState('');
  const [uygFotolar, setUygFotolar] = useState<string[]>([]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'temizlikDaireleri'), (s) =>
      setDaireler(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    const u2 = onSnapshot(collection(db, 'temizlikTespitleri'), (s) =>
      setTespitler(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    const u3 = onSnapshot(collection(db, 'temizlikUygulamalari'), (s) =>
      setUygulamalar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    const u4 = onSnapshot(collection(db, 'temizlikBacalar'), (s) =>
      setBacalar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    const u5 = onSnapshot(collection(db, 'temizlikBacaTespitleri'), (s) =>
      setBacaTespitler(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    const u6 = onSnapshot(collection(db, 'temizlikBacaUygulamalari'), (s) =>
      setBacaUygulamalar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, []);

  const bloklar = useMemo(() => blokListForParsel(parsel).filter((b) => b !== 'GENEL SAHA'), [parsel]);
  useEffect(() => {
    if (!bloklar.includes(selectedBlok)) setSelectedBlok(bloklar[0] || 'A1');
  }, [parsel, bloklar, selectedBlok]);

  const parselDaireler = useMemo(
    () => daireler.filter((d) => d.parsel === parsel),
    [daireler, parsel]
  );
  const blokDaireler = useMemo(
    () =>
      parselDaireler
        .filter((d) => d.blok === selectedBlok)
        .sort((a, b) => a.daireNo.localeCompare(b.daireNo, 'tr', { numeric: true })),
    [parselDaireler, selectedBlok]
  );
  const parselBacalar = useMemo(
    () =>
      bacalar
        .filter((b) => b.parsel === parsel)
        .sort((a, b) => a.etiket.localeCompare(b.etiket, 'tr', { numeric: true })),
    [bacalar, parsel]
  );

  const selectedDaire = daireler.find((d) => d.id === selectedDaireId) || null;
  const selectedBaca = bacalar.find((b) => b.id === selectedBacaId) || null;
  const daireTespit: TemizlikTespit | undefined = selectedDaire
    ? latestByDate(tespitler.filter((t) => t.daireId === selectedDaire.id))
    : undefined;
  const daireUyg = selectedDaire ? uygulamalar.filter((u) => u.daireId === selectedDaire.id) : [];
  const bacaTespit: TemizlikBacaTespit | undefined = selectedBaca
    ? latestByDate(bacaTespitler.filter((t) => t.bacaId === selectedBaca.id))
    : undefined;
  const bacaUyg = selectedBaca ? bacaUygulamalar.filter((u) => u.bacaId === selectedBaca.id) : [];

  useEffect(() => {
    if (!selectedDaireId) return;
    const t: TemizlikTespit | undefined = latestByDate(
      tespitler.filter((x) => x.daireId === selectedDaireId)
    );
    setIsTipi(t?.isTipi || 'TEMIZLIK');
    setOdalar(t?.odalar?.length ? t.odalar : []);
    setGenelYorum(t?.genelYorum || '');
    setPlanYevmiye(String(t?.planlananYevmiye ?? 1));
    setPlanNotu(t?.planNotu || '');
    setKartTab('tespit');
  }, [selectedDaireId, daireTespit?.id]);

  useEffect(() => {
    if (!selectedBacaId) return;
    const t: TemizlikBacaTespit | undefined = latestByDate(
      bacaTespitler.filter((x) => x.bacaId === selectedBacaId)
    );
    setBacaKirlilik(t?.kirlilikDurumu || 'KIRLI');
    setBacaYorum(t?.iscilikYorumu || '');
    setBacaFotolar(t?.fotoUrls || []);
    setBacaPlanYevmiye(String(t?.planlananYevmiye ?? 1));
    setBacaPlanNotu(t?.planNotu || '');
    setKartTab('tespit');
  }, [selectedBacaId, bacaTespit?.id]);

  const showMsg = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 3500);
  };

  const addOda = (ad: string) => {
    const name = ad.trim();
    if (!name) return;
    if (odalar.some((o) => o.ad.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) return;
    setOdalar((prev) => [
      ...prev,
      { id: newTemizlikId('oda'), ad: name, durum: 'KIRLI', yorum: '', fotoUrls: [] },
    ]);
  };

  const handleDaireAc = async () => {
    const no = yeniDaireNo.trim();
    if (!no) {
      showMsg('Daire numarası yazın.');
      return;
    }
    if (blokDaireler.some((d) => d.daireNo.toLocaleLowerCase('tr-TR') === no.toLocaleLowerCase('tr-TR'))) {
      showMsg('Bu blokta bu daire zaten açık.');
      return;
    }
    setBusy(true);
    try {
      const row: TemizlikDaire = {
        id: newTemizlikId('td'),
        parsel,
        blok: selectedBlok,
        daireNo: no,
        kat: yeniKat.trim() || undefined,
        ozetDurum: 'TESPIT_BEKLIYOR',
        kayitTarihi: new Date().toISOString(),
        kaydeden,
      };
      await saveDocument('temizlikDaireleri', cleanUndefined(row));
      setYeniDaireNo('');
      setYeniKat('');
      setSelectedDaireId(row.id);
      showMsg(`Daire ${no} açıldı.`);
    } catch (e: any) {
      showMsg(e?.message || 'Daire açılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleBacaAc = async () => {
    const yer = yeniBacaYer.trim();
    if (!yer) {
      showMsg('Yer tarifini yazın (ör. C3 kuzey, merdiven dibi).');
      return;
    }
    setBusy(true);
    try {
      const etiket = nextBacaEtiket(parsel, bacalar);
      const row: TemizlikBaca = {
        id: newTemizlikId('tb'),
        parsel,
        blok: yeniBacaBlok.trim() || undefined,
        etiket,
        yerTarifi: yer,
        ozetDurum: 'TESPIT_BEKLIYOR',
        kayitTarihi: new Date().toISOString(),
        kaydeden,
      };
      await saveDocument('temizlikBacalar', cleanUndefined(row));
      setYeniBacaYer('');
      setYeniBacaBlok('');
      setSelectedBacaId(row.id);
      showMsg(`${etiket} tespit edildi.`);
    } catch (e: any) {
      showMsg(e?.message || 'Baca kaydı açılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDaireTespit = async () => {
    if (!selectedDaire) return;
    if (odalar.length === 0) {
      showMsg('En az bir oda ekleyin.');
      return;
    }
    setBusy(true);
    try {
      const persistedOdalar: TemizlikOdaTespit[] = [];
      for (const o of odalar) {
        persistedOdalar.push({
          ...o,
          fotoUrls: await persistFotoUrls('daire', selectedDaire.id, `oda_${o.id}`, o.fotoUrls || []),
        });
      }
      const t: TemizlikTespit = {
        id: daireTespit?.id || newTemizlikId('tt'),
        daireId: selectedDaire.id,
        parsel: selectedDaire.parsel,
        blok: selectedDaire.blok,
        daireNo: selectedDaire.daireNo,
        isTipi,
        odalar: persistedOdalar,
        genelYorum: genelYorum.trim() || undefined,
        planlananYevmiye: Number(planYevmiye) || 0,
        planNotu: planNotu.trim() || undefined,
        tarih: todayDateKey(),
        kaydeden,
      };
      await saveDocument('temizlikTespitleri', cleanUndefined(t));
      const h = sumYevmiye(daireUyg);
      const ozetDurum = deriveKartDurum({
        hasTespit: true,
        planlananYevmiye: t.planlananYevmiye,
        harcananYevmiye: h,
        uygulamalar: daireUyg,
      });
      await saveDocument(
        'temizlikDaireleri',
        cleanUndefined({ ...selectedDaire, ozetDurum, guncellemeTarihi: new Date().toISOString() })
      );
      setOdalar(persistedOdalar);
      showMsg('Tespit kaydedildi.');
    } catch (e: any) {
      showMsg(e?.message || 'Tespit kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBacaTespit = async () => {
    if (!selectedBaca) return;
    if (bacaFotolar.length === 0) {
      showMsg('En az bir fotoğraf çekin.');
      return;
    }
    setBusy(true);
    try {
      const fotoUrls = await persistFotoUrls('baca', selectedBaca.id, 'tespit', bacaFotolar);
      const t: TemizlikBacaTespit = {
        id: bacaTespit?.id || newTemizlikId('btt'),
        bacaId: selectedBaca.id,
        parsel: selectedBaca.parsel,
        blok: selectedBaca.blok,
        etiket: selectedBaca.etiket,
        fotoUrls,
        kirlilikDurumu: bacaKirlilik,
        iscilikYorumu: bacaYorum.trim() || undefined,
        planlananYevmiye: Number(bacaPlanYevmiye) || 0,
        planNotu: bacaPlanNotu.trim() || undefined,
        tarih: todayDateKey(),
        kaydeden,
      };
      await saveDocument('temizlikBacaTespitleri', cleanUndefined(t));
      const h = sumYevmiye(bacaUyg);
      const ozetDurum = deriveKartDurum({
        hasTespit: true,
        planlananYevmiye: t.planlananYevmiye,
        harcananYevmiye: h,
        uygulamalar: bacaUyg,
      });
      await saveDocument(
        'temizlikBacalar',
        cleanUndefined({ ...selectedBaca, ozetDurum, guncellemeTarihi: new Date().toISOString() })
      );
      setBacaFotolar(fotoUrls);
      showMsg('Baca tespiti kaydedildi.');
    } catch (e: any) {
      showMsg(e?.message || 'Tespit kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDaireUygulama = async () => {
    if (!selectedDaire || !daireTespit) {
      showMsg('Önce tespit kaydedin.');
      return;
    }
    setBusy(true);
    try {
      const fotoUrls = await persistFotoUrls('daire', selectedDaire.id, 'uyg', uygFotolar);
      const row: TemizlikUygulama = {
        id: newTemizlikId('tu'),
        daireId: selectedDaire.id,
        tespitId: daireTespit.id,
        parsel: selectedDaire.parsel,
        blok: selectedDaire.blok,
        daireNo: selectedDaire.daireNo,
        tarih: uygTarih,
        harcananYevmiye: Number(uygYevmiye) || 0,
        durum: uygDurum,
        aciklama: uygAciklama.trim() || undefined,
        fotoUrls,
        kaydeden,
      };
      await saveDocument('temizlikUygulamalari', cleanUndefined(row));
      const all = [...daireUyg, row];
      const h = sumYevmiye(all);
      const ozetDurum = deriveKartDurum({
        hasTespit: true,
        planlananYevmiye: daireTespit.planlananYevmiye,
        harcananYevmiye: h,
        uygulamalar: all,
      });
      await saveDocument(
        'temizlikDaireleri',
        cleanUndefined({ ...selectedDaire, ozetDurum, guncellemeTarihi: new Date().toISOString() })
      );
      setUygAciklama('');
      setUygFotolar([]);
      showMsg('Uygulama kaydedildi.');
    } catch (e: any) {
      showMsg(e?.message || 'Uygulama kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBacaUygulama = async () => {
    if (!selectedBaca || !bacaTespit) {
      showMsg('Önce baca tespitini kaydedin.');
      return;
    }
    setBusy(true);
    try {
      const fotoUrls = await persistFotoUrls('baca', selectedBaca.id, 'uyg', uygFotolar);
      const row: TemizlikBacaUygulama = {
        id: newTemizlikId('bu'),
        bacaId: selectedBaca.id,
        tespitId: bacaTespit.id,
        parsel: selectedBaca.parsel,
        etiket: selectedBaca.etiket,
        tarih: uygTarih,
        harcananYevmiye: Number(uygYevmiye) || 0,
        durum: uygDurum,
        aciklama: uygAciklama.trim() || undefined,
        fotoUrls,
        kaydeden,
      };
      await saveDocument('temizlikBacaUygulamalari', cleanUndefined(row));
      const all = [...bacaUyg, row];
      const h = sumYevmiye(all);
      const ozetDurum = deriveKartDurum({
        hasTespit: true,
        planlananYevmiye: bacaTespit.planlananYevmiye,
        harcananYevmiye: h,
        uygulamalar: all,
      });
      await saveDocument(
        'temizlikBacalar',
        cleanUndefined({ ...selectedBaca, ozetDurum, guncellemeTarihi: new Date().toISOString() })
      );
      setUygAciklama('');
      setUygFotolar([]);
      showMsg('Baca uygulaması kaydedildi.');
    } catch (e: any) {
      showMsg(e?.message || 'Uygulama kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDaire = async (d: TemizlikDaire) => {
    if (!window.confirm(`Daire ${d.daireNo} silinsin mi? Tespit ve uygulamalar da gider.`)) return;
    setBusy(true);
    try {
      for (const t of tespitler.filter((x) => x.daireId === d.id)) {
        await deleteDoc(doc(db, 'temizlikTespitleri', t.id));
      }
      for (const u of uygulamalar.filter((x) => x.daireId === d.id)) {
        await deleteDoc(doc(db, 'temizlikUygulamalari', u.id));
      }
      await deleteDoc(doc(db, 'temizlikDaireleri', d.id));
      if (selectedDaireId === d.id) setSelectedDaireId(null);
      showMsg('Daire silindi.');
    } catch (e: any) {
      showMsg(e?.message || 'Silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBaca = async (b: TemizlikBaca) => {
    if (!window.confirm(`${b.etiket} silinsin mi?`)) return;
    setBusy(true);
    try {
      for (const t of bacaTespitler.filter((x) => x.bacaId === b.id)) {
        await deleteDoc(doc(db, 'temizlikBacaTespitleri', t.id));
      }
      for (const u of bacaUygulamalar.filter((x) => x.bacaId === b.id)) {
        await deleteDoc(doc(db, 'temizlikBacaUygulamalari', u.id));
      }
      await deleteDoc(doc(db, 'temizlikBacalar', b.id));
      if (selectedBacaId === b.id) setSelectedBacaId(null);
      showMsg('Baca silindi.');
    } catch (e: any) {
      showMsg(e?.message || 'Silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const daireDurumOf = (d: TemizlikDaire) => {
    const t: TemizlikTespit | undefined = latestByDate(tespitler.filter((x) => x.daireId === d.id));
    const u = uygulamalar.filter((x) => x.daireId === d.id);
    return deriveKartDurum({
      hasTespit: !!t,
      planlananYevmiye: Number(t?.planlananYevmiye || 0),
      harcananYevmiye: sumYevmiye(u),
      uygulamalar: u,
    });
  };
  const bacaDurumOf = (b: TemizlikBaca) => {
    const t: TemizlikBacaTespit | undefined = latestByDate(bacaTespitler.filter((x) => x.bacaId === b.id));
    const u = bacaUygulamalar.filter((x) => x.bacaId === b.id);
    return deriveKartDurum({
      hasTespit: !!t,
      planlananYevmiye: Number(t?.planlananYevmiye || 0),
      harcananYevmiye: sumYevmiye(u),
      uygulamalar: u,
    });
  };

  const ozetKart = (label: string, value: string | number, hint?: string) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 min-w-[110px] flex-1">
      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-lg font-black text-slate-900 mt-0.5">{value}</p>
      {hint ? <p className="text-[9px] text-slate-500">{hint}</p> : null}
    </div>
  );

  const dairePlan = Number(daireTespit?.planlananYevmiye || 0);
  const daireHarcanan = sumYevmiye(daireUyg);
  const bacaPlan = Number(bacaTespit?.planlananYevmiye || 0);
  const bacaHarcanan = sumYevmiye(bacaUyg);

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-100 rounded-2xl">
            <Droplets className="text-teal-800" size={22} />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-wide">Temizlik / Kırım Tespiti</h1>
            <p className="text-[10px] text-slate-500">Daire ve baca çukurları · yerinde tespit · yevmiye planı · uygulama</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className="bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold px-3 py-2 rounded-xl">{msg}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMainTab('daire');
            setSelectedBacaId(null);
          }}
          className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase border cursor-pointer ${
            mainTab === 'daire' ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
          }`}
        >
          Daire temizlik / kırım
        </button>
        <button
          type="button"
          onClick={() => {
            setMainTab('baca');
            setSelectedDaireId(null);
          }}
          className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase border cursor-pointer ${
            mainTab === 'baca' ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-slate-500 border-slate-200'
          }`}
        >
          Baca çukur
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="space-y-1">
          <span className="text-[8px] font-black uppercase text-slate-400 block">Parsel</span>
          <select
            value={parsel}
            onChange={(e) => {
              setParsel(e.target.value);
              setSelectedDaireId(null);
              setSelectedBacaId(null);
            }}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
          >
            {PARSEL_SECENEK.map((p) => (
              <option key={p} value={p}>
                {p.replace('Parsel Bölge ', '')}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (mainTab === 'daire') {
              openTemizlikRapor(
                buildDaireParselRaporHtml({ parsel, daireler, tespitler, uygulamalar }),
                `${parsel} daire raporu`
              );
            } else {
              openTemizlikRapor(
                buildBacaParselRaporHtml({
                  parsel,
                  bacalar,
                  tespitler: bacaTespitler,
                  uygulamalar: bacaUygulamalar,
                }),
                `${parsel} baca raporu`
              );
            }
          }}
          className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer"
        >
          <Printer size={13} /> Parsel raporu
        </button>
      </div>

      {mainTab === 'daire' && (() => {
        const o = ozetDaireParsel(parsel, daireler, tespitler, uygulamalar);
        return (
          <div className="flex flex-wrap gap-2">
            {ozetKart('Daire', o.adet)}
            {ozetKart('Tespit', o.tespitli)}
            {ozetKart('Tamamlanan', o.tamamlanan)}
            {ozetKart('Plan yevmiye', o.planYevmiye)}
            {ozetKart('Harcanan', o.harcananYevmiye)}
            {ozetKart('Kalan', o.kalanYevmiye)}
          </div>
        );
      })()}
      {mainTab === 'baca' && (() => {
        const o = ozetBacaParsel(parsel, bacalar, bacaTespitler, bacaUygulamalar);
        return (
          <div className="flex flex-wrap gap-2">
            {ozetKart('Baca', o.adet, 'Parselde tespit edilen çukur')}
            {ozetKart('Tespit', o.tespitli)}
            {ozetKart('Tamamlanan', o.tamamlanan)}
            {ozetKart('Plan yevmiye', o.planYevmiye)}
            {ozetKart('Harcanan', o.harcananYevmiye)}
            {ozetKart('Kalan', o.kalanYevmiye)}
          </div>
        );
      })()}

      {mainTab === 'daire' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {bloklar.map((b) => {
                const n = parselDaireler.filter((d) => d.blok === b).length;
                const done = parselDaireler.filter((d) => d.blok === b && daireDurumOf(d) === 'TAMAMLANDI').length;
                const pct = n ? Math.round((done / n) * 100) : 0;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setSelectedBlok(b);
                      setSelectedDaireId(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black border cursor-pointer min-w-[72px] ${
                      selectedBlok === b
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    <span className="block">
                      {b} <span className="opacity-70">{done}/{n}</span>
                    </span>
                    <span
                      className={`mt-1 block h-1 rounded-full overflow-hidden ${
                        selectedBlok === b ? 'bg-white/25' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`block h-full ${selectedBlok === b ? 'bg-white' : 'bg-teal-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-black uppercase text-slate-500">
                {selectedBlok} — daire aç ({blokDaireler.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={yeniDaireNo}
                  onChange={(e) => setYeniDaireNo(e.target.value)}
                  placeholder="Daire no"
                  className="col-span-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold"
                />
                <input
                  value={yeniKat}
                  onChange={(e) => setYeniKat(e.target.value)}
                  placeholder="Kat (ops.)"
                  className="col-span-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDaireAc()}
                  className="bg-teal-700 text-white rounded-xl text-[10px] font-black cursor-pointer disabled:opacity-50"
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    <Plus size={12} /> Aç
                  </span>
                </button>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {blokDaireler.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-4 text-center">Bu blokta henüz daire yok. Numarayı yazıp açın.</p>
                ) : (
                  blokDaireler.map((d) => {
                    const durum = daireDurumOf(d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDaireId(d.id)}
                        className={`w-full text-left border rounded-xl p-2.5 cursor-pointer ${
                          selectedDaireId === d.id
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-slate-100 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-black text-xs text-slate-900">
                            Daire {d.daireNo}
                            {d.kat ? ` · Kat ${d.kat}` : ''}
                          </span>
                          <span className="text-[8px] font-black uppercase text-slate-500">
                            {TEMIZLIK_KART_DURUM_LABEL[durum]}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {selectedDaire && (
            <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[8px] font-black uppercase text-teal-700">
                    {selectedDaire.parsel.replace('Parsel Bölge ', '')} · {selectedDaire.blok}
                  </p>
                  <p className="font-black text-sm">Daire {selectedDaire.daireNo}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void handleDeleteDaire(selectedDaire)}
                    className="p-1.5 text-rose-600 cursor-pointer"
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button type="button" onClick={() => setSelectedDaireId(null)} className="p-1.5 text-slate-400 cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setKartTab('tespit')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    kartTab === 'tespit' ? 'bg-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Tespit
                </button>
                <button
                  type="button"
                  onClick={() => setKartTab('uygulama')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    kartTab === 'uygulama' ? 'bg-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Uygulama
                </button>
              </div>

              {kartTab === 'tespit' && (
                <div className="space-y-3">
                  <select
                    value={isTipi}
                    onChange={(e) => setIsTipi(e.target.value as TemizlikIsTipi)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="TEMIZLIK">Temizlik</option>
                    <option value="KIRIM">Kırım</option>
                    <option value="TEMIZLIK_VE_KIRIM">Temizlik + kırım</option>
                  </select>
                  <div className="flex flex-wrap gap-1">
                    {TEMIZLIK_ODA_CHIPS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => addOda(c)}
                        className="text-[9px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                      >
                        + {c}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      value={customOda}
                      onChange={(e) => setCustomOda(e.target.value)}
                      placeholder="Başka oda adı"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addOda(customOda);
                        setCustomOda('');
                      }}
                      className="text-[10px] font-black px-2 rounded-xl bg-slate-200 cursor-pointer"
                    >
                      Ekle
                    </button>
                  </div>
                  {odalar.map((o, idx) => (
                    <div key={o.id} className="border border-slate-100 rounded-xl p-2.5 space-y-2 bg-slate-50/50">
                      <div className="flex justify-between">
                        <span className="font-black text-xs">{o.ad}</span>
                        <button
                          type="button"
                          onClick={() => setOdalar((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-rose-500 text-[10px] font-bold cursor-pointer"
                        >
                          Kaldır
                        </button>
                      </div>
                      <select
                        value={o.durum}
                        onChange={(e) => {
                          const next = [...odalar];
                          next[idx] = { ...o, durum: e.target.value as TemizlikOdaDurum };
                          setOdalar(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold"
                      >
                        {ODA_DURUM.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={o.yorum || ''}
                        onChange={(e) => {
                          const next = [...odalar];
                          next[idx] = { ...o, yorum: e.target.value };
                          setOdalar(next);
                        }}
                        placeholder="Oda yorumu"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px]"
                      />
                      <FotoAlani
                        urls={o.fotoUrls || []}
                        onChange={(fotoUrls) => {
                          const next = [...odalar];
                          next[idx] = { ...o, fotoUrls };
                          setOdalar(next);
                        }}
                      />
                    </div>
                  ))}
                  <textarea
                    value={genelYorum}
                    onChange={(e) => setGenelYorum(e.target.value)}
                    placeholder="Daire geneli yorum"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[8px] font-black uppercase text-slate-400">Plan yevmiye</span>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={planYevmiye}
                        onChange={(e) => setPlanYevmiye(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      />
                    </label>
                  </div>
                  <textarea
                    value={planNotu}
                    onChange={(e) => setPlanNotu(e.target.value)}
                    placeholder="Nasıl planlanacak? (ekip, sıra, kırım+temizlik…)"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveDaireTespit()}
                    className="w-full bg-teal-700 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Tespiti kaydet'}
                  </button>
                </div>
              )}

              {kartTab === 'uygulama' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500">
                    Plan {dairePlan} yevmiye · Harcanan {daireHarcanan} · Kalan {Math.max(0, dairePlan - daireHarcanan)}
                  </p>
                  <input
                    type="date"
                    value={uygTarih}
                    onChange={(e) => setUygTarih(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={uygYevmiye}
                      onChange={(e) => setUygYevmiye(e.target.value)}
                      placeholder="Harcanan yevmiye"
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                    <select
                      value={uygDurum}
                      onChange={(e) => setUygDurum(e.target.value as TemizlikUygulamaDurum)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold"
                    >
                      <option value="DEVAM">Devam</option>
                      <option value="EKSIK">Eksik kaldı</option>
                      <option value="TAMAMLANDI">Tamamlandı</option>
                    </select>
                  </div>
                  <textarea
                    value={uygAciklama}
                    onChange={(e) => setUygAciklama(e.target.value)}
                    placeholder="Yapılan iş"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <FotoAlani urls={uygFotolar} onChange={setUygFotolar} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveDaireUygulama()}
                    className="w-full bg-slate-900 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Uygulamayı kaydet'}
                  </button>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {daireUyg.map((u) => (
                      <div key={u.id} className="text-[10px] border border-slate-100 rounded-lg p-2 bg-slate-50">
                        {u.tarih} · {u.harcananYevmiye} yevmiye · {u.durum}
                        {u.aciklama ? ` — ${u.aciklama}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mainTab === 'baca' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
              <MapPin size={12} /> Parselde baca tespit et
            </p>
            <textarea
              value={yeniBacaYer}
              onChange={(e) => setYeniBacaYer(e.target.value)}
              placeholder="Yer tarifi — örn. C3 kuzey cephe, merdiven dibi"
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
            />
            <select
              value={yeniBacaBlok}
              onChange={(e) => setYeniBacaBlok(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
            >
              <option value="">Yakın blok (isteğe bağlı)</option>
              {bloklar.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleBacaAc()}
              className="w-full bg-amber-700 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
            >
              <span className="inline-flex items-center justify-center gap-1">
                <Plus size={13} /> Baca tespit et
              </span>
            </button>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {parselBacalar.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-4 text-center">
                  Bu parselde henüz baca yok. Dolaşıp yer tarifini yazın.
                </p>
              ) : (
                parselBacalar.map((b) => {
                  const durum = bacaDurumOf(b);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBacaId(b.id)}
                      className={`w-full text-left border rounded-xl p-2.5 cursor-pointer ${
                        selectedBacaId === b.id ? 'border-amber-500 bg-amber-50' : 'border-slate-100 bg-slate-50/70'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-black text-xs text-slate-900">
                          {b.etiket}
                          {b.blok ? ` · ${b.blok}` : ''}
                        </span>
                        <span className="text-[8px] font-black uppercase text-slate-500">
                          {TEMIZLIK_KART_DURUM_LABEL[durum]}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">{b.yerTarifi}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selectedBaca && (
            <div className="bg-white border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[8px] font-black uppercase text-amber-700">{selectedBaca.etiket}</p>
                  <p className="font-bold text-xs text-slate-800">{selectedBaca.yerTarifi}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => void handleDeleteBaca(selectedBaca)} className="p-1.5 text-rose-600 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                  <button type="button" onClick={() => setSelectedBacaId(null)} className="p-1.5 text-slate-400 cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setKartTab('tespit')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    kartTab === 'tespit' ? 'bg-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Tespit
                </button>
                <button
                  type="button"
                  onClick={() => setKartTab('uygulama')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    kartTab === 'uygulama' ? 'bg-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Uygulama
                </button>
              </div>

              {kartTab === 'tespit' && (
                <div className="space-y-3">
                  <select
                    value={bacaKirlilik}
                    onChange={(e) => setBacaKirlilik(e.target.value as TemizlikBacaKirlilik)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    {BACA_KIRLILIK.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <FotoAlani urls={bacaFotolar} onChange={setBacaFotolar} max={6} />
                  <textarea
                    value={bacaYorum}
                    onChange={(e) => setBacaYorum(e.target.value)}
                    placeholder="İşçilik / kirlilik yorumu"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={bacaPlanYevmiye}
                    onChange={(e) => setBacaPlanYevmiye(e.target.value)}
                    placeholder="Plan yevmiye"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                  <textarea
                    value={bacaPlanNotu}
                    onChange={(e) => setBacaPlanNotu(e.target.value)}
                    placeholder="Parsel baca temizlik plan notu"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveBacaTespit()}
                    className="w-full bg-amber-700 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Baca tespitini kaydet'}
                  </button>
                </div>
              )}

              {kartTab === 'uygulama' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500">
                    Plan {bacaPlan} yevmiye · Harcanan {bacaHarcanan} · Kalan {Math.max(0, bacaPlan - bacaHarcanan)}
                  </p>
                  <input
                    type="date"
                    value={uygTarih}
                    onChange={(e) => setUygTarih(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={uygYevmiye}
                      onChange={(e) => setUygYevmiye(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                    <select
                      value={uygDurum}
                      onChange={(e) => setUygDurum(e.target.value as TemizlikUygulamaDurum)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold"
                    >
                      <option value="DEVAM">Devam</option>
                      <option value="EKSIK">Eksik kaldı</option>
                      <option value="TAMAMLANDI">Tamamlandı</option>
                    </select>
                  </div>
                  <textarea
                    value={uygAciklama}
                    onChange={(e) => setUygAciklama(e.target.value)}
                    placeholder="Yapılan iş"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <FotoAlani urls={uygFotolar} onChange={setUygFotolar} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveBacaUygulama()}
                    className="w-full bg-slate-900 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Uygulamayı kaydet'}
                  </button>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {bacaUyg.map((u) => (
                      <div key={u.id} className="text-[10px] border border-slate-100 rounded-lg p-2 bg-slate-50">
                        {u.tarih} · {u.harcananYevmiye} yevmiye · {u.durum}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
