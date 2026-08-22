import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Layers,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import { PARSEL_LIST } from '../data/parselBlokMap';
import { db, cleanUndefined, removeDocument, saveDocument } from '../lib/firebase';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { todayDateKey } from '../lib/dateKeyUtils';
import { uploadTemizlikKirimFoto, uploadTemizlikKirimFotolar } from '../lib/temizlikKirimFotoStorage';
import { blokKartId } from '../lib/temizlikLayoutCards';
import {
  TEMIZLIK_DEFAULT_PARSEL,
  TEMIZLIK_KART_DURUM_LABEL,
  deriveKartDurum,
  latestByDate,
  newTemizlikId,
  ozetBacaParsel,
  ozetDaireBlok,
  ozetDaireParsel,
  parselKisaAd,
  sortBacalar,
  sumYevmiye,
} from '../lib/temizlikKirimUtils';
import {
  buildBacaTemizlikTutanakHtml,
  buildDaireTemizlikTutanakHtml,
  buildParselTopluTutanakHtml,
  openTemizlikRapor,
} from '../lib/temizlikKirimReport';
import type {
  TemizlikBaca,
  TemizlikBacaTespit,
  TemizlikBacaUygulama,
  TemizlikBlokKart,
  TemizlikDaire,
  TemizlikTespit,
  TemizlikTutanak,
  TemizlikUygulama,
} from '../types/erp';

const PARSEL_SECENEK = PARSEL_LIST.filter((p) => p !== 'GENEL SAHA');

type Props = { currentUser?: { email?: string; ad?: string; soyad?: string; displayName?: string } | null };
type Mod = 'daire' | 'baca';

async function persistFotos(
  kind: 'daire' | 'baca',
  entityId: string,
  asama: string,
  urls: string[]
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (!u) continue;
    if (/^https?:\/\//i.test(u)) {
      out.push(u);
      continue;
    }
    const uploaded = await uploadTemizlikKirimFoto(kind, entityId, `${asama}_${i}`, u);
    if (/^https?:\/\//i.test(uploaded)) out.push(uploaded);
  }
  return out;
}

function readFileList(files: FileList | File[] | null, max: number, existing: string[]): Promise<string[]> {
  const raw = files ? Array.from(files as ArrayLike<File>) : [];
  const list = raw
    .filter((f) => f && (String(f.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name || '')))
    .slice(0, Math.max(0, max - existing.length));
  return Promise.all(
    list.map(
      (file) =>
        new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => {
            try {
              resolve(URL.createObjectURL(file));
            } catch {
              resolve('');
            }
          };
          r.readAsDataURL(file);
        })
    )
  ).then((rows) => [...existing, ...rows.filter(Boolean)].slice(0, max));
}

function userLabel(u?: Props['currentUser']): string {
  if (!u) return '';
  const n = `${u.ad || ''} ${u.soyad || ''}`.trim() || u.displayName || '';
  return n || String(u.email || '').split('@')[0] || '';
}

function durumClass(durum: string): string {
  if (durum === 'TAMAMLANDI') return 'bg-emerald-100 text-emerald-800';
  if (durum === 'UYGULAMA_DEVAM') return 'bg-sky-100 text-sky-800';
  if (durum === 'PLANLANDI') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-600';
}

