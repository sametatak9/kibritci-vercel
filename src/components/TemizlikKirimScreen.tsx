import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Droplets, MapPin, Plus, Printer, Trash2, X, Layers, CheckCircle2, ImagePlus, Pencil,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  TemizlikBaca,
  TemizlikBacaTespit,
  TemizlikBacaUygulama,
  TemizlikBlokKart,
  TemizlikDaire,
  TemizlikIsTipi,
  TemizlikKoridorKart,
  TemizlikOdaDurum,
  TemizlikOdaTespit,
  TemizlikTespit,
  TemizlikUygulama,
  TemizlikUygulamaDurum,
  TemizlikBacaKirlilik,
  TemizlikBacaKonumTipi,
  TemizlikBacaKoridor,
} from '../types/erp';
import { db, cleanUndefined, removeDocument, saveDocument } from '../lib/firebase';
import { assertErpWriteAuth, formatFirestoreWriteError } from '../lib/authWriteGuard';
import { todayDateKey } from '../lib/dateKeyUtils';
import { PARSEL_LIST } from '../data/parselBlokMap';
import { uploadTemizlikKirimFoto } from '../lib/temizlikKirimFotoStorage';
import {
  TEMIZLIK_DEFAULT_PARSEL,
  TEMIZLIK_KART_DURUM_LABEL,
  TEMIZLIK_ODA_CHIPS,
  BACA_KONUM_SECENEK,
  bacaYerSatiri,
  buildBacaKod,
  buildBacaYerOzeti,
  deriveKartDurum,
  latestByDate,
  newTemizlikId,
  nextBacaSiraNo,
  ozetBacaKoridor,
  ozetBacaParsel,
  ozetDaireBlok,
  ozetDaireParsel,
  parselKisaAd,
  konumTipiLabel,
  sortBacalar,
  sumYevmiye,
} from '../lib/temizlikKirimUtils';
import {
  blokKartId,
  koridorKartId,
  nextKoridorKod,
  resolveBlokAdlari,
  resolveKoridorlar,
  seedBlokKartlari,
  seedKoridorKartlari,
} from '../lib/temizlikLayoutCards';
import { BacaKusBakisiPlan } from './BacaKusBakisiPlan';
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
): Promise<{ urls: string[]; atlanan: number }> {
  const out: string[] = [];
  let atlanan = 0;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (!u) continue;
    if (/^https?:\/\//i.test(u)) {
      out.push(u);
      continue;
    }
    const uploaded = await uploadTemizlikKirimFoto(kind, entityId, `${asama}_${i}`, u);
    if (/^https?:\/\//i.test(uploaded)) out.push(uploaded);
    else atlanan += 1;
  }
  return { urls: out, atlanan };
}

function fotoKayitNotu(kayitOk: string, atlanan: number): string {
  if (atlanan <= 0) return kayitOk;
  return `${kayitOk} ${atlanan} foto yüklenemedi (zayıf internet / Storage). Kart duruyor — fotoğrafları sonra ekleyin.`;
}

function durumBadgeClass(durum: string): string {
  if (durum === 'TAMAMLANDI') return 'bg-emerald-100 text-emerald-800';
  if (durum === 'UYGULAMA_DEVAM') return 'bg-sky-100 text-sky-800';
  if (durum === 'PLANLANDI') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-600';
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
}> = ({ urls, onChange, max = 6 }) => {
  const [lightbox, setLightbox] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <div key={`${u.slice(0, 24)}_${i}`} className="relative w-24 h-20 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <button type="button" className="w-full h-full cursor-pointer" onClick={() => setLightbox(u)}>
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => onChange(urls.filter((_, j) => j !== i))}
              className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full w-5 h-5 text-[10px] font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
        {urls.length < max && (
          <>
            <label className="w-24 h-20 rounded-xl border-2 border-dashed border-teal-400 bg-teal-50 flex flex-col items-center justify-center text-teal-700 cursor-pointer hover:bg-teal-100">
              <Camera size={18} />
              <span className="text-[8px] font-black mt-0.5">Kamera</span>
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
            <label className="w-24 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:border-teal-400 hover:text-teal-700">
              <ImagePlus size={18} />
              <span className="text-[8px] font-black mt-0.5">Galeriden</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void readFilesAsDataUrls(e.target.files, max, urls).then(onChange);
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
      </div>
      <p className="text-[9px] text-slate-500 font-semibold">
        Fotoğraf ekleyin — kartta küçük görünür, tıklayınca büyür. Storage’a gider; zayıf net’te foto atlanır, yazı kaydı durur.
      </p>
      {lightbox ? (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[94vw] rounded-xl object-contain" />
        </div>
      ) : null}
    </div>
  );
};

function fmtYev(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

const IsYukuTablo: React.FC<{
  title: string;
  adetBaslik: string;
  rows: {
    key: string;
    title: string;
    adet: number;
    tespitli: number;
    planYevmiye: number;
    kalanYevmiye: number;
  }[];
  activeKey?: string;
  onSelect?: (key: string) => void;
}> = ({ title, adetBaslik, rows, activeKey, onSelect }) => (
  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <div className="px-3 py-2 border-b border-slate-100">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{title}</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[8px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
            <th className="px-3 py-2 font-black">Yer</th>
            <th className="px-2 py-2 font-black text-right">{adetBaslik}</th>
            <th className="px-2 py-2 font-black text-right">Tespit</th>
            <th className="px-2 py-2 font-black text-right">İş (yevmiye)</th>
            <th className="px-3 py-2 font-black text-right">Kalan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = r.key === activeKey;
            return (
              <tr
                key={r.key}
                onClick={() => onSelect?.(r.key)}
                className={`${onSelect ? 'cursor-pointer' : ''} ${
                  active ? 'bg-teal-50' : 'hover:bg-slate-50'
                }`}
              >
                <td className="px-3 py-2 text-xs font-black text-slate-800">{r.title}</td>
                <td className="px-2 py-2 text-xs font-black text-right">{r.adet}</td>
                <td className="px-2 py-2 text-[11px] font-bold text-right text-slate-500">
                  {r.tespitli}/{r.adet}
                </td>
                <td className="px-2 py-2 text-xs font-black text-right">{fmtYev(r.planYevmiye)}</td>
                <td className="px-3 py-2 text-xs font-black text-right text-amber-800">
                  {fmtYev(r.kalanYevmiye)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  const [busyLabel, setBusyLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<'ok' | 'err' | 'warn'>('ok');

  const [daireler, setDaireler] = useState<TemizlikDaire[]>([]);
  const [tespitler, setTespitler] = useState<TemizlikTespit[]>([]);
  const [uygulamalar, setUygulamalar] = useState<TemizlikUygulama[]>([]);
  const [bacalar, setBacalar] = useState<TemizlikBaca[]>([]);
  const [bacaTespitler, setBacaTespitler] = useState<TemizlikBacaTespit[]>([]);
  const [bacaUygulamalar, setBacaUygulamalar] = useState<TemizlikBacaUygulama[]>([]);
  const [koridorKartlar, setKoridorKartlar] = useState<TemizlikKoridorKart[]>([]);
  const [blokKartlar, setBlokKartlar] = useState<TemizlikBlokKart[]>([]);
  const [yeniBlokAd, setYeniBlokAd] = useState('');
  const [yeniKoridorBaslik, setYeniKoridorBaslik] = useState('');
  const [editingKoridorKod, setEditingKoridorKod] = useState<string | null>(null);
  const [editKoridorBaslik, setEditKoridorBaslik] = useState('');
  const [daireGenelFotolar, setDaireGenelFotolar] = useState<string[]>([]);
  const [layoutSnapReady, setLayoutSnapReady] = useState(false);
  const layoutSeedRef = useRef(new Set<string>());

  const [yeniDaireNo, setYeniDaireNo] = useState('');
  const [yeniKat, setYeniKat] = useState('');
  const [yeniBacaYer, setYeniBacaYer] = useState('');
  const [yeniBacaBlok, setYeniBacaBlok] = useState('');
  const [yeniBacaBlok2, setYeniBacaBlok2] = useState('');
  const [yeniBacaKoridor, setYeniBacaKoridor] = useState<TemizlikBacaKoridor>('K1');
  const [yeniBacaKonum, setYeniBacaKonum] = useState<TemizlikBacaKonumTipi>('BLOK_ARKASI');
  const [bacaKoridorFiltre, setBacaKoridorFiltre] = useState<'ALL' | TemizlikBacaKoridor>('ALL');

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
    const onErr = (err: unknown) => {
      console.warn('Temizlik listesi dinlenemedi', err);
      setMsgKind('err');
      setMsg(formatFirestoreWriteError(err, 'Liste alınamadı. Ağı kontrol edip sekmeyi yenileyin.'));
    };
    const u1 = onSnapshot(
      collection(db, 'temizlikDaireleri'),
      (s) => setDaireler(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      onErr
    );
    const u2 = onSnapshot(
      collection(db, 'temizlikTespitleri'),
      (s) => setTespitler(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      onErr
    );
    const u3 = onSnapshot(
      collection(db, 'temizlikUygulamalari'),
      (s) => setUygulamalar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      onErr
    );
    const u4 = onSnapshot(
      collection(db, 'temizlikBacalar'),
      (s) => setBacalar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      onErr
    );
    const u5 = onSnapshot(
      collection(db, 'temizlikBacaTespitleri'),
      (s) => setBacaTespitler(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      onErr
    );
    const u6 = onSnapshot(
      collection(db, 'temizlikBacaUygulamalari'),
      (s) => setBacaUygulamalar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      onErr
    );
    const u7 = onSnapshot(
      collection(db, 'temizlikKoridorKartlari'),
      (s) => {
        setKoridorKartlar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLayoutSnapReady(true);
      },
      onErr
    );
    const u8 = onSnapshot(
      collection(db, 'temizlikBlokKartlari'),
      (s) => {
        setBlokKartlar(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLayoutSnapReady(true);
      },
      onErr
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
    };
  }, []);

  const bloklar = useMemo(() => {
    const extra = daireler.filter((d) => d.parsel === parsel).map((d) => d.blok);
    return resolveBlokAdlari(parsel, blokKartlar, extra);
  }, [parsel, blokKartlar, daireler]);
  useEffect(() => {
    if (!bloklar.includes(selectedBlok)) setSelectedBlok(bloklar[0] || 'A1');
  }, [parsel, bloklar, selectedBlok]);

  useEffect(() => {
    if (!layoutSnapReady) return;
    const now = new Date().toISOString();
    const korKey = `kor:${parsel}`;
    const blokKey = `blok:${parsel}`;
    if (!layoutSeedRef.current.has(korKey) && !koridorKartlar.some((k) => k.parsel === parsel)) {
      layoutSeedRef.current.add(korKey);
      void (async () => {
        for (const row of seedKoridorKartlari(parsel, now)) {
          try {
            await saveDocument('temizlikKoridorKartlari', cleanUndefined(row));
          } catch (e) {
            console.warn('Koridor seed atlandı', row.id, e);
          }
        }
      })();
    }
    if (!layoutSeedRef.current.has(blokKey) && !blokKartlar.some((k) => k.parsel === parsel)) {
      layoutSeedRef.current.add(blokKey);
      void (async () => {
        for (const row of seedBlokKartlari(parsel, now)) {
          try {
            await saveDocument('temizlikBlokKartlari', cleanUndefined(row));
          } catch (e) {
            console.warn('Blok seed atlandı', row.id, e);
          }
        }
      })();
    }
  }, [parsel, layoutSnapReady, koridorKartlar, blokKartlar]);

  const koridorlar = useMemo(() => resolveKoridorlar(parsel, koridorKartlar), [parsel, koridorKartlar]);

  useEffect(() => {
    setYeniBacaKoridor('K1');
    setBacaKoridorFiltre('ALL');
    setYeniBacaBlok2('');
  }, [parsel]);

  useEffect(() => {
    const suggested = koridorlar.find((k) => k.id === yeniBacaKoridor)?.bloklar || [];
    setYeniBacaBlok((prev) => {
      if (prev && suggested.includes(prev)) return prev;
      return suggested[0] || '';
    });
    setYeniBacaBlok2('');
    if (parsel === 'Parsel Bölge 157/46' && yeniBacaKoridor === 'K2') setYeniBacaKonum('AVLU');
    else if (parsel === 'Parsel Bölge 157/46' && yeniBacaKoridor === 'K3') setYeniBacaKonum('BLOK_ARASI');
    else setYeniBacaKonum('BLOK_ARKASI');
  }, [parsel, yeniBacaKoridor, koridorlar]);

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
    () => sortBacalar(bacalar.filter((b) => b.parsel === parsel)),
    [bacalar, parsel]
  );
  const gorunenBacalar = useMemo(
    () =>
      bacaKoridorFiltre === 'ALL'
        ? parselBacalar
        : parselBacalar.filter((b) => b.koridor === bacaKoridorFiltre),
    [parselBacalar, bacaKoridorFiltre]
  );
  const koridorOzetler = useMemo(
    () => koridorlar.map((k) => ozetBacaKoridor(parsel, k.id, bacalar, bacaTespitler, bacaUygulamalar)),
    [koridorlar, parsel, bacalar, bacaTespitler, bacaUygulamalar]
  );
  const onizlemeSira = nextBacaSiraNo(parsel, yeniBacaKoridor, bacalar);
  const onizlemeKod = buildBacaKod(parsel, yeniBacaKoridor, onizlemeSira);
  const onizlemeYer = buildBacaYerOzeti({
    konumTipi: yeniBacaKonum,
    blok: yeniBacaBlok,
    blok2: yeniBacaBlok2,
    ekstra: yeniBacaYer,
  });
  const koridorBloklar =
    koridorlar.find((k) => k.id === yeniBacaKoridor)?.bloklar.filter(Boolean) || bloklar;
  const blokOzetler = useMemo(
    () => bloklar.map((blok) => ozetDaireBlok(parsel, blok, daireler, tespitler, uygulamalar)),
    [bloklar, parsel, daireler, tespitler, uygulamalar]
  );
  const parselDaireOzetler = useMemo(
    () => PARSEL_SECENEK.map((p) => ozetDaireParsel(p, daireler, tespitler, uygulamalar)),
    [daireler, tespitler, uygulamalar]
  );
  const parselBacaOzetler = useMemo(
    () => PARSEL_SECENEK.map((p) => ozetBacaParsel(p, bacalar, bacaTespitler, bacaUygulamalar)),
    [bacalar, bacaTespitler, bacaUygulamalar]
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
    setDaireGenelFotolar(t?.fotoUrls || []);
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

  const showMsg = (text: string, kind: 'ok' | 'err' | 'warn' = 'ok') => {
    setMsgKind(kind);
    setMsg(text);
    window.setTimeout(() => setMsg(null), kind === 'ok' ? 4000 : 9000);
  };

  const guardWrite = async (): Promise<boolean> => {
    const block = await assertErpWriteAuth();
    if (block) {
      showMsg(block, 'err');
      return false;
    }
    return true;
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
      showMsg('Daire numarası yazın.', 'err');
      return;
    }
    if (blokDaireler.some((d) => d.daireNo.toLocaleLowerCase('tr-TR') === no.toLocaleLowerCase('tr-TR'))) {
      showMsg('Bu blokta bu daire zaten açık.', 'err');
      return;
    }
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Daire kartı kaydediliyor…');
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
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Daire açılamadı.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleBacaAc = async () => {
    if (yeniBacaKonum === 'BLOK_ARASI') {
      if (!yeniBacaBlok.trim() || !yeniBacaBlok2.trim()) {
        showMsg('Blok arası için iki blok seçin (ör. C3 ve C4).', 'err');
        return;
      }
    } else if (yeniBacaKonum !== 'AVLU' && !yeniBacaBlok.trim()) {
      showMsg('Hangi bloğun önü / arkası / merdiven dibi olduğunu seçin.', 'err');
      return;
    }
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Baca kartı kaydediliyor…');
    try {
      const siraNo = nextBacaSiraNo(parsel, yeniBacaKoridor, bacalar);
      const etiket = buildBacaKod(parsel, yeniBacaKoridor, siraNo);
      const yerOzeti = buildBacaYerOzeti({
        konumTipi: yeniBacaKonum,
        blok: yeniBacaBlok,
        blok2: yeniBacaBlok2,
        ekstra: yeniBacaYer,
      });
      const row: TemizlikBaca = {
        id: newTemizlikId('tb'),
        parsel,
        blok: yeniBacaBlok.trim() || undefined,
        blok2: yeniBacaKonum === 'BLOK_ARASI' ? (yeniBacaBlok2.trim() || undefined) : undefined,
        koridor: yeniBacaKoridor,
        konumTipi: yeniBacaKonum,
        siraNo,
        etiket,
        yerTarifi: yeniBacaYer.trim(),
        ozetDurum: 'TESPIT_BEKLIYOR',
        kayitTarihi: new Date().toISOString(),
        kaydeden,
      };
      await saveDocument('temizlikBacalar', cleanUndefined(row));
      setYeniBacaYer('');
      setSelectedBacaId(row.id);
      setKartTab('tespit');
      showMsg(`${etiket} açıldı — ${yerOzeti || konumTipiLabel(yeniBacaKonum)}`);
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Baca kartı açılamadı.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleBlokAc = async () => {
    const ad = yeniBlokAd.trim().toLocaleUpperCase('tr-TR');
    if (!ad) {
      showMsg('Blok adı yazın.', 'err');
      return;
    }
    const existing = bloklar.find((b) => b.toLocaleUpperCase('tr-TR') === ad);
    if (existing) {
      setSelectedBlok(existing);
      setYeniBlokAd('');
      showMsg(`${existing} zaten açık — kopya yazılmadı.`);
      return;
    }
    if (!(await guardWrite())) return;
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
      setSelectedBlok(ad);
      setYeniBlokAd('');
      showMsg(`${ad} blok kartı kaydedildi.`);
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Blok açılamadı.'), 'err');
    }
  };

  const handleKoridorEkle = async () => {
    const kod = nextKoridorKod(koridorlar);
    const baslik = yeniKoridorBaslik.trim() || `${kod} · Yeni hat`;
    if (!(await guardWrite())) return;
    try {
      await saveDocument(
        'temizlikKoridorKartlari',
        cleanUndefined({
          id: koridorKartId(parsel, kod),
          parsel,
          kod,
          baslik,
          aciklama: '',
          bloklar: [],
          sira: koridorlar.length + 1,
          kayitTarihi: new Date().toISOString(),
        } satisfies TemizlikKoridorKart)
      );
      setYeniKoridorBaslik('');
      setYeniBacaKoridor(kod);
      showMsg(`${baslik} eklendi.`);
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Koridor eklenemedi.'), 'err');
    }
  };

  const handleKoridorKaydet = async (kod: string) => {
    const found = koridorKartlar.find((k) => k.parsel === parsel && k.kod === kod);
    const fallback = koridorlar.find((k) => k.id === kod);
    if (!(await guardWrite())) return;
    try {
      await saveDocument(
        'temizlikKoridorKartlari',
        cleanUndefined({
          id: found?.id || koridorKartId(parsel, kod),
          parsel,
          kod,
          baslik: editKoridorBaslik.trim() || found?.baslik || fallback?.baslik || kod,
          aciklama: found?.aciklama || fallback?.aciklama || '',
          bloklar: found?.bloklar || fallback?.bloklar || [],
          sira: found?.sira || koridorlar.findIndex((k) => k.id === kod) + 1,
          kayitTarihi: found?.kayitTarihi || new Date().toISOString(),
        } satisfies TemizlikKoridorKart)
      );
      setEditingKoridorKod(null);
      showMsg('Koridor adı kaydedildi.');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Koridor kaydedilemedi.'), 'err');
    }
  };

  const handleKoridorSil = async (kod: string) => {
    const n = bacalar.filter((b) => b.parsel === parsel && b.koridor === kod).length;
    if (n > 0) {
      showMsg(`Bu koridorda ${n} baca kartı var. Önce bacaları silin veya taşıyın.`, 'err');
      return;
    }
    const found = koridorKartlar.find((k) => k.parsel === parsel && k.kod === kod);
    if (!found) {
      showMsg('Silinecek kayıtlı koridor kartı yok.', 'err');
      return;
    }
    if (!window.confirm(`${found.baslik} silinsin mi?`)) return;
    if (!(await guardWrite())) return;
    try {
      await removeDocument('temizlikKoridorKartlari', found.id);
      if (yeniBacaKoridor === kod) setYeniBacaKoridor(koridorlar[0]?.id || 'K1');
      showMsg('Koridor silindi.');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Koridor silinemedi.'), 'err');
    }
  };

  const handleSaveDaireTespit = async () => {
    if (!selectedDaire) return;
    if (odalar.length === 0 && daireGenelFotolar.length === 0 && !genelYorum.trim()) {
      showMsg('Oda, fotoğraf veya açıklama girin.', 'err');
      return;
    }
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Foto yükleniyor, sonra tespit kaydedilecek…');
    try {
      const persistedOdalar: TemizlikOdaTespit[] = [];
      let atlanan = 0;
      const genel = await persistFotoUrls('daire', selectedDaire.id, 'genel', daireGenelFotolar);
      atlanan += genel.atlanan;
      for (const o of odalar) {
        const foto = await persistFotoUrls('daire', selectedDaire.id, `oda_${o.id}`, o.fotoUrls || []);
        atlanan += foto.atlanan;
        persistedOdalar.push({ ...o, fotoUrls: foto.urls });
      }
      setBusyLabel('Tespit kaydı yazılıyor…');
      const t: TemizlikTespit = {
        id: daireTespit?.id || newTemizlikId('tt'),
        daireId: selectedDaire.id,
        parsel: selectedDaire.parsel,
        blok: selectedDaire.blok,
        daireNo: selectedDaire.daireNo,
        isTipi,
        odalar: persistedOdalar,
        fotoUrls: genel.urls,
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
      setOdalar(
        persistedOdalar.map((o, i) => {
          const leftover = (odalar[i]?.fotoUrls || []).filter((u) => String(u).startsWith('data:'));
          return leftover.length ? { ...o, fotoUrls: [...o.fotoUrls, ...leftover] } : o;
        })
      );
      const leftoverGenel = daireGenelFotolar.filter((u) => String(u).startsWith('data:'));
      setDaireGenelFotolar([...genel.urls, ...leftoverGenel].slice(0, 8));
      showMsg(fotoKayitNotu('Tespit kaydedildi.', atlanan), atlanan ? 'warn' : 'ok');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Tespit kaydedilemedi.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleSaveBacaTespit = async () => {
    if (!selectedBaca) return;
    if (bacaFotolar.length === 0 && !bacaYorum.trim()) {
      showMsg('En az bir fotoğraf veya açıklama girin.', 'err');
      return;
    }
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Foto yükleniyor, sonra tespit kaydedilecek…');
    try {
      const foto = await persistFotoUrls('baca', selectedBaca.id, 'tespit', bacaFotolar);
      setBusyLabel('Tespit kaydı yazılıyor…');
      const t: TemizlikBacaTespit = {
        id: bacaTespit?.id || newTemizlikId('btt'),
        bacaId: selectedBaca.id,
        parsel: selectedBaca.parsel,
        blok: selectedBaca.blok,
        etiket: selectedBaca.etiket,
        fotoUrls: foto.urls,
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
      const leftover = bacaFotolar.filter((u) => String(u).startsWith('data:'));
      setBacaFotolar([...foto.urls, ...leftover].slice(0, 6));
      showMsg(fotoKayitNotu('Baca tespiti kaydedildi.', foto.atlanan), foto.atlanan ? 'warn' : 'ok');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Tespit kaydedilemedi.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleSaveDaireUygulama = async () => {
    if (!selectedDaire || !daireTespit) {
      showMsg('Önce tespit kaydedin.', 'err');
      return;
    }
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Foto yükleniyor, sonra uygulama kaydedilecek…');
    try {
      const foto = await persistFotoUrls('daire', selectedDaire.id, 'uyg', uygFotolar);
      setBusyLabel('Uygulama kaydı yazılıyor…');
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
        fotoUrls: foto.urls,
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
      showMsg(fotoKayitNotu('Uygulama kaydedildi — ne yapıldığı karta işlendi.', foto.atlanan), foto.atlanan ? 'warn' : 'ok');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Uygulama kaydedilemedi.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleSaveBacaUygulama = async () => {
    if (!selectedBaca || !bacaTespit) {
      showMsg('Önce baca tespitini kaydedin.', 'err');
      return;
    }
    if (!uygAciklama.trim() && uygFotolar.length === 0) {
      showMsg('Ne yapıldığını yazın veya foto ekleyin.', 'err');
      return;
    }
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Foto yükleniyor, sonra uygulama kaydedilecek…');
    try {
      const foto = await persistFotoUrls('baca', selectedBaca.id, 'uyg', uygFotolar);
      setBusyLabel('Uygulama kaydı yazılıyor…');
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
        fotoUrls: foto.urls,
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
      showMsg(fotoKayitNotu('Baca uygulaması kaydedildi — ne yapıldığı karta işlendi.', foto.atlanan), foto.atlanan ? 'warn' : 'ok');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Uygulama kaydedilemedi.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleDeleteDaire = async (d: TemizlikDaire) => {
    if (!window.confirm(`Daire ${d.daireNo} silinsin mi? Tespit ve uygulamalar da gider.`)) return;
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Kart siliniyor…');
    try {
      for (const t of tespitler.filter((x) => x.daireId === d.id)) {
        await removeDocument('temizlikTespitleri', t.id);
      }
      for (const u of uygulamalar.filter((x) => x.daireId === d.id)) {
        await removeDocument('temizlikUygulamalari', u.id);
      }
      await removeDocument('temizlikDaireleri', d.id);
      if (selectedDaireId === d.id) setSelectedDaireId(null);
      showMsg('Daire silindi.');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Silinemedi.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleDeleteBaca = async (b: TemizlikBaca) => {
    if (!window.confirm(`${b.etiket} silinsin mi? Tespit ve yapılan işler de gider.`)) return;
    if (!(await guardWrite())) return;
    setBusy(true);
    setBusyLabel('Kart siliniyor…');
    try {
      for (const t of bacaTespitler.filter((x) => x.bacaId === b.id)) {
        await removeDocument('temizlikBacaTespitleri', t.id);
      }
      for (const u of bacaUygulamalar.filter((x) => x.bacaId === b.id)) {
        await removeDocument('temizlikBacaUygulamalari', u.id);
      }
      await removeDocument('temizlikBacalar', b.id);
      if (selectedBacaId === b.id) setSelectedBacaId(null);
      showMsg('Baca kartı silindi.');
    } catch (e: unknown) {
      showMsg(formatFirestoreWriteError(e, 'Silinemedi.'), 'err');
    } finally {
      setBusy(false);
      setBusyLabel('');
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
            <p className="text-[10px] text-slate-500">
              Her daire ve her baca bir karttır: önce tespit (foto + açıklama), sonra ne yapıldığı.
            </p>
          </div>
        </div>
      </div>

      {busy && busyLabel ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold px-3 py-2 rounded-xl">
          {busyLabel} Zayıf internette 30 sn’ye kadar 3 deneme yapılır. İkinci kez basmayın.
        </div>
      ) : null}
      {msg && (
        <div
          className={`text-xs font-bold px-3 py-2 rounded-xl border ${
            msgKind === 'err'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : msgKind === 'warn'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-teal-50 border-teal-200 text-teal-800'
          }`}
        >
          {msg}
        </div>
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
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {ozetKart('Açık daire', o.adet, `${parselKisaAd(parsel)} toplam`)}
              {ozetKart('Tespit', o.tespitli, 'İş planı yazılan')}
              {ozetKart('Tamamlanan', o.tamamlanan)}
              {ozetKart('Temizlik işi', fmtYev(o.planYevmiye), 'Plan yevmiye')}
              {ozetKart('Harcanan', fmtYev(o.harcananYevmiye))}
              {ozetKart('Kalan iş', fmtYev(o.kalanYevmiye))}
            </div>
            <IsYukuTablo
              title="Üç parsel — daire ve temizlik işi"
              adetBaslik="Daire"
              activeKey={parsel}
              onSelect={(p) => {
                setParsel(p);
                setSelectedDaireId(null);
                setSelectedBacaId(null);
              }}
              rows={parselDaireOzetler.map((x) => ({
                key: x.parsel,
                title: parselKisaAd(x.parsel),
                adet: x.adet,
                tespitli: x.tespitli,
                planYevmiye: x.planYevmiye,
                kalanYevmiye: x.kalanYevmiye,
              }))}
            />
            <IsYukuTablo
              title={`${parselKisaAd(parsel)} blokları — kaç daire, ne kadar temizlik`}
              adetBaslik="Daire"
              activeKey={selectedBlok}
              onSelect={(b) => {
                setSelectedBlok(b);
                setSelectedDaireId(null);
              }}
              rows={blokOzetler.map((x) => ({
                key: x.blok,
                title: x.blok,
                adet: x.adet,
                tespitli: x.tespitli,
                planYevmiye: x.planYevmiye,
                kalanYevmiye: x.kalanYevmiye,
              }))}
            />
          </div>
        );
      })()}
      {mainTab === 'baca' && (() => {
        const o = ozetBacaParsel(parsel, bacalar, bacaTespitler, bacaUygulamalar);
        return (
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Bağırarak adres</p>
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                Baca blokların arasında durur. Önce koridor (K1 / K2 / K3), sonra konum
                (blok arkası, önü, arası, avlu, merdiven dibi). Kod batıdan doğuya artar:
                <span className="font-black text-slate-800"> {onizlemeKod}</span> gibi. Eski numaralar değişmez.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ozetKart('Baca', o.adet, `${parselKisaAd(parsel)} çukur`)}
              {ozetKart('Tespit', o.tespitli)}
              {ozetKart('Tamamlanan', o.tamamlanan)}
              {ozetKart('Baca işi', fmtYev(o.planYevmiye), 'Plan yevmiye')}
              {ozetKart('Harcanan', fmtYev(o.harcananYevmiye))}
              {ozetKart('Kalan iş', fmtYev(o.kalanYevmiye))}
            </div>
            <IsYukuTablo
              title="Üç parsel — kaç baca, ne kadar iş"
              adetBaslik="Baca"
              activeKey={parsel}
              onSelect={(p) => {
                setParsel(p);
                setSelectedBacaId(null);
                setSelectedDaireId(null);
              }}
              rows={parselBacaOzetler.map((x) => ({
                key: x.parsel,
                title: parselKisaAd(x.parsel),
                adet: x.adet,
                tespitli: x.tespitli,
                planYevmiye: x.planYevmiye,
                kalanYevmiye: x.kalanYevmiye,
              }))}
            />
            <IsYukuTablo
              title={`${parselKisaAd(parsel)} koridorları`}
              adetBaslik="Baca"
              activeKey={bacaKoridorFiltre === 'ALL' ? '' : bacaKoridorFiltre}
              onSelect={(k) => {
                setBacaKoridorFiltre(k as TemizlikBacaKoridor);
                setYeniBacaKoridor(k as TemizlikBacaKoridor);
                setSelectedBacaId(null);
              }}
              rows={koridorlar.map((k, i) => ({
                key: k.id,
                title: k.baslik,
                adet: koridorOzetler[i]?.adet || 0,
                tespitli: koridorOzetler[i]?.tespitli || 0,
                planYevmiye: koridorOzetler[i]?.planYevmiye || 0,
                kalanYevmiye: koridorOzetler[i]?.kalanYevmiye || 0,
              }))}
            />
            <BacaKusBakisiPlan
              parsel={parsel}
              koridorlar={koridorlar}
              bacalar={parselBacalar}
              tespitler={bacaTespitler}
              uygulamalar={bacaUygulamalar}
              selectedId={selectedBacaId}
              onSelect={(id) => {
                setSelectedBacaId(id);
                setKartTab('tespit');
              }}
            />
          </div>
        );
      })()}

      {mainTab === 'daire' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {blokOzetler.map((o) => {
                const pct = o.adet ? Math.round((o.tamamlanan / o.adet) * 100) : 0;
                return (
                  <button
                    key={o.blok}
                    type="button"
                    onClick={() => {
                      setSelectedBlok(o.blok);
                      setSelectedDaireId(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black border cursor-pointer min-w-[88px] ${
                      selectedBlok === o.blok
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    <span className="block">
                      {o.blok} <span className="opacity-70">{o.adet} daire</span>
                    </span>
                    <span className="block text-[8px] font-bold opacity-80 mt-0.5">
                      {fmtYev(o.planYevmiye)} yevmiye · kalan {fmtYev(o.kalanYevmiye)}
                    </span>
                    <span
                      className={`mt-1 block h-1 rounded-full overflow-hidden ${
                        selectedBlok === o.blok ? 'bg-white/25' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`block h-full ${selectedBlok === o.blok ? 'bg-white' : 'bg-teal-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={yeniBlokAd}
                onChange={(e) => setYeniBlokAd(e.target.value)}
                placeholder="Yeni blok adı (ör. J1)"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleBlokAc()}
                className="bg-slate-900 text-white rounded-xl px-3 text-[10px] font-black cursor-pointer disabled:opacity-50"
              >
                Blok kartı aç
              </button>
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
            <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[8px] font-black uppercase text-teal-700">
                    {selectedDaire.parsel.replace('Parsel Bölge ', '')} · {selectedDaire.blok}
                  </p>
                  <p className="font-black text-lg leading-tight">Daire {selectedDaire.daireNo}</p>
                  <span className={`inline-block mt-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${durumBadgeClass(daireDurumOf(selectedDaire))}`}>
                    {TEMIZLIK_KART_DURUM_LABEL[daireDurumOf(selectedDaire)]}
                  </span>
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
                  1. Tespit
                </button>
                <button
                  type="button"
                  onClick={() => setKartTab('uygulama')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    kartTab === 'uygulama' ? 'bg-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  2. Ne yapıldı
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {kartTab === 'tespit'
                  ? 'Odaları, fotoğrafları ve plan yevmiyeyi bu karta yazın. Aynı kart sonra sahada doldurulur.'
                  : 'Bu dairede bugün / o gün ne yapıldığını foto ve açıklama ile işleyin.'}
              </p>

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
                  <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-2.5 space-y-1.5">
                    <p className="text-[9px] font-black uppercase text-teal-800">Daire fotoğrafları</p>
                    <FotoAlani urls={daireGenelFotolar} onChange={setDaireGenelFotolar} max={8} />
                  </div>
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
                    placeholder="Ne yapıldı? (ör. salon kırım bitti, mutfak yarım)"
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
                    {busy ? 'Kaydediliyor…' : 'Yapılan işi karta işle'}
                  </button>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {daireUyg.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">Henüz uygulama yok.</p>
                    ) : (
                      [...daireUyg]
                        .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)))
                        .map((u) => (
                          <div key={u.id} className="text-[10px] border border-slate-100 rounded-xl p-2.5 bg-slate-50 space-y-1.5">
                            <div className="flex justify-between gap-2">
                              <span className="font-black text-slate-800">{u.tarih}</span>
                              <span className="font-bold text-slate-500">
                                {u.harcananYevmiye} yevmiye · {u.durum}
                              </span>
                            </div>
                            {u.aciklama ? <p className="text-slate-700">{u.aciklama}</p> : null}
                            {(u.fotoUrls || []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.fotoUrls.map((src) => (
                                  <img key={src} src={src} alt="" className="w-14 h-12 object-cover rounded-lg border border-slate-200" />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mainTab === 'baca' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                <Layers size={12} /> Koridor — {parselKisaAd(parsel)}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {koridorlar.map((k) => {
                  const active = yeniBacaKoridor === k.id;
                  const editing = editingKoridorKod === k.id;
                  return (
                    <div
                      key={k.id}
                      className={`rounded-2xl border p-2.5 ${
                        active ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50/80'
                      }`}
                    >
                      {editing ? (
                        <div className="space-y-1.5">
                          <input
                            value={editKoridorBaslik}
                            onChange={(e) => setEditKoridorBaslik(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => void handleKoridorKaydet(k.id)}
                              className="flex-1 bg-amber-700 text-white text-[9px] font-black py-1 rounded-lg cursor-pointer"
                            >
                              Kaydet
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingKoridorKod(null)}
                              className="px-2 text-[9px] font-black text-slate-500 cursor-pointer"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setYeniBacaKoridor(k.id);
                              setBacaKoridorFiltre(k.id);
                            }}
                            className="w-full text-left cursor-pointer"
                          >
                            <span className="block text-xs font-black text-slate-900">{k.baslik}</span>
                            <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">{k.aciklama}</span>
                          </button>
                          <div className="flex gap-1 mt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingKoridorKod(k.id);
                                setEditKoridorBaslik(k.baslik);
                              }}
                              className="inline-flex items-center gap-0.5 text-[9px] font-black text-slate-500 cursor-pointer"
                            >
                              <Pencil size={10} /> Ad
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleKoridorSil(k.id)}
                              className="text-[9px] font-black text-rose-600 cursor-pointer"
                            >
                              Sil
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  value={yeniKoridorBaslik}
                  onChange={(e) => setYeniKoridorBaslik(e.target.value)}
                  placeholder="Yeni koridor adı (ör. K4 · Batı hat)"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleKoridorEkle()}
                  className="bg-amber-700 text-white rounded-xl px-3 text-[10px] font-black cursor-pointer disabled:opacity-50"
                >
                  Koridor ekle
                </button>
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400">Konum</p>
              <div className="flex flex-wrap gap-1.5">
                {BACA_KONUM_SECENEK.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setYeniBacaKonum(k.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black border cursor-pointer ${
                      yeniBacaKonum === k.id
                        ? 'bg-amber-700 text-white border-amber-700'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                    title={k.hint}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">{BACA_KONUM_SECENEK.find((x) => x.id === yeniBacaKonum)?.hint}</p>
              <div className={`grid gap-2 ${yeniBacaKonum === 'BLOK_ARASI' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <select
                  value={yeniBacaBlok}
                  onChange={(e) => setYeniBacaBlok(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                >
                  <option value="">{yeniBacaKonum === 'AVLU' ? 'Avlu / blok (ops.)' : 'Blok'}</option>
                  {(koridorBloklar.length ? koridorBloklar : bloklar).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  {yeniBacaBlok && !(koridorBloklar.includes(yeniBacaBlok) || bloklar.includes(yeniBacaBlok)) ? (
                    <option value={yeniBacaBlok}>{yeniBacaBlok}</option>
                  ) : null}
                </select>
                {yeniBacaKonum === 'BLOK_ARASI' ? (
                  <select
                    value={yeniBacaBlok2}
                    onChange={(e) => setYeniBacaBlok2(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="">İkinci blok</option>
                    {bloklar
                      .filter((b) => b !== yeniBacaBlok)
                      .map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                  </select>
                ) : null}
              </div>
              <textarea
                value={yeniBacaYer}
                onChange={(e) => setYeniBacaYer(e.target.value)}
                placeholder="Ek tarifi (ops.) — örn. merdiven dibi, 3. çukur"
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
              />
              <div className="rounded-2xl bg-slate-900 text-white p-3">
                <p className="text-[8px] font-black uppercase tracking-wider text-amber-300">Sahaya bağırılacak adres</p>
                <p className="text-lg font-black tracking-tight mt-0.5">{onizlemeKod}</p>
                <p className="text-[11px] text-slate-200 mt-0.5">{onizlemeYer || konumTipiLabel(yeniBacaKonum)}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleBacaAc()}
                className="w-full bg-amber-700 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <span className="inline-flex items-center justify-center gap-1">
                  <Plus size={13} /> Baca kartı aç
                </span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setBacaKoridorFiltre('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border cursor-pointer ${
                    bacaKoridorFiltre === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  Tümü ({parselBacalar.length})
                </button>
                {koridorlar.map((k, i) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setBacaKoridorFiltre(k.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black border cursor-pointer ${
                      bacaKoridorFiltre === k.id ? 'bg-amber-700 text-white border-amber-700' : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {k.id} ({koridorOzetler[i]?.adet || 0})
                  </button>
                ))}
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {gorunenBacalar.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-4 text-center">
                    Bu hatta henüz baca yok. Koridor + konum seçip kart açın.
                  </p>
                ) : (
                  gorunenBacalar.map((b) => {
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
                        <div className="flex justify-between gap-2 items-start">
                          <span className="font-black text-sm text-slate-900 tracking-tight">{b.etiket}</span>
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${durumBadgeClass(durum)}`}>
                            {TEMIZLIK_KART_DURUM_LABEL[durum]}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-0.5 truncate flex items-center gap-1">
                          <MapPin size={10} /> {bacaYerSatiri(b)}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {selectedBaca ? null : (
            <div className="hidden lg:flex flex-col items-center justify-center border-2 border-dashed border-amber-200 rounded-2xl bg-amber-50/40 p-8 text-center min-h-[280px]">
              <MapPin className="text-amber-700 mb-2" size={28} />
              <p className="font-black text-sm text-slate-800">Baca kartı</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                Soldan bir baca seçin veya koridor + konum ile yeni kart açın. Tespit foto/açıklama, sonra bu konuda ne yapıldığı aynı kartta durur.
              </p>
            </div>
          )}
          {selectedBaca && (
            <div className="bg-white border border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[8px] font-black uppercase text-amber-700">
                    {selectedBaca.koridor || 'Koridor yok'} · {parselKisaAd(selectedBaca.parsel)}
                  </p>
                  <p className="font-black text-2xl tracking-tight leading-none mt-0.5">{selectedBaca.etiket}</p>
                  <p className="font-bold text-xs text-slate-700 mt-1">{bacaYerSatiri(selectedBaca)}</p>
                  <span className={`inline-block mt-1.5 text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${durumBadgeClass(bacaDurumOf(selectedBaca))}`}>
                    {TEMIZLIK_KART_DURUM_LABEL[bacaDurumOf(selectedBaca)]}
                  </span>
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
                  1. Tespit
                </button>
                <button
                  type="button"
                  onClick={() => setKartTab('uygulama')}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black cursor-pointer ${
                    kartTab === 'uygulama' ? 'bg-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  2. Ne yapıldı
                </button>
              </div>

              {kartTab === 'tespit' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Foto ve açıklama bu karta yazılır. Zayıf internette foto yüklenemezse tespit yine kaydolur.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {BACA_KIRLILIK.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setBacaKirlilik(x.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black border cursor-pointer ${
                          bacaKirlilik === x.id
                            ? 'bg-amber-700 text-white border-amber-700'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                  <FotoAlani urls={bacaFotolar} onChange={setBacaFotolar} max={6} />
                  <textarea
                    value={bacaYorum}
                    onChange={(e) => setBacaYorum(e.target.value)}
                    placeholder="Tespit açıklaması — kirlilik, çamur, erişim, işçilik notu"
                    rows={3}
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
                    placeholder="Plan: kaç kişi, hangi gün, pompa / el…"
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveBacaTespit()}
                    className="w-full bg-amber-700 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Tespiti karta kaydet'}
                  </button>
                </div>
              )}

              {kartTab === 'uygulama' && (
                <div className="space-y-3">
                  {!bacaTespit ? (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      Önce tespit sekmesinden foto / açıklama kaydedin. Uygulama o kartın üzerine işlenir.
                    </p>
                  ) : null}
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
                    placeholder="Ne yapıldı? (ör. çamur alındı, ızgara takıldı, yarım kaldı)"
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <FotoAlani urls={uygFotolar} onChange={setUygFotolar} />
                  <button
                    type="button"
                    disabled={busy || !bacaTespit}
                    onClick={() => void handleSaveBacaUygulama()}
                    className="w-full bg-slate-900 text-white font-black text-[11px] py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Yapılan işi karta işle'}
                  </button>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {bacaUyg.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">Bu bacada henüz yapılan iş yok.</p>
                    ) : (
                      [...bacaUyg]
                        .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)))
                        .map((u) => (
                          <div key={u.id} className="text-[10px] border border-slate-100 rounded-xl p-2.5 bg-slate-50 space-y-1.5">
                            <div className="flex justify-between gap-2">
                              <span className="font-black text-slate-800 inline-flex items-center gap-1">
                                <CheckCircle2 size={12} className="text-emerald-600" /> {u.tarih}
                              </span>
                              <span className="font-bold text-slate-500">
                                {u.harcananYevmiye} yevmiye · {u.durum}
                              </span>
                            </div>
                            {u.aciklama ? <p className="text-slate-700">{u.aciklama}</p> : null}
                            {(u.fotoUrls || []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.fotoUrls.map((src) => (
                                  <img key={src} src={src} alt="" className="w-14 h-12 object-cover rounded-lg border border-slate-200" />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                    )}
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