export const ParselTemizlikTespitScreen: React.FC<Props> = ({ currentUser }) => {
  const kaydeden = currentUser?.email || 'erp';
  const [parsel, setParsel] = useState(TEMIZLIK_DEFAULT_PARSEL);
  const [mod, setMod] = useState<Mod>('daire');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; k: 'ok' | 'err' } | null>(null);

  const [daireler, setDaireler] = useState<TemizlikDaire[]>([]);
  const [tespitler, setTespitler] = useState<TemizlikTespit[]>([]);
  const [uygulamalar, setUygulamalar] = useState<TemizlikUygulama[]>([]);
  const [bacalar, setBacalar] = useState<TemizlikBaca[]>([]);
  const [bacaTespitler, setBacaTespitler] = useState<TemizlikBacaTespit[]>([]);
  const [bacaUygulamalar, setBacaUygulamalar] = useState<TemizlikBacaUygulama[]>([]);
  const [blokKartlar, setBlokKartlar] = useState<TemizlikBlokKart[]>([]);
  const [tutanaklar, setTutanaklar] = useState<TemizlikTutanak[]>([]);

  const [seciliBloklar, setSeciliBloklar] = useState<string[]>([]);
  const [seciliBacaIds, setSeciliBacaIds] = useState<string[]>([]);
  const [aktifBlok, setAktifBlok] = useState('');
  const [yeniBlok, setYeniBlok] = useState('');
  const [yeniDaireNo, setYeniDaireNo] = useState('');
  const [blokAdDuzenle, setBlokAdDuzenle] = useState('');
  const [daireNoDuzenle, setDaireNoDuzenle] = useState('');
  const [aktifDaireId, setAktifDaireId] = useState<string | null>(null);
  const [aktifBacaId, setAktifBacaId] = useState<string | null>(null);
  const [fotolar, setFotolar] = useState<string[]>([]);
  const [yorum, setYorum] = useState('');

  const [tarih, setTarih] = useState(todayDateKey());
  const [hazirlayan, setHazirlayan] = useState(userLabel(currentUser));
  const [parselSefi, setParselSefi] = useState('');
  const [projeMuduru, setProjeMuduru] = useState('');
  const [tutanakNot, setTutanakNot] = useState('');
  const [topluFotolar, setTopluFotolar] = useState<string[]>([]);

  useEffect(() => {
    setBlokAdDuzenle(aktifBlok);
  }, [aktifBlok]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'temizlikDaireleri'), (s) =>
        setDaireler(s.docs.map((d) => d.data() as TemizlikDaire))
      ),
      onSnapshot(collection(db, 'temizlikTespitleri'), (s) =>
        setTespitler(s.docs.map((d) => d.data() as TemizlikTespit))
      ),
      onSnapshot(collection(db, 'temizlikUygulamalari'), (s) =>
        setUygulamalar(s.docs.map((d) => d.data() as TemizlikUygulama))
      ),
      onSnapshot(collection(db, 'temizlikBacalar'), (s) =>
        setBacalar(s.docs.map((d) => d.data() as TemizlikBaca))
      ),
      onSnapshot(collection(db, 'temizlikBacaTespitleri'), (s) =>
        setBacaTespitler(s.docs.map((d) => d.data() as TemizlikBacaTespit))
      ),
      onSnapshot(collection(db, 'temizlikBacaUygulamalari'), (s) =>
        setBacaUygulamalar(s.docs.map((d) => d.data() as TemizlikBacaUygulama))
      ),
      onSnapshot(collection(db, 'temizlikBlokKartlari'), (s) =>
        setBlokKartlar(s.docs.map((d) => d.data() as TemizlikBlokKart))
      ),
      onSnapshot(collection(db, 'temizlikTutanaklari'), (s) =>
        setTutanaklar(s.docs.map((d) => d.data() as TemizlikTutanak))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const show = (t: string, k: 'ok' | 'err' = 'ok') => setMsg({ t, k });

  const ingestToplu = (files: FileList | File[] | null) => {
    const copied = files ? Array.from(files as ArrayLike<File>) : [];
    if (!copied.length) {
      show('Dosya seçilmedi. “Dosya seç” ile galeriden işaretleyin.', 'err');
      return;
    }
    void readFileList(copied, 16, topluFotolar).then((next) => {
      setTopluFotolar(next);
      show(`${next.length} fotoğraf eklendi. Şimdi turuncu tutanak tuşuna basın.`);
    });
  };

  const guard = async () => {
    const block = await assertErpWriteAuth();
    if (block) {
      show(block, 'err');
      return false;
    }
    return true;
  };

  const imza = () => ({ hazirlayan: hazirlayan.trim(), parselSefi: parselSefi.trim(), projeMuduru: projeMuduru.trim() });

  const parselDaireler = useMemo(
    () => daireler.filter((d) => d.parsel === parsel),
    [daireler, parsel]
  );
  const parselBacalar = useMemo(
    () => sortBacalar(bacalar.filter((b) => b.parsel === parsel)),
    [bacalar, parsel]
  );

  const blokAdlari = useMemo(() => {
    const fromKart = blokKartlar.filter((b) => b.parsel === parsel).map((b) => b.blok);
    const fromDaire = parselDaireler.map((d) => d.blok);
    return Array.from(new Set([...fromKart, ...fromDaire].filter((b) => b && b !== 'GENEL SAHA'))).sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true })
    );
  }, [blokKartlar, parsel, parselDaireler]);

  const blokOzetler = blokAdlari.map((blok) => ozetDaireBlok(parsel, blok, daireler, tespitler, uygulamalar));
  const parselOzet = ozetDaireParsel(parsel, daireler, tespitler, uygulamalar);
  const bacaOzet = ozetBacaParsel(parsel, bacalar, bacaTespitler, bacaUygulamalar);

  const aktifDaire = parselDaireler.find((d) => d.id === aktifDaireId) || null;
  const aktifBaca = parselBacalar.find((b) => b.id === aktifBacaId) || null;
  const blokDaireler = parselDaireler
    .filter((d) => d.blok === aktifBlok)
    .sort((a, b) => a.daireNo.localeCompare(b.daireNo, 'tr', { numeric: true }));

  useEffect(() => {
    setDaireNoDuzenle(aktifDaire?.daireNo || '');
  }, [aktifDaire?.id, aktifDaire?.daireNo]);

  const daireDurum = (d: TemizlikDaire) => {
    const t = latestByDate<TemizlikTespit>(tespitler.filter((x) => x.daireId === d.id));
    const u = uygulamalar.filter((x) => x.daireId === d.id);
    return deriveKartDurum({
      hasTespit: !!t,
      planlananYevmiye: Number(t?.planlananYevmiye || 0),
      harcananYevmiye: sumYevmiye(u),
      uygulamalar: u,
    });
  };

  const bacaDurum = (b: TemizlikBaca) => {
    const t = latestByDate<TemizlikBacaTespit>(bacaTespitler.filter((x) => x.bacaId === b.id));
    const u = bacaUygulamalar.filter((x) => x.bacaId === b.id);
    return deriveKartDurum({
      hasTespit: !!t,
      planlananYevmiye: Number(t?.planlananYevmiye || 0),
      harcananYevmiye: sumYevmiye(u),
      uygulamalar: u,
    });
  };

  const toggleBlok = (blok: string) => {
    setSeciliBloklar((prev) => (prev.includes(blok) ? prev.filter((x) => x !== blok) : [...prev, blok]));
  };
  const toggleBaca = (id: string) => {
    setSeciliBacaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBlokAc = async () => {
    const ad = yeniBlok.trim().toLocaleUpperCase('tr-TR');
    if (!ad) return show('Blok adı yazın.', 'err');
    if (blokAdlari.some((b) => b.toLocaleUpperCase('tr-TR') === ad)) {
      setAktifBlok(ad);
      setYeniBlok('');
      return show(`${ad} zaten açık.`);
    }
    if (!(await guard())) return;
    try {
      await saveDocument(
        'temizlikBlokKartlari',
        cleanUndefined({
          id: blokKartId(parsel, ad),
          parsel,
          blok: ad,
          kayitTarihi: new Date().toISOString(),
        })
      );
      setAktifBlok(ad);
      setSeciliBloklar((p) => (p.includes(ad) ? p : [...p, ad]));
      setYeniBlok('');
      show(`${ad} blok kartı açıldı.`);
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Blok açılamadı.'), 'err');
    }
  };

  const handleBlokAdGuncelle = async () => {
    if (!aktifBlok) return show('Önce bloğa girin.', 'err');
    const ad = blokAdDuzenle.trim().toLocaleUpperCase('tr-TR');
    if (!ad) return show('Yeni blok adı yazın.', 'err');
    if (ad === aktifBlok.toLocaleUpperCase('tr-TR')) return show('Blok adı aynı.');
    if (blokAdlari.some((b) => b.toLocaleUpperCase('tr-TR') === ad)) {
      return show(`${ad} zaten var — birleştirme yok, başka ad seçin.`, 'err');
    }
    if (!(await guard())) return;
    setBusy(true);
    try {
      const oldKart = blokKartlar.find(
        (k) => k.parsel === parsel && k.blok.toLocaleUpperCase('tr-TR') === aktifBlok.toLocaleUpperCase('tr-TR')
      );
      await saveDocument(
        'temizlikBlokKartlari',
        cleanUndefined({
          id: blokKartId(parsel, ad),
          parsel,
          blok: ad,
          kayitTarihi: oldKart?.kayitTarihi || new Date().toISOString(),
        })
      );
      if (oldKart && oldKart.id !== blokKartId(parsel, ad)) {
        await removeDocument('temizlikBlokKartlari', oldKart.id);
      }
      const daireHits = daireler.filter((d) => d.parsel === parsel && d.blok === aktifBlok);
      for (const d of daireHits) {
        await saveDocument('temizlikDaireleri', cleanUndefined({ ...d, blok: ad, guncellemeTarihi: new Date().toISOString() }));
      }
      for (const t of tespitler.filter((x) => x.parsel === parsel && x.blok === aktifBlok)) {
        await saveDocument('temizlikTespitleri', cleanUndefined({ ...t, blok: ad }));
      }
      for (const u of uygulamalar.filter((x) => x.parsel === parsel && x.blok === aktifBlok)) {
        await saveDocument('temizlikUygulamalari', cleanUndefined({ ...u, blok: ad }));
      }
      setSeciliBloklar((p) => p.map((b) => (b === aktifBlok ? ad : b)));
      setAktifBlok(ad);
      setBlokAdDuzenle(ad);
      show(`Blok adı ${ad} olarak güncellendi.`);
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Blok adı değiştirilemedi.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDaireNoGuncelle = async () => {
    if (!aktifDaire) return;
    const no = daireNoDuzenle.trim();
    if (!no) return show('Daire no yazın.', 'err');
    if (no === aktifDaire.daireNo) return show('Daire no aynı.');
    if (blokDaireler.some((d) => d.id !== aktifDaire.id && d.daireNo === no)) {
      return show('Bu daire no bu blokta zaten var.', 'err');
    }
    if (!(await guard())) return;
    setBusy(true);
    try {
      await saveDocument(
        'temizlikDaireleri',
        cleanUndefined({ ...aktifDaire, daireNo: no, guncellemeTarihi: new Date().toISOString() })
      );
      for (const t of tespitler.filter((x) => x.daireId === aktifDaire.id)) {
        await saveDocument('temizlikTespitleri', cleanUndefined({ ...t, daireNo: no }));
      }
      for (const u of uygulamalar.filter((x) => x.daireId === aktifDaire.id)) {
        await saveDocument('temizlikUygulamalari', cleanUndefined({ ...u, daireNo: no }));
      }
      show(`Daire no ${no} olarak güncellendi.`);
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Daire no değiştirilemedi.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDaireAc = async () => {
    if (!aktifBlok) return show('Önce bloğa girin.', 'err');
    const no = yeniDaireNo.trim();
    if (!no) return show('Daire no yazın.', 'err');
    const exists = blokDaireler.some((d) => d.daireNo === no);
    if (exists) return show('Bu daire zaten açık.', 'err');
    if (!(await guard())) return;
    const row: TemizlikDaire = {
      id: newTemizlikId('td'),
      parsel,
      blok: aktifBlok,
      daireNo: no,
      ozetDurum: 'TESPIT_BEKLIYOR',
      kayitTarihi: new Date().toISOString(),
      kaydeden,
    };
    try {
      await saveDocument('temizlikDaireleri', cleanUndefined(row));
      setYeniDaireNo('');
      setAktifDaireId(row.id);
      show(`Daire ${no} açıldı.`);
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Daire açılamadı.'), 'err');
    }
  };

  const handleDaireTespitKaydet = async (tamamla: boolean) => {
    if (!aktifDaire) return;
    const prev = latestByDate<TemizlikTespit>(tespitler.filter((x) => x.daireId === aktifDaire.id));
    if (!prev && fotolar.length === 0 && !yorum.trim()) return show('Fotoğraf veya açıklama girin.', 'err');
    if (!(await guard())) return;
    setBusy(true);
    try {
      const urls = await persistFotos('daire', aktifDaire.id, 'tutanak', fotolar);
      const t: TemizlikTespit = {
        id: prev?.id || newTemizlikId('tt'),
        daireId: aktifDaire.id,
        parsel,
        blok: aktifDaire.blok,
        daireNo: aktifDaire.daireNo,
        isTipi: prev?.isTipi || 'TEMIZLIK',
        odalar: prev?.odalar || [],
        fotoUrls: urls,
        genelYorum: yorum.trim() || prev?.genelYorum,
        planlananYevmiye: Number(prev?.planlananYevmiye || 1),
        tarih: todayDateKey(),
        kaydeden,
      };
      await saveDocument('temizlikTespitleri', cleanUndefined(t));
      const uList = uygulamalar.filter((x) => x.daireId === aktifDaire.id);
      if (tamamla && !uList.some((u) => u.durum === 'TAMAMLANDI')) {
        await saveDocument(
          'temizlikUygulamalari',
          cleanUndefined({
            id: newTemizlikId('tu'),
            daireId: aktifDaire.id,
            tespitId: t.id,
            parsel,
            blok: aktifDaire.blok,
            daireNo: aktifDaire.daireNo,
            tarih: todayDateKey(),
            harcananYevmiye: t.planlananYevmiye || 1,
            durum: 'TAMAMLANDI',
            aciklama: yorum.trim() || 'Temizlik tamamlandı',
            fotoUrls: urls,
            kaydeden,
          } satisfies TemizlikUygulama)
        );
      }
      await saveDocument(
        'temizlikDaireleri',
        cleanUndefined({
          ...aktifDaire,
          ozetDurum: tamamla ? 'TAMAMLANDI' : 'PLANLANDI',
          guncellemeTarihi: new Date().toISOString(),
        })
      );
      setFotolar(urls);
      show(tamamla ? 'Tespit kaydedildi ve temizlendi işaretlendi.' : prev ? 'Tespit güncellendi.' : 'Tespit kaydedildi.');
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Tespit yazılamadı.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleBacaTespitKaydet = async (tamamla: boolean) => {
    if (!aktifBaca) return;
    const prev = latestByDate<TemizlikBacaTespit>(bacaTespitler.filter((x) => x.bacaId === aktifBaca.id));
    if (!prev && fotolar.length === 0 && !yorum.trim()) return show('Fotoğraf veya açıklama girin.', 'err');
    if (!(await guard())) return;
    setBusy(true);
    try {
      const urls = await persistFotos('baca', aktifBaca.id, 'tutanak', fotolar);
      const t: TemizlikBacaTespit = {
        id: prev?.id || newTemizlikId('btt'),
        bacaId: aktifBaca.id,
        parsel,
        blok: aktifBaca.blok,
        etiket: aktifBaca.etiket,
        fotoUrls: urls,
        kirlilikDurumu: prev?.kirlilikDurumu || 'KIRLI',
        iscilikYorumu: yorum.trim() || prev?.iscilikYorumu,
        planlananYevmiye: Number(prev?.planlananYevmiye || 1),
        tarih: todayDateKey(),
        kaydeden,
      };
      await saveDocument('temizlikBacaTespitleri', cleanUndefined(t));
      if (tamamla) {
        await saveDocument(
          'temizlikBacaUygulamalari',
          cleanUndefined({
            id: newTemizlikId('btu'),
            bacaId: aktifBaca.id,
            tespitId: t.id,
            parsel,
            etiket: aktifBaca.etiket,
            tarih: todayDateKey(),
            harcananYevmiye: t.planlananYevmiye || 1,
            durum: 'TAMAMLANDI',
            aciklama: yorum.trim() || 'Baca temizliği tamamlandı',
            fotoUrls: urls,
            kaydeden,
          } satisfies TemizlikBacaUygulama)
        );
      }
      await saveDocument(
        'temizlikBacalar',
        cleanUndefined({
          ...aktifBaca,
          ozetDurum: tamamla ? 'TAMAMLANDI' : 'PLANLANDI',
          guncellemeTarihi: new Date().toISOString(),
        })
      );
      setFotolar(urls);
      show(tamamla ? 'Baca tespit + temizlik kaydedildi.' : prev ? 'Baca tespiti güncellendi.' : 'Baca tespit kaydedildi.');
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Baca tespiti yazılamadı.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDaireTespitSil = async () => {
    if (!aktifDaire) return;
    const rows = tespitler.filter((x) => x.daireId === aktifDaire.id);
    if (rows.length === 0) return show('Silinecek tespit yok.', 'err');
    if (!window.confirm(`${aktifDaire.blok} daire ${aktifDaire.daireNo} tespiti silinsin mi?`)) return;
    if (!(await guard())) return;
    setBusy(true);
    try {
      for (const t of rows) await removeDocument('temizlikTespitleri', t.id);
      await saveDocument(
        'temizlikDaireleri',
        cleanUndefined({
          ...aktifDaire,
          ozetDurum: 'TESPIT_BEKLIYOR',
          guncellemeTarihi: new Date().toISOString(),
        })
      );
      setFotolar([]);
      setYorum('');
      show('Tespit silindi.');
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Tespit silinemedi.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDaireKartSil = async () => {
    if (!aktifDaire) return;
    if (!window.confirm(`Daire ${aktifDaire.daireNo} kartı, tespiti ve uygulaması silinsin mi?`)) return;
    if (!(await guard())) return;
    setBusy(true);
    try {
      for (const t of tespitler.filter((x) => x.daireId === aktifDaire.id)) {
        await removeDocument('temizlikTespitleri', t.id);
      }
      for (const u of uygulamalar.filter((x) => x.daireId === aktifDaire.id)) {
        await removeDocument('temizlikUygulamalari', u.id);
      }
      await removeDocument('temizlikDaireleri', aktifDaire.id);
      setAktifDaireId(null);
      setFotolar([]);
      setYorum('');
      show('Daire kartı silindi.');
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Daire silinemedi.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleBacaTespitSil = async () => {
    if (!aktifBaca) return;
    const rows = bacaTespitler.filter((x) => x.bacaId === aktifBaca.id);
    if (rows.length === 0) return show('Silinecek baca tespiti yok.', 'err');
    if (!window.confirm(`${aktifBaca.etiket} tespiti silinsin mi?`)) return;
    if (!(await guard())) return;
    setBusy(true);
    try {
      for (const t of rows) await removeDocument('temizlikBacaTespitleri', t.id);
      await saveDocument(
        'temizlikBacalar',
        cleanUndefined({
          ...aktifBaca,
          ozetDurum: 'TESPIT_BEKLIYOR',
          guncellemeTarihi: new Date().toISOString(),
        })
      );
      setFotolar([]);
      setYorum('');
      show('Baca tespiti silindi.');
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Baca tespiti silinemedi.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleTutanakSil = async (row: TemizlikTutanak) => {
    if (!window.confirm(`${row.tarih} tutanağı arşivden silinsin mi?`)) return;
    if (!(await guard())) return;
    try {
      await removeDocument('temizlikTutanaklari', row.id);
      show('Tutanak arşivden silindi.');
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Tutanak silinemedi.'), 'err');
    }
  };

  const arsivleVeYazdir = async (
    html: string,
    title: string,
    tip: TemizlikTutanak['tip'],
    kapsam: string[],
    ozetSatir: string,
    fotoUrls?: string[],
    yazdir = true
  ) => {
    if (yazdir) openTemizlikRapor(html, title);
    if (!(await guard())) return;
    const row: TemizlikTutanak = {
      id: newTemizlikId('ptt'),
      tip,
      parsel,
      kapsam,
      tarih,
      durum: 'IMZA_BEKLIYOR',
      imzalar: imza(),
      not: tutanakNot.trim() || undefined,
      ozetSatir,
      kaydeden,
      kayitTarihi: new Date().toISOString(),
      fotoUrls: fotoUrls?.filter((u) => /^https?:\/\//i.test(u)).slice(0, 16),
    };
    try {
      await saveDocument('temizlikTutanaklari', cleanUndefined(row));
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Tutanak arşive yazılamadı; yazdırma açıldı.'), 'err');
    }
  };

  const handleDaireTutanak = async (tumTespitli: boolean) => {
    const bloklar = tumTespitli
      ? blokOzetler.filter((b) => b.tespitli > 0 || b.tamamlanan > 0).map((b) => b.blok)
      : seciliBloklar;
    if (!bloklar.length) return show('Tutanak için en az bir tespitli blok seçin / olsun.', 'err');
    const html = buildDaireTemizlikTutanakHtml({
      parsel,
      bloklar,
      daireler,
      tespitler,
      uygulamalar,
      tarih,
      not: tutanakNot,
      imza: imza(),
      yalnizIslenen: true,
    });
    await arsivleVeYazdir(
      html,
      `${parsel} daire temizlik tutanağı`,
      'DAIRE_BLOK',
      bloklar,
      `${bloklar.length} blok · ${parselKisaAd(parsel)}`
    );
    show(`${bloklar.length} blok tutanağı hazırlandı.`);
  };

  const handleBacaTutanak = async (tumTespitli: boolean) => {
    const ids = tumTespitli
      ? parselBacalar.filter((b) => bacaDurum(b) !== 'TESPIT_BEKLIYOR').map((b) => b.id)
      : seciliBacaIds;
    if (!ids.length) return show('Tutanak için tespitli baca seçin.', 'err');
    const html = buildBacaTemizlikTutanakHtml({
      parsel,
      bacaIds: ids,
      bacalar,
      tespitler: bacaTespitler,
      uygulamalar: bacaUygulamalar,
      tarih,
      not: tutanakNot,
      imza: imza(),
      yalnizIslenen: true,
    });
    await arsivleVeYazdir(
      html,
      `${parsel} baca temizlik tutanağı`,
      'BACA_ALTYAPI',
      ids,
      `${ids.length} baca · ${parselKisaAd(parsel)}`
    );
    show(`${ids.length} baca tutanağı hazırlandı.`);
  };

  const parselTopluMetin = (konu: 'BACA' | 'DAIRE') => {
    const kisa = parselKisaAd(parsel);
    if (tutanakNot.trim()) return tutanakNot.trim();
    if (konu === 'BACA') {
      return `${parsel} (${kisa}) kapsamında altyapı baca (çukur) temizlik işleri ile çevre düzenleme işleri parsel geneli tamamlanmıştır. Saha kontrolünde baca ağızları açılmış/temizlenmiş, avlu ve blok çevreleri tesviye ve zemin hazırlığı yapılmış olarak görülmüştür. İş bitimi bu tutanak ve ekli fotoğraflarla belgelenmiştir. Bacalar tek tek kart açılmadan parsel bütününde teslim edilmiştir.`;
    }
    return `${parsel} (${kisa}) kapsamında daire / blok temizlik işleri parsel geneli tamamlanmıştır. Saha kontrol fotoğrafları ekte olup iş bitimi bu tutanakla belgelenmiştir.`;
  };

  const handleParselTopluTutanak = async (konu: 'BACA' | 'DAIRE') => {
    if (topluFotolar.length === 0) {
      return show('Fotoğraf kutuda görünmüyor. “Dosya seç” ile yükleyin; önizleme çıkınca turuncu tuşa basın.', 'err');
    }
    const raporPencere = window.open('', '_blank');
    if (raporPencere) {
      raporPencere.document.write('<p style="font-family:sans-serif;padding:24px">Tutanak hazırlanıyor…</p>');
    }
    setBusy(true);
    try {
      const metin = parselTopluMetin(konu);
      const html = buildParselTopluTutanakHtml({
        parsel,
        konu,
        tarih,
        metin,
        fotoUrls: topluFotolar,
        imza: imza(),
      });
      openTemizlikRapor(html, `${parsel} parsel geneli ${konu === 'BACA' ? 'baca' : 'daire'} tutanağı`, raporPencere);
      show('Tutanak yeni pencerede açıldı — yazdırın / PDF kaydedin.');
      if (await guard()) {
        const entityId = `parsel_${parsel.replace(/\W+/g, '_').toLowerCase()}`;
        const uploaded = await uploadTemizlikKirimFotolar(
          'baca',
          entityId,
          konu === 'BACA' ? 'parsel_baca' : 'parsel_daire',
          topluFotolar
        );
        await arsivleVeYazdir(
          html,
          `${parsel} parsel geneli ${konu === 'BACA' ? 'baca' : 'daire'} tutanağı`,
          konu === 'BACA' ? 'PARSEL_BACA_TOPLU' : 'PARSEL_DAIRE_TOPLU',
          ['PARSEL_GENELI'],
          `${parselKisaAd(parsel)} · ${topluFotolar.length} foto · parsel geneli tamam`,
          uploaded,
          false
        );
      }
    } catch (e: unknown) {
      show(formatFirestoreWriteError(e, 'Toplu tutanak açılamadı.'), 'err');
    } finally {
      setBusy(false);
    }
  };

  const arsiv = tutanaklar
    .filter((t) => t.parsel === parsel)
    .sort((a, b) => String(b.kayitTarihi).localeCompare(String(a.kayitTarihi)))
    .slice(0, 12);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 uppercase tracking-wide">Parsel Temizlik Tespit</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Üç parsel · toplu fotoğraf ile parsel geneli tutanak · veya daire/baca kartı · imza: Hazırlayan / Kontrol eden / Onaylayan
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMod('daire')}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border cursor-pointer ${
              mod === 'daire' ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            Daire / blok tutanağı
          </button>
          <button
            type="button"
            onClick={() => setMod('baca')}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border cursor-pointer ${
              mod === 'baca' ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            Altyapı baca tutanağı
          </button>
        </div>
      </div>

      {msg ? (
        <p className={`text-[11px] font-bold px-3 py-2 rounded-xl ${msg.k === 'err' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {msg.t}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PARSEL_SECENEK.map((p) => {
          const d = ozetDaireParsel(p, daireler, tespitler, uygulamalar);
          const b = ozetBacaParsel(p, bacalar, bacaTespitler, bacaUygulamalar);
          const on = parsel === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setParsel(p);
                setAktifBlok('');
                setAktifDaireId(null);
                setAktifBacaId(null);
                setSeciliBloklar([]);
                setSeciliBacaIds([]);
                setTopluFotolar([]);
              }}
              className={`text-left rounded-2xl border p-3 cursor-pointer ${
                on ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'
              }`}
            >
              <p className="text-sm font-black text-slate-900">{parselKisaAd(p)}</p>
              <p className="text-[10px] text-slate-500 mt-1">
                {d.tespitli}/{d.adet} daire tespit · {d.tamamlanan} temiz · {b.tespitli}/{b.adet} baca
              </p>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-[10px] font-black uppercase text-slate-400">
          Tutanak tarihi
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-800"
          />
        </label>
        <label className="text-[10px] font-black uppercase text-slate-400">
          Hazırlayan
          <input
            value={hazirlayan}
            onChange={(e) => setHazirlayan(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold"
          />
        </label>
        <label className="text-[10px] font-black uppercase text-slate-400">
          Kontrol eden
          <input
            value={parselSefi}
            onChange={(e) => setParselSefi(e.target.value)}
            placeholder="İsim"
            className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold"
          />
        </label>
        <label className="text-[10px] font-black uppercase text-slate-400">
          Onaylayan
          <input
            value={projeMuduru}
            onChange={(e) => setProjeMuduru(e.target.value)}
            placeholder="İsim"
            className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold"
          />
        </label>
        <label className="md:col-span-4 text-[10px] font-black uppercase text-slate-400">
          Tutanak notu
          <textarea
            value={tutanakNot}
            onChange={(e) => setTutanakNot(e.target.value)}
            rows={2}
            placeholder="Boş bırakırsanız parsel geneli iş bitim yazısı otomatik gelir…"
            className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold"
          />
        </label>
      </div>

      <div
        className="rounded-2xl border-2 border-slate-900 bg-white p-4 space-y-3"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ingestToplu(e.dataTransfer.files);
        }}
      >
        <p className="text-sm font-black uppercase tracking-wide text-slate-900">
          Tutanak burada — fotoğrafı buraya atın, alttaki turuncu tuşa basın
        </p>
        <p className="text-[11px] text-slate-600 leading-snug">
          1) “Dosya seç” ile 160/2 fotoğraflarını işaretleyin (Ctrl ile hepsini). 2) Aşağıda küçük kareler görünmeli
          ({topluFotolar.length} fotoğraf eklendi). 3) Turuncu tuşa basın — tutanak yeni pencerede açılır.
        </p>
        <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-800 cursor-pointer bg-slate-100 border border-slate-300 rounded-xl px-3 py-2">
          <Camera size={14} />
          Dosya seç (birden fazla)
          <input
            type="file"
            accept="image/*"
            multiple
            className="text-[10px]"
            onChange={(e) => {
              ingestToplu(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {topluFotolar.length === 0 ? (
          <p className="text-[11px] font-bold text-rose-700">Henüz fotoğraf yok — kırmızı uyarı bu yüzden çıkıyor.</p>
        ) : (
          <p className="text-[11px] font-black text-emerald-800">{topluFotolar.length} fotoğraf hazır. Turuncu tuşa basın.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {topluFotolar.map((u, i) => (
            <button
              key={`${u.slice(-16)}_${i}`}
              type="button"
              title="Fotoğrafı çıkar"
              onClick={() => setTopluFotolar((prev) => prev.filter((_, j) => j !== i))}
              className="relative cursor-pointer"
            >
              <img src={u} alt="" className="w-16 h-16 object-cover rounded-lg border" />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleParselTopluTutanak('BACA')}
            className="inline-flex items-center gap-1.5 bg-amber-800 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
          >
            <FileSignature size={13} /> {parselKisaAd(parsel)} TÜM BACALAR temizlendi — resmi tutanak
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleParselTopluTutanak('DAIRE')}
            className="inline-flex items-center gap-1.5 bg-teal-800 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
          >
            <FileSignature size={13} /> {parselKisaAd(parsel)} daire/blok işi bitti tutanağı
          </button>
        </div>
      </div>

      {mod === 'daire' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={yeniBlok}
                onChange={(e) => setYeniBlok(e.target.value)}
                placeholder="Yeni blok (ör. J1)"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => void handleBlokAc()}
                className="bg-slate-900 text-white rounded-xl px-3 text-[10px] font-black cursor-pointer"
              >
                Blok kartı aç
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {blokOzetler.map((o) => (
                <div
                  key={o.blok}
                  className={`rounded-xl border px-2 py-1.5 ${
                    aktifBlok === o.blok ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <label className="flex items-center gap-1.5 text-[10px] font-black cursor-pointer">
                    <input
                      type="checkbox"
                      checked={seciliBloklar.includes(o.blok)}
                      onChange={() => toggleBlok(o.blok)}
                    />
                    <button type="button" className="text-left cursor-pointer" onClick={() => setAktifBlok(o.blok)}>
                      {o.blok} · {o.tespitli}/{o.adet} tespit · {o.tamamlanan} temiz
                    </button>
                  </label>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">
              {parselOzet.tespitli}/{parselOzet.adet} daire tespit · {parselOzet.tamamlanan} temizlendi. Kutucuk = tutanağa girecek blok.
            </p>
            {aktifBlok ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] font-black uppercase text-slate-500">Blok {aktifBlok} — daireler</p>
                <div className="flex gap-2">
                  <input
                    value={blokAdDuzenle}
                    onChange={(e) => setBlokAdDuzenle(e.target.value)}
                    placeholder="Blok adı"
                    className="flex-1 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBlokAdGuncelle()}
                    className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-800 rounded-xl px-3 text-[10px] font-black cursor-pointer disabled:opacity-50"
                  >
                    <Pencil size={11} /> Adı güncelle
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={yeniDaireNo}
                    onChange={(e) => setYeniDaireNo(e.target.value)}
                    placeholder="Daire no"
                    className="flex-1 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => void handleDaireAc()}
                    className="bg-teal-700 text-white rounded-xl px-3 text-[10px] font-black cursor-pointer"
                  >
                    <Plus size={12} className="inline" /> Aç
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {blokDaireler.map((d) => {
                    const durum = daireDurum(d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setAktifDaireId(d.id);
                          const t = latestByDate<TemizlikTespit>(tespitler.filter((x) => x.daireId === d.id));
                          setFotolar(t?.fotoUrls || []);
                          setYorum(t?.genelYorum || '');
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          aktifDaireId === d.id ? 'border-teal-600 bg-teal-50' : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        Daire {d.daireNo}{' '}
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${durumClass(durum)}`}>
                          {TEMIZLIK_KART_DURUM_LABEL[durum]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Bloğa tıklayarak daire fotoğrafı ve tespit girin.</p>
            )}
            <div className="rounded-2xl border-2 border-teal-700 bg-teal-50 p-3 space-y-2">
              <p className="text-[10px] font-black uppercase text-teal-900">Rapor / tutanak burada üretilir</p>
              <p className="text-[10px] text-teal-800 leading-snug">
                Fotoğraflar daire kartına kaydedilir. Antetli tutanak bu iki tuşla açılır — ayrı bir rapor ekranı yoktur.
              </p>
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDaireTutanak(false)}
                className="inline-flex items-center gap-1.5 bg-teal-800 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <Printer size={13} /> Seçili blok tutanağı
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDaireTutanak(true)}
                className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <FileSignature size={13} /> Tespitli tüm bloklar (hakediş)
              </button>
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            {aktifDaire ? (
              <>
                <p className="text-sm font-black">
                  {aktifDaire.blok} Daire {aktifDaire.daireNo}
                </p>
                <div className="flex gap-2">
                  <input
                    value={daireNoDuzenle}
                    onChange={(e) => setDaireNoDuzenle(e.target.value)}
                    placeholder="Daire no"
                    className="flex-1 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDaireNoGuncelle()}
                    className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-3 text-[10px] font-black cursor-pointer disabled:opacity-50"
                  >
                    <Pencil size={11} /> No güncelle
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                  <Camera size={14} />
                  Fotoğraf
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="text-[10px]"
                    onChange={(e) => {
                      void readFileList(e.target.files, 8, fotolar).then(setFotolar);
                      e.target.value = '';
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {fotolar.map((u, i) => (
                    <button
                      key={`${u.slice(-12)}_${i}`}
                      type="button"
                      title="Fotoğrafı çıkar"
                      onClick={() => setFotolar((prev) => prev.filter((_, j) => j !== i))}
                      className="relative cursor-pointer"
                    >
                      <img src={u} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                    </button>
                  ))}
                </div>
                <textarea
                  value={yorum}
                  onChange={(e) => setYorum(e.target.value)}
                  rows={3}
                  placeholder="Tespit / temizlik açıklaması"
                  className="w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDaireTespitKaydet(false)}
                    className="flex-1 min-w-[120px] bg-slate-800 text-white rounded-xl py-2 text-[10px] font-black cursor-pointer disabled:opacity-50"
                  >
                    {latestByDate<TemizlikTespit>(tespitler.filter((x) => x.daireId === aktifDaire.id))
                      ? 'Tespiti güncelle'
                      : 'Tespiti kaydet'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDaireTespitKaydet(true)}
                    className="flex-1 min-w-[110px] bg-emerald-700 text-white rounded-xl py-2 text-[10px] font-black cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={12} className="inline mr-1" />
                    Temizlendi
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDaireTespitSil()}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black text-rose-700 border border-rose-200 bg-rose-50 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Tespiti sil
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDaireKartSil()}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black text-rose-800 border border-rose-300 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Daire kartını sil
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-slate-400 italic py-8 text-center">Soldan daire seçin — fotoğraf ve tutanak kartı burada.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-slate-500">
              {bacaOzet.tespitli}/{bacaOzet.adet} baca tespit · {bacaOzet.tamamlanan} temiz — kutucuk tutanağa girer
            </p>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {parselBacalar.map((b) => {
                const durum = bacaDurum(b);
                return (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
                      aktifBacaId === b.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <input type="checkbox" checked={seciliBacaIds.includes(b.id)} onChange={() => toggleBaca(b.id)} />
                    <button
                      type="button"
                      className="flex-1 text-left text-[11px] font-bold cursor-pointer"
                      onClick={() => {
                        setAktifBacaId(b.id);
                        const t = latestByDate<TemizlikBacaTespit>(bacaTespitler.filter((x) => x.bacaId === b.id));
                        setFotolar(t?.fotoUrls || []);
                        setYorum(t?.iscilikYorumu || '');
                      }}
                    >
                      {b.etiket}{' '}
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${durumClass(durum)}`}>
                        {TEMIZLIK_KART_DURUM_LABEL[durum]}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            {parselBacalar.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">
                Bu parselde henüz baca kartı yok. Baca yuvalarını Temizlik / Kırım → Baca çukur sekmesinden açın.
              </p>
            ) : null}
            <div className="rounded-2xl border-2 border-amber-700 bg-amber-50 p-3 space-y-2">
              <p className="text-[10px] font-black uppercase text-amber-900">Rapor / tutanak burada üretilir</p>
              <p className="text-[10px] text-amber-900 leading-snug">
                Baca fotoğrafları kaydedilir. Antetli tutanak bu tuşlarla açılır — ayrı bir rapor ekranı yoktur.
              </p>
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleBacaTutanak(false)}
                className="inline-flex items-center gap-1.5 bg-amber-800 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <Printer size={13} /> Seçili baca tutanağı
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleBacaTutanak(true)}
                className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-[10px] font-black px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <FileSignature size={13} /> Tespitli tüm bacalar
              </button>
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            {aktifBaca ? (
              <>
                <p className="text-sm font-black">{aktifBaca.etiket}</p>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                  <Camera size={14} />
                  Fotoğraf
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="text-[10px]"
                    onChange={(e) => {
                      void readFileList(e.target.files, 8, fotolar).then(setFotolar);
                      e.target.value = '';
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {fotolar.map((u, i) => (
                    <button
                      key={`${u.slice(-12)}_${i}`}
                      type="button"
                      title="Fotoğrafı çıkar"
                      onClick={() => setFotolar((prev) => prev.filter((_, j) => j !== i))}
                      className="relative cursor-pointer"
                    >
                      <img src={u} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                    </button>
                  ))}
                </div>
                <textarea
                  value={yorum}
                  onChange={(e) => setYorum(e.target.value)}
                  rows={3}
                  placeholder="Baca kirlilik / temizlik notu"
                  className="w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBacaTespitKaydet(false)}
                    className="flex-1 min-w-[120px] bg-slate-800 text-white rounded-xl py-2 text-[10px] font-black cursor-pointer disabled:opacity-50"
                  >
                    {latestByDate<TemizlikBacaTespit>(bacaTespitler.filter((x) => x.bacaId === aktifBaca.id))
                      ? 'Tespiti güncelle'
                      : 'Tespiti kaydet'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBacaTespitKaydet(true)}
                    className="flex-1 min-w-[110px] bg-emerald-700 text-white rounded-xl py-2 text-[10px] font-black cursor-pointer disabled:opacity-50"
                  >
                    Temizlendi
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBacaTespitSil()}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black text-rose-700 border border-rose-200 bg-rose-50 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Tespiti sil
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-slate-400 italic py-8 text-center">Soldan baca seçin.</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <p className="text-[10px] font-black uppercase text-slate-500 mb-2 flex items-center gap-1">
          <Layers size={12} /> Bu parsel tutanak arşivi
        </p>
        {arsiv.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">Henüz tutanak basılmadı.</p>
        ) : (
          <ul className="space-y-1">
            {arsiv.map((t) => (
              <li key={t.id} className="text-[11px] font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
                <ClipboardCheck size={12} className="text-teal-700" />
                {t.tarih} ·{' '}
                {t.tip === 'PARSEL_BACA_TOPLU'
                  ? 'Parsel geneli baca'
                  : t.tip === 'PARSEL_DAIRE_TOPLU'
                    ? 'Parsel geneli daire'
                    : t.tip === 'DAIRE_BLOK'
                      ? 'Daire/blok'
                      : 'Baca'}{' '}
                · {t.ozetSatir}
                <span className="text-[9px] uppercase text-amber-800">{t.durum === 'IMZA_BEKLIYOR' ? 'İmza bekliyor' : t.durum}</span>
                <button
                  type="button"
                  onClick={() => void handleTutanakSil(t)}
                  className="ml-auto text-[9px] font-black text-rose-700 cursor-pointer"
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ParselTemizlikTespitScreen;
